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
const BEACH_TO_SARG=Object.fromEntries(Object.entries(SARG_TO_BEACH).map(([k,v])=>[v,k]))

const GOLD="#E8A800"

/* Radar time-slider frames. Generated dynamically so the chip label is the real weekday name,
   not "+1" — "AUJ · LUN · MAR · MER · JEU" reads as a weather-app timeline, not a dev knob. */
const DAY_SHORT_FR=["dim","lun","mar","mer","jeu","ven","sam"]
const DAY_SHORT_EN=["sun","mon","tue","wed","thu","fri","sat"]
const DAY_SHORT_ES=["dom","lun","mar","mié","jue","vie","sáb"]
function buildRadarFrames(lang){
  const labels={fr:DAY_SHORT_FR,en:DAY_SHORT_EN,es:DAY_SHORT_ES}[lang]||DAY_SHORT_FR
  const now=new Date()
  const frames=[]
  for(let i=0;i<5;i++){
    const d=new Date(now);d.setDate(now.getDate()+i)
    const dayName=labels[d.getDay()]
    const key=i===0?(lang==="en"?"TODAY":lang==="es"?"HOY":"AUJ"):dayName.toUpperCase()
    frames.push({i,label:key,date:d})
  }
  return frames
}

/* For each beach b and a time step, return {status, afai} from forecast if available.
   Falls back to current b.status. This is the heart of the radar: same beach, future state. */
