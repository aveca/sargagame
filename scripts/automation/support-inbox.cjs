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
const path = require('path')
const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')
const { sendEmail, brandHeader } = require(path.join(__dirname, 'lib', 'email-send.cjs'))

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
const RULES = [
  { cat: 'refund', re: /rembours|refund|reembolso/i },
  { cat: 'access', re: /acc[eè]s|marche pas|ne fonctionne|pas re[çc]u|connect|login|access|no funciona|sin acceso/i },
]
function classify(text) {
  for (const r of RULES) if (r.re.test(text)) return r.cat
  return 'feedback'
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

// ─── Réponse SUGGÉRÉE pour le fondateur (texte des gabarits support-reply.cjs).
//     access → jc_access/access_generic ; feedback → julien_ux ; refund → note
//     "décision remboursement = toi" + politique bornée. ───
function suggestedReply(cat) {
  if (cat === 'access') {
    return {
      kind: 'jc_access / access_generic (support-reply.cjs)',
      text:
        "Toutes mes excuses pour la gêne. Après notre passage à un nouveau système de paiement, " +
        "l'accès de certains Pass ne se retrouvait pas automatiquement sur un autre téléphone/navigateur " +
        "que celui du paiement. C'est corrigé — le Pass est valide, rien à repayer. Pour récupérer l'accès : " +
        "ouvrir l'app → toucher une plage → le cadenas/« Premium » → « Déjà payé ? Restaurer mon accès » → " +
        "entrer l'e-mail du paiement. Si l'accès ne revient pas, répondre à ce message : je règle ça " +
        "personnellement, et si besoin je rembourse.\n" +
        "→ Envoyer via : SEND=1 KIND=access_generic TO=<client> REGION=<martinique|guadeloupe> node scripts/automation/support-reply.cjs",
    }
  }
  if (cat === 'feedback') {
    return {
      kind: 'julien_ux (support-reply.cjs) — générique retour produit',
      text:
        "Merci beaucoup, c'est un retour très utile. On prend en compte et on améliore l'app. " +
        "Merci d'avoir pris le temps, ça aide vraiment.\n" +
        "→ Adapter le contenu au retour, puis : SEND=1 KIND=julien_ux TO=<client> node scripts/automation/support-reply.cjs",
    }
  }
  // refund
  return {
    kind: 'REMBOURSEMENT — décision = TOI (pas de gabarit auto)',
    text:
      "⚠️ Décision de remboursement = toi. NE PAS promettre de remboursement automatiquement. " +
      "Politique bornée : remboursement justifié surtout si le client n'a jamais pu accéder au service " +
      "(cf. réponse access : « vous ne paierez jamais pour un service auquel vous n'accédez pas »). " +
      "Sinon, évaluer au cas par cas avant de t'engager. Répondre depuis alerte@ une fois la décision prise.",
  }
}

// ─── DIGEST fondateur (un email par run). Contient les adresses réelles. ───
function digestTemplate(items) {
  const rows = items.map((it, i) => {
    const sg = suggestedReply(it.cat)
    return `<div style="border:1px solid #E4E0D6;border-radius:10px;padding:14px 16px;margin:12px 0;background:#fff">
      <div style="font-size:12px;font-weight:800;color:#FFC72C;text-transform:uppercase;letter-spacing:.1em">#${i + 1} · ${esc(it.cat)}</div>
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

  const items = [] // {uid, from, subject, snippet, cat}
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
      const body = (parsed.text || '').replace(/\s+/g, ' ').trim()
      const snippet = body.slice(0, 400)
      const cat = classify(`${subject}\n${body}`)
      items.push({ uid, from, subject, snippet, cat })
    }
  } finally {
    if (lock) lock.release()
  }

  // Compteurs SEULEMENT (zéro PII).
  const counts = items.reduce((a, it) => { a[it.cat] = (a[it.cat] || 0) + 1; return a }, {})
  const summary = Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ') || '(aucune)'
  console.log(`[support-inbox] ${items.length} message(s) UNSEEN traité(s) — catégories : ${summary}`)

  if (!items.length) { await client.logout(); return }

  if (!SEND) {
    console.log('[support-inbox] DRY-RUN — aucun envoi, aucun \\Seen. (Passer SEND=1 pour activer.)')
    await client.logout()
    return
  }

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
  const dig = digestTemplate(items)
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

main().catch((e) => {
  // Ne jamais logguer un objet d'erreur brut (peut contenir des headers/PII).
  console.error('[support-inbox] ERREUR :', e && e.message ? e.message : 'erreur inconnue')
  process.exit(1)
})
