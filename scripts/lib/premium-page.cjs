// scripts/lib/premium-page.cjs
// Génère la page /premium/ pour une région donnée.
// Les prix et pass sont EXACTEMENT ceux acceptés par workers/sargagame/index.js (create_payment).
// Aucun secret n'est stocké ici ; la page appelle l'endpoint /api/mollie.php existant.
'use strict';

const OFFERS = Object.freeze([
  { pass: 'trip7', cents: 499, cur: 'EUR', price: '4,99 €', days: 7 },
  { pass: 'p30',  cents: 1499, cur: 'EUR', price: '14,99 €', days: 30, best: true },
  { pass: 'season', cents: 1999, cur: 'EUR', price: '19,99 €', days: 210 },
  { pass: 'sos',   cents: 100, cur: 'EUR', price: '1,00 €', days: 1 },
]);

const T = {
  fr: {
    lang: 'fr',
    title: (n) => `Prévisions sargasses ${n} — Accès premium`,
    meta: (n) => `Prévisions sargasses complètes, plage par plage, à ${n}. J+1 à J+7, alertes push. Sans publicité.`,
    h1: (n) => `Voyez l'état de chaque plage de ${n} avant d'y aller`,
    sub: 'Prévisions 7 jours · alertes push · carte en direct · sans publicité',
    cta: (p, d) => `Accéder — ${p} (${d} j)`,
    buy: (p, d) => `Obtenir l'accès ${d} jours — ${p}`,
    best: 'Le plus choisi',
    secure: 'Paiement sécurisé Mollie',
    email: 'Votre email (pour recevoir l'accès)',
    bad: 'Entrez un email valide.',
    err: 'Paiement impossible. Réessayez.',
    legal: 'Accès à durée fixe — sans reconduction automatique.',
  },
  en: {
    lang: 'en',
    title: (n) => `${n} sargassum forecasts — Premium access`,
    meta: (n) => `Full sargassum forecasts, beach by beach, in ${n}. Day +1 to +7 and alerts. From €4.99.`,
    h1: (n) => `See the state of every ${n} beach before you go`,
    sub: '7-day forecasts · push alerts · live map · no ads',
    cta: (p, d) => `Access — ${p} (${d} days)`,
    buy: (p, d) => `Get ${d} days access — ${p}`,
    best: 'Most popular',
    secure: 'Secure Mollie payment',
    email: 'Your email (to receive access)',
    bad: 'Enter a valid email.',
    err: 'Payment failed. Try again.',
    legal: 'Fixed-term access — no automatic renewal.',
  },
  es: {
    lang: 'es',
    title: (n) => `Pronóstico de sargazo ${n} — Acceso premium`,
    meta: (n) => `Pronósticos de sargasso completos, playa por playa, en ${n}. De J+1 a J+7 y alertas. Desde 4,99 €.`,
    h1: (n) => `Ve el estado de cada playa de ${n} antes de ir`,
    sub: 'Pronóstico 7 días · alertas push · mapa en directo · sin publicidad',
    cta: (p, d) => `Acceder — ${p} (${d} días)`,
    buy: (p, d) => `Obtener acceso ${d} días — ${p}`,
    best: 'El más elegido',
    secure: 'Pago seguro Mollie',
    email: 'Tu email (para recibir el acceso)',
    bad: 'Ingresa un email válido.',
    err: 'Pago imposible. Vuelve a intentarlo.',
    legal: 'Acceso por tiempo fijo — sin renovación automática.',
  },
};

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPage(region) {
  const Tl = T[region.primaryLang] || T.fr;
  const offersHtml = OFFERS.map(o => {
    const price = o.cur === 'EUR' ? o.price.replace('€', '€') : o.price;
    return `
      <div class="offer ${o.best ? 'best' : ''}">
        <div class="price">${escapeHtml(price)}</div>
        <div class="days">${o.days} jours</div>
        <button class="buy" data-pass="${escapeHtml(o.pass)}" data-cents="${o.cents}" data-cur="${escapeHtml(o.cur)}">${Tl.buy(o.price, o.days)}</button>
        ${o.best ? '<span class="badge">' + Tl.best + '</span>' : ''}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${Tl.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="description" content="${escapeHtml(Tl.meta(region.name))}">
<title>${escapeHtml(Tl.title(region.name))}</title>
<style>
:root{--bg:#0b1015;--card:#131a24;--ink:#e6edf3;--muted:#9aa3af;--accent:#00786C;--accent2:#00A39B;--danger:#B87A00;}
html,body{margin:0;padding:0;font-family:'Bricolage Grotesque',system-ui,sans-serif;background:var(--bg);color:var(--ink);}
header{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.06);}
.logo{font-weight:700;font-size:1.1rem;letter-spacing:.04em;color:#fff;}
nav a{color:var(--muted);text-decoration:none;margin-left:16px;font-size:.9rem;}
nav a:hover{color:#fff;}
main{max-width:700px;margin:0 auto;padding:32px 20px;}
h1{font-size:2rem;margin:0 0 8px;line-height:1.2;}
.sub{color:var(--muted);margin-bottom:24px;font-size:1.05rem;}
.offers{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:24px 0;}
.offer{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:20px;position:relative;}
.offer.best{border-color:var(--accent);background:rgba(0,120,108,.06);}
.badge{position:absolute;top:-10px;right:-8px;background:var(--accent);color:#fff;font-size:.75rem;padding:2px 8px;border-radius:10px;}
.price{font-size:2rem;font-weight:700;margin:8px 0 4px;}
.days{color:var(--muted);font-size:.9rem;margin-bottom:12px;}
button.buy{width:100%;padding:14px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;}
button.buy:hover{background:var(--accent2);}
button.buy:disabled{opacity:.6;cursor:not-allowed;}
.msg{margin-top:16px;padding:12px;border-radius:8px;display:none;}
.msg.ok{background:#0b2a22;color:#a7f3d0;border:1px solid var(--accent);}
.msg.err{background:#2a160e;color:#fecaca;border:1px solid var(--danger);}
footer{margin-top:40px;padding:24px;color:var(--muted);font-size:.85rem;border-top:1px solid rgba(255,255,255,.06);}
</style>
</head>
<body>
<header>
  <div class="logo">Sargasses ${region.name}</div>
  <nav><a href="/">${Tl.lang === 'fr' ? 'Retour à la carte' : Tl.lang === 'en' ? 'Back to map' : 'Volver al mapa'}</a></nav>
</header>
<main>
<h1>${escapeHtml(Tl.h1(region.name))}</h1>
<p class="sub">${Tl.sub}</p>
<div class="offers">${offersHtml}</div>
<div id="msg" class="msg"></div>
<form id="payForm" style="margin-top:24px;">
  <label style="display:block;margin-bottom:8px;color:var(--ink);">${Tl.email}</label>
  <input type="email" id="email" required placeholder="vous@exemple.com" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;font-size:1rem;">
  <button type="button" id="payBtn" style="width:100%;padding:14px;margin-top:12px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;">${Tl.secure}</button>
</form>
<div id="status" style="margin-top:12px;font-size:.95rem;color:var(--muted);"></div>
</main>
<footer>Sargasses ${region.name} · ${Tl.lang === 'fr' ? 'Météo marine Copernicus' : Tl.lang === 'en' ? 'Copernicus Marine weather' : 'Meteorología marina Copernicus'} · <a href="/" style="color:var(--accent);text-decoration:none;">Retour à la carte</a></footer>
<script>
const btn = document.getElementById('payBtn');
const email = document.getElementById('email');
const msg = document.getElementById('msg');
const status = document.getElementById('status');
const offers = document.querySelectorAll('.button');
let selected = null;
document.querySelectorAll('.buy').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.buy').forEach(b2 => b2.classList.remove('active'));
  b.classList.add('active');
  selected = { pass: b.dataset.pass, cents: b.dataset.cents, cur: b.dataset.cur };
});
btn.addEventListener('click', async () => {
  if (!selected) { showMsg('${Tl.bad}', 'err'); return; }
  if (!email.value || !email.value.includes('@')) { showMsg('${Tl.bad}', 'err'); return; }
  btn.disabled = true; btn.textContent = '${Tl.lang === 'fr' ? 'Paiement...' : Tl.lang === 'en' ? 'Paying...' : 'Pagando...'}';
  try {
    const r = await fetch('/api/mollie.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_payment',
        pass: selected.pass,
        currency: selected.cur,
        cents: Number(selected.cents),
        email: email.value,
        lang: '${Tl.lang}',
        metadata: { source: 'web_premium', region: '${region.id}' }
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'payment failed');
    if (j.checkoutUrl) { window.location.href = j.checkoutUrl; }
    else throw new Error(j.error || 'no checkout url');
  } catch (e) { showMsg('${Tl.err}', 'err'); btn.disabled = false; btn.textContent = '${Tl.lang === 'fr' ? 'Paiement sécurisé Mollie' : Tl.lang === 'en' ? 'Secure Mollie payment' : 'Pago seguro Mollie'}'; }
});
function showMsg(text, type) {
  msg.textContent = text; msg.className = 'msg ' + type; msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 5000);
}
</script>
</body>
</html>`;
}

module.exports = { buildPage, OFFERS };