function getBeachAtStep(b,step,sargData){
  if(step===0)return{status:b.status,afai:b.afai}
  const sargId=BEACH_TO_SARG[b.id]
  const direct=sargId&&sargData?.weekly?.[sargId]
  const interp=sargData?._enrichedWeekly?.[`_interp_${b.id}`]
  const weekly=direct||interp
  const fc=weekly?.forecast?.[step]
  if(fc&&fc.status)return{status:fc.status,afai:fc.afai??b.afai}
  return{status:b.status,afai:b.afai}
}

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
export default function MapView({beaches,island,onBeachClick,selectedBeach,sargData,userPos,favorites,allBeaches,onThreatChange,onPremiumClick,lang,track,searchActive}){
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
  const[zoomTick,setZoomTick]=useState(0)
  const caribLayerRef=useRef(null)
  const caribLabelsRef=useRef(null)
  const prevViewRef=useRef(null) // store zoom/center before switching
  const autoPlayTimersRef=useRef([])
  const autoZoomDoneRef=useRef(false)
  const[threatDismissed,setThreatDismissed]=useState(()=>sessionStorage.getItem("sg_threat_dismissed")==="1")
  const banksLayerRef=useRef(null)
  /** Keeps beach pins above async layers (AFAI grid canvas, etc.) so pins stay clickable */
  const markerLayerGroupRef=useRef(null)

  // Init map once
  useEffect(()=>{
    if(!containerRef.current||mapRef.current)return
    try{
    const center=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    const map=L.map(containerRef.current,{
      zoomControl:false,
      attributionControl:false,
      maxBoundsViscosity:1,
      // tap:true (defaut Leaflet) — tap:false cassait des ouvertures de fiche plage sur mobile
      // (synthetic click / touch chain vers divIcon markers).
      zoomSnap:.25, // allow fitBounds to land on 10.5, 10.75, etc. so MQ fills the viewport without wasting ocean
    })
    map.setView(center,11)
    // Voyager base (free, no key) — turquoise sea + verdant land, "vacation feel"
    // vs the old satellite which read as "Google Maps dark" and killed the tropical mood.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{
      maxZoom:19,subdomains:"abcd",
      attribution:"© OpenStreetMap © CARTO",
    }).addTo(map)
    // Bump zoomTick on zoomend only (not moveend: pixel-spacing is zoom-invariant under pan).
    // This triggers the marker useEffect to re-run the declutter for the new zoom.
    map.on("zoomend",()=>setZoomTick(t=>t+1))
    mapRef.current=map
    }catch(err){console.error("MAP INIT ERROR:",err.message,err.stack);setMapError(err.message)}
    return()=>{try{mapRef.current?.remove()}catch(e){};mapRef.current=null}
  },[])

  // Fly to island — fitBounds on the visible beaches so EVERY pin is on screen & clickable.
  // The old fixed zoom-11 center cut off MQ east coast (La Trinité, Caravelle, Le François)
  // on 390px viewports, which is why users couldn't click ~21 of 53 pins.
  useEffect(()=>{
    if(!mapRef.current)return
    const islandBeaches=(beaches||[]).filter(b=>b.island===island)
    const fallbackCenter=ISLAND_CENTER[island]||ISLAND_CENTER.mq
    // Toujours inclure TOUTES les plages dans les bounds. Ne jamais flyTo(user) seul au z12 :
    // ça recoupait l'est MQ / pins hors écran → clics "qui ne font rien" visuellement.
    const latlngs=islandBeaches.map(b=>[b.lat,b.lng])
    if(userPos){
      const onMq=userPos.lat<15.5,onGp=userPos.lat>=15.5
      if((island==="mq"&&onMq)||(island==="gp"&&onGp)){
        latlngs.push([userPos.lat,userPos.lng])
      }
    }
    try{
      const size=mapRef.current.getSize()
      if(size.x===0||size.y===0){mapRef.current.setView(fallbackCenter,11);return}
      if(latlngs.length>=3){
        mapRef.current.fitBounds(latlngs,{
          paddingTopLeft:[20,110],
          paddingBottomRight:[20,190],
          maxZoom:12,
          animate:true,duration:.8,
        })
      }else if(latlngs.length>=1){
        mapRef.current.fitBounds(latlngs,{padding:[40,40],maxZoom:12,animate:true,duration:.6})
      }else{
        mapRef.current.flyTo(fallbackCenter,11,{duration:1})
      }
    }catch(e){mapRef.current.setView(fallbackCenter,11)}
  },[island,userPos,beaches])

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
    try{group.bringToBack()}catch(e){}
    try{markerLayerGroupRef.current?.bringToFront?.()}catch(e){}
    return()=>{
      if(gridLayerRef.current){gridLayerRef.current.remove();gridLayerRef.current=null}
      mapRef.current?.off("click",onMapClick)
    }
  },[afaiGrid,island,beaches,onBeachClick])

  // Render offshore sargassum banks (hull polygons + drift arrows)
  // Visual weight tuned to read as "data layer" not "alarm overlay": low fill (.06),
  // dashed thin stroke, muted drift arrow. Hidden at low zoom where shapes dominate the map.
  useEffect(()=>{
    if(!mapRef.current)return
    if(banksLayerRef.current){banksLayerRef.current.remove();banksLayerRef.current=null}
    if(!banksData?.banks?.length)return
    const isGP=island==="gp"
    const banks=banksData.banks.filter(b=>b.island===(isGP?"gp":"mq"))
    if(!banks.length)return
    const zoom=mapRef.current.getZoom?.()||9
    if(zoom<9)return // national view: banks too dominant visually
    const group=L.layerGroup()
    for(const bank of banks){
      // Hull polygon (bank shape) — dashed thin border, very low fill
      if(bank.hull?.length>=3){
        const color=bank.mass>=0.07?"rgba(232,82,42,.28)":"rgba(232,168,0,.28)"
        const fill=bank.mass>=0.07?"rgba(232,82,42,.06)":"rgba(232,168,0,.05)"
        L.polygon(bank.hull,{color,fillColor:fill,weight:0.8,fillOpacity:1,dashArray:"4,3",interactive:false}).addTo(group)
      }
      // Drift arrow: centroid now → centroid 24h prediction
      const pred24=bank.drift?.predictions?.["24h"]
      if(pred24?.centroid&&bank.centroid){
        const from=bank.centroid,to=pred24.centroid
        L.polyline([from,to],{color:"rgba(232,82,42,.35)",weight:1.2,dashArray:"5,4",interactive:false}).addTo(group)
        // Arrowhead at destination
        const dx=to[1]-from[1],dy=to[0]-from[0]
        const angle=Math.atan2(dy,dx)
        const aLen=0.012
        const p1=[to[0]-Math.sin(angle+0.5)*aLen,to[1]-Math.cos(angle+0.5)*aLen]
        const p2=[to[0]-Math.sin(angle-0.5)*aLen,to[1]-Math.cos(angle-0.5)*aLen]
        L.polyline([p1,to,p2],{color:"rgba(232,82,42,.45)",weight:1.2,interactive:false}).addTo(group)
      }
    }
    group.addTo(mapRef.current)
    banksLayerRef.current=group
    try{group.bringToBack()}catch(e){}
    try{markerLayerGroupRef.current?.bringToFront?.()}catch(e){}
    return()=>{if(banksLayerRef.current){banksLayerRef.current.remove();banksLayerRef.current=null}}
  },[banksData,island,zoomTick])

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

    // Pixel-space declutter: sort by importance (selected > nearest > score),
    // place the highest first, demote any beach within MIN_PX of an already-placed
    // full pin to a tiny 8px dot. This is what Google Maps does — hierarchy by rendering
    // tier, not data filter. Runs on zoom via zoomTick dep. Panning is no-op (zoom-invariant).
    const withScoreSorted=beaches
      .filter(b=>typeof b.score==="number")
      .slice()
      .sort((a,b)=>b.score-a.score)
    const topIds=new Set(withScoreSorted.slice(0,3).map(b=>b.id))

    const tier={}
    try{
      const pts=beaches.map(b=>({b,px:mapRef.current.latLngToContainerPoint([b.lat,b.lng])}))
      pts.sort((A,B)=>{
        const rank=o=>(o.b.id===selectedBeach?.id?1e6:0)+(o.b.id===nearestCleanId?1e5:0)+(topIds.has(o.b.id)?1e4:0)+(o.b.score||0)
        return rank(B)-rank(A)
      })
      const MIN_PX=36
      const placed=[]
      for(const{b,px}of pts){
        let close=false
        for(const p of placed){
          const dx=p.x-px.x,dy=p.y-px.y
          if(dx*dx+dy*dy<MIN_PX*MIN_PX){close=true;break}
        }
        if(close){tier[b.id]="dot"}
        else{tier[b.id]="full";placed.push(px)}
      }
    }catch(e){/* map not ready: render all full */}

    const heatGroup=L.layerGroup()
    const markerGroup=L.layerGroup()

    // Dense-cluster click arbiter: when any marker is clicked, find the marker
    // whose center is closest to the actual click point and open THAT beach.
    // Fixes overlapping hit wrappers vs z-order.
    // If the global "closest" is implausibly far (stale coords / layer quirks),
    // keep the marker that actually received the event (fallback).
    const MAX_PICK_PX=40
    const pickClosest=(clickPt,fallbackBeach)=>{
      if(!clickPt||!mapRef.current)return fallbackBeach
      let bestBeach=fallbackBeach,bestD=Infinity
      for(const m of markersRef.current){
        if(!m._sgBeach)continue
        const mp=mapRef.current.latLngToContainerPoint(m.getLatLng())
        const dx=mp.x-clickPt.x,dy=mp.y-clickPt.y
        const d=dx*dx+dy*dy
        if(d<bestD){bestD=d;bestBeach=m._sgBeach}
      }
      if(bestD>MAX_PICK_PX*MAX_PICK_PX&&fallbackBeach)return fallbackBeach
      return bestBeach
    }

    beaches.forEach((b,bi)=>{
      // Radar: at step>0 we use the forecast status, not the live one.
      const at=getBeachAtStep(b,timeStep,sargData)
      const effectiveStatus=at.status||b.status
      const effectiveAfai=typeof at.afai==="number"?at.afai:b.afai
      const st=ST[effectiveStatus]||ST._loading
      const isSelected=selectedBeach?.id===b.id

      if(effectiveAfai>.2){
        // Soft heat halo only. Capped low so it never obscures tile labels or beach pins.
        const heatColor=effectiveAfai<.3?"rgba(34,197,94,.14)":effectiveAfai<.65?"rgba(184,122,0,.18)":"rgba(232,82,42,.22)"
        const isEastCoast=b.island==="mq"?b.lng>-61.0:b.lng>-61.5
        const lngDir=isEastCoast?.02:-.02

        const mainRadius=Math.max(600,effectiveAfai*2400)
        const main=L.circle([b.lat,b.lng+lngDir],{
          radius:mainRadius,
          fillColor:heatColor,
          color:"transparent",
          weight:0,
          fillOpacity:Math.min(.12,effectiveAfai*.18),
          interactive:false,
        })
        main.addTo(heatGroup)
        heatRef.current.push(main)
      }

      const isNearest=b.id===nearestCleanId
      const hasScore=typeof b.score==="number"
      const isTop=topIds.has(b.id)
      const isEmph=isSelected||isNearest||isTop

      // DOT TIER — overlap-demoted; hit zone ≥32px so dense clusters stay tappable.
      if(tier[b.id]==="dot"&&!isSelected&&!isNearest){
        const dotColor=st.c
        const dotHit=34
        const html=`<div style="width:${dotHit}px;height:${dotHit}px;display:flex;align-items:center;justify-content:center;cursor:pointer"><div style="width:9px;height:9px;border-radius:50%;background:${dotColor};border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div></div>`
        const dotIcon=L.divIcon({className:"",html,iconSize:[dotHit,dotHit],iconAnchor:[dotHit/2,dotHit/2]})
        const dotMarker=L.marker([b.lat,b.lng],{icon:dotIcon,riseOnHover:true,zIndexOffset:0})
        dotMarker._sgBeach=b
        if(!("ontouchstart" in window))dotMarker.bindTooltip(b.name+(hasScore?` · ${b.score}/100`:""),{direction:"top",offset:[0,-12],className:"",permanent:false})
        dotMarker.on("click",(e)=>onBeachClick(pickClosest(e.containerPoint,b)))
        dotMarker.addTo(markerGroup)
        markersRef.current.push(dotMarker)
        return
      }

      const bg=st.c
      // All pins clickable (hit area ≥34px via outer wrapper). Visual size reflects importance.
      const inner=isSelected?34:(isNearest?32:(isTop?30:24))
      const ring=isNearest
        ?`box-shadow:0 0 0 2px ${GOLD},0 4px 14px rgba(0,0,0,.4);`
        :(isTop?`box-shadow:0 3px 10px rgba(0,0,0,.4);`:`box-shadow:0 2px 6px rgba(0,0,0,.3);`)
      const scale=isSelected?"scale(1.08)":"scale(1)"
      const label=hasScore?String(b.score):"·"
      const fontSize=isSelected?15:(isEmph?13:11)
      const border=isEmph?"2.5px solid #fff":"2px solid #fff"
      const opacity=isEmph?1:.9
      const hit=Math.max(inner,38) // ≥38px tappable hit zone
      const cls=`sg-pin${isNearest?" sg-pin-nearest":""}${isSelected?" sg-pin-selected":""}`
      const html=`<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center;cursor:pointer"><div class="${cls}" style="width:${inner}px;height:${inner}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:${fontSize}px;font-weight:800;letter-spacing:-.3px;border:${border};${ring}transform:${scale};transition:transform .15s ease;opacity:${opacity}">${label}</div></div>`
      const size=hit
      const icon=L.divIcon({className:"",html,iconSize:[size,size],iconAnchor:[size/2,size/2]})
      const marker=L.marker([b.lat,b.lng],{icon,riseOnHover:true,zIndexOffset:isSelected?1000:(isEmph?500:200)})
      marker._sgBeach=b
      if(!("ontouchstart" in window))marker.bindTooltip(b.name+(hasScore?` · ${b.score}/100`:"")+(isNearest?(lang==="en"?" · Nearest clean":" · La plus proche propre"):""),{direction:"top",offset:[0,-size/2-4],className:"",permanent:false})
      marker.on("click",(e)=>onBeachClick(pickClosest(e.containerPoint,b)))
      marker.addTo(markerGroup)
      markersRef.current.push(marker)
    })

    heatGroup.addTo(mapRef.current)
    markerGroup.addTo(mapRef.current)
    markerLayerGroupRef.current=markerGroup
    try{markerGroup.bringToFront()}catch(e){}

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
  },[beaches,onBeachClick,selectedBeach,sargData,userPos,lang,timeStep,zoomTick])

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

  const radarFrames=buildRadarFrames(lang)

  // Radar insight — the NAMED aha moment.
  // Current (step 0): counts only.
  // Future (step > 0): finds the beach that has the biggest swing and names it explicitly.
  // "À Tartane, mer orange dans 2 jours" reads emotional; "3 empirent" reads bureaucratic.
  const radarInsight=(()=>{
    if(!beaches?.length)return null
    const rank={clean:0,moderate:1,avoid:2}
    let clean=0,mod=0,avoid=0
    let topWorse=null,topBetter=null
    for(const b of beaches){
      const cur=getBeachAtStep(b,0,sargData).status
      const fut=getBeachAtStep(b,timeStep,sargData).status
      if(fut==="clean")clean++
      else if(fut==="moderate")mod++
      else if(fut==="avoid")avoid++
      if(timeStep>0){
        const delta=(rank[fut]||0)-(rank[cur]||0)
        if(delta>0&&(!topWorse||delta>topWorse.delta))topWorse={name:b.name,from:cur,to:fut,delta}
        else if(delta<0&&(!topBetter||delta<topBetter.delta))topBetter={name:b.name,from:cur,to:fut,delta}
      }
    }
    return{clean,mod,avoid,topWorse,topBetter}
  })()

  // Autoplay: advance 1 frame every 1.6s, loop at end.
  useEffect(()=>{
    if(!autoPlaying)return
    const id=setInterval(()=>{
      setTimeStep(s=>(s+1)%radarFrames.length)
    },1600)
    return()=>clearInterval(id)
  },[autoPlaying,radarFrames.length])

  if(mapError)return <div style={{padding:40,color:"red"}}>{mapError}</div>
  return(<div style={{position:"relative",width:"100%",height:"100%"}}>
    <div ref={containerRef} style={{width:"100%",height:"100%"}}/>

    {/* Caribbean View Toggle Button */}
    <button onClick={toggleCaribbean} className="sg-carib-btn" title={caribbeanMode?tl.localView:tl.caribbeanView} aria-label={caribbeanMode?tl.localView:tl.caribbeanView} style={{
      position:"absolute",top:"calc(12px + env(safe-area-inset-top, 0px))",right:"calc(12px + env(safe-area-inset-right, 0px))",zIndex:1000,
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
      <span className="sg-carib-label">{caribbeanMode?tl.localView:tl.caribbeanView}</span>
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

    {/* RADAR TIME-SLIDER v2 — light glass bar, day-name chips, NAMED aha-insight.
        Architecture: conteneur externe pointerEvents:none (clicks passent aux pins dessous);
        chaque pill (day chip + play) a pointerEvents:auto. Le conteneur ne bloque jamais les markers.
        Hidden while search results dropdown is open so it never covers match rows. */}
    {!caribbeanMode&&!searchActive&&<div style={{
      position:"absolute",
      left:12,right:12,
      bottom:"calc(140px + env(safe-area-inset-bottom,0px))",
      zIndex:900,
      display:"flex",flexDirection:"column",alignItems:"center",gap:6,
      pointerEvents:"none",
      fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
    }}>
      {/* NAMED insight bubble — this is the aha. Appears only when a named swing exists. */}
      {radarInsight&&timeStep>0&&(radarInsight.topWorse||radarInsight.topBetter)&&(()=>{
        const w=radarInsight.topWorse,g=radarInsight.topBetter
        const primary=w||g
        const toLabel=s=>s==="clean"?(lang==="en"?"clean":lang==="es"?"limpia":"propre"):s==="moderate"?(lang==="en"?"moderate":lang==="es"?"moderada":"modérée"):(lang==="en"?"avoid":lang==="es"?"evitar":"à éviter")
        const arrow=w?"↑":"↓"
        const color=w?"#E8522A":"#22C55E"
        const verb=lang==="en"?(w?"turning":"clearing to"):lang==="es"?(w?"pasa a":"mejora a"):(w?"passe en":"repasse en")
        return<div style={{
          background:"rgba(13,30,28,.9)",backdropFilter:"blur(12px)",
          color:"#fff",padding:"5px 12px",borderRadius:100,
          border:`1px solid ${color}55`,
          boxShadow:`0 4px 14px ${color}33`,
          fontSize:11,fontWeight:700,letterSpacing:"-.005em",
          display:"flex",alignItems:"center",gap:6,
          maxWidth:"calc(100vw - 40px)",
          animation:"sgRadarInsightIn .35s cubic-bezier(.22,1,.36,1)",
        }}>
          <span style={{fontSize:12,color,lineHeight:1}}>{arrow}</span>
          <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>
            <span style={{color}}>{primary.name}</span>
            <span style={{opacity:.75}}>{" "}{verb}{" "}</span>
            <span style={{color}}>{toLabel(primary.to)}</span>
          </span>
        </div>
      })()}

      {/* Day-chip strip — pill row, light glass, day names not +1/+2 */}
      <div style={{
        display:"flex",alignItems:"center",gap:6,
        padding:"6px 6px 6px 8px",
        background:"rgba(255,255,255,.92)",
        backdropFilter:"blur(14px)",
        borderRadius:999,
        border:"1px solid rgba(0,0,0,.06)",
        boxShadow:"0 10px 28px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08)",
        pointerEvents:"none",
      }}>
        <button
          onClick={()=>setAutoPlaying(a=>!a)}
          aria-label={autoPlaying?"Pause":"Play"}
          style={{
            width:32,height:32,borderRadius:"50%",
            border:"none",cursor:"pointer",padding:0,
            background:autoPlaying?"linear-gradient(135deg,#00C2B0,#009E8E)":"rgba(0,0,0,.06)",
            color:autoPlaying?"#fff":"#0A1714",
            fontSize:11,fontWeight:800,
            display:"flex",alignItems:"center",justifyContent:"center",
            transition:"all .2s ease",
            flexShrink:0,
            pointerEvents:"auto",
            boxShadow:autoPlaying?"0 3px 10px rgba(0,194,176,.5)":"none",
          }}>
          {autoPlaying?"❚❚":"▶"}
        </button>
        {radarFrames.map((f,i)=>{
          const active=i===timeStep
          return<button key={i}
            onClick={()=>{setAutoPlaying(false);setTimeStep(i);track&&track("sg_radar_step",{step:i})}}
            aria-label={f.label}
            style={{
              minWidth:44,height:32,padding:"0 12px",
              border:"none",cursor:"pointer",
              borderRadius:999,
              background:active?"linear-gradient(135deg,#00C2B0,#009E8E)":"transparent",
              color:active?"#fff":"#0A1714",
              fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
              fontSize:11,fontWeight:800,letterSpacing:".06em",
              textTransform:"uppercase",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .22s cubic-bezier(.22,1,.36,1)",
              transform:active?"scale(1.02)":"scale(1)",
              boxShadow:active?"0 3px 10px rgba(0,194,176,.45)":"none",
              pointerEvents:"auto",
              flexShrink:0,
            }}>
            {f.label}
          </button>
        })}
      </div>
    </div>}
  </div>)
}
