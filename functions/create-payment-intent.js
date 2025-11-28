// functions/create-payment-intent.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- 1. PRODUCT PRICING (In CENTS for USD) ---
const PRODUCT_PRICES = {
    bundle: 2000, // $20.00
    call: 1000,    // $10.00
    video: 3500    // $35.00
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
       const { package_id, parent_email, parent_phone, children, overage_option, promo_code } = body;
        let amount = PRODUCT_PRICES[package_id];

        if (!amount) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid package ID.' }) };
        }

        // Pricing Logic:
        // 1. Base price (package_id)
        // 2. Extra children: $7.50 per child after the first one
        const numChildren = Array.isArray(children) ? children.length : 1;
        const extraChildPrice = 750; // $7.50 in cents
        const extraChildrenCount = Math.max(0, numChildren - 1);
        amount += extraChildrenCount * extraChildPrice;
if (promo_code === 'TEST100') { // CHANGE 'TEST100' TO YOUR DESIRED CODE
            amount = 0;
        }

        // 3. CHECK FOR FREE ORDER
        if (amount === 0) {
            // Create DB Record immediately as PAID
            const newOrder = await Order.create({
                stripeCustomerId: 'promo_user', // Placeholder
                stripePaymentIntentId: 'promo_free', // Placeholder
                accessCode: generateAccessCode(),
                fulfillmentStatus: 'PAID', // Mark as paid immediately
                children: children,
                parentEmail: parent_email,
                parentPhone: parent_phone,
                packageId: package_id,
                amountPaid: 0,
                overageOption: overage_option || 'auto_disconnect'
            });

            // Return special flag to frontend
            return {
                statusCode: 200,
                body: JSON.stringify({
                    freeOrder: true,
                    order_id: newOrder._id,
                }),
            };
        }
        // 3. Overage option (legacy check, keeping just in case)
        if (overage_option === 'unlimited' && package_id !== 'bundle') {
            amount += 500;
        }

        // --- A. CREATE STRIPE CUSTOMER ---
        // Use the first child's name for the customer name or a generic one
        const firstChildName = (children && children[0] && children[0].name) ? children[0].name : 'Child';
        const customer = await stripe.customers.create({
            email: parent_email,
            name: `${firstChildName} Parent`,
            metadata: { package_id: package_id }
        });

        // --- B. CREATE PAYMENT INTENT ---
        const paymentIntentParams = {
            amount: amount,
            currency: 'usd',
            customer: customer.id,
            description: `CallSanta.us Purchase: ${package_id} (${numChildren} children)`,
            receipt_email: parent_email,
            automatic_payment_methods: { enabled: true },
            // Store personalization data in PI metadata for Stripe Dashboard visibility
            // Note: Metadata has a 500 char limit per key. We'll store a summary.
            metadata: {
                child_count: numChildren,
                parent_phone: parent_phone,
                customer_id: customer.id,
                overage_option: overage_option || 'auto_disconnect'
            },
        };

        const paymentIntentCreated = await stripe.paymentIntents.create(paymentIntentParams);

        // --- C. CREATE DATABASE RECORD (Status: PENDING_PAYMENT) ---
        const newOrder = await Order.create({
            stripeCustomerId: customer.id,
            stripePaymentIntentId: paymentIntentCreated.id,
            accessCode: generateAccessCode(),
            fulfillmentStatus: 'PENDING_PAYMENT',
            children: children, // Save the array of children
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
                clientSecret: paymentIntentCreated.client_secret,
                order_id: newOrder._id,
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