#!/usr/bin/env node
/**
 * ux-hypothesis.cjs — UX/AHA/WOW HYPOTHESIS FRAMEWORK
 *
 * Avant toute modification UI, formuler une hypothèse structurée :
 *
 * UX HYPOTHESIS:
 *   Problème observé (données)
 * AHA:
 *   Ce que l'utilisateur doit comprendre immédiatement
 * WOW:
 *   Ce qui rend l'expérience mémorable/évidente
 * ACTION:
 *   L'action souhaitée post-AHA
 * METRIC:
 *   Comment mesurer le succès
 * EVIDENCE:
 *   Données qui soutiennent l'hypothèse
 * RISK:
 *   Risques identifiés
 * ROLLBACK:
 *   Plan de retour
 */

'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./lib/common.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] UX-HYP    ${msg}`);
  else console.log(`[UX-HYP] ${msg}`);
}

const HYPOTHESIS_DIR = path.join(C.paths.observations, 'ux-hypotheses');

/**
 * Structure d'une hypothèse UX
 */
class UXHypothesis {
  constructor(data = {}) {
    this.id = data.id || 'HYP-' + Date.now().toString(36);
    this.timestamp = data.timestamp || new Date().toISOString();
    this.title = data.title || '';
    this.problem = data.problem || '';           // Problème observé (avec données)
    this.aha = data.aha || '';                   // Ce que l'utilisateur doit comprendre
    this.wow = data.wow || '';                   // Ce qui rend l'expérience mémorable
    this.action = data.action || '';             // Action souhaitée
    this.metric = data.metric || '';             // Métrique de succès
    this.evidence = data.evidence || '';         // Données supportant l'hypothèse
    this.risk = data.risk || '';                 // Risques
    this.rollback = data.rollback || 'revert du commit';
    this.scope = data.scope || { files: [] };
    this.status = data.status || 'proposed';     // proposed | validated | implemented | rejected
    this.implementation = data.implementation || null;
    this.results = data.results || null;
  }

  toMarkdown() {
    return `# ${this.id} — ${this.title}

**Timestamp:** ${this.timestamp}
**Status:** ${this.status}

## Problème (données)
${this.problem}

## AHA (compréhension immédiate)
${this.aha}

## WOW (mémorable/évident)
${this.wow}

## Action souhaitée
${this.action}

## Métrique de succès
${this.metric}

## Preuves (données)
${this.evidence}

## Risques
${this.risk}

## Rollback
${this.rollback}

## Scope (fichiers)
${(this.scope?.files || []).join(', ') || 'à définir'}

---
_Généré par l'autopilot le ${this.timestamp}_
`;
  }

  save() {
    fs.mkdirSync(HYPOTHESIS_DIR, { recursive: true });
    const file = path.join(HYPOTHESIS_DIR, `${this.id}.md`);
    fs.writeFileSync(file, this.toMarkdown(), 'utf8');
    return file;
  }

  static load(id) {
    const file = path.join(HYPOTHESIS_DIR, `${id}.md`);
    if (!fs.existsSync(file)) return null;
    // Parse markdown back to object (simplified)
    return { id, file };
  }

  static list() {
    try {
      return fs.readdirSync(HYPOTHESIS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''))
        .sort()
        .reverse();
    } catch (_) { return []; }
  }
}

/**
 * Génère une hypothèse à partir d'une opportunité découverte
 */
function hypothesisFromOpportunity(opp) {
  const hypothesis = new UXHypothesis({
    title: opp.title,
    problem: `Observation: ${opp.evidence}\nSource: ${opp.source}\nSévérité: ${opp.severity}`,
    aha: opp.expectedImpact || 'À définir selon l\'opportunité',
    wow: 'Rendre le changement visuellement évident et mémorable',
    action: opp.metric || 'À définir',
    metric: opp.metric || 'À définir (ex: alternative_click / verdict_view)',
    evidence: `Type: ${opp.type}\nRégion: ${opp.region}\nRoute: ${opp.route}\nConfiance: ${opp.confidence}`,
    risk: opp.blocked || 'Aucun risque identifié (scope respecté, denylist OK)',
    rollback: opp.rollback || 'revert du commit',
    scope: opp.scope,
  });
  return hypothesis;
}

/**
 * Valide une hypothèse avant implémentation
 */
function validateHypothesis(hyp) {
  const errors = [];
  if (!hyp.problem || hyp.problem.length < 20) errors.push('Problème insuffisamment documenté (min 20 chars)');
  if (!hyp.aha || hyp.aha.length < 20) errors.push('AHA insuffisamment défini');
  if (!hyp.metric || hyp.metric.length < 10) errors.push('Métrique de succès manquante');
  if (!hyp.evidence || hyp.evidence.length < 20) errors.push('Preuves insuffisantes');
  if (!hyp.scope || !hyp.scope.files || hyp.scope.files.length === 0) errors.push('Scope fichiers manquant');

  return { valid: errors.length === 0, errors };
}

/**
 * Enregistre les résultats post-implémentation
 */
function recordResults(hypId, results) {
  const file = path.join(HYPOTHESIS_DIR, `${hypId}.md`);
  if (!fs.existsSync(file)) return false;

  let content = fs.readFileSync(file, 'utf8');
  const resultsMd = `
## Résultats (${new Date().toISOString()})
${JSON.stringify(results, null, 2)}
`;
  content = content.replace(/---[\s\S]*$/, resultsMd + '\n---');
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

module.exports = {
  UXHypothesis,
  hypothesisFromOpportunity,
  validateHypothesis,
  recordResults,
  HYPOTHESIS_DIR,
};