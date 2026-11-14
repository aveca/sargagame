'use strict';
/**
 * Factory V3 — Classifieur d'échecs de modèles IA.
 *
 * Règle P0 : on ne change JAMAIS de modèle pour une simple erreur de code.
 * On change de modèle uniquement pour une indisponibilité de quota / débit /
 * fournisseur, qui est un problème d'INFRASTRUCTURE et non de tâche.
 *
 * Catégories :
 *   DAILY_QUOTA_EXHAUSTED  quota journalier épuisé (free tier) → cooldown jusqu'à minuit UTC
 *   QUOTA_CREDIT           erreur de crédit / HTTP 402 / paiement requis
 *   RATE_LIMITED           HTTP 429 / quota horaire ou court → cooldown court
 *   PROVIDER_UNAVAILABLE   fournisseur HS / modèle surchargé / 5xx / timeout réseau
 *   MODEL_INVALID          le modèle demandé n'existe pas ou n'est pas accessible
 *   TIMEOUT                le modèle n'a produit aucune sortie dans le délai
 *   CODE_ERROR             erreur de programmation/tâche (PAS de bascule)
 *   TECHNICAL_ERROR        erreur CLI/technique non identifiée (bascule autorisée, cooldown court)
 *   UNKNOWN                inconnu → treated as TECHNICAL_ERROR (bascule autorisée)
 */

const CATEGORY = {
  DAILY_QUOTA_EXHAUSTED: 'DAILY_QUOTA_EXHAUSTED',
  QUOTA_CREDIT: 'QUOTA_CREDIT',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MODEL_INVALID: 'MODEL_INVALID',
  TIMEOUT: 'TIMEOUT',
  CODE_ERROR: 'CODE_ERROR',
  TECHNICAL_ERROR: 'TECHNICAL_ERROR',
  UNKNOWN: 'UNKNOWN',
};

const SIGNATURES = [
  // --- Quota journalier (free tier épuisé) -------------------------------
  {
    category: CATEGORY.DAILY_QUOTA_EXHAUSTED,
    quotaType: 'daily',
    re: /daily\s+(free\s+)?(messages?|requests?|credits?|tokens?|quota|limit)[^\n]{0,80}(exhaust|exceeded|used up|limit reached|reached)/i,
  },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /free\s+(tier|tokens?|messages?|requests?)[^\n]{0,60}(exhaust|exceeded|depleted)/i },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /(quota|limit)[^\n]{0,40}exceeded[^\n]{0,40}(daily|today|per day|24h|24 h)/i },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /insufficient\s+quota/i },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /(you have|your)\s+(daily|free)[^\n]{0,60}(quota|limit|allowance)/i },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /quota[^\n]{0,30}exhausted/i },
  { category: CATEGORY.DAILY_QUOTA_EXHAUSTED, quotaType: 'daily', re: /daily[^\n]{0,40}(quota|limit)[^\n]{0,40}(exhaust|exceeded|reached|used)/i },

  // --- Crédit / paiement (on ne bascule PAS vers un modèle payant) ------
  { category: CATEGORY.QUOTA_CREDIT, quotaType: 'credit', re: /payment\s+required/i },
  { category: CATEGORY.QUOTA_CREDIT, quotaType: 'credit', re: /insufficient\s+(credit|balance|funds)/i },
  { category: CATEGORY.QUOTA_CREDIT, quotaType: 'credit', re: /credit\s+balance\s+is\s+too\s+low/i },
  { category: CATEGORY.QUOTA_CREDIT, quotaType: 'credit', re: /billing|out\s+of\s+credits?/i },
  { category: CATEGORY.QUOTA_CREDIT, quotaType: 'credit', re: /\b402\b/ },

  // --- Rate limit / quota court ----------------------------------------
  { category: CATEGORY.RATE_LIMITED, quotaType: 'short_term', re: /rate[\s_-]?limit/i },
  { category: CATEGORY.RATE_LIMITED, quotaType: 'short_term', re: /too\s+many\s+requests/i },
  { category: CATEGORY.RATE_LIMITED, quotaType: 'short_term', re: /\b429\b/ },
  { category: CATEGORY.RATE_LIMITED, quotaType: 'hourly', re: /(quota|limit)[^\n]{0,40}exceeded[^\n]{0,40}(hour|per hour|60\s*min)/i },
  { category: CATEGORY.RATE_LIMITED, quotaType: 'short_term', re: /overloaded\s+with\s+requests/i },

  // --- Fournisseur / réseau ---------------------------------------------
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /provider[^\n]{0,30}(unavailable|temporarily\s+unavailable|down)/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /model[^\n]{0,30}overloaded/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /service\s+unavailable/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /bad\s+gateway/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /gateway\s+time-?out/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /\b50[234]\b/ },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket\s+hang\s+up/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /unexpected\s+server\s+error/i },
  { category: CATEGORY.PROVIDER_UNAVAILABLE, quotaType: 'none', re: /\b(50[0-9])\s+(internal\s+server|bad\s+gateway|gateway)/i },

  // --- Modèle inexistant / non accessible --------------------------------
  { category: CATEGORY.MODEL_INVALID, quotaType: 'none', re: /model[^\n]{0,40}(not\s+found|does\s+not\s+exist|unknown|invalid|not\s+available|no\s+such)/i },
  { category: CATEGORY.MODEL_INVALID, quotaType: 'none', re: /unknown\s+model|model_not_found|no\s+such\s+model/i },
  { category: CATEGORY.MODEL_INVALID, quotaType: 'none', re: /provider[^\n]{0,30}(not\s+configured|not\s+authenticated|missing\s+credentials)/i },

  // --- Erreur de programmation / tâche (PAS de bascule) ------------------
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /SyntaxError|ReferenceError|TypeError:\s|AssertionError|RangeError/ },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /Cannot\s+find\s+module|ENOENT|EACCES|EPERM/ },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\bnpm\s+(ERR!|error)\b/i },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\b(test|tests|spec)\s+(failed|failure)\b/i },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\bFAILED\b[^\n]{0,40}(assert|expect|test)/i },
];

