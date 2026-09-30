#!/usr/bin/env node
/**
 * discover.cjs — AUTONOMOUS DISCOVERY PHASE
 *
 * S'exécute quand queue.executable = 0.
 * Inspecte les sources prioritaires pour trouver de vraies opportunités.
 *
 * Sources (ordre de priorité) :
 * 1. production health
 * 2. revenue/funnel
 * 3. UX/UI visible
 * 4. browser interaction
 * 5. AHA/WOW
 * 6. data/DB consistency
 * 7. DEV/code quality
 * 8. performance
 * 9. SEO/indexing
 * 10. SVG/assets/accessibility
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const policy = require('./lib/policy.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] DISCOVER  ${msg}`);
  else console.log(`[DISCOVER] ${msg}`);
}

/** Simple in-memory cache for discovery results */
const discoveryCache = new Map();

function getCachedDiscovery(key) {
  const cached = discoveryCache.get(key);
  if (cached && Date.now() - cached.timestamp < DISCOVERY_CACHE_TTL_MS) {
    log(`CACHE HIT: ${key}`);
    return cached.data;
  }
  return null;
}

function setCachedDiscovery(key, data) {
  discoveryCache.set(key, { data, timestamp: Date.now() });
}

const DISCOVERY_SOURCES = [
  { id: 'prod-health', name: 'Production Health', weight: 50 },
  { id: 'revenue-funnel', name: 'Revenue/Funnel', weight: 45 },
  { id: 'ux-ui', name: 'UX/UI Visible', weight: 40 },
  { id: 'browser-interaction', name: 'Browser Interaction', weight: 35 },
  { id: 'aha-wow', name: 'AHA/WOW', weight: 30 },
  { id: 'data-db', name: 'Data/DB Consistency', weight: 25 },
  { id: 'dev-quality', name: 'DEV/Code Quality', weight: 20 },
  { id: 'performance', name: 'Performance', weight: 20 },
  { id: 'seo-indexing', name: 'SEO/Indexing', weight: 15 },
  { id: 'svg-assets-a11y', name: 'SVG/Assets/Accessibility', weight: 15 },
];

/**
 * Génère des opportunités basées sur l'analyse des sources
 */
async function runDiscovery(cfg, report, obs, revenueSnap) {
  const opportunities = [];
  const queue = mem.loadQueue();
  const existingFingerprints = new Set((queue.opportunities || []).map(o => o.fingerprint || o.id));
  
  // Cache key based on observation + revenue snapshot
  const cacheKey = `discovery:${report.id}:${obs?.id || 'no-obs'}:${revenueSnap?.at || 'no-revenue'}`;

  // Check cache first
  const cached = getCachedDiscovery(cacheKey);
  if (cached) {
    log(`Using cached discovery results`);
    return cached;
  }

  // 1. PRODUCTION HEALTH
  const healthOpps = await discoverProdHealth(cfg, obs);
  opportunities.push(...healthOpps);

  // 2. REVENUE/FUNNEL
  const funnelOpps = await discoverRevenueFunnel(revenueSnap, obs);
  opportunities.push(...funnelOpps);

  // 3. UX/UI VISIBLE (via observation data)
  const uxOpps = await discoverUXUI(obs);
  opportunities.push(...uxOpps);

  // 4. BROWSER INTERACTION (headless probe for dead clicks, etc.)
  const browserOpps = await discoverBrowserInteraction(cfg, obs);
  opportunities.push(...browserOpps);

  // 5. AHA/WOW
  const ahaOpps = await discoverAhaWow(obs);
  opportunities.push(...ahaOpps);

  // 6. DATA/DB
  const dataOpps = await discoverDataDB(cfg);
  opportunities.push(...dataOpps);

  // 7. DEV QUALITY
  const devOpps = await discoverDevQuality(cfg);
  opportunities.push(...devOpps);

  // 8. PERFORMANCE
  const perfOpps = await discoverPerformance(obs);
  opportunities.push(...perfOpps);

  // 9. SEO
  const seoOpps = await discoverSEO(cfg);
  opportunities.push(...seoOpps);

  // 10. SVG/ASSETS/A11Y
  const a11yOpps = await discoverA11y(cfg, obs);
  opportunities.push(...a11yOpps);

  // Filtrer doublons, rejetés, human-gate
  const filtered = [];
  for (const o of opportunities) {
    if (existingFingerprints.has(o.fingerprint)) continue;
    const rej = mem.isRejected(o.fingerprint);
    if (rej) continue;

    // Check denylist
    if (o.scope && o.scope.files && o.scope.files.length) {
      const ev = policy.evaluateFiles(o.scope.files, cfg);
      if (!ev.allowed) {
        o.actionable = 'human';
        o.blocked = 'denylist: ' + ev.denied.join(', ');
      }
    }

    // Score
    o._score = scoreOpportunity(o, cfg);
    filtered.push(o);
  }

  // Trier par score
  filtered.sort((a, b) => (b._score - a._score) || a.id.localeCompare(b.id));

  log(`discovery: ${opportunities.length} raw → ${filtered.length} qualified`);
  for (const o of filtered.slice(0, 5)) {
    log(`  ${o._score} ${o.id} (${o.severity}/${o.actionable}) ${o.title.slice(0, 80)}`);
  }

  // Cache results
  setCachedDiscovery(cacheKey, filtered);

  return filtered;
}

