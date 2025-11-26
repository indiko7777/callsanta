const mongoose = require('mongoose');
const Order = require('./models/order');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sig = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;

    try {
        // Verify webhook signature
        if (webhookSecret) {
            stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
        } else {
            // If no webhook secret, parse the body directly (not recommended for production)
            console.warn('STRIPE_WEBHOOK_SECRET not set - skipping signature verification');
            stripeEvent = JSON.parse(event.body);
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Webhook signature verification failed' })
        };
    }

    console.log('Stripe webhook event type:', stripeEvent.type);

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        // Handle the event
        switch (stripeEvent.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = stripeEvent.data.object;
                console.log('Payment succeeded:', paymentIntent.id);

                // Find the order by payment intent ID
                const order = await Order.findOne({ stripePaymentIntentId: paymentIntent.id });

                if (!order) {
                    console.error('Order not found for payment intent:', paymentIntent.id);
                    return {
                        statusCode: 200,
                        body: JSON.stringify({ received: true, warning: 'Order not found' })
                    };
                }

                console.log('Found order:', order._id);

                // Update order status
                order.fulfillmentStatus = 'PAYMENT_COMPLETED';
                await order.save();

                console.log('Order status updated to PAYMENT_COMPLETED');

                // Send confirmation email based on package type
                const emailFunction = require('./send-confirmation-email');

                let emailType;
                if (order.packageId === 'call') {
                    emailType = 'live_call_confirmation';
                } else if (order.packageId === 'video') {
                    emailType = 'video_order_confirmation';
                } else if (order.packageId === 'bundle') {
                    emailType = 'bundle_call_confirmation';
                }

                if (emailType) {
                    const emailResult = await emailFunction.handler({
                        httpMethod: 'POST',
                        body: JSON.stringify({
                            order_id: order._id.toString(),
                            email_type: emailType
                        })
                    }, context);

                    if (emailResult.statusCode === 200) {
                        console.log(`Confirmation email sent to ${order.parentEmail}`);
                    } else {
                        console.error('Failed to send confirmation email:', emailResult.body);
                    }
                }

                break;

            case 'payment_intent.payment_failed':
                const failedPayment = stripeEvent.data.object;
                console.log('Payment failed:', failedPayment.id);

                const failedOrder = await Order.findOne({ stripePaymentIntentId: failedPayment.id });
                if (failedOrder) {
                    failedOrder.fulfillmentStatus = 'PAYMENT_FAILED';
                    await failedOrder.save();
                    console.log('Order marked as PAYMENT_FAILED');
                }

                break;

            default:
                console.log('Unhandled event type:', stripeEvent.type);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };

    } catch (error) {
        console.error('Webhook handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
