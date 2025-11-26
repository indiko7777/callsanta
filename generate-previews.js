const { generateEmailTemplate } = require('./functions/email-templates');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'email-previews');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const mockData = {
    orderId: '6926839919fe4eb2cf56b630',
    childName: 'Timmy',
    parentName: 'John Doe',
    accessCode: '123456',
    twilioNumber: '+15550001234',
    videoUrl: 'https://example.com/video.mp4',
    callDuration: 125 // 2m 5s
};

const templates = [
    'live_call_confirmation',
    'bundle_call_confirmation',
    'video_order_confirmation',
    'video_delivery',
    'bundle_post_call'
];

templates.forEach(type => {
    const template = generateEmailTemplate(type, mockData);
    if (template) {
        const filePath = path.join(outputDir, `${type}.html`);
        fs.writeFileSync(filePath, template.html);
        console.log(`Generated ${type}.html`);
    } else {
        console.error(`Failed to generate ${type}`);
    }
});
