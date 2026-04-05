/**
 * Synchronise les coordonnées du tableau BEACHES inline (dans sarg_carte_satellite_app.html)
 * avec les coordonnées du COORD_FIX backup (beaches-backup.js).
 *
 * Le backup a les coordonnées les plus précises (martinique-tour.com / OSM corrigé).
 * Ce script :
 * 1. Lit le backup pour extraire COORD_FIX
 * 2. Parse chaque ligne BEACHES dans le HTML
 * 3. Remplace lat/lng par les valeurs du backup
 * 4. Désactive le COORD_FIX override (plus besoin, les coords inline sont déjà bonnes)
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '../public/sarg_carte_satellite_app.html');
const BACKUP_PATH = path.join(__dirname, '../public/data/beaches-backup.js');

// Parse beaches-backup.js pour extraire COORD_FIX
function parseBackupCoords(backupContent) {
  const coords = {};
  // Match patterns like: mq001:{lat:14.40478345,lng:-60.8813762,img:'...'},
  const re = /(mq\d+|gp\d+):\{lat:([\d.-]+),lng:([\d.-]+)/g;
  let m;
  while ((m = re.exec(backupContent)) !== null) {
    coords[m[1]] = { lat: parseFloat(m[2]), lng: parseFloat(m[3]) };
  }
  return coords;
}

function main() {
  // 1. Lire le backup
  const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');
  const coordFix = parseBackupCoords(backupContent);
  console.log(`Backup: ${Object.keys(coordFix).length} coordonnées extraites`);

  // 2. Lire le HTML
  let html = fs.readFileSync(HTML_PATH, 'utf8');

  // 3. Remplacer les coords inline dans chaque ligne BEACHES
  let updated = 0;
  let notFound = 0;
  const missing = [];

  // Match chaque ligne de beach: {id:'mq001',...,lat:xxx,lng:yyy,...}
  html = html.replace(
    /(\{id:'(mq\d+|gp\d+)'[^}]*?)lat:([\d.-]+)([^}]*?)lng:(-?[\d.-]+)/g,
    (match, prefix, id, oldLat, middle, oldLng) => {
      const fix = coordFix[id];
      if (fix) {
        updated++;
        return `${prefix}lat:${fix.lat}${middle}lng:${fix.lng}`;
      }
      missing.push(id);
      notFound++;
      return match; // pas de changement
    }
  );

  console.log(`Coordonnées mises à jour: ${updated} plages`);
  if (notFound > 0) {
    console.log(`Sans correspondance dans le backup: ${notFound} plages`);
    console.log(`  IDs: ${missing.join(', ')}`);
  }

  // 4. Écrire le fichier
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`Fichier écrit: ${HTML_PATH}`);
}

main();
