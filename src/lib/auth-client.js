/**
 * auth-client — identité utilisateur SargaGame (sprint funnel 2026-09-03).
 *
 * Modèle :
 *   Google Sign-In (OIDC) ─┐
 *                          ├─→ POST /api/mollie.php {action:"auth_*"} (worker sg-payments)
 *   Email (sans compte) ───┘    → sg_users (user_id stable) → grants payment_grants
 *
 * Règles :
 *   - Le localStorage `sg_auth` est un CACHE UX. La vérité = serveur.
 *   - Le token de session n'est émis QUE pour Google (identité vérifiée OIDC).
 *     Le parcours email reste "sans compte" : user_id + grants par email.
 *   - Google n'est JAMAIS obligatoire : si le client_id est absent
 *     (non provisionné), le bouton ne s'affiche pas et le parcours email
 *     reste 100 % fonctionnel.
 *   - Rollback complet : ?sgauth=0 → étape d'identification masquée,
 *     comportement antérieur (email seul).
 */

// client_id OAuth Google (valeur PUBLIQUE par design — jamais de secret ici).
// Vide = Google Sign-In désactivé (bouton masqué, parcours email seul).
// À remplir après création du client OAuth (console GCP, origins = 6 domaines).
export const SG_GOOGLE_CLIENT_ID = ""

export const SG_AUTH_KEY = "sg_auth"

export function sgAuthEnabled() {
  try {
    if (/[?&]sgauth=0/.test(window.location.search)) return false
  } catch (_) {}
  return true
}

/** Lit le cache identité. Retourne {user_id,email,provider,token?} ou null. */
export function getSgAuth() {
  try {
    const raw = localStorage.getItem(SG_AUTH_KEY)
    if (!raw) return null
    const a = JSON.parse(raw)
    if (!a || typeof a !== "object" || !a.email) return null
    return a
  } catch (_) { return null }
}

export function setSgAuth(auth) {
  try {
    if (!auth || !auth.email) return
    const prev = getSgAuth() || {}
    const next = { ...prev, ...auth }
    localStorage.setItem(SG_AUTH_KEY, JSON.stringify(next))
    // Compat historique : les clés email existantes restent alimentées.
    localStorage.setItem("sg_email", next.email)
  } catch (_) {}
}

/** Token de session serveur (Google uniquement) — joint aux appels paiement. */
export function getSgAuthToken() {
  const a = getSgAuth()
  return (a && a.token) || null
}

// ═══ Appels worker (actions sous /api/mollie.php — route existante, 6 domaines) ═══

async function authCall(action, extra) {
  const r = await fetch("/api/mollie.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || d.error) throw new Error((d && d.error) || ("http_" + r.status))
  return d
}

/** Échange le credential Google (ID token JWT) contre une session serveur. */
export async function authGoogle(credential) {
  const d = await authCall("auth_google", { credential })
  setSgAuth({ user_id: d.user_id, email: d.email, provider: "google", token: d.token, name: d.name })
  return d
}

/** Identité déclarée par email (sans compte). Retourne user_id + entitlements. */
export async function authEmail(email) {
  const d = await authCall("auth_email", { email })
  setSgAuth({ user_id: d.user_id || null, email: d.email, provider: "email" })
  return d
}

/** Re-valide une session stockée (autre appareil / refresh) → entitlements serveur. */
export async function authSession(token) {
  return authCall("auth_session", { token })
}

// ═══ Google Identity Services — chargé LAZY (jamais au first paint) ═══

let gisPromise = null

export function loadGis() {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"))
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve(window.google)
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = "https://accounts.google.com/gsi/client"
    s.async = true
    s.defer = true
    s.onload = () => (window.google && window.google.accounts ? resolve(window.google) : reject(new Error("gis_incomplete")))
    s.onerror = () => { gisPromise = null; reject(new Error("gis_load_failed")) }
    document.head.appendChild(s)
  })
  return gisPromise
}

/**
 * Monte le bouton officiel Google dans `el`.
 * options.width → largeur du conteneur. Retourne true si rendu.
 */
export async function renderGoogleButton(el, { clientId, width = 320, onCredential }) {
  if (!clientId || !el) return false
  const g = await loadGis()
  g.accounts.id.initialize({ client_id: clientId, callback: (resp) => onCredential(resp && resp.credential) })
  el.innerHTML = ""
  g.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", shape: "pill", width, text: "continue_with", logo_alignment: "left" })
  return true
}
