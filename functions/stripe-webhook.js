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

                // Check if this is an upgrade order
                if (order.upgradeType && order.originalOrderId) {
                    console.log(`Processing ${order.upgradeType} upgrade for original order:`, order.originalOrderId);

                    const originalOrder = await Order.findById(order.originalOrderId);

                    if (originalOrder) {
                        // Update original order with upgrade flags
                        if (order.upgradeType === 'recording') {
                            originalOrder.hasRecordingUpgrade = true;
                        } else if (order.upgradeType === 'bundle') {
                            originalOrder.hasBundleUpgrade = true;
                            // Generate new access code for return call
                            originalOrder.returnCallAccessCode = Math.floor(1000 + Math.random() * 9000).toString();
                            originalOrder.overageOption = 'unlimited'; // Bundle includes unlimited time
                        } else if (order.upgradeType === 'return_call') {
                            originalOrder.hasReturnCallUpgrade = true;
                            // Generate new access code for return call
                            originalOrder.returnCallAccessCode = Math.floor(1000 + Math.random() * 9000).toString();
                            originalOrder.overageOption = 'unlimited'; // Return call is unlimited
                        }

                        await originalOrder.save();
                        console.log('Original order updated with upgrade flags');
                    }
                }

                // Send confirmation email based on package type
                const emailFunction = require('./send-confirmation-email');

                let emailType;
                if (order.upgradeType) {
                    // Upgrade order emails
                    if (order.upgradeType === 'recording') {
                        emailType = 'recording_upgrade_confirmation';
                    } else if (order.upgradeType === 'bundle') {
                        emailType = 'bundle_upgrade_confirmation';
                    } else if (order.upgradeType === 'return_call') {
                        emailType = 'return_call_upgrade_confirmation';
                    }
                } else {
                    // Regular order emails
                    if (order.packageId === 'call') {
                        emailType = 'live_call_confirmation';
                    } else if (order.packageId === 'video') {
                        emailType = 'video_order_confirmation';
                    } else if (order.packageId === 'bundle') {
                        emailType = 'bundle_call_confirmation';
                    }
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

            case 'checkout.session.completed':
                const session = stripeEvent.data.object;
                console.log('Checkout session completed:', session.id);

                // Extract Metadata
                const { packageId, childCount, overageOption } = session.metadata;
                const customerEmail = session.customer_details.email;
                const customerPhone = session.customer_details.phone; // Captured by Stripe Phone Collection

                // Generate Access Code
                // Helper defined outside exports in original file (copying logic or reusing if scope allows)
                // Note: generateAccessCode is not in global scope of this file based on previous view_file. 
                // It was in create-payment-intent.js. We need to duplicate or import.
                // Simple duplication for safety:
                const accessCode = Math.floor(1000 + Math.random() * 9000).toString();

                const newOrder = await Order.create({
                    stripeCustomerId: session.customer,
                    stripePaymentIntentId: session.payment_intent,
                    accessCode: accessCode,
                    fulfillmentStatus: 'PAYMENT_COMPLETED',
                    children: [], // Empty initially, filled in personalization
                    parentEmail: customerEmail,
                    parentPhone: customerPhone, // Might be null if user didn't provide, but we force collection in creating session
                    packageId: packageId,
                    amountPaid: session.amount_total,
                    overageOption: overageOption || 'auto_disconnect'
                });

                console.log('Order created from Checkout Session:', newOrder._id);
                // Email sending logic is reused below if structured properly, 
                // OR we can rely on save-personalization to send the "magic is ready" email since 
                // we don't have child names yet.
                // WE SHOULD WAIT to send "Call Confirmation" until personalization is done?
                // Actually, maybe send "Payment Receipt / Action Required" email here?
                // For now, let's just create the order.
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
