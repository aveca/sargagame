# /fiabilite/ (page Fiabilité par régime) — spec d'exécution

> Surface = la page statique standalone `/fiabilite/` (+ miroir GP, + variantes régions `/reliability/` EN, `/fiabilidad/` ES). Générée au build, JAMAIS dans le SPA.
> Cadre : `design/REFONTE-EXECUTION.md` + tête `design/REFONTE-MASTER.md`. Barre = `src/HomeAZ.jsx`. Additif + A/B + réversible + vérifié navigateur. Data 100 % honnête.
> Pré-lecture obligatoire avant de coder : skill `sg-design-system` (palette/Veilleur/doctrine) + skill `sg-svg-scene` (viewBox 800×600, 1 rAF, pièges payés).

---

## État actuel

**Générateur unique : `scripts/lib/reliability-page.cjs`** (499 lignes, déjà branché, déjà en prod). Exporte `generateReliabilityPages(region, distDir)`.

- **Wiring vite.config.js** :
  - MQ/GP : `vite.config.js:688-691` (closeBundle) → `generateReliabilityPages(null, outDir)` → écrit `dist/fiabilite/index.html` (canonical Martinique) + `dist/_gp/fiabilite/index.html` (miroir GP, overlay par `prepare-ftp` en dernier, même mécanique que les éditoriaux).
  - Régions (≠ mq/gp) : `vite.config.js:341-346` → `generateReliabilityPages(REGION, resolve(__dirname,'dist'))` → écrit `dist/reliability/` (EN) et/ou `dist/fiabilidad/` (ES) selon `region.primaryLang` + `region.secondaryLangs`, cross-liées en hreflang, ajoutées au `sitemap.xml` régional (`reliability-page.cjs:403-413` `appendToRegionSitemap`).
  - Sitemap MQ/GP : l'URL `/fiabilite/` est déjà déclarée `vite.config.js:707` (`priority 0.7`, `changefreq daily`).

