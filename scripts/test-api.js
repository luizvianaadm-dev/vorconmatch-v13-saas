const http = require('http');

const data = JSON.stringify({
    bankStatement: [
        { id: 'B1', date: '2023-01-01', amount: 100.00, description: 'Test Bank' }
    ],
    asaasStatement: [
        { id: 'F1', date: '2023-01-01', amount: 100.00, description: 'Test Fin' }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/reconcile',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
