/**
 * Outreach Automation 0-PC — Worker Cloudflare (sprint 2026-09-06).
 * Cron → Supabase (queues) → Resend (email) / Meta Graph (Facebook).
 * AUCUN envoi sans : OUTREACH_ENABLED + canal enabled + DRY_RUN=false + secrets posés.
 * AUCUNE PII en clair dans les logs (emails masqués, jamais de secrets/tokens).
 */

const REGION = {
  MQ:         { domain: 'sargasses-martinique.com', tz: 'America/Martinique',  lang: 'fr' },
  GP:         { domain: 'sargasses-guadeloupe.com', tz: 'America/Guadeloupe',  lang: 'fr' },
  FLORIDA:    { domain: 'sargassummiami.com',       tz: 'America/New_York',    lang: 'en' },
  PUNTACANA:  { domain: 'sargassumpuntacana.com',   tz: 'America/Santo_Domingo', lang: 'en' },
  RIVIERAMAYA:{ domain: 'sargassumcancun.com',      tz: 'America/Cancun',       lang: 'es' },
  TULUM:      { domain: 'sargazotulum.com',         tz: 'America/Cancun',       lang: 'es' },
};

const STEP_MAX = 2; // 0=contact, 1=relance, 2=dernière
const ACTIVE_STATUSES = ['ready', 'queued', 'failed'];

function cfg(env) {
  const b = (v, d) => String(v ?? d).toLowerCase() === 'true';
  const n = (v, d) => { const x = parseInt(v ?? d, 10); return Number.isFinite(x) ? x : d; };
  return {
    enabled: b(env.OUTREACH_ENABLED, false),
    emailOn: b(env.EMAIL_OUTREACH_ENABLED, false),
    fbOn: b(env.FACEBOOK_OUTREACH_ENABLED, false),
    dryRun: b(env.OUTREACH_DRY_RUN, true),
    dailyLimit: n(env.DAILY_EMAIL_LIMIT, 10),
    hourlyLimit: n(env.HOURLY_EMAIL_LIMIT, 5),
    domainLimit: n(env.PER_DOMAIN_PER_DAY_LIMIT, 1),
    batch: n(env.MAX_BATCH_SIZE, 10),
    maxRetries: n(env.MAX_RETRIES, 3),
    delays: [0, n(env.FOLLOWUP_DELAY_DAYS_1, 4), n(env.FOLLOWUP_DELAY_DAYS_2, 7)],
    hStart: n(env.SEND_HOUR_START, 8),
    hEnd: n(env.SEND_HOUR_END, 18),
    campaigns: String(env.ENABLED_CAMPAIGNS || 'b2b-hotel-01').split(',').map((s) => s.trim()).filter(Boolean),
    from: String(env.RESEND_FROM || ''),
    unsubBase: String(env.UNSUB_BASE || '').replace(/\/$/, ''),
    fbPages: { MQ: env.FB_MQ_PAGE_ID || '', GP: env.FB_GP_PAGE_ID || '' },
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
const txt = (s, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// Anti-fuite logs : masque la partie locale d'un email.
function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at <= 1) return '***';
  return s[0] + '***@' + s.slice(at + 1);
}
function safeEq(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

// ─── Supabase REST (service_role, jamais exposé) ─────────────────────
function sb(env, path, method = 'GET', body = null, extraHeaders = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function sbCount(env, path) {
  // Compte exact via HEAD + Prefer count (jamais de gros payload).
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
        Prefer: 'count=exact',
      },
    });
    const cr = r.headers.get('Content-Range') || '';
    const m = cr.match(/\/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : -1;
  } catch (_) { return -1; }
}
async function logEvent(env, kind, contactId, step, detail, dryRun) {
  try {
    await sb(env, 'outreach_events', 'POST', {
      contact_id: contactId || null, kind, step: step ?? null,
      detail: String(detail || '').slice(0, 500), dry_run: !!dryRun,
    });
  } catch (_) {}
}
const todayIso = () => new Date().toISOString().slice(0, 10);
const hourAgoIso = (h) => new Date(Date.now() - h * 3600000).toISOString();

// Heure locale destinataire (jamais le fuseau machine).
function hourInTz(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).formatToParts(date);
    const h = parts.find((p) => p.type === 'hour');
    return parseInt(h.value, 10) % 24;
  } catch (_) { return 12; } // tz inconnue → passe (fail-open mesuré, loggé par l'appelant si besoin)
}

