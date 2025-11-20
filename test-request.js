const http = require('http');
const data = JSON.stringify({
    package_id: 'bundle',
    parent_email: 'test@test.com',
    child_name: 'Test',
    child_wish: 'Bike',
    child_deed: 'Helping',
    parent_phone: '5551234567'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/create-payment-intent',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
