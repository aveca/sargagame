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
 * ET (P0.67 §4) que la suppression n'est plus IRREFUSABLE par défaut :
 * rien d'irréversible sans `--execute --approved-by=<identité>`, plancher de
 * rétention à 90 j, et une suppression seulement comptée quand les
 * identifiants réellement retournés concordent avec `content-range`.
 *
 * Ces tests verrouillent ces points (sans aucun accès réseau : le `fetch`
 * est injecté).
 */
'use strict';

const assert = require('assert');
const path = require('path');

const MOD = path.join(__dirname, '..', 'scripts', 'automation', 'purge-analytics.cjs');
const {
  countRows, purgeInBatches, deletedIds,
  authorizationRefusal, resolveOptions, MIN_DAYS,
} = require(MOD);

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

/**
 * Réponse fetch minimale avec en-têtes.
 *
 * Pour un DELETE `Prefer: return=representation`, PostgREST renvoie dans le
 * corps les lignes réellement supprimées — ici une ligne par identifiant,
 * dont le nombre reprend exactement le `content-range` annoncé. Un stub qui
 * répondait `[]` pour toutes les méthodes modélisait une réponse
 * `return=minimal`, que la purge interprète désormais comme « aucune preuve
 * de suppression » et refuse de traiter comme un lot valide.
 */
function resp(status, contentRange) {
  const headers = new Map();
  if (contentRange != null) headers.set('content-range', contentRange);
  const m = contentRange == null ? null : /\/(\d+)\s*$/.exec(contentRange);
  const n = m ? parseInt(m[1], 10) : 0;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: 'id-' + i });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    text: async () => '',
    json: async () => (status >= 200 && status < 300 ? rows : []),
  };
}

/** `n` lignes `{ id }`, format d'une représentation PostgREST `select=id`. */
function rowsOf(n) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: 'id-' + i });
  return rows;
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

  // ── 6. SÉCURITÉ P0.67 §4 : rien d'irréversible sans intention explicite ──
  // La suppression est refusée par défaut. Un cron ne doit jamais suffire.
  for (const [label, argv] of [
    ['sans argument', []],
    ['--dry seul', ['--dry']],
    ['--execute sans approved-by', ['--execute']],
    ['--approved-by vide', ['--execute', '--approved-by=']],
    ['--approved-by=espaces', ['--execute', '--approved-by=   ']],
  ]) {
    const refusal = authorizationRefusal(resolveOptions(argv));
    record(`autorisation refusée : ${label}`, typeof refusal === 'string' && refusal.length > 0,
      `refusal=${refusal}`);
  }
  {
    const allowed = resolveOptions(['--execute', '--approved-by=ops:verif']);
    record('autorisation accordée : --execute + --approved-by',
      authorizationRefusal(allowed) === null);
  }

  // ── 7. Le plancher de rétention ne se raccourcit pas par argument ────────
  {
    record('plancher de rétention : MIN_DAYS = 90', MIN_DAYS === 90, `MIN_DAYS=${MIN_DAYS}`);
    const short = resolveOptions(['--days=7']);
    record('plancher : --days=7 est ramené à 90', short.days === 90, `days=${short.days}`);
    record('plancher : la demande courte reste visible dans les logs',
      short.daysRequested === 7, `daysRequested=${short.daysRequested}`);
    const long = resolveOptions(['--days=365']);
    record('plancher : --days=365 est conservé', long.days === 365, `days=${long.days}`);
    const none = resolveOptions([]);
    record('plancher : pas d\'argument => 90 j par défaut', none.days === 90, `days=${none.days}`);
  }

  // ── 8. La suppression est prouvée par les identifiants, pas par une meta ─
  {
    // Un lot dont la représentation ne concorde pas avec content-range est
    // douteux : il doit arrêter la boucle SANS émettre de lot suivant.
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      // 5000 annoncés par l'en-tête, 4999 identifiants réels dans le corps.
      const r = resp(200, '0-4999/5000');
      return Object.assign(r, { json: async () => rowsOf(4999) });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 10, budgetSeconds: 60 }, fetchImpl);
    record('incohérence lot : arrêt immédiat (aucun lot suivant)', calls === 1, `calls=${calls}`);
    record('incohérence lot : rien n\'est compté comme supprimé', r.deleted === 0, `deleted=${r.deleted}`);
    record('incohérence lot : l\'anomalie est signalée',
      /incohérent/.test(r.lastError || ''), `lastError=${r.lastError}`);
  }
  {
    // Une réponse sans représentation lisible (ex. return=minimal) n'est PAS
    // « zéro supprimé » : c'est l'absence de preuve, et ça arrête la boucle.
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      const r = resp(200, '0-4999/5000');
      return Object.assign(r, { json: async () => { throw new Error('pas de corps'); } });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 10, budgetSeconds: 60 }, fetchImpl);
    record('sans représentation : arrêt immédiat', calls === 1, `calls=${calls}`);
    record('sans représentation : l\'anomalie est signalée',
      /représentation/.test(r.lastError || ''), `lastError=${r.lastError}`);
  }
  {
    // Une représentation valide fait bien avancer le compteur.
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(200, '0-4999/5000'); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 2, budgetSeconds: 60 }, fetchImpl);
    record('représentation valide : les identifiants sont comptés',
      r.deleted === 10000 && r.batches === 2 && !r.lastError,
      `deleted=${r.deleted} batches=${r.batches}`);
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
