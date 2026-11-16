/**
 * report-html.mjs — Rendu HTML du « Diagnostic Sargasses Express » (source du PDF).
 *
 * IDENTITÉ
 *   Palette golden-hour Sargasses Martinique (bg #FDFCF7, ink #0D0D0D, gold
 *   #E8A800, teal #009E8E) + polices auto-hébergées du repo (Anton, Bricolage
 *   Grotesque, JetBrains Mono) embarquées en base64 : le PDF est produit
 *   100 % LOCAL, sans appel réseau.
 *
 * HONNÊTETÉ (règle du moat)
 *   - dates/heures, sources et niveaux de confiance sont affichés ;
 *   - aucune observation n'est inventée : on ne restitue que le snapshot ;
 *   - le statut est présenté comme une MESURE SATELLITE INDIRECTE ;
 *   - les limites sont explicites (confiance, horizon fiable, pas de constat
 *     physique sur place).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIGILANCE_LABELS } from './data-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const FONT_DIR = path.join(ROOT, 'public', 'fonts');

const FONT_FILES = {
  anton: 'anton-1Ptgg87LROyAm3Kz-C8.woff2',
  bricolage: 'bricolagegrotesque-3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGGInHEVA.woff2',
  mono: 'jetbrainsmono-latin-500.woff2',
};

const STATUS_COLORS = {
  clean: { fg: '#166534', bg: '#DCFCE7', border: '#22C55E', icon: '✓' },
  moderate: { fg: '#7C4A03', bg: '#FEF3C7', border: '#B87A00', icon: '!' },
  avoid: { fg: '#8A2412', bg: '#FFEDD5', border: '#E8522A', icon: '▲' },
};

let _fontCss = null;

/** @font-face auto-hébergées (base64) — le PDF n'a besoin d'aucun réseau. */
export function loadFontCss() {
  if (_fontCss) return _fontCss;
  const face = (family, file, weight) => {
    const full = path.join(FONT_DIR, file);
    if (!fs.existsSync(full)) return '';
    const b64 = fs.readFileSync(full).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  };
  _fontCss = [
    face('Anton', FONT_FILES.anton, '400'),
    face('Bricolage Grotesque', FONT_FILES.bricolage, '300 800'),
    face('JetBrains Mono', FONT_FILES.mono, '500'),
  ].join('\n');
  return _fontCss;
}

// Entités HTML construites par code de caractère (évite tout littéral fragile).
const H_AMP = String.fromCharCode(38);
const H_LT = String.fromCharCode(60);
const H_GT = String.fromCharCode(62);
const H_QUOT = String.fromCharCode(34);
const H_APOS = String.fromCharCode(39);

export function escapeHtml(value) {
  return String(value ?? '')
    .split(H_AMP).join(H_AMP + 'amp;')
    .split(H_LT).join(H_LT + 'lt;')
    .split(H_GT).join(H_GT + 'gt;')
    .split(H_QUOT).join(H_QUOT + 'quot;')
    .split(H_APOS).join(H_APOS + '#39;');
}

function fmtNum(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Martinique', dateStyle: 'long' }).format(d);
  } catch {
    return escapeHtml(iso);
  }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'America/Martinique',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return escapeHtml(iso);
  }
}

