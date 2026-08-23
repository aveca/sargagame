import React,{useEffect,useLayoutEffect,useRef,useState}from"react"
import{createPortal}from"react-dom"

// ── MENU CLIC-DROIT « LE VEILLEUR » (desktop souris) ──────────────────────────
// Bulle comic ancrée au curseur qui remplace le menu navigateur SUR LA SCÈNE/CARTE
// (jamais liens/boutons/inputs/texte — cf. garde default-deny dans Sargasses_PROD.jsx).
// Panel adverse 2026-07-03 : GO avec garde-fous a11y complets + reduced-motion + rollback.
//
// Composant PUREMENT présentationnel + a11y : App construit `items` (avec les closures
// vers ses handlers) et le header ; ici on ne fait QUE rendre, positionner, animer et
// piloter clavier/focus. Zéro import du monolithe (anti-circulaire) → mascotte inline.
//
// Contrat :
//   x, y     : ancre viewport (fixed)
//   header   : ligne insider (« Vous regardez cette plage. Moi aussi. »)
//   items    : [{ id, label, primary?, onSelect }]  (onSelect ferme lui-même via App)
//   onClose  : fermeture SANS action (Échap / clic-dehors / scroll) → App logue le dismiss

// Mascotte compacte cohérente avec <Veilleur> (satellite/bouée, œil teal, ailes dorées).
// Le REGARD (highlight) est décalé vers la GAUCHE = il fixe la mer, jamais le curseur
// (règle make-or-break du panel visuel). Statique — aucune anim de suivi.
function MiniVeilleur(){
  return(
    <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true" style={{display:"block",overflow:"visible"}}>
      <g transform="translate(32,33)">
        <circle r="21" fill="#FFC72C" opacity=".16"/>
        <rect x="-27" y="-5" width="13" height="11" rx="2.5" fill="#FFC72C"/>
        <rect x="14" y="-5" width="13" height="11" rx="2.5" fill="#FFC72C"/>
        <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#0A1714"/>
        <rect x="-11" y="-11" width="22" height="7" rx="6" fill="#3FBFB0"/>
        <line x1="0" y1="-11" x2="0" y2="-19" stroke="#3FBFB0" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="0" cy="-20" r="1.9" fill="#3FBFB0"/>
        <circle cx="0" cy="2" r="5.4" fill="#0A1714"/>
        <circle cx="0" cy="2" r="4" fill="#3FBFB0"/>
        {/* highlight décalé à gauche → regard tourné vers la mer, pas vers l'utilisateur */}
        <circle cx="-1.6" cy=".4" r="1.4" fill="#EAFBF8"/>
      </g>
    </svg>
  )
}

export default function ContextVeilleur({x=0,y=0,header,items=[],onClose}){
  const panelRef=useRef(null)
  const itemRefs=useRef([])
  const restoreRef=useRef(null)             // focus à restaurer à la fermeture (a11y)
  const [pos,setPos]=useState({left:x,top:y,ready:false})

  // Focus de départ : mémoriser l'élément actif puis focaliser le 1er item (clavier + souris).
  useEffect(()=>{
    try{restoreRef.current=document.activeElement}catch(_){}
    const id=requestAnimationFrame(()=>{try{itemRefs.current[0]&&itemRefs.current[0].focus()}catch(_){}})
    return()=>{
      cancelAnimationFrame(id)
      try{const el=restoreRef.current;if(el&&el.focus&&document.contains(el))el.focus()}catch(_){}
    }
  },[])

  // Clamp dans le viewport (jamais hors-écran = nouveau cul-de-sac). Flip au-dessus si
  // débordement bas, décalage gauche si débordement droite. Mesuré après montage.
  useLayoutEffect(()=>{
    const el=panelRef.current;if(!el)return
    const vw=window.innerWidth||360,vh=window.innerHeight||640,M=8
    const w=el.offsetWidth||220,h=el.offsetHeight||200
    let left=x,top=y
    if(left+w>vw-M)left=Math.max(M,vw-M-w)
    if(left<M)left=M
    if(top+h>vh-M)top=Math.max(M,y-h)   // flip au-dessus du curseur
    if(top<M)top=M
    setPos({left,top,ready:true})
  },[x,y])

  // Fermeture : Échap + clic-dehors (souris/tactile) + scroll/resize. Le clic-droit
  // AILLEURS déclenche d'abord ce pointerdown (ferme) puis App ré-ouvre si c'est la carte.
  useEffect(()=>{
    const onKey=e=>{
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose&&onClose();return}
      const list=itemRefs.current.filter(Boolean);if(!list.length)return
      const cur=list.indexOf(document.activeElement)
      if(e.key==="ArrowDown"||e.key==="ArrowRight"){e.preventDefault();const n=list[(cur+1+list.length)%list.length]||list[0];n&&n.focus()}
      else if(e.key==="ArrowUp"||e.key==="ArrowLeft"){e.preventDefault();const n=list[(cur-1+list.length)%list.length]||list[list.length-1];n&&n.focus()}
      else if(e.key==="Home"){e.preventDefault();list[0]&&list[0].focus()}
      else if(e.key==="End"){e.preventDefault();list[list.length-1]&&list[list.length-1].focus()}
    }
    const onDown=e=>{try{if(panelRef.current&&!panelRef.current.contains(e.target))onClose&&onClose()}catch(_){}}
    const onBail=()=>onClose&&onClose()
    document.addEventListener("keydown",onKey,true)
    window.addEventListener("pointerdown",onDown,true)
    window.addEventListener("scroll",onBail,true)
    window.addEventListener("resize",onBail)
    window.addEventListener("blur",onBail)
    return()=>{
      document.removeEventListener("keydown",onKey,true)
      window.removeEventListener("pointerdown",onDown,true)
      window.removeEventListener("scroll",onBail,true)
      window.removeEventListener("resize",onBail)
      window.removeEventListener("blur",onBail)
    }
  },[onClose])

  const activate=it=>{try{it&&it.onSelect&&it.onSelect()}catch(_){}}

  if(typeof document==="undefined"||!document.body)return null
  return createPortal(
    // sg-onink-scope : ré-ancre paper/ink si l'app est portalisée sous .theme-comic.
    <div className="sg-ctxv-root sg-onink-scope" style={{left:pos.left,top:pos.top,visibility:pos.ready?"visible":"hidden"}}>
      <div ref={panelRef} className="sg-ctxv-panel" role="menu" aria-label={header||"Menu"}
        onContextMenu={e=>e.preventDefault()/* pas de menu natif SUR notre bulle */}>
        <div className="sg-ctxv-head">
          <span className="sg-ctxv-veil" aria-hidden="true"><MiniVeilleur/></span>
          <span className="sg-ctxv-head-tx">{header}</span>
        </div>
        <div className="sg-ctxv-sep" aria-hidden="true"/>
        {items.map((it,i)=>(
          <div key={it.id||i} ref={el=>itemRefs.current[i]=el} role="menuitem" tabIndex={-1}
            className={"sg-ctxv-item"+(it.primary?" sg-ctxv-item--primary":"")}
            onClick={()=>activate(it)}
            onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate(it)}}}>
            {it.primary&&<span className="sg-ctxv-dot" aria-hidden="true"/>}
            <span className="sg-ctxv-lbl">{it.label}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
