#!/usr/bin/env node
// sg-cf-remove-noso-routes.cjs
//
// Remplace les routes frontantes DOMAIN/* -> sg-noso par DOMAIN/* -> sargagame-<region>
// via PUT (mise a jour atomique, pas de downtime, pas de suppression).
// sg-noso est CONSERVE (routes re-creables en un appel).
//
// Usage :
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/sg-cf-remove-noso-routes.cjs plan
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/sg-cf-remove-noso-routes.cjs apply
//
// Modes :
//   plan  -> lecture seule : liste les routes actuelles et ce qui serait fait.
//   apply -> execute la mise a jour atomique (PUT) + verification.
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

async function updateRoute(zoneId, routeId, pattern, script) {
  return cf('PUT', '/zones/' + zoneId + '/workers/routes/' + routeId, { pattern, script });
}

function patternFor(domain) { return domain + '/*'; }

async function processDomain(entry) {
  const { domain, worker } = entry;
  const zoneId = await getZoneId(domain);
  const routes = await listRoutes(zoneId);
  const pattern = patternFor(domain);
  const targetRoute = routes.find(r => r.pattern === pattern);

  console.log('\n=== ' + domain + ' (zone ' + zoneId + ') ===');
  console.log('  pattern : ' + pattern);

  if (!targetRoute) {
    console.warn('  ⚠ aucune route sur ce pattern. Vérifier manuellement.');
    return { domain, status: 'no-route' };
  }

  console.log('  route actuelle : ' + targetRoute.script + ' (id=' + targetRoute.id + ')');

  if (targetRoute.script === worker) {
    console.log('  ✓ déjà migré : ' + worker + '. Rien à faire.');
    return { domain, status: 'already-migrated' };
  }

  if (targetRoute.script !== 'sg-noso') {
    console.warn('  ⚠ route pointe vers ' + targetRoute.script + ' (pas sg-noso). Vérifier manuellement.');
    return { domain, status: 'unexpected-script', current: targetRoute.script };
  }

  if (MODE === 'plan') {
    console.log('  PLAN : PUT ' + pattern + ' : sg-noso -> ' + worker + ' (atomique, pas de downtime)');
    return { domain, status: 'planned', routeId: targetRoute.id };
  }

  // APPLY — mise a jour atomique
  console.log('  APPLY : PUT ' + pattern + ' : sg-noso -> ' + worker + ' ...');
  const originalScript = targetRoute.script;
  try {
    const updated = await updateRoute(zoneId, targetRoute.id, pattern, worker);
    const newScript = (updated.result && updated.result.script) || worker;
    if (newScript !== worker) throw new Error('Mise à jour non confirmée : script=' + newScript);

    // verify
    const after = await listRoutes(zoneId);
    const verified = after.find(r => r.id === targetRoute.id);
    if (!verified || verified.script !== worker) throw new Error('Vérification échouée : script=' + (verified && verified.script));

    console.log('  ✓ Route mise à jour : ' + pattern + ' -> ' + worker + ' (id=' + targetRoute.id + ')');
    return { domain, status: 'migrated', routeId: targetRoute.id };
  } catch (err) {
    console.error('  ✗ ERREUR sur ' + domain + ' : ' + err.message);
    // rollback attempt
    console.error('  ↩ Tentative de rollback : remettre sg-noso ...');
    try {
      await updateRoute(zoneId, targetRoute.id, pattern, originalScript);
      console.error('  ↩ Rollback OK : route remise à ' + originalScript);
    } catch (rbErr) {
      console.error('  ✗ ROLLBACK ÉCHOUÉ : ' + rbErr.message + ' — route dans un état inconnu, vérifier manuellement !');
    }
    throw err;
  }
}

(async () => {
  console.log('Mode : ' + MODE.toUpperCase());
  console.log('Mapping : ' + MAPPING.length + ' domaines');
  console.log('Méthode : PUT atomique (pas de downtime)');
  const results = [];
  for (const entry of MAPPING) {
    try {
      results.push(await processDomain(entry));
    } catch (err) {
      console.error('\nArrêt sur erreur : ' + err.message);
      process.exit(1);
    }
  }
  console.log('\n=== RÉSUMÉ ===');
  for (const r of results) console.log('  ' + r.domain + ' : ' + r.status);
  if (MODE === 'plan') {
    console.log('\nPour appliquer : relancer avec le mode "apply".');
  } else {
    console.log('\n✓ Remplacement terminé. Vérifier le site en production (sg-soscta ne doit plus être servi).');
  }
})();
