/**
 * IdentityStep — étape d'identification du checkout (sprint funnel 2026-09-03).
 *
 * Position : EN HAUT de l'overlay paiement (étape 1 : identité, étape 2 : paiement).
 *   « Continuer avec Google » (1 clic, OIDC vérifié serveur)  — si provisionné
 *   « ou »
 *   E-mail (parcours sans compte — jamais de mot de passe)
 *
 * Garanties :
 *   - Google NON obligatoire et NON bloquant (client_id vide → bouton absent).
 *   - Rollback : ?sgauth=0 → composant inerte (comportement antérieur intact).
 *   - Le SDK Google n'est chargé que quand cette étape est affichée (lazy).
 *   - Aucune donnée d'identité ne vient du client sans vérification serveur.
 */
import React, { useEffect, useRef, useState } from "react"
import {
  SG_GOOGLE_CLIENT_ID,
  sgAuthEnabled,
  getSgAuth,
  setSgAuth,
  authGoogle,
  renderGoogleButton,
} from "../lib/auth-client.js"

export function IdentityStep({ lang, isComic, track, payEmailRef, onPayEmailInput, visible }) {
  const enabled = typeof window !== "undefined" && sgAuthEnabled()
  const [auth, setAuth] = useState(() => (enabled ? getSgAuth() : null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const googleBoxRef = useRef(null)
  const mountedTrackRef = useRef(false)
  const emailTrackedRef = useRef(false)

  // Event de vue (1× par montage visible)
  useEffect(() => {
    if (!enabled || !visible || mountedTrackRef.current) return
    mountedTrackRef.current = true
    try { track("sg_auth_view", { provider_available: SG_GOOGLE_CLIENT_ID ? "google" : "none", has_identity: auth ? 1 : 0 }) } catch (_) {}
  }, [enabled, visible])

  // Chargement/Render du bouton Google — uniquement si visible + non identifié
  useEffect(() => {
    if (!enabled || !visible || !SG_GOOGLE_CLIENT_ID || auth?.email) return
    const el = googleBoxRef.current
    if (!el) return
    let dead = false
    ;(async () => {
      try {
        try { track("sg_google_auth_ready") } catch (_) {}
        await renderGoogleButton(el, {
          clientId: SG_GOOGLE_CLIENT_ID,
          width: Math.min(el.clientWidth || 320, 320),
          onCredential: async (credential) => {
            if (!credential || dead) return
            try { track("sg_google_auth_start") } catch (_) {}
            setBusy(true); setError("")
            try {
              const d = await authGoogle(credential)
              try { track("sg_google_auth_success", { user_id: d.user_id, premium: d.premium && d.premium.active ? 1 : 0 }) } catch (_) {}
              const a = { user_id: d.user_id, email: d.email, provider: "google", token: d.token, name: d.name }
              setAuth(a)
              // Pré-remplit le champ email du checkout (le même input drive le paiement)
              try {
                const input = payEmailRef && payEmailRef.current
                if (input) { input.value = d.email; onPayEmailInput && onPayEmailInput() }
              } catch (_) {}
            } catch (e) {
              const msg = (e && e.message) || "error"
              try { track("sg_google_auth_error", { reason: msg.slice(0, 60) }) } catch (_) {}
              setError(_t(lang,
                "Connexion Google impossible pour l'instant — continue avec ton email juste en dessous.",
                "Google sign-in failed — continue with your email below.",
                "No se pudo conectar con Google — continúa con tu email abajo."))
            } finally { setBusy(false) }
          },
        })
      } catch (_) {
        // SDK injoignable (réseau/bloqueur) → le parcours email reste disponible
        try { track("sg_google_auth_error", { reason: "gis_unavailable" }) } catch (_) {}
      }
    })()
    return () => { dead = true }
  }, [enabled, visible, auth])

  if (!enabled || !visible) return null

  // ── Identité connue → récap (« Connecté avec Google · x@y ») ──
  if (auth && auth.email) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div
          data-testid="sg-identity-chip"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderRadius: 12,
            background: isComic ? "rgba(13,11,20,.06)" : "rgba(34,197,94,.10)",
            border: isComic ? "2px solid rgba(13,11,20,.25)" : "1px solid rgba(34,197,94,.30)",
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: auth.provider === "google" ? "#fff" : "#FFC72C",
            color: "#0D0B14", fontWeight: 800, fontSize: 12,
            border: isComic ? "1.5px solid #0D0B14" : "none",
          }}>
            {auth.provider === "google" ? "G" : "@"}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: isComic ? "#0D0B14" : "#eef2f7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {auth.provider === "google"
              ? _t(lang, "Connecté avec Google", "Signed in with Google", "Conectado con Google")
              : _t(lang, "Ton accès :", "Your access:", "Tu acceso:")}{" "}
            <strong>{auth.email}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              try { track("sg_identity_change") } catch (_) {}
              setAuth(null)
              try { localStorage.removeItem("sg_auth") } catch (_) {}
            }}
            style={{
              background: "none", border: "none", padding: "8px 6px", minHeight: 44, minWidth: 44,
              color: isComic ? "rgba(13,11,20,.55)" : "rgba(255,255,255,.55)",
              fontSize: 12, fontWeight: 700, textDecoration: "underline", cursor: "pointer",
            }}
          >
            {_t(lang, "Changer", "Change", "Cambiar")}
          </button>
        </div>
      </div>
    )
  }

  // ── Pas d'identité → Google + « ou » (email = l'input existant juste dessous) ──
  return (
    <div style={{ marginBottom: 4 }}>
      {SG_GOOGLE_CLIENT_ID ? (
        <>
          <div style={{
            textAlign: "center", fontSize: 12.5, fontWeight: 700, marginBottom: 8,
            color: isComic ? "rgba(13,11,20,.65)" : "rgba(255,255,255,.65)",
          }}>
            {_t(lang, "Accède en 1 clic", "Get access in 1 click", "Accede en 1 clic")}
          </div>
          <div
            ref={googleBoxRef}
            data-testid="sg-google-button"
            style={{ display: "flex", justifyContent: "center", minHeight: 44, marginBottom: 6, opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}
          />
          {error && (
            <div role="alert" style={{ fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 8 }}>
              {error}
            </div>
          )}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, margin: "6px 0 14px",
            color: isComic ? "rgba(13,11,20,.35)" : "rgba(255,255,255,.35)", fontSize: 11.5, fontWeight: 600,
          }}>
            <span style={{ flex: 1, height: 1, background: isComic ? "rgba(13,11,20,.15)" : "rgba(255,255,255,.15)" }} />
            {_t(lang, "ou avec ton email", "or with your email", "o con tu email")}
            <span style={{ flex: 1, height: 1, background: isComic ? "rgba(13,11,20,.15)" : "rgba(255,255,255,.15)" }} />
          </div>
        </>
      ) : null}
      {/* Marqueur : première saisie email = début du parcours identité email */}
    </div>
  )
}

/** À brancher sur l'input email du checkout — 1er focus = début parcours email. */
export function trackEmailIdentityStart(track, ref) {
  if (ref && ref.current) return
  if (ref) ref.current = true
  try { track("sg_email_identity_start") } catch (_) {}
}

function _t(lang, fr, en, es) {
  return lang === "en" ? en : lang === "es" ? es : fr
}
