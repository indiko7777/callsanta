const mongoose = require('mongoose');

// Send test emails with custom data (for testing purposes only)
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { email_type, recipient_email, test_data } = JSON.parse(event.body || '{}');

    if (!email_type || !recipient_email) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing email_type or recipient_email' })
        };
    }

    // Safety check: prevent accidental production emails
    const safeEmailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'test.com', 'example.com'];
    const emailDomain = recipient_email.split('@')[1];

    if (!safeEmailDomains.includes(emailDomain) && !process.env.ALLOW_ALL_TEST_EMAILS) {
        return {
            statusCode: 403,
            body: JSON.stringify({
                error: 'For safety, test emails can only be sent to common email providers. Set ALLOW_ALL_TEST_EMAILS=true to override.'
            })
        };
    }

    try {
        // Prepare test data with defaults
        const emailData = {
            orderId: test_data?.orderId || 'TEST' + Math.random().toString(36).substr(2, 6).toUpperCase(),
            childName: test_data?.childName || 'Emma',
            parentName: test_data?.parentName || 'Test Parent',
            parentEmail: recipient_email,
            accessCode: test_data?.accessCode || '1234',
            twilioNumber: test_data?.twilioNumber || '+1 (438) 795-1562',
            videoUrl: test_data?.videoUrl || 'https://example.com/test-video.mp4',
            audioUrl: test_data?.audioUrl || 'https://example.com/test-audio.mp3',
            callDuration: test_data?.callDuration || 325, // 5 minutes 25 seconds
            conversationTopic: test_data?.conversationTopic || 'their favorite toys and Christmas wishes'
        };

        // Call the email function with test data
        const emailFunction = require('./send-confirmation-email');
        const emailResult = await emailFunction.handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                email_type: email_type,
                test_data: emailData
            })
        }, context);

        if (emailResult.statusCode === 200) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    status: 'success',
                    message: `Test email sent to ${recipient_email}`,
                    email_type: email_type,
                    test_data: emailData
                })
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Failed to send test email',
                    details: emailResult.body
                })
            };
        }

    } catch (error) {
        console.error('TEST EMAIL ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send test email: ' + error.message })
        };
    }
};
