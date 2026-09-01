import React, { useEffect, useState } from "react"
import { getPathname } from "./utils/getPathname.js"

const labels = {
  snorkel: "Snorkeling", surf: "Surf", kite: "Kite", paddle: "Paddle", snorkeling: "Snorkeling",
  family: "Famille", kids: "Famille", dive: "Plongée", beach: "Plage", parking: "Parking"
}

export default function Activitypage() {
  const [type, setType] = useState("")
  const [status, setStatus] = useState("loading")

  useEffect(() => {
    const p = getPathname()
    const seg = p.split("/").filter(Boolean)[1] || ""
    setType(seg)
    setStatus(seg ? "found" : "notfound")
  }, [])

  if(status==="loading") return <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>Chargement…</div>
  if(status==="notfound") return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <h2>Activité introuvable</h2>
      <a href="/" style={{marginTop:16,color:"#FFC72C"}}>← Retour</a>
    </div>
  )

  const label = labels[type] || type

  return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",overflow:"auto",display:"flex",flexDirection:"column",fontFamily:"system-ui"}}>
      <header style={{padding:"24px 24px 12px",borderBottom:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.03)",position:"relative"}}>
        <a href="/" style={{position:"absolute",top:12,right:12,width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none"}}>←</a>
        <h1 style={{font:"800 32px/1.2 'Bricolage Grotesque'",margin:0,textTransform:"capitalize"}}>{label}</h1>
        <p style={{margin:"6px 0 0",opacity:0.7}}>Meilleurs spots</p>
      </header>
      <main style={{padding:24,flex:1,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:20}}>
          <p style={{opacity:0.8}}>Où pratiquer {label.toLowerCase()} sans sargasses ? Consultez la carte en temps réel pour trouver les plages propres près de vous.</p>
          <a href="/" style={{display:"inline-block",marginTop:12,padding:"10px 16px",background:"#FFC72C",color:"#0d1117",fontWeight:800,borderRadius:8,textDecoration:"none"}}>Voir la carte →</a>
        </div>
        <a href="/" style={{textAlign:"center",color:"rgba(255,255,255,.6)",marginTop:12}}>← Carte</a>
      </main>
    </div>
  )
}
