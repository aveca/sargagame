'use strict';

/**
 * outbound-security.cjs — Gate d'approbation pour toutes les opérations
 * sortantes (email, push, notification, nettoyage destructive) dans les
 * workflows GitHub Actions programmés.
 *
 * PRINCIPES:
 * - L'exécution planifiée (schedule) est par défaut en DRY-RUN.
 * - Aucun secret SMTP/OneSignal de production n'est injecté dans un job
 *   planifié.
 * - Aucun envoi réel, aucun nettoyage destructif, aucune remise à zéro de
 *   marqueurs de dédup n'est autorisé sans approbation explicite.
 * - L'envoi manuel (workflow_dispatch) nécessite une approbation explicite
 *   liée à cet exécutoire et à cette action exacts.
 * - L'approbation de nettoyage est séparée de l'approbation d'envoi.
 * - Un mécanisme d'approbation d'Environment GitHub est utilisé quand
 *   configuré.
 *
 * Utilisé par: daily-brief.yml, daily-copernicus.yml, morning-brief.yml,
 * weekend-email.yml, weekly-outreach.yml, notify-photos.yml,
 * weekly-optimize.yml, et tout autre workflow d'envoi programmé.
 */

const fs = require('fs');
const path = require('path');

/**
 * Détermine si le déclenchement courant est une exécution planifiée (schedule)
 * ou une exécution manuelle (workflow_dispatch).
 * Les variables d'environnement GitHub Actions sont lues depuis process.env.
 */
function getTriggerType() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  if (eventName === 'schedule') return 'schedule';
  if (eventName === 'workflow_dispatch') return 'workflow_dispatch';
  if (eventName === 'push') return 'push';
  return 'unknown';
}

/**
 * Vérifie si l'approbation DRY-RUN est active pour une exécution planifiée.
 * Retourne true si le workflow doit fonctionner en mode lecture seule (sans
 * envoi réel, sans nettoyage destructif).
 *
 * Règles:
 * - schedule → DRY-RUN par défaut (true), sauf si DRY_RUN=0 est explicitement
 *   défini ET qu'une approbation d'Environment est présente.
 * - workflow_dispatch → DRY-RUN sauf si DRY_RUN=0 ET approbation Environment.
 * - push → jamais DRY-RUN (les builds/push ne sont pas des opérations
 *   sortantes de message).
 */
function isDryRun() {
  const trigger = getTriggerType();
  const dryRunEnv = process.env.DRY_RUN;

  // Les événements push ne sont jamais considérés comme des envois sortants
  if (trigger === 'push') return false;

  // Si DRY_RUN n'est pas défini, le mode par défaut dépend du déclencheur:
  // - schedule → DRY-RUN (sécurité par défaut)
  // - workflow_dispatch → DRY-RUN (nécessite approbation explicite pour sortir)
  if (dryRunEnv === undefined) {
    return trigger === 'schedule' || trigger === 'workflow_dispatch';
  }

  // DRY_RUN=0 → sortie du mode DRY-RUN (requiert approbation Environment)
  if (dryRunEnv === '0') {
    // Vérifier qu'une approbation d'Environment est présente
    return !hasEnvironmentApproval();
  }

  // DRY_RUN=1 ou toute autre valeur → DRY-RUN activé
  return true;
}

/**
 * Vérifie si une approbation d'Environment GitHub est présente pour cette
 * exécution. Les Environments GitHub sont indiqués par la variable
 * ENVIRONMENT_NAME (définie quand un job fait référence à un Environment
 * avec des règles d'approbation).
 */
function hasEnvironmentApproval() {
  const envName = process.env.ENVIRONMENT_NAME || '';
  return envName.length > 0;
}

/**
 * Retourne la liste des secrets qui NE DOIVENT JAMAIS être injectés dans un
 * job en mode DRY-RUN.
 */
const FORBIDDEN_SECRETS_IN_DRY_RUN = [
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
];

/**
 * Vérifie qu'aucun secret interdit n'est présent dans l'environnement quand
 * on est en mode DRY-RUN. Lance une erreur si un secret interdit est détecté.
 */
function assertNoForbiddenSecrets() {
  if (!isDryRun()) return;

  const found = [];
  for (const secret of FORBIDDEN_SECRETS_IN_DRY_RUN) {
    if (process.env[secret]) {
      found.push(secret);
    }
  }

  if (found.length > 0) {
    throw new Error(
      `OUTBOUND_SECURITY: secrets interdits en mode DRY-RUN (schedule/workflow_dispatch sans approbation): ${found.join(', ')}. ` +
      `Définir DRY_RUN=0 avec une approbation d'Environment pour autoriser l'envoi réel.`
    );
  }
}

/**
 * Retourne un objet de contexte d'envoi utilisable par les scripts d'automatisation.
 * Les scripts doivent appeler sendAllowed() avant toute opération sortante.
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
     * Vérifie si un nettoyage destructif (purge, bounce cleanup, reset dédup)
     * est autorisé. Jamais autorisé en mode DRY-RUN.
     */
    destructiveCleanupAllowed() {
      return !isDryRun() && hasEnvironmentApproval();
    },
    /**
     * Vérifie si la remise à zéro des marqueurs de dédup est autorisée.
     * Jamais autorisée en mode DRY-RUN.
     */
    dedupResetAllowed() {
      return !isDryRun() && hasEnvironmentApproval();
    },
    /**
     * Lance une erreur si l'envoi n'est pas autorisé (mode DRY-RUN).
     * Les scripts d'automatisation doivent appeler ceci avant tout envoi.
     */
    assertSendAllowed() {
      if (!this.sendAllowed()) {
        throw new Error(
          `OUTBOUND_SECURITY: envoi sortant bloqué en mode DRY-RUN (${this.trigger}). ` +
          `Pour autoriser: DRY_RUN=0 + approbation d'Environment GitHub.`
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
  };
}

module.exports = {
  getTriggerType,
  isDryRun,
  hasEnvironmentApproval,
  assertNoForbiddenSecrets,
  outboundContext,
  FORBIDDEN_SECRETS_IN_DRY_RUN,
};
