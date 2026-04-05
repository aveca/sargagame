/**
 * Verification programmatique des coordonnees de plages.
 * Verifie que chaque plage est dans les limites de son ile.
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'sarg_carte_satellite_app.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Parse toutes les plages du tableau BEACHES
const beaches = [];
const re = /\{id:'(mq\d+|gp\d+)',ile:'(MQ|GP)',name:'((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = re.exec(html)) !== null) {
  const after = html.substring(m.index, m.index + 600);
  const latM = after.match(/lat:([\d.e+-]+)/);
  const lngM = after.match(/lng:(-?[\d.e+-]+)/);
  if (latM && lngM) {
    beaches.push({
      id: m[1], ile: m[2],
      name: m[3].replace(/\\'/g, "'"),
      lat: parseFloat(latM[1]),
      lng: parseFloat(lngM[1]),
    });
  }
}

console.log('Total plages:', beaches.length);

// Bounds check
const issues = [];
for (const b of beaches) {
  if (b.ile === 'MQ') {
    if (b.lat < 14.38 || b.lat > 14.88)
      issues.push(`${b.id} ${b.name}: lat ${b.lat} HORS Martinique`);
    if (b.lng < -61.24 || b.lng > -60.81)
      issues.push(`${b.id} ${b.name}: lng ${b.lng} HORS Martinique`);
  } else {
    if (b.lat < 15.85 || b.lat > 16.52)
      issues.push(`${b.id} ${b.name}: lat ${b.lat} HORS Guadeloupe`);
    if (b.lng < -61.82 || b.lng > -60.96)
      issues.push(`${b.id} ${b.name}: lng ${b.lng} HORS Guadeloupe`);
  }
}

if (issues.length) {
  console.log('\nPROBLEMES (coordonnees hors limites ile):');
  issues.forEach(i => console.log('  ' + i));
} else {
  console.log('\nToutes les plages sont dans les limites de leur ile.');
}

// COORD_FIX status
const active = html.includes('BEACHES.forEach(b=>{ const fix=COORD_FIX[b.id]; if(fix){ b.lat=fix.lat; b.lng=fix.lng; } });');
console.log('\nCOORD_FIX actif:', active);

// Show some sample coords to spot-check
console.log('\nExemples (5 MQ, 5 GP):');
beaches.filter(b => b.ile === 'MQ').slice(0, 5).forEach(b =>
  console.log(`  ${b.id} ${b.name}: ${b.lat}, ${b.lng}`)
);
beaches.filter(b => b.ile === 'GP').slice(0, 5).forEach(b =>
  console.log(`  ${b.id} ${b.name}: ${b.lat}, ${b.lng}`)
);
