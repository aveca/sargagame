// mcp.js — serveur MCP public en lecture seule de Sargagame (transport
// Streamable HTTP, mode stateless, protocole MCP 2026-07-28 via le SDK
// officiel @modelcontextprotocol/server, classe WebStandardStreamableHTTPServerTransport
// documentee pour Cloudflare Workers : sessionIdGenerator undefined = un
// serveur + un transport par requete, sans session, sans Durable Object).
// (Pas de wrapper `agents` : dependance inutile ici + conflit de peer React
// avec le front ; le transport officiel suffit, CORS/Origin geres ci-dessous.)
//
// PERIMETRE STRICT :
// - Lecture seule : aucun outil ne mute, aucun acces paiement/compte/secret.
// - Donnees : assets statiques publics servis par le Worker lui-meme, chemins
//   FIGES (jamais d'URL/hote fourni par l'appelant -> pas de SSRF, pas de fs).
// - Les beachId/paths fournis par l'appelant sont valides contre des listes
//   blanches (index plages, set du sitemap) avant tout acces.
// - Toute donnee absente reste absente (erreur explicite), toute donnee
//   datee porte sa fraicheur (updatedAt/erddapTimestamp/stale).
// - Compatible Workers ET Node >= 20 (Web standards uniquement) pour les tests.
//
// Branche dans workers/sargagame/index.js sur /mcp (et /mcp/), APRES les
// routes de paiement (intouchees) et AVANT la garde _private (qui ne matche
// pas /mcp de toute facon). Import DYNAMIQUE cote index.js : un probleme ici
// ne casse jamais les paiements (isolation de faute).
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_REGIONS, NEW_REGION_BEACHES, SARG_TO_BEACH, MCP_REGION_IDS, MCP_DOMAINS } from "./mcp-data.js";

export const MCP_VERSION = "1.0.0";
export const MCP_ROUTE = "/mcp";
const BODY_CAP = 512 * 1024; // corps JSON-RPC max
const PAGE_CAP = 262144; // page HTML max pour get_page_metadata
const FETCH_TIMEOUT_MS = 15000;
const RATE_MAX = 120; // requetes / minute / IP (par isolate, best-effort)
const RATE_WINDOW_MS = 60000;
const RATE_KEYS_MAX = 1000;

// Chemins d'assets FIGES servis par ce Worker (jamais d'entree utilisateur).
const ASSET_SARGASSUM = "/api/copernicus/sargassum.json";
const ASSET_BEACHES = "/data/beaches-list.json";
const ASSET_SITEMAP = "/sitemap.xml";

// ── Limiteur de debit (pur, testable) ─────────────────────────────────────
export function checkRateLimit(store, ip, nowMs) {
  const key = ip || "unknown";
  let rec = store.get(key);
  if (!rec || nowMs - rec.start >= RATE_WINDOW_MS) {
    rec = { count: 0, start: nowMs };
    store.set(key, rec);
    if (store.size > RATE_KEYS_MAX) {
      const oldest = store.keys().next().value;
      store.delete(oldest);
    }
  }
  rec.count += 1;
  if (rec.count > RATE_MAX) {
    return { allowed: false, retryAfterMs: RATE_WINDOW_MS - (nowMs - rec.start) };
  }
  return { allowed: true, retryAfterMs: 0 };
}
const rateStore = new Map();
function clientIp(request) {
  const h = request.headers;
  const cf = (h.get("cf-connecting-ip") || "").trim();
  if (cf) return cf.slice(0, 64);
  const xff = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  return (xff || "unknown").slice(0, 64);
}