// ─── Templates (copy validée sprint B2B, FR/EN/ES, variables structurées) ──
function buildMessage(c, unsubUrl) {
  const r = REGION[c.region] || REGION.MQ;
  const lang = c.language || r.lang;
  const name = (c.contact_name || '').trim();
  const hotel = (c.hotel_name || '').trim() || (lang === 'en' ? 'your hotel' : lang === 'es' ? 'su hotel' : 'votre hôtel');
  const link = `https://${r.domain}/?pro=1`;
  const hello = lang === 'en' ? `Hello${name ? ' ' + name : ''},` : lang === 'es' ? `Hola${name ? ' ' + name : ''},` : `Bonjour${name ? ' ' + name : ''},`;
  const foot = lang === 'en'
    ? `\n\n— SargaGame Pro · Reply STOP to opt out${unsubUrl ? ` or ${unsubUrl}` : ''}`
    : lang === 'es'
      ? `\n\n— SargaGame Pro · Responda STOP para no recibir más${unsubUrl ? ` o ${unsubUrl}` : ''}`
      : `\n\n— SargaGame Pro · Répondez STOP pour ne plus recevoir${unsubUrl ? ` ou ${unsubUrl}` : ''}`;
  if (c.current_step === 1) {
    const subject = lang === 'en' ? `Quick follow-up — beach brief for ${hotel}`
      : lang === 'es' ? `Seguimiento — informe playas para ${hotel}`
      : `Petite relance — brief plages pour ${hotel}`;
    const body = lang === 'en'
      ? `${hello}\n\nFollowing up on my note about the daily beach brief for ${hotel} (satellite verdict per beach, 7-day forecast, alerts — 30-day trial, no card): ${link}\n\nWorth 2 minutes?${foot}`
      : lang === 'es'
        ? `${hello}\n\nRetomo mi nota sobre el informe diario de playas para ${hotel} (veredicto satelital por playa, pronóstico 7 días, alertas — prueba 30 días sin tarjeta): ${link}\n\n¿Le dedican 2 minutos?${foot}`
        : `${hello}\n\nJe reviens vers vous au sujet du brief plage quotidien pour ${hotel} (verdict satellite par plage, prévision 7 jours, alertes — essai 30 j sans carte) : ${link}\n\n2 minutes à y consacrer ?${foot}`;
    return { subject, body };
  }
  if (c.current_step === 2) {
    const subject = lang === 'en' ? `Closing the loop — ${hotel}`
      : lang === 'es' ? `Cierro el círculo — ${hotel}`
      : `Je clôture — ${hotel}`;
    const body = lang === 'en'
      ? `${hello}\n\nLast note from me: if beach questions eat your front-desk time, the trial is self-serve and free for 30 days: ${link}\n\nIf not relevant, just reply STOP and I'll close your file.${foot}`
      : lang === 'es'
        ? `${hello}\n\nÚltima nota: si las preguntas sobre playas consumen su recepción, la prueba es autogestionada y gratis 30 días: ${link}\n\nSi no es relevante, responda STOP y cierro su ficha.${foot}`
        : `${hello}\n\nDernier message de ma part : si les questions plage monopolisent votre réception, l'essai est 100 % self-serve et gratuit 30 jours : ${link}\n\nSi ce n'est pas pertinent, répondez STOP et je clôture votre dossier.${foot}`;
    return { subject, body };
  }
  const subject = lang === 'en' ? `Where should your guests swim today? — ${hotel}`
    : lang === 'es' ? `¿Dónde bañarse hoy? — ${hotel}`
    : `Où vos clients se baignent-ils aujourd'hui ? — ${hotel}`;
  const body = lang === 'en'
    ? `${hello}\n\nDo your guests ask where to swim seaweed-free? SargaGame briefs your team before 7am: per-beach verdict (satellite), 7-day forecast, alerts. 30-day trial, no card, then €79/mo or €690/yr: ${link}\n\n2 minutes to activate — reply YES and I'll open your access.${foot}`
    : lang === 'es'
      ? `${hello}\n\n¿Sus clientes preguntan dónde bañarse sin sargazo? SargaGame informa a su equipo antes de las 7h: veredicto por playa (satélite), pronóstico 7 días, alertas. Prueba 30 días sin tarjeta, luego 79 €/mes o 690 €/año: ${link}\n\n2 minutos para activar — responda SÍ y le abro el acceso.${foot}`
      : `${hello}\n\nVos clients demandent chaque matin où se baigner sans sargasses ? SargaGame briefe votre équipe avant 7 h : verdict par plage (satellite), prévision 7 jours, alertes. Essai 30 jours sans carte, puis 79 €/mois ou 690 €/an : ${link}\n\n2 min pour activer — répondez OUI et je vous ouvre l'accès.${foot}`;
  return { subject, body };
}

