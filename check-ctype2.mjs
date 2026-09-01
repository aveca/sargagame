import https from 'https';

const jsUrl = 'https://sargazotulum.com/assets/index-D-L2SOkD.js';
const parsed = new URL(jsUrl);
const options = {
  hostname: parsed.hostname,
  path: parsed.pathname + parsed.search,
  method: 'GET',
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('URL:', jsUrl);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Status:', res.statusCode);
    console.log('Data length:', data.length);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();