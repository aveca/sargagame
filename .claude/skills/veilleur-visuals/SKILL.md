---
name: veilleur-visuals
description: >-
  Générer des visuels "Le Veilleur" cohérents et sur-mesure par plage/mot-clé/langue —
  posters statiques (og:image SEO), doodles animés d'app, scènes canvas interactives,
  widgets de données. Inspiré des doodles/widgets/hovers Google, mais alimenté par la
  VRAIE physique satellite et soumis à la loi d'honnêteté (0 chiffre inventé). Utiliser
  dès qu'on crée une image de partage, un héro animé, un loader de marque, un widget
  stats, ou qu'on veut décliner un visuel en masse (1 plage = 1 image) sur nos niches
  (Martinique, Guadeloupe, Cancún/sargazo, Miami, Punta Cana).
---

# Le Veilleur — moteur de visuels

> Doctrine d'exécution VISUELLE générative. On décline le même univers (golden-hour
> océan, silhouette qui regarde la mer, dégradés chaud→froid) en 4 modes, toujours
> **alimentés par la donnée réelle** et **déterministes** (rebuild = image identique).
> En cas de conflit, `CLAUDE.md` (Doctrine UI + moat honnêteté) tranche.

## Les 4 modes (choisir selon la surface)

| Mode | Quand | Techno | Sortie |
|---|---|---|---|
| **Poster statique** | og:image SEO, partage WhatsApp/réseaux, header email | SVG rendu → PNG (build-time) | `dist/<route>/og.png` par plage/mot-clé/langue |
| **Doodle animé** (app) | héro d'accueil, moment de délice, loader de marque | SVG + CSS anim / mask gradient | composant React dans l'app (budget JS !) |
| **Scène canvas interactive** | onboarding, page trust, "la mer respire" | `<canvas>` + rAF + pointer | composant lazy hors first-paint |
| **Widget de données** | B2B/pro, page fiabilité, "match center de la mer" | HTML/SVG + hovers, tabulaire | surface pro (thème navy) |

**Défaut le plus rentable = poster statique** (SEO × niches, léger, pas de budget JS,
se génère en masse). "gif non animé mais mieux fait" = poster qualité affiche, pas un GIF lourd.

## Tokens de marque (verrouillés — ne pas inventer)

- **Fonts** : display/titres = **Anton** (fallback poster sans webfont : `Impact,'Haettenschweiler','Arial Narrow Bold'`). Corps = **Bricolage Grotesque** → `system-ui`.
- **Couleurs univers** : or `#FFC72C` (accent/CTA/mascotte, **jamais** une marque de donnée) · ancre encre `#0d1117` / `#17121C` · golden-hour sweep `#FFC72C → #FF6A3D → #F0357E → #15B3A3 → #0A4E6E`.
- **Thème pro/B2B** = navy `#0a1620` (seule zone sombre tolérée).
- **Verdict = couleurs de STATUT** (toujours + icône + label, jamais couleur seule) :
  - propre `#2FD2B0` ✓ · modérée `#F7A620` ≈ · alerte `#FF5A47` ▲.
  - Validées daltonisme (ΔE 31.8, contraste ≥3:1 sur navy) via le validateur dataviz.
- **Accent par niche** (de `regions/<id>.json.brand`) : MQ/GP or `#FFC72C` · Cancún turquoise `#22D3C5` · Miami `#38BDF8` (region `brand.primary #0EA5E9`) · Punta Cana corail `#FF9F45`.

## Vocabulaire de silhouettes (l'univers)

Le Veilleur (personnage à la longue-vue qui regarde la mer) · vagues en bandes ·
mouettes (courbe en "m") · soleil golden-hour · palmier · **monde humain de l'algue** :
ramassage + tracteur, pêcheur, yoleur (voile trad. Antilles), agriculteur (algue→compost),
recycleur. Silhouettes = formes composées simples remplies d'UN dégradé `userSpaceOnUse`
(un seul dégradé continu sur toute la figure), pas des paths géants à la main.

## Lois d'honnêteté (le moat — non négociable)

- **0 chiffre inventé.** Donnée absente → cadenas/incertitude affiché, **jamais** un faux "propre". Verdict 100 % data ERDDAP.
- **L'argent ne touche jamais le verdict** : encart Partenaire = `sponsored`, il n'influence aucune couleur/chiffre de verdict.
- **Claim fiabilité hedgé** : jamais un "100 %" nu. Toujours la fenêtre datée + N + "saison calme" + le plancher **~76 %** tous régimes + faible confiance sur les alertes. Chiffres publiés : `overall 77 · calm 79 · peak 76` (source `backtest-results.json`, demi-vie persistance **5,0 j** de `confidence.cjs` — ne jamais re-hardcoder).
- **Promesse positive** : "devenez celui qui connaît la fin de l'histoire", jamais "débloquez J+2-7".

## Déterminisme (obligatoire pour tout générateur build-time)

Comme `scripts/lib/scene-svg.cjs` : **seed = `hashSeed(beach.id)`**, aucun `Math.random()`
ni horloge runtime dans la génération → 2 builds = fichier **byte-identique** (sinon le
FTP re-pousse tout + le SW bump en boucle). Passer les timestamps par argument.

