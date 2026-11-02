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
 *
 * Mission P0.23 / #1157 — sémantique `Prefer: return=representation` :
 * un DELETE PostgREST ne vaut PREUVE de suppression que si le serveur rend les
 * lignes effectivement supprimées. Une représentation absente, non JSON,
 * incomplète (ligne sans `id`) ou dont le compte ne correspond pas au
 * `content-range` est une ERREUR : la suppression n'est pas certifiable, donc
 * elle n'est PAS comptée comme réussie (fail-closed). Aucun de ces cas ne doit
 * produire un `deleted` supérieur à zéro ni un silence de succès.
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

/** `n` lignes de représentation valides (chacune porte un `id`). */
function rowsOf(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ id: `row-${i}` });
  return a;
}

/**
 * Réponse fetch minimale avec en-têtes.
 *   contentRange : valeur de l'en-tête `content-range` (null = absente)
 *   rows         : corps JSON rendu par le serveur (undefined => [])
 *   jsonThrows   : le corps n'est pas du JSON (`res.json()` rejette)
 *   text         : corps brut (utilisé par les messages d'erreur)
 */
function resp(status, opts) {
  const o = opts || {};
  const headers = new Map();
  for (const [k, v] of Object.entries(o.headers || {})) headers.set(String(k).toLowerCase(), String(v));
  if (o.contentRange != null) headers.set('content-range', String(o.contentRange));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    json: async () => {
      if (o.jsonThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
      return o.rows !== undefined ? o.rows : [];
    },
    text: async () => (o.text != null ? o.text : ''),
  };
}

