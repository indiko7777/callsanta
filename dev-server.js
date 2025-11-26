// dev-server.js
// Simple Express wrapper to run serverless functions locally
// Usage: set your env vars in .env, then run: npm run dev-server

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('--- ENV DEBUG ---');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'MISSING');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'SET' : 'MISSING');
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET' : 'MISSING');
console.log('-----------------');

const app = express();

// Parse JSON bodies (for Stripe/Frontend)
app.use(bodyParser.json());
// Parse URL-encoded bodies (for Twilio) - extended: true is important
app.use(bodyParser.urlencoded({ extended: true }));

// --- LOAD FUNCTIONS ---
const createPaymentIntent = require('./functions/create-payment-intent').handler;
const twilioCallHandler = require('./functions/twilio-call-handler').handler;
const callBillingWebhook = require('./functions/call-billing-webhook').handler;
const getOrderDetails = require('./functions/get-order-details').handler;

// --- HELPER: ADAPT EXPRESS TO LAMBDA EVENT ---
const adaptRequest = (req) => {
    return {
        httpMethod: req.method,
        headers: req.headers || {},
        body: req.method === 'GET' ? null : (req.is('application/json') ? JSON.stringify(req.body) : req.body), // Keep object for URL-encoded if not JSON stringified yet? Actually Twilio handler expects URLSearchParams or string. 
        // NOTE: In the handlers, we used `new URLSearchParams(event.body)`. 
        // If body-parser parses it to an object, we might need to convert it back to a query string or handle it.
        // Let's pass the raw body string for Twilio if possible, or reconstruct it.
        // A safer bet for local dev with body-parser active is to pass the parsed body if the handler supports it, 
        // BUT our handlers expect `event.body` to be a string (JSON or URL-encoded string).
        // So we need to be careful here.
        queryStringParameters: req.query || {},
        path: req.path
    };
};

// We need raw body for Twilio signature validation if we were doing that, 
// but our handlers just do `new URLSearchParams(event.body)`.
// If `req.body` is already an object (due to body-parser), `new URLSearchParams(req.body)` might not work as expected if it expects a string.
// Actually `new URLSearchParams(object)` works in Node 18+.
// However, let's ensure we pass what the handler expects. 
// The handlers do: `const body = event.body ? new URLSearchParams(event.body) : ...`
// If event.body is a JSON string, URLSearchParams will fail or be weird.
// If event.body is a query string "a=b&c=d", it works.
// Let's override the body parsing for specific routes or handle re-serialization.

// BETTER APPROACH: Middleware to handle the adaptation
const lambdaAdapter = (handler) => async (req, res) => {
    let eventBody = req.body;

    // If it's a Twilio request (form-urlencoded), req.body is an object.
    // We need to convert it back to a string for the handler if the handler expects a string.
    // Looking at `twilio-call-handler.js`: `const body = event.body ? new URLSearchParams(event.body) : ...`
    // `new URLSearchParams` can take an object in modern Node.
    // BUT, if `event.body` comes from AWS Lambda/Netlify, it's usually a string.
    // Let's try to pass the object directly if it's an object, but our handlers might need adjustment or we rely on URLSearchParams accepting objects.

    // To be safe and mimic Netlify:
    if (req.is('application/x-www-form-urlencoded') && typeof req.body === 'object') {
        eventBody = new URLSearchParams(req.body).toString();
    } else if (typeof req.body === 'object') {
        eventBody = JSON.stringify(req.body);
    }

    const event = {
        httpMethod: req.method,
        headers: req.headers,
        body: eventBody,
        queryStringParameters: req.query,
        path: req.path
    };

    // Debug logging
    // Debug logging
    if (req.path.includes('send-confirmation-email')) {
        console.log(`[DevServer] ${req.method} ${req.path}`);
        console.log(`[DevServer] Raw Body Type: ${typeof req.body}`);
        console.log(`[DevServer] Event Body:`, eventBody);
    }

    const context = { callbackWaitsForEmptyEventLoop: false };

    try {
        const result = await handler(event, context);

        // Handle TwiML (XML) responses
        if (result.headers) {
            res.set(result.headers);
        }

        res.status(result.statusCode || 200).send(result.body);
    } catch (err) {
        console.error('Function Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// --- ROUTES ---

// 1. Frontend serving with Env Var Injection
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error loading index.html');

        let modifiedData = data.replace(
            /pk_live_YOUR_STRIPE_PUBLISHABLE_KEY/g,
            process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51SVKGLLLG2IkIMjNRGtLSTgFOKHA262pTUQZxtrDko025pTqT3eqQ5o3IVThdo1Em18mtHn8OB4vbZYPgW1sgsA200melmouPY'
        );

        // In local dev, we don't need the .netlify/functions prefix if we route directly,
        // BUT to keep frontend consistent with prod, we should route .netlify/functions calls to our handlers.
        res.send(modifiedData);
    });
});

