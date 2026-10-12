import React, { useEffect, useMemo, useState } from 'react'
import { beachPageUrl } from './lib/slug-resolver.js'
import { getBeachRecommendation, matchesRegion } from './lib/trouve-plage-recommendation.js'
import './TrouvePlage.css'

const COPY = {
  fr: {
    eyebrow: 'LE VEILLEUR · RECOMMANDATION PERSONNELLE',
    title: 'Trouve ta plage idéale',
    subtitle: 'Une recommandation concrète, fondée sur la dernière observation satellite disponible.',
    useLocation: 'Trouver près de moi', manual: 'Choisir une plage', locationBusy: 'Recherche des plages à proximité…', privacy: 'La position est facultative. Elle sert uniquement à classer les plages proches dans cette session.',
    close: 'Fermer et revenir à la carte', photoCaption: 'Photo de la plage · pas une mesure satellite',
    resultEyebrow: 'MEILLEURE OPTION DISPONIBLE', recommendedTitle: 'La meilleure option disponible', selectedEyebrow: 'ÉTAT DE LA PLAGE CHOISIE', selectedTitle: 'Statut actuel de cette plage',
    clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter', score: 'Score plage',
    observed: 'Observation satellite', why: 'Pourquoi ce choix',
    whyCopy: 'Cette plage ressort selon son statut et son score actuels. Le statut peut changer après une nouvelle observation.',
    planB: 'Une alternative', planBHint: 'À comparer avant de partir',
    chooseTitle: 'Choisir une plage de la région', chooseLabel: 'Plage',
    choosePlaceholder: 'Sélectionner une plage…', showResult: 'Voir son état', back: 'Retour',
    map: 'Explorer toutes les plages',
    noBeachesTitle: 'Aucune plage disponible', noBeaches: 'La liste des plages de cette région est indisponible.',
    noObservationTitle: 'Pas d’observation satellite datée',
    noObservation: 'Nous ne pouvons pas vérifier la fraîcheur des données nécessaires à une recommandation actuelle.',
    staleTitle: 'Observation trop ancienne',
    stale: 'La dernière observation disponible a plus de 12 heures ou porte une date future. Nous ne la présentons pas comme actuelle.',
    noRegionalTitle: 'Aucune plage de cette région dans les données disponibles',
    noRegional: 'La source ne contient aucune plage correspondant à ce site.',
    noNearbyTitle: 'Aucune plage proche dans les données actuelles',
    noNearby: 'Aucune plage de cette région avec coordonnées disponibles n’a été trouvée à moins de 120 km. Choisis une plage manuellement.',
    noSafeTitle: 'Aucune recommandation positive disponible',
    noSafe: 'Les statuts actuels ne permettent pas de recommander une plage propre ou modérée. Consulte la carte et les dernières observations.',
    notFoundTitle: 'Plage indisponible', notFound: 'Cette plage ne figure pas dans les données actuelles de la région.',
    selectedAvoidTitle: 'Cette plage est signalée « à éviter »',
    selectedAvoid: 'Tu as choisi cette plage, mais son statut actuel ne permet pas de la recommander. Consulte l’alternative.',
    locationDenied: 'Position indisponible ou refusée. Tu peux continuer avec le choix manuel.',
    outsideRegion: 'La position est hors de la zone reconnue pour ce site. Choisis une plage de la liste.',
    distance: km => 'À environ ' + km + ' km', freshnessHours: h => 'Observation il y a ' + h + ' h',
    freshnessMinutes: m => 'Observation il y a ' + m + ' min', source: 'Source satellite',
    freshnessNow: 'Observation très récente', noPhoto: 'Photo non disponible'
  },
  en: {
    eyebrow: 'THE WATCHER · PERSONAL RECOMMENDATION',
    title: 'Find your ideal beach',
    subtitle: 'A useful recommendation based on the latest dated satellite observation available.',
    useLocation: 'Find beaches near me', manual: 'Choose a beach', locationBusy: 'Finding nearby beaches…', privacy: 'Location is optional and is used only to rank nearby beaches in this session.',
    close: 'Close and return to the map', photoCaption: 'Beach photo · not a satellite measurement',
    resultEyebrow: 'BEST AVAILABLE MATCH', recommendedTitle: 'Your best available option', selectedEyebrow: 'STATUS OF YOUR SELECTED BEACH', selectedTitle: 'Current beach status',
    clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid', score: 'Beach score',
    observed: 'Satellite observation', why: 'Why this beach',
    whyCopy: 'This beach ranks by its current status and score. Its status may change after a new observation.',
    planB: 'An alternative', planBHint: 'Compare before you go',
    chooseTitle: 'Choose a beach in this region', chooseLabel: 'Beach',
    choosePlaceholder: 'Select a beach…', showResult: 'Check its status', back: 'Back',
    map: 'Explore all beaches',
    noBeachesTitle: 'No beaches available', noBeaches: 'The beach list for this region is unavailable.',
    noObservationTitle: 'No dated satellite observation',
    noObservation: 'We cannot verify data freshness well enough to make a current recommendation.',
    staleTitle: 'Observation is out of date',
    stale: 'The latest observation is more than 12 hours old or has a future timestamp. We will not present it as current.',
    noRegionalTitle: 'No beaches from this region in the available data', noRegional: 'The source contains no beaches matching this site.',
    noNearbyTitle: 'No nearby beach in the current data',
    noNearby: 'No beach in this region with coordinates was found within 120 km. Choose a regional beach manually.',
    noSafeTitle: 'No positive recommendation is available',
    noSafe: 'Current statuses do not support recommending a clean or moderate beach. Check the map and latest observations.',
    notFoundTitle: 'Beach unavailable', notFound: 'This beach is not present in the current regional data.',
    selectedAvoidTitle: 'This beach is marked “avoid”',
    selectedAvoid: 'You selected this beach, but its current status does not support recommending it. Check the alternative below.',
    locationDenied: 'Location unavailable or permission denied. You can continue by choosing a beach.',
    outsideRegion: 'Your location is outside the area recognised for this site. Choose a beach from the list.',
    distance: km => 'About ' + km + ' km away', freshnessHours: h => 'Observed ' + h + ' h ago',
    freshnessMinutes: m => 'Observed ' + m + ' min ago', source: 'Satellite source',
    freshnessNow: 'Very recent observation', noPhoto: 'Photo unavailable'
  },
  es: {
    eyebrow: 'EL VIGÍA · RECOMENDACIÓN PERSONAL',
    title: 'Encuentra tu playa ideal',
    subtitle: 'Una recomendación útil basada en la última observación satelital fechada disponible.',
    useLocation: 'Buscar cerca de mí', manual: 'Elegir una playa', locationBusy: 'Buscando playas cercanas…', privacy: 'La ubicación es opcional y solo se usa para ordenar las playas cercanas en esta sesión.',
    close: 'Cerrar y volver al mapa', photoCaption: 'Foto de la playa · no es una medición satelital',
    resultEyebrow: 'MEJOR OPCIÓN DISPONIBLE', recommendedTitle: 'La mejor opción disponible', selectedEyebrow: 'ESTADO DE LA PLAYA ELEGIDA', selectedTitle: 'Estado actual de esta playa',
    clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar', score: 'Puntuación de playa',
    observed: 'Observación satelital', why: 'Por qué esta playa',
    whyCopy: 'Esta playa destaca según su estado y puntuación actuales. El estado puede cambiar tras una nueva observación.',
    planB: 'Una alternativa', planBHint: 'Compara antes de salir',
    chooseTitle: 'Elige una playa de esta región', chooseLabel: 'Playa',
    choosePlaceholder: 'Seleccionar una playa…', showResult: 'Ver su estado', back: 'Volver',
    map: 'Explorar todas las playas',
    noBeachesTitle: 'No hay playas disponibles', noBeaches: 'La lista de playas de esta región no está disponible.',
    noObservationTitle: 'No hay una observación satelital fechada',
    noObservation: 'No podemos verificar la frescura de los datos para hacer una recomendación actual.',
    staleTitle: 'La observación está desactualizada',
    stale: 'La última observación tiene más de 12 horas o una fecha futura. No la presentamos como actual.',
    noRegionalTitle: 'No hay playas de esta región en los datos disponibles', noRegional: 'La fuente no contiene playas de este sitio.',
    noNearbyTitle: 'No hay playas cercanas en los datos actuales',
    noNearby: 'No se encontraron playas de esta región con coordenadas a menos de 120 km. Elige una playa manualmente.',
    noSafeTitle: 'No hay una recomendación positiva disponible',
    noSafe: 'Los estados actuales no permiten recomendar una playa limpia o moderada. Consulta el mapa y las últimas observaciones.',
    notFoundTitle: 'Playa no disponible', notFound: 'Esta playa no aparece en los datos actuales de la región.',
    selectedAvoidTitle: 'Esta playa figura como «evitar»',
    selectedAvoid: 'Has elegido esta playa, pero su estado actual no permite recomendarla. Consulta la alternativa.',
    locationDenied: 'Ubicación no disponible o permiso denegado. Puedes elegir una playa manualmente.',
    outsideRegion: 'Tu ubicación está fuera del área reconocida para este sitio. Elige una playa de la lista.',
    distance: km => 'A unos ' + km + ' km', freshnessHours: h => 'Observación hace ' + h + ' h',
    freshnessMinutes: m => 'Observación hace ' + m + ' min', source: 'Fuente satelital',
    freshnessNow: 'Observación muy reciente', noPhoto: 'Foto no disponible'
  }
}