// Token opt-out (capability URL, HMAC via ADMIN_KEY — jamais exposé/loggé).
async function unsubToken(env, email) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.ADMIN_KEY || 'x')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('unsub|' + String(email).toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ─── Envoi Resend (jamais appelé en dry-run / kill-switch / sans secrets) ──
async function sendResend(env, from, to, subject, html, unsubUrl) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY };
  const body = { from, to: [to], subject, html: html.replace(/\n/g, '<br>') };
  if (unsubUrl) body.headers = { 'List-Unsubscribe': `<${unsubUrl}>` };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: j.id || null, error: j.message || j.error || null };
}
// Retiré : isTransient/isHardBounce redondants — logique retry explicite dans processOne.
// isHardBounce garde sa définition d'usage unique ci-dessous.
const isHardBounce = (status, msg) =>
  status === 422 || /invalid|malformed|domain/i.test(String(msg || ''));

// ─── Sélection + claim atomique (anti-double-envoi inter-Cron) ─────────────
async function fetchDue(env, c, step, limit) {
  const sel = 'id,hotel_name,contact_name,email,region,language,campaign_id,current_step,status,attempts,last_sent_at';
  // Étape 0 = primo-contacts (ready/queued/failed) ; étapes 1-2 = relances des
  // déjà envoyés (sent) + retries (queued/failed). Sans 'sent' ici, les relances
  // ne partiraient jamais (bug attrapé par le contrat idempotence/relance).
  const sts = step === 0 ? 'ready,queued,failed' : 'sent,queued,failed';
  let q = `outreach_contacts?select=${sel}&status=in.(${sts})&campaign_id=in.(${c.campaigns.map(encodeURIComponent).join(',')})&current_step=eq.${step}&order=next_action_at.asc.nullsfirst&limit=${limit}`;
  const r = await sb(env, q);
  if (!r.ok) return [];
  return r.json().catch(() => []);
}
// Réserve 1 contact : écriture conditionnelle = verrou logique (0 ligne = perdu la course).
async function claim(env, id, step) {
  const now = new Date().toISOString();
  const sts = step === 0 ? 'ready,queued,failed' : 'sent,queued,failed';
  const r = await sb(env,
    `outreach_contacts?id=eq.${id}&status=in.(${sts})&current_step=eq.${step}&or=(next_action_at.is.null,next_action_at.lte.${encodeURIComponent(now)})`,
    'PATCH', { status: 'sending', updated_at: now });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows && rows.length ? rows[0] : null;
}
async function setContact(env, id, patch) {
  try {
    await sb(env, `outreach_contacts?id=eq.${id}`, 'PATCH', { ...patch, updated_at: new Date().toISOString() });
  } catch (_) {}
}

// ─── Garde-fous pré-envoi (retourne null si OK, sinon la raison du skip) ────
async function preSendChecks(env, c, cc) {
  if (c.unsubscribe_at || c.status === 'unsubscribed') return 'unsubscribed';
  if (c.reply_status) return 'replied:' + c.reply_status;
  if (c.status === 'bounced') return 'bounced';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email || '')) { await setContact(env, c.id, { status: 'failed', last_error: 'invalid_email' }); return 'invalid_email'; }
  const r = REGION[c.region] || REGION.MQ;
  const h = hourInTz(new Date(), r.tz);
  if (h < cc.hStart || h > cc.hEnd) return 'outside_window';
  if (c.last_sent_at && Date.now() - new Date(c.last_sent_at).getTime() < 20 * 3600000) return 'recent_send';
  // Quotas (fail-closed : illisible = pas d'envoi).
  const day = todayIso();
  const sentDay = await sbCount(env, `outreach_events?created_at=gte.${day}T00:00:00Z&kind=eq.sent&dry_run=eq.false`);
  if (sentDay < 0) return 'quota_unreadable';
  if (sentDay >= cc.dailyLimit) return 'daily_quota';
  const sentHour = await sbCount(env, `outreach_events?created_at=gte.${hourAgoIso(1)}&kind=eq.sent&dry_run=eq.false`);
  if (sentHour < 0) return 'quota_unreadable';
  if (sentHour >= cc.hourlyLimit) return 'hourly_quota';
  const domain = String(c.email).split('@')[1] || '';
  const domCount = await sbCount(env, `outreach_contacts?last_sent_at=gte.${day}T00:00:00Z&email=ilike.*@${domain.replace(/\./g, '.')}`);
  if (domCount < 0) return 'quota_unreadable';
  if (domCount >= cc.domainLimit) return 'domain_quota';
  return null;
}

