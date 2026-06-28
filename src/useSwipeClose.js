import { useRef, useCallback } from "react"

/**
 * useSwipeClose — geste « swipe down pour fermer » réutilisable (mobile).
 *
 * Canonise le pattern déjà présent sur BeachSheet (Sargasses_PROD) et ChasseDetail
 * (ChasseHome) pour l'appliquer à TOUS les écrans pop-up (demande fondateur : « la
 * meilleure façon de fermer les écrans »). Retourne un ref à poser sur l'élément
 * tiré (le scroller visuel) + les 3 handlers tactiles.
 *
 * Garde-fous :
 *  - scrollTop > 5  → on ne ferme pas (l'utilisateur scrolle le contenu, pas un dismiss).
 *  - guardInput     → si un champ (INPUT/TEXTAREA/SELECT) est focus (email, carte Mollie),
 *                     on n'arme PAS le geste : zéro fermeture accidentelle en pleine saisie
 *                     (sécurité chemin de paiement — on ne touche AUCUNE logique de paiement).
 *  - feedback translateY pendant le drag, snap-back animé sous le seuil.
 *
 * @param {() => void} onClose
 * @param {{threshold?:number, guardInput?:boolean}} [opts]
 * @returns {{ref, onTouchStart, onTouchMove, onTouchEnd}}
 */
export function useSwipeClose(onClose, opts = {}) {
  const threshold = opts.threshold ?? 70
  const guardInput = !!opts.guardInput
  const ref = useRef(null)
  const startY = useRef(0)
  const startX = useRef(0)
  const dy = useRef(0)
  const axis = useRef(null) // null = pas encore verrouillé, "v" = vertical, "h" = horizontal
  const armed = useRef(false)

  const onTouchStart = useCallback((e) => {
    const el = ref.current
    if (!el || !e.touches || !e.touches.length) { armed.current = false; return }
    if (guardInput) {
      const a = typeof document !== "undefined" && document.activeElement
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { armed.current = false; return }
    }
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    dy.current = 0
    axis.current = null
    armed.current = true
    el.style.transition = ""
  }, [guardInput])

  const onTouchMove = useCallback((e) => {
    const el = ref.current
    if (!armed.current || !el) return
    if (el.scrollTop > 5) return
    const d = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current
    // Verrouille l'axe au 1er mouvement franc : un drag horizontal (carrousel de
    // plages voisines, plans…) NE doit PAS armer la fermeture verticale.
    if (axis.current === null && (Math.abs(d) > 8 || Math.abs(dx) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(d) ? "h" : "v"
    }
    if (axis.current === "h") return
    if (d > 0) { dy.current = d; el.style.transform = "translateY(" + d + "px)" }
  }, [])

  const onTouchEnd = useCallback(() => {
    const el = ref.current
    if (!armed.current || !el) return
    armed.current = false
    if (el.scrollTop > 5) { el.style.transform = ""; return }
    if (dy.current > threshold) { onClose && onClose(); return }
    el.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)"
    el.style.transform = ""
    setTimeout(() => { if (ref.current) ref.current.style.transition = "" }, 300)
  }, [onClose, threshold])

  return { ref, onTouchStart, onTouchMove, onTouchEnd }
}
