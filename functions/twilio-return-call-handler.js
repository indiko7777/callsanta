const twilio = require('twilio');
const mongoose = require('mongoose');
const Order = require('./models/order');

// --- CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;
let baseUrl = process.env.BASE_URL || '';
if (!baseUrl.endsWith('/')) {
    baseUrl += '/';
}
const BASE_URL = baseUrl;

// --- AUDIO PATHS ---
const AUDIO_INPUT_PROMPT = `${BASE_URL}audio/greeting.mp3`;
const AUDIO_TIMEOUT = `${BASE_URL}audio/audio timeout.mp3`;
const AUDIO_INVALID_CODE = `${BASE_URL}audio/invalid.mp3`;
const AUDIO_SUCCESS = `${BASE_URL}audio/sucess.mp3`;

// --- DATABASE CONNECTION ---
let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
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

// --- MAIN HANDLER FOR RETURN CALLS ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    console.log("Incoming Return Call Event:", JSON.stringify(event.body));

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
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say("We are experiencing a high volume of calls at the North Pole. Please try again in a few minutes.");
        twiml.hangup();
        return respond(twiml);
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
    const digits = body.get('Digits');

    // --- STEP 1: INITIAL GATHER ---
    if (!digits) {
        const gather = twiml.gather({
            action: '/.netlify/functions/twilio-return-call-handler',
            numDigits: 4,
            timeout: 8
        });

        gather.play(AUDIO_INPUT_PROMPT);
        twiml.play(AUDIO_TIMEOUT);
        twiml.hangup();
        return respond(twiml);
    }

    // --- STEP 2: CODE LOOKUP & VALIDATION ---
    const accessCode = digits;
    console.log(`Received Return Call Code: ${accessCode}`);

    const paddedCode = accessCode.padStart(4, '0');

    let order;
    try {
        // Look for order with this RETURN CALL access code
        order = await Order.findOne({ returnCallAccessCode: paddedCode });
        console.log("Return Call Order Found:", order ? order._id : "NULL");
    } catch (err) {
        console.error("Error finding return call order:", err);
        twiml.say("There was a problem checking your code. Please try again.");
        twiml.hangup();
        return respond(twiml);
    }

    // Validate that this is a return call order
    if (!order || !order.returnCallAccessCode || order.returnCallUsed) {
        console.log("Invalid Return Call Code or Already Used:", order ? order.returnCallAccessCode : "No Order");
        twiml.play(AUDIO_INVALID_CODE);
        twiml.hangup();
        return respond(twiml);
    }

    // --- STEP 3: CONNECT TO ELEVENLABS RETURN CALL AGENT ---
    console.log("Connecting to ElevenLabs Return Call Agent via SIP...");

    twiml.play(AUDIO_SUCCESS);

    // Use the RETURN CALL SIP credentials
    const sipUri = `sip:santa-return@sip.rtc.elevenlabs.io:5060;transport=tcp`;

    const callerPhone = body.get('From');
    const dial = twiml.dial({
        callerId: process.env.TWILIO_RETURN_CALL_NUMBER || callerPhone
    });

    dial.sip({
        username: 'santa-return',
        password: 'Tenguiz10'
    }, sipUri + `?X-Access-Code=${order.returnCallAccessCode}&X-Order-Id=${order._id}&X-Customer-Phone=${encodeURIComponent(callerPhone)}`);

    twiml.say("Ho ho ho! The connection to the North Pole was lost. Merry Christmas!");

    // Mark the return call as USED
    await Order.updateOne({ _id: order._id }, {
        returnCallUsed: true,
        parentPhone: callerPhone
    });

    return respond(twiml);
};
