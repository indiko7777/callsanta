const mongoose = require('mongoose');
const Order = require('./models/order');
const crypto = require('crypto');

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

// --- WEBHOOK SIGNATURE VERIFICATION ---
const verifyWebhookSignature = (payload, signature, secret) => {
    if (!secret) {
        console.warn('ELEVENLABS_WEBHOOK_SECRET not set - skipping signature verification');
        return true; // Allow if no secret configured
    }

    if (!signature) {
        console.error('No signature provided in webhook request');
        return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Always return 200 to acknowledge webhook (prevent retries)
    const successResponse = {
        statusCode: 200,
        body: JSON.stringify({ status: 'received' })
    };

    if (event.httpMethod !== 'POST') {
        console.log('Invalid method for save-call-data webhook');
        return successResponse;
    }

    // Verify webhook signature (HMAC)
    const signature = event.headers['x-elevenlabs-signature'] || event.headers['X-ElevenLabs-Signature'];
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

    if (!verifyWebhookSignature(event.body, signature, webhookSecret)) {
        console.error('Invalid webhook signature - rejecting request');
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Invalid signature' })
        };
    }

    console.log('✅ Webhook signature verified');

    try {
        const payload = JSON.parse(event.body || '{}');
        console.log('ElevenLabs Webhook Payload:', JSON.stringify(payload, null, 2));

        // Extract data from ElevenLabs webhook payload
        // The exact structure may vary - adjust based on actual ElevenLabs webhook format
        const {
            conversation_id,
            transcript,
            audio_url,
            duration_secs,
            metadata,
            custom_llm_extra_body
        } = payload;

        // Extract order ID from custom parameters
        // ElevenLabs may return this in different places depending on configuration
        let orderId = null;

        // Try to find order ID from various possible locations
        if (metadata && metadata['X-Order-Id']) {
            orderId = metadata['X-Order-Id'];
        } else if (custom_llm_extra_body && custom_llm_extra_body['X-Order-Id']) {
            orderId = custom_llm_extra_body['X-Order-Id'];
        } else if (payload['X-Order-Id']) {
            orderId = payload['X-Order-Id'];
        }

        // Also check query parameters from SIP URI
        const queryParams = event.queryStringParameters || {};
        if (!orderId && queryParams['X-Order-Id']) {
            orderId = queryParams['X-Order-Id'];
        }

        if (!orderId) {
            console.error('No order ID found in ElevenLabs webhook payload');
            console.error('Payload keys:', Object.keys(payload));
            return successResponse; // Still return 200 to prevent retries
        }

        if (!conversation_id) {
            console.error('No conversation_id in ElevenLabs webhook payload');
            return successResponse;
        }

        console.log(`Processing call data for Order ID: ${orderId}, Conversation ID: ${conversation_id}`);

        await connectToDatabase(process.env.MONGODB_URI);

        // Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            console.error(`Order not found: ${orderId}`);
            return successResponse; // Still return 200
        }

        // Update order with call data
        order.conversationId = conversation_id;
        order.audioUrl = audio_url || null;

        // Format transcript if it's an array
        if (Array.isArray(transcript)) {
            order.transcript = transcript.map(t => `${t.role === 'agent' ? 'Santa' : 'Child'}: ${t.message}`).join('\n');
        } else {
            order.transcript = transcript || null;
        }
        order.callDuration = duration_secs || 0;
        order.fulfillmentStatus = 'CALL_COMPLETED';

        await order.save();
        console.log(`Call data saved for order ${orderId}`);

        // If this is a bundle package, send post-call email
        if (order.packageId === 'bundle') {
            console.log('Triggering bundle post-call email...');

            const emailFunction = require('./send-confirmation-email');
            const emailResult = await emailFunction.handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    order_id: orderId,
                    email_type: 'bundle_post_call'
                })
            }, context);

            if (emailResult.statusCode === 200) {
                console.log(`Bundle post-call email sent to ${order.parentEmail}`);
            } else {
                console.error('Failed to send bundle post-call email:', emailResult.body);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: 'success',
                message: 'Call data saved successfully',
                order_id: orderId,
                conversation_id: conversation_id,
                email_sent: order.packageId === 'bundle'
            })
        };

    } catch (error) {
        console.error('SAVE CALL DATA ERROR:', error);
        // Still return 200 to prevent ElevenLabs from retrying
        return successResponse;
    }
};
