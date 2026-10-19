// Re-activate pw_beach_dive A/B test
const fs = require('fs');
let code = fs.readFileSync('src/Sargasses_PROD.jsx', 'utf8');

// Find and replace the specific commented line
const oldLine = '// Réversible : restaurer abVariant(\"pw_beach_dive\",[\"control\",\"dive\"],[.5,.5])===dive\\".';
const newLine = 'abVariant(\"pw_beach_dive\",[\"control\",\"dive\"],[.5,.5])===dive // A/B test activé - variante dive gagnante +84% @95% (n=416/469, 28j)';

// Replace
code = code.replace(oldLine, newLine);

// Write back
fs.writeFileSync('src/Sargasses_PROD.jsx', code);
console.log('Replacement done');

// Verify
const c2 = fs.readFileSync('src/Sargasses_PROD.jsx', 'utf8');
console.log('Verify - contains active abVariant:', c2.includes('abVariant("pw_beach_dive"') && !c2.includes('// Réversible'));
console.log('Verify - contains reverted comment:', c2.includes('// Réversible'));