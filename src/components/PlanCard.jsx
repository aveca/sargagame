/**
 * PlanCard — « PLAN DU JOUR » (PERFECT BEACH TRIP, 2026-09-24B)
 *
 * Carte générique et réutilisable (B2C home aujourd'hui ; B2B hôtel/conciergerie
 * et B2G territoire plus tard — même schéma de props). Elle assemble UNIQUEMENT
 * des faits réels : plage (statut live satellite), semaine forecast, alternative
 * (findAlternatives via journeyFor), orientation côte (coords), drive, flags
 * kids/parking, photo du catalogue (vraie photo du lieu). Zéro fabrication.
 *
 * Rollback : ?sgplan=0 → la carte n'existe pas. Reduced-motion : entrée statique
 *   (sgm-reveal respecte prefers-reduced-motion via la grammaire sgm-motion.css).
 * Tracking : sg_plan_generate (1×/plage montée) + sg_alternative_open (tap alt).
 */
import { useEffect, useRef } from "react"
import { coastSentence } from "../lib/intents.js"
import { off as sgmOff } from "../lib/sgMotion.js"

// Utilitaires locaux (PAS d'import ExperienceReset — ce fichier est importé par
// lui : import circulaire interdit). Copie minimale des valeurs canoniques.
const INK = "#0d0b14"
const GOLD = "#FFC72C"
function _t(lang, fr, en, es) { return lang === "es" ? es : lang === "en" ? en : fr }
const STATUS_META = {
  clean: { label: { fr: "Propre", en: "Clean", es: "Limpia" }, bg: "#E4F6EC", fg: "#0B6B3A" },
  moderate: { label: { fr: "Risque", en: "Caution", es: "Riesgo" }, bg: "#FFF3D6", fg: "#8a5a00" },
  avoid: { label: { fr: "À éviter", en: "Avoid", es: "Evitar" }, bg: "#FDE7DF", fg: "#A32E12" },
}
function statusMeta(status, lang) {
  const s = STATUS_META[status] || { label: { fr: "Bientôt", en: "Soon", es: "Pronto" }, bg: "#eee", fg: "#555" }
  return { label: s.label[lang] || s.label.fr, bg: s.bg, fg: s.fg }
}

export const planOff = () => {
  try { return /[?&]sgplan=0(?:&|$)/.test(window.location.search) } catch (_) { return false }
}

const DOT = { clean: "#22C55E", moderate: "#E8A800", avoid: "#E8512A", alert: "#E8512A" }

