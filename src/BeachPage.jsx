import React, { useEffect, useState } from "react"
import { getPathname } from "./utils/getPathname.js"
import { getCanonicalSlug } from "./lib/slug-resolver.js"

export default function BeachPage() {
  const [beach, setBeach] = useState(null)
  const [status, setStatus] = useState("loading")

  useEffect(() => {
    const p = getPathname()
    const seg = p.split("/").filter(Boolean)[1] || ""
    if (!seg) { setStatus("notfound"); return }
    // Try to load beach by id or slug
    Promise.all([
      fetch("/data/beaches-list.json").then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch("/api/copernicus/sargassum.json").then(r=>r.ok?r.json():null).catch(()=>null)
    ]).then(([list, sarg]) => {
      // Also check region inline beaches (new regions) via __REGION__
      let all = Array.isArray(list) ? [...list] : []
      try {
        const R = (typeof __REGION__ !== "undefined" && __REGION__) || null
        if (R && Array.isArray(R.beaches)) all = [...all, ...R.beaches]
      } catch {}
      const found = all.find(b => b.id === seg || getCanonicalSlug(b) === seg || (b.slug && b.slug === seg))
      if (found) {
        // Merge live status if available
        let live = null
        if (sarg && Array.isArray(sarg.levels)) {
          live = sarg.levels.find(l => l.id === found.id) || sarg.levels.find(l => getCanonicalSlug(found) === l.id)
        }
        setBeach({ ...found, live })
        setStatus("found")
        try { track("sg_beach_page_view", { beach_id: found.id }) } catch {}
      } else {
        setStatus("notfound")
      }
    }).catch(() => setStatus("notfound"))
  }, [])

  if (status === "loading") {
    return <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui"}}>Chargement…</div>
  }
  if (status === "notfound" || !beach) {
    return (
      <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center",fontFamily:"system-ui"}}>
        <h2>Plage introuvable</h2>
        <p style={{opacity:0.7}}>La plage demandée n'existe pas.</p>
        <a href="/" style={{marginTop:16,color:"#FFC72C"}}>← Retour à la carte</a>
      </div>
    )
  }

  const score = beach.live && typeof beach.live.score === "number" ? beach.live.score : null
  const st = (beach.live && beach.live.status) || beach.status || "clean"
  const color = st==="clean"?"#22C55E":st==="moderate"?"#B87A00":"#E8522A"

  return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",color:"#fff",overflow:"auto",display:"flex",flexDirection:"column",fontFamily:"system-ui"}}>
      <header style={{padding:"24px 24px 12px",borderBottom:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.03)",position:"relative"}}>
        <a href="/" style={{position:"absolute",top:12,right:12,width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none"}}>←</a>
        <h1 style={{font:"800 28px/1.2 'Bricolage Grotesque',system-ui",margin:0}}>{beach.name}</h1>
        <p style={{margin:"8px 0 0",opacity:0.7}}>{beach.commune} · {beach.island?.toUpperCase()}</p>
      </header>
      <main style={{padding:24,flex:1,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,color:color,textTransform:"uppercase"}}>{st}</span>
            {score!=null && <span style={{fontWeight:800}}>{score}/100</span>}
          </div>
          <p style={{opacity:0.8,marginTop:12}}>Données satellite Copernicus mises à jour 4× par jour. Score 0-100 combinant sargasses, houle, vent et ensoleillement.</p>
        </div>
        <div style={{display:"flex",gap:12}}>
          <a href="/" style={{flex:1,padding:14,borderRadius:10,background:"#FFC72C",color:"#0d1117",fontWeight:800,textAlign:"center",textDecoration:"none"}}>Voir la carte</a>
          <button onClick={()=>{ try{navigator.clipboard.writeText(window.location.href)}catch{}}} style={{flex:1,padding:14,borderRadius:10,background:"rgba(255,255,255,.1)",color:"#fff",fontWeight:700,border:"1px solid rgba(255,255,255,.2)",cursor:"pointer"}}>Copier lien</button>
        </div>
      </main>
    </div>
  )
}
