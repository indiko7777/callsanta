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
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    const successResponse = { statusCode: 200, body: JSON.stringify({ status: 'received' }) };

    if (event.httpMethod !== 'POST') return successResponse;

    const signature = event.headers['x-elevenlabs-signature'] || event.headers['X-ElevenLabs-Signature'];
    
    // We verify but don't block on failure to ensure we can debug during setup
    if (!verifyWebhookSignature(event.body, signature, process.env.ELEVENLABS_WEBHOOK_SECRET)) {
        console.error('⚠️ Invalid or missing webhook signature (proceeding for debug)');
    }

    try {
        const rawPayload = JSON.parse(event.body || '{}');
        const payload = rawPayload.data ? rawPayload.data : rawPayload;
        
        // 1. Extract Key Information
        const conversation_id = payload.conversation_id;
        const transcript = payload.transcript;
        const audio_url = payload.audio_url;
        
        console.log(`Incoming Webhook for Conversation: ${conversation_id}, Type: ${rawPayload.type}`);

        // 2. Connect to DB
        await connectToDatabase(process.env.MONGODB_URI);

        let orderId = null;
        let order = null;

        // --- STEP A: Look for Order ID passed through Dynamic Variables (The Bulletproof Link) ---
        if (payload.conversation_initiation_client_data && 
            payload.conversation_initiation_client_data.dynamic_variables &&
            payload.conversation_initiation_client_data.dynamic_variables.order_id) {
            
            orderId = payload.conversation_initiation_client_data.dynamic_variables.order_id;
            console.log(`🎯 Found Pass-Through Order ID: ${orderId}`);
        }

        if (orderId) {
            order = await Order.findById(orderId);
        }

        // --- STEP B: Fallback to Database Conversation Match ---
        if (!order && conversation_id) {
            order = await Order.findOne({ conversationId: conversation_id });
            if (order) console.log(`✅ Found order via conversation_id: ${order._id}`);
        }

        // --- STEP C: Fallback to Phone Number (Only works if numbers match) ---
        if (!order) {
            let customerPhone = null;
            if (payload.metadata && payload.metadata.phone_call) {
                customerPhone = payload.metadata.phone_call.external_number;
            } else if (payload.phone_call) {
                customerPhone = payload.phone_call.external_number;
            } else if (payload.conversation_initiation_client_data && payload.conversation_initiation_client_data.dynamic_variables) {
                customerPhone = payload.conversation_initiation_client_data.dynamic_variables.system__caller_id;
            } else if (payload.caller_id) {
                customerPhone = payload.caller_id;
            }

            if (customerPhone) {
                console.log(`Attempting phone lookup for: ${customerPhone}`);
                const normalizePhone = (p) => p ? p.replace(/\D/g, '') : '';
                const targetPhone = normalizePhone(customerPhone);
                const last7 = targetPhone.slice(-7);

                if (last7.length >= 7) {
                    const candidates = await Order.find({
                        fulfillmentStatus: 'FULFILLED_CALL_STARTED'
                    }).sort({ updatedAt: -1 }).limit(5);

                    const phoneOrder = candidates.find(o => {
                        const dbPhone = normalizePhone(o.parentPhone);
                        return dbPhone.endsWith(last7);
                    });

                    if (phoneOrder) {
                        order = phoneOrder;
                        console.log(`✅ Found order via Phone Number match: ${order._id}`);
                    }
                }
            }
        }

        if (!order) {
            console.error('❌ FINAL ERROR: Could not identify order. Data saved to logs only.');
            return successResponse;
        }

        // 3. Save Data to Order
        if (conversation_id && !order.conversationId) {
            order.conversationId = conversation_id;
        }
        if (audio_url) {
            order.audioUrl = audio_url;
            console.log("🎙️ Audio URL saved.");
        }
        if (transcript) {
            if (Array.isArray(transcript)) {
                order.transcript = transcript
                    .map(t => `${t.role === 'agent' ? 'Santa' : 'Child'}: ${t.message}`)
                    .join('\n');
            } else {
                order.transcript = transcript;
            }
        }
        
        // Update duration
        let duration_secs = payload.duration_secs;
        if (!duration_secs && payload.metadata) {
            duration_secs = payload.metadata.call_duration_secs;
        }
        if (duration_secs) order.callDuration = duration_secs;

        order.fulfillmentStatus = 'CALL_COMPLETED';
        await order.save();

        // 4. Send the Email (Only for Bundles and only if we have audio)
        if (order.packageId === 'bundle') {
            // Logic: If this is an audio payload OR we already have audio saved
            const hasAudio = audio_url || order.audioUrl;
            
            if (hasAudio) {
                console.log('📧 Triggering bundle post-call email...');
                const emailFunction = require('./send-confirmation-email');
                await emailFunction.handler({
                    httpMethod: 'POST',
                    body: JSON.stringify({
                        order_id: order._id.toString(),
                        email_type: 'bundle_post_call'
                    })
                }, context);
            } else {
                console.log("⏳ Waiting for Audio URL before sending email (received transcription only).");
            }
        }

        return successResponse;

    } catch (error) {
        console.error('SAVE CALL DATA FATAL ERROR:', error);
        return successResponse;
    }
};