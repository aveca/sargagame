import React from "react"

// ── Primitives de SÉQUENCE génériques (extraites de PremiumModal/B2BModal #425,
//    demande fondateur 2026-07-02 « à réutiliser pour scaler le B2C »). Zéro
//    dépendance B2B : SeqDots est theme-agnostic (props ink/gold), la CSS .sgseq-*
//    est réutilisable telle quelle (transition 160 ms, gated prefers-reduced-motion).
//    Source unique désormais : B2BModal (comic) ET PassOffer (premium sombre) l'importent.
export function SeqDots({ n, at, ink, gold }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: 6, margin: "10px 0 2px" }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          border: `2px solid ${ink}`, boxSizing: "border-box", background: i < at ? gold : "#fff",
        }} />
      ))}
    </div>
  )
}

// Transition d'étape — reduced-motion respecté (aucune animation sous reduce).
export const SEQ_STEP_CSS = `@media (prefers-reduced-motion:no-preference){.sgseq-step{animation:sgseqIn .16s cubic-bezier(.16,1,.3,1) both}}
@keyframes sgseqIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}`
