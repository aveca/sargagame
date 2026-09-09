# Remediation plan — ordre d'exécution Phase B (UI-only, sans logique métier)

> Règles : 1 fix = 1 commit + flag rollback `?xxx=0` (modèle `pwOnboard`) pour tout ajout
> conversion/UI ; tokens/composants existants réutilisés ; Gate de ship complet avant merge ;
> worktree/branch dédiée (`agent/ui-ux/<fix-id>`) — ne pas écrire dans les fichiers d'un autre
> agent sans coordination. Aucune donnée, aucun prix, aucun endpoint modifié.

## Vague 0 — P0 (bloquant, en premier)

| # | Fix | Fichiers présumés (`owned_paths` à déclarer) | Validation |
|---|---|---|---|
| LST-01 | Liste visible : sortir la vue `list` de `#root` effondré (`fixed`/portal comme carte/sheets, + `sg-onink-scope`), même fond clair que la carte | `Sargasses_PROD` (vue list) | 390 list : lignes visibles + `elementFromPoint(195,400)` = ligne + screenshot |
| PAY-02 | Carte onsite lisible : paires couleur/fond en dur ou scope `!important` (skin comic écrase l'inline — checklist self-review) | `PremiumModal/OnsiteCheckout` (+ css) | paires lues + capture 390 : « Mollie · Sans engagement · 2 clics » lisible |

## Vague 1 — P1 navigation/compréhension/conversion

| # | Fix | Validation |
|---|---|---|
| MAP-01 | 1 réponse primaire : hero « Meilleur choix » unique, quantité « 45 plages » en supporting ; `declutter` hero-aware (labels sous panneau opaque masqués) | 390+1440 : 0 overlap mesuré (rects disjoints) |
| PAY-01 | 1 CTA primaire/écran : offre primaire (prix + mécanisme) + secondaire replié ; relation 4,99€/14,99€ explicitée en 1 ligne au point de décision | 1 CTA pop-3 visible sans scroll modal |
| PAY-03 | « Plus tard » + ✕ visibles sans scroll interne ; Échap déjà ✓ ; ajouter swipe-down (`useSwipeClose`) | Plus tard dans viewport modal initial 390 |
| SHEET-01 | RegionNav masquée ou sous le dialog quand sheet ouvert (pattern déjà appliqué au paywall : `display:none si showPremium` → étendre `selectedBeach/comicBeach`) | hit-test haut du sheet = sheet |
| SHEET-02 | ✕ 44×44 non coupé + swipe-down + backdrop tap (4 voies) | mesuré 44 + gestes |
| COO-01 | Boutons 44px + banner compact ne recouvrant ni day-strip ni CTA proximité (ancre au-dessus de BottomNav, z sous dialogs) | 44px + day-strip cliquable |
| NAV-01 | Lever le doute hit=svg (icône propre vs overlay) + pointer-events du calque carte sous la nav ; real-click 3/3 | hit-test = bouton, clic 3/3 |

## Vague 2 — P2 consistance/hiérarchie

TRUST-01 (chiffre unique + lien /fiabilite/ dans le modal, copy panel) · SHEET-03 (fusionner comic/legacy : 1 ordre = beach-sheet-audit §recommandée) ·
REG-01 (`/plages/` → vue liste) · BS-01 (affordance scroll sheet + forecast aperçu 3 cellules) · BS-05 (slot photo preuve + CTA rapport `?report=0`) ·
BS-06 (fusionner « Fiche complète »/« 7 jours ») · B2B-01 (nav non interactive derrière dialog / focus-trap vérifié) · FIA-01 (Recevoir 44px) ·
A11Y-01/02 (nommer 2 focusables, focus visible en code) · MAP-02 (badge retard + recherche, échelle + compas) · LANG-01 (surveillance : log `sg_lang_anomaly` si `lang` ≠ défaut sans action user — 1 occurrence ES inexpliquée en headless).

## Vague 3 — P3 polish

768 (grille 2 col. liste/alternatives) · backdrop dim derrière modals desktop · émojis→SVG ink (feedback/alternatives) · 1 H2 display/écran paywall ·
360px + zoom 200 % · WEEK/BRIEF/ACCOUNT/CHAT captures manquantes.

## Gate par fix (rappel)

`npm run build` + `check-bundle-budget` + `php -l` (si php) + preview + `ux-smoke` 4 tokens + captures BEFORE/AFTER (scripts de cette session) + Playwright funnel vert. Rollback `?flag=0` documenté dans le commit.
