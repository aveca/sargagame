#!/usr/bin/env node
'use strict'

/**
 * b2b-modal-ack.test.cjs — accusé de persistance RÉEL du parcours B2B.
 *
 * CONTEXTE (issue #1273)
 * Le modal React (`/?pro=1` → B2BModal) affichait « essai activé » QUOI QUE
 * SOIT la réponse du serveur : `setSent(true)` était appelé inconditionnellement
 * (`.then(()=>{setBusy(false);setSent(true)})` ET `.catch(()=>{setBusy(false);
 * setSent(true)})`). Un hôtelier perdait sa demande et croyait l'avoir envoyée.
 * Les pages statiques `/pro/**` ont été corrigées dans le même sens par la
 * PR #1412 (`public/b2b-capture.js`, mergée) ; ce test verrouille le MÊME
 * contrat pour le modal + les deux workers.
 *
 * CE QUE LE TEST GARDE
 *   A — COMPORTEMENT (helper `src/lib/b2b-ack.js`, fetch simulé) :
 *       soumission valide, réponse serveur négative, timeout, erreur réseau,
 *       absence de token, lead non enregistré (le trial n'est même pas tenté),
 *       consentement transmis, pas de doublon au réessai.
 *   B — CONTRAT SOURCE (`src/PremiumModal.jsx`) :
 *       plus de succès inconditionnel, message d'erreur visible, anti-double-
 *       clic, tracking de conversion UNIQUEMENT après confirmation serveur.
 *   C — CONTRAT WORKERS :
 *       `workers/sargagame` ne simule plus un essai sans persistance ;
 *       `workers/sg-payments` exige l'accusé du sink et conserve le
 *       consentement (version + horodatage + source).
 *
 * Les tests B/C sont des CONTRATS DE SOURCE (le composant React n'est pas
 * rendu ici : le repo n'a pas de runner DOM unitaire). Les tests A sont
 * comportementaux sur la logique d'accusé, qui est la décision critique.
 */

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failures = 0
let checks = 0
function t(ok, label) {
  checks++
  if (ok) console.log('  ok  ' + label)
  else {
    failures++
    console.error('  FAIL ' + label)
  }
}

// ── Fakes de transport ───────────────────────────────────────────────────────
const jsonRes = (obj, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(obj),
})
// fetch qui ne répond jamais : ne résout que si le signal est avorté (timeout).
const hangingFetch = () => (_url, init) =>
  new Promise((_resolve, reject) => {
    const sig = init && init.signal
    if (!sig) return
    const abort = () => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      reject(e)
    }
    if (sig.aborted) abort()
    else sig.addEventListener('abort', abort)
  })