function fmtHour(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'America/Martinique',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

/** Recommandations de communication : règles FIXES, dérivées du statut observé. */
export function buildRecommendations(snapshot) {
  const obs = snapshot?.observation || {};
  const status = String(obs.status || '');
  const afai = obs.afai;
  const horizon = snapshot?.weekly?.reliableHorizon;
  const list = [];

  if (status === 'clean') {
    list.push({
      title: 'Annoncer une situation favorable, datée',
      text: `La dernière observation satellite ne détecte pas de sargasses significantes sur le secteur (AFAI ${fmtNum(afai)}). Vous pouvez annoncer une situation favorable à vos clients, en citant systématiquement la date et l'heure de l'observation.`,
    });
  } else if (status === 'moderate') {
    list.push({
      title: 'Communiquer avec prudence',
      text: `La dernière observation satellite situe le secteur en présence modérée (AFAI ${fmtNum(afai)}). Privilégiez un message prudent : la situation évolue avec le vent et les courants, la position sur la plage peut différer du point satellite.`,
    });
  } else if (status === 'avoid') {
    list.push({
      title: 'Éviter d’annoncer une plage dégagée',
      text: `La dernière observation satellite signale une présence forte sur le secteur (AFAI ${fmtNum(afai)}). Ne communiquez pas une plage « propre » : préférez une information de prudence et orientez vers la carte de suivi en temps réel.`,
    });
  }

  list.push({
    title: 'Dater chaque communication',
    text: 'Indiquez la date et l’heure de l’observation satellites utilisée. Une information non datée est aging, donc fausse dans les heures qui suivent.',
  });
  list.push({
    title: 'Ne pas transformer une image en constat',
    text: 'Formulez « d’après l’observation satellite du … » et non « la plage est propre ». Le satellite mesure une présence dans la zone, pas la situation réelle d’un point de baignade.',
  });
  if (typeof horizon === 'number') {
    list.push({
      title: 'Rester sur le court terme',
      text: `La fiabilité de la tendance décroît au-delà de ${horizon} jour${horizon > 1 ? 's' : ''}. Pour la période au-delà, présentez la tendance comme une indication et renvoyez vers la carte actualisée.`,
    });
  }
  list.push({
    title: 'Répondre avec la donnée la plus récente',
    text: 'Si un client signale une observation de terrain, prioritize la carte en temps réel et la dernière observation publiée : ce document est un état daté, pas un flux permanent.',
  });

  return list;
}

function statusBadge(status) {
  const c = STATUS_COLORS[status] || { fg: '#0D0D0D', bg: '#F1F1EF', border: '#5A5A5A', icon: '•' };
  const label = VIGILANCE_LABELS[status] || (status ? status.toUpperCase() : 'NON DÉTERMINÉ');
  return `<span class="badge" style="color:${c.fg};background:${c.bg};border-color:${c.border}"><span aria-hidden="true">${c.icon}</span> ${escapeHtml(label)}</span>`;
}

function row(label, value, mono = false) {
  return `<tr><th>${escapeHtml(label)}</th><td${mono ? ' class="mono"' : ''}>${value}</td></tr>`;
}

/**
 * Corps HTML de l'email de livraison (en-tête de marque + chiffres clés).
 * Le PDF joint porte le diagnostic complet.
 */
export function renderDeliveryEmailHtml({ order = {}, sector = null, snapshot = {} } = {}) {
  const obs = snapshot.observation || {};
  const weekly = snapshot.weekly || {};
  const name = sector?.name || order.sector || 'votre secteur';
  const commune = sector?.commune ? ` · ${sector.commune}` : '';
  const status = String(obs.status || '');
  const badge = statusBadge(status);

  const rows = [
    ['Secteur', escapeHtml(name) + escapeHtml(commune)],
    ['Observation satellite', `<span class="mono">${escapeHtml(snapshot.observedAt || '—')}</span>`],
    ['Indice AFAI', `<span class="mono">${fmtNum(obs.afai)}</span>`],
    ['Niveau de vigilance', badge],
    ['Confiance de l’observation', `<span class="mono">${escapeHtml(obs.confidence ?? '—')}</span>/100`],
  ];

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FDFCF7;font-family:'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0D0D0D;">
<div style="max-width:560px;margin:0 auto;padding:20px 16px;">
  <div style="background:radial-gradient(120% 90% at 76% -15%, rgba(255,199,44,.30), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 60%,#0A1714 100%);border-radius:16px 16px 0 0;padding:26px 22px 22px;">
    <div style="font-size:11px;font-weight:800;color:#FFC72C;text-transform:uppercase;letter-spacing:.14em;margin-bottom:8px;">Sargasses Martinique · Diagnostic Express</div>
    <div style="font-family:Anton,Impact,'Arial Narrow',sans-serif;font-size:26px;line-height:1.08;color:#fff;">Votre diagnostic est prêt</div>
    <div style="font-size:13px;color:rgba(255,255,255,.66);margin-top:8px;">Diagnostic Sargasses Express — ${escapeHtml(name)}</div>
  </div>
  <div style="background:#fff;border:1px solid rgba(13,13,13,.12);border-top:0;border-radius:0 0 16px 16px;padding:22px;">
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Bonjour${order.client_name ? ' ' + escapeHtml(order.client_name) : ''},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Votre paiement est bien enregistré et le diagnostic concernant <strong>${escapeHtml(name)}</strong> est joint à cet e-mail.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${rows.map(([k, v]) => `<tr><th style="text-align:left;padding:6px 8px;background:#F7F5EF;font-size:13px;width:45%;">${escapeHtml(k)}</th><td style="padding:6px 8px;font-size:13px;">${v}</td></tr>`).join('')}
    </table>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.55;">Le PDF joint détaille les observations datées, les tendances, le niveau de vigilance, les limites des données satellitaires et les recommandations de communication pour votre établissement.</p>
    <div style="border-left:4px solid #E8A800;background:#FFF7E0;padding:10px 12px;border-radius:0 6px 6px 0;font-size:13px;line-height:1.5;">
      Une observation satellite est une mesure indirecte : elle ne constitue pas un constat physique sur place. La fiabilité de la tendance décroît au-delà de J+${escapeHtml(weekly.reliableHorizon ?? '—')}.
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#5A5A5A;line-height:1.5;">Données : ERDDAP (Copernicus Marine) via le pipeline Sargasses. Référence commande : <span style="font-family:'JetBrains Mono',monospace;">${escapeHtml(order.payment_id || '—')}</span>.</p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Rend le HTML complet du diagnostic.
 * @param {object} p { order, sector, snapshot, generatedAt, snapshotSha, snapshotUrl, ref }
 */
export function renderReportHtml(p = {}) {
  const order = p.order || {};
  const sector = p.sector || p.snapshot?.sector || {};
  const snapshot = p.snapshot || {};
  const obs = snapshot.observation || {};
  const weekly = snapshot.weekly || {};
  const scores = snapshot.scores || {};
  const weather = snapshot.weather || {};
  const generatedAt = p.generatedAt || new Date().toISOString();
  const ref = p.ref || order.payment_id || '—';
  const status = String(obs.status || '');

  const forecastRows = (snapshot.trend || [])
    .map(
      (f) => `<tr>
        <td>${escapeHtml(f.day || '—')}</td>
        <td class="mono">${escapeHtml(f.date || '—')}</td>
        <td>${escapeHtml(f.type === 'observation' ? 'Observation' : 'Tendance')}</td>
        <td class="mono">${fmtNum(f.afai)}</td>
        <td>${escapeHtml(f.status || '—')}</td>
        <td class="mono">${typeof f.confidence === 'number' ? f.confidence : '—'}</td>
        <td>${escapeHtml(f.regime || '—')}</td>
        <td class="small">${escapeHtml((f.sources || []).join(', ') || '—')}</td>
      </tr>`,
    )
    .join('');

  const breakdown = obs.breakdown || scores.breakdown || {};
  const breakdownItems = Object.entries(breakdown)
    .map(([k, v]) => `<div class="bar"><span class="bar-label">${escapeHtml(k)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></span></span><span class="bar-value mono">${escapeHtml(v)}</span></div>`)
    .join('');

  const reco = buildRecommendations(snapshot)
    .map((r) => `<li><strong>${escapeHtml(r.title)}.</strong> ${escapeHtml(r.text)}</li>`)
    .join('');

  const sectorObs = snapshot.sectorObservation;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Diagnostic Sargasses Express — ${escapeHtml(sector.name || order.sector || '')}</title>
<style>
${loadFontCss()}
@page { size: A4; margin: 14mm 13mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Bricolage Grotesque', system-ui, 'Segoe UI', sans-serif;
  background: #FDFCF7; color: #0D0D0D; font-size: 10.5pt; line-height: 1.5;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 9.5pt; }
.small { font-size: 8.5pt; color: #5A5A5A; }
header.brand {
  background: radial-gradient(120% 90% at 76% -15%, rgba(255,199,44,.30), rgba(255,199,44,0) 55%),
              linear-gradient(168deg, #0B2230 0%, #0D1E1C 60%, #0A1714 100%);
  color: #fff; padding: 18px 20px 16px; border-radius: 10px;
}
.eyebrow { font-size: 8.5pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #FFC72C; }
header.brand h1 { font-family: 'Anton', 'Arial Narrow', sans-serif; font-weight: 400; font-size: 26pt; line-height: 1.05; margin: 6px 0 4px; }
header.brand .sub { font-size: 9.5pt; color: rgba(255,255,255,.72); }
.ref { margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 8pt; color: rgba(255,255,255,.62); }
section { margin-top: 14px; }
h2 { font-family: 'Anton', 'Arial Narrow', sans-serif; font-weight: 400; font-size: 13pt; margin: 0 0 7px; padding-bottom: 4px; border-bottom: 2px solid #E8A800; letter-spacing: .01em; }
h3 { font-size: 10pt; margin: 10px 0 4px; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { text-align: left; padding: 5px 7px; border-bottom: 1px solid #E6E2D8; vertical-align: top; }
table.kv th { width: 38%; font-weight: 700; color: #0D0D0D; background: #F7F5EF; }
table.grid th { background: #0D1E1C; color: #fff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; }
table.grid td { font-size: 9pt; }
.callout { border-left: 4px solid #E8A800; background: #FFF7E0; padding: 8px 10px; border-radius: 0 6px 6px 0; margin-top: 8px; font-size: 9.5pt; }
.callout.teal { border-left-color: #009E8E; background: #E7F7F5; }
.callout.coral { border-left-color: #E8522A; background: #FFEDE6; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 999px; border: 1.5px solid; font-weight: 800; font-size: 10pt; letter-spacing: .04em; }
.bar { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.bar-label { width: 80px; font-size: 9pt; text-transform: capitalize; }
.bar-track { flex: 1; height: 7px; background: #EDE9DE; border-radius: 99px; overflow: hidden; }
.bar-fill { display: block; height: 100%; background: linear-gradient(90deg, #009E8E, #1EC8B0); }
.bar-value { width: 26px; text-align: right; }
ul { margin: 4px 0 0; padding-left: 18px; }
li { margin-bottom: 6px; }
.grid2 { display: flex; gap: 10px; }
.card { flex: 1; border: 1px solid #E6E2D8; border-radius: 8px; padding: 9px 11px; background: #fff; }
.card .k { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #5A5A5A; }
.card .v { font-family: 'Anton', sans-serif; font-size: 17pt; line-height: 1.1; margin-top: 2px; }
footer { margin-top: 16px; border-top: 1px solid #E6E2D8; padding-top: 8px; font-size: 8pt; color: #5A5A5A; }
.sources li { margin-bottom: 3px; }
</style>
</head>
<body>

<header class="brand">
  <div class="eyebrow">Sargasses Martinique · Diagnostic Express</div>
  <h1>${escapeHtml(sector.name || order.sector || 'Secteur')}</h1>
  <div class="sub">${escapeHtml([sector.commune, sector.island === 'mq' ? 'Martinique' : sector.island].filter(Boolean).join(' · '))}</div>
  <div class="ref">Référence ${escapeHtml(ref)} · Client ${escapeHtml(order.establishment || '—')} · Émis le ${escapeHtml(fmtDateTime(generatedAt))}</div>
</header>

<section>
  <h2>1 · Identification du secteur</h2>
  <table class="kv">
    ${row('Plage / secteur', escapeHtml(sector.name || order.sector || '—'))}
    ${row('Commune', escapeHtml(sector.commune || '—'))}
    ${row('Île', escapeHtml(sector.island === 'mq' ? 'Martinique' : sector.island || '—'))}
    ${row('Coordonnées', sector.lat != null && sector.lng != null ? `<span class="mono">${fmtNum(sector.lat, 5)}° N, ${fmtNum(Math.abs(sector.lng), 5)}° ${sector.lng < 0 ? 'O' : 'E'}</span>` : '—')}
    ${row('Identifiant satellite', `<span class="mono">${escapeHtml(snapshot.levelId || '—')}</span> <span class="small">(identifiant plage ${escapeHtml(sector.beachId || '—')})</span>`)}
    ${row('Statut de la commande', `<span class="mono">${escapeHtml(order.status || '—')}</span>`)}
  </table>
</section>

<section>
  <h2>2 · Dernières observations publiques disponibles</h2>
  <table class="kv">
    ${row('Observation satellite (horodatage ERDDAP)', `<span class="mono">${escapeHtml(snapshot.observedAt || '—')}</span><br><span class="small">soit le ${escapeHtml(fmtDateTime(snapshot.observedAt))} (heure locale Martinique)</span>`)}
    ${row('Relevé publié pour le secteur', sectorObs ? `${escapeHtml(sectorObs.day || '')} ${escapeHtml(sectorObs.date || '')} — AFAI <span class="mono">${fmtNum(sectorObs.afai)}</span>, statut ${escapeHtml(sectorObs.status || '—')}, confiance ${escapeHtml(sectorObs.confidence ?? '—')}<br><span class="small">Sources : ${escapeHtml((sectorObs.sources || []).join(', ') || '—')}</span>` : '—')}
    ${row('Source', `${escapeHtml(snapshot.source || '—')} <span class="small">(${escapeHtml(obs.source || '—')}${obs.sourceDetail ? ' · ' + escapeHtml(obs.sourceDetail) : ''})</span>`)}
    ${row('Indice AFAI', `<span class="mono">${fmtNum(obs.afai)}</span> <span class="small">(échelle 0–1 du pipeline)</span>`)}
    ${row('Niveau de confiance de l’observation', `<span class="mono">${escapeHtml(obs.confidence ?? '—')}</span><span class="small"> / 100</span>`)}
    ${row('Score de conditions', `<span class="mono">${escapeHtml(scores.score ?? obs.score ?? '—')}</span>${scores.label ? ` <span class="small">(${escapeHtml(scores.label)})</span>` : ''}`)}
    ${row('Interprétation du pipeline', escapeHtml(obs.reason || scores.reason || '—'))}
  </table>
  <div class="callout">
    <strong>Lecture satellite, pas constat de terrain.</strong> Cette observation mesure une présence de sargasses dans la zone satellite à la date et l’heure indiquées. Elle ne décrit pas l’état d’un point de baignade précis et ne remplace pas un relevé sur place.
  </div>
</section>

<section>
  <h2>3 · Synthèse des tendances</h2>
  ${forecastRows
    ? `<table class="grid">
        <thead><tr><th>Jour</th><th>Date</th><th>Type</th><th>AFAI</th><th>Statut</th><th>Conf.</th><th>Régime</th><th>Sources</th></tr></thead>
        <tbody>${forecastRows}</tbody>
      </table>`
    : '<p class="small">Aucune tendance sectorielle publiée dans le snapshot consulté.</p>'}
  <table class="kv" style="margin-top:8px">
    ${row('Tendance générale', `${escapeHtml(weekly.driftLabel || weekly.drift || '—')}${typeof weekly.driftValue === 'number' ? ` <span class="small">(Δ ${fmtNum(weekly.driftValue)} AFAI)</span>` : ''}`)}
    ${row('Méthode', escapeHtml(weekly.forecastMethod || '—'))}
    ${row('Horizon fiable', weekly.reliableHorizon != null ? `<span class="mono">J+${escapeHtml(weekly.reliableHorizon)}</span>` : '—')}
    ${row('Arrivée détectée', weekly.arrivalDetected ? `Oui${weekly.arrivalDay ? ` (${escapeHtml(weekly.arrivalDay)})` : ''}` : 'Non')}
    ${row('Avertissement pipeline', escapeHtml(weekly.forecastDisclaimer || '—'))}
  </table>
</section>

<section>
  <h2>4 · Niveau de vigilance</h2>
  <p style="margin:6px 0 4px">${statusBadge(status)} <span class="small">— niveau déduit de l’observation satellite du ${escapeHtml(fmtDateTime(snapshot.observedAt))} (AFAI ${fmtNum(obs.afai)})</span></p>
  <div class="grid2">
    <div class="card">
      <div class="k">Météo / mer (ile)</div>
      <div class="v">${escapeHtml(weather.sst != null ? `${fmtNum(weather.sst, 1)} °C` : '—')}</div>
      <div class="small">température de mer · vent ${escapeHtml(weather.wind_speed ?? '—')} km/h · houle ${escapeHtml(weather.wave_height ?? '—')} m · UV ${escapeHtml(weather.uv_index ?? '—')}</div>
    </div>
    <div class="card">
      <div class="k">Score de conditions</div>
      <div class="v">${escapeHtml(scores.score ?? obs.score ?? '—')}</div>
      <div class="small">${escapeHtml(scores.label || '')} — ${escapeHtml(scores.reason || obs.reason || '')}</div>
    </div>
  </div>
  ${breakdownItems ? `<h3>Décomposition du score</h3>${breakdownItems}` : ''}
</section>

<section>
  <h2>5 · Limites et incertitudes</h2>
  <ul>
    <li><strong>Mesure indirecte.</strong> Le satellite détecte une biomasse de sargasses dans une maille, pas la situation d’une plage ou d’une zone de baignade.</li>
    <li><strong>Confiance de l’observation :</strong> <span class="mono">${escapeHtml(obs.confidence ?? '—')}</span>/100. Une confiance moyenne signifie que la détection est possible mais pas certaine.</li>
    <li><strong>Horizon fiable :</strong> <span class="mono">J+${escapeHtml(weekly.reliableHorizon ?? '—')}</span>. Au-delà, la tendance devient une indication et non une prévision fiable.</li>
    <li><strong>Fraîcheur :</strong> l’observation utilisée date du ${escapeHtml(fmtDateTime(snapshot.observedAt))} (âge ${escapeHtml(snapshot.dataAgeMinutes ?? '—')} min à l’émission du document, seuil ${escapeHtml(snapshot.maxDataAgeMinutes ?? '—')} min).</li>
    <li><strong>Dérive possible.</strong> Le vent, les courants et les marées déplacent les sargasses entre l’heure de l’observation et le moment de la baignade.</li>
    <li><strong>Couverture.</strong> Les zones masquées par la nuages ou hors champ satellite ne sont pas renseignées ; une absence de détection n’est pas une garantie d’absence de sargasses.</li>
  </ul>
</section>

<section>
  <h2>6 · Recommandations de communication pour l’établissement</h2>
  <ul>${reco}</ul>
</section>

<section>
  <h2>7 · Sources et traçabilité</h2>
  <ul class="sources">
    <li>Donnée satellite : ERDDAP (Copernicus Marine) via le pipeline Sargasses — <span class="mono">${escapeHtml(p.snapshotUrl || 'https://sargasses-martinique.com/api/copernicus/sargassum.json')}</span></li>
    <li>Horodatage de l’observation : <span class="mono">${escapeHtml(snapshot.observedAt || '—')}</span></li>
    <li>Publication du pipeline : <span class="mono">${escapeHtml(snapshot.updatedAt || '—')}</span>${snapshot.pipelineVersion ? ` (version ${escapeHtml(snapshot.pipelineVersion)})` : ''}</li>
    <li>Empreinte SHA-256 du snapshot : <span class="mono">${escapeHtml((p.snapshotSha || '').slice(0, 32) || '—')}…</span></li>
    <li>Document émis le : <span class="mono">${escapeHtml(generatedAt)}</span> — référence commande <span class="mono">${escapeHtml(ref)}</span></li>
  </ul>
</section>

<footer>
  Sargasses Martinique · Diagnostic Sargasses Express — prestation ponctuelle sur un secteur géographique, réalisée à partir des données satellite publiques ERDDAP.
  Aucune observation n’a été inventée : chaque valeur de ce document provient du snapshot daté ci-dessus.
  Les recommandations sont des indications de communication, pas un avis meteorologique officiel.
</footer>

</body>
</html>`;
}
