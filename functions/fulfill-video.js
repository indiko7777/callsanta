const mongoose = require('mongoose');
const Order = require('./models/order');

// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(uri, {
        bufferCommands: false,
        family: 4, // Force IPv4
    });
    cachedDb = db;
    return db;
};

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { order_id, video_url } = JSON.parse(event.body || '{}');

    if (!order_id || !video_url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing order_id or video_url' })
        };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        // Find the order
        const order = await Order.findById(order_id);

        if (!order) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Order not found' })
            };
        }

        // Verify this is a video or bundle package
        if (order.packageId !== 'video' && order.packageId !== 'bundle') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'This order does not include a video package' })
            };
        }

        // Update order with video URL and mark as fulfilled
        order.videoUrl = video_url;
        order.videoStatus = 'completed';
        order.fulfillmentStatus = 'FULFILLED';
        await order.save();

        console.log(`Video fulfilled for order ${order_id}: ${video_url}`);

        // Trigger video delivery email (Template B2)
        const emailFunction = require('./send-confirmation-email');
        const emailResult = await emailFunction.handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                order_id: order_id,
                email_type: 'video_delivery'
            })
        }, context);

        if (emailResult.statusCode === 200) {
            console.log(`Video delivery email sent to ${order.parentEmail}`);
        } else {
            console.error('Failed to send video delivery email:', emailResult.body);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: 'success',
                message: 'Video fulfilled and email sent successfully.',
                order_id: order._id,
                video_url: video_url,
                email_sent: emailResult.statusCode === 200
            })
        };

    } catch (error) {
        console.error('FULFILLMENT ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fulfill video: ' + error.message })
        };
    }
};
