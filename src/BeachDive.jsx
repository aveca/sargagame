/**
 * BeachDive — fiche plage « en PLONGÉE » (bras A/B `pw_beach_dive`), portée du
 * design VALIDÉ + PRÉFÉRÉ FONDATEUR design/proto-plage-plongee.html (scène SVG
 * plein écran, 6 stages : arrivée → verdict → preuve-mesure → prévision 7j scrub
 * → plan-B + santé H2S → preuve sociale, Le Veilleur v2 qui RASSURE≠surveille).
 *
 * Architecture du port (identique à HomeAZ, faible risque / haute fidélité) :
 *   - CSS + markup SVG = BYTE-IDENTIQUES au proto (src/beach-dive-assets.js,
 *     généré par scripts/build-beachdive.cjs) → zéro régression de tracé.
 *   - Montés dans un SHADOW DOM → isolation CSS totale (classes génériques).
 *   - Le moteur du proto est porté ~1:1 ICI, adapté pour scroller dans l'overlay
 *     (HOST.scrollTop, vars CSS sur l'hôte) au lieu du window, et câblé aux VRAIES
 *     portes de conversion (openPremium/onOpenBeach/onShowMap + track).
 *   - Aucun innerHTML (markup trusté via createContextualFragment ; tout le reste
 *     construit en DOM / SVG namespacé).
 *   - REGION-AWARE : breadcrumb + libellés de zone dérivés de regionName (jamais
 *     « Martinique » / « Sud » en dur) ; données = la VRAIE plage + forecast +
 *     plan-B + score 7 facteurs de l'app.
 *
 * Additif : control = BeachSheet, strictement intact. Override ?beachdive=1/0.
 *
 * ADAPTATION DÉLIBÉRÉE vs proto : le scrub de prévision n'AUTO-ouvre PAS le premium
 * (un modal involontaire au scroll = popup-sans-action, banni). Le premium ne part
 * que sur le CTA explicite « Débloquer les 7 jours ». Le verrou visuel J2-7 reste.
 */
import React,{useRef,useEffect} from "react"
import {BEACH_DIVE_CSS,BEACH_DIVE_MARKUP} from "./beach-dive-assets.js"

/* ====================================================================
   MOTEUR — monté dans le shadow root SR, hôte/scroll-container HOST.
   opts = { data, hooks, lang, regionName }. Retourne { teardown, update, setLang }.
   ==================================================================== */