export function PlanCard({ lang = "fr", beach, journey, imageUrl = null, media = null, fresh = null, onOpenBeach, onOpenAlt, track, isPremium = false }) {
  const fired = useRef(null)
  useEffect(() => {
    if (!beach || !beach.id || fired.current === beach.id) return
    fired.current = beach.id
    try { track?.("sg_plan_generate", { beach_id: beach.id, status: beach.status || null, source: "plan_du_jour" }) } catch (_) {}
  }, [beach, track])

  if (!beach || !beach.id) return null

  const m = statusMeta(beach.status, lang)
  const days = journey && Array.isArray(journey.days) ? journey.days : []
  // Moment honeste : « aujourd'hui » si propre ; sinon 1er futur jour propre RÉEL
  // (statut forecast) ; jamais « parfait » : le libellé énonce l'option du moment.
  const better = (() => {
    if (beach.status === "clean") return null
    const nb = days.find(d => d.i >= 1 && d.status === "clean")
    return nb || null
  })()
  const backup = (journey && journey.backup) || null
  const facts = []
  const coast = coastSentence(beach, lang)
  if (coast) facts.push(coast)
  if (Number.isFinite(beach.drive) && beach.drive > 0) facts.push(_t(lang, `${beach.drive} min en voiture depuis la ville principale`, `${beach.drive} min drive from the main town`, `${beach.drive} min en coche desde la ciudad principal`))
  if (beach.kids) facts.push(_t(lang, "adaptée aux enfants (flag plage)", "suitable for children", "apta para niños"))
  if (beach.parking) facts.push(_t(lang, "parking dédié (flag plage)", "dedicated parking", "estacionamiento dedicado"))
  const conf = days.length && days[0].confidence != null ? days[0].confidence : null
  if (facts.length > 3) facts.length = 3

  return (
    <section className={sgmOff() ? "plan-card" : "sgm-planin plan-card"} data-testid="plan-card" data-beach={beach.id} data-sgm-status={beach.status || "unknown"}
      style={{ background: "#fff", color: INK, border: `2px solid ${INK}`, borderRadius: 16, boxShadow: `3px 3px 0 ${INK}`, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#8a5a00" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT[beach.status] || "#999" }} aria-hidden="true" />
        {_t(lang, "☀️ PLAN DU JOUR", "☀️ TODAY'S PLAN", "☀️ PLAN DE HOY")}{fresh ? ` · ${fresh}` : ""}
      </div>
      {/* Media contract (beach-media.js v1) : vidéo hero réelle (poster photo,
          pas d'autoplay lourd sur mobile — playsInline + muted + loop uniquement
          si l'utilisateur n'est pas en saveData) sinon photo réelle lazy. Jamais
          de placeholder générique : sans asset réel → rien n'est rendu. */}
      {(() => {
        let videoEl = null
        let saveData = false
        try { saveData = navigator.connection && navigator.connection.saveData === true } catch (_) {}
        if (media && media.video && !saveData) {
          videoEl = (
            <video src={media.video.src} poster={media.video.poster || undefined} muted loop playsInline
              preload="metadata" autoPlay={false}
              style={{ display: "block", width: "100%", height: 140, objectFit: "cover", borderRadius: 10, border: `2px solid ${INK}`, marginTop: 8 }}
              onError={e => { e.currentTarget.style.display = "none" }} />
          )
        }
        const showPhoto = !videoEl && imageUrl
        return videoEl || (showPhoto ? (
          <img src={imageUrl} alt={`${beach.name} — ${beach.commune || ""}`} loading="lazy" width="800" height="450"
            style={{ display: "block", width: "100%", height: 120, objectFit: "cover", borderRadius: 10, border: `2px solid ${INK}`, marginTop: 8 }}
            onError={e => { e.currentTarget.style.display = "none" }} />
        ) : null)
      })()}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: imageUrl ? 8 : 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{beach.name}</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{beach.commune || ""}</div>
        </div>
        <span style={(m => ({ display: "inline-flex", alignItems: "center", background: m.bg, color: m.fg, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800, flexShrink: 0 }))(m)}>{m.label}</span>
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        {better
          ? _t(lang, `Aujourd'hui ${m.label.toLowerCase()} — meilleure fenêtre cette semaine : ${better.label || "J+" + better.i} (statut ${better.status}, prévision satellite)`, `Today ${m.label.toLowerCase()} — best window this week: ${better.label || "J+" + better.i} (status ${better.status}, satellite forecast)`, `Hoy ${m.label.toLowerCase()} — mejor ventana esta semana: ${better.label || "J+" + better.i}`)
          : _t(lang, "Meilleure option aujourd'hui selon les données satellite actuelles.", "Best option today based on current satellite data.", "Mejor opción hoy según los datos satelitales actuales.")}
        {conf != null ? ` ${_t(lang, `Confiance ${conf} %`, `Confidence ${conf} %`, `Confianza ${conf} %`)}` : ""}
      </div>
      {/* POURQUOI CE CHOIX (2026-09-25E) — la data devient une histoire :
          2-4 raisons RÉELLES (statut satellite, score, confiance, fenêtre).
          <details> natif : zéro JS, a11y gratuite, reduced-motion safe. */}
      {(() => {
        const reasons = []
        reasons.push(beach.status === "clean"
          ? _t(lang, `Eau propre mesurée aujourd'hui (satellite)${beach.score != null ? ` — score ${Math.round(beach.score)}/100` : ""}.`, `Clean water measured today (satellite)${beach.score != null ? ` — score ${Math.round(beach.score)}/100` : ""}.`, `Agua limpia medida hoy (satélite)${beach.score != null ? ` — puntuación ${Math.round(beach.score)}/100` : ""}.`)
          : _t(lang, `Statut du jour : ${m.label.toLowerCase()} (mesure satellite).`, `Today's status: ${m.label.toLowerCase()} (satellite reading).`, `Estado de hoy: ${m.label.toLowerCase()} (medición satelital).`))
        if (better) reasons.push(_t(lang, `Meilleure fenêtre : ${better.label || "J+" + better.i} (prévision satellite).`, `Best window: ${better.label || "J+" + better.i} (satellite forecast).`, `Mejor ventana: ${better.label || "J+" + better.i} (pronóstico satelital).`))
        else if (beach.status === "clean") reasons.push(_t(lang, "Meilleur score du jour sur l'île.", "Top score on the island today.", "Mejor puntuación de la isla hoy."))
        if (conf != null) reasons.push(_t(lang, `Confiance ${conf} % sur la prévision du jour.`, `Confidence ${conf}% on today's forecast.`, `Confianza ${conf} % en el pronóstico de hoy.`))
        if (!reasons.length) return null
        return (
          <details data-testid="plan-why" style={{ marginTop: 8, background: "#FFFBEB", border: `1.5px dashed ${INK}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5 }}
            onToggle={e => { if (e.target.open) { try { track?.("sg_verdict_expand", { beach_id: beach.id, via: "plan" }) } catch (_) {} } }}>
            <summary style={{ fontWeight: 800, cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
              {_t(lang, "Pourquoi ce choix ? →", "Why this pick? →", "¿Por qué esta elección? →")}
            </summary>
            <ul style={{ margin: "6px 0 2px", padding: "0 0 0 16px" }}>
              {reasons.map((r, i) => <li key={i} style={{ padding: "2px 0" }}>{r}</li>)}
            </ul>
          </details>
        )
      })()}
      {!!days.length && (
        <div data-testid="plan-week" role="group" aria-label={_t(lang, "Semaine en un coup d'œil", "Week at a glance", "Semana de un vistazo")}
          style={{ display: "flex", gap: 4, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: .7, marginRight: 4 }}>
            {_t(lang, "Cette semaine", "This week", "Esta semana")}
          </span>
          {days.map(d => (
            <span key={d.i} title={`${d.label || "J+" + d.i} · ${d.status || "?"}${d.confidence != null ? ` · ${d.confidence}%` : ""}`}
              aria-label={`${d.label || "J+" + d.i} · ${d.status || "?"}${d.confidence != null ? ` · ${d.confidence}%` : ""}`}
              style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
              <i aria-hidden="true" style={{ display: "block", width: 14, height: 14, borderRadius: "50%", border: `2px solid ${INK}`, background: DOT[d.status] || "#8A8F98" }} />
              <span style={{ fontSize: 8.5, fontWeight: 800, opacity: .7 }}>{(d.label || "").slice(0, 3) || `J+${d.i}`}{d.locked && !isPremium ? " 🔒" : ""}</span>
            </span>
          ))}
        </div>
      )}
      {backup && (
        <button type="button" data-testid="plan-alt" key={backup.id} className={sgmOff() ? undefined : "sgm-swap"}
          onClick={() => { try { track?.("sg_alternative_open", { from: beach.id, to: backup.id, distance_km: backup.distanceKm }) } catch (_) {} onOpenAlt?.(backup.beach || backup) }}
          style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, width: "100%", background: "#FFF3D6", color: "#8a5a00", border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "9px 12px", textAlign: "left" }}>
          ↗ {_t(lang, "Alternative réelle", "Real alternative", "Alternativa real")} : <b>{backup.name}</b>{backup.distanceKm != null ? ` · ${backup.distanceKm} km` : ""}
        </button>
      )}
      {!!facts.length && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>{_t(lang, "💡 Bon à savoir", "💡 Good to know", "💡 Bueno saber")}</div>
          <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
            {facts.map((f, i) => <li key={i} style={{ fontSize: 12.5, padding: "2px 0" }}>· {f}</li>)}
          </ul>
        </div>
      )}
      <button type="button" className="xp-gold xp-gold" data-testid="plan-open"
        onClick={() => { try { track?.("sg_recommendation_open", { beach_id: beach.id, source: "plan_du_jour" }) } catch (_) {} onOpenBeach?.(beach) }}
        style={{ marginTop: 10, minHeight: 48, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 14, boxShadow: `3px 3px 0 ${INK}`, fontWeight: 800, fontSize: 15, cursor: "pointer", padding: "12px 16px" }}>
        {_t(lang, "Voir cette plage →", "See this beach →", "Ver esta playa →")}
      </button>
    </section>
  )
}

export default PlanCard
