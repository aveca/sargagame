'use strict';

const { evaluateConditionsFreshness } = require('./conditions-freshness.cjs');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

/**
 * Render the static /plages-sans-sargasses SEO index.
 * Beach verdicts are emitted only when the actual ERDDAP observation timestamp
 * is within the operational 900-minute SLA. updatedAt and dataAgeMinutes are
 * deliberately ignored because they can describe publication/cache age only.
 */
function renderCleanBeachIndex({
  payload,
  beaches,
  beachToSarg,
  slugify,
  now = Date.now(),
} = {}) {
  const freshness = evaluateConditionsFreshness(payload, null, now);
  const cleanByIsland = { mq: [], gp: [] };

  if (freshness.satelliteFresh && Array.isArray(beaches) && Array.isArray(payload?.levels)) {
    const levelsById = Object.fromEntries(
      payload.levels
        .filter(level => level && level.id != null)
        .map(level => [level.id, level])
    );

    for (const beach of beaches) {
      if (!beach || beach.id == null) continue;
      const slug = typeof slugify === 'function' ? slugify(beach.name || '') : '';
      const sargId = (beachToSarg && beachToSarg[beach.id]) || slug;
      const level = levelsById[sargId] || levelsById[beach.id];

      if (level && level.status === 'clean') {
        cleanByIsland[beach.island === 'gp' ? 'gp' : 'mq'].push({
          name: beach.name,
          commune: beach.commune,
          slug,
          score: typeof level.score === 'number' && Number.isFinite(level.score) ? level.score : null,
        });
      }
    }
  }

  for (const island of ['mq', 'gp']) {
    cleanByIsland[island].sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  const totalClean = cleanByIsland.mq.length + cleanByIsland.gp.length;
  const summary = freshness.satelliteFresh
    ? `<p><strong>${escapeHtml(freshness.satelliteLabel)}.</strong> Nombre de plages classées propres dans cette observation : <strong>${totalClean}</strong>. Les listes ci-dessous se rapportent à cet horodatage.</p>`
    : `<p><strong>${escapeHtml(freshness.satelliteLabel)}.</strong> La sélection des plages propres est suspendue jusqu'à une observation satellite récente et vérifiable. Les anciens statuts et scores ne sont pas présentés comme actuels.</p>`;

  const renderList = (items) => items.map(beach =>
    `<li><a href="/plages/${escapeHtml(beach.slug)}/">${escapeHtml(beach.name)}</a> — ${escapeHtml(beach.commune)}` +
    (beach.score != null ? ` · score ${beach.score}/100` : '') +
    '</li>'
  ).join('');

  const mqList = cleanByIsland.mq.length
    ? `<h2>Martinique — Plages classées propres dans la dernière observation</h2><ul>${renderList(cleanByIsland.mq)}</ul>`
    : '';
  const gpList = cleanByIsland.gp.length
    ? `<h2>Guadeloupe — Plages classées propres dans la dernière observation</h2><ul>${renderList(cleanByIsland.gp)}</ul>`
    : '';

  return `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1>` +
    summary + mqList + gpList +
    `<p><strong>Avant de choisir une plage :</strong> consultez la <a href="/carte-sargasses/">carte</a> et l'horodatage de la dernière observation. Les observations satellite sont intermittentes et ne confirment pas à elles seules l'état du sable.</p>` +
    `<p><a href="/previsions/">Prévisions 7 jours par plage</a> · <a href="/alertes/">Alertes push</a></p></article>`;
}

module.exports = { renderCleanBeachIndex };
