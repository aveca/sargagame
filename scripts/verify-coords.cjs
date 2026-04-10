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

// ── Duplicate coords check — source of truth: public/data/beaches-list.json ──
// Incident 2026-04-10 : mq014/mq015 and mq016/mq018 shared identical lat/lng,
// causing pins to stack invisibly on the Leaflet map. Guard against regression.
const LIST_PATH = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json');
try {
  const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  const coordToIds = {};
  for (const b of list) {
    const key = `${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
    (coordToIds[key] ??= []).push(`${b.id} (${b.name})`);
  }
  const dups = Object.entries(coordToIds).filter(([, ids]) => ids.length > 1);
  console.log(`\nbeaches-list.json: ${list.length} plages, ${dups.length} doublon(s) de coordonnees`);
  if (dups.length) {
    console.log('DOUBLONS DETECTES (pins se chevaucheront sur la carte):');
    for (const [coord, ids] of dups) {
      console.log(`  ${coord} → ${ids.join(', ')}`);
    }
    process.exitCode = 1;
  }
} catch (e) {
  console.log('\n[skip] beaches-list.json check:', e.message);
}
