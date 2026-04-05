/**
 * CORRECTION FINALE des coordonnées des plages.
 *
 * Strategie :
 * - Match par nom OSM avec bounds check (meme ile)
 * - PAS de limite de distance pour les matchs par nom (les coords actuelles sont trop fausses)
 * - Pour les plages sans match nom : proximite 3km max
 * - Met a jour les 3 fichiers : HTML (BEACHES inline + COORD_FIX), backup, JSON
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'sarg_carte_satellite_app.html');
const BACKUP_PATH = path.join(__dirname, '..', 'public', 'data', 'beaches-backup.js');
const JSON_PATH = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json');
const OSM_MQ_PATH = path.join(__dirname, 'osm-mq.json');
const OSM_GP_PATH = path.join(__dirname, 'osm-gp.json');

// ── Helpers ──────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[''´`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Geographic bounds per island
function isMQ(lat, lng) {
  return lat > 14.35 && lat < 14.95 && lng > -61.25 && lng < -60.75;
}
function isGPmain(lat, lng) {
  // Grande-Terre + Basse-Terre
  return lat > 15.95 && lat < 16.55 && lng > -61.85 && lng < -60.95;
}
function isGPsaintes(lat, lng) {
  return lat > 15.82 && lat < 15.92 && lng > -61.70 && lng < -61.50;
}
function isGPmariegalante(lat, lng) {
  return lat > 15.85 && lat < 15.96 && lng > -61.35 && lng < -61.15;
}
function isGPdesirade(lat, lng) {
  return lat > 16.28 && lat < 16.36 && lng > -61.12 && lng < -60.82;
}
function isGP(lat, lng) {
  return isGPmain(lat, lng) || isGPsaintes(lat, lng) || isGPmariegalante(lat, lng) || isGPdesirade(lat, lng);
}

// ── OSM extraction ───────────────────────────────────────────

function extractOsm(data) {
  const list = [];
  for (const el of data.elements || []) {
    let lat, lng;
    if (el.type === 'node') {
      lat = el.lat;
      lng = el.lon;
    } else if (el.type === 'way' && el.center) {
      lat = el.center.lat;
      lng = el.center.lon;
    } else if (el.type === 'way' && el.bounds) {
      lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
    } else {
      continue;
    }
    const name = el.tags && el.tags.name;
    if (lat && lng) list.push({ name: name || '', lat, lng, hasName: !!name });
  }
  return list;
}

// ── Name matching ────────────────────────────────────────────

function nameVariants(name) {
  const n = normalize(name);
  const v = new Set([n]);
  // Strip common prefixes
  for (const prefix of ['plage de ', 'plage du ', 'plage des ', "plage d'", "plage de l'",
    'anse ', 'grande anse ', 'petite anse ', 'grande anse de ', "grande anse d'"]) {
    if (n.startsWith(prefix)) v.add(n.slice(prefix.length).trim());
  }
  // Without parenthetical
  const noP = n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (noP !== n) {
    v.add(noP);
    for (const prefix of ['plage de ', 'plage du ', 'anse ']) {
      if (noP.startsWith(prefix)) v.add(noP.slice(prefix.length).trim());
    }
  }
  return [...v].filter(s => s.length > 3);
}

function nameMatchScore(ourName, osmName) {
  if (!osmName) return 0;
  const a = normalize(ourName);
  const b = normalize(osmName);
  if (a === b) return 100;

  const aVars = nameVariants(ourName);
  const bVars = nameVariants(osmName);

  for (const av of aVars) {
    for (const bv of bVars) {
      if (av === bv) return 90;
    }
  }
  for (const av of aVars) {
    for (const bv of bVars) {
      if (av.length > 5 && bv.length > 5) {
        if (bv.includes(av) || av.includes(bv)) return 70;
      }
    }
  }
  return 0;
}

// ── Main matching logic ──────────────────────────────────────

function findBestMatch(beach, osmList, boundsCheck) {
  const candidates = [];

  for (const osm of osmList) {
    // Must be on the same island
    if (!boundsCheck(osm.lat, osm.lng)) continue;

    const score = osm.hasName ? nameMatchScore(beach.name, osm.name) : 0;
    if (score >= 70) {
      const dist = haversine(beach.lat, beach.lng, osm.lat, osm.lng);
      candidates.push({ ...osm, score, dist });
    }
  }

  // Sort: higher score first, then closer distance
  candidates.sort((a, b) => b.score - a.score || a.dist - b.dist);

  if (candidates.length > 0) {
    return { ...candidates[0], method: 'name' };
  }

  // Fallback: nearest OSM beach (named or not) within 3km on same island
  let best = null;
  let bestDist = 3000;
  for (const osm of osmList) {
    if (!boundsCheck(osm.lat, osm.lng)) continue;
    const d = haversine(beach.lat, beach.lng, osm.lat, osm.lng);
    if (d < bestDist) {
      bestDist = d;
      best = { ...osm, dist: d, score: 0, method: 'proximity' };
    }
  }

  return best;
}

// ── Parse HTML BEACHES ───────────────────────────────────────

function parseBeachesFromHtml(html) {
  const beaches = [];
  const re = /\{id:'(mq\d+|gp\d+)',ile:'(MQ|GP)',name:'((?:[^'\\]|\\.)*)'[^}]*?lat:([\d.e+-]+)[^}]*?lng:(-?[\d.e+-]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    beaches.push({
      id: m[1],
      ile: m[2],
      name: m[3].replace(/\\'/g, "'"),
      lat: parseFloat(m[4]),
      lng: parseFloat(m[5]),
    });
  }
  return beaches;
}

// ── Apply fixes ──────────────────────────────────────────────

function applyToHtml(html, fixes) {
  let count = 0;
  for (const [id, coord] of Object.entries(fixes)) {
    // Update BEACHES inline: match the line containing this id and replace lat/lng
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lineRe = new RegExp(
      "(\\{id:'" + escaped + "'[^}]*?)lat:[\\d.e+-]+(.*?)lng:-?[\\d.e+-]+",
    );
    if (lineRe.test(html)) {
      html = html.replace(lineRe, '$1lat:' + coord.lat + '$2lng:' + coord.lng);
      count++;
    }

    // Update COORD_FIX fallback
    const fixRe = new RegExp(escaped + ':\\{lat:[\\d.e+-]+,lng:-?[\\d.e+-]+');
    if (fixRe.test(html)) {
      html = html.replace(fixRe, id + ':{lat:' + coord.lat + ',lng:' + coord.lng);
    }
  }
  return { html, count };
}

function applyToBackup(backup, fixes) {
  let count = 0;
  for (const [id, coord] of Object.entries(fixes)) {
    const re = new RegExp('(' + id + ':\\{lat:)[\\d.e+-]+(,lng:)-?[\\d.e+-]+');
    if (re.test(backup)) {
      backup = backup.replace(re, '$1' + coord.lat + '$2' + coord.lng);
      count++;
    }
  }
  return { backup, count };
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  console.log('Loading OSM data...');
  const mqOsm = extractOsm(JSON.parse(fs.readFileSync(OSM_MQ_PATH, 'utf8')));
  const gpOsm = extractOsm(JSON.parse(fs.readFileSync(OSM_GP_PATH, 'utf8')));
  console.log('  MQ:', mqOsm.length, 'features (' + mqOsm.filter(o => o.hasName).length + ' named)');
  console.log('  GP:', gpOsm.length, 'features (' + gpOsm.filter(o => o.hasName).length + ' named)');

  console.log('\nParsing HTML BEACHES...');
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  const beaches = parseBeachesFromHtml(html);
  console.log('  Found', beaches.length, 'beaches');

  const fixes = {};
  let byName = 0, byProximity = 0, noMatch = 0, unchanged = 0;
  const noMatchList = [];
  const bigFixes = [];

  for (const b of beaches) {
    const osmList = b.ile === 'MQ' ? mqOsm : gpOsm;
    const boundsCheck = b.ile === 'MQ' ? isMQ : isGP;

    const match = findBestMatch(b, osmList, boundsCheck);

    if (match) {
      const dist = haversine(b.lat, b.lng, match.lat, match.lng);
      // Cap at 10km — beyond that it's likely a false match (same name, different location)
      if (dist > 30 && dist < 10000) {
        fixes[b.id] = { lat: match.lat, lng: match.lng };
        if (match.method === 'name') byName++;
        else byProximity++;
        if (dist > 300) {
          bigFixes.push({
            id: b.id, name: b.name, dist: Math.round(dist),
            osmName: match.name, method: match.method,
          });
        }
      } else if (dist >= 10000) {
        noMatch++;
        noMatchList.push({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, reason: 'match too far (' + Math.round(dist/1000) + 'km)' });
      } else {
        unchanged++;
      }
    } else {
      noMatch++;
      noMatchList.push({ id: b.id, name: b.name, lat: b.lat, lng: b.lng });
    }
  }

  console.log('\n── Results ──');
  console.log('  Matched by name:', byName);
  console.log('  Matched by proximity:', byProximity);
  console.log('  Unchanged (<30m):', unchanged);
  console.log('  No match:', noMatch);
  console.log('  Total fixes:', byName + byProximity);

  if (noMatchList.length) {
    console.log('\n  No OSM match (keep as-is):');
    noMatchList.forEach(b => console.log('    ' + b.id + ' ' + b.name));
  }

  if (bigFixes.length) {
    bigFixes.sort((a, b) => b.dist - a.dist);
    console.log('\n  Biggest corrections (>300m):');
    bigFixes.slice(0, 30).forEach(f => {
      console.log('    ' + f.id + ' ' + f.name + ' → ' + f.dist + 'm (' + f.method + ': "' + f.osmName + '")');
    });
    if (bigFixes.length > 30) console.log('    ... and', bigFixes.length - 30, 'more');
  }

  // Apply
  console.log('\nApplying fixes...');
  const htmlResult = applyToHtml(html, fixes);
  fs.writeFileSync(HTML_PATH, htmlResult.html, 'utf8');
  console.log('  HTML: ' + htmlResult.count + ' beaches updated');

  let backup = fs.readFileSync(BACKUP_PATH, 'utf8');
  const backupResult = applyToBackup(backup, fixes);
  fs.writeFileSync(BACKUP_PATH, backupResult.backup, 'utf8');
  console.log('  Backup: ' + backupResult.count + ' entries updated');

  const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  let jsonCount = 0;
  for (const beach of jsonData) {
    if (fixes[beach.id]) {
      beach.lat = fixes[beach.id].lat;
      beach.lng = fixes[beach.id].lng;
      jsonCount++;
    }
  }
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log('  JSON: ' + jsonCount + ' beaches updated');

  console.log('\nDone.');
}

main();