// ── Helpers purs (exportes pour tests) ────────────────────────────────────
export function fold(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
export function clampInt(v, def, min, max) {
  const n = Number.isInteger(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}
export function parseSitemap(xml) {
  const out = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null && out.length < 5000) {
    const loc = m[1].trim();
    const lm = xml.slice(m.index, m.index + 600).match(/<lastmod>([^<]+)<\/lastmod>/);
    out.push({ loc, lastmod: lm ? lm[1] : null });
  }
  return out;
}
export function categoryOf(pathname) {
  const seg = String(pathname || "/").split("/").filter(Boolean)[0];
  return seg || "_root";
}
export function langOf(pathname, region) {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  if (pathname === "/es" || pathname.startsWith("/es/")) return "es";
  return region ? region.primaryLang : null;
}
export function parseHeadMeta(html) {
  const head = String(html || "").slice(0, 32768);
  const pick = (re) => {
    const m = head.match(re);
    return m ? m[1].trim().slice(0, 500) : null;
  };
  const title = pick(/<title>([^<]*)<\/title>/i);
  const description =
    pick(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    pick(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const canonical =
    pick(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    pick(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const lang = pick(/<html[^>]*lang=["']([^"']+)["']/i);
  const ogImage = pick(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const jsonld = (head.match(/application\/ld\+json/gi) || []).length;
  return { title, description, canonical, lang, ogImage, jsonld };
}
// Valide un chemin de page interne contre le set du sitemap (allowlist).
// Retourne le pathname normalise, ou throw {code} en cas de refus.
export function validatePagePath(p, locSet) {
  if (typeof p !== "string" || p.length < 1 || p.length > 500) throw { code: "invalid_path" };
  if (!p.startsWith("/")) throw { code: "invalid_path" };
  if (p.includes("\\")) throw { code: "invalid_path" };
  let decoded;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    throw { code: "invalid_path" };
  }
  const noQuery = decoded.split(/[?#]/)[0];
  const segs = noQuery.split("/");
  if (segs.some((s) => s === "." || s === "..")) throw { code: "invalid_path" };
  if (noQuery.includes("//")) throw { code: "invalid_path" };
  const pathname = noQuery === "" ? "/" : noQuery;
  if (!locSet.has(pathname)) throw { code: "page_not_indexed" };
  return pathname;
}
export function regionByHost(host) {
  const h = String(host || "").replace(/^www\./, "").toLowerCase();
  return MCP_REGIONS.find((r) => r.domain === h) || null;
}
function errPayload(code, detail) {
  return { content: [{ type: "text", text: JSON.stringify(detail ? { error: code, detail } : { error: code }) }], isError: true };
}
function okPayload(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
// Origine same-origin validee (domaine connu ou localhost de test).
// L'hote ne vient JAMAIS d'un parametre d'outil.
function checkedOrigin(req) {
  const u = new URL(req.url);
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!local && !MCP_DOMAINS.includes(host)) throw { code: "unknown_host" };
  return u.origin;
}
async function fetchText(url, cap) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw { code: "asset_unavailable", status: r.status };
    const text = await r.text();
    if (text.length > cap) throw { code: "asset_too_large" };
    return text;
  } catch (e) {
    if (e && e.code) throw e;
    throw { code: "asset_unavailable" };
  } finally {
    clearTimeout(t);
  }
}
const fetchJsonAsset = (origin, path) =>
  fetchText(origin + path, BODY_CAP).then((t) => JSON.parse(t));

// Statut d'observation direct d'une plage (niveaux Copernicus) : correspondance
// directe sur l'id, sinon via la table SARG_TO_BEACH (cles d'archive courtes).
// Retourne le statut ou null (pas de donnee direct fiable).
export function liveStatusOf(levels, beachId) {
  if (!Array.isArray(levels)) return null;
  const direct = levels.find((l) => l && l.id === beachId);
  if (direct && typeof direct.status === "string") return direct.status;
  const sargKey = Object.keys(SARG_TO_BEACH).find((k) => SARG_TO_BEACH[k] === beachId);
  if (!sargKey) return null;
  const via = levels.find((l) => l && l.id === sargKey);
  return via && typeof via.status === "string" ? via.status : null;
}
// Index plages : beaches-list.json (mq/gp, runtime) + table embarquee (4 nouvelles regions).
function buildBeachIndex(beachesList) {
  const idx = new Map();
  for (const b of beachesList || []) {
    if (b && b.id) idx.set(b.id, { id: b.id, name: b.name || b.id, commune: b.commune || "", island: b.island || "", slug: b.slug || b.id });
  }
  for (const [island, arr] of Object.entries(NEW_REGION_BEACHES)) {
    for (const b of arr) {
      if (!idx.has(b.id)) idx.set(b.id, { id: b.id, name: b.name, commune: b.commune || "", island, slug: b.slug || b.id });
    }
  }
  return idx;
}

// ── Fabrique de serveur (fraiche par requete, cf. docs createMcpHandler) ──
export function createSargaServer() {
  const server = new McpServer({ name: "sargagame", version: MCP_VERSION });

  server.registerTool("list_regions", {
    description: "Regions, domaines et langues publiques de Sargagame.",
    inputSchema: {},
  }, async () => okPayload({
    regions: MCP_REGIONS.map((r) => ({
      id: r.id, name: r.name, country: r.country, domain: r.domain,
      primaryLang: r.primaryLang, secondaryLangs: r.secondaryLangs,
      currency: r.currency, timezone: r.timezone,
    })),
    generatedAt: new Date().toISOString(),
  }));

  server.registerTool("search_beaches", {
    description: "Recherche de plages existantes (au moins un filtre requis). Le filtre status s'applique au statut d'observation direct (niveaux Copernicus, meme resolution que get_beach_status) ; les plages sans donnee direct sont exclues quand status est demande (compteur excludedNoLiveData). Sans filtre status, chaque resultat porte liveStatus (null si inconnu).",
    inputSchema: {
      query: z.string().min(1).max(80).optional(),
      island: z.enum(MCP_REGION_IDS).optional(),
      status: z.enum(["clean", "moderate", "avoid"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async (args, ctx) => {
    const q = typeof args.query === "string" ? fold(args.query.trim()) : "";
    const island = typeof args.island === "string" ? args.island : null;
    const status = typeof args.status === "string" ? args.status : null;
    if (!q && !island && !status) return errPayload("query_required", "Provide at least one of: query, island, status.");
    if (island && !MCP_REGION_IDS.includes(island)) return errPayload("unknown_island", "Known islands: " + MCP_REGION_IDS.join(", "));
    if (status && !["clean", "moderate", "avoid"].includes(status)) return errPayload("unknown_status", "Known statuses: clean, moderate, avoid.");
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let list, levels = null;
    try {
      list = await fetchJsonAsset(origin, ASSET_BEACHES);
      if (status) {
        const sarg = await fetchJsonAsset(origin, ASSET_SARGASSUM);
        levels = Array.isArray(sarg.levels) ? sarg.levels : [];
      }
    } catch (e) { return errPayload("data_unavailable"); }
    const idx = buildBeachIndex(Array.isArray(list) ? list : []);
    const limit = clampInt(args.limit, 20, 1, 50);
    const out = [];
    let excludedNoLiveData = 0;
    for (const b of idx.values()) {
      if (island && b.island !== island) continue;
      if (q && !(fold(b.name).includes(q) || fold(b.commune).includes(q) || fold(b.id).includes(q) || fold(b.slug).includes(q))) continue;
      const liveStatus = levels ? liveStatusOf(levels, b.id) : null;
      if (status) {
        if (liveStatus === null) { excludedNoLiveData += 1; continue; }
        if (liveStatus !== status) continue;
      }
      out.push({ id: b.id, name: b.name, commune: b.commune, island: b.island, slug: b.slug, liveStatus });
      if (out.length >= limit) break;
    }
    return okPayload({ beaches: out, count: out.length, excludedNoLiveData });
  });

  const resolveBeachId = (beachId, idx) => {
    if (typeof beachId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(beachId)) return { error: "invalid_beach_id" };
    if (idx.has(beachId)) return { id: beachId };
    return { error: "beach_not_found" };
  };
  const loadLive = async (origin) => {
    const [sarg, list] = await Promise.all([
      fetchJsonAsset(origin, ASSET_SARGASSUM),
      fetchJsonAsset(origin, ASSET_BEACHES),
    ]);
    return { sarg, idx: buildBeachIndex(Array.isArray(list) ? list : []) };
  };
  const freshnessOf = (sarg) => ({
    updatedAt: sarg.updatedAt || null,
    erddapTimestamp: sarg.erddapTimestamp || null,
    dataAgeMinutes: typeof sarg.dataAgeMinutes === "number" ? sarg.dataAgeMinutes : null,
    stale: sarg.stale === true,
    source: sarg.source || "erddap-live",
  });

  server.registerTool("get_beach_status", {
    description: "Statut observe, score, source et fraicheur d'une plage existante. Absent = explicitement absent, jamais invente.",
    inputSchema: { beachId: z.string().min(1).max(64) },
  }, async (args, ctx) => {
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let sarg, idx;
    try {
      ({ sarg, idx } = await loadLive(origin));
    } catch (e) { return errPayload("data_unavailable"); }
    const r = resolveBeachId(args.beachId, idx);
    if (r.error) return errPayload(r.error);
    const info = idx.get(r.id);
    const levels = Array.isArray(sarg.levels) ? sarg.levels : [];
    const live = levels.find((l) => l && l.id === r.id)
      || levels.find((l) => l && SARG_TO_BEACH[l.id] === r.id);
    if (!live) {
      return okPayload({
        id: r.id, name: info.name, island: info.island, live: false,
        reason: "no_live_data",
        freshness: freshnessOf(sarg),
      });
    }
    return okPayload({
      id: r.id, name: info.name, island: info.island, live: true,
      status: live.status || null, score: typeof live.score === "number" ? live.score : null,
      confidence: typeof live.confidence === "number" ? live.confidence : null,
      dataSource: live.source || null,
      freshness: freshnessOf(sarg),
    });
  });

  server.registerTool("get_beach_forecast", {
    description: "Previsions reellement disponibles pour une plage (horizon borne, types et regimes inclus).",
    inputSchema: { beachId: z.string().min(1).max(64), days: z.number().int().min(1).max(7).optional() },
  }, async (args, ctx) => {
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let sarg, idx;
    try {
      ({ sarg, idx } = await loadLive(origin));
    } catch (e) { return errPayload("data_unavailable"); }
    const r = resolveBeachId(args.beachId, idx);
    if (r.error) return errPayload(r.error);
    const weekly = sarg.weekly && typeof sarg.weekly === "object" ? sarg.weekly : {};
    const entry = weekly[r.id] || weekly[Object.keys(SARG_TO_BEACH).find((k) => SARG_TO_BEACH[k] === r.id) || ""];
    const all = entry && Array.isArray(entry.forecast) ? entry.forecast : [];
    const days = clampInt(args.days, 7, 1, 7);
    if (!all.length) {
      return okPayload({ id: r.id, forecast: [], horizon: { available: 0, requested: days }, freshness: freshnessOf(sarg), reason: "no_forecast_data" });
    }
    return okPayload({
      id: r.id,
      forecast: all.slice(0, days).map((f) => ({
        day: f.day || null, date: f.date || null, status: f.status || null,
        afai: typeof f.afai === "number" ? f.afai : null,
        confidence: typeof f.confidence === "number" ? f.confidence : null,
        type: f.type || null, regime: f.regime || null,
      })),
      horizon: { available: all.length, requested: days },
      freshness: freshnessOf(sarg),
    });
  });

  const loadSitemapSet = async (origin) => {
    const xml = await fetchText(origin + ASSET_SITEMAP, BODY_CAP);
    const entries = parseSitemap(xml);
    return { entries, set: new Set(entries.map((e) => new URL(e.loc).pathname)) };
  };

  server.registerTool("list_public_categories", {
    description: "Categories reelement publiees (regroupement des URL du sitemap par premier segment).",
    inputSchema: {},
  }, async (_args, ctx) => {
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let entries;
    try {
      ({ entries } = await loadSitemapSet(origin));
    } catch (e) { return errPayload("data_unavailable"); }
    const cats = new Map();
    for (const e of entries) {
      const c = categoryOf(new URL(e.loc).pathname);
      if (!cats.has(c)) cats.set(c, { category: c, count: 0, examples: [] });
      const rec = cats.get(c);
      rec.count += 1;
      if (rec.examples.length < 3) rec.examples.push(e.loc);
    }
    return okPayload({ total: entries.length, categories: [...cats.values()].sort((a, b) => b.count - a.count) });
  });

  server.registerTool("search_public_pages", {
    description: "Recherche plein-texte (insensible aux accents) dans les URL du sitemap uniquement (pas dans les titres de pages : aucun index de titres embarque, aucun fetch massif).",
    inputSchema: {
      query: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(50).optional(),
      lang: z.enum(["fr", "en", "es"]).optional(),
    },
  }, async (args, ctx) => {
    const q = typeof args.query === "string" ? fold(args.query.trim()) : "";
    if (!q) return errPayload("query_required");
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let entries;
    try {
      ({ entries } = await loadSitemapSet(origin));
    } catch (e) { return errPayload("data_unavailable"); }
    const region = regionByHost(new URL(origin).hostname);
    const limit = clampInt(args.limit, 20, 1, 50);
    const out = [];
    for (const e of entries) {
      const pathname = new URL(e.loc).pathname;
      if (args.lang && langOf(pathname, region) !== args.lang) continue;
      if (!fold(e.loc).includes(q)) continue;
      out.push({ url: e.loc, lastmod: e.lastmod, lang: langOf(pathname, region) });
      if (out.length >= limit) break;
    }
    return okPayload({ pages: out, count: out.length });
  });

  server.registerTool("get_page_metadata", {
    description: "Titre, description, canonical, langue et image Open Graph d'une page interne listee au sitemap (chemin valide contre le sitemap, rien d'autre). listedInSitemap signifie 'present au sitemap', pas 'indexe par Google'. Seule l'image Open Graph est exposee (pas d'inventaire complet des assets).",
    inputSchema: { path: z.string().min(1).max(500) },
  }, async (args, ctx) => {
    let origin;
    try {
      origin = checkedOrigin(ctx.http.req);
    } catch (e) { return errPayload(e.code || "unknown_host"); }
    let entries, set;
    try {
      ({ entries, set } = await loadSitemapSet(origin));
    } catch (e) { return errPayload("data_unavailable"); }
    let pathname;
    try {
      pathname = validatePagePath(args.path, set);
    } catch (e) { return errPayload(e.code || "invalid_path"); }
    let html;
    try {
      html = await fetchText(origin + pathname, PAGE_CAP);
    } catch (e) { return errPayload("fetch_failed"); }
    const meta = parseHeadMeta(html);
    const region = regionByHost(new URL(origin).hostname);
    return okPayload({
      url: origin + pathname, path: pathname,
      title: meta.title, description: meta.description, canonical: meta.canonical,
      lang: meta.lang || langOf(pathname, region),
      ogImage: meta.ogImage, jsonLdBlocks: meta.jsonld,
      listedInSitemap: true, fetchedAt: new Date().toISOString(),
    });
  });

  return server;
}

// ── Point d'entree HTTP (appele par index.js sur /mcp) ────────────────────
export function corsPreflight(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && MCP_DOMAINS.some((d) => origin === "https://" + d)) {
    headers["access-control-allow-origin"] = origin;
  }
  return new Response(null, { status: 204, headers });
}
function clientIpFrom(request) {
  return clientIp(request);
}
export async function handleMcp(request, opts) {
  // opts.allowLocalHost (tests uniquement) : valeur exacte du header Host a
  // ajouter a l'allowlist DNS rebinding (ex. "127.0.0.1:PORT" de test).
  // index.js ne le passe JAMAIS : en prod, seuls les 6 domaines passent.
  opts = opts || {};
  const extraHosts = typeof opts.allowLocalHost === "string" && opts.allowLocalHost ? [opts.allowLocalHost] : [];
  if (request.method === "OPTIONS") return corsPreflight(request);
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", allow: "POST, OPTIONS" },
    });
  }
  const rl = checkRateLimit(rateStore, clientIpFrom(request), Date.now());
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && declared !== "" && Number(declared) > BODY_CAP) {
    return new Response(JSON.stringify({ error: "body_too_large" }), {
      status: 413, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  let raw = "";
  try {
    const reader = request.body ? request.body.getReader() : null;
    if (!reader) {
      raw = await request.text();
    } else {
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_CAP) {
          try { await reader.cancel(); } catch {}
          return new Response(JSON.stringify({ error: "body_too_large" }), {
            status: 413, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          });
        }
        chunks.push(value);
      }
      const buf = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
      raw = new TextDecoder().decode(buf);
    }
  } catch {
    return new Response(JSON.stringify({ error: "body_unreadable" }), {
      status: 400, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  let parsedBody;
  try {
    parsedBody = raw === "" ? null : JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  try {
    const server = createSargaServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      allowedHosts: [...MCP_DOMAINS, ...extraHosts],
      allowedOrigins: [...MCP_DOMAINS.map((d) => "https://" + d)],
      enableDnsRebindingProtection: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody });
  } catch (e) {
    try { console.error("[mcp] handler_error"); } catch {}
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
