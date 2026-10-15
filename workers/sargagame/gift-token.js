/**
 * gift-token.js — Jetons de liens cadeaux signés HMAC-SHA256 (MP-2).
 *
 * Partagé entre le Worker (workers/sargagame/index.js) et le générateur
 * (scripts/automation/gift-pass.cjs). Utilise UNIQUEMENT WebCrypto
 * (globalThis.crypto.subtle) → compatible Node 20+ ET Workers sans polyfill.
 *
 * Format du jeton : base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 *   payload = { v:1, pass:"p30", days:30, exp:<unix_sec>, jti:<nonce> }
 *
 * RÈGLES DE SÉCURITÉ :
 * - Le secret (GIFT_LINK_SECRET) vit UNIQUEMENT côté serveur (Worker secret /
 *   env locale pour le générateur). Jamais dans le frontend, jamais commité.
 * - Paramètres bornés : days ∈ [1, 3650], exp ≤ now+400j, pass ∈ allowlist.
 * - La signature seule ne suffit PAS contre le rejeu : la consommation est
 *   enregistrée atomiquement côté serveur (payment_grants, voir index.js).
 */

const ALLOWED_DAYS = { p7: 7, p14: 14, p30: 30, trip: 7, trip7: 7, season: 210 }
const MAX_DAYS = 3650
const MAX_EXP_AHEAD_S = 400 * 86400

function b64urlEncodeBytes(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlEncode(str) {
  return b64urlEncodeBytes(new TextEncoder().encode(str))
}
function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return b64urlEncodeBytes(sig)
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Signe un jeton cadeau.
 * @param {{pass:string, days?:number, ttlHours?:number}} opts
 * @param {string} secret GIFT_LINK_SECRET
 * @returns {Promise<string>} token
 */
export async function signGiftToken({ pass, days, ttlHours = 24 * 30 }, secret) {
  if (!secret || secret.length < 16) throw new Error('GIFT_LINK_SECRET manquant ou trop court (min 16)')
  if (!(pass in ALLOWED_DAYS)) throw new Error('pass hors allowlist : ' + pass)
  const d = days || ALLOWED_DAYS[pass]
  if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) throw new Error('days hors bornes [1,' + MAX_DAYS + ']')
  // Cohérence pass↔days imposée (miroir du verify) : un jeton signé ne peut
  // pas prétendre à une durée différente de celle de son allowlist.
  if (d !== ALLOWED_DAYS[pass]) throw new Error('days incohérents avec le pass ' + pass + ' (attendu ' + ALLOWED_DAYS[pass] + ')')
  const payload = {
    v: 1,
    pass,
    days: d,
    exp: Math.floor(Date.now() / 1000) + Math.floor(ttlHours * 3600),
    jti: b64urlEncodeBytes(crypto.getRandomValues(new Uint8Array(12))),
  }
  const body = b64urlEncode(JSON.stringify(payload))
  return body + '.' + (await hmacSign(secret, body))
}

/**
 * Vérifie un jeton cadeau (signature + structure + expiration).
 * Ne consomme PAS le jeton : la consommation atomique est côté serveur.
 * @returns {Promise<{ok:boolean, reason?:string, payload?:object}>}
 */
export async function verifyGiftToken(token, secret) {
  if (!secret || secret.length < 16) return { ok: false, reason: 'server_misconfigured' }
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, reason: 'malformed' }
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await hmacSign(secret, body)
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' }
  let payload
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) }
  catch (_) { return { ok: false, reason: 'malformed_payload' } }
  if (!payload || payload.v !== 1) return { ok: false, reason: 'bad_version' }
  // Allowlist RÉELLE des types de pass (MP-2 review) : même signé, un jeton
  // portant un pass inconnu ou des days incohérents est REFUSÉ. La cohérence
  // pass↔days est imposée pour les pass nommés (days = valeur de l'allowlist),
  // ce qui interdit de détourner un jeton p7 signé en pass 30 jours.
  if (!(payload.pass in ALLOWED_DAYS)) return { ok: false, reason: 'unknown_pass' }
  if (!Number.isInteger(payload.days) || payload.days < 1 || payload.days > MAX_DAYS) return { ok: false, reason: 'bad_days' }
  if (payload.days !== ALLOWED_DAYS[payload.pass]) return { ok: false, reason: 'days_mismatch' }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' }
  if (payload.exp > Math.floor(Date.now() / 1000) + MAX_EXP_AHEAD_S) return { ok: false, reason: 'exp_too_far' }
  if (typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 64) return { ok: false, reason: 'bad_jti' }
  return { ok: true, payload }
}
