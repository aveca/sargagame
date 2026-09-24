/**
 * StayTrajectory — « LA TRAJECTOIRE » (WOW paywall 2026-09-24, rollback ?sgtraj=0).
 *
 * Deuxième moment WOW : le paywall répond VISUELLEMENT à
 * « qu'est-ce que Premium change POUR MOI ? » en transformant le point
 * gratuit (« aujourd'hui tu sais ») en trajectoire (« ta semaine, tu la
 * décides »). La ligne se dessine DEPUIS le verdict du jour réel vers les
 * 7 jours réels (statuts + confiance décroissante = vérité du modèle).
 * Au premier jour À ÉVITER (donnée réelle), le PLAN B réel (findAlternatives)
 * apparaît. Le PRIX réel (lib/pass-price.js — jamais de littéral) ferme la
 * ligne comme sa destination.
 *
 * Concept validé par panel adverse (2026-09-24) :
 *   - transformation visuelle, JAMAIS liste de features, JAMAIS chip « gratuit »
 *   - confiance % révélée AU TAP (ligne détail), pas sur les nœuds
 *   - tap-nodes ≥44px · reduced-motion = tout statique · i18n FR/EN/ES
 *
 * Props (valeurs, calcul en amont dans PremiumModal) :
 *   { lang, beach, forecast /* objets réels {day,date,status,confidence} *,
 *     backup /* {beach:{name},distanceKm}|null *, currency, onTrack }
 */
import React, { useMemo, useState } from "react"
import ComicIcon from "../components/ComicIcons.jsx"
import { PASS_CENTS, seasonalCents } from "../lib/pass-price.js"
import { buildTrajectory, TRAJ_STATUS } from "../lib/stay-trajectory.js"

