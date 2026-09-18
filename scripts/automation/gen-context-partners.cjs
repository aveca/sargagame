#!/usr/bin/env node
/*
 * gen-context-partners.cjs — génère src/lib/partners-catalog.json (catalogue LEAN
 * des partenaires contextuels) depuis regions/*.json (SOURCE DE VÉRITÉ).
 *
 * RÈGLES (non négociables) :
 *  - Un partenaire ne s'affiche que si enabled:true ET que `regions` contient la
 *    région courante (vérifié par src/lib/partners.js + contrat
 *    scripts/tests/partners-contract.test.cjs). Aucune disponibilité inventée :
 *    RHUMZ multi-îles = mq/gp uniquement (couverture confirmée par les blocs
 *    `transport` historiques de mq.json/gp.json) ; Taxis Martinique + Lovelly
 *    (Fort-de-France) = mq uniquement.
 *  - AUCUNE commission, AUCUN prix, AUCUNE donnée inventée : seuls les champs
 *    name/category/url[/bookingUrl][/location]/regions/supportsBeachContext/
 *    enabled/trackingId sont propagés. Le reste (TODO, notes) ne part pas au front.
 *  - Le verdict sargasses reste 100% data ERDDAP : ce script ne touche QUE la
 *    couche d'affichage partenaire, jamais la donnée plage.
 *
 * Usage : node scripts/automation/gen-context-partners.cjs
 * Hooké dans `npm run build` (avant vite build) comme gen-b2b-partners.cjs.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REGIONS_DIR = path.join(ROOT, "regions");
const OUT = path.join(ROOT, "src", "lib", "partners-catalog.json");

const TRANSPORT_FIELDS = ["name", "category", "url", "bookingUrl", "regions", "supportsBeachContext", "enabled", "trackingId", "isWhatsApp"];
const SHOPPING_FIELDS = ["name", "category", "url", "location", "regions", "supportsBeachContext", "enabled", "trackingId"];

function pick(o, fields) {
  const r = {};
  for (const k of fields) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

function validUrl(u) {
  return typeof u === "string" && /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(u);
}

function main() {
  const files = fs.readdirSync(REGIONS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const regions = {};
  let enabledCount = 0;
  for (const f of files) {
    const cfg = JSON.parse(fs.readFileSync(path.join(REGIONS_DIR, f), "utf8"));
    if (!cfg.id) {
      console.warn(`[gen-context-partners] ${f} sans champ "id" — ignoré`);
      continue;
    }
    const p = cfg.partners || {};
    const t = p.transport || {};
    const entry = {
      transport: { local: null, multiIsland: null },
      shopping: [],
    };
    for (const slot of ["local", "multiIsland"]) {
      const c = t[slot];
      if (c == null) continue;
      if (!c.name || !c.category || !validUrl(c.url) || !Array.isArray(c.regions) || typeof c.enabled !== "boolean" || !c.trackingId) {
        console.warn(`[gen-context-partners] ${cfg.id}.transport.${slot} invalide (name/category/url-https/regions/enabled/trackingId requis) — ignoré:`, c && c.name);
        continue;
      }
      entry.transport[slot] = pick(c, TRANSPORT_FIELDS);
      if (c.enabled) enabledCount++;
    }
    if (Array.isArray(p.shopping)) {
      for (const c of p.shopping) {
        if (!c || !c.name || !c.category || !validUrl(c.url) || !Array.isArray(c.regions) || typeof c.enabled !== "boolean" || !c.trackingId) {
          console.warn(`[gen-context-partners] ${cfg.id}.shopping invalide — ignoré:`, c && c.name);
          continue;
        }
        entry.shopping.push(pick(c, SHOPPING_FIELDS));
        if (c.enabled) enabledCount++;
      }
    }
    regions[cfg.id] = entry;
  }

  const today = new Date().toISOString().slice(0, 10);
  const out = {
    _note:
      "GÉNÉRÉ par scripts/automation/gen-context-partners.cjs depuis regions/*.json (SOURCE DE VÉRITÉ) — NE PAS éditer à la main (éditer le partners de la région puis régénérer). Affichage = enabled:true ET regions contient la région courante (src/lib/partners.js). Verdict sargasses = 100% data ERDDAP, jamais influencé.",
    updatedAt: today,
    regions,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[gen-context-partners] OK — ${Object.keys(regions).length} région(s), ${enabledCount} partenaire(s) enabled → ${path.relative(ROOT, OUT)}`
  );
}

main();
