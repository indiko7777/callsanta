const mongoose = require('mongoose');
const Order = require('./models/order');

// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;

    if (!uri) {
        throw new Error("MONGODB_URI is not set.");
    }

    const db = await mongoose.connect(uri, {
        bufferCommands: false,
        family: 4, // Force IPv4
    });
    cachedDb = db;
    return db;
};

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    const { payment_intent_id } = event.queryStringParameters || {};

    if (!payment_intent_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing payment_intent_id parameter' }),
        };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        const order = await Order.findOne({ stripePaymentIntentId: payment_intent_id });

        if (!order) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Order not found' }),
            };
        }

        // Return only necessary details to the frontend
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Allow CORS for frontend
            },
            body: JSON.stringify({
                childName: order.childName,
                parentEmail: order.parentEmail,
                packageId: order.packageId,
                accessCode: order.accessCode,
                overageOption: order.overageOption,
                fulfillmentStatus: order.fulfillmentStatus,
                order_id: order._id // Return ID for video polling
            }),
        };

    } catch (error) {
        console.error('GET ORDER DETAILS ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};
