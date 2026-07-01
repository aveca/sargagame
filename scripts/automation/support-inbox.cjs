#!/usr/bin/env node
/**
 * support-inbox.cjs — service client email "Niveau 1", 100 % DÉTERMINISTE.
 * AUCUN appel à une API LLM/Claude, AUCUN token. Règles mots-clés + gabarits fixes.
 *
 * Tourne dans GitHub Actions (workflow support-inbox.yml). Lit la boîte alerte@
 * en IMAP, classe chaque nouvel email client (UNSEEN) par mots-clés FR/EN/ES, et :
 *   (a) envoie un ACCUSÉ DE RÉCEPTION au client (gabarit fixe, honnête, bilingue),
 *   (b) envoie au FONDATEUR un DIGEST privé (Gmail) avec, par message : l'adresse
 *       réelle du client, la catégorie, le subject, un snippet et une réponse
 *       suggérée (texte des gabarits support-reply). Le fondateur répond lui-même.
 *
 * IDEMPOTENCE = drapeau IMAP \Seen : on ne traite QUE les UNSEEN, et on marque
 * \Seen après traitement UNIQUEMENT en mode SEND (jamais en dry-run). Cap 50/run.
 *
 * HOLD par défaut : sans SEND=1 → DRY-RUN (compteurs + catégories seulement,
 * AUCUN envoi, AUCUN \Seen). Règle du repo (SMTP dry-run par défaut).
 *
 * PII (CRITIQUE) : repo PUBLIC → logs GH Actions PUBLICS. On ne logue JAMAIS une
 * adresse client ni un corps d'email. Seulement des compteurs et catégories. Les
 * adresses ne vont QUE dans l'accusé (au client) et le digest (au fondateur).
 *
 * Env :
 *   IMAP_PASS / SMTP_PASS  mot de passe de la boîte alerte@ (jamais loggué)
 *   FOUNDER_EMAIL          destinataire du digest (défaut hardcodé ci-dessous)
 *   SEND                   '1' pour envoyer + marquer \Seen ; sinon dry-run
 *   SEAL                   '1' = marque TOUS les UNSEEN actuels \Seen SANS rien
 *                          envoyer (scelle les messages déjà traités à la main
 *                          AVANT d'activer le cron en SEND=1, pour éviter un
 *                          accusé redondant). Priorité sur SEND. One-shot manuel.
 */
const fs = require('fs')
const path = require('path')
const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')
const { sendEmail, brandHeader } = require(path.join(__dirname, 'lib', 'email-send.cjs'))
const { emailHash } = require(path.join(__dirname, 'lib', 'email-hash.cjs'))

const SEND = process.env.SEND === '1'
const SEAL = process.env.SEAL === '1'
const CAP = 50

// IMAP — même boîte que l'envoi. Host/user/port non sensibles ; seul le pass l'est.
const IMAP_HOST = process.env.IMAP_HOST || 'premium115.web-hosting.com'
const IMAP_PORT = +(process.env.IMAP_PORT || 993)
const IMAP_USER = process.env.IMAP_USER || 'alerte@sargasses-martinique.com'
const IMAP_PASS = process.env.IMAP_PASS || process.env.SMTP_PASS || ''

// Résolution email fondateur — EXACTEMENT le mécanisme widget-install-watch.cjs :
// FOUNDER_EMAIL || ALERT_TO || <défaut hardcodé yacovassaraf déjà présent dans
// ux-watch.cjs / revenue-watch.cjs>.
const FOUNDER_EMAIL =
  process.env.FOUNDER_EMAIL || process.env.ALERT_TO || 'yacovassaraf@gmail.com'

const FROM = 'Sargasses <alerte@sargasses-martinique.com>'
const REPLY_TO = 'alerte@sargasses-martinique.com'

