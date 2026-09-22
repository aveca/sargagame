/**
 * jev-intent.js — Routeur d'intention sémantique (TypeSafe Jev) côté client.
 *
 * RÈGLES (TYPESAFE_JEV_ARCHITECTURE.md) :
 *  - Jev ne décide JAMAIS de prix/money-path. Ici : classification d'intention
 *    d'une recherche landing en langage naturel, UNIQUEMENT quand la recherche
 *    déterministe (nom de plage) a échoué.
 *  - Kill switch client : ?jev=0 · Kill switch serveur : TYPESAFE_JEV=off
 *  - Timeout 4,5 s + tout échec = { fallback:true } → comportement d'origine.
 *  - La clé API ne quitte jamais le serveur (endpoint /api/jev-intent.php).
 */

export const jevEnabled = () => {
  try { return !/[?&]jev=0(?:&|$)/.test(window.location.search) } catch (_) { return true }
}

export async function askJevIntent(text, lang, region) {
  if (!jevEnabled()) return { fallback: true }
  const ac = new AbortController()
  const t = setTimeout(() => { try { ac.abort() } catch (_) {} }, 4500)
  try {
    const r = await fetch("/api/jev-intent.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(text || "").slice(0, 220), lang, region }),
      signal: ac.signal,
    })
    if (!r.ok) return { fallback: true }
    const j = await r.json().catch(() => null)
    if (!j || j.ok !== true || !j.intent) return { fallback: true }
    return { ok: true, intent: j.intent, confidence: j.confidence }
  } catch (_) {
    return { fallback: true }
  } finally {
    clearTimeout(t)
  }
}
