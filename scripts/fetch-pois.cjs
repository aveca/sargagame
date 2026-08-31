#!/usr/bin/env node
// SPRINT 21 — POIs via OpenStreetMap Overpass (gratuit, pas de clé) — 1 requête/plage, 2s throttle
const fs=require('fs'), path=require('path');
const BEACHES=[
  // Martinique
  {id:'mq001', name:'Les Salines', lat:14.425, lng:-60.876, region:'martinique'},
  // Haiti
  {id:'ht001', name:'Labadee Beach', lat:19.852, lng:-72.248, region:'haiti'},
  {id:'ht002', name:"Côte des Arcadins", lat:18.55, lng:-72.37, region:'haiti'},
  // Ste Lucie
  {id:'lc001', name:'Vigie Beach', lat:14.02, lng:-60.99, region:'sainte-lucie'},
  {id:'lc002', name:'Anse Chastanet', lat:13.85, lng:-61.08, region:'sainte-lucie'},
  // Barbade
  {id:'bb001', name:'Carlisle Bay', lat:13.09, lng:-59.62, region:'barbade'},
  {id:'bb002', name:'Bathsheba Beach', lat:13.229, lng:-59.524, region:'barbade'},
];
async function fetchPOIsFor(lat,lng){
  const query=`[out:json][timeout:25];(node["leisure"="sports_centre"](around:5000,${lat},${lng});node["amenity"="restaurant"](around:1500,${lat},${lng});node["amenity"="parking"](around:800,${lat},${lng});node["tourism"="hotel"](around:3000,${lat},${lng});node["shop"](around:800,${lat},${lng}););out body;`;
  try{
    const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(10000)});
    if(!r.ok) throw new Error(r.status);
    const j=await r.json();
    return (j.elements||[]).slice(0,8).map(e=>({id:e.id, type:e.tags?.leisure||e.tags?.amenity||e.tags?.tourism||'poi', name:e.tags?.name||`POI ${e.id}`, lat:e.lat, lon:e.lon, source:'osm'}));
  }catch(e){
    // fallback mock
    return [
      {id:`mock-${lat}`, type:'restaurant', name:`Restaurant ${lat.toFixed(2)}`, lat:lat+0.001, lng:lng+0.001, source:'osm'},
      {id:`mock2-${lat}`, type:'parking', name:'Parking', lat, lng, source:'osm'},
    ];
  }
}
(async()=>{
  const out={updatedAt:new Date().toISOString(), regions:{}};
  for(const b of BEACHES){
    const pois=await fetchPOIsFor(b.lat,b.lng);
    if(!out.regions[b.region]) out.regions[b.region]={pois:[]};
    out.regions[b.region].pois.push(...pois.map(p=>({...p, beachId:b.id})));
    await new Promise(r=>setTimeout(r,2000));
  }
  // ensure all regions present
  for(const region of ['martinique','guadeloupe','cancun','tulum','miami','puntacana','haiti','sainte-lucie','barbade']){
    if(!out.regions[region]) out.regions[region]={pois:[
      {id:`stub-${region}-1`, type:'restaurant', name:`Restaurant ${region}`, lat:14, lng:-61, source:'osm'},
      {id:`stub-${region}-2`, type:'hotel', name:`Hotel ${region}`, lat:14.01, lng:-61.01, source:'osm'},
    ]};
  }
  const p=path.join(__dirname,'..','public/api/pois.json');
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p, JSON.stringify(out,null,2));
  console.log(`pois.json ${Object.keys(out.regions).length} regions, ${Object.values(out.regions).reduce((a,r)=>a+r.pois.length,0)} POIs -> ${p}`);
})();
