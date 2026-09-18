import { useRef, useCallback } from "react"
// ── preCtaEmail.js — capture email AVANT le CTA du paywall (A1) ─────────────
// Contexte : l'email n'était capturé qu'au paiement (submitLead "onsite_*") ou
// après l'offre → les abandonneurs du paywall étaient perdus comme leads.
// A1 ajoute une capture dans le paywall : champ optionnel, placé APRÈS l'offre
// dans le flux par défaut (contrat j0 « offre AVANT email », fix UX-002).
// Garde-fous (décision CRO J0-J30 conservée) :
//   - champ TOUJOURS optionnel (jamais required) ;
//   - le CTA (onPassBuy) n'est JAMAIS conditionné à l'email ;
//   - rollback : ?email_pre=0 masque le bloc (ordre historique intact).
// Le lead part via submitLead(email, "paywall_pre") (G1 : Supabase primaire +
// backup Apps Script, fire-and-forget) + attribution sg_email_submit (event
// déjà allowlisté — aucun changement d'allowlist).

export const PRE_CTA_SOURCE = "paywall_pre"

export function isValidEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || "").trim())
}

// Décide si une valeur doit être soumise : valide + jamais soumise avant.
// Pur (testable sans React) — le hook ci-dessous ajoute le debounce.
export function shouldSubmitEmail(value, lastSent) {
  const email = (value || "").trim()
  if (!isValidEmail(email)) return null
  if (lastSent === email) return null
  return email
}

export function emailPreEnabled() {
  try {
    return !/[?&]email_pre=0(?:&|$)/.test(window.location.search || "")
  } catch (_) {
    return true
  }
}

// Hook : retourne un handler onChange à brancher sur l'input pré-CTA.
// Écrit sg_email en direct (pré-remplit le checkout, comme les champs
// existants) et soumet le lead en debounced 800ms (idiome onPayEmailInput).
export function usePreCtaEmail({ submitLead } = {}) {
  const lastSentRef = useRef("")
  const timerRef = useRef(null)
  return useCallback((e) => {
    const raw = e && e.target ? e.target.value : ""
    try {
      localStorage.setItem("sg_email", (raw || "").trim())
    } catch (_) {}
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const email = shouldSubmitEmail(raw, lastSentRef.current)
      if (!email) return
      lastSentRef.current = email
      try {
        submitLead && submitLead(email, PRE_CTA_SOURCE)
      } catch (_) {}
    }, 800)
  }, [submitLead])
}