// Serve test-email.html
app.get('/test-email', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-email.html'));
});

// 2. Serve Static Files (Audio, CSS, JS)
app.use(express.static(path.join(__dirname)));

// 3. API Routes (mimicking Netlify Functions)
// We support both direct paths (for easier testing) and .netlify paths (for frontend compatibility)

const routes = [
    { path: '/create-payment-intent', handler: createPaymentIntent, method: 'post' },
    { path: '/.netlify/functions/create-payment-intent', handler: createPaymentIntent, method: 'post' },

    { path: '/twilio-call-handler', handler: twilioCallHandler, method: 'post' },
    { path: '/.netlify/functions/twilio-call-handler', handler: twilioCallHandler, method: 'post' },

    { path: '/call-billing-webhook', handler: callBillingWebhook, method: 'post' },
    { path: '/.netlify/functions/call-billing-webhook', handler: callBillingWebhook, method: 'post' },

    { path: '/get-order-details', handler: getOrderDetails, method: 'get' },
    { path: '/.netlify/functions/get-order-details', handler: getOrderDetails, method: 'get' },

    { path: '/send-confirmation-email', handler: require('./functions/send-confirmation-email').handler, method: 'post' },
    { path: '/.netlify/functions/send-confirmation-email', handler: require('./functions/send-confirmation-email').handler, method: 'post' },

    { path: '/fulfill-video', handler: require('./functions/fulfill-video').handler, method: 'post' },
    { path: '/.netlify/functions/fulfill-video', handler: require('./functions/fulfill-video').handler, method: 'post' },

    { path: '/save-call-data', handler: require('./functions/save-call-data').handler, method: 'post' },
    { path: '/.netlify/functions/save-call-data', handler: require('./functions/save-call-data').handler, method: 'post' },

    { path: '/send-test-email', handler: require('./functions/send-test-email').handler, method: 'post' },
    { path: '/.netlify/functions/send-test-email', handler: require('./functions/send-test-email').handler, method: 'post' },

    { path: '/preview-email', handler: require('./functions/preview-email').handler, method: 'get' },
    { path: '/.netlify/functions/preview-email', handler: require('./functions/preview-email').handler, method: 'get' },

    { path: '/stripe-webhook', handler: require('./functions/stripe-webhook').handler, method: 'post' },
    { path: '/.netlify/functions/stripe-webhook', handler: require('./functions/stripe-webhook').handler, method: 'post' },

    // Upgrade Payment Handler
    { path: '/create-upgrade-payment', handler: require('./functions/create-upgrade-payment').handler, method: 'post' },
    { path: '/.netlify/functions/create-upgrade-payment', handler: require('./functions/create-upgrade-payment').handler, method: 'post' },

    // Media Portal API
    { path: '/get-media', handler: require('./functions/get-media').handler, method: 'get' },
    { path: '/.netlify/functions/get-media', handler: require('./functions/get-media').handler, method: 'get' },

    // Upgrade Pages
    { path: '/upgrade/recording', file: 'upgrade/recording.html' },
    { path: '/upgrade/bundle', file: 'upgrade/bundle.html' },
    { path: '/upgrade/return-call', file: 'upgrade/return-call.html' },

    // Media Portal Page
    { path: '/media', file: 'media.html' }
];

routes.forEach(route => {
    if (route.file) {
        // Serve static file
        app.get(route.path, (req, res) => {
            res.sendFile(path.join(__dirname, route.file));
        });
    } else if (route.method === 'post') {
        app.post(route.path, lambdaAdapter(route.handler));
    } else {
        app.get(route.path, lambdaAdapter(route.handler));
    }
});

const port = process.env.DEV_SERVER_PORT || 3000;
app.listen(port, () => {
    console.log(`\n--- LOCAL DEV SERVER RUNNING ---`);
    console.log(`Local: http://localhost:${port}`);
    console.log(`Functions enabled:`);
    console.log(` - /create-payment-intent`);
    console.log(` - /twilio-call-handler`);
    console.log(` - /call-billing-webhook`);
    console.log(` - /get-order-details`);
    console.log(`\nTo expose to Twilio/Stripe, run: ngrok http ${port}`);
});
