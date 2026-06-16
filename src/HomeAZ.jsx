/**
 * HomeAZ — accueil A→Z (bras A/B `home_az`), porté du design VALIDÉ
 * design/proto-home-az.html (funnel scroll 5 beats + Le Veilleur satellite v2
 * qui RASSURE≠surveille + yole + perso H1 daté EN DIRECT).
 *
 * Architecture du port (faible risque, haute fidélité) :
 *   - CSS + markup SVG = BYTE-IDENTIQUES au proto (src/home-az-assets.js,
 *     généré par scripts/build-homeaz.cjs) → zéro régression de tracé.
 *   - Montés dans un SHADOW DOM → isolation CSS totale (le proto utilise des
 *     classes génériques .cta/.head/.sub ; aucune fuite vers/depuis l'app).
 *   - Le moteur scroll du proto est porté ~1:1 ICI, adapté pour scroller dans
 *     l'overlay (HOST.scrollTop, vars CSS sur l'hôte) au lieu du window, et
 *     câblé aux VRAIES portes de conversion (openPremium/onOpen/onShowMap +
 *     track) au lieu du toast de debug.
 *   - Aucun innerHTML (contenu trusté monté via <style>.textContent +
 *     createContextualFragment ; cartes top-3 construites en DOM).
 *
 * Le composant est additif : control = HeroVerdict, intact. Override ?home_az=1/0.
 */
import React,{useRef,useEffect} from "react"
import {HOME_AZ_CSS,HOME_AZ_MARKUP} from "./home-az-assets.js"

/* ====================================================================
   MOTEUR — monté dans le shadow root SR, hôte/scroll-container HOST.
   opts = { home, hooks, lang }. Retourne { teardown, update, setLang }.
   ==================================================================== */
