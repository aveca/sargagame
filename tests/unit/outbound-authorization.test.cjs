#!/usr/bin/env node
/**
 * outbound-authorization.test.cjs — contrat central d'autorisation sortante.
 * Mission P0.23 / #1157 (issue #1156 review de la PR #1200).
 *
 * Principe vérifié : TOUTE action sortante ou destructive est DRY-RUN par défaut
 * et n'est autorisée en production QUE si les quatre preuves sont réunies :
 *   1. déclencheur = workflow_dispatch (jamais schedule/push/PR/workflow_run/inconnu)
 *   2. pas de DRY_RUN explicite
 *   3. jeton d'approbation d'Environment protégé, bien formé
 *   4. Environment réellement protégé, vérifié en LECTURE SEULE via l'API GitHub
 * Une preuve manquée ou non vérifiable => l'opération reste DÉSACTIVÉE.
 *
 * Aucun appel réseau réel : `fetch` est injecté. Aucun secret, aucun Environment
 * n'est créé ou modifié par ce test.
 */
'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const central = require(path.join(ROOT, 'scripts', 'lib', 'outbound-authorization.cjs'));
const safety = require(path.join(ROOT, 'scripts', 'automation', 'lib', 'safety.cjs'));

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// ── Jeux d'environnements ────────────────────────────────────────────────────
const VALID_TOKEN = 'sgappr_' + 'a1b2c3d4e5f6g7h8i9j0'; // forme conforme
const PROTECTED = { exists: true, reviewers: 1, protectionRules: 1 };

/** Environnement « tout est réuni » sauf ce que le test surcharge. */
function env(overrides) {
  return Object.assign({
    GITHUB_EVENT_NAME: 'workflow_dispatch',
  }, overrides || {});
}

