import React, { useState, useMemo } from "react"

/**
 * PaidOnboarding — accueil GUIDÉ des nouveaux clients PAYANTS (bras A/B `pw_onboard`).
 *
 * Remplace le toast 5s « Premium activé ! » par un mini-setup 30s (skippable) qui
 * ACTIVE réellement la valeur du Premium : la valeur cœur (alertes + brief) s'accroche
 * aux PLAGES FAVORITES — or rien ne poussait le payeur à en choisir → produit silencieux
 * → churn. 3 temps : choisir 1-3 plages à surveiller → autoriser les notifs → où est le
 * brief. Golden-hour, i18n fr/en/es, reduced-motion = plancher (tableau lisible, pas d'anim).
 *
 * Props : lang, allBeaches, favorites(array d'ids), onToggleFav(id), onEnableNotif(),
 *         onDone(), island, userPos.
 * Additif/réversible : control = toast 5s existant (intact). Lazy + Suspense côté monolithe.
 */
export default function PaidOnboarding({ lang = "fr", allBeaches = [], favorites = [], onToggleFav, onEnableNotif, onDone, island, userPos, track }) {
  const t = (fr, en, es) => (lang === "en" ? en : lang === "es" ? es : fr)
  const tk = (n, p) => { try { track && track(n, p) } catch (e) {} }
  const [step, setStep] = useState(0)
  const [notifAsked, setNotifAsked] = useState(false)
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  function haversine(a, b, c, d) { const R = 6371, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p, h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }

  // Plages proposées : même île, propres d'abord, plus proches si géo sinon meilleur score.
  const suggestions = useMemo(() => {
    const geo = !!(userPos && userPos.lat)
    let pool = (allBeaches || []).filter(b => b && b.id && b.lat && b.lng && (!island || b.island === island))
    const rank = (b) => geo ? haversine(userPos.lat, userPos.lng, b.lat, b.lng) : -(b.score || 0)
    const clean = pool.filter(b => b.status === "clean").sort((a, b) => rank(a) - rank(b))
    const rest = pool.filter(b => b.status !== "clean").sort((a, b) => rank(a) - rank(b))
    return [...clean, ...rest].slice(0, 8)
  }, [allBeaches, island, userPos])

  const favSet = new Set(favorites)
  const picked = suggestions.filter(b => favSet.has(b.id)).length + favorites.filter(id => !suggestions.some(b => b.id === id)).length

  const GOLD = "#FFC72C", GOLD_D = "#E8A800", TEAL = "#ff2db8", INK = "#EAF7F4"
  const wrap = {
    // garde les couleurs golden-hour même sous thème contraste / forced-colors (hérité)
    forcedColorAdjust: "none",
    position: "fixed", inset: 0, zIndex: 1450, display: "flex", flexDirection: "column",
    background: "radial-gradient(120% 80% at 78% 6%, rgba(255,224,160,.20), transparent 50%), linear-gradient(168deg,#2e1a5e 0%,#241246 40%,#0d0716 100%)",
    color: INK, fontFamily: "'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    padding: "max(28px,env(safe-area-inset-top)) 22px max(22px,env(safe-area-inset-bottom)) 22px",
    boxSizing: "border-box", animation: reduce ? "none" : "sgobIn .35s ease",
  }
  const h1 = { font: "800 26px/1.08 'Anton','Bricolage Grotesque',Impact,sans-serif", letterSpacing: "-.01em", textTransform: "uppercase", margin: "0 0 8px" }
  const sub = { font: "500 14px/1.45 inherit", color: "rgba(234,247,244,.8)", margin: "0 0 20px", maxWidth: 460 }
  const btnGold = { width: "100%", maxWidth: 460, padding: "16px 20px", border: "none", borderRadius: 16, cursor: "pointer", font: "800 16px/1 inherit", color: "#0A2A26", background: `linear-gradient(135deg,${GOLD},${GOLD_D})`, boxShadow: "0 10px 28px rgba(232,168,0,.32)" }
  const btnGhost = { background: "none", border: "none", color: "rgba(234,247,244,.55)", font: "600 13px/1 inherit", cursor: "pointer", padding: "12px", marginTop: 10 }

  const done = (src) => { tk("sg_onboard_done", { step, src, favs: favorites.length }); onDone && onDone() }
  const next = () => { tk("sg_onboard_step", { to: step + 1 }); setStep(s => s + 1) }

  return (
    <div role="dialog" aria-label={t("Bienvenue Premium", "Premium welcome", "Bienvenida Premium")} style={wrap}>
      <style>{"@keyframes sgobIn{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:none}}"}</style>

      {/* header : progression + passer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map(i => <span key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 999, background: i <= step ? GOLD : "rgba(255,255,255,.18)", transition: reduce ? "none" : "all .3s" }} />)}
        </div>
        <button onClick={() => done("skip")} style={{ ...btnGhost, marginTop: 0, minHeight: 44 }}>{t("Passer", "Skip", "Saltar")}</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480, width: "100%", margin: "0 auto", overflowY: "auto" }}>
        <div style={{ font: "700 11px/1 'JetBrains Mono',monospace", letterSpacing: ".12em", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>
          {t("Ton veilleur est en place", "Your watchman is set", "Tu vigía está activo")} · {t("Étape", "Step", "Paso")} {step + 1}/3
        </div>

        {step === 0 && (
          <>
            <h1 style={h1}>{t("Quelles plages surveille-t-on pour toi ?", "Which beaches should we watch for you?", "¿Qué playas vigilamos para ti?")}</h1>
            <p style={sub}>{t("Choisis-en 1 à 3. Ton veilleur t'alerte dès que l'une d'elles bascule — et te les met en tête du brief du matin.", "Pick 1 to 3. Your watchman alerts you the moment one of them changes — and puts them first in your morning brief.", "Elige de 1 a 3. Tu vigía te avisa en cuanto una cambie — y las pone primero en tu brief matinal.")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {suggestions.map(b => {
                const on = favSet.has(b.id)
                const col = b.status === "avoid" ? "#E8522A" : b.status === "moderate" ? GOLD_D : "#22C55E"
                return (
                  <button key={b.id} onClick={() => onToggleFav && onToggleFav(b.id)} aria-pressed={on} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: 14, cursor: "pointer", textAlign: "left",
                    border: on ? `1.5px solid ${GOLD}` : "1.5px solid rgba(255,255,255,.12)",
                    background: on ? "rgba(255,199,44,.12)" : "rgba(255,255,255,.04)", color: INK, font: "inherit",
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
                    <span style={{ flex: 1, font: "700 14px/1.15 inherit" }}>{b.name}{b.commune ? <span style={{ opacity: .5, fontWeight: 500 }}> · {b.commune}</span> : null}</span>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? GOLD : "rgba(255,255,255,.1)", color: on ? "#0A2A26" : "rgba(255,255,255,.5)", fontWeight: 800 }}>{on ? "✓" : "+"}</span>
                  </button>
                )
              })}
              {!suggestions.length && <p style={{ ...sub, marginBottom: 0 }}>{t("Tu pourras choisir tes plages favorites depuis la carte.", "You can pick favorite beaches from the map.", "Podrás elegir tus playas favoritas desde el mapa.")}</p>}
            </div>
            <button onClick={next} style={btnGold} disabled={false}>
              {picked > 0 ? t(`Surveiller ${picked} plage${picked > 1 ? "s" : ""}`, `Watch ${picked} beach${picked > 1 ? "es" : ""}`, `Vigilar ${picked} playa${picked > 1 ? "s" : ""}`) : t("Continuer", "Continue", "Continuar")}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h1 style={h1}>{t("Sois prévenu avant tout le monde", "Get warned before anyone else", "Entérate antes que nadie")}</h1>
            <p style={sub}>{t("Une alerte le matin où TA plage passe au rouge — pour décider avant de charger la voiture. Pas de spam : seulement quand ça change.", "An alert the morning YOUR beach turns red — so you decide before loading the car. No spam: only when it changes.", "Una alerta la mañana en que TU playa se pone roja — para decidir antes de cargar el coche. Sin spam: solo cuando cambia.")}</p>
            <button onClick={() => { setNotifAsked(true); try { onEnableNotif && onEnableNotif() } catch (e) {}; next() }} style={btnGold}>
              {t("Activer les alertes", "Enable alerts", "Activar alertas")}
            </button>
            <button onClick={next} style={btnGhost}>{t("Plus tard", "Later", "Más tarde")}</button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={h1}>{t("Ton brief t'attend chaque matin", "Your brief waits each morning", "Tu brief te espera cada mañana")}</h1>
            <p style={sub}>{t("Chaque matin, l'état de tes plages + la reco du jour t'attendent en haut de l'app. Ton veilleur a déjà commencé à veiller la mer pour toi.", "Every morning, your beaches' status + the daily pick wait at the top of the app. Your watchman is already watching the sea for you.", "Cada mañana, el estado de tus playas + la recomendación del día te esperan arriba en la app. Tu vigía ya vigila el mar por ti.")}</p>
            <button onClick={() => done("finish")} style={btnGold}>{t("C'est parti", "Let's go", "Vamos")}</button>
          </>
        )}
      </div>
    </div>
  )
}
