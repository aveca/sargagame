# AUTONOMOUS_BUILD — boucle de build autonome (goal / weekend)

> Discipline que **toute session ou agent** doit suivre quand le fondateur lance un
> `/goal` long et part. Objectif : avancer vite SANS casser un produit qui fait du
> revenu. Lire aussi `PRODUCT.md` (north-star + inventaire écrans §8) et `NEXT_SESSION.md`.

## Mécanisme « pars et reviens »
- Le **`/goal`** garde la session active : à chaque tentative d'arrêt, le hook re-prompt
  → on enchaîne les chunks tout seul jusqu'à ce que la condition tienne.
- Conteneur **éphémère** → **commit + push à chaque chunk**, et tenir `NEXT_SESSION.md`
  à jour pour qu'une session fraîche reprenne sans contexte.
- Pour un check-in espacé (weekend) : programmer un self check-in (`send_later`/`/loop`)
  qui re-vérifie prod + MRR + prend l'item suivant de `PRODUCT.md §8`.

## La boucle par chunk (à répéter)
1. **Choisir 1 item** sûr et borné dans `PRODUCT.md §8` (le plus petit qui a de la valeur).
2. **Construire** (édits scopés, réversibles).
3. **Vérifier** AVANT merge :
   - `npx vite build` vert.
   - `cp /tmp/journey.mjs _journey.mjs && node _journey.mjs && rm _journey.mjs`
     (Playwright mobile WebKit : splash→arène→reveal→détail→paywall + scan boutons blancs = 0).
   - Juger les couleurs via **computed styles** (les captures headless peuvent fuiter forced-colors).
4. **Review multi-agents** si le diff est non trivial (logique, >~50 lignes, ou touche le
   paywall/la conversion) : spawn un agent reviewer (ou skill `code-review`) → corriger les 🔴/🟡.
5. **Ship** : commit (Co-Authored-By + Claude-Session), push, **PR draft→ready→merge** (auto-deploy main).
6. **Mettre à jour** `PRODUCT.md §8` (statut écran) + `NEXT_SESSION.md`.

## Garde-fous NON négociables (produit en revenu)
- ❌ **Ne JAMAIS** modifier la logique de paiement : `startCheckout`, `startTripPass`,
  `effectivePlan`, Payment Links, `onActivated`, EUR, `source`. Reskin visuel uniquement.
- ✅ Tout changement **réversible** + override debug (`?chasse=0`, `?mapwarm=0`, …).
- ✅ Tout nouvel **animation** gated `prefers-reduced-motion` (`.lc-reduce`).
- ✅ CSS **scopé `.lc-`** (zéro fuite). Surfaces **opaques explicites** (pas de
  `rgba(255,255,255,.0x)` → white-flatten sous forced-colors) + `forcedColorAdjust:none`.
- ✅ Surveiller le **MRR Stripe** (arène = accueil 100%). Si chute → `?chasse=0` / revert.
- ⛔ **Escalader au fondateur** (ne pas faire en aveugle) : refactor large touchant la
  conversion, suppression de bras A/B revenue-sensibles, refonte de la fiche data.

## Pipeline review multi-agents (modèle)
- **Builder** (toi) : code + build + screenshot.
- **Reviewer** (agent) : lit le diff, sort 🔴/🟡/🟢 (bugs, hooks React, keys, reduced-motion,
  perf, **confirmation Stripe intact**, stacking CSS). Ne modifie rien.
- Boucle : builder corrige les 🔴/🟡 → re-build → ship. Pour un gros lot : un agent par
  domaine (UI / perf / sécurité via skill `security-review`) en parallèle.
