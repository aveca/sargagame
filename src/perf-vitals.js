// RUM Core Web Vitals → GA4. Chargé en IDLE depuis main.jsx (hors chemin critique,
// chunk lazy). Couvre TOUS les domaines via le bundle partagé (MQ/GP/Floride/Punta
// Cana/Cancún). Donne ce que CrUX ne donne pas : LCP/INP/CLS RÉELS segmentés par
// région + type de connexion, et corrélables au funnel (même dataLayer/gtag que les
// events de conversion). Aucune dépendance au build (région dérivée du hostname).

import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals'

// Région dérivée du hostname → robuste sur les 5 domaines, sans wiring build.
function region() {
  const h = (typeof location !== 'undefined' ? location.hostname : '') || ''
  if (h.includes('guadeloupe')) return 'gp'
  if (h.includes('martinique')) return 'mq'
  if (h.includes('puntacana')) return 'puntacana'
  if (h.includes('cancun')) return 'cancun'
  if (h.includes('miami') || h.includes('florida')) return 'florida'
  return 'other'
}

function report(metric) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
    const conn = navigator.connection || {}
    // CLS est sans unité (0–1) → ×1000 pour rester un entier exploitable dans GA4.
    const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value)
    window.gtag('event', 'web_vitals', {
      metric_name: metric.name, // LCP | INP | CLS | FCP | TTFB
      metric_value: value,
      metric_rating: metric.rating, // good | needs-improvement | poor
      metric_id: metric.id, // dédup côté GA4
      sg_region: region(),
      effective_type: conn.effectiveType || 'unknown', // 4g | 3g | 2g | slow-2g
      page_path: location.pathname,
      non_interaction: true, // n'affecte pas le taux de rebond
    })
  } catch (e) {
    /* le RUM ne doit JAMAIS casser l'app */
  }
}

// reportAllChanges:false (défaut) → 1 valeur finale par métrique (LCP au paint final,
// CLS au unload/hidden, INP à la pire interaction). Suffisant et léger pour un p75 agrégé.
export function initVitals() {
  try {
    onLCP(report)
    onINP(report)
    onCLS(report)
    onFCP(report)
    onTTFB(report)
  } catch (e) {
    /* noop */
  }
}
