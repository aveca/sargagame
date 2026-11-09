// scripts/lib/premium-page.cjs
// Génère la page /premium/ pour une région donnée.
//
// SOURCE DE VÉRITÉ DES PRIX : le serveur.
//   • public/api/mollie.php          → $passPrices (EUR/USD) + surcharge USD +15 %
//   • public/api/create-checkout.php → $ALLOWED_CENTS (anti-tampering)
//   • workers/sargagame/index.js     → PASS_PRICES / DAYS_TABLE
// La parité est verrouillée par tests/unit/price-parity.test.cjs.
//
// Aucun secret n'est stocké ici ; la page appelle l'endpoint /api/mollie.php existant.
//
// RÈGLE DE FONDERIE (identique à src/lib/pricing.js) :
//   • le serveur VALIDE le montant de BASE puis APPLIQUE la surcharge USD
//     de haute saison (+15 %, juin→novembre, SAUF trip7) ;
//   • le client ENVOIE la base et AFFICHE le montant effectif.
//   → envoyer 1379¢ en USD serait REJETÉ (montant hors base autorisée) ;
//     afficher 11,99 $ alors que 13,79 $ est débité serait une divergence.
'use strict';

// Passs B2C — paiement unique, JAMAIS d'abonnement.
//   eur : prix serveur exact (mollie.php $passPrices).
//   usd : p30 = 11.99 (mollie.php) ; trip7 = 5.99 (allowlist create-checkout.php
//         USD = [599]) ; season = null → NON commercialisé en USD
//         (le serveur n'a pas de montant déterministe → pas d'offre affichable).
//
// ⚠️ 2026-11-09 — le pass « SOS » (1 €, rapport 24 h) a été RETIRÉ du
// parcours client : il n'est plus affiché, plus vendu, plus créable côté
// serveur. La LIVRAISON des paiements `sos` DÉJÀ encaissés reste possible
// (backfill contrôlé + webhook) : encaisser sans livrer serait un trou de
// confiance. Ne pas réintroduire `sos` dans OFFERS.
const OFFERS = Object.freeze([
  { pass: 'trip7', cents: 499, cur: 'EUR', price: '4,99 €', days: 7 },
  { pass: 'p30',  cents: 1499, cur: 'EUR', price: '14,99 €', days: 30, best: true },
  { pass: 'season', cents: 1999, cur: 'EUR', price: '19,99 €', days: 210 },
]);

const USD_OFFERS = Object.freeze([
  { pass: 'trip7', cents: 599, cur: 'USD', price: '$5.99', days: 7 },
  { pass: 'p30',  cents: 1199, cur: 'USD', price: '$11.99', days: 30, best: true },
]);

// Domaines à facturation USD (miroir de regions/*.json currency = "USD").
const USD_DOMAINS = Object.freeze([
  'sargassummiami.com',
  'sargassumpuntacana.com',
  'sargassumcancun.com',
  'sargazotulum.com',
  'sargassumbarbados.com',
]);

// Surcharge USD de haute saison (mollie.php) : juin→novembre, sauf trip7.
const USD_HIGH_SEASON_MONTHS = Object.freeze([6, 7, 8, 9, 10, 11]);
const USD_HIGH_SEASON_RATE = 0.15;

function isUsdHighSeason(date) {
  const m = (date || new Date()).getMonth() + 1;
  return USD_HIGH_SEASON_MONTHS.indexOf(m) !== -1;
}