/** Production Health Discovery */
async function discoverProdHealth(cfg, obs) {
  const opps = [];
  if (!obs) return opps;

  // Check for 5xx errors
  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      if (p.fatal || (p.httpStatus || 0) >= 500) {
        opps.push(makeOpp({
          type: 'prod-down',
          region: regionId,
          route: p.route,
          severity: 'critical',
          evidence: `${p.url} → ${p.fatal || 'HTTP ' + p.httpStatus}`,
          source: 'discovery:prod-health',
        }));
      }
    }
  }

  // Check domain SSL/expiry would need external tool - skip for now
  return opps;
}

/** Revenue/Funnel Discovery */
async function discoverRevenueFunnel(snap, obs) {
  const opps = [];
  if (!snap) return opps;

  const s7 = snap.d7;
  const chain = snap.ahaChain ? snap.ahaChain(7) : null;

  // Modal → CTA conversion low
  if (s7.modalOpens > 20 && s7.modalCta / s7.modalOpens < 0.1) {
    opps.push(makeOpp({
      type: 'low-modal-cta',
      region: 'global',
      route: 'premium',
      severity: 'high',
      evidence: `modal→CTA ${(s7.modalCta/s7.modalOpens*100).toFixed(1)}% (${s7.modalCta}/${s7.modalOpens})`,
      source: 'discovery:revenue-funnel',
      expectedImpact: 'increase modal→CTA conversion',
      metric: 'sg_pass_cta rate',
    }));
  }

  // Checkout → redirect = 0
  if (chain && s7.onsite > 0 && chain.mollie_redirect === 0) {
    opps.push(makeOpp({
      type: 'checkout-no-redirect',
      region: 'global',
      route: 'checkout-entry',
      severity: 'critical',
      evidence: `checkout→redirect 0% (${s7.onsite} onsite, 0 redirect)`,
      source: 'discovery:revenue-funnel',
      expectedImpact: 'restore payment flow',
      metric: 'mollie_redirect rate',
    }));
  }

  // PAID = 0 for extended period
  if (s7.paid === 0 && s7.sessions > 500) {
    opps.push(makeOpp({
      type: 'zero-paid',
      region: 'global',
      route: 'checkout-entry',
      severity: 'critical',
      evidence: `0 paid in 7d (${s7.sessions} sessions, ${s7.onsite} checkout)`,
      source: 'discovery:revenue-funnel',
      expectedImpact: 'identify payment blocker',
      metric: 'paid count',
    }));
  }

  return opps;
}

/** UX/UI Discovery from observation data */
async function discoverUXUI(obs) {
  const opps = [];
  if (!obs) return opps;

  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      // Visual shifts
      if (p.visual && p.visual.flagged && p.visual.pctHot > 0.2) {
        opps.push(makeOpp({
          type: 'visual-shift-high',
          region: regionId,
          route: p.route,
          severity: 'medium',
          evidence: `${p.route}@${p.viewport} pctHot=${p.visual.pctHot.toFixed(3)}`,
          source: 'discovery:ux-ui',
          expectedImpact: 'stabilize visual rendering',
          metric: 'visual diff pctHot',
        }));
      }

      // Console errors (non-expected)
      for (const err of p.consoleErrors || []) {
        if (!err.startsWith('Failed to load resource')) {
          opps.push(makeOpp({
            type: 'console-error',
            region: regionId,
            route: p.route,
            severity: 'medium',
            evidence: err.slice(0, 160),
            source: 'discovery:ux-ui',
            expectedImpact: 'fix JS error',
            metric: 'console errors count',
          }));
        }
      }

      // Slow LCP
      if (p.lcp && p.lcp > 4000 && p.viewport && parseInt(p.viewport) <= 768) {
        opps.push(makeOpp({
          type: 'slow-lcp',
          region: regionId,
          route: p.route,
          severity: 'medium',
          evidence: `LCP ${p.lcp}ms > 4000ms (${p.route}@${p.viewport})`,
          source: 'discovery:ux-ui',
          expectedImpact: 'improve LCP',
          metric: 'LCP ms',
        }));
      }
    }
  }

  return opps;
}

