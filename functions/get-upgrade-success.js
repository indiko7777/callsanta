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

    const { orderId } = event.queryStringParameters || {};

    if (!orderId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing orderId' })
        };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        // Find the upgrade order
        const upgradeOrder = await Order.findById(orderId);

        if (!upgradeOrder) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        if (!upgradeOrder.upgradeType) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Not an upgrade order' }) };
        }

        // Fetch the original order
        const originalOrder = await Order.findById(upgradeOrder.originalOrderId);

        if (!originalOrder) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Original order not found' }) };
        }

        // Build response based on upgrade type
        const responseData = {
            upgradeType: upgradeOrder.upgradeType,
            childName: originalOrder.children && originalOrder.children[0] ? originalOrder.children[0].name : 'Child',
            parentEmail: upgradeOrder.parentEmail,
            packageId: upgradeOrder.packageId
        };

        // For bundle and return_call upgrades, include new access code
        if (upgradeOrder.upgradeType === 'bundle' || upgradeOrder.upgradeType === 'return_call') {
            responseData.newAccessCode = originalOrder.returnCallAccessCode;
            responseData.twilioNumber = process.env.TWILIO_RETURN_CALL_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+1234567890';
            responseData.isUnlimited = upgradeOrder.upgradeType === 'return_call';
        }

        // Include original call data if available
        if (originalOrder.audioUrl || originalOrder.transcript) {
            responseData.originalCall = {
                audioUrl: originalOrder.audioUrl,
                transcript: originalOrder.transcript,
                callDuration: originalOrder.callDuration,
                createdAt: originalOrder.createdAt
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('GET UPGRADE SUCCESS ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
