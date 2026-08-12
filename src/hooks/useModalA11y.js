import {useEffect} from "react"

export default function useModalA11y(panelRef,onClose,escClose=true){
  useEffect(()=>{
    const panel=panelRef.current
    const prevFocus=(typeof document!=="undefined"&&document.activeElement)||null
    const SEL='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const focusables=()=>panel?Array.prototype.filter.call(panel.querySelectorAll(SEL),el=>el.offsetParent!==null||el===document.activeElement):[]
    try{if(panel&&!panel.contains(document.activeElement)){const f=focusables();(f[0]||panel).focus&&(f[0]||panel).focus()}}catch(_){}
    const onKey=e=>{
      const inOther=(()=>{try{const t=e.target;const d=t&&t.closest&&t.closest('[role="dialog"][aria-modal="true"]');return d&&panel&&d!==panel&&!panel.contains(d)}catch(_){return false}})()
      if(e.key==="Escape"){if(escClose&&!inOther){e.stopPropagation();onClose&&onClose()}return}
      if(e.key!=="Tab"||!panel||inOther)return
      const f=focusables();if(!f.length){e.preventDefault();return}
      const first=f[0],last=f[f.length-1],a=document.activeElement
      if(e.shiftKey&&(a===first||!panel.contains(a))){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&a===last){e.preventDefault();first.focus()}
    }
    document.addEventListener("keydown",onKey,true)
    return()=>{document.removeEventListener("keydown",onKey,true)
      try{prevFocus&&prevFocus.focus&&prevFocus.focus()}catch(_){}}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
}
