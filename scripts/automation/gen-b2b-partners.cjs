#!/usr/bin/env node
/*
 * gen-b2b-partners.cjs — génère public/api/b2b-partners-<region>.json (la « mise en
 * avant in-app » du palier Pro B2B) depuis le catalogue curé
 * scripts/automation/data/b2b-partner-meta.json.
 *
 * SCOPE RÉGIONAL : un argument --region (mq|gp|florida|puntacana|rivieramaya|tulum)
 * filtre les partenaires par préfixe de beachId (mq##, gp##, fl##, pc##, rm##, tu##).
 * Les partenaires d'une région NE SONT JAMAIS exposés dans une autre région
 * (jamais de partenaires MQ dans une région USD, etc.).
 *
 * GATE (anti-fausse-affirmation) : seuls les hôtels `active:true` du catalogue
 * passent dans le tableau `partners` (= AFFICHÉ en live sur la fiche plage). Les
 * autres vont dans `preview` (visible uniquement via ?preview_partner=<slug>,
 * pour la démo de vente). `active` est basculé À LA MAIN par le fondateur quand il a
 * confirmé le paiement Pro (dashboard Mollie — le paiement B2B est anonyme, on ne
 * peut pas le rattacher automatiquement) ET obtenu l'accord de mise en avant.
 * Aucun hôtel ne peut s'auto-insérer.
 *
 * Le verdict sargasses reste 100% data ERDDAP : ce script ne touche QUE la couche
 * d'affichage partenaire, jamais la donnée plage.
 *
 * Usage : node scripts/automation/gen-b2b-partners.cjs [--region <id>]
 *  Sans --region : génère les 6 régions (comportement complet).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const META = path.join(ROOT, "scripts/automation/data/b2b-partner-meta.json");
const OUT_DIR = path.join(ROOT, "public/api");
const FUNNEL = path.join(ROOT, "scripts/automation/data/b2b-funnel.json");

const REGIONS = ["mq", "gp", "florida", "puntacana", "rivieramaya", "tulum"];
const BEACHID_PREFIX = {
  mq: "mq",
  gp: "gp",
  florida: "fl",
  puntacana: "pc",
  rivieramaya: "rm",
  tulum: "tu",
};

const DISPLAY_FIELDS = ["beachId", "slug", "name", "tagline", "url", "area", "logo"];

function pick(o) {
  const r = {};
  for (const k of DISPLAY_FIELDS) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

function regionForBeachId(beachId) {
  if (!beachId || typeof beachId !== "string") return null;
  for (const [region, prefix] of Object.entries(BEACHID_PREFIX)) {
    if (beachId.startsWith(prefix)) return region;
  }
  return null;
}

function generateForRegion(region, partnersAll) {
  const prefix = BEACHID_PREFIX[region];
  const regionPartners = partnersAll.filter(p => regionForBeachId(p.beachId) === region);

  const partners = [];
  const preview = [];
  for (const p of regionPartners) {
    if (!p || !p.slug || !p.beachId) {
      console.warn(`[gen-b2b-partners:${region}] entrée ignorée (slug/beachId manquant):`, p && p.name);
      continue;
    }
    (p.active ? partners : preview).push(pick(p));
  }

  // Garde-fou : on RAPPELLE le nombre de paiements Mollie B2B connus du funnel.
  let paidSignal = null;
  try {
    const f = JSON.parse(fs.readFileSync(FUNNEL, "utf8"));
    paidSignal = (f.counts && f.counts.paid) != null ? f.counts.paid : null;
  } catch (_) {}

  const today = new Date().toISOString().slice(0, 10);
  const out = {
    _note:
      `GÉNÉRÉ par scripts/automation/gen-b2b-partners.cjs depuis b2b-partner-meta.json (région=${region}) — NE PAS éditer à la main. ` +
      "`partners` = LIVE (active:true uniquement, région scropée). `preview` = démo (?preview_partner=<slug>). " +
      "Verdict sargasses = 100% data ERDDAP, jamais influencé.",
    region,
    updatedAt: today,
    partners,
    preview,
  };
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  console.log(
    `[gen-b2b-partners:${region}] OK — ${partners.length} partenaire(s) LIVE, ${preview.length} en preview → ${path.relative(ROOT, outPath)}`
  );
  if (paidSignal != null && paidSignal > partners.length) {
    console.warn(
      `[gen-b2b-partners:${region}] ⚠️ Funnel signale ${paidSignal} paiement(s) B2B mais ${partners.length} partenaire(s) actif(s). `
    );
  }

  return out;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(META, "utf8"));
  const cat = Array.isArray(meta.partners) ? meta.partners : [];

  const args = process.argv.slice(2);
  const regionArg = args.includes("--region") ? args[args.indexOf("--region") + 1] : null;

  if (regionArg) {
    if (!REGIONS.includes(regionArg)) {
      console.error(`[gen-b2b-partners] région invalide: ${regionArg}. Régions valides: ${REGIONS.join(", ")}`);
      process.exit(1);
    }
    generateForRegion(regionArg, cat);
  } else {
    for (const region of REGIONS) {
      generateForRegion(region, cat);
    }
  }
}

main();

module.exports = { generateForRegion, REGIONS, BEACHID_PREFIX, regionForBeachId };
