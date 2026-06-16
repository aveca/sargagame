# /conditions/ — spec d'exécution

> Surface : hub `/conditions/` + pages d'agrégation `/conditions/<x>/` (baignade-idéale, mer-calme, mer-agitée, UV-fort, + nouvelles : enfants, snorkeling).
> Barre = HomeAZ (golden-hour, Le Veilleur serein, doctrine calme, zéro image IA).
> Réf. cadre : `design/REFONTE-EXECUTION.md` + `design/REFONTE-MASTER.md` (P2 restyle l.41 ; goulot stale /conditions l.110, 144).

---

## État actuel

**Génération** : 100 % statique, build-time, dans `vite.config.js`, plugin `seo-pages` → `closeBundle()`, bloc `// ── /conditions/* …` **lignes 1417-1563**.
- Tableau `conditionPages` (l.1423-1464) : **4 pages** — `baignade-ideale`, `mer-calme`, `mer-agitee`, `uv-fort`. Chacune = `{slug, titleMq, titleGp, h1Mq, h1Gp, intro, filter(b,w), fallback}`.
- Boucle `for (const islandCode of ['gp','mq'])` (l.1467) → 4 pages × 2 îles + 1 hub × 2 îles = **10 pages** (log l.1562). GP est écrit dans `dist/_gp/conditions/...` via `toGpMirror()` (l.383-391+) puis stampé par `prepare-ftp.cjs`.
- **Données réelles branchées au build** :
  - sargasses : `statusByIdCond` = `Object.fromEntries(SARGASSUM_REF.map(r=>[r.id,r.status]))` (l.1465). `SARGASSUM_REF` vient de `beaches-list.json` (l.74-78).
  - météo : `_weather` = `public/api/weather/beaches-weather.json` → `w.beaches` (l.793-798). Champs réels par plage (vérifiés, 172 plages) : `waveHeight, wavePeriod, sst, airTemp, windSpeed, windDir, uvMax, precip, condition` (`condition ∈ calm|moderate|rough|windy`). Freshness = `_weatherFreshness` (l.794, **non utilisé** dans le bloc conditions).
- **Rendu** : chaque page = `htmlSubpage` (shell index sans le `<noscript>` racine, l.376) avec title/desc/canonical/hreflang/og remplacés (l.1503-1518) + 2 JSON-LD (`CollectionPage` l.1499 + `BreadcrumbList` l.1500) + un **gros `<noscript>`** (l.1498) qui contient toute la liste de plages. Sitemap : `changefreq=daily`, priority 0.7 (pages) / 0.8 (hub) (l.1525, 1558).

**Ce qui marche** :
- SEO long-tail propre : titres/canonical/hreflang fr+x-default self, breadcrumb, CollectionPage, maillage interne (les 4 pages se lient entre elles + carte, l.1498). Miroir GP correct.
- Contenu unique par build (status + météo réels), liste triée par `b.drive` croissant, cap 30 plages.

