# Dock — sélecteur de profondeur (Carte / Plages / Premium) — spec d'exécution

> Surface : le **chrome global** de l'app — la barre de navigation persistante en bas qui choisit la *profondeur* du monde unifié.
> Profondeurs (`REFONTE-MASTER.md` §0) : **FAR = Carte** (archipel/map) · **MID = Plages** (liste/zones) · **Premium = action de conversion** (≠ une vue : ouvre `openPremium`).
> Lecture préalable faite : `Sargasses_PROD.jsx` (BottomNav L2310-2348, CSS dock L1957-1985, `onChangeView` L10957-10961, `openPremium` L10963, render L11325, header chrome L11176-11203, tabs i18n L1134/1200/1266), `src/HomeAZ.jsx` (port Shadow-DOM, `home_az`), `design/proto-map-v2.html` (dock golden-hour L52-55/155), `design/proto-plage-plongee.html`, `vite.config.js`.

---

## État actuel

### Le composant `BottomNav` — `Sargasses_PROD.jsx` L2310-2348
- 3 onglets, définis L2314-2318 :
  ```
  {id:"map",   label:LL.navMap,    icon:"🗺️"}
  {id:"list",  label:LL.navList,   icon:"📋"}
  {id:"premium",label:LL.navPremium,icon:"⭐"}
  ```
