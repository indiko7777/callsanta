const twilio = require('twilio');
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;
// The BASE_URL environment variable (e.g., https://yourdomain.com) is crucial for audio paths.
const BASE_URL = process.env.BASE_URL;
// NOTE: REPLACE THIS WITH YOUR ACTUAL ELEVENLABS AGENT URL/ID
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

// --- AUDIO PATHS (Must be hosted at BASE_URL/audio/...) ---
// 1. Initial greeting and prompt to enter the code
const AUDIO_INPUT_PROMPT = `${BASE_URL}audio/greeting.mp3`;
// 2. Played if the user doesn't enter anything after 8 seconds
const AUDIO_TIMEOUT = `${BASE_URL}audio/audio timeout.mp3`;
// 3. Played if the code is invalid or already used
const AUDIO_INVALID_CODE = `${BASE_URL}audio/invalid.mp3`;
// 4. Played on successful code entry before connecting to the AI agent
const AUDIO_SUCCESS = `${BASE_URL}audio/sucess.mp3`;


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

    console.log("Incoming Call Event:", JSON.stringify(event.body));

    // Ensure BASE_URL is set for audio files
    if (!BASE_URL) {
        console.error("CRITICAL: BASE_URL is not set.");
        const twiml = new twilio.TwimlResponse();
        twiml.say("System configuration error. Please contact North Pole IT.");
        twiml.hangup();
        return respond(twiml);
    }

    try {
        await connectToDatabase(MONGODB_URI);
    } catch (e) {
        console.error("DATABASE CONNECTION ERROR:", e);
        // Fallback response if DB fails entirely (prevents hanging call)
        const twiml = new twilio.TwimlResponse();
        twiml.say("We are experiencing a high volume of calls at the North Pole. Please try again in a few minutes.");
        twiml.hangup();
        return respond(twiml);
    }

    const twiml = new twilio.TwimlResponse();
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
    const digits = body.get('Digits');

    // --- STEP 1: INITIAL GATHER (Using Combined Audio) ---
    if (!digits) {
        // Initial call flow: Ask for the 4-digit code using the combined audio
        const gather = twiml.gather({
            action: '/.netlify/functions/twilio-call-handler',
            numDigits: 4,
            timeout: 8
        });

        // Plays the combined greeting and prompt
        gather.play(AUDIO_INPUT_PROMPT);

        // Timeout/Failure fallback (executed if no digits are entered)
        twiml.play(AUDIO_TIMEOUT);
        twiml.hangup();
        return respond(twiml);
    }

    // --- STEP 2: CODE LOOKUP & VALIDATION ---
    const accessCode = digits;
    console.log(`Received Digits/Code: ${accessCode}`);

    // Important: Pad the access code if necessary based on your database storage format (assuming 4 digits)
    const paddedCode = accessCode.padStart(4, '0');

    let order;
    try {
        order = await Order.findOne({ accessCode: paddedCode });
        console.log("Order Found:", order ? order._id : "NULL");
    } catch (err) {
        console.error("Error finding order:", err);
        twiml.say("There was a problem checking your code. Please try again.");
        twiml.hangup();
        return respond(twiml);
    }

    if (!order || order.fulfillmentStatus !== 'PENDING_PAYMENT') {
        console.log("Invalid Code or Status:", order ? order.fulfillmentStatus : "No Order");
        // Code is invalid OR has already been used
        twiml.play(AUDIO_INVALID_CODE);
        twiml.hangup();
        return respond(twiml);
    }

    // --- STEP 3: SUCCESS - START ELEVENLABS AGENT (Using Success Audio) ---

    // Set Max Duration based on the parent's choice (5 min vs 2 hours)
    const maxDurationSeconds = (order.overageOption === 'auto_disconnect') ? 300 : 7200;

    // Construct the ElevenLabs WebSocket URL
    let streamUrl = '';
    const agentIdOrUrl = ELEVENLABS_AGENT_ID;

    if (!agentIdOrUrl) {
        console.error("CRITICAL: ELEVENLABS_AGENT_ID is missing.");
        twiml.say("Santa is having trouble connecting. Please contact support.");
        twiml.hangup();
        return respond(twiml);
    }

    if (agentIdOrUrl.startsWith('wss://')) {
        streamUrl = agentIdOrUrl;
    } else {
        // It's just the ID, construct the standard URL
        streamUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentIdOrUrl}`;
    }

    // Build personalization parameters
    const params = new URLSearchParams({
        childName: order.childName,
        wish: order.childWish,
        deed: order.childDeed,
        overage: order.overageOption,
        orderId: order._id.toString()
    });

    // Append parameters to the URL (handling existing query params correctly)
    const separator = streamUrl.includes('?') ? '&' : '?';
    const finalStreamUrl = `${streamUrl}${separator}${params.toString()}`;

    console.log("Connecting to ElevenLabs...");

    // Play pre-recorded connecting audio before streaming the AI
    twiml.play(AUDIO_SUCCESS);

    // Twilio <Connect> <Stream> is used for low-latency AI conversation
    twiml.connect().stream({
        url: finalStreamUrl,
        maxDuration: maxDurationSeconds
    });

    // Mark the code as USED immediately to prevent replay
    await Order.updateOne({ _id: order._id }, { fulfillmentStatus: 'FULFILLED_CALL_STARTED' });

    return respond(twiml);
};