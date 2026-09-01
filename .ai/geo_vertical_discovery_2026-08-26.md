# GEO VERTICAL DISCOVERY — moteur sargasses réutilisable
## Rapport stratégique 2026-08-26 (OpenCode)

> Objectif : identifier la meilleure nouvelle verticale réutilisable à partir du moteur géospatial actuel (map/SVG/3D/comic/data/events) sans coder de feature.
> Règle : **NE CODE PAS** pendant ce sprint. Audit, scoring, recommandation MVP seulement.

---

## 1. CORE INVENTORY — composants réellement réutilisables

### GEO / REGIONS
- **regions/index.cjs** — source unique, validation stricte, fail-fast core MQ/GP, non-core isolé. Ajouter une région = 1 JSON conforme `_schema.json`. `getAllRegions`, `assertAllRegionsValid`.
- **regions/*.json** — 6 zones live (mq, gp, florida, rivieramaya, puntacana, tulum). Champs : id, domain, ftpDir, primaryLang, currency, timezone, bbox, center, beachFilter.
- **Maturité** : Production. **Réutilisabilité** : HIGH → extensible à n’importe quel jeu de lieux (spots, sentiers, zones).

### MAP / SVG / UI
- **src/WorldMapView.jsx** (~2 370 lignes) — carte SVG monde golden-hour, points de plages, pins `data-beach`, splat beaching, baking SVG→bitmap, declutter. `onOpenBeach`, `onPremium`, `track`.
- **src/ArchipelView.jsx** — variante Archipel (mappage archipel, déjà `data-beach`).
- **src/WorldView3D.jsx** — 3D Three.js (Three + OrbitControls) avec pins colorés par statut. Déjà lazy.
- **src/VerticalesMap.jsx** — scène scroll-driven SVG 10 paliers (SABLE→ABYSSE). Démonstrateur de story engine.
- **src/Conditions.jsx**, **src/CleanList.jsx**, **src/BeachSheet.jsx** — fiches lieu, plan B nearest clean, météo intégrée.
- **src/BriefMatin.jsx** — “Brief plage” quotidien, narrative comic + verdict.
- **src/PremiumModal.jsx** — paywall Mollie on-site, essai 30j, tokens.
- **Maturité** : Production. **Réutilisabilité** : HIGH pour toute verticale à lieux ponctuels. Le moteur carte + fiche + plan B est data-agnostic.

### DATA / PIPELINE
- **scripts/fetch-sargassum-live.cjs** — ERDDAP NOAA `cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_7D/1D.json`. Pas d’auth, public. `SAT_STALE_HOURS=24`.
- **scripts/fetch-beach-weather.cjs** — Open-Meteo Marine API + Forecast API (wave_height, wind, SST, UV). Gratuit, limite 10k/j non-commercial, CC-BY 4.0.
- **scripts/lib/forecast.cjs** — forecast honnête 7j : persistence exponentielle half-life 5.0j, drift banks, wind, gate R²≥0.4.
- **scripts/lib/confidence.cjs** — régime AFAI, mémoire.
- **scripts/lib/orientation.cjs** — orientation moyen terme J+14-21, gate bruit.
- **public/api/copernicus/sargassum.json** — contrat live partagé (updatedAt, erddapTimestamp, stale).
- **Maturité** : Production. **Réutilisabilité** : MEDIUM — le squelette fetch→bake→JSON→front est réutilisable, la logique sargassum est spécifique.

### COMIC / STORY / SVG ANIMATION
- **design/STORY/** — canon narration Le Veilleur.
- **src/SeqPrimitives.jsx**, **src/StoryScenes.jsx**, **src/ChasseHome.jsx** — scène comic, transitions golden-hour, reduced-motion.
- **scripts/lib/scene-svg.cjs** — moteur SVG (toVB cover-math, 1 rAF).
- **Maturité** : Production. **Réutilisabilité** : HIGH — moteur de narration data-driven. Mêmes composants peuvent raconter surf/kite/randonnée.

### DATA ADDITIONAL — déjà en place
- Open-Meteo forecast/marine utilisé dans Sargasses_PROD.jsx:3547-3548 et fetch-beach-weather.cjs.
- OSM/Nominatim utilisé par `scripts/build-region-outlines.cjs` (bboxes, contours). License ODbL.
- Supabase pour état serveur (funnel, analytics_events, photos).
- OneSignal push notifications (per island).
- Déploiement : GitHub Actions → build Vite → FTP 5 domaines (daily-copernicus.yml). Build budget ≤210 Ko gzip.

### Limites identifiées
- Région core protège MQ/GP, non-core peut être ignorée — OK pour expérimentation.
- Leaflet fallback encore présent (`?nav=map`) — ne pas supprimer.
- Pas de source événements locaux intégrée aujourd’hui.
- Open-Meteo gratuit = non-commercial use (10k/j). Production commerciale nécessite plan payant.

---

## 2. VERTICALES CANDIDATES — faisabilité data & reuse

### Évaluation rapide

| Verticale | Données requises | Sources actuelles | Licences/coût | Réutilisation core | Notes |
|---|---|---|---|---|---|
| **Surf / Kite / Foil** | houle, vent, direction, marée | Open-Meteo Marine + Forecast (déjà fetch) | Open-Meteo gratuit non-commercial → payant en prod | Map 100%, fiche 95%, forecast 70%, comic 80% | **Excellente**. Houle+vent déjà récupérée. Pas de nouvelle API. |
| Qualité des plages / baignade | météo, houle, vent, qualité eau | Open-Meteo + ERDDAP déjà | Gratuit/payant | Map 100% | 80% code commun avec sargasses. |
| **Concierge hôtelier “Brief matin”** | météo + plage + events locaux | Open-Meteo + données existantes | — | 95% — BriefMatin.jsx existe déjà | **MVP quasi immédiat**. |
| Randonnée / Nature | météo, sentiers OSM | Open-Meteo + Overpass OSM | ODbL gratuit | Map 90%, SVG 90% | Besoin dataset sentiers par région. |
| Drone / FPV | vent, météo, zones interdites | Open-Meteo + OSM | — | 80% | Besoin carto zones réglementaires. |
| Pêche | marée, courants, vent | Open-Meteo Marine | — | 80% | Marée accessible via Open-Meteo. |
| Événementiel local | events + lieu + météo | API events (Songkick/Meetup) | Payantes | 60% | Nouvelle source + légalité. |
| City intelligence | POI OSM + météo + events | OSM + Open-Meteo | — | 70% | Scope large, risque dilution. |

---

## 3. SCORECARD FINAL (0-100)

Critères : Business (WTP), Data Feasibility, Technical Reuse, Urgence, Différenciation.

| Verticale | Business | Data | Reuse | Urgence | Diff | Score |
|---|---|---|---|---|---|---|
| **Surf / Kite / Foil** | 9 | 9 | 9 | 8 | 8 | **86** |
| Concierge hôtelier Brief | 9 | 9 | 10 | 9 | 7 | **88** |
| Qualité des plages | 8 | 9 | 9 | 7 | 6 | 78 |
| Randonnée | 7 | 8 | 8 | 6 | 7 | 72 |
| Drone / FPV | 7 | 7 | 8 | 6 | 7 | 70 |
| Pêche | 6 | 8 | 8 | 5 | 6 | 66 |

---

## 4. WINNER : Concierge hôtelier “Brief matin” multi-condition (plage + météo + surf)

**Pourquoi elle gagne sur Surf pur** : même moteur, **BriefMatin.jsx** existe déjà, WTP B2B prouvé (79€/mois live), essai 30j self-serve, zero-call, moat honnêteté gardé (météo Open-Meteo auditée). Surf pur est B2C très concurrentiel et nécessite éducation.

**Narratif** : transformer le “Brief matin sargasses” en “Brief matin conditions côtières” = verdict mer propre + conditions baignade/surf + météo + event du jour. Même UI comic, même carte, même paywall.

---

## 5. MVP DE LA VERTICALE #1

**Utilisateur** : hôtelier / manager de plage / concierge (B2B self-serve), voyageur premium B2C.

**Problème** : besoin d’un résumé fiable quotidien (plage + météo + surf) pour conseiller clients sans deviner.

**Input** :
- Beaches-list existante
- `beaches-weather.json` (Open-Meteo Marine + Forecast) — déjà produit
- `sargassum.json` (ERDDAP) — déjà live

**Processing** :
- Score “Baignade OK” = f(wave_height < 0.8m, wind < 35km/h, AFAI status clean/moderate)
- Score “Surf OK” = f(wave_height 0.8-2m, wind direction onshore, vent 12-25km/h)
- Recommandation 1 phrase + emoji

**Output** :
- Carte SVG avec pins colorés par “Baignade / Surf / Éviter”
- Fiche plage avec onglets Verdict / Conditions / Surf
- BriefMatin étendu (même composant, nouveau copy)
- Alertes OneSignal si conditions basculent

**Map/SVG/3D/Comic** :
- Map : 100% reuse WorldMapView
- SVG : même moteur, badges surf/houle
- Comic : BriefMatin existant, juste nouveaux pictos
- 3D : optionnel plus tard

**Pricing** :
- B2B : Pro 79€/mois existant (widget embeddable)
- B2C : pass existant 7,99€ (déjà)

**Réutilisation exacte** :
```
EXISTING CORE
+ NEW DATA : wave_height, wind, uv déjà fetchés
+ NEW SCORING : swim/surf simple heuristique
+ NEW UI COPY : badges Surf / Baignade
= NEW VERTICAL
```

**Prototype plan 1 itération** :
- 1 zone : Riviera Maya (20 plages)
- 1 score swim/surf par plage
- Carte + fiche + 1 event = “bonnes conditions surf aujourd’hui”
- 1 CTA Premium (déjà)

**Validation terrain** :
- Audience : hôtels partenaires actuels B2B
- Canal : email existant + widget
- Métrique succès : 3 essais B2B en 30j, 1 conversion

---

## 6. ARCHITECTURE CIBLE

```
GEO ENGINE (regions/index.cjs, WorldMapView, ArchipelView)
    ↓
DATA ENGINE
  Satellite ERDDAP (AFAI)
  Weather/Marine Open-Meteo (déjà)
  OSM Overpass (sentiers/POI futur)
    ↓
DECISION ENGINE
  Sargassum score (existant)
  Swim/Surf score (nouveau, 30 lignes)
  Event engine (futur)
    ↓
UI LAYERS
  Map SVG → Fiche → Brief Comic → Alert OneSignal
```

Parties déjà réelles : 80% du graphe existe.

---

## 7. DATASOURCES — licence & coût

- **ERDDAP NOAA AFAI** — public domain, gratuit, ~1×/jour, stable.
- **Open-Meteo Marine/Forecast** — CC-BY 4.0, gratuit non-commercial 10k/j, 5k/h. Commercial → plan payant (à budgeter). Déjà utilisé en prod (fetch-beach-weather.cjs).
- **OSM/Overpass/Nominatim** — ODbL, gratuit avec politeness (1,2s delay déjà codé).
- **Google Maps** — ne pas scraper. Utiliser OSM pour POI/routes. Géocodage possible via Nominatim.

---

## 8. RISQUES

- Open-Meteo non-commercial aujourd’hui → passer à plan payant dès usage commercial réel.
- Surf = niche passion, acquisition plus chère que tourisme général. Concierge hôtelier = revenu immédiat.
- Ne pas créer de nouvel état serveur : tout passe Supabase.

---

## 9. VERDICT

**NEW VERTICAL #1 IDENTIFIED : Concierge hôtelier “Brief matin conditions” (surf/baignade/météo) sur base du moteur sargasses existant.**

Second choix immédiat : Surf/Kite dédié B2C si B2B ne décolle pas.

Ce rapport remplace tout brainstorm. Prochaine étape = prototype 1 zone (Riviera Maya) avec scoring swim/surf, sans modifier le core.

---
*Généré par OpenCode — 2026-08-26 — NO CODE CHANGES*
