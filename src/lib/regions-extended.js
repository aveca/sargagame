// SPRINT 21 — Expansion Caraïbe sans nouveau NDD — sous-routes sur domaines existants
// Zero deps, build-time, rollback ?subregions=0 ?pois=0
export const REGIONS_EXTENDED = {
  martinique: { domain: 'sargasses-martinique.com', label: 'Martinique', flag: '🇲🇶', lat: 14.6415, lng: -61.0242, zoom: 10, locale: 'fr', currency: 'EUR',
    subregions: {
      'sainte-anne': { label: 'Sainte-Anne', lat: 14.4333, lng: -60.8833, beaches: [{name:'Les Salines', lat:14.425, lng:-60.876},{name:'Anse Trabaud', lat:14.445, lng:-60.88}] },
      'trinite': { label: 'Trinité', lat: 14.6833, lng: -60.9667, beaches: [{name:'Plage de la Brèche', lat:14.685, lng:-60.965}] },
      'saint-pierre': { label: 'Saint-Pierre', lat: 14.7333, lng: -61.1833, beaches: [{name:'Plage de Saint-Pierre', lat:14.735, lng:-61.182}] },
    }
  },
  guadeloupe: { domain: 'sargasses-guadeloupe.com', label: 'Guadeloupe', flag: '🇬🇵', lat: 16.25, lng: -61.58, zoom: 9, locale: 'fr', currency: 'EUR',
    subregions: {
      'sainte-anne': { label: 'Sainte-Anne', lat: 16.2333, lng: -61.3833, beaches: [{name:'Bois Jolan', lat:16.23, lng:-61.38}] },
      'deshaies': { label: 'Deshaies', lat: 16.3067, lng: -61.7933, beaches: [{name:'Grande Anse Deshaies', lat:16.307, lng:-61.793}] },
      'saint-francois': { label: 'Saint-François', lat: 16.25, lng: -61.275, beaches: [{name:'Plage des Raisins Clairs', lat:16.25, lng:-61.27}] },
    }
  },
  cancun: { domain: 'sargassumcancun.com', label: 'Cancún', flag: '🇲🇽', lat: 21.1619, lng: -86.8515, zoom: 10, locale: 'es', currency: 'MXN',
    subregions: {
      'playa-del-carmen': { label: 'Playa del Carmen', lat: 20.6296, lng: -87.0739, beaches: [{name:'Playa del Carmen Centro', lat:20.63, lng:-87.07}] },
      'puerto-morelos': { label: 'Puerto Morelos', lat: 20.85, lng: -86.875, beaches: [{name:'Puerto Morelos Beach', lat:20.85, lng:-86.875}] },
      'isla-mujeres': { label: 'Isla Mujeres', lat: 21.231, lng: -86.731, beaches: [{name:'Playa Norte', lat:21.232, lng:-86.745}] },
    }
  },
  tulum: { domain: 'sargazotulum.com', label: 'Tulum', flag: '🇲🇽', lat: 20.211, lng: -87.465, zoom: 10, locale: 'es', currency: 'MXN',
    subregions: {
      'akumal': { label: 'Akumal', lat: 20.398, lng: -87.321, beaches: [{name:'Akumal Beach', lat:20.398, lng:-87.321}] },
      'bacalar': { label: 'Bacalar', lat: 18.67, lng: -88.39, beaches: [{name:'Bacalar Lagoon', lat:18.67, lng:-88.39}] },
    }
  },
  miami: { domain: 'sargassummiami.com', label: 'Miami', flag: '🇺🇸', lat: 25.7617, lng: -80.1918, zoom: 9, locale: 'en', currency: 'USD',
    subregions: {
      'south-beach': { label: 'South Beach', lat: 25.7907, lng: -80.13, beaches: [{name:'South Beach', lat:25.791, lng:-80.13}] },
      'fort-lauderdale': { label: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373, beaches: [{name:'Fort Lauderdale Beach', lat:26.122, lng:-80.137}] },
    }
  },
  puntacana: { domain: 'sargassumpuntacana.com', label: 'Punta Cana', flag: '🇩🇴', lat: 18.56, lng: -68.3725, zoom: 10, locale: 'es', currency: 'DOP',
    subregions: {
      'bavaro': { label: 'Bavaro', lat: 18.6711, lng: -68.4015, beaches: [{name:'Bavaro Beach', lat:18.671, lng:-68.401}] },
      'cap-cana': { label: 'Cap Cana', lat: 18.4297, lng: -68.3525, beaches: [{name:'Juanillo Beach', lat:18.43, lng:-68.352}] },
      'macao': { label: 'Playa Macao', lat: 18.6656, lng: -68.4631, beaches: [{name:'Playa Macao', lat:18.666, lng:-68.463}] },
    }
  },
  haiti: { domain: 'sargassumpuntacana.com', basePath: '/haiti', label: 'Haïti', flag: '🇭🇹', lat: 18.5944, lng: -72.3074, zoom: 8, locale: 'fr', currency: 'HTG',
    subregions: {
      'labadee': { label: 'Labadee', lat: 19.85, lng: -72.25, beaches: [{name:'Labadee Beach', lat:19.852, lng:-72.248},{name:'Kokoye Beach', lat:18.45, lng:-72.75}] },
      'port-au-prince': { label: 'Port-au-Prince', lat: 18.5944, lng: -72.3074, beaches: [{name:'Côte des Arcadins', lat:18.55, lng:-72.37},{name:'Cormier Plage', lat:18.45, lng:-72.70}] },
      'jacmel': { label: 'Jacmel', lat: 18.2347, lng: -72.5347, beaches: [{name:'Plage de Jacmel', lat:18.235, lng:-72.535}] },
    }
  },
  'sainte-lucie': { domain: 'sargassumpuntacana.com', basePath: '/sainte-lucie', label: 'Sainte-Lucie', flag: '🇱🇨', lat: 13.9094, lng: -60.9789, zoom: 10, locale: 'en', currency: 'XCD',
    subregions: {
      'castries': { label: 'Castries', lat: 14.0101, lng: -60.9789, beaches: [{name:'Vigie Beach', lat:14.02, lng:-60.99},{name:'La Toc Beach', lat:13.99, lng:-61.0}] },
      'soufriere': { label: 'Soufrière', lat: 13.8531, lng: -61.0589, beaches: [{name:'Anse Chastanet', lat:13.85, lng:-61.08},{name:'Jalousie Beach', lat:13.84, lng:-61.07}] },
      'marigot': { label: 'Marigot Bay', lat: 13.9056, lng: -61.0258, beaches: [{name:'Marigot Bay Beach', lat:13.906, lng:-61.026},{name:'Pigeon Island Beach', lat:14.09, lng:-60.96}] },
    }
  },
  barbade: { domain: 'sargassumpuntacana.com', basePath: '/barbade', label: 'Barbade', flag: '🇧🇧', lat: 13.1939, lng: -59.5432, zoom: 10, locale: 'en', currency: 'BBD',
    subregions: {
      'bridgetown': { label: 'Bridgetown', lat: 13.1058, lng: -59.6131, beaches: [{name:'Carlisle Bay', lat:13.09, lng:-59.62},{name:'Pebbles Beach', lat:13.08, lng:-59.61}] },
      'bathsheba': { label: 'Bathsheba', lat: 13.2289, lng: -59.5244, beaches: [{name:'Bathsheba Beach', lat:13.229, lng:-59.524},{name:'Soup Bowl', lat:13.23, lng:-59.52}] },
      'silver-sands': { label: 'Silver Sands', lat: 13.0667, lng: -59.4833, beaches: [{name:'Silver Sands Beach', lat:13.067, lng:-59.483},{name:'Crane Beach', lat:13.10, lng:-59.43},{name:'Bottom Bay', lat:13.17, lng:-59.42}] },
    }
  },
};

export function detectExtendedRegion(pathname='/',hostname=''){
  const p=String(pathname).toLowerCase();
  if(p.startsWith('/haiti')) return 'haiti';
  if(p.startsWith('/sainte-lucie')) return 'sainte-lucie';
  if(p.startsWith('/barbade')) return 'barbade';
  // subregions existantes
  if(p.startsWith('/bavaro')||p.startsWith('/cap-cana')||p.startsWith('/macao')) return 'puntacana';
  // fallback hostname
  const h=String(hostname).toLowerCase();
  if(h.includes('martinique')) return 'martinique';
  if(h.includes('guadeloupe')) return 'guadeloupe';
  if(h.includes('cancun')) return 'cancun';
  if(h.includes('tulum')) return 'tulum';
  if(h.includes('miami')) return 'miami';
  if(h.includes('puntacana')) return 'puntacana';
  return null;
}

export function getRegionMeta(regionId){
  return REGIONS_EXTENDED[regionId]||null;
}
