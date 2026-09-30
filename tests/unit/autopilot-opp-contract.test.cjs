#!/usr/bin/env node
/**
 * autopilot-opp-contract.test.cjs — Régression crash cycle 2026-09-30-1558.
 *
 * Crash : TypeError: Cannot read properties of undefined (reading 'includes')
 *   at orchestrator.cjs:533 — `opp.type.includes(t)` avec opp.type === undefined.
 *
 * Cause racine : les producteurs ne persistaient pas `type` —
 *   analyze.cjs (candidats) et discover.cjs (makeOpp) construisaient le
 *   fingerprint AVEC le type mais omettaient le champ sur l'objet.
 *   Toute opportunité ainsi sélectionnée → claimée → crash dans
 *   processOpportunity AVANT dispatched/persisted (exit 1, jamais exit 0).
 *
 * Correctif :
 *   1. analyze.cjs / discover.cjs persistent type/region/route (contrat).
 *   2. orchestrator.cjs : garde-contrat explicite (park avec diagnostic,
 *      jamais de fallback silencieux) + needsBrowserRecon null-safe.
 *
 * Lancement : node tests/unit/autopilot-opp-contract.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'common.cjs'));
const analyze = require(path.join(ROOT, 'scripts', 'autopilot', 'analyze.cjs'));
const discover = require(path.join(ROOT, 'scripts', 'autopilot', 'discover.cjs'));
const orch = require(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'));

let passed = 0;
function check(name, cond, details = '') {
  assert.ok(cond, name + (details ? ' — ' + details : ''));
  passed++;
  console.log('  ✓ ' + name);
}

console.log('AUTOPILOT OPP-CONTRACT — régression crash 2026-09-30-1558');

// ── 1. analyze.cjs : les candidats portent le contrat type/region/route ──
console.log('— producteurs : analyze');
{
  const cfg = C.loadConfig();
  const findings = [
    { type: 'slow-lcp', region: 'mq', route: 'home', target: 'home', severity: 'medium', confidence: 'observed', evidence: 'LCP 4952 ms > 4000 ms (home@390)' },
    { type: 'pageerror', region: 'glp', route: 'beach-1', target: 'boom', severity: 'high', confidence: 'observed', evidence: 'PAGEERROR boom' },
  ];
  const res = analyze.analyze({ findings, queue: { opportunities: [] }, isRejectedFn: () => null, cfg });
  check('candidats générés', res.candidates.length === 2, `got ${res.candidates.length}`);
  for (const c of res.candidates) {
    check(`${c.id} porte type/region/route (strings non vides)`,
      typeof c.type === 'string' && !!c.type && typeof c.region === 'string' && typeof c.route === 'string',
      JSON.stringify({ type: c.type, region: c.region, route: c.route }));
  }
  check('type candidat = type du finding', res.candidates.some(c => c.type === 'slow-lcp' && c.region === 'mq' && c.route === 'home'));
}

// ── 2. discover.cjs : makeOpp porte le contrat ──
console.log('— producteurs : discover.makeOpp');
{
  const m = discover.makeOpp({ type: 'seo-opportunity', region: 'global', route: 'seo', severity: 'medium', evidence: 'ev', source: 'discovery:seo-indexing' });
  check('makeOpp exportée', typeof discover.makeOpp === 'function');
  check('makeOpp persiste type/region/route', m.type === 'seo-opportunity' && m.region === 'global' && m.route === 'seo', JSON.stringify({ type: m.type, region: m.region, route: m.route }));
  check('fingerprint cohérent avec type', String(m.fingerprint).startsWith('seo-opportunity|global|seo|'));
}

// ── 3. Ligne 533 exacte : ne crashe plus sur opp sans type ──
console.log('— consommateur : ligne 533 (browser-recon)');
{
  const legacyCrash = { id: 'OPP-TEST-PERSIST', status: 'picked' }; // entrée queue historique sans type
  let crashed = false;
  try {
    // Appel réel du helper utilisé par processOpportunity (était : opp.type.includes).
    orch.needsBrowserRecon(legacyCrash);
  } catch (e) { crashed = true; }
  check('needsBrowserRecon(opp sans type) ne crashe pas', crashed === false);
  check('opp sans type → pas de recon (false, pas de throw)', orch.needsBrowserRecon(legacyCrash) === false);
  check('opp ux-ui → recon true', orch.needsBrowserRecon({ id: 'x', type: 'ux-ui glitch on home' }) === true);
  check('opp null/undefined → false sans crash', orch.needsBrowserRecon(null) === false && orch.needsBrowserRecon(undefined) === false);
  check('opp type non-string → false sans crash', orch.needsBrowserRecon({ type: 42 }) === false);
}

// ── 4. Garde-contrat : diagnostic préservé, pas de fallback silencieux ──
console.log('— garde-contrat validateOpportunityContract');
{
  const bad = orch.validateOpportunityContract({ id: 'OPP-TEST-PERSIST', status: 'picked' });
  check('opp sans type → invalide', bad.valid === false);
  check('champ manquant nommé (type)', bad.missing.includes('type'), JSON.stringify(bad.missing));
  check('raison diagnostique préservée (mentionne type + valeurs reçues)',
    /type/.test(bad.reason) && /OPP-TEST-PERSIST/.test(bad.reason), bad.reason);
  const noId = orch.validateOpportunityContract({ type: 'slow-lcp' });
  check('opp sans id → invalide (id nommé)', noId.valid === false && noId.missing.includes('id'));
  const nullOpp = orch.validateOpportunityContract(null);
  check('opp null → invalide sans crash', nullOpp.valid === false);
  const good = orch.validateOpportunityContract({ id: 'OPP-x', type: 'slow-lcp' });
  check('opp valide → valid=true', good.valid === true && good.missing.length === 0);
}

// ── 5. Source orchestrator : garde branchée AVANT usage, pas de .includes nu ──
console.log('— câblage processOpportunity');
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8');
  check('plus aucun opp.type.includes nu', !/opp\.type\.includes/.test(src));
  check('processOpportunity appelle le garde-contrat', /validateOpportunityContract\(opp\)/.test(src));
  check('processOpportunity route via needsBrowserRecon', /needsBrowserRecon\(opp\)/.test(src));
  check('contrat invalide → parkTask avec diagnostic (pas de throw)',
    /if\s*\(!contract\.valid\)[\s\S]{0,300}parkTask/.test(src));
}

// ── 6. Guards existants intacts (LIVE/PR/state-machine) ──
console.log('— guards existants préservés');
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8');
  check('state machine selected→claimed→dispatched→persisted intacte',
    /persistClaimed/.test(src) && /processOpportunity\(fresh/.test(src) && /persistDispatched/.test(src));
  check('PR gate catégorie-aware intact (isPrBlocking)', /isPrBlocking/.test(src));
  check('LIVE/DRY guards intacts', /SARGA_AUTOPILOT_LIVE/.test(src) && /args\.includes\('--dry'\)/.test(src));
  check('parkTask normalise statuts invalides (garde-fou mémoire)', /const safe = VALID\.has\(status\)/.test(src));
  check('main protégé require.main (testable sans lancer la factory)', /if\s*\(require\.main\s*===\s*module\)/.test(src));
}

console.log(`\n${passed} checks OK`);
