// tests/unit/stay-trajectory.test.cjs — 2026-09-24 (WOW PAYWALL « LA TRAJECTOIRE »)
// Contrat du 2e moment WOW (paywall) : gratuit = un point (aujourd'hui) →
// premium = la trajectoire du séjour. Verrouille :
//   1. la logique PURE buildTrajectory (données réelles, cas limites)
//   2. le câblage UI (StayTrajectory monté, prix source unique, flags, a11y, RM)
//   3. le money-path intact (PassOffer/CTA/tracking/prix inchangés)
// Lancement : node tests/unit/stay-trajectory.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const R = (...p) => path.join(__dirname, '..', '..', ...p);
const TRAJ_UI = fs.readFileSync(R('src', 'PremiumModal', 'StayTrajectory.jsx'), 'utf8');
const WORLD = fs.readFileSync(R('src', 'PremiumModal', 'WorldPaywall.jsx'), 'utf8');
const PMODAL = fs.readFileSync(R('src', 'PremiumModal.jsx'), 'utf8');
const PROD = fs.readFileSync(R('src', 'Sargasses_PROD.jsx'), 'utf8');
const PASS_OFFER = fs.readFileSync(R('src', 'PassOffer.jsx'), 'utf8');
const PRICESRC = fs.readFileSync(R('src', 'lib', 'pass-price.js'), 'utf8');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

