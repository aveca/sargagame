# /previsions/ (prévisions 7 j) — spec d'exécution

> Surface : page SEO `/previsions/` (FR uniquement aujourd'hui ; MQ + GP) + composant `ForecastChart`.
> Cadre : `design/REFONTE-EXECUTION.md` + tête de `design/REFONTE-MASTER.md`. Barre = `src/HomeAZ.jsx`. Additif + A/B + réversible + vérifié navigateur. Control 100 % intact. Conversion = `openPremium(source)` UNIQUE. Tracking `sg_*` à l'identique. Zéro image IA. Data honnête.

---

## État actuel

### Le générateur (`vite.config.js`)
- Plugin `seo-pages` (l.330), `closeBundle()`. `/previsions/` est UNE entrée du tableau `pages` (l.401) :
  ```js
  { path: 'previsions', enPath: null, title: 'Prévisions sargasses Martinique 7 jours (2026)', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine. Courants, vent, satellite.' }
  ```
- La boucle l.495-560 copie `dist/index.html` (shell SPA, **noscript racine strippé** l.376 `htmlSubpage`) dans `dist/previsions/index.html` en remplaçant title/desc/canonical/hreflang/og (l.502-513). Variante GP en miroir → `dist/_gp/previsions/` (l.539-559), avec swap visible `Martinique`→`Guadeloupe` (titre/og/H1) (l.554+).
- **MANQUE n°1 — pas de noscript éditorial.** `editorialContent` (l.429) **n'a PAS de clé `'previsions'`**. La page ship donc SANS contenu HTML crawlable propre (juste le shell SPA + meta). Les pages voisines (`saison-*`, `meteo-*`, `plages-sans-sargasses`…) ont, elles, un `<article>` riche. → `/previsions/` est un trou de contenu SEO alors que c'est la requête #1 (« temps réel / aujourd'hui / cette semaine »).
- BreadcrumbList AJOUTÉ à `/previsions/` (l.756-761) : OK, ne pas casser.
- Sitemap : `<loc>${d}/previsions/</loc> … priority 0.9 changefreq daily` (l.705). OK.
- `enPath: null` / pas de `esPath` → AUCUN hreflang en/es émis pour `/previsions/` (l.506-509 mettent `''`). C'est volontaire (pas de page EN/ES équivalente). Les régions EN/ES nouvelles ont leur propre hub `forecast`/`today` via `region-seo-pages.cjs` (l.336-340), hors scope ici.

### Le rendu SPA (`Sargasses_PROD.jsx`)
- `/previsions/` charge le **même bundle** que `/`. **Aucun routage dédié** : grep `previsions` dans le monolithe = 0 hit. La page tombe donc sur la vue par défaut `view="map"` (l.10076) → carte SVG/Archipel (`navWorld` true par défaut l.10413).
- `showHero` est gaté `pathname==="/"` UNIQUEMENT (l.10393-10398) → **HomeAZ ne s'affiche JAMAIS sur `/previsions/`**. L'utilisateur qui arrive de Google sur « prévisions sargasses » atterrit sur la carte brute, sans aucune surface prévision, sans la barre golden-hour, sans CTA forecast. **MANQUE n°2.**
- Le SEUL endroit où la prévision 7 j est rendue = `ForecastChart` (l.2356-2518), monté DANS la fiche plage (l.3659, `BeachSheet`/`proto-plage-plongee`), donc NEAR uniquement, jamais en FAR/landing.

### `ForecastChart` (l.2356-2518) — ce qui marche, ce qui manque
- Props : `{forecast, lang, onPremiumClick, isPremium, weatherDaily, weeklyData}`.
- Source data : `forecast = weeklyData[id].forecast[]` (cf. l.3040 `let fc=weeklyData?.forecast`). Champs réels par jour (vérifiés dans `public/api/copernicus/sargassum.json`) :
  `{day:"Auj.", date:"2026-06-16", afai:0.09, status:"clean"|"moderate"|"avoid", confidence:60, type:"observation"|"tendance"|"horizon", regime:"calm"|"high", sources:["satellite","community"|"persistence","wind"]}`.
- Horizon honnête : `reliableHorizon` (du JSON, ici 3) → `visibleDays = min(forecast.length, max(4, reliableHorizon+1))` (l.2371-2372). Au-delà = estompé (`opacity .6`). **Bon, NE PAS casser.**
- Paywall : 1 jour gratuit (`freeThreshold=1`, l.2377), reste flouté → overlay CTA `🔒 Débloquer` (l.2436) + strip jours floutés (l.2455). Conversion = `openLock()` → `pwBeat` (défaut 85 %, beat golden-hour in-scène l.2482) → `onPremiumClick("forecast_beat")` ou direct `onPremiumClick("forecast")`. Events : `sg_forecast_lock_click`, `sg_beat_cta`. **Bon, c'est la porte unique, NE PAS dupliquer.**
- Couleurs statut : `ST` (l.1097, `ST.clean.c`=vert, `moderate`=ambre, `avoid`=corail). Veilleur humeur : `VEILLEUR_MOOD` (l.161) + `moodFromStatus` (l.168) + `miVeil(cx,cy,wing,lens)` (l.981). Tous RÉUTILISABLES.
- **Manque (ForecastChart)** : c'est un mini-bar-chart au sein d'une fiche, PAS une surface de page golden-hour. Pas de Veilleur visible (sauf dans le beat verrouillé), pas de « ton meilleur jour cette semaine », pas de vue cross-plages (la requête /previsions/ est généraliste « cette semaine », pas mono-plage).

### Résumé des manques
1. `/previsions/` ship sans noscript éditorial → trou SEO sur la requête la + chaude.
2. `/previsions/` atterrit sur la carte brute, zéro surface prévision, zéro barre HomeAZ, zéro CTA forecast.

---

## Objectif (barre HomeAZ + KPI visé)

Faire de `/previsions/` une **landing FAR golden-hour à la barre HomeAZ** qui répond à l'intention « où aller à la plage cette semaine » :
- 1er paint : barre golden-hour (ciel/soleil/mer du proto-map-v2 / HomeAZ), Le Veilleur serein (1 satellite, rassure ≠ surveille), H1 daté « Prévisions 7 jours · EN DIRECT », freshness réelle.
- Le cœur = un **ForecastChart 7 j pour la meilleure plage propre du jour** (`heroPick`) + un **« ton meilleur jour cette semaine »** honnête, avec horizon fiable affiché et au-delà estompé.
- 1 porte unique : `openPremium("previsions_landing")` (via le lock/beat existant du ForecastChart).
- Lien vers la carte (FAR) + vers les fiches (NEAR) — anti-cul-de-sac.

KPI visés (cf. REFONTE §8) :
- **Goulot modal→CTA 2 %** : surface forecast contextualisée (plage + verdict + confiance réelle) = matière première du beat → plus de clics CTA qualifiés.
- **Demande #1 « temps réel / cette semaine »** : on sert exactement ça, indexé.
- **Dismiss / fond de page SEO** : remplacer la carte brute (froide) par la barre HomeAZ sur cette landing chaude.
- Mesure : `node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script (modal→CTA, CTA→redirect).

---

## Changements exacts (étape par étape)

### Étape 1 — Combler le trou SEO : noscript éditorial `'previsions'` (vite.config.js)
Dans l'objet `editorialContent` (l.429), AJOUTER une clé `'previsions'` (même forme `<article>` que les voisins, l.430-450). Contenu : H1 + intro « prévision 7 j par plage », H2 « comment lire la prévision » (propre/modéré/à éviter, horizon fiable 4 j), H2 « côte Caraïbe vs Atlantique » (réutiliser le wording véridique des voisins, ne RIEN inventer sur les chiffres), H2 « ton meilleur jour cette semaine » (mécanique, pas de promesse), maillage interne vers `/`, `/carte-sargasses/`, `/alertes/`, `/plages-sans-sargasses/`, `/previsions-methode/`, `/saison-sargasses-martinique/`. Texte 100 % FR.
- Effet auto : la branche l.515-528 injecte `<noscript>…</noscript>` + Article schema + OG `article:modified_time` = today (l.516-518) **dès que la clé existe**. Rien d'autre à coder côté schema.
- GP : le swap `Martinique`→`Guadeloupe` (l.554+) s'applique au noscript aussi (texte visible). Vérifier qu'aucun nom de plage MQ-only ne fuit en dur dans le GP : utiliser des liens `/plages/<slug>/` (rewriteCrossIsland l.483-494 ré-ancre/strip automatiquement les slugs de l'autre île). Préférer des plages présentes des DEUX côtés ou des liens hub (`/meilleures-plages-…`).
- **Garde** : ne PAS toucher l'ajout BreadcrumbList (l.756-761), ni le sitemap (l.705), ni `enPath:null`.

### Étape 2 — Détecter la route `/previsions/` dans le SPA (Sargasses_PROD.jsx)
Ajouter un flag de route (lecture pathname, comme `showHero` l.10393) :
```js
// landing prévisions : SEO /previsions/ doit montrer la barre forecast, pas la carte brute.
const isPrevisions=(()=>{try{return /^\/previsions\/?$/.test(window.location.pathname)
  ||/^\/_gp\/previsions\/?$/.test(window.location.pathname)}catch(_){return false}})()
```
(le `_gp` couvre le miroir GP servi par prepare-ftp). Placer à côté de `homeAZ` (l.10446).

### Étape 3 — A/B : afficher une landing prévision golden-hour sur `/previsions/`
Flag :
```js
const[prevAZ]=useState(()=>{try{const q=window.location.search;
  if(/[?&]prev_az=1/.test(q))return true;if(/[?&]prev_az=0/.test(q))return false;
  return isPrevisions&&abVariant("prev_az",["control","az"],[.5,.5])==="az"}catch(_){return false}})
```
- **Control** (50 %) = comportement ACTUEL exact : `/previsions/` tombe sur la carte (rien changé). Réversible total.
- **Variant** (50 %) = monte un nouveau composant landing au-dessus de la carte (z comme `showHero`, l.10068+), UNIQUEMENT si `isPrevisions && prevAZ`.

Le composant : `<ForecastLanding>` (nouveau, à ajouter dans `Sargasses_PROD.jsx` près de `ForecastChart`, ou en lazy `src/ForecastLanding.jsx` via `lazyWithRetry` comme `LazyHomeAZ` l.32 si > ~150 lignes). **Réutiliser au maximum :**
- **Décor golden-hour + Veilleur + yole** : copier le markup SVG `#stage`/`.sun`/`scene viewBox 0 0 800 600`/`#veilleur`/`#yole` de `design/proto-map-v2.html` (l.21-138) OU réutiliser le shell HomeAZ. **Doctrine calme** : repos = tableau, `@media(prefers-reduced-motion:reduce)` early-return avant tout rAF (cf. proto l.67, et règle skill `sg-svg-scene`). Le Veilleur = 1 objet, œil mi-clos serein, mood = `moodFromStatus(heroPick.status)` (l.168), couleurs `VEILLEUR_MOOD` (l.161). Pour un SVG inline complexe, suivre HomeAZ (Shadow DOM, `<style>.textContent` + `createContextualFragment`, **jamais innerHTML** = hook sécu).
- **Chrome** : live pill « EN DIRECT » + heure RÉELLE (jamais de fake : `freshLabel` calculé depuis `sargData.updatedAt`, masquer si > 12 h → « vérification en cours », cf. règle freshness). Réutiliser le pattern HomeAZ (`opts.home.freshLabel`).
- **H1 daté** : « Prévisions 7 jours » + sous-titre « cette semaine, plage par plage · EN DIRECT ». Anton/Bricolage (fonts déjà chargées).
- **Cœur = `ForecastChart` EXISTANT**, monté tel quel :
  ```jsx
  <ForecastChart forecast={activeWeekly?.forecast} lang={lang}
    onPremiumClick={src=>openPremium(src||"previsions_landing")}
    isPremium={isPremium} weatherDaily={weatherDaily}
    weeklyData={activeWeekly}/>
  ```
  où `activeWeekly = sargData?.weekly?.[heroPick.id]` (l.10465 `heroPick` = meilleure plage propre du jour, déjà calculé). Titre de section : « <Plage> — 7 jours » + lien « voir une autre plage → carte ».
- **« Ton meilleur jour cette semaine »** (honnête) : sur `activeWeekly.forecast.slice(0, visibleDays)` (horizon fiable), trouver le 1er jour `status==="clean"` à `afai` minimal ; afficher « Meilleur créneau : <jour> » avec `confidence` réelle. Si tout estompé / pas de jour fiable clean → « vérification en cours, reviens demain » (pas d'invention). Aucune teinte sur `afai` brut : se brancher UNIQUEMENT sur `forecast[].status/regime` (interdit `cleanFloor` atlantique, cf. `feedback_forecast_floor_ban`).
- **Sorties (anti-cul-de-sac)** : bouton « Ouvrir la carte en direct » → `setShowPrevLanding(false)` / `view="map"` ; clic sur la plage / un top-3 → `setSelectedBeach(b)` (NEAR, comme HomeAZ l.11088). Dock profondeur (Carte/Zones/Moi) optionnel, copier proto-map-v2 l.155 — onglet Premium = action `openPremium`, pas surligné (OK).
- **Conversion** : laisser le lock/beat du `ForecastChart` gérer la porte (il appelle `onPremiumClick` → `openPremium`). NE PAS ajouter un 2e CTA paiement.
- Émettre `track("sg_previsions_landing_view",{home:heroPick?.id,status:heroPick?.status})` au mount (1×/session via sessionStorage, comme `sg_hero_seen`).

### Étape 4 — Câbler le rendu conditionnel
Près du bloc `showHero` (l.11072), ajouter :
```jsx
{isPrevisions&&prevAZ&&heroPick&&sargData?.weekly&&(
  <ErrBound><Suspense fallback={null}>
    <ForecastLanding beach={heroPick} lang={lang} island={island}
      sargData={sargData} isPremium={isPremium} weatherDaily={...}
      onPremium={src=>openPremium(src||"previsions_landing")}
      onOpenBeach={b=>{setSelectedBeach(b);track("sg_beach_open",{beach_id:b.id,status:b.status,source:"previsions"})}}
      onShowMap={()=>setShowPrevLanding(false)} track={track}/>
  </Suspense></ErrBound>
)}
```
Gérer un état `showPrevLanding` (init `isPrevisions&&prevAZ`) pour pouvoir la fermer vers la carte sans recharger.

---

## A/B

- **Flag : `prev_az`** — `abVariant("prev_az",["control","az"],[.5,.5])` (50/50, plus rapide à conclure que home_az 70/30 car page bas-trafic).
- Override : `?prev_az=1` force le variant (la landing golden-hour), `?prev_az=0` force le control (carte brute actuelle). Lecture pathname-gated (`isPrevisions`) : le flag ne s'arme QUE sur `/previsions/`, jamais ailleurs.
- **Ce que voit le control** : EXACTEMENT l'actuel — `/previsions/` charge le SPA, `view="map"`, carte SVG/Archipel, aucun nouveau composant monté. Zéro régression possible (le rendu n'est pas dans le chemin control).
- Mesure : `node scripts/automation/ab-eval.cjs --days=28` (events `sg_previsions_landing_view`, `sg_forecast_lock_click`, `sg_beat_cta`, `sg_beach_open` source=`previsions`) + funnel Apps Script (modal→CTA, CTA→redirect). Promotion seulement si modal→CTA ≥ control sans dégrader CTA→redirect (92 %).

---

## Données réelles à brancher

Source unique : `sargData` (déjà chargé, `public/api/copernicus/sargassum.json`).
- `sargData.weekly[heroPick.id].forecast[]` — champs : `day, date, afai, status (clean|moderate|avoid), confidence, type (observation|tendance|horizon), regime (calm|high), sources[]`.
- `sargData.weekly[id].reliableHorizon` (ici 3) → horizon affiché net ; au-delà estompé. **Ne JAMAIS afficher J+5/J+6/J+7 comme fiables.**
- `sargData.weekly[id].forecastDisclaimer` / `forecastMethod` / `regimeConfidence` — pour la ligne d'honnêteté sous le chart (déjà fait par ForecastChart l.2430-2435 : « Fiable jusqu'à 4 jours. Fiabilité X % demain »).
- Freshness : `sargData.updatedAt` (ISO). Calculer l'âge ; si > 12 h → libellé « vérification en cours », JAMAIS un faux « il y a 3 h » (le proto-map-v2 l.222 hardcode « il y a 3 h » → **NE PAS porter ce hardcode**, le remplacer par le calcul réel).
- `sargData.scores[id]` / `levels` — pour le score 0-100 du hero si affiché (`score`, `label`, `color`, `strengths/weaknesses`).
- **Honnêteté** : pas de jour inventé ; « meilleur jour » dérivé uniquement de `status==="clean"` dans l'horizon fiable ; si vide → message d'attente. Aucune re-teinte de `afai`. Verdict doublé texte+couleur+forme (a11y), via `ST` + `verdictMeta` (l.170).

