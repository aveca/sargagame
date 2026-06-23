/*
 * ComicDetail — le détail plage « monde comic » (ChasseDetail) rendu HORS de
 * l'arène (ChasseHome), pour router les pins de la CARTE (WorldMapView/ArchipelView)
 * vers la fiche in-world au lieu d'éjecter vers la fiche data « scroll satellite ».
 *
 * Pourquoi ce wrapper (cf PRODUCT.md §8 ⭐) : ChasseDetail vit dans ChasseHome.jsx
 * et dépend (a) du CSS `.lc-` injecté UNIQUEMENT par ChasseHome (absent sur la carte
 * où l'arène n'est pas montée), (b) des variables `--ink/--paper/...` portées par
 * `.lc-root`, (c) de l'ancêtre `.lc-reduce` pour le plancher reduced-motion.
 * On reconstitue ces 3 conditions ici, sans toucher ChasseHome (arène = 100% accueil
 * = blast-radius nul). Le `.lc-root` est neutralisé visuellement (padding/fond) car
 * `.lc-detail` est `position:fixed;inset:0` et recouvre tout.
 *
 * Additif, réversible, ZÉRO logique paiement (le seul handoff = onPremium→openPremium).
 */
import React, { useMemo } from "react"
import { ChasseDetail, CSS as LC_CSS } from "./ChasseHome"

export default function ComicDetail(props){
  const reduce = useMemo(()=>{
    try{ return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) }
    catch(_){ return false }
  },[])
  return (
    <div
      className={"lc-root lc-portal"+(reduce?" lc-reduce":"")}
      style={{padding:0,background:"none",minHeight:0,position:"static"}}
    >
      <style>{LC_CSS}</style>
      <ChasseDetail {...props}/>
    </div>
  )
}
