/**
 * baselines.cjs — gestion des baselines + détection de régressions.
 *
 *   node scripts/autopilot/baselines.cjs --update  <observations.json>   # nouvelle référence
 *   node scripts/autopilot/baselines.cjs --compare <observations.json>   # diff vs référence
 *
 * Régressions détectées (et loguées dans .ai/autopilot/regressions.md) :
 *   - load > baseline × 1.25 ET + 400 ms
 *   - nouvelles erreurs console / pageerror vs baseline
 *   - liens cassés nouveaux ou en hausse
 *   - status HTTP >= 400 sur une route qui répondait
 * Exit code : --compare sort 1 si régression (bloquant pour le merge automatique).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE_FILE = path.join(ROOT, '.ai', 'autopilot', 'baselines.json');
const REG_FILE = path.join(ROOT, '.ai', 'autopilot', 'regressions.md');

const key = (r) => `${r.region}|${r.viewport}|${r.route}`;
const loadObs = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const loadBase = () => { try { return JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')); } catch (_) { return { meta: {}, routes: {} }; } };

function snapshot(run) {
  return {
    status: run.status,
    load: run.perf && run.perf.load || 0,
    dcl: run.perf && run.perf.dcl || 0,
    lcp: (run.perf && run.perf.lcp) || 0,
    transferKB: (run.perf && run.perf.transferKB) || 0,
    consoleErrors: run.consoleErrors || [],
    pageErrors: run.pageErrors || [],
    brokenLinks: (run.brokenLinks || []).map(b => b.url),
    failedCount: (run.failedRequests || []).length,
    at: new Date().toISOString(),
  };
}

function update(obsFile) {
  const obs = loadObs(obsFile);
  const base = loadBase();
  for (const r of obs.runs || []) base.routes[key(r)] = snapshot(r);
  base.meta = { updatedAt: new Date().toISOString(), from: obsFile };
  fs.writeFileSync(BASE_FILE, JSON.stringify(base, null, 2));
  console.log(`BASELINE_UPDATED routes=${Object.keys(base.routes).length}`);
}

function compare(obsFile) {
  const obs = loadObs(obsFile);
  const base = loadBase();
  const regressions = [];
  for (const r of obs.runs || []) {
    const k = key(r);
    const b = base.routes[k];
    if (!b) continue; // nouvelle route : pas de référence
    const now = snapshot(r);
    const regress = [];
    if (now.status && now.status >= 400 && !(b.status >= 400)) regress.push(`status ${b.status}→${now.status}`);
    if (now.load > b.load * 1.25 && now.load > b.load + 400) regress.push(`load ${b.load}ms→${now.load}ms`);
    if (now.lcp && b.lcp && now.lcp > b.lcp * 1.25 && now.lcp > b.lcp + 400) regress.push(`lcp ${b.lcp}ms→${now.lcp}ms`);
    const newErrs = [...now.consoleErrors, ...now.pageErrors].filter(e => ![...b.consoleErrors, ...b.pageErrors].some(be => be.slice(0, 60) === e.slice(0, 60)));
    if (newErrs.length) regress.push(`nouvelles erreurs: ${newErrs.slice(0, 3).join(' | ').slice(0, 200)}`);
    const newBroken = now.brokenLinks.filter(u => !b.brokenLinks.includes(u));
    if (newBroken.length) regress.push(`liens cassés +${newBroken.length}: ${newBroken.slice(0, 3).join(', ').slice(0, 160)}`);
    if (regress.length) regressions.push({ key: k, url: r.url, regress });
  }
  if (regressions.length) {
    const stamp = new Date().toISOString();
    const entry = '\n\n## ' + stamp.slice(0, 16).replace('T', ' ') + ' UTC — ' + regressions.length + ' régression(s)\n' +
      regressions.map(g => `- **${g.key}** (${g.url}) : ${g.regress.join(' · ')}`).join('\n');
    fs.appendFileSync(REG_FILE, entry + '\n');
    for (const g of regressions) console.log('REGRESSION', g.key, '—', g.regress.join(' · '));
    console.log(`REGRESSIONS=${regressions.length}`);
    process.exit(1);
  }
  console.log('REGRESSIONS=0');
  process.exit(0);
}

if (require.main === module) {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: baselines.cjs --update|--compare <observations.json>'); process.exit(2); }
  if (process.argv.includes('--update')) update(file);
  else if (process.argv.includes('--compare')) compare(file);
  else { console.error('missing --update or --compare'); process.exit(2); }
}
module.exports = { update, compare };
