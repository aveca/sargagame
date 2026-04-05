/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  SARGASSES : MISSION MARTINIQUE / GUADELOUPE                         ║
 * ║  Jeu de décisions stratégiques — offline-first — mobile + desktop    ║
 * ║                                                                      ║
 * ║  Mechanic: Reigns × Copernicus · 30 jours · 4 ressources             ║
 * ║  "La Ceinture" = menace croissante autour de l'île                   ║
 * ║  Scan satellite tous les 7j = prédiction des 3 prochaines cartes     ║
 * ║                                                                      ║
 * ║  40 events  ·  swipe mobile  ·  keyboard desktop  ·  100% offline   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import{useState,useEffect,useRef,useMemo,useCallback}from"react"

// ── Fonts ──────────────────────────────────────────────────────────────
const GFONTS=`@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;700&display=swap');`

// ── Tokens ─────────────────────────────────────────────────────────────
const T={
  void:"#020810",deep:"#050F1A",mid1:"#081520",mid2:"#0C1E2F",
  surface:"rgba(12,30,47,.9)",glass:"rgba(8,21,32,.7)",
  w:"#E8F4F8",m:"#7AADC4",mute:"#3D6880",
  border:"rgba(0,180,160,.1)",borderL:"rgba(0,180,160,.2)",
  cyan:"#00C8BE",cyanL:"#00EEE4",cyanD:"#007A76",cyanBg:"rgba(0,200,190,.09)",
  sarg:"#E8A800",sargL:"#FFC72C",sargLL:"#FFE47A",sargBg:"rgba(232,168,0,.11)",
  safe:"#22C55E",safeBg:"rgba(34,197,94,.12)",
  warn:"#B87A00",warnBg:"rgba(184,122,0,.12)",
  danger:"#E8522A",dangerBg:"rgba(232,82,42,.12)",
  h2s:"#CC28FF",h2sBg:"rgba(204,40,255,.15)",
  belt_low:"#22C55E",belt_mid:"#B87A00",belt_high:"#E8522A",
}

// ════════════════════════════════════════════════════════════════════════
// GAME DATA — 40 événements  ·  tout offline
// ════════════════════════════════════════════════════════════════════════
// Ressources : plages, tourisme, env, budget (0–10 chacune)
// ceinture   : menace globale 0–100
// next       : id de la prochaine carte OU tableau pour aléatoire

