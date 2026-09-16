/**
 * partners.js — résolution des partenaires contextuels (services, jamais pubs).
 *
 * CONTRAT :
 *  - Source = catalogue généré `partners-catalog.json` (lui-même dérivé de
 *    regions/*.json, SOURCE DE VÉRITÉ). AUCUNE condition codée en dur sur les
 *    régions/URLs ici : tout passe par `regions[]` + `enabled` du catalogue.
 *  - Un partenaire ne couvre une région que si enabled:true ET regions contient
 *    l'id région. Sinon → null/[] (jamais d'invention de disponibilité).
 *  - UN SEUL CTA transport principal par contexte : local couvrant > multi-îles
 *    couvrant > rien. Le verdict et les CTA produit ne sont jamais touchés
 *    (ce module ne fait que résoudre + construire l'URL sortante).
 *  - Tracking canonique : sg_partner_view / sg_partner_cta / sg_partner_outbound
 *    (allowlistés SG_FUNNEL_EVENTS + FUNNEL_KEYS). Les anciens sg_transport_*
 *    (MaPlageView, jamais allowlistés donc jamais mesurés) sont remplacés.
 *
 * Pur ESM sans JSX, sans accès navigateur au top-level → importable en node
 * (contrat scripts/tests/partners-contract.test.cjs) comme sous Vite.
 */

export const PARTNER_EVENTS = {
  VIEW: "sg_partner_view",
  CTA: "sg_partner_cta",
  OUTBOUND: "sg_partner_outbound",
};

/** Kill-switch global du slot contextuel : ?partnerctx=0 (défaut ON). */
export function partnerCtxOn(search) {
  try {
    const q = typeof search === "string" ? search : (typeof window !== "undefined" ? window.location.search : "");
    return !/[?&]partnerctx=0(?:&|$)/.test(q);
  } catch (_) {
    return true;
  }
}

/** Entrée catalogue pour une région (null si inconnue). */
export function getRegionEntry(catalog, regionId) {
  try {
    const r = catalog && catalog.regions && catalog.regions[regionId];
    return r || null;
  } catch (_) {
    return null;
  }
}

/** Couverture réelle : enabled + région listée (jamais d'invention). */
export function coversRegion(p, regionId) {
  return !!(p && p.enabled === true && Array.isArray(p.regions) && p.regions.includes(regionId));
}

/**
 * LE CTA transport principal du contexte (un seul) :
 * local couvrant > multi-îles couvrant > null.
 */
export function getTransportPartner(entry, regionId) {
  if (!entry || !entry.transport) return null;
  const { local, multiIsland } = entry.transport;
  if (coversRegion(local, regionId)) return local;
  if (coversRegion(multiIsland, regionId)) return multiIsland;
  return null;
}

/** Partenaires shopping couvrant réellement la région. */
export function getShoppingPartners(entry, regionId) {
  if (!entry || !Array.isArray(entry.shopping)) return [];
  return entry.shopping.filter((p) => coversRegion(p, regionId));
}

/**
 * URL sortante : bookingUrl si présente sinon url ; contexte plage
 * (?destination=&island=) ajouté UNIQUEMENT si supportsBeachContext && plage.
 * Aucun paramètre de commission/prix inventé.
 */
export function partnerOutboundUrl(p, beach) {
  if (!p) return null;
  let base = p.bookingUrl || p.url;
  if (!base) return null;
  try {
    if (p.supportsBeachContext && beach && (beach.name || beach.id)) {
      const sep = base.includes("?") ? "&" : "?";
      const params = [];
      if (beach.name) params.push("destination=" + encodeURIComponent(beach.name));
      if (beach.island) params.push("island=" + encodeURIComponent(beach.island));
      else if (beach.id) params.push("beach=" + encodeURIComponent(beach.id));
      if (params.length) base += sep + params.join("&");
    }
  } catch (_) {}
  return base;
}

/**
 * Résolution complète d'un contexte : { transport, shopping } ou null
 * (kill-switch, région inconnue, ou zéro partenaire couvrant).
 */
export function resolveContext(catalog, regionId, beach, search) {
  if (!partnerCtxOn(search)) return null;
  if (!regionId) return null;
  const entry = getRegionEntry(catalog, regionId);
  if (!entry) return null;
  const transport = getTransportPartner(entry, regionId);
  const shopping = getShoppingPartners(entry, regionId);
  if (!transport && shopping.length === 0) return null;
  return { transport, shopping };
}
