# Stations éducatives (5 pages SEO) — spec d'exécution

> Surfaces ciblées : `/comprendre-sargasses/`, `/detection-satellite-sargasses/`, `/danger-sargasses-h2s/`, `/nettoyer-sargasses/`, `/methode-carte/`.
> (Le brief disait `/comprendre /detection-satellite /danger-h2s /nettoyer /methode-carte` — ce sont des **raccourcis**. Les **vrais slugs** générés + indexés sont ci-dessus. `slug=nom=SEO` : **NE PAS renommer**, on garde les slugs existants. Les bare-slugs `/comprendre`, `/detection-satellite`, `/danger-h2s`, `/nettoyer` n'existent PAS et n'ont PAS de page ; ne pas les créer.)
> Bar de qualité : `src/HomeAZ.jsx` (golden-hour, StoryEngine sticky). Cadence : proto → build monolithe → vérif navigateur → ship A/B réversible → push.

---

## État actuel

**Les 5 pages existent déjà et sont indexées.** Elles sont générées au build par `vite.config.js` (plugin de post-build, boucle `for (const { path: p, ... } of pages)` à **`vite.config.js:495`**) :

- **Déclarations `pages[]`** (titre + meta + hreflang) :
  - `comprendre-sargasses` → `vite.config.js:411` (a `enPath:'en/understanding-sargassum'`)
  - `detection-satellite-sargasses` → `vite.config.js:413` (a `enPath:'en/satellite-sargassum-detection'`)
  - `danger-sargasses-h2s` → `vite.config.js:409` (`enPath:null`)
  - `nettoyer-sargasses` → `vite.config.js:415` (`enPath:null`)
  - `methode-carte` → `vite.config.js:420` (`enPath:null`)
  - Connexes (mêmes briques) : `previsions-methode:414`, `bilan-sargasses-2025:412`.
- **Contenu SEO `noscript`** (`editorialContent[p]`, injecté en `<noscript>` avant `</body>` à `vite.config.js:527`) : chacune des 5 a son `<article>` :
  - `comprendre-sargasses` → `vite.config.js:435`
  - `detection-satellite-sargasses` → `:437`
  - `danger-sargasses-h2s` → `:433`
  - `nettoyer-sargasses` → `:439`
  - `methode-carte` → `:446`
- **Schema** : Article JSON-LD ajouté pour toute page ayant `editorialContent[p]` (`vite.config.js:514-526`), datePublished `2026-03-01`, dateModified = date du build. FAQPage seulement pour `faq`/`meteo-*` (`faqSchemas`, `:453`).
- **Variante GP** : la même page est ré-ancrée vers `sargasses-guadeloupe.com` (canonical/og/hreflang + swap visible « Martinique »→« Guadeloupe ») et écrite dans `dist/_gp/{p}/` (`vite.config.js:536-570`), overlay par `scripts/prepare-ftp.cjs`.
- **htaccess** : redirige les bare-slugs `^(...|comprendre-sargasses|...|detection-satellite-sargasses|previsions-methode|nettoyer-sargasses|...)$` vers `/$1/` (trailing-slash 301) à **`public/.htaccess:304`**. `/methode-carte/` confirmée vraie page éditoriale (commentaire `public/.htaccess:106`, commit `067a0611` a "unmasked" `/methode-carte/`).

**Ce qui marche aujourd'hui :**
- SEO solide : title/meta/canonical/hreflang/Article-schema/noscript propres et différenciés. C'est la couche qui se classe — **ne pas la casser.**
- La page **se charge** : elle sert le shell SPA (`Sargasses_PROD.jsx`) → l'utilisateur atterrit sur la **carte** (`view==="map"` par défaut, `Sargasses_PROD.jsx:10529` ne matche que `/plages|beaches|playas/`). Donc un visiteur SEO d'une station voit la carte, pas un contenu éducatif visuel — **le `<noscript>` n'est lu QUE par les crawlers**, l'humain JS ne le voit jamais.

