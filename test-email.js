import https from 'https';

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const domain = 'sargasses-martinique.com';

const data = JSON.stringify({
  from: 'yacovassaraf@gmail.com',
  to: 'contact@' + domain,
  subject: 'Test email Sprint #14',
  html: '<p>Ceci est un email de test du Sprint #14</p>'
});

const options = {
  hostname: 'api.resend.com',
  path: '/emails',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + RESEND_KEY,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.write(data);
req.end();