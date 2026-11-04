// frustrationGuard.js — décision pure d'auto-ouverture du chat (sans dépendance React).
// « hesitation » (simple lecture immobile) est EXCLU : lire la carte 10 s
// n'est pas un signal de frustration, et l'overlay masquait la carte.
// Réversible : ?frustration=0 désactive tout (côté appelant).
export const FRUSTRATION_AUTO_OPEN_TYPES = ["rage-click", "scroll-frenzy", "mouse-shake"]

// state: { alreadyAutoOpened:boolean, dismissed:boolean, chatOpen:boolean }
export function shouldAutoOpenChat(ctxType, state = {}) {
  if (!FRUSTRATION_AUTO_OPEN_TYPES.includes(ctxType)) return false
  if (state.chatOpen) return false
  if (state.dismissed) return false
  if (state.alreadyAutoOpened) return false
  return true
}
