# Widget embeddable B2B (état de la plage) — spec d'exécution

> Surface : `/widget/` (landing partenaire) + `/widget/embed/<slug>/` (iframe embeddable).
> Cible visuelle : la barre `src/HomeAZ.jsx` (golden-hour, Le Veilleur qui rassure ≠ surveille, doctrine calme, ZÉRO image IA).
> Tout est ADDITIF + A/B + réversible + data HONNÊTE. Le control reste l'iframe plat actuel.

---

## État actuel

Deux fichiers existent déjà, statiques, copiés tels quels par Vite (`publicDir` par défaut → tout `public/` est copié dans `dist/`, donc `dist/widget/index.html` et `dist/widget/embed/index.html` partent en prod).

### 1. `public/widget/index.html` (landing partenaire, 67 lignes)
- Page marketing FR pure HTML (fonts Anton + Bricolage), fond `#FDFCF7` (clair, hors charte golden-hour de la barre).
- `<link rel="canonical" href="https://sargasses-martinique.com/widget/">` (l.7) — **codé en dur MQ**, jamais réécrit pour le build GP (le build GP réutilise ce shell sans ré-ancrer → canonical pointe MQ depuis le domaine GP).
- Aperçu = `<iframe src="/widget/embed/anse-mitan/" height="90">` (l.~48) → **route inexistante** : il n'y a PAS de sous-dossier `embed/anse-mitan/`, seulement `embed/index.html`. En prod statique (Apache/FTP, pas de SPA-rewrite vérifié pour ce chemin) `/widget/embed/anse-mitan/` renvoie 404 → l'aperçu de la landing est cassé.
- Liste 20 slugs « disponibles » (`anse-mitan`, `diamant`, `les-salines`, `gp-malendure`…) = les ids legacy de `sargassum.json.levels`, PAS les slugs SEO `beaches-list.json` (`plage-du-diamant`, `plage-des-salines`…). Incohérence d'adressage.
- Pas de `<meta name="description">` localisé, pas de hreflang, pas de version EN/ES alors que le site est tri-lingue.

### 2. `public/widget/embed/index.html` (l'iframe, 3123 octets, 76 lignes)
- `<meta name="robots" content="noindex, follow">` (correct pour un embed).
- Markup = une barre plate : `.dot` (clean/moderate/avoid) + `.name` + `.status` + lien « Carte → ». **Aucun golden-hour, aucun Veilleur, aucune fraîcheur, aucun forecast** → ne ressemble en rien à la barre HomeAZ.
- JS (l.~28-72) : lit `location.pathname.replace('/widget/embed/','')` → `slug`. Mais comme **les sous-routes n'existent pas**, `slug` vaut toujours `''` → fallback `'anse-mitan'`. Le widget ne peut PAS afficher une autre plage en statique.
- `fetch(base + '/api/copernicus/sargassum.json')` puis `levels.find(l => l.id === slug)`. Ne couvre donc que les **20 plages** présentes dans `levels[]`, pas les 136 de `beaches-list.json`.
- Mapping nom codé en dur dans le JS (20 entrées). Statut affiché : `b.status` + `'AFAI ' + b.afai.toFixed(2)` → **expose l'AFAI brut** (jargon, peu lisible client) et **aucune garde de fraîcheur** : si `erddapTimestamp` a 25 h, le widget affiche quand même le verdict comme s'il était « live ». Anti-doctrine honnêteté.
- Lien « Carte → » = `base` (racine), pas la fiche plage ni un deep-link de conversion attribuable.

