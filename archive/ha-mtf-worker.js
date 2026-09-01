// ══════════════════════════════════════════════════════════════════
//  HA·MTF ULTRA — Cloudflare Worker  v5.1.0 — FULL ADAPTIVE
// 
//  v5.1 NOUVELLES FONCTIONNALITÉS :
//  ┌─ KELLY CRITERION
//  │   Taille de position optimale basée sur WR réel + ratio gain/perte
//  │   Kelly% = WR - (1-WR)/RR  (RR = ratio reward/risk moyen)
//  │   Cappé à 25% pour éviter le surdimensionnement
//  │   Fallback sur RISK_NORMAL si pas assez de données
//  │
//  ├─ SUPPORT / RÉSISTANCE DYNAMIQUES
//  │   Détecte les pivots hauts/bas sur les 100 dernières bougies 1H
//  │   Entre près des S/R (dans les 0.3%) → meilleur R/R
//  │   Skip si prix trop loin de tout niveau (trade dans le vide)
//  │   Bonus score +1.5 si prix rebondit sur S/R confirmé
//  │
//  ├─ FILTRE MACRO (news FOMC/CPI)
//  │   Liste des dates/heures de news hardcodées (mise à jour mensuelle)
//  │   Bloque les trades 30 min avant et 15 min après chaque news
//  │   Push de notification si news détectée pendant un trade ouvert
//  │
//  ├─ TP DYNAMIQUE SELON ADX
//  │   ADX < 20 (range)  : TP partiel dès +50% PnL (sort vite)
//  │   ADX 20-35 (trend) : TP partiel dès +100% PnL (standard)
//  │   ADX > 35 (fort)   : TP partiel dès +150% PnL (laisse courir)
//  │   Trailing trigger adapté de la même façon
//  │
//  ├─ APPRENTISSAGE AMÉLIORÉ
//  │   Kelly mis à jour après chaque trade
//  │   WR par régime + par session stockés séparément
//  │   Ratio gain/perte moyen calculé glissant
//  │
//  └─ v5.0 CONSERVÉ
//      ADX, BB, EMA, régimes, score 5.0, 24h/24, reset-guard
//
//  SECRETS : KRAKEN_API_KEY, KRAKEN_SECRET
//  ENDPOINTS NOUVEAUX :
//    GET /sr     → niveaux S/R détectés
//    GET /kelly  → paramètres Kelly actuels
// ══════════════════════════════════════════════════════════════════
//  PARAMÈTRES v5.1
// ════════════════════════════════════════════════════════════════
//
// ── Singularity ──────────────────────────────────────────────────
const SCORE_SINGULARITY  = 9.5;
const ADX_SINGULARITY    = 35;
const BB_EXPANSION_SING  = 1.5;
//
// ── Risk (fallback si Kelly insuffisant) ────────────────────────
const RISK_NORMAL        = 5.0;
const RISK_SINGULARITY   = 25.0;
const KELLY_MIN_TRADES   = 15;    // nb trades minimum avant d'utiliser Kelly
const KELLY_CAP          = 0.20;  // Kelly cappé à 20% du capital max
const KELLY_FRAC         = 0.5;   // Half-Kelly (plus conservateur)
//


// ── Levier ──────────────────────────────────────────────────────
const LEVERAGE_NORMAL       = 50;
const LEVERAGE_SINGULARITY  = 50;  // Kraken max = 50x
const LEVERAGE_SNIPER       = 45;  // Score ≥ 8.0
const LEVERAGE_SCALP        = 40;  // Score 5.0-7.9


// ── Score ────────────────────────────────────────────────────────
const SCORE_THRESHOLD_BASE        = 7.0;  // optimisé: backtest montre PF 3.75 et +$196 (était 5.0)
const SCORE_THRESHOLD_SINGULARITY = 6.5;   // singularity


