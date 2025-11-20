// dev-server.js
// Simple Express wrapper to run the serverless function locally at /create-payment-intent
// Usage: set your env vars (MONGODB_URI, STRIPE_SECRET_KEY) in a .env file or shell, then run:
//    npm run dev-server

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Serve index.html with injected env vars - MUST BE BEFORE express.static
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error loading index.html');
        }

        // Inject Stripe Key
        let modifiedData = data.replace(
            /pk_live_YOUR_STRIPE_PUBLISHABLE_KEY/g,
            process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
        );

        // Inject Backend URL
        modifiedData = modifiedData.replace(
            "const CREATE_PAYMENT_INTENT_URL = '/.netlify/functions/create-payment-intent';",
            "const CREATE_PAYMENT_INTENT_URL = '/create-payment-intent';"
        );

        res.send(modifiedData);
    });
});

// Serve static files (images, css, etc.)
// index: false prevents serving index.html automatically, allowing our custom route to handle it
app.use(express.static(path.join(__dirname), { index: false }));

let handler;
try {
    // The function exports.handler (AWS Lambda style)
    handler = require('./functions/create-payment-intent').handler;
} catch (e) {
    console.error('Could not load function handler from ./functions/create-payment-intent.js', e);
}

app.post('/create-payment-intent', async (req, res) => {
    if (!handler) return res.status(500).json({ error: 'Function handler not available' });

    const event = {
        httpMethod: 'POST',
        headers: req.headers || {},
        body: JSON.stringify(req.body || {}),
        path: req.path,
        queryStringParameters: req.query || {}
    };

    const context = { callbackWaitsForEmptyEventLoop: false };

    try {
        const result = await handler(event, context);
        // result expected to be { statusCode, body }
        const status = result && result.statusCode ? result.statusCode : 200;
        let body = result && result.body ? result.body : '';
        // If body is JSON string, try parse to send as JSON
        try { body = JSON.parse(body); } catch (e) { /* leave as text */ }
        res.status(status).send(body);
    } catch (err) {
        console.error('Handler error:', err);
        res.status(500).json({ error: err.message || String(err) });
    }
});

const port = process.env.DEV_SERVER_PORT || 3000;
app.listen(port, () => console.log(`Dev server listening on http://localhost:${port}`));
