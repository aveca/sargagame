// tests/unit/wow-unlock-transition.test.cjs — 2026-09-24 (WOW PAYWALL — WORKSTREAM PREMIUM/PURCHASE)
// Contrat de la TRANSITION free → premium au-delà du modal :
//   1. paywall→checkout = glisse animée (pas de snap) + reskin golden-hour
//      (encre teal profonde, fin du violet pirate #190c2c côté checkout)
//   2. écho « tu débloques la semaine de <plage> » DANS le checkout (données
//      réelles stay-trajectory, jamais inventées)
//   3. unlock-reveal : voile « ta semaine t'appartient » au paySuccess réel
//   4. sticky CTA : synopsis semaine réel (compteurs forecast, pas de promo)
//   5. money-path INTACT : doSubscribe/createToken/passCtx/tracking inchangés
//   6. rollbacks : ?sgtraj=0 rend tout historique ; reduced-motion = statique
// Lancement : node tests/unit/wow-unlock-transition.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const R = (...p) => path.join(__dirname, '..', '..', ...p);
const ONSITE = fs.readFileSync(R('src', 'PremiumModal', 'OnsiteCheckout.jsx'), 'utf8');
const PMODAL = fs.readFileSync(R('src', 'PremiumModal.jsx'), 'utf8');
const PASS_OFFER = fs.readFileSync(R('src', 'PassOffer.jsx'), 'utf8');
const WORLD = fs.readFileSync(R('src', 'PremiumModal', 'WorldPaywall.jsx'), 'utf8');
const PROD = fs.readFileSync(R('src', 'Sargasses_PROD.jsx'), 'utf8');
const DO_SUB = fs.readFileSync(R('src', 'PremiumModal', 'doSubscribe.jsx'), 'utf8');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('WOW UNLOCK TRANSITION — contrat free → premium\n');

// ── 1. Transition paywall→checkout (slide animée, RM-safe) ──
check('checkout : transition slide animée sur transform', ONSITE.includes('transition: reduceMotion ? "none" : "transform .42s cubic-bezier(.22,.8,.24,1)"'));
check('checkout : reduced-motion = snap instantané (plancher dur)', ONSITE.includes('prefers-reduced-motion: reduce'));
check('checkout : reskin golden-hour (encre teal profonde) gaté trajOn', ONSITE.includes('(PAY_CAPTURE_ONLY || trajOn)') && ONSITE.includes('linear-gradient(168deg,#0B2230 0%,#0D1E1C 58%,#0A1714 100%)'));
check('checkout : champs carte Mollie reskinnés sous trajOn (#13261F)', ONSITE.includes('trajOn ? "#13261F" : "#241837"'));
check('checkout : rollback violet pirate conservé sous ?sgtraj=0', ONSITE.includes('linear-gradient(145deg,#190c2c,#120821)'));

// ── 2. Écho trajectoire dans le checkout ──
check('checkout : écho « tu débloques la semaine » présent (testid dédié)', ONSITE.includes('data-testid="checkout-trajectory"'));
check('écho : source réelle buildTrajectory (même lib que le paywall)', ONSITE.includes('import { buildTrajectory, TRAJ_STATUS } from "../lib/stay-trajectory.js"'));
check('écho : jamais hors capture-only (zéro paywall data en mode offert)', ONSITE.includes('trajOn && traj && beach && beach.name && !PAY_CAPTURE_ONLY'));
check('écho : i18n FR/EN/ES', ONSITE.includes('Tu débloques la semaine de') && ONSITE.includes('You unlock the week of') && ONSITE.includes('Desbloqueas la semana de'));
check('écho : props beach/trajForecast threadées PremiumModal → OnsiteCheckout', /beach, trajForecast,/.test(PMODAL) && ONSITE.includes('beach = null,\n  trajForecast = null,'));

// ── 3. Unlock reveal (paySuccess = moment réel) ──
check('unlock reveal monté sur payStep && paySuccess && trajOn', ONSITE.includes('payStep && paySuccess && trajOn'));
check('unlock reveal : testid + role=status + aria-live', ONSITE.includes('data-testid="unlock-reveal"') && ONSITE.includes('aria-live="polite"'));
check('unlock reveal : i18n FR/EN/ES (« ta semaine t\'appartient »)', ONSITE.includes('Ta semaine t\'appartient') && ONSITE.includes('Your week is yours') && ONSITE.includes('Tu semana es tuya'));
check('unlock reveal : RM = animations gelées', ONSITE.includes('.sg-unlock-pop,.sg-unlock-dot,.sg-unlock-line{animation:none !important}'));
check('busy label WOW gaté (passCtx présent) + label historique conservé', ONSITE.includes('Ta semaine se débloque…') && ONSITE.includes('"Activation…", "Activating…", "Activando…"'));
check('event sg_unlock_reveal émis UNE fois au succès confirmé', ONSITE.includes('track("sg_unlock_reveal"') && ONSITE.includes('unlockTrackedRef'));
check('sg_unlock_reveal allowlisté SG_FUNNEL_EVENTS', PROD.includes('"sg_unlock_reveal"'));

// ── 4. Sticky CTA : synopsis réel de la semaine ──
check('sticky : synopsis compteurs RÉELS via buildTrajectory (import lib)', PASS_OFFER.includes('import{buildTrajectory}from"./lib/stay-trajectory.js"'));
check('sticky : label semaine gaté weekSyno (fallback label historique intact)', PASS_OFFER.includes('`Ta semaine : ${weekSyno}`') && PASS_OFFER.includes('"Mollie · Sans engagement · 2 clics"'));
check('sticky : synopsis i18n FR/EN/ES', PASS_OFFER.includes('`Your week: ${weekSyno}`') && PASS_OFFER.includes('`Tu semana: ${weekSyno}`'));
check('sticky : aucune invention — counts clean/moderate/alert uniquement', PASS_OFFER.includes('traj.counts') && !/9[0-9]\s?%/.test(PASS_OFFER));

// ── 5. Money-path INTACT (preuves de non-touche) ──
check('doSubscribe : délai post-succès 900 ms inchangé', (DO_SUB.match(/setTimeout\(\(\)=>\{onActivated\?\.\(\);onClose\(\)\},900\)/g) || []).length >= 1);
check('OnsiteCheckout : createToken / mounts / consent intacts (0 modif)', ONSITE.includes('createComponent("cardNumber"') && ONSITE.includes('mountedRef.current = true') && ONSITE.includes('sg_onsite_checkout_opened'));
check('PassOffer : CTA buy + prix money/displayCents intacts', PASS_OFFER.includes('if(onBuy)onBuy({c:cents,pass:PASS.key') && PASS_OFFER.includes('money(displayCents, cur, lang)'));
check('WorldPaywall : trajForecast propagé aux 2 instances PassOffer', (WORLD.match(/trajForecast=\{trajForecast\}/g) || []).length === 2);

// ── 6. Pas de dépendance lourde ajoutée ──
check('zéro nouvel import externe (pas de lib animation ajoutée)', !/from\s+["'](framer-motion|gsap|lottie|animejs)["']/.test(ONSITE + PASS_OFFER));

console.log(`\n✅ WOW UNLOCK TRANSITION — ${passed} checks ALL PASS`);
process.exit(0);
