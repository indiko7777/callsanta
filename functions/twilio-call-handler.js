const twilio = require('twilio');
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;
// The BASE_URL environment variable (e.g., https://yourdomain.com) is crucial for audio paths.
let baseUrl = process.env.BASE_URL || '';
if (!baseUrl.endsWith('/')) {
    baseUrl += '/';
}
const BASE_URL = baseUrl;
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
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say("System configuration error. Please contact North Pole IT.");
        twiml.hangup();
        return respond(twiml);
    }

    try {
        await connectToDatabase(MONGODB_URI);
    } catch (e) {
        console.error("DATABASE CONNECTION ERROR:", e);
        // Fallback response if DB fails entirely (prevents hanging call)
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say("We are experiencing a high volume of calls at the North Pole. Please try again in a few minutes.");
        twiml.hangup();
        return respond(twiml);
    }

    const twiml = new twilio.twiml.VoiceResponse();
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

    // --- STEP 3: SUCCESS - CONNECT TO ELEVENLABS AGENT (Using SIP) ---
    // We use SIP Trunking because direct WebSocket (<Stream>) requires a relay server to translate protocols.
    // SIP allows Twilio to call ElevenLabs directly.

    if (!ELEVENLABS_AGENT_ID) {
        console.error("CRITICAL: ELEVENLABS_AGENT_ID is missing.");
        twiml.say("Santa is having trouble connecting. Please contact support.");
        twiml.hangup();
        return respond(twiml);
    }

    console.log("Connecting to ElevenLabs via SIP...");

    // Play pre-recorded connecting audio before dialing
    twiml.play(AUDIO_SUCCESS);

    // --- PREPARE CONTEXT FOR ELEVENLABS ---
    const overageOption = order.overageOption || 'auto_disconnect';

    // Determine Time Limit (Hard Stop)
    let timeLimit = 300; // Default 5 mins
    if (overageOption === 'overage_accepted' || overageOption === 'unlimited') {
        timeLimit = 1200; // 20 mins max for safety
        console.log("Extended time limit applied.");
    } else {
        console.log("Applying 5-minute time limit.");
    }

    // --- DIAL ELEVENLABS VIA SIP WITH TCP TRANSPORT ---
    const dial = twiml.dial({
        timeout: 30,
        timeLimit: timeLimit
    });

    // Mark order as call started BEFORE dialing so webhook can find it
    await Order.updateOne({ _id: order._id }, { fulfillmentStatus: 'FULFILLED_CALL_STARTED' });

    // SIP URI with TCP transport to avoid UDP packet size limitations (Twilio error 32011)
    // CRITICAL: Use ;transport=tcp to force TCP instead of UDP
    // Pass minimal identifier (Order ID) so ElevenLabs can fetch context via webhook
    // This is MUCH smaller than passing all children context (which caused error 32011)
    const sipUri = `sip:${ELEVENLABS_AGENT_ID}@sip.rtc.elevenlabs.io;transport=tcp` +
        `?X-Order-ID=${encodeURIComponent(order._id.toString())}` +
        `&X-Access-Code=${encodeURIComponent(paddedCode)}`;

    console.log(`Dialing ElevenLabs with Order ID: ${order._id}`);

    // Use SIP dial with minimal identifying headers
    // Full context is delivered via ElevenLabs' webhook to get-call-context endpoint
    dial.sip(sipUri);

    return respond(twiml);
};