async function main() {
  const ack = await import(pathToFileURL(path.join(ROOT, 'src/lib/b2b-ack.js')).href)
  const { captureLeadAcked, activateTrialAcked, submitB2BWithAck, b2bAckMessage, B2B_ACK_REASON } = ack

  // ── A1 : soumission valide → lead accusé + trial accusé → token ────────────
  console.log('\nA1. Soumission valide (lead + trial accusés)')
  {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) })
      if (url.includes('script.google.com')) return jsonRes({ ok: true, action: 'email_saved' })
      return jsonRes({ ok: true, token: 'tok_abc', days: 30 })
    }
    const res = await submitB2BWithAck({
      lead: { email: 'hotel@exemple.com', island: 'PUNTACANA', source: 'b2b_pro', org: 'Hôtel X' },
      trial: { email: 'hotel@exemple.com', name: 'Hôtel X', island: 'PUNTACANA', marketingConsent: 1, consentSource: 'b2b_trial_form' },
      fetchImpl,
    })
    t(res.ok === true, 'A1 : le succès n’est rendu qu’après les DEUX accusés')
    t(res.token === 'tok_abc', 'A1 : le token Pro est retourné')
    t(calls.length === 2, 'A1 : 2 requêtes (lead puis trial)')
    t(calls[0].url.includes('script.google.com'), 'A1 : le lead part vers le sink des prospects')
    t(calls[1].url === '/api/b2b-trial.php', 'A1 : le trial part vers /api/b2b-trial.php')
    t(calls[0].init.mode === 'cors', 'A1 : le lead est lu (mode cors)')
    t(calls[0].init.headers['Content-Type'] === 'text/plain',
      'A1 : le lead est une requête SIMPLE (text/plain → aucun preflight)')
    t(calls[1].init.headers['Content-Type'] === 'application/json', 'A1 : le trial est en JSON')
    t(calls[0].body.email === 'hotel@exemple.com', 'A1 : l’email du prospect est transmis')
    t(calls[0].body.source === 'b2b_pro', 'A1 : la source d’attribution est conservée')
    t(calls[0].body.org === 'Hôtel X', 'A1 : le nom de l’établissement est transmis')
  }

  // ── A2 : réponse serveur NÉGATIVE (HTTP 500) → pas de succès ───────────────
  console.log('\nA2. Réponse serveur négative')
  {
    const res = await submitB2BWithAck({
      lead: { email: 'hotel@exemple.com' },
      trial: { email: 'hotel@exemple.com' },
      fetchImpl: async (url) => (url.includes('script.google.com') ? jsonRes({ ok: true }) : jsonRes({ error: 'boom' }, 500)),
    })
    t(res.ok === false, 'A2 : HTTP 500 → aucun succès')
    t(res.reason === B2B_ACK_REASON.HTTP, 'A2 : la raison est explicitée (http)')
    t(!res.token, 'A2 : aucun token n’est rendu')
  }

  // ── A3 : {ok:false} → pas de succès ────────────────────────────────────────
  console.log('\nA3. Le sink répond {ok:false}')
  {
    const res = await captureLeadAcked({
      email: 'hotel@exemple.com',
      fetchImpl: async () => jsonRes({ ok: false, error: 'quota' }),
    })
    t(res.ok === false, 'A3 : {ok:false} → aucun succès')
    t(res.reason === B2B_ACK_REASON.NOT_SAVED, 'A3 : la raison est explicitée (not_saved)')
  }

  // ── A4 : erreur réseau → pas de succès ─────────────────────────────────────
  console.log('\nA4. Erreur réseau (serveur injoignable)')
  {
    const res = await captureLeadAcked({
      email: 'hotel@exemple.com',
      fetchImpl: async () => { throw new Error('network down') },
    })
    t(res.ok === false, 'A4 : réseau coupé → aucun succès')
    t(res.reason === B2B_ACK_REASON.NETWORK, 'A4 : la raison est explicitée (network)')
  }

  // ── A5 : timeout → pas de succès, pas de spinner infini ────────────────────
  console.log('\nA5. Délai dépassé (timeout)')
  {
    const res = await captureLeadAcked({
      email: 'hotel@exemple.com',
      fetchImpl: hangingFetch(),
      timeoutMs: 40,
    })
    t(res.ok === false, 'A5 : timeout → aucun succès')
    t(res.reason === B2B_ACK_REASON.TIMEOUT, 'A5 : la raison est explicitée (timeout)')
  }

  // ── A6 : le trial répond ok SANS token → pas de succès ─────────────────────
  console.log('\nA6. Le trial répond {ok:true} sans token')
  {
    const res = await activateTrialAcked({
      email: 'hotel@exemple.com',
      fetchImpl: async () => jsonRes({ ok: true, days: 30 }),
    })
    t(res.ok === false, 'A6 : pas de token → aucun succès')
    t(res.reason === B2B_ACK_REASON.NO_TOKEN, 'A6 : la raison est explicitée (no_token)')
  }

  // ── A7 : lead non enregistré → le trial n'est même pas tenté ──────────────
  console.log('\nA7. Lead non enregistré → aucun token émis')
  {
    const urls = []
    const res = await submitB2BWithAck({
      lead: { email: 'hotel@exemple.com' },
      trial: { email: 'hotel@exemple.com' },
      fetchImpl: async (url) => {
        urls.push(url)
        return jsonRes({ ok: false })
      },
    })
    t(res.ok === false, 'A7 : aucun succès')
    t(res.stage === 'lead', 'A7 : l’échec est attribué à l’étape lead')
    t(urls.length === 1 && urls[0].includes('script.google.com'),
      'A7 : l’activation n’est pas tentée si le lead n’est pas enregistré')
  }

  // ── A8 : consentement transmis (optionnel, jamais pré-coché côté front) ────
  console.log('\nA8. Consentement marketing transmis')
  {
    const calls = []
    await activateTrialAcked({
      email: 'hotel@exemple.com',
      island: 'PUNTACANA',
      marketingConsent: 1,
      consentSource: 'b2b_trial_form',
      fetchImpl: async (url, init) => {
        calls.push(JSON.parse(init.body))
        return jsonRes({ ok: true, token: 'tok' })
      },
    })
    t(calls[0].marketingConsent === 1, 'A8 : le consentement est transmis au serveur')
    t(calls[0].consentSource === 'b2b_trial_form', 'A8 : la source du consentement est transmise')
  }

  // ── A9 : réessai → MÊME email (déduplication côté sink) ────────────────────
  console.log('\nA9. Réessai sans doublon')
  {
    const emails = []
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body)
      emails.push(body.email)
      return url.includes('script.google.com') ? jsonRes({ ok: true, action: 'email_saved' }) : jsonRes({ ok: true, token: 'tok' })
    }
    await submitB2BWithAck({ lead: { email: 'hotel@exemple.com' }, trial: { email: 'hotel@exemple.com' }, fetchImpl })
    await submitB2BWithAck({ lead: { email: 'hotel@exemple.com' }, trial: { email: 'hotel@exemple.com' }, fetchImpl })
    t(emails.length >= 2 && emails.every((e) => e === 'hotel@exemple.com'),
      'A9 : le réessai renvoie le MÊME email (le sink déduplique → aucun doublon)')
    const sheet = read('scripts/appscript/Code.js')
    t(/const exists = data\.some\(row => row\[1\] === payload\.email\)/.test(sheet),
      'A9 : le sink déduplique bien par email')
  }

  // ── A10 : message d'erreur utilisateur (FR/EN/ES) ─────────────────────────
  console.log('\nA10. Message d’erreur visible')
  {
    t(b2bAckMessage('network', 'fr').length > 20, 'A10 : message FR non vide')
    t(b2bAckMessage('network', 'en').length > 20, 'A10 : message EN non vide')
    t(b2bAckMessage('network', 'es').length > 20, 'A10 : message ES non vide')
    t(/rien n'a été enregistré/.test(b2bAckMessage('not_saved', 'fr')),
      'A10 : le message dit explicitement que RIEN n’a été enregistré')
    // HONNÊTETÉ PAR ÉTAPE : si le LEAD est enregistré (étape 1 accusée) et
    // que seule l'ACTIVATION échoue, dire « rien n'a été enregistré » serait
    // FAUX. Le message doit le dire : « demande enregistrée, activation à
    // réessayer ».
    const trialMsg = b2bAckMessage('http', 'fr', 'trial')
    t(/enregistrée/.test(trialMsg) && !/rien n'a été enregistré/.test(trialMsg),
      'A10 : échec de l’activation → le lead est annoncé comme enregistré')
    t(/registrada/.test(b2bAckMessage('timeout', 'es', 'trial')),
      'A10 : message ES spécifique à l’étape activation')
    t(/saved/.test(b2bAckMessage('http', 'en', 'meeting')),
      'A10 : message EN spécifique à l’étape rendez-vous')
    t(/rien n'a été enregistré/.test(b2bAckMessage('http', 'fr', 'lead')),
      'A10 : échec du LEAD → rien n’est annoncé comme enregistré')
  }

  // ── B : contrat source du modal React ──────────────────────────────────────
  console.log('\nB. Contrat source — src/PremiumModal.jsx')
  const modal = read('src/PremiumModal.jsx')
  {
    t(!/\.then\(\(\)=>\{setBusy\(false\);setSent\(true\)\}\)/.test(modal),
      'B : le succès inconditionnel (then) a disparu')
    t(!/\.catch\(\(\)=>\{setBusy\(false\);setSent\(true\)\}\)/.test(modal),
      'B : le succès inconditionnel (catch réseau) a disparu')
    t(!/fetch\("\/api\/b2b-trial\.php"/.test(modal),
      'B : le modal ne poste plus en raw (il passe par l’accusé)')

    // On ne compte que les occurrences de CODE (les commentaires qui citent
    // l'ancien `setSent(true)` inconditionnel ne doivent pas compter).
    const sentTrue = []
    modal.split('\n').forEach((line, i) => {
      let idx = 0
      while ((idx = line.indexOf('setSent(true)', idx)) !== -1) {
        if (!line.slice(0, idx).includes('//')) {
          sentTrue.push(modal.split('\n').slice(0, i).join('\n').length + idx)
        }
        idx += 'setSent(true)'.length
      }
    })
    t(sentTrue.length === 2, 'B : exactement 2 setSent(true) en code (modal essai + demande de RDV)')
    let guarded = sentTrue.length === 2
    for (const i of sentTrue) {
      const before = modal.slice(Math.max(0, i - 500), i)
      if (!/if\(res\.ok\)\{/.test(before)) guarded = false
    }
    t(guarded, 'B : chaque setSent(true) est gardé par if(res.ok)')

    t(/role="alert"/.test(modal), 'B : le message d’erreur est annoncé aux lecteurs d’écran (role=alert)')
    t(/const \[err,setErr\]=useState\(""\)/.test(modal), 'B : l’état d’erreur existe')
    t(/setErr\(b2bAckMessage\(res\.reason,lang,res\.stage\)\)/.test(modal),
      'B : l’erreur affichée vient de la raison ET de l’étape serveur')
    t(/if\(!valid\|\|sent\|\|busy\)return/.test(modal), 'B : anti-double-clic conservé (garde busy)')
    t(/disabled=\{!valid\|\|busy\}/.test(modal), 'B : le bouton est désactivé pendant l’envoi')

    // Tracking de conversion : UNIQUEMENT après confirmation serveur.
    const act = modal.indexOf('track("sg_b2b_trial_activated"')
    t(act > -1, 'B : l’événement d’activation est toujours émis')
    t(act > modal.indexOf('if(res.ok){'), 'B : l’activation n’est trackée qu’après if(res.ok)')
    // L'activation n'est réelle que si un TOKEN a été émis : en rollback
    // (?b2btrial=0) le lead est capturé mais aucun trial n'est activé →
    // émettre `sg_b2b_trial_activated` serait une conversion FICTIVE.
    t(/if\(res\.token\)\{try\{track\("sg_b2b_trial_activated"/.test(modal),
      'B : l’activation n’est trackée que si un token a été émis (pas de conversion fictive)')
    const confirmed = modal.indexOf('track("sg_b2b_capture_confirmed"')
    t(confirmed > -1, 'B : la capture confirmée est trackée')
    // Ordre STRICT : l'événement doit être DANS le bloc `if(res.ok){` qui suit
    // la soumission (pas dans un autre if(res.ok) antérieur du fichier).
    const okIdx = modal.indexOf('if(res.ok){', modal.indexOf('submitB2BWithAck(req)'))
    t(okIdx > -1 && confirmed > okIdx,
      'B : la capture CONFIRMÉE n’est trackée qu’après confirmation serveur')
    const meeting = modal.indexOf('track("sg_b2b_meeting_request"')
    t(meeting > -1 && meeting > modal.indexOf('if(res.ok){'),
      'B : la demande de RDV n’est trackée qu’après confirmation serveur')
    t(/marketingConsent:mktConsent\?1:0/.test(modal),
      'B : le consentement (1/0) continue d’être transmis au trial')
    t(/const \[mktConsent,setMktConsent\]=useState\(false\)/.test(modal),
      'B : le consentement n’est jamais pré-coché')
    // `sg_b2b_signup` reste un événement d'INTENTION émis au submit (pages
    // statiques) : le modal ne doit pas le faire basculer après confirmation,
    // sinon les intentions ne seraient plus comparables entre surfaces.
    const signupIdx = modal.indexOf('"sg_b2b_signup"')
    t(signupIdx === -1,
      'B : le modal ne réutilise pas sg_b2b_signup (intention au submit sur les pages statiques)')
  }

  // ── C : contrat workers ────────────────────────────────────────────────────
  console.log('\nC. Contrat workers')
  {
    const regional = read('workers/sargagame/index.js')
    const prod = read('workers/sg-payments/index.js')

    t(!/return out\(\{ok:true,token,days:30\},200\)/.test(regional),
      'C : le worker régional ne rend plus un token sans persistance')
    t(/b2b_trial_not_persisted_here/.test(regional),
      'C : le worker régional REFUSE explicitement (fail-closed)')

    t(/lead_not_persisted/.test(prod), 'C : sg-payments refuse si le sink n’accuse pas')
    t(/const leadPayload = \{/.test(prod) && /marketing_consent/.test(prod) && /consent_v/.test(prod)
      && /consent_ts/.test(prod) && /consent_source/.test(prod),
      'C : sg-payments conserve le consentement (version + horodatage + source)')
    t(/b2b_marketing_consent/.test(prod), 'C : sg-payments trace l’opt-in explicite')
    t(/const marketingConsent = rawConsent === true/.test(prod),
      'C : le consentement vaut false par défaut côté serveur')
    t(/await fetch\("https:\/\/script\.google\.com\/macros/.test(prod),
      'C : l’écriture du lead est ATTENDUE (await), pas en fire-and-forget')
    t(!/ctx\.waitUntil\(fetch\("https:\/\/script\.google\.com\/macros/.test(prod),
      'C : plus aucun fire-and-forget vers le sink des prospects')
  }

  // ── D : les pages statiques restent sur l'accusé (PR #1412, non régressé) ──
  console.log('\nD. Non-régression des pages statiques')
  {
    const helper = read('public/b2b-capture.js')
    t(/sg_b2b_capture_confirmed/.test(helper),
      'D : le helper_shared émet un événement de conversion CONFIRMÉE')
    t(/sg_b2b_capture_failed/.test(helper),
      'D : le helper partagé émet toujours l’événement d’échec')
    const pages = [
      'public/pro/hotels/index.html',
      'public/pro/en/hotels/index.html',
      'public/pro/es/hotels/index.html',
      'public/pro/collectivites/index.html',
      'public/pro/en/collectivites/index.html',
      'public/pro/es/collectivites/index.html',
      'public/pro/en/sargassum-forecast-punta-cana-hotels/index.html',
      'public/pro/en/sargassum-forecast-miami-hotels/index.html',
      'public/pro/en/sargassum-forecast-cancun-hotels/index.html',
      'public/pro/es/pronostico-sargazo-punta-cana-hoteles/index.html',
      'public/pro/es/pronostico-sargazo-cancun-hoteles/index.html',
    ]
    let noCors = 0
    for (const p of pages) {
      const src = read(p)
      if (/mode:\s*'no-cors'/.test(src)) noCors++
    }
    t(noCors === 0, 'D : aucun formulaire /pro/** ne fait de POST opaque (no-cors)')
  }

  console.log(`\nB2B_MODAL_ACK_TESTS ${failures === 0 ? 'PASS' : 'FAIL'} (${checks - failures}/${checks} assertions)`)
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
