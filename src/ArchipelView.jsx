import React,{useState,useRef,useEffect,useMemo,useCallback}from"react"
import {haversine}from"./lib/score.js"
import {BEACH_PHASE,miVeil,verdictMeta,moodFromStatus,_t,abVariant,track,C,formatFreshness}from"./Sargasses_PROD.jsx"
import BeachScene from"./BeachScene.jsx"
import Veilleur from"./Veilleur.jsx"
import ScoreBlob from"./ScoreBlob.jsx"
import WorldAfaiGauge from"./WorldAfaiGauge.jsx"

const COAST_ZONES={}
const MID=0.82,FAR=0.32,NEAR=2.6
const SPAN_PX=1000

function ArchipelView({beaches,island,userPos,lang,onOpenBeach,onClose,onSolutions,onPremium,rootMode,updatedAt,initialZone,onRequestGeo,dataReady=true}){
  const wrapRef=useRef(null),gRef=useRef(null),camRef=useRef({cx:0,cy:0,cz:0.8}),rafRef=useRef(0)
  const pendingCenterRef=useRef(false)
  const ptrs=useRef(new Map()),movedRef=useRef(false),pinchRef=useRef(null),lastTap=useRef(0)
  const velRef=useRef({x:0,y:0}),inertRaf=useRef(0),pannedRef=useRef(false)
  const satGRef=useRef(null),satHitRef=useRef(null),satDragRef=useRef(false),satOffRef=useRef({x:0,y:0}),satVRef=useRef({x:0,y:0}),satSprRaf=useRef(0)
  const[satGrab,setSatGrab]=useState(false)
  const[satSay,setSatSay]=useState(null)
  const sayIdxRef=useRef(0),sayTimerRef=useRef(0)
  const skyRef=useRef(null),camBaseRef=useRef(null)
  const SAT_SAY={fr:["Hé ! Je bosse, là 🛰️","Repose-moi, je scanne !","Doucement… je veille.","Oh ! Tu m'as eu 😄","Eh, je travaille, moi !"],en:["Hey! I'm working 🛰️","Put me back, I'm scanning!","Easy… I'm on watch.","Oh! You got me 😄","Hey, I'm on duty!"],es:["¡Eh! Estoy trabajando 🛰️","¡Suéltame, escaneo!","Tranqui… estoy vigilando.","¡Oh! Me pillaste 😄","¡Eh, que trabajo!"]}
  const veilleurSpeak=()=>{const arr=SAT_SAY[lang]||SAT_SAY.fr;setSatSay(arr[sayIdxRef.current%arr.length]);sayIdxRef.current++;if(sayTimerRef.current)clearTimeout(sayTimerRef.current)}
  const[ready,setReady]=useState(false)
  const{proj,count}=useMemo(()=>{
    const list=(beaches||[]).filter(b=>b&&b.lat!=null&&b.lng!=null&&(!island||b.island===island))
    if(!list.length)return{proj:[],count:0}
    let mLa=9e9,xLa=-9e9,mLn=9e9,xLn=-9e9
    for(const b of list){mLa=Math.min(mLa,b.lat);xLa=Math.max(xLa,b.lat);mLn=Math.min(mLn,b.lng);xLn=Math.max(xLn,b.lng)}
    const cLat=(mLa+xLa)/2,cLng=(mLn+xLn)/2,span=(Math.max(xLa-mLa,xLn-mLn)*1.3)||0.5
    const proj=list.map(b=>({b,x:((b.lng-cLng)/span+0.5)*SPAN_PX,y:((cLat-b.lat)/span+0.5)*SPAN_PX}))
    return{proj,count:list.length}
  },[beaches,island])
  const myIdx=useMemo(()=>{
    if(!proj.length)return 0
    if(userPos){let bi=0,bd=9e9;proj.forEach((p,i)=>{const d=haversine(userPos.lat,userPos.lng,p.b.lat,p.b.lng);if(d<bd){bd=d;bi=i}});return bi}
    let bi=0,bd=9e9;proj.forEach((p,i)=>{const d=(p.x-SPAN_PX/2)**2+(p.y-SPAN_PX/2)**2;if(d<bd){bd=d;bi=i}});return bi
  },[proj,userPos])
  const writeCam=()=>{const g=gRef.current;if(!g)return;const c=camRef.current;g.setAttribute("transform","translate("+c.cx.toFixed(1)+" "+c.cy.toFixed(1)+") scale("+c.cz.toFixed(4)+")")
    const sk=skyRef.current;if(sk){if(!camBaseRef.current)camBaseRef.current={cx:c.cx,cy:c.cy};const b=camBaseRef.current;const px=Math.max(-58,Math.min(58,(c.cx-b.cx)*0.1)),py=Math.max(-58,Math.min(58,(c.cy-b.cy)*0.1));sk.style.transform="translate("+px.toFixed(1)+"px,"+py.toFixed(1)+"px)"}}
  const satScale=()=>{const el=wrapRef.current;return el?Math.max(el.clientWidth/800,el.clientHeight/600):1}
  const satWrite=()=>{const g=satGRef.current;if(g)g.setAttribute("transform","translate("+satOffRef.current.x.toFixed(1)+" "+satOffRef.current.y.toFixed(1)+")")}
  const satSpringHome=()=>{if(satSprRaf.current)return;const step=()=>{const o=satOffRef.current,v=satVRef.current;v.x+=(-o.x*0.22-v.x*0.5);v.y+=(-o.y*0.22-v.y*0.5);o.x+=v.x;o.y+=v.y;satWrite();if(Math.abs(o.x)<0.4&&Math.abs(o.y)<0.4&&Math.abs(v.x)<0.4&&Math.abs(v.y)<0.4){o.x=0;o.y=0;v.x=0;v.y=0;satWrite();satSprRaf.current=0;return}satSprRaf.current=requestAnimationFrame(step)};satSprRaf.current=requestAnimationFrame(step)}
  const schedule=()=>{if(rafRef.current)return;rafRef.current=requestAnimationFrame(()=>{rafRef.current=0;writeCam()})}
  const clampZ=z=>Math.max(FAR*0.75,Math.min(NEAR*1.25,z))
  const centerOn=(i,cz)=>{const el=wrapRef.current;if(!el||!proj[i])return;const z=clampZ(cz||camRef.current.cz),W=el.clientWidth,H=el.clientHeight;camRef.current={cz:z,cx:W/2-proj[i].x*z,cy:H/2-proj[i].y*z};schedule()}
  useEffect(()=>{if(userPos&&pendingCenterRef.current){pendingCenterRef.current=false;try{centerOn(myIdx,MID)}catch(_){}}},[userPos,myIdx])
  const zoomAt=(f,px,py)=>{const c=camRef.current,nz=clampZ(c.cz*f),wx=(px-c.cx)/c.cz,wy=(py-c.cy)/c.cz;c.cz=nz;c.cx=px-wx*nz;c.cy=py-wy*nz;schedule()}
  const panBounds=()=>{const el=wrapRef.current;if(!el)return null;const W=el.clientWidth,H=el.clientHeight,z=camRef.current.cz,M=Math.min(W,H)*0.38;
    let minX=M-SPAN_PX*z,maxX=W-M,minY=M-SPAN_PX*z,maxY=H-M
    if(minX>maxX){minX=maxX=(minX+maxX)/2}if(minY>maxY){minY=maxY=(minY+maxY)/2}
    return{minX,maxX,minY,maxY}}
  const panClampDrag=c=>{const b=panBounds();if(!b)return;const el=wrapRef.current,ov=(el?Math.min(el.clientWidth,el.clientHeight):360)*0.22;c.cx=Math.max(b.minX-ov,Math.min(b.maxX+ov,c.cx));c.cy=Math.max(b.minY-ov,Math.min(b.maxY+ov,c.cy))}
  const stopInertia=()=>{if(inertRaf.current){cancelAnimationFrame(inertRaf.current);inertRaf.current=0}}
  const startInertia=()=>{stopInertia();let reduce=false;try{reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){}if(reduce){velRef.current.x=0;velRef.current.y=0}
    const step=()=>{const c=camRef.current,v=velRef.current,b=panBounds();c.cx+=v.x;c.cy+=v.y;v.x*=0.92;v.y*=0.92
      if(b){if(c.cx<b.minX){c.cx+=(b.minX-c.cx)*0.2;v.x*=0.55}else if(c.cx>b.maxX){c.cx+=(b.maxX-c.cx)*0.2;v.x*=0.55}
        if(c.cy<b.minY){c.cy+=(b.minY-c.cy)*0.2;v.y*=0.55}else if(c.cy>b.maxY){c.cy+=(b.maxY-c.cy)*0.2;v.y*=0.55}}
      writeCam();const slow=Math.hypot(v.x,v.y)<0.12,inB=!b||(c.cx>=b.minX-0.5&&c.cx<=b.maxX+0.5&&c.cy>=b.minY-0.5&&c.cy<=b.maxY+0.5)
      if(slow&&inB){inertRaf.current=0;return}inertRaf.current=requestAnimationFrame(step)}
    inertRaf.current=requestAnimationFrame(step)}
  useEffect(()=>{
    let centered = false
    if(initialZone){
      const zoneObj = (COAST_ZONES[island] || []).find(z => z.slug === initialZone)
      if(zoneObj){
        const zoneBeaches = proj.filter(p => zoneObj.communes.includes(p.b.commune))
        if(zoneBeaches.length){
          let avgX = 0, avgY = 0
          for(const p of zoneBeaches){
            avgX += p.x
            avgY += p.y
          }
          avgX /= zoneBeaches.length
          avgY /= zoneBeaches.length
          const el = wrapRef.current
          if(el){
            const z = MID
            const W = el.clientWidth
            const H = el.clientHeight
            camRef.current = {
              cz: z,
              cx: W / 2 - avgX * z,
              cy: H / 2 - avgY * z
            }
            schedule()
            centered = true
            try { track("sg_zone_click", { zone: initialZone }) } catch(_) {}
          }
        }
      }
    }
    if(!centered){
      centerOn(myIdx,MID)
    }
    setReady(true)
    try{track("sg_archipel_open",{beaches:count})}catch(_){}
  },[initialZone])
  // ... rest of component continues
}

export default ArchipelView