// ─── Classification par mots-clés (objet + corps, insensible casse, FR/EN/ES) ───
//     ORDRE = PRIORITÉ (premier match gagne) : le plus spécifique / le plus
//     sensible d'abord. Ex. « je veux un remboursement, les algues étaient là »
//     → refund (plus prioritaire) avant verdict. 'positive' AVANT le fallback mais
//     APRÈS les catégories de problème (un « merci » poli à la fin d'une plainte
//     ne doit pas masquer la plainte).
const RULES = [
  { cat: 'refund', re: /rembours|refund|reembolso|charge ?back|litige|conteste|contestaci[oó]n/i },
  { cat: 'verdict', re: /(algues?|sargass|seaweed|algas)[\s\S]{0,40}(pr[ée]sent|là|la plage|sale|partout|plein|beaucoup|everywhere|full of)|plage[\s\S]{0,20}(sale|d[ée]gueu|pourri)|(pas|non|jamais)[\s\S]{0,10}propre|pr[ée]vision[\s\S]{0,15}(faux|erron|fausse)|erron[ée]|inexact|wrong|inaccurate|not accurate|equivocad|incorrect/i },
  { cat: 'cancel', re: /annul|r[ée]sili|se d[ée]sabonn|d[ée]sinscri|unsubscribe|\bcancel\b|cancelar|desactiv|arr[êe]ter mon abonn/i },
  { cat: 'access', re: /acc[eè]s|marche pas|ne fonctionne|pas re[çc]u|connect|login|access|no funciona|sin acceso|restaur/i },
  { cat: 'billing', re: /facture|re[çc]u|invoice|receipt|double[\s\S]{0,10}(pr[ée]l|charg)|factura|comprobante|paiement[\s\S]{0,20}(question|probl)/i },
  { cat: 'bug', re: /\bbug\b|plante|crash|erreur[\s\S]{0,15}app|ne charge|[ée]cran (blanc|noir)|white screen|se ferme tout seul|no carga|se cierra|no abre/i },
  { cat: 'partner', re: /partenariat|\bpartner\b|h[ôo]tel|collectivit|mairie|office de tourisme|widget|\bb2b\b|collabor|sponsor|presse|\bpress\b|journalist|m[ée]dia|interview/i },
  { cat: 'positive', re: /\bmerci\b|super app|g[ée]nial|bravo|f[ée]licitation|excellent|love (it|your|this)|great app|thank you|\bthanks\b|gracias|excelente|me encanta/i },
]
function classify(text) {
  for (const r of RULES) if (r.re.test(text)) return r.cat
  return 'feedback'
}

// Signaux d'URGENCE (litige/colère/menace) → remontés en TÊTE du digest, marqués.
const URGENT_RE = /arnaque|scam|escro|\bfraud|avocat|lawyer|plainte|police|proc[èe]s|inadmissible|scandal|honteux|remboursez[- ]moi|charge ?back|voleur|inacceptable/i

// Rang de priorité pour trier le digest (0 = le plus urgent en tête).
function prio(it) {
  if (it.urgent) return 0
  return { refund: 1, verdict: 2, billing: 3, bug: 3, cancel: 4, access: 4, partner: 5, feedback: 6, positive: 7 }[it.cat] ?? 6
}

