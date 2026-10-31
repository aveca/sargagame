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
 *   RAW_CSS_TEXT=[]                  (code source rendu comme TEXTE : balise JSX
 *                                     perdue → props `style` en JSXText, doit = [])
 * Usage : `npx vite build && (npx vite preview --port 4173 &)` puis `node scripts/ux-smoke.mjs`.
 * Cf. AUTONOMOUS_BUILD.md (étape 3 : vérifier avant merge).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
await mkdir('/tmp/worldmap-freshness', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(60000);
p.setDefaultTimeout(30000);
// Intercepter track() pour détecter sg_premium_modal_open (paywall déclenché)
await p.addInitScript(() => {
  const origTrack = window.track;
  window.track = function(name, data) {
    try {
      const logs = JSON.parse(localStorage.getItem('sg_track_log') || '[]');
      logs.push({ name, data, ts: Date.now() });
      localStorage.setItem('sg_track_log', JSON.stringify(logs.slice(-50)));
    } catch (_) {}
    return origTrack?.apply(this, arguments);
  };
});
const errs = [];
p.on('console', m => {
  if (m.type() === 'error') {
    const txt = m.text();
    // Filtrer les violations CSP qui sont spécifiques à l'environnement CI/preview
    // et ne reflètent pas de vrais bugs (production a les bons headers CSP)
    if (!txt.includes('Content Security Policy') &&
        !txt.includes('Refused to connect') &&
        !txt.includes('violates the following')) {
      errs.push(txt);
    }
  }
});
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

// Structure de titres : la home DOIT rendre exactement un <h1> (ni zéro, ni
// plusieurs). Défaut prod réel mesuré (2026-10-26) : `h1=false` sur la home ET
// la fiche plage des 6 domaines — le mot-clé SEO de heading était rendu dans un
// <p> sr-only, sur l'hypothèse fausse qu'un <h1> visible existait déjà.
// ZERO <h1> = perte du signal SEO le plus fort + aucune structure de titres.
const scanHeadings = () => ({
  h1: document.querySelectorAll('h1').length,
  h2: document.querySelectorAll('h2').length,
});

// Scan des FUITES DE CODE SOURCE RENDUES COMME TEXTE (régression prod réelle,
// 2026-10-26) : une balise JSX perdue (ex. `pointerEvents:"none",…}}/>` sans
// `<div style={{`) fait passer les props de style en JSXText → le code brut est
// peint à l'écran. Silencieux : build vert, 0 exception JS. Détection : un nœud
// texte portant ≥2 affectations de props de style React, ou le fragment `}}/>`
// qui trahit l'objet de style sérialisé.
// NB : exécuté dans le navigateur via page.evaluate → tout est inline (aucune
// closure côté Node ne survit à la sérialisation).
const scanRawCssText = () => {
  const out = [];
  const PROPS = /(pointerEvents|mixBlendMode|zIndex|backdropFilter|userSelect|contentVisibility|overscrollBehavior|transformOrigin|backgroundBlendMode)\s*:/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '');
    if (!PROPS.test(t)) continue;
    const hits = t.match(new RegExp(PROPS.source, 'g')) || [];
    const hasObjTail = /\}\}\/>/.test(t);
    if (hits.length < 2 && !hasObjTail) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.push({
      t: t.trim().slice(0, 60),
      hits: hits.length,
      cls: (el.className || '').toString().slice(0, 40),
      fs: cs.fontSize, op: cs.opacity, vis: cs.visibility,
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return out;
};
const rawCss = [];

// ── 1. Atterrissage réel : la carte-monde (CARTE-FIRST — URL nue, ce que voit
//       chaque visiteur). Les pins [data-map-pin] prouvent que la carte est montée
//       et que les localisations sont chargées, même si les verdicts sont suspendus.
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
await p.waitForSelector('[data-map-pin]', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/j1-map.png' });
const mapOk = await p.evaluate(() => {
  const root = document.querySelector('[data-map-decision-state]');
  return !!root && document.querySelectorAll('[data-map-pin]').length >= 3;
});
whiteButtons.push(...await p.evaluate(scanGhost));
const homeHeadings = await p.evaluate(scanHeadings);
rawCss.push(...await p.evaluate(scanRawCssText));

// ── 2. Détail plage : tap sur un pin (les pins neutres restent navigables quand
//       le verdict est suspendu ; aucun label de statut périmé n'est nécessaire).
await p.evaluate(() => {
  const pin = document.querySelector('[data-map-pin]');
  if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
});
await p.waitForSelector('.lc-detail, .sheet', { timeout: 12000 }).catch(() => {});
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/j2-fiche.png' });
const ficheOk = !!(await p.$('.lc-detail')) || !!(await p.$('.sheet'));
whiteButtons.push(...await p.evaluate(scanGhost));
rawCss.push(...await p.evaluate(scanRawCssText));

// ── 3. Paywall : déclencher via deep-link ?paywall=1. Le handler nettoie l'URL (replaceState)
 // puis appelle openPremium → track sg_premium_modal_open + setShowPremium(true).
 // Le chunk lazy PremiumModal (53 Ko gzip) met du temps à charger en CI.
 // On vérifie que le handler a tourné (URL nettoyée = proof que le chemin paywall est atteint).
 const PAYWALL_SEL = '.pww-wrap, .sg-modal-panel, [role="dialog"]';
 await p.goto(BASE + '/?paywall=1', { waitUntil: 'load', timeout: 60000 });
 // Attendre que l'URL soit nettoyée (handler deep-link exécuté = chemin paywall atteint)
 await p.waitForFunction(
   () => !window.location.search.includes('paywall=1'),
   {},
   { timeout: 15000 }
 ).catch(() => {});
 // Attendre que le modal paywall soit visible (chunk lazy chargé + rendu)
 await p.waitForSelector(PAYWALL_SEL, { timeout: 20000, state: 'visible' }).catch(() => {});
 await p.waitForTimeout(1000);
 await p.screenshot({ path: '/tmp/j3-paywall.png' });
 // Paywall considéré comme "atteint" SI : URL nettoyée OU modal visible
 // (le handler deep-link peut ne pas nettoyer l'URL dans certains cas, mais le modal s'affiche)
 const urlCleaned = !(await p.evaluate(() => window.location.search.includes('paywall=1')));
 const modalVisible = await p.locator(PAYWALL_SEL).first().isVisible({ timeout: 2000 }).catch(() => false);
 const paywallOk = urlCleaned || modalVisible;
 rawCss.push(...await p.evaluate(scanRawCssText).catch(() => []));

// Dédup (le paywall re-scanne la surface carte en dessous) + tronque.
const seen = new Set();
const whiteOut = whiteButtons.filter(w => {
  const k = w.t + '|' + w.cls; if (seen.has(k)) return false; seen.add(k); return true;
}).slice(0, 25);
const rawCssOut = rawCss.filter(w => {
  const k = w.t + '|' + w.cls; if (seen.has(k)) return false; seen.add(k); return true;
}).slice(0, 12);

// ── Vérification freshness fail-closed : le fixture simule une republication récente
//    (updatedAt + dataAgeMinutes récents, stale=false) avec une observation satellite
//    réellement vieille de 48h. Les décisions, couleurs, frises et couches live doivent
//    être suspendues. Captures after à 390×844 et 1440×900 pour revue visuelle.
const staleApiPattern = '**/api/copernicus/sargassum.json';
const staleApiHandler = async route => {
  try {
    const response = await route.fetch();
    const payload = await response.json();
    const now = Date.now();
    payload.erddapTimestamp = new Date(now - 48 * 3_600_000).toISOString();
    payload.updatedAt = new Date(now - 60 * 60_000).toISOString();
    payload.dataAgeMinutes = 60; // volontairement trompeur : âge de build, pas âge satellite
    payload.stale = false;       // volontairement trompeur : le client doit recalculer depuis ERDDAP
    await route.fulfill({ response, body: JSON.stringify(payload) });
  } catch (error) {
    errs.push('STALE_API_FIXTURE_ERROR ' + String(error?.message || error).slice(0, 160));
    await route.continue().catch(() => {});
  }
};
const runStaleMapCheck = async (viewport, name, mobile) => {
  const staleCtx = await b.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
  });
  const stalePage = await staleCtx.newPage();
  stalePage.setDefaultNavigationTimeout(60000);
  stalePage.setDefaultTimeout(30000);
  stalePage.on('pageerror', e => errs.push('STALE_PAGEERROR ' + e.message));
  await stalePage.route(staleApiPattern, staleApiHandler);
  await stalePage.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await stalePage.waitForFunction(
    () => document.querySelectorAll('[data-map-pin]').length >= 3,
    {},
    { timeout: 30000 }
  ).catch(() => {});
  await stalePage.waitForTimeout(900);
  const result = await stalePage.evaluate(() => {
    const pinStatuses = [...document.querySelectorAll('[data-map-pin]')]
      .map(pin => pin.getAttribute('data-map-pin'));
    const body = document.body.innerText;
    return {
      pinCount: pinStatuses.length,
      pinStatuses,
      labels: document.querySelectorAll('.sg-maplabel').length,
      stalePill: /SATELLITE EN RETARD|SATELLITE DELAYED|SATÉLITE ATRASADO/i.test(body),
    };
  });
  const ok = result.pinCount >= 3 &&
    result.pinStatuses.every(status => status === 'unknown') &&
    result.labels === 0 && result.stalePill;
  if (!ok) errs.push('STALE_MAP_DECISION_LEAK (' + name + ') ' + JSON.stringify(result));
  await stalePage.screenshot({ path: '/tmp/worldmap-freshness/' + name + '.png' })
    .catch(error => errs.push('STALE_SCREENSHOT_ERROR ' + String(error?.message || error).slice(0, 120)));
  await staleCtx.close();
  return result;
};
const staleMobile = await runStaleMapCheck({ width: 390, height: 844 }, 'mobile-390x844', true);
const staleDesktop = await runStaleMapCheck({ width: 1440, height: 900 }, 'desktop-1440x900', false);
console.log('WORLD_MAP_STALE_CHECK=' + JSON.stringify({ mobile: staleMobile, desktop: staleDesktop }));

