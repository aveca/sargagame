import React, { useRef, useEffect, useState, useCallback } from "react";
import { _t, COMIC, Veilleur, moodFromStatus } from "../Sargasses_PROD.jsx";
import { useSwipeClose } from "../useSwipeClose.js";

const INK = "#0d0b14";
const GOLD = "#FFC72C";
const GOLD_L = "#FFE47A";

function _t3(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr; }

function statusMeta(status, lang) {
  if (status === "clean") return { label: _t3(lang, "Propre", "Clean", "Limpia"), bg: "#E4F6EC", fg: "#0B6B3A", dot: "#00B086" };
  if (status === "moderate") return { label: _t3(lang, "Risque", "Caution", "Riesgo"), bg: "#FFF3D6", fg: "#8a5a00", dot: "#E8A800" };
  if (status === "avoid") return { label: _t3(lang, "À éviter", "Avoid", "Evitar"), bg: "#FDE7DF", fg: "#A32E12", dot: "#E8512A" };
  return { label: _t3(lang, "Bientôt", "Soon", "Pronto"), bg: "#eee", fg: "#555", dot: "#999" };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p, dLng = (lng2 - lng1) * p;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distLabel(d, lang) {
  if (d == null) return null;
  return d < 1 ? _t3(lang, "<1 km", "<1 km", "<1 km") : _t3(lang, `${d.toFixed(1)} km`, `${d.toFixed(1)} km`, `${d.toFixed(1)} km`);
}

/* ════════════════════════════════════════════════════════════════════════════
   SHARED STYLES (inline for scoping, no CSS file needed)
   ════════════════════════════════════════════════════════════════════════════ */

const cardBase = {
  background: "#fff", border: `2px solid ${INK}`, borderRadius: 16,
  boxShadow: `3px 3px 0 ${INK}`, overflow: "hidden", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
};

const btnGold = {
  minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  width: "100%", background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 14,
  boxShadow: `3px 3px 0 ${INK}`, fontWeight: 800, fontSize: "clamp(15px,4.2vw,17px)", cursor: "pointer", padding: "12px 16px"
};

const btnGhost = {
  minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "#fff", color: INK, border: `2px solid ${INK}`, borderRadius: 12,
  fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "10px 12px"
};

const pill = (m) => ({
  display: "inline-flex", alignItems: "center", gap: 6, background: m.bg, color: m.fg,
  borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800
});

const scoreBar = (score) => {
  if (score == null) return null;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const c = pct >= 68 ? "#00B086" : pct >= 40 ? "#E8A800" : "#E8512A";
  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 }
  }, React.createElement("div", { style: { flex: 1, height: 8, borderRadius: 99, background: "#eee", border: "1px solid #ddd", overflow: "hidden" } },
    React.createElement("div", { style: { width: pct + "%", height: "100%", background: c } })
  ), React.createElement("span", { style: { fontWeight: 800, fontSize: 13 } }, pct));
};

/* ════════════════════════════════════════════════════════════════════════════
   1. FeaturedBeachCard — Hero du jour (Accueil)
   Grande, storytelling, photo/illustration + verdict + raison + CTA principal
   ════════════════════════════════════════════════════════════════════════════ */