/** Browser Interaction Discovery (headless probe) */
async function discoverBrowserInteraction(cfg, obs) {
  const opps = [];

  // This would run a focused browser probe for interaction issues
  // For now, we'll use observation data patterns
  if (!obs) return opps;

  // Check for common interaction patterns from observation
  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      // High first-party failures on interactive pages
      if (p.route === 'paywall' || p.route === 'checkout') {
        if (p.firstPartyFailures && p.firstPartyFailures.length > 0) {
          opps.push(makeOpp({
            type: 'interaction-failure',
            region: regionId,
            route: p.route,
            severity: 'high',
            evidence: `${p.firstPartyFailures.length} failures on ${p.route}`,
            source: 'discovery:browser-interaction',
            expectedImpact: 'fix interaction reliability',
            metric: 'first-party failures',
          }));
        }
      }
    }
  }

  return opps;
}

/** AHA/WOW Discovery */
async function discoverAhaWow(obs) {
  const opps = [];

  // Look for missing AHA elements from observation
  if (!obs) return opps;

  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      if (p.route === 'home' || p.route === 'beach') {
        // Check if key elements are missing from visual data
        if (p.visual && p.visual.pctHot > 0.15) {
          opps.push(makeOpp({
            type: 'aha-visual-instability',
            region: regionId,
            route: p.route,
            severity: 'medium',
            evidence: `${p.route} visual instability pctHot=${p.visual.pctHot.toFixed(3)}`,
            source: 'discovery:aha-wow',
            expectedImpact: 'stabilize AHA moment rendering',
            metric: 'visual diff pctHot',
          }));
        }
      }
    }
  }

  return opps;
}

/** Data/DB Discovery */
async function discoverDataDB(cfg) {
  const opps = [];

  // Check for data consistency issues
  try {
    const regions = require('../regions/index.cjs');
    const all = regions.allRegions();
    for (const r of all) {
      if (!r.beaches || r.beaches.length === 0) {
        opps.push(makeOpp({
          type: 'empty-region-beaches',
          region: r.id,
          route: 'data',
          severity: 'high',
          evidence: `region ${r.id} has 0 beaches`,
          source: 'discovery:data-db',
          expectedImpact: 'restore beach data',
          metric: 'beach count per region',
        }));
      }
    }
  } catch (e) {
    // Ignore if regions not loadable
  }

  return opps;
}

/** DEV/Code Quality Discovery */
async function discoverDevQuality(cfg) {
  const opps = [];

  // Check for common code quality issues
  const checks = [
    { pattern: 'TODO|FIXME|XXX', severity: 'low', type: 'code-todo' },
    { pattern: 'console\\.log', severity: 'low', type: 'console-log' },
    { pattern: 'debugger', severity: 'medium', type: 'debugger-left' },
  ];

  const srcDir = path.join(C.ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));
    for (const f of files.slice(0, 20)) { // Limit to avoid long scans
      const content = fs.readFileSync(path.join(srcDir, f), 'utf8');
      for (const check of checks) {
        if (new RegExp(check.pattern).test(content)) {
          opps.push(makeOpp({
            type: check.type,
            region: 'dev',
            route: f,
            severity: check.severity,
            evidence: `${check.type} found in ${f}`,
            source: 'discovery:dev-quality',
            expectedImpact: 'clean code',
            metric: 'code quality issues',
          }));
        }
      }
    }
  }

  return opps;
}

/** Performance Discovery */
async function discoverPerformance(obs) {
  const opps = [];
  if (!obs) return opps;

  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      // Bundle size check would be done at build time
      // TTFB high
      if (p.timing && p.timing.ttfb && p.timing.ttfb > 2000) {
        opps.push(makeOpp({
          type: 'high-ttfb',
          region: regionId,
          route: p.route,
          severity: 'medium',
          evidence: `TTFB ${p.timing.ttfb}ms > 2000ms (${p.route}@${p.viewport})`,
          source: 'discovery:performance',
          expectedImpact: 'improve server response',
          metric: 'TTFB ms',
        }));
      }
    }
  }

  return opps;
}

/** SEO Discovery */
async function discoverSEO(cfg) {
  const opps = [];

  // Check for missing canonical/hreflang from SEO tools
  // This would integrate with existing SEO scripts
  const seoDir = path.join(C.ROOT, '.ai', 'plans');
  if (fs.existsSync(seoDir)) {
    const files = fs.readdirSync(seoDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      if (f.includes('SEO-OPPORTUNITY') || f.includes('SEO-MULTISITE')) {
        // Could parse these for actionable items
        opps.push(makeOpp({
          type: 'seo-opportunity',
          region: 'global',
          route: 'seo',
          severity: 'medium',
          evidence: `SEO opportunities documented in ${f}`,
          source: 'discovery:seo-indexing',
          expectedImpact: 'improve organic traffic',
          metric: 'organic sessions',
        }));
      }
    }
  }

  return opps;
}

