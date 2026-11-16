#!/usr/bin/env node
/**
 * verify-prospects.cjs — Vérification non destructive des prospects B2B.
 *
 * Vérifie l'existence des sites web des prospects enregistrés dans
 * .ai/prospects-qualified.json via des requêtes HTTP HEAD.
 *
 * NE MODIFIE AUCUNE DONNÉE CLIENT. Ne fait qu'enregistrer le statut
 * de vérification (accessible / inaccessible / erreur).
 *
 * Usage : node scripts/verify-prospects.cjs
 *         node scripts/verify-prospects.cjs --update  (met à jour le JSON)
 */

const fs = require('fs');
const path = require('path');

const PROSPECTS_FILE = path.join(__dirname, '..', '.ai', 'prospects-qualified.json');

async function checkUrl(url) {
  if (!url || url.includes('[NON VÉRIFIÉ]') || !url.startsWith('http')) {
    return { status: 'no_url', code: null, reachable: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SargassesPro/1.0; +https://sargasses-martinique.com)' },
    });
    clearTimeout(timeout);
    return { status: res.ok ? 'reachable' : 'error', code: res.status, reachable: res.ok };
  } catch (err) {
    return { status: 'unreachable', code: null, reachable: false, error: err.message };
  }
}

async function main() {
  const update = process.argv.includes('--update');
  const raw = fs.readFileSync(PROSPECTS_FILE, 'utf8');
  const data = JSON.parse(raw);

  console.log('=== Vérification des prospects B2B ===\n');
  console.log('Total prospects : ' + data.prospects.length);
  console.log('Mode : ' + (update ? 'MISE À JOUR' : 'LECTURE SEULE') + '\n');

  let reachable = 0;
  let unreachable = 0;
  let noUrl = 0;

  for (const p of data.prospects) {
    const result = await checkUrl(p.website);
    const icon = result.reachable ? '✅' : (result.status === 'no_url' ? '⚪' : '❌');
    console.log(icon + ' ' + p.id + ' ' + p.name + ' → ' + result.status + (result.code ? ' (HTTP ' + result.code + ')' : ''));

    if (result.reachable) reachable++;
    else if (result.status === 'no_url') noUrl++;
    else unreachable++;

    if (update) {
      p._verification = {
        checked_at: new Date().toISOString(),
        website_status: result.status,
        website_code: result.code,
        website_reachable: result.reachable,
      };
      if (result.reachable) {
        p.verified = true;
        p.status = 'verified';
        p.next_action = 'Évaluer potentiel commercial + personnaliser proposition';
        p.next_action_date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      }
    }
  }

  console.log('\n--- Résumé ---');
  console.log('Accessibles : ' + reachable);
  console.log('Inaccessibles : ' + unreachable);
  console.log('Sans URL : ' + noUrl);

  if (update) {
    data.updated = new Date().toISOString().slice(0, 10);
    data.summary.verified = reachable;
    fs.writeFileSync(PROSPECTS_FILE, JSON.stringify(data, null, 2));
    console.log('\nFichier mis à jour : ' + PROSPECTS_FILE);
  } else {
    console.log('\nPour mettre à jour le fichier : node scripts/verify-prospects.cjs --update');
  }
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});