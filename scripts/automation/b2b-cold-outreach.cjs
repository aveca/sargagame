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
const { inferType, dataHook, liveProof, regionOf } = require('./lib/b2b-segment.cjs')

const UNIFIED_PATH = path.join(__dirname, 'data', 'b2b-contacts-unified.json')
const SRC_PATH = fs.existsSync(UNIFIED_PATH) ? UNIFIED_PATH : path.join(__dirname, 'data', 'b2b-enriched.json')
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

// Écarte les adresses non délivrables / pièges AVANT l'envoi : réduit bounces &
// plaintes = protège la réputation du domaine partagé. On GARDE les adresses B2B
// légitimes (contact@/info@/reservation@/reception@…), on n'écarte QUE l'infra
// technique (postmaster, abuse, no-reply, mailer-daemon…) et les syntaxes invalides.
const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i
const ROLE_LOCAL = /^(postmaster|abuse|mailer-daemon|maildaemon|mailer|no-?reply|noreply|donotreply|do-not-reply|bounce|bounces|root|hostmaster|webmaster|spam|nobody|devnull)@/i
function isSendableEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  return EMAIL_RE.test(e) && !ROLE_LOCAL.test(e)
}

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
  const pf = liveProof(regionOf(c.island))          // preuve fraîche et strictement régionale, sinon null
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
  // Aucun chiffre de fiabilité n'est utilisé sans registre frais et mono-région.
  // Les agrégats MQ+GP et les preuves d'une autre région ne sont pas transposés au prospect.
  const proofFr = pf
    ? `Registre de validation public pour ${pf.region.toUpperCase()}, sur la période ${pf.from} → ${pf.to} : <strong>${pf.pct} %</strong> des prévisions « mer propre » vérifiées en saison calme (${Number(pf.n).toLocaleString('fr-FR')} comparaisons). Ce résultat porte uniquement sur cet échantillon ; ce n'est pas une garantie plage par plage.`
    : `Aucun taux de fiabilité n'est avancé dans ce message : le registre disponible n'est pas à la fois frais, complet et strictement régional. Nous pourrons partager un relevé daté lorsque ces preuves seront disponibles.`
  const proofEn = pf
    ? `Public validation record for ${pf.region.toUpperCase()}, covering ${pf.from} → ${pf.to}: <strong>${pf.pct}%</strong> of calm-season "clean-sea" forecasts verified (${Number(pf.n).toLocaleString('en-US')} comparisons). This result applies only to that sample; it is not a beach-by-beach guarantee.`
    : `No reliability rate is quoted in this message: the available record is not both fresh, complete and strictly regional. We can share a dated readout when that evidence is available.`
  const proofEs = pf
    ? `Registro público de validación para ${pf.region.toUpperCase()}, del ${pf.from} al ${pf.to}: <strong>${pf.pct} %</strong> de los pronósticos de "mar limpio" verificados en temporada calmada (${Number(pf.n).toLocaleString('es-ES')} comparaciones). El resultado se limita a esa muestra; no garantiza cada playa.`
    : `Este mensaje no cita una tasa de fiabilidad: el registro disponible no es a la vez reciente, completo y estrictamente regional. Podemos compartir un informe fechado cuando esas pruebas estén disponibles.`

  const subject = L === 'en' ? `${c.name} — dated beach observations`
    : L === 'es' ? `${c.name} — observaciones de playa fechadas`
    : seg === 'collectivite'
      ? (dh && dh.navoid > 0 ? `Sur vos ${dh.nbeaches} plages, ${dh.navoid} étaient à éviter la semaine dernière` : `Observations datées pour vos plages — ${place}`)
      : (dh && dh.avoidDays > 0 ? `${dh.beach} : ${dh.avoidDays} jour(s) à éviter la semaine dernière` : `${c.name} — dernières observations de vos plages`)
  const preheader = L === 'en' ? `Latest published beach observations, with timestamp and confidence; forecasts only when inputs pass validation.`
    : L === 'es' ? `Últimas observaciones publicadas, con fecha y confianza; pronósticos solo cuando las entradas pasan la validación.`
    : seg === 'collectivite'
      ? `Observations datées plage par plage ; prévisions seulement lorsque les données passent les contrôles.`
      : `Dernières observations publiées, avec horodatage et confiance ; prévisions seulement si les entrées sont validées.`
  const T = {
    fr: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Vos plages, mesurées au satellite', hdrFor: `Pour ${c.name}, ${place}`,
      hi: 'Bonjour,',
      pain: `Je fais <strong>Le Veilleur</strong> — un projet indépendant qui publie les dernières observations AFAI disponibles plage par plage. Elles sont distribuées via NOAA/AOML ERDDAP à partir de données source du laboratoire USF. Chaque lecture est accompagnée de son horodatage et de son niveau de confiance ; la source est intermittente et un verdict actuel est suspendu lorsque l'observation est trop ancienne.`,
      flip: `Un aperçu prévisionnel n'est présenté que lorsque l'observation et les entrées de vent et de courant passent les contrôles. Les jours 4 à 7 décrivent une tendance, pas une certitude ; Aucune alerte anticipée n'est garantie.`,
      proof: '',
      ask: `<strong>Essai 30 jours, sans carte.</strong> Le widget et les alertes par plage sont disponibles lorsque les données correspondantes sont disponibles et validées. Ensuite, si cela vous sert : 79 €/mois ou 690 €/an. Voici les dernières observations publiées, avec leur date et leur confiance.`,
      ctaText: 'Consulter les observations · essai 30 j',
      orReply: 'Ou répondez simplement « ok » et je vous envoie un relevé daté de vos plages.'
    },
    en: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Your beaches, measured by satellite', hdrFor: `For ${c.name}, ${place}`,
      hi: 'Hi,',
      pain: `I run <strong>Le Veilleur</strong> — an independent project publishing the latest available AFAI beach observations. They are distributed through NOAA/AOML ERDDAP from USF source data. Each reading includes its observation timestamp and confidence; the source is intermittent, and we withhold a current verdict when an observation is too old.`,
      flip: `A forecast is shown only when the observation and wind/current inputs pass validation. Days 4–7 are a trend, not a guarantee; No advance alert is guaranteed.`,
      proof: '',
      ask: `The Pro offer includes a <strong>free 30-day trial, no card</strong>; the widget and per-beach alerts are available when their data pass validation. Then €79/mo or €690/yr if it is useful. Here are the latest published observations, with their timestamps and confidence levels.`,
      ctaText: 'Review dated observations · 30-day trial',
      orReply: 'Or just reply “ok” and I’ll send you a dated readout of your beaches.'
    },
    es: {
      hdrTitle: 'Le Veilleur', hdrSub: 'Sus playas, medidas por satélite', hdrFor: `Para ${c.name}, ${place}`,
      hi: 'Hola,',
      pain: `Soy <strong>Le Veilleur</strong>, un proyecto independiente que publica las últimas observaciones AFAI disponibles para cada playa. Se distribuyen a través de NOAA/AOML ERDDAP a partir de datos de origen del laboratorio USF. Cada lectura incluye su fecha y nivel de confianza; la fuente es intermitente y se suspende un veredicto actual cuando la observación es demasiado antigua.`,
      flip: `El pronóstico solo se muestra cuando la observación y los datos de viento y corriente pasan la validación. Los días 4–7 son una tendencia, no una garantía; No se garantiza una alerta anticipada.`,
      proof: '',
      ask: `La oferta Pro incluye una <strong>prueba gratuita de 30 días, sin tarjeta</strong>; el widget y las alertas por playa están disponibles cuando sus datos pasan la validación. Después, 79 €/mes o 690 €/año si le resulta útil. Aquí están las últimas observaciones publicadas, con fecha y confianza.`,
      ctaText: 'Consultar observaciones · prueba 30 d',
      orReply: 'O responda simplemente “ok” y le envío una lectura fechada de sus playas.'
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
      T.flip = `Pour planifier le ramassage, un aperçu de tendance n'est présenté que lorsque les observations et les entrées de vent et de courant passent les contrôles. Les jours 4–7 restent une tendance, pas une certitude. Aucune arrivée d'algues ni alerte préalable n'est garantie.`
      T.ask = `L'essai Pro de 30 jours, sans carte, donne accès au widget et aux alertes par plage lorsque les données sont disponibles et validées. Ensuite : 79 €/mois ou 690 €/an si le service vous est utile.`
      T.ctaText = dh ? `Consulter vos ${dh.nbeaches} plages · essai 30 j` : 'Consulter vos observations · essai 30 j'
    } else {
      T.flip = `Un aperçu prévisionnel n'est présenté que lorsque l'observation et les entrées de vent et de courant passent les contrôles. Les jours 4 à 7 décrivent une tendance, pas une certitude ; Aucune alerte anticipée n'est garantie.`
      T.ctaText = dh ? `Consulter ${dh.beach} · essai 30 j` : 'Consulter mes observations · essai 30 j'
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
      preheader: `Je vous envoie un relevé daté de vos plages, avec horodatage et confiance — dites-moi simplement oui.`,
      hdrSub: 'Juste au cas où', hi: 'Bonjour,',
      l1: `Mon précédent message est peut-être passé sous la pile. La dernière observation publiée peut donner à votre équipe un repère plage par plage, avec sa date et son niveau de confiance — et préciser ce qui reste inconnu.`,
      l2: `Je peux vous envoyer un <strong>relevé réel et daté de vos plages</strong> (observation satellitaire, horodatage, confiance, réussites et limites). Si cela vous intéresse, l'essai Pro de 30 jours est gratuit, sans carte, en libre-service.`,
      ctaText: 'Voir les dernières observations', orReply: 'Sinon, répondez « stop » et je ne vous écris plus.'
    },
    en: {
      subject: `Re: ${c.name} — your beaches, measured by satellite`,
      preheader: `A dated beach readout with observation timestamps and confidence — just say yes.`,
      hdrSub: 'Just in case', hi: 'Hi,',
      l1: `My earlier note may have slipped under the pile. The latest published observation can give your team a dated, beach-level reference, with its timestamp and confidence — while making clear what is not known.`,
      l2: `I can send you a <strong>real, dated readout of your beaches</strong> (satellite observation, timestamp, confidence, strengths and limitations). If useful, the Pro 30-day trial is free, requires no card and is self-serve.`,
      ctaText: 'View latest observations', orReply: 'Otherwise, reply “stop” and I won’t write again.'
    },
    es: {
      subject: `Re: ${c.name} — sus playas, medidas por satélite`,
      preheader: `Un informe fechado con hora de observación y confianza — solo dígame que sí.`,
      hdrSub: 'Por si acaso', hi: 'Hola,',
      l1: `Quizás mi mensaje anterior quedó bajo la pila. La última observación publicada puede dar a su equipo una referencia por playa, con fecha y nivel de confianza, y dejar claro qué información aún se desconoce.`,
      l2: `Puedo enviarle una <strong>lectura real y fechada de sus playas</strong> (observación satelital, fecha, confianza, aciertos y límites). Si le interesa, la prueba Pro de 30 días es gratuita, sin tarjeta y en autoservicio.`,
      ctaText: 'Ver últimas observaciones', orReply: 'Si no, responda “stop” y no le escribo más.'
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
  let skipped = 0
  for (const c of contacts) {
    if (!isSendableEmail(c.email)) { skipped++; continue } // syntaxe invalide ou adresse infra/piège
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
  console.log(ready ? `\nEnvoyé : ${newCount} neufs + ${followCount} relances (${skipped} adresses écartées).` : `\nDry-run : ${newCount} neufs (cap ${CAP_NEW}) + ${followCount} relances (${skipped} adresses écartées).`)
}
// Exécution directe seulement → permet de require ce module (ex. tester isSendableEmail).
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })

module.exports = { isSendableEmail, rampCap, buildC0, buildC4 }
