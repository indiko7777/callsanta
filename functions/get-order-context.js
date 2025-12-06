const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { session_id } = event.queryStringParameters;

    if (!session_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing session_id' })
        };
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);

        return {
            statusCode: 200,
            body: JSON.stringify({
                childCount: parseInt(session.metadata.childCount || '1'),
                customerEmail: session.customer_details ? session.customer_details.email : null,
                customerName: session.customer_details ? session.customer_details.name : null,
                paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id,
                packageId: session.metadata.packageId // Ensure metadata has this, standard Stripe logic usually stores it
            })
        };
    } catch (error) {
        console.error('Error retrieving session:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to retrieve order context' })
        };
    }
};
