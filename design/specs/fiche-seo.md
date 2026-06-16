# Fiches plages SEO (shell + contenu) — spec d'exécution

> Surface : les **136 pages `/plages/<slug>/`** générées au build. Shell HTML (title/meta/canonical/hreflang/JSON-LD/sitemap) **+ contenu** (le noscript golden-hour + son `<article>`). On NE traite PAS ici le composant React `BeachSheet` rendu après hydratation SPA (lane séparée `pw_beach_dive`) — mais on prépare le terrain pour qu'il consomme la même donnée injectée.
>
> Lecture obligatoire avant de coder : `design/REFONTE-EXECUTION.md` §3 (vérif), §4 (port A/B), §6 (interdits) + skills `sg-design-system` (la barre) et `sg-svg-scene` (le moteur). Source de vérité fiche = `design/proto-plage-plongee.html` (PRÉFÉRÉE FONDATEUR — NE JAMAIS SUPPRIMER).

---

## État actuel

### Génération (tout dans `vite.config.js`, plugin `seo-pages`, hook `closeBundle`)
- **Boucle principale** : `for (const b of beaches)` à `vite.config.js:1075-1294`. Pour chaque plage : `mkdirSync(plages/<slug>)` puis écriture d'un `index.html` dérivé de `htmlSubpage` (l. 376 — le shell `dist/index.html` privé de son `<noscript>` racine).
- **Données chargées en tête de `closeBundle`** :
  - `_beachImages` ← `public/data/beaches-images.json` (l. 784-785) — keyé par `id` (`gp001`…), partiel (~quelques dizaines).
  - `_enrichments` ← `scripts/automation/data/enrichments.json` (l. 787-788) — keyé par **slug**, 136 entrées, champs `{faq, noscript, metaTitle, metaDesc}`. ⚠️ `metaTitle`/`metaDesc` sont `null` dans la prod actuelle ; seul `noscript` est rempli (prose AFAI/Sentinel-3, ~plusieurs Ko).
  - `_weather` ← `public/api/weather/beaches-weather.json` → `.beaches` (l. 793-797) — keyé par `id`, champs `{waveHeight, wavePeriod, windSpeed, windDir, sst, airTemp, uvMax, condition}`.
  - `_heroLib` ← `require('./scripts/lib/scene-svg.cjs')` (l. 823-824) — exporte `buildHeroSvg`, `buildHeroCss`, `moodFromScore/Status`, `archetypeOf`, `SCENE_TOKENS`…
  - `_heroLive` (levels/weekly LIVE, l. ~826-834) ← lecture du `public/api/copernicus/sargassum.json` au build. **Clé = slug** (`grande-anse`), pas `id` — d'où `_heroLive.levelsBySlug` / `weeklyBySlug`.
  - `_heroWeekly` = `buildWeeklyBatch(SARGASSUM_REF)` (l. 836-837) — forecast **déterministe de secours** keyé par `id`.
- **Shell émis par plage** (l. 1154-1174) : `<title>`, `<meta description>`, `<link canonical>`, hreflang `fr`+`x-default` self (en/es **retirés**, l. 1162-1164), og:title/desc/url/image, twitter, puis 3 JSON-LD (`Beach`, `BreadcrumbList`, `FAQPage`) injectés avant `</head>` (les schémas homepage sont strippés l. 1173).
- **Contenu (noscript)** : deux chemins (l. 1249-1261) —
  - si `_enrichments[slug]` existe → on garde son `<article>`, on préfixe l'image et on suffixe `extraSections + zoneLine + networkLine`.
  - sinon → noscript fabriqué inline (h1 + image + prose + « Plages à proximité » + nav).
