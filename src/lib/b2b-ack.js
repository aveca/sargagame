// Accusés serveur RÉELS pour le parcours B2B (lead + essai Pro).
//
// POURQUOI CE FICHIER EXISTE
// Le modal B2B (`/?pro=1`) affichait « essai activé » QUOI QUE SOIT la réponse
// du serveur : `setSent(true)` était appelé inconditionnellement (même sur
// erreur HTTP, même sur réseau coupé). Un hôtelier perdait sa demande et
// croyait quand même l'avoir envoyée → 0 signal, 0 relance, 0 vente.
// Les pages statiques `/pro/**` ont été corrigées dans le même sens par la
// PR #1412 (`public/b2b-capture.js`) ; ce module applique EXACTEMENT la même
// règle au modal React.
//
// LA RÈGLE
//   1. Le LEAD est écrit dans le sink des prospects (Apps Script) et l'on
//      EXIGE son accusé `{ok:true}`. Requête « simple » (Content-Type
//      text/plain) → aucun preflight, réponse JSON lisible.
//   2. L'ESSAI est activé par `/api/b2b-trial.php` et l'on EXIGE son accusé
//      `{ok:true, token}`.
//   3. Le succès n'est affiché QUE si les DEUX accusés sont positifs.
//      Un échec → message explicite, formulaire conservé, réessai possible.
//      (Le sink déduplique par email : un réessai ne crée pas de doublon.)
//
// AUCUN état serveur nouveau, aucun secret, aucun prix, aucun envoi marketing.

export const B2B_LEAD_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec"
export const B2B_TRIAL_ENDPOINT = "/api/b2b-trial.php"
export const B2B_MEETING_ENDPOINT = "/api/b2b-meeting.php"

// Budget temps par requête. Le sink Apps Script peut être « froid » (cold start
// Google) : au-delà, on échoue proprement (retry possible) plutôt que de
// laisser l'utilisateur devant un spinner infini.
export const B2B_ACK_TIMEOUT_MS = 12000

// Raisons d'échec (utilisées par l'UI pour le message + la télémétrie).
export const B2B_ACK_REASON = {
  NETWORK: "network",
  TIMEOUT: "timeout",
  HTTP: "http",
  INVALID_JSON: "invalid_json",
  NOT_SAVED: "not_saved",
  NO_TOKEN: "no_token",
}

// Messages utilisateur (FR / EN / ES). Aucun texte dexcuse : l'utilisateur
// doit savoir que RIEN n'a été enregistré.
export const B2B_ACK_MESSAGES = {
  fr: {
    network: "Connexion impossible — votre demande n'est pas enregistrée. Réessayez.",
    timeout: "Le serveur ne répond pas — votre demande n'est pas enregistrée. Réessayez.",
    http: "Le serveur a refusé la demande — rien n'a été enregistré. Réessayez.",
    invalid_json: "Réponse serveur illisible — rien n'a été enregistré. Réessayez.",
    not_saved: "Le serveur n'a pas confirmé l'enregistrement — rien n'a été enregistré. Réessayez.",
    no_token: "L'essai n'a pas pu être activé — votre demande est enregistrée, réessayez l'activation.",
  },
  en: {
    network: "Connection failed — your request was not saved. Please try again.",
    timeout: "The server did not answer — your request was not saved. Please try again.",
    http: "The server refused the request — nothing was saved. Please try again.",
    invalid_json: "Unreadable server response — nothing was saved. Please try again.",
    not_saved: "The server did not confirm the save — nothing was saved. Please try again.",
    no_token: "The trial could not be activated — your request is saved, please retry the activation.",
  },
  es: {
    network: "Conexión imposible — su solicitud no quedó registrada. Inténtelo de nuevo.",
    timeout: "El servidor no respondió — su solicitud no quedó registrada. Inténtelo de nuevo.",
    http: "El servidor rechazó la solicitud — no se guardó nada. Inténtelo de nuevo.",
    invalid_json: "Respuesta del servidor ilegible — no se guardó nada. Inténtelo de nuevo.",
    not_saved: "El servidor no confirmó el registro — no se guardó nada. Inténtelo de nuevo.",
    no_token: "No se pudo activar la prueba — su solicitud está registrada, reintente la activación.",
  },
}

