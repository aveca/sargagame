import React, { useState, useMemo } from "react"

/**
 * PaidOnboarding — accueil GUIDÉ des nouveaux clients PAYANTS (bras A/B `pw_onboard`).
 *
 * Remplace le toast 5s « Premium activé ! » par un mini-setup 30s (skippable) qui
 * ACTIVE réellement la valeur du Premium : la valeur cœur (alertes + brief) s'accroche
 * aux PLAGES FAVORITES — or rien ne poussait le payeur à en choisir → produit silencieux
 * → churn. 3 temps : choisir 1-3 plages à surveiller → autoriser les notifs → où est le
 * brief.
 *
 * SCREENS_V2 #29 — BIENVENUE PREMIUM en COMIC : skin design-system (paper/ink/yel, Anton,
 * ombres dures, halftone) pour s'harmoniser avec le splash « Premium activé » AVANT et
 * l'arène comic APRÈS (fin de la rupture visuelle dusk violet). i18n fr/en/es,
 * reduced-motion = plancher. Logique/contenu/props INCHANGÉS.
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
  // Page « on publie nos erreurs » (le moat honnêteté), localisée. Ouverte en nouvel
  // onglet à l'étape PREUVE — placée AVANT la demande de notif (preuve avant permission).
  const relPath = lang === "en" ? "/reliability/" : lang === "es" ? "/fiabilidad/" : "/fiabilite/"
  const openReliability = () => { tk("sg_onboard_proof", {}); try { window.open(relPath, "_blank", "noopener") } catch (e) {} }

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

  // ── Design-system COMIC (PRODUCT.md §4) ──────────────────────────────────────
  const INK = "#0d0b14", PAPER = "#fdf6e3", YEL = "#ffd23f", SUB = "#4a4636"
  const wrap = {
    forcedColorAdjust: "none",
    position: "fixed", inset: 0, zIndex: 1450, display: "flex", flexDirection: "column",
    // golden-hour comic : papier crème + halo doré haut + halftone (cohérent BeachSheetComic)
    background: `radial-gradient(120% 70% at 50% -8%, ${YEL}38, transparent 55%), ${PAPER}`,
    backgroundImage: `radial-gradient(${INK}12 1.2px, transparent 1.4px), radial-gradient(120% 70% at 50% -8%, ${YEL}38, transparent 55%), linear-gradient(${PAPER},${PAPER})`,
    backgroundSize: "11px 11px, 100% 100%, 100% 100%",
    color: INK, fontFamily: "'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    padding: "max(28px,env(safe-area-inset-top)) 22px max(22px,env(safe-area-inset-bottom)) 22px",
    boxSizing: "border-box", animation: reduce ? "none" : "sgobIn .35s cubic-bezier(.16,1,.3,1)",
  }
  const h1 = { font: "400 30px/1.02 'Anton','Bricolage Grotesque',Impact,sans-serif", letterSpacing: "-.005em", textTransform: "uppercase", margin: "0 0 9px", color: INK }
  const sub = { font: "600 14px/1.45 inherit", color: SUB, margin: "0 0 20px", maxWidth: 460 }
  const btnGold = { width: "100%", maxWidth: 460, padding: "16px 20px", border: `3px solid ${INK}`, borderRadius: 16, cursor: "pointer", font: "800 16px/1 inherit", color: INK, background: YEL, boxShadow: `4px 4px 0 ${INK}` }
  const btnGhost = { background: "none", border: "none", color: SUB, font: "700 13px/1 inherit", cursor: "pointer", padding: "12px", marginTop: 10 }

  const done = (src) => { tk("sg_onboard_done", { step, src, favs: favorites.length }); onDone && onDone() }
  const next = () => { tk("sg_onboard_step", { to: step + 1 }); setStep(s => s + 1) }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Bienvenue Premium", "Premium welcome", "Bienvenida Premium")} style={wrap}>
      <style>{"@keyframes sgobIn{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:none}}"}</style>

      {/* header : progression + passer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map(i => <span key={i} style={{ width: i === step ? 22 : 9, height: 9, borderRadius: 999, border: `2px solid ${INK}`, background: i <= step ? YEL : PAPER, transition: reduce ? "none" : "all .3s" }} />)}
        </div>
        <button onClick={() => done("skip")} style={{ ...btnGhost, marginTop: 0, minHeight: 44 }}>{t("Passer", "Skip", "Saltar")}</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480, width: "100%", margin: "0 auto", overflowY: "auto" }}>
        <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 6, font: "800 10px/1 'Bricolage Grotesque'", letterSpacing: ".09em", textTransform: "uppercase", color: INK, background: YEL, border: `2px solid ${INK}`, borderRadius: 6, padding: "5px 9px", boxShadow: `2px 2px 0 ${INK}`, marginBottom: 14 }}>
          ⭐ {t("Pass activé · Le Veilleur est à son poste", "Pass active · Le Veilleur is on watch", "Pase activo · Le Veilleur está de guardia")} · {t("Étape", "Step", "Paso")} {step + 1}/4
        </div>

        {step === 0 && (
          <>
            <h1 style={h1}>{t("Quelles plages Le Veilleur garde pour toi ?", "Which beaches should Le Veilleur keep for you?", "¿Qué playas debe cuidar Le Veilleur para ti?")}</h1>
            <p style={sub}>{t("Choisis-en 1 à 3. Le Veilleur les surveillera au satellite, 4×/jour, et te prévient le matin où l'une bascule — en tête de ta dépêche.", "Pick 1 to 3. Le Veilleur watches them by satellite, 4×/day, and warns you the morning one of them turns — first in your morning dispatch.", "Elige de 1 a 3. Le Veilleur las vigila por satélite, 4×/día, y te avisa la mañana en que una cambie — primero en tu parte matinal.")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {suggestions.map(b => {
                const on = favSet.has(b.id)
                const col = b.status === "avoid" ? "#E8522A" : b.status === "moderate" ? "#E8A800" : "#1f9d57"
                return (
                  <button key={b.id} onClick={() => onToggleFav && onToggleFav(b.id)} aria-pressed={on} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: 13, cursor: "pointer", textAlign: "left",
                    border: `2.5px solid ${INK}`, color: INK, font: "inherit",
                    background: on ? YEL : PAPER, boxShadow: on ? `3px 3px 0 ${INK}` : `2px 2px 0 ${INK}`,
                  }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: col, flexShrink: 0, boxShadow: `0 0 0 2px ${INK}` }} />
                    <span style={{ flex: 1, font: "800 14px/1.15 inherit" }}>{b.name}{b.commune ? <span style={{ opacity: .55, fontWeight: 600 }}> · {b.commune}</span> : null}</span>
                    <span style={{ width: 25, height: 25, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${INK}`, background: on ? INK : PAPER, color: on ? YEL : INK, fontWeight: 900, fontSize: 14 }}>{on ? "✓" : "+"}</span>
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
            <h1 style={h1}>{t("D'abord, regarde ce qu'on vaut", "First, see what we're worth", "Primero, mira lo que valemos")}</h1>
            <p style={sub}>{t("On ne devine rien : le verdict est mesuré au satellite. Et on publie nos erreurs — nos prévisions passées, datées, face à la réalité (~76 % justes tous régimes, jusqu'à 79 % en saison). Tu n'as aucune raison de nous croire sur parole : va vérifier.", "We guess nothing: the verdict is measured by satellite. And we publish our errors — our past forecasts, dated, against reality (~76% accurate all regimes, up to 79% in season). No reason to take our word for it: go check.", "No adivinamos nada: el veredicto se mide por satélite. Y publicamos nuestros errores — previsiones pasadas, fechadas, frente a la realidad (~76% acertadas, hasta 79% en temporada). No tienes por qué creernos: ve a comprobarlo.")}</p>
            <button onClick={openReliability} style={btnGold}>
              {t("Voir notre taux d'erreur", "See our error rate", "Ver nuestra tasa de error")}
            </button>
            <button onClick={next} style={btnGhost}>{t("Plus tard", "Later", "Más tarde")}</button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={h1}>{t("Le matin où ça bascule, tu le sauras", "The morning it turns, you'll know", "La mañana en que cambie, lo sabrás")}</h1>
            <p style={sub}>{t("Le Veilleur veille la mer pendant que tu dors, jamais toi. Une alerte seulement le matin où ta plage bascule — pour décider avant de charger la voiture. Pas de spam : la mer parle, pas nous. Et en saison calme, les sargasses sont rares : on ne te préviendra pas pour rien.", "Le Veilleur watches the sea while you sleep — never you. One alert, only the morning your beach turns — so you decide before loading the car. No spam: the sea talks, not us. And in the calm season sargassum is rare: we won't ping you for nothing.", "Le Veilleur vigila el mar mientras duermes, nunca a ti. Una alerta solo la mañana en que tu playa cambie — para decidir antes de cargar el coche. Sin spam: habla el mar, no nosotros. Y en temporada tranquila el sargazo es raro: no te avisaremos por nada.")}</p>
            <button onClick={() => { setNotifAsked(true); try { onEnableNotif && onEnableNotif() } catch (e) {}; next() }} style={btnGold}>
              {t("Activer les alertes", "Enable alerts", "Activar alertas")}
            </button>
            <button onClick={next} style={btnGhost}>{t("Plus tard", "Later", "Más tarde")}</button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={h1}>{t("Il y a toujours un demain à lire", "There's always a tomorrow to read", "Siempre hay un mañana por leer")}</h1>
            <p style={sub}>{t("Chaque matin, ta dépêche t'attend en haut de l'app : l'état de tes plages d'après la dernière mesure satellite, plus la plage propre à viser aujourd'hui. Tu vois venir le matin où ça bascule, avant tout le monde. Et si une crique rouge te tente, ton Plan B — les plages propres les plus proches — est déjà là. Le Veilleur a pris son poste : il veille pour toi.", "Every morning, your dispatch waits at the top of the app: your beaches from the latest satellite measure, plus the clean beach to aim for today. You see the morning it turns coming, before everyone else. And if a red cove tempts you, your Plan B — the nearest clean beaches — is already there. Le Veilleur has taken his post: he's watching for you.", "Cada mañana, tu parte te espera arriba en la app: tus playas según la última medición por satélite, más la playa limpia a la que ir hoy. Ves venir la mañana en que cambia, antes que nadie. Y si una cala roja te tienta, tu Plan B — las playas limpias más cercanas — ya está ahí. Le Veilleur está en su puesto: vigila por ti.")}</p>
            <button onClick={() => done("finish")} style={btnGold}>{t("Lire ma première dépêche", "Read my first dispatch", "Leer mi primer parte")}</button>
          </>
        )}
      </div>
    </div>
  )
}
