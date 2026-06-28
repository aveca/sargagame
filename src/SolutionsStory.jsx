import React,{useState}from"react"
import {_t,track,StoryEngine,miVeil,g,s,sgUnlock} from "./Sargasses_PROD"

function discoveryBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return[
    {eyebrow:T("LA SOURCE","THE SOURCE","EL ORIGEN"),heading:T("Une ceinture de 8000 km","An 8,000 km belt","Un cinturón de 8000 km"),sub:T("Chaque année, une nappe d'algues traverse l'Atlantique, de l'Afrique aux Caraïbes.","Every year a raft of seaweed crosses the Atlantic, from Africa to the Caribbean.","Cada año una masa de algas cruza el Atlántico, de África al Caribe."),
      scene:<><rect width="800" height="600" fill="#06211E"/><circle cx="400" cy="300" r="240" fill="#0A2E2A"/><circle cx="400" cy="300" r="240" fill="none" stroke="#1A5852" strokeWidth="2"/><path d="M170 380 Q400 300 630 360" fill="none" stroke="#7a5c14" strokeWidth="22" strokeLinecap="round" opacity=".85"/><path d="M170 380 Q400 300 630 360" fill="none" stroke="#a8862a" strokeWidth="8" strokeLinecap="round" strokeDasharray="4 14" opacity=".7"/><text x="246" y="372" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB">{T("Afrique","Africa","África")}</text><text x="560" y="348" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB">{T("Caraïbes","Caribbean","Caribe")}</text></>},
    {eyebrow:T("LA DÉRIVE","THE DRIFT","LA DERIVA"),heading:T("Le vent décide","The wind decides","El viento decide"),sub:T("Courants et alizés poussent les bancs vers certaines plages — pas toutes, pas en même temps.","Currents and trade winds push the rafts onto some beaches — not all, not at once.","Las corrientes y los vientos empujan los bancos a ciertas playas."),
      scene:<><rect width="800" height="600" fill="url(#bscSea)"/><rect width="800" height="600" fill="#0A2E2A"/>{[160,260,360].map((y,i)=>(<path key={i} d={`M-40 ${y} q60 -16 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0`} fill="none" stroke="#1A5852" strokeWidth="2" opacity=".5"/>))}<g><path d="M120 250 L520 250" stroke="#FFC72C" strokeWidth="2" strokeDasharray="6 8" opacity=".7"/><path d="M520 250 l-16 -8 0 16 Z" fill="#FFC72C"/></g><g transform="translate(150,250)"><ellipse rx="26" ry="9" fill="#7a5c14"/><ellipse cx="-12" cy="-4" rx="11" ry="5" fill="#8a6c1c"/></g><g transform="translate(560,420)"><path d="M-40 0 Q200 -30 430 0 L430 180 L-40 180 Z" fill="#1C1712"/></g></>},
    {eyebrow:T("LE RISQUE","THE RISK","EL RIESGO"),heading:T("En décomposition, ça pique","Rotting, it stings","Al descomponerse, irrita"),sub:T("Les algues échouées libèrent du H2S (odeur d'œuf). On surveille pour t'éviter ça.","Stranded seaweed releases H2S (egg smell). We watch so you avoid it.","Las algas varadas liberan H2S (olor a huevo). Vigilamos para evitártelo."),
      scene:<><rect width="800" height="600" fill="#0B2230"/><rect y="300" width="800" height="300" fill="#1C1712"/><g transform="translate(400,330)"><ellipse rx="180" ry="34" fill="#5d400e"/><ellipse cx="-90" cy="-12" rx="60" ry="20" fill="#7a5c14"/><ellipse cx="80" cy="-10" rx="70" ry="22" fill="#6b4a12"/></g><g fill="#E8522A" opacity=".55"><circle cx="330" cy="280" r="4"/><circle cx="360" cy="250" r="3"/><circle cx="430" cy="262" r="3.5"/><circle cx="470" cy="238" r="2.6"/></g><text x="400" y="250" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="20" fill="#E8522A">H₂S</text></>},
    {eyebrow:T("LES SOLUTIONS","THE SOLUTIONS","LAS SOLUCIONES"),heading:T("Barrer, récolter, recycler","Block, collect, recycle","Frenar, recoger, reciclar"),sub:T("Barrages flottants, ramassage rapide, et valorisation : engrais, bioplastique, énergie.","Floating booms, fast collection, and reuse: fertiliser, bioplastic, energy.","Barreras, recogida rápida y reciclaje: abono, bioplástico, energía."),cta:T("Voir ma plage du jour →","See my beach today →","Ver mi playa de hoy →"),
      scene:<><rect width="800" height="600" fill="#06211E"/><rect y="320" width="800" height="280" fill="#1A5852" opacity=".5"/><g><circle cx="170" cy="320" r="10" fill="#FFC72C"/><circle cx="230" cy="320" r="10" fill="#FFC72C"/><circle cx="290" cy="320" r="10" fill="#FFC72C"/><circle cx="350" cy="320" r="10" fill="#FFC72C"/><line x1="160" y1="332" x2="360" y2="332" stroke="#E8A800" strokeWidth="3"/></g><g transform="translate(470,300)"><path d="M-30 20 L30 20 L22 36 L-22 36 Z" fill="#16282C" stroke="#FFC72C" strokeWidth="1.5"/><rect x="-8" y="-6" width="16" height="26" rx="2" fill="#0A1714"/></g><g transform="translate(620,360)"><path d="M0 -26 A26 26 0 1 1 -18 44" fill="none" stroke="#22C55E" strokeWidth="6"/><path d="M-18 30 l0 16 l16 -4 Z" fill="#22C55E"/></g><text x="620" y="368" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="13" fill="#9FE1CB">RE</text></>},
  ]
}
function DiscoveryStory({lang,onClose,onShowMap}){
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Comprendre les sargasses","Understand sargassum","Entender el sargazo")} style={{position:"absolute",inset:0,zIndex:1060,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(11px + env(safe-area-inset-top))",right:11,zIndex:30,width:44,height:44,background:"none",border:"none",padding:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><span aria-hidden="true" style={{width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</span></button>
      <StoryEngine beats={discoveryBeats(lang)} lang={lang} ev="sg_discovery_beat" onCTA={onShowMap}/>
    </div>
  )
}

function comprendreBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const d = discoveryBeats(lang)
  if(d.length > 0) {
    d[d.length - 1].cta = T("Voir les plages →", "See the beaches →", "Ver las playas →")
  }
  return d
}

function satelliteBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("SURVEILLANCE", "SURVEILLANCE", "VIGILANCIA"),
      heading: T("On regarde d'en haut", "Looking from above", "Mirando desde arriba"),
      sub: T("Le satellite Sentinel-3 scanne l'Atlantique en continu pour détecter la signature lumineuse des algues.", "The Sentinel-3 satellite continuously scans the Atlantic to detect the light signature of the algae.", "El satélite Sentinel-3 escanea continuamente el Atlántico para detectar la firma luminosa de las algas."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          {[120,90,300,70,520,110,680,80,420,150,600,180].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.3" fill="#fff" opacity=".5"/>))}
          <circle cx="400" cy="380" r="160" fill="#155A5A" opacity=".3"/>
          <path d="M400 150 L240 380 L560 380 Z" fill="#3fd07f" opacity="0.12"/>
          {miVeil(400, 150, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("L'INDICE AFAI", "THE AFAI INDEX", "EL ÍNDICE AFAI"),
      heading: T("L'indice de détection", "The detection index", "El índice de detección"),
      sub: T("L'indice AFAI mesure la concentration d'algues flottantes. En dessous de 0.15 la mer est propre, au-dessus de 0.40 l'alerte est maximale.", "The AFAI index measures floating algae concentration. Below 0.15 the sea is clean, above 0.40 it is a high alert.", "El índice AFAI mide la concentración de algas flotantes. Por debajo de 0.15 el mar está limpio, por encima de 0.40 la alerta es máxima."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0A2E2A"/>
          {[160,260,360].map((y,i)=>(<path key={i} d={`M-40 ${y} q60 -16 120 0 t120 0 t120 0`} fill="none" stroke="#5b3a8e" strokeWidth="2" opacity=".4"/>))}
          <path d="M400 50 L100 550 L700 550 Z" fill="#3fd07f" opacity="0.08"/>
          <g transform="translate(320,380)"><ellipse rx="60" ry="14" fill="#7a5c14" opacity=".85"/><ellipse cx="-30" cy="-6" rx="35" ry="9" fill="#8a6c1c" opacity=".85"/></g>
          <g transform="translate(480,420)"><ellipse rx="80" ry="18" fill="#5d400e" opacity=".85"/><ellipse cx="20" cy="-4" rx="40" ry="10" fill="#7a5c14" opacity=".85"/></g>
          <line x1="0" y1="400" x2="800" y2="400" stroke="#FFC72C" strokeWidth="3" opacity="0.8"/>
          <text x="400" y="370" fontFamily="ui-monospace,monospace" fontSize="14" fill="#FFC72C" textAnchor="middle">AFAI SCAN</text>
        </g>
      )
    },
    {
      eyebrow: T("RÉSOLUTIONS & FRÉQUENCE", "RESOLUTION & FREQUENCY", "RESOLUCIÓN Y FRECUENCIA"),
      heading: T("Scan toutes les 3 heures", "Scan every 3 hours", "Escaneo cada 3 horas"),
      sub: T("La grille de détection a une précision de 300 mètres, actualisée plusieurs fois par jour pour anticiper les arrivées.", "The detection grid has a 300-meter precision, updated several times a day to anticipate arrivals.", "La cuadrícula de detección tiene una precisión de 300 metros, actualizada varias veces al día para anticipar llegadas."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          {Array.from({length:9}).map((_,i)=>(<line key={`v${i}`} x1={80+i*80} y1="100" x2={80+i*80} y2="500" stroke="#1A5852" strokeWidth="1" opacity=".5"/>))}
          {Array.from({length:6}).map((_,i)=>(<line key={`h${i}`} x1="80" y1={100+i*80} x2="720" y2={100+i*80} stroke="#1A5852" strokeWidth="1" opacity=".5"/>))}
          <rect x="320" y="260" width="80" height="80" fill="#FFE08A" opacity="0.25" stroke="#FFC72C" strokeWidth="2"/>
          <text x="360" y="305" fontFamily="ui-monospace,monospace" fontSize="16" fill="#FFC72C" textAnchor="middle">300m</text>
          {miVeil(600, 180, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("TEMPS RÉEL", "REAL TIME", "TIEMPO REAL"),
      heading: T("Ce que voit ta plage", "What your beach sees", "Lo que ve tu playa"),
      sub: T("Grâce aux données satellite croisées en direct, tu sais si l'eau devant ta plage préférée est propre maintenant.", "Thanks to cross-referenced live satellite data, you know if the water in front of your favorite beach is clean right now.", "Gracias a los datos satelitales cruzados en vivo, sabes si el agua de tu playa favorita está limpia ahora."),
      cta: T("Voir la carte en direct →", "See the live map →", "Ver el mapa en vivo →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <path d="M0 380 Q400 350 800 380 L800 600 L0 600 Z" fill="#1C1712"/>
          <path d="M0 380 Q400 370 800 380" fill="none" stroke="#FFE47A" strokeWidth="2" opacity=".4"/>
          {miVeil(400, 200, "#5b3a8e", "#3fd07f")}
          <g transform="translate(400,430)">
            <ellipse rx="120" ry="24" fill="#22C55E" opacity=".8"/>
            <text y="8" fontFamily="system-ui,sans-serif" fontSize="18" fontWeight="800" fill="#fff" textAnchor="middle">PROPRE / CLEAN</text>
          </g>
        </g>
      )
    }
  ]
}

function h2sBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("DANGER SANTE", "HEALTH HAZARD", "RIESGO DE SALUD"),
      heading: T("Ça pourrit, ça pique", "It rots, it stings", "Se pudre, irrita"),
      sub: T("En séchant au soleil, les algues sargasses échouées pourrissent et libèrent du sulfure d'hydrogène (H₂S), un gaz toxique qui sent l'œuf pourri.", "As they dry in the sun, stranded sargassum seaweed rots and releases hydrogen sulfide (H₂S), a toxic gas that smells of rotten eggs.", "Al secarse al sol, las algas de sargazo varadas se pudren y liberan sulfuro de hidrógeno (H₂S), un gas tóxico que huele a huevo podrido."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <rect y="320" width="800" height="280" fill="#1C1712"/>
          <g transform="translate(400,350)">
            <ellipse rx="180" ry="34" fill="#5d400e"/>
            <ellipse cx="-90" cy="-12" rx="60" ry="20" fill="#7a5c14"/>
            <ellipse cx="80" cy="-10" rx="70" ry="22" fill="#6b4a12"/>
          </g>
          <g fill="#CC28FF" opacity=".6">
            <circle cx="330" cy="270" r="5"/>
            <circle cx="360" cy="230" r="3.5"/>
            <circle cx="430" cy="242" r="4"/>
            <circle cx="470" cy="218" r="3"/>
          </g>
          <text x="400" y="220" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="26" fill="#CC28FF">H₂S</text>
        </g>
      )
    },
    {
      eyebrow: T("POPULATIONS SENSIBLES", "SENSITIVE GROUPS", "GRUPOS SENSIBLES"),
      heading: T("Qui est vulnérable ?", "Who is vulnerable?", "¿Quién es vulnerable?"),
      sub: T("Les émanations de H₂S sont particulièrement irritantes pour les nourrissons, les femmes enceintes, et les personnes asthmatiques ou fragiles.", "H₂S fumes are particularly irritating for infants, pregnant women, and people with asthma or weak lungs.", "Las emanaciones de H₂S sont particulièrement irritantes pour nourrissons, femmes enceintes, et asthmatiques."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          <g transform="translate(400,220)">
            <polygon points="0,-60 -60,40 60,40" fill="#E8522A" stroke="#EAF7F4" strokeWidth="2"/>
            <text x="0" y="24" fontFamily="'Anton',sans-serif" fontSize="56" fill="#fff" textAnchor="middle">!</text>
          </g>
          <text x="400" y="340" fontFamily="system-ui,sans-serif" fontSize="16" fill="#3fd07f" textAnchor="middle">{T("Asthme · Nourrissons · Grossesse", "Asthma · Infants · Pregnancy", "Asma · Lactantes · Embarazo")}</text>
        </g>
      )
    },
    {
      eyebrow: T("SEUILS & PRÉVENTION", "THRESHOLDS & CARE", "UMBRALES Y CUIDADO"),
      heading: T("Aérer et s'éloigner", "Ventilate and stay away", "Ventilar y alejarse"),
      sub: T("Au-dessus du seuil d'alerte, évitez de stationner près des échouages et fermez les fenêtres si vous habitez en bord de mer.", "Above the warning threshold, avoid staying near seaweed accumulations and close windows if you live by the coast.", "Por encima del umbral de alerta, evite permanecer cerca de las algas varadas y cierre las ventanas si vive en la costa."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <g transform="translate(400,280)">
            <path d="M-60 40 L-60 -20 L0 -60 L60 -20 L60 40 Z" fill="none" stroke="#3fd07f" strokeWidth="3"/>
            <rect x="-20" y="-10" width="40" height="30" fill="none" stroke="#3fd07f" strokeWidth="2"/>
            <line x1="0" y1="-10" x2="0" y2="20" stroke="#3fd07f" strokeWidth="1"/>
          </g>
          <path d="M100 240 Q220 220 280 250" fill="none" stroke="#E8522A" strokeWidth="3" opacity=".6"/>
          <path d="M520 240 Q620 220 700 250" fill="none" stroke="#E8522A" strokeWidth="3" opacity=".6"/>
        </g>
      )
    },
    {
      eyrow: T("ALERTE VEILLEUR", "WATCHMAN ALERTS", "ALERTA DEL VIGÍA"),
      heading: T("Sois prévenu à temps", "Get warned in time", "Recibe alertas a tiempo"),
      sub: T("Ne te laisse plus surprendre par l'odeur. Notre veilleur surveille les risques H₂S devant tes plages préférées.", "Never get caught off guard by the smell again. Our Watchman monitors H₂S risks in front of your favorite beaches.", "No te dejes sorprender por el olor. Nuestro Vigía monitorea los riesgos de H₂S frente a tus playas."),
      cta: T("Activer Le Veilleur →", "Activate the Watcher →", "Activar el Vigía →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#120821"/>
          {miVeil(400, 200, "#E8522A", "#F4845F")}
          <circle cx="400" cy="200" r="140" fill="none" stroke="#E8522A" strokeWidth="2" strokeDasharray="6 8" opacity="0.4"/>
          <text x="400" y="380" fontFamily="system-ui,sans-serif" fontSize="18" fontWeight="800" fill="#E8522A" textAnchor="middle">ALERT H₂S ENABLED</text>
        </g>
      )
    }
  ]
}

function nettoyerBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  return [
    {
      eyebrow: T("L'ACTION", "ACTION", "ACCIÓN"),
      heading: T("Récolter avant le sable", "Collect before the sand", "Recoger antes de la arena"),
      sub: T("La récolte des algues en mer est 10 fois plus écologique car elle préserve le sable et évite la dégradation en gaz toxique.", "Collecting seaweed at sea is 10 times more ecological because it preserves sand and avoids degradation into toxic gas.", "Recoger el alga en el mar es 10 veces más ecológico porque conserva la arena y evita los gases tóxicos."),
      scene: (
        <g>
          <rect width="800" height="360" fill="#120821"/>
          <rect y="360" width="800" height="240" fill="#08251F"/>
          <g transform="translate(400,430)">
            <ellipse rx="150" ry="12" fill="#7a5c14"/>
          </g>
          <g transform="translate(350,340)"><path d="M-60 20 L60 20 L48 40 L-48 40 Z" fill="#1A5852" stroke="#3fd07f" strokeWidth="2"/></g>
        </g>
      )
    },
    {
      eyebrow: T("LE TRI", "THE SORTING", "LA CLASIFICACIÓN"),
      heading: T("Séparer pour valoriser", "Sort to value", "Clasificar para valorizar"),
      sub: T("L'algue récoltée passe par un système de tri mécanique pour séparer le sable et l'eau salée de la matière organique valorisable.", "The harvested algae goes through mechanical sorting to separate sand and saltwater from usable organic matter.", "El alga cosechada pasa por una clasificación mecánica para separar la arena y el agua de la materia orgánica."),
      scene: <SolSortScene lang={lang}/>
    },
    {
      eyebrow: T("LA TRANSFORMATION", "TRANSFORMATION", "TRANSFORMACIÓN"),
      heading: T("Engrais, briques, énergie", "Fertilizer, bricks, energy", "Abono, ladrillos, energía"),
      sub: T("Une fois triée et rincée, l'algue sargasse se transforme en compost agricole, en briques de construction ou en biogaz.", "Once sorted and rinsed, sargassum is transformed into agricultural compost, construction bricks or biogas.", "Una vez clasificada y enjuagada, el sargazo se transforma en compost agrícola, ladrillos o biogás."),
      scene: <SolTransformScene lang={lang}/>
    },
    {
      eyebrow: T("VALORISATION", "RECYCLING", "RECICLAJE"),
      heading: T("Agir pour le climat", "Act for the climate", "Actuar por el clima"),
      sub: T("Chaque tonne valorisée évite l'émanation de méthane en décomposition. Découvre toutes les initiatives locales.", "Each ton recycled avoids methane emissions from decomposition. Discover all local initiatives.", "Cada tonelada reciclada evita las emisiones de metano por descomposición. Descubre las iniciativas locales."),
      cta: T("Voir les solutions →", "See the solutions →", "Ver las soluciones →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <circle cx="400" cy="260" r="100" fill="none" stroke="#22C55E" strokeWidth="8"/>
          <path d="M380 230 L400 210 L420 230" fill="none" stroke="#22C55E" strokeWidth="8" strokeLinecap="round"/>
          <text x="400" y="275" fontFamily="'Anton',sans-serif" fontSize="48" fill="#22C55E" textAnchor="middle">CO₂</text>
        </g>
      )
    }
  ]
}

function methodeBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const relPct = (__REL && typeof __REL.cleanPct === "number") ? __REL.cleanPct : 79
  const relReg = (__REL && __REL.regime === "high") ? T("saison haute", "high season", "temporada alta") : T("saison calme", "calm season", "temporada tranquila")
  const relRateStr = T(`fiabilité de ${relPct}% sur nos prévisions « mer propre » vérifiées (${relReg})`, `accuracy of ${relPct}% on our verified “clean water” forecasts (${relReg})`, `fiabilidad del ${relPct}% en pronósticos “agua limpia” verificados (${relReg})`)
  return [
    {
      eyebrow: T("NOTRE MÉTHODE", "OUR METHOD", "NUESTRO MÉTODO"),
      heading: T("D'où vient la couleur ?", "Where does the color come from?", "¿De dónde viene el color?"),
      sub: T("L'indice de couleur de nos cartes (propre, modéré, à éviter) provient de l'analyse automatisée de la signature satellite de l'océan.", "The color index on our maps (clean, moderate, avoid) comes from automated satellite signature analysis of the ocean.", "El índice de color de nuestros mapas (limpio, moderado, evitar) proviene del análisis automatizado de la firma satelital."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0A2E2A"/>
          <path d="M150 180 Q400 240 650 180" fill="none" stroke="#22C55E" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          <path d="M150 280 Q400 340 650 280" fill="none" stroke="#E8A800" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          <path d="M150 380 Q400 440 650 380" fill="none" stroke="#E8522A" strokeWidth="48" strokeLinecap="round" opacity="0.45"/>
          {miVeil(400, 150, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("VALIDATION TERRAIN", "GROUND TRUTH", "VALIDACIÓN DE CAMPO"),
      heading: T("On croise les données", "Cross-referencing data", "Cruzando datos"),
      sub: T("Les signalements terrain de nos veilleurs locaux et les capteurs valident quotidiennement les prévisions satellites pour éliminer les faux positifs.", "Ground reports from our local watchers and sensors daily validate satellite forecasts to eliminate false positives.", "Los informes de campo de nuestros vigías locales y sensores validan diariamente los pronósticos satelitales."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06121A"/>
          <rect y="360" width="800" height="240" fill="#1C1712"/>
          {[200,400,600].map((x,i)=>(
            <g key={i} transform={`translate(${x},340)`}>
              <circle r="12" fill="#22C55E"/>
              <path d="M-6 0 L-2 4 L6 -4" fill="none" stroke="#fff" strokeWidth="2.5"/>
            </g>
          ))}
          {miVeil(400, 140, "#5b3a8e", "#3fd07f")}
        </g>
      )
    },
    {
      eyebrow: T("FIABILITÉ", "ACCURACY", "FIABILIDAD"),
      heading: T("Transparence totale", "Total transparency", "Transparencia total"),
      sub: T("Notre modèle affiche une " + relRateStr + ". Le taux est recalibré chaque semaine pour rester digne de confiance.", "Our model shows " + relRateStr + ". The rate is recalibrated every week to remain trustworthy.", "Nuestro modelo muestra una " + relRateStr + "."),
      scene: (
        <g>
          <rect width="800" height="600" fill="#06211E"/>
          <g transform="translate(400,260)">
            <circle r="80" fill="none" stroke="#3fd07f" strokeWidth="8"/>
            <text x="0" y="15" fontFamily="'Anton',sans-serif" fontSize="48" fill="#3fd07f" textAnchor="middle">{relPct}%</text>
          </g>
          <text x="400" y="380" fontFamily="system-ui,sans-serif" fontSize="14" fill="#9FE1CB" textAnchor="middle">{T("Indice de confiance mis à jour", "Confidence index updated", "Índice de confianza actualizado")}</text>
        </g>
      )
    },
    {
      eyebrow: T("LA CARTE", "THE MAP", "EL MAPA"),
      heading: T("Prêt pour la plage ?", "Ready for the beach?", "¿Listo para la playa?"),
      sub: T("Ouvre la carte interactive pour voir l'état exact de tes plages aujourd'hui et planifier ta semaine en Martinique et Guadeloupe.", "Open the interactive map to see the exact state of your beaches today and plan your week in Martinique and Guadeloupe.", "Abre el mapa interactivo para ver el estado exacto de tus playas hoy y planificar tu semana."),
      cta: T("Ouvrir la carte →", "Open the map →", "Abrir el mapa →"),
      scene: (
        <g>
          <rect width="800" height="600" fill="#0B2230"/>
          <path d="M100 250 Q400 220 700 250" fill="none" stroke="#FFE47A" strokeWidth="4" opacity=".5"/>
          <g transform="translate(400,280)">
            <path d="M0 -30 C-20 -30 -20 0 0 30 C20 0 20 -30 0 -30 Z" fill="#E8522A" stroke="#fff" strokeWidth="2"/>
            <circle cx="0" cy="-10" r="10" fill="#fff"/>
          </g>
        </g>
      )
    }
  ]
}

const STATION_BEATS = {
  "comprendre-sargasses":      comprendreBeats,
  "detection-satellite-sargasses": satelliteBeats,
  "danger-sargasses-h2s":      h2sBeats,
  "nettoyer-sargasses":        nettoyerBeats,
  "methode-carte":             methodeBeats,
  "en/understanding-sargassum":      comprendreBeats,
  "en/satellite-sargassum-detection": satelliteBeats,
}

function StationStory({slug,lang,onExit,onCTA}){
  const beatsFn = STATION_BEATS[slug] || discoveryBeats
  const accent = slug.includes("h2s") ? "#CC28FF" : slug.includes("nettoyer") ? "#3fd07f" : "#FFC72C"
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={slug} style={{position:"absolute",inset:0,zIndex:1060,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onExit} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(11px + env(safe-area-inset-top))",right:11,zIndex:30,width:44,height:44,background:"none",border:"none",padding:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><span aria-hidden="true" style={{width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</span></button>
      <StoryEngine beats={beatsFn(lang)} lang={lang} accent={accent}
        ev="sg_station_beat" onCTA={onCTA}
        onBeat={(b,n)=>{try{track("sg_station_beat",{slug,b:b+1,n})}catch(_){}}}/>
    </div>
  )
}


// ── SolutionsStory — pages SVG sur les SOLUTIONS sargasses (mandat nuit 14/06) :
//    problème global → on voit (satellite) → on agit (barrages+ramassage) → on
//    transforme (recyclage+carburant) → on sort (escapable, jamais infernal).
//    Scrollytelling via StoryEngine. Faits sûrs en v1, enrichis par recherche.
// Scène INTERACTIVE (clic) du beat transformation : touche une ressource -> un fait.
function SolTransformScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[sel,setSel]=useState(null)
  const items=[
    {e:"🌱",x:230,y:210,l:T("Engrais","Fertilizer","Abono"),f:T("Riche en potassium : il nourrit les sols agricoles.","Potassium-rich: it feeds farm soils.","Rico en potasio: nutre los suelos.")},
    {e:"🧱",x:400,y:182,l:T("Briques","Bricks","Ladrillos"),f:T("Sargablock : de vraies maisons bâties au Mexique.","Sargablock: real houses built in Mexico.","Sargablock: casas reales en México.")},
    {e:"⚡",x:570,y:210,l:T("Biogaz","Biogas","Biogás"),f:T("Méthanisation : l'algue devient électricité.","Anaerobic digestion: the algae becomes electricity.","Digestión: el alga se vuelve electricidad.")},
    {e:"📄",x:312,y:392,l:T("Papier","Paper","Papel"),f:T("Ses fibres font papier et carton.","Its fibres make paper and card.","Sus fibras hacen papel y cartón.")},
    {e:"🧴",x:488,y:392,l:T("Bioplastique","Bioplastic","Bioplástico"),f:T("Des emballages compostables.","Compostable packaging.","Envases compostables.")},
  ]
  return(<g><defs><linearGradient id="sol4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#sol4)"/>
    <g transform="translate(400,300)"><ellipse rx="46" ry="16" fill="#6b7a1c" style={{opacity:"calc(1 - var(--p5)*.7)"}}/></g>
    {items.map((o,i)=>(
      <g key={i} transform={"translate("+o.x+","+o.y+")"} role="button" tabIndex={0} aria-label={o.l} onClick={()=>{const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"transforme",item:["engrais","briques","biogaz","papier","bioplastique"][i]})}catch(_){}}}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"transforme",item:["engrais","briques","biogaz","papier","bioplastique"][i]})}catch(_){}}}}} style={{cursor:"pointer",opacity:"calc(var(--p5)*1.4 - "+(i*0.16)+")",transformBox:"fill-box",transformOrigin:"center"}}>
        <circle r="34" fill="#0A1714" stroke={sel===i?"#FFD884":"#1EC8B0"} strokeWidth={sel===i?2.6:1.4}/><text y="10" fontSize="30" textAnchor="middle">{o.e}</text><text y="56" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB" textAnchor="middle">{o.l}</text>
      </g>))}
    {sel==null
      ? <text x="400" y="104" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p5)"}}>👆 {T("touche une ressource","tap a resource","toca un recurso")}</text>
      : <g><rect x="120" y="70" width="560" height="62" rx="14" fill="rgba(7,32,30,.94)" stroke="#FFD884" strokeWidth="1.4"/><text x="400" y="97" fontFamily="system-ui,sans-serif" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle">{items[sel].e+"  "+items[sel].l}</text><text x="400" y="119" fontFamily="system-ui,sans-serif" fontSize="12.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{items[sel].f}</text></g>}
  </g>)
}
// Scène INTERACTIVE « ON TRIE » : un convoyeur amène l'algue vers 3 bacs triés (engin
// de chantier qui trie, demande fondateur). Tap un bac -> un fait. --p4 = remplissage.
function SolSortScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[sel,setSel]=useState(null)
  const bins=[
    {e:"♻️",x:300,c:"#22C55E",l:T("Valorisable","Reusable","Útil"),f:T("L'algue propre : engrais, biogaz, biochar.","Clean algae: fertilizer, biogas, biochar.","Alga limpia: abono, biogás, biochar.")},
    {e:"🌊",x:400,c:"#3E9BC4",l:T("Eau & sel","Water & salt","Agua y sal"),f:T("Pressée, l'eau salée repart à la mer.","Pressed out, the brine returns to the sea.","Prensada, el agua vuelve al mar.")},
    {e:"🪨",x:500,c:"#9AA08A",l:T("Sable & résidus","Sand & residue","Arena y residuo"),f:T("Le sable rendu à la plage, les déchets écartés.","Sand returned to the beach, waste removed.","La arena vuelve a la playa.")},
  ]
  return(<g><defs><linearGradient id="solSort" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>
    <style>{`@keyframes solBelt{to{stroke-dashoffset:-40}}.sol-belt{animation:solBelt 1.5s linear 1 both}@media(prefers-reduced-motion:reduce){.sol-belt{animation:none}}`}</style></defs>
    <rect width="800" height="600" fill="url(#solSort)"/>
    {/* convoyeur incliné */}
    <path d="M110 220 L460 330" stroke="#0A1714" strokeWidth="26" strokeLinecap="round"/>
    <path className="sol-belt" d="M110 220 L460 330" stroke="#1EC8B0" strokeWidth="3" strokeDasharray="6 16" opacity=".55"/>
    {[150,232,314,396].map((x,i)=>{const y=220+(x-110)*(110/350);return <ellipse key={i} cx={x} cy={y-16} rx="13" ry="6" fill="#8a6c1c" style={{opacity:"calc(var(--p4)*1.3 - "+(i*0.18)+")"}}/>})}
    {/* tête de tri (l'engin) */}
    <g transform="translate(470,300)"><rect x="-20" y="-24" width="48" height="32" rx="6" fill="#155A5A"/><rect x="-10" y="-36" width="22" height="14" rx="3" fill="#0A1714"/><circle cx="1" cy="-42" r="3.6" fill="#1EC8B0"/></g>
    {/* 3 bacs triés, cliquables, remplis par --p4 */}
    {bins.map((b,i)=>(
      <g key={i} transform={"translate("+b.x+",430)"} role="button" tabIndex={0} aria-label={b.l} onClick={()=>{const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"tri",item:["valorisable","eau_sel","sable"][i]})}catch(_){}}}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();const ns=sel===i?null:i;setSel(ns);if(ns!=null){try{track("sg_sol_tap",{beat:"tri",item:["valorisable","eau_sel","sable"][i]})}catch(_){}}}}} style={{cursor:"pointer"}}>
        <clipPath id={"binc"+i}><path d="M-32 2 L32 2 L27 66 L-27 66 Z"/></clipPath>
        <rect x="-32" y="6" width="64" height="60" fill={b.c} opacity=".4" clipPath={"url(#binc"+i+")"} style={{transform:"scaleY(var(--p4))",transformBox:"fill-box",transformOrigin:"center bottom"}}/>
        <path d="M-32 2 L32 2 L27 66 L-27 66 Z" fill="none" stroke={sel===i?"#FFD884":b.c} strokeWidth={sel===i?2.6:1.6}/>
        <text y="42" fontSize="24" textAnchor="middle">{b.e}</text>
        <text y="88" fontFamily="ui-monospace,monospace" fontSize="11" fontWeight="700" fill="#0A1714" textAnchor="middle" paintOrder="stroke" stroke="rgba(255,240,210,.6)" strokeWidth="2.4">{b.l}</text>
      </g>))}
    {sel==null
      ? <text x="400" y="120" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p4)"}}>👆 {T("touche un bac de tri","tap a sort bin","toca un contenedor")}</text>
      : <g><rect x="140" y="96" width="520" height="58" rx="14" fill="rgba(7,32,30,.94)" stroke="#FFD884" strokeWidth="1.4"/><text x="400" y="120" fontFamily="system-ui,sans-serif" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle">{bins[sel].e+"  "+bins[sel].l}</text><text x="400" y="140" fontFamily="system-ui,sans-serif" fontSize="12.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{bins[sel].f}</text></g>}
  </g>)
}
// LE DÉBAT (main d'œuvre / aides / argent) — 5 voix sur LA MÊME anse + vote diégétique
// « où va l'argent ». Non-clivant : pas "qui a raison" mais "que finance-t-on". Click-driven,
// mobile-safe (bande centrale). La donnée satellite = le point commun qui réconcilie tous.
function SolDebateScene({lang}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const[vi,setVi]=useState(0)
  const[votes,setVotes]=useState(()=>{try{return JSON.parse(localStorage.getItem("sg_debate_votes")||"[3,5,2,4]")}catch(_){return[3,5,2,4]}})
  const[voted,setVoted]=useState(false)
  const V=[
    {e:"🏠",n:T("Habitant","Resident","Vecino"),s:T("Ramassée vite, l'algue ne sent pas le H₂S près de l'école.","Collected fast, no H₂S smell near the school.","Recogida rápido, sin H₂S junto a la escuela.")},
    {e:"🏖️",n:T("Tourisme","Tourism","Turismo"),s:T("Mes clients réservent si je promets une plage propre.","Guests book if I can promise a clean beach.","Reservan si prometo playa limpia.")},
    {e:"🏛️",n:T("Collectivité","Public","Municipio"),s:T("La donnée dit OÙ ramasser : j'emploie là où c'est utile.","Data says WHERE to collect: I hire where it counts.","El dato dice DÓNDE recoger.")},
    {e:"♻️",n:T("Recycleur","Recycler","Reciclador"),s:T("Captée fraîche et triée, l'algue vaut de l'or (engrais, biogaz).","Fresh & sorted, the algae is gold (fertilizer, biogas).","Fresca y clasificada, vale oro.")},
    {e:"💶",n:T("Financier","Funder","Financiero"),s:T("Je finance ce qui se MESURE : la précision satellite horodatée.","I fund what's MEASURED: timestamped accuracy.","Financio lo que se MIDE.")},
  ]
  const O=[T("Collecte quartier","Local collect","Recogida"),T("Alerte H₂S","H₂S alert","Alerta H₂S"),T("Dashboard hôtels","Hotel dashboard","Panel hoteles"),T("Recyclage","Recycling","Reciclaje")]
  const vote=i=>{if(voted)return;setVotes(v=>{const n=v.slice();n[i]=(n[i]||0)+1;try{localStorage.setItem("sg_debate_votes",JSON.stringify(n))}catch(_){}return n});setVoted(true);try{track("sg_debate_vote",{choice:i})}catch(_){}}
  const tot=Math.max(1,votes.reduce((a,b)=>a+b,0)),v=V[vi]
  return(<g><defs><linearGradient id="solDeb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#solDeb)"/>
    <circle cx="400" cy="250" r="58" fill="#FFD884" opacity=".5"/>
    <rect y="372" width="800" height="228" fill="#10403A"/>
    <path d="M120 466 Q400 440 680 466 L680 600 L120 600 Z" fill="#C9A86A"/>
    <g opacity={vi===0?1:.45}><rect x="300" y="420" width="34" height="40" fill="#13302A"/><path d="M296 420 l21 -16 l21 16 Z" fill="#0A1714"/><rect x="344" y="428" width="28" height="32" fill="#13302A"/></g>
    <g opacity={vi===0?1:.45}><rect x="440" y="416" width="46" height="44" fill="#0A1714"/><line x1="463" y1="416" x2="463" y2="398" stroke="#FFD884" strokeWidth="2"/><path d="M463 398 l14 5 l-14 5 Z" fill="#E8522A"/></g>
    <g opacity={vi===1||vi===3?1:.35} transform="translate(520,452)"><path d="M-24 0 l48 0 l-8 14 l-32 0 Z" fill="#13302A"/></g>
    {vi===0&&<g><ellipse cx="317" cy="404" rx="34" ry="11" fill="#9AA08A" opacity=".4"/><text x="317" y="384" fontSize="13" textAnchor="middle">💨</text></g>}
    {vi===4&&<g stroke="#FFD884" strokeWidth="2" fill="none" opacity=".7"><path d="M250 200 Q330 330 400 430"/><path d="M400 190 Q400 310 400 430"/><path d="M550 200 Q470 330 400 430"/></g>}
    {miVeil(400,150,"#0A1714","#1EC8B0")}
    {/* sélecteur de voix (bande centrale, mobile-safe) */}
    <g role="button" tabIndex={0} aria-label="prev" onClick={()=>{const n=(vi+4)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();const n=(vi+4)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}}} style={{cursor:"pointer"}}><circle cx="272" cy="232" r="17" fill="rgba(7,32,30,.7)" stroke="rgba(95,211,201,.4)"/><text x="272" y="238" fontSize="16" fill="#fff" textAnchor="middle">‹</text></g>
    <g role="button" tabIndex={0} aria-label="next" onClick={()=>{const n=(vi+1)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();const n=(vi+1)%5;setVi(n);try{track("sg_sol_tap",{beat:"debat",item:"voix_"+n})}catch(_){}}}} style={{cursor:"pointer"}}><circle cx="528" cy="232" r="17" fill="rgba(7,32,30,.7)" stroke="rgba(95,211,201,.4)"/><text x="528" y="238" fontSize="16" fill="#fff" textAnchor="middle">›</text></g>
    <g><rect x="298" y="206" width="204" height="56" rx="14" fill="rgba(7,32,30,.92)" stroke="#FFD884" strokeWidth="1.3"/><text x="400" y="228" fontSize="13.5" fontWeight="800" fill="#FFD884" textAnchor="middle">{v.e+" "+v.n}</text><text x="400" y="248" fontSize="10.5" fill="rgba(255,255,255,.85)" textAnchor="middle">{v.s.length>52?v.s.slice(0,50)+"…":v.s}</text></g>
    <text x="400" y="288" fontSize="10" fill="rgba(255,255,255,.5)" textAnchor="middle">{(vi+1)+"/5 · "+T("‹ › les 5 regards","‹ › the 5 views","‹ › las 5 miradas")}</text>
    {/* vote 2×2 (safe band) ou résultat */}
    {!voted
      ? <g><text x="400" y="312" fontSize="13.5" fontWeight="800" fill="#fff" textAnchor="middle">{T("Toi, où doit aller l'argent ?","You — where should the money go?","¿A dónde va el dinero?")}</text>
          {O.map((o,i)=>{const cx=i%2===0?336:464,cy=i<2?340:376;return(<g key={i} transform={"translate("+cx+","+cy+")"} role="button" tabIndex={0} aria-label={o} onClick={()=>vote(i)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();vote(i)}}} style={{cursor:"pointer"}}><rect x="-62" y="-13" width="124" height="28" rx="9" fill="rgba(255,255,255,.08)" stroke="#1EC8B0" strokeWidth="1.1"/><text x="0" y="5" fontSize="10.5" fontWeight="700" fill="#fff" textAnchor="middle">{o}</text></g>)})}
        </g>
      : <g><text x="400" y="306" fontSize="12.5" fontWeight="800" fill="#FFD884" textAnchor="middle">{T("Le quartier a voté — l'argent suit la donnée :","The community voted — money follows data:","La comunidad votó:")}</text>
          {O.map((o,i)=>{const pct=Math.round(100*(votes[i]||0)/tot),y=324+i*19;return(<g key={i} transform={"translate(290,"+y+")"}><text x="0" y="9" fontSize="10" fill="rgba(255,255,255,.85)" textAnchor="end">{o}</text><rect x="8" y="0" width="170" height="11" rx="5.5" fill="rgba(255,255,255,.1)"/><rect x="8" y="0" width={Math.max(5,170*pct/100)} height="11" rx="5.5" fill="#1EC8B0"/><text x="186" y="9" fontSize="10" fontWeight="700" fill="#1EC8B0">{pct+"%"}</text></g>)})}
        </g>}
  </g>)
}
function solutionsBeats(lang){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const SKY=id=>(<linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120821"/><stop offset=".5" stopColor="#155A5A"/><stop offset=".84" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>)
  const SEA=id=>(<linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient>)
  return[
    // 0 — LE PROBLÈME : la ceinture atlantique qui dérive
    {eyebrow:T("LE PROBLÈME","THE PROBLEM","EL PROBLEMA"),heading:T("Une ceinture de 8 000 km","An 8,000 km belt","Un cinturón de 8.000 km"),
      sub:T("Depuis 2011, une marée d'algues traverse l'Atlantique, de l'Afrique aux Caraïbes. En 2025, un record : 38 millions de tonnes — le double de 2022.","Since 2011 a tide of algae crosses the Atlantic, Africa to the Caribbean. In 2025 a record: 38 million tonnes — double 2022.","Desde 2011 una marea cruza el Atlántico. En 2025 un récord: 38 millones de toneladas — el doble que 2022."),
      scene:<g><defs>{SKY("sol0")}</defs><rect width="800" height="600" fill="url(#sol0)"/>
        <ellipse cx="400" cy="320" rx="320" ry="170" fill="#08251F" opacity=".55"/>
        <g style={{transform:"translateX(calc(var(--p0)*70px - 35px))"}}>{[200,258,316,374,432,490,548,606].map((x,i)=>(<ellipse key={i} cx={x} cy={310+Math.sin(i*1.3)*16} rx="24" ry="8.5" fill="#8a6c1c" opacity=".82"/>))}</g>
        <circle cx="170" cy="312" r="9" fill="#1EC8B0"/><text x="170" y="346" fontFamily="ui-monospace,monospace" fontSize="12" fill="#9FE1CB" textAnchor="middle">{T("Afrique","Africa","África")}</text>
        <circle cx="636" cy="312" r="9" fill="#FFD884"/><text x="636" y="346" fontFamily="ui-monospace,monospace" fontSize="12" fill="#FFD884" textAnchor="middle">{T("Caraïbes","Caribbean","Caribe")}</text>
        <text x="400" y="150" fontFamily="'Anton',sans-serif" fontSize="40" fill="#fff" textAnchor="middle" opacity=".9">2011 →</text>
      </g>},
    // 1 — ON VOIT TOUT : le satellite scanne (notre moat)
    {eyebrow:T("ON VOIT TOUT","WE SEE IT ALL","LO VEMOS TODO"),heading:T("Lue depuis l'espace","Read from space","Leída desde el espacio"),
      sub:T("Le Veilleur lit la signature des algues en mer (satellites NASA/Copernicus) et prévient ta plage 2 à 5 jours avant l'arrivée — recoupé chaque jour au satellite.","The Watcher reads the algae's signature at sea (Copernicus/NOAA satellites) and warns your beach 2-5 days ahead — cross-checked daily against satellite.","El Vigía lee la firma de las algas en el mar (satélites NASA/Copernicus) y avisa tu playa 2-5 días antes — contrastado a diario con satélite."),
      scene:<g><defs>{SEA("sol1")}</defs><rect width="800" height="600" fill="#06121A"/>
        {[[120,90],[300,70],[520,110],[680,80],[420,150],[600,180]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.3" fill="#fff" opacity=".5"/>))}
        <rect y="360" width="800" height="240" fill="url(#sol1)"/>
        <path className="bsc-beam" d="M400 150 L300 360 L500 360 Z" fill="#1EC8B0" opacity={"calc(.08 + var(--p1)*.16)"}/>
        <g style={{transform:"translateX(calc(var(--p1)*120px - 60px))"}}>{miVeil(400,140,"#0A1714","#1EC8B0")}</g>
        {[330,400,470].map((x,i)=>(<circle key={i} cx={x} cy="400" r="7" fill="#FFD884" style={{opacity:"calc(var(--p1) - "+(i*0.18)+")"}}/>))}
        <text x="400" y="470" fontFamily="ui-monospace,monospace" fontSize="13" fill="#1EC8B0" textAnchor="middle" style={{opacity:"var(--p1)"}}>{T("Algues en mer · scan","Algae at sea · scan","Algas en el mar · scan")}</text>
      </g>},
    // 2 — ON ARRÊTE EN MER : barrages flottants + bateau collecteur
    {eyebrow:T("ON AGIT EN MER","WE ACT AT SEA","ACTUAMOS EN EL MAR"),heading:T("Stopper avant la plage","Stop it before the beach","Detenerla antes de la playa"),
      sub:T("Des barrages flottants dévient l'algue, des bateaux la collectent au large. En 2025, le Mexique a posé 9 630 m de barrages et collecté 92 783 tonnes — avant le sable, avant l'odeur.","Floating booms divert the algae, boats collect it offshore. In 2025 Mexico laid 9,630 m of booms and collected 92,783 tonnes — before the sand, before the smell.","Barreras flotantes desvían el alga; barcos la recogen mar adentro. México: 9.630 m de barreras y 92.783 t en 2025."),
      scene:<g><defs>{SKY("sol2s")}{SEA("sol2")}</defs><rect width="800" height="360" fill="url(#sol2s)"/>
        <path d="M348 250 a52 52 0 0 1 104 0 Z" fill="#FFD884" opacity=".85"/>
        <rect y="360" width="800" height="240" fill="url(#sol2)"/>
        <path d="M250 520 Q400 500 560 518 L820 512 L820 620 L250 620 Z" fill="#C9A86A"/>
        {/* barrage flottant (boom) — se remplit avec --p2 */}
        <g><line x1="200" y1="408" x2="600" y2="408" stroke="#FFC72C" strokeWidth="4" strokeDasharray="10 6"/>{[230,290,350,410,470,530].map((x,i)=>(<circle key={i} cx={x} cy="408" r="6" fill="#FFC72C"/>))}</g>
        <g style={{opacity:"var(--p2)"}}>{[260,330,400,470,540].map((x,i)=>(<ellipse key={i} cx={x} cy="392" rx="18" ry="6" fill="#7a5c14"/>))}</g>
        {/* bateau collecteur arrive avec --p2 */}
        <g style={{transform:"translateX(calc(var(--p2)*180px - 40px))"}}><path d="M120 388 l70 0 l-12 22 l-46 0 Z" fill="#13302A"/><rect x="142" y="368" width="26" height="20" fill="#0A1714"/><circle cx="155" cy="360" r="4" fill="#1EC8B0"/></g>
      </g>},
    // 3 — ON RAMASSE VITE : fenêtre 24-48h avant le H2S
    {eyebrow:T("ON RAMASSE VITE","WE COLLECT FAST","RECOGEMOS RÁPIDO"),heading:T("48 heures, pas plus","48 hours, no more","48 horas, no más"),
      sub:T("Ramassée dans les 24-48 h, l'algue reste une ressource propre. Trop tard, elle pourrit et dégage le H₂S — l'odeur d'œuf. Le timing change tout.","Collected within 24-48 h it stays a clean resource. Too late, it rots and releases H₂S — the egg smell. Timing is everything.","Recogida en 24-48 h sigue siendo limpia. Tarde, se pudre y libera H₂S."),
      scene:<g><defs>{SKY("sol3")}</defs><rect width="800" height="360" fill="url(#sol3)"/>
        <rect y="360" width="800" height="240" fill="#C9A86A"/>
        {/* tas d'algues fraiches -> machine qui ramasse avec --p3 */}
        <g style={{opacity:"calc(1 - var(--p3)*.85)"}}>{[300,360,420,480].map((x,i)=>(<ellipse key={i} cx={x} cy="430" rx="40" ry="14" fill="#6b7a1c"/>))}</g>
        <g style={{transform:"translateX(calc(var(--p3)*260px - 120px))"}}><rect x="120" y="396" width="60" height="36" rx="6" fill="#155A5A"/><circle cx="138" cy="436" r="12" fill="#120821"/><circle cx="168" cy="436" r="12" fill="#120821"/><path d="M180 412 l40 -10 l0 22 l-40 6 Z" fill="#FFC72C"/></g>
        {/* horloge / compte a rebours */}
        <g transform="translate(620,150)" style={{opacity:"calc(.5 + var(--p3)*.5)"}}><circle r="40" fill="none" stroke="#FFD884" strokeWidth="4"/><line x1="0" y1="0" x2="0" y2="-26" stroke="#FFD884" strokeWidth="4" strokeLinecap="round" style={{transformBox:"fill-box",transformOrigin:"0px 0px",transform:"rotate(calc(var(--p3)*300deg))"}}/><text x="0" y="64" fontFamily="ui-monospace,monospace" fontSize="13" fill="#FFD884" textAnchor="middle">48h</text></g>
      </g>},
    // 4 — ON TRIE : convoyeur + 3 bacs (l'engin de chantier qui trie, demande fondateur)
    {eyebrow:T("ON TRIE","WE SORT","SE CLASIFICA"),heading:T("Chaque chose à sa place","Everything in its place","Cada cosa en su sitio"),
      sub:T("Avant d'être valorisée, l'algue passe au tri : la matière propre d'un côté, l'eau salée et le sable de l'autre. Touche un bac pour voir ce qu'il devient.","Before being reused, the algae is sorted: clean matter on one side, brine and sand on the other. Tap a bin to see what it becomes.","Antes de valorizarla, el sargazo se clasifica. Toca un contenedor."),
      scene:<SolSortScene lang={lang}/>},
    // 5 — LE PROBLÈME DEVIENT RESSOURCE : recyclage + carburant
    {eyebrow:T("ON TRANSFORME","WE TRANSFORM","TRANSFORMAMOS"),heading:T("Le problème devient ressource","The problem becomes a resource","El problema se vuelve recurso"),
      sub:T("Engrais, briques, biochar, bioplastique, papier — et de l'énergie (biogaz). Captée fraîche, elle évite aussi le méthane qu'elle dégage en pourrissant (28× plus réchauffant que le CO₂).","Fertilizer, bricks, biochar, bioplastic, paper — and energy (biogas). Caught fresh, it also avoids the methane it releases when rotting (28× worse than CO₂).","Abono, ladrillos, biochar, bioplástico, papel — y energía (biogás). Recogida fresca evita el metano (28× peor que el CO₂)."),
      scene:<SolTransformScene lang={lang}/>},
    // 6 — LE DÉBAT : main d'œuvre / aides / argent (5 voix + vote)
    {eyebrow:T("LE DÉBAT","THE DEBATE","EL DEBATE"),heading:T("Qui ramasse ? Où va l'argent ?","Who collects? Where's the money?","¿Quién recoge? ¿A dónde va el dinero?"),
      sub:T("Habitant, tourisme, collectivité, recycleur, financier : 5 regards sur la même plage. Pas « qui a raison » mais « que finance-t-on ? ». La donnée satellite dit où ramasser — touche les 5 voix, puis vote.","Resident, tourism, public, recycler, funder: 5 views on the same beach. Not who's right but what we fund. Tap the 5 voices, then vote.","Vecino, turismo, municipio, reciclador, financiero: 5 miradas. Toca las 5 voces y vota."),
      scene:<SolDebateScene lang={lang}/>},
    // 7 — ESPOIR + SORTIE (escapable, jamais infernal)
    {eyebrow:T("MAINTENANT","NOW","AHORA"),heading:T("Vue, arrêtée, transformée","Seen, stopped, transformed","Vista, detenida, transformada"),
      sub:T("Vue de l'espace, arrêtée en mer, ramassée à temps, transformée en ressource. Le Veilleur garde un œil — toi, va profiter de la plage.","Seen from space, stopped at sea, collected in time, turned into a resource. The Watcher keeps an eye — you, go enjoy the beach.","Vista desde el espacio, detenida, transformada. El Vigía vigila — tú, ve a la playa."),
      cta:T("Sortir & voir les plages →","Exit & see the beaches →","Salir y ver las playas →"),
      scene:<g><defs>{SKY("sol5s")}{SEA("sol5")}</defs><rect width="800" height="360" fill="url(#sol5s)"/>
        <path d="M340 230 a60 60 0 0 1 120 0 Z" fill="#FFD884"/>
        <g style={{opacity:"calc(.5 + var(--p7)*.5)"}}>{[-52,-26,0,26,52].map((a,i)=>(<path key={i} d="M400 230 L391 90 L409 90 Z" fill="#FFD884" opacity=".1" transform={"rotate("+a+" 400 230)"}/>))}</g>
        <rect y="360" width="800" height="240" fill="url(#sol5)"/>
        <line x1="-40" y1="392" x2="840" y2="392" stroke="#FFD884" strokeWidth="2.2" strokeDasharray="3 13" opacity=".5"/>
        <path d="M250 500 Q400 478 560 498 L820 492 L820 620 L250 620 Z" fill="#C9A86A"/>
        <g style={{transform:"translateY(calc(var(--p7)*-10px))"}}>{miVeil(400,150,"#0A1714","#1EC8B0")}</g>
      </g>},
  ]
}
function SolutionsStory({lang,onClose,onExit}){
  // JEU data-unlock (INC2) : avancer dans le cycle DÉVERROUILLE nos données, palier par palier.
  // Niveau monotone (ne décroît JAMAIS — pré-révélé au retour), reduced-motion = tout d'office.
  const beats=solutionsBeats(lang),N=beats.length
  const rm=(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})()
  const[unlocked,setUnlocked]=useState(()=>{try{return rm?N:Math.max(0,parseInt(g("sg_sol_lvl",0))||0)}catch(_){return 0}})
  const onBeat=(b)=>{const lvl=Math.min(N,b+1);if(lvl>unlocked){setUnlocked(lvl);try{s("sg_sol_lvl",lvl)}catch(_){}try{sgUnlock("sol_p"+lvl)}catch(_){}}}
  const pct=Math.round(100*Math.min(unlocked,N)/N)
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Les solutions sargasses","Sargassum solutions","Soluciones al sargazo")} style={{position:"absolute",inset:0,zIndex:1065,background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"fixed",top:"calc(11px + env(safe-area-inset-top))",right:11,zIndex:31,width:44,height:44,background:"none",border:"none",padding:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><span aria-hidden="true" style={{width:42,height:42,borderRadius:21,background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</span></button>
      {/* HUD : barre de déblocage de NOS données (jamais décroît). Pas un popup — fin bandeau chrome. */}
      <div aria-hidden style={{position:"fixed",top:"calc(15px + env(safe-area-inset-top))",left:14,right:66,zIndex:30,pointerEvents:"none"}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:".04em",color:"#1EC8B0",textShadow:"0 1px 4px rgba(0,0,0,.6)"}}>{unlocked}/{N} · {_t(lang,"données débloquées","data unlocked","datos desbloqueados")}</div>
        <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,.13)",overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,#009E8E,#22C55E)",borderRadius:3,transition:"width .55s cubic-bezier(.22,1,.36,1)"}}/></div>
      </div>
      {/* sol_exit_cta : le dernier CTA ouvre le premium (intent chaud post-éducation) */}
      <StoryEngine beats={beats} lang={lang} accent="#1EC8B0" ev="sg_solutions_beat" onCTA={onExit||onClose} onBeat={onBeat}/>
    </div>
  )
}

export {DiscoveryStory,StationStory}
export default SolutionsStory