/** SVG/Assets/Accessibility Discovery */
async function discoverA11y(cfg, obs) {
  const opps = [];

  // Check for missing alt text, SVG issues, etc.
  if (!obs) return opps;

  for (const [regionId, reg] of Object.entries(obs.regions || {})) {
    for (const p of reg.pages || []) {
      // Visual flag could indicate a11y issues
      if (p.visual && p.visual.flagged) {
        opps.push(makeOpp({
          type: 'a11y-visual-issue',
          region: regionId,
          route: p.route,
          severity: 'low',
          evidence: `visual flag on ${p.route}@${p.viewport} may indicate a11y issue`,
          source: 'discovery:svg-assets-a11y',
          expectedImpact: 'improve accessibility',
          metric: 'a11y violations',
        }));
      }
    }
  }

  return opps;
}

/** Factory pour créer une opportunité standardisée */
function makeOpp({ type, region, route, severity, evidence, source, expectedImpact = '', metric = '' }) {
  const fingerprint = `${type}|${region}|${route}|${String(evidence || '').slice(0, 80)}`;
  return {
    id: 'OPP-DISC-' + fingerprint.replace(/[^a-z0-9]+/gi, '-').slice(0, 60),
    fingerprint,
    title: `${type} on ${region}/${route} — ${String(evidence || '').slice(0, 60)}`,
    source,
    severity,
    confidence: 'inferred',
    actionable: 'agent',
    evidence,
    rollback: 'revert du commit',
    expectedImpact,
    metric,
    status: 'new',
    createdAt: C.nowIso(),
    scope: { files: inferScopeFiles(type, route) },
  };
}

/** Infère les fichiers probables à modifier selon le type d'opportunité */
function inferScopeFiles(type, route) {
  const map = {
    'prod-down': ['src/Sargasses_PROD.jsx'],
    'low-modal-cta': ['src/PremiumModal.jsx', 'src/PassOffer.jsx'],
    'checkout-no-redirect': ['src/PremiumModal/OnsiteCheckout.jsx', 'src/PremiumModal/doSubscribe.jsx'],
    'zero-paid': ['src/PremiumModal/OnsiteCheckout.jsx', 'public/api/mollie.php'],
    'visual-shift-high': ['src/Sargasses_PROD.jsx', 'src/sg-motion.css'],
    'console-error': ['src/Sargasses_PROD.jsx'],
    'slow-lcp': ['index.html', 'src/Sargasses_PROD.jsx'],
    'interaction-failure': ['src/PremiumModal/OnsiteCheckout.jsx', 'src/PremiumModal.jsx'],
    'aha-visual-instability': ['src/sg-motion.css', 'src/Sargasses_PROD.jsx'],
    'empty-region-beaches': ['regions/*.json', 'scripts/lib/dedicated-pages.cjs'],
    'code-todo': ['src/'],
    'console-log': ['src/'],
    'debugger-left': ['src/'],
    'high-ttfb': ['index.html', 'public/api/'],
    'seo-opportunity': ['scripts/prepare-ftp.cjs', 'scripts/lib/dedicated-pages.cjs'],
    'a11y-visual-issue': ['src/Sargasses_PROD.jsx', 'src/sg-brand-tokens.css'],
  };
  return map[type] || ['src/'];
}

/** Score d'opportunité (réutilise la logique d'analyze) */
const SEV = { critical: 50, high: 30, medium: 15, low: 5 };
const CONF = { proven: 20, observed: 10, inferred: 0 };
const EFFORT_PENALTY = { auto: 0, agent: 10, human: 999 };

function economicBonus(c) {
  const text = [c.title, c.evidence, c.expectedImpact, c.metric].filter(Boolean).join(' ');
  let bonus = 0;
  const REVENUE_BONUS = [
    [/premium|paywall|checkout|pricing|conversion|payment|mollie|cta/i, 35],
    [/trip|plan|decision|go|protect|beach/i, 15],
    [/seo|sitemap|canonical|index|robots|404|broken-link/i, 12],
    [/lcp|performance|bundle|slow/i, 8],
  ];
  const LOW_VALUE_PENALTY = [/visual-shift|animation|cosmetic|spacing|color/i];
  for (const [re, points] of REVENUE_BONUS) if (re.test(text)) { bonus += points; break; }
  if (LOW_VALUE_PENALTY.some(re => re.test(text))) bonus -= 8;
  if (c.expectedImpact && /€|revenue|paid|payment|conversion|checkout/i.test(c.expectedImpact)) bonus += 10;
  return bonus;
}

function scoreOpportunity(o, cfg) {
  return (SEV[o.severity] || 0)
    + (CONF[o.confidence] || 0)
    + economicBonus(o)
    - (EFFORT_PENALTY[o.actionable] ?? 999);
}

module.exports = { runDiscovery, DISCOVERY_SOURCES };