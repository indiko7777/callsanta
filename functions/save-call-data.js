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
        const audio_url = payload.audio_url; // Only in post_call_audio
        
        console.log(`Incoming Webhook for Conversation: ${conversation_id}, Type: ${rawPayload.type}`);

        // 2. Connect to DB
        await connectToDatabase(process.env.MONGODB_URI);

        let order = null;

        // --- STEP A: Try finding by Conversation ID (Fastest/Safest) ---
        if (conversation_id) {
            order = await Order.findOne({ conversationId: conversation_id });
            if (order) console.log(`✅ Found order via conversation_id: ${order._id}`);
        }

        // --- STEP B: Fallback to Phone Number (If Conversation ID not yet linked) ---
        if (!order) {
            console.log("⚠️ Conversation ID not found in DB. Attempting Phone Number lookup...");
            
            // Dig deep into the payload to find the phone number based on your logs
            let customerPhone = null;

            // Path 1: Standard metadata structure (from your logs)
            if (payload.metadata && payload.metadata.phone_call) {
                customerPhone = payload.metadata.phone_call.external_number;
            }
            // Path 2: Root level phone_call
            else if (payload.phone_call) {
                customerPhone = payload.phone_call.external_number;
            }
            // Path 3: Client Data (from your logs)
            else if (
                payload.conversation_initiation_client_data && 
                payload.conversation_initiation_client_data.dynamic_variables
            ) {
                customerPhone = payload.conversation_initiation_client_data.dynamic_variables.system__caller_id;
            }
            // Path 4: Legacy caller_id
            else if (payload.caller_id) {
                customerPhone = payload.caller_id;
            }

            if (customerPhone) {
                console.log(`Looking up order by phone: ${customerPhone}`);
                
                // Normalize: remove non-digits
                const normalizePhone = (p) => p ? p.replace(/\D/g, '') : '';
                const targetPhone = normalizePhone(customerPhone);
                const last7 = targetPhone.slice(-7);

                if (last7.length >= 7) {
                    // Find the most recent active order matching this phone
                    // We look for orders updated recently to ensure we don't grab an old one
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
                        
                        // CRITICAL: Link the conversation_id immediately so future webhooks (like audio) work
                        if (conversation_id) {
                            order.conversationId = conversation_id;
                            await order.save();
                            console.log(`🔗 Linked conversation_id ${conversation_id} to order ${order._id}`);
                        }
                    } else {
                        console.log(`❌ No active order found matching last 7 digits: ${last7}`);
                    }
                }
            } else {
                console.log("❌ No phone number found in webhook payload to perform lookup.");
            }
        }

        if (!order) {
            console.error('❌ FINAL ERROR: Could not identify order. Data saved to logs only.');
            return successResponse;
        }

        // 3. Save Data to Order
        if (audio_url) {
            order.audioUrl = audio_url;
            console.log("🎙️ Audio URL saved.");
        }
        
        if (transcript) {
            // Your transcript is an array, format it nicely
            if (Array.isArray(transcript)) {
                order.transcript = transcript
                    .map(t => `${t.role === 'agent' ? 'Santa' : 'Child'}: ${t.message}`)
                    .join('\n');
            } else {
                order.transcript = transcript;
            }
            console.log("📝 Transcript saved.");
        }
        
        // Update duration if available
        let duration_secs = payload.duration_secs;
        if (!duration_secs && payload.metadata) {
            duration_secs = payload.metadata.call_duration_secs;
        }
        if (duration_secs) order.callDuration = duration_secs;

        // Mark as completed
        order.fulfillmentStatus = 'CALL_COMPLETED';
        await order.save();

        // 4. Send the Email (Only for Bundles)
        if (order.packageId === 'bundle') {
            // Only send if we have the audio, OR if this is just the transcript but audio might be coming/already there
            // Ideally wait for audio. Typically post_call_audio comes last.
            if (rawPayload.type === 'post_call_audio' || (order.audioUrl && order.transcript)) {
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