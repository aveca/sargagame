# Journey Recorder — REAL screen-recording of the REAL app, human-like

> **NON-NEGOTIABLE (doctrine « no AI slop »)** : ces vidéos sont des **screen-recordings du vrai produit shippé**, pilotés comme un humain. **JAMAIS de vidéo générée par IA.** Le harnais ne fabrique aucune image : il ouvre l'app réelle dans Chromium et filme l'écran.

## Quoi

`journey-recorder.cjs` pilote la **vraie app** (dist en local `http://127.0.0.1:8799`, fallback prod `https://sargasses-martinique.com`) avec **Playwright chromium**, enregistre un **mp4/webm par parcours** (`recordVideo`), et se comporte comme un humain : mouvements de souris courbés/jitterés, scroll doux par incréments, hover, clics sur **éléments visibles uniquement**, dwell sur le verdict / la prévision.

En parallèle il **capte le vrai funnel KPI** en écoutant les requêtes réseau :
- POST vers `${SUPABASE_URL}/rest/v1/analytics_events` → extrait les `event` names (`sg_session_start`, `sg_forecast_lock_click`, `sg_premium_modal_open`, `sg_premium_modal_cta`, `sg_pass_cta`, `sg_checkout_redirect`).
- `/api/b2b-trial.php` atteint → `b2b_trial_started`.
- Redirection vers un host de paiement (mollie/paypal/stripe) → `sg_checkout_redirect` (arrêt à la redirection, **aucun paiement réel**).

Un « bon » parcours **fait feu sur plusieurs de ces events** = couverture KPI, tracée dans le manifeste.

## Pourquoi

1. Alimenter les chapitres `screencap` du moteur **TourVideo** (Remotion, `src/TourVideo.tsx`) avec des captures **authentiques** du produit — pas du mock, pas de l'IA.
2. Prouver le funnel : chaque run enregistre quels KPI ont réellement tiré, pour vérifier que le parcours humain traverse bien le tunnel de conversion.

## Comment lancer

```bash
# depuis le repo (node_modules jonctionné : playwright présent)
cd scripts/automation

# quota par défaut (journeys.json : short=4, long=2), local d'abord, fallback prod auto
node journey-recorder.cjs

# uniquement des parcours courts, contre la prod
node journey-recorder.cjs --bucket=short --base=https://sargasses-martinique.com

# un seul parcours long, fenêtre max 20 min
node journey-recorder.cjs --bucket=long --count=1 --maxMin=20

# voir le plan sans lancer de navigateur
node journey-recorder.cjs --dry

# debug visuel (fenêtre visible)
node journey-recorder.cjs --count=1 --headed
```

### Flags CLI

| Flag | Défaut | Effet |
|---|---|---|
| `--base=URL` | `http://127.0.0.1:8799` (ou `$JOURNEY_BASE`) | App cible. Health-check `GET base/` au boot ; échec → bascule fallback prod. |
| `--bucket=short\|long\|mix` | `mix` | Filtre le bucket. `mix` remplit les deux quotas. |
| `--count=N` | quota de `journeys.json` | Force N parcours (répartis sur les buckets autorisés). |
| `--maxMin=N` | `20` | Plafond dur de durée par parcours (min avec le max du bucket). |
| `--headed` | off | Fenêtre visible (debug). |
| `--dry` | off | Affiche le plan de queue, ne lance rien, exit 0. |

## Buckets & sélection

- **court** = 1–10 min · **long** = 10–20 min (fenêtres dans `journeys.json > buckets`).
- Un parcours plus court que le minimum de son bucket est **rembourré** par du « idle browsing » (petit scroll haut/bas + dérive souris) jusqu'à atteindre le plancher → la vidéo lit comme une vraie session.
- **Sélection = aléatoire pondérée qui remplit les quotas** : on pioche dans le bucket le moins rempli, `weightedPick` choisit un template selon son `weight`. **« Si le bucket n'est pas plein → parcours suivant »** jusqu'à saturation des quotas.

## Sortie

```
scripts/automation/data/journeys/
  <ts>-<journeyId>/
    <hash>.webm          # la capture Playwright (webm ; convertir en mp4 via ffmpeg si besoin)
    manifest.json        # { journey, persona, bucket, duration_s, kpi_events_hit:[...],
                         #   kpi_events_sequence, checkout_redirect, steps_done, video_path, run_dir }
  run-index.json         # append-only : liste de tous les manifestes de tous les runs
```

**Convertir webm → mp4** (ffmpeg dispo) :
```bash
ffmpeg -y -i input.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4
```
(Remotion `<OffthreadVideo>` accepte le webm directement ; le mp4 est utile si un pipeline aval l'exige.)

## Comment les mp4 alimentent TourVideo (`screencap` chapters)

Le moteur **TourVideo** (Remotion, `src/TourVideo.tsx`) assemble des chapitres. Un chapitre de type `screencap` pointe une capture réelle :

```ts
// pseudo — un chapitre screencap consomme la sortie du recorder
{ type: 'screencap', src: staticFile('journeys/<ts>-<id>/recording.mp4'),
  caption: manifest.persona, kpis: manifest.kpi_events_hit }
```

Flux : `run-index.json` (ou les `manifest.json`) → sélection des parcours dont la couverture KPI est la plus riche → chaque `video_path` devient la source d'un chapitre `screencap`. Le manifeste porte le persona (légende) et les KPI touchés (surimpression / preuve funnel).

## Résilience (ne crashe jamais)

- Chaque step est en `try/catch` (best-effort). Un step qui échoue est loggé et skippé, le parcours continue.
- Navigation **par URL + interactions sur éléments visibles** (pas de sélecteurs fragiles exacts) → survit aux changements de DOM.
- Le `main()` attrape tout et **exit 0** pour qu'un step de cron rapporte un run plutôt qu'un échec rouge.
- Chromium manquant → `npx playwright install chromium` auto au boot.
- Écriture **append** dans `run-index.json` après chaque parcours (une crash laisse une trace).

## Rappel doctrine

- **Screen-recording RÉEL, humain-like. JAMAIS de vidéo IA.**
- Aucun paiement réel : le parcours « convert intent » **s'arrête à la redirection** de paiement.
- Mobile-first : viewport 390×844, UA iPhone, touch — cohérent avec l'app mobile-first.
