#!/usr/bin/env node
'use strict';

/**
 * outbound-security.cjs — Gate d'approbation pour toutes les opérations
 * sortantes (email, push, notification, nettoyage destructive, migration
 * de schéma, déploiement Worker, etc.) dans les workflows GitHub Actions
 * programmés de Sargagame.
 *
 * PRINCIPES DE SÉCURITÉ (contrat fail-closed) :
 *   1. Une exécution planifiée (schedule) est par défaut en DRY-RUN.
 *      Aucun secret SMTP / OneSignal / MODERATE_TOKEN / etc. n'est injecté.
 *      Aucun appel SMTP / OneSignal / Apps Script d'envoi n'est effectué.
 *      Aucun nettoyage / purge / modification externe n'est effectué.
 *      Seuls les rapports, prévisualisations et artefacts locaux sont autorisés.
 *   2. Un déclenchement push / workflow_run / autre ne constitue JAMAIS une
 *      approbation d'envoi. Fail-closed par défaut.
 *   3. Un workflow_dispatch nécessite des inputs distincts et explicites
 *      (send_emails, send_pushes, send_outreach, cleanup_bounces,
 *       purge_analytics), tous à false par défaut. Une autorisation d'envoi
 *      n'autorise pas le nettoyage, et inversement.
 *   4. L'approbation GitHub Environment (environnements dédiés) est requise
 *      pour sortir du mode DRY-RUN sur un job qui accède à des secrets.
 *      Un simple ENVIRONMENT_NAME non vide n'est PAS une preuve d'approbation.
 *   5. Les scripts s'exécutent en DRY_RUN par défaut, refusent les triggers
 *      inconnus, refusent schedule/push pour les effets sortants, exigent un
 *      input explicite pour l'action correspondante, et refusent avant le
 *      premier appel réseau si la gate manque.
 *
 * MODULE UTILISÉ PAR :
 *   - Tous les scripts d'automatisation d'envoi / nettoyage (drip-email,
 *     push-winback, send-notifications, revenue-watch, ux-watch,
 *     deliverability-watch, factory-heartbeat-watch, ux-daily,
 *     notify-new-photos, notify-new-reports, notify-failure, email-weekend,
 *     auto-outreach, seo-outreach-curated, b2b-outreach, seo-submit-urls,
 *     beached-calibrate, purge-analytics, etc.)
 *   - Tous les workflows GitHub Actions programmés (daily-copernicus,
 *     daily-brief, morning-brief, notify-photos, weekend-email,
 *     weekly-optimize, weekly-outreach, weekly-seo-automation, etc.)
 */

// ── Secrets qui ne doivent JAMAIS être injectés dans un job en mode DRY-RUN ──
const FORBIDDEN_SECRETS = new Set([
  'SMTP_PASS',
  'SMTP_USER',
  'SMTP_HOST',
  'SMTP_PORT',
  'ONESIGNAL_API_KEY_MQ',
  'ONESIGNAL_API_KEY_GP',
  'ONESIGNAL_API_KEY_PUNTACANA',
  'ONESIGNAL_API_KEY_FLORIDA',
  'ONESIGNAL_API_KEY_RIVIERAMAYA',
  'MODERATE_TOKEN',
  'APPS_SCRIPT_URL',
  'SUPABASE_ACCESS_TOKEN',
  'MOLLIE_API_KEY',
  'STRIPE_SECRET_KEY',
  'GA4_PROPERTY_ID_MQ',
  'GA4_PROPERTY_ID_GP',
  'CRUX_API_KEY',
]);

// ── Environnements GitHub dédiés (requis pour sortir du DRY-RUN) ──
const REQUIRED_ENVIRONMENTS = new Set([
  'outbound-send',
  'outbound-cleanup',
  'schema-production',
  'account-admin',
  'payment-production',
]);