function backoffHours(attempts) {
  return [1, 4, 24][Math.min(attempts, 2)];
}

// ─── Traitement d'UN contact (cœur idempotent) ─────────────────────────────
async function processOne(env, cc, c, dry) {
  const skip = await preSendChecks(env, c, cc);
  if (skip) {
    await logEvent(env, 'skipped', c.id, c.current_step, skip, dry);
    // Restaure le statut d'origine (le claim l'avait mis à 'sending').
    if (!dry) await setContact(env, c.id, { status: c.status || 'queued' });
    return { sent: false, skipped: skip };
  }
  const unsubUrl = cc.unsubBase ? `${cc.unsubBase}/unsubscribe?email=${encodeURIComponent(c.email)}&code=${await unsubToken(env, c.email)}` : '';
  const { subject, body } = buildMessage(c, unsubUrl);
  if (dry || !cc.emailOn || !env.RESEND_API_KEY || !cc.from) {
    const why = dry ? 'dry_run' : (!cc.emailOn ? 'email_disabled' : (!env.RESEND_API_KEY ? 'no_resend_key' : 'no_from'));
    await logEvent(env, 'dry_run', c.id, c.current_step,
      `to=${maskEmail(c.email)} step=${c.current_step} provider=resend subject=${subject.slice(0, 60)} (${why})`, true);
    await setContact(env, c.id, { status: 'queued' });
    return { sent: false, dry: true };
  }
  let res;
  try {
    res = await sendResend(env, cc.from, c.email, subject, body, unsubUrl);
  } catch (e) {
    res = { ok: false, status: 0, error: 'network:' + String((e && e.message) || e).slice(0, 80) };
  }
  if (res.ok) {
    const delay = cc.delays[c.current_step + 1];
    const next = delay != null && c.current_step < STEP_MAX
      ? new Date(Date.now() + delay * 86400000).toISOString()
      : null;
    await setContact(env, c.id, {
      status: 'sent', last_sent_at: new Date().toISOString(),
      next_action_at: next, attempts: 0, provider_message_id: res.id, last_error: null,
    });
    await logEvent(env, 'sent', c.id, c.current_step, `to=${maskEmail(c.email)} id=${res.id || '?'}`, false);
    return { sent: true };
  }
  if (isHardBounce(res.status, res.error)) {
    await setContact(env, c.id, { status: 'bounced', last_error: String(res.error).slice(0, 200), last_error_at: new Date().toISOString() });
    await logEvent(env, 'bounced', c.id, c.current_step, `to=${maskEmail(c.email)} ${res.status} ${res.error || ''}`.slice(0, 200), false);
    return { sent: false, hard: true };
  }
  const attempts = (c.attempts || 0) + 1;
  // Transitoire = réseau (status 0), 429, 5xx → backoff. Tout le reste = permanent.
  const transient = res.status === 0 || res.status === 429 || (res.status >= 500 && res.status <= 599);
  if (!transient || attempts > cc.maxRetries) {
    await setContact(env, c.id, { status: 'failed', last_error: String(res.error || res.status).slice(0, 200), last_error_at: new Date().toISOString(), attempts });
    await logEvent(env, 'failed', c.id, c.current_step, `to=${maskEmail(c.email)} ${res.status} ${res.error || ''}`.slice(0, 200), false);
    return { sent: false, failed: true };
  }
  await setContact(env, c.id, {
    status: 'queued', attempts,
    next_action_at: new Date(Date.now() + backoffHours(attempts) * 3600000).toISOString(),
    last_error: String(res.error || res.status).slice(0, 200), last_error_at: new Date().toISOString(),
  });
  await logEvent(env, 'retry', c.id, c.current_step, `to=${maskEmail(c.email)} attempt=${attempts} backoff=${backoffHours(attempts)}h`, false);
  return { sent: false, retry: true };
}

