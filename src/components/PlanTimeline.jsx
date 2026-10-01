/**
 * PlanTimeline — Living timeline view for Dynamic Beach Day Planner
 * Shows time slots with travel buffers, beach cards, activities, alternatives.
 * Rollback: ?dynamicplan=0
 */
import { useMemo } from "react";
import { haversineKm } from "../lib/beach-decision.js";
import { off as sgmOff } from "../lib/sgMotion.js";
import { Icon } from "../lib/sg-icons.jsx";

function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr; }

const INK = "#0d0b14";
const GOLD = "#FFC72C";
const CARD_BG = "#fff";
const CARD_BORDER = `2px solid ${INK}`;

const STATUS_META = {
  clean: { label: { fr: "Propre", en: "Clean", es: "Limpia" }, dot: "#22C55E", bg: "#E4F6EC", fg: "#0B6B3A" },
  moderate: { label: { fr: "Risque", en: "Caution", es: "Riesgo" }, dot: "#F59E0B", bg: "#FFF3D6", fg: "#8a5a00" },
  avoid: { label: { fr: "À éviter", en: "Avoid", es: "Evitar" }, dot: "#EF4444", bg: "#FDE7DF", fg: "#A32E12" },
  alert: { label: { fr: "Alerte", en: "Alert", es: "Alerta" }, dot: "#EF4444", bg: "#FDE7DF", fg: "#A32E12" },
};

