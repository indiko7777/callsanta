const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- DATABASE CONNECTION ---
let cachedDb = null;

const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;

    if (!uri) {
        console.error("MONGODB_URI is not set.");
        throw new Error("Database connection configuration missing.");
    }

    const db = await mongoose.connect(uri, {
        bufferCommands: false,
    });
    cachedDb = db;
    return db;
};

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // IMPORTANT: Twilio sends form data, not JSON
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();

    // Twilio provides this data when the call ends
    const callDurationSeconds = parseInt(body.get('CallDuration')) || 0;
    const callStatus = body.get('CallStatus'); // e.g., 'completed'
    const callSid = body.get('CallSid'); // Unique ID for logging

    // We retrieve the Order ID from the query parameter passed in the action URL
    const orderId = body.get('orderId') || event.queryStringParameters?.orderId;

    if (callStatus !== 'completed') {
        return { statusCode: 200, body: `Call not completed (Status: ${callStatus})` };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        if (!orderId) {
            console.error("Missing orderId in webhook callback");
            return { statusCode: 400, body: "Missing orderId" };
        }

        // Retrieve the order directly by ID
        const order = await Order.findById(orderId);

        if (!order) {
            return { statusCode: 200, body: 'Order not found.' };
        }

        // IMPORTANT: overage_accepted is now a ONE-TIME $5 fee for UNLIMITED time
        // No per-minute billing should occur. The $5 was already charged upfront.
        // This webhook now only logs the call duration for record-keeping.

        console.log(`Call completed - Duration: ${callDurationSeconds}s (${Math.floor(callDurationSeconds / 60)} min), Overage Option: ${order.overageOption}`);

        // Update Order Status with final duration (no additional charges)
        await Order.updateOne({ _id: order._id }, {
            fulfillmentStatus: 'CALL_COMPLETED',
            finalDuration: callDurationSeconds
        });

        return { statusCode: 200, body: `Call completed. Duration: ${callDurationSeconds}s. No additional charges (overage was prepaid if selected).` };

    } catch (error) {
        console.error('BILLING WEBHOOK FAILED:', error.message);
        // Important: Return 200 so Twilio doesn't retry the webhook repeatedly
        return { statusCode: 200, body: 'Billing failed but webhook acknowledged.' };
    }
};