Local dev server for the payment function

This repo includes a small Express wrapper `dev-server.js` that exposes your serverless function
`functions/create-payment-intent.js` at `http://localhost:3000/create-payment-intent`.

Usage
1. Install dependencies:

```powershell
npm install
```

2. Provide environment variables (either in your shell, or create a `.env` file in the project root):

```
MONGODB_URI=your-mongodb-uri
STRIPE_SECRET_KEY=sk_test_...
DEV_SERVER_PORT=3000
```

3. Run the dev server:

```powershell
npm run dev-server
```

4. Point your front-end to the local endpoint during testing by setting `CREATE_PAYMENT_INTENT_URL` in `index.html` to:

```
http://localhost:3000/create-payment-intent
```

Notes
- This wrapper simply adapts the Lambda-style `handler(event, context)` to an Express endpoint. It will call your real function code, so real Stripe and MongoDB credentials are required for end-to-end testing.
- If you want to avoid touching Stripe/Mongo while debugging front-end integration, consider adding a dev-only branch in the function that returns a test `clientSecret` (but Stripe's client_secret must be valid for full confirmPayment flows).
