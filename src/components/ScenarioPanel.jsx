/**
 * ScenarioPanel — "What if" scenarios for Dynamic Beach Day Planner
 * Shows quick scenario switches: tomorrow, later, swim-focused, less travel, etc.
 * Rollback: ?dynamicplan=0
 */
import { useMemo, useState } from "react";
import { off as sgmOff } from "../lib/sgMotion.js";

function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr; }

const INK = "#0d0b14";
const GOLD = "#FFC72C";
const CARD_BG = "#fff";
const CARD_BORDER = `2px solid ${INK}`;

const SCENARIO_ICONS = {
  tomorrow: "calendar",
  later: "clock",
  shorter: "timer",
  swim: "swim",
  snorkel: "snorkel",
  family: "family",
  less_travel: "car",
  two_beaches: "map",
};

export function ScenarioPanel({
  lang = "fr",
  scenarios = [],
  currentPlan,
  onApplyScenario,
  onPreviewScenario,
  track,
}) {
  const SGM = !sgmOff();
  const [previewed, setPreviewed] = useState(null);
  const _t = (fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr);

  if (!scenarios.length) return null;

  return (
    <section
      data-testid="scenario-panel"
      className={SGM ? "sgm-reveal" : undefined}
      style={{ marginTop: 12 }}
      aria-label={_t("Scénarios « Et si ? »", "\"What if?\" scenarios", "Escenarios \"¿Y si?\"")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🔮</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: INK }}>{_t("Et si… ?", "What if…?", "¿Y si…?")}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(13,11,20,.5)", background: "#F5F0E8", padding: "4px 10px", borderRadius: 999 }}>
          {_t("Tap pour prévisualiser", "Tap to preview", "Toca para previsualizar")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {scenarios.map((scenario, i) => {
          const iconName = SCENARIO_ICONS[scenario.id] || "sparkles";
          const isPreviewed = previewed === scenario.id;

          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => {
                if (isPreviewed) {
                  onApplyScenario?.(scenario);
                  track?.("sg_scenario_apply", { scenario: scenario.id });
                } else {
                  setPreviewed(scenario.id);
                  onPreviewScenario?.(scenario);
                  track?.("sg_scenario_preview", { scenario: scenario.id });
                }
              }}
              onMouseEnter={() => !isPreviewed && onPreviewScenario?.(scenario)}
              onMouseLeave={() => !isPreviewed && setPreviewed(null)}
              style={{
                flex: "1 1 140px", minWidth: 140, maxWidth: 180,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "14px 10px",
                background: isPreviewed ? GOLD : CARD_BG,
                color: isPreviewed ? INK : INK,
                border: isPreviewed ? `3px solid ${INK}` : CARD_BORDER,
                borderRadius: 14,
                boxShadow: isPreviewed ? `4px 4px 0 ${INK}` : `2px 2px 0 ${INK}`,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                textAlign: "center",
                transition: SGM ? "all .15s cubic-bezier(.2,.8,.2,1)" : "none",
                transform: isPreviewed ? "scale(1.02)" : "none",
              }}
              aria-pressed={isPreviewed}
              aria-label={scenario.label}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}><Icon name={iconName} size={24} /></span>
              <span style={{ lineHeight: 1.2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scenario.label}</span>
              {isPreviewed && (
                <span style={{ fontSize: 10, fontWeight: 800, background: INK, color: GOLD, padding: "2px 8px", borderRadius: 999 }}>{_t("Appliquer", "Apply", "Aplicar")}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Preview Diff */}
      {previewed && currentPlan && (
        <div
          data-testid="scenario-preview"
          className={SGM ? "sgm-popin" : undefined}
          style={{ marginTop: 10, padding: "12px", background: "#FFF8E1", border: `2px solid ${INK}`, borderRadius: 12 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{_t("Aperçu du changement", "Change preview", "Vista previa del cambio")}</span>
            <button type="button" onClick={() => { setPreviewed(null); onPreviewScenario?.(null); }} style={{ padding: "4px 8px", background: "none", border: `1px solid ${INK}`, borderRadius: 8, fontSize: 11, cursor: "pointer" }}>{_t("Fermer", "Close", "Cerrar")}</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            {_t(
              "Ce scénario changerait votre plan. Tap « Appliquer » pour confirmer.",
              "This scenario would change your plan. Tap \"Apply\" to confirm.",
              "Este escenario cambiaría tu plan. Toca \"Aplicar\" para confirmar."
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default ScenarioPanel;