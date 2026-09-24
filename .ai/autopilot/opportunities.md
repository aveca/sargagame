# Autopilot — Opportunités (backlog scoré)

> Règles : une implémentation à la fois par surface. Aucune implémentation sans fiche complète.
> Statuts : `[ ]` open · `[~]` in_progress · `[x]` shipped · `[-]` rejected (raison).
> Score = valeur (USER+BUSINESS+SEO+WOW) / (EFFORT × RISK). Evidence OBLIGATOIRE (observation, métrique, recherche).

## Template de fiche

```
### OPP-YYYY-NNN — <titre> [statut] score=<n>
- WHY : <problème réel observé>
- USER VALUE : <ce que l'utilisateur gagne>
- BUSINESS VALUE : <impact funnel/MRR/B2B>
- SEO VALUE : <impact maillage/pages/indexation, ou n/a>
- WOW VALUE : <impact expérience/univers, ou n/a>
- RISK : LOW|MED|HIGH — <surfaces touchées, paiement ? data ? >
- EFFORT : S|M|L
- EVIDENCE : <observations/<ts>..., recherches, métriques>
- ROLLBACK : ?<flag>=0
```

---

### OPP-2026-001 — Strip « Ta semaine » du paywall : ajouter le jour à chaque pastille [x] shipped 2026-09-24 (PR #742, live 6/6, proof prod chips jour) score=8.0 — open by autopilot
- WHY : la preuve de valeur paywall montre 7 pastilles anonymes (✓ ✓ ✓…) sans aucun jour — impossible de savoir QUEL jour est propre, au moment exact de la décision d'achat. Observé en prod.
- USER VALUE : lire « sa semaine » en 1 seconde (L M M J V S D sous chaque pastille) ; a11y : aria-label jour+statut (les `title=` sont invisibles au tactile et muets au lecteur d'écran).
- BUSINESS VALUE : la clarté de la preuve « 7 jours » soutient modal→CTA au checkout entry (paywall = goulot mesuré funnel 7j : 263 opens → 6 CTA).
- SEO VALUE : n/a
- WOW VALUE : la semaine devient lisible d'un coup d'œil (cohérent avec la timeline .bx-timeline-day de l'experience).
- RISK : LOW — affichage pur dans PassOffer.jsx, une seule surface (strip tripDays), zéro data/logique/paiement. SANS TOUCHER au money-path (aucun fichier de charge modifié).
- EFFORT : S
- EVIDENCE : `.ai/autopilot/observations/2026-09-24_05-12-43/shots/mq/mobile-ix-premium.png` (strip sans jours en prod) + src/PassOffer.jsx:97-103 (chip = glyphe seul, 20×20, title-only).
- ROLLBACK : ?triplabels=0 (pastilles sans jour) ; le master off ?tripplan=0 reste intact.