// ─── Jobs ─────────────────────────────────────────────────────────────────
async function runEmailSteps(env, cc, steps, dry) {
  const out = { considered: 0, sent: 0, skipped: {}, errors: 0 };
  for (const step of steps) {
    const due = await fetchDue(env, cc, step, cc.batch);
    for (const c of due.slice(0, cc.batch - out.sent)) {
      out.considered++;
      const claimed = await claim(env, c.id, step);
      if (!claimed) { out.skipped['race_lost'] = (out.skipped['race_lost'] || 0) + 1; continue; }
      try {
        const r = await processOne(env, cc, { ...c, ...claimed }, dry);
        if (r.sent) out.sent++;
        else if (r.skipped) out.skipped[r.skipped] = (out.skipped[r.skipped] || 0) + 1;
      } catch (e) {
        out.errors++;
        await logEvent(env, 'failed', c.id, step, 'exception:' + String((e && e.message) || e).slice(0, 120), dry);
        if (!dry) await setContact(env, c.id, { status: 'queued' });
      }
      if (out.sent >= cc.batch) break;
    }
    if (out.sent >= cc.batch) break;
  }
  return out;
}

const FB_CATEGORIES = ['meteo', 'conseil', 'prevision', 'tourisme', 'cta', 'educatif'];
function fbTemplate(region, lang, category, dayIndex) {
  const link = `https://${(REGION[region] || REGION.MQ).domain}/`;
  const T = {
    meteo: {
      fr: `Sargasses en direct ce matin : vérifiez votre plage avant de partir ${link} — verdict satellite par plage, mis à jour 4×/jour.`,
      en: `Live sargassum this morning: check your beach before you go ${link} — satellite verdict per beach, updated 4×/day.`,
      es: `Sargazo en directo esta mañana: revise su playa antes de salir ${link} — veredicto satelital por playa, 4×/día.`,
    },
    conseil: {
      fr: `Conseil plage : le matin tôt, la mer est souvent plus claire. Vérifiez le score du jour ici ${link}`,
      en: `Beach tip: early morning water is often clearest. Check today's score ${link}`,
      es: `Consejo playa: el agua suele estar más clara temprano. Vea la puntuación de hoy ${link}`,
    },
    prevision: {
      fr: `Prévision 7 jours par plage : anticipez votre semaine au lieu de la subir ${link}`,
      en: `7-day forecast per beach: plan your week instead of enduring it ${link}`,
      es: `Pronóstico 7 días por playa: planifique su semana ${link}`,
    },
    tourisme: {
      fr: `53 plages notées en Martinique, 83 en Guadeloupe : trouvez la vôtre aujourd'hui ${link}`,
      en: `53 rated beaches in Martinique, 83 in Guadeloupe: find yours today ${link}`,
      es: `53 playas evaluadas en Martinica, 83 en Guadalupe: encuentre la suya ${link}`,
    },
    cta: {
      fr: `Hôtelier ? Recevez le brief plage de votre équipe chaque matin — essai 30 j sans carte ${link}?pro=1`,
      en: `Hotelier? Get your team's beach brief every morning — 30-day trial, no card ${link}?pro=1`,
      es: `¿Hotelero? Reciba el informe de playas cada mañana — prueba 30 días sin tarjeta ${link}?pro=1`,
    },
    educatif: {
      fr: `Le saviez-vous ? Nos prévisions croisent satellite NOAA, houle, vent et marée en un score 0-100. Méthode publique ${link}fiabilite/`,
      en: `Did you know? Our forecasts blend NOAA satellite, swell, wind and tide into a 0-100 score. Public method ${link}reliability/`,
      es: `¿Sabía? Nuestros pronósticos combinan satélite NOAA, oleaje, viento y marea en 0-100. Método público ${link}fiabilidad/`,
    },
  };
  const pick = T[category] || T.meteo;
  return pick[lang] || pick.fr;
}