- Labels i18n via `T[lang]` : `navMap/navList/navPremium` = "Carte/Plages/Premium" (fr L1134), "Map/Beaches/Premium" (en L1200), "Mapa/Playas/Premium" (es L1266). **Il existe AUSSI `navGame:"Jeu"` (L1134/1200/1266) MAIS volontairement non monté** — le jeu reste un easter-egg (toast d'inactivité), directive fondateur 14/06 (commentaire L2312-2313). Ne pas réintroduire l'onglet Jeu.
- Rendu (L2320-2347) : `<nav className="sg-bottom-nav">` fixe, `bottom:0`, `zIndex:800`, glass `var(--sg-glass,rgba(255,255,255,.92))` + `backdropFilter:blur(20px)`, `justifyContent:space-around`, `borderTop`. Chaque bouton = colonne `icon (20px) + label (11px)`, `minHeight:44`.
- État actif (L2329) : `const active = view===t.id || (t.id==="premium"&&false)`. **Le `&&false` est un bug mort connu** (cf. MEMORY `project_design_backlog` : « onglet Premium jamais surligné ») : Premium n'est jamais une *vue*, donc `view` n'est jamais `"premium"` → l'onglet ⭐ ne s'allume JAMAIS. Couleur active = `C.gold` (#E8A800), barre indicateur 24×3px top (L2339-2340), icône `scale(1.1)` (L2342).

### Le câblage de navigation — `onChangeView` L10957-10961
```js
const onChangeView=useCallback(v=>{
  track("sg_nav_change",{tab:v})
  if(v==="premium")setShowPremium(true)   // ⭐ = action, pas une vue
  else setView(v)                          // map | list (| learn, voir ci-dessous)
},[])
```
- `view` est un `useState("map")` (L10076), valeurs `map | list | learn | premium` (commentaire) — mais `learn` n'est PAS dans le dock (LearnView L11322 atteint autrement) et `premium` ne devient jamais `view`.
- `setShowPremium(true)` ⇒ `<PremiumModal source={premiumSource}/>` (L11338). **Mais ce chemin NE PASSE PAS par `openPremium`** (L10963) : il ne pose pas `premiumSource` ni le `track("sg_premium_modal_open",{source})`. Donc un clic ⭐ ouvre le modal avec le `premiumSource` *précédent* (stale) et sans event d'ouverture sourcé `nav`. **Incohérence à corriger** (voir Changements §3).

### Le rendu des vues (toggle opacité, jamais démonté) — L11040-11066
- `view==="map"` (L11041-11061) : conteneur `inset:0`, `opacity:1/0`, `pointerEvents`. Contient `MapIntroStory` + (en fallback `?nav=map` seulement) `LazyMapView` Leaflet. **Par défaut `navWorld=true`** (L10415) ⇒ Leaflet jamais monté, l'Archipel SVG EST la carte (auto-ouvert L10422-10426).
- `view==="list"` (L11062-11066) : `<BeachListView .../>`.
- Les 2 vues sont montées en permanence, on bascule l'opacité (« instant switch », L11040).

### Responsive — CSS `.sg-bottom-nav` L1957-1985
- `@media(min-width:768px)` (L1958-1974) : le nav devient un **pill flottant centré** : `left:50%`/`translateX(-50%)`, `bottom:18px`, `width:min(440px, calc(100vw-48px))`, `border-radius:999px`, `box-shadow:0 12px 40px`, hover `translateY(-2px)`. `@media(min-width:1200px)` (L1982-1984) : `bottom:24px`.
- En **mobile (<768px)** il reste collé `bottom:0` plein écran (pas un pill) — divergence visuelle avec le proto (le proto `dock` est un pill flottant à TOUS les breakpoints).

### Ce qui MANQUE / ne va pas (backlog design)
1. **⭐ Premium jamais surligné** (`&&false` L2329) — bug mort, MEMORY `project_design_backlog`.
2. **Visuel ≠ barre HomeAZ.** Le dock mobile est une barre blanche `rgba(255,255,255,.92)` collée au bas — pas le pill glass golden-hour `rgba(8,18,16,.62)` du proto (`proto-map-v2` L53). Sur le monde sombre (Archipel/HomeAZ), un dock blanc lumineux casse le golden-hour.
3. **Clic ⭐ stale-source** : ne passe pas par `openPremium`, `premiumSource` non rafraîchi, event d'ouverture non émis (cf. §État actuel).
4. **Pas de feedback "où suis-je".** Quand HomeAZ/Archipel/fiche est ouvert par-dessus, le dock reste sous (z800 < z1005/1006/1100) ou superposé sans cohérence d'état — l'onglet actif ne reflète pas toujours la scène réellement vue.
5. **Aucun A/B sur le dock** alors que c'est le chrome le plus vu de l'app (présent sur 100% des sessions). C'est un levier sous-mesuré.

---

## Objectif (barre HomeAZ + KPI visé)

Porter le dock à la **barre golden-hour** : un **pill flottant glass sombre** identique à `proto-map-v2` (L52-55), à tous les breakpoints, qui (a) **rassure** (présence calme, repos = tableau, pas d'animation idle), (b) **se repère** (l'onglet actif reflète la profondeur réelle, ⭐ enfin surlignable), (c) **convertit proprement** (⭐ passe par `openPremium("nav")`, source/event corrects).

KPI visé — c'est **du chrome, pas une page**, donc le levier direct est **modal→CTA 2 %** (goulot #1) et **la navigation Carte↔Plages** (carte = 25 % des clics, Clarity) :
- Rendre ⭐ visible + sourcé proprement → meilleure attribution + (hypothèse) léger gain d'ouvertures *qualifiées* (pas de cold-open, on garde l'intention).
- Le dock golden-hour cohérent baisse la dissonance visuelle = proxy "ça fait pro / ça rassure" (mesuré par A/B sur engagement nav, jamais par jugement de goût — `feedback_dont_show_wip`).

Non-objectif : ajouter des onglets (Jeu reste easter-egg), faire de Premium une vue, toucher Stripe.

---

## Changements exacts (étape par étape)

> Tout est **dans `Sargasses_PROD.jsx`** (composant `BottomNav` L2310-2348 + CSS L1957-1985 + `onChangeView` L10957-10961). Additif, réversible, control intact derrière le flag `dock_glass`.

### 1. Flag + lecture de variante (dans `App`, près des autres flags, ~L10439-10446)
Ajouter, à côté de `homeAZ` (L10446) :
```js
const[dockGlass]=useState(()=>{try{const q=window.location.search;
  if(/[?&]dock=1/.test(q))return true; if(/[?&]dock=0/.test(q))return false;
  return abVariant("dock_glass",["control","glass"],[.5,.5])==="glass"
}catch(_){return false}})
```
Passer `dockGlass` au composant : `<BottomNav view={view} onChangeView={onChangeView} lang={lang} glass={dockGlass} isPremium={isPremium}/>` (modifier L11325).

### 2. Surligner ⭐ (le bug `&&false`) — L2329
Remplacer :
```js
const active=view===t.id||(t.id==="premium"&&false)
```
par (Premium n'est jamais une vue persistante → s'allume seulement pendant que le modal est ouvert, sinon jamais ; pour le control on garde le comportement actuel) :
```js
const active = t.id==="premium"
  ? (isPremium ? false : showActive==="premium")   // jamais "actif" si déjà payant
  : view===t.id
```
où `showActive` est une prop optionnelle (défaut `view`) passée par l'App = `showPremium ? "premium" : view`. **Plus simple et suffisant** : se contenter de retirer le `&&false` n'allume jamais ⭐ non plus (view≠premium). La vraie correction = passer une prop `premiumOpen={showPremium}` et faire `t.id==="premium" ? premiumOpen : view===t.id`. **Retenu : prop `premiumOpen`.** Signature finale :
```js
function BottomNav({view,onChangeView,lang,glass=false,isPremium=false,premiumOpen=false}){
  ...
  const active = t.id==="premium" ? premiumOpen : view===t.id
```
App : `<BottomNav ... premiumOpen={showPremium} isPremium={isPremium}/>`. (Si `isPremium`, masquer l'onglet ⭐ OU le remplacer par "⭐ Mon veilleur" non-paywall — voir §6.)

### 3. ⭐ passe par `openPremium` (source correcte) — `onChangeView` L10957-10961
Remplacer le `setShowPremium(true)` par l'appel canonique (pose `premiumSource="nav"` + émet `sg_premium_modal_open`) :
```js
const onChangeView=useCallback(v=>{
  track("sg_nav_change",{tab:v})
  if(v==="premium")openPremium("nav")     // ← au lieu de setShowPremium(true)
  else setView(v)
},[openPremium])
```
Garde-fou : `openPremium` est défini L10963 AVANT `onChangeView` — vérifier l'ordre de déclaration (les `useCallback` sont ho!=hoisted ; `onChangeView` doit être déclaré APRÈS `openPremium`, ce qui est déjà le cas L10963 < … mais `onChangeView` est L10957, AVANT L10963). **À corriger : déplacer la déclaration `onChangeView` après `openPremium` (sous L10963)**, sinon `openPremium` est `undefined` à la création du callback. (Le `useCallback` capture la closure ; comme les deux sont dans le même render, déplacer suffit.)

### 4. Style golden-hour (variante `glass`) — dans `BottomNav` render L2319-2327
Brancher le style sur `glass`. Réutiliser **les tokens exacts du proto `proto-map-v2` L53-55** :
- pill : `background:rgba(8,18,16,.62)`, `backdropFilter:blur(14px)`, `border:1px solid rgba(255,255,255,.12)`, `borderRadius:999`, `padding:5`.
- bouton inactif : `color:rgba(255,255,255,.7)`.
- bouton actif : `background:C.goldL (#FFC72C)`, `color:#16241f`, **pas** de barre-indicateur top (le fond pill suffit, plus propre que la barre 24×3).
Implémentation : deux branches de style selon `glass`. Le **control** (`glass=false`) garde **strictement** le markup/CSS actuels (barre blanche L2320-2345, `C.gold`, barre 24×3). En `glass`, rendre la `<nav>` SANS `borderTop`/`background` blanc, et appliquer le style pill inline + classe `sg-dock-glass` ; chaque bouton devient un pill horizontal `icon+label` (flexDirection:row, gap:6, padding:"9px 15px", borderRadius:999) — copier la mise en forme de `proto-map-v2` L54-55.

### 5. Responsive pill à TOUS les breakpoints (variante `glass`) — CSS L1957-1985
Aujourd'hui le pill flottant n'apparaît qu'`@media(min-width:768px)`. En `glass`, ajouter une règle **hors media-query** ciblant `.sg-dock-glass` pour qu'il flotte AUSSI en mobile (comme le proto) :
```css
.sg-dock-glass{
  left:50% !important; right:auto !important; transform:translateX(-50%);
  bottom:calc(16px + env(safe-area-inset-bottom)) !important;
  width:auto !important; max-width:calc(100vw - 32px);
  background:rgba(8,18,16,.62) !important;
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
  border:1px solid rgba(255,255,255,.12) !important; border-top:1px solid rgba(255,255,255,.12) !important;
  border-radius:999px !important; padding:5px !important;
  box-shadow:0 10px 30px rgba(0,0,0,.4);
}
```
Garder les règles `@media(min-width:768px)` existantes (control). En `glass`, la classe est appliquée en plus de `sg-bottom-nav`. **Doctrine calme** (`feedback_calm_no_idle_motion`) : AUCUNE animation idle sur le dock — pas de `:hover translateY` en mobile (touch), garder le hover desktop discret OK.

### 6. (Optionnel, même flag) onglet ⭐ pour les payants
Si `isPremium`, ⭐ ne doit plus pousser au paywall (déjà payé). Deux options, A/B-able plus tard :
- masquer l'onglet (tabs.filter), OU
- relabel "⭐ Veilleur" → ouvre le récap premium (alertes/brief) au lieu de `openPremium`.
**Pour cette spec : masquer** (`tabs = isPremium ? tabs.filter(t=>t.id!=="premium") : tabs`). Réversible, zéro impact conversion (un payant ne convertit pas 2×).

### Patterns/assets à RÉUTILISER (ne rien réinventer)
- **`proto-map-v2.html` L52-55 + L155** : la classe `.dock .pill` + `button[aria-pressed]` = LA référence visuelle exacte du dock golden-hour. Copier valeurs.
- **`C` / `RAD` / `TY`** (`Sargasses_PROD.jsx` L99-149) : `C.goldL=#FFC72C`, `RAD.pill=999`, `TY.ui` (Bricolage). Ne pas hardcoder de couleurs hors-palette.
- **`HomeAZ` (Shadow DOM)** : le dock reste DANS l'app (lumière DOM), au-dessus de HomeAZ z-index. Ne pas l'injecter dans le shadow root.
- **`sg-svg-scene` skill** : doctrine calme (repos = tableau), reduced-motion floor — appliquer au dock (pas d'idle anim).

---

## A/B

- **Nom du flag : `dock_glass`** (variants `["control","glass"]`, poids `[.5,.5]` au démarrage — c'est du chrome 100 %-vu, le 50/50 collecte vite ; on resserrera après lecture).
- **Override URL** : `?dock=1` force `glass`, `?dock=0` force `control` (parsing identique à `home_az` L10446 / `pwbeat` L2364).
- **Ce que voit le control** (`glass=false`) : **exactement** le dock actuel — barre blanche `rgba(255,255,255,.92)` collée `bottom:0` en mobile, pill blanc `@media≥768px`, barre-indicateur 24×3 `C.gold`, ⭐ surligné quand le modal est ouvert (le fix `premiumOpen` §2 + le fix source `openPremium` §3 s'appliquent aux **DEUX** bras — ce sont des corrections de bug, pas de la variante visuelle). Seuls le **style pill golden-hour** (§4) et le **flottement mobile** (§5) sont gated par le flag.
- **Tracking inchangé** : `sg_nav_change{tab}` (L10958) déjà émis ; `track` injecte automatiquement `ab_dock_glass` dans chaque event (L1448-1450) → lecture funnel sans code en plus. Lire l'impact via `sg_nav_change` (Carte↔Plages), `sg_premium_modal_open{source:"nav"}` et la suite `sg_checkout_*` segmentés par `ab_dock_glass`.

---

## Données réelles à brancher

Le dock **n'affiche aucune donnée chiffrée** — pas de freshness, pas de compteur (ça vit dans le header, `Header` L6438, et le hero/HomeAZ). **Aucun risque d'inventer une donnée.** L'honnêteté ici = ne RIEN afficher de faux : pas de badge "live" sur le dock (le badge EN DIRECT est déjà géré par le header avec sa garde `<12h`, L2828). Le seul état "réel" reflété = la **profondeur courante** (`view`) et `showPremium`, qui sont l'état UI vrai.

Si plus tard on veut un point d'état sur ⭐ (ex. pastille "1 alerte"), il devra venir d'une vraie source premium (favoris + statut du jour) — hors scope de cette spec.

---

## SEO (si page)

**Sans objet : le dock n'est pas une page.** C'est du chrome rendu uniquement dans l'app React (`Sargasses_PROD.jsx`), jamais dans les 136 pages SEO générées par `vite.config.js` (qui n'embarquent pas `BottomNav`). Donc :
- Aucun `title/meta/canonical/hreflang` à toucher.
- Aucune route, aucun `.htaccess`, aucun risque d'indexation.
- Pas de slug. (Rappel transverse : si un jour un onglet pointe vers une URL réelle, valider avec `curl` avant ship — `feedback_validate_hrefs` — mais ici les onglets changent un état local, pas une URL.)

---

## Vérification

> Le preview de l'app timeout (skill `sg-svg-scene`) → servir le build local + piloter avec Playwright. Port libre dédié : **8790**.

1. **Compile (esbuild, rapide)** — détecte toute erreur de syntaxe/JSX avant build complet :
   ```powershell
   npx esbuild Sargasses_PROD.jsx --bundle --format=esm --jsx=automatic --outfile=$env:TEMP\sg-dock-check.js --loader:.js=jsx
   ```
   (doit finir sans erreur ; on jette le fichier de sortie.)

2. **Build Vite complet** (génère `dist/`, ne doit pas casser les 136 pages) :
   ```powershell
   npm run build
   ```

3. **Serveur local + Playwright** (les deux bras + les overrides) :
   ```powershell
   npx http-server dist -p 8790 -c-1   # ou: npx vite preview --port 8790
   ```
   Puis via Playwright MCP (`browser_navigate` / `browser_resize` / `browser_click` / `browser_evaluate`) :
   - **Control** : `http://localhost:8790/?dock=0` → dock blanc collé bas (mobile 390×844) ; pill blanc en desktop 1280×800.
   - **Glass** : `http://localhost:8790/?dock=1` → pill glass sombre **flottant** à 390×844 ET 1280×800 ; onglet actif fond `#FFC72C` texte `#16241f`.
   - **⭐ surlignage** : `?dock=1`, cliquer ⭐ → modal s'ouvre ET l'onglet ⭐ s'allume (vérifie le fix `premiumOpen`). Vérifier `window` n'a pas d'erreur console.
   - **Source correcte** : `browser_evaluate` lit la `dataLayer`/console pour confirmer `sg_premium_modal_open` avec `source:"nav"` après clic ⭐ (et que `premiumSource` n'est plus stale).
   - **Carte↔Plages** : cliquer 🗺️ puis 📋 → `view` bascule, l'onglet actif suit, aucune vue ne disparaît (toggle opacité L11040-11066).
   - **Reduced motion** : émuler `prefers-reduced-motion: reduce` → aucune anim idle sur le dock.
   - **Payant** : `?premium=1&dock=1` → onglet ⭐ masqué (§6).

4. **Lighthouse / clic-band régression** : vérifier que le pill flottant ne re-crée pas le bug "click-blocker" (cf. header L11184-11189) — le `<nav>` ne doit absorber les clics QUE sur les boutons, pas sur la bande vide. En `glass` le pill est `width:auto` (pas plein écran) → moindre risque ; confirmer qu'un clic à côté du pill atteint la scène (Playwright : cliquer une pastille proche du pill).

---

## Garde-fous spécifiques

- **`stripe-config` JAMAIS touché** — le dock n'appelle que `openPremium("nav")`, qui mène au flux Stripe existant inchangé (la porte de conversion reste UNIQUE).
- **Control byte-pour-byte intact** : `glass=false` doit produire EXACTEMENT l'ancien rendu (barre blanche, barre-indicateur 24×3, `C.gold`). Ne pas refactorer le markup control "pour faire propre".
- **Les fixes bugs (⭐ `premiumOpen` §2, source `openPremium` §3) s'appliquent aux DEUX bras** — ce ne sont pas des variantes, ce sont des corrections ; les isoler du flag visuel.
- **Pas d'onglet Jeu** (easter-egg, directive 14/06 L2312-2313). Pas de Premium-as-view. Pas de 4ᵉ onglet.
- **Doctrine calme** (`feedback_calm_no_idle_motion`, `sg-design-system`) : zéro animation infinie sur le dock ; la vie vient de l'interaction (scale au tap OK, breathing non).
- **Pas de UI flottante par-dessus le monde** au-delà du dock lui-même (`feedback_no_ui_in_ui`) : ne pas ajouter de carte/tooltip ancrée au dock.
- **z-index** : garder `zIndex:800` (control) ; en `glass`, rester < paywall (z1100) et < hero/world overlays quand ils doivent masquer le dock. Si un overlay doit cacher le dock (HomeAZ plein écran), c'est l'overlay qui passe au-dessus, pas au dock de se démonter (réversibilité).
- **Le dock vit dans la lumière DOM**, pas dans le Shadow DOM de HomeAZ (`src/HomeAZ.jsx`) — ne pas l'y injecter.
- **Vérif navigateur OBLIGATOIRE avant ship** (`feedback_dont_show_wip`) : aucun jugement de goût fondateur ; on shippe gated A/B et on lit les vrais events.
- **Shabbat no-deploy** (ven 18h–sam 19h, `user_schedule`).
