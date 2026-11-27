const fs = require('fs');
const path = require('path');
const root = process.cwd();
const src = path.join(root, 'public', 'premium', 'index.html');
const html = fs.readFileSync(src, 'utf8');
const regions = [
  { id: 'mq', dir: 'martinique-ftp' },
  { id: 'gp', dir: 'guadeloupe-ftp' },
  { id: 'florida', dir: 'florida-ftp' },
  { id: 'puntacana', dir: 'puntacana-ftp' },
  { id: 'rivieramaya', dir: 'rivieramaya-ftp' },
  { id: 'tulum', dir: 'tulum-ftp' },
];
for (const r of regions) {
  const dest = path.join(root, r.dir, 'premium', 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
  console.log('OK:', r.id, '->', dest);
}
console.log('\nOK: pages premium créées dans', regions.length, 'dossiers ftp.');