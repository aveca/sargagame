#!/usr/bin/env node
/**
 * mission-watchdog.cjs — reprise des missions abandonnées (sans doublon).
 *
 * Détecte les missions laissées en cours par :
 *   - un crash du runner (processus disparu) ;
 *   - un agent mort ;
 *   - un heartbeat expiré (l'agent ne donne plus signe de vie).
 *
 * Puis, pour chacune :
 *   1. publie `retrying` sur l'issue source (le fondateur voit que la mission
 *      n'est pas perdue) ;
 *   2. remet l'opportunité dans un état sélectionnable pour qu'elle soit
 *      REPRISE au cycle suivant ;
 *   3. ne touche JAMAIS une mission déjà terminale → une mission terminée
 *      n'est JAMAIS relancée.
 *
 * Module pur (aucun effet de bord à l'import) : il est testable hors-ligne.
 */

'use strict';

const lifecycle = require('./mission-lifecycle.cjs');

/**
 * @param {object} opts
 * @param {object} opts.cfg         configuration autopilot (mission.*)
 * @param {function} opts.log        journalisation
 * @param {function} opts.publish    (repo, issue, status, detail, options) => boolean
 * @param {object} opts.mem          module memory (injecté pour les tests)
 * @param {function} opts.lifecycle  module lifecycle (injecté pour les tests)
 * @returns {{resumed:number, checked:number, skipped:number}}
 */
function runMissionWatchdog(opts = {}) {
  const cfg = opts.cfg || {};
  const log = opts.log || (() => {});
  const publish = opts.publish || null;
  const mem = opts.mem || require('./memory.cjs');
  const lc = opts.lifecycle || lifecycle;

  const staleAfterMs = Number(cfg.mission && cfg.mission.watchdogStaleSeconds) > 0
    ? Number(cfg.mission.watchdogStaleSeconds) * 1000
    : 15 * 60 * 1000;

  let stale;
  try {
    stale = lc.stale({ staleAfterMs });
  } catch (e) {
    log(`watchdog missions : état illisible (non-fatal): ${e.message}`);
    return { resumed: 0, checked: 0, skipped: 0 };
  }
  if (!stale.length) return { resumed: 0, checked: 0, skipped: 0 };

  let resumed = 0;
  let skipped = 0;
  const queue = mem.loadQueue();
  const opps = queue.opportunities || [];
  for (const m of stale) {
    const opp = opps.find(o => o && o.id === m.taskId);
    // Mission déjà terminale côté queue → on ne la relance JAMAIS.
    if (!opp || ['ready-to-merge', 'done', 'blocked', 'rejected'].includes(opp.status)) {
      skipped += 1;
      // CORRECTION (défaut réel du 2026-11-09) : l'ancien code écrivait
      // `completed` pour TOUTE opportunité terminale. Une mission bloquée
      // par une PR ouverte était donc annoncée « completed » — un faux
      // succès, sans commit ni PR dans l'état durable. La règle est simple :
      // l'état durable de la mission REFLETTE l'état terminal réel.
      //
      //   ready-to-merge / done → completed (travail livré, PR prête)
      //   blocked               → blocked    (garde-fou ou PR en cours)
      //   rejected              → failed     (mission rejetée)
      //   opportunité absente   → failed     (mission inconnue)
      const TERMINAL_STATE = {
        'ready-to-merge': 'completed',
        'done': 'completed',
        'blocked': 'blocked',
        'rejected': 'failed',
      };
      const nextState = opp ? (TERMINAL_STATE[opp.status] || 'failed') : 'failed';
      try {
        lc.patch(m.taskId, m.repo, m.issue, {
          state: nextState,
          reason: `mission terminale (${opp ? opp.status : 'opportunité absente'}) — non relancée`,
        });
      } catch (_) {}
      continue;
    }
    const hbAge = m.lastHeartbeatAt ? Math.round((Date.now() - Date.parse(m.lastHeartbeatAt)) / 1000) : null;
    const dead = m.pid && !lc.pidAlive(m.pid);
    const reason = `reprise automatique : ${dead ? 'agent mort' : 'heartbeat expiré'}${hbAge !== null ? ` (${hbAge}s sans heartbeat)` : ''}`;
    log(`watchdog missions : reprise ${m.taskId} (${m.repo}#${m.issue}) — ${reason}`);

    // 1. Reprise dans la queue (état sélectionnable, SANS créer de doublon :
    //    l'opportunité existe déjà, elle n'est pas recréée).
    try {
      mem.updateOpportunity(m.taskId, {
        status: opp.status === 'validation' ? 'in_progress' : 'picked',
        blockReason: null,
        missionRetriedAt: new Date().toISOString(),
      });
    } catch (e) {
      log(`watchdog missions : remise en file impossible pour ${m.taskId}: ${e.message}`);
    }

    // 2. Statut `retrying` publié sur l'issue (preuve : la mission vit).
    if (publish) {
      try {
        const ok = publish(m.repo, Number(m.issue), 'retrying', reason, {
          taskId: m.taskId,
          fingerprint: m.fingerprint || undefined,
          evidence: {
            agent: m.agent || undefined,
            branch: m.branch || undefined,
            attempts: (m.attempts || 0) + 1,
            lastHeartbeatAt: m.lastHeartbeatAt || undefined,
            reason,
          },
        });
        if (!ok) log(`watchdog missions : publication "retrying" impossible sur ${m.repo}#${m.issue}`);
      } catch (e) {
        log(`watchdog missions : publication "retrying" en erreur: ${e.message}`);
      }
    }

    // 3. Trace durable de l'état.
    try {
      lc.upsert({
        taskId: m.taskId,
        repo: m.repo,
        issue: m.issue,
        fingerprint: m.fingerprint,
        state: 'retrying',
        attempts: (m.attempts || 0) + 1,
        reason,
      });
    } catch (e) {
      log(`watchdog missions : état durable non écrit: ${e.message}`);
    }
    resumed += 1;
  }
  return { resumed, checked: stale.length, skipped };
}

module.exports = { runMissionWatchdog };