function localeFor(lang) {
  return lang === 'es' ? 'es-MX' : lang === 'en' ? 'en-US' : 'fr-FR'
}

function formattedObservation(observationMs, lang, timezone) {
  if (!Number.isFinite(observationMs)) return null
  const options = { dateStyle: 'medium', timeStyle: 'short' }
  try {
    if (timezone) options.timeZone = timezone
    return new Intl.DateTimeFormat(localeFor(lang), options).format(new Date(observationMs))
  } catch (_) {
    return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(observationMs))
  }
}

function withinRegionBounds(position, region) {
  const geo = region && region.geoDetect
  if (geo && [geo.latMin, geo.latMax, geo.lngMin, geo.lngMax].every(Number.isFinite)) {
    return position.latitude >= geo.latMin && position.latitude <= geo.latMax &&
      position.longitude >= geo.lngMin && position.longitude <= geo.lngMax
  }
  const box = region && region.bbox
  if (Array.isArray(box) && box.length === 4) {
    const [lngMin, latMin, lngMax, latMax] = box.map(Number)
    return position.latitude >= latMin && position.latitude <= latMax &&
      position.longitude >= lngMin && position.longitude <= lngMax
  }
  return true
}

function safePhotoUrl(beachId, imageMap) {
  if (!beachId || !imageMap || typeof imageMap !== 'object') return null
  const filename = imageMap[beachId]
  if (typeof filename !== 'string' || filename.includes('..') || /[\\/]/.test(filename) ||
      !/\.(?:avif|webp|png|jpe?g)$/i.test(filename)) return null
  return '/beaches/' + encodeURIComponent(filename)
}

