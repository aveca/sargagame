#!/usr/bin/env node
/**
 * analyze.cjs — RESEARCH→ANALYZE→PRIORITIZE (déterministe, testable).
 *
 * Entrées : dernière observation + queue.json + decisions/rejected.json.
 * Sortie  : candidats scorés + UNE opportunité sélectionnée (ou null).
 *
 * Règles :
 *  - un finding génère un candidat avec fingerprint stable (type|region|route|cible)
 *  - fingerprint rejeté (rejected.json) → jamais re-proposé avant revisitAfter
 *  - fingerprint déjà en queue (statut new/picked) → pas de doublon
 *  - scope intersectant la denylist → rétrogradé 'human' (enregistré, jamais tenté)
 *  - sélection = score max parmi {auto toujours, agent seulement si policy le permet}
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const policy = require('./lib/policy.cjs');

const SEV = { critical: 50, high: 30, medium: 15, low: 5 };
const CONF = { proven: 20, observed: 10, inferred: 0 };
const EFFORT_PENALTY = { auto: 0, agent: 10, human: 999 };

// Échecs first-party ATTENDUS en prod (pas des bugs) — gardés dans l'observation
// brute mais jamais transformés en findings :
//  - /api/mollie.php 400 : sonde payment_status sans session (pré-auth) = nominal
//  - apple-developer-merchantid : filet CORS headless, pas un asset servi aux humains
const EXPECTED_FAILURE = f =>
  (f.url.includes('/api/mollie.php') && f.status === 400) ||
  f.url.includes('apple-developer-merchantid-domain-association');

/** findings[] plats depuis une observation. */
function findingsFromObservation(obs) {
  const out = [];
  if (!obs || !obs.regions) return out;
  for (const [regionId, reg] of Object.entries(obs.regions)) {
    for (const p of reg.pages || []) {
      const base = { region: regionId, route: p.route, url: p.url, viewport: p.viewport };
      if (p.fatal || (p.httpStatus || 0) >= 500) {
        out.push({ ...base, type: 'page-down', severity: 'critical', confidence: 'observed',
          evidence: `${p.url} → ${p.fatal || 'HTTP ' + p.httpStatus}`, target: p.route });
      } else if ((p.httpStatus || 0) === 404 && !p.url.includes('?')) {
        out.push({ ...base, type: 'route-404', severity: 'high', confidence: 'observed',
          evidence: `${p.url} → 404`, target: p.route });
      }
      for (const err of p.pageErrors || []) {
        out.push({ ...base, type: 'pageerror', severity: 'high', confidence: 'observed',
          evidence: err.slice(0, 160), target: err.slice(0, 60) });
      }
      for (const err of p.consoleErrors || []) {
        // « Failed to load resource » est dupliqué par firstPartyFailures (avec URL) — skip.
        if (err.startsWith('Failed to load resource')) continue;
        out.push({ ...base, type: 'console-error', severity: 'medium', confidence: 'observed',
          evidence: err.slice(0, 160), target: err.slice(0, 60) });
      }
      for (const f of p.firstPartyFailures || []) {
        if (EXPECTED_FAILURE(f)) continue;
        if (f.status >= 500 || f.status === 404) {
          out.push({ ...base, type: 'first-party-' + (f.status || 'net'), severity: f.status === 404 ? 'medium' : 'high',
            confidence: 'observed', evidence: `${f.url} → ${f.status}`, target: f.url });
        }
      }
      for (const l of p.brokenLinks || []) {
        out.push({ ...base, type: 'broken-link', severity: 'medium', confidence: 'observed',
          evidence: `lien ${l.url} → ${l.status} depuis ${p.route}`, target: l.url });
      }
      if (p.visual && p.visual.flagged) {
        out.push({ ...base, type: 'visual-shift', severity: 'low', confidence: 'observed',
          evidence: `${p.route}@${p.viewport} pctHot=${p.visual.pctHot}`, target: p.route });
      }
      if (p.lcp && p.lcp > 4000 && p.viewport && parseInt(p.viewport) <= 768) {
        out.push({ ...base, type: 'slow-lcp', severity: 'medium', confidence: 'observed',
          evidence: `LCP ${p.lcp} ms > 4000 ms (${p.route}@${p.viewport})`, target: p.route });
      }
    }
  }
  return out;
}

function fingerprint(f) {
  return `${f.type}|${f.region}|${f.route}|${String(f.target || '').slice(0, 80)}`;
}

function score(c) {
  return (SEV[c.severity] || 0) + (CONF[c.confidence] || 0) - (EFFORT_PENALTY[c.actionable] ?? 999);
}

/**
 * Coeur pur (testable sans I/O) :
 * analyze({findings, queue, isRejectedFn, cfg}) → {candidates, selected, skipped[]}
 */
function analyze({ findings, queue, isRejectedFn, cfg }) {
  const known = new Set((queue.opportunities || []).map(o => o.fingerprint || o.id));
  const candidates = [];
  const skipped = [];

  for (const f of findings) {
    const fp = fingerprint(f);
    if (known.has(fp)) { skipped.push({ fp, why: 'déjà en queue' }); continue; }
    const rej = isRejectedFn(fp);
    if (rej) { skipped.push({ fp, why: `rejeté (${rej.reason})` }); continue; }
    candidates.push({
      id: 'OPP-' + fp.replace(/[^a-z0-9]+/gi, '-').slice(0, 60),
      fingerprint: fp,
      title: `${f.type} sur ${f.region}/${f.route} — ${String(f.target || '').slice(0, 60)}`,
      source: 'observation ' + (findings.obsId || 'prod'),
      severity: f.severity, confidence: f.confidence,
      actionable: 'agent', // un finding brut n'est jamais auto sans recette éprouvée
      evidence: f.evidence, rollback: 'revert du commit',
      status: 'new', createdAt: C.nowIso(),
    });
  }

  // Pool = candidats frais + queue existante
  const pool = [...(queue.opportunities || []).filter(o => o.status === 'new'), ...candidates];
  for (const o of pool) {
    // rétrogradation denylist
    if (o.scope && o.scope.files && o.scope.files.length) {
      const ev = policy.evaluateFiles(o.scope.files, cfg);
      if (!ev.allowed && o.actionable !== 'human') { o.actionable = 'human'; }
    }
    o._score = score(o);
  }
  pool.sort((a, b) => (b._score - a._score) || a.id.localeCompare(b.id));

  const allowAgent = !!cfg.policy.agentsEnabled && !!cfg.policy.allowAgentImplementation;
  const selected = pool.find(o => o.actionable === 'auto') || (allowAgent ? pool.find(o => o.actionable === 'agent') : null) || null;

  return { candidates, selected, skipped, pool };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  C.ensureDirs();
  const cfg = C.loadConfig();
  const obs = C.readJSON(path.join(C.paths.observations, 'latest.json'), null);
  const findings = findingsFromObservation(obs);
  if (obs) findings.obsId = obs.id;
  const res = analyze({ findings, queue: mem.loadQueue(), isRejectedFn: fp => mem.isRejected(fp), cfg });
  console.log(`findings=${findings.length} · nouveaux candidats=${res.candidates.length} · sélection=${res.selected ? res.selected.id : 'null'}`);
  for (const s of res.skipped.slice(0, 10)) console.log(`  skip ${s.fp.slice(0, 70)} — ${s.why}`);
  console.log(JSON.stringify(res.selected || null, null, 2));
}

module.exports = { findingsFromObservation, fingerprint, score, analyze };
