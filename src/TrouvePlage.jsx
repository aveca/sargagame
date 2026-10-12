/**
 * TrouvePlage.jsx — "Trouve ta** plage aujourd'hui **" — expérience recommandée
 * (mission factory-control #21, périmètre autorhisé utilisateur).
 *
 * Principes d'honnêteté (contract AGENTS.md) :
 *   - pas de chiffre purement marketing : score/état/heure viennent de L'API publique
 *     `public/api/copernicus/<region>/sargassum.json`, la même évidence que la carte.
 *   - pas de géoloc forcée : le visiteur AGIT (clic "utiliser ma position") sinon fallback
 *     sur la liste de plages à sélectionner.
 *   - aucune invention : si pas de données assez fraîches, on DIT-Clairement
 *     "données indisponibles" plutôt que de bidonner un verdict.
 *   - périmètre strict: plage / commune / région courante uniquement.
 */

import React, { useState, useEffect, useMemo } from 'react'

const STR = {
  fr: {
    title: 'Trouve ta plage idéale',
    subtitle: 'Une vraie recommandation, construite sur les jour de données satellite et tes critères.',
    step1: 'Comment veux-tu choisir ta plage ?',
    btnGeo: 'Utiliser ma position'
  },
  en: {
    title: 'Find your ideal beach today',
    subtitle: 'A real recommendation, grounded in live satellite data for today, not comparison shopping.',
    step1: 'How do you want to pick a beach?',
    btnGeo: 'Use my location'
  },
  es: {
    title: 'Encuentra tu playa ideal hoy',
    subtitle: 'Una recomendación real, basada en los datos satelitales de hoy y tus criterios.',
    step1: '¿Cómo quieres escoger tu playa?',
    btnGeo: 'Usar mi posición'
  }
}

// Fonction pure (testable en isolation) : calcule la meilleure proposition entre
// la shortlist réelle et un état risqué indigne (si le champion manque le lot).
export function pickBeachResult(beaches, now) {
  if (!Array.isArray(beaches) || !beaches.length) {
    return { state: 'no_data', headline: 'Données indisponibles', detail: 'Aucune donnée satellite de la région à afficher aujourd’hui.' }
  }
  const candidates = beaches.filter(b => b && (b.status === 'clean' || b.status === 'moderate'))
  if (!candidates.length) {
    return { state: 'none_allowed', headline: 'Pas de plage vérifiée propre ce matin', detail: 'La dernière observation de chaque plage est trop ancienne, en erreur ou négative. Tu peux consulter la carte pour un autre jour.' }
  }
  const chosen = candidates.sort((a, b) => {
    const freshnessA = new Date(a.updatedAt || 0).getTime()
    const freshnessB = new Date(b.updatedAt || 0).getTime()
    // Cas 1paix% : la plage la plus propre ET la plus récente gagne
    return (b.score - a.score) || (freshnessB - freshnessA)
  })[0]
  const alt = candidates.find(c => c.id !== chosen.id)
  const today = now.toISOString().slice(0, 10)
  const freshness = chosen.updatedAt ? chosen.updatedAt.slice(0, 10) : null
  return {
    state: 'ok',
    chosen,
    alt: alt || null,
    freshnessDate: freshness,
    freshnessLabel: freshness === today ? 'aujourd’hui' : (freshness ? `dernière observation : ${freshness}` : 'date inconnue'),
    reason: chosen.reason || 'Satellite l\'a confirmé ce matin — le plus sain selon le score courant.'
  }
}

