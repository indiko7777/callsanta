const mongoose = require('mongoose');
const Order = require('./models/order');
const sgMail = require('@sendgrid/mail');
const { generateEmailTemplate } = require('./email-templates');

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

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { order_id, email_type, test_data } = JSON.parse(event.body || '{}');

    if (!order_id && !test_data) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing order_id or test_data' }) };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);

        let emailData;
        let order;

        // Use test data if provided, otherwise fetch from database
        if (test_data) {
            emailData = test_data;
        } else {
            order = await Order.findById(order_id);
            if (!order) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
            }

            // Prepare email data from order
            const childName = order.children && order.children[0] ? order.children[0].name : 'your child';
            const parentName = order.parentEmail ? order.parentEmail.split('@')[0] : '';

            emailData = {
                orderId: order._id.toString().slice(-8).toUpperCase(),
                childName: childName,
                parentName: parentName,
                parentEmail: order.parentEmail,
                accessCode: order.accessCode,
                twilioNumber: process.env.TWILIO_PHONE_NUMBER || '+1 (438) 795-1562',
                videoUrl: order.videoUrl,
                audioUrl: order.audioUrl,
                callDuration: order.callDuration,
                conversationTopic: 'your conversation' // Can be enhanced with AI later
            };

            // For upgrade emails, fetch the return call access code from the original order
            if (email_type && email_type.includes('upgrade') && order.originalOrderId) {
                const originalOrder = await Order.findById(order.originalOrderId);
                if (originalOrder) {
                    emailData.returnCallAccessCode = originalOrder.returnCallAccessCode;
                    emailData.accessCode = originalOrder.accessCode; // Use original access code for media links
                    emailData.twilioReturnNumber = process.env.TWILIO_RETURN_CALL_NUMBER || process.env.TWILIO_PHONE_NUMBER;
                }
            }
        }

        // Determine email type based on package and context
        let emailType = email_type;
        if (!emailType && order) {
            if (order.packageId === 'call') {
                emailType = 'live_call_confirmation';
            } else if (order.packageId === 'video') {
                emailType = order.videoUrl ? 'video_delivery' : 'video_order_confirmation';
            } else if (order.packageId === 'bundle') {
                // Bundle has TWO emails:
                // 1. Initial confirmation (bundle_call_confirmation)
                // 2. Post-call with recording (bundle_post_call)
                emailType = order.audioUrl ? 'bundle_post_call' : 'bundle_call_confirmation';
            }
        }

        const template = generateEmailTemplate(emailType, emailData);

        if (!template) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email type' }) };
        }

        const msg = {
            to: emailData.parentEmail,
            from: 'santa@callsanta.us',
            subject: template.subject,
            text: template.text,
            html: template.html,
        };

        await sgMail.send(msg);
        console.log(`Email sent to ${emailData.parentEmail} - Type: ${emailType}`);

        // Track email in database if not test data
        if (order && !test_data) {
            order.emailsSent.push({
                emailType: emailType,
                sentAt: new Date(),
                recipient: emailData.parentEmail
            });
            await order.save();
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: 'email_sent',
                message: 'Email sent successfully.',
                emailType: emailType
            })
        };

    } catch (error) {
        console.error('EMAIL ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send email: ' + error.message })
        };
    }
};