function statusMeta(status, lang) {
  return STATUS_META[status] || { label: { fr: "—", en: "—", es: "—" }, dot: "#8A8F98", bg: "#eee", fg: "#555" };
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function travelTimeLabel(min, lang) {
  if (min == null) return _t(lang, "—", "—", "—");
  if (min < 1) return _t(lang, "< 1 min", "< 1 min", "< 1 min");
  if (min < 60) return _t(lang, `${min} min`, `${min} min`, `${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? _t(lang, `${h}h${m}`, `${h}h${m}`, `${h}h${m}`) : _t(lang, `${h}h`, `${h}h`, `${h}h`);
}

export function PlanTimeline({
  lang = "fr",
  slots = [],
  backupPlan = null,
  dayScore = 0,
  onSlotClick,
  onAlternativeClick,
  onAddToPlan,
  imageMap = null,
  isPremium = false,
  track,
}) {
  const SGM = !sgmOff();
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);

  const hasPlan = slots.some(s => s.beach);

  if (!hasPlan) {
    return (
      <div data-testid="plan-empty" style={{ padding: "24px 16px", textAlign: "center", background: CARD_BG, border: CARD_BORDER, borderRadius: 16, color: INK }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏖️</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{_t("Aucun plan possible", "No plan possible", "Sin plan posible")}</div>
        <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>{_t("Essayez d'autres critères ou une autre date.", "Try different criteria or another date.", "Prueba otros criterios u otra fecha.")}</div>
        <button type="button" onClick={() => track?.("sg_plan_retry", {})} style={{ padding: "12px 20px", background: GOLD, color: INK, border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{_t("Réessayer", "Try again", "Reintentar")}</button>
      </div>
    );
  }

  return (
    <section
      data-testid="plan-timeline"
      className={SGM ? "sgm-reveal" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      aria-label={_t("Plan de la journée", "Day plan", "Plan del día")}
    >
      {/* Day Score Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "linear-gradient(135deg,#FFE08A,#FFC72C)", color: INK, borderRadius: 14, border: `2px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 28, lineHeight: 1 }}>{Math.round(dayScore)}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.8 }}>{_t("Score du jour", "Day score", "Puntuación del día")}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{_t("Meilleur enchaînement possible", "Best possible sequence", "Mejor secuencia posible")}</div>
          </div>
        </div>
        {!isPremium && (
          <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(13,11,20,.15)", padding: "4px 10px", borderRadius: 999 }}>{_t("Version complète : Premium", "Full version: Premium", "Versión completa: Premium")}</span>
        )}
      </div>

      {/* Timeline Slots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slots.map((slot, i) => {
          const { beach, forecast, slot: slotInfo, score, travelMin, alternatives } = slot;
          const m = beach ? statusMeta(beach.status, lang) : null;

          // Travel buffer from previous slot
          const prevSlot = slots[i - 1];
          const travelBuffer = prevSlot && prevSlot.beach && beach && prevSlot.beach.id !== beach.id
            ? (travelMin || (prevSlot.travelMin || 0))
            : 0;

          return (
            <article
              key={slotInfo.index}
              data-testid={`plan-slot-${slotInfo.index}`}
              style={{
                background: CARD_BG, color: INK, border: CARD_BORDER, borderRadius: 14,
                boxShadow: `2px 2px 0 ${INK}`, overflow: "hidden",
                opacity: beach ? 1 : 0.5,
              }}
            >
              {/* Slot Header: Time + Travel */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F5F0E8", borderBottom: `1px solid ${INK}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, fontWeight: 400, color: GOLD }}>{slotInfo.label}</span>
                  {travelBuffer && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#8a5a00", background: "#FFF8E1", padding: "2px 8px", borderRadius: 999 }}>
                      <Icon name="car" size={12} /> {travelTimeLabel(travelBuffer, lang)}
                    </span>
                  )}
                </div>
                {beach && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: m.bg, color: m.fg, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.dot }} />
                    {m.label[lang]}
                  </span>
                )}
              </div>

              {/* Beach Card */}
              {beach ? (
                <div
                  style={{ padding: 12, display: "flex", gap: 12 }}
                  onClick={() => onSlotClick?.(slot, i)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSlotClick?.(slot, i); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={_t(`Créneau ${slotInfo.label} : ${beach.name}`, `Slot ${slotInfo.label} : ${beach.name}`, `Franja ${slotInfo.label} : ${beach.name}`)}
                >
                  {/* Photo */}
                  {(() => {
                    const img = beach && imageMap && imageMap[beach.id] ? "/beaches/" + imageMap[beach.id] : null;
                    return img ? (
                      <img src={img} alt={`${beach.name} — ${beach.commune || ""}`} loading="lazy" width="800" height="450"
                        style={{ width: 80, height: 80, minWidth: 80, borderRadius: 10, objectFit: "cover", border: `2px solid ${INK}`, flexShrink: 0 }}
                        onError={e => { e.currentTarget.style.display = "none" }} />
                    ) : null;
                  })()}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{beach.name}</div>
                        {beach.commune && <div style={{ fontSize: 12, opacity: 0.6 }}>{beach.commune}</div>}
                      </div>
                      <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 12, letterSpacing: ".06em", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8, padding: "2px 8px", flexShrink: 0 }}>J{slotInfo.index + 1}</span>
                    </div>

                    {/* Activity badges */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {beach.kids && <span style={{ fontSize: 10, fontWeight: 700, background: "#E4F6EC", color: "#0B6B3A", padding: "2px 8px", borderRadius: 999 }}>{_t("👨‍👩‍👧 Famille", "👨‍👩‍👧 Family", "👨‍👩‍👧 Familia")}</span>}
                      {beach.snorkel && <span style={{ fontSize: 10, fontWeight: 700, background: "#E0F7FA", color: "#006064", padding: "2px 8px", borderRadius: 999 }}>{_t("🤿 Snorkel", "🤿 Snorkel", "🤿 Snorkel")}</span>}
                      {beach.status === "clean" && <span style={{ fontSize: 10, fontWeight: 700, background: "#E4F6EC", color: "#0B6B3A", padding: "2px 8px", borderRadius: 999 }}>{_t("🏊 Nage", "🏊 Swim", "🏊 Nadar")}</span>}
                      {beach.coast === "sheltered" && <span style={{ fontSize: 10, fontWeight: 700, background: "#FFF8E1", color: "#8a5a00", padding: "2px 8px", borderRadius: 999 }}>{_t("🏝 Abritée", "🏝 Sheltered", "🏝 Protegida")}</span>}
                    </div>

                    {/* Score + Confidence + Travel */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, opacity: 0.8 }}>
                      {forecast?.score != null && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{_t("Score", "Score", "Score")} {Math.round(forecast.score)}/100</span>}
                      {forecast?.confidence != null && <span style={{ fontWeight: 700, color: m.dot }}>{_t("Confiance", "Confidence", "Confianza")} {forecast.confidence}%</span>}
                      {travelMin != null && <span style={{ fontWeight: 700, color: "#8a5a00" }}><Icon name="car" size={12} /> {travelTimeLabel(travelMin, lang)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={e => { e.stopPropagation(); onAlternativeClick?.(slot, i); }} style={{ padding: "8px 12px", background: "#FFF8E1", color: "#8a5a00", border: `2px solid ${INK}`, borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="swap" size={14} /> {_t("Alternatives", "Alternatives", "Alternativas")} ({alternatives?.length || 0})
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); onAddToPlan?.(beach, slotInfo); }} className="xp-gold xp-gold" style={{ padding: "10px 14px", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `2px 2px 0 ${INK}` }}>
                      {_t("Ajouter", "Add", "Añadir")}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "20px 12px", textAlign: center, color: "rgba(13,11,20,.5)" }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🔒</div>
                  <div style={{ fontWeight: 700 }}>{_t("Créneau verrouillé", "Slot locked", "Franja bloqueada")}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{_t("Débloquez avec Premium", "Unlock with Premium", "Desbloquea con Premium")}</div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Backup Plan */}
      {backupPlan && backupPlan.length && (
        <section data-testid="plan-backup" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(30,200,176,.12)", border: "2px solid rgba(30,200,176,.4)", borderRadius: 12, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1EC8B0" }} />
            <span style={{ fontWeight: 800, fontSize: 13, color: "#1EC8B0" }}>{_t("Plan B — si ça change", "Plan B — if it shifts", "Plan B — si cambia")}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {backupPlan.map((b, i) => {
              const m = b.beach ? statusMeta(b.beach.status, lang) : null;
              return (
                <button key={i} type="button" onClick={() => onAlternativeClick?.(b, i)} style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px", background: CARD_BG, border: CARD_BORDER, borderRadius: 12, cursor: "pointer" }}>
                  {b.beach && (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.dot }} />
                      <span style={{ fontWeight: 800, fontSize: 12, textAlign: "center" }}>{b.beach.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: m.fg, background: m.bg, padding: "2px 8px", borderRadius: 999 }}>{m.label[lang]}</span>
                      {b.travelMin != null && <span style={{ fontSize: 10, color: "#8a5a00" }}><Icon name="car" size={12} /> {travelTimeLabel(b.travelMin, lang)}</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Day Summary Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "12px", background: "#F5F0E8", border: `1px dashed ${INK}`, borderRadius: 12, marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: GOLD }}>{slots.filter(s => s.beach).length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>{_t("PLAGES", "BEACHES", "PLAYAS")}</div>
        </div>
        <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: "#1EC8B0" }}>{slots.reduce((sum, s) => sum + (s.travelMin || 0), 0)}</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>{_t("MIN TRAJET", "TRAVEL MIN", "MIN VIAJE")}</div>
        </div>
        <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: INK }}>{slots.filter(s => s.beach?.status === "clean").length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>{_t("PROPRES", "CLEAN", "LIMPIAS")}</div>
        </div>
        <div style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: INK }}>{slots.reduce((sum, s) => sum + (s.slot?.duration || 0), 0)}</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>{_t("MIN PLAGE", "BEACH MIN", "MIN PLAYA")}</div>
        </div>
      </div>
    </section>
  );
}

export default PlanTimeline;