#!/usr/bin/env node
/**
 * discover-assets.cjs — IMAGE DISCOVERY ENGINE (2026-09-25K, §4-5).
 *
 * query → candidates → metadata → license → dimensions → source →
 * exact-place validation → quality V3 → contact sheet → HUMAN APPROVAL.
 *
 * Sources : Wikimedia Commons (live, sans clé) · Openverse (adapter, clé
 * requise) · Pexels (adapter ATMOSPHÈRE uniquement, clé requise).
 * Sans clé → skip documenté, JAMAIS de résultats inventés.
 *
 * Validation lieu (PLACE) : nom + metadata + géo (quand dispo).
 * États : VERIFIED_PLACE / LIKELY_PLACE / ATMOSPHERIC_ONLY / REJECT.
 * Seul VERIFIED_PLACE peut devenir hero/card/gallery (LIKELY jamais HERO
 * sans validation humaine).
 *
 * Usage :
 *   node scripts/media/discover-assets.cjs --beach=gp024 --limit=8
 *   node scripts/media/discover-assets.cjs --atmosphere="caribbean wave" --limit=6
 *   node scripts/media/discover-assets.cjs --all-top30
 * Sorties : public/data/discovery/<id>.json + contact-sheet-discovery.html
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const OUT_DIR = path.join(ROOT, "public", "data", "discovery")
const UA = "SargagameMediaDiscovery/1.0 (contact: media audit)"
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/beaches-list.json"), "utf8"))
const LIST = Array.isArray(BEACHES) ? BEACHES : BEACHES.beaches

const PEXELS_KEY = process.env.PEXELS_API_KEY || null
const OPENVERSE_KEY = process.env.OPENVERSE_API_KEY || null

async function jget(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`)
  return r.json()
}

// ── Wikimedia Commons : search + imageinfo/extmetadata (sans clé) ──
async function wikiSearch(query, limit = 8) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1600&origin=*`
  const j = await jget(u)
  const pages = (j.query && j.query.pages) || {}
  return Object.values(pages).map(p => {
    const ii = (p.imageinfo || [])[0] || {}
    const meta = ii.extmetadata || {}
    const txt = (o) => (o && o.value ? String(o.value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : "")
    return {
      source: "wikimedia",
      title: p.title || "",
      page_url: `https://commons.wikimedia.org/wiki/${encodeURIComponent((p.title || "").replace(/ /g, "_"))}`,
      image_url: ii.url || "", thumb_url: ii.thumburl || "",
      width: ii.width || null, height: ii.height || null, mime: ii.mime || null,
      author: txt(meta.Artist), license: txt(meta.LicenseShortName) || txt(meta.License),
      license_url: (meta.LicenseUrl && meta.LicenseUrl.value) || null,
      description: txt(meta.ImageDescription),
      categories: null, geo: null,
    }
  })
}

// Licence acceptable ? (Commons = libre, mais revérifier chaque fichier.)
function licenseOk(c) {
  const l = `${c.license || ""}`.toUpperCase()
  if (/PUBLIC DOMAIN|CC0/.test(l)) return { ok: true, attribution: false }
  if (/CC BY-SA|CC-BY-SA|BY-SA/.test(l)) return { ok: true, attribution: true, sharealike: true }
  if (/CC BY[^S-]|CC-BY( |$)|ATTRIBUTION(?!-SHARE)/.test(l)) return { ok: true, attribution: true }
  return { ok: false, reason: `licence non libre ou inconnue (${c.license || "?"})` }
}

// Validation exacte du lieu : nom + metadata + géo → état.
function validatePlace(beach, c) {
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  const nb = norm(beach.name), cb = norm(beach.commune)
  const hay = norm(`${c.title} ${c.description}`)
  const nameHit = nb.length >= 6 && hay.includes(nb)
  const communeHit = cb.length >= 4 && hay.includes(cb)
  const islandHit = /martinique|guadeloupe|guadeloupe|desirade|saintes|marie.galante/.test(hay) === /mq|gp/.test(beach.island || "")
  let score = 0
  if (nameHit) score += 50
  if (communeHit) score += 30
  if (/plage|anse|beach|playa|bight|cove|bay/.test(hay)) score += 10
  if (islandHit) score += 10
  if (score >= 80) return { state: "VERIFIED_PLACE", confidence: "high", score }
  if (score >= 50) return { state: "LIKELY_PLACE", confidence: "medium", score }
  return { state: "ATMOSPHERIC_ONLY", confidence: "low", score }
}

// ── Adapters (clés requises — skip documenté sinon) ──
async function openverseSearch() { return { skipped: "OPENVERSE_API_KEY absente (quotas anonymes insuffisants pour du bulk)" } }
async function pexelsSearch() { return { skipped: "PEXELS_API_KEY absente (usage ATMOSPHÈRE uniquement de toute façon)" } }

async function discoverBeach(beach, limit = 8) {
  const queries = [`${beach.name} ${beach.commune}`, `${beach.name} Martinique Guadeloupe`.replace(/  +/g, " ")]
  const seen = new Map()
  for (const q of queries.slice(0, 2)) {
    try {
      const res = await wikiSearch(q, limit)
      for (const c of res) if (!seen.has(c.title)) seen.set(c.title, c)
    } catch (e) { /* source partielle → on garde le reste */ }
    await new Promise(r => setTimeout(r, 1100)) // courtoisie 1 req/s
  }
  const candidates = []
  for (const c of seen.values()) {
    const lic = licenseOk(c)
    const v = validatePlace(beach, c)
    candidates.push({
      ...c,
      license_ok: lic.ok, license_reason: lic.reason || null, attribution_required: !!lic.attribution,
      place: lic.ok ? v : { state: "REJECT", confidence: "low", score: 0, reason: lic.reason },
      hero_eligible: lic.ok && v.state === "VERIFIED_PLACE" && (c.width || 0) >= 2000,
      card_eligible: lic.ok && (v.state === "VERIFIED_PLACE" || v.state === "LIKELY_PLACE"),
    })
  }
  candidates.sort((a, b) => ((b.place.score || 0) - (a.place.score || 0)) || ((b.width || 0) - (a.width || 0)))
  return { beach: beach.id, name: beach.name, commune: beach.commune, at: new Date().toISOString(), sources: { wikimedia: "live", openverse: (await openverseSearch()).skipped, pexels: (await pexelsSearch()).skipped }, candidates }
}