export function initBeachDive(SR, HOST, opts){
  var cleaners=[];
  function on(el,ev,fn,o){ el.addEventListener(ev,fn,o); cleaners.push(function(){el.removeEventListener(ev,fn,o);}); }
  var dead=false, rafId=0, timers=[];
  function later(fn,ms){ var t=setTimeout(function(){ if(!dead) fn(); },ms); timers.push(t); return t; }
  var $ = function(id){ return SR.querySelector('#'+id); };

  /* ---- DONNÉES (réelles, injectées par le composant), mutables via update() ---- */
  function normData(d){
    d=d||{};
    return {
      beach: d.beach || {id:"mq016",name:"Plage",commune:"",status:"clean",score:70,afai:0.05},
      score: d.score || {score:(d.beach&&d.beach.score)||70, breakdown:{}, strengths:[], weaknesses:[]},
      forecast: Array.isArray(d.forecast)&&d.forecast.length ? d.forecast : [{day:"Auj.",afai:0.05,status:"clean",confidence:60}],
      nearby: Array.isArray(d.nearby) ? d.nearby : [],
      reliability: d.reliability || {calm:79, peak:76, sample:412},
      updatedAt: d.updatedAt || null
    };
  }
  var DATA = normData(opts.data||{});
  var REGION_NAME = opts.regionName || "Martinique";

  var LANG = opts.lang || "fr";
  function _t(fr,en,es){ return LANG==="en"?en : LANG==="es"?es : fr; }

  /* ---- portes de conversion (hooks app) — gardées contre l'après-démontage ---- */
  var H = opts.hooks || {};
  function track(name,props){ if(!dead && H.track) try{H.track(name,props||{});}catch(e){} }
  function openPremium(src){ if(!dead && H.openPremium) H.openPremium(src); }
  function onShowMap(){ if(!dead && H.onShowMap) H.onShowMap(); }
  function onClose(){ if(!dead && H.onClose) H.onClose(); }
  function onOpenBeachObj(b){ if(!dead && H.onOpenBeach) H.onOpenBeach(b); }

  /* statut canonique */
  function stKey(s){ s=(s||"").toLowerCase(); if(s==="avoid"||s==="bad") return "avoid"; if(s==="moderate"||s==="mod") return "moderate"; return "clean"; }
  var STATUS, STCOL, STCLS, SCORE;
  function recomputeStatus(){
    STATUS = stKey(DATA.beach.status);
    STCOL  = STATUS==="avoid" ? "var(--coral)" : STATUS==="moderate" ? "#E8B23A" : "var(--green)";
    STCLS  = STATUS==="avoid" ? "st-avoid" : STATUS==="moderate" ? "st-mod" : "st-clean";
    SCORE  = (DATA.score && DATA.score.score!=null) ? DATA.score.score : (DATA.beach.score||0);
  }
  recomputeStatus();

  /* ====================================================================
     i18n + helpers de texte (verbatim du proto)
     ==================================================================== */
  function verbalVerdict(){
    if(STATUS==="clean") return _t(["BAIGNADE OK","CE MATIN"],["GOOD TO SWIM","THIS MORNING"],["BAÑO OK","ESTA MAÑANA"]);
    if(STATUS==="moderate") return _t(["ÇA SE TIENT,","SURVEILLE"],["IT HOLDS,","KEEP AN EYE"],["AGUANTA,","VIGILA"]);
    return _t(["MER CHARGÉE,","ÉVITE"],["SEA LOADED,","SKIP IT"],["MAR CARGADO,","EVITA"]);
  }
  var STATUS_WORD = {
    clean:    {fr:"Propre", en:"Clean", es:"Limpia"},
    moderate: {fr:"Modéré", en:"Moderate", es:"Moderado"},
    avoid:    {fr:"À éviter", en:"Avoid", es:"Evitar"}
  };
  function beachNoArticle(n){ return (n||"").replace(/^l['’]\s*/i,"").replace(/^(le|la|les|plage du|plage de la|plage des|plage d['’])\s*/i,""); }
  function beachName(){ return LANG==="fr" ? DATA.beach.name : beachNoArticle(DATA.beach.name); }

  function freshLabel(){
    if(!DATA.updatedAt) return _t("vérification en cours","checking…","verificación en curso");
    var age = (Date.now() - new Date(DATA.updatedAt).getTime())/60000;
    if(isFinite(age) && age>=0 && age < 12*60){
      if(age < 60) return _t("il y a "+Math.max(1,Math.round(age))+" min","· "+Math.max(1,Math.round(age))+" min ago","hace "+Math.max(1,Math.round(age))+" min");
      var h=Math.round(age/60); return _t("il y a "+h+" h","· "+h+"h ago","hace "+h+" h");
    }
    return _t("vérification en cours","checking…","verificación en curso");
  }
  function dateLabel(){
    var d=new Date();
    var moFR=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."];
    var moEN=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    var moES=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
    var mo=LANG==="en"?moEN:LANG==="es"?moES:moFR;
    return d.getDate()+" "+mo[d.getMonth()];
  }

  /* labels FR/EN/ES + poids max RÉELS (src/lib/score.js WEIGHTS) des 7 facteurs */
  var FACTOR_LABELS = {
    sargassum:{fr:"Sargasses",en:"Sargassum",es:"Sargazo", max:30},
    wave:{fr:"Houle",en:"Waves",es:"Oleaje", max:20},
    wind:{fr:"Vent",en:"Wind",es:"Viento", max:15},
    sst:{fr:"Eau",en:"Water",es:"Agua", max:10},
    cloud:{fr:"Ciel",en:"Sky",es:"Cielo", max:10},
    uv:{fr:"UV",en:"UV",es:"UV", max:10},
    tide:{fr:"Marée",en:"Tide",es:"Tide", max:5}
  };

  var T = {
    back:   {fr:"Carte", en:"Map", es:"Mapa"},
    touchHint:{fr:"Touche la mer", en:"Touch the sea", es:"Toca el mar"},
    scrollLab:{fr:"DÉFILE", en:"SCROLL", es:"DESLIZA"},
    eb0:    {fr:["MESURÉ AU SATELLITE · "," · "], en:["SATELLITE-MEASURED · "," · "], es:["MEDIDO POR SATÉLITE · "," · "]},
    s0:     {fr:"L'état réel de l'eau ce matin — mesuré au satellite, pas deviné.", en:"The real state of the water this morning — measured by satellite, not guessed.", es:"El estado real del agua esta mañana — medido por satélite, no adivinado."},
    ctaArriveT:{fr:"Voir la preuve", en:"See the proof", es:"Ver la prueba"},
    ctaArriveS:{fr:"score · 7 facteurs · prévision 7 jours", en:"score · 7 factors · 7-day forecast", es:"puntaje · 7 factores · pronóstico 7 días"},
    eb1:    {fr:"LE VERDICT, EN CLAIR", en:"THE VERDICT, PLAINLY", es:"EL VEREDICTO, CLARO"},
    h1:     {fr:[["SON SCORE"],["DU MATIN"]], en:[["ITS MORNING"],["SCORE"]], es:[["SU PUNTAJE"],["DE HOY"]]},
    s1:     {fr:"Sur 100, recalculé à chaque passage satellite.", en:"Out of 100, recomputed on every satellite pass.", es:"Sobre 100, recalculado en cada pasada."},
    ctaVerdictT:{fr:"D'où vient ce chiffre ?", en:"Where's this number from?", es:"¿De dónde sale?"},
    eb2:    {fr:"LA PREUVE, MESURE PAR MESURE", en:"THE PROOF, STEP BY STEP", es:"LA PRUEBA, PASO A PASO"},
    m2aH:   {fr:[["LE SATELLITE"],["SCANNE LA MER"]], en:[["THE SATELLITE"],["SCANS THE SEA"]], es:[["EL SATÉLITE"],["ESCANEA EL MAR"]]},
    m2bH:   {fr:[["7 FACTEURS,"],["UN SEUL SCORE"]], en:[["7 FACTORS,"],["ONE SCORE"]], es:[["7 FACTORES,"],["UN PUNTAJE"]]},
    m2cH:   {fr:[["ET ON SAIT"],["QUAND ON SE TROMPE"]], en:[["AND WE KNOW"],["WHEN WE'RE WRONG"]], es:[["Y SABEMOS"],["CUÁNDO FALLAMOS"]]},
    regimeT:{fr:"Saison calme", en:"Calm season", es:"Temporada calma"},
    regimeMore:{fr:"Voir notre fiabilité →", en:"See our reliability →", es:"Ver nuestra fiabilidad →"},
    regimePctL:{fr:"justes", en:"right", es:"acierto"},
    ctaMethodeT:{fr:"Et la semaine qui vient ?", en:"And the week ahead?", es:"¿Y la semana que viene?"},
    eb3:    {fr:"7 JOURS DEVANT", en:"7 DAYS AHEAD", es:"7 DÍAS POR DELANTE"},
    h3:     {fr:[["LA SEMAINE,"],["JOUR PAR JOUR"]], en:[["THE WEEK,"],["DAY BY DAY"]], es:[["LA SEMANA,"],["DÍA A DÍA"]]},
    s3:     {fr:"Aujourd'hui et demain sont nets. Au-delà, c'est flouté — c'est l'honnêteté de la donnée.", en:"Today and tomorrow are sharp. Beyond that it's blurred — that's data honesty.", es:"Hoy y mañana son nítidos. Más allá, borroso — es honestidad de datos."},
    fcLockTxt:{fr:"Au-delà de demain = réservé au Veilleur", en:"Beyond tomorrow = Veilleur only", es:"Más allá de mañana = solo Veilleur"},
    ctaForecastT:{fr:"Débloquer les 7 jours", en:"Unlock the 7 days", es:"Desbloquear los 7 días"},
    eb4:    {fr:"PLAN B, À CÔTÉ", en:"PLAN B, NEARBY", es:"PLAN B, CERCA"},
    h4:     {fr:[["DES PLAGES PROPRES"],["TOUT PRÈS"]], en:[["CLEAN BEACHES"],["RIGHT NEAR"]], es:[["PLAYAS LIMPIAS"],["MUY CERCA"]]},
    s4:     {fr:"Si ça ne le sent pas ici, voilà où aller — à quelques minutes.", en:"If it's not it here, here's where to go — minutes away.", es:"Si aquí no, aquí es dónde ir — a minutos."},
    eb5:    {fr:"CE QU'ILS EN DISENT", en:"WHAT THEY SAY", es:"LO QUE DICEN"},
    h5:     {fr:[["ON VEILLE"],["DÉJÀ POUR EUX"]], en:[["WE WATCH"],["FOR THEM ALREADY"]], es:[["YA VIGILAMOS"],["PARA ELLOS"]]},
    socialB:{fr:"« Plus jamais une route pour rien. »", en:"“Never a wasted drive again.”", es:"“Nunca más un viaje en vano.”"},
    socialS:{fr:"58 voisins suivent leurs plages chaque matin.", en:"58 locals follow their beaches each morning.", es:"58 vecinos siguen sus playas cada mañana."},
    footCredit:{fr:"Données : Copernicus Marine · mesuré, pas deviné", en:"Data: Copernicus Marine · measured, not guessed", es:"Datos: Copernicus Marine · medido, no adivinado"},
    ctaFooterT:{fr:"Activer mon veilleur", en:"Turn on my watcher", es:"Activar mi vigía"},
    reassure:{fr:"Sans engagement — annulable en 1 clic.", en:"No commitment — cancel in one click.", es:"Sin compromiso — cancela en un clic."},
    whYole: {fr:["Cette mer, on la lit chaque matin — pour cette plage.","Voir la fiabilité"],
             en:["We read this sea every morning — for this beach.","See reliability"],
             es:["Leemos este mar cada mañana — para esta playa.","Ver fiabilidad"]},
    whVeil: {fr:["Je veille l'eau, pas toi. Calme = ≥70, vigilance = 40-69, alerte = <40.","Activer mon veilleur"],
             en:["I watch the water, so you don't. Calm = ≥70, watch = 40-69, alert = <40.","Turn on my watcher"],
             es:["Vigilo el agua por ti. Calma = ≥70, atención = 40-69, alerta = <40.","Activar mi vigía"]}
  };

  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ====================================================================
     PRNG seedé (par beach.id) — reprend buildBeachScene de Sargasses_PROD.
     ==================================================================== */
  function seedFrom(str){ var h=2166136261; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0); }
  function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  var rng = mulberry(seedFrom(DATA.beach.id||"mq016"));
  function rr(a,b){ return a+(b-a)*rng(); }
  function archetype(){
    var k=((DATA.beach.id||"")+" "+(DATA.beach.name||"")+" "+(DATA.beach.commune||"")).toLowerCase();
    if(/diamant/.test(k)) return "diamondRock";
    if(/caravelle|tartane|presqu|tombolo|chateaux|château|trinité/.test(k)) return "cliff";
    if(/salines|saline|grande anse|bourg|sainte-anne/.test(k)) return "open";
    return "morne";
  }
  function svgEl(tag,attrs){ var e=document.createElementNS("http://www.w3.org/2000/svg",tag); for(var k in attrs){ e.setAttribute(k,attrs[k]); } return e; }

  function buildRelief(){
    var g=$("reliefG"); if(!g) return; while(g.firstChild) g.removeChild(g.firstChild);
    var a=archetype();
    if(a==="diamondRock"){
      g.appendChild(svgEl("path",{d:"M468 340 Q481 284 509 252 Q525 234 534 253 Q560 292 570 340 Z", fill:"url(#rockG)"}));
      g.appendChild(svgEl("path",{d:"M509 252 Q525 234 534 253 Q560 292 570 340 L534 340 Z", fill:"#000", "fill-opacity":".22"}));
      g.appendChild(svgEl("path",{d:"M509 252 Q481 284 468 340 L509 340 Z", fill:"#FFD884", "fill-opacity":".22"}));
    } else if(a==="cliff"){
      var cut=rr(238,268)|0;
      g.appendChild(svgEl("path",{d:"M-40 340 L-40 "+cut+" Q120 "+(cut-38)+" 236 "+(cut+8)+" L266 340 Z", fill:"url(#rockG)"}));
      g.appendChild(svgEl("path",{d:"M-40 "+cut+" Q120 "+(cut-38)+" 236 "+(cut+8), fill:"none", stroke:"#FFD884", "stroke-width":"3", "stroke-opacity":".22"}));
    } else if(a==="open"){
      g.appendChild(svgEl("path",{d:"M-40 366 Q400 358 840 368", fill:"none", stroke:"#FFD884", "stroke-width":"2", "stroke-dasharray":"5 9", "stroke-opacity":".34"}));
      var ix=rr(150,260)|0;
      g.appendChild(svgEl("path",{d:"M"+(ix-44)+" 340 Q"+ix+" 304 "+(ix+44)+" 340 Z", fill:"url(#rockG)", opacity:".85"}));
    } else {
      var mx=rr(560,640)|0;
      g.appendChild(svgEl("path",{d:"M"+(mx-90)+" 340 Q"+mx+" 250 "+(mx+90)+" 340 Z", fill:"url(#rockG)", opacity:".92"}));
      g.appendChild(svgEl("path",{d:"M"+(mx-90)+" 340 Q"+mx+" 250 "+(mx+90)+" 340", fill:"none", stroke:"#FFD884", "stroke-width":"2.2", "stroke-opacity":".2"}));
    }
  }
  function buildState(){
    var sea=$("seaStateG"), shore=$("shoreStateG"); if(!sea||!shore) return;
    while(sea.firstChild) sea.removeChild(sea.firstChild);
    while(shore.firstChild) shore.removeChild(shore.firstChild);
    if(STATUS==="clean"){
      [["372","392","6"],["452","404","5"]].forEach(function(s){
        var grp=svgEl("g",{});
        grp.appendChild(svgEl("circle",{cx:s[0],cy:s[1],r:s[2],fill:"#0D2B26"}));
        grp.appendChild(svgEl("path",{d:"M"+(+s[0]-12)+" "+(+s[1]+6)+" q12 -8 24 0", stroke:"#0D2B26","stroke-width":"3.2",fill:"none","stroke-linecap":"round"}));
        sea.appendChild(grp);
      });
      sea.appendChild(svgEl("path",{d:"M348 396 h8 M396 398 h7 M462 410 h8", stroke:"#FFD884","stroke-width":"1.6",opacity:".5","stroke-linecap":"round"}));
    } else if(STATUS==="moderate"){
      var net=svgEl("g",{});
      net.appendChild(svgEl("path",{d:"M286 372 Q360 382 434 374", fill:"none", stroke:"#CDEBE6","stroke-width":"1.2","stroke-dasharray":"1.5 4",opacity:".6"}));
      [[300,374,3],[344,378,2.6],[388,375,2.6],[432,374,3]].forEach(function(b){ net.appendChild(svgEl("circle",{cx:b[0],cy:b[1],r:b[2],fill:"#FFC72C"})); });
      sea.appendChild(net);
      var raft=svgEl("g",{transform:"translate(330,388) scale(.62)",opacity:".8"});
      raft.appendChild(svgEl("ellipse",{rx:"22",ry:"7",fill:"#7a5c14"}));
      raft.appendChild(svgEl("ellipse",{cx:"-10",cy:"-3",rx:"9",ry:"4",fill:"#8a6c1c"}));
      sea.appendChild(raft);
      var man=svgEl("g",{transform:"translate(458,508)"});
      var fig=svgEl("g",{fill:"#0E1F1A"});
      fig.appendChild(svgEl("circle",{cx:"0",cy:"-27",r:"5"}));
      fig.appendChild(svgEl("path",{d:"M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z"}));
      fig.appendChild(svgEl("path",{d:"M-4 -4 l-3 12 M4 -4 l3 12", stroke:"#0E1F1A","stroke-width":"2.4","stroke-linecap":"round",fill:"none"}));
      man.appendChild(fig);
      man.appendChild(svgEl("path",{d:"M2 -19 L20 8 M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8", stroke:"#3A2A14","stroke-width":"2.2",fill:"none","stroke-linecap":"round"}));
      shore.appendChild(man);
    } else {
      var rafts=svgEl("g",{});
      var r1=svgEl("g",{transform:"translate(300,372)"});
      r1.appendChild(svgEl("ellipse",{rx:"24",ry:"8",fill:"#7a5c14"}));
      r1.appendChild(svgEl("ellipse",{cx:"-12",cy:"-4",rx:"10",ry:"5",fill:"#8a6c1c"}));
      r1.appendChild(svgEl("ellipse",{cx:"12",cy:"-3",rx:"11",ry:"5",fill:"#5d400e"}));
      var r2=svgEl("g",{transform:"translate(470,390) scale(.9)"});
      r2.appendChild(svgEl("ellipse",{rx:"22",ry:"7",fill:"#7a5c14"}));
      r2.appendChild(svgEl("ellipse",{cx:"8",cy:"-3",rx:"9",ry:"4",fill:"#8a6c1c"}));
      rafts.appendChild(r1); rafts.appendChild(r2);
      sea.appendChild(rafts);
      var amas=svgEl("g",{});
      amas.appendChild(svgEl("ellipse",{cx:"318",cy:"512",rx:"72",ry:"14",fill:"#5d400e"}));
      amas.appendChild(svgEl("ellipse",{cx:"288",cy:"506",rx:"34",ry:"10",fill:"#7a5c14"}));
      amas.appendChild(svgEl("ellipse",{cx:"472",cy:"524",rx:"60",ry:"12",fill:"#6b4a12"}));
      amas.appendChild(svgEl("ellipse",{cx:"492",cy:"518",rx:"28",ry:"8",fill:"#8a6c1c"}));
      shore.appendChild(amas);
    }
  }

  var NEARBY_POS = [ {x:230,y:420}, {x:150,y:460}, {x:330,y:448} ];
  function buildNearbyHalos(){
    var g=$("nearbyHalos"); if(!g) return; while(g.firstChild) g.removeChild(g.firstChild);
    g.setAttribute("class","nearbyhalo");
    DATA.nearby.slice(0,3).forEach(function(b,i){
      var p=NEARBY_POS[i]; var col = stKey(b.status)==="clean" ? "#22C55E" : stKey(b.status)==="moderate" ? "#E8A800" : "#E8522A";
      var grp=svgEl("g",{class:"nh", "data-idx":i, style:"cursor:pointer"});
      grp.appendChild(svgEl("circle",{cx:p.x,cy:p.y,r:"40",fill:"url(#shore)"}));
      grp.appendChild(svgEl("circle",{cx:p.x,cy:p.y,r:"6.5",fill:col,stroke:"#06121A","stroke-width":"1.3"}));
      var ring=svgEl("circle",{class:"ring nhpulse",cx:p.x,cy:p.y,r:"12",fill:"none",stroke:"#FFE6A8","stroke-width":"1.4",style:"transform-origin:"+p.x+"px "+p.y+"px"});
      grp.appendChild(ring);
      var name=(LANG==="fr"?b.name:beachNoArticle(b.name));
      var sh=svgEl("text",{x:p.x,y:p.y-16,"text-anchor":"middle","font-family":"Bricolage Grotesque,sans-serif","font-size":"12","font-weight":"800",fill:"#02100E","fill-opacity":".6",transform:"translate(0 1.2)"});
      sh.textContent=name; grp.appendChild(sh);
      var t=svgEl("text",{x:p.x,y:p.y-16,"text-anchor":"middle","font-family":"Bricolage Grotesque,sans-serif","font-size":"12","font-weight":"800",fill:"#fff"});
      t.textContent=name; grp.appendChild(t);
      g.appendChild(grp);
    });
  }

  /* ====================================================================
     APPLY COPY (i18n + données réelles)
     ==================================================================== */
  function setHeading(el, lines){
    if(!el) return; while(el.firstChild) el.removeChild(el.firstChild);
    for(var i=0;i<lines.length;i++){
      if(i>0) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(lines[i][0]!==undefined?lines[i][0]:lines[i]));
    }
  }
  function setEyebrow0(){
    var el=$("eb0"); if(!el) return; var parts=T.eb0[LANG];
    while(el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(document.createTextNode(parts[0]));
    var dt=document.createElement("span"); dt.className="dt"; dt.textContent=dateLabel(); el.appendChild(dt);
    el.appendChild(document.createTextNode(parts[1]));
    var bn=document.createElement("span"); bn.className="dt"; bn.textContent=beachName().toUpperCase(); el.appendChild(bn);
  }
  function setVerbalVerdict(){
    var el=$("verdictVerbal"); if(!el) return; var v=verbalVerdict();
    while(el.firstChild) el.removeChild(el.firstChild);
    var hl=document.createElement("span"); hl.className="hl"; hl.style.color=STCOL;
    hl.textContent=v[0]; el.appendChild(hl);
    el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(v[1]));
  }
  function buildChips(){
    var row=$("chipRow"); if(!row) return; while(row.firstChild) row.removeChild(row.firstChild);
    (DATA.score.strengths||[]).slice(0,2).forEach(function(s){
      var c=document.createElement("span"); c.className="chip good";
      var i=document.createElement("span"); i.className="i"; i.textContent="✓"; c.appendChild(i);
      c.appendChild(document.createTextNode(s)); row.appendChild(c);
    });
    (DATA.score.weaknesses||[]).slice(0,2).forEach(function(s){
      var c=document.createElement("span"); c.className="chip bad";
      var i=document.createElement("span"); i.className="i"; i.textContent="!"; c.appendChild(i);
      c.appendChild(document.createTextNode(s)); row.appendChild(c);
    });
  }
  function buildFactors(){
    var box=$("factors"); if(!box) return; while(box.firstChild) box.removeChild(box.firstChild);
    var bd=DATA.score.breakdown||{};
    Object.keys(FACTOR_LABELS).forEach(function(k){
      var meta=FACTOR_LABELS[k]; var v=bd[k]!=null?bd[k]:0; var w=Math.max(0,Math.min(1,v/meta.max));
      var row=document.createElement("div"); row.className="fct";
      var l=document.createElement("div"); l.className="fl"; l.textContent=meta[LANG]; row.appendChild(l);
      var tr=document.createElement("div"); tr.className="ftrack";
      var fl=document.createElement("div"); fl.className="ffill";
      fl.style.background = k==="sargassum" ? "linear-gradient(90deg,#22C55E,#5FD3C9)" : "linear-gradient(90deg,#FFC72C,#E8A800)";
      fl.setAttribute("data-w", w.toFixed(3));
      if(REDUCE) fl.style.setProperty("--rmw", w.toFixed(3));
      tr.appendChild(fl); row.appendChild(tr);
      var vv=document.createElement("div"); vv.className="fv"; vv.textContent="+"+v; row.appendChild(vv);
      box.appendChild(row);
    });
  }
  function buildForecast(){
    var strip=$("fcStrip"); if(!strip) return; while(strip.firstChild) strip.removeChild(strip.firstChild);
    var maxA = Math.max.apply(null, DATA.forecast.map(function(f){ return f.afai||0; }).concat([0.2]));
    DATA.forecast.slice(0,7).forEach(function(f,i){
      var col = stKey(f.status)==="avoid" ? "#E8522A" : stKey(f.status)==="moderate" ? "#E8B23A" : "#22C55E";
      var h = Math.max(0.08, Math.min(1, ((f.afai||0)/maxA)*0.6 + (stKey(f.status)==="clean"?0.18:stKey(f.status)==="moderate"?0.5:0.85)*0.4));
      var day=document.createElement("div"); day.className="fcday"+(i>=2?" locked":"")+(i===0?" cursor":"");
      day.setAttribute("data-idx",i);
      var bb=document.createElement("div"); bb.className="fcbarbox";
      var bar=document.createElement("div"); bar.className="fbar"; bar.style.background=col;
      bar.setAttribute("data-h",h.toFixed(3));
      if(REDUCE) bar.style.setProperty("--rmh", h.toFixed(3));
      bb.appendChild(bar); day.appendChild(bb);
      var lab=document.createElement("div"); lab.className="fcl"; lab.textContent=f.day||("J"+i); day.appendChild(lab);
      strip.appendChild(day);
    });
  }
  function buildPlanB(){
    var row=$("planbRow"); if(!row) return; while(row.firstChild) row.removeChild(row.firstChild);
    DATA.nearby.slice(0,3).forEach(function(b,i){
      var sk=stKey(b.status);
      var card=document.createElement("div"); card.className="pbcard"; card.setAttribute("data-idx",i);
      var th=document.createElement("div"); th.className="pbthumb";
      th.appendChild(miniBeachScene(b)); card.appendChild(th);
      var pn=document.createElement("div"); pn.className="pn"; pn.textContent=(LANG==="fr"?b.name:beachNoArticle(b.name)); card.appendChild(pn);
      var ps=document.createElement("div"); ps.className="ps "+(sk==="avoid"?"st-avoid":sk==="moderate"?"st-mod":"st-clean");
      var d=document.createElement("span"); d.className="d"; ps.appendChild(d);
      ps.appendChild(document.createTextNode(STATUS_WORD[sk][LANG])); card.appendChild(ps);
      var pf=document.createElement("div"); pf.className="pf";
      pf.textContent="score "+(b.score!=null?b.score:"—")+(b.drive!=null?" · "+b.drive+" min":"");
      card.appendChild(pf);
      row.appendChild(card);
    });
  }
  function miniBeachScene(b){
    var s=mulberry(seedFrom(b.id||b.name||"x"));
    var sk=stKey(b.status);
    var sea = sk==="avoid"?"#2c3b1a" : sk==="moderate"?"#19453d" : "#1A5852";
    var svg=svgEl("svg",{viewBox:"0 0 200 64",preserveAspectRatio:"xMidYMid slice"});
    svg.appendChild(svgEl("rect",{x:0,y:0,width:200,height:30,fill:"#155A5A"}));
    svg.appendChild(svgEl("rect",{x:0,y:0,width:200,height:30,fill:"url(#warmG)"}));
    svg.appendChild(svgEl("circle",{cx:130+ (s()*30)|0,cy:14,r:9,fill:"#FFD884",opacity:".7"}));
    svg.appendChild(svgEl("rect",{x:0,y:28,width:200,height:24,fill:sea}));
    var rx=(40+s()*120)|0;
    svg.appendChild(svgEl("path",{d:"M"+(rx-22)+" 30 Q"+rx+" 14 "+(rx+22)+" 30 Z",fill:"#16242A",opacity:".8"}));
    if(sk==="clean"){ svg.appendChild(svgEl("circle",{cx:90,cy:40,r:3,fill:"#0D2B26"})); svg.appendChild(svgEl("circle",{cx:120,cy:44,r:2.4,fill:"#0D2B26"})); }
    else if(sk==="moderate"){ svg.appendChild(svgEl("ellipse",{cx:96,cy:42,rx:12,ry:3.4,fill:"#7a5c14",opacity:".8"})); }
    else { svg.appendChild(svgEl("ellipse",{cx:80,cy:42,rx:16,ry:4,fill:"#5d400e"})); svg.appendChild(svgEl("ellipse",{cx:130,cy:46,rx:13,ry:3.4,fill:"#6b4a12"})); }
    svg.appendChild(svgEl("path",{d:"M0 50 Q100 44 200 52 L200 64 L0 64 Z",fill:"#1C1712"}));
    return svg;
  }
  function buildZoneLinks(){
    var z=$("zoneLinks"); if(!z) return; while(z.firstChild) z.removeChild(z.firstChild);
    var items=[];
    if(DATA.beach.commune) items.push(_t("Toute la commune : "+DATA.beach.commune, DATA.beach.commune+" beaches", "Playas de "+DATA.beach.commune));
    items.push(_t("Toutes les plages — "+REGION_NAME, "All "+REGION_NAME+" beaches", "Todas las playas — "+REGION_NAME));
    items.forEach(function(label){
      var a=document.createElement("a"); a.href="#"; a.setAttribute("data-zone","1");
      a.appendChild(document.createTextNode(label+" "));
      var ar=document.createElement("span"); ar.className="ar"; ar.textContent="→"; a.appendChild(ar);
      z.appendChild(a);
    });
  }
  function buildBreadcrumb(){
    var b=$("breadcrumb"); if(!b) return; while(b.firstChild) b.removeChild(b.firstChild);
    var parts=[ {t:REGION_NAME, href:"#"} ];
    if(DATA.beach.commune) parts.push({t:DATA.beach.commune, href:"#"});
    parts.push({t:beachName(), href:null});
    parts.forEach(function(p,i){
      if(i>0){ var sep=document.createElement("span"); sep.className="sep"; sep.textContent="›"; b.appendChild(sep); }
      if(p.href){ var a=document.createElement("a"); a.href=p.href; a.textContent=p.t; b.appendChild(a); }
      else b.appendChild(document.createTextNode(p.t));
    });
  }

  function applyCopy(){
    if($("backTxt")) $("backTxt").textContent=T.back[LANG];
    if($("freshTxt")) $("freshTxt").textContent=freshLabel();
    if($("scrollLab")) $("scrollLab").textContent=T.scrollLab[LANG];
    if($("touchHintTxt")) $("touchHintTxt").textContent=T.touchHint[LANG];

    setEyebrow0(); setVerbalVerdict();
    if($("s0")) $("s0").textContent=T.s0[LANG];
    if($("ctaArriveT")) $("ctaArriveT").textContent=T.ctaArriveT[LANG];
    if($("ctaArriveS")) $("ctaArriveS").textContent=T.ctaArriveS[LANG];
    if($("spStatus")){ $("spStatus").textContent=STATUS_WORD[STATUS][LANG]; $("spStatus").style.color=STCOL; }
    var sp=$("statusPill"); if(sp){ var pd=sp.querySelector(".pd"); if(pd) pd.style.background=STCOL; }
    if($("spFresh")) $("spFresh").textContent="· "+freshLabel();

    if($("eb1")) $("eb1").textContent=T.eb1[LANG]; setHeading($("h1"),T.h1[LANG]); if($("s1")) $("s1").textContent=T.s1[LANG];
    if($("scoreLab")) $("scoreLab").textContent="/100";
    if($("ctaVerdictT")) $("ctaVerdictT").textContent=T.ctaVerdictT[LANG];
    buildChips();
    if($("scoreArc")) $("scoreArc").style.stroke = SCORE>=70?"var(--green)":SCORE>=40?"var(--goldL)":"var(--coral)";

    if($("eb2")) $("eb2").textContent=T.eb2[LANG];
    setHeading($("m2aH"),T.m2aH[LANG]);
    if($("m2aS")) $("m2aS").textContent=_t(
      "Copernicus passe 4 fois par jour. On lit l'indice AFAI ("+(DATA.forecast[0].afai)+") au large de "+beachName()+".",
      "Copernicus passes 4 times a day. We read the AFAI index ("+(DATA.forecast[0].afai)+") off "+beachName()+".",
      "Copernicus pasa 4 veces al día. Leemos el índice AFAI ("+(DATA.forecast[0].afai)+") frente a "+beachName()+".");
    setHeading($("m2bH"),T.m2bH[LANG]);
    buildFactors();
    setHeading($("m2cH"),T.m2cH[LANG]);
    if($("regimeT")) $("regimeT").textContent=T.regimeT[LANG];
    if($("regimePct")) $("regimePct").textContent=DATA.reliability.calm+"%";
    if($("regimePctL")) $("regimePctL").textContent=T.regimePctL[LANG];
    if($("regimeS")) $("regimeS").textContent=_t(
      "En saison calme, nos verdicts sont justes "+DATA.reliability.calm+"% du temps ("+DATA.reliability.sample+" mesures vérifiées).",
      "In calm season our verdicts are right "+DATA.reliability.calm+"% of the time ("+DATA.reliability.sample+" verified readings).",
      "En temporada calma acertamos el "+DATA.reliability.calm+"% ("+DATA.reliability.sample+" mediciones verificadas).");
    if($("regimeMore")) $("regimeMore").textContent=T.regimeMore[LANG];
    if($("ctaMethodeT")) $("ctaMethodeT").textContent=T.ctaMethodeT[LANG];

    if($("eb3")) $("eb3").textContent=T.eb3[LANG]; setHeading($("h3"),T.h3[LANG]); if($("s3")) $("s3").textContent=T.s3[LANG];
    buildForecast();
    if($("fcLockTxt")) $("fcLockTxt").textContent=T.fcLockTxt[LANG];
    if($("ctaForecastT")) $("ctaForecastT").textContent=T.ctaForecastT[LANG];

    if($("eb4")) $("eb4").textContent=T.eb4[LANG]; setHeading($("h4"),T.h4[LANG]); if($("s4")) $("s4").textContent=T.s4[LANG];
    buildPlanB();
    var h2s = STATUS==="avoid" ? {lvl:_t("H₂S MODÉRÉ","H₂S MODERATE","H₂S MODERADO"),col:"#E8522A",txt:_t("Amas en décomposition : évite si tu es sensible (asthme, nourrisson).","Decomposing piles: avoid if sensitive (asthma, infants).","Montones en descomposición: evita si eres sensible.")}
              : STATUS==="moderate" ? {lvl:_t("H₂S FAIBLE","H₂S LOW","H₂S BAJO"),col:"#E8A800",txt:_t("Odeur possible en bord d'eau l'après-midi.","Possible smell at the shoreline in the afternoon.","Posible olor en la orilla por la tarde.")}
              : {lvl:_t("H₂S NUL","H₂S NONE","H₂S NULO"),col:"#22C55E",txt:_t("Aucun amas en décomposition détecté.","No decomposing piles detected.","Ningún montón en descomposición.")};
    if($("h2sLvl")){ $("h2sLvl").textContent=h2s.lvl; $("h2sLvl").style.color=h2s.col; }
    if($("h2sBadge")) $("h2sBadge").style.borderColor="rgba(255,255,255,.12)";
    if($("h2sTxt")) $("h2sTxt").textContent=h2s.txt;
    var hm=$("h2sMark"); if(hm){ var hc=hm.querySelector("circle"); if(hc) hc.setAttribute("stroke",h2s.col); var ht=hm.querySelector("text"); if(ht) ht.setAttribute("fill",h2s.col); }
    if($("h2sDisc")) $("h2sDisc").textContent=_t("Indice dérivé de la sargasse accumulée et de sa décomposition — pas une mesure de gaz, aucun capteur sur place. Suis les consignes ARS/HCSP.","Index derived from accumulated seaweed and its decomposition — not a gas measurement, no on-site sensor. Always follow public-health guidance.","Índice derivado del sargazo acumulado y su descomposición — no es una medición de gas, sin sensor en sitio. Sigue las indicaciones sanitarias.");
    if($("ctaH2ST")) $("ctaH2ST").textContent=_t("Préviens-moi avant le prochain pic d'odeur","Warn me before the next odour peak","Avísame antes del próximo pico de olor");
    if($("ctaH2SS")) $("ctaH2SS").textContent=_t("Alerte santé Premium — la veille, sur TA plage","Premium health alert — the day before, on YOUR beach","Alerta de salud Premium — la víspera, en TU playa");

    if($("eb5")) $("eb5").textContent=T.eb5[LANG]; setHeading($("h5"),T.h5[LANG]);
    if($("socialB")) $("socialB").textContent=T.socialB[LANG]; if($("socialS")) $("socialS").textContent=T.socialS[LANG];
    buildZoneLinks(); buildBreadcrumb();
    if($("footCredit")) $("footCredit").textContent=T.footCredit[LANG];
    if($("ctaFooterT")) $("ctaFooterT").textContent=T.ctaFooterT[LANG];
    if($("reassure")) $("reassure").textContent=T.reassure[LANG];

    buildNearbyHalos();
  }

  /* ====================================================================
     LE VEILLEUR v2 — moteur (porté de proto-home-az / veilleur-clip-v2).
     ⚠️ vars CSS sur l'HÔTE (shadow :host), pas document.documentElement.
     ==================================================================== */
  var gPose=$("gPose"), gLife=$("gLife"), gIris=$("gIris"),
      iris=$("iris"), irisTint=$("irisTint"), pupil=$("pupil"),
      catchB=$("catchB"), lidTop=$("lidTop"), lidBot=$("lidBot"),
      brow=$("brow"), halo=$("halo"), beamG=$("beamG"), beam=$("beam"),
      scanRing=$("scanRing"), ant=$("ant"), rootStyle=HOST.style;
  var WIDE = window.matchMedia && window.matchMedia("(min-width:680px)").matches;
  var EYE_BASE = WIDE ? 172 : 198;
  var EYE = {x:400, y:EYE_BASE+5.2};

  function lerp(a,b,t){ return a+(b-a)*t; }
  function clamp(v,a,b){ return v<a?a : v>b?b : v; }
  function easeInOut(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
  function smooth(t){ return t*t*(3-2*t); }
  function rand(a,b){ return a+Math.random()*(b-a); }
  function hx(c){ c=c.replace('#',''); return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)]; }
  function mix(a,b,t){ var A=hx(a),B=hx(b); return 'rgb('+Math.round(lerp(A[0],B[0],t))+','+Math.round(lerp(A[1],B[1],t))+','+Math.round(lerp(A[2],B[2],t))+')'; }
  var scene=$("scene");
  function toVB(clientX,clientY){
    var r=scene.getBoundingClientRect(), sc=Math.max(r.width/800,r.height/600);
    var dw=800*sc,dh=600*sc, ox=(r.width-dw)/2, oy=(r.height-dh)/2;
    return {x:(clientX-r.left-ox)/sc, y:(clientY-r.top-oy)/sc};
  }
  function getCss(name){ var v=getComputedStyle(HOST).getPropertyValue(name).trim(); return v||'#1FB6A6'; }
  function toHex(c){ c=c.trim(); if(c[0]==='#') return c.length===4?'#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:c;
    var m=c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(m){ return '#'+([1,2,3].map(function(i){return ('0'+parseInt(m[i]).toString(16)).slice(-2);}).join('')); } return '#1FB6A6'; }
  function mixCss(curr,target,t){ return mix(toHex(curr), toHex(target), t); }

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
  function lookAtVB(x,y){ gtx=clamp(x,40,760); gty=clamp(y,330,560); lookUntil=performance.now()+1400; lastInput=performance.now(); wake(); }
  function lookAt(el){ var rb=el.getBoundingClientRect(); var c=toVB(rb.left+rb.width/2, rb.top+rb.height/2); lookAtVB(c.x,c.y); }

  /* ====================================================================
     MOTEUR SCROLL — scroll dans l'HÔTE (overlay), vars CSS sur l'hôte.
     ==================================================================== */
  var spans=[$("sp0"),$("sp1"),$("sp2"),$("sp3"),$("sp4"),$("sp5")];
  var copies=[$("bc0"),$("bc1"),$("bc2"),$("bc3"),$("bc4"),$("bc5")];
  var cam=$("cam"), vp=$("viewport");
  var fired={}; var revealed={};
  var DOLLY=[
    {s:1.00, y:0,   oy:"60%"},
    {s:1.10, y:-2,  oy:"58%"},
    {s:1.06, y:0,   oy:"50%"},
    {s:1.04, y:0,   oy:"54%"},
    {s:1.12, y:-2,  oy:"62%"},
    {s:1.00, y:0,   oy:"56%"}
  ];
  function stageMood(active){
    if(active===0) return STATUS==="avoid"?"alert" : STATUS==="moderate"?"scan" : "calm";
    if(active===1) return SCORE>=70?"calm":SCORE>=40?"scan":"alert";
    if(active===2) return "scan";
    if(active===3) return "scan";
    if(active===4) return STATUS==="avoid"?"alert":"calm";
    return "calm";
  }
  var fcCursor=-1, prog0=0;
  var SEA_TINT = {clean:"#1A5852", moderate:"#19453d", avoid:"#2c3b1a"};
  function applyForecastScrub(p){
    var visIdx = clamp(Math.floor(p*6+0.001),0,6);
    if(visIdx!==fcCursor){
      fcCursor=visIdx;
      var days=SR.querySelectorAll("#fcStrip .fcday");
      for(var i=0;i<days.length;i++) days[i].classList.toggle("cursor", i===visIdx);
      var f=DATA.forecast[visIdx]||DATA.forecast[DATA.forecast.length-1];
      if(f){
        rootStyle.setProperty("--seaTint", SEA_TINT[stKey(f.status)]);
        if(performance.now()-lastTap>2500) setMoodFromScore(stKey(f.status)==="avoid"?20:stKey(f.status)==="moderate"?55:85);
        var sunX = 540 - visIdx*64;
        if($("sunGroup")) $("sunGroup").setAttribute("transform","translate("+(sunX-540).toFixed(1)+","+(-prog0*26).toFixed(1)+")");
      }
    }
    /* ADAPTATION : pas d'auto-open premium au scrub (modal involontaire banni).
       Le premium part UNIQUEMENT via le CTA explicite « Débloquer les 7 jours ». */
  }
  function sizeScroller(){
    var total=0; for(var i=0;i<spans.length;i++){ if(spans[i]) total+=spans[i].offsetHeight; }
    var sc=$("scroller"); if(sc) sc.style.height=(total+HOST.clientHeight)+"px";
  }
  function computeScroll(){
    var scrollY=HOST.scrollTop;
    var prog=[0,0,0,0,0,0], acc=0;
    for(var i=0;i<spans.length;i++){ var h=spans[i]?spans[i].offsetHeight:1; prog[i]=clamp((scrollY-acc)/h,0,1); acc+=h; }
    for(var j=0;j<6;j++){ rootStyle.setProperty("--p"+j, smooth(prog[j]).toFixed(4)); }
    prog0=prog[0];
    var active=0;
    for(var k=0;k<6;k++){ if(prog[k]>0.001 && prog[k]<0.999){ active=k; } }
    for(var m=0;m<5;m++){ if(prog[m]>=0.999 && prog[m+1]<=0.001){ active=m+1; } }
    if(prog[5]>=0.999) active=5;
    var pa=prog[active];
    var hoStart=0.86;
    var handoff=(active<5 && pa>hoStart)? smooth((pa-hoStart)/(1-hoStart)) : 0;
    for(var n=0;n<6;n++){
      var e=0; if(n===active){ e=1-handoff; } else if(n===active+1){ e=handoff; }
      rootStyle.setProperty("--e"+n, e.toFixed(3));
      if(copies[n]) copies[n].classList.toggle("on", e>0.15);
    }
    var gp=(active+prog[active])/5;
    rootStyle.setProperty("--gp", clamp(gp,0,1).toFixed(4));
    rootStyle.setProperty("--hs", prog[0].toFixed(4));
    var a=DOLLY[active], b=DOLLY[Math.min(active+1,5)], t=smooth(prog[active]);
    var cs=a.s+(b.s-a.s)*t, cy2=a.y+(b.y-a.y)*t;
    if(cam){ cam.style.transformOrigin="50% "+(t<0.5?a.oy:b.oy);
      cam.style.transform="translateY(calc("+cy2.toFixed(3)+"% + var(--camOpenY))) scale(calc("+cs.toFixed(4)+" * var(--camOpenS)))"; }
    if(active!==3 && $("sunGroup")) $("sunGroup").setAttribute("transform","translate(0,"+(-prog[0]*26).toFixed(1)+")");
    handleMeasure(active, prog[2]);
    if(active===1 && prog[1]>0.12 && !revealed.score){ revealed.score=true; animScore(); }
    if(active===3){ if(!revealed.fc){ revealed.fc=true; raiseForecastBars(); } applyForecastScrub(prog[3]); }
    var nh=$("nearbyHalos");
    if(nh){
      if(active>=4 && prog[4]>0.12){ nh.classList.add("on"); if($("h2sAnchor")) $("h2sAnchor").style.opacity=(STATUS==="clean"?0.55:1).toFixed(2); }
      else { nh.classList.remove("on"); if($("h2sAnchor")) $("h2sAnchor").style.opacity="0"; }
    }
    if(active===4 && prog[4]>0.3 && !revealed.nhpulse){ revealed.nhpulse=true; pulseNearby(); }
    rootStyle.setProperty("--alert", (STATUS==="avoid" && active===0)? clamp((prog[0]-0.1),0,0.6).toFixed(3) : "0");
    if($("touchHint")) $("touchHint").classList.toggle("on", active===0 && prog[0]>0.25 && prog[0]<0.85 && !pointerActive);
    [["verdict",1],["measure",2],["forecast",3],["planb",4],["social",5]].forEach(function(s){
      if(active===s[1] && prog[s[1]]>0.2 && !fired[s[0]]){ fired[s[0]]=true; track("sg_page_view",{s:s[0],beach:DATA.beach.id,variant:"beach_dive"}); }
    });
    var want=stageMood(active);
    if(active!==3 && want!==curMoodName && (performance.now()-lastTap>2500)){ setMoodTarget(want); }
  }
  function handleMeasure(active, p2){
    if(active!==2){ return; }
    var sub = p2<0.34?0 : p2<0.68?1 : 2;
    var panels=[$("sub0"),$("sub1"),$("sub2")], dots=$("subDots")?$("subDots").children:[];
    for(var i=0;i<3;i++){ if(panels[i]) panels[i].classList.toggle("show", i===sub); if(dots[i]) dots[i].classList.toggle("on", i===sub); }
    if($("rasterGrain")) $("rasterGrain").style.opacity = sub===0 ? (0.06+0.06*Math.min(1,(p2/0.34))).toFixed(3) : "0";
    if(sub===0 && !revealed.scan){ revealed.scan=true; setMoodTarget("scan"); }
    if(sub===1 && !revealed.factors){ revealed.factors=true; raiseFactors(); }
    if(sub===2 && !revealed.regime){ revealed.regime=true; animRegime(); }
  }
  function raiseFactors(){
    var fills=SR.querySelectorAll("#factors .ffill");
    for(var i=0;i<fills.length;i++){ (function(el,d){ later(function(){ el.style.transform="scaleX("+(el.getAttribute("data-w"))+")"; }, d); })(fills[i], i*70); }
  }
  function animRegime(){
    var arc=$("regimeArc"); if(!arc) return; var C=251, pct=DATA.reliability.calm/100, t0=performance.now();
    (function step(){
      if(dead) return;
      var k=clamp((performance.now()-t0)/700,0,1), e=easeInOut(k);
      arc.setAttribute("stroke-dashoffset", (C*(1-pct*e)).toFixed(1));
      if(k<1) requestAnimationFrame(step);
    })();
  }
  function animScore(){
    var arc=$("scoreArc"), num=$("scoreNum"); if(!arc||!num) return; var C=264, pct=clamp(SCORE/100,0,1), t0=performance.now();
    (function step(){
      if(dead) return;
      var k=clamp((performance.now()-t0)/800,0,1), e=easeInOut(k);
      arc.setAttribute("stroke-dashoffset",(C*(1-pct*e)).toFixed(1));
      num.textContent=Math.round(SCORE*e);
      if(k<1) requestAnimationFrame(step);
    })();
  }
  function raiseForecastBars(){
    var bars=SR.querySelectorAll("#fcStrip .fbar");
    for(var i=0;i<bars.length;i++){ (function(el,d){ later(function(){ el.style.transform="scaleY("+(el.getAttribute("data-h"))+")"; }, d); })(bars[i], i*60); }
  }
  function pulseNearby(){
    var rings=SR.querySelectorAll("#nearbyHalos .nhpulse");
    for(var i=0;i<rings.length;i++){ (function(el,d){ later(function(){ el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); }, d); })(rings[i], i*180); }
  }

  /* ====================================================================
     INTERACTIONS — clics scène (PAS de setPointerCapture)
     ==================================================================== */
  function hit(target,sel){ return target.closest && target.closest(sel); }
  function pulseRing(cls){ var els=SR.querySelectorAll("."+cls); for(var i=0;i<els.length;i++){ (function(el){ el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); })(els[i]); } }
  function tapVeilleur(){
    pulseRing("ringV"); blinkNow(150);
    var order=['calm','scan','alert']; var idx=(order.indexOf(curMoodName)+1)%3; setMoodTarget(order[idx]);
    lastInput=performance.now(); lastTap=performance.now();
    track("sg_scene_tap",{el:"veilleur"});
    var g=$("gPose"); if(!g) return; var bb=g.getBoundingClientRect();
    showWhisper(T.whVeil[LANG], bb.left+bb.width/2, bb.top, function(){ openPremium("scene_veilleur"); });
  }
  function tapYole(){
    var y=$("yole"); if(!y) return;
    track("sg_scene_tap",{el:"yole"}); lookAt(y);
    var bb=y.getBoundingClientRect();
    showWhisper(T.whYole[LANG], bb.left+bb.width/2, bb.top, function(){ openPremium("scene_yole"); });
  }
  function tapNearby(idx){
    var b=DATA.nearby[idx]; if(!b) return;
    var rings=SR.querySelectorAll("#nearbyHalos .nhpulse");
    if(rings[idx]){ rings[idx].classList.remove("go"); void rings[idx].offsetWidth; rings[idx].classList.add("go"); }
    var p=NEARBY_POS[idx]; if(p) lookAtVB(p.x,p.y);
    track("sg_planb_pick",{from:DATA.beach.id, to:b.id, rank:idx, variant:"beach_dive"});
    onOpenBeachObj(b);
  }
  if(scene) on(scene,"click", function(evt){
    if(hit(evt.target,"#gPose")){ tapVeilleur(); return; }
    if(hit(evt.target,"#yole")){ tapYole(); return; }
    var nh=hit(evt.target,".nh");
    if(nh){ tapNearby(parseInt(nh.getAttribute("data-idx"),10)); return; }
    var c=toVB(evt.clientX, evt.clientY);
    if(c.y>=320 && c.y<=476){ lookAtVB(c.x,c.y); blinkNow(150); }
  }, {passive:true});

  function showWhisper(pair, px, py, onTap){
    var w=$("whGeneric"); if(!w||!vp) return;
    while(w.firstChild) w.removeChild(w.firstChild);
    w.appendChild(document.createTextNode(pair[0]+" "));
    if(pair[1]){ var ar=document.createElement("span"); ar.className="ar"; ar.textContent="→"; w.appendChild(ar);
      var sm=document.createElement("small"); sm.textContent=pair[1]; w.appendChild(sm); }
    var vpr=vp.getBoundingClientRect();
    w.style.left=clamp(px-vpr.left-120,12,vpr.width-252)+"px";
    w.style.top =clamp(py-vpr.top-90,70,vpr.height-130)+"px";
    w.classList.add("on");
    w.onclick=function(){ w.classList.remove("on"); if(onTap) onTap(); };
    clearTimeout(w._t); w._t=later(function(){ w.classList.remove("on"); },5200);
  }

  /* ====================================================================
     WIRING conversion (CTA + chrome + cards) — porte unique openPremium.
     ==================================================================== */
  function scrollNext(mult){ try{ HOST.scrollBy({top:HOST.clientHeight*(mult||1.05), behavior:"smooth"}); }catch(_){ HOST.scrollTop+=HOST.clientHeight; } }
  function wire(){
    if($("backBtn")) on($("backBtn"),"click", function(){ track("sg_scene_tap",{el:"back"}); onClose(); });
    if($("freshPill")) on($("freshPill"),"click", function(){ track("sg_scene_tap",{el:"fresh"}); });
    if($("statusPill")) on($("statusPill"),"click", function(){ track("sg_scene_tap",{el:"statuspill"}); });
    if($("ctaArrive")) on($("ctaArrive"),"click", function(){ track("sg_cta",{src:"arrive",variant:"beach_dive"}); scrollNext(1.05); });
    if($("scoreBlob")) on($("scoreBlob"),"click", function(){ track("sg_scene_tap",{el:"scoreblob"}); });
    if($("ctaVerdict")) on($("ctaVerdict"),"click", function(){ scrollNext(1.1); });
    if($("regimeBox")) on($("regimeBox"),"click", function(){ track("sg_nav",{to:"/fiabilite/",variant:"beach_dive"}); });
    if($("ctaMethode")) on($("ctaMethode"),"click", function(){ scrollNext(1.1); });
    if($("ctaForecast")) on($("ctaForecast"),"click", function(){ openPremium("forecast_lock"); });
    if($("ctaH2S")) on($("ctaH2S"),"click", function(){ openPremium("h2s_health_alert"); });
    if($("ctaFooter")) on($("ctaFooter"),"click", function(){ openPremium("beach_dive_footer"); });
    if($("socialBox")) on($("socialBox"),"click", function(){ openPremium("social_proof"); });
    var cards=SR.querySelectorAll("#planbRow .pbcard");
    for(var i=0;i<cards.length;i++){ (function(c){ on(c,"click", function(){ tapNearby(parseInt(c.getAttribute("data-idx"),10)); }); })(cards[i]); }
    var zl=$("zoneLinks"); if(zl){ var as=zl.querySelectorAll("a");
      for(var z=0;z<as.length;z++){ on(as[z],"click", function(e){ e.preventDefault(); track("sg_nav",{to:"zone",variant:"beach_dive"}); onShowMap(); }); } }
    if($("breadcrumb")) on($("breadcrumb"),"click", function(e){ if(e.target.tagName==="A"){ e.preventDefault(); track("sg_nav",{to:"breadcrumb"}); onShowMap(); } });
  }

  /* boutons langue (pilotent la copie locale ; sync app via hook optionnel) */
  var langBtns=SR.querySelectorAll(".langs button");
  for(var li=0;li<langBtns.length;li++){ (function(btn){
    on(btn,"click", function(){
      LANG=btn.getAttribute("data-lang");
      for(var k=0;k<langBtns.length;k++){ langBtns[k].setAttribute("aria-pressed", langBtns[k]===btn?"true":"false"); }
      applyCopy(); wire();
      if(revealed.score && $("scoreNum") && $("scoreArc")){ $("scoreNum").textContent=SCORE; $("scoreArc").setAttribute("stroke-dashoffset",(264*(1-SCORE/100)).toFixed(1)); }
      if(revealed.factors) raiseFactors();
      if(revealed.fc) raiseForecastBars();
      if(H.onLang) try{H.onLang(LANG);}catch(e){}
    });
  })(langBtns[li]); }

  /* pointeur (desktop) : le Veilleur suit le regard, retour MER */
  on(window,"pointermove", function(e){
    if(e.pointerType==="touch") return;
    var p=toVB(e.clientX, e.clientY);
    gtx=p.x; gty=p.y; pointerActive=true; lastInput=performance.now(); lookUntil=0; wake();
  }, {passive:true});

  /* setup scène + premier état */
  buildRelief(); buildState();
  applyCopy(); wire();
  track("sg_page_shown", {beach:DATA.beach.id, name:DATA.beach.name, score:SCORE, status:STATUS, variant:"beach_dive"});

  /* ====================================================================
     REDUCED-MOTION = PLANCHER DUR : tableau calme figé, tout cliquable.
     ==================================================================== */
  if(REDUCE){
    rootStyle.setProperty("--p0","1");
    if($("sunGroup")) $("sunGroup").setAttribute("transform","translate(0,-26)");
    rootStyle.setProperty("--seaTint", SEA_TINT[STATUS]);
    M=clone(MOODS.calm); MT=clone(MOODS.calm); curMoodName='calm';
    setMoodFromScore(SCORE); M=clone(MOODS[curMoodName]);
    rootStyle.setProperty('--mood',M.mood); rootStyle.setProperty('--moodHalo',M.halo); rootStyle.setProperty('--moodDot',M.dot);
    if(iris) iris.setAttribute('r',M.irisR); if(irisTint) irisTint.setAttribute('r',M.irisR); if(pupil) pupil.setAttribute('r',(M.irisR*0.42).toFixed(2));
    setLids(0);
    if(brow) brow.setAttribute('d','M-15 -19 Q0 '+(-25+M.browLift)+' 15 -19');
    if(halo) halo.setAttribute('opacity','.5'); if(beam) beam.setAttribute('opacity','0'); if(scanRing) scanRing.setAttribute('opacity','0');
    if(gIris) gIris.setAttribute('transform','translate(0 1.5)');
    if(gPose) gPose.setAttribute('transform','translate('+EYE.x+' '+(EYE_BASE+M.lift)+') rotate('+M.pose+')');
    if($("scoreNum")) $("scoreNum").textContent=SCORE; if($("scoreArc")) $("scoreArc").setAttribute("stroke-dashoffset",(264*(1-SCORE/100)).toFixed(1));
    if($("regimeArc")) $("regimeArc").setAttribute("stroke-dashoffset",(251*(1-DATA.reliability.calm/100)).toFixed(1));
    if($("rasterGrain")) $("rasterGrain").style.opacity=".08";
    if($("nearbyHalos")) $("nearbyHalos").classList.add("on"); if($("h2sAnchor")) $("h2sAnchor").style.opacity=(STATUS==="clean"?0.55:1).toFixed(2);
    return { teardown:teardown, update:update, setLang:setLang };
  }

  /* ====================================================================
     rAF UNIQUE — demand-driven, pause visibilitychange (batterie).
     ==================================================================== */
  var running=false, paused=false, needScroll=true;
  var IDLE_MS=2600, t0=performance.now(), introDone=false;
  function nowt(){ return performance.now(); }
  function introProgress(){ return clamp((nowt()-t0)/3400,0,1); }
  function wake(){ if(dead||running||paused) return; running=true; rafId=requestAnimationFrame(loop); }

  on(HOST,"scroll", function(){ needScroll=true; lastInput=nowt(); wake(); }, {passive:true});
  on(window,"resize", function(){ sizeScroller(); needScroll=true; wake(); }, {passive:true});
  on(document,"visibilitychange", function(){ paused=document.hidden; if(!paused){ needScroll=true; lastInput=nowt(); wake(); } });

  function loop(){
    if(dead){ running=false; return; }
    if(paused){ running=false; return; }
    var t=nowt(), work=false;
    var active=(t-lastInput<IDLE_MS) || !introDone;
    if(needScroll){ computeScroll(); needScroll=false; work=true; }

    var ms=.045, moodConverged=Math.abs(M.irisR-MT.irisR)<0.06;
    if(!moodConverged){
      M.irisR=lerp(M.irisR,MT.irisR,ms); M.pose=lerp(M.pose,MT.pose,ms); M.lift=lerp(M.lift,MT.lift,ms);
      M.browLift=lerp(M.browLift,MT.browLift,ms); M.lidTop=lerp(M.lidTop,MT.lidTop,ms);
      M.lidBot=lerp(M.lidBot,MT.lidBot,ms); M.beam=lerp(M.beam,MT.beam,ms);
      rootStyle.setProperty('--mood', mixCss(getCss('--mood'),MT.mood,ms));
      rootStyle.setProperty('--moodHalo', mixCss(getCss('--moodHalo'),MT.halo,ms));
      rootStyle.setProperty('--moodDot', mixCss(getCss('--moodDot'),MT.dot,ms));
      work=true;
    } else {
      M.irisR=MT.irisR; M.pose=MT.pose; M.lift=MT.lift; M.browLift=MT.browLift;
      M.lidTop=MT.lidTop; M.lidBot=MT.lidBot; M.beam=MT.beam;
      rootStyle.setProperty('--mood',MT.mood); rootStyle.setProperty('--moodHalo',MT.halo); rootStyle.setProperty('--moodDot',MT.dot);
    }
    if(iris) iris.setAttribute('r',M.irisR.toFixed(2)); if(irisTint) irisTint.setAttribute('r',M.irisR.toFixed(2)); if(pupil) pupil.setAttribute('r',(M.irisR*0.42).toFixed(2));

    if(pointerActive && t-lastInput<1100){ /* suit le curseur */ }
    else if(t>lookUntil){ gtx=lerp(gtx,SEA.x,.02); gty=lerp(gty,SEA.y,.02); if(Math.abs(gtx-SEA.x)>0.4||Math.abs(gty-SEA.y)>0.4) work=true; }
    else { work=true; }
    gcx=lerp(gcx,gtx,.08); gcy=lerp(gcy,gty,.08);
    if(Math.abs(gcx-gtx)>0.15||Math.abs(gcy-gty)>0.15) work=true;
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
    if(halo) halo.setAttribute('opacity', active?(0.42+0.12*Math.sin(t/3300)+0.05).toFixed(3):'0.50');

    var introT=introProgress(), beamOn=M.beam, sweep=0, sweepOp=0;
    if(introT<1 && !introDone){ if(introT>0.32){ var s=clamp((introT-0.32)/0.68,0,1); sweep=(-14+26*easeInOut(s)); sweepOp=Math.sin(s*Math.PI)*0.9; } work=true; }
    else { introDone=true; }
    var ang=Math.atan2(gcy-EYE.y,gcx-EYE.x)*180/Math.PI-90; ang=clamp(ang,-26,26);
    if(!introDone) ang=sweep;
    if(beamG) beamG.setAttribute('transform','translate('+EYE.x+' '+EYE.y+') rotate('+ang.toFixed(2)+')');
    var bOp=introDone?beamOn*0.85:Math.max(sweepOp,beamOn*0.85);
    if(beam) beam.setAttribute('opacity',bOp.toFixed(3));
    var hitX=EYE.x+Math.tan(clamp(ang,-26,26)*Math.PI/180)*(362-EYE.y);
    if(scanRing){ scanRing.setAttribute('cx',clamp(hitX,40,760)); scanRing.setAttribute('opacity',(bOp*0.6).toFixed(3)); scanRing.setAttribute('ry',(8+2*Math.abs(Math.sin(t/1700))*beamOn).toFixed(2)); }
    if(beamOn>0.05 && active) work=true;
    if(ant) ant.setAttribute('opacity', beamOn>0.4?(0.8+0.2*Math.abs(Math.sin(t/1700))).toFixed(2):'1');

    if(work && !paused && !dead){ rafId=requestAnimationFrame(loop); } else { running=false; }
  }

  /* premier paint + micro-tween d'ouverture (« plongée ») */
  setMoodFromScore(SCORE); M=clone(MOODS[curMoodName]);
  rootStyle.setProperty('--mood',M.mood); rootStyle.setProperty('--moodHalo',M.halo); rootStyle.setProperty('--moodDot',M.dot);
  if(iris) iris.setAttribute('r',M.irisR); if(irisTint) irisTint.setAttribute('r',M.irisR); if(pupil) pupil.setAttribute('r',(M.irisR*0.42).toFixed(2));
  setLids(0);
  rootStyle.setProperty("--seaTint", SEA_TINT[STATUS]);
  if(gPose) gPose.setAttribute('transform','translate('+EYE.x+' '+EYE_BASE+') rotate(0)');
  sizeScroller(); computeScroll(); needScroll=false; lastInput=nowt();
  (function openTween(){
    rootStyle.setProperty("--camOpenS","1.06");
    rootStyle.setProperty("--camOpenY","-1.4%");
    if(cam) cam.style.transition="none";
    requestAnimationFrame(function(){
      if(dead||!cam) return;
      cam.style.transition="transform 1.0s cubic-bezier(.34,1.4,.64,1)";
      rootStyle.setProperty("--camOpenS","1");
      rootStyle.setProperty("--camOpenY","0");
      later(function(){ if(cam) cam.style.transition="transform .5s cubic-bezier(.34,1.4,.64,1)"; }, 1050);
    });
  })();
  wake();

  /* ---- API exposée au composant ---- */
  function update(newData){
    DATA=normData(Object.assign({}, DATA, newData||{}));
    REGION_NAME = (newData&&newData.regionName) || REGION_NAME;
    recomputeStatus();
    revealed={}; fcCursor=-1;
    buildRelief(); buildState();
    applyCopy(); wire();
    setMoodFromScore(SCORE);
    needScroll=true; lastInput=nowt(); wake();
  }
  function setLang(l){
    if(!l || l===LANG) return;
    LANG=l;
    for(var k=0;k<langBtns.length;k++){ langBtns[k].setAttribute("aria-pressed", langBtns[k].getAttribute("data-lang")===l?"true":"false"); }
    applyCopy(); wire(); wake();
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
   Props : beach, lang, island, regionName, sargData, userPos, allBeaches,
   onClose, onPremium, onOpenBeach, onShowMap, track.
   ==================================================================== */
const ST_MAP={clean:"clean",moderate:"moderate",avoid:"avoid"};
function haversineKm(a,b,c,d){var R=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p,
  s=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
const DAY_FR=["DIM","LUN","MAR","MER","JEU","VEN","SAM"];

export default function BeachDive(props){
  const {beach,lang,island,regionName,sargData,userPos,allBeaches,forecast,onClose,onPremium,onOpenBeach,onShowMap,onFail,track,exiting}=props;
  const hostRef=useRef(null);
  const engRef=useRef(null);
  const cbRef=useRef({});
  cbRef.current={onClose,onPremium,onOpenBeach,onShowMap,onFail,track};

  function regionLabel(){
    if(regionName) return regionName;
    if(island==="gp") return "Guadeloupe";
    if(island==="mq") return "Martinique";
    return regionName||"";
  }
  function dayLabel(i,dateStr){
    if(i===0) return lang==="en"?"Today":lang==="es"?"Hoy":"Auj.";
    if(i===1) return lang==="en"?"Tom.":lang==="es"?"Mañ.":"Dem.";
    try{ if(dateStr){ const d=new Date(dateStr); if(!isNaN(d)) return DAY_FR[d.getDay()]; } }catch(_){}
    return "J"+i;
  }
  function buildNearby(){
    if(!beach||!Array.isArray(allBeaches)) return [];
    const geo=!!(userPos&&beach.lat);
    let pool=allBeaches.filter(b=>b.id!==beach.id&&b.island===beach.island&&b.lat&&b.lng);
    let clean=pool.filter(b=>b.status==="clean");
    let mod=pool.filter(b=>b.status==="moderate");
    function dist(b){ return geo?haversineKm(userPos.lat,userPos.lng,b.lat,b.lng):null; }
    function rank(list){ return list.map(b=>({b,d:dist(b)})).sort((x,y)=> geo?(x.d-y.d):((y.b.score||0)-(x.b.score||0))); }
    let picked=rank(clean).slice(0,3).map(x=>x);
    if(picked.length<3) picked=picked.concat(rank(mod).slice(0,3-picked.length));
    return picked.slice(0,3).map(({b,d})=>({
      id:b.id, name:b.name, commune:b.commune, status:b.status, score:b.score, afai:b.afai,
      lat:b.lat, lng:b.lng, drive:(d!=null?Math.max(5,Math.round(d*1.6)):(typeof b.drive==="number"?b.drive:null))
    }));
  }
  function buildForecast(){
    /* PRIORITÉ : forecast résolu par le monolithe (BEACH_TO_SARG / interp /
       community override). Fallbacks défensifs si non fourni (deep-link froid). */
    let fc=Array.isArray(forecast)&&forecast.length?forecast:null;
    if(!fc){ try{ fc=(sargData&&sargData.weekly&&beach&&(sargData.weekly[beach.id]&&sargData.weekly[beach.id].forecast))||null; }catch(_){} }
    if(!fc&&beach&&beach.forecast) fc=beach.forecast;
    if(!Array.isArray(fc)||!fc.length){
      fc=[{afai:beach&&beach.afai!=null?beach.afai:0.05, status:beach&&beach.status||"clean", confidence:60}];
    }
    return fc.slice(0,7).map((f,i)=>({
      day:dayLabel(i,f.date), date:f.date, afai:f.afai!=null?f.afai:0,
      status:f.status||"clean", confidence:f.confidence!=null?f.confidence:50,
      type:f.type, regime:f.regime, sources:f.sources
    }));
  }
  function buildData(){
    const b=beach||{};
    return {
      beach:{ id:b.id||"beach", name:b.name||"Plage", commune:b.commune||"", island:b.island,
        status:ST_MAP[b.status]||"clean", score:b.score!=null?b.score:70, afai:b.afai!=null?b.afai:0.05,
        lat:b.lat, lng:b.lng, h2s:b.h2s },
      score:{ score:b.score!=null?b.score:70, breakdown:b.scoreBreakdown||{},
        strengths:b.scoreStrengths||[], weaknesses:b.scoreWeaknesses||[] },
      forecast:buildForecast(),
      nearby:buildNearby(),
      reliability:{calm:79, peak:76, sample:412},
      updatedAt:(sargData&&(sargData.updatedAt||sargData.erddapTimestamp))||null,
      regionName:regionLabel()
    };
  }

  /* montage UNIQUE : shadow + moteur (markup trusté = constante build-time) */
  useEffect(()=>{
    const host=hostRef.current; if(!host) return;
    const SR = host.shadowRoot || host.attachShadow({mode:"open"});
    while(SR.firstChild) SR.removeChild(SR.firstChild);
    const styleEl=document.createElement("style"); styleEl.textContent=BEACH_DIVE_CSS; SR.appendChild(styleEl);
    SR.appendChild(document.createRange().createContextualFragment(BEACH_DIVE_MARKUP));
    const hooks={
      track:(n,p)=>{ try{ cbRef.current.track && cbRef.current.track(n,p); }catch(e){} },
      openPremium:(s)=>{ cbRef.current.onPremium && cbRef.current.onPremium(s); },
      onClose:()=>{ cbRef.current.onClose && cbRef.current.onClose(); },
      onShowMap:()=>{ cbRef.current.onShowMap ? cbRef.current.onShowMap() : (cbRef.current.onClose&&cbRef.current.onClose()); },
      onOpenBeach:(b)=>{ cbRef.current.onOpenBeach && cbRef.current.onOpenBeach(b); }
    };
    let eng=null;
    try{ eng=initBeachDive(SR, host, {data:buildData(), hooks, lang:lang||"fr", regionName:regionLabel()}); }
    catch(e){ if(typeof console!=="undefined") console.error("BeachDive init:",e); }
    engRef.current=eng;
    /* SÉCURITÉ : moteur KO → bascule sur la fiche classique (onFail), JAMAIS fermer vers "rien".
       Fallback historique = onClose si onFail absent (ancien comportement). */
    if(!eng){ try{ cbRef.current.onFail ? cbRef.current.onFail() : (cbRef.current.onClose && cbRef.current.onClose()); }catch(e){} }
    return ()=>{ try{ eng&&eng.teardown(); }catch(e){} engRef.current=null;
      try{ while(SR.firstChild) SR.removeChild(SR.firstChild); }catch(e){} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* sync données réelles (changement de plage = même overlay) */
  useEffect(()=>{ if(engRef.current) engRef.current.update(buildData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[beach&&beach.id, beach&&beach.score, beach&&beach.status, sargData&&(sargData.updatedAt||sargData.erddapTimestamp)]);

  /* sync langue */
  useEffect(()=>{ if(engRef.current) engRef.current.setLang(lang||"fr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[lang]);

  return React.createElement("div",{
    ref:hostRef, role:"dialog", "aria-label": beach&&beach.name ? beach.name : "Sargasses",
    style:{position:"absolute",inset:0,zIndex:1050,overflowY:"auto",overflowX:"hidden",
      forcedColorAdjust:"none",
      background:"#02060A", WebkitOverflowScrolling:"touch", overscrollBehavior:"contain",
      opacity:exiting?0:1, transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}
  });
}
