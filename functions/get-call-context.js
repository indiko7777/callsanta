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

    const { access_code, order_id, caller_id } = body;
    console.log("ElevenLabs Context Request:", { access_code, order_id, caller_id });

    if (!access_code && !order_id && !caller_id) {
        return { statusCode: 400, body: "Missing access_code, order_id, or caller_id" };
    }

    try {
        await connectToDatabase(MONGODB_URI);

        let order;

        // 1. Try to find by Access Code (most reliable if provided by Agent Tool)
        if (access_code) {
            order = await Order.findOne({ accessCode: access_code });
        }

        // 2. Try to find by Order ID
        if (!order && order_id) {
            order = await Order.findById(order_id);
        }

        // 3. Fallback: Find the most recent order for this caller ID
        if (!order && caller_id) {
            // STRATEGY: Find the most recent order updated in the last 5 minutes with status 'FULFILLED_CALL_STARTED'.
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

            // We search for an order that was just marked as 'FULFILLED_CALL_STARTED' by twilio-call-handler.
            order = await Order.findOne({
                fulfillmentStatus: 'FULFILLED_CALL_STARTED',
                updatedAt: { $gte: fiveMinutesAgo }
            }).sort({ updatedAt: -1 });
        }

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

        // Response format for ElevenLabs Tool (direct data) AND Initiation Webhook (dynamic_variables)
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
            body: JSON.stringify({
                ...toolResponseData, // Flat properties for the Tool
                dynamic_variables: toolResponseData // Wrapped properties for Initiation Webhook
            })
        };

    } catch (error) {
        console.error("Context Webhook Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
