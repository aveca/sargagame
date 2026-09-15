const { emailHash } = require('./scripts/automation/lib/email-hash.cjs');
const email1 = 'contact@diamantlesbains.com';
const email2 = 'admin@anoli-lodges.com';
console.log('hash1:', emailHash(email1));
console.log('hash2:', emailHash(email2));