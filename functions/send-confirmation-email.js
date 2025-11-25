const mongoose = require('mongoose');
const Order = require('./models/order');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.sendgrid_API);

// --- DATABASE CONNECTION ---
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

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { order_id } = JSON.parse(event.body || '{}');

    if (!order_id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing order_id' }) };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);
        const order = await Order.findById(order_id);

        if (!order) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        // Send Confirmation Email
        const msg = {
            to: order.parentEmail,
            from: 'santa@callsanta.us',
            subject: `Santa has received your order for ${order.childName || 'your child'}!`,
            text: `Ho ho ho! We have received your order. Santa's elves are now working on your personalized video. It will be emailed to you shortly.`,
            html: `
                <div style="font-family: sans-serif; text-align: center; color: #333; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #D42426;">Order Confirmed! 🎅</h1>
                    <p>Ho ho ho! Thank you for your order.</p>
                    <p>We have received your request for a personalized video for <strong>${order.children && order.children[0] ? order.children[0].name : 'your child'}</strong>.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <p style="margin: 0; color: #555;"><strong>What happens next?</strong></p>
                        <p>Santa's elves are manually crafting your video with care. You will receive another email with the download link as soon as it is ready.</p>
                    </div>
                    <p>Merry Christmas!</p>
                </div>
            `,
        };

        await sgMail.send(msg);
        console.log(`Confirmation email sent to ${order.parentEmail}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'email_sent', message: 'Confirmation email sent successfully.' })
        };

    } catch (error) {
        console.error('EMAIL ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send email: ' + error.message })
        };
    }
};
