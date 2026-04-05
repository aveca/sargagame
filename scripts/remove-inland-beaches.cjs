/**
 * Supprime les plages interieures (fausses) du tableau BEACHES dans le HTML.
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'sarg_carte_satellite_app.html');

const TO_REMOVE = [
  'mq052', // Anse Levrier - Le Lorrain, 7km inland
  'gp067', // Plage du Helleux - Les Abymes, 6km inland
  'mq059', // Plage de Rivière-Salée - inland commune
  'gp035', // Plage de Belfond - Saint-Claude, 5km inland
  'gp039', // Anse Deux Rochers - 4km inland
  'mq064', // Plage de Bellefontaine - 4km inland
  'mq043', // Plage du Bout - Le Robert, 4km inland
  'gp082', // Plage de Rivière Sens - Gourbeyre, 4km inland
  'gp086', // Plage de Grand Étang - 3km inland (étang = lac)
  'gp058', // Anse du Sable Blanc - Petit-Bourg, 3km inland
  'gp007', // Anse Kahouanne - 3km inland
  'gp022', // Plage de Basse-Terre - 3km inland
  'mq070', // Plage de Belfond - 3km inland
];

let html = fs.readFileSync(HTML_PATH, 'utf8');
let removed = 0;

for (const id of TO_REMOVE) {
  // Match the full line: {id:'xxx',...},
  const re = new RegExp("\\{id:'" + id + "'[^}]*\\},?\\s*\n?", 'g');
  const before = html.length;
  html = html.replace(re, '');
  if (html.length < before) {
    removed++;
    console.log('  Removed: ' + id);
  } else {
    console.log('  NOT FOUND: ' + id);
  }
}

// Also remove from COORD_FIX fallback
for (const id of TO_REMOVE) {
  const re = new RegExp("\\s*" + id + ":\\{lat:[\\d.e+-]+,lng:-?[\\d.e+-]+\\},?", 'g');
  html = html.replace(re, '');
}

// Clean up any double commas or trailing commas
html = html.replace(/,\s*,/g, ',');

fs.writeFileSync(HTML_PATH, html, 'utf8');
console.log('\nRemoved ' + removed + '/' + TO_REMOVE.length + ' inland beaches.');
console.log('File saved.');