export function FeaturedBeachCard({ beach, lang = "fr", userPos, onOpen, onPremium, track }) {
  const m = statusMeta(beach.status, lang);
  const d = userPos && beach.lat != null && beach.lng != null ? haversineKm(userPos.lat, userPos.lng, beach.lat, beach.lng) : null;
  const mood = moodFromStatus(beach.status);

  return React.createElement("article", {
    style: { ...cardBase, width: "100%", maxWidth: 340, minHeight: 200, margin: "0 auto" },
    "data-testid": "xp-featured-card"
  },
    React.createElement("div", { style: { position: "relative", height: 120, background: "linear-gradient(135deg,#0B2230,#123a4d)" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.12),transparent 50%,rgba(0,0,0,.5))" } }),
      React.createElement("div", { style: { position: "absolute", top: "30%", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" } },
        React.createElement(Veilleur, { mood: mood, size: 64 })
      ),
      React.createElement("div", { style: { position: "absolute", bottom: 12, left: 12, right: 12, zIndex: 1 } },
        React.createElement("span", { style: { ...pill(m), fontSize: 13 } },
          React.createElement("span", { style: { width: 8, height: 8, borderRadius: 99, background: m.dot } }),
          m.label
        )
      )
    ),
    React.createElement("div", { style: { padding: 16 } },
      React.createElement("div", { style: { fontWeight: 800, fontSize: "clamp(17px,4.8vw,20px)", lineHeight: 1.2 } }, beach.name),
      beach.commune && React.createElement("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 2 } },
        beach.commune, d != null && ` · ${distLabel(d, lang)}`
      ),
      scoreBar(beach.score),
      beach.reason && React.createElement("div", { style: { fontSize: 13, marginTop: 8, opacity: 0.85 } }, beach.reason),
      React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14 } },
        React.createElement("button", { type: "button", onClick: () => { track?.("sg_home_featured_open", { beach_id: beach.id }); onOpen?.(beach); }, style: { ...btnGold, flex: 1 }, "data-testid": "xp-featured-open" }, _t3(lang, "J'y vais →", "Go →", "Voy →")),
        React.createElement("button", { type: "button", onClick: () => onPremium?.("home_featured"), style: { ...btnGhost, flex: 1 } }, _t3(lang, "Voir le Pass", "See Pass", "Ver el Pass"))
      )
    )
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   2. BeachCard — Standard (Plages, Ma Plage, sections)
   100% width, score bar, verdict pill, distance, favori, comparer, CTA
   ════════════════════════════════════════════════════════════════════════════ */

export function BeachCard({ beach, lang = "fr", userPos, isFav, inCompare, onOpen, onFav, onCompare, showAlt, allBeaches }) {
  const m = statusMeta(beach.status, lang);
  const d = userPos && beach.lat != null && beach.lng != null ? haversineKm(userPos.lat, userPos.lng, beach.lat, beach.lng) : null;
  const alts = showAlt && allBeaches ? findAlternatives(beach, allBeaches, { lang, maxAlternatives: 1 }) : [];

  return React.createElement("article", {
    style: { ...cardBase, marginBottom: 10, width: "100%" },
    "data-testid": "xp-beach-card", "data-beach": beach.id
  },
    React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: 12 } },
      React.createElement("div", { style: { minWidth: 0 } },
        React.createElement("div", { style: { fontWeight: 800, fontSize: "clamp(15px,4.4vw,17px)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" } }, beach.name),
        beach.commune && React.createElement("div", { style: { fontSize: 12, opacity: 0.7 } },
          beach.commune, d != null ? ` · ${distLabel(d, lang)}` : ""
        )
      ),
      React.createElement("span", { style: pill(m) },
        React.createElement("span", { style: { width: 8, height: 8, borderRadius: 99, background: m.dot } }),
        m.label
      )
    ),
    scoreBar(beach.score),
    beach.reason && React.createElement("div", { style: { fontSize: 13, margin: "6px 12px 0", opacity: 0.85 } }, beach.reason),
    alts.length && React.createElement("div", { style: { fontSize: 12, margin: "6px 12px 0" } },
      "↗ ", _t3(lang, "Alternative", "Alternative", "Alternativa"), " : ",
      React.createElement("b", null, alts[0].beach.name), ` (${alts[0].distanceKm} km)`
    ),
    React.createElement("div", { style: { display: "flex", gap: 8, padding: "0 12px 12px" } },
      React.createElement("button", { type: "button", onClick: () => onOpen?.(beach), style: { ...btnGold, flex: 1.4 }, "data-testid": "xp-open" }, _t3(lang, "Voir la fiche →", "Open →", "Ver ficha →")),
      React.createElement("button", { type: "button", onClick: () => onFav?.(beach), "aria-pressed": !!isFav, title: _t3(lang, "Favori", "Favorite", "Favorito"), style: { ...btnGhost, flex: "0 0 48px", minWidth: 48, fontSize: 18 } }, isFav ? "★" : "☆"),
      React.createElement("button", { type: "button", onClick: () => onCompare?.(beach), "aria-pressed": !!inCompare, title: _t3(lang, "Comparer", "Compare", "Comparar"), style: { ...btnGhost, flex: "0 0 48px", minWidth: 48 } }, "⇄")
    )
  );
}

function findAlternatives(beach, allBeaches, { lang, maxAlternatives = 3 }) {
  if (!beach || !allBeaches || beach.status === "clean") return [];
  return allBeaches
    .filter(b => b.id !== beach.id && b.island === beach.island && b.lat != null && b.status === "clean")
    .map(b => ({ beach: b, distanceKm: haversineKm(beach.lat, beach.lng, b.lat, b.lng) }))
    .filter(x => x.distanceKm <= 60)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxAlternatives);
}