async function jobFacebook(env, cc, dry) {
  const out = { published: 0, skipped: {}, errors: 0 };
  if (!cc.enabled || !cc.fbOn) { await logEvent(env, 'heartbeat', null, null, 'facebook job skipped (disabled)', dry); return { ...out, disabled: true }; }
  const now = new Date().toISOString();
  let rows = [];
  try {
    const r = await sb(env, `social_posts?select=id,platform,page_id,region,content,status,attempts&status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&order=scheduled_at.asc&limit=3`);
    rows = r.ok ? await r.json().catch(() => []) : [];
  } catch (_) { out.errors++; return out; }
  for (const p of rows) {
    // Claim atomique.
    let claimed = null;
    try {
      const r = await sb(env, `social_posts?id=eq.${p.id}&status=eq.scheduled`, 'PATCH', { status: 'publishing', updated_at: now });
      const arr = r.ok ? await r.json().catch(() => []) : [];
      claimed = arr && arr.length ? arr[0] : null;
    } catch (_) {}
    if (!claimed) { out.skipped['race_lost'] = (out.skipped['race_lost'] || 0) + 1; continue; }
    const pageId = p.page_id || (p.region === 'GP' ? cc.fbPages.GP : cc.fbPages.MQ);
    if (dry || !env.FB_PAGE_TOKEN || !pageId) {
      await logEvent(env, 'dry_run', null, null, `fb publish page=${(pageId || '?').slice(0, 8)}*** region=${p.region} (${dry ? 'dry_run' : !env.FB_PAGE_TOKEN ? 'no_token' : 'no_page'})`, true);
      await setPost(env, p.id, { status: 'scheduled' });
      continue;
    }
    try {
      const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/feed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: p.content, access_token: env.FB_PAGE_TOKEN }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) {
        await setPost(env, p.id, { status: 'published', provider_post_id: String(j.id), published_at: now });
        await logEvent(env, 'sent', null, null, `fb published region=${p.region} id=${String(j.id).slice(0, 12)}`, false);
        out.published++;
      } else {
        const code = j?.error?.code;
        const permanent = [190, 200, 100, 10].includes(code);
        const attempts = (p.attempts || 0) + 1;
        if (permanent || attempts > cc.maxRetries) {
          await setPost(env, p.id, { status: 'failed', last_error: `fb ${code}: ${(j?.error?.message || '').slice(0, 120)}`, attempts });
          await logEvent(env, 'failed', null, null, `fb failed region=${p.region} code=${code}`, false);
        } else {
          await setPost(env, p.id, { status: 'scheduled', attempts, scheduled_at: new Date(Date.now() + backoffHours(attempts) * 3600000).toISOString(), last_error: `fb retry ${code}` });
          await logEvent(env, 'retry', null, null, `fb retry region=${p.region} attempt=${attempts}`, false);
        }
        out.errors++;
      }
    } catch (e) {
      const attempts = (p.attempts || 0) + 1;
      await setPost(env, p.id, { status: attempts > cc.maxRetries ? 'failed' : 'scheduled', attempts, last_error: 'network' });
      out.errors++;
    }
  }
  return out;
}
async function setPost(env, id, patch) {
  try {
    await sb(env, `social_posts?id=eq.${id}`, 'PATCH', { ...patch, updated_at: new Date().toISOString() });
  } catch (_) {}
}

    // Retiré : job health dédié (pas de cron libre sous la limite free —
    // les 3 jobs écrivent déjà un heartbeat à chaque run, couverture 30 min).
    // Le watchdog lit n'importe quel heartbeat récent + les compteurs ci-dessous.

// ─── Admin (agrégats uniquement, JAMAIS de PII ni de secrets) ─────────────
async function adminStatus(env, cc) {
  const counts = {};
  try {
    const r = await sb(env, 'outreach_contacts?select=status');
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      for (const x of rows) counts[x.status] = (counts[x.status] || 0) + 1;
    }
  } catch (_) {}
  const hb = await sb(env, 'outreach_events?select=kind,created_at,detail&order=created_at.desc&limit=20')
    .then((r) => (r.ok ? r.json().catch(() => []) : [])).catch(() => []);
  let fb = { scheduled: -1, published7d: -1, failed: -1 };
  try {
    fb.scheduled = await sbCount(env, 'social_posts?status=eq.scheduled');
    fb.published7d = await sbCount(env, `social_posts?status=eq.published&published_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`);
    fb.failed = await sbCount(env, 'social_posts?status=eq.failed');
  } catch (_) {}
  // Compteurs jour (UTC) pour le monitoring. -1 = illisible (le preflight marque
  // WARN, jamais PASS). Ajoutés sprint activation (monitoring §11) — lecture seule.
  const day = `${todayIso()}T00:00:00Z`;
  const cnt = async (q) => { try { return await sbCount(env, q); } catch (_) { return -1; } };
  const emailToday = {
    sent: await cnt(`outreach_events?created_at=gte.${day}&kind=eq.sent&dry_run=eq.false`),
    failed: await cnt(`outreach_events?created_at=gte.${day}&kind=in.(failed,bounced)`),
    replies: await cnt(`outreach_events?created_at=gte.${day}&kind=in.(replied,positive,negative)`),
    retries: await cnt(`outreach_events?created_at=gte.${day}&kind=eq.retry`),
    dry_runs: await cnt(`outreach_events?created_at=gte.${day}&kind=eq.dry_run`),
  };
  const lastHb = hb.find((e) => e.kind === 'heartbeat') || null;
  const lastErr = hb.find((e) => e.kind === 'failed') || null;
  return {
    ok: true, version: 'outreach-2',
    enabled: cc.enabled, email: cc.emailOn, fb_enabled: cc.fbOn, dry_run: cc.dryRun,
    // Présence UNIQUEMENT (jamais de valeurs) pour le pre-flight secrets.
    secrets: {
      service_key: !!env.SUPABASE_SERVICE_KEY,
      resend_key: !!env.RESEND_API_KEY,
      fb_token: !!env.FB_PAGE_TOKEN,
      admin_key: !!env.ADMIN_KEY,
    },
    limits: { daily: cc.dailyLimit, hourly: cc.hourlyLimit, batch: cc.batch },
    contacts_by_status: counts,
    queue: {
      ready: counts.ready || 0, queued: counts.queued || 0,
      failed: counts.failed || 0, sent: counts.sent || 0,
    },
    email_today: emailToday,
    facebook_posts: fb,
    runtime: {
      last_heartbeat_at: lastHb ? lastHb.created_at : null,
      last_heartbeat_detail: lastHb ? String(lastHb.detail || '').slice(0, 120) : null,
      last_error_at: lastErr ? lastErr.created_at : null,
      last_error_detail: lastErr ? String(lastErr.detail || '').slice(0, 120) : null,
    },
    recent_events: hb.slice(0, 5),
  };
}

