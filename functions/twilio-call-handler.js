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
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

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
    const db = await mongoose.connect(uri, { bufferCommands: false });
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
            action: '/.netlify/functions/twilio-call-handler',
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
    console.log(`Received Digits/Code: ${accessCode}`);
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
        twiml.play(AUDIO_INVALID_CODE);
        twiml.hangup();
        return respond(twiml);
    }

    // --- STEP 3: CONNECT TO ELEVENLABS VIA WEBSOCKET ---
    if (!ELEVENLABS_AGENT_ID) {
        console.error("CRITICAL: ELEVENLABS_AGENT_ID is missing.");
        twiml.say("Santa is having trouble connecting. Please contact support.");
        twiml.hangup();
        return respond(twiml);
    }

    console.log("Connecting to ElevenLabs via WebSocket Stream...");
    twiml.play(AUDIO_SUCCESS);

    const overageOption = order.overageOption || 'auto_disconnect';
    let timeLimit = 300; // Default 5 mins
    if (overageOption === 'overage_accepted' || overageOption === 'unlimited') {
        timeLimit = 1200; // 20 mins max
        console.log("Extended time limit applied.");
    }

    // Mark order as started
    await Order.updateOne({ _id: order._id }, { fulfillmentStatus: 'FULFILLED_CALL_STARTED' });

    // Prepare context to send in the signed URL
    const children = order.children || [];
    if (children.length === 0 && order.childName) {
        children.push({
            name: order.childName,
            wish: order.childWish || 'something special',
            deed: order.childDeed || 'being good'
        });
    }

    const childCount = children.length > 0 ? children.length : 1;
    const childrenContext = children.map((child, index) => {
        return `Child ${index + 1}: Name: ${child.name}, Wish: ${child.wish}, Good Deed: ${child.deed}`;
    }).join('. ');

    const nplTime = new Date().toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

    const today = new Date();
    const currentYear = today.getFullYear();
    let christmas = new Date(Date.UTC(currentYear, 11, 25));
    if (today.getTime() > christmas.getTime()) {
        christmas.setUTCFullYear(currentYear + 1);
    }
    const oneDay = 1000 * 60 * 60 * 24;
    const daysUntilChristmas = Math.ceil((christmas.getTime() - today.getTime()) / oneDay);

    // Build context object for ElevenLabs
    const conversationConfig = {
        agent_id: ELEVENLABS_AGENT_ID,
        child_count: childCount,
        children_context: childrenContext,
        npl_time: nplTime,
        days_until_christmas: daysUntilChristmas,
        call_overage_option: overageOption
    };

    console.log('ElevenLabs Config:', conversationConfig);

    // Start WebSocket stream to ElevenLabs
    // ElevenLabs will receive audio via WebSocket instead of SIP
    const connect = twiml.connect();
    const stream = connect.stream({
        url: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`,
        track: 'both_tracks'
    });

    // Pass custom parameters (if supported by ElevenLabs)
    stream.parameter({ name: 'child_count', value: childCount.toString() });
    stream.parameter({ name: 'children_context', value: childrenContext });
    stream.parameter({ name: 'npl_time', value: nplTime });
    stream.parameter({ name: 'days_until_christmas', value: daysUntilChristmas.toString() });
    stream.parameter({ name: 'call_overage_option', value: overageOption });
    stream.parameter({ name: 'order_id', value: order._id.toString() });

    console.log(`Streaming to ElevenLabs agent: ${ELEVENLABS_AGENT_ID}`);

    // Set call timeout
    setTimeout(() => {
        console.log('Call time limit reached');
    }, timeLimit * 1000);

    return respond(twiml);
};