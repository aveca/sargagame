#!/usr/bin/env node
/**
 * mollie-island.cjs — Agrégation Mollie par île et par devise (mission attribution).
 *
 * Contexte d'audit (ne pas régresser) :
 *   - `mollie.php` ne pose JAMAIS `metadata.island` (source/pass/email/lang
 *     uniquement) ; SOSPlage envoie `metadata.beach` (beach.id). Il n'existe
 *     donc AUCUNE attribution directe par île côté Mollie : elle se DÉRIVE de
 *     `metadata.beach` et n'est JAMAIS devinée (description, montant, email).
 *   - Politique de collecte MIROIR de mollieTruth() (daily-stats-check.cjs) :
 *     status==='paid', fenêtre 30 j (createdAt invalide = inclus, comme la
 *     source), devise sans conversion, round2, payeurs en hash8 logId.
 *
 * Règles :
 *   - test : `mode==='test'` ou `testmode===true` → bucket `test` séparé,
 *     EXCLU du collecté (avec une clé live, vide — zéro delta comportemental).
 *   - doublons : même `p.id` → 1ère occurrence gardée, autres comptées
 *     (`duplicates`, transparence).
 *   - île : `metadata.island` valide (set connu, insensible à la casse) en
 *     priorité, sinon `metadata.beach` → table beach-id→île (beaches-list.json
 *     + listes inline des régions), sinon `unattributed` (jamais inventé).
 *   - montants nets par devise : payé − remboursé − chargebacké.
 *   - b2b : même heuristique que mollieTruth (plan pro_/brief_/territory_ ou
 *     description paylink annuel).
 *   - RGPD : jamais d'email en clair (hash8 logId comme le bloc global).
 *
 * Entrée : objets paiement API Mollie BRUTS + { sinceMs, nowMs? }.
 * Sortie : { byIsland, unattributed, test, duplicates, unmappedBeachIds, period }
 *   - bucket : { paid:{CUR:{count,total}}, refunded:{count,total:{CUR:number}},
 *                chargedBack:{count,total:{CUR:number}}, net:{CUR:{count,total}},
 *                b2b, payers:[hash8] }
 *   - totaux par devise : { CUR: { count, total } }, JAMAIS convertis.
 */
'use strict';
const path = require('path');

const KNOWN_ISLANDS = new Set(['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum', 'barbados']);

// Table beach.id → île : beaches-list.json (MQ/GP) + listes inline des régions.
// Construite une fois au chargement ; toute absence => île non résolue.
function buildBeachIslandMap() {
  const map = new Map();
  try {
    const list = require('../../../public/data/beaches-list.json');
    if (Array.isArray(list)) for (const b of list) {
      if (b && b.id && b.island && !map.has(b.id)) map.set(b.id, b.island);
    }
  } catch (_) {}
  try {
    const regions = require('../../../regions/index.cjs');
    const all = typeof regions.getAllRegions === 'function' ? regions.getAllRegions() : [];
    for (const r of all) {
      for (const b of (r && r.beaches) || []) {
        if (b && b.id && b.island && !map.has(b.id)) map.set(b.id, b.island);
      }
    }
  } catch (_) {}
  return map;
}
const BEACH_ID_ISLAND = buildBeachIslandMap();

function round2(n) { return Math.round(n * 100) / 100; }

function newBucket() {
  // paid/net : par devise { CUR: {count,total} } (jamais convertis).
  // refunded/chargedBack : {count, total:{CUR:number}} (miroir du bloc global).
  return { paid: {}, refunded: { count: 0, total: {} }, chargedBack: { count: 0, total: {} }, net: {}, b2b: 0, payers: [] };
}
function addCurMap(obj, cur, val) { obj[cur] = obj[cur] || { count: 0, total: 0 }; obj[cur].count++; obj[cur].total = round2(obj[cur].total + val); }
function addCurNum(obj, cur, val) { obj[cur] = round2((obj[cur] || 0) + val); }

/** Résout l'île d'un paiement : { island } ou { island:null, beach? } (jamais inventé). */
function resolveIsland(p) {
  const m = (p && p.metadata) || {};
  const direct = String(m.island || '').trim().toLowerCase();
  if (KNOWN_ISLANDS.has(direct)) return { island: direct };
  const beach = String(m.beach || '').trim();
  if (beach) {
    const isl = BEACH_ID_ISLAND.get(beach);
    if (isl) return { island: isl };
    return { island: null, beach };
  }
  return { island: null };
}