---

## SEO (si page)

- **slug** : `/previsions/` — INCHANGÉ (slug=nom=SEO). Ne pas renommer, ne pas créer de doublon.
- **title** (déjà l.401) : `Prévisions sargasses Martinique 7 jours (2026)` (MQ) ; GP auto-swappé → `…Guadeloupe…` (l.554+). Garder.
- **meta description** (l.401) : garder. Optionnel : enrichir « ton meilleur jour cette semaine » dans le desc (≤ 155 car).
- **canonical** : `https://sargasses-martinique.com/previsions/` (l.504) ; GP `https://sargasses-guadeloupe.com/previsions/` (l.543). Garder.
- **hreflang** : fr=self uniquement (l.505) ; en/es = vides (l.506-509) car `enPath:null` et pas d'`esPath`. **NE PAS ajouter de hreflang en/es** tant qu'il n'existe pas de page `/en/forecast/` `/es/pronostico/` MQ-GP (les régions nouvelles ont leur propre hub, hors scope). x-default=self (l.510). Garder.
- **noscript éditorial** : AJOUTER (Étape 1) — c'est le gain SEO principal. Article schema + `article:modified_time`=today injectés auto (l.516-528).
- **BreadcrumbList** : déjà ajouté (l.756-761). Ne pas casser.
- **Maillage interne** : depuis le noscript ET depuis la landing variant, lier `/`, `/carte-sargasses/`, `/alertes/`, `/plages-sans-sargasses/`, `/previsions-methode/`, `/saison-sargasses-martinique/` (et leurs équivalents GP via slug). Réciproquement, ces pages lient déjà `/previsions/` (vu l.430-450). Vérifier qu'on ne crée pas de lien mort (curl, cf. `feedback_validate_hrefs`).
- **Ne pas casser l'indexation** : le variant SPA n'altère ni l'URL ni le head (rendu client par-dessus) ; Google lit le noscript + le head statique. Sitemap priority 0.9 daily (l.705) inchangé.

