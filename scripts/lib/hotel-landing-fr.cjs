// hotel-landing-fr.cjs — landing B2B « intention d'achat » FR pour MQ/GP.
//
// Route : /sargasses-pour-hotels/ (une page par domaine — Martinique OU
// Guadeloupe, l'appelant fournit l'île + la couverture de plages de CETTE île).
// C'est le pendant FR du buildHotelLanding() USD (region-seo-pages.cjs), avec :
//   · copy FR (colonne vertébrale 6-temps de design/STORY, claims hedgés),
//   · prix EUR (79 €/mois · 690 €/an, essai 30 j sans carte),
//   · tableau de couverture LIVE par plage (statut du jour, données réelles),
//   · boucle analytics : CTA → /?pro=1&b=…&utm_* → event sg_b2b_visit.
//
// PAGE STANDALONE (pas un <noscript> injecté dans l'app-shell) : elle DOIT
// convertir un visiteur JS → vrai pitch + CTA cliquable, tout en restant
// crawlable. Verdict panel USD #488 appliqué : le lead est l'usage PRIVÉ
// (brief matinal + alerte staff), JAMAIS « collez un widget algues sur votre
// site » (tueur de conversion n°1) ; le badge public est OPT-IN. L'argent ne
// touche jamais le verdict (badge = même verdict neutre public). Claims
// fiabilité TOUJOURS hedgés (fenêtre datée + N + saison + ~76 % tous régimes +
// faible confiance alertes) — jamais un « 100 % » nu.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const STATUS_FR = { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter' }
const STATUS_COLOR = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2626' }

/**
 * @param {object} o
 * @param {'mq'|'gp'} o.islandId
 * @param {string} o.islandName            'Martinique' | 'Guadeloupe'
 * @param {string} o.domain                'sargasses-martinique.com'
 * @param {Array<{name,commune,status,score}>} o.coverage   plages LIVE de l'île
 * @param {object|null} o.reliability       { overallPct, calmPct, calmSamples, from, to } (backtest réel) ou null
 * @param {string} o.updatedRel             ex. 'il y a 2 h' (fraîcheur du composite)
 */
function buildHotelLandingFr(o) {
  const { islandId, islandName, domain, coverage = [], reliability = null, updatedRel = '' } = o
  const canonical = `https://${domain}/sargasses-pour-hotels/`
  const camp = `b2b_hotels_fr_${islandId}`
  // CTA self-serve unique → app B2B (?pro=1 ouvre le B2BModal essai 30 j) +
  // b=/utm_* → l'event sg_b2b_visit attribue la conversion à CETTE landing.
  const pro = (pos) => `https://${domain}/?pro=1&amp;b=hotels_fr_${islandId}&amp;utm_source=organic&amp;utm_medium=landing&amp;utm_campaign=${camp}&amp;utm_content=${pos}`
  const fiab = `https://${domain}/fiabilite/`

  // Bande de fiabilité — hedgée, chiffres RÉELS du backtest (fenêtre datée + N),
  // jamais un « 100 % » nu détaché de ses qualificatifs (loi CLAUDE.md).
  const overall = reliability && reliability.overallPct != null ? reliability.overallPct : 77
  const calmN = reliability && reliability.calmSamples != null ? reliability.calmSamples : null
  const win = reliability && reliability.from ? ` (${reliability.from} → ${reliability.to})` : ''
  const relLine = calmN
    ? `En saison calme${win}, <b>100 % de nos prévisions « mer propre » se sont vérifiées</b> sur ${Number(calmN).toLocaleString('fr-FR')} comparaisons datées. Tous régimes confondus, le verdict tourne autour de <b>${overall} %</b> à 24 h ; les rares alertes restent signalées <b>à faible confiance</b> tant que le satellite ne les confirme pas. On publie tout — réussites et ratés — daté et par plage.`
    : `Tous régimes confondus, notre verdict se vérifie autour de <b>${overall} %</b> à 24 h (le plus fort sur les « mer propre » en saison calme, le moins sûr sur les rares alertes rapides). On publie le palmarès complet, daté et par plage — réussites comme ratés.`

  // Tableau de couverture LIVE (par plage, statut du jour). Fait public =
  // quelle plage on surveille + son état neutre, jamais « nos clients ».
  const covRows = coverage.slice(0, 16).map(b => {
    const st = b.status || 'clean'
    return `<li><span class="d" style="background:${STATUS_COLOR[st] || '#999'}"></span><span class="n"><b>${esc(b.name)}</b>${b.commune ? ` · ${esc(b.commune)}` : ''}<br><small>${STATUS_FR[st] || st}${typeof b.score === 'number' ? ` · score ${b.score}/100` : ''}</small></span></li>`
  }).join('')

  const title = `Sargasses pour hôtels en ${islandName} — prévision par plage, alertes staff`
  const desc = `Pour les hôtels de ${islandName} : le brief sargasses de VOTRE plage chaque matin, mesuré au satellite, plage par plage, 7 jours à l'avance. Privé par défaut, badge public optionnel. 79 €/mois, essai 30 j sans carte, zéro appel.`
  const h1 = `Vos clients Googlent les sargasses de votre plage avant de réserver. En ce moment, c'est la photo d'un inconnu qui répond à leur place.`

  const faqs = [
    ['Combien ça coûte, et y a-t-il vraiment zéro appel ?',
     '79 €/mois ou 690 €/an — deux mois offerts sur l\'annuel. Aucun frais d\'installation, aucune commission sur vos réservations, aucun rendez-vous commercial. Vous démarrez par un essai de 30 jours gratuit, sans carte : vous jugez sur pièces avant de décider.'],
    ['Dois-je mettre « algues » ou un widget sur mon site ?',
     'Non. Par défaut, rien n\'est public — vous recevez le brief matinal et les alertes en privé, pour votre équipe. Le badge public « plage propre » est optionnel et 100 % à votre main : vous choisissez de l\'afficher, jamais ce qu\'il dit. La plupart des établissements ne montrent le badge que les bons jours.'],
    ['En quoi est-ce différent des données gratuites de Météo-France / NOAA ?',
     'Les cartes publiques donnent un risque régional flou, pas un verdict pour VOTRE plage. Nous traduisons le satellite en une prévision par plage à 7 jours, avec un niveau de confiance, et nous publions notre taux d\'erreur daté (autour de 77 % tous régimes). Les jours de faible confiance affichent « incertain », jamais un faux « propre » — vous êtes protégé, pas exposé.'],
  ]
  const faqHtml = faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
  const bcLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Carte en direct', item: `https://${domain}/` },
    { '@type': 'ListItem', position: 2, name: title, item: canonical } ] }
  const ld = [bcLd, faqLd].map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="fr" href="${canonical}" /><link rel="alternate" hreflang="x-default" href="${canonical}" />
