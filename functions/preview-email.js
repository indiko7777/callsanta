// Preview email templates without sending
const { generateEmailTemplate } = require('./email-templates');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const params = event.httpMethod === 'GET'
        ? event.queryStringParameters || {}
        : JSON.parse(event.body || '{}');

    const { email_type, child_name, parent_email, access_code, video_url, audio_url, call_duration } = params;

    // Default test data
    const testData = {
        orderId: 'TEST1234',
        childName: child_name || 'Emma',
        parentName: 'Parent',
        parentEmail: parent_email || 'parent@example.com',
        accessCode: access_code || '1234',
        twilioNumber: '+33 9 39 03 63 23',
        videoUrl: video_url || 'https://example.com/video.mp4',
        audioUrl: audio_url || 'https://example.com/audio.mp3',
        callDuration: parseInt(call_duration) || 325, // 5 minutes 25 seconds
        conversationTopic: 'their favorite toys and Christmas wishes'
    };

    const selectedType = email_type || 'live_call_confirmation';
    const template = generateEmailTemplate(selectedType, testData);

    if (!template) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid email type. Valid types: live_call_confirmation, bundle_call_confirmation, video_order_confirmation, video_delivery, bundle_post_call' })
        };
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html'
        },
        body: template.html
    };
};
