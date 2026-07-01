/**
 * BeachPhotos — galerie « photos visiteurs » MODÉRÉES sur la fiche plage.
 *
 * Pourquoi : 2e forme de « preuve du présent » (après les webcams), et la SEULE qui
 * marche sur les 136+ plages (pas seulement celles équipées d'une cam). Ce sont NOS
 * photos (uploadées dans l'app, consenties, modérées) — distinctes des photos FB
 * scrapées que `FbPostsStrip` n'affiche PAS (re-hébergement/légal).
 *
 * Source : Supabase (table `photos`, status='approved', cf. src/supabasePhotos.js).
 * Lecture par plage à l'ouverture de la fiche (cache module-level). Rend `null` si
 * Supabase pas configuré ou aucune photo approuvée → inerte tant que le backend
 * n'est pas branché. Composant autonome → import direct (pas de cycle).
 */
import React, { useState, useEffect } from "react"
import { fetchApprovedPhotos, supabaseConfigured } from "./supabasePhotos.js"

// Cache module-level par plage : une seule requête par fiche ouverte.
const _cache = new Map()
function loadPhotos(beachId) {
  if (!_cache.has(beachId)) {
    _cache.set(beachId, fetchApprovedPhotos(beachId).catch(() => []))
  }
  return _cache.get(beachId)
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

// Flag rollback ?vseed=0 : désactive le nudge de recrutement sur galerie vide
// (retour au comportement historique = rien afficher). Lu en inline par feature.
const SEED_OFF = typeof window !== "undefined" && /[?&]vseed=0/.test(window.location.search)

export function BeachPhotos({ beach, lang = "fr", max = 6, canContribute = false }) {
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    if (!beach || !beach.id || !supabaseConfigured()) return
    let alive = true
    loadPhotos(beach.id).then((list) => { if (alive) setPhotos(list || []) })
    return () => { alive = false }
  }, [beach && beach.id])

  // photos===null → en cours de chargement (ou Supabase non configuré) : rien.
  if (!photos) return null
  // Galerie vide MAIS backend prêt + upload possible → nudge de rareté (« sois le
  // premier ») pour amorcer le supply, plutôt qu'un vide muet. Attaque l'avantage
  // « participation » du concurrent : nos 136 vitrines recrutent au lieu de dormir.
  // Pas de 2e bouton (celui de BeachReport est juste au-dessus) : on le CADRE.
  if (!photos.length) {
    if (SEED_OFF || !canContribute) return null
    return (
      <div style={{ margin: "12px 0 4px", padding: "10px 14px", borderRadius: 12,
        background: "var(--sg-bgD,#F7F5EF)", border: "1px dashed var(--sg-border,rgba(0,0,0,.14))",
        fontSize: 11.5, fontWeight: 600, color: "var(--sg-mid,#7a7768)",
        display: "flex", alignItems: "center", gap: 8, lineHeight: 1.35 }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>📸</span>
        {_t(lang,
          "Personne n'a encore montré cette plage aujourd'hui — ta photo sera la première.",
          "Nobody has shown this beach today yet — your photo would be the first.",
          "Nadie ha mostrado esta playa hoy — tu foto sería la primera.")}
      </div>
    )
  }
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
