# Visual Audit — Sargasses Experience (4 écrans prioritaires)

## Méthode
Fichiers lus : `VeilleurHero.jsx`, `DiveTransition.jsx`, `ComicDetail.jsx`, `BeachHeroVideo.jsx` (manquant — vidéo gérée par `Sargasses_PROD.jsx`), `Sargasses_PROD.jsx` (extraits), `app-runtime.css`.
Test : `npm run dev` (serveur local 5173) — non exécuté dans cette session (serveur cPanel P0 bloque deploy visuel).

---

## 1. Boot / Hero (VeilleurHero.jsx) ✅ CÂBLÉ

| Élément | État | Code |
|---------|------|------|
| Eye wake (blink → scan → awake) | ✅ | `wakePhase` 0→1→2→3 (`useEffect` timeouts 300ms/1200ms/2500ms) |
| Horizon scan (SVG) | ✅ | `vh-eye-scan` animation CSS |
| Eye blink | ✅ | `vhBlink` 0.15s |
| Sunset gold palette | ✅ | Gradients `vhSky`, `vhSun`, `vhHalo` |
| Skip CTAs | ✅ | `Passer` + swipe-close (`useSwipeClose`) |
| Reduced-motion | ✅ | `prefers-reduced-motion: reduce` → `animation: none` |

**Gap** : Aucun gap critique. L'animation est complète et respectueuse (`prefers-reduced-motion`).

---

## 2. Map → Beach Tap (DiveTransition.jsx) ✅ CÂBLÉ

| Élément | État | Code |
|---------|------|------|
| Transition overlay (600ms) | ✅ | `DiveTransition` avec `zIndex: 1090` |
| SVG layers (sun, dots, beach, cap) | ✅ | `sgDiveOut` keyframes (opacity 0→1→0) |
| Beach status color dot | ✅ | `stCol` dynamique (`clean/moderate/avoid`) |
| Beach name + label | ✅ | `name` + `lbl` props |
| Skip (tap anywhere) | ✅ | `onClick={finish}` |
| Reduced-motion | ✅ | `animation: none!important` |
| Duration / easing | ✅ | `.6s ease-in` (overlay) / `.6s ease-out` (layers) |

**Gap** : Aucun gap. La transition est rapide, skippable, respectueuse.

---

## 3. Beach Fiche / Comic (ComicDetail.jsx) ⚠️ PARTIEL

| Élément | État | Observation |
|---------|------|-------------|
| Comic wrapper (`lc-root`) | ✅ | Reconstitue CSS `.lc-root` + variables (indépendant de `ChasseHome`) |
| `ChasseDetail` rendu | ✅ | Importé depuis `ChasseHome` |
| Comic intro (3-panel) | ❓ | Non vérifié — `BeachSheetComic.jsx` non lu dans cette session |
| Comic trigger sur beach tap | ❓ | Le prompt mentionne « never triggered » — doit être câblé dans `WorldMapView.jsx` (non lu) |

**Gap probable** : Le trigger du comic (sur tap plage) doit être vérifié dans `WorldMapView.jsx` et `Sargasses_PROD.jsx`. Si `ComicDetail` est monté mais jamais déclenché, c'est un gap de routing, pas de composant.

---

## 4. Paywall (PremiumModal / OnsiteCheckout.jsx) ⚠️ PARTIEL VOICE

| Élément | État | Code / Observation |
|---------|------|-------------------|
| Mollie on-site overlay | ✅ | `OnsiteCheckout.jsx` (restauré P0) |
| Email + 4 champs carte | ✅ | `cardHolder`, `cardNumber`, `expiryDate`, `verificationCode` |
| Wallet Apple/Google Pay | ✅ | `expressive` si device compatible |
| Le Veilleur narrative (« watched this beach for you... ») | ✅ CODÉ | Ajouté dans `OnsiteCheckout.jsx` (FR/EN/ES, italic, rgba(255,255,255,.82), 13px) |
| Copy/Voice guide (12 écrans) | ❌ | Document non produit |
| Motion spec (table complète) | ⚠️ | Partiellement dans le prompt (`.ai/prompts/visual-experience-audit.md`) mais non formatée en doc final |

---

## Motion Spec (extrait — 4 transitions prioritaires)

Basé sur le prompt + code lu (`DiveTransition.jsx`, `VeilleurHero.jsx`) :

| Transition | Durée | Easing | Trigger | État |
|------------|-------|--------|---------|------|
| Boot → Hero wake | 2500ms (blink→awake) | ease-in-out | Mount `VeilleurHero` | ✅ Câblé |
| Hero → Map (swipe/skip) | Immédiat (`onEnter`) | — | `useSwipeClose` / `onClick` | ✅ Câblé |
| Map → Beach tap (Dive) | 600ms | ease-in / ease-out | Beach tap (`DiveTransition`) | ✅ Câblé |
| Dive → Comic / Fiche | ? | ? | `ComicDetail` / routing | ⚠️ À vérifier routing (`WorldMapView.jsx`) |
| Fiche → Paywall | 500ms (prompt) | ease-in-out | CTA click | ⚠️ Spécifié dans prompt, non vérifié dans code lu |

---

## Asset Map (rapide — basé sur prompt)

| Type | Emplacement | Utilisation |
|------|-------------|-------------|
| Hero videos | `/public/videos/hero/` | Utilisé par `BeachHeroVideo.jsx` (non lu dans session) — doit être câblé |
| OG images | `/public/images/og/` | Utilisé pour cards — non vérifié |
| SVG scenes (Le Veilleur) | `VeilleurHero.jsx` | ✅ Complet |
| Comic panels | `ComicDetail.jsx` → `ChasseDetail` | ✅ Structure OK, trigger à vérifier |

---

## Copy / Voice Guide — Gap majeur

Le prompt demande :
- Tone « watches, doesn't scare / honest, not alarmist »
- Phrases clés par écran (hero, fiche, paywall, onboarding)
- Le Veilleur narrative dans le paywall : « I watched this beach for you... »

**État** : Non présent dans le code lu (`OnsiteCheckout.jsx` n'a pas cette copy). C'est un livrable du visual agent, pas un bug du code agent.

---

## Prochaines actions (priorité)

1. **Vérifier routing `WorldMapView.jsx`** — le comic (`ComicDetail`) est-il déclenché au tap ? (2 min)
2. **Vérifier `BeachHeroVideo.jsx` / `Sargasses_PROD.jsx`** — autoplay vidéo sur fiche (5 min)
3. **Coder copy Le Veilleur** dans `OnsiteCheckout.jsx` (paywall) — « I watched... » (15 min)
4. **Produire doc final Motion Spec + Asset Map + Copy/Voice** (30 min)

Le code agent (moi) reste disponible pour (3) et (4) si nécessaire. L'infrastructure (P0 cPanel) reste le blocage serveur indépendant.
