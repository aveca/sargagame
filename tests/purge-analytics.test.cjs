#!/usr/bin/env node
/**
 * purge-analytics.test.cjs — régression de la purge analytics_events.
 *
 * Cause racine des 157 runs `Daily Copernicus + Deploy` annulés (job
 * `email-automation` annulé à 30 min → run `cancelled` → étapes suivantes
 * sautées, dont « Commit email state » → anti-doublon des envois neutralisé) :
 *
 *   - le COMPTAGE faisait une requête par lot de 1000 lignes (O(N/1000)
 *     requêtes HTTP) ;
 *   - la SUPPRESSION s'appuyait sur `content-range` = TOTAL de la table pour
 *     sa condition d'arrêt, au lieu du nombre de lignes SUPPRIMÉES par le
 *     lot : la boucle ne s'arrêtait jamais.
 *
 * Ces tests verrouillent les deux points (sans aucun accès réseau : le
 * `fetch` est injecté).
 */
'use strict';

const assert = require('assert');
const path = require('path');

const MOD = path.join(__dirname, '..', 'scripts', 'automation', 'purge-analytics.cjs');
const { countRows, purgeInBatches } = require(MOD);

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

/** Réponse fetch minimale avec en-têtes. */
function resp(status, contentRange) {
  const headers = new Map();
  if (contentRange != null) headers.set('content-range', contentRange);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    text: async () => '',
    json: async () => [],
  };
}

async function main() {
  // ── 1. Le comptage se fait en UNE requête (plus de boucle par lot) ──────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(200, '0-0/123456'); };
    const n = await countRows('2026-01-01T00:00:00Z', fetchImpl);
    record('countRows : compte en 1 seule requête', calls === 1, `calls=${calls}`);
    record('countRows : lit le total dans content-range', n === 123456, `n=${n}`);
  }

  // ── 2. La suppression s'arrête quand un lot est partiel ────────────────
  {
    let calls = 0;
    // 2 lots pleins (5000) puis un lot partiel (120) => arrêt.
    const fetchImpl = async () => {
      calls++;
      return resp(200, calls <= 2 ? '0-4999/5000' : '0-119/120');
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : s\'arrête sur un lot partiel (pas de boucle infinie)', calls === 3, `calls=${calls}`);
    record('purge : total supprimé = somme des lots', r.deleted === 5000 + 5000 + 120, `deleted=${r.deleted}`);
  }

  // ── 3. Plafond dur d'itérations ─────────────────────────────────────────
  {
    let calls = 0;
    // Tous les lots sont « pleins » : sans plafond, la boucle ne finirait pas.
    const fetchImpl = async () => { calls++; return resp(200, '0-4999/5000'); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 4, budgetSeconds: 60 }, fetchImpl);
    record('purge : respecte le plafond d\'itérations', calls === 4 && r.batches === 4,
      `calls=${calls} batches=${r.batches}`);
  }

  // ── 4. Budget temps : sortie propre avant le timeout du job ────────────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(200, '0-4999/5000'); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100000, budgetSeconds: 0 }, fetchImpl);
    record('purge : budget temps épuisé => arrêt sans boucle', calls === 0 && r.lastError,
      `calls=${calls} lastError=${r.lastError}`);
  }

  // ── 5. Une erreur HTTP ne provoque pas de boucle ────────────────────────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(500, null); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : erreur HTTP => arrêt immédiat', calls === 1 && !!r.lastError,
      `calls=${calls} lastError=${r.lastError}`);
  }

  console.log(failures === 0
    ? '\nPURGE_ANALYTICS_TESTS PASS'
    : `\nPURGE_ANALYTICS_TESTS FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERREUR FATALE :', e && e.stack ? e.stack : e);
  process.exit(1);
});