// ─── Entrées ──────────────────────────────────────────────────────────────
export default {
  async scheduled(event, env, ctx) {
    const cc = cfg(env);
    const cron = (event && event.cron) || '';
    // Routage exact (jamais de substring fragile) : doit refléter wrangler.toml.
    const JOB_BY_CRON = {
      '*/30 * * * *': 'email_queue',
      '20 * * * *': 'email_followups',
      '45 11 * * *': 'facebook',
    };
    let job = JOB_BY_CRON[cron] || 'email_queue';
    // Garde-fous globaux AVANT tout traitement.
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return; // fail-silencieux : pas de DB = pas d'action (loggé par le watchdog via absence de heartbeat)
    }
    if (!cc.enabled) {
      await logEvent(env, 'heartbeat', null, null, `job=${job} skipped (OUTREACH_ENABLED=false)`, true);
      return;
    }
    const dry = cc.dryRun;
    try {
      if (job === 'email_queue') {
        const r = await runEmailSteps(env, cc, [0], dry);
        await logEvent(env, 'heartbeat', null, null, `job=email_queue sent=${r.sent} considered=${r.considered} errors=${r.errors}`, dry);
      } else if (job === 'email_followups') {
        const r = await runEmailSteps(env, cc, [1, 2], dry);
        await logEvent(env, 'heartbeat', null, null, `job=email_followups sent=${r.sent} considered=${r.considered} errors=${r.errors}`, dry);
      } else if (job === 'facebook') {
        const r = await jobFacebook(env, cc, dry);
        await logEvent(env, 'heartbeat', null, null, `job=facebook published=${r.published} errors=${r.errors}`, dry);
      }
    } catch (e) {
      await logEvent(env, 'failed', null, null, `job=${job} exception:${String((e && e.message) || e).slice(0, 120)}`, dry);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const cc = cfg(env);
    // --- Unsubscribe (capability URL, sans auth — token HMAC vérifié) ---
    if (p === '/unsubscribe' || p === '/api/outreach/unsubscribe') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      const code = url.searchParams.get('code') || '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !code) return txt('Lien invalide.', 400);
      const good = await unsubToken(env, email);
      if (!safeEq(good, code)) return txt('Lien invalide.', 403);
      try {
        await sb(env, `outreach_contacts?email=eq.${encodeURIComponent(email)}`, 'PATCH',
          { status: 'unsubscribed', unsubscribe_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        await logEvent(env, 'unsubscribed', null, null, `to=${maskEmail(email)} via=link`, false);
      } catch (_) {}
      return txt('Désinscription confirmée — vous ne recevrez plus nos emails. / Unsubscribed — no further emails.');
    }
    const qkey = url.searchParams.get('key') || '';
    const hkey = request.headers.get('x-outreach-key') || '';
    const stalk = String(env.ADMIN_KEY || '');
    // Webhook provider : Resend configure un header dédié (pas de query).
    // Tout le reste : ?key= obligatoire.
    const needKey = p.startsWith('/api/outreach/') || p === '/status' || p === '/seed-social';
    // Clé absente = RIEN n'est authentifié (safeEq('','') serait true : fail-closed explicite).
    const authed = stalk !== '' && (safeEq(qkey, stalk) || (p === '/api/outreach/webhook' && safeEq(hkey, stalk)));
    if (needKey && !authed) {
      return json({ error: 'unauthorized' }, 401);
    }
    // --- Admin status (agrégats, pas de PII) ---
    if (p === '/status' || p === '/api/outreach/status') return json(await adminStatus(env, cc));
    // --- Seed social déterministe (rotation 6 catégories × régions actives) ---
    if (p === '/seed-social' && request.method === 'POST') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10) || 7, 14);
      const regions = (url.searchParams.get('regions') || 'MQ,GP').split(',').map((s) => s.trim()).filter((r) => REGION[r]);
      let created = 0;
      const doy = Math.floor(Date.now() / 86400000);
      for (let d = 0; d < days; d++) {
        for (const rg of regions) {
          const cat = FB_CATEGORIES[(doy + d + FB_CATEGORIES.indexOf('meteo')) % FB_CATEGORIES.length];
          const lang = (REGION[rg] || REGION.MQ).lang;
          const content = fbTemplate(rg, lang, cat, d);
          const sched = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + d, 12, 45, 0)).toISOString();
          try {
            const chk = await sb(env, `social_posts?select=id&region=eq.${rg}&category=eq.${cat}&scheduled_at=gte.${sched.slice(0, 10)}T00:00:00Z&scheduled_at=lt.${sched.slice(0, 10)}T23:59:59Z&limit=1`);
            const exists = chk.ok ? (await chk.json().catch(() => [])).length : 1;
            if (!exists) {
              const ins = await sb(env, 'social_posts', 'POST', {
                platform: 'facebook', region: rg, language: lang, category: cat,
                content, scheduled_at: sched, status: 'scheduled',
              });
              if (ins.ok) created++;
            }
          } catch (_) {}
        }
      }
      await logEvent(env, 'heartbeat', null, null, `seed-social created=${created}`, true);
      return json({ ok: true, created });
    }
    // --- Marquage réponse (humain : reply STOP / outcome depuis la boîte) ---
    if (p === '/api/outreach/reply' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const idem = String(b.email || '').toLowerCase().trim() || String(b.id || '');
      const outcome = ['replied', 'positive', 'negative'].includes(b.outcome) ? b.outcome : 'replied';
      if (!idem) return json({ error: 'email_or_id_required' }, 400);
      const f = idem.includes('@') ? `email=eq.${encodeURIComponent(idem)}` : `id=eq.${encodeURIComponent(idem)}`;
      try {
        await sb(env, `outreach_contacts?${f}`, 'PATCH',
          { reply_status: outcome, status: outcome, updated_at: new Date().toISOString() });
        await logEvent(env, outcome, null, null, `ref=${idem.includes('@') ? maskEmail(idem) : idem}`, false);
      } catch (_) {}
      return json({ ok: true });
    }
    // --- Webhook provider (bounce/plainte) : auth déjà vérifiée par la garde
    // (header x-outreach-key configuré côté Resend). ---
    if (p === '/api/outreach/webhook' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const type = String(b.type || '');
      const email = String((b.email || b.to || '')).toLowerCase().trim();
      if (/bounced|failed/i.test(type) && email) {
        try {
          await sb(env, `outreach_contacts?email=eq.${encodeURIComponent(email)}`, 'PATCH',
            { status: 'bounced', last_error: 'webhook:' + type.slice(0, 40), last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          await logEvent(env, 'bounced', null, null, `to=${maskEmail(email)} via=webhook`, false);
        } catch (_) {}
      } else if (/complain|spam/i.test(type) && email) {
        try {
          await sb(env, `outreach_contacts?email=eq.${encodeURIComponent(email)}`, 'PATCH',
            { status: 'unsubscribed', unsubscribe_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          await logEvent(env, 'unsubscribed', null, null, `to=${maskEmail(email)} via=webhook`, false);
        } catch (_) {}
      }
      return json({ ok: true });
    }
    if (p === '/api/outreach/health' || p === '/health') {
      return json({ ok: true, outreach: 'outreach-1', dry_run: cc.dryRun, enabled: cc.enabled });
    }
    return json({ error: 'not_found' }, 404);
  },
};
