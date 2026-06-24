#!/usr/bin/env node
/**
 * build-region-outlines.cjs — géométrie côtière RÉELLE par région (carte SVG-monde),
 * pour que la refonte carte couvre TOUS les sites, pas que MQ/GP.
 *
 * Pour chaque région (regions/<id>.json → bbox) : récupère le polygone terre OSM
 * (Nominatim), le DÉCOUPE à la bbox de la région (Sutherland-Hodgman), simplifie
 * (Douglas-Peucker), projette en viewBox 800×600 (equirectangulaire, lat-corrigé).
 * Sortie : public/data/region-outlines/<id>.json = { id, viewBox, bbox, proj, path }.
 * → la carte projette les plages sur la MÊME bbox/proj → elles tombent sur la côte.
 *
 * Îles (mq/gp/puntacana=Hispaniola) : polygone île. Côtes continentales
 * (florida/rivieramaya) : polygone état, découpé à la bbox = la portion côtière vue.
 * Relancer : node scripts/build-region-outlines.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUTDIR = path.join(ROOT, "public", "data", "region-outlines");

// requête Nominatim de la masse terrestre par région (la bbox région découpe ensuite)
const QUERY = {
  mq: "Martinique",
  gp: "Guadeloupe",
  puntacana: "Higüey, Dominican Republic",
  florida: "Florida, USA",
  rivieramaya: "Quintana Roo, Mexico",
};

function clampPolyToBBox(ring, w, s, e, n) {
  // Sutherland-Hodgman : clip le polygone (lng,lat) au rectangle [w,s,e,n]
  function clip(poly, inside, intersect) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const inA = inside(A), inB = inside(B);
      if (inA) { out.push(A); if (!inB) out.push(intersect(A, B)); }
      else if (inB) { out.push(intersect(A, B)); }
    }
    return out;
  }
  let p = ring.slice();
  p = clip(p, P => P[0] >= w, (A, B) => { const t = (w - A[0]) / (B[0] - A[0]); return [w, A[1] + t * (B[1] - A[1])]; });
  if (!p.length) return [];
  p = clip(p, P => P[0] <= e, (A, B) => { const t = (e - A[0]) / (B[0] - A[0]); return [e, A[1] + t * (B[1] - A[1])]; });
  if (!p.length) return [];
  p = clip(p, P => P[1] >= s, (A, B) => { const t = (s - A[1]) / (B[1] - A[1]); return [A[0] + t * (B[0] - A[0]), s]; });
  if (!p.length) return [];
  p = clip(p, P => P[1] <= n, (A, B) => { const t = (n - A[1]) / (B[1] - A[1]); return [A[0] + t * (B[0] - A[0]), n]; });
  return p;
}

function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
  return [a, b];
}

async function nominatim(q) {
  const url = "https://nominatim.openstreetmap.org/search.php?q=" + encodeURIComponent(q) + "&polygon_geojson=1&format=jsonv2&limit=3";
  const r = await fetch(url, { headers: { "User-Agent": "sargasses-region-outlines/1.0 (alerte@sargasses-martinique.com)" } });
  const a = await r.json();
  // plus grand polygone (Polygon ou MultiPolygon)
  let best = null, bestLen = 0;
  for (const it of a) {
    const g = it.geojson; if (!g) continue;
    const rings = g.type === "MultiPolygon" ? g.coordinates.map(p => p[0]) : g.type === "Polygon" ? [g.coordinates[0]] : [];
    for (const ring of rings) if (ring.length > bestLen) { best = ring; bestLen = ring.length; }
  }
  return best;
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const VBW = 800, VBH = 600, PAD = 38;
  const only = process.argv[2]; // optionnel : ne (re)générer qu'une région
  for (const id of Object.keys(QUERY)) {
    if (only && id !== only) continue;
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "regions", id + ".json"), "utf8"));
    const [w, s, e, n] = cfg.bbox;
    process.stdout.write(`• ${id} (${QUERY[id]}) … `);
    let ring;
    try { ring = await nominatim(QUERY[id]); } catch (err) { console.log("FETCH ERR", err.message); continue; }
    if (!ring) { console.log("no polygon"); continue; }
    // drop doublon de fermeture
    if (ring.length > 1) { const f = ring[0], l = ring[ring.length - 1]; if (f[0] === l[0] && f[1] === l[1]) ring = ring.slice(0, -1); }
    let clipped = clampPolyToBBox(ring, w, s, e, n);
    if (clipped.length < 3) { console.log("clip vide (polygone ne couvre pas la bbox)"); continue; }
    // simplifier (tolérance ~ 0.4% de la largeur bbox)
    const eps = (e - w) * 0.004;
    let simp = dp(clipped, eps);
    // projection bbox région → viewBox
    const meanLat = (s + n) / 2, kx = Math.cos(meanLat * Math.PI / 180);
    const wkm = (e - w) * kx, hkm = (n - s);
    const sc = Math.min((VBW - 2 * PAD) / wkm, (VBH - 2 * PAD) / hkm);
    const offX = (VBW - wkm * sc) / 2, offY = (VBH - hkm * sc) / 2;
    const toVB = (la, lo) => [offX + (lo - w) * kx * sc, offY + (n - la) * sc];
    const d = "M" + simp.map(p => { const v = toVB(p[1], p[0]); return v[0].toFixed(1) + " " + v[1].toFixed(1); }).join(" L") + " Z";
    const out = { id, name: cfg.name, viewBox: [VBW, VBH], bbox: { minLng: w, maxLng: e, minLat: s, maxLat: n }, proj: { kx, sc, offX, offY }, path: d, points: simp.length };
    fs.writeFileSync(path.join(OUTDIR, id + ".json"), JSON.stringify(out));
    console.log(`${ring.length}→${simp.length} pts, ${d.length} chars ✓`);
    await new Promise(r => setTimeout(r, 1200)); // poli avec Nominatim
  }
  console.log("\n✓ public/data/region-outlines/ écrit");
}
main();
