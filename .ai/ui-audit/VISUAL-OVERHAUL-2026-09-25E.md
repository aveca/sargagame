# VISUAL / UX OVERHAUL — rapport final 2026-09-25E

> Cycle : ONE SESSION / ONE AGENT. Base = PR #746 (media contract v1, reco
> concierge, 38,2 Ko, verte). Money-path : ZÉRO touché (aucun diff sur
> mollie/paypal/PremiumModal/PassOffer/pricing/entitlements/aria/CTA).

## 1. Avant / après (screenshots lus, pas supposés)

| Surface | Avant (prod #746) | Après (build E) | Verdict |
|---|---|---|---|
| Home 390 | chips emoji, focus texte, pas de photo | chips **SVG maison**, SeaRail bouées, **focus photo 148px**, PlanCard **photo 140px + « Pourquoi ce choix ? »** + semaine + alternative | ✅ densité ×3 |
| Plages 390 | cartes 100 % texte | **BeachCard photo 120px** (Malendure vérifiée) + statut + score + alternative | ✅ fini l'effet dashboard |
| Beach 390 | hero + verdict + why/tomorrow/backup | + **Bon à savoir** (flags réels) + **Tu aimeras aussi** (3 proches réelles, photos, km) + **FAQ** (source/fraîcheur/confiance/plan B) | ✅ 30-90 s d'exploration |
| Trip 390 | lignes texte | **vignettes 84px réelles**/jour (Anse Noire vérifiée) + cascade sgm-tripday, verrous flous intacts | ✅ concierge visuel |
| Premium 390 | hero scène + séjour + offre | inchangé volontairement (déjà destination-first §9 + trajectoire ; photo header = asset manquant documenté, pas improvisé) | ➖ assumé |
| Home 1440 | 1 col | grille 2 col : focus photo + PlanCard photo côte à côte | ✅ premium desktop |
| Today | liste texte | hero **photo réelle du meilleur spot** (catalogue uniquement) | ✅ (début de cycle) |

Shots : `sg-ab/` (24 : prod vs local × 4 surfaces × 3 viewports) + deep
(home-focus/plan-why, plages-list, bx-hero/savoir/prox/faq, trip).

## 2. Audit qualité assets (mesuré, sharp — `scripts/qa/media-audit.cjs`)

- **457 JPG** dans `public/beaches/` (le catalogue affiché = 172 via
  beaches-images.json) : **A premium 93 · B exploitable 295 · C faible 19 ·
  D inutilisable 50**.
- **Vidéos hero : 156 fichiers · 80 plages · manifest 80 ids** — couverture OK.
- **Seulement 3 photos C encore affichées** (`gplace-gp083`, `gplace-gp027`,
  `Gosier_plage`) → à remplacer en priorité (re-shoot ou dé-mapper).
  Aucune D affichée. 50 D au dossier = non mappées (candidates purge, hors cycle).
- Top 30 utilisables (A/B + affichées) listés par l'audit `--json`.

## 3. Assets réellement upgradés (aucun fake, aucun upscale présenté comme HD)

- Intent chips : 5 emojis → **13 glyphes SVG maison** (`src/lib/sg-icons.jsx`,
  lazy chunk 1,07 Ko gzip, viewBox 24, currentColor).
- Home focus + intent-reco + PlanCard + BeachCard (home + liste) + Trip jours +
  proximité BeachExperience : **photos réelles catalogue uniquement** (lazy,
  onError-hide, jamais de stock/générique/IA).
- Today pages : hero photo réelle du meilleur spot (build, catalogue only).
- Formats : JPG uniques conservés ; **AVIF/WebP + srcset + portrait 9:16 +
  gallery multi-photo + sunset/activity dédiés = MANQUANTS documentés**
  (beach-media.js + beachMedia().missing), jamais fabriqués.

## 4-8. Home / Beach / Perfect Day / Trip / motion / SVG

- **Home** : LIVE SEA (compteurs réels) → intentions (5, données réelles) →
  SeaRail drag (ouest→est réel) → focus photo → PlanCard (photo + pourquoi +
  semaine + alternative + savoir) → trip/carte → explorer → suivis → Pass.
  Rythme = IMAGE → DÉCISION → EXPLICATION → EXPLORATION → ACTION.
- **BeachExperience** : hero immersif (photo/vidéo réelle + scène) → verdict →
  pourquoi (3 preuves) → demain + 7j → plan B (swap animé) → **savoir** →
  **proximité** → **FAQ** → séjour → partage → premium. Sections sans données
  = masquées (code : `!!facts.length`, `!!near.length`, `conf != null`).
- **Perfect Day** : photo grande + statut + « Pourquoi ce choix ? » (2-4
  raisons réelles) + semaine + alternative km + savoir + CTA fiche. Zéro
  horaire inventé (noms de jours forecast uniquement).
- **Motion** : 8 → **12** (planin/swap/gallery/tripday, stagger --i, GPU-only,
  finies, `?sgmotion=0` + reduced-motion = off, saveData respecté).
- **SVG** : bibliothèque 13 glyphes (wave/sun/sunset/beach/sail/snorkel/
  family/parking/pin/plan/alternative/alert/sargassum), organique 2 traits.

## 9-12. Premium / beach-to-beach / contenu / mobile

- **Premium** : non retouché visuellement ce cycle (déjà hero destination +
  trajectoire StayTrajectory + preuve) ; prix/entitlements/Mollie/aria/CTA
  intacts (contrats pass-money/passoffer-paths verts).
- **Beach→beach** : proximité (3 réelles, même île d'abord, clean d'abord) +
  backup + rail journey + comparateur existant → ONE BEACH → NEXT → PLAN → TRIP
  sans retour home forcé.
- **Contenu** : Home ≈ 9 sections, Beach ≈ 11 (hero/verdict/why/tomorrow/
  backup/savoir/prox/faq/trip/share/premium), Trip = N jours + strip séjour,
  Premium = hero + trajectoire + offre + preuves.
- **Mobile 390** : vérifié aux shots (pas de CLS, pas de scroll-X, CTA ≥44px,
  bottom-nav pré-existant inchangé). 768/1440 vérifiés.

## 13. Niches (modèle prêt, PAS publiées)

`intent → content → media → reco → plan` existe et est prouvé (intents.js +
beach-media.js + journeyFor + PlanCard). Données manquantes bloquantes :
- **fishing** : aucun flag pêche/port → besoin `fishing:bool` par plage.
- **sailing/voile** : aucun flag cale/mouillage → besoin `mooring:bool`.
- **diving** : `snorkel` existe (flag) mais pas de granularité profondeur/spot.
- **romantic** : aucun signal (pas de proxy honnête — ne pas dériver de sunset).
- **wild/sauvage** : aucun flag isolement/accès → besoin `wild:bool` ou
  proxy documenté (ex. drive null + parking false = insuffisant seul).
Règle : une niche s'ouvre quand son flag source existe dans les beach objects.

## 14-18. Tests / bundle / prod / Mollie / régressions

- `npm run build` exit 0 · **bundle 38,2 Ko ≤ 210** (sg-icons lazy 1,07 Ko,
  zéro eager ajouté) · smoke **4/4 + SMOKE_GATE=PASS** (build frais 4173,
  stale preview tué) · `npm test` **61/61** (visual-premium **45/45**) ·
  E2E **perfect-trip 5/5 + experience 8/8 + journey 5/5 + funnel-payment 13/13**
  · regions OK · php -l N/A (0 PHP touché).
- **Mollie INTACT** : 0 diff money-path (vérifié `git diff --stat`).
- **Régressions** : KI-2026-09-24A (journey 5/5 vert), BUG-2026-038
  (funnel 13/13 vert), UX-QA-002 (bannière non touchée). `?sgvis=0` =
  rollback unique des 6 blocs E (BeachCard img, PlanCard why, savoir/prox/faq ;
  motion déjà sous `?sgmotion=0`).

## 19. Manquants restants (hors cycle, documentés)

1. 3 photos C affichées à remplacer (liste §2).
2. Photo header paywall (nécessite imageMap → PremiumModal, 3 lignes, non fait
   pour rester à distance du money-path ce cycle).
3. Portrait 9:16 / gallery / sunset / activity / AVIF-WebP-srcset (media pass).
4. Purge 50 D non mappées (disque uniquement).
5. Intents niche (flags §13).

## 20. PR / deploy

- Branche : `agent/coding/visual-overhaul-e` → PR → CI 7/7 → squash merge →
  Deploy Live → probes prod → STOP.
- Rollback prod : `?sgvis=0` (blocs E off) et/ou revert 1 commit.

## 21. Ne pas toucher ensuite

- Money-path (Mollie/PayPal/Stripe-legacy) : contrats verrouillés, zéro raison.
- Moteur forecast/confiance/ERDDAP : source unique, hors scope visuel.
- Nouvelles intentions sans flag source (règle intents.js).
- `dist/` (généré), `*-config.php` (FTP), Apps Script (bloqué clasp).
