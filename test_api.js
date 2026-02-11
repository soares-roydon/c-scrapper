const http = require('http');

const data = JSON.stringify({
    url: 'https://clutch.co/developers/blockchain'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/scrape',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log("Sending request to scrape...");

const req = http.request(options, res => {
    console.log(`Status Code: ${res.statusCode}`);

    let responseData = '';

    res.on('data', chunk => {
        responseData += chunk;
    });

    res.on('end', () => {
        console.log('Response:', responseData);
    });
});

req.on('error', error => {
    console.error('Error:', error);
});

req.write(data);
req.end();
