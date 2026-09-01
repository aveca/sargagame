import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import { COAST_ZONES } from "../scripts/lib/coast-zones.js";
const LazyWeekHub = React.lazy(() => import("./WeekHub"));
const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" };
const INK = "#0d0b14";
const GLASS = { background: "rgba(20,11,32,.46)", border: "1px solid rgba(255,255,255,.22)", boxShadow: "0 8px 26px rgba(0,0,0,.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)" };
const GOLD = { background: "linear-gradient(180deg,#ffe07a,#ffb338)", border: "1px solid rgba(0,0,0,.18)", boxShadow: "0 8px 22px rgba(255,150,60,.45)" };
const STATUS_LBL = {
  clean: ["Propre", "Clean", "Limpia"],
  moderate: ["Mod\xE9r\xE9", "Moderate", "Moderado"],
  avoid: ["\xC0 \xE9viter", "Avoid", "Evitar"]
};
const DAY_LBL = [
  ["Auj", "Today", "Hoy"],
  ["+1j", "+1d", "+1d"],
  ["+2j", "+2d", "+2d"],
  ["+3j", "+3d", "+3d"],
  ["+4j", "+4d", "+4d"],
  ["+5j", "+5d", "+5d"]
];
function ti(lang, arr) {
  return lang === "en" ? arr[1] : lang === "es" ? arr[2] : arr[0];
}
function _t(lang, fr, en, es) {
  return lang === "es" ? es : lang === "en" ? en : fr;
}
function fmtFresh(updatedAt) {
  try {
    const h = (Date.now() - new Date(updatedAt).getTime()) / 36e5;
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 24) return `${h.toFixed(0)} h`;
    return `${Math.round(h / 24)} j`;
  } catch (_) {
    return "\xB7\xB7\xB7";
  }
}
function haversineKm(a, b) {
  if (a == null || b == null || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function vantColor(beachList, day) {
  const known = beachList.filter((b) => {
    const s = b.days[day];
    return s === "clean" || s === "moderate" || s === "avoid";
  });
  const n = known.length;
  if (!n) return "#9aa0a8";
  const c = known.filter((b) => b.days[day] === "clean").length;
  return c / n >= 0.6 ? "#22C55E" : c / n >= 0.35 ? "#B87A00" : "#E8522A";
}
function _rng(seed) {
  let s = (seed % 233280 + 233280) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
function _splatPath(cx, cy, r, seed, N, jag) {
  N = N || 9;
  jag = jag == null ? 0.7 : jag;
  const rand = _rng(seed), pts = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, rr = r * (1 - jag * 0.5 + rand() * jag);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${((pts[0][0] + pts[N - 1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[N - 1][1]) / 2).toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p = pts[i], n = pts[(i + 1) % N];
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + n[0]) / 2).toFixed(1)} ${((p[1] + n[1]) / 2).toFixed(1)}`;
  }
  return d + "Z";
}
const _NSV = "http://www.w3.org/2000/svg";
const _e = (n, a) => {
  const x = document.createElementNS(_NSV, n);
  for (const k in a) x.setAttribute(k, a[k]);
  return x;
};
const _clmp = (v, a, b) => v < a ? a : v > b ? b : v;
const _ease = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const _eOut = (p) => 1 - Math.pow(1 - p, 3);
function _spawnBeaching(layer, ax, ay, cx, cy, S, seed, eta) {
  const oa = Math.atan2(ay - cy, ax - cx);
  const ox = ax + Math.cos(oa) * 130, oy = ay + Math.sin(oa) * 130;
  const ta = oa + Math.PI / 2, TANx = Math.cos(ta), TANy = Math.sin(ta);
  const SKx = -Math.cos(oa), SKy = -Math.sin(oa);
  const coastDeg = (ta * 180 / Math.PI).toFixed(1);
  const bank = _e("g", {});
  {
    const R = 22 * S, sil = _splatPath(0, 0, R, seed, 11, 0.55);
    bank.appendChild(_e("path", { d: sil, fill: INK, opacity: ".3", transform: "translate(2 3)" }));
    bank.appendChild(_e("path", { d: sil, fill: "url(#wmSarg)", stroke: INK, "stroke-width": 2 * S, "stroke-linejoin": "round" }));
    bank.appendChild(_e("path", { d: _splatPath(-R * 0.22, -R * 0.28, R * 0.5, seed + 3, 7, 0.5), fill: "#FFE9A8", opacity: ".5" }));
  }
  const dep = _e("g", { opacity: "0" });
  let depHt;
  {
    const R = 32 * S, sil = _splatPath(0, 0, R, seed, 13, 0.78);
    dep.appendChild(_e("path", { d: sil, fill: INK, opacity: ".26", transform: "translate(2 3)" }));
    dep.appendChild(_e("path", { d: sil, fill: "url(#wmSarg)", stroke: INK, "stroke-width": 2.2 * S, "stroke-linejoin": "round" }));
    const rl = _rng(seed * 7 + 3);
    for (let i = 0; i < 2; i++) {
      const a = (0.15 + rl() * 0.7) * Math.PI, len = R * (0.9 + rl() * 0.6);
      dep.appendChild(_e("path", { d: _splatPath(Math.cos(a) * len, Math.abs(Math.sin(a)) * len * 0.7 + R * 0.3, (8 + rl() * 7) * S, seed * 13 + i * 5, 7, 0.7), fill: "url(#wmSarg)", stroke: INK, "stroke-width": 1.4 * S, "stroke-linejoin": "round" }));
    }
    const rd = _rng(seed * 11 + 2);
    for (let i = 0; i < 3; i++) {
      dep.appendChild(_e("path", { d: _splatPath((rd() - 0.5) * R * 1.1, (rd() - 0.5) * R * 0.9, R * (0.18 + rd() * 0.12), seed * 17 + i * 9, 7, 0.6), fill: "#5d5a1e", opacity: ".5" }));
    }
    depHt = _e("path", { d: sil, fill: "url(#wmSargHalf)", opacity: "0" });
    dep.appendChild(depHt);
    dep.appendChild(_e("path", { d: _splatPath(-R * 0.28, -R * 0.34, R * 0.42, seed + 5, 8, 0.5), fill: "#FFE9A8", opacity: ".45" }));
  }
  const foam = _e("g", { opacity: "0" });
  {
    const r = 40 * S;
    foam.appendChild(_e("path", { d: _splatPath(0, 4 * S, r, seed + 1, 12, 0.6), fill: "none", stroke: "#eafcff", "stroke-width": 6 * S, opacity: ".9", "stroke-linejoin": "round" }));
    const rf = _rng(seed * 3 + 4);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.28 + rf() * 0.4, rr = (46 + rf() * 16) * S;
      foam.appendChild(_e("circle", { cx: (Math.cos(a) * rr).toFixed(1), cy: (Math.sin(a) * rr * 0.7 + 6 * S).toFixed(1), r: ((2 + rf() * 2) * S).toFixed(1), fill: "#fff", opacity: ".85" }));
    }
  }
  const ripple = _e("g", { opacity: "0" });
  ripple.appendChild(_e("path", { d: _splatPath(0, 0, 28 * S, seed + 9, 14, 0.18), fill: "none", stroke: INK, "stroke-width": 2.6 * S, opacity: ".7" }));
  ripple.appendChild(_e("path", { d: _splatPath(0, 0, 28 * S, seed + 9, 14, 0.18), fill: "none", stroke: "#FFE9A8", "stroke-width": 1.3 * S, opacity: ".9" }));
  const lineG = _e("g", {}), lines = [];
  {
    const rl = _rng(seed + 99);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28 + rl() * 0.25;
      const ln = _e("line", { x1: (Math.cos(a) * 26 * S).toFixed(1), y1: (Math.sin(a) * 26 * S).toFixed(1), x2: (Math.cos(a) * (62 + rl() * 30) * S).toFixed(1), y2: (Math.sin(a) * (62 + rl() * 30) * S).toFixed(1), stroke: "#FFE9A8", "stroke-width": (2.4 * S).toFixed(1), "stroke-linecap": "round", opacity: "0" });
      lineG.appendChild(ln);
      lines.push(ln);
    }
  }
  const dropG = _e("g", {}), drops = [];
  {
    for (let i = 0; i < 4; i++) {
      const sd = seed + i * 37 + 11, rand = _rng(sd), L = (i / 3 - 0.5) * 2, dist = (40 + Math.abs(L) * 90) * S;
      const tx = ax + TANx * L * dist + SKx * (Math.abs(L) * 9 * S), ty = ay + TANy * L * dist + SKy * (Math.abs(L) * 9 * S);
      const g = _e("g", { opacity: "0" });
      g.appendChild(_e("path", { d: _splatPath(0, 0, (2.4 + rand() * 3) * S, sd, 7, 0.55), fill: "url(#wmSarg)", stroke: INK, "stroke-width": 1 * S, "stroke-linejoin": "round" }));
      dropG.appendChild(g);
      drops.push({ g, type: "shore", tx, ty, delay: Math.abs(L) * 0.06, rot: (rand() * 2 - 1) * 120 });
    }
    for (let i = 0; i < 3; i++) {
      const sd = seed + i * 53 + 200, rand = _rng(sd), ang = -2.5 + rand() * 1.9, spd = (80 + rand() * 120) * S;
      const g = _e("g", { opacity: "0" });
      g.appendChild(_e("path", { d: _splatPath(0, 0, (2.2 + rand() * 3) * S, sd, 7, 0.55), fill: "url(#wmSarg)", stroke: INK, "stroke-width": 1 * S, "stroke-linejoin": "round" }));
      dropG.appendChild(g);
      drops.push({ g, type: "splash", vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, delay: rand() * 0.05, rot: (rand() * 2 - 1) * 180 });
    }
  }
  dep.setAttribute("transform", `translate(${ax} ${ay})`);
  foam.setAttribute("transform", `translate(${ax} ${ay})`);
  ripple.setAttribute("transform", `translate(${ax} ${ay})`);
  lineG.setAttribute("transform", `translate(${ax} ${ay})`);
  layer.appendChild(dep);
  layer.appendChild(foam);
  layer.appendChild(ripple);
  layer.appendChild(dropG);
  layer.appendChild(bank);
  layer.appendChild(lineG);
  let badge = null;
  if (eta != null) {
    const label = eta <= 0 ? "AUJ" : "J+" + eta, col = eta <= 0 ? "#E8522A" : "#FFC72C";
    badge = _e("g", { opacity: "0" });
    const sh = _e("text", { x: 0, y: 2, "text-anchor": "middle", "font-family": "'AntonLC','Anton',sans-serif", "font-weight": "400", "font-size": "26", fill: INK, opacity: ".35" });
    sh.textContent = label;
    badge.appendChild(sh);
    const txt = _e("text", { x: 0, y: 0, "text-anchor": "middle", "font-family": "'AntonLC','Anton',sans-serif", "font-weight": "400", "font-size": "26", fill: col, stroke: INK, "stroke-width": "3.5", "paint-order": "stroke", "stroke-linejoin": "round" });
    txt.textContent = label;
    const bg = _e("rect", { x: -22, y: -14, width: 44, height: 28, rx: 6, ry: 6, fill: "rgba(13,11,20,0.65)", stroke: INK, "stroke-width": "0.5", opacity: 0.9 });
    badge.insertBefore(bg, badge.firstChild);
    badge.appendChild(txt);
    layer.appendChild(badge);
  }
  const BY = ay - 38;
  const T_AP = 1.1, T_IM = 1.18, T_SE = 1.55, T_FA = 3.05, T_LP = 3.35;
  function render(t) {
    if (t < T_IM) {
      const p = _ease(_clmp(t / T_AP, 0, 1)), x = ox + (ax - ox) * p, y = oy + (ay - oy) * p, sc = 0.7 + p * 0.55;
      const sq = t > T_AP ? 1 + (t - T_AP) / (T_IM - T_AP) * 0.7 : 1, bob = Math.sin(t * 5) * 4 * S * (1 - p);
      bank.setAttribute("transform", `translate(${x.toFixed(1)} ${(y + bob).toFixed(1)}) scale(${(sc * sq).toFixed(3)} ${(sc / sq).toFixed(3)})`);
      bank.setAttribute("opacity", t > T_AP ? (1 - (t - T_AP) / (T_IM - T_AP)).toFixed(2) : "1");
    } else bank.setAttribute("opacity", "0");
    if (t >= T_IM) {
      const pg = _clmp((t - T_IM) / (T_SE - T_IM), 0, 1), sc = (0.25 + _eOut(pg) * 0.75) * (1 + 0.12 * Math.sin(pg * Math.PI));
      let op = 1;
      if (t > T_FA) op = _clmp(1 - (t - T_FA) / (T_LP - T_FA), 0, 1);
      dep.setAttribute("transform", `translate(${ax} ${ay}) rotate(${coastDeg}) scale(${sc.toFixed(3)})`);
      dep.setAttribute("opacity", op.toFixed(2));
      depHt.setAttribute("opacity", (_eOut(pg) * 0.34 * op).toFixed(2));
    } else dep.setAttribute("opacity", "0");
    {
      const dt = t - T_IM;
      let lp = dt < 0 ? 0 : dt < 0.05 ? dt / 0.05 : dt < 0.3 ? 1 - (dt - 0.05) / 0.25 : 0;
      lp = _clmp(lp, 0, 1);
      lineG.setAttribute("transform", `translate(${ax} ${ay}) scale(${(0.6 + lp * 0.6).toFixed(3)})`);
      for (const ln of lines) ln.setAttribute("opacity", (lp * 0.9).toFixed(2));
    }
    {
      const dt = t - T_IM, rp = dt < 0 || dt > 0.26 ? 0 : 1 - dt / 0.26, rsc = 1 + _eOut(_clmp(dt / 0.26, 0, 1)) * 3;
      ripple.setAttribute("transform", `translate(${ax} ${ay}) scale(${rsc.toFixed(3)})`);
      ripple.setAttribute("opacity", _clmp(rp, 0, 1).toFixed(2));
    }
    {
      const dt = t - T_IM;
      let fp = dt < 0 ? 0 : dt < 0.5 ? Math.sin(dt / 0.5 * Math.PI * 0.9) : 0;
      fp = _clmp(fp, 0, 1);
      foam.setAttribute("transform", `translate(${ax} ${ay}) scale(${(0.5 + _eOut(_clmp(dt / 0.5, 0, 1)) * 0.9).toFixed(3)})`);
      foam.setAttribute("opacity", fp.toFixed(2));
    }
    {
      const dt = t - T_IM;
      for (const d of drops) {
        const lt = dt - d.delay;
        if (lt < 0 || lt > 0.9) {
          d.g.setAttribute("opacity", "0");
          continue;
        }
        if (d.type === "shore") {
          const fly = _eOut(_clmp(lt / 0.34, 0, 1)), x = ax + (d.tx - ax) * fly, y = ay + (d.ty - ay) * fly, ab = _clmp((lt - 0.55) / 0.3, 0, 1);
          d.g.setAttribute("transform", `translate(${x.toFixed(1)} ${(y + ab * 4 * S).toFixed(1)}) scale(${(_clmp(1 - lt * 0.45, 0.4, 1) * (1 - ab * 0.55)).toFixed(2)}) rotate(${(d.rot * fly).toFixed(0)})`);
          d.g.setAttribute("opacity", _clmp(ab < 1 ? 1 - ab : 0, 0, 1).toFixed(2));
        } else {
          const x = ax + d.vx * lt, y = ay + d.vy * lt + 320 * S * lt * lt, op = lt < 0.6 ? 1 : 1 - (lt - 0.6) / 0.25;
          d.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${_clmp(1 - lt * 0.5, 0.4, 1).toFixed(2)}) rotate(${(d.rot * lt).toFixed(0)})`);
          d.g.setAttribute("opacity", _clmp(op, 0, 1).toFixed(2));
        }
      }
    }
    if (badge) {
      const dt = t - T_IM;
      let bp = dt < 0 ? 0 : dt < 0.25 ? dt / 0.25 : 1;
      if (t > T_FA) bp *= _clmp(1 - (t - T_FA) / (T_LP - T_FA), 0, 1);
      const bs = 0.5 + _eOut(_clmp(dt / 0.3, 0, 1)) * 0.5;
      badge.setAttribute("transform", `translate(${ax} ${BY}) scale(${bs.toFixed(3)})`);
      badge.setAttribute("opacity", bp.toFixed(2));
    }
  }
  function frozen() {
    bank.setAttribute("opacity", "0");
    ripple.setAttribute("opacity", "0");
    for (const ln of lines) ln.setAttribute("opacity", "0");
    for (const d of drops) d.g.setAttribute("opacity", "0");
    dep.setAttribute("transform", `translate(${ax} ${ay}) rotate(${coastDeg}) scale(1)`);
    dep.setAttribute("opacity", "1");
    depHt.setAttribute("opacity", "0.34");
    if (badge) {
      badge.setAttribute("transform", `translate(${ax} ${BY}) scale(1)`);
      badge.setAttribute("opacity", "1");
    }
    foam.setAttribute("transform", `translate(${ax} ${ay}) scale(1.1)`);
    foam.setAttribute("opacity", ".3");
  }
  return { render, frozen };
}
const MQ_RELIEF = [[14.79, -61.1, 24], [14.74, -61.1, 18], [14.7, -61.07, 20], [14.52, -61.06, 15], [14.47, -60.92, 12]];
function WorldMapView({
  beaches,
  island,
  updatedAt,
  stale = false,
  lang,
  onOpenBeach,
  onPremium,
  onClose,
  rootMode,
  track,
  initialZone,
  warm,
  onCaptureEmail,
  arrivals,
  topInset = 0,
  onOpenPro,
  isPremium = false,
  forecastByBeach = null,
  onShare = null,
  seasonOutlook = null,
  onAccess = null,
  onEnableNotif = null,
  alertsOn = null,
  dataReady = true,
  previewBeach = null
}) {
  const mapV2 = (() => {
    try {
      return !/[?&]sguxv2=0(?:&|$)/.test(window.location.search);
    } catch (_) {
      return true;
    }
  })();
  const proMapOff = (() => {
    try {
      return /[?&]promap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapForecastOff = (() => {
    try {
      return /[?&]mapforecast=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapPremium = !!isPremium && !mapForecastOff;
  const mapNavOff = (() => {
    try {
      return /[?&]mapnav=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const showMapNav = rootMode && !mapNavOff && (onAccess || onEnableNotif);
  const notifGranted = (() => {
    try {
      return typeof Notification !== "undefined" && Notification.permission === "granted";
    } catch (_) {
      return false;
    }
  })();
  const bellOn = alertsOn != null ? !!alertsOn : notifGranted;
  const [premiumHint, setPremiumHint] = useState(false);
  const mapDriftOff = (() => {
    try {
      return /[?&]mapdrift=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapFriseOff = (() => {
    try {
      return /[?&]mapfrise=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const friseOn = mapPremium && !mapFriseOff;
  const mapDecideOff = (() => {
    try {
      return /[?&]mapdecide=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapShareOff = (() => {
    try {
      return /[?&]mapshare=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapPinHitOff = (() => {
    try {
      return /[?&]mappinhit=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapLabelTapOff = (() => {
    try {
      return /[?&]maplabeltap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapLiveTapOff = (() => {
    try {
      return /[?&]maplivetap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapCleanTapOff = (() => {
    try {
      return /[?&]mapcleantap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapLabelScrimOff = (() => {
    try {
      return /[?&]maplabelscrim=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapTitleOff = (() => {
    try {
      return /[?&]maptitle=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapSnapOff = (() => {
    try {
      return /[?&]mapsnap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapTapFxOff = (() => {
    try {
      return /[?&]maptapfx=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapLabelCapOff = (() => {
    try {
      return /[?&]maplabelcap=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const mapGreenOff = (() => {
    try {
      return /[?&]mapgreen=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const relHref = island === "mq" || island === "gp" ? "/fiabilite/" : lang === "es" ? "/fiabilidad/" : "/reliability/";
  const _relGo = () => {
    try {
      track && track("sg_map_live_tap", { island });
    } catch (_) {
    }
    ;
    try {
      window.location.href = relHref;
    } catch (_) {
    }
  };
  const rectCacheOff = (() => {
    try {
      return /[?&]rectcache=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const gestRectRef = useRef(null);
  const weekhubOff = (() => {
    try {
      return /[?&]weekhub=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const weekhubSeasonOff = (() => {
    try {
      return /[?&]weekhubseason=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const whctaOff = (() => {
    try {
      return /[?&]whcta=0/.test(window.location.search);
    } catch (_) {
      return false;
    }
  })();
  const [showHub, setShowHub] = useState(false);
  const digestBtnRef = useRef(null);
  const previewHotel = (() => {
    try {
      const m = window.location.search.match(/[?&]preview_name=([^&]+)/);
      return m ? decodeURIComponent(m[1]).replace(/[<>]/g, "").slice(0, 48) : null;
    } catch (_) {
      return null;
    }
  })();
  const wrapRef = useRef(null);
  const worldRef = useRef(null);
  const camRef = useRef({ tx: 0, ty: 0, k: 1 });
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const ptrsRef = useRef({});
  const pinchRef = useRef(null);
  const lastTapRef = useRef(0);
  const suppressBgClickRef = useRef(false);
  const bgSnapTimerRef = useRef(null);
  const tagTimerRef = useRef(null);
  const hintTimerRef = useRef(null);
  const reduceRef = useRef(false);
  const labelLayerRef = useRef(null);
  const bakeRef = useRef(null);
  const bakedObjUrlRef = useRef(null);
  const pendingBakedUrlRef = useRef(null);
  const mapInteractedRef = useRef(false);
  const fxRef = useRef(null);
  const fieldRef = useRef(null);
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [soundReplay, setSoundReplay] = useState(0);
  const ensureAudio = useCallback(() => {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioRef.current = new AC();
      }
      if (audioRef.current.state === "suspended") audioRef.current.resume();
    } catch (_) {
      return null;
    }
    return audioRef.current;
  }, []);
  const playBoump = useCallback((strength = 1) => {
    if (mutedRef.current || reduceRef.current) return;
    const ac = audioRef.current;
    if (!ac || ac.state !== "running") return;
    try {
      const now = ac.currentTime, s = Math.max(0.4, Math.min(1.3, strength));
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(155, now);
      o.frequency.exponentialRampToValueAtTime(56, now + 0.19);
      g.gain.setValueAtTime(1e-4, now);
      g.gain.exponentialRampToValueAtTime(0.22 * s, now + 0.015);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.33);
      o.connect(g);
      g.connect(ac.destination);
      o.start(now);
      o.stop(now + 0.35);
      const dur = 0.26, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        ch[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
      }
      const ns = ac.createBufferSource();
      ns.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 820;
      bp.Q.value = 0.7;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(1e-4, now);
      ng.gain.exponentialRampToValueAtTime(0.17 * s, now + 0.03);
      ng.gain.exponentialRampToValueAtTime(1e-4, now + 0.28);
      ns.connect(bp);
      bp.connect(ng);
      ng.connect(ac.destination);
      ns.start(now);
      ns.stop(now + 0.3);
    } catch (_) {
    }
  }, []);
  const [outline, setOutline] = useState(null);
  const [bakedUrl, setBakedUrl] = useState(null);
  const [pinTier, setPinTier] = useState({});
  const [loadErr, setLoadErr] = useState(false);
  const [day, setDay] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tagPos, setTagPos] = useState(null);
  const [query, setQuery] = useState("");
  const [tapFx, setTapFx] = useState([]);
  const tapFxIdRef = useRef(0);
  const [trackRec, setTrackRec] = useState(null);
  const [mapHintPhase, setMapHintPhase] = useState(() => {
    try {
      return sessionStorage.getItem("sg_map_hint_seen") ? null : "show";
    } catch {
      return "show";
    }
  });
  const mapHintTimerRef = useRef(null);
  const [emailVal, setEmailVal] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailHidden, setEmailHidden] = useState(() => {
    try {
      return !!localStorage.getItem("sg_email") || !!localStorage.getItem("sg_hero_email_dismiss");
    } catch {
      return false;
    }
  });
  const submitMapEmail = () => {
    if (!emailVal || !emailVal.includes("@")) return;
    try {
      localStorage.setItem("sg_email", emailVal);
    } catch (_) {
    }
    try {
      onCaptureEmail && onCaptureEmail(emailVal);
    } catch (_) {
    }
    try {
      track && track("sg_map_email_submit", { island });
    } catch (_) {
    }
    setEmailSent(true);
  };
  useEffect(() => {
    try {
      reduceRef.current = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    if (mapHintPhase !== "show") return;
    mapHintTimerRef.current = setTimeout(() => {
      setMapHintPhase("hiding");
      setTimeout(() => setMapHintPhase(null), 320);
    }, 3e3);
    return () => clearTimeout(mapHintTimerRef.current);
  }, [mapHintPhase]);
  useEffect(() => {
    setOutline(null);
    setLoadErr(false);
    setSelected(null);
    setTagPos(null);
    fetch(`/data/region-outlines/${island}.json`).then((r) => r.json()).then(setOutline).catch(() => setLoadErr(true));
  }, [island]);
  const [afaiGrid, setAfaiGrid] = useState(null);
  useEffect(() => {
    fetch("/api/copernicus/sargassum-grid.json").then((r) => r.json()).then((d) => {
      if (d && d.points && d.points.length) setAfaiGrid(d);
    }).catch(() => {
    });
  }, []);
  useEffect(() => {
    let ok = true;
    fetch("/api/copernicus/track-record.json").then((r) => r.json()).then((d) => {
      if (ok && d) setTrackRec(d);
    }).catch(() => {
    });
    return () => {
      ok = false;
    };
  }, []);
  const toVB = useMemo(() => {
    if (!outline) return null;
    const { proj, bbox } = outline;
    return (lat, lng) => [
      proj.offX + (lng - bbox.minLng) * proj.kx * proj.sc,
      proj.offY + (bbox.maxLat - lat) * proj.sc
    ];
  }, [outline]);
  const beachList = useMemo(() => {
    if (!toVB) return [];
    const isEUR = island === "mq" || island === "gp";
    const accByBeach = {};
    if (trackRec && trackRec.byBeach) trackRec.byBeach.forEach((b) => {
      accByBeach[b.id] = b;
    });
    return (beaches || []).filter((b) => b && b.lat != null && b.lng != null && (isEUR ? b.island === island : true)).map((b) => {
      const [vx, vy] = toVB(b.lat, b.lng);
      const entry = forecastByBeach && forecastByBeach[b.id];
      const fc = entry && entry.d;
      const days = [b.status || null];
      const conf = [null];
      for (let d = 1; d < 6; d++) {
        const cell = fc && fc[d];
        let st = cell && cell.st ? cell.st : null;
        let cf = cell && cell.c != null ? cell.c : null;
        if (st == null) {
          st = days[d - 1];
          if (st != null) cf = Math.max(8, Math.round((conf[d - 1] != null ? conf[d - 1] : 35) * 0.78));
        }
        days.push(st);
        conf.push(cf);
      }
      let firstHit = null;
      for (let d = 0; d < days.length; d++) {
        if (days[d] === "avoid") {
          firstHit = d;
          break;
        }
      }
      if (firstHit == null && entry && entry.arrivalDay != null && entry.arrivalDay >= 1 && entry.arrivalDay < 6) firstHit = entry.arrivalDay;
      const acc = accByBeach[b.id] || null;
      return {
        ...b,
        vx,
        vy,
        days,
        conf,
        fc: fc || null,
        drift: entry && entry.drift || null,
        firstHit,
        accuracyPct: acc ? acc.hitRatePct : null,
        accuracySamples: acc ? acc.samples : null
      };
    });
  }, [beaches, island, toVB, forecastByBeach, trackRec]);
  const sargCells = useMemo(() => {
    if (!toVB || !afaiGrid || !afaiGrid.points) return [];
    const isMQGP = island === "mq" || island === "gp";
    const pts = isMQGP ? afaiGrid.points.filter((p) => island === "gp" ? p[0] >= 15.5 : p[0] < 15.5) : afaiGrid.points;
    const out = [];
    for (const [lat, lng, afai] of pts) {
      if (afai < 0.1) continue;
      const [vx, vy] = toVB(lat, lng);
      if (vx < -60 || vx > 860 || vy < -60 || vy > 660) continue;
      out.push({ vx, vy, afai, near: Math.hypot(vx - 400, vy - 300) < 240, seed: Math.round(vx * 7 + vy * 13) });
    }
    out.sort((a, b) => b.afai - a.afai);
    return out.slice(0, 48);
  }, [afaiGrid, island, toVB]);
  const matches = useMemo(() => {
    const lq = query.trim().toLowerCase();
    if (!lq) return [];
    return beachList.filter((b) => (b.name || "").toLowerCase().includes(lq)).slice(0, 6);
  }, [query, beachList]);
  const labeledIds = useMemo(() => {
    const ids = /* @__PURE__ */ new Set();
    if (!beachList.length) return ids;
    beachList.forEach((b) => {
      const st = b.days[day];
      if (st === "moderate" || st === "avoid" || !mapGreenOff && st === "clean") ids.add(b.id);
    });
    return ids;
  }, [beachList, day, mapGreenOff]);
  const reliefEls = useMemo(() => {
    if (!toVB || island !== "mq") return [];
    return MQ_RELIEF.map(([lat, lng, rx]) => {
      const [vx, vy] = toVB(lat, lng);
      return { vx, vy, rx };
    });
  }, [toVB, island]);
  useEffect(() => {
    const svg = bakeRef.current;
    if (!svg || !outline) {
      setBakedUrl(null);
      return;
    }
    let cancelled = false, idle = null;
    const S = Math.min(2.5, Math.max(2, typeof devicePixelRatio !== "undefined" && devicePixelRatio || 2)), W = Math.round(800 * S), H = Math.round(600 * S);
    const runBake = () => {
      if (cancelled) return;
      let xml;
      try {
        xml = new XMLSerializer().serializeToString(svg);
      } catch (_) {
        return;
      }
      xml = xml.replace("<svg ", `<svg width="${W}" height="${H}" `);
      const kick = () => {
        if (cancelled) return;
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          try {
            const cv = document.createElement("canvas");
            cv.width = W;
            cv.height = H;
            cv.getContext("2d").drawImage(img, 0, 0, W, H);
            cv.toBlob((blob) => {
              if (cancelled) {
                return;
              }
              if (!blob) {
                setBakedUrl(null);
                return;
              }
              const url = URL.createObjectURL(blob);
              if (cancelled) {
                URL.revokeObjectURL(url);
                return;
              }
              const commit = () => {
                if (cancelled) {
                  URL.revokeObjectURL(url);
                  return;
                }
                if (bakedObjUrlRef.current) URL.revokeObjectURL(bakedObjUrlRef.current);
                bakedObjUrlRef.current = url;
                if (mapInteractedRef.current) setBakedUrl(url);
                else pendingBakedUrlRef.current = url;
              };
              const pre = new Image();
              pre.onload = () => {
                (pre.decode ? pre.decode() : Promise.resolve()).then(commit, commit);
              };
              pre.onerror = commit;
              pre.src = url;
            }, "image/png");
          } catch (_) {
            if (!cancelled) setBakedUrl(null);
          }
        };
        img.onerror = () => {
          if (!cancelled) setBakedUrl(null);
        };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(kick));
      else setTimeout(kick, 50);
    };
    if (typeof requestIdleCallback === "function") idle = requestIdleCallback(runBake, { timeout: 9e3 });
    else idle = setTimeout(runBake, 300);
    return () => {
      cancelled = true;
      try {
        (typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout)(idle);
      } catch (_) {
      }
    };
  }, [outline, reliefEls, island]);
  useEffect(() => () => {
    if (bakedObjUrlRef.current) {
      try {
        URL.revokeObjectURL(bakedObjUrlRef.current);
      } catch (_) {
      }
      bakedObjUrlRef.current = null;
    }
  }, []);
  const K_MIN = 0.85, K_MAX = 5;
  const clampCam = useCallback(() => {
    const c = camRef.current;
    c.k = Math.max(K_MIN, Math.min(K_MAX, c.k));
    const m = 200;
    c.tx = Math.max(400 - 800 * c.k + m, Math.min(m, c.tx));
    c.ty = Math.max(300 - 600 * c.k + m, Math.min(m, c.ty));
  }, []);
  const declutterRef = useRef(0);
  const declutter = useCallback(() => {
    const layer = labelLayerRef.current;
    if (!layer) return;
    const wrap = wrapRef.current;
    const W = wrap && wrap.clientWidth || 0, H = wrap && wrap.clientHeight || 0;
    const camK = camRef.current.k;
    const wide = camK <= 1.35;
    const MAX = mapLabelCapOff ? Infinity : wide ? 8 : 14;
    const els = layer.querySelectorAll("[data-vx]");
    const RANK = { avoid: 0, moderate: 1, clean: 2 };
    const boxes = [];
    els.forEach((el) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      const L = parseFloat(el.style.left) || 0, T = parseFloat(el.style.top) || 0;
      const inView = W === 0 || H === 0 ? true : L >= -30 && L <= W + 30 && T >= -10 && T <= H + 50;
      boxes.push({
        el,
        inView,
        sel: el.dataset.sel === "1",
        rank: RANK[el.dataset.status] ?? 3,
        vy: parseFloat(el.dataset.vy) || 0,
        l: L - w / 2 - 4,
        r: L + w / 2 + 4,
        t: T - h - 4,
        b: T + 4
      });
    });
    boxes.sort((a, b) => a.sel !== b.sel ? a.sel ? -1 : 1 : a.rank !== b.rank ? a.rank - b.rank : a.vy - b.vy);
    const kept = [];
    boxes.forEach((bx) => {
      if (!bx.inView) {
        bx.el.style.visibility = "hidden";
        return;
      }
      const impacted = bx.rank <= 1;
      const capped = mapLabelCapOff ? false : wide ? kept.length >= MAX : !impacted && kept.length >= MAX;
      if (capped) {
        bx.el.style.visibility = "hidden";
        return;
      }
      const hit = kept.some((kb) => !(bx.r < kb.l || bx.l > kb.r || bx.b < kb.t || bx.t > kb.b));
      if (hit) {
        bx.el.style.visibility = "hidden";
      } else {
        bx.el.style.visibility = "visible";
        kept.push(bx);
      }
    });
  }, [mapLabelCapOff]);
  const recomputeTiers = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !beachList.length) {
      setPinTier({});
      return;
    }
    const k = camRef.current.k;
    const s = Math.min(el.clientWidth / 800, el.clientHeight / 600) || 0.5;
    const minVB = 34 / Math.max(1e-4, k * s);
    const order = [...beachList].sort((a, b) => (b.id === selected?.id ? 1e6 : 0) + (b.score || 0) - ((a.id === selected?.id ? 1e6 : 0) + (a.score || 0)));
    const placed = [], tier = {};
    for (const b of order) {
      let close = false;
      for (const p of placed) {
        const dx = p.vx - b.vx, dy = p.vy - b.vy;
        if (dx * dx + dy * dy < minVB * minVB) {
          close = true;
          break;
        }
      }
      if (close) tier[b.id] = "dot";
      else {
        tier[b.id] = "full";
        placed.push(b);
      }
    }
    setPinTier(tier);
  }, [beachList, selected]);
  const scheduleDeclutter = useCallback(() => {
    if (declutterRef.current) clearTimeout(declutterRef.current);
    declutterRef.current = setTimeout(() => {
      declutterRef.current = 0;
      recomputeTiers();
      declutter();
    }, 90);
  }, [declutter, recomputeTiers]);
  useLayoutEffect(() => {
    recomputeTiers();
  }, [recomputeTiers]);
  useLayoutEffect(() => {
    declutter();
  }, [day, labeledIds, selected, declutter]);
  useEffect(() => {
    const layer = fxRef.current;
    if (!layer || !beachList.length) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    let cx = 0, cy = 0;
    for (const b of beachList) {
      cx += b.vx;
      cy += b.vy;
    }
    ;
    cx /= beachList.length;
    cy /= beachList.length;
    const force = (() => {
      try {
        return /[?&]beachfx=1/.test(window.location.search);
      } catch (_) {
        return false;
      }
    })();
    const arr = (b) => arrivals && arrivals[b.id];
    let hits = beachList.filter((b) => b.days[day] === "avoid" || day === 0 && arr(b));
    if (force && !hits.length) hits = [...beachList].sort((a, b) => (a.score || 99) - (b.score || 99)).slice(0, 3);
    const sevOf = (b) => (b.days[day] === "avoid" ? 1 : 0) + (arr(b) && arr(b).s || 0) * 6;
    hits = hits.sort((a, b) => sevOf(b) - sevOf(a)).slice(0, 4);
    if (!hits.length) return;
    const CYCLE = 3.35;
    const loopMode = mapPremium && day >= 1 && !mapDriftOff;
    const GAP = 1.15;
    const insts = hits.map((b, i) => {
      const a = arr(b);
      const eta = loopMode ? null : force ? i + 1 : a ? a.d : b.days[day] === "avoid" ? 0 : null;
      const inst = _spawnBeaching(layer, b.vx, b.vy, cx, cy, 0.85, Math.round(b.vx * 7 + b.vy * 13) + i * 131, eta);
      const strength = Math.min(1.3, 0.72 + (a && a.s || 0) * 3.5 + (b.days[day] === "avoid" ? 0.28 : 0));
      return { inst, delay: i * 0.55, settled: false, boumped: false, strength, period: CYCLE + GAP + i % 3 * 0.4 };
    });
    if (reduceRef.current) {
      insts.forEach((o) => o.inst.render(CYCLE));
      return () => {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      };
    }
    let raf = 0, t0 = 0;
    const loop = (tms) => {
      if (!t0) t0 = tms;
      const t = (tms - t0) / 1e3;
      let active = false;
      for (const o of insts) {
        if (o.settled) continue;
        if (loopMode) {
          const lt2 = t - o.delay;
          if (lt2 < 0) {
            active = true;
            continue;
          }
          const ph = lt2 % o.period;
          o.inst.render(ph < CYCLE ? ph : CYCLE);
          if (!o.boumped && lt2 >= 1.18 && lt2 < o.period) {
            o.boumped = true;
            playBoump(o.strength);
          }
          active = true;
          continue;
        }
        const lt = t - o.delay;
        if (lt < CYCLE) {
          o.inst.render(Math.max(0, lt));
          active = true;
          if (!o.boumped && lt >= 1.18) {
            o.boumped = true;
            playBoump(o.strength);
          }
        } else {
          o.inst.render(CYCLE);
          o.settled = true;
        }
      }
      if (active) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else if (!raf && (loopMode || insts.some((o) => !o.settled))) {
        t0 = 0;
        insts.forEach((o) => {
          o.boumped = true;
        });
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };
  }, [beachList, day, soundReplay, mapPremium, mapDriftOff]);
  useEffect(() => {
    const layer = fieldRef.current;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!sargCells.length) return;
    const isMobile = (() => {
      try {
        return window.matchMedia("(pointer:coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 540;
      } catch (_) {
        return false;
      }
    })();
    const cells = [...sargCells].sort((a, b) => (a.near ? 1 : 0) - (b.near ? 1 : 0)).slice(0, isMobile ? 24 : 42);
    const nodes = cells.map((c) => {
      const near = c.near, R = (near ? 14 : 11) + c.afai * (near ? 34 : 22);
      const sil = _splatPath(0, 0, R, c.seed, near ? 11 : 8, near ? 0.7 : 0.5);
      const g = _e("g", {});
      g.appendChild(_e("path", { d: sil, fill: INK, opacity: near ? ".26" : ".16", transform: "translate(1.5 2.5)" }));
      g.appendChild(_e("path", { d: sil, fill: "url(#wmSarg)", stroke: INK, "stroke-width": near ? 1.4 : 1, "stroke-linejoin": "round", opacity: Math.min(0.95, (near ? 0.62 : 0.4) + c.afai * 1.1).toFixed(2) }));
      if (near) {
        const rd = _rng(c.seed * 11 + 2);
        for (let i = 0; i < 2; i++) g.appendChild(_e("path", { d: _splatPath((rd() - 0.5) * R, (rd() - 0.5) * R * 0.8, R * 0.3, c.seed * 9 + i * 7, 7, 0.6), fill: "#5d5a1e", opacity: ".5" }));
        g.appendChild(_e("path", { d: sil, fill: "url(#wmSargHalf)", opacity: ".28" }));
        g.appendChild(_e("path", { d: _splatPath(-R * 0.2, -R * 0.26, R * 0.5, c.seed + 3, 7, 0.5), fill: "#FFE9A8", opacity: ".42" }));
      }
      layer.appendChild(g);
      return { g, bx: c.vx, by: c.vy, seed: c.seed };
    });
    const reduced = reduceRef.current;
    const dd = mapPremium && !mapDriftOff && day >= 1 ? day : 0;
    const DX = -6.6 * dd, DY = -3.2 * dd;
    const swayK = dd > 0 ? 0.28 : 1;
    const place = (n, t) => {
      if (reduced) {
        n.g.setAttribute("transform", `translate(${(n.bx + DX).toFixed(1)} ${(n.by + DY).toFixed(1)})`);
        return;
      }
      const ph = n.seed * 0.137;
      const sx = (Math.sin(t * 0.061 + ph) * 7 + Math.sin(t * 0.0987 + ph * 1.31) * 4 + Math.sin(t * 0.1473 + ph * 0.71) * 2.4) * swayK;
      const sy = (Math.sin(t * 0.047 + ph * 1.1) * 3.4 + Math.sin(t * 0.0814 + ph * 0.53) * 2.1) * swayK;
      n.g.setAttribute("transform", `translate(${(n.bx + sx + DX).toFixed(1)} ${(n.by + sy + DY).toFixed(1)})`);
    };
    if (reduced) {
      nodes.forEach((n) => place(n, 0));
      return () => {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      };
    }
    let raf = 0;
    const loop = (tms) => {
      const t = tms / 1e3;
      for (const n of nodes) place(n, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };
  }, [sargCells, day, mapPremium, mapDriftOff]);
  const writeCam = useCallback(() => {
    const g = worldRef.current;
    if (!g) return;
    const { tx, ty, k } = camRef.current;
    g.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})`);
    const layer = labelLayerRef.current;
    if (!layer) return;
    const r = !rectCacheOff && gestRectRef.current || wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(r.width / 800, r.height / 600);
    const ox = (r.width - 800 * s) / 2, oy = (r.height - 600 * s) / 2;
    const els = layer.querySelectorAll("[data-vx]");
    els.forEach((el) => {
      const vx = parseFloat(el.dataset.vx), vy = parseFloat(el.dataset.vy);
      el.style.left = (ox + (vx * k + tx) * s).toFixed(1) + "px";
      el.style.top = (oy + (vy * k + ty) * s).toFixed(1) + "px";
    });
    scheduleDeclutter();
  }, [scheduleDeclutter]);
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      writeCam();
    });
  }, [writeCam]);
  const toSvg = useCallback((cx, cy) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    const s = Math.min(r.width / 800, r.height / 600);
    const ox = (r.width - 800 * s) / 2, oy = (r.height - 600 * s) / 2;
    return [(cx - r.left - ox) / s, (cy - r.top - oy) / s];
  }, []);
  const worldToScreen = useCallback((vx, vy) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    const s = Math.min(r.width / 800, r.height / 600);
    const ox = (r.width - 800 * s) / 2, oy = (r.height - 600 * s) / 2;
    const c = camRef.current;
    return [r.left + ox + (vx * c.k + c.tx) * s, r.top + oy + (vy * c.k + c.ty) * s];
  }, []);
  const flyTo = useCallback((vx, vy, k) => {
    const tk = Math.max(K_MIN, Math.min(K_MAX, k));
    const ttx = 400 - vx * tk, tty = 300 - vy * tk;
    if (reduceRef.current) {
      camRef.current = { tx: ttx, ty: tty, k: tk };
      clampCam();
      writeCam();
      return;
    }
    const s0 = { ...camRef.current }, t0 = performance.now(), D = 720;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / D);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      camRef.current.tx = s0.tx + (ttx - s0.tx) * e;
      camRef.current.ty = s0.ty + (tty - s0.ty) * e;
      camRef.current.k = s0.k + (tk - s0.k) * e;
      clampCam();
      writeCam();
      if (p < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, [clampCam, writeCam]);
  useLayoutEffect(() => {
    if (!outline) return;
    const { proj, bbox } = outline;
    let centered = false;
    if (initialZone && beachList.length) {
      const zoneObj = (COAST_ZONES[island] || []).find((z) => z.slug === initialZone);
      if (zoneObj) {
        const zoneBeaches = beachList.filter((b) => zoneObj.communes.includes(b.commune));
        if (zoneBeaches.length) {
          let avgVx = 0, avgVy = 0;
          for (const b of zoneBeaches) {
            avgVx += b.vx;
            avgVy += b.vy;
          }
          avgVx /= zoneBeaches.length;
          avgVy /= zoneBeaches.length;
          const tk = 2;
          camRef.current = {
            tx: 400 - avgVx * tk,
            ty: 300 - avgVy * tk,
            k: tk
          };
          clampCam();
          writeCam();
          centered = true;
          try {
            track && track("sg_zone_click", { zone: initialZone });
          } catch (_) {
          }
        }
      }
    }
    if (!centered) {
      const cx = proj.offX + ((bbox.minLng + bbox.maxLng) / 2 - bbox.minLng) * proj.kx * proj.sc;
      const cy = proj.offY + (bbox.maxLat - (bbox.minLat + bbox.maxLat) / 2) * proj.sc;
      camRef.current = { tx: 400 - cx, ty: 300 - cy, k: 1 };
      clampCam();
      writeCam();
      try {
        track && track("sg_archipel_open", { source: "map_world", island });
      } catch (_) {
      }
    }
    declutter();
  }, [outline, initialZone, beachList]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !outline) return;
    let moved = false;
    const onDown = (e) => {
      mapInteractedRef.current = true;
      if (pendingBakedUrlRef.current) {
        setBakedUrl(pendingBakedUrlRef.current);
        pendingBakedUrlRef.current = null;
      }
      ensureAudio();
      if (!audioUnlockedRef.current) {
        audioUnlockedRef.current = true;
        setSoundReplay((n) => n + 1);
      }
      if (e.target && e.target.closest && e.target.closest("[data-vmui]")) return;
      moved = false;
      suppressBgClickRef.current = false;
      if (bgSnapTimerRef.current) {
        clearTimeout(bgSnapTimerRef.current);
        bgSnapTimerRef.current = null;
      }
      if (!rectCacheOff) gestRectRef.current = el.getBoundingClientRect();
      ptrsRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
      const nptr = Object.keys(ptrsRef.current).length;
      if (nptr === 2) {
        const pts = Object.values(ptrsRef.current);
        pinchRef.current = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), k0: camRef.current.k };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
        }
      }
    };
    const onMove = (e) => {
      if (e.pointerType === "mouse" && e.buttons === 0) {
        if (ptrsRef.current[e.pointerId]) {
          delete ptrsRef.current[e.pointerId];
          if (Object.keys(ptrsRef.current).length < 2) pinchRef.current = null;
        }
        return;
      }
      if (!ptrsRef.current[e.pointerId]) return;
      const prev = ptrsRef.current[e.pointerId];
      ptrsRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
      const pts = Object.values(ptrsRef.current);
      if (pts.length >= 2 && pinchRef.current) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        if (pinchRef.current.d > 0) {
          const s = toSvg(mx, my), c = camRef.current;
          const wx = (s[0] - c.tx) / c.k, wy = (s[1] - c.ty) / c.k;
          c.k = Math.max(K_MIN, Math.min(K_MAX, pinchRef.current.k0 * d / pinchRef.current.d));
          c.tx = s[0] - wx * c.k;
          c.ty = s[1] - wy * c.k;
          clampCam();
        }
        moved = true;
        schedule();
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        if (!moved) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (_) {
          }
          setSelected(null);
          setTagPos(null);
        }
        moved = true;
        const r = el.getBoundingClientRect();
        const s = Math.min(r.width / 800, r.height / 600);
        camRef.current.tx += dx / s;
        camRef.current.ty += dy / s;
        clampCam();
        schedule();
      }
    };
    const onUp = (e) => {
      const wasMoved = moved;
      if (wasMoved) suppressBgClickRef.current = true;
      delete ptrsRef.current[e.pointerId];
      if (Object.keys(ptrsRef.current).length < 2) pinchRef.current = null;
      if (Object.keys(ptrsRef.current).length === 0) gestRectRef.current = null;
      if (e.target && e.target.closest && e.target.closest("[data-vmui]")) return;
      if (e.type !== "pointerup") return;
      if (!wasMoved) {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          const s = toSvg(e.clientX, e.clientY), c = camRef.current;
          const f = c.k < 2 ? 2.5 / c.k : K_MIN / c.k;
          const wx = (s[0] - c.tx) / c.k, wy = (s[1] - c.ty) / c.k;
          c.k = Math.max(K_MIN, Math.min(K_MAX, c.k * f));
          c.tx = s[0] - wx * c.k;
          c.ty = s[1] - wy * c.k;
          clampCam();
          writeCam();
        }
        lastTapRef.current = now;
      }
    };
    const onLeave = (e) => {
      if (e.pointerType === "mouse") onUp(e);
    };
    const onWheel = (e) => {
      e.preventDefault();
      const c = camRef.current;
      const zoomIntent = e.ctrlKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50;
      if (zoomIntent) {
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const r = el.getBoundingClientRect();
        const s = toSvg(r.left + r.width / 2, r.top + r.height / 2);
        const wx = (s[0] - c.tx) / c.k, wy = (s[1] - c.ty) / c.k;
        c.k = Math.max(K_MIN, Math.min(K_MAX, c.k * f));
        c.tx = s[0] - wx * c.k;
        c.ty = s[1] - wy * c.k;
        clampCam();
        schedule();
      } else {
        const r = el.getBoundingClientRect();
        const sc = Math.min(r.width / 800, r.height / 600) || 1;
        c.tx -= e.deltaX / sc;
        c.ty -= e.deltaY / sc;
        clampCam();
        schedule();
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
    };
  }, [outline, schedule, clampCam, writeCam, toSvg]);
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tagTimerRef.current) clearTimeout(tagTimerRef.current);
    if (declutterRef.current) clearTimeout(declutterRef.current);
    if (bgSnapTimerRef.current) clearTimeout(bgSnapTimerRef.current);
  }, []);
  const selectBeach = useCallback((b) => {
    setSelected(b);
    flyTo(b.vx, b.vy, 3);
    if (mapHintPhase) {
      setMapHintPhase("hiding");
      try {
        clearTimeout(mapHintTimerRef.current);
      } catch (_) {
      }
      try {
        sessionStorage.setItem("sg_map_hint_seen", "1");
      } catch (_) {
      }
      setTimeout(() => setMapHintPhase(null), 320);
    }
    if (tagTimerRef.current) clearTimeout(tagTimerRef.current);
    tagTimerRef.current = setTimeout(() => {
      const [sx, sy] = worldToScreen(b.vx, b.vy);
      setTagPos({ x: sx, y: sy });
    }, 250);
    try {
      track && track("sg_archipel_tap", { beach_id: b.id, status: b.status, source: "map_world" });
    } catch (_) {
    }
  }, [flyTo, worldToScreen, track]);
  const lastPtrOpenRef = useRef(0);
  const openBeach = useCallback(() => {
    if (!selected) return;
    if (Date.now() - lastPtrOpenRef.current < 700) return;
    onOpenBeach && onOpenBeach(selected);
  }, [selected, onOpenBeach]);
  const nearMe = useCallback(() => {
    const c = beachList.find((b) => b.days[day] === "clean");
    if (c) selectBeach(c);
    try {
      track && track("sg_map_near_me", { island });
    } catch (_) {
    }
  }, [beachList, day, selectBeach, track, island]);
  const onMapBgClick = useCallback((e) => {
    if (suppressBgClickRef.current) {
      suppressBgClickRef.current = false;
      return;
    }
    if (bgSnapTimerRef.current) {
      clearTimeout(bgSnapTimerRef.current);
      bgSnapTimerRef.current = null;
      return;
    }
    if (selected) {
      setSelected(null);
      setTagPos(null);
      return;
    }
    if (!dataReady || !beachList.length) return;
    const cx = e.clientX, cy = e.clientY;
    let best = null, bd = Infinity;
    for (const b of beachList) {
      const [sx, sy] = worldToScreen(b.vx, b.vy);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    const hit = !!(best && bd <= 120);
    if (!mapTapFxOff) {
      const id = ++tapFxIdRef.current;
      setTapFx((cur) => [...cur.slice(-3), { id, x: cx, y: cy, hit }]);
      setTimeout(() => {
        setTapFx((cur) => cur.filter((t) => t.id !== id));
      }, reduceRef.current ? 460 : 640);
      if (!hit) {
        try {
          track && track("sg_map_tap_void", { island, dist: best ? Math.round(bd) : null });
        } catch (_) {
        }
      }
    }
    if (mapSnapOff) return;
    if (hit) {
      bgSnapTimerRef.current = setTimeout(() => {
        bgSnapTimerRef.current = null;
        try {
          track && track("sg_map_bg_snap", { island, dist: Math.round(bd) });
        } catch (_) {
        }
        selectBeach(best);
      }, 260);
    }
  }, [selected, mapSnapOff, mapTapFxOff, dataReady, beachList, worldToScreen, selectBeach, track, island]);
  const planB = useMemo(() => {
    if (mapDecideOff || !selected) return null;
    const st = selected.days && selected.days[day];
    if (st !== "moderate" && st !== "avoid") return null;
    if (selected.lat == null || selected.lng == null) return null;
    let best = null, bestD = Infinity;
    for (const b of beachList) {
      if (b.id === selected.id || b.days[day] !== "clean") continue;
      const d = haversineKm(selected, b);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best ? { beach: best, km: bestD } : null;
  }, [mapDecideOff, selected, day, beachList]);
  const onShareSel = useCallback(() => {
    if (!onShare || !selected) return;
    try {
      const fc = [0, 1, 2].map((d) => ({ status: selected.days && selected.days[d] || "unknown", day: ti(lang, DAY_LBL[d]) }));
      onShare({ name: selected.name, status: selected.days && selected.days[0] || "unknown", score: selected.score }, lang, fc);
      try {
        track && track("sg_map_share", { island });
      } catch (_) {
      }
    } catch (_) {
    }
  }, [onShare, selected, lang, track, island]);
  const weekDigest = useMemo(() => {
    if (mapDecideOff || !mapPremium || !beachList.length) return null;
    const D = [0, 1, 2, 3, 4, 5];
    let bestDay = -1, bestN = -1;
    D.forEach((d) => {
      const known = beachList.filter((b) => {
        const s = b.days[d];
        return s === "clean" || s === "moderate" || s === "avoid";
      }).length;
      if (!known) return;
      const n = beachList.filter((b) => b.days[d] === "clean").length;
      if (n > bestN) {
        bestN = n;
        bestDay = d;
      }
    });
    if (bestDay < 0) return null;
    let safe = null, safeK = -1;
    for (const b of beachList) {
      const k = D.filter((d) => b.days[d] === "clean").length;
      if (k > safeK) {
        safeK = k;
        safe = b;
      }
    }
    let cells = 0, cleanCells = 0, anyAvoid = false;
    for (const b of beachList) {
      for (const d of D) {
        const s = b.days[d];
        if (s === "clean" || s === "moderate" || s === "avoid") {
          cells++;
          if (s === "clean") cleanCells++;
          if (s === "avoid") anyAvoid = true;
        }
      }
    }
    const calm = cells > 0 && !anyAvoid && cleanCells / cells >= 0.9;
    const REL = 3;
    let flips = 0, flipDay = -1;
    for (const b of beachList) {
      let fh = null;
      if (b.days[0] === "avoid") fh = 0;
      else for (let d = 1; d <= 5; d++) {
        if (b.days[d] === "avoid") {
          fh = d;
          break;
        }
      }
      if (fh != null && fh <= REL) {
        flips++;
        if (flipDay < 0 || fh < flipDay) flipDay = fh;
      }
    }
    return { bestDay, bestN, safe: safeK >= 2 ? safe : null, safeK, calm, flips, flipDay };
  }, [mapDecideOff, mapPremium, beachList]);
  if (loadErr) return null;
  const noAnim = reduceRef.current;
  const driftFuture = mapPremium && day >= 1 && !mapDriftOff && !noAnim;
  const regionName = outline?.name || (island === "mq" ? "Martinique" : island === "gp" ? "Guadeloupe" : island);
  const cleanCnt = beachList.filter((b) => b.days[day] === "clean").length;
  const dayLbl = day === 0 ? _t(lang, "aujourd'hui", "today", "hoy") : _t(lang, `dans ${day}j`, `in ${day}d`, `en ${day}d`);
  const vant = vantColor(beachList, day);
  const sunPos = useMemo(() => {
    const h = /* @__PURE__ */ new Date(), hr = h.getHours() + h.getMinutes() / 60, a = (hr - 6) / 12 * Math.PI;
    return { x: 400 + Math.cos(a) * 280, y: 300 + Math.sin(a) * 160, visible: hr >= 6 && hr <= 18 };
  }, []);
  const mapDefs = /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("radialGradient", { id: "wmPhalo", cx: "50%", cy: "50%", r: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFE6A8", stopOpacity: ".55" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#FFE6A8", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmLand", x1: "1", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#74D89E" }), /* @__PURE__ */ React.createElement("stop", { offset: ".3", stopColor: "#41BE7B" }), /* @__PURE__ */ React.createElement("stop", { offset: ".62", stopColor: "#2BAE66" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#157F49" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmWarm", x1: "1", y1: "0", x2: ".2", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFD27A", stopOpacity: ".55" }), /* @__PURE__ */ React.createElement("stop", { offset: ".4", stopColor: "#F0A23A", stopOpacity: ".14" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#C97E3A", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmSand", x1: "1", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFEFC4" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#F4D38C" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmPinClean", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#5FDD93" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#1E9E54" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmPinMod", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFD25A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#E0941A" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmPinAvoid", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FF7A4D" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#C8351A" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmSailR", x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FF6A3D" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#D8431F" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "wmSailY", x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#FFD45A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#F0A81E" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "wmSarg", cx: "40%", cy: "34%", r: "68%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#E3B743" }), /* @__PURE__ */ React.createElement("stop", { offset: ".5", stopColor: "#B08A2A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#7C6A22" })), /* @__PURE__ */ React.createElement("pattern", { id: "wmSargHalf", width: "6", height: "6", patternUnits: "userSpaceOnUse" }, /* @__PURE__ */ React.createElement("circle", { cx: "1.5", cy: "1.5", r: "1", fill: "#2c2a12", opacity: ".4" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "wmSunBg", cx: "50%", cy: "50%", r: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#F2B05E", stopOpacity: ".35" }), /* @__PURE__ */ React.createElement("stop", { offset: ".55", stopColor: "#C97E3A", stopOpacity: ".12" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#C97E3A", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("filter", { id: "wmSoft", x: "-60%", y: "-60%", width: "220%", height: "220%" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: "4" })), /* @__PURE__ */ React.createElement("filter", { id: "wmShlw", x: "-60%", y: "-60%", width: "220%", height: "220%" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: "8" })), outline && /* @__PURE__ */ React.createElement("clipPath", { id: "wmSeaClip" }, /* @__PURE__ */ React.createElement("path", { d: "M-200 -200H1000V1200H-200Z " + outline.path, fillRule: "evenodd", clipRule: "evenodd" })));
  const staticWorld = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("g", { stroke: "#bfeee8", strokeWidth: "2.4", strokeLinecap: "round", fill: "none", opacity: ".14" }, /* @__PURE__ */ React.createElement("path", { d: "M40 250 q60 -16 120 -4" }), /* @__PURE__ */ React.createElement("path", { d: "M70 340 q70 -18 140 -2" }), /* @__PURE__ */ React.createElement("path", { d: "M30 430 q66 -16 130 -2" }), /* @__PURE__ */ React.createElement("path", { d: "M520 120 q60 -14 120 0" }), /* @__PURE__ */ React.createElement("path", { d: "M600 470 q70 -16 130 -2" }), /* @__PURE__ */ React.createElement("path", { d: "M560 540 q66 -16 130 -2" })), outline && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "none", stroke: "#46c8bd", strokeWidth: "30", strokeOpacity: ".42", filter: "url(#wmShlw)" }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "none", stroke: "#a8f0e0", strokeWidth: "10", strokeOpacity: ".42" }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "#062033", opacity: ".5", filter: "url(#wmSoft)", transform: "translate(7 13)" }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "none", stroke: "#FFE6A8", strokeWidth: "7", strokeOpacity: ".38" }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "url(#wmSand)", stroke: "none" }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "url(#wmLand)", stroke: "none", transform: "scale(.985)", style: { transformOrigin: "328px 300px" } }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "url(#wmWarm)", opacity: ".9", transform: "scale(.985)", style: { transformOrigin: "328px 300px" } }), /* @__PURE__ */ React.createElement("path", { d: outline.path, fill: "none", stroke: INK, strokeWidth: "3", strokeLinejoin: "round" })), reliefEls.map(({ vx, vy, rx }, i) => /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("ellipse", { cx: vx, cy: vy, rx, ry: rx * 0.66, fill: "#2c5a26", opacity: ".5" }), /* @__PURE__ */ React.createElement(
    "path",
    {
      d: `M${(vx - rx * 0.72).toFixed(1)} ${(vy + rx * 0.18).toFixed(1)} Q${vx.toFixed(1)} ${(vy - rx * 0.78).toFixed(1)} ${(vx + rx * 0.72).toFixed(1)} ${(vy + rx * 0.18).toFixed(1)}`,
      stroke: "#bfe07a",
      strokeWidth: "2",
      fill: "none",
      opacity: ".55",
      strokeLinecap: "round"
    }
  ), /* @__PURE__ */ React.createElement(
    "path",
    {
      d: `M${(vx - rx * 0.4).toFixed(1)} ${(vy + rx * 0.05).toFixed(1)} Q${(vx - rx * 0.05).toFixed(1)} ${(vy - rx * 0.5).toFixed(1)} ${(vx + rx * 0.35).toFixed(1)} ${(vy + rx * 0.02).toFixed(1)}`,
      stroke: "#1d4a1c",
      strokeWidth: "1.4",
      fill: "none",
      opacity: ".4",
      strokeLinecap: "round"
    }
  ))), /* @__PURE__ */ React.createElement("g", { transform: "translate(150 470) scale(.58)", opacity: ".95" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "26", rx: "46", ry: "6", fill: "#06201c", opacity: ".5" }), /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("line", { x1: "-2", y1: "4", x2: "-2", y2: "-64", stroke: "#241608", strokeWidth: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M-2 -62 L-2 -6 L42 -6 Z", fill: "url(#wmSailR)" }), /* @__PURE__ */ React.createElement("path", { d: "M-2 -44 L-2 -6 L28 -6 Z", fill: "url(#wmSailY)" }), /* @__PURE__ */ React.createElement("path", { d: "M-4 -52 L-4 -8 L-32 -8 Z", fill: "#1c7fb0", opacity: ".94" })), /* @__PURE__ */ React.createElement("path", { d: "M-46 4 Q0 24 46 4 Q40 14 32 16 L-32 16 Q-40 14 -46 4 Z", fill: "#0f5d54" }), /* @__PURE__ */ React.createElement("path", { d: "M-46 4 Q0 18 46 4", fill: "none", stroke: "#B87A00", strokeWidth: "1.6", strokeOpacity: ".6" })));
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: wrapRef,
      className: "sg-onink-scope",
      "data-sg-live": "1",
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          try {
            track && track("sg_map_bg_tap", {});
          } catch (_) {
          }
          ;
          e.stopPropagation();
        }
      },
      style: {
        // Safari : inset:0 atteint le vrai bas (au-dessus de la toolbar) → on le garde.
        // iOS standalone SEULEMENT (html.sg-standalone, cf. script index.html) : inset:0
        // clippe au layout viewport (~852) plus court que l'écran réel (896) → bande vide
        // en bas. On force alors la hauteur MESURÉE --sg-vh (= screen.height) pour que le
        // fond de carte descende au bord physique.
        position: "fixed",
        zIndex: 1020,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        ...typeof document !== "undefined" && document.documentElement.classList.contains("sg-standalone") ? { top: 0, left: 0, right: 0, bottom: "auto", width: "100%", height: "var(--sg-vh,100%)" } : { inset: 0 },
        // forced-color-adjust HÉRITE → préserve les VRAIES couleurs golden-hour de TOUTE la
        // carte (fond + CTA dorés + dots de statut) même si le système force les couleurs
        // (thème contraste Windows / filtre couleur / forced-colors navigateur). Sans ça,
        // les fonds inline (#FFC72C…) étaient remappés en blanc système → boutons/scène délavés
        // (rapport fondateur 18/06). Justifié : la couleur PORTE le sens (statut vert/ambre/corail).
        forcedColorAdjust: "none",
        // A/B `map_warm` : variante golden-hour DIRECTIONNELLE — soleil chaud haut-droite →
        // ombre froide bas-gauche (lumière d'heure dorée crédible, nettement distincte du control
        // teal plat). N'affecte QUE le fond (mer) ; dots statut (#22C55E/#E8A800/#E8522A) + labels
        // vivent sur la terre (dégradé propre) → contraste préservé. Bas profond = dots lisibles.
        // Control = base teal froide (inchangée, ci-dessous).
        background: warm ? "radial-gradient(110% 80% at 80% 4%, rgba(255,214,140,.6), rgba(255,140,80,.26) 34%, transparent 62%), radial-gradient(130% 110% at 6% 116%, rgba(42,21,80,.7), rgba(58,28,90,.28) 42%, transparent 62%), linear-gradient(166deg,#ff8a4d 0%,#ff7a4d 18%,#8a4a8e 40%,#6a2f9e 60%,#3e2470 82%,#2e1a5e 100%)" : "radial-gradient(130% 70% at 76% 4%, rgba(255,224,160,.16), transparent 48%), linear-gradient(162deg,#3aa6c4 0%,#1c6f93 40%,#103f63 72%,#0b2e4d 100%)"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: `calc(52px + env(safe-area-inset-top,0px))`,
      right: 16,
      display: "flex",
      alignItems: "center",
      gap: 4,
      zIndex: 20,
      pointerEvents: "none"
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      background: "rgba(255,255,255,.9)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.3)",
      borderRadius: 999,
      padding: "3px 8px",
      font: "700 10px/1 'Bricolage Grotesque',system-ui,sans-serif",
      color: "#16A34A",
      whiteSpace: "nowrap"
    } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 9 } }, "\u2713"), /* @__PURE__ */ React.createElement("span", null, "97% fiables")), /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      background: "rgba(255,255,255,.9)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.3)",
      borderRadius: 999,
      padding: "3px 8px",
      font: "700 10px/1 'Bricolage Grotesque',system-ui,sans-serif",
      color: "#5A5A5A",
      whiteSpace: "nowrap"
    } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 9 } }, "\u{1F465}"), /* @__PURE__ */ React.createElement("span", null, "12k+ voyageurs")), /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      background: "rgba(255,255,255,.9)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.3)",
      borderRadius: 999,
      padding: "3px 8px",
      font: "700 10px/1 'Bricolage Grotesque',system-ui,sans-serif",
      color: "#5A5A5A",
      whiteSpace: "nowrap"
    } }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 9 } }, "\u{1F6F0}"), /* @__PURE__ */ React.createElement("span", null, "Satellite"))),
    /* @__PURE__ */ React.createElement("style", null, `
        @keyframes wmSun{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        @keyframes wmHalo{0%,100%{opacity:.45}50%{opacity:.8}}
        @keyframes wmAvoidPulse{0%{opacity:.55;transform:scale(.7)}70%{opacity:0;transform:scale(1.9)}100%{opacity:0;transform:scale(1.9)}}
        @keyframes wmPulse{0%{box-shadow:0 0 0 0 rgba(232,50,42,.55)}70%{box-shadow:0 0 0 9px rgba(232,50,42,0)}100%{box-shadow:0 0 0 0 rgba(232,50,42,0)}}
        @keyframes wmSlide{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes wmTapPing{0%{opacity:.85;transform:translate(-50%,-50%) scale(.3)}65%{opacity:.16;transform:translate(-50%,-50%) scale(1.7)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.1)}}
        @keyframes wmTapCore{0%{opacity:1;transform:translate(-50%,-50%) scale(.4)}55%{opacity:.9;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.15)}}
        @keyframes wmTapPingStatic{0%{opacity:.75}100%{opacity:0}}
        @keyframes wmHintIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes wmHintOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(8px)}}
        @keyframes driftL{0%{transform:translateX(0)}100%{transform:translateX(-200px)}}
        @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes boatPath{0%{transform:translate(-80px,540px)}100%{transform:translate(880px,260px)}}
        .pulseAnim{animation:pulse 3s ease-in-out infinite}
        .boatPath{animation:boatPath 120s linear infinite}
        @media(prefers-reduced-motion:reduce){.drift{animation:none!important}.pulseAnim{animation:none!important}.boatPath{animation:none!important}}
      `),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "40%",
      pointerEvents: "none",
      zIndex: 0,
      background: "linear-gradient(180deg,rgba(255,178,103,.5) 0%,rgba(255,138,61,.24) 34%,rgba(255,138,61,.08) 60%,transparent 100%)",
      mixBlendMode: "screen"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "-7%",
      right: "4%",
      width: 130,
      height: 130,
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: 0,
      background: "radial-gradient(circle at 50% 50%, rgba(255,238,210,.96), rgba(255,178,103,.9) 38%, rgba(255,138,61,.45) 62%, transparent 74%)",
      animation: noAnim ? "none" : "wmSun 11s ease-in-out infinite"
    } }),
    !noAnim && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "-22%",
      right: "-12%",
      width: "80%",
      height: "58%",
      pointerEvents: "none",
      zIndex: 0,
      background: "radial-gradient(closest-side, rgba(255,236,190,.40), rgba(255,210,130,.16) 48%, transparent 74%)",
      animation: "wmSun 11s ease-in-out infinite"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "6%",
      right: "2%",
      width: "46%",
      height: "60%",
      pointerEvents: "none",
      zIndex: 0,
      opacity: 0.5,
      mixBlendMode: "screen",
      background: "radial-gradient(60% 40% at 78% 16%, rgba(255,224,160,.5), transparent 70%)"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "4%",
      right: "14%",
      width: "22%",
      height: "66%",
      pointerEvents: "none",
      zIndex: 0,
      opacity: 0.42,
      mixBlendMode: "screen",
      background: "radial-gradient(40% 100% at 50% 0%, rgba(255,228,168,.7), rgba(255,210,140,.18) 46%, transparent 78%)"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 0,
      opacity: 0.1,
      backgroundImage: "radial-gradient(rgba(8,30,50,.9) 1px, transparent 1.3px)",
      backgroundSize: "7px 7px"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 2,
      background: "linear-gradient(200deg,rgba(42,21,80,0) 46%,rgba(26,12,46,.5) 100%)"
    } }),
    /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 3,
      opacity: 0.05,
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: "cover"
    } }),
    /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("svg", { ref: bakeRef, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 800 600" }, mapDefs, staticWorld)),
    /* @__PURE__ */ React.createElement(
      "svg",
      {
        ref: svgRef,
        className: "wm-map-svg",
        style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 1, touchAction: "none", pointerEvents: "none" },
        viewBox: "0 0 800 600",
        preserveAspectRatio: "xMidYMid meet",
        role: "img",
        "aria-label": _t(lang, `Carte ${regionName} \u2014 chaque plage, son verdict du matin. D\xE9place, zoome, touche une plage.`, `${regionName} map \u2014 every beach, its morning verdict. Pan, zoom, tap a beach.`, `Mapa ${regionName} \u2014 cada playa, su veredicto de la ma\xF1ana. Desplaza, zoom, toca una playa.`),
        "data-sg-live": "1",
        onClick: onMapBgClick
      },
      mapDefs,
      /* @__PURE__ */ React.createElement("g", { className: "wm-ocean-layer", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("foreignObject", { style: { position: "absolute", inset: 0, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { className: "wm-waves", style: { position: "absolute", inset: 0, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { className: "wm-wave", style: { height: "60%", bottom: "-10%" } }), /* @__PURE__ */ React.createElement("div", { className: "wm-wave", style: { height: "45%", bottom: "-5%" } }), /* @__PURE__ */ React.createElement("div", { className: "wm-wave", style: { height: "30%", bottom: "0%" } })))),
      /* @__PURE__ */ React.createElement("g", { ref: worldRef }, /* @__PURE__ */ React.createElement("g", { "aria-hidden": "true", style: { pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("circle", { cx: sunPos.x, cy: sunPos.y, r: "200", fill: "url(#wmSunBg)", opacity: ".55" }), /* @__PURE__ */ React.createElement("ellipse", { cx: sunPos.x, cy: sunPos.y - 120, rx: "60", ry: "160", fill: "url(#wmSunBg)", opacity: ".22" }), /* @__PURE__ */ React.createElement("circle", { cx: sunPos.x, cy: sunPos.y, r: "45", fill: "#F2B05E", opacity: ".12" })), bakedUrl ? /* @__PURE__ */ React.createElement("image", { href: bakedUrl, x: "0", y: "0", width: "800", height: "600", preserveAspectRatio: "none", style: { pointerEvents: "none" } }) : staticWorld, /* @__PURE__ */ React.createElement("g", { className: "drift", style: { pointerEvents: "none", animation: "driftL 130s cubic-bezier(.15,.65,.35,1) infinite" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M120 450 Q145 432 170 442 Q195 425 220 435 Q245 422 270 438 Q290 428 310 448 L310 468 Q120 468 120 450Z", fill: "#fff", opacity: ".12" })), /* @__PURE__ */ React.createElement("g", { className: "drift", style: { pointerEvents: "none", animation: "driftL 160s cubic-bezier(.15,.65,.35,1) infinite 35s" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M460 200 Q490 178 520 190 Q545 172 570 185 Q600 172 625 188 L625 210 Q460 210 460 200Z", fill: "#fff", opacity: ".1" })), /* @__PURE__ */ React.createElement("g", { className: "drift", style: { pointerEvents: "none", animation: "driftL 110s cubic-bezier(.15,.65,.35,1) infinite 70s" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M340 350 Q368 332 392 342 Q418 324 444 338 Q468 324 494 340 L494 362 Q340 362 340 350Z", fill: "#fff", opacity: ".08" })), /* @__PURE__ */ React.createElement("g", { className: "boatPath", style: { pointerEvents: "none", transformBox: "fill-box", transformOrigin: "0 0" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "8", rx: "16", ry: "3", fill: "#062033", opacity: ".25" }), /* @__PURE__ */ React.createElement("path", { d: "M-14 0 L-10 8 L10 8 L14 0 Z", fill: "#5b3a5e", stroke: "#0d0b14", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M-12 0 L12 0", stroke: "#0d0b14", strokeWidth: "1.2", opacity: ".5" }), /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "8", x2: "0", y2: "-14", stroke: "#0d0b14", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M0 -12 L0 5 L11 5 Z", fill: "#ffd23f", stroke: "#0d0b14", strokeWidth: "1.2", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M-1 -10 L-1 3 L-9 3 Z", fill: "#fff", stroke: "#0d0b14", strokeWidth: "1.2", strokeLinejoin: "round", opacity: ".8" })), /* @__PURE__ */ React.createElement("g", { ref: fieldRef, clipPath: "url(#wmSeaClip)", "aria-hidden": "true", style: { pointerEvents: "none" } }), /* @__PURE__ */ React.createElement("g", { ref: fxRef, "aria-hidden": "true", style: { pointerEvents: "none" } }), (dataReady ? beachList : []).map((b) => {
        const st = b.days[day];
        const isSel = selected?.id === b.id;
        if (pinTier[b.id] === "dot" && !isSel) {
          const dotCol = st === "clean" ? "#22C55E" : st === "moderate" ? "#B87A00" : st === "avoid" ? "#E8522A" : "#9aa0a8";
          return /* @__PURE__ */ React.createElement(
            "g",
            {
              key: b.id,
              "data-beach": b.id,
              transform: `translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`,
              style: { cursor: "pointer", pointerEvents: "auto" },
              onClick: (e) => {
                e.stopPropagation();
                selectBeach(b);
                if (onOpenBeach) {
                  try {
                    track && track("sg_beach_open", { from: "map_dot" });
                  } catch (_) {
                  }
                  ;
                  onOpenBeach(b);
                }
              }
            },
            /* @__PURE__ */ React.createElement("circle", { r: mapPinHitOff ? "8" : "16", fill: "transparent" }),
            /* @__PURE__ */ React.createElement("circle", { r: "3.2", fill: dotCol, stroke: INK, strokeWidth: "1" })
          );
        }
        const fill = st === "clean" ? "url(#wmPinClean)" : st === "moderate" ? "url(#wmPinMod)" : st === "avoid" ? "url(#wmPinAvoid)" : "#9aa0a8";
        const s = isSel ? 1.18 : 1;
        return /* @__PURE__ */ React.createElement(
          "g",
          {
            key: b.id,
            "data-beach": b.id,
            transform: `translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`,
            style: { cursor: "pointer", pointerEvents: "auto" },
            onClick: (e) => {
              e.stopPropagation();
              selectBeach(b);
              if (onOpenBeach) {
                try {
                  track && track("sg_beach_open", { from: "map_pin" });
                } catch (_) {
                }
                ;
                onOpenBeach(b);
              }
            }
          },
          !mapPinHitOff && /* @__PURE__ */ React.createElement("circle", { r: "26", cy: "-9", fill: "transparent" }),
          (st === "avoid" || st === "moderate") && /* @__PURE__ */ React.createElement("circle", { r: "18", cy: "-9", fill: st === "avoid" ? "#E8522A" : "#B87A00", opacity: ".12", className: "pulseAnim", style: { transformBox: "fill-box", transformOrigin: "center" } }),
          !noAnim && st === "clean" && /* @__PURE__ */ React.createElement(
            "circle",
            {
              r: "13",
              cy: "-9",
              fill: "url(#wmPhalo)",
              style: { animation: "wmHalo 3.6s ease-in-out infinite" }
            }
          ),
          mapPremium && st === "avoid" && day >= 1 && isSel && (noAnim ? /* @__PURE__ */ React.createElement("circle", { r: "11", cy: "-9", fill: "none", stroke: "#E8522A", strokeWidth: "2", strokeDasharray: "3 2.4", "aria-hidden": "true" }) : /* @__PURE__ */ React.createElement(
            "circle",
            {
              r: "11",
              cy: "-9",
              fill: "none",
              stroke: "#E8522A",
              strokeWidth: "2",
              style: { transformBox: "fill-box", transformOrigin: "center", animation: "wmAvoidPulse 1.9s ease-out infinite", animationDelay: `${Math.abs(b.vx * 7 + b.vy * 13) % 900 / 1e3}s` },
              "aria-hidden": "true"
            }
          )),
          mapPremium && (() => {
            if (mapFriseOff) {
              if (b.firstHit == null || b.firstHit < 1) return null;
              return /* @__PURE__ */ React.createElement("g", { transform: "translate(0 -31)", "aria-hidden": "true", pointerEvents: "none" }, /* @__PURE__ */ React.createElement("rect", { x: "-14", y: "-7", width: "28", height: "13.5", rx: "6.75", fill: "#FFC72C", stroke: INK, strokeWidth: "1.4" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: "2.7", textAnchor: "middle", fontSize: "8", fontWeight: "800", fill: "#0d0b14", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }, ti(lang, DAY_LBL[b.firstHit])));
            }
            if (b.firstHit != null && b.firstHit >= 1) {
              const far = b.firstHit >= 4, w = far ? 25 : 28;
              return /* @__PURE__ */ React.createElement("g", { transform: "translate(0 -31)", "aria-label": `${_t(lang, "bascule", "flips", "cambia")} ${ti(lang, DAY_LBL[b.firstHit])}`, pointerEvents: "none" }, /* @__PURE__ */ React.createElement("rect", { x: -w / 2, y: "-7", width: w, height: "13.5", rx: "6.75", fill: far ? "#F2A57A" : "#E8522A", stroke: INK, strokeWidth: "1.4" }), /* @__PURE__ */ React.createElement("text", { x: "0", y: "2.7", textAnchor: "middle", fontSize: far ? 7 : 8, fontWeight: "800", fill: "#fff", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }, ti(lang, DAY_LBL[b.firstHit])));
            }
            return null;
          })(),
          /* @__PURE__ */ React.createElement("ellipse", { cx: "0", cy: "1", rx: 5 * s, ry: 2 * s, fill: "#062033", opacity: ".4" }),
          /* @__PURE__ */ React.createElement("g", { transform: `scale(${s})`, style: { transition: "transform .16s cubic-bezier(.34,1.56,.64,1)" } }, /* @__PURE__ */ React.createElement(
            "path",
            {
              d: "M0 0 C-5.4 -7 -8 -10.4 -8 -14.4 A8 8 0 1 1 8 -14.4 C8 -10.4 5.4 -7 0 0 Z",
              fill,
              stroke: INK,
              strokeWidth: "1.6",
              strokeLinejoin: "round"
            }
          ), /* @__PURE__ */ React.createElement("ellipse", { cx: "-2.6", cy: "-17", rx: "2.4", ry: "3.2", fill: "#fff", opacity: ".5" }), isSel && b.score != null ? /* @__PURE__ */ React.createElement(
            "text",
            {
              x: "0",
              y: "-11.4",
              textAnchor: "middle",
              fontSize: "8.5",
              fontWeight: "800",
              fill: INK,
              fontFamily: "'AntonLC','Anton',sans-serif"
            },
            Math.round(b.score)
          ) : /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-14.4", r: "3", fill: "#fff", stroke: INK, strokeWidth: ".7" })),
          isSel && b.accuracyPct != null && b.accuracySamples >= 10 && /* @__PURE__ */ React.createElement("g", { transform: "translate(0 14)", pointerEvents: "none" }, /* @__PURE__ */ React.createElement("rect", { x: "-16", y: "0", width: "32", height: "11", rx: "5.5", fill: "#0d0b14", opacity: ".85" }), /* @__PURE__ */ React.createElement(
            "text",
            {
              x: "0",
              y: "8",
              textAnchor: "middle",
              fontSize: "6.5",
              fontWeight: "700",
              fill: "#FFC72C",
              fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
            },
            b.accuracyPct,
            "%"
          ))
        );
      })),
      /* @__PURE__ */ React.createElement("g", { transform: "translate(666 44) scale(.84)", opacity: ".95", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "60", r: "46", fill: "url(#wmPhalo)" }), /* @__PURE__ */ React.createElement("g", { stroke: "#0d0b14", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("rect", { x: "2", y: "50", width: "30", height: "20", rx: "3", fill: "#5b3a8e", transform: "rotate(-8 17 60)" }), /* @__PURE__ */ React.createElement("rect", { x: "88", y: "50", width: "30", height: "20", rx: "3", fill: "#5b3a8e", transform: "rotate(8 103 60)" }), /* @__PURE__ */ React.createElement("line", { x1: "32", y1: "60", x2: "46", y2: "60" }), /* @__PURE__ */ React.createElement("line", { x1: "88", y1: "60", x2: "74", y2: "60" })), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "63", r: "34", fill: "#fdf6e3", stroke: "#0d0b14", strokeWidth: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "60", y1: "29", x2: "60", y2: "14", stroke: "#0d0b14", strokeWidth: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "11", r: "5", fill: "#ffd23f", stroke: "#0d0b14", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "63", r: "20", fill: "#0d0b14" }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "63", r: "14", fill: vant }), /* @__PURE__ */ React.createElement("circle", { cx: "60", cy: "63", r: "6", fill: "#0d0b14" }), /* @__PURE__ */ React.createElement("circle", { cx: "55", cy: "58", r: "2.5", fill: "#fff" }), /* @__PURE__ */ React.createElement("path", { d: "M44 47 Q60 41 76 47", stroke: "#0d0b14", strokeWidth: "3", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M50 89 Q60 95 70 89", stroke: "#0d0b14", strokeWidth: "3", fill: "none", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "60",
          cy: "60",
          r: "52",
          fill: "none",
          stroke: "#ffd23f",
          strokeWidth: "1",
          opacity: ".12",
          style: { pointerEvents: "none", transformOrigin: "60px 60px", transformBox: "fill-box", animation: noAnim ? "none" : "bob 6s ease-in-out infinite" }
        }
      )),
      /* @__PURE__ */ React.createElement("g", { className: "wm-compass", "aria-hidden": "true", style: { pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("circle", { cx: "28", cy: "28", r: "26", fill: "var(--sg-card,#fff)", stroke: "var(--sg-ink,#0d0b14)", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { className: "wm-compass-needle", d: "M28 2 L28 26", stroke: "var(--sg-avoid,#dc2626)", strokeWidth: "2", strokeLinecap: "round", transform: "rotate(0 28 28)", style: { transformOrigin: "28px 28px" } }, /* @__PURE__ */ React.createElement("animateTransform", { attributeName: "transform", type: "rotate", from: "0 28 28", to: "2 28 28", dur: "3s", repeatCount: "indefinite", calcMode: "spline", keySplines: ".42 0 .58 1", values: "0 28 28;2 28 28;0 28 28" })), /* @__PURE__ */ React.createElement("text", { x: "28", y: "8", "text-anchor": "middle", font: "700 7px 'Bricolage Grotesque'", fill: "var(--sg-mute,#6b7280)" }, "N"), /* @__PURE__ */ React.createElement("text", { x: "28", y: "54", "text-anchor": "middle", font: "700 7px 'Bricolage Grotesque'", fill: "var(--sg-mute,#6b7280)" }, "S"), /* @__PURE__ */ React.createElement("text", { x: "52", y: "31", "text-anchor": "middle", font: "700 7px 'Bricolage Grotesque'", fill: "var(--sg-mute,#6b7280)" }, "E"), /* @__PURE__ */ React.createElement("text", { x: "4", y: "31", "text-anchor": "middle", font: "700 7px 'Bricolage Grotesque'", fill: "var(--sg-mute,#6b7280)" }, "W")),
      /* @__PURE__ */ React.createElement("g", { className: "wm-scalebar", "aria-hidden": "true", style: { pointerEvents: "none" } }, /* @__PURE__ */ React.createElement("rect", { x: "4", y: "4", width: "108", height: "20", rx: "4", fill: "rgba(255,255,255,.9)", stroke: "var(--sg-ink,#0d0b14)", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("text", { x: "58", y: "15", "text-anchor": "middle", font: "600 9px 'Bricolage Grotesque'", fill: "var(--sg-ink,#0d0b14)" }, "1 km"), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "12", width: "80", height: "3", rx: "1.5", fill: "var(--sg-ink,#0d0b14)" }))
    ),
    /* @__PURE__ */ React.createElement("div", { ref: labelLayerRef, style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, overflow: "hidden" } }, (dataReady ? beachList : []).filter((b) => labeledIds.has(b.id)).map((b) => {
      const st = b.days[day];
      const col = STATUS_C[st] || "#888";
      const li = lang === "en" ? 1 : lang === "es" ? 2 : 0;
      const openB = (e) => {
        e.stopPropagation();
        selectBeach(b);
        if (onOpenBeach) {
          try {
            track && track("sg_beach_open", { from: "map_label" });
          } catch (_) {
          }
          ;
          onOpenBeach(b);
        }
      };
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: b.id,
          className: "sg-maplabel",
          "data-beach": b.id,
          "data-vx": b.vx,
          "data-vy": b.vy,
          "data-status": st,
          "data-sel": selected?.id === b.id ? "1" : "0",
          "data-vmui": "1",
          ...!mapLabelTapOff ? { role: "button", tabIndex: 0, "aria-label": b.name, onClick: openB, onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openB(e);
            }
          } } : {},
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            // Naît MASQUÉ : declutter() révèle (visibility='visible') le seul
            // sous-ensemble gardé, sinon le 1er paint montre TOUS les noms puis le
            // débounce 90ms en masque la plupart (« flash de tous les noms »).
            visibility: "hidden",
            paddingBottom: mapLabelTapOff ? 8 : 14,
            textAlign: "center",
            whiteSpace: "nowrap",
            ...mapLabelTapOff ? {} : { pointerEvents: "auto", cursor: "pointer" }
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "sg-maplabel-scrim" + (mapLabelScrimOff ? "" : " on") }, /* @__PURE__ */ React.createElement("div", { style: {
          font: "800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
          color: "#fff",
          textShadow: `1px 1px 0 ${INK},0 0 5px ${INK},0 0 9px rgba(13,11,20,.65)`
        } }, b.name), /* @__PURE__ */ React.createElement("div", { style: {
          font: "800 9px/1 'Bricolage Grotesque',system-ui,sans-serif",
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: col,
          marginTop: 2,
          textShadow: `1px 1px 0 ${INK},0 0 4px ${INK}`
        } }, STATUS_LBL[st]?.[li]), b.accuracyPct != null && b.accuracySamples >= 10 && /* @__PURE__ */ React.createElement("div", { style: {
          font: "700 8px/1 'Bricolage Grotesque',system-ui,sans-serif",
          letterSpacing: ".03em",
          color: "#FFC72C",
          marginTop: 2,
          textShadow: `1px 1px 0 ${INK},0 0 4px ${INK}`
        } }, b.accuracyPct, "% ", lang === "en" ? "accurate" : lang === "es" ? "precisa" : "fiabilit\xE9"))
      );
    })),
    /* @__PURE__ */ React.createElement("div", { "data-vmui": "1", style: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 10 } }, /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "calc(12px + env(safe-area-inset-top)) 16px 12px",
      maxWidth: 560,
      margin: "0 auto"
    } }, /* @__PURE__ */ React.createElement("div", { ...!mapLiveTapOff ? { role: "button", tabIndex: 0, "aria-label": _t(lang, "Voir notre fiabilit\xE9", "See our reliability", "Ver nuestra fiabilidad"), onClick: _relGo, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        _relGo();
      }
    } } : {}, style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      pointerEvents: "auto",
      whiteSpace: "nowrap",
      flexShrink: 0,
      padding: "6px 12px 6px 10px",
      borderRadius: 999,
      minHeight: mapLiveTapOff ? void 0 : 44,
      boxSizing: "border-box",
      cursor: mapLiveTapOff ? void 0 : "pointer",
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#009E8E",
      border: `1.5px solid ${INK}`,
      animation: noAnim ? "none" : "wmPulse 2.4s ease-out infinite"
    } }), /* @__PURE__ */ React.createElement("span", { style: { font: "800 11px/1 'Bricolage Grotesque',system-ui,sans-serif", letterSpacing: ".06em", textTransform: "uppercase", color: INK } }, updatedAt && stale ? "DONN\xC9E EN RETARD" : _t(lang, "EN DIRECT", "LIVE", "EN VIVO")), /* @__PURE__ */ React.createElement("span", { style: { font: "700 11px/1 'JetBrains Mono',monospace", color: updatedAt && stale ? "#B87A00" : "#00786C", marginLeft: 2 } }, updatedAt ? _t(lang, `il y a ${fmtFresh(updatedAt)}`, `${fmtFresh(updatedAt)} ago`, `hace ${fmtFresh(updatedAt)}`) : "\xB7\xB7\xB7")), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", flex: 1, minWidth: 0, margin: "0 8px", maxWidth: 260, pointerEvents: "auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, background: "#fdf6e3", border: `2.5px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}`, borderRadius: 10, padding: "6px 10px" } }, /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: INK, strokeWidth: "2.4", strokeLinecap: "round", style: { opacity: 0.5, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("circle", { cx: "10", cy: "10", r: "6.5" }), /* @__PURE__ */ React.createElement("path", { d: "m20 20-5-5" })), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: query,
        onChange: (e) => setQuery(e.target.value),
        "aria-label": _t(lang, "Chercher une plage", "Search for a beach", "Buscar una playa"),
        placeholder: _t(lang, "Chercher\u2026", "Search\u2026", "Buscar\u2026"),
        style: { flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", font: "700 16px/1 'Bricolage Grotesque',system-ui,sans-serif", color: INK }
      }
    ), query && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setQuery(""), "aria-label": _t(lang, "Effacer la recherche", "Clear search", "Borrar b\xFAsqueda"), style: { background: "none", border: "none", color: INK, opacity: 0.5, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 } }, "\u2715")), matches.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fdf6e3", border: `2.5px solid ${INK}`, boxShadow: `3px 4px 0 ${INK}`, borderRadius: 12, overflow: "hidden", zIndex: 20 } }, matches.map((b) => /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        key: b.id,
        onClick: () => {
          try {
            track && track("sg_map_search_open", { id: b.id });
          } catch (_) {
          }
          ;
          setQuery("");
          onOpenBeach && onOpenBeach(b);
        },
        style: { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid rgba(13,11,20,.12)", padding: "9px 11px", cursor: "pointer", font: "700 12.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: INK }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: STATUS_C[b.status] || "#9aa0a8", flexShrink: 0 } }),
      /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, b.name),
      b.commune && /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.5, fontWeight: 600, fontSize: 11 } }, b.commune)
    )))), !rootMode && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, "aria-label": _t(lang, "Fermer", "Close", "Cerrar"), style: {
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      background: "#fdf6e3",
      color: INK,
      font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
      padding: "8px 12px",
      borderRadius: 10,
      cursor: "pointer",
      pointerEvents: "auto"
    } }, "\u2715")), showMapNav && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      right: 16,
      top: topInset ? topInset + 62 + "px" : "calc(62px + env(safe-area-inset-top))",
      display: "flex",
      flexDirection: "row",
      gap: 9,
      pointerEvents: "auto",
      zIndex: 3
    } }, onEnableNotif && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sg-mapnav",
        onClick: () => {
          try {
            track && track("sg_map_notif_click", { on: bellOn ? 1 : 0 });
          } catch (_) {
          }
          ;
          onEnableNotif();
        },
        "aria-label": bellOn ? _t(lang, "D\xE9sactiver les alertes sargasses", "Turn off sargassum alerts", "Desactivar alertas de sargazo") : _t(lang, "Activer les alertes sargasses", "Enable sargassum alerts", "Activar alertas de sargazo"),
        title: bellOn ? _t(lang, "Alertes activ\xE9es \u2014 couper", "Alerts on \u2014 turn off", "Alertas activadas \u2014 apagar") : _t(lang, "Alertes", "Alerts", "Alertas")
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "21", height: "21", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M6 9.5a6 6 0 0 1 12 0c0 4.4 1.8 5.5 1.8 5.5H4.2S6 13.9 6 9.5z", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round", fill: bellOn ? "currentColor" : "none" }), /* @__PURE__ */ React.createElement("path", { d: "M10 19a2 2 0 0 0 4 0", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), !bellOn && /* @__PURE__ */ React.createElement("path", { d: "M4 4L20 20", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }))
    ), onAccess && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sg-mapnav",
        onClick: () => {
          try {
            track && track("sg_map_access_click", { premium: !!isPremium });
          } catch (_) {
          }
          ;
          onAccess();
        },
        "aria-label": isPremium ? _t(lang, "Mon compte \u2014 g\xE9rer ou r\xE9silier l'abonnement", "My account \u2014 manage or cancel subscription", "Mi cuenta \u2014 gestionar o cancelar suscripci\xF3n") : _t(lang, "Mon acc\xE8s", "My access", "Mi acceso"),
        title: isPremium ? _t(lang, "Mon compte", "My account", "Mi cuenta") : _t(lang, "Mon acc\xE8s", "My access", "Mi acceso"),
        style: { position: "relative" }
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "21", height: "21", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "8", r: "3.4", stroke: "currentColor", strokeWidth: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M5.5 19.5a6.5 6.5 0 0 1 13 0", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })),
      isPremium && /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { position: "absolute", top: -4, right: -4, width: 13, height: 13, borderRadius: "50%", background: "#FFC72C", border: "2px solid #190c2c" } })
    )), /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: topInset ? topInset + 58 + (showMapNav ? 54 : 0) + "px" : `calc(${58 + (showMapNav ? 54 : 0)}px + env(safe-area-inset-top))`,
      left: 0,
      right: 0,
      maxWidth: 560,
      margin: "0 auto",
      padding: "0 18px",
      pointerEvents: "none"
    } }, (mapTitleOff || !selected) && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { style: {
      fontFamily: "'AntonLC','Anton',sans-serif",
      fontWeight: 400,
      letterSpacing: "-.01em",
      textTransform: "uppercase",
      fontSize: "clamp(24px,6.4vw,32px)",
      lineHeight: 0.96,
      color: "#fff",
      textShadow: `2px 2px 0 ${INK},0 3px 14px rgba(0,0,0,.45)`,
      margin: 0
    } }, regionName, " ", /* @__PURE__ */ React.createElement("span", { style: { color: "#ffd23f" } }, dayLbl)), /* @__PURE__ */ React.createElement("div", { ...!mapCleanTapOff ? { role: "button", tabIndex: 0, "aria-label": _t(lang, "Voir les plages propres pr\xE8s de moi", "See clean beaches near me", "Ver playas limpias cerca"), onClick: () => {
      try {
        track && track("sg_map_cleancount_tap", { island });
      } catch (_) {
      }
      ;
      nearMe();
    }, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        try {
          track && track("sg_map_cleancount_tap", { island });
        } catch (_) {
        }
        ;
        nearMe();
      }
    } } : {}, style: {
      marginTop: 9,
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      pointerEvents: "auto",
      cursor: mapCleanTapOff ? void 0 : "pointer",
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 12,
      padding: "8px 13px"
    } }, /* @__PURE__ */ React.createElement("div", { style: { width: 104, height: 8, borderRadius: 5, background: "#fff", border: `2px solid ${INK}`, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
      height: "100%",
      background: "linear-gradient(90deg,#22C55E,#B87A00)",
      transition: "width .4s ease",
      width: beachList.length ? Math.round(cleanCnt / beachList.length * 100) + "%" : "0%"
    } })), /* @__PURE__ */ React.createElement("span", { style: { font: "700 12.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color: INK } }, /* @__PURE__ */ React.createElement("b", { style: { fontFamily: "'AntonLC','Anton',sans-serif", fontWeight: 400, color: "#177A42" } }, cleanCnt), " ", _t(lang, `plages propres ${dayLbl}`, `clean beaches ${dayLbl}`, `playas limpias ${dayLbl}`)))), dataReady && beachList.length >= 3 && !selected && !emailSent && (() => {
      const top3 = [...beachList].filter((b) => b.score != null && b.days && b.days[day] != null).sort((a, b) => {
        const sd = (b.score || 0) - (a.score || 0);
        if (sd !== 0) return sd;
        return (b.conf?.[day] || 0) - (a.conf?.[day] || 0);
      }).slice(0, 3);
      if (!top3.length) return null;
      return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "auto", maxWidth: 360 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "0 2px" } }, /* @__PURE__ */ React.createElement("span", { style: { font: "800 9px/1 'Bricolage Grotesque',sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: "#ffd23f", textShadow: `0 1px 0 ${INK}` } }, "\u{1F3C6} ", _t(lang, "Meilleures plages aujourd\u2019hui", "Best beaches today", "Mejores playas hoy"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" } }, top3.map((b, i) => {
        const sc = Math.round(b.score);
        const st = b.days[day];
        const col = STATUS_C[st] || "#9aa0a8";
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: b.id,
            type: "button",
            onClick: () => {
              try {
                track && track("sg_best_beach_click", { beachId: b.id, rank: i + 1 });
              } catch (_) {
              }
              ;
              onOpenBeach && onOpenBeach(b);
            },
            style: { flex: "1 1 0", minWidth: 108, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, background: "#fdf6e3", border: `2.5px solid ${INK}`, boxShadow: `2.5px 2.5px 0 ${INK}`, borderRadius: 12, padding: "8px 10px", cursor: "pointer", textAlign: "left" }
          },
          /* @__PURE__ */ React.createElement("span", { style: { font: "800 10px/1 'Bricolage Grotesque',sans-serif", color: "#6b6478" } }, "#", i + 1),
          /* @__PURE__ */ React.createElement("span", { style: { font: "800 12px/1.1 'Bricolage Grotesque',sans-serif", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } }, b.name),
          /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, padding: "2px 5px", borderRadius: 6, background: col, color: "#fff", font: "800 11px/1 'Bricolage Grotesque',sans-serif", border: `1px solid ${INK}` } }, sc), /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: col, border: `1px solid ${INK}` } }), /* @__PURE__ */ React.createElement("span", { style: { font: "700 10px/1 'Bricolage Grotesque',sans-serif", color: INK, textTransform: "uppercase" } }, _t(lang, STATUS_LBL[st]?.[0] || st, STATUS_LBL[st]?.[1] || st, STATUS_LBL[st]?.[2] || st)))
        );
      })));
    })(), (!mapV2 || selected) && !emailHidden && !emailSent && /* @__PURE__ */ React.createElement(
      "div",
      {
        onPointerDown: (e) => {
          try {
            e.stopPropagation();
          } catch (_) {
          }
        },
        style: {
          marginTop: 9,
          display: "flex",
          alignItems: "center",
          gap: 7,
          pointerEvents: "auto",
          maxWidth: 360,
          background: "#fdf6e3",
          border: `2.5px solid ${INK}`,
          boxShadow: `3px 3px 0 ${INK}`,
          borderRadius: 12,
          padding: "7px 9px"
        }
      },
      /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: INK, strokeWidth: "2", strokeLinejoin: "round", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "m3 7 9 6 9-6" })),
      /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          value: emailVal,
          onChange: (e) => setEmailVal(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") submitMapEmail();
          },
          placeholder: _t(lang, "ton@email \u2014 verdict gratuit", "your@email \u2014 free verdict", "tu@email \u2014 veredicto gratis"),
          "aria-label": _t(lang, "Ton email pour le verdict gratuit", "Your email for free verdict", "Tu email para el veredicto gratis"),
          style: {
            flex: 1,
            minWidth: 0,
            background: "#fff",
            border: `2px solid ${INK}`,
            borderRadius: 8,
            padding: "6px 9px",
            font: "700 16px/1 'Bricolage Grotesque',system-ui,sans-serif",
            color: INK,
            outline: "none"
          }
        }
      ),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: submitMapEmail,
          disabled: !emailVal || !emailVal.includes("@"),
          style: {
            flexShrink: 0,
            border: `2px solid ${INK}`,
            background: emailVal && emailVal.includes("@") ? "#ffd23f" : "rgba(13,11,20,.08)",
            color: INK,
            font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
            padding: "7px 11px",
            borderRadius: 8,
            cursor: emailVal && emailVal.includes("@") ? "pointer" : "not-allowed"
          }
        },
        "OK"
      ),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            try {
              localStorage.setItem("sg_hero_email_dismiss", "1");
            } catch (_) {
            }
            ;
            setEmailHidden(true);
            try {
              track && track("sg_map_email_dismiss", {});
            } catch (_) {
            }
          },
          "aria-label": _t(lang, "Fermer", "Close", "Cerrar"),
          style: {
            flexShrink: 0,
            background: "none",
            border: "none",
            color: INK,
            opacity: 0.5,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            padding: "0 2px"
          }
        },
        "\xD7"
      )
    ), emailSent && /* @__PURE__ */ React.createElement("div", { style: {
      marginTop: 9,
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      pointerEvents: "auto",
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 12,
      padding: "8px 12px"
    } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, "\u2705"), /* @__PURE__ */ React.createElement("span", { style: { font: "800 12px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "#177A42" } }, _t(lang, "C'est fait. Le verdict du matin t'attend demain \u2014 mesur\xE9, pas devin\xE9.", "Done. The morning verdict lands tomorrow \u2014 measured, not guessed.", "Listo. El veredicto de la ma\xF1ana llega ma\xF1ana \u2014 medido, no adivinado.")))), previewHotel && (() => {
      const openPreviewFiche = previewBeach ? (via) => {
        try {
          track && track("sg_b2b_preview_map_tap", { beach_id: previewBeach.id, via });
        } catch (_) {
        }
        ;
        onOpenBeach && onOpenBeach(previewBeach);
      } : null;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          role: previewBeach ? "button" : void 0,
          tabIndex: previewBeach ? 0 : void 0,
          onClick: openPreviewFiche ? () => openPreviewFiche("tap") : void 0,
          onKeyDown: openPreviewFiche ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPreviewFiche("kbd");
            }
          } : void 0,
          style: {
            position: "absolute",
            left: "50%",
            top: "min(33%, 300px)",
            transform: "translateX(-50%)",
            width: "calc(100% - 40px)",
            maxWidth: 380,
            pointerEvents: "auto",
            cursor: previewBeach ? "pointer" : "default",
            background: "#fff",
            border: `2.5px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
            borderRadius: 14,
            padding: "12px 14px",
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { font: "800 8.5px/1 'Bricolage Grotesque'", letterSpacing: ".09em", textTransform: "uppercase", color: "#7a7320", background: "#fbf2c4", border: `1px solid ${INK}`, borderRadius: 4, padding: "2px 6px" } }, _t(lang, "Partenaire", "Partner", "Socio")), /* @__PURE__ */ React.createElement("span", { style: { font: "800 8.5px/1 'Bricolage Grotesque'", letterSpacing: ".06em", textTransform: "uppercase", color: "#b4540a" } }, _t(lang, "aper\xE7u", "preview", "vista previa"))),
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11 } }, /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 auto", width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, background: "#f1ede2", border: `1.5px solid ${INK}` } }, "\u{1F3E8}"), /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { font: "800 14px/1.2 'Bricolage Grotesque'", color: "#1a1726", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, previewHotel), /* @__PURE__ */ React.createElement("div", { style: { font: "600 11px/1.35 'Bricolage Grotesque'", color: "#6b6b75", marginTop: 2 } }, previewBeach ? _t(lang, `Votre encart, sur la fiche de ${previewBeach.name}. Le verdict reste 100 % data.`, `Your spot, on the ${previewBeach.name} page. The verdict stays 100% data.`, `Tu marca, en la ficha de ${previewBeach.name}. El veredicto sigue 100 % datos.`) : _t(lang, "Votre encart, sur la fiche de votre plage. Le verdict reste 100 % data.", "Your spot, on your beach's page. The verdict stays 100% data.", "Tu marca, en la ficha de tu playa. El veredicto sigue 100 % datos.")), previewBeach && /* @__PURE__ */ React.createElement("div", { style: { font: "800 12px/1.2 'Bricolage Grotesque'", color: "#0d2330", marginTop: 7, textDecoration: "underline", textUnderlineOffset: 2 } }, _t(lang, "Voir votre encart sur la fiche \u2192", "See your spot on the page \u2192", "Ver tu recuadro en la ficha \u2192"))))
      );
    })(), /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 16,
      bottom: `calc(${mapPremium && !mapDecideOff ? 210 : 164}px + env(safe-area-inset-bottom))`,
      display: "flex",
      flexDirection: "column",
      gap: 5,
      pointerEvents: "none"
    } }, [
      ["#22C55E", _t(lang, "Propre", "Clean", "Limpia")],
      ["#B87A00", _t(lang, "Mod\xE9r\xE9", "Moderate", "Moderado")],
      ["#E8522A", _t(lang, "\xC0 \xE9viter", "Avoid", "Evitar")]
    ].map(([c, l]) => /* @__PURE__ */ React.createElement("div", { key: c, style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      font: "700 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
      color: "#fff",
      textShadow: `0 1px 0 ${INK},0 0 4px ${INK}`
    } }, /* @__PURE__ */ React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: c, border: `1.5px solid ${INK}` } }), l)), !proMapOff && onOpenPro && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sg-mapchip",
        onClick: () => {
          try {
            track && track("sg_b2b_open", { source: "map_legend" });
          } catch (_) {
          }
          ;
          onOpenPro();
        },
        style: {
          pointerEvents: "auto",
          marginTop: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          textAlign: "left",
          // Pastille sombre OPAQUE + texte blanc plein → lisible quel que soit
          // le fond de carte (solide, pas de semi-transparence qui laisse passer le sombre).
          background: "#190c2c",
          border: `1.5px solid rgba(255,255,255,.28)`,
          borderRadius: 999,
          padding: "4px 10px",
          font: "800 10.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif",
          color: "#fdfcf7",
          textShadow: "0 1px 2px rgba(0,0,0,.55)"
        }
      },
      /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "\u{1F3E8}"),
      _t(lang, "Vous g\xE9rez un h\xF4tel ?", "Run a hotel?", "\xBFGestionas un hotel?")
    )), /* @__PURE__ */ React.createElement("button", { type: "button", className: "sg-mapchip", style: {
      position: "absolute",
      right: 16,
      bottom: "calc(74px + env(safe-area-inset-bottom))",
      pointerEvents: "auto",
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      background: "#190c2c",
      color: "#fdfcf7",
      border: `2.5px solid ${INK}`,
      font: "800 12.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
      padding: "11px 14px",
      borderRadius: 999,
      cursor: "pointer",
      textShadow: "0 1px 2px rgba(0,0,0,.55)",
      boxShadow: `3px 3px 0 ${INK}`
    }, onClick: nearMe }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "#009E8E", stroke: "#fdfcf7", strokeWidth: "1.8", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "9", r: "2.6", fill: "#fdfcf7", stroke: "none" })), " ", _t(lang, "Une plage propre pr\xE8s de moi", "A clean beach near me", "Una playa limpia cerca")), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        "aria-label": muted ? _t(lang, "Activer le son d'\xE9chouage", "Enable beaching sound", "Activar sonido") : _t(lang, "Couper le son d'\xE9chouage", "Mute beaching sound", "Silenciar"),
        onClick: () => {
          const m = !muted;
          setMuted(m);
          mutedRef.current = m;
          if (!m) {
            ensureAudio();
            playBoump(0.9);
          }
        },
        style: {
          position: "absolute",
          right: 16,
          bottom: "calc(124px + env(safe-area-inset-bottom))",
          pointerEvents: "auto",
          width: 42,
          height: 42,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdf6e3",
          color: INK,
          border: `2.5px solid ${INK}`,
          fontSize: 17,
          borderRadius: 999,
          cursor: "pointer",
          boxShadow: `3px 3px 0 ${INK}`
        }
      },
      muted ? /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: INK, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M11 5 6 9H2v6h4l5 4V5Z" }), /* @__PURE__ */ React.createElement("path", { d: "m17 9 5 6M22 9l-5 6" })) : /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: INK, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M11 5 6 9H2v6h4l5 4V5Z" }), /* @__PURE__ */ React.createElement("path", { d: "M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" }))
    ), selected && onShare && !mapShareOff && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sg-mapchip",
        "aria-label": _t(lang, "Partager ma plage", "Share my beach", "Compartir mi playa"),
        onClick: onShareSel,
        style: {
          position: "absolute",
          right: 16,
          bottom: "calc(176px + env(safe-area-inset-bottom))",
          pointerEvents: "auto",
          width: 42,
          height: 42,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer"
        }
      },
      /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "#fdfcf7", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 15V4M8 8l4-4 4 4" }), /* @__PURE__ */ React.createElement("path", { d: "M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" }))
    ), /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "calc(120px + env(safe-area-inset-bottom))",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 7,
      pointerEvents: "none"
    } }, weekDigest && !selected && (() => {
      const lbl = weekDigest.calm ? _t(lang, "Cette semaine : rien en vue", "This week: nothing in sight", "Esta semana: nada a la vista") : weekDigest.flips > 0 ? _t(lang, `Cette semaine : ${weekDigest.flips} \xE0 surveiller \xB7 bascule ${ti(lang, DAY_LBL[weekDigest.flipDay])}`, `This week: ${weekDigest.flips} to watch \xB7 flips ${ti(lang, DAY_LBL[weekDigest.flipDay])}`, `Esta semana: ${weekDigest.flips} a vigilar \xB7 cambia ${ti(lang, DAY_LBL[weekDigest.flipDay])}`) : _t(lang, `Cette semaine : ${weekDigest.bestN} plages propres \xB7 meilleur ${ti(lang, DAY_LBL[weekDigest.bestDay])}`, `This week: ${weekDigest.bestN} clean \xB7 best ${ti(lang, DAY_LBL[weekDigest.bestDay])}`, `Esta semana: ${weekDigest.bestN} limpias \xB7 mejor ${ti(lang, DAY_LBL[weekDigest.bestDay])}`);
      const emoji = weekDigest.calm ? "\u{1F334}" : weekDigest.flips > 0 ? "\u{1F441}" : "\u{1F4C5}";
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          ref: digestBtnRef,
          role: weekhubOff ? void 0 : "button",
          tabIndex: weekhubOff ? void 0 : 0,
          "aria-haspopup": weekhubOff ? void 0 : "dialog",
          "aria-expanded": weekhubOff ? void 0 : showHub,
          "aria-label": weekhubOff ? void 0 : _t(lang, "Ouvrir le hub pr\xE9vision de ta semaine", "Open your week forecast hub", "Abrir tu centro de pron\xF3stico"),
          onClick: weekhubOff ? void 0 : () => {
            setShowHub(true);
            try {
              track && track("sg_weekhub_open_cta", { island });
            } catch (_) {
            }
          },
          onKeyDown: weekhubOff ? void 0 : (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowHub(true);
              try {
                track && track("sg_weekhub_open_cta", { island });
              } catch (_) {
              }
            }
          },
          style: {
            pointerEvents: weekhubOff || showHub ? "none" : "auto",
            cursor: weekhubOff ? "default" : "pointer",
            opacity: showHub ? 0 : 1,
            transition: "opacity .2s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            background: "#eafaf1",
            color: INK,
            border: `2px solid ${INK}`,
            boxShadow: `2px 2px 0 ${INK}`,
            borderRadius: 999,
            padding: "7px 13px",
            fontWeight: 800,
            fontSize: 11.5,
            lineHeight: 1,
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif"
          }
        },
        /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, emoji),
        /* @__PURE__ */ React.createElement("span", null, lbl),
        !weekhubOff && /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontWeight: 800, color: "#0a7d33" } }, "\u2197")
      );
    })(), mapPremium && mapFriseOff && day >= 1 && (() => {
      const far = day >= 4;
      const hitCount = beachList.filter((b) => b.days[day] === "avoid").length;
      const hitStr = hitCount > 0 ? _t(lang, `${hitCount} ${hitCount > 1 ? "plages touch\xE9es" : "plage touch\xE9e"}`, `${hitCount} ${hitCount > 1 ? "beaches hit" : "beach hit"}`, `${hitCount} ${hitCount > 1 ? "playas afectadas" : "playa afectada"}`) : _t(lang, "aucune plage touch\xE9e pr\xE9vue", "no beaches forecast hit", "ninguna playa afectada prevista");
      const dateStr = (() => {
        try {
          const c = beachList.find((b) => b.fc && b.fc[day] && b.fc[day].date);
          const ds = c && c.fc[day].date;
          if (!ds) return null;
          const dt = new Date(ds);
          return dt.toLocaleDateString(lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR", { weekday: "short", day: "numeric", month: "short" });
        } catch (_) {
          return null;
        }
      })();
      return /* @__PURE__ */ React.createElement("div", { role: "status", style: {
        pointerEvents: "none",
        maxWidth: 340,
        textAlign: "center",
        background: far ? "#fff3e0" : "#eafaf1",
        color: INK,
        border: `2px solid ${INK}`,
        boxShadow: `2px 2px 0 ${INK}`,
        borderRadius: 12,
        padding: "6px 12px",
        font: "700 11px/1.35 'Bricolage Grotesque',system-ui,sans-serif"
      } }, /* @__PURE__ */ React.createElement("b", { style: { fontWeight: 800 } }, _t(lang, "Pr\xE9vu", "Forecast", "Previsto"), " ", ti(lang, DAY_LBL[day]), dateStr ? ` \xB7 ${dateStr}` : "", " \xB7 ", hitStr), /* @__PURE__ */ React.createElement("br", null), far ? _t(lang, "Fin de semaine : on lit la tendance, pas encore la certitude. On affine chaque matin.", "End of week: we read the trend, not yet certainty. We sharpen it each morning.", "Fin de semana: leemos la tendencia, a\xFAn no la certeza. La afinamos cada ma\xF1ana.") : _t(lang, "Confiance forte sur ces jours \u2014 76 \xE0 79 % de justesse selon la saison.", "Strong confidence on these days \u2014 76-79% accuracy by season.", "Confianza alta en estos d\xEDas \u2014 76-79 % de acierto seg\xFAn temporada."));
    })(), mapPremium && mapFriseOff && premiumHint && /* @__PURE__ */ React.createElement("div", { role: "status", style: {
      pointerEvents: "none",
      maxWidth: 300,
      textAlign: "center",
      background: "#FFC72C",
      color: "#0d0b14",
      border: `2px solid ${INK}`,
      boxShadow: `2px 2px 0 ${INK}`,
      borderRadius: 12,
      padding: "6px 12px",
      font: "800 11px/1.3 'Bricolage Grotesque',system-ui,sans-serif"
    } }, "\u2B50 ", _t(lang, "Premium actif \u2014 fais glisser les jours, la pr\xE9vision est \xE0 toi.", "Premium active \u2014 slide through the days, the forecast is yours.", "Premium activo \u2014 desliza los d\xEDas, el pron\xF3stico es tuyo.")), /* @__PURE__ */ React.createElement("div", { style: {
      pointerEvents: "auto",
      display: "flex",
      gap: 4,
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 999,
      padding: 4
    } }, DAY_LBL.map((lbl, i) => {
      const locked = i >= 1 && !mapPremium;
      return /* @__PURE__ */ React.createElement("button", { type: "button", key: i, "aria-label": ti(lang, lbl) + (locked ? " \u{1F512}" : ""), style: {
        WebkitAppearance: "none",
        appearance: "none",
        border: day === i ? `2px solid ${INK}` : "2px solid transparent",
        position: "relative",
        background: day === i ? "#ff7a2f" : mapPremium && i >= 1 ? "rgba(255,199,44,.18)" : "transparent",
        color: INK,
        font: "800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
        padding: "7px 10px",
        borderRadius: 999,
        cursor: "pointer"
      }, onClick: () => {
        if (locked) {
          try {
            track && track("sg_map_scrub_locked", { day: i });
          } catch (_) {
          }
          ;
          onPremium && onPremium("map_scrub_forecast");
          return;
        }
        setDay(i);
        if (i >= 1 && mapPremium && mapFriseOff) {
          setPremiumHint(true);
          try {
            clearTimeout(hintTimerRef.current);
          } catch (_) {
          }
          ;
          hintTimerRef.current = setTimeout(() => setPremiumHint(false), 3200);
        }
        try {
          track && track("sg_map_scrub", { day: i, island, premium: !!mapPremium });
        } catch (_) {
        }
      } }, ti(lang, lbl), locked && /* @__PURE__ */ React.createElement("svg", { width: "8", height: "8", viewBox: "0 0 24 24", fill: "none", stroke: INK, strokeWidth: "2.6", style: { position: "absolute", top: 1, right: 2 } }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" })), mapPremium && !locked && i >= 1 && (() => {
        const tier = i >= 4 ? "low" : i === 3 ? "med" : "high";
        return /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
          display: "block",
          width: 4,
          height: 4,
          borderRadius: "50%",
          margin: "3px auto 0",
          boxSizing: "border-box",
          background: tier === "high" ? INK : "transparent",
          backgroundImage: tier === "med" ? `linear-gradient(90deg,${INK} 0 50%,transparent 50% 100%)` : "none",
          border: tier === "low" ? `1px dotted ${INK}` : tier === "med" ? `1px solid ${INK}` : "none"
        } });
      })());
    }))), !rootMode && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "calc(16px + env(safe-area-inset-bottom))",
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      pointerEvents: "auto",
      display: "flex",
      gap: 3,
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 999,
      padding: 5
    } }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      border: `2px solid ${INK}`,
      background: "#ffd23f",
      color: INK,
      font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
      padding: "8px 14px",
      borderRadius: 999,
      cursor: "pointer"
    } }, "\u2715 ", _t(lang, "Fermer", "Close", "Cerrar")))), tapFx.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, "aria-hidden": "true", style: { position: "absolute", left: t.x, top: t.y, width: 1, height: 1, pointerEvents: "none", zIndex: 5 } }, /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 0,
      top: 0,
      width: 54,
      height: 54,
      borderRadius: "50%",
      border: `2px solid ${t.hit ? "#FFC72C" : "#1EC8B0"}`,
      animation: noAnim ? "wmTapPingStatic .46s ease-out forwards" : "wmTapPing .64s cubic-bezier(.2,.7,.3,1) forwards"
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 0,
      top: 0,
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: t.hit ? "#FFC72C" : "#1EC8B0",
      boxShadow: `0 0 0 2px ${INK}`,
      animation: noAnim ? "wmTapPingStatic .46s ease-out forwards" : "wmTapCore .64s cubic-bezier(.2,.7,.3,1) forwards"
    } }))), selected && tagPos && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: tagPos.x,
      top: tagPos.y - 14,
      transform: "translate(-50%,-100%)",
      background: "#fdf6e3",
      border: `2.5px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 12,
      padding: "8px 11px",
      pointerEvents: "none",
      whiteSpace: "nowrap"
    } }, /* @__PURE__ */ React.createElement("div", { style: { font: "400 14px/1.1 'AntonLC','Anton',sans-serif", letterSpacing: ".01em", color: INK } }, selected.name), /* @__PURE__ */ React.createElement("div", { style: {
      font: "800 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
      letterSpacing: ".04em",
      textTransform: "uppercase",
      marginTop: 4,
      display: "flex",
      alignItems: "center",
      gap: 5,
      color: INK
    } }, /* @__PURE__ */ React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: STATUS_C[selected.days[day]] || "#9aa0a8", border: `1.5px solid ${INK}` } }), /* @__PURE__ */ React.createElement("span", null, ti(lang, STATUS_LBL[selected.days[day]] || ["\u2014", "\u2014", "\u2014"]))), selected.commune && /* @__PURE__ */ React.createElement("div", { style: { font: "700 10px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478", marginTop: 4 } }, selected.commune), friseOn && selected.days && /* @__PURE__ */ React.createElement(
      "div",
      {
        role: "group",
        "aria-label": _t(lang, `Pr\xE9vision 7 jours ${selected.name}`, `7-day forecast ${selected.name}`, `Pron\xF3stico 7 d\xEDas ${selected.name}`),
        style: { marginTop: 8, display: "flex", alignItems: "flex-start", gap: 3 }
      },
      [0, 1, 2, 3, 4, 5].map((d) => {
        const st = selected.days[d];
        const isHit = d === selected.firstHit;
        const bg = st ? STATUS_C[st] : null;
        const cf = selected.conf ? selected.conf[d] : null;
        const tier = cf == null ? null : d >= 4 ? "low" : cf >= 55 ? "high" : cf >= 38 ? "med" : "low";
        const lbl = ti(lang, DAY_LBL[d]);
        const stLbl = ti(lang, STATUS_LBL[st] || ["\u2014", "\u2014", "\u2014"]);
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: d,
            role: "img",
            "aria-label": `${lbl} \xB7 ${stLbl}${tier === "low" ? " \xB7 " + _t(lang, "indicatif", "indicative", "indicativo") : ""}`,
            style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 17, position: "relative" }
          },
          isHit && /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { position: "absolute", top: -9, fontSize: 8, lineHeight: 1 } }, "\u{1F6A9}"),
          /* @__PURE__ */ React.createElement("span", { style: { font: "800 7px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478", marginTop: isHit ? 3 : 0 } }, lbl),
          /* @__PURE__ */ React.createElement("div", { style: {
            width: 15,
            height: 15,
            borderRadius: 4,
            boxSizing: "border-box",
            background: bg || "#efe9da",
            backgroundImage: bg ? "none" : "repeating-linear-gradient(45deg,#d2ccbd 0 3px,#efe9da 3px 6px)",
            border: `${st === "avoid" ? 2.4 : 1.4}px solid ${INK}`,
            boxShadow: isHit ? `0 0 0 1.6px #FFC72C` : "none"
          } }),
          /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
            width: 5,
            height: 5,
            borderRadius: "50%",
            boxSizing: "border-box",
            background: tier === "high" ? INK : "transparent",
            backgroundImage: tier === "med" ? `linear-gradient(90deg,${INK} 0 50%,transparent 50% 100%)` : "none",
            border: tier === "low" ? `1px dotted ${INK}` : tier === "med" ? `1px solid ${INK}` : tier ? "none" : "none",
            opacity: tier ? 1 : 0
          } })
        );
      }),
      (selected.drift === "up" || selected.drift === "down") && /* @__PURE__ */ React.createElement(
        "span",
        {
          "aria-label": selected.drift === "up" ? _t(lang, "le banc se rapproche", "bank approaching", "el banco se acerca") : _t(lang, "le banc se disperse", "bank dispersing", "el banco se dispersa"),
          style: { font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif", color: selected.drift === "up" ? "#E8522A" : "#22C55E", marginLeft: 2, marginTop: 8 }
        },
        selected.drift === "up" ? "\u2197" : "\u2198"
      )
    ), friseOn && /* @__PURE__ */ React.createElement("div", { style: { font: "700 7.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478", marginTop: 5, maxWidth: 160, whiteSpace: "normal" } }, _t(lang, "Confiance forte J0-J2, tendance au-del\xE0 \u2014 76 \xE0 79 % de justesse selon la saison.", "Strong confidence days 0-2, trend after \u2014 76-79% accuracy by season.", "Confianza alta d\xEDas 0-2, tendencia despu\xE9s \u2014 76-79 % de acierto seg\xFAn temporada.")), friseOn && (() => {
      let off = false;
      try {
        off = /[?&]conflegend=0/.test(window.location.search);
      } catch (_) {
      }
      ;
      if (off) return null;
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, marginTop: 4, maxWidth: 170, flexWrap: "wrap" }, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 2.5, font: "700 7px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: "50%", background: INK } }), _t(lang, "mesur\xE9", "measured", "medido")), /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 2.5, font: "700 7px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: "50%", backgroundImage: `linear-gradient(90deg,${INK} 0 50%,transparent 50% 100%)`, border: `1px solid ${INK}`, boxSizing: "border-box" } }), _t(lang, "tendance", "trend", "tendencia")), /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 2.5, font: "700 7px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6478" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: "50%", border: `1px dotted ${INK}`, boxSizing: "border-box" } }), _t(lang, "horizon", "horizon", "horizonte")));
    })(), planB && (() => {
      const km = planB.km < 1 ? _t(lang, "< 1 km", "< 1 km", "< 1 km") : `${Math.round(planB.km)} km`;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: (e) => {
            try {
              e.stopPropagation();
            } catch (_) {
            }
            ;
            selectBeach(planB.beach);
            try {
              track && track("sg_map_planb", { island });
            } catch (_) {
            }
          },
          style: {
            pointerEvents: "auto",
            cursor: "pointer",
            marginTop: 7,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "#0f5132",
            color: "#eafaf0",
            border: `2px solid ${INK}`,
            borderRadius: 999,
            padding: "5px 9px",
            textAlign: "left",
            whiteSpace: "normal",
            maxWidth: 172,
            font: "800 9.5px/1.15 'Bricolage Grotesque',system-ui,sans-serif",
            boxShadow: `2px 2px 0 ${INK}`
          }
        },
        /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: { fontSize: 12, flexShrink: 0 } }, "\u2192"),
        /* @__PURE__ */ React.createElement("span", null, _t(lang, `Plut\xF4t ${planB.beach.name} \xB7 ${km}, propre`, `Better: ${planB.beach.name} \xB7 ${km}, clean`, `Mejor: ${planB.beach.name} \xB7 ${km}, limpia`))
      );
    })()), selected && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sg-mapcta",
        onClick: openBeach,
        onPointerDown: (e) => {
          try {
            e.stopPropagation();
          } catch (_) {
          }
          ;
          const sb = selected;
          if (sb && onOpenBeach) {
            lastPtrOpenRef.current = Date.now();
            try {
              track && track("sg_beach_open", { from: "map_cta" });
            } catch (_) {
            }
            ;
            onOpenBeach(sb);
          }
        },
        style: {
          position: "absolute",
          left: "50%",
          bottom: "calc(176px + env(safe-area-inset-bottom))",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
          touchAction: "manipulation",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          // Fond/texte forcés en CSS (.sg-mapcta) pour battre le skin de thème qui
          // strippait le gradient or → texte noir illisible sur carte sombre (rapport
          // fondateur). Pastille encre + bordure or + TEXTE BLANC = lisible garanti.
          color: "#fdfcf7",
          font: "800 13.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
          padding: "13px 18px",
          borderRadius: 999,
          cursor: "pointer",
          animation: "wmSlide .25s cubic-bezier(.34,1.56,.64,1) both"
        }
      },
      _t(lang, "Voir la plage", "Open beach", "Ver la playa"),
      " ",
      /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800 } }, "\u2192")
    ), mapHintPhase && /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: {
      position: "fixed",
      bottom: "calc(140px + env(safe-area-inset-bottom,0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 100,
      pointerEvents: "none",
      background: "rgba(17,70,62,0.9)",
      color: "#FFC72C",
      borderRadius: 20,
      padding: "8px 16px",
      font: "700 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
      whiteSpace: "nowrap",
      animation: mapHintPhase === "hiding" ? "wmHintOut .3s ease-in both" : "wmHintIn .3s ease-out both"
    } }, "\u{1F449} Tape une plage pour voir son \xE9tat")),
    showHub && !weekhubOff && typeof document !== "undefined" && createPortal(
      /* @__PURE__ */ React.createElement(Suspense, { fallback: null }, /* @__PURE__ */ React.createElement(
        LazyWeekHub,
        {
          lang,
          beachList,
          weekDigest,
          updatedAt,
          reliableHorizon: 3,
          pos: null,
          seasonOff: weekhubSeasonOff,
          seasonOutlook,
          island,
          track,
          onPremium,
          isPremium,
          whctaOff,
          onClose: () => {
            setShowHub(false);
            try {
              digestBtnRef.current && digestBtnRef.current.focus();
            } catch (_) {
            }
          },
          onSelectBeach: (b) => {
            setShowHub(false);
            try {
              selectBeach(b);
            } catch (_) {
            }
          },
          onPickDay: (d) => {
            setShowHub(false);
            try {
              setDay(d);
            } catch (_) {
            }
          },
          onPlannerOptin: (meta) => {
            try {
              track && track("sg_weekhub_planner", meta || {});
            } catch (_) {
            }
          }
        }
      )),
      document.body
    )
  );
}
export {
  WorldMapView as default
};
