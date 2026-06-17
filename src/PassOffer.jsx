import React from "react"

// i18n local (le _t de l'app n'est pas exporté).
const _t = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

// A/B sticky local (même convention sg_ab que l'app) — retourne l'INDEX de variante.
function abPick(testId, variants, weights) {
  try {
    const ab = JSON.parse(localStorage.getItem("sg_ab") || "{}")
    if (ab[testId] != null && ab[testId] < variants.length) return ab[testId]
    let r = Math.random(), c = 0, p = 0
    for (let i = 0; i < weights.length; i++) { c += weights[i]; if (r < c) { p = i; break } }
    ab[testId] = p; localStorage.setItem("sg_ab", JSON.stringify(ab)); return p
  } catch { return 0 }
}

// Catalogue passes one-time (généré par scripts/create-pass-links.cjs → pass-links.json).
// Liens Payment Link publics (aucun secret). Redirigent ?pass=pNN → accès time-boxé.
const PASS = {
  mq: {
    p7: [{ c: 799, u: "https://buy.stripe.com/4gM6oJfbZ2sOggZacb0co0Q" }, { c: 999, u: "https://buy.stripe.com/fZu28t1l92sO2q95VV0co0R" }],
    p30: [{ c: 1499, u: "https://buy.stripe.com/bJe5kFgg35F06Gp1FF0co0S" }, { c: 1999, u: "https://buy.stripe.com/28EdRbd3R4AWaWF8430co0T" }, { c: 2499, u: "https://buy.stripe.com/aFa28t3th1oKggZ8430co0U" }],
  },
  gp: {
    p7: [{ c: 799, u: "https://buy.stripe.com/8x26oJd3RgjE1m56ZZ0co0V" }, { c: 999, u: "https://buy.stripe.com/00w28t8NB6J48Ox6ZZ0co0W" }],
    p30: [{ c: 1499, u: "https://buy.stripe.com/4gM6oJ2pd8Rcd4N6ZZ0co0X" }, { c: 1999, u: "https://buy.stripe.com/fZu00l6Ftd7se8R0BB0co0Y" }, { c: 2499, u: "https://buy.stripe.com/fZu4gB9RF9Vg2q96ZZ0co0Z" }],
  },
}

const eur = (c, lang) => (lang === "en" ? "€" + (c / 100).toFixed(2) : (c / 100).toFixed(2).replace(".", ",") + " €")

/**
 * PassOffer — storefront « paie à l'usage » : passes one-time (accès time-boxé à
 * la prévision 7j RÉELLE + alertes + brief). Sans abonnement, sans essai, sans
 * renouvellement. Prix choisi par A/B (pass_price). onBuy(item) gère track+redirect.
 */
export default function PassOffer({ lang = "fr", onBuy }) {
  const isGP = typeof window !== "undefined" && /guadeloupe/.test(window.location.hostname)
  const cat = isGP ? PASS.gp : PASS.mq
  const v = abPick("pass_price", ["a", "b", "c"], [.34, .33, .33])
  const p30 = cat.p30[Math.min(v, cat.p30.length - 1)]
  const p7 = cat.p7[Math.min(v, cat.p7.length - 1)]
  const buy = (item, pass) => { if (onBuy) onBuy({ ...item, pass }); else try { window.location.href = item.u } catch (_) {} }

  const card = (pass, item, days, hero) => (
    <button onClick={() => buy(item, pass)} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      border: hero ? "1.5px solid #FFC72C" : "1px solid rgba(255,255,255,.16)", borderRadius: 16,
      background: hero ? "linear-gradient(180deg,rgba(255,199,44,.12),rgba(255,199,44,.04))" : "rgba(255,255,255,.04)",
      padding: "15px 16px", marginBottom: 10, position: "relative",
    }}>
      {hero && <span style={{ position: "absolute", top: -10, right: 14, background: "#FFC72C", color: "#1A2B26", font: "800 10.5px/1 system-ui", letterSpacing: ".04em", padding: "4px 9px", borderRadius: 999 }}>{_t(lang, "VACANCES", "VACATION", "VACACIONES")}</span>}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#fff" }}>
          {_t(lang, `Pass ${days} jours`, `${days}-day pass`, `Pase ${days} días`)}
        </span>
        <span className="anton" style={{ fontSize: 22, color: "#FFC72C", letterSpacing: "-.01em" }}>{eur(item.c, lang)}</span>
      </div>
      <div style={{ font: "600 12px/1.45 system-ui,sans-serif", color: "rgba(234,247,244,.7)", marginTop: 6 }}>
        {_t(lang,
          `Accès complet ${days} jours · prévision 7 j + alertes + brief. Paiement unique, sans abonnement.`,
          `Full access for ${days} days · 7-day forecast + alerts + brief. One-time, no subscription.`,
          `Acceso completo ${days} días · pronóstico 7 d + alertas + resumen. Pago único, sin suscripción.`)}
      </div>
    </button>
  )

  return (
    <div style={{ margin: "2px 0 6px" }}>
      <div style={{ font: "800 17px/1.15 'Bricolage Grotesque',system-ui,sans-serif", color: "#fff", marginBottom: 3 }}>
        {_t(lang, "Paie pour ta période. Rien de plus.", "Pay for your stay. Nothing more.", "Paga por tu estancia. Nada más.")}
      </div>
      <div style={{ font: "600 12.5px/1.4 system-ui,sans-serif", color: "rgba(234,247,244,.62)", marginBottom: 14 }}>
        {_t(lang, "Pas d'abonnement, pas de renouvellement. Tu actives, tu pars tranquille.", "No subscription, no auto-renew. Activate and go.", "Sin suscripción ni renovación. Actívalo y listo.")}
      </div>
      {card("p30", p30, 30, true)}
      {card("p7", p7, 7, false)}
      <div style={{ textAlign: "center", marginTop: 8, font: "600 10.5px/1 system-ui,sans-serif", color: "rgba(234,247,244,.45)", letterSpacing: ".015em" }}>
        {_t(lang, "Paiement sécurisé Stripe · accès immédiat", "Secure Stripe payment · instant access", "Pago seguro Stripe · acceso inmediato")}
      </div>
    </div>
  )
}
