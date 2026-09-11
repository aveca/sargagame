/**
 * BeachDayReport — « Rapport plage du jour » (HARD ASSET REQUIREMENT §PDF).
 *
 * Objet produit : PREVIEW (modale) → OPEN → DOWNLOAD (impression/PDF système)
 * → SHARE (Web Share API → presse-papiers). 100 % données RÉELLES via props,
 * AUCUNE fabrication : sans série → « indisponible », jours verrouillés (J+2→J+7
 * non-premium) EXCLUS du rapport, jamais colorés.
 *
 * Chargé en lazy (lazyWithRetry) depuis BeachSheetComic → 0 octet eager.
 * Rollback : ?report=0 (désactivé à l'appelant, jamais ici).
 *
 * GIF=RACONTER (§3, path préféré) : bandeau dérive J0→J7 animé en SVG/CSS
 * synchronisé sur la data live (un GIF raster irait stale au lendemain —
 * §8 sync) ; tracké sg_gif_view {render:"svg-animated"} + fallback statique
 * prefers-reduced-motion. Photo PNG/JPG : /beaches/{imageMap} si connue
 * (alt + lazy), sinon bloc absent — jamais de placeholder.
 */
import React, { useEffect, useRef, useState } from "react"
import { beachAssetName, mediaParams, trackMedia, prefersReducedMotion, unlockedRows } from "../lib/mediaKit.js"

function _t(lang, fr, en, es) { return lang === "en" ? en : lang === "es" ? es : fr }
function dayNum() { try { return new Date().toISOString().slice(0, 10) } catch (_) { return "today" } }
function statusColor(s) { return s === "clean" ? "#22C55E" : s === "moderate" ? "#B87A00" : s === "avoid" ? "#E8522A" : "#8A8A8A" }
function statusLabel(s, lang) {
  const M = {
    clean: { fr: "PROPRE", en: "CLEAN", es: "LIMPIA" },
    moderate: { fr: "MODÉRÉ", en: "MODERATE", es: "MODERADA" },
    avoid: { fr: "À ÉVITER", en: "AVOID", es: "EVITAR" },
  }
  const e = M[s] || { fr: "—", en: "—", es: "—" }
  return lang === "en" ? e.en : lang === "es" ? e.es : e.fr
}

