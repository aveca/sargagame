// tests/unit/sg-motion-grammar.test.cjs — 2026-09-24 (SGM MOTION GRAMMAR)
// Contrat de la grammaire de motion centralisée (src/sg-motion.css + lib/sgMotion.js)
// et de sa première application : le moment UNLOCK post-paiement (splash « Premium
// activé » → anneau tracé → verrou ouvert → semaine réelle en cascade).
// Lancement : node tests/unit/sg-motion-grammar.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'sg-motion.css'), 'utf8');
const LIB = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'sgMotion.js'), 'utf8');
const PROD = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('SGM — grammaire de motion centralisée\n');

// — Les 8 motions canoniques existent, rien d'autre à inventer
['sgmReveal', 'sgmPop', 'sgmFill', 'sgmRing', 'sgmUnlock', 'sgmDayIn', 'sgmBreathe', 'sgmFocus']
  .forEach(k => check('@keyframes ' + k, CSS.includes('@keyframes ' + k)));

// — Classes utilitaires raccordées aux keyframes
['sgm-reveal', 'sgm-pop', 'sgm-fill', 'sgm-ring', 'sgm-unlock', 'sgm-dayin', 'sgm-breathe', 'sgm-focus']
  .forEach(c => check('classe .' + c, CSS.includes('.' + c)));

// — Canal statut piloté par les données réelles (même palette que STC/VERDICT)
check('canal statut clean #22C55E', CSS.includes('[data-sgm-status="clean"]') && CSS.includes('#22C55E'));
check('canal statut moderate #B87A00', CSS.includes('[data-sgm-status="moderate"]') && CSS.includes('#B87A00'));
check('canal statut avoid #E8522A', CSS.includes('[data-sgm-status="avoid"]') && CSS.includes('#E8522A'));

// — Courbe maison unique (= BeachExperience), GPU-only
check('courbe maison cubic-bezier(.2,.8,.2,1)', /cubic-bezier\(\s*\.2\s*,\s*\.8\s*,\s*\.2\s*,\s*1\s*\)/.test(CSS));
check('GPU-only : aucune animation de width/height/top/left',
  !/animation:[^;]*(width|height|top|left)[^;]*;/.test(CSS.replace(/@keyframes[^{]+\{[^@]*?\}\s*\}/g, '')));

// — Version calme : reduced-motion = tout instantané, jamais cassé
check('media prefers-reduced-motion présente', CSS.includes('prefers-reduced-motion: reduce'));
check('reduced-motion neutralise les 8 classes',
  /prefers-reduced-motion: reduce\)\s*\{[^}]*sgm-reveal[^}]*animation: none !important/s.test(CSS));

// — lib/sgMotion.js : rollback + jours réels
check('helper off() exporté', /export function off\(/.test(LIB));
check('rollback ?sgmotion=0', LIB.includes('sgmotion=0'));
check('off() respecte prefers-reduced-motion', LIB.includes('prefers-reduced-motion: reduce'));
check('days7() calculé depuis Date (zéro invention)', LIB.includes('new Date') && LIB.includes('getDate() + i'));
check('days7() i18n fr/en/es', LIB.includes('fr:') && LIB.includes('en:') && LIB.includes('es:'));

// — Branchement : css + lib importés dans l'app
check('sg-motion.css importé', PROD.includes('import "./sg-motion.css"'));
check('sgMotion importé', PROD.includes('./lib/sgMotion.js'));

// — Première application : moment UNLOCK post-paiement
check('mémo sgmSplashOff présent', PROD.includes('sgmSplashOff'));
check('branche rollback splash intacte (splash statique conservé)', PROD.includes('ROLLBACK ?sgmotion=0'));
check('UNLOCK : anneau tracé (sgm-ring)', PROD.includes('sgm-ring'));
check('UNLOCK : verrou qui s\'ouvre (sgm-unlock)', PROD.includes('sgm-unlock'));
check('UNLOCK : ✓ qui éclot (sgm-pop)', PROD.includes('sgm-pop'));
check('UNLOCK : semaine réelle en cascade (sgm-dayin)', PROD.includes('sgm-dayin'));
check('UNLOCK : 7 jours RÉELS via sgmDays7', PROD.includes('sgmDays7(lang)'));
check('copy « Ta semaine s\'ouvre » i18n 3 langues',
  PROD.includes("Ta semaine s'ouvre") && PROD.includes('Your week opens') && PROD.includes('Tu semana se abre'));
check('aria conservé (role=status + aria-live + aria-hidden déco)',
  PROD.includes('role="status"') && PROD.includes('aria-live="polite"'));
check('event sg_premium_confirm_continue intact', PROD.includes('sg_premium_confirm_continue'));
check('copy « Premium activé » intacte (tests existants)',
  PROD.includes('"Premium activé"'));

console.log('\n' + passed + ' checks OK — grammaire SGM conforme.');
