const PRODUCTION_PAYMENT_HOSTS = new Set([
  "sargasses-martinique.com",
  "sargasses-guadeloupe.com",
  "sargassummiami.com",
  "sargassumpuntacana.com",
  "sargassumcancun.com",
  "sargazotulum.com",
])

export function normalizePaymentHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
}

export function requiresLiveMollieKey(hostname) {
  return PRODUCTION_PAYMENT_HOSTS.has(normalizePaymentHost(hostname))
}

export function isLiveMollieKey(apiKey) {
  return typeof apiKey === "string" && apiKey.startsWith("live_")
}

export function isMollieModeAllowed(hostname, apiKey) {
  return !requiresLiveMollieKey(hostname) || isLiveMollieKey(apiKey)
}
