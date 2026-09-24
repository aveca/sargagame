/**
 * report.cjs — rapport quotidien de l'autopilote.
 *
 *   node scripts/autopilot/report.cjs [--date=YYYY-MM-DD]
 *
 * Assemble : ce qui a été OBSERVÉ (dernier run), RECHERCHÉ/BÂTI/TESTÉ (git log 24 h +
 * experiments.md), CHANGÉ EN PROD (commits sur main), APPRIS (patterns/regressions),
 * NEXT PRIORITY (tête de opportunities.md).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AP = path.join(ROOT, '.ai', 'autopilot');

const dateArg = (process.argv.find(a => a.startsWith('--date=')) || '').split('=')[1];
const DATE = dateArg || new Date().toISOString().slice(0, 10);

function latestObs() {
  try {
    const latest = JSON.parse(fs.readFileSync(path.join(AP, 'observations', 'latest.json'), 'utf8'));
    const file = path.join(AP, 'observations', latest.dir, 'observations.json');
    return { dir: latest.dir, obs: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (_) { return null; }
}

function git24h() {
  try {
    return execSync('git log --since="24 hours ago" --oneline --no-decorate', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch (_) { return []; }
}

function head(p, n) {
  try { return fs.readFileSync(p, 'utf8').split('\n').slice(0, n).join('\n'); } catch (_) { return ''; }
}

const lo = latestObs();
const commits = git24h();

let observed = '_aucun run disponible_';
if (lo) {
  const o = lo.obs;
  const errs = o.runs.reduce((a, r) => a + r.consoleErrors.length + r.pageErrors.length, 0);
  const broken = o.runs.reduce((a, r) => a + r.brokenLinks.length, 0);
  const net = o.runs.reduce((a, r) => a + r.failedRequests.length, 0);
  const slow = o.runs.filter(r => r.perf.load > 5000).map(r => `${r.region}/${r.viewport}${r.route} ${r.perf.load}ms`);
  const ix = (o.interactions || []).map(i =>
    `- ${i.region} : carte=${i.mapReady ? 'OK' : 'KO'} fiche=${i.beachSheet ? 'OK' : 'KO'} xp=${i.experience ? 'OK' : 'KO'} tomorrow=${i.tomorrow ? 'OK' : 'KO'} backup=${i.backup ? 'OK' : 'KO'} trip=${i.trip ? 'OK' : 'KO'} share=${i.share ? 'OK' : 'KO'} premium=${i.premiumModal ? 'OK' : 'KO'} checkout=${i.checkoutEntry ? 'OK' : 'KO'}`).join('\n');
  observed = [
    `- Run \`${lo.dir}\` : ${o.runs.length} routes × (${o.meta.viewports.join(', ')}) sur ${o.meta.domains.join(', ')}`,
    `- Erreurs console/page : **${errs}** · échecs réseau : **${net}** · liens cassés : **${broken}**`,
    slow.length ? `- Routes lentes (>5s) : ${slow.join(' · ')}` : '- Aucune route > 5 s au load',
    '- Interactions (mobile) :\n' + ix,
  ].join('\n');
}

const oppHead = head(path.join(AP, 'opportunities.md'), 60);
const topOpp = (oppHead.match(/### OPP-[^\n]+/) || ['_aucune opportunité ouverte — cycle RESEARCH+ANALYZE requis_'])[0];

const report = `# Autopilot — Rapport ${DATE}

## WHAT IT OBSERVED
${observed}

## WHAT IT RESEARCHED
${head(path.join(AP, 'research.md'), 30) && fs.existsSync(path.join(AP, 'research.md')) ? head(path.join(AP, 'research.md'), 30) : '_rien ce jour_'}

## WHAT IT BUILT
${commits.length ? commits.map(c => '- ' + c).join('\n') : '_rien ce jour_'}

## WHAT IT TESTED
- Gate de ship : voir runs CI du jour (\`gh run list\`)
- Browser QA : cf. WHAT IT OBSERVED (screenshots dans observations/)

## WHAT CHANGED IN PROD
${commits.filter(c => !c.includes('autopilot') && !c.includes('docs(')).map(c => '- ' + c).join('\n') || '_rien ce jour_'}

## WHAT IT LEARNED
- Régressions : ${fs.existsSync(path.join(AP, 'regressions.md')) ? 'voir regressions.md (dernière entrée)' : 'n/a'}
- Patterns : ${head(path.join(AP, 'patterns.md'), 200).includes('(vide') ? 'aucun encore mesuré' : 'voir patterns.md'}

## NEXT PRIORITY
${topOpp}
`;

const outFile = path.join(AP, 'reports', `${DATE}.md`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, report);
console.log('REPORT_WRITTEN', path.relative(ROOT, outFile));
