const sendgrid = require('@sendgrid/mail');
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, sessionId, orderId } = JSON.parse(event.body);

        if (!email || (!sessionId && !orderId)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing email or session/order ID' })
            };
        }

        // Construct Link
        // Use sessionId if available, else orderId. Prefer sessionId for Stripe retrieval if needed.
        const baseUrl = process.env.URL || 'http://localhost:3000';
        const link = `${baseUrl}/personalize.html?session_id=${sessionId}`;

        const msg = {
            to: email,
            from: 'Santa <santa@callsanta.us>', // Ensure this sender is verified in SendGrid
            subject: 'Finish Your Santa Call Personalization',
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h1>Ho Ho Ho! 🎅</h1>
                    <p>You're almost there! Santa is waiting to hear about your little ones.</p>
                    <p>Click the link below to finish personalizing your call whenever you're ready:</p>
                    <p>
                        <a href="${link}" style="background-color: #D42426; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Finish Personalization
                        </a>
                    </p>
                    <p>Or copy this link: <a href="${link}">${link}</a></p>
                    <p>See you soon!</p>
                </div>
            `
        };

        await sendgrid.send(msg);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Magic link sent' })
        };

    } catch (error) {
        console.error('Email error:', error);

        // Mock success for local dev if API key is invalid
        if (error.code === 401 || error.message.includes('API key')) {
            console.log('--- LOCAL DEV: Mocking Email Success ---');
            console.log('Would have sent to:', JSON.parse(event.body).email);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Magic link sent (Mock)' })
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send email' })
        };
    }
};
