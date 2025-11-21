const mongoose = require('mongoose');
const Order = require('./models/order');

// --- CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;

// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    if (!uri) throw new Error("MONGODB_URI is not set.");
    const db = await mongoose.connect(uri, { bufferCommands: false });
    cachedDb = db;
    return db;
};

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // ElevenLabs sends a POST request with JSON body
    // Payload structure: { "call_id": "...", "caller_id": "+1...", "agent_id": "..." }
    let body = {};
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        console.error("Invalid JSON:", e);
        return { statusCode: 400, body: "Invalid JSON" };
    }

    const callerId = body.caller_id;
    console.log("ElevenLabs Context Request for Caller:", callerId);

    if (!callerId) {
        return { statusCode: 400, body: "Missing caller_id" };
    }

    try {
        await connectToDatabase(MONGODB_URI);

        // Find the most recent order for this caller ID that is in 'FULFILLED_CALL_STARTED' status
        // Note: The caller_id from ElevenLabs might be the 'From' number.
        // We need to match this with the 'accessCode' or just the most recent active order.
        // Since we don't have the access code here, we rely on the phone number or recent activity.
        // Ideally, we would pass the Order ID via SIP headers, but ElevenLabs support for custom headers is limited to X-CALL-ID.

        // STRATEGY: Find the most recent order updated in the last 5 minutes with status 'FULFILLED_CALL_STARTED'.
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // We search for an order that was just marked as 'FULFILLED_CALL_STARTED' by twilio-call-handler.
        const order = await Order.findOne({
            fulfillmentStatus: 'FULFILLED_CALL_STARTED',
            updatedAt: { $gte: fiveMinutesAgo }
        }).sort({ updatedAt: -1 });

        if (!order) {
            console.warn("No active order found for context.");
            return { statusCode: 200, body: JSON.stringify({}) };
        }

        console.log("Found Order for Context:", order._id);

        // Return the dynamic variables for ElevenLabs
        // These keys must match the {{variables}} in your ElevenLabs Agent Prompt
        const responseData = {
            dynamic_variables: {
                childName: order.childName,
                childWish: order.childWish,
                childDeed: order.childDeed,
                overageOption: order.overageOption
            }
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error("Context Webhook Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