export function initHomeAZ(SR, HOST, opts){
  var cleaners=[];
  function on(el,ev,fn,o){ el.addEventListener(ev,fn,o); cleaners.push(function(){el.removeEventListener(ev,fn,o);}); }
  var dead=false, rafId=0;
  var timers=[];
  function later(fn,ms){ var t=setTimeout(function(){ if(!dead) fn(); },ms); timers.push(t); return t; }

  var $ = function(id){ return SR.querySelector('#'+id); };

  /* ---- état perso (HOME), mutable via update() ---- */
  function normHome(h){
    return {
      beach: h.beach || "Le Diamant",
      beachDisplay: h.beachDisplay || null,
      score: (h.score!=null ? +h.score : 82),
      status: h.status || "clean",              /* clean | mod | avoid */
      region: h.region || "fr",
      updatedAt: h.updatedAt || null,
      freshLabel: h.freshLabel || null,
      top3: Array.isArray(h.top3) ? h.top3 : null
    };
  }
  var HOME = normHome(opts.home||{});

  var LANG = opts.lang || "fr";
  function _t(fr,en,es){ return LANG==="en"?en : LANG==="es"?es : fr; }

  /* ---- portes de conversion (hooks app) — gardées contre l'après-démontage ---- */
  var H = opts.hooks || {};
  function track(name,props){ if(!dead && H.track) try{H.track(name,props||{});}catch(e){} }
  function openPremium(src){ if(!dead && H.openPremium) H.openPremium(src); }
  function onShowMap(){ if(!dead && H.onShowMap) H.onShowMap(); }
  function onOpenHero(){ if(!dead && H.onOpenHero) H.onOpenHero(); }
  function onOpenBeachIdx(i){ if(!dead && H.onOpenBeachIdx) H.onOpenBeachIdx(i); }

  /* ====================================================================
     i18n — copie (verbatim du proto)
     ==================================================================== */
  var STATUS = {
    clean: {fr:["PROPRE AUJOURD'HUI","CLEAN"], en:["CLEAN TODAY","CLEAN"], es:["LIMPIA HOY","CLEAN"], col:"var(--green)", cls:"st-clean"},
    mod:   {fr:["MODÉRÉ AUJOURD'HUI","MOD"],   en:["MODERATE TODAY","MOD"], es:["MODERADA HOY","MOD"], col:"#E8B23A", cls:"st-mod"},
    avoid: {fr:["À ÉVITER AUJOURD'HUI","AVOID"],en:["AVOID TODAY","AVOID"], es:["EVITAR HOY","AVOID"], col:"var(--coral)", cls:"st-avoid"}
  };
  var T = {
    live:        {fr:"EN DIRECT", en:"LIVE", es:"EN DIRECTO"},
    eb0:         {fr:["EN DIRECT · "," · SATELLITE COPERNICUS"], en:["LIVE · "," · COPERNICUS SATELLITE"], es:["EN DIRECTO · "," · SATÉLITE COPERNICUS"]},
    s0:          {fr:"Le verdict sargasses du matin, mesuré au satellite — pas une supposition.", en:"This morning's sargassum verdict, measured by satellite — not a guess.", es:"El veredicto de sargazo de esta mañana, medido por satélite — no una suposición."},
    ctaHeroT:    {fr:"Voir l'état maintenant", en:"See it right now", es:"Ver el estado ahora"},
    ctaHeroS:    {fr:"verdict du jour · météo · 7 jours de prévisions", en:"today's verdict · weather · 7-day forecast", es:"veredicto de hoy · clima · pronóstico 7 días"},
    mapLinkT:    {fr:"Ouvrir la carte en direct", en:"Open the live map", es:"Abrir el mapa en directo"},
    eb1:         {fr:"CE MATIN, EN DIRECT", en:"THIS MORNING, LIVE", es:"ESTA MAÑANA, EN DIRECTO"},
    h1:          {fr:[["LE VERDICT,"],["PLAGE PAR PLAGE"]], en:[["THE VERDICT,"],["BEACH BY BEACH"]], es:[["EL VEREDICTO,"],["PLAYA POR PLAYA"]]},
    s1:          {fr:"Pas d'avis, pas de promesses : la mesure satellite de ce matin, plage par plage.", en:"No opinions, no promises: this morning's satellite reading, beach by beach.", es:"Sin opiniones ni promesas: la medición satelital de esta mañana, playa por playa."},
    ctaVerdictT: {fr:"Choisis ta plage", en:"Pick your beach", es:"Elige tu playa"},
    eb2:         {fr:"COMMENT ON LE SAIT", en:"HOW WE KNOW", es:"CÓMO LO SABEMOS"},
    h2:          {fr:[["ON VEILLE"],["LA MER POUR TOI"]], en:[["WE WATCH"],["THE SEA FOR YOU"]], es:[["VIGILAMOS"],["EL MAR POR TI"]]},
    s2:          {fr:"Le satellite passe 4 fois par jour : on traduit chaque passage en un verdict clair, le jour même.", en:"The satellite passes 4 times a day: we turn every pass into a clear verdict, same day.", es:"El satélite pasa 4 veces al día: convertimos cada pasada en un veredicto claro, el mismo día."},
    m2b1t:       {fr:"Satellite Copernicus", en:"Copernicus satellite", es:"Satélite Copernicus"},
    m2b1s:       {fr:"4 passages par jour, chaque plage — la donnée du matin, pas d'hier.", en:"4 passes a day, every beach — this morning's data, not yesterday's.", es:"4 pasadas al día, cada playa — el dato de esta mañana, no el de ayer."},
    m2b2t:       {fr:"Un score 0-100", en:"A 0-100 score", es:"Un puntaje 0-100"},
    m2b2s:       {fr:"Recalculé à chaque passage : tu sais où ça en est, en temps réel.", en:"Recomputed on every pass: you know where it stands, in real time.", es:"Recalculado en cada pasada: sabes cómo está, en tiempo real."},
    m2b3t:       {fr:"7 jours devant", en:"7 days ahead", es:"7 días por delante"},
    m2b3s:       {fr:"Prévisions plage par plage : aujourd'hui propre, et la semaine qui vient.", en:"Forecast beach by beach: clean today, and the week ahead.", es:"Pronóstico playa por playa: limpia hoy, y la semana que viene."},
    eb3:         {fr:"PREMIUM", en:"PREMIUM", es:"PREMIUM"},
    h3:          {fr:[["SACHE-LE"],["LE JOUR MÊME"]], en:[["KNOW IT"],["THE SAME DAY"]], es:[["ENTÉRATE"],["EL MISMO DÍA"]]},
    p3b1t:       {fr:"Alerte quand ta plage change", en:"Alert when your beach changes", es:"Alerta cuando tu playa cambia"},
    p3b1s:       {fr:"Le jour où TA plage bascule, tu le sais avant d'avoir fait la route.", en:"The day YOUR beach flips, you know before you've made the drive.", es:"El día que TU playa cambia, lo sabes antes de hacer el viaje."},
    p3b2t:       {fr:"Le brief du matin", en:"The morning brief", es:"El brief de la mañana"},
    p3b2s:       {fr:"L'état du jour dans ta boîte mail, avant de partir à la plage.", en:"Today's status in your inbox, before you head out.", es:"El estado de hoy en tu correo, antes de salir."},
    p3b3t:       {fr:"Les 7 jours, toutes les plages", en:"The 7 days, every beach", es:"Los 7 días, todas las playas"},
    p3b3s:       {fr:"Choisis ton jour : la semaine de prévisions, sur toutes les plages.", en:"Pick your day: the week of forecasts, across every beach.", es:"Elige tu día: la semana de pronósticos, en todas las playas."},
    ctaPremiumT: {fr:"Activer mon veilleur", en:"Turn on my watcher", es:"Activar mi vigía"},
    reassure:    {fr:"Sans engagement — annulable en 1 clic.", en:"No commitment — cancel in one click.", es:"Sin compromiso — cancela en un clic."},
    eb4:         {fr:"MESURÉ, PAS DEVINÉ", en:"MEASURED, NOT GUESSED", es:"MEDIDO, NO ADIVINADO"},
    footCredit:  {fr:"Données : Copernicus Marine · mise à jour en direct", en:"Data: Copernicus Marine · updated live", es:"Datos: Copernicus Marine · actualizado en directo"},
    aboutLink:   {fr:"À propos", en:"About", es:"Acerca de"},
    footPrem:    {fr:"Activer mon veilleur", en:"Turn on my watcher", es:"Activar mi vigía"},
    notifT1:     {fr:"TA PLAGE CHANGE", en:"YOUR BEACH CHANGES", es:"TU PLAYA CAMBIA"},
    notifT2:     {fr:"Sargasses prévues demain", en:"Sargassum expected tomorrow", es:"Sargazo previsto mañana"},
    scrollLab:   {fr:"DÉFILE", en:"SCROLL", es:"DESLIZA"},
    touchHint:   {fr:"Touche la mer", en:"Touch the sea", es:"Toca el mar"},
    whBoom:      {fr:["Tu viens de protéger un bout de mer. Le Veilleur le fait pour TA plage, tous les jours.","Activer le Veilleur"],
                  en:["You just shielded a stretch of sea. The Veilleur does it for YOUR beach, every day.","Turn on the Veilleur"],
                  es:["Acabas de proteger un trozo de mar. El Veilleur lo hace por TU playa, cada día.","Activar el Veilleur"]},
    whRaft:      {fr:["Et TA plage, propre aujourd'hui ?","Voir ma plage"],
                  en:["And YOUR beach, clean today?","See my beach"],
                  es:["Y TU playa, ¿limpia hoy?","Ver mi playa"]},
    whBuoyAvoid: {fr:["Le Veilleur t'aurait prévenu.","Activer l'alerte"],
                  en:["The Veilleur would have warned you.","Turn on the alert"],
                  es:["El Veilleur te habría avisado.","Activar la alerta"]},
    whYole:      {fr:["Cette mer, on la lit chaque matin — pour TA plage.","Voir ma plage"],
                  en:["We read this sea every morning — for YOUR beach.","See my beach"],
                  es:["Leemos este mar cada mañana — para TU playa.","Ver mi playa"]}
  };

  /* nom de plage SANS article (EN/ES) */
  function beachNoArticle(name){ return name.replace(/^l['’]\s*/i,"").replace(/^(le|la|les)\s+/i,""); }
  function beachName(){ return LANG==="fr" ? HOME.beach : (HOME.beachDisplay || beachNoArticle(HOME.beach)); }
  function stLabel(s){ return s==="clean"?_t("Propre","Clean","Limpia") : s==="mod"?_t("Modéré","Moderate","Moderada") : _t("À éviter","Avoid","Evitar"); }

  /* freshness HONNÊTE (jamais de faux chrono) */
  function freshLabel(){
    if(HOME.freshLabel) return (typeof HOME.freshLabel==="object" ? (HOME.freshLabel[LANG]||HOME.freshLabel.fr) : HOME.freshLabel);
    if(HOME.updatedAt){
      var age=(Date.now()-new Date(HOME.updatedAt).getTime())/60000;
      if(isFinite(age) && age>=0 && age<12*60){
        if(age<60) return _t("· il y a "+Math.max(1,Math.round(age))+" min","· "+Math.max(1,Math.round(age))+" min ago","· hace "+Math.max(1,Math.round(age))+" min");
        var h=Math.round(age/60); return _t("· il y a "+h+" h","· "+h+"h ago","· hace "+h+" h");
      }
    }
    return _t("· maj récente","· recently updated","· act. reciente");
  }

  function dateLabel(){
    var d=new Date();
    var moFR=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."];
    var moEN=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    var moES=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
    var mo=LANG==="en"?moEN : LANG==="es"?moES : moFR;
    return d.getDate()+" "+mo[d.getMonth()];
  }

  function setHeading(el, lines){
    if(!el) return;
    while(el.firstChild) el.removeChild(el.firstChild);
    for(var i=0;i<lines.length;i++){
      if(i>0) el.appendChild(document.createElement("br"));
      var seg=lines[i], sp;
      if(seg[1]==="b"||seg[1]===true){ sp=document.createElement("span"); sp.className="b"; sp.textContent=seg[0]; el.appendChild(sp); }
      else if(seg[1]==="pl"){ sp=document.createElement("span"); sp.className="pl"; sp.textContent=seg[0]; el.appendChild(sp); }
      else { el.appendChild(document.createTextNode(seg[0])); }
    }
  }

  /* FIX FR : contraction de l'article — « à Le Diamant » → « au Diamant »,
     « à Les Salines » → « aux Salines », « à L'Anse… » → « à l'Anse… ». */
  function frHeroLead(name){
    var m;
    if((m=name.match(/^le\s+(.+)/i)))    return ["SARGASSES AU ", m[1]];
    if((m=name.match(/^les\s+(.+)/i)))   return ["SARGASSES AUX ", m[1]];
    if((m=name.match(/^la\s+(.+)/i)))    return ["SARGASSES À LA ", m[1]];
    if((m=name.match(/^l['’]\s*(.+)/i))) return ["SARGASSES À L'", m[1]];
    return ["SARGASSES À ", name];
  }
  function setHeroHeading(){
    var l2word=_t("AUJOURD'HUI","TODAY","HOY");
    var live=_t("EN DIRECT","LIVE","EN DIRECTO");
    var lead, core;
    if(LANG==="fr"){ var fr=frHeroLead(HOME.beach); lead=fr[0]; core=fr[1]; }
    else { lead=_t("SARGASSES À","SARGASSUM AT","SARGAZO EN")+" "; core=beachName(); }
    setHeading($("h0"), [[lead],[core.toUpperCase(),"pl"],[l2word+" — ", false]]);
    var el=$("h0"); if(el){ var sp=document.createElement("span"); sp.className="b"; sp.textContent=live; el.appendChild(sp); }
  }
  function setEyebrow0(){
    var el=$("eb0"); if(!el) return; var parts=T.eb0[LANG];
    while(el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(document.createTextNode(parts[0]));
    var dt=document.createElement("span"); dt.className="dt"; dt.textContent=dateLabel(); el.appendChild(dt);
    el.appendChild(document.createTextNode(parts[1]));
  }

  /* top-3 : reconstruit en DOM depuis les VRAIES plages (HOME.top3) ;
     sinon traduit simplement les cartes par défaut du markup. */
  function initTop3(){
    var wrap=$("top3"); if(!wrap) return;
    var arr=HOME.top3;
    if(!arr||!arr.length){
      var cards=wrap.querySelectorAll(".pcard");
      for(var k=0;k<cards.length;k++){ var s=cards[k].getAttribute("data-status")||"clean";
        var ps=cards[k].querySelector(".ps"); if(ps && ps.lastChild) ps.lastChild.textContent=stLabel(s); }
      return;
    }
    while(wrap.firstChild) wrap.removeChild(wrap.firstChild);
    for(var i=0;i<Math.min(arr.length,3);i++){
      var b=arr[i], st=STATUS[b.status]||STATUS.clean;
      var card=document.createElement("div"); card.className="pcard";
      card.setAttribute("data-idx", String(i)); card.setAttribute("data-status", b.status||"clean");
      var pn=document.createElement("div"); pn.className="pn"; pn.textContent=b.name||"";
      var psd=document.createElement("div"); psd.className="ps "+st.cls;
      var dot=document.createElement("span"); dot.className="d"; psd.appendChild(dot);
      psd.appendChild(document.createTextNode(stLabel(b.status)));
      var pf=document.createElement("div"); pf.className="pf"; pf.textContent="score "+(b.score!=null?b.score:"—");
      card.appendChild(pn); card.appendChild(psd); card.appendChild(pf); wrap.appendChild(card);
    }
  }

  function applyCopy(){
    var bn=beachName();
    if($("liveTxt")) $("liveTxt").textContent=T.live[LANG];
    if($("livePass")) $("livePass").textContent=" "+freshLabel();
    setEyebrow0(); setHeroHeading();
    if($("s0")) $("s0").textContent=T.s0[LANG];
    if($("ctaHeroT")) $("ctaHeroT").textContent=T.ctaHeroT[LANG];
    if($("ctaHeroS")) $("ctaHeroS").textContent=T.ctaHeroS[LANG];
    if($("mapLinkT")) $("mapLinkT").textContent=T.mapLinkT[LANG];
    var st=STATUS[HOME.status]||STATUS.clean;
    if($("vTxt")){ $("vTxt").textContent=st[LANG][0]; $("vTxt").style.color=st.col; }
    var vbBadge=$("verdictBadge"); if(vbBadge){ var vbar=vbBadge.querySelector(".vbar"); if(vbar) vbar.style.background=st.col; }
    if($("vScore")) $("vScore").textContent=HOME.score;
    if($("eb1")) $("eb1").textContent=T.eb1[LANG]; setHeading($("h1"),T.h1[LANG]); if($("s1")) $("s1").textContent=T.s1[LANG];
    if($("ctaVerdictT")) $("ctaVerdictT").textContent=T.ctaVerdictT[LANG];
    if($("eb2")) $("eb2").textContent=T.eb2[LANG]; setHeading($("h2"),T.h2[LANG]); if($("s2")) $("s2").textContent=T.s2[LANG];
    if($("m2b1t")) $("m2b1t").textContent=T.m2b1t[LANG]; if($("m2b1s")) $("m2b1s").textContent=T.m2b1s[LANG];
    if($("m2b2t")) $("m2b2t").textContent=T.m2b2t[LANG]; if($("m2b2s")) $("m2b2s").textContent=T.m2b2s[LANG];
    if($("m2b3t")) $("m2b3t").textContent=T.m2b3t[LANG]; if($("m2b3s")) $("m2b3s").textContent=T.m2b3s[LANG];
    if($("ctaMethodeT")) $("ctaMethodeT").textContent=_t("Voir "+bn+" en détail →","See "+bn+" in detail →","Ver "+bn+" en detalle →");
    if($("eb3")) $("eb3").textContent=T.eb3[LANG]; setHeading($("h3"),T.h3[LANG]);
    if($("s3")) $("s3").textContent=_t(
      "Ton veilleur personnel surveille "+bn+" et te prévient le matin où ça change.",
      "Your personal watcher tracks "+bn+" and tells you the morning it changes.",
      "Tu vigía personal cuida "+bn+" y te avisa la mañana en que cambia.");
    if($("p3b1t")) $("p3b1t").textContent=T.p3b1t[LANG]; if($("p3b1s")) $("p3b1s").textContent=T.p3b1s[LANG];
    if($("p3b2t")) $("p3b2t").textContent=T.p3b2t[LANG]; if($("p3b2s")) $("p3b2s").textContent=T.p3b2s[LANG];
    if($("p3b3t")) $("p3b3t").textContent=T.p3b3t[LANG]; if($("p3b3s")) $("p3b3s").textContent=T.p3b3s[LANG];
    if($("ctaPremiumT")) $("ctaPremiumT").textContent=T.ctaPremiumT[LANG];
    if($("reassure")) $("reassure").textContent=T.reassure[LANG];
    if($("eb4")) $("eb4").textContent=T.eb4[LANG]; if($("footCredit")) $("footCredit").textContent=T.footCredit[LANG];
    if($("aboutLink")) $("aboutLink").textContent=T.aboutLink[LANG]; if($("footPrem")) $("footPrem").textContent=T.footPrem[LANG];
    if($("notifT1")) $("notifT1").textContent=T.notifT1[LANG]; if($("notifT2")) $("notifT2").textContent=T.notifT2[LANG];
    if($("scrollLab")) $("scrollLab").textContent=T.scrollLab[LANG];
    if($("touchHintTxt")) $("touchHintTxt").textContent=T.touchHint[LANG];
    initTop3();
  }

  /* ====================================================================
     Math / couleurs
     ==================================================================== */
  function lerp(a,b,t){ return a+(b-a)*t; }
  function clamp(v,a,b){ return v<a?a : v>b?b : v; }
  function easeInOut(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
  function smooth(t){ return t*t*(3-2*t); }
  function rand(a,b){ return a+Math.random()*(b-a); }
  function hx(c){ c=c.replace('#',''); return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)]; }
  function mix(a,b,t){ var A=hx(a),B=hx(b); return 'rgb('+Math.round(lerp(A[0],B[0],t))+','+Math.round(lerp(A[1],B[1],t))+','+Math.round(lerp(A[2],B[2],t))+')'; }
  function toHex(c){ c=c.trim(); if(c[0]==='#') return c.length===4?'#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:c;
    var m=c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(m){ return '#'+([1,2,3].map(function(i){return ('0'+parseInt(m[i]).toString(16)).slice(-2);}).join('')); } return '#1FB6A6'; }
  function getCss(name){ var v=getComputedStyle(HOST).getPropertyValue(name).trim(); return v||'#1FB6A6'; }
  function mixCss(curr,target,t){ return mix(toHex(curr), toHex(target), t); }
  var rootStyle=HOST.style;

  var scene=$("scene");
  function toVB(clientX,clientY){
    var r=scene.getBoundingClientRect(), sc=Math.max(r.width/800,r.height/600);
    var dw=800*sc,dh=600*sc, ox=(r.width-dw)/2, oy=(r.height-dh)/2;
    return {x:(clientX-r.left-ox)/sc, y:(clientY-r.top-oy)/sc};
  }

  /* ====================================================================
     LE VEILLEUR v2 — moteur (humeur data-driven + regard vers la MER)
     ==================================================================== */
  var gPose=$("gPose"), gLife=$("gLife"), gIris=$("gIris"),
      iris=$("iris"), irisTint=$("irisTint"), pupil=$("pupil"),
      catchB=$("catchB"), lidTop=$("lidTop"), lidBot=$("lidBot"),
      brow=$("brow"), halo=$("halo"), beamG=$("beamG"), beam=$("beam"),
      scanRing=$("scanRing"), ant=$("ant");
  var WIDE = window.matchMedia && window.matchMedia("(min-width:680px)").matches;
  var EYE_BASE = WIDE ? 176 : 200;
  var EYE = {x:400, y:EYE_BASE+5.2};

  var MOODS = {
    calm:  { mood:'#1FB6A6', halo:'#1FB6A6', dot:'#22C55E', irisR:7.2,  pose:0,    lift:0,  browLift:-1, lidTop:0.08, lidBot:0.24, beam:0   },
    scan:  { mood:'#FFC72C', halo:'#E8A800', dot:'#FFC72C', irisR:9.3,  pose:4.5,  lift:0,  browLift:1.5,  lidTop:.28, lidBot:0,   beam:1   },
    alert: { mood:'#E8522A', halo:'#E8522A', dot:'#E8522A', irisR:10.2, pose:-3.5, lift:-6, browLift:3.2,  lidTop:-.18,lidBot:-.18,beam:.2  }
  };
  function clone(o){ var n={}; for(var k in o) n[k]=o[k]; return n; }
  var M=clone(MOODS.calm), MT=clone(MOODS.calm), curMoodName='calm';
  function setMoodTarget(name){ if(MOODS[name]){ MT=clone(MOODS[name]); curMoodName=name; } }
  function setMoodFromScore(score){ if(score>=70) setMoodTarget('calm'); else if(score>=40) setMoodTarget('scan'); else setMoodTarget('alert'); }

  function setLids(blink){
    var cy=4;
    var kT=clamp(M.lidTop+blink,-0.4,1), kB=clamp(M.lidBot+blink,-0.4,1);
    var cpTop=lerp(-20,cy+1,kT), cpBot=lerp(28,cy-1,kB);
    if(lidTop) lidTop.setAttribute('d','M-22 '+cy+' Q0 '+cpTop+' 22 '+cy+' L22 -22 L-22 -22 Z');
    if(lidBot) lidBot.setAttribute('d','M-22 '+cy+' Q0 '+cpBot+' 22 '+cy+' L22 30 L-22 30 Z');
  }

  var SEA={x:EYE.x, y:430};
  var gtx=EYE.x, gty=SEA.y, gcx=EYE.x, gcy=SEA.y;
  var pointerActive=false, lastInput=-1, lookUntil=0, lastTap=-1e9;
  var blinkStart=-1, blinkDur=180, nextBlink=performance.now()+rand(2600,4200);
  function blinkNow(dur){ blinkStart=performance.now(); blinkDur=dur||180; wake(); }

  /* ====================================================================
     MOTEUR SCROLL — calcule --gp/--p{i}/--e{i}/dolly + humeur du beat
     ==================================================================== */
  var spans=[$("sp0"),$("sp1"),$("sp2"),$("sp3"),$("sp4")];
  var copies=[$("bc0"),$("bc1"),$("bc2"),$("bc3"),$("bc4")];
  var cam=$("cam"), vp=$("viewport");
  var fired={verdict:false, methode:false, premium:false};
  var bulletsShown={2:false, 3:false};
  var DOLLY=[
    {s:1.00,y:0,oy:"60%"}, {s:1.14,y:-2,oy:"62%"}, {s:1.04,y:0,oy:"48%"}, {s:1.20,y:-3,oy:"38%"}, {s:1.00,y:0,oy:"56%"}
  ];
  var needScroll=true;
  function sizeScroller(){
    var total=0; for(var i=0;i<spans.length;i++){ if(spans[i]) total+=spans[i].offsetHeight; }
    var sc=$("scroller"); if(sc) sc.style.height=(total+HOST.clientHeight)+"px";
  }
  var ringAuto={A:false,B:false}, autoBoomDone=false, lastActive=-1;

  function beatMood(active){
    if(active===0) return HOME.status==="avoid"?"alert" : HOME.status==="mod"?"scan" : "calm";
    if(active===1) return "scan";
    if(active===2) return "calm";
    if(active===3) return "alert";
    return "calm";
  }

  function computeScroll(){
    var scrollY=HOST.scrollTop;
    var prog=[0,0,0,0,0], acc=0;
    for(var i=0;i<spans.length;i++){ var h=spans[i]?spans[i].offsetHeight:1; prog[i]=clamp((scrollY-acc)/h,0,1); acc+=h; }
    for(var j=0;j<5;j++){ rootStyle.setProperty("--p"+j, smooth(prog[j]).toFixed(4)); }
    var active=0;
    for(var k=0;k<5;k++){ if(prog[k]>0.001 && prog[k]<0.999){ active=k; } }
    for(var m=0;m<4;m++){ if(prog[m]>=0.999 && prog[m+1]<=0.001){ active=m+1; } }
    if(prog[4]>=0.999) active=4;
    var pa=prog[active];
    var hoStart=(active===3)?0.80:0.88;
    var handoff=(active<4 && pa>hoStart) ? smooth((pa-hoStart)/(1-hoStart)) : 0;
    for(var n=0;n<5;n++){
      var e=0;
      if(n===active) e=1-handoff; else if(n===active+1) e=handoff;
      rootStyle.setProperty("--e"+n, e.toFixed(3));
      if(copies[n]) copies[n].classList.toggle("on", e>0.15);
    }
    var gp=(active+prog[active])/4;
    rootStyle.setProperty("--gp", clamp(gp,0,1).toFixed(4));
    rootStyle.setProperty("--hs", prog[0].toFixed(4));
    var a=DOLLY[active], b=DOLLY[Math.min(active+1,4)], t=smooth(prog[active]);
    var cs=a.s+(b.s-a.s)*t, cy2=a.y+(b.y-a.y)*t;
    if(cam){ cam.style.transformOrigin="50% "+(t<0.5?a.oy:b.oy); cam.style.transform="translateY("+cy2.toFixed(3)+"%) scale("+cs.toFixed(4)+")"; }
    if($("sunGroup")) $("sunGroup").setAttribute("transform","translate(0,"+(-prog[0]*26).toFixed(1)+")");
    if($("rasterGrain")) $("rasterGrain").style.opacity=(prog[1]*0.10).toFixed(3);
    driftRafts(prog[1]);
    if(prog[1]>0.55 && !ringAuto.A){ ringAuto.A=true; pulseRing("ringA"); }
    if(prog[1]>0.78 && !ringAuto.B){ ringAuto.B=true; pulseRing("ringB"); }
    if($("alertScene")) $("alertScene").style.opacity=prog[3].toFixed(3);
    rootStyle.setProperty("--alert", clamp((prog[3]-0.1)/0.5,0,1).toFixed(3));
    if($("alertNotif")) $("alertNotif").style.opacity=clamp((prog[3]-0.3)/0.3,0,1).toFixed(3);
    var fcbars=SR.querySelectorAll("#fcBars .fcbar");
    for(var f=0;f<fcbars.length;f++){ fcbars[f].style.transform = prog[3]>(0.35+f*0.08) ? "scaleY(1)" : "scaleY(0)"; }
    if(prog[3]>0.5 && !autoBoomDone){ autoBoomDone=true; placeBoom(360,408,true); }
    if(active===2 && prog[2]>0.25 && !bulletsShown[2]){ bulletsShown[2]=true; revealBullets("bullets2"); }
    if(active===3 && prog[3]>0.25 && !bulletsShown[3]){ bulletsShown[3]=true; revealBullets("bullets3"); }
    if(active===1 && prog[1]>0.2 && !fired.verdict){ fired.verdict=true; track("sg_landing_view",{s:"verdict"}); }
    if(active===2 && prog[2]>0.2 && !fired.methode){ fired.methode=true; track("sg_landing_view",{s:"methode"}); }
    if(active===3 && prog[3]>0.2 && !fired.premium){ fired.premium=true; track("sg_landing_view",{s:"premium"}); }
    if($("touchHint")) $("touchHint").classList.toggle("on", active===0 && prog[0]>0.25 && prog[0]<0.85 && !pointerActive);
    var want=beatMood(active);
    if(want!==curMoodName && (performance.now()-lastTap>2500)){ setMoodTarget(want); }
    lastActive=active;
  }

  function revealBullets(id){
    var el=$(id); if(!el) return;
    var bs=el.querySelectorAll(".bul");
    for(var i=0;i<bs.length;i++){ (function(b,d){ later(function(){ b.classList.add("rv"); },d); })(bs[i], i*120); }
  }

  /* radeaux qui dérivent + ramassage */
  var rafts=[$("raft1"),$("raft2"),$("raft3")];
  var raftState=[{picked:false,blocked:false},{picked:false,blocked:false},{picked:false,blocked:false}];
  function driftRafts(p){
    for(var i=0;i<rafts.length;i++){
      var r=rafts[i]; if(!r || raftState[i].picked) continue;
      var baseX=parseFloat(r.getAttribute("data-x"))||0, tx, ty;
      if(raftState[i].blocked){ tx=baseX*(1-Math.min(p,0.5)); ty=Math.min(p,0.5)*8; }
      else { tx=baseX*(1-p); ty=p*14*(i+1)*0.4; }
      r.style.transform="translate("+tx.toFixed(1)+"px,"+ty.toFixed(1)+"px)";
      if(p>0.92 && !raftState[i].blocked && !raftState[i].picked){ raftState[i].picked=true; r.style.opacity="0"; r.style.transform+=" scale(.6)"; }
    }
  }
  function pickRaft(idx, isShore){
    var r=isShore?$("shoreMat"):rafts[idx]; if(!r) return;
    if(!isShore && raftState[idx].picked) return;
    if(isShore && r.dataset.picked) return;
    if(isShore) r.dataset.picked="1"; else raftState[idx].picked=true;
    r.style.transition="transform .7s ease, opacity .7s ease"; r.style.opacity="0";
    track("sg_scene_tap",{el:"sargasse"});
    if(isShore){ r.style.transform="translate(-60px,18px) scale(.5)"; }
    else {
      r.style.transform=(r.style.transform||"")+" scale(.55)";
      flashGlint(rafts[idx]); lookAt(rafts[idx]);
      showWhisper("whRaft", T.whRaft[LANG], rafts[idx].getBoundingClientRect(), function(){ openPremium("scene_sargasse"); });
    }
  }
  function flashGlint(el){
    var b=el.querySelector("ellipse"); if(!b) return;
    var g=document.createElementNS("http://www.w3.org/2000/svg","ellipse");
    g.setAttribute("cx",b.getAttribute("cx")); g.setAttribute("cy",b.getAttribute("cy"));
    g.setAttribute("rx","20"); g.setAttribute("ry","6"); g.setAttribute("fill","#5FD3C9");
    g.setAttribute("class","glint-flash"); g.style.transformOrigin=b.getAttribute("cx")+"px "+b.getAttribute("cy")+"px";
    el.parentNode.appendChild(g); g.classList.add("go");
    later(function(){ if(g.parentNode) g.parentNode.removeChild(g); },1000);
  }

  function lookAtVB(x,y){ gtx=clamp(x,40,760); gty=clamp(y,330,560); lookUntil=performance.now()+1400; lastInput=performance.now(); wake(); }
  function lookAt(el){ var rb=el.getBoundingClientRect(); var c=toVB(rb.left+rb.width/2, rb.top+rb.height/2); lookAtVB(c.x,c.y); }

  function placeBoom(vx, vy, silent){
    var boom=$("boom"), buoys=$("boomBuoys"), line=$("boomLine"); if(!boom||!buoys||!line) return;
    boom.classList.remove("on");
    while(buoys.firstChild) buoys.removeChild(buoys.firstChild);
    var span=80, n=4, x0=vx-span/2;
    line.setAttribute("x1",x0); line.setAttribute("y1",vy); line.setAttribute("x2",vx+span/2); line.setAttribute("y2",vy);
    for(var i=0;i<n;i++){
      var c=document.createElementNS("http://www.w3.org/2000/svg","circle");
      c.setAttribute("cx",x0+(span/(n-1))*i); c.setAttribute("cy",vy); c.setAttribute("r","5");
      c.setAttribute("fill","#009E8E"); c.setAttribute("stroke","#06121A"); c.setAttribute("stroke-width","1.2");
      buoys.appendChild(c);
    }
    requestAnimationFrame(function(){ boom.classList.add("on"); });
    for(var rr=0;rr<raftState.length;rr++){ if(!raftState[rr].picked){ raftState[rr].blocked=true; } }
    if(!silent){
      track("sg_scene_tap",{el:"barrage"});
      lookAtVB(vx,vy); blinkNow(170);
      later(function(){
        var rect=scene.getBoundingClientRect(), scale=Math.max(rect.width/800,rect.height/600);
        var offX=(rect.width-800*scale)/2, offY=(rect.height-600*scale)/2;
        showWhisperAt("whBoom", T.whBoom[LANG], rect.left+offX+vx*scale, rect.top+offY+vy*scale, function(){ openPremium("scene_barrage"); });
      },1200);
    }
  }

  function tapVeilleur(){
    pulseRing("ringV"); blinkNow(150);
    var order=['calm','scan','alert'], idx=(order.indexOf(curMoodName)+1)%3;
    setMoodTarget(order[idx]); lastInput=performance.now(); lastTap=performance.now();
    track("sg_scene_tap",{el:"veilleur"});
  }
  function tapBuoy(id){
    var g=$(id); if(!g) return; var status=g.getAttribute("data-status");
    var ringId=id==="buoyA"?"ringA":"ringB", lblId=id==="buoyA"?"lblA":"lblB";
    pulseRing(ringId); if($(lblId)) $(lblId).classList.add("on"); lookAt(g);
    track("sg_scene_tap",{el:"bouee"});
    if($(lblId)) $(lblId).onclick=function(ev){
      ev.stopPropagation();
      if(status==="avoid"){ showWhisper("whRaft", T.whBuoyAvoid[LANG], g.getBoundingClientRect(), function(){ openPremium("scene_bouee"); }); }
      else { onOpenHero(); }
    };
  }
  function tapYole(){
    var y=$("yole"); if(!y) return;
    track("sg_scene_tap",{el:"yole"}); lookAt(y);
    showWhisper("whRaft", T.whYole[LANG], y.getBoundingClientRect(), function(){ onOpenHero(); });
  }
  function pulseRing(cls){
    var els=SR.querySelectorAll("."+cls);
    for(var i=0;i<els.length;i++){ (function(el){ el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); })(els[i]); }
  }

  /* whispers in-scene (ancrées) */
  function buildWhisper(w, pair){
    while(w.firstChild) w.removeChild(w.firstChild);
    w.appendChild(document.createTextNode(pair[0]+" "));
    if(pair[1]){ var ar=document.createElement("span"); ar.className="ar"; ar.textContent="→"; w.appendChild(ar);
      var sm=document.createElement("small"); sm.textContent=pair[1]; w.appendChild(sm); }
  }
  function showWhisper(id, pair, domRect, onTap){ showWhisperAt(id, pair, domRect.left+domRect.width/2, domRect.top, onTap); }
  function showWhisperAt(id, pair, px, py, onTap){
    var w=$(id); if(!w||!vp) return;
    buildWhisper(w, pair);
    var vpr=vp.getBoundingClientRect();
    w.style.left=clamp(px-vpr.left-120,12,vpr.width-252)+"px";
    w.style.top=clamp(py-vpr.top-86,70,vpr.height-120)+"px";
    w.classList.add("on");
    w.onclick=function(){ w.classList.remove("on"); if(onTap) onTap(); };
    clearTimeout(w._t); w._t=later(function(){ w.classList.remove("on"); },5200);
  }

  /* routage des clics scène (1 listener) */
  function hit(target, sel){ return target.closest && target.closest(sel); }
  if(scene) on(scene,"click",function(evt){
    var c=toVB(evt.clientX,evt.clientY);
    if(hit(evt.target,"#gPose")){ tapVeilleur(); return; }
    if(hit(evt.target,"#yole")){ tapYole(); return; }
    if(hit(evt.target,"#buoyA")){ tapBuoy("buoyA"); return; }
    if(hit(evt.target,"#buoyB")){ tapBuoy("buoyB"); return; }
    if(hit(evt.target,"#shoreMat")){ pickRaft(-1,true); return; }
    var rt=hit(evt.target,".raft");
    if(rt && rt.id && rt.id.indexOf("raft")===0){ pickRaft(parseInt(rt.id.replace("raft",""),10)-1,false); return; }
    if(hit(evt.target,"#alertNotif")){ openPremium("scene_alert"); return; }
    if(c.y>=324 && c.y<=476 && c.x>=0 && c.x<=800){ placeBoom(c.x,c.y,false); }
  },{passive:true});

  /* ====================================================================
     conversion (CTAs) — délégation #top3 pour survivre aux re-render
     ==================================================================== */
  function wireConversion(){
    if($("ctaHero")) on($("ctaHero"),"click",function(){ track("sg_hero_tap",{t:"title"}); onOpenHero(); });
    if($("mapLink")) on($("mapLink"),"click",function(e){ e.preventDefault(); onShowMap(); });
    if($("ctaVerdict")) on($("ctaVerdict"),"click",function(){ onOpenHero(); });
    if($("ctaMethode")) on($("ctaMethode"),"click",function(){ onOpenHero(); });
    if($("ctaPremium")) on($("ctaPremium"),"click",function(){ openPremium("landing_premium"); });
    if($("footPrem")) on($("footPrem"),"click",function(e){ e.preventDefault(); openPremium("footer"); });
    if($("aboutLink")) on($("aboutLink"),"click",function(e){ e.preventDefault(); track("sg_nav",{to:"/a-propos/"}); try{window.location.assign("/a-propos/");}catch(_){} });
    if($("verdictBadge")) on($("verdictBadge"),"click",function(){ track("sg_hero_tap",{t:"verdict"}); onOpenHero(); });
    var t3=$("top3");
    if(t3) on(t3,"click",function(e){
      var c=e.target.closest && e.target.closest(".pcard"); if(!c) return;
      if(c.getAttribute("data-status")==="avoid"){ openPremium("verdict_card_avoid"); return; }
      var idx=c.getAttribute("data-idx");
      if(idx!=null) onOpenBeachIdx(parseInt(idx,10)); else onOpenHero();
    });
    if($("livePill")) on($("livePill"),"click",function(){ track("sg_scene_tap",{el:"live"}); });
  }

  /* boutons langue (pilotent la copie locale ; sync app optionnel via hook) */
  var langBtns=SR.querySelectorAll(".langs button");
  for(var li=0;li<langBtns.length;li++){ (function(btn){
    on(btn,"click",function(){
      LANG=btn.getAttribute("data-lang");
      for(var k=0;k<langBtns.length;k++){ langBtns[k].setAttribute("aria-pressed", langBtns[k]===btn?"true":"false"); }
      applyCopy();
      if(H.onLang) try{H.onLang(LANG);}catch(e){}
    });
  })(langBtns[li]); }

  /* pointeur (desktop) : le Veilleur suit le regard, retour MER */
  on(window,"pointermove",function(e){
    if(e.pointerType==="touch") return;
    var p=toVB(e.clientX,e.clientY);
    gtx=p.x; gty=p.y; pointerActive=true; lastInput=performance.now(); lookUntil=0; wake();
  },{passive:true});

  /* premier état de la copie + tracking d'affichage */
  applyCopy();
  wireConversion();
  track("sg_hero_shown",{beach:HOME.beach, score:HOME.score, status:HOME.status, geoloc:false, variant:"home_az"});

  /* ====================================================================
     REDUCED MOTION — plancher dur : tableau calme figé, tout cliquable.
     ==================================================================== */
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  if(REDUCE){
    rootStyle.setProperty("--p0","1");
    if($("sunGroup")) $("sunGroup").setAttribute("transform","translate(0,-26)");
    M=clone(MOODS.calm); MT=clone(MOODS.calm); curMoodName='calm';
    rootStyle.setProperty('--mood',MOODS.calm.mood); rootStyle.setProperty('--moodHalo',MOODS.calm.halo); rootStyle.setProperty('--moodDot',MOODS.calm.dot);
    if(iris){ iris.setAttribute('r',MOODS.calm.irisR); } if(irisTint){ irisTint.setAttribute('r',MOODS.calm.irisR); }
    if(pupil) pupil.setAttribute('r',(MOODS.calm.irisR*0.42).toFixed(2));
    setLids(0);
    if(brow) brow.setAttribute('d','M-15 -19 Q0 '+(-25+MOODS.calm.browLift)+' 15 -19');
    if(halo) halo.setAttribute('opacity','.5'); if(beam) beam.setAttribute('opacity','0'); if(scanRing) scanRing.setAttribute('opacity','0');
    if(gIris) gIris.setAttribute('transform','translate(0 1.5)');
    if(gPose) gPose.setAttribute('transform','translate('+EYE.x+' '+EYE_BASE+') rotate(0)');
    return { teardown:teardown, update:update, setLang:setLang };
  }

  /* ====================================================================
     LE rAF UNIQUE — scroll + Veilleur + ambient. Demand-driven + pause.
     ==================================================================== */
  var running=false, paused=false;
  var IDLE_MS=2600, t0=performance.now(), introDone=false, raftK=0;
  function nowt(){ return performance.now(); }
  function introProgress(){ return clamp((nowt()-t0)/3600,0,1); }
  function wake(){ if(dead||running||paused) return; running=true; rafId=requestAnimationFrame(loop); }

  on(HOST,"scroll",function(){ needScroll=true; lastInput=nowt(); wake(); },{passive:true});
  on(window,"resize",function(){ sizeScroller(); needScroll=true; wake(); },{passive:true});
  on(document,"visibilitychange",function(){ paused=document.hidden; if(!paused){ needScroll=true; lastInput=nowt(); wake(); } });

  function loop(){
    if(dead){ running=false; return; }
    if(paused){ running=false; return; }
    var t=nowt(), work=false;
    var active=(t-lastInput<IDLE_MS) || !introDone;
    if(needScroll){ computeScroll(); needScroll=false; work=true; }

    var ms=.045;
    var moodConverged=Math.abs(M.irisR-MT.irisR)<0.06;
    if(!moodConverged){
      M.irisR=lerp(M.irisR,MT.irisR,ms); M.pose=lerp(M.pose,MT.pose,ms); M.lift=lerp(M.lift,MT.lift,ms);
      M.browLift=lerp(M.browLift,MT.browLift,ms); M.lidTop=lerp(M.lidTop,MT.lidTop,ms);
      M.lidBot=lerp(M.lidBot,MT.lidBot,ms); M.beam=lerp(M.beam,MT.beam,ms);
      rootStyle.setProperty('--mood',mixCss(getCss('--mood'),MT.mood,ms));
      rootStyle.setProperty('--moodHalo',mixCss(getCss('--moodHalo'),MT.halo,ms));
      rootStyle.setProperty('--moodDot',mixCss(getCss('--moodDot'),MT.dot,ms));
      work=true;
    } else {
      M.irisR=MT.irisR; M.pose=MT.pose; M.lift=MT.lift; M.browLift=MT.browLift;
      M.lidTop=MT.lidTop; M.lidBot=MT.lidBot; M.beam=MT.beam;
      rootStyle.setProperty('--mood',MT.mood); rootStyle.setProperty('--moodHalo',MT.halo); rootStyle.setProperty('--moodDot',MT.dot);
    }
    if(iris) iris.setAttribute('r',M.irisR.toFixed(2));
    if(irisTint) irisTint.setAttribute('r',M.irisR.toFixed(2));
    if(pupil) pupil.setAttribute('r',(M.irisR*0.42).toFixed(2));

    if(pointerActive && t-lastInput<1100){ /* suit le curseur */ }
    else if(t>lookUntil){ gtx=lerp(gtx,SEA.x,.02); gty=lerp(gty,SEA.y,.02);
      if(Math.abs(gtx-SEA.x)>0.4 || Math.abs(gty-SEA.y)>0.4) work=true; }
    else { work=true; }
    gcx=lerp(gcx,gtx,.08); gcy=lerp(gcy,gty,.08);
    if(Math.abs(gcx-gtx)>0.15 || Math.abs(gcy-gty)>0.15) work=true;
    var ex=clamp((gcx-EYE.x)/44,-4,4), ey=clamp((gcy-EYE.y)/58,-3,4);
    if(gIris) gIris.setAttribute('transform','translate('+ex.toFixed(2)+' '+ey.toFixed(2)+')');
    if(catchB){ catchB.setAttribute('cx',(3.4+ex*.7).toFixed(2)); catchB.setAttribute('cy',(2.6+ey*.7).toFixed(2)); }

    var breathe, floatR;
    if(active){ breathe=Math.sin(t/3300)*2.0; floatR=Math.sin(t/5500)*0.6; work=true; }
    else { breathe=0; floatR=0; }
    if(gLife) gLife.setAttribute('transform','translate(0 '+breathe.toFixed(2)+') rotate('+floatR.toFixed(3)+')');

    var poseAng=M.pose+floatR*0.3;
    if(gPose) gPose.setAttribute('transform','translate('+EYE.x.toFixed(1)+' '+(EYE_BASE+M.lift).toFixed(1)+') rotate('+poseAng.toFixed(2)+')');

    var blinkK=0;
    if(blinkStart>0){ var bt=(t-blinkStart)/blinkDur; if(bt>=1){ blinkStart=-1; } else { blinkK=bt<.5?easeInOut(bt*2):easeInOut((1-bt)*2); } work=true; }
    if(active && t>nextBlink && blinkStart<0){ blinkNow(180); nextBlink=t+rand(3200,6500); }
    setLids(blinkK);

    var bl=M.browLift;
    if(brow) brow.setAttribute('d','M-15 '+(-19+bl*0.2).toFixed(2)+' Q0 '+(-25+bl).toFixed(2)+' 15 '+(-19+bl*0.2).toFixed(2));
    if(halo) halo.setAttribute('opacity', active ? (0.42+0.12*Math.sin(t/3300)+0.05).toFixed(3) : '0.50');

    var introT=introProgress(), beamOn=M.beam, sweep=0, sweepOp=0;
    if(introT<1 && !introDone){ if(introT>0.32){ var s=clamp((introT-0.32)/0.68,0,1); sweep=(-14+26*easeInOut(s)); sweepOp=Math.sin(s*Math.PI)*0.9; } work=true; }
    else { introDone=true; }
    var ang=Math.atan2(gcy-EYE.y,gcx-EYE.x)*180/Math.PI-90; ang=clamp(ang,-26,26);
    if(!introDone) ang=sweep;
    if(beamG) beamG.setAttribute('transform','translate('+EYE.x+' '+EYE.y+') rotate('+ang.toFixed(2)+')');
    var bOp=introDone ? beamOn*0.85 : Math.max(sweepOp,beamOn*0.85);
    if(beam) beam.setAttribute('opacity',bOp.toFixed(3));
    var hitX=EYE.x+Math.tan(clamp(ang,-26,26)*Math.PI/180)*(362-EYE.y);
    if(scanRing){ scanRing.setAttribute('cx',clamp(hitX,40,760)); scanRing.setAttribute('opacity',(bOp*0.6).toFixed(3)); scanRing.setAttribute('ry',(8+2*Math.abs(Math.sin(t/1700))*beamOn).toFixed(2)); }
    if(beamOn>0.05 && active) work=true;
    if(ant) ant.setAttribute('opacity', beamOn>0.4 ? (0.8+0.2*Math.abs(Math.sin(t/1700))).toFixed(2) : '1');

    var alertK=curMoodName==='alert'?1:0; raftK=lerp(raftK,alertK,.015);
    if(Math.abs(raftK-alertK)>0.01) work=true;

    if(work && !paused && !dead){ rafId=requestAnimationFrame(loop); } else { running=false; }
  }

  /* premier paint synchrone : scène + hero composés avant toute frame */
  setMoodFromScore(HOME.score);
  M=clone(MOODS[curMoodName]);
  rootStyle.setProperty('--mood',M.mood); rootStyle.setProperty('--moodHalo',M.halo); rootStyle.setProperty('--moodDot',M.dot);
  if(iris) iris.setAttribute('r',M.irisR); if(irisTint) irisTint.setAttribute('r',M.irisR); if(pupil) pupil.setAttribute('r',(M.irisR*0.42).toFixed(2));
  setLids(0);
  if(gPose) gPose.setAttribute('transform','translate('+EYE.x+' '+EYE_BASE+') rotate(0)');
  sizeScroller(); computeScroll(); needScroll=false; lastInput=nowt(); wake();

  /* ---- API exposée au composant ---- */
  function update(newHome){
    HOME=normHome(Object.assign({}, HOME, newHome||{}));
    applyCopy();
    setMoodFromScore(HOME.score);
    needScroll=true; lastInput=nowt(); wake();
  }
  function setLang(l){
    if(!l || l===LANG) return;
    LANG=l;
    for(var k=0;k<langBtns.length;k++){ langBtns[k].setAttribute("aria-pressed", langBtns[k].getAttribute("data-lang")===l?"true":"false"); }
    applyCopy(); wake();
  }
  function teardown(){
    if(dead) return; dead=true;
    try{ cancelAnimationFrame(rafId); }catch(e){}
    for(var i=0;i<timers.length;i++){ try{ clearTimeout(timers[i]); }catch(e){} }
    for(var j=0;j<cleaners.length;j++){ try{ cleaners[j](); }catch(e){} }
  }

  return { teardown:teardown, update:update, setLang:setLang };
}

/* ====================================================================
   COMPOSANT REACT — hôte du shadow + cycle de vie + sync props.
   Props (calquées sur HeroVerdict) : beach, lang, island, sargData, userPos,
   topBeaches, onOpen, onShowMap, onPremium, onOpenBeach, track, exiting.
   ==================================================================== */
const ST_MAP={clean:"clean",moderate:"mod",avoid:"avoid"};

export default function HomeAZ(props){
  const {beach,lang,island,sargData,topBeaches,onOpen,onShowMap,onPremium,onOpenBeach,track,exiting}=props;
  const hostRef=useRef(null);
  const engRef=useRef(null);
  const cbRef=useRef({});
  cbRef.current={onOpen,onShowMap,onPremium,onOpenBeach,track,topBeaches};

  function buildHome(){
    return {
      beach: beach&&beach.name ? beach.name : "Le Diamant",
      beachDisplay: beach&&beach.displayName ? beach.displayName : null,
      score: beach&&beach.score!=null ? beach.score : 82,
      status: (beach&&ST_MAP[beach.status]) || "clean",
      region: island==="gp" ? "gp" : "fr",
      updatedAt: (sargData&&(sargData.updatedAt||sargData.erddapTimestamp)) || null,
      top3: (topBeaches||[]).slice(0,3).map(b=>({name:b.name, status:ST_MAP[b.status]||"clean", score:b.score}))
    };
  }

  /* montage UNIQUE : shadow + moteur (contenu trusté = constantes build-time) */
  useEffect(()=>{
    const host=hostRef.current; if(!host) return;
    const SR = host.shadowRoot || host.attachShadow({mode:"open"});
    while(SR.firstChild) SR.removeChild(SR.firstChild);
    const styleEl=document.createElement("style"); styleEl.textContent=HOME_AZ_CSS; SR.appendChild(styleEl);
    SR.appendChild(document.createRange().createContextualFragment(HOME_AZ_MARKUP));
    const hooks={
      track:(n,p)=>{ try{ cbRef.current.track && cbRef.current.track(n,p); }catch(e){} },
      openPremium:(s)=>{ cbRef.current.onPremium && cbRef.current.onPremium(s); },
      onShowMap:()=>{ cbRef.current.onShowMap && cbRef.current.onShowMap(); },
      onOpenHero:()=>{ cbRef.current.onOpen && cbRef.current.onOpen(); },
      onOpenBeachIdx:(i)=>{ const b=(cbRef.current.topBeaches||[])[i]; if(b && cbRef.current.onOpenBeach) cbRef.current.onOpenBeach(b); else if(cbRef.current.onOpen) cbRef.current.onOpen(); }
    };
    let eng=null;
    try{ eng=initHomeAZ(SR, host, {home:buildHome(), hooks, lang:lang||"fr"}); }
    catch(e){ if(typeof console!=="undefined") console.error("HomeAZ init:",e); }
    engRef.current=eng;
    /* SÉCURITÉ : si le moteur n'a pas pu s'initialiser, ne JAMAIS laisser un
       hero mort (CTAs non câblés) → on bascule sur la carte (= control). */
    if(!eng){ try{ cbRef.current.onShowMap && cbRef.current.onShowMap(); }catch(e){} }
    return ()=>{ try{ eng&&eng.teardown(); }catch(e){} engRef.current=null;
      try{ while(SR.firstChild) SR.removeChild(SR.firstChild); }catch(e){} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* sync données réelles (la plage du hero peut changer : géoloc tardive…) */
  useEffect(()=>{ if(engRef.current) engRef.current.update(buildHome());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[beach&&beach.name, beach&&beach.score, beach&&beach.status, sargData&&(sargData.updatedAt||sargData.erddapTimestamp), (topBeaches||[]).map(b=>b&&b.id).join(",")]);

  /* sync langue app → moteur */
  useEffect(()=>{ if(engRef.current) engRef.current.setLang(lang||"fr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[lang]);

  return React.createElement("div",{
    ref:hostRef, role:"dialog", "aria-label": beach&&beach.name ? beach.name : "Sargasses",
    style:{position:"absolute",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",
      background:"#02060A", WebkitOverflowScrolling:"touch", overscrollBehavior:"contain",
      opacity:exiting?0:1, transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}
  });
}
