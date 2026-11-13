// Offre annuelle affichable dans le paywall. Le tier inconnu n'a pas de clé.
// `reachable: true` est exigé en plus d'une URL https : le catalogue commité
// a des URL hébergées qui répondaient HTTP 404 le 2026-11-06.

export function selectB2bPaylink(paylinks, tier, isNewRegion) {
  const key = { pro: "pro_annual", brief: "brief_annual" }[tier]
  if (!key || !paylinks) return null
  const usdKey = key + "_usd"
  const chosen = isNewRegion && paylinks[usdKey] ? usdKey : key
  const link = paylinks[chosen]
  if (!link || typeof link.url !== "string" || !link.url.startsWith("https://") || link.reachable !== true) return null
  const value = String(link.value || "").replace(/\.00$/, "")
  return {
    url: link.url,
    amt: value ? (chosen.endsWith("_usd") ? ("$" + value) : (value + " €")) : null,
  }
}
