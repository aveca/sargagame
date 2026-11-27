const LOOPBACK_HOSTS = new Set(["localhost", "::1", "0.0.0.0"])

function normalizeHost(hostname) {
  return String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
}

export function isLocalAnalyticsHost(hostname) {
  const host = normalizeHost(hostname)
  if (!host || LOOPBACK_HOSTS.has(host)) return true
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true
  return host.endsWith(".localhost")
}

export function shouldSendRemoteAnalytics(hostname, allowLocal = false) {
  if (allowLocal === true) return true
  return !isLocalAnalyticsHost(hostname)
}
