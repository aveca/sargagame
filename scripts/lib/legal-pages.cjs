/**
 * legal-pages.cjs — Générateur des pages légales/société des NOUVELLES régions
 * (USD : florida, puntacana, rivieramaya, barbados). MQ/GP gardent leurs pages
 * statiques FR (public/cgv.html, etc.) — ce module ne les touche JAMAIS.
 *
 * Pourquoi un générateur (et pas du statique par langue) : 4 régions × jusqu'à
 * 2 langues × 3 pages = jusqu'à 24 variantes qui partagent ~95 % du texte et ne
 * diffèrent que par {domaine, devise, pays, e-mail support, prix, slug}. On clone
 * le patron de reliability-page.cjs : slugs localisés à la racine + hreflang
 * cluster + ajout au sitemap régional. Mêmes langues émises que le reste du site
 * (region-langs.cjs:emittedLangs) → jamais de page ES orpheline.
 *
 * Paiement : formulation NEUTRE (« prestataire de paiement agréé / Marchand de
 * Référence »), sans nommer de PSP — aucun prestataire n'est encore actif/validé
 * (décision user 2026-06-24). Opérateur nommé partout : 97TECH (SAS, RCS Paris).
 *
 * Pages générées (slug racine, cross-liées par hreflang) :
 *   EN : /terms/   /privacy/     /refund/
 *   ES : /terminos/ /privacidad/ /reembolso/
 *
 * Branché dans vite.config.js (closeBundle, bloc IS_NEW_REGION) APRÈS
 * generateReliabilityPages (qui écrit/complète le sitemap.xml régional).
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const { emittedLangs, normLang } = require('./region-langs.cjs')

// ── Identité opérateur (97TECH) — constante, neutre, dans toutes les langues ──
const OP = {
  name: '97TECH',
  rcs: 'RCS Paris 882 370 703',
  siret: 'SIRET 882 370 703 00010',
  address: '30-32 boulevard de Sébastopol, 75004 Paris, France',
}

// Slug localisé par page (à la racine, comme reliability/fiabilidad).
const SLUGS = {
  terms: { en: 'terms', es: 'terminos' },
  privacy: { en: 'privacy', es: 'privacidad' },
  refund: { en: 'refund', es: 'reembolso' },
}

// Libellés d'UI (chrome : header, footer, nav) par langue.
const UI = {
  en: {
    back: 'Back to the map', live: 'Live map', reliability: 'Reliability',
    terms: 'Terms', privacy: 'Privacy', refund: 'Refund',
    operatedBy: 'Operated by', updated: 'Last updated', sitePrefix: 'Sargassum',
    indicative: 'Information provided for guidance only.',
  },
  es: {
    back: 'Volver al mapa', live: 'Mapa en vivo', reliability: 'Fiabilidad',
    terms: 'Términos', privacy: 'Privacidad', refund: 'Reembolso',
    operatedBy: 'Operado por', updated: 'Última actualización', sitePrefix: 'Sargazo',
    indicative: 'Información proporcionada a título indicativo.',
  },
}

const RELIABILITY_SLUG = { en: 'reliability', es: 'fiabilidad' }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Formulation paiement neutre (sans nommer de PSP) ─────────────────────────
function paymentClause(lang) {
  return lang === 'es'
    ? `El pago se procesa de forma segura a través de nuestro <strong>proveedor de pago autorizado</strong>, que actúa como <strong>Comerciante de Registro (Merchant of Record)</strong> / revendedor del Servicio. Dicho proveedor gestiona la transacción, el cobro, la facturación y la recaudación de impuestos; sus condiciones de compra también se aplican al pago. Nunca recibimos ni almacenamos los datos completos de tu tarjeta. El proveedor de pago se indica en el momento de la compra.`
    : `Payment is processed securely through our <strong>authorized payment provider</strong>, acting as <strong>Merchant of Record</strong> / reseller of the Service. That provider handles the transaction, billing, invoicing and tax collection; its buyer terms also apply to the payment. We never receive or store your full card details. The payment provider is shown at checkout.`
}

function operatorBlock(lang) {
  const opd = lang === 'es'
    ? `<strong>${OP.name}</strong> — sociedad por acciones simplificada (SAS) de derecho francés<br/>Domicilio social: ${esc(OP.address)}<br/>${esc(OP.rcs)} · ${esc(OP.siret)}`
    : `<strong>${OP.name}</strong> — a French simplified joint-stock company (SAS)<br/>Registered office: ${esc(OP.address)}<br/>${esc(OP.rcs)} · ${esc(OP.siret)}`
  return `<div class="card"><p style="margin:0">${opd}</p></div>`
}

// ── Contenu : Terms / Términos ───────────────────────────────────────────────
function termsContent(lang, region) {
  const site = `${UI[lang].sitePrefix} ${region.name}`
  const p = region.pricing || {}
  const support = (region.emails && region.emails.support) || `support@${region.domain}`
  const cur = region.currency || 'USD'
  if (lang === 'es') {
    return {
      title: 'Términos del servicio',
      lead: `Estos términos rigen el acceso a las ofertas de pago de <strong>${esc(site)}</strong> (${esc(region.domain)}) — el «Servicio». Al suscribirte aceptas plenamente estos términos.`,
      sections: [
        { h: '1. Operador', html: operatorBlock(lang) + `<p>El Servicio es operado por ${OP.name}. La venta se realiza a través de un proveedor de pago autorizado que actúa como Comerciante de Registro (ver art. 4).</p>` },
        { h: '2. El Servicio', html: `<p>El Servicio ofrece el seguimiento del estado del sargazo en las playas de ${esc(region.name)} a partir de datos satelitales (Copernicus, NOAA): mapa en vivo, score 0-100 por playa, pronóstico a 7 días y alertas. La información es indicativa y previsional; no constituye una garantía de exactitud absoluta (ver art. 8 y nuestra <a href="/${RELIABILITY_SLUG.es}/">fiabilidad medida</a>).</p>` },
        { h: '3. Ofertas y precios', html: `<p>Las ofertas y precios vigentes se presentan en la aplicación. El <strong>Pase de Sargazo</strong> es una compra única, sin suscripción: acceso completo de 7 días, 30 días o temporada, según la opción elegida. Cada Pase es un pago único, sin renovación automática.</p><p>Los precios se indican en ${esc(cur)}, impuestos incluidos cuando correspondan; los impuestos aplicables los calcula y recauda nuestro proveedor de pago según tu lugar de residencia.</p>` },
        { h: '4. Pago', html: `<p>${paymentClause(lang)}</p>` },
        { h: '5. Compra única, sin renovación', html: `<p>El <strong>Pase</strong> es una compra única: <strong>no se renueva automáticamente</strong> y no genera ninguna suscripción. Al expirar, el acceso termina; puedes comprar otro Pase si lo deseas. No hay ningún cobro recurrente.</p>` },
        { h: '6. Sin compromiso', html: `<p>Como el Pase es de pago único, <strong>no hay ninguna suscripción que cancelar</strong> ni renovación que detener. Si dispones de una suscripción heredada (clientes anteriores a junio de 2026), puedes gestionarla escribiéndonos a <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
        { h: '7. Reembolso', html: `<p>Nuestra garantía de satisfacción se detalla en la página <a href="/${SLUGS.refund.es}/">Política de reembolso</a>.</p>` },
        { h: '8. Responsabilidad', html: `<p>El Servicio se basa en datos satelitales y modelos de pronóstico: pese a nuestros controles diarios, el estado real de una playa puede diferir del pronóstico. El Servicio se ofrece «tal cual»; el operador no se hace responsable de un desplazamiento, un baño o una decisión tomada únicamente sobre la base de la información proporcionada.</p>` },
        { h: '9. Datos personales', html: `<p>El tratamiento de tus datos se describe en nuestra <a href="/${SLUGS.privacy.es}/">Política de privacidad</a>.</p>` },
        { h: '10. Ley aplicable', html: `<p>Estos términos se rigen por el derecho francés (jurisdicción del operador), sin perjuicio de los derechos imperativos de protección al consumidor de tu país de residencia (${esc(region.country || '')}). Para cualquier reclamación: <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
      ],
    }
  }
  return {
    title: 'Terms of Service',
    lead: `These terms govern access to the paid offers of <strong>${esc(site)}</strong> (${esc(region.domain)}) — the “Service”. By subscribing you fully accept these terms.`,
    sections: [
      { h: '1. Operator', html: operatorBlock(lang) + `<p>The Service is operated by ${OP.name}. The sale is carried out through an authorized payment provider acting as Merchant of Record (see art. 4).</p>` },
      { h: '2. The Service', html: `<p>The Service provides sargassum tracking on the beaches of ${esc(region.name)} from satellite data (Copernicus, NOAA): live map, 0-100 score per beach, 7-day forecast and alerts. The information is indicative and forecast-based; it is not a guarantee of absolute accuracy (see art. 8 and our <a href="/${RELIABILITY_SLUG.en}/">measured reliability</a>).</p>` },
      { h: '3. Offers and prices', html: `<p>Current offers and prices are shown in the app. The <strong>Sargassum Pass</strong> is a one-time purchase, with no subscription: full access for 7 days, 30 days or the season, depending on the option chosen. Each Pass is a single payment, with no automatic renewal.</p><p>Prices are shown in ${esc(cur)}, including applicable taxes where due; applicable taxes are calculated and collected by our payment provider based on your place of residence.</p>` },
      { h: '4. Payment', html: `<p>${paymentClause(lang)}</p>` },
      { h: '5. One-time purchase, no renewal', html: `<p>The <strong>Pass</strong> is a one-time purchase: it <strong>does not renew automatically</strong> and creates no subscription. When it expires, access ends; you may buy another Pass if you wish. There is no recurring charge.</p>` },
      { h: '6. No commitment', html: `<p>Since the Pass is a one-time payment, <strong>there is no subscription to cancel</strong> and no renewal to stop. If you hold a legacy subscription (customers from before June 2026), you can manage it by writing to <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
      { h: '7. Refund', html: `<p>Our satisfaction guarantee is detailed on the <a href="/${SLUGS.refund.en}/">Refund Policy</a> page.</p>` },
      { h: '8. Liability', html: `<p>The Service relies on satellite data and forecast models: despite our daily checks, a beach’s actual state may differ from the forecast. The Service is provided “as is”; the operator cannot be held liable for a trip, a swim or any decision made solely on the basis of the information provided.</p>` },
      { h: '9. Personal data', html: `<p>The processing of your data is described in our <a href="/${SLUGS.privacy.en}/">Privacy Policy</a>.</p>` },
      { h: '10. Governing law', html: `<p>These terms are governed by French law (the operator’s jurisdiction), without prejudice to the mandatory consumer-protection rights of your country of residence (${esc(region.country || '')}). For any claim: <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
    ],
  }
}

// ── Contenu : Privacy / Privacidad ───────────────────────────────────────────
function privacyContent(lang, region) {
  const site = `${UI[lang].sitePrefix} ${region.name}`
  const support = (region.emails && region.emails.support) || `support@${region.domain}`
  if (lang === 'es') {
    return {
      title: 'Política de privacidad',
      lead: `Esta página describe cómo <strong>${esc(site)}</strong> (${esc(region.domain)}) trata tus datos cuando usas la aplicación o las páginas web.`,
      sections: [
        { h: 'Responsable del tratamiento', html: operatorBlock(lang) + `<p>Contacto: <a href="mailto:${esc(support)}">${esc(support)}</a></p>` },
        { h: 'Datos recopilados', html: `<p>La aplicación funciona sin cuenta de usuario. Pueden almacenarse localmente en tu dispositivo (navegador):</p><ul><li><strong>Preferencias</strong>: tema (claro/oscuro), playas favoritas, idioma.</li><li><strong>Progreso</strong>: puntos, estadísticas de consulta — solo en tu dispositivo.</li><li><strong>Ubicación</strong>: si activas la geolocalización, se usa únicamente para ordenar las playas por distancia; no se envía a nuestros servidores.</li><li><strong>Correo electrónico</strong>: solo si te suscribes a las alertas, para enviarte el aviso del estado de tus playas.</li></ul>` },
        { h: 'Cookies y almacenamiento local', html: `<p>El sitio usa el <strong>almacenamiento local del navegador</strong> (localStorage) para recordar tus ajustes y favoritos. No depositamos cookies publicitarias. Las cookies de terceros (mapas, clima, analítica) pueden aparecer al usar esos servicios.</p>` },
        { h: 'Datos técnicos y analítica', html: `<p>El alojamiento y las herramientas de medición (p. ej. Google Analytics) pueden registrar datos técnicos (dirección IP, navegador, páginas vistas) para asegurar el funcionamiento y la seguridad del sitio.</p>` },
        { h: 'Datos de pago', html: `<p>Los pagos los gestiona nuestro proveedor de pago autorizado (Comerciante de Registro). <strong>Nunca recibimos ni almacenamos los datos completos de tu tarjeta.</strong></p>` },
        { h: 'No vendemos tus datos', html: `<p>No vendemos ni alquilamos tus datos personales. No se exige ningún dato personal para usar el servicio gratuito.</p>` },
        { h: 'Tus derechos', html: `<p>Puedes borrar en cualquier momento los datos almacenados localmente vaciando el almacenamiento del sitio en tu navegador. Para ejercer tus derechos (acceso, rectificación, supresión, oposición), escríbenos a <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
        { h: 'Conservación', html: `<p>Los datos de suscripción a las alertas se conservan mientras la suscripción esté activa y se eliminan a petición. Cada correo incluye un enlace de baja.</p>` },
      ],
    }
  }
  return {
    title: 'Privacy Policy',
    lead: `This page describes how <strong>${esc(site)}</strong> (${esc(region.domain)}) handles your data when you use the app or the web pages.`,
    sections: [
      { h: 'Data controller', html: operatorBlock(lang) + `<p>Contact: <a href="mailto:${esc(support)}">${esc(support)}</a></p>` },
      { h: 'Data collected', html: `<p>The app works without a user account. The following may be stored locally on your device (browser):</p><ul><li><strong>Preferences</strong>: theme (light/dark), favorite beaches, language.</li><li><strong>Progress</strong>: points, viewing stats — on your device only.</li><li><strong>Location</strong>: if you enable geolocation, it is used only to sort beaches by distance; it is not sent to our servers.</li><li><strong>Email</strong>: only if you subscribe to alerts, so we can send you the status of your beaches.</li></ul>` },
      { h: 'Cookies and local storage', html: `<p>The site uses the <strong>browser’s local storage</strong> (localStorage) to remember your settings and favorites. We do not set advertising cookies. Third-party cookies (maps, weather, analytics) may appear when you use those services.</p>` },
      { h: 'Technical data and analytics', html: `<p>Hosting and measurement tools (e.g. Google Analytics) may record technical data (IP address, browser, pages viewed) to ensure the operation and security of the site.</p>` },
      { h: 'Payment data', html: `<p>Payments are handled by our authorized payment provider (Merchant of Record). <strong>We never receive or store your full card details.</strong></p>` },
      { h: 'We do not sell your data', html: `<p>We do not sell or rent your personal data. No personal data is required to use the free service.</p>` },
      { h: 'Your rights', html: `<p>You can erase locally stored data at any time by clearing the site’s storage in your browser. To exercise your rights (access, rectification, deletion, objection), write to us at <a href="mailto:${esc(support)}">${esc(support)}</a>.</p>` },
      { h: 'Retention', html: `<p>Alert-subscription data is kept while the subscription is active and deleted on request. Every email includes an unsubscribe link.</p>` },
    ],
  }
}

// ── Contenu : Refund / Reembolso ─────────────────────────────────────────────
function refundContent(lang, region) {
  const site = `${UI[lang].sitePrefix} ${region.name}`
  const support = (region.emails && region.emails.support) || `support@${region.domain}`
  const cur = region.currency || 'USD'
  if (lang === 'es') {
    return {
      title: 'Política de reembolso',
      lead: `Esta página describe la política de reembolso de las ofertas Premium de <strong>${esc(site)}</strong> (${esc(region.domain)}).`,
      sections: [
        { h: 'Garantía de satisfacción — 30 días', html: `<div class="card"><p style="margin:0">Si el Servicio no te convence, puedes solicitar un <strong>reembolso íntegro en un plazo de 30 días</strong> tras tu primer pago (de tu Pase). No hace falta justificación. Es nuestro compromiso «satisfecho o reembolsado».</p></div>` },
        { h: 'Derechos legales', html: `<p>Esta garantía de 30 días se suma a los derechos de protección al consumidor que la ley de tu país de residencia (${esc(region.country || '')}) te reconozca.</p>` },
        { h: 'Pase de viaje (compra única)', html: `<p>El Pase de viaje de 7 días es reembolsable si no se ha utilizado de forma sustancial, previa solicitud en los 14 días siguientes a la compra. Una vez consumido en gran parte el periodo de acceso, el reembolso puede denegarse.</p>` },
        { h: 'Pago único', html: `<p>El Pase es un <strong>pago único</strong>: no hay cobros recurrentes que detener. El <strong>reembolso</strong> te devuelve el importe pagado según las condiciones anteriores.</p>` },
        { h: 'Cómo solicitar un reembolso', html: `<p>Escríbenos a <a href="mailto:${esc(support)}">${esc(support)}</a> indicando el correo electrónico utilizado para el pago. Tratamos las solicitudes en un plazo de 5 días hábiles.</p>` },
        { h: 'Tramitación y plazo', html: `<p>Los pagos y reembolsos los procesa nuestro proveedor de pago autorizado (Comerciante de Registro). El reembolso se realiza en el medio de pago de origen, en ${esc(cur)}; el abono suele aparecer en 5 a 10 días hábiles según tu banco.</p>` },
      ],
    }
  }
  return {
    title: 'Refund Policy',
    lead: `This page describes the refund policy for the Sargassum Pass of <strong>${esc(site)}</strong> (${esc(region.domain)}).`,
    sections: [
      { h: '30-day money-back guarantee', html: `<div class="card"><p style="margin:0">If the Service isn’t right for you, you can request a <strong>full refund within 30 days</strong> of your first payment (of your Pass). No justification needed. That’s our “satisfied or refunded” commitment.</p></div>` },
      { h: 'Your statutory rights', html: `<p>This 30-day guarantee is in addition to any consumer-protection rights granted to you by the law of your country of residence (${esc(region.country || '')}).</p>` },
      { h: 'Trip Pass (one-time purchase)', html: `<p>The 7-day Trip Pass is refundable if it has not been substantially used, on request within 14 days of purchase. Once the access period has been largely consumed, a refund may be declined.</p>` },
      { h: 'One-time payment', html: `<p>The Pass is a <strong>one-time payment</strong>: there are no recurring charges to stop. A <strong>refund</strong> returns the amount paid under the conditions above.</p>` },
      { h: 'How to request a refund', html: `<p>Write to us at <a href="mailto:${esc(support)}">${esc(support)}</a> with the email address used for the payment. We process requests within 5 business days.</p>` },
      { h: 'Processing and timeframe', html: `<p>Payments and refunds are processed by our authorized payment provider (Merchant of Record). The refund is made to the original payment method, in ${esc(cur)}; the credit usually appears within 5 to 10 business days depending on your bank.</p>` },
    ],
  }
}

const CONTENT = { terms: termsContent, privacy: privacyContent, refund: refundContent }

// ── Chrome HTML (style inline — legal.css est strippé sur les domaines USD) ───
function pageStyle() {
  return `:root{--bg:#FDFCF7;--card:#fff;--ink:#0D0D0D;--mid:#686868;--gold:#E8A800;--gold-l:#FFC72C;--night:#0B2230;--border:rgba(0,0,0,.08)}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--card:#161b22;--ink:#e6edf3;--mid:#9aa4af;--border:rgba(255,255,255,.10)}}
*{margin:0;padding:0;box-sizing:border-box}
html{font-size:clamp(15px,1.4vw + 11px,17px);-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}
.h{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 20px;background:var(--night);color:#fff}
.h .brand{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;font-weight:800;font-size:15px}
.h .brand .dot{width:9px;height:9px;border-radius:50%;background:var(--gold-l);box-shadow:0 0 0 4px rgba(255,199,44,.18)}
.h .home{color:rgba(255,255,255,.82);text-decoration:none;font-size:13px;font-weight:600}
.wrap{max-width:680px;margin:0 auto;padding:34px 22px 10px}
.wrap h1{font-size:clamp(1.7rem,5.2vw,2.15rem);font-weight:800;letter-spacing:-.015em;line-height:1.08;margin-bottom:10px}
.wrap .lead{color:var(--mid);font-size:1.06rem;margin-bottom:26px}
.wrap h2{font-size:1.06rem;font-weight:800;margin:28px 0 9px}
.wrap p,.wrap li{margin-bottom:11px}
.wrap a{color:var(--gold);text-decoration:none;font-weight:600}
.wrap a:hover{text-decoration:underline}
.wrap ul{padding-left:20px;margin-bottom:14px}
.wrap .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin:14px 0}
.wrap .upd{color:var(--mid);font-size:.85rem;margin-top:26px}
.foot{margin-top:42px;background:var(--night);color:rgba(255,255,255,.8)}
.foot-in{max-width:680px;margin:0 auto;padding:30px 22px 42px}
.foot .b{display:flex;align-items:center;gap:9px;color:#fff;font-weight:800;font-size:15px;margin-bottom:16px}
.foot .b .dot{width:9px;height:9px;border-radius:50%;background:var(--gold-l);box-shadow:0 0 0 4px rgba(255,199,44,.16)}
.foot nav{display:flex;flex-wrap:wrap;gap:9px 18px;margin-bottom:12px}
.foot nav a{color:rgba(255,255,255,.84);font-weight:600;font-size:14px;text-decoration:none}
.foot nav a:hover{color:var(--gold-l)}
.foot nav.legal a{color:rgba(255,255,255,.58);font-weight:500;font-size:13px}
.foot .co{border-top:1px solid rgba(255,255,255,.12);padding-top:15px;margin-top:8px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.7}
.foot .co a{color:rgba(255,255,255,.72);text-decoration:none}`
}

function renderLegalPage({ key, lang, region, slug, alternates, today }) {
  const ui = UI[lang]
  const site = `${ui.sitePrefix} ${region.name}`
  const c = CONTENT[key](lang, region)
  const canonical = `https://${region.domain}/${slug}/`
  const altTags = (alternates || []).map(a => `<link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`).join('\n') +
    (alternates && alternates.length ? `\n<link rel="alternate" hreflang="x-default" href="${(alternates.find(a => a.xDefault) || alternates[0]).href}"/>` : '')
  const body = c.sections.map(s => `    <h2>${esc(s.h)}</h2>\n    ${s.html}`).join('\n')
  const co = lang === 'es'
    ? `${ui.operatedBy} <strong style="color:rgba(255,255,255,.78)">${OP.name}</strong> — SAS · ${esc(OP.rcs)} · ${esc(OP.siret)} · <a href="mailto:${esc((region.emails && region.emails.support) || '')}">${esc((region.emails && region.emails.support) || '')}</a><br>Datos satélite Copernicus (ESA) &amp; NOAA · © 2026 ${OP.name}. ${ui.indicative}`
    : `${ui.operatedBy} <strong style="color:rgba(255,255,255,.78)">${OP.name}</strong> — SAS · ${esc(OP.rcs)} · ${esc(OP.siret)} · <a href="mailto:${esc((region.emails && region.emails.support) || '')}">${esc((region.emails && region.emails.support) || '')}</a><br>Satellite data Copernicus (ESA) &amp; NOAA · © 2026 ${OP.name}. ${ui.indicative}`
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<link rel="icon" href="/favicon.ico" sizes="any"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<title>${esc(c.title)} · ${esc(site)}</title>
<meta name="description" content="${esc(c.title)} — ${esc(site)} (${esc(region.domain)})."/>
<link rel="canonical" href="${canonical}"/>
${altTags}
<meta name="robots" content="index,follow"/>
<style>${pageStyle()}</style>
</head>
<body>
  <header class="h">
    <a class="brand" href="/"><span class="dot"></span>${esc(site)}</a>
    <a class="home" href="/">← ${esc(ui.back)}</a>
  </header>
  <main class="wrap">
    <h1>${esc(c.title)}</h1>
    <p class="lead">${c.lead}</p>
${body}
    <p class="upd">${esc(ui.updated)}: ${esc(today)}</p>
  </main>
  <footer class="foot"><div class="foot-in">
    <div class="b"><span class="dot"></span>${esc(site)}</div>
    <nav>
      <a href="/">${esc(ui.live)}</a>
      <a href="/${RELIABILITY_SLUG[lang]}/">${esc(ui.reliability)}</a>
    </nav>
    <nav class="legal">
      <a href="/${SLUGS.terms[lang]}/">${esc(ui.terms)}</a>
      <a href="/${SLUGS.privacy[lang]}/">${esc(ui.privacy)}</a>
      <a href="/${SLUGS.refund[lang]}/">${esc(ui.refund)}</a>
    </nav>
    <div class="co">${co}</div>
  </div></footer>
</body>
</html>
`
}

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

/** Ajoute la page au sitemap.xml régional (écrit avant par region-seo-pages.cjs). */
function appendToRegionSitemap(distDir, domain, slug, today) {
  const p = path.join(distDir, 'sitemap.xml')
  let xml
  try { xml = fs.readFileSync(p, 'utf-8') } catch { return false }
  const loc = `https://${domain}/${slug}/`
  if (xml.includes(loc)) return true
  xml = xml.replace('</urlset>', `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>\n</urlset>`)
  fs.writeFileSync(p, xml, 'utf-8')
  return true
}

