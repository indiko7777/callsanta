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

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { originalOrderId, upgradeType } = JSON.parse(event.body);

        if (!originalOrderId || !upgradeType) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        await connectToDatabase(process.env.MONGODB_URI);

        const originalOrder = await Order.findById(originalOrderId);
        if (!originalOrder) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Original order not found' }) };
        }

        // Define upgrade prices (in cents)
        const prices = {
            'recording': 500,      // $5.00
            'bundle': 750,         // $7.50
            'return_call': 1000    // $10.00
        };

        const amount = prices[upgradeType];
        if (!amount) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid upgrade type' }) };
        }

        // Create a NEW order for the upgrade
        // We link it to the original order via metadata or a new field if we wanted, 
        // but for now we just clone the child info and parent info.
        // Ideally, we might want to update the EXISTING order, but creating a new one is cleaner for payment tracking.
        // However, for "upgrades" like recording, we probably want to update the existing order's permissions.
        // For simplicity and robustness, we'll create a new order record that references the upgrade.

        const newOrder = new Order({
            parentEmail: originalOrder.parentEmail,
            parentPhone: originalOrder.parentPhone,
            children: originalOrder.children,
            packageId: 'upgrade_' + upgradeType,
            amountPaid: amount,
            currency: 'usd',
            fulfillmentStatus: 'PENDING_PAYMENT',
            stripeCustomerId: originalOrder.stripeCustomerId, // Reuse customer if possible
            // Store reference to original order in a flexible way if needed, or just rely on email
        });

        await newOrder.save();

        // Create Stripe PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: {
                order_id: newOrder._id.toString(),
                original_order_id: originalOrderId,
                upgrade_type: upgradeType,
                parent_email: originalOrder.parentEmail
            },
            description: `Upgrade: ${upgradeType} for Order ${originalOrderId}`
        });

        // Update order with PI ID
        newOrder.stripePaymentIntentId = paymentIntent.id;
        await newOrder.save();

        return {
            statusCode: 200,
            body: JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                orderId: newOrder._id
            })
        };

    } catch (error) {
        console.error('UPGRADE PAYMENT ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
