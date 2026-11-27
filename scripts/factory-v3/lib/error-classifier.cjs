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
  AUTH_ERROR: 'AUTH_ERROR',
  CONTENT_SAFETY_UNAVAILABLE: 'CONTENT_SAFETY_UNAVAILABLE',
  RESULT_NOT_PRODUCED: 'RESULT_NOT_PRODUCED',
  MODEL_MISMATCH: 'MODEL_MISMATCH',
  PROVIDER_MISMATCH: 'PROVIDER_MISMATCH',
  COST_VIOLATION: 'COST_VIOLATION',
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

  // --- Erreur de programmation / tâche (PAS de bascule) ------------------
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /SyntaxError|ReferenceError|TypeError:\s|AssertionError|RangeError/ },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /Cannot\s+find\s+module|ENOENT|EACCES|EPERM/ },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\bnpm\s+(ERR!|error)\b/i },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\b(test|tests|spec)\s+(failed|failure)\b/i },
  { category: CATEGORY.CODE_ERROR, quotaType: 'none', re: /\bFAILED\b[^\n]{0,40}(assert|expect|test)/i },

  // --- Filtrage de sécurité indisponible --------------------------------
  // Le contrôle de sécurité n'est JAMAIS désactivé : on réessaie UNE fois
  // (différé), puis on bascule vers un autre modèle.
  { category: CATEGORY.CONTENT_SAFETY_UNAVAILABLE, quotaType: 'none', re: /content\s+safety[^\n]{0,40}(unavailable|not\s+available|disabled|temporarily)/i },
  { category: CATEGORY.CONTENT_SAFETY_UNAVAILABLE, quotaType: 'none', re: /safety\s+(screening|check|filter|system)[^\n]{0,40}(unavailable|down|temporarily|error)/i },
  { category: CATEGORY.CONTENT_SAFETY_UNAVAILABLE, quotaType: 'none', re: /screening\s+(is\s+)?(unavailable|not\s+available)/i },
  { category: CATEGORY.CONTENT_SAFETY_UNAVAILABLE, quotaType: 'none', re: /moderation\s+(service|endpoint)[^\n]{0,30}(unavailable|error)/i },

  // --- Authentification / autorisation -----------------------------------
  { category: CATEGORY.AUTH_ERROR, quotaType: 'none', re: /\b(401|403)\b/ },
  { category: CATEGORY.AUTH_ERROR, quotaType: 'none', re: /unauthorized|forbidden|invalid[_\s-]?(api[_ -]?key|token|credential)/i },
  { category: CATEGORY.AUTH_ERROR, quotaType: 'none', re: /authentication[^\n]{0,30}(failed|required|error)/i },
  { category: CATEGORY.AUTH_ERROR, quotaType: 'none', re: /not\s+authenticated|missing\s+(api[_ -]?key|credentials)/i },
  { category: CATEGORY.AUTH_ERROR, quotaType: 'none', re: /provider[^\n]{0,30}(not\s+configured|not\s+authenticated|missing\s+credentials)/i },
];

/**
 * Extrait un `Retry-After` (secondes ou date HTTP) → millisecondes.
 */
function parseRetryAfter(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 0 ? null : Math.round(value * 1000);
  }
  const s = String(value).trim();
  if (!s) return null;
  const seconds = s.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)?$/i);
  if (seconds) return Number(seconds[1]) * 1000;
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const delta = t - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

/**
 * Extrait une heure de réinitialisation connue (`resets at`, `reset in 1h`,
 * `quota resets 2026-11-15T00:00:00Z`) → ISO ou null.
 */
