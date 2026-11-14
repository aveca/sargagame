// hotel-landing-fr.cjs — landing B2B « intention d'achat » FR pour MQ/GP.
//
// Route : /sargasses-pour-hotels/ (une page par domaine — Martinique OU
// Guadeloupe, l'appelant fournit l'île + la couverture de plages de CETTE île).
// C'est le pendant FR du buildHotelLanding() USD (region-seo-pages.cjs), avec :
//   · copy FR (colonne vertébrale 6-temps de design/STORY, claims hedgés),
//   · prix EUR (79 €/mois · 690 €/an, essai 30 j sans carte),
//   · tableau de couverture par plage, uniquement si l'observation respecte le SLA,
//   · boucle analytics : CTA → /?pro=1&b=…&utm_* → event sg_b2b_visit.
//
// PAGE STANDALONE (pas un <noscript> injecté dans l'app-shell) : elle DOIT
// convertir un visiteur JS → vrai pitch + CTA cliquable, tout en restant
// crawlable. Verdict panel USD #488 appliqué : le lead est l'usage PRIVÉ
// (brief privé daté + alerte staff), JAMAIS « collez un widget algues sur votre
// site » (tueur de conversion n°1) ; le badge public est OPT-IN. L'argent ne
// touche jamais le verdict (badge = même verdict neutre public). Claims
// fiabilité toujours datée et ventilée par régime/type de verdict, avec N ;
// aucune valeur globale ni valeur de secours si la mesure manque.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const STATUS_FR = { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter', unknown: 'À vérifier' }
const STATUS_COLOR = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2626', unknown: '#9CA3AF' }

const MIN_RELIABILITY_SAMPLES = 20

// La fraîcheur est calculée depuis l'observation satellite, jamais depuis l'heure du build.
const { operationalSatelliteFreshness } = require('./satellite-freshness.cjs')

function getSatelliteFreshness(observation, nowMs = Date.now()) {
  // Production callers pass the complete payload so the shared contract can
  // reject non-live sources as well as invalid, missing and future timestamps.
  const payload = typeof observation === 'string'
    ? { source: 'erddap-live', erddapTimestamp: observation }
    : observation
  const result = operationalSatelliteFreshness(payload, nowMs)
  if (!Number.isFinite(result.ageMinutes)) return { status: 'unknown', ageLabel: '' }
  const ageMinutes = result.ageMinutes
  const ageLabel = ageMinutes < 60
    ? 'il y a ' + Math.max(1, Math.round(ageMinutes)) + ' min'
    : 'il y a ' + Math.max(1, Math.round(ageMinutes / 60)) + ' h'
  return { status: result.fresh ? 'fresh' : 'stale', ageLabel }
}

/**
 * @param {object} o
 * @param {'mq'|'gp'} o.islandId
 * @param {string} o.islandName            'Martinique' | 'Guadeloupe'
 * @param {string} o.domain                'sargasses-martinique.com'
 * @param {Array<{name,commune,status,score}>} o.coverage   couverture de plages de l'île
 * @param {object|null} o.reliability       mesures de fiabilité par régime/type de verdict, avec fenêtre et N, ou null
 * @param {string} o.updatedRel             âge lisible calculé depuis erddapTimestamp
 */
