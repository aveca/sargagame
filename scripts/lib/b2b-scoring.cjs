#!/usr/bin/env node
'use strict'
/**
 * B2B SALES ENGINE — deterministic scoring (Phase 2).
 *
 * PURE MODULE — zero network, zero DB, zero clock/Random side effect.
 * The caller provides plain facts harvested from verified sources
 * (SIRENE import, enrichment rows) and gets an explainable 0-100 score.
 *
 * Contract (mirrors supabase/schema.sql `prospect_scores`):
 *   components: b2b_relevance 0-25, sector_relevance 0-25,
 *               commercial_potential 0-20, contactability 0-15,
 *               company_quality 0-10, data_confidence 0-5  (total 100)
 *   plus: reasons[] (every rule that fired, in stable order),
 *         priority A+/A/B/C/D from CONFIGURABLE thresholds,
 *         model_version.
 *
 * HARD RULES:
 *   - never invents data: unknown facts simply do not fire rules
 *   - inactive companies are capped (prospecting a dead legal entity is
 *     a deliverability + compliance risk) — rule 'inactive_capped'
 */

const MODEL_VERSION = 'deterministic-v1'

const COMPONENT_BOUNDS = Object.freeze({
  b2b_relevance: 25,
  sector_relevance: 25,
  commercial_potential: 20,
  contactability: 15,
  company_quality: 10,
  data_confidence: 5,
})

const DEFAULT_THRESHOLDS = Object.freeze({ ap: 85, a: 70, b: 50, c: 30 })

/* Ranges SIRENE trancheEffectifsUniteLegale: 'NN'=non employeur inconnu,
   '00'=0 salarié, '01'=1-2, '02'=3-5, '03'=6-9, '11'=10-19, '12'=20-49,
   '21'=50-99, '22'=100-199, '31'=200-249, '32'=250-499, '41'=500-999,
   '42'=1000-1999, '51'=2000-4999, '52'=5000-9999, '53'=10000+ */
const RANGE_MIN_EMPLOYEES = Object.freeze({
  NN: null, '00': 0, '01': 1, '02': 3, '03': 6,
  11: 10, 12: 20, 21: 50, 22: 100, 31: 200, 32: 250,
  41: 500, 42: 1000, 51: 2000, 52: 5000, 53: 10000,
})

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

/**
 * @param {object} f facts — all optional; missing facts fire nothing.
 *   active_status      'active' | 'inactive' | 'unknown' (SIRENE-derived)
 *   sector             segment key (e.g. 'hotels') — caller-resolved
 *   employee_range     SIRENE tranche code ('01'.. '53', 'NN', '00')
 *   is_micro_enterprise boolean | null (catégorie juridique / SIRENE)
 *   has_website / has_commercial_website   boolean (enrichment, verified)
 *   email_status       'verified' | 'found' | 'generic' | null (enrichment)
 *   has_phone          boolean (enrichment, verified only)
 *   has_full_address / has_siege_establishment / has_legal_form / has_ape_code
 *   sirene_sourced     boolean (core legal facts come from SIRENE)
 *   enrichment_confidence_avg  number 0..1 | null
 * @param {object} [options]
 *   sectorWeights  map sector → 0-25 (default: none → 0, reason 'unknown_sector')
 *   thresholds     { ap, a, b, c } — priority cutoffs (defaults DEFAULT_THRESHOLDS)
 */