/**
 * Entrée unique. MQ/GP → return (pages statiques FR conservées). Sinon génère
 * Terms/Privacy/Refund pour chaque langue émise par la région, slugs localisés
 * racine, cross-liés par hreflang, ajoutés au sitemap régional.
 */
function generateLegalPages(region, distDir) {
  const isNewRegion = !!(region && region.id !== 'mq' && region.id !== 'gp')
  if (!isNewRegion) return
  const langs = emittedLangs(region) // primaire d'abord (region-langs.cjs)
  if (!langs.length) return
  const today = new Date().toISOString().slice(0, 10)
  let count = 0
  for (const key of ['terms', 'privacy', 'refund']) {
    const alternates = langs.map(l => ({ lang: l, href: `https://${region.domain}/${SLUGS[key][normLang(l)]}/`, xDefault: normLang(l) === langs[0] }))
    for (const l of langs) {
      const lang = normLang(l)
      const slug = SLUGS[key][lang]
      writePage(distDir, slug, renderLegalPage({ key, lang, region, slug, alternates, today }))
      appendToRegionSitemap(distDir, region.domain, slug, today)
      count++
    }
  }
  console.log(`   → pages légales ${region.id} générées (${langs.join('+')}) : ${count} pages [Terms/Privacy/Refund]`)
}

module.exports = { generateLegalPages, SLUGS }