// ── Régimes ──────────────────────────────────────────────────────
const ADX_TREND_STRONG   = 30;
const ADX_TREND_WEAK     = 20;
const BB_PERIOD          = 20;
const BB_MULT            = 2.0;
const BB_EXPANSION_MIN   = 1.3;
const EMA_FAST           = 20;
const EMA_SLOW           = 50;


// ── Protection ──────────────────────────────────────────────────
const CONSEC_SL_MAX             = 3;
const CONSEC_SL_MAX_SINGULARITY = 6;
const DAILY_LOSS_PCT_NORMAL     = 15.0;
const DAILY_LOSS_PCT_SING       = 40.0;
const SL_COOLDOWN               = 3;  // réduit de 5 à 3 pour reprendre plus vite


// ── ATR SL ──────────────────────────────────────────────────────
const ATR_PERIOD         = 14;
const ATR_MULT_BASE      = 1.5;
const SL_MIN_PCT         = 0.40;
const SL_MAX_PCT         = 2.00;


// ── Trailing / TP dynamiques ─────────────────────────────────────
// Valeurs de base — ajustées dynamiquement selon ADX
// Trailing selon régime : serré en range, large en trend fort
const TRAIL_PCT          = 0.50;   // trend normal — confirmé optimal par backtest
const TRAIL_PCT_STRONG   = 0.35;   // trend fort — confirmé optimal par backtest
const TRAIL_PCT_RANGE    = 0.80;   // range — confirmé optimal (serré = catastrophique -$162)
const TRAIL_STEP_PNL     = 0;    // désactivé — trailing continu à chaque run
const BE_TRIGGER         = 10;   // breakeven dès +10% PnL — MEILLEUR RÉSULTAT backtest (PF 1.30, +$66)
const TP_PARTIAL_RATIO   = 0.5;
const TP_ALERT_1         = 15;   // alerte push dès +15%
const TP_ALERT_2         = 30;   // alerte push à +30%


// ── Pyramiding — ajoute à la position sur les big moves ─────────
// Conditions : trend fort + signal toujours valide + PnL suffisant
// Chaque ajout est financé par les gains accumulés (pas le capital initial)
// Chaque ajout est financé par les gains accumulés (pas le capital initial)
const PYRAMID_STEPS = [
  { pct: 20, addRatio: 0.40, label: "Pyramid 1" }, // à +20% → ajoute 40% (après breakeven sécurisé)
  { pct: 40, addRatio: 0.35, label: "Pyramid 2" }, // à +40% → ajoute 35%
  { pct: 70, addRatio: 0.25, label: "Pyramid 3" }, // à +70% → ajoute 25%
];
const PYRAMID_MIN_ADX   = 25;   // ADX min pour pyramider (trend confirmé)
const PYRAMID_MIN_SCORE = 4.0;  // score min pour pyramider (signal encore valide)


// ── Free Trade Progressif ───────────────────────────────────────
// Une fois en profit, le SL protège les gains — on ne risque plus le capital
// Paliers de protection automatique :
// Pas de TP fixe — on laisse courir, le trailing sort sur retournement
// Seuls les SL protects bougent — pas de fermetures partielles forcées
const FREE_TRADE_STEPS = [
  { pct: 10,  slProtect: 0,    closeRatio: 0,    label: "Breakeven"      }, // SL = entrée (aligné avec BE_TRIGGER=10)
  { pct: 20,  slProtect: 0.40, closeRatio: 0.30, label: "TP +20%"        }, // ferme 30%, protège 40% gains
  { pct: 50,  slProtect: 0.65, closeRatio: 0,    label: "SL à +32%"      }, // protège 65% gains
  { pct: 75,  slProtect: 0.80, closeRatio: 0,    label: "SL à +60%"      }, // protège 80% gains
  { pct: 100, slProtect: 0.85, closeRatio: 0,    label: "SL à +85%"      }, // protège 85% gains
];
// À +20% : ferme 30% pour sécuriser, le reste court avec trailing + pyramiding
// slProtect = % des gains protégés par le SL
// closeRatio = % de la position initiale fermée à ce palier