// Messages de l'étape « activation » : le LEAD est DÉJÀ enregistré (c'est
// l'étape 1, accusée), seule l'ACTIVATION a échoué. Dire « rien n'a été
// enregistré » serait faux → on le dit clairement pour que l'hôtelier sache
// que sa demande existe et qu'il n'a plus qu'à réessayer l'activation.
export const B2B_ACK_STAGE_MESSAGES = {
  fr: {
    trial: "Votre demande est enregistrée, mais l'essai n'a pas pu être activé. Réessayez l'activation.",
    meeting: "Votre demande est enregistrée, mais la demande de rendez-vous n'a pas abouti. Réessayez.",
  },
  en: {
    trial: "Your request is saved, but the trial could not be activated. Please retry the activation.",
    meeting: "Your request is saved, but the meeting request did not go through. Please try again.",
  },
  es: {
    trial: "Su solicitud está registrada, pero no se pudo activar la prueba. Reintente la activación.",
    meeting: "Su solicitud está registrada, pero la solicitud de reunión no se completó. Inténtelo de nuevo.",
  },
}

// `stage` = étape qui a échoué ("lead" | "trial" | "meeting").
// lead   → rien n'est garanti → message "rien n'a été enregistré".
// trial  → le lead EST enregistré (étape 1 accusée) → message honnête.
export function b2bAckMessage(reason, lang, stage) {
  const table = B2B_ACK_MESSAGES[lang] || B2B_ACK_MESSAGES.fr
  const stageTable = B2B_ACK_STAGE_MESSAGES[lang] || B2B_ACK_STAGE_MESSAGES.fr
  if (stage && stage !== "lead" && stageTable[stage]) return stageTable[stage]
  return table[reason] || table.not_saved
}

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === "function") return fetchImpl
  if (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis)
  return null
}

