#!/usr/bin/env node
/**
 * metrics.cjs — VÉRITÉ REVENU & règles de décision de l'autopilot.
 *
 * KPI final = MOLLIE PAID (funnel.conversions / checkout réels), pas les clics.
 * Stripe = vérité MRR legacy (lecture seule). B2B = flux SÉPARÉ, jamais mélangé
 * au B2C dans une même métrique de conversion.
 *
 * Règles décision (mission §2/§6 — visibles, jamais de score caché) :
 *  - WIN : exige paid_after > paid_before (absolu) ET taux paid/qualifié non
 *    régressif ET fenêtre >= windowDays ET visiteurs >= minVisitors.
 *  - Clics only (CTA↑ mais paid =) → 'no-harm-keep' MAX — jamais 'win'.
 *  - LOSS : paid/qualifié ↓ avec >= minVisitors → rollback recommandé.
 *  - Sous minVisitors ou avant la fenêtre → 'inconclusive' (prudence petits échantillons).
 *  - Toute ligne de la réponse expose ses facteurs (reconstructible après coup).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, AP_DIR, nowIso } = require('./common.cjs');

const DAILY = path.join(ROOT, 'scripts', 'automation', 'data', 'daily-metrics.json');

function loadDaily() {
  try { return JSON.parse(fs.readFileSync(DAILY, 'utf8')); } catch (_) { return []; }
}

/** Somme du funnel sur les N derniers jours présents (données réelles, jamais fabriquées). */
function windowStats(days, beforeDate) {
  const cut = beforeDate ? new Date(beforeDate) : null;
  const rows = loadDaily()
    .filter(d => d && d.date && (!cut || d.date < beforeDate))
    .slice(-days);
  const f = rows.reduce((a, d) => {
    const q = d.funnel || {};
    a.days++;
    a.sessions += q.sessions || 0;
    a.modalOpens += q.modalOpens || 0;
    a.modalCta += q.modalCta || 0;
    a.onsite += q.onsiteCheckoutOpened || 0;
    a.mollieRedirects += q.mollieCheckoutRedirects || 0;
    a.paid += q.conversions || 0;           // payé (apps-script/supabase events)
    a.payments += d.payments || 0;          // paiements comptés
    a.revenue = (a.revenue || 0) + (d.revenue || 0);
    return a;
  }, { days: 0, sessions: 0, modalOpens: 0, modalCta: 0, onsite: 0, mollieRedirects: 0, paid: 0, payments: 0, revenue: 0 });
  f.paidPerOnsite = f.onsite > 0 ? +(f.paid / f.onsite).toFixed(4) : null;
  f.paidPerSession = f.sessions > 0 ? +(f.paid / f.sessions).toFixed(5) : null;
  const last = rows[rows.length - 1] || {};
  f.stripeActive = last.stripe && last.stripe.active != null ? last.stripe.active : null;
  f.mrrEur = last.stripe && last.stripe.mrr && last.stripe.mrr.eur != null ? last.stripe.mrr.eur : null;
  return f;
}

/** B2B = flux séparé. Lisible seulement si la source existe (jamais inventé). */
function b2bSnapshot() {
  const rows = loadDaily();
  const withB2b = rows.filter(d => d && d.b2b);
  if (!withB2b.length) {
    return { available: false, note: 'pas de bloc b2b dans daily-metrics.json (source = supabase b2b_probe / outreach) — non mélangé au B2C' };
  }
  const last = withB2b[withB2b.length - 1].b2b;
  return { available: true, date: withB2b[withB2b.length - 1].date, ...last };
}

/** Chaîne AHA → revenue (events factuels si présents dans le funnel quotidien). */
function ahaChain(days = 7) {
  const s = windowStats(days);
  return {
    premium_open: s.modalOpens, cta: s.modalCta, checkout_entry: s.onsite,
    mollie_redirect: s.mollieRedirects, paid: s.paid,
    note: 'étapes amont (aha_view/verdict/why/tomorrow/backup/trip) = events sg_* Supabase — joint analytique, absents du daily aggregator : non fabriqués ici',
  };
}

function snapshot() {
  return { at: nowIso(), d1: windowStats(1), d7: windowStats(7), d30: windowStats(30), b2b: b2bSnapshot() };
}

/**
 * decideExperiment({control, variant, minVisitors, windowDays, startedAt, now})
 * control/variant = résultats windowStats-like {sessions, onsite, paid, days}.
 * Retour : {decision, reason, factors{...}} — factors EXPOSES (reconstructible).
 */
function decideExperiment({ control, variant, minVisitors = 100, windowDays = 7, startedAt, now = Date.now() }) {
  const days = startedAt ? (now - new Date(startedAt).getTime()) / 864e5 : 0;
  const factors = {
    days: +days.toFixed(1), windowDays,
    visitors: variant.sessions, minVisitors,
    paid_control: control.paid, paid_variant: variant.paid,
    rate_control: control.paidPerOnsite, rate_variant: variant.paidPerOnsite,
  };
  if (days < windowDays) return { decision: 'inconclusive', reason: `fenêtre ${days.toFixed(1)}j < ${windowDays}j — mesure en cours`, factors };
  if (variant.sessions < minVisitors) return { decision: 'inconclusive', reason: `${variant.sessions} visiteurs < ${minVisitors} — petit échantillon, aucune décision`, factors };
  if (variant.paid > control.paid && (variant.paidPerOnsite == null || control.paidPerOnsite == null || variant.paidPerOnsite >= control.paidPerOnsite))
    return { decision: 'win', reason: `paid ${control.paid}→${variant.paid} sur fenêtre complète`, factors };
  // LOSS = baisse ABSOLUE du paid (le taux seul peut être un effet de mix trafic → prudence, jamais de FPV).
  if (variant.paid < control.paid)
    return { decision: 'loss', reason: `paid absolu ${control.paid}→${variant.paid} ↓ — rollback recommandé`, factors };
  return { decision: 'no-harm-keep', reason: `payé stable (${control.paid}→${variant.paid})${variant.paidPerOnsite != null && control.paidPerOnsite != null && variant.paidPerOnsite < control.paidPerOnsite ? ', taux ↓ = mix trafic possible' : ''} — clics ≠ revenu : conservé sans claim`, factors };
}

module.exports = { loadDaily, windowStats, snapshot, b2bSnapshot, ahaChain, decideExperiment };

if (require.main === module) {
  console.log(JSON.stringify(snapshot(), null, 2));
}
