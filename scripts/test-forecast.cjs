async function test(){
  for(const days of [1,3,7]){
    const r=await fetch(`https://sargasses-martinique.com/api/copernicus/forecast?region=martinique&days=${days}`);
    const t=await r.text();
    console.log(`days=${days} status=${r.status} ok=${t.slice(0,60)}`);
  }
  for(const d of ['sargasses-martinique.com','sargasses-guadeloupe.com','sargassumcancun.com','sargazotulum.com','sargassumpuntacana.com','sargassummiami.com']){
    const r=await fetch(`https://${d}/api/copernicus/forecast?region=martinique&days=1`);
    const j=await r.json().catch(()=>({}));
    console.log(`${d} days=1 status=${r.status} ok=${!!j.ok} days=${j.days} free=${j.free} weeklyKeys=${j.weekly?Object.keys(j.weekly).length:0}`);
  }
}
test().catch(e=>console.error(e.message));