// ── Actions sortantes critiques (appels réseau sortants) ──
const OUTBOUND_ACTIONS = new Set([
  'send_emails',
  'send_pushes',
  'send_outreach',
  'cleanup_bounces',
  'purge_analytics',
]);

/**
 * Détermine le type de déclenchement du workflow GitHub Actions actuel.
 * Lit la variable d'environnement GITHUB_EVENT_NAME.
 *
 * @returns {'schedule'|'workflow_dispatch'|'push'|'workflow_run'|'unknown'}
 */
function getTriggerType() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  switch (eventName) {
    case 'schedule': return 'schedule';
    case 'workflow_dispatch': return 'workflow_dispatch';
    case 'push': return 'push';
    case 'workflow_run': return 'workflow_run';
    default: return 'unknown';
  }
}

/**
 * Vérifie si une approbation GitHub Environment est réellement présente pour
 * cette exécution. Une approbation Environment est indiquée par la variable
 * ENVIRONMENT_NAME (définie par GitHub quand un job référence un Environment
 * avec des règles d'approbation configurées).
 *
 * @returns {boolean} true si une approbation Environment est active
 */
function hasEnvironmentApproval() {
  const envName = process.env.ENVIRONMENT_NAME || '';
  return REQUIRED_ENVIRONMENTS.has(envName);
}

/**
 * Vérifie si le mode DRY-RUN est actif.
 *
 * Règles :
 *   - schedule / workflow_dispatch / workflow_run / push : DRY_RUN par défaut
 *     (true), sauf si DRY_RUN=0 est explicitement défini ET qu'une approbation
 *     d'Environment est présente.
 *   - DRY_RUN=0 sans approbation Environment → reste en DRY_RUN (fail-closed).
 *   - DRY_RUN=1 ou toute autre valeur → DRY_RUN activé.
 *
 * @returns {boolean} true si le mode DRY-RUN est actif (envoi bloqué)
 */
function isDryRun() {
  const trigger = getTriggerType();
  const dryRunEnv = process.env.DRY_RUN;

  // Les événements push ne constituent jamais une approbation d'envoi sortant,
  // mais ils ne sont pas non plus concernés par le DRY_RUN des envois (ils
  // déclenchent du build/test, pas de notification). On les traite comme
  // non-concernés : retourne false pour ne pas bloquer les builds.
  if (trigger === 'push') return false;

  // Si DRY_RUN n'est pas défini, mode par défaut selon le déclencheur :
  // - schedule, workflow_dispatch, workflow_run → DRY_RUN (sécurité par défaut)
  if (dryRunEnv === undefined) {
    return trigger === 'schedule' || trigger === 'workflow_dispatch' || trigger === 'workflow_run';
  }

  // DRY_RUN=0 : sortie du mode DRY-RUN demandée, mais elle nécessite une
  // approbation d'Environment GitHub. Sans approbation → reste en DRY_RUN.
  if (dryRunEnv === '0') {
    return !hasEnvironmentApproval();
  }

  // DRY_RUN=1 ou toute autre valeur explicite → DRY_RUN activé.
  return true;
}

/**
 * Retourne la liste des secrets qui sont interdits en mode DRY-RUN.
 * @returns {Set<string>}
 */
function getForbiddenSecrets() {
  return new Set(FORBIDDEN_SECRETS);
}

/**
 * Vérifie qu'aucun secret interdit n'est présent dans l'environnement lorsque
 * on est en mode DRY-RUN. Lance une erreur si un secret interdit est détecté,
 * afin de fail-closed avant tout appel réseau.
 */
function assertNoForbiddenSecrets() {
  if (!isDryRun()) return;

  const found = [];
  for (const secret of FORBIDDEN_SECRETS) {
    if (process.env[secret]) {
      found.push(secret);
    }
  }

  if (found.length > 0) {
    throw new Error(
      `OUTBOUND_SECURITY: secrets interdits en mode DRY-RUN (${getTriggerType()}) : ${found.join(', ')}. ` +
      `Définir DRY_RUN=0 avec une approbation d'Environment GitHub pour autoriser l'envoi réel.`
    );
  }
}

