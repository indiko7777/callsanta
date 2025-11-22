const mongoose = require('mongoose');
const Order = require('./models/order');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const ELEVENLABS_API_KEY = process.env.Elevenlabs_API;
const HEYGEN_API_KEY = process.env.Heygen_APIKEY;

// Using user's Santa image
const SITE_URL = process.env.URL || 'https://callsanta.us';
const SANTA_IMAGE_URL = `${SITE_URL}/images/santaface.jpg`;

const ELEVENLABS_VOICE_ID = 'uDsPstFWFBUXjIBimV7s'; // Santa Voice ID
const SANTA_VOICE_ID = ELEVENLABS_VOICE_ID; // Alias for HeyGen integration


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
    const name = childName.trim();
    const wish = childWish.trim();
    const deed = childDeed.trim();

    // Shorter script to save ElevenLabs credits
    return `Ho ho ho! Hello ${name}! You've been so good this year, especially for ${deed}. I heard you're wishing for ${wish}. Keep being wonderful! Merry Christmas!`;
}

// --- 2. AUDIO GENERATION (ElevenLabs) - WAV format for better quality ---
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
            },
            output_format: "mp3_44100_128" // High quality MP3
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`ElevenLabs API Error: ${err}`);
    }

    // Get buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
}

// --- 3. VIDEO GENERATION (HeyGen) ---
// Using manually uploaded HeyGen Photo Avatar ID
const HEYGEN_AVATAR_ID = '02f60da9d3d44068a0322d63c1e34870';

async function createHeyGenVideo(scriptText) {
    console.log("Creating HeyGen video with avatar ID:", HEYGEN_AVATAR_ID);
    console.log("Using script text:", scriptText);

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: {
            'X-Api-Key': HEYGEN_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_inputs: [{
                character: {
                    type: "talking_photo",
                    talking_photo_id: HEYGEN_AVATAR_ID
                },
                voice: {
                    type: "text",
                    input_text: scriptText,
                    voice_id: "3845f01de6254fe9b5d5cf3342a64a1e"
                },
                background: {
                    type: "color",
                    value: "#FFFFFF"
                }
            }],
            dimension: {
                width: 1920,
                height: 1080
            },
            aspect_ratio: "16:9",
            test: false,
            caption: false
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("HeyGen API Error Response:", err);
        throw new Error(`HeyGen Create Video Error: ${err}`);
    }

    const data = await response.json();
    console.log("HeyGen Video Created:", data);
    return data.data.video_id;
}

async function getHeyGenVideoStatus(videoId) {
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
        method: 'GET',
        headers: {
            'X-Api-Key': HEYGEN_API_KEY,
        },
    });

    if (!response.ok) {
        throw new Error(`HeyGen Get Status Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
}

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.sendgrid_API);

// --- 4. EMAIL NOTIFICATION (SendGrid) ---
async function sendVideoEmail(email, childName, videoUrl) {
    const msg = {
        to: email,
        from: 'santa@callsanta.us',
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
        if (order.videoStatus === 'processing' && order.heygenVideoId) {
            console.log(`Checking HeyGen status for ${order.heygenVideoId}...`);
            const statusData = await getHeyGenVideoStatus(order.heygenVideoId);
            console.log(`HeyGen Status: ${statusData.status}`);

            if (statusData.status === 'completed') {
                order.videoStatus = 'completed';
                order.videoUrl = statusData.video_url;
                await order.save();

                // Send Email
                await sendVideoEmail(order.parentEmail, order.childName, order.videoUrl);

                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'completed', video_url: order.videoUrl })
                };
            } else if (statusData.status === 'failed') {
                console.error("HeyGen Error Detail:", statusData);
                order.videoStatus = 'failed';
                await order.save();
                return {
                    statusCode: 500,
                    body: JSON.stringify({ status: 'failed', error: 'HeyGen generation failed' })
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

            // SAFEGUARD: Mark as processing IMMEDIATELY to prevent duplicate calls
            order.videoStatus = 'processing';
            await order.save();

            try {
                // Generate Script
                const script = generateSantaScript(order.childName, order.childWish, order.childDeed);
                console.log("Script generated:", script);

                // Start Video Generation (HeyGen with text-to-speech)
                console.log(`Starting HeyGen Video with avatar ID: ${HEYGEN_AVATAR_ID}`);
                const videoId = await createHeyGenVideo(script);
                console.log(`HeyGen Video started: ${videoId}`);

                // Update Order with video ID
                order.heygenVideoId = videoId;
                await order.save();

                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'processing' })
                };
            } catch (error) {
                // CRITICAL: Mark as FAILED to stop retries and prevent API abuse
                console.error('Generation failed:', error);
                order.videoStatus = 'failed';
                order.errorMessage = error.message;
                await order.save();

                throw error; // Re-throw to be caught by outer handler
            }
        }

        // If status is 'failed', return failed status (don't retry)
        if (order.videoStatus === 'failed') {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    status: 'failed',
                    error: order.errorMessage || 'Video generation failed'
                })
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
