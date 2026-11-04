const SAFE_NUMERIC_FIELDS = Object.freeze(["count", "scrollCount", "directionChanges", "idleTime"]);
const MAX_METRIC = 10_000_000;

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(MAX_METRIC, number)) : null;
}

function validEventTimestamp(value, now) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now
    ? timestamp
    : null;
}

/**
 * Build a minimal frustration event payload.
 * Never forward arbitrary DOM text, email, query strings or caller-supplied objects.
 */
export function sanitizeFrustrationAnalytics(type, context = {}, pathname = "/", now = Date.now()) {
  const rawType = String(type ?? "unknown").trim();
  const safeType = rawType.replace(/[^a-z0-9_-]/gi, "_").slice(0, 48) || "unknown";
  const rawPath = String(pathname ?? "/").split(/[?#]/, 1)[0];
  const page = (rawPath.startsWith("/") ? rawPath : "/" + rawPath).slice(0, 200) || "/";
  const fallbackNow = Number.isFinite(now) && now > 0 ? now : Date.now();
  const suppliedTimestamp = validEventTimestamp(context?.timestamp, fallbackNow);
  const params = {
    type: safeType,
    page,
    timestamp: suppliedTimestamp ?? fallbackNow,
  };

  for (const key of SAFE_NUMERIC_FIELDS) {
    const value = boundedNumber(context?.[key]);
    if (value !== null) params[key] = value;
  }
  return params;
}