async function main() {
  // P1 — Environnement vide : rien d'autorisé (le défaut EST la simulation).
  {
    const d = central.authorizeAction('email_send', { env: {} });
    record('P1  env vide => jamais d\'exécution réelle',
      d.execute === false && d.mode === 'dry-run', `mode=${d.mode} reason=${d.reason}`);
  }

  // P2 — Déclencheur absent = 'unknown' = refus (fail-closed, jamais deviné).
  {
    const d = central.authorizeAction('external_write', {
      env: env({ GITHUB_EVENT_NAME: undefined }), requested: true,
    });
    record('P2  déclencheur inconnu => refus (pas de fail-open)',
      d.execute === false && /unknown/.test(d.reason), `reason=${d.reason}`);
  }

  // P3 — DRY_RUN explicite gagne TOUJOURS, même avec les 4 preuves réunies.
  {
    const d = central.authorizeAction('email_send', {
      env: env({ DRY_RUN: '1', OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }),
      requested: true, environmentProtection: PROTECTED,
    });
    record('P3  DRY_RUN=1 bat toutes les autres preuves',
      d.execute === false && d.mode === 'dry-run', `reason=${d.reason}`);
  }

  // P4 — DRY_RUN=0 n'est PAS une autorisation : seul, il n'ouvre rien.
  {
    const sansRien = central.authorizeAction('email_send', {
      env: env({ DRY_RUN: '0' }), requested: true,
    });
    record('P4a DRY_RUN=0 seul => toujours refus',
      sansRien.execute === false && sansRien.mode === 'blocked',
      `mode=${sansRien.mode} reason=${sansRien.reason}`);
    const toutReuni = central.authorizeAction('email_send', {
      env: env({ DRY_RUN: '0', OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }),
      requested: true, environmentProtection: PROTECTED,
    });
    record('P4b DRY_RUN=0 + 4 preuves => autorisé',
      toutReuni.execute === true && toutReuni.mode === 'production',
      `mode=${toutReuni.mode}`);
  }

  // P5-P8 — Déclencheurs automatiques : jamais d'autorisation de production.
  for (const trigger of ['push', 'schedule', 'pull_request', 'workflow_run']) {
    const d = central.authorizeAction('external_write', {
      env: env({
        GITHUB_EVENT_NAME: trigger,
        OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN,
      }),
      requested: true, environmentProtection: PROTECTED,
    });
    record(`P5  trigger ${trigger} => refus malgré jeton+Environment`,
      d.execute === false && d.mode === 'dry-run' && d.reason.includes(trigger),
      `mode=${d.mode} reason=${d.reason}`);
  }

  // P6 — repository_dispatch est également dans la liste des « jamais production ».
  {
    const d = central.authorizeAction('external_write', {
      env: env({ GITHUB_EVENT_NAME: 'repository_dispatch', OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }),
      requested: true, environmentProtection: PROTECTED,
    });
    record('P6  trigger repository_dispatch => refus',
      d.execute === false, `reason=${d.reason}`);
    record('P6b NEVER_PRODUCTION_TRIGGERS couvre push/schedule/PR/workflow_run',
      ['push', 'schedule', 'pull_request', 'workflow_run', 'repository_dispatch']
        .every((t) => central.NEVER_PRODUCTION_TRIGGERS.has(t)));
  }

  // P7 — Jeton absent ou malformé : BLOCAGE (pas de succès silencieux).
  for (const bad of [undefined, '', 'secret-of-prod', 'sgappr_court']) {
    const d = central.authorizeAction('email_send', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: bad }), requested: true,
      environmentProtection: PROTECTED,
    });
    record(`P7  jeton ${JSON.stringify(bad)} => bloqué`,
      d.execute === false && d.mode === 'blocked', `mode=${d.mode} reason=${d.reason}`);
  }

  // P8 — Environment non vérifié (undefined) : jamais de repli, opération désactivée.
  {
    const d = central.authorizeAction('analytics_delete', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
    });
    record('P8  Environment non vérifié => opération désactivée',
      d.execute === false && d.mode === 'blocked', `reason=${d.reason}`);
  }

  // P9 — Environment existant mais sans protection : désactivé.
  {
    const d = central.authorizeAction('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      environmentProtection: { exists: true, reviewers: 0, protectionRules: 0, error: 'not-protected' },
    });
    record('P9  Environment sans required reviewer => désactivé',
      d.execute === false && d.mode === 'blocked', `reason=${d.reason}`);
  }

  // P10 — Environment introuvable (404) : désactivé.
  {
    const d = central.authorizeAction('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      environmentProtection: { exists: false, reviewers: 0, protectionRules: 0, error: 'environment-missing' },
    });
    record('P10 Environment 404 => désactivé',
      d.execute === false && d.mode === 'blocked', `reason=${d.reason}`);
  }

  // P11 — Les 4 preuves réunies : autorisation explicite.
  {
    const d = central.authorizeAction('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      environmentProtection: { exists: true, reviewers: 2, protectionRules: 1 },
    });
    record('P11 4 preuves réunies => exécution autorisée',
      d.execute === true && d.mode === 'production', `mode=${d.mode} reason=${d.reason}`);
  }

  // P12 — Dispatch manuel SANS demande explicite (pas de --send) : simulation.
  {
    const d = central.authorizeAction('email_send', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: false,
      environmentProtection: PROTECTED,
    });
    record('P12 pas de demande explicite (--send absent) => simulation',
      d.execute === false && d.mode === 'dry-run', `reason=${d.reason}`);
  }

  // P13 — Action hors contrat : refus net (les 6 actions nommées seulement).
  {
    const d = central.authorizeAction('delete_everything', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      environmentProtection: PROTECTED,
    });
    record('P13 action hors contrat => refus net',
      d.execute === false && d.mode === 'blocked' && d.reason.includes('action-inconnue'),
      `reason=${d.reason}`);
  }

  // P14 — Les six asserts nommés existent et couvrent les 6 actions du contrat.
  {
    const expected = [
      'assertEmailSendAllowed', 'assertPushSendAllowed', 'assertOutreachAllowed',
      'assertAppsScriptCleanupAllowed', 'assertAnalyticsDeleteAllowed', 'assertExternalWriteAllowed',
    ];
    const missing = expected.filter((n) => typeof central[n] !== 'function');
    record('P14 les 6 asserts nommés existent', missing.length === 0, `manquants=${missing.join(',')}`);
    const seen = new Set();
    for (const n of expected) {
      const d = central[n]({ env: env({ GITHUB_EVENT_NAME: 'push' }) });
      seen.add(d.action);
    }
    record('P14b chaque assert couvre une action distincte du contrat',
      seen.size === 6 && Object.keys(central.OUTBOUND_ACTIONS).every((a) => seen.has(a)),
      `actions=${[...seen].sort().join(',')}`);
  }

  // P15 — safety.cjs ré-exporte le MÊME contrat (source unique, pas de divergence).
  {
    const refs = [
      'authorizeAction', 'authorizeActionAsync', 'describeDecision',
      'verifyEnvironmentProtection', 'assertExternalWriteAllowed', 'assertAnalyticsDeleteAllowed',
    ];
    const divergent = refs.filter((r) => safety[r] !== central[r]);
    record('P15 safety.cjs ré-exporte le contrat central à l\'identique',
      divergent.length === 0, `divergents=${divergent.join(',')}`);
    record('P15b DRY_RUN de safety.cjs est dérivé du contrat (lu par process)',
      safety.DRY_RUN === central.isDryRunRequested(process.env));
  }

  // P16 — resolveTrigger / hasApprovalProof : helpers purs et stricts.
  {
    record('P16a resolveTrigger trime et défaille en unknown',
      central.resolveTrigger({ GITHUB_EVENT_NAME: '  workflow_dispatch ' }) === 'workflow_dispatch'
      && central.resolveTrigger({}) === 'unknown'
      && central.resolveTrigger(null) === 'unknown');
    record('P16b hasApprovalProof refuse les jetons partiels',
      central.hasApprovalProof({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }) === true
      && central.hasApprovalProof({ OUTBOUND_APPROVAL_TOKEN: 'sgappr_x' }) === false
      && central.hasApprovalProof({}) === false);
  }

  // P17 — Le contrat n'est pas une chaine de caractères : describeDecision stable.
  {
    const line = central.describeDecision({ action: 'email_send', mode: 'dry-run', execute: false, reason: 'x' });
    record('P17 describeDecision produit une ligne de log stable',
      line.includes('action=email_send') && line.includes('mode=dry-run') && line.includes('execute=false'), line);
  }

  // ── Variante asynchrone : vérification LECTURE SEULE de l'Environment ──────
  const VERIFY_OPTS = {
    owner: 'aveca', repo: 'sargagame', environment: 'outbound-approval', token: VALID_TOKEN,
  };

  // P18 — Environment protégé trouvé via l'API : autorisé, et l'appel est un GET.
  {
    let call = null;
    const fetchImpl = async (url, init) => {
      call = { url, method: (init && init.method) || 'GET', auth: init && init.headers && init.headers.authorization };
      return { ok: true, status: 200, json: async () => ({ protection_rules: [{ type: 'required_reviewers' }], reviewers: [{ id: 1 }] }) };
    };
    const d = await central.authorizeActionAsync('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      verificationOptions: Object.assign({}, VERIFY_OPTS, { fetchImpl }),
    });
    record('P18a Environment protégé vérifié => autorisé',
      d.execute === true && d.mode === 'production', `mode=${d.mode}`);
    record('P18b la vérification est une LECTURE SEULE (GET, endpoint environments)',
      !!call && call.method === 'GET'
      && call.url.endsWith('/repos/aveca/sargagame/environments/outbound-approval')
      && call.auth === 'Bearer ' + VALID_TOKEN,
      call ? `${call.method} ${call.url}` : 'aucun appel');
  }

  // P19 — 404 : Environment inexistant => bloqué (jamais créé, jamais supposé).
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: false, status: 404, json: async () => ({}) }; };
    const d = await central.authorizeActionAsync('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      verificationOptions: Object.assign({}, VERIFY_OPTS, { fetchImpl }),
    });
    record('P19 Environment 404 => bloqué',
      d.execute === false && d.mode === 'blocked' && calls === 1,
      `reason=${d.reason} calls=${calls}`);
  }

  // P20 — Environment sans règle de protection => bloqué.
  {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ protection_rules: [], reviewers: [] }) });
    const d = await central.authorizeActionAsync('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      verificationOptions: Object.assign({}, VERIFY_OPTS, { fetchImpl }),
    });
    record('P20 Environment sans protection => bloqué',
      d.execute === false && d.mode === 'blocked', `reason=${d.reason}`);
  }

  // P21 — Vérification impossible (réseau en erreur) => bloqué, pas de repli.
  {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    const d = await central.authorizeActionAsync('external_write', {
      env: env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }), requested: true,
      verificationOptions: Object.assign({}, VERIFY_OPTS, { fetchImpl }),
    });
    record('P21 vérification impossible => bloqué (aucun repli)',
      d.execute === false && d.mode === 'blocked', `reason=${d.reason}`);
  }

  // P22 — Pas de jeton ni d'Environment nommé : AUCUN appel réseau (cron muet).
  {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; };
    const d = await central.authorizeActionAsync('external_write', {
      env: env({ GITHUB_EVENT_NAME: 'schedule' }), requested: true,
      verificationOptions: { fetchImpl },
    });
    record('P22 cron sans preuve => zéro appel réseau + refus',
      d.execute === false && calls === 0, `calls=${calls} reason=${d.reason}`);
  }

  // P23 — Le module est important SANS effet réseau (défaut H de la PR #1200).
  {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; };
    delete require.cache[require.resolve(path.join(ROOT, 'scripts', 'lib', 'outbound-authorization.cjs'))];
    const fresh = require(path.join(ROOT, 'scripts', 'lib', 'outbound-authorization.cjs'));
    record('P23 import du module => zéro appel réseau (pure au chargement)',
      calls === 0 && typeof fresh.authorizeAction === 'function', `calls=${calls}`);
  }

  // P24 — Un trigger inconnu ou un env partiel ne produit jamais mode='production'.
  {
    const partials = [
      env({ GITHUB_EVENT_NAME: 'workflow_dispatch', OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }),
      env({ GITHUB_EVENT_NAME: 'workflow_dispatch' }),
      env({ OUTBOUND_APPROVAL_TOKEN: VALID_TOKEN }),
      env({}),
      {},
    ];
    const modes = partials.map((e) => central.authorizeAction('external_write', {
      env: e, requested: true, environmentProtection: undefined,
    }).mode);
    record('P24 aucun environnement partiel ne donne le mode production',
      modes.every((m) => m !== 'production'), `modes=${modes.join(',')}`);
  }

  console.log(failures === 0
    ? '\nOUTBOUND_AUTHORIZATION_TESTS PASS'
    : `\nOUTBOUND_AUTHORIZATION_TESTS FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERREUR FATALE :', e && e.stack ? e.stack : e);
  process.exit(1);
});
