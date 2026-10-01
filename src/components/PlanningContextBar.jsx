/**
 * PlanningContextBar — Context bar for Dynamic Beach Day Planner
 * Date, time, duration, location, activities — all in one responsive bar.
 * Rollback: ?dynamicplan=0 hides this, shows legacy TripPlanner.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { off as sgmOff } from "../lib/sgMotion.js";

function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr; }

const INK = "#0d0b14";
const GOLD = "#FFC72C";
const CARD_BG = "#fff";
const CARD_BORDER = `2px solid ${INK}`;

const ACTIVITY_OPTIONS = [
  { id: "swim", icon: "swim", label: { fr: "Nager", en: "Swim", es: "Nadar" } },
  { id: "snorkel", icon: "snorkel", label: { fr: "Snorkeling", en: "Snorkel", es: "Snorkel" } },
  { id: "family", icon: "family", label: { fr: "Enfants", en: "Kids", es: "Niños" } },
  { id: "walk", icon: "walk", label: { fr: "Balade", en: "Walk", es: "Paseo" } },
  { id: "photo", icon: "camera", label: { fr: "Photos", en: "Photos", es: "Fotos" } },
  { id: "sunset", icon: "sunset", label: { fr: "Coucher", en: "Sunset", es: "Atardecer" } },
];

export const dynamicPlanOff = () => {
  try { return /[?&]dynamicplan=0(?:&|$)/.test(window.location.search); } catch (_) { return false; }
};

export function PlanningContextBar({
  lang = "fr",
  date,
  startTime,
  duration,
  startPos,
  activities,
  onChange,
  onLocateMe,
  onOpenMap,
  isLoading = false,
}) {
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);
  const [expanded, setExpanded] = useState(false);
  const [activePopover, setActivePopover] = useState(null); // 'date' | 'time' | 'duration' | 'location' | 'activities'
  const popoverRef = useRef(null);
  const SGM = !sgmOff();

  // Click outside to close popovers
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const formatDate = (d) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; }
  };

  const formatDuration = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return _t(`${h}h${m}`, `${h}h${m}`, `${h}h${m}`);
    if (h) return _t(`${h}h`, `${h}h`, `${h}h`);
    return _t(`${m}min`, `${m}min`, `${m}min`);
  };

  const locationLabel = useMemo(() => {
    if (!startPos) return _t("Ma position", "My location", "Mi ubicación");
    return _t(`${startPos.lat.toFixed(2)}, ${startPos.lng.toFixed(2)}`, `${startPos.lat.toFixed(2)}, ${startPos.lng.toFixed(2)}`, `${startPos.lat.toFixed(2)}, ${startPos.lng.toFixed(2)}`);
  }, [startPos, lang]);

  const renderPopover = (key, content) => {
    if (activePopover !== key) return null;
    return (
      <div
        className={SGM ? "sgm-popin" : undefined}
        style={{
          position: "fixed", inset: 0, zIndex: 1400,
          background: "rgba(11,7,22,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={() => setActivePopover(null)}
      >
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: CARD_BG, border: CARD_BORDER, borderRadius: "20px 20px 0 0", padding: "16px", boxShadow: "0 -10px 40px rgba(0,0,0,.3)" }}>
          {content}
          <button type="button" onClick={() => setActivePopover(null)} style={{ marginTop: 12, width: "100%", padding: "12px", background: INK, color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{_t("Fermer", "Close", "Cerrar")}</button>
        </div>
      </div>
    );
  };

  return (
    <>
      <section
        data-testid="planning-context-bar"
        className={SGM ? "sgm-reveal" : undefined}
        style={{
          background: CARD_BG, color: INK, border: CARD_BORDER, borderRadius: 16,
          boxShadow: `3px 3px 0 ${INK}`, padding: "10px 12px", marginBottom: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        {/* Row 1: Date + Time + Duration */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setActivePopover(activePopover === "date" ? null : "date")}
            style={{ flex: "0 0 auto", minWidth: 140, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, cursor: "pointer" }}
            aria-expanded={activePopover === "date"}
            aria-haspopup="dialog"
          >
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{formatDate(date)}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePopover(activePopover === "time" ? null : "time")}
            style={{ flex: "0 0 auto", minWidth: 110, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, cursor: "pointer" }}
            aria-expanded={activePopover === "time"}
            aria-haspopup="dialog"
          >
            <span style={{ fontSize: 18 }}>🕐</span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{startTime}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePopover(activePopover === "duration" ? null : "duration")}
            style={{ flex: 1, minWidth: 100, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, cursor: "pointer" }}
            aria-expanded={activePopover === "duration"}
            aria-haspopup="dialog"
          >
            <span style={{ fontSize: 18 }}>⏱</span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{formatDuration(duration)}</span>
          </button>
        </div>

        {/* Row 2: Location + Activities */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setActivePopover(activePopover === "location" ? null : "location")}
            style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#FFF8E1", border: `2px solid ${INK}`, borderRadius: 12, cursor: "pointer", justifyContent: "space-between" }}
            aria-expanded={activePopover === "location"}
            aria-haspopup="dialog"
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 18 }}>📍</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: INK }}>{locationLabel}</span>
            </span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onLocateMe?.(); }} style={{ padding: "6px 10px", background: GOLD, color: INK, border: `2px solid ${INK}`, borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{_t("Me situer", "Locate me", "Situarme")}</button>
          </button>

          <button
            type="button"
            onClick={() => setActivePopover(activePopover === "activities" ? null : "activities")}
            style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: activities?.length ? "#E4F6EC" : "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, cursor: "pointer" }}
            aria-expanded={activePopover === "activities"}
            aria-haspopup="dialog"
          >
            <span style={{ fontSize: 18 }}>🏷</span>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{activities?.length || 0}</span>
          </button>

          <button type="button" onClick={onOpenMap} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "linear-gradient(135deg,#FFE08A,#FFC72C)", color: INK, border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            <span style={{ fontSize: 18 }}>🗺</span>
            <span>{_t("Carte", "Map", "Mapa")}</span>
          </button>
        </div>

        {/* Expandable advanced options */}
        {expanded && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, paddingTop: 8, borderTop: `1px dashed ${INK}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={false} onChange={e => onChange?.({ preferSheltered: e.target.checked })} style={{ width: 18, height: 18, accentColor: GOLD }} />
              {_t("Côtes abritées", "Sheltered coasts", "Costas protegidas")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={false} onChange={e => onChange?.({ avoidCrowds: e.target.checked })} style={{ width: 18, height: 18, accentColor: GOLD }} />
              {_t("Éviter foule", "Avoid crowds", "Evitar multitudes")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={true} onChange={e => onChange?.({ minConfidence: e.target.checked ? 40 : 0 })} style={{ width: 18, height: 18, accentColor: GOLD }} />
              {_t("Confiance ≥ 40%", "Confidence ≥ 40%", "Confianza ≥ 40%")}
            </label>
          </div>
        )}

        <button type="button" onClick={() => setExpanded(!expanded)} style={{ alignSelf: "flex-start", padding: "6px 10px", background: "none", border: `1px dashed ${INK}`, borderRadius: 999, fontSize: 11, fontWeight: 800, color: INK, cursor: "pointer" }}>
          {expanded ? _t("Masquer options", "Hide options", "Ocultar opciones") : _t("Plus d'options", "More options", "Más opciones")}
        </button>
      </section>

      {/* Popovers */}
      <div ref={popoverRef}>
        {renderPopover("date", (
          <>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{_t("Choisir la date", "Choose date", "Elegir fecha")}</div>
            <input type="date" value={date} onChange={e => { onChange?.({ date: e.target.value }); setActivePopover(null); }} style={{ width: "100%", padding: "12px", fontSize: 16, border: `2px solid ${INK}`, borderRadius: 12, background: "#fff" }} min={new Date().toISOString().split("T")[0]} max={new Date(Date.now() + 14*86400000).toISOString().split("T")[0]} />
          </>
        ))}
        {renderPopover("time", (
          <>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{_t("Heure de début", "Start time", "Hora de inicio")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map(t => (
                <button key={t} type="button" onClick={() => { onChange?.({ startTime: t }); setActivePopover(null); }} style={{ padding: "12px", background: t === startTime ? GOLD : "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, cursor: "pointer", color: INK }}>{t}</button>
              ))}
            </div>
          </>
        ))}
        {renderPopover("duration", (
          <>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{_t("Durée dispo", "Available duration", "Duración disponible")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[120, 180, 240, 300, 360, 420, 480].map(m => (
                <button key={m} type="button" onClick={() => { onChange?.({ duration: m }); setActivePopover(null); }} style={{ padding: "12px", background: m === duration ? GOLD : "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, cursor: "pointer", color: INK }}>{formatDuration(m)}</button>
              ))}
            </div>
          </>
        ))}
        {renderPopover("location", (
          <>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{_t("Point de départ", "Starting point", "Punto de partida")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => { onChange?.({ startPos: null }); setActivePopover(null); onLocateMe?.(); }} style={{ padding: "14px", background: "#E4F6EC", border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: "#0B6B3A" }}>
                <span style={{ fontSize: 20 }}>📍</span>
                <span>{_t("Ma position GPS", "My GPS location", "Mi ubicación GPS")}</span>
              </button>
              <button type="button" onClick={onOpenMap} style={{ padding: "14px", background: "#FFF8E1", border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: "#8a5a00" }}>
                <span style={{ fontSize: 20 }}>🗺</span>
                <span>{_t("Choisir sur la carte", "Pick on map", "Elegir en el mapa")}</span>
              </button>
              <div style={{ fontSize: 12, color: "rgba(13,11,20,.5)" }}>{_t("Ou entrez des coordonnées", "Or enter coordinates", "O ingrese coordenadas")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" step="any" placeholder="Lat" style={{ flex: 1, padding: "10px", border: `2px solid ${INK}`, borderRadius: 8, fontSize: 14 }} />
                <input type="number" step="any" placeholder="Lng" style={{ flex: 1, padding: "10px", border: `2px solid ${INK}`, borderRadius: 8, fontSize: 14 }} />
              </div>
            </div>
          </>
        ))}
        {renderPopover("activities", (
          <>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{_t("Activités voulues", "Desired activities", "Actividades deseadas")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACTIVITY_OPTIONS.map(opt => (
                <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: activities?.includes(opt.id) ? GOLD : "#F5F0E8", border: `2px solid ${INK}`, borderRadius: 999, cursor: "pointer", fontWeight: 800, fontSize: 13, color: INK }}>
                  <input type="checkbox" checked={activities?.includes(opt.id)} onChange={e => onChange?.({ activities: e.target.checked ? [...(activities||[]), opt.id] : (activities||[]).filter(a => a !== opt.id) })} style={{ width: 18, height: 18, accentColor: INK }} />
                  <span>{_t(opt.label.fr, opt.label.en, opt.label.es)}</span>
                </label>
              ))}
            </div>
          </>
        ))}
      </div>
    </>
  );
}

export default PlanningContextBar;