function scoreProspect(f, options) {
  const facts = f || {}
  const opts = options || {}
  const th = Object.assign({}, DEFAULT_THRESHOLDS, opts.thresholds || {})
  const sectorWeights = opts.sectorWeights || {}
  const reasons = []
  const c = {}

  // ---- b2b_relevance (0-25) -------------------------------------------------
  let v = 0
  const status = facts.active_status === 'active' || facts.active_status === 'inactive'
    ? facts.active_status : 'unknown'
  if (status === 'active') { v += 12; reasons.push('active_company') }
  else if (status === 'unknown') { reasons.push('status_unknown') }
  else reasons.push('inactive_company')
  const minEmp = RANGE_MIN_EMPLOYEES[facts.employee_range]
  if (minEmp != null && minEmp > 0) { v += 5; reasons.push('employer') }
  else if (minEmp === 0) { reasons.push('no_employees_declared') }
  if (facts.is_micro_enterprise === false) { v += 8; reasons.push('established_entity') }
  else if (facts.is_micro_enterprise === true) { v += 2; reasons.push('micro_enterprise') }
  c.b2b_relevance = clamp(v, 0, COMPONENT_BOUNDS.b2b_relevance)

  // ---- sector_relevance (0-25) ----------------------------------------------
  const sw = typeof facts.sector === 'string' ? sectorWeights[facts.sector] : undefined
  if (typeof sw === 'number') {
    c.sector_relevance = clamp(sw, 0, COMPONENT_BOUNDS.sector_relevance)
    if (c.sector_relevance > 0) reasons.push('target_sector:' + facts.sector)
    else reasons.push('non_target_sector:' + facts.sector)
  } else {
    c.sector_relevance = 0
    reasons.push('unknown_sector')
  }

  // ---- commercial_potential (0-20) -------------------------------------------
  v = 0
  if (facts.has_website === true) { v += 6; reasons.push('has_website') }
  if (facts.has_commercial_website === true) { v += 6; reasons.push('commercial_website') }
  if (minEmp != null && minEmp >= 10) { v += 4; reasons.push('team_10_plus') }
  if (typeof facts.age_years === 'number' && facts.age_years >= 2) { v += 4; reasons.push('established_2y_plus') }
  c.commercial_potential = clamp(v, 0, COMPONENT_BOUNDS.commercial_potential)

  // ---- contactability (0-15) ---------------------------------------------------
  v = 0
  if (facts.email_status === 'verified') { v += 10; reasons.push('professional_email_verified') }
  else if (facts.email_status === 'found') { v += 5; reasons.push('professional_email_found_unverified') }
  else if (facts.email_status === 'generic') { v += 2; reasons.push('generic_email_only') }
  if (facts.has_phone === true) { v += 3; reasons.push('phone_available') }
  if (facts.email_status === 'verified' && facts.has_phone === true) {
    v += 2; reasons.push('multi_channel')
  }
  c.contactability = clamp(v, 0, COMPONENT_BOUNDS.contactability)

  // ---- company_quality (0-10) ---------------------------------------------------
  v = 0
  if (facts.has_full_address === true) { v += 3; reasons.push('full_address') }
  if (facts.has_siege_establishment === true) { v += 2; reasons.push('siege_known') }
  if (facts.has_legal_form === true) { v += 2; reasons.push('legal_form_known') }
  if (facts.has_ape_code === true) { v += 3; reasons.push('ape_known') }
  c.company_quality = clamp(v, 0, COMPONENT_BOUNDS.company_quality)

  // ---- data_confidence (0-5) ------------------------------------------------------
  v = 0
  if (facts.sirene_sourced === true) { v += 3; reasons.push('sirene_sourced') }
  if (typeof facts.enrichment_confidence_avg === 'number' && facts.enrichment_confidence_avg >= 0.8) {
    v += 2; reasons.push('enrichment_high_confidence')
  }
  c.data_confidence = clamp(v, 0, COMPONENT_BOUNDS.data_confidence)

  // ---- total + guards -------------------------------------------------------------
  let score = c.b2b_relevance + c.sector_relevance + c.commercial_potential +
    c.contactability + c.company_quality + c.data_confidence
  if (status === 'inactive' && score > 25) {
    score = 25
    reasons.push('inactive_capped')
  }
  score = clamp(Math.round(score), 0, 100)

  const priority = score >= th.ap ? 'A+' : score >= th.a ? 'A'
    : score >= th.b ? 'B' : score >= th.c ? 'C' : 'D'

  return {
    score,
    priority,
    reasons,
    model_version: MODEL_VERSION,
    components: c,
  }
}

module.exports = {
  MODEL_VERSION,
  COMPONENT_BOUNDS,
  DEFAULT_THRESHOLDS,
  RANGE_MIN_EMPLOYEES,
  scoreProspect,
}
