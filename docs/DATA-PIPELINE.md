# Data Pipeline — v3.1

> Mise à jour : 2026-06. Script principal : `scripts/fetch-sargassum-live.cjs` + libs `scripts/lib/{forecast,confidence,score}.cjs`.
> Voir aussi : [ARCHITECTURE.md](ARCHITECTURE.md) §3 et [OPERATIONS.md](OPERATIONS.md) §3 (workflow `daily-copernicus.yml`).

## Vue d'ensemble

```
NOAA ERDDAP AFAI 7D (primaire) ──┐
NOAA ERDDAP AFAI 1D (bonus) ─────┤
Open-Meteo vent + marine ────────┼─► fetch-sargassum-live.cjs ─► JSON par région
Beach memory (history.json) ─────┤        │
Community reports (Apps Script) ─┘        ├─ sargassum.json   (niveaux + forecast + score)
                                          ├─ history.json     (append quotidien)
                                          ├─ sargassum-grid.json / sargassum-banks.json
                                          └─ forecast-archive.json (pour backtest)
```

Cadence : **4 runs/jour** (cron `0 0,6,12,18 UTC` dans `daily-copernicus.yml`). ERDDAP est public, sans auth. Fallback si ERDDAP down : `scripts/scrape-copernicus.cjs` (creds `COPERNICUS_USERNAME`/`PASSWORD`).

## 1. Sources

| Source | Donnée | Usage |
|---|---|---|
| ERDDAP `noaa_aoml_atlantic_oceanwatch_AFAI_7D` | Composite AFAI 7 jours (~4 km) | Signal primaire — robuste aux nuages |
| ERDDAP `noaa_aoml_atlantic_oceanwatch_AFAI_1D` | Composite AFAI 1 jour | Bonus détection des changements rapides (~24 h d'avance sur le 7D). Timeout court (15 s) : ne bloque jamais le run |
| Open-Meteo forecast | Vent (vitesse, direction, rafales) 7 j | Dérive des bancs + composante onshore du forecast |
| Open-Meteo marine | Houle, période, SST | Beach Score + forecast |
| Apps Script | Community reports agrégés (fenêtre 48 h) | Biais J0/J1 du forecast (MQ/GP seulement) |

Échantillonnage par plage : zone **nearby 0-30 km** (menace directe, poids fort) + zone **offshore 30-100 km est/NE** (menace entrante, poids faible), orientées par `coastNormal` (direction que la côte regarde). Les plages `sheltered` (baie de Fort-de-France + côte ouest Basse-Terre) ne reçoivent jamais de signal d'arrivée — protégées par le relief. Pas de détection = `NO_DATA_AFAI 0.05` (océan propre).

Seuils (AFAI normalisé, alignés NOAA SIR — raw 0.002→0.15, 0.005→0.40) : `< 0.15` clean · `0.15–0.40` moderate · `≥ 0.40` avoid.

## 2. Correction 1D pondérée par taille d'échantillon

`compute1DCorrection()` compare `avg1D − avg7D` sur la zone nearby et corrige l'AFAI 7D (borné), **multiplié par `min(1, n1D / 20)`** (`MIN_1D_SAMPLE = 20`).

Pourquoi (incident 2026-06-09) : la grille 1D MQ n'avait que 58 pixels valides, dont 8 dans les 30 km d'une plage et 4 **saturés au plafond capteur** → `avg1D ≈ 0.29` vs `avg7D` propre → toute l'île basculait en moderate sur 8 pixels. Avec la pondération, 8 pixels = correction à 40 % de sa force ; il faut ≥ 20 pixels pour une correction pleine. Une correction non nulle ajoute `+5` de confidence (multi-source) et suffixe `+1D` à `sourceDetail`.

## 3. Beach memory (`history.json`)

Modèle d'accumulation des échouages : le satellite voit les bancs **en mer**, pas les algues déjà échouées. Si une plage a reçu un arrivage il y a quelques jours, elle reste sale même si l'océan est redevenu propre.

- Fenêtre : **10 jours** d'historique (`WINDOW_DAYS`). Décroissance exponentielle, **demi-vie 5,0 j** (`HALF_LIFE_DAYS` dans `confidence.cjs` — v3.1 2026-04-12, relevée de 3,5 j après backtest : ~13 %/jour de décroissance au lieu de 18 %).
- Si la valeur mémoire décayée dépasse l'observation satellite → la plage est "boostée" : `source: 'memory'`, `memoryDaysAgo`, confidence remplacée par `memoryConfidence` (plus basse). Le champ `afaiSat` garde toujours la valeur satellite brute.
- Garde-fou : satellite **propre et frais** → la mémoire est ignorée (les sargasses se sont dispersées). Les entrées history des plages memory-sourced ne re-nourrissent pas la mémoire (sinon une plage boostée ne redevenait jamais propre).
- **État namespacé par région** : la racine `public/api/copernicus/history.json` reste l'état MQ/GP (rétro-compat) ; chaque nouvelle région a son `public/api/copernicus/<id>/history.json`.

### Purger un jour corrompu (history poisoning)

Un jour de données corrompues (ex. saturation capteur) contamine la beach memory pendant ~3 jours **après** le fix code, car la mauvaise valeur reste dans `history.json`.

- **Diagnostic** : une plage affiche `source: 'memory'` avec un `afai` élevé alors que `afaiSat` est propre depuis plusieurs jours → suspecter une entrée history pourrie.
- **Remède** : éditer `history.json` (racine et/ou `<id>/`), remplacer l'entrée du jour corrompu par l'**interpolation J-1/J+1** (moyenne des valeurs voisines par plage), committer. Ne pas supprimer le jour (trou = autre biais).

## 4. Forecast 7 jours (v3 — "honest forecast")

`scripts/lib/forecast.cjs` (`buildHonestForecast`) :

- **J0** : observation satellite (ou mémoire si le satellite a raté un échouage récent).
- **J+1 à J+3** : persistance exponentielle (même demi-vie que la mémoire) + **signal d'arrivée des bancs** (`sargassum-banks.json` : bancs clusterisés depuis la grille, centroïde pondéré AFAI, dérive vent (Stokes ~2,5 % du vent) + courant projetée vers la côte, cône d'acceptation autour de `coastNormal`) + composante vent onshore + tendance régression **seulement si r² ≥ 0,4 et ≥ 5 points**.
- **J+4+** : persistance seule, incertitude élargie ; **J+5..J+7 marqués `horizon`** (confidence < 15) — au-delà de 4 jours ce n'est plus une prévision exploitable.
- Plages `source: 'memory'` : forecast J0+J1 seulement (pas de projection synthétique).
- Community reports (48 h) décalent la baseline J0/J1 (MQ/GP seulement).
- ⚠️ Interdiction historique : ne **jamais** ré-ajouter de `cleanFloor ≥ 0.15` pour les plages atlantiques — ça épinglait les plages sud au seuil clean/moderate = 100 % de fausses alertes (revert session 35).
- Chaque run archive sa prévision dans `forecast-archive.json` ; `scripts/automation/backtest-forecast.cjs` compare archive vs observations à chaque run daily.

