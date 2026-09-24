// tests/unit/autopilot-core.test.cjs — Contrats de l'usine autonome (v1)
// Couvre : policy denylist/budget/automerge/secret-scan · analyze scoring/anti-répétition
// · lock PID acquire/release/stale · config présente et cohérente.
// Lancement : node tests/unit/autopilot-core.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const policy = require(path.join(root, 'scripts/autopilot/lib/policy.cjs'));
const analyze = require(path.join(root, 'scripts/autopilot/analyze.cjs'));
const lock = require(path.join(root, 'scripts/autopilot/lib/lock.cjs'));
const C = require(path.join(root, 'scripts/autopilot/lib/common.cjs'));

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('AUTOPILOT CORE — contrats\n— policy (denylist dure)');

const cfg = C.loadConfig();
const money = ['public/api/mollie.php', 'workers/sg-payments/src/index.ts', 'src/PremiumModal/PremiumModal.jsx', 'scripts/automation/mollie-paylinks.cjs', 'regions/mq.json', '.github/workflows/ci.yml', 'package.json', 'dist/index.html'];
for (const f of money) check(`DENY ${f}`, !policy.evaluateFiles([f], cfg).allowed);
const safe = ['src/Sargasses_PROD.jsx', 'src/ChasseHome.jsx', 'docs/X.md', 'tests/unit/x.test.cjs'];
for (const f of safe) check(`ALLOW ${f}`, policy.evaluateFiles([f], cfg).allowed);

console.log('— policy (budgets / automerge / secrets)');
check('budget diff : 9 fichiers > max 8 refusé', policy.evaluateBudget({ files: 9, insertions: 1, deletions: 1 }, cfg).length > 0);
check('budget diff : 2 fichiers / 50 lignes accepté', policy.evaluateBudget({ files: 2, insertions: 30, deletions: 20 }, cfg).length === 0);
check('auto-merge OFF pour code même si whitelist vide de sens', !policy.canAutoMerge(['src/x.js'], cfg));
check('scanSecrets attrape sk_live', policy.scanSecrets('const k="sk_live_ABCDEFGH1234"').length > 0);
check('scanSecrets ignore le prose normal', policy.scanSecrets('un texte ordinaire sans clé').length === 0);

console.log('— analyze (findings → candidats, anti-répétition, sélection)');
const obs = {
  id: 'test-obs', regions: {
    mq: { domain: 'mq.test', pages: [
      { route: 'home', url: 'https://mq.test/', viewport: '390', httpStatus: 200, pageErrors: ['PAGEERROR boom at x'], consoleErrors: [], firstPartyFailures: [], brokenLinks: [{ url: '/mort/', status: 404 }], timing: { load: 2000 } },
      { route: 'beach-1', url: 'https://mq.test/beach/x/', viewport: '390', httpStatus: 500, fatal: null, pageErrors: [], consoleErrors: [], firstPartyFailures: [], brokenLinks: [], timing: {} },
    ] },
  },
};
const findings = analyze.findingsFromObservation(obs);
check('pageerror → finding high', findings.some(f => f.type === 'pageerror' && f.severity === 'high'));
check('page 500 → finding critical', findings.some(f => f.type === 'page-down' && f.severity === 'critical'));
check('lien cassé → finding medium', findings.some(f => f.type === 'broken-link' && f.severity === 'medium'));
check('fingerprint stable', analyze.fingerprint(findings[0]) === analyze.fingerprint(findings[0]));

const queueAuto = { opportunities: [
  { id: 'OPP-A', title: 'fix auto', severity: 'low', confidence: 'proven', actionable: 'auto', recipe: 'r', status: 'new', scope: { files: ['src/x.js'] } },
] };
const res1 = analyze.analyze({ findings, queue: queueAuto, isRejectedFn: () => null, cfg });
check('candidats bruts rétrogradés agent (jamais auto sans recette)', res1.candidates.every(c => c.actionable === 'agent'));
check('auto en queue sélectionné avant agent-finding', res1.selected && res1.selected.id === 'OPP-A');
check('agents off (v1) → finding agent JAMAIS sélectionné seul', analyze.analyze({ findings, queue: { opportunities: [] }, isRejectedFn: () => null, cfg }).selected === null);
const rejectedFp = analyze.fingerprint(findings.find(f => f.type === 'broken-link'));
const res2 = analyze.analyze({ findings: findings.filter(f => f.type === 'broken-link'), queue: { opportunities: [] }, isRejectedFn: fp => fp === rejectedFp ? { reason: 'non' } : null, cfg });
check('fingerprint rejeté → skippé, pas de candidat', res2.candidates.length === 0 && res2.skipped.length === 1);

console.log('— lock (pid vivant/mort, acquire/release)');
check('pidAlive(self)', lock.pidAlive(process.pid));
check('pidAlive(999999) === false (pid inexistant)', !lock.pidAlive(999999));
// Nettoie tout lock résiduel d'un run précédent avant test acquire
try { fs.unlinkSync(C.paths.lockFile); } catch (_) {}
const a1 = lock.acquire({ noSignalHandlers: true });
check('acquire OK quand libre', a1.ok === true);
const a2 = lock.acquire({ noSignalHandlers: true, staleAfterMs: 99999999 });
check('acquire REFUSÉ quand détenu vivant', a2.ok === false && a2.code === 'LOCKED');
a1.release();
const a3 = lock.acquire({ noSignalHandlers: true });
check('acquire OK après release', a3.ok === true);
a3.release();
// Lock stale (pid mort) récupérable
fs.writeFileSync(C.paths.lockFile, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }), 'utf8');
const a4 = lock.acquire({ noSignalHandlers: true });
check('lock stale (pid mort) récupéré', a4.ok === true);
a4.release();

console.log('— structure mémoire requise par la mission');
C.ensureDirs();
for (const d of ['observations', 'research', 'opportunities', 'experiments', 'baselines', 'regressions', 'runs', 'decisions']) {
  check(`.ai/autopilot/${d}/ existe`, fs.existsSync(path.join(root, '.ai', 'autopilot', d)));
}
check('queue.json lisible', Array.isArray((C.readJSON(C.paths.queue, {})).opportunities || []));
check('config boucle : maxRepairAttempts = 3', cfg.loop.maxRepairAttempts === 3);
check('kill-switch documenté', cfg.policy.stopFile === '.ai/autopilot/STOP');

console.log(`\n${passed} checks OK`);
