const domains=[
  {id:'MQ',domain:'sargasses-martinique.com',region:'mq'},
  {id:'GP',domain:'sargasses-guadeloupe.com',region:'gp'},
  {id:'Cancun',domain:'sargassumcancun.com',region:'rivieramaya'},
  {id:'Tulum',domain:'sargazotulum.com',region:'tulum'},
  {id:'PC',domain:'sargassumpuntacana.com',region:'puntacana'},
  {id:'Miami',domain:'sargassummiami.com',region:'florida'},
];
async function check(url,opts={}){
  try{
    const r=await fetch(url,opts);
    const t=await r.text();
    return {ok:r.ok,status:r.status,len:t.length,head:t.slice(0,80).replace(/\n/g,' ')};
  }catch(e){ return {error:e.message} }
}
(async()=>{
  for(const d of domains){
    console.log(`\n=== ${d.id} ${d.domain} ===`);
    const home=await check(`https://${d.domain}/`);
    console.log(` home ${home.status} len${home.len}`);
    const b2b=await check(`https://${d.domain}/b2b`);
    console.log(` b2b ${b2b.status} len${b2b.len}`);
    const widget=await check(`https://${d.domain}/widget`);
    console.log(` widget ${widget.status} len${widget.len}`);
    const cop=await check(`https://${d.domain}/api/copernicus/forecast.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@test.com'})});
    console.log(` copernicus POST ${cop.status} ${cop.head?.slice(0,60)}`);
    const mollie=await check(`https://${d.domain}/api/mollie`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify_subscription',email:'test@test.com'})});
    console.log(` mollie verify ${mollie.status} ${mollie.head?.slice(0,60)}`);
    const sup=await check(`https://${d.domain}/api/supabase`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'b2b_leads',insert:{email:'audit@test.com',domain:d.domain,region:d.region}})});
    console.log(` supabase ${sup.status} ${sup.head?.slice(0,60)}`);
    // also check mail
    if(d.id==='MQ'){
      const mail=await check(`https://mail.${d.domain}/send-email.php`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer sargagame-mail-2026'},body:JSON.stringify({to:'test@test.com',subject:'audit',html:'<p>hi</p>',from:'alerte@sargasses-martinique.com'})});
      console.log(` mail subdomain POST ${mail.status} ${mail.head?.slice(0,80)}`);
    }
  }
})();