function buildHotelLandingFr(o) {
  const { islandId, islandName, domain, coverage = [], reliability = null, updatedRel = '', freshnessStatus = 'unknown' } = o
  const canonical = `https://${domain}/sargasses-pour-hotels/`
  const camp = `b2b_hotels_fr_${islandId}`
  // CTA self-serve unique → app B2B (?pro=1 ouvre le B2BModal essai 30 j) +
  // b=/utm_* → l'event sg_b2b_visit attribue la conversion à CETTE landing.
  const pro = (pos) => `https://${domain}/?pro=1&amp;b=hotels_fr_${islandId}&amp;utm_source=organic&amp;utm_medium=landing&amp;utm_campaign=${camp}&amp;utm_content=${pos}`
  const fiab = `https://${domain}/fiabilite/`
  const freshness = ['fresh', 'stale', 'unknown'].includes(freshnessStatus) ? freshnessStatus : 'unknown'
  const freshnessLabel = freshness === 'fresh'
    ? 'Données satellite Copernicus' + (updatedRel ? ' · ' + updatedRel : '')
    : freshness === 'stale'
      ? 'Observation satellite ancienne' + (updatedRel ? ' · ' + updatedRel : '')
      : 'Fraîcheur satellite inconnue'

  // Publier les mesures par régime et type de verdict ; ne jamais remplacer une donnée absente par un taux global.
  const calmPct = reliability && Number.isFinite(reliability.calmPct) ? reliability.calmPct : null
  const calmN = reliability && Number.isFinite(reliability.calmSamples) && reliability.calmSamples >= MIN_RELIABILITY_SAMPLES ? reliability.calmSamples : null
  const calmAlertPct = reliability && Number.isFinite(reliability.calmAlertPct) ? reliability.calmAlertPct : null
  const calmAlertN = reliability && Number.isFinite(reliability.calmAlertSamples) && reliability.calmAlertSamples >= MIN_RELIABILITY_SAMPLES ? reliability.calmAlertSamples : null
  const hasWindow = Boolean(reliability && reliability.from && reliability.to)
  const hasCleanMetric = calmPct !== null && calmN !== null && hasWindow
  const hasAlertMetric = calmAlertPct !== null && calmAlertN !== null
  const relLine = hasCleanMetric
    ? 'Sur la fenêtre ' + reliability.from + ' → ' + reliability.to + ', en régime calme, <b>' + calmPct + '% des prévisions « mer propre » se sont vérifiées</b> sur ' + Number(calmN).toLocaleString('fr-FR') + ' cas. ' +
      (hasAlertMetric ? 'Les alertes en régime calme ont un taux de réussite de <b>' + calmAlertPct + '%</b> sur ' + Number(calmAlertN).toLocaleString('fr-FR') + ' cas ; elles restent à faible confiance tant que l’observation ne les confirme pas.' : 'Les alertes restent à faible confiance tant que l’observation ne les confirme pas.') +
      ' Les résultats varient selon le régime et le type de verdict ; consultez le palmarès daté pour le contexte.'
    : 'Aucun taux de fiabilité n’est affiché sans mesure datée par régime et type de verdict. Consultez le palmarès daté pour les résultats disponibles, réussites et ratés.'
  // Tableau de couverture par plage ; statuts visibles uniquement dans le SLA. Fait public =
  // quelle plage on surveille + son état neutre, jamais « nos clients ».
  const covRows = coverage.slice(0, 16).map(b => {
    const knownStatus = freshness === 'fresh' && Object.prototype.hasOwnProperty.call(STATUS_FR, b.status) && b.status !== 'unknown'
    const st = knownStatus ? b.status : 'unknown'
    const scoreText = knownStatus && typeof b.score === 'number' ? ' · score ' + b.score + '/100' : ''
    return `<li><span class="d" style="background:${STATUS_COLOR[st]}"></span><span class="n"><b>${esc(b.name)}</b>${b.commune ? ` · ${esc(b.commune)}` : ''}<br><small>${STATUS_FR[st]}${scoreText}</small></span></li>`
  }).join('')
  const coverageIntro = freshness === 'fresh'
    ? 'État observé au large de chaque tronçon, dont le littoral devant ces établissements. Lecture satellite récente ; la cadence habituelle peut varier.'
    : freshness === 'stale'
      ? 'Observation satellite trop ancienne pour confirmer les statuts actuels : statuts et scores masqués jusqu’à une nouvelle observation.'
      : 'Fraîcheur satellite inconnue : statuts et scores masqués jusqu’à confirmation de l’observation.'
  const coverageFallback = freshness === 'fresh'
    ? 'Aucun statut de plage disponible dans les données courantes.'
    : 'Statuts indisponibles tant que la fraîcheur satellite n’est pas confirmée.'
  const title = `Sargasses pour hôtels en ${islandName} — prévision par plage, alertes staff`
  const desc = `Pour les hôtels de ${islandName} : état satellite horodaté par plage ; statut masqué si la donnée est ancienne. Brief privé, essai gratuit 30 jours.`
  const h1 = `Vos clients Googlent les sargasses de votre plage avant de réserver. En ce moment, c'est la photo d'un inconnu qui répond à leur place.`

  const faqs = [
    ['Combien ça coûte, et y a-t-il vraiment zéro appel ?',
     '79 €/mois ou 690 €/an — deux mois offerts sur l\'annuel. Aucun frais d\'installation, aucune commission sur vos réservations, aucun rendez-vous commercial. Vous démarrez par un essai de 30 jours gratuit, sans carte : vous jugez sur pièces avant de décider.'],
    ['Dois-je mettre « algues » ou un widget sur mon site ?',
     'Non. Par défaut, rien n\'est public — votre équipe consulte un brief privé horodaté et les alertes si elles sont activées. Le badge public optionnel reprend le statut neutre disponible ; si l\'observation est ancienne ou inconnue, il affiche « À vérifier » ou n\'est pas publié. Vous choisissez de l\'afficher, jamais son contenu.'],
    ['En quoi est-ce différent des données gratuites de Météo-France / NOAA ?',
     'Nous associons les observations disponibles à une couverture par plage et à une tendance lorsque les données le permettent. Chaque statut affiché est rattaché à l\'heure réelle de l\'observation ; au-delà de 900 minutes, ou si le timestamp est absent, invalide ou futur, la plage reste « À vérifier » sans score actuel. Le palmarès de fiabilité est daté par régime et type de verdict, avec le nombre de cas mesurés.'],
  ]
  const faqHtml = faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
  const bcLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Carte des observations', item: `https://${domain}/` },
    { '@type': 'ListItem', position: 2, name: title, item: canonical } ] }
  const ld = [bcLd, faqLd].map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="fr" href="${canonical}" /><link rel="alternate" hreflang="x-default" href="${canonical}" />
