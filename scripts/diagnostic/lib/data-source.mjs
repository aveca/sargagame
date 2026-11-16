/**
 * data-source.mjs — Lecture de la donnée satellite publique (ERDDAP) pour un
 * secteur, et dérivation HONNÊTE du niveau de vigilance.
 *
 * RÈGLE ABSOLUE
 *   On ne restitue que ce qui est PUBLISHED dans le snapshot ERDDAP.
 *   Si le secteur est absent, ou si l'observation est périmée, on REFUSE de
 *   produire un diagnostic (la commande part en `manual_review`).
 *   Aucune observation n'est jamais inventée, complétée ou extrapolée.
 *
 * SEUILS DE VIGILANCE
 *   Repris tels quels du pipeline du repo (scripts/fetch-sargassum-live.cjs
 *   → statusFromAfai) : clean < 0,15 · moderate < 0,40 · avoid au-delà.
 *   Le statut affiché dans le document est celui calculé par le pipeline ;
 *   il est recoupé avec la même table de seuils (cohérence vérifiée).
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

export const DEFAULT_SNAPSHOT_URL = 'https://sargasses-martinique.com/api/copernicus/sargassum.json';

/** SLA de fraîcheur du repo : l'observation satellite a moins de 15 h. */
export const DEFAULT_MAX_DATA_AGE_MINUTES = 900;

/** Table de seuils canonique du pipeline. */
export function statusFromAfai(afai) {
  if (!Number.isFinite(afai)) return null;
  if (afai < 0.15) return 'clean';
  if (afai < 0.4) return 'moderate';
  return 'avoid';
}

export const VIGILANCE_LABELS = Object.freeze({
  clean: 'PROPRE',
  moderate: 'MODÉRÉ',
  avoid: 'À ÉVITER',
});

function fmtDateTime(iso, timeZone = 'America/Martinique') {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function ageMinutes(iso, nowMs) {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.round((nowMs - d) / 60000));
}

/**
 * Extraction PURE du snapshot d'un secteur.
 * @param {object} raw        contenu JSON du snapshot ERDDAP
 * @param {object} opts       { levelId, sector, now, maxDataAgeMinutes }
 */
