const twilio = require('twilio');
const mongoose = require('mongoose');
const Order = require('./models/order');

const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || '';
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

const AUDIO_INPUT_PROMPT = `${BASE_URL}/audio/greeting.mp3`;
const AUDIO_TIMEOUT = `${BASE_URL}/audio/audio timeout.mp3`;
const AUDIO_INVALID_CODE = `${BASE_URL}/audio/invalid.mp3`;
const AUDIO_SUCCESS = `${BASE_URL}/audio/sucess.mp3`;

let cachedDb = null;
const connectToDatabase = async (uri) => {
    if (cachedDb) return cachedDb;
    if (!uri) throw new Error("Database connection configuration missing.");
    const db = await mongoose.connect(uri, { bufferCommands: false });
    cachedDb = db;
    return db;
};

const respond = (twiml) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml.toString(),
});

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        await connectToDatabase(MONGODB_URI);
    } catch (e) {
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say("We are experiencing technical difficulties. Please try again later.");
        twiml.hangup();
        return respond(twiml);
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
    const digits = body.get('Digits');

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

    const paddedCode = digits.padStart(4, '0');

    let order;
    try {
        order = await Order.findOne({ accessCode: paddedCode });
    } catch (err) {
        twiml.say("There was a problem checking your code.");
        twiml.hangup();
        return respond(twiml);
    }

    if (!order || order.fulfillmentStatus !== 'PENDING_PAYMENT') {
        twiml.play(AUDIO_INVALID_CODE);
        twiml.hangup();
        return respond(twiml);
    }

    twiml.play(AUDIO_SUCCESS);

    const timeLimit = (order.overageOption === 'overage_accepted' || order.overageOption === 'unlimited') ? 1200 : 300;

    await Order.updateOne({ _id: order._id }, { fulfillmentStatus: 'FULFILLED_CALL_STARTED' });

    const dial = twiml.dial({ timeout: 30, timeLimit: timeLimit });

    dial.sip({
        username: 'phnum_5101kajevc1tf7q8rb8msvpmkmqd',
        password: 'Tenguiz10'
    }, `sip:phnum_5101kajevc1tf7q8rb8msvpmkmqd@sip.rtc.elevenlabs.io:5060;transport=tcp`);

    return respond(twiml);
};
