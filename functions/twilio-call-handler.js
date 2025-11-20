const twilio = require('twilio');
const mongoose = require('mongoose');
const Order = require('./models/order'); 

// --- CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI; 
// The BASE_URL environment variable (e.g., https://yourdomain.com) is crucial for audio paths.
const BASE_URL = process.env.BASE_URL; 
// NOTE: REPLACE THIS WITH YOUR ACTUAL ELEVENLABS AGENT URL/ID
const ELEVENLABS_AGENT_URL =process.env.ELEVENLABS_AGENT_ID

// --- AUDIO PATHS (Must be hosted at BASE_URL/audio/...) ---
const AUDIO_GREETING = `${BASE_URL}/audio/welcome_santa_hotline.mp3`; 
const AUDIO_PROMPT = `${BASE_URL}/audio/enter_access_code.mp3`; 
const AUDIO_TIMEOUT = `${BASE_URL}/audio/sorry_didnt_hear.mp3`; 
const AUDIO_INVALID_CODE = `${BASE_URL}/audio/invalid_code.mp3`; 
const AUDIO_CONNECTING = `${BASE_URL}/audio/thank_you_connecting.mp3`; 


// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    
    // Check if MongoDB URI is available
    if (!uri) {
        console.error("MONGODB_URI is not set.");
        throw new Error("Database connection configuration missing.");
    }

    const db = await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        bufferCommands: false,
    });
    cachedDb = db;
    return db;
};

// --- TwiML Generator ---
const respond = (twiml) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml.toString(),
});

// --- MAIN HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Ensure BASE_URL is set for audio files
    if (!BASE_URL) {
        const twiml = new twilio.TwimlResponse();
        twiml.say("System configuration error. Please contact North Pole IT.");
        twiml.hangup();
        return respond(twiml);
    }

    try {
        await connectToDatabase(MONGODB_URI);
    } catch (e) {
        // Fallback response if DB fails entirely (prevents hanging call)
        const twiml = new twilio.TwimlResponse();
        twiml.say("We are experiencing a high volume of calls at the North Pole. Please try again in a few minutes.");
        twiml.hangup();
        return respond(twiml);
    }

    const twiml = new twilio.TwimlResponse();
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
    const digits = body.get('Digits'); 
    
    // --- STEP 1: INITIAL GATHER or RETRY (Using Pre-recorded Audio) ---
    if (!digits) {
        // Initial call flow: Ask for the 4-digit code using high-quality audio
        twiml.play(AUDIO_GREETING);

        const gather = twiml.gather({
            action: '/.netlify/functions/twilio-call-handler', 
            numDigits: 4,
            timeout: 8
        });
        
        gather.play(AUDIO_PROMPT);
        
        // Timeout/Failure fallback
        twiml.play(AUDIO_TIMEOUT);
        twiml.hangup();
        return respond(twiml);
    }
    
    // --- STEP 2: CODE LOOKUP & VALIDATION ---
    const accessCode = digits;

    // Important: Pad the access code if necessary based on your database storage format (assuming 4 digits)
    const paddedCode = accessCode.padStart(4, '0');
    
    const order = await Order.findOne({ accessCode: paddedCode });

    if (!order || order.fulfillmentStatus !== 'PENDING_PAYMENT') {
        // Code is invalid OR has already been used
        twiml.play(AUDIO_INVALID_CODE);
        twiml.hangup();
        return respond(twiml);
    }
    
    // --- STEP 3: SUCCESS - START ELEVENLABS AGENT (Using Pre-recorded Audio) ---
    
    // Set Max Duration based on the parent's choice (5 min vs 2 hours)
    // NOTE: Max duration is in seconds for Twilio
    const maxDurationSeconds = (order.overageOption === 'auto_disconnect') ? 300 : 7200; 

    // Build the query string to pass personalization data to the ElevenLabs Agent
    const queryParams = new URLSearchParams({
        childName: order.childName,
        wish: order.childWish,
        deed: order.childDeed,
        overage: order.overageOption,
        orderId: order._id.toString()
    }).toString();
    
    // Play pre-recorded connecting audio before streaming the AI
    twiml.play(AUDIO_CONNECTING);
    
    // Twilio <Connect> <Stream> is used for low-latency AI conversation
    twiml.connect().stream({ 
        url: ELEVENLABS_AGENT_URL + '?' + queryParams, // Pass params directly in the stream URL
        maxDuration: maxDurationSeconds // Max length of the conversation
    });

    // Mark the code as USED immediately to prevent replay
    await Order.updateOne({ _id: order._id }, { fulfillmentStatus: 'FULFILLED_CALL_STARTED' });
    
    return respond(twiml);
};