#!/usr/bin/env node
// sg-cf-remove-noso-routes.cjs
//
// Remplace les routes frontantes DOMAIN/* -> sg-noso par DOMAIN/* -> sargagame-<region>
// (create -> verify coexistence -> delete old -> re-verify). sg-noso est CONSERVE
// (routes re-creables en un appel). Aucun domaine ne peut se retrouver sans route.
//
// Usage :
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/sg-cf-remove-noso-routes.cjs plan
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/sg-cf-remove-noso-routes.cjs apply
//
// Modes :
//   plan  -> lecture seule : liste les routes actuelles et ce qui serait fait.
//   apply -> execute la sequence create->verify->delete->re-verify.
//
// Variables d'environnement requises :
//   CLOUDFLARE_API_TOKEN    token avec permissions Zone:Workers Routes:Edit + Zone:Read
//   CLOUDFLARE_ACCOUNT_ID  identifiant du compte Cloudflare
//
// Aucune modification de secret, aucun deploiement de worker, aucun push.

'use strict';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const MODE = (process.argv[2] || 'plan').toLowerCase();

if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN manquant'); process.exit(2); }
if (!ACCOUNT) { console.error('CLOUDFLARE_ACCOUNT_ID manquant'); process.exit(2); }
if (!['plan', 'apply'].includes(MODE)) { console.error('Mode inconnu: ' + MODE + ' (plan|apply)'); process.exit(2); }

// Mapping exact (service bindings live, prouve 2026-11-10) :
//   sargasses-guadeloupe.com -> sargagame-gp
//   sargasses-martinique.com  -> sargagame-mq
//   sargassummiami.com        -> sargagame-florida
//   sargassumpuntacana.com    -> sargagame-puntacana
//   sargassumcancun.com       -> sargagame-rivieramaya
//   sargazotulum.com          -> sargagame-tulum
const MAPPING = [
  { domain: 'sargasses-guadeloupe.com', worker: 'sargagame-gp' },
  { domain: 'sargasses-martinique.com',  worker: 'sargagame-mq' },
  { domain: 'sargassummiami.com',        worker: 'sargagame-florida' },
  { domain: 'sargassumpuntacana.com',    worker: 'sargagame-puntacana' },
  { domain: 'sargassumcancun.com',       worker: 'sargagame-rivieramaya' },
  { domain: 'sargazotulum.com',          worker: 'sargagame-tulum' },
];

const API = 'https://api.cloudflare.com/client/v4';

async function cf(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const errs = (json.errors || []).map(e => e.message).join('; ') || res.statusText;
    throw new Error(method + ' ' + path + ' -> ' + res.status + ': ' + errs);
  }
  return json;
}

async function getZoneId(domain) {
  const json = await cf('GET', '/zones?name=' + encodeURIComponent(domain) + '&status=active');
  const zones = json.result || [];
  if (!zones.length) throw new Error('Zone introuvable pour ' + domain);
  return zones[0].id;
}

async function listRoutes(zoneId) {
  const json = await cf('GET', '/zones/' + zoneId + '/workers/routes');
  return json.result || [];
}

async function createRoute(zoneId, pattern, script) {
  return cf('POST', '/zones/' + zoneId + '/workers/routes', { pattern, script });
}

async function deleteRoute(zoneId, routeId) {
  return cf('DELETE', '/zones/' + zoneId + '/workers/routes/' + routeId);
}

function patternFor(domain) { return domain + '/*'; }

