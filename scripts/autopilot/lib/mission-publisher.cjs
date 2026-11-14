#!/usr/bin/env node
/**
 * mission-publisher.cjs — publication du cycle de vie d'une mission GitHub.
 *
 * Point UNIQUE de publication : le pont (`multi-repo-bridge.cjs`) publie le
 * commentaire sur l'issue, et ce module y joint l'état DURABLE
 * (`mission-lifecycle.cjs`). L'orchestrateur et les tests d'intégration
 * passent par ici : il n'existe donc qu'une seule implémentation du contrat
 * « un changement d'état → un commentaire sur l'issue + une trace durable ».
 *
 * Module pur (dépendances injectées) : testable hors-ligne.
 */

'use strict';

/**
 * @param {string} oppId  identifiant de mission
 * @param {string} status état (imported/started/heartbeat/completed/blocked/failed/retrying)
 * @param {string} detail détail lisible
 * @param {object} evidence preuves {branch, agent, model, startedAt, commit, tests, pr, reason}
 * @param {object} deps {mem, bridge, lifecycle, log, dry}
 * @returns {{published:boolean, state:object|null}}
 */
function publishMissionStatus(oppId, status, detail, evidence = {}, deps = {}) {
  const mem = deps.mem || require('./memory.cjs');
  const bridge = deps.bridge || require('../multi-repo-bridge.cjs');
  const lc = deps.lifecycle || require('./mission-lifecycle.cjs');
  const log = deps.log || (() => {});
  if (deps.dry) return { published: false, state: null };

  try {
    const queue = mem.loadQueue();
    const opp = (queue.opportunities || []).find(o => o && o.id === oppId);
    if (!opp) return { published: false, state: null };
    const repo = String(opp.repository_full_name || '').trim();
    const issue = Number(opp.issue_number);
    if (!repo || !Number.isInteger(issue) || issue <= 0) return { published: false, state: null };
    // Fail-closed : dépôt hors allowlist → refus de publication.
    if (!bridge.isAllowedRepo(repo)) return { published: false, state: null };

    const merged = { ...(opp.agent || {}), ...evidence };
    const published = bridge.publishStatus(repo, issue, status, String(detail || ''), {
      taskId: opp.id,
      fingerprint: opp.fingerprint,
      evidence: merged,
      gh: deps.gh,
    });
    if (!published) log(`[mission-status] publication "${status}" impossible sur ${repo}#${issue}`);

    // Trace durable : le cycle de vie survit au redémarrage et sert au
    // watchdog (reprise sans doublon).
    let state = null;
    try {
      state = lc.upsert({
        taskId: opp.id,
        repo,
        issue,
        fingerprint: opp.fingerprint || null,
        state: status,
        agent: merged.agent || (opp.agent && opp.agent.agent) || null,
        model: merged.model || (opp.agent && opp.agent.model) || null,
        branch: merged.branch !== undefined ? merged.branch : undefined,
        commit: merged.commit !== undefined ? merged.commit : undefined,
        pr: merged.pr !== undefined ? merged.pr : undefined,
        tests: merged.tests || undefined,
        reason: merged.reason !== undefined ? merged.reason : undefined,
        lastHeartbeatAt: status === 'heartbeat' ? new Date().toISOString() : undefined,
      });
    } catch (e) {
      log(`[mission-status] état durable non écrit: ${e.message}`);
    }
    return { published: !!published, state };
  } catch (e) {
    log(`[mission-status] publication "${status}" ignorée: ${e.message}`);
    return { published: false, state: null };
  }
}

module.exports = { publishMissionStatus };
