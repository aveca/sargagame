// tests/unit/journey.test.cjs — 2026-09-24 (WOW JOURNEY / CONTINUITY)
// Contrat du layer « un seul monde » : spine séjour partagée (journeyFor),
// deep link ?exp=, history push/replace/popstate, retour in-world (chip ← /
// edge-swipe / flèche clavier), strip trip, rollback global ?sgjourney=0,
// données 100 % réelles (forecast + findAlternatives réutilisés, jamais
// inventés). Lancement : node tests/unit/journey.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const JOURNEY = R('src/lib/journey.js');
const PROD = R('src/Sargasses_PROD.jsx');
const EXP = R('src/BeachExperience.jsx');
const TRIP = R('src/TripPlanner.jsx');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('WOW JOURNEY / CONTINUITY — contrat layer « un seul monde »\n');

// — Module spine (src/lib/journey.js)
check('journey.js existe et exporte journeyFor + journeyOff',
  /export function journeyFor\(/.test(JOURNEY) && /export const journeyOff = /.test(JOURNEY));
check('rollback global ?sgjourney=0', JOURNEY.includes('sgjourney=0'));
check('plan B réel : findAlternatives réutilisé (jamais inventé)', JOURNEY.includes('findAlternatives'));
check('plan B préfère une alternative CLEAN (destination réelle)', JOURNEY.includes('.status === "clean"'));
check('verrou J+3+ côté spine (locked = !isPremium && i >= 2)', /locked: !!\(!isPremium && i >= 2\)/.test(JOURNEY));
check('aucune donnée inventée si forecast absent (days=[])', /const days = \[\]/.test(JOURNEY));
check('critDay = 1er jour alert réel (null sinon — pas de fausse alerte)', JOURNEY.includes('d.status === "alert"'));

// — Sargasses_PROD : wiring monde
check('import journeyFor/journeyOff dans le parent', /import \{ journeyFor, journeyOff \} from "\.\/lib\/journey\.js"/.test(PROD));
check('deep link ?exp=<beachId> au boot (dataReady + île du build)', /URLSearchParams\(window\.location\.search\)\.get\("exp"\)/.test(PROD) && /expDeepRef/.test(PROD));
check('ouverture monde → pushState (entry dédiée)', /window\.history\.pushState\(\{sgexp:1\}/.test(PROD));
check('transformation A→B → replaceState (même « page », lien suit la plage)', /window\.history\.replaceState\(\{sgexp:1\}/.test(PROD));
check('Back navigateur = sortir du monde (popstate)', /window\.addEventListener\("popstate",onPop\)/.test(PROD));
check('✕ = chemin Back natif quand entry à nous (closeExperience → history.back)', /history\.back\(\)/.test(PROD));
check('pile in-world : plage quittée mémorisée (expPrevRef)', /expPrevRef\.current=\{id:cur\.id/.test(PROD));
check('strip param à la fermeture latérale (URL jamais sale)', /p\.delete\("exp"\)/.test(PROD));
check('spine stay partagée calculée une fois (journeyStay, experience OU ma plage)', /const journeyStay=useMemo/.test(PROD));
check('spine passée à l\'experience (stay/stayPrev/onStayBack)', /stay=\{journeyStay\}/.test(PROD) && /onStayBack=\{expJourneyBack\}/.test(PROD));
check('spine passée au TripPlanner', PROD.includes('<LazyTripPlanner') && /stay=\{journeyStay\}/.test(PROD));
check('✕ experience = closeExperience (plus de setSelectedBeach nu)', /onClose=\{closeExperience\}/.test(PROD));

// — Funnel : events allowlistés (mesure journey)
for (const ev of ['sg_exp_deeplink', 'sg_exp_chip_tap', 'sg_exp_back_tap', 'sg_exp_swipeback'])
  check(`event ${ev} allowlisté (SG_FUNNEL_EVENTS)`, PROD.includes('"' + ev + '"'));

// — BeachExperience : rail + geste + retour
check('rail séjour monté si et seulement si stay (rollback-safe)', /<div className="bx-rail" data-testid="exp-journey-rail"/.test(EXP));
check('chip ← retour in-world (stayPrev + onStayBack)', EXP.includes('exp-back-chip') && /onStayBack && onStayBack\(\)/.test(EXP));
check('chips jours verrouillées → premium (locked cohérent trip)', /d\.locked\) \{ onPremium && onPremium\("experience_chip"\)/.test(EXP));
check('chip plan B → transformation vers la plage réelle', EXP.includes('exp-planb-chip'));
check('edge-swipe → gauche >= 72px, départ <= 28px du bord', EXP.includes('t.clientX > 28') && EXP.includes('dx >= 72'));
check('geste jamais sans journey (stay null → handlers inertes)', /if \(!stay\) \{ edgeSwipeRef\.current = null; return \}/.test(EXP));
check('flèche clavier ← desktop = retour in-world', /e\.key === "ArrowLeft"/.test(EXP));
check('share = décision vivante (demain réel ajouté si fc[1])', EXP.includes('_tmrBit'));
check('armure anti-skin triplé-classe sur les chips', /bx-chip\.bx-chip\.bx-chip\{/.test(EXP.replace(/\s+/g, ' ')));
check('rail pointer-events chirurgicaux (conteneur none, enfants auto)', /bx-rail\{[^}]*pointer-events:none/.test(EXP.replace(/\s+/g, ' ')));

// — TripPlanner : strip séjour
check('strip stay présent (trip-stay-strip)', TRIP.includes('trip-stay-strip'));
check('chips semaine réelles (trip-stay-chip + confidence)', TRIP.includes('trip-stay-chip') && /d\.confidence/.test(TRIP));
check('plan B chip trip → retour au monde (onOpenBeach)', TRIP.includes('trip-planb-chip') && /onOpenBeach && onOpenBeach\(stay\.backup\.beach\)/.test(TRIP));
check('chip verrouillée trip → premium (trip_stay_chip)', TRIP.includes('trip_stay_chip'));
check('DayRow id tp-day-N (téléportation chip → ligne)', /id=\{rowId\}/.test(TRIP));
check('i18n strip FR/EN/ES', TRIP.includes('Your stay leans on') && TRIP.includes('Tu estancia se apoya en'));

// — Non-régression money-path / surfaces interdites
check('zéro changement pricing (aucun montant ajouté au journey)', !/(\d+(?:[.,]\d+)?\s*(?:€|\$|EUR|USD))/.test(JOURNEY));
check('experience : visuals core intacts (hero/verdict/WHY/TOMORROW/BACKUP classes)', ['bx-hero-card', 'bx-verdict', 'bx-why-proofs', 'bx-timeline-day', 'bx-backup-card'].every((k) => EXP.includes(k)));
check('premium CTA experience intact (exp-premium-cta)', EXP.includes('exp-premium-cta'));
check('TripPlanner CTA premium intact (trip-premium-cta)', TRIP.includes('trip-premium-cta'));
check('rollback experience ?sgexp=0 intact', PROD.includes('sgexp=0'));

console.log(`\n${passed} checks OK`);
