// Resort data by region — imported at build time (Vite JSON import)
// Only FL, PC, RM have resort data; MQ/GP have none.
import florida from '../../regions/resorts/florida.json';
import puntacana from '../../regions/resorts/puntacana.json';
import rivieramaya from '../../regions/resorts/rivieramaya.json';

// All JSON files are direct arrays [{...}]
const RESORTS_BY_REGION = {
  florida: Array.isArray(florida) ? florida : (florida.resorts || []),
  puntacana: Array.isArray(puntacana) ? puntacana : (puntacana.resorts || []),
  rivieramaya: Array.isArray(rivieramaya) ? rivieramaya : (rivieramaya.resorts || []),
  mq: [],
  gp: [],
  tulum: [],
};

export function getResortsForRegion(regionId) {
  return RESORTS_BY_REGION[regionId] || [];
}

export function getResortsForBeach(regionId, beachId) {
  const resorts = RESORTS_BY_REGION[regionId] || [];
  return resorts.filter(r => r.beachId === beachId);
}

export default RESORTS_BY_REGION;