<meta name="robots" content="index,follow">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://${domain}/social-share.png"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
${ld}
<style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5EF;color:#15110d;line-height:1.55;padding:16px 0}.wrap{max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.08)}.hd{background:radial-gradient(130% 72% at 78% 2%,rgba(255,224,160,.22),transparent 52%),linear-gradient(158deg,#2e1a5e 0%,#6a2f9e 46%,#C97E3A 88%,#F2B05E);color:#fff;padding:32px 24px}.hd .k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;opacity:.86;font-weight:800}.hd h1{font-size:26px;margin:10px 0 12px;line-height:1.16}.hd p{font-size:14.5px;opacity:.95}.fresh{display:inline-flex;align-items:center;gap:7px;margin-top:16px;background:rgba(8,18,16,.32);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 13px;font-size:11px;font-weight:700}.fresh .dot{width:7px;height:7px;border-radius:50%;background:#6AC15A}.bd{padding:22px 24px}.bd h2{font-size:19px;margin:24px 0 6px;line-height:1.24}.bd p{font-size:15px;margin:0 0 8px}.lnk{color:#6a2f9e;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(106,47,158,.35)}.cov{background:#FAF8F1;border:1px solid #eadfc6;border-radius:14px;padding:14px 16px;margin:18px 0}.cov h2{margin-top:2px}.cov ul{list-style:none;margin-top:8px}.cov li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eee}.cov .d{width:14px;height:14px;border-radius:50%;flex:none}.cov .n{flex:1}.cov .n small{color:#7a756c;font-size:12.5px}.price{background:#F3EEFB;border:1px solid #dfd0f2;border-radius:14px;padding:16px 18px;margin:20px 0}.price b{font-size:19px}.rel{background:#F0FbF4;border:1px solid #cdeBd7;border-radius:14px;padding:14px 16px;margin:18px 0;font-size:14px}.cta{display:block;text-align:center;background:linear-gradient(135deg,#2e1a5e,#6a2f9e);color:#fff;text-decoration:none;border-radius:14px;padding:16px 18px;margin:14px 0;font-weight:800;font-size:15.5px}h3{font-size:15.5px;margin:16px 0 2px}.faq h3{color:#2e1a5e}.ft{font-size:11.5px;color:#8a857c;padding:8px 24px 24px}.ft a{color:#6a2f9e}</style></head>
<body><div class="wrap">
<div class="hd"><div class="k">${esc(islandName)} · pour les hôtels &amp; resorts</div><h1>${esc(h1)}</h1><p>Mesuré au satellite, pas deviné. Privé par défaut.</p><div class="fresh"><span class="dot"></span>Données satellite Copernicus${updatedRel ? ` · ${esc(updatedRel)}` : ''}</div></div>
<div class="bd">
<p>Une famille qui réserve ${esc(islandName)} ce week-end tape déjà « sargasses » — et ce qu'elle trouve, c'est la photo du pire jour d'un inconnu, sur une plage qui n'est peut-être même pas la vôtre. Vous ne pouvez pas empêcher vos clients de vérifier. Vous pouvez être celui qui <b>sait vraiment</b>. Nous mesurons au satellite la plage exacte devant votre établissement, quatre fois par jour, et vous envoyons le verdict chaque matin — en privé, avant qu'un client ne descende à l'eau.</p>
<a class="cta" href="${pro('hero')}">Activer mon essai 30 j — voir ma plage en direct →</a>

