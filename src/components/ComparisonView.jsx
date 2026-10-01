/**
 * ComparisonView — Side-by-side comparison of two plans/scenarios
 * Rollback: ?dynamicplan=0
 */
import { useMemo } from "react";
import { off as sgmOff } from "../lib/sgMotion.js";
import { comparePlans } from "../lib/dynamic-planner.js";

function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr; }

const INK = "#0d0b14";
const GOLD = "#FFC72C";
const CARD_BG = "#fff";
const CARD_BORDER = `2px solid ${INK}`;

function travelTimeLabel(min, lang) {
  if (min == null) return _t(lang, "—", "—", "—");
  if (min < 1) return _t(lang, "< 1 min", "< 1 min", "< 1 min");
  if (min < 60) return _t(lang, `${min} min`, `${min} min`, `${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? _t(lang, `${h}h${m}`, `${h}h${m}`, `${h}h${m}`) : _t(lang, `${h}h`, `${h}h`, `${h}h`);
}

export function ComparisonView({
  lang = "fr",
  planA,
  planB,
  labelA = "Plan A",
  labelB = "Plan B",
  onSelectPlan,
  onClose,
  track,
}) {
  const SGM = !sgmOff();
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);

  const diff = useMemo(() => comparePlans(planA, planB, _t), [planA, planB, lang]);

  if (!planA || !planB) return null;

  const maxSlots = Math.max(planA.slots?.length || 0, planB.slots?.length || 0);

  return (
    <section
      data-testid="comparison-view"
      className={SGM ? "sgm-reveal" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      aria-label={_t("Comparaison de plans", "Plan comparison", "Comparación de planes")}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px", background: "#F5F0E8", border: CARD_BORDER, borderRadius: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>⚖️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{_t("Comparer deux scénarios", "Compare two scenarios", "Comparar dos escenarios")}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{diff.summary}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ padding: "8px 12px", background: INK, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>{_t("Fermer", "Close", "Cerrar")}</button>
      </div>

      {/* Score Summary */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, padding: "14px", background: CARD_BG, border: CARD_BORDER, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>{labelA}</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 32, color: INK, marginTop: 4 }}>{Math.round(planA.dayScore || 0)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{_t("Score global", "Overall score", "Puntuación global")}</div>
        </div>
        <div style={{ flex: 1, padding: "14px", background: CARD_BG, border: CARD_BORDER, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>{labelB}</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 32, color: diff.scoreDelta > 0 ? "#22C55E" : diff.scoreDelta < 0 ? "#EF4444" : INK, marginTop: 4 }}>
            {Math.round(planB.dayScore || 0)} {diff.scoreDelta !== 0 && <span style={{ fontSize: 14, fontWeight: 800, color: diff.scoreDelta > 0 ? "#22C55E" : "#EF4444" }}>{diff.scoreDelta > 0 ? "+" : ""}{diff.scoreDelta}</span>}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{_t("Score global", "Overall score", "Puntuación global")}</div>
        </div>
      </div>

      {/* Key Metrics Comparison */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <MetricCard lang={lang} label={_t("Plages", "Beaches", "Playas")} valueA={planA.slots?.filter(s => s.beach).length || 0} valueB={planB.slots?.filter(s => s.beach).length || 0} icon="map" higherIsBetter />
        <MetricCard lang={lang} label={_t("Min trajet", "Travel min", "Min viaje")} valueA={planA.slots?.reduce((sum, s) => sum + (s.travelMin || 0), 0) || 0} valueB={planB.slots?.reduce((sum, s) => sum + (s.travelMin || 0), 0) || 0} icon="car" lowerIsBetter />
        <MetricCard lang={lang} label={_t("Propres", "Clean", "Limpias")} valueA={planA.slots?.filter(s => s.beach?.status === "clean").length || 0} valueB={planB.slots?.filter(s => s.beach?.status === "clean").length || 0} icon="check" higherIsBetter />
        <MetricCard lang={lang} label={_t("Min plage", "Beach min", "Min playa")} valueA={planA.slots?.reduce((sum, s) => sum + (s.slot?.duration || 0), 0) || 0} valueB={planB.slots?.reduce((sum, s) => sum + (s.slot?.duration || 0), 0) || 0} icon="timer" />
      </div>

      {/* Slot-by-slot comparison */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7, padding: "0 4px" }}>{_t("Détail par créneau", "Slot by slot", "Detalle por franja")}</div>
        {Array.from({ length: maxSlots }, (_, i) => {
          const a = planA.slots[i];
          const b = planB.slots[i];
          const beachA = a?.beach;
          const beachB = b?.beach;
          const changed = beachA?.id !== beachB?.id;

          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 8, alignItems: "start", padding: "10px", background: changed ? "#FFF8E1" : "rgba(255,255,255,.03)", border: changed ? `2px solid ${GOLD}` : "1px solid rgba(13,11,20,.1)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 60, fontFamily: "'Anton',sans-serif", fontSize: 14, color: GOLD, borderRight: `1px solid rgba(13,11,20,.1)`, paddingRight: 8 }}>
                {a?.slot?.label || b?.slot?.label}
              </div>

              <ComparisonSlot lang={lang} slot={a} planLabel={labelA} isCurrent={!changed} />
              <ComparisonSlot lang={lang} slot={b} planLabel={labelB} isCurrent={!changed} />

              {changed && (
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <button type="button" onClick={() => onSelectPlan?.(planB)} className="xp-gold xp-gold" style={{ padding: "8px 16px", minHeight: 40, display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `2px 2px 0 ${INK}` }}>
                    {_t("Choisir ce plan", "Choose this plan", "Elegir este plan")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Beach Changes Summary */}
      {diff.beachChanges.length && (
        <div style={{ padding: "12px", background: "#FFF8E1", border: `2px solid ${GOLD}`, borderRadius: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{_t("Changements de plages", "Beach changes", "Cambios de playas")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {diff.beachChanges.map((change, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 12, color: GOLD }}>{_t("Créneau", "Slot", "Franja")} {change.slot + 1}</span>
                <span style={{ opacity: 0.5, textDecoration: "line-through" }}>{change.from}</span>
                <span style={{ color: GOLD, fontWeight: 800 }}>→</span>
                <span style={{ fontWeight: 800 }}>{change.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Travel Delta */}
      {diff.travelDelta !== 0 && (
        <div style={{ padding: "12px", background: diff.travelDelta < 0 ? "#E4F6EC" : "#FDE7DF", border: `2px solid ${diff.travelDelta < 0 ? "#22C55E" : "#EF4444"}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{diff.travelDelta < 0 ? "🚗⬇️" : "🚗⬆️"}</span>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{_t(
            `Trajet ${diff.travelDelta < 0 ? "réduit" : "augmenté"} de ${Math.abs(diff.travelDelta)} min`,
            `Travel ${diff.travelDelta < 0 ? "reduced" : "increased"} by ${Math.abs(diff.travelDelta)} min`,
            `Viaje ${diff.travelDelta < 0 ? "reducido" : "aumentado"} en ${Math.abs(diff.travelDelta)} min`
          )}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => onSelectPlan?.(planA)} style={{ flex: 1, padding: "14px", background: CARD_BG, color: INK, border: CARD_BORDER, borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{_t("Garder {labelA}", "Keep {labelA}", "Mantener {labelA}").replace("{labelA}", labelA)}</button>
        <button type="button" onClick={() => onSelectPlan?.(planB)} className="xp-gold xp-gold" style={{ flex: 1, padding: "14px", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: `3px 3px 0 ${INK}` }}>{_t("Adopter {labelB}", "Adopt {labelB}", "Adoptar {labelB}").replace("{labelB}", labelB)}</button>
      </div>
    </section>
  );
}

function MetricCard({ lang, label, valueA, valueB, icon, higherIsBetter = true, lowerIsBetter = false }) {
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);
  const aBetter = higherIsBetter ? valueA > valueB : lowerIsBetter ? valueA < valueB : false;
  const bBetter = higherIsBetter ? valueB > valueA : lowerIsBetter ? valueB < valueA : false;

  return (
    <div style={{ flex: 1, minWidth: 100, padding: "12px", background: CARD_BG, border: CARD_BORDER, borderRadius: 12, textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 24, color: aBetter ? "#22C55E" : bBetter ? "#EF4444" : INK }}>{valueA}</span>
        {valueB !== undefined && <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 24, color: bBetter ? "#22C55E" : aBetter ? "#EF4444" : INK }}>{valueB}</span>}
      </div>
      {valueB !== undefined && (
        <div style={{ fontSize: 10, marginTop: 2 }}>
          <span style={{ color: aBetter ? "#22C55E" : bBetter ? "#EF4444" : "rgba(13,11,20,.5)", fontWeight: 800 }}>{aBetter ? "⬆" : bBetter ? "⬆" : "="}</span>
        </div>
      )}
    </div>
  );
}