// Montant EFFECTIF débité (centimes) = base +15 % si USD hors saison haute.
function effectiveCents(offer, date) {
  if (offer.cur !== 'USD' || offer.pass === 'trip7') return offer.cents;
  if (!isUsdHighSeason(date)) return offer.cents;
  return Math.round(offer.cents * (1 + USD_HIGH_SEASON_RATE));
}

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
    email: 'Votre email (pour recevoir l’accès)',
    bad: 'Entrez un email valide.',
    err: 'Paiement impossible. Réessayez.',
    legal: 'Accès à durée fixe — sans reconduction automatique.',
    highSeason: (base, eff) => `Tarif haute saison (+15 %) déjà inclus : ${eff} (base ${base})`,
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
    highSeason: (base, eff) => `High-season rate (+15%) already included: ${eff} (base ${base})`,
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
    highSeason: (base, eff) => `Tarifa alta temporada (+15 %) ya incluida: ${eff} (base ${base})`,
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, String.fromCharCode(38,97,109,112))
    .replace(/</g, String.fromCharCode(38,108,116))
    .replace(/>/g, String.fromCharCode(38,103,116))
    .replace(/"/g, String.fromCharCode(38,113,117,111,116));
}
// Formate un montant en centimes pour la devise affichée.
function money(cents, cur, lang) {
  const v = cents / 100;
  if (cur === 'USD') return '$' + v.toFixed(2);
  if (lang === 'en') return '€' + v.toFixed(2);
  return v.toFixed(2).replace('.', ',') + ' €';
}

// BLOCS DE PRIX EMBARQUÉS (JSON) : la page choisit son catalogue selon le
// domaine ET applique la surcharge USD de haute saison au moment de l'affichage.
const CATALOGUE = {
  eur: OFFERS.map((o) => ({ pass: o.pass, cents: o.cents, cur: o.cur, price: o.price, days: o.days, best: !!o.best })),
  usd: USD_OFFERS.map((o) => ({ pass: o.pass, cents: o.cents, cur: o.cur, price: o.price, days: o.days, best: !!o.best })),
};

