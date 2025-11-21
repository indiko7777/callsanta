# Local Development Guide (Using ngrok)

Yes, you can run everything on your computer! To make Twilio and Stripe work with your local server, you need to use a tool called **ngrok** to create a secure tunnel from the internet to your machine.

## Prerequisites
1.  **Node.js** installed.
2.  **ngrok** installed (Download from [ngrok.com](https://ngrok.com/download)).

## Step 1: Start Your Local Server
Open a terminal in your project folder and run:
```bash
npm run dev-server
```
You should see: `Local Dev Server running on http://localhost:3000`

## Step 2: Start ngrok
Open a **second** terminal window and run:
```bash
ngrok http 3000
```
You will see a Forwarding URL like: `https://a1b2-c3d4.ngrok-free.app` -> `http://localhost:3000`.
**Copy this URL.** This is your "Public URL" for this session.

> [!WARNING]
> If you restart ngrok, this URL will change, and you will need to update Twilio and Stripe again.

## Step 3: Update Configuration

### 1. Update .env (Local)
In your `.env` file, update `BASE_URL` to match your ngrok URL:
```env
BASE_URL=https://YOUR-NGROK-ID.ngrok-free.app/
```
*Restart your `npm run dev-server` after changing the .env file.*

### 2. Update Twilio Webhook
1.  Go to Twilio Console > Phone Numbers > Active Numbers > [Your Number].
2.  Under **Voice & Fax** > **A CALL COMES IN**:
    -   Change the URL to: `https://YOUR-NGROK-ID.ngrok-free.app/twilio-call-handler`
    -   Ensure it is set to **HTTP POST**.
3.  Save.

### 3. Update Stripe Webhooks (Optional for Billing)
If you want to test the overage billing webhook locally:
1.  Go to Stripe Dashboard > Developers > Webhooks.
2.  Add Endpoint: `https://YOUR-NGROK-ID.ngrok-free.app/call-billing-webhook`
3.  Select events: `payment_intent.succeeded` (or whatever logic you trigger, though our logic is manual).
    -   *Actually, our billing logic is triggered by Twilio, not Stripe Webhooks, so you might not need this step unless you have other Stripe webhooks.*

## Step 4: Test
Now you can make a purchase on `http://localhost:3000` and call the Twilio number. Twilio will send the call request to your ngrok URL, which forwards it to your local `dev-server.js`.
