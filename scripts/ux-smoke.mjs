/**
 * ux-smoke.mjs — smoke visuel du FUNNEL RÉEL (mobile, émulation iPhone).
 * Parcours : carte-monde (atterrissage CARTE-FIRST) → détail plage comic → paywall.
 * (L'ancien « parcours comic » splash→onboarding→arène testait le jeu, RETIRÉ du
 *  produit — décision fondateur, cf. Sargasses_PROD.jsx « JEU RETIRÉ DU PRODUIT » ;
 *  l'arène est du code dormant ?hero=1, plus une surface utilisateur.)
 * Sort des captures /tmp/j*.png + scan des BOUTONS BLANCS (doit = []) + erreurs JS.
 * Tokens greppables (le Gate greppe la sortie, jamais l'exit code — toujours exit 0) :
 *   FUNNEL_REACHED=map+fiche+paywall (les 3 surfaces du funnel atteintes ; il en
 *                                     manque une = le scan a tourné sur la mauvaise
 *                                     surface → gate : grep du littéral complet)
 *   WHITE_OR_TRANSPARENT_BUTTONS=[]  (nom historique — test de VISIBILITÉ : boutons
 *                                     FANTÔMES [aucune peinture propre ni d'ancêtre]
 *                                     ou TEXTE INVISIBLE [couleur == fond résolu],
 *                                     doit = [] ; labels carte .sg-maplabel whitelistés)
 *   ERRORS=[]                        (erreurs console/page, doit = [], tronqué à 12)
 *   RM_INFINITE=[]                   (animations infinies encore actives sous
 *                                     prefers-reduced-motion:reduce, doit = [],
 *                                     tronqué à 12 ; gate : grep -q 'RM_INFINITE=\[\]')
 * Usage : `npx vite build && (npx vite preview --port 4173 &)` puis `node scripts/ux-smoke.mjs`.
 * Cf. AUTONOMOUS_BUILD.md (étape 3 : vérifier avant merge).
 */
import { chromium } from 'playwright';
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

// Scan boutons INVISIBLES — partagé entre les surfaces du funnel. Le token garde son
// nom historique WHITE_OR_TRANSPARENT_BUTTONS (compat Gate) mais le test est devenu un
// test de VISIBILITÉ : sur les surfaces réelles, « blanc » et « transparent » sont des
// choix de design légitimes (chips fiche blanches à bordure encre, boutons transparents
// dans une pilule peinte, labels texte sur la carte). Ce qui reste un BUG :
//  - FANTÔME : aucune peinture propre (fond/image/bordure/ombre) ET aucun ancêtre peint
//    → le bouton flotte invisible (classe de bug « skin de thème écrase l'inline »).
//  - TEXTE INVISIBLE : couleur du texte == fond résolu (blanc-sur-blanc, noir-sur-noir)
//    sans text-shadow pour le rattraper.
// Whitelist design (même esprit que LOADING_OK de la passe reduced-motion) :
//  - .sg-maplabel : labels de plage de la carte — texte nu VOULU par-dessus la carte
//    (background:none !important, app-runtime.css), l'ink-shadow vit sur les ENFANTS
//    → le wrapper semble fantôme au test alors qu'il est lisible par construction.
const scanGhost = () => {
  const out = [];
  const DESIGN_OK = /(^|\s)sg-maplabel(\s|$)/;
  const painted = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
  for (const el of document.querySelectorAll('button, a[role=button], [role=button]')) {
    const r = el.getBoundingClientRect(); if (r.width < 30 || r.height < 18) continue;
    const cls = el.className.toString();
    if (DESIGN_OK.test(cls)) continue;
    const s = getComputedStyle(el);
    const ownPaint = painted(s.backgroundColor) || s.backgroundImage !== 'none'
      || (s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0)
      || s.boxShadow !== 'none';
    // fond effectif : premier ancêtre peint (fond couleur ou image)
    let effBg = null, e = el.parentElement;
    while (e && e !== document.documentElement) {
      const ps = getComputedStyle(e);
      if (painted(ps.backgroundColor)) { effBg = ps.backgroundColor; break; }
      if (ps.backgroundImage !== 'none') { effBg = 'image'; break; }
      e = e.parentElement;
    }
    const ghost = !ownPaint && !effBg;
    const resolvedBg = painted(s.backgroundColor) ? s.backgroundColor : effBg;
    const hasText = !!(el.textContent || '').trim();
    const invisibleText = hasText && s.backgroundImage === 'none' && resolvedBg
      && resolvedBg !== 'image' && resolvedBg === s.color && s.textShadow === 'none';
    if (ghost || invisibleText) out.push({
      why: ghost ? 'ghost' : 'text',
      t: (el.textContent || '').trim().slice(0, 24),
      bg: s.backgroundColor, color: s.color, cls: cls.slice(0, 40),
    });
  }
  return out;
};
const whiteButtons = [];

