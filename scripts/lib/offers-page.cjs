'use strict'

const { B2C, PRO, offerLang, currencyOf } = require('./commercial-catalog.cjs')
const { STRIPE_LIVE_LINKS } = require('./stripe-live-links.cjs')
const { formatObservation } = require('./home-first.cjs')

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function affiliateHtml(lang) {
  if (process.env.AFFILIATE_ENABLED !== '1') return ''
  let slots = []
  try {
    slots = require('../../public/affiliate-slots.json').slots || []
  } catch (_) {
    slots = []
  }
  const live = slots.filter((s) => s && typeof s.url === 'string' && /^https:\/\//.test(s.url) && s.label)
  if (!live.length) return ''
  const title = lang === 'es' ? 'Actividades' : lang === 'en' ? 'Activities' : 'Activités'
  const items = live.map((s) => `<li><a href="${escapeHtml(s.url)}" rel="sponsored noopener">${escapeHtml(s.label)}</a></li>`).join('')
  return `<section><h2>${title}</h2><ul>${items}</ul></section>`
}

function buildOffersPage(region, iso) {
  const lang = offerLang(region)
  const cur = currencyOf(region)
  const name = region.name || region.id
  const domain = region.domain || 'sargasses-martinique.com'
  const passes = B2C[cur]
  const pro = PRO[cur]
  const obs = escapeHtml(formatObservation(iso, lang))
  const support = (region.emails && region.emails.support) || `support@${domain}`
  const copy = lang === 'es' ? {
    title: `Ofertas de sargazo — ${name}`,
    desc: `Qué es gratis y qué es de pago en ${name}. Pases de un solo pago y Pro para hoteles, con la hora de la observación satelital.`,
    h1: `Ofertas para ${name}`,
    freeH: 'Gratis',
    freeP: 'El mapa y el veredicto del día, cuando la observación satelital es válida. Si la observación es antigua, el veredicto se suspende: no se inventa ningún estado.',
    paidH: 'De pago — viajeros',
    paidP: 'Un pase es un pago único, sin renovación. Abre el pronóstico de los días siguientes y las alertas en las playas cubiertas de esta región.',
    proH: 'Hoteles, alquileres, clubs de playa',
    proP: `El widget es gratuito. El ensayo Pro dura 30 días, sin tarjeta. Después: ${pro.month}/mes o ${pro.year} por 12 meses, en un solo pago. No hay un tercer precio «litoral».`,
    cta: 'Empezar el ensayo Pro de 30 días',
    formH: 'Pedir el ensayo',
    hotel: 'Nombre del hotel o de la actividad',
    email: 'Email',
    beach: 'Playa (opcional)',
    send: 'Enviar la solicitud',
    legal: 'La solicitud solo se confirma si el servidor la registra. Sin llamada.',
  } : lang === 'en' ? {
    title: `Sargassum offers — ${name}`,
    desc: `What is free and what is paid in ${name}. One-time passes and Pro for hotels, with the satellite observation time.`,
    h1: `Offers for ${name}`,
    freeH: 'Free',
    freeP: 'The map and today\'s verdict, when the satellite observation is valid. If the observation is old, the verdict is paused: no status is invented.',
    paidH: 'Paid — travelers',
    paidP: 'A pass is a one-time payment, with no renewal. It opens the forecast for the following days and alerts for the beaches covered in this region.',
    proH: 'Hotels, rentals, beach clubs',
    proP: `The widget is free. The Pro trial is 30 days, no card. Then: ${pro.month}/month or ${pro.year} for 12 months, paid once. There is no third "coastline" price.`,
    cta: 'Start the 30-day Pro trial',
    formH: 'Request the trial',
    hotel: 'Hotel or activity name',
    email: 'Email',
    beach: 'Beach (optional)',
    send: 'Send the request',
    legal: 'The request is confirmed only after the server stores it. No call.',
  } : {
    title: `Offres sargasses — ${name}`,
    desc: `Ce qui est gratuit et ce qui est payant à ${name}. Pass à paiement unique et Pro pour les hôtels, avec l'heure de l'observation satellite.`,
    h1: `Offres pour ${name}`,
    freeH: 'Gratuit',
    freeP: 'La carte et le verdict du jour, quand l\'observation satellite est valide. Si l\'observation est ancienne, le verdict est suspendu : aucun état n\'est inventé.',
    paidH: 'Payant — voyageurs',
    paidP: 'Un pass est un paiement unique, sans reconduction. Il ouvre la prévision des jours suivants et les alertes sur les plages couvertes de cette région.',
    proH: 'Hôtels, locations, clubs de plage',
    proP: `Le widget est gratuit. L'essai Pro dure 30 jours, sans carte. Ensuite : ${pro.month}/mois ou ${pro.year} pour 12 mois, en un paiement. Il n'y a pas de troisième prix « littoral ».`,
    cta: 'Démarrer l\'essai Pro 30 jours',
    formH: 'Demander l\'essai',
    hotel: 'Nom de l\'hôtel ou de l\'activité',
    email: 'Email',
    beach: 'Plage (facultatif)',
    send: 'Envoyer la demande',
    legal: 'La demande n\'est confirmée que si le serveur l\'enregistre. Aucun appel.',
  }
  const choose = lang === 'es' ? 'Elegir este pase' : lang === 'en' ? 'Choose this pass' : 'Choisir ce pass'
  const cards = passes.map((o) => {
    const days = lang === 'es' ? `${o.days} días` : lang === 'en' ? `${o.days} days` : `${o.days} jours`
    const href = STRIPE_LIVE_LINKS[`${o.pass}_${cur}`].url
    return `<article><h3>${escapeHtml(o.price)}</h3><p>${days}</p><a href="${escapeHtml(href)}">${escapeHtml(choose)}</a></article>`
  }).join('')
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<meta name="description" content="${escapeHtml(copy.desc)}">
<link rel="canonical" href="https://${escapeHtml(domain)}/offres/">
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f6f1e6;color:#1a1408}
main{max-width:720px;margin:0 auto;padding:28px 18px 64px}
h1{font-size:clamp(28px,6vw,40px);line-height:1.05;margin:0 0 12px}
a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 16px;border-radius:12px;background:#1a1408;color:#FFC72C;font-weight:800;text-decoration:none}
.grid{display:grid;gap:12px}
article{background:#fff;border:2px solid #1a1408;border-radius:14px;padding:14px}
input,button{font:inherit}
label{display:block;font-weight:700;margin:10px 0 4px}
input{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border:2px solid #1a1408;border-radius:10px}
button{min-height:48px;margin-top:12px;width:100%;border:0;border-radius:12px;background:#FFC72C;font-weight:800;cursor:pointer}
.obs{font-weight:700}
</style>
</head>
<body>
<main>
<p class="obs">${obs}</p>
<h1>${escapeHtml(copy.h1)}</h1>
<h2>${escapeHtml(copy.freeH)}</h2>
<p>${escapeHtml(copy.freeP)}</p>
<h2>${escapeHtml(copy.paidH)}</h2>
<p>${escapeHtml(copy.paidP)}</p>
<div class="grid">${cards}</div>
<section id="pro">
<h2>${escapeHtml(copy.proH)}</h2>
<p>${escapeHtml(copy.proP)}</p>
<p><a class="btn" href="${escapeHtml(STRIPE_LIVE_LINKS[cur === 'usd' ? 'pro_monthly_usd' : 'pro_monthly_eur'].url)}">${escapeHtml(copy.cta)}</a></p>
<p><a href="${escapeHtml(STRIPE_LIVE_LINKS[cur === 'usd' ? 'pro_annual_usd' : 'pro_annual_eur'].url)}">${escapeHtml(pro.year)}</a> · <a href="/pro/espace/">${lang === 'es' ? 'O empezar sin tarjeta' : lang === 'en' ? 'Or start without a card' : 'Ou commencer sans carte'}</a></p>
<h3>${escapeHtml(copy.formH)}</h3>
<form data-sg-lead data-region="${escapeHtml(region.id || 'mq')}" data-lang="${lang}">
<label>${escapeHtml(copy.hotel)}<input name="organization" required maxlength="120"></label>
<label>${escapeHtml(copy.email)}<input name="email" type="email" required></label>
<label>${escapeHtml(copy.beach)}<input name="beach" maxlength="80"></label>
<button type="submit">${escapeHtml(copy.send)}</button>
</form>
<p>${escapeHtml(copy.legal)} <a href="mailto:${escapeHtml(support)}">${escapeHtml(support)}</a></p>
</section>
${affiliateHtml(lang)}
<p><a href="/cgv.html">CGV</a> · <a href="/">Carte</a></p>
</main>
<script src="/b2b-capture.js"></script>
<script src="/b2b-lead-form.js"></script>
</body>
</html>`
}

module.exports = { buildOffersPage }
