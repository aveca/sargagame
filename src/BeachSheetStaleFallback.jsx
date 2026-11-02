import React from "react"
import { lcDetailFreshnessLabel } from "./lib/format-freshness.mjs"

const t = (lang, fr, en, es) => lang === "en" ? en : lang === "es" ? es : fr

export default function BeachSheetStaleFallback({
  beach, lang = "fr", sargData, onClose, sheetRef, backdropRef,
  onTouchStart, onTouchMove, onTouchEnd
}) {
  return (
    <>
      <div className="backdrop" ref={backdropRef} onClick={onClose}/>
      <div className="sheet" ref={sheetRef} data-testid="beach-sheet-fallback-stale"
        role="dialog" aria-modal="true"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>
        <button type="button" data-testid="beach-sheet-fallback-close"
          aria-label={t(lang, "Fermer", "Close", "Cerrar")} onClick={onClose}>×</button>
        <h2>{beach?.name}</h2>
        <p data-testid="beach-sheet-fallback-verdict" role="status">
          {t(lang, "À VÉRIFIER", "CHECK REQUIRED", "POR VERIFICAR")}
        </p>
        <p data-testid="beach-sheet-fallback-freshness">{lcDetailFreshnessLabel(sargData, lang)}</p>
        <p data-testid="beach-sheet-fallback-score-paused">
          {t(lang, "Score et prévisions suspendus.", "Score and forecast paused.", "Puntuación y pronóstico suspendidos.")}
        </p>
        <button type="button" data-testid="beach-sheet-fallback-close-map" onClick={onClose}>
          {t(lang, "Retour à la carte", "Back to map", "Volver al mapa")}
        </button>
      </div>
    </>
  )
}
