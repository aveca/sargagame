global.process.env.SMTP_PASS = 'test';
global.process.env.SMTP_HOST = 'premium115.web-hosting.com';
global.process.env.SMTP_PORT = '465';
global.process.env.SMTP_USER = 'alerte@sargasses-martinique.com';
const m = require('./scripts/automation/lib/email-send.cjs');
const mailReady = m.mailReady;
console.log('mailReady():', mailReady());