const EVENTS = [
  // ── TUTORIEL (jours 1-3, forcés) ──────────────────────────────────
  {
    id:"tuto_1", cat:"tutorial", emoji:"🛰️", day:1, forced:true,
    title:"Alerte Copernicus",
    text:"Bienvenue, Préfet. Sentinel-3 vient de détecter une nappe de sargasses de 200 km² au large de la côte Atlantique. AFAI : 71 %. Tes premières décisions vont définir la suite.",
    choices:[
      {key:"A",label:"Analyser les données",     fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:+3},  next:"tuto_2", fb:"Bonne approche. Comprendre avant d'agir."},
      {key:"B",label:"Déployer un barrage d'urgence",fx:{plages:+2,tourisme:0,env:-1,budget:-3,ceinture:-8},next:"tuto_2",fb:"Efficace mais coûteux. Le budget est limité."},
      {key:"C",label:"Contacter la mairie",       fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:+5},   next:"tuto_2", fb:"La mairie accuse réception... en 48h."},
    ]
  },
  {
    id:"tuto_2", cat:"tutorial", emoji:"📊", day:2, forced:true,
    title:"Briefing ressources",
    text:"Voici ta situation. Quatre piliers à maintenir : l'état des plages, l'attractivité touristique, la santé de l'écosystème, et ton budget. Si l'un tombe à zéro : game over.",
    choices:[
      {key:"A",label:"Priorité aux plages",    fx:{plages:+1,tourisme:+1,env:-1,budget:-1,ceinture:+2}, next:"tuto_3", fb:"Le tourisme apprécie. L'écosystème moins."},
      {key:"B",label:"Priorité à l'environnement",fx:{plages:0,tourisme:-1,env:+2,budget:-1,ceinture:-3}, next:"tuto_3",fb:"Vision à long terme. Difficile à court terme."},
      {key:"C",label:"Demander une subvention",  fx:{plages:0,tourisme:0,env:0,budget:+2,ceinture:+4},   next:"tuto_3", fb:"Budget renfloué mais la menace avance."},
    ]
  },
  {
    id:"tuto_3", cat:"tutorial", emoji:"🌀", day:3, forced:true,
    title:"La Ceinture de Sargasses",
    text:"La grande ceinture Atlantique se resserre chaque jour. Quand elle atteint 100 %, les événements deviennent incontrôlables. La science peut la repousser — mais ça coûte.",
    choices:[
      {key:"A",label:"Financer une mission scientifique",fx:{plages:0,tourisme:0,env:+2,budget:-3,ceinture:-12},next:null, fb:"Excellent. La recherche est ton meilleur allié."},
      {key:"B",label:"Installer une bouée de surveillance",fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:-4},next:null,fb:"Petite action, mais elle compte."},
      {key:"C",label:"Surveiller depuis la côte",         fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:+6}, next:null, fb:"Économique, mais la ceinture avance."},
    ]
  },

  // ── SATELLITE & DÉTECTION ─────────────────────────────────────────
  {
    id:"nappe_atlant", cat:"satellite", emoji:"🛰️", weight:6,
    title:"Nappe détectée — Atlantique",
    text:"Sentinel-3 scanne la côte Atlantique. AFAI 68 %. Une nappe de 150 km² dérive vers Tartane. Vent alizé favorable à l'échouage dans 48h.",
    choices:[
      {key:"A",label:"Barrage flottant à Tartane",   fx:{plages:+2,tourisme:+1,env:-1,budget:-3,ceinture:-7}, next:null,fb:"Tartane protégée. Budget grevé."},
      {key:"B",label:"Alerte préventive aux touristes",fx:{plages:0,tourisme:-2,env:0,budget:-1,ceinture:0},  next:["consequences_alerte","tourisme_chute"],fb:"Moins de monde mais les plages restent propres."},
      {key:"C",label:"Modèle de dérive NEMO consulté", fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:-4}, next:["nappe_devia","nappe_arrive"],fb:"Le modèle prédit une déviation si les alizés tiennent."},
    ]
  },
  {
    id:"nappe_caraibe", cat:"satellite", emoji:"🛰️", weight:5,
    title:"Front côté Caraïbe",
    text:"Données Copernicus : AFAI 52 % sur la façade Caraïbe. Grande Anse d'Arlet et Anse Mitan concernées. Saison haute dans 10 jours.",
    choices:[
      {key:"A",label:"Ramassage mécanique urgent",  fx:{plages:+3,tourisme:+2,env:-2,budget:-4,ceinture:-5},next:null,fb:"Plages nettes mais coût élevé et pollution mécanique."},
      {key:"B",label:"Valorisation en compost",      fx:{plages:+1,tourisme:0,env:+3,budget:+1,ceinture:-3},next:"compost_projet",fb:"Innovant. Des agriculteurs de Sainte-Marie sont intéressés."},
      {key:"C",label:"Attendre la marée",            fx:{plages:-1,tourisme:-1,env:0,budget:0,ceinture:+4}, next:["maree_aide","maree_empire"],fb:"Risqué. La marée peut aider ou empirer."},
    ]
  },
  {
    id:"scan_hebdo", cat:"satellite", emoji:"📡", weight:0, // déclenché automatiquement J7/14/21
    title:"Scan Copernicus J+7",
    text:"Mise à jour hebdomadaire disponible. Le modèle lagrangien prédit pour les 7 prochains jours : 2 nappes moyennes + 1 événement H2S probable côte Atlantique.",
    choices:[
      {key:"A",label:"Préparer les barrages à l'avance",fx:{plages:0,tourisme:0,env:0,budget:-3,ceinture:-10},next:null,fb:"Tu anticipes. La ceinture recule légèrement."},
      {key:"B",label:"Former les équipes de ramassage",  fx:{plages:0,tourisme:0,env:+1,budget:-2,ceinture:-5}, next:null,fb:"Tes équipes seront prêtes."},
      {key:"C",label:"Partager les données publiquement", fx:{plages:0,tourisme:-1,env:+2,budget:+1,ceinture:0},next:null,fb:"Transparence appréciée des scientifiques, moins des hôteliers."},
    ]
  },

  // ── CRISES ÉCHOUAGE ───────────────────────────────────────────────
  {
    id:"invasion_salines", cat:"crise", emoji:"🌿", weight:7,
    title:"Les Salines envahies",
    text:"Catastrophe. Les Salines, plage emblématique de Martinique, sont recouvertes de sargasses sur 800m. Des touristes allemands filment. Ça circule sur TikTok.",
    choices:[
      {key:"A",label:"Ramassage d'urgence 24h/24",  fx:{plages:+2,tourisme:+1,env:-1,budget:-4,ceinture:0}, next:null,fb:"Plage dégagée en 18h. Vidéo de la reprise publiée."},
      {key:"B",label:"Communiqué de crise officiel", fx:{plages:0,tourisme:+1,env:0,budget:-1,ceinture:0},  next:"medias_arrive",fb:"Les médias arrivent. Tu as 6h pour montrer que tu agis."},
      {key:"C",label:"Fermer la plage temporairement",fx:{plages:0,tourisme:-3,env:+1,budget:-1,ceinture:-2},next:null,fb:"Sage mais impopulaire. Les hôteliers protestent."},
    ]
  },
  {
    id:"h2s_tartane", cat:"crise", emoji:"☣️", weight:5,
    title:"H2S détecté à Tartane",
    text:"Alerte sanitaire. Les sargasses en décomposition à Tartane émettent du H2S à 12 ppm. Seuil danger dépassé. Une famille de touristes hospitalisée à la Meynard.",
    choices:[
      {key:"A",label:"Évacuation et cordon sanitaire",  fx:{plages:-1,tourisme:-4,env:0,budget:-2,ceinture:0}, next:"h2s_medias",fb:"Décision responsable. L'info est dans Le Monde."},
      {key:"B",label:"Retrait d'urgence des sargasses", fx:{plages:+1,tourisme:-1,env:-2,budget:-4,ceinture:0}, next:null,fb:"Efficace mais coûteux et dangereux pour les équipes."},
      {key:"C",label:"Minimiser l'information",         fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:+8},   next:"scandale_h2s",fb:"Mauvaise idée. Un journaliste a déjà tout."},
    ]
  },
  {
    id:"h2s_robert", cat:"crise", emoji:"☣️", weight:4,
    title:"Odeur au Robert",
    text:"Les habitants du Robert signalent une odeur d'œuf pourri. Mesure H2S : 8 ppm. Sous le seuil danger mais les écoles ferment par précaution.",
    choices:[
      {key:"A",label:"Mesures continues + information",fx:{plages:0,tourisme:-1,env:0,budget:-1,ceinture:0},next:null,fb:"Transparence rassurante. Situation sous contrôle."},
      {key:"B",label:"Nettoyer mécaniquement",       fx:{plages:+1,tourisme:0,env:-1,budget:-3,ceinture:0},next:null,fb:"Zone nettoyée. Les enfants reviennent à l'école."},
      {key:"C",label:"Contacter l'ARS",             fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-2},next:null,fb:"L'ARS publie un protocole sanitaire. Utile à long terme."},
    ]
  },
  {
    id:"nappe_arrive", cat:"crise", emoji:"🌊", weight:4,
    title:"La nappe atteint la côte",
    text:"Le modèle NEMO avait raison. La nappe de 180 km² a atteint la côte Atlantique. Tout le nord-est est touché. Tes équipes sont débordées.",
    choices:[
      {key:"A",label:"Demander l'aide de l'État",      fx:{plages:0,tourisme:-1,env:0,budget:+3,ceinture:-5},next:null,fb:"La préfecture débloque des fonds d'urgence."},
      {key:"B",label:"Mobiliser les volontaires locaux",fx:{plages:+2,tourisme:0,env:+1,budget:-1,ceinture:-4},next:"volontaires_impact",fb:"300 volontaires au rendez-vous. Émouvant."},
      {key:"C",label:"Concentrer sur les zones touristiques",fx:{plages:+1,tourisme:+2,env:-2,budget:-2,ceinture:0},next:null,fb:"Stratégie pragmatique mais critiquée."},
    ]
  },

  // ── MÉTÉO & ENVIRONNEMENT ─────────────────────────────────────────
  {
    id:"alize_fort", cat:"meteo", emoji:"💨", weight:6,
    title:"Alizé fort — opportunité",
    text:"Météo France annonce des alizés à 35 nœuds pour 48h. Les courants peuvent soit repousser les nappes au large, soit concentrer les échouages sur la côte Atlantique.",
    choices:[
      {key:"A",label:"Déployer des bouées dérivantes",fx:{plages:+1,tourisme:0,env:+1,budget:-2,ceinture:-8},next:null,fb:"Les bouées capturent des données précieuses. La nappe dévie."},
      {key:"B",label:"Profiter pour remettre en mer",  fx:{plages:+2,tourisme:0,env:-1,budget:-2,ceinture:-6},next:["alize_aide","alize_echoue"],fb:"Risqué. Ça peut fonctionner ou les ramener."},
      {key:"C",label:"Préparer les équipes côte Atlantique",fx:{plages:0,tourisme:0,env:0,budget:-1,ceinture:+2},next:null,fb:"Prudent. Les équipes sont prêtes si ça tourne mal."},
    ]
  },
  {
    id:"maree_exceptionnelle", cat:"meteo", emoji:"🌊", weight:4,
    title:"Grande marée prévue",
    text:"Fort coefficient de marée ce soir (103). Les sargasses sur les plages pourraient être remportées par la mer — ou de nouvelles nappes pourraient s'échouer.",
    choices:[
      {key:"A",label:"Surfer sur la marée — ne rien faire",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:0},next:["maree_aide","maree_empire"],fb:"C'est aléatoire. La mer fait ce qu'elle veut."},
      {key:"B",label:"Positionner des filets de collecte",  fx:{plages:+1,tourisme:0,env:+1,budget:-2,ceinture:-3},next:null,fb:"40 tonnes collectées. Belle opération."},
      {key:"C",label:"Alerte préventive baigneurs",         fx:{plages:0,tourisme:-1,env:0,budget:-1,ceinture:0},next:null,fb:"Précaution utile. Zéro incident."},
    ]
  },
  {
    id:"tempete_approche", cat:"meteo", emoji:"⛈️", weight:3,
    title:"Dépression tropicale en approche",
    text:"Météo France place la Martinique en vigilance jaune. Une dépression tropicale à 200 km pourrait disperser les sargasses ou créer un afflux massif selon sa trajectoire.",
    choices:[
      {key:"A",label:"Rentrer tous les équipements",fx:{plages:0,tourisme:-1,env:0,budget:-1,ceinture:+6},next:null,fb:"Sécurité avant tout. La tempête passe au nord."},
      {key:"B",label:"Mission satellite urgente",   fx:{plages:0,tourisme:0,env:+1,budget:-2,ceinture:-5},next:null,fb:"Les données permettent de prévoir le dispersal."},
      {key:"C",label:"Attendre le passage",         fx:{plages:0,tourisme:-2,env:0,budget:0,ceinture:+10},next:["tempete_ok","tempete_disaster"],fb:"Risqué. La dépression change de trajectoire..."},
    ]
  },
  {
    id:"saison_seche", cat:"meteo", emoji:"☀️", weight:4,
    title:"Carême — mer calme",
    text:"Le carême s'installe. Mer plate, vents faibles. Les sargasses flottent sans se disperser. Bonne et mauvaise nouvelle : elles stagnent mais n'échouent pas.",
    choices:[
      {key:"A",label:"Opération de ramassage en mer",fx:{plages:+1,tourisme:+1,env:+2,budget:-4,ceinture:-12},next:null,fb:"Conditions idéales pour intervenir en mer."},
      {key:"B",label:"Promotion touristique — mer calme",fx:{plages:0,tourisme:+3,env:0,budget:+2,ceinture:+3},next:null,fb:"Les touristes arrivent. Budget renfloué."},
      {key:"C",label:"Cartographier les nappes statiques",fx:{plages:0,tourisme:0,env:+2,budget:-1,ceinture:-6},next:null,fb:"Base de données précieuse pour les prévisions."},
    ]
  },

  // ── TOURISME & ÉCONOMIE ────────────────────────────────────────────
  {
    id:"saison_haute", cat:"tourisme", emoji:"✈️", weight:5,
    title:"Saison haute — touristes en vol",
    text:"35 000 touristes attendus ce mois. Les hôtels affichent complet. Mais les prévisions Copernicus indiquent une arrivée de sargasses pour la semaine prochaine.",
    choices:[
      {key:"A",label:"Sécuriser les plages maintenant",  fx:{plages:+2,tourisme:+3,env:-1,budget:-4,ceinture:0},next:null,fb:"Parfait timing. Les touristes sont ravis. TripAdvisor +0.8."},
      {key:"B",label:"Communication honnête aux hôteliers",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:0},next:"hoteliers_negocient",fb:"Les hôteliers préfèrent l'anticiper. Ils aident à financer."},
      {key:"C",label:"Rien — le tourisme doit partir",    fx:{plages:-2,tourisme:-4,env:0,budget:-2,ceinture:+5},next:null,fb:"Catastrophe. 40% d'annulations en 3 jours."},
    ]
  },
  {
    id:"touriste_content", cat:"tourisme", emoji:"🏖️", weight:4,
    title:"Avis 5 étoiles",
    text:"Un influenceur américain publie une vidéo sur Grande Anse d'Arlet — 'la plage la plus propre de la Caraïbe'. 2M de vues. Les réservations explosent.",
    choices:[
      {key:"A",label:"Capitaliser — contrat ambassadeur",fx:{plages:0,tourisme:+4,env:0,budget:+3,ceinture:0},  next:null,fb:"Budget renfloué. La Martinique est en tendance."},
      {key:"B",label:"Utiliser pour lever des fonds",    fx:{plages:0,tourisme:+2,env:+2,budget:+2,ceinture:-3},next:null,fb:"Des fonds européens s'intéressent."},
      {key:"C",label:"Rester discret",                  fx:{plages:0,tourisme:+1,env:0,budget:0,ceinture:0},   next:null,fb:"Prudent. Le sur-tourisme est aussi un risque."},
    ]
  },
  {
    id:"tourisme_chute", cat:"tourisme", emoji:"📉", weight:4,
    title:"Annulations en cascade",
    text:"Suite aux images des Salines sur les réseaux, 3 tour-opérateurs français suspendent leurs ventes Martinique. 800 réservations annulées.",
    choices:[
      {key:"A",label:"Cellule de crise communication",fx:{plages:0,tourisme:+2,env:0,budget:-2,ceinture:0},next:null,fb:"Bon rétablissement. Les images nettoyées circulent."},
      {key:"B",label:"Offres de remboursement totales",fx:{plages:0,tourisme:0,env:0,budget:-3,ceinture:0},   next:null,fb:"Coûteux mais cela stoppe l'hémorragie."},
      {key:"C",label:"Contre-attaque avec des belles photos",fx:{plages:0,tourisme:+1,env:0,budget:-1,ceinture:0},next:null,fb:"Fonctionne un peu. Insuffisant."},
    ]
  },
  {
    id:"hotel_ferme", cat:"tourisme", emoji:"🏨", weight:3,
    title:"Grand hôtel menace de fermer",
    text:"La Résidence des Trois Îlets annonce une possible fermeture si la situation sargasses ne s'améliore pas. 80 emplois directs en jeu.",
    choices:[
      {key:"A",label:"Garantir la plage de l'hôtel",  fx:{plages:+2,tourisme:+2,env:-1,budget:-4,ceinture:0}, next:null,fb:"L'hôtel reste ouvert. Accord de partenariat signé."},
      {key:"B",label:"Subvention d'urgence",           fx:{plages:0,tourisme:+1,env:0,budget:-3,ceinture:0},  next:null,fb:"L'hôtel tient. Les salariés soulagés."},
      {key:"C",label:"Laisser le marché décider",      fx:{plages:0,tourisme:-2,env:0,budget:0,ceinture:+3},  next:null,fb:"L'hôtel ferme. 80 personnes au chômage."},
    ]
  },

  // ── SOCIAL & POLITIQUE ────────────────────────────────────────────
  {
    id:"mairie_reagit", cat:"social", emoji:"🏛️", weight:5,
    title:"La mairie du Diamant agit",
    text:"Le maire du Diamant lance un plan local : 20 agents municipaux + accord avec des pêcheurs locaux pour collecter les sargasses en mer. Il demande ton soutien.",
    choices:[
      {key:"A",label:"Financer le plan municipalité",  fx:{plages:+2,tourisme:+1,env:+1,budget:-3,ceinture:-6},next:null,fb:"Belle collaboration. Le Diamant devient un modèle."},
      {key:"B",label:"Partager les données satellites", fx:{plages:0,tourisme:0,env:+2,budget:-1,ceinture:-4},next:null,fb:"Les données Copernicus améliorent leur ciblage."},
      {key:"C",label:"Centraliser au niveau préfectural",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:0},  next:"mairie_fache",fb:"Le maire est vexé. Il agit quand même, mais sans toi."},
    ]
  },
  {
    id:"pecheuses_bloquees", cat:"social", emoji:"🎣", weight:5,
    title:"Pêcheurs bloqués au port",
    text:"Les pêcheurs de Sainte-Anne ne peuvent pas prendre la mer — leurs filets sont obstrués par les sargasses. 3e semaine consécutive. Ils menacent de manifester.",
    choices:[
      {key:"A",label:"Payer compensation + formation",fx:{plages:0,tourisme:0,env:+1,budget:-3,ceinture:0},next:null,fb:"Les pêcheurs deviennent des vigies sargasses. Alliance précieuse."},
      {key:"B",label:"Nettoyer le chenal urgent",     fx:{plages:0,tourisme:+1,env:-1,budget:-2,ceinture:0},next:null,fb:"Chenal libre. Les pêcheurs reprennent la mer."},
      {key:"C",label:"Réunion publique d'information",fx:{plages:0,tourisme:0,env:0,budget:-1,ceinture:+2},next:["reunion_ok","reunion_tension"],fb:"Ambiance tendue. Mais certains comprennent."},
    ]
  },
  {
    id:"scientifique_arrive", cat:"social", emoji:"🔬", weight:4,
    title:"Chercheuse IFREMER débarque",
    text:"Dr. Marie-Claire Joséphine, spécialiste sargasses à l'IFREMER, propose un partenariat de 6 mois. Accès à ses modèles de prédiction + formation de tes équipes.",
    choices:[
      {key:"A",label:"Accepter le partenariat complet",fx:{plages:0,tourisme:0,env:+3,budget:-2,ceinture:-15},next:"ifremer_install",fb:"Excellent. Tes prévisions deviennent 40% plus précises."},
      {key:"B",label:"Formation équipes seulement",    fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:-6}, next:null,fb:"Tes équipes montent en compétence."},
      {key:"C",label:"Demander un rapport gratuit",    fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-3},  next:null,fb:"Elle accepte à contrecœur. Rapport utile mais limité."},
    ]
  },
  {
    id:"manifestation", cat:"social", emoji:"✊", weight:3,
    title:"Manifestation anti-inaction",
    text:"200 personnes manifestent devant la préfecture avec des pancartes 'Nos plages meurent'. Un collectif écologique accuse le gouvernement d'inaction. France 24 est là.",
    choices:[
      {key:"A",label:"Rencontrer les manifestants",   fx:{plages:0,tourisme:0,env:+2,budget:-1,ceinture:-3},next:null,fb:"Dialogue sincère. Certains rejoignent les équipes de nettoyage."},
      {key:"B",label:"Conférence de presse offensive",fx:{plages:0,tourisme:+1,env:0,budget:-1,ceinture:0},  next:null,fb:"Tu défends ton bilan. Mitigé mais tu reprends la main."},
      {key:"C",label:"Rester en retrait",             fx:{plages:0,tourisme:-2,env:-1,budget:0,ceinture:+4}, next:null,fb:"Perçu comme de la lâcheté. La pression monte."},
    ]
  },
  {
    id:"medias_arrive", cat:"social", emoji:"📺", weight:4,
    title:"France 24 fait un reportage",
    text:"France 24 tourne un reportage sur les sargasses en Martinique. La journaliste te demande une interview. Selon ta réponse, cela peut aider ou nuire.",
    choices:[
      {key:"A",label:"Interview avec données transparentes",fx:{plages:0,tourisme:0,env:+1,budget:+1,ceinture:-4},next:null,fb:"Reportage positif. Donations européennes reçues."},
      {key:"B",label:"Refuser — trop risqué",           fx:{plages:0,tourisme:-2,env:0,budget:0,ceinture:+3}, next:null,fb:"Le reportage est moins bon sans ta voix."},
      {key:"C",label:"Inviter sur le terrain",          fx:{plages:0,tourisme:+2,env:+1,budget:+2,ceinture:-5},next:null,fb:"Reportage exceptionnel. Prix Albert-Londres. Fonds levés."},
    ]
  },
  {
    id:"volontaires_impact", cat:"social", emoji:"🤝", weight:0,
    title:"Les volontaires changent la donne",
    text:"300 volontaires martiniquais ont nettoyé 15 km de côtes en 48h. L'élan populaire est fort. Un collectif propose de s'organiser de façon pérenne.",
    choices:[
      {key:"A",label:"Structurer en association officielle",fx:{plages:+2,tourisme:+1,env:+2,budget:-1,ceinture:-8},next:null,fb:"Association 'Laver Nou Plaj' créée. Modèle exporté en Guadeloupe."},
      {key:"B",label:"Les remercier et continuer seul",     fx:{plages:+1,tourisme:0,env:+1,budget:0,ceinture:0}, next:null,fb:"Gâchis. L'élan retombe."},
      {key:"C",label:"Intégrer dans les équipes officielles",fx:{plages:+2,tourisme:0,env:+2,budget:-2,ceinture:-6},next:null,fb:"Excellent. Capacité de nettoyage doublée."},
    ]
  },

  // ── BUDGET & RESSOURCES ────────────────────────────────────────────
  {
    id:"subvention_ue", cat:"budget", emoji:"🇪🇺", weight:4,
    title:"Subvention UE disponible",
    text:"L'Union Européenne ouvre un appel à projets 'Gestion des macro-algues Caraïbes'. 500k€ disponibles. Dossier à déposer en 72h.",
    choices:[
      {key:"A",label:"Déposer le dossier complet",fx:{plages:0,tourisme:0,env:+1,budget:+5,ceinture:-5},next:null,fb:"Dossier accepté. 500k€ sur 24 mois. La ceinture recule."},
      {key:"B",label:"Partenariat avec IFREMER",   fx:{plages:0,tourisme:0,env:+2,budget:+3,ceinture:-8},next:null,fb:"Dossier renforcé par IFREMER. 500k€ + data partagée."},
      {key:"C",label:"Pas le temps — autre priorité",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:+5},next:null,fb:"Occasion manquée. Le budget reste serré."},
    ]
  },
  {
    id:"budget_serré", cat:"budget", emoji:"💸", weight:4,
    title:"Budget épuisé à 30%",
    text:"Alerte rouge : ton budget de gestion sargasses est épuisé à 30%. Les contrats de ramassage ne pourront pas être renouvelés dans 5 jours.",
    choices:[
      {key:"A",label:"Demander fonds d'urgence préfecture",fx:{plages:0,tourisme:0,env:0,budget:+4,ceinture:+3},next:null,fb:"Fonds accordés sous conditions de rapport d'activité."},
      {key:"B",label:"Taxe touristique temporaire",        fx:{plages:0,tourisme:-1,env:0,budget:+3,ceinture:0},next:null,fb:"Impopulaire mais efficace. Budget renfloué."},
      {key:"C",label:"Prioriser les zones critiques",      fx:{plages:-1,tourisme:-1,env:0,budget:+2,ceinture:+5},next:null,fb:"Certaines zones sont sacrifiées. Difficile mais nécessaire."},
    ]
  },
  {
    id:"valorisation_bio", cat:"budget", emoji:"🧪", weight:3,
    title:"Startup biotech intéressée",
    text:"Alg'inov, startup réunionnaise, propose de racheter les sargasses collectées pour produire des bioplastiques. 50€/tonne. Tu collectes environ 500t/mois.",
    choices:[
      {key:"A",label:"Signature du contrat",            fx:{plages:0,tourisme:0,env:+2,budget:+4,ceinture:-5},next:null,fb:"25k€/mois de revenus nouveaux. Innovation gagnant-gagnant."},
      {key:"B",label:"Négocier à 80€/tonne",           fx:{plages:0,tourisme:0,env:+2,budget:+3,ceinture:-3},next:["nego_ok","nego_echec"],fb:"La startup hésite..."},
      {key:"C",label:"Etudier d'abord l'impact éco",  fx:{plages:0,tourisme:0,env:+3,budget:-1,ceinture:0},  next:null,fb:"L'étude révèle un impact neutre. Contrat signé plus tard."},
    ]
  },

  // ── SCIENCE & INNOVATION ──────────────────────────────────────────
  {
    id:"ifremer_install", cat:"science", emoji:"🔭", weight:0,
    title:"Centre de suivi opérationnel",
    text:"Le centre de suivi IFREMER-Préfecture est opérationnel. Prédictions à J+5 avec 85% de précision. La communauté scientifique est impressionnée.",
    choices:[
      {key:"A",label:"Ouvrir les données au public",fx:{plages:0,tourisme:+1,env:+2,budget:-1,ceinture:-10},next:null,fb:"Open data. 5 applis mobiles créées par des développeurs locaux."},
      {key:"B",label:"Données réservées gestion",  fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-8},  next:null,fb:"Efficace en interne. Manque de transparence critiqué."},
      {key:"C",label:"Monétiser les données B2B",  fx:{plages:0,tourisme:+1,env:0,budget:+3,ceinture:-5}, next:null,fb:"Hôtels et compagnies maritimes paient pour l'accès."},
    ]
  },
  {
    id:"drone_surveillance", cat:"science", emoji:"🚁", weight:3,
    title:"Projet drones martiniquais",
    text:"Une école d'ingénieurs propose un projet : 6 drones autonomes pour cartographier les sargasses en temps réel. Coût : 80k€. Potentiel exceptionnel.",
    choices:[
      {key:"A",label:"Financer le projet complet",  fx:{plages:0,tourisme:0,env:+2,budget:-4,ceinture:-14},next:null,fb:"Les drones cartographient 90km de côte en 4h. Révolutionnaire."},
      {key:"B",label:"Financer à 50% avec l'école",fx:{plages:0,tourisme:0,env:+1,budget:-2,ceinture:-7}, next:null,fb:"Partenariat gagnant. L'école y gagne aussi."},
      {key:"C",label:"Trop risqué — projet non prouvé",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:+3},next:null,fb:"Prudent mais tu passes à côté d'une innovation."},
    ]
  },
  {
    id:"methane_sarg", cat:"science", emoji:"⚡", weight:2,
    title:"Sargasses = énergie ?",
    text:"Un rapport du CNRS confirme : les sargasses peuvent être méthanisées pour produire du biogaz. Un projet pilote en Guadeloupe produit déjà 200 kWh/tonne.",
    choices:[
      {key:"A",label:"Lancer un projet pilote local",fx:{plages:0,tourisme:0,env:+3,budget:-3,ceinture:-8},next:null,fb:"Martinique produit de l'énergie verte. Modèle exporté."},
      {key:"B",label:"Attendre les résultats GP",   fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:0},  next:null,fb:"Prudent. Tu bénéficieras du retour d'expérience."},
      {key:"C",label:"Proposer à la Région",        fx:{plages:0,tourisme:0,env:+2,budget:+1,ceinture:-4},next:null,fb:"La Région finance 60% du projet."},
    ]
  },
  {
    id:"compost_projet", cat:"science", emoji:"🌱", weight:0,
    title:"Le compost fait des émules",
    text:"Ton projet de compostage intéresse des agriculteurs de Sainte-Marie et du Lamentin. Ils proposent de racheter la biomasse collectée. 30 emplois créés.",
    choices:[
      {key:"A",label:"Structurer la filière",       fx:{plages:0,tourisme:0,env:+3,budget:+3,ceinture:-6},next:null,fb:"Filière circulaire créée. Modèle économique vertueux."},
      {key:"B",label:"Subventionner les agriculteurs",fx:{plages:0,tourisme:0,env:+2,budget:-2,ceinture:-4},next:null,fb:"30 emplois créés. Presse favorable."},
      {key:"C",label:"Étude d'impact d'abord",      fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:0},  next:null,fb:"Rigoureux. L'étude valide la piste."},
    ]
  },

  // ── ÉVÉNEMENTS ALÉATOIRES — LOCAL FLAVOR ──────────────────────────
  {
    id:"tortue_sarg", cat:"nature", emoji:"🐢", weight:3,
    title:"Tortues luth piégées",
    text:"Des images de tortues luth emmêlées dans les sargasses circulent sur les réseaux. WWF et Sea Shepherd réagissent. La pression internationale monte.",
    choices:[
      {key:"A",label:"Mission de sauvetage tortues",fx:{plages:0,tourisme:+1,env:+3,budget:-2,ceinture:-4},next:null,fb:"Images positives. Don WWF reçu. Ceinture recule."},
      {key:"B",label:"Créer des corridors de migration",fx:{plages:0,tourisme:0,env:+4,budget:-3,ceinture:-6},next:null,fb:"Innovation environnementale saluée à l'ONU."},
      {key:"C",label:"Communiqué de sensibilisation",  fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:0}, next:null,fb:"Message positif. Insuffisant face à la réalité."},
    ]
  },
  {
    id:"poulpe_content", cat:"nature", emoji:"🐙", weight:2,
    title:"Les poulpes adorent ça",
    text:"Un biologiste local découvre que les sargasses créent un habitat pour les poulpes et langoustes dans certaines baies. Potentiel pour la pêche artisanale.",
    choices:[
      {key:"A",label:"Créer des zones de pêche sargasses",fx:{plages:0,tourisme:+1,env:+2,budget:+2,ceinture:0},next:null,fb:"Paradoxe productif. Les pêcheurs récoltent 40% de plus."},
      {key:"B",label:"Étude scientifique complète",      fx:{plages:0,tourisme:0,env:+3,budget:-1,ceinture:-3},next:null,fb:"Publication internationale. Nouvelle vision des sargasses."},
      {key:"C",label:"Rien à changer",                  fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:0},  next:null,fb:"Opportunité partielle manquée."},
    ]
  },
  {
    id:"enfants_ecole", cat:"social", emoji:"👦", weight:2,
    title:"Programme scolaire sargasses",
    text:"Une école primaire de Fort-de-France propose un projet pédagogique sur les sargasses : sortie de terrain, mesures AFAI simulées, présentation aux parents.",
    choices:[
      {key:"A",label:"Financer et participer",     fx:{plages:0,tourisme:+1,env:+1,budget:-1,ceinture:-3},next:null,fb:"Geste fort. Ces enfants seront les vigiles de demain."},
      {key:"B",label:"Envoyer un kit pédagogique",fx:{plages:0,tourisme:0,env:+1,budget:-1,ceinture:-2},  next:null,fb:"Apprécié. Les enfants font une vidéo virale."},
      {key:"C",label:"Rediriger vers IFREMER",    fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-1},   next:null,fb:"IFREMER répond favorablement."},
    ]
  },
  {
    id:"carnaval_plage", cat:"tourisme", emoji:"🥁", weight:2,
    title:"Carnaval aux Trois-Îlets",
    text:"Le groupe folklorique des Trois-Îlets veut organiser une fête de clôture du carnaval sur la plage. Les sargasses pourraient gâcher l'événement médiatisé.",
    choices:[
      {key:"A",label:"Nettoyage express avant la fête",fx:{plages:+2,tourisme:+3,env:-1,budget:-2,ceinture:0},next:null,fb:"Fête magnifique. 10k vues live sur Instagram."},
      {key:"B",label:"Reporter sur une plage propre",   fx:{plages:0,tourisme:+2,env:0,budget:-1,ceinture:0},next:null,fb:"La fête a lieu à Grande Anse. Succès."},
      {key:"C",label:"Annuler — trop risqué",           fx:{plages:0,tourisme:-2,env:0,budget:0,ceinture:0}, next:null,fb:"Déçus. Les groupes choisissent Sainte-Lucie l'an prochain."},
    ]
  },
  {
    id:"plongeurs_alerte", cat:"nature", emoji:"🤿", weight:3,
    title:"Plongeurs signalent une catastrophe",
    text:"Des moniteurs de plongée du Rocher du Diamant signalent que le fond marin est recouvert d'algues mortes en décomposition. Désoxygénation probable.",
    choices:[
      {key:"A",label:"Mission d'évaluation urgente",   fx:{plages:0,tourisme:0,env:+2,budget:-2,ceinture:-5},next:null,fb:"Évaluation réalisée. Zone en récupération sous surveillance."},
      {key:"B",label:"Fermer zone aux plongeurs",      fx:{plages:0,tourisme:-2,env:+3,budget:-1,ceinture:0},next:null,fb:"Protection efficace mais les plongeurs mécontents."},
      {key:"C",label:"Installer oxygénation artificielle",fx:{plages:0,tourisme:0,env:+2,budget:-3,ceinture:-3},next:null,fb:"Innovation. Résultats positifs en 3 semaines."},
    ]
  },

  // ── ÉVÉNEMENTS DE CONSÉQUENCES ─────────────────────────────────────
  {
    id:"scandale_h2s", cat:"crise", emoji:"🔴", weight:0,
    title:"Scandale H2S révélé",
    text:"Le journaliste avait tout. La minimisation de l'alerte H2S est étalée en une de France-Antilles. La famille hospitalisée porte plainte. Crise de confiance totale.",
    choices:[
      {key:"A",label:"Mea culpa public + démission cabinet",fx:{plages:0,tourisme:-2,env:0,budget:-2,ceinture:+5},next:null,fb:"Douloureux mais nécessaire. La crédibilité se reconstruit."},
      {key:"B",label:"Contre-expertise indépendante",       fx:{plages:0,tourisme:-1,env:0,budget:-2,ceinture:+3},next:null,fb:"L'expertise confirme la faute. Amende payée."},
      {key:"C",label:"Attaquer le journaliste en justice",  fx:{plages:0,tourisme:-4,env:0,budget:-3,ceinture:+8},next:null,fb:"Catastrophique. Boycott international. Tourisme -40%."},
    ]
  },
  {
    id:"nappe_devia", cat:"satellite", emoji:"🎯", weight:0,
    title:"La nappe a dévié — prédiction exacte",
    text:"Le modèle NEMO avait raison. Les alizés ont dévié la nappe vers le large. Les plages Atlantique sont épargnées. Ton équipe a bien géré.",
    choices:[
      {key:"A",label:"Publier le succès du modèle",fx:{plages:0,tourisme:+2,env:+1,budget:+1,ceinture:-5},next:null,fb:"Bonne comm. Confiance renforcée dans la science."},
      {key:"B",label:"Briefer la préfecture",       fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-3},  next:null,fb:"La préfecture est rassurée et convaincu de l'utilité du système."},
      {key:"C",label:"Continuer la surveillance",  fx:{plages:0,tourisme:0,env:+2,budget:-1,ceinture:-4},  next:null,fb:"Vigilance maintenue. Sage."},
    ]
  },
  {
    id:"maree_aide", cat:"meteo", emoji:"🌊", weight:0,
    title:"La marée nettoie tout",
    text:"Coup de chance. La grande marée a remporté 60% des sargasses échouées vers le large. Les plages semblent nettoyées naturellement.",
    choices:[
      {key:"A",label:"Profiter pour attirer touristes",fx:{plages:+1,tourisme:+3,env:0,budget:+1,ceinture:-3},next:null,fb:"Timing parfait. Les hôteliers heureux."},
      {key:"B",label:"Surveiller où elles vont",      fx:{plages:+1,tourisme:+1,env:+2,budget:-1,ceinture:-5},next:null,fb:"La surveillance permet de prévoir la prochaine arrivée."},
      {key:"C",label:"Rien — la nature fait son travail",fx:{plages:0,tourisme:+1,env:+1,budget:0,ceinture:0},next:null,fb:"Décontracté. Ça n'arrive pas à chaque fois."},
    ]
  },
  {
    id:"maree_empire", cat:"meteo", emoji:"🌊", weight:0,
    title:"La marée empire les choses",
    text:"La grande marée a concentré les sargasses sur 3 plages du sud. Les Salines et le Diamant sont maintenant recouverts à 80%.",
    choices:[
      {key:"A",label:"Ramassage d'urgence immédiat",fx:{plages:+2,tourisme:-1,env:-1,budget:-4,ceinture:0},next:null,fb:"Opération nuit. Plages récupérées en 20h."},
      {key:"B",label:"Trier les priorités",         fx:{plages:+1,tourisme:+1,env:-1,budget:-2,ceinture:0},next:null,fb:"Diamant sacrifié. Salines sauvées. Choix douloureux."},
      {key:"C",label:"Attendre la prochaine marée", fx:{plages:-2,tourisme:-3,env:0,budget:0,ceinture:+5},next:null,fb:"Mauvais pari. La prochaine marée apporte plus de sargasses."},
    ]
  },
  {
    id:"alize_aide", cat:"meteo", emoji:"💨", weight:0,
    title:"L'alizé repousse les sargasses",
    text:"Les alizés ont parfaitement joué leur rôle. Les nappes remises en mer dérivent vers le nord-est, loin des côtes martiniquaises. Victoire tactique.",
    choices:[
      {key:"A",label:"Documenter la méthode",fx:{plages:0,tourisme:0,env:+2,budget:-1,ceinture:-8},next:null,fb:"Publication scientifique. La méthode est adoptée en Guadeloupe."},
      {key:"B",label:"Célébrer avec les équipes",fx:{plages:0,tourisme:+1,env:+1,budget:-1,ceinture:-4},next:null,fb:"Moral renforcé. Tes équipes sont motivées."},
      {key:"C",label:"Rester vigilant",         fx:{plages:0,tourisme:0,env:+1,budget:0,ceinture:-3},  next:null,fb:"Sage. Elles reviendront."},
    ]
  },
  {
    id:"alize_echoue", cat:"meteo", emoji:"💨", weight:0,
    title:"L'alizé se retourne contre toi",
    text:"Le vent a changé de direction. Les sargasses remises en mer reviennent — et ont accumulé plus de masse. La côte Caraïbe est maintenant touchée aussi.",
    choices:[
      {key:"A",label:"Mobilisation totale des équipes",fx:{plages:+1,tourisme:-1,env:-1,budget:-4,ceinture:+5},next:null,fb:"Double front géré. Épuisant et coûteux."},
      {key:"B",label:"Demander renforts Guadeloupe",    fx:{plages:+1,tourisme:-1,env:0,budget:-2,ceinture:+3}, next:null,fb:"Solidarité insulaire. Renforts arrivés en 12h."},
      {key:"C",label:"Prioriser côte Caraïbe",          fx:{plages:0,tourisme:+1,env:-2,budget:-2,ceinture:+6}, next:null,fb:"Atlantique abandonnée temporairement."},
    ]
  },
  {
    id:"hoteliers_negocient", cat:"tourisme", emoji:"🤝", weight:0,
    title:"Les hôteliers proposent un fonds",
    text:"Surpris par ta transparence, les grands hôteliers de Martinique créent un fonds commun de 300k€ pour la gestion des sargasses. Ils veulent s'impliquer.",
    choices:[
      {key:"A",label:"Accepter avec gouvernance partagée",fx:{plages:+1,tourisme:+2,env:+1,budget:+4,ceinture:-10},next:null,fb:"Alliance inédite. Modèle PPP reconnu par l'ADEME."},
      {key:"B",label:"Accepter les fonds seulement",      fx:{plages:0,tourisme:+1,env:0,budget:+3,ceinture:-5},  next:null,fb:"Pragmatique. Tension sur la gouvernance mais ça marche."},
      {key:"C",label:"Refuser — conflit d'intérêt",       fx:{plages:0,tourisme:-1,env:+1,budget:0,ceinture:0},   next:null,fb:"Intègre mais tu refuses un levier important."},
    ]
  },

  // ── ÉVÉNEMENT VICTOIRE (jour 30) ───────────────────────────────────
  {
    id:"fin_30j", cat:"victory", emoji:"🏆", day:30, forced:true,
    title:"30 jours — Bilan final",
    text:"Tu as tenu 30 jours. La Martinique a traversé une crise sargasses majeure. Selon tes décisions, l'île sort renforcée... ou fragilisée.",
    choices:[
      {key:"A",label:"Voir mon bilan complet",fx:{plages:0,tourisme:0,env:0,budget:0,ceinture:0},next:"victory",fb:""},
    ]
  },
]