<meta name="robots" content="index,follow">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://${domain}/social-share.png"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
${ld}
<style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5EF;color:#15110d;line-height:1.55;padding:16px 0}.wrap{max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.08)}.hd{background:radial-gradient(130% 72% at 78% 2%,rgba(255,224,160,.22),transparent 52%),linear-gradient(158deg,#2e1a5e 0%,#6a2f9e 46%,#C97E3A 88%,#F2B05E);color:#fff;padding:32px 24px}.hd .k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;opacity:.86;font-weight:800}.hd h1{font-size:26px;margin:10px 0 12px;line-height:1.16}.hd p{font-size:14.5px;opacity:.95}.fresh{display:inline-flex;align-items:center;gap:7px;margin-top:16px;background:rgba(8,18,16,.32);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 13px;font-size:11px;font-weight:700}.fresh .dot{width:7px;height:7px;border-radius:50%;background:#6AC15A}.fresh.stale{border-color:rgba(245,158,11,.55)}.fresh.stale .dot{background:#F59E0B}.fresh.unknown .dot{background:#9CA3AF}.bd{padding:22px 24px}.bd h2{font-size:19px;margin:24px 0 6px;line-height:1.24}.bd p{font-size:15px;margin:0 0 8px}.lnk{color:#6a2f9e;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(106,47,158,.35)}.cov{background:#FAF8F1;border:1px solid #eadfc6;border-radius:14px;padding:14px 16px;margin:18px 0}.cov h2{margin-top:2px}.cov ul{list-style:none;margin-top:8px}.cov li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eee}.cov .d{width:14px;height:14px;border-radius:50%;flex:none}.cov .n{flex:1}.cov .n small{color:#7a756c;font-size:12.5px}.price{background:#F3EEFB;border:1px solid #dfd0f2;border-radius:14px;padding:16px 18px;margin:20px 0}.price b{font-size:19px}.rel{background:#F0FbF4;border:1px solid #cdeBd7;border-radius:14px;padding:14px 16px;margin:18px 0;font-size:14px}.cta{display:block;text-align:center;background:linear-gradient(135deg,#2e1a5e,#6a2f9e);color:#fff;text-decoration:none;border-radius:14px;padding:16px 18px;margin:14px 0;font-weight:800;font-size:15.5px}h3{font-size:15.5px;margin:16px 0 2px}.faq h3{color:#2e1a5e}.ft{font-size:11.5px;color:#8a857c;padding:8px 24px 24px}.ft a{color:#6a2f9e}</style></head>
<body><div class="wrap">
<div class="hd"><div class="k">${esc(islandName)} · pour les hôtels &amp; resorts</div><h1>${esc(h1)}</h1><p>Mesuré au satellite, pas deviné. Privé par défaut.</p><div class="fresh ${freshness}"><span class="dot"></span>${esc(freshnessLabel)}</div></div>
<div class="bd">
<p>Une famille qui réserve ${esc(islandName)} ce week-end cherche déjà des informations sur les sargasses de sa plage. Nous utilisons les dernières observations satellite disponibles et affichons leur horodatage réel. Si l'observation dépasse 900 minutes, est absente ou invalide, les statuts et scores actuels sont masqués : la plage passe « À vérifier » plutôt que d'afficher un verdict périmé.</p>
<a class="cta" href="${pro('hero')}">Activer mon essai 30 j — configurer ma plage →</a>

