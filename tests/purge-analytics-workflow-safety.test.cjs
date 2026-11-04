#!/usr/bin/env node
/**
 * purge-analytics-workflow-safety.test.cjs — contrat global de lecture seule.
 *
 * Verrouille le workflow planifié ET le script réellement appelé :
 * aucun workflow ne peut lancer une suppression et le script ne contient
 * plus de chemin d'écriture, même avec les anciens arguments CLI.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml');
const MOD = path.join(ROOT, 'scripts', 'automation', 'purge-analytics.cjs');

let failures = 0;
function record(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failures++;
}

/* Étapes run du workflow, avec leur bloc if associé. */
function stepsOf(workflow) {
  const out = [];
  const rows = workflow.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const match = /^\s*- name:\s*(.+?)\s*$/.exec(rows[i]);
    if (!match) continue;
    const step = { name: match[1], if: null, run: '' };
    for (let j = i + 1; j < rows.length; j++) {
      const row = rows[j];
      if (/^\s*- name:/.test(row)) break;
      const ifMatch = /^\s*if:\s*(.+?)\s*$/.exec(row);
      if (ifMatch) step.if = ifMatch[1];
      const runMatch = /^\s*run:\s*(.+?)\s*$/.exec(row);
      if (runMatch) step.run += (step.run ? ' ' : '') + runMatch[1];
      if (/^\s*run:\s*\|/.test(row)) {
        for (let k = j + 1; k < rows.length; k++) {
          if (/^\s*\S/.test(rows[k]) && !/^\s{8,}/.test(rows[k])) break;
          if (/^\s*run:/.test(rows[k])) continue;
          step.run += ' ' + rows[k].trim();
          j = k;
        }
      }
    }
    out.push(step);
  }
  return out;
}

function main() {
  const workflow = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const steps = stepsOf(workflow);
  const purgeSteps = steps.filter((step) =>
    /purge/i.test(step.name) && /purge-analytics\.cjs/.test(step.run));

  record('daily-copernicus : une seule étape de comptage analytics', purgeSteps.length === 1,
    'trouvées=' + purgeSteps.length);

  const cronSteps = purgeSteps.filter((step) => /schedule/.test(step.if || ''));
  const manualSteps = purgeSteps.filter((step) => /workflow_dispatch/.test(step.if || ''));

  record('cron : une étape de comptage existe', cronSteps.length === 1);
  for (const step of cronSteps) {
    record('cron : aucun argument destructeur', !/--execute|--approved-by/.test(step.run), step.run.trim());
    record('cron : appel simple du script',
      /node scripts\/automation\/purge-analytics\.cjs\s*$/.test(step.run.trim()), step.run.trim());
  }

  record('workflow_dispatch : aucune étape de purge', manualSteps.length === 0);
  const purgeCommands = purgeSteps.map((step) => step.run).join('\n');
  record('aucun workflow path ne passe --execute', !/--execute/.test(purgeCommands));
  record('aucun workflow path ne passe --approved-by', !/--approved-by/.test(purgeCommands));

  /* workflow_dispatch reste disponible pour les autres tâches, sans input de purge. */
  {
    const match = /^  workflow_dispatch:\s*\n([\s\S]*?)(?=^  \S)/m.exec(workflow);
    const block = match ? match[1] || '' : '';
    record('workflow_dispatch reste disponible', !!match);
    record('workflow_dispatch ne contient aucun input de purge', !/purge_analytics/i.test(block));
    record('workflow_dispatch ne déclare aucun bloc inputs', !/^    inputs:/m.test(block));
  }

  /* Aucun autre workflow ne doit appeler le script. */
  {
    const workflowDir = path.join(ROOT, '.github', 'workflows');
    const otherCallers = [];
    for (const file of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
      if (file === 'daily-copernicus.yml') continue;
      const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
      if (/purge-analytics\.cjs/.test(source)) otherCallers.push(file);
    }
    record('aucun autre workflow n appelle le script', otherCallers.length === 0, otherCallers.join(', '));
  }

  /* Le script lui-même ne doit contenir aucun chemin d'écriture. */
  {
    const source = fs.readFileSync(MOD, 'utf8');
    const mod = require(MOD);
    record('script : aucune méthode HTTP d écriture',
      !/method\s*:\s*['"](?:DELETE|POST|PUT|PATCH)['"]/.test(source));
    record('script : aucune fonction de suppression par lot',
      !/function\s+purgeInBatches\b/.test(source));
    record('script : aucun helper de suppression exporté',
      !/purgeInBatches|deletedIds|authorizationRefusal/.test(source));
    record('script : anciens flags CLI ignorés',
      !Object.prototype.hasOwnProperty.call(mod.resolveOptions(['--execute', '--approved-by=github:someone']), 'execute'));
    record('script : mode lecture seule annoncé', /lecture seule forcée/.test(source));
  }

  console.log(failures === 0
    ? '\nPURGE_WORKFLOW_SAFETY_TESTS PASS'
    : '\nPURGE_WORKFLOW_SAFETY_TESTS FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error('ERREUR FATALE :', error && error.stack ? error.stack : error);
  process.exit(1);
}