function ResultPhoto({ beach, photoMap, statusLabel, t }) {
  const src = safePhotoUrl(beach && beach.id, photoMap)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  return (
    <div className="sg-tp__photo-wrap">
      {src && !broken ? (
        <img className="sg-tp__photo" src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <div className="sg-tp__photo-fallback" aria-hidden="true">
          <svg viewBox="0 0 800 340" role="presentation">
            <defs>
              <linearGradient id="sg-tp-card-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#123846" />
                <stop offset=".62" stopColor="#D38A58" />
                <stop offset="1" stopColor="#F1C78D" />
              </linearGradient>
              <linearGradient id="sg-tp-card-sea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2B958F" />
                <stop offset="1" stopColor="#0A3D48" />
              </linearGradient>
            </defs>
            <rect width="800" height="340" fill="url(#sg-tp-card-sky)" />
            <circle cx="610" cy="102" r="48" fill="#FFE2A3" />
            <path d="M0 190 Q160 170 320 190 T640 185 T800 190 V340 H0Z" fill="url(#sg-tp-card-sea)" />
            <path d="M0 228 Q150 212 300 229 T600 222 T800 228" fill="none" stroke="#C1F5E7" strokeWidth="4" opacity=".7" />
            <path d="M0 264 Q130 246 260 264 T520 260 T800 263" fill="none" stroke="#C1F5E7" strokeWidth="2" opacity=".5" />
            <path d="M0 307 Q150 291 300 310 T600 300 T800 305 V340 H0Z" fill="#E6C28B" />
          </svg>
        </div>
      )}
      <div className="sg-tp__photo-overlay" />
      <div className="sg-tp__photo-bottom">
        <span className={'sg-tp__status sg-tp__status--' + (beach.status || 'moderate')}>{statusLabel}</span>
        <span className="sg-tp__photo-note">{t.photoCaption}</span>
      </div>
    </div>
  )
}

