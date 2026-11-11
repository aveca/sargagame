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
 *
 * ── Défaut réel du 2026-11-10 (mission #1384, 242 reprises) ────────────────
 * Le watchdog neconsultait QUE la queue pour décider si une mission était
 * terminale. Conséquences observées sur l'issue #1384 :
 *   - la boucle se relançait ELLE-MÊME : le watchdog écrivait `retrying` (un
 *     état NON terminal) et le cycle suivant retrouvait la mission « périmée »
 *     (heartbeat jamais émis) → 242 reprises, 242 commentaires `retrying`, 242
 *     lancements d'agent pour une mission qui n'avancait pas ;
 *   - il réarmait (`status: 'picked'`) une mission que le garde-fou de
 *     sécurité avait NEUTRALISÉE (`status: 'blocked'`) → fail-open sur le
 *     chemin de reprise ;
 *   - `cfg.mission.maxAttempts` (3) existait dans la configuration mais
 *     n'était JAMAIS lu : le plafond de reprises n'existait nulle part.
 *
 * Corrections (fail-closed) :
 *   - l'état DURABLE (`mission-state.json`) fait autorité : une mission
 *     `completed` / `blocked` / `failed` n'est JAMAIS relancée ;
 *   - une mission neutralisée par le garde-fou (`safety.blocked`) n'est JAMAIS
 *     réarmée ;
 *   - `cfg.mission.maxAttempts` est appliqué : au plafond, la mission passe
 *     en `failed` (terminal) et n'est plus jamais reprise — le spam de
 *     commentaires est donc borné par ce plafond.
 */

'use strict';

const lifecycle = require('./mission-lifecycle.cjs');
const scheduler = require('./scheduler.cjs');

/** États TERMINaux de la queue (état de sélection). */
const TERMINAL_QUEUE_STATUS = ['ready-to-merge', 'done', 'blocked', 'rejected'];

/**
 * États TERMINaux de la mission (état DURABLE).
 *
 * L'état durable fait autorité : il est écrit par le pont ET par l'agent
 * (publication de statut), là où la queue ne décrit que la sélection. Une
 * mission terminale côté durable ne doit JAMAIS repartir.
 */
const TERMINAL_MISSION_STATES = ['completed', 'blocked', 'failed'];

/**
 * @param {object} opts
 * @param {object} opts.cfg         configuration autopilot (mission.*)
 * @param {function} opts.log        journalisation
 * @param {function} opts.publish    (repo, issue, status, detail, options) => boolean
 * @param {object} opts.mem          module memory (injecté pour les tests)
 * @param {function} opts.lifecycle  module lifecycle (injecté pour les tests)
 * @param {object} opts.schedulerState état du scheduler injecté (tests) ;
 *        détermine le statut de reprise (`new` ou `picked`).
 * @returns {{resumed:number, checked:number, skipped:number}}
 */
function runMissionWatchdog(opts = {}) {
  const cfg = opts.cfg || {};
  const log = opts.log || (() => {});
  const publish = opts.publish || null;
  const mem = opts.mem || require('./memory.cjs');
  const lc = opts.lifecycle || lifecycle;
  const schedulerState = opts.schedulerState || null;

  const staleAfterMs = Number(cfg.mission && cfg.mission.watchdogStaleSeconds) > 0
    ? Number(cfg.mission.watchdogStaleSeconds) * 1000
    : 15 * 60 * 1000;

  // Plafond de REPRISES par mission (fail-closed : au plafond, la mission est
  // terminale). La configuration le prévoyait déjà (`mission.maxAttempts`) mais
  // le watchdog ne le lisait pas : la boucle pouvait reprendre une mission
  // indéfiniment (242 fois observées sur #1384).
  const maxAttempts = Number(cfg.mission && cfg.mission.maxAttempts) > 0
    ? Math.floor(Number(cfg.mission.maxAttempts))
    : 3;

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
  let exhausted = 0;
  const queue = mem.loadQueue();
  const opps = queue.opportunities || [];
  for (const m of stale) {
    const opp = opps.find(o => o && o.id === m.taskId);
    // Mission déjà terminale côté queue → on ne la relance JAMAIS.
    if (!opp || TERMINAL_QUEUE_STATUS.includes(opp.status)) {
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

    // ── L'ÉTAT DURABLE FAIT AUTORITÉ ──────────────────────────────────────
    // Défaut réel du 2026-11-10 (#1384) : la terminalité n'était lue que dans
    // la QUEUE. Or la queue est l'état de SÉLECTION (elle repasse `picked` à
    // chaque reprise) alors que `mission-state.json` est l'état DURABLE de la
    // mission. Une mission terminale côté durable mais réarmée côté queue
    // repartait — boucle sans fin. On refuse donc de relancer une mission
    // que l'état durable déclare terminale.
    if (TERMINAL_MISSION_STATES.includes(m.state)) {
      skipped += 1;
      try {
        lc.patch(m.taskId, m.repo, m.issue, {
          state: m.state,
          reason: `mission terminale (durable: ${m.state}) — non relancée`,
        });
      } catch (_) {}
      log(`watchdog missions : ${m.taskId} terminale (${m.state}) — non relancée`);
      continue;
    }

    // ── GARDE-FOU DE SÉCURITÉ SUR LE CHEMIN DE REPRISE ───────────────────
    // Le garde-fou est appliqué à l'IMPORT (pont multi-dépôt). Une mission
    // NEUTRALISÉE (`safety.blocked`, statut `blocked`) ne doit JAMAIS être
    // réarmée par le watchdog : la neutraliser puis la réarmer est un
    // fail-open (la mission serait exécutée malgré l'interdiction).
    if (opp && opp.safety && opp.safety.blocked) {
      skipped += 1;
      const reason = `neutralisée par le garde-fou (${opp.safety.reason || 'safety'}) — non relancée`;
      try {
        lc.patch(m.taskId, m.repo, m.issue, { state: 'blocked', reason });
      } catch (_) {}
      try {
        mem.updateOpportunity(m.taskId, { status: 'blocked', blockReason: reason });
      } catch (e) {
        log(`watchdog missions : neutralisation non écrite pour ${m.taskId}: ${e.message}`);
      }
      log(`watchdog missions : ${m.taskId} ${reason}`);
      continue;
    }

    // ── PLAFOND DE REPRISES ───────────────────────────────────────────────
    // Au plafond, la mission devient TERMINALE (`failed`) : elle n'est plus
    // reprise et le spam de commentaires cesse. Sans ce plafond, la boucle
    // se relançait elle-même (242 fois sur #1384).
    const attempts = Number(m.attempts || 0);
    if (attempts >= maxAttempts) {
      exhausted += 1;
      skipped += 1;
      const reason = `plafond de reprises atteint (${attempts}/${maxAttempts}) — mission abandonnée, intervention humaine requise`;
      log(`watchdog missions : ${m.taskId} — ${reason}`);
      try {
        lc.patch(m.taskId, m.repo, m.issue, { state: 'failed', reason, attempts });
      } catch (_) {}
      try {
        mem.updateOpportunity(m.taskId, { status: 'rejected', blockReason: reason });
      } catch (e) {
        log(`watchdog missions : abandon non écrit pour ${m.taskId}: ${e.message}`);
      }
      if (publish) {
        try {
          publish(m.repo, Number(m.issue), 'failed', reason, {
            taskId: m.taskId,
            fingerprint: m.fingerprint || undefined,
            evidence: { attempts, maxAttempts, reason },
          });
        } catch (e) {
          log(`watchdog missions : publication "failed" en erreur: ${e.message}`);
        }
      }
      continue;
    }

    const hbAge = m.lastHeartbeatAt ? Math.round((Date.now() - Date.parse(m.lastHeartbeatAt)) / 1000) : null;
    const dead = m.pid && !lc.pidAlive(m.pid);
    const reason = `reprise automatique : ${dead ? 'agent mort' : 'heartbeat expiré'}${hbAge !== null ? ` (${hbAge}s sans heartbeat)` : ''}`;
    log(`watchdog missions : reprise ${m.taskId} (${m.repo}#${m.issue}) — ${reason}`);

    // 1. Reprise dans la queue (état sélectionnable, SANS créer de doublon :
    //    l'opportunité existe déjà, elle n'est pas recréée).
    //
    //    Le statut de reprise est celui de `scheduler.resumableStatus` :
    //    `new` si le scheduler n'a JAMAIS claimé la mission (elle doit
    //    redevenir sélectionnable par `analyze`), `picked` si le scheduler
    //    l'a déjà claimée (il la restaurera). Mettre `picked` par défaut
    //    rendait la mission INEXÉCUTABLE : `analyze` ne sélectionne que les
    //    opportunités en `new` (constaté en exécution réelle le 2026-11-11
    //    sur la mission #1384, reprise 242 fois et jamais exécutée).
    try {
      mem.updateOpportunity(m.taskId, {
        status: scheduler.resumableStatus(m.taskId, schedulerState),
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
            attempts: attempts + 1,
            maxAttempts,
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
        attempts: attempts + 1,
        reason,
      });
    } catch (e) {
      log(`watchdog missions : état durable non écrit: ${e.message}`);
    }
    resumed += 1;
  }
  return { resumed, checked: stale.length, skipped, exhausted };
}

module.exports = { runMissionWatchdog, TERMINAL_QUEUE_STATUS, TERMINAL_MISSION_STATES };
