/**
 * Trouve les plages suspectes : communes interieures, noms de lacs/rivieres,
 * ou coordonnees clairement a l'interieur des terres.
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'sarg_carte_satellite_app.html');
const OSM_MQ = path.join(__dirname, 'osm-mq.json');
const OSM_GP = path.join(__dirname, 'osm-gp.json');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function extractOsm(data) {
  const list = [];
  for (const el of data.elements || []) {
    let lat, lng;
    if (el.type === 'node') { lat = el.lat; lng = el.lon; }
    else if (el.type === 'way' && el.center) { lat = el.center.lat; lng = el.center.lon; }
    else if (el.type === 'way' && el.bounds) {
      lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
    } else continue;
    if (lat && lng) list.push({ lat, lng });
  }
  return list;
}

const html = fs.readFileSync(HTML_PATH, 'utf8');

// Get all OSM beach locations (for distance-to-nearest-beach check)
const mqOsm = extractOsm(JSON.parse(fs.readFileSync(OSM_MQ, 'utf8')));
const gpOsm = extractOsm(JSON.parse(fs.readFileSync(OSM_GP, 'utf8')));

// Parse beaches
const beaches = [];
const re = /\{id:'(mq\d+|gp\d+)',ile:'(MQ|GP)',name:'((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = re.exec(html)) !== null) {
  const after = html.substring(m.index, m.index + 800);
  const communeM = after.match(/commune:'([^']*)'/);
  const latM = after.match(/lat:([\d.e+-]+)/);
  const lngM = after.match(/lng:(-?[\d.e+-]+)/);
  if (communeM && latM && lngM) {
    beaches.push({
      id: m[1], ile: m[2],
      name: m[3].replace(/\\'/g, "'"),
      commune: communeM[1],
      lat: parseFloat(latM[1]),
      lng: parseFloat(lngM[1]),
    });
  }
}

console.log('Total beaches:', beaches.length);

// For each beach, find distance to nearest OSM beach feature
const inland = [];
for (const b of beaches) {
  const osmList = b.ile === 'MQ' ? mqOsm : gpOsm;
  let minDist = Infinity;
  for (const osm of osmList) {
    const d = haversine(b.lat, b.lng, osm.lat, osm.lng);
    if (d < minDist) minDist = d;
  }
  // If the nearest OSM beach is > 800m away, this beach is suspicious
  if (minDist > 800) {
    inland.push({ ...b, distToBeach: Math.round(minDist) });
  }
}

inland.sort((a, b) => b.distToBeach - a.distToBeach);
console.log('\nPlages a > 1.5km de la plage OSM la plus proche (' + inland.length + '):');
inland.forEach(b => {
  console.log(`  ${b.id} | ${b.name} | ${b.commune} | ${Math.round(b.distToBeach/1000)}km de la cote`);
});

console.log('\nCes plages sont probablement mal placees ou n\'existent pas.');
console.log('IDs a supprimer: ' + inland.map(b => "'" + b.id + "'").join(','));
