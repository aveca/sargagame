/**
 * Garde-fou e-mail : aucune automatisation PLANIFIÉE ne doit dépendre d'IMAP
 * ni prétendre envoyer des e-mails hors du canal SMTP sortant existant.
 *
 * Contexte (mission fiabilisation, 2026-10-14) :
 * - support-inbox.yml (IMAP, cron 3h, envoi réel) a été supprimé (PR #928).
 * - Architecture e-mail autorisée : SMTP sortant de la boîte du domaine
 *   (cPanel, secrets existants) pour les flux clients, et outils manuels
 *   (workflow_dispatch) pour les relances ponctuelles.
 * - IMAP entrant planifié = dépendance non autorisée (boîte tierce, échecs
 *   silencieux, aucun remplacement sortant disponible).
 *
 * Ce test échoue si :
 *   1. un workflow avec un déclencheur `schedule:` référence IMAP ;
 *   2. un workflow planifié ou push déclenche un envoi SMTP sans mode
 *      dry-run explicite dans le même job (variable SEND/DRY_RUN/`--send`
 *      conditionnée, ou script documenté dry-run par défaut).
 * Les outils 100 % manuels (workflow_dispatch) restent autorisés.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', '.github', 'workflows');
const REPO_ROOT = path.join(__dirname, '..', '..');

function listWorkflows() {
  return fs.readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/i.test(f));
}

function hasScheduleTrigger(content) {
  // Déclencheur schedule = clé `schedule:` au niveau racine (on: / on\n  schedule:)
  return /^\s*schedule\s*:\s*$/m.test(content) || /^on\s*:\s*\n\s{2}schedule\s*:/m.test(content);
}

function hasPushOrCronAutomation(content) {
  return hasScheduleTrigger(content) || /^\s*push\s*:\s*$/m.test(content);
}

function referencesImap(content) {
  return /\bimap\b|IMAP_PASS|imaplib|ImapFlow/i.test(content);
}

function hasExplicitDryRunGate(content) {
  // Le job doit conditionner l'envoi : variable SEND/DRY_RUN/DISPATCH ou flag --send
  // référencé dans une condition, ou script documenté dry-run par défaut.
  return /\bSEND\b|DRY_RUN|--send|dry-run|mode ==/i.test(content);
}

function invokedScripts(content) {
  // Scripts .cjs invoqués par les steps du workflow.
  const re = /node\s+(scripts\/[\w\-/.]+\.cjs)/g;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

function smtpStepsUnGated(repoRoot, content) {
  // Découpe en steps (éléments de liste YAML) et vérifie que chaque step
  // référençant SMTP_PASS n'invoque que des scripts self-gatés.
  const steps = content.split(/^\s{6,8}-\s/m).slice(1);
  const bad = [];
  for (const step of steps) {
    if (!/SMTP_PASS/i.test(step)) continue;
    const scripts = invokedScripts(step);
    const gated = scripts.every((s) => scriptSelfGated(repoRoot, s));
    if (!gated) {
      bad.push(scripts.join(', ') || '(smtp sans script identifié)');
    }
  }
  return bad;
}

function scriptSelfGated(repoRoot, rel) {
  // Le script appelé gère lui-même la porte d'envoi (mailReady / DRY_RUN / --send).
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) return false;
  const src = fs.readFileSync(p, 'utf-8');
  return /mailReady\(\)|DRY_RUN|dry-run|--send|SMTP_PASS (?:absent|manquant)[^\n]*skip/i.test(src);
}

function run() {
  const violations = [];
  const files = listWorkflows();

  for (const file of files) {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');

    // Règle 1 : zéro IMAP dans les automatisations planifiées.
    if (hasScheduleTrigger(content) && referencesImap(content)) {
      violations.push(`${file}: déclencheur schedule + dépendance IMAP interdite (support-inbox supprimé en #928)`);
    }

    // Règle 2 : automatisation planifiée/push qui invoque SMTP sans porte d'envoi.
    // Porte acceptée : gate explicite dans le workflow OU self-gating du script appelé
    // (mailReady() + skip silencieux), motif établi par scripts/automation/lib/email-send.cjs.
    if (hasPushOrCronAutomation(content) && /SMTP_PASS/i.test(content)) {
      const wfGated = hasExplicitDryRunGate(content);
      const bad = wfGated ? [] : smtpStepsUnGated(REPO_ROOT, content);
      if (bad.length) {
        violations.push(`${file}: SMTP planifié sans gate SEND/DRY_RUN ni self-gating des scripts (risque d'envoi non maîtrisé) : ${bad.join(' | ')}`);
      }
    }
  }

  // Règle 3 : le workflow supprimé ne doit pas revenir.
  const removed = ['support-inbox.yml'];
  for (const f of removed) {
    if (files.includes(f)) {
      violations.push(`${f}: workflow IMAP supprimé en #928 — ne pas réintroduire sans décision produit`);
    }
  }

  return { files, violations };
}

if (require.main === module) {
  const { files, violations } = run();
  console.log(`Workflows analysés : ${files.length}`);
  if (violations.length) {
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error(`\nÉCHEC : ${violations.length} violation(s) de la politique e-mail.`);
    process.exit(1);
  }
  console.log('  ✓ aucune automatisation planifiée IMAP ; envois SMTP gated');
  console.log('\nPASS : politique e-mail respectée.');
}

module.exports = { run, hasScheduleTrigger, referencesImap, hasExplicitDryRunGate };
