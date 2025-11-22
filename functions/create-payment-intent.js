// functions/create-payment-intent.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Order = require('./models/order'); // Corrected Path

// --- 1. PRODUCT PRICING (In CENTS for USD) ---
const PRODUCT_PRICES = {
    bundle: 3000, // $30.00
    call: 2000,    // $20.00
    video: 1500    // $15.00
};

// --- 2. DATABASE CONNECTION (Reused across calls) ---
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
// --- 3. HELPER: Generate a unique 4-digit code (for Twilio) ---
const generateAccessCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};


// --- 4. ENDPOINT HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Connect to MongoDB Atlas
        await connectToDatabase(process.env.MONGODB_URI);

        const body = JSON.parse(event.body);
        const { package_id, parent_email, parent_phone, child_name, child_wish, child_deed, overage_option } = body;
        const amount = PRODUCT_PRICES[package_id];

        if (!amount) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid package ID.' }) };
        }

        // --- A. CREATE STRIPE CUSTOMER ---
        const customer = await stripe.customers.create({
            email: parent_email,
            name: `${child_name} Parent`,
            metadata: { package_id: package_id }
        });

        // --- B. CREATE PAYMENT INTENT ---
        const paymentIntentParams = {
            amount: amount,
            currency: 'usd',
            customer: customer.id,
            description: `CallSanta.us Purchase: ${package_id}`,
            receipt_email: parent_email,
            automatic_payment_methods: { enabled: true },
            // Store personalization data in PI metadata for Stripe Dashboard visibility
            metadata: {
                child_name: child_name,
                child_wish: child_wish,
                child_deed: child_deed,
                parent_phone: parent_phone,
                customer_id: customer.id,
                overage_option: overage_option || 'auto_disconnect'
            },
        };

        // If user accepted overage, setup future usage for off-session charges
        if (overage_option === 'overage_accepted') {
            paymentIntentParams.setup_future_usage = 'off_session';
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

        // --- C. CREATE DATABASE RECORD (Status: PENDING_PAYMENT) ---
        const newOrder = await Order.create({
            stripeCustomerId: customer.id,
            stripePaymentIntentId: paymentIntent.id,
            accessCode: generateAccessCode(),
            fulfillmentStatus: 'PENDING_PAYMENT',
            childName: child_name,
            childWish: child_wish,
            childDeed: child_deed,
            parentEmail: parent_email,
            parentPhone: parent_phone,
            packageId: package_id,
            amountPaid: amount,
            overageOption: overage_option || 'auto_disconnect'
        });

        // --- D. SEND CLIENT SECRET TO FRONTEND ---
        return {
            statusCode: 200,
            body: JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                order_id: newOrder._id, // Pass our internal ID back for tracking
            }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create payment intent or database record: ' + error.message }),
        };
    }
};