// ─── Détection du BRUIT MACHINE : bounces (Mailer-Daemon / DSN) + auto-réponses
//     (postmaster "not monitored", out-of-office, accusés automatiques). Ces
//     messages ne sont PAS des clients : sans ce filtre, on leur renvoie un accusé
//     "On a bien reçu votre message" (ping-pong de robots, réputation d'envoi
//     dégradée) et on pollue le digest fondateur avec de faux "feedback".
//     Priorité aux HEADERS (RFC 3834 = fiable), fallback sur l'expéditeur + objet.
//     Renvoie le TYPE : 'bounce' (échec de remise, DSN) | 'auto' (auto-réponse) |
//     '' (vrai message client). Priorité aux HEADERS (RFC 3834), fallback from+objet.
//     Le type 'bounce' déclenche en plus l'extraction de l'adresse en échec pour la
//     liste de suppression (on arrête de ré-emailer une adresse morte). ───
function machineNoiseType(parsed, from, subject) {
  const f = String(from || '').toLowerCase()
  let raw = ''
  try {
    if (Array.isArray(parsed.headerLines)) raw = parsed.headerLines.map(h => h.line || '').join('\n')
  } catch { /* headers absents : on retombe sur from/objet ci-dessous */ }
  const s = String(subject || '')
  // ── BOUNCE (échec de remise) ──
  if (!f || !f.includes('@')) return 'bounce' // enveloppe nulle = bounce
  if (/^(mailer-daemon|mdaemon|bounce|bounces)@/.test(f) || f.includes('mailer-daemon')) return 'bounce'
  if (/^content-type:\s*multipart\/report/im.test(raw) && /report-type=["']?delivery-status/im.test(raw)) return 'bounce'
  if (/undeliverable|mail delivery (failed|subsystem)|delivery status notification|delivery has failed|returned mail|failure notice|non[- ]?remis|delivery incomplete/i.test(s)) return 'bounce'
  // ── AUTO-RÉPONSE (vacances, accusé automatique, postmaster, no-reply) ──
  if (/^(postmaster|no-?reply|noreply|donotreply|do-not-reply)@/.test(f)) return 'auto'
  if (/^auto-submitted:\s*(?!no\b)/im.test(raw)) return 'auto'
  if (/^x-auto-response-suppress:/im.test(raw)) return 'auto'
  if (/^precedence:\s*(auto_reply|bulk|junk|list)/im.test(raw)) return 'auto'
  if (/automatic reply|auto[- ]?reply|out of office|absence du bureau|r[ée]ponse automatique|respuesta autom[aá]tica|fuera de (la )?oficina/i.test(s)) return 'auto'
  return ''
}
// Back-compat + lisibilité : booléen « faut-il ignorer ce message ? ».
function isMachineNoise(parsed, from, subject) { return !!machineNoiseType(parsed, from, subject) }

// Extrait les adresses destinataires en ÉCHEC d'un bounce/DSN (Final-Recipient,
// RCPT TO, « address(es) failed »). Exclut notre propre boîte et les robots.
// Retourne des adresses en clair (jamais logguées : hachées avant persistance).
function extractBouncedRecipients(parsed) {
  const body = `${parsed.subject || ''}\n${parsed.text || ''}`
  const out = new Set()
  const patterns = [
    /final-recipient:\s*rfc822;\s*<?([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})>?/ig,
    /rcpt to:\s*<?([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})>?/ig,
    /(?:address(?:\(es\))?\s+failed|failed:|to)\s*:?\s*<?([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})>?/ig,
    /<([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})>/ig,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(body))) {
      const a = m[1].toLowerCase().replace(/[.,;>]+$/, '')
      // Jamais notre propre adresse/domaine (elle apparaît comme expéditeur du DSN),
      // ni un robot (mailer-daemon/postmaster).
      if (a.endsWith('@sargasses-martinique.com')) continue
      if (a.includes('mailer-daemon') || a.startsWith('postmaster@')) continue
      out.add(a)
    }
  }
  return [...out]
}

// HTML → texte brut (échappe rien : on n'imprime jamais le corps client en log).
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Gabarit ACCUSÉ DE RÉCEPTION (client) — fixe, court, honnête, FR + ligne EN.
//     AUCUNE promesse de remboursement. ───
function ackTemplate() {
  const kicker = 'Message bien reçu'
  const title = 'On a bien reçu votre message'
  const html = `${brandHeader(kicker, title, 'On regarde la mer pour vous.')}
  <div style="font-size:15px;line-height:1.7;color:#23323a">
    <p>Bonjour,</p>
    <p>On a bien reçu votre message et on revient vers vous très vite. Merci d'avoir
       pris le temps de nous écrire — un humain va le lire et vous répondre
       personnellement.</p>
    <p style="color:#686868;font-size:13px;margin-top:18px">
      <em>We've received your message and will get back to you very soon. Thanks for
      reaching out.</em></p>
    <p style="margin-top:18px">Le Veilleur — Sargasses</p>
  </div>`
  return {
    subject: 'On a bien reçu votre message — Sargasses',
    html,
    preheader: 'Bien reçu, on revient vers vous très vite. / Received, we\'ll reply soon.',
  }
}