/* ════════════════════════════════════════════════════════════════════════════
   3. CompactBeachCard — Listes horizontales (swipe carrousel)
   160px fixe, score bar, verdict pill, tap → ouvre fiche
   ════════════════════════════════════════════════════════════════════════════ */

export function CompactBeachCard({ beach, lang = "fr", userPos, onOpen }) {
  const m = statusMeta(beach.status, lang);
  const d = userPos && beach.lat != null && beach.lng != null ? haversineKm(userPos.lat, userPos.lng, beach.lat, beach.lng) : null;

  return React.createElement("article", {
    style: { ...cardBase, width: 160, height: 140, flexShrink: 0, cursor: "pointer" },
    onClick: () => onOpen?.(beach),
    "data-testid": "xp-compact-card", "data-beach": beach.id
  },
    React.createElement("div", { style: { position: "relative", height: 60, background: "linear-gradient(135deg,#0B2230,#123a4d)" } },
      React.createElement("span", { style: { position: "absolute", top: 8, left: 8, ...pill(m), fontSize: 10, padding: "2px 8px" } },
        React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: m.dot } }),
        m.label
      )
    ),
    React.createElement("div", { style: { padding: 10 } },
      React.createElement("div", { style: { fontWeight: 800, fontSize: 13, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, beach.name),
      beach.commune && React.createElement("div", { style: { fontSize: 11, opacity: 0.7, marginTop: 2 } }, beach.commune),
      scoreBar(beach.score),
      d != null && React.createElement("div", { style: { fontSize: 11, marginTop: 4, opacity: 0.7 } }, distLabel(d, lang))
    )
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   4. CompareCard — Comparateur (colonnes côte à côte)
   Score, confiance, différence, actions — colonne meilleure mise en évidence
   ════════════════════════════════════════════════════════════════════════════ */

export function CompareCard({ beach, lang = "fr", userPos, isBest, onOpen, onFav, onRemove, favorites = [] }) {
  const m = statusMeta(beach.status, lang);
  const d = userPos && beach.lat != null && beach.lng != null ? haversineKm(userPos.lat, userPos.lng, beach.lat, beach.lng) : null;
  const isFav = favorites.includes(beach.id);

  const row = { display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: "1px solid #eee", fontSize: 13 };

  return React.createElement("div", {
    key: beach.id,
    style: { ...cardBase, padding: 10, borderColor: isBest ? INK : "#999", background: isBest ? "#FFF6D6" : "#fff", minWidth: 0 }
  },
    React.createElement("div", { style: { fontWeight: 800, fontSize: 13, lineHeight: 1.2, minHeight: 32, overflow: "hidden" } },
      isBest ? "★ " : "", beach.name
    ),
    React.createElement("div", null, React.createElement("span", { style: pill(m) }, m.label)),
    React.createElement("div", { style: row }, React.createElement("span", null, _t3(lang, "Score", "Score", "Puntuación")), React.createElement("b", null, beach.score ?? "—")),
    React.createElement("div", { style: row }, React.createElement("span", null, _t3(lang, "Confiance", "Confidence", "Confianza")), React.createElement("b", null, beach.confidence ?? "—")),
    React.createElement("div", { style: row }, React.createElement("span", null, "km"), React.createElement("b", null, d != null ? d.toFixed(1) : "—")),
    React.createElement("div", { style: row }, React.createElement("span", null, _t3(lang, "Kids", "Kids", "Niños")), React.createElement("b", null, beach.kids ? "✓" : "—")),
    React.createElement("div", { style: row }, React.createElement("span", null, _t3(lang, "Snorkel", "Snorkel", "Snorkel")), React.createElement("b", null, beach.snorkel ? "✓" : "—")),
    React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
      React.createElement("button", { type: "button", onClick: () => onOpen?.(beach), style: { ...btnGhost, flex: 1, minWidth: 44 } }, "→"),
      React.createElement("button", { type: "button", onClick: () => onFav?.(beach), style: { ...btnGhost, flex: 1, minWidth: 44 } }, isFav ? "★" : "☆"),
      React.createElement("button", { type: "button", onClick: () => onRemove?.(beach), style: { ...btnGhost, flex: 1, minWidth: 44, color: "#E8512A", borderColor: "#E8512A" } }, "✕")
    )
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   5. DiscoveryCard — Contenu éditorial (activités, transport, POI, resorts)
   Photo/illustration + titre + sous-titre + CTA contextuel
   ════════════════════════════════════════════════════════════════════════════ */

export function DiscoveryCard({ type, title, subtitle, image, ctaLabel, onClick, badge }) {
  const iconMap = {
    activity: React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, "aria-hidden": "true" },
      React.createElement("path", { d: "M12 2a10 10 0 0 1 10 10c0 4.4-3.3 8-7.5 9-.9.2-1.8.3-2.7.3s-1.8-.1-2.7-.3C5.3 20 2 16.4 2 12a10 10 0 0 1 10-10z" }),
      React.createElement("path", { d: "M12 6v6l4 2" })
    ),
    transport: React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, "aria-hidden": "true" },
      React.createElement("path", { d: "M18 8c0-2.5-2-4.5-4.5-4.5S9 5.5 9 8c0 1.5.7 2.8 1.8 3.6V18" }),
      React.createElement("path", { d: "M6 18h.01M18 18h.01" }),
      React.createElement("path", { d: "M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" })
    ),
    poi: React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, "aria-hidden": "true" },
      React.createElement("path", { d: "M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" }),
      React.createElement("circle", { cx: 12, cy: 10, r: 2.5 })
    ),
    resort: React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, "aria-hidden": "true" },
      React.createElement("path", { d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }),
      React.createElement("path", { d: "M9 22V12h6v10" })
    )
  };

  const icon = iconMap[type] || iconMap.activity;

  return React.createElement("article", {
    style: { ...cardBase, width: 180, height: 200, flexShrink: 0, cursor: "pointer", display: "flex", flexDirection: "column" },
    onClick: onClick,
    "data-testid": "xp-discovery-card"
  },
    React.createElement("div", { style: { position: "relative", height: 90, background: "linear-gradient(135deg,#0B2230,#123a4d)" } },
      image && React.createElement("img", { src: image, alt: "", style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 } }),
      React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", opacity: 0.9 } }, icon),
      badge && React.createElement("span", { style: { position: "absolute", top: 8, right: 8, ...pill(badge), fontSize: 10, padding: "2px 8px" } }, badge.label)
    ),
    React.createElement("div", { style: { padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 } },
      React.createElement("div", { style: { fontWeight: 800, fontSize: 13, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } }, title),
      subtitle && React.createElement("div", { style: { fontSize: 11, opacity: 0.7 } }, subtitle),
      React.createElement("button", { type: "button", onClick: onClick, style: { ...btnGold, marginTop: "auto", fontSize: 13, padding: "10px 12px" } }, ctaLabel)
    )
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Horizontal Carousel Wrapper — for swipeable sections
   ════════════════════════════════════════════════════════════════════════════ */