function buildPage(region) {
  const Tl = T[region.primaryLang] || T.fr;
  const lang = Tl.lang;
  const catalogueJson = JSON.stringify(CATALOGUE);
  const usdDomainsJson = JSON.stringify(USD_DOMAINS);
  const monthsJson = JSON.stringify(USD_HIGH_SEASON_MONTHS);
  const rate = USD_HIGH_SEASON_RATE;

  return `<!DOCTYPE html>
<html lang="${Tl.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="description" content="${escapeHtml(Tl.meta(region.name))}">
<link rel="canonical" href="https://${escapeHtml(region.domain || 'sargasses-martinique.com')}/premium/">
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
.hi{display:none;color:var(--muted);font-size:.78rem;margin:-6px 0 10px;}
.hi.on{display:block;}
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
  <div class="logo">Sargasses ${escapeHtml(region.name)}</div>
  <nav><a href="/">${lang === 'fr' ? 'Retour à la carte' : lang === 'en' ? 'Back to map' : 'Volver al mapa'}</a></nav>
</header>
<main>
  <h1>${escapeHtml(Tl.h1(region.name))}</h1>
  <p class="sub">${escapeHtml(Tl.sub)}</p>
  <div class="offers" id="offers"></div>
  <div id="msg" class="msg"></div>
  <form id="payForm" style="margin-top:24px;">
    <label style="display:block;margin-bottom:8px;color:var(--ink);">${escapeHtml(Tl.email)}</label>
    <input type="email" id="email" required placeholder="vous@exemple.com" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;font-size:1rem;">
    <button type="button" id="payBtn" style="width:100%;padding:14px;margin-top:12px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;">${escapeHtml(Tl.secure)}</button>
  </form>
  <div id="status" style="margin-top:12px;font-size:.95rem;color:var(--muted);"></div>
  <p style="margin-top:18px;color:var(--muted);font-size:.85rem;">${escapeHtml(Tl.legal)}</p>
</main>
<footer>Sargasses ${escapeHtml(region.name)} · ${lang === 'fr' ? 'Météo marine Copernicus' : lang === 'en' ? 'Copernicus Marine weather' : 'Meteorología marina Copernicus'} · <a href="/" style="color:var(--accent);text-decoration:none;">${lang === 'fr' ? 'Retour à la carte' : lang === 'en' ? 'Back to map' : 'Volver al mapa'}</a></footer>
<script>
const CATALOGUE = ${catalogueJson};
const USD_DOMAINS = ${usdDomainsJson};
const HIGH_MONTHS = ${monthsJson};
const RATE = ${rate};
const IS_USD = USD_DOMAINS.indexOf(String(location.hostname).toLowerCase()) !== -1;
const CUR = IS_USD ? 'usd' : 'eur';
const OFFERS = CATALOGUE[CUR];
const HI = IS_USD && HIGH_MONTHS.indexOf(new Date().getMonth() + 1) !== -1;
function money(c){ const v = c / 100; return CUR === 'usd' ? '$' + v.toFixed(2) : (${JSON.stringify(lang)} === 'en' ? '€' + v.toFixed(2) : v.toFixed(2).replace('.', ',') + ' €'); }
function eff(o){ return (CUR === 'usd' && o.pass !== 'trip7' && HI) ? Math.round(o.cents * (1 + RATE)) : o.cents; }
function label(o){ return o.days + (${JSON.stringify(lang)} === 'en' ? ' days' : ${JSON.stringify(lang)} === 'es' ? ' días' : ' jours'); }
function buyLabel(o){ return ${JSON.stringify(Tl.buy('X', 'Y'))}.replace('X', String(o.days)).replace('Y', money(eff(o))); }
const host = document.getElementById('offers');
host.innerHTML = OFFERS.map(function(o){
  const base = money(o.cents), e = money(eff(o));
  const hi = (eff(o) !== o.cents) ? '<div class="hi on">' + ${JSON.stringify(Tl.highSeason('BASE', 'EFF'))}.replace('BASE', base).replace('EFF', e) + '</div>' : '';
  return '<div class="offer ' + (o.best ? 'best' : '') + '">' +
    '<div class="price">' + e + '</div>' +
    '<div class="days">' + label(o) + '</div>' + hi +
    '<button class="buy" data-pass="' + o.pass + '" data-cents="' + o.cents + '" data-cur="' + o.cur + '">' + buyLabel(o) + '</button>' +
    (o.best ? '<span class="badge">' + ${JSON.stringify(Tl.best)} + '</span>' : '') +
    '</div>';
}).join('');
const btn = document.getElementById('payBtn');
const email = document.getElementById('email');
const msg = document.getElementById('msg');
let selected = null;
document.querySelectorAll('.buy').forEach(function(b) { b.addEventListener('click', function() {
  document.querySelectorAll('.buy').forEach(function(b2){ b2.classList.remove('active'); });
  b.classList.add('active');
  selected = { pass: b.dataset.pass, cents: b.dataset.cents, cur: b.dataset.cur };
}); });
function showMsg(text, type) {
  msg.textContent = text; msg.className = 'msg ' + type; msg.style.display = 'block';
  setTimeout(function(){ msg.style.display = 'none'; }, 5000);
}
btn.addEventListener('click', async function() {
  if (!selected) { showMsg(${JSON.stringify(Tl.bad)}, 'err'); return; }
  if (!email.value || !email.value.includes('@')) { showMsg(${JSON.stringify(Tl.bad)}, 'err'); return; }
  btn.disabled = true; btn.textContent = ${JSON.stringify(lang === 'fr' ? 'Paiement...' : lang === 'en' ? 'Paying...' : 'Pagando...')};
  try {
    const r = await fetch('/api/mollie.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_payment',
        pass: selected.pass,
        cur: selected.cur,
        cents: Number(selected.cents),
        email: email.value,
        lang: ${JSON.stringify(lang)},
        metadata: { source: 'web_premium', region: ${JSON.stringify(region.id || 'mq')} }
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'payment failed');
    if (j.checkoutUrl) { window.location.href = j.checkoutUrl; }
    else throw new Error(j.error || 'no checkout url');
  } catch (e) { showMsg(${JSON.stringify(Tl.err)}, 'err'); btn.disabled = false; btn.textContent = ${JSON.stringify(Tl.secure)}; }
});
</script>
</body>
</html>`;
}

module.exports = { buildPage, OFFERS, USD_OFFERS, USD_DOMAINS, effectiveCents, isUsdHighSeason, money };
