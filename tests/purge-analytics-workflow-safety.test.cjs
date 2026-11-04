#!/usr/bin/env node
/**
 * purge-analytics-workflow-safety.test.cjs — P0.67 §4 : la purge
 * analytics_events ne doit plus s'exécuter en destructeur sur simple cron.
 *
 * DÉFAUT D'ORIGINE : `daily-copernicus.yml` lançait
 * `node scripts/automation/purge-analytics.cjs` sur chaque déclenchement
 * `schedule`, et le script supprimait par défaut (`--dry` nécessaire pour
 * s'en abstenir). Un cron anonyme pouvait donc, sans intention humaine,
 * supprimer définitivement des lignes de production.
 *
 * Ce test verrouille les DEUX moitiés du correctif :
 *   1. le script refuse de supprimer sans `--execute --approved-by=...`
 *      (verrouillé aussi dans tests/purge-analytics.test.cjs) ;
 *   2. aucun workflow GitHub ne possède de chemin de suppression : le cron
 *      reste en dry-run et workflow_dispatch ne lance pas le script de purge.
 *
 * Un correctif à moitié (script durci, workflow inchangé) ne sert à rien :
 * sans ce test, rétablir l'ancien appel dans le workflow suffirait à
 * réintroduire la suppression automatique.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml');
const MOD = path.join(ROOT, 'scripts', 'automation', 'purge-analytics.cjs');

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

/** Étapes `run` du workflow, avec leur bloc `if:` associé. */
function stepsOf(workflow) {
  const out = [];
  const rows = workflow.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const m = /^\s*- name:\s*(.+?)\s*$/.exec(rows[i]);
    if (!m) continue;
    const step = { name: m[1], if: null, run: '', start: i };
    for (let j = i + 1; j < rows.length; j++) {
      const row = rows[j];
      if (/^\s*- name:/.test(row)) break;
      const ifm = /^\s*if:\s*(.+?)\s*$/.exec(row);
      if (ifm) step.if = ifm[1];
      const runm = /^\s*run:\s*(.+?)\s*$/.exec(row);
      if (runm) step.run += (step.run ? ' ' : '') + runm[1];
      // Bloc `run: |` — les lignes suivantes appartiennent au script.
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
  const raw = fs.readFileSync(WF, 'utf8');
  const normalised = raw.replace(/\r\n/g, '\n');
  const steps = stepsOf(normalised);
  const purgeSteps = steps.filter((s) => /purge/i.test(s.name) && /purge-analytics\.cjs/.test(s.run));

  record('daily-copernicus : étapes de purge analytics_events présentes',
    purgeSteps.length >= 1, `trouvées=${purgeSteps.length}`);

  const cronSteps = purgeSteps.filter((s) => /schedule/.test(s.if || ''));
  const manualSteps = purgeSteps.filter((s) => /workflow_dispatch/.test(s.if || ''));

  // ── 1. Le chemin cron n'émet RIEN de destructeur ────────────────────────
  record('chemin cron : une étape de purge dry-run existe', cronSteps.length === 1,
    `trouvées=${cronSteps.length}`);
  for (const step of cronSteps) {
    record('chemin cron : aucun --execute émis',
      !/--execute/.test(step.run), step.run.trim());
    record('chemin cron : aucun --approved-by émis',
      !/--approved-by/.test(step.run), step.run.trim());
    record('chemin cron : appel du script sans argument destructeur',
      /node scripts\/automation\/purge-analytics\.cjs\s*$/.test(step.run.trim()),
      step.run.trim());
  }

  // ── 2. Aucun chemin manuel de suppression n'est exposé ──────────────────
  record('aucun chemin workflow_dispatch ne lance la purge', manualSteps.length === 0,
    `trouvées=${manualSteps.length}`);
  const purgeCommandText = purgeSteps.map((step) => step.run).join('\\n');
  record('aucune étape de purge ne passe --execute', !/--execute/.test(purgeCommandText));
  record('aucune étape de purge ne passe --approved-by', !/--approved-by=/.test(purgeCommandText));

  // ── 3. workflow_dispatch ne fournit aucun input de purge ─────────────────
  {
    const m = /^  workflow_dispatch:\s*\r?\n([\s\S]*?)(?=^  \S)/m.exec(normalised);
    const dispatchBlock = m ? m[1] || '' : '';
    record('workflow_dispatch reste disponible', !!m);
    record('workflow_dispatch ne contient aucun input de purge',
      !/purge_analytics/.test(dispatchBlock));
    record('workflow_dispatch ne déclare aucun bloc inputs',
      !/^    inputs:/m.test(dispatchBlock));
  }

  // ── 4. Aucun autre appel du script dans les workflows ──────────────────
  {
    const wfDir = path.join(ROOT, '.github', 'workflows');
    const others = [];
    for (const file of fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
      if (file === 'daily-copernicus.yml') continue;
      const text = fs.readFileSync(path.join(wfDir, file), 'utf8');
      if (/purge-analytics\.cjs/.test(text)) others.push(file);
    }
    record('aucun autre workflow n appelle le script de purge',
      others.length === 0, others.join(', '));
  }

  // ── 5. Le script derrière le workflow reste fail-closed ────────────────
  {
    const mod = require(MOD);
    record('script : refus sans --execute',
      typeof mod.authorizationRefusal(mod.resolveOptions([])) === 'string');
    record('script : refus avec --execute sans approved-by',
      typeof mod.authorizationRefusal(mod.resolveOptions(['--execute'])) === 'string');
    record('script : autorisé avec --execute + approved-by',
      mod.authorizationRefusal(mod.resolveOptions(['--execute', '--approved-by=github:someone'])) === null);
  }

  console.log(failures === 0
    ? '\nPURGE_WORKFLOW_SAFETY_TESTS PASS'
    : `\nPURGE_WORKFLOW_SAFETY_TESTS FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error('ERREUR FATALE :', e && e.stack ? e.stack : e);
  process.exit(1);
}
