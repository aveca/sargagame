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
  return fr;
}

// Activity category icons (inline SVG, zero deps)
const ACTIVITY_ICONS = {
  snorkel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/><circle cx="12" cy="10" r="2"/></svg>`,
  kids: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21a9 9 0 0 1 12 0"/><path d="M6 15a3 3 0 0 1 6 0"/></svg>`,
  family: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  parking: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>`,
  beach: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/></svg>`
};

// Distance formatting
function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
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

  // Activities with proper categorization
  const activities = React.useMemo(() => {
    const categories = {
      snorkeling: [],
      family: [],
      parking: []
    };
    
    if (beach.snorkel) {
      categories.snorkeling.push({
        id: "snorkel",
        label: lang === "es" ? "Snorkeling" : lang === "en" ? "Snorkeling" : "Snorkeling",
        icon: "snorkel"
      });
    }
    if (beach.kids) {
      categories.family.push({
        id: "kids",
        label: lang === "es" ? "Para niños" : lang === "en" ? "Kids friendly" : "Enfants OK",
        icon: "kids"
      });
      categories.family.push({
        id: "family",
        label: lang === "es" ? "Familia" : lang === "en" ? "Family" : "Famille",
        icon: "family"
      });
    }
    if (beach.parking) {
      categories.parking.push({
        id: "parking",
        label: lang === "es" ? "Aparcamiento" : lang === "en" ? "Parking" : "Parking",
        icon: "parking"
      });
    }
    return categories;
  }, [beach, lang]);

  const hasAny = nearbyBeaches.length || beachResorts.length || facts.length || 
    activities.snorkeling.length || activities.family.length || activities.parking.length;
  if (!hasAny) return null;

  const trk = (n, p) => { try { track?.(n, p) } catch (_) {} };

  // Helper for distance display
  const formatDist = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km)} km`;

  // Check if region has resort data (FL, PC, RM only)
  const hasResortData = ["florida", "puntacana", "rivieramaya"].includes(regionId);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* === 1. NEARBY BEACHES - Improved visual with distance badge === */}
      {nearbyBeaches.length > 0 && (
        <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
          <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8" />
            </svg>
            <span>Plages proches</span>
            <span style={{ font: "700 10px/1 'Bricolage Grotesque'", color: "#667eea", background: "#e8eaff", padding: "1px 6px", borderRadius: 999, border: "1px solid #667eea" }}>
              {nearbyBeaches.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {nearbyBeaches.map((b, i) => {
              const dist = haversine(beach.lat, beach.lng, b.lat, b.lng);
              return (
                <button
                  key={b.id}
                  className="bsc-row"
                  onClick={() => {
                    trk("sg_nearby_pick", { from: beach.id, to: b.id, rank: i });
                    onBeachClick?.(b);
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "10px 12px", borderRadius: 10,
                    border: "2.5px solid #667eea", background: "#fff",
                    boxShadow: "2px 2px 0 #667eea", cursor: "pointer",
                    font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", textAlign: "left"
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8" />
                    </svg>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>{b.name}</span>
                  </span>
                  <span style={{ 
                    display: "flex", alignItems: "center", gap: 4,
                    font: "700 11px/1 'Bricolage Grotesque'", 
                    color: "#667eea", whiteSpace: "nowrap",
                    background: "#e8eaff", padding: "2px 8px", borderRadius: 999, border: "1px solid #667eea"
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/>
                    </svg>
                    <span>{dist < 1 ? `${Math.round(dist * 1000)} m` : `${Math.round(dist)} km`}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* === 2. RESORTS - Only for FL/PC/RM, with count badge === */}
      {(resorts || []).length > 0 && hasResortData && (
        <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
          <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Hébergements
            <span style={{ font: "700 10px/1 'Bricolage Grotesque'", color: "#22C55E", background: "#dcfce7", padding: "1px 6px", borderRadius: 999, border: "1px solid #22C55E" }}>
              {beachResorts.length} vérifiés
            </span>
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

      {/* === 3. ACTIVITIES - Categorized with icons === */}
      {(() => {
        const categories = [];
        
        // Snorkeling / Baignade category
        if (beach.snorkel) {
          categories.push({
            key: "snorkeling",
            title: lang === "es" ? "Snorkeling / Bañarse" : lang === "en" ? "Snorkeling / Swimming" : "Snorkeling / Baignade",
            icon: "snorkel",
            items: [{ id: "snorkel", label: lang === "es" ? "Snorkeling" : lang === "en" ? "Snorkeling" : "Snorkeling" }]
          });
        }
        
        // Famille / Kids category
        if (beach.kids) {
          categories.push({
            key: "family",
            title: lang === "es" ? "Familia / Niños" : lang === "en" ? "Family / Kids" : "Famille / Enfants",
            icon: "family",
            items: [
              { id: "kids", label: lang === "es" ? "Para niños" : lang === "en" ? "Kids friendly" : "Enfants OK" },
              { id: "family", label: lang === "es" ? "Familia" : lang === "en" ? "Family" : "Famille" }
            ]
          });
        }
        
        // Parking / Accessibilité category
        if (beach.parking) {
          categories.push({
            key: "parking",
            title: lang === "es" ? "Acceso / Parking" : lang === "en" ? "Access / Parking" : "Accès / Parking",
            icon: "parking",
            items: [{ id: "parking", label: lang === "es" ? "Aparcamiento" : lang === "en" ? "Parking" : "Parking" }]
          });
        }
        
        if (!categories.length) return null;
        
        return (
          <div className="bsc-card" style={{ padding: "12px 14px", background: "#FFFEF5" }}>
            <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M12 22V12" />
                <path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z" />
                <path d="M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0" />
              </svg>
              À faire
              <span style={{ font: "700 10px/1 'Bricolage Grotesque'", color: "#667eea", background: "#e8eaff", padding: "1px 6px", borderRadius: 999, border: "1px solid #667eea" }}>
                {categories.reduce((sum, c) => sum + c.items.length, 0)}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {categories.map((cat) => (
                <div key={cat.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ font: "700 10px/1 'Bricolage Grotesque'", color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {cat.title}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cat.items.map((item) => (
                      <button
                        key={item.id}
                        className="bsc-row"
                        onClick={() => { trk("sg_activity_pick", { beach: beach.id, activity: item.id, category: cat.key }); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px", borderRadius: 8, 
                          border: "2px solid #e8eaff", background: "#fff",
                          boxShadow: "1px 1px 0 #667eea", cursor: "pointer",
                          font: "700 11px/1 'Bricolage Grotesque'", color: "#0D0D0D", textAlign: "left",
                          transition: "all 0.15s ease"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.boxShadow = "2px 2px 0 #667eea"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e8eaff"; e.currentTarget.style.boxShadow = "1px 1px 0 #667eea"; }}
                      >
                        <span style={{ 
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 28, height: 28, borderRadius: 6, background: "#e8eaff", color: "#667eea", flexShrink: 0
                        }}>
                          {cat.icon === "snorkel" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/><circle cx="12" cy="10" r="2"/></svg>}
                          {cat.icon === "kids" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21a9 9 0 0 1 12 0"/><path d="M6 15a3 3 0 0 1 6 0"/></svg>}
                          {cat.icon === "family" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                          {cat.icon === "parking" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>}
                        </span>
                        <span style={{ font: "700 11px/1 'Bricolage Grotesque'", color: "#0D0D0D", flex: 1 }}>{item.label}</span>
                        <span style={{ color: "#6B6B6B", font: "700 11px/1 'Bricolage Grotesque'" }}>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* === 4. FACTS - Keep as chips === */}
      {(() => {
        const facts = [];
        if (beach.kids) facts.push({ label: lang === "es" ? "Niños OK" : lang === "en" ? "Kids OK" : "Enfants OK", icon: "kids" });
        if (beach.snorkel) facts.push({ label: "Snorkel", icon: "snorkel" });
        if (beach.parking) facts.push({ label: "Parking", icon: "parking" });
        if (!facts.length) return null;
        return (
          <div className="bsc-card" style={{ padding: "12px 14px", marginBottom: 10, background: "#FFFEF5" }}>
            <div style={{ font: "800 12px/1 'Bricolage Grotesque'", color: "#0D0D0D", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8" />
              </svg>
              Caractéristiques
              <span style={{ font: "700 10px/1 'Bricolage Grotesque'", color: "#667eea", background: "#e8eaff", padding: "1px 6px", borderRadius: 999, border: "1px solid #667eea" }}>
                {facts.length}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {facts.map((f, i) => (
                <span key={i} style={{ 
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "#e2e8f0", margin: "2px 6px", padding: "4px 10px", borderRadius: 999, 
                  font: "700 10px/1 'Bricolage Grotesque'", color: "#0D0D0D",
                  border: "1px solid #cbd5e1"
                }}>
                  {f.icon === "kids" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21a9 9 0 0 1 12 0"/><path d="M6 15a3 3 0 0 1 6 0"/></svg>}
                  {f.icon === "snorkel" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4"/><path d="M18 18a6 6 0 0 0-12 0"/><path d="M6 14a8 8 0 0 1 12 0"/><circle cx="12" cy="10" r="2"/></svg>}
                  {f.icon === "parking" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17v-5"/><path d="M15 17v-5"/></svg>}
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default BeachSheetEnrichment;