// POST JSON avec budget temps. Retourne TOUJOURS un objet (jamais de throw) :
// l'appelant doit pouvoir distinguer « pas de réseau » de « pas enregistré ».
// → {ok:true, status, data} | {ok:false, reason, status?}
async function postJson({ url, body, headers, mode, fetchImpl, timeoutMs }) {
  const doFetch = resolveFetch(fetchImpl)
  if (!doFetch) return { ok: false, reason: B2B_ACK_REASON.NETWORK }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null
  let timedOut = false
  const timer = ctrl
    ? setTimeout(() => {
        timedOut = true
        try { ctrl.abort() } catch (_) {}
      }, timeoutMs)
    : null
  const init = { method: "POST", headers: headers || {}, body }
  if (mode) init.mode = mode
  if (ctrl) init.signal = ctrl.signal
  try {
    const res = await doFetch(url, init)
    if (!res || !res.ok) return { ok: false, reason: B2B_ACK_REASON.HTTP, status: res && res.status }
    let data = null
    try {
      data = await res.json()
    } catch (_) {
      return { ok: false, reason: B2B_ACK_REASON.INVALID_JSON, status: res.status }
    }
    return { ok: true, status: res.status, data }
  } catch (_) {
    return { ok: false, reason: timedOut ? B2B_ACK_REASON.TIMEOUT : B2B_ACK_REASON.NETWORK }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// (1) CAPTURE DU LEAD — accusé exigé du sink des prospects.
// Payload volontairement aligné sur `submitLead()` (Sargasses_PROD.jsx) :
// {email, island, source, date}. Le sink déduplique par email.
export async function captureLeadAcked({
  email,
  island = "MQ",
  source = "b2b_trial",
  org = "",
  beach = "",
  extra = null,
  endpoint = B2B_LEAD_ENDPOINT,
  fetchImpl = null,
  timeoutMs = B2B_ACK_TIMEOUT_MS,
} = {}) {
  const mail = String(email || "").trim()
  if (!mail || mail.indexOf("@") < 1) return { ok: false, reason: B2B_ACK_REASON.NOT_SAVED, stage: "lead" }
  const payload = { email: mail, island, source, date: new Date().toISOString() }
  if (org) payload.org = String(org).slice(0, 60)
  if (beach) payload.beach = String(beach).slice(0, 60)
  if (extra && typeof extra === "object") Object.assign(payload, extra)
  const res = await postJson({
    url: endpoint,
    body: JSON.stringify(payload),
    // Requête SIMPLE (text/plain) → aucun preflight ; le sink répond
    // `Access-Control-Allow-Origin: *` + `{ok:true,action:...}`.
    headers: { "Content-Type": "text/plain" },
    mode: "cors",
    fetchImpl,
    timeoutMs,
  })
  if (!res.ok) return { ok: false, reason: res.reason, stage: "lead" }
  if (!res.data || res.data.ok !== true) return { ok: false, reason: B2B_ACK_REASON.NOT_SAVED, stage: "lead" }
  return { ok: true, stage: "lead", data: res.data }
}

// (2a) ACTIVATION DE L'ESSAI — accusé exigé : {ok:true, token}.
// Le consentement marketing part AVEC (optionnel, jamais pré-coché).
export async function activateTrialAcked({
  email,
  name = "",
  island = "MQ",
  beach = "",
  marketingConsent = 0,
  consentSource = "b2b_trial_form",
  endpoint = B2B_TRIAL_ENDPOINT,
  fetchImpl = null,
  timeoutMs = B2B_ACK_TIMEOUT_MS,
} = {}) {
  const payload = { email: String(email || "").trim(), name, island, marketingConsent, consentSource }
  if (beach) payload.beach = beach
  const res = await postJson({
    url: endpoint,
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    mode: "cors",
    fetchImpl,
    timeoutMs,
  })
  if (!res.ok) return { ok: false, reason: res.reason, stage: "trial" }
  const data = res.data
  if (!data || data.ok !== true) return { ok: false, reason: B2B_ACK_REASON.NOT_SAVED, stage: "trial" }
  if (!data.token || typeof data.token !== "string") return { ok: false, reason: B2B_ACK_REASON.NO_TOKEN, stage: "trial" }
  return { ok: true, stage: "trial", token: data.token, data }
}

// (2b) DEMANDE DE RENDEZ-VOUS (secteur public) — accusé exigé : {ok:true}.
export async function requestMeetingAcked({
  email,
  org = "",
  littoral = "",
  phone = "",
  island = "MQ",
  endpoint = B2B_MEETING_ENDPOINT,
  fetchImpl = null,
  timeoutMs = B2B_ACK_TIMEOUT_MS,
} = {}) {
  const payload = { email: String(email || "").trim(), org, littoral, phone, island }
  const res = await postJson({
    url: endpoint,
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    mode: "cors",
    fetchImpl,
    timeoutMs,
  })
  if (!res.ok) return { ok: false, reason: res.reason, stage: "meeting" }
  if (!res.data || res.data.ok !== true) return { ok: false, reason: B2B_ACK_REASON.NOT_SAVED, stage: "meeting" }
  return { ok: true, stage: "meeting", data: res.data }
}

// Orchestration : le LEAD d'abord (donc un prospect n'est jamais perdu même si
// l'activation échoue), puis l'action demandée. Le succès n'est rendu qu'après
// les DEUX accusés positifs.
export async function submitB2BWithAck({ lead, trial = null, meeting = null, fetchImpl = null, timeoutMs } = {}) {
  const leadRes = await captureLeadAcked({ ...(lead || {}), fetchImpl, timeoutMs })
  if (!leadRes.ok) return leadRes
  if (meeting) {
    const meetingRes = await requestMeetingAcked({ ...meeting, fetchImpl, timeoutMs })
    if (!meetingRes.ok) return meetingRes
    return { ok: true, stage: "meeting", lead: leadRes.data, data: meetingRes.data }
  }
  if (trial) {
    const trialRes = await activateTrialAcked({ ...trial, fetchImpl, timeoutMs })
    if (!trialRes.ok) return trialRes
    return { ok: true, stage: "trial", lead: leadRes.data, token: trialRes.token, data: trialRes.data }
  }
  return { ok: true, stage: "lead", lead: leadRes.data }
}
