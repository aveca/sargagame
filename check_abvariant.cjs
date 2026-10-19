const fs = require('fs');
const c = fs.readFileSync('src/Sargasses_PROD.jsx', 'utf8');
console.log('contains active abVariant pw_beach_dive:', c.includes('abVariant("pw_beach_dive"') && !c.includes('// Réversible'));
console.log('contains reverted comment:', c.includes('// Réversible'));