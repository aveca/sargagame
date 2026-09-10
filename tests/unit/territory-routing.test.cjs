#!/usr/bin/env node
/**
 * territory-routing.test.cjs — garde territorial anti cross-load silencieux.
 *
 * Contexte (audit multi-sites 2026-09-10) : les 6 domaines LIVE servent le bon
 * dataset (Miami→FL, Cancun→RM, Tulum→TU, MQ→MQ, GP→GP, PC→PC — vérifié LIVE),
 * mais rien n'empêchait qu'un domaine charge silencieusement le dataset d'un
 * autre territoire (ex. island="mq" dans florida.json, domaine dupliqué, projet
 * Cloudflare mappé sur la mauvaise région). Ce test verrouille :
 *   1. unicité des domaines sur les 6 régions buildées ;
 *   2. couverture matrice deploy-live.yml == régions configurées (ni plus, ni moins) ;
 *   3. mapping projet Cloudflare → région → domaine cohérent ;
 *   4. préfixe island/id des plages inline (fl→florida, pc→puntacana, …) ;
 *   5. trous documentés : haiti / sainte-lucie SANS config (DATA_GAP_REAL, pas de
 *      fallback silencieux autorisé vers un autre dataset) ; barbados configuré
 *      mais NON buildé (domaine non-live).
 * Aucun réseau. Rollback : supprimer ce fichier (garde additive).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label); }
  else { failed++; console.error('  ✗ FAIL:', label); }
}

const BUILT = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'];
const EXPECTED_PROJECT = {
  mq: 'sargagame', gp: 'sargagame-gp', florida: 'sargagame-florida',
  puntacana: 'sargagame-puntacana', rivieramaya: 'sargagame-rivieramaya', tulum: 'sargagame-tulum',
};
const ID_PREFIX = { florida: 'fl', puntacana: 'pc', rivieramaya: 'rm', tulum: 'tu', barbados: 'bb', mq: 'mq', gp: 'gp' };

function loadRegion(id) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'));
}

async function main() {
  // 1. unicité des domaines
  const domains = {};
  for (const id of BUILT) {
    const r = loadRegion(id);
    ok(typeof r.domain === 'string' && r.domain.length > 4, `${id} : domaine configuré (${r.domain})`);
    ok(!domains[r.domain], `${id} : domaine unique (pas de doublon avec ${domains[r.domain] || 'personne'})`);
    domains[r.domain] = id;
  }

  // 2. matrice deploy-live.yml == régions configurées
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy-live.yml'), 'utf8');
  const m = yml.match(/matrix:\s*\n\s*region:\s*\[([^\]]+)\]/);
  ok(!!m, 'deploy-live.yml : matrice region lisible');
  const matrix = m ? m[1].split(',').map((s) => s.trim()) : [];
  ok(JSON.stringify(matrix.slice().sort()) === JSON.stringify(BUILT.slice().sort()),
    `matrice deploy == régions buildées [${matrix.join(', ')}]`);

  // 3. mapping projet Cloudflare → région → domaine
  for (const id of BUILT) {
    const re = new RegExp(id + '\\)\\s*PROJECT="([^"]+)"');
    const pm = yml.match(re);
    ok(!!pm && pm[1] === EXPECTED_PROJECT[id], `${id} : projet Cloudflare ${pm ? pm[1] : '?'} == attendu (${EXPECTED_PROJECT[id]})`);
  }

  // 4. island/id des plages inline cohérents avec la région
  for (const id of BUILT.concat(['barbados'])) {
    let r;
    try { r = loadRegion(id); } catch { continue; }
    const beaches = r.beaches || [];
    if (!beaches.length) { console.log(`  · ${id} : plages externes (pipeline dédié), island check non applicable`); continue; }
    const bad = beaches.filter((b) => b.island !== id || !String(b.id || '').startsWith(ID_PREFIX[id]));
    ok(bad.length === 0, `${id} : ${beaches.length} plages inline, island+préfixe cohérents${bad.length ? ' (EX: ' + JSON.stringify(bad.slice(0, 2).map((b) => b.id)) + ')' : ''}`);
  }

  // 5. trous documentés (DATA_GAP_REAL, pas de fallback silencieux)
  ok(!fs.existsSync(path.join(ROOT, 'regions', 'haiti.json')) &&
     !fs.existsSync(path.join(ROOT, 'regions', 'sainte-lucie.json')),
    'haiti / sainte-lucie : AUCUNE config région (DATA_GAP_REAL documenté — interdiction de fabriquer, chemins /haiti /sainte-lucie = fallback SPA assumé)');
  const barbInMatrix = matrix.includes('barbados');
  ok(!barbInMatrix, 'barbados : configuré (12 plages) mais NON buildé/non-live (hors matrice deploy)');

  console.log(`\nterritory-routing: ${passed} pass / ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERREUR HARNAIS:', e); process.exit(1); });
