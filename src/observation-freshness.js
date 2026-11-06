export function getObservationFreshness(data, now = Date.now()) {
 const raw = data?.erddapTimestamp
 if (typeof raw !== 'string') return { fresh: false, reason: 'unknown', ageMinutes: null }
 const timestamp = Date.parse(raw)
 if (!Number.isFinite(timestamp) || timestamp > now) return { fresh: false, reason: 'unknown', ageMinutes: null }
 const declared = data?.dataAgeMinutes
 if (declared != null && (!Number.isFinite(Number(declared)) || Number(declared) < 0)) return { fresh: false, reason: 'unknown', ageMinutes: (now - timestamp) / 60000 }
 const ageMinutes = declared == null ? (now - timestamp) / 60000 : Math.max((now - timestamp) / 60000, Number(declared))
 const stale = data?.stale === true || ageMinutes > 900
 return { fresh: !stale, reason: stale ? 'stale' : 'fresh', ageMinutes }
}