export function extractSnapshot(raw, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const nowMs = now.getTime();
  const maxAge = Number(opts.maxDataAgeMinutes || DEFAULT_MAX_DATA_AGE_MINUTES);
  const levelId = String(opts.levelId || '').trim();

  if (!raw || typeof raw !== 'object') return { ok: false, error: 'snapshot_invalid' };
  if (!levelId) return { ok: false, error: 'missing_level_id' };

  const levels = Array.isArray(raw.levels) ? raw.levels : [];
  const level = levels.find((l) => l && String(l.id) === levelId);
  if (!level) {
    return {
      ok: false,
      error: 'sector_not_in_snapshot',
      available: levels.map((l) => String(l.id)).filter(Boolean),
    };
  }

  const observedAt = raw.erddapTimestamp || null;
  const updatedAt = raw.updatedAt || null;
  const age = ageMinutes(observedAt, nowMs);

  const weekly = (raw.weekly && raw.weekly[levelId]) || null;
  const forecast = Array.isArray(weekly?.forecast) ? weekly.forecast : [];
  const scores = (raw.scores && raw.scores[levelId]) || null;
  const islandKey = opts.sector?.island || 'mq';
  const weather = (raw.weather && raw.weather[islandKey]) || null;

  const observationRow = forecast.find((f) => f && f.type === 'observation') || forecast[0] || null;
  const trendRows = forecast.filter((f) => f && f.type !== 'observation');

  const afai = Number(level.afai);
  const pipelineStatus = String(level.status || '');
  const derivedStatus = statusFromAfai(afai);
  const statusConsistent = !derivedStatus || !pipelineStatus || derivedStatus === pipelineStatus;

  const snapshot = {
    source: String(raw.source || ''),
    pipelineVersion: raw.pipelineVersion ?? null,
    observedAt,
    observedAtLocal: fmtDateTime(observedAt),
    updatedAt,
    updatedAtLocal: fmtDateTime(updatedAt),
    dataAgeMinutes: age,
    maxDataAgeMinutes: maxAge,
    staleFlag: raw.stale === true,
    fresh: age !== null && age <= maxAge && raw.stale !== true,
    sector: opts.sector || null,
    levelId,
    observation: {
      afai: Number.isFinite(afai) ? afai : null,
      status: pipelineStatus || derivedStatus || null,
      derivedStatus,
      statusConsistent,
      confidence: typeof level.confidence === 'number' ? level.confidence : null,
      source: level.source || null,
      sourceDetail: level.sourceDetail || null,
      reason: level.reason || null,
      label: level.label || null,
      score: typeof level.score === 'number' ? level.score : null,
      breakdown: level.breakdown || null,
      strengths: Array.isArray(level.strengths) ? level.strengths : [],
      weaknesses: Array.isArray(level.weaknesses) ? level.weaknesses : [],
    },
    sectorObservation: observationRow
      ? {
          day: observationRow.day || null,
          date: observationRow.date || null,
          type: observationRow.type || null,
          afai: typeof observationRow.afai === 'number' ? observationRow.afai : null,
          status: observationRow.status || null,
          confidence: typeof observationRow.confidence === 'number' ? observationRow.confidence : null,
          regime: observationRow.regime || null,
          sources: Array.isArray(observationRow.sources) ? observationRow.sources : [],
        }
      : null,
    trend: trendRows.map((f) => ({
      day: f.day || null,
      date: f.date || null,
      type: f.type || null,
      afai: typeof f.afai === 'number' ? f.afai : null,
      status: f.status || null,
      confidence: typeof f.confidence === 'number' ? f.confidence : null,
      regime: f.regime || null,
      sources: Array.isArray(f.sources) ? f.sources : [],
    })),
    weekly: weekly
      ? {
          drift: weekly.drift || null,
          driftLabel: weekly.driftLabel || null,
          driftValue: typeof weekly.driftValue === 'number' ? weekly.driftValue : null,
          forecastMethod: weekly.forecastMethod || null,
          forecastDisclaimer: weekly.forecastDisclaimer || null,
          reliableHorizon: typeof weekly.reliableHorizon === 'number' ? weekly.reliableHorizon : null,
          arrivalDetected: weekly.arrivalDetected === true,
          arrivalStrength: typeof weekly.arrivalStrength === 'number' ? weekly.arrivalStrength : null,
          arrivalDay: weekly.arrivalDay || null,
          regime: weekly.regime || null,
          regimeConfidence: weekly.regimeConfidence || null,
          gated: weekly.gated === true,
          fullDays: typeof weekly.fullDays === 'number' ? weekly.fullDays : null,
        }
      : null,
    scores: scores
      ? {
          score: typeof scores.score === 'number' ? scores.score : null,
          label: scores.label || null,
          reason: scores.reason || null,
          breakdown: scores.breakdown || null,
          strengths: Array.isArray(scores.strengths) ? scores.strengths : [],
          weaknesses: Array.isArray(scores.weaknesses) ? scores.weaknesses : [],
        }
      : null,
    weather,
    seasonOutlook: raw.seasonOutlook || null,
  };

  if (!snapshot.fresh) {
    return {
      ok: false,
      error: 'data_stale',
      detail: {
        observedAt,
        ageMinutes: age,
        maxDataAgeMinutes: maxAge,
        staleFlag: snapshot.staleFlag,
      },
      snapshot,
    };
  }
  if (!statusConsistent) {
    return { ok: false, error: 'status_inconsistent', snapshot };
  }
  return { ok: true, snapshot };
}

/** Lecture du snapshot depuis une URL (défaut : endpoint public live) ou un fichier. */
export async function loadRawSnapshot({ url = DEFAULT_SNAPSHOT_URL, file = null, fetchImpl = fetch } = {}) {
  if (file) {
    const text = fs.readFileSync(file, 'utf8');
    return { raw: JSON.parse(text), origin: `file:${file}` };
  }
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`snapshot_http_${res.status}`);
    err.code = 'snapshot_http_error';
    throw err;
  }
  const text = await res.text();
  return { raw: JSON.parse(text), origin: url };
}

/** Empreinte SHA-256 du snapshot (traçabilité du document produit). */
export function snapshotFingerprint(raw) {
  const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return crypto.createHash('sha256').update(json).digest('hex');
}
