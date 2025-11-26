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
        return true;
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

    const successResponse = {
        statusCode: 200,
        body: JSON.stringify({ status: 'received' })
    };

    if (event.httpMethod !== 'POST') {
        return successResponse;
    }

    const signature = event.headers['x-elevenlabs-signature'] || event.headers['X-ElevenLabs-Signature'];
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

    // Check signature but don't block execution to avoid losing data during debug
    if (!verifyWebhookSignature(event.body, signature, webhookSecret)) {
        console.error('⚠️ Invalid or missing webhook signature');
    }

    try {
        const rawPayload = JSON.parse(event.body || '{}');
        console.log('ElevenLabs Webhook Payload:', JSON.stringify(rawPayload, null, 2));

        const payload = rawPayload.data ? rawPayload.data : rawPayload;
        const conversation_id = payload.conversation_id;
        const transcript = payload.transcript;
        const audio_url = payload.audio_url;

        let duration_secs = payload.duration_secs;
        if (!duration_secs && payload.metadata) {
            duration_secs = payload.metadata.call_duration_secs;
        }

        await connectToDatabase(process.env.MONGODB_URI);

        let orderId = null;
        let order = null;

        // --- STRATEGY 1: Look up by Conversation ID (The most reliable method) ---
        if (conversation_id) {
            console.log(`Attempting to find order by conversation_id: ${conversation_id}`);
            order = await Order.findOne({ conversationId: conversation_id });
            if (order) {
                orderId = order._id;
                console.log(`✅ Found order via conversation_id: ${orderId}`);
            }
        }

        // --- STRATEGY 2: Look for explicit Order ID in metadata ---
        if (!order) {
            const findKey = (obj, key) => {
                if (!obj) return null;
                const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
                return found ? obj[found] : null;
            };

            if (payload.metadata) orderId = findKey(payload.metadata, 'x-order-id');
            
            if (!orderId && payload.conversation_initiation_client_data) {
                const clientData = payload.conversation_initiation_client_data;
                if (clientData.custom_llm_extra_body) {
                    orderId = findKey(clientData.custom_llm_extra_body, 'x-order-id');
                }
            }
            
            if (!orderId) orderId = findKey(payload, 'x-order-id');
            
            // Check Query Params
            const queryParams = event.queryStringParameters || {};
            if (!orderId) orderId = findKey(queryParams, 'x-order-id');

            if (orderId) {
                order = await Order.findById(orderId);
            }
        }

        // --- STRATEGY 3: Fallback to Phone Number ---
        if (!order) {
            let customerPhone = null;
            // payload.caller_id might not exist in post_call_audio, check nested objects
            if (payload.caller_id) customerPhone = payload.caller_id;
            else if (payload.phone_call) customerPhone = payload.phone_call.external_number;
            else if (event.queryStringParameters) customerPhone = event.queryStringParameters['x-customer-phone'];

            if (customerPhone) {
                console.log(`Looking up order by phone: ${customerPhone}`);
                const normalizePhone = (p) => p ? p.replace(/\D/g, '') : '';
                const normalizedCustomerPhone = normalizePhone(customerPhone);
                const last7 = normalizedCustomerPhone.slice(-7);

                if (last7.length >= 7) {
                    // Look for recently started calls
                    const candidates = await Order.find({
                        fulfillmentStatus: 'FULFILLED_CALL_STARTED'
                    }).sort({ updatedAt: -1 }).limit(10);

                    const phoneOrder = candidates.find(o => {
                        const pPhone = normalizePhone(o.parentPhone);
                        return pPhone.endsWith(last7);
                    });

                    if (phoneOrder) {
                        order = phoneOrder;
                        orderId = order._id;
                        console.log(`✅ Found order via phone number match: ${orderId}`);
                    }
                }
            }
        }

        if (!order) {
            console.error('❌ Could not identify order for this webhook.');
            // Fixed the ReferenceError crash here:
            if (payload.metadata) {
                console.error('Metadata keys:', Object.keys(payload.metadata));
            } else {
                console.error('No metadata in payload');
            }
            return successResponse;
        }

        // --- SAVE DATA ---
        // Ensure conversationId is set if we found order by other means
        if (!order.conversationId && conversation_id) {
            order.conversationId = conversation_id;
        }

        if (audio_url) order.audioUrl = audio_url;
        
        if (transcript) {
            if (Array.isArray(transcript)) {
                order.transcript = transcript.map(t => `${t.role === 'agent' ? 'Santa' : 'Child'}: ${t.message}`).join('\n');
            } else {
                order.transcript = transcript;
            }
        }
        
        if (duration_secs) order.callDuration = duration_secs;
        
        order.fulfillmentStatus = 'CALL_COMPLETED';
        await order.save();
        console.log(`Call data saved for order ${order._id}`);

        // --- TRIGGER EMAIL ---
        if (order.packageId === 'bundle') {
            console.log('Triggering bundle post-call email...');
            const emailFunction = require('./send-confirmation-email');
            
            // Ensure audioUrl is available for the email function
            if (!order.audioUrl) {
                console.warn("Warning: Triggering email but audioUrl is missing/null");
            }

            await emailFunction.handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    order_id: order._id.toString(),
                    email_type: 'bundle_post_call'
                })
            }, context);
            console.log(`Bundle post-call email logic executed for ${order.parentEmail}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'success', order_id: order._id })
        };

    } catch (error) {
        console.error('SAVE CALL DATA ERROR:', error);
        return successResponse;
    }
};