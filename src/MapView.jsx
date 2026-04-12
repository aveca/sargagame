/**
 * MapView — Leaflet map extracted from monolith for lazy-loading.
 * Dynamic import shaves ~150KB off first paint (leaflet chunk deferred).
 */
import React,{useState,useEffect,useRef,useCallback}from"react"
import L from"leaflet"
import"leaflet/dist/leaflet.css"

/* ── Duplicated stable constants (small, avoids circular imports) ───────── */
const ISLAND_CENTER={mq:[14.64,-61.02],gp:[16.22,-61.55]}

const SARG_TO_BEACH={"grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034","anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004","les-salines":"mq001","vauclin":"mq044","gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010","gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009","gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"}

const GOLD="#E8A800"

/* ── i18n subset for Caribbean view ─────────────────────────────── */
const T_CARIB={
  fr:{
    caribbeanView:"Vue Caraibe",localView:"Vue locale",
    legendTitle:"Concentration AFAI",legendLow:"Faible",legendMod:"Modere",legendHigh:"Fort",
    source:"Source : NOAA ERDDAP",
    zoneSargasso:"Mer des Sargasses",zoneNERR:"NERR",
    zoneLesser:"Petites Antilles",zoneGreater:"Grandes Antilles",
    zoneGulf:"Golfe du Mexique",zoneAfrica:"Cote Afrique Ouest",
  },
  en:{
    caribbeanView:"Caribbean View",localView:"Local View",
    legendTitle:"AFAI Concentration",legendLow:"Low",legendMod:"Moderate",legendHigh:"High",
    source:"Source: NOAA ERDDAP",
    zoneSargasso:"Sargasso Sea",zoneNERR:"NERR",
    zoneLesser:"Lesser Antilles",zoneGreater:"Greater Antilles",
    zoneGulf:"Gulf of Mexico",zoneAfrica:"West Africa Coast",
  },
}

/* ── Caribbean zone labels ────────────────────────────────────── */
const CARIBBEAN_ZONES=[
  {id:"sargasso",lat:26,lng:-64,key:"zoneSargasso"},
  {id:"nerr",lat:11,lng:-52,key:"zoneNERR"},
  {id:"lesser",lat:14.5,lng:-60,key:"zoneLesser"},
  {id:"greater",lat:19.5,lng:-73,key:"zoneGreater"},
  {id:"gulf",lat:24,lng:-88,key:"zoneGulf"},
  {id:"africa",lat:12,lng:-20,key:"zoneAfrica"},
]

/* ── Caribbean bounds ─────────────────────────────────────────── */
const CARIB_BOUNDS=[[8,-90],[28,-55]]

