// tests/unit/wow-home.test.cjs — 2026-09-24 (HOME WOW « LE POULS DE LA MER »)
// Contrat de la nouvelle expérience HOME/DISCOVERY (audit source) :
// ligne de balises draggable (1 bouée = 1 plage réelle, ouest→est par longitude
// réelle) → carte focus (état live) → action. Rollback produit ?sgwow=0.
// Lancement : node tests/unit/wow-home.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'ExperienceReset.jsx'), 'utf8');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('HOME WOW — ligne de balises (workstream home/discovery)\n');

// — Structure : HomeWow + SeaRail définis, branchés dans XpRouter par défaut
check('HomeWow composant défini et exporté', /export function HomeWow\(/.test(SRC));
check('SeaRail (ligne de balises) défini', /function SeaRail\(/.test(SRC));
check('XpRouter : HomeWow = HOME par défaut', /<HomeWow \{\.\.\.rest\}/.test(SRC));
check('Body/armure marine : WOW_ARMOR défini', SRC.includes('const WOW_ARMOR'));

// — Rollback produit obligatoire (règle repo : ?flag=0)
check('rollback ?sgwow=0 (regex prouvée, ancres ?&/$)', SRC.includes('[?&]sgwow=0(?:&|$)'));
check('ancien HomeDashboard conservé (chemin rollback)', /wowOff \? <HomeDashboard/.test(SRC));
check('même testid xp-home sur les 2 chemins', (SRC.match(/data-testid="xp-home"/g) || []).length >= 2);

// — Interaction réelle : drag/scroll → focus → reveal (pas juste une anim)
check('snap scroll + détection du centre (rAF)', SRC.includes('scroll-snap-type:x') && SRC.includes('cancelAnimationFrame'));
check('drag souris desktop (pointerdown/move + scrollLeft)', SRC.includes('onPointerDown') && SRC.includes('scrollLeft'));
check('molette horizontale (wheel non passif)', SRC.includes("addEventListener('wheel'") && SRC.includes('passive: false'));
check('clavier ← → sur la ligne', SRC.includes("e.key === 'ArrowRight'") && SRC.includes("e.key === 'ArrowLeft'"));
check('chips statut = seek impératif (ctrlRef.scrollToIdx)', SRC.includes('ctrlRef.current = { scrollToIdx }') && SRC.includes('railCtrl.current?.scrollToIdx?.(i, true)'));

// — Données réelles uniquement (moat honnêteté)
check('tri ouest→est = longitude réelle (lng, jamais inventée)', SRC.includes('a.lng == null ? 1e9 : a.lng'));
check('fraîcheur réelle (erddapTimestamp / updatedAt)', SRC.includes('sargData?.erddapTimestamp || sargData?.updatedAt'));
check('statut/score/confiance réels sur la carte focus', SRC.includes('statusMeta(active.status') && SRC.includes('active.confidence'));
check('raison réelle affichée (b.reason)', SRC.includes('active.reason'));
check('alternative réelle quand À ÉVITER (findAlternatives)', SRC.includes("active.status === 'avoid' ? findAlternatives"));

// — i18n 3 langues obligatoire
check('titre i18n FR/EN/ES', SRC.includes("'LE POULS DE LA MER'") && SRC.includes("'THE SEA\\u2019S PULSE'") && SRC.includes("'EL PULSO DEL MAR'"));
check('hint drag i18n 3 langues', SRC.includes('Desliza el mar') && SRC.includes('Drag the sea'));
check('pill EN DIRECT/LIVE/EN VIVO', SRC.includes("'EN DIRECT', 'LIVE', 'EN VIVO'"));

// — Testids existants préservés (tests E2E/QA existants ne cassent pas)
for (const tid of ['xp-home', 'xp-best-open', 'xp-open', 'xp-beach-card', 'trip-open', 'xp-search', 'xp-all', 'xp-best-more', 'xp-suivi', 'xp-pass', 'xp-map', 'xp-explore']) {
  check(`data-testid ${tid} préservé`, SRC.includes(`data-testid="${tid}"`));
}
check('garde ?tripplan=0 conservée sur entrée trip', SRC.includes('[?&]tripplan=0(?:&|$)'));

// — Design system : trio couleur+forme+mot, armure skin theme-comic, calme
check('formes SVG par statut (✓ / ◐ / ✕)', SRC.includes('StatusShape') && SRC.includes('BuoyGlyph'));
check('buoy armuré contre le skin forcé (doublé-classe !important)', SRC.includes('.wow-buoy.wow-buoy{background:none!important'));
check('chips armurés (3 statuts)', SRC.includes('.wow-chip-clean.wow-chip-clean') && SRC.includes('.wow-chip-mod.wow-chip-mod') && SRC.includes('.wow-chip-avoid.wow-chip-avoid'));
check('XP_ARMOR réutilisé (CTA or protégé)', SRC.includes('{XP_ARMOR}{WOW_ARMOR}'));
check('pulse lente (4.2s, doctrine calme — pas de pulse rapide)', SRC.includes('wowpulse 4.2s'));
check('reduced-motion : scroll instantané (_prefersReduced)', SRC.includes('prefers-reduced-motion: reduce'));

// — Mesurabilité (events découverte + event best conservé)
for (const ev of ['sg_home_rail_focus', 'sg_home_rail_seek', 'sg_home_rail_open', 'sg_home_rail_drag', 'sg_home_best_open']) {
  check(`event ${ev} émis`, SRC.includes(`'${ev}'`));
}
check('1er focus (init top pick) non tracké — pas un geste', SRC.includes('lastTracked.current == null'));

// — Non-régression structurelle
check('HomeLower partagé (ancien home au pixel près au rollback)', /function HomeLower\(/.test(SRC) && /<HomeLower lang=\{lang\}/.test(SRC));
check('fallback zéro trou : liste vide → ancien HomeDashboard', SRC.includes('!data.list.length) return <HomeDashboard'));
check('aucun import externe ajouté (zéro dépendance)', !SRC.includes("from 'framer") && !SRC.includes("from 'gsap") && !SRC.includes("from 'lodash"));

console.log(`\n${passed} checks OK`);
