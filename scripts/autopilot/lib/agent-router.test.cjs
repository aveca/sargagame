#!/usr/bin/env node
/**
 * agent-router.test.cjs — contrat du ROUTEUR d'agent.
 *
 * Pourquoi ce test existe (et pourquoi il n'est PAS un test de bout en bout) :
 *
 *   Le routeur ne retient que les agents RÉELLEMENT INSTALLÉS sur la machine.
 *   Un binaire `opencode` est présent sur le PC du fondateur et ABSENT sur un
 *   runner CI : toute assertion du type « un agent a été retenu » est donc
 *   NON DÉTERMINISTE (elle passait en local et échouait en CI — run
 *   42651059357, « FAIL agent routé décidé »).
 *
 *   Ce test fixe donc les invariants qui, eux, sont VRAIS sur toute machine :
 *
 *   1. un agent retenu est forcément EXÉCUTABLE en non-interactif ;
 *   2. le profil Factory est choisi par TYPE de mission, de façon stable ;
 *   3. la décision porte TOUJOURS une raison (traçabilité, jamais de faux
 *      succès) ;
 *   4. l'absence d'agent n'empêche PAS l'import d'une mission (une mission
 *      est une donnée : elle reste en file, elle n'est pas perdue).
 *
 * Hors-ligne, sans réseau, sans exécution d'agent.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

const router = require('./agent-router.cjs');

// ── 1. Configuration de routage contrôlée (indépendante de la machine) ──────
//
// Le routeur lit, dans cet ordre : $SARGA_AGENT_ROUTING, puis le dépôt,
// puis l'installation Factory locale (`C:\factory-service\...`, présente
// seulement sur le PC du fondateur). On force une configuration CONNUE pour
// que le mapping type → profil soit vérifiable partout.

const routingFile = path.join(os.tmpdir(), 'autopilot-routing-test-' + process.pid + '.json');
const ROUTING = {
  DEFAULT: { preferredAgent: 'opencode', fallbackAgents: ['ollama'], preferredModel: 'qwen3-coder:30b', fallbackModels: [], timeout: 1000, maxRetries: 1 },
  SIMPLE_FIX: { preferredAgent: 'aider', fallbackAgents: ['opencode'], preferredModel: '', fallbackModels: [], timeout: 1000, maxRetries: 1 },
  DEBUG_COMPLEX: { preferredAgent: 'hermes', fallbackAgents: ['opencode'], preferredModel: '', fallbackModels: [], timeout: 2000, maxRetries: 2 },
  REPO_EXPLORATION: { preferredAgent: 'opencode', fallbackAgents: ['ollama'], preferredModel: '', fallbackModels: [], timeout: 1000, maxRetries: 1 },
  TEST_WRITING: { preferredAgent: 'aider', fallbackAgents: ['opencode'], preferredModel: '', fallbackModels: [], timeout: 1000, maxRetries: 1 },
  ARCHITECTURE: { preferredAgent: 'opencode', fallbackAgents: ['hermes'], preferredModel: '', fallbackModels: [], timeout: 1000, maxRetries: 1 },
  PRODUCT_QUALITY_ENGINEER: { preferredAgent: 'opencode', fallbackAgents: ['ollama'], preferredModel: '', fallbackModels: [], timeout: 1000, maxRetries: 1 },
};
fs.writeFileSync(routingFile, JSON.stringify(ROUTING, null, 2), 'utf8');
const previousRouting = process.env.SARGA_AGENT_ROUTING;
process.env.SARGA_AGENT_ROUTING = routingFile;
router.loadRouting(true);

console.log('=== 1. profil Factory choisi par type de mission ===');
{
  check('source de routage = fichier injecté', router.loadRouting().file === routingFile, router.loadRouting().file);
  check('type ux → PRODUCT_QUALITY_ENGINEER', router.profileFor('ux redesign', '') === 'PRODUCT_QUALITY_ENGINEER', router.profileFor('ux redesign', ''));
  check('type test → TEST_WRITING', router.profileFor('write tests', '') === 'TEST_WRITING', router.profileFor('write tests', ''));
  check('type audit → REPO_EXPLORATION', router.profileFor('audit exploration', '') === 'REPO_EXPLORATION', router.profileFor('audit exploration', ''));
  check('type architecture → ARCHITECTURE', router.profileFor('architecture migration-plan', '') === 'ARCHITECTURE', router.profileFor('architecture migration-plan', ''));
  check('type debug → DEBUG_COMPLEX', router.profileFor('debug crash regression', '') === 'DEBUG_COMPLEX', router.profileFor('debug crash regression', ''));
  check('type fix/doc → SIMPLE_FIX', router.profileFor('fix typo readme', '') === 'SIMPLE_FIX', router.profileFor('fix typo readme', ''));
  check('type inconnu → DEFAULT', router.profileFor('zzz', '') === 'DEFAULT', router.profileFor('zzz', ''));
  check('priorité critical → DEBUG_COMPLEX', router.profileFor('', 'critical') === 'DEBUG_COMPLEX', router.profileFor('', 'critical'));
  // L'ordre de TYPE_TO_PROFILE prime : « ux fix » doit aller en UX, pas en FIX.
  check('ordre des motifs respecté (ux avant fix)', router.profileFor('ux fix', '') === 'PRODUCT_QUALITY_ENGINEER', router.profileFor('ux fix', ''));
}

console.log('=== 2. invariant de preuve : l\'agent retenu est TOUJOURS exécutable ===');
{
  // Le risque produit : annoncer sur l'issue « agent lancé : hermes » alors
  // que c'est OpenCode qui a travaillé. Le routeur ne retient donc que les
  // agents câblés en non-interactif.
  check('EXECUTABLE_AGENTS = { opencode } seul',
    router.EXECUTABLE_AGENTS.size === 1 && router.EXECUTABLE_AGENTS.has('opencode'),
    Array.from(router.EXECUTABLE_AGENTS).join(','));
  check('hermes n\'est PAS exécutable en non-interactif', !router.EXECUTABLE_AGENTS.has('hermes'));
  check('aider n\'est PAS exécutable en non-interactif', !router.EXECUTABLE_AGENTS.has('aider'));

  const decision = router.route({ type: 'debug crash', priority: 'critical' });
  check('la décision porte TOUJOURS un profil', !!decision.profile, JSON.stringify(decision.profile));
  check('la décision porte TOUJOURS une raison', !!decision.reason && decision.reason.length > 0, JSON.stringify(decision.reason));
  check('la décision porte la liste des candidats', Array.isArray(decision.candidates) && decision.candidates.length > 0);
  if (decision.ok) {
    check('agent retenu ∈ EXECUTABLE_AGENTS', router.EXECUTABLE_AGENTS.has(decision.agent), decision.agent);
    check('moteur réel = agent retenu', decision.engine === decision.agent, String(decision.engine));
    check('agent déclaré par le profil conservé', !!decision.declaredAgent, String(decision.declaredAgent));
    if (decision.declaredAgent !== decision.agent) {
      check('l\'écart avec le profil est EXPLICITÉ dans la raison', /retenu/.test(decision.reason), decision.reason);
    }
  } else {
    check('absence d\'agent → raison explicite', /agent/i.test(decision.reason), decision.reason);
    check('absence d\'agent → agent null (aucune fausse preuve)', decision.agent === null);
  }
}

console.log('=== 3. la décision est STABLE (deux appels identiques) ===');
{
  const a = router.route({ type: 'ux redesign' });
  const b = router.route({ type: 'ux redesign' });
  check('même profil', a.profile === b.profile);
  check('même agent retenu', a.agent === b.agent);
  check('même raison', a.reason === b.reason);
}

console.log('=== 4. aucune fuite de secret dans la décision ===');
{
  const decision = router.route({ type: 'fix typo' });
  const SECRET = /sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  check('aucun secret dans la raison', !SECRET.test(decision.reason || ''), decision.reason);
  check('aucun secret dans les candidats', !SECRET.test(JSON.stringify(decision.candidates || [])));
}

// ── Nettoyage ───────────────────────────────────────────────────────────────
if (previousRouting === undefined) delete process.env.SARGA_AGENT_ROUTING;
else process.env.SARGA_AGENT_ROUTING = previousRouting;
router.loadRouting(true);
try { fs.rmSync(routingFile, { force: true }); } catch (_) {}

console.log(failures === 0
  ? 'AGENT-ROUTER TESTS : OK (0 échec)'
  : `AGENT-ROUTER TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
