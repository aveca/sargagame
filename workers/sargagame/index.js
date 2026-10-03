export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = ["https://sargasses-martinique.com","https://sargasses-guadeloupe.com","https://sargassummiami.com","https://sargassumpuntacana.com","https://sargassumcancun.com"];
    const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"Content-Type"};
    if (allowed.includes(origin)) headers["access-control-allow-origin"]=origin;
    const out=(x,s)=>new Response(JSON.stringify(x),{status:s,headers});
    if (u.pathname==="/api/mollie-webhook.php" || u.pathname==="/api/mollie-webhook") {
      if(request.method!=="POST") return out({error:"POST only"},405);
      const raw=await request.text(); const ct=request.headers.get("content-type")||"";
      let id=""; if(ct.includes("application/x-www-form-urlencoded")) id=new URLSearchParams(raw).get("id")||""; else {try{id=JSON.parse(raw).id||""}catch{}}
      if(!id)return out({error:"id requis"},400);
      const p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
      const payment=await p.json();
      if(payment.status==="paid" && payment.metadata && payment.metadata.pass && payment.metadata.email){
        const days={p30:30,trip7:7,season:210}[payment.metadata.pass];
        if(days){
          await fetch(env.SUPABASE_URL+"/rest/v1/payment_grants",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
            payment_id:id,type:"b2c_pass",pass:payment.metadata.pass,email:payment.metadata.email,
            currency:(payment.amount&&payment.amount.currency)||"EUR",
            expires_at:new Date(Date.now()+days*86400000).toISOString(),granted_at:new Date().toISOString(),metadata:payment.metadata
          })});
        }
      }
      return out({received:true,paymentId:id,status:payment.status},200);
    }
    if(u.pathname==="/api/mollie.php" || u.pathname==="/api/mollie"){
      if(request.method==="OPTIONS") return new Response(null,{status:204,headers});
      if(request.method!=="POST") return out({error:"POST only"},405);
      let d;try{d=await request.json()}catch{return out({error:"invalid_json"},400)}
      if(!env.MOLLIE_API_KEY)return out({error:"payment_backend_not_configured"},503);
      try{
        if(d.action==="payment_status"){
          const p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(d.paymentId),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
          const x=await p.json(); return out({paid:["paid","settled"].includes(x.status),status:x.status,paymentId:x.id,terminal:["canceled","expired","failed"].includes(x.status)},200);
        }
        if(d.action==="verify_subscription"){
          const email=String(d.email||"").trim();
          const q=env.SUPABASE_URL+"/rest/v1/payment_grants?select=pass,expires_at,payment_id&type=eq.b2c_pass&email=eq."+encodeURIComponent(email)+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=expires_at.desc&limit=1";
          const r=await fetch(q,{headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY}});
          const rows=await r.json(); if(!rows.length)return out({active:false,reason:"no_pass_grant"},200);
          const end=Date.parse(rows[0].expires_at); return out({active:true,kind:"pass",pass:rows[0].pass,passEnd:end,status:"paid"},200);
        }
        if(d.action==="claim_referral_credit")return out({days:0,code:d.code||"",enabled:false},200);
        if(d.action==="create_payment" || d.action==="applepay_session"){
          const pass=d.pass||null, currency=String(d.cur||"EUR").toUpperCase();
          let cents=d.cents==null?null:Number(d.cents); if(cents==null&&d.amount&&d.amount.value)cents=Math.round(Number(d.amount.value)*100);
          const prices={p30:{EUR:14.99,USD:11.99},trip7:{EUR:4.99,USD:null},season:{EUR:19.99,USD:null}};
          let valid=Number.isInteger(cents)&&cents>0&&["EUR","USD"].includes(currency);
          if(pass&&prices[pass]){const e=prices[pass][currency];valid=valid&&(e===null?(cents>50&&cents<5000):Math.abs(cents/100-e)<.02)}else valid=valid&&!pass&&cents<30000;
          if(!valid)return out({error:"Prix invalide"},400);
          if(currency==="USD"&&pass&&pass!=="trip7"){const m=new Date().getUTCMonth()+1;if(m>=6&&m<=11)cents=Math.round(cents*1.15)}
          const base=allowed.includes(u.origin)?u.origin:"https://sargasses-martinique.com";
          const meta=Object.assign({},d.metadata||{},{source:d.source||"unknown",pass:pass||"",email:String(d.email||""),lang:d.lang||"fr"});
          const body={amount:{value:(cents/100).toFixed(2),currency},description:d.description||(pass?"Sargasses Pass "+pass:"Sargasses"),redirectUrl:d.redirectUrl||base+"/?mollie_return=1",webhookUrl:d.webhookUrl||base+"/api/mollie-webhook.php",metadata:meta,locale:d.locale||(currency==="USD"?"en_US":"fr_FR")};
          if(d.method||d.paymentMethod)body.method=d.method||d.paymentMethod;
          if(d.applePayPaymentToken)body.applePayPaymentToken=d.applePayPaymentToken;
          const r=await fetch("https://api.mollie.com/v2/payments",{method:"POST",headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
          const p=await r.json(); if(!r.ok)throw new Error(p.detail||p.title||"Mollie error");
          return out({checkoutUrl:p._links&&p._links.checkout&&p._links.checkout.href||null,paymentId:p.id},200);
        }
        return out({error:"Unknown action"},400);
      }catch(e){return out({error:e.message||"backend_error"},400)}
    }
    if(u.pathname.startsWith("/api/")) return out({error:"api_route_not_migrated",path:u.pathname},404);
    return env.ASSETS.fetch(request);
  }
};