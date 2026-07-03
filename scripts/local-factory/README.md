# Usine locale Sargasses — Couche C (pur-code, zéro LLM, zéro Claude)

> Objectif : quand le PC est **allumé mais Claude Code fermé**, la machine fait
> seule le travail que le cloud ne *peut* pas faire (rendu GPU + publication FB),
> se met à jour toute seule (`git pull`), et rattrape au démarrage. Tu éteins,
> tu rallumes, tu n'ouvres pas Claude — et le contenu du jour se produit.

## Le stack en 3 couches (lire d'abord)

| Couche | Qui | Tourne quand | LLM ? | Possède |
|---|---|---|---|---|
| **A — Cloud** (GitHub Actions, 30 workflows) | serveurs GitHub | **toujours, PC éteint inclus (Shabbat)** | non requis | **tout le money-critical** : pipeline ERDDAP → build → deploy FTP → emails (drip/dunning/win-back/cart) → briefs → support → outreach B2B |
| **B — Tâches Claude locales** (~12 `sargasses-*`) | daemon Claude | seulement app ouverte | oui | jugement/édito opportuniste (gelé « complet » par l'audit 02/07) |
| **C — Usine locale** (ce dossier) | Planificateur Windows | quand le **PC est allumé** | **non** | **rendu vidéo/animation** + **publication FB** (session locale) + auto-update |

**La vérité qui tient 10 ans :** l'immortalité vient de la **Couche A** (le revenu
coule PC éteint). La Couche C est un **bonus** non-money-critical : un jour de brief
manqué = zéro vente perdue, l'usine rattrape au boot suivant. C'est *pour ça*
qu'on peut la garder simple et tolérer les coupures.

## Ce que fait `factory.cjs`

1. **Auto-update** — `git pull --ff-only` : récupère le code *et* le
   `sargassum.json` du jour rendu par le cloud. (Hors-ligne → saute le pull,
   rend sur le local.)
2. **Rendu du Brief plage** — 5 régions, `make-brief.cjs` (ffmpeg + edge-tts +
   Playwright, 100 % local). Marker daté `out/brief-<region>-<date>.mp4` = **1
   rendu/région/jour**, jamais de backfill. **Garde-fou fraîcheur** : si le
   satellite est périmé (source ≠ erddap-live, `stale`, ou > 36 h) → skip propre.
3. **Publication FB** — MQ/GP, `fb-post-video.cjs` (session Edge locale). **OPT-IN**
   (voir ci-dessous), avec fraîcheur **re-vérifiée ≤ 24 h**, dédup, et cap/jour.
4. **Journal** — `LAST_RUN.md` (lisible d'un coup d'œil) + `logs/factory-<date>.jsonl`.

### Ce qu'elle NE fait PAS (par design)
- **Aucun email / pipeline / deploy** → c'est la Couche A (cloud), qui tourne PC
  éteint. Un jumeau local risquerait le **double-envoi**.
- **Aucun scraping/API de données** → même raison : le pipeline data est cloud,
  machine-off-safe. L'usine *consomme* la data via `git pull`, elle ne la
  re-produit pas (sinon course/double-écriture sur `sargassum.json`).
- **Aucune décision LLM, aucune écriture money/checkout.** Usine à contenu, point.

## Installer / activer (sur la machine)

```powershell
# 1. Enregistrer les 2 tâches (démarrage + quotidien 05:30)
powershell -ExecutionPolicy Bypass -File scripts\local-factory\install-tasks.ps1

# 2. Test à blanc (n'exécute rien, dit ce qu'il ferait)
node scripts\local-factory\factory.cjs --plan

# 3. Test réel immédiat
Start-ScheduledTask -TaskName SargaFactory-Daily

# Désinstaller (réversible)
powershell -ExecutionPolicy Bypass -File scripts\local-factory\uninstall-tasks.ps1
```

### Activer la publication FB (depuis mobile)
Par défaut `config.json` → `fbAutoPublish: false` (l'usine **stage** en dry-run,
ne poste rien). Pour publier réellement : passe `fbAutoPublish` à `true` et
**committe sur `main`** — le `git pull` de l'usine le prend au prochain run.
Recommandé : prouver 2-3 posts en manuel (`node scripts/automation/fb-post-video.cjs --region=mq --go`) avant de basculer le flag.

## Configuration — `config.json`
| clé | défaut | rôle |
|---|---|---|
| `renderRegions` | 5 régions | régions à rendre |
| `fbRegions` | `mq, gp` | régions FB (seules avec un groupe câblé) |
| `fbAutoPublish` | `false` | **interrupteur** publication FB réelle |
| `maxFbPostsPerDay` | `2` | cap posts/run |
| `fbPublishMaxAgeH` | `24` | plafond fraîcheur FB (plus strict que le rendu 36 h) |

## « mode agentic entreprise offline » — ce que ça couvre honnêtement
- **contenu** ✅ : rendu vidéo/brief (extensible : hero-loops, share-cards).
- **autoupdate** ✅ : `git pull` du code + de la data à chaque run.
- **publication** ✅ : FB (le seul canal que le cloud ne peut pas faire).
- **data / scraping / API** → **couche A (cloud)**, pas ici. Le local n'a pas à
  scraper : le cloud le fait 24/7, PC éteint, et l'usine récupère le résultat
  par `git pull`. Dupliquer localement = course + risque d'incohérence.

## Disaster-recovery / limites 10 ans (sans enrobage)
- **edge-tts** = service en ligne MS non officiel, sans SLA → maillon le plus
  fragile du rendu. *Durcissement à venir* : fallback voix-muette (SRT incrusté +
  nappe vagues) puis Piper TTS offline. Aujourd'hui, TTS KO = rendu de la région
  échoue (isolé, les autres continuent).
- **Playwright/Chromium & FB** : les sélecteurs FB pourrissent et l'automation est
  contre les CGU Meta → posting FB gardé non-money-critical + valve. Sa mort
  éventuelle ne coûte que de l'engagement.
- **Session `.fb-session`** : cookies de login non reproductibles → **le seul état
  local à sauvegarder** (avec `beaches-images*`). Reste = `git clone` + ffmpeg/node.
- **Planificateur Windows** = surface la moins observable (une MAJ Windows peut
  dé-enregistrer les tâches en silence). Parades : `install-tasks.ps1` committé
  (schedule reproductible depuis git) + **heartbeat cloud SHIPPÉ** (2026-07-02) :
  `factory.cjs` poste un `factory_heartbeat` dans `analytics_events` (Supabase, clé
  anon publique) à chaque run réussi ; `scripts/automation/factory-heartbeat-watch.cjs`
  (step `daily-copernicus.yml`, schedule-only) alerte le fondateur si aucun signal
  depuis > 48 h (`HEARTBEAT_MAX_H`).
- **Immortalité réelle** = Couche A (cloud) pour le revenu + minimalisme ici :
  `factory.cjs` ne dépend que de `fs` + `child_process` + `git` + `ffmpeg`.

## Backlog (étapes suivantes, hors keystone)
1. Self-host des polices (Anton/Bricolage) → tuer la dépendance Google Fonts au rendu.
2. Fallback edge-tts (voix-muette) puis Piper offline.
3. Heartbeat cloud « usine silencieuse > 48 h » (1 step dans `daily-copernicus.yml`).
4. Job hebdo DepthFlow (Dim, GPU idle-gated) → `gh release` (le seul rendu que le cloud ne peut pas faire).
5. Valve FB : gate participation/duplicate dans `fb-post-video.cjs` avant `fbAutoPublish=true`.
