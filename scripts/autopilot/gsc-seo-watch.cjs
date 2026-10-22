#!/usr/bin/env node
'use strict';
/**
 * gsc-seo-watch.cjs — surveillance SEO GSC pour le cycle Factory V3.
 *
 * Rôle (P0.7 phase P4) :
 *  - lit les données Search Console réelles (service account, lecture seule) ;
 *  - détecte : baisses de clics anormales (7j vs 7j) + quick wins (pos 4-10, fort
 *    volume, CTR faible) ;
 *  - émet des opportunités dans .ai/autopilot/queue.json (schéma existant,
 *    dédup par fingerprint) avec preuve + scope ;
 *  - JAMAIS bloquant : toute erreur est loguée, jamais propagée.
 *
 * Usage : node scripts/autopilot/gsc-seo-watch.cjs [--dry]
 * Env    : GOOGLE_SERVICE_ACCOUNT_JSON ou clé dans C:\Users\user\.config\sarga-gsc.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const QUEUE_FILE = path.join(ROOT, '.ai', 'autopilot', 'queue.json');
const STATE_FILE = path.join(ROOT, '.ai', 'autopilot', 'gsc-watch-state.json');
const SA_FILE = process.env.GSC_SERVICE_ACCOUNT_FILE || 'C:\\Users\\user\\.config\\sarga-gsc.json';
const DRY = process.argv.includes('--dry');

// Seuils (anti-bruit : une alerte ne crée pas systématiquement une tâche)
const DROP_MIN_CLICKS_PREV = 15;     // négligeable en dessous
const DROP_PCT = 30;                 // -30 % sur 7j vs 7j
const QW_MIN_IMPRESSIONS = 300;      // volume suffisant
const QW_POS_MIN = 3.5, QW_POS_MAX = 10; // zone de gain réaliste
const MAX_NEW_OPPORTUNITIES = 3;     // cap par exécution

function log(msg) { console.log(`[gsc-watch] ${msg}`); }

function loadSaJson() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  try { return fs.readFileSync(SA_FILE, 'utf8'); } catch (_) { return null; }
}

async function getAccessToken(saRaw) {
  // JWT signing via crypto (sans dépendance externe)
  const crypto = require('crypto');
  const sa = JSON.parse(saRaw);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('token exchange failed: ' + JSON.stringify(d).slice(0, 150));
  return d.access_token;
}

function dayStr(offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

async function gscFetch(token, siteUrl, body) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GSC ${res.status}: ${t.slice(0, 150)}`);
  }
  return (await res.json()).rows || [];
}

async function pageStats(token, siteUrl, start, end) {
  const rows = await gscFetch(token, siteUrl, {
    startDate: start, endDate: end, dimensions: ['page'],
    rowLimit: 100, dataState: 'all',
  });
  const map = new Map();
  for (const r of rows) map.set(r.keys[0], { clicks: r.clicks, impressions: r.impressions, position: r.position });
  return map;
}

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); }
  catch (_) { return { opportunities: [] }; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { return { notifiedFingerprints: [] }; }
}

function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
}

function addToQueue(queue, opp) {
  if (queue.opportunities.some(o => o.fingerprint === opp.fingerprint)) return false;
  queue.opportunities.unshift(opp);
  return true;
}

async function main() {
  const saRaw = loadSaJson();
  if (!saRaw) { log('Pas de clé SA — surveillance SEO désactivée (non-fatal)'); return; }

  let token;
  try { token = await getAccessToken(saRaw); }
  catch (e) { log('Auth échouée (non-fatal): ' + e.message); return; }

  // Propriétés accessibles (mapping local, hors repo pour les secrets)
  let mapping = { projects: [] };
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.ai', 'autopilot', 'gsc-properties.json'), 'utf8').replace(/^\uFEFF/, '');
    mapping = JSON.parse(raw);
  } catch (_) {}
  const okProps = mapping.projects.filter(p => (p.data_access || '').startsWith('OK'));
  if (!okProps.length) { log('Aucune propriété accessible listée — rien à faire'); return; }

  const end = dayStr(1); // GSC data_state=all inclut J-1 partiel ; 7j complets = J-1..J-8
  const cur = { start: dayStr(8), end };
  const prev = { start: dayStr(15), end: dayStr(9) };

  const state = loadState();
  const queue = loadQueue();
  let added = 0;

  for (const p of okProps) {
    let curMap, prevMap;
    try {
      [curMap, prevMap] = await Promise.all([pageStats(token, p.gsc_property, cur.start, cur.end), pageStats(token, p.gsc_property, prev.start, prev.end)]);
    } catch (e) { log(`${p.gsc_property}: échec API (non-fatal) ${e.message.slice(0, 100)}`); continue; }

    // 1. Baisses anormales
    for (const [url, now_] of curMap) {
      const before = prevMap.get(url);
      if (!before || before.clicks < DROP_MIN_CLICKS_PREV) continue;
      const pct = ((now_.clicks - before.clicks) / before.clicks) * 100;
      if (pct > -DROP_PCT) continue;
      const fp = `seo-drop|${p.region}|page|${url}`;
      if (state.notifiedFingerprints.includes(fp)) continue;
      const opp = {
        id: `SEO-DROP-${p.region.toUpperCase()}-${cur.start.replace(/-/g, '')}-${url.split('/').filter(Boolean).pop().slice(0, 24)}`,
        fingerprint: fp, type: 'seo_drop', region: p.region, route: url,
        title: `Baisse SEO -${Math.abs(pct).toFixed(0)}% : ${url.replace(/^https?:\/\//, '')}`,
        source: 'gsc-watch', severity: now_.clicks === 0 ? 'high' : 'medium', confidence: 'observed',
        actionable: 'agent',
        evidence: `GSC ${cur.start}..${cur.end}: ${now_.clicks} clics vs ${before.clicks} (${pct.toFixed(0)}%) sur la période 7j précédente (${prev.start}..${prev.end}). Position ${now_.position?.toFixed(1)} vs ${before.position?.toFixed(1)}.`,
        expectedImpact: 'Récupérer les clics perdus après diagnostic (canonique, title, contenu, indexation)',
        rollback: 'revert du commit',
        status: 'new', createdAt: new Date().toISOString(),
        scope: { files: ['index.html', 'scripts/prepare-ftp.cjs'] },
        _score: 40, _economicBonus: 20,
      };
      if (!DRY && addToQueue(queue, opp)) { added++; log(`DROP détecté → queue: ${opp.id}`); }
      else if (DRY) log(`[dry] DROP détecté: ${opp.title}`);
      state.notifiedFingerprints.push(fp);
    }

    // 2. Quick wins — au niveau page (pos 3.5-10, volume, CTR faible)
    for (const [url, now_] of curMap) {
      if (now_.impressions < QW_MIN_IMPRESSIONS) continue;
      if (now_.position < QW_POS_MIN || now_.position > QW_POS_MAX) continue;
      if (now_.clicks < 5) continue;
      const ctr = now_.clicks / now_.impressions;
      const potential = Math.round(now_.impressions * 0.10); // CTR cible conservateur 10 %
      if (potential - now_.clicks < 10) continue;
      const fp = `seo-quickwin|${p.region}|page|${url}`;
      if (state.notifiedFingerprints.includes(fp)) continue;
      const opp = {
        id: `SEO-QW-${p.region.toUpperCase()}-${cur.start.replace(/-/g, '')}-${url.split('/').filter(Boolean).pop().slice(0, 24)}`,
        fingerprint: fp, type: 'seo_quick_win', region: p.region, route: url,
        title: `Quick win SEO : ${url.replace(/^https?:\/\//, '')} (pos ${now_.position.toFixed(1)}, CTR ${(ctr * 100).toFixed(1)}%)`,
        source: 'gsc-watch', severity: 'medium', confidence: 'observed',
        actionable: 'agent',
        evidence: `GSC 7j: ${now_.clicks} clics / ${now_.impressions} impr, pos ${now_.position.toFixed(1)}. CTR ${((ctr) * 100).toFixed(1)} % — potentiel ~${potential} clics à CTR 10 % (title/meta/H1 à aligner sur les requêtes de la page).`,
        expectedImpact: `~${potential - now_.clicks} clics/7j supplémentaires si CTR ramené à 10 %`,
        rollback: 'revert du commit',
        status: 'new', createdAt: new Date().toISOString(),
        scope: { files: ['index.html', 'scripts/prepare-ftp.cjs'] },
        _score: 35, _economicBonus: 15,
      };
      if (!DRY && addToQueue(queue, opp)) { added++; log(`QUICK WIN → queue: ${opp.id}`); }
      else if (DRY) log(`[dry] QUICK WIN: ${opp.title}`);
      state.notifiedFingerprints.push(fp);
    }
    if (added >= MAX_NEW_OPPORTUNITIES) { log(`Cap ${MAX_NEW_OPPORTUNITIES} nouvelles opportunités atteint`); break; }
  }

  // Ne garder que les 200 derniers fingerprints (hygiène état)
  state.notifiedFingerprints = state.notifiedFingerprints.slice(-200);

  if (!DRY) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
    saveState(state);
  }
  log(`Terminé: ${added} nouvelle(s) opportunité(s) ajoutée(s) à la queue`);
}

main().catch(e => log('ERREUR non-fatale: ' + e.message));
