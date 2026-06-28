/**
 * WebcamPanel — webcam plage EN DIRECT sur la fiche plage.
 *
 * Pourquoi : le concurrent sargazowatch.com gagne sur « la preuve du présent »
 * (une caméra ne ment pas). On affiche une cam live quand on en a une, GRATUITE
 * pour tous (pas de paywall) → capte le top-funnel ; le pass reste sur le futur
 * (forecast 7j + alertes).
 *
 * Données : champ optionnel `beach.webcam` (rétro-compatible — rend null si absent).
 *   { type:"youtube", id:"<videoId>", label?, provider?, credit? }   → embed iframe
 *   { type:"link",    url:"https://…", label?, provider?, credit? }   → bouton « Voir la
 *       webcam live ↗ » (pour les providers type SkylineWebcams qui ne donnent pas
 *       d'iframe libre ; on lie vers leur page plutôt qu'un embed cassé).
 *
 * Autonome : n'importe RIEN de Sargasses_PROD → importable direct (pas de cycle).
 */
import React from "react"

const T = {
  live:    { fr:"EN DIRECT", en:"LIVE", es:"EN VIVO" },
  title:   { fr:"Webcam live", en:"Live webcam", es:"Cámara en vivo" },
  watch:   { fr:"Voir la webcam live", en:"Watch live webcam", es:"Ver cámara en vivo" },
  byb:     { fr:"Source", en:"Source", es:"Fuente" },
}

export function WebcamPanel({ beach, lang = "fr" }) {
  const cam = beach && beach.webcam
  if (!cam || (!cam.id && !cam.url)) return null
  const _t = (m) => (m && (m[lang] || m.fr)) || ""
  const label = cam.label || (beach.name + " — " + _t(T.title))
  const credit = cam.credit || cam.provider

  const Head = (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
      <span style={{
        display:"inline-flex", alignItems:"center", gap:5, fontSize:10, fontWeight:800,
        letterSpacing:.4, color:"#fff", background:"#e11d2e", padding:"3px 7px", borderRadius:6,
      }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#fff", display:"inline-block" }} />
        {_t(T.live)}
      </span>
      <span style={{ fontSize:12, fontWeight:700, color:"#1d2b3a", lineHeight:1.2 }}>📹 {label}</span>
    </div>
  )

  const Credit = credit ? (
    <div style={{ fontSize:10, color:"#8a93a0", marginTop:6, textAlign:"center" }}>
      {_t(T.byb)} : {credit}
    </div>
  ) : null

  if (cam.type === "link") {
    return (
      <div style={{ margin:"16px 0 0", padding:"12px 14px", borderRadius:14, background:"#F2F5F8", border:"1px solid #e3e9ef" }}>
        {Head}
        <a href={cam.url} target="_blank" rel="noopener noreferrer"
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            width:"100%", boxSizing:"border-box", padding:"12px 14px", borderRadius:12,
            background:"#1d2b3a", color:"#fff", fontWeight:800, fontSize:14,
            textDecoration:"none",
          }}>
          {_t(T.watch)} ↗
        </a>
        {Credit}
      </div>
    )
  }

  // type "youtube" (défaut) — embed iframe responsive 16:9
  const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(cam.id) +
    "?autoplay=0&rel=0&modestbranding=1&playsinline=1"
  return (
    <div style={{ margin:"16px 0 0", padding:"12px 14px", borderRadius:14, background:"#F2F5F8", border:"1px solid #e3e9ef" }}>
      {Head}
      <div style={{ position:"relative", width:"100%", paddingBottom:"56.25%", background:"#000", borderRadius:12, overflow:"hidden" }}>
        <iframe
          src={src}
          title={label}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}
        />
      </div>
      {Credit}
    </div>
  )
}

export default WebcamPanel
