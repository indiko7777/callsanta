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

    const { access_code, order_id, caller_id, conversation_id } = body;
    console.log("ElevenLabs Context Request:", { access_code, order_id, caller_id, conversation_id });

    if (!access_code && !order_id && !caller_id) {
        return { statusCode: 400, body: "Missing access_code, order_id, or caller_id" };
    }

    try {
        await connectToDatabase(MONGODB_URI);

        let order;

        // 1. Try to find by Access Code (first check regular access code)
        if (access_code) {
            order = await Order.findOne({ accessCode: access_code });

            // 2. If not found, check if it's a return call access code
            if (!order) {
                order = await Order.findOne({ returnCallAccessCode: access_code });
            }
        }

        // 3. Try to find by Order ID
        if (!order && order_id) {
            order = await Order.findById(order_id);
        }

        // 4. Fallback: Find by active call status
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

        // Try to link conversation ID if present
        if (conversation_id && !order.conversationId) {
            order.conversationId = conversation_id;
            await order.save();
        }

        // --- VARIABLES ---
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
            // --- CRITICAL: Pass order_id back to ElevenLabs to hold onto ---
            order_id: order._id.toString(),
            // --------------------------------------------------------------
            child_count: children.length > 0 ? children.length : 1,
            children_context: childrenContext,
            greeting_names: greetingNames,
            npl_time: nplTime,
            call_overage_option: order.overageOption || 'auto_disconnect',
            days_until_christmas: daysUntilChristmas,
            summary: `You are calling ${children.length > 0 ? children.length : 1} child(ren). ${childrenContext}. Current NPL time is ${nplTime}. ${daysUntilChristmas} days until Christmas. Call overage option: ${order.overageOption || 'auto_disconnect'}.`
        };

        // Check if this is a return call
        const isReturnCall = order.returnCallAccessCode && order.returnCallAccessCode === access_code;

        if (isReturnCall) {
            console.log('This is a RETURN CALL - adding previous call context');
            toolResponseData.is_return_call = true;
            toolResponseData.previous_call_transcript = order.transcript || 'No previous transcript available';
            toolResponseData.previous_call_duration = order.callDuration || 0;
            toolResponseData.previous_wishes = children.map(c => c.wish).join(', ');
            toolResponseData.previous_good_deeds = children.map(c => c.deed).join(', ');
            toolResponseData.call_date = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'recently';
            toolResponseData.agent_id = order.returnCallAgentId || 'agent_4101kb0yxw0zf15t6r2by1g684nb';
        } else {
            toolResponseData.is_return_call = false;
            toolResponseData.agent_id = process.env.ELEVENLABS_AGENT_ID;
        }

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