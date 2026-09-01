import { useEffect, useState } from "react"
import { useStore } from "./ContextVeilleur"

const ADMIN_PASSWORD = "sargagame2026"

export default function AdminAnalytics() {
  const { region, lang } = useStore()
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  // Authentification
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setLoading(true)
      try {
        const res = await fetch("https://sargassummiami.com/api/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "analytics_events", select: "*", limit: 1000 })
        })
        const data = await res.json()
        if (res.ok && data.success) {
          // Analyze the data
          const events = data.data || []
          const visitorsToday = events.filter(e => new Date(e.created_at || e.timestamp).toDateString() === new Date().toDateString()).length
          const pagesViews = events.reduce((acc, e) => {
            acc[e.page || "unknown"] = (acc[e.page || "unknown"] || 0) + 1
            return acc
          }, {})
          const topPages = Object.entries(pagesViews)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
          const topBeaches = events
            .filter(e => e.beach_id)
            .reduce((acc, e) => {
              acc[e.beach_id] = (acc[e.beach_id] || 0) + 1
              return acc
            }, {})
            const topBeachList = Object.entries(topBeaches)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
          const topRegions = events
            .filter(e => e.region)
            .reduce((acc, e) => {
              acc[e.region] = (acc[e.region] || 0) + 1
              return acc
            }, {})
            const topRegionList = Object.entries(topRegions)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)

          setStats({
            visitorsToday,
            topPages,
            topBeachList,
            topRegionList,
            totalEvents: events.length,
          })
        } else {
          setError("Erreur de récupération des données Supabase")
        }
      } catch (err) {
        setError("Erreur de connexion: " + err.message)
      }
      setLoading(false)
    } else {
      setError("Mot de passe incorrect")
    }
  }

  // Si déjà authentifié, charger les stats directement au mount
  useEffect(() => {
    if (authenticated && !stats) {
      handleSubmit({ type: "submit" })
    }
  }, [authenticated, stats])

  if (!authenticated) {
    return (
      <div style={{position:"fixed",inset:0,bgColor:"#0d1117",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:2000}}>
        <h2>{lang==="fr"'Tableau de bord analytics':lang==="es"'Panel de analytics':lang==="en"'Analytics dashboard':''}</h2>
        <p style={{font:"400 16px system-ui",color:"rgba(255,255,255,.6)",margin:"16px 0"}}>{lang==="fr"'Mot de passe: sargagame2026':lang==="es"'Contraseña: sargagame2026':lang==="en"'Password: sargagame2026':''}</p>
        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:8,width:300,maxWidth:"90%"}}>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:12,borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",color:"#fff",font:"400 14px 'Bricolage Grotesque'"}} required/>
          <button style={{padding:12,borderRadius:8,border:"none",background:"#ffd884",color:"#07201E",font:"600 14px 'Bricolage Grotesque'",width:"100%"}}>Se connecter</button>
        </form>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{position:"fixed",inset:0,bgColor:"#0d1117",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
        <p>{lang==="fr"'Chargement...':lang==="es"'Cargando...':lang==="en"'Loading...':''}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{position:"fixed",inset:0,bgColor:"#0d1117",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
        <p style={{color:"#ff5f5f"}}>{error}</p>
        <button style={{marginTop:16,padding:12,borderRadius:8,border:"none",background:"#ffd884",color:"#07201E",font:"600 14px 'Bricolage Grotesque'",onClick={()=>setAuthenticated(false)}}>Réessayer</button>
      </div>
    )
  }

  // SVG charts (horizontal bars, no library)
  const renderBar = (value, max, color, label) => {
    const percent = Math.min(100, (value / max) * 100 || 0)
    const barWidth = `${percent}%`
    return (
      <div style={{display:"flex",alignItems:"center",marginBottom:12,height:20}}>
        <div style={{width:barWidth,height:8,borderRadius:4,background:color||"#ffd884",flexShrink:0}}></div>
        <span style={{font:"400 12px system-ui",color:"rgba(255,255,255,.8)",marginLeft:8}}{label}: {value}>{Math.round(percent)}%</span>
      </div>
    )
  }

  return (
    <div style={{position:"fixed",inset:0,bgColor:"#0d1117",color:"#fff",overflow:"auto",padding:24,margin:0}}>
      <h1 style={{font:"800 28px/1.2 'Bricolage Grotesque'",marginBottom:24,borderBottom:"1px solid rgba(255,255,255,.1)",paddingBottom:12}}>
        {lang==="fr"'Tableau de bord analytics':lang==="es"'Panel de analytics':lang==="en"'Analytics dashboard':''} {authenticated ? `— ${region || 'toutes régions'}` : ''}
      </h1>

      {/* Auth box si pas encore connecté */}
      {!stats && !error && (
        <form onSubmit={handleSubmit} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:20,maxWidth:400,marginBottom:24}}>
          <p>{lang==="fr"'Mot de passe administrateur':lang==="es"'Contraseña administrativa':lang==="en"'Admin password':''} {ADMIN_PASSWORD}</p>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",padding:12,borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",color:"#fff",font:"400 14px 'Bricolage Grotesque'",marginBottom:8}} required/>
          <button style={{width:"100%",padding:12,borderRadius:8,border:"none",background:"#ffd884",color:"#07201E",font:"600 14px 'Bricolage Grotesque'"}}>Se connecter</button>
        </form>
      )}

      {/* Stats */}
      {stats && (
        <div>
          {/* Visiteurs */}
          {renderBar(stats.visitorsToday, stats.totalEvents||1, "#22C55E", lang==="fr"'Visiteurs aujourd\'hui':lang==="es"'Visitantes hoy':lang==="en"'Today visitors':''}

          )}
          {/* Pages les plus vues */}
          {stats.topPages && stats.topPages.length > 0 && (
            <div>
              <p style={{font:"600 14px 'Bricolage Grotesque'",marginBottom:8}}{lang==="fr"'Pages les plus vues':lang==="es"'Páginas más vistas':lang==="en"'Most viewed pages':''}>
              {stats.topPages.slice(0,5).map(([page, count])=>(
                <div key={page} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{font:"500 12px 'Bricolage Grotesque'",color:"#ffd884"}}>{page}</span>
                  <span style={{font:"400 12px system-ui",color:"rgba(255,255,255,.6)"}}{count} vues</span>
                </div>
              ))}</p>
            </div>
          )}

          {/* Top beaches */}
          {stats.topBeachList && stats.topBeachList.length > 0 && (
            <div>
              <p style={{font:"600 14px 'Bricolage Grotesque'",marginBottom:8}}{lang==="fr"'Top beaches':lang==="es"'Playas top':lang==="en"'Top beaches':''}>
              {stats.topBeachList.slice(0,5).map(([beachId, count])=>(
                <div key={beachId} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{font:"500 12px 'Bricolage Grotesque'",color:"#ffd884"}}>{beachId}</span>
                  <span style={{font:"400 12px system-ui",color:"rgba(255,255,255,.6)"}}{count} vues</span>
                </div>
              ))}</p>
            </div>
          )}

          {/* Top regions */}
          {stats.topRegionList && stats.topRegionList.length > 0 && (
            <div>
              <p style={{font:"600 14px 'Bricolage Grotesque'",marginBottom:8}}{lang==="fr"'Top régions':lang==="es"'Regiones top':lang==="en"'Top regions':''}>
              {stats.topRegionList.slice(0,5).map(([region, count])=>(
                <div key={region} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{font:"500 12px 'Bricolage Grotesque'",color:"#ffd884"}}>{region}</span>
                  <span style={{font:"400 12px system-ui",color:"rgba(255,255,255,.6)"}}{count} vues</span>
                </div>
              ))}</p>
            </div>
          )}

          {/* Total events */}
          <div style={{marginTop:24,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.1)"}}>
            <p style={{font:"500 14px 'Bricolage Grotesque'"}}{lang==="fr"'Total events':lang==="es"'Events totales':lang==="en"'Total events':''} {stats.totalEvents}</p>
          </div>
        </div>
      )}
    </div>
  )
}