// ── 1. Atterrissage réel : la carte-monde (CARTE-FIRST — URL nue, ce que voit
//       chaque visiteur). Les labels de plage .sg-maplabel prouvent que la carte
//       est montée ET nourrie en data (declutter n'en révèle qu'un sous-ensemble).
await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForSelector('.sg-maplabel', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/j1-map.png' });
const mapOk = await p.evaluate(() => document.querySelectorAll('.sg-maplabel').length >= 3);
whiteButtons.push(...await p.evaluate(scanGhost));

// ── 2. Détail plage : tap sur un label VISIBLE (vrai geste utilisateur ; clic JS
//       car le pan de la carte peut voler le clic physique en émulation). Route
//       par défaut = ComicDetail (.lc-detail, flag mapdetail) ; fallback fiche
//       data (.sheet) si le flag change — les deux comptent comme « fiche ».
await p.evaluate(() => {
  const l = [...document.querySelectorAll('.sg-maplabel')]
    .find(el => getComputedStyle(el).visibility !== 'hidden');
  if (l) l.click();
});
await p.waitForSelector('.lc-detail, .sheet', { timeout: 12000 }).catch(() => {});
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/j2-fiche.png' });
const ficheOk = !!(await p.$('.lc-detail')) || !!(await p.$('.sheet'));
whiteButtons.push(...await p.evaluate(scanGhost));

// ── 3. Paywall : d'abord le CTA du détail comic (chemin de conversion réel),
//       sinon le deep-link produit ?paywall=1 (chemin /a-propos/ et /alertes/) en
//       filet déterministe. Détection multi-skins : .pwx-wrap (ComicPaywall) /
//       .sg-modal-panel (PremiumModal classique/World).
const PAYWALL_SEL = '.pwx-wrap, .sg-modal-panel';
await p.evaluate(() => {
  const cta = document.querySelector('.lc-detail .lc-cta');
  if (cta) cta.click();
});
await p.waitForSelector(PAYWALL_SEL, { timeout: 8000 }).catch(() => {});
if (!(await p.$(PAYWALL_SEL))) {
  await p.goto(BASE + '/?paywall=1', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForSelector(PAYWALL_SEL, { timeout: 12000 }).catch(() => {});
}
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/j3-paywall.png' });
const paywallOk = !!(await p.$(PAYWALL_SEL));
whiteButtons.push(...await p.evaluate(scanGhost));

// Dédup (le paywall re-scanne la surface carte en dessous) + tronque.
const seen = new Set();
const whiteOut = whiteButtons.filter(w => {
  const k = w.t + '|' + w.cls; if (seen.has(k)) return false; seen.add(k); return true;
}).slice(0, 25);

const reached = [mapOk && 'map', ficheOk && 'fiche', paywallOk && 'paywall'].filter(Boolean).join('+');
console.log('FUNNEL_REACHED=' + reached);
console.log('WHITE_OR_TRANSPARENT_BUTTONS=' + JSON.stringify(whiteOut, null, 1));
console.log('ERRORS=' + JSON.stringify(errs.slice(0, 12)));

// ── passe reduced-motion : plancher a11y (CLAUDE.md « prefers-reduced-motion ») ──
// Recharge la SURFACE D'ATTERRISSAGE RÉELLE (URL nue = carte-monde) avec
// prefers-reduced-motion:reduce, puis liste les animations à itérations INFINIES
// encore en cours : elles n'ont pas de fallback statique → violation du plancher.
// Token = RM_INFINITE=[] (liste vide = conforme).
// try/catch : un crash de CETTE passe ne doit jamais empêcher les tokens ci-dessus
// (déjà imprimés) ni faire sortir avec un code ≠ 0 — convention : le Gate greppe.
let rmInfinite = [];
try {
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1500); // settle (même ordre de grandeur que les étapes du parcours)
  await p.screenshot({ path: '/tmp/j7-reduced-motion.png' });
  rmInfinite = await p.evaluate(() => {
    // Spinners/skeletons de CHARGEMENT tolérés : encore visibles pendant le settle,
    // ils disparaissent au mount et ne sont pas une anim décorative persistante.
    const LOADING_OK = /(^|\s)(sg-sk\S*|skeleton\S*|lc-spin\S*|sg-spin\S*)(\s|$)/;
    const out = [];
    for (const a of document.getAnimations()) {
      try {
        if (a.playState !== 'running') continue;
        const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        if (!timing || timing.iterations !== Infinity) continue;
        const el = a.effect && a.effect.target;
        // className peut être un SVGAnimatedString sur les éléments SVG
        const cls = el && el.className != null
          ? String(el.className.baseVal !== undefined ? el.className.baseVal : el.className)
          : '';
        if (LOADING_OK.test(cls)) continue;
        out.push({
          name: a.animationName || a.id || 'anim',
          el: (el ? el.tagName.toLowerCase() : '?')
            + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        });
      } catch (_) { /* une anim illisible ne casse pas la passe */ }
    }
    return out;
  });
} catch (e) {
  // La passe elle-même a échoué : token non-vide explicite (le Gate bloquera),
  // mais le script termine proprement (exit 0) — les autres tokens sont déjà sortis.
  rmInfinite = ['RM_PASS_ERROR: ' + String(e && e.message ? e.message : e).slice(0, 160)];
}
console.log('RM_INFINITE=' + JSON.stringify(rmInfinite.slice(0, 12)));
await b.close();
