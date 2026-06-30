#!/usr/bin/env node
/**
 * b2b-cold-outreach — prospection B2B FROIDE, automatisée et délivrabilité-safe.
 *
 * Source = data/b2b-enriched.json (hôtels MQ/GP avec email RÉEL + hook perso, produit
 * par l'agent d'enrichissement). Envoie une séquence courte et PERSONNALISÉE :
 *   c0  = premier contact (hook réel + preuve datée + ask self-serve : essai 30 j → /pro/espace/)
 *   c4  = relance unique J+4 (la plupart des réponses viennent de la relance)
 *
 * Délivrabilité (directive fondateur : ne jamais passer en spam) :
 *   - WARMUP : cap bas d'envois NEUFS par run (CAP_NEW, défaut 5) → montée lente.
 *   - perso (hook) → jamais 27× le même corps ; plain-text auto (htmlToText).
 *   - List-Unsubscribe + lien désabo ; dédup committée ; bounced filtrés ; replyTo.
 *   - 1 email/établissement/run max ; séquence espacée.
 * Dry-run sans SMTP_PASS. Tourne dans le pipeline daily (--send). NB : on envoie depuis
 * le domaine principal (choix fondateur) — warmup bas = garde-fou.
 *
 *   node scripts/automation/b2b-cold-outreach.cjs           # dry-run
 *   node scripts/automation/b2b-cold-outreach.cjs --send    # envoie
 *   CAP_NEW=8 node scripts/automation/b2b-cold-outreach.cjs --send
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')
const { inferType, dataHook, liveProof } = require('./lib/b2b-segment.cjs')

const SRC_PATH = path.join(__dirname, 'data', 'b2b-enriched.json')
const SENT_PATH = path.join(__dirname, 'data', 'b2b-cold-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SEND = process.argv.includes('--send')
// Expéditeur CONFIGURABLE : le jour où un domaine d'envoi dédié existe, on change
// juste B2B_FROM / B2B_REPLY_TO en secret → scale sans toucher au code.
const FROM = process.env.B2B_FROM || 'Sargasses Pro <alerte@sargasses-martinique.com>'
const REPLY_TO = process.env.B2B_REPLY_TO || 'alerte@sargasses-martinique.com'
const FOLLOWUP_DAYS = 4

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
function daysSince(iso) { const t = Date.parse(iso); return isNaN(t) ? 999 : Math.floor((Date.now() - t) / 86400000) }

// MONTÉE EN DÉBIT AUTO (warmup) : le nb de NOUVEAUX contacts/jour augmente avec l'âge
// de la campagne (jours depuis le 1er envoi), pour protéger la délivrabilité puis
// scaler. Override manuel CAP_NEW. Sur domaine dédié, on pourra élargir le barème.
function rampCap(firstSendISO) {
  if (process.env.CAP_NEW) return parseInt(process.env.CAP_NEW, 10)
  const d = firstSendISO ? daysSince(firstSendISO) : 0
  if (d < 3) return 5
  if (d < 7) return 10
  if (d < 14) return 20
  if (d < 28) return 35
  return 50
}

// Offre B2B ARRÊTÉE et SELF-SERVE (2026-06-29) : essai 30 j gratuit sans carte, puis
// Pro 79 €/mois ou 690 €/an, sur /pro/espace/ (essai + abo mensuel/annuel). ZÉRO call.
// Langue = primaryLang du site de la région (cf. regions/<id>.json) : florida & puntacana
// = EN-first (sargassummiami / sargassumpuntacana), rivieramaya = ES-first (sargassumcancun).
function localeFor(c) { return (c.island === 'FL' || c.island === 'florida' || c.island === 'PC' || c.island === 'puntacana') ? 'en' : (c.island === 'RM' || c.island === 'rivieramaya') ? 'es' : 'fr' }
function domainFor(c) {
  const i = String(c.island || '').toLowerCase()
  if (i === 'gp') return 'sargasses-guadeloupe.com'
  if (i === 'fl' || i === 'florida') return 'sargassummiami.com'
  if (i === 'pc' || i === 'puntacana') return 'sargassumpuntacana.com'
  if (i === 'rm' || i === 'rivieramaya') return 'sargassumcancun.com'
  return 'sargasses-martinique.com'
}

function cta(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:13px 26px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">${text}</a>`
}
function shell(inner, c) {
  const domain = domainFor(c)
  const unsub = `https://${domain}/?unsub=1`
  return {
    unsub,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">${inner}
<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">Sargasses Pro · ${domain}<br><a href="${unsub}" style="color:#999">Se désabonner</a></div>
</div></body></html>`,
  }
}

function buildC0(c, key) {
  const domain = domainFor(c)
  // Token par destinataire (&b=) → l'app logue la visite par prospect (funnel tracking).
  const b = key ? `&b=${String(key).slice(0, 12)}` : ''
  const pro = `https://${domain}/pro/espace/?utm_source=email&utm_medium=b2b_cold&utm_campaign=c0${b}`
  const place = c.town || (c.island === 'GP' ? 'Guadeloupe' : 'Martinique')
  const L = localeFor(c)
  // Segmentation déterministe (FR seul = marché B2B live MQ/GP ; EN/ES inchangés).
  const seg = inferType(c)                 // 'hotel' | 'collectivite'
  const dh = L === 'fr' ? dataHook(c, seg) : null  // vraie donnée plage(s), ou null
  const pf = liveProof()                           // % LIVE (jamais figé) — langue-agnostique
  // Phrase de donnée réelle, adaptative (saison calme vs épisode). null → copy générique.
  let dataSentence = ''
  if (dh) {
    if (seg === 'collectivite') {
      dataSentence = dh.navoid > 0
        ? `Un constat d'abord, sur vos plages : la semaine dernière, sur vos <strong>${dh.nbeaches}</strong> plages suivies, <strong>${dh.navoid}</strong> ont connu au moins un jour « à éviter » — et pas les mêmes d'un jour à l'autre.`
        : `Un constat d'abord : la semaine dernière, vos <strong>${dh.nbeaches}</strong> plages suivies sont restées propres. La saison est calme — c'est justement là que voir le jour où ça bascule, baie par baie, fait la différence pour le ramassage.`
    } else {
      dataSentence = dh.avoidDays > 0
        ? `Un fait d'abord, sur votre plage : <strong>${dh.beach}</strong> semble avoir connu <strong>${dh.avoidDays} jour(s)</strong> « à éviter » la semaine dernière — autant de matins où un client a pu arriver sans le savoir.`
        : `Un fait d'abord, sur votre plage : <strong>${dh.beach}</strong> est restée propre toute la semaine dernière — exactement le genre de certitude qu'on mesure et qu'on documente, jour après jour.`
    }
  }
  // Preuve LIVE (remplace le chiffre figé qui se périme), forme hedgée canonique — FR/EN/ES.
  // Même source live (pf) ; les 5 qualificatifs obligatoires (fenêtre datée, N comparaisons,
  // « saison calme », ~76 % tous régimes, faible confiance sur les alertes) sont TOUJOURS là,
  // jamais un « 100 % » nu. Lien honnêteté localisé : /fiabilite/ · /reliability/ · /fiabilidad/.
  const proofFr = pf
    ? `On ne promet pas, on montre. Notre fiabilité est publiée et auditée chaque jour, par régime, sur <strong>/fiabilite/</strong> : <strong>${pf.pct} % des prévisions « mer propre » vérifiées en saison calme</strong>${pf.n ? ` (${Number(pf.n).toLocaleString('fr-FR')} comparaisons${pf.from ? `, ${pf.from} → ${pf.to}` : ''})` : ''} ; <strong>~76 % tous régimes confondus</strong>, les rares alertes de saison calme en faible confiance. Le verdict reste 100 % data — l'argent n'y touche jamais.`
    : `On ne promet pas, on montre : fiabilité publiée et auditée par régime sur <strong>/fiabilite/</strong> (≈ 76 % à 79 % selon la saison, alertes de saison calme en faible confiance). Le verdict reste 100 % data — l'argent n'y touche jamais.`
  const proofEn = pf
    ? `We don't promise, we show. Our reliability is published and audited daily, by regime, on <strong>/reliability/</strong>: <strong>${pf.pct}% of "clean-sea" forecasts verified in calm season</strong>${pf.n ? ` (${Number(pf.n).toLocaleString('en-US')} comparisons${pf.from ? `, ${pf.from} → ${pf.to}` : ''})` : ''}; <strong>~76% across all regimes</strong>, with the rare calm-season alerts flagged low-confidence. The verdict stays 100% data — money never touches it.`
    : `We don't promise, we show: reliability published and audited by regime on <strong>/reliability/</strong> (~76% to 79% depending on the season, calm-season alerts flagged low-confidence). The verdict stays 100% data — money never touches it.`
  const proofEs = pf
    ? `No prometemos, mostramos. Nuestra fiabilidad se publica y se audita cada día, por régimen, en <strong>/fiabilidad/</strong>: <strong>${pf.pct} % de los pronósticos de "mar limpio" verificados en temporada calmada</strong>${pf.n ? ` (${Number(pf.n).toLocaleString('es-ES')} comparaciones${pf.from ? `, ${pf.from} → ${pf.to}` : ''})` : ''}; <strong>~76 % en todos los regímenes</strong>, con las raras alertas de temporada calmada marcadas como baja confianza. El veredicto sigue siendo 100 % datos — el dinero nunca lo toca.`
    : `No prometemos, mostramos: fiabilidad publicada y auditada por régimen en <strong>/fiabilidad/</strong> (~76 % a 79 % según la temporada, alertas de temporada calmada marcadas como baja confianza). El veredicto sigue siendo 100 % datos — el dinero nunca lo toca.`

  const subject = L === 'en' ? `${c.name} — your beaches, watched every morning`
    : L === 'es' ? `${c.name} — sus playas, vigiladas cada mañana`
    : seg === 'collectivite'
      ? (dh && dh.navoid > 0 ? `Sur vos ${dh.nbeaches} plages, ${dh.navoid} étaient à éviter la semaine dernière` : `Anticiper le ramassage, baie par baie — ${place}`)
      : (dh && dh.avoidDays > 0 ? `${dh.beach} : ${dh.avoidDays} jour(s) à éviter la semaine dernière` : `${c.name} — l'état de vos plages chaque matin ?`)
  const preheader = L === 'en' ? `Your beaches measured by satellite (Copernicus, NOAA) — alerted before the seaweed lands.`
    : L === 'es' ? `Sus playas medidas por satélite (Copernicus, NOAA) — avisados antes de que llegue el sargazo.`
    : seg === 'collectivite'
      ? `Voir baie par baie où les algues arrivent — quelques jours avant l'échouage, pour planifier le ramassage.`
      : `Vos plages mesurées au satellite — l'alerte le matin où ça bascule, avant l'échouage.`
  const T = {
    fr: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Vos plages, mesurées au satellite', hdrFor: `Pour ${c.name}, ${place}`,
      hi: 'Bonjour,',
      pain: `Je fais <strong>Le Veilleur</strong> — un projet indépendant, opéré depuis la Martinique, qui mesure les sargasses plage par plage au satellite (Copernicus Marine, NOAA), 4 fois par jour. Pour un établissement comme le vôtre, une plage envahie = clients déçus, avis, parfois remboursements — et vous l'apprenez souvent en même temps qu'eux.`,
      flip: `Avec Le Veilleur, vous connaissez la fin de l'histoire avant vos clients : l'alerte arrive <strong>avant</strong> les sargasses, avec une prévision 7 jours. Vous prévenez, vous ne subissez pas.`,
      proof: '', // écrasé plus bas par proofFr (preuve LIVE hedgée, jamais un « 100 % » figé)
      ask: `Côté pro, c'est simple et sans engagement : un <strong>essai 30 jours gratuit, sans carte</strong> (widget à vos couleurs sur votre site + alertes par plage), puis 79 €/mois ou 690 €/an. Tout en ligne, à votre rythme — voici l'état réel de vos plages, et vous activez l'essai en un clic.`,
      ctaText: 'Voir mes plages · essai 30 j',
      orReply: 'Ou répondez simplement « ok » et je vous envoie le rendu daté de vos plages.'
    },
    en: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Your beaches, measured by satellite', hdrFor: `For ${c.name}, ${place}`,
      hi: 'Hi,',
      pain: `I run <strong>Le Veilleur</strong> — an independent project, operated from Martinique, that measures sargassum beach by beach via satellite (Copernicus Marine, NOAA), four times a day. For a property like yours, an invaded beach means disappointed guests, bad reviews, sometimes refunds — and you often learn it at the same time they do.`,
      flip: `With Le Veilleur, you know how the story ends before your guests do: the alert lands <strong>before</strong> the seaweed, with a 7-day forecast. You warn them instead of taking the hit.`,
      proof: '', // écrasé plus bas par proofEn (preuve LIVE hedgée, jamais un « 100 % » figé)
      ask: `The pro side is simple and commitment-free: a <strong>free 30-day trial, no card</strong> (a widget in your colours on your site + per-beach alerts), then €79/mo or €690/yr. All online, at your pace — here's the real state of your beaches, and you start the trial in one click.`,
      ctaText: 'See my beaches · 30-day trial',
      orReply: 'Or just reply “ok” and I’ll send you the dated readout of your beaches.'
    },
    es: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Sus playas, medidas por satélite', hdrFor: `Para ${c.name}, ${place}`,
      hi: 'Hola,',
      pain: `Soy <strong>Le Veilleur</strong> — un proyecto independiente, operado desde Martinica, que mide el sargazo playa por playa vía satélite (Copernicus Marine, NOAA), cuatro veces al día. Para un establecimiento como el suyo, una playa invadida significa huéspedes decepcionados, malas reseñas, a veces reembolsos — y a menudo se entera al mismo tiempo que ellos.`,
      flip: `Con Le Veilleur, usted conoce el final de la historia antes que sus huéspedes: la alerta llega <strong>antes</strong> que el sargazo, con un pronóstico a 7 días. Usted avisa en lugar de sufrirlo.`,
      proof: '', // écrasé plus bas por proofEs (preuve LIVE hedgée, jamais un « 100 % » figé)
      ask: `La parte pro es simple y sin compromiso: una <strong>prueba gratuita de 30 días, sin tarjeta</strong> (un widget con sus colores en su sitio + alertas por playa), luego 79 €/mes o 690 €/año. Todo en línea, a su ritmo — aquí está el estado real de sus playas, y activa la prueba en un clic.`,
      ctaText: 'Ver mis playas · prueba 30 d',
      orReply: 'O responda simplemente “ok” y le envío la lectura fechada de sus playas.'
    }
  }[L]
  // Preuve LIVE hedgée pour les marchés USD (EN/ES) : remplace le « 100 % » figé +
  // les samples/fenêtre en dur (qui se périmaient et violaient le moat). Même source
  // live que le FR, mêmes 5 qualificatifs obligatoires.
  if (L === 'en') T.proof = proofEn
  else if (L === 'es') T.proof = proofEs
  // FR : copy SEGMENTÉE (hôtel = clients / collectivité = ramassage) + preuve LIVE.
  if (L === 'fr') {
    T.proof = proofFr
    if (seg === 'collectivite') {
      T.hdrSub = 'Vos plages, baie par baie'
      T.pain = `Aujourd'hui, l'échouage se découvre le matin même — algues déjà sur le sable, équipe pas encore mobilisée. Le Veilleur inverse l'ordre : prévision <strong>par plage, J+1→J+7</strong>, baie par baie, jamais une moyenne d'île.`
      T.flip = `Concret : un J+5 qui passe au rouge sur une seule anse vous laisse la veille pour mobiliser l'équipe de ramassage, poser les barrages et flécher le budget là où ça compte — pas partout à l'aveugle.`
      T.proof += ` Donnée publique et auditable — de quoi communiquer juste auprès des administrés.`
      T.ask = `L'essai donne tout de suite la prévision sur l'ensemble de votre littoral : <strong>30 jours gratuits, sans carte</strong>. 100 % en libre-service.`
      T.ctaText = dh ? `Voir vos ${dh.nbeaches} plages en direct · essai 30 j` : 'Voir vos plages · essai 30 j'
    } else {
      T.pain = `D'habitude, une plage qui bascule dans la nuit, vous l'apprenez en même temps que le client — à l'accueil, déçu. Le Veilleur inverse l'ordre : un satellite veille la mer (Copernicus + NOAA), traduit en prévision <strong>par plage</strong>, J+1→J+7. L'alerte « le matin où ça bascule » arrive <strong>avant</strong> l'échouage.`
      T.flip = `Concret : un matin, ${dh ? dh.beach : 'votre plage'} vire au rouge. Prévenu la veille, vous orientez les arrivées du jour vers une crique abritée à 10 min — personne pris en traître, pas d'avis « plage pleine d'algues ».`
      T.ask = `<strong>Essai 30 jours, sans carte.</strong> Ensuite, si ça vous sert : 79 €/mois ou 690 €/an. 100 % en ligne, à votre rythme.`
      T.ctaText = dh ? `Voir ${dh.beach} en direct · essai 30 j` : 'Voir mes plages · essai 30 j'
    }
  }
  const inner = `${brandHeader(T.hdrTitle, T.hdrSub, T.hdrFor)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6">${T.hi}</div>
    ${(L === 'fr' && dataSentence) ? `<div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">${dataSentence}</div>` : (c.hook ? `<div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">${c.hook}</div>` : '')}
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">${T.pain}</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">${T.flip}</div>
    <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px;background:#FBF7E9;border-radius:10px;padding:12px 14px">${T.proof}</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">${T.ask}</div>
    <div style="text-align:center;margin-top:18px">${cta(T.ctaText, pro)}</div>
    <div style="font-size:13px;color:#666;margin-top:14px">${T.orReply}</div>
  </div>`
  const s = shell(inner, c)
  return { subject, preheader, html: s.html, unsub: s.unsub }
}

function buildC4(c, key) {
  const domain = domainFor(c)
  const b = key ? `&b=${String(key).slice(0, 12)}` : ''
  const pro = `https://${domain}/pro/espace/?utm_source=email&utm_medium=b2b_cold&utm_campaign=c4${b}`
  const L = localeFor(c)
  const F = {
    fr: {
      subject: `Re: ${c.name} — vos plages, mesurées au satellite`,
      preheader: `Je vous envoie un rendu réel et daté de vos plages — dites-moi juste oui.`,
      hdrSub: 'Juste au cas où', hi: 'Bonjour,',
      l1: `Mon précédent message est peut-être passé sous la pile. La saison sargasses bat son plein — c'est maintenant que connaître la fin de l'histoire avant vos clients change tout.`,
      l2: `Je peux vous envoyer un <strong>rendu réel et daté de vos plages</strong> (mesuré au satellite, par régime, réussites comme limites). Et si ça vous parle, l'essai Pro 30 jours est gratuit, sans carte, en libre-service — vous activez en un clic.`,
      ctaText: 'Voir l’état de mes plages', orReply: 'Sinon, répondez « stop » et je ne vous écris plus.'
    },
    en: {
      subject: `Re: ${c.name} — your beaches, measured by satellite`,
      preheader: `I'll send you a real, dated readout of your beaches — just say yes.`,
      hdrSub: 'Just in case', hi: 'Hi,',
      l1: `My earlier note may have slipped under the pile. Sargassum season is in full swing — this is exactly when knowing the ending before your guests do changes everything.`,
      l2: `I can send you a <strong>real, dated readout of your beaches</strong> (satellite-measured, by regime, hits and limits alike). And if it speaks to you, the 30-day Pro trial is free, no card, fully self-serve — you start it in one click.`,
      ctaText: 'See my beaches now', orReply: 'Otherwise, reply “stop” and I won’t write again.'
    },
    es: {
      subject: `Re: ${c.name} — sus playas, medidas por satélite`,
      preheader: `Le envío una lectura real y fechada de sus playas — solo dígame que sí.`,
      hdrSub: 'Por si acaso', hi: 'Hola,',
      l1: `Quizás mi mensaje anterior quedó bajo la pila. La temporada de sargazo está en pleno apogeo — es justo cuando conocer el final antes que sus huéspedes lo cambia todo.`,
      l2: `Puedo enviarle una <strong>lectura real y fechada de sus playas</strong> (medida por satélite, por régimen, aciertos y límites). Y si le interesa, la prueba Pro de 30 días es gratuita, sin tarjeta, en autoservicio — la activa en un clic.`,
      ctaText: 'Ver mis playas ahora', orReply: 'Si no, responda “stop” y no le escribo más.'
    }
  }[L]
  const subject = F.subject
  const preheader = F.preheader
  const inner = `${brandHeader('Le Veilleur', F.hdrSub, '')}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6">${F.hi}</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">${F.l1}</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">${F.l2}</div>
    <div style="text-align:center;margin-top:18px">${cta(F.ctaText, pro)}</div>
    <div style="font-size:13px;color:#666;margin-top:14px">${F.orReply}</div>
  </div>`
  const s = shell(inner, c)
  return { subject, preheader, html: s.html, unsub: s.unsub }
}

async function main() {
  console.log('=== B2B cold outreach (warmup) ===')
  const ready = SEND && mailReady()
  if (!ready) console.log(SEND ? 'SMTP_PASS manquant — dry-run.' : 'Dry-run (pas de --send).')
  const src = loadJSON(SRC_PATH, { contacts: [] })
  const contacts = src.contacts || []
  const sent = loadJSON(SENT_PATH, {})
  const bounced = new Set((loadJSON(BOUNCED_PATH, []) || []).map(e => String(e).includes('@') ? emailHash(e) : e))
  // Exclure les installeurs de widget : ils reçoivent le mail CHAUD dédié
  // (widget-convert.cjs) — pas de double contact.
  const widgetCfg = loadJSON(path.join(__dirname, 'data', 'widget-contacts.json'), { contacts: {} })
  const widgetEmails = new Set(Object.values(widgetCfg.contacts || {}).map(w => (w.email || '').trim().toLowerCase()).filter(Boolean))

  // Cap du run = ramp auto basé sur l'âge de la campagne (1er envoi enregistré).
  const firstSend = sent._meta && sent._meta.firstSendAt
  const CAP_NEW = rampCap(firstSend)

  let newCount = 0, followCount = 0
  for (const c of contacts) {
    if (!c.email || !c.email.includes('@')) continue
    if (widgetEmails.has(c.email.trim().toLowerCase())) continue // → widget-convert.cjs
    const key = emailHash(c.email)
    if (bounced.has(key)) continue
    const rec = sent[key] || {}
    let step = null, built = null
    if (!rec.c0) {
      if (newCount >= CAP_NEW) continue            // warmup/ramp : plafond de nouveaux/run
      step = 'c0'; built = buildC0(c, key); newCount++
    } else if (!rec.c4 && daysSince(rec.c0) >= FOLLOWUP_DAYS) {
      step = 'c4'; built = buildC4(c, key); followCount++
    } else continue

    if (!ready) { console.log(`  ~ [${step}] ${logId(c.email)} ${c.name} — "${built.subject}"`); continue }
    const { data, error } = await sendEmail({ from: FROM, to: c.email, subject: built.subject, html: built.html, preheader: built.preheader, unsubUrl: built.unsub, replyTo: REPLY_TO })
    if (error) { console.log(`  x [${step}] ${logId(c.email)}: ${error.message}`); continue }
    console.log(`  + [${step}] ${logId(c.email)} ${c.name}`)
    rec[step] = new Date().toISOString()
    sent[key] = rec
    if (!sent._meta) sent._meta = {}
    if (!sent._meta.firstSendAt) sent._meta.firstSendAt = rec[step] // ancre le ramp
    saveJSON(SENT_PATH, sent)
  }
  console.log(ready ? `\nEnvoyé : ${newCount} neufs + ${followCount} relances.` : `\nDry-run : ${newCount} neufs (cap ${CAP_NEW}) + ${followCount} relances.`)
}
main().catch(e => { console.error(e); process.exit(1) })
