'use strict'

const fs = require('fs')
const path = require('path')
const { B2C, PRO, offerLang, currencyOf } = require('./commercial-catalog.cjs')

function readObservationIso(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/api/copernicus/sargassum.json'), 'utf8'))
    const iso = raw && raw.erddapTimestamp
    const t = Date.parse(String(iso || ''))
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  } catch (_) {
    return null
  }
}

function formatObservation(iso, lang) {
  if (!iso) {
    return lang === 'es'
      ? 'Hora de la última observación satelital: no disponible en este build (ninguna fecha inventada).'
      : lang === 'en'
        ? 'Latest satellite observation time: unavailable in this build (no date invented).'
        : 'Heure de la dernière observation satellite : indisponible dans ce build (aucune date inventée).'
  }
  const when = new Intl.DateTimeFormat(lang === 'es' ? 'es' : lang === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC',
  }).format(new Date(iso))
  return lang === 'es'
    ? `Última observación satelital: ${when} UTC.`
    : lang === 'en'
      ? `Latest satellite observation: ${when} UTC.`
      : `Dernière observation satellite : ${when} UTC.`
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function firstPaintInner(region, iso) {
  const lang = offerLang(region || { id: 'mq' })
  const cur = currencyOf(region || { currency: 'EUR' })
  const name = (region && region.name) || 'Martinique'
  const pro = PRO[cur]
  const stay = B2C[cur].find((o) => o.pass === 'p30')
  const obs = escapeHtml(formatObservation(iso, lang))
  const place = escapeHtml(name)
  if (lang === 'es') {
    return `<p style="margin:0 0 8px;font:800 13px/1.3 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#FFC72C">Hoteles y clubs de playa</p>
<h1 style="margin:0 0 8px;font:800 26px/1.05 system-ui,sans-serif;color:#f4efe4">El estado de cada playa de ${place}, con la hora del satélite.</h1>
<p style="margin:0 0 12px;font:600 15px/1.45 system-ui,sans-serif;color:#f4efe4">${obs} El veredicto del día es gratis cuando la observación es válida. El pronóstico de los días siguientes es un pase de pago único (${escapeHtml(stay.price)} / 30 días).</p>
<p style="margin:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
<a href="/offres/#pro" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;background:#FFC72C;color:#1a1408;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Pro ${escapeHtml(pro.month)}/mes o ${escapeHtml(pro.year)}/año</a>
<a href="/?paywall=1&amp;pass=p30" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;border:2px solid #FFC72C;color:#FFC72C;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Pase viajero ${escapeHtml(stay.price)}</a>
</p>`
  }
  if (lang === 'en') {
    return `<p style="margin:0 0 8px;font:800 13px/1.3 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#FFC72C">Hotels and beach clubs</p>
<h1 style="margin:0 0 8px;font:800 26px/1.05 system-ui,sans-serif;color:#f4efe4">Every ${place} beach, with the satellite time on it.</h1>
<p style="margin:0 0 12px;font:600 15px/1.45 system-ui,sans-serif;color:#f4efe4">${obs} Today's verdict is free when the observation is valid. Later days are a one-time pass (${escapeHtml(stay.price)} / 30 days).</p>
<p style="margin:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
<a href="/offres/#pro" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;background:#FFC72C;color:#1a1408;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Pro ${escapeHtml(pro.month)}/mo or ${escapeHtml(pro.year)}/yr</a>
<a href="/?paywall=1&amp;pass=p30" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;border:2px solid #FFC72C;color:#FFC72C;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Traveler pass ${escapeHtml(stay.price)}</a>
</p>`
  }
  return `<p style="margin:0 0 8px;font:800 13px/1.3 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#FFC72C">Hôtels et clubs de plage</p>
<h1 style="margin:0 0 8px;font:800 26px/1.05 system-ui,sans-serif;color:#f4efe4">L'état de chaque plage de ${place}, avec l'heure du satellite.</h1>
<p style="margin:0 0 12px;font:600 15px/1.45 system-ui,sans-serif;color:#f4efe4">${obs} Le verdict du jour est gratuit quand l'observation est valide. Les jours suivants sont un pass à paiement unique (${escapeHtml(stay.price)} / 30 jours).</p>
<p style="margin:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
<a href="/offres/#pro" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;background:#FFC72C;color:#1a1408;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Pro ${escapeHtml(pro.month)}/mois ou ${escapeHtml(pro.year)}/an</a>
<a href="/?paywall=1&amp;pass=p30" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border-radius:12px;border:2px solid #FFC72C;color:#FFC72C;font:800 15px/1 system-ui,sans-serif;text-decoration:none">Pass voyageur ${escapeHtml(stay.price)}</a>
</p>`
}

function injectFirstPaint(html, region, iso) {
  const inner = firstPaintInner(region, iso)
  const boot = `<div id="sg-first" style="position:fixed;inset:0;z-index:2;overflow:auto;background:#14110e;padding:28px 16px 24px;text-align:center">${inner}</div>`
  let out = String(html)
  if (out.includes('id="sg-first"')) {
    out = out.replace(/<div id="sg-first"[\s\S]*?<\/div>\s*(?=<div id="sg-boot")/, boot + '\n      ')
  } else {
    out = out.replace('<div id="sg-boot"', boot + '\n      <div id="sg-boot"')
  }
  return out
}

module.exports = { readObservationIso, formatObservation, firstPaintInner, injectFirstPaint }