(async () => {
  console.log('STAY TRAJECTORY — contrat WOW paywall #2\n');

  const { buildTrajectory, TRAJ_STATUS, normStatus } = await import('../../src/lib/stay-trajectory.js');

  // ── Logique pure : données réelles, jamais d'invention ──
  const fc7 = [
    { day: 'Auj.', date: '2026-09-24', status: 'clean', confidence: 90 },
    { day: 'Ven 25', date: '2026-09-25', status: 'clean', confidence: 82 },
    { day: 'Sam 26', date: '2026-09-26', status: 'moderate', confidence: 71 },
    { day: 'Dim 27', date: '2026-09-27', status: 'alert', confidence: 62 },
    { day: 'Lun 28', date: '2026-09-28', status: 'clean', confidence: 55 },
    { day: 'Mar 29', date: '2026-09-29', status: 'clean', confidence: 48 },
    { day: 'Mer 30', date: '2026-09-30', status: 'clean', confidence: 41 },
  ];
  const t1 = buildTrajectory(fc7, 'clean');
  check('trajectoire complète : 7 jours conservés', t1.days.length === 7);
  check('moment critique = 1er jour À ÉVITER (J+3)', t1.criticalIndex === 3);
  check('jour par défaut = jour critique (pré-sélectionné)', t1.defaultIndex === 3);
  check('compteurs réels dérivés (alert=1, moderate=1)', t1.counts.alert === 1 && t1.counts.moderate === 1);
  check('confiance dernier jour réelle (41, décroissance honnête)', t1.lastConf === 41);
  check('confiance arrondie entière', fc7.every((d, i) => t1.days[i].confidence === Math.round(d.confidence)));

  const todayAvoid = buildTrajectory(fc7, 'avoid');
  check('today=avoid → everAlert vrai même sans alert dans la semaine', todayAvoid.everAlert === true);
  check('normStatus(avoid)=alert', normStatus('avoid') === 'alert');

  const fcFlat = fc7.map(d => ({ ...d, status: 'clean' }));
  const t2 = buildTrajectory(fcFlat, 'clean');
  check('semaine 7/7 clean : pas de critique, default = dernier jour', t2.criticalIndex === -1 && t2.defaultIndex === 6);
  check('semaine 7/7 clean detectée (verde strict OK)', t2.counts.clean === 7);

  const t3 = buildTrajectory(fcFlat.map((d, i) => ({ ...d, status: i === 2 ? 'moderate' : 'clean' })), 'clean');
  check('prudence sans alerte : changeIndex=J+2, critique reste -1', t3.changeIndex === 2 && t3.criticalIndex === -1);

  const t4 = buildTrajectory(fc7.slice(0, 3), 'clean');
  check('forecast incomplet (3 jours) : 3 jours, pas de crash', t4.days.length === 3 && t4.lastConf === 71);

  const t5 = buildTrajectory([{ day: 'Auj.', status: null, confidence: null }, { day: 'Dem.', status: null, confidence: null }], 'clean');
  check('statuts absents → unknown, compteurs honnêts', t5.days.every(d => d.status === null) && t5.counts.unknown === 2);

  check('forecast vide → 0 jour (module masqué côté UI)', buildTrajectory([], 'clean').days.length === 0);
  check('forecast undefined → 0 jour', buildTrajectory(undefined, 'clean').days.length === 0);
  check('TRAJ_STATUS : 3 statuts réels uniquement', Object.keys(TRAJ_STATUS).sort().join(',') === 'alert,clean,moderate');

  // ── Câblage UI ──
  check('StayTrajectory monté dans WorldPaywall', WORLD.includes('<StayTrajectory lang={lang} beach={beach} forecast={trajForecast}'));
  check('module gaté par wowOn (cohérent ?sgpaywow=0)', /wowOn && trajForecast && \(\s*\n?\s*<StayTrajectory/.test(WORLD.replace(/\r/g, '')));
  check('rollback ?sgtraj=0 (regex rail prouvée)', TRAJ_UI.includes('sgtraj=0'));
  check('données calculées dans PremiumModal (trajForecast + trajBackup)', PMODAL.includes('const trajForecast = useMemo') && PMODAL.includes('const trajBackup = useMemo'));
  check('backup = findAlternatives réel (jamais inventé)', PMODAL.includes('findAlternatives(beach, allBeaches'));
  check('allBeaches propagé Sargasses_PROD → PremiumModal', /beach=\{selectedBeach\|\|comicBeach\|\|null\}\r?\n\s*allBeaches=\{allBeaches\}/.test(PROD));
  check('props traj propagées dans commonPaywallProps', PMODAL.includes('trajForecast, trajBackup,'));

  // ── Prix réel, source unique (panel adverse : jamais de littéral) ──
  check('prix importé de lib/pass-price.js (PASS_CENTS + seasonalCents)', TRAJ_UI.includes('from "../lib/pass-price.js"') && TRAJ_UI.includes('seasonalCents(PASS_CENTS[cur], cur)'));
  check('AUCUN prix littéral hardcodé (pas de 14,99 / 13,79 / 1499 en dur dans le composant)', !/14[,.]99|13[,.]79|1499|1379/.test(TRAJ_UI));
  check('pass-price.js : contrat eur 1499 / usd 1199 intact', PRICESRC.includes('eur: 1499') && PRICESRC.includes('usd: 1199'));

  // PassOffer (money surface) : l'intégration traj est ADDITIVE — prix/CTA/tracking
  // strictement inchangés ; seules additions = dedup strip + label sticky semaine.
  check('PassOffer : prix source unique intact (PASS.cents + seasonalCents)', PASS_OFFER.includes('PASS.cents[cur]') && PASS_OFFER.includes('seasonalCents(cents, cur)'));
  check('PassOffer : buy()/tracking intacts (sg_pass_cta délégué Modal, buy appelle onBuy)', PASS_OFFER.includes('if(onBuy)onBuy(') && PASS_OFFER.includes('sg_pass_cta'));
  check('PassOffer : intégration traj gatee (dedup strip + rollback ?sgtraj=0)', PASS_OFFER.includes('trajForecast') && PASS_OFFER.includes('sgtraj=0') && PASS_OFFER.includes('!traj && ('));

  // ── Honnêteté (moat) ──
  check('sem cleanup : « Semaine au vert » STRICTEMENT conditionnel (7/7 clean)', TRAJ_UI.includes('traj.counts.clean === traj.days.length'));
  check('confiance révélée AU TAP seulement (pas de % sur les nœuds)', !/sg-traj-dot[^}]*conf/.test(TRAJ_UI.replace(/\s+/g, ' ')));
  check('zéro chiffre marketing (pas de 97/98/99 % en dur dans le composant)', !/9[789]\s?%/.test(TRAJ_UI));

  // ── A11y + mobile 390px + reduced-motion ──
  // Cible tactile : min-height 56px sur chaque jour ; la largeur est ~38-44px à
  // 390px via flex:1 (rail viewport-contrainte, overflow:hidden) — un min-width
  // forcé à 44px DÉBORDAIT le panel (7×44+gaps > 266px dispo, mesuré Playwright).
  check('tap nodes : min-height 56px (≥44) + flex:1 organisation 7 jours', TRAJ_UI.includes('min-height:56px') && TRAJ_UI.includes('flex:1'));
  check('rail viewport-contrainte (overflow:hidden, zéro débordement 390px)', TRAJ_UI.includes('.sg-traj-rail{position:relative;display:flex;align-items:flex-start;gap:0') && TRAJ_UI.includes('overflow:hidden'));
  check('aria-pressed sur les jours + role=status sur le détail', TRAJ_UI.includes('aria-pressed') && TRAJ_UI.includes('role="status"') && TRAJ_UI.includes('aria-live="polite"'));
  check('reduced-motion = tout statique', /@media \(prefers-reduced-motion:reduce\)/.test(TRAJ_UI) && TRAJ_UI.includes('animation:none !important'));
  check('testid paywall dédié', TRAJ_UI.includes('stay-trajectory'));

  // ── Funnel : event tap allowlisté ──
  check('sg_traj_tap émis au tap jour', TRAJ_UI.includes('onTrack("sg_traj_tap"'));
  check('sg_traj_tap allowlisté SG_FUNNEL_EVENTS', PROD.includes('"sg_traj_tap"'));

  // ── i18n FR/EN/ES présent ──
  check('i18n kicker + titre FR/EN/ES', TRAJ_UI.includes('Aujourd’hui — tu sais déjà'.replace('’', "'")) && TRAJ_UI.includes('Your week — you decide') && TRAJ_UI.includes('Tu semana — tú decides'));
  check('i18n label prix FR/EN/ES', TRAJ_UI.includes('Toute ta semaine') && TRAJ_UI.includes('Your whole week') && TRAJ_UI.includes('Toda tu semana'));

  console.log(`\n✅ STAY TRAJECTORY — ${passed} checks ALL PASS`);
})().catch(e => { console.error('❌ FAIL:', e.message); process.exit(1); });
