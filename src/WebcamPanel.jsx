/**
 * WebcamPanel — webcam plage EN DIRECT sur la fiche plage.
 *
 * Pourquoi : le concurrent sargazowatch.com gagne sur « la preuve du présent »
 * (une caméra ne ment pas). On affiche une cam live quand on en a une, GRATUITE
 * pour tous (pas de paywall) → capte le top-funnel ; le pass reste sur le futur
 * (forecast 7j + alertes).
 *
 * RÈGLE : on n'embarque QUE des flux qui restent SUR NOTRE SITE (le visiteur est
 * censé payer chez nous — aucun renvoi externe). Deux types seulement :
 *   { type:"youtube", id:"<videoId>", label?, provider? }  → iframe youtube-nocookie
 *   { type:"hls",     url:"https://…/x.m3u8", label?, provider? } → <video> + hls.js
 *       (HLS natif sur Safari/iOS ; hls.js chargé à la demande sur Chrome/Firefox)
 * Pas de `type:"link"` : si une cam n'est pas embarquable on ne met RIEN (la plage
 * n'a pas de champ `webcam`), on ne renvoie jamais vers un autre site.
 *
 * Autonome : n'importe RIEN de Sargasses_PROD → importable direct (pas de cycle).
 */
import React, { useRef, useEffect, useState } from "react"

const T = {
  live:  { fr:"EN DIRECT", en:"LIVE", es:"EN VIVO" },
  title: { fr:"Webcam live", en:"Live webcam", es:"Cámara en vivo" },
  byb:   { fr:"Source", en:"Source", es:"Fuente" },
  off:   { fr:"Webcam indisponible", en:"Webcam offline", es:"Cámara no disponible" },
}

const Frame = ({ children }) => (
  <div style={{ position:"relative", width:"100%", paddingBottom:"56.25%", background:"#000", borderRadius:12, overflow:"hidden" }}>
    {children}
  </div>
)

/* HLS player : natif si le navigateur sait (Safari/iOS), sinon hls.js chargé à la demande. */
function HlsVideo({ url, title }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    let hls
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url
      return
    }
    let cancelled = false
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return
      if (Hls.isSupported()) {
        hls = new Hls({ liveSyncDurationCount: 3 })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data && data.fatal) setFailed(true) })
      } else { setFailed(true) }
    }).catch(() => setFailed(true))
    return () => { cancelled = true; if (hls) hls.destroy() }
  }, [url])
  if (failed) {
    return <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#aab2bd", fontSize:13 }}>•</div>
  }
  return (
    <video ref={ref} title={title} muted autoPlay playsInline controls
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", background:"#000" }} />
  )
}

export function WebcamPanel({ beach, lang = "fr" }) {
  const cam = beach && beach.webcam
  if (!cam || (!cam.id && !cam.url)) return null
  const _t = (m) => (m && (m[lang] || m.fr)) || ""
  const label = cam.label || (beach.name + " — " + _t(T.title))
  const credit = cam.provider

  let body = null
  if (cam.type === "hls" && cam.url) {
    body = <Frame><HlsVideo url={cam.url} title={label} /></Frame>
  } else if (cam.id) {
    // type "youtube" (défaut)
    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(cam.id) +
      "?autoplay=0&rel=0&modestbranding=1&playsinline=1"
    body = (
      <Frame>
        <iframe src={src} title={label} loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} />
      </Frame>
    )
  } else {
    return null
  }

  return (
    <div style={{ margin:"16px 0 0", padding:"12px 14px", borderRadius:14, background:"#F2F5F8", border:"1px solid #e3e9ef" }}>
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
      {body}
      {credit && (
        <div style={{ fontSize:10, color:"#8a93a0", marginTop:6, textAlign:"center" }}>
          {_t(T.byb)} : {credit}
        </div>
      )}
    </div>
  )
}

export default WebcamPanel