- **HERO golden-hour SSR** (l. 1262-1288) : si `_heroLib` chargé, on préfixe le noscript par `heroCssOnce + <div class="sg-page"><div class="sg-hero">{buildHeroSvg} + bande verdict</div>` puis on referme `</div>` avant `</noscript>`. La bande verdict affiche : `h1` nom, `Sargasses aujourd'hui : {statut}{score/100}`, `Prévision 7j — {ligne}`, badge `LIVE · satellite HH:MM UTC`.
- **Sitemap** : une entrée par plage `priority 0.7 changefreq daily` (l. 1291-1293) → `sitemapMQBeaches` / `sitemapGPBeaches`.
- **Hubs zones** `/plages/<zone>/` (l. 1370-1412) et index `/plages/` (l. 1295-1364) générés dans la même passe (hors scope ici, mais le maillage remontant `zoneLine` l. 1247-1248 en dépend).
- **GP mirror** : `toGpMirror()` (l. 383+) re-ancre domaine/GA/Clarity/og pour la copie Guadeloupe ; pour les fiches, le swap texte Martinique→Guadeloupe est fait par `prepare-ftp.cjs` côté GP (la boucle ne stashe PAS chaque fiche en `_gp/`, contrairement aux hubs).

### Ce qui MARCHE
- 136 pages déterministes, JSON-LD valide (Beach + Breadcrumb + FAQ contextualisé par statut/équipement/côte, l. 1128-1153).
- Hero SVG golden-hour SSR déjà branché (page JS-off n'est plus du Times-New-Roman nu).
- Meta description riche, status-aware, avec overrides manuels pour ~30 plages top (`BEACH_DESC_OVERRIDES` l. 861-1042) + ligne météo du jour (l. 1098-1103).
- Géographie d'exposition honnête (côte Caraïbe/sous-le-vent = protégée, Atlantique = exposée ; respecte `feedback_beach_geography`).

### Ce qui MANQUE / dérive (les cibles de cette spec)
1. **Le shell ne ressemble PAS à la fiche scroll-plongée approuvée.** Le proto `proto-plage-plongee.html` (1690 l., 6 stages scroll-driven, scrub forecast, plan-B halos, badge H2S gradué, anneau régime+fiabilité, Veilleur) n'est porté NULLE PART. Aujourd'hui : un hero statique + un `<article>` de prose. La barre HomeAZ n'est pas atteinte sur ce qu'un humain voit JS-on.
2. **`metaTitle`/`metaDesc` data-driven sont `null`** → on retombe toujours sur le fallback statique `{name} — Sargasses {island} aujourd'hui` (l. 1084). Le hook data-driven (« Plage X : 86 % propres sur 7 j ») n'est jamais alimenté.
3. **Hero verdict potentiellement en désaccord avec la prose.** `heroLv(b)` lit le live (`levelsBySlug[slug]`), mais le `<article>`/FAQ/description lisent `b.status` (statut figé de `beaches-list.json`, souvent stale). Risque d'incohérence visible (hero « propre », FAQ « éviter »).
4. **Freshness pas garantie honnête.** Le badge LIVE affiche l'heure satellite mais ne dégrade pas en « vérification en cours » si `dataAgeMinutes > 720` (>12 h) — viole la règle data honnête de la barre.
5. **Pas de variante A/B sur la fiche SEO.** Tout est mono-version ; impossible de mesurer un nouveau shell sans casser le control.
6. **Maillage interne pauvre côté JS-off** : nearby = 4 liens commune/île ; pas de plan-B « plages propres MAINTENANT » trié par score live (le levier conversion #1 sur une page d'alerte).

---

## Objectif (barre HomeAZ + KPI visé)

Porter la fiche `/plages/<slug>/` à la **barre HomeAZ** : golden-hour, Le Veilleur serein (rassure ≠ surveille), doctrine calme (repos = tableau, `prefers-reduced-motion` = plancher dur), zéro image IA, donnée honnête, conversion via `openPremium(source)` unique.

**KPI ciblés** (la fiche est la 1re page que 100 % du trafic Google voit) :
- **Goulot modal→CTA 2 %** : un scroll-plongée qui PROUVE la mesure (satellite→AFAI→score→prévision→fiabilité par régime) avant de demander le premium, avec `openPremium("forecast_cta"|"footer")` contextualisé plage+verdict.
- **Capture email 0,35 % (levier #1)** : le bras variant expose la demo-gate au stage prévision (déférée à la spec capture, mais le hook `openPremium("forecast_cta")` est le point d'accroche prévu).
- **Demande #1 = temps réel / aujourd'hui** : verdict live + freshness honnête en haut de page, immédiat.
- **SEO inchangé ou meilleur** : title/meta data-driven, canonical/hreflang intacts, indexation non régressée (MQ ~3/30, GP ~2/30 — ne pas empirer).

---

## Changements exacts (étape par étape)

> Principe : ADDITIF + A/B. Le control (shell+noscript actuels) reste **100 % intact**. Le variant `fiche_dive` injecte un 2e markup/CSS dérivé du proto, monté en SSR (page statique) — pas de Shadow DOM ici car la fiche SEO N'EST PAS un composant React au moment du build ; c'est du HTML émis. Le moteur scroll (rAF) du proto est inliné comme `<script>` dans la page (les fiches sont déjà JS, l'app s'hydrate ensuite et masque/remplace selon `pw_beach_dive`).

### Étape 1 — Extracteur proto → assets fiche (mirror exact de `build-homeaz.cjs`)
Créer `scripts/build-fiche-dive.cjs` (copie de la structure de `scripts/build-homeaz.cjs`) :
- SRC = `design/proto-plage-plongee.html`, OUT = `scripts/lib/fiche-dive-assets.cjs` (CJS, car lu par `vite.config.js` via `_require`).
- Extraire **CSS** (entre 1er `<style>` et `</style>`), **MARKUP** (entre `<body>` et `<script>`), **ENGINE** (le `<script>`…`</script>`).
- Adaptations markup : retirer `<h1 class="sr-only">` (l. 316), retirer `<div id="trackToast">` (l. 680, debug du proto).
- Adaptations engine : remplacer la `function track(...)` du proto (toast debug, l. 860-866) par un appel au `track` global de la page (`window.__sgTrack` posé par le shell, voir étape 4) ; remplacer `function openPremium(source)` (l. 868) pour qu'il **redirige réellement** vers le funnel : `location.href = "/?paywall=1&utm_source="+encodeURIComponent("fiche_"+source)` (le shell SPA lit `?paywall=1` → `openPremium`, l. 10966). `onShowMap()` (l. 870) → `location.href="/carte-sargasses/"`. Les `track("sg_nav"…)` zone/breadcrumb → vrais `location.href`.
- Garde-fous d'ancres (comme build-homeaz l. 69) : exiger `id="scroller"`, `id="viewport"`, `id="cam"`, `id="scene"`, `id="gPose"`, `id="bc0"`, `id="bc4"`, `id="bc5"`, `id="nearbyHalos"`, `id="forecast"` (vérifier les vrais ids du proto), et `!markup.includes("trackToast")`.
- Exporter `module.exports = { FICHE_DIVE_CSS, FICHE_DIVE_MARKUP, FICHE_DIVE_ENGINE }`.
- Relancer manuellement après toute modif du proto : `node scripts/build-fiche-dive.cjs`.

### Étape 2 — Brancher l'A/B dans la boucle de `vite.config.js`
Dans `closeBundle`, charger les assets une fois (à côté de `_heroLib`, l. ~823) :
```js
let _ficheDive = null
try { _ficheDive = _require('./scripts/lib/fiche-dive-assets.cjs') } catch (e) { console.warn('   → fiche-dive non chargé:', e.message) }
```
Dans la boucle plage (l. 1075+), **après** avoir construit `beachHtml` et `noscriptHero` (control, intacts), construire le markup variant et écrire la page selon un **split déterministe par slug** (le build est statique → on ne peut pas faire d'A/B runtime côté serveur ; on émet le variant pour ~50 % des slugs de façon déterministe ET on laisse un override runtime côté SPA, voir A/B ci-dessous). Décision concrète : **émettre le shell variant pour 100 % des fiches mais le rendre activable/désactivable côté client par flag** (le markup variant et le control coexistent dans la page, un `<script>` choisit lequel afficher au boot selon `abVariant`/override). C'est le seul moyen de garder un A/B mesurable sans 272 builds.
  - Le control reste le `finalHtml` actuel (l. 1289).
  - Insérer, juste avant `</body>`, un conteneur variant masqué par défaut : `<div id="sg-fiche-dive" hidden>{FICHE_DIVE_MARKUP}</div>` + `<style id="sg-fiche-dive-css">{FICHE_DIVE_CSS}</style>` (le CSS du proto est scopé sous `#sg-fiche-dive` au moment de l'extraction — préfixer chaque sélecteur dans `build-fiche-dive.cjs`, OU envelopper dans `@scope (#sg-fiche-dive)` si support OK ; sinon préfixe brut). Voir Garde-fous (collision CSS).
  - Injecter la **donnée réelle** via un `<script>` SSR : `window.__SG_BEACH__ = {beach, score, forecast, nearby, reliability, updatedAt}` (le proto lit exactement cet objet, l. 729-738). Construire ces champs depuis les sources réelles (voir « Données réelles à brancher »).
  - Injecter l'ENGINE + le sélecteur A/B à la fin :
    ```html
    <script>
    (function(){
      function pick(){try{var q=location.search;
        if(/[?&]fichedive=1/.test(q))return true;
        if(/[?&]fichedive=0/.test(q))return false;
        if(matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)return false; // plancher dur: control statique
        var k='ab_fiche_dive',v=localStorage.getItem(k);
        if(!v){v=Math.random()<0.5?'dive':'control';localStorage.setItem(k,v);}
        return v==='dive';
      }catch(e){return false}}
      if(pick()){var d=document.getElementById('sg-fiche-dive');if(d){d.hidden=false;/* …puis charger l'engine */}}
    })();
    </script>
    <script>{FICHE_DIVE_ENGINE}</script>
    ```
    L'engine ne doit démarrer son rAF QUE si `#sg-fiche-dive` n'est pas `hidden` (early-return sinon). REPRENDRE le pattern `sg-svg-scene` : un seul rAF, `toVB` cover-math, early-return si `REDUCE`.

### Étape 3 — Réutilisations concrètes (ne rien réinventer)
- **`proto-plage-plongee.html`** : markup + CSS + engine VERBATIM (via l'extracteur). C'est la fiche. Ses 6 stages (`bc0`…`bc5`), son scrub forecast (`applyForecastScrub`, l. 1291), ses halos plan-B (`buildNearbyHalos` l. 976, `buildPlanB` l. 1069), son badge H2S (`#h2sAnchor`/`#h2sMark`), son anneau régime+fiabilité (stage 2C), son Veilleur (`#gPose`/`#gLife`/`#gBody`, moods `serein/vigilant/alerte/scan`).
- **`scene-svg.cjs`** : le hero SSR control reste tel quel (`buildHeroSvg`, `buildHeroCss`). Le proto a SA propre géométrie de scène (cohérente avec celle-ci) — ne pas mélanger ; le proto est self-contained.
- **`HomeAZ` / `home-az-assets.js`** : modèle de l'extracteur (étape 1 = copie de `build-homeaz.cjs`). Mêmes garde-fous d'ancres, même bannière « GÉNÉRÉ — NE PAS ÉDITER ».
- **`sg-svg-scene`** (skill) : moteur rAF unique, `toVB`, pièges payés (pivot transform, géométrie sticky/void noir, snap couleur d'humeur, ban fausse fraîcheur). À relire avant de débugger l'engine.
- **`COAST_ZONES`** (`scripts/lib/coast-zones.cjs`) : déjà importé (l. 1068) ; alimente `zoneLine`. Le plan-B du proto (`buildPlanB`) doit prendre les nearby **dans la même zone d'abord** pour rester géographiquement honnête.

### Étape 4 — Title/meta data-driven (corrige le `null`)
Alimenter `metaTitle`/`metaDesc` depuis la donnée réelle au lieu de `null`. Dans la boucle (avant l. 1084), calculer un titre data-driven HONNÊTE depuis le forecast live :
- `cleanDays7` = nb de jours `status==='clean'` sur les 7 du `weeklyBySlug[slug]?.forecast` (fallback `_heroWeekly[id]`).
- `metaTitle` variant data-driven : `${b.name} : ${statutAuj} aujourd'hui — sargasses ${island}` (ex. « Plage du Diamant : propre aujourd'hui — sargasses Martinique »). NE PAS claim « 86 % propres » sauf si réellement calculé sur données ≥ N jours. Garder le fallback statique si forecast absent.
- Brancher : `const beachTitle = _enrichments[b.slug]?.metaTitle || dataTitle || \`${b.name} — Sargasses ${island} aujourd'hui\`` (l. 1084).
- **Garder le control de title A/B-able** : le control statique reste la version actuelle ; le data-driven n'est appliqué que si on décide de le tester séparément (flag `fiche_title`, optionnel — peut être livré directement car le title est SEO, pas conversion ; mais alors mesurer l'impression/CTR GSC avant/après, pas un A/B onsite).

### Étape 5 — Cohérence hero ↔ contenu
Faire lire `b.status`/score au hero ET au contenu depuis la **même** source live. Aujourd'hui `heroLv(b)` lit le live mais `condBaignade`/FAQ/desc lisent `b.status`. Introduire en tête de boucle :
```js
const lvLive = _heroLive.levelsBySlug[slugify(b.name)] || _heroLive.levelsBySlug[b.id] || null
const liveStatus = (lvLive && lvLive.status) || b.status || 'clean'
```
et remplacer les usages de `b.status` dans desc/FAQ/condBaignade par `liveStatus` (control inclus — c'est un fix d'honnêteté, pas un test ; mais le faire prudemment : si `_heroLive` absent au build, retomber sur `b.status`). Le `window.__SG_BEACH__.beach.status` du variant = `liveStatus` aussi.

### Étape 6 — Freshness honnête (badge LIVE)
Dans le hero verdict (l. 1273-1274) ET dans `window.__SG_BEACH__.updatedAt` : si `_heroLive.dataAgeMinutes > 720` (ou `updatedAt` absent), remplacer « LIVE · satellite HH:MM UTC » par « vérification en cours » (pas de fausse fraîcheur — `sg-svg-scene` ban + barre data honnête). Calculer l'âge depuis `public/api/copernicus/sargassum.json` `dataAgeMinutes` (déjà présent, =1473 au moment de l'audit → dégrade correctement).

---

## A/B

- **Flag : `fiche_dive`** (split client 50/50, persisté `localStorage['ab_fiche_dive']`).
- **Override URL** : `?fichedive=1` force le variant scroll-plongée, `?fichedive=0` force le control. (Cohérent avec la convention `?home_az=1/0`, `?planb=1/0` du repo.)
- **Plancher reduced-motion** : `prefers-reduced-motion:reduce` ⇒ TOUJOURS control (hero statique + article), jamais le scroll animé. C'est un plancher DUR (interdit §6).
- **Ce que voit le control** : exactement la page actuelle — `finalHtml` (hero SSR golden-hour statique + `<article>` prose + nearby + nav). Le conteneur `#sg-fiche-dive` reste `hidden`, son engine ne démarre pas (early-return). Aucun octet du control n'est modifié à part les fix d'honnêteté (étapes 5-6) qui s'appliquent aux deux bras.
- **Tracking** : le variant émet les events `sg_*` à l'identique du proto — `sg_premium_modal_open {source, beach}`, `sg_cta {src}`, `sg_scene_tap {el}`, `sg_nav {to}` — via le `track` global de la page. La conversion finale passe par `?paywall=1` → `openPremium` du SPA (l. 10966), donc `sg_premium_modal_open` est aussi émis côté SPA : dé-dupliquer côté analytics par session si besoin (ne PAS inventer un nouvel event sinon récidive `funnel_tracking_gap`).
- **Mesure** : `node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script. Comparer modal→CTA et capture email entre `ab_fiche_dive=dive` vs `control`.

---

## Données réelles à brancher (honnêteté)

`window.__SG_BEACH__` (objet lu par le proto, l. 729-738). Toutes sources réelles, zéro invention :

| Champ proto | Source réelle | Honnêteté |
|---|---|---|
| `beach` | `beaches-list.json` (id, name, commune, lat, lng, drive) + `status`=`liveStatus` (étape 5) | géo réelle ; status = live, pas le JSON figé |
| `score` | `lvLive.score`/`label`/`breakdown`/`reason` depuis `sargassum.json` `levels[slug]` (champs `score,label,reason,breakdown` confirmés présents) | si live absent → masquer le score (pas de score inventé) |
| `forecast` | `weeklyBySlug[slug]?.forecast` (`day,date,afai,status,confidence,type,regime,sources` — shape confirmée) ; fallback `_heroWeekly[id]` (déterministe) | `type`/`confidence` décroissants = horizon honnête ; ne jamais réécrire un statut clean→avoid floor (ban `cleanFloor` atlantique) |
| `nearby` | plages de la **même zone** (`COAST_ZONES`) puis même commune/île, triées par `score` live desc, statut `clean` d'abord ; 3 max | « plages propres maintenant » = vrai tri live, pas hardcodé |
| `reliability` | `backtest-results.json` → `byRegime` : `calm.hit/calm.n` et (si présent) `high`/`peak` ; `sample` = `n`. Au moment de l'audit : calm n=3060 → ~78 % | publier le hit-rate PAR RÉGIME (jamais le global — instruction `project_reliability_badge`) |
| `updatedAt` | `sargassum.json` `updatedAt` ; si `dataAgeMinutes>720` → null ⇒ badge « vérification en cours » | pas de fausse fraîcheur |

- Le `breakdown` (sargassum/wave/wind/sst/cloud/uv/tide) du stage 2B vient de `lvLive.breakdown` (présent) — barres réelles, pas mock.
- Le `regime` du forecast pilote l'anneau du stage 2C et la teinte au scrub (UNIQUEMENT `forecast[].status/regime`, jamais un floor — interdit §6).
- Météo du jour (vagues/vent/UV/SST) pour le stage 2 : `_weather[b.id]` (déjà chargé, l. 793).

---

## SEO (page)

- **`<title>`** : data-driven honnête (étape 4) `{name} : {statut} aujourd'hui — sargasses {island}` ; fallback statique conservé. ≤ ~60 car.
- **`<meta description>`** : inchangée (la chaîne riche actuelle l. 1093-1103 + override `BEACH_DESC_OVERRIDES` + ligne météo) — déjà bonne. Juste lire `liveStatus` au lieu de `b.status` pour cohérence.
- **`<link rel="canonical">`** : `https://{domain}/plages/{slug}/` (l. 1157) — INCHANGÉ. `slug = slugify(name)` = nom = SEO (interdit de renommer).
- **hreflang** : `fr` self + `x-default` self ; en/es retirés (l. 1161-1164) — INCHANGÉ (pas de variante par langue par plage). Ne PAS ré-ajouter de tags en/es pointant la homepage (cluster cassé).
- **JSON-LD** : `Beach` + `BreadcrumbList` + `FAQPage` (l. 1111-1153) — INCHANGÉS. Le variant scroll-plongée ne touche PAS le `<head>` ni les schémas ; il vit dans `#sg-fiche-dive` (body). `aggregateRating` reste dérivé du statut.
- **Maillage interne** : conserver `zoneLine` (remonte vers `/plages/<zone>/`, l. 1248), `networkLine` (réseau USD, l. 1244 — sans le mot « Martinique »), nearby (commune/île). Le plan-B du variant pointe `/plages/<slug>/` réels (jamais de phantom href — bug `seo-link-graph`).
- **Ne pas casser l'indexation** : le contenu indexable reste le `<noscript>` (control) — Google lit le noscript, pas le `#sg-fiche-dive` hidden (qui est du body visible JS-on). Donc **le noscript control DOIT rester présent et complet dans les DEUX bras**. Le variant n'est qu'une couche visuelle JS-on par-dessus ; il ne remplace JAMAIS le noscript. Vérifier que `#sg-fiche-dive` n'aspire pas le contenu SEO.
- **Sitemap** : entrée par plage inchangée (l. 1291-1293). Ne pas dé-référencer.
- **GP** : le swap Martinique→Guadeloupe sur les fiches reste géré par `prepare-ftp.cjs`. Vérifier que le markup/CSS/engine du variant ne contiennent **aucune** chaîne « Martinique » hardcodée qui casserait le swap (le proto utilise `DATA.beach` → OK, mais auditer le CSS/labels).

---

## Vérification (obligatoire avant tout ship — §3 du runbook)

```bash
# 0. extraire les assets fiche depuis le proto
node scripts/build-fiche-dive.cjs          # doit logger "ancres OK"

# 1. proto seul (sanity du markup/engine avant intégration)
python -m http.server 8790 --bind 127.0.0.1   # background
#   Playwright (script .cjs DANS le repo) :
#   navigate http://127.0.0.1:8790/design/proto-plage-plongee.html
#   waitForTimeout(1200) ; capter pageerror + console.error
#   screenshot stage 0 ; scroll par innerHeight*1.1 ×5 ; screenshot chaque stage
#   Read les png → JUGER soi-même (barre = HomeAZ). Si moche/illisible → corriger AVANT.

# 2. build complet (intégration réelle des 136 fiches)
npm run build          # attendre "built in" ; vérifier "136" pages + 0 erreur

# 3. fiche générée, control ET variant
python -m http.server 8790 --bind 127.0.0.1   # sert dist/
#   Playwright :
#   /plages/plage-du-diamant/?fichedive=0  → control (hero statique + article) screenshot
#   /plages/plage-du-diamant/?fichedive=1  → variant scroll-plongée : scroll 6 stages, screenshots
#   /plages/plage-du-diamant/  (avec emulateMedia reduced-motion) → DOIT rester control
#   vérifier : 0 pageerror, le noscript control présent dans le HTML (view-source),
#   window.__SG_BEACH__ peuplé (beach/score/forecast/nearby/reliability/updatedAt),
#   badge freshness = heure réelle (ou "vérification en cours" si stale),
#   click CTA stage 3/5 → navigation /?paywall=1&utm_source=fiche_* (track sg_premium_modal_open)

# 4. honnêteté données
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));console.log('age(min):',d.dataAgeMinutes,'→',d.dataAgeMinutes>720?'STALE→vérif en cours':'LIVE')"

# 5. liens (jamais shipper un href non vérifié — feedback_validate_hrefs)
#   grep les /plages/<slug>/ émis par le plan-B variant et vérifier que chaque slug existe dans beaches-list
```
**Syntaxe** : pas de JSX ici (génération HTML pure dans vite.config.js + CJS assets) → pas d'esbuild JSX check ; mais `node -c` / `node scripts/build-fiche-dive.cjs` doit passer sans throw.

---

## Garde-fous spécifiques

- **NE JAMAIS supprimer `design/proto-plage-plongee.html`** (préférée fondateur ; déjà purgée par erreur une fois). En doute → garder.
- **Le noscript control reste intact et complet dans les deux bras** — c'est le contenu indexé. Le variant `#sg-fiche-dive` est une couche JS-on, jamais un remplacement SEO.
- **Collision CSS** : le CSS du proto utilise des classes génériques (`.cta`, `.scene`, `.beatcopy`, `.cam`…). Sur une page partagée avec le shell SPA, scoper **tout** sous `#sg-fiche-dive` (préfixe à l'extraction dans `build-fiche-dive.cjs`, OU `@scope`). Vérifier qu'aucune règle ne fuit sur l'app hydratée.
- **Un seul rAF** : l'engine ne démarre QUE si le variant est actif ET `!prefers-reduced-motion` (early-return avant rAF). Sinon l'app preview timeout / batterie. (Pièges payés `sg-svg-scene`.)
- **Le Veilleur = UN satellite, rassure ≠ surveille** : ne jamais le faire fixer l'utilisateur (œil mi-clos serein, pas d'œil-HAL). Le proto respecte déjà ça — ne pas régresser à l'extraction.
- **Doctrine calme** : au repos (statut clean, pas d'interaction) = tableau. Pas d'aquarium animé en boucle. La vie vient du scroll/clic.
- **Conversion = `openPremium(source)` UNIQUE** via `?paywall=1` → SPA. Ne pas créer un 2e chemin de paiement. `stripe-config.php` JAMAIS touché.
- **Tracking** : events `sg_*` à l'identique. Ne pas inventer de nouvel event (récidive `funnel_tracking_gap`).
- **Données honnêtes** : score masqué si live absent ; freshness dégradée si >12 h ; jamais de `cleanFloor` atlantique (re-teinte au scrub branchée UNIQUEMENT sur `forecast[].status/regime`) ; fiabilité PAR RÉGIME, jamais le global %.
- **Slug = nom = SEO** : aucune page sans 301, jamais renommer une plage. Canonical/hreflang/JSON-LD du head INCHANGÉS.
- **GP swap** : zéro chaîne « Martinique » hardcodée dans le markup/CSS/engine du variant (casserait `prepare-ftp.cjs`).
- **Shabbat ven 18h→sam 19h** : ne RIEN déployer.
- **Pas d'agent-slop en prod** : vérifier chaque stage au navigateur, juger soi-même contre la barre HomeAZ, refaire à la main si ça ne passe pas — AVANT le port.
