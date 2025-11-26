// Email template generator module
// Generates all HTML email templates with responsive design

const generateEmailTemplate = (emailType, data) => {
    // Common responsive styles for all templates
    const commonStyles = `
        @media only screen and (max-width: 600px) {
            .content { padding: 20px 15px !important; }
            .greeting { font-size: 18px !important; }
            h1 { font-size: 24px !important; }
            h2 { font-size: 20px !important; }
            h3 { font-size: 18px !important; }
            p, .step-text, .info-text, .message { font-size: 16px !important; }
            .access-code { font-size: 48px !important; letter-spacing: 4px !important; }
            .phone-number { font-size: 22px !important; }
            .upsell-title, .status-title { font-size: 20px !important; }
            .watch-button, .upsell-button { padding: 16px 30px !important; font-size: 16px !important; }
            .recording-link { font-size: 14px !important; }
        }
    `;

    const templates = {
        // Template A: Live Call Confirmation (for standalone calls)
        live_call_confirmation: {
            subject: `🎅 Your Santa Access Code (Order #${data.orderId})`,
            text: `Ho ho ho! Santa is waiting by the phone!\\n\\nYour Access Code: ${data.accessCode}\\n\\nHow to call:\\n1. Dial ${data.twilioNumber}\\n2. Enter the code above\\n3. Hand the phone to ${data.childName}!\\n\\nMerry Christmas!\\nThe CallSanta Team`,
            html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#0F172A}
.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%)}
.header{background:linear-gradient(135deg,#D42426 0%,#991B1D 100%);padding:40px 20px;text-align:center;position:relative;overflow:hidden}
.header::before{content:'❄';position:absolute;top:10px;left:20px;font-size:30px;opacity:0.3;color:white}
.header::after{content:'❄';position:absolute;bottom:10px;right:20px;font-size:30px;opacity:0.3;color:white}
.santa-icon{font-size:60px;margin-bottom:10px}
h1{color:#FFF;margin:0;font-size:32px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.content{padding:40px 30px;color:#E2E8F0}
.greeting{font-size:20px;color:#C5A059;margin-bottom:20px;font-weight:bold}
.access-code-section{background:linear-gradient(135deg,rgba(212,36,38,0.2) 0%,rgba(153,27,29,0.3) 100%);border:3px solid #D42426;border-radius:15px;padding:30px;margin:30px 0;text-align:center;box-shadow:0 8px 20px rgba(212,36,38,0.4)}
.access-code-label{color:#C5A059;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin-bottom:15px}
.access-code{font-size:72px;font-weight:bold;color:#D42426;letter-spacing:8px;font-family:'Courier New',monospace;text-shadow:0 0 20px rgba(212,36,38,0.5);margin:20px 0}
.phone-section{border-top:2px solid rgba(197,160,89,0.3);padding-top:20px;margin-top:20px}
.phone-label{color:#94A3B8;font-size:14px;margin-bottom:8px}
.phone-number{font-size:28px;font-weight:bold;color:#FFF}
.instructions{background:rgba(15,81,50,0.2);border-left:4px solid #0F5132;padding:25px;margin:30px 0;border-radius:8px}
.instructions h3{color:#C5A059;margin-top:0;font-size:20px}
.step{display:flex;align-items:start;margin:15px 0}
.step-number{background:#D42426;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;margin-right:15px;flex-shrink:0}
.step-text{color:#CBD5E1;line-height:1.6;font-size:16px}
.footer{background:#0F172A;padding:30px;text-align:center;color:#64748B;font-size:14px}
.footer a{color:#C5A059;text-decoration:none}
${commonStyles}
</style></head><body>
<div class="container">
<div class="header"><div class="santa-icon">🎅</div><h1>Santa is Waiting!</h1></div>
<div class="content">
<div class="greeting">Ho ho ho, ${data.parentName || 'Dear Parent'}!</div>
<p style="font-size:18px;line-height:1.6;color:#CBD5E1">Santa is by the phone right now, ready to speak with <strong style="color:#C5A059">${data.childName}</strong>! The magic is just a phone call away.</p>
<div class="access-code-section">
<div class="access-code-label">Your Private Access Code</div>
<div class="access-code">${data.accessCode}</div>
<div class="phone-section"><div class="phone-label">Santa's Hotline</div><div class="phone-number">${data.twilioNumber}</div></div>
</div>
<div class="instructions"><h3>📞 How to Connect with Santa</h3>
<div class="step"><div class="step-number">1</div><div class="step-text"><strong>Find a quiet spot</strong> with your child and hand them the phone.</div></div>
<div class="step"><div class="step-number">2</div><div class="step-text">Dial <strong>${data.twilioNumber}</strong></div></div>
<div class="step"><div class="step-number">3</div><div class="step-text">Enter your <strong>4-digit Access Code</strong> when prompted</div></div>
<div class="step"><div class="step-number">4</div><div class="step-text" style="color:#C5A059"><strong>Experience the magic!</strong></div></div>
</div>
</div>
<div class="footer"><p>Questions? Email us at <a href="mailto:info@callsanta.us">info@callsanta.us</a></p><p style="margin-top:15px;color:#475569">Merry Christmas! 🎄</p></div>
</div></body></html>`
        },

        // Template A2: Bundle Call Confirmation (initial email for bundle with promise of second email)
        bundle_call_confirmation: {
            subject: `🎅 Your Santa Access Code (Order #${data.orderId})`,
            text: `Ho ho ho! Santa is waiting by the phone!\\n\\nYour Access Code: ${data.accessCode}\\n\\nHow to call:\\n1. Dial ${data.twilioNumber}\\n2. Enter the code above\\n3. Hand the phone to ${data.childName}!\\n\\nAfter your call, you'll receive a second email with the recording and transcript!\\n\\nMerry Christmas!\\nThe CallSanta Team`,
            html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#0F172A}
.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%)}
.header{background:linear-gradient(135deg,#C5A059 0%,#9A7B3C 100%);padding:40px 20px;text-align:center}
.santa-icon{font-size:60px;margin-bottom:10px}
h1{color:#FFF;margin:0;font-size:32px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.content{padding:40px 30px;color:#E2E8F0}
.greeting{font-size:20px;color:#C5A059;margin-bottom:20px;font-weight:bold}
.access-code-section{background:linear-gradient(135deg,rgba(212,36,38,0.2) 0%,rgba(153,27,29,0.3) 100%);border:3px solid #D42426;border-radius:15px;padding:30px;margin:30px 0;text-align:center;box-shadow:0 8px 20px rgba(212,36,38,0.4)}
.access-code-label{color:#C5A059;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin-bottom:15px}
.access-code{font-size:72px;font-weight:bold;color:#D42426;letter-spacing:8px;font-family:'Courier New',monospace;text-shadow:0 0 20px rgba(212,36,38,0.5);margin:20px 0}
.phone-section{border-top:2px solid rgba(197,160,89,0.3);padding-top:20px;margin-top:20px}
.phone-label{color:#94A3B8;font-size:14px;margin-bottom:8px}
.phone-number{font-size:28px;font-weight:bold;color:#FFF}
.instructions{background:rgba(15,81,50,0.2);border-left:4px solid #0F5132;padding:25px;margin:30px 0;border-radius:8px}
.instructions h3{color:#C5A059;margin-top:0;font-size:20px}
.step{display:flex;align-items:start;margin:15px 0}
.step-number{background:#D42426;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;margin-right:15px;flex-shrink:0}
.step-text{color:#CBD5E1;line-height:1.6;font-size:16px}
.info-box{background:linear-gradient(135deg,rgba(139,92,246,0.2) 0%,rgba(168,85,247,0.2) 100%);border:2px solid #8B5CF6;border-radius:12px;padding:25px;margin:30px 0;text-align:center}
.info-box h3{color:#A78BFA;margin-top:0;font-size:22px}
.info-box p{color:#E9D5FF;margin:15px 0;line-height:1.6;font-size:16px}
.footer{background:#0F172A;padding:30px;text-align:center;color:#64748B;font-size:14px}
.footer a{color:#C5A059;text-decoration:none}
${commonStyles}
</style></head><body>
<div class="container">
<div class="header"><div class="santa-icon">🎅</div><h1>Ultimate Bundle: Santa is Waiting!</h1></div>
<div class="content">
<div class="greeting">Ho ho ho, ${data.parentName || 'Dear Parent'}!</div>
<p style="font-size:18px;line-height:1.6;color:#CBD5E1">Santa is by the phone right now, ready to speak with <strong style="color:#C5A059">${data.childName}</strong>! The magic is just a phone call away.</p>
<div class="access-code-section">
<div class="access-code-label">Your Private Access Code</div>
<div class="access-code">${data.accessCode}</div>
<div class="phone-section"><div class="phone-label">Santa's Hotline</div><div class="phone-number">${data.twilioNumber}</div></div>
</div>
<div class="instructions"><h3>📞 How to Connect with Santa</h3>
<div class="step"><div class="step-number">1</div><div class="step-text"><strong>Find a quiet spot</strong> with your child and hand them the phone.</div></div>
<div class="step"><div class="step-number">2</div><div class="step-text">Dial <strong>${data.twilioNumber}</strong></div></div>
<div class="step"><div class="step-number">3</div><div class="step-text">Enter your <strong>4-digit Access Code</strong> when prompted</div></div>
<div class="step"><div class="step-number">4</div><div class="step-text" style="color:#C5A059"><strong>Enjoy unlimited talk time!</strong></div></div>
</div>
<div class="info-box">
<h3>🎁 What Happens After Your Call?</h3>
<p><strong>You'll receive a second email</strong> with:<br>
📞 Full call recording<br>
📝 Complete transcript<br>
✨ A special surprise!</p>
<p style="color:#FEF3C7;font-size:14px;margin-top:20px">Check your inbox within 24 hours after the call ends</p>
</div>
</div>
<div class="footer"><p>Questions? Email us at <a href="mailto:info@callsanta.us">info@callsanta.us</a></p><p style="margin-top:15px;color:#475569">Merry Christmas! 🎄</p></div>
</div></body></html>`
        },

        // Template B1: Video Order Confirmation
        video_order_confirmation: {
            subject: `🎥 Order Confirmed: Santa is making ${data.childName}'s video!`,
            text: `Hi ${data.parentName || 'there'},\\n\\nThank you for your order!\\n\\nWhat's happening now?\\nSanta's elves have received your details for ${data.childName} and are filming the video right now.\\n\\nExpected Delivery: Less than 24 hours. 🕒\\n\\nWe will send you a separate email with the direct link to watch the video as soon as it is ready.\\n\\nWarm Wishes,\\nThe CallSanta Team`,
            html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#0F172A}
.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%)}
.header{background:linear-gradient(135deg,#7C3AED 0%,#6D28D9 100%);padding:40px 20px;text-align:center}
.sparkle{font-size:40px;margin-bottom:10px}
h1{color:#FFF;margin:0;font-size:32px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.content{padding:40px 30px;color:#E2E8F0}
.greeting{font-size:20px;color:#C5A059;margin-bottom:20px;font-weight:bold}
.status-box{background:linear-gradient(135deg,rgba(124,58,237,0.2) 0%,rgba(109,40,217,0.3) 100%);border:3px solid #7C3AED;border-radius:15px;padding:30px;margin:30px 0;text-align:center}
.status-icon{font-size:60px;margin-bottom:15px}
.status-title{color:#A78BFA;font-size:24px;font-weight:bold;margin-bottom:15px}
.status-text{color:#E9D5FF;font-size:16px;line-height:1.6}
.info-box{background:rgba(15,81,50,0.2);border-left:4px solid #0F5132;padding:25px;margin:30px 0;border-radius:8px}
.info-box h3{color:#C5A059;margin-top:0;font-size:20px}
.info-item{display:flex;align-items:start;margin:15px 0}
.info-icon{margin-right:12px;font-size:20px}
.info-text{color:#CBD5E1;line-height:1.6;font-size:16px}
.highlight{color:#C5A059;font-weight:bold}
.email-display{background:rgba(15,23,42,0.6);padding:15px;border-radius:8px;margin-top:15px;color:#FFF;font-weight:bold;font-size:16px}
.footer{background:#0F172A;padding:30px;text-align:center;color:#64748B;font-size:14px}
.footer a{color:#C5A059;text-decoration:none}
${commonStyles}
</style></head><body>
<div class="container">
<div class="header"><div class="sparkle">✨</div><h1>Order Confirmed!</h1></div>
<div class="content">
<div class="greeting">Hi ${data.parentName || 'there'},</div>
<p style="font-size:18px;line-height:1.6;color:#CBD5E1">Thank you for your order! Santa's workshop is buzzing with excitement.</p>
<div class="status-box">
<div class="status-icon">🎬</div>
<div class="status-title">Video Production in Progress</div>
<div class="status-text">Santa's elves have received your details for <strong>${data.childName}</strong> and are filming the personalized video right now!</div>
</div>
<div class="info-box"><h3>⏰ What Happens Next?</h3>
<div class="info-item"><div class="info-icon">🎥</div><div class="info-text">Our team is <span class="highlight">manually crafting</span> a magical video message from Santa, personalized just for ${data.childName}.</div></div>
<div class="info-item"><div class="info-icon">📧</div><div class="info-text">You'll receive a <span class="highlight">separate email with the video link</span> within the next 24 hours.</div></div>
<div class="info-item"><div class="info-icon">💝</div><div class="info-text">The video will be yours to <span class="highlight">download and keep forever</span> as a cherished memory.</div></div>
<div class="email-display">📬 Watch for an email at: ${data.parentEmail}</div>
</div>
<p style="text-align:center;color:#94A3B8;font-style:italic;margin-top:30px;font-size:16px">"The best gifts come from the heart... and the North Pole!" 🎅</p>
</div>
<div class="footer"><p>Questions? Email us at <a href="mailto:info@callsanta.us">info@callsanta.us</a></p><p style="margin-top:15px;color:#475569">Warm Wishes from the CallSanta Team 🎄</p></div>
</div></body></html>`
        },

        // Template B2: Video Delivery
        video_delivery: {
            subject: `🎁 Special Delivery: ${data.childName}'s Video from Santa!`,
            text: `Ho ho ho!\\n\\nIt's finally here! Santa has recorded a special message just for ${data.childName}.\\n\\nWatch your video now: ${data.videoUrl}\\n\\nMerry Christmas,\\nThe CallSanta Team`,
            html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#0F172A}
.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%)}
.header{background:linear-gradient(135deg,#D42426 0%,#991B1D 100%);padding:50px 20px;text-align:center;position:relative;overflow:hidden}
.header::before{content:'🎄';position:absolute;top:20px;left:30px;font-size:40px;opacity:0.3}
.header::after{content:'🎄';position:absolute;bottom:20px;right:30px;font-size:40px;opacity:0.3}
.gift-icon{font-size:70px;margin-bottom:15px}
h1{color:#FFF;margin:0;font-size:36px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.subtitle{color:#FEE2E2;margin-top:10px;font-size:18px}
.content{padding:40px 30px;color:#E2E8F0}
.greeting{font-size:24px;color:#C5A059;margin-bottom:20px;font-weight:bold;text-align:center}
.message{font-size:18px;line-height:1.8;color:#CBD5E1;text-align:center;margin:25px 0}
.video-box{background:linear-gradient(135deg,rgba(212,36,38,0.3) 0%,rgba(197,160,89,0.2) 100%);border:3px solid #C5A059;border-radius:20px;padding:40px;margin:40px 0;text-align:center;box-shadow:0 10px 30px rgba(197,160,89,0.3)}
.video-icon{font-size:80px;margin-bottom:20px}
.watch-button{display:inline-block;background:linear-gradient(135deg,#D42426 0%,#991B1D 100%);color:white;padding:20px 50px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:20px;margin-top:20px;box-shadow:0 6px 20px rgba(212,36,38,0.5)}
.features{margin:40px 0}
.feature{display:flex;align-items:center;margin:20px 0;background:rgba(15,81,50,0.2);padding:20px;border-radius:10px}
.feature-icon{font-size:30px;margin-right:15px}
.feature-text{color:#CBD5E1;font-size:16px}
.footer{background:#0F172A;padding:30px;text-align:center;color:#64748B;font-size:14px}
.footer a{color:#C5A059;text-decoration:none}
${commonStyles}
</style></head><body>
<div class="container">
<div class="header"><div class="gift-icon">🎁</div><h1>It's Here!</h1><div class="subtitle">Your magical moment has arrived</div></div>
<div class="content">
<div class="greeting">Ho ho ho!</div>
<div class="message">Santa has recorded a <strong style="color:#C5A059">very special message</strong> just for <strong style="color:#FFF">${data.childName}</strong>!<br>This magical moment is ready to watch right now.</div>
<div class="video-box">
<div class="video-icon">🎬</div>
<div style="color:#C5A059;font-size:22px;font-weight:bold;margin-bottom:15px">${data.childName}'s Personal Video from Santa</div>
<div style="color:#E9D5FF;margin:15px 0;font-size:16px">Click below to watch the magic unfold!</div>
<a href="${data.videoUrl}" class="watch-button">▶ Watch Your Video Now</a>
</div>
<div class="features">
<div class="feature"><div class="feature-icon">💾</div><div class="feature-text"><strong style="color:#FFF">Download & Keep Forever</strong><br>Save this video and watch it year after year</div></div>
<div class="feature"><div class="feature-icon">📱</div><div class="feature-text"><strong style="color:#FFF">Share the Magic</strong><br>Show it to family and friends to spread the joy</div></div>
<div class="feature"><div class="feature-icon">🎄</div><div class="feature-text"><strong style="color:#FFF">A Cherished Memory</strong><br>Capture the wonder of childhood Christmas magic</div></div>
</div>
<p style="text-align:center;color:#C5A059;font-size:18px;font-style:italic;margin-top:40px">"May your days be merry and bright!" ✨</p>
</div>
<div class="footer"><p>Questions? Email us at <a href="mailto:info@callsanta.us">info@callsanta.us</a></p><p style="margin-top:15px;color:#475569">Merry Christmas from Santa and the CallSanta Team! 🎅</p></div>
</div></body></html>`
        },

        // Template C: Bundle Post-Call (second email with recording + upsell)
        bundle_post_call: {
            subject: `🎙️ ${data.childName}'s Call Recording + A Message from Santa`,
            text: `Ho ho ho!\\n\\nThat was wonderful! Santa loved talking to ${data.childName}.\\n\\nHere are your memories:\\n🔗 Recording: ${data.audioUrl}\\n📝 Transcript: ${data.audioUrl}\\n\\nWant to speak to Santa again?\\nSanta loved the chat so much he remembers everything about it! You can book another call right now, and Santa will have all the knowledge of the last call they had together.\\n\\nBook a Follow-Up Call: https://callsanta.us/?return=true&order=${data.orderId}\\n\\nMagical wishes,\\nThe CallSanta Team`,
            html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#0F172A}
.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%)}
.header{background:linear-gradient(135deg,#C5A059 0%,#9A7B3C 100%);padding:40px 20px;text-align:center}
.mic-icon{font-size:60px;margin-bottom:10px}
h1{color:#FFF;margin:0;font-size:32px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.subtitle{color:#FEF3C7;margin-top:10px;font-size:16px}
.content{padding:40px 30px;color:#E2E8F0}
.greeting{font-size:24px;color:#C5A059;margin-bottom:20px;font-weight:bold;text-align:center}
.message{font-size:18px;line-height:1.8;color:#CBD5E1;text-align:center;margin:25px 0}
.recording-box{background:linear-gradient(135deg,rgba(197,160,89,0.2) 0%,rgba(15,81,50,0.2) 100%);border:3px solid #C5A059;border-radius:15px;padding:30px;margin:30px 0}
.recording-title{color:#C5A059;font-size:22px;font-weight:bold;margin-bottom:20px;text-align:center}
.recording-item{background:rgba(15,23,42,0.6);padding:20px;border-radius:10px;margin:15px 0;display:flex;align-items:center}
.recording-icon{font-size:30px;margin-right:15px}
.recording-text{flex:1}
.recording-label{color:#94A3B8;font-size:14px;margin-bottom:5px}
.recording-link{color:#C5A059;font-weight:bold;text-decoration:none;font-size:16px}
.upsell-box{background:linear-gradient(135deg,rgba(212,36,38,0.3) 0%,rgba(153,27,29,0.3) 100%);border:3px solid #D42426;border-radius:15px;padding:35px;margin:40px 0;text-align:center;box-shadow:0 8px 25px rgba(212,36,38,0.4)}
.upsell-icon{font-size:50px;margin-bottom:15px}
.upsell-title{color:#FCA5A5;font-size:26px;font-weight:bold;margin-bottom:15px}
.upsell-text{color:#FEE2E2;font-size:17px;line-height:1.7;margin:20px 0}
.highlight{color:#FFF;font-weight:bold;background:rgba(212,36,38,0.3);padding:2px 6px;border-radius:4px}
.upsell-button{display:inline-block;background:linear-gradient(135deg,#D42426 0%,#991B1D 100%);color:white;padding:18px 45px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:18px;margin-top:20px;box-shadow:0 6px 20px rgba(212,36,38,0.5)}
.footer{background:#0F172A;padding:30px;text-align:center;color:#64748B;font-size:14px}
.footer a{color:#C5A059;text-decoration:none}
${commonStyles}
</style></head><body>
<div class="container">
<div class="header"><div class="mic-icon">🎙️</div><h1>What a Magical Call!</h1><div class="subtitle">Your memories are ready</div></div>
<div class="content">
<div class="greeting">Ho ho ho!</div>
<div class="message">That was <strong style="color:#C5A059">wonderful</strong>! Santa absolutely loved talking to <strong style="color:#FFF">${data.childName}</strong>.<br>Here are your precious memories to keep forever.</div>
<div class="recording-box">
<div class="recording-title">🎁 Your Call Memories</div>
<div class="recording-item"><div class="recording-icon">🎧</div><div class="recording-text"><div class="recording-label">Full Call Recording</div><a href="${data.audioUrl}" class="recording-link">▶ Listen to Recording</a></div></div>
<div class="recording-item"><div class="recording-icon">📝</div><div class="recording-text"><div class="recording-label">Complete Transcript</div><a href="${data.audioUrl}" class="recording-link">📄 View Transcript</a></div></div>
<div style="text-align:center;margin-top:20px;color:#94A3B8;font-size:14px">⏱️ Call Duration: ${Math.floor((data.callDuration || 0) / 60)} minutes ${(data.callDuration || 0) % 60} seconds</div>
</div>
<div class="upsell-box">
<div class="upsell-icon">🎅</div>
<div class="upsell-title">Santa Remembers Everything!</div>
<div class="upsell-text">Santa loved the chat so much, he remembers <span class="highlight">every detail</span> about ${data.childName}!<br><br>Book a <strong>"Santa Returns"</strong> call right now, and Santa will ask ${data.childName} specifically about <span class="highlight">the things they just discussed</span> to prove he's been watching! 👀<br><br>Imagine ${data.childName}'s face when Santa says:<br><em style="color:#FCA5A5">"Last time we talked about ${data.conversationTopic || 'your wishes'}... have you been thinking about that?"</em></div>
<a href="https://callsanta.us/?return=true&order=${data.orderId}" class="upsell-button">🎄 Book Santa Returns Call</a>
<div style="margin-top:15px;color:#FEE2E2;font-size:14px">✨ Same personalized experience, even more magical!</div>
</div>
<p style="text-align:center;color:#C5A059;font-size:18px;font-style:italic;margin-top:40px">"The magic of Christmas lives in moments like these." 🌟</p>
</div>
<div class="footer"><p>Questions? Email us at <a href="mailto:info@callsanta.us">info@callsanta.us</a></p><p style="margin-top:15px;color:#475569">Magical wishes from Santa and the CallSanta Team! 🎅</p></div>
</div></body></html>`
        }
    };

    return templates[emailType] || null;
};

module.exports = { generateEmailTemplate };
