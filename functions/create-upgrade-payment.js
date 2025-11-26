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

        let originalOrder;
        const trimmedId = originalOrderId.trim();

        if (mongoose.Types.ObjectId.isValid(trimmedId)) {
            originalOrder = await Order.findById(trimmedId);
        }

        // If not found by ID (or invalid ID), try accessCode (case-insensitive)
        if (!originalOrder) {
            originalOrder = await Order.findOne({
                accessCode: { $regex: new RegExp(`^${trimmedId}$`, 'i') }
            });
        }

        if (!originalOrder) {
            console.log(`Order not found for ID/AccessCode: ${trimmedId}`);
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

        // Create Stripe PaymentIntent FIRST (before creating the order)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: {
                original_order_id: trimmedId,
                upgrade_type: upgradeType,
                parent_email: originalOrder.parentEmail
            },
            description: `Upgrade: ${upgradeType} for Order ${trimmedId}`
        });

        // Create a NEW order for the upgrade with the Payment Intent ID
        const newOrder = new Order({
            parentEmail: originalOrder.parentEmail,
            parentPhone: originalOrder.parentPhone,
            children: originalOrder.children,
            packageId: 'upgrade_' + upgradeType,
            amountPaid: amount,
            currency: 'usd',
            fulfillmentStatus: 'PENDING_PAYMENT',
            stripeCustomerId: originalOrder.stripeCustomerId,
            stripePaymentIntentId: paymentIntent.id // Include PI ID from the start
        });

        await newOrder.save();

        // Update Payment Intent metadata with the new order ID
        await stripe.paymentIntents.update(paymentIntent.id, {
            metadata: {
                order_id: newOrder._id.toString(),
                original_order_id: trimmedId,
                upgrade_type: upgradeType,
                parent_email: originalOrder.parentEmail
            }
        });

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
