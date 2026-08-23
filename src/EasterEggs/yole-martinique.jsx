/**
 * Easter egg yole Martinique — ajout ADDITIF sur layer NEAR ArchipelView.
 * Spécifications (03-MOTIF-KIT.md) :
 * - Silhouette yole ronde colorée (rouge + blanc, voiles traditionnelles rondes)
 * - Dérive en silhouette sur fond mer
 * - 80–150s ambient, jamais traverse, juste dérive + micro-respiration
 * - 1 seul rAF hub (déjà en place) — NE PAS en rajouter
 * - prefers-reduced-motion = tableau figé (early-return avant d'armer rAF)
 * - Échelle : 12% largeur viewBox
 * - Ancre ~x=400 y=380 viewBox
 * - Ajoutatif, jamais refonte : <g> injecté sur ArchipelView existant
 * - Pas de setPointerCapture (kill CTA)
 * - Couleur de marque snap when stabilized (corail #E8522A)
 */

import { useEffect, useRef } from "react"

// Micro-respiration lente (80–150s) — pas de setPointerCapture
const microBreath = (t) => {
  const phase = (t % 180) / 180 // 0→1 sur 180s
  return `transform: translate(${Math.sin(phase * Math.PI) * 2}px, ${Math.cos(phase * Math.PI) * 1}px)`
}

// SVG yole Martinique — rouge + blanc, voiles rondes
const yoleSvg = `
<svg viewBox="0 0 120 80" style="width: 12px; height: 8px; flex-shrink: 0;">
  <g fill="none" stroke="currentColor" strokeWidth="1.5">
    <!-- Coque rouge -->
    <path d="M60 10 L60 70 M10 40 L50 40 M50 40 L90 40" stroke="#E8522A" strokeWidth="3"/>
    <!-- Voiles rouges (2) -->
    <path d="M60 20 Q30 5 Q30 15 Q60 20 Z" fill="#E8522A"/>
    <path d="M60 20 Q90 5 Q90 15 Q60 20 Z" fill="#E8522A"/>
    <!-- Détails blancs -->
    <path d="M60 30 L40 30 M80 30 L70 30 M60 50 L60 60" stroke="#FFFFFF" strokeWidth="1"/>
  </g>
</svg>
`

export function useYoleEasterEgg({
  // Ref sur le container container où injecter l'easter egg (ArchipelView wrapper)
  containerRef,
  // Langue pour orientation (optionnelle)
  lang = "fr",
}) {
  const easter Egg Ref = useRef(null)
  const raf Ref = useRef(null)

  useEffect(() => {
    // prefers-reduced-motion : tableau figé, ne JAMAIS armer rAF
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Figer la pose finale visible (yole au repos)
      if (easter Egg Ref.current) {
        easter Egg Ref.current.style.animation = "none"
        easter Egg Ref.current.style.opacity = "0.8"
      }
      return
    }

    let animating = true
    const start = Date.now()

    const loop = () => {
      if (!animating) return
      const t = Date.now() - start
      // 80–150s ambiant, jamais traverser — juste dérive + micro-respiration
      if (t > 150_000) {
        animating = false
        if (easter Egg Ref.current) easter Egg Ref.current.style.opacity = "0.8"
        return
      }

      // Position de dérive lente (pas de traversée d'écran)
      const dx = (Math.sin(t / 50) * 0.5).toFixed(2)
      const dy = (Math.cos(t / 80) * 0.3).toFixed(2)

      if (easter Egg Ref.current) {
        easter Egg Ref.current.style.transform = `translate(${dx}px, ${dy}px) ${microBreath(t)}`
      }

      raf Ref.current = requestAnimationFrame(loop)
    }

    raf Ref.current = requestAnimationFrame(loop)

    return () => {
      animating = false
      if (raf Ref.current) cancelAnimationFrame(raf Ref.current)
    }
  }, [containerRef, lang])

  return easter Egg Ref
}

export default function YoleEasterEgg({
  containerRef,
  lang = "fr",
}) {
  const ref = useYoleEasterEgg(containerRef, lang)

  return (
    <g
      ref={ref}
      style={{
        // Position ancrage : ~x=400 y=380 viewBox
        // Échelle : 12% largeur viewBox → à adapter selon viewBox global
        // position: absolute dans le conteneur de la carte
        position: "absolute",
        width: "12%", // 12% de la largeur du viewBox
        pointerEvents: "none",
        // Au repos (reduced-motion) on figera via le hook
      }}
    >
      {/* SVG yole — inline pour 0 Ko bundle additionnel */}
      <svg>{yoleSvg}</svg>
    </g>
  )
}

// SVG yole Martinique (définition globale, 0 Ko runtime)
const yoleSvg = `
<svg viewBox="0 0 120 80" style="width: 12px; height: 8px; flex-shrink: 0;">
  <g fill="none" stroke="currentColor" strokeWidth="1.5">
    <!-- Coque rouge -->
    <path d="M60 10 L60 70 M10 40 L50 40 M50 40 L90 40" stroke="#E8522A" strokeWidth="3"/>
    <!-- Voiles rouges (2) -->
    <path d="M60 20 Q30 5 Q30 15 Q60 20 Z" fill="#E8522A"/>
    <path d="M60 20 Q90 5 Q90 15 Q60 20 Z" fill="#E8522A"/>
    <!-- Détails blancs -->
    <path d="M60 30 L40 30 M80 30 L70 30 M60 50 L60 60" stroke="#FFFFFF" strokeWidth="1"/>
  </g>
</svg>
`

export default YoleEasterEgg