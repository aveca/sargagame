#!/usr/bin/env node
/**
 * trigger-production-deploy.cjs — déclenche la chaîne CI + déploiement après une
 * publication de données effectuée par un workflow GitHub Actions.
 *
 * POURQUOI CE SCRIPT EXISTE (cause racine de l'incident de fraîcheur) :
 *
 *   1. `data-refresh.yml` et `daily-copernicus.yml` publient les données
 *      Copernicus dans `main` via un push effectué avec le GITHUB_TOKEN.
 *   2. Or GitHub ne déclenche AUCUN workflow sur un push effectué avec le
 *      GITHUB_TOKEN. L'exception documentée ne concerne que `workflow_dispatch`
 *      et `repository_dispatch`.
 *      => Le push des données NE déclenche donc PAS `cloudflare-production.yml`.
 *   3. Le seul autre chemin (`workflow_run` sur « Daily Copernicus + Deploy »)
 *      n'a jamais produit un seul run (0 sur 162 exécutions du workflow de
 *      production) — et, surtout, il aurait de toute façon été refusé : la
 *      porte de certification exige les checks `test-frontend` et `perf` SUR LE
 *      SHA EXACT, or ces checks ne sont jamais produits pour un commit créé
 *      par GITHUB_TOKEN.
 *   4. Résultat mesuré : les 6 domaines servaient une donnée de 2068 min
 *      (seuil Sentinel : 900 min) alors que `main` contenait une donnée
 *      fraîche. Le commit de données était publié mais JAMAIS déployé.
 *
 * CE QUE FAIT CE SCRIPT :
 *   - dispatch `ci-tests.yml`   -> produit le check `test-frontend` sur le SHA
 *                                  exact qui sera déployé ;
 *   - dispatch `perf-budget.yml` -> produit le check `perf` sur ce même SHA ;
 *   - dispatch `cloudflare-production.yml` -> la porte de certification lit ces
 *                                  checks via l'API GitHub et n'autorise le
 *                                  déploiement que s'ils sont VERTS.
 *
 * CE QUE CE SCRIPT NE FAIT PAS :
 *   - il ne simule aucun résultat GitHub : il ne fait qu'INVOCER de vrais
 *     workflows, dont les check-runs sont produits par l'API GitHub ;
 *   - il ne contourne pas la porte : la porte reste fail-closed et exige
 *     toujours `test-frontend` + `perf` verts sur le SHA exact ;
 *   - il ne publie rien : la publication reste faite par le workflow appelant.
 *
 * L'ordre est important : les deux CI d'abord (la porte sait attendre, avec
 * `--wait-ms`, que les checks apparaissent et tournent au vert), le workflow de
 * production ensuite.
 *
 * Usage :
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo [DEPLOY_REF=main] \
 *     node scripts/automation/trigger-production-deploy.cjs [--dry-run]
 */
'use strict';

const https = require('https');

const API = 'https://api.github.com';

/** Workflows à déclencher, dans l'ordre. */
const CHAIN = [
  { file: 'ci-tests.yml', check: 'test-frontend' },
  { file: 'perf-budget.yml', check: 'perf' },
  { file: 'cloudflare-production.yml', check: null },
];

function env(name, fallback) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'factory-deploy-trigger',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer ' + token,
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = data.length;
    }
    const req = https.request(API + path, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, text });
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${method} ${path} :: ${text.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const repo = env('GITHUB_REPOSITORY');
  const token = env('GITHUB_TOKEN');
  const ref = env('DEPLOY_REF', 'main');

  if (!repo) {
    console.error('GITHUB_REPOSITORY absent : dépôt inconnu — déclenchement impossible (refus).');
    process.exit(1);
  }
  if (!token) {
    console.error('GITHUB_TOKEN absent : le dispatch exige un token avec la permission « actions: write » (refus).');
    process.exit(1);
  }

  // SHA exact de la ref qui sera déployée : c'est le SHA sur lequel la porte
  // de certification exigera `test-frontend` et `perf`.
  let sha = null;
  try {
    const r = await request('GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(ref)}`, token);
    const j = JSON.parse(r.text);
    sha = j && j.object ? j.object.sha : null;
  } catch (e) {
    console.error(`Lecture de la ref '${ref}' impossible : ${e.message}`);
    process.exit(1);
  }
  if (!sha) {
    console.error(`Ref '${ref}' introuvable dans ${repo} — déclenchement impossible (refus).`);
    process.exit(1);
  }

  console.log(`Déploiement ciblé : ${repo} @ ${ref} (sha ${sha.slice(0, 8)})`);
  if (dryRun) {
    for (const c of CHAIN) console.log(`  [dry-run] dispatch ${c.file} sur ${ref}`);
    console.log('DRY-RUN : aucune requête envoyée.');
    return;
  }

  const failures = [];
  for (const c of CHAIN) {
    try {
      await request('POST', `/repos/${repo}/actions/workflows/${c.file}/dispatches`, token, { ref });
      console.log(`  dispatch OK   ${c.file}${c.check ? '  (check attendu : ' + c.check + ')' : ''}`);
    } catch (e) {
      failures.push(`${c.file} : ${e.message}`);
      console.error(`  dispatch ECHEC ${c.file} : ${e.message}`);
    }
  }

  if (failures.length) {
    console.error('');
    console.error('Chaîne de déclenchement INCOMPLÈTE :');
    for (const f of failures) console.error('  - ' + f);
    console.error('');
    console.error('Les données sont publiées dans le dépôt mais ne seront PAS déployées :');
    console.error('la fraîcheur en production va se dégrader. Le contrôle de fraîcheur');
    console.error('du Sentinel doit alerter — c\'est le comportement attendu, pas un défaut.');
    process.exit(1);
  }

  console.log('');
  console.log('Chaîne déclenchée. La porte de certification exigera `test-frontend` et');
  console.log(`\`perf\` verts sur le SHA ${sha.slice(0, 8)} : aucun déploiement n'est`);
  console.log('autorisé sans ces preuves.');
}

main().catch((e) => {
  console.error('ERREUR : ' + (e && e.message ? e.message : e));
  process.exit(1);
});