**Ce qui manque (le vrai trou) :**
1. **Aucun rendu visuel "station" à la barre HomeAZ.** Le moteur existe (`StoryEngine`, `Sargasses_PROD.jsx:620`) et une config éducative existe (`discoveryBeats`, `:753`, 4 beats : ceinture→dérive→H2S→solutions) rendue par `DiscoveryStory` (`:766`). Mais `DiscoveryStory` n'est **monté que via** :
   - le flag QA `?decouverte=1` (`Sargasses_PROD.jsx:10401`),
   - le FAB 🛰️ flottant (`Sargasses_PROD.jsx:11372-11378`).
   → **Aucune des 5 URLs SEO n'ouvre le StoryEngine.** Un visiteur de `/detection-satellite-sargasses/` tombe sur la carte, jamais sur la story satellite.
2. **`discoveryBeats` est générique** (1 seule story "tout-en-un"). Il n'y a PAS de config par station (pas de `satelliteBeats`, `h2sBeats`, `cleanupBeats`, `methodeBeats`). Les 5 pages devraient mapper sur 5 angles distincts.
3. **Cul-de-sac** (`feedback` cité dans REFONTE-MASTER §4B-8) : la story finit par un CTA `onShowMap` qui fait juste `setShowDiscovery(false)` (`Sargasses_PROD.jsx:11379`) → retombe sur la carte sans flyTo ciblé ni ouverture paywall. Les anciens gates `?decouverte`/`?solutions` sont "morts" comme destinations.
4. **`LearnView`** (`Sargasses_PROD.jsx:2219`) est une **vieille page éducative fond clair** (`#FDFCF7`), hors-barre golden-hour, atteignable par `view==="learn"` (`:11322`) — vestige. Aucune des 5 stations ne l'utilise et elle n'est pas à la barre. (Ne pas l'étendre ; la laisser comme fallback control jusqu'à dépose ultérieure.)

---

## Objectif (barre HomeAZ + KPI visé)

Faire des 5 URLs SEO des **stations narratives golden-hour à la barre HomeAZ** (StoryEngine sticky, Le Veilleur serein, scène SVG propriétaire, zéro image IA, doctrine calme), **qui finissent toutes en `flyTo` / action de conversion** (jamais cul-de-sac).

