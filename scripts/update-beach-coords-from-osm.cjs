/**
 * Met à jour les coordonnées des plages dans sarg_carte_satellite.html
 * à partir des données OpenStreetMap (natural=beach).
 * - Appelle l'API Overpass pour Martinique et Guadeloupe
 * - Fait correspondre par nom normalisé
 * - Remplace lat/lng dans le tableau BEACHES et désactive COORD_FIX
 */

const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const HTML_PATH = path.join(__dirname, '../public/sarg_carte_satellite_app.html');

// Bbox Martinique / Guadeloupe
const BBOX_MQ = [14.35, -61.25, 14.92, -60.80];
const BBOX_GP = [15.82, -61.85, 16.55, -61.00];

function overpassQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:25];
(
  node["natural"="beach"](${s},${w},${n},${e});
  way["natural"="beach"](${s},${w},${n},${e});
);
out center;
  `.trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOverpass(bbox) {
  const query = overpassQuery(bbox);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  return res.json();
}

function extractOsmBeaches(data) {
  const list = [];
  for (const el of data.elements || []) {
    const name = el.tags && el.tags.name;
    let lat, lng;
    if (el.type === 'node') {
      lat = el.lat;
      lng = el.lon;
    } else if (el.type === 'way' && el.bounds) {
      lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
    } else if (el.type === 'way' && el.center) {
      lat = el.center.lat;
      lng = el.center.lon;
    } else continue;
    if (name) list.push({ name, lat, lng });
  }
  return list;
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameVariants(name) {
  const n = normalize(name);
  const variants = [n];
  if (n.startsWith('plage de ')) variants.push(n.slice(9), 'plage ' + n.slice(9));
  if (n.startsWith('plage du ')) variants.push(n.slice(9), 'plage ' + n.slice(9));
  if (n.startsWith('plage des ')) variants.push(n.slice(10), 'plage ' + n.slice(10));
  if (n.startsWith("plage d'")) variants.push(n.replace(/^plage d'/, '').trim());
  if (n.startsWith('anse ')) variants.push(n.slice(5));
  if (n.startsWith('grande anse')) variants.push(n.replace(/grande anse\s*/, ''));
  if (n.startsWith('petite anse')) variants.push(n.replace(/petite anse\s*/, ''));
  return variants;
}

function findBestMatch(ourName, osmList) {
  const ourVariants = nameVariants(ourName);
  for (const osm of osmList) {
    const osmNorm = normalize(osm.name);
    for (const v of ourVariants) {
      if (osmNorm === v || osmNorm.includes(v) || v.includes(osmNorm)) return osm;
      if (v.length > 8 && (osmNorm.includes(v) || v.includes(osmNorm))) return osm;
    }
  }
  return null;
}

function parseBeachLine(line) {
  const idMatch = line.match(/id:\s*['"]([^'"]+)['"]/);
  const nameMatch = line.match(/name:\s*['"]([^'"]*(?:\\.[^'"]*)*)['"]/);
  const ileMatch = line.match(/ile:\s*['"](MQ|GP)['"]/);
  const latMatch = line.match(/lat:\s*([\d.-]+)/);
  const lngMatch = line.match(/lng:\s*(-?[\d.-]+)/);
  if (!idMatch || !nameMatch || !latMatch || !lngMatch) return null;
  const name = nameMatch[1].replace(/\\'/g, "'");
  return {
    id: idMatch[1],
    ile: (ileMatch && ileMatch[1]) || (idMatch[1].startsWith('mq') ? 'MQ' : 'GP'),
    name,
    lat: parseFloat(latMatch[1]),
    lng: parseFloat(lngMatch[1]),
    line,
  };
}

function replaceLatLngInLine(line, lat, lng) {
  return line
    .replace(/lat:\s*[\d.-]+/, 'lat:' + lat)
    .replace(/lng:\s*-?[\d.-]+/, 'lng:' + lng);
}

async function main() {
  let mqData, gpData;
  const mqPath = process.argv[2];
  const gpPath = process.argv[3];
  if (mqPath && gpPath) {
    console.log('Lecture des fichiers OSM locaux...');
    mqData = JSON.parse(fs.readFileSync(mqPath, 'utf8'));
    gpData = JSON.parse(fs.readFileSync(gpPath, 'utf8'));
  } else {
    console.log('Récupération des plages OSM Martinique...');
    mqData = await fetchOverpass(BBOX_MQ);
    await sleep(2000);
    console.log('Récupération des plages OSM Guadeloupe...');
    gpData = await fetchOverpass(BBOX_GP);
  }
  const mqBeaches = extractOsmBeaches(mqData);
  const gpBeaches = extractOsmBeaches(gpData);
  console.log('  Martinique:', mqBeaches.length, 'plages nommées');
  console.log('  Guadeloupe:', gpBeaches.length, 'plages nommées');

  let html = fs.readFileSync(HTML_PATH, 'utf8');

  const lineRe = /^(\s*)\{id:'(mq\d+|gp\d+)'[^]*?\},?\s*$/gm;
  let match;
  let updated = 0;
  const replacements = [];

  while ((match = lineRe.exec(html)) !== null) {
    const fullLine = match[0];
    const parsed = parseBeachLine(fullLine);
    if (!parsed) continue;
    const osmList = parsed.ile === 'MQ' ? mqBeaches : gpBeaches;
    const osm = findBestMatch(parsed.name, osmList);
    if (osm) {
      const newLine = replaceLatLngInLine(fullLine, osm.lat, osm.lng);
      if (newLine !== fullLine) {
        replacements.push({ from: fullLine, to: newLine, id: parsed.id, name: parsed.name });
        updated++;
      }
    }
  }

  for (const r of replacements) {
    html = html.replace(r.from, r.to);
  }
  console.log('Coordonnées mises à jour:', updated, 'plages');

  const coordFixApply = "BEACHES.forEach(b=>{ const fix=COORD_FIX[b.id]; if(fix){ b.lat=fix.lat; b.lng=fix.lng; } });";
  if (html.includes(coordFixApply)) {
    html = html.replace(
      coordFixApply,
      "// Coordonnées uniquement depuis BEACHES (coords OSM / manuelles) — COORD_FIX désactivé.\n  // BEACHES.forEach(b=>{ const fix=COORD_FIX[b.id]; if(fix){ b.lat=fix.lat; b.lng=fix.lng; } });"
    );
    console.log('COORD_FIX désactivé.');
  }

  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('Fichier écrit:', HTML_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