// ─── Réponse SUGGÉRÉE pour le fondateur (gabarits déterministes, FR + ligne EN,
//     honnêtes : aucune promesse de remboursement auto, aucun claim non hedgé). Le
//     fondateur adapte 2-3 mots puis envoie depuis alerte@ (ou via support-reply.cjs).
//     Le moat (honnêteté) prime : la réponse "verdict" renvoie à /fiabilite/ et à la
//     donnée satellite, jamais à un chiffre inventé. ───
const SEND_HINT = (kind) => `\n→ Adapter, puis répondre depuis alerte@ (ou : SEND=1 KIND=${kind} TO=<client> node scripts/automation/support-reply.cjs)`
const REPLIES = {
  access: {
    kind: 'jc_access / access_generic (support-reply.cjs)',
    text:
      "Toutes mes excuses pour la gêne. Après notre passage à un nouveau système de paiement, " +
      "l'accès de certains Pass ne se retrouvait pas automatiquement sur un autre téléphone/navigateur " +
      "que celui du paiement. C'est corrigé — le Pass est valide, rien à repayer. Pour récupérer l'accès : " +
      "ouvrir l'app → toucher une plage → le cadenas/« Premium » → « Déjà payé ? Restaurer mon accès » → " +
      "entrer l'e-mail du paiement. Si l'accès ne revient pas, répondez à ce message : je règle ça " +
      "personnellement, et si besoin je rembourse.\n" +
      "→ Envoyer via : SEND=1 KIND=access_generic TO=<client> REGION=<martinique|guadeloupe> node scripts/automation/support-reply.cjs",
  },
  verdict: {
    kind: 'VERDICT/exactitude — HONNÊTETÉ (le moat)',
    text:
      "⚠️ Sujet sensible (c'est notre moat). Merci de nous l'avoir signalé, et désolé pour la déception. " +
      "Notre verdict vient de la donnée satellite (ERDDAP), pas d'une estimation — mais aucune prévision " +
      "n'est parfaite : on publie d'ailleurs notre taux d'erreur daté sur /fiabilite/, et la confiance " +
      "affichée est plus basse sur les rares alertes. Pouvez-vous me préciser la plage et la date exactes ? " +
      "Je vérifie ce qu'on avait prévu ce jour-là et je reviens vers vous. " +
      "(NE PAS inventer de chiffre ; renvoyer vers /fiabilite/.)" + SEND_HINT('julien_ux'),
  },
  cancel: {
    kind: 'annulation / désabonnement',
    text:
      "Bien sûr, aucun souci. S'il s'agit d'un Pass : il est ponctuel (one-time), il n'y a rien à résilier, " +
      "il n'y aura pas d'autre prélèvement. Pour ne plus recevoir nos e-mails : le lien « se désabonner » " +
      "en bas de chaque message est en un clic. Si vous parlez d'un ancien abonnement mensuel, dites-le-moi " +
      "et je l'arrête tout de suite." + SEND_HINT('julien_ux'),
  },
  billing: {
    kind: 'facturation / reçu',
    text:
      "Merci, je regarde ça tout de suite. Pouvez-vous me confirmer l'e-mail utilisé au paiement ? " +
      "Je retrouve la transaction et je vous renvoie le reçu (ou je clarifie le montant). En cas de double " +
      "prélèvement, je corrige et je rembourse la différence." + SEND_HINT('julien_ux'),
  },
  bug: {
    kind: 'bug technique',
    text:
      "Merci pour le signalement, ça aide vraiment à améliorer l'app. Pour que je reproduise : sur quel " +
      "téléphone/navigateur, et à quel écran ça bloque ? En attendant, un rechargement de la page " +
      "(ou réinstaller le raccourci sur l'écran d'accueil) débloque souvent l'affichage." + SEND_HINT('julien_ux'),
  },
  partner: {
    kind: 'partenariat / presse — self-serve',
    text:
      "Avec plaisir. Tout est en libre-service, sans rendez-vous : l'espace pro (essai 30 j gratuit, sans " +
      "carte) est sur /pro/espace/. Pour la presse, je peux fournir un accès démo + nos chiffres de fiabilité " +
      "(/fiabilite/). Dites-moi ce qui vous serait utile et je vous envoie le lien." + SEND_HINT('julien_ux'),
  },
  positive: {
    kind: 'positif / merci',
    text:
      "Merci beaucoup, ça fait très plaisir à lire ! Si l'app vous est utile, le meilleur coup de pouce " +
      "c'est d'en parler autour de vous — ou de l'installer sur l'écran d'accueil pour recevoir l'alerte " +
      "de la veille. Bonne mer 🌊" + SEND_HINT('julien_ux'),
  },
  feedback: {
    kind: 'julien_ux (support-reply.cjs) — générique retour produit',
    text:
      "Merci beaucoup, c'est un retour très utile. On prend en compte et on améliore l'app. " +
      "Merci d'avoir pris le temps, ça aide vraiment.\n" +
      "→ Adapter le contenu au retour, puis : SEND=1 KIND=julien_ux TO=<client> node scripts/automation/support-reply.cjs",
  },
  refund: {
    kind: 'REMBOURSEMENT — décision = TOI (pas de gabarit auto)',
    text:
      "⚠️ Décision de remboursement = toi. NE PAS promettre de remboursement automatiquement. " +
      "Politique bornée : remboursement justifié surtout si le client n'a jamais pu accéder au service " +
      "(cf. réponse access : « vous ne paierez jamais pour un service auquel vous n'accédez pas »). " +
      "Sinon, évaluer au cas par cas avant de t'engager. Répondre depuis alerte@ une fois la décision prise.",
  },
}
function suggestedReply(cat) { return REPLIES[cat] || REPLIES.feedback }