<h2>Privé d'abord : un brief daté + des alertes staff — aucun widget, aucun développeur</h2>
<p>Votre premier jour est invisible pour vos clients. Votre équipe accède à un brief privé horodaté et peut recevoir des alertes staff lorsque les observations disponibles confirment un changement. Chaque état est rattaché à son observation ; si elle est trop ancienne ou inconnue, l'interface affiche « À vérifier » et aucun score actuel. Aucun code, aucun embed, rien sur votre site public. L'équipe peut ainsi répondre avec une information datée, sans transformer une absence de donnée en verdict « propre ».</p>

<h2>Quand les données confirment une plage propre, affichez le badge si vous le souhaitez</h2>
<p>La conversation sur votre plage a lieu sur Google et TripAdvisor, que vous y participiez ou non. Le badge public optionnel reprend le statut neutre disponible, avec sa date d'observation. Vous choisissez de l'afficher, jamais d'en modifier le contenu. Si la fraîcheur est insuffisante ou inconnue, le statut devient « À vérifier » et aucun score actuel n'est présenté — la communication reste alignée sur les données.</p>

<div class="rel"><b>Mesuré, pas deviné — et on publie quand on se trompe.</b><br>${relLine} <a class="lnk" href="${fiab}">Voir notre palmarès daté →</a></div>

<div class="cov"><h2>Les plages de ${esc(islandName)} qu'on surveille déjà</h2><p>${esc(coverageIntro)}</p><ul>${covRows || `<li><span class="n"><small>${esc(coverageFallback)}</small></span></li>`}</ul></div>
<a class="cta" href="${pro('coverage')}">Configurer ma plage — essai gratuit →</a>

<div class="price"><h2>Démarrez en deux minutes — sans carte, sans appel</h2><p>Le prix est annoncé d'emblée : <b>79 €/mois ou 690 €/an</b> (deux mois offerts). Vous démarrez un essai de 30 jours — sans carte, sans rendez-vous commercial. Vous configurez tout vous-même, et vous décidez ce qui reste privé et ce qui, éventuellement, devient public. Si ça ne gagne pas sa place à côté de vos tarifs, vous repartez sans avoir rien dépensé.</p><p><b>79 €/mois · 690 €/an</b> — essai 30 jours gratuit, sans carte, sans appel.</p></div>
<a class="cta" href="${pro('pricing')}">Lancer mon essai 30 jours →</a>

<div class="faq"><h2>Questions</h2>${faqHtml}</div>
</div>
<div class="ft">Source satellite indépendante Copernicus / NOAA · observation horodatée ci-dessus · Il regarde la mer, jamais vos clients. · <a href="${fiab}">Fiabilité</a> · <a href="https://${domain}/">Carte des observations</a> · ${esc(domain)}</div>
</div></body></html>`
}

module.exports = { buildHotelLandingFr, getSatelliteFreshness }
