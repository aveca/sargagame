import React, { useEffect, useState } from "react"
import { getPathname } from "./utils/getPathname.js"

function slugify(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") }

export default function Poipage() {
  const [poi, setPoi] = useState(null)
  const [status, setStatus] = useState("loading")

  useEffect(() => {
    const p = getPathname()
    const seg = p.split("/").filter(Boolean)[1] || ""
    if (!seg) { setStatus("notfound"); return }
    fetch("/api/pois.json").then(r=>r.ok?r.json():null).catch(()=>null).then(data=>{
      if(!data||!data.regions){ setStatus("notfound"); return }
      const all = Object.values(data.regions).flatMap(r=>r.pois||[])
      const found = all.find(x=> x.id===seg || slugify(x.name)===seg )
      if(found){ setPoi(found); setStatus("found") } else setStatus("notfound")
    }).catch(()=> setStatus("notfound"))
  }, [])

  if(status==="loading") return <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>Chargement…</div>
  if(status==="notfound"||!poi) return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <h2>POI introuvable</h2>
      <a href="/" style={{marginTop:16,color:"#FFC72C"}}>← Retour à la carte</a>
    </div>
  )

  return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",overflow:"auto",display:"flex",flexDirection:"column",fontFamily:"system-ui"}}>
      <header style={{padding:"24px 24px 12px",borderBottom:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.03)",position:"relative"}}>
        <a href="/" style={{position:"absolute",top:12,right:12,width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none"}}>←</a>
        <h1 style={{font:"800 28px/1.2 'Bricolage Grotesque'",margin:0}}>{poi.name}</h1>
        <p style={{margin:"6px 0 0",opacity:0.7}}>{poi.type}</p>
      </header>
      <main style={{padding:24,flex:1,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:20}}>
          <p style={{opacity:0.8}}>Coordonnées: {poi.lat?.toFixed(4)}, {poi.lng?.toFixed(4)}</p>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`} target="_blank" rel="noopener" style={{display:"inline-flex",marginTop:12,padding:"10px 16px",background:"rgba(255,255,255,.1)",borderRadius:8,color:"#fff",fontWeight:700,textDecoration:"none"}}>Y aller →</a>
        </div>
        <a href="/" style={{textAlign:"center",color:"rgba(255,255,255,.6)",marginTop:12}}>← Carte</a>
      </main>
    </div>
  )
}