export default function BeachDayReport({ beach, fcDays, unlocked, satLabel, satTs, imageMap, lang = "fr", track }) {
  const trk = (n, p) => trackMedia(track, n, p)
  const [copied, setCopied] = useState(false)
  const sheetRef = useRef(null)
  const region = beach?.island || null
  const assetId = beachAssetName(beach?.id, "report-" + dayNum(), "pdf")
  const { rows, gated } = unlockedRows(fcDays, !!unlocked)
  const reduce = prefersReducedMotion()
  const photo = imageMap && beach?.id && imageMap[beach.id] && !String(imageMap[beach.id]).startsWith("sat-")
    ? "/beaches/" + imageMap[beach.id]
    : null

  useEffect(() => {
    trk("sg_pdf_preview", mediaParams({ beach_id: beach?.id, region, screen: "beach_sheet", asset_id: assetId, asset_type: "pdf", source: "report_button" }))
    trk("sg_pdf_open", mediaParams({ beach_id: beach?.id, region, screen: "beach_sheet", asset_id: assetId, asset_type: "pdf" }))
    trk("sg_svg_view", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: beachAssetName(beach?.id, "score", "svg"), asset_type: "svg", source: "day_report" }))
    trk("sg_gif_view", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: beachAssetName(beach?.id, "drift", "gif"), asset_type: "gif", render: "svg-animated", source: "day_report" }))
    if (photo) trk("sg_photo_view", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: photo, asset_type: "photo", source: "beaches" }))
    const h = (e) => { if (e.key === "Escape") { try { sheetRef.current?._close?.() } catch (_) {} } }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doPrint = () => {
    trk("sg_pdf_download", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: assetId, asset_type: "pdf", interaction: "print" }))
    try { window.print() } catch (_) {}
  }
  // P0 attribution — même convention que _shareUrl (app) : UTM préservées si
  // déjà présentes (chaîne de partage), sinon utm_source=<canal> + medium=share +
  // campaign=beach_report. WhatsApp : utm_source=whatsapp (cf. plan acquisition).
  const shareHref = (channel) => {
    try {
      const href = window.location.href
      if (/[?&]utm_/.test(href)) return href
      const ch = String(channel || 'report').replace(/[^a-z]/g, '').slice(0, 20) || 'report'
      return href + (href.includes('?') ? '&' : '?') + 'utm_source=' + ch + '&utm_medium=share&utm_campaign=beach_report'
    } catch (_) { return window.location.href }
  }
  const doShare = async () => {
    const text = _t(lang, `Rapport ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Mesuré au satellite, pas deviné.`, `Report ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Measured by satellite, not guessed.`, `Informe ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Medido por satélite.`)
    trk("sg_pdf_share", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: assetId, asset_type: "pdf", interaction: "share" }))
    try {
      if (navigator.share) { await navigator.share({ title: text, text, url: shareHref('report') }) }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text + " " + shareHref('report')); setCopied(true); setTimeout(() => setCopied(false), 2200) }
    } catch (_) {}
  }
  // J0-J30 — WhatsApp explicite (priorité mobile mission) : deep-link wa.me avec le
  // même texte factuel (plage + état + date + lien, aucune promesse). Tracking réutilisé :
  // sg_pdf_share {interaction:"whatsapp"}. Jamais de texte hors data fiche.
  const doWhatsApp = () => {
    const text = _t(lang, `Rapport ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Mesuré au satellite, pas deviné.`, `Report ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Measured by satellite, not guessed.`, `Informe ${beach?.name || ""} — ${statusLabel(beach?.status, lang)} (${dayNum()}). Medido por satélite.`)
    trk("sg_pdf_share", mediaParams({ beach_id: beach?.id, region, screen: "day_report", asset_id: assetId, asset_type: "pdf", interaction: "whatsapp" }))
    try {
      const url = "https://wa.me/?text=" + encodeURIComponent(text + " " + shareHref('whatsapp'))
      window.open(url, "_blank", "noopener")
    } catch (_) {}
  }

  const st = beach?.status || "_loading"
  return (
    <div className="sg-dayreport-print" ref={sheetRef} role="dialog" aria-modal="true"
      aria-label={_t(lang, "Rapport plage du jour", "Daily beach report", "Informe diario de playa")}
      style={{ background: "#fff", color: "#141414", borderRadius: 18, padding: "22px 20px calc(20px + env(safe-area-inset-bottom))", maxWidth: 560, margin: "0 auto", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
      <style>{`
        @keyframes sgDrift{0%{transform:translateX(-6px);opacity:.55}50%{transform:translateX(6px);opacity:1}100%{transform:translateX(-6px);opacity:.55}}
        @media (prefers-reduced-motion:reduce){.sg-drift-anim{animation:none!important}}
        @media print{
          body>*{display:none!important}
          body>.sg-print-root,body .sg-dayreport-print{display:block!important}
          .sg-dr-only{display:none!important}
        }
      `}</style>

      {/* En-tête objet */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ font: "800 10px/1 'Bricolage Grotesque'", letterSpacing: ".18em", color: "#666" }}>{_t(lang, "RAPPORT PLAGE DU JOUR", "DAILY BEACH REPORT", "INFORME DIARIO DE PLAYA")}</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, lineHeight: 1, textTransform: "uppercase", marginTop: 6 }}>{beach?.name || "—"}</div>
          <div style={{ font: "600 12px/1.4 'Bricolage Grotesque'", color: "#555", marginTop: 4 }}>{dayNum()}{beach?.commune ? " · " + beach.commune : ""}</div>
        </div>
        <span style={{ font: "800 11px/1 'Bricolage Grotesque'", padding: "8px 12px", borderRadius: 999, background: statusColor(st), color: st === "avoid" ? "#fff" : "#141414", whiteSpace: "nowrap" }}>{statusLabel(st, lang)}</span>
      </div>

      {/* Photo preuve / contexte (PNG/JPG) — réelle ou absente, jamais placeholder */}
      {photo && (
        <img src={photo} alt={_t(lang, `Photo de ${beach?.name || "la plage"}`, `Photo of ${beach?.name || "the beach"}`, `Foto de ${beach?.name || "la playa"}`)}
          loading="lazy" style={{ width: "100%", height: "auto", borderRadius: 12, marginTop: 14, display: "block", background: "#eee" }} />
      )}

      {/* Score (SVG) */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
        <svg width="72" height="72" viewBox="0 0 120 120" role="img" aria-label={_t(lang, `Indice ${typeof beach?.score === "number" ? beach.score : "non noté"} sur 100`, `Score ${typeof beach?.score === "number" ? beach.score : "unrated"} out of 100`, `Índice ${typeof beach?.score === "number" ? beach.score : "sin nota"} sobre 100`)} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
          <circle cx="60" cy="60" r="44" fill="none" stroke="#14141418" strokeWidth="10" />
          {typeof beach?.score === "number" && (
            <circle cx="60" cy="60" r="44" fill="none" stroke={statusColor(st)} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44} strokeDashoffset={(2 * Math.PI * 44) * (1 - Math.min(100, beach.score) / 100)} />
          )}
        </svg>
        <div>
          <div style={{ font: "800 30px/1 'Bricolage Grotesque'" }}>{typeof beach?.score === "number" ? beach.score : "—"}<span style={{ fontSize: 14, color: "#666" }}>/100</span></div>
          <div style={{ font: "600 12px/1.4 'Bricolage Grotesque'", color: "#555" }}>{satLabel || _t(lang, "Mesuré au satellite, pas deviné.", "Measured by satellite, not guessed.", "Medido por satélite.")}</div>
        </div>
      </div>

      {/* Dérive J0→J7 (fonction GIF via SVG animé synchronisé §8) */}
      <div style={{ marginTop: 16 }}>
        <div style={{ font: "800 10px/1 'Bricolage Grotesque'", letterSpacing: ".16em", color: "#666", marginBottom: 8 }}>{_t(lang, "DÉRIVE J0 → J7", "DRIFT D0 → D7", "DERIVA D0 → D7")}</div>
        {rows.length > 0 ? (
          <div className={reduce ? undefined : "sg-drift-anim"} role="img"
            aria-label={_t(lang, `Évolution : ${rows.map((d) => statusLabel(d.status, lang)).join(", ")}`, `Trend: ${rows.map((d) => statusLabel(d.status, lang)).join(", ")}`, `Evolución: ${rows.map((d) => statusLabel(d.status, lang)).join(", ")}`)}
            style={{ display: "flex", gap: 6, animation: reduce ? undefined : "sgDrift 3.2s ease-in-out infinite" }}>
            {rows.map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 30, borderRadius: 7, background: statusColor(d.status), border: "2px solid #141414" }} />
                <span style={{ display: "block", font: "800 9px/1 'Bricolage Grotesque'", color: "#555", marginTop: 4 }}>{i === 0 ? _t(lang, "J0", "D0", "D0") : "J" + i}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ font: "600 12px/1.5 'Bricolage Grotesque'", color: "#555", border: "2px dashed #999", borderRadius: 10, padding: "10px 12px" }}>
            {_t(lang, "Prévision indisponible pour cette plage — aucun jour inventé.", "Forecast unavailable for this beach — no day invented.", "Pronóstico no disponible para esta playa — ningún día inventado.")}
          </div>
        )}
        {gated && (
          <div style={{ font: "600 11.5px/1.4 'Bricolage Grotesque'", color: "#555", marginTop: 8 }}>
            {_t(lang, "J+2 → J+7 complets avec Premium (verdict du jour toujours gratuit).", "Full D+2 → D+7 with Premium (today's verdict always free).", "D+2 → D+7 completos con Premium (el veredicto de hoy siempre gratis).")}
          </div>
        )}
      </div>

      {/* Sources + honnêteté */}
      <div style={{ font: "600 11px/1.5 'Bricolage Grotesque'", color: "#666", marginTop: 16, borderTop: "1px solid #ddd", paddingTop: 10 }}>
        {_t(lang, "Sources : satellite ERDDAP (Sentinel/MODIS) via pipeline Sargagame", "Sources: ERDDAP satellite (Sentinel/MODIS) via Sargagame pipeline", "Fuentes: satélite ERDDAP (Sentinel/MODIS) vía pipeline Sargagame")}
        {satTs ? " · " + satTs : ""}. {_t(lang, "L'argent ne touche jamais le verdict.", "Money never touches the verdict.", "El dinero nunca toca el veredicto.")}
      </div>

      {/* Actions : OPEN → DOWNLOAD → SHARE */}
      <div className="sg-dr-only" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={doPrint} style={{ flex: 1, minWidth: 140, minHeight: 48, borderRadius: 12, border: "2.5px solid #141414", background: "#FFC72C", color: "#141414", font: "800 14px/1 'Bricolage Grotesque'", cursor: "pointer" }}>
          {_t(lang, "⬇ Télécharger PDF", "⬇ Download PDF", "⬇ Descargar PDF")}
        </button>
        <button type="button" onClick={doShare} style={{ flex: 1, minWidth: 140, minHeight: 48, borderRadius: 12, border: "2.5px solid #141414", background: "#fff", color: "#141414", font: "800 14px/1 'Bricolage Grotesque'", cursor: "pointer" }}>
          {copied ? _t(lang, "✓ Copié !", "✓ Copied!", "✓ ¡Copiado!") : _t(lang, "⤴ Partager", "⤴ Share", "⤴ Compartir")}
        </button>
        <button type="button" onClick={doWhatsApp} aria-label={_t(lang, "Partager sur WhatsApp", "Share on WhatsApp", "Compartir en WhatsApp")} style={{ flex: 1, minWidth: 140, minHeight: 48, borderRadius: 12, border: "2.5px solid #141414", background: "#25D366", color: "#141414", font: "800 14px/1 'Bricolage Grotesque'", cursor: "pointer" }}>
          {_t(lang, "WhatsApp", "WhatsApp", "WhatsApp")}
        </button>
      </div>
      <div className="sg-dr-only" style={{ font: "600 10.5px/1.4 'Bricolage Grotesque'", color: "#888", marginTop: 8, textAlign: "center" }}>
        {_t(lang, "« Télécharger PDF » ouvre l'impression : choisis « Enregistrer au format PDF ».", "“Download PDF” opens printing: choose “Save as PDF”.", "«Descargar PDF» abre la impresión: elige «Guardar como PDF».")}
      </div>
    </div>
  )
}