function copyForState(state, t, selectedIsAvoid = false) {
  if (state === 'recommended') return { title: t.recommendedTitle, detail: t.whyCopy }
  if (state === 'selected' && selectedIsAvoid) return { title: t.selectedAvoidTitle, detail: t.selectedAvoid }
  if (state === 'selected') return { title: t.selectedTitle, detail: t.whyCopy }
  if (state === 'no_beaches') return { title: t.noBeachesTitle, detail: t.noBeaches }
  if (state === 'no_observation') return { title: t.noObservationTitle, detail: t.noObservation }
  if (state === 'stale') return { title: t.staleTitle, detail: t.stale }
  if (state === 'no_regional_beaches') return { title: t.noRegionalTitle, detail: t.noRegional }
  if (state === 'no_nearby_beaches') return { title: t.noNearbyTitle, detail: t.noNearby }
  if (state === 'no_recommended_beach') return { title: t.noSafeTitle, detail: t.noSafe }
  return { title: t.notFoundTitle, detail: t.notFound }
}

export default function TrouvePlage({ region, beaches = [], sargData, lang = 'fr' }) {
  const t = COPY[lang] || COPY.fr
  const regionId = region && region.id
  const regionalBeaches = useMemo(
    () => (Array.isArray(beaches) ? beaches : []).filter(b => matchesRegion(b, regionId)),
    [beaches, regionId]
  )
  const [step, setStep] = useState('entry')
  const [result, setResult] = useState(null)
  const [position, setPosition] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [manualId, setManualId] = useState('')
  const [photoMap, setPhotoMap] = useState(null)

  // erddapTimestamp is the satellite observation time. updatedAt is a pipeline
  // timestamp and must not be represented as the observation itself.
  const observationAt = sargData && sargData.erddapTimestamp
  const observationMs = useMemo(() => {
    if (!observationAt) return null
    const value = typeof observationAt === 'number'
      ? (observationAt < 1e12 ? observationAt * 1000 : observationAt)
      : (/^\d+(?:\.\d+)?$/.test(String(observationAt)) ? Number(observationAt) * 1000 : Date.parse(observationAt))
    return Number.isFinite(value) ? value : null
  }, [observationAt])
  const ageHours = observationMs == null ? null : (Date.now() - observationMs) / 3600000
  const observationDate = formattedObservation(observationMs, lang, region && region.timezone)
  const freshnessLabel = ageHours == null ? null
    : ageHours < 1 ? t.freshnessMinutes(Math.max(1, Math.round(ageHours * 60)))
      : t.freshnessHours(Math.round(ageHours))
  const dataIsFresh = ageHours != null && ageHours >= 0 && ageHours <= 12

  useEffect(() => {
    let active = true
    fetch('/data/beaches-images.json', { cache: 'force-cache', credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : {})
      .then(map => { if (active) setPhotoMap(map && typeof map === 'object' && !Array.isArray(map) ? map : {}) })
      .catch(() => { if (active) setPhotoMap({}) })
    return () => { active = false }
  }, [])

  const close = () => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('recommend')
      window.location.assign(url.pathname + url.search + url.hash)
    } catch (_) {
      window.location.assign('/')
    }
  }

  const calculate = (manualSelection = '') => {
    const next = getBeachRecommendation({
      beaches: regionalBeaches,
      observationAt,
      now: Date.now(),
      regionId,
      position: manualSelection ? null : position,
      manualId: manualSelection
    })
    setResult(next)
    setStep('result')
  }

  const onUsePosition = () => {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError(t.locationDenied)
      setStep('manual')
      return
    }
    setStep('locating')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const pos = { latitude: coords.latitude, longitude: coords.longitude }
      if (!withinRegionBounds(pos, region)) {
        setGeoError(t.outsideRegion)
        setStep('manual')
        return
      }
      setPosition(pos)
      const next = getBeachRecommendation({
        beaches: regionalBeaches,
        observationAt,
        now: Date.now(),
        regionId,
        position: pos
      })
      setResult(next)
      if (next.state === 'recommended' || next.state === 'selected') setStep('result')
      else {
        setStep('manual')
        setGeoError(copyForState(next.state, t).detail)
      }
    }, () => {
      setGeoError(t.locationDenied)
      setStep('manual')
    }, { timeout: 12000, maximumAge: 300000 })
  }

  const selected = result && result.chosen
  const statusLabel = status => t[status] || status || '—'
  const resultCopy = result ? copyForState(result.state, t, result.selectedIsAvoid) : null
  const selectedHref = selected ? beachPageUrl(selected) : ''

  return (
    <section className="sg-trouve-plage" role="dialog" aria-modal="true" aria-labelledby="sg-tp-title">
      <div className="sg-tp__backdrop" />
      <div className="sg-tp__shell">
        <header className="sg-tp__topbar">
          <a className="sg-tp__brand" href="/" onClick={e => { e.preventDefault(); close() }} aria-label={t.close}>
            <span className="sg-tp__brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#FBCB61"/><circle cx="24" cy="24" r="9" fill="#0E403F"/><circle cx="27" cy="21" r="3" fill="#B9F2DF"/></svg>
            </span>
            <span>LE VEILLEUR</span>
          </a>
          <button className="sg-tp__close" type="button" onClick={close} aria-label={t.close}>×</button>
        </header>

        <main className="sg-tp__content">
          <div className="sg-tp__hero">
            <div className="sg-tp__hero-art" aria-hidden="true">
              <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="sg-tp-hero-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#102D3A"/><stop offset=".58" stopColor="#D38B57"/><stop offset="1" stopColor="#F0C58B"/>
                  </linearGradient>
                  <linearGradient id="sg-tp-hero-sea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2C938D"/><stop offset="1" stopColor="#092C39"/>
                  </linearGradient>
                </defs>
                <rect width="800" height="360" fill="url(#sg-tp-hero-sky)"/>
                <circle cx="610" cy="92" r="58" fill="#FFE5AD"/>
                <path d="M0 190 Q120 164 240 190 T480 190 T800 190 V360 H0Z" fill="url(#sg-tp-hero-sea)"/>
                <path className="sg-tp__wave sg-tp__wave--one" d="M0 220 Q120 202 240 220 T480 220 T800 220" fill="none" stroke="#B8F4E7" strokeWidth="4" opacity=".85"/>
                <path className="sg-tp__wave sg-tp__wave--two" d="M0 260 Q110 245 220 260 T440 260 T660 260 T800 260" fill="none" stroke="#B8F4E7" strokeWidth="2.5" opacity=".58"/>
                <path d="M0 310 Q160 286 320 310 T640 310 T800 306 V360 H0Z" fill="#EBCB98"/>
              </svg>
            </div>
            <div className="sg-tp__hero-copy">
              <span className="sg-tp__eyebrow">{t.eyebrow}{region && region.name ? ' · ' + region.name : ''}</span>
              <h1 id="sg-tp-title">{t.title}</h1>
              <p>{t.subtitle}</p>
              <div className="sg-tp__trust-line">
                <span className={'sg-tp__fresh-dot' + (dataIsFresh ? ' is-fresh' : '')} />
                <span>{observationDate ? t.observed + ' · ' + observationDate : t.noObservationTitle}</span>
              </div>
            </div>
          </div>

          {!dataIsFresh && <p className="sg-tp__notice sg-tp__freshness-warning" role="status">{observationMs == null ? t.noObservation : t.stale}</p>}

          {step === 'entry' && (
            <section className="sg-tp__panel">
              <p className="sg-tp__panel-title">{t.chooseTitle}</p>
              <div className="sg-tp__actions">
                <button type="button" className="sg-tp__button sg-tp__button--primary" onClick={onUsePosition}>
                  <span aria-hidden="true">⌖</span>{t.useLocation}
                </button>
                <button type="button" className="sg-tp__button sg-tp__button--secondary" onClick={() => setStep('manual')}>{t.manual}</button>
              </div>
              <p className="sg-tp__privacy">{t.privacy}</p>
            </section>
          )}

          {step === 'locating' && (
            <section className="sg-tp__panel" role="status" aria-live="polite">
              <span className="sg-tp__spinner" aria-hidden="true" />
              <p>{t.locationBusy}</p>
            </section>
          )}

          {step === 'manual' && (
            <form className="sg-tp__panel sg-tp__form" onSubmit={e => { e.preventDefault(); calculate(manualId) }}>
              <h2>{t.chooseTitle}</h2>
              <label htmlFor="sg-tp-beach">{t.chooseLabel}</label>
              <select id="sg-tp-beach" value={manualId} onChange={e => setManualId(e.target.value)} required>
                <option value="">{t.choosePlaceholder}</option>
                {regionalBeaches.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), localeFor(lang))).map(b =>
                  <option key={b.id} value={b.id}>{b.name}</option>
                )}
              </select>
              {geoError && <p className="sg-tp__notice" role="status">{geoError}</p>}
              <div className="sg-tp__actions">
                <button type="submit" className="sg-tp__button sg-tp__button--primary">{t.showResult}</button>
                <button type="button" className="sg-tp__button sg-tp__button--secondary" onClick={() => setStep('entry')}>{t.back}</button>
              </div>
            </form>
          )}

          {step === 'result' && result && (
            <section className="sg-tp__result-area" aria-live="polite">
              {!selected ? (
                <div className="sg-tp__empty">
                  <span className="sg-tp__empty-icon" aria-hidden="true">≈</span>
                  <h2>{resultCopy.title}</h2>
                  <p>{resultCopy.detail}</p>
                  <div className="sg-tp__actions">
                    <button type="button" className="sg-tp__button sg-tp__button--primary" onClick={() => setStep('manual')}>{t.manual}</button>
                    <button type="button" className="sg-tp__button sg-tp__button--secondary" onClick={close}>{t.map}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sg-tp__result-heading">
                    <span className="sg-tp__eyebrow">{result.state === 'selected' ? t.selectedEyebrow : t.resultEyebrow}</span>
                    <h2>{resultCopy.title}</h2>
                    <p>{resultCopy.detail}</p>
                  </div>
                  <article className="sg-tp__beach-card">
                    <ResultPhoto beach={selected} photoMap={photoMap} statusLabel={statusLabel(selected.status)} t={t}/>
                    <div className="sg-tp__beach-info">
                      <div className="sg-tp__beach-name-line">
                        <div>
                          <h3>{selected.name}</h3>
                          {selected.commune && <p className="sg-tp__commune">{selected.commune}</p>}
                        </div>
                        {selected.score != null && Number.isFinite(Number(selected.score)) &&
                          <div className="sg-tp__score"><strong>{Math.round(Number(selected.score))}</strong><span>/100</span><small>{t.score}</small></div>}
                      </div>
                      <p className="sg-tp__observation"><span className={'sg-tp__fresh-dot' + (dataIsFresh ? ' is-fresh' : '')}/>{t.observed}: {observationDate || t.noObservationTitle}{freshnessLabel ? ' · ' + freshnessLabel : ''}</p>
                      <div className="sg-tp__why">
                        <span className="sg-tp__why-mark" aria-hidden="true">✓</span>
                        <div><strong>{t.why}</strong><p>{resultCopy.detail}</p></div>
                      </div>
                      {result.selectedIsAvoid && <p className="sg-tp__warning" role="alert">{t.selectedAvoid}</p>}
                      <div className="sg-tp__actions">
                        {selectedHref && <a className="sg-tp__button sg-tp__button--primary" href={selectedHref}>{lang === 'es' ? 'Ver ficha completa' : lang === 'en' ? 'Open beach details' : 'Voir la fiche complète'} <span aria-hidden="true">↗</span></a>}
                        <button type="button" className="sg-tp__button sg-tp__button--secondary" onClick={() => setStep('manual')}>{t.manual}</button>
                      </div>
                    </div>
                  </article>

                  {result.alt && (
                    <button type="button" className="sg-tp__planb" onClick={() => calculate(result.alt.id)}>
                      <span className="sg-tp__planb-photo"><ResultPhoto beach={result.alt} photoMap={photoMap} statusLabel={statusLabel(result.alt.status)} t={t}/></span>
                      <span className="sg-tp__planb-copy"><small>{t.planB}</small><strong>{result.alt.name}</strong><span>{statusLabel(result.alt.status)}{result.alt.score != null ? ' · ' + Math.round(Number(result.alt.score)) + '/100' : ''}</span><em>{t.planBHint} →</em></span>
                    </button>
                  )}
                  <div className="sg-tp__bottom-links">
                    <button type="button" onClick={() => setStep('manual')}>{t.back}</button>
                    <button type="button" onClick={close}>{t.map} →</button>
                  </div>
                </>
              )}
            </section>
          )}
        </main>
        <footer className="sg-tp__footer">
          <span>{t.source}: Copernicus Marine</span>
          <span>{observationDate || t.noObservationTitle}</span>
        </footer>
      </div>
    </section>
  )
}
