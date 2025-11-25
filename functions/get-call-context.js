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

        // Re-calculate derived variables if needed, or rely on what's in the order if we stored it.
        // Since we don't store daysUntilChristmas in the order, we calculate it again.
        const today = new Date();
        const currentYear = today.getFullYear();
        let christmas = new Date(Date.UTC(currentYear, 11, 25));
        if (today.getTime() > christmas.getTime()) {
            christmas.setUTCFullYear(currentYear + 1);
        }
        const oneDay = 1000 * 60 * 60 * 24;
        const daysUntilChristmas = Math.ceil((christmas.getTime() - today.getTime()) / oneDay);

        const children = order.children || [];
        // Fallback if children array is empty
        if (children.length === 0 && order.childName) {
            children.push({
                name: order.childName,
                wish: order.childWish || 'something special',
                deed: order.childDeed || 'being good'
            });
        }

        const childrenContext = children.map((child, index) => {
            return `Child ${index + 1}: Name: ${child.name}, Wish: ${child.wish}, Good Deed: ${child.deed}`;
        }).join('. ');

        const nplTime = new Date().toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

        // Response format for ElevenLabs Tool (direct data, not wrapped)
        const toolResponseData = {
            child_count: children.length > 0 ? children.length : 1,
            children_context: childrenContext,
            npl_time: nplTime,
            call_overage_option: order.overageOption || 'auto_disconnect',
            days_until_christmas: daysUntilChristmas,
            // Also provide a formatted text summary for easy consumption
            summary: `You are calling ${children.length > 0 ? children.length : 1} child(ren). ${childrenContext}. Current NPL time is ${nplTime}. ${daysUntilChristmas} days until Christmas. Call overage option: ${order.overageOption || 'auto_disconnect'}.`
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toolResponseData)
        };

    } catch (error) {
        console.error("Context Webhook Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
