# /plages-sans-sargasses/ (clean-list) — spec d'exécution

> Surface : la page « plages propres aujourd'hui » FR + variants `en/best-beaches-no-sargassum`, `es/mejores-playas-sin-sargazo`, et le pendant USD `today`/`limpias`.
> Barre = HomeAZ. Tout est ADDITIF + A/B + réversible + vérifié navigateur. Lire d'abord `design/REFONTE-EXECUTION.md` + skills `sg-design-system`/`sg-svg-scene`.

---

## État actuel

**1. La page existe déjà comme SEO-shell qui mounte l'app entière — PAS comme une vue dédiée.**
- Déclarée dans `vite.config.js` l.406 :
  `{ path: 'plages-sans-sargasses', enPath: 'en/best-beaches-no-sargassum', esPath: 'es/mejores-playas-sin-sargazo', title: 'Plages sans sargasses en Martinique et Guadeloupe (2026)', desc: '...' }`.
- Le générateur (`vite.config.js` l.495-574) prend `htmlSubpage` (le template index), remplace title/meta/canonical/hreflang/og, injecte un `<noscript>` éditorial (l.515-528) + JSON-LD Article (l.517), écrit `dist/plages-sans-sargasses/index.html` (MQ) + `dist/_gp/plages-sans-sargasses/index.html` (miroir GP, overlay par `prepare-ftp`).
- Contenu noscript actuel = `editorialContent['plages-sans-sargasses']` (`vite.config.js` l.432) : **liste FIGÉE codée en dur** (« Anse Mitan / Anse Noire / Grande Anse d'Arlet… généralement propres »). Honnête au sens « généralement », mais **jamais la liste DU JOUR** — c'est le manque #1.
- Sitemap : `vite.config.js` l.723, priority 0.8, changefreq weekly. EN/ES déclarés `enPages`/`esPages` (l.612, l.661) avec leur propre noscript hérité du template (pas d'éditorial dédié → ils mountent l'app, noscript = celui du template).

**2. Côté React (`Sargasses_PROD.jsx`), la page n'a AUCUN routage spécifique.**
- `getLang()` (l.66) lit `/en` `/es` pour la langue. Aucun `match` sur `plages-sans-sargasses` (vérifié : seul `^\/(?:plages|beaches|playas)\/([^/]+)` l.10529 pour les fiches deep-link).
- `showHero` (l.10393-10399) = `pathname==="/"` UNIQUEMENT → sur `/plages-sans-sargasses/` le hero/HomeAZ ne s'affiche pas ; l'utilisateur tombe sur la **carte/liste brute** (cohort `nav_world` → Archipel auto l.10421). Donc aujourd'hui le visiteur SEO « plages propres » atterrit sur l'app générique, pas sur une réponse directe « voici les plages propres du jour ».

**3. Ce qui MARCHE déjà et qu'on RÉUTILISE (ne rien réécrire) :**
- `rankBeaches(allBeaches, island, userPos, sargData, communityReports)` (`Sargasses_PROD.jsx` l.4355-4404) : score composite, +100 si `status==='clean'`, pénalité distance (`-min(dist,50)*1.2`) ou drive (`-min(drive,90)*0.6`), tri best-first, renvoie `_score/_dist/_fc1/_fc3/_conf`. **C'est exactement le moteur du clean-list.**
- Le filtre clean existe : `filter===1 → list.filter(b=>b.status==='clean')` (l.10906) + counts (l.10915-10918).
- Le proto **`design/proto-planb-clean-nearby.html`** = la scène golden-hour + rail de cartes « plages propres près de toi » DÉJÀ dessinée à la barre (Veilleur qui désigne, yole, vignette SVG seedée, badge PROPRE, score /100, distance/drive, barre fiabilité, freshness réelle, DOM sans innerHTML, 1 rAF, reduced-motion floor). **C'est le design de référence de cette surface** — il a juste été conçu comme overlay Plan-B in-app ; ici on le réoriente en page FAR plein-écran.
- Données honnêtes prêtes : `public/api/copernicus/sargassum.json` → `levels[]` (id, afai, status, confidence, score, label, reason), `weekly[id].forecast[]` (day/date/afai/status/confidence/regime), `scores[id]` (score/strengths/weaknesses), `updatedAt` (ISO réel, ex. 2026-06-16T12:33Z), `source:"erddap-live"`.
- Beaches : `name, commune, coast, drive, kids, parking, lat, lng, status, score, afai` (champs cités l.2862-2866, l.4398-4399).

**Manque :** (a) la page ne répond pas à l'intention « quelles plages SONT propres AUJOURD'HUI » avec la vraie liste live ; (b) noscript figé ; (c) aucun A/B ; (d) pas de Veilleur/golden-hour (barre HomeAZ non atteinte) ; (e) capture email (levier #1) absente.

---

## Objectif (barre HomeAZ + KPI visé)

Faire de `/plages-sans-sargasses/` (+ EN/ES/USD) une **réponse directe golden-hour** : « Aujourd'hui, voici les plages propres — la meilleure d'abord », à la barre HomeAZ (Le Veilleur rassure, doctrine calme, zéro image IA, freshness réelle), branchée sur `rankBeaches` filtré clean.

- **KPI primaire** : alimenter le goulot conversion. Chaque carte ouvre la **fiche** (NEAR, `openPremium` reste l'unique porte), et la page expose UNE surface de capture email (levier #1, 0,35 %) à l'aha-moment (« la meilleure plage du jour est X »).
- **KPI SEO** : intention « plage sans sargasse aujourd'hui / clean beach today » = demande #1 (temps réel). Ne PAS casser l'indexation (page priority 0.8). Le noscript doit rester crawlable et cohérent avec l'app.
- **Secondaire** : réduire l'angoisse « journée gâchée » → plan B immédiat (même promesse que `proto-planb-clean-nearby`).

---

## Changements exacts (étape par étape)

Deux livrables : **(A) une vue React `CleanList`** montée quand `pathname` matche un slug clean-list ; **(B) le noscript éditorial DYNAMIQUE-au-build** pour le crawl. Le control reste 100 % intact.

### Étape 1 — Asset : porter `proto-planb-clean-nearby.html` en composant React `src/CleanList.jsx` (Shadow DOM, modèle HomeAZ)
- Suivre EXACTEMENT le port HomeAZ (`src/HomeAZ.jsx` l.1-21 + `scripts/build-homeaz.cjs` → `src/home-az-assets.js`) : CSS+markup SVG byte-identiques au proto via un générateur, montés en **Shadow DOM** (`host.attachShadow`, `<style>.textContent`, `createContextualFragment`, **jamais `innerHTML`** — hook sécurité bloque, cf. REFONTE-EXECUTION §4).
- Source visuelle = `design/proto-planb-clean-nearby.html` : reprendre TEL QUEL la scène (`#scene` viewBox `0 0 800 600` `xMidYMid slice`, ciel/soleil/mer/sable, `#veilleur` qui regarde la MER et **désigne** l'alternative via `_pointBeam`, `#yole`, `#reflect`), le rail `.pb-rail` de cartes `.card`, la vignette `thumbSVG(seed)` (aplats marque seedés, zéro image IA), `fmtFreshness` (l.297-303 du proto : `<12h` → « EN DIRECT - il y a Nh » sinon « vérification en cours »), le moteur 1-rAF (l.381-433 : `wake/loop`, pause `visibilitychange`, `applyRM` reduced-motion = plancher dur).
- **Différence vs proto** : le proto est un overlay bottom-sheet (`#planb` ancré bottom) déclenché sur plage avoid. Ici c'est une **page FAR plein-écran** :
  - Retirer le bandeau `coral`/`pulse` « Sargasses sur ta plage » (proto kicker l.346) — on n'arrive PAS depuis une plage touchée. Kicker neutre : `_t("Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy")`.
  - Titre Anton : `_t("Le meilleur choix : <em>N plages propres</em>","Best picks: <em>N clean beaches</em>","Lo mejor: <em>N playas limpias</em>")` (N = nombre réel de clean du jour pour l'île).
  - Carte #1 = `is-best` ribbon `_t("le + sûr","safest","más segura")`.
  - Le `more`-card → `onShowMap()` (« toutes sur la carte »).
- Cartes construites en `createElement` (cf. `buildCard` proto l.306-341), jamais innerHTML.

### Étape 2 — Câbler les VRAIES données (remplacer le `CLEAN` mock du proto)
- Le composant reçoit en props la liste déjà rankée+filtrée (calculée dans le monolithe avec `rankBeaches`, voir étape 4) : `cleanBeaches = rankBeaches(allBeaches, island, userPos, sargData, communityReports).filter(b=>b.status==='clean').slice(0,8)`.
- Mapping carte ← champ réel (PAS de valeur inventée) :
  - `name` ← `b.name` ; `commune` ← `b.commune` ; `score` ← `b.score` (0-100, source `scores[id].score`) ; `afai` ← `b.afai` ; `kids` ← `b.kids`.
  - distance : `GEO` (`userPos!=null`) → `b._dist.toFixed(0)+" km"` (haversine réel via rankBeaches) ; sinon fallback HONNÊTE `b.drive+" min"` (champ data) ; jamais inventer.
  - `conf` ← `b._conf` (= `weekly[id].forecast[0].confidence`, défaut 60).
  - `seed` ← hash stable de `b.id` (déterministe, pas Math.random) pour la vignette.
  - freshness ← `sargData.updatedAt` (ISO réel) → `fmtFreshness` : `<12h` libellé live, sinon « vérification en cours ».

### Étape 3 — Conversion (porte UNIQUE) + capture email (levier #1)
- Clic carte → `onOpenBeach(b)` = `setSelectedBeach(b)` (ouvre la fiche NEAR) + `track("sg_beach_open",{beach_id:b.id,status:b.status,source:"clean_list"})`. **Aucune nouvelle porte** : la conversion reste `openPremium(source)` depuis la fiche.
- Une seule surface de capture email IN-SCÈNE à l'aha-moment (sous le rail, single-field, doctrine `no-ui-in-ui` → intégrée dans le bandeau de scène, pas une popup) : « Te prévenir si **<meilleure plage>** se salit ? » → champ email → `track("sg_email_capture_show",{source:"clean_list"})` / `sg_email_capture_submit`. Réutiliser le composant/flow email existant (NE PAS recréer un endpoint) ; si l'aha-capture générique n'est pas encore shippé, gater cette sous-brique derrière `?clean_capture=1` et livrer la liste d'abord.
- `more`-card / lien « toutes sur la carte » → `onShowMap()` (revient à la carte, jamais cul-de-sac).

### Étape 4 — Routage + mount A/B dans `Sargasses_PROD.jsx` (ADDITIF, control intact)
- Détecteur de surface (près de `getLang` l.66 ou des autres détecteurs l.10393-10418), additif :
  ```js
  const CLEAN_LIST_PATHS=/^\/(?:plages-sans-sargasses|en\/best-beaches-no-sargassum|es\/mejores-playas-sin-sargazo)\/?$/
  const isCleanListPath=()=>{try{return CLEAN_LIST_PATHS.test(window.location.pathname)}catch(_){return false}}
  ```
  (USD : ajouter les slugs region-config quand la page existe pour la région — voir SEO.)
- Override QA capté au module-load (modèle `LF_OVERRIDE` l.7796-7799 / `home_az` l.10446) :
  ```js
  const CLEANLIST_OVERRIDE=(()=>{try{const q=window.location.search;
    if(/[?&]clean_list=1/.test(q))return true;if(/[?&]clean_list=0/.test(q))return false;return null}catch(_){return null}})()
  ```
- State : `const[cleanList]=useState(()=>{ if(!isCleanListPath())return false; if(CLEANLIST_OVERRIDE!=null)return CLEANLIST_OVERRIDE; return abVariant("clean_list",["control","scene"],[.5,.5])==="scene" })`.
  - **control** (50 %) = comportement ACTUEL (app/carte générique sur cette URL) → zéro régression, mesure la baseline.
  - **scene** (50 %) = la nouvelle vue `CleanList` plein-écran.
- Lazy-load comme HomeAZ : `const LazyCleanList=lazyWithRetry(()=>import("./src/CleanList"))` (à côté de `LazyHomeAZ` l.32).
- Mount : dans le rendu, AVANT le bloc carte/Archipel, gater sur `cleanList && allBeaches?.length>=1`, mêmes hooks que HomeAZ (l.11075-11100) :
  ```jsx
  {cleanList&&allBeaches?.length ? (
    <ErrBound><Suspense fallback={null}>
      <LazyCleanList lang={lang} island={island} sargData={sargData} userPos={userPos}
        cleanBeaches={rankBeaches(allBeaches,island,userPos,sargData,communityReports).filter(b=>b.status==="clean").slice(0,8)}
        track={track}
        onOpenBeach={b=>{setSelectedBeach(b);fireWipe(_t(lang,"Score 0-100 · mis à jour 4×/jour",...));track("sg_beach_open",{beach_id:b.id,status:b.status,source:"clean_list"})}}
        onShowMap={()=>{/* laisse tomber la vue clean-list, montre la carte */}}
        onPremium={src=>openPremium(src||"clean_list")} />
    </Suspense></ErrBound>
  ) : (/* …rendu existant inchangé… */)}
  ```
- Empêcher l'auto-Archipel d'écraser la vue : ajouter `cleanList` à la garde l.10421-10426 (`if(...||cleanList)return`) et à la garde `showHero`-like si besoin.
- **Cas liste vide** (aucune clean du jour — saison haute) : NE PAS afficher une page vide. Veilleur serein + message honnête `_t("Aucune plage 100% propre aujourd'hui — voici les moins touchées","No fully clean beach today — here are the least affected","Ninguna playa 100% limpia hoy — aquí las menos afectadas")` + bascule sur `rankBeaches(...).slice(0,5)` (moderate inclus) avec badge statut réel par carte (`statusShort` l.8503). Honnêteté > promesse fausse.

### Étape 5 — Noscript éditorial DYNAMIQUE-au-build (SEO crawl)
- Dans `vite.config.js`, remplacer la chaîne figée `editorialContent['plages-sans-sargasses']` (l.432) par une **fonction qui lit la data du build** :
  - Charger `public/api/copernicus/sargassum.json` (déjà sur disque au build) → pour chaque île, lister les `levels[]` avec `status==='clean'` triées par `score` desc, rendre une `<ul>` de `<a href="/plages/<slug>/">Nom — commune</a> · propre · score N/100`.
  - Garder l'intro + le maillage interne existant (liens `/carte-sargasses/`, `/previsions/`, `/alertes/`).
  - Honnêteté : préfixer « État du <date build> » et ajouter « Vérifiez la carte en temps réel avant de partir » (l'app live est la source de vérité ; le noscript est un instantané daté du dernier build, ~4×/j).
  - `slug=nom=SEO` : utiliser `slugify(b.name)` (déjà importé, cf. l.481) — ne JAMAIS forger un slug ad hoc.
- Variante GP : le pipeline `rewriteCrossIsland` (l.483-494) + le swap Martinique→Guadeloupe (l.554-570) reste valable ; lister les clean de l'île GP dans le miroir `_gp/`.

---

## A/B

- **Flag : `clean_list`**, variants `["control","scene"]`, poids `[.5,.5]` (surface neuve, on veut une mesure rapide ; relire poids après 28 j via `ab-eval.cjs`).
- **Override QA** : `?clean_list=1` force la scène, `?clean_list=0` force le control (capté au module-load, cf. `CLEANLIST_OVERRIDE`, modèle `home_az`/`lf`).
- **Ce que voit le control** : EXACTEMENT le rendu actuel sur `/plages-sans-sargasses/` (app/carte générique, cohort nav_world → Archipel). Zéro changement de code dans la branche control → baseline propre.
- Le noscript (étape 5) est servi aux DEUX bras (c'est du SEO, pas du runtime) — il ne fait pas partie de l'A/B.
- Tracking : événements `sg_*` identiques (`sg_beach_open` avec `source:"clean_list"`, `sg_premium_modal_open` via `openPremium`, `sg_email_capture_*`). `abVariant` injecte `ab_clean_list` dans tous les events (track l.1448-1450) → segmentation gratuite.

---

## Données réelles à brancher (honnêteté)

| Champ carte | Source JSON réelle | Garde honnêteté |
|---|---|---|
| statut clean | `levels[id].status==='clean'` (runtime: `b.status`) | filtre strict ; si 0 clean → mode « moins touchées » daté, jamais page vide |
| score 0-100 | `scores[id].score` / `levels[id].score` (`b.score`) | jamais arrondi mensonger |
| afai (vignette eau nette) | `levels[id].afai` (`b.afai`) | informe le visuel, pas affiché comme promesse |
| distance | haversine `userPos`↔`b.lat/lng` (`b._dist` via rankBeaches) | si pas de géoloc → fallback `b.drive` min (data), libellé « env. » |
| fiabilité % | `weekly[id].forecast[0].confidence` (`b._conf`) | la VRAIE confiance, pas un chiffre marketing |
| freshness | `sargData.updatedAt` (ISO) | `<12h` → « EN DIRECT il y a Nh » ; sinon « vérification en cours » (kill-switch fausse fraîcheur, cf. feedback_data_reliability) |
| forecast (re-teinte/tendance) | `weekly[id].forecast[]` `.status/.regime` | brancher UNIQUEMENT là-dessus ; JAMAIS de cleanFloor atlantique (feedback_forecast_floor_ban) |

- Aucune valeur inventée : si un champ manque (`b.score==null`), masquer l'élément, pas de placeholder fictif.
- Le Veilleur regarde la MER et DÉSIGNE l'alternative (`_pointBeam`), ne fixe jamais l'utilisateur (proto déjà conforme).

---

## SEO (si page)

- **Slugs (inchangés, déjà indexés — NE PAS renommer)** : FR `/plages-sans-sargasses/`, EN `/en/best-beaches-no-sargassum/`, ES `/es/mejores-playas-sin-sargazo/`. Déclarés `vite.config.js` l.406 / l.612 / l.661.
- **title/meta/canonical/hreflang/og** : pipeline existant (l.501-513 FR, `setAltCluster` l.603-607 EN/ES) — NE PAS toucher la mécanique, juste actualiser title/desc si besoin (garder « aujourd'hui » / « today » / « hoy » pour l'intent temps-réel). Canonical self, hreflang réciproque fr↔en↔es déjà câblé.
- **Maillage interne** : conserver dans le noscript les liens `/carte-sargasses/`, `/previsions/`, `/alertes/`, `/meilleures-plages-<region>-sargasses/`, et liens fiches `/plages/<slug>/` (via `slugify`, rewriteCrossIsland gère les cross-île).
- **Ne pas casser l'indexation** : le noscript reste présent et non vide ; JSON-LD Article (l.517) conservé ; `dateModified` = date build. La vue React (A/B scene) est servie au-DESSUS du même HTML → le crawler voit le noscript, l'utilisateur voit la scène. Pas de redirection, pas de changement d'URL, pas de 301.
- **USD/`today`** : créer la parité quand la région USD a sa page clean-list (region-config + slug local « clean-beaches-today »/« playas-limpias-hoy ») — mêmes title/canonical/hreflang générés par le même pipeline. Hors-scope si la page USD n'existe pas encore ; ne pas inventer de slug sans 301.
- Sitemap l.723 (priority 0.8 weekly) inchangé.

---

## Vérification (commandes concrètes)

```bash
# 0) syntaxe JSX du nouveau composant + du monolithe modifié (AVANT tout)
node -e "require('esbuild').transform(require('fs').readFileSync('src/CleanList.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('CleanList OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('PROD OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"

# 1) proto isolé (design de référence) — serveur local (app preview TIMEOUT, cf. REFONTE §3)
python -m http.server 8790 --bind 127.0.0.1   # background
# Playwright (script .cjs DANS le repo) : navigate http://127.0.0.1:8790/design/proto-planb-clean-nearby.html
#   waitForTimeout(1000) ; capter pageerror + console.error ; screenshot ; Read le png ; scroll/click ; toggler reduced-motion (bouton #dRM) ; vérifier 1 seul rAF, Veilleur ne fixe pas l'user

# 2) build complet (intègre vite.config + génère le noscript dynamique)
npm run build   # attendre "built in", vérifier chunk + 136 pages + 0 erreur

# 3) vérifier le HTML généré : noscript = liste DU JOUR (pas figée) + canonical/hreflang corrects
#   ouvrir dist/plages-sans-sargasses/index.html et dist/_gp/plages-sans-sargasses/index.html
#   (Read le fichier ; confirmer <ul> de plages clean réelles + "État du <date>" + liens /plages/<slug>/)

# 4) vue React live des 3 langues, scene + control
python -m http.server 8790 --bind 127.0.0.1   # sert dist/
# Playwright :
#   http://127.0.0.1:8790/plages-sans-sargasses/?clean_list=1   → scène golden-hour + rail clean réel
#   http://127.0.0.1:8790/plages-sans-sargasses/?clean_list=0   → control identique à l'app actuelle
#   http://127.0.0.1:8790/en/best-beaches-no-sargassum/?clean_list=1  (EN)
#   http://127.0.0.1:8790/es/mejores-playas-sin-sargazo/?clean_list=1 (ES)
#   pour chaque : screenshot + Read png (JUGER à la barre HomeAZ), cliquer une carte → fiche s'ouvre,
#   vérifier sg_beach_open(source:clean_list) en console, tester cas liste vide (forcer 0 clean en QA)
```
JUGER soi-même chaque capture. Si moche/illisible/Veilleur inquiétant → corriger AVANT ship. Smoke EUR : rebuild MQ d'abord.

---

## Garde-fous spécifiques

- **Control = octet pour octet l'app actuelle** sur cette URL ; ne JAMAIS modifier la branche control (3e bras seulement).
- **Conversion = `openPremium(source)` UNIQUE** depuis la fiche ; la clean-list n'ouvre PAS le paywall directement (sauf via la fiche). Pas de nouvelle porte de paiement. `stripe-config.php` jamais touché.
- **Zéro image IA** : vignettes = `thumbSVG(seed)` aplats marque seedés (déterministe par `b.id`, pas `Math.random`). Doctrine calme : repos = tableau, 1 seul rAF, pause `visibilitychange`, `prefers-reduced-motion` = early-return AVANT rAF (proto déjà conforme l.407-415).
- **Le Veilleur = 1 satellite, rassure ≠ surveille** : regarde la mer, désigne l'alternative ; jamais l'œil-HAL sur l'utilisateur.
- **Honnêteté data** : fausse fraîcheur interdite (`<12h` sinon « vérification en cours ») ; jamais de plage inventée ; liste vide → mode « moins touchées » daté, jamais page blanche ; JAMAIS de cleanFloor atlantique — re-teinte/tendance sur `forecast[].status/regime` seulement.
- **SEO** : slug=nom, aucune page sans 301, noscript jamais vide, hreflang réciproque intact ; ne pas dériver le pipeline de génération (réutiliser l.495-573).
- **DOM sûr** : Shadow DOM + `textContent`/`createElement`/`createContextualFragment`, JAMAIS `innerHTML` (hook sécurité bloque).
- **Git/deploy** : `git pull --rebase` avant push ; jamais `git add -A` (fichier par fichier) ; bump `public/sw.js` `CACHE_NAME`; Shabbat ven 18h→sam 19h = no-deploy.
- **Anti agent-slop** : le proto se re-vérifie au navigateur ; s'il ne passe pas la barre HomeAZ, le refaire à la main avant port.