- **KPI primaire** : transformer le trafic SEO éducatif (aujourd'hui = bounce sur carte) en **flux vers la valeur** → mesurer `sg_station_cta` → `sg_premium_modal_open` et `sg_station_to_map`/`sg_beach_open(source:"station")`. Attaque directe le **goulot modal→CTA 2 %** en amenant un public déjà "réchauffé" (il a compris le risque H2S, la fiabilité de la détection) vers le paywall contextualisé.
- **KPI secondaire** : capture email — la station `/danger-sargasses-h2s/` finit sur "sois prévenu **avant** l'arrivée" → demo-gate (levier #1, 0,35 %). (Le demo-gate lui-même est une autre brique B ; ici on n'ajoute que le **point d'accroche** + l'event ; pas de reconstruction du gate.)
- **Non-régression** : la couche SEO (`<noscript>`, schema, hreflang) reste intacte ; l'indexation (MQ ~3/30, GP ~2/30) ne doit PAS bouger défavorablement.

---

## Changements exacts (étape par étape)

Tout est **ADDITIF + A/B**. Le control = comportement actuel (page sert la carte). Le variant `stations` = la page détecte son slug et **auto-monte le StoryEngine de la station** par-dessus, en plein écran, escapable.

### Étape 1 — 5 configs de beats (réutiliser le pattern `discoveryBeats`)

Dans `Sargasses_PROD.jsx`, juste après `discoveryBeats` (`:765`), ajouter 5 fonctions `*Beats(lang, ctx)` au même format (chaque beat = `{eyebrow,heading,sub,scene,cta?}`, `scene` = fragment SVG en viewBox `0 0 800 600` slice). **Réutiliser les fragments SVG déjà écrits** plutôt que d'en réinventer :

| Station (slug) | Config | Angle (3-4 beats) | Assets SVG à réutiliser |
|---|---|---|---|
| `comprendre-sargasses` | `comprendreBeats` | source (ceinture 8000 km) → dérive (vent décide) → échouage/risque → "ta plage aujourd'hui" | **= `discoveryBeats` quasi tel quel** (`:753-764`). Réemployer ses 4 `scene`. |
| `detection-satellite-sargasses` | `satelliteBeats` | "on regarde d'en haut" (Le Veilleur-satellite, `design/proto-veilleur-clip-v2.html`) → l'indice AFAI (mer + nappe + scan-line) → résolution/3h (grille pixels 300 m) → "ce que TA plage voit aujourd'hui" | beat scan satellite déjà mentionné dans REFONTE-MASTER §3 ("scan satellite") ; **Veilleur v2** = `design/proto-veilleur-clip-v2.html` (1 objet, œil mi-clos). Scan-line = pattern `proto-map-v2.html` (sun/glint) + dérive de `discoveryBeats` beat2 (`:758`). |
| `danger-sargasses-h2s` | `h2sBeats` | "ça pourrit, ça pique" (H2S bulles violettes, `:760`) → qui est à risque (asthme/bébés/âgés) → seuils + "aère/ferme" → **"sois prévenu AVANT"** (capture) | beat H2S de `discoveryBeats` (`:760-761`, bulles `#CC28FF`, texte `H₂S`). Greffer le **badge H2S** déjà shippé (`pw_h2s`, voir REFONTE-EXECUTION : `pw_h2s` live). |
| `nettoyer-sargasses` | `nettoyerBeats` | l'échouage → barrer (barrage flottant) → récolter (engin de tri) → recycler/valoriser → "agir / suivre ta plage" | **`SolSortScene`** (`:804`, convoyeur+3 bacs cliquables) et **`SolTransformScene`** (`:780`, 5 ressources cliquables) existent déjà — les utiliser comme `scene` de 2 beats. + beat barrage de `discoveryBeats` (`:763`). |
| `methode-carte` | `methodeBeats` | "d'où vient la couleur ?" (satellite) → on croise (signalements terrain) → on prévoit (persistance/J+7) → fiabilité par régime → "voir la carte" | scan de `satelliteBeats` + **carte** = aperçu `design/proto-map-v2.html` (île golden-hour, pins halo `.pinhalo`). Branche fiabilité : `reliability-data.cjs` (déjà source unique, voir mémoire `project_reliability_badge`). |

Règles de contenu (HONNÊTETÉ — REFONTE-EXECUTION §6) :
- Reprendre la copie FR/EN/ES du `<noscript>` correspondant (`vite.config.js:433-446`) pour rester cohérent SEO/visuel. Helper `T=(fr,en,es)=>_t(lang,fr,en,es)` comme dans `discoveryBeats:754`.
- Le Veilleur **rassure ≠ surveille** : œil mi-clos, ne fixe jamais l'utilisateur (proto-veilleur-clip-v2). Jamais d'œil-HAL.
- Doctrine calme : au repos = tableau ; animations pilotées par `--p{i}` (progression de scroll), early-return `rm` (reduced-motion) déjà géré par `StoryEngine` (`:624,629`).

### Étape 2 — composant `StationStory` (wrapper, jumeau de `DiscoveryStory`)

Ajouter après `DiscoveryStory` (`:773`) :

```jsx
// Stations éducatives SEO → StoryEngine golden-hour, finit en flyTo (anti-cul-de-sac).
const STATION_BEATS = {
  "comprendre-sargasses":      comprendreBeats,
  "detection-satellite-sargasses": satelliteBeats,
  "danger-sargasses-h2s":      h2sBeats,
  "nettoyer-sargasses":        nettoyerBeats,
  "methode-carte":             methodeBeats,
  // EN equivalents -> même config (le lang vient de getLang())
  "en/understanding-sargassum":      comprendreBeats,
  "en/satellite-sargassum-detection": satelliteBeats,
}
function StationStory({slug,lang,onExit,onCTA}){
  const beatsFn = STATION_BEATS[slug] || discoveryBeats
  const accent = slug==="danger-sargasses-h2s" ? "#CC28FF" : slug==="nettoyer-sargasses" ? "#5FD3C9" : "#FFC72C"
  return(
    <div role="dialog" aria-label={slug} style={{/* copie EXACTE du wrapper DiscoveryStory:768 */}}>
      <button onClick={onExit} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{/* = :769 */}}>✕</button>
      <StoryEngine beats={beatsFn(lang)} lang={lang} accent={accent}
        ev="sg_station_beat" onCTA={onCTA}
        onBeat={(b,n)=>{try{track("sg_station_beat",{slug,b:b+1,n})}catch(_){}}}/>
    </div>
  )
}
```

Notes :
- **Réutiliser le wrapper de `DiscoveryStory:768`** (overlay `position:absolute;inset:0;zIndex:1060;background:#0A1714;overflowY:auto;overscrollBehavior:contain`) à l'identique — il est déjà vérifié.
- Pas de Shadow DOM ici (le StoryEngine est du JSX/SVG inline, pas du CSS à classes génériques comme HomeAZ ; il vit déjà dans l'app prod via DiscoveryStory). Donc PAS de `LazyHomeAZ`-style ; rendu direct.
- Le dernier beat de chaque `*Beats` porte `cta` → bouton rendu par `StoryEngine` (`:674`).

### Étape 3 — câblage route → ouverture (le cœur)

Dans le composant App (où vivent `showDiscovery` etc., autour de `Sargasses_PROD.jsx:10401`), ajouter :

```js
// A/B stations : sur une URL de station, le variant ouvre le StoryEngine golden-hour.
const stationSlug = (()=>{try{
  const seg = window.location.pathname.replace(/^\/|\/$/g,"")   // "detection-satellite-sargasses" ou "en/satellite-sargassum-detection"
  return STATION_BEATS[seg] ? seg : null
}catch(_){return null}})()
const stationOn = (()=>{try{
  if(!stationSlug) return false
  const q=window.location.search
  if(/[?&]stations=1/.test(q)) return true
  if(/[?&]stations=0/.test(q)) return false
  return abVariant("stations",["control","story"],[.5,.5])==="story"
}catch(_){return false}})()
const [showStation,setShowStation] = useState(()=>stationOn)
```

Puis dans le JSX (près de `showDiscovery&&<DiscoveryStory.../>` à `:11379`), monter :

```jsx
{showStation && stationSlug && (
  <StationStory slug={stationSlug} lang={lang}
    onExit={()=>{ setShowStation(false); track("sg_station_exit",{slug:stationSlug}) }}
    onCTA={()=>{
      track("sg_station_cta",{slug:stationSlug})
      setShowStation(false)
      // ANTI-CUL-DE-SAC — destination par station (le "finir en flyTo") :
      if(stationSlug==="danger-sargasses-h2s"){ openPremium("station_h2s") }
      else if(stationSlug==="nettoyer-sargasses"){ setShowSolutions(true) }   // existant :11389
      else { setView("map") }   // comprendre / satellite / methode-carte → la carte (FAR)
    }}/>
)}
```

- **Pourquoi pas de redirect / pas de nouvelle route** : la page SEO reste **la même URL** (canonical inchangé) ; on **superpose** le StoryEngine au-dessus du shell. Le `<noscript>` SEO reste servi. Zéro impact crawl.
- **`flyTo` concret** : il n'y a pas (encore) de primitive `flyTo(slug)` exposée hors carte. La sortie minimale honnête = `setView("map")` (FAR) pour comprendre/satellite/methode, `openPremium("station_h2s")` pour H2S, `setShowSolutions(true)` pour nettoyer. Quand `map_world` (carte interactive) sera live, remplacer `setView("map")` par un `flyTo` réel vers une plage propre proche (réutiliser le futur API map). **Marqueur TODO à laisser dans le code** : `// TODO map_world: flyTo(nearestCleanBeach)`.

### Étape 4 — entrée croisée (maillage in-app, optionnel même tick)

Le FAB 🛰️ (`:11372`) ouvre toujours `DiscoveryStory` (= `comprendreBeats`). Laisser tel quel (control). Ne PAS multiplier les FABs (doctrine UI simple). Le maillage entre stations se fait par le **noscript / liens éditoriaux** (déjà présents) + le CTA de fin.

---

## A/B

- **Flag** : `stations`. `abVariant("stations",["control","story"],[.5,.5])`.
- **Override QA** : `?stations=1` (force story) / `?stations=0` (force control). Lu uniquement quand l'URL **est** une station (`stationSlug!==null`), sinon no-op.
- **Control voit** : exactement l'actuel — la page sert le shell, atterrit sur la carte (`view==="map"`), `<noscript>` SEO inchangé. Aucun StoryEngine monté.
- **Variant `story` voit** : par-dessus le shell, le `StationStory` plein écran golden-hour (escapable par ✕ → revient à la carte sous-jacente, jamais bloqué), qui finit par un CTA vers map / premium / solutions.
- **Events** : `sg_station_beat{slug,b,n}`, `sg_station_cta{slug}`, `sg_station_exit{slug}`. (Nouveaux events mais format `sg_*` cohérent ; le funnel existant n'est PAS modifié — `openPremium` garde son tracking `sg_premium_modal_open`.)
- **Éval** : `node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script (REFONTE-EXECUTION §8). Goût = A/B live, jamais validation fondateur.

---

## Données réelles à brancher

Les stations sont **éducatives** (faits stables) → l'essentiel du contenu est statique/honnête (repris du `<noscript>`). Brancher du live UNIQUEMENT là où c'est vrai et vérifiable :

- **`methode-carte` (beat fiabilité)** : afficher le hit-rate **par régime** depuis la source unique `reliability-data.cjs` (mémoire `project_reliability_badge` : 79 % saison calme / 76 % saison haute, échantillon affiché). Jamais l'accuracy par direction (self-harm). Si l'échantillon n'est pas chargé → libellé "calibration en cours", pas de chiffre inventé.
- **`detection-satellite` (beat "ta plage aujourd'hui")** : le CTA peut teaser le verdict réel via `sargData.weekly[id].forecast[0].status` (champs réels vérifiés : `{day,date,afai,status,confidence,type,regime,sources}` dans `public/api/copernicus/sargassum.json`). **Freshness** : n'afficher "EN DIRECT / vérifié <heure>" que si `(Date.now()-new Date(sargData.updatedAt))/3.6e6 < 12` ; sinon "vérification en cours" (kill-switch fraîcheur, REFONTE-MASTER §4B-5). Réutiliser `formatFreshness(updatedAt,lang)` (déjà dans le monolithe, cf. `:10031`).
- **`danger-sargasses-h2s`** : pas de chiffre H2S temps-réel inventé. Si le pipeline H2S (`h2s.cjs`, commit `1d978b6c`, cf. REFONTE-MASTER §4A-4) expose un indice par plage, le brancher en lecture seule ; sinon rester sur les faits (seuils génériques, populations à risque). **Jamais** de `cleanFloor` atlantique ; toute re-teinte mer se branche sur `forecast[].status/regime` uniquement (`feedback_forecast_floor_ban`).
- Toutes les autres scènes (ceinture, dérive, barrage, tri, recyclage) = illustratives, pas de fake data.

---

## SEO (si page)

**Les 5 sont des pages → ne RIEN casser. La couche SEO reste 100 % côté `vite.config.js` ; le variant JS est invisible aux crawlers (ils lisent le `<noscript>`).**

- **Slugs** : INCHANGÉS (`slug=nom=SEO`). `comprendre-sargasses`, `detection-satellite-sargasses`, `danger-sargasses-h2s`, `nettoyer-sargasses`, `methode-carte`. Ne créer aucun nouveau slug, ne renommer aucun.
- **title / meta / canonical / hreflang** : tels quels (`vite.config.js:411,413,409,415,420` + boucle `:502-513`). `comprendre`/`detection` ont des `en/*` ; les 3 autres n'ont pas d'EN/ES (laisser `null` — ne PAS ajouter de hreflang vers une page inexistante, leçon `:506-509`).
- **noscript éditorial + Article schema** : intacts (`:514-527`). Si on enrichit la copie d'un beat, **resync** la prose dans le `<noscript>` correspondant pour cohérence (même message crawler/humain), sans casser le HTML.
- **dateModified** : déjà = date du build (`:516`) → fraîcheur SEO automatique.
- **Maillage interne** : les `<article>` éditoriaux se lient déjà entre eux et vers `/`, `/previsions/`, `/alertes/`, `/danger-sargasses-h2s/`, `/meilleures-plages-*` (voir `:450` pour le pattern). Ne pas dégrader ; le CTA de fin de story (map/premium/solutions) renforce le maillage UX sans toucher au HTML crawlé.
- **GP** : le mirror `dist/_gp/{p}/` (`:536-570`) reste valide tel quel ; le variant JS s'active aussi sur GP (le slug est identique, le contenu swap MQ→GP est purement SEO/texte).
- **Indexation** : ne pas toucher `<head>` ni `<noscript>` côté build → MQ/GP gaps inchangés. (La tâche canonical/hreflang globale `task_d48a64ca` reste séparée et BLOQUANTE pour le pageShell — ici on ne touche pas le shell.)

---

## Vérification

```bash
# 0) syntaxe JSX du monolithe APRÈS edits (obligatoire avant tout) :
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('JSX OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"

# 1) serveur local (l'app preview TIMEOUT — rAF continu — donc serveur + Playwright) :
python -m http.server 8790 --bind 127.0.0.1   # en background, depuis le repo

# 2) Vérif PROTO golden-hour (avant port) : script .cjs DANS le repo (sinon "Cannot find module playwright")
#    navigate http://127.0.0.1:8790/design/proto-veilleur-clip-v2.html  (Veilleur)
#    navigate http://127.0.0.1:8790/design/proto-map-v2.html            (carte/pins, source des scènes)
#    waitForTimeout(1000) ; capter pageerror + console.error ; screenshot ; Read le png ; JUGER à la barre HomeAZ.

# 3) smoke build complet (intègre les 5 pages + le variant) :
npm run build   # attendre "built in", vérifier 136+ pages, chunk, 0 erreur
#    après build, confirmer que les 5 noscript existent toujours :
node -e "const fs=require('fs');for(const p of ['comprendre-sargasses','detection-satellite-sargasses','danger-sargasses-h2s','nettoyer-sargasses','methode-carte']){const h=fs.readFileSync('dist/'+p+'/index.html','utf8');console.log(p, /<noscript>/.test(h)?'noscript OK':'NOSCRIPT MISSING', /rel=\"canonical\" href=\"https:\/\/sargasses-martinique.com\/'+p+'\//.test(h)?'canonical OK':'CANON ?')}"

# 4) Vérif RUNTIME du variant (après build, sur le bundle servi) — Playwright .cjs :
#    a) control : navigate http://127.0.0.1:8790/dist/detection-satellite-sargasses/?stations=0
#       -> doit atterrir sur la carte, AUCUN role=dialog station. screenshot.
#    b) variant : navigate .../detection-satellite-sargasses/?stations=1
#       -> role=dialog présent ; scroller (window.scrollTo / wheel) ; vérifier que les beats changent
#          (track sg_station_beat) ; arriver au dernier beat ; cliquer le CTA ; vérifier la destination
#          (setView map / openPremium / showSolutions). screenshot à 2-3 profondeurs de scroll.
#    c) reduced-motion : émuler prefers-reduced-motion:reduce -> StoryEngine doit montrer le DERNIER beat
#       statique (early-return, Sargasses_PROD.jsx:629), pas d'anim. screenshot.
#    Répéter (b) pour les 4 autres slugs ; vérifier l'accent (#CC28FF pour h2s) et le CTA propre à chacun.

# 5) honnêteté freshness (detection-satellite teaser) :
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const h=(Date.now()-new Date(d.updatedAt))/3.6e6;console.log('age',h.toFixed(1)+'h ->', h<12?'EN DIRECT autorisé':'doit afficher vérification en cours')"
```

**JUGER soi-même chaque capture à la barre HomeAZ** (golden-hour, Veilleur serein, calme au repos). Si moche/illisible/Veilleur-flippant → corriger AVANT ship.

---

## Garde-fous spécifiques

- **NE PAS toucher la couche SEO `vite.config.js`** (titres/meta/canonical/hreflang/noscript/schema) sauf resync de prose volontaire. Le variant est 100 % JS additif au-dessus du shell.
- **NE PAS créer de nouvelles routes / nouveaux slugs / nouveaux redirects.** Les 5 URLs existent et sont indexées. `slug=nom=SEO`.
- **Additif strict** : `control` = comportement actuel inchangé. `?stations=0` doit restituer exactement l'ancien parcours (carte). Aucun chemin où une station est pire qu'avant.
- **Anti-cul-de-sac obligatoire** : tout dernier beat a un `cta` ET la croix ✕ ramène toujours à la carte sous-jacente (escapable, jamais bloqué). Re-vérifier qu'après `onCTA`/`onExit`, l'utilisateur n'est jamais coincé sur un écran noir.
- **Le Veilleur = UN seul satellite, rassure ≠ surveille** (proto-veilleur-clip-v2). Œil mi-clos, ne fixe jamais l'utilisateur.
- **Zéro image/vidéo IA.** SVG propriétaire uniquement. Doctrine calme : repos = tableau, animations pilotées par `--p{i}`/scroll, `prefers-reduced-motion` = plancher dur (déjà géré par StoryEngine).
- **HONNÊTETÉ data** : pas de chiffre inventé ; freshness <12h sinon "vérification en cours" ; fiabilité par RÉGIME (jamais par direction) ; **jamais** de `cleanFloor` atlantique ; re-teinte mer branchée sur `forecast[].status/regime` seulement.
- **Conversion = `openPremium(source)` UNIQUE** (déjà respecté : `openPremium("station_h2s")`). Ne pas dupliquer un autre chemin de paiement. `stripe-config.php` JAMAIS touché.
- **Tracking `sg_*` cohérent** ; ne pas renommer/casser les events funnel existants (sinon récidive `funnel_tracking_gap`).
- **Réutiliser les scènes existantes** (`discoveryBeats`, `SolSortScene`, `SolTransformScene`, proto-map-v2, proto-veilleur-clip-v2) plutôt qu'en redessiner — ne pas produire d'agent-slop ; tout proto agent se vérifie au navigateur et se refait à la main s'il ne passe pas la barre.
- **Git** : `git pull --rebase` avant push ; stage fichier par fichier (jamais `git add -A`) ; bump `public/sw.js` `CACHE_NAME` à chaque deploy de code ; **Shabbat ven 18h → sam 19h : ne RIEN déployer.**