---

## Vérification

```bash
# 0. Syntaxe JSX du monolithe AVANT tout (obligatoire après edit) :
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
# (idem sur src/ForecastLanding.jsx s'il est créé en module séparé)

# 1. Proto / scène isolée — serveur local (l'app preview TIMEOUT à cause du rAF) :
python -m http.server 8790 --bind 127.0.0.1   # background
# Playwright (script .cjs DANS le repo) :
#   navigate http://127.0.0.1:8790/design/proto-map-v2.html  (réf décor FAR)
#   waitForTimeout(1000) ; capter pageerror + console.error ; screenshot ; Read le png
#   JUGER la capture à la barre HomeAZ (golden-hour, Veilleur serein, calme au repos)

# 2. Smoke build complet (intègre vite.config.js seo-pages + génère dist/previsions/) :
npm run build   # attendre "built in", vérifier "BreadcrumbList ajouté", 136 pages, 0 erreur

# 3. Vérifier le noscript éditorial émis :
node -e "const h=require('fs').readFileSync('dist/previsions/index.html','utf8');console.log('noscript previsions:',/<noscript><article>/.test(h));console.log('article schema:',/\"@type\":\"Article\"/.test(h));console.log('canonical:',/canonical\" href=\"https:\/\/sargasses-martinique.com\/previsions\//.test(h))"
# variante GP :
node -e "const h=require('fs').readFileSync('dist/_gp/previsions/index.html','utf8');console.log('GP title Guadeloupe:',/Guadeloupe/.test(h)&&!/Martinique 7 jours/.test(h));console.log('GP canonical:',/sargasses-guadeloupe.com\/previsions\//.test(h))"

# 4. Landing variant rendue — servir dist/ et forcer le variant :
#   navigate http://127.0.0.1:8790/dist/previsions/index.html?prev_az=1
#   waitForTimeout(1500) ; screenshot ; vérifier : barre golden-hour + Veilleur + ForecastChart 7j + CTA lock
#   puis ?prev_az=0 → DOIT afficher la carte brute (control intact)
#   reduced-motion : émuler prefers-reduced-motion → AUCUNE anim (repos = tableau)
```
Avant ship : `git pull --rebase` ; SW bump `public/sw.js CACHE_NAME='sargasses-vXXX'` ; rebuild MQ d'abord ; stage fichier par fichier (jamais `git add -A`) ; **pas de deploy Shabbat ven 18h→sam 19h**.