async function processDomain(entry, apply) {
  const { domain, worker } = entry;
  const zoneId = await getZoneId(domain);
  const routes = await listRoutes(zoneId);
  const pattern = patternFor(domain);
  const oldRoutes = routes.filter(r => r.pattern === pattern && r.script === 'sg-noso');
  const newRoutes = routes.filter(r => r.pattern === pattern && r.script === worker);
  const otherRoutes = routes.filter(r => r.pattern === pattern && r.script !== 'sg-noso' && r.script !== worker);

  console.log('\n=== ' + domain + ' (zone ' + zoneId + ') ===');
  console.log('  pattern : ' + pattern);
  console.log('  routes existantes sur ce pattern :');
  for (const r of routes.filter(r => r.pattern === pattern)) {
    console.log('    - ' + r.script + ' (id=' + r.id + ')');
  }
  if (otherRoutes.length) {
    console.warn('  ⚠ routes inattendues sur ce pattern (non touchées) : ' + otherRoutes.map(r => r.script).join(', '));
  }

  if (!oldRoutes.length && newRoutes.length) {
    console.log('  ✓ déjà migré : ' + worker + ' présent, aucun sg-noso. Rien à faire.');
    return { domain, status: 'already-migrated' };
  }
  if (!oldRoutes.length && !newRoutes.length) {
    console.warn('  ⚠ aucune route sg-noso ni ' + worker + ' sur ce pattern. Vérifier manuellement.');
    return { domain, status: 'no-route' };
  }

  if (MODE === 'plan') {
    console.log('  PLAN :');
    if (!newRoutes.length) console.log('    1. CREATE  ' + pattern + ' -> ' + worker);
    console.log('    2. VERIFY  coexistence ' + worker + ' + sg-noso');
    console.log('    3. DELETE  ' + oldRoutes.length + ' route(s) sg-noso');
    console.log('    4. RE-VERIFY  ' + worker + ' seul sur le pattern');
    return { domain, status: 'planned', oldRoutes: oldRoutes.length, newRoutes: newRoutes.length };
  }

  // APPLY
  let createdId = null;
  try {
    if (!newRoutes.length) {
      console.log('  1/4 CREATE ' + pattern + ' -> ' + worker + ' ...');
      const created = await createRoute(zoneId, pattern, worker);
      createdId = (created.result && created.result.id) || null;
      console.log('      créé (id=' + createdId + ')');
    } else {
      console.log('  1/4 CREATE ignoré (' + worker + ' déjà présent)');
    }

    // 2. verify coexistence
    console.log('  2/4 VERIFY coexistence ...');
    const afterCreate = await listRoutes(zoneId);
    const hasNew = afterCreate.some(r => r.pattern === pattern && r.script === worker);
    const hasOld = afterCreate.some(r => r.pattern === pattern && r.script === 'sg-noso');
    if (!hasNew) throw new Error('VERIFY échoué : ' + worker + ' absent après création');
    console.log('      ' + worker + '=' + hasNew + ', sg-noso=' + hasOld + ' (coexistence OK)');

    // 3. delete old sg-noso routes
    console.log('  3/4 DELETE sg-noso (' + oldRoutes.length + ' route(s)) ...');
    for (const r of oldRoutes) {
      await deleteRoute(zoneId, r.id);
      console.log('      supprimé id=' + r.id);
    }

    // 4. re-verify
    console.log('  4/4 RE-VERIFY ...');
    const finalRoutes = await listRoutes(zoneId);
    const finalNew = finalRoutes.filter(r => r.pattern === pattern && r.script === worker);
    const finalOld = finalRoutes.filter(r => r.pattern === pattern && r.script === 'sg-noso');
    if (!finalNew.length) throw new Error('RE-VERIFY échoué : ' + worker + ' absent après suppression');
    if (finalOld.length) throw new Error('RE-VERIFY échoué : sg-noso encore présent');
    console.log('      ' + worker + '=' + finalNew.length + ', sg-noso=' + finalOld.length + ' ✓');
    return { domain, status: 'migrated', createdId };
  } catch (err) {
    console.error('  ✗ ERREUR sur ' + domain + ' : ' + err.message);
    if (createdId) console.error('    route créée (id=' + createdId + ') mais suppression non atteinte — vérifier manuellement');
    throw err;
  }
}

(async () => {
  console.log('Mode : ' + MODE.toUpperCase());
  console.log('Mapping : ' + MAPPING.length + ' domaines');
  const results = [];
  for (const entry of MAPPING) {
    try {
      results.push(await processDomain(entry, MODE === 'apply'));
    } catch (err) {
      console.error('\nArrêt sur erreur : ' + err.message);
      process.exit(1);
    }
  }
  console.log('\n=== RÉSUMÉ ===');
  for (const r of results) console.log('  ' + r.domain + ' : ' + r.status);
  if (MODE === 'plan') {
    console.log('\nPour appliquer : relancer avec le mode "apply" (et CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).');
  }
})();
PY