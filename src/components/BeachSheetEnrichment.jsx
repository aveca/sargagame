import React from "react";

function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => typeof v !== "number" || isNaN(v))) return Infinity;
  const R = 6371, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const COMIC = {
  ink: "#0D0D0D",
  cream: "#FFFEF5",
  gold: "#FFC72C",
  clean: "#22C55E",
  moderate: "#FFC72C",
  avoid: "#E8522A",
  blue: "#0EA5E9",
  sub: "#6B6B6B"
};

const STATUS_COLOR = { clean: "#22C55A", moderate: "#D97706", avoid: "#DC2626" };

const STATUS_LABEL = {
  fr: { clean: "Propre", moderate: "Modéré", avoid: "À éviter" },
  en: { clean: "Clean", moderate: "Moderate", avoid: "Avoid" },
  es: { clean: "Limpia", moderate: "Moderada", avoid: "Evitar" }
};

function _t(lang, fr, en, es) {
  return lang === "es" ? es : lang === "en" ? en : fr;
}

function _sectionTitle(fr, en, es) {
  // Will be called with proper lang context
  return fr;
}

export function BeachSheetEnrichment({
  beach,
  regionId,
  lang,
  allBeaches,
  resorts,
  onBeachClick,
  track
}) {
  // Nearby beaches (≤5km, same region, exclude self)
  const nearbyBeaches = React.useMemo(() => {
    if (!beach || !allBeaches?.length) return [];
    const out = [];
    for (const b of allBeaches || []) {
      if (!b || b.id === beach.id || b.island !== beach.island) continue;
      const d = haversine(beach.lat, beach.lng, b.lat, b.lng);
      if (!isFinite(d) || d > 5) continue;
      out.push({ beach: b, km: d });
    }
    out.sort((a, b) => a.km - b.km);
    return out.slice(0, 3);
  }, [beach, allBeaches]);

  const beachResorts = React.useMemo(() => {
    return (resorts || []).filter(r => r.beachId === beach.id);
  }, [resorts, beach?.id]);

  const facts = React.useMemo(() => {
    const out = [];
    if (beach.kids) out.push(lang === "es" ? "Niños OK" : lang === "en" ? "Kids OK" : "Enfants OK");
    if (beach.snorkel) out.push("Snorkel");
    if (beach.parking) out.push("Parking");
    return out;
  }, [beach, lang]);

  const activities = React.useMemo(() => {
    const out = [];
    if (beach.snorkel) out.push({ slug: "snorkel", label: "Snorkel" });
    if (beach.kids) {
      out.push({ slug: "kids", label: lang === "es" ? "Niños" : lang === "en" ? "Kids" : "Enfants" });
      out.push({ slug: "family", label: lang === "es" ? "Familia" : lang === "en" ? "Family" : "Famille" });
    }
    if (beach.parking) out.push({ slug: "parking", label: "Parking" });
    return out;
  }, [beach, lang]);

  const hasAny = nearbyBeaches.length || beachResorts.length || facts.length || activities.length;
  if (!hasAny) return null;

  const trk = (n, p) => { try { track?.(n, p) } catch (_) {} };

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Nearby beaches */}
      {nearbyBeaches.length > 0 && (
        <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
          <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8" />
            </svg>
            Plages proches
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {nearbyBeaches.map((b, i) => (
              <button
                key={b.id}
                className="bsc-row"
                onClick={() => {
                  trk("sg_nearby_pick", { from: beach.id, to: b.id, rank: i });
                  onBeachClick?.(b);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "8px 10px", borderRadius: 10,
                  border: "2.5px solid #667eea", background: "#fff",
                  boxShadow: "2px 2px 0 #667eea", cursor: "pointer",
                  font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", textAlign: "left"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <i style={{ width: 8, height: 8, borderRadius: "50%", background: "#667eea", flexShrink: 0 }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                </span>
                <span style={{ color: "#6B6B6B", font: "700 11px/1 'Bricolage Grotesque'", whiteSpace: "nowrap" }}>
                  {Math.round(haversine(beach.lat, beach.lng, b.lat, b.lng))} km →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resorts */}
      {(resorts || []).length > 0 && (
        <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
          <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Hébergements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(resorts || []).slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 10, border: "2.5px solid #667eea", background: "#fff", boxShadow: "2px 2px 0 #667eea" }}>
                <span style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D" }}>{r.name}</span>
                <span style={{ color: "#6B6B6B", font: "700 11px/1 'Bricolage Grotesque'" }}>{r.area || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facts */}
      {(() => {
        const facts = [];
        if (beach.kids) facts.push(lang === "es" ? "Niños OK" : lang === "en" ? "Kids OK" : "Enfants OK");
        if (beach.snorkel) facts.push("Snorkel");
        if (beach.parking) facts.push("Parking");
        if (!facts.length) return null;
        return (
          <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
            <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8" />
              </svg>
              Caractéristiques
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {facts.map((f, i) => (
                <span key={i} style={{ background: "#e2e8f0", margin: "2px 6px", padding: "2px 8px", borderRadius: 4, font: "700 10px/1 'Bricolage Grotesque'", color: "#0D0D0D" }}>{f}</span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Activities */}
      {(() => {
        const acts = [];
        if (beach.snorkel) acts.push({ slug: "snorkel", label: "Snorkel" });
        if (beach.kids) {
          acts.push({ slug: "kids", label: "Enfants" });
          acts.push({ slug: "family", label: "Famille" });
        }
        if (beach.parking) acts.push({ slug: "parking", label: "Parking" });
        if (!acts.length) return null;
        return (
          <div className="bsc-card" style={{ padding: "12px 14px", background: "#FFFEF5" }}>
            <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M12 22V12" />
                <path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z" />
                <path d="M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0" />
              </svg>
              À faire
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {acts.map((a, i) => (
                <button
                  key={a.slug}
                  className="bsc-row"
                  onClick={() => { trk("sg_activity_pick", { beach: beach.id, activity: a.slug }); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "8px 10px", borderRadius: 10, border: "2.5px solid #667eea", background: "#fff",
                    boxShadow: "2px 2px 0 #667eea", cursor: "pointer",
                    font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", textAlign: "left"
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ background: "#667eea", color: "#fff", padding: "2px 8px", borderRadius: 4, font: "700 10px/1 'Bricolage Grotesque'" }}>{a.label}</span>
                  </span>
                  <span style={{ color: "#6B6B6B", font: "700 11px/1 'Bricolage Grotesque'", whiteSpace: "nowrap" }}>→</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default BeachSheetEnrichment;