---

## Garde-fous spécifiques

- **Ne JAMAIS supprimer / déplacer `/previsions/` ni son entrée `pages` (l.401), ni le sitemap (l.705), ni le BreadcrumbList (l.756-761).** Aucune page sans 301.
- **Control = chemin intact.** Le variant ne se monte QUE si `isPrevisions && prevAZ && heroPick && sargData?.weekly`. Si une de ces conditions manque → fallback carte (jamais d'écran vide).
- **Réutiliser `ForecastChart` tel quel** comme cœur — ne pas réimplémenter la logique horizon/lock/beat (risque de diverger du tracking et de l'honnêteté). La porte de conversion reste `onPremiumClick → openPremium`, UNIQUE.
- **Freshness honnête** : remplacer le « il y a 3 h » hardcodé du proto (l.222) par l'âge réel de `sargData.updatedAt` ; > 12 h → « vérification en cours ». Aucun faux timestamp.
- **Horizon honnête** : ne montrer net que `reliableHorizon` jours ; au-delà estompé ; pas de J+5-7 vendus comme sûrs.
- **`feedback_forecast_floor_ban`** : aucune `cleanFloor` atlantique ; toute teinte/sélection se branche sur `forecast[].status/regime`, jamais sur `afai` re-plancher.
- **Doctrine calme** : repos = tableau, 1 seul rAF + pause `visibilitychange`, `prefers-reduced-motion` = early-return avant rAF (skill `sg-svg-scene`). Le Veilleur = 1 satellite serein (œil mi-clos), rassure ≠ surveille, jamais d'œil-HAL.
- **Zéro image IA.** SVG propriétaire uniquement.
- **Pas de pop-up/carte flottante par-dessus la scène** (`feedback_no_ui_in_ui`) : l'info (forecast, meilleur jour) vit DANS la scène / le bloc landing, pas en panneau qui surnage.
- **SVG complexe → Shadow DOM + `<style>.textContent` + `createContextualFragment`, jamais `innerHTML`** (hook sécurité bloque), cf. HomeAZ l.9-16.
- **Tracking `sg_*` réutilisé à l'identique** (sinon récidive `funnel_tracking_gap`) : `sg_previsions_landing_view`, `sg_forecast_lock_click`, `sg_beat_cta`, `sg_beach_open(source:"previsions")`.
- **GP** : vérifier qu'aucun nom de plage MQ-only ne fuit dans le noscript GP (préférer slugs présents des deux côtés ou liens hub ; `rewriteCrossIsland` l.483 ré-ancre/strip les `/plages/<slug>/`).
- **`stripe-config.php` jamais touché.**
