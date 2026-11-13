'use strict';
/**
 * notify.cjs — notifications externes de la Factory V3 (fire-and-forget, jamais bloquant).
 *
 * Canaux :
 *  - Healthchecks.io (dead man's switch) : ping à chaque cycle réussi.
 *  - Discord webhook : événements intéressants uniquement, AVEC anti-spam :
 *      · cycleFailed : max 1 message / 30 min ;
 *      · prDetected  : une PR n'est signalée QU'UNE FOIS (état persisté sur disque,
 *        survit aux redémarrages du runner).
 *
 * Variables d'environnement (User scope, jamais dans le repo) :
 *  - HC_PING_URL          https://hc-ping.com/<uuid>
 *  - DISCORD_WEBHOOK_URL  https://discord.com/api/webhooks/<id>/<token>
 *
 * Garanties : aucune exception ne remonte à l'appelant — une panne de monitoring
 * ne doit JAMAIS casser un cycle de la factory.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PR_STATE_FILE = path.join(ROOT, '.ai', 'autopilot', 'notify-state.json');

const HC_PING_URL = process.env.HC_PING_URL || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

const CYCLE_FAIL_THROTTLE_MS = 30 * 60 * 1000; // max 1 alerte échec / 30 min
let lastCycleFailedNotify = 0;

// Garde-fou GLOBAL persisté : jamais plus d'1 message Discord / 3 min, même
// après redémarrages en boucle du watchdog (crash loop = pas de spam).
const GLOBAL_DISCORD_THROTTLE_MS = 3 * 60 * 1000;
function lastGlobalSendMs() {
  try {
    const s = JSON.parse(fs.readFileSync(PR_STATE_FILE, 'utf8'));
    return Number(s.lastDiscordSendMs) || 0;
  } catch (_) { return 0; }
}
function markGlobalSend() {
  try {
    const s = loadPrState();
    s.lastDiscordSendMs = Date.now();
    savePrState(s);
  } catch (_) {}
}

/** Couleurs Discord (int). */
const COLOR = {
  success: 0x22c55e, // vert
  info: 0x3b82f6,    // bleu
  warning: 0xf59e0b, // orange
  error: 0xef4444,   // rouge
};

function pingHealthchecks(suffix = '') {
  if (!HC_PING_URL) return;
  fetch(HC_PING_URL + suffix, { method: 'GET' })
    .then(r => { if (!r.ok) console.error(`[notify] healthchecks ping ${suffix || ''} → HTTP ${r.status}`); })
    .catch(e => console.error(`[notify] healthchecks ping erreur: ${e.message}`));
}

function notifyDiscord(payload) {
  if (!DISCORD_WEBHOOK_URL) return;
  // Anti-spam global persisté (sauf démarrage/arrêt explicites du runner).
  const bypass = payload.bypassThrottle === true;
  if (!bypass && Date.now() - lastGlobalSendMs() < GLOBAL_DISCORD_THROTTLE_MS) return;
  markGlobalSend();
  const level = payload.level || 'info';
  const embed = {
    title: payload.title || 'Factory V3',
    color: payload.color ?? COLOR[level] ?? COLOR.info,
    timestamp: new Date().toISOString(),
  };
  if (payload.description) embed.description = payload.description;
  if (Array.isArray(payload.fields) && payload.fields.length) embed.fields = payload.fields;
  fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Factory V3', embeds: [embed] }),
  })
    .then(r => { if (!r.ok) console.error(`[notify] discord → HTTP ${r.status}`); })
    .catch(e => console.error(`[notify] discord erreur: ${e.message}`));
}

function isConfigured() {
  return Boolean(HC_PING_URL || DISCORD_WEBHOOK_URL);
}

function channelsStatus() {
  return {
    healthchecks: HC_PING_URL ? 'SET' : 'NOT SET',
    discord: DISCORD_WEBHOOK_URL ? 'SET' : 'NOT SET',
  };
}

function runnerStarted(pid, modelSource) {
  notifyDiscord({
    bypassThrottle: true,
    level: 'success',
    title: '🟢 Factory V3 démarrée',
    description: 'Runner live 24/7 actif.',
    fields: [
      { name: 'PID', value: String(pid), inline: true },
      { name: 'Modèle', value: modelSource || 'inconnu', inline: true },
    ],
  });
}

function runnerStopped(reason) {
  notifyDiscord({
    bypassThrottle: true,
    level: 'error',
    title: '🔴 Factory V3 arrêtée',
    description: reason || 'Arrêt détecté. La tâche planifiée redémarrera au prochain logon.',
  });
}

/** Alerte échec — throttlée : max 1 / 30 min (anti-spam). */
function cycleFailed(cycleCount, consecutiveErrors, detail) {
  const now = Date.now();
  if (now - lastCycleFailedNotify < CYCLE_FAIL_THROTTLE_MS) return;
  lastCycleFailedNotify = now;
  notifyDiscord({
    level: 'warning',
    title: `⚠️ Échecs consécutifs (${consecutiveErrors}) au cycle ${cycleCount}`,
    description: (detail || '').slice(0, 1200) || 'Détail indisponible.',
    fields: [{ name: 'Prochaine alerte', value: 'Si new échec dans > 30 min', inline: false }],
  });
}

// ── État persisté des PR déjà signalées (survit aux redémarrages) ──
function loadPrState() {
  try { return JSON.parse(fs.readFileSync(PR_STATE_FILE, 'utf8')); } catch (_) { return {}; }
}
function savePrState(state) {
  try { fs.mkdirSync(path.dirname(PR_STATE_FILE), { recursive: true }); fs.writeFileSync(PR_STATE_FILE, JSON.stringify(state, null, 2)); } catch (_) {}
}

/** Détecte une PR dans le rapport latest.md du cycle. Retourne {number, line} ou null. */
function detectPrInReport(reportText) {
  if (!reportText) return null;
  const m = reportText.match(/^## PR\s*\n\s*-\s*(PR #(\d+)[^\n]*)/m);
  if (!m) return null;
  return { number: Number(m[2]), line: m[1].trim() };
}

/** Signal une PR UNE SEULE FOIS (état persisté sur disque). */
function prDetected(prNumber, prLine) {
  const state = loadPrState();
  const key = `pr_${prNumber}`;
  if (state[key] === 'notified') return false;
  state[key] = 'notified';
  savePrState(state);
  notifyDiscord({
    level: 'info',
    title: `📦 PR #${prNumber} détectée`,
    description: (prLine || '').slice(0, 1200),
    fields: [{ name: 'Pipeline', value: 'CI → certification gate → auto-merge → Cloudflare', inline: false }],
  });
  return true;
}

module.exports = {
  pingHealthchecks,
  notifyDiscord,
  isConfigured,
  channelsStatus,
  runnerStarted,
  runnerStopped,
  cycleFailed,
  detectPrInReport,
  prDetected,
  COLOR,
};