// ── Pools de tirage selon la ceinture ─────────────────────────────────
function pickEvent(day, belt, usedIds, lastId, events=EVENTS){
  const forced=events.find(e=>e.forced && e.day===day && !usedIds.includes(e.id))
  if(forced) return forced

  if(day>0 && day%7===0 && !usedIds.includes("scan_hebdo")){
    return events.find(e=>e.id==="scan_hebdo")
  }

  let pool=events.filter(e=>
    !e.forced &&
    !["tutorial","victory","scan_hebdo"].includes(e.cat) &&
    e.weight>0 &&
    e.id!==lastId
  )

  // Si ceinture haute → plus de crises
  if(belt>70){
    pool=pool.map(e=>({
      ...e,
      w: e.cat==="crise"||e.cat==="satellite" ? e.weight*3 : e.weight
    }))
  } else if(belt<30){
    pool=pool.map(e=>({
      ...e,
      w: e.cat==="tourisme"||e.cat==="science" ? e.weight*2 : e.weight
    }))
  } else {
    pool=pool.map(e=>({...e,w:e.weight}))
  }

  // Weighted random
  const total=pool.reduce((a,e)=>a+(e.w||0),0)
  let r=Math.random()*total
  for(const e of pool){
    r-=(e.w||0)
    if(r<=0) return e
  }
  return pool[Math.floor(Math.random()*pool.length)]
}