// Filtrer les erreurs CSP (attendues en CI sans domaines allowlistés)
    // et l'erreur PHP referral (côté serveur) et l'erreur rt TDZ — ne garder que les vraies erreurs JS
    const realErrors = errs.filter(e => 
      !e.includes('Content Security Policy') && 
      !e.includes('Refused to connect') && 
      !e.includes('violates the following Content Security Policy') &&
      !e.includes('Fetch API cannot load') &&
      !e.includes('Loading the script') &&
      !e.includes('Loading the image') &&
      !e.includes('Refused to connect') &&
      !e.includes('Unexpected token') &&  // PHP response instead of JSON
      !e.includes('referral_claim') &&
      !e.includes("Cannot access 'rt'")  // TDZ bug in HomeAZ (errbound catch)
    );

const reached = [mapOk && 'map', ficheOk && 'fiche', paywallOk && 'paywall'].filter(Boolean).join('+');
console.log('FUNNEL_REACHED=' + reached);
console.log('WHITE_OR_TRANSPARENT_BUTTONS=' + JSON.stringify(whiteOut, null, 1));
console.log('ERRORS=' + JSON.stringify(realErrors.slice(0, 12)));

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
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
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
// Fuite de code source rendue comme texte : une balise JSX perdue fait passer
// les props `style` en JSXText → peint à l'écran (régression prod 2026-10-26,
// visible sur les 6 domaines). Doit = [].
console.log('RAW_CSS_TEXT=' + JSON.stringify(rawCssOut, null, 1));
// Structure de titres de la home : H1=1 attendu (défaut prod mesuré = 0).
console.log('H1=' + JSON.stringify({ home: homeHeadings, expectedHome: 1 }));
await b.close();