// Signatures d'erreur de code : si détectées → aucune bascule de modèle.
const CODE_ERROR_SIGNATURES = SIGNATURES.filter((s) => s.category === CATEGORY.CODE_ERROR).map((s) => s.re);

function isCodeError(text) {
  if (!text) return false;
  return CODE_ERROR_SIGNATURES.some((re) => re.test(text));
}

function nextUtcMidnight(from = Date.now()) {
  const d = new Date(from);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5, 0, 0);
  return new Date(next).toISOString();
}

function nextUtcHour(from = Date.now()) {
  const d = new Date(from);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1, 2, 0, 0);
  return new Date(next).toISOString();
}

/**
 * Extrait le message d'erreur le plus utile depuis les événements OpenCode
 * (format réel : {"type":"error","error":{"name":"...","data":{"message":"..."}}}).
 */
function extractErrorText(events) {
  const chunks = [];
  for (const ev of events || []) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.type === 'error') {
      const e = ev.error || {};
      const data = e.data || {};
      chunks.push(String(e.name || 'Error'));
      if (data.message) chunks.push(String(data.message));
      if (data.statusCode) chunks.push('HTTP ' + data.statusCode);
      if (data.status) chunks.push('HTTP ' + data.status);
      if (data.ref) chunks.push('ref=' + data.ref);
      if (data.body) chunks.push(typeof data.body === 'string' ? data.body : JSON.stringify(data.body));
    }
    if (ev.type === 'step_finish' && ev.reason && ev.reason !== 'stop') {
      chunks.push('step_finish reason=' + ev.reason);
    }
  }
  return chunks.join(' | ');
}

/**
 * Classifie un échec d'exécution de modèle.
 * @param {object} p
 * @param {number|null} p.exitCode
 * @param {string} p.stdout
 * @param {string} p.stderr
 * @param {Array} p.events      événements JSON parsés (opencode --format json)
 * @param {boolean} p.timedOut
 * @param {boolean} p.idleTimedOut
 * @param {number} p.consecutiveFailures nombre d'échecs consécutifs déjà connus
 * @param {object} p.cooldowns {dailyMs, hourlyMs, rateMs, providerMs, technicalMs}
 */
