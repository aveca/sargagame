# GOOGLE PHOTO QUALITY V2 — rapport final 2026-09-25H

> Base = main @b11620ad0 (PR #748 live). Money-path : ZÉRO touché.
> Règle du cycle respectée : problème traité À LA SOURCE, pas masqué par le design.

## 1. Current photo pipeline (audité, §1 — rien modifié avant audit)
- Acquisition : `scripts/download-google-photos.cjs` — **Legacy Places API**
  (nearbysearch 300 m → textsearch 5 km fallback), **premier résultat avec
  photos → `photos[0]`**, `place/photo?maxwidth=1600`. Zéro comparaison,
  zéro attribution stockée, zéro métadonnée/date. Anti-collision 300 m
  (fix mq024/25/26 documenté).
- Stockage : `public/beaches/gplace-<id>.jpg` (457 fichiers, binaires en
  repo), déployés filtrés par région (`prepare-ftp.cjs` L894-913).
- Optimisation : one-shot mozjpeg q78, max 1280×1600, mêmes noms.
- Score v1 : Playwright canvas 32px — lum 45 % + sat 40 % + res 15 % +
  overrides `scripts/data/photo-quality-overrides.json`. Ni netteté, ni
  exposition-histogramme, ni contraste, ni composition.
- Registry : `beaches-images.json` (172) + quality + hero manifest (80) →
  `gen-media-manifest.cjs` (build) → `beach-media.js` (hero=card=photo).
- Formats : JPEG seul. Ni WebP/AVIF, ni srcset, ni variantes portrait.
- `upscale-photos.cjs` : Real-ESRGAN local + backups — outil ponctuel,
  pas un step de build (aucun upscale silencieux en prod).

## 2. Google API status (vérifié docs officielles, §2)
- Legacy : max 1600×1600 (statut Legacy, guide de migration existant).
- **Places API (New)** : `maxWidthPx/maxHeightPx` 1–4800, `photos[]` max
  10/lieu avec `widthPx/heightPx` + **`authorAttributions[]`** (toujours
  présent). Resource names `places/{id}/photos/{ref}/media`.
- Attribution **obligatoire** (JS API + New) ; la nôtre est ABSENTE.

## 3. Licensing / attribution (§11 — finding bloquant)
- ToS §3.2.3(a) : interdiction pre-fetch / store / rehost du Google Maps
  Content (photos incluses). §3.2.3(b) : no caching sauf permission
  expresse. Service Specific Terms (Places) : seules lat/lng (30 j) et
  place_id sont cachables — **les photos : AUCUNE permission**.
- **Conclusion : l'hébergement statique permanent n'est pas conforme.**
  → **MIGRATION STATIQUE STOPPÉE** (pas de bulk New-API, pas de 4800px
  statique, script legacy inchangé). Architecture conforme proposée §14.
- Attributions : mécanisme documenté (New API `authorAttributions[]`),
  à afficher quand la source migrera ; rien à afficher sur les fichiers
  existants (pas d'attribution reçue à l'époque — ne pas inventer).

## 4. Candidate selection (§3 — fini le photos[0] arbitraire pour l'avenir)
- Le stock existant ne peut pas être re-téléchargé en bulk (ToS + pas de
  clé locale). Stratégie appliquée : **comparer ce qui existe** —
  `media-audit` matche les fichiers non mappés au nom normalisé complet
  de la plage (heuristique commune RETIRÉE : elle matchait des lieux
  différents — 924 faux positifs → 26 candidats stricts).
- Résultat : **1 upgrade validé** (gp027, §8). Le downloader legacy reste
  tel quel (gel documenté, pas de bulk silencieux).

## 5. Quality algorithm (§4 — technique + visuel, pas de fake HERO)
- `scripts/score-photo-quality.cjs` (sharp, local, déterministe) :
  **TECHNICAL 50** (résolution 25 + ratio 10 + efficience Ko/MP 15) +
  **VISUAL 50** (netteté Laplacien 20 + exposition 15 + contraste 10 +
  saturation 5). Overrides v1 mergés (curation conservée).
- Classes : **HERO** (≥70 + ≥1280px + ≥100 Ko) / CARD / THUMB / REJECT.
  Corpus : HERO 136 · CARD 33 · THUMB 1 · +2 exclus (quarantaine).
- Règle dure vérifiée par test : **aucun HERO au visuel faible**
  (gp083 1280px → THUMB, jamais HERO parce que lourde).

## 6. Assets upgraded (§6)
- **gp027** : `gplace-gp027.jpg` (THUMB 80, 42 Ko) → **`Plage_de_Clugny.jpg`
  (CARD 81)** — même lieu prouvé (nom exact + dHash 2, même baie).
  Seul remap du cycle (data-only, fichier conservé).
- gp083/Gosier : aucun meilleur asset même-lieu → conservés + bannis des
  slots HERO (THUMB/CARD cantonnés ≤160px, règle formalisée).
- Quarantaine (2) : gp118/gp119 exclus de tout affichage (§9).

## 7. Responsive variants (§6)
- **Non générées** : dériver WebP/srcset des masters existants est
  techniquement prêt (sharp) mais ajoute du poids FTP pour un gain
  marginal post-q78 — et le chantier prioritaire est la conformité de
  source (§11). Hygiène appliquée : `decoding="async"` + `fetchpriority`
  existants conservés, pas de photo pleine résolution pour une carte
  (seuls 2 slots HERO chargent grand). Documenté §14.

## 8. Weak assets (§9)
- gp083 (THUMB) : pas de fichier même-lieu supérieur → gardée, HERO interdit.
- Gosier_plage (CARD 78, 1280×960) : correcte en l'état, gardée.
- Îlet_du_Gosier.jpg (102 Ko, non mappée) : **NON substituée à gp012**
  (lieu différent — test de garde).

## 9. Wrong-place audit (§10)
- Trio mq024/25/26 : 3 fichiers distincts ✓. 0 fichier partagé entre
  plages ✓. 0 paire proche (≤1,5 km) même-fichier ✓.
- **CONFIRMÉ** (dHash ≤ 1) : gp019~gp118 (0, 44 km), gp024~gp119 (1,
  76 km inter-îles — impossible que les deux soient vraies),
  mq035~mq038 (0, 4 km), pc003~pc011 (0, 0,7 km même baie — plausible OK).
- Action : gp118/gp119 **quarantinés** (requête POI faible, scène honnête
  à la place) ; autres paires = même baie/commune plausibles, contact
  sheet fournie pour validation humaine (jamais d'auto-remap).

## 10. Visual before/after (§14)
- gp024 (CARD) : hero photo intact (shot 390). gp119 : plus de photo
  douteuse en hero (scene + verdict). gp027 : nouvelle photo CARD.
- Home/Today/Trip/Premium : pas de régression (sweep 24 shots).
- Contact sheet : TOP50 + WORST20 + LOW + **DUPLICATES côte à côte**
  (30 paires, grandes images) pour validation humaine.

## 11. Performance (§13)
- Bundle eager **38,2 Ko ≤ 210** (zéro JS ajouté à l'eager ; classes =
  JSON statique fainéant). LCP : hero gaté + fail-open (pas de régression
  si JSON absent). CLS/saveData/reduced-motion : inchangés (gates verts).

## 12. Tests (§16)
- `tests/unit/photo-quality-v2.test.cjs` **26/26** (score, classes,
  quarantaine fonctionnelle, trio, pas de migration statique, money).
- `npm run media:audit` (score + audit + contact sheet) vert.
- `npm test` 63/63 · E2E 30/30 · smoke 4/4 · regions OK · php N/A.

## 13. Production
- À vérifier post-merge : version.json b=<squash> + 5/5 HTTP 200.

## 14. Remaining gaps + architecture conforme proposée
1. Validation humaine des paires duplicates (contact sheet) → dé-quarantaine
   ou confirmation (fondateur, 10 min).
2. Re-shoot gp083 (aucun asset même-lieu supérieur en stock).
3. **Migration Places New CONFORME** (fondateur, clé + backend) : proxy
   serveur short-TTL (≤30 j, refresh worker) + `authorAttributions`
   affichées + `photo-classes` conservées ; jamais de bulk statique.
   Nouvel état serveur → Supabase-compatible (URLs + attributions, pas les
   binaires). Coût API : ~10 photos/lieu, SKU Places New — à chiffrer.
4. Variantes responsive (WebP/srcset/portrait) une fois la source conforme.
5. Intents niche (flags) inchangés par ce cycle.

## 15. PR / merge / deploy
- Branche `agent/coding/photo-quality-v2` → PR → CI 7/7 → squash → deploy.
- Rollback : revert 1 commit (données + gates, pas de migration irréversible).