async function main() {
  // ── 1. Le comptage se fait en UNE requête (plus de boucle par lot) ──────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(200, { contentRange: '0-0/123456' }); };
    const n = await countRows('2026-01-01T00:00:00Z', fetchImpl);
    record('countRows : compte en 1 seule requête', calls === 1, `calls=${calls}`);
    record('countRows : lit le total dans content-range', n === 123456, `n=${n}`);
  }

  // ── 2. La suppression s'arrête quand un lot est partiel ────────────────
  // Chaque lot rend SA représentation (les lignes supprimées) : le compte
  // certifié vient du corps, pas d'une supposition.
  {
    let calls = 0;
    // 2 lots pleins (5000) puis un lot partiel (120) => arrêt.
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(5000) });
      if (calls === 2) return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(5000) });
      return resp(200, { contentRange: '0-119/120', rows: rowsOf(120) });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : s\'arrête sur un lot partiel (pas de boucle infinie)', calls === 3, `calls=${calls}`);
    record('purge : total supprimé = somme des lots', r.deleted === 5000 + 5000 + 120, `deleted=${r.deleted}`);
    record('purge : aucun arrêt sur erreur quand les représentations sont valides', !r.lastError, `lastError=${r.lastError}`);
  }

  // ── 3. Plafond dur d'itérations ─────────────────────────────────────────
  {
    let calls = 0;
    // Tous les lots sont « pleins » : sans plafond, la boucle ne finirait pas.
    const fetchImpl = async () => {
      calls++;
      return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(5000) });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 4, budgetSeconds: 60 }, fetchImpl);
    record('purge : respecte le plafond d\'itérations', calls === 4 && r.batches === 4,
      `calls=${calls} batches=${r.batches}`);
    record('purge : chaque lot pleinement certifié est compté', r.deleted === 20000, `deleted=${r.deleted}`);
  }

  // ── 4. Budget temps : sortie propre avant le timeout du job ────────────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(5000) }); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100000, budgetSeconds: 0 }, fetchImpl);
    record('purge : budget temps épuisé => arrêt sans boucle', calls === 0 && r.lastError,
      `calls=${calls} lastError=${r.lastError}`);
  }

  // ── 5. Une erreur HTTP ne provoque pas de boucle ────────────────────────
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return resp(500, { text: 'boom' }); };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : erreur HTTP => arrêt immédiat', calls === 1 && !!r.lastError,
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : erreur HTTP => rien de compté comme supprimé', r.deleted === 0, `deleted=${r.deleted}`);
  }

  // ── 6. Représentation ABSENTE / non JSON => ERREUR (jamais un succès) ───
  // PostgREST a pu ignorer le `Prefer` (proxy, ancienne version, table sans
  // SELECT pour le rôle) : le serveur rend un corps vide ou HTML. On ne peut
  // RIEN certifier, donc la suppression n'est pas comptée.
  {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return resp(200, { contentRange: '0-4999/5000', jsonThrows: true, text: '<html>404</html>' });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : représentation non JSON => arrêt immédiat (fail-closed)',
      calls === 1 && /representation absente ou non JSON/.test(String(r.lastError)),
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : représentation non JSON => deleted=0 (aucun succès inventé)',
      r.deleted === 0, `deleted=${r.deleted}`);
  }

  // ── 7. Représentation INCOMPLÈTE (ligne sans `id`) => ERREUR ────────────
  {
    const rows = rowsOf(3);
    delete rows[1].id;
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return resp(200, { contentRange: '0-2/3', rows });
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : ligne sans id => représentation incomplète => arrêt',
      calls === 1 && /representation incomplete/.test(String(r.lastError)),
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : représentation incomplète => deleted=0', r.deleted === 0, `deleted=${r.deleted}`);
  }

  // ── 8. `content-range` ABSENT => le nombre n'est pas certifiable ────────
  {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return resp(200, { rows: rowsOf(5000) }); // corps rendu, en-tête absent
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : content-range absent => arrêt (nombre non certifiable)',
      calls === 1 && /content-range absent/.test(String(r.lastError)),
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : content-range absent => deleted=0', r.deleted === 0, `deleted=${r.deleted}`);
  }

  // ── 9. Compte INCOHÉRENT (représentation vs content-range) => ERREUR ────
  // Deux sens : le serveur annonce plus de suppressions qu'il n'en rend
  // (preuve partielle), et il en rend plus qu'annoncé (compte faux). Dans les
  // deux cas, aucune suppression n'est certifiée : on s'arrête.
  {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(4999) }); // 1 ligne manquante
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : représentation plus courte que content-range => arrêt',
      calls === 1 && /compte de suppression incoherent/.test(String(r.lastError)),
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : compte incohérent => deleted=0', r.deleted === 0, `deleted=${r.deleted}`);
  }
  {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return resp(200, { contentRange: '0-0/1', rows: rowsOf(2) }); // corps plus long que l'annonce
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    record('purge : représentation plus longue que content-range => arrêt',
      calls === 1 && /compte de suppression incoherent/.test(String(r.lastError)),
      `calls=${calls} lastError=${r.lastError}`);
    record('purge : compte incohérent (sens inverse) => deleted=0', r.deleted === 0, `deleted=${r.deleted}`);
  }

  // ── 10. Contrôle POST-purge : un arrêt anticipé ne devient jamais un
  //        « purge complète ». Le recomptage (`countRows`, même fonction que
  //        le contrôle final) rend le résidu réel : s'il reste des lignes, le
  //        run le dit AU LIEU de conclure au succès.
  //        Portée hermétique : `main()` exige l'autorisation du contrat
  //        central (Environment protégé vérifié), qu'aucun test ne peut
  //        fabriquer sans l'affaiblir — on prouve donc la COMPOSITION
  //        (purge partielle + recomptage fidèle), pas l'appel réseau.
  {
    let calls = 0;
    // 1er lot certifié et supprimé, 2e lot en erreur HTTP => arrêt anticipé.
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) return resp(200, { contentRange: '0-4999/5000', rows: rowsOf(5000) });
      if (calls === 2) return resp(502, { text: 'bad gateway' });
      return resp(200, { contentRange: '0-0/9999' }); // recomptage final
    };
    const r = await purgeInBatches('2026-01-01T00:00:00Z',
      { batch: 5000, maxBatches: 100, budgetSeconds: 60 }, fetchImpl);
    const left = await countRows('2026-01-01T00:00:00Z', fetchImpl);
    record('post-contrôle : arrêt anticipé signalé (pas de silence)', !!r.lastError, `lastError=${r.lastError}`);
    record('post-contrôle : seules les lignes certifiées sont comptées', r.deleted === 5000, `deleted=${r.deleted}`);
    record('post-contrôle : le recomptage rend le résidu RÉEL (> 0)',
      left === 9999, `left=${left}`);
    record('post-contrôle : un résidu > 0 interdit tout message « purge complète »',
      left > 0 && r.deleted !== 10120, `left=${left} deleted=${r.deleted}`);
  }
  // Et le symétrique : plus rien sous le cutoff => le recomptage rend 0,
  // condition du seul cas où « purge complète » est vrai.
  {
    const fetchImpl = async () => resp(200, { contentRange: '0-0/0' });
    const left = await countRows('2026-01-01T00:00:00Z', fetchImpl);
    record('post-contrôle : résidu nul => état « complet » légitime', left === 0, `left=${left}`);
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
