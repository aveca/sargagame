/**
 * Corrige TOUTES les coordonnées des plages en utilisant la proximité géographique
 * avec les données OpenStreetMap.
 *
 * Pour chaque plage dans BEACHES :
 * 1. Cherche d'abord un match par nom dans OSM
 * 2. Si pas de match nom, cherche la plage OSM la plus proche (< 3km)
 * 3. Met à jour les coordonnées inline dans le HTML
 * 4. Met à jour aussi beaches-backup.js et beaches-list.json
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '../public/sarg_carte_satellite_app.html');
const BACKUP_PATH = path.join(__dirname, '../public/data/beaches-backup.js');
const JSON_PATH = path.join(__dirname, '../public/data/beaches-list.json');

// Haversine distance en metres
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/['']/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameVariants(name) {
  const n = normalize(name);
  const v = [n];
  if (n.startsWith('plage de ')) v.push(n.slice(9), 'plage ' + n.slice(9));
  if (n.startsWith('plage du ')) v.push(n.slice(9), 'plage ' + n.slice(9));
  if (n.startsWith('plage des ')) v.push(n.slice(10), 'plage ' + n.slice(10));
  if (n.startsWith("plage d'")) v.push(n.replace(/^plage d'/, '').trim());
  if (n.startsWith('anse ')) v.push(n.slice(5));
  if (n.startsWith('grande anse')) v.push(n.replace(/grande anse\s*/, ''));
  if (n.startsWith('petite anse')) v.push(n.replace(/petite anse\s*/, ''));
  // Also try without parenthetical
  const noParens = n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (noParens !== n) v.push(noParens);
  return v;
}

function extractOsmBeaches(data) {
  const list = [];
  for (const el of data.elements || []) {
    const name = el.tags && el.tags.name;
    let lat, lng;
    if (el.type === 'node') { lat = el.lat; lng = el.lon; }
    else if (el.type === 'way' && el.center) { lat = el.center.lat; lng = el.center.lon; }
    else if (el.type === 'way' && el.bounds) {
      lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
    } else continue;
    if (lat && lng) list.push({ name: name || '', lat, lng });
  }
  return list;
}

function findNameMatch(ourName, osmList) {
  const ourVariants = nameVariants(ourName);
  for (const osm of osmList) {
    if (!osm.name) continue;
    const osmNorm = normalize(osm.name);
    for (const v of ourVariants) {
      if (osmNorm === v || (v.length > 5 && osmNorm.includes(v)) || (v.length > 5 && v.includes(osmNorm))) {
        return osm;
      }
    }
  }
  return null;
}

function findNearestOsm(lat, lng, osmList, maxDistM = 3000) {
  let best = null, bestDist = Infinity;
  for (const osm of osmList) {
    const d = haversine(lat, lng, osm.lat, osm.lng);
    if (d < bestDist && d < maxDistM) {
      bestDist = d;
      best = osm;
    }
  }
  return best ? { ...best, dist: Math.round(bestDist) } : null;
}

function main() {
  const mqPath = process.argv[2] || '/tmp/osm-mq.json';
  const gpPath = process.argv[3] || '/tmp/osm-gp.json';

  const mqOsm = extractOsmBeaches(JSON.parse(fs.readFileSync(mqPath, 'utf8')));
  const gpOsm = extractOsmBeaches(JSON.parse(fs.readFileSync(gpPath, 'utf8')));
  console.log(`OSM: ${mqOsm.length} MQ, ${gpOsm.length} GP plages`);

  let html = fs.readFileSync(HTML_PATH, 'utf8');

  let byName = 0, byProximity = 0, noMatch = 0;
  const fixes = {};
  const noMatchList = [];

  // Parse each BEACHES line
  const lineRe = /\{id:'(mq\d+|gp\d+)',ile:'(MQ|GP)',name:'([^']*(?:\\.[^']*)*)'[^}]*lat:([\d.-]+)[^}]*lng:(-?[\d.-]+)/g;
  let m;
  while ((m = lineRe.exec(html)) !== null) {
    const [, id, ile, rawName, latStr, lngStr] = m;
    const name = rawName.replace(/\\'/g, "'");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const osmList = ile === 'MQ' ? mqOsm : gpOsm;

    // 1. Try name match first
    let match = findNameMatch(name, osmList);
    let method = 'name';

    // 2. Fallback to proximity
    if (!match) {
      match = findNearestOsm(lat, lng, osmList);
      method = 'proximity';
    }

    if (match) {
      const dist = haversine(lat, lng, match.lat, match.lng);
      if (dist > 50) { // Only update if > 50m difference
        fixes[id] = { lat: match.lat, lng: match.lng, method, dist: Math.round(dist), osmName: match.name };
        if (method === 'name') byName++;
        else byProximity++;
      }
    } else {
      noMatch++;
      noMatchList.push({ id, name, lat, lng });
    }
  }

  console.log(`\nResultats:`);
  console.log(`  Match par nom: ${byName}`);
  console.log(`  Match par proximite: ${byProximity}`);
  console.log(`  Sans match: ${noMatch}`);
  console.log(`  Total corrections: ${byName + byProximity}`);

  if (noMatchList.length) {
    console.log(`\nPlages sans match OSM (garder coords actuelles):`);
    noMatchList.forEach(b => console.log(`  ${b.id} ${b.name} (${b.lat}, ${b.lng})`));
  }

  // Show biggest fixes
  const sorted = Object.entries(fixes).sort((a, b) => b[1].dist - a[1].dist);
  console.log(`\nTop 20 plus gros decalages corriges:`);
  sorted.slice(0, 20).forEach(([id, f]) => {
    console.log(`  ${id}: ${f.dist}m (${f.method}) → OSM "${f.osmName}"`);
  });

  // Apply fixes to HTML
  for (const [id, fix] of Object.entries(fixes)) {
    // Replace in BEACHES array lines
    const beachRe = new RegExp(`(\\{id:'${id}'[^}]*?)lat:[\\d.-]+(.*?)lng:-?[\\d.-]+`, 'g');
    html = html.replace(beachRe, `$1lat:${fix.lat}$2lng:${fix.lng}`);
  }

  // Also update COORD_FIX fallback
  for (const [id, fix] of Object.entries(fixes)) {
    const fixRe = new RegExp(`${id}:\\{lat:[\\d.-]+,lng:-?[\\d.-]+`, 'g');
    html = html.replace(fixRe, `${id}:{lat:${fix.lat},lng:${fix.lng}`);
  }

  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`\nHTML mis à jour.`);

  // Update beaches-backup.js
  let backup = fs.readFileSync(BACKUP_PATH, 'utf8');
  for (const [id, fix] of Object.entries(fixes)) {
    const bRe = new RegExp(`(${id}:\\{lat:)[\\d.-]+(,lng:)-?[\\d.-]+`);
    backup = backup.replace(bRe, `$1${fix.lat}$2${fix.lng}`);
  }
  fs.writeFileSync(BACKUP_PATH, backup, 'utf8');
  console.log(`Backup mis à jour.`);

  // Update beaches-list.json
  let jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  for (const beach of jsonData) {
    if (fixes[beach.id]) {
      beach.lat = fixes[beach.id].lat;
      beach.lng = fixes[beach.id].lng;
    }
  }
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`JSON mis à jour.`);
}

main();
