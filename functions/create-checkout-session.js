const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCT_PRICES = {
    bundle: 2000, // $20.00
    call: 1000,    // $10.00
    video: 3500    // $35.00
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { packageId, childCount, overageOption } = JSON.parse(event.body);

        const basePrice = PRODUCT_PRICES[packageId];
        if (!basePrice) throw new Error('Invalid Package');

        // Logic for Extra Children
        // First child included, extras are $7.50 each
        const extraChildren = Math.max(0, parseInt(childCount || 1) - 1);
        const extraChildPrice = 750;

        // Line Items Construction
        const line_items = [
            {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Santa Package: ${packageId.toUpperCase()}`,
                        description: `Base package`
                    },
                    unit_amount: basePrice,
                },
                quantity: 1,
            }
        ];

        if (extraChildren > 0) {
            line_items.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Additional Children',
                        description: `$7.50 x ${extraChildren} extra children`
                    },
                    unit_amount: extraChildPrice,
                },
                quantity: extraChildren,
            });
        }

        // Overage Logic (Add to total if unlimited selected and NOT bundle)
        if (overageOption === 'unlimited' && packageId !== 'bundle') {
            line_items.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Unlimited Call Time',
                        description: 'Talk as long as you want!'
                    },
                    unit_amount: 500, // $5.00
                },
                quantity: 1,
            });
        }

        // Create Session
        const SITE_URL = process.env.URL || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            success_url: `${SITE_URL}/personalize.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${SITE_URL}/`,
            phone_number_collection: { enabled: true },
            metadata: {
                packageId,
                childCount,
                overageOption
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ id: session.id })
        };

    } catch (error) {
        console.error('Stripe Session Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
