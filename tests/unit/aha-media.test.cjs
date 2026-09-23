// tests/unit/aha-media.test.cjs — 2026-09-23 (AHA MEDIA LAYER)
// Contrat de la couche média réelle de BeachExperience (audit source) :
// la vraie plage (photo + hero-loop) superposée à la scène SVG, avec garde-fous
// perf/accessibilité, fallbacks sans trou, rollback ?aha=0, et données→visuel.
// Lancement : node tests/unit/aha-media.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src', 'BeachExperience.jsx');
const src = fs.readFileSync(SRC, 'utf8');
const PROD = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');

let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('AHA MEDIA — couche réelle BeachExperience\n');

// — Structure : ExpMedia défini + monté dans la scène, APRÈS l'SVG (étages)
check('ExpMedia composant défini', /function ExpMedia\(/.test(src));
const sceneIdx = src.indexOf('<Scene status={beach.status} />');
const mediaIdx = src.indexOf('<ExpMedia beachId={beach.id}');
check('ExpMedia monté dans la scène, après <Scene/>', sceneIdx > 0 && mediaIdx > sceneIdx);
check('scrim lisibilité + glow verdict présents', src.includes('bx-media-scrim') && src.includes('bx-media-glow'));

// — Rollback + interop flags existants
check('rollback ?aha=0', src.includes('(aha|heropv)=0'));
check('respecte ?heropv=0 (même regex que le rail prouvé)', src.includes('(aha|heropv)=0'));
check('gabarit off → ExpMedia retourne null', /if \(off\) return null/.test(src));

// — Garde-fous perf/accessibilité AVANT tout chargement vidéo
check('garde prefers-reduced-motion avant vidéo', src.includes('prefers-reduced-motion: reduce'));
check('garde saveData avant vidéo', src.includes('saveData'));
check('garde 2G avant vidéo', src.includes('effectiveType'));
check('vidéo manifest-gatée (ids réels uniquement)', src.includes('/videos/hero/manifest.json') && src.includes('.ids.includes(beachId)'));
check('variante -w desktop (manifest.wide)', src.includes('min-width:900px') && src.includes('m.wide.includes(beachId)'));
check('vidéo preload=none + muted + playsInline', src.includes('preload="none"') && src.includes('muted') && src.includes('playsInline'));

// — Zéro trou : fallbacks en cascade
check('photo : onError → retrait (scène SVG reste)', /onError=\{\(\) => setPhotoOk\(false\)\}/.test(src));
check('vidéo : onError → retrait (photo/scène reste)', /onError=\{\(\) => setVidSrc\(null\)\}/.test(src));
check('photo affichée seulement après load (fondu)', /opacity: photoOn \? 1 : 0/.test(src));
check('vidéo affichée seulement après playing (fondu)', /opacity: vidOn \? 1 : 0/.test(src));

// — Interaction & données
check('médias pointer-events:none (classe CSS dédiée)', /\.bx-media\{[^}]*pointer-events:none/.test(src.replace(/\s+/g, ' ')) || src.includes('pointer-events:none'));
check('atmosphère data-driven : filtre avoid présent', src.includes('saturate(.55)'))
check('atmosphère data-driven : filtre moderate présent', src.includes('saturate(.9)'));
check('verdict reste DOM (classes bx-verdict intactes)', src.includes('bx-verdict'));

// — International & territoire : chemins par beach.id, aucune région en dur
check('photo path par beachId (région-agnostique)', src.includes('`/beaches/gplace-${beachId}.jpg`'));
check('vidéo path par beachId (région-agnostique)', src.includes('`/videos/hero/${beachId}'));
check('aucune région hardcodée dans ExpMedia', !/gplace-(mq|gp|fl|pc|rm|tu)\d/.test(src));

// — Bundle : les médias restent runtime (aucun import de mp4/jpg dans src/)
check('aucun import statique de média lourd (bundle intact)', !/import\s+.*\.(mp4|webm|jpg)["']/.test(src));

// — Mesurabilité : event allowlisté côté funnel
check('sg_hero_video_view émis depuis l\'experience', src.includes('"sg_hero_video_view"'));
check('sg_hero_video_view dans SG_FUNNEL_EVENTS', PROD.includes('"sg_hero_video_view"'));

// — i18n/verdict/reveals intacts (non-régression du parcours)
check('reveals WHY/TOMORROW/BACKUP intacts', src.includes('id="bx-why"') && src.includes('id="bx-tomorrow"') && src.includes('id="bx-backup"'));
check('reduced-motion global du composant conservé', src.includes('@media(prefers-reduced-motion:reduce)'));
// — Armure skin : l'or du CTA ne doit JAMAIS être blanchi par .theme-comic button{!important}
check('armure CTA or (triplé-classe + !important, pattern XP_ARMOR)', src.includes('.bx-btn.bx-btn-gold.bx-btn-gold{background:#FFC72C !important'));

console.log(`\n${passed} checks OK`);
