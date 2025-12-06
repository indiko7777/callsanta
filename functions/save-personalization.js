const mongoose = require('mongoose');
const Order = require('./models/order');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(uri, { bufferCommands: false, family: 4 });
    cachedDb = db;
    return db;
};

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        console.log('Save Personalization Body:', event.body);
        const bodyParsed = JSON.parse(event.body);
        console.log('Parsed Body:', bodyParsed);
        const { sessionId, children, parentPhone, parentEmail } = bodyParsed;

        if (!sessionId) {
            throw new Error('sessionId is missing in request body');
        }

        // Find Order by Stripe Session ID (which is stored as paymentIntentId usually, 
        // BUT wait - Checkout Session ID is different from Payment Intent ID.
        // We need to look up the session first to get the intent, OR store Session ID in our webhook.
        // STRATEGY CHANGE: We will update webhook to store `stripeSessionId` or query by `stripePaymentIntentId` 
        // if we can get it from session.

        // Easier: Retrieve session from Stripe to get Payment Intent, then find Order.
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const paymentIntentId = session.payment_intent;

        let order = await Order.findOne({ stripePaymentIntentId: paymentIntentId });

        if (!order) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        // Update Order
        order.children = children;
        order.parentPhone = parentPhone || order.parentPhone; // Update if provided
        if (parentEmail) order.parentEmail = parentEmail; // Update if provided

        // Mark as fully ready for fulfillment if needed, or trigger emails
        // Ideally fulfillmentStatus checks if personalization is complete?
        // For now, we just save.

        await order.save();

        // Trigger confirmation email if not already sent or needed
        // (Usually handled by webhook, but maybe we want a "We got your details!" email?)

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, orderId: order._id })
        };

    } catch (error) {
        console.error('Save Personalization Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
