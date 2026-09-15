const contacts = require('./scripts/automation/data/b2b-contacts-unified.json');
const c1 = contacts.contacts.find(c => c.email === 'contact@diamantlesbains.com');
const c2 = contacts.contacts.find(c => c.email === 'admin@anoli-lodges.com');
console.log('Contact 1:', JSON.stringify(c1, null, 2));
console.log('---');
console.log('Contact 2:', JSON.stringify(c2, null, 2));