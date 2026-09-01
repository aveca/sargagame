import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, createContext, useContext, Component, Suspense, lazy } from "react";
import { computeScore as _computeBeachScore } from "./lib/score.js";
import { COAST_ZONES } from "../scripts/lib/coast-zones.js";
import { getCanonicalSlug, beachPageUrl } from "./lib/slug-resolver.js";
import { useSwipeClose } from "./useSwipeClose.js";
import { useFrustrationDetection } from "./useFrustrationDetection.js";
import { submitBeachReport, fetchApprovedReports, supabaseConfigured, logAnalyticsEvent, sgUid } from "./supabasePhotos.js";
import { AroundMeController } from "./world/AroundMeController";
import { beginCheckout, viewPromotion, getPlanMeta } from "./ga4-ecommerce.js";
import "./Themes.css";
import "./app-runtime.css";
import "./sg-ux-2026.css";
import "./sprint20.css";
import { detectExtendedRegion } from "./lib/regions-extended.js";
import RegionNav from "./components/RegionNav.jsx";
import LeadCapture from "./LeadCapture.jsx";
import WidgetEmbed from "./WidgetEmbed.jsx";
const lazyWithRetry = (imp) => lazy(() => imp().then((m) => {
  try {
    sessionStorage.removeItem("sg_chunk_reload");
  } catch (_) {
  }
  return m;
}).catch(() => new Promise((r) => setTimeout(r, 1500)).then(imp)).catch((err) => {
  try {
    if (!sessionStorage.getItem("sg_chunk_reload")) {
      sessionStorage.setItem("sg_chunk_reload", "1");
      window.location.reload();
      return new Promise(() => {
      });
    }
  } catch (_) {
  }
  throw err;
}));
const ArenaSplash = lazyWithRetry(() => import("./ArenaSplash.jsx"));
const ArenaOnboarding = lazyWithRetry(() => import("./ArenaOnboarding.jsx"));
const VeilleurHero = lazyWithRetry(() => import("./VeilleurHero.jsx"));
const DemoReel = lazyWithRetry(() => import("./DemoReel.jsx"));
const LazyVerticalesMap = lazyWithRetry(() => import("./VerticalesMap.jsx"));
const VERTICALES_OFF = (() => {
  try {
    return /[?&]verticals=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const SGNAV_OFF = (() => {
  try {
    return /[?&]sgnav=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const LazyBriefMatin = lazyWithRetry(() => import("./BriefMatin.jsx"));
const BRIEF_OFF = (() => {
  try {
    return /[?&]brief=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const DiveTransition = lazyWithRetry(() => import("./DiveTransition.jsx"));
const LazyHomeAZ = lazyWithRetry(() => import("./HomeAZ"));
const LazyHomeJuicy = lazyWithRetry(() => import("./HomeJuicy.jsx"));
const LazyVeilleurRepond = lazyWithRetry(() => import("./VeilleurRepond.jsx"));
const VEILLE_OFF = (() => {
  try {
    return /[?&]veille=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const LazyChasse = lazyWithRetry(() => import("./ChasseHome"));
const LazyWorldMapView = lazyWithRetry(() => import("./WorldMapView"));
const LazyWorldView3D = lazyWithRetry(() => import("./WorldView3D"));
const LazyComicDetail = lazyWithRetry(() => import("./ComicDetail"));
const LazyPaidOnboarding = lazyWithRetry(() => import("./PaidOnboarding"));
const LazyWelcomePoste = lazyWithRetry(() => import("./WelcomePoste"));
const POSTE_OFF = (() => {
  try {
    return /[?&]poste=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const LazyAccountSheet = lazyWithRetry(() => import("./AccountSheet"));
const ACCOUNT_OFF = (() => {
  try {
    return /[?&]account=0/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const LazyCleanList = lazyWithRetry(() => import("./CleanList"));
const LazyConditions = lazyWithRetry(() => import("./Conditions"));
const ScrollStory = lazyWithRetry(() => import("./ScrollStory.jsx"));
const LazyContextVeilleur = lazyWithRetry(() => import("./ContextVeilleur.jsx"));
const StationStory = lazyWithRetry(() => import("./StoryScenes.jsx").then((m) => ({ default: m.StationStory })));
const MapIntroStory = lazyWithRetry(() => import("./StoryScenes.jsx").then((m) => ({ default: m.MapIntroStory })));
const SargaChat = lazyWithRetry(() => import("./SargaChat.jsx"));
const SargaChatB2B = lazyWithRetry(() => import("./SargaChatB2B.jsx"));
const WhatsNewJournal = lazyWithRetry(() => import("./WhatsNewJournal.jsx"));
const STATION_SLUGS = /* @__PURE__ */ new Set(["comprendre-sargasses", "detection-satellite-sargasses", "danger-sargasses-h2s", "nettoyer-sargasses", "methode-carte", "en/understanding-sargassum", "en/satellite-sargassum-detection"]);
class ErrBound extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(e) {
    return { err: e };
  }
  componentDidCatch(e) {
    try {
      sgLogError("errbound", e);
    } catch (_) {
    }
    try {
      this.props.onError && this.props.onError(e);
    } catch (_) {
    }
  }
  render() {
    if (this.state.err) {
      if (this.props.fallback !== void 0) return this.props.fallback;
      return React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120, padding: 16, textAlign: "center", fontFamily: "system-ui,sans-serif", fontSize: 14, color: "rgba(255,255,255,.6)" } },
        React.createElement("span", null, "Une erreur s'est produite. R\xE9essayez ou rafra\xEEchissez la page.")
      );
    }
    return this.props.children;
  }
}
const __R = typeof __REGION__ !== "undefined" && __REGION__ || null;
const __REL = typeof __RELIABILITY__ !== "undefined" && __RELIABILITY__ || null;
const __COMM = typeof __COMMUNITY__ !== "undefined" && Number(__COMMUNITY__) || 0;
const IS_NEW_REGION = !!(__R && __R.id !== "mq" && __R.id !== "gp");
const REGION = IS_NEW_REGION ? __R : null;
const SUPPORT_EMAIL = IS_NEW_REGION ? REGION.emails?.support || "support@" + REGION.domain : "alerte@sargasses-martinique.com";
const US_UNITS = !!(IS_NEW_REGION && REGION.countryCode === "US");
const fmtTemp = (c) => US_UNITS ? `${Math.round(c * 9 / 5 + 32)}\xB0F` : `${c}\xB0C`;
const fmtWind = (k) => US_UNITS ? `${Math.round(k * 0.621371)} mph` : `${k} km/h`;
const fmtHeight = (m) => US_UNITS ? `${(m * 3.28084).toFixed(1)} ft` : `${m}m`;
const fmtRain = (mm) => US_UNITS ? `${(mm / 25.4).toFixed(2)} in` : `${mm}mm`;
import { getPathname } from "./utils/getPathname.js";
const LangCtx = createContext("fr");
function useLang() {
  return useContext(LangCtx) || "fr";
}
function getLang() {
  try {
    const _d = IS_NEW_REGION ? REGION.primaryLang : "fr";
    if (typeof window === "undefined") return _d;
    const p = getPathname();
    if (p.startsWith("/es")) return "es";
    if (p.startsWith("/en")) return "en";
    return _d;
  } catch {
    return IS_NEW_REGION ? REGION.primaryLang : "fr";
  }
}
function _t(lang, fr, en, es) {
  return lang === "es" ? es : lang === "en" ? en : fr;
}
function fmtPassPrice(cents, cur, lang) {
  if (cur === "usd") return "$" + (cents / 100).toFixed(2);
  return lang === "en" ? "\u20AC" + (cents / 100).toFixed(2) : (cents / 100).toFixed(2).replace(".", ",") + " \u20AC";
}
let _stripeJsPromise = null;
function loadStripeJs() {
  if (typeof window !== "undefined" && window.Stripe) return Promise.resolve();
  if (_stripeJsPromise) return _stripeJsPromise;
  _stripeJsPromise = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://js.stripe.com/v3";
    sc.onload = res;
    sc.onerror = (e) => {
      _stripeJsPromise = null;
      rej(e);
    };
    document.head.appendChild(sc);
  });
  return _stripeJsPromise;
}
let _mollieJsPromise = null;
function loadMollieJs() {
  if (typeof window !== "undefined" && window.Mollie) return Promise.resolve();
  if (_mollieJsPromise) return _mollieJsPromise;
  _mollieJsPromise = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://js.mollie.com/v1/mollie.js";
    sc.onload = res;
    sc.onerror = (e) => {
      _mollieJsPromise = null;
      rej(e);
    };
    document.head.appendChild(sc);
  });
  return _mollieJsPromise;
}
function walletAvail() {
  if (typeof window === "undefined" || !window.PaymentRequest) {
    return { apple: false, google: false };
  }
  const cacheKey = "sg_wallet_avail";
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
    }
  }
  const check = async () => {
    const apple = await (async () => {
      try {
        const req = new window.PaymentRequest([{ supportedMethods: "https://apple.com/apple-pay" }], { total: { label: "Test", amount: { currency: "EUR", value: "0.01" } } });
        return await req.canMakePayment();
      } catch {
        return false;
      }
    })();
    const google = await (async () => {
      try {
        const req = new window.PaymentRequest([{ supportedMethods: "https://google.com/pay" }], { total: { label: "Test", amount: { currency: "EUR", value: "0.01" } } });
        return await req.canMakePayment();
      } catch {
        return false;
      }
    })();
    const result = { apple, google };
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
    setTimeout(() => sessionStorage.removeItem(cacheKey), 5 * 60 * 1e3);
    return result;
  };
  return check();
}
const MOL_FIELD = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 46,
  padding: "4px 13px",
  borderRadius: 11,
  marginBottom: 13,
  border: "1px solid rgba(255,255,255,.14)",
  // Fond SOLIDE (matche le backgroundColor posé sur l'input Mollie dans l'iframe) :
  // l'input opaque tue le blanc d'autofill iOS sans laisser de couture de teinte.
  background: "#241837",
  display: "flex",
  alignItems: "center"
};
const MOL_LABEL = { display: "block", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.62)", marginBottom: 6, letterSpacing: ".01em" };
let _ppSdkPromise = null;
function loadPayPalSdk(clientId) {
  if (typeof window !== "undefined" && window.paypal) return Promise.resolve();
  if (_ppSdkPromise) return _ppSdkPromise;
  _ppSdkPromise = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) + "&vault=true&intent=subscription&components=buttons";
    sc.onload = res;
    sc.onerror = (e) => {
      _ppSdkPromise = null;
      rej(e);
    };
    document.head.appendChild(sc);
  });
  return _ppSdkPromise;
}
const FC_DAY_MAP = {
  en: { "Auj.": "Today", "Dem.": "Tmrw", Dim: "Sun", Lun: "Mon", Mar: "Tue", Mer: "Wed", Jeu: "Thu", Ven: "Fri", Sam: "Sat" },
  es: { "Auj.": "Hoy", "Dem.": "Ma\xF1.", Dim: "Dom", Lun: "Lun", Mar: "Mar", Mer: "Mi\xE9", Jeu: "Jue", Ven: "Vie", Sam: "S\xE1b" }
};
const fcDay = (d, lang) => lang === "fr" ? d.day : (FC_DAY_MAP[lang] || {})[d.day] || d.day;
const SCORE_LABEL_I18N = { EXCEPTIONNEL: { en: "EXCEPTIONAL", es: "EXCEPCIONAL" }, SUPER: { en: "GREAT", es: "GENIAL" }, BON: { en: "GOOD", es: "BUENO" }, MOYEN: { en: "AVERAGE", es: "REGULAR" }, PASSABLE: { en: "FAIR", es: "PASABLE" }, "\xC9VITER": { en: "AVOID", es: "EVITAR" }, NON: { en: "NO", es: "NO" } };
const scoreLabelFor = (label, lang) => lang === "fr" ? label : SCORE_LABEL_I18N[label]?.[lang === "es" ? "es" : "en"] || label;
const C = {
  bg: "#FDFCF7",
  bgD: "#F7F5EF",
  card: "#FFFFFF",
  cardS: "#FAFAFA",
  ink: "#0D0D0D",
  mid: "#5A5A5A",
  mute: "#5A5A5A",
  border: "rgba(0,0,0,.04)",
  borderM: "rgba(0,0,0,.08)",
  gold: "#E8A800",
  goldL: "#FFC72C",
  goldLL: "#FFE47A",
  goldBg: "rgba(232,168,0,.07)",
  goldBgL: "rgba(255,199,44,.15)",
  // Accents « teal » REPRIS en néon magenta/violet (branding sunset Le Veilleur).
  // Noms conservés (consommés partout) ; seules les valeurs changent → cascade.
  teal: "#156a96",
  tealL: "#1c7fb0",
  tealBg: "rgba(28,127,176,.1)",
  green: "#27c46b",
  greenL: "#1ea75a",
  greenBg: "rgba(39,196,107,.1)",
  amber: "#B87A00",
  amberBg: "rgba(184,122,0,.1)",
  red: "#e8322a",
  redBg: "rgba(232,50,42,.1)",
  sarg: "#8B6914",
  sargL: "#A67C1A",
  sargBg: "rgba(139,105,20,.12)",
  night: "#190c2c",
  night2: "#120821",
  ocean: "#014F86"
};
Object.assign(C, {
  inkD: "#160a26",
  card2: "#241246",
  orCTA: "#FFC72C",
  orLink: "#E8A800",
  orPale: "#FFE08A",
  orGlit: "#FFD884",
  tealS: "#6a2f9e",
  tealL2: "#1c7fb0",
  seaD: "#08251F",
  seaM: "#1A5852",
  skyInk: "#0B2230",
  sargD: "#5d400e",
  sargM: "#7a5c14",
  sargL2: "#8a6c1c",
  sargV: "#a8862a",
  stClean: "#27c46b",
  stMod: "#ffb02e",
  stAvoid: "#e8322a",
  stAvoidL: "#F4845F",
  gradClean: ["#27c46b", "#1ea75a"],
  gradMod: ["#ffb02e", "#d98a00"],
  gradAvoid: ["#e8322a", "#b8281f"],
  satBody: "#5b3a8e",
  satTop: "#FFC72C",
  satWing: "#5b3a8e",
  moonCol: "#c9a0ff"
});
const SCENE_TOKENS = {
  phases: {
    dawn: { sky: ["#141B33", "#3A4A6B", "#B86E7E", "#F2A968"], seaT: "#235862", seaB: "#0A2630", sand: "#C9A86A", sandNight: "#15110D", rim: "#F2A968", sun: "set", glit: "#F2A968" },
    day: { sky: ["#1A6FA8", "#3E9BC4", "#7BC8D8", "#AEE0E6"], seaT: "#15706A", seaB: "#0B3A34", sand: "#C9A86A", sandNight: "#15110D", rim: "#FFFFFF", sun: "high", glit: "#FDFCF7" },
    golden: { sky: ["#0B2230", "#155A5A", "#C97E3A", "#F2B05E"], seaT: "#1A5852", seaB: "#08251F", sand: "#1C1712", sandNight: "#15110D", rim: "#FFD884", sun: "set", glit: "#FFD884" },
    night: { sky: ["#040B16", "#0A1B2E", "#10303B", "#16424A"], seaT: "#0A2E2E", seaB: "#04140F", sand: "#15110D", sandNight: "#15110D", rim: "#9ADCD4", sun: "moon", glit: "#9ADCD4" }
  },
  sargasse: { base: "#7a5c14", dark: "#5d400e", light: "#8a6c1c", glint: "#a8862a", strand: "#6b4a12" },
  sat: { body: "#5b3a8e", top: "#FFC72C", lens: "#07201E" }
};
const TY = {
  title: { fontFamily: "'Anton',sans-serif", fontWeight: 400, letterSpacing: ".01em", textTransform: "uppercase" },
  ui: { fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" },
  mono: { fontFamily: "ui-monospace,SFMono-Regular,'JetBrains Mono',monospace" },
  wordmark: { fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase" }
};
const RAD = { sm: 10, md: 14, lg: 16, xl: 18, pill: 999 };
const SPRING = { pop: "cubic-bezier(.34,1.56,.64,1)", snap: "cubic-bezier(.175,.885,.32,1.275)", sheet: "cubic-bezier(.32,.72,.33,1)" };
const SG_BLOB_OUTER = "M400 216 C442 216 494 268 494 306 C494 348 442 396 400 396 C358 396 306 348 306 306 C306 268 358 216 400 216 Z";
const SG_BLOB_INNER = "M400 232 C436 232 478 270 478 306 C478 344 436 380 400 380 C364 380 322 344 322 306 C322 270 364 232 400 232 Z";
const SG_BLOB_SCORE_Y = 318;
const SG_BLOB_LEGEND_Y = 346;
const VEILLEUR_MOOD = {
  // Veilleur canonique (BIBLE marque) : boîtier ENCRE, accents teal/vert de marque, antenne or.
  // Humeurs lisibles couleur+forme : calme=teal/vert, scan=or, vigilant=ambre-marque, alerte=corail.
  serein: { wing: "#009E8E", halo: "#1EC8B0", lens: "#22C55E", ant: "#FFC72C", tilt: 0, ring: null },
  vigilant: { wing: "#B87A00", halo: "#B87A00", lens: "#FFD27A", ant: "#FFD27A", tilt: 0, ring: null },
  alerte: { wing: "#E8522A", halo: "#E8522A", lens: "#F4845F", ant: "#F4845F", tilt: -8, ring: "#E8522A" },
  scan: { wing: "#009E8E", halo: "#1EC8B0", lens: "#FFC72C", ant: "#FFC72C", tilt: 0, ring: null }
};
function reliabilityHref(lang) {
  return IS_NEW_REGION ? lang === "es" ? "/fiabilidad/" : "/reliability/" : "/fiabilite/";
}
function moodFromScore(score) {
  return typeof score !== "number" ? "scan" : score >= 70 ? "serein" : score >= 40 ? "vigilant" : "alerte";
}
function moodFromStatus(s2) {
  return s2 === "clean" ? "serein" : s2 === "moderate" ? "vigilant" : s2 === "avoid" ? "alerte" : "scan";
}
function verdictMeta(status, lang) {
  const M = {
    clean: { color: "#22C55E", emoji: "\u{1F60E}", verb: _t(lang, "Vas-y", "Go", "Adelante") },
    moderate: { color: "#F59E0B", emoji: "\u{1F610}", verb: _t(lang, "Prudence", "Careful", "Cuidado") },
    avoid: { color: "#E8522A", emoji: "\u{1F6AB}", verb: _t(lang, "Pas aujourd'hui", "Not today", "Hoy no") }
  };
  return M[status] || { color: "#1c7fb0", emoji: "\u{1F6F0}\uFE0F", verb: _t(lang, "Le veilleur scanne", "Scanning", "Escaneando") };
}
async function shareBeachCard(beach, lang, forecast) {
  try {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    if (!x) return false;
    const RR = (xx, yy, w, h, r) => {
      x.beginPath();
      if (x.roundRect) x.roundRect(xx, yy, w, h, r);
      else x.rect(xx, yy, w, h);
    };
    const g2 = x.createLinearGradient(0, 0, 0, H);
    [[0, "#0B2230"], [0.5, "#155A5A"], [0.82, "#C97E3A"], [1, "#F2B05E"]].forEach((s2) => g2.addColorStop(s2[0], s2[1]));
    x.fillStyle = g2;
    x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(255,216,132,.26)";
    x.beginPath();
    x.arc(W / 2, 820, 320, 0, 7);
    x.fill();
    x.fillStyle = "rgba(255,216,132,.5)";
    x.beginPath();
    x.arc(W / 2, 820, 150, 0, 7);
    x.fill();
    x.textAlign = "center";
    x.fillStyle = "rgba(255,255,255,.82)";
    x.font = "400 36px 'Anton',system-ui,sans-serif";
    x.fillText("S A R G A S S E S", W / 2, 118);
    x.save();
    x.translate(W / 2, 258);
    x.fillStyle = "rgba(95,211,201,.16)";
    x.beginPath();
    x.arc(0, 0, 78, 0, 7);
    x.fill();
    x.fillStyle = "#5b3a8e";
    RR(-84, -18, 44, 36, 8);
    x.fill();
    RR(40, -18, 44, 36, 8);
    x.fill();
    x.strokeStyle = "#3fd07f";
    x.lineWidth = 6;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(0, -42);
    x.lineTo(0, -68);
    x.stroke();
    x.fillStyle = "#3fd07f";
    x.beginPath();
    x.arc(0, -72, 8, 0, 7);
    x.fill();
    x.fillStyle = "#5b3a8e";
    RR(-40, -40, 80, 80, 20);
    x.fill();
    x.fillStyle = "#FFC72C";
    RR(-40, -40, 80, 26, 20);
    x.fill();
    x.fillStyle = "#07201E";
    x.beginPath();
    x.arc(0, 8, 24, 0, 7);
    x.fill();
    x.fillStyle = "#3fd07f";
    x.beginPath();
    x.arc(0, 8, 16, 0, 7);
    x.fill();
    x.fillStyle = "#EAFBF8";
    x.beginPath();
    x.arc(-6, 2, 6, 0, 7);
    x.fill();
    x.restore();
    x.fillStyle = "#fff";
    x.font = "400 96px 'Anton',system-ui,sans-serif";
    const words = (beach.name || "").toUpperCase().split(" ");
    let line = "";
    const lines = [];
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (x.measureText(t).width > W - 150 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const L = lines.slice(0, 3);
    let ny = 560 - (L.length - 1) * 52;
    for (const l of L) {
      x.fillText(l, W / 2, ny);
      ny += 104;
    }
    const vm = verdictMeta(beach.status, lang);
    x.fillStyle = vm.color;
    x.font = "800 56px 'Bricolage Grotesque',system-ui,sans-serif";
    const sc = typeof beach.score === "number" ? "  " + beach.score + "/100" : "";
    x.fillText(vm.verb.toUpperCase() + sc, W / 2, ny + 44);
    const days = (forecast || []).slice(0, 3);
    if (days.length) {
      const cw = 150, sx = W / 2 - days.length * cw / 2 + cw / 2, dy = H - 310;
      days.forEach((d, i) => {
        x.fillStyle = verdictMeta(d.status, lang).color;
        x.beginPath();
        x.arc(sx + i * cw, dy, 32, 0, 7);
        x.fill();
        x.fillStyle = "rgba(255,255,255,.72)";
        x.font = "600 28px 'Bricolage Grotesque',system-ui,sans-serif";
        x.fillText((d.day || "").slice(0, 5), sx + i * cw, dy + 74);
      });
    }
    const ds = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { day: "numeric", month: "long" });
    x.fillStyle = "rgba(255,255,255,.72)";
    x.font = "500 32px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(ds + "  \xB7  " + _scDomain(), W / 2, H - 86);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png", 0.92));
    if (!blob) return false;
    const file = new File([blob], "ma-plage.png", { type: "image/png" });
    const text = _t(lang, beach.name + " aujourd'hui \u2014 vu par le Veilleur \u{1F6F0}\uFE0F", beach.name + " today \u2014 seen by the Watchman \u{1F6F0}\uFE0F", beach.name + " hoy \u2014 visto por el Vig\xEDa \u{1F6F0}\uFE0F");
    let url;
    try {
      if (!/[?&]sharelink=0/.test(window.location.search)) {
        const link = beachPageUrl(beach);
        if (link) url = link;
      }
    } catch (_) {
    }
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(url ? { files: [file], text, url } : { files: [file], text });
          return true;
        } catch (e) {
          if (e && e.name === "AbortError") return true;
          if (url) try {
            await navigator.share({ files: [file], text });
            return true;
          } catch (e2) {
            if (e2 && e2.name === "AbortError") return true;
          }
        }
      }
    } catch (_) {
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ma-plage.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    return true;
  } catch (e) {
    return false;
  }
}
function _scDomain() {
  try {
    if (typeof IS_NEW_REGION !== "undefined" && IS_NEW_REGION && typeof REGION !== "undefined" && REGION && REGION.domain) return REGION.domain;
  } catch (_) {
  }
  try {
    return (location.hostname || "").includes("guadeloupe") ? "sargasses-guadeloupe.com" : "sargasses-martinique.com";
  } catch (_) {
    return "sargasses-martinique.com";
  }
}
function _fichePageUrl(beach) {
  const origin = typeof window !== "undefined" && window.location && window.location.origin || "";
  try {
    if (!/[?&]sharelink=0/.test(window.location.search)) {
      const u = beachPageUrl(beach);
      if (u) return u;
    }
  } catch (_) {
  }
  const slug = getCanonicalSlug(beach);
  return slug ? origin + "/plages/" + slug + "/" : origin;
}
async function buildShareCard(opts) {
  opts = opts || {};
  const variant = opts.variant || "beach", lang = opts.lang || "fr";
  if (variant === "top") return _scTopCard(opts, lang);
  if (variant === "missed") return _scMissedCard(opts, lang);
  if (variant !== "streak") return shareBeachCard(opts.beach, lang, opts.forecast);
  try {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    if (!x) return false;
    const RR = (xx, yy, w, h, r) => {
      x.beginPath();
      if (x.roundRect) x.roundRect(xx, yy, w, h, r);
      else x.rect(xx, yy, w, h);
    };
    const g2 = x.createLinearGradient(0, 0, 0, H);
    [[0, "#0B2230"], [0.5, "#155A5A"], [0.82, "#C97E3A"], [1, "#F2B05E"]].forEach((s2) => g2.addColorStop(s2[0], s2[1]));
    x.fillStyle = g2;
    x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(255,216,132,.26)";
    x.beginPath();
    x.arc(W / 2, 820, 320, 0, 7);
    x.fill();
    x.fillStyle = "rgba(255,216,132,.5)";
    x.beginPath();
    x.arc(W / 2, 820, 150, 0, 7);
    x.fill();
    x.textAlign = "center";
    x.fillStyle = "rgba(255,255,255,.82)";
    x.font = "400 36px 'Anton',system-ui,sans-serif";
    x.fillText("S A R G A S S E S", W / 2, 118);
    x.save();
    x.translate(W / 2, 250);
    x.fillStyle = "rgba(95,211,201,.16)";
    x.beginPath();
    x.arc(0, 0, 78, 0, 7);
    x.fill();
    x.fillStyle = "#5b3a8e";
    RR(-84, -18, 44, 36, 8);
    x.fill();
    RR(40, -18, 44, 36, 8);
    x.fill();
    x.strokeStyle = "#3fd07f";
    x.lineWidth = 6;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(0, -42);
    x.lineTo(0, -68);
    x.stroke();
    x.fillStyle = "#3fd07f";
    x.beginPath();
    x.arc(0, -72, 8, 0, 7);
    x.fill();
    x.fillStyle = "#5b3a8e";
    RR(-40, -40, 80, 80, 20);
    x.fill();
    x.fillStyle = "#FFC72C";
    RR(-40, -40, 80, 26, 20);
    x.fill();
    x.fillStyle = "#07201E";
    x.beginPath();
    x.arc(0, 8, 24, 0, 7);
    x.fill();
    x.fillStyle = "#3fd07f";
    x.beginPath();
    x.arc(0, 8, 16, 0, 7);
    x.fill();
    x.fillStyle = "#EAFBF8";
    x.beginPath();
    x.arc(-6, 2, 6, 0, 7);
    x.fill();
    x.restore();
    const n = Math.max(0, opts.streak || 0), best = opts.best || n, gap = 96;
    x.fillStyle = "#FFD884";
    x.font = "400 130px 'Anton',system-ui,sans-serif";
    x.fillText("\u{1F525} " + n, W / 2, 500);
    x.fillStyle = "#fff";
    x.font = "400 58px 'Anton',system-ui,sans-serif";
    x.fillText(_t(lang, "JOURS DE VEILLE", "DAYS ON WATCH", "D\xCDAS DE VIG\xCDA"), W / 2, 584);
    const dots = Math.min(n, 21), per = 7;
    for (let i = 0; i < dots; i++) {
      const row = Math.floor(i / per), col = i % per, cnt = Math.min(dots - row * per, per), sx = W / 2 - (cnt - 1) * gap / 2;
      x.fillStyle = "#22C55E";
      x.beginPath();
      x.arc(sx + col * gap, 690 + row * 86, 32, 0, 7);
      x.fill();
    }
    x.fillStyle = "rgba(255,255,255,.92)";
    x.font = "800 44px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(_t(lang, "Tu fais mieux ?", "Beat my streak?", "\xBFMe superas?"), W / 2, H - 210);
    if (best > n) {
      x.fillStyle = "rgba(255,255,255,.6)";
      x.font = "600 30px 'Bricolage Grotesque',system-ui,sans-serif";
      x.fillText("\u2B50 " + _t(lang, "record " + best, "best " + best, "r\xE9cord " + best), W / 2, H - 160);
    }
    const ds = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { day: "numeric", month: "long" });
    x.fillStyle = "rgba(255,255,255,.72)";
    x.font = "500 32px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(ds + "  \xB7  " + _scDomain(), W / 2, H - 86);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png", 0.92));
    if (!blob) return false;
    const file = new File([blob], "ma-serie.png", { type: "image/png" });
    const text = _t(lang, "Ma s\xE9rie de veille des plages \u{1F6F0}\uFE0F\u{1F525} \u2014 tu fais mieux ?", "My beach-watch streak \u{1F6F0}\uFE0F\u{1F525} \u2014 beat it?", "Mi racha de vig\xEDa \u{1F6F0}\uFE0F\u{1F525} \u2014 \xBFme superas?");
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return true;
      }
    } catch (_) {
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ma-serie.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    return true;
  } catch (e) {
    return false;
  }
}
function _scChrome(x, W, H, RR, glyphY) {
  const g2 = x.createLinearGradient(0, 0, 0, H);
  [[0, "#0B2230"], [0.5, "#155A5A"], [0.82, "#C97E3A"], [1, "#F2B05E"]].forEach((s2) => g2.addColorStop(s2[0], s2[1]));
  x.fillStyle = g2;
  x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(255,216,132,.26)";
  x.beginPath();
  x.arc(W / 2, 820, 320, 0, 7);
  x.fill();
  x.fillStyle = "rgba(255,216,132,.5)";
  x.beginPath();
  x.arc(W / 2, 820, 150, 0, 7);
  x.fill();
  x.textAlign = "center";
  x.fillStyle = "rgba(255,255,255,.82)";
  x.font = "400 36px 'Anton',system-ui,sans-serif";
  x.fillText("S A R G A S S E S", W / 2, 118);
  x.save();
  x.translate(W / 2, glyphY || 258);
  x.fillStyle = "rgba(95,211,201,.16)";
  x.beginPath();
  x.arc(0, 0, 78, 0, 7);
  x.fill();
  x.fillStyle = "#5b3a8e";
  RR(-84, -18, 44, 36, 8);
  x.fill();
  RR(40, -18, 44, 36, 8);
  x.fill();
  x.strokeStyle = "#3fd07f";
  x.lineWidth = 6;
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(0, -42);
  x.lineTo(0, -68);
  x.stroke();
  x.fillStyle = "#3fd07f";
  x.beginPath();
  x.arc(0, -72, 8, 0, 7);
  x.fill();
  x.fillStyle = "#5b3a8e";
  RR(-40, -40, 80, 80, 20);
  x.fill();
  x.fillStyle = "#FFC72C";
  RR(-40, -40, 80, 26, 20);
  x.fill();
  x.fillStyle = "#07201E";
  x.beginPath();
  x.arc(0, 8, 24, 0, 7);
  x.fill();
  x.fillStyle = "#3fd07f";
  x.beginPath();
  x.arc(0, 8, 16, 0, 7);
  x.fill();
  x.fillStyle = "#EAFBF8";
  x.beginPath();
  x.arc(-6, 2, 6, 0, 7);
  x.fill();
  x.restore();
}
function _scFooter(x, W, H, lang) {
  const ds = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { day: "numeric", month: "long" });
  x.textAlign = "center";
  x.fillStyle = "rgba(255,255,255,.72)";
  x.font = "500 32px 'Bricolage Grotesque',system-ui,sans-serif";
  x.fillText(ds + "  \xB7  " + _scDomain(), W / 2, H - 86);
}
async function _scShip(cv, filename, text) {
  const blob = await new Promise((r) => cv.toBlob(r, "image/png", 0.92));
  if (!blob) return false;
  const file = new File([blob], filename, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return true;
    }
  } catch (_) {
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
  return true;
}
async function _scTopCard(opts, lang) {
  try {
    const beach = opts.beach;
    if (!beach) return false;
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    if (!x) return false;
    const RR = (xx, yy, w, h, r) => {
      x.beginPath();
      if (x.roundRect) x.roundRect(xx, yy, w, h, r);
      else x.rect(xx, yy, w, h);
    };
    _scChrome(x, W, H, RR, 258);
    x.textAlign = "center";
    RR(W / 2 - 210, 360, 420, 64, 32);
    x.fillStyle = "rgba(255,216,132,.16)";
    x.fill();
    x.strokeStyle = "#FFD884";
    x.lineWidth = 2;
    x.stroke();
    x.fillStyle = "#FFD884";
    x.font = "800 30px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(_t(lang, "\u2605 LA PLAGE DU JOUR", "\u2605 BEACH OF THE DAY", "\u2605 LA PLAYA DEL D\xCDA"), W / 2, 403);
    x.fillStyle = "#fff";
    x.font = "400 96px 'Anton',system-ui,sans-serif";
    const words = (beach.name || "").toUpperCase().split(" ");
    let line = "";
    const lines = [];
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (x.measureText(t).width > W - 150 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const L = lines.slice(0, 3);
    let ny = 560 - (L.length - 1) * 52;
    for (const l of L) {
      x.fillText(l, W / 2, ny);
      ny += 104;
    }
    const vm = verdictMeta(beach.status, lang);
    x.fillStyle = vm.color;
    x.font = "800 56px 'Bricolage Grotesque',system-ui,sans-serif";
    const sc = typeof beach.score === "number" ? "  " + beach.score + "/100" : "";
    x.fillText(vm.verb.toUpperCase() + sc, W / 2, ny + 24);
    const why = beach.status === "clean" ? _t(lang, "eau claire, signal satellite faible", "clear water, low satellite signal", "agua clara, se\xF1al baja") : beach.status === "moderate" ? _t(lang, "pr\xE9sence \xE9parse, \xE0 surveiller", "scattered, keep an eye out", "presencia dispersa, vigila") : _t(lang, "forte pr\xE9sence aujourd'hui", "strong presence today", "fuerte presencia hoy");
    x.fillStyle = "rgba(255,255,255,.82)";
    x.font = "600 30px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(why, W / 2, ny + 78);
    const days = (opts.forecast || beach.forecast || []).slice(0, 3);
    if (days.length) {
      const cw = 150, sx = W / 2 - days.length * cw / 2 + cw / 2, dy = H - 330;
      days.forEach((d, i) => {
        x.fillStyle = verdictMeta(d.status, lang).color;
        x.beginPath();
        x.arc(sx + i * cw, dy, 30, 0, 7);
        x.fill();
        x.fillStyle = "rgba(255,255,255,.72)";
        x.font = "600 26px 'Bricolage Grotesque',system-ui,sans-serif";
        x.fillText((d.day || "").slice(0, 5), sx + i * cw, dy + 66);
      });
    }
    x.fillStyle = "rgba(255,255,255,.9)";
    x.font = "700 30px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(beach.commune ? "\u{1F697} " + beach.commune : _t(lang, "Cap sur cette plage", "Head here today", "Vamos a esta playa"), W / 2, H - 180);
    _scFooter(x, W, H, lang);
    return await _scShip(cv, "plage-du-jour.png", _t(lang, "La plage du jour selon le Veilleur \u{1F6F0}\uFE0F\u2600\uFE0F", "Beach of the day per the Watchman \u{1F6F0}\uFE0F\u2600\uFE0F", "La playa del d\xEDa seg\xFAn el Vig\xEDa \u{1F6F0}\uFE0F\u2600\uFE0F"));
  } catch (e) {
    return false;
  }
}
async function _scMissedCard(opts, lang) {
  try {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    if (!x) return false;
    const RR = (xx, yy, w, h, r) => {
      x.beginPath();
      if (x.roundRect) x.roundRect(xx, yy, w, h, r);
      else x.rect(xx, yy, w, h);
    };
    _scChrome(x, W, H, RR, 250);
    x.textAlign = "center";
    const correct = !!opts.correct;
    x.font = "400 120px 'Anton',system-ui,sans-serif";
    x.fillText(correct ? "\u{1F3AF}" : "\u{1F30A}\u{1F937}", W / 2, 470);
    x.fillStyle = "#fff";
    x.font = "400 92px 'Anton',system-ui,sans-serif";
    x.fillText(correct ? _t(lang, "J'AI EU L'\u0152IL", "NAILED THE CALL", "TUVE OJO") : _t(lang, "LA MER M'A EU", "THE SEA FOOLED ME", "EL MAR ME ENGA\xD1\xD3"), W / 2, 600);
    x.fillStyle = "#FFD884";
    x.font = "800 46px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(correct ? _t(lang, "J'ai devin\xE9 le verdict du jour", "I called today's verdict", "Adivin\xE9 el veredicto de hoy") : _t(lang, "J'ai mal devin\xE9 le verdict du jour", "I misread today's verdict", "Fall\xE9 el veredicto de hoy"), W / 2, 672);
    const chips = [{ s: "clean", e: "\u{1F60E}", c: "#22C55E" }, { s: "moderate", e: "\u{1F610}", c: "#F59E0B" }, { s: "avoid", e: "\u{1F6AB}", c: "#E8522A" }];
    const cw = 210, gap = 24, total = chips.length * cw + (chips.length - 1) * gap, sx = W / 2 - total / 2, cy = 812;
    chips.forEach((ch, i) => {
      const cx = sx + i * (cw + gap), picked = ch.s === opts.guess;
      RR(cx, cy, cw, 96, 20);
      x.fillStyle = picked ? ch.c + "33" : "rgba(255,255,255,.06)";
      x.fill();
      x.strokeStyle = picked ? ch.c : "rgba(255,255,255,.18)";
      x.lineWidth = picked ? 4 : 2;
      x.stroke();
      x.fillStyle = picked ? "#fff" : "rgba(255,255,255,.5)";
      x.font = "400 52px 'Anton',system-ui,sans-serif";
      x.fillText(ch.e, cx + cw / 2, cy + 64);
      if (picked && !correct) {
        x.strokeStyle = "#fff";
        x.lineWidth = 7;
        x.lineCap = "round";
        x.beginPath();
        x.moveTo(cx + 20, cy + 20);
        x.lineTo(cx + cw - 20, cy + 96 - 20);
        x.stroke();
      }
    });
    const streak = Math.max(0, opts.streak || 0);
    if (!correct && streak > 0) {
      x.fillStyle = "rgba(255,255,255,.7)";
      x.font = "600 30px 'Bricolage Grotesque',system-ui,sans-serif";
      x.fillText("\u{1F525} " + _t(lang, "s\xE9rie interrompue \xE0 " + streak, "streak broke at " + streak, "racha rota en " + streak), W / 2, 988);
    }
    x.fillStyle = "#fff";
    x.font = "800 44px 'Bricolage Grotesque',system-ui,sans-serif";
    x.fillText(correct ? _t(lang, "Tu lis la mer aussi bien ?", "Read the sea as well?", "\xBFLees el mar igual?") : _t(lang, "Tu lis mieux la mer que moi ?", "Read the sea better than me?", "\xBFLees mejor el mar?"), W / 2, H - 200);
    _scFooter(x, W, H, lang);
    return await _scShip(cv, "defi-veilleur.png", correct ? _t(lang, "J'ai eu l'\u0153il du Veilleur \u{1F6F0}\uFE0F\u{1F3AF} \u2014 tu fais mieux ?", "Got the Watchman's eye \u{1F6F0}\uFE0F\u{1F3AF} \u2014 beat it?", "Tuve el ojo del Vig\xEDa \u{1F6F0}\uFE0F\u{1F3AF} \u2014 \xBFme superas?") : _t(lang, "Le d\xE9fi du Veilleur m'a eu \u{1F605} \u2014 tu fais mieux ? \u{1F6F0}\uFE0F", "The Watchman's Challenge fooled me \u{1F605} \u2014 beat it? \u{1F6F0}\uFE0F", "El Desaf\xEDo del Vig\xEDa me enga\xF1\xF3 \u{1F605} \u2014 \xBFme superas? \u{1F6F0}\uFE0F"));
  } catch (e) {
    return false;
  }
}
function Veilleur({ mood = "serein", size = 44, interactive = true }) {
  const m = VEILLEUR_MOOD[mood] || VEILLEUR_MOOD.serein;
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);
  const [headTilt, setHeadTilt] = useState(0);
  const svgRef = useRef(null);
  useEffect(() => {
    if (!interactive) return;
    let last = 0;
    const handleMouseMove = (e) => {
      const now = Date.now();
      if (now - last < 16) return;
      last = now;
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) / window.innerWidth;
      const dy = (e.clientY - centerY) / window.innerHeight;
      setMousePos({ x: Math.max(-1, Math.min(1, dx * 3)), y: Math.max(-1, Math.min(1, dy * 3)) });
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [interactive]);
  useEffect(() => {
    if (!interactive) return;
    const blink = () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 150);
    };
    const interval = setInterval(blink, 3e3 + Math.random() * 3e3);
    return () => clearInterval(interval);
  }, [interactive]);
  useEffect(() => {
    if (!interactive) return;
    let lastScroll = window.scrollY;
    const handleScroll = () => {
      const delta = window.scrollY - lastScroll;
      setHeadTilt(Math.max(-5, Math.min(5, delta * 0.1)));
      lastScroll = window.scrollY;
      setTimeout(() => setHeadTilt(0), 200);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [interactive]);
  const eyeOffsetX = mousePos.x * 1.2;
  const eyeOffsetY = mousePos.y * 0.8;
  return /* @__PURE__ */ React.createElement("svg", { ref: svgRef, width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React.createElement("g", { transform: "translate(32,33)" }, /* @__PURE__ */ React.createElement("g", { className: "sgv-bob" }, /* @__PURE__ */ React.createElement("g", { transform: `rotate(${m.tilt + headTilt})`, style: { transition: "transform 0.3s ease-out" } }, /* @__PURE__ */ React.createElement("circle", { r: "22", fill: m.halo, opacity: ".15" }), /* @__PURE__ */ React.createElement("circle", { r: "14", fill: m.lens, opacity: ".12" }), /* @__PURE__ */ React.createElement("rect", { x: "-27", y: "-5", width: "13", height: "11", rx: "2.5", fill: m.wing }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "-5", width: "13", height: "11", rx: "2.5", fill: m.wing }), /* @__PURE__ */ React.createElement("rect", { x: "-11", y: "-11", width: "22", height: "22", rx: "6", fill: "#0A1714" }), /* @__PURE__ */ React.createElement("rect", { x: "-11", y: "-11", width: "22", height: "7", rx: "6", fill: m.lens }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "-11", x2: "0", y2: "-19", stroke: m.ant, strokeWidth: "1.6", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-20", r: "1.9", fill: m.ant }), m.ring && /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "2", r: "6.6", fill: "none", stroke: m.ring, strokeWidth: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "2", r: "5.4", fill: "#0A1714" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "2", r: "4", fill: m.lens }), /* @__PURE__ */ React.createElement(
    "circle",
    {
      cx: -1.4 + eyeOffsetX,
      cy: 0.5 + eyeOffsetY,
      r: blinking ? 0 : 1.4,
      fill: "#EAFBF8",
      style: { transition: "cx 0.1s ease-out, cy 0.1s ease-out, r 0.1s" }
    }
  )))));
}
function ForecastTimeline3D({ forecast, isPremium, weatherDaily, lang }) {
  const containerRef = useRef(null);
  const [drawProgress, setDrawProgress] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const startTime = Date.now();
          const duration = 2e3;
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            setDrawProgress(progress);
            if (progress < 1) requestAnimationFrame(animate);
          };
          animate();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  if (!forecast || !forecast.length) return null;
  const days = forecast.slice(0, 7);
  const width = 100;
  const height = 80;
  const pointSpacing = width / (days.length - 1);
  const points = days.map((d, i) => {
    const afai = Number.isFinite(d.afai) ? d.afai : 0;
    const x = i * pointSpacing;
    const y = height - afai * 60 - 10;
    return { x, y, day: d };
  });
  const pathLength = drawProgress * points.length;
  const visiblePoints = points.slice(0, Math.ceil(pathLength));
  let pathD = "M" + visiblePoints.map((p, i) => {
    if (i === 0) return `${p.x} ${p.y}`;
    const prev = visiblePoints[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `Q${cpx} ${prev.y} ${p.x} ${p.y}`;
  }).join(" ");
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { position: "relative", width: "100%", padding: "20px 0" } }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      viewBox: `0 0 ${width} ${height}`,
      style: { width: "100%", height: "auto", overflow: "visible" },
      preserveAspectRatio: "none"
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "timelineGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#FFC72C", stopOpacity: "0.2" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#FFC72C", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "lineGrad", x1: "0", y1: "0", x2: "1", y2: "0" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#1EC8B0" }), /* @__PURE__ */ React.createElement("stop", { offset: "50%", stopColor: "#FFC72C" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#FF6B6B" }))),
    pathD && /* @__PURE__ */ React.createElement(
      "path",
      {
        d: pathD + ` L${visiblePoints[visiblePoints.length - 1].x} ${height} L${visiblePoints[0].x} ${height} Z`,
        fill: "url(#timelineGrad)",
        style: { transition: "d 0.3s ease-out" }
      }
    ),
    pathD && /* @__PURE__ */ React.createElement(
      "path",
      {
        d: pathD,
        fill: "none",
        stroke: "url(#lineGrad)",
        strokeWidth: "2",
        strokeLinecap: "round",
        style: { transition: "d 0.3s ease-out" }
      }
    ),
    visiblePoints.map((p, i) => /* @__PURE__ */ React.createElement("g", { key: i, style: { opacity: drawProgress >= i ? 1 : 0, transition: "opacity 0.3s" } }, /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: p.x,
        cy: p.y,
        r: "3",
        fill: p.day.status === "clean" ? "#1EC8B0" : p.day.status === "moderate" ? "#FFC72C" : "#FF6B6B",
        stroke: "#fff",
        strokeWidth: "1.5"
      }
    ), i === 0 && /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: p.x,
        cy: p.y,
        r: "3",
        fill: "none",
        stroke: "#1EC8B0",
        strokeWidth: "1",
        opacity: "0.6"
      },
      /* @__PURE__ */ React.createElement("animate", { attributeName: "r", from: "3", to: "8", dur: "1.5s", repeatCount: "indefinite" }),
      /* @__PURE__ */ React.createElement("animate", { attributeName: "opacity", from: "0.6", to: "0", dur: "1.5s", repeatCount: "indefinite" })
    )))
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 4px" } }, days.map((d, i) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: i,
      style: {
        textAlign: "center",
        opacity: drawProgress >= i ? 1 : 0,
        transition: "opacity 0.3s",
        fontSize: 11,
        fontFamily: "'Bricolage Grotesque',sans-serif",
        fontWeight: 600
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { color: "var(--sg-ink,#0A1714)", textTransform: "uppercase", letterSpacing: ".05em" } }, fcDay(d, lang)),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: "var(--sg-mid,#666)", marginTop: 2 } }, Math.round((d.afai || 0) * 100), "%")
  ))));
}
function ScoreBlob({ score, color, size = 84 }) {
  return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 100 100", "aria-hidden": "true", style: { display: "block" } }, /* @__PURE__ */ React.createElement("path", { d: "M50 7 C79 7 93 21 93 50 C93 79 79 93 50 93 C21 93 7 79 7 50 C7 21 21 7 50 7 Z", fill: color }), /* @__PURE__ */ React.createElement("ellipse", { cx: "37", cy: "29", rx: "25", ry: "15", fill: "#fff", opacity: ".16" }), /* @__PURE__ */ React.createElement("text", { x: "50", y: "59", fontFamily: "'Anton',sans-serif", fontSize: "40", fill: "#fff", textAnchor: "middle" }, score), /* @__PURE__ */ React.createElement("text", { x: "50", y: "75", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", fontSize: "11", fontWeight: "800", fill: "#fff", textAnchor: "middle", opacity: ".82" }, "/100"));
}
function ScoreBlobInteractive({ score, color, size = 84, onMorph, children }) {
  const [morphing, setMorphing] = useState(false);
  const handleClick = () => {
    if (morphing) return;
    setMorphing(true);
    track("sg_score_blob_morph", { score });
    setTimeout(() => {
      onMorph?.();
      setMorphing(false);
    }, 400);
  };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "button",
      tabIndex: 0,
      "aria-label": `Score ${score}/100`,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      },
      onClick: handleClick,
      style: {
        cursor: "pointer",
        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s",
        transform: morphing ? "scale(1.5)" : "scale(1)",
        opacity: morphing ? 0 : 1
      }
    },
    /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 100 100", "aria-hidden": "true", style: { display: "block" } }, /* @__PURE__ */ React.createElement(
      "path",
      {
        d: "M50 7 C79 7 93 21 93 50 C93 79 79 93 50 93 C21 93 7 79 7 50 C7 21 21 7 50 7 Z",
        fill: color,
        style: { transition: "d 0.4s ease-out" }
      }
    ), /* @__PURE__ */ React.createElement("ellipse", { cx: "37", cy: "29", rx: "25", ry: "15", fill: "#fff", opacity: ".16" }), /* @__PURE__ */ React.createElement("text", { x: "50", y: "59", fontFamily: "'Anton',sans-serif", fontSize: "40", fill: "#fff", textAnchor: "middle" }, score), /* @__PURE__ */ React.createElement("text", { x: "50", y: "75", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", fontSize: "11", fontWeight: "800", fill: "#fff", textAnchor: "middle", opacity: ".82" }, "/100")),
    children
  );
}
let _celebrationSubs = /* @__PURE__ */ new Set();
function _celebrationEmit(type) {
  for (const fn of _celebrationSubs) fn(type);
}
function triggerCelebration(type = "success") {
  track("sg_celebration_trigger", { type });
  _celebrationEmit(type);
}
function SuccessCelebration() {
  const [particles, setParticles] = useState([]);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const handler = (type) => {
      setActive(true);
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: Date.now() + i,
        x: 50 + Math.random() * 20 - 10,
        // center ± 10%
        y: 50 + Math.random() * 20 - 10,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        // upward
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.8,
        color: type === "premium" ? "#FFC72C" : "#FFD700"
        // or premium = gold accent
      }));
      setParticles(newParticles);
      setTimeout(() => {
        setActive(false);
        setParticles([]);
      }, 1500);
    };
    _celebrationSubs.add(handler);
    return () => _celebrationSubs.delete(handler);
  }, []);
  if (!active) return null;
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden"
      }
    },
    particles.map((p) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: p.id,
        style: {
          position: "absolute",
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: 12,
          height: 12,
          background: p.color,
          borderRadius: "50%",
          boxShadow: `0 0 8px ${p.color}`,
          transform: `translate(${p.vx * 20}px,${p.vy * 20}px) scale(${p.scale}) rotate(${p.rotation}deg)`,
          opacity: 0,
          transition: "transform 1.5s ease-out, opacity 1.5s ease-out",
          animation: "celebration-fade 1.5s ease-out forwards"
        }
      }
    ))
  );
}
try {
  if (typeof window !== "undefined") {
    window.triggerCelebration = triggerCelebration;
  }
} catch (_) {
}
let _sgToastSeq = 0;
const _sgToastSubs = /* @__PURE__ */ new Set();
let _sgToasts = [];
function _sgEmit() {
  for (const fn of _sgToastSubs) fn(_sgToasts);
}
function sgToast(opts) {
  const o = typeof opts === "string" ? { msg: opts } : opts || {};
  const id = ++_sgToastSeq;
  const tone = o.tone || "info";
  const mood = o.mood || (tone === "error" ? "alerte" : tone === "success" ? "serein" : "scan");
  const duration = o.duration != null ? o.duration : tone === "error" ? 7e3 : 4200;
  _sgToasts = [..._sgToasts, { id, title: o.title || "", msg: o.msg || "", tone, mood, action: o.action || null }];
  _sgEmit();
  if (duration > 0) setTimeout(() => sgDismissToast(id), duration);
  return id;
}
function sgDismissToast(id) {
  if (!_sgToasts.some((t) => t.id === id)) return;
  _sgToasts = _sgToasts.filter((t) => t.id !== id);
  _sgEmit();
}
function SgClose({ onClick, lang }) {
  return /* @__PURE__ */ React.createElement("button", { type: "button", className: "sg-toast__x", "aria-label": _t(lang || "fr", "Fermer", "Close", "Cerrar"), onClick }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round" })));
}
function SgToastHost({ lang = "fr" }) {
  const [list, setList] = useState(_sgToasts);
  useEffect(() => {
    const fn = (l) => setList([...l]);
    _sgToastSubs.add(fn);
    setList([..._sgToasts]);
    return () => {
      _sgToastSubs.delete(fn);
    };
  }, []);
  if (!list.length) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "sg-toast-host", role: "region", "aria-live": "polite", "aria-label": _t(lang, "Notifications", "Notifications", "Notificaciones") }, list.map((t) => {
    const isErr = t.tone === "error";
    return /* @__PURE__ */ React.createElement("div", { key: t.id, className: "sg-toast sg-toast--" + t.tone, role: isErr ? "alert" : "status" }, /* @__PURE__ */ React.createElement("span", { className: "sg-toast__bar" }), /* @__PURE__ */ React.createElement("span", { className: "sg-toast__veil", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Veilleur, { mood: t.mood, size: 34 })), /* @__PURE__ */ React.createElement("div", { className: "sg-toast__body" }, t.title ? /* @__PURE__ */ React.createElement("div", { className: "sg-toast__title" }, t.title) : null, t.msg ? /* @__PURE__ */ React.createElement("div", { className: "sg-toast__msg" }, t.msg) : null, t.action ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "sg-toast__act", onClick: () => {
      try {
        t.action.onClick && t.action.onClick();
      } finally {
        sgDismissToast(t.id);
      }
    } }, t.action.label) : null), /* @__PURE__ */ React.createElement(SgClose, { lang, onClick: () => sgDismissToast(t.id) }));
  }));
}
try {
  if (typeof window !== "undefined") {
    window.sgToast = sgToast;
    window.sgDismissToast = sgDismissToast;
  }
} catch (_) {
}
const sgLogError = (ctx, err) => {
  try {
    let msg = "";
    try {
      msg = err && err.message ? err.message : String(err);
    } catch (_) {
      msg = "[unserializable error]";
    }
    console.error("[sg]", ctx, msg);
  } catch (_) {
  }
};
try {
  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (e) => {
      try {
        sgLogError("unhandledrejection", e.reason);
      } catch (_) {
        e.preventDefault();
      }
    });
    window.addEventListener("error", (e) => {
      try {
        sgLogError("window_error", e.error || e.message);
      } catch (_) {
      }
    });
  }
} catch (_) {
}
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  str = String(str == null ? "" : str);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function rangeR(rnd, a, b) {
  return a + (b - a) * rnd();
}
function intR(rnd, a, b) {
  return Math.floor(a + (b - a + 1) * rnd());
}
function chance(rnd, p) {
  return rnd() < p;
}
const _ARCH_BLACK = /noire|dufour|c[ée]ron|couleuvre|grand.?rivi|anse l[ae]vau/i;
const _ARCH_CLIFF = /caravelle|tartane|presqu|tombolo|ch[aâ]teaux|pointe|\bcap\b/i;
const _ARCH_REEF = /[iî]let|petite[ -]?terre|caret|fajou|gosier/i;
const _ARCH_RIVER = /rivi[èe]re|embouchure|gal[io]n|figuier|mangrove/i;
const _ARCH_MARINA = /bourg|marina|ponton|fran[çc]aise/i;
const _ARCH_OPEN = /salines?|grande[ -]anse/i;
const _MARINA_COMMUNES = ["sainte-anne", "le gosier", "le marin", "fort-de-france", "saint-fran\xE7ois", "saint-francois"];
function archetypeOf(beach) {
  if (!beach) return "MORNE_COAST";
  const k = ((beach.id || "") + " " + (beach.name || "") + " " + (beach.commune || "")).toLowerCase();
  const isl = beach.island;
  if (/diamant/.test(k)) return "ICONIC_ROCK";
  if (_ARCH_BLACK.test(k)) return "VOLCANIC_BLACK";
  if (_ARCH_CLIFF.test(beach.name || "")) return "CLIFF_HEADLAND";
  if (isl === "gp" && _ARCH_REEF.test(k)) return "REEF_ISLET";
  if (_ARCH_RIVER.test(beach.name || "")) return "RIVER_MANGROVE";
  let coast = beach.coast;
  try {
    if (!coast && typeof classifyBeachCoast === "function") coast = classifyBeachCoast(beach.lat, beach.lng, isl);
  } catch (_) {
  }
  if (coast === "sheltered" && beach.parking === true && (_ARCH_MARINA.test(k) || _MARINA_COMMUNES.includes((beach.commune || "").toLowerCase()))) return "MARINA_URBAN";
  if (_ARCH_OPEN.test(k) || isl === "fl" || isl === "pc" || isl === "rm" || coast === "atlantic" && (beach.drive || 0) >= 40) return "OPEN_SHORE";
  if (coast === "sheltered") return "SHELTERED_BAY";
  return "MORNE_COAST";
}
try {
  if (typeof window !== "undefined") window.sgArchetypeOf = archetypeOf;
} catch (_) {
}
function mornePath(r, n, h0, h1, fromLeft) {
  const baseY = 340, x0 = fromLeft ? -40 : 840, dir = fromLeft ? 1 : -1, span = 380;
  let d = "M" + x0 + " " + baseY;
  for (let i = 0; i < n; i++) {
    const px = Math.round(x0 + dir * span * (i + 0.5) / n);
    const py = Math.round(baseY - rangeR(r, h0, h1));
    const ex = Math.round(x0 + dir * span * (i + 1) / n);
    const ey = Math.round(baseY - rangeR(r, 2, 14));
    d += " Q" + px + " " + py + " " + ex + " " + ey;
  }
  d += " L" + Math.round(x0 + dir * span) + " " + baseY + " Z";
  return d;
}
const _PALM_N = { OPEN_SHORE: [2, 4], SHELTERED_BAY: [2, 3], VOLCANIC_BLACK: [2, 3], MORNE_COAST: [1, 3], MARINA_URBAN: [0, 1], REEF_ISLET: [1, 2], RIVER_MANGROVE: [0, 1], CLIFF_HEADLAND: [0, 2], ICONIC_ROCK: [1, 1] };
function palmPlan(r, arch) {
  const c = _PALM_N[arch] || [1, 2], k = intR(r, c[0], c[1]), palms = [];
  for (let i = 0; i < k; i++) palms.push({ x: Math.round(rangeR(r, 120, 680)), s: +rangeR(r, 0.72, 1.12).toFixed(2), tilt: +rangeR(r, -7, 7).toFixed(1), fr: intR(r, 4, 6) });
  return palms;
}
function buildBeachScene(beach) {
  const arch = archetypeOf(beach);
  const r = rng(hashSeed(beach && beach.id || "x"));
  const fromLeft = r() < 0.5;
  let relief;
  if (arch === "ICONIC_ROCK") relief = { type: "diamond" };
  else if (arch === "CLIFF_HEADLAND") relief = { type: "cliff", cut: Math.round(rangeR(r, 232, 262)), second: r() < 0.5, fromLeft };
  else if (arch === "REEF_ISLET") relief = { type: "islet", x: Math.round(rangeR(r, 160, 640)) };
  else if (arch === "MARINA_URBAN") relief = { type: "marina", boats: intR(r, 1, 2), fromLeft };
  else if (arch === "VOLCANIC_BLACK") relief = { type: "morne", d: mornePath(r, intR(r, 2, 3), 84, 126, fromLeft), tall: true };
  else if (arch === "RIVER_MANGROVE") relief = { type: "morne", d: mornePath(r, 2, 30, 56, fromLeft) };
  else if (arch === "SHELTERED_BAY") relief = { type: "morne", d: mornePath(r, intR(r, 1, 2), 28, 56, fromLeft) };
  else if (arch === "OPEN_SHORE") relief = { type: "morne", d: mornePath(r, 1, 12, 30, fromLeft), flat: true };
  else relief = { type: "morne", d: mornePath(r, intR(r, 3, 6), 44, 90, fromLeft) };
  const palms = palmPlan(r, arch);
  const galets = arch === "VOLCANIC_BLACK" ? Array.from({ length: intR(r, 3, 5) }, () => ({ x: Math.round(rangeR(r, 180, 640)), y: Math.round(rangeR(r, 500, 540)), rx: +rangeR(r, 5, 11).toFixed(1) })) : [];
  return { arch, fromLeft, relief, palms, galets };
}
function _mixHex(a, b, k) {
  a = a.replace("#", "");
  b = b.replace("#", "");
  const p = (s2, i) => parseInt(s2.slice(i, i + 2), 16), m = (x) => ("0" + Math.round(x).toString(16)).slice(-2);
  return "#" + m(p(a, 0) + (p(b, 0) - p(a, 0)) * k) + m(p(a, 2) + (p(b, 2) - p(a, 2)) * k) + m(p(a, 4) + (p(b, 4) - p(a, 4)) * k);
}
function waterTint(seaT, afai) {
  const a = typeof afai === "number" ? afai : 0.2, inten = Math.max(0, Math.min(1, (a - 0.15) / 0.63));
  return inten <= 0.03 ? seaT : _mixHex(seaT, "#6E5A1E", inten * 0.55);
}
function nearestCleanAlt(beach, allBeaches) {
  if (!beach || !allBeaches || !allBeaches.length || beach.lat == null) return null;
  const cand = allBeaches.filter((b) => b.id !== beach.id && b.island === beach.island && b.lat != null && (b.coast === "sheltered" || b.status === "clean"));
  let best = null, bd = 1e9;
  for (const b of cand) {
    const d = haversine(beach.lat, beach.lng, b.lat, b.lng) - (b.coast === "sheltered" ? 3 : 0) - (b.status === "clean" ? 2 : 0);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}
function buildBeachPlan(beach, lang, allBeaches, weeklyData) {
  if (!beach) return { sections: [] };
  const _ = (fr, en, es) => _t(lang, fr, en, es);
  const st = beach.status, afai = typeof beach.afai === "number" ? beach.afai : 0.2;
  const coast = beach.coast || (typeof classifyBeachCoast === "function" ? classifyBeachCoast(beach.lat, beach.lng, beach.island) : "atlantic");
  const aging = !!(weeklyData && weeklyData.arrivalDetected) || !!beach.beachMemory;
  const s2 = [];
  if (st === "clean" && afai < 0.3) s2.push({ tone: "clean", title: _("Meilleur moment", "Best time", "Mejor momento"), body: _("Bon toute la journ\xE9e \u2014 golden hour 17-19h pour la photo.", "Good all day \u2014 golden hour 5-7pm for photos.", "Bueno todo el d\xEDa \u2014 hora dorada 17-19h para la foto.") });
  else s2.push({ tone: "warn", title: _("Meilleur moment", "Best time", "Mejor momento"), body: _("Vas-y t\xF4t le matin : l'odeur monte avec la chaleur de l'apr\xE8s-midi.", "Go early morning: the smell rises with afternoon heat.", "Ve temprano: el olor sube con el calor de la tarde.") });
  if (st === "avoid") {
    const alt = nearestCleanAlt(beach, allBeaches);
    if (alt) {
      const dr = alt.drive ? " (" + alt.drive + " min)" : "";
      s2.push({ tone: "alt", title: _("Plut\xF4t ailleurs", "Go elsewhere", "Mejor en otro lugar"), body: _("Plut\xF4t " + alt.name + dr + ", c\xF4te abrit\xE9e presque toujours propre.", "Try " + alt.name + dr + " instead, sheltered coast almost always clear.", "Mejor " + alt.name + dr + ", costa protegida casi siempre limpia.") });
    }
  }
  if (afai >= 0.4 && aging) s2.push({ tone: "avoid", title: _("Sant\xE9 & famille", "Health & family", "Salud y familia"), body: beach.kids ? _("Algues en d\xE9composition = gaz (H2S). D\xE9conseill\xE9 aux enfants, asthmatiques, femmes enceintes. Reste \xE0 l'\xE9cart des tas bruns.", "Rotting seaweed releases gas (H2S). Not advised for kids, asthma, pregnancy. Keep clear of the brown piles.", "Algas en descomposici\xF3n liberan gas (H2S). No recomendado a ni\xF1os, asm\xE1ticos, embarazadas. Al\xE9jate de los montones marrones.") : _("Algues en d\xE9composition = gaz (H2S). Si tu sens l'\u0153uf pourri, \xE9loigne-toi du tas et remonte au vent.", "Rotting seaweed releases gas (H2S). If you smell rotten eggs, move away and upwind.", "Algas en descomposici\xF3n liberan gas (H2S). Si hueles a huevo podrido, al\xE9jate y ponte a barlovento.") });
  if (beach.snorkel && st === "clean" && afai < 0.3) s2.push({ tone: "clean", title: _("Sur place", "On site", "En el lugar"), body: _("Masque-tuba recommand\xE9 ici.", "Bring your snorkel mask.", "Trae tu m\xE1scara de snorkel.") });
  if (beach.parking === false) s2.push({ tone: "info", title: _("Stationnement", "Parking", "Estacionamiento"), body: _("Pas de parking am\xE9nag\xE9 : viens t\xF4t ou en 2-roues.", "No real parking: come early or on two wheels.", "Sin estacionamiento: llega temprano o en moto.") });
  const com = (beach.commune || "").toLowerCase();
  const fishing = ["saint-fran\xE7", "saint-franc", "le robert", "le vauclin", "sainte-anne", "le marin"].some((c) => com.includes(c));
  if (fishing && afai >= 0.3) s2.push({ tone: "info", title: _("C\xF4t\xE9 p\xEAcheurs", "For fishermen", "Para pescadores"), body: _("Nappes en mer = moteurs et h\xE9lices menac\xE9s, sorties perturb\xE9es.", "Offshore mats threaten motors and propellers.", "Las manchas amenazan motores y h\xE9lices.") });
  else if (coast === "sheltered" && st === "clean") s2.push({ tone: "clean", title: _("Bon \xE0 savoir", "Good to know", "Bueno saber"), body: _("C\xF4te abrit\xE9e : re\xE7oit rarement les sargasses, valeur s\xFBre.", "Sheltered coast: rarely gets sargassum, a safe bet.", "Costa protegida: rara vez recibe sargazo, apuesta segura.") });
  return { sections: s2 };
}
function VisitPlan({ beach, lang, allBeaches, weeklyData }) {
  const plan = useMemo(() => buildBeachPlan(beach, lang, allBeaches, weeklyData), [beach && beach.id, beach && beach.status, beach && beach.afai, lang]);
  if (!plan.sections.length) return null;
  const tones = { clean: "#22C55E", warn: "#F59E0B", avoid: "#E8522A", alt: "#5b3a8e", info: "#3fd07f" };
  return /* @__PURE__ */ React.createElement("div", { style: { margin: "14px 0 6px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--sg-mid,#8AA09B)", marginBottom: 6 } }, _t(lang, "Le plan du Veilleur", "The Watcher's plan", "El plan del Vig\xEDa")), plan.sections.map((sec, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid rgba(120,140,135,.16)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 3, borderRadius: 3, background: tones[sec.tone] || "#3fd07f", flexShrink: 0, alignSelf: "stretch" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 800, color: tones[sec.tone] || "var(--sg-text,#1A2B27)" } }, sec.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.42, color: "var(--sg-text,#33433F)", marginTop: 1 } }, sec.body)))));
}
const BEACH_PHASE = Object.fromEntries(Object.entries({
  dawn: { cloud: "#1A2440", rock: "#1b2a33", rockLit: "#F2A968", trunk: "#14100C", frond: "#1a2e26" },
  day: { cloud: "#EAF6F6", rock: "#5d6f62", rockLit: "#A8C6AE", trunk: "#3A2E1A", frond: "#3F6B52" },
  golden: { cloud: "#10333E", rock: "#16242A", rockLit: "#FFD884", trunk: "#120F0A", frond: "#16120C" },
  night: { cloud: "#0A1622", rock: "#0c171b", rockLit: "#9ADCD4", trunk: "#0A0806", frond: "#0C0A06" }
}).map(([k, ex]) => {
  const t = SCENE_TOKENS.phases[k];
  return [k, { sky: t.sky, seaT: t.seaT, seaB: t.seaB, glit: t.glit, sun: t.sun, rim: t.rim, ...ex }];
}));
function beachLandmark(beach) {
  const k = ((beach && beach.id || "") + " " + (beach && beach.name || "") + " " + (beach && beach.slug || "")).toLowerCase();
  if (/diamant/.test(k)) return "diamondRock";
  if (/caravelle|tartane|presqu|tombolo|chateaux|château/.test(k)) return "cliff";
  if (/salines|saline|grande anse|bourg/.test(k)) return "open";
  return "morne";
}
function BeachScene({ beach, reveal }) {
  const ph = (() => {
    try {
      if (HERO_PH_OVERRIDE) return HERO_PH_OVERRIDE;
      const h = (/* @__PURE__ */ new Date()).getHours();
      return h < 5 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "golden" : "night";
    } catch (_) {
      return "golden";
    }
  })();
  const t = BEACH_PHASE[ph] || BEACH_PHASE.golden;
  const scene = useMemo(() => buildBeachScene(beach), [beach && beach.id]);
  const black = scene.arch === "VOLCANIC_BLACK";
  const sand = black ? ph === "day" ? "#3A352F" : "#0F0D0B" : ph === "day" ? "#C9A86A" : t.rock === "#16242A" ? "#1C1712" : "#15110D";
  const showRafts = beach && (beach.status === "moderate" || beach.status === "avoid");
  const particleCount = beach?.status === "clean" ? 8 : beach?.status === "moderate" ? 12 : 16;
  const particles = useMemo(() => {
    let s2 = beach?.id ? beach.id.split("").reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0) : 42;
    const rng2 = () => {
      s2 ^= s2 << 13;
      s2 ^= s2 >> 17;
      s2 ^= s2 << 5;
      return (s2 >>> 0) % 1e3 / 1e3;
    };
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: rng2() * 800,
      y: 340 + rng2() * 80,
      size: 2 + rng2() * 3,
      speed: 0.3 + rng2() * 0.5,
      phase: rng2() * Math.PI * 2,
      color: beach?.status === "clean" ? "rgba(255,255,255,0.4)" : beach?.status === "moderate" ? "rgba(122,92,20,0.3)" : "rgba(93,64,14,0.35)"
    }));
  }, [beach?.status, particleCount, beach?.id]);
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (_) {
    }
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let raf;
    let lastFrame = 0;
    const animate = (now) => {
      if (now - lastFrame > 66) {
        setFrame((f) => (f + 1) % 360);
        lastFrame = now;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [visible]);
  const palm = (p, i) => {
    const bx = p.x, by = 556, h = 118 * p.s, tx = bx + p.tilt * 3.2, ty = by - h;
    const trunk = "M" + bx + " " + by + " Q" + Math.round(bx + (tx - bx) * 0.45) + " " + Math.round(by - h * 0.55) + " " + Math.round(tx) + " " + Math.round(ty);
    const fr = [], n = p.fr;
    for (let f = 0; f < n; f++) {
      const a = (-150 + 120 * (n > 1 ? f / (n - 1) : 0.5)) * Math.PI / 180;
      const ex = Math.round(tx + Math.cos(a) * 48 * p.s), ey = Math.round(ty + Math.sin(a) * 42 * p.s);
      const mx = Math.round(tx + Math.cos(a) * 26 * p.s), my = Math.round(ty + Math.sin(a) * 22 * p.s - 5);
      fr.push("M" + Math.round(tx) + " " + Math.round(ty) + " Q" + mx + " " + my + " " + ex + " " + ey);
    }
    return /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("path", { d: trunk, stroke: t.trunk, strokeWidth: Math.max(5, 12 * p.s), fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: t.frond, strokeWidth: Math.max(4, 8 * p.s), strokeLinecap: "round" }, fr.map((d, j) => /* @__PURE__ */ React.createElement("path", { key: j, d }))));
  };
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, "aria-hidden": "true", className: reveal ? "bsc-reveal" : void 0, style: { position: "absolute", inset: 0 } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 800 600", preserveAspectRatio: "xMidYMid slice", style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" } }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "bscSky", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: t.sky[0] }), /* @__PURE__ */ React.createElement("stop", { offset: ".52", stopColor: t.sky[1] }), /* @__PURE__ */ React.createElement("stop", { offset: ".84", stopColor: t.sky[2] }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: t.sky[3] })), /* @__PURE__ */ React.createElement("linearGradient", { id: "bscSea", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: waterTint(t.seaT, beach && beach.afai) }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: t.seaB }))), /* @__PURE__ */ React.createElement("rect", { width: "800", height: "360", fill: "url(#bscSky)" }), t.sun === "set" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "330", r: "120", fill: t.glit, opacity: ".08" }), /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "330", r: "64", fill: t.glit, opacity: ".12" }), /* @__PURE__ */ React.createElement("path", { d: "M340 332 a60 60 0 0 1 120 0 Z", fill: t.glit, opacity: ".9" })), t.sun === "high" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "98", r: "52", fill: "#FDFCF7", opacity: ".2" }), /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "98", r: "30", fill: "#FFF4D6" })), t.sun === "set" && /* @__PURE__ */ React.createElement("g", { className: "bsc-rays" }, [-52, -26, 0, 26, 52].map((a, i) => /* @__PURE__ */ React.createElement("path", { key: i, d: "M400 330 L390 150 L410 150 Z", fill: t.glit, opacity: ".1", transform: "rotate(" + a + " 400 330)" }))), t.sun === "high" && /* @__PURE__ */ React.createElement("g", { className: "bsc-rays" }, [-46, -22, 2, 26, 50].map((a, i) => /* @__PURE__ */ React.createElement("path", { key: i, d: "M300 98 L291 300 L309 300 Z", fill: "#FFF4D6", opacity: ".09", transform: "rotate(" + a + " 300 98)" }))), t.sun === "moon" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "320", cy: "96", r: "40", fill: "#9ADCD4", opacity: ".08" }), /* @__PURE__ */ React.createElement("circle", { cx: "320", cy: "96", r: "20", fill: "#E6F2EF" }), /* @__PURE__ */ React.createElement("circle", { cx: "313", cy: "90", r: "3.6", fill: "#C2D8D2", opacity: ".7" })), ph === "night" && [[90, 60], [220, 90], [380, 50], [540, 82], [680, 56], [150, 150], [470, 140], [620, 120]].map((s2, i) => /* @__PURE__ */ React.createElement("circle", { key: i, cx: s2[0], cy: s2[1], r: "1.1", fill: "#fff", opacity: ".5" })), /* @__PURE__ */ React.createElement("g", { className: "bsc-cloud" }, /* @__PURE__ */ React.createElement("path", { d: "M120 128 q14 -26 48 -26 q18 -18 46 -12 q30 -8 44 12 q26 2 30 26 Z", fill: t.cloud, opacity: ".9" }), /* @__PURE__ */ React.createElement("path", { d: "M122 129 h162", stroke: t.rim, strokeWidth: "2", opacity: ".32" })), /* @__PURE__ */ React.createElement("g", { className: "bsc-cloud2" }, /* @__PURE__ */ React.createElement("path", { d: "M512 92 q12 -22 42 -22 q16 -13 40 -9 q26 -7 38 11 q22 2 26 20 Z", fill: t.cloud, opacity: ".78" }), /* @__PURE__ */ React.createElement("path", { d: "M514 93 h140", stroke: t.rim, strokeWidth: "1.7", opacity: ".26" })), ph !== "night" && /* @__PURE__ */ React.createElement("g", { className: "bsc-bird", opacity: ".55", stroke: ph === "day" ? "#2A5566" : t.rim, strokeWidth: "2.4", fill: "none", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M712 138 q5.5 -6.5 11 0 q5.5 -6.5 11 0" }), /* @__PURE__ */ React.createElement("path", { d: "M754 124 q4.5 -5 9 0 q4.5 -5 9 0" }), /* @__PURE__ */ React.createElement("path", { d: "M648 156 q5 -6 10 0 q5 -6 10 0" }), /* @__PURE__ */ React.createElement("path", { d: "M576 128 q4 -5 8 0 q4 -5 8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M620 122 q4.5 -5.5 9 0 q4.5 -5.5 9 0" })), /* @__PURE__ */ React.createElement("rect", { x: "-40", y: "330", width: "880", height: "200", fill: "url(#bscSea)" }), particles.map((p) => {
    const t2 = frame * 0.02;
    const y = p.y + Math.sin(t2 + p.phase) * 8;
    const x = p.x + Math.cos(t2 * 0.5 + p.phase) * 4;
    const opacity = 0.4 + Math.sin(t2 + p.phase) * 0.2;
    return /* @__PURE__ */ React.createElement(
      "circle",
      {
        key: p.id,
        cx: x,
        cy: y,
        r: p.size,
        fill: p.color,
        opacity
      }
    );
  }), Array.from({ length: 3 }, (_, i) => {
    const t2 = frame * 0.03;
    const baseY = 360 + i * 20;
    const wave = "M-40 " + baseY + " Q" + (100 + Math.sin(t2 + i) * 20) + " " + (baseY - 5) + " 200 " + baseY + " Q" + (300 + Math.sin(t2 + i + 1) * 20) + " " + (baseY + 5) + " 400 " + baseY + " Q" + (500 + Math.sin(t2 + i + 2) * 20) + " " + (baseY - 3) + " 600 " + baseY + " Q" + (700 + Math.sin(t2 + i + 3) * 20) + " " + (baseY + 3) + " 840 " + baseY;
    return /* @__PURE__ */ React.createElement(
      "path",
      {
        key: "wave" + i,
        d: wave,
        fill: "none",
        stroke: "rgba(255,255,255,0.15)",
        strokeWidth: 1.5 - i * 0.3,
        opacity: 0.3 - i * 0.08
      }
    );
  }), t.sun === "moon" && /* @__PURE__ */ React.createElement("path", { className: "bsc-moonp", d: "M302 332 L338 332 L356 474 Q320 486 284 474 Z", fill: "#9ADCD4" }), scene.relief.type === "diamond" && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: "M468 340 Q481 284 509 252 Q525 234 534 253 Q560 292 570 340 Z", fill: t.rock }), /* @__PURE__ */ React.createElement("path", { d: "M509 252 Q525 234 534 253 Q560 292 570 340 L534 340 Z", fill: "#000", opacity: ".22" }), /* @__PURE__ */ React.createElement("path", { d: "M509 252 Q481 284 468 340 L509 340 Z", fill: t.rockLit, opacity: ".26" }), /* @__PURE__ */ React.createElement("path", { d: "M468 340 Q519 351 570 340 L570 349 Q519 360 468 349 Z", fill: t.rock, opacity: ".45" })), scene.relief.type === "cliff" && (() => {
    const cut = scene.relief.cut, fl = scene.relief.fromLeft;
    const main = fl ? "M-40 340 L-40 " + cut + " Q120 " + (cut - 38) + " 236 " + (cut + 8) + " L266 340 Z" : "M840 340 L840 " + cut + " Q680 " + (cut - 38) + " 564 " + (cut + 8) + " L534 340 Z";
    const edge = fl ? "M-40 " + cut + " Q120 " + (cut - 38) + " 236 " + (cut + 8) : "M840 " + cut + " Q680 " + (cut - 38) + " 564 " + (cut + 8);
    return /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: main, fill: t.rock }), /* @__PURE__ */ React.createElement("path", { d: edge, fill: "none", stroke: t.rockLit, strokeWidth: "3", opacity: ".25" }), scene.relief.second && /* @__PURE__ */ React.createElement("path", { d: fl ? "M840 340 L840 288 Q772 272 714 302 L692 340 Z" : "M-40 340 L-40 288 Q28 272 86 302 L108 340 Z", fill: t.rock, opacity: ".8" }));
  })(), scene.relief.type === "islet" && (() => {
    const x = scene.relief.x;
    return /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: "M-40 366 Q400 358 840 368", fill: "none", stroke: t.rim, strokeWidth: "2", strokeDasharray: "5 9", opacity: ".38" }), /* @__PURE__ */ React.createElement("path", { d: "M" + (x - 46) + " 340 Q" + x + " 300 " + (x + 46) + " 340 Z", fill: t.rock, opacity: ".9" }), /* @__PURE__ */ React.createElement("path", { d: "M" + (x - 46) + " 340 Q" + x + " 300 " + (x + 46) + " 340", fill: "none", stroke: t.rockLit, strokeWidth: "2", opacity: ".22" }));
  })(), scene.relief.type === "marina" && (() => {
    const fl = scene.relief.fromLeft;
    return /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: fl ? 40 : 524, y: "334", width: "172", height: "6", fill: t.trunk, opacity: ".8" }), /* @__PURE__ */ React.createElement("g", { stroke: t.trunk, strokeWidth: "4.5", opacity: ".7", strokeLinecap: "round" }, [0, 1, 2, 3, 4].map((i) => {
      const px = (fl ? 64 : 548) + i * 30;
      return /* @__PURE__ */ React.createElement("line", { key: i, x1: px, y1: "338", x2: px + 8, y2: "372" });
    })), Array.from({ length: scene.relief.boats }).map((_, i) => {
      const bx = 372 + i * 84;
      return /* @__PURE__ */ React.createElement("g", { key: i, transform: "translate(" + bx + ",348)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "22", ry: "6.5", fill: t.rock }), /* @__PURE__ */ React.createElement("line", { x1: "-2", y1: "-3", x2: "-2", y2: "-28", stroke: t.rock, strokeWidth: "2.4" }), /* @__PURE__ */ React.createElement("path", { d: "M-2 -26 L16 -7 L-2 -7 Z", fill: t.rockLit, opacity: ".55" }));
    }));
  })(), scene.relief.type === "morne" && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: scene.relief.d, fill: t.rock, opacity: scene.relief.flat ? ".72" : ".95" }), /* @__PURE__ */ React.createElement("path", { d: scene.relief.d, fill: "none", stroke: t.rockLit, strokeWidth: "2.4", opacity: ".2" })), /* @__PURE__ */ React.createElement("line", { className: "bsc-glit", x1: "-40", y1: "356", x2: "840", y2: "356", stroke: t.glit, strokeWidth: "2.2", strokeDasharray: "3 13", opacity: ".5" }), /* @__PURE__ */ React.createElement("line", { className: "bsc-glit", x1: "-40", y1: "386", x2: "840", y2: "386", stroke: t.glit, strokeWidth: "1.8", strokeDasharray: "2 17", opacity: ".3", style: { animationDelay: "-3s" } }), /* @__PURE__ */ React.createElement("line", { className: "bsc-glit", x1: "-40", y1: "420", x2: "840", y2: "420", stroke: t.glit, strokeWidth: "1.6", strokeDasharray: "2 23", opacity: ".18", style: { animationDelay: "-5s" } }), /* @__PURE__ */ React.createElement("g", { fill: t.glit }, /* @__PURE__ */ React.createElement("circle", { className: "bsc-shim", cx: "372", cy: "372", r: "1.9" }), /* @__PURE__ */ React.createElement("circle", { className: "bsc-shim", cx: "392", cy: "398", r: "1.5", style: { animationDelay: "-1s" } }), /* @__PURE__ */ React.createElement("circle", { className: "bsc-shim", cx: "356", cy: "410", r: "1.6", style: { animationDelay: "-2s" } }), /* @__PURE__ */ React.createElement("circle", { className: "bsc-shim", cx: "412", cy: "384", r: "1.4", style: { animationDelay: "-1.6s" } })), /* @__PURE__ */ React.createElement("g", { className: "bsc-sat" }, /* @__PURE__ */ React.createElement("path", { className: "bsc-beam", d: "M482 82 L424 372 L548 372 Z", fill: t.glit }), /* @__PURE__ */ React.createElement("g", { transform: "translate(482,80)" }, /* @__PURE__ */ React.createElement("rect", { x: "-17", y: "-3", width: "9", height: "6.5", rx: "1.5", fill: t.rim, opacity: ".85" }), /* @__PURE__ */ React.createElement("rect", { x: "8", y: "-3", width: "9", height: "6.5", rx: "1.5", fill: t.rim, opacity: ".85" }), /* @__PURE__ */ React.createElement("rect", { x: "-6.5", y: "-6.5", width: "13", height: "13", rx: "3.2", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-6.5", y: "-6.5", width: "13", height: "4.2", rx: "3.2", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "1.4", r: "3.2", fill: "#07201E" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "1.4", r: "2.2", fill: t.glit }))), beach && beach.status === "clean" && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("g", { className: "bsc-swim" }, /* @__PURE__ */ React.createElement("circle", { cx: "372", cy: "392", r: "6", fill: "#0D2B26" }), /* @__PURE__ */ React.createElement("path", { d: "M360 398 q12 -8 24 0", stroke: "#0D2B26", strokeWidth: "3.4", fill: "none", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement("g", { className: "bsc-swim", style: { animationDelay: "-2.1s" } }, /* @__PURE__ */ React.createElement("circle", { cx: "452", cy: "404", r: "5", fill: "#0D2B26" }), /* @__PURE__ */ React.createElement("path", { d: "M442 409 q10 -7 20 0", stroke: "#0D2B26", strokeWidth: "3", fill: "none", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement("path", { d: "M348 396 h8 M396 398 h7 M462 410 h8", stroke: t.rim, strokeWidth: "1.6", opacity: ".5", strokeLinecap: "round" })), beach && beach.status === "moderate" && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("g", { className: "bsc-net" }, /* @__PURE__ */ React.createElement("path", { d: "M286 372 Q360 382 434 374", fill: "none", stroke: "#CDEBE6", strokeWidth: "1.2", strokeDasharray: "1.5 4", opacity: ".6" }), /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "374", r: "3", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "344", cy: "378", r: "2.6", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "388", cy: "375", r: "2.6", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "432", cy: "374", r: "3", fill: "#FFC72C" })), /* @__PURE__ */ React.createElement("g", { className: "bsc-raft", transform: "translate(330,388) scale(.62)", opacity: ".8" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "22", ry: "7", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-10", cy: "-3", rx: "9", ry: "4", fill: "#8a6c1c" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(458,502)" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(-20,12) scale(.5)", opacity: ".7" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "22", ry: "7", fill: "#7a5c14" })), /* @__PURE__ */ React.createElement("g", { fill: "#0E1F1A" }, /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-27", r: "5" }), /* @__PURE__ */ React.createElement("path", { d: "M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z" }), /* @__PURE__ */ React.createElement("path", { d: "M-4 -4 l-3 12 M4 -4 l3 12", stroke: "#0E1F1A", strokeWidth: "2.4", strokeLinecap: "round", fill: "none" })), /* @__PURE__ */ React.createElement("g", { className: "bsc-rake", stroke: "#3A2A14", strokeWidth: "2.2", fill: "none", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "-19", x2: "20", y2: "8" }), /* @__PURE__ */ React.createElement("path", { d: "M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8" })))), beach && beach.status === "avoid" && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("g", { className: "bsc-raft" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(300,372)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "24", ry: "8", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-12", cy: "-4", rx: "10", ry: "5", fill: "#8a6c1c" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "12", cy: "-3", rx: "11", ry: "5", fill: "#5d400e" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(470,390) scale(.9)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "22", ry: "7", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "8", cy: "-3", rx: "9", ry: "4", fill: "#8a6c1c" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(386,360) scale(.55)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "22", ry: "7", fill: "#6b4a12" }))), /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("ellipse", { cx: "318", cy: "502", rx: "72", ry: "14", fill: "#5d400e" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "288", cy: "496", rx: "34", ry: "10", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "472", cy: "514", rx: "60", ry: "12", fill: "#6b4a12" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "492", cy: "508", rx: "28", ry: "8", fill: "#8a6c1c" }))), /* @__PURE__ */ React.createElement("path", { d: "M-40 472 Q200 434 430 448 Q640 460 840 502 L840 620 L-40 620 Z", fill: sand }), /* @__PURE__ */ React.createElement("path", { d: "M-40 472 Q200 434 430 448 Q640 460 840 502", fill: "none", stroke: t.rim, strokeWidth: "2.4", opacity: ".3" }), scene.galets.map((gp, i) => /* @__PURE__ */ React.createElement("ellipse", { key: "g" + i, cx: gp.x, cy: gp.y, rx: gp.rx, ry: gp.rx * 0.5, fill: "#1a1714", opacity: ".7" })), scene.palms.map(palm)));
}
function PanelStoryEngine({ beats, lang, accent = "#FFC72C", ev = "sg_panel_beat", onCTA, scrollRef }) {
  const boxRef = useRef(null);
  const vpRef = useRef(null);
  const [beat, setBeat] = useState(0);
  const beatRef = useRef(-1);
  const [rm] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  });
  const N = Math.max(1, beats.length);
  useEffect(() => {
    const box = boxRef.current, vp = vpRef.current, cont = scrollRef && scrollRef.current;
    if (!box || !vp || !cont) return;
    const st = box.style;
    if (rm) {
      box.style.height = "auto";
      vp.style.height = "min(72vh,560px)";
      for (let i = 0; i < N; i++) {
        st.setProperty(`--e${i}`, i === N - 1 ? "1" : "0");
        st.setProperty(`--p${i}`, "1");
      }
      setBeat(N - 1);
      return;
    }
    const setSizes = () => {
      const ch = cont.clientHeight || 1;
      vp.style.height = ch + "px";
      box.style.height = N * ch + "px";
    };
    setSizes();
    let raf = 0;
    const upd = () => {
      raf = 0;
      const ch = cont.clientHeight || 1;
      const total = Math.max(1, (N - 1) * ch);
      const p = Math.max(0, Math.min(1, (cont.scrollTop - box.offsetTop) / total));
      st.setProperty("--gp", p.toFixed(4));
      const span = N > 1 ? 1 / (N - 1) : 1;
      for (let i = 0; i < N; i++) {
        const c = N > 1 ? i / (N - 1) : 0.5;
        st.setProperty(`--e${i}`, Math.max(0, Math.min(1, 1 - Math.abs(p - c) / (span * 0.85))).toFixed(3));
        st.setProperty(`--p${i}`, Math.max(0, Math.min(1, p * (N - 1) - (i - 0.5))).toFixed(3));
      }
      const b = Math.max(0, Math.min(N - 1, Math.round(p * (N - 1))));
      if (b !== beatRef.current) {
        beatRef.current = b;
        setBeat(b);
        try {
          track(ev, { b: b + 1, n: N });
        } catch (_) {
        }
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(upd);
    };
    const onResize = () => {
      setSizes();
      onScroll();
    };
    cont.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    upd();
    return () => {
      cont.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [N, rm, scrollRef]);
  const baseVars = { "--gp": N > 1 ? beat / (N - 1) : 0 };
  for (let i = 0; i < N; i++) {
    baseVars[`--e${i}`] = beat === i ? 1 : 0;
    baseVars[`--p${i}`] = i < beat ? 1 : i === beat ? 0.5 : 0;
  }
  const last = beats[N - 1];
  return /* @__PURE__ */ React.createElement("section", { ref: boxRef, style: { position: "relative", background: "#120821", ...baseVars } }, /* @__PURE__ */ React.createElement("div", { ref: vpRef, style: { position: rm ? "relative" : "sticky", top: 0, overflow: "hidden", background: "#120821" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 800 600", preserveAspectRatio: "xMidYMid slice", style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" } }, beats.map((bt, i) => /* @__PURE__ */ React.createElement("g", { key: i, style: { opacity: `var(--e${i})`, "--p": `var(--p${i})` } }, bt.scene))), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } }, beats.map((bt, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 22px calc(26px + env(safe-area-inset-bottom))", opacity: `var(--e${i})` } }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 560, margin: "0 auto" } }, bt.eyebrow && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".16em", color: accent, textTransform: "uppercase", marginBottom: 8 } }, bt.eyebrow), /* @__PURE__ */ React.createElement("h2", { className: "anton", style: { fontWeight: 400, fontSize: "clamp(24px,6.2vw,38px)", lineHeight: 1.04, textTransform: "uppercase", margin: 0, color: "#fff" } }, bt.heading), bt.sub && /* @__PURE__ */ React.createElement("p", { style: { fontSize: 14, color: "rgba(255,255,255,.74)", marginTop: 9, lineHeight: 1.5, maxWidth: 440 } }, bt.sub), i === N - 1 && onCTA && last && last.cta && /* @__PURE__ */ React.createElement("button", { onClick: onCTA, style: { pointerEvents: "auto", marginTop: 16, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 16, color: "#120821", border: "none", borderRadius: 16, padding: "15px 26px", background: "linear-gradient(135deg,#FFE08A,#FFC72C)", boxShadow: "0 8px 24px rgba(255,199,44,.32)" } }, last.cta)))))));
}
function miVeil(cx, cy, wing, lens) {
  return /* @__PURE__ */ React.createElement("g", { transform: `translate(${cx},${cy})` }, /* @__PURE__ */ React.createElement("circle", { r: "30", fill: wing, opacity: ".14" }), /* @__PURE__ */ React.createElement("rect", { x: "-30", y: "-7", width: "16", height: "14", rx: "3", fill: wing }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "-7", width: "16", height: "14", rx: "3", fill: wing }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "-14", x2: "0", y2: "-25", stroke: lens, strokeWidth: "2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-27", r: "2.4", fill: lens }), /* @__PURE__ */ React.createElement("rect", { x: "-14", y: "-14", width: "28", height: "28", rx: "8", fill: "#0A1714" }), /* @__PURE__ */ React.createElement("rect", { x: "-14", y: "-14", width: "28", height: "9", rx: "8", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "3", r: "8", fill: "#07201E" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "3", r: "5.5", fill: lens }), /* @__PURE__ */ React.createElement("circle", { cx: "-2", cy: "1", r: "2", fill: "#EAFBF8" }));
}
function beachStoryBeats(beach, forecast, lang) {
  const T2 = (fr, en, es) => _t(lang, fr, en, es);
  const vm = verdictMeta(beach.status, lang);
  const mood = moodFromScore(beach.score);
  const mwing = mood === "serein" ? "#5b3a8e" : mood === "vigilant" ? "#F59E0B" : "#E8522A";
  const mlens = mood === "serein" ? "#3fd07f" : mood === "vigilant" ? "#FFD27A" : "#F4845F";
  const fc = forecast || [];
  const RANK = { clean: 0, moderate: 1, avoid: 2 };
  let turn = null;
  for (let i = 1; i <= 3 && i < fc.length; i++) {
    if ((RANK[fc[i] && fc[i].status] || 0) > (RANK[fc[0] && fc[0].status] || 0)) {
      turn = fc[i];
      break;
    }
  }
  const dotColor = (s2) => s2 === "clean" ? "#22C55E" : s2 === "moderate" ? "#F59E0B" : s2 === "avoid" ? "#E8522A" : "#3D6880";
  return [
    {
      eyebrow: `${T2("AUJOURD'HUI", "TODAY", "HOY")} \xB7 ${beach.name}`,
      heading: `${vm.verb} ${vm.emoji}`,
      sub: beach.scoreReason || "",
      scene: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "bsv0s", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#0B2230" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#155A5A" }), /* @__PURE__ */ React.createElement("stop", { offset: ".84", stopColor: "#C97E3A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#F2B05E" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "bsv0e", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#1A5852" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#08251F" }))), /* @__PURE__ */ React.createElement("rect", { width: "800", height: "600", fill: "url(#bsv0s)" }), /* @__PURE__ */ React.createElement("path", { d: "M348 300 a57 57 0 0 1 114 0 Z", fill: "#FFD884", opacity: ".85" }), /* @__PURE__ */ React.createElement("rect", { y: "360", width: "800", height: "240", fill: "url(#bsv0e)" }), /* @__PURE__ */ React.createElement("line", { x1: "-40", y1: "388", x2: "840", y2: "388", stroke: "#FFD884", strokeWidth: "2.2", strokeDasharray: "3 13", opacity: ".5" }), /* @__PURE__ */ React.createElement("path", { d: "M250 472 Q390 444 530 468 Q630 484 820 460 L820 620 L250 620 Z", fill: "#13302A" }), beach.status === "clean" && /* @__PURE__ */ React.createElement("g", { style: { transform: "translateY(calc(var(--p0)*-3px))" } }, /* @__PURE__ */ React.createElement("circle", { cx: "372", cy: "404", r: "6", fill: "#0D2B26" }), /* @__PURE__ */ React.createElement("path", { d: "M360 410 q12 -8 24 0", stroke: "#0D2B26", strokeWidth: "3.2", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "446", cy: "412", r: "5", fill: "#0D2B26" })), beach.status === "moderate" && /* @__PURE__ */ React.createElement("g", { style: { transform: "translateX(calc(var(--p0)*8px))" } }, /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "378", r: "3", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "344", cy: "380", r: "2.6", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "388", cy: "378", r: "2.6", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "432", cy: "379", r: "3", fill: "#FFC72C" })), beach.status === "avoid" && /* @__PURE__ */ React.createElement("g", { style: { transform: "translateX(calc(var(--p0)*10px))" } }, /* @__PURE__ */ React.createElement("ellipse", { cx: "320", cy: "384", rx: "24", ry: "8", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "470", cy: "396", rx: "20", ry: "7", fill: "#6b4a12" })), /* @__PURE__ */ React.createElement("g", { style: { transform: "translateX(calc(var(--p0)*104px - 16px))" } }, miVeil(298, 248, mwing, mlens)), typeof beach.score === "number" && /* @__PURE__ */ React.createElement("g", { style: { opacity: "var(--p0)", transformBox: "fill-box", transformOrigin: "center", transform: "scale(calc(.72 + var(--p0)*.28))" } }, /* @__PURE__ */ React.createElement("path", { d: "M500 206 C526 206 544 224 544 250 C544 276 526 294 500 294 C474 294 456 276 456 250 C456 224 474 206 500 206 Z", fill: beach.scoreColor || vm.color }), /* @__PURE__ */ React.createElement("text", { x: "500", y: "263", fontFamily: "'Anton',sans-serif", fontSize: "38", fill: "#fff", textAnchor: "middle" }, beach.score)))
    },
    {
      eyebrow: T2("LA SUITE", "WHAT'S NEXT", "LO QUE VIENE"),
      heading: `${turn ? T2("\xC7a se d\xE9grade", "It's turning", "Empeora") : T2("Demain, \xE7a tient", "Tomorrow holds", "Ma\xF1ana aguanta")} ${turn ? "\u26A0\uFE0F" : "\u2600\uFE0F"}`,
      sub: T2("5 jours d'avance, plage par plage. Le satellite a d\xE9j\xE0 regard\xE9.", "5 days ahead, beach by beach. The satellite already looked.", "5 d\xEDas por delante."),
      scene: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { width: "800", height: "600", fill: "#06211E" }), /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "206", r: "132", fill: "#0A2E2A" }), /* @__PURE__ */ React.createElement("g", { style: { transform: "translateX(calc(var(--p1)*70px - 35px))" } }, /* @__PURE__ */ React.createElement("line", { x1: "250", y1: "206", x2: "560", y2: "206", stroke: "#FFC72C", strokeWidth: "2", strokeDasharray: "5 8", opacity: ".55" })), miVeil(405, 206, "#5b3a8e", "#3fd07f"), [0, 1, 2, 3, 4].map((i) => /* @__PURE__ */ React.createElement("g", { key: i, style: { opacity: `calc(var(--p1)*1.5 - ${i * 0.2})` } }, /* @__PURE__ */ React.createElement("circle", { cx: 300 + i * 50, cy: "372", r: "11", fill: dotColor(fc[i] && fc[i].status || beach.status) }))), /* @__PURE__ */ React.createElement("text", { x: "400", y: "424", fontFamily: "ui-monospace,monospace", fontSize: "12", fill: "#7AADC4", textAnchor: "middle", opacity: ".7" }, T2("auj", "now", "hoy"), " \u2192 +5j"))
    },
    {
      eyebrow: T2("TON VEILLEUR", "YOUR WATCHER", "TU VIG\xCDA"),
      heading: beach.status === "avoid" ? T2("On trouve mieux", "Let's find better", "Buscamos mejor") : T2("C'est ta journ\xE9e", "It's your day", "Es tu d\xEDa"),
      sub: T2("Je surveille ta plage et je te pr\xE9viens la veille o\xF9 elle se trouble.", "I watch your beach and warn you the day before it turns.", "Vigilo tu playa y te aviso la v\xEDspera."),
      cta: T2("Mon veilleur \u2192", "My watcher \u2192", "Mi vig\xEDa \u2192"),
      scene: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "bsv2s", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#0B2230" }), /* @__PURE__ */ React.createElement("stop", { offset: ".55", stopColor: "#11463E" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFC72C" }))), /* @__PURE__ */ React.createElement("rect", { width: "800", height: "600", fill: "url(#bsv2s)" }), /* @__PURE__ */ React.createElement("g", { style: { opacity: "var(--p2)" } }, /* @__PURE__ */ React.createElement("circle", { cx: "405", cy: "250", r: "62", fill: "none", stroke: "#FFE08A", strokeWidth: "2", opacity: ".4" })), /* @__PURE__ */ React.createElement("g", { style: { transformBox: "fill-box", transformOrigin: "405px 250px", transform: "scale(calc(.9 + var(--p2)*.18))" } }, miVeil(405, 250, mwing, mlens)))
    }
  ];
}
const ST = {
  _loading: {
    c: "#666",
    bg: "rgba(100,100,100,.1)",
    l: "Chargement\u2026",
    le: "Loading\u2026",
    les: "Cargando\u2026",
    e: "\u23F3",
    h2s: false,
    desc: "Donn\xE9es en cours de chargement\u2026",
    descEn: "Loading data\u2026",
    descEs: "Cargando datos\u2026"
  },
  clean: {
    c: C.green,
    bg: C.greenBg,
    l: "Propre",
    le: "Clean",
    les: "Limpia",
    e: "\u2705",
    h2s: false,
    desc: "Peu ou pas de sargasses d\xE9tect\xE9es par satellite au large.",
    descEn: "Little to no sargassum detected by satellite offshore.",
    descEs: "Poco o nada de sargazo detectado por sat\xE9lite en alta mar."
  },
  moderate: {
    c: C.stMod,
    bg: C.amberBg,
    l: "Mod\xE9r\xE9",
    le: "Moderate",
    les: "Moderado",
    e: "\u26A0\uFE0F",
    h2s: false,
    desc: "Pr\xE9sence mod\xE9r\xE9e de sargasses d\xE9tect\xE9e au large. V\xE9rifiez sur place avant de vous baigner.",
    descEn: "Moderate sargassum detected offshore. Check conditions on site before swimming.",
    descEs: "Presencia moderada de sargazo detectada en alta mar. Verifique en el lugar antes de nadar."
  },
  avoid: {
    c: C.red,
    bg: C.redBg,
    l: "Alerte",
    le: "Alert",
    les: "Alerta",
    e: "\u{1F6AB}",
    h2s: true,
    desc: "Forte concentration de sargasses d\xE9tect\xE9e au large. \xC9chouages probables \u2014 v\xE9rifiez l'\xE9tat de la plage sur place.",
    descEn: "High sargassum concentration detected offshore. Beaching likely \u2014 check beach conditions on site.",
    descEs: "Alta concentraci\xF3n de sargazo detectada en alta mar. Probable llegada a la playa \u2014 verifique las condiciones en el lugar."
  }
};
const SARGASSES_SEASON = (() => {
  const m = (/* @__PURE__ */ new Date()).getMonth();
  if (m >= 3 && m <= 8) return "high";
  if (m === 2 || m === 9) return "shoulder";
  return "off";
})();
const T = {
  fr: {
    days: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
    today: "Auj.",
    tomorrow: "Dem.",
    clean: "Propre",
    moderate: "Mod\xE9r\xE9",
    avoid: "Alerte",
    search: "Rechercher une plage\u2026",
    filters: ["Toutes", "Propres", "Favoris", "Alertes"],
    filtersIcon: ["\u{1F30A}", "\u2705", "\u2764\uFE0F", "\u{1F6AB}"],
    navMap: "Carte",
    navList: "Plages",
    navGame: "Jeu",
    navPremium: "Premium",
    verdictGo: "Tu peux y aller",
    verdictModerate: "\xC0 surveiller \u2014 \xE0 toi de voir",
    verdictAvoid: "\xC0 \xE9viter aujourd'hui",
    verdictUnknown: "Le Veilleur scanne encore",
    forecast: "Pr\xE9visions",
    weather: "M\xE9t\xE9o",
    directions: "Y aller",
    fav: "Favori",
    addFav: "Ajouter aux favoris",
    removeFav: "Retirer des favoris",
    wind: "Vent",
    uv: "UV",
    temp: "Temp\xE9rature",
    drive: "min",
    kids: "Enfants",
    snorkel: "Snorkeling",
    parking: "Parking",
    premium: "Premium",
    premiumDesc: "Ton veilleur sargasses : brief matin, alertes plages favorites, reco du jour.",
    premiumPrice: "4,99 \u20AC/mois",
    premiumCta: "Activer Premium \u2014 4,99 \u20AC/mois",
    premiumFeatures: ["Acc\xE8s complet imm\xE9diat \u2014 4,99 \u20AC/mois, annulable en 2 clics", "Brief matin : ta meilleure plage, chaque jour", "Alertes push avant que les sargasses arrivent", "Sans pub \xB7 Sans engagement \xB7 Paiement unique"],
    h2sWarn: "Si des sargasses sont \xE9chou\xE9es et en d\xE9composition sur place, \xE9loignez-vous (risque H\u2082S). Source : HCSP/ARS.",
    copernicus: "Copernicus Marine",
    live: "LIVE",
    nClean: "{n} propres",
    island_mq: "Martinique",
    island_gp: "Guadeloupe",
    reportThanks: "Merci pour ton signalement !",
    report: "Signaler",
    openWaze: "Ouvrir Waze",
    driftDown: "Dispersion attendue",
    driftUp: "Arriv\xE9e possible",
    driftStable: "Stable",
    close: "Fermer",
    nearby: "Plages \xE0 proximit\xE9",
    locked: "Premium",
    beachScore: "Score plage",
    waves: "Vagues",
    swell: "Houle",
    rain: "Pluie",
    scoreExcellent: "Excellent",
    scoreGood: "Bon",
    scoreMedium: "Moyen",
    scoreBad: "Conditions difficiles",
    marine: "Conditions marines",
    history: "Tendance r\xE9cente",
    historyEmpty: "Pas encore d'historique",
    historyDays: "{n}j",
    caribbeanView: "Vue Cara\xEFbe",
    localView: "Vue locale",
    caribbeanLegendTitle: "Concentration AFAI",
    caribbeanLegendLow: "Faible",
    caribbeanLegendMod: "Mod\xE9r\xE9",
    caribbeanLegendHigh: "Fort",
    caribbeanSource: "Source : NOAA ERDDAP \u2014 Donn\xE9es satellite AFAI",
    caribbeanZoneSargasso: "Mer des Sargasses",
    caribbeanZoneNERR: "NERR",
    caribbeanZoneLesser: "Petites Antilles",
    caribbeanZoneGreater: "Grandes Antilles",
    caribbeanZoneGulf: "Golfe du Mexique",
    caribbeanZoneAfrica: "C\xF4te Afrique Ouest",
    reliabilityHigh: "Haute",
    reliabilityMedium: "Moyenne",
    reliabilityLow: "Basse",
    reliabilityLabel: "Fiabilit\xE9",
    reliabilityHighDesc: "Donn\xE9es satellite r\xE9centes, mod\xE8le bien calibr\xE9 pour cette zone.",
    reliabilityMediumDesc: "Donn\xE9es partielles ou interpol\xE9es. V\xE9rifiez sur place.",
    reliabilityLowDesc: "Pr\xE9vision incertaine (horizon lointain ou donn\xE9es manquantes).",
    sourceLabel: "Source",
    sciFooter: "Copernicus \xB7 NOAA/AOML SIR v1.4 \xB7 Wang & Hu 2016",
    sciUpdated: "Mis \xE0 jour toutes les 3h",
    navLearn: "Science",
    learnTitle: "Comprendre les sargasses",
    learnBack: "Retour",
    learnHero: "Du satellite \xE0 ta plage",
    learnHeroSub: "La science derri\xE8re la pr\xE9vision",
    learnS1Title: "Qu'est-ce que les sargasses ?",
    learnS1P1: "Algues brunes p\xE9lagiques (Sargassum natans + fluitans) qui flottent gr\xE2ce \xE0 de petites v\xE9sicules de gaz. Elles ne touchent jamais le fond.",
    learnS1P2: "Reproduction v\xE9g\xE9tative : un fragment donne une nouvelle colonie. Population doubl\xE9e tous les 18 jours en conditions favorables.",
    learnS1P3: "En 2018, d\xE9couverte de la Grande Ceinture Atlantique (GASB) : plus de 20 millions de tonnes, de l'Afrique au Golfe du Mexique.",
    learnS2Title: "Pourquoi elles arrivent ?",
    learnS2P1: "Nutriments \u2014 D\xE9forestation amazonienne, fleuve Congo, engrais agricoles. Azote + phosphore fertilisent l'oc\xE9an.",
    learnS2P2: "Temp\xE9rature \u2014 Hausse des SST qui acc\xE9l\xE8re la croissance et \xE9largit les zones favorables.",
    learnS2P3: "Courants \u2014 La NERR (North Equatorial Recirculation Region) transporte les bancs vers les Antilles.",
    learnS2P4: "Saison \u2014 Pic d'\xE9chouage avril \xE0 septembre, maximum en juin-juillet.",
    learnS3Title: "Impact",
    learnS3Eco: "\xC9cologique \u2014 \xC9touffement des r\xE9cifs, mortalit\xE9 des tortues, poissons, oursins.",
    learnS3Health: "Sanitaire \u2014 H\u2082S (hydrog\xE8ne sulfur\xE9) + ammoniaque. Maux de t\xEAte, naus\xE9es, d\xE9tresse respiratoire.",
    learnS3Econ: "\xC9conomique \u2014 Recul du tourisme, p\xEAche perturb\xE9e. Co\xFBt de nettoyage : des dizaines de millions par an.",
    learnS4Title: "Comment on d\xE9tecte",
    learnS4P1: "Satellites \u2014 MODIS (NASA) + Copernicus (ESA) mesurent l'indice AFAI par signature spectrale.",
    learnS4P2: "Seuils NOAA \u2014 < 0.15 propre \xB7 0.15\u20130.40 mod\xE9r\xE9 \xB7 > 0.40 alerte.",
    learnS4P3: "Notre m\xE9thode \u2014 Interpolation IDW + forecast par bancs d\xE9rivants + signal d'arriv\xE9e.",
    learnS4Sources: "Sources : Wang & Hu 2016 \xB7 NOAA/AOML SIR \xB7 USF Optical Oceanography Lab \xB7 Copernicus Marine Service.",
    learnCta: "Voir la carte des sargasses"
  },
  en: {
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    today: "Today",
    tomorrow: "Tmrw",
    clean: "Clean",
    moderate: "Moderate",
    avoid: "Alert",
    search: "Search a beach\u2026",
    filters: ["All", "Clean", "Favourites", "Alerts"],
    filtersIcon: ["\u{1F30A}", "\u2705", "\u2764\uFE0F", "\u{1F6AB}"],
    navMap: "Map",
    navList: "Beaches",
    navGame: "Game",
    navPremium: "Premium",
    verdictGo: "Go for it",
    verdictModerate: "Worth a check \u2014 your call",
    verdictAvoid: "Skip it today",
    verdictUnknown: "The Watchman's still scanning",
    forecast: "Forecast",
    weather: "Weather",
    directions: "Directions",
    fav: "Favourite",
    addFav: "Add to favourites",
    removeFav: "Remove from favourites",
    wind: "Wind",
    uv: "UV",
    temp: "Temperature",
    drive: "min",
    kids: "Kids",
    snorkel: "Snorkeling",
    parking: "Parking",
    premium: "Premium",
    premiumDesc: "Your sargassum watchman: morning brief, favourite-beach alerts, daily pick.",
    premiumPrice: "\u20AC4.99/mo",
    premiumCta: "Activate Premium \u2014 \u20AC4.99/mo",
    premiumFeatures: ["Full immediate access to the 7-day forecast and alerts", "Morning brief: your best beach, every day", "Push alerts before sargassum hits your favourites", "No ads \xB7 One-time payment \xB7 Instant access"],
    h2sWarn: "If sargassum is beached and decomposing on site, move away (H\u2082S risk). Source: HCSP/ARS.",
    copernicus: "Copernicus Marine",
    live: "LIVE",
    nClean: "{n} clean",
    island_mq: "Martinique",
    island_gp: "Guadeloupe",
    reportThanks: "Thanks for your report!",
    report: "Report",
    openWaze: "Open Waze",
    driftDown: "Dispersing",
    driftUp: "Incoming",
    driftStable: "Stable",
    close: "Close",
    nearby: "Nearby beaches",
    locked: "Premium",
    beachScore: "Beach Score",
    waves: "Waves",
    swell: "Swell",
    rain: "Rain",
    scoreExcellent: "Excellent",
    scoreGood: "Good",
    scoreMedium: "Fair",
    scoreBad: "Difficult conditions",
    marine: "Marine conditions",
    history: "Recent trend",
    historyEmpty: "No history yet",
    historyDays: "{n}d",
    caribbeanView: "Caribbean View",
    localView: "Local View",
    caribbeanLegendTitle: "AFAI Concentration",
    caribbeanLegendLow: "Low",
    caribbeanLegendMod: "Moderate",
    caribbeanLegendHigh: "High",
    caribbeanSource: "Source: NOAA ERDDAP \u2014 AFAI Satellite Data",
    caribbeanZoneSargasso: "Sargasso Sea",
    caribbeanZoneNERR: "NERR",
    caribbeanZoneLesser: "Lesser Antilles",
    caribbeanZoneGreater: "Greater Antilles",
    caribbeanZoneGulf: "Gulf of Mexico",
    caribbeanZoneAfrica: "West Africa Coast",
    reliabilityHigh: "High",
    reliabilityMedium: "Medium",
    reliabilityLow: "Low",
    reliabilityLabel: "Reliability",
    reliabilityHighDesc: "Recent satellite data, model well-calibrated for this area.",
    reliabilityMediumDesc: "Partial or interpolated data. Check on site.",
    reliabilityLowDesc: "Uncertain forecast (far horizon or missing data).",
    sourceLabel: "Source",
    sciFooter: "Copernicus \xB7 NOAA/AOML SIR v1.4 \xB7 Wang & Hu 2016",
    sciUpdated: "Updated every 3h",
    navLearn: "Science",
    learnTitle: "Understanding sargassum",
    learnBack: "Back",
    learnHero: "From satellite to your beach",
    learnHeroSub: "The science behind the forecast",
    learnS1Title: "What is sargassum?",
    learnS1P1: "Pelagic brown algae (Sargassum natans + fluitans) that float via gas-filled bladders. They never touch the seabed.",
    learnS1P2: "Vegetative reproduction: one fragment grows a new colony. Population doubles every 18 days in favorable conditions.",
    learnS1P3: "In 2018, researchers discovered the Great Atlantic Sargassum Belt (GASB): over 20 million tonnes, from Africa to the Gulf of Mexico.",
    learnS2Title: "Why do they arrive?",
    learnS2P1: "Nutrients \u2014 Amazon deforestation, Congo river, agricultural fertilizers. Nitrogen + phosphorus feed the ocean.",
    learnS2P2: "Temperature \u2014 Rising SST accelerates growth and expands favorable zones.",
    learnS2P3: "Currents \u2014 The NERR (North Equatorial Recirculation Region) carries rafts toward the Caribbean.",
    learnS2P4: "Season \u2014 Peak beaching April to September, max in June\u2013July.",
    learnS3Title: "Impact",
    learnS3Eco: "Ecological \u2014 Coral reef smothering, mortality of turtles, fish, sea urchins.",
    learnS3Health: "Health \u2014 H\u2082S (hydrogen sulfide) + ammonia. Headaches, nausea, respiratory distress.",
    learnS3Econ: "Economic \u2014 Tourism decline, disrupted fishing. Cleanup costs: tens of millions per year.",
    learnS4Title: "How we detect",
    learnS4P1: "Satellites \u2014 MODIS (NASA) + Copernicus (ESA) measure the AFAI index via spectral signature.",
    learnS4P2: "NOAA thresholds \u2014 < 0.15 clean \xB7 0.15\u20130.40 moderate \xB7 > 0.40 alert.",
    learnS4P3: "Our method \u2014 IDW interpolation + drifting-raft forecast + arrival signal.",
    learnS4Sources: "Sources: Wang & Hu 2016 \xB7 NOAA/AOML SIR \xB7 USF Optical Oceanography Lab \xB7 Copernicus Marine Service.",
    learnCta: "See the sargassum map"
  },
  es: {
    days: ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"],
    today: "Hoy",
    tomorrow: "Ma\xF1.",
    clean: "Limpia",
    moderate: "Moderada",
    avoid: "Alerta",
    search: "Buscar una playa\u2026",
    filters: ["Todas", "Limpias", "Favoritas", "Alertas"],
    filtersIcon: ["\u{1F30A}", "\u2705", "\u2764\uFE0F", "\u{1F6AB}"],
    navMap: "Mapa",
    navList: "Playas",
    navGame: "Juego",
    navPremium: "Premium",
    verdictGo: "Puedes ir",
    verdictModerate: "A vigilar \u2014 t\xFA decides",
    verdictAvoid: "Evita hoy",
    verdictUnknown: "El Vig\xEDa sigue escaneando",
    forecast: "Pron\xF3stico",
    weather: "Clima",
    directions: "C\xF3mo llegar",
    fav: "Favorita",
    addFav: "Agregar a favoritas",
    removeFav: "Quitar de favoritas",
    wind: "Viento",
    uv: "UV",
    temp: "Temperatura",
    drive: "min",
    kids: "Ni\xF1os",
    snorkel: "Snorkel",
    parking: "Estacionamiento",
    premium: "Premium",
    premiumDesc: "Tu vig\xEDa del sargazo: resumen matutino, alertas de playas favoritas, recomendaci\xF3n del d\xEDa.",
    premiumPrice: "4,99 \u20AC/mes",
    premiumCta: "Activar Premium \u2014 4,99 \u20AC/mes",
    premiumFeatures: ["Acceso completo inmediato a la previsi\xF3n de 7 d\xEDas y las alertas", "Resumen matutino: tu mejor playa, cada d\xEDa", "Alertas push antes de que llegue el sargazo", "Sin anuncios \xB7 Pago \xFAnico \xB7 Acceso inmediato"],
    h2sWarn: "Si el sargazo est\xE1 varado y en descomposici\xF3n, al\xE9jese (riesgo de H\u2082S). Fuente: HCSP/ARS.",
    copernicus: "Copernicus Marine",
    live: "EN VIVO",
    nClean: "{n} limpias",
    island_mq: "Martinica",
    island_gp: "Guadalupe",
    reportThanks: "\xA1Gracias por tu reporte!",
    report: "Reportar",
    openWaze: "Abrir Waze",
    driftDown: "Dispersi\xF3n esperada",
    driftUp: "Llegada posible",
    driftStable: "Estable",
    close: "Cerrar",
    nearby: "Playas cercanas",
    locked: "Premium",
    beachScore: "Puntuaci\xF3n playa",
    waves: "Olas",
    swell: "Oleaje",
    rain: "Lluvia",
    scoreExcellent: "Excelente",
    scoreGood: "Bueno",
    scoreMedium: "Regular",
    scoreBad: "Condiciones dif\xEDciles",
    marine: "Condiciones marinas",
    history: "Tendencia reciente",
    historyEmpty: "Sin historial a\xFAn",
    historyDays: "{n}d",
    caribbeanView: "Vista Caribe",
    localView: "Vista local",
    caribbeanLegendTitle: "Concentraci\xF3n AFAI",
    caribbeanLegendLow: "Baja",
    caribbeanLegendMod: "Moderada",
    caribbeanLegendHigh: "Alta",
    caribbeanSource: "Fuente: NOAA ERDDAP \u2014 Datos satelitales AFAI",
    caribbeanZoneSargasso: "Mar de los Sargazos",
    caribbeanZoneNERR: "NERR",
    caribbeanZoneLesser: "Antillas Menores",
    caribbeanZoneGreater: "Antillas Mayores",
    caribbeanZoneGulf: "Golfo de M\xE9xico",
    caribbeanZoneAfrica: "Costa \xC1frica Occ.",
    reliabilityHigh: "Alta",
    reliabilityMedium: "Media",
    reliabilityLow: "Baja",
    reliabilityLabel: "Fiabilidad",
    reliabilityHighDesc: "Datos satelitales recientes, modelo bien calibrado para esta zona.",
    reliabilityMediumDesc: "Datos parciales o interpolados. Verifique en el lugar.",
    reliabilityLowDesc: "Pron\xF3stico incierto (horizonte lejano o datos faltantes).",
    sourceLabel: "Fuente",
    sciFooter: "Copernicus \xB7 NOAA/AOML SIR v1.4 \xB7 Wang & Hu 2016",
    sciUpdated: "Actualizado cada 3h",
    navLearn: "Ciencia",
    learnTitle: "Entender el sargazo",
    learnBack: "Volver",
    learnHero: "Del sat\xE9lite a tu playa",
    learnHeroSub: "La ciencia detr\xE1s del pron\xF3stico",
    learnS1Title: "\xBFQu\xE9 es el sargazo?",
    learnS1P1: "Algas pardas pel\xE1gicas (Sargassum natans + fluitans) que flotan gracias a peque\xF1as ves\xEDculas de gas. Nunca tocan el fondo.",
    learnS1P2: "Reproducci\xF3n vegetativa: un fragmento genera una nueva colonia. Poblaci\xF3n se duplica cada 18 d\xEDas en condiciones favorables.",
    learnS1P3: "En 2018, descubrimiento del Gran Cintur\xF3n Atl\xE1ntico (GASB): m\xE1s de 20 millones de toneladas, de \xC1frica al Golfo de M\xE9xico.",
    learnS2Title: "\xBFPor qu\xE9 llegan?",
    learnS2P1: "Nutrientes \u2014 Deforestaci\xF3n amaz\xF3nica, r\xEDo Congo, fertilizantes agr\xEDcolas. Nitr\xF3geno + f\xF3sforo fertilizan el oc\xE9ano.",
    learnS2P2: "Temperatura \u2014 Aumento de la SST que acelera el crecimiento y ampl\xEDa las zonas favorables.",
    learnS2P3: "Corrientes \u2014 La NERR (North Equatorial Recirculation Region) transporta los bancos hacia el Caribe.",
    learnS2P4: "Temporada \u2014 Pico de llegada de abril a septiembre, m\xE1ximo en junio-julio.",
    learnS3Title: "Impacto",
    learnS3Eco: "Ecol\xF3gico \u2014 Asfixia de arrecifes, mortalidad de tortugas, peces, erizos.",
    learnS3Health: "Sanitario \u2014 H\u2082S (sulfuro de hidr\xF3geno) + amon\xEDaco. Dolores de cabeza, n\xE1useas, dificultad respiratoria.",
    learnS3Econ: "Econ\xF3mico \u2014 Retroceso del turismo, pesca perturbada. Costo de limpieza: decenas de millones por a\xF1o.",
    learnS4Title: "C\xF3mo lo detectamos",
    learnS4P1: "Sat\xE9lites \u2014 MODIS (NASA) + Copernicus (ESA) miden el \xEDndice AFAI por firma espectral.",
    learnS4P2: "Umbrales NOAA \u2014 < 0.15 limpia \xB7 0.15\u20130.40 moderada \xB7 > 0.40 alerta.",
    learnS4P3: "Nuestro m\xE9todo \u2014 Interpolaci\xF3n IDW + pron\xF3stico por bancos a la deriva + se\xF1al de llegada.",
    learnS4Sources: "Fuentes: Wang & Hu 2016 \xB7 NOAA/AOML SIR \xB7 USF Optical Oceanography Lab \xB7 Copernicus Marine Service.",
    learnCta: "Ver el mapa del sargazo"
  }
};
const BEACHES_FALLBACK = [
  { id: "mq001", island: "mq", name: "Plage des Salines", commune: "Sainte-Anne", lat: 14.3958521, lng: -60.8689802, kids: true, snorkel: false, parking: true, drive: 52 },
  { id: "mq011", island: "mq", name: "Anse Mitan", commune: "Les Trois-\xCElets", lat: 14.5522593, lng: -61.0552056, kids: true, snorkel: false, parking: true, drive: 18 },
  { id: "mq014", island: "mq", name: "Grande Anse d'Arlet", commune: "Les Anses-d'Arlet", lat: 14.5027854, lng: -61.0856311, kids: true, snorkel: true, parking: true, drive: 25 },
  { id: "mq016", island: "mq", name: "Plage du Diamant", commune: "Le Diamant", lat: 14.4758027, lng: -61.0314046, kids: false, snorkel: false, parking: true, drive: 32 },
  { id: "mq005", island: "mq", name: "Anse Trabaud", commune: "Sainte-Anne", lat: 14.4101296, lng: -60.8482068, kids: false, snorkel: false, parking: true, drive: 52 },
  { id: "mq024", island: "mq", name: "Anse Madame", commune: "Schoelcher", lat: 14.6177983, lng: -61.1036302, kids: true, snorkel: false, parking: true, drive: 12 },
  { id: "mq029", island: "mq", name: "Plage de Saint-Pierre", commune: "Saint-Pierre", lat: 14.7404792, lng: -61.1768484, kids: true, snorkel: true, parking: true, drive: 32 },
  { id: "mq012", island: "mq", name: "Anse Noire", commune: "Les Anses-d'Arlet", lat: 14.5277232, lng: -61.0873771, kids: true, snorkel: true, parking: false, drive: 28 },
  { id: "mq019", island: "mq", name: "Anse Gros Raisins", commune: "Sainte-Luce", lat: 14.4658147, lng: -60.9260982, kids: true, snorkel: true, parking: false, drive: 38 },
  { id: "mq023", island: "mq", name: "Plage de la Fran\xE7aise", commune: "Fort-de-France", lat: 14.6011133, lng: -61.0674743, kids: true, snorkel: false, parking: true, drive: 8 },
  { id: "gp009", island: "gp", name: "Plage de la Caravelle", commune: "Sainte-Anne", lat: 16.2181, lng: -61.3965, kids: true, snorkel: true, parking: true, drive: 38 },
  { id: "gp012", island: "gp", name: "Plage du Gosier", commune: "Le Gosier", lat: 16.205254, lng: -61.4430474, kids: true, snorkel: true, parking: true, drive: 12 },
  { id: "gp031", island: "gp", name: "Plage de Malendure", commune: "Bouillante", lat: 16.1720515, lng: -61.7767401, kids: true, snorkel: true, parking: true, drive: 42 },
  { id: "gp024", island: "gp", name: "Plage de Deshaies", commune: "Deshaies", lat: 16.3053509, lng: -61.7950711, kids: true, snorkel: true, parking: true, drive: 55 },
  { id: "gp005", island: "gp", name: "Pointe des Ch\xE2teaux", commune: "Saint-Fran\xE7ois", lat: 16.2467983, lng: -61.1763633, kids: false, snorkel: false, parking: true, drive: 52 },
  { id: "gp015", island: "gp", name: "Porte d'Enfer", commune: "Anse-Bertrand", lat: 16.4861861, lng: -61.4416828, kids: false, snorkel: false, parking: true, drive: 55 },
  { id: "gp045", island: "gp", name: "Plage Pain de Sucre", commune: "Terre-de-Haut (Les Saintes)", lat: 15.8635, lng: -61.5988, kids: true, snorkel: true, parking: false, drive: 60 },
  { id: "gp001", island: "gp", name: "Plage de Saint-Fran\xE7ois", commune: "Saint-Fran\xE7ois", lat: 16.2521, lng: -61.2644, kids: true, snorkel: true, parking: true, drive: 48 },
  { id: "gp010", island: "gp", name: "Plage de Sainte-Anne", commune: "Sainte-Anne", lat: 16.2226, lng: -61.3828, kids: true, snorkel: false, parking: true, drive: 38 },
  { id: "gp021", island: "gp", name: "Plage de Grande Anse", commune: "Trois-Rivi\xE8res", lat: 15.9589717, lng: -61.6719389, kids: true, snorkel: true, parking: true, drive: 45 }
];
const ISLAND_CENTER = { mq: [14.64, -61.02], gp: [16.22, -61.55] };
if (IS_NEW_REGION && REGION.center) ISLAND_CENTER[REGION.id] = [REGION.center.lat, REGION.center.lng];
const SARG_TO_BEACH = { "grande-anse": "mq014", "anse-mitan": "mq011", "anse-noire": "mq012", "tartane": "mq034", "anse-madame": "mq024", "diamant": "mq016", "pt-marin": "mq008", "sainte-anne": "mq004", "les-salines": "mq001", "vauclin": "mq044", "precheur": "mq033", "gp-grande-anse": "gp021", "gp-malendure": "gp031", "gp-sainte-anne": "gp010", "gp-pt-chateaux": "gp005", "gp-gosier": "gp012", "gp-caravelle": "gp009", "gp-bas-du-fort": "gp014", "gp-deshaies": "gp024", "gp-moule": "gp080", "gp-vieux-fort": "gp042" };
const BEACH_TO_SARG = new Proxy(Object.fromEntries(Object.entries(SARG_TO_BEACH).map(([k, v]) => [v, k])), { get: (t, p) => typeof p === "string" ? p in t ? t[p] : p : void 0 });
function findMostRelevantThreat(banks, beaches, favorites, userPos, island2) {
  if (!banks || !banks.length || !beaches || !beaches.length) return null;
  const isGP = island2 === "gp";
  const visible = banks.filter((b) => isGP ? b.centroid[0] >= 15.5 : b.centroid[0] < 15.5);
  let best = null, bestScore = -1;
  for (const bank of visible) {
    if (!bank.threatens) continue;
    for (const tk of ["now", "6h", "12h", "24h"]) {
      const threats = bank.threatens[tk];
      if (!threats) continue;
      for (const t of threats) {
        const beachId = SARG_TO_BEACH[t.id] || t.id;
        const beach = beachId ? beaches.find((b) => b.id === beachId) : null;
        if (!beach) continue;
        let score = 0;
        if (favorites && favorites.includes(beach.id)) score += 100;
        if (userPos) {
          const d = haversine(userPos.lat, userPos.lng, beach.lat, beach.lng);
          score += Math.max(0, 50 * (1 - d / 50));
        }
        score += tk === "now" ? 40 : tk === "6h" ? 30 : tk === "12h" ? 20 : 10;
        score += bank.mass * 20;
        if (score > bestScore) {
          bestScore = score;
          best = { bank, beach, timeKey: tk, km: t.km };
        }
      }
    }
  }
  return best;
}
const STRIPE_LINK_MONTHLY = "";
const STRIPE_LINK_ANNUAL = "";
const STRIPE_LINK_PRO = "";
const STRIPE_BUY_BTN_PRO = "";
const STRIPE_PK = "pk_live_51PW2TGP9RK8Orx516Nx5mGUixrk2ozE8ppOcygq9Wkb1Tz5CkozRcRFcPAv53uNOmuVCHakWAse09I7KXuUiAb5r00CKYHh9zE";
const PAY_PROVIDER = (() => {
  try {
    const q = window.location.search;
    if (/[?&]pay=stripe/.test(q)) return "mollie";
    if (/[?&]pay=mollie/.test(q)) return "mollie";
    if (/[?&]pay=paypal/.test(q)) return "paypal";
  } catch (_) {
  }
  return "mollie";
})();
const PAY_LABEL = PAY_PROVIDER === "mollie" ? "Mollie" : PAY_PROVIDER === "paypal" ? "PayPal" : "Stripe";
const MOLLIE_PROFILE = "pfl_t8KCk4Cm2C";
const MOLLIE_TESTMODE = (() => {
  try {
    return /[?&]mollie_test=1/.test(window.location.search);
  } catch (_) {
    return false;
  }
})();
const PAYPAL_CLIENT_ID = "AadXarqTbu1KiLVh89ESKJ9tIXn-RZ_2U43fDU8lnQ3TgzChda6ZPVZKbpyqO70ySqerJIDXLUyFukSI";
const PAYPAL_PLANS = { monthly: "P-68F60416PW205280SNI474LI", annual: "P-2B698370FU622014SNI474LI" };
const MOLLIE_LIVE_USD = /* @__PURE__ */ new Set(["florida", "puntacana", "rivieramaya"]);
const PAY_CAPTURE_ONLY = (() => {
  try {
    const q = window.location.search;
    if (/[?&]pay_capture=1/.test(q)) return true;
    if (/[?&]pay_capture=0/.test(q) || /[?&]pay=(paypal|mollie|stripe)/.test(q)) return false;
  } catch (_) {
  }
  return IS_NEW_REGION && !MOLLIE_LIVE_USD.has(REGION.id);
})();
const STRIPE_BUY_BTN_MONTHLY = "buy_btn_1TJLdoP9RK8Orx514zzwL1B4";
const STRIPE_BUY_BTN_ANNUAL = "buy_btn_1TJLcjP9RK8Orx51JDzUFge3";
const REGION_PAY = IS_NEW_REGION ? REGION.paymentLinks || {} : null;
const PAY_CUR = IS_NEW_REGION && REGION && REGION.currency === "USD" ? "usd" : "eur";
const LINK_MONTHLY = REGION_PAY ? REGION_PAY.monthly || "" : "onsite";
const LINK_ANNUAL = REGION_PAY ? REGION_PAY.yearly || "" : "onsite";
const LINK_PRO = REGION_PAY ? "" : STRIPE_LINK_PRO;
const PAYWALL_READY = !REGION_PAY || !!LINK_MONTHLY;
const PRICE_MO = REGION_PAY ? REGION.pricing?.monthly || "$9.99" : getLang() === "en" ? "\u20AC4.99" : "4,99 \u20AC";
const PRICE_YR = REGION_PAY ? REGION.pricing?.yearly || "$79" : getLang() === "en" ? "\u20AC49" : "49 \u20AC";
function pricePerDay() {
  try {
    const mo = String(PRICE_MO);
    const num = parseFloat(mo.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (!isFinite(num) || num <= 0) return null;
    const d = num / 30;
    return /\$/.test(mo) ? `$${d.toFixed(2)}` : `${d.toFixed(2).replace(".", ",")} \u20AC`;
  } catch (_) {
    return null;
  }
}
const LINK_TRIP = REGION_PAY ? REGION_PAY.tripPass || "" : "";
const PRICE_TRIP = REGION_PAY ? REGION.pricing?.tripPass || "$5.99" : null;
const TRIP_CENTS = (() => {
  const n = parseFloat(String(PRICE_TRIP || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
})();
const EUR_TRIP_CENTS = 499;
const PRICE_TRIP_EUR = getLang() === "en" ? "\u20AC4.99" : "4,99 \u20AC";
const NO_TRIAL = true;
function Paywall3ViewOverlay({ lang, openPremium, track: track2 }) {
  const dismiss = () => {
    try {
      sessionStorage.setItem("sg_paywall_3view_dismissed", "1");
      sessionStorage.setItem("sg_paywall_3view_reset", String(Date.now() + 6 * 60 * 60 * 1e3));
    } catch (_) {
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    inset: 0,
    zIndex: 1400,
    background: "rgba(13,17,23,0.85)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    animation: "pw3Fade .3s ease-out"
  } }, /* @__PURE__ */ React.createElement("style", null, `@keyframes pw3Fade{from{opacity:0}to{opacity:1}}`), /* @__PURE__ */ React.createElement("div", { style: {
    background: "white",
    borderRadius: 20,
    padding: "24px 20px",
    maxWidth: 360,
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    textAlign: "center",
    border: "3px solid #0d1117",
    position: "relative"
  } }, /* @__PURE__ */ React.createElement("button", { onClick: dismiss, "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "2px solid #0d1117",
    background: "white",
    color: "#0d1117",
    font: "700 18px/1 'Bricolage Grotesque'",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  } }, "\xD7"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 28, lineHeight: 1.1, color: "#0d1117", marginBottom: 8, textTransform: "uppercase", letterSpacing: "-.5px" } }, _t(lang, "Vous avez consult\xE9 3 plages", "You've viewed 3 beaches", "Has consultado 3 playas")), /* @__PURE__ */ React.createElement("div", { style: { font: "600 14px/1.4 'Bricolage Grotesque'", color: "#41414a", marginBottom: 20 } }, _t(lang, "Pour un suivi illimit\xE9 + alertes email + widget embarqu\xE9 :", "For unlimited tracking + email alerts + embeddable widget :", "Para seguimiento ilimitado + alertas email + widget integrable :")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    track2("sg_paywall_3view_cta", {});
    openPremium("paywall_3view");
  }, style: {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "3px solid #0d1117",
    background: "linear-gradient(180deg,#ffe07a,#ffb338)",
    boxShadow: "0 4px 14px rgba(255,150,60,0.35)",
    color: "#0d1117",
    font: "800 15px/1 'Bricolage Grotesque'",
    cursor: "pointer",
    marginBottom: 10
  } }, _t(lang, "D\xE9couvrir les offres pro \u2192", "Discover pro offers \u2192", "Descubrir ofertas pro \u2192")), /* @__PURE__ */ React.createElement("button", { onClick: dismiss, style: {
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "2px solid #0d1117",
    background: "white",
    color: "#0d1117",
    font: "700 13px/1 'Bricolage Grotesque'",
    cursor: "pointer"
  } }, _t(lang, "Peut-\xEAtre plus tard", "Maybe later", "Quiz\xE1s m\xE1s tarde"))));
}
const g = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const s = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
  }
};
const AB_FREEZE_MAP = {
  "pw_copy": null,
  // 3-way CTA copy (urgency/value/trust) — LIRE le variant
  "pw_pass_seq": null
  // Pass offer sequencing — LIRE le variant
  // Tous les autres A/B purgés → hardcodés dans le code (control ou variante promue)
};
function abVariant(testId, variants, weights) {
  if (testId in AB_FREEZE_MAP) {
    const frozen = AB_FREEZE_MAP[testId];
    if (frozen === null) {
      const ab = g("sg_ab", {});
      if (ab[testId] != null && ab[testId] < variants.length) return variants[ab[testId]];
      const r = Math.random();
      let cum = 0, pick2 = 0;
      for (let i = 0; i < weights.length; i++) {
        cum += weights[i];
        if (r < cum) {
          pick2 = i;
          break;
        }
      }
      ab[testId] = pick2;
      s("sg_ab", ab);
      return variants[pick2];
    }
    return frozen;
  }
  return variants[0];
}
const TRACK_QUEUE_KEY = "sg_track_queue";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec";
const SG_FUNNEL_EVENTS = /* @__PURE__ */ new Set([
  "sg_session_start",
  "sg_forecast_lock_click",
  "sg_map_open",
  "sg_beach_open",
  "sg_verdict_scan_view",
  // Funnel B2C haut de漏 (top-funnel, 2026-08-04) : map→beach→verdict.
  // Funnel B2C bas (existant) : paywall→cta→checkout→conversion.
  // ⚠️ sg_premium_modal_cta et sg_checkout_redirect RETIRÉS (2026-08-18) :
  // jamais émis par le frontend → compteur toujours 0. Le CTA réel = sg_pass_cta.
  "sg_premium_modal_open",
  "sg_pass_cta",
  "sg_conversion",
  "sg_email_submit",
  "sg_mollie_checkout_redirect",
  // Checkout on-site (2026-08-25) : ouverture overlay carte + retour arrière —
  // sans eux le funnel est aveugle entre pass_cta et mollie_checkout_redirect.
  "sg_onsite_checkout_opened",
  "sg_pay_onsite_back",
  // Engagement verdict (2026-08-04) : expansion methodology + forecast view.
  "sg_verdict_expand",
  "sg_forecast_view",
  "sg_paywall_view",
  "sg_payment_failed",
  "sg_premium_feature_click",
  // Funnel B2B séquentiel (2026-07-02) : view→step→intent→activated par écran/cohorte.
  "sg_b2b_offer_view",
  "sg_b2b_step",
  "sg_b2b_intent",
  "sg_b2b_trial_activated",
  "sg_pass_offer_view",
  // Paywall B2C offre-first (A/B pw_pass_seq, 2026-07-02) : ouverture de l'écran preuve
  // opt-in (critère de mort <3 % → default-off) + retour. Le bras A/B ride en ab_pw_pass_seq.
  "sg_pass_proof_open",
  "sg_pass_seq_back",
  // Mode vitrine "Le Registre du Veilleur" (?demo=1, attract mode, 2026-07-02) : impression
  // display + tap + scan QR de hall. Volume FAIBLE assumé (rétention/fierté B2B, cf. critère de mort).
  "sg_attract_view",
  "sg_attract_tap",
  "sg_attract_share",
  "sg_lobby_scan",
  // Les 10 postes du Veilleur « Jusqu'où on descend » (?verticals, 2026-07-02) : ouverture de
  // l'overlay des 10 verticales + tap d'une action (par tier) + capture waitlist PILOT (Prisme).
  "sg_verticales_view",
  "sg_verticales_tap",
  "sg_verticales_waitlist",
  // MAP VALUE SPRINT #1 : top 3 best beaches click
  "sg_best_beach_click",
  // MONETIZATION SPRINT #3 — Lead capture, paywall, B2B CTA
  "sg_lead_banner_view",
  "sg_lead_banner_submit",
  "sg_lead_banner_dismiss",
  "sg_paywall_forecast_shown",
  "sg_paywall_forecast_click",
  "sg_beach_cta_b2b_shown",
  "sg_beach_cta_b2b_click",
  "sg_paywall_3view_cta",
  // Cross-sell inter-domain
  "sg_region_nav_click",
  "sg_cross_sell_click"
]);
function track(event, params = {}) {
  if (typeof window !== "undefined" && window.track && window.track !== track && !track._calling) {
    track._calling = true;
    try {
      return window.track(event, params);
    } finally {
      track._calling = false;
    }
  }
  const ab = g("sg_ab", {});
  const p = { ...params };
  for (const [k, v] of Object.entries(ab)) p["ab_" + k] = v;
  if (SG_FUNNEL_EVENTS.has(event)) {
    try {
      p.sg_session_id = sgUid();
    } catch (_) {
      p.sg_session_id = "";
    }
  }
  const _consent = (() => {
    try {
      return localStorage.getItem("sg_cookie_consent");
    } catch (_) {
      return null;
    }
  })();
  if (_consent === "accepted" && SG_FUNNEL_EVENTS.has(event)) {
    try {
      logAnalyticsEvent(event, p, IS_NEW_REGION ? REGION.id.toUpperCase() : typeof window !== "undefined" && window.location.hostname.includes("guadeloupe") ? "GP" : "MQ");
    } catch (_) {
    }
  }
  try {
    window.gtag("event", event, p);
  } catch (e) {
  }
  if (!IS_NEW_REGION && _consent === "accepted") try {
    const isGP = window.location.hostname.includes("guadeloupe");
    const mid = isGP ? "G-Q31VV3LLM9" : "G-V8JGMDZZ2Y";
    const sec = isGP ? "eWAv3vACT6uVzcrAi7JgYQ" : "eFHMRr4tQ-2B-JYidixOSA";
    const cid = document.cookie.match(/_ga=GA\d+\.\d+\.(\d+\.\d+)/)?.[1] || "a." + Date.now();
    navigator.sendBeacon && navigator.sendBeacon(
      `https://www.google-analytics.com/mp/collect?measurement_id=${mid}&api_secret=${sec}`,
      JSON.stringify({ client_id: cid, events: [{ name: event, params: p }] })
    );
  } catch {
  }
  const critical = event.startsWith("sg_checkout") || event.startsWith("sg_premium") || event === "sg_conversion" || event === "sg_email_submit" || event === "sg_forecast_lock_click" || event === "sg_session_start" || event === "sg_friction" || event === "sg_push_accept" || event === "sg_push_primer_accept" || event === "sg_push_primer_dismiss" || event === "sg_referral_share";
  if (critical) {
    const entry = { e: event, p, t: Date.now(), island: IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ" };
    try {
      const q = JSON.parse(localStorage.getItem(TRACK_QUEUE_KEY) || "[]");
      q.push(entry);
      if (q.length > 200) q.splice(0, q.length - 200);
      localStorage.setItem(TRACK_QUEUE_KEY, JSON.stringify(q));
    } catch {
    }
    try {
      navigator.sendBeacon && navigator.sendBeacon(
        APPS_SCRIPT_URL,
        JSON.stringify({ type: "analytics_event", ...entry })
      );
    } catch {
    }
  }
  if (_consent === "accepted") try {
    sgCollectEvent(event, p);
  } catch (e) {
  }
}
try {
  if (typeof window !== "undefined") window.track = track;
} catch {
}
import { beginCheckout as beginCheckout2, viewPromotion as viewPromotion2, getPlanMeta as getPlanMeta2 } from "./ga4-ecommerce.js";
function flushTrackQueue() {
  try {
    if (!window.gtag) return;
    const q = JSON.parse(localStorage.getItem(TRACK_QUEUE_KEY) || "[]");
    if (!q.length) return;
    const batch = q.splice(0, 50);
    localStorage.setItem(TRACK_QUEUE_KEY, JSON.stringify(q));
    for (const { e, p } of batch) {
      try {
        window.gtag("event", "recovery_" + e, p);
      } catch {
      }
    }
  } catch {
  }
}
try {
  if (typeof window !== "undefined") setTimeout(flushTrackQueue, 5e3);
} catch {
}
function submitLead(email, source) {
  try {
    const island2 = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ";
    const body = JSON.stringify({ email, island: island2, source, date: (/* @__PURE__ */ new Date()).toISOString() });
    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(APPS_SCRIPT_URL, body)) return;
      } catch {
      }
    }
    fetch(APPS_SCRIPT_URL, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body }).catch(() => {
    });
  } catch {
  }
  try {
    logAnalyticsEvent("sg_email_submit", { source, island }, island);
  } catch (_) {
  }
}
const _eng = { screen: null, t0: 0, acts: 0, last: 0, idleMax: 0, maxScroll: 0, inited: false, dirty: false };
function engFlush(reason) {
  if (!_eng.screen || !_eng.t0 || !_eng.dirty) return;
  const now = Date.now(), dwell = now - _eng.t0;
  if (dwell < 400) return;
  const idleMax = Math.max(_eng.idleMax, _eng.last ? now - _eng.last : 0);
  const bored = _eng.acts === 0 && dwell > 6e3 || idleMax > 2e4;
  _eng.dirty = false;
  try {
    track("sg_engagement", { screen: _eng.screen, dwell_ms: Math.round(dwell), actions: _eng.acts, idle_max_ms: Math.round(idleMax), max_scroll: _eng.maxScroll, bored: bored ? 1 : 0, reason });
  } catch (e) {
  }
}
function engScreen(screen) {
  if (!screen || _eng.screen === screen) return;
  engFlush("switch");
  const now = Date.now();
  _eng.screen = screen;
  _eng.t0 = now;
  _eng.acts = 0;
  _eng.last = now;
  _eng.idleMax = 0;
  _eng.maxScroll = 0;
  _eng.dirty = true;
}
function engInit() {
  if (_eng.inited || typeof window === "undefined") return;
  _eng.inited = true;
  const act = () => {
    const n = Date.now();
    if (_eng.last) _eng.idleMax = Math.max(_eng.idleMax, n - _eng.last);
    _eng.last = n;
    _eng.acts++;
    _eng.dirty = true;
  };
  try {
    window.addEventListener("pointerdown", act, { passive: true });
    window.addEventListener("keydown", act, { passive: true });
    window.addEventListener("wheel", act, { passive: true });
    let _scRaf = 0;
    window.addEventListener("scroll", () => {
      if (_scRaf) return;
      _scRaf = requestAnimationFrame(() => {
        _scRaf = 0;
        const h = document.documentElement, sc = h.scrollHeight - h.clientHeight;
        if (sc > 0) {
          const p = Math.round(h.scrollTop / sc * 100);
          if (p > _eng.maxScroll) _eng.maxScroll = p;
        }
      });
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") engFlush("hide");
    });
    window.addEventListener("pagehide", () => engFlush("pagehide"));
    let _rc = [];
    const _ric = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    let _hovEl = null, _hovT = 0, _hovClicked = false;
    window.addEventListener("click", (e) => {
      _hovClicked = true;
      const snap = { target: e.target, clientX: e.clientX, clientY: e.clientY };
      _ric(() => {
        try {
          sgCollectClick(snap);
        } catch (_) {
        }
      });
      const n = Date.now();
      _rc = _rc.filter((c) => n - c.t < 900);
      _rc.push({ t: n, x: e.clientX, y: e.clientY });
      if (_rc.length >= 3) {
        const a = _rc[0], b = _rc[_rc.length - 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 44) {
          _rc = [];
          try {
            track("sg_friction", { type: "rage", screen: _eng.screen || "?", el: _sgElDesc(snap.target) });
          } catch (_) {
          }
        }
      }
    }, { passive: true });
    if (!/[?&]capx=0/.test(location.search)) {
      window.addEventListener("contextmenu", (e) => {
        const snap = { target: e.target };
        _ric(() => {
          try {
            sgCollectContext(snap);
          } catch (_) {
          }
        });
      }, { passive: true });
      const HOVER_MIN = 600;
      window.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const t = e.target && e.target.closest && e.target.closest('button,a,[role="button"],input,select,label,[data-beach],[data-vmui]');
        if (!t || t === _hovEl) return;
        _hovEl = t;
        _hovT = Date.now();
        _hovClicked = false;
      }, { passive: true });
      window.addEventListener("pointerout", (e) => {
        if (e.pointerType !== "mouse" || !_hovEl) return;
        try {
          if (e.relatedTarget && _hovEl.contains && _hovEl.contains(e.relatedTarget)) return;
        } catch (_) {
        }
        const el = _hovEl, dwell = Date.now() - _hovT, clicked = _hovClicked;
        _hovEl = null;
        _hovClicked = false;
        if (dwell >= HOVER_MIN && !clicked) _ric(() => {
          try {
            sgCollectHover(el, dwell);
          } catch (_) {
          }
        });
      }, { passive: true });
    }
  } catch (e) {
  }
}
const SG_COLLECT_URL = "/collect.php";
const _sgc = { sid: null, buf: null, dirty: false, started: false, lastSend: 0 };
function _sgcRand(n) {
  try {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + n);
  } catch (_) {
    return "x" + n;
  }
}
function _sgcSid() {
  try {
    let s2 = sessionStorage.getItem("sg_sid");
    if (!s2) {
      s2 = _sgcRand(6);
      sessionStorage.setItem("sg_sid", s2);
    }
    return s2;
  } catch (_) {
    return "x";
  }
}
function _sgcCid() {
  try {
    let c = localStorage.getItem("sg_cid");
    if (!c) {
      c = _sgcRand(8);
      localStorage.setItem("sg_cid", c);
    }
    return c;
  } catch (_) {
    return "x";
  }
}
function sgMyReferralCode() {
  try {
    let c = localStorage.getItem("sg_referral_code");
    if (!c) {
      c = "REF-" + hashSeed(_sgcCid() + ":ref").toString(36).toUpperCase().slice(0, 6);
      localStorage.setItem("sg_referral_code", c);
    }
    return c;
  } catch (_) {
    return "";
  }
}
async function sgVerifySub(email) {
  const one = (url) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_subscription", email }) }).then((r) => r.json()).catch(() => ({ active: false }));
  const [m, s2] = await Promise.all([one("/api/mollie.php"), one("/api/create-checkout.php")]);
  if (m && m.active) return m;
  if (s2 && s2.active) return s2;
  return m || s2 || { active: false };
}
function sgReferredBy() {
  try {
    const raw = localStorage.getItem("sg_referred_by");
    if (!raw) return "";
    let code = "", ts = 0;
    try {
      const o = JSON.parse(raw);
      code = o.code || "";
      ts = o.ts || 0;
    } catch (_) {
      code = raw;
    }
    if (!/^REF-[A-Z0-9]{6}$/.test(code)) return "";
    if (ts && Date.now() - ts > 30 * 864e5) return "";
    if (code === sgMyReferralCode()) return "";
    return code;
  } catch (_) {
    return "";
  }
}
function sgAlertsOff() {
  try {
    return localStorage.getItem("sg_alerts_off") === "1";
  } catch (_) {
    return false;
  }
}
function sgApplyPushOptin(on) {
  try {
    window.loadOneSignal && window.loadOneSignal();
  } catch (_) {
  }
  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function(O) {
      try {
        const ps = O && O.User && O.User.PushSubscription;
        if (!ps) return;
        if (on) {
          ps.optIn && ps.optIn();
        } else {
          ps.optOut && ps.optOut();
        }
      } catch (_) {
      }
    });
  } catch (_) {
  }
}
function sgSetAlerts(on) {
  try {
    localStorage.setItem("sg_alerts_off", on ? "0" : "1");
  } catch (_) {
  }
  ;
  sgApplyPushOptin(on);
}
const GATING = (() => {
  try {
    return !/[?&]gating=0/.test(window.location.search);
  } catch (_) {
    return true;
  }
})();
async function fetchFullForecast() {
  try {
    if (!GATING) return null;
    let k = "";
    try {
      k = new URLSearchParams(window.location.search).get("k") || "";
    } catch (_) {
    }
    try {
      if (k) localStorage.setItem("sg_fc_token", k);
      else k = localStorage.getItem("sg_fc_token") || "";
    } catch (_) {
    }
    if (k) {
      const r = await fetch(`/api/copernicus/forecast.php?k=${encodeURIComponent(k)}`);
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok && j.weekly) return j.weekly;
      }
    }
    let email = "";
    try {
      email = localStorage.getItem("sg_email") || localStorage.getItem("sg_premium_email") || "";
    } catch (_) {
    }
    if (email) {
      const r = await fetch("/api/copernicus/forecast.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok && j.weekly) return j.weekly;
      }
    }
  } catch (_) {
  }
  return null;
}
function _sgcEnsureBuf() {
  if (_sgc.buf) return;
  const region = typeof IS_NEW_REGION !== "undefined" && IS_NEW_REGION && typeof REGION !== "undefined" ? REGION.id : location.hostname.includes("guadeloupe") ? "gp" : "mq";
  let lang = "fr";
  try {
    if (typeof getLang === "function") lang = getLang();
  } catch (_) {
  }
  let bot = 0, demo = 0;
  try {
    if (navigator.webdriver === true || /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|lighthouse|facebookexternalhit|bingpreview|whatsapp|telegrambot|twitterbot|slackbot|discordbot|applebot|semrush|ahrefs|petalbot|yandexbot/i.test(navigator.userAgent || "")) bot = 1;
  } catch (_) {
  }
  try {
    if (/[?&]demo=1/.test(location.search || "")) demo = 1;
  } catch (_) {
  }
  _sgc.buf = { v: 1, sid: _sgcSid(), cid: _sgcCid(), region, lang, ts: Date.now(), ref: (document.referrer || "").slice(0, 180), ab: g("sg_ab", {}), ev: [], scr: {}, clk: {}, de: {}, rc: {}, hv: {}, mon: {}, bot, demo };
}
function _sgElDesc(t) {
  try {
    if (!t || t.nodeType !== 1) return "?";
    let s2 = (t.tagName || "?").toLowerCase();
    if (t.id && typeof t.id === "string") s2 += "#" + t.id.slice(0, 24);
    else if (typeof t.className === "string" && t.className.trim()) {
      const c = t.className.trim().split(/\s+/)[0];
      if (c) s2 += "." + c.slice(0, 24);
    }
    try {
      const role = t.getAttribute && t.getAttribute("role");
      if (role) s2 += "[role=" + String(role).slice(0, 16) + "]";
    } catch (_) {
    }
    return s2.slice(0, 48);
  } catch (_) {
    return "?";
  }
}
function sgCollectClick(e) {
  try {
    _sgcEnsureBuf();
    if (!_sgc.buf || !_sgc.buf.clk) return;
    const scr = typeof _eng !== "undefined" && _eng && _eng.screen || "?";
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const gx = Math.max(0, Math.min(15, Math.floor(e.clientX / W * 16))), gy = Math.max(0, Math.min(23, Math.floor(e.clientY / H * 24)));
    const k = gx + "_" + gy;
    let dead = true;
    const tgt = e.target;
    try {
      const t = tgt;
      if (t && t.closest && t.closest('button,a,input,select,textarea,label,[role="button"],.leaflet-marker-icon,[data-beach],[data-sg-live]')) dead = false;
      else if (t && t.nodeType === 1) {
        const cs = getComputedStyle(t);
        if (cs && cs.cursor === "pointer") dead = false;
      }
    } catch (_) {
      dead = false;
    }
    const o = _sgc.buf.clk[scr] || (_sgc.buf.clk[scr] = { b: {}, d: {}, n: 0 });
    if (o.b[k] == null && Object.keys(o.b).length >= 240) return;
    o.b[k] = (o.b[k] || 0) + 1;
    if (dead) o.d[k] = (o.d[k] || 0) + 1;
    o.n++;
    _sgc.dirty = true;
    if (dead && tgt) {
      const de = _sgc.buf.de || (_sgc.buf.de = {});
      const m = de[scr] || (de[scr] = {});
      const dk = _sgElDesc(tgt);
      if (m[dk] != null || Object.keys(m).length < 24) m[dk] = (m[dk] || 0) + 1;
    }
  } catch (_) {
  }
}
function sgCollectContext(e) {
  try {
    _sgcEnsureBuf();
    if (!_sgc.buf) return;
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    let dead = true;
    try {
      if (t.closest && t.closest('button,a,input,select,textarea,label,[role="button"],.leaflet-marker-icon,[data-beach],[data-sg-live]')) dead = false;
      else {
        const cs = getComputedStyle(t);
        if (cs && cs.cursor === "pointer") dead = false;
      }
    } catch (_) {
      dead = false;
    }
    if (!dead) return;
    const scr = typeof _eng !== "undefined" && _eng && _eng.screen || "?";
    const rc = _sgc.buf.rc || (_sgc.buf.rc = {});
    const m = rc[scr] || (rc[scr] = {});
    const dk = _sgElDesc(t);
    if (m[dk] != null || Object.keys(m).length < 24) m[dk] = (m[dk] || 0) + 1;
    _sgc.dirty = true;
  } catch (_) {
  }
}
function sgCollectHover(el, dwell) {
  try {
    _sgcEnsureBuf();
    if (!_sgc.buf) return;
    const scr = typeof _eng !== "undefined" && _eng && _eng.screen || "?";
    const hv = _sgc.buf.hv || (_sgc.buf.hv = {});
    const m = hv[scr] || (hv[scr] = {});
    const dk = _sgElDesc(el);
    if (m[dk] != null || Object.keys(m).length < 24) {
      const o = m[dk] || (m[dk] = { n: 0, ms: 0 });
      o.n++;
      o.ms += Math.round(dwell || 0);
    }
    _sgc.dirty = true;
  } catch (_) {
  }
}
function sgCollectEvent(event, params) {
  try {
    _sgcEnsureBuf();
    if (event === "sg_engagement") {
      const s2 = params && params.screen || "?";
      const o = _sgc.buf.scr[s2] || (_sgc.buf.scr[s2] = { dwell: 0, acts: 0, bored: 0, maxScroll: 0, n: 0 });
      o.dwell += params && params.dwell_ms || 0;
      o.acts += params && params.actions || 0;
      o.bored += params && params.bored ? 1 : 0;
      o.maxScroll = Math.max(o.maxScroll, params && params.max_scroll || 0);
      o.n++;
    } else if (_sgc.buf.ev.length < 120) {
      _sgc.buf.ev.push({ e: event, t: Date.now() - _sgc.buf.ts });
    }
    if (event === "sg_pass_cta" || event === "sg_conversion") {
      const scr = typeof _eng !== "undefined" && _eng && _eng.screen || "?";
      const mon = _sgc.buf.mon || (_sgc.buf.mon = {});
      const o = mon[scr] || (mon[scr] = { ic: 0, iv: 0, cc: 0 });
      if (event === "sg_pass_cta") {
        o.ic++;
        const c = parseInt(params && params.cents) || 0;
        if (c > 0 && c < 1e6) o.iv += c;
      } else o.cc++;
    }
    _sgc.dirty = true;
  } catch (_) {
  }
}
function _sgcStash(body) {
  try {
    const q = JSON.parse(localStorage.getItem("sg_collect_q") || "[]");
    q.push(body);
    if (q.length > 30) q.splice(0, q.length - 30);
    localStorage.setItem("sg_collect_q", JSON.stringify(q));
  } catch (_) {
  }
}
const SG_REPORT_URL = APPS_SCRIPT_URL;
const PHOTO_UPLOAD_ENABLED = false;
const PHOTO_REWARD_H = 24, PHOTO_REWARD_BANK_H = 72;
function _sgLocalDay() {
  const d = /* @__PURE__ */ new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function _sgRewardEndLbl(end, lang) {
  try {
    return new Date(end).toLocaleString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}
function sgPhotoRewardEligible() {
  try {
    if (/[?&]photoreward=0/.test(window.location.search)) return false;
    if (localStorage.getItem("sg_premium") === "1") return false;
    const now = Date.now();
    if (localStorage.getItem("sg_photo_reward_day") === _sgLocalDay()) return false;
    const log = JSON.parse(localStorage.getItem("sg_photo_reward_log") || "[]").filter((t) => now - t < 30 * 864e5);
    if (log.length >= 3) return false;
    if (parseInt(localStorage.getItem("sg_premium_pass_end") || "0") > now + PHOTO_REWARD_BANK_H * 36e5) return false;
    return true;
  } catch (_) {
    return false;
  }
}
function sgGrantPhotoReward() {
  try {
    if (!sgPhotoRewardEligible()) return 0;
    const now = Date.now();
    const cur = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
    const end = Math.min(Math.max(cur, now) + PHOTO_REWARD_H * 36e5, now + PHOTO_REWARD_BANK_H * 36e5);
    if (end <= cur) return 0;
    localStorage.setItem("sg_premium_pass_end", String(end));
    localStorage.setItem("sg_photo_reward_day", _sgLocalDay());
    const log = JSON.parse(localStorage.getItem("sg_photo_reward_log") || "[]").filter((t) => now - t < 30 * 864e5);
    log.push(now);
    localStorage.setItem("sg_photo_reward_log", JSON.stringify(log));
    try {
      window.dispatchEvent(new Event("sg:premium_refresh"));
    } catch (_) {
    }
    return end;
  } catch (_) {
    return 0;
  }
}
const RAMASSAGE_ENABLED = supabaseConfigured() && !(typeof location !== "undefined" && /[?&]ramassage=0/.test(location.search || ""));
const DESCENTE_ENABLED = RAMASSAGE_ENABLED && !(typeof location !== "undefined" && /[?&]descente=0/.test(location.search || ""));
function terrainDisplayStatus(satStatus, events) {
  if (!DESCENTE_ENABLED || !satStatus || !(satStatus in { clean: 0, moderate: 0, avoid: 0 })) return null;
  const R = { clean: 0, moderate: 1, avoid: 2 }, INV = ["clean", "moderate", "avoid"];
  const fresh2 = (ev) => (events || []).some((e) => {
    try {
      return e.event === ev && Date.now() - new Date(e.ts).getTime() < 48 * 3600 * 1e3;
    } catch (_) {
      return false;
    }
  });
  let r = R[satStatus];
  if (fresh2("beaching")) r = Math.min(2, r + 1);
  else if (fresh2("cleanup")) r = Math.max(0, r - 1);
  return INV[r] !== satStatus ? INV[r] : null;
}
let _sgCapturingPhoto = false;
function _sgReportStash(body) {
  try {
    const q = JSON.parse(localStorage.getItem("sg_report_q") || "[]");
    q.push(body);
    if (q.length > 30) q.splice(0, q.length - 30);
    localStorage.setItem("sg_report_q", JSON.stringify(q));
  } catch (_) {
  }
}
function _sgReportFlush() {
  try {
    const q = JSON.parse(localStorage.getItem("sg_report_q") || "[]");
    if (!q.length) return;
    localStorage.removeItem("sg_report_q");
    q.forEach((body) => {
      try {
        fetch(SG_REPORT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body }).catch(() => _sgReportStash(body));
      } catch (_) {
        _sgReportStash(body);
      }
    });
  } catch (_) {
  }
}
function sgCollectFlush(reason) {
  try {
    if (!_sgc.buf || !_sgc.dirty) return;
    _sgc.dirty = false;
    _sgc.lastSend = Date.now();
    const body = JSON.stringify({ ..._sgc.buf, dur: Date.now() - _sgc.buf.ts, reason });
    let ok = false;
    try {
      ok = navigator.sendBeacon && navigator.sendBeacon(SG_COLLECT_URL, new Blob([body], { type: "application/json" }));
    } catch (_) {
    }
    if (!ok) {
      try {
        fetch(SG_COLLECT_URL, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).then((r) => {
          if (!r.ok) _sgcStash(body);
        }).catch(() => _sgcStash(body));
      } catch (_) {
        _sgcStash(body);
      }
    }
  } catch (_) {
  }
}
function sgCollectInit() {
  if (_sgc.started || typeof window === "undefined") return;
  _sgc.started = true;
  try {
    const q = JSON.parse(localStorage.getItem("sg_collect_q") || "[]");
    if (q.length) {
      localStorage.removeItem("sg_collect_q");
      q.forEach((b) => {
        try {
          navigator.sendBeacon && navigator.sendBeacon(SG_COLLECT_URL, new Blob([b], { type: "application/json" }));
        } catch (_) {
        }
      });
    }
  } catch (_) {
  }
  try {
    _sgReportFlush();
  } catch (_) {
  }
  try {
    window.addEventListener("online", _sgReportFlush);
  } catch (_) {
  }
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") sgCollectFlush("hide");
    });
    window.addEventListener("pagehide", () => sgCollectFlush("pagehide"));
    setInterval(() => {
      if (_sgc.dirty && Date.now() - _sgc.lastSend > 25e3) sgCollectFlush("interval");
    }, 25e3);
  } catch (_) {
  }
}
function sgUnlockState() {
  try {
    return JSON.parse(localStorage.getItem("sg_unlocks") || '{"keys":[],"v":1}');
  } catch (_) {
    return { keys: [], v: 1 };
  }
}
function sgHasUnlock(k) {
  try {
    return sgUnlockState().keys.indexOf(k) >= 0;
  } catch (_) {
    return false;
  }
}
function sgUnlock(k, meta) {
  try {
    const s2 = sgUnlockState();
    if (s2.keys.indexOf(k) < 0) {
      s2.keys.push(k);
      localStorage.setItem("sg_unlocks", JSON.stringify(s2));
      try {
        track("sg_unlock", { key: k, total: s2.keys.length, ...meta || {} });
      } catch (e) {
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}
function sgUnlockCount() {
  try {
    return sgUnlockState().keys.length;
  } catch (_) {
    return 0;
  }
}
function sgIntent(name, params) {
  try {
    track("sg_intent", { intent: name, ...params || {} });
  } catch (_) {
  }
}
try {
  if (typeof window !== "undefined") {
    window.sgHasUnlock = sgHasUnlock;
    window.sgUnlockCount = sgUnlockCount;
  }
} catch (_) {
}
function AbDebug() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("ab_debug") === "1") setShow(true);
    } catch {
    }
  }, []);
  if (!show) return null;
  const ab = g("sg_ab", {});
  const tests = { em1: ["control", "curiosity"] };
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    top: 8,
    right: 8,
    zIndex: 99999,
    background: "rgba(0,0,0,.9)",
    color: "#0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 11,
    fontFamily: "monospace",
    maxWidth: 260
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: 6 } }, "A/B Debug"), Object.entries(tests).map(([id, vars]) => {
    const idx = ab[id];
    return /* @__PURE__ */ React.createElement("div", { key: id }, id, ": ", /* @__PURE__ */ React.createElement("b", null, idx != null ? vars[idx] : "unassigned"), " (", idx, ")");
  }), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        localStorage.removeItem("sg_ab");
        window.location.reload();
      },
      style: {
        marginTop: 8,
        background: "#333",
        color: "#0f0",
        border: "1px solid #0f0",
        borderRadius: 4,
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: 10
      }
    },
    "Reset variants"
  ));
}
function statusFromAfai(afai) {
  return afai < 0.15 ? "clean" : afai < 0.4 ? "moderate" : "avoid";
}
function generateForecast(afai, lang = "fr") {
  const LL = T[lang] || T.fr, now = /* @__PURE__ */ new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dayName = i === 0 ? LL.today : i === 1 ? LL.tomorrow : LL.days[d.getDay()];
    const v = Math.sin(i * 0.8 + afai * 10) * 0.15;
    const a = Math.max(0, Math.min(1, afai + v));
    return { day: dayName, date: d.toISOString().slice(0, 10), afai: Math.round(a * 100) / 100, status: statusFromAfai(a) };
  });
}
function satImg(lat, lng, size = 280) {
  const p = 6e-3;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lng - p},${lat - p},${lng + p},${lat + p}&bboxSR=4326&size=${size},${size}&imageSR=4326&format=png&f=image`;
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function interpolateIDW(beach, sentinels, k = 3, power = 2) {
  if (!sentinels || sentinels.length === 0) return null;
  const withDist = sentinels.map((s2) => ({ ...s2, dist: haversine(beach.lat, beach.lng, s2.lat, s2.lng) })).sort((a, b) => a.dist - b.dist).slice(0, k);
  if (withDist[0].dist < 0.5) return withDist[0].afai;
  let sumW = 0, sumV = 0;
  for (const s2 of withDist) {
    const w = 1 / Math.pow(s2.dist, power);
    sumW += w;
    sumV += w * s2.afai;
  }
  return Math.round(sumV / sumW * 100) / 100;
}
function classifyBeachCoast(lat, lng, island2) {
  if (island2 === "mq") {
    if (lat > 14.54 && lat < 14.68 && lng < -61.02 && lng > -61.16) return "sheltered";
    if (lat > 14.52 && lat < 14.55 && lng < -61.08) return "sheltered";
    if (lat > 14.78 && lng < -61.1) return "sheltered";
    return "atlantic";
  }
  if (island2 === "gp") {
    if (lng < -61.7) return "sheltered";
    if (lng < -61.55 && lat > 16.25) return "sheltered";
    return "atlantic";
  }
  return "atlantic";
}
function isImmuneBay(lat, lng, island2) {
  if (island2 === "mq") {
    if (lat > 14.54 && lat < 14.68 && lng < -61.02 && lng > -61.16) return true;
    if (lat > 14.52 && lat < 14.55 && lng < -61.08) return true;
    return false;
  }
  return false;
}
function padForecast(fc, len = 7) {
  if (!Array.isArray(fc) || !fc.length || fc.length >= len) return fc;
  try {
    if (/[?&]persist=0/.test(window.location.search)) return fc;
  } catch (_) {
  }
  const out = fc.slice();
  const lastReal = out.length - 1;
  const last = out[lastReal];
  const _DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let d = out.length; d < len; d++) {
    const conf = Math.max(8, Math.round((last.confidence != null ? last.confidence : 35) * Math.pow(0.78, d - lastReal)));
    let date = last.date, day = last.day;
    try {
      if (last.date) {
        const dd = /* @__PURE__ */ new Date(last.date + "T00:00:00Z");
        dd.setUTCDate(dd.getUTCDate() + (d - lastReal));
        date = dd.toISOString().slice(0, 10);
        day = _DOW[dd.getUTCDay()];
      }
    } catch (_) {
    }
    out.push({ day, date, afai: last.afai, status: last.status, confidence: conf, type: "horizon", regime: last.regime, sources: ["persistence"], _persisted: true });
  }
  return out;
}
function interpolateForecast(beach, sentinels, weeklyData, k = 3, power = 2) {
  if (!weeklyData || !sentinels || sentinels.length === 0) return null;
  const withDist = sentinels.filter((s2) => weeklyData[s2.sargId]).map((s2) => ({ ...s2, dist: haversine(beach.lat, beach.lng, s2.lat, s2.lng) })).sort((a, b) => a.dist - b.dist).slice(0, k);
  if (withDist.length === 0) return null;
  const weights = withDist.map((s2) => ({ w: 1 / Math.pow(Math.max(s2.dist, 0.1), power), id: s2.sargId }));
  const sumW = weights.reduce((s2, x) => s2 + x.w, 0);
  const ref = weeklyData[weights[0].id].forecast;
  const forecast = ref.map((dayRef, i) => {
    let blended = 0;
    let blendedConf = 0;
    for (const { w, id } of weights) {
      const f = weeklyData[id].forecast[i];
      blended += w / sumW * (f ? f.afai : dayRef.afai);
      blendedConf += w / sumW * (f?.confidence || dayRef.confidence || 40);
    }
    const afai = Math.round(Math.max(0, Math.min(1, blended)) * 100) / 100;
    return {
      day: dayRef.day,
      date: dayRef.date,
      afai,
      status: statusFromAfai(afai),
      confidence: Math.round(blendedConf),
      type: dayRef.type,
      sources: dayRef.sources
    };
  });
  const beachCoast = beach.coast || classifyBeachCoast(beach.lat, beach.lng, beach.island);
  const isSheltered = beachCoast === "sheltered";
  const anyArrival = !isSheltered && withDist.some((s2) => weeklyData[s2.sargId]?.arrivalDetected);
  const maxArrival = isSheltered ? 0 : Math.max(...withDist.map((s2) => weeklyData[s2.sargId]?.arrivalStrength || 0));
  const minHorizon = Math.min(...withDist.map((s2) => weeklyData[s2.sargId]?.reliableHorizon || 3));
  const trend = (forecast[3]?.afai || forecast[forecast.length - 1].afai) - forecast[0].afai;
  return {
    forecast,
    drift: trend > 0.05 ? "up" : trend < -0.05 ? "down" : "stable",
    driftLabel: trend > 0.05 ? "D\xE9rive possible vers la c\xF4te" : trend < -0.05 ? "Dispersion attendue" : "Stable",
    driftValue: Math.round(trend * 100) / 100,
    interpolated: true,
    arrivalDetected: anyArrival,
    arrivalStrength: Math.round(maxArrival * 100) / 100,
    reliableHorizon: minHorizon,
    forecastMethod: anyArrival ? "arrival-banks" : "interpolated",
    // FR-only fallback strings — the sheet maps forecastMethod to localized
    // copy at render time (EN/ES never see these raw strings).
    forecastDisclaimer: anyArrival ? "Banc d\xE9tect\xE9 pr\xE8s des plages voisines \u2014 risque de d\xE9rive." : "Interpolation des plages voisines surveill\xE9es."
  };
}
function beachThumbBg(beach) {
  const c = (ST[beach?.status] || ST._loading).c;
  return `radial-gradient(120% 78% at 50% 14%, ${c}3a 0%, transparent 58%), linear-gradient(168deg, #2e1a5e 0%, #6a2f9e 30%, #C97E3A 56%, #F2B05E 70%, #6a2f9e 84%, #1a1140 100%)`;
}
function AnimatedNumber({ value, duration = 800, suffix = "", prefix = "" }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const n = typeof value === "number" ? value : parseFloat(value) || 0;
    const start = performance.now();
    const from = display;
    const step = (ts) => {
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (n - from) * ease));
      if (p < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return React.createElement("span", { className: "count-shimmer" }, prefix + display + suffix);
}
function SectionReveal({ children, delay = 0, className = "" }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisible(true);
        obs.disconnect();
      }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return React.createElement("div", {
    ref,
    className: visible ? `card-reveal ${className}` : className,
    style: { opacity: visible ? 1 : 0, animationDelay: `${delay}s`, transition: visible ? "none" : "opacity .01s" }
  }, children);
}
function StatusBadge({ status, lang = "fr" }) {
  const st = ST[status] || ST._loading;
  const label = lang === "es" ? st.les : lang === "en" ? st.le : st.l;
  return /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 14px",
    borderRadius: 100,
    background: st.bg,
    color: st.c,
    fontSize: 13,
    fontWeight: 700,
    boxShadow: `0 2px 8px ${st.c}20`,
    animation: "confirmPop .35s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("span", null, st.e), label);
}
function AfaiBadge({ afai }) {
  if (afai == null) return null;
  const pct = Math.round(afai * 100);
  const color = afai < 0.3 ? C.green : afai < 0.65 ? C.amber : C.red;
  return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color, opacity: 0.9 } }, "AFAI ", pct, "%");
}
function FilterChip({ label, icon, active, onClick, count }) {
  return /* @__PURE__ */ React.createElement("button", { onClick, style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px 0 12px",
    height: 40,
    minHeight: 40,
    borderRadius: 100,
    border: active ? "1px solid rgba(232,168,0,.55)" : "1px solid rgba(15,42,58,.08)",
    background: active ? "linear-gradient(158deg,#FFE47A 0%,#FFC72C 40%,#E89400 100%)" : "linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.6))",
    backdropFilter: active ? "none" : "blur(8px)",
    WebkitBackdropFilter: active ? "none" : "blur(8px)",
    color: active ? "#1a1200" : "var(--sg-ink,#0D0D0D)",
    fontSize: 13,
    fontWeight: active ? 700 : 600,
    letterSpacing: ".005em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    boxShadow: active ? "0 4px 14px -4px rgba(232,168,0,.4), inset 0 1px 0 rgba(255,255,255,.5)" : "0 2px 8px rgba(15,42,58,.06), inset 0 1px 0 rgba(255,255,255,.5)",
    transition: "all .25s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, lineHeight: 1, filter: active ? "none" : "grayscale(.35)", opacity: active ? 1 : 0.85 } }, icon), /* @__PURE__ */ React.createElement("span", null, label), count != null && /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 12,
    letterSpacing: ".02em",
    lineHeight: 1,
    color: active ? "rgba(26,18,0,.75)" : "var(--sg-mid,#5A5A5A)",
    background: active ? "rgba(26,18,0,.1)" : "rgba(15,42,58,.05)",
    borderRadius: 100,
    padding: "3px 7px 2px",
    marginLeft: 1
  } }, count));
}
function ForecastCredibility({ weeklyData, lang, sargData }) {
  const LL = T[lang] || T.fr;
  const [showTip, setShowTip] = useState(false);
  const avgConf = weeklyData?.forecast?.[0]?.confidence || 40;
  const level = avgConf >= 50 ? "high" : avgConf >= 30 ? "medium" : "low";
  const levelLabel = level === "high" ? LL.reliabilityHigh : level === "medium" ? LL.reliabilityMedium : LL.reliabilityLow;
  const levelDesc = level === "high" ? LL.reliabilityHighDesc : level === "medium" ? LL.reliabilityMediumDesc : LL.reliabilityLowDesc;
  const levelColor = level === "high" ? C.green : level === "medium" ? C.amber : C.red;
  const barPct = Math.min(100, Math.max(8, avgConf));
  const updatedAt = sargData?.erddapTimestamp || sargData?.updatedAt || null;
  const dateStr = updatedAt ? new Date(updatedAt).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" }) : null;
  const method = weeklyData?.forecastMethod || "persistence";
  const methodLabel = method === "arrival-banks" ? "AFAI + Banks" : method === "banks-persistence" ? "AFAI + Persistence" : method === "memory-decay" ? "Memory decay" : method === "interpolated" ? "IDW" : "Persistence + wind";
  return /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "var(--sg-bgD,#F7F5EF)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--sg-mid,#5A5A5A)", minWidth: 52, letterSpacing: ".03em", textTransform: "uppercase" } }, LL.reliabilityLabel), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 5, borderRadius: 3, background: "var(--sg-border,rgba(0,0,0,.08))", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: `${barPct}%`,
    height: "100%",
    borderRadius: 3,
    background: `linear-gradient(90deg,${levelColor},${levelColor}cc)`,
    transition: "width .8s cubic-bezier(.22,1,.36,1)",
    boxShadow: `0 0 8px ${levelColor}66`
  } })), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowTip(!showTip), style: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    fontSize: 10,
    fontWeight: 800,
    color: levelColor,
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontFamily: "inherit"
  } }, levelLabel, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, opacity: 0.6 } }, "\u24D8"))), showTip && /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 11,
    color: "var(--sg-mid,#5A5A5A)",
    marginBottom: 6,
    lineHeight: 1.5,
    padding: "8px 10px",
    borderRadius: 8,
    background: "var(--sg-card,#fff)",
    animation: "slideUp .25s cubic-bezier(.22,1,.36,1)"
  } }, levelDesc, /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, opacity: 0.7, fontSize: 10 } }, _t(lang, "M\xE9thode", "Method", "M\xE9todo"), " \xB7 ", methodLabel)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, color: "var(--sg-mid,#999)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", null, "\u{1F6F0}\uFE0F"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700 } }, "Copernicus OLCI"), dateStr && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.4 } }, "\xB7"), /* @__PURE__ */ React.createElement("span", null, dateStr)), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.4 } }, "\xB7"), /* @__PURE__ */ React.createElement("span", null, methodLabel)));
}
function CadranVeilleur({ weeklyData, lang, sargData }) {
  const LL = T[lang] || T.fr;
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [armed, setArmed] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, [reduce]);
  const fc = Array.isArray(weeklyData && weeklyData.forecast) ? weeklyData.forecast : [];
  const avgConf = Math.max(0, Math.min(100, Math.round(fc[0] && fc[0].confidence || 40)));
  const level = avgConf >= 50 ? "high" : avgConf >= 30 ? "medium" : "low";
  const levelColor = level === "high" ? C.green : level === "medium" ? C.amber : C.red;
  const levelLabel = level === "high" ? LL.reliabilityHigh : level === "medium" ? LL.reliabilityMedium : LL.reliabilityLow;
  const method = weeklyData && weeklyData.forecastMethod || "persistence";
  const methodLabel = method === "arrival-banks" ? "AFAI + Banks" : method === "banks-persistence" ? "AFAI + Persistence" : method === "memory-decay" ? "Memory decay" : method === "interpolated" ? "IDW" : _t(lang, "Persistance + vent", "Persistence + wind", "Persistencia + viento");
  const updatedAt = sargData && (sargData.erddapTimestamp || sargData.updatedAt) || null;
  const ageH = (() => {
    try {
      if (!updatedAt) return null;
      const h = (Date.now() - new Date(updatedAt).getTime()) / 36e5;
      return isFinite(h) && h >= 0 ? h : null;
    } catch (_) {
      return null;
    }
  })();
  const stale = !!(sargData && sargData.stale);
  const freshOk = !stale && ageH != null && ageH < 12;
  const freshLbl = formatFreshness(updatedAt, lang);
  const satLbl = !stale && fresh ? _t(lang, "Satellite \xB7 il y a " + Math.round(ageH) + " h", "Satellite \xB7 " + Math.round(ageH) + " h ago", "Sat\xE9lite \xB7 hace " + Math.round(ageH) + " h") : !stale ? null : _t(lang, "Donn\xE9es satellite en retard \u2014 de plus de 24 h", " Satellite data delayed \u2014 over 24 h", "Datos satellite con retraso \u2014 m\xE1s de 24 h");
  const CX = 120, CY = 104, R_CONF = 60, R_FRESH = 78;
  const rad = (d) => d * Math.PI / 180;
  const arcTop = (r) => `M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`;
  const aEnd = 180 - 180 * (avgConf / 100);
  const dotX = CX + R_CONF * Math.cos(rad(aEnd)), dotY = CY - R_CONF * Math.sin(rad(aEnd));
  const off = armed ? 100 - avgConf : 100;
  const relLine = __REL && typeof __REL.cleanPct === "number" ? (() => {
    const reg = __REL.regime === "high" ? _t(lang, "saison haute", "high season", "temporada alta") : _t(lang, "saison calme", "calm season", "temporada tranquila");
    const n = (__REL.cleanN || 0).toLocaleString(lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : "en-US");
    return _t(lang, `${__REL.cleanPct}% de \xAB mer propre \xBB v\xE9rifi\xE9es \xB7 ${reg} (${n})`, `${__REL.cleanPct}% of "clean sea" calls verified \xB7 ${reg} (${n})`, `${__REL.cleanPct}% de "mar limpio" verificadas \xB7 ${reg} (${n})`);
  })() : _t(lang, "76 % \xE0 79 % v\xE9rifi\xE9 selon la saison", "76% to 79% verified by season", "76% a 79% verificado seg\xFAn la temporada");
  const days = fc.slice(0, 7);
  return /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    padding: "12px 12px 10px",
    borderRadius: 12,
    background: "var(--sg-bgD,#F7F5EF)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      viewBox: "0 0 240 120",
      width: "100%",
      style: { maxWidth: 240, height: "auto", display: "block" },
      role: "img",
      "aria-label": _t(
        lang,
        `Confiance ${avgConf} %, ${freshOk ? `satellite il y a ${Math.round(ageH)} h` : "satellite en cours de v\xE9rification"}`,
        `Confidence ${avgConf}%, ${freshOk ? `satellite ${Math.round(ageH)}h ago` : "satellite being verified"}`,
        `Confianza ${avgConf}%, ${freshOk ? `sat\xE9lite hace ${Math.round(ageH)} h` : "sat\xE9lite en verificaci\xF3n"}`
      )
    },
    /* @__PURE__ */ React.createElement("path", { d: arcTop(R_FRESH), fill: "none", stroke: freshOk ? "#FFC72C" : "#C9BFA4", strokeWidth: "5", strokeLinecap: "round", opacity: freshOk ? 1 : 0.5 }),
    /* @__PURE__ */ React.createElement("path", { d: arcTop(R_CONF), fill: "none", stroke: "var(--sg-border,rgba(0,0,0,.1))", strokeWidth: "9", strokeLinecap: "round" }),
    /* @__PURE__ */ React.createElement(
      "path",
      {
        d: arcTop(R_CONF),
        fill: "none",
        stroke: levelColor,
        strokeWidth: "9",
        strokeLinecap: "round",
        pathLength: "100",
        strokeDasharray: "100",
        strokeDashoffset: off,
        style: { transition: reduce ? "none" : "stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)" }
      }
    ),
    armed && /* @__PURE__ */ React.createElement("circle", { cx: dotX, cy: dotY, r: "5", fill: levelColor, stroke: "#fff", strokeWidth: "1.5" }),
    /* @__PURE__ */ React.createElement("text", { x: CX, y: "78", textAnchor: "middle", style: { fontFamily: "'Anton',sans-serif", fontSize: 30, fill: levelColor } }, avgConf, "%"),
    /* @__PURE__ */ React.createElement("text", { x: CX, y: "96", textAnchor: "middle", style: { fontSize: 10.5, fontWeight: 800, fill: "var(--sg-mid,#5A5A5A)", letterSpacing: ".04em", textTransform: "uppercase" } }, levelLabel),
    /* @__PURE__ */ React.createElement("text", { x: CX - R_FRESH + 2, y: CY + 13, textAnchor: "middle", style: { fontSize: 9, fill: "var(--sg-mid,#999)" }, "aria-hidden": "true" }, "\u{1F6F0}\uFE0F")
  )), days.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5, alignItems: "flex-end", marginTop: 2 } }, days.map((d, i) => {
    const noData = !d || d.status == null || d.type === "_loading";
    const st = ST[d && d.status] || ST._loading;
    const type = d && d.type || (i === 0 ? "observation" : i <= 3 ? "tendance" : "horizon");
    const degraded = type === "horizon" || i >= 4;
    return /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: "100%",
      height: 16,
      borderRadius: 5,
      background: noData ? "transparent" : degraded ? st.c + "44" : st.c,
      border: noData ? "1px dashed var(--sg-border,rgba(0,0,0,.2))" : degraded ? `1.5px dashed ${st.c}` : "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, noData && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "var(--sg-mid,#999)", fontWeight: 700 } }, "?")), /* @__PURE__ */ React.createElement("span", { className: "anton", style: { fontSize: 9, color: "var(--sg-mid,#999)", textTransform: "uppercase" } }, d ? fcDay(d, lang) : "\u2014"));
  })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: "var(--sg-mid,#999)", textAlign: "center", marginTop: 5, lineHeight: 1.35 } }, _t(lang, "Au-del\xE0 de 3 jours : tendance, pas pr\xE9vision.", "Beyond 3 days: trend, not forecast.", "M\xE1s all\xE1 de 3 d\xEDas: tendencia, no previsi\xF3n.")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, color: "var(--sg-mid,#999)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 6, justifyContent: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: "var(--sg-ink,#13241F)" } }, "\u{1F6F0}\uFE0F Copernicus OLCI"), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.4 } }, "\xB7"), /* @__PURE__ */ React.createElement("span", null, freshLbl ? _t(lang, "mesur\xE9 ", "measured ", "medido ") + freshLbl : _t(lang, "v\xE9rification en cours", "checking freshness", "verificando")), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.4 } }, "\xB7"), /* @__PURE__ */ React.createElement("span", null, methodLabel)), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: reliabilityHref(lang),
      onClick: () => {
        try {
          track("sg_reliability_open", { from: "cadran" });
        } catch (_) {
        }
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginTop: 7,
        padding: "7px 10px",
        borderRadius: 10,
        textDecoration: "none",
        background: "var(--sg-card,#fff)",
        border: "1px solid var(--sg-border,rgba(0,0,0,.06))",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--sg-ink,#13241F)"
      }
    },
    /* @__PURE__ */ React.createElement("span", null, relLine),
    /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { color: levelColor, fontWeight: 800 } }, "\u2192")
  ));
}
function ForecastCred({ weeklyData, lang, sargData }) {
  return /* @__PURE__ */ React.createElement(ForecastCredibility, { weeklyData, lang, sargData });
}
function SciFooter({ lang }) {
  const LL = T[lang] || T.fr;
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: 68,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 699,
    maxWidth: 560,
    width: "calc(100% - 32px)",
    padding: "6px 14px",
    borderRadius: 100,
    background: "var(--sg-glass,rgba(255,255,255,.82))",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--sg-glassBorder,rgba(0,0,0,.04))",
    textAlign: "center",
    fontSize: 9,
    color: "var(--sg-mid,#5A5A5A)",
    letterSpacing: ".02em",
    lineHeight: 1.5
  } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "satellite", size: 14 }), LL.sciFooter));
}
function BottomNav({ view, onChangeView, lang, premiumOpen, glass = false, isPremium = false }) {
  const LL = T[lang] || T.fr;
  const ICON = {
    map: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M3 6.5 9 4l6 2.5 6-2.5V17.5L15 20 9 17.5 3 20z", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round", fill: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M9 4v13.5M15 6.5V20", stroke: "currentColor", strokeWidth: "2" })),
    list: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M8 6h12M8 12h12M8 18h12", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "6", r: "1.5", fill: "currentColor" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "12", r: "1.5", fill: "currentColor" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "18", r: "1.5", fill: "currentColor" })),
    premium: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z", fill: "#E8A800", stroke: "#0d0b14", strokeWidth: "1.6", strokeLinejoin: "round" }))
  };
  let tabs = [
    { id: "map", label: LL.navMap, icon: ICON.map },
    { id: "list", label: LL.navList, icon: ICON.list },
    { id: "premium", label: LL.navPremium, icon: ICON.premium }
  ];
  if (isPremium) tabs = tabs.filter((t) => t.id !== "premium");
  if (!glass) return /* @__PURE__ */ React.createElement("nav", { className: "sg-bottom-nav", style: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1040,
    display: "flex",
    justifyContent: "space-around",
    alignItems: "stretch",
    background: "var(--sg-card,#fff)",
    borderTop: "2.5px solid var(--sg-ink,#0d0b14)",
    boxShadow: "0 -4px 0 -1px var(--sg-ink,#0d0b14)",
    padding: "8px 4px max(12px,env(safe-area-inset-bottom))"
  } }, tabs.map((t) => {
    const active = t.id === "premium" ? premiumOpen : view === t.id;
    const isPrem = t.id === "premium";
    return /* @__PURE__ */ React.createElement("button", { key: t.id, onClick: () => onChangeView(t.id), style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      background: "none",
      border: "none",
      cursor: "pointer",
      color: active ? "var(--sg-ink,#0d0b14)" : "var(--sg-ink,#0d0b14)",
      fontFamily: "'Bricolage Grotesque',sans-serif",
      fontSize: 13,
      fontWeight: active ? 800 : 700,
      letterSpacing: 0,
      transition: "color .2s",
      padding: "4px 16px",
      position: "relative",
      minHeight: 44,
      justifyContent: "center",
      opacity: active ? 1 : 0.75
    } }, active && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: -2,
      width: 24,
      height: 3,
      borderRadius: 2,
      background: C.gold
    } }), /* @__PURE__ */ React.createElement("span", { style: isPrem ? {
      width: 30,
      height: 30,
      borderRadius: 999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: active ? "linear-gradient(135deg,#FFC72C,#E8A800)" : "#FFE47A",
      border: "2px solid var(--sg-ink,#0d0b14)",
      boxShadow: "2px 2px 0 var(--sg-ink,#0d0b14)"
    } : {
      width: 24,
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "transform .34s cubic-bezier(.34,1.56,.64,1)",
      transform: active ? "scale(1.12)" : "scale(1)"
    } }, /* @__PURE__ */ React.createElement("span", { style: isPrem ? { width: 18, height: 18, display: "flex" } : { width: 24, height: 24, display: "flex" } }, t.icon)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: active ? 800 : 700 } }, t.label));
  }));
  return /* @__PURE__ */ React.createElement("nav", { className: "sg-bottom-nav sg-dock-glass", style: {
    position: "fixed",
    zIndex: 1040,
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 5
  } }, tabs.map((t) => {
    const active = t.id === "premium" ? premiumOpen : view === t.id;
    return /* @__PURE__ */ React.createElement("button", { key: t.id, onClick: () => onChangeView(t.id), style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      background: active ? "rgba(255,199,44,.18)" : "none",
      border: "none",
      cursor: "pointer",
      color: active ? "#FFC72C" : "rgba(255,255,255,.85)",
      fontSize: 13,
      fontWeight: active ? 700 : 600,
      fontFamily: "inherit",
      transition: "all .2s",
      padding: "9px 15px",
      borderRadius: 999,
      minHeight: 44,
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 20,
      transition: "transform .34s cubic-bezier(.34,1.56,.64,1)",
      transform: active ? "scale(1.18)" : "scale(1)"
    } }, t.icon), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: active ? 800 : 700 } }, t.label));
  }));
}
function _mareeSmooth(pts) {
  let s2 = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    s2 += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return s2;
}
function MareeVeilleur({ visible, lang, freeThreshold = 1 }) {
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [hover, setHover] = useState(-1);
  const n = visible && visible.length || 0;
  if (!n) return null;
  const X0 = 44, X1 = 356, BASE = 104, AMP = 46;
  const dayX = (i) => X0 + (X1 - X0) * (n <= 1 ? 0.5 : i / (n - 1));
  const dayY = (d) => {
    const a = Number.isFinite(d && d.afai) ? Math.max(0, Math.min(1, d.afai / 0.45)) : 0;
    return BASE - a * AMP;
  };
  const pts = visible.map((d, i) => ({ x: dayX(i), y: dayY(d) }));
  const seg = _mareeSmooth(pts), p0 = pts[0], pn = pts[n - 1];
  const rimD = `M ${p0.x} ${p0.y.toFixed(1)}${seg}`;
  const fillD = `M -20 ${p0.y.toFixed(1)} L ${p0.x} ${p0.y.toFixed(1)}${seg} L 420 ${pn.y.toFixed(1)} L 420 150 L -20 150 Z`;
  let bi = -1, ba = Infinity;
  visible.forEach((d, i) => {
    if (d && d.status === "clean" && Number.isFinite(d.afai) && d.afai < ba) {
      ba = d.afai;
      bi = i;
    }
  });
  const today = visible[0] || { status: "clean" };
  const mood = VEILLEUR_MOOD[moodFromStatus(today.status)] || VEILLEUR_MOOD.scan;
  const bx = bi >= 0 ? pts[bi].x : 0, by = bi >= 0 ? pts[bi].y : 0;
  const tw = 64, tx = Math.max(4, Math.min(400 - tw - 4, bx - tw / 2)), ty = 14;
  const bestLbl = _t(lang, "\u2600 MEILLEUR JOUR", "\u2600 BEST DAY", "\u2600 MEJOR D\xCDA");
  return /* @__PURE__ */ React.createElement("div", { className: "mv-arc", style: { position: "relative" } }, /* @__PURE__ */ React.createElement("style", null, `.mv-arc .mv-rim{stroke-dasharray:100;stroke-dashoffset:${reduce ? 0 : 100};animation:${reduce ? "none" : "mvDraw 1.1s cubic-bezier(.22,1,.36,1) .05s forwards"}}@keyframes mvDraw{to{stroke-dashoffset:0}}@media(prefers-reduced-motion:reduce){.mv-arc .mv-rim{stroke-dashoffset:0;animation:none}}`), /* @__PURE__ */ React.createElement(
    "svg",
    {
      viewBox: "0 0 400 150",
      preserveAspectRatio: "xMidYMid slice",
      role: "img",
      style: { width: "100%", height: "auto", display: "block" },
      "aria-label": _t(
        lang,
        `Pr\xE9vision en houle sur ${n} jours. ${bi >= 0 ? "Meilleur jour " + fcDay(visible[bi], lang) + "." : ""}`,
        `${n}-day forecast drawn as swell. ${bi >= 0 ? "Best day " + fcDay(visible[bi], lang) + "." : ""}`,
        `Pron\xF3stico en oleaje de ${n} d\xEDas. ${bi >= 0 ? "Mejor d\xEDa " + fcDay(visible[bi], lang) + "." : ""}`
      )
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "mvArcSky", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#0B2230" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#155A5A" }), /* @__PURE__ */ React.createElement("stop", { offset: ".84", stopColor: "#C97E3A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#F2B05E" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "mvArcSea", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#1A5852" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#08251F" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "mvArcSun", cx: "50%", cy: "50%", r: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFE9A8" }), /* @__PURE__ */ React.createElement("stop", { offset: ".55", stopColor: "#FFD884" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFD884", stopOpacity: "0" }))),
    /* @__PURE__ */ React.createElement("rect", { width: "400", height: "150", fill: "url(#mvArcSky)" }),
    /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "70", r: "30", fill: "#FFD884", opacity: ".18" }),
    /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "70", r: "15", fill: "#FFD884", opacity: ".32" }),
    bi >= 0 && /* @__PURE__ */ React.createElement("circle", { cx: bx.toFixed(1), cy: by.toFixed(1), r: "26", fill: "url(#mvArcSun)" }),
    /* @__PURE__ */ React.createElement("path", { d: fillD, fill: "url(#mvArcSea)" }),
    /* @__PURE__ */ React.createElement("path", { className: "mv-rim", d: rimD, pathLength: "100", fill: "none", stroke: "#FFD884", strokeWidth: "1.6", opacity: ".9" }),
    visible.map((d, i) => {
      const st = ST[d && d.status] || ST._loading;
      const far = d && d.type === "horizon" || i >= 4;
      const op = far ? 0.55 : 1;
      const x = pts[i].x, y = pts[i].y, r = i === 0 ? 4.6 : hover === i ? 5.2 : 3.4;
      const lbl = i === 0 ? _t(lang, "AUJ", "NOW", "HOY") : fcDay(d, lang);
      return /* @__PURE__ */ React.createElement(
        "g",
        {
          key: i,
          opacity: op,
          onPointerEnter: () => setHover(i),
          onPointerLeave: () => setHover(-1),
          style: { cursor: "default" }
        },
        hover === i && Number.isFinite(d && d.afai) && /* @__PURE__ */ React.createElement(
          "text",
          {
            x: x.toFixed(1),
            y: (y - 9).toFixed(1),
            textAnchor: "middle",
            style: { fontFamily: "ui-monospace,monospace", fontSize: 9, fontWeight: 700, fill: st.c }
          },
          Math.round(d.afai * 100),
          "%"
        ),
        /* @__PURE__ */ React.createElement("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: "10", fill: "transparent" }),
        /* @__PURE__ */ React.createElement("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r, fill: st.c, stroke: "#fff", strokeWidth: i === 0 ? 1.6 : 1.1 }),
        /* @__PURE__ */ React.createElement(
          "text",
          {
            x: x.toFixed(1),
            y: "126",
            textAnchor: "middle",
            style: { fontFamily: "ui-monospace,monospace", fontSize: 8.5, fill: "rgba(255,255,255,.62)" }
          },
          lbl
        )
      );
    }),
    /* @__PURE__ */ React.createElement("g", null, miVeil(86, 44, mood.wing, mood.lens)),
    bi >= 0 && /* @__PURE__ */ React.createElement("g", { "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("line", { x1: (tx + tw / 2).toFixed(1), y1: ty + 16, x2: bx.toFixed(1), y2: (by - 6).toFixed(1), stroke: "#FFD884", strokeWidth: "1", opacity: ".5" }), /* @__PURE__ */ React.createElement("rect", { x: tx, y: ty, width: tw, height: "16", rx: "8", fill: "#0B2230", opacity: ".72" }), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: (tx + tw / 2).toFixed(1),
        y: ty + 11,
        textAnchor: "middle",
        style: { fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 8.5, fontWeight: 800, fill: "#FFD884" }
      },
      bestLbl
    ))
  ));
}
function ForecastChart({ forecast, lang, onPremiumClick, isPremium, weatherDaily, weeklyData }) {
  const pwBeat = true;
  const arcOn = (() => {
    try {
      return /[?&]arc=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const timeline3D = (() => {
    try {
      return /[?&]timeline=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const [beatOpen, setBeatOpen] = useState(false);
  const openLock = (via) => {
    try {
      track("sg_forecast_lock_click", { variant: via, beat: pwBeat ? 1 : 0 });
    } catch (_) {
    }
    ;
    if (pwBeat) setBeatOpen(true);
    else onPremiumClick("forecast");
  };
  useEffect(() => {
    if (forecast && forecast.length) {
      try {
        track("sg_forecast_view", { days: forecast.length, reliable_horizon: weeklyData?.reliableHorizon || 3 });
      } catch (_) {
      }
    }
  }, []);
  if (!forecast || !forecast.length) return null;
  const LL = T[lang] || T.fr;
  const reliableHorizon = weeklyData?.reliableHorizon || 3;
  const targetDays = Math.max(4, reliableHorizon + 1);
  const visible = forecast.slice(0, targetDays);
  if (!isPremium && visible.length < targetDays) {
    const _DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const last = forecast[forecast.length - 1];
    const lastDate = last && last.date ? last.date : null;
    for (let i = visible.length; i < targetDays; i++) {
      let date = null, day = null;
      if (lastDate) {
        const dd = /* @__PURE__ */ new Date(lastDate + "T00:00:00Z");
        dd.setUTCDate(dd.getUTCDate() + (i - (forecast.length - 1)));
        date = dd.toISOString().slice(0, 10);
        day = _DOW[dd.getUTCDay()];
      }
      visible.push({ date, day, afai: null, status: "_loading", confidence: null, type: "horizon", _ph: true });
    }
  }
  const visibleDays = visible.length;
  const max = Math.max(...visible.map((d) => d.afai).filter(Number.isFinite), 0.1);
  const freeThreshold = 1;
  const lockedCount = visibleDays - freeThreshold;
  const inSeason = SARGASSES_SEASON === "high";
  const lockCTA = _t(lang, "D\xE9bloquer", "Unlock forecast", "Desbloquear");
  const lockSub = NO_TRIAL ? _t(lang, "+ brief matin & alertes", "+ morning brief & alerts", "+ brief matutino y alertas") : _t(lang, "+ brief matin & alertes \xB7 7j gratuit", "+ morning brief & alerts \xB7 7 days free", "+ brief matutino y alertas \xB7 7 d\xEDas gratis");
  const firstConf = visible[1]?.confidence || 40;
  const _RK = { clean: 0, moderate: 1, avoid: 2 };
  const _dir = (() => {
    const r0 = _RK[visible[0]?.status] ?? 0, r1 = _RK[visible[1]?.status];
    return r1 == null ? "\u2192" : r1 > r0 ? "\u2198" : r1 < r0 ? "\u2197" : "\u2192";
  })();
  const lockedDays = !isPremium && lockedCount > 0 ? visible.slice(freeThreshold) : [];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, timeline3D ? /* @__PURE__ */ React.createElement(ForecastTimeline3D, { forecast, isPremium, weatherDaily, lang }) : arcOn ? /* @__PURE__ */ React.createElement(MareeVeilleur, { visible, lang, freeThreshold }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", height: 152, padding: "10px 0 4px" } }, visible.map((d, i) => {
    const afai = Number.isFinite(d.afai) ? d.afai : 0;
    const h = Math.max(10, afai / max * 74);
    const st = ST[d.status] || ST._loading;
    const isLocked = !isPremium && i >= freeThreshold;
    const hasDaily = weatherDaily && weatherDaily.tempMax && i < weatherDaily.tempMax.length;
    const dayPrecip = hasDaily ? weatherDaily.precipSum[i] : 0;
    const dayCloud = hasDaily ? weatherDaily.cloudMean[i] : 0;
    const dayWind = hasDaily ? weatherDaily.windMax[i] : 0;
    const dayTemp = hasDaily ? Math.round(weatherDaily.tempMax[i]) : null;
    const wxIcon = hasDaily ? getDayWeatherIcon(dayPrecip, dayCloud, dayWind) : null;
    const fType = d.type || (i === 0 ? "observation" : i <= 3 ? "tendance" : "horizon");
    const fConf = d.confidence || null;
    const typeOpacity = fType === "observation" ? 1 : fType === "tendance" ? 0.9 : 0.6;
    return /* @__PURE__ */ React.createElement("div", { key: i, style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      filter: isLocked ? i === freeThreshold ? "blur(1px)" : "blur(2px)" : "none",
      opacity: isLocked ? i === freeThreshold ? 0.72 : 0.5 : typeOpacity,
      pointerEvents: isLocked ? "none" : "auto",
      position: "relative"
    } }, wxIcon && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, lineHeight: 1 } }, wxIcon), dayTemp != null && /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 9,
      fontWeight: 700,
      color: "var(--sg-mid,#5A5A5A)",
      letterSpacing: ".01em"
    } }, dayTemp, "\xB0"), /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: "'Anton',sans-serif",
      fontSize: 13,
      lineHeight: 1,
      letterSpacing: "-.01em",
      color: st.c
    } }, Math.round(afai * 100), "%"), /* @__PURE__ */ React.createElement("div", { className: "fc-bar", style: {
      width: "100%",
      height: h,
      background: `linear-gradient(180deg, ${st.c}, ${st.c}cc)`,
      borderRadius: "6px 6px 2px 2px",
      boxShadow: `0 -4px 14px -6px ${st.c}88, inset 0 1px 0 rgba(255,255,255,.3)`
    } }), /* @__PURE__ */ React.createElement("span", { className: "anton", style: {
      fontSize: 11,
      lineHeight: 1,
      letterSpacing: ".02em",
      color: isLocked && i === freeThreshold ? "#FFC72C" : "var(--sg-mid,#5A5A5A)",
      textTransform: "uppercase",
      marginTop: 2
    } }, fcDay(d, lang), isLocked && i === freeThreshold && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, marginLeft: 2, opacity: 0.85 } }, _dir)), isLocked && i === freeThreshold && /* @__PURE__ */ React.createElement("span", { style: { display: "block", width: 5, height: 5, borderRadius: "50%", background: "#FFC72C", margin: "3px auto 0", boxShadow: "0 0 6px #FFC72C88" } }), fConf != null && !isLocked && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, color: "var(--sg-mid,#999)", fontWeight: 600 } }, fConf, "%"));
  })), !isPremium && lockedCount > 0 && /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: () => openLock("control"),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLock("control");
        }
      },
      role: "button",
      tabIndex: 0,
      "aria-label": _t(lang, "D\xE9bloquer la pr\xE9vision 7 jours", "Unlock the 7-day forecast", "Desbloquear el pron\xF3stico de 7 d\xEDas"),
      style: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: `${(lockedCount / visibleDays * 100).toFixed(1)}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: "linear-gradient(90deg,transparent,var(--sg-bg,#FDFCF7) 25%)",
        borderRadius: 8
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { className: "gbtn", role: "presentation", style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 20px",
      fontSize: 13,
      fontWeight: 700,
      fontFamily: "'Anton',sans-serif",
      letterSpacing: ".04em",
      textTransform: "uppercase"
    } }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" })), " ", lockCTA), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", fontWeight: 500, textAlign: "center", maxWidth: 160 } }, lockSub))
  )), visible.some((d) => d.confidence != null) && /* @__PURE__ */ React.createElement("div", { style: { margin: "6px 0 2px", padding: "6px 8px", borderRadius: 8, background: "rgba(0,0,0,.03)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--sg-mid,#999)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 } }, _t(lang, "Fiabilit\xE9 par jour", "Confidence by day", "Confianza por d\xEDa")), /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 200 40", style: { width: "100%", height: 40, display: "block" } }, [0, 25, 50, 75, 100].map((y) => /* @__PURE__ */ React.createElement("line", { key: y, x1: "0", y1: 40 - y * 0.4, x2: "200", y2: 40 - y * 0.4, stroke: "rgba(0,0,0,.06)", strokeWidth: "0.5" })), /* @__PURE__ */ React.createElement(
    "polyline",
    {
      points: visible.map((d, i) => {
        const x = i / Math.max(1, visible.length - 1) * 190 + 5;
        const conf = d.confidence || 0;
        const y = 40 - conf * 0.4;
        return `${x},${y}`;
      }).join(" "),
      fill: "none",
      stroke: "#16A34A",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ), visible.map((d, i) => {
    if (d.confidence == null) return null;
    const x = i / Math.max(1, visible.length - 1) * 190 + 5;
    const conf = d.confidence;
    const y = 40 - conf * 0.4;
    return /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("circle", { cx: x, cy: y, r: "3", fill: "#16A34A", stroke: "#fff", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x, y: y - 6, textAnchor: "middle", fontSize: "7", fontWeight: "700", fill: "#16A34A" }, conf, "%"));
  }), visible.map((d, i) => {
    const x = i / Math.max(1, visible.length - 1) * 190 + 5;
    return /* @__PURE__ */ React.createElement("text", { key: i, x, y: 38, textAnchor: "middle", fontSize: "6", fill: "#999" }, fcDay(d, lang));
  }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: "var(--sg-mid,#999)", textAlign: "center", padding: "4px 0 0", lineHeight: 1.3 } }, _t(
    lang,
    `Fiable jusqu'\xE0 4 jours. Fiabilit\xE9 ${Math.round(firstConf)} % demain.`,
    `Reliable up to 4 days. ${Math.round(firstConf)}% confidence tomorrow.`,
    `Confiable hasta 4 d\xEDas. ${Math.round(firstConf)}% de confianza ma\xF1ana.`
  ))), lockedDays.length > 0 && /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: () => openLock("strip"),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLock("strip");
        }
      },
      role: "button",
      tabIndex: 0,
      "aria-label": _t(lang, "Voir les jours suivants \xB7 d\xE9bloquer", "See the next days \xB7 unlock", "Ver los pr\xF3ximos d\xEDas \xB7 desbloquear"),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        padding: "9px 12px",
        background: "rgba(0,0,0,.04)",
        borderRadius: 10,
        cursor: "pointer",
        border: "1px solid rgba(0,0,0,.06)"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--sg-mid,#999)", fontWeight: 600, flexShrink: 0 } }, _t(lang, "Jours suivants :", "Next days:", "Pr\xF3ximos d\xEDas:")),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flex: 1 } }, lockedDays.map((d, i) => {
      const st = ST[d.status] || ST._loading;
      return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 3, filter: "blur(3px)", opacity: 0.65, pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 7, height: 7, borderRadius: 2, background: st.c, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: st.c } }, fcDay(d, lang)));
    })),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--sg-mid,#5A5A5A)", flexShrink: 0 } }, _t(lang, "Voir \u2192", "Unlock \u2192", "Ver \u2192"))
  ), pwBeat && beatOpen && (() => {
    const mood = VEILLEUR_MOOD[moodFromStatus(visible[0]?.status || "clean")] || VEILLEUR_MOOD.serein;
    const allClean = visible.every((d) => d.status === "clean");
    const stCol = (s2) => s2 === "clean" ? "#3fd07f" : s2 === "moderate" ? "#FFD27A" : s2 === "avoid" ? "#F4845F" : "#8a8f93";
    const G = { background: "linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" };
    const promiseEl = allClean ? lang === "es" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "Tu costa est\xE1 limpia. ", /* @__PURE__ */ React.createElement("span", { style: G }, "Ma\xF1ana"), ", el Vig\xEDa ya lo ha visto.") : lang === "en" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "Your coast is clear. ", /* @__PURE__ */ React.createElement("span", { style: G }, "Tomorrow"), ", the Watchman has already seen it.") : /* @__PURE__ */ React.createElement(React.Fragment, null, "Ta c\xF4te est propre. ", /* @__PURE__ */ React.createElement("span", { style: G }, "Demain"), ", le Veilleur l'a d\xE9j\xE0 vu.") : lang === "es" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "El Vig\xEDa vigila tu costa ", /* @__PURE__ */ React.createElement("span", { style: G }, "cada d\xEDa"), ", antes que t\xFA.") : lang === "en" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "The Watcher watches your coast ", /* @__PURE__ */ React.createElement("span", { style: G }, "every day"), ", before you.") : /* @__PURE__ */ React.createElement(React.Fragment, null, "Le Veilleur garde ta c\xF4te ", /* @__PURE__ */ React.createElement("span", { style: G }, "chaque jour"), ", avant toi.");
    const proof = _t(lang, `Fiable \xE0 ${Math.round(firstConf)}% demain \xB7 v\xE9rifi\xE9 satellite`, `${Math.round(firstConf)}% confidence tomorrow \xB7 satellite-verified`, `${Math.round(firstConf)}% de confianza ma\xF1ana \xB7 verificado por sat\xE9lite`);
    return /* @__PURE__ */ React.createElement("div", { className: "pw-beat-in", style: { marginTop: 10, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,0,0,.06)", background: "#190c2c" } }, /* @__PURE__ */ React.createElement("style", null, `@keyframes pwBeatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.pw-beat-in{animation:pwBeatIn .34s cubic-bezier(.22,1,.36,1) both}@media(prefers-reduced-motion:reduce){.pw-beat-in{animation:none}}`), /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 400 116", preserveAspectRatio: "xMidYMid slice", style: { width: "100%", height: 108, display: "block" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "pbSky", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#0B2230" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#155A5A" }), /* @__PURE__ */ React.createElement("stop", { offset: ".84", stopColor: "#C97E3A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#F2B05E" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "pbSea", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#1A5852" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#08251F" }))), /* @__PURE__ */ React.createElement("rect", { width: "400", height: "116", fill: "url(#pbSky)" }), /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "84", r: "40", fill: "#FFD884", opacity: ".2" }), /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "84", r: "22", fill: "#FFD884", opacity: ".4" }), /* @__PURE__ */ React.createElement("rect", { y: "84", width: "400", height: "32", fill: "url(#pbSea)" }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "84", x2: "400", y2: "84", stroke: "#FFD884", strokeWidth: "1", opacity: ".5" }), visible.map((d, i) => {
      const x = 44 + i * (312 / Math.max(1, visible.length - 1));
      const op = i <= 2 ? 0.95 : 0.45;
      const h = d.status === "clean" ? 4 : d.status === "moderate" ? 9 : 13;
      return /* @__PURE__ */ React.createElement("g", { key: i, opacity: op }, /* @__PURE__ */ React.createElement("path", { d: "M" + (x - 9).toFixed(0) + " 84 Q" + x.toFixed(0) + " " + (84 - h) + " " + (x + 9).toFixed(0) + " 84", fill: "none", stroke: stCol(d.status), strokeWidth: "1.4", opacity: ".75" }), /* @__PURE__ */ React.createElement("circle", { cx: x.toFixed(0), cy: "84", r: i === 0 ? 4.5 : 3.2, fill: stCol(d.status) }), /* @__PURE__ */ React.createElement("text", { x: x.toFixed(0), y: "104", fontFamily: "ui-monospace,monospace", fontSize: "8", fill: "rgba(255,255,255,.6)", textAnchor: "middle" }, fcDay(d, lang).slice(0, 3)));
    }), /* @__PURE__ */ React.createElement("g", null, miVeil(92, 40, mood.wing, mood.lens))), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px 16px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.3 } }, promiseEl), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "rgba(255,255,255,.55)", marginTop: 5, fontFamily: "ui-monospace,monospace" } }, proof), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      try {
        track("sg_beat_cta", { conf: Math.round(firstConf) });
      } catch (_) {
      }
      ;
      onPremiumClick("forecast_beat");
    }, className: "gbtn", style: { display: "block", width: "100%", marginTop: 13, padding: "13px", borderRadius: 13, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15 } }, _t(lang, "Voir la pr\xE9vision de ma c\xF4te", "See my coast's forecast", "Ver el pron\xF3stico de mi costa")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 9 } }, lockSub)));
  })());
}
function computeBestForecastDay(forecast, weeklyData) {
  if (!forecast?.length) return null;
  const reliableHorizon = weeklyData?.reliableHorizon || 3;
  const visibleDays = Math.min(forecast.length, Math.max(4, reliableHorizon + 1));
  const slice = forecast.slice(0, visibleDays);
  const cleanDays = slice.filter((d) => d.status === "clean");
  if (!cleanDays.length) return null;
  return cleanDays.reduce((best, d) => !best || Number.isFinite(d.afai) && d.afai < (best.afai ?? Infinity) ? d : best, null);
}
function ForecastLanding({ beach, lang, island: island2, sargData, isPremium, onPremium, onOpenBeach, onShowMap, trackFn, exiting }) {
  const weather = useWeather(beach);
  const sargId = IS_NEW_REGION ? beach?.id : BEACH_TO_SARG[beach?.id];
  const _ew = sargData?._enrichedWeekly;
  const enriched = _ew && Object.keys(_ew).length ? _ew : sargData?.weekly;
  const activeWeekly = sargId && enriched ? enriched[sargId] : null;
  const forecast = activeWeekly?.forecast || null;
  const mood = moodFromStatus(beach?.status || "clean");
  const freshLbl = (() => {
    const fr = formatFreshness(sargData?.updatedAt, lang);
    if (fr) return fr;
    return _t(lang, "v\xE9rification en cours", "verification in progress", "verificaci\xF3n en curso");
  })();
  const isLive = sargData?.source === "erddap-live" && !!formatFreshness(sargData?.updatedAt, lang);
  const bestDay = computeBestForecastDay(forecast, activeWeekly);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sg_prev_landing_seen")) return;
      sessionStorage.setItem("sg_prev_landing_seen", "1");
      trackFn("sg_previsions_landing_view", { beach: beach?.id, status: beach?.status });
    } catch (_) {
    }
  }, [beach?.id, beach?.status, trackFn]);
  const vm = verdictMeta(beach?.status, lang);
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    inset: 0,
    zIndex: "var(--z-sheet)",
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    background: "var(--sg-bg,#FDFCF7)",
    opacity: exiting ? 0 : 1,
    transform: exiting ? "scale(.98)" : "scale(1)",
    transition: "opacity .3s ease,transform .3s ease",
    pointerEvents: exiting ? "none" : "auto"
  } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", minHeight: 220, background: "linear-gradient(180deg,#0B2230 0%,#155A5A 50%,#C97E3A 84%,#F2B05E 100%)", padding: "max(16px,env(safe-area-inset-top)) 20px 28px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement(Veilleur, { mood, size: 36 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "rgba(255,255,255,.55)", textTransform: "uppercase" } }, _t(lang, "Le Veilleur", "The Watcher", "El Vig\xEDa")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 } }, isLive && /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: isLive ? "#3fd07f" : "rgba(255,255,255,.6)" } }, isLive ? _t(lang, "EN DIRECT", "LIVE", "EN DIRECTO") : freshLbl), isLive && freshLbl && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "rgba(255,255,255,.45)" } }, "\xB7 ", freshLbl)))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(4,9,11,.45)",
    border: "1px solid rgba(255,255,255,.22)",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
    backdropFilter: "blur(8px)"
  } }, "\u2715")), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 38,
    lineHeight: 0.95,
    textTransform: "uppercase",
    color: "#fff",
    letterSpacing: "-.02em",
    margin: 0
  } }, _t(lang, "Pr\xE9visions 7 jours", "7-day forecast", "Pron\xF3stico 7 d\xEDas")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 14, color: "rgba(255,255,255,.72)", margin: "10px 0 0", lineHeight: 1.45, maxWidth: 420 } }, _t(lang, "Cette semaine, plage par plage. Mesur\xE9 au satellite, pas devin\xE9 \u2014 et quand on se trompe, on l'\xE9crit.", "This week, beach by beach. Measured by satellite, not guessed \u2014 and when we're wrong, we say so.", "Esta semana, playa por playa. Medido por sat\xE9lite, no adivinado \u2014 y cuando nos equivocamos, lo escribimos."))), /* @__PURE__ */ React.createElement("div", { style: { padding: "20px 16px calc(100px + env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--sg-mid,#5A5A5A)", textTransform: "uppercase" } }, _t(lang, "Plage mod\xE8le", "Sample beach", "Playa modelo")), /* @__PURE__ */ React.createElement("button", { onClick: () => onOpenBeach(beach), style: { background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 22, color: "var(--sg-ink,#0D0D0D)", marginTop: 2 } }, beach?.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: vm.color, marginTop: 2 } }, vm.emoji, " ", vm.verb, typeof beach?.score === "number" ? ` \xB7 ${beach.score}/100` : "")))), forecast?.length ? /* @__PURE__ */ React.createElement(
    ForecastChart,
    {
      forecast,
      lang,
      onPremiumClick: (src) => onPremium(src || "previsions_landing"),
      isPremium,
      weatherDaily: weather?.daily || null,
      weeklyData: activeWeekly
    }
  ) : /* @__PURE__ */ React.createElement("div", { style: { padding: 16, borderRadius: 14, background: "var(--sg-bgD,#F7F5EF)", fontSize: 13, color: "var(--sg-mid,#5A5A5A)" } }, _t(lang, "V\xE9rification en cours, reviens demain.", "Verification in progress, check back tomorrow.", "Verificaci\xF3n en curso, vuelve ma\xF1ana.")), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 14,
    background: "var(--sg-card,#fff)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))",
    boxShadow: "0 2px 12px rgba(0,0,0,.04)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "var(--sg-mid,#5A5A5A)", textTransform: "uppercase", marginBottom: 6 } }, _t(lang, "Ton meilleur jour cette semaine", "Your best day this week", "Tu mejor d\xEDa esta semana")), bestDay ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: ST.clean.c } }, fcDay(bestDay, lang), bestDay.confidence != null ? ` \xB7 ${Math.round(bestDay.confidence)}%` : ``, /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--sg-mid,#5A5A5A)", marginTop: 4 } }, _t(lang, "Le meilleur cr\xE9neau de l'horizon fiable. Le Veilleur regarde la mer pour toi \u2014 au-del\xE0, on estompe plut\xF4t que d'inventer.", "The best window within the reliable horizon. The Watcher looks at the sea for you \u2014 beyond it, we fade the days rather than fake them.", "La mejor ventana del horizonte fiable. El Vig\xEDa mira el mar por ti \u2014 m\xE1s all\xE1, lo difuminamos en vez de inventarlo."))) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "var(--sg-mid,#5A5A5A)", lineHeight: 1.45 } }, _t(lang, "V\xE9rification en cours, reviens demain.", "Verification in progress, check back tomorrow.", "Verificaci\xF3n en curso, vuelve ma\xF1ana."))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    width: "100%",
    marginTop: 18,
    padding: "14px 18px",
    borderRadius: 14,
    border: "1.5px solid var(--sg-border,rgba(0,0,0,.08))",
    background: "var(--sg-card,#fff)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--sg-ink,#0D0D0D)"
  } }, _t(lang, "Ouvrir la carte en direct \u2192", "Open the live map \u2192", "Abrir el mapa en directo \u2192")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 10, fontSize: 11, color: "var(--sg-mid,#999)" } }, _t(lang, "Ta c\xF4te est complexe pour de vrai : on la conna\xEEt baie par baie. Choisis une autre plage sur la carte.", "Your coast is genuinely complex \u2014 we know it bay by bay. Pick another beach on the map.", "Tu costa es realmente compleja: la conocemos bah\xEDa por bah\xEDa. Elige otra playa en el mapa."))));
}
function MethodologyLink({ beach, lang, sargData }) {
  const [open, setOpen] = useState(false);
  if (!beach) return null;
  const fr = lang !== "en";
  const chain = beach._communityOverride ? fr ? "Signalements visiteurs (48h) \u2192 Consensus \u22653 \u2192 Votre \xE9cran" : "Visitor reports (48h) \u2192 Consensus \u22653 \u2192 Your screen" : beach.beachMemory ? fr ? "Historique satellite 7j \u2192 D\xE9croissance exponentielle (demi-vie 3.5j) \u2192 Votre \xE9cran" : "Satellite history 7d \u2192 Exponential decay (half-life 3.5d) \u2192 Your screen" : beach._src === "live" ? fr ? "NOAA ERDDAP (satellite AFAI) \u2192 Normalisation \u2192 Votre \xE9cran" : "NOAA ERDDAP (satellite AFAI) \u2192 Normalization \u2192 Your screen" : fr ? "3 plages proches avec satellite \u2192 Interpolation IDW \u2192 Votre \xE9cran" : "3 nearest satellite beaches \u2192 IDW interpolation \u2192 Your screen";
  return /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setOpen(!open);
    try {
      track("sg_verdict_expand", { beach_id: beach.id, expanded: !open });
    } catch (_) {
    }
  }, style: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 10,
    color: "var(--sg-mid,#999)",
    textDecoration: "underline",
    fontWeight: 500
  } }, fr ? "Comment c'est calcul\xE9 ?" : "How is this calculated?", " ", open ? "\u25B2" : "\u25BC"), open && /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 10,
    color: "var(--sg-mid,#5A5A5A)",
    marginTop: 4,
    padding: "6px 10px",
    background: "rgba(0,0,0,.03)",
    borderRadius: 8,
    lineHeight: 1.5
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, marginBottom: 2 } }, fr ? "Cha\xEEne de donn\xE9es" : "Data chain"), /* @__PURE__ */ React.createElement("div", null, chain), sargData?.pipelineVersion && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, fontSize: 9, opacity: 0.6 } }, "Pipeline v", sargData.pipelineVersion)));
}
const WEATHER_TTL = 30 * 60 * 1e3;
function cachedFetch(url, cacheKey) {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.t < WEATHER_TTL) return Promise.resolve(c.d);
    }
  } catch {
  }
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then((d) => {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d }));
    } catch {
    }
    return d;
  });
}
function useWeather(beach) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!beach) return setData(null);
    let cancel = false;
    const tz = IS_NEW_REGION ? REGION.timezone || "America/Martinique" : "America/Martinique";
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,precipitation&daily=temperature_2m_max,precipitation_sum,cloud_cover_mean,wind_speed_10m_max&timezone=${tz}`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&current=wave_height,wave_direction,swell_wave_height&timezone=${tz}`;
    const wKey = `sg_wx_${beach.id}`, mKey = `sg_mx_${beach.id}`;
    Promise.allSettled([
      cachedFetch(weatherUrl, wKey),
      cachedFetch(marineUrl, mKey)
    ]).then(([weatherRes, marineRes]) => {
      if (cancel) return;
      const w = weatherRes.status === "fulfilled" ? weatherRes.value : null;
      const m = marineRes.status === "fulfilled" ? marineRes.value : null;
      if (!w?.current) return;
      setData({
        temp: Math.round(w.current.temperature_2m),
        wind: Math.round(w.current.wind_speed_10m),
        windDir: w.current.wind_direction_10m,
        uv: w.current.uv_index,
        precipitation: w.current.precipitation || 0,
        waveHeight: m?.current?.wave_height ?? null,
        swellHeight: m?.current?.swell_wave_height ?? null,
        waveDir: m?.current?.wave_direction ?? null,
        daily: w.daily ? {
          tempMax: w.daily.temperature_2m_max,
          precipSum: w.daily.precipitation_sum,
          cloudMean: w.daily.cloud_cover_mean,
          windMax: w.daily.wind_speed_10m_max
        } : null
      });
    });
    return () => {
      cancel = true;
    };
  }, [beach?.id]);
  return data;
}
const SVG_OBS_ON = typeof window !== "undefined" && !/[?&]svgobs=0/.test(window.location.search || "");
function ObsScene({ level, frame }) {
  return /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 96 64", "aria-hidden": "true", style: { display: "block", width: "100%", height: "auto" } }, /* @__PURE__ */ React.createElement("rect", { width: "96", height: "64", fill: "#FDFCF7" }), /* @__PURE__ */ React.createElement("circle", { cx: "14", cy: "12", r: "4.5", fill: "none", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("rect", { x: "2", y: "46", width: "92", height: "16", fill: "#F3E5B8" }), /* @__PURE__ */ React.createElement("path", { d: "M2 28q11.5-7 23 0t23 0t23 0t23 0v18h-92z", fill: "#009E8E", stroke: "#0D0D0D", strokeWidth: "2", strokeLinejoin: "round" }), level === "clean" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M32 37q7-3 14 0", fill: "none", stroke: "#FDFCF7", strokeWidth: "2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M20 55h7M62 57h7", fill: "none", stroke: "#0D0D0D", strokeWidth: "2", strokeLinecap: "round" })), level === "moderate" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "34", cy: "41", r: "2", fill: "#6b5d2e", stroke: "#0D0D0D", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "56", cy: "39", r: "2", fill: "#6b5d2e", stroke: "#0D0D0D", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("path", { d: "M2 48q5.75-6 11.5 0t11.5 0t11.5 0t11.5 0t11.5 0t11.5 0t11.5 0t11.5 0v3h-92z", fill: "#5a5233", stroke: "#0D0D0D", strokeWidth: "2", strokeLinejoin: "round" })), level === "avoid" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ellipse", { cx: "24", cy: "36", rx: "9", ry: "3.5", fill: "#6b5d2e", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "50", cy: "32", rx: "7", ry: "3", fill: "#6b5d2e", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "74", cy: "37", rx: "8", ry: "3.2", fill: "#6b5d2e", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M2 49q11.5-8 23 0t23 0t23 0t23 0v7h-92z", fill: "#5a5233", stroke: "#0D0D0D", strokeWidth: "2", strokeLinejoin: "round" })), /* @__PURE__ */ React.createElement("rect", { x: "1.25", y: "1.25", width: "93.5", height: "61.5", fill: "none", stroke: frame || "#0D0D0D", strokeWidth: "2.5" }));
}
const VERDICT_SCAN_ON = typeof window !== "undefined" && !/[?&]verdictscan=0/.test(window.location.search || "");
function VerdictRadarScan({ beach, lang, onDisagree }) {
  const [reduced] = useState(() => {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  });
  const [step1, setStep1] = useState(reduced);
  const [step2, setStep2] = useState(reduced);
  const [pulsed, setPulsed] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t1 = setTimeout(() => setStep1(true), 300);
    const t2 = setTimeout(() => setStep2(true), 600);
    const t3 = setTimeout(() => setPulsed(true), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [reduced]);
  const ckey = "sg_vconfirm_" + beach.id, ctkey = "sg_vconfirm_t_" + beach.id;
  const [confirmed, setConfirmed] = useState(() => {
    const last = g(ctkey, 0);
    return last && Date.now() - last < 12 * 3600 * 1e3 ? g(ckey, null) : null;
  });
  useEffect(() => {
    try {
      track("sg_verdict_scan_view", { beach_id: beach.id, island: beach.island, status: beach.status, src: beach._src || null, forecast_available: !!beach._src });
    } catch (_) {
    }
  }, []);
  const live = beach._src === "live";
  const stepLbl = live ? [_t(lang, "Satellite", "Satellite", "Sat\xE9lite"), _t(lang, "Normalisation", "Normalization", "Normalizaci\xF3n")] : [_t(lang, "Historique", "History", "Hist\xF3rico"), _t(lang, "Mod\xE8le", "Model", "Modelo")];
  const onTap = (agree) => {
    if (confirmed) return;
    setConfirmed(agree ? "yes" : "no");
    s(ckey, agree ? "yes" : "no");
    s(ctkey, Date.now());
    try {
      track("sg_verdict_confirm", { beach_id: beach.id, agree, satellite_status: beach.status, island: beach.island });
    } catch (_) {
    }
    try {
      logAnalyticsEvent("sg_verdict_confirm", { beach_id: beach.id, agree, satellite_status: beach.status }, beach.island);
    } catch (_) {
    }
    if (!agree && onDisagree) onDisagree();
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    marginBottom: 12,
    padding: "12px 13px",
    borderRadius: 14,
    background: "var(--sg-card,#fff)",
    border: "2px solid var(--sg-ink,#1d2b3a)",
    boxShadow: "3px 3px 0 rgba(13,13,13,.85)"
  } }, /* @__PURE__ */ React.createElement("style", null, `
        @keyframes sgvrsDot{0%{transform:translateX(0);opacity:1}85%{opacity:1}100%{transform:translateX(180px);opacity:0}}
        .sgvrs-dot{animation:sgvrsDot .9s cubic-bezier(.4,0,.2,1) 1 both}
        @keyframes sgvrsPulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
        .sgvrs-pulsed{animation:sgvrsPulse .3s ease 1 both;transform-origin:center;transform-box:fill-box}
        @media(prefers-reduced-motion:reduce){.sgvrs-dot{animation:none!important;opacity:0!important}.sgvrs-pulsed{animation:none!important}}
      `), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: "var(--sg-ink,#1d2b3a)" } }, _t(lang, `Le Veilleur vient de mesurer ${beach.name}`, `The Watcher just measured ${beach.name}`, `El Vig\xEDa acaba de medir ${beach.name}`)), /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 300 96", "aria-hidden": "true", style: { display: "block", width: "100%", height: "auto", marginTop: 8 } }, /* @__PURE__ */ React.createElement("circle", { cx: "38", cy: "48", r: "15", fill: "#FDFCF7", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("line", { x1: "38", y1: "27", x2: "38", y2: "19", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("line", { x1: "22", y1: "35", x2: "16", y2: "29", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("line", { x1: "54", y1: "35", x2: "60", y2: "29", stroke: "#0D0D0D", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("line", { x1: "53", y1: "48", x2: "233", y2: "48", stroke: "#0D0D0D", strokeWidth: "1.5", strokeDasharray: "3,3" }), /* @__PURE__ */ React.createElement("rect", { x: "110.5", y: "45.5", width: "5", height: "5", fill: step1 ? "#0D0D0D" : "none", stroke: "#0D0D0D", strokeWidth: "1.5", style: { transition: "fill .15s ease" } }), /* @__PURE__ */ React.createElement("rect", { x: "170.5", y: "45.5", width: "5", height: "5", fill: step2 ? "#0D0D0D" : "none", stroke: "#0D0D0D", strokeWidth: "1.5", style: { transition: "fill .15s ease" } }), /* @__PURE__ */ React.createElement("text", { x: "113", y: "63", fontSize: "8", fontWeight: "600", fontFamily: "'Bricolage Grotesque'", textAnchor: "middle", fill: "var(--sg-mid,#7a7768)" }, stepLbl[0]), /* @__PURE__ */ React.createElement("text", { x: "173", y: "63", fontSize: "8", fontWeight: "600", fontFamily: "'Bricolage Grotesque'", textAnchor: "middle", fill: "var(--sg-mid,#7a7768)" }, stepLbl[1]), !reduced && /* @__PURE__ */ React.createElement("circle", { className: "sgvrs-dot", cx: "53", cy: "48", r: "4", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("g", { className: pulsed ? "sgvrs-pulsed" : "" }, /* @__PURE__ */ React.createElement("rect", { x: "234", y: "12", width: "60", height: "72", rx: "8", fill: "none", stroke: "#FFC72C", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("svg", { x: "238", y: "25", width: "52", height: "34.7", viewBox: "0 0 96 64" }, /* @__PURE__ */ React.createElement(ObsScene, { level: beach.status, frame: "#0D0D0D" })))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11.5, color: "var(--sg-mid,#5d5a4e)", fontWeight: 600, lineHeight: 1.4 } }, _t(lang, "Depuis l'orbite jusqu'\xE0 ton \xE9cran : voil\xE0 comment on obtient ce verdict. Il te semble juste ?", "From orbit to your screen: here's how we get this verdict. Does it look right to you?", "Desde la \xF3rbita hasta tu pantalla: as\xED obtenemos este veredicto. \xBFTe parece correcto?")), !confirmed ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onTap(true), style: {
    flex: 1,
    minHeight: 44,
    padding: "10px 8px",
    borderRadius: 12,
    border: "2px solid var(--sg-ink,#1d2b3a)",
    background: "#FDFCF7",
    color: "var(--sg-ink,#1d2b3a)",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#0D0D0D", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M20 6 9 17l-5-5" })), _t(lang, "Oui, \xE7a correspond", "Yes, that matches", "S\xED, coincide")), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onTap(false), style: {
    flex: 1,
    minHeight: 44,
    padding: "10px 8px",
    borderRadius: 12,
    border: "2px solid var(--sg-ink,#1d2b3a)",
    background: "#FDFCF7",
    color: "var(--sg-ink,#1d2b3a)",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#0D0D0D", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M18 6 6 18M6 6l12 12" })), _t(lang, "Non, diff\xE9rent", "No, different", "No, es diferente"))) : /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9, fontSize: 11.5, fontWeight: 700, color: confirmed === "yes" ? C.green : "var(--sg-ink,#1d2b3a)", textAlign: "center" } }, confirmed === "yes" ? _t(lang, "Merci \u2014 \xE7a confirme ce que voit le satellite.", "Thanks \u2014 that confirms what the satellite sees.", "Gracias \u2014 eso confirma lo que ve el sat\xE9lite.") : _t(lang, "Merci \u2014 dis-nous ce que tu vois juste en dessous \u2193", "Thanks \u2014 tell us what you see just below \u2193", "Gracias \u2014 cu\xE9ntanos qu\xE9 ves justo abajo \u2193")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 7, fontSize: 10, color: "var(--sg-mid)", textAlign: "center" } }, _t(lang, "Ton avis n'influence jamais le verdict \u2014 il reste mesur\xE9 au satellite.", "Your input never influences the verdict \u2014 it stays satellite-measured.", "Tu opini\xF3n nunca influye en el veredicto \u2014 sigue medido por sat\xE9lite.")));
}
function BeachReport({ beach, lang, communityReports }) {
  const key = "sg_breport_" + beach.id;
  const cooldownKey = "sg_breport_t_" + beach.id;
  const [voted, setVoted] = useState(() => {
    const last = g(cooldownKey, 0);
    if (last && Date.now() - last < 12 * 3600 * 1e3) return g(key, null);
    return null;
  });
  const [queued, setQueued] = useState(false);
  const disagreedRef = useRef(false);
  const evtKey = "sg_bevent_" + beach.id;
  const [evtDone, setEvtDone] = useState(() => {
    const last = g("sg_bevent_t_" + beach.id, 0);
    return last && Date.now() - last < 12 * 3600 * 1e3 ? g(evtKey, null) : null;
  });
  const smellKey = "sg_bsmell_" + beach.id;
  const [smell, setSmell] = useState(() => {
    const last = g("sg_bsmell_t_" + beach.id, 0);
    if (last && Date.now() - last < 12 * 3600 * 1e3) return g(smellKey, null);
    return null;
  });
  const sendSmell = (val) => {
    if (smell) return;
    setSmell(val);
    s(smellKey, val);
    s("sg_bsmell_t_" + beach.id, Date.now());
    try {
      track("sg_obs_smell", { beach_id: beach.id, smell: val, level: voted || null, island: beach.island });
    } catch (_) {
    }
    try {
      logAnalyticsEvent("sg_observation", { beach_id: beach.id, smell: val, level: voted || null }, beach.island);
    } catch (_) {
    }
  };
  const [approvedEvents, setApprovedEvents] = useState(null);
  const [evtBusy, setEvtBusy] = useState(false);
  const [evtErr, setEvtErr] = useState(false);
  useEffect(() => {
    if (!RAMASSAGE_ENABLED || !beach || !beach.id) return;
    let alive = true;
    fetchApprovedReports(beach.id).then((list) => {
      if (alive) setApprovedEvents(list || []);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [beach && beach.id]);
  const sendEvent = (event) => {
    if (evtDone || evtBusy) return;
    setEvtBusy(true);
    setEvtErr(false);
    try {
      track("sg_beach_event", { beach_id: beach.id, event, satellite_status: beach.status, island: beach.island });
    } catch (_) {
    }
    submitBeachReport({ beach, event }).then((ok) => {
      setEvtBusy(false);
      if (ok) {
        setEvtDone(event);
        s(evtKey, event);
        s("sg_bevent_t_" + beach.id, Date.now());
      } else setEvtErr(true);
    }).catch(() => {
      setEvtBusy(false);
      setEvtErr(true);
    });
  };
  const _recentEvents = (approvedEvents || []).filter((e) => {
    try {
      return Date.now() - new Date(e.ts).getTime() < 48 * 3600 * 1e3;
    } catch (_) {
      return false;
    }
  });
  const cleanupCount = _recentEvents.filter((e) => e.event === "cleanup").length;
  const beachingCount = _recentEvents.filter((e) => e.event === "beaching").length;
  const _stRank2 = { clean: 0, moderate: 1, avoid: 2 };
  const terrainStatus = terrainDisplayStatus(beach.status, approvedEvents);
  const counts = communityReports[beach.id] || communityReports[BEACH_TO_SARG[beach.id]] || { clean: 0, moderate: 0, avoid: 0, total: 0 };
  const total = counts.total || 0;
  const LEVELS = [
    { id: "clean", l: "Propre", le: "Clean", les: "Limpia", c: C.green, bg: C.greenBg },
    { id: "moderate", l: "Mod\xE9r\xE9", le: "Moderate", les: "Moderado", c: C.stMod, bg: C.amberBg },
    { id: "avoid", l: "Beaucoup", le: "Heavy", les: "Mucho", c: C.red, bg: C.redBg }
  ];
  const submit = (level) => {
    if (voted) return;
    setVoted(level);
    s(key, level);
    s(cooldownKey, Date.now());
    track("sg_beach_report", { beach_id: beach.id, level, satellite_status: beach.status, island: beach.island });
    if (disagreedRef.current) {
      disagreedRef.current = false;
      try {
        track("sg_verdict_confirm_to_vote", { beach_id: beach.id, island: beach.island });
      } catch (_) {
      }
    }
    const body = JSON.stringify({ type: "beach_report", beach_id: BEACH_TO_SARG[beach.id] || beach.id, beach_name: beach.name, level, island: beach.island, date: (/* @__PURE__ */ new Date()).toISOString() });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      _sgReportStash(body);
      setQueued(true);
      return;
    }
    try {
      fetch(SG_REPORT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body
      }).catch(() => {
        _sgReportStash(body);
        setQueued(true);
      });
    } catch {
      _sgReportStash(body);
      setQueued(true);
    }
  };
  const consensus = total >= 3 ? counts.avoid >= counts.moderate && counts.avoid >= counts.clean ? "avoid" : counts.moderate >= counts.clean ? "moderate" : "clean" : null;
  return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "12px 0",
    padding: "12px 14px",
    borderRadius: 14,
    background: "var(--sg-bgD,#F7F5EF)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))"
  } }, VERDICT_SCAN_ON && /* @__PURE__ */ React.createElement(VerdictRadarScan, { beach, lang, onDisagree: () => {
    disagreedRef.current = true;
  } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "10", r: "2.5" })), _t(lang, "Sur place ? Signale le niveau de sargasses", "On the beach? Report sargassum level", "\xBFEst\xE1s en la playa? Reporta el nivel de sargazo")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, LEVELS.map((lv) => SVG_OBS_ON ? (
    /* Vote par MINI-SCÈNE (le SVG est le produit) : même submit(level), même pipeline
       communauté — seule la présentation change. Sélection lisible par le cadre
       recoloré (attribut SVG, insensible au skin thème) + glyphe + siblings estompés. */
    /* @__PURE__ */ React.createElement("button", { key: lv.id, onClick: () => submit(lv.id), disabled: !!voted, "aria-pressed": voted === lv.id, style: {
      flex: 1,
      padding: 0,
      borderRadius: 12,
      border: "none",
      cursor: voted ? "default" : "pointer",
      overflow: "hidden",
      background: "var(--sg-card,#fff)",
      fontFamily: "inherit",
      transition: "all .2s",
      boxShadow: voted === lv.id ? "inset 0 0 0 2px " + lv.c : "0 1px 4px rgba(0,0,0,.04)",
      animation: voted === lv.id ? "confirmPop .3s ease" : "none",
      opacity: voted && voted !== lv.id ? 0.4 : 1
    } }, /* @__PURE__ */ React.createElement(ObsScene, { level: lv.id, frame: voted === lv.id ? lv.c : "#0D0D0D" }), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 4px 8px", fontSize: 12, fontWeight: 700, color: voted === lv.id ? lv.c : "var(--sg-ink)" } }, /* @__PURE__ */ React.createElement(ComicStatusGlyph, { status: lv.id, size: 12, color: voted === lv.id ? lv.c : "var(--sg-ink)" }), lang === "es" ? lv.les : lang === "en" ? lv.le : lv.l))
  ) : /* @__PURE__ */ React.createElement("button", { key: lv.id, onClick: () => submit(lv.id), disabled: !!voted, style: {
    flex: 1,
    padding: "10px 8px",
    borderRadius: 12,
    border: "none",
    cursor: voted ? "default" : "pointer",
    background: voted === lv.id ? lv.bg : "var(--sg-card,#fff)",
    color: voted === lv.id ? lv.c : "var(--sg-ink)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    transition: "all .2s",
    boxShadow: voted === lv.id ? "inset 0 0 0 1.5px " + lv.c : "0 1px 4px rgba(0,0,0,.04)",
    animation: voted === lv.id ? "confirmPop .3s ease" : "none",
    opacity: voted && voted !== lv.id ? 0.4 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  } }, /* @__PURE__ */ React.createElement(ComicStatusGlyph, { status: lv.id, size: 13, color: voted === lv.id ? lv.c : "var(--sg-ink)" }), lang === "es" ? lv.les : lang === "en" ? lv.le : lv.l))), total > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 8,
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: consensus === beach.status ? "#E8F5E9" : "#FFF3E0",
    color: consensus === beach.status ? "#2E7D32" : "#E65100",
    border: "1px solid " + (consensus === beach.status ? "#A5D6A7" : "#FFCC80")
  } }, consensus === beach.status ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M5 13l4 4L19 7" })), _t(lang, "V\xE9rifi\xE9 par " + total + " visiteur" + (total > 1 ? "s" : ""), "Verified by " + total + " visitor" + (total > 1 ? "s" : ""), "Verificado por " + total + " visitante" + (total > 1 ? "s" : ""))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("path", { d: "M12 8v4M12 16h0" })), _t(lang, "Signalements terrain divergents (" + total + ")", "Reports differ from satellite (" + total + ")", "Reportes divergen del sat\xE9lite (" + total + ")"))), SVG_OBS_ON && voted && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, !smell ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--sg-mid,#7a7768)", marginBottom: 6 } }, _t(lang, "Et l'odeur sur place ?", "And the smell on-site?", "\xBFY el olor en el lugar?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, [{ id: "none", l: "Aucune", le: "None", les: "Ninguno" }, { id: "slight", l: "L\xE9g\xE8re", le: "Slight", les: "Leve" }, { id: "strong", l: "Forte", le: "Strong", les: "Fuerte" }].map((o) => /* @__PURE__ */ React.createElement("button", { key: o.id, type: "button", onClick: () => sendSmell(o.id), style: {
    flex: 1,
    minHeight: 44,
    padding: "9px 8px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "var(--sg-card,#fff)",
    color: "var(--sg-ink)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    boxShadow: "0 1px 4px rgba(0,0,0,.04)"
  } }, lang === "es" ? o.les : lang === "en" ? o.le : o.l)))) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.green, textAlign: "center", fontWeight: 500 } }, _t(lang, "Not\xE9 \u2014 merci pour l'info terrain.", "Logged \u2014 thanks for the ground intel.", "Anotado \u2014 gracias por la info del terreno."))), queued && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11, fontWeight: 600, color: "var(--sg-mid,#7a7768)", display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u{1F4E1}"), _t(lang, "Hors-ligne \u2014 ton signalement partira au retour du r\xE9seau.", "Offline \u2014 your report will send when you're back online.", "Sin conexi\xF3n \u2014 tu reporte se enviar\xE1 al volver la red.")), RAMASSAGE_ENABLED && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--sg-mid,#7a7768)", marginBottom: 6 } }, _t(lang, "Un changement depuis hier ?", "A change since yesterday?", "\xBFUn cambio desde ayer?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, [
    { id: "beaching", e: "\u{1F30A}", l: "Algues arriv\xE9es", le: "Sargassum arrived", les: "Lleg\xF3 sargazo", c: C.stMod, bg: C.amberBg },
    { id: "cleanup", e: "\u{1F9F9}", l: "Ramass\xE9", le: "Cleaned up", les: "Recogido", c: C.green, bg: C.greenBg }
  ].map((ev) => /* @__PURE__ */ React.createElement("button", { key: ev.id, type: "button", onClick: () => sendEvent(ev.id), disabled: !!evtDone || evtBusy, style: {
    flex: 1,
    padding: "10px 8px",
    borderRadius: 12,
    border: "none",
    cursor: evtDone || evtBusy ? "default" : "pointer",
    background: evtDone === ev.id ? ev.bg : "var(--sg-card,#fff)",
    color: evtDone === ev.id ? ev.c : "var(--sg-ink)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    transition: "all .2s",
    boxShadow: evtDone === ev.id ? "inset 0 0 0 1.5px " + ev.c : "0 1px 4px rgba(0,0,0,.04)",
    opacity: evtDone && evtDone !== ev.id || evtBusy ? 0.4 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, ev.e), lang === "es" ? ev.les : lang === "en" ? ev.le : ev.l))), evtDone && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 11, color: C.green, textAlign: "center", fontWeight: 500 } }, _t(lang, "Merci ! Ton signalement sera v\xE9rifi\xE9.", "Thanks! Your report will be reviewed.", "\xA1Gracias! Tu reporte ser\xE1 revisado.")), evtErr && !evtDone && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--sg-mid,#7a7768)", textAlign: "center", fontWeight: 500 } }, _t(lang, "Signalement indisponible pour l'instant \u2014 r\xE9essaie plus tard.", "Reporting unavailable right now \u2014 try again later.", "Reporte no disponible ahora \u2014 reint\xE9ntalo m\xE1s tarde."))), terrainStatus && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: ST[terrainStatus].bg,
    border: `1.5px dashed ${ST[terrainStatus].c}`
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: ST[terrainStatus].c, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u{1F30D}"), _t(lang, `Terrain : ${ST[terrainStatus].l}`, `Ground: ${ST[terrainStatus].le}`, `Terreno: ${ST[terrainStatus].les}`)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 3, fontSize: 10.5, color: "var(--sg-mid)", lineHeight: 1.4 } }, _stRank2[terrainStatus] > _stRank2[beach.status] ? _t(
    lang,
    `\xC9chouement signal\xE9 sur place \xB7 48 h. \u{1F6F0}\uFE0F Satellite : ${ST[beach.status].l} \u2014 la situation peut \xE9voluer.`,
    `Sargassum arrival reported on-site \xB7 48h. \u{1F6F0}\uFE0F Satellite: ${ST[beach.status].le} \u2014 conditions may change.`,
    `Llegada reportada in situ \xB7 48h. \u{1F6F0}\uFE0F Sat\xE9lite: ${ST[beach.status].les} \u2014 puede cambiar.`
  ) : _t(
    lang,
    `Ramassage signal\xE9 sur place \xB7 48 h. \u{1F6F0}\uFE0F Satellite : ${ST[beach.status].l} \u2014 la situation peut \xE9voluer.`,
    `Cleanup reported on-site \xB7 48h. \u{1F6F0}\uFE0F Satellite: ${ST[beach.status].le} \u2014 conditions may change.`,
    `Limpieza reportada in situ \xB7 48h. \u{1F6F0}\uFE0F Sat\xE9lite: ${ST[beach.status].les} \u2014 puede cambiar.`
  ))), RAMASSAGE_ENABLED && (cleanupCount > 0 || beachingCount > 0) && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    padding: "9px 12px",
    borderRadius: 12,
    background: cleanupCount >= beachingCount ? C.greenBg : C.amberBg,
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)", display: "flex", alignItems: "center", gap: 6 } }, cleanupCount >= beachingCount ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u{1F9F9}"), _t(lang, `Ramassage signal\xE9 par ${cleanupCount} visiteur${cleanupCount > 1 ? "s" : ""}`, `Cleanup reported by ${cleanupCount} visitor${cleanupCount > 1 ? "s" : ""}`, `Recogida reportada por ${cleanupCount} visitante${cleanupCount > 1 ? "s" : ""}`)) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u{1F30A}"), _t(lang, `\xC9chouement signal\xE9 par ${beachingCount} visiteur${beachingCount > 1 ? "s" : ""}`, `Sargassum arrival reported by ${beachingCount} visitor${beachingCount > 1 ? "s" : ""}`, `Llegada reportada por ${beachingCount} visitante${beachingCount > 1 ? "s" : ""}`))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 3, fontSize: 10, color: "var(--sg-mid)" } }, _t(lang, "Signal\xE9 au sol \xB7 48 h \xB7 le verdict reste mesur\xE9 au satellite", "Reported on-site \xB7 48h \xB7 the verdict stays satellite-measured", "Reportado in situ \xB7 48h \xB7 el veredicto sigue medido por sat\xE9lite"))), total > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: "var(--sg-border,rgba(0,0,0,.06))" } }, counts.clean > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: counts.clean, background: C.green } }), counts.moderate > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: counts.moderate, background: C.stMod } }), counts.avoid > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: counts.avoid, background: C.red } })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, fontSize: 11, color: "var(--sg-mid)", textAlign: "center" } }, counts.rawTotal || Math.round(total), " ", lang === "es" ? "reporte" + ((counts.rawTotal || total) > 1 ? "s" : "") : lang === "en" ? "report" + ((counts.rawTotal || total) > 1 ? "s" : "") : "signalement" + ((counts.rawTotal || total) > 1 ? "s" : ""), counts.trend && counts.trend !== "stable" && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 4, color: counts.trend === "worsening" ? C.red : C.green } }, counts.trend === "worsening" ? "\u2197" : "\u2198"), consensus && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", _t(lang, "Consensus : ", "Consensus: ", "Consenso: "), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: ST[consensus].c, display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" } }, /* @__PURE__ */ React.createElement(ComicStatusGlyph, { status: consensus, size: 12, color: ST[consensus].c }), lang === "es" ? ST[consensus].les : lang === "en" ? ST[consensus].le : ST[consensus].l)))), voted && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 11, color: C.green, textAlign: "center", fontWeight: 500 } }, _t(lang, "Merci pour ton signalement !", "Thanks for your report!", "\xA1Gracias por tu reporte!")));
}
function FbPostsStrip({ beach, fbPosts, lang }) {
  const posts = fbPosts?.[beach?.id] || fbPosts?.[BEACH_TO_SARG?.[beach?.id]] || [];
  if (!posts.length) return null;
  const statusEmoji = (s2) => s2 === "avoid" ? "\u{1F6AB}" : s2 === "moderate" ? "\u26A0\uFE0F" : s2 === "clean" ? "\u2705" : "\u{1F4AC}";
  const timeAgo = (iso) => {
    try {
      const d = Math.max(0, Date.now() - new Date(iso).getTime());
      const h = Math.round(d / 36e5);
      if (h < 1) return _t(lang, "\xE0 l'instant", "just now", "ahora");
      if (h < 24) return _t(lang, `il y a ${h}h`, `${h}h ago`, `hace ${h}h`);
      const days = Math.round(h / 24);
      return _t(lang, `il y a ${days}j`, `${days}d ago`, `hace ${days}d`);
    } catch {
      return "";
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "14px 0 4px",
    padding: "12px 14px",
    borderRadius: 14,
    background: "var(--sg-bgD,#F7F5EF)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", null, "\u{1F4F7}"), lang === "es" ? `${posts.length} reporte${posts.length > 1 ? "s" : ""} reciente${posts.length > 1 ? "s" : ""} de visitantes (Facebook)` : lang === "en" ? `${posts.length} recent visitor ${posts.length > 1 ? "reports" : "report"} (Facebook)` : `${posts.length} retour${posts.length > 1 ? "s" : ""} visiteur${posts.length > 1 ? "s" : ""} r\xE9cent${posts.length > 1 ? "s" : ""} (Facebook)`), posts.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
    marginBottom: i < posts.length - 1 ? 14 : 0,
    paddingBottom: i < posts.length - 1 ? 14 : 0,
    borderBottom: i < posts.length - 1 ? "1px solid var(--sg-border,rgba(0,0,0,.05))" : "none"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, lineHeight: 1 } }, statusEmoji(p.inferredStatus)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)" } }, p.author), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--sg-mid)" } }, timeAgo(p.scrapedAt))), p.text && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, lineHeight: 1.45, color: "var(--sg-ink)", marginBottom: p.photos?.length || p.commentSample ? 8 : 4 } }, '"', p.text, '"', p.textTruncated ? "\u2026" : ""), p.photos && p.photos.length > 0 && /* @__PURE__ */ React.createElement("a", { href: p.sourceUrl, target: "_blank", rel: "noopener nofollow", style: { display: "inline-block", marginBottom: p.commentSample ? 8 : 4, fontSize: 11, fontWeight: 700, color: "var(--sg-mid)" } }, "\u{1F4F7} ", p.photos.length, " ", _t(lang, "photo(s) au sol", "on-site photo(s)", "foto(s) in situ"), " \u2192"), p.commentSample && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid)", lineHeight: 1.4, paddingLeft: 10, borderLeft: "2px solid rgba(0,0,0,.08)" } }, "\u{1F4AC} ", p.commentSample, p.commentCount > 1 ? ` \xB7 +${p.commentCount - 1} ${_t(lang, "autres", "more", "m\xE1s")}` : ""), /* @__PURE__ */ React.createElement("a", { href: p.sourceUrl, target: "_blank", rel: "noopener nofollow", style: {
    display: "inline-block",
    marginTop: 6,
    fontSize: 10,
    color: "var(--sg-mid)",
    textDecoration: "none",
    borderBottom: "1px dashed rgba(0,0,0,.15)"
  } }, _t(lang, "voir sur Facebook \u2192", "view on Facebook \u2192", "ver en Facebook \u2192")))));
}
function ReliabilityScore({ beachId, historyData, lang }) {
  const stats = useMemo(() => {
    if (!historyData) return null;
    const sargId = BEACH_TO_SARG[beachId];
    if (!sargId || !historyData[sargId]) return null;
    const entries = historyData[sargId];
    if (!Array.isArray(entries) || entries.length < 3) return null;
    const clean = entries.filter((e) => e.afai < 0.15).length;
    const pct = Math.round(clean / entries.length * 100);
    const month = (/* @__PURE__ */ new Date()).toLocaleString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { month: "long" });
    return { pct, total: entries.length, month };
  }, [beachId, historyData, lang]);
  if (!stats) return null;
  const color = stats.pct >= 80 ? C.green : stats.pct >= 50 ? C.amber : C.red;
  const bg = stats.pct >= 80 ? C.greenBg : stats.pct >= 50 ? C.amberBg : C.redBg;
  return /* @__PURE__ */ React.createElement("div", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    margin: "8px 0 12px",
    padding: "8px 14px",
    borderRadius: 12,
    background: bg,
    border: "1px solid " + color + "22"
  } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: 36, height: 36 } }, /* @__PURE__ */ React.createElement("svg", { width: 36, height: 36, viewBox: "0 0 36 36" }, /* @__PURE__ */ React.createElement("circle", { cx: 18, cy: 18, r: 15, fill: "none", stroke: "rgba(0,0,0,.06)", strokeWidth: 3 }), /* @__PURE__ */ React.createElement(
    "circle",
    {
      cx: 18,
      cy: 18,
      r: 15,
      fill: "none",
      stroke: color,
      strokeWidth: 3,
      strokeDasharray: `${stats.pct * 0.94} 100`,
      strokeLinecap: "round",
      transform: "rotate(-90 18 18)",
      style: { transition: "stroke-dasharray .6s ease" }
    }
  )), /* @__PURE__ */ React.createElement("span", { style: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 800,
    color
  } }, stats.pct, "%")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)" } }, _t(lang, `Propre ${stats.pct}% du temps`, `Clean ${stats.pct}% of the time`, `Limpia el ${stats.pct}% del tiempo`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--sg-mid)" } }, _t(lang, `${stats.total} mesures en ${stats.month}`, `Based on ${stats.total} readings in ${stats.month}`, `${stats.total} mediciones en ${stats.month}`))));
}
function PlanBThumb({ i }) {
  const palms = i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
  const pos = [{ x: 46, y: 48 }, { x: 120, y: 46 }];
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      viewBox: "0 0 172 90",
      preserveAspectRatio: "xMidYMid slice",
      "aria-hidden": "true",
      style: { width: "100%", height: "100%", display: "block" }
    },
    /* @__PURE__ */ React.createElement("rect", { width: "172", height: "90", fill: "#FFE9B0" }),
    /* @__PURE__ */ React.createElement("circle", { cx: "132", cy: "22", r: "13", fill: "#FFF1C4" }),
    /* @__PURE__ */ React.createElement("rect", { y: "34", width: "172", height: "34", fill: "#1c7fb0" }),
    /* @__PURE__ */ React.createElement("rect", { y: "33", width: "172", height: "2", fill: "#fff", opacity: ".5" }),
    /* @__PURE__ */ React.createElement("path", { d: "M0,62 Q86,56 172,62 L172,90 L0,90 Z", fill: "#F2D9A0" }),
    Array.from({ length: palms }).map((_, k) => /* @__PURE__ */ React.createElement("g", { key: k, transform: `translate(${pos[k].x},${pos[k].y})` }, /* @__PURE__ */ React.createElement("path", { d: "M0,0 q-2,-14 -1,-26", stroke: "#13514c", strokeWidth: "3", fill: "none" }), /* @__PURE__ */ React.createElement(
      "path",
      {
        d: "M-1,-26 q-12,-2 -20,4 M-1,-26 q12,-2 20,4 M-1,-26 q-6,-9 -14,-12 M-1,-26 q6,-9 14,-12",
        stroke: "#1a6b5f",
        strokeWidth: "2.4",
        fill: "none",
        strokeLinecap: "round"
      }
    )))
  );
}
function GeoSoftAsk({ lang, onAsk, label, src, style }) {
  if (typeof navigator !== "undefined" && !navigator.geolocation) return null;
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: (e) => {
        e.stopPropagation();
        try {
          onAsk && onAsk(src || "softask");
        } catch (_) {
        }
      },
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid var(--sg-border,rgba(13,13,13,.14))",
        background: "var(--sg-card,rgba(255,255,255,.55))",
        color: "var(--sg-mid,#5A5A5A)",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: "pointer",
        lineHeight: 1.1,
        ...style || {}
      }
    },
    "\u{1F4CD} ",
    label || _t(lang, "Voir la distance", "Show distance", "Ver distancia")
  );
}
function PlanBPanel({ beach, allBeaches, userPos, lang, sargData, onBeachClick, onClose, onRequestGeo }) {
  const clean = useMemo(() => {
    if (!beach || !allBeaches) return [];
    const geo = !!(userPos && beach.lat);
    let list = allBeaches.filter((b) => b.id !== beach.id && b.island === beach.island && b.status === "clean" && b.lat && b.lng).map((b) => ({ ...b, _dist: geo ? haversine(userPos.lat, userPos.lng, b.lat, b.lng) : null }));
    list.sort((a, b) => geo ? a._dist - b._dist : (b.score || 0) - (a.score || 0));
    list = list.slice(0, 3);
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
    return list;
  }, [beach?.id, allBeaches, userPos]);
  if (!clean.length) return null;
  const fresh2 = (() => {
    try {
      const ts = sargData?.updatedAt || sargData?.erddapTimestamp;
      if (!ts) return null;
      const h = (Date.now() - new Date(ts).getTime()) / 36e5;
      if (!(h >= 0 && h < 12)) return null;
      return _t(lang, "EN DIRECT \xB7 il y a " + Math.max(1, Math.round(h)) + " h", "LIVE \xB7 " + Math.max(1, Math.round(h)) + "h ago", "EN VIVO \xB7 hace " + Math.max(1, Math.round(h)) + " h");
    } catch (_) {
      return null;
    }
  })();
  const card = {
    scrollSnapAlign: "start",
    flex: "0 0 158px",
    borderRadius: 14,
    overflow: "hidden",
    cursor: "pointer",
    background: "var(--sg-card,#fff)",
    border: "1px solid var(--sg-border,rgba(13,13,13,.10))",
    padding: 0,
    textAlign: "left",
    fontFamily: "inherit",
    position: "relative",
    boxShadow: "0 6px 18px -12px rgba(13,13,13,.4)"
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "6px 0 16px",
    padding: "13px 13px 4px",
    borderRadius: 18,
    background: "linear-gradient(180deg,rgba(232,82,42,.07),rgba(232,82,42,.02))",
    border: "1px solid rgba(232,82,42,.18)"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: "#E8522A"
  } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 4, background: "#E8522A", animation: "pulse 2.6s ease-out infinite" } }), _t(lang, "Sargasses sur ta plage aujourd'hui", "Sargassum on your beach today", "Sargazo en tu playa hoy")), /* @__PURE__ */ React.createElement("h3", { className: "anton", style: { margin: "0 0 2px", fontSize: "clamp(19px,5vw,23px)", lineHeight: 1.05, color: "var(--sg-ink)" } }, _t(lang, "Pas grave \u2014 ", "It's ok \u2014 ", "Tranquilo \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { color: "#E8A800" } }, _t(lang, clean.length + " plages propres", clean.length + " clean beaches", clean.length + " playas limpias")), _t(lang, " pr\xE8s de toi", " near you", " cerca de ti")), fresh2 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, fontWeight: 700, color: "var(--sg-mid,#5A5A5A)", margin: "0 0 10px" } }, fresh2), !userPos && onRequestGeo && /* @__PURE__ */ React.createElement("div", { style: { margin: "0 0 10px" } }, /* @__PURE__ */ React.createElement(
    GeoSoftAsk,
    {
      lang,
      onAsk: onRequestGeo,
      src: "planb",
      label: _t(lang, "Trier par distance", "Sort by distance", "Ordenar por distancia")
    }
  )), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    gap: 11,
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    padding: "2px 0 10px",
    margin: "0 -2px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none"
  } }, clean.map((b, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: b.id,
      style: { ...card },
      "aria-label": `${b.name} ${b.commune || ""}, ${_t(lang, "propre", "clean", "limpia")}, score ${b.score}/100`,
      onClick: () => {
        track("sg_planb_pick", { from: beach.id, to: b.id, rank: i, dist: b._dist != null ? Math.round(b._dist) : null });
        onBeachClick(b);
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { position: "relative", height: 74, background: "#FFE9B0" } }, /* @__PURE__ */ React.createElement(PlanBThumb, { i }), /* @__PURE__ */ React.createElement("span", { style: {
      position: "absolute",
      top: 7,
      left: 7,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: ".06em",
      color: "#120821",
      background: "#22C55E",
      borderRadius: 6,
      padding: "3px 6px"
    } }, _t(lang, "PROPRE", "CLEAN", "LIMPIA")), i === 0 && /* @__PURE__ */ React.createElement("span", { style: {
      position: "absolute",
      top: 7,
      right: 7,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: ".04em",
      color: "#1A2B26",
      background: "#FFC72C",
      borderRadius: 6,
      padding: "3px 6px"
    } }, _t(lang, "le + s\xFBr", "best pick", "mejor"))),
    /* @__PURE__ */ React.createElement("div", { style: { padding: "9px 11px 11px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 800, color: "var(--sg-ink)", lineHeight: 1.15 } }, b.name), b.commune && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", marginTop: 2 } }, b.commune), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--sg-mid,#5A5A5A)" } }, b._dist != null ? _t(lang, "vers " + Math.round(b._dist) + " km", "~" + Math.round(b._dist) + " km away", "a " + Math.round(b._dist) + " km") : typeof b.drive === "number" ? _t(lang, "env. " + b.drive + " min", "~" + b.drive + " min", "~" + b.drive + " min") : ""), typeof b.score === "number" && /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, color: "#22C55E", fontSize: 13 } }, b.score, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, opacity: 0.7, fontWeight: 700 } }, "/100"))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9, fontSize: 12, fontWeight: 800, color: "#156a96" } }, _t(lang, "M'y emmener", "Take me there", "Ll\xE9vame"), " \u2192"))
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      style: {
        ...card,
        flex: "0 0 120px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: "transparent",
        border: "1px dashed rgba(13,13,13,.2)",
        boxShadow: "none",
        color: "var(--sg-mid,#5A5A5A)"
      },
      onClick: () => {
        track("sg_planb_more", { from: beach.id });
        onClose && onClose();
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 22 } }, "\u{1F5FA}\uFE0F"),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, fontWeight: 700, textAlign: "center", padding: "0 8px" } }, _t(lang, "Voir sur la carte", "See on the map", "Ver en el mapa"))
  )));
}
const H2S_LV = {
  low: { w: ["faible", "low", "bajo"], c: "#22C55E", soft: "rgba(34,197,94,.16)", frac: 0.14 },
  mod: { w: ["mod\xE9r\xE9", "moderate", "moderado"], c: "#E8A800", soft: "rgba(232,168,0,.18)", frac: 0.5 },
  high: { w: ["\xE9lev\xE9", "high", "alto"], c: "#E8522A", soft: "rgba(232,82,42,.20)", frac: 0.86 }
};
function H2SBadge({ beach, lang, weather, onPremiumClick }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const h2s = beach && beach.h2s && typeof beach.h2s === "object" ? beach.h2s : null;
  const rawLvl = h2s ? h2s.level : null;
  const level = rawLvl === "high" ? "high" : rawLvl === "moderate" || rawLvl === "mod" ? "mod" : rawLvl === "low" ? "low" : beach.status === "avoid" ? "high" : beach.status === "moderate" ? "mod" : "low";
  const score = h2s && typeof h2s.score === "number" ? h2s.score : null;
  const mass = h2s && h2s.signals && typeof h2s.signals.mass === "number" ? h2s.signals.mass : typeof beach.afai === "number" ? beach.afai : 0;
  const consecDays = h2s && h2s.signals && typeof h2s.signals.consecDays === "number" ? h2s.signals.consecDays : null;
  const sheltered = (() => {
    try {
      const c = beach.coast || classifyBeachCoast(beach.lat, beach.lng, beach.island);
      return c === "sheltered";
    } catch (_) {
      return false;
    }
  })();
  const windSpeed = (() => {
    try {
      return weather && (weather.wind != null ? weather.wind : weather.windSpeed != null ? weather.windSpeed : weather.current && weather.current.wind);
    } catch (_) {
      return null;
    }
  })();
  const L = H2S_LV[level];
  const frac = Math.max(0.08, score != null ? score / 100 : L.frac);
  const ARC = 2 * Math.PI * 22;
  const word = L.w[lang === "en" ? 1 : lang === "es" ? 2 : 0];
  const oneLine = level === "low" ? _t(lang, "Plage propre \u2014 aucune odeur attendue aujourd'hui.", "Clean beach \u2014 no odour expected today.", "Playa limpia \u2014 sin olores previstos hoy.") : level === "mod" ? _t(lang, "Algues qui se d\xE9composent \u2014 odeur possible par moments.", "Decomposing seaweed \u2014 occasional odour possible.", "Algas en descomposici\xF3n \u2014 posible olor por momentos.") : _t(lang, "Forte accumulation en d\xE9composition \u2014 odeur d'\u0153uf pourri probable.", "Heavy decomposing build-up \u2014 rotten-egg smell likely.", "Fuerte acumulaci\xF3n en descomposici\xF3n \u2014 probable olor a huevo podrido.");
  const why = [];
  why.push({
    ic: "algae",
    main: mass >= 0.4 ? _t(lang, "Forte accumulation d'algues", "Heavy seaweed build-up", "Fuerte acumulaci\xF3n de algas") : mass >= 0.15 ? _t(lang, "Algues pr\xE9sentes sur la plage", "Seaweed on the beach", "Algas en la playa") : _t(lang, "Tr\xE8s peu d'algues", "Very little seaweed", "Muy pocas algas"),
    meta: mass >= 0.15 ? _t(lang, "indice de pr\xE9sence " + mass.toFixed(2), "presence index " + mass.toFixed(2), "\xEDndice de presencia " + mass.toFixed(2)) : _t(lang, "rien \xE0 d\xE9composer", "nothing to decompose", "nada que descomponer")
  });
  if (consecDays != null && consecDays >= 2) why.push({ ic: "clock", main: _t(lang, "Pr\xE9sentes depuis " + consecDays + " jours", "Present for " + consecDays + " days", "Presentes desde hace " + consecDays + " d\xEDas"), meta: _t(lang, "d\xE9composition avanc\xE9e = plus de gaz", "advanced decomposition = more gas", "descomposici\xF3n avanzada = m\xE1s gas") });
  else why.push({ ic: "clock", main: _t(lang, "\xC9chouage r\xE9cent / frais", "Recent / fresh landing", "Llegada reciente / fresca"), meta: _t(lang, "peu de d\xE9composition pour l'instant", "little decomposition so far", "poca descomposici\xF3n por ahora") });
  why.push(sheltered ? { ic: "wind", main: _t(lang, "Baie peu ventil\xE9e", "Poorly ventilated bay", "Bah\xEDa poco ventilada"), meta: _t(lang, "l'air se renouvelle mal, le gaz stagne", "air renews poorly, gas lingers", "el aire se renueva mal, el gas se estanca") } : { ic: "wind", main: _t(lang, "C\xF4te ouverte, bien ventil\xE9e", "Open, well-ventilated coast", "Costa abierta, bien ventilada"), meta: _t(lang, "l'air disperse les odeurs", "air disperses odours", "el aire dispersa los olores") });
  const WHO = { tous: _t(lang, "Tous", "All", "Todos"), sens: _t(lang, "Sensibles", "Sensitive", "Sensibles"), riv: _t(lang, "Riverains", "Residents", "Residentes"), vis: _t(lang, "Visiteurs", "Visitors", "Visitantes") };
  const tips = level === "low" ? [
    { who: WHO.tous, t: _t(lang, "Rien \xE0 signaler c\xF4t\xE9 air. Bonne journ\xE9e plage.", "Nothing to report air-wise. Enjoy the beach.", "Nada que se\xF1alar en el aire. Disfruta la playa.") },
    { who: WHO.sens, t: _t(lang, "Asthme, b\xE9b\xE9s, femmes enceintes, seniors : conditions favorables aujourd'hui.", "Asthma, babies, pregnancy, seniors: favourable conditions today.", "Asma, beb\xE9s, embarazo, mayores: condiciones favorables hoy.") }
  ] : level === "mod" ? [
    { who: WHO.riv, t: _t(lang, "A\xE8re t\xF4t le matin, garde les fen\xEAtres ferm\xE9es l'apr\xE8s-midi si l'odeur monte.", "Air out early, keep windows shut in the afternoon if odour rises.", "Ventila temprano, cierra ventanas por la tarde si sube el olor.") },
    { who: WHO.vis, t: _t(lang, "Pr\xE9f\xE8re une zone d\xE9gag\xE9e, \xE0 l'\xE9cart des amas bruns.", "Pick an open spot, away from the brown piles.", "Elige una zona despejada, lejos de los montones marrones.") },
    { who: WHO.sens, t: _t(lang, "Asthme, b\xE9b\xE9s, femmes enceintes, seniors : limite le temps pr\xE8s des algues.", "Asthma, babies, pregnancy, seniors: limit time near the seaweed.", "Asma, beb\xE9s, embarazo, mayores: limita el tiempo cerca de las algas.") }
  ] : [
    { who: WHO.riv, t: _t(lang, "Ferme les fen\xEAtres c\xF4t\xE9 mer, fais tourner la ventilation, \xE9vite l'effort dehors pr\xE8s du rivage.", "Close sea-facing windows, run ventilation, avoid exertion near the shore.", "Cierra ventanas hacia el mar, ventila, evita el esfuerzo cerca de la orilla.") },
    { who: WHO.vis, t: _t(lang, "Reporte ou choisis une autre plage : l'odeur et l'irritation seront fortes pr\xE8s des amas.", "Postpone or pick another beach: odour and irritation will be strong near the piles.", "Posp\xF3n o elige otra playa: el olor y la irritaci\xF3n ser\xE1n fuertes cerca de los montones.") },
    { who: WHO.sens, t: _t(lang, "Asthme, b\xE9b\xE9s, femmes enceintes, seniors : \xE9vite la plage aujourd'hui par prudence.", "Asthma, babies, pregnancy, seniors: avoid the beach today as a precaution.", "Asma, beb\xE9s, embarazo, mayores: evita la playa hoy por precauci\xF3n.") }
  ];
  const adviceLbl = level === "high" ? _t(lang, "\xC0 faire aujourd'hui", "What to do today", "Qu\xE9 hacer hoy") : _t(lang, "Conseil riverains & visiteurs", "For residents & visitors", "Para residentes y visitantes");
  const ctaK = level === "high" ? _t(lang, "Pr\xE9viens-moi avant le prochain pic d'odeur", "Warn me before the next odour peak", "Av\xEDsame antes del pr\xF3ximo pico de olor") : _t(lang, "Sois alert\xE9 quand l'air se d\xE9grade", "Get alerted when the air worsens", "Recibe alerta cuando el aire empeore");
  useEffect(() => {
    if (panelRef.current) {
      try {
        if (window.matchMedia("(prefers-reduced-motion:reduce)").matches) {
          panelRef.current.style.maxHeight = open ? "none" : "0";
          return;
        }
        panelRef.current.style.maxHeight = open ? panelRef.current.scrollHeight + "px" : "0";
      } catch (_) {
      }
    }
  }, [open, level, lang]);
  const iconPath = (n) => n === "algae" ? /* @__PURE__ */ React.createElement("path", { d: "M7 13c0-4 1.5-6 .5-9M7 13c2.5 0 4-2 3.5-5M7 13c-2.4 0-4-2-3.5-4.5", fill: "none", stroke: "var(--sg-mid,#5A5A5A)", strokeWidth: "1.4", strokeLinecap: "round" }) : n === "clock" ? /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "var(--sg-mid,#5A5A5A)", strokeWidth: "1.4", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "5.4" }), /* @__PURE__ */ React.createElement("path", { d: "M7 4v3.2l2 1.2" })) : /* @__PURE__ */ React.createElement("path", { d: "M2 5.5h6.5a1.8 1.8 0 1 0-1.8-1.8M2 9h9a1.8 1.8 0 1 1-1.8 1.8", fill: "none", stroke: "var(--sg-mid,#5A5A5A)", strokeWidth: "1.4", strokeLinecap: "round" });
  return /* @__PURE__ */ React.createElement("div", { style: { margin: "4px 0 14px" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setOpen((o) => !o);
        track("sg_h2s_expand", { beach_id: beach.id, level, open: !open });
      },
      "aria-expanded": open,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: "100%",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        background: "var(--sg-card,#fff)",
        border: "1px solid " + L.soft,
        borderLeft: "4px solid " + L.c,
        borderRadius: 16,
        padding: "13px 15px",
        boxShadow: "0 8px 22px -14px " + L.c + "66"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 auto" } }, /* @__PURE__ */ React.createElement("svg", { width: "52", height: "52", viewBox: "0 0 56 56", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "28", cy: "28", r: "22", fill: "none", stroke: "rgba(13,13,13,.10)", strokeWidth: "6" }), /* @__PURE__ */ React.createElement("circle", { cx: "28", cy: "28", r: "22", fill: "none", stroke: L.c, strokeWidth: "6", strokeLinecap: "round", transform: "rotate(-90 28 28)", strokeDasharray: ARC, strokeDashoffset: ARC * (1 - frac) }), /* @__PURE__ */ React.createElement("g", { transform: "translate(28 28)", stroke: L.c, strokeWidth: "2", strokeLinecap: "round", fill: "none", opacity: ".95" }, /* @__PURE__ */ React.createElement("path", { d: "M -5 4 q -3 -3 0 -6 q 3 -3 0 -6" }), /* @__PURE__ */ React.createElement("path", { d: "M 0 5 q -3 -3.5 0 -7 q 3 -3.5 0 -7" }), /* @__PURE__ */ React.createElement("path", { d: "M 5 4 q -3 -3 0 -6 q 3 -3 0 -6" })))),
    /* @__PURE__ */ React.createElement("span", { style: { flex: "1 1 auto", minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--sg-mid,#5A5A5A)" } }, _t(lang, "Indice sant\xE9 \xB7 air", "Health \xB7 air quality", "Salud \xB7 calidad del aire")), /* @__PURE__ */ React.createElement("span", { className: "anton", style: { display: "block", fontSize: 21, lineHeight: 1.02, marginTop: 2, color: "var(--sg-ink)" } }, _t(lang, "Risque H2S", "H2S risk", "Riesgo H2S"), " ", /* @__PURE__ */ React.createElement("b", { style: { color: L.c } }, word)), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 12.5, color: "var(--sg-mid,#5A5A5A)", lineHeight: 1.35, marginTop: 4 } }, oneLine)),
    /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { flex: "0 0 auto", color: "var(--sg-mid,#999)", transform: open ? "rotate(180deg)" : "none", transition: "transform .35s cubic-bezier(.22,1,.36,1)" } }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 16 16" }, /* @__PURE__ */ React.createElement("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })))
  ), /* @__PURE__ */ React.createElement("div", { ref: panelRef, role: "region", "aria-label": _t(lang, "D\xE9tail indice sant\xE9 H2S", "H2S health index detail", "Detalle \xEDndice de salud H2S"), style: { overflow: "hidden", maxHeight: 0, transition: "max-height .5s cubic-bezier(.22,1,.36,1)" } }, /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9, background: "rgba(13,13,13,.03)", border: "1px solid var(--sg-border,rgba(13,13,13,.08))", borderRadius: 16, padding: "16px 15px 14px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#B87A00", marginBottom: 9 } }, _t(lang, "Pourquoi ce niveau", "Why this level", "Por qu\xE9 este nivel")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, why.map((w, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--sg-ink)" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 26px", height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(13,13,13,.04)", border: "1px solid var(--sg-border,rgba(13,13,13,.08))" } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 14 14" }, iconPath(w.ic))), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", { style: { fontWeight: 700 } }, w.main), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 11, color: "var(--sg-mid,#888)", marginTop: 1 } }, w.meta))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 15, borderTop: "1px solid var(--sg-border,rgba(13,13,13,.08))", paddingTop: 13 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#B87A00", marginBottom: 8 } }, adviceLbl), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 9 } }, tips.map((tp, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.4, color: "var(--sg-ink)" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 auto", marginTop: 6, width: 7, height: 7, borderRadius: 4, background: L.c } }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#1A2B26", background: "#FFC72C", borderRadius: 6, padding: "1px 6px", marginRight: 6, verticalAlign: 1 } }, tp.who), tp.t))))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: (e) => {
        e.stopPropagation();
        onPremiumClick && onPremiumClick("h2s_health_alert");
      },
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        marginTop: 15,
        cursor: "pointer",
        textAlign: "left",
        border: 0,
        fontFamily: "inherit",
        color: "#1a1300",
        background: "linear-gradient(158deg,#FFE47A 0%,#FFC72C 42%,#E89400 100%)",
        boxShadow: "0 8px 24px rgba(232,148,0,.34),inset 0 1px 0 rgba(255,255,255,.55)",
        borderRadius: 14,
        padding: "12px 15px"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { flex: "1 1 auto" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 14, fontWeight: 800, lineHeight: 1.15 } }, ctaK), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 11.5, fontWeight: 600, opacity: 0.8, marginTop: 1 } }, _t(lang, "Alerte sant\xE9 Premium \u2014 la veille, sur TA plage", "Premium health alert \u2014 the day before, on YOUR beach", "Alerta de salud Premium \u2014 la v\xEDspera, en TU playa"))),
    /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 auto", fontWeight: 800, fontSize: 18 } }, "\u2192")
  ), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 13, fontSize: 11, lineHeight: 1.45, color: "var(--sg-mid,#888)", borderLeft: "3px solid rgba(232,168,0,.4)", padding: "2px 0 2px 11px" } }, _t(
    lang,
    "Indice de risque calcul\xE9 \xE0 partir de la sargasse accumul\xE9e et de sa d\xE9composition (demi-vie 3,5 j) \u2014 ce n'est pas une mesure de gaz. Aucun capteur H2S sur place ; suis toujours les consignes des autorit\xE9s sanitaires (HCSP/ARS).",
    "Risk index derived from accumulated seaweed and its decomposition (3.5-day half-life) \u2014 this is not a gas measurement. No on-site H2S sensor; always follow public-health guidance.",
    "\xCDndice de riesgo derivado del sargazo acumulado y su descomposici\xF3n (vida media 3,5 d) \u2014 no es una medici\xF3n de gas. Sin sensor de H2S en sitio; sigue siempre las indicaciones sanitarias."
  )))));
}
const COMIC = {
  // Palette alignée BIBLE v1 (22/06) : trio statut EXCLUSIF + encre/mid/teal/or de marque.
  // Pirates purgées → clean #27c46b→#22C55E · moderate orange→ambre #B87A00 (R3 : jamais l'or
  // sur un statut) · avoid #e8322a→corail #E8522A · sub #6b6478→mid #5A5A5A · blue→teal #009E8E.
  cream: "#fdf6e3",
  ink: "#0d0b14",
  sub: "#5A5A5A",
  clean: "#22C55E",
  moderate: "#B87A00",
  avoid: "#E8522A",
  loading: "#9a93a8",
  orange: "#B87A00",
  blue: "#009E8E",
  violet: "#5b3a8e",
  warn: "#FF9800",
  sunset: "radial-gradient(120% 75% at 82% 6%, rgba(255,138,77,.55), rgba(255,138,77,0) 50%), linear-gradient(168deg,#ff8a4d 0%,#8a4a8e 26%,#3e2470 58%,#1a1140 100%)",
  gold: "linear-gradient(180deg,#FFE47A,#FFC72C)"
};
function comicStatusColor(st) {
  return st === "clean" ? COMIC.clean : st === "moderate" ? COMIC.moderate : st === "avoid" ? COMIC.avoid : COMIC.loading;
}
function ComicStatusGlyph({ status, size = 12, color = "#fff" }) {
  const s2 = size, c = size / 2;
  if (status === "clean") return /* @__PURE__ */ React.createElement("svg", { width: s2, height: s2, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "3.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M5 13l4 4L19 7" }));
  if (status === "avoid") return /* @__PURE__ */ React.createElement("svg", { width: s2, height: s2, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "3.4", strokeLinecap: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6 6 18" }));
  if (status === "moderate") return /* @__PURE__ */ React.createElement("svg", { width: s2, height: s2, viewBox: "0 0 24 24", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: color, strokeWidth: "2.6" }), /* @__PURE__ */ React.createElement("path", { d: "M12 3a9 9 0 0 0 0 18z", fill: color }));
  return /* @__PURE__ */ React.createElement("svg", { width: s2, height: s2, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "2.6", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9" }));
}
function comicVerdict(status, lang, daypart) {
  const when = { fr: { matin: "ce matin", aprem: "cet apr\xE8s-midi", soir: "ce soir" }, en: { matin: "this morning", aprem: "this afternoon", soir: "tonight" }, es: { matin: "esta ma\xF1ana", aprem: "esta tarde", soir: "esta noche" } };
  const w = (when[lang] || when.fr)[daypart] || (when[lang] || when.fr).matin;
  if (status === "clean") return { big: _t(lang, "Baignade OK", "Safe to swim", "Ba\xF1o OK"), when: w, hl: _t(lang, "OK", "OK", "OK") };
  if (status === "moderate") return { big: _t(lang, "\xC0 v\xE9rifier", "Check first", "A verificar"), when: w, hl: _t(lang, "PRUDENCE", "CAREFUL", "CUIDADO") };
  if (status === "avoid") return { big: _t(lang, "\xC9vite l'eau", "Skip the swim", "Evita el agua"), when: w, hl: _t(lang, "ALERTE", "ALERT", "ALERTA") };
  return { big: _t(lang, "Le Veilleur scanne", "Scanning", "Escaneando"), when: w, hl: "\u2026" };
}
function BeachSheetComic({ beach, onClose, favorites, onToggleFav, lang, allBeaches, onBeachClick, onPremiumClick, isPremium, sargData, userPos, forecast: forecastProp, track: trackProp, communityReports = {}, onRequestGeo, onEnsureAlerts }) {
  const trk = (n, p) => {
    try {
      (trackProp || track)(n, p);
    } catch (_) {
    }
  };
  const weather = useWeather(beach);
  const sheetRef = useRef(null), backdropRef = useRef(null), startY = useRef(0), dragY = useRef(0), closingRef = useRef(false);
  const [showProof, setShowProof] = useState(false);
  const [terrainEvents, setTerrainEvents] = useState(null);
  useEffect(() => {
    if (!DESCENTE_ENABLED || !beach || !beach.id) {
      setTerrainEvents(null);
      return;
    }
    let alive = true;
    fetchApprovedReports(beach.id).then((list) => {
      if (alive) setTerrainEvents(list || []);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [beach && beach.id]);
  const forecast = useMemo(() => {
    if (forecastProp && forecastProp.length) return forecastProp;
    if (!beach) return null;
    const sargId = IS_NEW_REGION ? beach.id : BEACH_TO_SARG[beach.id];
    let w = sargId && sargData?.weekly?.[sargId] || sargData?._enrichedWeekly?.[`_interp_${beach.id}`] || null;
    let fc = w?.forecast || null;
    if (!fc) fc = generateForecast(beach?.afai, lang);
    return fc;
  }, [beach?.id, sargData, forecastProp, lang]);
  const _satStatus = beach?.status || "_loading";
  const _terrainStatus = terrainDisplayStatus(beach?.status, terrainEvents);
  const status = _terrainStatus || _satStatus;
  const sc = comicStatusColor(status);
  const hasScore = typeof beach?.score === "number";
  const daypart = (() => {
    try {
      const h = (/* @__PURE__ */ new Date()).getHours();
      return h < 12 ? "matin" : h < 18 ? "aprem" : "soir";
    } catch (_) {
      return "matin";
    }
  })();
  const V = comicVerdict(status, lang, daypart);
  const [scoreAnim, setScoreAnim] = useState(0);
  useEffect(() => {
    if (typeof beach?.score !== "number") {
      setScoreAnim(0);
      return;
    }
    let reduce = false;
    try {
      reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    } catch (_) {
    }
    const target = beach.score;
    if (reduce) {
      setScoreAnim(target);
      return;
    }
    let raf, start = null;
    const tick = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / 620);
      const e = 1 - Math.pow(1 - p, 3);
      setScoreAnim(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      try {
        cancelAnimationFrame(raf);
      } catch (_) {
      }
    };
  }, [beach?.id, beach?.score]);
  const satAge = (() => {
    try {
      const ts = sargData?.erddapTimestamp || sargData?.updatedAt;
      if (!ts) return null;
      const h = (Date.now() - new Date(ts).getTime()) / 36e5;
      return h >= 0 && h < 240 ? h : null;
    } catch (_) {
      return null;
    }
  })();
  const satLabel = satAge == null ? _t(lang, "Satellite r\xE9cent", "Recent satellite", "Sat\xE9lite reciente") : satAge < 1 ? _t(lang, "Satellite il y a <1 h", "Satellite <1h ago", "Sat\xE9lite hace <1 h") : _t(lang, `Satellite il y a ${Math.round(satAge)} h`, `Satellite ${Math.round(satAge)}h ago`, `Sat\xE9lite hace ${Math.round(satAge)} h`);
  const distKm = (() => {
    try {
      if (!userPos || !beach) return null;
      return haversine(userPos.lat, userPos.lng, beach.lat, beach.lng);
    } catch (_) {
      return null;
    }
  })();
  const locLine = [beach?.commune || null, distKm != null ? _t(lang, `\xE0 ${Math.round(distKm)} km`, `${Math.round(distKm)} km away`, `a ${Math.round(distKm)} km`) : null].filter(Boolean).join(" \xB7 ");
  const chips = useMemo(() => {
    const out = [];
    const sgLvl = status === "clean" ? { t: _t(lang, "Sargasses faibles", "Low sargassum", "Sargazo bajo"), c: COMIC.clean } : status === "moderate" ? { t: _t(lang, "Sargasses mod\xE9r\xE9es", "Moderate sargassum", "Sargazo moderado"), c: COMIC.orange } : status === "avoid" ? { t: _t(lang, "Sargasses fortes", "Heavy sargassum", "Sargazo fuerte"), c: COMIC.orange } : null;
    if (sgLvl) out.push(sgLvl);
    if (weather) {
      if (weather.waveHeight != null) {
        const w = weather.waveHeight;
        out.push({ t: w < 0.6 ? _t(lang, "Houle calme", "Calm swell", "Mar calmo") : w < 1.2 ? _t(lang, "Houle mod\xE9r\xE9e", "Moderate swell", "Mar moderado") : _t(lang, "Houle forte", "Strong swell", "Mar fuerte"), c: w < 0.6 ? COMIC.clean : COMIC.orange });
      }
      if (weather.wind != null) {
        const v = weather.wind;
        out.push({ t: v < 20 ? _t(lang, "Vent l\xE9ger", "Light wind", "Viento leve") : v < 35 ? _t(lang, "Vent mod\xE9r\xE9", "Moderate wind", "Viento moderado") : _t(lang, "Vent fort", "Strong wind", "Viento fuerte"), c: v < 20 ? COMIC.clean : COMIC.orange });
      }
      if (weather.temp != null) out.push({ t: _t(lang, `Eau ${weather.temp}\xB0`, `Water ${weather.temp}\xB0`, `Agua ${weather.temp}\xB0`), c: COMIC.blue });
    }
    return out.slice(0, 4);
  }, [status, weather, lang]);
  const planB = useMemo(() => {
    if (!beach || !allBeaches || status === "clean" || status === "_loading") return [];
    return allBeaches.filter((b) => b.id !== beach.id && b.island === beach.island && b.status === "clean").map((b) => ({ ...b, _d: haversine(beach.lat, beach.lng, b.lat, b.lng) })).filter((b) => b._d <= 60).sort((a, b) => a._d - b._d).slice(0, 3);
  }, [beach?.id, allBeaches, status]);
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      sheetRef.current && (sheetRef.current.style.transition = "transform .26s cubic-bezier(.4,0,1,1)", sheetRef.current.style.transform = "translateY(102%)");
      backdropRef.current && (backdropRef.current.style.transition = "opacity .26s ease", backdropRef.current.style.opacity = "0");
    } catch (_) {
    }
    setTimeout(() => {
      closingRef.current = false;
      onClose && onClose();
    }, 250);
  };
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const _swBlock = () => {
    const a = typeof document !== "undefined" && document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    dragY.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "";
  };
  const onTouchMove = (e) => {
    if (_swBlock()) return;
    if (sheetRef.current && sheetRef.current.scrollTop > 5) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) return;
    dragY.current = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    if (_swBlock()) {
      if (sheetRef.current) sheetRef.current.style.transform = "";
      return;
    }
    if (sheetRef.current && sheetRef.current.scrollTop > 5) {
      sheetRef.current.style.transform = "";
      return;
    }
    const dy = dragY.current;
    const thr = Math.max(90, (window.innerHeight || 700) * 0.1);
    if (dy > thr) return requestClose();
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)";
      sheetRef.current.style.transform = "";
      setTimeout(() => {
        if (sheetRef.current) sheetRef.current.style.transition = "";
      }, 300);
    }
  };
  if (!beach) return null;
  const isFav = favorites && favorites.includes(beach.id);
  const fcDays = (forecast || []).slice(0, 7);
  if (!isPremium && fcDays.length > 0 && fcDays.length < 7) {
    const _DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const _realLen = fcDays.length;
    const _last = fcDays[_realLen - 1];
    const _ld = _last && _last.date ? _last.date : null;
    for (let i = _realLen; i < 7; i++) {
      let day = null;
      if (_ld) {
        const dd = /* @__PURE__ */ new Date(_ld + "T00:00:00Z");
        dd.setUTCDate(dd.getUTCDate() + (i - (_realLen - 1)));
        day = _DOW[dd.getUTCDay()];
      }
      fcDays.push({ day, status: "_loading", afai: null, _ph: true });
    }
  }
  const socialN = 200;
  const ctaLabel = isPremium ? _t(lang, "Voir mes alertes", "My alerts", "Mis alertas") : _t(lang, "D\xE9bloquer 7 jours", "Unlock 7 days", "Desbloquear 7 d\xEDas");
  const onCTA = () => {
    trk("sg_beach_cta", { beach_id: beach.id, status, premium: !!isPremium });
    if (isPremium) {
      try {
        onEnsureAlerts && onEnsureAlerts();
      } catch (_) {
      }
      ;
      onClose && onClose();
    } else {
      onPremiumClick && onPremiumClick("beach_sheet");
    }
  };
  const deskFitOn = (() => {
    try {
      return !/[?&]deskfit=0/.test(window.location.search);
    } catch (_) {
      return true;
    }
  })();
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("style", null, `
        @keyframes bscUp{from{transform:translateY(102%)}to{transform:translateY(0)}}
        @keyframes bscFade{from{opacity:0}to{opacity:1}}
        @keyframes bscPop{0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes bscChip{0%{transform:scale(.55) translateY(8px);opacity:0}65%{transform:scale(1.08) translateY(0)}100%{transform:scale(1);opacity:1}}
        @keyframes bscBar{0%{transform:scaleY(.05);opacity:0}70%{transform:scaleY(1.12)}100%{transform:scaleY(1);opacity:1}}
        @keyframes bscRow{0%{transform:translateX(-14px);opacity:0}100%{transform:translateX(0);opacity:1}}
        .bsc-card{background:#fff;border:3px solid ${COMIC.ink};border-radius:16px;box-shadow:3px 3px 0 ${COMIC.ink}}
        .bsc-chip{font:800 12px/1 'Bricolage Grotesque',sans-serif;color:${COMIC.ink};background:#fff;border:2.5px solid ${COMIC.ink};border-radius:999px;padding:7px 11px;display:inline-flex;align-items:center;gap:6px;animation:bscChip .42s cubic-bezier(.16,1,.3,1) both}
        .bsc-bar{transform-origin:bottom;animation:bscBar .5s cubic-bezier(.16,1,.3,1) both}
        .bsc-row{animation:bscRow .4s cubic-bezier(.16,1,.3,1) both}
        /* Classe SANS \xAB cta \xBB dans le nom : esquive le skin forc\xE9 .theme-comic
           [class*="cta"] qui imposait Anton+letter-spacing sur ce bouton. BIBLE : un
           SEUL Anton/\xE9cran = le nom de plage ; le CTA reste Bricolage 800. */
        .bsc-gobtn{width:100%;text-align:center;font:800 17px/1 'Bricolage Grotesque',sans-serif;padding:16px;border-radius:16px;border:3px solid ${COMIC.ink};box-shadow:3px 3px 0 ${COMIC.ink};background:${COMIC.gold};color:${COMIC.ink};cursor:pointer;transition:transform .08s ease}
        .bsc-gobtn:active{transform:translate(3px,3px);box-shadow:0 0 0 ${COMIC.ink}}
        /* iOS WebKit peint un fond BLANC natif sur tout <button> sans reset \u2192 fini le \xAB blanc chelou \xBB */
        .bsc-sheet button{-webkit-appearance:none;appearance:none;font-family:inherit}
        @media (prefers-reduced-motion:reduce){.bsc-chip,.bsc-bar,.bsc-row{animation:none!important}}
        ${deskFitOn ? `@media (min-width:720px){
        .bsc-fiche{max-width:560px;margin:0 auto;border-left:4px solid ${COMIC.ink};border-right:4px solid ${COMIC.ink}}
        }` : ""}
      `), /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: backdropRef,
      onClick: requestClose,
      style: { position: "fixed", inset: 0, zIndex: "var(--z-backdrop)", background: "rgba(11,7,22,.46)", backdropFilter: "blur(1.5px)", WebkitBackdropFilter: "blur(1.5px)", animation: "bscFade .25s ease both" }
    }
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: sheetRef,
      className: "bsc-sheet bsc-fiche",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": beach?.name || _t(lang, "Fiche plage", "Beach sheet", "Ficha de playa"),
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      style: {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: "var(--z-sheet)",
        maxHeight: "92svh",
        overflowY: "auto",
        overflowX: "hidden",
        background: COMIC.cream,
        backgroundImage: `radial-gradient(${COMIC.ink}0d 1.3px,transparent 1.5px)`,
        backgroundSize: "11px 11px",
        borderTop: `4px solid ${COMIC.ink}`,
        borderRadius: "26px 26px 0 0",
        boxShadow: "0 -12px 44px rgba(0,0,0,.42)",
        padding: "10px 16px calc(20px + env(safe-area-inset-bottom))",
        WebkitOverflowScrolling: "touch",
        animation: "bscUp .42s cubic-bezier(.16,1,.3,1) both",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { width: 44, height: 5, borderRadius: 5, background: COMIC.ink, opacity: 0.32, margin: "2px auto 8px" } }),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: requestClose,
        "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
        style: { position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: "50%", border: `2.5px solid ${COMIC.ink}`, background: "#fff", boxShadow: `2px 2px 0 ${COMIC.ink}`, color: COMIC.ink, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }
      },
      /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.6", strokeLinecap: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6 6 18" }))
    ),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingRight: 34 } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 23, lineHeight: 0.96, color: COMIC.ink, textTransform: "uppercase", letterSpacing: "-.3px", wordBreak: "break-word" } }, beach.name), locLine && /* @__PURE__ */ React.createElement("div", { style: { font: "700 11.5px/1.2 'Bricolage Grotesque'", color: COMIC.sub, marginTop: 4, display: "flex", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "10", r: "2.5" })), locLine, !userPos && beach?.lat && onRequestGeo && /* @__PURE__ */ React.createElement(GeoSoftAsk, { lang, onAsk: onRequestGeo, src: "beach_dive", style: { padding: "2px 8px", fontSize: 11, marginLeft: 2 } }))), /* @__PURE__ */ React.createElement("span", { style: { font: "800 11px/1 'Bricolage Grotesque'", padding: "7px 11px", borderRadius: 999, border: `2.5px solid ${COMIC.ink}`, boxShadow: `2px 2px 0 ${COMIC.ink}`, background: sc, color: status === "avoid" ? "#fff" : COMIC.ink, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement(ComicStatusGlyph, { status, size: 13, color: status === "avoid" ? "#fff" : COMIC.ink }), (ST[status] || ST._loading)[lang === "en" ? "le" : lang === "es" ? "les" : "l"])),
    /* @__PURE__ */ React.createElement("div", { className: status === "avoid" ? "urgency-alert" : "", style: {
      display: "flex",
      alignItems: "center",
      gap: 13,
      padding: "16px 18px",
      margin: "14px 0 12px",
      background: status === "avoid" ? "linear-gradient(135deg, #FF3B30 0%, #C70000 100%)" : sc,
      border: `3px solid ${COMIC.ink}`,
      borderRadius: 18,
      boxShadow: status === "avoid" ? "0 8px 24px rgba(255,59,48,0.4), 4px 4px 0 #8B0000" : `4px 4px 0 ${COMIC.ink}`,
      animation: "bscPop .5s .1s cubic-bezier(.16,1,.3,1) both",
      position: "relative",
      zIndex: 1
    } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { flexShrink: 0, filter: status === "avoid" ? "drop-shadow(0 0 12px rgba(255,255,255,0.5))" : "none" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: hasScore ? moodFromScore(beach.score) : "scan", size: 52 })), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { font: "800 26px/.95 'Bricolage Grotesque'", textTransform: "uppercase", letterSpacing: "-.3px", color: status === "avoid" ? "#fff" : COMIC.ink, textShadow: status === "avoid" ? "0 1px 2px rgba(0,0,0,0.3)" : "none" } }, V.big), /* @__PURE__ */ React.createElement("div", { style: { font: "800 12.5px/1 'Bricolage Grotesque'", color: status === "avoid" ? "rgba(255,255,255,0.95)" : COMIC.ink, opacity: status === "avoid" ? 1 : 0.8, marginTop: 5, textTransform: "uppercase", letterSpacing: ".6px", textShadow: status === "avoid" ? "0 1px 2px rgba(0,0,0,0.3)" : "none" } }, V.when, " \xB7 ", _terrainStatus ? { clean: 0, moderate: 1, avoid: 2 }[_terrainStatus] > { clean: 0, moderate: 1, avoid: 2 }[_satStatus] ? _t(lang, `relev\xE9 sur place \xB7 satellite : ${(ST[_satStatus] || ST._loading).l}`, `raised on-site \xB7 satellite: ${(ST[_satStatus] || ST._loading).le}`, `elevado in situ \xB7 sat\xE9lite: ${(ST[_satStatus] || ST._loading).les}`) : _t(lang, `corrig\xE9 sur place \xB7 satellite : ${(ST[_satStatus] || ST._loading).l}`, `corrected on-site \xB7 satellite: ${(ST[_satStatus] || ST._loading).le}`, `corregido in situ \xB7 sat\xE9lite: ${(ST[_satStatus] || ST._loading).les}`) : beach._satBlind && status === "clean" && !beach._communityOverride ? _t(lang, "estim\xE9 \xB7 pas de lecture directe ici", "estimated \xB7 no direct read here", "estimado \xB7 sin lectura directa aqu\xED") : _t(lang, "mesur\xE9 au satellite", "measured by satellite", "medido por sat\xE9lite")))),
    beach._satBlind && status === "clean" && !beach._communityOverride && !_terrainStatus && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 9, padding: "11px 13px", margin: "0 0 12px", background: COMIC.cream, border: `2.5px solid ${COMIC.ink}`, borderRadius: 14, boxShadow: `3px 3px 0 ${COMIC.ink}` } }, /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: COMIC.blue, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0, marginTop: 1 } }, /* @__PURE__ */ React.createElement("path", { d: "M5 13l-2-2a2.8 2.8 0 0 1 0-4l2-2a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4l-2 2a2.8 2.8 0 0 1-4 0z" }), /* @__PURE__ */ React.createElement("path", { d: "M11 11l4 4M13 7l4 4a2.8 2.8 0 0 1 0 4M9 17a2.8 2.8 0 0 1-4 0" })), /* @__PURE__ */ React.createElement("div", { style: { font: "700 11.5px/1.45 'Bricolage Grotesque'", color: COMIC.ink } }, _t(
      lang,
      "Vu du ciel, rien au large ici. Mais le sargasse d\xE9j\xE0 \xE9chou\xE9 sur le sable ne se voit pas du satellite \u2014 si tu y es, signale-le pour les autres.",
      "From the sky, nothing offshore here. But sargassum already on the sand isn't visible by satellite \u2014 if you're there, report it for others.",
      "Desde el cielo, nada mar adentro aqu\xED. Pero el sargazo ya varado no se ve por sat\xE9lite \u2014 si est\xE1s ah\xED, rep\xF3rtalo para los dem\xE1s."
    ))),
    /* @__PURE__ */ React.createElement("div", { className: "bsc-card elevation-3", style: { display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, #FFFFFF 0%, #FAF9F6 100%)" } }, hasScore && /* @__PURE__ */ React.createElement("div", { style: { flexShrink: 0, textAlign: "center", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { className: status === "clean" ? "score-blob-glow" : "score-blob-pulse", style: {
      "--blob-color": status === "clean" ? "#1EC8B0" : status === "moderate" ? "#FFC72C" : "#FF3B30",
      fontFamily: "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
      fontWeight: 700,
      fontSize: 42,
      lineHeight: 0.85,
      letterSpacing: "-1.5px",
      fontVariantNumeric: "tabular-nums",
      color: status === "clean" ? "#00B086" : status === "moderate" ? "#FF9500" : "#FF3B30",
      transition: "color 0.3s ease"
    } }, scoreAnim, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, color: COMIC.sub, fontWeight: 600 } }, "/100")), /* @__PURE__ */ React.createElement("div", { style: { font: "800 9px/1 'Bricolage Grotesque'", color: COMIC.sub, letterSpacing: ".8px", marginTop: 4, textTransform: "uppercase" } }, _t(lang, "INDICE", "SCORE", "\xCDNDICE"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 7, flex: 1 } }, chips.length ? chips.map((c, i) => /* @__PURE__ */ React.createElement("span", { key: i, className: "bsc-chip ripple", style: { animationDelay: 0.18 + i * 0.07 + "s", cursor: "default" } }, /* @__PURE__ */ React.createElement("i", { style: { width: 8, height: 8, borderRadius: "50%", background: c.c, display: "inline-block", boxShadow: `0 0 6px ${c.c}` } }), c.t)) : /* @__PURE__ */ React.createElement("span", { style: { font: "600 12px/1.4 'Bricolage Grotesque'", color: COMIC.sub } }, _t(lang, "Conditions en cours de lecture\u2026", "Reading conditions\u2026", "Leyendo condiciones\u2026")))),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, font: "700 11.5px/1 'Bricolage Grotesque'", color: COMIC.sub, margin: "0 2px 14px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: COMIC.clean, boxShadow: `0 0 0 3px ${COMIC.clean}33` } }), satLabel, " \xB7 ", _t(lang, "donn\xE9e v\xE9rifi\xE9e", "verified data", "dato verificado")),
    /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 } }, /* @__PURE__ */ React.createElement("div", { style: { font: "800 12px/1 'Bricolage Grotesque'", color: COMIC.ink, letterSpacing: ".3px" } }, _t(lang, "7 PROCHAINS JOURS", "NEXT 7 DAYS", "PR\xD3XIMOS 7 D\xCDAS")), !isPremium && /* @__PURE__ */ React.createElement("span", { style: { font: "800 9.5px/1 'Bricolage Grotesque'", color: COMIC.ink, background: COMIC.gold, border: `2px solid ${COMIC.ink}`, borderRadius: 999, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" })), _t(lang, "PREMIUM", "PREMIUM", "PREMIUM"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, position: "relative" } }, fcDays.map((d, i) => {
      const gated = !isPremium && i > 0;
      return /* @__PURE__ */ React.createElement("div", { key: i, className: i === 0 ? "forecast-card elevation-2" : "forecast-card", style: {
        flex: 1,
        textAlign: "center",
        filter: gated ? "blur(3px)" : "none",
        opacity: gated ? 0.65 : 1,
        padding: "6px 4px",
        borderRadius: 10,
        background: i === 0 ? "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,149,0,0.05) 100%)" : "transparent",
        border: i === 0 ? "2px solid rgba(255,199,44,0.3)" : "2px solid transparent"
      } }, /* @__PURE__ */ React.createElement("div", { className: "bsc-bar", style: {
        height: 36,
        borderRadius: 8,
        border: `2.5px solid ${COMIC.ink}`,
        background: comicStatusColor(d.status),
        animationDelay: 0.32 + i * 0.05 + "s",
        boxShadow: i === 0 ? `0 4px 12px ${comicStatusColor(d.status)}66` : "none"
      } }), /* @__PURE__ */ React.createElement("span", { style: { display: "block", font: "800 9.5px/1 'Bricolage Grotesque'", color: COMIC.sub, marginTop: 5, textTransform: "uppercase", letterSpacing: ".3px" } }, i === 0 ? _t(lang, "Auj", "Now", "Hoy") : fcDay(d, lang)));
    }), !isPremium && fcDays.length > 1 && /* @__PURE__ */ React.createElement("button", { onClick: () => {
      trk("sg_forecast_lock_click", { variant: "bsc", beat: 0 });
      onCTA();
    }, style: { position: "absolute", right: 0, top: 0, bottom: 18, left: "15%", border: "none", background: "transparent", cursor: "pointer" }, "aria-label": _t(lang, "D\xE9bloquer les pr\xE9visions", "Unlock forecast", "Desbloquear pron\xF3stico") }))),
    planB.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bsc-card", style: { padding: "12px 14px", marginBottom: 14, background: COMIC.cream } }, /* @__PURE__ */ React.createElement("div", { style: { font: "800 12px/1 'Bricolage Grotesque'", color: COMIC.ink, marginBottom: 9, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: COMIC.clean, strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 22V12" }), /* @__PURE__ */ React.createElement("path", { d: "M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0" })), _t(lang, "Plut\xF4t y aller maintenant", "Go here instead", "Mejor ve aqu\xED ahora")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } }, planB.map((b, i) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: b.id,
        className: "bsc-row",
        onClick: () => {
          trk("sg_planb_pick", { from: beach.id, to: b.id, rank: i });
          onBeachClick && onBeachClick(b);
        },
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderRadius: 12, border: `2.5px solid ${COMIC.ink}`, background: "#fff", boxShadow: `2px 2px 0 ${COMIC.ink}`, cursor: "pointer", font: "800 13px/1 'Bricolage Grotesque'", color: COMIC.ink, textAlign: "left", animationDelay: 0.1 + i * 0.08 + "s" }
      },
      /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } }, /* @__PURE__ */ React.createElement("i", { style: { width: 9, height: 9, borderRadius: "50%", background: COMIC.clean, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, b.name)),
      /* @__PURE__ */ React.createElement("span", { style: { color: COMIC.sub, font: "700 11px/1 'Bricolage Grotesque'", whiteSpace: "nowrap" } }, Math.round(b._d), " km \u2192")
    )))),
    /* @__PURE__ */ React.createElement(BeachReport, { beach, lang, communityReports }),
    /* @__PURE__ */ React.createElement("div", { style: { position: "sticky", bottom: 0, paddingTop: 8, marginTop: 4, background: `linear-gradient(to top, ${COMIC.cream} 72%, transparent)` } }, /* @__PURE__ */ React.createElement("button", { className: "bsc-gobtn cta-premium ripple", onClick: onCTA, style: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, position: "relative", zIndex: 1 } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z" })), ctaLabel, " \u2192"), !isPremium && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { font: "600 11.5px/1.4 'Bricolage Grotesque'", color: COMIC.sub, textAlign: "center", margin: "9px 8px 0" } }, _t(lang, "Ne d\xE9couvre plus les algues une fois sur place. Sois pr\xE9venu\xB7e la veille.", "Stop discovering the seaweed once you're there. Get warned the day before.", "Deja de descubrir el sargazo al llegar. Te avisamos la v\xEDspera.")), /* @__PURE__ */ React.createElement("div", { style: { font: "700 11px/1.3 'Bricolage Grotesque'", color: COMIC.sub, textAlign: "center", marginTop: 6 } }, "\u2248 ", pricePerDay() || "0,16 \u20AC", " / ", _t(lang, "jour", "day", "d\xEDa"), " \xB7 ", _t(lang, "Pass unique, sans abonnement \xB7 rien \xE0 r\xE9silier", "One-time pass, no subscription \xB7 nothing to cancel", "Pase \xFAnico, sin suscripci\xF3n \xB7 nada que cancelar")), !IS_NEW_REGION && /* @__PURE__ */ React.createElement("div", { style: { font: "800 11px/1.3 'Bricolage Grotesque'", color: COMIC.ink, textAlign: "center", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "#E8A800", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z" })), _t(lang, `Rejoint par ${socialN}+ vacanciers`, `Joined by ${socialN}+ beachgoers`, `${socialN}+ veraneantes ya dentro`))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowProof((v) => !v);
          trk("sg_beach_proof", { beach_id: beach.id, open: !showProof });
        },
        style: { display: "block", margin: "12px auto 0", background: "none", border: "none", color: COMIC.ink, font: "800 12.5px/1 'Bricolage Grotesque'", textDecoration: "underline", cursor: "pointer" }
      },
      _t(lang, "Voir la preuve \xB7 comment on mesure", "See the proof \xB7 how we measure", "Ver la prueba \xB7 c\xF3mo medimos")
    ), showProof && /* @__PURE__ */ React.createElement("div", { style: { font: "600 12px/1.5 'Bricolage Grotesque'", color: COMIC.sub, textAlign: "center", margin: "10px 6px 0" } }, _t(
      lang,
      "Chaque jour, on lit les images satellite Sentinel/MODIS (algues en mer) au large de chaque plage, puis on projette la d\xE9rive sur 7 jours. C'est de la mesure, pas une estimation \xE0 la louche.",
      "Every day we read Sentinel/MODIS satellite imagery (seaweed at sea) offshore of each beach, then project the drift over 7 days. It's measurement, not a rough guess.",
      "Cada d\xEDa leemos im\xE1genes satelitales Sentinel/MODIS (algas en el mar) frente a cada playa, y proyectamos la deriva a 7 d\xEDas. Es medici\xF3n, no una estimaci\xF3n."
    )))
  ));
}
function BeachSheet({ beach, onClose, favorites, onToggleFav, lang, allBeaches, imageMap, onBeachClick, onPremiumClick, isPremium, historyData, sargData, dataSource, userPos, communityReports, fbPosts, onRequestGeo }) {
  const LL = T[lang] || T.fr;
  const weather = useWeather(beach);
  const weeklyData = useMemo(() => {
    if (!beach || !sargData) return null;
    const sargId = IS_NEW_REGION ? beach.id : BEACH_TO_SARG[beach.id];
    let w = null;
    if (sargId && sargData.weekly?.[sargId]) w = sargData.weekly[sargId];
    else {
      const interpKey = `_interp_${beach.id}`;
      w = sargData._enrichedWeekly?.[interpKey] || null;
    }
    if (!w) return null;
    const coast = beach.coast || classifyBeachCoast(beach.lat, beach.lng, beach.island);
    if (coast === "sheltered" && w.arrivalDetected) {
      return { ...w, arrivalDetected: false, arrivalStrength: 0 };
    }
    return w;
  }, [beach?.id, sargData]);
  const forecast = useMemo(() => {
    if (!beach) return null;
    let fc = weeklyData?.forecast || null;
    if (!fc) fc = generateForecast(beach.afai, lang);
    if (fc && beach?._communityOverride) {
      const RANK = { clean: 0, moderate: 1, avoid: 2 };
      const STATUS_AFAI = { clean: 0.05, moderate: 0.25, avoid: 0.6 };
      const communityAfai = STATUS_AFAI[beach.status] || 0.05;
      if (RANK[beach.status] > (RANK[fc[0]?.status] || 0)) {
        fc = fc.map((d, i) => {
          const w = Math.max(0, 1 - i * 0.33);
          const blended = Math.round((communityAfai * w + d.afai * (1 - w)) * 100) / 100;
          const st = statusFromAfai(blended);
          return { ...d, afai: blended, status: st, sources: [...d.sources || [], ...i === 0 ? ["community"] : []] };
        });
      }
    }
    return fc;
  }, [beach?.id, beach?.status, beach?._communityOverride, lang, weeklyData]);
  const isFav = favorites.includes(beach?.id);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [photoScanOpen, setPhotoScanOpen] = useState(false);
  const startY = useRef(0);
  const sheetRef = useRef(null);
  const beachStory = false;
  const verdictGuess = false;
  const pwPlanb = false;
  const pwH2s = false;
  const fcUp = false;
  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [beach?.id]);
  const nearby = useMemo(() => {
    if (!beach || !allBeaches) return [];
    const others = allBeaches.filter((b) => b.id !== beach.id && b.island === beach.island).map((b) => ({ ...b, dist: haversine(beach.lat, beach.lng, b.lat, b.lng) }));
    const sameCommune = others.filter((b) => b.commune === beach.commune).sort((a, b) => a.dist - b.dist);
    const diffCommune = others.filter((b) => b.commune !== beach.commune).sort((a, b) => a.dist - b.dist);
    return [...sameCommune, ...diffCommune].slice(0, 3);
  }, [beach?.id, allBeaches]);
  if (!beach) return null;
  const heroPh = (() => {
    try {
      if (HERO_PH_OVERRIDE) return HERO_PH_OVERRIDE;
      const h = (/* @__PURE__ */ new Date()).getHours();
      return h < 5 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "golden" : "night";
    } catch (_) {
      return "day";
    }
  })();
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (sheetRef.current && sheetRef.current.scrollTop > 5) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e) => {
    if (sheetRef.current && sheetRef.current.scrollTop > 5) {
      sheetRef.current.style.transform = "";
      return;
    }
    const dy = (e.changedTouches[0]?.clientY || 0) - startY.current;
    if (dy > 60) requestClose();
    else if (sheetRef.current) {
      sheetRef.current.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)";
      sheetRef.current.style.transform = "";
      setTimeout(() => {
        if (sheetRef.current) sheetRef.current.style.transition = "";
      }, 300);
    }
  };
  const backdropRef = useRef(null);
  const closingRef = useRef(false);
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      sheetRef.current && sheetRef.current.classList.add("sheet-exit");
      backdropRef.current && backdropRef.current.classList.add("backdrop-exit");
    } catch (_) {
    }
    setTimeout(() => {
      closingRef.current = false;
      onClose();
    }, 260);
  };
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  const wazeUrl = `https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "backdrop", ref: backdropRef, onClick: (e) => {
    const x = e.clientX, y = e.clientY;
    try {
      const g2 = document.elementsFromPoint(x, y).map((el) => el.closest && el.closest("[data-beach]")).find(Boolean);
      if (g2) {
        const nb = allBeaches && allBeaches.find((b) => b.id === g2.getAttribute("data-beach"));
        if (nb && nb.id !== beach.id) {
          track("sg_sheet_pin_switch", { via: "archipel" });
          onClose();
          setTimeout(() => onBeachClick && onBeachClick(nb), 50);
          return;
        }
      }
    } catch (_) {
    }
    let pin = null;
    try {
      pin = document.elementsFromPoint(x, y).find((el) => el.classList && el.classList.contains("leaflet-marker-icon"));
    } catch (_) {
    }
    if (pin) {
      track("sg_sheet_pin_switch", {});
      onClose();
      let tries = 0;
      const fire = () => {
        try {
          const el = document.elementFromPoint(x, y);
          const p2 = el && el.closest && el.closest(".leaflet-marker-icon");
          if (p2) {
            p2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
            return;
          }
          if (++tries < 8) requestAnimationFrame(fire);
        } catch (_) {
        }
      };
      requestAnimationFrame(fire);
      return;
    }
    requestClose();
  } }), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "sheet",
      ref: sheetRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": beach?.name || _t(lang, "Fiche plage", "Beach sheet", "Ficha de playa"),
      onTouchStart,
      onTouchMove,
      onTouchEnd
    },
    /* @__PURE__ */ React.createElement("div", { className: "sheet-handle" }),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        role: "button",
        tabIndex: 0,
        "aria-label": _t(lang, "Voir la sc\xE8ne de la plage en grand", "View the beach scene fullscreen", "Ver la escena de la playa en grande"),
        onKeyDown: (e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) {
            e.preventDefault();
            setPhotoScanOpen((v) => !v);
            track("sg_photo_scan", { beach_id: beach.id, open: !photoScanOpen, hero: "vector", via: "keyboard" });
          }
        },
        onClick: (e) => {
          if (!e.target.closest("button")) {
            setPhotoScanOpen((v) => !v);
            track("sg_photo_scan", { beach_id: beach.id, open: !photoScanOpen, hero: "vector", ph: heroPh, status: beach.status });
          }
        },
        style: {
          height: "min(600px, 70svh)",
          background: "#0B2230",
          borderRadius: "0",
          position: "relative",
          overflow: "hidden",
          cursor: "pointer"
        }
      },
      /* @__PURE__ */ React.createElement(BeachScene, { beach, reveal: true }),
      /* @__PURE__ */ React.createElement(BeachHeroVideo, { beachId: beach.id }),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, transparent 30%, transparent 50%, var(--sg-card,#fff) 100%)"
      } }),
      /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: "43%", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: moodFromScore(beach.score), size: 82 })),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "40%",
        background: `radial-gradient(ellipse at 50% 100%, ${(ST[beach.status] || ST._loading).c}22 0%, transparent 70%)`,
        pointerEvents: "none"
      } }),
      /* @__PURE__ */ React.createElement("button", { onClick: requestClose, "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: {
        position: "absolute",
        top: 12,
        right: 12,
        width: 44,
        height: 44,
        borderRadius: 22,
        background: "rgba(0,0,0,.3)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,.15)",
        color: "#fff",
        fontSize: 16,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      } }, "\u2715"),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            onToggleFav(beach.id);
            e.currentTarget.classList.remove("heart-pop");
            void e.currentTarget.offsetWidth;
            e.currentTarget.classList.add("heart-pop");
          },
          "aria-label": isFav ? _t(lang, "Retirer des favoris", "Remove from favourites", "Quitar de favoritos") : _t(lang, "Ajouter aux favoris", "Add to favourites", "Agregar a favoritos"),
          style: {
            position: "absolute",
            top: 12,
            left: 12,
            width: 44,
            height: 44,
            borderRadius: 22,
            background: isFav ? "rgba(232,82,42,.2)" : "rgba(0,0,0,.3)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: isFav ? "1px solid rgba(232,82,42,.4)" : "1px solid rgba(255,255,255,.15)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .3s cubic-bezier(.22,1,.36,1)"
          }
        },
        isFav ? "\u2764\uFE0F" : "\u{1F90D}"
      ),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        bottom: 60,
        left: 20,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px 6px 10px",
        borderRadius: 100,
        background: "rgba(0,0,0,.35)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,.12)"
      } }, /* @__PURE__ */ React.createElement("span", { style: {
        width: 10,
        height: 10,
        borderRadius: 5,
        background: (ST[beach.status] || ST._loading).c,
        boxShadow: `0 0 8px ${(ST[beach.status] || ST._loading).c}`,
        animation: beach.status === "clean" ? "none" : "pulse 2s ease-in-out 2"
      } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: ".01em" } }, lang === "es" ? (ST[beach.status] || ST._loading).les : lang === "en" ? (ST[beach.status] || ST._loading).le : (ST[beach.status] || ST._loading).l)),
      photoScanOpen && /* @__PURE__ */ React.createElement(BeachPhotoScan, { beach, lang }),
      !photoScanOpen && /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        bottom: 14,
        right: 14,
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: 0.55,
        pointerEvents: "none"
      } }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "6", r: "4.5", stroke: "#4ECDC4", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "1.5", x2: "6", y2: "3", stroke: "#4ECDC4", strokeWidth: "1", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "9", x2: "6", y2: "10.5", stroke: "#4ECDC4", strokeWidth: "1", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("line", { x1: "1.5", y1: "6", x2: "3", y2: "6", stroke: "#4ECDC4", strokeWidth: "1", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "6", x2: "10.5", y2: "6", stroke: "#4ECDC4", strokeWidth: "1", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#4ECDC4", fontWeight: 700, letterSpacing: ".08em" } }, lang === "en" ? "SCAN" : lang === "es" ? "ESCANEAR" : "ANALYSER"))
    ),
    /* @__PURE__ */ React.createElement("div", { style: { padding: "0 20px calc(70px + env(safe-area-inset-bottom,12px))" } }, /* @__PURE__ */ React.createElement("h2", { className: "anton", style: {
      fontSize: "clamp(24px,6vw,30px)",
      margin: "0 0 4px",
      lineHeight: 1.15,
      color: "var(--sg-ink)"
    } }, beach.name), /* @__PURE__ */ React.createElement("p", { style: {
      fontSize: 13,
      color: "var(--sg-mid,#5A5A5A)",
      margin: "0 0 12px",
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    } }, /* @__PURE__ */ React.createElement("span", null, beach.commune), typeof beach.drive === "number" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { width: 3, height: 3, borderRadius: 2, background: "var(--sg-mid,#999)", opacity: 0.5 } }), /* @__PURE__ */ React.createElement("span", null, beach.drive, " ", LL.drive)), userPos && beach.lat && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { width: 3, height: 3, borderRadius: 2, background: "var(--sg-mid,#999)", opacity: 0.5 } }), /* @__PURE__ */ React.createElement("span", null, Math.round(haversine(userPos.lat, userPos.lng, beach.lat, beach.lng)), " km")), !userPos && beach.lat && onRequestGeo && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { width: 3, height: 3, borderRadius: 2, background: "var(--sg-mid,#999)", opacity: 0.5 } }), /* @__PURE__ */ React.createElement(
      GeoSoftAsk,
      {
        lang,
        onAsk: onRequestGeo,
        src: "beach_sheet",
        style: { padding: "2px 8px", fontSize: 11.5 }
      }
    ))), pwPlanb && (beach.status === "avoid" || beach.status === "moderate") && /* @__PURE__ */ React.createElement(
      PlanBPanel,
      {
        beach,
        allBeaches,
        userPos,
        lang,
        sargData,
        onBeachClick,
        onClose,
        onRequestGeo
      }
    ), !beachStory && typeof beach.score === "number" && /* @__PURE__ */ React.createElement("div", { style: { position: "relative", margin: "4px 0 14px" } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: {
      position: "absolute",
      inset: -4,
      borderRadius: 22,
      background: `radial-gradient(120% 100% at 0% 0%, ${beach.scoreColor}1f 0%, transparent 60%)`,
      filter: "blur(8px)",
      pointerEvents: "none"
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "14px 16px",
      borderRadius: 18,
      background: "linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.55))",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: `1px solid ${beach.scoreColor}22`,
      boxShadow: `0 14px 34px -16px ${beach.scoreColor}3a, inset 0 1px 0 rgba(255,255,255,.5)`
    } }, /* @__PURE__ */ React.createElement(
      "div",
      {
        role: "button",
        "aria-label": `${beach.score}/100, ${scoreLabelFor(beach.scoreLabel, lang)}. ${_t(lang, "Comprendre ce score", "Understand this score", "Entender este puntaje")}`,
        onClick: () => {
          setScoreOpen((v) => !v);
          track("sg_score_learn", { beach_id: beach.id, open: !scoreOpen });
        },
        style: { position: "relative", width: 84, height: 84, flexShrink: 0, cursor: "pointer" }
      },
      /* @__PURE__ */ React.createElement(ScoreBlob, { score: beach.score, color: beach.scoreColor, size: 84 }),
      /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -14, left: -13, pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: moodFromScore(beach.score), size: 36 })),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: beach.scoreColor,
        color: "#fff",
        fontSize: 10,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.2)"
      } }, scoreOpen ? "\xD7" : "?")
    ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "anton", style: {
      fontSize: 21,
      lineHeight: 1.05,
      color: beach.scoreColor,
      letterSpacing: "-.015em",
      textTransform: "uppercase"
    } }, scoreLabelFor(beach.scoreLabel, lang)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--sg-mid,#5A5A5A)", marginTop: 5, lineHeight: 1.4 } }, beach.scoreReason), (beach.scoreStrengths?.length || 0) + (beach.scoreWeaknesses?.length || 0) > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 } }, (beach.scoreStrengths || []).slice(0, 3).map((s2, i) => /* @__PURE__ */ React.createElement("span", { key: `s${i}`, style: {
      fontSize: 10,
      fontWeight: 700,
      padding: "3px 9px",
      borderRadius: 100,
      background: "rgba(34,197,94,.14)",
      color: "#16A34A",
      whiteSpace: "nowrap",
      letterSpacing: ".01em"
    } }, "\u2713 ", s2)), (beach.scoreWeaknesses || []).slice(0, 2).map((w, i) => /* @__PURE__ */ React.createElement("span", { key: `w${i}`, style: {
      fontSize: 10,
      fontWeight: 700,
      padding: "3px 9px",
      borderRadius: 100,
      background: "rgba(224,120,0,.14)",
      color: "#E07800",
      whiteSpace: "nowrap",
      letterSpacing: ".01em"
    } }, "\u26A0 ", w)))))), scoreOpen && /* @__PURE__ */ React.createElement(ScoreReveal, { beach, lang }), !beachStory && ST[beach.status] && (() => {
      const verdictKey = beach.status === "clean" ? "verdictGo" : beach.status === "moderate" ? "verdictModerate" : beach.status === "avoid" ? "verdictAvoid" : "verdictUnknown";
      const verdictText = LL[verdictKey] || LL.verdictUnknown;
      const verdictColor = ST[beach.status].c;
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { width: 4, height: 24, borderRadius: 2, background: verdictColor, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { className: "anton", style: { fontSize: "clamp(18px,4.6vw,22px)", lineHeight: 1.1, color: verdictColor, letterSpacing: "-.01em", textTransform: "uppercase" } }, verdictText), /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 20, lineHeight: 1, flexShrink: 0 } }, verdictMeta(beach.status, lang).emoji), beach.status === "clean" && __REL && typeof __REL.cleanPct === "number" && /* @__PURE__ */ React.createElement("span", { style: {
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 100,
        background: "rgba(34,197,94,.12)",
        color: "#16A34A",
        border: "1px solid rgba(34,197,94,.25)",
        whiteSpace: "nowrap",
        flexShrink: 0
      } }, "\u2713 ", __REL.cleanPct, "% ", _t(lang, "fiables", "reliable", "fiables")));
    })(), !beachStory && (() => {
      try {
        const ts = sargData?.updatedAt || sargData?.erddapTimestamp;
        if (!ts) return null;
        const h = (Date.now() - new Date(ts).getTime()) / 36e5;
        if (!(h >= 0 && h < 72)) return null;
        const label = h < 1 ? _t(lang, "\xC0 l'instant", "Just now", "Ahora mismo") : h < 12 ? _t(lang, "il y a " + Math.round(h) + " h", Math.round(h) + "h ago", "hace " + Math.round(h) + " h") : _t(lang, "v\xE9rif. en cours", "checking", "verificando");
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, margin: "-10px 0 14px", opacity: 0.72 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11 } }, "\u{1F6F0}\uFE0F"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: "var(--sg-mid,#5A5A5A)", letterSpacing: ".02em" } }, _t(lang, "Satellite", "Satellite", "Sat\xE9lite"), " \xB7 ", label));
      } catch (_) {
        return null;
      }
    })(), (() => {
      try {
        if (!historyData?.changes || !beach?.id) return null;
        const sargId = IS_NEW_REGION ? beach.id : BEACH_TO_SARG[beach.id];
        if (!sargId) return null;
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const recent = historyData.changes.filter((c) => c.beach === sargId && c.date >= today.slice(0, 7)).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!recent) return null;
        const STATUS_EMOJI = { clean: "\u{1F7E2}", moderate: "\u{1F7E1}", avoid: "\u{1F534}" };
        const STATUS_LBL_FR = { clean: "Propre", moderate: "Mod\xE9r\xE9", avoid: "\xC9viter" };
        const STATUS_LBL_EN = { clean: "Clean", moderate: "Moderate", avoid: "Avoid" };
        const STATUS_LBL_ES = { clean: "Limpio", moderate: "Moderado", avoid: "Evitar" };
        const lbl = lang === "en" ? STATUS_LBL_EN : lang === "es" ? STATUS_LBL_ES : STATUS_LBL_FR;
        const isRecent = Date.now() - (/* @__PURE__ */ new Date(recent.date + "T12:00:00Z")).getTime() < 7 * 864e5;
        if (!isRecent) return null;
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "-8px 0 12px", padding: "8px 10px", borderRadius: 10, background: "rgba(255,152,0,.08)", border: "1px solid rgba(255,152,0,.25)", fontSize: 11, fontWeight: 600, color: "#E65100" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, "\u{1F4CA}"), /* @__PURE__ */ React.createElement("span", null, _t(lang, `Chang\xE9 ${recent.date.slice(5)} : ${STATUS_LBL_FR[recent.from]}\u2192${STATUS_LBL_FR[recent.to]}`, `Changed ${recent.date.slice(5)}: ${STATUS_LBL_EN[recent.from]}\u2192${STATUS_LBL_EN[recent.to]}`, `Cambio ${recent.date.slice(5)}: ${STATUS_LBL_ES[recent.from]}\u2192${STATUS_LBL_ES[recent.to]}`)));
      } catch (_) {
        return null;
      }
    })(), verdictGuess && ST[beach.status] && /* @__PURE__ */ React.createElement(VerdictDuJourCard, { beach, lang }), beachStory && forecast && forecast.length >= 2 && /* @__PURE__ */ React.createElement("div", { style: { margin: "6px -20px 0" } }, /* @__PURE__ */ React.createElement(
      PanelStoryEngine,
      {
        beats: beachStoryBeats(beach, forecast, lang),
        scrollRef: sheetRef,
        lang,
        accent: verdictMeta(beach.status, lang).color,
        ev: "sg_beach_beat",
        onCTA: () => {
          track("sg_beach_story_cta", { beach_id: beach.id, status: beach.status });
          onPremiumClick && onPremiumClick("beach_story");
        }
      }
    ), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { height: 56, marginTop: -1, background: "linear-gradient(180deg,#11463E 0%,#C97E3A 42%,#FFE08A 74%,var(--sg-card,#fff) 100%)" } })), /* @__PURE__ */ React.createElement(AfaiChip, { beach, lang }), fcUp && forecast && /* @__PURE__ */ React.createElement(React.Fragment, null, weeklyData?.arrivalDetected && /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 12px", marginBottom: 10, borderRadius: 12, background: "linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))", border: "1px solid rgba(232,143,42,.35)", display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20 } }, "\u26A0"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#b35818" } }, _t(lang, "Banc de sargasses en approche", "Sargassum mat approaching", "Banco de sargazo en camino")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", marginTop: 2 } }, _t(lang, "Le satellite d\xE9tecte un banc d\xE9rivant vers cette plage (1\u20133 jours).", "Satellite shows a mat drifting toward this beach (1\u20133 days).", "El sat\xE9lite detecta un banco derivando hacia esta playa (1\u20133 d\xEDas).")))), /* @__PURE__ */ React.createElement(ForecastChart, { forecast, lang, onPremiumClick, isPremium, weatherDaily: weather?.daily || null, weeklyData })), !isPremium && fcUp && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          track("sg_reliability_open", { from: "beach_badge", hot: true });
          onPremiumClick("rel_hot_cta");
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap: 9,
          margin: "10px 0 2px",
          padding: "9px 12px",
          borderRadius: 12,
          background: "rgba(34,197,94,.10)",
          border: "1px solid rgba(34,197,94,.26)",
          textDecoration: "none",
          cursor: "pointer",
          width: "100%",
          fontFamily: "inherit",
          textAlign: "left"
        }
      },
      /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 15, lineHeight: 1 } }, "\u2705"),
      /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--sg-ink,#13241F)", lineHeight: 1.3 } }, (() => {
        if (__REL && typeof __REL.cleanPct === "number") {
          const reg = __REL.regime === "high" ? _t(lang, "saison haute", "high season", "temporada alta") : _t(lang, "saison calme", "calm season", "temporada tranquila");
          const n = (__REL.cleanN || 0).toLocaleString(lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : "en-US");
          return _t(
            lang,
            `${__REL.cleanPct}% de nos pr\xE9visions \xAB mer propre \xBB v\xE9rifi\xE9es \xB7 ${reg} (${n})`,
            `${__REL.cleanPct}% of our "clean water" forecasts proved correct \xB7 ${reg} (${n})`,
            `${__REL.cleanPct}% de pron\xF3sticos "agua limpia" verificados \xB7 ${reg} (${n})`
          );
        }
        if (__REL && typeof __REL.global === "number") {
          return _t(
            lang,
            `Pr\xE9visions recoup\xE9es au satellite \u2014 ${__REL.global}% justes (30 j)`,
            `Forecasts cross-checked with satellite \u2014 ${__REL.global}% accurate (30 d)`,
            `Pron\xF3sticos contrastados con sat\xE9lite \u2014 ${__REL.global}% exactos (30 d)`
          );
        }
        return _t(lang, "Pr\xE9visions recoup\xE9es au satellite, backtest quotidien", "Forecasts cross-checked with satellite, daily backtest", "Pron\xF3sticos contrastados con sat\xE9lite, backtest diario");
      })()),
      /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 13, fontWeight: 800, color: "#16A34A", flexShrink: 0 } }, "\u2192")
    ), __REL && typeof __REL.falseAlarmPct === "number" && __REL.falseAlarmPct > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, margin: "4px 0 10px", padding: "6px 10px", borderRadius: 8, background: "rgba(255,152,0,.06)", border: "1px solid rgba(255,152,0,.18)", fontSize: 11, fontWeight: 600, color: "#E65100" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12 } }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("span", null, _t(lang, `Taux d'erreur alertes : ${__REL.falseAlarmPct}% (saison ${__REL.regime === "high" ? "haute" : "calme"})`, `Alert false alarm rate: ${__REL.falseAlarmPct}% (${__REL.regime === "high" ? "high" : "calm"} season)`, `Tasa de falsas alarmas: ${__REL.falseAlarmPct}% (temporada ${__REL.regime === "high" ? "alta" : "baja"})`))), !isPremium && (() => {
      const fc = weeklyData?.forecast;
      const RANK = { clean: 0, moderate: 1, avoid: 2 };
      let hit = null;
      if (fc && fc.length >= 2) {
        const today = RANK[fc[0]?.status] ?? RANK[beach.status] ?? 0;
        for (let i = 1; i <= 3 && i < fc.length; i++) {
          const r = RANK[fc[i]?.status];
          if (r != null && r > today) {
            hit = { i, d: fc[i] };
            break;
          }
        }
      }
      const when = hit ? hit.i === 1 ? _t(lang, "demain", "tomorrow", "ma\xF1ana") : (() => {
        try {
          return (/* @__PURE__ */ new Date((hit.d.date || "") + "T12:00:00Z")).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { weekday: "long" });
        } catch (_) {
          return null;
        }
      })() : null;
      if (!hit || !when) return /* @__PURE__ */ React.createElement(AlertCapture, { beach, lang });
      const worse = hit.d.status === "avoid";
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => {
            track("sg_urgency_banner_cta", { beach_id: beach.id, day: hit.i, to: hit.d.status });
            onPremiumClick("urgency_banner");
          },
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            background: worse ? "rgba(232,82,42,.10)" : "rgba(224,120,0,.10)",
            border: `1px solid ${worse ? "rgba(232,82,42,.35)" : "rgba(224,120,0,.35)"}`,
            borderRadius: 14,
            padding: "11px 13px",
            margin: "0 0 14px",
            fontFamily: "inherit"
          }
        },
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, flexShrink: 0 } }, "\u26A0\uFE0F"),
        /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--sg-ink,#1A2B26)", fontWeight: 600 } }, _t(
          lang,
          `Arrivage pr\xE9vu ${when} sur cette plage (satellite). Sois pr\xE9venu si \xE7a change.`,
          `Sargassum forecast to arrive ${when} at this beach (satellite). Get notified if it changes.`,
          `Llegada prevista ${when} en esta playa (sat\xE9lite). Recibe el aviso si cambia.`
        )),
        /* @__PURE__ */ React.createElement("span", { style: { flexShrink: 0, fontSize: 12, fontWeight: 800, color: worse ? "#E8522A" : "#E07800" } }, _t(lang, "Activer l'alerte \u2192", "Set the alert \u2192", "Activar alerta \u2192"))
      );
    })(), ST[beach.status] && /* @__PURE__ */ React.createElement("p", { style: {
      fontSize: 12,
      color: beach._communityOverride ? C.gold : beach.beachMemory ? C.sarg : ST[beach.status].c,
      fontWeight: 500,
      margin: "0 0 12px",
      lineHeight: 1.5,
      padding: "6px 10px",
      background: beach._communityOverride ? C.goldBg : beach.beachMemory ? C.sargBg : ST[beach.status].bg,
      borderRadius: 8
    } }, beach._communityOverride ? _t(
      lang,
      `${beach._communityTotal} visiteurs signalent ce niveau sur place. Les signalements terrain priment sur les donn\xE9es satellite.`,
      `${beach._communityTotal} visitors report this level on site. Community reports take priority over satellite data.`,
      `${beach._communityTotal} visitantes reportan este nivel en el lugar. Los reportes en sitio tienen prioridad sobre los datos satelitales.`
    ) : beach.beachMemory ? _t(
      lang,
      "Le satellite ne d\xE9tecte plus de sargasses au large, mais des \xE9chouages ont eu lieu ces derniers jours. Les algues peuvent persister sur la plage 7 \xE0 14 jours sans ramassage.",
      "Satellite no longer detects sargassum offshore, but beaching occurred in recent days. Algae can persist on the beach for 7 to 14 days without cleanup.",
      "El sat\xE9lite ya no detecta sargazo en alta mar, pero hubo llegadas en los \xFAltimos d\xEDas. Las algas pueden permanecer en la playa de 7 a 14 d\xEDas sin limpieza."
    ) : lang === "es" ? ST[beach.status].descEs : lang === "en" ? ST[beach.status].descEn : ST[beach.status].desc), pwH2s ? /* @__PURE__ */ React.createElement(H2SBadge, { beach, lang, weather, onPremiumClick }) : ST[beach.status]?.h2s && /* @__PURE__ */ React.createElement("div", { style: {
      padding: "10px 14px",
      borderRadius: 12,
      background: C.redBg,
      color: C.red,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 8
    } }, "\u26A0\uFE0F ", LL.h2sWarn), /* @__PURE__ */ React.createElement(InlineEmailCapture, { lang, beachName: beach.name }), !isPremium && !fcUp && forecast && forecast[1] && /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: (e) => {
          e.stopPropagation();
          track("sg_forecast_teaser_click", { beach_id: beach.id, tomorrow: forecast[1].status });
          onPremiumClick("forecast_teaser");
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            track("sg_forecast_teaser_click", { beach_id: beach.id, tomorrow: forecast[1].status });
            onPremiumClick("forecast_teaser");
          }
        },
        role: "button",
        tabIndex: 0,
        style: {
          padding: "14px 16px",
          borderRadius: 16,
          marginBottom: 12,
          cursor: "pointer",
          background: "linear-gradient(135deg,#190c2c,#142824)",
          border: "1px solid rgba(232,168,0,.2)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 4px 20px rgba(0,0,0,.12)",
          transition: "transform .2s",
          position: "relative",
          overflow: "hidden"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        top: "-50%",
        right: "-20%",
        width: "60%",
        height: "200%",
        background: "radial-gradient(ellipse, rgba(232,168,0,.08) 0%, transparent 70%)",
        pointerEvents: "none"
      } }),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.4)",
        textTransform: "uppercase",
        letterSpacing: ".08em",
        marginBottom: 6
      } }, _t(lang, "Pr\xE9vision demain", "Tomorrow forecast", "Pron\xF3stico de ma\xF1ana")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "#fff" } }, beach.name), /* @__PURE__ */ React.createElement("span", { style: {
        filter: "blur(6px)",
        userSelect: "none",
        fontSize: 13,
        fontWeight: 700,
        color: ST[forecast[1].status]?.c || "#999"
      } }, lang === "es" ? ST[forecast[1].status]?.les : lang === "en" ? ST[forecast[1].status]?.le : ST[forecast[1].status]?.l || "?")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 4 } }, NO_TRIAL ? _t(lang, "D\xE9bloquer les 7 jours", "Unlock the 7-day forecast", "Desbloquear los 7 d\xEDas") : _t(lang, "D\xE9bloquer \xB7 7 jours gratuit", "Unlock with free trial", "Desbloquear \xB7 7 d\xEDas gratis"))),
      /* @__PURE__ */ React.createElement("div", { style: {
        width: 44,
        height: 44,
        borderRadius: 12,
        background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        flexShrink: 0,
        boxShadow: "0 2px 12px rgba(232,168,0,.4)"
      } }, "\u{1F513}")
    ), /* @__PURE__ */ React.createElement(BeachReport, { beach, lang, communityReports }), /* @__PURE__ */ React.createElement(FbPostsStrip, { beach, fbPosts, lang }), (beach.kids || beach.snorkel || beach.parking) && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 } }, beach.kids && /* @__PURE__ */ React.createElement(Tag, { icon: "\u{1F476}", label: LL.kids }), beach.snorkel && /* @__PURE__ */ React.createElement(Tag, { icon: "\u{1F93F}", label: LL.snorkel }), beach.parking && /* @__PURE__ */ React.createElement(Tag, { icon: "\u{1F17F}\uFE0F", label: LL.parking })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(
      "a",
      {
        href: wazeUrl,
        target: "_blank",
        rel: "noopener",
        className: "gbtn",
        style: {
          flex: 1,
          textDecoration: "none",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "14px 10px",
          borderRadius: 16,
          background: "#0D0D0D",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16 } }, "\u{1F697}"),
      " ",
      LL.directions
    ), /* @__PURE__ */ React.createElement(
      "a",
      {
        href: _fichePageUrl(beach),
        target: "_blank",
        rel: "noopener",
        style: {
          flex: 1,
          textDecoration: "none",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "14px 10px",
          borderRadius: 16,
          border: "1.5px solid var(--sg-border)",
          background: "var(--sg-card)",
          color: "var(--sg-ink)",
          fontSize: 14,
          fontWeight: 700
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16 } }, "\u{1F4C4}"),
      " ",
      LL.fullSheet
    ), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      track("sg_share", { beach_id: beach.id, method: "card", status: beach.status });
      if (await shareBeachCard(beach, lang, forecast)) return;
      const refCode = isPremium ? localStorage.getItem("sg_referral_code") : "";
      const url = _fichePageUrl(beach) + (refCode ? "?ref=" + refCode : "");
      const isRef = !!refCode;
      const _st = ST[beach.status] || ST._loading;
      const _stl = lang === "es" ? _st.les : lang === "en" ? _st.le : _st.l;
      const _sc = typeof beach.score === "number" ? ` ${beach.score}/100` : "";
      const _txt = _t(
        lang,
        `\u2600\uFE0F ${beach.name} \u2014 ${_stl}${_sc} aujourd'hui. La plage du jour !`,
        `\u2600\uFE0F ${beach.name} \u2014 ${_stl}${_sc} today. Beach of the day!`,
        `\u2600\uFE0F ${beach.name} \u2014 ${_stl}${_sc} hoy. \xA1La playa del d\xEDa!`
      );
      if (navigator.share) {
        track("sg_share", { beach_id: beach.id, method: "native", has_referral: isRef });
        navigator.share({ title: beach.name + " \u2014 Sargasses", text: _txt, url }).catch(() => {
        });
      } else {
        navigator.clipboard?.writeText(`${_txt} ${url}`);
        track("sg_share", { beach_id: beach.id, has_referral: isRef });
      }
    }, style: {
      flex: 0,
      padding: "14px 18px",
      borderRadius: 16,
      border: "1.5px solid var(--sg-border)",
      background: "var(--sg-card)",
      cursor: "pointer",
      fontSize: 18,
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, "\u{1F4E4}")), nearby.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" } }, LL.nearby, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 500, color: "var(--sg-mid,#5A5A5A)" } }, _t(lang, "Compare", "Tap to compare", "Toca para comparar"))), /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      gap: 10,
      overflowX: "auto",
      paddingBottom: 4,
      scrollbarWidth: "none",
      WebkitOverflowScrolling: "touch",
      margin: "0 -20px",
      padding: "0 20px 4px"
    } }, nearby.map((nb) => {
      const nst = ST[nb.status] || ST._loading;
      return /* @__PURE__ */ React.createElement("button", { key: nb.id, onClick: () => {
        track("sg_nearby_click", { from: beach.id, to: nb.id, status: nb.status });
        onBeachClick(nb);
      }, style: {
        flex: "0 0 auto",
        width: 140,
        padding: 0,
        borderRadius: 14,
        border: "1px solid var(--sg-border)",
        overflow: "hidden",
        background: "var(--sg-card,#fff)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        boxShadow: "0 2px 8px rgba(0,0,0,.06)"
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        height: 80,
        background: beachThumbBg(nb),
        position: "relative"
      } }, /* @__PURE__ */ React.createElement("span", { style: {
        position: "absolute",
        top: 6,
        right: 6,
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 100,
        background: nst.bg,
        color: nst.c,
        backdropFilter: "blur(4px)"
      } }, nst.e, " ", lang === "es" ? nst.les : lang === "en" ? nst.le : nst.l)), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px" } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 12,
        fontWeight: 700,
        color: "var(--sg-ink)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, nb.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--sg-mid)", marginTop: 2 } }, Math.round(nb.dist), " km")));
    }))), /* @__PURE__ */ React.createElement(VisitPlan, { beach, lang, allBeaches, weeklyData }), !fcUp && /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 15, fontWeight: 700, marginBottom: 8 } }, LL.forecast), !fcUp && weeklyData?.arrivalDetected && /* @__PURE__ */ React.createElement("div", { style: {
      padding: "10px 12px",
      marginBottom: 10,
      borderRadius: 12,
      background: "linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))",
      border: "1px solid rgba(232,143,42,.35)",
      display: "flex",
      alignItems: "center",
      gap: 10
    } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20 } }, "\u26A0"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#b35818" } }, _t(lang, "Banc de sargasses en approche", "Sargassum mat approaching", "Banco de sargazo en camino")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", marginTop: 2 } }, _t(lang, "Le satellite d\xE9tecte un banc d\xE9rivant vers cette plage (1\u20133 jours).", "Satellite shows a mat drifting toward this beach (1\u20133 days).", "El sat\xE9lite detecta un banco derivando hacia esta playa (1\u20133 d\xEDas).")))), !fcUp && /* @__PURE__ */ React.createElement(
      ForecastChart,
      {
        forecast,
        lang,
        onPremiumClick,
        isPremium,
        weatherDaily: weather?.daily || null,
        weeklyData
      }
    ), (() => {
      const m = weeklyData?.forecastMethod;
      const txt = m === "memory-decay" ? _t(lang, "Donn\xE9es reconstruites (\xE9pisode pass\xE9) \u2014 pr\xE9vision par d\xE9croissance naturelle seulement.", "Reconstructed data (past event) \u2014 forecast from natural decay only.", "Datos reconstruidos (evento pasado) \u2014 pron\xF3stico solo por disipaci\xF3n natural.") : m === "arrival-banks" ? _t(lang, "Banc de sargasses d\xE9tect\xE9 \xE0 proximit\xE9 \u2014 arriv\xE9e possible dans 1-3 jours.", "Sargassum mat detected nearby \u2014 possible arrival within 1-3 days.", "Banco de sargazo detectado cerca \u2014 posible llegada en 1-3 d\xEDas.") : m === "banks-persistence" ? _t(lang, "Persistance + bancs satellite + vent. Fiabilit\xE9 d\xE9croissante apr\xE8s J+3.", "Persistence + satellite mats + wind. Reliability drops after day 3.", "Persistencia + bancos satelitales + viento. La fiabilidad baja despu\xE9s del d\xEDa 3.") : m === "persistence-wind" ? _t(lang, "Persistance + vent Open-Meteo. Pas de banc d\xE9tect\xE9 \xE0 proximit\xE9.", "Persistence + Open-Meteo wind. No mat detected nearby.", "Persistencia + viento de Open-Meteo. Ning\xFAn banco detectado cerca.") : m === "persistence" ? _t(lang, "Persistance simple (demi-vie 3,5 j). Pas de signal externe.", "Simple persistence (3.5-day half-life). No external signal.", "Persistencia simple (vida media de 3,5 d\xEDas). Sin se\xF1al externa.") : m === "interpolated" ? _t(lang, "Interpolation des plages voisines surveill\xE9es.", "Interpolated from monitored nearby beaches.", "Interpolaci\xF3n de las playas vecinas monitoreadas.") : lang === "fr" ? weeklyData?.forecastDisclaimer : null;
      return txt ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--sg-mid,#999)", marginTop: 4, fontStyle: "italic" } }, txt) : null;
    })(), weeklyData && /* @__PURE__ */ React.createElement(ForecastCred, { weeklyData, lang, sargData }), weather && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 15, fontWeight: 700, margin: "20px 0 10px" } }, LL.weather), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement(WeatherCard, { icon: "\u{1F321}\uFE0F", label: LL.temp, value: fmtTemp(weather.temp) }), /* @__PURE__ */ React.createElement(WeatherCard, { icon: "\u{1F4A8}", label: LL.wind, value: fmtWind(weather.wind) }), /* @__PURE__ */ React.createElement(WeatherCard, { icon: "\u2600\uFE0F", label: LL.uv, value: weather.uv })), (() => {
      const cards = [];
      if (weather.waveHeight != null && weather.waveHeight >= 1.5) cards.push(/* @__PURE__ */ React.createElement(WeatherCard, { key: "w", icon: "\u{1F30A}", label: LL.waves, value: fmtHeight(weather.waveHeight) }));
      if (weather.swellHeight != null && weather.swellHeight >= 1.5) cards.push(/* @__PURE__ */ React.createElement(WeatherCard, { key: "s", icon: "\u{1F3C4}", label: LL.swell, value: fmtHeight(weather.swellHeight) }));
      if (weather.precipitation > 0) cards.push(/* @__PURE__ */ React.createElement(WeatherCard, { key: "r", icon: "\u{1F4A7}", label: LL.rain, value: fmtRain(weather.precipitation) }));
      return cards.length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${cards.length},1fr)`, gap: 10, marginTop: 10 } }, cards) : null;
    })()))
  ));
}
function Tag({ icon, label }) {
  return /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 100,
    background: "var(--sg-bgD,#F7F5EF)",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--sg-mid,#5A5A5A)"
  } }, icon, " ", label);
}
function WeatherCard({ icon, label, value }) {
  return /* @__PURE__ */ React.createElement("div", { style: {
    padding: "14px 12px",
    borderRadius: 16,
    background: "var(--sg-bgD,#F7F5EF)",
    textAlign: "center",
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))",
    transition: "transform .2s",
    position: "relative",
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    background: "linear-gradient(180deg,rgba(255,255,255,.5),transparent)",
    borderRadius: "16px 16px 0 0",
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 22, marginBottom: 6, position: "relative" } }, icon), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "var(--sg-ink)", position: "relative", letterSpacing: "-.02em" } }, value), /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 10,
    color: "var(--sg-mid,#5A5A5A)",
    marginTop: 2,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    position: "relative"
  } }, label));
}
function calcBeachScore(afai, weather) {
  const sargScore = Math.max(0, Math.min(10, 10 - afai * (10 / 1)));
  let parts = [{ score: sargScore, weight: 0.4 }];
  let totalWeight = 0.4;
  if (weather) {
    if (weather.wind != null) {
      const w = weather.wind;
      const windScore = w < 15 ? 10 : w <= 25 ? 7 : w <= 35 ? 4 : 1;
      parts.push({ score: windScore, weight: 0.2 });
      totalWeight += 0.2;
    }
    if (weather.uv != null) {
      const u = weather.uv;
      const uvScore = u <= 5 ? 10 : u <= 8 ? 7 : u <= 10 ? 4 : 2;
      parts.push({ score: uvScore, weight: 0.2 });
      totalWeight += 0.2;
    }
    if (weather.waveHeight != null) {
      const v = weather.waveHeight;
      const waveScore = v < 0.5 ? 10 : v <= 1.5 ? 8 : v <= 2.5 ? 5 : 2;
      parts.push({ score: waveScore, weight: 0.2 });
      totalWeight += 0.2;
    }
  }
  const raw = parts.reduce((sum, p) => sum + p.score * (p.weight / totalWeight), 0);
  return Math.round(raw * 10) / 10;
}
function getScoreStyle(score) {
  if (score >= 8) return { color: "#16A34A", bg: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.25)" };
  if (score >= 6) return { color: "#B87A00", bg: "rgba(232,168,0,.10)", border: "rgba(232,168,0,.22)" };
  if (score >= 4) return { color: "#E07800", bg: "rgba(224,120,0,.10)", border: "rgba(224,120,0,.22)" };
  return { color: "#E8522A", bg: "rgba(232,82,42,.10)", border: "rgba(232,82,42,.22)" };
}
function getScoreLabel(score, lang) {
  const LL = T[lang] || T.fr;
  if (score >= 8) return LL.scoreExcellent;
  if (score >= 6) return LL.scoreGood;
  if (score >= 4) return LL.scoreMedium;
  return LL.scoreBad;
}
function BeachScoreBadge({ afai, weather, lang }) {
  const score = calcBeachScore(afai, weather);
  const st = getScoreStyle(score);
  const label = getScoreLabel(score, lang);
  return /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px 8px 8px",
    borderRadius: 16,
    background: st.bg,
    border: `1.5px solid ${st.border}`,
    marginBottom: 12
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: `conic-gradient(${st.color} ${score * 36}deg, rgba(0,0,0,.06) ${score * 36}deg)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "var(--sg-card,#fff)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 18, lineHeight: 1, color: st.color } }, score), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, color: "var(--sg-mid,#5A5A5A)", fontWeight: 600 } }, "/10"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: st.color } }, label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)" } }, (T[lang] || T.fr).beachScore)));
}
function getDayWeatherIcon(precipMm, cloudPct, windKmh) {
  if (windKmh > 30) return "\u{1F4A8}";
  if (precipMm > 2) return "\u{1F327}\uFE0F";
  if (cloudPct > 60) return "\u{1F324}\uFE0F";
  return "\u2600\uFE0F";
}
function HistoryChart({ beachId, historyData, lang }) {
  const LL = T[lang] || T.fr;
  const points = useMemo(() => {
    if (!historyData || !beachId) return [];
    const sargId = IS_NEW_REGION ? beachId : BEACH_TO_SARG[beachId];
    if (!sargId) return [];
    return historyData.map((day) => {
      const entry = day.levels.find((l) => l.id === sargId);
      return entry ? { date: day.date, afai: entry.afai, status: entry.status } : null;
    }).filter(Boolean);
  }, [beachId, historyData]);
  if (!points.length) return null;
  const W = 280, H = 60, PAD = 4;
  const max = Math.max(0.15, ...points.map((p) => p.afai));
  const xStep = (W - PAD * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => ({
    x: PAD + i * xStep,
    y: PAD + (1 - p.afai / max) * (H - PAD * 2),
    afai: p.afai,
    status: p.status,
    date: p.date
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaD = pathD + ` L${coords[coords.length - 1].x.toFixed(1)} ${H - PAD} L${coords[0].x.toFixed(1)} ${H - PAD} Z`;
  const last = coords[coords.length - 1];
  const first = coords[0];
  const lineColor = last.status === "avoid" ? C.red : last.status === "moderate" ? C.stMod : C.stClean;
  const delta = points[points.length - 1].afai - points[0].afai;
  const trend = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "stable";
  const trendIcon = trend === "up" ? "\u2197\uFE0F" : trend === "down" ? "\u2198\uFE0F" : "\u27A1\uFE0F";
  const firstDate = points[0].date.slice(5);
  const lastDate = points[points.length - 1].date.slice(5);
  return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 16 } }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 15, fontWeight: 700, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 } }, LL.history, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13 } }, trendIcon)), /* @__PURE__ */ React.createElement("div", { style: {
    background: "var(--sg-cardS,#FAFAFA)",
    borderRadius: 12,
    padding: "12px 14px",
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))"
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, style: { display: "block" } }, /* @__PURE__ */ React.createElement("rect", { x: 0, y: 0, width: W, height: H * 0.15, fill: "rgba(232,82,42,.04)", rx: 0 }), /* @__PURE__ */ React.createElement("rect", { x: 0, y: H * 0.15, width: W, height: H * 0.25, fill: "rgba(184,122,0,.04)", rx: 0 }), /* @__PURE__ */ React.createElement("rect", { x: 0, y: H * 0.4, width: W, height: H * 0.6, fill: "rgba(34,197,94,.04)", rx: 0 }), /* @__PURE__ */ React.createElement(
    "line",
    {
      x1: 0,
      y1: PAD + (1 - 0.15 / max) * (H - PAD * 2),
      x2: W,
      y2: PAD + (1 - 0.15 / max) * (H - PAD * 2),
      stroke: "rgba(184,122,0,.2)",
      strokeDasharray: "3 3",
      strokeWidth: 0.5
    }
  ), /* @__PURE__ */ React.createElement(
    "line",
    {
      x1: 0,
      y1: PAD + (1 - 0.4 / max) * (H - PAD * 2),
      x2: W,
      y2: PAD + (1 - 0.4 / max) * (H - PAD * 2),
      stroke: "rgba(232,82,42,.2)",
      strokeDasharray: "3 3",
      strokeWidth: 0.5
    }
  ), /* @__PURE__ */ React.createElement("path", { d: areaD, fill: lineColor, opacity: 0.1 }), /* @__PURE__ */ React.createElement("path", { d: pathD, fill: "none", stroke: lineColor, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }), coords.map((c, i) => {
    const dotColor = c.status === "avoid" ? C.red : c.status === "moderate" ? C.stMod : C.stClean;
    return /* @__PURE__ */ React.createElement("circle", { key: i, cx: c.x, cy: c.y, r: i === coords.length - 1 ? 3.5 : 2, fill: dotColor, stroke: "#fff", strokeWidth: 1 });
  })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--sg-mid,#5A5A5A)" } }, firstDate), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--sg-mid,#5A5A5A)", fontWeight: 600 } }, LL.historyDays.replace("{n}", points.length)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--sg-mid,#5A5A5A)" } }, lastDate))));
}
function SearchBar({ value, onChange, lang }) {
  const LL = T[lang] || T.fr;
  const [focused, setFocused] = useState(false);
  const INK = "#0D0D0D", MID = "#5A5A5A", GOLD = "#E8A800";
  return /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", display: "flex", alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      style: {
        position: "absolute",
        left: 14,
        top: "50%",
        transform: "translateY(-50%)",
        color: focused ? GOLD : MID,
        transition: "color .15s",
        flexShrink: 0,
        pointerEvents: "none"
      }
    },
    /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7", stroke: "currentColor", strokeWidth: "2.4" }),
    /* @__PURE__ */ React.createElement("path", { d: "M16.5 16.5 L21 21", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round" })
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "search",
      value,
      onChange: (e) => onChange(e.target.value),
      placeholder: _t(lang, "Chercher une plage\u2026", "Search a beach\u2026", "Buscar una playa\u2026"),
      "aria-label": _t(lang, "Chercher une plage", "Search a beach", "Buscar una playa"),
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      enterKeyHint: "search",
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      style: {
        width: "100%",
        minHeight: 48,
        padding: "13px 14px 13px 42px",
        borderRadius: 12,
        border: `2.5px solid ${INK}`,
        background: "var(--sg-card,#fff)",
        color: `var(--sg-ink,${INK})`,
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 0,
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box",
        boxShadow: focused ? `2px 2px 0 ${INK}, 0 0 0 3px rgba(255,199,44,.20)` : `2px 2px 0 ${INK}`,
        transition: "box-shadow .12s"
      }
    }
  )));
}
function BeachListView({ beaches, onBeachClick, favorites, lang, imageMap, sargData, onPremiumClick, isPremium, userPos, onRequestGeo }) {
  const LL = T[lang] || T.fr;
  const [q, setQ] = useState("");
  const [qFocus, setQFocus] = useState(false);
  const [chip, setChip] = useState(null);
  const [sort, setSort] = useState("best");
  const listFclock = false;
  const filtered = useMemo(() => {
    let r = beaches;
    if (q) {
      const lq = q.toLowerCase();
      r = r.filter((b) => (b.name + " " + b.commune).toLowerCase().includes(lq));
    }
    if (chip === "clean") r = r.filter((b) => b.status === "clean");
    if (chip === "fav") r = r.filter((b) => favorites.includes(b.id));
    if (chip === "avoid") r = r.filter((b) => b.status === "avoid");
    if (sort !== "best") {
      r = r.slice();
      if (sort === "az") {
        r.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), lang || "fr"));
      } else if (sort === "near") {
        const dist = (b) => {
          if (userPos && typeof b.lat === "number" && typeof b.lng === "number") return haversine(userPos.lat, userPos.lng, b.lat, b.lng);
          if (typeof b.drive === "number") return b.drive;
          return Infinity;
        };
        r.sort((a, b) => dist(a) - dist(b));
      }
    }
    return r;
  }, [beaches, q, chip, favorites, sort, userPos, lang]);
  const nClean = filtered.filter((b) => b.status === "clean").length;
  const bestToday = useMemo(() => beaches.filter((b) => b.status === "clean" && typeof b.score === "number").sort((a, bb) => bb.score - a.score)[0] || null, [beaches]);
  const SG = {
    gold: "#E8A800",
    goldL: "#FFC72C",
    goldLL: "#FFE47A",
    teal: "#009E8E",
    tealL: "#1EC8B0",
    clean: "#22C55E",
    moderate: "#B87A00",
    avoid: "#E8522A",
    ink: "#0D0D0D",
    mid: "#5A5A5A"
  };
  const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
  const stColor = (s2) => s2 === "clean" ? SG.clean : s2 === "moderate" ? SG.moderate : s2 === "avoid" ? SG.avoid : SG.mid;
  const StatusForm = ({ status, size = 13 }) => {
    const c = "#0D0D0D";
    if (status === "clean") return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M3.5 8.5 L6.5 11.5 L12.5 4.5", fill: "none", stroke: c, strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }));
    if (status === "moderate") return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "8", r: "6", fill: "none", stroke: "#fff", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 2 A6 6 0 0 1 8 14 Z", fill: "#fff" }));
    return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M4 4 L12 12 M12 4 L4 12", fill: "none", stroke: "#fff", strokeWidth: "2.4", strokeLinecap: "round" }));
  };
  const StatusPill = ({ status, word }) => /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: `2px solid ${SG.ink}`,
    borderRadius: 999,
    padding: "3px 9px",
    fontWeight: 800,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: ".02em",
    boxShadow: `2px 2px 0 ${SG.ink}`,
    whiteSpace: "nowrap",
    background: stColor(status),
    color: status === "clean" ? SG.ink : "#fff"
  } }, /* @__PURE__ */ React.createElement(StatusForm, { status }), word);
  const chips = [
    { id: "clean", label: _t(lang, "Propres", "Clean", "Limpias"), c: SG.clean, fg: SG.ink },
    { id: "fav", label: _t(lang, "Favoris", "Favourites", "Favoritas"), c: SG.teal, fg: "#fff" },
    { id: "avoid", label: _t(lang, "\xC9viter", "Avoid", "Evitar"), c: SG.avoid, fg: "#fff" }
  ];
  const qBase = useMemo(() => {
    if (!q) return beaches;
    const lq = q.toLowerCase();
    return beaches.filter((b) => (b.name + " " + b.commune).toLowerCase().includes(lq));
  }, [beaches, q]);
  const chipCount = (id) => id === "fav" ? qBase.filter((b) => favorites.includes(b.id)).length : qBase.filter((b) => b.status === id).length;
  return /* @__PURE__ */ React.createElement("div", { style: {
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    paddingTop: "calc(var(--sg-header-offset,108px) + env(safe-area-inset-top,0px))",
    paddingBottom: "calc(70px + env(safe-area-inset-bottom,12px))",
    background: "radial-gradient(120% 78% at 72% 0%, rgba(201,126,58,.28), rgba(242,176,94,.08) 42%, transparent 66%), linear-gradient(180deg,#0B2230 0%,#103029 40%,#120821 100%)",
    color: "#fff",
    maxWidth: 600,
    margin: "0 auto"
  } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 20px 8px", display: "flex", alignItems: "baseline", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 26,
    lineHeight: 1,
    letterSpacing: "-.02em",
    color: "var(--sg-ink,#fff)"
  } }, filtered.length), /* @__PURE__ */ React.createElement("span", { style: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    color: "var(--sg-mute,rgba(255,255,255,.6))"
  } }, _t(lang, `plages \xB7 ${nClean} propres`, `beaches \xB7 ${nClean} clean`, `playas \xB7 ${nClean} limpias`))), !q && !chip && bestToday && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => onBeachClick(bestToday),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "calc(100% - 32px)",
        margin: "0 16px 12px",
        padding: 14,
        borderRadius: 16,
        border: `2.5px solid ${SG.ink}`,
        background: "radial-gradient(circle at 1px 1px, rgba(232,168,0,.10) 1.4px, transparent 1.6px) 0 0/7px 7px, linear-gradient(135deg,#15433A,#0E2B25)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        color: "#fff",
        boxShadow: `4px 4px 0 ${SG.ink}`
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: {
      width: 54,
      height: 54,
      flexShrink: 0,
      borderRadius: 12,
      border: `2px solid ${SG.ink}`,
      background: beachThumbBg(bestToday),
      position: "relative",
      overflow: "hidden"
    } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.12)" } })),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".1em",
      textTransform: "uppercase",
      color: "var(--sg-mute,#FFE47A)",
      marginBottom: 3
    } }, _t(lang, "Meilleure aujourd'hui", "Best today", "Mejor hoy")), /* @__PURE__ */ React.createElement("div", { className: "anton", style: {
      fontSize: 20,
      lineHeight: 1.08,
      textTransform: "uppercase",
      color: "var(--sg-ink,#fff)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, bestToday.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--sg-mute,rgba(255,255,255,.92))", marginTop: 3, fontWeight: 600 } }, bestToday.commune, " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { fontFamily: MONO, fontVariantNumeric: "tabular-nums" } }, bestToday.score), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: MONO } }, "/100"))),
    /* @__PURE__ */ React.createElement(StatusPill, { status: "clean", word: _t(lang, "Propre", "Clean", "Limpia") })
  ), /* @__PURE__ */ React.createElement("div", { style: { padding: "0 16px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--sg-card,#fff)",
    borderRadius: 12,
    padding: "0 14px",
    height: 48,
    marginBottom: 12,
    border: `2.5px solid ${SG.ink}`,
    boxShadow: qFocus ? `2px 2px 0 ${SG.ink}, 0 0 0 3px rgba(255,199,44,.20)` : `2px 2px 0 ${SG.ink}`,
    transition: "box-shadow .12s"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", "aria-hidden": "true", style: { flexShrink: 0, transition: "color .15s", color: qFocus ? SG.gold : SG.mid } }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7", fill: "none", stroke: "currentColor", strokeWidth: "2.4" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 16.5 L21 21", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: q,
      onChange: (e) => setQ(e.target.value),
      type: "search",
      onFocus: () => setQFocus(true),
      onBlur: () => setQFocus(false),
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      enterKeyHint: "search",
      placeholder: _t(lang, "Chercher une plage\u2026", "Search a beach\u2026", "Buscar una playa\u2026"),
      "aria-label": _t(lang, "Chercher une plage", "Search a beach", "Buscar una playa"),
      style: { flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, color: "var(--sg-ink," + SG.ink + ")", fontFamily: "inherit", fontWeight: 600, letterSpacing: 0, minWidth: 0 }
    }
  ), q && /* @__PURE__ */ React.createElement("button", { onClick: () => setQ(""), "aria-label": _t(lang, "Effacer", "Clear", "Borrar"), className: "sg-field-clear" }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round" })))), /* @__PURE__ */ React.createElement("style", null, `
          .sg-field-clear{display:flex!important;align-items:center;justify-content:center;width:36px;height:36px;padding:0!important;flex-shrink:0;
            background:none!important;border:none!important;box-shadow:none!important;border-radius:999px!important;color:${SG.mid}!important;cursor:pointer;text-shadow:none!important}
          .sg-fchip{display:inline-flex!important;align-items:center;gap:6px;min-height:36px;font-size:12px;font-weight:800!important;
            text-transform:uppercase;letter-spacing:.02em;padding:6px 12px!important;border-radius:999px!important;
            border:2.5px solid ${SG.ink}!important;box-shadow:2px 2px 0 ${SG.ink}!important;cursor:pointer;font-family:inherit!important;
            white-space:nowrap;background:var(--sg-card,#fff)!important;color:var(--sg-ink,${SG.ink})!important;text-shadow:none!important;transform:none}
          .sg-fchip.is-on{box-shadow:1px 1px 0 ${SG.ink}!important;transform:translate(2px,2px)}
          .sg-fchip.is-on .sg-fchip-ct{color:inherit!important}
          .sg-fchip-clean.is-on{background:${SG.clean}!important;color:${SG.ink}!important}
          .sg-fchip-fav.is-on{background:${SG.teal}!important;color:#fff!important}
          .sg-fchip-avoid.is-on{background:${SG.avoid}!important;color:#fff!important}
          .sg-fchip-ct{font-family:${MONO};font-variant-numeric:tabular-nums;font-weight:700;opacity:.7;color:${SG.mid}}
        `), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, chips.map((ch) => {
    const active = chip === ch.id;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: ch.id,
        onClick: () => setChip(active ? null : ch.id),
        "aria-pressed": active,
        className: `sg-fchip sg-fchip-${ch.id}` + (active ? " is-on" : "")
      },
      ch.label,
      " ",
      /* @__PURE__ */ React.createElement("span", { className: "sg-fchip-ct" }, chipCount(ch.id))
    );
  })), /* @__PURE__ */ React.createElement("style", null, `
          .sg-sortseg{display:inline-flex;border:2px solid ${SG.ink};border-radius:999px;overflow:hidden;max-width:100%;background:var(--sg-card,#fff)}
          .sg-sortseg .sg-sortbtn{appearance:none!important;border:none!important;border-right:2px solid ${SG.ink}!important;border-radius:0!important;
            box-shadow:none!important;cursor:pointer;min-height:38px;padding:0 13px!important;
            font-family:inherit!important;font-weight:800!important;font-size:12px;text-transform:uppercase;letter-spacing:.04em;
            background:var(--sg-card,#fff)!important;color:var(--sg-mute,rgba(255,255,255,.7))!important;
            transition:background .1s,color .1s;white-space:nowrap;text-shadow:none!important}
          .sg-sortseg .sg-sortbtn:last-child{border-right:none!important}
          .sg-sortseg .sg-sortbtn.is-on{background:${SG.ink}!important;color:var(--sg-card,#fff)!important}
        `), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: ".10em",
    textTransform: "uppercase",
    color: "var(--sg-mute,rgba(255,255,255,.6))",
    marginBottom: 7
  } }, _t(lang, "Trier par", "Sort by", "Ordenar por")), /* @__PURE__ */ React.createElement("div", { className: "sg-sortseg", role: "tablist", "aria-label": _t(lang, "Trier les plages", "Sort beaches", "Ordenar playas") }, [
    { id: "best", label: _t(lang, "Meilleures", "Best", "Mejores") },
    { id: "near", label: _t(lang, "Plus proches", "Nearest", "Cercanas") },
    { id: "az", label: _t(lang, "A\u2013Z", "A\u2013Z", "A\u2013Z") }
  ].map((s2, i) => {
    const on = sort === s2.id;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: s2.id,
        role: "tab",
        "aria-selected": on,
        className: "sg-sortbtn" + (on ? " is-on" : ""),
        onClick: () => {
          setSort(s2.id);
          try {
            track("sg_list_sort", { sort: s2.id });
          } catch (_) {
          }
          if (s2.id === "near" && !userPos && onRequestGeo) onRequestGeo("list_near");
        }
      },
      s2.label
    );
  })))), !isPremium && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "sg-cta sg-paygold",
      onClick: () => {
        try {
          track("sg_beach_list_premium_cta");
        } catch (_) {
        }
        ;
        onPremiumClick("beach_list");
      },
      style: {
        margin: "4px 16px 16px",
        border: `2.5px solid ${SG.ink}`,
        borderRadius: 16,
        boxShadow: `6px 6px 0 ${SG.ink}`,
        background: "radial-gradient(circle at 1px 1px, rgba(13,13,13,.10) 1.3px, transparent 1.5px) 0 0/7px 7px, linear-gradient(135deg," + SG.goldL + "," + SG.gold + ")",
        color: SG.ink,
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        textAlign: "left",
        width: "calc(100% - 32px)",
        fontFamily: "inherit"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { width: "42", height: "42", viewBox: "0 0 40 40", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "11", width: "22", height: "15", rx: "6", fill: "#0D0D0D" }), /* @__PURE__ */ React.createElement("rect", { x: "11", y: "13", width: "18", height: "11", rx: "4", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "18", r: "3", fill: "#0D0D0D" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "17.5", r: "1.1", fill: "#FFE47A" }), /* @__PURE__ */ React.createElement("path", { d: "M31 18 L37 15 M31 20 L37 22", stroke: "#0D0D0D", strokeWidth: "2.4", strokeLinecap: "round" })),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: ".10em", color: "#5c4500" } }, _t(lang, "Le Veilleur", "The Watcher", "El Vig\xEDa")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginTop: 2, color: SG.ink } }, _t(lang, "7 jours d'avance \xB7 alerte d\xE8s qu'une plage change", "7 days ahead \xB7 alert the moment a beach changes", "7 d\xEDas de adelanto \xB7 alerta en cuanto cambia una playa"))),
    /* @__PURE__ */ React.createElement("span", { style: {
      flexShrink: 0,
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: SG.ink,
      color: SG.goldL,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      fontWeight: 800
    } }, "\u2192")
  ), filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "sg-empty", style: { padding: "60px 32px" } }, /* @__PURE__ */ React.createElement("div", { className: "sg-empty__veil" }, /* @__PURE__ */ React.createElement(Veilleur, { mood: "serein", size: 64 })), /* @__PURE__ */ React.createElement("div", { className: "sg-empty__title" }, _t(lang, "Aucune plage trouv\xE9e", "No beaches match", "No se encontraron playas")), /* @__PURE__ */ React.createElement("div", { className: "sg-empty__sub" }, _t(lang, "Essaie un autre filtre \u2014 je garde l'\u0153il sur la mer, baie par baie.", "Try another filter \u2014 I'm watching the sea, bay by bay.", "Prueba otro filtro \u2014 vigilo el mar, bah\xEDa por bah\xEDa."))) : /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 16px", display: "flex", flexDirection: "column", gap: 11 } }, filtered.map((b) => {
    const st = ST[b.status] || ST._loading;
    const hasScore = typeof b.score === "number";
    const band = b.status || (hasScore ? b.score >= 70 ? "clean" : b.score >= 40 ? "moderate" : "avoid" : "clean");
    const railC = stColor(band);
    const word = hasScore && scoreLabelFor(b.scoreLabel, lang) || (lang === "es" ? st.les : lang === "en" ? st.le : st.l);
    const isFav = favorites.includes(b.id);
    const sargId = BEACH_TO_SARG?.[b.id];
    const fcDays = listFclock && isFav && !isPremium && sargData ? sargData?.weekly?.[sargId]?.forecast || null : null;
    const colFc = (s2) => stColor(s2);
    const hFc = (s2) => s2 === "clean" ? 20 : s2 === "moderate" ? 28 : 36;
    return /* @__PURE__ */ React.createElement("button", { key: b.id, onClick: () => onBeachClick(b), "data-beach": b.id, style: {
      position: "relative",
      display: "flex",
      flexDirection: fcDays ? "column" : "row",
      alignItems: fcDays ? "stretch" : "center",
      gap: fcDays ? 0 : 13,
      padding: 0,
      borderRadius: 16,
      border: `2.5px solid ${SG.ink}`,
      background: "linear-gradient(180deg,#16322B,#0E2620)",
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      width: "100%",
      color: "#fff",
      boxShadow: isFav && fcDays ? `6px 6px 0 ${SG.ink}` : `4px 4px 0 ${SG.ink}`,
      overflow: "hidden"
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 13, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      background: railC
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      width: 74,
      height: 74,
      flexShrink: 0,
      position: "relative",
      marginLeft: 7,
      borderRadius: 12,
      border: `2px solid ${SG.ink}`,
      background: beachThumbBg(b)
    } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0, padding: "13px 4px 13px 0" } }, /* @__PURE__ */ React.createElement("div", { className: "anton", style: {
      fontSize: 20,
      lineHeight: 1.08,
      letterSpacing: ".005em",
      textTransform: "uppercase",
      color: "var(--sg-ink,#fff)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, isFav ? /* @__PURE__ */ React.createElement("span", { style: { color: SG.teal } }, "\u2665 ") : null, b.name), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 12,
      color: "var(--sg-mute,rgba(255,255,255,.85))",
      marginTop: 3,
      fontWeight: 600,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, b.commune, typeof b.drive === "number" ? /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { fontFamily: MONO, fontVariantNumeric: "tabular-nums" } }, b.drive), ` ${LL.drive}`) : ""), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement(StatusPill, { status: band, word }))), hasScore && /* @__PURE__ */ React.createElement("div", { style: {
      flexShrink: 0,
      padding: "0 16px 0 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: MONO,
      fontVariantNumeric: "tabular-nums",
      fontSize: 28,
      fontWeight: 800,
      lineHeight: 0.95,
      letterSpacing: "-.01em",
      color: railC
    } }, b.score), /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: MONO,
      fontSize: 12,
      fontWeight: 700,
      color: "var(--sg-mute,rgba(255,255,255,.7))",
      letterSpacing: ".02em",
      marginTop: 1
    } }, "/100"))), fcDays && /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: (e) => {
          e.stopPropagation();
          track("sg_list_fclock_click", { beach_id: b.id });
          onPremiumClick("list_forecast_lock");
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            track("sg_list_fclock_click", { beach_id: b.id });
            onPremiumClick("list_forecast_lock");
          }
        },
        role: "button",
        tabIndex: 0,
        style: {
          margin: "0 14px 13px",
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(232,168,0,.10)",
          border: `2px solid ${SG.gold}`,
          cursor: "pointer"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--sg-ink,#FFC72C)" } }, /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 40 40", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "11", width: "22", height: "15", rx: "6", fill: "#0D0D0D" }), /* @__PURE__ */ React.createElement("rect", { x: "11", y: "13", width: "18", height: "11", rx: "4", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("path", { d: "M31 18 L37 15 M31 20 L37 22", stroke: "#0D0D0D", strokeWidth: "3", strokeLinecap: "round" })), _t(lang, "Pr\xE9visions 4 jours", "4-day Forecast", "Pron\xF3stico 4 d\xEDas")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--sg-mute,rgba(255,255,255,.9))", marginTop: 3, fontWeight: 600 } }, _t(lang, "J+2 \xB7 J+3 r\xE9serv\xE9s aux Veilleurs", "J+2 \xB7 J+3 for Watchers", "J+2 \xB7 J+3 para Vig\xEDas"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0 } }, [0, 1].map((i) => {
        const day = fcDays[i];
        const c = colFc(day?.status || b.status);
        const h = hFc(day?.status || b.status);
        return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 22, height: h, borderRadius: 5, border: `2px solid ${SG.ink}`, background: c } }), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.85)", letterSpacing: ".02em" } }, i === 0 ? _t(lang, "AUJ", "TODAY", "HOY") : "J+1"));
      }), ["J+2", "J+3"].map((lbl) => /* @__PURE__ */ React.createElement("div", { key: lbl, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("div", { style: {
        width: 22,
        height: 28,
        borderRadius: 5,
        border: `2px dashed ${SG.goldL}`,
        background: "rgba(255,199,44,.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      } }, /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "9", rx: "2", fill: "none", stroke: SG.goldL, strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11 V8 a4 4 0 0 1 8 0 V11", fill: "none", stroke: SG.goldL, strokeWidth: "2" }))), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: MONO, fontSize: 10, fontWeight: 700, color: SG.goldL, letterSpacing: ".02em" } }, lbl)))))
    ));
  })));
}
function Onboarding({ onDone, island: island2 = "mq", lang = "fr" }) {
  const [step, setStep] = useState(0);
  const isMQ = island2 === "mq";
  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => setStep(1), 6e3);
      return () => clearTimeout(t);
    }
    if (step === 1) {
      const t = setTimeout(() => {
        s("sg_onb", 1);
        onDone();
      }, 8e3);
      return () => clearTimeout(t);
    }
  }, [step, onDone]);
  const dismiss = useCallback(() => {
    track("sg_onb_skip", { from_step: step });
    s("sg_onb", 1);
    onDone();
  }, [onDone, step]);
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: "max(108px, calc(env(safe-area-inset-top,12px) + 100px))",
    left: "max(12px, 3vw)",
    right: "max(12px, 3vw)",
    zIndex: 750,
    pointerEvents: "none",
    maxWidth: 520,
    margin: "0 auto"
  } }, step === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    pointerEvents: "auto",
    background: "rgba(255,255,255,.96)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 18,
    padding: "16px 18px",
    boxShadow: "0 8px 32px rgba(0,0,0,.12),0 0 0 1px rgba(232,168,0,.12)",
    animation: "slideUp .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#22C55E",
    flexShrink: 0,
    animation: "dot-pulse 2s ease-in-out 1 both"
  } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: C.ink } }, /* @__PURE__ */ React.createElement("em", { style: { fontStyle: "normal", color: C.amber, fontWeight: 700 } }, IS_NEW_REGION ? REGION.primaryLang === "es" ? `${REGION.beaches.length} playas` : `${REGION.beaches.length} beaches` : isMQ ? "53 plages" : "83 plages"), " ", _t(lang, "surveill\xE9es en temps r\xE9el", "monitored live", "monitoreadas en vivo"))), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: "clamp(20px,5.5vw,26px)",
    lineHeight: 1,
    textTransform: "uppercase",
    color: C.ink,
    marginBottom: 8
  } }, /* @__PURE__ */ React.createElement("span", { style: { color: C.stClean } }, _t(lang, "Vert", "Green", "Verde")), " = ", _t(lang, "propre", "clean", "limpia"), ".", " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, _t(lang, "Rouge", "Red", "Rojo")), " = ", _t(lang, "sargasses", "sargassum", "sargazo"), "."), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 } }, _t(lang, "Touche une plage sur la carte pour voir son \xE9tat en temps r\xE9el.", "Tap a beach on the map to see real-time conditions.", "Toca una playa en el mapa para ver su estado en tiempo real.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep(1), style: {
    flex: 1,
    padding: "11px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    color: C.ink,
    boxShadow: "0 4px 16px rgba(232,168,0,.3)"
  } }, _t(lang, "Compris", "Got it", "Entendido")))), step === 1 && /* @__PURE__ */ React.createElement("div", { style: {
    pointerEvents: "auto",
    background: "rgba(255,255,255,.92)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: 14,
    padding: "10px 14px",
    boxShadow: "0 4px 16px rgba(0,0,0,.1),0 0 0 1px rgba(0,158,142,.1)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    animation: "slideUp .3s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18 } }, "\u{1F446}"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: C.ink } }, _t(lang, "Touche un ", "Tap a ", "Toca un "), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.green } }, "\u25CF"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.stMod } }, "\u25CF"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, "\u25CF"), " ", _t(lang, "pour voir les d\xE9tails", "to see details", "para ver los detalles")), /* @__PURE__ */ React.createElement("button", { onClick: dismiss, style: {
    background: "none",
    border: "none",
    color: C.mid,
    cursor: "pointer",
    fontSize: 16,
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
    flexShrink: 0
  } }, "\u2715")));
}
const POPULAR_BEACHES = {
  mq: ["mq001", "mq014", "mq011", "mq016", "mq024"],
  gp: ["gp009", "gp012", "gp031", "gp010", "gp005"]
};
function BeachPicker({ island: island2, allBeaches, onSelect, lang, userPos, onDismiss }) {
  const ids = POPULAR_BEACHES[island2] || POPULAR_BEACHES.mq;
  let picks = ids.map((id) => allBeaches.find((b) => b.id === id)).filter(Boolean);
  if (userPos && picks.length) {
    picks = picks.map((b) => ({ ...b, _d: haversine(userPos.lat, userPos.lng, b.lat, b.lng) })).sort((a, b) => a._d - b._d);
  }
  const isMQ = island2 === "mq";
  return /* @__PURE__ */ React.createElement("div", { onClick: (e) => {
    if (e.target === e.currentTarget && onDismiss) onDismiss();
  }, style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 750,
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg,#190c2c 0%,#120821 100%)",
    animation: "fadeIn .3s ease",
    overflowX: "hidden",
    overflowY: "auto"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: "50%",
    background: "radial-gradient(circle,rgba(232,168,0,.12) 0%,transparent 70%)",
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    bottom: 200,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: "50%",
    background: "radial-gradient(circle,rgba(0,158,142,.08) 0%,transparent 70%)",
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { style: { padding: "max(16px,env(safe-area-inset-top)) 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    flexShrink: 0,
    background: "conic-gradient(from -10deg,#FFE898 0deg 25deg,#E8A800 25deg 65deg,#FFD040 65deg 110deg,#B87A00 110deg 155deg,#FFE07A 155deg 195deg,#E09000 195deg 240deg,#FFC72C 240deg 285deg,#B07000 285deg 325deg,#FFE898 325deg 360deg)",
    animation: "spin 20s linear 1 both",
    boxShadow: "0 2px 10px rgba(232,168,0,.35)"
  } }), /* @__PURE__ */ React.createElement("span", { style: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: ".06em",
    color: "#fff",
    fontFamily: "'Anton',sans-serif",
    textTransform: "uppercase"
  } }, IS_NEW_REGION ? `SARGASSUM ${REGION.name.toUpperCase()}` : `SARGASSES.${isMQ ? "MQ" : "GP"}`)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#22C55E",
    animation: "dot-pulse 2s ease-in-out 1 both"
  } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.5)" } }, _t(lang, "En direct", "Live", "En vivo")))), /* @__PURE__ */ React.createElement("div", { style: { padding: "28px 22px 0" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,.4)", marginBottom: 6 } }, _t(lang, "Sargasses ou pas \u2014 sache avant de partir.", "Sargassum or not \u2014 know before you go.", "Sargazo o no \u2014 ent\xE9rate antes de ir.")), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 42,
    lineHeight: 0.9,
    textTransform: "uppercase",
    color: "#fff",
    letterSpacing: "-.02em"
  } }, lang === "es" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "\xBFCu\xE1l es", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: C.tealL } }, "tu"), " playa?") : lang === "en" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "What's ", /* @__PURE__ */ React.createElement("span", { style: { color: C.tealL } }, "your"), /* @__PURE__ */ React.createElement("br", null), "beach?") : /* @__PURE__ */ React.createElement(React.Fragment, null, "Quelle est", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: C.tealL } }, "ta"), " plage ?")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13.5, color: "rgba(255,255,255,.5)", margin: "8px 0 0", lineHeight: 1.5 } }, _t(lang, "On te dit chaque jour si tu peux y aller.", "We'll tell you every day if it's clear.", "Te decimos cada d\xEDa si puedes ir."))), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 22px 0" } }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,158,142,.07)",
    border: "1px solid rgba(0,158,142,.12)",
    borderRadius: 100,
    padding: "5px 12px",
    position: "relative",
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 60,
    background: "linear-gradient(90deg,transparent,rgba(0,158,142,.1),transparent)",
    animation: "satellite-scan 3s ease-in-out 1 both"
  } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, fontWeight: 700, color: C.tealL, position: "relative" } }, "COPERNICUS MARINE"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "rgba(255,255,255,.35)", fontWeight: 500, position: "relative" } }, _t(lang, "Mis \xE0 jour aujourd'hui", "Updated today", "Actualizado hoy")))), /* @__PURE__ */ React.createElement("div", { style: { padding: "16px 22px 0", display: "flex", flexDirection: "column", gap: 7 } }, picks.map((b) => {
    const st = ST[b.status] || ST._loading;
    const isC = b.status === "clean";
    const borderC = !b.status ? "rgba(100,100,100,.15)" : isC ? "rgba(34,197,94,.15)" : b.status === "avoid" ? "rgba(232,82,42,.15)" : "rgba(232,168,0,.15)";
    const badgeBg = !b.status ? "rgba(100,100,100,.1)" : isC ? "rgba(34,197,94,.15)" : b.status === "avoid" ? "rgba(232,82,42,.2)" : "rgba(232,168,0,.15)";
    const badgeColor = !b.status ? "#999" : isC ? "#4ADE80" : b.status === "avoid" ? "#FF8066" : C.goldL;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: b.id,
        onClick: () => {
          track("sg_beach_pick", { beach_id: b.id });
          onSelect(b.id);
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(255,255,255,.05)",
          border: `1px solid ${borderC}`,
          borderRadius: 16,
          padding: "13px 14px",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          width: "100%",
          boxShadow: "0 2px 12px rgba(0,0,0,.15)",
          transition: "all .2s"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: {
        width: 36,
        height: 36,
        borderRadius: 12,
        flexShrink: 0,
        background: isC ? "linear-gradient(135deg,#D6F5EF,#A8EDE4)" : "linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative"
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: st.c,
        border: "2px solid rgba(255,255,255,.8)",
        boxShadow: `0 1px 6px ${st.c}50`,
        position: "relative",
        zIndex: 2
      } }), /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: `2px solid ${st.c}30`,
        animation: "pin-pulse 2.5s ease-out 1 both"
      } })),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "#fff" } }, b.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 6 } }, b.commune, b._d != null ? ` \xB7 ${Math.round(b._d)} km` : "")),
      /* @__PURE__ */ React.createElement("span", { style: {
        fontSize: 10,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 100,
        background: badgeBg,
        color: badgeColor
      } }, lang === "es" ? st.les : lang === "en" ? st.le : st.l)
    );
  })), /* @__PURE__ */ React.createElement("div", { style: {
    padding: "16px 22px max(20px,calc(env(safe-area-inset-bottom,12px) + 12px))",
    textAlign: "center",
    fontSize: 10.5,
    color: "rgba(255,255,255,.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  } }, _t(lang, "Gratuit", "Free", "Gratis"), /* @__PURE__ */ React.createElement("span", { style: { width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,.15)" } }), _t(lang, "Sans inscription", "No signup", "Sin registro"), /* @__PURE__ */ React.createElement("span", { style: { width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,.15)" } }), _t(lang, "Mis \xE0 jour chaque jour", "Updated daily", "Actualizado a diario")));
}
function PushPrimer({ lang, onAccept, onDismiss }) {
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 780,
    paddingTop: "env(safe-area-inset-top, 0px)",
    background: "var(--sg-card,#fff)",
    boxShadow: "0 4px 20px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)",
    animation: "sg-threat-slide .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 10
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 22, flexShrink: 0 } }, "\u{1F514}"), /* @__PURE__ */ React.createElement("div", { style: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--sg-ink,#0D0D0D)",
    lineHeight: 1.3
  } }, _t(lang, "Sois pr\xE9venu si tes plages favorites changent.", "Get notified when your favorite beaches change.", "Ent\xE9rate si tus playas favoritas cambian.")), /* @__PURE__ */ React.createElement("button", { onClick: onAccept, style: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "9px 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
    minHeight: 36
  } }, _t(lang, "Activer", "Activate", "Activar")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onDismiss,
      "aria-label": _t(lang, "Plus tard", "Dismiss", "Ahora no"),
      style: {
        background: "transparent",
        border: "none",
        padding: "8px 4px",
        fontSize: 18,
        color: "var(--sg-mid,#5A5A5A)",
        cursor: "pointer",
        flexShrink: 0,
        minHeight: 36,
        minWidth: 32
      }
    },
    "\u2715"
  )));
}
function windCompass(deg, lang) {
  if (deg == null) return "";
  const dirs = lang === "en" ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] : ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}
function rankBeaches(allBeaches, island2, userPos, sargData, communityReports) {
  if (!allBeaches?.length) return [];
  const islandBeaches = allBeaches.filter((b) => b.island === island2 && b.status && b.status !== "_loading");
  if (!islandBeaches.length) return [];
  const scored = islandBeaches.map((b) => {
    const dist = userPos ? haversine(userPos.lat, userPos.lng, b.lat, b.lng) : null;
    const sargId = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
    const weekly = sargId && sargData?.weekly?.[sargId];
    const enriched = sargData?._enrichedWeekly?.[`_interp_${b.id}`];
    const activeWeekly = weekly || enriched;
    const fc1 = activeWeekly?.forecast?.[1];
    const fc3 = activeWeekly?.forecast?.[3];
    const drift = activeWeekly?.drift || null;
    const arrivalDetected = !!activeWeekly?.arrivalDetected;
    const arrivalStrength = activeWeekly?.arrivalStrength || 0;
    let score = 0;
    if (typeof b.score === "number") score += b.score * 3;
    if (b.status === "clean") score += 100;
    else if (b.status === "moderate") score += 40;
    else score -= 50;
    if (typeof b.afai === "number") score -= b.afai * 60;
    if (fc1) {
      if (fc1.status === "avoid") score -= 35;
      else if (fc1.status === "moderate") score -= 15;
    }
    if (fc3) {
      if (fc3.status === "avoid") score -= 25;
      else if (fc3.status === "moderate") score -= 12;
    }
    if (drift === "up") score -= 20;
    else if (drift === "down") score += 5;
    if (arrivalDetected) score -= Math.round(arrivalStrength * 200);
    const conf = activeWeekly?.forecast?.[0]?.confidence || 60;
    score = score * (0.6 + Math.min(conf, 100) / 250);
    const cReports = communityReports?.[b.id] || communityReports?.[sargId];
    if (cReports && cReports.total >= 3) {
      const avoidPct = cReports.avoid / cReports.total;
      const modPct = cReports.moderate / cReports.total;
      if (avoidPct >= 0.5) score -= 50;
      else if (modPct >= 0.5) score -= 20;
    }
    if (b.beachMemory) score -= 25;
    if (dist != null) score -= Math.min(dist, 50) * 1.2;
    else if (typeof b.drive === "number") score -= Math.min(b.drive, 90) * 0.6;
    if (b.kids) score += 5;
    if (b.parking) score += 3;
    return { ...b, _score: Math.round(score * 10) / 10, _dist: dist, _fc1: fc1, _fc3: fc3, _drift: drift, _conf: conf, _communityReports: cReports, _arrivalDetected: arrivalDetected, _arrivalStrength: arrivalStrength };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored;
}
function HeroReco({ allBeaches, sargData, island: island2, lang, userPos, onBeachClick, communityReports, onPremiumClick }) {
  const sorted = useMemo(
    () => rankBeaches(allBeaches, island2, userPos, sargData, communityReports),
    [allBeaches, island2, userPos, sargData, communityReports]
  );
  const picks = sorted.slice(0, 3);
  const top = picks[0];
  const [animScore, setAnimScore] = useState(0);
  useEffect(() => {
    if (!top || typeof top.score !== "number") {
      setAnimScore(0);
      return;
    }
    let raf, start;
    const target = top.score;
    const dur = 900;
    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimScore(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }, [top?.id, top?.score]);
  const [heroCollapsed, setHeroCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sg_hero_collapsed") !== "0";
    } catch {
      return true;
    }
  });
  const toggleCollapse = (e) => {
    e.stopPropagation();
    setHeroCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sg_hero_collapsed", next ? "1" : "0");
      } catch {
      }
      track(next ? "sg_hero_collapse" : "sg_hero_expand");
      return next;
    });
  };
  const [heroEmail, setHeroEmail] = useState("");
  const [heroEmailSent, setHeroEmailSent] = useState(false);
  const [heroEmailBusy, setHeroEmailBusy] = useState(false);
  const [heroEmailHidden, setHeroEmailHidden] = useState(() => {
    try {
      return !!localStorage.getItem("sg_email") || !!localStorage.getItem("sg_hero_email_dismiss");
    } catch {
      return false;
    }
  });
  const submitHeroEmail = () => {
    if (!heroEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(heroEmail)) return;
    track("sg_hero_email_submit", { beach_id: top?.id, score: top?.score });
    try {
      localStorage.setItem("sg_email", heroEmail);
    } catch {
    }
    try {
      const isl = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ";
      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ email: heroEmail, island: isl, source: "hero_inline", date: (/* @__PURE__ */ new Date()).toISOString() })
      }).catch(() => {
      });
    } catch {
    }
    setHeroEmailSent(true);
  };
  if (!top) return null;
  const topSt = ST[top.status] || ST._loading;
  const alts = picks.slice(1, 3);
  const withScore = sorted.filter((b) => typeof b.score === "number");
  const minScore = withScore.length ? Math.min(...withScore.map((b) => b.score)) : null;
  const maxScore = withScore.length ? Math.max(...withScore.map((b) => b.score)) : null;
  const variance = minScore != null && maxScore != null ? maxScore - minScore : 0;
  const worst = withScore.length >= 5 ? withScore.reduce((m, b) => !m || b.score < m.score ? b : m, null) : null;
  const showWorst = worst && typeof top.score === "number" && top.score - worst.score >= 12;
  const verdict = (() => {
    if (top._arrivalDetected && top.status === "clean") return _t(lang, "Propre \xB7 banc en approche", "Clean \xB7 bank approaching", "Limpia \xB7 banco en camino");
    if (top._fc1 && top._fc1.status && top._fc1.status !== "clean" && top.status === "clean") {
      return _t(lang, `Propre aujourd'hui, ${top._fc1.status === "moderate" ? "mod\xE9r\xE9" : "alerte"} demain`, `Clean today, ${top._fc1.status} tomorrow`, `Limpia hoy, ${top._fc1.status === "moderate" ? "moderado" : "alerta"} ma\xF1ana`);
    }
    if (top.beachMemory) return _t(lang, "M\xE9moire \xE9chouage \u2014 v\xE9rifie", "Recent beaching \u2014 verify", "Llegada reciente \u2014 verifica");
    if (top.status === "clean") return _t(lang, "Propre et stable", "Clean & stable", "Limpia y estable");
    if (top.status === "moderate") return _t(lang, "Mod\xE9r\xE9 \u2014 meilleure option du jour", "Moderate \u2014 best option today", "Moderado \u2014 la mejor opci\xF3n hoy");
    return _t(lang, "Meilleur compromis aujourd'hui", "Best compromise today", "El mejor compromiso hoy");
  })();
  const distLbl = top._dist != null ? top._dist < 1 ? `${Math.round(top._dist * 1e3)} m` : `${Math.round(top._dist)} km` : null;
  const driveLbl = typeof top.drive === "number" ? `${top.drive} min` : null;
  const greet = (() => {
    const h = (/* @__PURE__ */ new Date()).getHours();
    if (h < 12) return _t(lang, "Ce matin", "This morning", "Esta ma\xF1ana");
    if (h < 18) return _t(lang, "Maintenant", "Right now", "Ahora mismo");
    return _t(lang, "Ce soir", "Tonight", "Esta noche");
  })();
  const myPickLead = lang === "en" ? "My pick" : lang === "es" ? "Mi elecci\xF3n" : "Ma reco";
  const strengthsList = (top.scoreStrengths || []).slice(0, 3);
  const dataUpdatedAt = sargData?.erddapTimestamp || sargData?.updatedAt || null;
  const freshLbl = (() => {
    if (!dataUpdatedAt) return null;
    const diffMin = Math.max(0, Math.round((Date.now() - new Date(dataUpdatedAt).getTime()) / 6e4));
    if (diffMin < 60) return _t(lang, `il y a ${diffMin} min`, `${diffMin} min ago`, `hace ${diffMin} min`);
    const h = Math.round(diffMin / 60);
    if (h < 24) return _t(lang, `il y a ${h}h`, `${h}h ago`, `hace ${h}h`);
    return _t(lang, "aujourd'hui", "today", "hoy");
  })();
  const coverageLbl = withScore.length > 0 ? _t(lang, `${withScore.length} plages`, `${withScore.length} beaches`, `${withScore.length} playas`) : null;
  const heroEmailBlock = /* @__PURE__ */ React.createElement(React.Fragment, null, !heroEmailHidden && !heroEmailSent && /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    borderTop: "2px solid #0D0D0D",
    padding: "10px 12px",
    background: "#FFE47A",
    display: "flex",
    alignItems: "center",
    gap: 7
  } }, /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "#0D0D0D", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M3 7l9 6 9-6" })), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      inputMode: "email",
      autoComplete: "email",
      placeholder: _t(lang, "ton@email \u2014 ma reco \xE0 7h", "email \u2014 daily pick at 7am", "tu@email \u2014 tu playa del d\xEDa a las 7"),
      "aria-label": _t(lang, "Ton email pour la reco quotidienne", "Your email for daily pick", "Tu email para la recomendaci\xF3n diaria"),
      value: heroEmail,
      onChange: (e) => setHeroEmail(e.target.value),
      onKeyDown: (e) => {
        if (e.key === "Enter") submitHeroEmail();
      },
      onClick: (e) => e.stopPropagation(),
      style: {
        flex: 1,
        minWidth: 0,
        padding: "8px 10px",
        borderRadius: 9,
        border: "2px solid #0D0D0D",
        fontSize: 16,
        fontFamily: "inherit",
        background: "#fff",
        color: "#0D0D0D",
        outline: "none"
      }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: submitHeroEmail,
      disabled: !heroEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(heroEmail) || heroEmailBusy,
      style: {
        padding: "8px 15px",
        borderRadius: 9,
        border: "2px solid #0D0D0D",
        background: heroEmail && heroEmail.includes("@") ? "linear-gradient(135deg,#FFC72C,#E8A800)" : "rgba(13,13,13,.07)",
        boxShadow: heroEmail && heroEmail.includes("@") ? "2px 2px 0 #0D0D0D" : "none",
        color: heroEmail && heroEmail.includes("@") ? "#0D0D0D" : "rgba(13,13,13,.32)",
        fontSize: 14,
        fontWeight: 800,
        cursor: heroEmail && heroEmail.includes("@") ? "pointer" : "not-allowed",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        flexShrink: 0
      }
    },
    heroEmailBusy ? _t(lang, "Envoi...", "Sending...", "Enviando...") : _t(lang, "Recevoir", "Get it", "Recibir")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          localStorage.setItem("sg_hero_email_dismiss", "1");
        } catch {
        }
        setHeroEmailHidden(true);
        track("sg_hero_email_dismiss");
      },
      "aria-label": _t(lang, "Fermer", "Dismiss", "Cerrar"),
      style: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(13,13,13,.5)",
        padding: "4px 2px",
        fontFamily: "inherit",
        flexShrink: 0,
        display: "flex",
        alignItems: "center"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M5 5l10 10M15 5L5 15" }))
  )), heroEmailSent && /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    borderTop: "2px solid #0D0D0D",
    padding: "10px 14px",
    textAlign: "center",
    background: "rgba(34,197,94,.12)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "#22C55E", strokeWidth: "2.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "#0D0D0D", strokeWidth: "2.2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12.5l2.5 2.5L16 9.5" })), /* @__PURE__ */ React.createElement("span", null, _t(lang, "C'est fait ! Ta reco demain \xE0 7h.", "You're in! First pick tomorrow 7am.", "\xA1Listo! Tu playa del d\xEDa ma\xF1ana a las 7."))), onPremiumClick && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: (e) => {
        e.stopPropagation();
        onPremiumClick("hero_email_success");
      },
      style: {
        marginTop: 6,
        background: "none",
        border: "none",
        color: "var(--sg-mid,#5A5A5A)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        textDecoration: "underline",
        textDecorationColor: "rgba(0,0,0,.2)",
        textUnderlineOffset: 2
      }
    },
    _t(lang, "Alertes en direct aussi ? Voir Premium \u2192", "Want live alerts too? See Premium \u2192", "\xBFQuieres alertas en vivo tambi\xE9n? Ver Premium \u2192")
  )));
  return /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    position: "relative",
    background: "var(--sg-card,#fff)",
    border: `1px solid ${topSt.c}33`,
    borderRadius: 22,
    boxShadow: `0 18px 48px -14px ${topSt.c}38, 0 2px 8px rgba(0,0,0,.05)`,
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    position: "absolute",
    inset: 0,
    background: `radial-gradient(120% 80% at 18% 38%, ${topSt.c}22 0%, ${topSt.c}0d 32%, transparent 62%), linear-gradient(180deg, ${topSt.c}0f 0%, transparent 100%)`,
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    position: "absolute",
    top: -18,
    right: -18,
    width: 120,
    height: 120,
    background: `radial-gradient(closest-side, ${topSt.c}1f 0%, transparent 70%)`,
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "7px 14px 5px",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--sg-mid,#5A5A5A)",
    letterSpacing: ".01em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 11 } }, "\u{1F6F0}"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, color: "#005A9E", letterSpacing: ".02em" } }, "Copernicus ESA"), freshLbl && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { "aria-hidden": true, style: { width: 3, height: 3, borderRadius: "50%", background: "currentColor", opacity: 0.4 } }), /* @__PURE__ */ React.createElement("span", null, _t(lang, `MAJ ${freshLbl}`, `Updated ${freshLbl}`, `Act. ${freshLbl}`))), coverageLbl && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { "aria-hidden": true, style: { width: 3, height: 3, borderRadius: "50%", background: "currentColor", opacity: 0.4 } }), /* @__PURE__ */ React.createElement("span", null, coverageLbl))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: toggleCollapse,
      "aria-label": heroCollapsed ? _t(lang, "D\xE9plier", "Expand", "Expandir") : _t(lang, "R\xE9duire", "Collapse", "Reducir"),
      "aria-expanded": !heroCollapsed,
      style: {
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        padding: "8px 0 4px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit"
      }
    },
    /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
      width: 38,
      height: 4,
      borderRadius: 2,
      background: `rgba(15,42,58,${heroCollapsed ? 0.28 : 0.18})`,
      transition: "background .2s"
    } })
  ), heroCollapsed ? (
    /* Peek mode — compact row + 1-ligne email. Le formulaire principal du
       landing était dans la branche expanded (repliée par défaut) → invisible
       pour 100% des sessions, capture à 0,2%. Ici : 1 ligne discrète,
       dismissable une fois, alignée sur la promesse premium (alertes). */
    /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          track("sg_hero_reco_click", { beach_id: top.id, status: top.status, score: top.score, collapsed: 1 });
          onBeachClick(top);
        },
        style: {
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "2px 14px 14px",
          background: "none",
          border: "none",
          width: "100%",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left"
        }
      },
      typeof top.score === "number" && /* @__PURE__ */ React.createElement("div", { style: {
        position: "relative",
        width: 60,
        height: 60,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        position: "relative",
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: `conic-gradient(${top.scoreColor || topSt.c} ${top.score * 3.6}deg, rgba(0,0,0,.05) ${top.score * 3.6}deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 0 0 1px ${top.scoreColor || topSt.c}33, 0 4px 14px ${topSt.c}44`
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        width: 46,
        height: 46,
        borderRadius: "50%",
        background: "linear-gradient(180deg,#fff 0%, #FDFCF7 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0.85
      } }, /* @__PURE__ */ React.createElement("span", { style: {
        fontFamily: "'Anton',sans-serif",
        fontSize: 26,
        color: top.scoreColor || topSt.c,
        letterSpacing: "-.03em"
      } }, top.score), /* @__PURE__ */ React.createElement("span", { style: {
        fontSize: 7,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "var(--sg-mid,#9a9a9a)",
        textTransform: "uppercase",
        marginTop: 1
      } }, lang === "en" ? "score" : lang === "es" ? "nota" : "note")))),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: "#156a96",
        opacity: 0.85,
        marginBottom: 1
      } }, myPickLead, " \xB7 ", greet), /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: "'Anton',sans-serif",
        fontSize: 18,
        textTransform: "uppercase",
        letterSpacing: "-.015em",
        color: "var(--sg-ink,#0D0D0D)",
        lineHeight: 1.02,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, top.name), /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 11,
        fontWeight: 700,
        color: topSt.c,
        letterSpacing: ".01em",
        marginTop: 3,
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, /* @__PURE__ */ React.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, verdict), distLbl && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { "aria-hidden": true, style: { width: 3, height: 3, borderRadius: "50%", background: "currentColor", opacity: 0.4, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--sg-mid,#5A5A5A)", fontWeight: 600, flexShrink: 0 } }, distLbl)))),
      /* @__PURE__ */ React.createElement("span", { style: {
        fontSize: 12,
        fontWeight: 800,
        color: "#fff",
        flexShrink: 0,
        whiteSpace: "nowrap",
        padding: "10px 18px",
        borderRadius: 100,
        background: "linear-gradient(135deg,#00C2B0 0%,#156a96 100%)",
        boxShadow: "0 6px 18px rgba(0,158,142,.45), inset 0 1px 0 rgba(255,255,255,.35)",
        letterSpacing: ".03em"
      } }, _t(lang, "J'y vais \u2192", "Take me \u2192", "Vamos \u2192"))
    ), heroEmailBlock)
  ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px 0",
    gap: 10
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    color: topSt.c,
    opacity: 0.85
  } }, "\u25CF ", greet), variance >= 12 && /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 9,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 100,
    background: "rgba(255,255,255,.7)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(0,0,0,.05)",
    color: "var(--sg-mid,#5A5A5A)",
    letterSpacing: ".02em",
    whiteSpace: "nowrap"
  } }, withScore.length, " ", _t(lang, "analys\xE9es", "analyzed", "analizadas"), " \xB7 \u0394", variance)), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_hero_reco_click", { beach_id: top.id, status: top.status, score: top.score });
        onBeachClick(top);
      },
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px 16px",
        background: "none",
        border: "none",
        width: "100%",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left"
      }
    },
    typeof top.score === "number" ? /* @__PURE__ */ React.createElement("div", { style: {
      position: "relative",
      width: 112,
      height: 112,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
      position: "absolute",
      inset: -12,
      borderRadius: "50%",
      background: `radial-gradient(closest-side, ${top.scoreColor || topSt.c}33 0%, transparent 70%)`,
      filter: "blur(2px)",
      pointerEvents: "none"
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      position: "relative",
      width: 108,
      height: 108,
      borderRadius: "50%",
      background: `conic-gradient(${top.scoreColor || topSt.c} ${animScore * 3.6}deg, rgba(0,0,0,.055) ${animScore * 3.6}deg)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `inset 0 0 0 1px ${top.scoreColor || topSt.c}22`,
      transition: "background 120ms linear"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: 88,
      height: 88,
      borderRadius: "50%",
      background: "linear-gradient(180deg,#fff 0%, #FDFCF7 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 2px 10px rgba(0,0,0,.08), inset 0 0 0 1px rgba(255,255,255,.9)"
    } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 44, lineHeight: 0.95, color: top.scoreColor || topSt.c, letterSpacing: "-.02em" } }, animScore), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, fontWeight: 800, marginTop: 1, color: "var(--sg-mid,#5A5A5A)", letterSpacing: ".08em" } }, "/100")))) : /* @__PURE__ */ React.createElement("div", { style: {
      width: 112,
      height: 112,
      borderRadius: "50%",
      flexShrink: 0,
      background: topSt.c,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement("div", { style: { width: 16, height: 16, borderRadius: 8, background: "#fff" } })),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: "'Anton',sans-serif",
      fontSize: 22,
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "-.015em",
      color: "var(--sg-ink,#0D0D0D)",
      lineHeight: 1.02,
      marginBottom: 6,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      wordBreak: "break-word"
    } }, top.name), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 12,
      fontWeight: 800,
      color: topSt.c,
      marginBottom: strengthsList.length > 0 ? 6 : 3,
      lineHeight: 1.25,
      letterSpacing: ".005em"
    } }, verdict), strengthsList.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 } }, strengthsList.map((s2, i) => /* @__PURE__ */ React.createElement("span", { key: i, style: {
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 7px",
      borderRadius: 100,
      background: "rgba(34,197,94,.12)",
      color: "#16A34A",
      whiteSpace: "nowrap"
    } }, "\u2713 ", s2))), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 11,
      color: "var(--sg-mid,#5A5A5A)",
      display: "flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
      overflow: "hidden"
    } }, driveLbl && /* @__PURE__ */ React.createElement("span", null, "\u{1F697} ", driveLbl), distLbl && /* @__PURE__ */ React.createElement("span", null, "\xB7 ", distLbl), !distLbl && !driveLbl && top.commune && /* @__PURE__ */ React.createElement("span", null, top.commune))),
    /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 12,
      fontWeight: 800,
      color: "#fff",
      flexShrink: 0,
      whiteSpace: "nowrap",
      padding: "9px 15px",
      borderRadius: 100,
      background: topSt.c,
      boxShadow: `0 2px 8px ${topSt.c}44`,
      letterSpacing: ".02em"
    } }, _t(lang, "Voir \u2192", "Go \u2192", "Ver \u2192"))
  ), showWorst && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_hero_worst_click", { beach_id: worst.id, score: worst.score });
        onBeachClick(worst);
      },
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "11px 14px 11px 12px",
        border: "none",
        borderTop: "1px solid rgba(224,120,0,.2)",
        background: "linear-gradient(90deg, rgba(224,120,0,.14) 0%, rgba(224,120,0,.05) 40%, rgba(224,120,0,.02) 100%)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left"
      }
    },
    /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
      width: 3,
      alignSelf: "stretch",
      borderRadius: 2,
      background: "linear-gradient(180deg, #E07800, #B45309)",
      boxShadow: "0 0 8px rgba(224,120,0,.35)",
      flexShrink: 0
    } }),
    /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 10,
      fontWeight: 800,
      color: "#B45309",
      letterSpacing: ".08em",
      textTransform: "uppercase",
      flexShrink: 0
    } }, _t(lang, "\xC9vite", "Skip", "Evita")),
    /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 12,
      fontWeight: 700,
      color: "#7C3E03",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: 1
    } }, worst.name),
    /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 3,
      padding: "3px 9px 2px",
      borderRadius: 100,
      background: "rgba(255,255,255,.75)",
      border: "1px solid rgba(224,120,0,.3)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
      whiteSpace: "nowrap",
      flexShrink: 0
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: "'Anton',sans-serif",
      fontSize: 14,
      lineHeight: 1,
      letterSpacing: "-.01em",
      color: "#E07800"
    } }, worst.score), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, fontWeight: 800, color: "#B45309", letterSpacing: ".04em" } }, "/100"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "#E07800", marginLeft: 2, letterSpacing: ".02em" } }, "\u2212", top.score - worst.score))
  ), alts.length > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    display: "flex",
    borderTop: "1px solid var(--sg-border,rgba(0,0,0,.06))",
    background: "linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.25))",
    backdropFilter: "blur(4px)"
  } }, alts.map((alt, i) => {
    const aSt = ST[alt.status] || ST._loading;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: alt.id,
        onClick: () => {
          track("sg_hero_alt_click", { beach_id: alt.id, rank: i + 2, status: alt.status });
          onBeachClick(alt);
        },
        style: {
          flex: 1,
          padding: "10px 12px",
          background: "none",
          border: "none",
          borderLeft: i > 0 ? "1px solid var(--sg-border,rgba(0,0,0,.06))" : "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { width: 8, height: 8, borderRadius: 4, background: aSt.c, flexShrink: 0 } }),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 11,
        fontWeight: 700,
        color: "var(--sg-ink,#0D0D0D)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, alt.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--sg-mid,#5A5A5A)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, typeof alt.score === "number" ? `${alt.score}/100` : "", typeof alt.score === "number" && (alt._dist != null || typeof alt.drive === "number" || alt.commune) ? " \xB7 " : "", alt._dist != null ? `${alt._dist < 1 ? Math.round(alt._dist * 1e3) + " m" : Math.round(alt._dist) + " km"}` : typeof alt.drive === "number" ? `${alt.drive} min` : alt.commune || ""))
    );
  })), heroEmailBlock));
}
function DailyRecoStrip({ allBeaches, sargData, island: island2, lang, isPremium, onBeachClick, userPos, onPremiumClick, communityReports }) {
  const [expanded, setExpanded] = useState(false);
  const picks = useMemo(() => {
    if (!allBeaches?.length) return [];
    const islandBeaches = allBeaches.filter((b) => b.island === island2 && b.status && b.status !== "_loading");
    if (!islandBeaches.length) return [];
    const scored = islandBeaches.map((b) => {
      const dist = userPos ? haversine(userPos.lat, userPos.lng, b.lat, b.lng) : null;
      const sargId = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
      const weekly = sargId && sargData?.weekly?.[sargId];
      const enriched = sargData?._enrichedWeekly?.[`_interp_${b.id}`];
      const activeWeekly = weekly || enriched;
      const fc1 = activeWeekly?.forecast?.[1];
      const fc3 = activeWeekly?.forecast?.[3];
      const drift = activeWeekly?.drift || null;
      const arrivalDetected = !!activeWeekly?.arrivalDetected;
      const arrivalStrength = activeWeekly?.arrivalStrength || 0;
      let score = 0;
      if (typeof b.score === "number") score += b.score * 3;
      if (b.status === "clean") score += 100;
      else if (b.status === "moderate") score += 40;
      else score -= 50;
      if (typeof b.afai === "number") score -= b.afai * 60;
      if (fc1) {
        if (fc1.status === "avoid") score -= 35;
        else if (fc1.status === "moderate") score -= 15;
      }
      if (fc3) {
        if (fc3.status === "avoid") score -= 25;
        else if (fc3.status === "moderate") score -= 12;
      }
      if (drift === "up") score -= 20;
      else if (drift === "down") score += 5;
      if (arrivalDetected) score -= Math.round(arrivalStrength * 200);
      const conf = activeWeekly?.forecast?.[0]?.confidence || 60;
      score = score * (0.6 + Math.min(conf, 100) / 250);
      const cReports = communityReports?.[b.id] || communityReports?.[sargId];
      if (cReports && cReports.total >= 3) {
        const avoidPct = cReports.avoid / cReports.total;
        const modPct = cReports.moderate / cReports.total;
        if (avoidPct >= 0.5) score -= 50;
        else if (modPct >= 0.5) score -= 20;
      }
      if (b.beachMemory) score -= 25;
      if (dist != null) score -= Math.min(dist, 50) * 1.2;
      else if (typeof b.drive === "number") score -= Math.min(b.drive, 90) * 0.6;
      if (b.kids) score += 5;
      if (b.parking) score += 3;
      return { ...b, _score: Math.round(score * 10) / 10, _dist: dist, _fc1: fc1, _fc3: fc3, _drift: drift, _conf: conf, _communityReports: cReports, _arrivalDetected: arrivalDetected, _arrivalStrength: arrivalStrength };
    });
    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, 3);
  }, [allBeaches, island2, userPos, sargData, communityReports]);
  const top = picks[0];
  const weather = useWeather(top);
  if (!top) return null;
  const topSt = ST[top.status] || ST._loading;
  const verdict = (() => {
    const fc1 = top._fc1, fc3 = top._fc3, drift = top._drift;
    if (top._arrivalDetected && top.status === "clean") {
      return _t(lang, "Propre mais banc en approche", "Clean now \u2014 sargassum bank approaching", "Limpia pero con banco de sargazo en camino");
    }
    if (top.scoreReason && lang === "fr" && !top.beachMemory && top.status === "clean") {
      return top.scoreReason;
    }
    if (top._communityReports && top._communityReports.total >= 3) {
      return _t(lang, `${top._communityReports.total} signalements visiteurs sur place`, `${top._communityReports.total} visitor reports on site`, `${top._communityReports.total} reportes de visitantes en el lugar`);
    }
    if (top.beachMemory) return _t(lang, "M\xE9moire \xE9chouage \u2014 v\xE9rifie sur place", "Recent beaching \u2014 check on site", "Llegada reciente \u2014 verifica en el lugar");
    if (top.status === "avoid") return _t(lang, "Conditions difficiles partout", "Difficult conditions island-wide", "Condiciones dif\xEDciles en toda la zona");
    if (top.status === "moderate") return _t(lang, "Mod\xE9r\xE9 \u2014 v\xE9rifie sur place", "Moderate \u2014 verify on site", "Moderado \u2014 verifica en el lugar");
    if (fc1 && fc1.status && fc1.status !== "clean") {
      return _t(lang, `Propre aujourd'hui, ${statusFromAfai(fc1.afai) === "moderate" ? "mod\xE9r\xE9" : "alerte"} demain`, `Clean today but ${fc1.status} tomorrow`, `Limpia hoy, ${statusFromAfai(fc1.afai) === "moderate" ? "moderado" : "alerta"} ma\xF1ana`);
    }
    if (fc3 && fc3.status && fc3.status !== "clean") {
      return _t(lang, `Propre \u2014 ${statusFromAfai(fc3.afai) === "moderate" ? "mod\xE9r\xE9" : "alerte"} dans 3 jours`, `Clean now \u2014 ${fc3.status} in 3 days`, `Limpia \u2014 ${statusFromAfai(fc3.afai) === "moderate" ? "moderado" : "alerta"} en 3 d\xEDas`);
    }
    if (drift === "up") {
      return _t(lang, "Propre mais sargasses en approche", "Clean now but sargassum drifting in", "Limpia pero con sargazo acerc\xE1ndose");
    }
    if (weather?.precipitation > 5) {
      return _t(lang, `Propre mais pluie ${Math.round(weather.precipitation)}mm aujourd'hui`, `Clean but rain ${Math.round(weather.precipitation)}mm today`, `Limpia pero con lluvia ${Math.round(weather.precipitation)}mm hoy`);
    }
    if (weather?.wind != null && weather.windDir != null) {
      const wd = windCompass(weather.windDir, lang);
      return _t(lang, `Vent ${wd} ${weather.wind}km/h \xB7 propre et stable`, `Wind ${wd} ${weather.wind}km/h \xB7 clean & stable`, `Viento ${wd} ${weather.wind}km/h \xB7 limpia y estable`);
    }
    return _t(lang, "Conditions stables", "Stable conditions", "Condiciones estables");
  })();
  const distLabel = top._dist != null ? `${Math.round(top._dist)} km` : "";
  const driveLabel = top.drive ? `${top.drive} min` : "";
  const handleMainClick = () => {
    track("sg_daily_reco_main_click", { beach_id: top.id, status: top.status, is_premium: isPremium });
    onBeachClick(top);
  };
  const handleAltClick = (e) => {
    e.stopPropagation();
    if (isPremium) {
      setExpanded(!expanded);
      track("sg_daily_reco_alt_toggle", { expanded: !expanded });
    } else {
      track("sg_daily_reco_lock_click", { source: "alternatives" });
      onPremiumClick("daily_reco");
    }
  };
  const handleWazeClick = (e) => {
    e.stopPropagation();
    track("sg_daily_reco_waze", { beach_id: top.id });
  };
  const wazeUrl = `https://waze.com/ul?ll=${top.lat},${top.lng}&navigate=yes`;
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    // Align with BottomNav height: 8px top + ~40px button + max(12, safe-area) bottom = 60 + max(12, safe-area)
    // +12px gap above the nav
    bottom: "calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 12px)",
    left: "max(12px, 3vw)",
    right: "max(12px, 3vw)",
    zIndex: 720,
    maxWidth: 480,
    margin: "0 auto",
    background: "var(--sg-card,#fff)",
    borderRadius: 16,
    boxShadow: "0 4px 20px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)",
    overflow: "hidden",
    animation: "slideUp .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "button",
      tabIndex: 0,
      "aria-label": _t(lang, `Ouvrir la fiche ${top.name}`, `Open ${top.name}`, `Abrir ${top.name}`),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleMainClick();
        }
      },
      onClick: handleMainClick,
      style: {
        padding: "11px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    },
    typeof top.score === "number" ? /* @__PURE__ */ React.createElement("div", { style: {
      width: 48,
      height: 48,
      borderRadius: "50%",
      flexShrink: 0,
      background: `conic-gradient(${top.scoreColor || topSt.c} ${top.score * 3.6}deg, rgba(0,0,0,.06) ${top.score * 3.6}deg)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: "var(--sg-card,#fff)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,.08)"
    } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 17, lineHeight: 1, color: top.scoreColor || topSt.c } }, top.score), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 7, fontWeight: 700, color: "var(--sg-mid,#5A5A5A)", letterSpacing: ".04em" } }, "/100"))) : /* @__PURE__ */ React.createElement("div", { style: {
      width: 44,
      height: 44,
      borderRadius: 14,
      flexShrink: 0,
      background: topSt.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22
    } }, topSt.e),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: "var(--sg-mid,#5A5A5A)",
      letterSpacing: ".05em",
      textTransform: "uppercase",
      marginBottom: 2
    } }, typeof top.score === "number" ? _t(lang, `Meilleure plage aujourd'hui \xB7 ${scoreLabelFor(top.scoreLabel, lang) || ""}`, `Best beach today \xB7 ${scoreLabelFor(top.scoreLabel, lang) || ""}`, `Mejor playa hoy \xB7 ${scoreLabelFor(top.scoreLabel, lang) || ""}`) : _t(lang, "Ta meilleure plage maintenant", "Best beach now", "Tu mejor playa ahora")), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--sg-ink,#0D0D0D)",
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, top.name), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 11,
      color: "var(--sg-mid,#5A5A5A)",
      marginTop: 2,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, distLabel && /* @__PURE__ */ React.createElement(React.Fragment, null, distLabel), distLabel && driveLabel && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 "), driveLabel && /* @__PURE__ */ React.createElement(React.Fragment, null, driveLabel), verdict && (distLabel || driveLabel) && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 "), verdict))
  ), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    gap: 8,
    padding: "0 14px 12px"
  } }, /* @__PURE__ */ React.createElement(
    "a",
    {
      href: wazeUrl,
      target: "_blank",
      rel: "noopener",
      onClick: handleWazeClick,
      style: {
        flex: "1 1 auto",
        minWidth: 0,
        textDecoration: "none",
        textAlign: "center",
        background: "var(--sg-ink,#0D0D0D)",
        color: "#fff",
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    },
    _t(lang, "Y aller", "Go there", "C\xF3mo llegar")
  ), picks.length > 1 && /* @__PURE__ */ React.createElement("button", { onClick: handleAltClick, style: {
    flex: "1 1 auto",
    minWidth: 0,
    background: isPremium ? "var(--sg-bgD,#F7F5EF)" : C.goldBg,
    border: `1px solid ${isPremium ? "rgba(0,0,0,.08)" : C.gold}`,
    color: "var(--sg-ink,#0D0D0D)",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  } }, isPremium ? expanded ? _t(lang, "Moins \u25B2", "Less \u25B2", "Menos \u25B2") : lang === "en" ? `+${picks.length - 1} options` : `+${picks.length - 1} options` : /* @__PURE__ */ React.createElement(React.Fragment, null, "\u{1F512} ", lang === "en" ? `+${picks.length - 1} options` : `+${picks.length - 1} options`))), isPremium && expanded && picks.length > 1 && /* @__PURE__ */ React.createElement("div", { style: {
    borderTop: "1px solid var(--sg-border,rgba(0,0,0,.06))",
    background: "var(--sg-bgD,#FAFAFA)",
    maxHeight: 200,
    overflowY: "auto",
    overflowX: "hidden"
  } }, picks.slice(1).map((alt) => {
    const altSt = ST[alt.status] || ST._loading;
    const altDist = alt._dist != null ? `${Math.round(alt._dist)} km` : "";
    const altDrive = alt.drive ? `${alt.drive} min` : "";
    return /* @__PURE__ */ React.createElement("button", { key: alt.id, onClick: () => {
      track("sg_daily_reco_alt_click", { beach_id: alt.id, status: alt.status });
      onBeachClick(alt);
    }, style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      width: "100%",
      background: "transparent",
      border: "none",
      borderBottom: "1px solid var(--sg-border,rgba(0,0,0,.06))",
      cursor: "pointer",
      fontFamily: "inherit",
      textAlign: "left"
    } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, flexShrink: 0 } }, altSt.e), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 13,
      fontWeight: 600,
      color: "var(--sg-ink,#0D0D0D)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, alt.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--sg-mid,#5A5A5A)" } }, altDist, altDist && altDrive && " \xB7 ", altDrive)), /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 9.5,
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: 100,
      background: altSt.bg,
      color: altSt.c,
      flexShrink: 0
    } }, lang === "es" ? altSt.les : lang === "en" ? altSt.le : altSt.l));
  })));
}
function SeasonBanner({ lang }) {
  const [visible, setVisible] = useState(() => {
    if (SARGASSES_SEASON !== "high") return false;
    try {
      return !sessionStorage.getItem("sg_season_banner_dismissed");
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (visible) track("sg_season_banner_view");
  }, [visible]);
  if (!visible) return null;
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 800,
    background: "rgba(232,168,0,.92)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "6px 32px 6px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: C.ink
  } }, /* @__PURE__ */ React.createElement("span", null, lang === "en" ? "Sargasses season active \u2014 forecasts are more reliable right now" : "Saison sargasses active \u2014 les pr\xE9visions sont plus fiables en ce moment"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setVisible(false);
    try {
      sessionStorage.setItem("sg_season_banner_dismissed", "1");
    } catch {
    }
    track("sg_season_banner_dismiss");
  }, style: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    color: "rgba(13,13,13,.5)",
    padding: 4,
    lineHeight: 1
  } }, "\u2715"));
}
const PremiumModal = lazyWithRetry(() => import("./PremiumModal.jsx"));
const B2BModal = lazyWithRetry(() => import("./PremiumModal.jsx").then((m) => ({ default: m.B2BModal })));
function formatFreshness(updatedAt, lang) {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 6e4);
  if (min < 1) return lang === "en" ? "just now" : lang === "es" ? "ahora" : "\xE0 l'instant";
  if (min < 60) return lang === "en" ? `${min}m ago` : lang === "es" ? `hace ${min}m` : `il y a ${min}m`;
  const h = Math.floor(min / 60);
  if (h >= 12) return null;
  return lang === "en" ? `${h}h ago` : lang === "es" ? `hace ${h}h` : `il y a ${h}h`;
}
function Header({ island: island2, onIslandChange, lang, onLangToggle, theme, onThemeToggle, beachCount, dataSource, updatedAt, stale, onHome, onEnableNotif, onAccess, isPremium, alertsOn, onToggleAlerts }) {
  const LL = T[lang] || T.fr;
  const showAccess = !!onAccess && !/[?&]monacces=0/.test(typeof window !== "undefined" ? window.location.search : "");
  const fresh2 = formatFreshness(updatedAt, lang);
  const isLive = dataSource === "erddap-live" && !!fresh2;
  const liveLbl = isLive ? _t(lang, "EN DIRECT", "LIVE", "EN DIRECTO") : _t(lang, "v\xE9rification en cours", "verification in progress", "verificaci\xF3n en curso");
  const ageH = (() => {
    try {
      if (!updatedAt) return null;
      const h = (Date.now() - new Date(updatedAt).getTime()) / 36e5;
      return isFinite(h) && h >= 0 ? h : null;
    } catch (_) {
      return null;
    }
  })();
  const satLbl = stale ? _t(lang, "Donn\xE9es satellite en retard \u2014 de plus de 24 h", " Satellite data delayed \u2014 over 24 h", "Datos satellite con retraso \u2014 m\xE1s de 24 h") : ageH != null && ageH >= 0 ? _t(lang, "Satellite \xB7 il y a " + Math.round(ageH) + " h", "Satellite \xB7 " + Math.round(ageH) + " h ago", "Sat\xE9lite \xB7 hace " + Math.round(ageH) + " h") : null;
  return /* @__PURE__ */ React.createElement("div", { className: "sg-header-row sg-rail" }, onHome && /* @__PURE__ */ React.createElement("button", { onClick: onHome, "aria-label": lang === "es" ? "Inicio" : lang === "en" ? "Home" : "Accueil", className: "sg-seg sg-seg-home" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10", fill: "#0A1714" }), /* @__PURE__ */ React.createElement("path", { d: "M4 13.5 Q8 11 12 12.5 T20 12", stroke: "#1EC8B0", strokeWidth: "2.2", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M4 16.5 Q8 14.2 12 15.6 T20 15", stroke: "#009E8E", strokeWidth: "2", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "16.5", cy: "8", r: "2.4", fill: "#FFC72C", stroke: "#0d0b14", strokeWidth: "1.4" }))), !IS_NEW_REGION && /* @__PURE__ */ React.createElement("div", { className: "sg-seg sg-iso", role: "group", "aria-label": _t(lang, "R\xE9gion", "Region", "Regi\xF3n") }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": true, className: "sg-iso-knob", style: {
    transform: island2 === "mq" ? "translateX(3px)" : "translateX(calc(100% + 3px))"
  } }), ["mq", "gp"].map((id) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: id,
      onClick: () => {
        onIslandChange(id);
        track("sg_island_switch", { to: id });
      },
      style: { color: island2 === id ? "#0d0b14" : "var(--sg-mid,#5A5A5A)" }
    },
    id === "mq" ? "MQ" : "GP"
  ))), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "https://marine.copernicus.eu",
      target: "_blank",
      rel: "noopener noreferrer",
      onClick: () => track("sg_live_badge_click", { source: dataSource }),
      className: "sg-seg sg-live",
      "aria-label": _t(lang, "Donn\xE9es en direct", "Live data", "Datos en vivo")
    },
    /* @__PURE__ */ React.createElement("span", { className: "sg-live-dot", "aria-hidden": "true" }, isLive && /* @__PURE__ */ React.createElement("span", { className: "sg-live-halo" }), /* @__PURE__ */ React.createElement("i", null)),
    /* @__PURE__ */ React.createElement("span", { className: "sg-live-lbl" }, liveLbl),
    isLive && fresh2 && /* @__PURE__ */ React.createElement("span", { className: "sg-live-age" }, "\xB7 ", fresh2),
    satLbl ? /* @__PURE__ */ React.createElement("span", { className: "sg-seg sg-freshness", "aria-label": _t(lang, "Fra\xEEcheur satellite", "Satellite freshness", "Freshness satellite") }, /* @__PURE__ */ React.createElement("span", null, satLbl)) : null
  ), /* @__PURE__ */ React.createElement("div", { className: "sg-seg sg-util", role: "group", "aria-label": _t(lang, "Pr\xE9f\xE9rences", "Preferences", "Preferencias") }, (onToggleAlerts || onEnableNotif) && (() => {
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    const on = !ACCOUNT_OFF ? !!alertsOn : perm === "granted";
    if (!ACCOUNT_OFF && onToggleAlerts) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          "aria-label": on ? _t(lang, "D\xE9sactiver les alertes sargasses", "Turn off sargassum alerts", "Desactivar alertas de sargazo") : _t(lang, "Activer les alertes sargasses", "Enable sargassum alerts", "Activar alertas de sargazo"),
          title: on ? _t(lang, "Alertes activ\xE9es \u2014 couper", "Alerts on \u2014 turn off", "Alertas activadas \u2014 apagar") : _t(lang, "Activer les alertes", "Enable alerts", "Activar alertas"),
          onClick: () => onToggleAlerts("header")
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M6 9.5a6 6 0 0 1 12 0c0 4.4 1.8 5.5 1.8 5.5H4.2S6 13.9 6 9.5z", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round", fill: on ? "currentColor" : "none" }), /* @__PURE__ */ React.createElement("path", { d: "M10 19a2 2 0 0 0 4 0", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), !on && /* @__PURE__ */ React.createElement("path", { d: "M4 4L20 20", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }))
      );
    }
    const iosBrowser = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        "aria-label": _t(lang, "Activer les alertes sargasses", "Enable sargassum alerts", "Activar alertas de sargazo"),
        onClick: () => {
          if (on) {
            try {
              sgToast({ tone: "success", msg: _t(lang, "Le Veilleur t'\xE9crit d\xE9j\xE0 chaque matin \u{1F514}", "The Watchman already writes you each morning \u{1F514}", "El Vig\xEDa ya te escribe cada ma\xF1ana \u{1F514}") });
            } catch (_) {
            }
            ;
            return;
          }
          if (perm === "denied") {
            try {
              sgToast({ tone: "info", title: _t(lang, "Notifications bloqu\xE9es", "Notifications blocked", "Notificaciones bloqueadas"), msg: _t(lang, "R\xE9active-les dans les r\xE9glages de ton t\xE9l\xE9phone/navigateur.", "Re-enable them in your phone/browser settings.", "React\xEDvalas en los ajustes de tu tel\xE9fono/navegador.") });
            } catch (_) {
            }
            ;
            return;
          }
          if (iosBrowser) {
            try {
              sgToast({ tone: "info", title: _t(lang, "Ajoute l'app \xE0 ton \xE9cran d'accueil", "Add the app to your home screen", "A\xF1ade la app a tu pantalla de inicio"), msg: _t(lang, "Partager \u2192 \xAB Sur l'\xE9cran d'accueil \xBB, puis active les alertes.", "Share \u2192 'Add to Home Screen', then enable alerts.", "Compartir \u2192 'A pantalla de inicio', luego activa las alertas.") });
            } catch (_) {
            }
            ;
            return;
          }
          try {
            track("sg_push_header_cta", {});
          } catch (_) {
          }
          onEnableNotif && onEnableNotif();
        }
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M6 9.5a6 6 0 0 1 12 0c0 4.4 1.8 5.5 1.8 5.5H4.2S6 13.9 6 9.5z", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round", fill: on ? "currentColor" : "none" }), /* @__PURE__ */ React.createElement("path", { d: "M10 19a2 2 0 0 0 4 0", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }))
    );
  })(), showAccess && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onAccess,
      "aria-label": _t(lang, "Mon acc\xE8s", "My access", "Mi acceso"),
      title: _t(lang, "Mon acc\xE8s", "My access", "Mi acceso")
    },
    /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "8", r: "3.4", stroke: "currentColor", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M5.5 19.5a6.5 6.5 0 0 1 13 0", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), isPremium && /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "6", r: "2.4", fill: "#FFC72C", stroke: "#0d0b14", strokeWidth: "1.2" }))
  ), /* @__PURE__ */ React.createElement("button", { onClick: onThemeToggle, "aria-label": theme === "dark" ? "Light mode" : "Dark mode" }, theme === "dark" ? /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z", stroke: "currentColor", strokeWidth: "2", fill: "none", strokeLinejoin: "round" })) : /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4.2", stroke: "currentColor", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("g", { stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" })))), (() => {
    const langTarget = IS_NEW_REGION ? lang === REGION.primaryLang ? REGION.secondaryLangs?.[0] || "en" : REGION.primaryLang : lang === "fr" ? "en" : lang === "en" ? "es" : "fr";
    return /* @__PURE__ */ React.createElement("button", { onClick: onLangToggle, className: "sg-lang", "aria-label": langTarget === "en" ? "Switch to English" : langTarget === "es" ? "Cambiar a espa\xF1ol" : "Passer en fran\xE7ais" }, langTarget.toUpperCase());
  })()));
}
function InlinePushCTA({ lang, beachId }) {
  const [accepted, setAccepted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tracked = useRef(false);
  const beachViews = parseInt(sessionStorage.getItem("sg_beach_views") || "0");
  if (beachViews < 3 || dismissed || g("sg_push_done", false)) return null;
  if (!tracked.current) {
    tracked.current = true;
    track("sg_push_view", { beach_id: beachId || "unknown" });
  }
  const handleActivate = () => {
    track("sg_push_accept", { beach_id: beachId || "unknown" });
    s("sg_push_done", true);
    setAccepted(true);
    try {
      window.loadOneSignal?.();
      const tagBeach = beachId || g("sg_my_beach", null);
      if (tagBeach) {
        const waitForOS = setInterval(() => {
          if (window.OneSignalDeferred) {
            clearInterval(waitForOS);
            window.OneSignalDeferred.push(function(O) {
              O.User.addTag("my_beach", tagBeach);
              O.User.addTag("sarg_alert", "1");
            });
          }
        }, 500);
        setTimeout(() => clearInterval(waitForOS), 1e4);
      }
    } catch (e) {
    }
  };
  if (accepted) return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "12px 0",
    padding: "12px 14px",
    borderRadius: 12,
    background: C.greenBg,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: C.green
  } }, _t(lang, "Alertes activ\xE9es ! Tu seras notifi\xE9.", "Alerts activated! You'll be notified.", "\xA1Alertas activadas! Te avisaremos."));
  return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "12px 0",
    padding: "12px 14px",
    borderRadius: 14,
    background: "var(--sg-bgD,#F7F5EF)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.04))"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, flexShrink: 0 } }, "\u{1F514}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--sg-ink)" } }, _t(lang, "Sois pr\xE9venu avant d'aller \xE0 la plage", "Know before you go", "Ent\xE9rate antes de ir a la playa")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid)", marginTop: 1 } }, _t(lang, "On te pr\xE9vient si ta plage change de statut. Gratuit.", "We'll alert you if this beach changes status. Free.", "Te avisamos si tu playa cambia de estado. Gratis."))), /* @__PURE__ */ React.createElement("button", { onClick: handleActivate, style: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: C.gold,
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(232,168,0,.25)"
  } }, _t(lang, "Activer", "Activate", "Activar"))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setDismissed(true);
    track("sg_push_dismiss", { beach_id: beachId || "unknown" });
  }, style: {
    display: "block",
    margin: "6px auto 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--sg-mid)",
    fontSize: 11,
    padding: 0
  } }, _t(lang, "Plus tard", "Not now", "Ahora no")));
}
function BeachPhotoScan({ beach, lang }) {
  const T3 = (fr, en, es) => lang === "en" ? en : lang === "es" ? es : fr;
  const afai = beach.afai;
  const zone = afai == null ? "_" : afai < 0.15 ? "clean" : afai < 0.4 ? "moderate" : "avoid";
  const zoneColor = { clean: "#16A34A", moderate: "#E07800", avoid: "#E8522A", "_": "#4ECDC4" }[zone];
  const lat = beach.lat, lng = beach.lng;
  const latStr = lat != null ? `${Math.abs(lat).toFixed(4)}\xB0${lat >= 0 ? "N" : "S"}` : null;
  const lngStr = lng != null ? `${Math.abs(lng).toFixed(4)}\xB0${lng >= 0 ? "E" : "O"}` : null;
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,6,15,.76)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    animation: "sgReveal .22s ease",
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("svg", { style: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.14 }, xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("pattern", { id: "bpGrid", x: "0", y: "0", width: "36", height: "36", patternUnits: "userSpaceOnUse" }, /* @__PURE__ */ React.createElement("path", { d: "M 36 0 L 0 0 0 36", fill: "none", stroke: "#4ECDC4", strokeWidth: ".6" }))), /* @__PURE__ */ React.createElement("rect", { width: "100%", height: "100%", fill: "url(#bpGrid)" })), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    background: "linear-gradient(90deg,transparent,#4ECDC4 20%,#4ECDC4 80%,transparent)",
    boxShadow: "0 0 12px #4ECDC4, 0 0 4px #4ECDC4",
    animation: "beachScanLine 1.6s ease-out forwards"
  } }), [
    [{ top: 10, left: 10 }, { borderTop: "2px solid #4ECDC4", borderLeft: "2px solid #4ECDC4" }],
    [{ top: 10, right: 10 }, { borderTop: "2px solid #4ECDC4", borderRight: "2px solid #4ECDC4" }],
    [{ bottom: 10, left: 10 }, { borderBottom: "2px solid #4ECDC4", borderLeft: "2px solid #4ECDC4" }],
    [{ bottom: 10, right: 10 }, { borderBottom: "2px solid #4ECDC4", borderRight: "2px solid #4ECDC4" }]
  ].map(([pos, border], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { position: "absolute", width: 18, height: 18, ...pos, ...border, opacity: 0.7 } })), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 9
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: ".2em",
    color: "#4ECDC4",
    opacity: 0.8,
    animation: "sgReveal .3s ease .45s both"
  } }, T3("ANALYSE SATELLITE", "SATELLITE SCAN", "AN\xC1LISIS SATELITAL")), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 19,
    color: "#fff",
    letterSpacing: "-.01em",
    textAlign: "center",
    padding: "0 24px",
    lineHeight: 1.1,
    animation: "sgReveal .3s ease .6s both"
  } }, beach.name.toUpperCase()), latStr && lngStr && /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 11,
    color: "rgba(255,255,255,.65)",
    fontFamily: "monospace",
    background: "rgba(78,205,196,.1)",
    border: "1px solid rgba(78,205,196,.25)",
    borderRadius: 6,
    padding: "3px 10px",
    animation: "sgReveal .3s ease .75s both"
  } }, latStr, " \xB7 ", lngStr), afai != null && /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    animation: "sgReveal .3s ease .9s both"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "rgba(255,255,255,.45)", letterSpacing: ".04em" } }, "AFAI"), /* @__PURE__ */ React.createElement("div", { style: { width: 72, height: 4, borderRadius: 2, background: "rgba(255,255,255,.12)", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: `${Math.min(100, afai / 0.8 * 100)}%`,
    height: "100%",
    background: zoneColor,
    borderRadius: 2,
    boxShadow: `0 0 6px ${zoneColor}`
  } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: zoneColor, fontFamily: "monospace" } }, afai.toFixed(3))), /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 9,
    color: "rgba(255,255,255,.3)",
    letterSpacing: ".06em",
    marginTop: 2,
    animation: "sgReveal .3s ease 1.05s both"
  } }, "MODIS NASA \xB7 COPERNICUS ESA")), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    bottom: 12,
    right: 14,
    fontSize: 9,
    color: "rgba(255,255,255,.3)",
    letterSpacing: ".05em",
    animation: "sgReveal .3s ease 1.2s both"
  } }, T3("toucher pour fermer", "tap to close", "toca para cerrar")));
}
function ScoreReveal({ beach, lang }) {
  const T3 = (fr, en, es) => lang === "en" ? en : lang === "es" ? es : fr;
  const afai = beach.afai || 0;
  const pct = Math.min(100, afai / 0.8 * 100);
  const zone = afai < 0.15 ? "clean" : afai < 0.4 ? "moderate" : "avoid";
  const zoneColor = { clean: "#16A34A", moderate: "#E07800", avoid: "#E8522A" }[zone];
  return /* @__PURE__ */ React.createElement("div", { style: {
    animation: "sgReveal .22s ease",
    background: "var(--sg-bgD,#F7F5EF)",
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 14,
    marginTop: -8,
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--sg-mid,#5A5A5A)",
    textTransform: "uppercase",
    letterSpacing: ".07em",
    marginBottom: 10
  } }, T3("Mesure satellite Copernicus", "Copernicus satellite reading", "Medici\xF3n sat\xE9lite Copernicus")), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "var(--sg-mid,#5A5A5A)",
    marginBottom: 4
  } }, /* @__PURE__ */ React.createElement("span", null, T3("Propre", "Clean", "Limpia"), " \u2190 AFAI"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: zoneColor } }, T3("Mesur\xE9 :", "Read:", "Medido:"), " ", afai.toFixed(3)), /* @__PURE__ */ React.createElement("span", null, "\u2192 ", T3("Alerte", "Alert", "Alerta"))), /* @__PURE__ */ React.createElement("div", { style: {
    height: 8,
    borderRadius: 99,
    overflow: "hidden",
    position: "relative",
    background: "linear-gradient(90deg,#16A34A 0%,#16A34A 18.75%,#E07800 18.75%,#E07800 50%,#E8522A 50%)"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 3,
    borderRadius: 2,
    background: "#120821",
    left: `calc(${pct.toFixed(1)}% - 1px)`,
    boxShadow: "0 0 0 2px #fff"
  } })), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 9,
    color: "var(--sg-mid,#999)",
    marginTop: 3
  } }, /* @__PURE__ */ React.createElement("span", null, "0"), /* @__PURE__ */ React.createElement("span", null, "0.15"), /* @__PURE__ */ React.createElement("span", null, "0.40"), /* @__PURE__ */ React.createElement("span", null, "0.8+"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 } }, [
    { l: T3("Sargasses", "Sargassum", "Sargazo"), w: "40%" },
    { l: T3("Vent", "Wind", "Viento"), w: "20%" },
    { l: "UV", w: "20%" },
    { l: T3("Mer", "Waves", "Mar"), w: "20%" }
  ].map((f) => /* @__PURE__ */ React.createElement("span", { key: f.l, style: {
    fontSize: 10,
    fontWeight: 600,
    padding: "3px 9px",
    borderRadius: 100,
    background: "rgba(0,0,0,.06)",
    color: "var(--sg-ink,#1A2B26)"
  } }, f.l, " ", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6 } }, f.w)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--sg-mid,#999)", fontStyle: "italic" } }, T3("Mis \xE0 jour 4\xD7/jour \xB7 MODIS NASA + Copernicus ESA", "Updated 4\xD7/day \xB7 MODIS NASA + Copernicus ESA", "Actualizado 4\xD7/d\xEDa \xB7 MODIS NASA + Copernicus ESA")));
}
function AfaiChip({ beach, lang }) {
  const [open, setOpen] = useState(false);
  const T3 = (fr, en, es) => lang === "en" ? en : lang === "es" ? es : fr;
  const afai = beach.afai;
  if (afai == null) return null;
  const zone = afai < 0.15 ? "clean" : afai < 0.4 ? "moderate" : "avoid";
  const color = { clean: "#16A34A", moderate: "#E07800", avoid: "#E8522A" }[zone];
  return /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setOpen((v) => !v);
        track("sg_afai_learn", { beach_id: beach.id });
      },
      style: {
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 0",
        fontFamily: "inherit"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 6px ${color}88`,
      display: "inline-block",
      flexShrink: 0
    } }),
    /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 11,
      fontWeight: 700,
      color: "var(--sg-mid,#5A5A5A)",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    } }, "AFAI ", afai.toFixed(3)),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--sg-dim,#aaa)" } }, open ? "\u25B2" : "\u25BE")
  ), open && /* @__PURE__ */ React.createElement("div", { style: {
    animation: "sgReveal .2s ease",
    background: "var(--sg-bgD,#F7F5EF)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 11,
    color: "var(--sg-ink,#1A2B26)",
    lineHeight: 1.6,
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))"
  } }, /* @__PURE__ */ React.createElement("strong", null, "AFAI"), " ", T3(
    "= Floating Algae Index \u2014 signature spectrale mesur\xE9e par satellite. En-dessous de 0.15 = propre, 0.15\u20130.40 = mod\xE9r\xE9, au-del\xE0 = \xE0 \xE9viter.",
    "= Floating Algae Index \u2014 spectral signature measured by satellite. Below 0.15 = clean, 0.15\u20130.40 = moderate, above = avoid.",
    "= Floating Algae Index \u2014 firma espectral medida por sat\xE9lite. Menos de 0.15 = limpia, 0.15\u20130.40 = moderado, encima = evitar."
  )));
}
function CaptureGateModal({ lang, onSubmit, onClose, onPay, beach }) {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("sg_email") || "";
    } catch {
      return "";
    }
  });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  function submit(e) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErr(true);
      return;
    }
    setBusy(true);
    setSent(true);
    onSubmit(email);
  }
  const hasBeach = !!beach?.name;
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose && onClose();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-premium)",
        background: "rgba(2,9,7,.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(12px)"
      },
      role: "dialog",
      "aria-modal": "true",
      "aria-label": hasBeach ? _t(lang, `D\xE9bloque ${beach.name}`, `Unlock ${beach.name}`, `Desbloquea ${beach.name}`) : _t(lang, "Re\xE7ois le brief sargasses", "Get the sargassum brief", "Recibe el informe de sargazo"),
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose();
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: {
      width: "90%",
      maxWidth: 480,
      borderRadius: PAY_CAPTURE_ONLY ? 20 : 24,
      background: PAY_CAPTURE_ONLY ? "#fdf6e3" : "rgba(10,23,20,.65)",
      border: PAY_CAPTURE_ONLY ? "3px solid #0d0b14" : "1px solid rgba(255,255,255,.08)",
      padding: "40px 24px",
      boxShadow: PAY_CAPTURE_ONLY ? "6px 6px 0 #0d0b14" : "0 20px 60px rgba(0,0,0,.6)",
      forcedColorAdjust: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center"
    } }, !sent ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
      width: 54,
      height: 54,
      borderRadius: "50%",
      background: "rgba(95,211,201,.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20
    } }, /* @__PURE__ */ React.createElement("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "#3fd07f", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" }), /* @__PURE__ */ React.createElement("polyline", { points: "22,6 12,13 2,6" }))), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 26, fontWeight: 800, color: PAY_CAPTURE_ONLY ? "#0d0b14" : "#fff", lineHeight: 1.2, margin: "0 0 12px 0", fontFamily: "Bricolage Grotesque,sans-serif" } }, hasBeach ? _t(lang, `D\xE9bloque la m\xE9t\xE9o de ${beach.name} pour demain.`, `Unlock tomorrow's forecast for ${beach.name}.`, `Desbloquea el clima de ${beach.name} para ma\xF1ana.`) : _t(lang, "Re\xE7ois le rapport sargasses chaque matin.", "Get the sargassum report every morning.", "Recibe el informe de sargazo cada ma\xF1ana.")), __REL && typeof __REL.cleanPct === "number" && (() => {
      const reg = __REL.regime === "high" ? _t(lang, "saison haute", "high season", "temporada alta") : _t(lang, "saison calme", "calm season", "temporada tranquila");
      return /* @__PURE__ */ React.createElement(
        "a",
        {
          href: reliabilityHref(lang),
          onClick: () => {
            try {
              track("sg_reliability_open", { from: "capture_gate" });
            } catch (_) {
            }
          },
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            margin: "0 0 16px",
            padding: "7px 13px",
            borderRadius: 999,
            background: "rgba(34,197,94,.12)",
            border: `1px solid rgba(34,197,94,${PAY_CAPTURE_ONLY ? ".4" : ".24"})`,
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
            color: PAY_CAPTURE_ONLY ? "#1B7A4B" : "#8FE3B0",
            cursor: IS_NEW_REGION ? "default" : "pointer"
          }
        },
        /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u2705"),
        /* @__PURE__ */ React.createElement("span", null, _t(lang, `${__REL.cleanPct}% de nos pr\xE9visions \xAB mer propre \xBB v\xE9rifi\xE9es \xB7 ${reg}`, `${__REL.cleanPct}% of our \u201Cclean water\u201D forecasts verified \xB7 ${reg}`, `${__REL.cleanPct}% de nuestros pron\xF3sticos \u201Cagua limpia\u201D verificados \xB7 ${reg}`), !IS_NEW_REGION && /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.65 } }, "  \u2192"))
      );
    })(), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 15, color: PAY_CAPTURE_ONLY ? "#4a4636" : "rgba(255,255,255,.6)", margin: "0 0 22px 0", lineHeight: 1.5 } }, onPay ? _t(lang, "Re\xE7ois le brief par email \u2014 gratuit. Ou d\xE9bloque tout de suite par carte.", "Get the brief by email \u2014 free. Or unlock everything now by card.", "Recibe el informe por email \u2014 gratis. O desbloqu\xE9alo ya con tarjeta.") : _t(lang, "Re\xE7ois le brief par email \u2014 gratuit, sans carte.", "Get the brief by email \u2014 free, no card.", "Recibe el informe por email \u2014 gratis, sin tarjeta.")), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, style: { width: "100%", position: "relative", marginBottom: 16 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        inputMode: "email",
        autoComplete: "email",
        placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
        "aria-label": _t(lang, "Ton email pour le brief", "Your email for the brief", "Tu email para el informe"),
        value: email,
        onChange: (e) => {
          setEmail(e.target.value);
          setErr(false);
        },
        style: {
          width: "100%",
          boxSizing: "border-box",
          padding: "16px 64px 16px 20px",
          borderRadius: 999,
          border: `2px solid ${err ? "#E8522A" : PAY_CAPTURE_ONLY ? "#0d0b14" : "rgba(255,255,255,.15)"}`,
          fontSize: 16,
          fontFamily: "inherit",
          background: PAY_CAPTURE_ONLY ? "#fff" : "rgba(255,255,255,.05)",
          outline: "none",
          color: PAY_CAPTURE_ONLY ? "#0d0b14" : "#fff",
          transition: "border 0.2s ease"
        }
      }
    ), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: busy, className: "sg-paygold", "aria-label": _t(lang, "Recevoir le brief par email", "Get the brief by email", "Recibir el informe por email"), style: {
      position: "absolute",
      right: 6,
      top: 6,
      bottom: 6,
      width: 44,
      borderRadius: 999,
      border: PAY_CAPTURE_ONLY ? "2px solid #0d0b14" : "none",
      cursor: busy ? "wait" : "pointer",
      background: PAY_CAPTURE_ONLY ? "#ffd23f" : "linear-gradient(135deg,#3fd07f,#5b3a8e)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: PAY_CAPTURE_ONLY ? "2px 2px 0 #0d0b14" : "0 2px 10px rgba(59,167,160,.4)",
      opacity: busy ? 0.6 : 1
    } }, busy ? "\u2026" : /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "#061210", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }), /* @__PURE__ */ React.createElement("polyline", { points: "12 5 19 12 12 19" })))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: PAY_CAPTURE_ONLY ? "#6b6658" : "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })), _t(lang, "Sans spam. D\xE9sinscription en 1 clic.", "No spam. 1-click unsubscribe.", "Sin spam. Baja en 1 clic.")), onPay && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, width: "100%", margin: "2px 0 14px", color: "rgba(255,255,255,.3)", fontSize: 11, fontWeight: 700, letterSpacing: ".1em" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,.12)" } }), _t(lang, "OU", "OR", "O"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,.12)" } })), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onPay, className: "gbtn", style: { width: "100%", padding: "13px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, marginBottom: 7 } }, _t(lang, `D\xE9bloquer tout par carte \u2014 ${PRICE_MO}/mois`, `Unlock everything by card \u2014 ${PRICE_MO}/mo`, `Desbloqu\xE9alo todo con tarjeta \u2014 ${PRICE_MO}/mes`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 14, lineHeight: 1.35 } }, _t(lang, "Alertes + reco du jour + pr\xE9vision 7 jours \xB7 acc\xE8s imm\xE9diat \xB7 annule en 2 clics", "Alerts + daily pick + 7-day forecast \xB7 instant access \xB7 cancel in 2 clicks", "Alertas + playa del d\xEDa + pron\xF3stico 7 d\xEDas \xB7 acceso inmediato \xB7 cancela en 2 clics"))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", width: "100%" } }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: PAY_CAPTURE_ONLY ? "#6b6658" : "rgba(255,255,255,.3)",
      fontSize: 12,
      padding: "12px 8px",
      minHeight: 44,
      fontFamily: "inherit"
    } }, _t(lang, "Non merci, fermer", "No thanks, close", "No gracias, cerrar")))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 48, marginBottom: 16 } }, "\u2705"), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 24, color: "#fff", margin: "0 0 10px 0" } }, _t(lang, "La veille est lanc\xE9e.", "Your watch is on.", "La vigilancia empez\xF3.")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.5, margin: "0 0 20px" } }, _t(lang, "On t'envoie le brief sargasses par email \u2014 ta meilleure plage, les jours propres, et une alerte si \xE7a se d\xE9grade.", "We'll email you the sargassum brief \u2014 your best beach, clean days, and an alert if it worsens.", "Te enviamos el informe de sargazo por email \u2014 tu mejor playa, los d\xEDas limpios y una alerta si empeora.")), onPay && /* @__PURE__ */ React.createElement("button", { onClick: onPay, style: { background: "none", border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, color: "rgba(255,255,255,.8)", fontSize: 13, fontWeight: 600, padding: "11px 20px", cursor: "pointer", fontFamily: "inherit" } }, _t(lang, "Ou d\xE9bloque tout maintenant \u2192", "Or unlock everything now \u2192", "O desbloqu\xE9alo todo ahora \u2192"))))
  );
}
function ExitEmailBand({ lang, pick: pick2, onClose, trigger = "exitcap" }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setBusy(true);
    s("sg_email", email);
    submitLead(email, "exit_intent");
    track("sg_exitcap_submit", { trigger, beach_id: pick2 && pick2.id, score: pick2 && pick2.score });
    setDone(true);
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(10,23,20,.96)",
    border: "1px solid rgba(255,199,44,.45)",
    borderRadius: 16,
    padding: "11px 14px",
    maxWidth: 400,
    boxShadow: "0 8px 24px rgba(0,0,0,.5)",
    animation: "slideUp .35s cubic-bezier(.22,1,.36,1)"
  } }, done ? /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 12.5, fontWeight: 700, color: C.green, textAlign: "center", padding: "3px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, marginRight: 6 } }, "\u2705"), _t(lang, "C'est not\xE9 \u2014 Le Veilleur t'\xE9crit demain matin : le verdict de ta plage, mesur\xE9 au satellite cette nuit.", "Done \u2014 the Watchman writes tomorrow morning: your beach's verdict, measured by satellite overnight.", "Listo \u2014 el Vig\xEDa te escribe ma\xF1ana: el veredicto de tu playa, medido por sat\xE9lite esta noche.")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 9, borderRadius: 5, background: C.green, flexShrink: 0, boxShadow: "0 0 8px " + C.green, marginTop: 3, alignSelf: "flex-start" } }), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, style: { flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "#fff", lineHeight: 1.3 } }, /* @__PURE__ */ React.createElement("b", null, pick2 && pick2.name), pick2 && pick2.score != null && /* @__PURE__ */ React.createElement("span", { style: { color: C.green } }, " \xB7 ", pick2.score, "/100"), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: "rgba(255,255,255,.65)" } }, _t(lang, "Re\xE7ois la pr\xE9vision de demain matin par email.", "Get tomorrow morning's forecast by email.", "Recibe el pron\xF3stico de ma\xF1ana por email."))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 7 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      inputMode: "email",
      autoComplete: "email",
      placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
      "aria-label": _t(lang, "Ton email pour la pr\xE9vision", "Your email for the forecast", "Tu email para el pron\xF3stico"),
      value: email,
      onChange: (e) => setEmail(e.target.value),
      style: {
        flex: 1,
        padding: "9px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,.14)",
        fontSize: 16,
        fontFamily: "inherit",
        background: "rgba(255,255,255,.07)",
        outline: "none",
        minWidth: 0,
        color: "#fff"
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: busy, style: {
    padding: "9px 13px",
    borderRadius: 10,
    border: "none",
    cursor: busy ? "wait" : "pointer",
    background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
    color: C.ink,
    fontSize: 12.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    opacity: busy ? 0.6 : 1
  } }, busy ? "\u2026" : _t(lang, "Recevoir \u2192", "Get it \u2192", "Recibir \u2192")))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onClose,
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,.8)",
        fontSize: 20,
        lineHeight: 1,
        cursor: "pointer",
        padding: 0,
        alignSelf: "flex-start",
        width: 44,
        height: 44,
        flexShrink: 0
      }
    },
    "\xD7"
  )));
}
function VeilleurGlyph() {
  return /* @__PURE__ */ React.createElement("svg", { viewBox: "-96 -106 192 184", width: "112", height: "107", style: { display: "block" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("radialGradient", { id: "evcHalo", cx: "50%", cy: "44%", r: "55%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#1EC8B0", stopOpacity: ".55" }), /* @__PURE__ */ React.createElement("stop", { offset: ".6", stopColor: "#009E8E", stopOpacity: ".16" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#009E8E", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "evcIris", cx: "42%", cy: "34%", r: "74%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#aaffe0" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#1EC8B0" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#0A6F63" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "evcBeam", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFE47A", stopOpacity: ".5" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFE47A", stopOpacity: "0" }))), /* @__PURE__ */ React.createElement("circle", { r: "84", fill: "url(#evcHalo)" }), /* @__PURE__ */ React.createElement("path", { d: "M-15 30 L15 30 L42 86 L-42 86 Z", fill: "url(#evcBeam)" }), /* @__PURE__ */ React.createElement("g", { stroke: "#0A1714", strokeWidth: "6.5", strokeLinejoin: "round", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("rect", { x: "-78", y: "-14", width: "26", height: "34", rx: "5", fill: "#009E8E", transform: "rotate(-10 -65 3)" }), /* @__PURE__ */ React.createElement("rect", { x: "52", y: "-14", width: "26", height: "34", rx: "5", fill: "#0A6F63", transform: "rotate(10 65 3)" }), /* @__PURE__ */ React.createElement("line", { x1: "-52", y1: "3", x2: "-34", y2: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "52", y1: "3", x2: "34", y2: "3" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "2", rx: "38", ry: "36", fill: "#FDFCF7" })), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "6", r: "19", fill: "url(#evcIris)", stroke: "#0D0D0D", strokeWidth: "5.5" }), /* @__PURE__ */ React.createElement("path", { d: "M-12 6 a12 10 0 0 1 24 0", fill: "none", stroke: "#0A1714", strokeWidth: "4.5", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "2", r: "4", fill: "#EAFFF8" }), /* @__PURE__ */ React.createElement("path", { d: "M0 -34 q8 -18 -3 -32", stroke: "#0D0D0D", strokeWidth: "6", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "-3", cy: "-70", r: "10", fill: "#FFC72C", stroke: "#0D0D0D", strokeWidth: "4" }));
}
function ExitVeilleurCard({ lang, pick: pick2, forecast, onClose, trigger = "exit" }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const sw = useSwipeClose(() => onClose && onClose("dismiss"), { guardInput: true, threshold: 70 });
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose && onClose("dismiss");
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  const INK = "#0D0D0D";
  const STC = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" };
  const now = /* @__PURE__ */ new Date();
  const WD = lang === "en" ? ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] : lang === "es" ? ["DOM", "LUN", "MAR", "MI\xC9", "JUE", "VIE", "S\xC1B"] : ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
  const dayLabel = (i) => i === 0 ? _t(lang, "AUJ", "TODAY", "HOY") : i === 1 ? _t(lang, "DEM", "TMRW", "MA\xD1") : WD[new Date(now.getFullYear(), now.getMonth(), now.getDate() + i).getDay()];
  const dateNum = (i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i).getDate();
  const statusAt = (i) => i === 0 ? forecast && forecast[0] || pick2 && pick2.status : forecast && forecast[i] || null;
  const submit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    s("sg_email", email);
    submitLead(email, "exit_intent");
    track("sg_exitcap_submit", { trigger, beach_id: pick2 && pick2.id, score: pick2 && pick2.score, variant: "veilleur" });
    setDone(true);
    setTimeout(() => {
      try {
        onClose && onClose("submitted");
      } catch (_) {
      }
    }, 2300);
  };
  const hl = { background: "#FFC72C", borderRadius: 6, padding: "0 .12em" };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose && onClose("dismiss");
      },
      role: "dialog",
      "aria-modal": "true",
      "aria-label": _t(lang, "Recevoir le brief plage par email", "Get the beach brief by email", "Recibir el brief de playa por email"),
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 1098,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "radial-gradient(135% 105% at 50% 12%, rgba(13,30,28,.42), rgba(13,30,28,.62) 70%)",
        animation: "fadeIn .2s ease both"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: 430, maxWidth: "96%" } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: -72, left: "50%", transform: "translateX(-50%)", zIndex: 0, width: 112, pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(VeilleurGlyph, null)), /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: sw.ref,
        onTouchStart: sw.onTouchStart,
        onTouchMove: sw.onTouchMove,
        onTouchEnd: sw.onTouchEnd,
        style: {
          position: "relative",
          zIndex: 1,
          background: "#FDFCF7",
          border: "2.6px solid " + INK,
          borderRadius: 20,
          boxShadow: "6px 6px 0 " + INK,
          padding: "46px 22px 18px",
          overflow: "hidden",
          animation: "slideUp .38s cubic-bezier(.34,1.56,.64,1) both"
        }
      },
      /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: 0, left: 0, right: 0, height: 12, background: "linear-gradient(90deg,#155A5A,#C97E3A 55%,#F2B05E)" } }),
      /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", width: 42, height: 5, borderRadius: 3, background: "rgba(13,13,13,.18)" } }),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => onClose && onClose("dismiss"),
          "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
          style: { position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: "50%", border: "2px solid " + INK, background: "#FDFCF7", color: INK, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }
        },
        "\xD7"
      ),
      done ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 0" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 6, marginBottom: 13 } }, [0, 1, 2, 3, 4, 5, 6].map((i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 30, height: 30, borderRadius: 8, border: "2px solid " + INK, boxShadow: "2px 2px 0 " + INK, background: STC[statusAt(i)] || "#CFC4A6" } }))), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 23, color: INK, textTransform: "uppercase", lineHeight: 1, marginBottom: 6 } }, _t(lang, "C'est verrouill\xE9. Je veille.", "Locked in. I'm watching.", "Listo. Yo vigilo.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 13.5, color: "#3a2f1a" } }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: STC.clean, strokeWidth: "2.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: INK, strokeWidth: "2.2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12.5l2.5 2.5L16 9.5" })), /* @__PURE__ */ React.createElement("span", null, _t(lang, "Demain 7h, le bon plan arrive.", "Tomorrow 7am, your plan lands.", "Ma\xF1ana 7h llega tu plan.")))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "inline-block", background: INK, color: "#FDFCF7", fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", padding: "4px 11px", borderRadius: 7, marginBottom: 11 } }, _t(lang, "Le Veilleur a pr\xE9par\xE9 ta semaine", "The Watcher prepped your week", "El Vig\xEDa prepar\xF3 tu semana")), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", color: INK, fontSize: 28, lineHeight: 0.94, letterSpacing: "-.015em", textTransform: "uppercase", marginBottom: 13 } }, _t(lang, /* @__PURE__ */ React.createElement(React.Fragment, null, "Ta ", /* @__PURE__ */ React.createElement("span", { style: hl }, "semaine"), " de plages propres est pr\xEAte."), /* @__PURE__ */ React.createElement(React.Fragment, null, "Your ", /* @__PURE__ */ React.createElement("span", { style: hl }, "week"), " of clean beaches is ready."), /* @__PURE__ */ React.createElement(React.Fragment, null, "Tu ", /* @__PURE__ */ React.createElement("span", { style: hl }, "semana"), " de playas limpias est\xE1 lista."))), pick2 && pick2.score != null && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1.6px solid " + INK, borderRadius: 11, padding: "8px 11px", marginBottom: 13 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 11, height: 11, borderRadius: "50%", background: STC[pick2.status] || "#9aa0a8", border: "1.5px solid " + INK, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 13, color: "#3a2f1a", lineHeight: 1.2, minWidth: 0 } }, _t(lang, "Aujourd'hui la plus propre", "Today's cleanest", "La m\xE1s limpia hoy"), " : ", /* @__PURE__ */ React.createElement("b", null, pick2.name)), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 16, color: STC[pick2.status] || INK, whiteSpace: "nowrap" } }, pick2.score, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#6b6478" } }, "/100"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, marginBottom: 7 } }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const unlocked = i <= 1;
        const c = unlocked ? STC[statusAt(i)] || "#9aa0a8" : "#CFC4A6";
        return /* @__PURE__ */ React.createElement("div", { key: i, style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 11, color: unlocked ? INK : "#9a8f7a", marginBottom: 3 } }, dayLabel(i)), /* @__PURE__ */ React.createElement("div", { style: { height: 38, borderRadius: 9, border: "2px solid " + INK, boxShadow: unlocked ? "2px 2px 0 " + INK : "none", background: c, display: "flex", alignItems: "center", justifyContent: "center" } }, unlocked ? /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 14, color: "#0D0D0D", textShadow: "0 1px 0 rgba(255,255,255,.55)" } }, dateNum(i)) : /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#6b5f3f", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11V8a4 4 0 0 1 8 0" }))));
      })), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 11.5, color: "#6b6478", marginBottom: 12 } }, _t(lang, "5 jours d\xE9verrouill\xE9s par e-mail \xB7 confiance affich\xE9e honn\xEAtement", "5 days unlocked by email \xB7 confidence shown honestly", "5 d\xEDas por email \xB7 confianza mostrada con honestidad")), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 14, color: "#3a2f1a", lineHeight: 1.35, marginBottom: 12 } }, _t(lang, /* @__PURE__ */ React.createElement(React.Fragment, null, "Demain ce sera peut-\xEAtre une ", /* @__PURE__ */ React.createElement("b", null, "autre"), " plage. Re\xE7ois le bon plan chaque matin \xE0 ", /* @__PURE__ */ React.createElement("b", { style: { ...hl, color: "#0D0D0D" } }, "7h"), "."), /* @__PURE__ */ React.createElement(React.Fragment, null, "Tomorrow it may be a ", /* @__PURE__ */ React.createElement("b", null, "different"), " beach. Get the plan every morning at ", /* @__PURE__ */ React.createElement("b", { style: { ...hl, color: "#0D0D0D" } }, "7am"), "."), /* @__PURE__ */ React.createElement(React.Fragment, null, "Ma\xF1ana quiz\xE1 sea ", /* @__PURE__ */ React.createElement("b", null, "otra"), " playa. Recibe el plan cada ma\xF1ana a las ", /* @__PURE__ */ React.createElement("b", { style: { ...hl, color: "#0D0D0D" } }, "7h"), "."))), /* @__PURE__ */ React.createElement("form", { onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "2px solid " + INK, borderRadius: 12, padding: "3px 4px 3px 12px", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "#5A5A5A", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M3 7l9 6 9-6" })), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          required: true,
          value: email,
          onChange: (e) => setEmail(e.target.value),
          placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
          "aria-label": _t(lang, "Ton email pour d\xE9bloquer la semaine", "Your email to unlock the week", "Tu email para desbloquear la semana"),
          style: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 16, color: INK, padding: "9px 0" }
        }
      )), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "sg-paygold", style: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: "linear-gradient(158deg,#FFE47A,#FFC72C 40%,#E89400)",
        color: "#1a1300",
        border: "2.4px solid " + INK,
        borderRadius: 100,
        boxShadow: "5px 5px 0 " + INK,
        fontFamily: "'Anton',sans-serif",
        fontSize: 17,
        textTransform: "uppercase",
        padding: "12px 18px",
        cursor: "pointer"
      } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "#1a1300", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11V8a4 4 0 0 1 7.5-1.5" })), _t(lang, "D\xE9verrouille ma semaine", "Unlock my week", "Desbloquea mi semana"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 11.5, color: "#6b6478", marginTop: 11 } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "#6b6478", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6z" }), /* @__PURE__ */ React.createElement("path", { d: "M10 20a2 2 0 0 0 4 0" })), /* @__PURE__ */ React.createElement("span", null, _t(lang, "Alerte la veille \xB7 1 brief/matin \xE0 7h \xB7 stop quand tu veux", "Day-before alert \xB7 1 brief each morning at 7am \xB7 stop anytime", "Aviso la v\xEDspera \xB7 1 brief cada ma\xF1ana a las 7h \xB7 cancela cuando quieras"))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => onClose && onClose("dismiss"), style: { background: "none", border: "none", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 12, color: "#9a8f7a", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", minHeight: 44, padding: "10px 0" } }, _t(lang, "Non merci, je pars sans", "No thanks, I'll leave without it", "No gracias, me voy sin \xE9l"))))
    ))
  );
}
function InlineEmailCapture({ lang, beachName, source = "inline_beach" }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tracked = useRef(false);
  if (!submitted && (dismissed || g("sg_email_prompt", false) || g("sg_email_snooze", 0) > Date.now())) return null;
  const em1V = "control";
  const em2V = "control";
  if (!tracked.current) {
    tracked.current = true;
    track("sg_smart_email_trigger", { visit_count: g("sg_visit_count", 0) });
    track("sg_email_view");
  }
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setBusy(true);
    track("sg_email_submit", { source, variant: em1V });
    s("sg_email", email);
    s("sg_email_prompt", true);
    setSubmitted(true);
    submitLead(email, source);
  };
  if (submitted && em2V === "progressive") {
    const watch = beachName || _t(lang, "ta plage", "your beach", "tu playa");
    const steps = [
      { d: _t(lang, "Maintenant", "Now", "Ahora"), t: _t(lang, `On commence \xE0 veiller ${watch}.`, `We start watching ${watch}.`, `Empezamos a vigilar ${watch}.`) },
      { d: _t(lang, "Dans 3 jours", "In 3 days", "En 3 d\xEDas"), t: _t(lang, "Les plages propres de la semaine, par email.", "This week's clean beaches, by email.", "Las playas limpias de la semana, por email.") },
      { d: _t(lang, "Chaque semaine", "Every week", "Cada semana"), t: _t(lang, "Ton r\xE9cap + une alerte si \xE7a se d\xE9grade.", "Your recap + an alert if it worsens.", "Tu resumen + una alerta si empeora.") }
    ];
    return /* @__PURE__ */ React.createElement("div", { style: {
      margin: "0 0 12px",
      padding: "16px",
      borderRadius: 16,
      background: "linear-gradient(135deg,#190c2c,#142824)",
      border: "1px solid rgba(255,199,44,.18)"
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 800, color: C.green, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18 } }, "\u2705"), _t(lang, "La veille est lanc\xE9e.", "Your watch is on.", "La vigilancia empez\xF3.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 0 } }, steps.map((s2, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 11, alignItems: "flex-start", paddingBottom: i < steps.length - 1 ? 12 : 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: 11,
      height: 11,
      borderRadius: 6,
      marginTop: 2,
      background: i === 0 ? "linear-gradient(180deg,#FFE47A,#E8A800)" : "rgba(255,255,255,.18)"
    } }), i < steps.length - 1 && /* @__PURE__ */ React.createElement("div", { style: { width: 2, flex: 1, minHeight: 18, background: "rgba(255,255,255,.12)", marginTop: 3 } })), /* @__PURE__ */ React.createElement("div", { style: { paddingTop: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: i === 0 ? "#FFC72C" : "rgba(255,255,255,.4)" } }, s2.d), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "rgba(255,255,255,.8)", lineHeight: 1.4, marginTop: 1 } }, s2.t))))));
  }
  if (submitted) return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "0 0 12px",
    padding: "14px 16px",
    borderRadius: 16,
    background: "linear-gradient(135deg,#190c2c,#142824)",
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: C.green
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20, display: "block", marginBottom: 4 } }, "\u2705"), _t(lang, "C'est fait ! Premier email dans 3 jours.", "You're in! First email in 3 days.", "\xA1Listo! Primer email en 3 d\xEDas."));
  if (em2V === "progressive") {
    const chips = [
      _t(lang, "Auj. : c'est lanc\xE9", "Today: it's on", "Hoy: ya est\xE1"),
      _t(lang, "J+3 : plages propres", "Day 3: clean beaches", "D\xEDa 3: playas limpias"),
      _t(lang, "Hebdo : r\xE9cap + alerte", "Weekly: recap + alert", "Semanal: resumen + alerta")
    ];
    return /* @__PURE__ */ React.createElement("div", { style: {
      margin: "0 0 12px",
      padding: "15px 16px",
      borderRadius: 16,
      background: "linear-gradient(135deg,#190c2c,#142824)",
      border: "1px solid rgba(255,199,44,.2)",
      position: "relative",
      overflow: "hidden"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "-60%",
      right: "-15%",
      width: "55%",
      height: "220%",
      background: "radial-gradient(ellipse,rgba(255,199,44,.08) 0%,transparent 70%)",
      pointerEvents: "none"
    } }), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 800, color: "#FFC72C", textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 6 } }, _t(lang, "Gratuit \xB7 sans carte", "Free \xB7 no card", "Gratis \xB7 sin tarjeta")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 800, color: "#fff", marginBottom: 4, lineHeight: 1.25 } }, beachName ? _t(lang, `Fais veiller ${beachName} pour toi`, `Have ${beachName} watched for you`, `Haz que vigilen ${beachName} por ti`) : _t(lang, "Fais veiller ta plage pour toi", "Have your beach watched for you", "Haz que vigilen tu playa por ti")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "rgba(255,255,255,.55)", marginBottom: 11, lineHeight: 1.4 } }, _t(
      lang,
      "La veille d\xE9marre tout de suite, et la valeur arrive jour apr\xE8s jour.",
      "The watch starts now, and value lands day after day.",
      "La vigilancia empieza ya, y el valor llega d\xEDa tras d\xEDa."
    )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 } }, chips.map((c, i) => /* @__PURE__ */ React.createElement("span", { key: i, style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: "rgba(255,255,255,.75)",
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.1)",
      borderRadius: 8,
      padding: "4px 9px"
    } }, c))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        inputMode: "email",
        autoComplete: "email",
        placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
        "aria-label": _t(lang, "Ton email pour le brief matinal", "Your email for morning brief", "Tu email para el informe matinal"),
        value: email,
        onChange: (e) => setEmail(e.target.value),
        disabled: busy,
        style: {
          flex: 1,
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,.12)",
          fontSize: 16,
          fontFamily: "inherit",
          background: "rgba(255,255,255,.06)",
          outline: "none",
          minWidth: 0,
          color: "#fff",
          opacity: busy ? 0.6 : 1
        }
      }
    ), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: busy, style: {
      padding: "10px 16px",
      borderRadius: 12,
      border: "none",
      cursor: busy ? "wait" : "pointer",
      background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
      color: C.ink,
      fontSize: 13,
      fontWeight: 800,
      whiteSpace: "nowrap",
      fontFamily: "inherit",
      boxShadow: "0 2px 12px rgba(232,168,0,.3)",
      opacity: busy ? 0.6 : 1
    } }, busy ? "\u2026" : _t(lang, "Commencer \u2192", "Start \u2192", "Empezar \u2192"))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setDismissed(true);
      s("sg_email_snooze", Date.now() + 12096e5);
      track("sg_email_dismiss");
    }, style: {
      display: "block",
      margin: "8px auto 0",
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "rgba(255,255,255,.3)",
      fontSize: 11,
      padding: "10px 0",
      minHeight: 44
    } }, _t(lang, "Plus tard", "Not now", "Ahora no"))));
  }
  return /* @__PURE__ */ React.createElement("div", { style: {
    margin: "0 0 12px",
    padding: "14px 16px",
    borderRadius: 16,
    background: "linear-gradient(135deg,#190c2c,#142824)",
    border: "1px solid rgba(255,255,255,.08)",
    position: "relative",
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: "-50%",
    left: "-20%",
    width: "60%",
    height: "200%",
    background: "radial-gradient(ellipse, rgba(34,197,94,.06) 0%, transparent 70%)",
    pointerEvents: "none"
  } }), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,.4)",
    textTransform: "uppercase",
    letterSpacing: ".08em",
    marginBottom: 6
  } }, _t(lang, "GRATUIT", "FREE", "GRATIS")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 } }, beachName ? _t(lang, `Verdict de ${beachName} \u2014 chaque matin`, `${beachName} \u2014 daily verdict`, `${beachName} \u2014 veredicto diario`) : em1V === "curiosity" ? _t(lang, "O\xF9 est la plus belle plage aujourd'hui ?", "Where's the cleanest beach today?", "\xBFD\xF3nde est\xE1 la mejor playa hoy?") : SARGASSES_SEASON === "high" ? _t(lang, "Les plages changent tous les jours", "Beaches are changing fast", "Las playas cambian todos los d\xEDas") : _t(lang, "Sois pr\xE9venu avant de partir", "Know before you go", "Ent\xE9rate antes de salir")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 12, lineHeight: 1.4 } }, em1V === "curiosity" ? _t(lang, "On te le dit chaque matin. Gratuit.", "We tell you every morning. Free.", "Te lo decimos cada ma\xF1ana. Gratis.") : SARGASSES_SEASON === "high" ? _t(lang, "Re\xE7ois une alerte quand ta plage change de statut. Gratuit.", "Get alerted when your beach status changes. Free.", "Recibe una alerta cuando tu playa cambie de estado. Gratis.") : _t(lang, "Bilan hebdo + alerte si \xE7a change. Gratuit.", "Weekly beach status + alerts if things change. Free.", "Resumen semanal + alerta si algo cambia. Gratis.")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      inputMode: "email",
      autoComplete: "email",
      placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
      "aria-label": _t(lang, "Ton email pour l'alerte", "Your email for alerts", "Tu email para alertas"),
      value: email,
      onChange: (e) => setEmail(e.target.value),
      style: {
        flex: 1,
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.12)",
        fontSize: 16,
        fontFamily: "inherit",
        background: "rgba(255,255,255,.06)",
        outline: "none",
        minWidth: 0,
        color: "#fff"
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "submit", style: {
    padding: "10px 18px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
    color: C.ink,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    boxShadow: "0 2px 12px rgba(232,168,0,.3)"
  } }, _t(lang, "OK", "Go", "OK"))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setDismissed(true);
    s("sg_email_snooze", Date.now() + 12096e5);
    track("sg_email_dismiss");
  }, style: {
    display: "block",
    margin: "8px auto 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "rgba(255,255,255,.3)",
    fontSize: 11,
    padding: "10px 0",
    minHeight: 44
  } }, _t(lang, "Plus tard", "Not now", "Ahora no"))));
}
function FeedbackWidget() {
  const lang = getLang();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  useEffect(() => {
    if (g("sg_feedback_done", false)) return;
    const visits = g("sg_visits", 0) + 1;
    s("sg_visits", visits);
    if (visits < 3) return;
    const t = setTimeout(() => {
      if (mountedRef.current) setVisible(true);
    }, 3e4);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const submit = () => {
    track("sg_feedback", { rating, text: text.slice(0, 200) });
    const island2 = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ";
    try {
      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "feedback", rating, text: text.slice(0, 500), island: island2, date: (/* @__PURE__ */ new Date()).toISOString() })
      }).catch(() => {
      });
    } catch {
    }
    s("sg_feedback_done", true);
    setStep(2);
    setTimeout(() => {
      if (mountedRef.current) setVisible(false);
    }, 2e3);
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 160px)",
    left: 12,
    right: 12,
    zIndex: 755,
    background: "var(--sg-card,#fff)",
    borderRadius: 18,
    padding: "16px 18px",
    boxShadow: "0 8px 32px rgba(0,0,0,.15),0 0 0 1px var(--sg-border)",
    animation: "slideUp .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setVisible(false);
        s("sg_feedback_done", true);
      },
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: {
        position: "absolute",
        top: 4,
        right: 4,
        background: "none",
        border: "none",
        color: "var(--sg-mid)",
        cursor: "pointer",
        fontSize: 16,
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    },
    "\u2715"
  ), step === 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--sg-ink)", marginBottom: 10 } }, _t(lang, "Cette app t'est utile ?", "Is this app useful to you?", "\xBFTe resulta \xFAtil esta app?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, justifyContent: "center" } }, [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: n,
      onClick: () => {
        setRating(n);
        setStep(1);
      },
      style: {
        width: 44,
        height: 44,
        borderRadius: 12,
        border: "1.5px solid var(--sg-border)",
        background: rating === n ? C.goldBg : "var(--sg-card)",
        cursor: "pointer",
        fontSize: 18,
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all .2s"
      }
    },
    n <= 2 ? "\u{1F615}" : n === 3 ? "\u{1F610}" : n === 4 ? "\u{1F642}" : "\u{1F929}"
  ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--sg-mid)", marginTop: 4, padding: "0 4px" } }, /* @__PURE__ */ React.createElement("span", null, _t(lang, "Pas du tout", "Not at all", "Para nada")), /* @__PURE__ */ React.createElement("span", null, _t(lang, "Indispensable", "Essential", "Imprescindible")))), step === 1 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--sg-ink)", marginBottom: 8 } }, rating >= 4 ? _t(lang, "Super ! Qu'est-ce qui te plait le plus ?", "Great! What do you like the most?", "\xA1Genial! \xBFQu\xE9 es lo que m\xE1s te gusta?") : _t(lang, "Qu'est-ce qui manque ?", "What's missing?", "\xBFQu\xE9 falta?")), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: text,
      onChange: (e) => setText(e.target.value),
      placeholder: rating >= 4 ? _t(lang, "Ce que j'utilise le plus...", "What I use the most...", "Lo que m\xE1s uso...") : _t(lang, "Ce qui me manque...", "What I'm missing...", "Lo que me falta..."),
      style: {
        width: "100%",
        height: 60,
        borderRadius: 10,
        border: "1.5px solid var(--sg-border)",
        padding: "8px 10px",
        fontSize: 16,
        fontFamily: "inherit",
        resize: "none",
        background: "var(--sg-bgD)",
        color: "var(--sg-ink)"
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: submit, style: {
    width: "100%",
    marginTop: 8,
    padding: "10px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    background: "linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
    fontSize: 13,
    fontWeight: 700,
    color: C.ink
  } }, _t(lang, "Envoyer", "Send", "Enviar"))), step === 2 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 24 } }, "\u{1F64F}"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--sg-ink)", marginTop: 4 } }, _t(lang, "Merci pour ton retour !", "Thanks for your feedback!", "\xA1Gracias por tu opini\xF3n!"))));
}
function FavToast({ show, lang, onPremiumClick, isPremium }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), isPremium ? 3e3 : 5e3);
    return () => clearTimeout(t);
  }, [show, isPremium]);
  if (!visible) return null;
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "calc(74px + env(safe-area-inset-bottom, 0px))",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 805,
    background: "var(--sg-card,#fff)",
    color: "var(--sg-ink)",
    boxSizing: "border-box",
    padding: isPremium ? "10px 18px" : "12px 16px",
    borderRadius: 14,
    boxShadow: "0 4px 20px rgba(0,0,0,.12),0 0 0 1px var(--sg-border)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    maxWidth: "calc(100vw - 32px)",
    animation: "slideUp .3s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { color: C.green, fontSize: 16 } }, "\u2713"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" } }, _t(lang, "Ajout\xE9 aux favoris", "Added to favorites", "Agregada a favoritos")), !isPremium && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", marginTop: 2 } }, _t(lang, "Re\xE7ois une alerte quand \xE7a change", "Get alerts when conditions change", "Recibe una alerta cuando cambie"))), !isPremium && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_fav_toast_premium_click");
        onPremiumClick("fav_toast");
        setVisible(false);
      },
      style: {
        flexShrink: 0,
        background: C.gold,
        color: C.ink,
        border: "none",
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
        whiteSpace: "nowrap"
      }
    },
    _t(lang, "Alertes", "Alerts", "Alertas")
  ));
}
function InstallPrompt({ canAutoShow = true } = {}) {
  const lang = getLang();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosTutorial, setShowIosTutorial] = useState(false);
  const [dismissed, setDismissed] = useState(() => !!g("sg_pwa_prompt", 0));
  const [alertIntent, setAlertIntent] = useState(false);
  const isIos = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);
  const isStandalone = useMemo(() => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || window.matchMedia("(display-mode: minimal-ui)").matches || window.navigator.standalone === true, []);
  useEffect(() => {
    if (isStandalone) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isStandalone]);
  useEffect(() => {
    if (!canAutoShow || dismissed || isStandalone) return;
    const showPrompt = (reason) => {
      setVisible(true);
      s("sg_pwa_prompt", 1);
      track("sg_pwa_prompt_shown", { platform: isIos ? "ios" : "android", reason });
    };
    const checkEngagement = () => {
      const beachViews = parseInt(sessionStorage.getItem("sg_beach_views") || "0");
      if (beachViews >= 2) showPrompt("beach-views");
    };
    const interval = setInterval(checkEngagement, 5e3);
    const fallback = setTimeout(() => {
      if (visible) return;
      const seen = parseInt(sessionStorage.getItem("sg_beach_views") || "0");
      if (seen >= 1) showPrompt(isIos ? "ios-engaged" : "android-fallback");
    }, 45e3);
    return () => {
      clearInterval(interval);
      clearTimeout(fallback);
    };
  }, [canAutoShow, dismissed, isStandalone]);
  useEffect(() => {
    if (isStandalone) return;
    const h = () => {
      let seen = false;
      try {
        seen = !!sessionStorage.getItem("sg_pwa_alert_nudge");
      } catch (_) {
      }
      if (seen) return;
      try {
        sessionStorage.setItem("sg_pwa_alert_nudge", "1");
      } catch (_) {
      }
      setAlertIntent(true);
      setDismissed(false);
      setVisible(true);
      track("sg_pwa_prompt_shown", { platform: isIos ? "ios" : "android", reason: "alert-intent" });
    };
    window.addEventListener("sg:alert_intent", h);
    return () => window.removeEventListener("sg:alert_intent", h);
  }, [isStandalone, isIos]);
  useEffect(() => {
    if (!visible || showIosTutorial) return;
    const t = setTimeout(() => {
      setVisible(false);
      setDismissed(true);
      track("sg_pwa_autohide", { platform: isIos ? "ios" : "android" });
    }, 15e3);
    return () => clearTimeout(t);
  }, [visible, showIosTutorial]);
  if (!visible || isStandalone) return null;
  const handleInstall = async () => {
    if (deferredPrompt) {
      track("sg_pwa_install", { platform: "android" });
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      track("sg_pwa_install_result", { outcome, platform: "android" });
      setVisible(false);
      setDismissed(true);
      s("sg_pwa_prompt", 1);
    } else if (isIos) {
      track("sg_pwa_ios_tutorial_open");
      setShowIosTutorial(true);
    }
  };
  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
    s("sg_pwa_prompt", 1);
    track("sg_pwa_dismiss", { platform: isIos ? "ios" : "android" });
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "calc(60px + max(12px, env(safe-area-inset-bottom,0px)) + 160px)",
    left: 12,
    right: 12,
    maxWidth: 430,
    margin: "0 auto",
    zIndex: alertIntent ? 1450 : 760,
    background: "linear-gradient(135deg,rgba(0,158,142,.95),rgba(30,200,176,.92))",
    backdropFilter: "blur(16px)",
    borderRadius: 18,
    padding: "14px 16px",
    boxShadow: "0 8px 32px rgba(0,158,142,.35)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    animation: "slideUp .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: "rgba(255,255,255,.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    flexShrink: 0
  } }, "\u{1F4F1}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#fff" } }, isIos ? _t(lang, "Ajoute l'app sur ton iPhone", "Add the app to your iPhone", "A\xF1ade la app a tu iPhone") : _t(lang, "Installer l'app", "Install the app", "Instalar la app")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.7)", marginTop: 1 } }, isIos ? _t(lang, "Acc\xE8s direct + alertes sargasses", "Quick access + sargassum alerts", "Acceso directo + alertas de sargazo") : _t(lang, "Acc\xE8s direct, alertes push, hors-ligne", "Quick access, push alerts, offline", "Acceso directo, alertas push, sin conexi\xF3n"))), /* @__PURE__ */ React.createElement("button", { onClick: handleInstall, style: {
    background: "#fff",
    color: C.teal,
    border: "none",
    borderRadius: 12,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0
  } }, isIos ? _t(lang, "Voir comment", "See how", "Ver c\xF3mo") : _t(lang, "Installer", "Install", "Instalar")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: dismiss,
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: {
        position: "absolute",
        top: 2,
        right: 2,
        background: "none",
        border: "none",
        color: "rgba(255,255,255,.5)",
        cursor: "pointer",
        fontSize: 16,
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    },
    "\u2715"
  )), showIosTutorial && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "backdrop",
      onClick: () => {
        setShowIosTutorial(false);
        dismiss();
      },
      style: { zIndex: alertIntent ? 1460 : 1200 }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: alertIntent ? 1461 : 1201,
    background: "var(--sg-card,#fff)",
    borderRadius: "24px 24px 0 0",
    padding: "28px 24px 40px",
    maxHeight: "70vh",
    overflowX: "hidden",
    overflowY: "auto",
    boxShadow: "0 -8px 40px rgba(0,0,0,.2)",
    animation: "slideUp .4s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("div", { className: "sheet-handle" }), /* @__PURE__ */ React.createElement("h3", { className: "anton", style: { fontSize: 22, marginBottom: 4, color: "var(--sg-ink)" } }, _t(lang, "Ajoute Sargasses sur ton iPhone", "Add the app to your iPhone", "A\xF1ade la app a tu iPhone")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "var(--sg-mid)", marginBottom: 16, lineHeight: 1.5 } }, _t(lang, "En 3 secondes, tu auras l'app sur ton ecran d'accueil avec les alertes sargasses.", "In 3 seconds you'll have the app on your home screen with sargassum alerts.", "En 3 segundos tendr\xE1s la app en tu pantalla de inicio con alertas de sargazo.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: C.tealBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
    color: C.teal,
    flexShrink: 0
  } }, "1"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--sg-ink)" } }, _t(lang, "Appuie sur", "Tap", "Pulsa"), " ", /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    background: "rgba(0,122,255,.1)",
    borderRadius: 6,
    fontSize: 18,
    verticalAlign: "middle"
  } }, "\u2B06\uFE0F"), " ", _t(lang, "en bas de Safari", "at the bottom of Safari", "abajo en Safari")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid)", marginTop: 2 } }, _t(lang, "Le bouton partager (carre avec fleche)", "The share button (square with arrow)", "El bot\xF3n compartir (cuadrado con flecha)")))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: C.tealBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
    color: C.teal,
    flexShrink: 0
  } }, "2"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--sg-ink)" } }, _t(lang, "Scroll et appuie sur", "Scroll and tap", "Desliza y pulsa"), " ", /* @__PURE__ */ React.createElement("strong", null, _t(lang, `"Sur l'ecran d'accueil"`, '"Add to Home Screen"', '"A\xF1adir a pantalla de inicio"'))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid)", marginTop: 2 } }, _t(lang, "Icone + avec un carre", "The + icon with a square", "Icono + con un cuadrado")))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20 } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: C.tealBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
    color: C.teal,
    flexShrink: 0
  } }, "3"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--sg-ink)" } }, _t(lang, "Appuie", "Tap", "Pulsa"), " ", /* @__PURE__ */ React.createElement("strong", null, _t(lang, '"Ajouter"', '"Add"', '"A\xF1adir"')), " ", _t(lang, "en haut a droite", "top right", "arriba a la derecha")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid)", marginTop: 2 } }, _t(lang, "L'app apparait sur ton ecran d'accueil", "The app appears on your home screen", "La app aparece en tu pantalla de inicio")))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowIosTutorial(false);
        dismiss();
        track("sg_pwa_ios_tutorial_done");
      },
      className: "gbtn",
      style: { width: "100%", textAlign: "center", fontSize: 15, padding: "14px 24px" }
    },
    _t(lang, "J'ai compris", "Got it", "Entendido")
  ), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    bottom: -8,
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderTop: "10px solid var(--sg-card,#fff)"
  } }))));
}
function SceneCanvas({ src, focalY = 0.38, onReady }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let gl = null;
    try {
      gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    } catch (_) {
    }
    if (!gl) return;
    let dead = false, raf = 0, tex = null, prog = null, t0 = performance.now();
    const parCur = [0, 0], parTgt = [0, 0];
    const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const FS = `precision mediump float;
uniform sampler2D u_tex;uniform float u_t;uniform vec2 u_res;uniform vec2 u_img;uniform vec2 u_par;uniform float u_fy;
void main(){
  vec2 frag=gl_FragCoord.xy/u_res;          /* 0..1, y vers le haut */
  vec2 uv=vec2(frag.x,1.0-frag.y);          /* y vers le bas, comme l'image */
  /* cover-fit avec point focal vertical (\xE9quivalent object-fit:cover + position center u_fy) */
  float sc=max(u_res.x/u_img.x,u_res.y/u_img.y);
  vec2 vis=u_res/(u_img*sc);                /* fraction visible de l'image */
  vec2 off=vec2((1.0-vis.x)*0.5,(1.0-vis.y)*u_fy);
  vec2 iuv=off+uv*vis;
  /* masque eau en coordonn\xE9es \xC9CRAN : avec le cadrage focal 38%, le bas du
     viewport = avant-plan mer/sable sur nos photos plage (un masque en coord
     image tombait sous le bloc texte mobile et figeait la sc\xE8ne visible) */
  float wm=smoothstep(0.42,0.72,uv.y);
  /* houle : 3 sinuso\xEFdes lentes, subtiles mais visibles */
  float wy=sin(iuv.x*42.0+u_t*1.15)*0.0030+sin(iuv.x*19.0-u_t*0.85)*0.0022;
  float wx=sin(iuv.y*55.0+u_t*1.55)*0.0014;
  vec2 duv=iuv+vec2(wx,wy)*wm+u_par*vec2(0.010,0.007);
  vec3 c=texture2D(u_tex,duv).rgb;
  /* scintillement sp\xE9culaire discret sur l'eau */
  float sp=pow(max(0.0,sin(iuv.x*110.0+u_t*1.9)*sin(iuv.y*75.0-u_t*1.3)),24.0)*wm*0.10;
  /* vignette douce */
  float vg=1.0-0.16*length(frag-vec2(0.5,0.45));
  gl_FragColor=vec4((c+sp)*vg,1.0);
}`;
    const mk = (ty, s2) => {
      const sh = gl.createShader(ty);
      gl.shaderSource(sh, s2);
      gl.compileShader(sh);
      return sh;
    };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    } catch (_) {
      return;
    }
    const uT = gl.getUniformLocation(prog, "u_t"), uRes = gl.getUniformLocation(prog, "u_res"), uImg = gl.getUniformLocation(prog, "u_img"), uPar = gl.getUniformLocation(prog, "u_par"), uFy = gl.getUniformLocation(prog, "u_fy");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (dead) return;
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.uniform2f(uImg, img.naturalWidth, img.naturalHeight);
      gl.uniform1f(uFy, focalY);
      onReady && onReady();
      const size = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
          gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(uRes, cv.width, cv.height);
      };
      let last = 0;
      const loop = (ts) => {
        if (dead) return;
        raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        if (ts - last < 33) return;
        last = ts;
        size();
        parCur[0] += (parTgt[0] - parCur[0]) * 0.06;
        parCur[1] += (parTgt[1] - parCur[1]) * 0.06;
        gl.uniform1f(uT, (ts - t0) / 1e3);
        gl.uniform2f(uPar, parCur[0], parCur[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      raf = requestAnimationFrame(loop);
    };
    img.src = src;
    const onMove = (e) => {
      const x = (e.touches ? e.touches[0] : e).clientX, y = (e.touches ? e.touches[0] : e).clientY;
      parTgt[0] = (x / window.innerWidth - 0.5) * 2;
      parTgt[1] = (y / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      try {
        tex && gl.deleteTexture(tex);
        prog && gl.deleteProgram(prog);
      } catch (_) {
      }
    };
  }, [src, focalY]);
  return /* @__PURE__ */ React.createElement("canvas", { ref, "aria-hidden": true, style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" } });
}
function AlertCapture({ beach, lang }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden] = useState(() => {
    try {
      return !!localStorage.getItem("sg_email");
    } catch (_) {
      return false;
    }
  });
  if (hidden) return null;
  const submit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setBusy(true);
    track("sg_email_submit", { source: "beach_alert", beach_id: beach.id });
    try {
      localStorage.setItem("sg_email", email);
    } catch (_) {
    }
    const island2 = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ";
    try {
      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ email, island: island2, source: "beach_alert", beach_id: beach.id, date: (/* @__PURE__ */ new Date()).toISOString() })
      }).catch(() => {
      });
    } catch (_) {
    }
    setDone(true);
    try {
      window.dispatchEvent(new Event("sg:alert_email_ok"));
    } catch (_) {
    }
  };
  if (done) return /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "rgba(46,204,113,.10)",
    border: "1px solid rgba(46,204,113,.35)",
    borderRadius: 14,
    padding: "11px 13px",
    margin: "0 0 14px",
    fontSize: 12.5,
    fontWeight: 700,
    color: "#1F8A4C"
  } }, "\u2713 ", _t(lang, "C'est not\xE9 \u2014 le verdict du matin arrive dans ta bo\xEEte. D\xE9sinscription en 1 clic.", "Done \u2014 the morning verdict lands in your inbox. 1-click unsubscribe.", "Listo \u2014 el veredicto de la ma\xF1ana llega a tu correo. Baja en 1 clic."));
  if (!open) return /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setOpen(true);
        track("sg_alert_capture_open", { beach_id: beach.id });
      },
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        background: "var(--sg-soft,rgba(0,0,0,.04))",
        border: "1px solid var(--sg-line,rgba(0,0,0,.10))",
        borderRadius: 14,
        padding: "11px 13px",
        margin: "0 0 14px",
        fontFamily: "inherit"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, flexShrink: 0 } }, "\u{1F514}"),
    /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--sg-ink,#1A2B26)" } }, _t(lang, "\xCAtre pr\xE9venu si \xE7a change", "Get notified if this changes", "Av\xEDsame si cambia")),
    /* @__PURE__ */ React.createElement("span", { "aria-hidden": true, style: { fontSize: 14, fontWeight: 800, color: "var(--sg-dim,#7A8A85)" } }, "+")
  );
  return /* @__PURE__ */ React.createElement("form", { onSubmit: submit, style: { display: "flex", gap: 8, margin: "0 0 14px" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      inputMode: "email",
      autoComplete: "email",
      required: true,
      autoFocus: true,
      placeholder: _t(lang, "Ton email \u2014 verdict chaque matin", "Your email \u2014 verdict every morning", "Tu email \u2014 veredicto cada ma\xF1ana"),
      "aria-label": _t(lang, "Ton email pour le verdict quotidien", "Your email for daily verdict", "Tu email para el veredicto diario"),
      value: email,
      onChange: (e) => setEmail(e.target.value),
      style: {
        flex: 1,
        minWidth: 0,
        padding: "11px 13px",
        borderRadius: 14,
        fontSize: 16,
        fontFamily: "inherit",
        border: "1px solid var(--sg-line,rgba(0,0,0,.15))",
        background: "var(--sg-card,#fff)",
        color: "var(--sg-ink,#1A2B26)"
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: busy, style: {
    flexShrink: 0,
    background: "#FFC72C",
    color: "#120821",
    border: "none",
    cursor: busy ? "wait" : "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 13,
    padding: "11px 14px",
    borderRadius: 14,
    opacity: busy ? 0.6 : 1
  } }, busy ? "\u2026" : "OK"));
}
function MethodScene() {
  return /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.09)",
    background: "linear-gradient(180deg,#0C1D21 0%,#120821 100%)"
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 560 300", style: { display: "block", width: "100%", height: "auto" } }, /* @__PURE__ */ React.createElement("style", null, `
.sgms-sat{animation:sgmsOrbit 26s linear 1 both}
@keyframes sgmsOrbit{from{transform:translateX(-90px)}to{transform:translateX(650px)}}
.sgms-beam{animation:sgmsBeam 3.2s ease-in-out 1 both}
@keyframes sgmsBeam{0%,100%{opacity:.07}50%{opacity:.2}}
.sgms-w1{animation:sgmsDrift 13s linear 1 both}
.sgms-w2{animation:sgmsDrift 21s linear 1 both reverse}
@keyframes sgmsDrift{from{transform:translateX(0)}to{transform:translateX(-560px)}}
.sgms-raft1{animation:sgmsRaft 38s linear 1 both}
.sgms-raft2{animation:sgmsRaft 52s linear 1 both;animation-delay:-26s}
@keyframes sgmsRaft{from{transform:translateX(620px)}to{transform:translateX(-160px)}}
.sgms-boat{animation:sgmsBob 4.2s ease-in-out 1 both}
@keyframes sgmsBob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(3.5px) rotate(-1.2deg)}}
.sgms-palm{animation:sgmsSway 5.5s ease-in-out 1 both;transform-origin:468px 218px}
@keyframes sgmsSway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.8deg)}}
.sgms-rake{animation:sgmsRake 1.9s ease-in-out 1 both;transform-origin:402px 232px}
@keyframes sgmsRake{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(7deg)}}
.sgms-ping{animation:sgmsPing 2.6s ease-out 1 both;transform-origin:497px 96px}
@keyframes sgmsPing{0%{transform:scale(.4);opacity:.8}70%,100%{transform:scale(1.8);opacity:0}}
.sgms-link{stroke-dasharray:3 5;animation:sgmsFlow 1.4s linear 1 both}
@keyframes sgmsFlow{from{stroke-dashoffset:16}to{stroke-dashoffset:0}}
.sgms-echo1{animation:sgmsEcho 2.4s ease-out 1 both;transform-origin:316px 214px}
.sgms-echo2{animation:sgmsEcho 2.4s ease-out 1 both;animation-delay:1.2s;transform-origin:316px 214px}
@keyframes sgmsEcho{0%{transform:scale(.35);opacity:.9}75%,100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion:reduce){.sgms-sat,.sgms-beam,.sgms-w1,.sgms-w2,.sgms-raft1,.sgms-raft2,.sgms-boat,.sgms-palm,.sgms-rake,.sgms-ping,.sgms-link,.sgms-echo1,.sgms-echo2{animation:none}}
        `), /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "sgmsBeamG", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFC72C", stopOpacity: ".55" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFC72C", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("path", { id: "sgmsWave", d: "M0 200 Q35 192 70 200 T140 200 T210 200 T280 200 T350 200 T420 200 T490 200 T560 200 T630 200 T700 200 T770 200 T840 200 T910 200 T980 200 T1050 200 T1120 200 V260 H0 Z" }), /* @__PURE__ */ React.createElement("g", { id: "sgmsSarg" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "0", rx: "16", ry: "6", fill: "#8a6a1a" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-9", cy: "-3", rx: "8", ry: "4", fill: "#9a7a22" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "9", cy: "-2", rx: "9", ry: "4", fill: "#6b4a12" }), /* @__PURE__ */ React.createElement("circle", { cx: "-12", cy: "-6", r: "2.2", fill: "#b8962e" }), /* @__PURE__ */ React.createElement("circle", { cx: "-2", cy: "-7", r: "2", fill: "#b8962e" }), /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "-6", r: "2.2", fill: "#b8962e" }))), /* @__PURE__ */ React.createElement("circle", { cx: "78", cy: "64", r: "22", fill: "#FFC72C", opacity: ".85" }), /* @__PURE__ */ React.createElement("circle", { cx: "78", cy: "64", r: "34", fill: "#FFC72C", opacity: ".12" }), /* @__PURE__ */ React.createElement("g", { className: "sgms-sat" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(0,34)" }, /* @__PURE__ */ React.createElement("rect", { x: "-9", y: "-5", width: "18", height: "10", rx: "2", fill: "#E8EDF2" }), /* @__PURE__ */ React.createElement("rect", { x: "-26", y: "-3", width: "14", height: "6", rx: "1", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "12", y: "-3", width: "14", height: "6", rx: "1", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("polygon", { className: "sgms-beam", points: "-6,6 6,6 26,166 -26,166", fill: "url(#sgmsBeamG)" }))), /* @__PURE__ */ React.createElement("g", { className: "sgms-w2", opacity: ".5" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsWave", fill: "#103833", transform: "translate(0,-7)" }), /* @__PURE__ */ React.createElement("use", { href: "#sgmsWave", fill: "#103833", transform: "translate(560,-7)" })), /* @__PURE__ */ React.createElement("g", { className: "sgms-w1" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsWave", fill: "#0E2E2A" }), /* @__PURE__ */ React.createElement("use", { href: "#sgmsWave", fill: "#0E2E2A", transform: "translate(560,0)" })), /* @__PURE__ */ React.createElement("g", { className: "sgms-raft1", transform: "translate(0,206)" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsSarg" })), /* @__PURE__ */ React.createElement("g", { className: "sgms-raft2", transform: "translate(0,196)" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsSarg", transform: "scale(.75)" })), /* @__PURE__ */ React.createElement("g", { className: "sgms-boat" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(225,196)" }, /* @__PURE__ */ React.createElement("path", { d: "M-34 0 L34 0 L24 14 L-26 14 Z", fill: "#16282C", stroke: "#FFC72C", strokeWidth: "1.2" }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "0", x2: "0", y2: "-26", stroke: "#E8EDF2", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("polygon", { points: "0,-26 16,-20 0,-14", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("path", { className: "sgms-link", d: "M30 6 Q58 26 86 16", stroke: "#FFC72C", strokeWidth: "1.6", fill: "none" }))), /* @__PURE__ */ React.createElement("g", { transform: "translate(316,214)" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsSarg", transform: "scale(.85)" })), /* @__PURE__ */ React.createElement("circle", { className: "sgms-echo1", cx: "316", cy: "214", r: "9", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.6" }), /* @__PURE__ */ React.createElement("circle", { className: "sgms-echo2", cx: "316", cy: "214", r: "9", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.3" }), /* @__PURE__ */ React.createElement("g", { transform: "translate(316,182)" }, /* @__PURE__ */ React.createElement("rect", { x: "-29", y: "-10", width: "58", height: "17", rx: "8.5", fill: "rgba(10,23,20,.88)", stroke: "#5b3a8e", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: "3", textAnchor: "middle", fontFamily: "ui-monospace,monospace", fontSize: "9.5", fontWeight: "700", fill: "#3fd07f" }, "AFAI 0.42")), /* @__PURE__ */ React.createElement("path", { d: "M318 262 Q420 218 560 212 L560 300 L318 300 Z", fill: "#1A2A23" }), /* @__PURE__ */ React.createElement("path", { d: "M340 262 Q430 226 560 220", stroke: "#FFC72C", strokeWidth: "1.4", fill: "none", opacity: ".5" }), /* @__PURE__ */ React.createElement("g", { className: "sgms-palm" }, /* @__PURE__ */ React.createElement("path", { d: "M468 218 Q462 184 470 158", stroke: "#2E4A3C", strokeWidth: "5", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "#3F6B52", strokeWidth: "4", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M470 158 Q488 146 506 150" }), /* @__PURE__ */ React.createElement("path", { d: "M470 158 Q452 144 434 150" }), /* @__PURE__ */ React.createElement("path", { d: "M470 158 Q484 138 498 132" }), /* @__PURE__ */ React.createElement("path", { d: "M470 158 Q456 136 444 130" }), /* @__PURE__ */ React.createElement("path", { d: "M470 158 Q470 138 472 128" }))), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "#FFC72C", strokeWidth: "3", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "396", cy: "206", r: "5.5", fill: "#FFC72C", stroke: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M396 212 L396 232" }), /* @__PURE__ */ React.createElement("path", { d: "M396 232 L388 248" }), /* @__PURE__ */ React.createElement("path", { d: "M396 232 L404 247" })), /* @__PURE__ */ React.createElement("g", { className: "sgms-rake" }, /* @__PURE__ */ React.createElement("line", { x1: "402", y1: "218", x2: "424", y2: "244", stroke: "#FFC72C", strokeWidth: "2.6", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M418 246 L432 240 M421 249 L433 245 M424 251 L434 250", stroke: "#FFC72C", strokeWidth: "2", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(440,250)" }, /* @__PURE__ */ React.createElement("use", { href: "#sgmsSarg", transform: "scale(.7)" })), /* @__PURE__ */ React.createElement("line", { className: "sgms-link", x1: "497", y1: "40", x2: "497", y2: "82", stroke: "#FFC72C", strokeWidth: "1.6" }), /* @__PURE__ */ React.createElement("circle", { className: "sgms-ping", cx: "497", cy: "96", r: "16", fill: "none", stroke: "#FFC72C", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: "473", y: "84", width: "48", height: "24", rx: "12", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("path", { d: "M487 96 L494 102 L508 89", stroke: "#120821", strokeWidth: "3.2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }))));
}
function AlertScene() {
  return /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.09)",
    background: "linear-gradient(180deg,#0C1D21 0%,#120821 100%)"
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 560 240", style: { display: "block", width: "100%", height: "auto" } }, /* @__PURE__ */ React.createElement("style", null, `
.sgas-notif{animation:sgasNotif 9s cubic-bezier(.22,1,.36,1) 1 both}
@keyframes sgasNotif{0%,6%{opacity:0;transform:translateY(14px)}12%,100%{opacity:1;transform:translateY(0)}}
.sgas-raft{animation:sgasRaft 9s linear 1 both}
@keyframes sgasRaft{0%{transform:translateX(46px)}100%{transform:translateX(-30px)}}
.sgas-route{stroke-dasharray:4 6;animation:sgasRoute 9s linear 1 both}
@keyframes sgasRoute{0%,18%{opacity:0}26%,100%{opacity:1}}
.sgas-dot{animation:sgasDot 9s cubic-bezier(.45,.05,.4,1) 1 both}
@keyframes sgasDot{0%,24%{offset-distance:0%;opacity:0}30%{opacity:1}62%,100%{offset-distance:100%;opacity:1}}
.sgas-ok{animation:sgasOk 9s ease-out 1 both;transform-origin:468px 96px}
@keyframes sgasOk{0%,60%{transform:scale(.4);opacity:0}68%{transform:scale(1.25);opacity:1}74%,100%{transform:scale(1);opacity:1}}
.sgas-sun{animation:sgasSun 9s ease-in-out 1 both}
@keyframes sgasSun{0%,8%{transform:translateY(16px);opacity:.4}30%,100%{transform:translateY(0);opacity:.9}}
@media (prefers-reduced-motion:reduce){.sgas-notif,.sgas-raft,.sgas-route,.sgas-dot,.sgas-ok,.sgas-sun{animation:none}}
        `), /* @__PURE__ */ React.createElement("g", { className: "sgas-sun" }, /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "52", r: "16", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "52", r: "26", fill: "#FFC72C", opacity: ".12" })), /* @__PURE__ */ React.createElement("text", { x: "92", y: "58", fontFamily: "ui-monospace,monospace", fontSize: "15", fontWeight: "700", fill: "rgba(255,255,255,.75)" }, "06:00"), /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: "36", y: "84", width: "118", height: "128", rx: "16", fill: "#10231E", stroke: "rgba(255,255,255,.16)" }), /* @__PURE__ */ React.createElement("rect", { x: "78", y: "92", width: "34", height: "5", rx: "2.5", fill: "rgba(255,255,255,.18)" }), /* @__PURE__ */ React.createElement("g", { className: "sgas-notif" }, /* @__PURE__ */ React.createElement("rect", { x: "46", y: "108", width: "98", height: "44", rx: "10", fill: "#1A2F29", stroke: "rgba(255,199,44,.45)" }), /* @__PURE__ */ React.createElement("text", { x: "56", y: "126", fontSize: "13" }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("rect", { x: "76", y: "118", width: "58", height: "5", rx: "2.5", fill: "rgba(255,255,255,.55)" }), /* @__PURE__ */ React.createElement("rect", { x: "76", y: "128", width: "42", height: "5", rx: "2.5", fill: "rgba(255,255,255,.28)" }), /* @__PURE__ */ React.createElement("rect", { x: "56", y: "138", width: "50", height: "7", rx: "3.5", fill: "#FFC72C" }))), /* @__PURE__ */ React.createElement("path", { d: "M205 196 Q255 176 310 182 L310 240 L205 240 Z", fill: "#1A2A23" }), /* @__PURE__ */ React.createElement("g", { className: "sgas-raft", transform: "translate(232,186)" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "0", rx: "14", ry: "5", fill: "#8a6a1a" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-8", cy: "-2", rx: "7", ry: "3.5", fill: "#9a7a22" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "8", cy: "-2", rx: "8", ry: "3.5", fill: "#6b4a12" }), /* @__PURE__ */ React.createElement("circle", { cx: "-4", cy: "-5", r: "1.8", fill: "#b8962e" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "-4", r: "1.8", fill: "#b8962e" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(258,160)" }, /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "0", r: "11", fill: "#E8522A" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: "4.5", textAnchor: "middle", fontSize: "12", fontWeight: "800", fill: "#fff" }, "!")), /* @__PURE__ */ React.createElement("path", { id: "sgasPath", d: "M160 150 Q300 70 440 116", fill: "none", className: "sgas-route", stroke: "#FFC72C", strokeWidth: "2.4" }), /* @__PURE__ */ React.createElement("circle", { className: "sgas-dot", r: "6", fill: "#FFC72C", style: { offsetPath: "path('M160 150 Q300 70 440 116')" } }), /* @__PURE__ */ React.createElement("path", { d: "M388 178 Q452 152 560 160 L560 240 L388 240 Z", fill: "#1A2A23" }), /* @__PURE__ */ React.createElement("path", { d: "M402 178 Q462 158 552 162", stroke: "#FFC72C", strokeWidth: "1.3", fill: "none", opacity: ".5" }), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: "#3F6B52", strokeWidth: "3.4", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M512 164 Q506 140 512 122" }), /* @__PURE__ */ React.createElement("path", { d: "M512 122 Q524 112 538 114" }), /* @__PURE__ */ React.createElement("path", { d: "M512 122 Q500 110 488 112" }), /* @__PURE__ */ React.createElement("path", { d: "M512 122 Q514 106 518 100" })), /* @__PURE__ */ React.createElement("g", { className: "sgas-ok" }, /* @__PURE__ */ React.createElement("circle", { cx: "468", cy: "96", r: "15", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("path", { d: "M461 96 L466 101 L476 90", stroke: "#120821", strokeWidth: "3", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }))));
}
function BrandIcon({ name, size = 22, accent = "#FFC72C", style }) {
  const A = { stroke: accent };
  const P = {
    satellite: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "9.2", y: "9.2", width: "5.6", height: "5.6", rx: "1.2" }), /* @__PURE__ */ React.createElement("path", { d: "M7.5 9.5L5 7M16.5 14.5l2.5 2.5" }), /* @__PURE__ */ React.createElement("rect", { x: "1.6", y: "2.6", width: "5.2", height: "3.6", rx: "0.8", transform: "rotate(45 4.2 4.4)" }), /* @__PURE__ */ React.createElement("rect", { x: "17.2", y: "17.2", width: "5.2", height: "3.6", rx: "0.8", transform: "rotate(45 19.8 19)" }), /* @__PURE__ */ React.createElement("path", { d: "M14.5 7.5c1.6-1.6 4.6-1.4 6 0", ...A })),
    score: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M5 19V12M10 19V7M15 19v-4" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 8.5l2 2L22 7", ...A })),
    cal7: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "5", width: "17", height: "15.5", rx: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M3.5 9.5h17M8 3.2v3.4M16 3.2v3.4" }), /* @__PURE__ */ React.createElement("text", { x: "12", y: "17.4", textAnchor: "middle", fontSize: "7.5", fontWeight: "800", stroke: "none", fill: "currentColor" }, "7")),
    bell: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M6 16.5v-5a6 6 0 0 1 12 0v5l1.6 2.2H4.4z" }), /* @__PURE__ */ React.createElement("path", { d: "M10 21a2.2 2.2 0 0 0 4 0", ...A })),
    brief: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "8.5", width: "14", height: "11", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M3.6 9.5L10 14.5l6.4-5" }), /* @__PURE__ */ React.createElement("circle", { cx: "19.5", cy: "5.5", r: "2.4", fill: accent, stroke: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M19.5 1.4v1M22.8 5.5h1M16.2 5.5h1", ...A })),
    map: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2z" }), /* @__PURE__ */ React.createElement("path", { d: "M9 4.5v13M15 6.5v13" }))
  };
  return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flex: "none", ...style } }, P[name] || null);
}
function SatelliteFilm({ lang }) {
  const boxRef = useRef(null);
  const vRef = useRef(null);
  const seenRef = useRef(false);
  const [src, setSrc] = useState(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let allow = true;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) allow = false;
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g/.test(c.effectiveType || ""))) allow = false;
    } catch (_) {
    }
    if (!allow) return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = vRef.current;
        if (e.isIntersecting) {
          setSrc((s2) => s2 || "/videos/sentinel6.mp4");
          if (v && v.paused) v.play().catch(() => {
          });
        } else if (v && !v.paused) v.pause();
      }
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return /* @__PURE__ */ React.createElement("figure", { ref: boxRef, "aria-label": "Sentinel-6 \u2014 Copernicus", style: {
    margin: "18px calc(50% - 50vw) 0",
    position: "relative",
    overflow: "hidden",
    background: "#04090B",
    height: "clamp(230px,56vw,520px)"
  } }, /* @__PURE__ */ React.createElement(
    "img",
    {
      src: "/videos/sentinel6-poster.jpg",
      alt: "",
      loading: "lazy",
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }
    }
  ), src && /* @__PURE__ */ React.createElement(
    "video",
    {
      ref: vRef,
      src,
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      preload: "auto",
      "aria-hidden": true,
      onPlaying: () => {
        setOn(true);
        if (!seenRef.current) {
          seenRef.current = true;
          track("sg_film_view", {});
        }
      },
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center 40%",
        opacity: on ? 1 : 0,
        transition: "opacity .8s ease"
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,0) 62%,rgba(10,23,20,.78) 100%)"
  } }), /* @__PURE__ */ React.createElement("span", { style: {
    position: "absolute",
    top: 12,
    left: 14,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".1em",
    color: "#fff",
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.18)",
    padding: "4px 10px",
    borderRadius: 999
  } }, /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "#5b3a8e", boxShadow: "0 0 7px #5b3a8e" } }), "SENTINEL-6 \xB7 COPERNICUS"), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 10,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.88)", textShadow: "0 1px 8px rgba(0,0,0,.5)", maxWidth: 380 } }, _t(lang, "Il scanne l'oc\xE9an en continu, impulsion par impulsion.", "It scans the ocean nonstop, pulse by pulse.", "Escanea el oc\xE9ano sin parar, pulso a pulso.")), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, color: "rgba(255,255,255,.42)", whiteSpace: "nowrap" } }, "NASA/JPL-Caltech")));
}
function BeachHeroVideo({ beachId }) {
  const boxRef = useRef(null), vRef = useRef(null), seenRef = useRef(false);
  const [src, setSrc] = useState(null), [on, setOn] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let allow = true;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) allow = false;
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g/.test(c.effectiveType || ""))) allow = false;
    } catch (_) {
    }
    if (!allow) return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = vRef.current;
        if (e.isIntersecting) {
          setSrc((s2) => s2 || `/videos/hero/${beachId}.mp4`);
          if (v && v.paused) v.play().catch(() => {
          });
        } else if (v && !v.paused) v.pause();
      }
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [beachId]);
  if (!boxRef.current) return null;
  return /* @__PURE__ */ React.createElement("div", { ref: boxRef, "aria-hidden": "true", style: { position: "absolute", inset: 0, pointerEvents: "none" } }, src && /* @__PURE__ */ React.createElement(
    "video",
    {
      ref: vRef,
      src,
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      preload: "none",
      onPlaying: () => {
        setOn(true);
        if (!seenRef.current) {
          seenRef.current = true;
          try {
            track("sg_hero_video_view", { beach_id: beachId });
          } catch (_) {
          }
        }
      },
      onError: () => {
        setSrc(null);
        setOn(false);
      },
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: on ? 1 : 0, transition: "opacity .8s ease" }
    }
  ));
}
function MapIntroVideo() {
  const vRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [on, setOn] = useState(false);
  const portrait = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(orientation:portrait)").matches;
  const poster = portrait ? "/videos/veilleur-map-poster-v.jpg" : "/videos/veilleur-map-poster.jpg";
  useEffect(() => {
    let allow = true;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) allow = false;
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g/.test(c.effectiveType || ""))) allow = false;
    } catch (_) {
    }
    if (!allow) return;
    const t = setTimeout(() => {
      setSrc(portrait ? "/videos/veilleur-map-v.mp4" : "/videos/veilleur-map.mp4");
    }, 450);
    return () => clearTimeout(t);
  }, [portrait]);
  return /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "fixed", inset: 0, zIndex: 1019, background: "#0d1117", pointerEvents: "none", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("img", { src: poster, alt: "", style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }), src && /* @__PURE__ */ React.createElement(
    "video",
    {
      ref: vRef,
      src,
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      preload: "auto",
      "aria-hidden": true,
      onPlaying: () => setOn(true),
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: on ? 1 : 0, transition: "opacity .6s ease" }
    }
  ));
}
function SceneWipe({ label, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 860);
    return () => clearTimeout(t);
  }, []);
  return /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { position: "absolute", inset: 0, zIndex: 1095, pointerEvents: "none", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("style", null, `
@keyframes sgwScene{0%{opacity:0}18%{opacity:1}80%{opacity:1}100%{opacity:0}}
@keyframes sgwBeam{0%{transform:translateX(-16vw)}100%{transform:translateX(116vw)}}
@keyframes sgwSat{0%{transform:translateY(-22vh) scale(.65);opacity:0}22%{opacity:1}100%{transform:translateY(82vh) scale(1.35);opacity:0}}
@keyframes sgwLab{0%,20%{opacity:0;transform:translateY(8px)}38%,80%{opacity:1;transform:none}100%{opacity:0}}
      `), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    animation: "sgwScene .86s ease-out forwards",
    background: "linear-gradient(180deg,#04090B 0%,#120821 24%,#155A5A 56%,#C97E3A 84%,#F2B05E 100%)"
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 800 600", preserveAspectRatio: "xMidYMid slice", style: { position: "absolute", inset: 0, width: "100%", height: "100%" } }, [[80, 60], [220, 92], [360, 50], [540, 80], [680, 56], [150, 150], [470, 120], [620, 100], [300, 180]].map((s2, i) => /* @__PURE__ */ React.createElement("circle", { key: i, cx: s2[0], cy: s2[1], r: "1.4", fill: "#fff", opacity: ".5" })), /* @__PURE__ */ React.createElement("line", { x1: "-40", y1: "438", x2: "840", y2: "438", stroke: "#FFD884", strokeWidth: "2", strokeDasharray: "3 13", opacity: ".4" }), /* @__PURE__ */ React.createElement("line", { x1: "-40", y1: "470", x2: "840", y2: "470", stroke: "#FFD884", strokeWidth: "1.5", strokeDasharray: "2 18", opacity: ".25" }))), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: "50%", top: 0, marginLeft: -30, animation: "sgwSat .86s cubic-bezier(.4,0,.3,1) forwards" } }, /* @__PURE__ */ React.createElement("svg", { width: "60", height: "60", viewBox: "0 0 64 64", style: { display: "block", overflow: "visible" } }, miVeil(32, 32, "#5b3a8e", "#3fd07f"))), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "13vw",
    animation: "sgwBeam .58s cubic-bezier(.55,.06,.35,1) forwards",
    background: "linear-gradient(90deg,rgba(255,199,44,0) 0%,rgba(255,199,44,.13) 55%,rgba(255,199,44,.8) 97%,#FFC72C 100%)"
  } }), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 16, right: 16, bottom: "16%", textAlign: "center", animation: "sgwLab .86s ease-out forwards" } }, /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(10,23,20,.8)",
    border: "1px solid rgba(255,199,44,.4)",
    color: "#fff",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    padding: "8px 14px",
    borderRadius: 999,
    maxWidth: "100%"
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "satellite", size: 15, style: { flex: "none" } }), label)));
}
const HERO_PH_OVERRIDE = (() => {
  try {
    const o = new URLSearchParams(window.location.search).get("ph");
    return ["dawn", "day", "golden", "night"].includes(o) ? o : null;
  } catch (_) {
    return null;
  }
})();
const LF_OVERRIDE = (() => {
  try {
    const o = new URLSearchParams(window.location.search).get("lf");
    return o === "game" || o === "control" ? o : null;
  } catch (_) {
    return null;
  }
})();
function HeroScene() {
  const boxRef = useRef(null);
  const [ph] = useState(() => {
    try {
      if (HERO_PH_OVERRIDE) return HERO_PH_OVERRIDE;
      const h = (/* @__PURE__ */ new Date()).getHours();
      return h < 5 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "golden" : "night";
    } catch (_) {
      return "golden";
    }
  });
  const t = {
    golden: {
      sky: ["#0B2230", "#155A5A", "#C97E3A", "#F2B05E"],
      seaT: "#1A5852",
      seaB: "#08251F",
      glit: "#FFD884",
      glitO: 1,
      sun: "set",
      stars: 1,
      cloud: "#10333E",
      rim: "#FFD884",
      sand: "#1C1712",
      trunk: "#120F0A",
      frond: "#16120C",
      boat: true,
      swim: false,
      beam: 0.3
    },
    dawn: {
      sky: ["#141B33", "#3A4A6B", "#B86E7E", "#F2A968"],
      seaT: "#235862",
      seaB: "#0A2630",
      glit: "#F2A968",
      glitO: 0.85,
      sun: "set",
      stars: 0.7,
      cloud: "#1A2440",
      rim: "#F2A968",
      sand: "#1E1812",
      trunk: "#14100C",
      frond: "#181410",
      boat: false,
      swim: false,
      beam: 0.34
    },
    day: {
      sky: ["#1A6FA8", "#3E9BC4", "#7BC8D8", "#AEE0E6"],
      seaT: "#15706A",
      seaB: "#0B3A34",
      glit: "#FDFCF7",
      glitO: 0.65,
      sun: "high",
      stars: 0,
      cloud: "#F4FAFA",
      rim: "#FFFFFF",
      sand: "#A8895A",
      trunk: "#3A2E1A",
      frond: "#3F6B52",
      boat: true,
      swim: true,
      beam: 0.2
    },
    night: {
      sky: ["#040B16", "#0A1B2E", "#10303B", "#16424A"],
      seaT: "#0A2E2E",
      seaB: "#04140F",
      glit: "#9ADCD4",
      glitO: 0.6,
      sun: "moon",
      stars: 2,
      cloud: "#0A1622",
      rim: "#9ADCD4",
      sand: "#0F0C08",
      trunk: "#0A0806",
      frond: "#0C0A06",
      boat: false,
      swim: false,
      beam: 0.5
    }
  }[ph];
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (_) {
    }
    const scroller = box.closest('[role="dialog"][aria-modal="true"]');
    if (!scroller) return;
    let raf = 0;
    const upd = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      const p = Math.max(0, Math.min(1, scroller.scrollTop / (vh * 0.92)));
      box.style.setProperty("--hs", (p * (2 - p)).toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(upd);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    upd();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { ref: boxRef, "aria-hidden": true, style: { position: "absolute", inset: 0, "--hs": 0, background: "#0B2230" } }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      viewBox: "0 0 800 600",
      preserveAspectRatio: "xMidYMid slice",
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }
    },
    /* @__PURE__ */ React.createElement("style", null, `
.sgh-cloud1{animation:sghDrift 110s ease-in-out infinite alternate}
.sgh-cloud2{animation:sghDrift 150s ease-in-out infinite alternate-reverse}
@keyframes sghDrift{from{transform:translateX(0)}to{transform:translateX(-44px)}}
.sgh-shim{opacity:.5}
.sgh-star{opacity:.5}
.sgh-fish,.sgh-arrive{opacity:0}
@media (prefers-reduced-motion:reduce){.sgh-cloud1,.sgh-cloud2{animation:none}}
        `),
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "sghSky", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: t.sky[0] }), /* @__PURE__ */ React.createElement("stop", { offset: ".52", stopColor: t.sky[1] }), /* @__PURE__ */ React.createElement("stop", { offset: ".84", stopColor: t.sky[2] }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: t.sky[3] })), /* @__PURE__ */ React.createElement("linearGradient", { id: "sghSea", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: t.seaT }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: t.seaB })), /* @__PURE__ */ React.createElement("linearGradient", { id: "sghCol", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: t.glit, stopOpacity: ".5" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: t.glit, stopOpacity: "0" })), /* @__PURE__ */ React.createElement("g", { id: "sghSarg" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "0", rx: "14", ry: "5", fill: "#7a5c14" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-8", cy: "-2", rx: "7", ry: "3.5", fill: "#8a6c1c" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "8", cy: "-2", rx: "8", ry: "3.5", fill: "#5d400e" }), /* @__PURE__ */ React.createElement("circle", { cx: "-10", cy: "-4", r: "1.8", fill: "#a8862a" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "-5", r: "1.8", fill: "#a8862a" }))),
    /* @__PURE__ */ React.createElement("g", { style: { transform: "translateY(calc(var(--hs)*26px))" } }, /* @__PURE__ */ React.createElement("rect", { width: "800", height: "340", fill: "url(#sghSky)" }), t.stars > 0 && [[96, 46, 1.1, 0.4], [238, 84, 0.8, 0.28], [388, 38, 1.2, 0.4], [542, 72, 0.9, 0.3], [692, 52, 1, 0.35]].map((s2, i) => /* @__PURE__ */ React.createElement("circle", { key: i, className: "sgh-star", cx: s2[0], cy: s2[1], r: s2[2], fill: "#fff", opacity: Math.min(1, s2[3] * t.stars), style: { animationDelay: `${i * 0.6}s` } })), t.stars > 1.5 && [[150, 140, 0.9, 0.5], [320, 170, 0.8, 0.4], [470, 150, 1, 0.55], [600, 180, 0.8, 0.4], [700, 120, 1.1, 0.5], [60, 200, 0.8, 0.35]].map((s2, i) => /* @__PURE__ */ React.createElement("circle", { key: "n" + i, className: "sgh-star", cx: s2[0], cy: s2[1], r: s2[2], fill: "#fff", opacity: s2[3], style: { animationDelay: `${0.3 + i * 0.5}s` } })), t.sun === "set" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "318", r: "150", fill: t.glit, opacity: ".07" }), /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "318", r: "88", fill: t.glit, opacity: ".12" }), /* @__PURE__ */ React.createElement("path", { d: "M354 312 a46 46 0 0 1 92 0 Z", fill: t.glit })), t.sun === "high" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "316", cy: "98", r: "58", fill: "#FDFCF7", opacity: ".2" }), /* @__PURE__ */ React.createElement("circle", { cx: "316", cy: "98", r: "30", fill: "#FFF4D6" })), t.sun === "moon" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "92", r: "42", fill: "#9ADCD4", opacity: ".08" }), /* @__PURE__ */ React.createElement("circle", { cx: "330", cy: "92", r: "21", fill: "#E6F2EF" }), /* @__PURE__ */ React.createElement("circle", { cx: "323", cy: "86", r: "4", fill: "#C2D8D2", opacity: ".7" }), /* @__PURE__ */ React.createElement("circle", { cx: "336", cy: "98", r: "3", fill: "#C2D8D2", opacity: ".6" }), /* @__PURE__ */ React.createElement("circle", { cx: "338", cy: "84", r: "2", fill: "#C2D8D2", opacity: ".5" })), /* @__PURE__ */ React.createElement("g", { className: "sgh-cloud1" }, /* @__PURE__ */ React.createElement("path", { d: "M120 120 q14 -26 48 -26 q18 -18 46 -12 q30 -8 44 12 q26 2 30 26 Z", fill: t.cloud }), /* @__PURE__ */ React.createElement("path", { d: "M122 121 h162", stroke: t.rim, strokeWidth: "2", opacity: ".4" })), /* @__PURE__ */ React.createElement("g", { className: "sgh-cloud2" }, /* @__PURE__ */ React.createElement("path", { d: "M520 86 q12 -22 42 -22 q16 -14 40 -9 q26 -7 38 11 q22 2 26 20 Z", fill: t.cloud, opacity: ".9" }), /* @__PURE__ */ React.createElement("path", { d: "M522 87 h140", stroke: t.rim, strokeWidth: "1.8", opacity: ".35" })), t.sun !== "moon" && /* @__PURE__ */ React.createElement("g", { className: "sgh-bird", opacity: ".5", stroke: ph === "day" ? "#1A4A5E" : "#0B1B22", strokeWidth: "2.2", fill: "none", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M714 142 q5 -6 10 0 q5 -6 10 0" }), /* @__PURE__ */ React.createElement("path", { d: "M752 128 q4 -5 8 0 q4 -5 8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M520 116 q4.5 -5.5 9 0 q4.5 -5.5 9 0" }), /* @__PURE__ */ React.createElement("path", { d: "M566 102 q3.5 -4.5 7 0 q3.5 -4.5 7 0" }), /* @__PURE__ */ React.createElement("path", { d: "M612 128 q4 -5 8 0 q4 -5 8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M488 138 q3 -4 6 0 q3 -4 6 0" })), t.sun !== "moon" && /* @__PURE__ */ React.createElement("g", { className: "sgh-plane" }, /* @__PURE__ */ React.createElement("g", { transform: "rotate(13)" }, /* @__PURE__ */ React.createElement("line", { x1: "-7", y1: "3", x2: "-66", y2: "2", stroke: "#FDFCF7", strokeWidth: "1.6", strokeDasharray: "2 6", opacity: ".35" }), /* @__PURE__ */ React.createElement("path", { d: "M0 0 L30 0 L41 3 L30 6 L0 6 L-7 3 Z", fill: "#EAF0F4" }), /* @__PURE__ */ React.createElement("path", { d: "M9 1 L1 -9 L6 -9 L17 1 Z", fill: "#C4D0D8" }), /* @__PURE__ */ React.createElement("path", { d: "M9 5 L2 14 L7 14 L17 5 Z", fill: "#AEBBC4" }), /* @__PURE__ */ React.createElement("path", { d: "M-3 0 L-9 -7 L-5 -7 L0 0 Z", fill: "#C4D0D8" }))), /* @__PURE__ */ React.createElement("g", { transform: "translate(474,78) scale(.62)" }, /* @__PURE__ */ React.createElement("rect", { x: "-26", y: "-3", width: "15", height: "7", rx: "1.5", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "11", y: "-3", width: "15", height: "7", rx: "1.5", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-10", y: "-9", width: "20", height: "17", rx: "2.5", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-10", y: "-9", width: "20", height: "6", rx: "2.5", fill: "#FFC72C" })), /* @__PURE__ */ React.createElement("polygon", { points: "470,90 478,90 452,318 420,318", fill: "url(#sghCol)", opacity: t.beam })),
    /* @__PURE__ */ React.createElement("g", { style: { transformOrigin: "400px 600px", transform: "scale(calc(1 + var(--hs)*.1))" } }, /* @__PURE__ */ React.createElement("rect", { x: "-40", y: "312", width: "880", height: "170", fill: "url(#sghSea)" }), /* @__PURE__ */ React.createElement("rect", { x: "376", y: "312", width: "48", height: "150", fill: "url(#sghCol)", opacity: ".4" }), /* @__PURE__ */ React.createElement("line", { className: "sgh-glit", x1: "-40", y1: "334", x2: "840", y2: "334", stroke: t.glit, strokeWidth: "2.2", strokeDasharray: "3 13", opacity: 0.5 * t.glitO }), /* @__PURE__ */ React.createElement("line", { className: "sgh-glit", x1: "-40", y1: "362", x2: "840", y2: "362", stroke: t.glit, strokeWidth: "1.8", strokeDasharray: "2 17", opacity: 0.3 * t.glitO, style: { animationDelay: "-3s" } }), /* @__PURE__ */ React.createElement("line", { className: "sgh-glit", x1: "-40", y1: "402", x2: "840", y2: "402", stroke: t.glit, strokeWidth: "1.6", strokeDasharray: "2 23", opacity: 0.18 * t.glitO, style: { animationDelay: "-5s" } }), /* @__PURE__ */ React.createElement("g", { className: "sgh-mat" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(318,338) scale(.5)", opacity: ".85" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" }))), /* @__PURE__ */ React.createElement("g", { className: "sgh-mat", style: { animationDelay: "-7s" } }, /* @__PURE__ */ React.createElement("g", { transform: "translate(372,330) scale(.38)", opacity: ".7" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" }))), /* @__PURE__ */ React.createElement("g", { className: "sgh-mat", style: { animationDelay: "-3.5s" } }, /* @__PURE__ */ React.createElement("g", { transform: "translate(452,334) scale(.55)", opacity: ".9" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" })), /* @__PURE__ */ React.createElement("g", { className: "sgst-ring", style: { transformBox: "fill-box", transformOrigin: "center" } }, /* @__PURE__ */ React.createElement("circle", { cx: "452", cy: "334", r: "11", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.5" })), /* @__PURE__ */ React.createElement("g", { className: "sgst-ring2", style: { transformBox: "fill-box", transformOrigin: "center" } }, /* @__PURE__ */ React.createElement("circle", { cx: "452", cy: "334", r: "11", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.2" }))), t.boat && /* @__PURE__ */ React.createElement("g", { className: "sgh-arrive" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(498,328) scale(.62)", opacity: ".9" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(536,320) scale(.44)", opacity: ".7" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" })), /* @__PURE__ */ React.createElement("g", { className: "sgst-ring", style: { transformBox: "fill-box", transformOrigin: "center" } }, /* @__PURE__ */ React.createElement("circle", { cx: "498", cy: "328", r: "13", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.4" }))), t.boat && /* @__PURE__ */ React.createElement("g", { className: "sgst-bob" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(300,354) scale(.8)" }, /* @__PURE__ */ React.createElement("path", { d: "M-30 0 L30 0 L21 12 L-23 12 Z", fill: "#16282C", stroke: "#FFC72C", strokeWidth: "1.3" }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "0", x2: "0", y2: "-24", stroke: "#E8EDF2", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("polygon", { points: "0,-24 15,-18 0,-13", fill: "#FFC72C" })), /* @__PURE__ */ React.createElement("path", { className: "sg-flow", d: "M312 350 Q316 344 318 340", stroke: "#FFC72C", strokeWidth: "1.4", fill: "none", opacity: ".7" })), t.swim && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("circle", { cx: "478", cy: "398", r: "3.4", fill: "#0D2B26" }), /* @__PURE__ */ React.createElement("path", { d: "M470 402 q8 -6 16 0", stroke: "#0D2B26", strokeWidth: "2.6", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "536", cy: "406", r: "3", fill: "#0D2B26" }), /* @__PURE__ */ React.createElement("path", { d: "M529 410 q7 -5 14 0", stroke: "#0D2B26", strokeWidth: "2.4", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M462 404 h6 M492 405 h5 M524 412 h5 M552 410 h6", stroke: "#FDFCF7", strokeWidth: "1.6", opacity: ".5", strokeLinecap: "round" })), t.boat && /* @__PURE__ */ React.createElement("g", { className: "sgh-net" }, /* @__PURE__ */ React.createElement("path", { d: "M286 358 Q330 367 372 360 Q410 354 444 363", fill: "none", stroke: "#CDEBE6", strokeWidth: "1", strokeDasharray: "1.5 4", opacity: ".5" }), /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "360", r: "2.2", fill: "#FFC72C", opacity: ".85" }), /* @__PURE__ */ React.createElement("circle", { cx: "344", cy: "364", r: "2", fill: "#FFC72C", opacity: ".7" }), /* @__PURE__ */ React.createElement("circle", { cx: "388", cy: "358", r: "2", fill: "#FFC72C", opacity: ".7" }), /* @__PURE__ */ React.createElement("circle", { cx: "432", cy: "362", r: "2.2", fill: "#FFC72C", opacity: ".85" })), /* @__PURE__ */ React.createElement("g", { className: "sgh-shim", fill: t.glit }, /* @__PURE__ */ React.createElement("circle", { cx: "392", cy: "348", r: "1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "410", cy: "374", r: "1.4" }), /* @__PURE__ */ React.createElement("circle", { cx: "384", cy: "396", r: "1.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "416", cy: "410", r: "1.3" })), t.boat && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("g", { transform: "translate(414,340)" }, /* @__PURE__ */ React.createElement("g", { className: "sgh-fish" }, /* @__PURE__ */ React.createElement("path", { d: "M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z", fill: "#6FD8CC" }), /* @__PURE__ */ React.createElement("path", { d: "M8 0 l5 -4 0 8 Z", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("circle", { cx: "3", cy: "-1.4", r: ".9", fill: "#120821" }))), /* @__PURE__ */ React.createElement("g", { transform: "translate(356,350) scale(.82)" }, /* @__PURE__ */ React.createElement("g", { className: "sgh-fish", style: { animationDelay: "-2.4s" } }, /* @__PURE__ */ React.createElement("path", { d: "M-8 0 Q0 -5 8 0 Q0 5 -8 0 Z", fill: "#8AE4D8" }), /* @__PURE__ */ React.createElement("path", { d: "M8 0 l5 -4 0 8 Z", fill: "#5b3a8e" }))))),
    /* @__PURE__ */ React.createElement("g", { style: { transformOrigin: "400px 640px", transform: "scale(calc(1 + var(--hs)*.22)) translateY(calc(var(--hs)*10px))" } }, /* @__PURE__ */ React.createElement("path", { d: "M-40 470 Q200 432 430 446 Q640 458 840 500 L840 620 L-40 620 Z", fill: t.sand }), /* @__PURE__ */ React.createElement("path", { d: "M-40 470 Q200 432 430 446 Q640 458 840 500", fill: "none", stroke: t.rim, strokeWidth: "2.4", opacity: ".3" }), /* @__PURE__ */ React.createElement("path", { className: "sgh-foam", d: "M-40 478 Q200 440 430 454 Q640 466 840 508", fill: "none", stroke: "#FDFCF7", strokeWidth: "2.6", strokeDasharray: "12 16", opacity: ".4" }), /* @__PURE__ */ React.createElement("path", { d: "M586 612 Q570 520 538 470 Q524 448 502 436", stroke: t.trunk, strokeWidth: "13", fill: "none", strokeLinecap: "round" }), t.swim && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("line", { x1: "300", y1: "466", x2: "306", y2: "508", stroke: "#7A4A1E", strokeWidth: "3.5" }), /* @__PURE__ */ React.createElement("path", { d: "M268 472 A36 36 0 0 1 334 464 Z", fill: "#E8522A" }), /* @__PURE__ */ React.createElement("path", { d: "M268 472 L334 464", stroke: "#B83A1A", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("rect", { x: "320", y: "504", width: "26", height: "8", rx: "3", transform: "rotate(-6 320 504)", fill: "#5b3a8e", opacity: ".85" })), /* @__PURE__ */ React.createElement("g", { fill: "none", stroke: t.frond, strokeWidth: "9", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M502 436 Q466 416 428 422" }), /* @__PURE__ */ React.createElement("path", { d: "M502 436 Q472 400 440 392" }), /* @__PURE__ */ React.createElement("path", { d: "M502 436 Q506 396 522 372" }), /* @__PURE__ */ React.createElement("path", { d: "M502 436 Q538 404 576 402" }), /* @__PURE__ */ React.createElement("path", { d: "M502 436 Q540 432 570 448" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(252,486) scale(.62)", opacity: ".55" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" })), t.boat && /* @__PURE__ */ React.createElement("g", { transform: "translate(360,484)" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(-21,11) scale(.46)", opacity: ".68" }, /* @__PURE__ */ React.createElement("use", { href: "#sghSarg" })), /* @__PURE__ */ React.createElement("g", { fill: "#0E1F1A" }, /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-27", r: "5" }), /* @__PURE__ */ React.createElement("path", { d: "M-5 -22 q5 -4 10 0 l-1.5 19 h-7 Z" }), /* @__PURE__ */ React.createElement("path", { d: "M-4 -4 l-3 12 M4 -4 l3 12", stroke: "#0E1F1A", strokeWidth: "2.4", strokeLinecap: "round", fill: "none" })), /* @__PURE__ */ React.createElement("g", { className: "sgh-rake", stroke: "#3A2A14", strokeWidth: "2.2", fill: "none", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "-19", x2: "20", y2: "8" }), /* @__PURE__ */ React.createElement("path", { d: "M13 6 h13 M15 3 v7 M19 2 v8.5 M23 2 v8" }))))
  ));
}
function GameFunnel({ beach, lang, island: island2, sargData, userPos, pickBeaches, onOpenBeach, onShowMap, onFav, onPremium, exiting }) {
  const T2 = (fr, en, es) => _t(lang, fr, en, es);
  const [stage, setStage] = useState("vibe");
  const [vibe, setVibe] = useState(null);
  const [chosenBeach, setChosenBeach] = useState(null);
  const [rm] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  });
  useEffect(() => {
    track("sg_hero_shown", { beach_id: beach.id, status: beach.status, geoloc: !!userPos, funnel: "game" });
  }, []);
  const proof = pickBeaches && pickBeaches[0] || beach;
  const [cnt, setCnt] = useState(() => rm ? proof?.score ?? 0 : 0);
  useEffect(() => {
    if (rm) return;
    const target = proof?.score ?? 0;
    let raf = 0, start = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / 900);
      setCnt(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [proof && proof.id]);
  const upd = (() => {
    try {
      const ts = sargData?.updatedAt || sargData?.erddapTimestamp;
      return ts ? new Date(ts).toLocaleTimeString(lang === "fr" ? "fr-FR" : lang === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "";
    } catch (_) {
      return "";
    }
  })();
  const dateLong = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const wordmark = IS_NEW_REGION ? (lang === "es" ? "SARGAZO " : "SARGASSUM ") + String(REGION.name || "").toUpperCase() : island2 === "gp" ? "SARGASSES GUADELOUPE" : "SARGASSES MARTINIQUE";
  const VIBES = [
    { k: "swim", label: T2("Nager", "Swim", "Nadar"), g: ["#2BB7C4", "#0E6E78"] },
    { k: "photo", label: T2("Photos & Reels", "Photos & Reels", "Fotos & Reels"), g: ["#F2B860", "#C97E3A"] },
    { k: "meet", label: T2("Rencontrer", "Meet up", "Conocer"), g: ["#F2A968", "#D9646E"] },
    { k: "family", label: T2("Famille", "Family", "Familia"), g: ["#7FC3A6", "#2E8B6B"] },
    { k: "escape", label: T2("S'\xE9vader", "Escape", "Evadir"), g: ["#9B8BE0", "#5B4B9E"] }
  ];
  const vibeLabel = (VIBES.find((v) => v.k === vibe) || {}).label || "";
  const statusCol = (b) => b.status === "clean" ? "#FFC72C" : b.status === "moderate" ? "#F59E0B" : "#E8522A";
  const statusShort = (b) => b.status === "clean" ? T2("Propre", "Clean", "Limpia") : b.status === "moderate" ? T2("Mod\xE9r\xE9", "Moderate", "Moderada") : T2("\xC0 \xE9viter", "Avoid", "Evitar");
  const ranked = useMemo(() => {
    const list = (pickBeaches || []).filter((b) => b.status && b.score != null && b.lat);
    const sh = (b) => {
      try {
        return classifyBeachCoast(b.lat, b.lng, b.island) === "sheltered";
      } catch (_) {
        return false;
      }
    };
    const w = (b) => {
      let s2 = b.score || 0;
      if (vibe === "swim") s2 += (b.snorkel ? 6 : 0) + (sh(b) ? 8 : 0);
      else if (vibe === "photo") s2 += (sh(b) ? 4 : 0) + ((b.score || 0) >= 80 ? 6 : 0);
      else if (vibe === "meet") s2 += (b.parking ? 6 : 0) + (b.drive != null && b.drive < 25 ? 9 : 0);
      else if (vibe === "family") s2 += (b.kids ? 12 : 0) + (b.parking ? 5 : 0) + (sh(b) ? 6 : 0);
      else if (vibe === "escape") s2 += (b.drive != null && b.drive > 35 ? 10 : 0) + (b.snorkel ? 4 : 0);
      return s2;
    };
    return [...list].sort((a, b) => w(b) - w(a)).slice(0, 5);
  }, [pickBeaches, vibe]);
  const pickVibe = (v) => {
    setVibe(v.k);
    track("sg_funnel_vibe", { vibe: v.k });
    setStage("coast");
  };
  const openBeach = (b) => {
    track("sg_funnel_pick", { beach_id: b.id, vibe: vibe || "_", score: b.score });
    onOpenBeach && onOpenBeach(b);
  };
  const goScan = (b) => {
    setChosenBeach(b);
    setFaved(false);
    track("sg_funnel_scan_view", { beach_id: b.id, vibe: vibe || "_" });
    setStage("scan");
  };
  const [faved, setFaved] = useState(false);
  const shareBeach = (b) => {
    const txt = `${b.name} ${b.score}/100 \xB7 ${statusShort(b)} ${T2("aujourd'hui", "today", "hoy")} \u2600\uFE0F`;
    const url = _fichePageUrl(b);
    track("sg_share", { beach_id: b.id, method: "funnel" });
    try {
      if (navigator.share) {
        navigator.share({ title: b.name, text: txt, url }).catch(() => {
        });
        return;
      }
    } catch (_) {
    }
    try {
      navigator.clipboard && navigator.clipboard.writeText(`${txt} ${url}`.trim());
    } catch (_) {
    }
  };
  const favBeach = (b) => {
    setFaved((v) => !v);
    track("sg_funnel_fav", { beach_id: b.id });
    onFav && onFav(b);
  };
  const j2info = useMemo(() => {
    if (!chosenBeach) return null;
    const wkId = IS_NEW_REGION ? chosenBeach.id : BEACH_TO_SARG[chosenBeach.id];
    const fc = sargData && sargData.weekly && sargData.weekly[wkId] && sargData.weekly[wkId].forecast;
    if (!fc || !fc.length) return null;
    const RANK = { clean: 0, moderate: 1, avoid: 2 };
    const today = (RANK[fc[0] && fc[0].status] != null ? RANK[fc[0].status] : RANK[chosenBeach.status]) || 0;
    for (let i = 1; i <= 2 && i < fc.length; i++) {
      const r = RANK[fc[i] && fc[i].status];
      if (r != null && r > today) return { day: i, date: fc[i].date, status: fc[i].status };
    }
    return null;
  }, [chosenBeach, sargData]);
  const dayName = j2info ? (() => {
    try {
      return (/* @__PURE__ */ new Date(j2info.date + "T12:00:00Z")).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { weekday: "long" });
    } catch (_) {
      return "";
    }
  })() : "";
  const distTxt = (b) => {
    if (!userPos || !b.lat) return b.drive != null ? `${b.drive} min` : "";
    const km = haversine(userPos.lat, userPos.lng, b.lat, b.lng);
    return US_UNITS ? `${Math.max(1, Math.round(km * 0.621))} mi` : `${Math.max(1, Math.round(km))} km`;
  };
  return /* @__PURE__ */ React.createElement("div", { role: "dialog", "aria-modal": "true", "aria-label": T2("Trouve ta plage", "Find your beach", "Encuentra tu playa"), style: {
    position: "fixed",
    inset: 0,
    zIndex: "var(--z-sheet)",
    background: "#120821",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    animation: "fadeIn .35s ease-out",
    opacity: exiting ? 0 : 1,
    transform: exiting ? "scale(1.04)" : "none",
    transition: "opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("style", null, `
.gf-cam{transition:transform .64s cubic-bezier(.34,1.56,.64,1)}
.gf-chip{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),box-shadow .2s ease}
.gf-chip:active{transform:scale(.94)}
.gf-card{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),border-color .2s ease}
.gf-card:active{transform:scale(.975)}
.gf-pulse{animation:gfPulse 2.6s ease-in-out 1 both}
@keyframes gfPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.7}}
.gf-panel{animation:gfRise .5s cubic-bezier(.22,.61,.36,1) both}
@keyframes gfRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes gfIgnite{from{opacity:0;transform:translateY(14px) scale(.86)}to{opacity:1;transform:none}}
@keyframes gfPx{from{opacity:0;transform:scale(.5)}to{opacity:.9;transform:none}}
.gf-px{animation:gfPx .55s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfScanGlow{0%,100%{opacity:.3}50%{opacity:.75}}
@keyframes gfSweep{from{transform:translateY(140px)}to{transform:translateY(452px)}}
.gf-scanline{animation:gfScanGlow 1.4s ease-in-out infinite,gfSweep 2.4s ease-in-out both}
@keyframes gfSatDrop{from{transform:translate(400px,24px)}to{transform:translate(400px,142px)}}
.gf-sat{animation:gfSatDrop 2.4s cubic-bezier(.4,0,.2,1) both}
@keyframes gfFade{from{opacity:0}to{opacity:1}}
.gf-scanfx{animation:gfFade .45s ease-out both}
.gf-medal{animation:gfFade .5s ease-out .9s both}
@keyframes gfBlobIn{from{transform:scale(.55)}to{transform:scale(1)}}
.gf-blob{animation:gfBlobIn .6s cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center}
@keyframes gfDotIn{from{transform:scale(.3)}to{transform:scale(1)}}
.gf-dot{animation:gfDotIn .5s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--dd,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfRing{to{stroke-dashoffset:-48}}
.gf-ring{animation:gfRing 6s linear 1 both}
@keyframes gfArrive{0%{transform:translateX(36px)}100%{transform:translateX(-8px)}}
.gf-arrive{animation:gfArrive 5s ease-in-out 1 both alternate}
@keyframes gfArrowDash{to{stroke-dashoffset:-24}}
.gf-arrow{animation:gfArrowDash 1.8s linear 1 both}
@keyframes gfAlertPulse{0%{transform:scale(.5);opacity:.7}100%{transform:scale(2.1);opacity:0}}
.gf-alertpulse{animation:gfAlertPulse 2.2s ease-out 1 both}
@media (prefers-reduced-motion:reduce){.gf-cam{transition:none}.gf-panel,.gf-chip,.gf-card{animation:none!important}.gf-pulse,.gf-scanline,.gf-sat,.gf-medal,.gf-scanfx,.gf-blob,.gf-dot,.gf-ring,.gf-arrive,.gf-arrow,.gf-alertpulse{animation:none!important}.gf-px{animation:none!important;opacity:.9}.gf-medal,.gf-scanfx{opacity:1}.gf-sat{transform:translate(400px,142px)}.gf-scanline{transform:translateY(300px)}.gf-blob,.gf-dot{transform:scale(1)}}
      `), /* @__PURE__ */ React.createElement("section", { style: { position: "relative", height: "100svh", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { className: "gf-cam", "aria-hidden": true, style: {
    position: "absolute",
    inset: 0,
    transformOrigin: "50% 64%",
    transform: stage === "scan" ? "scale(1.22) translateY(-4%)" : stage === "verdict" ? "scale(1.2) translateY(-3%)" : stage === "coast" ? "scale(1.16) translateY(-2%)" : "scale(1)"
  } }, /* @__PURE__ */ React.createElement(HeroScene, null)), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    transition: "background .5s ease",
    background: stage === "scan" ? "linear-gradient(180deg,rgba(5,18,24,.72) 0%,rgba(8,30,40,.4) 36%,rgba(10,23,20,.86) 70%,#120821 100%)" : stage === "verdict" ? "linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,.1) 28%,rgba(10,23,20,.5) 50%,rgba(10,23,20,.9) 76%,#120821 100%)" : stage === "alert" ? "linear-gradient(180deg,rgba(4,11,22,.86) 0%,rgba(4,11,22,.62) 38%,rgba(6,16,18,.9) 72%,#120821 100%)" : stage === "coast" ? "linear-gradient(180deg,rgba(10,23,20,.5) 0%,rgba(10,23,20,.22) 24%,rgba(10,23,20,.86) 62%,#120821 100%)" : "linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,.8) 74%,#120821 100%)"
  } }), stage === "scan" && /* @__PURE__ */ React.createElement(
    "svg",
    {
      "aria-hidden": true,
      viewBox: "0 0 800 600",
      preserveAspectRatio: "xMidYMid slice",
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "gfBeam", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFD884", stopOpacity: ".5" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFD884", stopOpacity: "0" }))),
    /* @__PURE__ */ React.createElement("g", { className: "gf-sat" }, /* @__PURE__ */ React.createElement("polygon", { points: "-8,16 8,16 44,330 -44,330", fill: "url(#gfBeam)", opacity: ".5" }), /* @__PURE__ */ React.createElement("rect", { x: "-30", y: "-4", width: "19", height: "8", rx: "1.5", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "11", y: "-4", width: "19", height: "8", rx: "1.5", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-12", y: "-11", width: "24", height: "21", rx: "3", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-12", y: "-11", width: "24", height: "7", rx: "3", fill: "#FFC72C" })),
    /* @__PURE__ */ React.createElement("rect", { className: "gf-scanline", x: "-40", width: "880", height: "3", rx: "1.5", fill: "#3fd07f" }),
    /* @__PURE__ */ React.createElement("g", null, [...Array(15)].map((_, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const c = ["#5b3a8e", "#5b3a8e", "#FFC72C", "#FFC72C", "#F59E0B"][col];
      return /* @__PURE__ */ React.createElement(
        "rect",
        {
          key: i,
          className: "gf-px",
          x: 326 + col * 30,
          y: 272 + row * 30,
          width: "22",
          height: "22",
          rx: "5",
          fill: c,
          style: { "--d": `${(row * 5 + col) * 55}ms` }
        }
      );
    })),
    /* @__PURE__ */ React.createElement("g", { className: "gf-medal", transform: "translate(400,408)" }, /* @__PURE__ */ React.createElement("circle", { r: "34", fill: "#08251F", stroke: "#FFC72C", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("circle", { r: "34", fill: "none", stroke: "#5b3a8e", strokeWidth: "1", strokeDasharray: "3 6", opacity: ".65" }), /* @__PURE__ */ React.createElement("g", { transform: "scale(.7)" }, /* @__PURE__ */ React.createElement("rect", { x: "-26", y: "-3", width: "15", height: "6", rx: "1.2", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "11", y: "-3", width: "15", height: "6", rx: "1.2", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-9", y: "-8", width: "18", height: "15", rx: "2", fill: "#5b3a8e" }), /* @__PURE__ */ React.createElement("rect", { x: "-9", y: "-8", width: "18", height: "5", rx: "2", fill: "#FFC72C" })))
  ), stage === "verdict" && chosenBeach && (() => {
    const bc = statusCol(chosenBeach);
    const alts = ranked.filter((b) => b.id !== chosenBeach.id).slice(0, 3);
    const POS = [[400, 182], [520, 388], [280, 388]], RR = [20, 16, 14];
    return /* @__PURE__ */ React.createElement(
      "svg",
      {
        "aria-hidden": true,
        viewBox: "0 0 800 600",
        preserveAspectRatio: "xMidYMid slice",
        style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }
      },
      /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "306", r: "106", fill: "none", stroke: "#5b3a8e", strokeWidth: "1.2", strokeDasharray: "3 9", opacity: ".32", className: "gf-ring" }),
      alts.map((b, i) => /* @__PURE__ */ React.createElement("g", { key: b.id, transform: `translate(${POS[i][0]},${POS[i][1]})` }, /* @__PURE__ */ React.createElement("g", { className: "gf-dot", style: { "--dd": `${320 + i * 90}ms` } }, /* @__PURE__ */ React.createElement("circle", { r: RR[i], fill: "#10231E", stroke: "rgba(255,255,255,.14)", strokeWidth: "1.5" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: RR[i] * 0.34, textAnchor: "middle", fontFamily: "'Anton',sans-serif", fontSize: RR[i] * 0.95, fill: statusCol(b) }, b.score)))),
      /* @__PURE__ */ React.createElement("g", { className: "gf-blob" }, /* @__PURE__ */ React.createElement("path", { d: "M400 216 C442 216 494 268 494 306 C494 348 442 396 400 396 C358 396 306 348 306 306 C306 268 358 216 400 216 Z", fill: bc, opacity: ".16" }), /* @__PURE__ */ React.createElement("path", { d: "M400 232 C436 232 478 270 478 306 C478 344 436 380 400 380 C364 380 322 344 322 306 C322 270 364 232 400 232 Z", fill: "none", stroke: bc, strokeWidth: "2.5", opacity: ".7" }), /* @__PURE__ */ React.createElement("text", { x: "400", y: "318", textAnchor: "middle", fontFamily: "'Anton',sans-serif", fontSize: "78", fill: bc, letterSpacing: ".02em" }, chosenBeach.score), /* @__PURE__ */ React.createElement("text", { x: "400", y: "346", textAnchor: "middle", fontSize: "12.5", fill: "rgba(255,255,255,.5)", fontWeight: "700", letterSpacing: ".14em" }, "/100"))
    );
  })(), stage === "alert" && chosenBeach && /* @__PURE__ */ React.createElement(
    "svg",
    {
      "aria-hidden": true,
      viewBox: "0 0 800 600",
      preserveAspectRatio: "xMidYMid slice",
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }
    },
    /* @__PURE__ */ React.createElement("g", { opacity: ".6" }, /* @__PURE__ */ React.createElement("circle", { cx: "96", cy: "60", r: "1.1", fill: "#fff", opacity: ".5" }), /* @__PURE__ */ React.createElement("circle", { cx: "238", cy: "100", r: ".9", fill: "#fff", opacity: ".4" }), /* @__PURE__ */ React.createElement("circle", { cx: "560", cy: "84", r: "1", fill: "#fff", opacity: ".45" }), /* @__PURE__ */ React.createElement("circle", { cx: "700", cy: "120", r: "1.1", fill: "#fff", opacity: ".5" }), /* @__PURE__ */ React.createElement("circle", { cx: "430", cy: "150", r: ".8", fill: "#9ADCD4", opacity: ".4" })),
    /* @__PURE__ */ React.createElement("path", { d: "M-40 432 Q200 412 430 422 Q640 430 840 450 L840 600 L-40 600Z", fill: "#0A1A16" }),
    /* @__PURE__ */ React.createElement("path", { d: "M-40 432 Q200 412 430 422 Q640 430 840 450", fill: "none", stroke: "#1A4A44", strokeWidth: "2", opacity: ".55" }),
    /* @__PURE__ */ React.createElement("g", { className: "gf-arrive" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(438,394) scale(.85)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "14", ry: "5", fill: "#5a4410" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-8", cy: "-2", rx: "7", ry: "3.5", fill: "#6a5418" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "8", cy: "-2", rx: "8", ry: "3.5", fill: "#3d2c08" })), /* @__PURE__ */ React.createElement("g", { transform: "translate(486,378) scale(.6)" }, /* @__PURE__ */ React.createElement("ellipse", { rx: "14", ry: "5", fill: "#5a4410" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "-8", cy: "-2", rx: "7", ry: "3.5", fill: "#6a5418" }))),
    /* @__PURE__ */ React.createElement("path", { className: "gf-arrow", d: "M520 296 Q488 342 455 386", fill: "none", stroke: "#E8522A", strokeWidth: "2.5", strokeDasharray: "5 7", opacity: ".75" }),
    /* @__PURE__ */ React.createElement("g", { transform: "translate(300,248)" }, /* @__PURE__ */ React.createElement("circle", { className: "gf-alertpulse", r: "46", fill: "none", stroke: "#E8522A", strokeWidth: "1.5", opacity: ".5", style: { transformBox: "fill-box", transformOrigin: "center" } }), /* @__PURE__ */ React.createElement("rect", { x: "-30", y: "-54", width: "60", height: "108", rx: "11", fill: "#10231E", stroke: "rgba(255,255,255,.22)", strokeWidth: "1.5" }), /* @__PURE__ */ React.createElement("rect", { x: "-23", y: "-30", width: "46", height: "42", rx: "7", fill: "#1A3A2E" }), /* @__PURE__ */ React.createElement("path", { d: "M0 -22 l9 16 h-18 z", fill: "none", stroke: "#FFC72C", strokeWidth: "2", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("rect", { x: "-.9", y: "-12", width: "1.8", height: "6", rx: ".9", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-3.5", r: "1.1", fill: "#FFC72C" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: "24", textAnchor: "middle", fontSize: "7.5", fill: "#FFC72C", fontWeight: "700", letterSpacing: ".04em" }, "BANC J+", j2info ? j2info.day : 2))
  ), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "calc(14px + env(safe-area-inset-top)) 18px 0",
    maxWidth: 560,
    margin: "0 auto"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: ".14em", color: "#fff", opacity: 0.92 } }, wordmark), /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".06em",
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.18)",
    color: "#fff",
    padding: "5px 10px",
    borderRadius: 999
  } }, /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E" } }), "LIVE", upd ? ` \xB7 ${upd}` : "")), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 20px calc(16px + env(safe-area-inset-bottom))", maxWidth: 560, margin: "0 auto" } }, stage === "vibe" && /* @__PURE__ */ React.createElement("div", { key: "vibe", className: "gf-panel" }, proof && /* @__PURE__ */ React.createElement("div", { style: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 14,
    background: "rgba(10,23,20,.42)",
    border: "1px solid rgba(255,199,44,.3)",
    borderRadius: 999,
    padding: "7px 13px"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", color: "#FFC72C", textTransform: "uppercase" } }, T2("Plus propre maintenant", "Cleanest now", "M\xE1s limpia ahora")), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 } }, proof.name), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 18, color: "#FFC72C", letterSpacing: ".02em" } }, cnt, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, opacity: 0.7 } }, "/100"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, letterSpacing: ".14em", color: "rgba(255,255,255,.6)", marginBottom: 8, textTransform: "uppercase" } }, dateLong, " \xB7 ", T2("SATELLITE COPERNICUS", "COPERNICUS SATELLITE", "SAT\xC9LITE COPERNICUS")), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(34px,9vw,52px)",
    lineHeight: 0.98,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 10px",
    color: "#fff",
    textShadow: "0 2px 24px rgba(0,0,0,.35)"
  } }, T2("Pourquoi la plage aujourd'hui ?", "Why the beach today?", "\xBFPor qu\xE9 la playa hoy?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("span", { className: "gf-pulse", style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#5b3a8e", boxShadow: "0 0 10px #5b3a8e", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "rgba(255,255,255,.74)", fontWeight: 600 } }, T2("J'ai scann\xE9 tes c\xF4tes ce matin. Dis-moi ton envie.", "I scanned your coast this morning. Tell me your mood.", "Escane\xE9 tu costa esta ma\xF1ana. Dime tu plan."))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 9 } }, VIBES.map((v) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: v.k,
      className: "gf-chip",
      onClick: () => pickVibe(v),
      style: {
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 800,
        fontSize: 15,
        color: "#120821",
        border: "none",
        borderRadius: 999,
        padding: "13px 18px",
        background: `linear-gradient(135deg,${v.g[0]},${v.g[1]})`,
        boxShadow: `0 6px 18px ${v.g[1]}55,inset 0 1px 0 rgba(255,255,255,.4)`
      }
    },
    v.label
  ))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    margin: "16px auto 0",
    background: "none",
    border: "none",
    color: "rgba(255,255,255,.6)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  } }, T2("Passer \u2014 montre-moi la carte", "Skip \u2014 show me the map", "Saltar \u2014 mu\xE9strame el mapa"))), stage === "coast" && /* @__PURE__ */ React.createElement("div", { key: "coast", className: "gf-panel" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setStage("vibe");
    setVibe(null);
  }, style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 999,
    color: "#fff",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 13px",
    cursor: "pointer",
    marginBottom: 12
  } }, "\u2039 ", T2("Changer d'envie", "Change mood", "Cambiar plan")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "#FFC72C", marginBottom: 8, textTransform: "uppercase" } }, T2("Pour", "For", "Para"), " ", vibeLabel, " \xB7 ", T2("aujourd'hui", "today", "hoy")), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(28px,7vw,42px)",
    lineHeight: 1,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 14px",
    color: "#fff",
    textShadow: "0 2px 24px rgba(0,0,0,.4)"
  } }, T2("Tes plages, class\xE9es pour toi", "Your beaches, ranked for you", "Tus playas, en tu orden")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, ranked.map((b, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: b.id,
      className: "gf-card",
      onClick: () => goScan(b),
      style: {
        animation: rm ? "none" : "gfIgnite .5s cubic-bezier(.34,1.56,.64,1) both",
        animationDelay: rm ? void 0 : `${i * 70}ms`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        background: "rgba(16,35,30,.92)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 15,
        padding: "13px 15px",
        cursor: "pointer",
        fontFamily: "inherit"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { width: 12, height: 12, flexShrink: 0, borderRadius: 6, background: statusCol(b), boxShadow: `0 0 10px ${statusCol(b)}` } }),
    /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontWeight: 800, fontSize: 15, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, b.name), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 11.5, color: "rgba(255,255,255,.52)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, statusShort(b), b.commune ? ` \xB7 ${b.commune}` : "", distTxt(b) ? ` \xB7 ${distTxt(b)}` : "")),
    /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 22, color: statusCol(b), letterSpacing: ".02em", lineHeight: 1 } }, b.score),
    /* @__PURE__ */ React.createElement("span", { style: { color: "rgba(255,255,255,.32)", fontSize: 19, lineHeight: 1 } }, "\u203A")
  ))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    margin: "14px auto 0",
    background: "none",
    border: "none",
    color: "rgba(255,255,255,.6)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  } }, T2("Voir toutes les plages sur la carte", "See every beach on the map", "Ver todas las playas en el mapa"))), stage === "scan" && chosenBeach && /* @__PURE__ */ React.createElement("div", { key: "scan", className: "gf-panel" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStage("coast"), style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 999,
    color: "#fff",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 13px",
    cursor: "pointer",
    marginBottom: 12
  } }, "\u2039 ", T2("Retour", "Back", "Volver")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "gf-pulse", style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3fd07f", boxShadow: "0 0 10px #3fd07f", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "#3fd07f", textTransform: "uppercase" } }, T2("Le satellite scanne", "Satellite scanning", "El sat\xE9lite escanea"))), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(28px,7vw,42px)",
    lineHeight: 1,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 8px",
    color: "#fff",
    textShadow: "0 2px 24px rgba(0,0,0,.4)"
  } }, chosenBeach.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "rgba(255,255,255,.6)", fontFamily: "ui-monospace,SFMono-Regular,monospace", marginBottom: 16 } }, T2("Sentinel-6 analyse les nappes", "Sentinel-6 reads the rafts", "Sentinel-6 analiza las manchas"), " \xB7 NASA/JPL \xB7 Copernicus"), /* @__PURE__ */ React.createElement("button", { onClick: () => setStage("verdict"), className: "gf-chip", style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 16,
    color: "#120821",
    border: "none",
    borderRadius: 16,
    padding: "15px 20px",
    background: "linear-gradient(135deg,#FFE08A,#FFC72C)",
    boxShadow: "0 8px 24px rgba(255,199,44,.32)"
  } }, T2("Voir le r\xE9sultat \u2192", "See the result \u2192", "Ver el resultado \u2192")), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    margin: "12px auto 0",
    background: "none",
    border: "none",
    color: "rgba(255,255,255,.55)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer"
  } }, T2("Passer \u2014 montre-moi la carte", "Skip \u2014 show me the map", "Saltar \u2014 mu\xE9strame el mapa"))), stage === "verdict" && chosenBeach && /* @__PURE__ */ React.createElement("div", { key: "verdict", className: "gf-panel" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStage("coast"), style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 999,
    color: "#fff",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 13px",
    cursor: "pointer",
    marginBottom: 12
  } }, "\u2039 ", T2("Autres plages", "Other beaches", "Otras playas")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#FFC72C", marginBottom: 8, textTransform: "uppercase" } }, T2("Ta journ\xE9e de plage", "Your beach day", "Tu d\xEDa de playa")), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(30px,8vw,46px)",
    lineHeight: 1,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 6px",
    color: "#fff",
    textShadow: "0 2px 24px rgba(0,0,0,.4)"
  } }, chosenBeach.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: "rgba(255,255,255,.72)", fontWeight: 600, marginBottom: 16, lineHeight: 1.4 } }, chosenBeach.status === "clean" ? T2("Eau claire, sable propre \u2014 c'est le bon jour.", "Clear water, clean sand \u2014 today's the day.", "Agua clara, arena limpia \u2014 es el d\xEDa.") : chosenBeach.status === "moderate" ? T2("Correct aujourd'hui \u2014 surveille demain.", "Okay today \u2014 keep an eye on tomorrow.", "Bien hoy \u2014 ojo con ma\xF1ana.") : T2("Sargasses pr\xE9sentes \u2014 regarde les alternatives autour.", "Sargassum present \u2014 check the alternatives around.", "Sargazo presente \u2014 mira las alternativas.")), j2info && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_funnel_alert_view", { beach_id: chosenBeach.id, day: j2info.day });
        setStage("alert");
      },
      className: "gf-chip",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 10,
        background: "rgba(232,82,42,.12)",
        border: "1px solid rgba(232,82,42,.4)"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "#F4845F", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 3L2 20h20L12 3z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 10v4M12 17.5v.5" })),
    /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontWeight: 800, fontSize: 13.5, color: "#F4845F" } }, T2(`Sargasses pr\xE9vues ${dayName}`, `Sargassum forecast ${dayName}`, `Sargazo previsto ${dayName}`)), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontSize: 12, color: "rgba(255,255,255,.6)" } }, T2("Sois pr\xE9venu la veille \u2192", "Get warned the day before \u2192", "Te aviso la v\xEDspera \u2192")))
  ), !showHero && !showPrevLanding && !showPremium && !showB2BChat && cookieConsent !== null && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowB2BChat(true);
      },
      "aria-label": "Concierge B2B",
      style: {
        position: "fixed",
        right: 14,
        bottom: "calc(152px + env(safe-area-inset-bottom))",
        zIndex: 960,
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#FFC72C",
        border: "2px solid #120821",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color: "#120821",
        fontWeight: 800
      }
    },
    "B2B"
  ), /* @__PURE__ */ React.createElement("button", { onClick: () => openBeach(chosenBeach), className: "gf-chip", style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 16,
    color: "#120821",
    border: "none",
    borderRadius: 16,
    padding: "15px 20px",
    background: "linear-gradient(135deg,#FFE08A,#FFC72C)",
    boxShadow: "0 8px 24px rgba(255,199,44,.32)"
  } }, T2("Voir la fiche compl\xE8te \u2192", "See the full report \u2192", "Ver la ficha completa \u2192")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => shareBeach(chosenBeach), className: "gf-chip", style: {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 14,
    color: "#fff",
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(16,35,30,.92)",
    border: "1px solid rgba(255,255,255,.14)"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "#FFC72C", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "5", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "19", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" })), T2("Partager", "Share", "Compartir")), /* @__PURE__ */ React.createElement("button", { onClick: () => favBeach(chosenBeach), "aria-pressed": faved, "aria-label": T2("\xC9pingler", "Pin", "Fijar"), className: "gf-chip", style: {
    flex: "none",
    width: 52,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: 14,
    padding: "12px",
    background: faved ? "rgba(255,199,44,.16)" : "rgba(16,35,30,.92)",
    border: `1px solid ${faved ? "rgba(255,199,44,.5)" : "rgba(255,255,255,.14)"}`
  } }, /* @__PURE__ */ React.createElement("svg", { width: "19", height: "19", viewBox: "0 0 24 24", fill: faved ? "#FFC72C" : "none", stroke: faved ? "#FFC72C" : "rgba(255,255,255,.7)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" })))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    margin: "12px auto 0",
    background: "none",
    border: "none",
    color: "rgba(255,255,255,.55)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer"
  } }, T2("Passer \u2014 toutes les plages", "Skip \u2014 all beaches", "Saltar \u2014 todas las playas"))), stage === "alert" && chosenBeach && /* @__PURE__ */ React.createElement("div", { key: "alert", className: "gf-panel" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStage("verdict"), style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 999,
    color: "#fff",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 13px",
    cursor: "pointer",
    marginBottom: 12
  } }, "\u2039 ", T2("Retour", "Back", "Volver")), /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "#F4845F", marginBottom: 8, textTransform: "uppercase" } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#F4845F", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3L2 20h20L12 3z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 10v4M12 17.5v.5" })), T2("Pr\xE9vision satellite", "Satellite forecast", "Pron\xF3stico satelital")), /* @__PURE__ */ React.createElement("h1", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(28px,7.5vw,44px)",
    lineHeight: 1,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 8px",
    color: "#fff",
    textShadow: "0 2px 24px rgba(0,0,0,.5)"
  } }, T2(`Un banc arrive ${dayName}`, `A raft lands ${dayName}`, `Llega un banco el ${dayName}`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: "rgba(255,255,255,.74)", fontWeight: 600, marginBottom: 18, lineHeight: 1.45 } }, T2(
    `Sur ${chosenBeach.name}, l'eau se trouble ${dayName}. Je te pr\xE9viens la veille \u2014 \xE0 temps pour changer de plan.`,
    `At ${chosenBeach.name}, the water turns ${dayName}. I warn you the day before \u2014 in time to change plans.`,
    `En ${chosenBeach.name}, el agua empeora el ${dayName}. Te aviso la v\xEDspera \u2014 a tiempo para cambiar de plan.`
  )), /* @__PURE__ */ React.createElement("button", { onClick: () => onPremium && onPremium("funnel_alert"), className: "gf-chip", style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 16,
    color: "#120821",
    border: "none",
    borderRadius: 16,
    padding: "15px 20px",
    background: "linear-gradient(135deg,#FFE08A,#FFC72C)",
    boxShadow: "0 8px 24px rgba(255,199,44,.32)"
  } }, T2("Sois pr\xE9venu la veille \u2192", "Get warned the day before \u2192", "Te aviso la v\xEDspera \u2192")), /* @__PURE__ */ React.createElement("button", { onClick: () => openBeach(chosenBeach), style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    marginTop: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 14,
    color: "#fff",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(16,35,30,.92)",
    border: "1px solid rgba(255,255,255,.14)"
  } }, T2("Voir la fiche d'abord", "See the report first", "Ver la ficha primero")), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    display: "block",
    margin: "12px auto 0",
    background: "none",
    border: "none",
    color: "rgba(255,255,255,.55)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer"
  } }, T2("Passer \u2014 toutes les plages", "Skip \u2014 all beaches", "Saltar \u2014 todas las playas"))))), /* @__PURE__ */ React.createElement("section", { style: { padding: "58px 22px 6px", maxWidth: 560, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".16em", color: "#FFC72C", textTransform: "uppercase", marginBottom: 10 } }, T2("La m\xE9thode", "The method", "El m\xE9todo")), /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: "clamp(28px,6.5vw,40px)", lineHeight: 1.02, letterSpacing: ".01em", textTransform: "uppercase", margin: 0, color: "#fff" } }, T2("On regarde la mer pour toi", "We watch the sea for you", "Miramos el mar por ti"))), /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { style: { height: "430vh" } }) }, /* @__PURE__ */ React.createElement(ScrollStory, { lang, onShowMap }))), /* @__PURE__ */ React.createElement("section", { style: { padding: "28px 22px calc(40px + env(safe-area-inset-bottom))", maxWidth: 560, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(145deg,#10231E,#120821)", border: "1px solid rgba(255,199,44,.25)", borderRadius: 20, padding: "24px 20px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 23, color: "#fff", letterSpacing: ".02em", textTransform: "uppercase", marginBottom: 6 } }, T2("Ton veilleur personnel", "Your personal watcher", "Tu vig\xEDa personal")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: "rgba(255,255,255,.66)", marginBottom: 16, lineHeight: 1.45 } }, T2("Je surveille ta plage et je te pr\xE9viens la veille o\xF9 elle se trouble.", "I watch your beach and warn you the day before it turns.", "Vigilo tu playa y te aviso la v\xEDspera de que cambie.")), /* @__PURE__ */ React.createElement("button", { onClick: () => onPremium && onPremium("funnel_scroll"), className: "gf-chip", style: { display: "block", width: "100%", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 16, color: "#120821", border: "none", borderRadius: 16, padding: "15px 20px", background: "linear-gradient(135deg,#FFE08A,#FFC72C)", boxShadow: "0 8px 24px rgba(255,199,44,.32)" } }, T2("D\xE9couvrir le veilleur \u2192", "Meet the watcher \u2192", "Descubrir el vig\xEDa \u2192")), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: { display: "block", width: "100%", marginTop: 10, background: "none", border: "none", color: "rgba(255,255,255,.6)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" } }, T2("Ou ouvrir la carte gratuite", "Or open the free map", "O abrir el mapa gratis")))));
}
function HeroVerdict({ beach, lang, island: island2, sargData, userPos, onOpen, onShowMap, onPremium, onOpenBeach, topBeaches, pickBeaches, exiting }) {
  const [pickQ, setPickQ] = useState("");
  useEffect(() => {
    track("sg_hero_shown", { beach_id: beach.id, status: beach.status, geoloc: !!userPos });
  }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onShowMap();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onShowMap]);
  const wrapRef = useRef(null);
  const heroRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const hero = heroRef.current;
    const io1 = hero ? new IntersectionObserver((es) => setStuck(!es[0].isIntersecting), { root, threshold: 0.06 }) : null;
    if (io1) io1.observe(hero);
    const seen = {};
    const io2 = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        const s2 = e.target.getAttribute("data-s");
        if (s2 && !seen[s2]) {
          seen[s2] = 1;
          track("sg_landing_view", { s: s2 });
        }
        io2.unobserve(e.target);
      }
    }, { root, threshold: 0.18 });
    root.querySelectorAll(".sg-rv").forEach((n) => io2.observe(n));
    return () => {
      io1 && io1.disconnect();
      io2.disconnect();
    };
  }, []);
  const scrollNext = () => {
    try {
      wrapRef.current?.querySelector("#sg-s2")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {
    }
  };
  const clean = beach.status === "clean";
  const verdictTxt = clean ? _t(lang, "PROPRE AUJOURD'HUI", "CLEAN TODAY", "SIN SARGAZO HOY") : beach.status === "moderate" ? _t(lang, "MOD\xC9R\xC9 AUJOURD'HUI", "MODERATE TODAY", "MODERADA HOY") : _t(lang, "\xC0 \xC9VITER AUJOURD'HUI", "AVOID TODAY", "EVITAR HOY");
  const verdictBg = clean ? "#FFC72C" : beach.status === "moderate" ? "#F59E0B" : "#E8522A";
  const wkId = IS_NEW_REGION ? beach.id : BEACH_TO_SARG[beach.id];
  const j1 = sargData?.weekly?.[wkId]?.forecast?.[1]?.status || null;
  const sub = (() => {
    const parts = [];
    if (clean && j1 && j1 !== "clean") parts.push(_t(lang, "\u26A0\uFE0F Banc pr\xE9vu demain \u2014 on te dira o\xF9 aller", "\u26A0\uFE0F Mat forecast tomorrow \u2014 we'll tell you where to go", "\u26A0\uFE0F Banco previsto ma\xF1ana \u2014 te diremos ad\xF3nde ir"));
    else if (clean && j1 === "clean") parts.push(_t(lang, "Propre aussi demain", "Clean tomorrow too", "Limpia tambi\xE9n ma\xF1ana"));
    if (beach.commune) parts.push(beach.commune);
    if (userPos && beach.lat) {
      const km = haversine(userPos.lat, userPos.lng, beach.lat, beach.lng);
      parts.push(US_UNITS ? `${Math.max(1, Math.round(km * 0.621))} mi` : `${Math.max(1, Math.round(km))} km`);
    }
    return parts.join(" \xB7 ");
  })();
  const upd = (() => {
    try {
      const ts = sargData?.updatedAt || sargData?.erddapTimestamp;
      return ts ? new Date(ts).toLocaleTimeString(lang === "fr" ? "fr-FR" : lang === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "";
    } catch (_) {
      return "";
    }
  })();
  const dateLong = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const wordmark = IS_NEW_REGION ? (lang === "es" ? "SARGAZO " : "SARGASSUM ") + String(REGION.name || "").toUpperCase() : island2 === "gp" ? "SARGASSES GUADELOUPE" : "SARGASSES MARTINIQUE";
  const statusShort = (b) => b.status === "clean" ? _t(lang, "Propre", "Clean", "Limpia") : b.status === "moderate" ? _t(lang, "Mod\xE9r\xE9", "Moderate", "Moderada") : _t(lang, "\xC0 \xE9viter", "Avoid", "Evitar");
  const statusCol = (b) => b.status === "clean" ? "#FFC72C" : b.status === "moderate" ? "#F59E0B" : "#E8522A";
  const ovl = { fontSize: 11, fontWeight: 700, letterSpacing: ".16em", color: "#FFC72C", textTransform: "uppercase", marginBottom: 10 };
  const h2s = {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(28px,6.5vw,40px)",
    lineHeight: 1.02,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 10px",
    color: "#fff"
  };
  const secPad = { padding: "68px 22px 8px", maxWidth: 560, margin: "0 auto" };
  return /* @__PURE__ */ React.createElement("div", { ref: wrapRef, role: "dialog", "aria-modal": "true", "aria-label": beach.name, style: {
    position: "fixed",
    inset: 0,
    zIndex: "var(--z-sheet)",
    background: "#120821",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    /* PAS de fill-mode sur l'entrée : avec "both" l'animation épinglerait
       opacity:1 pour toujours et écraserait le fondu de sortie (inline) */
    animation: "fadeIn .35s ease-out",
    opacity: exiting ? 0 : 1,
    transform: exiting ? "scale(1.04)" : "none",
    transition: "opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("style", null, `@keyframes sgHeroBob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
.sg-heroSec{position:relative;min-height:100vh}
@supports(min-height:100svh){.sg-heroSec{min-height:100svh}}
.sg-rv{opacity:0;transform:translateY(26px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
.sg-rv.in{opacity:1;transform:none}
.sg-stick{position:fixed;top:0;left:0;right:0;z-index:30;transform:translateY(-105%);transition:transform .32s cubic-bezier(.32,.72,.33,1)}
.sg-stick.on{transform:translateY(0)}
.sg-l-cards{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px;scrollbar-width:none}
.sg-l-cards::-webkit-scrollbar{display:none}
.sg-l-card{scroll-snap-align:start;flex:0 0 200px;border-radius:18px;overflow:hidden;background:#10231E;
  border:1px solid rgba(255,255,255,.1);cursor:pointer;text-align:left;padding:0;font-family:inherit;
  transition:transform .25s ease,border-color .25s ease}
.sg-l-card:hover{transform:translateY(-3px);border-color:rgba(255,199,44,.45)}
.sg-flow{stroke-dasharray:4 6;animation:sgFlowY 1.2s linear 1 both}
@keyframes sgFlowY{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
.sg-storyvp{height:100vh}
@supports(height:100svh){.sg-storyvp{height:100svh}}
.sgst-ring{animation:sgstRing 2.6s ease-out 1 both}
.sgst-ring2{animation:sgstRing 2.6s ease-out 1 both;animation-delay:1.3s}
@keyframes sgstRing{0%{transform:scale(.3);opacity:.85}78%,100%{transform:scale(2.3);opacity:0}}
.sgst-bob{animation:sgstBob 3.4s ease-in-out 1 both}
@keyframes sgstBob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@media (prefers-reduced-motion:reduce){.sg-hero-chev{animation:none!important}
.sg-rv{transition:none;opacity:1;transform:none}.sg-stick{transition:none}.sg-l-card{transition:none}.sg-flow{animation:none}
.sgst-ring,.sgst-ring2,.sgst-bob{animation:none}}`), /* @__PURE__ */ React.createElement("div", { className: "sg-stick" + (stuck ? " on" : ""), "aria-hidden": !stuck }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    padding: "calc(8px + env(safe-area-inset-top)) 16px 8px",
    background: "rgba(10,23,20,.88)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,.08)"
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: "'Anton',sans-serif",
    fontSize: 11.5,
    letterSpacing: ".12em",
    color: "#fff",
    opacity: 0.92,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  } }, wordmark), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    flexShrink: 0,
    background: "#FFC72C",
    color: "#120821",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 13,
    padding: "9px 16px",
    borderRadius: 999
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "map", size: 15, accent: "#120821", style: { verticalAlign: "-2px", marginRight: 6, display: "inline-block" } }), _t(lang, "Ouvrir la carte", "Open the map", "Abrir el mapa")))), /* @__PURE__ */ React.createElement("section", { ref: heroRef, className: "sg-heroSec" }, /* @__PURE__ */ React.createElement(HeroScene, null), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, onClick: () => {
    track("sg_hero_tap", { t: "media" });
    onOpenBeach && onOpenBeach(beach);
  }, style: {
    position: "absolute",
    inset: 0,
    cursor: "pointer",
    background: "linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 26%,rgba(10,23,20,0) 42%,rgba(10,23,20,.88) 78%,#120821 100%)"
  } }), /* @__PURE__ */ React.createElement("div", { onClick: () => {
    track("sg_hero_tap", { t: "topbar" });
    onOpenBeach && onOpenBeach(beach);
  }, style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    padding: "calc(14px + env(safe-area-inset-top)) 18px 0",
    maxWidth: 560,
    margin: "0 auto"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: ".14em", color: "#fff", opacity: 0.92 } }, wordmark), /* @__PURE__ */ React.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".06em",
    background: "rgba(10,23,20,.5)",
    border: "1px solid rgba(255,255,255,.18)",
    color: "#fff",
    padding: "5px 10px",
    borderRadius: 999
  } }, /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E" } }), "LIVE", upd ? ` \xB7 ${upd}` : "")), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "0 20px calc(10px + env(safe-area-inset-bottom))",
    maxWidth: 560,
    margin: "0 auto"
  } }, userPos && /* @__PURE__ */ React.createElement("div", { onClick: () => {
    track("sg_hero_tap", { t: "near" });
    onOpenBeach && onOpenBeach(beach);
  }, style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".05em",
    color: "#FFC72C",
    marginBottom: 8,
    cursor: "pointer"
  } }, "\u{1F4CD} ", _t(lang, "LA PLUS PROCHE DE TOI", "CLOSEST TO YOU", "LA M\xC1S CERCA DE TI")), /* @__PURE__ */ React.createElement("div", { onClick: () => {
    track("sg_hero_tap", { t: "date" });
    onOpenBeach && onOpenBeach(beach);
  }, style: { fontSize: 11, fontWeight: 600, letterSpacing: ".14em", color: "rgba(255,255,255,.62)", marginBottom: 6, textTransform: "uppercase", cursor: "pointer" } }, dateLong, " \xB7 ", _t(lang, "SATELLITE COPERNICUS", "COPERNICUS SATELLITE", "SAT\xC9LITE COPERNICUS")), /* @__PURE__ */ React.createElement("h1", { onClick: () => {
    track("sg_hero_tap", { t: "title" });
    onOpenBeach && onOpenBeach(beach);
  }, style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    fontSize: "clamp(44px,12vw,72px)",
    lineHeight: 0.96,
    letterSpacing: ".01em",
    textTransform: "uppercase",
    margin: "0 0 14px",
    color: "#fff",
    cursor: "pointer",
    textShadow: "0 2px 24px rgba(0,0,0,.35)"
  } }, beach.name), /* @__PURE__ */ React.createElement("div", { onClick: () => {
    track("sg_hero_tap", { t: "verdict" });
    onOpenBeach && onOpenBeach(beach);
  }, style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: verdictBg,
    color: "#120821",
    fontWeight: 800,
    fontSize: 15,
    letterSpacing: ".02em",
    padding: "9px 16px",
    borderRadius: 999,
    marginBottom: 8,
    cursor: "pointer"
  } }, verdictTxt, beach.score != null && /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 17, letterSpacing: ".03em" } }, beach.score, "/100")), sub && /* @__PURE__ */ React.createElement("div", { onClick: () => {
    track("sg_hero_tap", { t: "sub" });
    onOpenBeach && onOpenBeach(beach);
  }, style: { fontSize: 13, color: "rgba(255,255,255,.62)", marginBottom: 18, cursor: "pointer" } }, sub), typeof window !== "undefined" && window.matchMedia && window.matchMedia("(min-width:900px)").matches ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: onOpen, className: "gbtn", style: {
    flex: 1.5,
    textAlign: "center",
    background: "#FFC72C",
    color: "#120821",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 17,
    padding: "16px 24px",
    borderRadius: 18,
    boxShadow: "0 8px 28px rgba(255,199,44,.32)"
  } }, _t(lang, "Voir cette plage", "See this beach", "Ver esta playa"), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontWeight: 500, fontSize: 11.5, opacity: 0.75, marginTop: 3 } }, _t(lang, "\xE9tat complet \xB7 m\xE9t\xE9o \xB7 pr\xE9visions 7 jours", "full status \xB7 weather \xB7 7-day forecast", "estado completo \xB7 clima \xB7 pron\xF3stico 7 d\xEDas"))), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, style: {
    flex: 1,
    textAlign: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    background: "rgba(10,23,20,.45)",
    color: "#fff",
    border: "1.5px solid rgba(255,255,255,.35)",
    fontWeight: 700,
    fontSize: 15,
    padding: "16px 18px",
    borderRadius: 18,
    backdropFilter: "blur(6px)"
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "map", size: 15, accent: "#120821", style: { verticalAlign: "-2px", marginRight: 6, display: "inline-block" } }), _t(lang, "Ouvrir la carte live", "Open the live map", "Abrir el mapa en vivo"), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontWeight: 500, fontSize: 11.5, opacity: 0.7, marginTop: 3 } }, _t(lang, "toutes les plages, en direct", "every beach, real time", "todas las playas, en directo")))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: onOpen, className: "gbtn", style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    background: "#FFC72C",
    color: "#120821",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 17,
    padding: "16px 24px",
    borderRadius: 18,
    boxShadow: "0 8px 28px rgba(255,199,44,.32)"
  } }, _t(lang, "Voir cette plage", "See this beach", "Ver esta playa"), /* @__PURE__ */ React.createElement("span", { style: { display: "block", fontWeight: 500, fontSize: 11.5, opacity: 0.75, marginTop: 3 } }, _t(lang, "\xE9tat complet \xB7 m\xE9t\xE9o \xB7 pr\xE9visions 7 jours", "full status \xB7 weather \xB7 7-day forecast", "estado completo \xB7 clima \xB7 pron\xF3stico 7 d\xEDas"))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    track("sg_hero_map_cta", { src: "mobile" });
    onShowMap();
  }, style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    marginTop: 10,
    background: "rgba(10,23,20,.45)",
    color: "#fff",
    border: "1.5px solid rgba(255,255,255,.35)",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 14,
    padding: "14px 20px",
    borderRadius: 18,
    backdropFilter: "blur(6px)",
    cursor: "pointer"
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "map", size: 14, accent: "#FFC72C", style: { verticalAlign: "-2px", display: "inline-block" } }), _t(lang, "Toutes les plages sur la carte", "All beaches on the map", "Todas las playas en el mapa"))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: scrollNext,
      "aria-label": _t(lang, "D\xE9couvrir", "Discover", "Descubrir"),
      style: {
        display: "block",
        margin: "6px auto 0",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,.55)",
        fontSize: 22,
        lineHeight: 1,
        padding: 6
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "sg-hero-chev", style: { display: "inline-block", animation: "sgHeroBob 1.8s ease-in-out 1 both" } }, "\u2304")
  ))), /* @__PURE__ */ React.createElement("section", { id: "sg-s2", style: { ...secPad, scrollMarginTop: 54 } }, /* @__PURE__ */ React.createElement("div", { className: "sg-rv", "data-s": "verdict" }, /* @__PURE__ */ React.createElement("div", { style: ovl }, _t(lang, "Aujourd'hui", "Today", "Hoy")), /* @__PURE__ */ React.createElement("h2", { style: h2s }, _t(lang, "Le verdict, plage par plage", "The verdict, beach by beach", "El veredicto, playa por playa")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,.62)", margin: "0 0 18px" } }, _t(lang, "Pas d'avis, pas de promesses : la mesure satellite du matin.", "No opinions, no promises: this morning's satellite measurement.", "Sin opiniones ni promesas: la medici\xF3n satelital de esta ma\xF1ana."), upd ? ` \xB7 LIVE ${upd}` : "")), !!(topBeaches && topBeaches.length) && /* @__PURE__ */ React.createElement("div", { className: "sg-l-cards sg-rv" }, topBeaches.map((b) => /* @__PURE__ */ React.createElement("button", { key: b.id, className: "sg-l-card", onClick: () => onOpenBeach && onOpenBeach(b) }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", height: 124, overflow: "hidden" } }, /* @__PURE__ */ React.createElement(BeachScene, { beach: b }), /* @__PURE__ */ React.createElement("span", { style: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 2,
    background: statusCol(b),
    color: "#120821",
    fontWeight: 800,
    fontSize: 11,
    padding: "4px 9px",
    borderRadius: 999
  } }, statusShort(b), b.score != null ? ` \xB7 ${b.score}` : "")), /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 12px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, fontSize: 14, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, b.name), b.commune && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "rgba(255,255,255,.5)", marginTop: 2 } }, b.commune))))), !!(pickBeaches && pickBeaches.length > 3) && (() => {
    const norm = (s2) => String(s2 || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const nq = norm(pickQ);
    const list = pickBeaches.filter((b) => !nq || norm(b.name).includes(nq) || norm(b.commune).includes(nq)).slice(0, 60);
    return /* @__PURE__ */ React.createElement("div", { className: "sg-rv", style: { marginTop: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { ...ovl, marginBottom: 8 } }, _t(lang, "Ta plage", "Your beach", "Tu playa")), /* @__PURE__ */ React.createElement("h3", { style: {
      fontFamily: "'Anton',sans-serif",
      fontWeight: 400,
      fontSize: 21,
      letterSpacing: ".01em",
      textTransform: "uppercase",
      color: "#fff",
      margin: "0 0 12px"
    } }, _t(lang, "Choisis ta plage", "Pick your beach", "Elige tu playa")), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", display: "flex", alignItems: "center", marginBottom: 10 } }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        style: {
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: "#5A5A5A",
          flexShrink: 0,
          pointerEvents: "none"
        }
      },
      /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7", stroke: "currentColor", strokeWidth: "2.4" }),
      /* @__PURE__ */ React.createElement("path", { d: "M16.5 16.5 L21 21", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round" })
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: pickQ,
        onChange: (e) => {
          setPickQ(e.target.value);
        },
        type: "search",
        autoComplete: "off",
        autoCorrect: "off",
        autoCapitalize: "off",
        spellCheck: false,
        enterKeyHint: "search",
        onFocus: () => track("sg_landing_pick_search", {}),
        placeholder: _t(lang, "Chercher une plage\u2026", "Search a beach\u2026", "Buscar una playa\u2026"),
        "aria-label": _t(lang, "Chercher une plage", "Search a beach", "Buscar una playa"),
        style: {
          width: "100%",
          minHeight: 48,
          boxSizing: "border-box",
          background: "var(--sg-card,#fff)",
          border: "2.5px solid #0D0D0D",
          borderRadius: 12,
          padding: "13px 14px 13px 42px",
          color: "var(--sg-ink,#0D0D0D)",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          outline: "none",
          boxShadow: "2px 2px 0 #0D0D0D"
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { style: {
      maxHeight: 312,
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      WebkitOverflowScrolling: "touch",
      paddingRight: 2
    } }, list.map((b) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: b.id,
        onClick: () => onOpenBeach && onOpenBeach(b),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          textAlign: "left",
          background: "#10231E",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 12,
          padding: "11px 14px",
          cursor: "pointer",
          fontFamily: "inherit"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: {
        width: 10,
        height: 10,
        borderRadius: 5,
        flexShrink: 0,
        background: statusCol(b),
        boxShadow: `0 0 8px ${statusCol(b)}`
      } }),
      /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { style: {
        display: "block",
        fontWeight: 700,
        fontSize: 14,
        color: "#fff",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, b.name), b.commune && /* @__PURE__ */ React.createElement("span", { style: {
        display: "block",
        fontSize: 11.5,
        color: "rgba(255,255,255,.5)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, b.commune, typeof b.drive === "number" ? ` \xB7 ${b.drive} min` : "")),
      /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Anton',sans-serif", fontSize: 17, color: statusCol(b), letterSpacing: ".02em" } }, b.score),
      /* @__PURE__ */ React.createElement("span", { style: { color: "rgba(255,255,255,.3)", fontSize: 18, lineHeight: 1 } }, "\u203A")
    )), !list.length && /* @__PURE__ */ React.createElement("div", { className: "sg-empty", style: { padding: "18px 8px" } }, /* @__PURE__ */ React.createElement("div", { className: "sg-empty__veil" }, /* @__PURE__ */ React.createElement(Veilleur, { mood: "serein", size: 44 })), /* @__PURE__ */ React.createElement("div", { className: "sg-empty__title", style: { fontSize: 15 } }, _t(lang, "Aucune plage trouv\xE9e", "No beach found", "Ninguna playa encontrada")), /* @__PURE__ */ React.createElement("div", { className: "sg-empty__sub" }, _t(lang, "Essaie une autre recherche \u2014 je veille sur le reste.", "Try another search \u2014 I'm watching the rest.", "Prueba otra b\xFAsqueda \u2014 vigilo el resto.")))));
  })(), /* @__PURE__ */ React.createElement("button", { onClick: onShowMap, className: "sg-rv", style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    background: "rgba(10,23,20,.45)",
    color: "#fff",
    border: "1.5px solid rgba(255,255,255,.3)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 15,
    padding: "15px 18px",
    borderRadius: 18,
    marginTop: 14
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "map", size: 15, accent: "#120821", style: { verticalAlign: "-2px", marginRight: 6, display: "inline-block" } }), _t(lang, "Ouvrir la carte live", "Open the live map", "Abrir el mapa en vivo"))), /* @__PURE__ */ React.createElement("section", { style: { ...secPad, paddingBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "sg-rv", "data-s": "methode" }, /* @__PURE__ */ React.createElement("div", { style: ovl }, _t(lang, "La m\xE9thode", "The method", "El m\xE9todo")), /* @__PURE__ */ React.createElement("h2", { style: h2s }, _t(lang, "On regarde la mer pour vous", "We watch the sea for you", "Miramos el mar por ti")))), /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { style: { height: "430vh" } }) }, /* @__PURE__ */ React.createElement(ScrollStory, { lang, onShowMap }))), /* @__PURE__ */ React.createElement("section", { style: { ...secPad, paddingTop: 26 } }, /* @__PURE__ */ React.createElement("div", { className: "sg-rv", style: { display: "flex", flexDirection: "column", gap: 14, margin: "14px 0 20px" } }, [
    ["satellite", _t(lang, "Satellite Copernicus \u2014 4 passages par jour, chaque plage", "Copernicus satellite \u2014 4 passes a day, every beach", "Sat\xE9lite Copernicus \u2014 4 pasadas al d\xEDa, cada playa")],
    ["score", _t(lang, "Un score 0-100 recalcul\xE9 \xE0 chaque passage", "A 0-100 score recomputed on every pass", "Un score 0-100 recalculado en cada pasada")],
    ["cal7", _t(lang, "Pr\xE9visions 7 jours, plage par plage", "7-day forecast, beach by beach", "Pron\xF3stico de 7 d\xEDas, playa por playa")]
  ].map(([ic, txt], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: "#10231E",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 16,
    padding: "14px 16px"
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: ic, size: 22, style: { marginTop: 1, color: "rgba(255,255,255,.92)" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.85)", fontWeight: 600 } }, txt)))), /* @__PURE__ */ React.createElement("button", { onClick: onOpen, className: "sg-rv", style: {
    display: "block",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#FFC72C",
    fontWeight: 800,
    fontSize: 15,
    padding: 0
  } }, _t(lang, `Voir ${beach.name} en d\xE9tail \u2192`, `See ${beach.name} in detail \u2192`, `Ver ${beach.name} en detalle \u2192`))), /* @__PURE__ */ React.createElement("section", { style: { ...secPad, paddingBottom: 24 } }, /* @__PURE__ */ React.createElement("div", { className: "sg-rv", "data-s": "premium" }, /* @__PURE__ */ React.createElement("div", { style: ovl }, "Premium"), /* @__PURE__ */ React.createElement("h2", { style: h2s }, _t(lang, "Soyez pr\xE9venu avant tout le monde", "Be the first to know", "Ent\xE9rate antes que nadie"))), /* @__PURE__ */ React.createElement("div", { className: "sg-rv", style: { margin: "16px 0 6px" } }, /* @__PURE__ */ React.createElement(AlertScene, null)), /* @__PURE__ */ React.createElement("div", { className: "sg-rv", style: { display: "flex", flexDirection: "column", gap: 10, margin: "14px 0 20px" } }, [
    ["bell", _t(lang, "Une alerte quand VOTRE plage change d'\xE9tat", "An alert when YOUR beach changes", "Una alerta cuando TU playa cambia")],
    ["brief", _t(lang, "Le brief du matin dans votre bo\xEEte mail", "The morning brief in your inbox", "El brief de la ma\xF1ana en tu correo")],
    ["cal7", _t(lang, "Les 7 jours de pr\xE9visions, toutes les plages", "The full 7-day forecast, every beach", "Los 7 d\xEDas de pron\xF3stico, todas las playas")]
  ].map(([ic, txt], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(255,255,255,.85)"
  } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: ic, size: 19, style: { color: "rgba(255,255,255,.92)" } }), txt))), onPremium && /* @__PURE__ */ React.createElement("button", { onClick: onPremium, className: "sg-rv gbtn", style: {
    display: "block",
    width: "100%",
    textAlign: "center",
    background: "#FFC72C",
    color: "#120821",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 16,
    padding: "16px 24px",
    borderRadius: 18,
    boxShadow: "0 8px 28px rgba(255,199,44,.25)"
  } }, _t(lang, "D\xE9couvrir Premium", "Discover Premium", "Descubrir Premium")), /* @__PURE__ */ React.createElement("div", { className: "sg-rv", style: { textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,.45)", marginTop: 10 } }, PAY_CAPTURE_ONLY ? _t(lang, "Sans carte \u2014 juste ton email", "No card \u2014 just your email", "Sin tarjeta \u2014 solo tu email") : _t(lang, "Paiement unique \u2014 sans abonnement, rien \xE0 r\xE9silier", "One-time payment \u2014 no subscription, nothing to cancel", "Pago \xFAnico \u2014 sin suscripci\xF3n, nada que cancelar"))), /* @__PURE__ */ React.createElement("footer", { style: {
    padding: "44px 22px calc(30px + env(safe-area-inset-bottom))",
    maxWidth: 560,
    margin: "0 auto",
    textAlign: "center",
    borderTop: "1px solid rgba(255,255,255,.07)",
    marginTop: 36
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontSize: 12, letterSpacing: ".14em", color: "rgba(255,255,255,.6)", marginBottom: 6 } }, wordmark), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.38)" } }, "\u{1F6F0} ", _t(lang, "Donn\xE9es : Copernicus Marine", "Data: Copernicus Marine", "Datos: Copernicus Marine"), upd ? ` \xB7 LIVE ${upd}` : "", " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: IS_NEW_REGION ? "/about/" : "/a-propos/", style: { color: "rgba(255,255,255,.38)" } }, _t(lang, "\xC0 propos", "About", "Acerca de")), IS_NEW_REGION && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/press/", style: { color: "rgba(255,255,255,.38)" } }, _t(lang, "Presse", "Press", "Prensa"))), !IS_NEW_REGION && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/widget/", style: { color: "rgba(255,255,255,.38)" } }, _t(lang, "Pro : widget gratuit", "Pro: free widget", "Pro: widget gratis")))), !IS_NEW_REGION && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 9, lineHeight: 1.8 } }, /* @__PURE__ */ React.createElement("a", { href: "/offres/", style: { color: "rgba(255,255,255,.38)" } }, "Offres"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/b2b", style: { color: "#0d7f63", fontSize: 13, textDecoration: "underline" } }, "Voir nos offres pros \u2192"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/fiabilite/", style: { color: "rgba(255,255,255,.38)" } }, "Fiabilit\xE9"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/cgv.html", style: { color: "rgba(255,255,255,.3)" } }, "CGV"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/remboursement.html", style: { color: "rgba(255,255,255,.3)" } }, "Remboursement"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/confidentialite.html", style: { color: "rgba(255,255,255,.3)" } }, "Confidentialit\xE9"), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: "/mentions-legales.html", style: { color: "rgba(255,255,255,.3)" } }, "Mentions l\xE9gales"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, color: "rgba(255,255,255,.26)" } }, "97TECH \xB7 SAS \xB7 RCS Paris 882\xA0370\xA0703")), IS_NEW_REGION && (() => {
    const sl = lang === "es" ? { t: "terminos", p: "privacidad", r: "reembolso", rel: "fiabilidad" } : { t: "terms", p: "privacy", r: "refund", rel: "reliability" };
    const ls = { color: "rgba(255,255,255,.38)" }, lsd = { color: "rgba(255,255,255,.3)" };
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 9, lineHeight: 1.8 } }, /* @__PURE__ */ React.createElement("a", { href: `/${sl.rel}/`, style: ls }, _t(lang, "Fiabilit\xE9", "Reliability", "Fiabilidad")), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: `/${sl.t}/`, style: lsd }, _t(lang, "CGV", "Terms", "T\xE9rminos")), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: `/${sl.p}/`, style: lsd }, _t(lang, "Confidentialit\xE9", "Privacy", "Privacidad")), " \xB7 ", /* @__PURE__ */ React.createElement("a", { href: `/${sl.r}/`, style: lsd }, _t(lang, "Remboursement", "Refund", "Reembolso")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, color: "rgba(255,255,255,.26)" } }, _t(lang, "\xC9dit\xE9 par", "Operated by", "Operado por"), " 97TECH \xB7 SAS \xB7 RCS Paris 882\xA0370\xA0703"));
  })()));
}
function AlertHub({ lang, island: island2, beach, onPremium, onShowMap, onClose, onEnableAlerts }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSubscribed = (() => {
    try {
      return !!localStorage.getItem("sg_email");
    } catch (_) {
      return false;
    }
  })();
  const dateLong = (/* @__PURE__ */ new Date()).toLocaleDateString(lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const beachName = beach ? beach.name : lang === "en" ? "your beach" : lang === "es" ? "tu playa" : "ta plage";
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setBusy(true);
    track("sg_email_submit", { source: "alertes" });
    try {
      localStorage.setItem("sg_email", email);
    } catch (_) {
    }
    const islandCode = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ";
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email, island: islandCode, source: "alertes", date: (/* @__PURE__ */ new Date()).toISOString() })
    }).then(() => {
      setSubmitted(true);
      setBusy(false);
    }).catch(() => {
      setSubmitted(true);
      setBusy(false);
    });
    try {
      onEnableAlerts && onEnableAlerts();
    } catch (_) {
    }
  };
  const pushMissing = (() => {
    try {
      if (/[?&]alertpush=0/.test(window.location.search)) return false;
      return typeof Notification === "undefined" || Notification.permission !== "granted" || sgAlertsOff();
    } catch (_) {
      return true;
    }
  })();
  const PushCta = onEnableAlerts && pushMissing ? /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          track("sg_alerts_hub_push_cta", {});
        } catch (_) {
        }
        ;
        onEnableAlerts();
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: "12px auto 0",
        background: "#FFC72C",
        color: "#120821",
        border: "none",
        borderRadius: 12,
        padding: "11px 16px",
        fontSize: 13.5,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    },
    "\u{1F514} ",
    _t(lang, "Activer les notifications sur ce t\xE9l\xE9phone", "Turn on notifications on this phone", "Activar notificaciones en este tel\xE9fono")
  ) : null;
  useEffect(() => {
    track("sg_alerts_view", { variant: "hub", lang });
  }, [lang]);
  return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100svh", background: "linear-gradient(180deg,#0C1D21 0%,#120821 100%)", color: "#fff", position: "relative", padding: "40px 16px 60px", fontFamily: "inherit" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onClose,
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 16, zIndex: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.85)", width: 44, height: 44, borderRadius: "50%", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }
    },
    "\xD7"
  ), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "stretch" } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 20, marginTop: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, fontWeight: 800, color: "#156a96", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 } }, dateLong, " \xB7 ", _t(lang, "LE VEILLEUR PERSONNEL", "YOUR PERSONAL WATCHER", "TU VIG\xCDA PERSONAL")), /* @__PURE__ */ React.createElement("h1", { style: { fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: "clamp(28px,6.5vw,42px)", lineHeight: 1.02, letterSpacing: ".01em", textTransform: "uppercase", margin: "0 0 16px", color: "#fff" } }, _t(lang, "On surveille ta plage pendant que tu dors.", "We watch your beach while you sleep.", "Vigilamos tu playa mientras duermes.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", margin: "12px 0 16px" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: "serein", size: 64 })), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 14, lineHeight: 1.4, color: "rgba(255,255,255,.7)", maxWidth: 460, margin: "0 auto" } }, _t(lang, `Tu n'ouvres l'app que le jour o\xF9 l'\xE9tat de ${beachName} change. Le reste du temps, profite.`, `You only open the app the day ${beachName}'s status changes. The rest of the time, enjoy.`, `Solo abres la aplicaci\xF3n el d\xEDa que el estado de ${beachName} cambie. El resto del tiempo, disfruta.`))), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 28, borderRadius: 20, overflow: "hidden" } }, /* @__PURE__ */ React.createElement(AlertScene, null)), /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#190c2c,#142824)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: "18px 20px", marginBottom: 28, position: "relative", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "-50%", left: "-20%", width: "60%", height: "200%", background: "radial-gradient(ellipse, rgba(34,197,94,.06) 0%, transparent 70%)", pointerEvents: "none" } }), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, submitted ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 14, fontWeight: 600, color: "#1c7fb0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 22, display: "block", marginBottom: 6 } }, "\u2705"), _t(lang, "C'est fait ! Le verdict du matin arrive dans ta bo\xEEte.", "You're in! The morning verdict will arrive in your inbox.", "\xA1Listo! El veredicto matutino llegar\xE1 a tu bandeja."), PushCta) : isSubscribed ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.85)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, marginRight: 6 } }, "\u2713"), _t(lang, "Tu es d\xE9j\xE0 inscrit aux alertes quotidiennes.", "You are already subscribed to daily alerts.", "Ya est\xE1s suscrito a las alertas diarias."), PushCta, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => onPremium("alertes_subscribed"),
      style: { display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#FFC72C", fontWeight: 800, fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }
    },
    _t(lang, "G\xE9rer mes alertes Premium \u2192", "Manage my Premium alerts \u2192", "Gestionar mis alertas Premium \u2192")
  )) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 } }, _t(lang, "GRATUIT", "FREE", "GRATIS")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700, color: "#fff", marginBottom: 6 } }, _t(lang, `Re\xE7ois le verdict du matin sur ${beachName}`, `Get the morning verdict for ${beachName}`, `Recibe el veredicto matutino sobre ${beachName}`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 14, lineHeight: 1.4 } }, _t(lang, "Bilan matinal chaque jour + alerte imm\xE9diate si le statut change.", "Daily morning brief + immediate alert if status changes.", "Resumen matinal diario + alerta inmediata si el estado cambia.")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, style: { display: "flex", gap: 10, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      inputMode: "email",
      autoComplete: "email",
      required: true,
      placeholder: _t(lang, "ton@email.com", "your@email.com", "tu@email.com"),
      "aria-label": _t(lang, "Ton email pour le verdict de cette plage", "Your email for this beach verdict", "Tu email para el veredicto de esta playa"),
      value: email,
      onChange: (e) => setEmail(e.target.value),
      disabled: busy,
      style: { flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", fontSize: 16, fontFamily: "inherit", background: "rgba(255,255,255,.06)", outline: "none", minWidth: 0, color: "#fff" }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: busy,
      style: { background: "#1c7fb0", color: "#06231d", border: "none", borderRadius: 12, padding: "12px 18px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }
    },
    busy ? "..." : _t(lang, "S'inscrire", "Subscribe", "Suscribirme")
  ))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 32, padding: "0 4px" } }, [
    ["bell", _t(lang, "Alerte la VEILLE quand les sargasses approchent de ta plage", "Alert the DAY BEFORE sargassum approaches your beach", "Alerta la V\xCDSPERA cuando el sargazo se acerque a tu playa")],
    ["brief", _t(lang, "Le brief complet du matin : ta meilleure plage du jour", "The morning brief: your best clean beach today", "El brief matinal: tu mejor playa limpia hoy")],
    ["cal7", _t(lang, "Les 7 jours de pr\xE9visions complets, plage par plage", "The 7-day forecast, beach by beach", "Los 7 d\xEDas de pron\xF3stico, playa por playa")]
  ].map(([ic, txt], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "flex-start", gap: 12, fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.85)", lineHeight: 1.35 } }, /* @__PURE__ */ React.createElement(BrandIcon, { name: ic, size: 20, style: { color: "rgba(255,255,255,.92)", marginTop: 1 } }), /* @__PURE__ */ React.createElement("span", null, txt)))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => onPremium("alertes"),
      className: "gbtn",
      style: { display: "block", width: "100%", textAlign: "center", background: "#FFC72C", color: "#120821", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 16, padding: "16px 24px", borderRadius: 18, boxShadow: "0 8px 28px rgba(255,199,44,.25)", marginBottom: 10 }
    },
    _t(lang, "D\xE9couvrir Premium", "Discover Premium", "Descubrir Premium")
  ), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,.45)", marginBottom: 36 } }, PAY_CAPTURE_ONLY ? _t(lang, "Sans carte \u2014 juste ton email", "No card \u2014 just your email", "Sin tarjeta \u2014 solo tu email") : _t(lang, "Paiement unique \u2014 sans abonnement, rien \xE0 r\xE9silier", "One-time payment \u2014 no subscription, nothing to cancel", "Pago \xFAnico \u2014 sin suscripci\xF3n, nada que cancelar")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 24 } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onShowMap,
      style: { background: "none", border: "none", color: "#1c7fb0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }
    },
    _t(lang, "Voir l'\xE9tat des plages maintenant \u2192", "See beach status now \u2192", "Ver el estado de las playas ahora \u2192")
  ), !IS_NEW_REGION && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "/previsions/",
      style: { color: "rgba(255,255,255,.5)", fontWeight: 600, fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }
    },
    _t(lang, "Comment marchent nos pr\xE9visions \u2192", "How our forecasts work \u2192", "C\xF3mo funcionan nuestros pron\xF3sticos \u2192")
  ))));
}
function WorldAfaiGauge({ afai, lang }) {
  const v = Math.max(0, Math.min(0.5, typeof afai === "number" ? afai : 0.1));
  const pct = Math.round(v / 0.5 * 100);
  return /* @__PURE__ */ React.createElement("div", { style: { margin: "12px 0 2px" } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { height: 8, borderRadius: 999, background: "linear-gradient(90deg,#22C55E 0%,#22C55E 30%,#F59E0B 30%,#F59E0B 80%,#E8522A 80%)" } }), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", height: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "wf-mark", style: { position: "absolute", top: -13, left: "calc(" + pct + "% - 6px)", width: 12, height: 12, borderRadius: "50%", background: "#fff", border: "2px solid #07201E", boxShadow: "0 1px 6px rgba(0,0,0,.5)" } })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.72)", letterSpacing: ".04em" } }, /* @__PURE__ */ React.createElement("span", null, _t(lang, "Propre", "Clean", "Limpia")), /* @__PURE__ */ React.createElement("span", null, _t(lang, "Algues fortes", "Heavy algae", "Algas fuertes"))));
}
function WorldHotspot({ x, y, label, onClick, delay }) {
  return /* @__PURE__ */ React.createElement("button", { onClick, "aria-label": label, style: { position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", zIndex: 3, width: 38, height: 38, borderRadius: "50%", border: "none", background: "none", cursor: "pointer", padding: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "wf-hot", style: { display: "block", width: 14, height: 14, margin: "0 auto", borderRadius: "50%", background: "rgba(255,255,255,.95)", animationDelay: (delay || 0) + "s" } }));
}
function WorldCard({ beach, lang, active, index, onCarnet, phaseGrad }) {
  const status = beach.status || "clean";
  const vm = verdictMeta(status, lang);
  const hasScore = typeof beach.score === "number";
  const mood = hasScore ? moodFromScore(beach.score) : moodFromStatus(status);
  const afai = typeof beach.afai === "number" ? beach.afai : null;
  const [tip, setTip] = useState(null);
  const TIPS = {
    sky: { t: _t(lang, "\u2600\uFE0F Le saviez-vous ?", "\u2600\uFE0F Did you know?", "\u2600\uFE0F \xBFSab\xEDas?"), b: _t(lang, "La ceinture de sargasses traverse l'Atlantique sur pr\xE8s de 8 000 km \u2014 visible depuis l'espace.", "The sargassum belt crosses the Atlantic for nearly 8,000 km \u2014 visible from space.", "El cintur\xF3n de sargazo cruza el Atl\xE1ntico casi 8.000 km \u2014 visible desde el espacio.") },
    sea: { t: _t(lang, "\u{1F6F0}\uFE0F Les algues, vues du ciel", "\u{1F6F0}\uFE0F Algae from space", "\u{1F6F0}\uFE0F Algas desde el cielo"), b: (afai != null ? "AFAI " + afai.toFixed(2) + " \u2014 " : "") + (status === "clean" ? _t(lang, "signal faible : eau claire aujourd'hui.", "low signal: clear water today.", "se\xF1al baja: agua clara hoy.") : status === "moderate" ? _t(lang, "signal mod\xE9r\xE9 : pr\xE9sence \xE9parse, prudence.", "moderate signal: scattered presence.", "se\xF1al moderada: presencia dispersa.") : _t(lang, "signal fort : \xE9chouage probable, \xE9vite.", "strong signal: likely beaching.", "se\xF1al fuerte: varaz\xF3n probable.")) },
    veilleur: { t: _t(lang, "Le verdict du Veilleur", "The Watchman's verdict", "El veredicto del Vig\xEDa"), b: vm.verb + " \u2014 " + (hasScore ? _t(lang, "score " + beach.score + "/100, ", "score " + beach.score + "/100, ", "puntuaci\xF3n " + beach.score + "/100, ") : "") + _t(lang, "d'apr\xE8s le scan satellite du jour, recoup\xE9 sur 30 jours.", "from today's satellite scan, cross-checked over 30 days.", "seg\xFAn el escaneo de hoy, contrastado 30 d\xEDas.") }
  };
  const show = (k) => {
    setTip(TIPS[k]);
    try {
      track("sg_world_hotspot", { zone: k, beach_id: beach.id });
    } catch (_) {
    }
  };
  const vtRef = useRef(0);
  const tapVeilleur = () => {
    vtRef.current += 1;
    if (vtRef.current >= 5) {
      vtRef.current = 0;
      setTip({ t: _t(lang, "\u{1F6F0}\uFE0F\u2728 Tu as r\xE9veill\xE9 le Veilleur !", "\u{1F6F0}\uFE0F\u2728 You woke the Watchman!", "\u{1F6F0}\uFE0F\u2728 \xA1Despertaste al Vig\xEDa!"), b: _t(lang, "Il te fait un clin d'\u0153il. Reviens chaque jour : la mer change, et lui aussi.", "He winks at you. Come back each day: the sea changes, and so does he.", "Te gui\xF1a. Vuelve cada d\xEDa: el mar cambia, y \xE9l tambi\xE9n.") });
      try {
        track("sg_world_easter", { egg: "veilleur5", beach_id: beach.id });
      } catch (_) {
      }
    } else show("veilleur");
  };
  return /* @__PURE__ */ React.createElement("section", { style: { position: "relative", height: "100svh", minHeight: "100svh", scrollSnapAlign: "start", scrollSnapStop: "always", overflow: "hidden", background: phaseGrad } }, active ? /* @__PURE__ */ React.createElement(BeachScene, { beach }) : /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: 0, background: phaseGrad } }), /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,9,11,0) 36%,rgba(4,9,11,.34) 64%,rgba(4,9,11,.84) 100%)" } }), active && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(WorldHotspot, { x: "24%", y: "19%", label: TIPS.sky.t, onClick: () => show("sky"), delay: 0 }), /* @__PURE__ */ React.createElement(WorldHotspot, { x: "66%", y: "49%", label: TIPS.sea.t, onClick: () => show("sea"), delay: 0.9 })), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4, padding: "0 22px calc(118px + env(safe-area-inset-bottom)) 22px", color: "#fff", maxWidth: 560, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 4 } }, hasScore && /* @__PURE__ */ React.createElement(ScoreBlob, { score: beach.score, color: beach.scoreColor || vm.color, size: 64 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800, color: vm.color } }, /* @__PURE__ */ React.createElement("span", null, vm.emoji), /* @__PURE__ */ React.createElement("span", null, vm.verb)), /* @__PURE__ */ React.createElement("h2", { style: { margin: "2px 0 0", fontFamily: "'Anton',system-ui,sans-serif", fontSize: 30, lineHeight: 1.02, letterSpacing: ".01em", textShadow: "0 2px 14px rgba(0,0,0,.5)" } }, beach.name), beach.commune && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.8)" } }, beach.commune)), /* @__PURE__ */ React.createElement("button", { onClick: tapVeilleur, "aria-label": TIPS.veilleur.t, style: { background: "none", border: "none", padding: 0, cursor: "pointer" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood, size: 42 }))), /* @__PURE__ */ React.createElement(WorldAfaiGauge, { afai: beach.afai, lang }), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: reliabilityHref(lang),
      onClick: (e) => {
        e.stopPropagation();
        try {
          track("sg_reliability_open", { from: "world_card" });
        } catch (_) {
        }
      },
      style: { display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.92)", textDecoration: "none" }
    },
    "\u{1F6F0}\uFE0F ",
    /* @__PURE__ */ React.createElement("span", null, _t(lang, "Scan satellite \u2022 recoup\xE9 chaque jour", "Satellite scan \u2022 cross-checked daily", "Escaneo sat\xE9lite \u2022 contrastado a diario")),
    " ",
    /* @__PURE__ */ React.createElement("span", { style: { color: "#3fd07f" } }, "\u2192")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          track("sg_world_carnet", { beach_id: beach.id, status });
        } catch (_) {
        }
        ;
        onCarnet && onCarnet(beach);
      },
      style: {
        display: "block",
        width: "100%",
        marginTop: 14,
        padding: "14px",
        borderRadius: 16,
        border: "none",
        cursor: "pointer",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        fontSize: 15,
        fontWeight: 800,
        color: "#07201E",
        background: "linear-gradient(180deg,#FFD884,#F2B05E)",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)"
      }
    },
    _t(lang, "Le carnet du Veilleur \u2192", "The Watchman's log \u2192", "El cuaderno del Vig\xEDa \u2192")
  )), index === 0 && !tip && /* @__PURE__ */ React.createElement("div", { className: "wf-hint", "aria-hidden": "true", style: { position: "absolute", left: 0, right: 0, bottom: "calc(94px + env(safe-area-inset-bottom))", zIndex: 4, textAlign: "center", color: "rgba(255,255,255,.85)", fontSize: 12, fontWeight: 800, letterSpacing: ".07em" } }, "\u{1F446} ", _t(lang, "TOUCHE LA SC\xC8NE \xB7 SCROLLE \u2193", "TAP THE SCENE \xB7 SCROLL \u2193", "TOCA LA ESCENA \xB7 DESLIZA \u2193")), tip && /* @__PURE__ */ React.createElement("button", { onClick: () => setTip(null), "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: { position: "absolute", inset: 0, zIndex: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(4,9,11,.42)", border: "none", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("div", { className: "wf-pop", style: { maxWidth: 332, background: "rgba(7,32,30,.95)", border: "1px solid rgba(95,211,201,.42)", borderRadius: 18, padding: "18px 20px", textAlign: "left", boxShadow: "0 14px 44px rgba(0,0,0,.55)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: "#3fd07f", marginBottom: 7 } }, tip.t), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, lineHeight: 1.5, color: "#fff" } }, tip.b), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, fontSize: 11, color: "rgba(255,255,255,.5)" } }, _t(lang, "Touche pour fermer", "Tap to close", "Toca para cerrar")))));
}
const WORLD_FACTS = [
  { emoji: "\u{1F30A}", t: (l) => _t(l, "8 000 km d'algues", "8,000 km of algae", "8.000 km de algas"), b: (l) => _t(l, "La grande ceinture atlantique relie l'Afrique au Br\xE9sil. On la suit par satellite, chaque jour.", "The great Atlantic belt links Africa to Brazil. We track it by satellite, every day.", "El gran cintur\xF3n atl\xE1ntico une \xC1frica y Brasil. Lo seguimos por sat\xE9lite, cada d\xEDa.") },
  { emoji: "\u{1F6F0}\uFE0F", t: (l) => _t(l, "L'\u0153il dans l'espace", "The eye in space", "El ojo en el espacio"), b: (l) => _t(l, "Le Veilleur lit l'indice AFAI des satellites et le recoupe chaque jour : pr\xE9visions v\xE9rifi\xE9es au satellite.", "The Watchman reads the satellites' AFAI index, cross-checked daily against satellite.", "El Vig\xEDa lee el \xEDndice AFAI, contrastado a diario con sat\xE9lite.") },
  { emoji: "\u{1F4A8}", t: (l) => _t(l, "Le H\u2082S, c'est quoi ?", "What is H\u2082S?", "\xBFQu\xE9 es el H\u2082S?"), b: (l) => _t(l, "En se d\xE9composant, les sargasses d\xE9gagent du sulfure d'hydrog\xE8ne \u2014 l'odeur d'\u0153uf. On te pr\xE9vient avant.", "Decomposing sargassum releases hydrogen sulfide \u2014 the egg smell. We warn you first.", "Al descomponerse libera sulfuro de hidr\xF3geno \u2014 olor a huevo. Te avisamos antes.") },
  { emoji: "\u267B\uFE0F", t: (l) => _t(l, "Une ressource ?", "A resource?", "\xBFUn recurso?"), b: (l) => _t(l, "Ramass\xE9es t\xF4t, les sargasses deviennent engrais, bioplastique ou \xE9nergie. Le timing change tout.", "Collected early, sargassum becomes fertilizer, bioplastic or energy. Timing is everything.", "Recogido a tiempo, el sargazo se vuelve fertilizante o energ\xEDa. El tiempo lo es todo.") }
];
function WorldInfoCard({ fact, lang }) {
  return /* @__PURE__ */ React.createElement("section", { style: {
    position: "relative",
    height: "100svh",
    minHeight: "100svh",
    scrollSnapAlign: "start",
    overflow: "hidden",
    background: "radial-gradient(120% 80% at 50% 20%,#11463E 0%,#0B2230 55%,#04090B 100%)",
    color: "#fff"
  } }, /* @__PURE__ */ React.createElement("div", { className: "wf-fact", style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 30px calc(120px + env(safe-area-inset-bottom))", maxWidth: 540, margin: "0 auto", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 54, lineHeight: 1 } }, fact.emoji), /* @__PURE__ */ React.createElement("h2", { style: { margin: "16px 0 0", fontFamily: "'Anton',system-ui,sans-serif", fontSize: 32, lineHeight: 1.05 } }, fact.t(lang)), /* @__PURE__ */ React.createElement("p", { style: { margin: "12px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,.88)" } }, fact.b(lang)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 22, fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", color: "rgba(255,255,255,.55)" } }, _t(lang, "CONTINUE \u2193", "CONTINUE \u2193", "SIGUE \u2193"))));
}
function VerdictDuJourCard({ beach, lang }) {
  const real = beach.status || "clean";
  const vm = verdictMeta(real, lang);
  const hasScore = typeof beach.score === "number";
  const afai = typeof beach.afai === "number" ? beach.afai : null;
  const dayKey = "sg_vdj_" + beach.id + "_" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const prior = g(dayKey, null);
  const [guess, setGuess] = useState(prior ? prior.guess : null);
  const [best] = useState(() => g("sg_vdj_best", 0) || 0);
  const cachedRef = useRef(!!prior);
  useEffect(() => {
    if (cachedRef.current) {
      try {
        track("sg_verdict_cached_view", { beach_id: beach.id });
      } catch (_) {
      }
    }
  }, []);
  const correct = guess === real;
  const opts = [
    { s: "clean", e: "\u{1F60E}", l: _t(lang, "Propre", "Clean", "Limpia"), c: "#22C55E" },
    { s: "moderate", e: "\u{1F610}", l: _t(lang, "Prudence", "Careful", "Cuidado"), c: "#F59E0B" },
    { s: "avoid", e: "\u{1F6AB}", l: _t(lang, "\xC9vite", "Avoid", "Evita"), c: "#E8522A" }
  ];
  const why = (afai != null ? "AFAI " + afai.toFixed(2) + " \u2014 " : "") + (real === "clean" ? _t(lang, "signal satellite faible, eau claire.", "low satellite signal, clear water.", "se\xF1al baja, agua clara.") : real === "moderate" ? _t(lang, "signal mod\xE9r\xE9, pr\xE9sence \xE9parse.", "moderate signal, scattered.", "se\xF1al moderada.") : _t(lang, "signal fort, \xE9chouage probable.", "strong signal, likely beaching.", "se\xF1al fuerte."));
  const pick2 = (status) => {
    if (guess) return;
    cachedRef.current = false;
    setGuess(status);
    s(dayKey, { guess: status });
    const ok = status === real;
    try {
      track("sg_verdict_guess", { beach_id: beach.id, guess: status, correct: ok });
    } catch (_) {
    }
    let ns = 0;
    try {
      ns = ok ? (g("sg_vdj_streak", 0) || 0) + 1 : 0;
      s("sg_vdj_streak", ns);
      if (ns > (g("sg_vdj_best", 0) || 0)) s("sg_vdj_best", ns);
    } catch (_) {
    }
    try {
      track("sg_verdict_reveal", { beach_id: beach.id, correct: ok, status: real, streak: ns });
    } catch (_) {
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: { margin: "0 0 14px", padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(0,0,0,.06)" } }, /* @__PURE__ */ React.createElement("style", null, `@keyframes vdjPop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}.vdj-pop{animation:vdjPop .22s cubic-bezier(.34,1.56,.64,1) both}@media(prefers-reduced-motion:reduce){.vdj-pop{animation:none}}`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: "#C97E3A" } }, "\u{1F3AF} ", _t(lang, "VERDICT DU JOUR", "TODAY'S VERDICT", "VEREDICTO DE HOY"), best > 0 ? " \xB7 \u{1F525} " + best : ""), !guess ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { margin: "8px 0 10px", fontSize: 14, fontWeight: 700, color: "var(--sg-ink,#13241F)" } }, _t(lang, "\xC0 ton avis, c'est comment ici aujourd'hui ?", "Your call for this beach today?", "\xBFC\xF3mo crees que est\xE1 hoy aqu\xED?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, opts.map((o) => /* @__PURE__ */ React.createElement("button", { key: o.s, onClick: () => pick2(o.s), "aria-label": o.l, style: { flex: 1, padding: "12px 6px", borderRadius: 13, cursor: "pointer", border: "1px solid " + o.c + "55", background: o.c + "12", color: "var(--sg-ink,#13241F)", fontWeight: 800, fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: "inherit" } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 22 } }, o.e), o.l)))) : /* @__PURE__ */ React.createElement("div", { className: cachedRef.current ? "" : "vdj-pop" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 800, margin: "8px 0 10px", color: correct ? "#16A34A" : "#C97E3A" } }, correct ? _t(lang, "Bravo ! \u{1F389}", "Nailed it! \u{1F389}", "\xA1Bien! \u{1F389}") : _t(lang, "Le vrai verdict :", "The real verdict:", "El veredicto:")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } }, hasScore && /* @__PURE__ */ React.createElement(ScoreBlob, { score: beach.score, color: beach.scoreColor || vm.color, size: 54 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 800, color: vm.color } }, vm.emoji, " ", vm.verb), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, lineHeight: 1.4, color: "var(--sg-mid,#5A5A5A)" } }, why))), !correct && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        try {
          track("sg_share", { variant: "missed", beach_id: beach.id, guess });
        } catch (_) {
        }
        ;
        try {
          await buildShareCard({ variant: "missed", guess, streak: g("sg_vdj_streak", 0) || 0, lang });
        } catch (_) {
        }
      },
      style: { display: "block", width: "100%", marginTop: 12, padding: "11px", borderRadius: 12, border: "1px solid rgba(201,126,58,.4)", cursor: "pointer", background: "rgba(201,126,58,.08)", color: "#C97E3A", fontWeight: 800, fontSize: 13, fontFamily: "inherit" }
    },
    "\u{1F30A} ",
    _t(lang, "La mer m'a eu \u2014 tu ferais mieux ?", "The sea fooled me \u2014 beat it?", "El mar me enga\xF1\xF3 \u2014 \xBFlo haces mejor?")
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "var(--sg-mid,#9a9a9a)" } }, "\u2193 ", _t(lang, "Le d\xE9tail ci-dessous", "Full data below", "Detalle abajo"))));
}
function WorldChallengeCard({ beach, lang, active, phaseGrad, onGuess, streak }) {
  const real = beach.status || "clean";
  const vm = verdictMeta(real, lang);
  const hasScore = typeof beach.score === "number";
  const afai = typeof beach.afai === "number" ? beach.afai : null;
  const [guess, setGuess] = useState(null);
  const correct = guess === real;
  const opts = [
    { s: "clean", e: "\u{1F60E}", l: _t(lang, "Propre", "Clean", "Limpia"), c: "#22C55E" },
    { s: "moderate", e: "\u{1F610}", l: _t(lang, "Prudence", "Careful", "Cuidado"), c: "#F59E0B" },
    { s: "avoid", e: "\u{1F6AB}", l: _t(lang, "\xC9vite", "Avoid", "Evita"), c: "#E8522A" }
  ];
  const pick2 = (s2) => {
    if (guess) return;
    setGuess(s2);
    try {
      track("sg_world_guess", { beach_id: beach.id, guess: s2, correct: s2 === real });
    } catch (_) {
    }
    ;
    onGuess && onGuess(s2 === real);
  };
  const why = (afai != null ? "AFAI " + afai.toFixed(2) + " \u2014 " : "") + (real === "clean" ? _t(lang, "signal satellite faible, eau claire.", "low satellite signal, clear water.", "se\xF1al baja, agua clara.") : real === "moderate" ? _t(lang, "signal mod\xE9r\xE9, pr\xE9sence \xE9parse.", "moderate signal, scattered.", "se\xF1al moderada.") : _t(lang, "signal fort, \xE9chouage probable.", "strong signal, likely beaching.", "se\xF1al fuerte."));
  return /* @__PURE__ */ React.createElement("section", { style: { position: "relative", height: "100svh", minHeight: "100svh", scrollSnapAlign: "start", scrollSnapStop: "always", overflow: "hidden", background: phaseGrad } }, active ? /* @__PURE__ */ React.createElement(BeachScene, { beach }) : /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: 0, background: phaseGrad } }), /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,9,11,.15) 0%,rgba(4,9,11,.2) 40%,rgba(4,9,11,.86) 100%)" } }), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4, padding: "0 22px calc(120px + env(safe-area-inset-bottom)) 22px", color: "#fff", maxWidth: 560, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#FFD884" } }, "\u{1F3AF} ", _t(lang, "D\xC9FI DU VEILLEUR", "WATCHMAN'S CHALLENGE", "DESAF\xCDO DEL VIG\xCDA"), streak > 0 ? " \xB7 \u{1F525} " + streak : ""), /* @__PURE__ */ React.createElement("h2", { style: { margin: "4px 0 0", fontFamily: "'Anton',system-ui,sans-serif", fontSize: 28, lineHeight: 1.04, textShadow: "0 2px 14px rgba(0,0,0,.5)" } }, beach.name), beach.commune && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.8)" } }, beach.commune), !guess ? /* @__PURE__ */ React.createElement("div", { className: "wf-pop" }, /* @__PURE__ */ React.createElement("p", { style: { margin: "14px 0 10px", fontSize: 15, fontWeight: 700 } }, _t(lang, "\xC0 ton avis, c'est comment aujourd'hui ?", "Your call for today?", "\xBFC\xF3mo est\xE1 hoy?")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, opts.map((o) => /* @__PURE__ */ React.createElement("button", { key: o.s, onClick: () => pick2(o.s), style: { flex: 1, padding: "13px 6px", borderRadius: 14, border: "1px solid " + o.c + "66", cursor: "pointer", background: "rgba(255,255,255,.08)", color: "#fff", fontWeight: 800, fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 24 } }, o.e), o.l)))) : /* @__PURE__ */ React.createElement("div", { className: "wf-pop" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: correct ? "#22C55E" : "#FFD884", margin: "14px 0 10px" } }, correct ? _t(lang, "Bravo ! \u{1F389} +1 s\xE9rie", "Nailed it! \u{1F389} +1 streak", "\xA1Bien! \u{1F389} +1 racha") : _t(lang, "Rat\xE9 ! Le vrai verdict :", "Missed! The real verdict:", "\xA1Fallaste! El veredicto:")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } }, hasScore && /* @__PURE__ */ React.createElement(ScoreBlob, { score: beach.score, color: beach.scoreColor || vm.color, size: 58 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: vm.color } }, vm.emoji, " ", vm.verb), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.4, color: "rgba(255,255,255,.84)" } }, why))), !correct && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        try {
          track("sg_share", { variant: "missed", beach_id: beach.id, guess });
        } catch (_) {
        }
        ;
        try {
          await buildShareCard({ variant: "missed", guess, streak, lang });
        } catch (_) {
        }
      },
      style: { display: "block", width: "100%", marginTop: 12, padding: "12px", borderRadius: 14, border: "1px solid rgba(255,216,132,.5)", cursor: "pointer", background: "rgba(255,216,132,.1)", color: "#FFD884", fontWeight: 800, fontSize: 13.5, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }
    },
    "\u{1F30A} ",
    _t(lang, "La mer m'a eu \u2014 tu ferais mieux ?", "The sea fooled me \u2014 beat it?", "El mar me enga\xF1\xF3 \u2014 \xBFlo haces mejor?")
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "rgba(255,255,255,.6)" } }, "\u2193 ", _t(lang, "PLAGE SUIVANTE", "NEXT BEACH", "SIGUIENTE")))));
}
function WorldBonus({ level, topBeach, lang, onPremium, onClose }) {
  const vm = topBeach ? verdictMeta(topBeach.status || "clean", lang) : null;
  return /* @__PURE__ */ React.createElement("div", { role: "dialog", "aria-modal": "true", "aria-label": _t(lang, "Bonus d\xE9bloqu\xE9", "Bonus unlocked", "Bono"), style: {
    position: "absolute",
    inset: 0,
    zIndex: 25,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
    background: "radial-gradient(120% 90% at 50% 28%,rgba(17,70,62,.96),rgba(4,9,11,.97))",
    animation: "wfBonusIn .4s cubic-bezier(.22,1,.36,1) both"
  } }, /* @__PURE__ */ React.createElement("div", { className: "wf-pop", style: { maxWidth: 360, width: "100%", textAlign: "center", color: "#fff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 48, lineHeight: 1 } }, "\u{1F381}"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#FFD884" } }, "\u{1F525} ", _t(lang, "S\xC9RIE DE", "STREAK OF", "RACHA DE"), " ", level, " \xB7 ", _t(lang, "BONUS D\xC9BLOQU\xC9", "BONUS UNLOCKED", "BONO DESBLOQUEADO")), /* @__PURE__ */ React.createElement("h2", { style: { margin: "8px 0 0", fontFamily: "'Anton',system-ui,sans-serif", fontSize: 30, lineHeight: 1.06 } }, _t(lang, "Tu as l'\u0153il du Veilleur", "You've got the Watchman's eye", "Tienes el ojo del Vig\xEDa")), topBeach && /* @__PURE__ */ React.createElement("div", { style: { margin: "16px 0 0", padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.07)", border: "1px solid rgba(95,211,201,.35)", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: "#3fd07f", textTransform: "uppercase" } }, "\u{1F381} ", _t(lang, "Offert : ta reco du moment", "Free: your pick right now", "Gratis: tu recomendaci\xF3n")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } }, typeof topBeach.score === "number" && /* @__PURE__ */ React.createElement(ScoreBlob, { score: topBeach.score, color: topBeach.scoreColor || vm.color, size: 52 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 800 } }, topBeach.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "rgba(255,255,255,.82)" } }, topBeach.commune ? topBeach.commune + " \xB7 " : "", vm.emoji, " ", vm.verb))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        try {
          track("sg_share", { variant: "top", beach_id: topBeach.id, score: topBeach.score });
        } catch (_) {
        }
        ;
        try {
          await buildShareCard({ variant: "top", beach: topBeach, forecast: topBeach.forecast, lang });
        } catch (_) {
        }
      },
      style: { display: "block", width: "100%", marginTop: 12, padding: "10px", borderRadius: 12, border: "1px solid rgba(255,216,132,.5)", cursor: "pointer", background: "rgba(255,216,132,.1)", color: "#FFD884", fontWeight: 800, fontSize: 13, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }
    },
    "\u2600\uFE0F ",
    _t(lang, "Partager la plage du jour", "Share beach of the day", "Compartir la playa del d\xEDa")
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        try {
          track("sg_share", { variant: "streak", level });
        } catch (_) {
        }
        ;
        let best = level;
        try {
          best = parseInt(localStorage.getItem("sg_world_best") || String(level)) || level;
        } catch (_) {
        }
        ;
        try {
          await buildShareCard({ variant: "streak", streak: level, best, lang });
        } catch (_) {
        }
      },
      style: {
        display: "block",
        width: "100%",
        marginTop: 16,
        padding: "14px",
        borderRadius: 16,
        border: "1px solid rgba(95,211,201,.5)",
        cursor: "pointer",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        fontSize: 14.5,
        fontWeight: 800,
        color: "#3fd07f",
        background: "rgba(95,211,201,.08)"
      }
    },
    "\u{1F525} ",
    _t(lang, "Partager ma s\xE9rie", "Share my streak", "Compartir mi racha")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          track("sg_world_bonus_premium", { level });
        } catch (_) {
        }
        ;
        onPremium && onPremium("world_bonus");
      },
      style: {
        display: "block",
        width: "100%",
        marginTop: 10,
        padding: "15px",
        borderRadius: 16,
        border: "none",
        cursor: "pointer",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        fontSize: 15.5,
        fontWeight: 800,
        color: "#07201E",
        background: "linear-gradient(180deg,#FFD884,#F2B05E)",
        boxShadow: "0 8px 28px rgba(0,0,0,.4)"
      }
    },
    _t(lang, "Le Veilleur veille pour toi chaque jour \u2192", "The Watchman watches for you daily \u2192", "El Vig\xEDa vigila para ti cada d\xEDa \u2192")
  ), /* @__PURE__ */ React.createElement("button", { onClick: onClose, style: { marginTop: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.7)", fontSize: 13, fontWeight: 700 } }, _t(lang, "Continuer \xE0 jouer", "Keep playing", "Seguir jugando"))));
}
function WorldCarnet({ beach, lang, onClose, onPremium }) {
  const status = beach.status || "clean";
  const vm = verdictMeta(status, lang);
  const hasScore = typeof beach.score === "number";
  const mood = hasScore ? moodFromScore(beach.score) : moodFromStatus(status);
  return /* @__PURE__ */ React.createElement("div", { role: "dialog", "aria-modal": "true", "aria-label": beach.name, style: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    background: "linear-gradient(180deg,#04090B 0%,#0B2230 50%,#11463E 100%)",
    animation: "wfCarnetIn .32s cubic-bezier(.22,1,.36,1) both"
  } }, /* @__PURE__ */ React.createElement("button", { onClick: onClose, style: {
    position: "sticky",
    top: "calc(12px + env(safe-area-inset-top))",
    marginLeft: 14,
    zIndex: 3,
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(4,9,11,.5)",
    border: "1px solid rgba(255,255,255,.25)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(8px)"
  } }, "\u2190 ", _t(lang, "Retour", "Back", "Volver")), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 22px calc(60px + env(safe-area-inset-bottom))", maxWidth: 560, margin: "0 auto", color: "#fff" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 6 } }, /* @__PURE__ */ React.createElement(Veilleur, { mood, size: 58 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0, fontFamily: "'Anton',system-ui,sans-serif", fontSize: 28, lineHeight: 1.04 } }, beach.name), beach.commune && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.78)" } }, beach.commune)), hasScore && /* @__PURE__ */ React.createElement(ScoreBlob, { score: beach.score, color: beach.scoreColor || vm.color, size: 58 })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14, padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: vm.color, textTransform: "uppercase" } }, _t(lang, "Aujourd'hui \xB7 gratuit", "Today \xB7 free", "Hoy \xB7 gratis")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 16, fontWeight: 800 } }, vm.emoji, " ", vm.verb), /* @__PURE__ */ React.createElement(WorldAfaiGauge, { afai: beach.afai, lang })), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          track("sg_world_carnet_premium", { beach_id: beach.id });
        } catch (_) {
        }
        ;
        onPremium && onPremium("world_carnet");
      },
      style: {
        display: "block",
        width: "100%",
        marginTop: 14,
        padding: "16px",
        borderRadius: 16,
        border: "1px solid rgba(255,216,132,.4)",
        cursor: "pointer",
        textAlign: "left",
        background: "linear-gradient(135deg,rgba(255,216,132,.14),rgba(242,176,94,.08))",
        color: "#fff"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: "#FFD884" } }, "\u{1F512} ", _t(lang, "AVEC LE VEILLEUR", "WITH THE WATCHMAN", "CON EL VIG\xCDA")),
    /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 15, fontWeight: 700, lineHeight: 1.4 } }, _t(lang, "Pr\xE9vision 14 jours, historique, brief matin & alertes sur cette plage \u2192", "14-day forecast, history, morning brief & alerts for this beach \u2192", "Pron\xF3stico 14 d\xEDas, historial, resumen y alertas \u2192"))
  ), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: reliabilityHref(lang),
      onClick: () => {
        try {
          track("sg_reliability_open", { from: "world_carnet" });
        } catch (_) {
        }
      },
      style: { display: "inline-flex", alignItems: "center", gap: 7, marginTop: 16, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.82)", textDecoration: "none" }
    },
    "\u{1F6F0}\uFE0F ",
    _t(lang, "Comment on pr\xE9voit : notre fiabilit\xE9 \u2192", "How we forecast: our reliability \u2192", "C\xF3mo pronosticamos: nuestra fiabilidad \u2192")
  )));
}
function WorldPremiumCard({ lang, onPremium, onRestart }) {
  return /* @__PURE__ */ React.createElement("section", { style: {
    position: "relative",
    height: "100svh",
    minHeight: "100svh",
    scrollSnapAlign: "start",
    overflow: "hidden",
    background: "linear-gradient(180deg,#04090B 0%,#0B2230 46%,#155A5A 100%)",
    color: "#fff"
  } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px calc(110px + env(safe-area-inset-bottom))", maxWidth: 560, margin: "0 auto", textAlign: "center" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: "serein", size: 74 }), /* @__PURE__ */ React.createElement("h2", { style: { margin: "16px 0 0", fontFamily: "'Anton',system-ui,sans-serif", fontSize: 34, lineHeight: 1.05 } }, _t(lang, "Va plus loin que le verdict", "Beyond the verdict", "M\xE1s all\xE1 del veredicto")), /* @__PURE__ */ React.createElement("p", { style: { margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.86)" } }, _t(lang, "Pr\xE9vision 14 jours, historique, brief matin et alertes sur tes plages favorites \u2014 toute notre science, pour toi.", "14-day forecast, history, morning brief and alerts on your favourite beaches \u2014 all our science, for you.", "Pron\xF3stico 14 d\xEDas, historial, resumen matutino y alertas en tus playas favoritas \u2014 toda nuestra ciencia, para ti.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          track("sg_world_premium", {});
        } catch (_) {
        }
        ;
        onPremium && onPremium("world");
      },
      style: {
        marginTop: 20,
        padding: "14px 26px",
        borderRadius: 16,
        border: "none",
        cursor: "pointer",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        fontSize: 16,
        fontWeight: 800,
        color: "#07201E",
        background: "linear-gradient(180deg,#FFD884,#F2B05E)",
        boxShadow: "0 8px 28px rgba(0,0,0,.4)"
      }
    },
    _t(lang, "Activer le Veilleur \u2192", "Activate the Watchman \u2192", "Activar el Vig\xEDa \u2192")
  ), /* @__PURE__ */ React.createElement("button", { onClick: onRestart, style: { marginTop: 16, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.72)", fontSize: 13, fontWeight: 700 } }, "\u21BB ", _t(lang, "Revoir les plages", "See beaches again", "Ver playas otra vez"))));
}
function ArchipelView({ beaches, island: island2, userPos, lang, onOpenBeach, onClose, onSolutions, onPremium, rootMode, updatedAt, initialZone, onRequestGeo, dataReady = true }) {
  const wrapRef = useRef(null), gRef = useRef(null), camRef = useRef({ cx: 0, cy: 0, cz: 0.8 }), rafRef = useRef(0);
  const pendingCenterRef = useRef(false);
  const ptrs = useRef(/* @__PURE__ */ new Map()), movedRef = useRef(false), pinchRef = useRef(null), lastTap = useRef(0);
  const velRef = useRef({ x: 0, y: 0 }), inertRaf = useRef(0), pannedRef = useRef(false);
  const satGRef = useRef(null), satHitRef = useRef(null), satDragRef = useRef(false), satOffRef = useRef({ x: 0, y: 0 }), satVRef = useRef({ x: 0, y: 0 }), satSprRaf = useRef(0);
  const [satGrab, setSatGrab] = useState(false);
  const [satSay, setSatSay] = useState(null);
  const sayIdxRef = useRef(0), sayTimerRef = useRef(0);
  const skyRef = useRef(null), camBaseRef = useRef(null);
  const yoleRef = useRef(null), yoleRafRef = useRef(0);
  const SAT_SAY = { fr: ["H\xE9 ! Je bosse, l\xE0 \u{1F6F0}\uFE0F", "Repose-moi, je scanne !", "Doucement\u2026 je veille.", "Oh ! Tu m'as eu \u{1F604}", "Eh, je travaille, moi !"], en: ["Hey! I'm working \u{1F6F0}\uFE0F", "Put me back, I'm scanning!", "Easy\u2026 I'm on watch.", "Oh! You got me \u{1F604}", "Hey, I'm on duty!"], es: ["\xA1Eh! Estoy trabajando \u{1F6F0}\uFE0F", "\xA1Su\xE9ltame, escaneo!", "Tranqui\u2026 estoy vigilando.", "\xA1Oh! Me pillaste \u{1F604}", "\xA1Eh, que trabajo!"] };
  const veilleurSpeak = () => {
    const arr = SAT_SAY[lang] || SAT_SAY.fr;
    setSatSay(arr[sayIdxRef.current % arr.length]);
    sayIdxRef.current++;
    if (sayTimerRef.current) clearTimeout(sayTimerRef.current);
  };
  const [ready, setReady] = useState(false);
  const SPAN_PX = 1e3, MID = 0.82, FAR = 0.32, NEAR = 2.6;
  const { proj, count } = useMemo(() => {
    const list = (beaches || []).filter((b) => b && b.lat != null && b.lng != null && (!island2 || b.island === island2));
    if (!list.length) return { proj: [], count: 0 };
    let mLa = 9e9, xLa = -9e9, mLn = 9e9, xLn = -9e9;
    for (const b of list) {
      mLa = Math.min(mLa, b.lat);
      xLa = Math.max(xLa, b.lat);
      mLn = Math.min(mLn, b.lng);
      xLn = Math.max(xLn, b.lng);
    }
    const cLat = (mLa + xLa) / 2, cLng = (mLn + xLn) / 2, span = Math.max(xLa - mLa, xLn - mLn) * 1.3 || 0.5;
    const proj2 = list.map((b) => ({ b, x: ((b.lng - cLng) / span + 0.5) * SPAN_PX, y: ((cLat - b.lat) / span + 0.5) * SPAN_PX }));
    return { proj: proj2, count: list.length };
  }, [beaches, island2]);
  const myIdx = useMemo(() => {
    if (!proj.length) return 0;
    if (userPos) {
      let bi2 = 0, bd2 = 9e9;
      proj.forEach((p, i) => {
        const d = haversine(userPos.lat, userPos.lng, p.b.lat, p.b.lng);
        if (d < bd2) {
          bd2 = d;
          bi2 = i;
        }
      });
      return bi2;
    }
    let bi = 0, bd = 9e9;
    proj.forEach((p, i) => {
      const d = (p.x - SPAN_PX / 2) ** 2 + (p.y - SPAN_PX / 2) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  }, [proj, userPos]);
  const writeCam = () => {
    const g2 = gRef.current;
    if (!g2) return;
    const c = camRef.current;
    g2.setAttribute("transform", "translate(" + c.cx.toFixed(1) + " " + c.cy.toFixed(1) + ") scale(" + c.cz.toFixed(4) + ")");
    const sk = skyRef.current;
    if (sk) {
      if (!camBaseRef.current) camBaseRef.current = { cx: c.cx, cy: c.cy };
      const b = camBaseRef.current;
      const px = Math.max(-58, Math.min(58, (c.cx - b.cx) * 0.1)), py = Math.max(-58, Math.min(58, (c.cy - b.cy) * 0.1));
      sk.style.transform = "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px)";
    }
  };
  const satScale = () => {
    const el = wrapRef.current;
    return el ? Math.max(el.clientWidth / 800, el.clientHeight / 600) : 1;
  };
  const satWrite = () => {
    const g2 = satGRef.current;
    if (g2) g2.setAttribute("transform", "translate(" + satOffRef.current.x.toFixed(1) + " " + satOffRef.current.y.toFixed(1) + ")");
  };
  const satSpringHome = () => {
    if (satSprRaf.current) return;
    const step = () => {
      const o = satOffRef.current, v = satVRef.current;
      v.x += -o.x * 0.22 - v.x * 0.5;
      v.y += -o.y * 0.22 - v.y * 0.5;
      o.x += v.x;
      o.y += v.y;
      satWrite();
      if (Math.abs(o.x) < 0.4 && Math.abs(o.y) < 0.4 && Math.abs(v.x) < 0.4 && Math.abs(v.y) < 0.4) {
        o.x = 0;
        o.y = 0;
        v.x = 0;
        v.y = 0;
        satWrite();
        satSprRaf.current = 0;
        return;
      }
      satSprRaf.current = requestAnimationFrame(step);
    };
    satSprRaf.current = requestAnimationFrame(step);
  };
  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      writeCam();
    });
  };
  const clampZ = (z) => Math.max(FAR * 0.75, Math.min(NEAR * 1.25, z));
  const centerOn = (i, cz) => {
    const el = wrapRef.current;
    if (!el || !proj[i]) return;
    const z = clampZ(cz || camRef.current.cz), W = el.clientWidth, H = el.clientHeight;
    camRef.current = { cz: z, cx: W / 2 - proj[i].x * z, cy: H / 2 - proj[i].y * z };
    schedule();
  };
  useEffect(() => {
    if (userPos && pendingCenterRef.current) {
      pendingCenterRef.current = false;
      try {
        centerOn(myIdx, MID);
      } catch (_) {
      }
    }
  }, [userPos, myIdx]);
  useEffect(() => {
    if (island2 !== "martinique") return;
    const el = yoleRef.current;
    if (!el) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
    }
    if (reduce) {
      el.style.opacity = ".85";
      return;
    }
    let alive = true, start = performance.now();
    const loop = () => {
      if (!alive) return;
      const t = (performance.now() - start) / 1e3;
      if (t > 150) {
        alive = false;
        el.style.opacity = ".85";
        return;
      }
      const dx = (Math.sin(t * 0.04) * 1.8).toFixed(2);
      const dy = (Math.cos(t * 0.025) * 0.9).toFixed(2);
      const rot = (Math.sin(t * 0.02) * 1.5).toFixed(2);
      el.setAttribute("transform", "translate(355 398) translate(" + dx + " " + dy + ") rotate(" + rot + ")");
      yoleRafRef.current = requestAnimationFrame(loop);
    };
    yoleRafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (yoleRafRef.current) cancelAnimationFrame(yoleRafRef.current);
    };
  }, [island2]);
  const zoomAt = (f, px, py) => {
    const c = camRef.current, nz = clampZ(c.cz * f), wx = (px - c.cx) / c.cz, wy = (py - c.cy) / c.cz;
    c.cz = nz;
    c.cx = px - wx * nz;
    c.cy = py - wy * nz;
    schedule();
  };
  const panBounds = () => {
    const el = wrapRef.current;
    if (!el) return null;
    const W = el.clientWidth, H = el.clientHeight, z = camRef.current.cz, M = Math.min(W, H) * 0.38;
    let minX = M - SPAN_PX * z, maxX = W - M, minY = M - SPAN_PX * z, maxY = H - M;
    if (minX > maxX) {
      minX = maxX = (minX + maxX) / 2;
    }
    if (minY > maxY) {
      minY = maxY = (minY + maxY) / 2;
    }
    return { minX, maxX, minY, maxY };
  };
  const panClampDrag = (c) => {
    const b = panBounds();
    if (!b) return;
    const el = wrapRef.current, ov = (el ? Math.min(el.clientWidth, el.clientHeight) : 360) * 0.22;
    c.cx = Math.max(b.minX - ov, Math.min(b.maxX + ov, c.cx));
    c.cy = Math.max(b.minY - ov, Math.min(b.maxY + ov, c.cy));
  };
  const stopInertia = () => {
    if (inertRaf.current) {
      cancelAnimationFrame(inertRaf.current);
      inertRaf.current = 0;
    }
  };
  const startInertia = () => {
    stopInertia();
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
    }
    if (reduce) {
      velRef.current.x = 0;
      velRef.current.y = 0;
    }
    const step = () => {
      const c = camRef.current, v = velRef.current, b = panBounds();
      c.cx += v.x;
      c.cy += v.y;
      v.x *= 0.92;
      v.y *= 0.92;
      if (b) {
        if (c.cx < b.minX) {
          c.cx += (b.minX - c.cx) * 0.2;
          v.x *= 0.55;
        } else if (c.cx > b.maxX) {
          c.cx += (b.maxX - c.cx) * 0.2;
          v.x *= 0.55;
        }
        if (c.cy < b.minY) {
          c.cy += (b.minY - c.cy) * 0.2;
          v.y *= 0.55;
        } else if (c.cy > b.maxY) {
          c.cy += (b.maxY - c.cy) * 0.2;
          v.y *= 0.55;
        }
      }
      writeCam();
      const slow = Math.hypot(v.x, v.y) < 0.12, inB = !b || c.cx >= b.minX - 0.5 && c.cx <= b.maxX + 0.5 && c.cy >= b.minY - 0.5 && c.cy <= b.maxY + 0.5;
      if (slow && inB) {
        inertRaf.current = 0;
        return;
      }
      inertRaf.current = requestAnimationFrame(step);
    };
    inertRaf.current = requestAnimationFrame(step);
  };
  useEffect(() => {
    let centered = false;
    if (initialZone) {
      const zoneObj = (COAST_ZONES[island2] || []).find((z) => z.slug === initialZone);
      if (zoneObj) {
        const zoneBeaches = proj.filter((p) => zoneObj.communes.includes(p.b.commune));
        if (zoneBeaches.length) {
          let avgX = 0, avgY = 0;
          for (const p of zoneBeaches) {
            avgX += p.x;
            avgY += p.y;
          }
          avgX /= zoneBeaches.length;
          avgY /= zoneBeaches.length;
          const el = wrapRef.current;
          if (el) {
            const z = MID;
            const W = el.clientWidth;
            const H = el.clientHeight;
            camRef.current = {
              cz: z,
              cx: W / 2 - avgX * z,
              cy: H / 2 - avgY * z
            };
            schedule();
            centered = true;
            try {
              track("sg_zone_click", { zone: initialZone });
            } catch (_) {
            }
          }
        }
      }
    }
    if (!centered) {
      centerOn(myIdx, MID);
    }
    setReady(true);
    try {
      track("sg_archipel_open", { beaches: count });
    } catch (_) {
    }
  }, [initialZone]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let wl = 0;
    const step = (dir) => {
      const now = Date.now();
      if (now - wl < 240) return;
      wl = now;
      if (tourRef.current == null) {
        if (dir > 0) startTour();
        else centerOn(myIdx, MID);
        return;
      }
      const nx = tourRef.current + dir;
      if (nx < 0) {
        exitTour();
        return;
      }
      if (nx > tourOrder.length - 1) {
        tourGo(0);
        return;
      }
      tourGo(nx);
    };
    const onWheel = (e) => {
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1);
    };
    const onKey = (e) => {
      const t = e.target;
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Escape" && tourRef.current != null) exitTour();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const rel = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e) => {
    movedRef.current = false;
    stopInertia();
    velRef.current = { x: 0, y: 0 };
    pannedRef.current = false;
    if (!satDragRef.current && satHitRef.current) {
      const r = satHitRef.current.getBoundingClientRect(), pad = 16;
      if (e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) {
        satDragRef.current = true;
        if (satSprRaf.current) {
          cancelAnimationFrame(satSprRaf.current);
          satSprRaf.current = 0;
        }
        satVRef.current = { x: 0, y: 0 };
        setSatGrab(true);
        veilleurSpeak();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
        }
        ptrs.current.set(e.pointerId, rel(e));
        try {
          track("sg_archipel_sat_grab", {});
        } catch (_) {
        }
        ;
        return;
      }
    }
    ptrs.current.set(e.pointerId, rel(e));
    swipeY.current = rel(e).y;
    swipeX.current = rel(e).x;
    if (ptrs.current.size === 2) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {
      }
      const [a, b] = [...ptrs.current.values()];
      pinchRef.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const prev = ptrs.current.get(e.pointerId), p = rel(e);
    ptrs.current.set(e.pointerId, p);
    if (satDragRef.current) {
      const sc = satScale();
      satOffRef.current.x += (p.x - prev.x) / sc;
      satOffRef.current.y += (p.y - prev.y) / sc;
      satWrite();
      movedRef.current = true;
      return;
    }
    if (ptrs.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my2 = (a.y + b.y) / 2;
      const c2 = camRef.current;
      if (pinchRef.current.d > 0) {
        const f = d / pinchRef.current.d;
        const nz = clampZ(c2.cz * f), wx = (mx - c2.cx) / c2.cz, wy = (my2 - c2.cy) / c2.cz;
        c2.cz = nz;
        c2.cx = mx - wx * nz;
        c2.cy = my2 - wy * nz;
      }
      c2.cx += mx - pinchRef.current.mx;
      c2.cy += my2 - pinchRef.current.my;
      pinchRef.current = { d, mx, my: my2 };
      movedRef.current = true;
      schedule();
      return;
    }
    if (tourRef.current != null) {
      const dx2 = p.x - prev.x, dy2 = p.y - prev.y;
      if (Math.abs(dx2) + Math.abs(dy2) > 2) movedRef.current = true;
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      if (!movedRef.current) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
        }
      }
      movedRef.current = true;
      clearPress();
    }
    const c = camRef.current;
    c.cx += dx;
    c.cy += dy;
    panClampDrag(c);
    velRef.current = { x: dx * 0.55 + velRef.current.x * 0.45, y: dy * 0.55 + velRef.current.y * 0.45 };
    pannedRef.current = true;
    schedule();
  };
  const onUp = (e) => {
    clearPress();
    if (satDragRef.current) {
      satDragRef.current = false;
      setSatGrab(false);
      satSpringHome();
      ptrs.current.delete(e.pointerId);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {
      }
      if (sayTimerRef.current) clearTimeout(sayTimerRef.current);
      sayTimerRef.current = setTimeout(() => setSatSay(null), 1700);
      try {
        track("sg_archipel_sat_drop", {});
      } catch (_) {
      }
      ;
      return;
    }
    if (tourRef.current != null && swipeY.current != null && ptrs.current.size === 1) {
      const dy = rel(e).y - swipeY.current;
      if (dy < -44) {
        tourGo(tourRef.current >= tourOrder.length - 1 ? 0 : tourRef.current + 1);
      } else if (dy > 44) {
        if (tourRef.current <= 0) exitTour();
        else tourGo(tourRef.current - 1);
      }
    } else if (tourRef.current == null && ptrs.current.size === 1 && !pinchRef.current) {
      const dy = swipeY.current != null ? rel(e).y - swipeY.current : 0, dx = swipeX.current != null ? rel(e).x - swipeX.current : 0;
      const flickUp = dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.3 && Math.abs(velRef.current.y) > 3;
      if (flickUp) {
        stopInertia();
        startTour();
        try {
          track("sg_archipel_swipe_enter", {});
        } catch (_) {
        }
      } else if (pannedRef.current) {
        startInertia();
      }
    }
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;
    swipeY.current = null;
    swipeX.current = null;
  };
  const onTap = (e) => {
    if (tourRef.current != null) return;
    const now = Date.now();
    if (now - lastTap.current < 300 && !movedRef.current) {
      const r = wrapRef.current.getBoundingClientRect(), c = camRef.current;
      zoomAt(c.cz < (MID + NEAR) / 2 ? NEAR / c.cz : MID / c.cz, e.clientX - r.left, e.clientY - r.top);
    } else if (!movedRef.current && !mapTapHintOff && !diving) {
      try {
        if (!sessionStorage.getItem("sg_maptaphint")) {
          sessionStorage.setItem("sg_maptaphint", "1");
          try {
            track("sg_map_tap_hint");
          } catch (_) {
          }
          ;
          setTapHint(true);
          setTimeout(() => setTapHint(false), 2400);
        }
      } catch (_) {
      }
    }
    lastTap.current = now;
  };
  const [tour, setTour] = useState(null);
  const mapTapHintOff = (() => {
    try {
      return /[?&]maptap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const [tapHint, setTapHint] = useState(false);
  const tourRef = useRef(null), twRaf = useRef(0), twTarget = useRef(null), swipeY = useRef(null), swipeX = useRef(null);
  const FOCUS = 1.6;
  const tourOrder = useMemo(() => {
    if (!proj.length) return [];
    const m = proj[myIdx];
    return proj.map((_, i) => i).sort((a, b) => (proj[a].x - m.x) ** 2 + (proj[a].y - m.y) ** 2 - ((proj[b].x - m.x) ** 2 + (proj[b].y - m.y) ** 2));
  }, [proj, myIdx]);
  const runTween = () => {
    if (twRaf.current) return;
    const step = () => {
      const t = twTarget.current, c = camRef.current;
      if (!t) {
        twRaf.current = 0;
        return;
      }
      c.cx += (t.cx - c.cx) * 0.2;
      c.cy += (t.cy - c.cy) * 0.2;
      c.cz += (t.cz - c.cz) * 0.2;
      writeCam();
      if (Math.hypot(t.cx - c.cx, t.cy - c.cy) < 0.6 && Math.abs(t.cz - c.cz) < 3e-3) {
        c.cx = t.cx;
        c.cy = t.cy;
        c.cz = t.cz;
        writeCam();
        twTarget.current = null;
        twRaf.current = 0;
        return;
      }
      twRaf.current = requestAnimationFrame(step);
    };
    twRaf.current = requestAnimationFrame(step);
  };
  const focusBeach = (i) => {
    const el = wrapRef.current;
    if (!el || !proj[i]) return;
    const z = FOCUS, W = el.clientWidth, H = el.clientHeight;
    twTarget.current = { cz: z, cx: W / 2 - proj[i].x * z, cy: H / 2 - proj[i].y * z - H * 0.16 };
    runTween();
  };
  const mareeOn = false;
  const [diving, setDiving] = useState(null);
  const diveTimers = useRef([]);
  const [pressed, setPressed] = useState(null);
  const pressedRef = useRef(null), pressStartRef = useRef(0);
  const clearPress = () => {
    if (pressedRef.current !== null) {
      pressedRef.current = null;
      setPressed(null);
    }
  };
  const diveBeach = (i, b) => {
    try {
      track("sg_archipel_tap", { beach_id: b.id, status: b.status, maree: mareeOn ? 1 : 0 });
    } catch (_) {
    }
    if (!mareeOn || !proj[i]) {
      onOpenBeach && onOpenBeach(b);
      return;
    }
    diveTimers.current.forEach(clearTimeout);
    diveTimers.current = [];
    setDiving(b);
    const el = wrapRef.current, W = el ? el.clientWidth : 0, H = el ? el.clientHeight : 0;
    twTarget.current = { cz: NEAR, cx: W / 2 - proj[i].x * NEAR, cy: H / 2 - proj[i].y * NEAR };
    runTween();
    diveTimers.current.push(setTimeout(() => {
      onOpenBeach && onOpenBeach(b);
    }, 520));
    diveTimers.current.push(setTimeout(() => {
      setDiving(null);
      try {
        centerOn(myIdx, MID);
      } catch (_) {
      }
    }, 900));
  };
  useEffect(() => () => {
    diveTimers.current.forEach(clearTimeout);
    stopInertia();
  }, []);
  const fitAll = () => {
    const el = wrapRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight, z = FAR;
    camRef.current = { cz: z, cx: W / 2 - SPAN_PX / 2 * z, cy: H / 2 - SPAN_PX / 2 * z };
    schedule();
  };
  const tourGo = (pos) => {
    if (!tourOrder.length) return;
    const p = Math.max(0, Math.min(tourOrder.length - 1, pos));
    tourRef.current = p;
    setTour(p);
    focusBeach(tourOrder[p]);
    try {
      track("sg_archipel_tour", { pos: p, beach_id: proj[tourOrder[p]].b.id });
    } catch (_) {
    }
  };
  const startTour = () => tourGo(0);
  const exitTour = () => {
    tourRef.current = null;
    setTour(null);
    twTarget.current = null;
    centerOn(myIdx, MID);
  };
  const my = proj[myIdx] && proj[myIdx].b, myVm = my && verdictMeta(my.status, lang);
  const lecture = useMemo(() => {
    const list = (beaches || []).filter((b) => b && b.status && (!island2 || b.island === island2));
    const n = list.length;
    if (!n) return null;
    const clean = list.filter((b) => b.status === "clean").length;
    const avoid = list.filter((b) => b.status === "avoid").length;
    const mod = n - clean - avoid;
    if (avoid === 0 && mod <= 1) return { mood: "clean", text: _t(lang, `Tout est calme \u2014 ${clean}/${n} plages propres. Profite.`, `All calm \u2014 ${clean}/${n} beaches clean. Enjoy.`, `Todo en calma \u2014 ${clean}/${n} playas limpias. Disfruta.`) };
    if (avoid > 0) return { mood: "avoid", text: _t(lang, `${clean} propres \xB7 ${avoid} \xE0 \xE9viter aujourd'hui.`, `${clean} clean \xB7 ${avoid} to avoid today.`, `${clean} limpias \xB7 ${avoid} a evitar hoy.`) };
    return { mood: "moderate", text: _t(lang, `${clean}/${n} propres \xB7 ${mod} \xE0 surveiller.`, `${clean}/${n} clean \xB7 ${mod} to watch.`, `${clean}/${n} limpias \xB7 ${mod} a vigilar.`) };
  }, [beaches, island2, lang]);
  const ph = (() => {
    try {
      if (typeof HERO_PH_OVERRIDE !== "undefined" && HERO_PH_OVERRIDE) return HERO_PH_OVERRIDE;
      const h = (/* @__PURE__ */ new Date()).getHours();
      return h < 5 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "golden" : "night";
    } catch (_) {
      return "golden";
    }
  })();
  const sky = BEACH_PHASE[ph] || BEACH_PHASE.golden;
  const groundOn = false;
  const pv = false;
  const veille = useMemo(() => {
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), last = localStorage.getItem("sg_veille_day");
      let streak = parseInt(localStorage.getItem("sg_veille_streak") || "0") || 0, best = parseInt(localStorage.getItem("sg_veille_best") || "0") || 0;
      if (last !== today) {
        const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        streak = last === y ? streak + 1 : 1;
        best = Math.max(best, streak);
        try {
          localStorage.setItem("sg_veille_day", today);
          localStorage.setItem("sg_veille_streak", String(streak));
          localStorage.setItem("sg_veille_best", String(best));
        } catch (_) {
        }
        try {
          track("sg_veille", { streak, best });
        } catch (_) {
        }
      }
      return { streak, best };
    } catch (_) {
      return { streak: 0, best: 0 };
    }
  }, []);
  const consultedRef = useRef(null);
  if (consultedRef.current === null) {
    try {
      consultedRef.current = new Set(JSON.parse(localStorage.getItem("sg_consulted") || "[]"));
    } catch (_) {
      consultedRef.current = /* @__PURE__ */ new Set();
    }
  }
  const [, setFogTick] = useState(0);
  const fogOn = (() => {
    try {
      return !/[?&]fog=0/.test(window.location.search);
    } catch (_) {
      return true;
    }
  })();
  const lectureTapOn = (() => {
    try {
      return !/[?&]lecturetap=0/.test(window.location.search);
    } catch (_) {
      return true;
    }
  })();
  const markConsulted = (id) => {
    if (id && !consultedRef.current.has(id)) {
      consultedRef.current.add(id);
      try {
        localStorage.setItem("sg_consulted", JSON.stringify([...consultedRef.current].slice(-400)));
      } catch (_) {
      }
      ;
      setFogTick((v) => v + 1);
    }
  };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: wrapRef,
      role: "region",
      "aria-label": _t(lang, "Archipel du Veilleur", "The Watcher's Archipelago", "Archipi\xE9lago del Vig\xEDa"),
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
      onClick: onTap,
      style: { position: "fixed", inset: 0, zIndex: 1006, background: "#04090B", touchAction: "none", overflow: "hidden", cursor: satGrab ? "grabbing" : "grab" }
    },
    diving && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("style", null, `@keyframes mareeDive{from{opacity:0}to{opacity:1}}.maree-dive{animation:mareeDive .46s ease-out both}@media(prefers-reduced-motion:reduce){.maree-dive{animation:none}}`), /* @__PURE__ */ React.createElement("div", { className: "maree-dive", "aria-hidden": "true", style: { position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(BeachScene, { beach: diving }))),
    /* @__PURE__ */ React.createElement("svg", { ref: skyRef, viewBox: "0 0 800 600", preserveAspectRatio: "xMidYMid slice", style: { position: "absolute", top: "-7%", left: "-7%", width: "114%", height: "114%", display: "block", pointerEvents: "none", willChange: "transform" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("style", null, `@keyframes awsettle{from{transform:translateY(-7px);opacity:.4}to{transform:translateY(0);opacity:1}}.aw-cl{animation:none}.aw-sat{animation:awsettle .8s ease-out 1}@media(prefers-reduced-motion:reduce){.aw-sat{animation:none}}`), /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "awSky", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: sky.sky[0] }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: sky.sky[1] }), /* @__PURE__ */ React.createElement("stop", { offset: ".82", stopColor: sky.sky[2] }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: sky.sky[3] })), /* @__PURE__ */ React.createElement("linearGradient", { id: "awSea", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: sky.seaT }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: sky.seaB }))), /* @__PURE__ */ React.createElement("rect", { width: "800", height: "600", fill: "url(#awSky)" }), /* @__PURE__ */ React.createElement("rect", { y: "360", width: "800", height: "240", fill: "url(#awSea)" }), /* @__PURE__ */ React.createElement("rect", { y: "358", width: "800", height: "3", fill: sky.rim, opacity: ".42" }), sky.sun === "set" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "250", r: "150", fill: sky.glit, opacity: ".06" }), /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "250", r: "78", fill: sky.glit, opacity: ".10" }), /* @__PURE__ */ React.createElement("circle", { cx: "400", cy: "250", r: "46", fill: sky.glit, opacity: ".5" }), /* @__PURE__ */ React.createElement("path", { d: "M376 360 L424 360 L462 600 L338 600 Z", fill: sky.glit, opacity: ".09" })), sky.sun === "high" && /* @__PURE__ */ React.createElement("path", { d: "M232 360 L268 360 L300 600 L200 600 Z", fill: sky.glit, opacity: ".06" }), sky.sun === "high" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "250", cy: "120", r: "60", fill: "#FDFCF7", opacity: ".16" }), /* @__PURE__ */ React.createElement("circle", { cx: "250", cy: "120", r: "32", fill: "#FFF4D6" })), sky.sun === "moon" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "280", cy: "120", r: "46", fill: "#9ADCD4", opacity: ".07" }), /* @__PURE__ */ React.createElement("circle", { cx: "280", cy: "120", r: "22", fill: "#E6F2EF" })), ph === "night" && [[80, 70], [180, 120], [320, 60], [470, 100], [600, 70], [700, 140], [150, 200], [540, 170], [660, 210], [400, 150]].map((s2, i) => /* @__PURE__ */ React.createElement("circle", { key: i, cx: s2[0], cy: s2[1], r: "1.2", fill: "#fff", opacity: ".45" })), /* @__PURE__ */ React.createElement("g", { className: "aw-cl" }, /* @__PURE__ */ React.createElement("path", { d: "M90 150 q16 -30 54 -28 q20 -20 50 -12 q34 -8 48 14 q28 4 30 28 Z", fill: sky.cloud, opacity: ".55" })), /* @__PURE__ */ React.createElement("g", { className: "aw-cl", style: { animationDelay: "-40s" } }, /* @__PURE__ */ React.createElement("path", { d: "M540 110 q12 -22 40 -20 q16 -14 38 -8 q26 -6 36 12 Z", fill: sky.cloud, opacity: ".45" })), /* @__PURE__ */ React.createElement("g", { ref: satGRef }, /* @__PURE__ */ React.createElement("g", { className: satGrab ? "" : "aw-sat", style: satGrab ? { transition: "none" } : void 0 }, /* @__PURE__ */ React.createElement("path", { d: "M560 96 L508 432 L612 432 Z", fill: sky.glit, opacity: ".05" }), /* @__PURE__ */ React.createElement("circle", { cx: "560", cy: "92", r: "30", fill: sky.glit, opacity: ".07" }), satGrab && /* @__PURE__ */ React.createElement("circle", { cx: "560", cy: "90", r: "58", fill: sky.glit, opacity: ".18" }), miVeil(560, 90, ph === "day" ? "#2A6B66" : "#5b3a8e", "#3fd07f"), satSay && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: "M541 60 L557 82 L533 65 Z", fill: "rgba(7,32,30,.95)" }), /* @__PURE__ */ React.createElement("rect", { x: "352", y: "25", width: "200", height: "40", rx: "13", fill: "rgba(7,32,30,.95)", stroke: "rgba(95,211,201,.5)", strokeWidth: "1.5" }), /* @__PURE__ */ React.createElement("text", { x: "452", y: "50", textAnchor: "middle", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", fontSize: "15", fontWeight: "800", fill: "#EAF7F4" }, satSay)), /* @__PURE__ */ React.createElement("circle", { ref: satHitRef, cx: "560", cy: "90", r: "46", fill: "none", pointerEvents: "none" }))), /* @__PURE__ */ React.createElement("line", { x1: "-40", y1: "470", x2: "840", y2: "470", stroke: sky.glit, strokeWidth: "2", strokeDasharray: "3 16", opacity: ".18" }), /* @__PURE__ */ React.createElement("line", { x1: "-40", y1: "520", x2: "840", y2: "520", stroke: sky.glit, strokeWidth: "1.6", strokeDasharray: "2 22", opacity: ".12" })),
    /* @__PURE__ */ React.createElement("svg", { width: "100%", height: "100%", style: { position: "absolute", inset: 0, display: "block" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("style", null, `.aw-pvb{animation:awPvb .14s ease-out both}@keyframes awPvb{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.aw-pvb{animation:none}}`), /* @__PURE__ */ React.createElement("g", { ref: gRef }, island2 === "martinique" && /* @__PURE__ */ React.createElement("g", { ref: yoleRef, style: { opacity: 0.85 }, pointerEvents: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("g", { transform: "translate(355 398)" }, /* @__PURE__ */ React.createElement("rect", { x: "-28", y: "-4", width: "56", height: "5", rx: "2.5", fill: "#E8522A", stroke: "#0d0b14", strokeWidth: "1.2" }), /* @__PURE__ */ React.createElement("rect", { x: "-26", y: "-9", width: "52", height: "5", rx: "2", fill: "#FFC72C", stroke: "#0d0b14", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "-24", y: "-13", width: "48", height: "4", rx: "2", fill: "#156a96", stroke: "#0d0b14", strokeWidth: ".8" }), /* @__PURE__ */ React.createElement("path", { d: "M0,-12 L16,-42 L0,-38 Z", fill: "#FBF3DC", opacity: ".92", stroke: "#0d0b14", strokeWidth: ".8" }), /* @__PURE__ */ React.createElement("path", { d: "M0,-12 L-14,-38 L0,-34 Z", fill: "#FBF3DC", opacity: ".82", stroke: "#0d0b14", strokeWidth: ".8" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "6", rx: "30", ry: "3", fill: "#1a5852", opacity: ".25" }))), groundOn && /* @__PURE__ */ React.createElement("g", { "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("radialGradient", { id: "awGround", cx: "50%", cy: "50%", r: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#16383A", stopOpacity: ".82" }), /* @__PURE__ */ React.createElement("stop", { offset: ".6", stopColor: "#123031", stopOpacity: ".46" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#123031", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "awShoreGlow", cx: "50%", cy: "50%", r: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFE6A8", stopOpacity: ".36" }), /* @__PURE__ */ React.createElement("stop", { offset: ".55", stopColor: "#3fd07f", stopOpacity: ".10" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#3fd07f", stopOpacity: "0" }))), /* @__PURE__ */ React.createElement("g", null, (dataReady ? proj : []).map((p) => /* @__PURE__ */ React.createElement("circle", { key: "gr" + p.b.id, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: "46", fill: "url(#awGround)" }))), /* @__PURE__ */ React.createElement("g", { style: { mixBlendMode: "screen" } }, (dataReady ? proj : []).map((p) => /* @__PURE__ */ React.createElement("circle", { key: "hl" + p.b.id, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: "50", fill: "url(#awShoreGlow)" })))), (dataReady ? proj : []).map((p, i) => {
      const b = p.b, col = b.scoreColor || verdictMeta(b.status, lang).color, sc = typeof b.score === "number" ? b.score : null, me = i === myIdx, r = sc != null ? 5 + sc / 15 : 6, fog = fogOn && !me && !consultedRef.current.has(b.id);
      return /* @__PURE__ */ React.createElement(
        "g",
        {
          key: b.id,
          "data-beach": b.id,
          transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")",
          style: { cursor: "pointer" },
          onPointerDown: pv ? () => {
            pressStartRef.current = Date.now();
            pressedRef.current = b.id;
            setPressed(b.id);
          } : void 0,
          onClick: (ev) => {
            ev.stopPropagation();
            if (movedRef.current) return;
            if (pv && pressStartRef.current && Date.now() - pressStartRef.current > 280) return;
            markConsulted(b.id);
            diveBeach(i, b);
          }
        },
        me ? /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("circle", { r: "40", fill: col, opacity: ".14" }), /* @__PURE__ */ React.createElement("circle", { r: "29", fill: col, opacity: ".10" }), /* @__PURE__ */ React.createElement("circle", { r: "23", fill: "#241246", stroke: col, strokeWidth: "2.4" }), sc != null && /* @__PURE__ */ React.createElement("text", { y: "7", fontFamily: "'Anton',sans-serif", fontSize: "20", fill: "#fff", textAnchor: "middle" }, sc), /* @__PURE__ */ React.createElement("text", { y: "46", fontFamily: "ui-monospace,monospace", fontSize: "11", fontWeight: "700", fill: "#FFD884", textAnchor: "middle" }, b.name)) : pv && pressed === b.id ? (() => {
          const vm = verdictMeta(b.status, lang), vb = (vm.verb || "").toUpperCase();
          return /* @__PURE__ */ React.createElement("g", { className: "aw-pvb" }, /* @__PURE__ */ React.createElement("circle", { r: r * 2.5, fill: col, opacity: ".12" }), /* @__PURE__ */ React.createElement("circle", { r: r * 2.5, fill: "none", stroke: col, strokeWidth: "1.6", opacity: ".55" }), /* @__PURE__ */ React.createElement("circle", { r: r * 1.45, fill: col, opacity: ".96" }), /* @__PURE__ */ React.createElement("circle", { r: r * 1.45, fill: "none", stroke: "#03110F", strokeWidth: "1.4" }), /* @__PURE__ */ React.createElement("circle", { r: r * 0.5, cy: -r * 0.28, fill: "#fff", opacity: ".4" }), /* @__PURE__ */ React.createElement("text", { y: -(r * 2.5 + 9), textAnchor: "middle", fontFamily: "'Anton',sans-serif", fontSize: "16", fill: "#EAF7F4", paintOrder: "stroke", stroke: "#03110F", strokeWidth: "3.4", strokeLinejoin: "round" }, b.name), /* @__PURE__ */ React.createElement("text", { y: r * 2.5 + 21, textAnchor: "middle", fontFamily: "'Anton',sans-serif", fontSize: "17", fill: col, paintOrder: "stroke", stroke: "#03110F", strokeWidth: "3.4", strokeLinejoin: "round" }, vb));
        })() : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { r, fill: col, opacity: fog ? 0.66 : 0.92 }), /* @__PURE__ */ React.createElement("circle", { r, fill: "none", stroke: "#06121A", strokeWidth: "1.2" }), fog && /* @__PURE__ */ React.createElement("circle", { r: r + 3.6, fill: "none", stroke: col, strokeWidth: "1", strokeDasharray: "2 3.2", opacity: ".4" }))
      );
    }))),
    !rootMode && /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top))", right: 14, zIndex: 5, width: 40, height: 40, borderRadius: "50%", background: "rgba(4,9,11,.55)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", fontSize: 17, cursor: "pointer", backdropFilter: "blur(8px)" } }, "\u2715"),
    dataReady && ready && (lecture || my) && tour == null && /* @__PURE__ */ React.createElement("div", { ...lectureTapOn && my ? { role: "button", tabIndex: 0, "aria-label": _t(lang, "Voir " + my.name, "See " + my.name, "Ver " + my.name), onClick: (e) => {
      e.stopPropagation();
      try {
        track("sg_lecture_tap", { beach_id: my.id });
      } catch (_) {
      }
      ;
      markConsulted(my.id);
      diveBeach(myIdx, my);
    }, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        try {
          track("sg_lecture_tap", { beach_id: my.id });
        } catch (_) {
        }
        ;
        markConsulted(my.id);
        diveBeach(myIdx, my);
      }
    } } : {}, style: { position: "absolute", top: "calc(13px + env(safe-area-inset-top))", left: 14, right: 64, zIndex: 5, display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 14, background: "rgba(4,9,11,.5)", border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(8px)", color: "#fff", cursor: lectureTapOn && my ? "pointer" : "default" } }, /* @__PURE__ */ React.createElement(Veilleur, { mood: moodFromStatus(lecture && lecture.mood || my && my.status || "clean"), size: 26 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "rgba(255,255,255,.6)", textTransform: "uppercase" } }, _t(lang, "Le Veilleur \xB7 lecture du jour", "The Watcher \xB7 today's reading", "El Vig\xEDa \xB7 lectura del d\xEDa")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" } }, lecture ? lecture.text : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { color: myVm.color } }, myVm.emoji, " ", myVm.verb), " \xB7 ", my.name)), lecture && my && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.72)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" } }, _t(lang, "Ta c\xF4te", "Your coast", "Tu costa"), " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { color: myVm.color } }, myVm.verb), " \xB7 ", my.name))),
    rootMode && tour == null && veille.streak > 0 && /* @__PURE__ */ React.createElement("div", { "aria-label": _t(lang, "S\xE9rie de veille", "Watch streak", "Racha"), style: { position: "absolute", top: "calc(13px + env(safe-area-inset-top))", right: 14, zIndex: 6, display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 14, background: "rgba(4,9,11,.5)", border: "1px solid rgba(255,216,132,.34)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13.5, fontWeight: 800, color: "#FFD884", whiteSpace: "nowrap" } }, "\u{1F525} ", veille.streak), proj.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap" } }, consultedRef.current.size, "/", proj.length)),
    tapHint && tour == null && /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", bottom: "calc(84px + env(safe-area-inset-bottom))", left: 0, right: 0, zIndex: 31, display: "flex", justifyContent: "center", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 14px", borderRadius: 999, background: "rgba(4,9,11,.72)", border: "1px solid rgba(95,211,201,.34)", color: "#EAF7F4", fontSize: 12.5, fontWeight: 700, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 6px 20px rgba(0,0,0,.4)" } }, "\u{1F4CD} ", _t(lang, "Touche une plage pour son verdict", "Tap a beach for its verdict", "Toca una playa para su veredicto"))),
    tour == null ? /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", left: 0, right: 0, zIndex: 30, display: "flex", justifyContent: "center", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 3, padding: "5px 6px", borderRadius: 999, background: "rgba(4,9,11,.66)", border: "1px solid rgba(95,211,201,.22)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 8px 28px rgba(0,0,0,.45)", pointerEvents: "auto" } }, /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
      e.stopPropagation();
      try {
        track("sg_dock", { tab: "near" });
      } catch (_) {
      }
      ;
      if (userPos) {
        centerOn(myIdx, MID);
      } else {
        pendingCenterRef.current = true;
        onRequestGeo ? onRequestGeo() : centerOn(myIdx, MID);
      }
    }, style: { padding: "9px 14px", borderRadius: 999, background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" } }, "\u2316 ", _t(lang, "Pr\xE8s de moi", "Near me", "Cerca")), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
      e.stopPropagation();
      try {
        track("sg_dock", { tab: "all" });
      } catch (_) {
      }
      ;
      fitAll();
    }, style: { padding: "9px 14px", borderRadius: 999, background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" } }, "\u25A6 ", _t(lang, "Toutes", "All", "Todas")), onPremium && /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
      e.stopPropagation();
      try {
        track("sg_dock", { tab: "premium" });
      } catch (_) {
      }
      ;
      onPremium();
    }, style: { padding: "9px 16px", borderRadius: 999, background: "linear-gradient(180deg,#FFD884,#F2B05E)", border: "none", color: "#07201E", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" } }, "\u2726 ", _t(lang, "Veilleur", "Watcher", "Vig\xEDa")))) : (() => {
      const i = tourOrder[tour], b = proj[i] && proj[i].b;
      if (!b) return null;
      const vm = verdictMeta(b.status, lang), sc = typeof b.score === "number" ? b.score : null, afai = typeof b.afai === "number" ? b.afai : null;
      const freshLbl = (() => {
        try {
          if (!updatedAt) return null;
          const q = window.location.search;
          const on = /[?&]fresh=1/.test(q) ? true : /[?&]fresh=0/.test(q) ? false : false;
          if (!on) return null;
          const fr = formatFreshness(updatedAt, lang);
          return fr ? _t(lang, "v\xE9rifi\xE9", "verified", "verificado") + " " + fr : null;
        } catch (_) {
          return null;
        }
      })();
      return /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 7, padding: "0 12px calc(14px + env(safe-area-inset-bottom))" } }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 520, margin: "0 auto", background: "rgba(7,32,30,.94)", border: "1px solid rgba(95,211,201,.32)", borderRadius: 18, padding: "14px 16px", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", color: "#fff", boxShadow: "0 -6px 34px rgba(0,0,0,.5)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11 } }, sc != null && /* @__PURE__ */ React.createElement(ScoreBlob, { score: sc, color: b.scoreColor || vm.color, size: 50 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: "rgba(255,255,255,.5)" } }, tour + 1 + " / " + tourOrder.length, " \xB7 ", _t(lang, "VISITE", "TOUR", "VISITA")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, b.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: vm.color } }, vm.emoji, " ", vm.verb, b.commune ? " \xB7 " + b.commune : ""), freshLbl && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: "#3fd07f", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "\u{1F6F0}\uFE0F ", freshLbl)), /* @__PURE__ */ React.createElement(Veilleur, { mood: moodFromStatus(b.status), size: 34 })), /* @__PURE__ */ React.createElement("div", { style: { margin: "9px 0 0", fontSize: 12.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)" } }, "\u{1F6F0}\uFE0F ", afai != null ? "AFAI " + afai.toFixed(2) + " \u2014 " : "", b.status === "clean" ? _t(lang, "le satellite voit une eau claire aujourd'hui.", "satellite sees clear water today.", "el sat\xE9lite ve agua clara hoy.") : b.status === "moderate" ? _t(lang, "pr\xE9sence d'algues mod\xE9r\xE9e rep\xE9r\xE9e par satellite.", "moderate algae seen by satellite.", "presencia moderada vista por sat\xE9lite.") : _t(lang, "\xE9chouage rep\xE9r\xE9 par satellite \u2014 \xE9vite aujourd'hui.", "beaching seen by satellite \u2014 avoid today.", "varaz\xF3n vista por sat\xE9lite \u2014 evita hoy.")), /* @__PURE__ */ React.createElement(WorldAfaiGauge, { afai: b.afai, lang }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 11, alignItems: "center" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => tourGo(tour - 1), "aria-label": _t(lang, "Pr\xE9c\xE9dente", "Previous", "Anterior"), style: { width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", fontSize: 18, cursor: tour === 0 ? "default" : "pointer", opacity: tour === 0 ? 0.4 : 1 } }, "\u2191"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
        try {
          track("sg_archipel_tour_open", { beach_id: b.id });
        } catch (_) {
        }
        ;
        onOpenBeach && onOpenBeach(b);
      }, style: { flex: 1, padding: "13px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", fontSize: 14.5, fontWeight: 800, color: "#07201E", background: "linear-gradient(180deg,#FFD884,#F2B05E)" } }, _t(lang, "D\xE9couvrir cette plage \u2192", "Explore this beach \u2192", "Descubrir esta playa \u2192")), /* @__PURE__ */ React.createElement("button", { onClick: () => tourGo(tour + 1), "aria-label": _t(lang, "Suivante", "Next", "Siguiente"), style: { width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", fontSize: 18, cursor: tour >= tourOrder.length - 1 ? "default" : "pointer", opacity: tour >= tourOrder.length - 1 ? 0.4 : 1 } }, "\u2193")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 8, fontSize: 11, color: "rgba(255,255,255,.45)" } }, _t(lang, "\u2195 scrolle ou swipe pour changer de plage", "\u2195 scroll or swipe to change beach", "\u2195 desliza para cambiar")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 18, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: exitTour, style: { background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" } }, "\u2190 ", _t(lang, "Explorer librement", "Explore freely", "Explorar libre")))));
    })()
  );
}
function App() {
  const [lang, setLang] = useState(getLang);
  const [theme, setTheme] = useState(() => g("sg_theme", "light"));
  const [island2, setIsland] = useState(() => {
    if (IS_NEW_REGION) return REGION.id;
    try {
      if (window.location.hostname.includes("guadeloupe")) return "gp";
      if (window.location.hostname.includes("martinique")) return "mq";
    } catch {
    }
    const saved = g("sg_island", null);
    if (saved) return saved;
    return "mq";
  });
  const [view, setView] = useState("map");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(0);
  const [selectedBeach, setSelectedBeach] = useState(null);
  const [diveBeach, setDiveBeach] = useState(null);
  const [diveFail, setDiveFail] = useState(null);
  const [initialZone, setInitialZone] = useState(null);
  const [favorites, setFavorites] = useState(() => g("sg_fav", []));
  const [myBeachId, setMyBeachId] = useState(() => {
    const saved = g("sg_my_beach", null);
    if (saved) return saved;
    const favs = g("sg_fav", []);
    if (favs.length > 0) {
      s("sg_my_beach", favs[0]);
      return favs[0];
    }
    return null;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [showPremium2, setShowPremium] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [alertsTick, setAlertsTick] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showB2BChat2, setShowB2BChat2] = useState(false);
  const [frustrationContext, setFrustrationContext] = useState(null);
  const [premiumSource, setPremiumSource] = useState(null);
  const [showCaptureGate, setShowCaptureGate] = useState(false);
  const [captureGateSrc, setCaptureGateSrc] = useState("");
  const [whatsNew, setWhatsNew] = useState(null);
  const [showFavToast, setShowFavToast] = useState(false);
  const [isPremium, setIsPremium] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const pp = q.get("pass");
      if (pp && (pp === "trip" || /^p\d{1,3}$/.test(pp)) && q.get("session_id")) s("sg_premium_welcome", true);
    } catch (_) {
    }
    if (g("sg_premium", false)) return true;
    try {
      const sampleUntil = parseInt(localStorage.getItem("sg_sample_until") || "0");
      if (sampleUntil > Date.now()) return true;
    } catch {
    }
    try {
      const passEnd = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
      if (passEnd > Date.now()) return true;
    } catch {
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      const passParam = params.get("pass");
      const grantProof = sessionId && sessionId.length > 8 ? sessionId : null;
      const grantKey = grantProof ? "sg_grant_done_" + grantProof : null;
      const grantConsumed = (() => {
        try {
          return !!(grantKey && localStorage.getItem(grantKey));
        } catch (_) {
          return false;
        }
      })();
      const markGrant = () => {
        if (grantKey) {
          try {
            localStorage.setItem(grantKey, "1");
          } catch (_) {
          }
        }
      };
      if (passParam && grantProof && !grantConsumed && (passParam === "trip" || /^p\d{1,3}$/.test(passParam))) {
        const days = passParam === "trip" ? 7 : Math.min(120, Math.max(1, parseInt(passParam.slice(1), 10) || 7));
        const end = Date.now() + days * 864e5;
        try {
          localStorage.setItem("sg_premium_pass_end", String(end));
        } catch {
        }
        markGrant();
        s("sg_premium_welcome", true);
        track("sg_conversion", { session_id: sessionId || "pass", plan: passParam, pass_days: days });
        triggerCelebration("premium");
        if (sessionId) {
          try {
            fetch(APPS_SCRIPT_URL, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({ type: "checkout.session.completed", data: { object: {
                id: sessionId,
                payment_status: "paid",
                metadata: { island: IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ", plan: passParam }
              } } })
            }).catch((e) => sgLogError("webhook_conversion", e));
          } catch (ex) {
            sgLogError("webhook_conversion_wrap", ex);
          }
        }
        params.delete("pass");
        params.delete("session_id");
        params.delete("premium");
        params.delete("success");
        {
          const qs = params.toString();
          window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
        }
        return true;
      }
      if (!grantConsumed && grantProof && (params.get("premium") === "1" || params.get("success") === "1" || sessionId)) {
        markGrant();
        s("sg_premium", true);
        s("sg_premium_welcome", true);
        track("sg_conversion", { session_id: sessionId || "direct" });
        triggerCelebration("premium");
        if (sessionId) {
          try {
            fetch(APPS_SCRIPT_URL, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({ type: "checkout.session.completed", data: { object: {
                id: sessionId,
                payment_status: "paid",
                metadata: { island: IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ" }
              } } })
            }).catch(() => {
            });
          } catch (ex) {
          }
        }
        params.delete("premium");
        params.delete("success");
        params.delete("session_id");
        params.delete("pass");
        {
          const qs = params.toString();
          window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
        }
        return true;
      }
    } catch (e) {
    }
    return false;
  });
  const [showWelcome, setShowWelcome] = useState(() => {
    const w = g("sg_premium_welcome", false);
    if (w) {
      s("sg_premium_welcome", false);
    }
    return w;
  });
  const [premiumTick, setPremiumTick] = useState(0);
  const fcRetryRef = useRef(0);
  const _premWasTrue = useRef(isPremium);
  const frustrationEnabled = useMemo(() => {
    try {
      return !/[?&]frustration=0(?:&|$)/.test(window.location.search);
    } catch (_) {
      return true;
    }
  }, []);
  useFrustrationDetection((ctx) => {
    if (!frustrationEnabled) return;
    setFrustrationContext(ctx);
    setShowChat(true);
    track("sg_frustration_auto_open", { type: ctx.type, page: ctx.page });
  }, { enabled: frustrationEnabled });
  useEffect(() => {
    if (isPremium && !_premWasTrue.current) {
      _premWasTrue.current = true;
      setPremiumTick((t) => t + 1);
    }
  }, [isPremium]);
  const paidSplashOn = useMemo(() => {
    try {
      return !/[?&]paidsplash=0(?:&|$)/.test(window.location.search);
    } catch (_) {
      return true;
    }
  }, []);
  const [splashDone, setSplashDone] = useState(false);
  const pwOnboard = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]onboard=1/.test(q)) return "onboard";
      if (/[?&]onboard=0/.test(q)) return "control";
      return "onboard";
    } catch (_) {
      return "control";
    }
  }, []);
  useEffect(() => {
    if (showWelcome && pwOnboard !== "onboard") {
      track("sg_welcome_toast_view");
      const t = setTimeout(() => setShowWelcome(false), 5e3);
      return () => clearTimeout(t);
    }
  }, [showWelcome, pwOnboard]);
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    const run = async () => {
      try {
        if (new URLSearchParams(window.location.search).get("mollie_return") !== "1") return;
        let ctx = null;
        try {
          ctx = JSON.parse(sessionStorage.getItem("sg_mollie_pending") || "null");
        } catch (_) {
        }
        if (!ctx || !ctx.paymentId) {
          try {
            const ls = JSON.parse(localStorage.getItem("sg_mollie_pending") || "null");
            if (ls && ls.paymentId) {
              ctx = ls;
            }
          } catch (_) {
          }
        }
        if (!ctx || !ctx.paymentId) {
          const storedEmail = localStorage.getItem("sg_email") || "";
          if (storedEmail) {
            ctx = { paymentId: null, email: storedEmail };
          }
        }
        const clean = () => {
          try {
            sessionStorage.removeItem("sg_mollie_pending");
          } catch (_) {
          }
          try {
            localStorage.removeItem("sg_mollie_pending");
          } catch (_) {
          }
          try {
            window.location.replace(getPathname());
          } catch (_) {
          }
        };
        if (!ctx || !ctx.paymentId) {
          if (ctx && ctx.email) {
            try {
              const v = await sgVerifySub(ctx.email);
              if (v && v.active) {
                localStorage.setItem("sg_premium", "1");
                localStorage.setItem("sg_premium_email", ctx.email);
                localStorage.setItem("sg_premium_welcome", "1");
                track("sg_conversion", { session_id: ctx.email, method: "email_fallback" });
              }
            } catch (_) {
            }
            clean();
            return;
          }
          clean();
          return;
        }
        const doneKey = "sg_mollie_done_" + ctx.paymentId;
        try {
          if (localStorage.getItem(doneKey)) {
            clean();
            return;
          }
        } catch (_) {
        }
        let paid = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          if (signal.aborted) break;
          try {
            const r = await fetch("/api/mollie.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payment_status", paymentId: ctx.paymentId }), signal });
            const d = await r.json();
            if (d && d.terminal && d.status) {
              const failUrl = "/?payment_failed=1" + (ctx.email ? "&email=" + encodeURIComponent(ctx.email) : "") + (ctx.plan ? "&plan=" + encodeURIComponent(ctx.plan) : "") + (d.status ? "&status=" + encodeURIComponent(d.status) : "");
              try {
                window.location.replace(failUrl);
                return;
              } catch (_) {
              }
            }
            if (d && d.paid) {
              paid = true;
              break;
            }
            if (d && d.status === "paid") {
              paid = true;
              break;
            }
            paid = false;
            if (attempt < 5) await new Promise((r2) => setTimeout(r2, 2500));
          } catch (_) {
            paid = false;
          }
        }
        if (signal.aborted) return;
        if (paid === true) {
          try {
            localStorage.setItem(doneKey, "1");
          } catch (_) {
          }
          try {
            localStorage.setItem("sg_email", ctx.email || "");
            if (ctx.pass) {
              localStorage.setItem("sg_premium_pass_end", String(Date.now() + (ctx.days || 7) * 864e5));
            } else {
              localStorage.setItem("sg_premium", "1");
              if (ctx.email) localStorage.setItem("sg_premium_email", ctx.email);
            }
            localStorage.setItem("sg_premium_welcome", "1");
          } catch (_) {
          }
          track("sg_conversion", { session_id: ctx.paymentId, method: ctx.pass ? "mollie_pass" : "mollie_plan", plan: ctx.pass || ctx.plan });
        } else {
          try {
            sessionStorage.removeItem("sg_mollie_pending");
            localStorage.removeItem("sg_mollie_pending");
            const failUrl = "/?payment_failed=1" + (ctx.email ? "&email=" + encodeURIComponent(ctx.email) : "") + (ctx.plan ? "&plan=" + encodeURIComponent(ctx.plan) : "");
            window.location.replace(failUrl);
            return;
          } catch (_) {
          }
        }
        clean();
      } catch (_) {
      }
    };
    run();
    return () => ac.abort();
  }, []);
  useEffect(() => {
    try {
      const q = window.location.search;
      if (!/[?&]payment_failed=1/.test(q)) return;
      const params = new URLSearchParams(q);
      const failedEmail = params.get("email") || "";
      const failedPlan = params.get("plan") || "";
      try {
        sessionStorage.setItem("sg_payment_retry", JSON.stringify({ email: failedEmail, plan: failedPlan, ts: Date.now() }));
        if (failedEmail && failedEmail.includes("@")) localStorage.setItem("sg_email", failedEmail);
      } catch (_) {
      }
      const cleanUrl = getPathname() + (window.location.hash || "");
      window.history.replaceState({}, document.title, cleanUrl);
      setTimeout(() => {
        try {
          document.dispatchEvent(new CustomEvent("sg_open_paywall", { detail: { retry: true, email: failedEmail, plan: failedPlan } }));
        } catch (_) {
        }
      }, 300);
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("manage") !== "1") return;
      const urlEmail = params.get("email") || "";
      const em = urlEmail || localStorage.getItem("sg_premium_email");
      const prov = (params.get("prov") || "").toLowerCase();
      const doManage = (addr) => {
        if (prov === "paypal") {
          if (!window.confirm(_t(lang, "Annuler ton abonnement Premium ? Tu gardes l'acc\xE8s jusqu'\xE0 la fin de la p\xE9riode d\xE9j\xE0 pay\xE9e.", "Cancel your Premium subscription? You keep access until the end of the paid period.", "\xBFCancelar tu suscripci\xF3n Premium? Conservas el acceso hasta el final del per\xEDodo pagado."))) return;
          track("sg_manage_cancel_click", { provider: "paypal" });
          fetch("/api/paypal.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel_subscription", email: addr })
          }).then((r) => r.json()).then((d) => {
            if (d.cancelled) {
              track("sg_manage_cancel_ok");
              sgToast({ tone: "success", title: _t(lang, "Abonnement annul\xE9", "Subscription cancelled", "Suscripci\xF3n cancelada"), msg: _t(lang, "Tu gardes l'acc\xE8s jusqu'\xE0 la fin de la p\xE9riode pay\xE9e.", "You keep access until the end of the paid period.", "Conservas el acceso hasta el final del per\xEDodo pagado.") });
            } else {
              track("sg_manage_cancel_error", { error: d.error || "not_cancelled" });
              sgToast({ tone: "error", title: _t(lang, "Annulation impossible", "Couldn't cancel", "No se pudo cancelar"), msg: _t(lang, "\xC9cris-moi \xE0 " + SUPPORT_EMAIL + " et je m'en occupe.", "Write to me at " + SUPPORT_EMAIL + " and I'll handle it.", "Escr\xEDbeme a " + SUPPORT_EMAIL + " y me encargo.") });
            }
          }).catch((e) => {
            track("sg_manage_cancel_error", { error: e?.message || "network" });
            sgToast({ tone: "error", title: _t(lang, "Connexion impossible", "Connection failed", "Sin conexi\xF3n"), msg: _t(lang, "R\xE9essaie dans un instant.", "Try again in a moment.", "Int\xE9ntalo de nuevo en un momento.") });
          });
          return;
        }
        if (prov === "mollie") {
          if (!window.confirm(_t(lang, "Annuler ton abonnement Premium ? Tu gardes l'acc\xE8s jusqu'\xE0 la fin de la p\xE9riode d\xE9j\xE0 pay\xE9e.", "Cancel your Premium subscription? You keep access until the end of the paid period.", "\xBFCancelar tu suscripci\xF3n Premium? Conservas el acceso hasta el final del per\xEDodo pagado."))) return;
          track("sg_manage_cancel_click", { provider: "mollie" });
          fetch("/api/mollie.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel_subscription", email: addr })
          }).then((r) => r.json()).then((d) => {
            if (d.cancelled) {
              track("sg_manage_cancel_ok");
              sgToast({ tone: "success", title: _t(lang, "Abonnement annul\xE9", "Subscription cancelled", "Suscripci\xF3n cancelada"), msg: _t(lang, "Tu gardes l'acc\xE8s jusqu'\xE0 la fin de la p\xE9riode pay\xE9e.", "You keep access until the end of the paid period.", "Conservas el acceso hasta el final del per\xEDodo pagado.") });
            } else {
              track("sg_manage_cancel_error", { error: d.error || "not_cancelled" });
              sgToast({ tone: "error", title: _t(lang, "Annulation impossible", "Couldn't cancel", "No se pudo cancelar"), msg: _t(lang, "\xC9cris-moi \xE0 " + SUPPORT_EMAIL + " et je m'en occupe.", "Write to me at " + SUPPORT_EMAIL + " and I'll handle it.", "Escr\xEDbeme a " + SUPPORT_EMAIL + " y me encargo.") });
            }
          }).catch((e) => {
            track("sg_manage_cancel_error", { error: e?.message || "network" });
            sgToast({ tone: "error", title: _t(lang, "Connexion impossible", "Connection failed", "Sin conexi\xF3n"), msg: _t(lang, "R\xE9essaie dans un instant.", "Try again in a moment.", "Int\xE9ntalo de nuevo en un momento.") });
          });
          return;
        }
        track("sg_manage_portal_open");
        fetch("/api/create-checkout.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "portal", email: addr })
        }).then((r) => r.json()).then((d) => {
          if (d.url) {
            window.location.href = d.url;
            return;
          }
          track("sg_manage_portal_error", { error: d.error || "no_url" });
          sgToast({ tone: "error", title: d.error || _t(lang, "Gestion indisponible", "Management unavailable", "Gesti\xF3n no disponible"), msg: _t(lang, "\xC9cris-moi \xE0 " + SUPPORT_EMAIL + ".", "Write to me at " + SUPPORT_EMAIL + ".", "Escr\xEDbeme a " + SUPPORT_EMAIL + ".") });
        }).catch((e) => {
          track("sg_manage_portal_error", { error: e?.message || "network" });
          sgToast({ tone: "error", title: _t(lang, "Connexion impossible", "Connection failed", "Sin conexi\xF3n"), msg: _t(lang, "R\xE9essaie dans un instant.", "Try again in a moment.", "Int\xE9ntalo de nuevo en un momento.") });
        });
      };
      if (em) {
        if (urlEmail) localStorage.setItem("sg_premium_email", urlEmail);
        doManage(em);
      } else {
        const promptEmail = prompt(_t(lang, "Entre ton email pour gerer ton abonnement :", "Enter your email to manage your subscription:", "Introduce tu email para gestionar tu suscripci\xF3n:"));
        if (promptEmail && promptEmail.includes("@")) {
          localStorage.setItem("sg_premium_email", promptEmail);
          doManage(promptEmail);
        }
      }
      params.delete("manage");
      params.delete("email");
      const qs = params.toString();
      window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
    } catch {
    }
  }, []);
  useEffect(() => {
    if (isPremium) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const pEmail = params.get("premium_email");
      if (!pEmail || !pEmail.includes("@")) return;
      sgVerifySub(pEmail).then((d) => {
        if (d.active) {
          if (d.passEnd && d.kind === "pass") {
            localStorage.setItem("sg_premium_pass_end", String(d.passEnd));
            localStorage.setItem("sg_premium_email", pEmail);
            localStorage.setItem("sg_email", pEmail);
          } else {
            localStorage.setItem("sg_premium", "1");
            localStorage.setItem("sg_premium_email", pEmail);
            localStorage.setItem("sg_email", pEmail);
            if (d.trialEnd) localStorage.setItem("sg_premium_trial_end", String(d.trialEnd));
          }
          setIsPremium(true);
          setShowWelcome(true);
          track("sg_premium_unlock_from_email", { status: d.status || "unknown" });
        } else {
          track("sg_premium_unlock_failed", { reason: d.reason || d.error || "inactive" });
          try {
            sgToast({ tone: "info", title: _t(lang, "Acc\xE8s introuvable", "Access not found", "Acceso no encontrado"), msg: _t(lang, "Aucun acc\xE8s actif pour cet e-mail (ou paiement en cours de confirmation \u2014 r\xE9essaie dans 1 min). Sinon \xE9cris \xE0 " + SUPPORT_EMAIL + ".", "No active access for this email (or payment still confirming \u2014 retry in 1 min). Otherwise email " + SUPPORT_EMAIL + ".", "Sin acceso activo para este email (o pago confirm\xE1ndose \u2014 reintenta en 1 min). Si no, escribe a " + SUPPORT_EMAIL + ".") });
          } catch (_) {
          }
        }
      }).catch((e) => {
        track("sg_premium_unlock_failed", { reason: e?.message || "network" });
        try {
          sgToast({ tone: "info", title: _t(lang, "V\xE9rification impossible", "Check failed", "Verificaci\xF3n fallida"), msg: _t(lang, "Connexion ou serveur indisponible. R\xE9essaie dans un instant.", "Connection or server unavailable. Try again in a moment.", "Conexi\xF3n o servidor no disponible. Reintenta en un momento.") });
        } catch (_) {
        }
      });
      params.delete("premium_email");
      const qs = params.toString();
      window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
    } catch {
    }
  }, []);
  const openAccessCheck = useCallback((src) => {
    try {
      const manageOff = /[?&]manageaccess=0/.test(window.location.search);
      const subEmail = localStorage.getItem("sg_premium_email") || localStorage.getItem("sg_email") || "";
      const isRecurringSub = localStorage.getItem("sg_premium") === "1" && !localStorage.getItem("sg_premium_pass_end");
      if (!manageOff && isRecurringSub && subEmail.includes("@")) {
        track("sg_manage_open_from_access", { src: src || "header" });
        const u = new URL(window.location.href);
        u.searchParams.set("manage", "1");
        u.searchParams.set("email", subEmail);
        u.searchParams.set("prov", "stripe");
        window.location.assign(u.pathname + u.search);
        return;
      }
      const em = window.prompt(_t(lang, "Entre l'e-mail utilis\xE9 pour ton paiement :", "Enter the email used for your payment:", "Introduce el email usado para tu pago:"));
      if (em && em.includes("@")) {
        const addr = em.trim();
        sgVerifySub(addr).then((d) => {
          if (d.active) {
            if (d.passEnd && d.kind === "pass") {
              localStorage.setItem("sg_premium_pass_end", String(d.passEnd));
              localStorage.setItem("sg_premium_email", addr);
              localStorage.setItem("sg_email", addr);
            } else {
              localStorage.setItem("sg_premium", "1");
              localStorage.setItem("sg_premium_email", addr);
              if (d.trialEnd) localStorage.setItem("sg_premium_trial_end", String(d.trialEnd));
            }
            setIsPremium(true);
            setShowWelcome(true);
            try {
              sgToast({ tone: "success", title: _t(lang, "Acc\xE8s retrouv\xE9 \u2705", "Access restored \u2705", "Acceso recuperado \u2705"), msg: _t(lang, "Ton Pass est de nouveau actif sur cet appareil.", "Your Pass is active again on this device.", "Tu Pase vuelve a estar activo en este dispositivo.") });
            } catch (_) {
            }
            track("sg_premium_unlock_from_email", { status: d.status || "restore_link", src: src || "restore_link" });
          } else {
            try {
              sgToast({ tone: "info", title: _t(lang, "Acc\xE8s introuvable", "Access not found", "Acceso no encontrado"), msg: _t(lang, "Aucun acc\xE8s actif pour cet e-mail. \xC9cris \xE0 alerte@sargasses-martinique.com et on r\xE8gle \xE7a.", "No active access for this email. Email alerte@sargasses-martinique.com and we'll sort it.", "Sin acceso activo para este email. Escribe a alerte@sargasses-martinique.com y lo resolvemos.") });
            } catch (_) {
            }
            track("sg_premium_unlock_failed", { reason: d.reason || d.error || "inactive", src: src || "restore_link" });
          }
        }).catch((e) => track("sg_premium_unlock_failed", { reason: e?.message || "network", src: src || "restore_link" }));
      }
    } catch {
    }
  }, [lang]);
  const openAccount = useCallback((src) => {
    try {
      track("sg_account_open", { src: src || "header" });
    } catch (_) {
    }
    setShowAccount(true);
  }, []);
  useEffect(() => {
    if (isPremium) return;
    try {
      const q = window.location.search;
      if (!/[?&]restore=1/.test(q) || /[?&]restore=0/.test(q)) return;
      openAccessCheck("restore_link");
      const params = new URLSearchParams(q);
      params.delete("restore");
      const qs = params.toString();
      window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
    } catch {
    }
  }, []);
  useEffect(() => {
    track("sg_session_start", { island: island2, is_premium: isPremium, is_returning: !!g("sg_seen", 0) });
    s("sg_seen", 1);
  }, []);
  useEffect(() => {
    try {
      const q = window.location.search;
      if (/[?&]decouverte(=[^&]*)?/.test(q)) {
        const l = getLang();
        const target = l === "en" ? "/en/understanding-sargassum/" : "/comprendre-sargasses/";
        window.location.replace(target);
        return;
      }
      if (/[?&]solutions(=[^&]*)?/.test(q)) {
        window.location.replace("/nettoyer-sargasses/");
        return;
      }
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    if (PAY_PROVIDER !== "stripe") return;
    const t = setTimeout(() => {
      loadStripeJs().catch((e) => sgLogError("stripe_js_load", e));
    }, 3e3);
    return () => clearTimeout(t);
  }, []);
  const [showPushPrimer, setShowPushPrimer] = useState(false);
  const pushLoadedRef = useRef(false);
  const loadPushNow = useCallback((trigger) => {
    if (pushLoadedRef.current) return;
    if (g("sg_push_loaded_once", 0)) {
      pushLoadedRef.current = true;
      return;
    }
    pushLoadedRef.current = true;
    try {
      window.loadOneSignal?.();
      s("sg_push_loaded_once", 1);
      track("sg_push_auto_loaded", { trigger });
    } catch (e) {
    }
    setShowPushPrimer(false);
  }, []);
  const forceEnablePush = useCallback((trigger) => {
    try {
      pushLoadedRef.current = true;
      try {
        s("sg_push_loaded_once", 1);
      } catch (_) {
      }
      window.loadOneSignal?.();
      const ask = () => {
        try {
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          window.OneSignalDeferred.push(function(O) {
            try {
              O && O.Notifications && O.Notifications.requestPermission && O.Notifications.requestPermission();
            } catch (_) {
            }
          });
        } catch (_) {
        }
      };
      ask();
      setTimeout(ask, 1500);
      try {
        sgToast({ tone: "info", msg: _t(lang, "On pr\xE9pare tes alertes \u2014 accepte la demande qui s'affiche \u{1F514}", "Setting up your alerts \u2014 accept the prompt that appears \u{1F514}", "Preparando tus alertas \u2014 acepta el aviso que aparece \u{1F514}") });
      } catch (_) {
      }
      try {
        track("sg_push_force_enable", { trigger });
      } catch (_) {
      }
    } catch (e) {
    }
    setShowPushPrimer(false);
  }, []);
  const perm0 = typeof Notification !== "undefined" ? Notification.permission : "default";
  const alertsOn = perm0 === "granted" && !sgAlertsOff();
  const toggleAlerts = useCallback((src) => {
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    const granted = perm === "granted";
    const off = sgAlertsOff();
    if (granted && !off) {
      sgSetAlerts(false);
      try {
        sgToast({ tone: "info", title: _t(lang, "Alertes d\xE9sactiv\xE9es \u{1F515}", "Alerts turned off \u{1F515}", "Alertas desactivadas \u{1F515}"), msg: _t(lang, "Le Veilleur ne t'enverra plus de push. R\xE9active quand tu veux.", "Le Veilleur won't push you anymore. Re-enable anytime.", "Le Vig\xEDa ya no te enviar\xE1 push. Reactiva cuando quieras.") });
      } catch (_) {
      }
      try {
        track("sg_alerts_toggle", { to: "off", src: src || "bell" });
      } catch (_) {
      }
      setAlertsTick((t) => t + 1);
      return;
    }
    if (granted && off) {
      sgSetAlerts(true);
      try {
        sgToast({ tone: "success", msg: _t(lang, "Alertes r\xE9activ\xE9es \u{1F514} Le Veilleur t'\xE9crit chaque matin.", "Alerts back on \u{1F514} Le Veilleur writes you each morning.", "Alertas reactivadas \u{1F514} El Vig\xEDa te escribe cada ma\xF1ana.") });
      } catch (_) {
      }
      try {
        track("sg_alerts_toggle", { to: "on", src: src || "bell" });
      } catch (_) {
      }
      setAlertsTick((t) => t + 1);
      return;
    }
    if (perm === "denied") {
      try {
        sgToast({ tone: "info", title: _t(lang, "Notifications bloqu\xE9es", "Notifications blocked", "Notificaciones bloqueadas"), msg: _t(lang, "R\xE9active-les dans les r\xE9glages de ton t\xE9l\xE9phone/navigateur.", "Re-enable them in your phone/browser settings.", "React\xEDvalas en los ajustes de tu tel\xE9fono/navegador.") });
      } catch (_) {
      }
      return;
    }
    const iosBrowser = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches);
    if (iosBrowser) {
      try {
        sgToast({ tone: "info", title: _t(lang, "Ajoute l'app \xE0 ton \xE9cran d'accueil", "Add the app to your home screen", "A\xF1ade la app a tu pantalla de inicio"), msg: _t(lang, "Partager \u2192 \xAB Sur l'\xE9cran d'accueil \xBB, puis active les alertes.", "Share \u2192 'Add to Home Screen', then enable alerts.", "Compartir \u2192 'A pantalla de inicio', luego activa las alertas.") });
      } catch (_) {
      }
      return;
    }
    try {
      localStorage.setItem("sg_alerts_off", "0");
    } catch (_) {
    }
    forceEnablePush(src || "toggle");
    setTimeout(() => setAlertsTick((t) => t + 1), 1800);
  }, [lang, forceEnablePush]);
  const ensurePushAlerts = useCallback((src) => {
    try {
      if (/[?&]alertpush=0/.test(window.location.search)) return;
    } catch (_) {
    }
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    if (perm === "granted" && !sgAlertsOff()) {
      try {
        sgToast({ tone: "success", msg: _t(lang, "Tes alertes sont actives \u{1F514}", "Your alerts are on \u{1F514}", "Tus alertas est\xE1n activas \u{1F514}") });
      } catch (_) {
      }
    } else {
      toggleAlerts(src || "alert_intent");
    }
    setTimeout(() => {
      try {
        window.dispatchEvent(new Event("sg:alert_intent"));
      } catch (_) {
      }
    }, 1400);
  }, [lang, toggleAlerts]);
  useEffect(() => {
    const h = () => ensurePushAlerts("alert_capture");
    window.addEventListener("sg:alert_email_ok", h);
    return () => window.removeEventListener("sg:alert_email_ok", h);
  }, [ensurePushAlerts]);
  useEffect(() => {
    if (alertsOn === false && sgAlertsOff()) {
      try {
        sgApplyPushOptin(false);
      } catch (_) {
      }
    }
  }, []);
  useEffect(() => {
    const sync = () => setAlertsTick((t) => t + 1);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  useEffect(() => {
    if (g("sg_push_loaded_once", 0)) return;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isIos && !isStandalone) return;
    const dismissedAt = g("sg_push_primer_dismissed_at", 0);
    const SEVEN_DAYS = 7 * 24 * 3600 * 1e3;
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < SEVEN_DAYS;
    let primerTimeout = null;
    const onValueMoment = () => {
      if (pushLoadedRef.current) return;
      if (recentlyDismissed) {
        loadPushNow("beach_open_no_primer");
        return;
      }
      if (primerTimeout) return;
      primerTimeout = setTimeout(() => {
        if (pushLoadedRef.current) return;
        setShowPushPrimer(true);
        track("sg_push_primer_shown", { trigger: "beach_open" });
      }, 1500);
    };
    window.addEventListener("sg:value_moment", onValueMoment);
    const FALLBACK_MS = isStandalone ? 3e4 : 6e4;
    const t = setTimeout(() => {
      if (pushLoadedRef.current || recentlyDismissed) return;
      const opened = parseInt(sessionStorage.getItem("sg_beach_views") || "0", 10) > 0;
      const favs = g("sg_fav", []);
      const hasFav = Array.isArray(favs) && favs.length > 0;
      if (!opened && !hasFav) return;
      setShowPushPrimer(true);
      track("sg_push_primer_shown", { trigger: "fallback_timer" });
    }, FALLBACK_MS);
    return () => {
      clearTimeout(t);
      if (primerTimeout) clearTimeout(primerTimeout);
      window.removeEventListener("sg:value_moment", onValueMoment);
    };
  }, [loadPushNow]);
  const syncedFavsRef = useRef([]);
  useEffect(() => {
    try {
      if (!window.OneSignalDeferred) return;
      window.OneSignalDeferred.push(function(O) {
        if (isPremium) O.User.addTag("sg_premium", "1");
        else O.User.removeTag("sg_premium");
        O.User.addTag("sg_island", island2);
        try {
          O.User.addTag("sg_last_seen", String(Math.floor(Date.now() / 864e5)));
        } catch (_) {
        }
        const cur = Array.isArray(favorites) ? favorites : [];
        for (const fid of syncedFavsRef.current) {
          if (!cur.includes(fid)) O.User.removeTag("fav_" + fid);
        }
        for (const fid of cur) O.User.addTag("fav_" + fid, "1");
        syncedFavsRef.current = cur;
      });
    } catch (e) {
    }
  }, [isPremium, island2, favorites]);
  const [showReferralBanner, setShowReferralBanner] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get("ref");
      if (refCode && refCode.startsWith("REF-")) {
        localStorage.setItem("sg_referred_by", JSON.stringify({ code: refCode, ts: Date.now() }));
        track("sg_referral_landing", { ref_code: refCode, island: island2 });
        if (!isPremium) setShowReferralBanner(true);
        params.delete("ref");
        const qs = params.toString();
        window.history.replaceState({}, "", getPathname() + (qs ? "?" + qs : ""));
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    if (showReferralBanner) {
      const t = setTimeout(() => setShowReferralBanner(false), 8e3);
      return () => clearTimeout(t);
    }
  }, [showReferralBanner]);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("refrewards") === "0") return;
      const last = parseInt(localStorage.getItem("sg_refclaim_ts") || "0");
      if (last && Date.now() - last < 12 * 36e5) return;
      const code = sgMyReferralCode();
      if (!/^REF-[A-Z0-9]{6}$/.test(code)) return;
      const t = setTimeout(() => {
        try {
          localStorage.setItem("sg_refclaim_ts", String(Date.now()));
        } catch (_) {
        }
        fetch("/api/mollie.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claim_referral_credit", code }) }).then((r) => {
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("application/json")) {
            console.warn("[sg] referral_claim: r\xE9ponse non-JSON (dev mode?)");
            return Promise.reject(new Error("non-json"));
          }
          try {
            return r.json();
          } catch (e) {
            console.warn("referral_claim: response is not JSON", e);
            return Promise.reject(e);
          }
        }).then((d) => {
          const days = Math.max(0, Math.min(30, parseInt(d && d.days) || 0));
          if (days <= 0) return;
          const cur = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
          const end = Math.max(Date.now(), cur || 0) + days * 864e5;
          try {
            localStorage.setItem("sg_premium_pass_end", String(end));
          } catch (_) {
          }
          try {
            setIsPremium(true);
          } catch (_) {
          }
          track("sg_referral_reward_claimed", { days });
          try {
            sgToast({ tone: "success", title: _t(lang, "Merci d'avoir partag\xE9 \u{1F30A}", "Thanks for sharing \u{1F30A}", "Gracias por compartir \u{1F30A}"), msg: _t(lang, `Un filleul a pris un pass \u2014 +${days} jours de Veilleur pour toi.`, `A friend got a pass \u2014 +${days} Watchman days for you.`, `Un amigo tom\xF3 un pase \u2014 +${days} d\xEDas de Vig\xEDa para ti.`) });
          } catch (_) {
          }
        }).catch((e) => sgLogError("referral_claim", e));
      }, 2500);
      return () => clearTimeout(t);
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    const h = () => {
      try {
        if (parseInt(localStorage.getItem("sg_premium_pass_end") || "0") > Date.now()) setIsPremium(true);
      } catch (_) {
      }
    };
    window.addEventListener("sg:premium_refresh", h);
    return () => window.removeEventListener("sg:premium_refresh", h);
  }, []);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(() => {
    try {
      if (isPremium) return false;
      const raw = localStorage.getItem("sg_checkout_abandoned");
      if (!raw) return false;
      const { email, ts } = JSON.parse(raw);
      if (Date.now() - ts < 24 * 60 * 60 * 1e3 && email) return true;
      localStorage.removeItem("sg_checkout_abandoned");
    } catch {
      try {
        localStorage.removeItem("sg_checkout_abandoned");
      } catch (_) {
      }
    }
    return false;
  });
  const [bannerH, setBannerH] = useState(96);
  useEffect(() => {
    if (!showRecoveryBanner) return;
    try {
      const { ts } = JSON.parse(localStorage.getItem("sg_checkout_abandoned"));
      track("sg_checkout_recovery_eligible", { age_hours: Math.round((Date.now() - ts) / 36e5), island: island2 });
    } catch (_) {
    }
  }, []);
  const [showPassExpired, setShowPassExpired] = useState(() => {
    try {
      if (typeof location !== "undefined" && /[?&]passexpired=0/.test(location.search || "")) return false;
      if (isPremium) return false;
      if (localStorage.getItem("sg_pass_expired_seen")) return false;
      const passEnd = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
      if (passEnd > 0 && passEnd <= Date.now()) return true;
    } catch (_) {
    }
    return false;
  });
  useEffect(() => {
    if (showPassExpired) {
      try {
        track("sg_pass_expired_eligible", { island: island2 });
      } catch (_) {
      }
    }
  }, []);
  const _passRenewDays = () => {
    try {
      const e = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
      const d = e - Date.now();
      return d > 0 ? Math.ceil(d / 864e5) : 0;
    } catch (_) {
      return 0;
    }
  };
  const [showPassRenew, setShowPassRenew] = useState(() => {
    try {
      if (typeof location !== "undefined" && /[?&]passrenew=0/.test(location.search || "")) return false;
      if (localStorage.getItem("sg_pass_renew_seen")) return false;
      const e = parseInt(localStorage.getItem("sg_premium_pass_end") || "0");
      if (e > Date.now() && e - Date.now() < 3 * 864e5) return true;
    } catch (_) {
    }
    return false;
  });
  useEffect(() => {
    if (showPassRenew) {
      try {
        track("sg_pass_renew_eligible", { island: island2 });
      } catch (_) {
      }
    }
  }, []);
  useEffect(() => {
    try {
      if (!localStorage.getItem("sg_referral_code")) localStorage.setItem("sg_referral_code", "REF-" + hashSeed(_sgcCid() + ":ref").toString(36).toUpperCase().slice(0, 6));
    } catch (_) {
    }
    if (!isPremium) return;
    try {
      localStorage.removeItem("sg_checkout_abandoned");
    } catch (_) {
    }
  }, [isPremium]);
  const [allBeaches, setAllBeaches] = useState(BEACHES_FALLBACK);
  const [imageMap, setImageMap] = useState(null);
  const [imageQ, setImageQ] = useState(null);
  const [heroVids, setHeroVids] = useState(null);
  const [sargData, setSargData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [dataSource, setDataSource] = useState("loading");
  const [userPos, setUserPos] = useState(null);
  const [communityReports, setCommunityReports] = useState({});
  const [fbPosts, setFbPosts] = useState({});
  const [beachesWeather, setBeachesWeather] = useState({});
  const [hasActiveThreat, setHasActiveThreat] = useState(false);
  const bootGateOff = (() => {
    try {
      return /[?&]bootgate=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const [bootSafety, setBootSafety] = useState(false);
  useEffect(() => {
    if (bootGateOff) return;
    const t = setTimeout(() => setBootSafety(true), 5e3);
    return () => clearTimeout(t);
  }, [bootGateOff]);
  const dataReady = bootGateOff || bootSafety || dataSource !== "loading";
  const mapArrivals = useMemo(() => {
    const m = {};
    try {
      for (const b of allBeaches || []) {
        const sid = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
        const w = sid && sargData?.weekly?.[sid];
        if (w && (w.arrivalDetected || w.arrivalDay != null)) m[b.id] = { s: w.arrivalStrength || 0.1, d: w.arrivalDay };
      }
    } catch (_) {
    }
    return m;
  }, [allBeaches, sargData]);
  const mapForecastByBeach = useMemo(() => {
    const m = {};
    try {
      for (const b of allBeaches || []) {
        const sid = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
        const wk = sid && sargData?.weekly?.[sid] || sargData?._enrichedWeekly?.[`_interp_${b.id}`];
        const fc = wk && wk.forecast;
        if (fc && fc.length) {
          m[b.id] = { d: fc.slice(0, 6).map((d) => ({ st: d.status, c: d.confidence, date: d.date })), drift: wk.drift || null, arrivalDay: wk.arrivalDetected && wk.arrivalDay != null ? wk.arrivalDay : null };
        }
      }
    } catch (_) {
    }
    return m;
  }, [allBeaches, sargData]);
  const HOMEFIX_OFF = (() => {
    try {
      return /[?&]homefix=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const [showHero2, setShowHero] = useState(() => {
    try {
      if (/[?&]hero=1/.test(window.location.search)) return true;
      return false;
    } catch (_) {
      return false;
    }
  });
  const stationSlug = (() => {
    try {
      const seg = getPathname().replace(/^\/|\/$/g, "");
      return STATION_SLUGS.has(seg) ? seg : null;
    } catch (_) {
      return null;
    }
  })();
  const stationOn = (() => {
    try {
      if (!stationSlug) return false;
      const q = window.location.search;
      if (/[?&]stations=1/.test(q)) return true;
      if (/[?&]stations=0/.test(q)) return false;
      return false;
    } catch (_) {
      return false;
    }
  })();
  const [showStation, setShowStation] = useState(() => stationOn);
  const [showArchipel, setShowArchipel] = useState(() => {
    try {
      return /[?&](archipel|view3d)=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  });
  const navWorld = true;
  const archAutoRef = useRef(false);
  const [showMapIntro, setShowMapIntro] = useState(() => {
    try {
      return /[?&]mapintro=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  });
  const isPreviewsPath = (() => {
    try {
      return /^\/(?:en\/)?previsions(?:\/)?$/.test(getPathname());
    } catch {
      return false;
    }
  })();
  const isCleanListPath = (() => {
    try {
      return /^\/(?:en\/)?plages-sans-sargasses(?:\/)?$/.test(getPathname());
    } catch {
      return false;
    }
  })();
  const [prevAZ] = useState(() => {
    try {
      const q = window.location.search;
      if (/[?&]prev_az=1/.test(q)) return true;
      if (/[?&]prev_az=0/.test(q)) return false;
      return false;
    } catch (_) {
      return false;
    }
  });
  const [showPrevLanding2, setShowPrevLanding] = useState(prevAZ);
  const [prevExiting, setPrevExiting] = useState(false);
  const dismissPrevLanding = useCallback((action) => {
    setPrevExiting(true);
    setTimeout(() => {
      setShowPrevLanding(false);
      setPrevExiting(false);
    }, 300);
    try {
      track("sg_previsions_dismiss", { action });
    } catch (_) {
    }
  }, []);
  const THEMES = useMemo(() => [
    { id: "golden", label: "Golden hour", emoji: "\u{1F305}" },
    { id: "comic", label: "Comic / TCG", emoji: "\u{1F3B4}" },
    { id: "soft", label: "Soft Modern", emoji: "\u{1FAE7}" }
    // manga/arcade/sticker RETIRÉS 22/06 (fondateur) : illisibles (audit contraste w71fbv5el,
    // ~1:1 en manga) → sortis du picker. Quiconque était dessus retombe sur le défaut (comic).
  ], []);
  const initialTheme = useMemo(() => {
    try {
      const q = window.location.search;
      const m = q.match(/[?&]theme=([a-z]+)/i);
      if (m && THEMES.some((t) => t.id === m[1].toLowerCase())) return m[1].toLowerCase();
      if (/[?&]comic=1/.test(q)) return "comic";
      const saved = localStorage.getItem("sg_ui_theme");
      if (saved && THEMES.some((t) => t.id === saved)) return saved;
      return "comic";
    } catch (_) {
      return "comic";
    }
  }, [THEMES]);
  const [uiTheme, setUiTheme] = useState(initialTheme);
  useEffect(() => {
    const cls = uiTheme && uiTheme !== "golden" ? "theme-" + uiTheme : null;
    if (cls) {
      document.body.classList.add(cls);
    }
    try {
      if (uiTheme) localStorage.setItem("sg_ui_theme", uiTheme);
    } catch (_) {
    }
    return () => {
      if (cls) document.body.classList.remove(cls);
    };
  }, [uiTheme]);
  const [cleanListAZ] = useState(() => {
    try {
      const q = window.location.search;
      if (/[?&]clean_list=1/.test(q)) return true;
      if (/[?&]clean_list=0/.test(q)) return false;
      return isCleanListPath && false;
    } catch (_) {
      return false;
    }
  });
  const [showCleanList, setShowCleanList] = useState(cleanListAZ);
  const [cleanListExiting, setCleanListExiting] = useState(false);
  const dismissCleanList = useCallback((action) => {
    setCleanListExiting(true);
    setTimeout(() => {
      setShowCleanList(false);
      setCleanListExiting(false);
    }, 300);
    try {
      track("sg_clean_list_dismiss", { action });
    } catch (_) {
    }
  }, []);
  const ALERT_PATHS = /^\/(?:alertes|en\/sargassum-alerts|es\/alertas-sargazo)\/?$/;
  const [alertHubVariant] = useState(() => {
    try {
      const q = window.location.search;
      if (/[?&]pw_alertes=1/.test(q)) return "hub";
      if (/[?&]pw_alertes=0/.test(q)) return "control";
      return "control";
    } catch (_) {
      return "control";
    }
  });
  const [showAlertHub, setShowAlertHub] = useState(() => {
    try {
      if (!ALERT_PATHS.test(getPathname())) return false;
      if (window.location.search.includes("premium")) return false;
      return alertHubVariant === "hub";
    } catch (_) {
      return false;
    }
  });
  const isConditionsPath = (() => {
    try {
      return /^\/conditions(?:\/.*)?\/?$/.test(getPathname());
    } catch (_) {
      return false;
    }
  })();
  const [conditionsVariant] = useState(() => {
    try {
      const q = window.location.search;
      if (/[?&]pw_conditions=1/.test(q)) return "conditions";
      if (/[?&]pw_conditions=0/.test(q)) return "control";
      return "control";
    } catch (_) {
      return "control";
    }
  });
  const [showConditions, setShowConditions] = useState(() => {
    try {
      if (!isConditionsPath) return false;
      return conditionsVariant === "conditions";
    } catch (_) {
      return false;
    }
  });
  const [conditionsExiting, setConditionsExiting] = useState(false);
  const dismissConditions = useCallback((action) => {
    setConditionsExiting(true);
    setTimeout(() => {
      setShowConditions(false);
      setConditionsExiting(false);
    }, 300);
    try {
      track("sg_conditions_dismiss", { action });
    } catch (_) {
    }
  }, []);
  useLayoutEffect(() => {
    if (!navWorld || archAutoRef.current) return;
    if (showHero2 || showMapIntro || showPrevLanding2 || showCleanList || showAlertHub || selectedBeach || showPremium2 || showArchipel || showStation) return;
    if (view !== "map" || !(allBeaches && allBeaches.length >= 3)) return;
    archAutoRef.current = true;
    setShowArchipel(true);
    try {
      track("sg_archipel_open", { from: "nav_world_default" });
    } catch (_) {
    }
  }, [navWorld, showHero2, showMapIntro, showPrevLanding2, showCleanList, showAlertHub, view, allBeaches, selectedBeach, showPremium2, showArchipel, showStation]);
  useEffect(() => {
    engInit();
    sgCollectInit();
    const screen = showStation ? "station_" + stationSlug : showPremium2 ? "premium" : selectedBeach ? "beach" : showArchipel ? "world" : showMapIntro ? "mapintro" : showPrevLanding2 ? "previsions" : showCleanList ? "clean_list" : showConditions ? "conditions" : showAlertHub ? "alertes" : showHero2 ? "hero" : "map_" + (view || "map");
    engScreen(screen);
  }, [showStation, stationSlug, showPremium2, selectedBeach, showArchipel, showMapIntro, showPrevLanding2, showCleanList, showConditions, showAlertHub, showHero2, view]);
  const [landingFunnel] = useState(() => LF_OVERRIDE || "control");
  const [homeAZ] = useState(() => {
    try {
      return /[?&]home_az=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  });
  const [homeJuicy] = useState(() => {
    try {
      return /[?&]home=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  });
  const [chasse] = useState(() => {
    try {
      return !/[?&]chasse=0/.test(window.location.search);
    } catch (_) {
      return true;
    }
  });
  const mapWorld = useMemo(() => {
    try {
      return /[?&]map_world=0/.test(window.location.search) ? "control" : "world";
    } catch (_) {
      return "world";
    }
  }, []);
  const view3d = useMemo(() => {
    try {
      return /[?&]view3d=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  }, []);
  const mapWarm = useMemo(() => {
    try {
      return /[?&]mapwarm=0/.test(window.location.search) ? "control" : "warm";
    } catch (_) {
      return "warm";
    }
  }, []);
  const premapCoverOff = useMemo(() => {
    try {
      return /[?&]premapcover=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  }, []);
  const homeVidOff = useMemo(() => {
    try {
      return /[?&]homevid=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  }, []);
  const [premapDone, setPremapDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPremapDone(true), 4e3);
    return () => clearTimeout(t);
  }, []);
  const navDive = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]navdive=1/.test(q)) return true;
      if (/[?&]navdive=0/.test(q)) return false;
      return false;
    } catch (_) {
      return false;
    }
  }, []);
  const captureGate = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]capture_gate=1/.test(q)) return true;
      return false;
    } catch (_) {
      return false;
    }
  }, []);
  const pwWipeOn = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]sgpwenter=0/.test(q)) return false;
      return true;
    } catch (_) {
      return true;
    }
  }, []);
  const [pwEntering, setPwEntering] = useState(false);
  useEffect(() => {
    if (!showPremium2) {
      setPwEntering(false);
      return;
    }
    if (!pwWipeOn) {
      return;
    }
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPwEntering(false);
        return;
      }
    } catch (_) {
    }
    setPwEntering(true);
    const t = setTimeout(() => setPwEntering(false), 420);
    return () => clearTimeout(t);
  }, [showPremium2, pwWipeOn]);
  const [wipe, setWipe] = useState(null);
  const fireWipe = useCallback((label) => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (_) {
    }
    setWipe(label);
  }, []);
  const [heroExiting, setHeroExiting] = useState(false);
  const dismissHero = useCallback((action) => {
    try {
      sessionStorage.setItem("sg_hero_seen", "1");
    } catch (_) {
    }
    setHeroExiting(true);
    setShowHero(false);
    setTimeout(() => setHeroExiting(false), 300);
    track("sg_hero_dismiss", { action });
  }, []);
  const heroPick = useMemo(() => {
    if (!showHero2 || !allBeaches?.length || !imageMap) return null;
    const cands = allBeaches.filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.lat && b.lng && imageMap[b.id] && !String(imageMap[b.id]).startsWith("sat-"));
    if (!cands.length) return null;
    const cleans = cands.filter((b) => b.status === "clean");
    let pick2;
    if (userPos && cleans.length) {
      pick2 = cleans.map((b) => ({ ...b, _d: haversine(userPos.lat, userPos.lng, b.lat, b.lng) })).sort((a, b) => a._d - b._d)[0];
    } else {
      const pool = cleans.length ? cleans : cands;
      const sorted = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0));
      if (imageQ) {
        const near = sorted.filter((b) => (sorted[0].score || 0) - (b.score || 0) <= 8);
        const byQ = [...near].sort((a, b) => (imageQ[b.id] || 0) - (imageQ[a.id] || 0));
        const heroGrade = byQ.filter((b) => (imageQ[b.id] || 0) >= 85);
        const withVid = heroVids ? heroGrade.filter((b) => heroVids.includes(b.id)) : [];
        const pool2 = (withVid.length ? withVid : heroGrade).slice(0, 4);
        if (pool2.length > 1) {
          const day = Math.floor(Date.now() / 864e5);
          pick2 = pool2[day % pool2.length];
        } else pick2 = pool2[0] || byQ[0];
      } else pick2 = sorted[0];
    }
    return pick2 ? { ...pick2, _heroImg: "/beaches/" + imageMap[pick2.id] } : null;
  }, [showHero2, allBeaches, imageMap, imageQ, heroVids, island2, userPos]);
  const prevHeroPick = useMemo(() => {
    if (!showPrevLanding2 || !allBeaches?.length || !sargData?.weekly) return null;
    const cands = allBeaches.filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.lat && b.lng);
    if (!cands.length) return null;
    const cleans = cands.filter((b) => b.status === "clean");
    let pick2;
    if (userPos && cleans.length) {
      pick2 = cleans.map((b) => ({ ...b, _d: haversine(userPos.lat, userPos.lng, b.lat, b.lng) })).sort((a, b) => a._d - b._d)[0];
    } else {
      const pool = cleans.length ? cleans : cands;
      const covered = pool.filter((b) => {
        try {
          const sid = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
          return !!(sid && sargData.weekly[sid]?.forecast?.length);
        } catch (_) {
          return false;
        }
      });
      const draw = covered.length ? covered : pool;
      pick2 = [...draw].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    }
    return pick2 || null;
  }, [showPrevLanding2, allBeaches, sargData, island2, userPos]);
  const exitcapPick = useMemo(() => {
    if (!allBeaches?.length || !sargData?.weekly) return null;
    const cands = allBeaches.filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.lat && b.lng);
    if (!cands.length) return null;
    const cleans = cands.filter((b) => b.status === "clean");
    let pick2;
    if (userPos && cleans.length) {
      pick2 = cleans.map((b) => ({ ...b, _d: haversine(userPos.lat, userPos.lng, b.lat, b.lng) })).sort((a, b) => a._d - b._d)[0];
    } else {
      const pool = cleans.length ? cleans : cands;
      pick2 = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    }
    return pick2 || null;
  }, [allBeaches, sargData, island2, userPos]);
  const [showGameToast, setShowGameToast] = useState(false);
  const [showGameFull, setShowGameFull] = useState(false);
  const gameSwipe = useSwipeClose(() => {
    setShowGameFull(false);
    track("sg_game_full_close", { from: "swipe" });
  }, { threshold: 64 });
  const [showExitCap, setShowExitCap] = useState(false);
  const [showExitVeilleur, setShowExitVeilleur] = useState(false);
  const exitcapOn = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]exitcap=1/.test(q)) return true;
      if (/[?&]exitcap=0/.test(q)) return false;
      return false;
    } catch (_) {
      return false;
    }
  }, []);
  const exitVeilleurOn = useMemo(() => {
    try {
      return !/[?&]exit_veilleur=0/.test(window.location.search);
    } catch (_) {
      return true;
    }
  }, []);
  const exitcapForecast = useMemo(() => {
    if (!exitcapPick || !sargData?.weekly) return null;
    const sargId = IS_NEW_REGION ? exitcapPick.id : BEACH_TO_SARG[exitcapPick.id];
    const w = sargId && sargData.weekly[sargId];
    if (!w || !Array.isArray(w.forecast)) return null;
    return w.forecast.slice(0, 7).map((f) => f && f.status);
  }, [exitcapPick, sargData]);
  const gameGateRef = useRef({});
  useEffect(() => {
    gameGateRef.current = { sheet: !!selectedBeach, premium: showPremium2 || isPremium, view, hero: showHero2 || showPrevLanding2, exitcapPick, exitcapOn, exitVeilleurOn };
  });
  useEffect(() => {
    try {
      if (/[?&]exit_veilleur=preview/.test(window.location.search) && exitcapPick) setShowExitVeilleur(true);
    } catch (_) {
    }
  }, [exitcapPick]);
  const [showAttract, setShowAttract] = useState(false);
  const attractPickRef = useRef(null);
  const attractEligible = useMemo(() => {
    try {
      const q = window.location.search || "";
      if (/[?&]idle=0/.test(q)) return false;
      if (/[?&]idle=1/.test(q)) return true;
      if (/[?&]demo=1/.test(q)) return false;
      if (/[?&](beach|paywall|pro|premium|premium_email|nav|alertes|manage|restore|preview_beach|preview_partner)=/.test(q)) return false;
      if (/[?&]utm_/.test(q)) return false;
      const p = (getPathname() || "/").replace(/\/+$/, "") || "/";
      return p === "/" || p === "/index.html";
    } catch (_) {
      return false;
    }
  }, []);
  useEffect(() => {
    let idleT = null, attractT = null;
    const fire = (trigger) => {
      if (trigger === "hidden" && _sgCapturingPhoto) return;
      const gate = gameGateRef.current;
      if (gate.sheet || gate.premium || gate.hero || gate.view !== "map") return;
      const isExit = trigger !== "idle";
      if (isExit && gate.exitVeilleurOn && gate.exitcapPick && !g("sg_email", null) && g("sg_exitcap_snooze", 0) <= Date.now()) {
        try {
          if (sessionStorage.getItem("sg_exitcap")) return;
          sessionStorage.setItem("sg_exitcap", "1");
        } catch (_) {
          return;
        }
        setShowGameToast(false);
        setShowExitVeilleur(true);
        track("sg_exitcap_open", { trigger, variant: "veilleur" });
        return;
      }
      if (trigger === "idle") {
        try {
          if (sessionStorage.getItem("sg_game_toast")) return;
          sessionStorage.setItem("sg_game_toast", "1");
        } catch (_) {
          return;
        }
        setShowGameToast(true);
        track("sg_game_toast_shown", { trigger: "idle" });
        return;
      }
      try {
        if (sessionStorage.getItem("sg_game_toast")) return;
        sessionStorage.setItem("sg_game_toast", "1");
      } catch (_) {
        return;
      }
      setShowGameToast(true);
      track("sg_game_toast_shown", { trigger });
    };
    const fireAttract = () => {
      if (!attractEligible) return;
      const gate = gameGateRef.current;
      if (gate.sheet || gate.premium || gate.hero || gate.view !== "map") return;
      if ((window.scrollY || document.documentElement.scrollTop || 0) !== 0) return;
      try {
        if (sessionStorage.getItem("sg_attract_idle_seen")) return;
        if (sessionStorage.getItem("sg_seen_beach")) return;
        sessionStorage.setItem("sg_attract_idle_seen", "1");
        sessionStorage.setItem("sg_game_toast", "1");
      } catch (_) {
        return;
      }
      setShowGameToast(false);
      setShowAttract(true);
      try {
        track("sg_attract_view", { src: "idle" });
      } catch (_) {
      }
    };
    const reset = () => {
      _sgCapturingPhoto = false;
      clearTimeout(idleT);
      clearTimeout(attractT);
      idleT = setTimeout(() => fire("idle"), 45e3);
      if (attractEligible) attractT = setTimeout(fireAttract, 4e4);
    };
    const acts = ["pointerdown", "keydown", "touchstart", "wheel"];
    acts.forEach((a) => window.addEventListener(a, reset, { passive: true }));
    reset();
    const exitH = (e) => {
      if (e.clientY <= 0 && window.matchMedia("(min-width:900px)").matches) fire("exit");
    };
    document.addEventListener("mouseleave", exitH);
    let _mvy = 0, _mvt = 0;
    const exitFlick = (e) => {
      if (!window.matchMedia("(min-width:900px)").matches) return;
      const now = Date.now(), dy = e.clientY - _mvy, dt = now - _mvt;
      if (dt > 0 && dt < 180 && dy < -6 && -dy / dt > 0.55 && e.clientY < 160) fire("exit");
      _mvy = e.clientY;
      _mvt = now;
    };
    document.addEventListener("mousemove", exitFlick, { passive: true });
    const onVis = () => {
      if (document.visibilityState === "hidden") fire("hidden");
      else _sgCapturingPhoto = false;
    };
    document.addEventListener("visibilitychange", onVis);
    let downAcc = 0, lastY = 0, lastT = 0;
    const onScroll = () => {
      if (!window.matchMedia("(max-width:899px)").matches) return;
      const y = window.scrollY || document.documentElement.scrollTop || 0, now = Date.now(), dy = y - lastY;
      if (dy > 0) downAcc += dy;
      if (downAcc > 400 && dy < 0 && -dy > 120 && now - lastT < 300) {
        downAcc = 0;
        fire("scrollup");
      }
      lastY = y;
      lastT = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(idleT);
      clearTimeout(attractT);
      acts.forEach((a) => window.removeEventListener(a, reset));
      document.removeEventListener("mouseleave", exitH);
      document.removeEventListener("mousemove", exitFlick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => {
    if (!allBeaches.length) return;
    const p = getPathname();
    const isFarRoute = /^\/(?:carte|carte-sargasses|map|mapa|sargasses-pres-de-moi|sargasses-aujourdhui|en\/sargassum-near-me|es\/sargazo-cerca-de-mi|en\/sargassum-today|es\/sargazo-hoy)\/?$/.test(p);
    if (isFarRoute) {
      setShowHero(false);
      setShowPrevLanding(false);
      setShowAlertHub(false);
      setSelectedBeach(null);
      setShowArchipel(true);
      try {
        track("sg_map_open", { source: "deeplink_far" });
      } catch (_) {
      }
      return;
    }
    const mPlage = p.match(/^\/(?:plages|beaches|playas)\/([^/]+)/);
    const mBeach = p.match(/^\/beach\/([^/]+)/);
    const m = mPlage || mBeach;
    if (m) {
      const slug = m[1];
      let match = allBeaches.find((b) => b.id === slug) || allBeaches.find((b) => getCanonicalSlug(b) === slug);
      if (match) {
        setSelectedBeach(match);
        track("sg_beach_open", { beach_id: match.id, status: match.status, source: mBeach ? "dedicated_beach" : "deeplink" });
        return;
      } else {
        if (mPlage) {
          const isZone = Object.values(COAST_ZONES).flat().some((z) => z.slug === slug);
          if (isZone) {
            setInitialZone(slug);
            setShowHero(false);
            setShowPrevLanding(false);
            setShowCleanList(false);
            setShowAlertHub(false);
            setSelectedBeach(null);
            setShowArchipel(true);
            try {
              track("sg_zone_open", { zone: slug, source: "deeplink" });
            } catch (_) {
            }
            return;
          }
        }
        return;
      }
    }
    if (/^\/(?:poi|region|activity)\//.test(p)) {
      setShowHero(false);
      setShowPrevLanding(false);
      setShowCleanList(false);
      setShowAlertHub(false);
      setSelectedBeach(null);
      return;
    }
  }, [allBeaches]);
  const onPushPrimerAccept = useCallback(() => {
    track("sg_push_primer_accept", {});
    loadPushNow("primer_accept");
    try {
      const favs = g("sg_fav", []);
      if (Array.isArray(favs) && favs.length === 0 && userPos && allBeaches?.length) {
        const islandBeaches = allBeaches.filter((b) => b.island === island2 && b.lat && b.lng).map((b) => ({ ...b, _d: haversine(userPos.lat, userPos.lng, b.lat, b.lng) })).sort((a, b) => a._d - b._d).slice(0, 3);
        const ids = islandBeaches.map((b) => b.id);
        if (ids.length) {
          setFavorites(ids);
          track("sg_auto_fav_set", { count: ids.length, beach_ids: ids.join(","), source: "primer_accept" });
        }
      }
    } catch (e) {
    }
  }, [loadPushNow, userPos, allBeaches, island2]);
  const onPushPrimerDismiss = useCallback(() => {
    track("sg_push_primer_dismiss", {});
    s("sg_push_primer_dismissed_at", Date.now());
    setShowPushPrimer(false);
  }, []);
  const LL = T[lang] || T.fr;
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let cancelled = false;
    Promise.all([
      fetch("/data/beaches-list.json", { signal }).then((r) => r.json()).catch(() => null),
      fetch("/api/copernicus/sargassum.json", { signal }).then((r) => r.json()).catch(() => null),
      fetch("/api/weather/beaches-weather.json", { signal }).then((r) => r.json()).catch(() => null),
      // SIGNALEMENTS (local, rapide) DANS le fetch principal → les pins affichent leur VRAI statut
      // (escaladé par les signalements) dès le 1er rendu, au lieu de flasher vert→rouge/jaune.
      // app-reports.json = snapshot des reports IN-APP (le live Apps Script ~2,5 s reste en différé
      // pour la fraîcheur) ; fb-reports.json = signaux Facebook scrapés. On fusionne les deux.
      fetch("/api/community/app-reports.json", { signal }).then((r) => r.json()).catch(() => null),
      fetch("/api/community/fb-reports.json", { signal }).then((r) => r.json()).catch(() => null),
      // Gating J+2→J+7 : si on a une credential (token widget / email payeur), on
      // récupère la prévision COMPLÈTE EN PARALLÈLE → merge AVANT l'interpolation
      // ci-dessous (sinon les plages interpolées n'auraient pas leurs J+2-6).
      // BORNÉ 4 s : forecast.php (PHP dynamique, sans timeout natif) ne doit JAMAIS
      // retarder le verdict J0 — un premium sur réseau lent voyait son 1er verdict
      // bloqué le temps de cette route. Timeout → fcFull null → J+2-6 gaté (honnête),
      // puis le retry borné (1×, ci-dessous) le récupère hors chemin critique.
      Promise.race([fetchFullForecast(), new Promise((res) => setTimeout(() => res(null), 4e3))])
    ]).then(([beachData, sargResult, beachWx, appReports, fbReports, fcFull]) => {
      if (cancelled) return;
      const perBeachWx = beachWx?.beaches || {};
      setBeachesWeather(perBeachWx);
      if (sargResult && sargResult.weekly && fcFull) {
        for (const id in sargResult.weekly) {
          const full = fcFull[id];
          if (Array.isArray(full) && full.length > 2) {
            sargResult.weekly[id] = { ...sargResult.weekly[id], forecast: full, gated: false };
          }
        }
      }
      if (sargResult && sargResult.weekly) {
        for (const id in sargResult.weekly) {
          const w = sargResult.weekly[id];
          if (w && Array.isArray(w.forecast) && w.forecast.length > 0 && w.forecast.length < 7) {
            sargResult.weekly[id] = { ...w, forecast: padForecast(w.forecast, 7) };
          }
        }
      }
      try {
        const _premActive = !!localStorage.getItem("sg_premium") || parseInt(localStorage.getItem("sg_premium_pass_end") || "0") > Date.now();
        const _hasCred = !!(localStorage.getItem("sg_email") || localStorage.getItem("sg_premium_email") || localStorage.getItem("sg_fc_token"));
        if (_premActive && _hasCred && !fcFull && fcRetryRef.current < 1) {
          fcRetryRef.current++;
          setTimeout(() => setPremiumTick((t) => t + 1), 1500);
        }
      } catch (_) {
      }
      let beaches = IS_NEW_REGION ? REGION.beaches.map((b) => ({ ...b })) : Array.isArray(beachData) && beachData.length > 0 ? beachData.map((b) => {
        const { status, afai, ...rest } = b;
        return rest;
      }) : [...BEACHES_FALLBACK];
      if (sargResult && IS_NEW_REGION && Array.isArray(sargResult.levels)) {
        const _byId = {};
        for (const lvl of sargResult.levels) _byId[lvl.id] = lvl;
        const _hasMatch = beaches.some((b) => _byId[b.id]);
        if (_hasMatch) {
          setSargData(sargResult);
          setDataSource(sargResult?.source || "reference");
          beaches = beaches.map((b) => {
            const lvl = _byId[b.id];
            if (!lvl) return b;
            return { ...b, afai: lvl.afai, status: statusFromAfai(lvl.afai), _src: "live", beachMemory: lvl.beachMemory || false, afaiSat: lvl.afaiSat };
          });
          if (sargResult.weather || Object.keys(perBeachWx).length) {
            for (let i = 0; i < beaches.length; i++) {
              const islandW = sargResult.weather?.[beaches[i].island] || {};
              const bw = perBeachWx[beaches[i].id];
              const snap = {
                afai: beaches[i].afai,
                wind_speed: bw?.windSpeed ?? islandW.wind_speed,
                cloud_cover: islandW.cloud_cover,
                uv_index: bw?.uvMax ?? islandW.uv_index,
                sst: bw?.sst ?? islandW.sst,
                wave_height: bw?.waveHeight ?? islandW.wave_height,
                tide_ratio: null
              };
              if (snap.wave_height == null && snap.wind_speed == null) continue;
              const r = _computeBeachScore(snap, lang, US_UNITS);
              beaches[i] = { ...beaches[i], score: r.score, scoreLabel: r.label, scoreColor: r.color, scoreReason: r.reason, scoreBreakdown: r.breakdown, scoreStrengths: r.strengths || [], scoreWeaknesses: r.weaknesses || [] };
            }
          }
        }
      }
      if (sargResult && !IS_NEW_REGION) {
        setSargData(sargResult);
        setDataSource(sargResult?.source || "reference");
        if (sargResult?.levels) {
          const sentinelMap = {};
          for (const lvl of sargResult.levels) {
            const beachId = SARG_TO_BEACH[lvl.id] || lvl.id;
            const bch = beaches.find((b) => b.id === beachId);
            if (bch) sentinelMap[beachId] = { lat: bch.lat, lng: bch.lng, afai: lvl.afai, sargId: lvl.id };
          }
          const sentinels = Object.values(sentinelMap);
          for (const lvl of sargResult.levels) {
            const beachId = SARG_TO_BEACH[lvl.id] || lvl.id;
            const idx = beaches.findIndex((b) => b.id === beachId);
            if (idx >= 0) {
              beaches[idx] = { ...beaches[idx], afai: lvl.afai, status: statusFromAfai(lvl.afai), _src: "live", beachMemory: lvl.beachMemory || false, afaiSat: lvl.afaiSat };
            }
          }
          let _leeBlindOff = false;
          try {
            _leeBlindOff = /[?&]leeblind=0/.test(window.location.search);
          } catch (_) {
          }
          for (let i = 0; i < beaches.length; i++) {
            if (beaches[i]._src === "live") continue;
            const same = sentinels.filter((s2) => beaches[i].island === "mq" && s2.lat < 15.5 || beaches[i].island === "gp" && s2.lat >= 15.5);
            const interp = interpolateIDW(beaches[i], same.length > 0 ? same : sentinels);
            if (interp !== null) {
              let _coast = beaches[i].coast;
              try {
                if (!_coast) _coast = classifyBeachCoast(beaches[i].lat, beaches[i].lng, beaches[i].island);
              } catch (_) {
                _coast = "atlantic";
              }
              const _satBlind = _leeBlindOff ? _coast === "atlantic" : !isImmuneBay(beaches[i].lat, beaches[i].lng, beaches[i].island);
              beaches[i] = { ...beaches[i], afai: interp, status: statusFromAfai(interp), _src: "interpolated", _satBlind };
            }
          }
          if (sargResult.weather || Object.keys(perBeachWx).length) {
            for (let i = 0; i < beaches.length; i++) {
              const islandW = sargResult.weather?.[beaches[i].island] || {};
              const bw = perBeachWx[beaches[i].id];
              const snap = {
                afai: beaches[i].afai,
                wind_speed: bw?.windSpeed ?? islandW.wind_speed,
                cloud_cover: islandW.cloud_cover,
                // Open-Meteo Marine doesn't give cloud; island value stays
                uv_index: bw?.uvMax ?? islandW.uv_index,
                sst: bw?.sst ?? islandW.sst,
                wave_height: bw?.waveHeight ?? islandW.wave_height,
                tide_ratio: null
              };
              if (snap.wave_height == null && snap.wind_speed == null) continue;
              const r = _computeBeachScore(snap);
              beaches[i] = { ...beaches[i], score: r.score, scoreLabel: r.label, scoreColor: r.color, scoreReason: r.reason, scoreBreakdown: r.breakdown, scoreStrengths: r.strengths || [], scoreWeaknesses: r.weaknesses || [] };
            }
          }
          if (sargResult.weekly) {
            const enrichedWeekly = { ...sargResult.weekly };
            for (const b of beaches) {
              const sargId = BEACH_TO_SARG[b.id];
              if (sargId && sargResult.weekly[sargId]) continue;
              const same = sentinels.filter((s2) => b.island === "mq" && s2.lat < 15.5 || b.island === "gp" && s2.lat >= 15.5);
              const interp = interpolateForecast(b, same.length > 0 ? same : sentinels, sargResult.weekly);
              if (interp) {
                const syntheticId = `_interp_${b.id}`;
                enrichedWeekly[syntheticId] = interp;
              }
            }
            sargResult._enrichedWeekly = enrichedWeekly;
          }
        }
      }
      {
        const _cr = {};
        const _merge = (src) => {
          if (!src || !src.reports) return;
          for (const id in src.reports) {
            const r = src.reports[id];
            if (!_cr[id]) _cr[id] = { avoid: 0, moderate: 0, clean: 0, total: 0 };
            _cr[id].avoid += r.avoid || 0;
            _cr[id].moderate += r.moderate || 0;
            _cr[id].clean += r.clean || 0;
            _cr[id].total += r.total || 0;
          }
        };
        _merge(appReports);
        _merge(fbReports);
        const _RANK = { clean: 0, moderate: 1, avoid: 2 };
        for (let i = 0; i < beaches.length; i++) {
          const b = beaches[i];
          if (!b.status) continue;
          const r = _cr[b.id] || _cr[BEACH_TO_SARG[b.id]];
          if (!r || !r.total || r.total < 2) continue;
          const consensus = r.avoid >= r.moderate && r.avoid >= r.clean ? "avoid" : r.moderate >= r.clean ? "moderate" : "clean";
          if (_RANK[consensus] > _RANK[b.status]) beaches[i] = { ...b, status: consensus, _communityOverride: true, _communityTotal: r.total };
        }
      }
      setAllBeaches(beaches);
    });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [premiumTick]);
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let cancelled = false;
    const t = setTimeout(() => {
      Promise.all([
        fetch(APPS_SCRIPT_URL + "?action=beach_reports", { signal }).then((r) => r.json()).catch(() => null),
        fetch("/api/community/fb-reports.json", { signal }).then((r) => r.json()).catch(() => null),
        fetch("/api/community/fb-posts.json", { signal }).then((r) => r.json()).catch(() => null)
      ]).then(([userData, fbData, fbPostsData]) => {
        if (cancelled) return;
        const merged = {};
        const merge = (src) => {
          if (!src?.reports) return;
          for (const [id, r] of Object.entries(src.reports)) {
            if (!merged[id]) {
              merged[id] = { avoid: 0, moderate: 0, clean: 0, total: 0, samples: [] };
            }
            merged[id].avoid += r.avoid || 0;
            merged[id].moderate += r.moderate || 0;
            merged[id].clean += r.clean || 0;
            merged[id].total += r.total || 0;
            if (r.samples) merged[id].samples.push(...r.samples.slice(0, 2));
          }
        };
        merge(userData);
        merge(fbData);
        if (Object.keys(merged).length > 0) setCommunityReports(merged);
        if (fbPostsData?.postsByBeach) setFbPosts(fbPostsData.postsByBeach);
      });
    }, 3e3);
    return () => {
      cancelled = true;
      clearTimeout(t);
      ac.abort();
    };
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch("/data/beaches-images.json", { signal }).then((r) => r.ok ? r.json() : null).then((data) => {
        if (!cancelled && data && typeof data === "object") setImageMap(data);
      }).catch(() => {
      });
      fetch("/data/beaches-images-quality.json", { signal }).then((r) => r.ok ? r.json() : null).then((data) => {
        if (!cancelled && data && typeof data === "object") setImageQ(data);
      }).catch(() => {
      });
      fetch("/videos/hero/manifest.json", { signal }).then((r) => r.ok ? r.json() : null).then((m) => {
        if (!cancelled && m && Array.isArray(m.ids)) setHeroVids(m.ids);
      }).catch(() => {
      });
    }, showHero2 ? 0 : 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      ac.abort();
    };
  }, []);
  useEffect(() => {
    if (Object.keys(communityReports).length === 0) return;
    setAllBeaches((prev) => {
      let changed = false;
      const updated = prev.map((b) => {
        if (!b.status) return b;
        const sargId = BEACH_TO_SARG[b.id];
        const rpt = communityReports[b.id] || communityReports[sargId];
        if (!rpt || !rpt.total || rpt.total < 2) return b;
        const consensus = rpt.avoid >= rpt.moderate && rpt.avoid >= rpt.clean ? "avoid" : rpt.moderate >= rpt.clean ? "moderate" : "clean";
        const STATUS_RANK = { clean: 0, moderate: 1, avoid: 2 };
        if (STATUS_RANK[consensus] > STATUS_RANK[b.status]) {
          changed = true;
          return { ...b, status: consensus, _communityOverride: true, _communityTotal: rpt.total };
        }
        return b;
      });
      return changed ? updated : prev;
    });
  }, [communityReports]);
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    const t = setTimeout(() => {
      fetch("/api/copernicus/history.json", { signal }).then((r) => r.json()).then((data) => {
        if (data?.history) setHistoryData(data.history);
      }).catch(() => {
      });
    }, 2e3);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, []);
  const requestGeo = useCallback((src = "near_me") => {
    const _src = typeof src === "string" ? src : "near_me";
    if (!navigator.geolocation) {
      try {
        sgToast({ tone: "error", msg: _t(lang, "G\xE9olocalisation indisponible sur cet appareil.", "Geolocation unavailable on this device.", "Geolocalizaci\xF3n no disponible en este dispositivo.") });
      } catch (_) {
      }
      ;
      return;
    }
    try {
      track("sg_geo_request", { src: _src });
    } catch (_) {
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      setUserPos({ lat, lng });
      const gpsIsland = lat > 15.5 ? "gp" : "mq";
      setIsland((prev) => {
        const saved = g("sg_island", null);
        return saved ? prev : gpsIsland;
      });
    }, (err) => {
      try {
        track("sg_geo_denied", { src: _src, code: err && err.code });
      } catch (_) {
      }
      try {
        sgToast({
          tone: "error",
          title: _t(lang, "Position indisponible", "Location unavailable", "Ubicaci\xF3n no disponible"),
          msg: err && err.code === 1 ? _t(lang, "Autorise la localisation pour voir les plages pr\xE8s de toi.", "Allow location to see beaches near you.", "Permite la ubicaci\xF3n para ver playas cerca de ti.") : _t(lang, "R\xE9essaie dans un instant.", "Try again in a moment.", "Int\xE9ntalo de nuevo en un momento.")
        });
      } catch (_) {
      }
    }, { enableHighAccuracy: true, timeout: 12e3, maximumAge: 0 });
  }, [lang]);
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: "geolocation" }).then((p) => {
      if (p.state !== "granted") return;
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setUserPos({ lat, lng });
        const gpsIsland = lat > 15.5 ? "gp" : "mq";
        setIsland((prev) => {
          const saved = g("sg_island", null);
          if (!saved) return gpsIsland;
          return prev;
        });
      }, () => {
      }, { enableHighAccuracy: false, timeout: 8e3, maximumAge: 3e5 });
    }).catch(() => {
    });
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try {
      localStorage.setItem("sg_dark_mode", theme === "dark" ? "dark" : "light");
    } catch {
    }
    s("sg_theme", theme);
  }, [theme]);
  useEffect(() => {
    try {
      if (/[?&]subregions=0/.test(window.location.search)) return;
      const ext = detectExtendedRegion(window.location.pathname, window.location.hostname);
      if (ext) {
        try {
          track("sg_region_extended_view", { region: ext, path: window.location.pathname });
        } catch {
        }
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    const vc = g("sg_visit_count", 0) + 1;
    s("sg_visit_count", vc);
  }, []);
  useEffect(() => {
    if (true) return;
    let cancelled = false;
    const numOf = (v) => parseInt(String(v || "").replace(/^v/, ""), 10) || 0;
    const run = async () => {
      try {
        const res = await fetch("/release-notes.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data || !data.current || !Array.isArray(data.releases) || !data.releases.length) return;
        const cur = data.current;
        const seen = g("sg_rel_seen", null);
        if (seen === cur) return;
        const returning = g("sg_visit_count", 0) >= 2;
        let releasesToShow;
        if (!seen) {
          if (!returning) {
            s("sg_rel_seen", cur);
            return;
          }
          releasesToShow = [data.releases[0]];
        } else {
          const sN = numOf(seen);
          releasesToShow = data.releases.filter((r) => numOf(r.v) > sN);
          if (!releasesToShow.length) {
            s("sg_rel_seen", cur);
            return;
          }
        }
        const items = [];
        for (const r of releasesToShow) for (const it of r.items || []) items.push(it);
        if (!items.length) {
          s("sg_rel_seen", cur);
          return;
        }
        const head = releasesToShow[0];
        if (!cancelled) setWhatsNew({ v: cur, date: head.date || data.date || "", title: head.title || null, items });
      } catch (_) {
      }
    };
    const t = setTimeout(run, 1400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    s("sg_island", island2);
  }, [island2]);
  useEffect(() => {
    s("sg_fav", favorites);
  }, [favorites]);
  useEffect(() => {
    if (myBeachId) s("sg_my_beach", myBeachId);
  }, [myBeachId]);
  const myBeach = useMemo(() => {
    if (!myBeachId) return null;
    return allBeaches.find((b) => b.id === myBeachId) || null;
  }, [myBeachId, allBeaches]);
  const briefData = useMemo(() => {
    try {
      const list = Array.isArray(allBeaches) ? allBeaches : [];
      if (!list.length) return null;
      const featured = myBeach || favorites && favorites.length && list.find((b) => b.id === favorites[0]) || list.find((b) => b.status && b.name) || list[0];
      if (!featured) return null;
      const st = featured.status || "clean";
      const RN = { mq: "Martinique", gp: "Guadeloupe", florida: "Florida", puntacana: "Punta Cana", rivieramaya: "Canc\xFAn" };
      const region = RN[featured.island] || REGION && (REGION.displayName || REGION.name) || (featured.island ? String(featured.island).toUpperCase() : "");
      const rl = featured.h2s && typeof featured.h2s === "object" ? featured.h2s.level : null;
      const lvl = rl === "high" ? "high" : rl === "moderate" || rl === "mod" ? "mod" : rl === "low" ? "low" : st === "avoid" ? "high" : st === "moderate" ? "mod" : "low";
      const h2s = { fr: lvl === "high" ? "\xE9lev\xE9" : lvl === "mod" ? "mod\xE9r\xE9" : "faible", en: lvl === "high" ? "high" : lvl === "mod" ? "moderate" : "low", es: lvl === "high" ? "alto" : lvl === "mod" ? "moderado" : "bajo" };
      let bestDay = null;
      const fc = sargData && sargData.weekly && sargData.weekly[featured.id] && sargData.weekly[featured.id].forecast || null;
      if (Array.isArray(fc) && fc.length) {
        let bi = 0, ba = Infinity;
        for (let i = 0; i < fc.length; i++) {
          const a = typeof fc[i].afai === "number" ? fc[i].afai : Infinity;
          if (a < ba) {
            ba = a;
            bi = i;
          }
        }
        if (bi === 0) bestDay = { fr: "aujourd'hui", en: "today", es: "hoy" };
        else {
          const dt = fc[bi].date;
          const mk = (loc) => {
            try {
              return new Date(dt).toLocaleDateString(loc, { weekday: "long" });
            } catch (_) {
              return fc[bi].day || "";
            }
          };
          bestDay = { fr: mk("fr-FR"), en: mk("en-US"), es: mk("es-ES") };
        }
      }
      let planB = null;
      if ((st === "avoid" || st === "moderate") && typeof featured.lat === "number" && typeof featured.lng === "number") {
        const hav = (a, b, c, d) => {
          const R = 6371, dLat = (c - a) * Math.PI / 180, dLng = (d - b) * Math.PI / 180, x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
        };
        let best = null, bd = Infinity;
        for (const b of list) {
          if (!b || b.id === featured.id || b.status !== "clean" || typeof b.lat !== "number" || typeof b.lng !== "number" || b.island !== featured.island) continue;
          const d = hav(featured.lat, featured.lng, b.lat, b.lng);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) {
          const km = bd < 1 ? "< 1 km" : "~" + Math.round(bd) + " km";
          const lbl = best.name + " (" + km + ")";
          planB = { fr: lbl, en: lbl, es: lbl };
        }
      }
      const ts = sargData && (sargData.erddapTimestamp || sargData.updatedAt) || null;
      const ageHours = (() => {
        try {
          if (!ts) return null;
          const h = (Date.now() - new Date(ts).getTime()) / 36e5;
          return isFinite(h) && h >= 0 ? h : null;
        } catch (_) {
          return null;
        }
      })();
      return { beach: featured.name, region, score: typeof featured.score === "number" ? featured.score : null, status: st, bestDay, h2s, planB, ageHours };
    } catch (_) {
      return null;
    }
  }, [allBeaches, myBeach, favorites, sargData]);
  const onPickBeach = useCallback((id) => {
    setMyBeachId(id);
    s("sg_my_beach", id);
    setShowPicker(false);
    setFavorites((f) => f.includes(id) ? f : [...f, id]);
    s("sg_onb", 1);
  }, []);
  const toggleFav = useCallback((id) => {
    setFavorites((f) => {
      const isAdding = !f.includes(id);
      track(isAdding ? "sg_fav_add" : "sg_fav_remove", { beach_id: id });
      if (isAdding) {
        setShowFavToast(true);
        setTimeout(() => setShowFavToast(false), 5500);
      }
      try {
        if (window.OneSignalDeferred) {
          window.OneSignalDeferred.push(function(O) {
            const tagKey = "fav_" + id;
            if (isAdding) O.User.addTag(tagKey, "1");
            else O.User.removeTag(tagKey);
          });
        }
      } catch (e) {
      }
      return isAdding ? [...f, id] : f.filter((x) => x !== id);
    });
  }, []);
  const toggleTheme = useCallback(() => setTheme((t) => t === "dark" ? "light" : "dark"), []);
  const toggleLang = useCallback(() => setLang((l) => IS_NEW_REGION ? l === REGION.primaryLang ? REGION.secondaryLangs?.[0] || "en" : REGION.primaryLang : l === "fr" ? "en" : l === "en" ? "es" : "fr"), []);
  useEffect(() => {
    try {
      if (typeof document !== "undefined") document.documentElement.lang = lang;
    } catch {
    }
  }, [lang]);
  const filtered = useMemo(() => {
    let list = allBeaches.filter((b) => b.island === island2);
    if (userPos) {
      list = list.map((b) => ({ ...b, _dist: haversine(userPos.lat, userPos.lng, b.lat, b.lng) }));
    }
    if (search.trim()) {
      const fold = (v) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const q = fold(search.trim());
      list = list.filter((b) => fold(b.name).includes(q) || fold(b.commune).includes(q));
    }
    if (filter === 1) list = list.filter((b) => b.status === "clean");
    else if (filter === 2) list = list.filter((b) => favorites.includes(b.id));
    else if (filter === 3) list = list.filter((b) => b.status === "avoid");
    if (userPos) {
      list.sort((a, b) => (a._dist || 999) - (b._dist || 999));
    }
    return list;
  }, [island2, search, filter, favorites, allBeaches, userPos]);
  const filterCounts = useMemo(() => {
    const ib = allBeaches.filter((b) => b.island === island2);
    return [ib.length, ib.filter((b) => b.status === "clean").length, favorites.filter((id) => ib.some((b) => b.id === id)).length, ib.filter((b) => b.status === "avoid").length];
  }, [allBeaches, island2, favorites]);
  const [nextSuggestion, setNextSuggestion] = useState(null);
  const nextSuggestTimer = useRef(null);
  const lastMapClickRef = useRef(0);
  const onBeachClick = useCallback((b) => {
    if (!b || !b.id) return;
    setComicBeach(null);
    setSelectedBeach(null);
    const _sid = IS_NEW_REGION ? b.id : BEACH_TO_SARG[b.id];
    const beachData = _sid && sargData?.weekly?.[_sid] || sargData?._enrichedWeekly?.[`_interp_${b.id}`] || null;
    if (!beachData && sargData?.stale) {
      showToast({
        title: _t(lang, "Donn\xE9es non rafra\xEEchies", "Data not refreshed", "Datos no actualizados"),
        msg: _t(lang, "Les pr\xE9visions sont bas\xE9es sur des tendances.", "Forecasts are based on trends.", "Los pron\xF3sticos se basan en tendencias."),
        mood: "warn"
      });
    }
    if (mapDetail) {
      openComicBeach(b);
      track("sg_beach_open", { beach_id: b.id, status: b.status, via: "comic_detail" });
    } else {
      setSelectedBeach(b);
      track("sg_beach_open", { beach_id: b.id, status: b.status, via: "beach_sheet_comic" });
    }
    if (b.status === "clean") triggerCelebration("clean_beach");
    try {
      if (navDive && b.status && !sessionStorage.getItem("sg_dove") && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        sessionStorage.setItem("sg_dove", "1");
        setDiveBeach(b);
        track("sg_dive_play", { beach_id: b.id });
      }
    } catch (_) {
    }
    setNextSuggestion(null);
    if (nextSuggestTimer.current) clearTimeout(nextSuggestTimer.current);
    try {
      window.dispatchEvent(new Event("sg:value_moment"));
    } catch (e) {
    }
    const v = parseInt(sessionStorage.getItem("sg_beach_views") || "0") + 1;
    sessionStorage.setItem("sg_beach_views", String(v));
    try {
      sessionStorage.setItem("sg_seen_beach", "1");
    } catch (_) {
    }
  }, [sargData, lang]);
  const mapDetail = useMemo(() => {
    try {
      return /[?&]mapdetail=1/.test(window.location.search);
    } catch (_) {
      return false;
    }
  }, []);
  const [comicBeach, setComicBeach] = useState(null);
  const openComicBeach = useCallback((b) => {
    if (!b || !b.id) return;
    setSelectedBeach(null);
    setComicBeach(b);
    track("sg_beach_open", { beach_id: b.id, status: b.status, via: "comic_map" });
    if (b.status === "clean") triggerCelebration("clean_beach");
    try {
      window.dispatchEvent(new Event("sg:value_moment"));
    } catch (e) {
    }
    try {
      const v = parseInt(sessionStorage.getItem("sg_beach_views") || "0") + 1;
      sessionStorage.setItem("sg_beach_views", String(v));
      sessionStorage.setItem("sg_seen_beach", "1");
    } catch (_) {
    }
    track("sg_comic_open", { beach_id: b.id, status: b.status });
  }, []);
  const [mapTipDismissed, setMapTipDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("sg_map_tip") === "1";
    } catch (_) {
      return true;
    }
  });
  const onMapBeach = useCallback((b) => {
    const now = Date.now();
    if (now - lastMapClickRef.current < 350) return;
    lastMapClickRef.current = now;
    if (!mapTipDismissed) {
      setMapTipDismissed(true);
      try {
        sessionStorage.setItem("sg_map_tip", "1");
      } catch (_) {
      }
    }
    setShowHero(false);
    setHeroExiting(false);
    setShowArchipel(false);
    setShowChat(false);
    setShowVeille(false);
    openComicBeach(b);
  }, [openComicBeach, mapTipDismissed]);
  const previewBeachObj = useMemo(() => {
    try {
      const q = window.location.search;
      if (/[?&]b2bpreview=0/.test(q)) return null;
      if (!/[?&]preview_(?:name|partner)=/.test(q)) return null;
      const m = q.match(/[?&]preview_beach=([^&]+)/);
      if (!m) return null;
      const pv = decodeURIComponent(m[1]).replace(/[^a-z0-9-]/g, "");
      const bid = SARG_TO_BEACH[pv] || pv;
      return allBeaches.find((b) => b.id === bid) || null;
    } catch (_) {
      return null;
    }
  }, [allBeaches]);
  const previewOpenedRef = useRef(false);
  useEffect(() => {
    if (!previewBeachObj) return;
    if (previewOpenedRef.current) {
      setComicBeach((cb) => cb && cb.id === previewBeachObj.id ? previewBeachObj : cb);
      return;
    }
    if (!dataReady) return;
    previewOpenedRef.current = true;
    setShowHero(false);
    setShowPrevLanding(false);
    setShowCleanList(false);
    setShowAlertHub(false);
    setSelectedBeach(null);
    try {
      const z = (COAST_ZONES[previewBeachObj.island] || []).find((z2) => (z2.communes || []).includes(previewBeachObj.commune));
      if (z) setInitialZone(z.slug);
    } catch (_) {
    }
    setShowArchipel(true);
    setComicBeach(previewBeachObj);
    try {
      track("sg_b2b_preview_open", { beach_id: previewBeachObj.id });
    } catch (_) {
    }
  }, [previewBeachObj, dataReady]);
  const closeSheet = useCallback(() => {
    const closing = selectedBeach;
    setSelectedBeach(null);
    if (closing && allBeaches.length > 0) {
      const islandBeaches = allBeaches.filter((b) => b.id !== closing.id && b.island === closing.island && b.status === "clean");
      if (islandBeaches.length > 0) {
        const withDist = islandBeaches.map((b) => ({ ...b, _d: haversine(closing.lat, closing.lng, b.lat, b.lng) }));
        withDist.sort((a, b) => a._d - b._d);
        const best = withDist[0];
        if (best._d < 30) {
          setNextSuggestion({ beach: best, dist: Math.round(best._d) });
          track("sg_next_suggest_show", { from: closing.id, to: best.id });
          if (nextSuggestTimer.current) clearTimeout(nextSuggestTimer.current);
          nextSuggestTimer.current = setTimeout(() => setNextSuggestion(null), 6e3);
        }
      }
    }
  }, [selectedBeach, allBeaches]);
  const FORECAST_GATE_SRCS = ["forecast_lock", "forecast_cta", "forecast_scrub", "forecast_beat", "forecast_scrub_premium", "whisper_veilleur"];
  const hasAnnual = !!LINK_ANNUAL;
  const openPremium = useCallback((src) => {
    const s2 = src || "nav";
    if (captureGate && FORECAST_GATE_SRCS.includes(s2)) {
      let hasEm = false;
      try {
        hasEm = !!localStorage.getItem("sg_email");
      } catch (_) {
      }
      if (!hasEm) {
        setCaptureGateSrc(s2);
        setShowCaptureGate(true);
        track("sg_capture_gate_view", { src: s2 });
        return;
      }
    }
    setPremiumSource(s2);
    setShowPremium(true);
    const _pwV = abVariant("pw_style", ["world", "comic"]);
    track("sg_premium_modal_open", { source: s2, pw_style: _pwV });
    track("sg_paywall_view", { source: s2, pw_style: _pwV, offer: hasAnnual ? "annual" : "monthly", price_monthly: PRICE_MO || null, price_annual: PRICE_YR || null });
    try {
      if (hasAnnual) {
        viewPromotion("pro_annual", "paywall_annual");
      } else {
        viewPromotion("pro_monthly", "paywall_monthly");
      }
    } catch (_) {
    }
  }, [captureGate]);
  useEffect(() => {
    const handler = (e) => {
      try {
        openPremium(e?.detail?.retry ? "payment_retry" : "nav");
      } catch (_) {
      }
    };
    document.addEventListener("sg_open_paywall", handler);
    return () => {
      document.removeEventListener("sg_open_paywall", handler);
    };
  }, [openPremium]);
  const RMENU_OFF = useMemo(() => {
    try {
      return /[?&]rmenu=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  }, []);
  const [ctxMenu, setCtxMenu] = useState(null);
  useEffect(() => {
    if (RMENU_OFF) return;
    try {
      if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) return;
    } catch (_) {
    }
    const DENY = 'a,button,input,textarea,select,label,[contenteditable],[role="button"],[role="link"],[role="menuitem"],[data-vmui],.leaflet-marker-icon';
    const onCtx = (e) => {
      try {
        if (e.shiftKey) return;
        const t = e.target;
        if (!t || t.nodeType !== 1 || !t.closest) return;
        if (t.closest(DENY)) return;
        const beachEl = t.closest("[data-beach]");
        if (!beachEl && !t.closest("svg[data-sg-live]")) return;
        try {
          const sel = window.getSelection && window.getSelection();
          if (sel && String(sel).trim()) return;
        } catch (_) {
        }
        let beach = null;
        if (beachEl) {
          try {
            const id = beachEl.getAttribute("data-beach");
            beach = allBeaches.find((b) => b.id === id) || null;
          } catch (_) {
          }
        }
        e.preventDefault();
        let x = e.clientX, y = e.clientY, kb = false;
        if (!(x > 0) || !(y > 0)) {
          kb = true;
          try {
            const r = (document.activeElement || t).getBoundingClientRect();
            x = r.left + Math.min(28, r.width / 2);
            y = r.top + Math.min(28, r.height / 2);
          } catch (_) {
            x = (window.innerWidth || 360) / 2;
            y = (window.innerHeight || 640) / 2;
          }
        }
        setCtxMenu({ x, y, beach, kb });
        try {
          const seen = parseInt(sessionStorage.getItem("sg_beach_views") || "0", 10) || 0;
          track("sg_ctx_open", { context: beach ? "beach" : "scene", beach_id: beach ? beach.id : null, above_gift: seen >= 3 ? 1 : 0, kb: kb ? 1 : 0 });
        } catch (_) {
        }
      } catch (_) {
      }
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [RMENU_OFF, allBeaches]);
  const closeCtx = useCallback(() => {
    setCtxMenu((cur) => {
      if (cur) {
        try {
          track("sg_ctx_dismiss", { context: cur.beach ? "beach" : "scene" });
        } catch (_) {
        }
      }
      return null;
    });
  }, []);
  const ctxShare = useCallback((b) => {
    try {
      const url = _fichePageUrl(b);
      if (navigator.share) {
        try {
          navigator.share({ title: b.name, url }).catch(() => {
          });
        } catch (_) {
        }
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          try {
            sgToast({ title: _t(lang, "Lien copi\xE9", "Link copied", "Enlace copiado"), msg: b.name, tone: "success" });
          } catch (_) {
          }
        }).catch(() => {
          try {
            sgToast({ title: b.name, msg: url, tone: "info" });
          } catch (_) {
          }
        });
      } else {
        try {
          sgToast({ title: b.name, msg: url, tone: "info" });
        } catch (_) {
        }
      }
    } catch (_) {
    }
  }, [lang]);
  const ctxMenuView = useMemo(() => {
    if (!ctxMenu) return null;
    const L = (fr, en, es) => _t(lang, fr, en, es);
    const done = (id, fn) => {
      const ctx = ctxMenu.beach ? "beach" : "scene", bid = ctxMenu.beach ? ctxMenu.beach.id : null;
      try {
        track("sg_ctx_action", { action: id, context: ctx, beach_id: bid });
      } catch (_) {
      }
      ;
      setCtxMenu(null);
      try {
        fn && fn();
      } catch (_) {
      }
    };
    const focusSearch = () => {
      try {
        const el = document.querySelector('input[type="search"]');
        if (el) {
          el.focus();
          el.scrollIntoView && el.scrollIntoView({ block: "center" });
        } else {
          setShowPremium(false);
          setView("map");
        }
      } catch (_) {
      }
    };
    const b = ctxMenu.beach;
    if (b) {
      const items2 = [{ id: "verdict", primary: true, label: L("Voir le verdict du jour", "See today's verdict", "Ver el veredicto de hoy"), onSelect: () => done("verdict", () => onMapBeach(b)) }];
      const alt = nearestCleanAlt(b, allBeaches);
      if (alt && alt.id !== b.id) items2.push({ id: "nearest", label: L("Une crique propre \xE0 c\xF4t\xE9", "A clean cove nearby", "Una cala limpia cerca"), onSelect: () => done("nearest", () => onMapBeach(alt)) });
      items2.push({ id: "share", label: L("Partager cette plage", "Share this beach", "Compartir esta playa"), onSelect: () => done("share", () => ctxShare(b)) });
      items2.push({ id: "alerts", label: L("\xCAtre pr\xE9venu quand \xE7a tourne", "Get told when it turns", "Av\xEDsame cuando cambie"), onSelect: () => done("alerts", () => {
        try {
          forceEnablePush("ctx_menu");
        } catch (_) {
        }
      }) });
      if (!isPremium) {
        let seen = 0;
        try {
          seen = parseInt(sessionStorage.getItem("sg_beach_views") || "0", 10) || 0;
        } catch (_) {
        }
        if (seen >= 3) items2.push({ id: "premium", label: L("Conna\xEEtre la fin de l'histoire", "Know how the story ends", "Conocer el final de la historia"), onSelect: () => done("premium", () => openPremium("ctx_menu")) });
        else items2.push({ id: "reliability", label: L("Voir ce qu'on vaut vraiment", "See what we're really worth", "Ver cu\xE1nto valemos"), onSelect: () => done("reliability", () => {
          try {
            window.location.href = reliabilityHref(lang);
          } catch (_) {
          }
        }) });
      }
      return { header: L("Vous regardez cette plage. Moi aussi.", "You're watching this beach. So am I.", "Miras esta playa. Yo tambi\xE9n."), items: items2 };
    }
    const pool = allBeaches.filter((x) => x && x.status && x.status !== "_loading" && x.lat != null);
    const cleanPool = pool.filter((x) => x.status === "clean");
    const best = (cleanPool.length ? cleanPool : pool).slice().sort((a, b2) => (b2.score || 0) - (a.score || 0))[0];
    const items = [];
    if (best) items.push({ id: "best", primary: true, label: L("La plage propre du jour", "Today's clean beach", "La playa limpia de hoy"), onSelect: () => done("best", () => onMapBeach(best)) });
    items.push({ id: "search", label: L("Chercher ma plage", "Find my beach", "Buscar mi playa"), onSelect: () => done("search", focusSearch) });
    items.push({ id: "reliability", label: L("Comment on mesure", "How we measure", "C\xF3mo medimos"), onSelect: () => done("reliability", () => {
      try {
        window.location.href = reliabilityHref(lang);
      } catch (_) {
      }
    }) });
    return { header: L("Vous regardez la mer. Moi aussi.", "You're watching the sea. So am I.", "Miras el mar. Yo tambi\xE9n."), items };
  }, [ctxMenu, lang, isPremium, allBeaches, ctxShare]);
  const onChangeView = useCallback((v) => {
    track("sg_nav_change", { tab: v });
    if (v === "premium") openPremium("nav");
    else {
      setShowPremium(false);
      setView(v);
    }
  }, [openPremium]);
  const [showProB2B, setShowProB2B] = useState(false);
  const proB2BSrc = useRef("app");
  const handleDeepLink = useCallback(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("paywall") === "1" || p.get("paywall") === "cancel") {
        const dp = p.get("plan");
        if (dp === "monthly" || dp === "annual") {
          try {
            sessionStorage.setItem("sg_deep_plan", dp);
          } catch (_) {
          }
        }
        const canceled = p.get("paywall") === "cancel";
        const u = p.get("utm_source");
        openPremium(canceled ? "payment_cancel" : u ? ("deeplink_" + u).slice(0, 40) : "deeplink");
        window.history.replaceState({}, "", getPathname());
      } else if (p.get("pro") === "1") {
        setShowProB2B(true);
        proB2BSrc.current = "deeplink_pro";
        try {
          sessionStorage.setItem("sg_b2b_qs", window.location.search);
        } catch (_) {
        }
        try {
          track("sg_b2b_open", { source: "deeplink_pro" });
        } catch (_) {
        }
        try {
          const b = p.get("b");
          if (b) track("sg_b2b_visit", { b, campaign: p.get("utm_campaign") || "", medium: p.get("utm_medium") || "" });
        } catch (_) {
        }
        window.history.replaceState({}, "", getPathname());
      } else if (/\/(alertes|sargassum-alerts|alertas-sargazo)\/?$/.test(getPathname())) {
        openPremium("alertes_landing");
      }
    } catch (e) {
      console.error("[DEEPLINK ERROR]", e);
    }
  }, [openPremium]);
  useEffect(() => {
    handleDeepLink();
  }, [handleDeepLink]);
  useEffect(() => {
    return;
    if (isPremium) return;
    if (g("sg_visit_count", 0) < 2) return;
    try {
      if (sessionStorage.getItem("sg_eng_shown")) return;
    } catch {
    }
    let t = null;
    const arm = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (document.querySelector(".sheet")) return;
        try {
          sessionStorage.setItem("sg_eng_shown", "1");
        } catch {
        }
        openPremium("engagement_50s");
      }, 5e4);
    };
    const reset = () => arm();
    window.addEventListener("sg:value_moment", reset);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("sg:value_moment", reset);
    };
  }, []);
  const [showSplash, setShowSplash] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      const q = window.location.search || "";
      if (/[?&]splash=0/.test(q)) return false;
      if (/[?&]splash=1/.test(q)) return true;
      return false;
      const path = getPathname();
      if (!(path === "/" || path === "" || path === "/index.html")) return false;
      if (sessionStorage.getItem("sg_splash_seen")) return false;
      sessionStorage.setItem("sg_splash_seen", "1");
      return true;
    } catch (_) {
      return false;
    }
  });
  const [showArenaOnb, setShowArenaOnb] = useState(() => {
    try {
      if (/[?&]onb=1/.test(window.location.search)) return true;
      return false;
    } catch (_) {
      return false;
    }
  });
  const [cookieConsent2, setCookieConsent] = useState(() => {
    try {
      return localStorage.getItem("sg_cookie_consent") || null;
    } catch (_) {
      return null;
    }
  });
  const v2UiEnabled = (() => {
    try {
      return !/[?&]sguxv2=0(?:&|$)/.test(window.location.search);
    } catch (_) {
      return true;
    }
  })();
  const finishArenaOnb = useCallback(() => {
    try {
      localStorage.setItem("sg_onb", "1");
    } catch (_) {
    }
    setShowArenaOnb(false);
  }, []);
  const _onbRegion = useMemo(() => {
    try {
      if (typeof IS_NEW_REGION !== "undefined" && IS_NEW_REGION && typeof REGION !== "undefined" && REGION)
        return { label: REGION.name, beaches: (REGION.beaches || []).slice(0, 3).map((b) => b && b.name).filter(Boolean) };
      if (typeof location !== "undefined" && location.hostname && location.hostname.includes("guadeloupe"))
        return { label: "Guadeloupe", beaches: ["Grande Anse", "Plage de la Caravelle"] };
    } catch (_) {
    }
    return null;
  }, []);
  const _onbWordmark = useMemo(() => {
    try {
      if (typeof IS_NEW_REGION !== "undefined" && IS_NEW_REGION && typeof REGION !== "undefined" && REGION)
        return "SARGASSUM " + String(REGION.name || "").toUpperCase();
      if (typeof location !== "undefined" && location.hostname && location.hostname.includes("guadeloupe"))
        return "SARGASSES GUADELOUPE";
    } catch (_) {
    }
    return "SARGASSES MARTINIQUE";
  }, []);
  const [showVeilleurHero, setShowVeilleurHero] = useState(() => {
    try {
      return /[?&]vh=1/.test(window.location.search || "");
    } catch (_) {
      return false;
    }
  });
  const dismissVeilleurHero = useCallback(() => {
    try {
      sessionStorage.setItem("sg_vh_seen", "1");
      track("sg_vh_enter", {});
    } catch (_) {
    }
    ;
    setShowVeilleurHero(false);
  }, [track]);
  const [showDemo, setShowDemo] = useState(() => {
    try {
      const q = window.location.search || "";
      return /[?&]demo=1/.test(q) && !/[?&]demo=0/.test(q);
    } catch (_) {
      return false;
    }
  });
  const [showVerticals, setShowVerticals] = useState(() => {
    try {
      const q = window.location.search || "";
      return /[?&]verticals=1/.test(q) && !/[?&]verticals=0/.test(q);
    } catch (_) {
      return false;
    }
  });
  const [showBrief, setShowBrief] = useState(() => {
    try {
      const q = window.location.search || "";
      return /[?&]brief=1/.test(q) && !/[?&]brief=0/.test(q);
    } catch (_) {
      return false;
    }
  });
  const [showVeille, setShowVeille] = useState(() => {
    try {
      const q = window.location.search || "";
      return /[?&]veille=1/.test(q) && !/[?&]veille=0/.test(q);
    } catch (_) {
      return false;
    }
  });
  const demoSrc = useMemo(() => {
    try {
      const m = (window.location.search || "").match(/[?&]src=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : "lobby";
    } catch (_) {
      return "lobby";
    }
  }, []);
  const demoPartner = useMemo(() => {
    try {
      const m = (window.location.search || "").match(/[?&]partner=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
      return null;
    }
  }, []);
  useEffect(() => {
    try {
      if (/[?&]utm_medium=qr/.test(window.location.search || "")) {
        const m = (window.location.search || "").match(/[?&]utm_campaign=([^&]+)/);
        track("sg_lobby_scan", { partner: m ? decodeURIComponent(m[1]) : "", src: "lobby" });
      }
    } catch (_) {
    }
  }, []);
  if (showDemo) {
    return /* @__PURE__ */ React.createElement(LangCtx.Provider, { value: lang }, /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
      DemoReel,
      {
        lang,
        src: demoSrc,
        partner: demoPartner,
        allBeaches,
        imageMap,
        imageQ,
        mapForecastByBeach,
        sargData,
        island: island2,
        track,
        onClose: () => setShowDemo(false)
      }
    ))));
  }
  return /* @__PURE__ */ React.createElement(LangCtx.Provider, { value: lang }, (showVeilleurHero || showSplash || showArenaOnb) && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, showVeilleurHero && /* @__PURE__ */ React.createElement(VeilleurHero, { lang, onEnter: dismissVeilleurHero }), showSplash && /* @__PURE__ */ React.createElement(ArenaSplash, { lang, track, wordmark: _onbWordmark, onDone: () => setShowSplash(false) }), showArenaOnb && /* @__PURE__ */ React.createElement(ArenaOnboarding, { lang, track, region: _onbRegion, onDone: finishArenaOnb, onSkip: finishArenaOnb }))), showAttract && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    DemoReel,
    {
      lang,
      src: "interactive",
      partner: null,
      allBeaches,
      imageMap,
      imageQ,
      mapForecastByBeach,
      sargData,
      island: island2,
      track,
      onPick: (p) => {
        attractPickRef.current = p;
      },
      onEnterFunnel: (p) => {
        const pk = p || attractPickRef.current;
        setShowAttract(false);
        if (pk && pk.id) {
          const real = (allBeaches || []).find((x) => x && x.id === pk.id) || pk;
          onMapBeach(real);
        }
      },
      onClose: () => {
        setShowAttract(false);
        try {
          track("sg_attract_close", { src: "idle" });
        } catch (_) {
        }
      }
    }
  ))), /* @__PURE__ */ React.createElement(AbDebug, null), (() => {
    const _pn = (typeof getPathname === "function" ? getPathname() : typeof window !== "undefined" ? window.location.pathname : "/").replace(/\/+$/, "") || "/";
    const _isHome = _pn === "/" || _pn === "/index.html" || _pn === "";
    const _isPlages = _pn === "/plages" || _pn.startsWith("/plages/") || _pn.startsWith("/beaches") || _pn.startsWith("/playas");
    const _isPrev = _pn === "/previsions" || _pn.startsWith("/previsions/") || _pn.startsWith("/en/previsions") || _pn.startsWith("/es/previsions") || _pn.startsWith("/forecast") || _pn.startsWith("/pronostico");
    const _isFiab = _pn.startsWith("/fiabilite") || _pn.startsWith("/reliability") || _pn.startsWith("/fiabilidad");
    const _isCarte = _pn.startsWith("/carte-sargasses") || _pn.startsWith("/sargassum-map") || _pn.startsWith("/mapa-sargazo");
    const _hasDedicatedH1 = showHero2 || showPrevLanding2 || showCleanList || showAlertHub || showConditions || showStation;
    const _isListView = view === "list";
    if (_hasDedicatedH1) {
      const _txt = IS_NEW_REGION ? REGION.primaryLang === "es" ? `Sargazo en ${REGION.name} en vivo \u2014 mapa de playas hoy` : `${REGION.name} sargassum live \u2014 beach map today` : island2 === "mq" ? "Sargasses Martinique en temps r\xE9el \u2014 carte et plages aujourd'hui" : "Sargasses Guadeloupe en temps r\xE9el \u2014 carte et plages aujourd'hui";
      return /* @__PURE__ */ React.createElement("p", { style: { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" } }, _txt);
    }
    let _h1 = null;
    const _label = island2 === "gp" ? "Guadeloupe" : "Martinique";
    const _rName = typeof REGION !== "undefined" && REGION && REGION.name ? REGION.name : _label;
    if (_isPlages || _isHome && _isListView) {
      if (IS_NEW_REGION) {
        _h1 = lang === "es" ? `Todas las playas de ${_rName}` : `All beaches in ${_rName} \u2014 sargassum status today`;
      } else {
        _h1 = lang === "en" ? `All beaches in ${_label} \u2014 sargassum status today` : lang === "es" ? `Todas las playas de ${_label}` : `Toutes les plages de ${_label}`;
      }
    } else if (_isPrev) {
      if (IS_NEW_REGION) {
        _h1 = lang === "es" ? `Pron\xF3stico de sargazo ${_rName} \u2014 7 d\xEDas por playa` : `${_rName} Sargassum Forecast \u2014 7 days by beach`;
      } else {
        _h1 = "Pr\xE9visions sargasses Martinique et Guadeloupe \u2014 7 jours par plage";
      }
    } else if (_isFiab) {
      _h1 = lang === "en" ? "Our forecasts, verified" : lang === "es" ? "Nuestros pron\xF3sticos, verificados" : "Nos pr\xE9visions, v\xE9rifi\xE9es";
    } else if (_isCarte) {
      _h1 = IS_NEW_REGION ? lang === "es" ? `Mapa de sargazo ${_rName} hoy \u2014 tiempo real` : `Sargassum Map ${_rName} Today \u2014 Live` : `Carte des sargasses ${_label} aujourd'hui \u2014 temps r\xE9el et plages propres 2026`;
    } else if (_isHome) {
      if (IS_NEW_REGION) {
        _h1 = lang === "es" ? `Sargazo en ${_rName} hoy \u2014 mapa de playas en vivo` : `Sargassum ${_rName} today \u2014 live beach map`;
      } else {
        _h1 = lang === "en" ? `Sargassum ${_label} in real time \u2014 map and beaches today` : lang === "es" ? `Sargazo en ${_label} en tiempo real \u2014 mapa y playas hoy` : `Sargasses ${_label} en temps r\xE9el \u2014 carte et plages aujourd'hui`;
      }
    } else {
      if (IS_NEW_REGION) {
        _h1 = lang === "es" ? `Sargazo en ${_rName} hoy \u2014 mapa de playas en vivo` : `Sargassum ${_rName} today \u2014 live beach map`;
      } else {
        _h1 = `Sargasses ${_label} en temps r\xE9el \u2014 carte et plages aujourd'hui`;
      }
    }
    return /* @__PURE__ */ React.createElement("h1", { style: { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 } }, _h1);
  })(), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", contentVisibility: showAttract ? "hidden" : "visible" } }, showRecoveryBanner && /* @__PURE__ */ React.createElement("div", { ref: (el) => setBannerH(el ? el.offsetHeight : 0), style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1500,
    background: "linear-gradient(90deg,#120821 0%,#1a2f28 100%)",
    borderBottom: "1px solid rgba(232,168,0,.3)",
    padding: "10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
    paddingTop: "max(10px, calc(10px + env(safe-area-inset-top)))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#e6edf3",
    fontFamily: "inherit"
  } }, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.9, flex: "1 1 180px", minWidth: 0, textAlign: "center" } }, PAY_CAPTURE_ONLY ? _t(lang, "Tes 7 jours offerts t'attendent \u2014 juste ton email.", "Your 7 free days are waiting \u2014 just your email.", "Tus 7 d\xEDas gratis te esperan \u2014 solo tu email.") : SARGASSES_SEASON === "high" ? _t(lang, "Les plages bougent vite. Tu \xE9tais presque Premium \u2014 termine maintenant.", "Beaches are changing fast. You almost had Premium \u2014 finish now.", "Las playas cambian r\xE1pido. Casi ten\xEDas Premium \u2014 termina ahora.") : _t(lang, "Tu \xE9tais presque Premium\xA0! Reprends o\xF9 tu en \xE9tais.", "You were almost Premium! Pick up where you left off.", "\xA1Casi ten\xEDas Premium! Retoma donde te quedaste.")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    track("sg_checkout_recovery_click", { island: island2 });
    setShowRecoveryBanner(false);
    openPremium("recovery_banner");
  }, style: {
    background: "#E8A800",
    color: "#120821",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0
  } }, PAY_CAPTURE_ONLY ? _t(lang, "D\xE9bloquer 7 jours", "Unlock 7 days", "Desbloquear 7 d\xEDas") : _t(lang, "Passer Premium", "Go Premium", "Hazte Premium")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_checkout_recovery_dismiss", { island: island2 });
        setShowRecoveryBanner(false);
        localStorage.removeItem("sg_checkout_abandoned");
      },
      style: {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,.5)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        padding: "0 4px",
        flexShrink: 0
      },
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar")
    },
    "\xD7"
  )), showPassExpired && !showRecoveryBanner && !showHero2 && !showPremium2 && !showCaptureGate && !showWelcome && !selectedBeach && /* @__PURE__ */ React.createElement("div", { ref: (el) => setBannerH(el ? el.offsetHeight : 0), style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1500,
    background: "linear-gradient(90deg,#120821 0%,#1a2f28 100%)",
    borderBottom: "1px solid rgba(232,168,0,.3)",
    padding: "10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
    paddingTop: "max(10px, calc(10px + env(safe-area-inset-top)))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#e6edf3",
    fontFamily: "inherit"
  } }, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.9, flex: "1 1 180px", minWidth: 0, textAlign: "center" } }, _t(lang, "Ton acc\xE8s est termin\xE9 \u2014 le Veilleur peut reprendre sa veille.", "Your access has ended \u2014 the Watchman can resume his watch.", "Tu acceso termin\xF3 \u2014 el Vig\xEDa puede retomar su guardia.")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    track("sg_pass_expired_click", { island: island2 });
    try {
      localStorage.setItem("sg_pass_expired_seen", "1");
    } catch (_) {
    }
    setShowPassExpired(false);
    openPremium("pass_expired");
  }, style: {
    background: "#E8A800",
    color: "#120821",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    minHeight: 36
  } }, _t(lang, "Renouveler \u2192", "Renew \u2192", "Renovar \u2192")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        track("sg_pass_expired_dismiss", { island: island2 });
        try {
          localStorage.setItem("sg_pass_expired_seen", "1");
        } catch (_) {
        }
        setShowPassExpired(false);
      },
      style: {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,.5)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        padding: "0 4px",
        flexShrink: 0
      },
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar")
    },
    "\xD7"
  )), showPassRenew && !showPassExpired && !showRecoveryBanner && !showHero2 && !showPremium2 && !showCaptureGate && !showWelcome && !selectedBeach && (() => {
    const _d = _passRenewDays();
    return _d > 0 && /* @__PURE__ */ React.createElement("div", { ref: (el) => setBannerH(el ? el.offsetHeight : 0), style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1500,
      background: "linear-gradient(90deg,#120821 0%,#1a2f28 100%)",
      borderBottom: "1px solid rgba(232,168,0,.3)",
      padding: "10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))",
      paddingTop: "max(10px, calc(10px + env(safe-area-inset-top)))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      flexWrap: "wrap",
      fontSize: 13,
      color: "#e6edf3",
      fontFamily: "inherit"
    } }, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.9, flex: "1 1 180px", minWidth: 0, textAlign: "center" } }, _t(lang, `Encore ${_d} jour${_d > 1 ? "s" : ""} d'avance \u2014 prolonge et reste devant.`, `${_d} day${_d > 1 ? "s" : ""} of foresight left \u2014 renew and stay ahead.`, `Quedan ${_d} d\xEDa${_d > 1 ? "s" : ""} de ventaja \u2014 renueva y sigue por delante.`)), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      try {
        track("sg_pass_renew_click", { island: island2, days_left: _d });
      } catch (_) {
      }
      try {
        localStorage.setItem("sg_pass_renew_seen", "1");
      } catch (_) {
      }
      setShowPassRenew(false);
      openPremium("pass_renew");
    }, style: {
      background: "#E8A800",
      color: "#120821",
      border: "none",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "inherit",
      cursor: "pointer",
      whiteSpace: "nowrap",
      flexShrink: 0
    } }, _t(lang, "Renouveler", "Renew", "Renovar")), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          try {
            track("sg_pass_renew_dismiss", { island: island2 });
          } catch (_) {
          }
          try {
            localStorage.setItem("sg_pass_renew_seen", "1");
          } catch (_) {
          }
          setShowPassRenew(false);
        },
        style: {
          background: "none",
          border: "none",
          color: "rgba(255,255,255,.5)",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: "0 4px",
          flexShrink: 0
        },
        "aria-label": _t(lang, "Fermer", "Close", "Cerrar")
      },
      "\xD7"
    ));
  })(), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    opacity: view === "map" ? 1 : 0,
    transform: view === "map" ? "scale(1)" : "scale(1.03)",
    transformOrigin: "50% 42%",
    pointerEvents: view === "map" ? "auto" : "none",
    transition: "opacity .28s ease, transform .42s cubic-bezier(.34,1.56,.64,1)",
    background: "#0B2230"
  } }, showMapIntro && view === "map" && !showHero2 && !showPrevLanding2 && !showCleanList && !selectedBeach && !showPremium2 && filtered.length >= 3 && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    MapIntroStory,
    {
      lang,
      counts: { clean: filtered.filter((b) => b.status === "clean").length, watch: filtered.filter((b) => b.status === "moderate").length, avoid: filtered.filter((b) => b.status === "avoid").length, total: filtered.length },
      onEnterMap: () => {
        setShowMapIntro(false);
        try {
          localStorage.setItem("sg_map_intro_v1", "1");
        } catch (_) {
        }
      }
    }
  )))), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    opacity: view === "list" ? 1 : 0,
    transform: view === "list" ? "translateY(0)" : "translateY(14px)",
    pointerEvents: view === "list" ? "auto" : "none",
    transition: "opacity .28s ease, transform .42s cubic-bezier(.34,1.56,.64,1)",
    background: "#0B2230"
  } }, view === "list" && /* @__PURE__ */ React.createElement(
    BeachListView,
    {
      beaches: filtered,
      onBeachClick,
      favorites,
      lang,
      imageMap,
      sargData,
      onPremiumClick: openPremium,
      isPremium,
      userPos,
      onRequestGeo: requestGeo
    }
  )), showHero2 && dataReady && heroPick && (homeJuicy ? (
    /* BRAS A/B `home_juicy` — « Le tampon qui claque » (proto porté 2026-07-03).
       Additif, PRIORITAIRE quand ?home=1 (sinon injoignable derrière chasse=true
       par défaut) : control = Chasse/HomeAZ/GameFunnel/HeroVerdict, tous intacts. */
    /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
      LazyHomeJuicy,
      {
        beach: heroPick,
        lang,
        island: island2,
        sargData,
        pickBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null).sort((a, b) => (b.score || 0) - (a.score || 0)),
        track,
        onOpen: () => {
          dismissHero("home_juicy_cta");
          setSelectedBeach(heroPick);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: heroPick.id, status: heroPick.status, source: "home_juicy" });
        },
        onOpenBeach: (b) => {
          dismissHero("home_juicy_card");
          setSelectedBeach(b);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: b.id, status: b.status, source: "home_juicy_grid" });
        },
        onPremium: (src) => {
          dismissHero("home_juicy_premium");
          openPremium(src || "home_juicy");
        },
        onShowMap: () => {
          dismissHero("home_juicy_map");
          fireWipe(_t(lang, "Chaque pastille = la mesure du matin", "Every dot = this morning's measurement", "Cada punto = la medici\xF3n de la ma\xF1ana"));
        },
        onReliability: () => {
          try {
            const rp = lang === "en" ? "/reliability/" : lang === "es" ? "/fiabilidad/" : "/fiabilite/";
            window.location.href = rp;
          } catch (_) {
          }
        },
        exiting: heroExiting
      }
    )))
  ) : chasse ? (
    /* BRAS A/B `arena_loop` — accueil « LA CHASSE » (boucle de jeu TCG).
       Additif : control = HomeAZ/GameFunnel/HeroVerdict, intact. ?chasse=1/0. */
    /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
      LazyChasse,
      {
        beach: heroPick,
        lang,
        island: island2,
        sargData,
        userPos,
        isPremium,
        captureMode: PAY_CAPTURE_ONLY,
        favorites,
        onToggleFav: toggleFav,
        onOpenPro: () => {
          try {
            track("sg_b2b_open", { source: "space" });
          } catch (_) {
          }
          ;
          proB2BSrc.current = "space";
          setShowProB2B(true);
        },
        pickBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null).sort((a, b) => (b.score || 0) - (a.score || 0)),
        track,
        onOpen: () => {
          dismissHero("chasse_cta");
          setSelectedBeach(heroPick);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: heroPick.id, status: heroPick.status, source: "chasse" });
        },
        onOpenBeach: (b) => {
          dismissHero("chasse_card");
          setSelectedBeach(b);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: b.id, status: b.status, source: "chasse_coll" });
        },
        onPremium: (src) => {
          dismissHero("chasse_premium");
          openPremium(src || "chasse");
        },
        onCaptureEmail: (em) => {
          try {
            submitLead(em, "chasse");
          } catch (_) {
          }
        },
        onShowMap: () => {
          dismissHero("chasse_map");
          fireWipe(_t(lang, "Chaque pastille = la mesure du matin", "Every dot = this morning's measurement", "Cada punto = la medici\xF3n de la ma\xF1ana"));
        },
        exiting: heroExiting
      }
    )))
  ) : homeAZ ? (
    /* BRAS A/B `home_az` — accueil A→Z (design validé, Shadow DOM).
       Additif : control = GameFunnel/HeroVerdict, intact. ?home_az=1/0. */
    /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
      LazyHomeAZ,
      {
        beach: heroPick,
        lang,
        island: island2,
        sargData,
        userPos,
        topBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null && imageMap?.[b.id] && !String(imageMap[b.id]).startsWith("sat-")).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).map((b) => ({ ...b, _img: "/beaches/" + imageMap[b.id] })),
        track,
        onOpen: () => {
          dismissHero("home_az_cta");
          setSelectedBeach(heroPick);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: heroPick.id, status: heroPick.status, source: "home_az" });
        },
        onOpenBeach: (b) => {
          dismissHero("home_az_card");
          setSelectedBeach(b);
          fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
          track("sg_beach_open", { beach_id: b.id, status: b.status, source: "home_az_top3" });
        },
        onPremium: (src) => {
          dismissHero("home_az_premium");
          openPremium(src || "landing");
        },
        onShowMap: () => {
          dismissHero("home_az_map");
          fireWipe(_t(lang, "Chaque pastille = la mesure du matin", "Every dot = this morning's measurement", "Cada punto = la medici\xF3n de la ma\xF1ana"));
        },
        exiting: heroExiting
      }
    )))
  ) : landingFunnel === "game" ? /* @__PURE__ */ React.createElement(
    GameFunnel,
    {
      beach: heroPick,
      lang,
      island: island2,
      sargData,
      userPos,
      pickBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null).sort((a, b) => (b.score || 0) - (a.score || 0)),
      onOpenBeach: (b) => {
        dismissHero("funnel_pick");
        setSelectedBeach(b);
        fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "funnel" });
      },
      onShowMap: () => {
        dismissHero("funnel_skip");
        fireWipe(_t(lang, "Chaque pastille = la mesure du matin", "Every dot = this morning's measurement", "Cada punto = la medici\xF3n de la ma\xF1ana"));
      },
      onFav: (b) => toggleFav(b.id),
      onPremium: (src) => {
        dismissHero("funnel");
        openPremium(src || "funnel_alert");
      },
      exiting: heroExiting
    }
  ) : /* @__PURE__ */ React.createElement(
    HeroVerdict,
    {
      beach: heroPick,
      lang,
      island: island2,
      sargData,
      userPos,
      topBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null && imageMap?.[b.id] && !String(imageMap[b.id]).startsWith("sat-")).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).map((b) => ({ ...b, _img: "/beaches/" + imageMap[b.id] })),
      pickBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null).sort((a, b) => (b.score || 0) - (a.score || 0)),
      onOpen: () => {
        dismissHero("cta");
        setSelectedBeach(heroPick);
        fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
        track("sg_beach_open", { beach_id: heroPick.id, status: heroPick.status, source: "hero" });
      },
      onOpenBeach: (b) => {
        dismissHero("landing_card");
        setSelectedBeach(b);
        fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "landing_top3" });
      },
      onPremium: () => {
        dismissHero("premium");
        openPremium("landing");
      },
      onShowMap: () => {
        dismissHero("map");
        fireWipe(_t(lang, "Chaque pastille = la mesure du matin", "Every dot = this morning's measurement", "Cada punto = la medici\xF3n de la ma\xF1ana"));
      },
      exiting: heroExiting
    }
  )), showPrevLanding2 && prevHeroPick && sargData?.weekly && /* @__PURE__ */ React.createElement(
    ForecastLanding,
    {
      beach: prevHeroPick,
      lang,
      island: island2,
      sargData,
      isPremium,
      onPremium: (src) => openPremium(src || "previsions_landing"),
      onOpenBeach: (b) => {
        dismissPrevLanding("beach");
        setSelectedBeach(b);
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "previsions" });
      },
      onShowMap: () => dismissPrevLanding("map"),
      trackFn: track,
      exiting: prevExiting
    }
  ), showCleanList && allBeaches?.length >= 1 && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyCleanList,
    {
      lang,
      sargData,
      cleanBeaches: rankBeaches(allBeaches, island2, userPos, sargData, communityReports).filter((b) => b.status === "clean").slice(0, 8),
      userPos,
      track,
      onOpenBeach: (b) => {
        dismissCleanList("beach");
        setSelectedBeach(b);
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "clean_list" });
      },
      onShowMap: () => dismissCleanList("map")
    }
  ))), showConditions && allBeaches?.length >= 1 && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyConditions,
    {
      lang,
      sargData,
      allBeaches,
      beachesWeather,
      userPos,
      onOpenBeach: (b) => {
        dismissConditions("beach");
        setSelectedBeach(b);
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "conditions" });
      },
      onShowMap: () => dismissConditions("map"),
      onPremium: (src) => openPremium(src || "conditions"),
      track
    }
  ))), showAlertHub && allBeaches?.length >= 1 && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 1006, overflowY: "auto", overflowX: "hidden", background: "#120821" } }, /* @__PURE__ */ React.createElement(
    AlertHub,
    {
      lang,
      island: island2,
      beach: heroPick,
      onPremium: (src) => openPremium(src || "alertes"),
      onShowMap: () => {
        setShowAlertHub(false);
        track("sg_alerts_to_map", {});
      },
      onClose: () => {
        setShowAlertHub(false);
        track("sg_alerts_close", {});
      },
      onEnableAlerts: () => ensurePushAlerts("alertes_hub")
    }
  )), wipe && /* @__PURE__ */ React.createElement(SceneWipe, { label: wipe, onDone: () => setWipe(null) }), showExitCap && !showHero2 && !showPrevLanding2 && !selectedBeach && !showPremium2 && view === "map" && exitcapPick && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    bottom: "calc(170px + env(safe-area-inset-bottom, 0px))",
    left: 0,
    right: 0,
    zIndex: 1090,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    padding: "0 16px"
  } }, /* @__PURE__ */ React.createElement(
    ExitEmailBand,
    {
      lang,
      pick: exitcapPick,
      onClose: () => {
        setShowExitCap(false);
        s("sg_exitcap_snooze", Date.now() + 12096e5);
        track("sg_exitcap_dismiss", {});
      }
    }
  )), showExitVeilleur && !showHero2 && !showPrevLanding2 && !selectedBeach && !showPremium2 && view === "map" && exitcapPick && /* @__PURE__ */ React.createElement(
    ExitVeilleurCard,
    {
      lang,
      pick: exitcapPick,
      forecast: exitcapForecast,
      trigger: "exit",
      onClose: (reason) => {
        setShowExitVeilleur(false);
        if (reason !== "submitted") {
          s("sg_exitcap_snooze", Date.now() + 12096e5);
          track("sg_exitcap_dismiss", {});
        }
      }
    }
  ), showGameFull && !showHero2 && !showPrevLanding2 && !selectedBeach && !showPremium2 && view === "map" && /* @__PURE__ */ React.createElement("div", { ref: gameSwipe.ref, style: { position: "fixed", inset: 0, zIndex: 1099, background: "#0d2230", animation: "fadeIn .25s ease both" } }, /* @__PURE__ */ React.createElement(
    "iframe",
    {
      src: "/jeu/?utm_source=app&utm_medium=afk",
      title: "SargaCatch",
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", display: "block" }
    }
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      onTouchStart: gameSwipe.onTouchStart,
      onTouchMove: gameSwipe.onTouchMove,
      onTouchEnd: gameSwipe.onTouchEnd,
      onClick: () => {
        setShowGameFull(false);
        track("sg_game_full_close", { from: "handle" });
      },
      role: "button",
      "aria-label": _t(lang, "Fermer le jeu", "Close game", "Cerrar juego"),
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "calc(34px + env(safe-area-inset-top))",
        zIndex: 1101,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 6,
        background: "linear-gradient(180deg,rgba(10,23,20,.55),rgba(10,23,20,0))",
        touchAction: "none",
        cursor: "pointer"
      }
    },
    /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { width: 46, height: 5, borderRadius: 3, background: "rgba(255,255,255,.55)" } })
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowGameFull(false);
        track("sg_game_full_close", {});
      },
      "aria-label": _t(lang, "Fermer le jeu", "Close game", "Cerrar juego"),
      style: {
        position: "fixed",
        top: "calc(10px + env(safe-area-inset-top))",
        right: 12,
        zIndex: 1101,
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: "rgba(10,23,20,.72)",
        border: "1px solid rgba(255,255,255,.35)",
        color: "#fff",
        fontSize: 20,
        lineHeight: 1,
        cursor: "pointer",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)"
      }
    },
    "\xD7"
  )), showGameToast && !showHero2 && !showPrevLanding2 && !selectedBeach && !showPremium2 && view === "map" && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    bottom: "calc(170px + env(safe-area-inset-bottom, 0px))",
    left: 0,
    right: 0,
    zIndex: 1090,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    padding: "0 16px"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(10,23,20,.94)",
    border: "1px solid rgba(255,199,44,.4)",
    borderRadius: 16,
    padding: "10px 14px",
    maxWidth: 380,
    boxShadow: "0 8px 24px rgba(0,0,0,.45)",
    animation: "slideUp .35s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20 } }, "\u{1F30A}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 12.5, color: "#fff", lineHeight: 1.35 } }, /* @__PURE__ */ React.createElement("b", null, _t(lang, "30 secondes \xE0 tuer ?", "Got 30 seconds?", "\xBFTienes 30 segundos?")), /* @__PURE__ */ React.createElement("br", null), _t(lang, "Sauve la plage \u2014 bats le score du jour", "Save the beach \u2014 beat today's score", "Salva la playa \u2014 supera el r\xE9cord de hoy")), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "/jeu/?utm_source=app&utm_medium=toast",
      onClick: () => track("sg_game_toast_click", {}),
      style: {
        background: "#FFC72C",
        color: "#120821",
        fontWeight: 800,
        fontSize: 12.5,
        padding: "9px 13px",
        borderRadius: 10,
        textDecoration: "none",
        whiteSpace: "nowrap"
      }
    },
    _t(lang, "Jouer", "Play", "Jugar")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowGameToast(false);
        track("sg_game_toast_dismiss", {});
      },
      "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
      style: {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,.5)",
        fontSize: 17,
        lineHeight: 1,
        cursor: "pointer",
        padding: "0 2px"
      }
    },
    "\xD7"
  ))), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 700,
    padding: `${showRecoveryBanner || showPassExpired ? (bannerH || 96) + 8 + "px" : "calc(max(12px, env(safe-area-inset-top)) + " + (showPushPrimer ? 58 : 0) + "px)"} 16px 0`,
    pointerEvents: "none",
    transition: "padding-top .25s ease",
    display: showPremium2 ? "none" : void 0
  } }, /* @__PURE__ */ React.createElement("div", { className: "sg-header-chrome", style: { maxWidth: 460, margin: "0 auto", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("style", null, `.sg-header-chrome .sg-header-row{pointer-events:none}.sg-header-chrome .sg-header-row > *{pointer-events:auto}`), /* @__PURE__ */ React.createElement(
    Header,
    {
      island: island2,
      onIslandChange: (id) => {
        setIsland(id);
        setSelectedBeach(null);
      },
      lang,
      onLangToggle: toggleLang,
      theme,
      onThemeToggle: toggleTheme,
      beachCount: allBeaches.length,
      dataSource,
      updatedAt: sargData?.updatedAt || sargData?.erddapTimestamp,
      stale: sargData?.stale,
      onHome: () => {
        setSelectedBeach(null);
        if (HOMEFIX_OFF) {
          try {
            sessionStorage.removeItem("sg_hero_seen");
          } catch (_) {
          }
          setShowHero(true);
        }
        track("sg_landing_replay", {});
      },
      isPremium,
      onAccess: () => {
        if (!ACCOUNT_OFF) {
          openAccount("header");
          return;
        }
        if (isPremium) {
          let until = "";
          try {
            const pe = parseInt(localStorage.getItem("sg_premium_pass_end") || "0", 10);
            if (pe && pe > Date.now()) until = new Date(pe).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
          } catch (_) {
          }
          try {
            sgToast({ tone: "success", title: _t(lang, "Pass actif", "Pass active", "Pase activo"), msg: until ? _t(lang, "Actif jusqu'au " + until, "Active until " + until, "Activo hasta el " + until) : _t(lang, "Premium actif sur cet appareil.", "Premium active on this device.", "Premium activo en este dispositivo.") });
          } catch (_) {
          }
          try {
            track("sg_access_status_view", { has_end: !!until });
          } catch (_) {
          }
        } else {
          try {
            track("sg_access_check_open", { src: "header" });
          } catch (_) {
          }
          openAccessCheck("header");
        }
      },
      onEnableNotif: () => forceEnablePush("header"),
      alertsOn,
      onToggleAlerts: toggleAlerts
    }
  ))), view === "map" && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 700,
    bottom: `calc(${SGNAV_OFF ? 90 : 128}px + max(12px, env(safe-area-inset-bottom,0px)) + 8px)`,
    padding: "0 16px",
    pointerEvents: "none",
    maxHeight: "calc(100vh - 140px)"
  } }, /* @__PURE__ */ React.createElement("div", { className: "sg-map-chrome", style: {
    maxWidth: 460,
    margin: "0 auto",
    pointerEvents: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8
  } }, /* @__PURE__ */ React.createElement("style", null, `.sg-map-chrome > *{pointer-events:auto}`), search.trim().length >= 2 && filtered.length > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    background: "var(--sg-card,#fff)",
    borderRadius: 14,
    boxShadow: "0 12px 32px rgba(0,0,0,.18)",
    border: "1px solid var(--sg-border,rgba(0,0,0,.06))",
    maxHeight: "min(280px,40vh)",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain"
  } }, filtered.slice(0, 8).map((b) => {
    const st = ST[b.status] || ST._loading;
    return /* @__PURE__ */ React.createElement("button", { key: b.id, onClick: () => {
      setSearch("");
      onBeachClick(b);
    }, style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      background: "none",
      border: "none",
      borderBottom: "1px solid var(--sg-border,rgba(0,0,0,.04))",
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      width: "100%"
    } }, /* @__PURE__ */ React.createElement("div", { style: { width: 8, height: 8, borderRadius: 4, background: st.c, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 13,
      fontWeight: 600,
      color: "var(--sg-ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    } }, b.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)" } }, b.commune)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: st.c } }, lang === "es" ? st.les : lang === "en" ? st.le : st.l));
  })), /* @__PURE__ */ React.createElement(SearchBar, { value: search, onChange: setSearch, lang }))), showPushPrimer && cookieConsent2 !== null && /* @__PURE__ */ React.createElement(PushPrimer, { lang, onAccept: onPushPrimerAccept, onDismiss: onPushPrimerDismiss }), nextSuggestion && !selectedBeach && view === "map" && /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "calc(90px + max(12px, env(safe-area-inset-bottom,0px)) + 8px)",
    left: "max(12px, 3vw)",
    right: "max(12px, 3vw)",
    zIndex: 710,
    maxWidth: 480,
    margin: "0 auto",
    animation: "slideUp .35s cubic-bezier(.22,1,.36,1)"
  } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    track("sg_next_suggest_click", { beach_id: nextSuggestion.beach.id });
    const b = nextSuggestion.beach;
    setNextSuggestion(null);
    onBeachClick(b);
  }, style: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: "var(--sg-card,#fff)",
    borderRadius: 16,
    width: "100%",
    border: "1.5px solid rgba(34,197,94,.25)",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(0,0,0,.10)",
    fontFamily: "inherit",
    textAlign: "left"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 10,
    height: 10,
    borderRadius: 5,
    background: C.green,
    flexShrink: 0,
    animation: "dot-pulse 2s ease-in-out 1 both"
  } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--sg-ink)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  } }, nextSuggestion.beach.name, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500, color: C.green, marginLeft: 6 } }, _t(lang, "est propre", "is clean", "est\xE1 limpia"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--sg-mid,#5A5A5A)", marginTop: 1 } }, nextSuggestion.dist, " km ", _t(lang, "d'ici", "away", "de aqu\xED"))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: C.green, flexShrink: 0 } }, _t(lang, "Voir", "View", "Ver"))), /* @__PURE__ */ React.createElement("button", { onClick: () => setNextSuggestion(null), style: {
    position: "absolute",
    top: -8,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    background: "var(--sg-card,#fff)",
    border: "1px solid var(--sg-border)",
    cursor: "pointer",
    fontSize: 12,
    color: "var(--sg-mid)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.08)"
  } }, "\u2715")), !SGNAV_OFF && view !== "premium" && !selectedBeach && !showPremium2 && !showCaptureGate && !showHero2 && !showPrevLanding2 && /* @__PURE__ */ React.createElement(
    BottomNav,
    {
      view: view === "list" ? "list" : "map",
      lang,
      premiumOpen: showPremium2,
      isPremium,
      onChangeView: (id) => {
        if (id === "map") {
          setSelectedBeach(null);
          setComicBeach(null);
          setView("map");
          setShowArchipel(true);
          setShowVerticals(false);
          setShowChat(false);
          setShowVeille(false);
          track("sg_nav_tab", { tab: "map" });
        } else if (id === "list") {
          setSelectedBeach(null);
          setComicBeach(null);
          setView("list");
          setShowArchipel(false);
          setShowVerticals(false);
          setShowChat(false);
          setShowVeille(false);
          track("sg_nav_tab", { tab: "list" });
        } else if (id === "premium") {
          openPremium("bottom_nav");
          track("sg_nav_tab", { tab: "premium" });
        }
      }
    }
  ), selectedBeach && (() => {
    const _sid = IS_NEW_REGION ? selectedBeach.id : BEACH_TO_SARG[selectedBeach.id];
    const _fc = _sid && sargData?.weekly?.[_sid]?.forecast || sargData?._enrichedWeekly?.[`_interp_${selectedBeach.id}`]?.forecast || null;
    const _fallback = /* @__PURE__ */ React.createElement(
      BeachSheet,
      {
        beach: selectedBeach,
        onClose: closeSheet,
        favorites,
        onToggleFav: toggleFav,
        lang,
        allBeaches,
        imageMap,
        onBeachClick,
        onPremiumClick: openPremium,
        isPremium,
        historyData,
        sargData,
        dataSource,
        userPos,
        communityReports,
        fbPosts,
        onRequestGeo: requestGeo,
        forecast: _fc
      }
    );
    return /* @__PURE__ */ React.createElement(ErrBound, { key: selectedBeach.id, fallback: _fallback }, /* @__PURE__ */ React.createElement(
      BeachSheetComic,
      {
        beach: selectedBeach,
        onClose: closeSheet,
        favorites,
        onToggleFav: toggleFav,
        lang,
        allBeaches,
        onBeachClick,
        onPremiumClick: openPremium,
        isPremium,
        sargData,
        userPos,
        forecast: _fc,
        track,
        communityReports,
        onRequestGeo: requestGeo,
        onEnsureAlerts: () => ensurePushAlerts("beach_sheet")
      }
    ));
  })(), !isPremium && !showPremium2 && !showCaptureGate && function() {
    try {
      const views = parseInt(sessionStorage.getItem("sg_beach_views") || "0", 10);
      const dismissed = sessionStorage.getItem("sg_paywall_3view_dismissed");
      const resetAt = parseInt(sessionStorage.getItem("sg_paywall_3view_reset") || "0", 10);
      const now = Date.now();
      if (resetAt && now > resetAt) {
        sessionStorage.removeItem("sg_paywall_3view_dismissed");
        sessionStorage.removeItem("sg_paywall_3view_reset");
      }
      if (views >= 3 && !dismissed) {
        return /* @__PURE__ */ React.createElement(Paywall3ViewOverlay, { lang, openPremium, track });
      }
    } catch (_) {
      return null;
    }
  }(), _t(lang, "Peut-\xEAtre plus tard", "Maybe later", "Quiz\xE1s m\xE1s tarde"), showCaptureGate && /* @__PURE__ */ React.createElement(
    CaptureGateModal,
    {
      lang,
      beach: selectedBeach || null,
      onSubmit: (em) => {
        try {
          localStorage.setItem("sg_email", em);
          localStorage.setItem("sg_email_prompt", "true");
        } catch (_) {
        }
        submitLead(em, "capture-gate");
        track("sg_capture_gate_submit", { src: captureGateSrc, variant: "gate" });
        if (PAY_CAPTURE_ONLY) {
          try {
            localStorage.setItem("sg_premium_pass_end", String(Date.now() + 7 * 864e5));
          } catch (_) {
          }
          try {
            track("sg_gap_freemium_unlock", { source: "capture_gate" });
          } catch (_) {
          }
          setIsPremium(true);
          setShowCaptureGate(false);
          setShowWelcome(true);
        }
      },
      onPay: PAY_CAPTURE_ONLY ? void 0 : () => {
        setShowCaptureGate(false);
        track("sg_capture_gate_pay", { src: captureGateSrc });
        setPremiumSource("gate_cb");
        setShowPremium(true);
        track("sg_premium_modal_open", { source: "gate_cb", pw_style: abVariant("pw_style", ["world", "comic"]) });
      },
      onClose: () => {
        setShowCaptureGate(false);
        track("sg_capture_gate_dismiss", { src: captureGateSrc });
      }
    }
  ), showPremium2 && /* @__PURE__ */ React.createElement("div", { className: pwEntering ? "sg-pwenter" : void 0, style: { display: "contents" } }, /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    PremiumModal,
    {
      onClose: () => {
        setShowPremium(false);
        try {
          if (/[?&]exitnudge=0/.test(window.location.search)) return;
          if (localStorage.getItem("sg_premium") === "1") return;
          const pe = parseInt(localStorage.getItem("sg_premium_pass_end") || "0", 10);
          if (pe && pe > Date.now()) return;
          if (sessionStorage.getItem("sg_exitnudge_shown")) return;
          sessionStorage.setItem("sg_exitnudge_shown", "1");
          track("sg_exit_nudge_view", { source: premiumSource || "unknown" });
          setTimeout(() => {
            sgToast({
              tone: "info",
              title: _t(lang, "Ton pass t'attend", "Your pass is waiting", "Tu pase te espera"),
              msg: _t(lang, "Pic sargasses en cours \u2014 un jour sans pr\xE9vision peut g\xE2cher ta plage.", "Sargassum peak is here \u2014 one day without forecast can ruin your beach day.", "Pico de sargazo en curso \u2014 un d\xEDa sin pron\xF3stico puede arruinar tu playa."),
              duration: 9e3,
              action: { label: _t(lang, "Voir les pass \u2192", "See passes \u2192", "Ver pases \u2192"), onClick: () => {
                try {
                  track("sg_exit_nudge_click", { source: premiumSource || "unknown" });
                } catch (_) {
                }
                ;
                openPremium("exit_nudge");
              } }
            });
          }, 450);
        } catch (_) {
        }
      },
      lang,
      source: premiumSource,
      pwVariant: abVariant("pw_style", ["world", "comic"]),
      onActivated: () => {
        setIsPremium(true);
        setShowWelcome(true);
      },
      sargData,
      island: island2,
      beach: selectedBeach || null
    }
  )))), showProB2B && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(B2BModal, { lang, sargData, island: island2, beach: selectedBeach || null, source: proB2BSrc.current, onClose: () => setShowProB2B(false) }))), showAccount && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyAccountSheet,
    {
      lang,
      isPremium,
      onClose: () => setShowAccount(false),
      alertsOn,
      onToggleAlerts: () => toggleAlerts("account"),
      onEnableNotif: () => forceEnablePush("account"),
      onRestore: () => {
        setShowAccount(false);
        openAccessCheck("account");
      },
      onManage: () => {
        setShowAccount(false);
        openAccessCheck("account");
      },
      onUpgrade: () => {
        setShowAccount(false);
        openPremium("account");
      },
      supportEmail: SUPPORT_EMAIL,
      track
    }
  ))), whatsNew && !showHero2 && !showPrevLanding2 && !showPremium2 && !showCaptureGate && !showWelcome && !selectedBeach && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    WhatsNewJournal,
    {
      lang,
      title: whatsNew.title,
      items: whatsNew.items,
      releaseV: whatsNew.v,
      releaseDate: whatsNew.date,
      allowDeepLinks: !IS_NEW_REGION,
      isPremium,
      mood: (() => {
        const [, clean, , avoid] = filterCounts;
        return avoid > 0 ? avoid >= 2 ? "alerte" : "vigilant" : clean > 0 ? "serein" : "scan";
      })(),
      onClose: () => {
        try {
          s("sg_rel_seen", whatsNew.v);
        } catch (_) {
        }
        ;
        track("sg_whatsnew_dismiss", { v: whatsNew.v });
        setWhatsNew(null);
      },
      onExplore: () => {
        try {
          s("sg_rel_seen", whatsNew.v);
        } catch (_) {
        }
        ;
        track("sg_whatsnew_cta", { v: whatsNew.v });
        setWhatsNew(null);
        setShowPremium(false);
        setView("map");
        if (myBeach) onBeachClick(myBeach);
      },
      onPremium: () => {
        try {
          s("sg_rel_seen", whatsNew.v);
        } catch (_) {
        }
        ;
        track("sg_whatsnew_premium", { v: whatsNew.v });
        setWhatsNew(null);
        openPremium("whatsnew");
      }
    }
  ))), (() => {
    const feedbackDone = g("sg_feedback_done", false);
    const visits = g("sg_visits", 0);
    const pwaShown = g("sg_pwa_prompt", 0);
    const feedback = !feedbackDone && visits >= 3;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, feedback && /* @__PURE__ */ React.createElement(FeedbackWidget, null), /* @__PURE__ */ React.createElement(InstallPrompt, { canAutoShow: !feedback && !pwaShown }));
  })(), /* @__PURE__ */ React.createElement(FavToast, { show: showFavToast, lang, onPremiumClick: openPremium, isPremium }), diveBeach && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(DiveTransition, { beach: diveBeach, lang, onDone: () => setDiveBeach(null) }))), !showHero2 && !showPrevLanding2 && !showPremium2 && !showChat && cookieConsent2 !== null && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowChat(true);
        track("sg_chat_open", {});
      },
      "aria-label": _t(lang, "Demander au Veilleur", "Ask the Watchman", "Preguntar al Vig\xEDa"),
      className: "sg-fab",
      style: {
        position: "fixed",
        right: 14,
        bottom: "calc(96px + env(safe-area-inset-bottom))",
        zIndex: 960,
        width: 46,
        height: 46,
        borderRadius: "50%",
        background: "#190c2c",
        border: "2.5px solid #0d0b14",
        cursor: "pointer",
        boxShadow: "2px 2px 0 #0d0b14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "9.2", y: "9.2", width: "5.6", height: "5.6", rx: "1.4", fill: "#FFC72C", stroke: "#FDFCF7", strokeWidth: "1.3" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.1", fill: "#0A1714" }), /* @__PURE__ */ React.createElement("path", { d: "M9.2 11 4.5 8.2M14.8 11 19.5 8.2", stroke: "#FFC72C", strokeWidth: "1.6", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "6.4", width: "3", height: "3.4", rx: ".7", fill: "#1EC8B0", stroke: "#FDFCF7", strokeWidth: "1.1" }), /* @__PURE__ */ React.createElement("rect", { x: "18", y: "6.4", width: "3", height: "3.4", rx: ".7", fill: "#1EC8B0", stroke: "#FDFCF7", strokeWidth: "1.1" }), /* @__PURE__ */ React.createElement("path", { d: "M8 18 Q12 16 16 18", stroke: "#1EC8B0", strokeWidth: "1.6", fill: "none", strokeLinecap: "round" }))
  ), showChat && cookieConsent2 !== null && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    SargaChat,
    {
      lang,
      allBeaches,
      island: island2,
      sargData,
      onOpenBeach: onBeachClick,
      onPremium: () => openPremium("chat"),
      onClose: () => {
        setShowChat(false);
        setFrustrationContext(null);
      },
      frustrationContext
    }
  ))), showB2BChat2 && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(SargaChatB2B, { onClose: () => setShowB2BChat2(false), lang }))), showStation && stationSlug && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    StationStory,
    {
      slug: stationSlug,
      lang,
      onExit: () => {
        setShowStation(false);
        track("sg_station_exit", { slug: stationSlug });
      },
      onCTA: () => {
        track("sg_station_cta", { slug: stationSlug });
        setShowStation(false);
        if (stationSlug.includes("h2s")) {
          openPremium("station_h2s");
        } else {
          setView("map");
        }
      }
    }
  ))), !showHero2 && !showPrevLanding2 && !showPremium2 && !showChat && !showArchipel && !selectedBeach && view === "map" && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowArchipel(true);
        track("sg_archipel_open", { from: "fab" });
      },
      "aria-label": _t(lang, "L'archipel du Veilleur", "The Watcher's archipelago", "El archipi\xE9lago"),
      className: "sg-fab",
      style: {
        position: "fixed",
        right: 14,
        bottom: "calc(150px + env(safe-area-inset-bottom))",
        zIndex: 960,
        width: 46,
        height: 46,
        borderRadius: "50%",
        background: "#190c2c",
        border: "2.5px solid #0d0b14",
        cursor: "pointer",
        boxShadow: "2px 2px 0 #0d0b14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "viewFadeIn .35s cubic-bezier(.22,1,.36,1) both"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "#1EC8B0", strokeWidth: "1.7" }), /* @__PURE__ */ React.createElement("path", { d: "M15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5z", fill: "#FFC72C", stroke: "#FDFCF7", strokeWidth: "1.3", strokeLinejoin: "round" }))
  ), showVerticals && /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyVerticalesMap,
    {
      lang,
      track,
      onClose: () => setShowVerticals(false),
      onSeeMyBeach: () => {
        setShowVerticals(false);
        setView("map");
        if (myBeach) onBeachClick(myBeach);
      },
      onOpenPro: (src) => {
        setShowVerticals(false);
        try {
          track("sg_b2b_open", { source: src || "verticales" });
        } catch (_) {
        }
        ;
        proB2BSrc.current = src || "verticales";
        setShowProB2B(true);
      },
      onWaitlist: (em, tid) => {
        try {
          submitLead(em, "verticales_" + (tid || "prisme"));
        } catch (_) {
        }
      }
    }
  ))), showBrief && !BRIEF_OFF && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyBriefMatin,
    {
      lang,
      data: briefData,
      track,
      onClose: () => setShowBrief(false),
      onPremium: (src) => {
        setShowBrief(false);
        openPremium(src || "brief_morning");
      },
      onReliability: () => {
        try {
          const rp = lang === "en" ? "/reliability/" : lang === "es" ? "/fiabilidad/" : "/fiabilite/";
          window.location.href = rp;
        } catch (_) {
        }
      }
    }
  ))), showVeille && !VEILLE_OFF && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
    LazyVeilleurRepond,
    {
      lang,
      allBeaches: (allBeaches || []).filter((b) => (IS_NEW_REGION || b.island === island2) && b.status && b.score != null),
      track,
      onClose: () => setShowVeille(false),
      onOpenBeach: (b) => {
        setShowVeille(false);
        setSelectedBeach(b);
        fireWipe(_t(lang, "Score 0-100 \xB7 mis \xE0 jour 4\xD7/jour", "0-100 score \xB7 updated 4\xD7/day", "Score 0-100 \xB7 actualizado 4\xD7/d\xEDa"));
        track("sg_beach_open", { beach_id: b.id, status: b.status, source: "veille" });
      },
      onPremium: (src, ctx) => {
        setShowVeille(false);
        if (ctx && ctx.beach) {
          setSelectedBeach(ctx.beach);
        }
        ;
        openPremium(src || "veille");
      },
      onShowMap: () => {
        setShowVeille(false);
      }
    }
  ))), !premapCoverOff && !premapDone && navWorld && view === "map" && !showArchipel && !showHero2 && !showMapIntro && !showPrevLanding2 && !showCleanList && !showAlertHub && !selectedBeach && !showPremium2 && !showStation && (homeVidOff ? /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "fixed", inset: 0, zIndex: 1019, background: "#0d1117", pointerEvents: "none" } }) : /* @__PURE__ */ React.createElement(MapIntroVideo, null)), showArchipel && (view3d ? /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "fixed", inset: 0, zIndex: 1020, background: "#0a1620" } }) }, /* @__PURE__ */ React.createElement(
    LazyWorldView3D,
    {
      beaches: allBeaches,
      lang,
      updatedAt: sargData?.erddapTimestamp || sargData?.updatedAt || null,
      onBeachClick: onMapBeach,
      onPremium: () => openPremium("view3d"),
      isPremium,
      track,
      onClose: () => {
        setShowArchipel(false);
        track("sg_archipel_close", { source: "view3d" });
      }
    }
  ))) : mapWorld === "world" ? /* @__PURE__ */ React.createElement(ErrBound, null, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "fixed", inset: 0, zIndex: 1020, background: "#0d1117" } }) }, /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    AroundMeController,
    {
      beaches: allBeaches,
      region: IS_NEW_REGION ? REGION : null,
      island: island2,
      lang,
      onOpenBeach: onMapBeach,
      track,
      isPremium,
      locked: !isPremium,
      openPremium
    }
  ), /* @__PURE__ */ React.createElement(
    LazyWorldMapView,
    {
      beaches: allBeaches,
      island: island2,
      updatedAt: sargData?.erddapTimestamp || sargData?.updatedAt || null,
      stale: sargData?.stale || false,
      lang,
      onOpenBeach: onMapBeach,
      onPremium: openPremium,
      isPremium,
      rootMode: navWorld,
      track,
      initialZone,
      warm: mapWarm === "warm",
      dataReady,
      arrivals: mapArrivals,
      forecastByBeach: mapForecastByBeach,
      onCaptureEmail: (em) => {
        try {
          submitLead(em, "map_world");
        } catch (_) {
        }
      },
      onShare: shareBeachCard,
      seasonOutlook: sargData?.seasonOutlook || null,
      topInset: showRecoveryBanner || showPassExpired ? bannerH || 96 : 0,
      onOpenPro: () => {
        try {
          track("sg_b2b_open", { source: "map" });
        } catch (_) {
        }
        ;
        proB2BSrc.current = "map_legend";
        setShowProB2B(true);
      },
      previewBeach: previewBeachObj,
      onAccess: () => {
        if (!ACCOUNT_OFF) {
          openAccount("map");
          return;
        }
        openAccessCheck("map");
      },
      onEnableNotif: () => {
        if (!ACCOUNT_OFF) {
          toggleAlerts("map");
          return;
        }
        loadPushNow("map");
      },
      alertsOn: !ACCOUNT_OFF ? alertsOn : null,
      onClose: () => {
        setShowArchipel(false);
        track("sg_archipel_close", { source: "map_world" });
      }
    }
  )))) : /* @__PURE__ */ React.createElement(ArchipelView, { beaches: allBeaches, island: island2, userPos, lang, onOpenBeach: onMapBeach, onSolutions: () => {
    setView("map");
  }, onPremium: () => openPremium("archipel"), rootMode: navWorld, updatedAt: sargData?.erddapTimestamp || sargData?.updatedAt || null, onClose: () => {
    setShowArchipel(false);
    track("sg_archipel_close", {});
  }, initialZone, onRequestGeo: requestGeo, dataReady })), !mapTipDismissed && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: "max(20px,env(safe-area-inset-bottom,0px)+8px)", left: "50%", transform: "translateX(-50%)", zIndex: 1400, pointerEvents: "none", animation: "mapTipFade 4s ease-out 8s both" } }, /* @__PURE__ */ React.createElement("style", null, `@keyframes mapTipFade{0%,60%{opacity:1;transform:translateX(-50%) translateY(0)}90%{opacity:0;transform:translateX(-50%) translateY(6px)}100%{opacity:0;transform:translateX(-50%) translateY(6px);pointer-events:none}}`), /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 20px", borderRadius: 14, background: "rgba(13,17,23,.92)", border: "1.5px solid rgba(255,199,44,.35)", boxShadow: "0 4px 0 0 rgba(0,0,0,.35),0 8px 32px rgba(0,0,0,.4)" } }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "#FFC72C", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "10", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7Z" })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "#EAF7F4", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", whiteSpace: "nowrap" } }, _t(lang, "Tape une plage", "Tap a beach", "Toca una playa")))), comicBeach && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null, onError: () => {
    const b = comicBeach;
    setComicBeach(null);
    try {
      track("sg_comic_detail_fail", { beach_id: b && b.id });
    } catch (_) {
    }
    ;
    if (b) onBeachClick(b);
  } }, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "fixed", inset: 0, background: "#FDF6E3", zIndex: 1200, pointerEvents: "none" } }) }, /* @__PURE__ */ React.createElement(
    LazyComicDetail,
    {
      beach: comicBeach,
      lang,
      track,
      pool: allBeaches,
      isPremium,
      sargData,
      onClose: () => {
        setComicBeach(null);
        track("sg_comic_detail_close", { beach_id: comicBeach.id });
      },
      onPremium: void 0,
      onFull: () => {
        const b = comicBeach;
        track("sg_comic_detail_full", { beach_id: b && b.id });
        if (b) onBeachClick(b);
        setTimeout(() => setComicBeach(null), 300);
      },
      onRelated: (b) => {
        if (b && b.id) setComicBeach(b);
      },
      communityReports,
      ReportComp: BeachReport,
      HeroVideoComp: BeachHeroVideo
    }
  ))), showReferralBanner && !showWelcome && /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "button",
      tabIndex: 0,
      "aria-label": _t(lang, "Un ami t'a pass\xE9 le relais \u2014 ouvrir l'offre", "A friend passed you the watch \u2014 open the offer", "Un amigo te pas\xF3 el relevo \u2014 abrir la oferta"),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPremium("referral_banner");
          setShowReferralBanner(false);
        }
      },
      onClick: () => {
        openPremium("referral_banner");
        setShowReferralBanner(false);
      },
      style: {
        position: "fixed",
        bottom: "calc(104px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1300,
        background: "linear-gradient(135deg,#7C3AED,#A855F7)",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 14,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 24px rgba(124,58,237,.35)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(90vw, 460px)",
        boxSizing: "border-box",
        animation: "slideUp .4s ease"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20 } }, "\u{1F30A}"),
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", null, _t(lang, "Un ami t'a pass\xE9 le relais \u{1F30A}", "A friend passed you the watch \u{1F30A}", "Un amigo te pas\xF3 el relevo \u{1F30A}")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 2 } }, _t(lang, "Touche : le verdict satellite de ta plage, ce matin \u2014 mesur\xE9, pas devin\xE9. Gratuit.", "Tap: your beach's satellite verdict this morning \u2014 measured, not guessed. Free.", "Toca: el veredicto satelital de tu playa, esta ma\xF1ana \u2014 medido, no adivinado. Gratis."))),
    /* @__PURE__ */ React.createElement("button", { "aria-label": "Close", onClick: (e) => {
      e.stopPropagation();
      setShowReferralBanner(false);
    }, style: {
      background: "rgba(255,255,255,.2)",
      border: "none",
      color: "#fff",
      borderRadius: 12,
      minWidth: 44,
      minHeight: 44,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: 16,
      marginLeft: 8
    } }, "\u2715")
  ), showWelcome && paidSplashOn && !splashDone && /* @__PURE__ */ React.createElement("div", { role: "status", "aria-live": "polite", style: {
    position: "fixed",
    inset: 0,
    zIndex: 1500,
    background: "radial-gradient(120% 90% at 75% -10%, rgba(255,199,44,.28), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 58%,#0A1714 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px 24px",
    textAlign: "center"
  } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
    width: 66,
    height: 66,
    borderRadius: "50%",
    background: "#FFC72C",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    boxShadow: "0 0 0 8px rgba(255,199,44,.16)"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "34", height: "34", viewBox: "0 0 24 24", fill: "none", stroke: "#0B2230", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M20 6 9 17l-5-5" }))), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Anton',sans-serif", fontWeight: 400, textTransform: "uppercase", fontSize: 34, letterSpacing: ".01em", lineHeight: 1.05, color: "#fff", textShadow: "0 2px 0 rgba(0,0,0,.35)" } }, _t(lang, "Premium activ\xE9", "Premium activated", "Premium activado")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,.72)", marginTop: 12, maxWidth: "30ch" } }, PAY_CAPTURE_ONLY ? _t(lang, "7 jours premium offerts. Tes pr\xE9visions 7 jours et tes alertes sont d\xE9bloqu\xE9es.", "7 days premium on us. Your 7-day forecast and alerts are unlocked.", "7 d\xEDas premium gratis. Tu pron\xF3stico de 7 d\xEDas y tus alertas est\xE1n desbloqueados.") : _t(lang, "Paiement valid\xE9. Tes pr\xE9visions 7 jours et tes alertes sont d\xE9bloqu\xE9es.", "Payment confirmed. Your 7-day forecast and alerts are unlocked.", "Pago confirmado. Tu pron\xF3stico de 7 d\xEDas y tus alertas est\xE1n desbloqueados.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        try {
          track("sg_premium_confirm_continue");
        } catch (_) {
        }
        ;
        setSplashDone(true);
      },
      style: { marginTop: 26, background: "#FFC72C", color: "#0B2230", border: "none", borderRadius: 13, padding: "14px 30px", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", boxShadow: "3px 3px 0 rgba(0,0,0,.35)" }
    },
    _t(lang, "Continuer \u2192", "Continue \u2192", "Continuar \u2192")
  )), showWelcome && (!paidSplashOn || splashDone) && pwOnboard === "onboard" && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "#02060A", zIndex: 1450 } }) }, POSTE_OFF ? /* @__PURE__ */ React.createElement(
    LazyPaidOnboarding,
    {
      lang,
      allBeaches,
      favorites,
      onToggleFav: toggleFav,
      onEnableNotif: () => forceEnablePush("onboard"),
      onDone: () => setShowWelcome(false),
      island: island2,
      userPos,
      track
    }
  ) : /* @__PURE__ */ React.createElement(
    LazyWelcomePoste,
    {
      lang,
      allBeaches,
      favorites,
      onToggleFav: toggleFav,
      onEnableNotif: () => forceEnablePush("onboard"),
      onSaveEmail: (em) => {
        try {
          localStorage.setItem("sg_premium_email", em);
        } catch (_) {
        }
        ;
        try {
          submitLead(em, "onboard_premium");
        } catch (_) {
        }
      },
      onDone: () => setShowWelcome(false),
      island: island2,
      userPos,
      track
    }
  ))), showWelcome && (!paidSplashOn || splashDone) && pwOnboard !== "onboard" && /* « Premium activé » — recette canonique de marque (plus de bleu pirate).
     Papier crème, liseré ink, ombre dure, Veilleur calme, titre Anton, ✕ SVG. */
  /* @__PURE__ */ React.createElement("div", { className: "sg-toast sg-toast--success", role: "status", style: {
    position: "fixed",
    bottom: "calc(104px + env(safe-area-inset-bottom, 0px))",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 1400,
    width: "min(92vw,460px)",
    boxShadow: "6px 6px 0 var(--sg-ink,#0d0d0d)"
  } }, /* @__PURE__ */ React.createElement("span", { className: "sg-toast__bar" }), /* @__PURE__ */ React.createElement("span", { className: "sg-toast__veil", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Veilleur, { mood: "serein", size: 38 })), /* @__PURE__ */ React.createElement("div", { className: "sg-toast__body" }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: "'Anton',sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: 22,
    letterSpacing: "-.01em",
    lineHeight: 1.1,
    color: "var(--sg-ink,#0d0d0d)"
  } }, _t(lang, "Premium activ\xE9", "Premium activated", "Premium activado")), /* @__PURE__ */ React.createElement("div", { className: "sg-toast__msg" }, _t(lang, "Brief matin \xB7 alertes \xB7 reco du jour.", "Morning brief \xB7 alerts \xB7 daily pick.", "Brief matinal \xB7 alertas \xB7 pick del d\xEDa.")), !PAY_CAPTURE_ONLY && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "?manage=1",
      onClick: (e) => {
        e.stopPropagation();
        track("sg_manage_click");
      },
      style: { display: "inline-block", marginTop: 8, fontSize: 14, fontWeight: 800, color: "var(--sg-teal,#009E8E)", textDecoration: "none" }
    },
    _t(lang, "G\xE9rer mon abonnement", "Manage my subscription", "Gestionar mi suscripci\xF3n")
  )), /* @__PURE__ */ React.createElement(SgClose, { lang, onClick: () => setShowWelcome(false) })), ctxMenu && ctxMenuView && /* @__PURE__ */ React.createElement(ErrBound, { fallback: null }, /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(LazyContextVeilleur, { x: ctxMenu.x, y: ctxMenu.y, header: ctxMenuView.header, items: ctxMenuView.items, onClose: closeCtx }))), /* @__PURE__ */ React.createElement(SgToastHost, { lang }), /* @__PURE__ */ React.createElement(SuccessCelebration, null), /* @__PURE__ */ React.createElement(LeadCapture, null), /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, zIndex: 1e3, padding: "12px 16px", background: "linear-gradient(135deg, #0a5c4a, #0d7f63)", borderBottom: "1px solid rgba(255,255,255,.07)" } }, /* @__PURE__ */ React.createElement(RegionNav, null)), !cookieConsent2 && !showHero2 && !showPremium2 && !showSplash && !showArenaOnb && !showPrevLanding2 && /* @__PURE__ */ React.createElement("div", { className: v2UiEnabled ? "sg-cookie-banner sg-v2-cookie-banner" : "sg-cookie-banner", style: {
    position: "fixed",
    bottom: "calc(100px + max(16px, env(safe-area-inset-bottom)))",
    left: 0,
    right: 0,
    zIndex: 1025,
    background: "linear-gradient(180deg,rgba(13,17,23,.96),rgba(13,17,23,.99))",
    borderTop: "1px solid rgba(255,199,44,.2)",
    padding: "16px max(16px,env(safe-area-inset-left)) 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.72)" } }, _t(
    lang,
    "Nous utilisons des cookies pour am\xE9liorer l'exp\xE9rience et mesurer l'audience. Tu peux accepter ou refuser.",
    "We use cookies to improve experience and measure analytics. You can accept or decline.",
    "Usamos cookies para mejorar la experiencia y medir la audiencia. Puedes aceptar o rechazar."
  ), " ", /* @__PURE__ */ React.createElement(
    "a",
    {
      href: lang === "en" ? "/en/privacy/" : lang === "es" ? "/es/privacy/" : "/confidentialite/",
      style: { color: "#FFC72C", textDecoration: "underline" }
    },
    _t(lang, "En savoir plus", "Learn more", "Saber m\xE1s")
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    try {
      localStorage.setItem("sg_cookie_consent", "accepted");
    } catch (_) {
    }
    setCookieConsent("accepted");
    try {
      if (window.gtag) gtag("consent", "update", { analytics_storage: "granted" });
    } catch (_) {
    }
    try {
      track("sg_cookie_accept", { island: island2 });
    } catch (_) {
    }
  }, style: {
    flex: "1 1 140px",
    background: "#FFC72C",
    color: "#0B2230",
    border: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "2px 2px 0 rgba(0,0,0,.35)",
    minHeight: 44
  } }, _t(lang, "Accepter", "Accept", "Aceptar")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    try {
      localStorage.setItem("sg_cookie_consent", "denied");
    } catch (_) {
    }
    setCookieConsent("denied");
    try {
      track("sg_cookie_deny", { island: island2 });
    } catch (_) {
    }
  }, style: {
    flex: "1 1 140px",
    background: "transparent",
    color: "rgba(255,255,255,.6)",
    border: "1.5px solid rgba(255,255,255,.2)",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    minHeight: 44
  } }, _t(lang, "Refuser", "Decline", "Rechazar"))))));
}
export {
  BEACHES_FALLBACK,
  BEACH_TO_SARG,
  BrandIcon,
  C,
  COMIC,
  EUR_TRIP_CENTS,
  GATING,
  IS_NEW_REGION,
  LINK_ANNUAL,
  LINK_MONTHLY,
  LINK_PRO,
  MOLLIE_PROFILE,
  MOLLIE_TESTMODE,
  MOL_FIELD,
  MOL_LABEL,
  NO_TRIAL,
  PAYPAL_CLIENT_ID,
  PAYPAL_PLANS,
  PAYWALL_READY,
  PAY_CAPTURE_ONLY,
  PAY_CUR,
  PAY_LABEL,
  PAY_PROVIDER,
  PRICE_MO,
  PRICE_TRIP,
  PRICE_TRIP_EUR,
  PRICE_YR,
  REGION,
  REGION_PAY,
  SARG_TO_BEACH,
  STRIPE_PK,
  SUPPORT_EMAIL,
  T,
  TRIP_CENTS,
  VEILLEUR_MOOD,
  Veilleur,
  __COMM,
  __REL,
  _t,
  abVariant,
  beginCheckout2 as beginCheckout,
  App as default,
  fcDay,
  fetchFullForecast,
  fmtPassPrice,
  g,
  getPlanMeta2 as getPlanMeta,
  loadMollieJs,
  loadPayPalSdk,
  loadStripeJs,
  miVeil,
  moodFromStatus,
  s,
  sgAlertsOff,
  sgApplyPushOptin,
  sgMyReferralCode,
  sgReferredBy,
  sgSetAlerts,
  sgToast,
  sgUnlock,
  sgVerifySub,
  submitLead,
  track,
  triggerCelebration,
  useLang,
  viewPromotion2 as viewPromotion,
  walletAvail
};