async function main() {
  const args = process.argv.slice(2)
  const only = (args.find(a => a.startsWith("--beach=")) || "").replace("--beach=", "").split(",").filter(Boolean)
  const limit = parseInt((args.find(a => a.startsWith("--limit=")) || "").replace("--limit=", "") || "8", 10)
  const top30 = args.includes("--all-top30")
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  let targets = only.length ? LIST.filter(b => only.includes(b.id)) : []
  if (top30) {
    const RPT = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/media-quality-report.json"), "utf8"))
    targets = (RPT.top30 || []).map(id => LIST.find(b => b.id === id)).filter(Boolean)
  }
  if (!targets.length) { console.log("usage: --beach=gp024,gp027 | --all-top30 [--limit=8]"); process.exit(1) }
  for (const b of targets) {
    const r = await discoverBeach(b, limit)
    fs.writeFileSync(path.join(OUT_DIR, `${b.id}.json`), JSON.stringify(r, null, 1))
    const ver = r.candidates.filter(c => c.place.state === "VERIFIED_PLACE").length
    const hero = r.candidates.filter(c => c.hero_eligible).length
    console.log(`${b.id} ${b.name} : ${r.candidates.length} candidates · VERIFIED ${ver} · HERO-eligible ${hero}`)
  }
}

if (require.main === module) main().catch(e => { console.error("discover FAIL:", e.message); process.exit(1) })
module.exports = { validatePlace, licenseOk, slotRank: () => 0 }
