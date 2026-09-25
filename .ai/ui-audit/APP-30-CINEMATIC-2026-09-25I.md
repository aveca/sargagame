# APP 3.0 CINEMATIC — rapport final 2026-09-25I

> Base = main @6912e9cf6 (PR #749 live). Money-path : ZÉRO touché.
> Parti-pris : couche additive 3.0 (?sgcine=0), identité conservée, jamais
> de redesign destructif, aucune donnée/activité/lieu inventé.

## 1. Current HEAD
- Départ `6912e9cf6`, branche `agent/coding/app-30-cinematic` → PR → CI → merge.

## 2. Old vs new visual system
- Avant : grammaire comic imposée partout (boxed 2px ink, hard offset
  3px, cartes blanches empilées).
- Après : couche 3.0 — hero bord-à-bord + overlays, cartes claires
  1px/border-radius 18/ombres douces, timeline, verre dépoli, rythme par
  alternance. L'ancien système reste intact sous `?sgcine=0`.

## 3. Design system (`src/sg-travel-3.0.css`)
- Colors : ocean/sea/tropical/sand/sunset/ink/paper/gold. Type : display
  (Anton clamp 34-54), heading, body 14.5, meta 11.5, mono. Radius :
  hero 22/cards 18/pills/sheets 22. Shadows douces (jamais de hard
  offset). Spacing s1-s5. Reduced-motion inclus.

## 4. Photo acquisition — RÉAFFIRMÉ cycle H, pas de code
- Downloader legacy INCHANGÉ (test de garde). Pas de bulk New-API
  (ToS §3.2.3 — stockage statique non conforme). Architecture conforme
  proposée en H (proxy ≤30j + attributions, décision fondateur).

## 5. Photo quality
- Inchangée (v2 + quarantaine + HERO gating en prod). Le hero ciné
  consomme le catalogue (jamais de stock, onError-hide, fetchpriority LCP).

## 6. HD assets
- Aucun nouvel asset (même raison ToS). Amélioration = art direction du
  stock existant (hero plein-bleed + gating HERO).

## 7. Video system
- Inchangé (loops manifest-gatées, guards saveData/2G/RM). Le hero ciné
  utilise la photo (pas de vidéo auto en tête — perf 390px).

## 8. SVG system
- 13 → **18 glyphes** (fish, boat, compass, route, satellite), même style
  24/2-traits. Wiring : facteurs fiche (satellite/compass/snorkel/pin/sun).

## 9. Motion (3.0, 180-500ms, finies, sans rAF)
- `sgm-sheet` (.3s, trip/compare), `sgm-zoom` (.5s, hero settle),
  `sgm-fadeup` (.32s + stagger). Gatées `?sgmotion=0` + reduced-motion.
  Tests : pas d'infinite, pas de CTA bloqué.

## 10. Beach Object
- Fiche = sheet plein écran : HERO → verdict + **facteurs vivants**
  (Sargasses/AFAI, Exposition coords, Snorkeling, Accès, Confiance barre)
  → WHY → TOMORROW → MER → BACKUP → savoir/proximité/FAQ → séjour →
  partage → premium. Sections visuellement distinctes (t3 + accents).
  Shot 390 : « POURQUOI ELLE RESSORT » vérifié (AFAI 0.06, 60 %).

## 11. Comparison
- Colonnes **photos réelles** + synthèse honnête (« Malendure devant
  Deshaies — 2 pts (Risque vs Propre) », testid). **Fix réel** : ✕ ne vide
  plus (dismiss local + « Effacer ») — le multi-compare était
  inatteignable (feuille couvrant la liste). Shot 2/3 vérifié.

## 12. Perfect Day
- Séquence verticale SANS horaires (interdit) : Maintenant → Demain
  (J+1 réel) → Si ça change (plan B réel). Étapes sans données absentes.

## 13. Trip
- Numéros **J1..Jn** (ordre réel, testid) + sheet transition. Photos et
  verrous inchangés.

## 14. Premium — non touché (trajectoire + preuve existantes, money intact)

## 15. Analytics proof (fix 0-en-30j)
- **Cause trouvée** : `sg_home_rail_*` émis par SeaRail mais ABSENTS de
  `SG_FUNNEL_EVENTS` → `track()` ne les envoyait qu'à GA4, jamais à
  Supabase (même pattern que les fixes 09-04/05/11/14).
- **Fix** : 4 events ajoutés au set + `FUNNEL_KEYS` des 2 scripts funnel.
  Zéro nouvel event. Vérifiable au prochain tick (requête 30 j).

## 16. Performance
- Eager **38,2 Ko ≤ 210** (3.0 = CSS, zéro JS eager ; icons lazy).
  LCP : hero fetchpriority + fade-in. Smoke 4/4.

## 17. Screenshots (390/1440 lus)
- Home : hero ciné plein-bleed (Deshaies, EN DIRECT, CTA or) — niveau
  visuel transformé. Compare 2/3 + facteurs : vérifiés ci-dessus.
  Rollback `?sgcine=0` : layout antérieur (contrat).

## 18. Tests
- `travel-30.test.cjs` **53/53** · `npm test` 64/64 · E2E 30/30 ·
  regions OK · php N/A.

## 19. Production
- À vérifier post-merge : version.json + 5/5 HTTP 200.

## 20. Google photo compliance
- Inchangée (H) : pas de nouveau contenu Google, pas d'attribution à
  ajouter sur l'existant, migration = proposition fondateur.

## 21. Remaining gaps
- Bottom-nav : structure inchangée (5 onglets = routes existantes ✓).
- Niche routes / portrait variants / WebP : chantiers H documentés.
- Mesurer rail events côté Supabase au prochain tick quotidien.

## 22. PR / merge / deploy
- Branche `agent/coding/app-30-cinematic` → PR → CI 7/7 → squash → deploy.
- Rollback : `?sgcine=0` (couche) ou revert 1 commit.
