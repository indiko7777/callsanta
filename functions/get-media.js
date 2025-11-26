const mongoose = require('mongoose');
const Order = require('./models/order');

// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(uri, {
        bufferCommands: false,
        family: 4,
    });
    cachedDb = db;
    return db;
};

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { orderId, accessCode } = event.queryStringParameters || {};

    if (!orderId || !accessCode) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing orderId or accessCode' })
        };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        const order = await Order.findById(orderId);

        if (!order) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        // Verify access code
        if (order.accessCode !== accessCode) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Invalid access code' }) };
        }

        // Return safe media data
        const responseData = {
            childName: order.children && order.children[0] ? order.children[0].name : 'Child',
            audioUrl: order.audioUrl,
            videoUrl: order.videoUrl,
            transcript: order.transcript,
            callDuration: order.callDuration,
            packageId: order.packageId,
            createdAt: order.createdAt
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // Allow CORS for frontend
            },
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('GET MEDIA ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
