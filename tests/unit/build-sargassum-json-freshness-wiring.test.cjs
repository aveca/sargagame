'use strict';

/**
 * build-sargassum-json-freshness-wiring.test.cjs — garde la fraîcheur satellite
 * honnête au build. Le générateur du composite (scripts/build-sargassum-json.cjs)
 * DOIT appeler refreshSatellitePayload() sur la branche erddap-live pour que
 * stale/dataAgeMinutes soient recalculés depuis erddapTimestamp à CHAQUE build
 * (jamais depuis updatedAt, l'heure du run pipeline). Faute de câblage, un JSON
 * servi statique vieillit sans le dire : la fraîcheur affichée devient une
 * métadonnée bidon — exactement le défaut que le contrat interdit.
 *
 * Fonctionnel (payload cloné, maintenant fixé) : refreshSatellitePayload ne mute
 * QUE les métadonnées dataAgeMinutes/stale — aucune donnée scientifique
 * (levels/scores/weekly/erddapTimestamp/updatedAt) n'est touchée.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { refreshSatellitePayload } = require('../../scripts/lib/satellite-freshness.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const buildScript = fs.readFileSync(path.join(ROOT, 'scripts', 'build-sargassum-json.cjs'), 'utf-8');

let n = 0;
const t = (cond, label) => { n++; assert.ok(cond, label); };

// 1. Câblage du générateur du composite.
t(buildScript.includes("require('./lib/satellite-freshness.cjs')"),
  'build-sargassum-json.cjs importe le contrat satellite-freshness');
t(buildScript.includes('refreshSatellitePayload(existing)'),
  'build-sargassum-json.cjs recalcule stale/dataAgeMinutes au build (refreshSatellitePayload)');
// Le refresh doit être dans la branche erddap-live (données conservées), pas ailleurs.
t(/existing\.source === 'erddap-live'/.test(buildScript) &&
    buildScript.indexOf('refreshSatellitePayload(existing)') > buildScript.indexOf("existing.source === 'erddap-live'"),
  'le refresh est appelé sur la branche erddap-live (donnée réelle conservée)');
// Branche de repli : le « reference fallback » ne doit jamais prétendre à une observation.
t(/erddapTimestamp:\s*null/.test(buildScript) && /dataAgeMinutes:\s*null/.test(buildScript),
  'repli reference : erddapTimestamp/dataAgeMinutes null (aucune fraîcheur inventée)');

// 2. Contrat fonctionnel : seules les métadonnées changent, rien d'autre.
const now = Date.parse('2026-11-14T12:00:00.000Z'); // fixe (déterministe)
const payload = {
  source: 'erddap-live',
  updatedAt: '2026-11-14T06:00:00.000Z',
  erddapTimestamp: '2026-11-12T12:00:00.000Z', // 48 h avant `now` => stale (36 h)
  dataAgeMinutes: 999, // instantané figé périmé, doit être recalculé
  stale: false, // mensonge résiduel, doit être recalculé
  levels: [{ id: 'demo', afai: 0.11, status: 'clean' }],
  scores: { demo: { score: 77 } },
  weekly: { demo: { forecast: [] } },
  pipelineVersion: '3.1',
};
const snapshot = JSON.stringify(payload);
const refreshed = refreshSatellitePayload(payload, now);
t(refreshed === payload, 'refreshSatellitePayload mute le payload en place (API inchangée)');
t(refreshed.dataAgeMinutes === 2880, 'dataAgeMinutes recalculé depuis erddapTimestamp (48 h = 2880 min)');
t(refreshed.stale === true, 'stale recalculé (>= 36 h => true)');
t(JSON.stringify({ levels: refreshed.levels, scores: refreshed.scores, weekly: refreshed.weekly }) ===
    JSON.stringify({ levels: payload.levels, scores: payload.scores, weekly: payload.weekly }),
  'aucune donnée scientifique (levels/scores/weekly) modifiée');
t(refreshed.updatedAt === payload.updatedAt && refreshed.erddapTimestamp === payload.erddapTimestamp &&
    refreshed.source === payload.source && refreshed.pipelineVersion === payload.pipelineVersion,
  'updatedAt/erddapTimestamp/source/pipelineVersion inchangés');
// 3. JSON non-live : le refresh est un no-op (pas de fraîcheur fabriquée).
const reference = { source: 'reference', updatedAt: '2026-11-14T06:00:00.000Z', dataAgeMinutes: null };
t(JSON.stringify(refreshSatellitePayload(reference, now)) === JSON.stringify(reference),
  'payload non-erddap-live : refresh no-op (fail-closed)');

console.log(`BUILD_SARGASSUM_JSON_FRESHNESS_WIRING PASS (${n} assertions)`);