function classifyFailure(p = {}) {
  const stdout = String(p.stdout || '');
  const stderr = String(p.stderr || '');
  const eventText = extractErrorText(p.events);
  const text = [eventText, stdout, stderr].filter(Boolean).join('\n');
  const cd = Object.assign(
    { dailyMs: 24 * 60 * 60 * 1000, hourlyMs: 60 * 60 * 1000, rateMs: 2 * 60 * 1000, providerMs: 10 * 60 * 1000, technicalMs: 2 * 60 * 1000 },
    p.cooldowns || {}
  );

  // 1) Erreur de code explicite → jamais de bascule de modèle.
  if (isCodeError(eventText) || isCodeError(stderr)) {
    return {
      category: CATEGORY.CODE_ERROR,
      switchModel: false,
      quotaType: 'none',
      cooldownMs: 0,
      resetAt: null,
      reason: 'Erreur de programmation/tâche détectée — pas de changement de modèle (conformément au contrat P0).',
      evidence: { eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
    };
  }

  // 2) Timeout (aucune sortie / délai dépassé) → indisponibilité, on bascule.
  if (p.idleTimedOut || p.timedOut) {
    return {
      category: CATEGORY.TIMEOUT,
      switchModel: true,
      quotaType: 'none',
      cooldownMs: cd.providerMs,
      resetAt: new Date(Date.now() + cd.providerMs).toISOString(),
      reason: p.idleTimedOut
        ? 'Aucune sortie du modèle pendant la fenêtre d\'inactivité (hang fournisseur) — bascule requise.'
        : 'Délai d\'exécution dépassé — bascule requise.',
      evidence: { eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
    };
  }

  // 3) Signatures de quota / fournisseur (l'ordre du tableau est prioritaire).
  for (const sig of SIGNATURES) {
    if (sig.re.test(text)) {
      const quotaType = sig.quotaType || 'none';
      let cooldownMs = cd.providerMs;
      let resetAt = null;
      if (quotaType === 'daily') {
        cooldownMs = cd.dailyMs;
        resetAt = nextUtcMidnight();
      } else if (quotaType === 'hourly') {
        cooldownMs = cd.hourlyMs;
        resetAt = nextUtcHour();
      } else if (quotaType === 'short_term') {
        const n = Math.max(1, p.consecutiveFailures || 1);
        cooldownMs = Math.min(cd.rateMs * Math.pow(2, n - 1), 30 * 60 * 1000);
        resetAt = new Date(Date.now() + cooldownMs).toISOString();
      } else if (quotaType === 'credit') {
        cooldownMs = cd.dailyMs;
        resetAt = null;
      }
      return {
        category: sig.category,
        switchModel: true,
        quotaType,
        cooldownMs,
        resetAt,
        reason: `${sig.category} détecté (${quotaType}) — bascule de modèle requise.`,
        evidence: {
          matched: String(sig.re),
          eventText: eventText.slice(0, 800),
          stderrTail: stderr.slice(-800),
          stdoutTail: stdout.slice(-800),
        },
      };
    }
  }

  // 4) Erreur technique inconnue → bascule autorisée mais cooldown court.
  const technical = {
    category: CATEGORY.TECHNICAL_ERROR,
    switchModel: true,
    quotaType: 'none',
    cooldownMs: cd.technicalMs,
    resetAt: new Date(Date.now() + cd.technicalMs).toISOString(),
    reason: 'Erreur technique non identifiée — bascule vers un autre modèle, sans pénalité longue.',
    evidence: { eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800), exitCode: p.exitCode },
  };
  return technical;
}

module.exports = {
  CATEGORY,
  SIGNATURES,
  classifyFailure,
  extractErrorText,
  isCodeError,
  nextUtcMidnight,
  nextUtcHour,
};