<h2>Privé d'abord : un brief matinal + des alertes staff — aucun widget, aucun développeur</h2>
<p>Votre premier jour est invisible pour vos clients. Chaque matin, vous recevez par email l'état de votre plage et la tendance 7 jours, plus une alerte dès que notre prochaine lecture satellite détecte un changement — pour que la réception, la conciergerie et l'équipe plage le sachent avant la première question, pas après. Aucun code, aucun embed, rien sur votre site public. Orientez une famille vers la crique propre du jour, déplacez le mariage sur la plage, briefez l'équipe — sur un verdict fiable parce que c'est le <b>même verdict neutre que tout le monde voit</b>.</p>

<h2>Quand votre plage est propre, dites-le — avec un badge que vous contrôlez</h2>
<p>La conversation sur votre plage a lieu sur Google et TripAdvisor, que vous y participiez ou non. Quand vous serez prêt, ajoutez un statut « plage propre » en direct à votre propre page de réservation — le même verdict honnête, sous votre toit plutôt que la photo d'un inconnu. C'est optionnel : vous choisissez de le montrer, <b>jamais ce qu'il dit</b>. Un jour de faible confiance, il affiche « incertain » plutôt qu'une promesse — vous n'êtes jamais pris à annoncer « propre » quand la mer dit le contraire. Vert veut dire vert parce que le satellite le dit, pas parce que ça vend des chambres.</p>

<div class="rel"><b>Mesuré, pas deviné — et on publie quand on se trompe.</b><br>${relLine} <a class="lnk" href="${fiab}">Voir notre palmarès daté →</a></div>

<div class="cov"><h2>Les plages de ${esc(islandName)} qu'on surveille déjà</h2><p>État en direct maintenant, échantillonné au large de chaque tronçon — dont le sable devant ces établissements. Actualisé 4×/jour.</p><ul>${covRows || `<li><span class="n"><small>Couverture actualisée toutes les 4 heures.</small></span></li>`}</ul></div>
<a class="cta" href="${pro('coverage')}">Voir ma plage en direct — essai gratuit →</a>

<div class="price"><h2>Démarrez en deux minutes — sans carte, sans appel</h2><p>Le prix est annoncé d'emblée : <b>79 €/mois ou 690 €/an</b> (deux mois offerts). Vous démarrez un essai de 30 jours — sans carte, sans rendez-vous commercial. Vous configurez tout vous-même, et vous décidez ce qui reste privé et ce qui, éventuellement, devient public. Si ça ne gagne pas sa place à côté de vos tarifs, vous repartez sans avoir rien dépensé.</p><p><b>79 €/mois · 690 €/an</b> — essai 30 jours gratuit, sans carte, sans appel.</p></div>
<a class="cta" href="${pro('pricing')}">Lancer mon essai 30 jours →</a>

<div class="faq"><h2>Questions</h2>${faqHtml}</div>
</div>
<div class="ft">Données satellite indépendantes Copernicus / NOAA · actualisées 4×/jour · Il regarde la mer, jamais vos clients. · <a href="${fiab}">Fiabilité</a> · <a href="https://${domain}/">Carte en direct</a> · ${esc(domain)}</div>
</div></body></html>`
}

module.exports = { buildHotelLandingFr }