// ── Detection de vélocité — spike = sortie rapide avant retournement
const VELOCITY_SPIKE_PCT  = 0.6;   // si BTC fait +0.6% en 1 bougie → spike détecté (plus réactif, était 0.8)
const VELOCITY_SPIKE_TP   = 0.70;  // ferme 70% de la position sur un spike
const VELOCITY_CANDLES    = 3;     // analyse les 3 dernières bougies pour la vélocité


// TP dynamique — stratégie : TP rapide à 20%, laisser courir jusqu'à 40-100%+
// Pas de TP fixe — trailing démarre à 15% min, sort sur retournement
const TP_ADX_RANGE  = 999;   // désactivé — trailing gère la sortie
const TP_ADX_NORMAL = 999;   // désactivé
const TP_ADX_STRONG = 999;   // désactivé
const TRAIL_ADX_RANGE  = 5;  // trailing démarre à +5% PnL (= ~0.11% BTC à ×45)
const TRAIL_ADX_NORMAL = 5;  // idem
const TRAIL_ADX_STRONG = 5;  // idem


// ── S/R ──────────────────────────────────────────────────────────
const SR_LOOKBACK        = 100;   // bougies 1H pour détecter pivots
const SR_PROXIMITY_PCT   = 0.40;  // % de proximité pour considérer "près d'un S/R"
const SR_BONUS_SCORE     = 1.5;   // bonus score si rebond sur S/R confirmé
const SR_MIN_TOUCHES     = 2;     // nb de touches min pour valider S/R


// ── Filtre macro news ────────────────────────────────────────────
const NEWS_BLOCK_BEFORE  = 30;   // minutes avant la news
const NEWS_BLOCK_AFTER   = 15;   // minutes après la news


// ── Système de paliers inversé ──────────────────────────────────
// Plus le capital est petit → plus on risque (rien à perdre)
// Plus le capital est grand → plus on protège
const TIERS = [
  { maxBalance: 300,    risk: 20, leverage: 40,  name: "🔥 YOLO"       }, // 20% max (pro: 1-2% mais on est agressif)
  { maxBalance: 1000,   risk: 12, leverage: 40,  name: "⚡ AGRESSIF"   },
  { maxBalance: 3000,   risk: 8,  leverage: 50,  name: "📈 CROISSANCE" },
  { maxBalance: 10000,  risk: 5,  leverage: 50,  name: "💼 STABLE"     },
  { maxBalance: Infinity, risk: 3, leverage: 25, name: "🛡 PROTECTION" },
];
const TIER_WR_MIN    = 0.50;


// ── Protection du capital (House Money) ─────────────────────────
// Quand le solde dépasse un multiple du capital initial
// → on "retire" la mise de base et on ne trade qu'avec les gains
// Les checkpoints définissent :
//   multiplier  = quand on atteint X fois le capital initial
//   protectPct  = % du solde TOTAL qui devient protégé (retirable)
//   tradePct    = % du solde restant utilisé pour trader
const HOUSE_CHECKPOINTS = [
  { multiplier: 2,   protectPct: 0.40, tradePct: 0.60, label: "×2"  },  // 200$ → 80$ protégés, trade sur 120$
  { multiplier: 3,   protectPct: 0.45, tradePct: 0.55, label: "×3"  },  // 300$ → 135$ protégés
  { multiplier: 5,   protectPct: 0.50, tradePct: 0.50, label: "×5"  },  // 500$ → 250$ protégés
  { multiplier: 10,  protectPct: 0.55, tradePct: 0.45, label: "×10" },  // 1000$ → 550$ protégés
  { multiplier: 20,  protectPct: 0.60, tradePct: 0.40, label: "×20" },  // 2000$ → 1200$ protégés
  { multiplier: 50,  protectPct: 0.65, tradePct: 0.35, label: "×50" },  // 5000$ → 3250$ protégés
  { multiplier: 100, protectPct: 0.70, tradePct: 0.30, label: "×100"}, // 10000$ → 7000$ protégés
];  // WR min pour rester sur le palier actuel
const TIER_WR_WINDOW = 5;     // trades récents pour évaluer le WR


