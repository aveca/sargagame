/**
 * BeachPhotos — galerie « photos visiteurs » MODÉRÉES sur la fiche plage.
 *
 * Pourquoi : la 2e forme de « preuve du présent » (après les webcams), et la SEULE
 * qui marche sur les 136+ plages (pas seulement celles équipées d'une cam). Ce sont
 * NOS photos (uploadées dans l'app, consenties, modérées) — distinctes des photos FB
 * scrapées que `FbPostsStrip` n'affiche PAS (re-hébergement/légal). Comme on les
 * héberge nous-mêmes avec consentement, on a le droit de les montrer.
 *
 * Données : `public/api/community/photos.json` = { updatedAt, beaches:{ [id]:[{url,ts,level?}] } }.
 * Bakée en CI par scripts/automation/build-community-photos.cjs (photos APPROUVÉES
 * uniquement). Composant autonome (n'importe rien de Sargasses_PROD) → import direct.
 */
import React, { useState, useEffect } from "react"

// Cache module-level : un seul fetch partagé par toutes les fiches.
let _photosPromise = null
function loadPhotos() {
  if (!_photosPromise) {
    _photosPromise = fetch("/api/community/photos.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && d.beaches) || {})
      .catch(() => ({}))
  }
  return _photosPromise
}

const _t = (lang, fr, en, es) => (lang === "es" ? es : lang === "en" ? en : fr)
const GLYPH = { clean: "✅", moderate: "⚠️", avoid: "🚫" }

function timeAgo(ts, lang) {
  try {
    const h = Math.round(Math.max(0, Date.now() - new Date(ts).getTime()) / 3.6e6)
    if (h < 1) return _t(lang, "à l'instant", "just now", "ahora")
    if (h < 24) return _t(lang, `il y a ${h}h`, `${h}h ago`, `hace ${h}h`)
    const d = Math.round(h / 24)
    return _t(lang, `il y a ${d}j`, `${d}d ago`, `hace ${d}d`)
  } catch (_) { return "" }
}

export function BeachPhotos({ beach, lang = "fr", max = 6 }) {
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    let alive = true
    loadPhotos().then((all) => { if (alive) setPhotos(all[beach.id] || []) })
    return () => { alive = false }
  }, [beach && beach.id])

  if (!photos || !photos.length) return null
  const list = photos.slice(0, max)

  return (
    <div style={{ margin: "14px 0 4px", padding: "12px 14px", borderRadius: 14,
      background: "var(--sg-bgD,#F7F5EF)", border: "1px solid var(--sg-border,rgba(0,0,0,.04))" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sg-ink,#1d2b3a)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <span>📸</span>
        {_t(lang,
          `${photos.length} photo${photos.length > 1 ? "s" : ""} de visiteurs`,
          `${photos.length} visitor photo${photos.length > 1 ? "s" : ""}`,
          `${photos.length} foto${photos.length > 1 ? "s" : ""} de visitantes`)}
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--sg-mid,#8a93a0)" }}>
          · {_t(lang, "vérifié au sol", "verified on-site", "verificado in situ")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
        {list.map((p, i) => (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
            style={{ position: "relative", flex: "0 0 auto", width: 140, height: 105, borderRadius: 10, overflow: "hidden", background: "#000", display: "block" }}>
            <img src={p.url} alt={beach.name} loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 6px 4px",
              background: "linear-gradient(transparent,rgba(0,0,0,.7))", color: "#fff", fontSize: 10, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{p.level && GLYPH[p.level] ? GLYPH[p.level] + " " : ""}{timeAgo(p.ts, lang)}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default BeachPhotos
