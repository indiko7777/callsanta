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

    // MODIFIED: Accept both parameter types
    const { payment_intent_id, order_id } = event.queryStringParameters || {};

    if (!payment_intent_id && !order_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing payment_intent_id or order_id parameter' }),
        };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        let order;
        // MODIFIED: Search logic
        if (order_id) {
            if (!mongoose.Types.ObjectId.isValid(order_id)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid order_id format' })
                };
            }
            order = await Order.findById(order_id);
        } else {
            order = await Order.findOne({ stripePaymentIntentId: payment_intent_id });
        }

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
                childName: order.children && order.children[0] ? order.children[0].name : 'Child', // Fallback for childName
                parentEmail: order.parentEmail,
                packageId: order.packageId,
                accessCode: order.accessCode,
                overageOption: order.overageOption,
                fulfillmentStatus: order.fulfillmentStatus,
                order_id: order._id, // Return ID for video polling
                amountPaid: order.amountPaid,
                currency: order.currency || 'USD'
            }),
        };

    } catch (error) {
        console.error('GET ORDER DETAILS ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }),
        };
    }
};