const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)
const money = (c, cur, lang) => (cur === "usd" ? "$" + (c / 100).toFixed(2) : lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")

export function StayTrajectory({ lang = "fr", beach, forecast, backup = null, currency = "eur", onTrack }) {
  const trajOn = (() => { try { return !/[?&]sgtraj=0(?:&|$)/.test(window.location.search) } catch (_) { return true } })()
  const traj = useMemo(() => buildTrajectory(forecast, beach && beach.status), [forecast, beach])
  const [sel, setSel] = useState(traj.defaultIndex)
  if (!trajOn || !beach || !beach.name || traj.days.length < 2) return null

  const cur = currency === "usd" ? "usd" : "eur"
  const displayCents = seasonalCents(PASS_CENTS[cur], cur)
  const perDay = (() => { const v = displayCents / 100 / 30; const s = cur === "usd" ? "$" + v.toFixed(2) : lang === "en" ? "€" + v.toFixed(2) : v.toFixed(2).replace(".", ",") + " €"; return s })()
  const statusLabel = (s) => s === "clean" ? _t(lang, "Propre", "Clean", "Limpia")
    : s === "moderate" ? _t(lang, "À surveiller", "Worth checking", "A vigilar")
    : s === "alert" ? _t(lang, "À éviter", "Avoid", "Evitar") : _t(lang, "en cours", "computing", "calculando")

  const selDay = sel >= 0 && sel < traj.days.length ? traj.days[sel] : null
  const showBackup = traj.criticalIndex >= 0 && backup && backup.beach && backup.beach.name
  const critDay = traj.criticalIndex >= 0 ? traj.days[traj.criticalIndex] : null
  const pick = (i) => {
    if (i === sel) return
    setSel(i)
    try { onTrack && onTrack("sg_traj_tap", { day: i, status: traj.days[i] && traj.days[i].status }) } catch (_) {}
  }
  // Semaine sans alerte : VERDE strict (7/7 clean) sinon neutre — panel adverse.
  const calmLine = !showBackup && traj.criticalIndex < 0 && traj.lastConf != null
    ? traj.counts.clean === traj.days.length
      ? _t(lang, `Semaine au vert — ${traj.lastConf} % de confiance à J+${traj.days.length - 1}`, `All-clear week — ${traj.lastConf} % confidence on day ${traj.days.length - 1}`, `Semana despejada — ${traj.lastConf} % de confianza a J+${traj.days.length - 1}`)
      : _t(lang, `Aucun jour à éviter · ${traj.lastConf} % de confiance à J+${traj.days.length - 1}`, `No avoid day · ${traj.lastConf} % confidence on day ${traj.days.length - 1}`, `Sin día que evitar · ${traj.lastConf} % de confianza a J+${traj.days.length - 1}`)
    : null

  return (
    <section className="sg-traj" data-testid="stay-trajectory" aria-label={_t(lang, "La trajectoire de ta semaine", "Your week trajectory", "La trayectoria de tu semana")}>
      <style>{`
        .sg-traj{margin:0 0 14px;padding:14px 13px 13px;border-radius:16px;border:1.5px dashed rgba(255,199,44,.45);background:linear-gradient(180deg,rgba(255,199,44,.07),rgba(255,199,44,.02));font-family:'Bricolage Grotesque',system-ui,sans-serif}
        .sg-traj-kicker{display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#FFC72C}
        .sg-traj-title{display:block;font-family:'Anton',system-ui,sans-serif;font-weight:400;font-size:clamp(19px,5vw,23px);letter-spacing:.01em;text-transform:uppercase;color:#fff;margin:4px 0 2px;text-shadow:0 2px 10px rgba(0,0,0,.35)}
        .sg-traj-rail{position:relative;display:flex;align-items:flex-start;gap:2px;margin-top:12px;padding:4px 0 2px}
        .sg-traj-line{position:absolute;left:26px;right:26px;top:21px;height:3px;border-radius:2px;background:repeating-linear-gradient(90deg,rgba(255,199,44,.85) 0 7px,rgba(255,199,44,.25) 7px 12px);animation:sg-traj-draw .7s ease-out .1s both;pointer-events:none}
        @keyframes sg-traj-draw{from{transform:scaleX(0);transform-origin:0 50%}to{transform:scaleX(1);transform-origin:0 50%}}
        .sg-traj-day{position:relative;z-index:1;flex:1;min-width:44px;min-height:56px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:2px 2px 0;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
        /* ARMURE : le skin body.theme-comic force button{background/border !important}
           (0,1,1) → fond/bordure du bouton-jour EFFACÉS sinon (pattern XP_ARMOR) :
           doublé-classe (0,2,0)+!important. Le cercle .sg-traj-dot (span) porte
           l'anneau sélection — le bouton nu ne doit prendre AUCUNE peinture. */
        .sg-traj-day.sg-traj-day{background:transparent !important;border:none !important;box-shadow:none !important;text-shadow:none !important}
        .sg-traj-day.sg-traj-day:active{transform:none !important}
        .sg-traj-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#0D0B14;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.14);animation:sg-traj-pop .3s cubic-bezier(.2,.8,.2,1) backwards;animation-delay:calc(.15s + var(--i,0)*.09s)}
        @keyframes sg-traj-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
        .sg-traj-day[data-today="1"] .sg-traj-dot{width:34px;height:34px;font-size:15px;border-color:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--tcolor,#FFC72C) 35%,transparent),0 3px 12px rgba(0,0,0,.4)}
        .sg-traj-day[aria-pressed="true"] .sg-traj-dot{border-color:#FFC72C;box-shadow:0 0 0 3px rgba(255,199,44,.35),0 2px 8px rgba(0,0,0,.35)}
        .sg-traj-daycap{font-size:10px;font-weight:800;letter-spacing:.02em;color:rgba(255,255,255,.78);max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
        .sg-traj-detail{margin-top:10px;min-height:20px;font-size:13px;font-weight:700;color:rgba(255,255,255,.86);display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .sg-traj-detail b{color:#fff}
        .sg-traj-conf{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:rgba(255,224,138,.95)}
        .sg-traj-backup{display:flex;align-items:center;gap:8px;margin-top:9px;padding:9px 11px;border-radius:12px;background:rgba(30,200,176,.1);border:1.5px solid rgba(30,200,176,.4);font-size:12.5px;font-weight:700;color:#7FE8D8;animation:sg-traj-in .4s ease-out backwards;animation-delay:calc(.2s + var(--crit,0)*.09s)}
        .sg-traj-backup b{color:#fff;font-weight:800}
        @keyframes sg-traj-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .sg-traj-calm{margin-top:9px;padding:9px 11px;border-radius:12px;background:rgba(34,197,94,.09);border:1.5px solid rgba(34,197,94,.35);font-size:12.5px;font-weight:700;color:#8FE3AC;animation:sg-traj-in .4s ease-out .5s backwards}
        .sg-traj-price{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:12px;padding:11px 13px;border-radius:13px;border:2px solid rgba(255,199,44,.55);background:linear-gradient(165deg,rgba(255,199,44,.13),rgba(255,199,44,.03));animation:sg-traj-in .4s ease-out .85s backwards}
        .sg-traj-price-main{display:flex;flex-direction:column;gap:2px;min-width:0}
        .sg-traj-price-lbl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,224,138,.95)}
        .sg-traj-price-sub{font-size:11px;font-weight:700;color:rgba(255,255,255,.6)}
        .sg-traj-price-num{font-family:'Anton',system-ui,sans-serif;font-weight:400;font-size:30px;line-height:.9;color:#FFC72C;text-shadow:0 2px 10px rgba(0,0,0,.4);white-space:nowrap}
        @media (prefers-reduced-motion:reduce){
          .sg-traj *{animation:none !important;transition:none !important}
          .sg-traj-line{transform:none !important}
        }
      `}</style>

      <div className="sg-traj-head">
        <span className="sg-traj-kicker">{_t(lang, "Aujourd'hui — tu sais déjà", "Today — you know already", "Hoy — ya lo sabes")}</span>
        <span className="sg-traj-title">{_t(lang, `Ta semaine, tu la décides`, `Your week — you decide`, `Tu semana — tú decides`)}</span>
      </div>

      <div className="sg-traj-rail" role="group" aria-label={_t(lang, "Prévision 7 jours réelle, satellite", "Real 7-day satellite forecast", "Pronóstico satelital real de 7 días")}>
        <div className="sg-traj-line" aria-hidden="true" />
        {traj.days.map((d, i) => {
          const st = TRAJ_STATUS[d.status] || null
          return (
            <button type="button" key={i} className="sg-traj-day" data-today={i === 0 ? "1" : undefined}
              aria-pressed={sel === i}
              aria-label={`${d.day || "J+" + i} · ${statusLabel(d.status)}${d.confidence != null ? ` · ${d.confidence} %` : ""}`}
              style={{ "--i": i, "--tcolor": st ? st.c : "#999", opacity: i === 0 ? 1 : Math.max(.45, 1 - i * 0.08 - (i === sel ? 0 : .08)) }}
              onClick={() => pick(i)}>
              <span className="sg-traj-dot" style={{ background: st ? st.c : "#8B93A3" }}>{st ? st.glyph : "·"}</span>
              <span className="sg-traj-daycap">{i === 0 ? _t(lang, "Auj.", "Today", "Hoy") : (d.day || ("J+" + i))}</span>
            </button>
          )
        })}
      </div>

      <div className="sg-traj-detail" role="status" aria-live="polite">
        {selDay && (
          <>
            <b>{selDay.day || "J+" + selDay.i}</b>
            <span>· {statusLabel(selDay.status)}</span>
            {selDay.confidence != null && <span className="sg-traj-conf">· {selDay.confidence} % {_t(lang, "de confiance", "confidence", "de confianza")}</span>}
          </>
        )}
      </div>

      {showBackup && critDay && (
        <div className="sg-traj-backup" style={{ "--crit": traj.criticalIndex }} data-testid="stay-trajectory-backup">
          <ComicIcon name="compass" size={14} />
          <span>{_t(lang, "Plan B ", "Plan B ", "Plan B ")}<b>{critDay.day}</b>{_t(lang, " : ", " : ", " : ")}<b>{backup.beach.name}</b>{backup.distanceKm != null ? ` · ${backup.distanceKm} km` : ""}</span>
        </div>
      )}
      {calmLine && <div className="sg-traj-calm">{calmLine}</div>}

      <div className="sg-traj-price" data-testid="stay-trajectory-price">
        <span className="sg-traj-price-main">
          <span className="sg-traj-price-lbl">{_t(lang, "Toute ta semaine", "Your whole week", "Toda tu semana")}</span>
          <span className="sg-traj-price-sub">≈ {perDay}{_t(lang, "/jour · 30 jours · sans abonnement", "/day · 30 days · no subscription", "/día · 30 días · sin suscripción")}</span>
        </span>
        <span className="sg-traj-price-num">{money(displayCents, cur, lang)}</span>
      </div>
    </section>
  )
}

export default StayTrajectory
