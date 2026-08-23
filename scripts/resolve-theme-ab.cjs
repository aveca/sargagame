#!/usr/bin/env node
/**
 * resolve-theme-ab.cjs — RÉSOLUTION à ~24h de l'A/B `theme_nudge` (adoption des thèmes).
 *
 * Hypothèse mesurée : montrer un picker de thème qui "pulse" (arm `nudge`) augmente-t-il
 * l'engagement sans nuire à la conversion premium ? Events (funnel Apps Script) :
 *   - ui_theme_view {nudge}      → expositions par arm
 *   - ui_theme_pick {theme,nudge}→ adoptions par arm
 *   - premium_modal_cta / redirect → garde-fou conversion (ne doit pas régresser)
 *
 * Règle de résolution (auto, après >=24h ET >=200 expositions/arm) :
 *   - winner = arm avec le meilleur taux d'adoption (pick/view), SI conversion non régressée
 *     (cta_rate du gagnant >= 0.9 × cta_rate control). Sinon → garder "control".
 *   - marge de sécurité : écart d'adoption >= 2 points ET n suffisant, sinon "inconclusive".
 *
 * Usage : node scripts/resolve-theme-ab.cjs path/to/events.json
 *   events.json = [{event, props:{nudge,theme,...}, ts}] (export funnel).
 * Sans fichier : imprime la règle + le SQL/agrégat attendu (dry-run, sert de doc exécutable).
 */
const fs = require("fs");
const MIN_HOURS = 24, MIN_VIEWS = 200, MIN_ADOPT_GAP = 0.02, CONV_FLOOR = 0.9;

function summarize(events) {
  const arms = { control: { view:0, pick:0, cta:0, redirect:0 }, nudge: { view:0, pick:0, cta:0, redirect:0 } };
  let tMin = Infinity, tMax = -Infinity;
  for (const e of events) {
    const arm = (e.props && e.props.nudge) ? "nudge" : "control";
    if (e.ts) { const t = +new Date(e.ts); if (t < tMin) tMin = t; if (t > tMax) tMax = t; }
    if (e.event === "ui_theme_view") arms[arm].view++;
    else if (e.event === "ui_theme_pick") arms[arm].pick++;
    else if (e.event === "premium_modal_cta") arms[arm].cta++;
    else if (e.event === "premium_modal_redirect") arms[arm].redirect++;
  }
  const hours = (tMax > tMin) ? (tMax - tMin) / 3.6e6 : 0;
  for (const k of ["control", "nudge"]) {
    const a = arms[k];
    a.adopt = a.view ? a.pick / a.view : 0;
    a.cta_rate = a.view ? a.cta / a.view : 0;
  }
  return { arms, hours };
}

function resolve({ arms, hours }) {
  const c = arms.control, n = arms.nudge;
  if (hours < MIN_HOURS) return { decision: "wait", reason: `seulement ${hours.toFixed(1)}h (<${MIN_HOURS}h)` };
  if (c.view < MIN_VIEWS || n.view < MIN_VIEWS) return { decision: "wait", reason: `expositions insuffisantes (control=${c.view}, nudge=${n.view}, min ${MIN_VIEWS})` };
  const gap = n.adopt - c.adopt;
  const convOK = n.cta_rate >= CONV_FLOOR * c.cta_rate;
  if (!convOK) return { decision: "keep:control", reason: `nudge dégrade la conversion (cta ${n.cta_rate.toFixed(3)} < ${(CONV_FLOOR*100)|0}% de ${c.cta_rate.toFixed(3)})` };
  if (gap >= MIN_ADOPT_GAP) return { decision: "ship:nudge", reason: `adoption +${(gap*100).toFixed(1)} pts (${(n.adopt*100).toFixed(1)}% vs ${(c.adopt*100).toFixed(1)}%), conversion préservée` };
  if (gap <= -MIN_ADOPT_GAP) return { decision: "keep:control", reason: `nudge n'aide pas (${(gap*100).toFixed(1)} pts)` };
  return { decision: "inconclusive", reason: `écart < ${MIN_ADOPT_GAP*100} pts (${(gap*100).toFixed(1)})` };
}

const f = process.argv[2];
if (!f) {
  console.log("DRY-RUN (doc exécutable) — fournis un export d'events JSON pour résoudre.\n");
  console.log(`Règle : après >=${MIN_HOURS}h ET >=${MIN_VIEWS} vues/arm →`);
  console.log(`  ship:nudge si adoption(nudge)-adoption(control) >= ${MIN_ADOPT_GAP*100} pts ET cta_rate(nudge) >= ${CONV_FLOOR*100}% cta_rate(control)`);
  console.log("  keep:control si nudge dégrade la conversion ou n'aide pas ; sinon inconclusive (prolonger).");
  console.log("\nEvents attendus : ui_theme_view{nudge}, ui_theme_pick{theme,nudge}, premium_modal_cta, premium_modal_redirect.");
  process.exit(0);
}
const events = JSON.parse(fs.readFileSync(f, "utf8"));
const sum = summarize(events);
const out = resolve(sum);
console.log(JSON.stringify({ ...sum, ...out }, null, 2));
console.log(`\n→ DÉCISION : ${out.decision} — ${out.reason}`);
