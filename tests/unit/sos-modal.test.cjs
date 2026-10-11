#!/usr/bin/env node
/**
 * sos-modal.test.cjs — Mission finale : certification fonctionnelle live SOS.
 *
 * Constats navigateurs réels (Playwright, 6 domaines) :
 *   - MQ/GP : modal rendu ([data-sos-plage], titre) mais DEUX instances
 *     empilées (double fetch, bouton de l'instance basse non cliquable).
 *   - USD (florida/puntacana/rivieramaya/tulum) : ?sos=1 exécuté (query
 *     nettoyée) mais 0 modal — SOSPlage ne connaît que beaches-list.json
 *     (MQ/GP uniquement) => état vide "Aucune plage disponible".
 *   - analytics_region_param NOT_VERIFIED partout : le vérificateur lisait
 *     `region.ga4` alors que la config s'appelle `ga4Id` (présent pour 4 régions).
 *
 * Séries (lecture du dépôt + logique pure, zéro réseau) :
 *   S1 un seul site de rendu LazySOSPlage (anti-doublon)
 *   S2 prop `beaches` câblée (appel + signature + repli région/fetch)
 *   S3 resolveGa4Id : ga4Id réel, TODO, absent, repli ga4 historique
 *   S4 gestionnaire deep-link ?sos=1 présent (setShowSOS + replaceState)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const APP = path.join(REPO, 'src', 'Sargasses_PROD.jsx');
const SOS = path.join(REPO, 'src', 'SOSPlage.jsx');
const PDV = require(path.join(REPO, 'scripts', 'autopilot', 'post-deploy-verify.cjs'));
const { getRegion } = require(path.join(REPO, 'regions', 'index.cjs'));

let failures = 0;
let count = 0;
function record(name, ok, extra) {
  count++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const appSrc = fs.readFileSync(APP, 'utf8');
const sosSrc = fs.readFileSync(SOS, 'utf8');

console.log('sos-modal : certification fonctionnelle (mission finale)\n');

// S1 — un seul site de rendu (sinon 2 instances empilées, double fetch,
// bouton de l'instance basse non cliquable).
{
  const n = (appSrc.match(/<LazySOSPlage lang=/g) || []).length;
  record('S1 un seul rendu <LazySOSPlage (anti-doublon)', n === 1, `occurrences=${n}`);
}

// S2 — prop beaches région câblée de bout en bout.
{
  const callOk = /<LazySOSPlage[^>]*beaches=\{/.test(appSrc);
  const sigOk = /function SOSPlage\(\{[^}]*beaches:\s*regionBeaches/.test(sosSrc);
  const fbOk = sosSrc.includes('(regionBeaches && regionBeaches.length)')
    && sosSrc.includes('? regionBeaches')
    && /\[sargData,\s*region,\s*regionBeaches,\s*selectedBeachId\]/.test(sosSrc);
  record('S2a appel : prop beaches={...} transmise', callOk);
  record('S2b signature SOSPlage : beaches: regionBeaches', sigOk);
  record('S2c repli : prop région prioritaire, sinon fetch (deps à jour)', fbOk);
}

// S3 — resolveGa4Id sur les VRAIES configs régions.
{
  const fl = getRegion('florida');
  const bb = getRegion('barbados');
  const mq = getRegion('mq');
  record('S3a florida ga4Id résolu (G-3LYNDLV1VH)', PDV.resolveGa4Id(fl) === 'G-3LYNDLV1VH', String(PDV.resolveGa4Id(fl)));
  record('S3b barbados TODO_GA4_ID => null (NOT_VERIFIED honnête)', PDV.resolveGa4Id(bb) === null);
  record('S3c mq absent => null (NOT_VERIFIED honnête)', PDV.resolveGa4Id(mq) === null);
  record('S3d repli champ historique ga4', PDV.resolveGa4Id({ ga4: 'G-LEGACY' }) === 'G-LEGACY');
  record('S3e ga4Id vide => null', PDV.resolveGa4Id({ ga4Id: '  ' }) === null);
}

// S4 — gestionnaire deep-link ?sos=1 présent et complet.
{
  const openOk = /p\.get\("sos"\)==="1"\)\{setShowSOS\(true\)/.test(appSrc);
  const urlOk = /window\.history\.replaceState\(\{\},"",window\.location\.pathname\)/.test(appSrc);
  record('S4 deep-link ?sos=1 => setShowSOS(true) + nettoyage URL', openOk && urlOk);
}

// S5 — overlay fixe (le modal nu se retrouvait SOUS la carte : invisible,
// boutons non cliquables ; le live MQ montrait la carte seule).
{
  const i = appSrc.indexOf('<LazySOSPlage lang=');
  const open = appSrc.lastIndexOf('{showSOS&&', i);
  const wrap = appSrc.slice(open, i);
  record('S5 overlay fixe z1080 + backdrop autour du rendu unique',
    wrap.includes('position:"fixed"') && wrap.includes('zIndex:1080') && wrap.includes('rgba(11,7,22,.62)'),
    'wrapper vérifié');
}

// S6 — état vide refermable (ex-impasse sans bouton sur USD).
{
  const emptyBlock = sosSrc.slice(sosSrc.indexOf('Aucune plage disponible'));
  record('S6 état vide avec bouton Plus tard/Later (refermable)',
    emptyBlock.slice(0, 1200).includes('onClick={onClose}') && /Plus tard/.test(emptyBlock.slice(0, 1200)));
}

console.log(`\n${count - failures}/${count} scénarios conformes`);
process.exit(failures ? 1 : 0);
