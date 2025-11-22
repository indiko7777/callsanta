const mongoose = require('mongoose');
const Order = require('./models/order');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const ELEVENLABS_API_KEY = process.env.Elevenlabs_API;
let DID_API_KEY = process.env['D-ID_APIKEY'];

// Ensure D-ID Key is properly formatted for Basic Auth
if (DID_API_KEY && !DID_API_KEY.startsWith('Basic ')) {
    // If it doesn't start with Basic, assume it's the raw key and encode it
    DID_API_KEY = `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`;
}

// Using a reliable public image of Santa for D-ID generation to avoid 500 errors
// Unsplash is usually reliable for bots
const SANTA_IMAGE_URL = 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

const ELEVENLABS_VOICE_ID = 'uDsPstFWFBUXjIBimV7s'; // Updated Santa Voice ID

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

// --- 1. SCRIPT GENERATION ---
function generateSantaScript(childName, childWish, childDeed) {
    // Clean inputs
    const name = childName.trim();
    const wish = childWish.trim();
    const deed = childDeed.trim();

    return `Ho ho ho! Hello ${name}! It is Santa Claus here at the North Pole. The elves told me you have been very good this year, especially for ${deed}. That makes me so happy! I also heard you are wishing for ${wish}. My reindeer and I are getting ready to fly, so keep being wonderful. Merry Christmas, ${name}!`;
}

// --- 2. AUDIO GENERATION (ElevenLabs) ---
async function generateAudio(text) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
                stability: 0.6,
                similarity_boost: 0.7,
            }
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`ElevenLabs API Error: ${err}`);
    }

    // Get buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
}

// --- D-ID HELPER: CHECK AUTH ---
async function checkDidAuth() {
    try {
        const response = await fetch('https://api.d-id.com/credits', {
            method: 'GET',
            headers: {
                'Authorization': DID_API_KEY,
            },
        });
        if (!response.ok) {
            const err = await response.text();
            console.error("D-ID Auth Check Failed:", err);
            return false;
        }
        const data = await response.json();
        console.log("D-ID Auth Success. Credits remaining:", JSON.stringify(data));
        return true;
    } catch (e) {
        console.error("D-ID Auth Check Error:", e);
        return false;
    }
}

// --- 3. VIDEO GENERATION (D-ID) ---
// Using D-ID with ElevenLabs voice provider
async function createTalk(imageUrl, scriptText) {
    console.log("Sending request to D-ID with Auth header length:", DID_API_KEY ? DID_API_KEY.length : 'MISSING');

    // Pre-check Auth
    const isAuthValid = await checkDidAuth();
    if (!isAuthValid) {
        throw new Error("D-ID Authentication Failed. Check API Key.");
    }

    const payload = {
        source_url: imageUrl,
        script: {
            type: 'text',
            input: scriptText,
            provider: {
                type: 'elevenlabs',
                voice_id: ELEVENLABS_VOICE_ID
            }
        }
    };

    console.log("D-ID Request Payload:", JSON.stringify(payload));

    const response = await fetch('https://api.d-id.com/talks', {
        method: 'POST',
        headers: {
            'Authorization': DID_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("D-ID API Error Response:", err);
        throw new Error(`D-ID Create Talk Error: ${err}`);
    }

    const data = await response.json();
    console.log("D-ID Talk Created:", data);
    return data.id;
}

async function getTalkStatus(talkId) {
    const response = await fetch(`https://api.d-id.com/talks/${talkId}`, {
        method: 'GET',
        headers: {
            'Authorization': DID_API_KEY,
        },
    });

    if (!response.ok) {
        throw new Error(`D-ID Get Status Error: ${response.statusText}`);
    }

    return await response.json();
}

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.sendgrid_API);

// --- 4. EMAIL NOTIFICATION (SendGrid) ---
async function sendVideoEmail(email, childName, videoUrl) {
    const msg = {
        to: email,
        from: 'santa@callsanta.us', // Change to your verified sender
        subject: `Santa has a video message for ${childName}!`,
        text: `Ho ho ho! Santa has recorded a special video just for ${childName}. Watch it here: ${videoUrl}`,
        html: `
            <div style="font-family: sans-serif; text-align: center; color: #333;">
                <h1 style="color: #D42426;">Santa's Video is Ready! 🎅</h1>
                <p>Ho ho ho! I've made a special video message just for <strong>${childName}</strong>.</p>
                <p>Click the button below to watch it:</p>
                <a href="${videoUrl}" style="display: inline-block; background-color: #D42426; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0;">Watch Video</a>
                <p>Or copy this link: <a href="${videoUrl}">${videoUrl}</a></p>
                <p>Merry Christmas!</p>
            </div>
        `,
    };
    try {
        await sgMail.send(msg);
        console.log(`Email sent to ${email}`);
    } catch (error) {
        console.error('SendGrid Error:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
}

// --- HANDLER ---
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    const { order_id } = JSON.parse(event.body || '{}');

    if (!order_id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing order_id' }) };
    }

    try {
        await connectToDatabase(process.env.MONGODB_URI);
        const order = await Order.findById(order_id);

        if (!order) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        // 1. If already completed, return URL
        if (order.videoStatus === 'completed' && order.videoUrl) {
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'completed', video_url: order.videoUrl })
            };
        }

        // 2. If processing, check status
        if (order.videoStatus === 'processing' && order.didId) {
            console.log(`Checking D-ID status for ${order.didId}...`);
            const statusData = await getTalkStatus(order.didId);
            console.log(`D-ID Status: ${statusData.status}`);

            if (statusData.status === 'done') {
                order.videoStatus = 'completed';
                order.videoUrl = statusData.result_url;
                await order.save();

                // Send Email
                await sendVideoEmail(order.parentEmail, order.childName, order.videoUrl);

                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'completed', video_url: order.videoUrl })
                };
            } else if (statusData.status === 'error') {
                console.error("D-ID Error Detail:", statusData);
                order.videoStatus = 'failed';
                await order.save();
                return {
                    statusCode: 500,
                    body: JSON.stringify({ status: 'failed', error: 'D-ID generation failed' })
                };
            } else {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'processing' })
                };
            }
        }

        // 3. If pending, start generation
        if (order.videoStatus === 'pending' || !order.videoStatus) {
            console.log(`Starting generation for Order ${order._id}`);

            // Generate Script
            const script = generateSantaScript(order.childName, order.childWish, order.childDeed);
            console.log("Script generated:", script);

            // Generate Audio
            console.log("Generating Audio...");
            const audioDataUrl = await generateAudio(script);
            console.log("Audio generated.");

            // Start Video Generation
            console.log(`Starting D-ID Talk with image: ${SANTA_IMAGE_URL}`);
            const talkId = await createTalk(SANTA_IMAGE_URL, audioDataUrl);
            console.log(`D-ID Talk started: ${talkId}`);

            // Update Order
            order.videoStatus = 'processing';
            order.didId = talkId;
            await order.save();

            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'processing' })
            };
        }

        return { statusCode: 200, body: JSON.stringify({ status: order.videoStatus }) };

    } catch (error) {
        console.error('VIDEO GENERATION ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
