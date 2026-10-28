#!/usr/bin/env node
/**
 * deploy-trigger-contract.test.cjs — contrat de la chaîne « publication des
 * données → CI → déploiement ».
 *
 * Régression du premier essai en CI (run 39406923824) : le step « Déclenche
 * la chaîne CI + déploiement » a ÉCHOUÉ parce que `GITHUB_TOKEN` n'était pas
 * transmis au script. Rappel : `GITHUB_TOKEN` n'est PAS une variable
 * d'environnement par défaut dans GitHub Actions — sans
 * `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, l'API dispatch est refusée et
 * les données publiées ne sont jamais déployées.
 *
 * Ce test verrouille :
 *   1. les deux workflows qui publient les données passent bien le token ;
 *   2. le déclenchement du déploiement est conditionné à `main` (une
 *      publication sur une branche de développement ne déploie jamais) ;
 *   3. les permissions `actions: write` sont déclarées ;
 *   4. les trois workflows de la chaîne acceptent `workflow_dispatch` ;
 *   5. la porte de certification reste fail-closed (checks requis intacts).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows');

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const read = (f) => fs.readFileSync(path.join(WF, f), 'utf8');

// ── 1-3. Les deux workflows de publication ─────────────────────────────────
for (const file of ['data-refresh.yml', 'daily-copernicus.yml']) {
  const t = read(file);
  // Ancrage sur la LIGNE DE STEP (`- name: ...`), pas sur le commentaire
  // qui précède (il contient le même libellé).
  const stepIdx = t.search(/^[ \t]*- name:\s*Déclenche la chaîne CI \+ déploiement\s*$/m);
  record(`${file} : step de dispatch présent`, stepIdx > 0);
  if (stepIdx <= 0) continue;

  const block = t.slice(stepIdx, stepIdx + 900);
  record(`${file} : GITHUB_TOKEN transmis au step`,
    /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(block),
    'sans ce token, l\'API dispatch renvoie 403 et rien n\'est déployé');
  record(`${file} : GITHUB_REPOSITORY transmis au step`,
    /GITHUB_REPOSITORY:\s*\$\{\{\s*github\.repository\s*\}\}/.test(block));
  record(`${file} : dispatch conditionné à la publication vérifiée, au fetch ERDDAP réussi et à main`,
    /if:\s*steps\.publish\.outcome\s*==\s*'success'\s*&&\s*steps\.publish\.outputs\.branch\s*==\s*'main'\s*&&\s*steps\.verify\.outcome\s*==\s*'success'\s*&&\s*steps\.erddap\.outcome\s*==\s*'success'/.test(block));
  record(`${file} : permissions actions: write déclarées`,
    /^\s*actions:\s*write\s*$/m.test(t));
}

// ── 4. Les trois workflows de la chaîne acceptent workflow_dispatch ───────
for (const file of ['ci-tests.yml', 'perf-budget.yml', 'cloudflare-production.yml']) {
  const t = read(file);
  const onBlock = t.slice(t.indexOf('\non:'), t.indexOf('\npermissions:'));
  record(`${file} : déclencheur workflow_dispatch présent`,
    /^\s*workflow_dispatch:\s*$/m.test(onBlock));
}

// ── 5. La porte de certification reste fail-closed ────────────────────────
{
  const t = read('cloudflare-production.yml');
  record('cloudflare-production.yml : la porte exige toujours test-frontend + perf',
    /--mode deploy/.test(t) && /needs\.scope\.outputs\.production\s*==\s*'true'/.test(t));
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'CHECK_certification_status.cjs'), 'utf8');
  record('CHECK_certification_status.cjs : checks requis inchangés',
    /PREDEPLOY_REQUIRED_CHECKS\s*=\s*\['test-frontend',\s*'perf'\]/.test(script));
}

console.log(failures === 0
  ? '\nDEPLOY_TRIGGER_CONTRACT_TESTS PASS'
  : `\nDEPLOY_TRIGGER_CONTRACT_TESTS FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
