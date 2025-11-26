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
    let body = {};
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        console.error("Invalid JSON:", e);
        return { statusCode: 400, body: "Invalid JSON" };
    }

    // Extract conversation_id along with other params
    const { access_code, order_id, caller_id, conversation_id } = body;
    console.log("ElevenLabs Context Request:", { access_code, order_id, caller_id, conversation_id });

    if (!access_code && !order_id && !caller_id) {
        return { statusCode: 400, body: "Missing access_code, order_id, or caller_id" };
    }

    try {
        await connectToDatabase(MONGODB_URI);

        let order;

        // 1. Try to find by Access Code (most reliable)
        if (access_code) {
            order = await Order.findOne({ accessCode: access_code });
        }

        // 2. Try to find by Order ID
        if (!order && order_id) {
            order = await Order.findById(order_id);
        }

        // 3. Fallback: Find the most recent active order for this caller ID
        if (!order && caller_id) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
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

        // --- CRITICAL FIX: Save conversation_id to Order immediately ---
        if (conversation_id) {
            order.conversationId = conversation_id;
            // We can also ensure the status is correct
            if (order.fulfillmentStatus === 'FULFILLED') {
                 order.fulfillmentStatus = 'FULFILLED_CALL_STARTED';
            }
            await order.save();
            console.log(`Linked conversation ${conversation_id} to order ${order._id}`);
        }
        // ---------------------------------------------------------------

        // Prepare Dynamic Variables
        const today = new Date();
        const currentYear = today.getFullYear();
        let christmas = new Date(Date.UTC(currentYear, 11, 25));
        if (today.getTime() > christmas.getTime()) {
            christmas.setUTCFullYear(currentYear + 1);
        }
        const oneDay = 1000 * 60 * 60 * 24;
        const daysUntilChristmas = Math.ceil((christmas.getTime() - today.getTime()) / oneDay);

        const children = order.children || [];
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

        const names = children.map(c => c.name);
        let greetingNames = "";
        if (names.length === 0) {
            greetingNames = "my friend";
        } else if (names.length === 1) {
            greetingNames = names[0];
        } else if (names.length === 2) {
            greetingNames = `${names[0]} and ${names[1]}`;
        } else {
            const last = names.pop();
            greetingNames = `${names.join(', ')}, and ${last}`;
        }

        const toolResponseData = {
            child_count: children.length > 0 ? children.length : 1,
            children_context: childrenContext,
            greeting_names: greetingNames,
            npl_time: nplTime,
            call_overage_option: order.overageOption || 'auto_disconnect',
            days_until_christmas: daysUntilChristmas,
            summary: `You are calling ${children.length > 0 ? children.length : 1} child(ren). ${childrenContext}. Current NPL time is ${nplTime}. ${daysUntilChristmas} days until Christmas. Call overage option: ${order.overageOption || 'auto_disconnect'}.`
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...toolResponseData,
                dynamic_variables: toolResponseData
            })
        };

    } catch (error) {
        console.error("Context Webhook Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};