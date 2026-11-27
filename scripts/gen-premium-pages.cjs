const fs = require('fs');
const path = require('path');
const { buildPage } = require('./lib/premium-page.cjs');
const { getAllRegions } = require('./regions/index.cjs');

const root = process.cwd();
const dist = path.join(root, 'dist');
const regions = getAllRegions().filter(r => r.live !== false);

if (!fs.existsSync(path.join(dist, 'premium'))) {
  fs.mkdirSync(path.join(dist, 'premium'), { recursive: true });
}

for (const region of regions) {
  const html = buildPage(region);

  // Écrire dans dist/ (pour que prepare-ftp copie dans chaque région au prochain build)
  const distPath = path.join(dist, 'premium', 'index.html');
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, html, 'utf8');

  // Écrire aussi directement dans chaque ftpDir pour déploiement immédiat
  const ftpDir = region.ftpDir;
  const ftpPath = path.join(ftpDir, 'premium', 'index.html');
  fs.mkdirSync(path.dirname(ftpPath), { recursive: true });
  fs.writeFileSync(ftpPath, html, 'utf8');

  console.log(`OK: ${region.id} (${region.domain}) -> ${ftpPath}`);
}

console.log('\n✓ Pages premium générées pour', regions.length, 'régions.');