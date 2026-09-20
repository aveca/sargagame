#!/usr/bin/env node
'use strict'
/**
 * Contract test — scripts/lib/b2b-scoring.cjs (Phase 2).
 * 100 % local, no network, no DB, no clock dependency.
 */
const {
  MODEL_VERSION, COMPONENT_BOUNDS, DEFAULT_THRESHOLDS, scoreProspect,
} = require('../lib/b2b-scoring.cjs')

let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

const SECTOR_WEIGHTS = { hotels: 25, restaurants: 16, construction: 8 }

// --- structure de sortie -----------------------------------------------------
{
  const r = scoreProspect({ active_status: 'active', sector: 'hotels' }, { sectorWeights: SECTOR_WEIGHTS })
  ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100, 'score borné 0..100')
  ok(['A+', 'A', 'B', 'C', 'D'].includes(r.priority), 'priority dans A+/A/B/C/D')
  ok(Array.isArray(r.reasons), 'reasons[] présent')
  ok(r.model_version === MODEL_VERSION, 'model_version exposé')
  ok(r.components && typeof r.components === 'object', 'components exposé')
  for (const [k, max] of Object.entries(COMPONENT_BOUNDS)) {
    ok(r.components[k] >= 0 && r.components[k] <= max, `composante ${k} bornée 0..${max}`)
  }
  ok(
    Object.values(r.components).reduce((a, b) => a + b, 0) === r.score,
    'score = somme des composantes (intégrité)',
  )
}

// --- déterminisme -------------------------------------------------------------
{
  const input = {
    active_status: 'active', sector: 'hotels', employee_range: '12',
    is_micro_enterprise: false, has_website: true, has_commercial_website: true,
    email_status: 'verified', has_phone: true, has_full_address: true,
    has_siege_establishment: true, has_legal_form: true, has_ape_code: true,
    sirene_sourced: true, enrichment_confidence_avg: 0.9, age_years: 10,
  }
  const a = scoreProspect(input, { sectorWeights: SECTOR_WEIGHTS })
  const b = scoreProspect(JSON.parse(JSON.stringify(input)), { sectorWeights: SECTOR_WEIGHTS })
  ok(JSON.stringify(a) === JSON.stringify(b), 'déterminisme : même entrée → même sortie')
  ok(a.score === 100, 'profil maximal = 100 (got ' + a.score + ')')
  ok(a.priority === 'A+', '100 → A+')
  ok(a.reasons.includes('active_company'), 'reason: active_company')
  ok(a.reasons.includes('target_sector:hotels'), 'reason: target_sector')
  ok(a.reasons.includes('professional_email_verified'), 'reason: email verified')
  ok(a.reasons.includes('sirene_sourced'), 'reason: sirene_sourced')
}

// --- cas limites ----------------------------------------------------------------
{
  const empty = scoreProspect({}, {})
  ok(empty.score === 0, 'entrée vide → 0')
  ok(empty.priority === 'D', 'entrée vide → D')
  ok(empty.reasons.includes('inactive_company') === false, 'vide ≠ inactive')
  ok(empty.reasons.includes('unknown_sector'), 'vide → unknown_sector')

  const inactive = scoreProspect({
    active_status: 'inactive', sector: 'hotels', is_micro_enterprise: false,
    has_website: true, has_commercial_website: true, email_status: 'verified',
    has_full_address: true, has_legal_form: true, has_ape_code: true, sirene_sourced: true,
  }, { sectorWeights: SECTOR_WEIGHTS })
  ok(inactive.score === 25, 'inactive CAPÉ à 25 (got ' + inactive.score + ')')
  ok(inactive.reasons.includes('inactive_capped'), 'reason inactive_capped')
  ok(inactive.priority === 'D', 'inactive → jamais prioritaire')

  const unknownStatus = scoreProspect({ active_status: 'unknown' }, {})
  ok(unknownStatus.components.b2b_relevance === 0, 'unknown status → 0 (aucun point non vérifié)')
  ok(unknownStatus.reasons.includes('status_unknown'), 'reason status_unknown')

  // l'IA/les faits manquants ne boostent jamais : un champ inconnu = 0 point
  const sparse = scoreProspect({ active_status: 'active', employee_range: 'NN' }, {})
  ok(sparse.components.commercial_potential === 0, 'aucun fait → aucun potentiel commercial')
  ok(sparse.components.contactability === 0, 'aucun fait → aucune contactabilité')
  ok(sparse.components.data_confidence === 0, 'aucun fait → aucune confiance')
}

// --- seuils configurables ---------------------------------------------------------
{
  const mid = scoreProspect({ active_status: 'active', employee_range: '01' }, {}) // 12+5=17
  ok(mid.priority === 'D', 'défaut : 17 → D')
  const lax = scoreProspect({ active_status: 'active', employee_range: '01' }, {
    thresholds: { ap: 60, a: 40, b: 20, c: 10 },
  })
  ok(lax.priority === 'C', 'seuils custom : 17 → C')
  const strict = scoreProspect({ active_status: 'active', employee_range: '12', is_micro_enterprise: false }, {}) // 25
  ok(strict.priority === 'D', 'défaut 25 → D (' + strict.priority + ')')
  const strictLow = strict // 25 vs thresholds {c: 25}
  const r2 = scoreProspect({ active_status: 'active', employee_range: '12', is_micro_enterprise: false }, {
    thresholds: { ap: 90, a: 80, b: 40, c: 25 },
  })
  ok(r2.priority === 'C', 'seuil >= : 25 == c → C')
  ok(JSON.stringify(DEFAULT_THRESHOLDS) === JSON.stringify({ ap: 85, a: 70, b: 50, c: 30 }), 'défauts documentés = 85/70/50/30')
}

// --- segmentation par poids configurables -------------------------------------------
{
  const r1 = scoreProspect({ active_status: 'active', sector: 'hotels' }, { sectorWeights: SECTOR_WEIGHTS })
  const r2 = scoreProspect({ active_status: 'active', sector: 'construction' }, { sectorWeights: SECTOR_WEIGHTS })
  const r3 = scoreProspect({ active_status: 'active', sector: 'not_configured' }, { sectorWeights: SECTOR_WEIGHTS })
  ok(r1.components.sector_relevance === 25, 'hotels → 25')
  ok(r2.components.sector_relevance === 8, 'construction → 8')
  ok(r3.components.sector_relevance === 0 && r3.reasons.includes('unknown_sector'), 'secteur hors config → 0 + reason')
}

// --- garde-fous -----------------------------------------------------------------------
{
  const odd = scoreProspect({ active_status: 'actif' /* typo FR */, sector: 'hotels' }, { sectorWeights: SECTOR_WEIGHTS })
  ok(odd.components.b2b_relevance <= 4, 'statut non normalisé → traité unknown (pas de bonus actif)')
  const neg = scoreProspect({ enrichment_confidence_avg: -1, age_years: -3 }, {})
  ok(!neg.reasons.includes('established_2y_plus'), 'âge négatif ignoré')
  ok(neg.score === 0, 'bornage bas respecté')
}

console.log(failures === 0 ? '\nB2B-SCORING TESTS: ALL PASS' : `\nB2B-SCORING TESTS: ${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