## Accessibilité & perf (plancher dur)

- **`prefers-reduced-motion`** : toute anim dégrade en image fixe propre (loi couverte par `ux-smoke.mjs`, token `RM_INFINITE=[]`). Pas de fallback = livrable incomplet.
- Modales/widgets : `role="dialog"`, Échap, focus-trap. Contraste jugé en `getComputedStyle`, **jamais** sur capture headless (le conteneur force les couleurs → le PNG ment).
- **Budget JS eager ≤210 Ko gzip** (CI bloquant `check-bundle-budget.cjs`) : un doodle d'app va dans un chunk lazy hors first-paint, ou justifie sa hausse. Les posters (build-time → PNG) ne pèsent RIEN sur ce budget.

## Où ça se branche dans le repo (ne pas repartir de zéro)

- **Générateurs existants à mirrorer** : `scripts/lib/scene-svg.cjs` (SVG héro déterministe seedé) · `scripts/automation/gen-saga-card.cjs` (carte mascotte 1080², données réelles, 0 chiffre inventé) · `scripts/lib/widget-embed.cjs` (widget B2B SSR) · `scripts/automation/gen-beach-{wordle,wrapped}.cjs`, `gen-verdict-veilleur.cjs`.
- **Pattern generator build-time** (le bon pour un poster) : `scripts/lib/<x>.cjs` exportant `generate…(region, distDir)`, lit `backtest-results.json` + `public/api/copernicus[/<region>]/sargassum.json`, remplit un template SVG/HTML, `mkdirSync`+`writeFileSync` dans `dist/<route>/`. Appelé via `_require('./scripts/lib/<x>.cjs')` dans le hook `closeBundle` de `vite.config.js` (call MQ/GP ~L1052 + call région ~L455). Modèle vivant = `scripts/lib/reliability-page.cjs`.
- **Chaîne de build** (`package.json` `build`) : `sync-version → build-sargassum-json → gen-b2b-partners → vite build → stamp-sw-hash`. Un générateur JSON→`public/api/` se place avant `vite build` (comme `gen-b2b-partners.cjs`).
- **Cron / mises à jour** : PAS de nouveau workflow. Brancher un step dans l'existant — `generate-og-images.yml` (images) ou `daily-copernicus.yml` (pipeline 4×/j, `cron: '0 0,6,12,18 * * *'` + push `main`, `concurrency` déjà en place). Idempotent + déterministe (cf. ci-dessus).
- **Données de niche** : `regions/<id>.json` porte `name`, `domain`, `primaryLang`/`secondaryLangs`, `currency`, `brand.{primary,accent}`, `beaches[]` (id/name/status), `seo.{homeTitle,homeDesc}`. Verdict/fraîcheur : `sargassum.json` (`levels[]`, `weekly[beach].forecast[]`, `stale`, `dataAgeMinutes`).

## Mapping mots-clés × niches (SEO)

| Région (id) | Domaine | Langue | Mot-clé racine |
|---|---|---|---|
| Martinique (`mq`) | sargasses-martinique.com | FR | **sargasses** martinique |
| Guadeloupe (`gp`) | sargasses-guadeloupe.com | FR | **sargasses** guadeloupe |
| Riviera Maya (`rivieramaya`) | sargassumcancun.com | ES | **sargazo** cancún |
| Floride (`florida`) | sargassummiami.com | EN | **sargassum** miami |
| Punta Cana (`puntacana`) | sargassumpuntacana.com | ES | **sargazo** punta cana |

1 plage × 1 mot-clé × 1 langue = 1 poster → déclinaison programmatique (136+ pages plages existantes).

## Localisation (structure identique, on traduit)

- Verdict propre : FR "MER PROPRE" · ES "MAR LIMPIO" · EN "CLEAN WATER".
- "Mesuré au satellite" : ES "Medido por satélite" · EN "Measured by satellite".
- Signature : FR "il regarde la mer pour vous" · ES "mira el mar por ti" · EN "we watch the sea for you".
- Jamais de cul-de-sac : verdict alerte → "→ crique propre la plus proche" (FR) / équivalent.

## Recette express (nouveau poster/visuel)

1. Choisir le mode (défaut = poster statique).
2. Charger tokens + accent de niche (`regions/<id>.json`) + verdict réel (`sargassum.json`).
3. Composer : golden-hour + silhouette(s) du vocabulaire + wordmark mot-clé + pill verdict (statut+icône+label) + chip "Mesuré au satellite" + domaine + signature localisée.
4. **Déterministe** (seed plage), **0 chiffre inventé**, reduced-motion OK.
5. Générateur build-time → `dist/` ; wirer dans `closeBundle` + un step cron existant.
6. Gate de ship (`npm run build`, budget, smoke) avant merge sur `main`.

## Prototypes de référence (session doodle 2026-07-02)

4 artefacts explorés (Doodle Lab mot-logo+mer interactive+loader ; Personnages ramassage-tracteur+profils ; Widget stats "physique mieux que le sport" ; Posters mots-clés). Le code source de chacun est le point de départ concret de chaque mode.