export function HorizontalCarousel({ children, title, lang = "fr", testId }) {
  const [scrollX, setScrollX] = useState(0);
  const containerRef = useRef(null);

  const scrollLeft = useCallback(() => {
    containerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  }, []);

  const scrollRight = useCallback(() => {
    containerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
  }, []);

  return React.createElement("section", { style: { marginBottom: 24 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } },
      React.createElement("h2", { style: { fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: "clamp(20px,5.6vw,26px)", lineHeight: 1.05, margin: 0, letterSpacing: ".2px", color: "#FFFDF6" } }, title),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", { type: "button", onClick: scrollLeft, "aria-label": _t3(lang, "Précédent", "Previous", "Anterior"), style: { ...btnGhost, width: 40, height: 40, minWidth: 40, padding: 0, fontSize: 18 } }, "◀"),
        React.createElement("button", { type: "button", onClick: scrollRight, "aria-label": _t3(lang, "Suivant", "Next", "Siguiente"), style: { ...btnGhost, width: 40, height: 40, minWidth: 40, padding: 0, fontSize: 18 } }, "▶")
      )
    ),
    React.createElement("div", {
      ref: containerRef,
      "data-testid": testId,
      style: { display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory", paddingBottom: 8 },
      onScroll: e => setScrollX(e.currentTarget.scrollLeft)
    },
      React.Children.map(children, (child, i) => React.cloneElement(child, { style: { ...child.props.style, scrollSnapAlign: "start" } }))
    )
  );
}