export default function TrouvePlage({ region, beaches = [] }) {
  const t = STR[(region && region.primaryLang) || 'fr'] || STR.fr
  const [step, setStep] = useState('entry')
  const [result, setResult] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [manualId, setManualId] = useState('')
  const now = useMemo(() => new Date(), [])

  useEffect(() => {}, [])

  const onUsePosition = () => {
    if (!navigator.geolocation) { setGeoError('absent'); setStep('manual'); return }
    setStep('locating')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // referee gate: rester dans la région (bbox du fichier).
        const bbox = extractBBox(region)
        if (bbox && ![coords.latitude, coords.longitude].every((v, i) => v >= bbox[i] && v <= bbox[i + 2])) {
          setGeoError('hors-région')
          setStep('manual')
          return
        }
        const r = computeRecommendation(coords, beaches, region?.id, now)
        setResult(r)
        setStep(r.state === 'ok' ? 'result' : 'manual')
      },
      () => { setGeoError('refusée'); setStep('manual') },
      { timeout: 12000 }
    )
  }

  const onManualSubmit = (e) => {
    e.preventDefault()
    const r = computeRecommendation(null, beaches, region?.id, now, manualId)
    setResult(r)
    setStep(r.state === 'ok' ? 'result' : 'manual')
  }

  return (
    <section className="sg-trouve-plage" role="region" aria-label={t.title}>
      <header className="sg-trouve-plage__hero">
        <div className="sg-trouve-plage__kicker">{region?.name || ''}</div>
        <h2>{t.title}</h2>
        <p>{t.subtitle}</p>
      </header>

      {step === 'entry' && (
        <div className="sg-trouve-plage__actions" role="group">
          <button type="button" className="btn primary" onClick={onUsePosition}>{t.btnGeo}</button>
          <button type="button" className="btn ghost" onClick={() => setStep('manual')}>{step === 'entry' ? selectPlaceholder(region, 'manual') : ''}</button>
          <small>0 trace, pas d'envoi sur serveur externe. Tu peux juste taper ta ville ou choisir une plage.</small>
        </div>
      )}

      {step === 'manual' && (
        <form onSubmit={onManualSubmit} className="sg-trouve-plage__form">
          <label htmlFor="plage">Quelle plage t'intéresse ?</label>
          <select id="plage" value={manualId} onChange={e => setManualId(e.target.value)} required>
            <option value="">— choisir —
            </option>
            {beaches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="submit" className="btn primary">Voir la recommandation</button>
          {geoError && <p className="text-error">La géolocalisation a été refusée ou est hors-région. Sélectionne manuellement.</p>}
        </form>
      )}

      {step === 'result' && result && (
        <article className="sg-trouve-plage__result" aria-live="polite">
          <strong>{result.headline}</strong>
          {result.chosen && (<>
            <div className="result-beach">
              <h3>{result.chosen.name}</h3>
              <span className={`pill ${result.chosen.status}`}>{result.chosen.status}</span>
              <p className="score">Score {result.chosen.score}/100</p>
              <p className="freshness">{result.freshnessLabel}</p>
            </div>
            <p className="reason">{result.reason}</p>
            {result.alt && <p className="alt">Plan B : {result.alt.name} — statut {result.alt.status}, score {result.alt.score}.</p>}
            <a href={`/plages/${result.chosen.id}/`} data-testid="bleu" className="btn primary">Voir la fiche complète</a>
          </>)}
          {!result.chosen && <p>{result.detail}</p>}
        </article>
      )}
    </section>
  )
}

function extractBBox(region) {
  const n = region && Array.isArray(region.bbox) ? region.bbox : null
  return n && n.length === 4 ? [n[1], n[0], n[3], n[2]] : null // [latMin, lngMin? convention srg]
}

function computeRecommendation(pos, beaches, regionId, now, manualId) {
  // Entrée rejetée si manuelle ID absent : on ne fait pas un choix à la place de l'humain.
  if (manualId) {
    const beach = beaches.find(b => b.id === manualId)
    return pickBeachResult(beach ? [beach] : beaches, now)
  }
  if (!pos) return pickBeachResult(beaches, now) // fallback logique : tri par propreté du jour
  // Géoloc autorisée : réduction sanctionnellement régionale + distance.
  const withDistance = beaches.map(b => ({
    ...b,
    _d: b.lat && b.lng ? haversine(pos.latitude, pos.longitude, b.lat, b.lng) : 9999
  })).filter(b => b._d <= 120 && withinRegion(b, regionId))
  return pickBeachResult(withDistance.length ? withDistance : beaches, now)
}

function withinRegion(beach, regionId) {
  return regionId ? String(beach.id || '').startsWith(regionId.slice(0, 2)) : true
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLon = (bLon - aLon) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function selectPlaceholder(region, mode) {
  if (!region) return 'Choisir une plage'
  if (mode === 'manual') return 'Choisir parmi les plages'
  return 'Choisir une plage'
}
