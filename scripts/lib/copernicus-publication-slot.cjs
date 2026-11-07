'use strict';

/**
 * SLOT DE PUBLICATION COPERNICUS — classification déterministe d'un run.
 *
 * POURQUOI (mission P0 « Workers first, freshness », 2026-11-07)
 * --------------------------------------------------------------
 * Le pipeline Copernicus ne publiait que 4 fois par jour (00:00, 06:00, 12:00,
 * 18:00 UTC). La passe satellite ERDDAP tombe dans la fenêtre 00:00 → 02:45
 * UTC : une observation capturée à 01:20 n'était publiée qu'à 06:00 UTC, soit
 * ~4 h 40 de latence sur le verdict affiché par le produit (SLA : 900 min).
 *
 * La densification (cron « 15 minutes de 00:00 à 02:45 UTC ») multiplie les
 * ticks de publication, donc
 * elle multiplie aussi les exécutions des jobs LOURDS (track-record, MRR,
 * emails). Si ces jobs tournaient à chaque tick dense :
 *   - `mollie-mrr.cjs --send` enverrait un rapport MRR toutes les 15 min ;
 *   - `email-automation` enverrait des emails de win-back toutes les 15 min ;
 *   - le backtest de prévision régénérerait le track-record 12 fois par jour.
 *
 * D'où la notion de SLOT : un run est soit DENSE (publication rapide des
 * données), soit CANONIQUE (slot historique qui porte aussi les travaux
 * lourds). Ce module est l'unique source de vérité de cette distinction —
 * comme `scripts/lib/copernicus-publication-status.cjs` pour le statut de
 * publication.
 *
 * DÉTERMINISME
 * ------------
 * La famille dense est identifiée par la chaîne cron elle-même
 * (`github.event.schedule`) : aucun cron ne se dédouble. Le tick 00:00 UTC,
 * qui est historiquement l'un des quatre slots canonique, est le SEUL tick
 * dense canonique ; il est identifié par l'heure UTC (00) avec une tolérance
 * de 10 minutes sur la minute, car GitHub peut démarrer un run planifié en
 * retard. Les ticks denses étant espacés de 15 minutes, une tolérance
 * inférieure à 15 min ne peut PAS confondre le tick 00:00 avec le tick 00:15.
 *
 * FAIL-CLOSED
 * -----------
 * Toute situation non reconnue (événement inconnu, cron inconnu, horloge
 * invalide) ⇒ `canonical: false`. Les jobs lourds sont donc SAUTÉS plutôt
 * que déclenchés par erreur : le pire cas est un créneau canonique manqué
 * (les jobs lourds tournent encore à 06:00, 12:00 et 18:00), jamais un envoi
 * d'email ou une régénération multipliée.
 */

const FAMILIES = Object.freeze({
  /** Tick de la famille dense (cron « 15 min de 00:00 à 02:45 UTC ») — publication rapide. */
  DENSE: 'dense',
  /** Créneau canonique historique (06:00, 12:00, 18:00 UTC). */
  CANONICAL: 'canonical',
  /** Exécution manuelle (`workflow_dispatch`) — traite comme canonique. */
  MANUAL: 'manual',
  /** Push de code — ni publication de données ni travaux lourds. */
  PUSH: 'push',
  /** Situation non reconnue — fail-closed. */
  UNKNOWN: 'unknown'
});

/** Famille dense : un tick toutes les 15 min pendant la fenêtre 00:00 → 02:45 UTC. */
const DENSE_SCHEDULE = '*/15 0-2 * * *';

/**
 * Créneaux canoniques historiques, en entrées cron DISTINCTES.
 * 00:00 UTC n'y figure pas : il est fourni par la famille dense (un cron
 * `0 0 * * *` supplémentaire déclencherait un SECOND run à 00:00 UTC).
 */
const CANONICAL_SCHEDULES = Object.freeze(['0 6 * * *', '0 12 * * *', '0 18 * * *']);

/** Heure UTC du tick canonique au sein de la famille dense. */
const DENSE_CANONICAL_HOUR = 0;

/**
 * Tolérance (en minutes) sur l'horodatage du tick dense 00:00.
 * Doit rester < 15 (l'écart entre deux ticks denses) pour ne jamais confondre
 * le tick 00:00 avec le tick 00:15.
 */
const DENSE_CANONICAL_TOLERANCE_MINUTES = 10;

/**
 * Classe un run en slot de publication.
 *
 * @param {{eventName?: string, schedule?: string, now?: number|string|Date}} input
 * @returns {{family: string, canonical: boolean, minute: number|null, hour: number|null, schedule: string, eventName: string}}
 */
function classifyPublicationSlot(input = {}) {
  const { eventName = '', schedule = '', now = Date.now() } = input;
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.parse(now));
  const validNow = Number.isFinite(nowMs);
  const minute = validNow ? new Date(nowMs).getUTCMinutes() : null;
  const hour = validNow ? new Date(nowMs).getUTCHours() : null;

  const base = {
    family: FAMILIES.UNKNOWN,
    canonical: false,
    minute,
    hour,
    schedule: String(schedule || ''),
    eventName: String(eventName || '')
  };

  // Exécution manuelle : toujours traitée comme canonique (refresh à la
  // demande = l'opérateur veut la publication complète, pas seulement les données).
  if (base.eventName === 'workflow_dispatch') {
    return { ...base, family: FAMILIES.MANUAL, canonical: true };
  }
  // Push de code : jamais de publication de données ni de travaux lourds.
  if (base.eventName === 'push') {
    return { ...base, family: FAMILIES.PUSH, canonical: false };
  }
  if (base.eventName !== 'schedule') {
    return base;
  }
  if (CANONICAL_SCHEDULES.includes(base.schedule)) {
    return { ...base, family: FAMILIES.CANONICAL, canonical: true };
  }
  if (base.schedule === DENSE_SCHEDULE) {
    if (!validNow) return { ...base, family: FAMILIES.DENSE, canonical: false };
    const canonical = hour === DENSE_CANONICAL_HOUR && minute <= DENSE_CANONICAL_TOLERANCE_MINUTES;
    return { ...base, family: FAMILIES.DENSE, canonical };
  }
  // Cron inconnu : fail-closed (jamais canonique).
  return base;
}

/** Le run est-il un tick de la famille dense (publication rapide) ? */
function isDenseSlot(slot) {
  return !!slot && slot.family === FAMILIES.DENSE;
}

module.exports = {
  FAMILIES,
  DENSE_SCHEDULE,
  CANONICAL_SCHEDULES,
  DENSE_CANONICAL_HOUR,
  DENSE_CANONICAL_TOLERANCE_MINUTES,
  classifyPublicationSlot,
  isDenseSlot
};
