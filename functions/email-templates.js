const generateEmailTemplate = (emailType, data) => {
    // Base URL for images - change to production URL when deploying
    const baseUrl = process.env.BASE_URL || 'https://callsanta.us';
    const images = {
        bg: `${baseUrl}/images/email/bg-christmas.jpg`,
        santaHeader: `${baseUrl}/images/email/santa-header.jpg`,
        videoOverlay: `${baseUrl}/images/email/video-overlay.png`,
        footerBg: `${baseUrl}/images/email/bg-footer.jpg`
    };

    // Common styles for premium look
    const styles = {
        container: `font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);`,
        header: `background-image: url('${images.santaHeader}'); background-size: cover; background-position: center; height: 300px; position: relative;`,
        headerOverlay: `background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6)); width: 100%; height: 100%; display: flex; align-items: flex-end; padding: 30px; box-sizing: border-box;`,
        headerTitle: `color: #ffffff; font-size: 32px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.5); margin: 0;`,
        body: `padding: 40px 30px; color: #333333; line-height: 1.6; font-size: 16px;`,
        highlightBox: `background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;`,
        accessCode: `font-size: 48px; font-weight: bold; color: #D42426; letter-spacing: 4px; margin: 10px 0; display: block;`,
        button: `display: inline-block; background-color: #D42426; color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 50px; font-weight: bold; font-size: 18px; margin-top: 20px; text-align: center;`,
        footer: `background-image: url('${images.footerBg}'); background-color: #1a1a1a; color: #999999; padding: 30px; text-align: center; font-size: 12px;`,
        upsellContainer: `margin-top: 40px; border-top: 1px solid #eee; padding-top: 30px;`,
        upsellTitle: `font-size: 20px; font-weight: bold; color: #333; margin-bottom: 20px; text-align: center;`,
        upsellGrid: `display: table; width: 100%; border-spacing: 10px;`,
        upsellItem: `display: table-cell; width: 50%; vertical-align: top; background: #fdfdfd; border: 1px solid #eee; border-radius: 8px; padding: 20px; text-align: center;`,
        priceOld: `text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;`,
        priceNew: `color: #D42426; font-weight: bold; font-size: 18px;`,
        link: `color: #D42426; text-decoration: none; font-weight: bold;`
    };

    const templates = {
        // Template A: Live Call Confirmation
        live_call_confirmation: {
            subject: `Santa is Ready for ${data.childName}!`,
            text: `Your access code is ${data.accessCode}. Call ${data.twilioNumber} now!`,
            html: `
                <div style="${styles.container}">
                    <div style="${styles.header}">
                        <div style="${styles.headerOverlay}">
                            <h1 style="${styles.headerTitle}">Santa is Ready!</h1>
                        </div>
                    </div>
                    <div style="${styles.body}">
                        <p>Hello ${data.parentName || 'Parent'},</p>
                        <p>The elves have finished preparing everything. Santa has reviewed ${data.childName}'s file and is waiting by the phone!</p>
                        
                        <div style="${styles.highlightBox}">
                            <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Access Code</p>
                            <span style="${styles.accessCode}">${data.accessCode}</span>
                            <p style="margin: 10px 0 0; font-size: 14px;">Call Santa at: <strong>${data.twilioNumber}</strong></p>
                        </div>

                        <p><strong>Instructions:</strong></p>
                        <ol style="padding-left: 20px; margin-bottom: 0;">
                            <li>Dial the number above</li>
                            <li>Enter your access code when prompted</li>
                            <li>Hand the phone to ${data.childName} and watch the magic happen!</li>
                        </ol>

                        <div style="${styles.upsellContainer}">
                            <h3 style="${styles.upsellTitle}">Make the Magic Last Forever</h3>
                            <div style="${styles.upsellGrid}">
                                <div style="${styles.upsellItem}">
                                    <h4 style="margin: 0 0 10px; color: #333;">Call Recording</h4>
                                    <p style="font-size: 13px; color: #666; margin-bottom: 10px;">Keep this memory forever.</p>
                                    <div style="margin-bottom: 15px;">
                                        <span style="${styles.priceNew}">$5.00</span>
                                    </div>
                                    <a href="${baseUrl}/upgrade/recording?order=${data.orderId}" style="${styles.link}">Add Recording &rarr;</a>
                                </div>
                                <div style="${styles.upsellItem}; border-color: #EAB308; background: #fffdf5;">
                                    <div style="background: #EAB308; color: #000; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px;">BEST VALUE</div>
                                    <h4 style="margin: 0 0 10px; color: #333;">Ultimate Bundle</h4>
                                    <p style="font-size: 13px; color: #666; margin-bottom: 10px;">Recording + Transcript + Return Call</p>
                                    <div style="margin-bottom: 15px;">
                                        <span style="${styles.priceOld}">$10.00</span>
                                        <span style="${styles.priceNew}">$7.50</span>
                                    </div>
                                    <a href="${baseUrl}/upgrade/bundle?order=${data.orderId}" style="${styles.link}">Upgrade Now &rarr;</a>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="${styles.footer}">
                        <p>&copy; ${new Date().getFullYear()} CallSanta.us. All rights reserved.</p>
                        <p>Made with magic at the North Pole.</p>
                    </div>
                </div>
            `
        },

        // Template A2: Bundle Call Confirmation (Email 1)
        bundle_call_confirmation: {
            subject: `Your Santa Call Access Code for ${data.childName}`,
            text: `Your access code is ${data.accessCode}. Call ${data.twilioNumber} now!`,
            html: `
                <div style="${styles.container}">
                    <div style="${styles.header}">
                        <div style="${styles.headerOverlay}">
                            <h1 style="${styles.headerTitle}">Your Magic Pass</h1>
                        </div>
                    </div>
                    <div style="${styles.body}">
                        <p>Hello ${data.parentName || 'Parent'},</p>
                        <p>Thank you for choosing the Ultimate Bundle! Santa is so excited to speak with ${data.childName}.</p>
                        
                        <div style="${styles.highlightBox}">
                            <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Access Code</p>
                            <span style="${styles.accessCode}">${data.accessCode}</span>
                            <p style="margin: 10px 0 0; font-size: 14px;">Call Santa at: <strong>${data.twilioNumber}</strong></p>
                        </div>

                        <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px; padding: 15px; margin-top: 20px;">
                            <p style="margin: 0; color: #166534; font-size: 14px;">
                                <strong>Note:</strong> You will receive a second email immediately after the call with your recording, transcript, and return call details.
                            </p>
                        </div>
                    </div>
                    <div style="${styles.footer}">
                        <p>&copy; ${new Date().getFullYear()} CallSanta.us. All rights reserved.</p>
                    </div>
                </div>
            `
        },

        // Template B1: Video Order Confirmation
        video_order_confirmation: {
            subject: `Santa is Making a Video for ${data.childName}!`,
            text: `Order confirmed! Santa is filming your video now.`,
            html: `
                <div style="${styles.container}">
                    <div style="${styles.header}">
                        <div style="${styles.headerOverlay}">
                            <h1 style="${styles.headerTitle}">Filming in Progress!</h1>
                        </div>
                    </div>
                    <div style="${styles.body}">
                        <p>Hello ${data.parentName || 'Parent'},</p>
                        <p>Great news! The elves have delivered your request to Santa's studio.</p>
                        <p>Santa is currently filming a personalized video just for ${data.childName}. He wants to make sure every detail is perfect.</p>
                        
                        <div style="${styles.highlightBox}">
                            <p style="font-size: 18px; font-weight: bold; color: #333;">Estimated Delivery: <span style="color: #D42426;">Within 24 Hours</span></p>
                        </div>

                        <p>You will receive another email as soon as the video is ready to watch and download.</p>
                    </div>
                    <div style="${styles.footer}">
                        <p>&copy; ${new Date().getFullYear()} CallSanta.us. All rights reserved.</p>
                    </div>
                </div>
            `
        },

        // Template B2: Video Delivery
        video_delivery: {
            subject: `Special Delivery: Video for ${data.childName}!`,
            text: `Your video from Santa is ready! Watch it here: ${data.videoUrl}`,
            html: `
                <div style="${styles.container}">
                    <div style="${styles.header}">
                        <div style="${styles.headerOverlay}">
                            <h1 style="${styles.headerTitle}">Special Delivery!</h1>
                        </div>
                    </div>
                    <div style="${styles.body}">
                        <p>Hello ${data.parentName || 'Parent'},</p>
                        <p>It's here! Santa has finished recording a special message for ${data.childName}.</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${baseUrl}/media?order=${data.orderId}&code=${data.accessCode}" style="position: relative; display: inline-block;">
                                <img src="${images.videoOverlay}" alt="Play Video" style="width: 100%; max-width: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                            </a>
                            <br>
                            <a href="${baseUrl}/media?order=${data.orderId}&code=${data.accessCode}" style="${styles.button}">Watch Video Now</a>
                        </div>
                    </div>
                    <div style="${styles.footer}">
                        <p>&copy; ${new Date().getFullYear()} CallSanta.us. All rights reserved.</p>
                    </div>
                </div>
            `
        },

        // Template C: Bundle Post-Call (Email 2)
        bundle_post_call: {
            subject: `Your Recording & Message from Santa for ${data.childName}`,
            text: `Here is your call recording and transcript. Book a return call: ${baseUrl}/upgrade/return-call`,
            html: `
                <div style="${styles.container}">
                    <div style="${styles.header}">
                        <div style="${styles.headerOverlay}">
                            <h1 style="${styles.headerTitle}">What a Wonderful Chat!</h1>
                        </div>
                    </div>
                    <div style="${styles.body}">
                        <p>Hello ${data.parentName || 'Parent'},</p>
                        <p>Santa absolutely loved speaking with ${data.childName}! It was such a magical moment.</p>
                        
                        <div style="${styles.highlightBox}">
                            <h3 style="margin-top: 0;">Your Magic Memories</h3>
                            <p>Call Duration: <strong>${Math.floor(data.callDuration / 60)}m ${data.callDuration % 60}s</strong></p>
                            <a href="${baseUrl}/media?order=${data.orderId}&code=${data.accessCode}" style="${styles.button}">View Recording & Transcript</a>
                        </div>

                        <div style="${styles.upsellContainer}">
                            <h3 style="${styles.upsellTitle}">Santa Wants to Talk Again!</h3>
                            <div style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px; padding: 20px; text-align: center;">
                                <p style="margin-top: 0;">Book a return call where Santa will <strong>remember everything</strong> from this conversation!</p>
                                <div style="margin: 20px 0;">
                                    <span style="${styles.priceOld}">$20.00</span>
                                    <span style="${styles.priceNew}">$10.00</span>
                                    <span style="background: #16A34A; color: white; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle;">50% OFF</span>
                                </div>
                                <a href="${baseUrl}/upgrade/return-call?order=${data.orderId}" style="${styles.button}; background-color: #16A34A; margin-top: 0;">Book Return Call</a>
                            </div>
                        </div>
                    </div>
                    <div style="${styles.footer}">
                        <p>&copy; ${new Date().getFullYear()} CallSanta.us. All rights reserved.</p>
                    </div>
                </div>
            `
        }
    };

    return templates[emailType] || null;
};

module.exports = { generateEmailTemplate };