function ComparisonSlot({ lang, slot, planLabel, isCurrent }) {
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);
  const beach = slot?.beach;
  const m = beach ? statusMeta(beach.status, lang) : null;

  if (!beach) {
    return (
      <div style={{ padding: "8px", textAlign: "center", opacity: 0.5, fontSize: 12 }}>
        <div style={{ fontSize: 10, opacity: 0.5 }}>{planLabel}</div>
        <div>—</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 6, background: isCurrent ? "rgba(34,197,94,.05)" : "transparent", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 10, fontWeight: 800, opacity: 0.6 }}>{planLabel}</div>
      <div style={{ fontWeight: 800, fontSize: 14, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{beach.name}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.dot }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: m.fg, background: m.bg, padding: "2px 8px", borderRadius: 999 }}>{m.label[lang]}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, fontSize: 11, opacity: 0.8 }}>
        {slot.travelMin != null && <span>{travelTimeLabel(slot.travelMin, lang)}</span>}
        {slot.forecast?.confidence != null && <span>{_t("Conf.", "Conf.", "Conf.")} {slot.forecast.confidence}%</span>}
      </div>
    </div>
  );
}

function statusMeta(status, lang) {
  const STATUS_META = {
    clean: { label: { fr: "Propre", en: "Clean", es: "Limpia" }, dot: "#22C55E", bg: "#E4F6EC", fg: "#0B6B3A" },
    moderate: { label: { fr: "Risque", en: "Caution", es: "Riesgo" }, dot: "#F59E0B", bg: "#FFF3D6", fg: "#8a5a00" },
    avoid: { label: { fr: "À éviter", en: "Avoid", es: "Evitar" }, dot: "#EF4444", bg: "#FDE7DF", fg: "#A32E12" },
    alert: { label: { fr: "Alerte", en: "Alert", es: "Alerta" }, dot: "#EF4444", bg: "#FDE7DF", fg: "#A32E12" },
  };
  return STATUS_META[status] || { label: { fr: "—", en: "—", es: "—" }, dot: "#8A8F98", bg: "#eee", fg: "#555" };
}

export default ComparisonView;