### Données réelles disponibles (`public/api/copernicus/sargassum.json`)
- `source` (`erddap-live`), `updatedAt` (ISO, pipeline), `erddapTimestamp` (ISO, **vraie date du passage satellite** — c'est CELLE-CI qui détermine la fraîcheur honnête), `dataAgeMinutes`, `pipelineVersion`.
- `levels[]` (20 objets) : `{id, afai, status, confidence, score, label, color, reason, breakdown, sourceDetail}`.
- `weekly[<id>].forecast[]` : `{day, date, afai, status, confidence, type:"observation"|"tendance", regime:"calm"|"high", sources:[…]}` — **la prévision réelle**, jamais reconstruite côté widget.
- `weather.mq` / `weather.gp` : `{wind_speed, cloud_cover, uv_index, air_temperature, sst, wave_height}`.
- État vérifié au 2026-06-16 : `updatedAt` âge 0,9 h **mais** `erddapTimestamp` âge **25,5 h** → cas réel à gérer = « pipeline frais, satellite vieux » → fraîcheur honnête = « vérification en cours » (voir §Données réelles).

### Assets réutilisables identifiés
- `scripts/lib/scene-svg.cjs` (CJS, déjà utilisé par `vite.config.js` pour les heros SEO) exporte : `buildBeachScene`, `moodFromScore`, `moodFromStatus` (`"serein"|"vigilant"|…`), `SCENE_TOKENS` (palettes `phases.golden/day/dawn`, couleurs status), `buildHeroCss`, `hashSeed`, `archetypeOf`. **C'est le moteur SSR à utiliser pour rendre une mini-scène golden-hour statique par plage, sans JS, sans image IA.**
- `design/proto-map-v2.html` l.126-135 : « Le Veilleur » compact (≈40 lignes SVG, `<g id="veilleur" transform="translate… scale(.46)">`, halo `url(#phalo)`, iris doré, antenne verte) — **le mini-Veilleur exact à coller dans le widget** (serein, regarde la mer, statique au repos).
- `design/proto-map-v2.html` l.11-67 : tokens golden-hour + `.live` pill (pulse), `.tag`, `sun` breath, `prefers-reduced-motion` floor.
- `design/proto-plage-plongee.html` l.19-130 : palette `--sky/--sea/--gold/--green/--amber/--coral`, `.freshpill` (dot + libellé mono), `.cta` doré, plancher reduced-motion. Source de la fiche plage en plongée.
- `src/HomeAZ.jsx` l.65-138 : `STATUS` map (clean/mod/avoid → couleurs `--green/#E8B23A/--coral` + labels FR/EN/ES) ; `freshLabel()` (l.128-138, **garde honnête : n'affiche un chrono que si âge < 12 h, sinon « maj récente »**) ; `setMoodFromScore` (≥70 calm, ≥40 scan, <40 alert). **Réutiliser cette logique d'humeur + fraîcheur verbatim.**
- `sg-svg-scene` (skill) : moteur viewBox 800×600 slice, 1 seul rAF, `toVB` cover-math, pièges déjà payés (pivot transform, snap couleur d'humeur, ban fausse fraîcheur).

---

## Objectif (barre HomeAZ + KPI visé)

Faire du widget embeddable un **mini-HomeAZ honnête** : une carte-plage golden-hour avec Le Veilleur serein, le verdict du jour (Propre / Modéré / À éviter), la fraîcheur RÉELLE, et un CTA qui ramène sur le site avec attribution.

Double rôle B2B :
1. **Acquisition** : chaque iframe sur un site d'hôtel/loueur = un backlink + une vitrine de la marque golden-hour chez le partenaire.
2. **Conversion attribuée** : le CTA du widget ouvre l'app en deep-link `?paywall=1&utm_source=widget_<slug>` (mécanisme déjà câblé, `Sargasses_PROD.jsx` l.10966) → on mesure `sg_premium_modal_open{source:"deeplink_widget_<slug>"}` jusqu'au paiement.

KPI visés (contexte boucle) :
- **Capture / acquisition externe** (levier #1 = capture email à 0,35 %) : le widget pousse du trafic chaud (visiteur déjà sur une plage précise) vers la fiche → meilleure entrée funnel que la home froide.
- **Demande #1 = temps réel / aujourd'hui** : le widget répond directement « cette plage, aujourd'hui ».
- Ne PAS dégrader le goulot modal→CTA : le widget n'OUVRE PAS de modal, il deep-linke une intention CHAUDE (cf. l.10972-10977, le mur ne s'ouvre que sur intention chaude).

---

## Changements exacts (étape par étape)

> Trois livrables : (A) générer les sous-routes embed par plage au build, (B) refaire l'iframe en mini-HomeAZ golden-hour SSR, (C) refondre la landing partenaire en charte + tri-lingue + canonical correct. Tout est additif et flaggé.

### A. Générer `dist/widget/embed/<slug>/index.html` par plage (build)

Le widget doit être **statique** (un fichier HTML pré-rendu par plage), pour : (1) marcher sans SPA-rewrite, (2) être ultra-léger, (3) afficher une scène golden-hour SSR sans JS.

1. Dans `vite.config.js`, plugin `seo-pages`, `closeBundle()` (l.332), **après** la boucle des pages plages SEO (vers l.766+ où `beaches` est déjà construit avec `slug`, `status`, `afai`, `id`, `island`, `name`), ajouter une boucle widget :
   - Source plages = `beaches` (les 136, déjà calculées l.767-781, `slug = slugify(b.name)`).
   - Live = `_heroLive` (déjà chargé l.825-834 : `levelsBySlug`, `weeklyBySlug`, `updatedAt`) + lire en plus `erddapTimestamp` du même JSON (l'ajouter à la lecture l.827 : `_heroLive.erddapTimestamp = _lj.erddapTimestamp`).
   - Pour chaque plage : `lv = heroLv(b)` (l.848, status/score/afai réels) ; `wk = _heroWeekly[b.id] || _heroLive.weeklyBySlug[slug] || _heroLive.weeklyBySlug[b.id]` ; forecast 3 prochains jours = `wk.forecast.slice(1,4)`.
   - Émettre `mkdirSync(resolve(outDir,'widget','embed',b.slug),{recursive:true})` + `writeFileSync(.../index.html, renderWidgetEmbed(b, lv, wk, freshness, lang))`.
   - **Important build GP** : la `closeBundle` tourne 1× par build de région (`VITE_REGION`). Filtrer `beaches` sur `b.island === (isGP?'gp':'mq')` pour n'émettre que les plages de la région courante (comme le reste de la génération SEO). Les domaines absolus dans le HTML doivent suivre `domainMQ`/`domainGP` déjà définis l.857-858.

2. Créer le renderer SSR `scripts/lib/widget-embed.cjs` (nouveau, CJS comme `scene-svg.cjs`), exporté `renderWidgetEmbed(beach, lv, weekly, freshness, lang)` →
   - `require('./scene-svg.cjs')` pour `buildBeachScene`/`moodFromScore`/`moodFromStatus`/`SCENE_TOKENS` : rendre une **mini-scène golden-hour** (viewBox `0 0 360 120`, slice) = mer golden + île stylisée + **Le Veilleur compact** copié de `proto-map-v2.html` l.126-135 (statique, humeur = `moodFromStatus(lv.status)`, couleur halo/iris pilotée par status comme `HomeAZ STATUS[].col`). PRNG seedé `hashSeed(beach.id)` pour varier la scène sans la rendre fausse.
   - Verdict verbal Anton (réutiliser `.anton` + couleurs `STATUS` de HomeAZ l.65-69) : « PROPRE AUJOURD'HUI » / « MODÉRÉ AUJOURD'HUI » / « À ÉVITER AUJOURD'HUI » (FR/EN/ES via `lang`).
   - Nom de plage = `beach.name` (slug=nom, jamais re-nommer — cf. règle beaches-data-quality).
   - **Fraîcheur honnête** (port de `HomeAZ.freshLabel` l.128-138) calculée au BUILD sur `erddapTimestamp` : si âge < 12 h → `.freshpill` « il y a Nh » (copie de `proto-plage-plongee` l.88-94) ; sinon → libellé « vérification en cours » (FR) / « checking » (EN) / « verificando » (ES) et **dot ambre, pas vert**. JAMAIS de faux « live ».
   - Mini-forecast 3 jours optionnel (3 puces statut depuis `wk.forecast.slice(1,4)`) — masquable selon hauteur.
   - CTA / lien : `<a href="https://<domain>/plages/<slug>/?paywall=1&utm_source=widget_<slug>" target="_blank" rel="noopener">` → ouvre la fiche plage (deep-link `/plages/:slug` déjà câblé `Sargasses_PROD.jsx` l.10526-10535) **et** arme l'attribution paywall (l.10966). Libellé : « Voir l'état complet → » / « See full status → » / « Ver estado completo → ».
   - Badge marque discret « Sargasses · Copernicus » lien vers la home (backlink).
   - **Pas de JS data-fetch** dans la version SSR (la donnée est figée au build, rebuild 4×/j par le pipeline). Le SEUL JS toléré = un beacon d'attribution facultatif (voir A.3) et le plancher reduced-motion (le Veilleur est de toute façon statique → quasi rien).
   - Header `<meta name="robots" content="noindex, follow">` conservé. `<base target="_top">` non — on garde `target="_blank"` explicite pour casser hors de l'iframe.

3. **Attribution cross-origin** (facultatif, additif) : `collect.php` est same-origin (`public/collect.php`) → un widget hébergé chez un tiers ne peut PAS y POSTer avec session. Pour compter les impressions/clics widget : ajouter dans l'iframe un beacon GET 1×1 `new Image().src = base+'/collect.php?w=imp&s=<slug>'` au load et `&w=clk` au clic du CTA (GET léger, pas de cookie requis). **Étendre `collect.php`** pour accepter un GET `?w=imp|clk&s=<slug>` (aujourd'hui il `exit 405` sur non-POST, l.10) → brancher un compteur NDJSON minimal `sg-widget-<day>.ndjson`. Si on ne veut pas toucher le PHP dans cette itération : se contenter de l'attribution `utm_source=widget_<slug>` côté app (déjà mesurable via les events `sg_premium_modal_open`), et marquer le beacon « phase 2 ».

### B. Refonte de l'iframe (control = fichier plat actuel)

- Le `public/widget/embed/index.html` actuel reste comme **fallback** (route racine `/widget/embed/` sans slug) ET comme **control A/B** (variante plate).
- Les nouvelles routes `dist/widget/embed/<slug>/index.html` (générées en A) sont la **variante golden-hour**.
- Le choix control/variante se fait par le slug de l'URL embed : `…/embed/anse-mitan/` (legacy) vs `…/embed/plage-du-diamant/` (nouveau slug SEO). Pour ne pas casser les embeds déjà collés chez des partenaires (slugs legacy), **ajouter dans le renderer un alias** : générer AUSSI les 20 sous-routes legacy (`embed/diamant/`, `embed/anse-mitan/`…) pointant sur la même plage (mapping legacy→`beaches-list` id, dérivé du JS actuel l.~52-60 de l'embed). Slug canonique = `slugify(name)`, legacy = redirection-douce (même HTML, lien canonique vers le slug SEO).

### C. Refonte landing `public/widget/index.html` (control = page actuelle)

- Passer le fond et la typo en charte golden-hour (tokens de `proto-map-v2` l.11-15) plutôt que `#FDFCF7` clair, OU garder un fond clair éditorial mais avec l'aperçu iframe en golden-hour (l'aperçu doit montrer la VRAIE barre HomeAZ-like).
- **Corriger le canonical** : rendre la landing aussi via le build (ou patch `closeBundle` comme pour `carte-sargasses` l.758-759) pour réécrire `canonical` + `og:url` selon `domainMQ`/`domainGP`, et ajouter `<link rel="alternate" hreflang>` FR/EN/ES + générer `/en/widget/` et `/es/widget/`.
- Aperçu : pointer vers une route embed RÉELLE générée en A (`/widget/embed/plage-du-diamant/`), pas `anse-mitan` inexistant.
- Bloc « plages disponibles » : générer la liste depuis `beaches-list.json` (slugs SEO réels) au build, pas codée en dur.
- Générateur de snippet : un `<select>` de plages + zone de code `<iframe src="https://<domain>/widget/embed/<slug>/" width="100%" height="120" loading="lazy" title="Sargasses <nom> — état du jour">` + bouton copier (le bouton existe déjà l.~50).

---

## A/B

- **Flag** : `widget_az` (cohérent avec `home_az`). Deux variantes : `control` (iframe plat actuel) / `variant` (mini-HomeAZ golden-hour SSR).
- Comme l'iframe est servie statiquement à des tiers, l'A/B se joue **par génération** : on émet les DEUX (`embed/<slug>/index.html` = variant golden-hour ; `embed/<slug>/flat/index.html` = control plat). La landing propose par défaut le snippet `variant` ; un override `?widget_az=0` sur l'URL embed (`…/embed/<slug>/?widget_az=0`) fait charger un petit shim qui remplace le rendu par la barre plate (lecture `URLSearchParams`, pondération `abVariant("widget_az",["control","variant"],[1,1])` côté landing pour décider quel snippet montrer aux partenaires).
- **Override manuel** : `?widget_az=1` (force golden-hour) / `?widget_az=0` (force plat) — testable à l'œil dans le navigateur.
- **Ce que voit le control** : exactement l'iframe plate actuelle (`.dot/.name/.status/.link`), zéro régression. Si le rendu golden-hour échoue (donnée absente au build), **fallback automatique sur le control** (try/catch dans `renderWidgetEmbed`, comme HomeAZ l.739-741 bascule sur la carte si init échoue).
- Mesure : `utm_source=widget_<slug>` est commun ; ajouter `utm_content=az|flat` au lien CTA pour départager les deux rendus dans les events `sg_premium_modal_open`.

---

## Données réelles à brancher (honnêteté)

- **Status / verdict** : `lv.status` (`heroLv` l.848-855) → libellé via `HomeAZ STATUS` (l.65-69). JAMAIS de `cleanFloor` atlantique (cf. feedback_forecast_floor_ban) — on prend le status réel tel quel.
- **Score** : `lv.score` si présent (sinon ne pas inventer ; afficher seulement le verdict verbal).
- **Fraîcheur** : calculée au build sur `erddapTimestamp` (vrai passage satellite), garde `< 12 h` (port `freshLabel` HomeAZ l.128-138). Cas réel 2026-06-16 (`erddap` 25,5 h) → « vérification en cours » + dot ambre. **Ne JAMAIS afficher « en direct » si le satellite a > 12 h.**
- **Forecast** : `weekly[<id>].forecast[]` (champ réel) → 3 prochains jours (`slice(1,4)`), statut par jour. Jamais reconstruit, jamais extrapolé au-delà des jours fournis.
- **Pas d'AFAI brut** affiché au client (jargon) — remplacer le `'AFAI ' + b.afai.toFixed(2)` actuel par le verdict + (optionnel) une mention « mesure satellite ».
- **Couverture** : aujourd'hui seules 20 plages ont un `levels[]`. Pour les 116 sans live, dégrader proprement : status = `b.status` de `beaches-list.json` (référence), fraîcheur = « vérification en cours » (jamais « live »), CTA inchangé. Aucune donnée inventée.
- Aucune image IA (charte) ; toute l'imagerie = SVG `scene-svg.cjs` + Veilleur vectoriel.

---

## SEO (si page)

C'est deux régimes distincts :

- **`/widget/embed/<slug>/`** (l'iframe) : **`noindex, follow`** (déjà présent, à conserver) — c'est de la donnée incorporable, pas une page à indexer. Ne PAS l'ajouter au sitemap. Robots inchangé (pas de Disallow nécessaire car noindex).
- **`/widget/`** (landing partenaire) : **indexable**, déjà au sitemap (`vite.config.js` l.742, priority 0.5).
  - `title` : « Widget sargasses gratuit — état des plages en temps réel | Sargasses Martinique » (≤ 60 c.) ; version GP « …Guadeloupe ».
  - `meta description` : reformuler honnêtement (« données satellite Copernicus, mises à jour 4×/j ») sans sur-promesse « temps réel » si la fraîcheur peut dépasser 12 h.
  - `canonical` : `https://<domain>/widget/` **réécrit par région** (corriger le hardcode MQ actuel l.7) — patch dans `closeBundle` comme `carte-sargasses` (l.758-759) ou via template régionalisé.
  - `hreflang` : ajouter `fr` (`/widget/`), `en` (`/en/widget/`), `es` (`/es/widget/`) + `x-default`. Générer les deux variantes localisées (réutiliser le pattern EN/ES du closeBundle).
  - **Maillage interne** : lier depuis la landing vers `/carte-sargasses/`, `/previsions/`, `/a-propos/` (confiance) et la home ; et ajouter un lien discret « Widget pour votre site » dans le footer SEO de l'app (cohérent avec les hubs). Ne pas créer de lien depuis chaque page plage (bruit).
  - **Ne pas casser l'indexation** : `/widget/` existe déjà → garder l'URL, ne pas la renommer ni la rediriger. Vérifier `curl` 200 avant deploy (cf. feedback_validate_hrefs).
  - **slug = nom** : les slugs embed dérivent de `slugify(beach.name)` (même fonction que les pages SEO `/plages/:slug`, `vite.config.js` l.24) → cohérence totale ; ne JAMAIS renommer une plage.

---

## Vérification

> Le preview de l'app timeout → serveur local + Playwright (cf. skill `sg-svg-scene`). Ports libres conventionnels : 8790-8799.

```bash
# 0. Lint du renderer CJS (pas de top-level await, exporte bien)
node -e "const m=require('./scripts/lib/widget-embed.cjs'); console.log(typeof m.renderWidgetEmbed)"  # → function

# 1. Smoke du rendu SSR hors build (une plage live + une plage stale + une sans live)
node -e "const {renderWidgetEmbed}=require('./scripts/lib/widget-embed.cjs'); \
const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json','utf8')); \
const lv=d.levels.find(l=>l.id==='diamant'); const wk=d.weekly['diamant']; \
const html=renderWidgetEmbed({id:'mqXXX',name:'Plage du Diamant',slug:'plage-du-diamant',island:'mq',status:lv.status,afai:lv.afai},lv,wk,{erddapTimestamp:d.erddapTimestamp},'fr'); \
require('fs').writeFileSync('/tmp/w.html',html); console.log('bytes:',html.length, '| has Veilleur:', html.includes('veilleur'), '| no fake live:', !/EN DIRECT/.test(html) || (Date.now()-new Date(d.erddapTimestamp))/3.6e6<12)"

# 2. Build complet MQ (génère dist/widget/embed/<slug>/) — ne doit pas régresser
npm run build 2>&1 | tail -20
node -e "const fs=require('fs'); console.log('embed dirs:', fs.readdirSync('dist/widget/embed').length); console.log('diamant exists:', fs.existsSync('dist/widget/embed/plage-du-diamant/index.html')); console.log('legacy alias:', fs.existsSync('dist/widget/embed/diamant/index.html'))"

# 2b. Build GP (vérifie canonical/domaine régionalisés + plages GP only)
VITE_REGION=gp npm run build 2>&1 | tail -10
node -e "const h=require('fs').readFileSync('dist/widget/index.html','utf8'); console.log('GP canonical ok:', h.includes('sargasses-guadeloupe.com/widget/'))"

# 3. esbuild sanity sur le shim A/B éventuel (si un .js est ajouté à l'iframe)
npx esbuild public/widget/embed/_shim.js --bundle --minify --outfile=/dev/null 2>&1 | tail -5

# 4. Serveur local + Playwright : rendu réel de l'iframe + control + override
python -m http.server 8790 --directory dist >/dev/null 2>&1 &   # ou: npx serve dist -l 8790
#   Playwright (mcp__plugin_playwright_playwright__browser_navigate) :
#   - http://localhost:8790/widget/embed/plage-du-diamant/        → screenshot : golden-hour + Veilleur + verdict + fraîcheur honnête
#   - http://localhost:8790/widget/embed/plage-du-diamant/?widget_az=0 → barre plate (control)
#   - http://localhost:8790/widget/                               → landing, aperçu iframe non-404, snippet copiable
#   - reduced-motion : browser_navigate avec prefers-reduced-motion=reduce → Veilleur figé, tout lisible
#   - console : 0 erreur ; vérifier que le lien CTA contient ?paywall=1&utm_source=widget_plage-du-diamant

# 5. Liens HONNÊTES (anti-301/404) — feedback_validate_hrefs
node -e "const fs=require('fs'); const h=fs.readFileSync('dist/widget/embed/plage-du-diamant/index.html','utf8'); const m=h.match(/href=\"([^\"]+plages\/[^\"]+)\"/); console.log('CTA href:', m&&m[1])"
# puis curl -I sur le href en prod après deploy (doit être 200, pas 301/404)
```

Critères PASS : (a) variant golden-hour ressemble à la barre HomeAZ (Veilleur serein, palette golden, verdict Anton) ; (b) fraîcheur jamais menteuse (cas erddap > 12 h → « vérification en cours » + dot ambre) ; (c) control plat intact sous `?widget_az=0` ; (d) CTA deep-linke `/plages/<slug>/?paywall=1&utm_source=widget_<slug>` ; (e) build MQ et GP sans erreur, canonical régionalisé ; (f) `noindex` conservé sur l'embed, `/widget/` toujours indexable et au sitemap.

---

## Garde-fous spécifiques

- **Cross-origin = statique pur** : l'iframe vit chez des tiers → pas de dépendance à un fetch same-origin pour la donnée (la donnée est figée au build, re-générée 4×/j par le pipeline). Ne PAS faire dépendre l'embed de `collect.php` POST (same-origin) ni de `/design/mq-outline.json` (qui n'est même pas copié dans `public/` → 404 cross-site). Le Veilleur/scène = SVG inline auto-suffisant.
- **Honnêteté de fraîcheur = non négociable** : la garde `< 12 h` se calcule sur `erddapTimestamp`, pas `updatedAt` (le pipeline peut être frais alors que le satellite est vieux — cas réel 2026-06-16). Jamais « en direct » au-delà du seuil. C'est un piège déjà documenté (sg-svg-scene : « ban fausse fraîcheur »).
- **Doctrine calme** : au repos le widget est un TABLEAU, pas un aquarium — Le Veilleur statique, aucune anim `infinite` (sauf, à la rigueur, le pulse de la freshpill, désactivé en reduced-motion). Plancher `prefers-reduced-motion:reduce` obligatoire (port du floor `proto-map-v2` l.67 / HomeAZ l.562-576).
- **ZÉRO image IA / vidéo** : toute l'imagerie est SVG vectoriel (`scene-svg.cjs` + Veilleur du proto). Aucune balise `<img>` raster décorative.
- **Le Veilleur RASSURE ≠ surveille** : humeur sereine par défaut, regard vers la mer ; ne pas le rendre « œil flippant » (piège v2 cassé, feedback_dont_show_wip). En statut `avoid`, humeur = vigilant calme, pas alarmiste agressif.
- **Conversion = openPremium UNIQUE** : le widget ne réimplémente aucun checkout. Il deep-linke `?paywall=1&utm_source=…` → l'app appelle `openPremium("deeplink_widget_<slug>")` (l.10966). `stripe-config` jamais touché.
- **Tracking `sg_*` identiques** : l'attribution passe par `utm_source`/`utm_content` lus par l'app, pas de nouvel event renommé. Beacon widget = phase 2, optionnel, et n'altère pas les events existants.
- **slug = nom = SEO** : slugs embed = `slugify(beach.name)`, identiques aux pages `/plages/:slug`. Conserver les 20 alias legacy pour ne pas casser les embeds déjà déployés ; ne JAMAIS renommer une plage (slug SEO).
- **Aucune page sans 301 / pas de route morte** : ne pas livrer la landing tant que l'aperçu pointe une route embed réellement générée (le bug actuel `anse-mitan` 404). Vérifier `curl` 200 avant deploy.
- **Additif & réversible** : tout le code widget est isolé (`scripts/lib/widget-embed.cjs` + une boucle dans `closeBundle` + fichiers `public/widget/*`). Retirer la boucle = retour à l'état actuel. Control jamais modifié.