function isB2B(p, m) {
  return m.b2b === '1' || /^(pro|brief|territory)_/.test(m.plan || '') ||
    (!m.email && /^(Sargasses|Sargassum) Pro /.test(p.description || ''));
}

function aggregateMollieByIsland(payments, opts) {
  const sinceMs = opts && opts.sinceMs;
  const nowMs = (opts && opts.nowMs) || Date.now();
  if (!Number.isFinite(sinceMs)) throw new Error('aggregateMollieByIsland: sinceMs requis');
  let logId = null;
  try { logId = require('./email-hash.cjs').logId; } catch (_) { logId = (s) => String(s); }

  const byIsland = {};
  const unattributed = newBucket();
  const test = { count: 0, totals: {} };
  const unmapped = new Set();
  const seen = new Set();
  let duplicates = 0;

  const bucketFor = (code) => {
    if (!byIsland[code]) byIsland[code] = newBucket();
    return byIsland[code];
  };

  for (const p of payments || []) {
    if (!p || typeof p !== 'object') continue;
    // Paiements de TEST : bucket séparé, hors collecté (jamais mélangés).
    if (p.mode === 'test' || p.testmode === true) {
      const cur = (p.amount && p.amount.currency) || 'EUR';
      const val = parseFloat((p.amount && p.amount.value) || '0') || 0;
      test.count++;
      addCurMap(test.totals, cur, val);
      continue;
    }
    if (p.status !== 'paid') continue;
    const created = Date.parse(p.createdAt || '');
    if (!isNaN(created) && created < sinceMs) continue; // fenêtre 30 j (miroir mollieTruth)
    if (p.id) {
      if (seen.has(p.id)) { duplicates++; continue; }
      seen.add(p.id);
    }
    const m = p.metadata || {};
    const cur = (p.amount && p.amount.currency) || 'EUR';
    const val = parseFloat((p.amount && p.amount.value) || '0') || 0;
    const ref = parseFloat((p.amountRefunded && p.amountRefunded.value) || '0') || 0;
    const cb = parseFloat((p.amountChargedBack && p.amountChargedBack.value) || '0') || 0;

    const r = resolveIsland(p);
    const b = r.island ? bucketFor(r.island) : unattributed;
    if (!r.island && r.beach) unmapped.add(r.beach);

    addCurMap(b.paid, cur, val);
    if (ref > 0) { b.refunded.count++; addCurNum(b.refunded.total, cur, ref); }
    if (cb > 0) { b.chargedBack.count++; addCurNum(b.chargedBack.total, cur, cb); }
    if (isB2B(p, m)) b.b2b++;
    const em = m.email || m.customerEmail || '';
    if (String(em).includes('@')) {
      try {
        const h = logId(em);
        if (!b.payers.includes(h)) b.payers.push(h);
      } catch (_) {}
    }
  }

  // Nets par devise : payé − remboursé − chargebacké (jamais de conversion).
  const finalize = (bucket) => {
    const curs = new Set([...Object.keys(bucket.paid), ...Object.keys(bucket.refunded.total), ...Object.keys(bucket.chargedBack.total)]);
    bucket.net = {};
    for (const c of curs) {
      const gp = (bucket.paid[c] && bucket.paid[c].total) || 0;
      const gr = bucket.refunded.total[c] || 0;
      const gc = bucket.chargedBack.total[c] || 0;
      bucket.net[c] = { count: (bucket.paid[c] && bucket.paid[c].count) || 0, total: round2(gp - gr - gc) };
    }
    bucket.payers.sort();
  };
  for (const code of Object.keys(byIsland)) finalize(byIsland[code]);
  finalize(unattributed);

  return {
    byIsland,
    unattributed,
    test,
    duplicates,
    unmappedBeachIds: [...unmapped].sort(),
    period: {
      windowDays: 30,
      from: new Date(sinceMs).toISOString(),
      to: new Date(nowMs).toISOString(),
      generatedAt: new Date(nowMs).toISOString(),
      source: 'mollie-api',
    },
  };
}

module.exports = { aggregateMollieByIsland, resolveIsland, KNOWN_ISLANDS };