## 5. Beach Score 0-100 (`scripts/lib/score.cjs`)

Pertinence 365 j/an : les sargasses ne sont qu'un facteur sur 7. Poids (somme = 100) :

| Facteur | Poids |
|---|---|
| Sargasses (AFAI) | 30 |
| Hauteur de houle | 20 |
| Vent | 15 |
| Température de l'eau | 10 |
| Couverture nuageuse | 10 |
| Indice UV | 10 |
| Marée | 5 |

Même formule côté client (`src/lib/score.js`).

## 6. Sorties & contrat

| Fichier | Contenu | Consommé par |
|---|---|---|
| `public/api/copernicus/sargassum.json` | Niveaux + forecast + score, 20 plages MQ/GP, `source: "erddap-live"` — **contrat racine inchangé** | Front MQ/GP, health-checks, session startup |
| `public/api/copernicus/history.json` | Historique quotidien append (état mémoire MQ/GP) | Beach memory, purge poisoning |
| `public/api/copernicus/sargassum-grid.json` | Grille AFAI pour l'overlay carte | Front MQ/GP |
| `public/api/copernicus/sargassum-banks.json` | Bancs clusterisés + dérive prédite | Forecast (arrival detection), front |
| `public/api/copernicus/forecast-archive.json` | Prévisions archivées | Backtest |
| `public/api/copernicus/<id>/sargassum.json` + `history.json` | Pareil, par nouvelle région (`puntacana`, `florida`, `rivieramaya`) — bbox et plages depuis `regions/<id>.json` | Front de chaque nouvelle région (pas de grid/banks : overlays MQ/GP purgés) |

Les JSON sont **committés dans le repo** à chaque run (rebase `-X theirs` pour survivre aux pushes concurrents) puis copiés dans les dossiers `*-ftp/` et uploadés en FTPS. Mode test local : `SARG_OUT_DIR=<dir>` redirige toutes les écritures et l'état lu vers `<dir>/api/copernicus/` sans toucher `public/`.