- **Sources de données réelles (RÈGLE D'OR : aucun chiffre inventé, `reliability-page.cjs:9-12`)** :
  - `scripts/automation/data/backtest-results.json` (précision prévision vs satellite). Champs réels au 2026-06-16 :
    - `overall.statusHitRate` = 78, `overall.afaiMAE` = 0.043
    - `totalPairs` = 3300, `archiveDays` = 31, `dateRange` = {archiveFrom `2026-05-17`, archiveTo `2026-06-16`}
    - `byHorizon.day1..day6` (PAS day7 actuellement) : ex. `day1` = {statusHitRate 76, afaiMAE 0.044, avgConfidence 50, pairs 600}
    - `byBeach` (ids pipeline, ex. `grande-anse` {statusHitRate 71, pairs 165}, `anse-mitan` {97, 165})
    - **`regimeReliability`** = la pièce maîtresse honnête. Champs : `note`, `method` ("archive"), `window` ("2026-05-17 → 2026-06-16"), `regimes.{calm|high|unknown}.{samples, cleanReliabilityPct, cleanSamples, alertReliabilityPct, alertSamples, falseAlarmRatePct}`, `headline.{fr|en|es}`. Au 2026-06-16 : régimes présents = `calm` (3060 samples, clean 100% sur 2395, falseAlarm 22%) + `unknown` (240). **`high` ABSENT** tant qu'on n'est pas en saison haute → tout code DOIT gérer `regimes.high` undefined.
    - `byRegime` / `byRegimeDirection` (agrégats bruts n/hit/falseAlarm) — pas consommés par la page actuelle.
  - `public/api/copernicus/sargassum.json` (`updatedAt`, `levels[]`) pour la section Fraîcheur (MQ/GP) ; `public/api/copernicus/<region>/sargassum.json` pour les régions.

- **Ce qui MARCHE déjà** (page actuelle, 3 sections sur fond encre golden-hour `--ink:#0A1714 / --gold:#FFC72C`, max-width 560px, design aligné `public/about/index.html`) :
  1. `regimeLead` — bandeau honnête `regimeReliability.headline[lang]` en tête de la section précision (`reliability-page.cjs:239-247`). C'EST la source de vérité honnête, partagée avec le badge in-app via `__RELIABILITY__`.
  2. Section « La méthode » (4 rows brand-icons satellite/wave/ruler/∅, `reliability-page.cjs:373-382`).
  3. Section « La précision, mesurée » : intro période+volume, 3 stat-cards (J+1 / J+3 / global), définition du hit + MAE, tableau par échéance (J+1..J+N avec confiance affichée), bloc « Ce qu'on rate » (3 pires plages réelles).
  4. Section « Fraîcheur » : `updatedAt` + refresh client + CTA `/?utm_source=fiabilite`.
  - JSON-LD WebPage + BreadcrumbList ; refresh JS client re-fetch `/api/copernicus/sargassum.json`.

- **Fil rouge in-app vers la page (déjà câblé, NE PAS casser)** :
  - `Sargasses_PROD.jsx:48-49` : `__REL = (typeof __RELIABILITY__!=="undefined" && __RELIABILITY__) || null`, injecté au build par `vite.config.js:51-71` + `:1606` (`define`).
  - Liens `<a href="/fiabilite/">` + `track("sg_reliability_open",{from})` à : `Sargasses_PROD.jsx:3391` (`beach_badge`), `:9390` (`world_card`), `:9627` (`world_carnet`).
  - Le badge fiche (`:3396-3409`) affiche le clean-rate PAR RÉGIME (`__REL.cleanPct`/`cleanN`/`regime`), jamais le global %.

- **Ce qui MANQUE / faible (le vrai objet de cette spec)** :
  1. **Aucun visuel golden-hour ni Veilleur** : la page est texte+cards plates, hors barre HomeAZ. Le lecteur arrive d'un monde SVG vivant (HomeAZ/proto-map-v2/proto-plage-plongee) et tombe sur une page « rapport ». Rupture de marque.
  2. **Le régime n'est pas le héros** : `regimeLead` est un simple `<p>` ; le chiffre honnête #1 (clean-rate calme + false-alarm rate) ne domine pas visuellement. La promesse honnête (« 100% mer-propre vérifiées, alertes faibles signalées prudemment ») est noyée.
  3. **`falseAlarmRatePct` JAMAIS affiché** alors qu'il est mesuré (22% calme) — c'est précisément l'honnêteté que `regimeReliability.note` demande de publier (« calm-season ALERTS are far less reliable »). On affiche le côté flatteur (clean 100%) sans son pendant (alertes peu fiables).
  4. **Pas de hero/H1 visuel** : `<h1>Nos prévisions, vérifiées</h1>` en texte nu, sans jauge ni preuve visuelle.
  5. **Pas de retour fluide vers le funnel** : un seul CTA bas de page `/?utm_source=fiabilite` ; aucune capture e-mail (or capture = levier #1, 0,35%).

---

## Objectif (barre HomeAZ + KPI visé)

**Hisser `/fiabilite/` à la barre HomeAZ** (golden-hour, Le Veilleur serein qui RASSURE≠surveille, doctrine calme = repos tableau + reduced-motion floor, ZÉRO image IA) **sans rien inventer** — au contraire, en rendant l'honnêteté plus lisible (clean ET false-alarm côte à côte).

KPI :
- **Trust → conversion** : la page est le bout du « fil rouge de preuve » (fiche→/fiabilite, blueprint move #1). Plus elle rassure visuellement, plus le retour vers `openPremium` est crédible. Mesure : `sg_reliability_open` → retour app → modal→CTA (goulot 2%).
- **Capture e-mail (levier #1, 0,35%)** : ajouter un point de capture honnête (« Recevez le verdict du matin ») en bas de page = nouvelle surface de capture hors-app.
- Ne PAS dégrader le SEO (page indexée, déjà en sitemap, déjà des chiffres réels en meta description).

---

## Changements exacts (étape par étape)

Tout se fait dans **`scripts/lib/reliability-page.cjs`** (un seul fichier, déjà la source unique). La page reste **standalone HTML inline** (zéro dépendance React/SPA). On ajoute un bras A/B `rel_v2` côté générateur via un flag de build + lecture `?rel_v2=1/0` côté client (voir section A/B). Garder le rendu actuel intact comme `control`.

### Étape 1 — Hero golden-hour + jauge de preuve (remplace le `<h1>` nu, variant uniquement)

Réutiliser le **gradient golden-hour de `proto-map-v2.html:22-28`** (`#stage` background + `.sun` breath) et la **palette `proto-map-v2.html:11-15`** (`--sky0:#0B2230 … --goldL:#FFC72C --green:#22C55E --amber:#E8A800 --coral:#E8522A`). Ajouter dans le `<style>` (variant) un bloc hero :

```
.hero{position:relative;margin:0 -22px;padding:calc(20px + env(safe-area-inset-top)) 22px 26px;overflow:hidden;
  background:radial-gradient(130% 70% at 76% 4%,rgba(255,224,160,.16),transparent 48%),
             linear-gradient(158deg,#1f6157 0%,#114440 44%,#072019 100%)}
.hero .sun{position:absolute;top:-30%;right:-12%;width:80%;height:80%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(255,243,214,.42),rgba(255,216,132,.18) 46%,transparent 72%);
  animation:sunBreath 11s ease-in-out infinite}
@keyframes sunBreath{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
@media (prefers-reduced-motion:reduce){.hero .sun{animation:none}}   /* doctrine calme : repos = tableau */
```

Hero markup (variant), au-dessus de la section « La méthode », sous la topbar `.tb` :
- `<h1>` conservé (`t.h1a` + `<em>t.h1b</em>`) MAIS posé sur le hero golden-hour.
- **Jauge de preuve** : porter le pattern `.gauge` de `proto-map-v2.html:48-51` (barre + libellé). Remplir avec le chiffre RÉEL du régime dominant : largeur = `cleanReliabilityPct` du régime affiché ; libellé = `${cleanPct}% des prévisions « mer propre » vérifiées · {regime}`. Si `regimeReliability` absent → fallback `overall.statusHitRate` global, libellé « {n}% justes ({pairs} comparaisons) ». Jamais de barre sans chiffre source.
- **Le Veilleur** : copier le `<g id="veilleur">` SVG **byte-identique de `proto-map-v2.html:126-135`** (satellite serein, regard vers la mer, halo `#phalo`, antenne pastille verte). Le poser petit en haut-droite du hero (`<svg viewBox="0 0 120 120">` isolé ou inline dans un mini-svg). DOCTRINE : il rassure, il ne surveille pas — pas d'œil rouge, pas d'anim agressive, halo doux uniquement. Réutiliser le `radialGradient id="phalo"` de `proto-map-v2.html:76`.
- Reduced-motion : aucune anim sur le Veilleur au repos (pattern `proto-map-v2.html:67`).

### Étape 2 — Le RÉGIME devient le héros honnête (clean + false-alarm côte à côte)

Nouvelle fonction `regimeHeroSection(lang, bt)` appelée AVANT `precisionSection`, **uniquement si `bt.regimeReliability.regimes`** a un régime exploitable. Pour le régime dominant (même logique que `vite.config.js:55-56` : `high` si `high.samples > calm.samples`, sinon `calm`) :

- **Deux stat-cards jumelles** (réutiliser `.stat` `reliability-page.cjs:342-345`), honnêteté symétrique :
  - Carte VERTE : `cleanReliabilityPct` % + « prévisions “mer propre” vérifiées · {n=cleanSamples} · {regime} »
  - Carte AMBRE : `falseAlarmRatePct` % + « taux de fausses alertes en {regime} — c'est pourquoi nos alertes restent à faible confiance tant que la donnée ne les confirme pas »
  - Lier la fenêtre : `regimeReliability.window` sous les cartes (`note`).
- Le `regimeLead` (`headline[lang]`) reste au-dessus de ces cartes (déjà honnête, déjà partagé avec le badge in-app).
- **Si le régime n'a PAS de `alertSamples > 0`** → masquer la carte ambre (ne rien inventer).
- i18n : ajouter clés `I18N.{fr,en,es}` : `rgClean`, `rgFalse`, `rgFalseNote`, `rgWindow`, `rgRegimeCalm`/`rgRegimeHigh`. Suivre le ton existant (FR « espace fine + % » via `fmtPct`).

> Honnêteté = exigence `regimeReliability.note` : « Publish THIS, never a single global %, which hides that calm-season ALERTS are far less reliable ». On affiche donc le false-alarm À CÔTÉ du clean, jamais l'un sans l'autre.

### Étape 3 — Cards en « plongée » + tableau plus lisible

Greffer le langage visuel de **`proto-plage-plongee.html`** (fiche préférée fondateur) :
- `.scoreblob` SVG donut (`proto-plage-plongee.html:149-153`) pour la jauge globale au lieu d'un simple chiffre, si on veut un accent visuel sur le « global » — OPTIONNEL, garder le donut sobre (1 arc, pas d'anim au repos).
- `.statuspill` (`proto-plage-plongee.html:141-146`) comme micro-étiquette « EN DIRECT · {fresh} » dans la section Fraîcheur, cohérent avec `proto-map-v2.html` `.live` pill.
- Garder le tableau par échéance (`reliability-page.cjs:218-221`) tel quel (il est honnête et clair) — juste reposé dans une `.tablecard` au style golden-hour (bordure `--line`, fond `--card`).

### Étape 4 — Capture e-mail honnête en bas (variant)

Avant le CTA final, ajouter un bloc capture (levier #1). HONNÊTE : « Recevez le verdict du matin (gratuit) — la même mesure satellite, dans votre boîte. ». POST vers le même endpoint e-mail que l'app (réutiliser le mécanisme `/collect` / Apps Script ; ne PAS inventer d'endpoint). Si aucun endpoint same-origin n'est garanti sur le domaine statique → fallback : lien vers l'app `/?capture=1` plutôt qu'un faux formulaire. **Ne jamais simuler une soumission.** Tracking : `sg_email_submit` (event critique existant) ou, si hors-app, un simple `utm_source=fiabilite_capture` sur le lien.

### Étape 5 — Rien d'autre ne bouge

- `freshnessSection` (`reliability-page.cjs:256-271`), `renderPage` JSON-LD/hreflang (`:273-394`), `buildMeta` (`:415-443`), `generateReliabilityPages` (`:449-497`), `appendToRegionSitemap` : INCHANGÉS sauf l'insertion des nouvelles sections dans `renderPage`'s body et le `<style>` variant.

---

## A/B

- **Flag : `rel_v2`** (variant golden-hour) vs **`control`** (page actuelle, 100% intacte).
- **Override** : `?rel_v2=1` force variant, `?rel_v2=0` force control. Mécanisme côté **client** (la page est statique, donc on rend les DEUX et on bascule au load via une classe sur `<body>`), pour rester réversible sans re-build :
  - Émettre `<body class="rel-control">` par défaut + un petit `<script>` en tête qui lit `?rel_v2=1/0` ; sinon tirage pondéré stocké dans `localStorage.sg_ab.rel_v2` (réutiliser EXACTEMENT la logique `abVariant` de `Sargasses_PROD.jsx:1436-1443` : lecture `sg_ab` map, tirage `[w,w]`, persistance). Recopier la fonction inline (la page n'importe pas le SPA).
  - CSS : `.rel-control .v2{display:none}` / `.rel-v2 .control-hero{display:none}` — les deux arbres coexistent, seul l'actif s'affiche. Hero golden-hour + regime-hero + capture = sous `.v2` ; le `<h1>` nu + `regimeLead` actuel = sous `.control-hero`.
  - Poids proposés : `["control","v2"],[.3,.7]` (la page actuelle est sobre mais hors-barre ; on pousse v2). Ajustable.
  - Tracking : au load, `track("sg_rel_view",{variant})` via une mini file `sg_track_queue` (ou simplement un beacon `navigator.sendBeacon` vers Apps Script avec `event=sg_rel_view`). **Réutiliser les noms `sg_*`** ; ne PAS inventer un nouveau schéma (sinon récidive `funnel_tracking_gap`).
- **Ce que voit le control** : la page actuelle, octet pour octet (sections méthode/précision/fraîcheur, `regimeLead` en `<p>`, aucun hero). Zéro régression possible.

---

## Données réelles à brancher

Toutes depuis `scripts/automation/data/backtest-results.json` (lu par `readBacktest()` `reliability-page.cjs:168-173`, gardé : `null` → sections sautent) :

| Élément UI | Champ JSON | Honnêteté |
|---|---|---|
| Jauge hero (largeur + libellé) | `regimeReliability.regimes.<dominant>.cleanReliabilityPct` / `.cleanSamples` | régime dominant = `high` si samples>calm sinon `calm` (logique `vite.config.js:55`). Fallback `overall.statusHitRate`+`totalPairs`. |
| Bandeau lead | `regimeReliability.headline[lang]` | déjà rendu (`reliability-page.cjs:240`), partagé avec badge in-app. |
| Carte clean (verte) | `.cleanReliabilityPct` + `.cleanSamples` | jamais sans son n d'échantillon. |
| Carte false-alarm (ambre) | `.falseAlarmRatePct` + `.alertSamples` | **OBLIGATOIRE à côté du clean** ; masquée si `alertSamples===0`. |
| Fenêtre de mesure | `regimeReliability.window` | toujours afficher (lie le chiffre à sa période, `note` l'exige). |
| Stats J+1/J+3/global | `byHorizon.day1.statusHitRate`, `.day3.statusHitRate`, `overall.statusHitRate` | gardés `pairs>0` (déjà). |
| Tableau échéances | `byHorizon.day1..day7` (day7 absent aujourd'hui → boucle saute, déjà gérée `:212-217`) | `avgConfidence` affichée telle quelle. |
| MAE | `overall.afaiMAE` | déjà. |
| « Ce qu'on rate » | `byBeach` (3 pires `statusHitRate`) | publiées telles quelles (déjà `:223-234`). |
| Fraîcheur | `public/api/copernicus[/<region>]/sargassum.json` `.updatedAt` + `.levels.length` | refresh client re-fetch (déjà `:296-304`). |

**Interdits données** : aucun chiffre hardcodé, aucune barre/jauge sans champ source, jamais le global % seul sans le régime, jamais clean sans false-alarm. Si `regimeReliability` absent → le regime-hero saute, on retombe sur le rendu précision actuel.

---

## SEO (si page)

Page indexée existante — NE PAS casser l'indexation. `renderPage` (`reliability-page.cjs:273-394`) gère déjà tout ; les changements sont visuels (dans le `<body>`/`<style>`), donc le `<head>` reste identique.

- **title/meta** : `buildMeta` (`:415-443`) — déjà des chiffres réels (`{j1}% J+1, {all}% global sur {pairs}`). INCHANGÉ.
- **canonical** : `https://<domain>/<slug>/` (`:275`). MQ canonical = `sargasses-martinique.com/fiabilite/`. INCHANGÉ.
- **hreflang** : MQ/GP = pas d'alternates (`alternates` absent → `''`, `:279-282`). Régions bilingues : chaque variante (`/reliability/` EN, `/fiabilidad/` ES) déclare ses sœurs + `x-default`=langue primaire (`:483`, `reliability-page.cjs:471-495`). INCHANGÉ — ne pas y toucher (le fix `/fiabilidad/` a déjà été shippé, commit fb01f7b1 « restore /fiabilidad/ »).
- **slug = nom = SEO** : `fiabilite` / `reliability` / `fiabilidad` figés. NE PAS renommer.
- **Maillage interne** : entrants déjà en place depuis l'app (`Sargasses_PROD.jsx:3391/9390/9627`). Sortant : CTA `/?utm_source=fiabilite` (`:269`) — garder + ajouter `utm_source=fiabilite_capture` sur le lien capture (variant). Ne PAS ajouter de liens vers des pages sans 301.
- **sitemap** : `/fiabilite/` déjà déclarée (`vite.config.js:707`) ; régions auto-ajoutées (`appendToRegionSitemap`). RIEN à changer.
- JSON-LD `WebPage`+`BreadcrumbList` (`:284-295`) : conservés.

---

## Vérification

⚠️ L'app preview TIMEOUT (rAF continu) → serveur local + Playwright (cf. `REFONTE-EXECUTION.md:34-46`).

```bash
# 0. Régénérer la page seule (rapide, sans full build) pour itérer le HTML :
node -e "const {generateReliabilityPages}=require('./scripts/lib/reliability-page.cjs');require('fs').mkdirSync('dist',{recursive:true});generateReliabilityPages(null,'dist');"
#    → vérifie le log « /fiabilite/ générée (MQ + miroir GP) — backtest 78% global, 3300 paires »

# 1. Serveur local (background) depuis le repo :
python -m http.server 8790 --bind 127.0.0.1

# 2. Playwright (script .cjs DANS le repo) :
#    navigate http://127.0.0.1:8790/dist/fiabilite/index.html
#    - control  : navigate .../index.html?rel_v2=0  → screenshot → Read png → JUGER (doit = page actuelle)
#    - variant  : navigate .../index.html?rel_v2=1  → waitForTimeout(1200) → capter pageerror + console.error
#                 → screenshot desktop + resize 390x844 mobile → Read png → JUGER à la barre HomeAZ
#    - reduced-motion : page.emulateMedia({reducedMotion:'reduce'}) → vérifier sun/Veilleur figés (repos=tableau)
#    - vérifier : jauge largeur = cleanPct réel, carte false-alarm présente, fenêtre affichée, fil rouge CTA OK

# 3. (Si le générateur n'a pas de syntaxe JSX — c'est du .cjs — juste require-check :)
node -e "require('./scripts/lib/reliability-page.cjs');console.log('module OK')"

# 4. Smoke build complet (intégration MQ/GP + sitemap + miroir _gp) :
npm run build   # attendre "built in", 0 erreur, vérifier dist/fiabilite/ + dist/_gp/fiabilite/ + /fiabilite/ dans sitemap

# 5. hreflang régions (si on touche au build région — ici on n'y touche pas, mais smoke) :
#    REGION=puntacana npm run build  → vérifier dist/reliability/ + dist/fiabilidad/ + entrées sitemap
```

**Juger soi-même la capture** (barre = HomeAZ). Si moche/illisible → corriger AVANT de ship. Vérifier explicitement : (a) le contrôle est intact ; (b) le variant a le golden-hour + Veilleur serein ; (c) clean ET false-alarm visibles ; (d) reduced-motion = statique.

---

## Garde-fous spécifiques

- **ZÉRO image/vidéo IA** — uniquement SVG propriétaire (gradient golden-hour CSS + Veilleur SVG porté de `proto-map-v2.html`).
- **Le Veilleur RASSURE ≠ surveille** : porter le `<g id="veilleur">` tel quel (regard mer, halo doux, antenne pastille verte). Pas d'œil rouge, pas de scan agressif, pas d'anim « radar ».
- **Doctrine calme** : au repos la page = tableau. Seule anim tolérée = `sunBreath` 11s très douce, COUPÉE en `prefers-reduced-motion` (floor obligatoire).
- **Honnêteté data, non négociable** : jamais le global % seul ; clean TOUJOURS accompagné du false-alarm ; chaque chiffre lié à sa `window` ; rien d'inventé ; section qui saute si donnée absente (jamais de placeholder). `regimes.high` est ABSENT aujourd'hui → le code doit le gérer (undefined-safe).
- **Source unique** : ne PAS dupliquer la logique régime ; réutiliser la même sélection de régime dominant que `vite.config.js:55-56` et le même `headline[lang]` que le badge in-app (`__RELIABILITY__`) → fil de preuve cohérent app ↔ page.
- **Additif + réversible** : control = octet pour octet la page actuelle ; le variant vit sous `.rel-v2` ; bascule client par `?rel_v2=1/0` + `sg_ab`. Aucun re-build requis pour revenir.
- **Tracking `sg_*` à l'identique** : `sg_reliability_open` (entrants, ne pas renommer), `sg_rel_view` (impression variant), `sg_email_submit` (capture) ou `utm_source=fiabilite_capture` si hors-app. Jamais un schéma neuf.
- **SEO intouchable** : `<head>` (title/meta/canonical/hreflang/JSON-LD/sitemap) inchangé ; slug figé ; pas de lien sans 301.
- **Shabbat** : pas de deploy ven 18h→sam 19h (le build est OK, le push/FTP non).
- **Page standalone** : zéro import React/SPA, zéro `innerHTML` côté générateur (HTML construit en template string, déjà le cas) ; le `<script>` client inline reste minimal et CSP-safe.
