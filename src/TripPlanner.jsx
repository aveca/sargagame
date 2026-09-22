/**
 * TripPlanner — « PLAN MY STAY » (MASTER EXECUTION 2026-09-22).
 *
 * PROBLEM : le touriste reste plusieurs jours et ne sait pas répondre à
 * « quelles plages, quels jours ? » — c'est LA promesse premium.
 * EVIDENCE : intents « séjour/7 jours » récurrents (recherche, landing, chat) ;
 *   funnel a besoin d'un moment d'aha AVANT le paywall (cf. GROWTH_EXPERIMENTS).
 * CHANGE : overlay qui compose, pour chaque jour, la MEILLEURE plage + un plan B
 *   (données réelles forecast/weekly uniquement — jamais d'invention), J+1..J+2
 *   visibles, J+3+ verrouillés → CTA offre (mesuré).
 * METRIC : sg_trip_open / sg_trip_days_pick / sg_trip_beach_open / sg_trip_premium_cta.
 * ROLLBACK : ?tripplan=0 (l'entrée disparaît, produit intact).
 */
import React, { useMemo, useState } from "react"

export const tripPlannerEnabled = () => {
  try { return !/[?&]tripplan=0(?:&|$)/.test(window.location.search) } catch (_) { return true }
}

const ST = {
  clean:    { c: "#22C55E", fr: "OK", en: "GO", es: "OK" },
  moderate: { c: "#F59E0B", fr: "Vigilance", en: "Caution", es: "Precaución" },
  alert:    { c: "#EF4444", fr: "Éviter", en: "Avoid", es: "Evitar" },
  _x:       { c: "#8A8F98", fr: "—", en: "—", es: "—" },
}

// Meilleur choix + plan B par jour d'après le forecast réel par plage.
// Règle déterministe et transparente : statut (clean>moderate>alert) → AFAI le
// plus faible → confiance la plus haute. Le plan B vient d'une AUTRE commune
// (exposition côtière différente) quand c'est possible.
function planDays(beaches, forecastById) {
  const days = []
  const maxLen = Math.max(0, ...Object.values(forecastById).map(f => (f.forecast || []).length))
  for (let d = 0; d < maxLen; d++) {
    const cand = []
    for (const b of beaches) {
      const fc = forecastById[b.id]
      const day = fc && fc.forecast && fc.forecast[d]
      if (!day || !day.status) continue
      cand.push({ b, day })
    }
    if (!cand.length) { days.push(null); continue }
    const rank = (s) => (s === "clean" ? 0 : s === "moderate" ? 1 : 2)
    cand.sort((a, x) => (rank(a.day.status) - rank(x.day.status))
      || ((a.day.afai ?? 9) - (x.day.afai ?? 9))
      || ((x.day.confidence || 0) - (a.day.confidence || 0)))
    const best = cand[0]
    const backup = cand.find(c => c.b.commune && best.b.commune && c.b.commune !== best.b.commune) || cand[1] || null
    days.push({ date: best.day.date, label: best.day.day, best, backup })
  }
  return days
}

export default function TripPlanner({ lang, beaches, forecastById, isPremium, onClose, onOpenBeach, onPremium, track }) {
  const _t = (fr, en, es) => (lang === "en" ? en : lang === "es" ? es : fr)
  const days = useMemo(() => planDays(beaches || [], forecastById || {}), [beaches, forecastById])
  const visibleDays = isPremium ? days.length : Math.min(2, days.length)

  return (
    <div role="dialog" aria-modal="true" aria-label={_t("Planifier mon séjour", "Plan my stay", "Planificar mi estancia")}
      style={{ position: "fixed", inset: 0, zIndex: 1350, background: "rgba(11,7,22,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "88dvh", overflowY: "auto", background: "#0F2A23", borderRadius: "20px 20px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom,0px))", border: "1px solid rgba(255,199,44,.25)", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, textTransform: "uppercase", color: "#fff", letterSpacing: ".01em" }}>
            {_t("Planifier mon séjour", "Plan my stay", "Planificar mi estancia")}
          </div>
          <button onClick={onClose} aria-label={_t("Fermer", "Close", "Cerrar")} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 22, cursor: "pointer", padding: 8, minWidth: 44, minHeight: 44 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginBottom: 14 }}>
          {_t("La meilleure plage chaque jour, et un plan B si la mer change.",
              "The best beach each day, plus a backup if the sea shifts.",
              "La mejor playa cada día y un plan B si el mar cambia.")}
        </div>

        {days.map((d, i) => (
          <DayRow key={i} day={d} idx={i} locked={!isPremium && i >= visibleDays} lang={lang} _t={_t}
            onOpen={() => { try { track("sg_trip_beach_open", { day: i, beach_id: d && d.best && d.best.b.id }) } catch (_) {} onOpenBeach(d.best.b) }} />
        ))}

        {!isPremium && days.length > visibleDays && (
          <div tabIndex={0} onClick={() => { try { track("sg_trip_premium_cta", {}) } catch (_) {} onPremium("trip_planner") }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); try { track("sg_trip_premium_cta", { via: "kbd" }) } catch (_) {} onPremium("trip_planner") } }}
            data-testid="trip-premium-cta"
            style={{ width: "100%", marginTop: 10, background: "linear-gradient(135deg,#FFE08A,#FFC72C)", color: "#120821", borderRadius: 14, padding: "14px 16px", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "3px 3px 0 rgba(0,0,0,.4)", textAlign: "center", boxSizing: "border-box" }}>
            {_t("Débloquer tout mon séjour →", "Unlock my whole stay →", "Desbloquear toda mi estancia →")}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,.45)", textAlign: "center" }}>
          {_t("Prévision satellite Copernicus — mesuré, pas deviné.", "Copernicus satellite forecast — measured, not guessed.", "Pronóstico satelital Copernicus — medido, no adivinado.")}
        </div>
      </div>
    </div>
  )
}

function DayRow({ day, idx, locked, lang, _t, onOpen }) {
  // NB : <div onClick> VOLONTAIRE (pas de <button> ni role="button") — le skin
  // .theme-comic force fond blanc + bordure ink sur button ET [role=button]
  // (lisibilité cassée 2× au screenshot 2026-09-22). tabIndex conservé pour
  // le clavier ; la règle vise sélecteur d'attribut/élément, pas tabIndex.
  if (!day) return null
  const dot = (s) => (ST[s] || ST._x).c
  const word = (s) => { const v = ST[s] || ST._x; return lang === "en" ? v.en : lang === "es" ? v.es : v.fr }
  return (
    <div style={{ marginBottom: 8, borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: locked ? "rgba(255,255,255,.03)" : "#12362D", overflow: "hidden" }}>
      {locked ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", filter: "blur(0.6px)", opacity: 0.75 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,.8)", minWidth: 44 }}>{day.label}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)", letterSpacing: 2 }}>🔒 ······</span>
        </div>
      ) : (
        <div tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen() } }}
          style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", padding: "12px 14px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,.75)", minWidth: 44 }}>{day.label}</span>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: dot(day.best.day.status), flexShrink: 0 }} />
            <span style={{ fontWeight: 800, fontSize: 14.5, color: "#fff", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{day.best.b.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: dot(day.best.day.status) }}>{word(day.best.day.status)}</span>
          </div>
          {day.backup && day.backup.b && (
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,.6)" }}>
              {_t("Plan B : ", "Backup: ", "Plan B: ")}
              <span style={{ color: "#CDE7DF", fontWeight: 700 }}>{day.backup.b.name}</span>
              <span style={{ color: dot(day.backup.day.status), fontWeight: 700 }}> · {word(day.backup.day.status)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
