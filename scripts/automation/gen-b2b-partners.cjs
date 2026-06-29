#!/usr/bin/env node
/*
 * gen-b2b-partners.cjs — génère public/api/b2b-partners.json (la « mise en avant
 * in-app » du palier Pro B2B) depuis le catalogue curé scripts/automation/data/
 * b2b-partner-meta.json.
 *
 * GATE (anti-fausse-affirmation) : seuls les hôtels `active:true` du catalogue
 * passent dans le tableau `partners` (= AFFICHÉ en live sur la fiche plage). Les
 * autres vont dans `preview` (visible uniquement via ?preview_partner=<slug>, pour
 * la démo de vente). `active` est basculé À LA MAIN par le fondateur quand il a
 * confirmé le paiement Pro (dashboard Mollie — le paiement B2B est anonyme, on ne
 * peut pas le rattacher automatiquement) ET obtenu l'accord de mise en avant.
 * Aucun hôtel ne peut s'auto-insérer.
 *
 * Le verdict sargasses reste 100% data ERDDAP : ce script ne touche QUE la couche
 * d'affichage partenaire, jamais la donnée plage.
 *
 * Usage : node scripts/automation/gen-b2b-partners.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const META = path.join(ROOT, "scripts/automation/data/b2b-partner-meta.json");
const OUT = path.join(ROOT, "public/api/b2b-partners.json");
const FUNNEL = path.join(ROOT, "scripts/automation/data/b2b-funnel.json");

const DISPLAY_FIELDS = ["beachId", "slug", "name", "tagline", "url", "area", "logo"];

function pick(o) {
  const r = {};
  for (const k of DISPLAY_FIELDS) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(META, "utf8"));
  const cat = Array.isArray(meta.partners) ? meta.partners : [];

  const partners = [];
  const preview = [];
  for (const p of cat) {
    if (!p || !p.slug || !p.beachId) {
      console.warn("[gen-b2b-partners] entrée ignorée (slug/beachId manquant):", p && p.name);
      continue;
    }
    (p.active ? partners : preview).push(pick(p));
  }

  // Garde-fou : on RAPPELLE le nombre de paiements Mollie B2B connus du funnel.
  // Si des paiements existent mais qu'aucun partenaire n'est `active`, c'est
  // probablement un hôtel payant pas encore basculé → à vérifier à la main.
  let paidSignal = null;
  try {
    const f = JSON.parse(fs.readFileSync(FUNNEL, "utf8"));
    paidSignal = (f.counts && f.counts.paid) != null ? f.counts.paid : null;
  } catch (_) {}

  const today = new Date().toISOString().slice(0, 10);
  const out = {
    _note:
      "GÉNÉRÉ par scripts/automation/gen-b2b-partners.cjs depuis b2b-partner-meta.json — NE PAS éditer à la main (éditer le catalogue puis régénérer). `partners` = LIVE (active:true uniquement). `preview` = démo (?preview_partner=<slug>). Verdict sargasses = 100% data ERDDAP, jamais influencé.",
    updatedAt: today,
    partners,
    preview,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  console.log(
    `[gen-b2b-partners] OK — ${partners.length} partenaire(s) LIVE, ${preview.length} en preview → ${path.relative(ROOT, OUT)}`
  );
  if (paidSignal != null && paidSignal > partners.length) {
    console.warn(
      `[gen-b2b-partners] ⚠️ Funnel signale ${paidSignal} paiement(s) B2B mais ${partners.length} partenaire(s) actif(s). ` +
        `Si un hôtel a payé le Pro + accepté la mise en avant, passe son active:true dans le catalogue.`
    );
  }
}

main();