function parseKnownReset(text) {
  const s = String(text || '');
  if (!s) return null;
  // ISO explicite : uniquement s'il s'agit d'un RESET de quota. Sans cette
  // condition, le timestamp courant des logs OpenCode (`timestamp=...`) serait
  // pris à tort pour une heure de réinitialisation.
  if (/(quota|limit|reset|allowance|renew)/i.test(s)) {
    const iso = s.match(/\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)/i);
    if (iso) {
      const t = Date.parse(iso[1].replace(' ', 'T'));
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
  }
  // "resets in 3600 seconds" / "reset in 2h30m" : toutes les unités sont
  // additionnées, sans confondre un timestamp de log avec un reset.
  const anchor = s.match(/reset(?:s)?\s+(?:in|after)\s+/i);
  if (anchor) {
    const window = s.slice(anchor.index, anchor.index + 96);
    const units = Array.from(window.matchAll(/(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/gi));
    let totalMs = 0;
    for (const unit of units.slice(0, 4)) {
      const n = Number(unit[1]);
      const label = unit[2].toLowerCase();
      const mult = label.startsWith('s') ? 1000
        : label.startsWith('m') ? 60000
          : label.startsWith('h') ? 3600000
            : 86400000;
      totalMs += n * mult;
    }
    if (totalMs > 0) return new Date(Date.now() + totalMs).toISOString();
  }
  return null;
}

/**
 * Extrait les informations HTTP utiles : code, Retry-After, reset connu.
 * Sources : événement d'erreur OpenCode (data.statusCode / data.headers /
 * data.retryAfter / data.body), stdout et stderr.
 */
function extractHttpInfo(events, stdout, stderr) {
  const out = { statusCode: null, retryAfterMs: null, knownResetAt: null, retryAfterRaw: null };
  const considerRetryAfter = (raw) => {
    if (raw == null) return;
    const parsed = parseRetryAfter(raw);
    if (parsed == null) return;
    // Plusieurs événements/headers peuvent exposer des délais différents.
    // On conserve le PLUS LONG : raccourcir le Retry-After martellerait le
    // fournisseur et viole le contrat de reprise stricte.
    if (out.retryAfterMs == null || parsed > out.retryAfterMs) {
      out.retryAfterMs = parsed;
      out.retryAfterRaw = raw;
    }
  };
  const consider = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const d = obj.data || obj;
    const status = d.statusCode != null ? d.statusCode : (d.status != null && !Number.isNaN(Number(d.status)) ? d.status : null);
    if (status != null && Number.isFinite(Number(status))) out.statusCode = Number(status);
    const headers = d.headers || d.responseHeaders || null;
    if (headers && typeof headers === 'object') {
      for (const k of Object.keys(headers)) {
        if (/^retry[-_]?after$/i.test(k)) considerRetryAfter(headers[k]);
      }
    }
    if (d.retryAfter != null) considerRetryAfter(d.retryAfter);
    if (d.resetAt || d.reset_at) {
      const rawReset = d.resetAt || d.reset_at;
      const direct = Date.parse(rawReset);
      const r = Number.isFinite(direct) ? new Date(direct).toISOString() : parseKnownReset(rawReset);
      if (r) out.knownResetAt = r;
    }

    // Certains fournisseurs encodent le statut et le Retry-After uniquement
    // dans le message ou le body de l'erreur.
    const messageText = [
      typeof d.message === 'string' ? d.message : '',
      typeof d.body === 'string' ? d.body : (d.body ? JSON.stringify(d.body) : ''),
    ].filter(Boolean).join('\n');
    if (messageText) {
      if (out.statusCode == null) {
        const status = messageText.match(/\bHTTP\s*(\d{3})\b/i)
          || messageText.match(/\bstatus(?:Code)?["'\s:=]{1,6}(\d{3})\b/i);
        if (status) out.statusCode = Number(status[1]);
      }
      const retry = messageText.match(/retry[-_ ]?after["'\s:=]{1,6}([^\r\n"']+)/i);
      if (retry) considerRetryAfter(retry[1].trim());
      if (out.knownResetAt == null) {
        const reset = parseKnownReset(messageText);
        if (reset) out.knownResetAt = reset;
      }
    }
  };

  for (const ev of events || []) {
    if (ev && ev.type === 'error') consider(ev.error || ev);
  }

  const text = [stdout, stderr].filter(Boolean).join('\n');
  const m = text.match(/retry[-_ ]?after["'\s:=]{1,6}([^\r\n"']+)/i);
  if (m) considerRetryAfter(m[1].trim());
  if (out.knownResetAt == null) {
    const r = parseKnownReset(text);
    if (r) out.knownResetAt = r;
  }
  if (out.statusCode == null) {
    const m = text.match(/\bHTTP\s*(\d{3})\b/i) || text.match(/\bstatus(?:Code)?["'\s:=]{1,6}(\d{3})\b/i);
    if (m) out.statusCode = Number(m[1]);
  }
  return out;
}

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

function findSignature(category, text) {
  return SIGNATURES.find((sig) => sig.category === category && sig.re.test(text)) || null;
}

/** Retourne l'ISO le plus tardif parmi plusieurs limites temporelles. */
function latestIso(values) {
  const dates = (values || [])
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
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
 * Construit la réponse de classification pour une catégorie donnée.
 */
function buildClassification(category, opts) {
  const {
    quotaType = 'none', cooldownMs = 0, resetAt = null, reason = '',
    evidence = {}, httpStatus = null, retryAfterMs = null, knownResetAt = null,
    transient = false, providerLimited = false, modelSpecific = false,
  } = opts || {};
  return {
    category,
    // Une erreur de code ne change JAMAIS de modèle. Une erreur d'authentification
    // ne se rejoue pas sur le même modèle, mais un autre fournisseur peut être
    // tenté : elle autorise donc la bascule (sans retry).
    switchModel: category !== CATEGORY.CODE_ERROR && category !== CATEGORY.COST_VIOLATION,
    quotaType,
    cooldownMs,
    resetAt,
    reason,
    httpStatus,
    retryAfterMs,
    knownResetAt,
    transient,
    providerLimited,
    modelSpecific,
    evidence,
  };
}

/**
 * Classifie un échec d'exécution de modèle.
 *
 * ORDRE DE PRIORITÉ (le premier qui matche gagne) :
 *   1. erreur de code      → aucune bascule, aucun retry
 *   2. timeout              → bascule
 *   3. code HTTP explicite  → 429 / 402 / 401-403
 *   4. safety screening     → UNE reprise différée, puis bascule
 *   5. quota journalier / crédit
 *   6. rate limit (texte)
 *   7. modèle inexistant
 *   8. authentification
 *   9. fournisseur / réseau (5xx…)
 *  10. erreur technique inconnue
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
  const http = extractHttpInfo(p.events, stdout, stderr);
  const knownResetAt = http.knownResetAt;

  // 1) Erreur de code explicite → jamais de bascule de modèle. stdout est
  // inclus : certains runners y écrivent le traceback complet tandis que le
  // stderr ne contient que le message générique du fournisseur.
  if (isCodeError(text)) {
    return buildClassification(CATEGORY.CODE_ERROR, {
      reason: 'Erreur de programmation/tâche détectée — pas de changement de modèle (conformément au contrat P0).',
      evidence: {
        eventText: eventText.slice(0, 800),
        stdoutTail: stdout.slice(-800),
        stderrTail: stderr.slice(-800),
      },
      httpStatus: http.statusCode,
    });
  }

  // 2) Timeout (aucune sortie / délai dépassé) → indisponibilité, on bascule.
  if (p.idleTimedOut || p.timedOut) {
    return buildClassification(CATEGORY.TIMEOUT, {
      cooldownMs: cd.providerMs,
      resetAt: new Date(Date.now() + cd.providerMs).toISOString(),
      reason: p.idleTimedOut
        ? 'Aucune sortie du modèle pendant la fenêtre d\'inactivité (hang fournisseur) — bascule requise.'
        : 'Délai d\'exécution dépassé — bascule requise.',
      evidence: { eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      transient: true,
      providerLimited: true,
    });
  }

  // 3) Signatures sémantiques TERMINALES avant le code HTTP générique.
  // Un quota journalier peut être encodé en HTTP 429 et le safety screening
  // peut répondre 503 : le code HTTP seul ne doit jamais transformer ces
  // erreurs en trois retries génériques.
  const dailySig = findSignature(CATEGORY.DAILY_QUOTA_EXHAUSTED, text);
  if (dailySig) {
    let cooldownMs;
    let resetAt = knownResetAt;
    if (knownResetAt) {
      const known = Date.parse(knownResetAt);
      cooldownMs = Number.isFinite(known) ? Math.max(0, known - Date.now()) : cd.dailyMs;
    } else {
      const n = Math.max(1, p.consecutiveFailures || 1);
      cooldownMs = Math.min(cd.rateMs * Math.pow(2, n - 1), 60 * 60 * 1000);
      resetAt = new Date(Date.now() + cooldownMs).toISOString();
    }
    return buildClassification(CATEGORY.DAILY_QUOTA_EXHAUSTED, {
      quotaType: 'daily',
      cooldownMs,
      resetAt,
      reason: 'Quota journalier épuisé — aucun retry immédiat, cooldown jusqu\'au reset connu (ou progressif borné).',
      evidence: { matched: String(dailySig.re), http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: false,
      providerLimited: false,
      modelSpecific: true,
    });
  }

  const creditSig = findSignature(CATEGORY.QUOTA_CREDIT, text);
  if (creditSig) {
    return buildClassification(CATEGORY.QUOTA_CREDIT, {
      quotaType: 'credit',
      cooldownMs: cd.dailyMs,
      resetAt: knownResetAt,
      reason: 'Crédit insuffisant / paiement requis — aucun achat de crédit sans autorisation.',
      evidence: { matched: String(creditSig.re), http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: false,
      providerLimited: true,
      modelSpecific: false,
    });
  }

  // 4) Authentification : aucun retry, mais failover vers un autre fournisseur.
  // Le statut HTTP 401/403 prime sur le texte safety : un moderation body
  // générique ne doit jamais transformer une erreur d'auth en retry.
  const authSig = findSignature(CATEGORY.AUTH_ERROR, text);
  if (authSig || http.statusCode === 401 || http.statusCode === 403) {
    return buildClassification(CATEGORY.AUTH_ERROR, {
      reason: `Authentification / autorisation refusée${http.statusCode ? ` (HTTP ${http.statusCode})` : ''} — inutile de réessayer.`,
      evidence: { matched: authSig ? String(authSig.re) : null, http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: false,
      providerLimited: true,
      modelSpecific: false,
    });
  }

  // 5) Filtrage de sécurité indisponible → une seule reprise différée.
  const safetySig = findSignature(CATEGORY.CONTENT_SAFETY_UNAVAILABLE, text);
  if (safetySig) {
    const safetyCooldownMs = Math.max(cd.technicalMs, http.retryAfterMs || 0);
    return buildClassification(CATEGORY.CONTENT_SAFETY_UNAVAILABLE, {
      cooldownMs: safetyCooldownMs,
      resetAt: latestIso([
        knownResetAt,
        new Date(Date.now() + safetyCooldownMs).toISOString(),
      ]),
      reason: 'Filtrage de sécurité indisponible — une seule reprise différée, puis bascule (le contrôle n\'est jamais désactivé).',
      evidence: { matched: String(safetySig.re), http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: true,
      providerLimited: true,
      modelSpecific: false,
    });
  }

  // 6) Rate limit HTTP générique : Retry-After strict, reset connu non raccourci.
  if (http.statusCode === 429) {
    const knownResetDelay = knownResetAt
      ? Math.max(0, Date.parse(knownResetAt) - Date.now())
      : 0;
    const cooldownMs = http.retryAfterMs != null
      ? Math.max(http.retryAfterMs, cd.rateMs, knownResetDelay)
      : Math.max(
        cd.rateMs * Math.pow(2, Math.max(1, p.consecutiveFailures || 1) - 1),
        knownResetDelay,
      );
    const resetAt = latestIso([
      knownResetAt,
      new Date(Date.now() + cooldownMs).toISOString(),
    ]);
    return buildClassification(CATEGORY.RATE_LIMITED, {
      quotaType: 'short_term',
      cooldownMs,
      resetAt,
      reason: `HTTP 429 (rate limit) — délai fournisseur ${http.retryAfterMs != null ? http.retryAfterMs + ' ms' : 'non communiqué'}.`,
      evidence: { http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: 429,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: true,
      providerLimited: true,
    });
  }
  if (http.statusCode === 402) {
    return buildClassification(CATEGORY.QUOTA_CREDIT, {
      quotaType: 'credit',
      cooldownMs: cd.dailyMs,
      resetAt: knownResetAt,
      reason: 'HTTP 402 (crédit insuffisant) — aucun achat de crédit sans autorisation.',
      evidence: { http, eventText: eventText.slice(0, 800) },
      httpStatus: 402,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
    });
  }
  if (http.statusCode >= 500) {
    return buildClassification(CATEGORY.PROVIDER_UNAVAILABLE, {
      quotaType: 'none',
      cooldownMs: cd.providerMs,
      resetAt: latestIso([knownResetAt, new Date(Date.now() + cd.providerMs).toISOString()]),
      reason: `HTTP ${http.statusCode} — fournisseur indisponible, failover requis.`,
      evidence: { http, eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800) },
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: true,
      providerLimited: true,
      modelSpecific: false,
    });
  }

  // 7) Signatures de quota / fournisseur (l'ordre du tableau est prioritaire).
  for (const sig of SIGNATURES) {
    if ([
      CATEGORY.CONTENT_SAFETY_UNAVAILABLE,
      CATEGORY.AUTH_ERROR,
      CATEGORY.DAILY_QUOTA_EXHAUSTED,
      CATEGORY.QUOTA_CREDIT,
    ].includes(sig.category)) continue;
    if (!sig.re.test(text)) continue;
    const quotaType = sig.quotaType || 'none';
    let cooldownMs = cd.providerMs;
    let resetAt = knownResetAt;
    if (quotaType === 'daily') {
      if (knownResetAt) {
        const known = Date.parse(knownResetAt);
        cooldownMs = Number.isFinite(known) ? Math.max(0, known - Date.now()) : cd.dailyMs;
        resetAt = knownResetAt;
      } else {
        // Reset NON communiqué : cooldown PROGRESSIF borné, jamais de boucle
        // infinie et aucune attente d'une heure par défaut.
        const n = Math.max(1, p.consecutiveFailures || 1);
        cooldownMs = Math.min(cd.rateMs * Math.pow(2, n - 1), 60 * 60 * 1000);
        resetAt = new Date(Date.now() + cooldownMs).toISOString();
      }
    } else if (quotaType === 'hourly') {
      cooldownMs = cd.hourlyMs;
      resetAt = knownResetAt || nextUtcHour();
    } else if (quotaType === 'short_term') {
      const n = Math.max(1, p.consecutiveFailures || 1);
      cooldownMs = Math.min(cd.rateMs * Math.pow(2, n - 1), 30 * 60 * 1000);
      resetAt = knownResetAt || new Date(Date.now() + cooldownMs).toISOString();
    } else if (quotaType === 'credit') {
      cooldownMs = cd.dailyMs;
      resetAt = knownResetAt;
    }
    const providerLimited = sig.category === CATEGORY.RATE_LIMITED
      || sig.category === CATEGORY.PROVIDER_UNAVAILABLE
      || sig.category === CATEGORY.QUOTA_CREDIT;
    // Le quota journalier "free messages" est généralement propre au modèle :
    // on tente un autre modèle du même fournisseur avant de changer de fournisseur.
    const modelSpecific = sig.category === CATEGORY.MODEL_INVALID
      || sig.category === CATEGORY.DAILY_QUOTA_EXHAUSTED;
    return buildClassification(sig.category, {
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
      httpStatus: http.statusCode,
      retryAfterMs: http.retryAfterMs,
      knownResetAt,
      transient: sig.category === CATEGORY.RATE_LIMITED || sig.category === CATEGORY.PROVIDER_UNAVAILABLE,
      providerLimited,
      modelSpecific,
    });
  }

  // 6) Erreur technique inconnue → bascule autorisée mais cooldown court.
  const technical = {
    category: CATEGORY.TECHNICAL_ERROR,
    switchModel: true,
    quotaType: 'none',
    cooldownMs: cd.technicalMs,
    resetAt: new Date(Date.now() + cd.technicalMs).toISOString(),
    reason: 'Erreur technique non identifiée — bascule vers un autre modèle, sans pénalité longue.',
    evidence: { eventText: eventText.slice(0, 800), stderrTail: stderr.slice(-800), exitCode: p.exitCode },
    httpStatus: http.statusCode,
    retryAfterMs: http.retryAfterMs,
    knownResetAt,
    transient: true,
    providerLimited: false,
    modelSpecific: false,
  };
  return technical;
}

module.exports = {
  CATEGORY,
  SIGNATURES,
  classifyFailure,
  buildClassification,
  extractErrorText,
  extractHttpInfo,
  parseRetryAfter,
  parseKnownReset,
  isCodeError,
  nextUtcMidnight,
  nextUtcHour,
};