// ── Apprentissage ────────────────────────────────────────────────
const LEARN_EVERY        = 1;   // apprend après chaque trade
const LEARN_WINDOW       = 50;
const WR_LOW_THRESHOLD   = 0.40;
const WR_HIGH_THRESHOLD  = 0.65;
const WR_RANGE_DISABLE   = 0.45;  // augmenté de 0.35 — backtest montre WR RANGE 28.6% = destructeur
const THRESH_ADJ_MAX     = 2.0;
const THRESH_ADJ_MIN     = -1.0;
const SL_MULT_ADJ_MAX    = 1.0;
const SL_MULT_ADJ_MIN    = -0.3;


// ── Autres ──────────────────────────────────────────────────────
const CONSEC_MIN         = 1;
const VOL_MULT           = 1.10;
const RSI_PERIOD         = 14;
const RSI_LONG_MIN       = 45;   // assoupli — RSI 50 ok pour longer
const RSI_SHORT_MAX      = 55;   // assoupli — RSI 50 ok pour shorter
const FUNDING_MAX        = 999;   // désactivé — funding Kraken API inutilisable
const FUNDING_MAX_SING   = 999;   // idem
const SIM_CAPITAL        = 100;
const SIM_TRADE_TIMEOUT  = 240;
const MAX_LOGS           = 100;
const WEIGHTS = { "6H": 3.0, "1H": 2.5, "5M": 2.0, "3M": 1.5, "1M": 1.0 };


// ── Calendrier macro (news FOMC/CPI/NFP) ───────────────────────
// Format : "YYYY-MM-DDTHH:MM" UTC
// ⚠️  À METTRE À JOUR CHAQUE MOIS
const MACRO_NEWS = [
  // FOMC 2026 (décision ~18h00-19h00 UTC)
  "2026-03-18T18:00", "2026-04-29T18:00", "2026-06-17T18:00",
  "2026-07-29T18:00", "2026-09-16T18:00", "2026-10-28T18:00",
  "2026-12-09T19:00",
  // CPI US 2026 (13h30 UTC)
  "2026-04-10T13:30", "2026-05-13T13:30", "2026-06-10T13:30",
  "2026-07-14T13:30", "2026-08-12T13:30", "2026-09-10T13:30",
  "2026-10-14T13:30", "2026-11-12T13:30", "2026-12-10T13:30",
  // NFP US 2026 (1er vendredi, 13h30 UTC)
  "2026-04-03T13:30", "2026-05-08T13:30", "2026-06-05T13:30",
  "2026-07-03T13:30", "2026-08-07T13:30", "2026-09-04T13:30",
  "2026-10-02T13:30", "2026-11-06T13:30", "2026-12-04T13:30",
];


// ── Logs ─────────────────────────────────────────────────────────
let _logs = [];
function log(type, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  _logs.push({ ts, type, msg });
  console.log(`[${type}] ${msg}`);
}