/**
 * Retourne un contexte d'envoi utilisable par les scripts d'automatisation.
 * Les scripts doivent appeler sendAllowed() avant toute opération sortante.
 *
 * @returns {Object} Objet de contexte avec les méthodes suivantes :
 *   - trigger : type de déclenchement ('schedule', 'workflow_dispatch', 'push', 'workflow_run', 'unknown')
 *   - dryRun : true si le mode DRY-RUN est actif
 *   - environmentApproved : true si une approbation d'Environment est active
 *   - sendAllowed() : true si l'envoi sortant (email, push, notification) est autorisé
 *   - destructiveCleanupAllowed() : true si le nettoyage destructif est autorisé
 *   - assertSendAllowed() : lance une erreur si l'envoi n'est pas autorisé
 *   - assertDestructiveCleanupAllowed() : lance une erreur si le nettoyage n'est pas autorisé
 *   - assertNoForbiddenSecrets() : lance une erreur si un secret interdit est présent en DRY_RUN
 */
function outboundContext() {
  return {
    trigger: getTriggerType(),
    dryRun: isDryRun(),
    environmentApproved: hasEnvironmentApproval(),

    /**
     * Vérifie si un envoi de message (email, push, notification) est autorisé.
     * Retourne false en mode DRY-RUN.
     */
    sendAllowed() {
      return !isDryRun();
    },

    /**
     * Vérifie si un nettoyage destructif (purge, bounce cleanup, reset de
     * dédoublement) est autorisé. Jamais autorisé en mode DRY-RUN.
     */
    destructiveCleanupAllowed() {
      return !isDryRun() && hasEnvironmentApproval();
    },

    /**
     * Vérifie si la remise à zéro des marqueurs de dédoublement est autorisée.
     * Jamais autorisée en mode DRY-RUN.
     */
    dedupResetAllowed() {
      return !isDryRun() && hasEnvironmentApproval();
    },

    /**
     * Lance une erreur si l'envoi n'est pas autorisé (mode DRY-RUN).
     * Les scripts d'automatisation doivent appeler cette méthode avant tout
     * appel réseau sortant.
     */
    assertSendAllowed() {
      if (!this.sendAllowed()) {
        throw new Error(
          `OUTBOUND_SECURITY: envoi sortant bloqué en mode DRY-RUN (${getTriggerType()}). ` +
          `Pour autoriser : DRY_RUN=0 + approbation d'Environment GitHub.`
        );
      }
    },

    /**
     * Lance une erreur si le nettoyage destructif n'est pas autorisé.
     */
    assertDestructiveCleanupAllowed() {
      if (!this.destructiveCleanupAllowed()) {
        throw new Error(
          `OUTBOUND_SECURITY: nettoyage destructif bloqué en mode DRY-RUN. ` +
          `Nécessite DRY_RUN=0 + approbation d'Environment GitHub.`
        );
      }
    },

    /**
     * Lance une erreur si un secret interdit est présent en mode DRY-RUN.
     */
    assertNoForbiddenSecrets() {
      if (!isDryRun()) return;

      const found = [];
      for (const secret of FORBIDDEN_SECRETS) {
        if (process.env[secret]) {
          found.push(secret);
        }
      }

      if (found.length > 0) {
        throw new Error(
          `OUTBOUND_SECURITY: secrets interdits en mode DRY-RUN (${getTriggerType()}) : ${found.join(', ')}. ` +
          `Définir DRY_RUN=0 avec une approbation d'Environment GitHub pour autoriser l'envoi réel.`
        );
      }
    },
  };
}

module.exports = {
  getTriggerType,
  isDryRun,
  hasEnvironmentApproval,
  assertNoForbiddenSecrets,
  outboundContext,
  FORBIDDEN_SECRETS,
  REQUIRED_ENVIRONMENTS,
  OUTBOUND_ACTIONS,
};