// ── Utils ──────────────────────────────────────────────────────────────
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const ls=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const lw=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}

// ── CSS ────────────────────────────────────────────────────────────────
const CSS=`
${GFONTS}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:${T.void};font-family:'Bricolage Grotesque',sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;height:100%;color:${T.w}}
::-webkit-scrollbar{display:none}
*{-webkit-tap-highlight-color:transparent}

@keyframes dealIn   {from{opacity:0;transform:translateY(60px) scale(.92) rotate(-1.5deg)}to{opacity:1;transform:translateY(0) scale(1) rotate(0deg)}}
@keyframes exitL    {to{opacity:0;transform:translateX(-140%) rotate(-18deg)}}
@keyframes exitR    {to{opacity:0;transform:translateX(140%) rotate(18deg)}}
@keyframes exitU    {to{opacity:0;transform:translateY(-80%) scale(.9)}}
@keyframes shake    {0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
@keyframes popIn    {0%{transform:scale(0) rotate(-10deg)}70%{transform:scale(1.12) rotate(2deg)}100%{transform:scale(1) rotate(0deg)}}
@keyframes up       {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse    {0%,100%{opacity:1}50%{opacity:.35}}
@keyframes breathe  {0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes beltSpin {0%{stroke-dashoffset:0}100%{stroke-dashoffset:-50}}
@keyframes glow     {0%,100%{filter:drop-shadow(0 0 0px transparent)}50%{filter:drop-shadow(0 0 14px currentColor)}}
@keyframes confetti {to{transform:translateY(110vh) rotate(720deg);opacity:0}}
@keyframes floatEmoji{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-12px) rotate(3deg)}}
@keyframes fadeIn   {from{opacity:0}to{opacity:1}}
@keyframes countUp  {from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ringPulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.5);opacity:0}}

.card-in  {animation:dealIn .45s cubic-bezier(.16,1,.3,1) both}
.exit-L   {animation:exitL .35s cubic-bezier(.4,0,.8,1) both}
.exit-R   {animation:exitR .35s cubic-bezier(.4,0,.8,1) both}
.exit-U   {animation:exitU .28s ease-in both}
.shake    {animation:shake .35s ease}

.btn-choice {
  width:100%;padding:12px 16px;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.1);border-radius:14px;
  font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:600;
  color:${T.w};cursor:pointer;text-align:left;transition:all .2s;
  display:flex;align-items:center;gap:10;letter-spacing:.02em;
}
.btn-choice:hover{background:rgba(0,200,190,.12);border-color:rgba(0,200,190,.3);transform:translateX(3px)}
.btn-choice:active{transform:scale(.97)}
.key-badge{
  width:24px;height:24px;border-radius:7px;background:rgba(0,200,190,.15);
  border:1px solid rgba(0,200,190,.3);font-size:13px;font-weight:700;
  color:${T.cyan};display:flex;align-items:center;justify-content:center;
  flex-shrink:0;font-family:'JetBrains Mono',monospace;letter-spacing:0;
}

/* Resource bars */
.res-bar-track{height:7px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;flex:1}
.res-bar-fill{height:100%;border-radius:4px;transition:width .8s cubic-bezier(.16,1,.3,1)}

/* Belt SVG ring */
.belt-ring{transition:stroke-dasharray .8s cubic-bezier(.16,1,.3,1)}

/* Feedback toast */
.fb-toast{position:absolute;bottom:0;left:50%;transform:translateX(-50%) translateY(110%);
  background:${T.surface};border:1px solid ${T.borderL};border-radius:14px;
  padding:10px 16px;font-size:15px;font-weight:600;color:${T.w};
  white-space:nowrap;text-align:center;z-index:20;
  transition:transform .35s cubic-bezier(.16,1,.3,1);max-width:90%}
.fb-toast.show{transform:translateX(-50%) translateY(-10px)}

/* Desktop layout */
@media(min-width:700px){
  .game-layout{display:flex!important;align-items:flex-start;justify-content:center;gap:28px;padding:24px!important}
  .card-col{width:360px!important;flex-shrink:0}
  .info-col{width:260px;display:flex!important;flex-direction:column;gap:14px;padding-top:8px}
  .mobile-belt{display:none!important}
  .desktop-belt{display:block!important}
}
@media(max-width:699px){
  .desktop-belt{display:none!important}
  .game-layout{padding:8px 10px 8px!important}
  .btn-choice{padding:10px 12px!important;font-size:14px!important}
}
@media(max-width:380px){
  .btn-choice{padding:8px 10px!important;font-size:13px!important}
  .key-badge{width:20px!important;height:20px!important;font-size:11px!important}
}
`

