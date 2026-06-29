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
 * ROBUSTESSE (2026-06-29) : les flux YouTube « live 24/7 » tournent leur videoId à
 * chaque redémarrage du stream → un id codé en dur finit « recording not available ».
 * Avant, l'iframe se montait au render et, sur un id mort, pouvait happer le tap
 * (fullscreen iOS en PWA standalone) et FIGER l'app. Désormais :
 *   1) FAÇADE : on n'affiche d'abord QU'UNE vignette + bouton ▶ (zéro iframe au render,
 *      perf++). L'iframe ne se monte que sur tap explicite.
 *   2) TOUJOURS REFERMABLE : un bouton ✕ démonte l'iframe → l'utilisateur n'est
 *      JAMAIS coincé (pas de cul-de-sac, doctrine UX).
 *   3) DÉTECTION DE PANNE : on écoute l'IFrame Player API (postMessage). Sur onError
 *      (100/101/150 = vidéo indispo / embedding coupé), ou si rien ne démarre dans le
 *      délai, on retombe sur un message « momentanément indisponible » + retry — jamais
 *      un player cassé ni un gel. Un id qui meurt dégrade proprement tout seul.
 *
 * Autonome : n'importe RIEN de Sargasses_PROD → importable direct (pas de cycle).
 */
import React, { useRef, useEffect, useState, useCallback } from "react"

const T = {
  live:  { fr:"EN DIRECT", en:"LIVE", es:"EN VIVO" },
  title: { fr:"Webcam live", en:"Live webcam", es:"Cámara en vivo" },
  byb:   { fr:"Source", en:"Source", es:"Fuente" },
  off:   { fr:"Webcam momentanément indisponible", en:"Webcam temporarily offline", es:"Cámara no disponible por ahora" },
  play:  { fr:"Voir en direct", en:"Watch live", es:"Ver en vivo" },
  retry: { fr:"Réessayer", en:"Retry", es:"Reintentar" },
  close: { fr:"Fermer la webcam", en:"Close webcam", es:"Cerrar cámara" },
}

const Frame = ({ children }) => (
  <div style={{ position:"relative", width:"100%", paddingBottom:"56.25%", background:"#000", borderRadius:12, overflow:"hidden" }}>
    {children}
  </div>
)

const OffNotice = ({ label, onRetry }) => (
  <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, color:"#c7ccd4", textAlign:"center", padding:16 }}>
    <span style={{ fontSize:24, lineHeight:1 }} aria-hidden="true">📷</span>
    <span style={{ fontSize:13, fontWeight:600, maxWidth:240 }}>{label}</span>
    {onRetry && (
      <button type="button" onClick={onRetry}
        style={{ marginTop:2, fontSize:12, fontWeight:700, color:"#0d1117", background:"#FFC72C", border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer" }}>
        {onRetry.label}
      </button>
    )}
  </div>
)

/* HLS player : natif si le navigateur sait (Safari/iOS), sinon hls.js chargé à la demande. */
function HlsVideo({ url, title, offLabel }) {
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
  if (failed) return <OffNotice label={offLabel} />
  return (
    <video ref={ref} title={title} muted autoPlay playsInline controls
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", background:"#000" }} />
  )
}

/* Lecteur YouTube avec façade : vignette d'abord, iframe au tap, détection de panne. */
function YouTubePlayer({ id, title, lang, labels }) {
  const [open, setOpen] = useState(false)
  const [dead, setDead] = useState(false)
  const [thumbOk, setThumbOk] = useState(true)
  const iframeRef = useRef(null)

  // Détection de panne via l'IFrame Player API (postMessage). On s'abonne dès que
  // l'iframe est montée ; onError (id mort / embedding coupé) → on bascule en « off ».
  useEffect(() => {
    if (!open) return
    let timer
    const onMsg = (e) => {
      if (!/\.youtube(-nocookie)?\.com$/.test(_origin(e.origin))) return
      let d
      try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data } catch { return }
      if (!d) return
      if (d.event === "onError") setDead(true)
      // onReady / état "playing" (1) ou "buffering" (3) → la cam répond, on annule le délai
      if (d.event === "onReady" || (d.event === "onStateChange" && (d.info === 1 || d.info === 3))) {
        if (timer) { clearTimeout(timer); timer = null }
      }
    }
    window.addEventListener("message", onMsg)
    // Filet de sécurité : si rien ne démarre, on ne laisse pas un cadre noir muet.
    timer = setTimeout(() => setDead(true), 12000)
    return () => { window.removeEventListener("message", onMsg); if (timer) clearTimeout(timer) }
  }, [open])

  const onIframeLoad = useCallback(() => {
    // Handshake API : demande au player de nous relayer ses events.
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "sg-webcam", channel: "widget" }), "*")
    } catch { /* no-op */ }
  }, [])

  const retry = useCallback(() => { setDead(false); setOpen(false) }, [])
  const retryBtn = Object.assign(retry, { label: labels.retry })

  if (dead) {
    return <Frame><OffNotice label={labels.off} onRetry={retryBtn} /></Frame>
  }

  if (!open) {
    // FAÇADE : vignette + ▶ (aucune iframe → pas de gel possible, perf++).
    const thumb = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg"
    return (
      <Frame>
        <button type="button" onClick={() => setOpen(true)} aria-label={labels.play}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none", padding:0, cursor:"pointer", background:"#000" }}>
          {thumbOk && (
            <img src={thumb} alt="" loading="lazy" onError={() => setThumbOk(false)}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:.82 }} />
          )}
          <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ width:62, height:62, borderRadius:"50%", background:"rgba(13,17,23,.62)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 14px rgba(0,0,0,.4)" }}>
              <span style={{ borderStyle:"solid", borderWidth:"11px 0 11px 18px", borderColor:"transparent transparent transparent #fff", marginLeft:4 }} aria-hidden="true" />
            </span>
          </span>
        </button>
      </Frame>
    )
  }

  // OUVERT : iframe + bouton ✕ (toujours refermable → jamais coincé).
  const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
    "?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=" +
    encodeURIComponent(typeof location !== "undefined" ? location.origin : "")
  return (
    <Frame>
      <iframe ref={iframeRef} src={src} title={title} onLoad={onIframeLoad}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} />
      <button type="button" onClick={() => setOpen(false)} aria-label={labels.close}
        style={{ position:"absolute", top:6, right:6, width:30, height:30, borderRadius:"50%", border:"none",
          background:"rgba(13,17,23,.7)", color:"#fff", fontSize:16, lineHeight:1, cursor:"pointer", zIndex:2 }}>
        ✕
      </button>
    </Frame>
  )
}

// Origine de type "https://host" → "host" (pour matcher *.youtube(-nocookie).com).
function _origin(o) {
  try { return new URL(o).hostname } catch { return "" }
}

export function WebcamPanel({ beach, lang = "fr" }) {
  const cam = beach && beach.webcam
  if (!cam || (!cam.id && !cam.url)) return null
  const _t = (m) => (m && (m[lang] || m.fr)) || ""
  const label = cam.label || (beach.name + " — " + _t(T.title))
  const credit = cam.provider
  const labels = { off:_t(T.off), play:_t(T.play), retry:_t(T.retry), close:_t(T.close) }

  let body = null
  if (cam.type === "hls" && cam.url) {
    body = <Frame><HlsVideo url={cam.url} title={label} offLabel={labels.off} /></Frame>
  } else if (cam.id) {
    // type "youtube" (défaut)
    body = <YouTubePlayer id={cam.id} title={label} lang={lang} labels={labels} />
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
