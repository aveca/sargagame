# DATA INTELLIGENCE + NICHES — rapport final 2026-09-25F

> Base = main @81a7a6b73 (PR #747 live). Money-path : ZÉRO touché.

## 1. HEAD / branch
- Départ : `81a7a6b73` (main, #747 + handoff). Pipeline frais (stale:false).
- Branche : `agent/coding/niche-evidence-f` → PR → CI → merge → deploy.

## 2. Sources discovered (toutes réelles, aucune ajoutée silencieusement)
| Source | Provider | Champs | Usage F |
|---|---|---|---|
| satellite | Copernicus/ERDDAP (pipeline) | status, afai, score, confidence | evidence + tips H2S |
| flags | beach objects (régions) | kids 172 · snorkel 47 · parking 86 /196 | evidence + tips |
| coords | géométrie (seuils MQ -61.1 / GP -61.6) | leeward, 196/196 | sunset + abrité |
| drive | donnée plage | 136/136 MQ-GP | facts accès |
| forecast | moteur 7j | semaine, backup | plan (inchangé) |
| **marine (NOUVEAU en fiche)** | **Open-Meteo Marine API, gratuit sans clé, par coords, temps réel** | wave_height, swell, direction | section MER + verdict snorkeling |
| media | catalogue 172 photos / 80 vidéos | hero/card | binding intents (test) |
| vent (weather API) | Open-Meteo forecast | wind_10m | **FUTUR voile — documenté, pas câblé** |

## 3. Data contracts
- `src/lib/intent-evidence.js` (pur, B2C/B2B/B2G) : `INTENT_REGISTRY`
  (5 live + 5 blocked + raisons exactes), `evidenceFor()` → {intent,
  beachId, score 10-100 déterministe, confidence, evidence[{text,source}],
  updatedAt}, `tipsFor()` → [{kind:warning|tip|fact, text, source,
  confidence}]. Formule documentée (base statut 70/40/10 +15 flag +10
  leeward-sunset +0..10 score). Jamais d'absolu.
- `src/lib/marine.js` : seuils = conditions-filters.js (0.8/1.0/1.5),
  `marineState()`, `snorkelSea()`, `fetchMarine()` (cache 30 min, timeout
  8 s, jamais de throw).

## 4. Activated niches
- **Snorkeling-grade (mer calme)** : section MER BeachExperience — vagues/
  houle live + chip état + « Bonne visibilité probable » si flag + clean +
  vagues<1,0 m (même règle que la page /conditions/snorkeling). Preuve
  shot : « Mer calme 0,58 m, houle 0,38 m ».
- **5 intents live enrichis** : reco home affiche raison + source
  (`intent-reco-why`) ; savoir fiche = tips sourcés.

## 5. Rejected niches (raisons exactes — DoD #1 satisfait aussi par ce rapport)
- diving `no-depth-data` (flag snorkel ≠ plongée, même avec flag) ·
  fishing `no-fishing-source` (seul signal = heuristique communes legacy) ·
  sailing `no-sailing-source` (vent seul insuffisant, pas de mouillage/cale) ·
  romantic `no-honest-proxy` · wild `drive-plus-parking-unproven`.

## 6. Beach Object changes
- Aucune casse du modèle. Extensions additives : `beachFacts[].source`
  (sg-visual.js), evidence/tips/marine consommés en lecture seule.
  Primitive centrale B2B/B2G = `intent-evidence.js` (pur, documenté).

## 7. Perfect Day
- Inchangé structurellement (déjà photo + pourquoi + semaine + alternative
  + savoir). La reco qui l'alimente est désormais expliquée (raison+source).

## 8. Good tips (provenance)
- savoir fiche = tipsFor : H2S (satellite, high), masque (flag, high),
  abrité (coords, medium), parking (flag), drive (donnée). Chaque item
  affiche « Source : X ». Règles = celles de VisitPlan legacy (mêmes seuils).

## 9. Media binding
- Intent → média = média de la plage recommandée (jamais de stock).
  Couverture testée : top 121/121 · snorkel 27/27 · family 124/124 ·
  sunset 35/35 · easy 37/37 avec photo réelle ; 80 ids vidéo manifest.

## 10. SEO
- Zéro page créée (pas de clones). Google → landings utiles EXISTANTES :
  `dist/conditions/` (snorkeling, mer-calme, baignade-ideale, etc.),
  `/aujourdhui/`, 136 pages plages. Modèle de route niche documenté
  (primitive evidence réutilisable quand contenu quotidien distinct).

## 11. Commercial journey
- Chaîne events existante vérifiée : sg_intent_select →
  sg_recommendation_open → sg_plan_generate → sg_trip_open → paywall →
  Mollie. Aucun nouvel event (allowlist intacte). FREE vs PREMIUM déjà
  concret (WorldPaywall « AUJOURD'HUI (gratuit) / AVEC LE PASS : 7 jours ·
  alertes · alternatives ») → 0 changement, 0 risque. Mollie paid = seule
  vérité (dashboard, jamais renommée « conversion »).

## 12. Mobile UX
- Shots 390 : reco-why lisible, MER live, savoir sourcé. Pas d'overlay,
  pas de scroll-X, verbeux maîtrisé. 1440 : inchangé (sections col2).

## 13. Tests
- `tests/unit/niche-evidence.test.cjs` **42/42** (registre, déterminisme,
  seuils métier, binding, photos C, money). `npm test` **62/62**.
  E2E perfect-trip 5/5 + experience 8/8 + journey 5/5 + funnel 13/13.

## 14. Build/bundle
- build exit 0 (404 modules) · **38,2 Ko ≤ 210** (zéro eager ajouté ;
  sg-icons lazy 3,05 Ko) · smoke 4/4 + SMOKE_GATE=PASS · regions OK ·
  php N/A.

## 15. Production
- À vérifier post-merge : version.json b=<squash> + 5/5 HTTP 200.

## 16. Mollie
- INTACT : 0 diff (vérifié). Contrats pass-money verts.

## 17. Regressions
- KI-2026-09-24A / BUG-2026-038 / UX-QA-002 : suites vertes, zones non
  touchées. Rollback F : `?sgvis=0` (MER + savoir-tips + reco-why).

## 18. Remaining gaps
- Vent (weather API) bulk par plage → future evidence voile (job quotidien,
  pas du fetch client ×196).
- Flags pêche/port/mouillage/isolement/profondeur → ingestion SIRENE-like
  ou relevé terrain ; modèle d'import documenté dans le registre (missing[]).
- 3 photos C conservées (même lieu, affichées ≤160px — règle jointe).
- NicheExperience route : à ouvrir seulement avec contenu quotidien distinct.

## 19. PR / merge / deploy
- Branche `agent/coding/niche-evidence-f` → PR → CI 7/7 → squash → deploy.

## 20. What NOT to touch next
- Money-path · moteur forecast · nouvelles intentions sans flag ·
  substitution photo inter-lieux (Îlet_du_Gosier ≠ Plage du Gosier) ·
  fetch météo ×196 côté client · `dist/` · secrets · Apps Script.