// ════════════════════════════════════════════════════════════════════════
// COMPOSANTS UI
// ════════════════════════════════════════════════════════════════════════

function Confetti(){
  const cols=["#00EEE4","#F0A800","#FFD166","#22C77A","#fff","#B026FF","#E83030"]
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,pointerEvents:"none",overflow:"hidden"}}>
      {Array.from({length:80},(_,i)=><div key={i} style={{position:"absolute",left:`${2+Math.random()*96}%`,top:-14,width:Math.random()>.5?8:12,height:6,borderRadius:Math.random()>.6?"50%":"2px",background:cols[i%cols.length],animation:`confetti ${1.5+Math.random()*1.8}s ease-in ${Math.random()*1}s both`,transform:`rotate(${Math.random()*360}deg)`}}/>)}
    </div>
  )
}

// La Ceinture — anneau SVG de menace
function BeltRing({belt,size=140}){
  const r=size*.38
  const circ=2*Math.PI*r
  const fill=clamp(belt,0,100)/100
  const color=belt>70?T.danger:belt>40?T.warn:T.safe
  const cx=size/2,cy=size/2

  return(
    <div style={{position:"relative",width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={size} height={size} style={{position:"absolute",inset:0,transform:"rotate(-90deg)"}}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={size*.045}/>
        {/* Fill */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size*.045}
          strokeDasharray={`${fill*circ} ${circ}`}
          strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 6px ${color})`,transition:"stroke-dasharray .8s cubic-bezier(.16,1,.3,1), stroke .4s"}}
        />
        {/* Pulse ring when high */}
        {belt>70&&<circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2} strokeOpacity=".3" style={{animation:"ringPulse 2s ease-out infinite"}}/>}
      </svg>
      {/* Center */}
      <div style={{textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:size*.18,fontWeight:700,color,lineHeight:1,transition:"color .4s"}}>{belt}</div>
        <div style={{fontSize:size*.09,fontWeight:700,color:T.mute,letterSpacing:".06em",textTransform:"uppercase",marginTop:2}}>ceinture</div>
      </div>
    </div>
  )
}

// Barre de ressource
function ResBar({icon,label,value,color,delta}){
  const pct=Math.max(0,Math.min(100,value*10))
  const low=value<=2
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
      <div style={{fontSize:15,width:20,textAlign:"center",flexShrink:0}}>{icon}</div>
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
          <span style={{fontSize:12,fontWeight:700,color:low?T.danger:T.m,letterSpacing:".04em",textTransform:"uppercase"}}>{label}</span>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            {delta!==0&&<span style={{fontSize:10,fontWeight:700,color:delta>0?T.safe:T.danger,animation:"popIn .3s ease both"}}>{delta>0?"+":""}{delta}</span>}
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:low?T.danger:T.mute,fontWeight:700}}>{value}/10</span>
          </div>
        </div>
        <div className="res-bar-track">
          <div className="res-bar-fill" style={{width:`${pct}%`,background:low?`linear-gradient(90deg,${T.danger},${T.warn})`:`linear-gradient(90deg,${color},${color}99)`,boxShadow:low?`0 0 8px ${T.danger}50`:`0 0 6px ${color}40`}}/>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// GAME CARD
// ════════════════════════════════════════════════════════════════════════
function GameCard({event,onChoice,day,maxDays,feedback,exitDir}){
  const [hovKey,setHovKey]=useState(null)
  const cardRef=useRef()
  const touchX=useRef(null)
  const touchY=useRef(null)
  const [dragX,setDragX]=useState(0)
  const [dragging,setDragging]=useState(false)

  // Keyboard
  useEffect(()=>{
    function onKey(e){
      const keys={a:"A",b:"B",c:"C",1:"A",2:"B",3:"C"}
      const k=keys[e.key.toLowerCase()]
      if(k){const ch=event.choices.find(c=>c.key===k);if(ch)onChoice(ch,k==="A"?"L":k==="B"?"R":"U")}
    }
    window.addEventListener("keydown",onKey)
    return()=>window.removeEventListener("keydown",onKey)
  },[event])

  // Touch swipe
  function onTS(e){touchX.current=e.touches[0].clientX;touchY.current=e.touches[0].clientY;setDragging(true)}
  function onTM(e){
    if(!dragging) return
    const dx=e.touches[0].clientX-touchX.current
    setDragX(dx)
  }
  function onTE(){
    if(!dragging){setDragX(0);return}
    const dx=dragX
    setDragging(false);setDragX(0)
    if(Math.abs(dx)>60){
      if(dx<0 && event.choices.length>=1) onChoice(event.choices[0],"L")
      else if(dx>0 && event.choices.length>=2) onChoice(event.choices[1],"R")
    }
  }

  const exitClass=exitDir==="L"?"exit-L":exitDir==="R"?"exit-R":exitDir==="U"?"exit-U":""
  const tiltDeg=dragging?clamp(dragX/8,-12,12):0
  const hintL=dragging&&dragX<-40
  const hintR=dragging&&dragX>40

  const catColor={satellite:T.cyan,crise:T.danger,meteo:"#60B4D0",tourisme:T.sargL,social:"#A0C0D0",budget:T.safe,science:T.h2s,nature:T.safe,tutorial:T.cyan,victory:T.sargLL}

  return(
    <div style={{width:"100%",maxWidth:400,position:"relative"}}
      onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>

      {/* Swipe hints */}
      {event.choices.length>=2&&<>
        <div style={{position:"absolute",left:4,top:"50%",transform:"translateY(-50%)",opacity:hintL?.9:.1,transition:"opacity .2s",zIndex:5,pointerEvents:"none",fontSize:10,fontWeight:700,color:catColor[event.cat]||T.cyan,letterSpacing:".04em",textTransform:"uppercase",textAlign:"right",lineHeight:1.5}}>
          ←
        </div>
        <div style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",opacity:hintR?.9:.1,transition:"opacity .2s",zIndex:5,pointerEvents:"none",fontSize:10,fontWeight:700,color:catColor[event.cat]||T.cyan,letterSpacing:".04em",lineHeight:1.5}}>
          →
        </div>
      </>}

      {/* Card */}
      <div ref={cardRef} className={`${exitDir?"":""} ${exitClass}`}
        style={{
          background:`radial-gradient(ellipse at 30% 0%,rgba(0,150,140,.12),transparent 55%),${T.surface}`,
          border:`1.5px solid ${T.borderL}`,
          borderRadius:22,
          padding:"clamp(12px, 3vw, 22px) clamp(14px, 3vw, 20px) clamp(10px, 2vw, 16px)",
          position:"relative",overflow:"hidden",
          transform:`rotate(${tiltDeg}deg) translateX(${dragX*.15}px)`,
          transition:dragging?"none":"transform .3s cubic-bezier(.34,1.56,.64,1)",
          boxShadow:`0 24px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04), 0 0 40px ${catColor[event.cat]||T.cyan}10`,
          animation: exitDir?"none":"dealIn .45s cubic-bezier(.16,1,.3,1) both",
          userSelect:"none",WebkitUserSelect:"none",
        }}>

        {/* Top bar */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${catColor[event.cat]||T.cyan},${catColor[event.cat]||T.cyan}00)`,borderRadius:"22px 22px 0 0"}}/>

        {/* Day + category */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{background:T.cyanBg,borderRadius:100,padding:"3px 10px",fontSize:11,fontWeight:800,color:T.cyan,letterSpacing:".06em"}}>Jour {day}</div>
            <div style={{background:"rgba(255,255,255,.05)",borderRadius:100,padding:"3px 9px",fontSize:10,fontWeight:700,color:T.mute,textTransform:"uppercase",letterSpacing:".06em"}}>{event.cat}</div>
          </div>
          <div style={{fontSize:10,fontWeight:600,color:T.mute,fontFamily:"JetBrains Mono"}}>{day}/{maxDays}</div>
        </div>

        {/* Emoji */}
        <div style={{fontSize:"clamp(36px, 10vw, 54px)",marginBottom:8,textAlign:"center",lineHeight:1,animation:"floatEmoji 4s ease-in-out infinite"}}>{event.emoji}</div>

        {/* Title */}
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(18px, 5vw, 24px)",letterSpacing:".04em",textTransform:"uppercase",color:T.w,textAlign:"center",lineHeight:1.1,marginBottom:8}}>
          {event.title}
        </div>

        {/* Text */}
        <div style={{fontSize:"clamp(12px, 3.5vw, 15px)",color:T.m,lineHeight:1.6,textAlign:"center",marginBottom:14,fontWeight:500}}>
          {event.text}
        </div>

        {/* Choices */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {event.choices.map(ch=>(
            <button key={ch.key} className="btn-choice"
              onMouseEnter={()=>setHovKey(ch.key)}
              onMouseLeave={()=>setHovKey(null)}
              onClick={()=>onChoice(ch,ch.key==="A"?"L":ch.key==="B"?"R":"U")}>
              <span className="key-badge">{ch.key}</span>
              <span style={{flex:1,fontSize:15,fontWeight:600,letterSpacing:".02em"}}>{ch.label}</span>
              {/* Effect preview on hover */}
              {hovKey===ch.key&&<div style={{display:"flex",gap:4,marginLeft:"auto",flexShrink:0}}>
                {Object.entries(ch.fx).filter(([k])=>k!=="ceinture").map(([k,v])=>{
                  if(v===0) return null
                  const icons={plages:"🌴",tourisme:"💰",env:"🌿",budget:"⚙️"}
                  return <span key={k} style={{fontSize:11,fontWeight:800,color:v>0?T.safe:T.danger,background:"rgba(0,0,0,.3)",borderRadius:6,padding:"2px 5px"}}>{icons[k]}{v>0?"+":""}{v}</span>
                })}
              </div>}
            </button>
          ))}
        </div>

        {/* Swipe hint footer */}
        {event.choices.length>=2&&<div style={{textAlign:"center",marginTop:10,fontSize:10,color:T.mute,fontWeight:600,letterSpacing:".06em"}}>SWIPE ← A · B → · TAP C</div>}
      </div>

      {/* Feedback */}
      <div className={`fb-toast${feedback?" show":""}`}>{feedback}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// GAME OVER / VICTORY screens
// ════════════════════════════════════════════════════════════════════════
function GameOver({reason,res,belt,day,bestScore,onRestart,island}){
  const isVictory=reason==="victory"
  const islandName = island === "gp" ? "Guadeloupe" : "Martinique"
  const msgs={
    plages:["Les plages sont mortes.","Les touristes ne reviendront plus.",`${islandName} a perdu son âme.`],
    tourisme:["L'économie s'effondre.","Le tourisme ne reviendra pas cette saison.","Les hôtels ferment les uns après les autres."],
    budget:["Tu es à court de fonds.","Sans budget, impossible de nettoyer quoi que ce soit.","La ceinture a gagné."],
    victory:["Tu as tenu 30 jours.",`La ${islandName} a survécu à la crise sargasses.`,`Tes décisions ont fait la différence.`],
  }
  const score=Math.round((res.plages+res.tourisme+res.env+res.budget)*10/4*(day/30)*((100-belt)/100))
  const medal=score>=80?"🥇":score>=50?"🥈":score>=30?"🥉":"😞"

  return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 24px calc(24px + env(safe-area-inset-bottom, 0px))",background:`radial-gradient(ellipse at 50% 0%,${isVictory?"rgba(34,199,122,.1)":"rgba(232,48,48,.12)"},transparent 60%), ${T.deep}`,overflow:"auto",WebkitOverflowScrolling:"touch"}}>
      {isVictory&&<Confetti/>}

      <div style={{fontSize:72,marginBottom:12,animation:"floatEmoji 3s ease-in-out infinite"}}>{isVictory?"🏆":reason==="budget"?"💸":reason==="tourisme"?"✈️":"🌿"}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:28,textTransform:"uppercase",letterSpacing:".06em",color:isVictory?T.safe:T.danger,textAlign:"center",marginBottom:6,animation:"up .5s ease both"}}>{isVictory?"Mission accomplie":"Défaite"}</div>
      <div style={{fontSize:15,color:T.m,textAlign:"center",lineHeight:1.7,maxWidth:320,marginBottom:18,animation:"up .5s ease .1s both"}}>
        {msgs[isVictory?"victory":reason]?.join(" ")}
      </div>

      {/* Score */}
      <div style={{display:"flex",alignItems:"center",gap:12,background:T.surface,border:`1px solid ${T.borderL}`,borderRadius:18,padding:"14px 22px",marginBottom:18,animation:"countUp .6s cubic-bezier(.16,1,.3,1) .2s both"}}>
        <span style={{fontSize:36}}>{medal}</span>
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:40,color:isVictory?T.sargLL:T.danger,lineHeight:1}}>{score}</div>
          <div style={{fontSize:11,color:T.mute,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase"}}>Score · Jour {day}</div>
        </div>
        {score>bestScore&&<div style={{background:T.sargBg,border:`1px solid ${T.sarg}44`,borderRadius:100,padding:"4px 10px",fontSize:10,fontWeight:800,color:T.sargL,letterSpacing:".08em"}}>RECORD !</div>}
      </div>

      {/* Ressources finales */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20,width:"100%",maxWidth:320,animation:"up .4s ease .3s both"}}>
        {[{l:"Plages",i:"🌴",v:res.plages,c:T.safe},{l:"Tourisme",i:"💰",v:res.tourisme,c:T.sargL},{l:"Env.",i:"🌿",v:res.env,c:T.safe},{l:"Budget",i:"⚙️",v:res.budget,c:T.cyan}].map(r=>(
          <div key={r.l} style={{background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>{r.i}</span>
            <div><div style={{fontSize:16,fontWeight:800,color:r.v<=2?T.danger:T.w,fontFamily:"JetBrains Mono"}}>{r.v}/10</div><div style={{fontSize:10,color:T.mute,fontWeight:700,textTransform:"uppercase"}}>{r.l}</div></div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:320}}>
        <button onClick={onRestart} style={{padding:"14px",background:`linear-gradient(135deg,${T.cyanL},${T.cyan})`,color:T.void,border:"none",borderRadius:14,fontFamily:"'Anton',sans-serif",fontSize:17,letterSpacing:".08em",cursor:"pointer",boxShadow:`0 4px 20px ${T.cyan}35`}}>
          REJOUER
        </button>
        <div style={{fontSize:11,color:T.mute,textAlign:"center",lineHeight:1.7}}>
          {isVictory?"💡 La science sargasses reste ta meilleure alliée dans l'app SARG.":"💡 Conseil : la recherche scientifique et les partenariats rapportent à long terme."}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// MAIN GAME
// ════════════════════════════════════════════════════════════════════════
const MAX_DAYS=30
const INIT_RES={plages:7,tourisme:7,env:7,budget:7}
const INIT_BELT=35

export default function SargassesGame({ island = "mq" }){
  const [gameState,setGameState]=useState("intro")
  const [day,setDay]=useState(1)
  const [res,setRes]=useState({...INIT_RES})
  const [belt,setBelt]=useState(INIT_BELT)
  const [currentEvent,setCurrentEvent]=useState(null)
  const [usedIds,setUsedIds]=useState([])
  const [lastId,setLastId]=useState(null)
  const [exitDir,setExitDir]=useState(null)
  const [feedback,setFeedback]=useState("")
  const [showFb,setShowFb]=useState(false)
  const [gameOverReason,setGameOverReason]=useState(null)
  const [deltas,setDeltas]=useState({plages:0,tourisme:0,env:0,budget:0})
  const [bestScore,setBestScore]=useState(()=>ls("sg_best",0))
  const [history,setHistory]=useState([])
  const fbTimer=useRef(null)

  const isGP = island === "gp"
  const events = useMemo(() => {
    if (!isGP) return EVENTS
    const r = (s) => {
      if (!s) return s
      let t = String(s)
        // Lieux et noms propres GP (avant remplacements génériques)
        .replace(/Rocher du Diamant/g,"Ilet du Gosier")
        .replace(/mairie du Diamant/g,"mairie de Saint-François")
        .replace(/Grande Anse d'Arlet|Anse Mitan/g,"Malendure")
        .replace(/Tartane/g,"Pointe des Châteaux")
        .replace(/Les Salines/g,"Anse de la Gourde")
        .replace(/Le Robert\b/g,"Le Moule").replace(/\bRobert\b/g,"Moule")
        .replace(/\bDiamant\b/g,"Saint-François")
        .replace(/\bet le Diamant\b/g,"et Saint-François")
        .replace(/\bDiamant et le Diamant\b/g,"Saint-François et le Gosier")
        .replace(/aux Trois-Îlets\b/g,"au Gosier")
        .replace(/des Trois-Îlets\b/g,"du Gosier")
        .replace(/des Trois Îlets\b/g,"du Gosier")
        .replace(/\bTrois Îlets\b|\bTrois-Îlets\b/g,"Le Gosier")
        .replace(/Résidence des Trois Îlets/g,"Résidence du Gosier")
        .replace(/Sainte-Marie\b/g,"Saint-François")
        .replace(/\bLamentin\b/g,"Morne-à-l'Eau")
        .replace(/Fort-de-France/g,"Pointe-à-Pitre")
        .replace(/Meynard/g,"CHU Pointe-à-Pitre")
        .replace(/mairie du Diamant/g,"mairie de Saint-François")
        .replace(/Sainte-Anne\b/g,"Sainte-Anne") // existe dans les deux
        // Île courante
        .replace(/Martinique/g,"Guadeloupe")
        .replace(/\bmartiniquais\b/g,"guadeloupéen")
        .replace(/\bmartiniquaises\b/g,"guadeloupéennes")
        .replace(/volontaires guadeloupéen\b/g,"volontaires guadeloupéens")
        .replace(/drones guadeloupéen\b/g,"drones guadeloupéens")
        .replace(/Projet drones guadeloupéen\b/g,"Projet drones guadeloupéens")
        .replace(/côtes guadeloupéenne\b/g,"côtes guadeloupéennes")
        // Quand on est en GP, l'« autre île » = Martinique
        .replace(/Modèle exporté en Guadeloupe/g,"Modèle exporté en Martinique")
        .replace(/adoptée en Guadeloupe/g,"adoptée en Martinique")
        .replace(/renforts Guadeloupe/g,"renforts Martinique")
        .replace(/résultats GP\b/g,"résultats MQ")
        .replace(/Attendre les résultats MQ/g,"Attendre les résultats Martinique")
        .replace(/projet pilote en Guadeloupe produit/g,"projet pilote en Martinique produit")
      return t
    }
    return EVENTS.map(e=>({ ...e, title: r(e.title), text: r(e.text), choices: e.choices.map(c=>({ ...c, label: r(c.label), fb: r(c.fb) })) }))
  }, [isGP])

  // Belt natural increase
  const beltDrift=belt>60?2:belt>40?1.5:1

  function startGame(){
    setGameState("playing")
    setDay(1);setRes({...INIT_RES});setBelt(INIT_BELT)
    setUsedIds([]);setLastId(null);setFeedback("");setShowFb(false);setHistory([])
    setDeltas({plages:0,tourisme:0,env:0,budget:0})
    const first=events.find(e=>e.forced&&e.day===1)
    setCurrentEvent(first||pickEvent(1,INIT_BELT,[],null,events))
  }

  function applyChoice(choice,dir){
    clearTimeout(fbTimer.current)

    const fx=choice.fx
    const newRes={
      plages: clamp(res.plages+fx.plages,0,10),
      tourisme:clamp(res.tourisme+fx.tourisme,0,10),
      env:     clamp(res.env+fx.env,0,10),
      budget:  clamp(res.budget+fx.budget,0,10),
    }
    const newBelt=clamp(belt+fx.ceinture+beltDrift,0,100)
    const newDay=day+1

    setDeltas({plages:fx.plages,tourisme:fx.tourisme,env:fx.env,budget:fx.budget})
    setExitDir(dir)
    setFeedback(choice.fb)
    setShowFb(true)

    // Add to history
    setHistory(h=>[{event:currentEvent,choice,day},...h].slice(0,10))

    fbTimer.current=setTimeout(()=>{
      setRes(newRes)
      setBelt(newBelt)
      setExitDir(null)
      setShowFb(false)

      // Check game over
      const dead=Object.entries(newRes).find(([,v])=>v<=0)
      if(dead){
        setGameOverReason(dead[0])
        setGameState("gameover")
        return
      }
      if(choice.next==="victory"||newDay>MAX_DAYS){
        setGameOverReason("victory")
        setGameState("gameover")
        const score=Math.round((newRes.plages+newRes.tourisme+newRes.env+newRes.budget)*10/4*(newDay/MAX_DAYS)*((100-newBelt)/100))
        if(score>bestScore){setBestScore(score);lw("sg_best",score)}
        return
      }

      // Next event
      const newUsed=[...usedIds,currentEvent.id]
      setUsedIds(newUsed)
      setLastId(currentEvent.id)
      setDeltas({plages:0,tourisme:0,env:0,budget:0})

      // Handle specific next
      let next=null
      if(choice.next&&typeof choice.next==="string"){
        next=events.find(e=>e.id===choice.next)
      } else if(Array.isArray(choice.next)){
        const id=choice.next[Math.floor(Math.random()*choice.next.length)]
        next=events.find(e=>e.id===id)
      }
      if(!next) next=pickEvent(newDay,newBelt,newUsed,currentEvent.id,events)
      setCurrentEvent(next)
      setDay(newDay)
    },600)
  }

  // ── INTRO SCREEN ─────────────────────────────────────────────────
  if(gameState==="intro"){
    return(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 24px calc(28px + env(safe-area-inset-bottom, 0px))",background:`radial-gradient(ellipse at 50% 20%,rgba(0,150,140,.12),transparent 60%), radial-gradient(ellipse at 20% 80%,rgba(200,138,10,.08),transparent 50%), ${T.deep}`,textAlign:"center",overflow:"auto",WebkitOverflowScrolling:"touch"}}>
        <style>{CSS}</style>

        {/* Stars */}
        {Array.from({length:30},(_,i)=><div key={i} style={{position:"fixed",left:`${Math.random()*100}%`,top:`${Math.random()*60}%`,width:Math.random()>.8?2:1,height:Math.random()>.8?2:1,borderRadius:"50%",background:"rgba(255,255,255,.25)",animation:`pulse ${2+Math.random()*4}s ease ${Math.random()*5}s infinite`}}/>)}

        <div style={{fontSize:70,marginBottom:6,animation:"floatEmoji 4s ease-in-out infinite",position:"relative"}}>🌿</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:".2em",textTransform:"uppercase",color:T.cyan,marginBottom:6,animation:"up .5s ease .1s both"}}>Jeu de décisions stratégiques</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(24px, 8vw, 42px)",textTransform:"uppercase",letterSpacing:".04em",color:T.w,lineHeight:1.05,marginBottom:6,animation:"up .5s ease .15s both"}}>SARGASSES<br/>MISSION<br/>{island==="gp"?"GUADELOUPE":"MARTINIQUE"}</div>

        {/* Pitch */}
        <div style={{fontSize:15,color:T.m,lineHeight:1.7,maxWidth:320,marginBottom:20,animation:"up .5s ease .2s both"}}>
          Tu es Préfet de {island==="gp"?"Guadeloupe":"Martinique"}. Les sargasses envahissent.<br/>30 jours pour sauver les plages, l'économie et l'île.
        </div>

        {/* 4 resources preview */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20,width:"100%",maxWidth:300,animation:"up .5s ease .25s both"}}>
          {[{i:"🌴",l:"Plages",v:7},{i:"💰",l:"Tourisme",v:7},{i:"🌿",l:"Env.",v:7},{i:"⚙️",l:"Budget",v:7}].map(r=>(
            <div key={r.l} style={{background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:12,padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{r.i}</span>
              <div><div style={{fontSize:11,fontWeight:700,color:T.w}}>{r.l}</div><div style={{fontSize:10,color:T.mute}}>{r.v}/10 à maintenir</div></div>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div style={{background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:16,padding:"12px 16px",marginBottom:20,width:"100%",maxWidth:320,textAlign:"left",animation:"up .5s ease .28s both"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:T.mute,marginBottom:8}}>Comment jouer</div>
          {["Tap A / B / C pour choisir","Swipe ← pour A · Swipe → pour B","Clavier : touches 1/2/3 ou a/b/c","Si une ressource = 0 → défaite","Tiens 30 jours → victoire"].map((r,i)=>(
            <div key={i} style={{fontSize:14,color:T.m,marginBottom:3,display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:T.cyan,fontWeight:800}}>→</span>{r}
            </div>
          ))}
        </div>

        {bestScore>0&&<div style={{fontSize:12,color:T.mute,marginBottom:12,fontWeight:600,animation:"up .4s ease .3s both"}}>🏆 Ton record : {bestScore} pts</div>}

        <button onClick={startGame} style={{padding:"15px 48px",background:`linear-gradient(135deg,${T.cyanL},${T.cyan})`,color:T.void,border:"none",borderRadius:15,fontFamily:"'Anton',sans-serif",fontSize:19,letterSpacing:".1em",cursor:"pointer",boxShadow:`0 6px 24px ${T.cyan}40`,animation:"up .5s ease .32s both"}}>
          DÉMARRER LA MISSION
        </button>
        <div style={{fontSize:11,color:T.mute,marginTop:10,animation:"up .4s ease .38s both"}}>100% offline · Éducatif · Rejouable</div>
      </div>
    )
  }

  // ── GAME OVER ─────────────────────────────────────────────────────
  if(gameState==="gameover"){
    return(
      <div style={{width:"100%",height:"100%"}}>
        <style>{CSS}</style>
        <GameOver reason={gameOverReason} res={res} belt={belt} day={day} bestScore={bestScore} onRestart={()=>setGameState("intro")} island={island}/>
      </div>
    )
  }

  // ── PLAYING ───────────────────────────────────────────────────────
  if(!currentEvent) return null

  return(
    <div style={{width:"100%",height:"100%",minHeight:0,background:`radial-gradient(ellipse at 50% 0%,rgba(0,100,95,.12),transparent 50%), ${T.deep}`,overflow:"hidden",position:"relative"}}>
      <style>{CSS}</style>

      {/* Belt danger overlay */}
      {belt>80&&<div style={{position:"absolute",inset:0,background:"rgba(232,48,48,.04)",pointerEvents:"none",animation:"pulse 2s ease-in-out infinite",zIndex:0}}/>}

      {/* MOBILE LAYOUT */}
      <div className="game-layout" style={{height:"100%",minHeight:0,display:"flex",flexDirection:"column",padding:"10px 14px 12px",gap:0,overflow:"auto",WebkitOverflowScrolling:"touch"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexShrink:0}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:14,letterSpacing:".1em",color:T.cyan}}>SARG · MISSION {island==="gp"?"GP":"MQ"}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {/* Mini belt indicator (mobile) */}
            <div className="mobile-belt" style={{display:"flex",alignItems:"center",gap:5,background:belt>70?T.dangerBg:belt>40?T.warnBg:T.safeBg,borderRadius:100,padding:"4px 10px",border:`1px solid ${belt>70?T.danger+"44":belt>40?T.warn+"44":T.safe+"44"}`}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:belt>70?T.danger:belt>40?T.warn:T.safe,animation:belt>70?"pulse 1s ease-in-out infinite":"none"}}/>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:belt>70?T.danger:belt>40?T.warn:T.safe}}>{belt}</span>
              <span style={{fontSize:9,color:T.mute,fontWeight:700}}>CEINTURE</span>
            </div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:T.mute,fontWeight:700}}>J{day}/{MAX_DAYS}</div>
          </div>
        </div>

        {/* Resources */}
        <div style={{background:T.glass,border:`1px solid ${T.borderD}`,borderRadius:14,padding:"10px 14px",marginBottom:10,flexShrink:0}}>
          <ResBar icon="🌴" label="Plages"    value={res.plages}   color={T.safe}   delta={deltas.plages}/>
          <ResBar icon="💰" label="Tourisme"  value={res.tourisme} color={T.sargL}  delta={deltas.tourisme}/>
          <ResBar icon="🌿" label="Env."      value={res.env}      color={"#4EC98A"} delta={deltas.env}/>
          <ResBar icon="⚙️" label="Budget"    value={res.budget}   color={T.cyan}   delta={deltas.budget}/>
        </div>

        {/* Card area */}
        <div className="card-col" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",width:"100%",position:"relative"}}>
          {currentEvent&&<GameCard event={currentEvent} onChoice={applyChoice} day={day} maxDays={MAX_DAYS} feedback={showFb?feedback:""} exitDir={exitDir}/>}
        </div>

        {/* Desktop side column */}
        <div className="info-col" style={{display:"none"}}>
          {/* Belt ring */}
          <div className="desktop-belt" style={{display:"flex",flexDirection:"column",alignItems:"center",background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:16,padding:"16px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:T.mute,marginBottom:10}}>La Ceinture de Sargasses</div>
            <BeltRing belt={belt} size={130}/>
            <div style={{fontSize:11,color:T.mid,textAlign:"center",marginTop:10,lineHeight:1.6}}>
              {belt>80?"⚠️ Niveau critique — les événements s'accélèrent":belt>50?"Tension modérée — reste vigilant":"Situation contrôlée"}
            </div>
          </div>

          {/* Day progression */}
          <div style={{background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:16,padding:"14px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:T.mute,marginBottom:10}}>Progression</div>
            <div style={{height:5,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${(day/MAX_DAYS)*100}%`,background:`linear-gradient(90deg,${T.cyan},${T.cyanD})`,borderRadius:3,transition:"width .5s"}}/>
            </div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:T.w,fontWeight:700}}>Jour {day} / {MAX_DAYS}</div>
            <div style={{fontSize:11,color:T.mute,marginTop:2}}>
              {day<10?"Début de crise":day<20?"Phase critique":"Dernière ligne droite"}
            </div>
          </div>

          {/* Last decisions */}
          {history.length>0&&<div style={{background:T.surface,border:`1px solid ${T.borderD}`,borderRadius:16,padding:"14px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:T.mute,marginBottom:10}}>Dernières décisions</div>
            {history.slice(0,4).map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,opacity:1-i*.2}}>
                <span style={{fontSize:14}}>{h.event.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.w,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.event.title}</div>
                  <div style={{fontSize:10,color:T.mute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>J{h.day} · {h.choice.label}</div>
                </div>
              </div>
            ))}
          </div>}

          {/* Science tip */}
          <div style={{background:`rgba(0,212,200,.05)`,border:`1px dashed ${T.borderL}`,borderRadius:14,padding:"12px",fontSize:11,color:T.mid,lineHeight:1.65}}>
            💡 <strong style={{color:T.cyan}}>Le savoir-faire :</strong> La recherche et les partenariats IFREMER/Copernicus réduisent la Ceinture à long terme. Investir tôt paie toujours.
          </div>
        </div>

      </div>
    </div>
  )
}
