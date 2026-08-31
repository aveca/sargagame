import React, {useState, useMemo, useEffect} from 'react';
const track=(...a)=>{try{window.track&&window.track(...a)}catch{}};

const TYPES=[
  {id:'all', label:'📍 POIs', icon:'📍'},
  {id:'surf_school', label:'🏄 Surf', icon:'🏄'},
  {id:'restaurant', label:'🍽️ Restaurants', icon:'🍽️'},
  {id:'hotel', label:'🏨 Hôtels', icon:'🏨'},
  {id:'parking', label:'🅿️ Parking', icon:'🅿️'},
  {id:'viewpoint', label:'📸 Spots', icon:'📸'},
];

export default function PoiLayer({region='martinique', onPoiClick}){
  const [activeType, setActiveType]=useState('all');
  const [q,setQ]=useState('');
  const [poisData, setPoisData]=useState(null);
  useEffect(()=>{ fetch('/api/pois.json').then(r=>r.json()).then(setPoisData).catch(()=>{}) },[]);
  const pois=useMemo(()=>{
    const arr=(poisData?.regions?.[region]?.pois||[]);
    let f=arr;
    if(activeType!=='all') f=f.filter(p=>p.type===activeType);
    if(q) f=f.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));
    return f;
  },[region,activeType,q,poisData]);
  if(typeof window!=='undefined' && /[?&]pois=0/.test(window.location.search)) return null;
  return (
    <div style={{position:'absolute', top:10, right:10, zIndex:1025, background:'white', borderRadius:12, padding:8, boxShadow:'0 4px 12px rgba(0,0,0,.15)', maxWidth:260}} role="region" aria-label="POIs layer">
      <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:6}}>
        {TYPES.map(t=><button key={t.id} onClick={()=>{setActiveType(t.id); try{track('sg_poi_filter',{type:t.id})}catch{}}} style={{padding:'6px 10px', borderRadius:20, border:activeType===t.id?'2px solid #0d7f63':'1px solid #ddd', background:activeType===t.id?'#0d7f63':'white', color:activeType===t.id?'white':'#1a1a2e', font:'700 11px/1 sans-serif', minWidth:44, minHeight:32}} aria-label={t.label}>{t.icon} {t.label}</button>)}
      </div>
      <input placeholder="Rechercher POI..." value={q} onChange={e=>setQ(e.target.value)} style={{width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #ddd', fontSize:12, marginBottom:6}} aria-label="Recherche POI"/>
      <div style={{maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:6}}>
        {pois.slice(0,12).map(p=>(
          <div key={p.id} onClick={()=>{onPoiClick&&onPoiClick(p); try{track('sg_poi_click',{type:p.type,id:p.id})}catch{}}} role="button" tabIndex={0} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 8px', borderRadius:8, background:'#f8f9fa', cursor:'pointer'}}>
            <span style={{font:'600 12px/1.2 sans-serif'}}>{p.name} <small style={{color:'#6b7280'}}>({p.type})</small></span>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{font:'700 11px/1 sans-serif', color:'#0d7f63', textDecoration:'none'}}>Y aller →</a>
          </div>
        ))}
        {pois.length===0 && <div style={{fontSize:12, color:'#6b7280', textAlign:'center', padding:10}}>Aucun POI</div>}
      </div>
    </div>
  );
}