// ─── DIGEST fondateur (un email par run). Contient les adresses réelles. ───
function digestTemplate(items, noiseCount = 0) {
  // Tri par priorité : urgents + remboursement/verdict en tête, positif/feedback en bas.
  const sorted = [...items].sort((a, b) => prio(a) - prio(b))
  const rows = sorted.map((it, i) => {
    const sg = suggestedReply(it.cat)
    const badge = it.urgent
      ? '<span style="background:#C0392B;color:#fff;font-size:11px;font-weight:800;padding:2px 7px;border-radius:5px;letter-spacing:.06em">⚠️ URGENT</span> '
      : ''
    const chipColor = it.urgent ? '#C0392B' : '#FFC72C'
    return `<div style="border:1px solid ${it.urgent ? '#E7B7B0' : '#E4E0D6'};border-radius:10px;padding:14px 16px;margin:12px 0;background:#fff">
      <div style="font-size:12px;font-weight:800;color:${chipColor};text-transform:uppercase;letter-spacing:.1em">${badge}#${i + 1} · ${esc(it.cat)}</div>
      <div style="font-size:15px;margin-top:6px"><strong>De :</strong> ${esc(it.from)}</div>
      <div style="font-size:15px;margin-top:2px"><strong>Objet :</strong> ${esc(it.subject) || '(sans objet)'}</div>
      <div style="font-size:14px;color:#444;margin-top:8px;line-height:1.5"><strong>Extrait :</strong> ${esc(it.snippet) || '(vide)'}</div>
      <div style="font-size:13px;color:#0E7C66;margin-top:10px;font-weight:700">Réponse suggérée — ${esc(sg.kind)}</div>
      <div style="font-size:13px;color:#444;margin-top:4px;line-height:1.55;white-space:pre-line">${esc(sg.text)}</div>
    </div>`
  }).join('')
  const counts = items.reduce((a, it) => { a[it.cat] = (a[it.cat] || 0) + 1; return a }, {})
  const summary = Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ')
  const html = `${brandHeader('Service client', `${items.length} message(s) à traiter`, summary)}
  <div style="font-size:15px;line-height:1.6;color:#23323a">
    <p>Voici les nouveaux messages reçus sur <strong>alerte@</strong>. Un accusé de
       réception a été envoyé à chaque client. À toi de répondre depuis la boîte
       (les adresses sont ci-dessous).</p>
    ${rows}
    ${noiseCount ? `<p style="color:#9a8f78;font-size:13px;margin-top:6px">🤖 ${noiseCount} message(s) machine ignoré(s) (bounces / auto-réponses) — ni accusé ni action requise.</p>` : ''}
    <p style="color:#686868;font-size:13px;margin-top:18px">Classé par mots-clés (déterministe, zéro IA) · accusé auto envoyé aux clients · marqué lu en IMAP.</p>
  </div>`
  return {
    subject: `📬 Support : ${items.length} message(s) — ${summary}`,
    html,
    preheader: `${items.length} message(s) client à traiter : ${summary}.`,
  }
}

