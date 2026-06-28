import React, { useState, useMemo } from "react"
import { T, abVariant, haversine, _t, track, Veilleur, ST, scoreLabelFor, BEACH_TO_SARG, beachThumbBg } from "./Sargasses_PROD"

function BeachListView({beaches,onBeachClick,favorites,lang,imageMap,sargData,onPremiumClick,isPremium,userPos,onRequestGeo}){
  const LL=T[lang]||T.fr
  const [q,setQ]=useState("")
  const [qFocus,setQFocus]=useState(false)
  const [chip,setChip]=useState(null)
  // TRI explicite (contrôle discret) — best (défaut, ordre data déjà classé) / near / az.
  // "near" = gracieux : haversine si géoloc, sinon temps de route (drive), sinon best.
  const [sort,setSort]=useState("best")
  const listFclock=useMemo(()=>{try{const q=window.location.search;if(/[?&]listfclock=1/.test(q))return true;if(/[?&]listfclock=0/.test(q))return false;return abVariant("list_fclock",["control","lock"],[.5,.5])==="lock"}catch(_){return false}},[])

  const filtered=useMemo(()=>{
    let r=beaches
    if(q){const lq=q.toLowerCase();r=r.filter(b=>(b.name+" "+b.commune).toLowerCase().includes(lq))}
    if(chip==="clean")r=r.filter(b=>b.status==="clean")
    if(chip==="fav")r=r.filter(b=>favorites.includes(b.id))
    if(chip==="avoid")r=r.filter(b=>b.status==="avoid")
    // TRI : "best" garde l'ordre data d'entrée (déjà classé) → ne pas re-trier.
    if(sort!=="best"){
      r=r.slice()
      if(sort==="az"){
        r.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),lang||"fr"))
      }else if(sort==="near"){
        // distance réelle si géoloc accordée, sinon fallback temps de route, sinon en queue
        const dist=b=>{
          if(userPos&&typeof b.lat==="number"&&typeof b.lng==="number")return haversine(userPos.lat,userPos.lng,b.lat,b.lng)
          if(typeof b.drive==="number")return b.drive
          return Infinity
        }
        r.sort((a,b)=>dist(a)-dist(b))
      }
    }
    return r
  },[beaches,q,chip,favorites,sort,userPos,lang])
  const nClean=filtered.filter(b=>b.status==="clean").length
  const bestToday=useMemo(()=>beaches.filter(b=>b.status==="clean"&&typeof b.score==="number").sort((a,bb)=>bb.score-a.score)[0]||null,[beaches])
  /* ── BIBLE DE MARQUE (tokens locaux, 1 rôle = 1 valeur) ──
     Statut = trio EXCLUSIF couleur + FORME-SVG + MOT. Jamais l'or sur un statut.
     Or = action premium RARE (1 seul CTA pop-3). Mono = chiffres (score). */
  const SG={gold:"#E8A800",goldL:"#FFC72C",goldLL:"#FFE47A",teal:"#009E8E",tealL:"#1EC8B0",
    clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A",ink:"#0D0D0D",mid:"#5A5A5A"}
  const MONO="'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace"
  // Couleur du trio statut depuis un status app → token bible (purge des verts pirates)
  const stColor=s=>s==="clean"?SG.clean:s==="moderate"?SG.moderate:s==="avoid"?SG.avoid:SG.mid
  // Pastille verdict : couleur + FORME SVG inline (✓ / ◐ / ✕, jamais l'Unicode tofu) + MOT
  const StatusForm=({status,size=13})=>{
    const c="#0D0D0D"
    if(status==="clean")return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>)
    if(status==="moderate")return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><circle cx="8" cy="8" r="6" fill="none" stroke="#fff" strokeWidth="2"/><path d="M8 2 A6 6 0 0 1 8 14 Z" fill="#fff"/></svg>)
    return(<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0}}><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>)
  }
  // Pastille complète (réutilisée strip + cartes) : couleur+forme+mot
  const StatusPill=({status,word})=>(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,border:`2px solid ${SG.ink}`,borderRadius:999,
      padding:"3px 9px",fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:".02em",
      boxShadow:`2px 2px 0 ${SG.ink}`,whiteSpace:"nowrap",
      background:stColor(status),color:status==="clean"?SG.ink:"#fff"}}>
      <StatusForm status={status}/>{word}
    </span>
  )
  const chips=[
    {id:"clean",label:_t(lang,"Propres","Clean","Limpias"),c:SG.clean,fg:SG.ink},
    {id:"fav",label:_t(lang,"Favoris","Favourites","Favoritas"),c:SG.teal,fg:"#fff"},
    {id:"avoid",label:_t(lang,"Éviter","Avoid","Evitar"),c:SG.avoid,fg:"#fff"},
  ]
  // Compteurs par chip (P10) : combien de plages chaque filtre donnerait, en respectant
  // la recherche q mais indépendamment du chip actif → l'utilisateur voit où il y a des
  // résultats avant de cliquer.
  const qBase=useMemo(()=>{if(!q)return beaches;const lq=q.toLowerCase();return beaches.filter(b=>(b.name+" "+b.commune).toLowerCase().includes(lq))},[beaches,q])
  const chipCount=id=>id==="fav"?qBase.filter(b=>favorites.includes(b.id)).length:qBase.filter(b=>b.status===id).length
  return(
    <div style={{height:"100%",overflowY:"auto",overflowX:"hidden",
      paddingTop:"calc(var(--sg-header-offset,108px) + env(safe-area-inset-top,0px))",paddingBottom:"calc(70px + env(safe-area-inset-bottom,12px))",
      background:"radial-gradient(120% 78% at 72% 0%, rgba(201,126,58,.28), rgba(242,176,94,.08) 42%, transparent 66%), linear-gradient(180deg,#0B2230 0%,#103029 40%,#120821 100%)",
      color:"#fff",maxWidth:600,margin:"0 auto"}}>
      {/* Editorial kicker — couleurs via tokens thème (lisible papier comic + sombre) */}
      <div style={{padding:"10px 20px 8px",display:"flex",alignItems:"baseline",gap:8}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,
          letterSpacing:"-.02em",color:"var(--sg-ink,#fff)"}}>
          {filtered.length}
        </span>
        <span style={{fontSize:12,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",
          color:"var(--sg-mute,rgba(255,255,255,.6))"}}>
          {_t(lang,`plages · ${nClean} propres`,`beaches · ${nClean} clean`,`playas · ${nClean} limpias`)}
        </span>
      </div>
      {/* Strip meilleur aujourd'hui — best clean beach card (no filter active, has candidate) */}
      {!q&&!chip&&bestToday&&(
        <button onClick={()=>onBeachClick(bestToday)}
          style={{display:"flex",alignItems:"center",gap:12,width:"calc(100% - 32px)",margin:"0 16px 12px",
            padding:14,borderRadius:16,border:`2.5px solid ${SG.ink}`,
            background:"radial-gradient(circle at 1px 1px, rgba(232,168,0,.10) 1.4px, transparent 1.6px) 0 0/7px 7px, linear-gradient(135deg,#15433A,#0E2B25)",
            cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:"#fff",
            boxShadow:`4px 4px 0 ${SG.ink}`}}>
          <div style={{width:54,height:54,flexShrink:0,borderRadius:12,border:`2px solid ${SG.ink}`,
            background:beachThumbBg(bestToday),position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.12)"}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",
              color:"var(--sg-mute,#FFE47A)",marginBottom:3}}>{_t(lang,"Meilleure aujourd'hui","Best today","Mejor hoy")}</div>
            <div className="anton" style={{fontSize:20,lineHeight:1.08,textTransform:"uppercase",color:"var(--sg-ink,#fff)",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{bestToday.name}</div>
            <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.92))",marginTop:3,fontWeight:600}}>
              {bestToday.commune} · <span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums"}}>{bestToday.score}</span><span style={{fontFamily:MONO}}>/100</span>
            </div>
          </div>
          <StatusPill status="clean" word={_t(lang,"Propre","Clean","Limpia")}/>
        </button>
      )}
      {/* Search + filter chips + TRI — recette .sg-field comic unique (bord 2.5 ink,
          ombre dure, loupe SVG mono-trait, focus ring or). Tokens thème → comic + dark. */}
      <div style={{padding:"0 16px 12px"}}>
        <div style={{position:"relative",display:"flex",alignItems:"center",gap:8,
          background:"var(--sg-card,#fff)",
          borderRadius:12,padding:"0 14px",height:48,marginBottom:12,
          border:`2.5px solid ${SG.ink}`,
          boxShadow:qFocus?`2px 2px 0 ${SG.ink}, 0 0 0 3px rgba(255,199,44,.20)`:`2px 2px 0 ${SG.ink}`,
          transition:"box-shadow .12s"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flexShrink:0,transition:"color .15s",color:qFocus?SG.gold:SG.mid}}>
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4"/>
            <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <input value={q} onChange={e=>setQ(e.target.value)} type="search"
            onFocus={()=>setQFocus(true)} onBlur={()=>setQFocus(false)}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
            placeholder={_t(lang,"Chercher une plage…","Search a beach…","Buscar una playa…")}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:16,color:"var(--sg-ink,"+SG.ink+")",fontFamily:"inherit",fontWeight:600,letterSpacing:0,minWidth:0}}/>
          {q&&<button onClick={()=>setQ("")} aria-label={_t(lang,"Effacer","Clear","Borrar")} className="sg-field-clear">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
          </button>}
        </div>
        {/* CHIPS — pill comic. Active = fond statut PLEIN (clean/teal/avoid). Le thème comic
            force le fond des boutons → on peint l'actif via classes `!important` scopées. */}
        <style>{`
          .sg-field-clear{display:flex!important;align-items:center;justify-content:center;width:36px;height:36px;padding:0!important;flex-shrink:0;
            background:none!important;border:none!important;box-shadow:none!important;border-radius:999px!important;color:${SG.mid}!important;cursor:pointer;text-shadow:none!important}
          .sg-fchip{display:inline-flex!important;align-items:center;gap:6px;min-height:36px;font-size:12px;font-weight:800!important;
            text-transform:uppercase;letter-spacing:.02em;padding:6px 12px!important;border-radius:999px!important;
            border:2.5px solid ${SG.ink}!important;box-shadow:2px 2px 0 ${SG.ink}!important;cursor:pointer;font-family:inherit!important;
            white-space:nowrap;background:var(--sg-card,#fff)!important;color:var(--sg-ink,${SG.ink})!important;text-shadow:none!important;transform:none}
          .sg-fchip.is-on{box-shadow:1px 1px 0 ${SG.ink}!important;transform:translate(2px,2px)}
          .sg-fchip.is-on .sg-fchip-ct{color:inherit!important}
          .sg-fchip-clean.is-on{background:${SG.clean}!important;color:${SG.ink}!important}
          .sg-fchip-fav.is-on{background:${SG.teal}!important;color:#fff!important}
          .sg-fchip-avoid.is-on{background:${SG.avoid}!important;color:#fff!important}
          .sg-fchip-ct{font-family:${MONO};font-variant-numeric:tabular-nums;font-weight:700;opacity:.7;color:${SG.mid}}
        `}</style>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {chips.map(ch=>{
            const active=chip===ch.id
            return(
              <button key={ch.id} onClick={()=>setChip(active?null:ch.id)}
                aria-pressed={active}
                className={`sg-fchip sg-fchip-${ch.id}`+(active?" is-on":"")}>
                {ch.label} <span className="sg-fchip-ct">{chipCount(ch.id)}</span>
              </button>
            )
          })}
        </div>
        {/* TRI — segmented discret (plus léger que les chips : sans ombre dure, zéro or).
            Câblé sur l'état `sort` ci-dessus. "Plus proches" = fallback gracieux sans géoloc.
            ⚠️ Le thème comic force `.theme-comic button{background:var(--sg-card)!important}` →
            on neutralise les styles encrés via classes `!important` scopées (sinon l'actif
            est invisible). C'est pourquoi ce contrôle utilise des classes, pas du inline. */}
        <style>{`
          .sg-sortseg{display:inline-flex;border:2px solid ${SG.ink};border-radius:999px;overflow:hidden;max-width:100%;background:var(--sg-card,#fff)}
          .sg-sortseg .sg-sortbtn{appearance:none!important;border:none!important;border-right:2px solid ${SG.ink}!important;border-radius:0!important;
            box-shadow:none!important;cursor:pointer;min-height:38px;padding:0 13px!important;
            font-family:inherit!important;font-weight:800!important;font-size:12px;text-transform:uppercase;letter-spacing:.04em;
            background:var(--sg-card,#fff)!important;color:var(--sg-mute,rgba(255,255,255,.7))!important;
            transition:background .1s,color .1s;white-space:nowrap;text-shadow:none!important}
          .sg-sortseg .sg-sortbtn:last-child{border-right:none!important}
          .sg-sortseg .sg-sortbtn.is-on{background:${SG.ink}!important;color:var(--sg-card,#fff)!important}
        `}</style>
        <div style={{marginTop:12}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".10em",textTransform:"uppercase",
            color:"var(--sg-mute,rgba(255,255,255,.6))",marginBottom:7}}>
            {_t(lang,"Trier par","Sort by","Ordenar por")}
          </div>
          <div className="sg-sortseg" role="tablist" aria-label={_t(lang,"Trier les plages","Sort beaches","Ordenar playas")}>
            {[
              {id:"best",label:_t(lang,"Meilleures","Best","Mejores")},
              {id:"near",label:_t(lang,"Plus proches","Nearest","Cercanas")},
              {id:"az",label:_t(lang,"A–Z","A–Z","A–Z")},
            ].map((s,i)=>{
              const on=sort===s.id
              return(
                <button key={s.id} role="tab" aria-selected={on}
                  className={"sg-sortbtn"+(on?" is-on":"")}
                  onClick={()=>{setSort(s.id);try{track("sg_list_sort",{sort:s.id})}catch(_){}
                    // « Plus proches » sans position → soft-ask contextuel (tri par
                    // distance réelle dès que la permission est accordée ; sinon repli drive).
                    if(s.id==="near"&&!userPos&&onRequestGeo)onRequestGeo("list_near")}}>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── CTA OR PREMIUM — le SEUL pop-3 / seule surface or de l'écran (conversion) ──
          className "sg-cta" : sous le thème comic global (100% site), c'est la règle
          `.theme-comic .sg-cta` qui peint le DORÉ golden-hour (sinon le bouton hérite du
          papier crème générique). Hors thème, le style inline or sert de fallback. */}
      {!isPremium&&(
        <button className="sg-cta sg-paygold" onClick={()=>{try{track("sg_beach_list_premium_cta")}catch(_){}; onPremiumClick("beach_list")}}
          style={{margin:"4px 16px 16px",border:`2.5px solid ${SG.ink}`,borderRadius:16,boxShadow:`6px 6px 0 ${SG.ink}`,
            background:"radial-gradient(circle at 1px 1px, rgba(13,13,13,.10) 1.3px, transparent 1.5px) 0 0/7px 7px, linear-gradient(135deg,"+SG.goldL+","+SG.gold+")",
            color:SG.ink,padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",
            width:"calc(100% - 32px)",fontFamily:"inherit"}}>
          <svg width="42" height="42" viewBox="0 0 40 40" aria-hidden="true" style={{flexShrink:0}}>
            <rect x="9" y="11" width="22" height="15" rx="6" fill="#0D0D0D"/>
            <rect x="11" y="13" width="18" height="11" rx="4" fill="#FFC72C"/>
            <circle cx="16" cy="18" r="3" fill="#0D0D0D"/><circle cx="15" cy="17.5" r="1.1" fill="#FFE47A"/>
            <path d="M31 18 L37 15 M31 20 L37 22" stroke="#0D0D0D" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:".10em",color:"#5c4500"}}>
              {_t(lang,"Le Veilleur","The Watcher","El Vigía")}
            </div>
            <div style={{fontSize:15,fontWeight:800,lineHeight:1.3,marginTop:2,color:SG.ink}}>
              {_t(lang,"7 jours d'avance · alerte dès qu'une plage change","7 days ahead · alert the moment a beach changes","7 días de adelanto · alerta en cuanto cambia una playa")}
            </div>
          </div>
          <span style={{flexShrink:0,width:30,height:30,borderRadius:"50%",background:SG.ink,color:SG.goldL,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800}}>→</span>
        </button>
      )}
      {filtered.length===0?(
        <div className="sg-empty" style={{padding:"60px 32px"}}>
          <div className="sg-empty__veil"><Veilleur mood="serein" size={64}/></div>
          <div className="sg-empty__title">
            {_t(lang,"Aucune plage trouvée","No beaches match","No se encontraron playas")}
          </div>
          <div className="sg-empty__sub">
            {_t(lang,"Essaie un autre filtre — je garde l'œil sur la mer, baie par baie.","Try another filter — I'm watching the sea, bay by bay.","Prueba otro filtro — vigilo el mar, bahía por bahía.")}
          </div>
        </div>
      ):(
      <div style={{padding:"6px 16px",display:"flex",flexDirection:"column",gap:11}}>
        {filtered.map(b=>{
          const st=ST[b.status]||ST._loading
          const hasScore=typeof b.score==="number"
          // statut du trio aligné sur le SCORE affiché (pas le status brut) → couleur+forme+mot cohérents
          const band=hasScore?(b.score>=70?"clean":b.score>=40?"moderate":"avoid"):b.status
          const railC=stColor(band)
          // MOT : label éditorial data-driven si présent, sinon le mot du trio
          const word=(hasScore&&scoreLabelFor(b.scoreLabel,lang))||(lang==="es"?st.les:lang==="en"?st.le:st.l)
          const isFav=favorites.includes(b.id)
          const sargId=BEACH_TO_SARG?.[b.id]
          const fcDays=(listFclock&&isFav&&!isPremium&&sargData)
            ?(sargData?.weekly?.[sargId]?.forecast||null)
            :null
          const colFc=s=>stColor(s)
          const hFc=s=>s==="clean"?20:s==="moderate"?28:36
          return(
            <button key={b.id} onClick={()=>onBeachClick(b)} style={{
              position:"relative",
              display:"flex",flexDirection:fcDays?"column":"row",alignItems:fcDays?"stretch":"center",
              gap:fcDays?0:13,padding:0,
              borderRadius:16,border:`2.5px solid ${SG.ink}`,
              background:"linear-gradient(180deg,#16322B,#0E2620)",
              cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%",color:"#fff",
              boxShadow:isFav&&fcDays?`6px 6px 0 ${SG.ink}`:`4px 4px 0 ${SG.ink}`,
              overflow:"hidden",
            }}>
              {/* Top row (always) */}
              <div style={{display:"flex",alignItems:"center",gap:13,position:"relative"}}>
              {/* Score-colored left rail — static (doctrine calme, pas de glow) */}
              <div aria-hidden="true" style={{position:"absolute",left:0,top:0,bottom:0,width:5,
                background:railC}}/>
              {/* Photo thumbnail */}
              <div style={{width:74,height:74,flexShrink:0,position:"relative",marginLeft:7,borderRadius:12,
                border:`2px solid ${SG.ink}`,background:beachThumbBg(b)}}/>
              <div style={{flex:1,minWidth:0,padding:"13px 4px 13px 0"}}>
                {/* Couleurs via tokens thème (--sg-ink/--sg-mute) avec fallback scène sombre :
                    lisible sur le papier crème du thème comic global ET sur fond sombre. */}
                <div className="anton" style={{fontSize:20,lineHeight:1.08,letterSpacing:".005em",
                  textTransform:"uppercase",color:"var(--sg-ink,#fff)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {isFav?<span style={{color:SG.teal}}>♥ </span>:null}{b.name}
                </div>
                <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.85))",marginTop:3,fontWeight:600,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {b.commune}{typeof b.drive==="number"?<>{" · "}<span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums"}}>{b.drive}</span>{` ${LL.drive}`}</>:""}
                </div>
                <div style={{marginTop:8}}>
                  <StatusPill status={band} word={word}/>
                </div>
              </div>
              {/* Score badge — JetBrains Mono numeral, trio-coloré (lisible papier+sombre) */}
              {hasScore&&(
                <div style={{flexShrink:0,padding:"0 16px 0 0",display:"flex",flexDirection:"column",
                  alignItems:"flex-end",justifyContent:"center"}}>
                  <span style={{fontFamily:MONO,fontVariantNumeric:"tabular-nums",fontSize:28,fontWeight:800,lineHeight:.95,
                    letterSpacing:"-.01em",color:railC}}>
                    {b.score}
                  </span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:"var(--sg-mute,rgba(255,255,255,.7))",
                    letterSpacing:".02em",marginTop:1}}>/100</span>
                </div>
              )}
              </div>
              {/* Forecast lock strip — fav only, !isPremium, A/B list_fclock */}
              {fcDays&&(
                <div onClick={e=>{e.stopPropagation();track("sg_list_fclock_click",{beach_id:b.id});onPremiumClick("list_forecast_lock")}}
                  style={{margin:"0 14px 13px",padding:"12px 14px",borderRadius:12,
                    background:"rgba(232,168,0,.10)",
                    border:`2px solid ${SG.gold}`,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--sg-ink,#FFC72C)"}}>
                        <svg width="13" height="13" viewBox="0 0 40 40" aria-hidden="true" style={{flexShrink:0}}>
                          <rect x="9" y="11" width="22" height="15" rx="6" fill="#0D0D0D"/>
                          <rect x="11" y="13" width="18" height="11" rx="4" fill="#FFC72C"/>
                          <path d="M31 18 L37 15 M31 20 L37 22" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
                        </svg>
                        {_t(lang,"Prévisions 4 jours","4-day Forecast","Pronóstico 4 días")}
                      </div>
                      <div style={{fontSize:12,color:"var(--sg-mute,rgba(255,255,255,.9))",marginTop:3,fontWeight:600}}>
                        {_t(lang,"J+2 · J+3 réservés aux Veilleurs","J+2 · J+3 for Watchers","J+2 · J+3 para Vigías")}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:8,flexShrink:0}}>
                      {[0,1].map(i=>{
                        const day=fcDays[i]
                        const c=colFc(day?.status||b.status)
                        const h=hFc(day?.status||b.status)
                        return(
                          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                            <div style={{width:22,height:h,borderRadius:5,border:`2px solid ${SG.ink}`,background:c}}/>
                            <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.85)",letterSpacing:".02em"}}>
                              {i===0?_t(lang,"AUJ","TODAY","HOY"):"J+1"}
                            </span>
                          </div>
                        )
                      })}
                      {["J+2","J+3"].map(lbl=>(
                        <div key={lbl} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                          <div style={{width:22,height:28,borderRadius:5,border:`2px dashed ${SG.goldL}`,
                            background:"rgba(255,199,44,.12)",display:"flex",alignItems:"center",
                            justifyContent:"center"}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke={SG.goldL} strokeWidth="2"/>
                              <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke={SG.goldL} strokeWidth="2"/>
                            </svg>
                          </div>
                          <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:SG.goldL,letterSpacing:".02em"}}>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}

export default BeachListView