const ST={
  _loading:{c:"#666",bg:"rgba(100,100,100,.1)"},
  clean:{c:"#22C55E",bg:"rgba(34,197,94,.1)"},
  moderate:{c:"#B87A00",bg:"rgba(184,122,0,.1)"},
  avoid:{c:"#E8522A",bg:"rgba(232,82,42,.1)"},
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371,toR=Math.PI/180
  const dLat=(lat2-lat1)*toR,dLon=(lon2-lon1)*toR
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function MapView({beaches,island,onBeachClick,selectedBeach,sargData,userPos,favorites,allBeaches,onThreatChange,onPremiumClick,lang,track}){
  const containerRef=useRef(null)
  const mapRef=useRef(null)
  const markersRef=useRef([])
  const heatRef=useRef([])
  const gridLayerRef=useRef(null)
  const userMarkerRef=useRef(null)
  const driftRef=useRef(null)
  const[mapError,setMapError]=useState(null)
  const[afaiGrid,setAfaiGrid]=useState(null)
  const[banksData,setBanksData]=useState(null)
  const[timeStep,setTimeStep]=useState(0)
  const[autoPlaying,setAutoPlaying]=useState(false)
  const[caribbeanMode,setCaribbeanMode]=useState(false)
  const[caribbeanData,setCaribbeanData]=useState(null)
  const caribLayerRef=useRef(null)
  const caribLabelsRef=useRef(null)
  const prevViewRef=useRef(null) // store zoom/center before switching
  const autoPlayTimersRef=useRef([])
  const autoZoomDoneRef=useRef(false)
  const[threatDismissed,setThreatDismissed]=useState(()=>sessionStorage.getItem("sg_threat_dismissed")==="1")
  const banksLayerRef=useRef(null)

  // Init map once
  useEffect(()=>{
    if(!containerRef.current||mapRef.current)return
    try{
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    const map=L.map(containerRef.current,{
      zoomControl:false,
      attributionControl:false,
      maxBoundsViscosity:1,
      tap:false,
    })
    map.setView(center,11)
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
      maxZoom:18,
    }).addTo(map)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",{
      maxZoom:18,subdomains:"abcd",
    }).addTo(map)
    mapRef.current=map
    }catch(err){console.error("MAP INIT ERROR:",err.message,err.stack);setMapError(err.message)}
    return()=>{try{mapRef.current?.remove()}catch(e){};mapRef.current=null}
  },[])

  // Fly to island
  useEffect(()=>{
    if(!mapRef.current)return
    if(userPos){
      const onMq=userPos.lat<15.5,onGp=userPos.lat>=15.5
      if((island==="mq"&&onMq)||(island==="gp"&&onGp)){
        mapRef.current.flyTo([userPos.lat,userPos.lng],12,{duration:1})
        return
      }
    }
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    try{
      const size=mapRef.current.getSize()
      if(size.x===0||size.y===0){mapRef.current.setView(center,11)}
      else{mapRef.current.flyTo(center,11,{duration:1})}
    }catch(e){mapRef.current.setView(center,11)}
  },[island,userPos])

  // User location marker (blue pulsing dot)
  useEffect(()=>{
    if(!mapRef.current)return
    if(userMarkerRef.current){userMarkerRef.current.remove();userMarkerRef.current=null}
    if(!userPos)return
    const icon=L.divIcon({
      className:"",
      html:`<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 8px rgba(66,133,244,.5);animation:pulse 2s infinite"></div>`,
      iconSize:[16,16],iconAnchor:[8,8],
    })
    userMarkerRef.current=L.marker([userPos.lat,userPos.lng],{icon,interactive:false,zIndexOffset:1000})
      .addTo(mapRef.current)
    return()=>{if(userMarkerRef.current){userMarkerRef.current.remove();userMarkerRef.current=null}}
  },[userPos])

  // Fetch AFAI grid for offshore heatmap
  useEffect(()=>{
    fetch("/api/copernicus/sargassum-grid.json")
      .then(r=>r.json())
      .then(d=>{if(d?.points?.length)setAfaiGrid(d)})
      .catch(()=>{})
  },[])

  // Fetch sargassum banks
  useEffect(()=>{fetch("/api/copernicus/sargassum-banks.json").then(r=>r.json()).then(d=>{if(d?.banks?.length)setBanksData(d)}).catch(()=>{})},[])

  // Render AFAI heatmap from grid data (canvas circles, efficient)
  useEffect(()=>{
    if(!mapRef.current)return
    if(gridLayerRef.current){gridLayerRef.current.remove();gridLayerRef.current=null}
    if(!afaiGrid||!afaiGrid.points.length)return
    const isGP=island==="gp"
    const pts=afaiGrid.points.filter(p=>isGP?p[0]>=15.5:p[0]<15.5)
    if(!pts.length)return
    const renderer=L.canvas({padding:0.5})
    const group=L.layerGroup()
    for(const[lat,lng,afai]of pts){
      const r=Math.max(800,afai*5000)
      const opacity=Math.min(0.55,afai*0.8)
      const color=afai<.15?"rgba(34,197,94,.6)":afai<.40?"rgba(232,168,0,.7)":"rgba(232,82,42,.8)"
      const c=L.circle([lat,lng],{radius:r,fillColor:color,color:"transparent",weight:0,
        fillOpacity:opacity,renderer,interactive:false})
      c.addTo(group)
    }
    const onMapClick=(e)=>{
      const{lat:cLat,lng:cLng}=e.latlng
      const hit=pts.find(([pLat,pLng])=>Math.abs(pLat-cLat)<.03&&Math.abs(pLng-cLng)<.03)
      if(!hit)return
      track("sg_heatmap_click",{afai:hit[2],lat:hit[0],lng:hit[1]})
      const nearest=beaches.slice().sort((a,b)=>
        haversine(hit[0],hit[1],a.lat,a.lng)-haversine(hit[0],hit[1],b.lat,b.lng))[0]
      if(nearest)onBeachClick(nearest)
    }
    mapRef.current.on("click",onMapClick)
    group.addTo(mapRef.current)
    gridLayerRef.current=group
    return()=>{
      if(gridLayerRef.current){gridLayerRef.current.remove();gridLayerRef.current=null}
      mapRef.current?.off("click",onMapClick)
    }
  },[afaiGrid,island,beaches,onBeachClick])

  // Render offshore sargassum banks (hull polygons + drift arrows)
  useEffect(()=>{
    if(!mapRef.current)return
    if(banksLayerRef.current){banksLayerRef.current.remove();banksLayerRef.current=null}
    if(!banksData?.banks?.length)return
    const isGP=island==="gp"
    const banks=banksData.banks.filter(b=>b.island===(isGP?"gp":"mq"))
    if(!banks.length)return
    const group=L.layerGroup()
    for(const bank of banks){
      // Hull polygon (bank shape)
      if(bank.hull?.length>=3){
        const color=bank.mass>=0.07?"rgba(232,82,42,.5)":"rgba(232,168,0,.5)"
        const fill=bank.mass>=0.07?"rgba(232,82,42,.2)":"rgba(232,168,0,.15)"
        L.polygon(bank.hull,{color,fillColor:fill,weight:1.5,fillOpacity:1,interactive:false}).addTo(group)
      }
      // Drift arrow: centroid now → centroid 24h prediction
      const pred24=bank.drift?.predictions?.["24h"]
      if(pred24?.centroid&&bank.centroid){
        const from=bank.centroid,to=pred24.centroid
        L.polyline([from,to],{color:"rgba(232,82,42,.6)",weight:2,dashArray:"6,4",interactive:false}).addTo(group)
        // Arrowhead at destination
        const dx=to[1]-from[1],dy=to[0]-from[0]
        const angle=Math.atan2(dy,dx)
        const aLen=0.015
        const p1=[to[0]-Math.sin(angle+0.5)*aLen,to[1]-Math.cos(angle+0.5)*aLen]
        const p2=[to[0]-Math.sin(angle-0.5)*aLen,to[1]-Math.cos(angle-0.5)*aLen]
        L.polyline([p1,to,p2],{color:"rgba(232,82,42,.6)",weight:2,interactive:false}).addTo(group)
      }
    }
    group.addTo(mapRef.current)
    banksLayerRef.current=group
    return()=>{if(banksLayerRef.current){banksLayerRef.current.remove();banksLayerRef.current=null}}
  },[banksData,island])

  // Update markers + heatmap
  useEffect(()=>{
    if(!mapRef.current)return
    markersRef.current.forEach(m=>m.remove())
    markersRef.current=[]
    heatRef.current.forEach(m=>m.remove())
    heatRef.current=[]

    const driftMap={}
    if(sargData?.weekly){
      for(const[sargId,w]of Object.entries(sargData.weekly)){
        const beachId=SARG_TO_BEACH[sargId]
        if(beachId)driftMap[beachId]={drift:w.drift,dv:w.driftValue||0}
      }
    }

    let nearestCleanId=null
    if(userPos){
      let bestDist=Infinity
      beaches.forEach(b=>{
        if(b.status==="clean"){
          const d=haversine(userPos.lat,userPos.lng,b.lat,b.lng)
          if(d<bestDist){bestDist=d;nearestCleanId=b.id}
        }
      })
    }

    const heatGroup=L.layerGroup()
    const markerGroup=L.layerGroup()

    beaches.forEach((b,bi)=>{
      const st=ST[b.status]||ST._loading
      const isSelected=selectedBeach?.id===b.id

      if(b.afai>.15){
        const heatColor=b.afai<.3?"rgba(34,197,94,.2)":b.afai<.65?"rgba(184,122,0,.25)":"rgba(232,82,42,.3)"
        const strokeColor=b.afai<.3?"rgba(34,197,94,.1)":b.afai<.65?"rgba(184,122,0,.12)":"rgba(232,82,42,.15)"
        const isEastCoast=b.island==="mq"?b.lng>-61.0:b.lng>-61.5
        const lngDir=isEastCoast?.02:-.02

        const mainRadius=Math.max(600,b.afai*3500)
        const main=L.circle([b.lat,b.lng+lngDir],{
          radius:mainRadius,
          fillColor:heatColor,
          color:strokeColor,
          weight:1,
          fillOpacity:Math.min(.3,b.afai*.4),
          interactive:false,
        })
        main.addTo(heatGroup)
        heatRef.current.push(main)

        if(b.afai>.3){
        }
      }

      const isMobile="ontouchstart" in window
      const isNearest=b.id===nearestCleanId
      const marker=L.circleMarker([b.lat,b.lng],{
        radius:isSelected?16:(isNearest?16:(isMobile?14:8)),
        fillColor:st.c,
        color:isNearest?GOLD:"#fff",
        weight:isSelected?3:(isNearest?3:2),
        fillOpacity:.9,
        bubblingMouseEvents:false,
        className:isNearest?"sg-nearest":"",
      })
      if(isNearest&&!isSelected){
        const ring=L.circleMarker([b.lat,b.lng],{
          radius:22,fillColor:"transparent",color:GOLD,weight:2,
          fillOpacity:0,opacity:.4,bubblingMouseEvents:false,interactive:false,
          className:"sg-nearest-ring",
        })
        ring.addTo(markerGroup)
      }
      if(!("ontouchstart" in window))marker.bindTooltip(b.name+(isNearest?(lang==="en"?" · Nearest clean":" · La plus proche propre"):""),{direction:"top",offset:[0,-12],className:"",permanent:false})
      marker.on("click",()=>onBeachClick(b))
      marker.addTo(markerGroup)
      markersRef.current.push(marker)
    })

    heatGroup.addTo(mapRef.current)
    markerGroup.addTo(mapRef.current)

    if(driftRef.current)clearInterval(driftRef.current)
    let tick=0
    driftRef.current=setInterval(()=>{
      tick++
      heatRef.current.forEach((h,i)=>{
        if(h.setRadius&&h.options?.interactive===false){
          const baseR=h._mRadius||h.getRadius()
          if(!h._baseR)h._baseR=baseR
          const pulse=Math.sin(tick*.15+i*.3)*.08
          try{h.setRadius(h._baseR*(1+pulse))}catch(e){}
        }
      })
    },800)
    return()=>{if(driftRef.current)clearInterval(driftRef.current)}
  },[beaches,onBeachClick,selectedBeach,sargData,userPos,lang])

  // Fetch Caribbean AFAI data (lazy — only when first toggled)
  useEffect(()=>{
    if(!caribbeanMode||caribbeanData)return
    fetch("/api/copernicus/caribbean-afai.json")
      .then(r=>r.json())
      .then(d=>{if(d?.grid?.length)setCaribbeanData(d)})
      .catch(()=>{})
  },[caribbeanMode])

  // Toggle Caribbean mode: zoom out / zoom back
  const toggleCaribbean=useCallback(()=>{
    if(!mapRef.current)return
    const map=mapRef.current
    if(!caribbeanMode){
      // Save current view
      prevViewRef.current={center:map.getCenter(),zoom:map.getZoom()}
      map.flyToBounds(CARIB_BOUNDS,{duration:1.2,padding:[20,20]})
      setCaribbeanMode(true)
      track("sg_caribbean_view",{action:"open"})
    }else{
      // Restore previous view
      if(prevViewRef.current){
        map.flyTo(prevViewRef.current.center,prevViewRef.current.zoom,{duration:1})
      }else{
        const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
        map.flyTo(center,11,{duration:1})
      }
      setCaribbeanMode(false)
      track("sg_caribbean_view",{action:"close"})
    }
  },[caribbeanMode,island,track])

  // Render Caribbean heatmap layer (rectangles)
  useEffect(()=>{
    if(!mapRef.current)return
    // Remove previous layers
    if(caribLayerRef.current){caribLayerRef.current.remove();caribLayerRef.current=null}
    if(caribLabelsRef.current){caribLabelsRef.current.remove();caribLabelsRef.current=null}
    if(!caribbeanMode||!caribbeanData?.grid?.length)return
    const map=mapRef.current
    const group=L.layerGroup()
    const labelsGroup=L.layerGroup()
    const cellSize=0.25 // degrees
    const half=cellSize/2

    for(const pt of caribbeanData.grid){
      const{lat,lng,afai}=pt
      if(afai<0.06)continue

      // Color: green → orange → red
      let color,fillOpacity
      if(afai<0.15){
        // Green range
        const t=afai/0.15
        color=`rgba(34,197,94,${0.15+t*0.25})`
        fillOpacity=0.15+t*0.25
      }else if(afai<0.40){
        // Orange range
        const t=(afai-0.15)/0.25
        const r=Math.round(34+(232-34)*t)
        const g=Math.round(197+(168-197)*t)
        const b=Math.round(94+(0-94)*t)
        fillOpacity=0.3+t*0.2
        color=`rgba(${r},${g},${b},${fillOpacity})`
      }else{
        // Red range
        const t=Math.min(1,(afai-0.40)/0.40)
        fillOpacity=0.4+t*0.25
        color=`rgba(232,${Math.round(82-40*t)},${Math.round(42-20*t)},${fillOpacity})`
      }

      const bounds=[[lat-half,lng-half],[lat+half,lng+half]]
      L.rectangle(bounds,{
        color:"transparent",weight:0,
        fillColor:color,fillOpacity,
        interactive:false,
      }).addTo(group)
    }

    // Zone labels
    const tl=T_CARIB[lang]||T_CARIB.fr
    for(const zone of CARIBBEAN_ZONES){
      const icon=L.divIcon({
        className:"",
        html:`<div style="
          font-family:'Bricolage Grotesque',system-ui,sans-serif;
          font-size:11px;font-weight:600;color:#fff;
          text-shadow:0 1px 4px rgba(0,0,0,.7),0 0 8px rgba(0,0,0,.4);
          white-space:nowrap;pointer-events:none;
          letter-spacing:0.5px;text-transform:uppercase;
        ">${tl[zone.key]||zone.id}</div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      })
      L.marker([zone.lat,zone.lng],{icon,interactive:false,zIndexOffset:500}).addTo(labelsGroup)
    }

    group.addTo(map)
    labelsGroup.addTo(map)
    caribLayerRef.current=group
    caribLabelsRef.current=labelsGroup

    return()=>{
      if(caribLayerRef.current){caribLayerRef.current.remove();caribLayerRef.current=null}
      if(caribLabelsRef.current){caribLabelsRef.current.remove();caribLabelsRef.current=null}
    }
  },[caribbeanMode,caribbeanData,lang])

  // Hide local markers/heatmap in Caribbean mode, show them back in local mode
  useEffect(()=>{
    if(!mapRef.current)return
    if(caribbeanMode){
      markersRef.current.forEach(m=>{try{m.setStyle({opacity:0,fillOpacity:0})}catch(e){}})
      heatRef.current.forEach(h=>{try{h.setStyle({opacity:0,fillOpacity:0})}catch(e){}})
      if(gridLayerRef.current)try{mapRef.current.removeLayer(gridLayerRef.current)}catch(e){}
      if(banksLayerRef.current)try{mapRef.current.removeLayer(banksLayerRef.current)}catch(e){}
    }else{
      markersRef.current.forEach(m=>{try{m.setStyle({opacity:1,fillOpacity:.9})}catch(e){}})
      heatRef.current.forEach(h=>{try{h.setStyle({opacity:1,fillOpacity:h.options?.fillOpacity||.3})}catch(e){}})
      if(gridLayerRef.current)try{gridLayerRef.current.addTo(mapRef.current)}catch(e){}
      if(banksLayerRef.current)try{banksLayerRef.current.addTo(mapRef.current)}catch(e){}
    }
  },[caribbeanMode])

  const tl=T_CARIB[lang]||T_CARIB.fr

  if(mapError)return <div style={{padding:40,color:"red"}}>{mapError}</div>
  return(<div style={{position:"relative",width:"100%",height:"100%"}}>
    <div ref={containerRef} style={{width:"100%",height:"100%"}}/>

    {/* Caribbean View Toggle Button */}
    <button onClick={toggleCaribbean} style={{
      position:"absolute",top:12,right:12,zIndex:1000,
      display:"flex",alignItems:"center",gap:6,
      padding:"8px 14px",
      background:caribbeanMode?"rgba(0,158,142,.9)":"rgba(13,30,28,.75)",
      color:"#fff",border:"1px solid rgba(255,255,255,.15)",
      borderRadius:20,fontSize:12,fontWeight:600,
      fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
      cursor:"pointer",backdropFilter:"blur(8px)",
      boxShadow:"0 2px 12px rgba(0,0,0,.3)",
      transition:"all .2s ease",
      letterSpacing:"0.3px",
    }}>
      <span style={{fontSize:15}}>{caribbeanMode?"🏝":"🌎"}</span>
      {caribbeanMode?tl.localView:tl.caribbeanView}
    </button>

    {/* Caribbean Legend */}
    {caribbeanMode&&<div style={{
      position:"absolute",bottom:20,left:12,zIndex:1000,
      background:"rgba(13,30,28,.85)",backdropFilter:"blur(8px)",
      borderRadius:10,padding:"10px 14px",
      border:"1px solid rgba(255,255,255,.1)",
      boxShadow:"0 2px 12px rgba(0,0,0,.3)",
      fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
      color:"#fff",fontSize:11,
    }}>
      <div style={{fontWeight:700,fontSize:12,marginBottom:6,letterSpacing:"0.3px"}}>
        {tl.legendTitle}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
        <div style={{width:20,height:10,borderRadius:2,background:"rgba(34,197,94,.5)"}}/>
        <span style={{opacity:.8}}>{"< 0.15"} — {tl.legendLow}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
        <div style={{width:20,height:10,borderRadius:2,background:"rgba(232,168,0,.6)"}}/>
        <span style={{opacity:.8}}>{"0.15 – 0.40"} — {tl.legendMod}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
        <div style={{width:20,height:10,borderRadius:2,background:"rgba(232,82,42,.65)"}}/>
        <span style={{opacity:.8}}>{"> 0.40"} — {tl.legendHigh}</span>
      </div>
      <div style={{marginTop:6,opacity:.5,fontSize:9,lineHeight:"1.3"}}>
        {tl.source}
        {caribbeanData?.dataDate&&<><br/>{new Date(caribbeanData.dataDate).toLocaleDateString(lang==="fr"?"fr-FR":"en-US")}</>}
      </div>
    </div>}
  </div>)
}
