# UI Audit — Sargagame (2026-08-06)

Audité : index.html, onboarding-final.html, src/WorldMapView.jsx, src/ChasseHome.jsx, src/PremiumModal.jsx, src/Sargasses_PROD.jsx, src/Themes.css, src/app-runtime.css, design/ui-polish/*.html, .claude/skills/sg-design-system/.

## Guideline vérifiée (sg-design-system / bible v1)
- Fonts : Anton (titre, MAJ, ≤4 mots, 1/écran) + Bricolage Grotesque (95% pixels) + JetBrains Mono (chiffres)
- Palette : gold #FFC72C (CTA rare), ink #0D0D0D, paper #FDFCF7, teal #009E8E, clean #22C55E, moderate #B87A00, avoid #E8522A
- Surface : border 2.5px ink + ombre dure bas-droite (pop-1/2/3, 0-blur). CTA = seul pop-3.
- Mobile-first : swipe-down (useSwipeClose), 4 sorties (✕, Échap, backdrop, swipe-down), targets ≥44px, clamp() typo.
- Thème comic : `.theme-comic` skin force `!important`. DETTE-TOKENS-INERTES : `:root.theme-comic` ne matche jamais → tokens inertes. Fix : valeurs codées en dur (cf. app-runtime.css).
- Réduit le mouvement : `prefers-reduced-motion: reduce` doit désactiver animations infinies. Manquante dans `.theme-comic`.
- Aucune emoji OS : pictos SVG mono-ink.
- Rollback : tout ajout conversion doit avoir `?flag=0`.

## Propositions concrètes
1. **Themes.css** — Ajouter `prefers-reduced-motion` pour `.theme-comic` animations (manquant).
2. **Themes.css** — Corriger commentaire DETTE-TOKENS-INERTES et clarifier que `body.theme-comic` est la vraie cible.
3. **app-runtime.css** — `#root` en `position:fixed` est correct, mais documenter le rollback `?v2=0`.
4. **Design/ui-polish** — Tous alignés bible v1. Source de vérité = ces fichiers.
5. **Funnel UI** — `PremiumModal.jsx` ~3353 lignes (TASK-P2-001 split fait, 202 Ko → 59 Ko). Amélioration : terminer ComicPaywall/WorldPaywall rendu complet.
6. **Mobile convention** — Vérifier `useSwipeClose` sur chaque feuille (`BeachSheet`, `ChasseDetail`, `WeekHub`). Déjà présent dans sources.

## Action appliquée (safe, vérifiable)
- Ajout `prefers-reduced-motion` dans `Themes.css` pour `.theme-comic`.
- Mise à jour commentaire token debt.
- Audit document `.ai/ui-audit.md` créé.

## Rollback
- Aucun nouveau flag de conversion ajouté (pas d'ajout UI visible aux utilisateurs). Rollback : `git revert` du commit.
