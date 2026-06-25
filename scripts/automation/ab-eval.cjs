#!/usr/bin/env node
/**
 * ab-eval.cjs — VERDICT A/B AUTOMATISÉ depuis notre tracking first-party (stats.php)
 * + le funnel Apps Script (vérité revenu). Zéro Google Analytics.
 *
 * Pour chaque test A/B exposé, sort par variante : exposition (n), taux de conversion
 * sur la métrique choisie, engagement (dwell, ennui), et le LIFT + un z-test de
 * significativité (two-proportion) vs la variante control (= la plus exposée).
 *
 * Usage :
 *   node scripts/automation/ab-eval.cjs [--region=mq|gp] [--days=28]
 *        [--metric=sg_checkout_redirect] [--min=80]
 *
 * Clé stats lue dans scripts/automation/data/stats-keys.json (gitignored, FTP).
 * En reporting : on ne remonte au fondateur que le VERDICT, pas les candidats
 * (cf. skill sg-design-system : goût = A/B live, reporting automatisé).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true];
}));
const DAYS = parseInt(args.days) || 28;
const MIN = parseInt(args.min) || 80; // sessions/variante mini pour parler de significativité
const REGION = (args.region || "mq").toString();
const METRIC_PREF = args.metric
  ? [args.metric.toString()]
  : ["sg_checkout_redirect", "sg_premium_modal_cta", "sg_premium_modal_open", "sg_hero_email_submit", "sg_email_submit"];
// Métrique de conversion PAR TEST quand le KPI diffère du funnel paiement. Le test
// capture_gate optimise la CAPTURE EMAIL (pas le CTA modal qu'il court-circuite) → on le
// juge sur sg_capture_gate_submit, sinon il ressortirait "pas de signal". Les autres tests
// gardent METRIC_PREF (ne PAS mettre les events capture en tête globale : tous les tests
// les ont dans rates_pct → ça fausserait leur verdict).
const TEST_METRIC = { capture_gate: "sg_capture_gate_submit" };

const HOSTS = { mq: "https://sargasses-martinique.com", gp: "https://sargasses-guadeloupe.com" };
const FUNNEL_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel";

function normcdf(x) { // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function z2prop(x1, n1, x2, n2) { // variante(2) vs control(1)
  if (!n1 || !n2) return null;
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, conf: 0, lift: p1 ? (p2 - p1) / p1 * 100 : null };
  const z = (p2 - p1) / se;
  const conf = (1 - 2 * (1 - normcdf(Math.abs(z)))) * 100; // two-sided
  return { z, conf, lift: p1 ? (p2 - p1) / p1 * 100 : null };
}

(async () => {
  // Clés stats : fichier local stats-keys.json (gitignored) OU env (CI). En CI le
  // fichier est absent → on reconstruit la map depuis les secrets SG_STATS_KEY_<REGION>
  // (+ SG_STATS_KEY partagée en fallback). Même pattern que scripts/analyze-ux.cjs,
  // ce qui rend ab-eval exécutable dans ab-evaluator.yml sans le fichier FTP.
  let keys = {};
  try { keys = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "stats-keys.json"), "utf8")); } catch (e) {}
  for (const k of Object.keys(process.env)) {
    const m = k.match(/^SG_STATS_KEY_([A-Z0-9]+)$/);
    if (m && process.env[k]) keys[m[1].toLowerCase()] = process.env[k];
  }
  const key = keys[REGION] || process.env.SG_STATS_KEY;
  if (!key) { console.error("✗ pas de clé pour", REGION, "— ni stats-keys.json ni SG_STATS_KEY[_" + REGION.toUpperCase() + "]"); process.exit(1); }

  let stats;
  try { stats = await (await fetch(`${HOSTS[REGION]}/stats.php?key=${key}&days=${DAYS}`)).json(); }
  catch (e) { console.error("✗ fetch stats.php KO :", e.message); process.exit(1); }
  if (stats.error) { console.error("✗ stats.php :", stats.error); process.exit(1); }

  console.log(`\n=== AB-EVAL ${REGION.toUpperCase()} · ${DAYS}j · ${stats.sessions} sessions ===`);
  const bd = stats.ab_breakdown;
  if (!bd || !Object.keys(bd).length) {
    console.log("⚠ ab_breakdown ABSENT → déploie le stats.php mis à jour (push main → FTP), puis relance.");
    if (stats.ab) { console.log("\nExposition A/B brute (en attendant) :"); console.log(stats.ab); }
  } else {
    for (const [test, vars] of Object.entries(bd)) {
      const names = Object.keys(vars);
      if (names.length < 2) continue; // pas un A/B exploitable (1 seule variante vue)
      const pref = TEST_METRIC[test] ? [TEST_METRIC[test], ...METRIC_PREF] : METRIC_PREF;
      const metric = pref.find(m => names.some(v => vars[v].rates_pct && vars[v].rates_pct[m] != null)) || null;
      const control = names.reduce((a, b) => (vars[a].sessions >= vars[b].sessions ? a : b)); // + exposée = control
      console.log(`\n▸ ${test}   (métrique conversion : ${metric ? metric.replace("sg_", "") : "—"})`);
      // gagnant = meilleure rate sur la métrique
      let best = null;
      for (const v of names) {
        const o = vars[v];
        const rate = metric && o.rates_pct ? (o.rates_pct[metric] || 0) : null;
        let tag = "";
        if (v === control) {
          tag = "  ← control";
        } else if (metric) {
          const n1 = vars[control].sessions, r1 = vars[control].rates_pct ? (vars[control].rates_pct[metric] || 0) : 0;
          const x1 = Math.round(r1 / 100 * n1), n2 = o.sessions, x2 = Math.round((rate || 0) / 100 * n2);
          const z = z2prop(x1, n1, x2, n2);
          const lift = z && z.lift != null ? `${z.lift >= 0 ? "+" : ""}${z.lift.toFixed(0)}%` : "—";
          const sig = (n1 >= MIN && n2 >= MIN && z && z.conf >= 95)
            ? `★ SIGNIFICATIF (${z.conf.toFixed(0)}%)`
            : (n1 < MIN || n2 < MIN ? "· échantillon faible" : "· non sig.");
          tag = `  vs ${control}: ${lift}  ${sig}`;
        }
        if (rate != null && (best == null || rate > best.rate)) best = { v, rate };
        const dwell = (o.avg_dwell_ms / 1000).toFixed(1), ennui = (o.bored_rate * 100).toFixed(0);
        console.log(`   ${String(v).padEnd(12)} n=${String(o.sessions).padStart(5)}  ${metric ? (rate ?? 0) + "%" : ""}  dwell ${dwell}s  ennui ${ennui}%${tag}`);
      }
      if (best && metric) console.log(`   → tête : ${best.v} (${best.rate}% ${metric.replace("sg_", "")})`);
    }
  }

  try {
    const f = await (await fetch(FUNNEL_URL)).json();
    const r = f.rates || {};
    console.log(`\n=== FUNNEL GLOBAL (vérité revenu) === modal→cta ${r.modal_to_cta}% · cta→redirect ${r.cta_to_redirect}% · ${f.payments_real} payants`);
  } catch (_) { /* funnel optionnel */ }
  console.log("");
})();