**Ce qui manque / casse** :
1. **STALE = bug #1** (REFONTE-MASTER l.110, 144). Le `<noscript>` affiche `Données rafraîchies le ${today}` (l.1498) **avec la date du build, JAMAIS revalidée**. Entre 2 builds (≈1/j), une page « plages avec mer calme aujourd'hui » montre l'état d'il y a potentiellement 24 h+ — **viole la règle data honnête** (freshness réelle <12h sinon « vérification en cours »). `_weatherFreshness` existe mais n'est pas lu ici.
2. **Zéro UI quand JS est ON.** Avec JS, le SPA (`Sargasses_PROD.jsx`) monte sur `/conditions/<x>/` et affiche **la home `/`** (rien dans le code SPA ne route `/conditions/` — confirmé : `Grep "conditions"` sur le monolithe = 0 hit hors i18n). Le visiteur ne voit jamais la sélection promise par le titre Google → **bounce, zéro conversion**. C'est juste une page SEO « noscript-only ».
3. **Pas à la barre HomeAZ.** Le `<noscript>` est du HTML système nu (`font-family:system-ui`, l.1498) — aucun golden-hour, aucun Veilleur, aucun lien `openPremium`. Aucune porte de conversion (le seul CTA est vers `/carte-sargasses/`).
4. **Agrégations manquantes** demandées par le cadre : `enfants`/`kids-safe` et `snorkeling` (REFONTE-MASTER #5 l.92 « baignade / kids-safe / animaux »). Les champs existent déjà : `beaches-list.json` → `kids`, `snorkel` (lus l.777-778 dans le générateur `/plages/`). Pas exploités par `/conditions/`.
5. **Pas de flyTo carte** depuis ces pages (REFONTE-MASTER l.144 : « flyTo(FAR+filtre) sur clean-list/meilleures/conditions »).

---

## Objectif (barre HomeAZ + KPI visé)

Transformer `/conditions/<x>/` de **page SEO noscript-only** en **landing de conversion golden-hour** qui :
1. **Tient la barre HomeAZ** : ciel golden-hour + Le Veilleur serein (1 satellite, mi-clos, regarde la mer) + doctrine calme (repos = tableau, `prefers-reduced-motion` = plancher dur).
2. **Branche la vraie donnée live** (revalidée fetch à l'ouverture) → tue le STALE et la règle « vérification en cours ».
3. **Pousse vers `openPremium(source)`** et vers la carte filtrée (porte NEAR).
4. **Reste 100 % SEO-safe** : le `<noscript>` actuel ne bouge pas (indexation intacte), l'enrichissement est purement progressif (JS-only, overlay).

**KPI visés** (cf. REFONTE-EXECUTION §8) :
- nouvelle porte de conversion sur des intentions « aujourd'hui » (= demande #1 GSC). Mesure : `landing→openPremium` et `landing→map`.
- 0 page `/conditions/` stale (REFONTE-MASTER PHASE 2 l.141).
- additif : ne dégrade jamais le control (page actuelle).

---

## Changements exacts (étape par étape)

Deux chantiers indépendants et séquençables. **A = générateur (SEO + nouvelles pages + anti-stale noscript)**, **B = overlay React golden-hour (conversion)**. A peut shipper seul ; B dépend de A pour le routing.

### A · Générateur `vite.config.js` (bloc l.1417-1563)

**A1 — Marquer l'âge de la donnée dans le noscript (anti-stale honnête, micro-fix).**
Dans le bloc `pageNoscript` (l.1498), remplacer la phrase de freshness hardcodée. Calculer une fois, juste avant la boucle îles (vers l.1465) :
```js
// Freshness honnête : on N'AFFICHE PAS "aujourd'hui" si la météo a >12h.
const _wFreshMs = _weatherFreshness ? (Date.now() - new Date(_weatherFreshness).getTime()) : Infinity
const _wFreshOK = isFinite(_wFreshMs) && _wFreshMs >= 0 && _wFreshMs < 12*3600*1000
const _wFreshLabel = _wFreshOK
  ? `Données vérifiées il y a ${Math.max(1,Math.round(_wFreshMs/3.6e6))} h`
  : 'Données en cours de vérification' // jamais une fausse fraîcheur
```
Puis dans `pageNoscript` (l.1498), remplacer
`Données rafraîchies le ${today}. Sources…`
par
`${_wFreshLabel}. Sources : Copernicus Sentinel-3 (sargasses) + Open-Meteo Marine (vagues, température, UV).`
> Ne touche pas au `<title>`/desc (le mot « aujourd'hui » y reste légitime : le SEO cible l'intention ; c'est l'AFFIRMATION de fraîcheur dans le corps qu'on honnêtifie).

**A2 — Ajouter 2 pages d'agrégation `enfants` + `snorkeling`** (champs déjà présents `kids`/`snorkel`).
Étendre `conditionPages` (après l.1463, dans le tableau) :
```js
{
  slug: 'plages-enfants',
  titleMq: 'Plages sûres pour les enfants aujourd’hui — Martinique',
  titleGp: 'Plages sûres pour les enfants aujourd’hui — Guadeloupe',
  h1Mq: 'Plages adaptées aux enfants aujourd’hui en Martinique',
  h1Gp: 'Plages adaptées aux enfants aujourd’hui en Guadeloupe',
  intro: 'Plages réputées famille (eau peu profonde, faible courant) qui présentent aujourd’hui une mer calme et un état sargasses propre. Vérifiez toujours le drapeau de baignade sur place.',
  filter: (b, w) => b.kids && b.status === 'clean' && w && (w.condition === 'calm' || (w.waveHeight != null && w.waveHeight < 0.8)),
  fallback: 'Aucune plage famille ne réunit aujourd’hui mer calme + état propre. Consultez la carte pour le meilleur compromis du moment.',
},
{
  slug: 'snorkeling',
  titleMq: 'Plages pour le snorkeling aujourd’hui — Martinique',
  titleGp: 'Plages pour le snorkeling aujourd’hui — Guadeloupe',
  h1Mq: 'Meilleures plages snorkeling aujourd’hui en Martinique',
  h1Gp: 'Meilleures plages snorkeling aujourd’hui en Guadeloupe',
  intro: 'Spots snorkeling avec aujourd’hui une eau claire (état sargasses propre — les sargasses en surface gênent la visibilité) et une mer peu agitée.',
  filter: (b, w) => b.snorkel && b.status === 'clean' && w && (w.condition !== 'rough' && (w.waveHeight == null || w.waveHeight < 1.2)),
  fallback: 'Aucun spot snorkeling ne réunit aujourd’hui eau claire + mer praticable. Revenez demain ou consultez la carte.',
},
```
> `b.kids`/`b.snorkel` sont déjà dans l'objet `beaches` (lus l.777-778) ET dans `islandBeaches`/`enrichedBeaches` (spread `...b` l.1474). Aucun autre changement de plomberie. Met à jour le `console.log` final (l.1562) : `6 aggregation pages (MQ + GP) = 14 pages`.
> Ajouter les liens des 2 nouvelles pages au sous-nav du noscript (l.1498) et au hub (`hubLinks` se régénère tout seul depuis `conditionPages`, l.1533 — rien à faire pour le hub).

**A3 — Exposer la liste générée en JSON pour l'overlay (clé pour B, anti double-source).**
Le générateur connaît déjà `matching` (la sélection triée). Pour que l'overlay React montre EXACTEMENT la même sélection sans recoder le filtre, **émettre un `<script id="sg-conditions-data" type="application/json">`** dans le `<head>` de chaque page conditions (juste avant `</head>`, à côté des JSON-LD l.1517) :
```js
const condData = JSON.stringify({
  slug: page.slug, h1: pageH1, intro: page.intro, island: islandCode,
  count: matching.length, fallback: page.fallback,
  freshOK: _wFreshOK, freshLabel: _wFreshLabel,
  beaches: matching.map(b => ({
    id: b.id, name: b.name, slug: b.slug, commune: b.commune,
    status: b.status, drive: b.drive || null, lat: b.lat, lng: b.lng,
    w: b._w ? { waveHeight:b._w.waveHeight, sst:b._w.sst, uvMax:b._w.uvMax, condition:b._w.condition } : null
  }))
})
// dans la chaîne .replace('</head>', `… <script id="sg-conditions-data" type="application/json">${condData}</script>\n</head>`)
```
> `lat`/`lng` sont présents dans `beaches` (l.773-774) → permet le flyTo carte côté overlay sans refetch. C'est un blob JSON inerte (pas de JS exécuté) → respecte le hook sécurité (pas d'innerHTML).

### B · Overlay React golden-hour (conversion, JS-only, additif)

**B0 — Routing dans `Sargasses_PROD.jsx`.** Au mount du composant racine (à côté des autres détections de path, ex. la détection `/plages/` l.10529 et le deeplink `?paywall=1` l.10966), ajouter :
```js
const[conditionsPage,setConditionsPage]=useState(()=>{
  try{
    const m=window.location.pathname.match(/^\/conditions\/([a-z-]+)\/?$/)
    if(!m)return null
    const el=document.getElementById("sg-conditions-data")
    return el?JSON.parse(el.textContent):{slug:m[1]}
  }catch(_){return null}
})
```
Quand `conditionsPage` est non-null, **rendre `<LazyConditions …/>` PAR-DESSUS** (overlay plein écran, comme `LazyHomeAZ`/`LazyMapView`) — la home reste montée dessous (deep-link existant intact, escapable).

**B1 — Le composant `src/Conditions.jsx`** (nouveau, lazy via `lazyWithRetry(()=>import("./src/Conditions"))`, cf. `LazyHomeAZ` l.~54 du runbook). Pattern de port **identique à HomeAZ** :
- **Shadow DOM** (`host.attachShadow`), CSS via `<style>.textContent`, markup via `createContextualFragment` (JAMAIS `innerHTML` — hook sécurité). Réutiliser le squelette de `src/HomeAZ.jsx` (l.1-90 = doc + initHomeAZ) comme gabarit d'intégration.
- **Scène = `design/proto-map-v2.html`** (base approuvée). Réutiliser VERBATIM :
  - le `#stage` golden-hour CSS (proto-map-v2 l.22-24) + `.sun` breath (l.25-28) — c'est la « mer plein écran » au repos = tableau.
  - le `.veil` bas d'écran (l.66) pour lisibilité.
  - **Le Veilleur** : copier le `<g id="veilleur">` (proto-map-v2 l.126-135) VERBATIM, coin haut-droit, `scale(.46)`, qui regarde la mer. NE PAS le faire fixer l'utilisateur.
  - le bloc `@media (prefers-reduced-motion:reduce)` (l.67) → **plancher dur** : early-return avant tout rAF, animations off.
  - chrome : `.live` badge EN DIRECT (l.37-41) alimenté par `freshLabel` du JSON, `.head h1` (Anton, l.45-47), `.gauge` (l.48-51) réutilisée pour « N plages correspondent », `.dock` pill (l.52-55), `.near` (l.59) → bouton « Voir sur la carte ».
- **Contenu** : H1 = `data.h1`, sous-titre = `data.intro` (déjà honnête). Liste = `data.beaches` rendue en cartes DOM (comme les cartes top-3 de HomeAZ, construites en DOM pas innerHTML). Chaque carte : nom + commune + drive + chips (vagues `Xm` / eau `X°C` / UV `X` depuis `w`) + pastille couleur status (`#22C55E`/`#E8A800`/`#E8522A`, palette proto-map-v2 l.163).
- **Si `data.count===0`** : afficher `data.fallback` + Le Veilleur en humeur sereine (pas d'alerte) + CTA carte. Jamais d'écran vide.

**B2 — Portes de conversion (UNIQUE = `openPremium`).** Passer les hooks comme HomeAZ (`opts.hooks = {openPremium, onShowMap, track}`) :
- carte de plage → `onClick` ouvre la fiche (`onOpenBeach(beach)` / deep-link `/plages/<slug>/`) — réutilise le flux fiche existant.
- bouton `.near` « Voir sur la carte » → `onShowMap()` puis **flyTo FAR + filtre** correspondant au slug (REFONTE-MASTER l.144). Tracking `track("sg_conditions_to_map",{slug})`.
- un CTA premium contextualisé (bandeau bas, dans la scène, PAS flottant par-dessus — `feedback_no_ui_in_ui`) : « Sois prévenu quand TA plage redevient propre » → `openPremium("conditions_"+slug)`. **Conversion = `openPremium(source)` UNIQUE**, source contextualisée par slug.

**B3 — Revalidation live (tue le stale, l'argument fort de cette page).** À l'ouverture du composant, **refetch** `/api/copernicus/sargassum` (status live) + `/api/weather/beaches-weather.json` (météo live), recalculer le filtre du slug **côté client avec la MÊME logique** (extraire les prédicats dans un petit module partagé `src/lib/conditions-filters.js` importé À LA FOIS par `vite.config.js` (via `_require`) et par `Conditions.jsx` — single source of truth, évite la dérive de filtre). Si le fetch réussit : remplacer la liste + le badge freshness par la vraie valeur live (`formatFreshness`, réutiliser la fonction l.6426). Si échec/stale >12h : garder le JSON build-time MAIS afficher « vérification en cours » (jamais une fausse heure). Tracking `track("sg_conditions_view",{slug,count,fresh:bool})`.

---

## A/B

- **Flag** : `pw_conditions` (préfixe `pw_` cohérent avec `pw_planb`, `pw_h2s`, `pw_freshness`).
- **Pose** : `abVariant("pw_conditions",["control","scene"],[.3,.7])` (cf. `abVariant` l.1436 ; pondération 30/70 comme `pw_freshness`).
- **Override** : `?pw_conditions=1` force `scene`, `?pw_conditions=0` force `control` (mécanisme : pré-set `sg_ab.pw_conditions` depuis l'URL avant le 1er `abVariant`, comme les autres overrides du monolithe).
- **Control voit** : exactement la page actuelle — JS-on, le SPA monte la home ; JS-off, le `<noscript>` SEO (qui reçoit quand même le fix A1+A2 = améliorations SEO/honnêteté sans branche, NON A/B). Le `scene` voit l'overlay golden-hour B.
- **Mesure** : `node scripts/automation/ab-eval.cjs --days=28` sur `pw_conditions` + funnel Apps Script (`landing→openPremium`, `landing→map`, bounce). Cible : porte→NEAR +20 % (REFONTE-MASTER l.141).
- **Réversibilité** : `scene` 100 % additif (overlay), control intact. Rollback = poids `[1,0]`.

---

## Données réelles à brancher

| Champ | Source | Honnêteté |
|---|---|---|
| `status` (clean/moderate/avoid) | `SARGASSUM_REF`/`beaches-list.json` au build ; **refetch** `/api/copernicus/sargassum` (`levels[].status`) côté overlay | jamais inventé ; jamais `cleanFloor` atlantique (`feedback_forecast_floor_ban`). |
| `waveHeight, sst, uvMax, condition` | `public/api/weather/beaches-weather.json` → `beaches[id]` ; refetch live overlay | n'afficher un chip que si le champ `!= null`. |
| freshness | `_weatherFreshness` (build) + `sargData.updatedAt` (live) | **fenêtre <12h** : sinon « vérification en cours » (jamais une fausse heure). Réutiliser `formatFreshness` l.6426 + seuil `12*3600*1000` l.2612/l.2828. |
| `kids`, `snorkel`, `drive`, `lat`, `lng` | `beaches-list.json` (lus l.773-780) | factuels, statiques. |
| forecast (si on affiche « redevient propre J+N ») | `weekly[id].forecast[]` (du `/api/copernicus/sargassum`, construit `buildWeeklyBatch` l.83) | re-teinte UNIQUEMENT sur `forecast[].status` réel, jamais d'extrapolation. |

**Interdit** : aucune valeur fabriquée, aucun « 80 % » global, aucune photo/vidéo IA. Le statut « propre/à éviter » d'une plage doit toujours venir du status réel du jour.

---

## SEO (si page)

C'est une page → ne RIEN casser de l'indexation existante.
- **Title/meta** : inchangés sur les 4 pages existantes (déjà optimisés long-tail, l.1426-1462). Les 2 nouvelles (`plages-enfants`, `snorkeling`) suivent le même gabarit (title/desc/canonical/hreflang générés par le même code l.1503-1518).
- **Canonical** : self, `https://${domain}/conditions/${slug}/` (l.1506). **Slug = intention = stable** (ne JAMAIS renommer un slug existant = 301 sinon).
- **hreflang** : `fr` self + `x-default` self ; `en`/`es` retirés (l.1508-1511) — conserver tel quel (pas de variante EN/ES des conditions, c'est voulu). Les nouvelles régions n'émettent PAS de `/conditions/` (`IS_NEW_REGION` court-circuite le bloc `seo-pages` MQ/GP, l.336-363).
- **JSON-LD** : `CollectionPage` + `BreadcrumbList` (l.1499-1500) — réutilisés tels quels pour les nouvelles pages. L'overlay B ne change PAS le `<head>` indexé (il monte dans un shadow root après hydratation).
- **Sitemap** : les 2 nouvelles pages s'ajoutent automatiquement (boucle l.1525-1527) → +4 URLs (2 pages × 2 îles). Vérifier `sitemap-martinique.xml`/`sitemap-guadeloupe.xml` après build.
- **Maillage interne** : sous-nav du noscript (l.1498) + hub (l.1533) à étendre aux 2 nouveaux slugs. Le hub `/conditions/` se régénère depuis `conditionPages` → automatique. Ajouter un lien `/conditions/` depuis la home/footer SPA si pas déjà présent (vérifier `Grep "conditions" Sargasses_PROD.jsx` = actuellement 0 → **ajouter une entrée discrète** dans le maillage SPA, ex. footer ou hub plages).
- **GP mirror** : `toGpMirror()` (l.383+) ré-ancre domaine + GA4/Clarity GP + og:site_name — déjà appliqué aux conditions (l.1521-1523), rien à faire pour les nouvelles (même code).
- **Anti-stale signal** : `changefreq=daily` est honnête SI le build tourne quotidiennement (`daily-copernicus.yml`). Le fix A1 aligne le corps de page sur la fraîcheur réelle.

---

## Vérification

**1. Syntaxe JSX du monolithe (avant tout edit de `Sargasses_PROD.jsx`)** :
```bash
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
```
Idem sur `src/Conditions.jsx` (loader jsx).

**2. Build complet (intègre le générateur A)** :
```bash
npm run build   # attendre "built in" ; vérifier le log "→ /conditions/ hub + 6 aggregation pages (MQ + GP) = 14 pages"
```
Vérifier sur disque :
```bash
node -e "const fs=require('fs');['baignade-ideale','mer-calme','mer-agitee','uv-fort','plages-enfants','snorkeling',''].forEach(s=>{const p='dist/conditions/'+(s?s+'/':'')+'index.html';console.log(p, fs.existsSync(p)?'OK':'MISSING')})"
node -e "const h=require('fs').readFileSync('dist/conditions/mer-calme/index.html','utf8');console.log('has-json-data:', h.includes('sg-conditions-data'));console.log('no-fake-fresh:', !/rafraîchies le/.test(h));console.log('canonical-ok:', h.includes('/conditions/mer-calme/'))"
```

**3. Serveur local + Playwright (l'app preview TIMEOUT → obligatoire, cf. runbook §3)** :
```bash
python -m http.server 8790 --bind 127.0.0.1   # background, depuis le repo
```
Script `.cjs` DANS le repo (sinon `Cannot find module playwright`) :
- proto isolé d'abord : `navigate http://127.0.0.1:8790/design/proto-map-v2.html` → `waitForTimeout(1000)` → capter `pageerror`+`console.error` → screenshot → Read le png → JUGER (golden-hour, Veilleur ne fixe pas, pins lisibles).
- page buildée + overlay : `navigate http://127.0.0.1:8790/dist/conditions/mer-calme/?pw_conditions=1` → attendre le shadow host → screenshot → vérifier : H1, liste = même count que le JSON, badge freshness honnête, CTA présents.
- control : `?pw_conditions=0` → la home monte, aucune régression.
- reduced-motion : émuler `prefers-reduced-motion:reduce` → screenshot → aucune animation (plancher dur).

**4. Filtre live cohérent build↔overlay** :
```bash
node -e "const f=require('./src/lib/conditions-filters.js');console.log(typeof f['mer-calme'])"  # le module partagé charge en CJS et ESM
```

**5. Smoke EUR** : rebuild MQ d'abord (`npm run build`), puis vérifier qu'une fiche `/plages/<slug>/` et le funnel `openPremium` restent intacts (clic CTA → `sg_premium_modal_open`).

---

## Garde-fous spécifiques

- **STALE = l'ennemi #1 de cette surface.** Ne JAMAIS écrire « aujourd'hui / il y a X h » dans le corps si la donnée a >12h. Fix A1 + revalidation B3 = obligatoires ensemble pour la branche `scene`. Le fix A1 (noscript) ship même sans B.
- **Filtre = UNE seule définition** (`src/lib/conditions-filters.js`) consommée par le build ET l'overlay → zéro dérive « la page Google dit 8 plages, l'app en montre 3 ».
- **Conversion = `openPremium(source)` UNIQUE**, source `conditions_<slug>`. Pas de checkout custom, `stripe-config.php` JAMAIS touché.
- **Tracking `sg_*` à l'identique** + nouveaux events `sg_conditions_view` / `sg_conditions_to_map` (préfixe `sg_`, sinon `funnel_tracking_gap`).
- **Additif strict** : le `<noscript>` SEO et le control ne changent pas de comportement (A1/A2 = améliorations SEO non-A/B ; B = overlay derrière `pw_conditions`).
- **Le Veilleur** = 1 satellite, mi-clos, regarde LA MER, jamais l'utilisateur (pas d'œil-HAL). Doctrine calme : repos = tableau, `prefers-reduced-motion` = early-return avant rAF.
- **Pas d'UI flottante** par-dessus la scène (`feedback_no_ui_in_ui`) : CTA premium DANS la scène (bandeau ancré), pas en pop-up.
- **Zéro image/vidéo IA.** Scène = SVG proto-map-v2 réutilisé.
- **Slug = nom = SEO** : ne JAMAIS renommer un slug existant. Ajouts only ; suppression = 301 (interdit ici).
- **Shabbat ven 18h → sam 19h : ne RIEN déployer.**
- **Vérifier les hrefs** : `curl` les 14 pages buildées avant push (`feedback_validate_hrefs`) — aucune 404, canonical self correct.
