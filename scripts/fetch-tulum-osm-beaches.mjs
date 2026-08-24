/** Overpass — plages OSM réelles de la zone Tulum (cff. QUOTE-FREE) */
const q = [
  '[out:json][timeout:60];(',
  'node["natural"="beach"](20.02,-87.58,20.44,-87.32);',
  'way["natural"="beach"](20.02,-87.58,20.44,-87.32);',
  'relation["natural"="beach"](20.02,-87.58,20.44,-87.32);',
  'node["leisure"="beach_resort"][name](20.02,-87.58,20.44,-87.32);',
  'way["leisure"="beach_resort"][name](20.02,-87.58,20.44,-87.32);',
  ');out center tags;'
].join('\n');

const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
let j = null, lastErr = null;
for (const ep of ENDPOINTS) {
  try {
    process.stdout.write('ESSAI ' + ep + ' … ');
    const r = await fetch(ep + '?data=' + encodeURIComponent(q), { headers: { 'User-Agent': 'sargasses-tulum-provisioning/1.0 (alerte@sargasses-martinique.com)' } });
    const txt = await r.text();
    if (txt.startsWith('<')) throw new Error('HTML (' + r.status + ')');
    j = JSON.parse(txt);
    console.log('OK');
    break;
  } catch (e) { lastErr = e; console.log('KO: ' + e.message.slice(0, 60)); await new Promise(r2 => setTimeout(r2, 2000)); }
}
if (!j) { console.error('Overpass indisponible:', lastErr?.message); process.exit(2); }
const items = (j.elements || [])
  .map(e => ({ name: e.tags?.name || null, type: e.tags?.natural ? 'natural/' + e.tags.natural : 'leisure/' + e.tags?.leisure, access: e.tags?.access || null, fee: e.tags?.fee || null, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
  .filter(x => typeof x.lat === 'number' && typeof x.lng === 'number');
console.log('total elements:', items.length);
console.log(JSON.stringify(items.filter(i => i.name), null, 1));