async function main() {
  if (!IMAP_PASS) {
    console.error('IMAP_PASS / SMTP_PASS absent — impossible de se connecter à la boîte. (mot de passe jamais loggué)')
    process.exit(1)
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false, // ne JAMAIS laisser imapflow logguer (fuite PII/creds)
    socketTimeout: 60000,
    greetingTimeout: 20000,
  })

  try {
    await client.connect()
  } catch (e) {
    console.error('Connexion/auth IMAP échouée :', e && e.message ? e.message : 'erreur inconnue')
    process.exit(1)
  }

  // ── Mode SEAL (priorité sur SEND) : marque TOUS les UNSEEN actuels \Seen sans
  //    rien envoyer ni classer. Sert à sceller les messages déjà traités à la main
  //    (ex. JC, julien) AVANT d'activer le cron en SEND=1, pour ne PAS leur envoyer
  //    d'accusé redondant. Aucun cap : on scelle l'inbox entière. Zéro PII loggué.
  if (SEAL) {
    let lockS
    let sealed = 0
    try {
      lockS = await client.getMailboxLock('INBOX')
      const uids = await client.search({ seen: false }, { uid: true })
      if (uids && uids.length) {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
        sealed = uids.length
      }
    } catch (e) {
      console.error('[support-inbox] SEAL — échec marquage \\Seen :', e && e.message)
    } finally {
      if (lockS) lockS.release()
    }
    console.log(`[support-inbox] SEAL — ${sealed} message(s) UNSEEN scellé(s) \\Seen (aucun envoi).`)
    await client.logout()
    return
  }

  const items = [] // {uid, from, subject, snippet, cat, urgent}
  const noiseUids = [] // bounces / auto-réponses : marqués \Seen, jamais ackés ni digérés
  const bouncedFound = new Set() // adresses en échec extraites des DSN → suppression
  let lock
  try {
    lock = await client.getMailboxLock('INBOX')
    // UNSEEN seulement = idempotence.
    const uids = await client.search({ seen: false }, { uid: true })
    const todo = (uids || []).slice(0, CAP)

    for (const uid of todo) {
      let msg
      try {
        msg = await client.fetchOne(uid, { source: true }, { uid: true })
      } catch { continue }
      if (!msg || !msg.source) continue
      let parsed
      try { parsed = await simpleParser(msg.source) } catch { continue }

      const from = (parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].address) || ''
      const subject = parsed.subject || ''
      // Bruit machine (bounce/DSN/auto-réponse) → sceller, jamais acké ni digéré.
      // Un bounce nourrit en plus la liste de suppression (adresse morte).
      const noiseType = machineNoiseType(parsed, from, subject)
      if (noiseType) {
        noiseUids.push(uid)
        if (noiseType === 'bounce') for (const a of extractBouncedRecipients(parsed)) bouncedFound.add(a)
        continue
      }
      const body = (parsed.text || '').replace(/\s+/g, ' ').trim()
      const snippet = body.slice(0, 400)
      const cat = classify(`${subject}\n${body}`)
      const urgent = URGENT_RE.test(`${subject}\n${body}`)
      items.push({ uid, from, subject, snippet, cat, urgent })
    }
  } finally {
    if (lock) lock.release()
  }

  // Compteurs SEULEMENT (zéro PII).
  const counts = items.reduce((a, it) => { a[it.cat] = (a[it.cat] || 0) + 1; return a }, {})
  const summary = Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ') || '(aucune)'
  console.log(`[support-inbox] ${items.length} message(s) UNSEEN traité(s) — catégories : ${summary} · ${noiseUids.length} bruit machine ignoré(s) · ${bouncedFound.size} adresse(s) en échec vue(s)`)

  if (!SEND) {
    console.log('[support-inbox] DRY-RUN — aucun envoi, aucun \\Seen. (Passer SEND=1 pour activer.)')
    await client.logout()
    return
  }

  // ── SEND : sceller d'abord le bruit machine (bounces/auto-réponses) en \Seen —
  //    JAMAIS d'accusé ni de ligne actionnable, mais on évite de le re-traiter
  //    tous les 3 h. Fait même si aucun message client à traiter. Zéro PII loggué.
  if (noiseUids.length) {
    let lockN
    try {
      lockN = await client.getMailboxLock('INBOX')
      await client.messageFlagsAdd(noiseUids, ['\\Seen'], { uid: true })
      console.log(`[support-inbox] ${noiseUids.length} message(s) machine marqué(s) \\Seen (ni accusé ni digest)`)
    } catch (e) {
      console.error('[support-inbox] échec marquage \\Seen bruit machine :', e && e.message)
    } finally {
      if (lockN) lockN.release()
    }
  }

  // ── SEND : nourrir la liste de suppression avec les adresses en échec vues dans
  //    les bounces (on arrête de ré-emailer une adresse morte = réputation protégée).
  //    Hashes SEULEMENT (RGPD, même format que check-email-status.cjs). Le commit du
  //    fichier est fait par l'étape git du workflow support-inbox.yml. Zéro PII loggué.
  if (bouncedFound.size) {
    try {
      const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
      let list = []
      try { list = JSON.parse(fs.readFileSync(BOUNCED_PATH, 'utf-8')) } catch { list = [] }
      const existing = new Set((Array.isArray(list) ? list : []).map(e => String(e).includes('@') ? emailHash(e) : e))
      let added = 0
      for (const a of bouncedFound) { const h = emailHash(a); if (!existing.has(h)) { existing.add(h); added++ } }
      if (added) {
        fs.mkdirSync(path.dirname(BOUNCED_PATH), { recursive: true })
        fs.writeFileSync(BOUNCED_PATH, JSON.stringify([...existing], null, 2))
      }
      console.log(`[support-inbox] suppression : ${added} adresse(s) en échec ajoutée(s) (hash) / ${bouncedFound.size} vue(s)`)
    } catch (e) {
      console.error('[support-inbox] échec mise à jour liste de suppression :', e && e.message)
    }
  }

  if (!items.length) { await client.logout(); return }

  // ── Mode SEND ──
  const { mailReady } = require(path.join(__dirname, 'lib', 'email-send.cjs'))
  if (!mailReady()) {
    console.error('[support-inbox] SMTP_PASS absent côté envoi — rien envoyé, aucun \\Seen.')
    await client.logout()
    process.exit(1)
  }

  // 1) Accusé de réception à chaque client (qui a une adresse valide).
  const ack = ackTemplate()
  let ackOk = 0, ackFail = 0
  for (const it of items) {
    if (!it.from || !it.from.includes('@')) { ackFail++; continue }
    const { error } = await sendEmail({
      from: FROM, to: it.from,
      subject: ack.subject, html: ack.html, preheader: ack.preheader,
      replyTo: REPLY_TO,
    })
    if (error) ackFail++; else ackOk++
  }
  console.log(`[support-inbox] accusés : ${ackOk} envoyé(s), ${ackFail} échec/sans-adresse`)

  // 2) Digest fondateur (un seul email).
  const dig = digestTemplate(items, noiseUids.length)
  const { error: digErr } = await sendEmail({
    from: FROM, to: FOUNDER_EMAIL,
    subject: dig.subject, html: dig.html, preheader: dig.preheader,
    replyTo: REPLY_TO,
  })
  console.log(`[support-inbox] digest fondateur : ${digErr ? 'ÉCHEC (' + (digErr.message || 'err') + ')' : 'envoyé ✓'}`)

  // 3) Marquer \Seen — UNIQUEMENT en SEND, après traitement.
  let lock2
  try {
    lock2 = await client.getMailboxLock('INBOX')
    const uids = items.map(it => it.uid)
    if (uids.length) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
    console.log(`[support-inbox] ${uids.length} message(s) marqué(s) \\Seen`)
  } catch (e) {
    console.error('[support-inbox] échec marquage \\Seen :', e && e.message)
  } finally {
    if (lock2) lock2.release()
  }

  await client.logout()
}

// Exécution directe seulement (require.main) → permet de require ce module pour
// tester isMachineNoise/classify sans déclencher la connexion IMAP.
if (require.main === module) {
  main().catch((e) => {
    // Ne jamais logguer un objet d'erreur brut (peut contenir des headers/PII).
    console.error('[support-inbox] ERREUR :', e && e.message ? e.message : 'erreur inconnue')
    process.exit(1)
  })
}

module.exports = { isMachineNoise, machineNoiseType, classify, prio, suggestedReply, extractBouncedRecipients, URGENT_RE }
