export const MAX_DATA_AGE_MINUTES = 36 * 60;
export const SUPPORTED_ISLANDS = Object.freeze(["mq", "gp"]);
const ALLOWED_STATUS = new Set(["clean", "moderate", "avoid"]);
const MAX_FORECAST_SKEW_MS = 6 * 60 * 60 * 1000;

function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeIsland(value, hostname) {
  const host = String(hostname || "").toLowerCase();
  const requested = String(value || "").toLowerCase();
  const hostIsland = host.includes("guadeloupe") ? "gp"
    : host.includes("martinique") ? "mq"
    : null;
  const knownUnsupported = ["miami", "florida", "puntacana", "cancun", "rivieramaya", "tulum"].some((part) => host.includes(part));
  if (knownUnsupported) return null;
  if (requested && !SUPPORTED_ISLANDS.includes(requested)) return null;
  if (hostIsland && requested && requested !== hostIsland) return null;
  if (hostIsland) return hostIsland;
  if (requested) return requested;
  if (host === "localhost" || host.endsWith(".pages.dev") || host === "127.0.0.1") return "mq";
  return null;
}

export function isFreshPublicData(data, now) {
  if (!data || data.stale === true || !data.erddapTimestamp) return false;
  const currentTime = Number.isFinite(now) ? now : Date.now();
  const sourceTime = parseTimestamp(data.erddapTimestamp);
  if (sourceTime === null || sourceTime > currentTime + 5 * 60 * 1000) return false;
  const ageFromTimestamp = Math.max(0, (currentTime - sourceTime) / 60000);
  const reportedAge = Number(data.dataAgeMinutes);
  const age = Number.isFinite(reportedAge) && reportedAge >= 0
    ? Math.max(ageFromTimestamp, reportedAge)
    : ageFromTimestamp;
  return age <= MAX_DATA_AGE_MINUTES;
}

function validStatus(record) {
  return !!record && ALLOWED_STATUS.has(record.status);
}

function getWeeklyRows(data, beach) {
  const weekly = data && data.weekly && typeof data.weekly === "object" ? data.weekly : {};
  const entry = weekly[beach.id] || weekly[beach.slug] || null;
  if (Array.isArray(entry)) return entry;
  if (entry && Array.isArray(entry.forecast)) return entry.forecast;
  return [];
}

export function resolveTodayRecord(data, beach, now) {
  if (!beach || !isFreshPublicData(data, now)) return null;
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const level = levels.find((item) => item && (item.id === beach.id || item.id === beach.slug));
  if (validStatus(level)) {
    return {
      date: String(data.updatedAt || "").slice(0, 10),
      status: level.status,
      confidence: Number.isFinite(Number(level.confidence)) ? Number(level.confidence) : null,
      type: "observation",
      source: level.source || "erddap-satellite"
    };
  }
  const rows = getWeeklyRows(data, beach);
  const row = rows.find((item) => item && item.type === "observation") || rows[0];
  if (!validStatus(row)) return null;
  return {
    date: row.date || String(data.updatedAt || "").slice(0, 10),
    status: row.status,
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    type: row.type || "observation",
    source: Array.isArray(row.sources) ? row.sources.join(", ") : "satellite"
  };
}

export function resolveJ3Forecast(payload, publicData, beach, now) {
  if (!beach || !payload || payload.ok !== true || !payload.weekly || !isFreshPublicData(publicData, now)) return null;
  const forecastStamp = parseTimestamp(payload.updatedAt);
  const publicStamp = parseTimestamp(publicData.updatedAt);
  if (forecastStamp === null || publicStamp === null || Math.abs(forecastStamp - publicStamp) > MAX_FORECAST_SKEW_MS) return null;
  const rows = payload.weekly[beach.id] || payload.weekly[beach.slug] || null;
  if (!Array.isArray(rows) || rows.length < 4) return null;
  const base = rows.find((item) => item && item.type === "observation") || rows[0];
  const baseDate = typeof base?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(base.date) ? base.date : "";
  if (!baseDate) return null;
  const baseMs = Date.parse(baseDate + "T00:00:00Z");
  if (!Number.isFinite(baseMs)) return null;
  const targetDate = new Date(baseMs + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const record = rows.find((item) => item && item.date === targetDate);
  if (!validStatus(record) || record.type === "observation" || !Number.isFinite(Number(record.confidence))) return null;
  return {
    date: record.date,
    status: record.status,
    confidence: Number(record.confidence),
    type: record.type || "tendance",
    sources: Array.isArray(record.sources) ? record.sources.slice() : []
  };
}

export function buildShareUrl(currentHref, options) {
  const opts = options || {};
  const url = new URL(currentHref);
  if (opts.beachSlug) url.searchParams.set("beach", String(opts.beachSlug));
  else url.searchParams.delete("beach");
  if (opts.island && SUPPORTED_ISLANDS.includes(String(opts.island))) url.searchParams.set("island", String(opts.island));
  else url.searchParams.delete("island");
  if (opts.hotelName) url.searchParams.set("name", String(opts.hotelName).slice(0, 80));
  else url.searchParams.delete("name");
  if (opts.token) url.searchParams.set("k", String(opts.token));
  else url.searchParams.delete("k");
  url.hash = "";
  return url.toString();
}

export function getStatusMeta(status) {
  if (status === "clean") return { label: "PLAGE DÉGAGÉE", className: "clean" };
  if (status === "moderate") return { label: "PRUDENCE", className: "moderate" };
  if (status === "avoid") return { label: "À ÉVITER", className: "avoid" };
  return { label: "Donnée indisponible", className: "" };
}
