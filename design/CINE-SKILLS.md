# CINE-SKILLS — notre réponse à Higgsfield (et le carburant du all-in SEO)

> **Verdict (2026-07-03, doctrine + panel svg-only 5-1 déjà tranché — pas d'humain dans la boucle).**
> Higgsfield vend un **vocabulaire de caméra** (Dolly, Orbit, Crane, Rack Focus, FPV, Crash Zoom, Hyperlapse…)
> en **crédits IA payants**. Un mouvement de caméra n'est **pas de l'IA** : c'est une **transform sur une scène
> dans le temps**. Notre descente SVG **EST déjà** un mouvement de caméra. Donc on **ne branche PAS** l'API de
> génération Higgsfield (0 crédit + risque moat + panel svg-only). On **copie le CONCEPT** et on le rend avec
> **notre moteur gratuit SVG→ffmpeg** : cinématique on-brand **illimitée, à 0 €, zéro IA, on-moat.**

## Pourquoi on gagne l'offre (la comparaison)

| | Higgsfield | **Nous (cine-skills)** |
|---|---|---|
| Nature | IA image/vidéo générative | **Transform déterministe sur SVG** (math pure) |
| Coût marginal / clip | crédits (plan payant) | **0 €** (Playwright headless + ffmpeg déjà en place) |
| Volume | plafonné par le plan | **illimité** |
| Marque | générique, dérive de style | **100 % Le Veilleur** (fonts, palette, mascotte, scène validée) |
| Moat honnêteté | un « robot-satellite » IA au-dessus de la mer **contamine** « mesuré au satellite, pas deviné » | **aucun asset inventé** — la scène est une métaphore, jamais une preuve |
| Fraîcheur | — | data réelle tissable (`sargData`) sans fabrication |

> **La règle d'or tient : ces clips sont de l'AMBIANCE marketing. Le VERDICT reste 100 % ERDDAP.**
> Zéro IA = zéro risque de « fausse preuve » au reshare social (la faille qui tue les barrières « ambiance-only »).

## Le catalogue (12 skills, source de vérité = `window.CINE_MOVES` dans `proto-ecoscene-descent.html`)

Chaque skill est un mouvement de caméra pur, piloté par `t∈[0,1]`. FR / EN / ES intégrés. En regard, le préset
Higgsfield qu'il remplace :

| key | Le Veilleur (FR) | ≈ Higgsfield |
|---|---|---|
| `push_in` | Fondu avant | Dolly / Super Dolly In |
| `pull_out` | Recul | Crash Zoom Out / Dolly Out |
| `crane_up` | Grue haute | Crane Up / Jib Up |
| `crane_down` | Grue basse | Crane Down / Jib Down |
| `arc_left` | Arc gauche | Arc Left / Dolly Left |
| `arc_right` | Arc droit | Arc Right / Dolly Right |
| `orbit` | Orbite douce | 360 Orbit / Lazy Susan |
| `tilt_up` | Panoramique haut | Tilt Up |
| `rack_focus` | Bascule de netteté | Focus Change / Rack Focus |
| `fpv_glide` | Vol FPV | FPV Drone / Flying |
| `golden_lapse` | Heure dorée | Timelapse Landscape / Hyperlapse |
| `descent` | La Descente *(signature)* | Earth Zoom Out / Space Hyperlapse |

**Doctrine calme respectée** : un skill se joue **UNE fois à la demande** puis la caméra **se repose** (jamais de
boucle autonome au repos = tableau, pas aquarium) ; `reduced-motion` = pose héro figée, aucune animation.

## Comment s'en servir

- **Dans l'expérience (site)** : bouton `🎬 Skills` du header, ou `?skills=1` → feuille de chips ; on tape un skill,
  il se joue sur la scène vivante. 4 sorties (✕, Échap, re-tap). Opt-in, additif — la descente par défaut est intacte.
- **Générer un asset .mp4 (illimité, gratuit, zéro IA)** :
  ```bash
  node scripts/design/render-cineskill.mjs descent 9x16   # [skill] [9x16|16x9] [fps]
  # → scripts/video/out/cineskill-<skill>-<ratio>.mp4  (ffmpeg h264, faststart)
  ```
  Le renderer pilote `window.__applyCam(skill,t)` image par image → **même hook déterministe** que la feuille.
- **Vérifier (100 % headless, Playwright en fond)** :
  ```bash
  node scripts/design/verify-cineskills.mjs   # attendu : CINESKILLS_ALL_GREEN
  ```
  Invariants : catalogue exposé · chaque skill bouge la caméra · **calme** (0 anim transform infinie dans `#pMain`)
  · **hors-ligne** (Anton/Bricolage/JetBrains chargées, zéro CDN).

## Le cap : ZÉRO budget pub — TOUT sur Google / site / SEO

Les cine-skills sont **le carburant** de la bascule **all-in SEO** (pas de budget FB ads) :
- **Vidéo = poids SEO** (dwell, engagement on-page, `VideoObject` schema) : on peut désormais poser une boucle
  cinématique **sur n'importe quelle landing** (plage, commune, `/pro/*`, honnêteté) **à 0 €**, sans crédit IA.
- **Programmatique** : « 1 entité = 1 data-change = N assets » — un skill × une scène × un ratio × une langue =
  des variantes à l'échelle, sans écrire de code (juste changer les params).
- **Réutilisable hors sargasses** : le moteur `__applyCam` marche sur **toute scène SVG** → même arme pour l'autre
  projet (dashboard/terminal), sans un centime de génération IA.

**Prochaines marches (non faites, derrière flag + re-panel avant public)** : (1) rendre 2-3 clips signature (descent,
golden_lapse, fpv_glide) et les brancher en boucle légère sur une landing SEO derrière `?video=0` ; (2) `VideoObject`
JSON-LD + poster ; (3) générer les variantes 9x16/16x9 EN/ES dans un step GH Actions. **Toujours** : le verdict reste
data ERDDAP, l'argent ne le touche jamais.
