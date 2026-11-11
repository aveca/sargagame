#!/usr/bin/env node
// tests/unit/bug-2026-015-offer-decoupling.test.cjs — BUG-2026-015.
//
// POURQUOI : l'offre commerciale B2C était conditionnée à la FRAÎCHEUR satellite.
// Quand l'observation ERDDAP était ancienne (incident récurrent : le pipeline sert
// l'observation avec ~24 h de retard), ChasseHome remplaçait TOUTE l'expérience par un
// écran « À VÉRIFIER » SANS aucun CTA d'achat → le tunnel commercial était fermé
// pendant les incidents de données.
//
// CE QUE CE TEST VERROUILLE (contrat de découplage, 3 notions distinctes) :
//   1. l'OFFRE reste disponible quelle que soit la fraîcheur de l'observation ;
//   2. hors verdict courant, le CTA ne promet PAS de prévision (copy honnête) ;
//   3. la date de la dernière observation est affichée explicitement (jamais inventée) ;
//   4. les DONNÉES (score / verdict / prévision 7 j) restent suspendues ;
//   5. le câblage source : CTA non conditionnés + porte d'offre sur l'écran stale.
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')

const now = Date.parse('2026-11-11T12:00:00.000Z')
let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

async function main() {
  const {
    lcOfferCtaCopy,
    lcLastObservationLabel,
    isSatelliteFresh12h,
  } = await import('../../src/lib/format-freshness.mjs')

  const fresh = { source: 'erddap-live', stale: false, erddapTimestamp: '2026-11-11T08:00:00.000Z' }
  const old = { source: 'erddap-live', stale: false, erddapTimestamp: '2026-11-09T12:00:00.000Z' }

  // ── 1. L'OFFRE ne dépend JAMAIS de la fraîcheur ─────────────────────────────
  for (const [label, payload] of [['fraîche', fresh], ['ancienne', old], ['absente', {}]]) {
    const copy = lcOfferCtaCopy(payload, 'fr', now)
    t(copy.offerAvailable === true, `offre disponible (payload ${label})`)
    t(typeof copy.label === 'string' && copy.label.length > 0, `libellé de CTA non vide (payload ${label})`)
  }

  // ── 2. Verdict courant => CTA prévision (comportement historique) ───────────
  const current = lcOfferCtaCopy(fresh, 'fr', now)
  t(current.forecastCurrent === true, 'observation récente => verdict courant')
  t(current.label.includes('VOIR LES 7 PROCHAINS JOURS'), 'observation récente => CTA prévision')
  t(current.note === '', 'observation récente => pas de note de pause')

  // ── 3. Verdict suspendu => CTA honnête, AUCUNE promesse de prévision ───────
  const paused = lcOfferCtaCopy(old, 'fr', now)
  t(paused.forecastCurrent === false, 'observation ancienne => verdict suspendu')
  t(!paused.label.includes('7 PROCHAINS JOURS') && !paused.label.includes('7 DAYS'),
    'observation ancienne => le CTA ne promet PAS la prévision 7 jours')
  t(paused.label.length > 0, 'observation ancienne => un CTA d\'achat reste affiché')
  t(paused.note.includes('pause'), 'observation ancienne => note explicite de pause')
  t(!paused.note.includes('aujourd\'hui') && !paused.note.includes('today'),
    'observation ancienne => aucune promesse de donnée actuelle')

  // Contrat local de verdict (statut de plage valide) : surcharge prioritaire.
  t(lcOfferCtaCopy(fresh, 'fr', now, false).forecastCurrent === false,
    'verdict local invalide => CTA de pause même avec une observation récente')
  t(lcOfferCtaCopy(old, 'fr', now, true).forecastCurrent === true,
    'verdict local valide => CTA prévision (surcharge explicite)')

  // ── 4. Localisation (EN / ES) ───────────────────────────────────────────────
  const pausedEn = lcOfferCtaCopy(old, 'en', now)
  const pausedEs = lcOfferCtaCopy(old, 'es', now)
  t(pausedEn.label !== paused.label && pausedEn.note.length > 0, 'copy EN dédiée')
  t(pausedEs.label !== paused.label && pausedEs.note.length > 0, 'copy ES dédiée')
  t(!pausedEn.label.includes('7 DAYS'), 'copy EN hors verdict => pas de promesse de prévision')

  // ── 5. Date de la dernière observation : explicite, jamais inventée ─────────
  const dateFr = lcLastObservationLabel(old, 'fr', now)
  t(dateFr.includes('Dernière observation satellite'), 'date FR affichée explicitement')
  t(/\d{2}\s+\S+\.?\s+\d{2}:\d{2}\s+UTC/.test(dateFr), 'date FR = jour + mois + heure UTC')
  const dateEn = lcLastObservationLabel(old, 'en', now)
  t(dateEn.includes('Last satellite observation'), 'date EN affichée explicitement')
  t(lcLastObservationLabel({}, 'fr', now).includes('à vérifier'),
    'horodatage absent => « à vérifier », aucune date inventée')
  t(lcLastObservationLabel({ erddapTimestamp: 'not-a-date' }, 'fr', now).includes('à vérifier'),
    'horodatage invalide => « à vérifier »')
  t(lcLastObservationLabel({ erddapTimestamp: new Date(now + 3600000).toISOString() }, 'fr', now).includes('à vérifier'),
    'horodatage futur => « à vérifier » (fail-closed)')

  // ── 6. Aucune régression sur les garde-fous de fraîcheur ───────────────────
  t(isSatelliteFresh12h(old, now) === false, 'l\'observation ancienne reste non courante (gate 12h intact)')
  t(isSatelliteFresh12h(fresh, now) === true, 'l\'observation récente reste courante')

  // ── 7. Câblage source : ChasseHome.jsx ─────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')

  // 7a. Le CTA du détail n'est plus conditionné par satelliteDecisionCurrent.
  const ctaIdx = src.indexOf('data-testid="lc-detail-offer-cta"')
  t(ctaIdx > 0, 'le détail plage expose un CTA d\'achat stable')
  const ctaGate = src.slice(Math.max(0, ctaIdx - 220), ctaIdx)
  t(!ctaGate.includes('satelliteDecisionCurrent&&'),
    'CTA d\'achat du détail : plus de gate satelliteDecisionCurrent')
  t(/!isPremium&&<button/.test(ctaGate), 'CTA d\'achat du détail : visible pour les non-premium')
  t(src.includes('lcOfferCtaCopy(sargData,lang,Date.now(),satelliteDecisionCurrent)'),
    'le détail utilise le helper partagé de copy d\'offre')

  // 7b. La porte d'offre de l'écran stale + la date de la dernière observation.
  const wrapperStart = src.indexOf('export default function ChasseHome(props){')
  const innerStart = src.indexOf('function ChasseHomeFresh(props){', wrapperStart)
  t(wrapperStart >= 0 && innerStart > wrapperStart, 'wrapper ChasseHome présent')
  const wrapper = src.slice(wrapperStart, innerStart)
  t(wrapper.includes('data-testid="chasse-home-offer-cta"'),
    'l\'écran stale expose une porte d\'achat (tunnel jamais fermé)')
  t(wrapper.includes('onPremium("chasse_stale_offer")'),
    'la porte d\'achat de l\'écran stale ouvre bien le paywall')
  t(wrapper.includes('lcLastObservationLabel(sargData, lang)'),
    'l\'écran stale affiche la date de la dernière observation')
  t(wrapper.includes('data-testid="chasse-home-last-observation"'),
    'la date de la dernière observation a un sélecteur de test stable')
  t(wrapper.includes('lcDetailFreshnessLabel(sargData, lang)'),
    'l\'écran stale garde l\'explication d\'âge / vérification existante')
  t(!wrapper.includes('satelliteDecisionCurrent'),
    'l\'écran stale ne conditionne pas l\'offre à un verdict satellite')
  t(!/useState|useEffect|useMemo|useCallback/.test(wrapper),
    'le wrapper reste sans hook (early return React-safe)')

  // 7c. Les DONNÉES restent suspendues (aucune donnée inventée).
  t(/const sc=satelliteDecisionCurrent&&beach\.score!=null/.test(src),
    'le score reste masqué hors verdict courant')
  t(src.includes('data-testid="lc-detail-score-paused"'), 'le bandeau « score masqué » est conservé')
  t(src.includes('data-testid="lc-detail-forecast-paused"'), 'la prévision 7 j reste suspendue')
  t(src.includes('data-testid="lc-detail-offer-note"'), 'le détail affiche la note honnête d\'offre')
  t(src.includes('data-testid="lc-detail-last-observation"'), 'le détail affiche la date de la dernière observation')

  console.log(`\nBUG_2026_015_OFFER_DECOUPLING_TESTS PASS (${n} assertions)`)
}
main().catch(err => { console.error(err); process.exit(1) })
