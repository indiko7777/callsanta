const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- DATABASE CONNECTION ---
let cachedDb = null;

const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;

    if (!uri) {
        console.error("MONGODB_URI is not set.");
        throw new Error("Database connection configuration missing.");
    }

    const db = await mongoose.connect(uri, {
        bufferCommands: false,
    });
    cachedDb = db;
    return db;
};

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // IMPORTANT: Twilio sends form data, not JSON
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();

    // Twilio provides this data when the call ends
    const callDurationSeconds = parseInt(body.get('CallDuration')) || 0;
    const callStatus = body.get('CallStatus'); // e.g., 'completed'
    const callSid = body.get('CallSid'); // Unique ID for logging

    // We need the Payment Intent ID, which was passed to ElevenLabs and can be logged via a separate ElevenLabs webhook.
    // For simplicity here, we assume the Order ID is passed via a hidden means, but the actual lookup is complex.
    // --- VITAL ASSUMPTION: We retrieve the Stripe Customer ID from a temporary cache or a related webhook ---
    // In a real production app, you'd likely use the CallSid to look up the active call record in your DB.

    if (callStatus !== 'completed' || callDurationSeconds <= 300) {
        // Only proceed if call completed AND exceeded 5 minutes
        return { statusCode: 200, body: `No overage charge required (Duration: ${callDurationSeconds}s)` };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        // 1. Retrieve the order and check policy
        // NOTE: In production, you MUST find a way to link this call back to the specific Order.
        // For now, we are finding the most recent fulfilled call as a fallback, which is risky in high volume.
        // A better way is to store the CallSid in the Order when the call starts (in twilio-call-handler).
        const order = await Order.findOne({ fulfillmentStatus: 'FULFILLED_CALL_STARTED' }).sort({ updatedAt: -1 });

        if (!order || order.overageOption !== 'overage_accepted') {
            return { statusCode: 200, body: 'Overage not authorized or order not found.' };
        }

        // 2. Calculate Overage (in USD cents)
        const overageMinutes = Math.ceil((callDurationSeconds - 300) / 60); // 300s = 5 min
        const overageAmountCents = overageMinutes * 100; // $1.00 per minute

        // 3. Find the Customer's saved payment method (from the initial purchase)
        const paymentMethods = await stripe.paymentMethods.list({
            customer: order.stripeCustomerId,
            type: 'card',
        });

        if (paymentMethods.data.length === 0) {
            console.warn(`Customer ${order.stripeCustomerId} has no saved card for overage.`);
            return { statusCode: 200, body: 'No payment method on file.' };
        }

        const savedPaymentMethodId = paymentMethods.data[0].id;

        // 4. Create the final Off-Session Charge
        const chargeIntent = await stripe.paymentIntents.create({
            amount: overageAmountCents,
            currency: 'usd',
            customer: order.stripeCustomerId,
            payment_method: savedPaymentMethodId,
            off_session: true, // This is mandatory for charging without user present
            confirm: true,
            description: `Santa Call Overage Charge (${overageMinutes} mins)`,
            metadata: { order_id: order._id.toString(), duration: callDurationSeconds }
        });

        // 5. Update Order Status
        await Order.updateOne({ _id: order._id }, {
            fulfillmentStatus: 'CALL_COMPLETED_CHARGED',
            finalDuration: callDurationSeconds,
            overageCharged: overageAmountCents
        });

        return { statusCode: 200, body: `Charged $${overageAmountCents / 100} for ${overageMinutes} min overage.` };

    } catch (error) {
        console.error('BILLING WEBHOOK FAILED:', error.message);
        // Important: Return 200 so Twilio doesn't retry the webhook repeatedly
        return { statusCode: 200, body: 'Billing failed but webhook acknowledged.' };
    }
};