// ── Kraken Auth ──────────────────────────────────────────────────
function b64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function bytesToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
async function bitmexSign(secret, verb, path, expires, body) {
  const msg = verb + path + expires + (body || "");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function bReq(env, method, path, params = {}) {
  const apiKey = env.BITMEX_API_KEY || env.KRAKEN_API_KEY;
  const secret = env.BITMEX_SECRET || env.KRAKEN_SECRET;
  if (!apiKey) throw new Error("API KEY manquant");
  const expires = String(Math.floor(Date.now() / 1000) + 60);
  const isGet = method === "GET";
  const qs = isGet && Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
  const fullPath = path + qs;
  const body = (!isGet && Object.keys(params).length) ? JSON.stringify(params) : "";
  const sig = await bitmexSign(secret, method, fullPath, expires, body);
  const resp = await fetch(`https://www.bitmex.com${fullPath}`, {
    method,
    headers: {
      "api-key": apiKey, "api-expires": expires, "api-signature": sig,
      ...(body ? { "Content-Type": "application/json" } : {}),
      "Accept": "application/json",
    },
    ...(body ? { body } : {}),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch(e) { throw new Error(`BitMEX: ${text.slice(0,100)}`); }
}
const bGet  = (env, path, p = {}) => bReq(env, "GET",  path, p);
const bPost = (env, path, p = {}) => bReq(env, "POST", path, p);


// ── v5.2 WebSocket Price ─────────────────────────────────────
async function getWSPrice(env) {
  try {
    if (!env.HA_KV) return null;
    const raw = await env.HA_KV.get("ws_price");
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Prix valide seulement si < 10 secondes
    if (Date.now() - data.ts > 10000) return null;
    return data;
  } catch { return null; }
}

async function getWSCandles(env, limit) {
  try {
    if (!env.HA_KV) return null;
    const raw = await env.HA_KV.get("ws_candles_1m");
    if (!raw) return null;
    const candles = JSON.parse(raw);
    if (!candles.length) return null;
    return candles.slice(-limit);
  } catch { return null; }
}

async function fetchCandles(interval, limit) {
  const binSize = {"1m":"1m","3m":"5m","5m":"5m","1h":"1h","6h":"1h"}[interval] || "1m";
  const fetchLimit = interval === "6h" ? limit * 6 + 6 : limit;
  const url = `https://www.bitmex.com/api/v1/trade/bucketed?binSize=${binSize}&symbol=${SYMBOL}&count=${fetchLimit}&reverse=true&partial=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`BitMEX ${interval}: HTTP ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data) || !data.length) throw new Error(`BitMEX no candles ${interval}`);
  const raw = data.reverse().map(c => ({
    open: parseFloat(c.open), high: parseFloat(c.high),
    low:  parseFloat(c.low), close: parseFloat(c.close),
    volume: parseFloat(c.homeNotional || c.volume || 0),
    time: new Date(c.timestamp).getTime(),
  }));
  // Regroupe 3 bougies 1M en bougies 3M
  if (interval === "3m") {
    const candles3m = [];
    for (let i = 0; i + 2 < raw.length; i += 3) {
      const g = raw.slice(i, i+3);
      candles3m.push({
        open: g[0].open, high: Math.max(...g.map(x=>x.high)),
        low: Math.min(...g.map(x=>x.low)), close: g[2].close,
        volume: g.reduce((s,x)=>s+x.volume,0), time: g[0].time,
      });
    }
    // Groupe en cours
    const rem = raw.length % 3;
    if (rem > 0) {
      const g = raw.slice(-rem);
      candles3m.push({
        open: g[0].open, high: Math.max(...g.map(x=>x.high)),
        low: Math.min(...g.map(x=>x.low)), close: g[g.length-1].close,
        volume: g.reduce((s,x)=>s+x.volume,0), time: g[0].time,
      });
    }
    return candles3m.slice(-limit);
  }
  if (interval !== "6h") return raw;
  // Regroupe 6 bougies 1H en 1 bougie 6H
  const candles6h = [];
  for (let i = 0; i + 5 < raw.length; i += 6) {
    const group = raw.slice(i, i + 6);
    candles6h.push({
      open:   group[0].open,
      high:   Math.max(...group.map(c => c.high)),
      low:    Math.min(...group.map(c => c.low)),
      close:  group[group.length-1].close,
      volume: group.reduce((s,c) => s + c.volume, 0),
      time:   group[0].time,
    });
  }
  return candles6h.slice(-limit);
}

async function fetchFundingRate() {
  // NOTE : Kraken fundingRate retourne des valeurs aberrantes (ex: -0.28 = -28%)
  // Ce champ est inutilisable — on retourne 0 et on désactive le filtre funding
  // Le filtre funding est de toute façon bypassé (FUNDING_MAX = 50)
  try {
    const d = await fetch(`https://www.bitmex.com/api/v1/instrument?symbol=${SYMBOL}&columns=fundingRate,markPrice`).then(r=>r.json());
    const t = Array.isArray(d) ? d[0] : {};
    if (!t) return 0;
    // On retourne la valeur brute pour l'affichage uniquement
    // mais le filtre ne bloque jamais (FUNDING_MAX = 50%)
    return parseFloat(t.fundingRate || 0);
  } catch { return 0; }
}


// ── Compte & Ordres ──────────────────────────────────────────────
async function getBalance(env) {
  // XBTUSDT linéaire — marge en USDT
  const data = await bGet(env, "/api/v1/user/margin", { currency: "USDt" });
  const walletUSDT = parseFloat(data.walletBalance ?? data.marginBalance ?? 0) / 1e6;
  log("ACC2", `wallet:${walletUSDT.toFixed(2)} USDT`);
  return walletUSDT;
}

async function getPosition(env) {
  const data = await bGet(env, "/api/v1/position", { filter: JSON.stringify({ symbol: SYMBOL }), count: 1 });
  const pos = Array.isArray(data) ? data[0] : null;
  if (!pos || !pos.isOpen) return { qty: 0, side: null, entry: 0, pnl: 0, isOpen: false };
  // XBTUSDT linéaire : currentQty en BTC (multipliée par 1e8 = satoshis)
  const qty = Math.abs(pos.currentQty || 0) / 1e8; // satoshis → BTC
  const side = (pos.currentQty || 0) > 0 ? "long" : "short";
  const entryPrice = parseFloat(pos.avgEntryPrice || 70000);
  const pnlUSDT = parseFloat(pos.unrealisedPnl || 0) / 1e6; // micro-USDT → USDT
  return { qty, side, entry: entryPrice, pnl: pnlUSDT, isOpen: qty > 0 };
}

async function setLeverage(env, lev) {
  try {
    // leverage > 0 = isolated, 0 = cross margin sur BitMEX
    await bPost(env, "/api/v1/position/leverage", { symbol: SYMBOL, leverage: lev });
    log("ORDER", `✅ Levier ×${lev} isolated`);
  } catch(e) { 
    log("ORDER", `⚠️ Levier: ${e.message}`);
    // Retry once
    try {
      await new Promise(r => setTimeout(r, 1000));
      await bPost(env, "/api/v1/position/leverage", { symbol: SYMBOL, leverage: lev });
      log("ORDER", `✅ Levier ×${lev} isolated (retry)`);
    } catch(e2) { log("ORDER", `❌ Levier échoué: ${e2.message}`); }
  }
}

const roundQty   = q => Math.floor(q * 1000) / 1000;
const roundPrice = p => Math.round(p * 10) / 10;
// ── v5.2 ── Filtre imbalance + entrée limit agressive ────────────────
async function getOrderBookImbalance() {
  try {
    const data = await fetch(`https://www.bitmex.com/api/v1/quote?symbol=${SYMBOL}&count=1&reverse=true`).then(r => r.json());
    if (!Array.isArray(data) || !data[0]) return 0.5;
    const q = data[0];
    const bidSize = parseFloat(q.bidSize || 0);
    const askSize = parseFloat(q.askSize || 0);
    if (bidSize + askSize === 0) return 0.5;
    return bidSize / (bidSize + askSize);
  } catch { return 0.5; }
}

async function placeAggressiveLimit(env, side, qty, refPrice) {
  const qtyBTC = Math.max(Math.round(qty * 1000) / 1000, 0.001);
  const offset = side === "long" ? 0.5 : -0.5;
  const limitPx = roundPrice(refPrice + offset);
  const o = await bPost(env, "/api/v1/order", {
    symbol: SYMBOL, side: side === "long" ? "Buy" : "Sell",
    orderQty: qtyBTC, ordType: "Limit", price: limitPx,
    timeInForce: "GoodTillCancel"
  });
  if (o.error) throw new Error(`Limit rejeté: ${JSON.stringify(o.error)}`);
  log("ORDER", `✅ LIMIT ${side.toUpperCase()} ${qtyBTC}BTC @ $${limitPx} — id:${o.orderID}`);
  return { orderId: o.orderID, expectedFill: limitPx };
}

async function placeMarket(env, side, qty, lev) {
  let refPrice = 70000;
  try { refPrice = (await fetchCandles("1m", 2))[1]?.close || refPrice; } catch {}
  return placeAggressiveLimit(env, side, qty, refPrice);
}

async function placeStopMarket(env, side, stopPrice, qty) {
  const qtyBTC = Math.round(qty * 1000) / 1000;
  if (qtyBTC < 0.001) throw new Error(`Qty SL trop petite: ${qtyBTC}`);
  const o = await bPost(env, "/api/v1/order", {
    symbol: SYMBOL, side: side === "long" ? "Sell" : "Buy",
    orderQty: qtyBTC, ordType: "Stop",
    stopPx: parseFloat(stopPrice.toFixed(1)), execInst: "MarkPrice,Close",
  });
  if (o.error) { log("ORDER", `⚠️ SL erreur: ${JSON.stringify(o.error).slice(0,100)}`); throw new Error(`SL rejeté: ${o.error.message}`); }
  log("ORDER", `🛑 SL @ $${parseFloat(stopPrice.toFixed(1))} — id:${o.orderID}`);
  return { orderId: o.orderID };
}

async function cancelOrder(env, orderId) {
  if (!orderId) return;
  try { await bReq(env, "DELETE", "/api/v1/order", { orderID: orderId }); }
  catch (e) { log("ORDER", `Annul ${orderId}: ${e.message}`); }
}

async function replaceSL(env, oldId, side, newStop) {
  await cancelOrder(env, oldId);
  return placeStopMarket(env, side, newStop);
}

async function closePosition(env, side, qty) {
  const qtyBTC = Math.max(Math.round(qty * 1000) / 1000, 0.001);
  const o = await bPost(env, "/api/v1/order", {
    symbol: SYMBOL,
    side: side === "long" ? "Sell" : "Buy",
    orderQty: qtyBTC,
    ordType: "Market",
    execInst: "Close",
  });
  if (o.error) throw new Error(`Close rejeté: ${JSON.stringify(o.error)}`);
  log("ORDER", `✅ CLOSE ${side.toUpperCase()} ${qtyBTC}BTC — id:${o.orderID}`);
  return o;
}

async function checkOpenOrders(env) {
  try {
    const data = await bGet(env, '/api/v1/order', { symbol: SYMBOL, filter: JSON.stringify({open: true}) });
    for (const o of data || [])
      log('ORD', `#${o.order_id} ${o.orderType} ${o.side} @ ${parseFloat(o.stopPrice||o.limitPrice||0).toFixed(1)}`);
    return data || [];
  } catch (e) { log("ORD", `checkOpenOrders: ${e.message}`); return []; }
}


// ── Onesignal ────────────────────────────────────────────────────
const OS_APP_ID  = "e0f823a1-f427-4672-b1c1-b3d5d6ff88cf";
const OS_API_KEY = process.env.ONESIGNAL_API_KEY_MQ || '';
async function push(title, body, data = {}) {
  try {
    const resp = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": `Basic ${btoa(OS_APP_ID + ":" + OS_API_KEY)}`,
      },
      body: JSON.stringify({ app_id: OS_APP_ID, headings: { en: title }, contents: { en: body }, ...data }),
    });
    if (!resp.ok) throw new Error(`OS ${resp.status}`);
    return await resp.json();
  } catch (e) { log("OS", `Erreur: ${e.message}`); }
}


// ── Web3 / Bitmex Helper ─────────────────────────────────────────
// (helper functions already included above)