# Copie paywall contextualisée (plage + verdict) — spec d'exécution

> Cible : la fuite **modal→CTA 2 %**. On rend le paywall *à propos de la plage que l'user vient de regarder*, dérivé du verdict réel, au lieu de re-deviner une « top beach » à l'échelle de l'île.

---

## État actuel

**Composant** : `PremiumModal` — `Sargasses_PROD.jsx:5356`.
**Porte de conversion unique** : `openPremium(src)` — `Sargasses_PROD.jsx:10963` :
```js
const openPremium=useCallback((src)=>{const s=src||"nav";setPremiumSource(s);setShowPremium(true);track("sg_premium_modal_open",{source:s})},[])
```
- État stocké : `premiumSource` (string) — `Sargasses_PROD.jsx:10093`. **Aucun contexte plage** n'est transporté.
- Le modal est monté en `Sargasses_PROD.jsx:11338` :
  `<PremiumModal onClose=… lang=… source={premiumSource} onActivated=… sargData={sargData} island={island}/>`.

**Comment le modal "personnalise" aujourd'hui** : il NE reçoit PAS la plage. Il recalcule tout à l'échelle de l'île à partir de `sargData.levels` :
- `Sargasses_PROD.jsx:5366-5371` : `_islandLvls`, `_cleanCount`, `_totalCount`.
- `Sargasses_PROD.jsx:5380` : `_topBeach = [..._islandLvls].sort((a,b)=>b.score-a.score)[0]` → **la "meilleure plage de l'île"**, pas celle regardée.
- `Sargasses_PROD.jsx:5385-5386` : `_topName`, `_topScore`.
- Card 01 (brief matin) `Sargasses_PROD.jsx:5972-5976` : « Ta meilleure plage : `${_topName}` ».
- `_allCalm` (`5376`) bascule le titre vers la value-prop saison calme `5933-5939`.
- Titre par défaut `5937-5939` : « Sois **prévenu** avant que ta plage tourne ».

**Ce qui marche** :
- Données live honnêtes (compte clean réel `6053-6058`, jamais de nom inventé : commentaire `5397-5398`).
- Scène golden-hour `pw_constel` promue défaut 85 % (`5671`), Veilleur humeur data-driven via `_aggStatus`/`VEILLEUR_MOOD` (`5390-5391`).
- Plomberie A/B mature (`pw_calm`, `pw_scene`, `pw_constel`, `pw_prelude`, `pw_freshness`).

**Ce qui manque (le bug de conversion)** :
1. **Mismatch de focus.** L'user clique « Activer l'alerte » sur la fiche **Plage du Diamant en alerte** (`Sargasses_PROD.jsx:3448`, `onPremiumClick("urgency_banner")`) → le paywall s'ouvre en disant « Ta meilleure plage : **Anse Dufour** 84/100 ». Le sujet a changé sous ses yeux. La promesse ne répond plus à *son* moment.
2. **Tous les call-sites fiche jettent le contexte.** `onPremiumClick(source)` est appelé avec, dans le scope, `beach` + `forecast` + verdict — mais seul un string part :
   - `Sargasses_PROD.jsx:2366` `onPremiumClick("forecast")` (ForecastChart, `forecast` dispo)
   - `Sargasses_PROD.jsx:2509` `onPremiumClick("forecast_beat")`
   - `Sargasses_PROD.jsx:2993` `onPremiumClick("h2s_health_alert")` (H2SBadge, `beach` dispo)
   - `Sargasses_PROD.jsx:3380` `onPremiumClick("beach_story")`
   - `Sargasses_PROD.jsx:3448` `onPremiumClick("urgency_banner")` (verdict dégradation `hit.d.status`, `when` connus)
   - `Sargasses_PROD.jsx:3504` `onPremiumClick("forecast_teaser")` (`forecast[1].status` = demain connu)
   - `Sargasses_PROD.jsx:3659` `<ForecastChart … onPremiumClick={onPremiumClick}/>`
3. La signature `openPremium(src)` n'accepte rien d'autre → **aucun canal** pour passer `{beach, verdict, day}`.

Le proto `design/proto-plage-plongee.html` a DÉJÀ prouvé le bon modèle : sa porte unique transporte la plage —
`function openPremium(source){ track("sg_premium_modal_open", {source, beach:DATA.beach.id}); }` (script, ~ligne 873), et toute sa copie est dérivée du statut réel via `verbalVerdict()` (~ligne 760) + freshness honnête `freshLabel()` (~ligne 776 : `<12h` sinon `"vérification en cours"`).

---

## Objectif (barre HomeAZ + KPI visé)

- **KPI** : faire monter `sg_premium_modal_cta / sg_premium_modal_open` (aujourd'hui ~2 %). On ne touche NI au checkout, NI aux Payment Links, NI au tracking existant.
- **Barre HomeAZ / `sg-design-system`** : golden-hour, **Le Veilleur rassure ≠ surveille**, doctrine calme (repos = tableau, reduced-motion floor), zéro image IA. La copie contextualisée garde le ton "je veille l'eau, pour CETTE plage" — pas d'urgence anxiogène fabriquée.
- **Principe** : le paywall continue *la phrase commencée par la fiche*. Si l'user regardait le Diamant (alerte, dégradation demain), le titre parle du Diamant et de demain. Si saison calme, on vend « sache où sera la mer demain » — toujours **sur cette plage**.

---

## Changements exacts (étape par étape)

### Étape 1 — Élargir `openPremium` pour accepter un `ctx` (ADDITIF, rétrocompatible)

`Sargasses_PROD.jsx:10093` — ajouter un state ctx à côté de `premiumSource` :
```js
const[premiumSource,setPremiumSource]=useState(null)
const[premiumCtx,setPremiumCtx]=useState(null) // {beachId,beachName,status,score,tomorrowStatus,turnsDay,reason}
```
`Sargasses_PROD.jsx:10963` — signature à 2 args, **2e optionnel** (tous les `openPremium("x")` existants continuent de marcher) :
```js
const openPremium=useCallback((src,ctx)=>{const s=src||"nav";setPremiumSource(s);setPremiumCtx(ctx||null);
  setShowPremium(true);track("sg_premium_modal_open",{source:s,beach:ctx?.beachId||null,ctx_status:ctx?.status||null})},[])
```
> Le `track` gagne `beach` + `ctx_status` (déjà fait par le proto). Permet de segmenter le funnel par plage/verdict sans nouvel event.

`Sargasses_PROD.jsx:11338` — passer le ctx au modal :
```jsx
{showPremium&&<PremiumModal onClose={()=>setShowPremium(false)} lang={lang} source={premiumSource} ctx={premiumCtx}
  onActivated={()=>{setIsPremium(true);setShowWelcome(true)}} sargData={sargData} island={island}/>}
```

### Étape 2 — Construire le `ctx` aux call-sites de la fiche (le seul endroit qui a la vraie plage)

Dans `BeachSheet` (`Sargasses_PROD.jsx:3014`), `beach` et `forecast` sont déjà en scope. Créer **un helper local unique** (juste après `const isFav=…`, ~`3060`) pour ne pas dupliquer :
```js
// ctx paywall — la plage RÉELLEMENT regardée + son verdict réel (jamais l'île).
const buildPwCtx=useCallback((extra={})=>{
  const fc=weeklyData?.forecast||forecast||null
  const tomorrow=Array.isArray(fc)&&fc[1]?.status||null
  return{beachId:beach?.id||null,beachName:beach?.name||null,status:beach?.status||null,
    score:(typeof beach?.score==="number"?beach.score:null),tomorrowStatus:tomorrow,...extra}
},[beach,weeklyData,forecast])
```
Puis enrichir chaque appel (le `source` reste IDENTIQUE — aucune rupture funnel) :
- `3448` urgency_banner : `onPremiumClick("urgency_banner",buildPwCtx({turnsDay:when,reason:"degrade",to:hit.d.status}))`
- `3504` forecast_teaser : `onPremiumClick("forecast_teaser",buildPwCtx({reason:"tomorrow"}))`
- `3380` beach_story : `onPremiumClick("beach_story",buildPwCtx())`
- `3490`/H2SBadge : passer `beach` est déjà fait ; à l'intérieur (`2993`) appeler `onPremiumClick("h2s_health_alert",{beachId:beach?.id,beachName:beach?.name,status:beach?.status,reason:"h2s"})`
- `3659` ForecastChart : passer `beachCtx={buildPwCtx({reason:"forecast"})}` en prop, et dans `openLock` (`2366`)/`2509` faire `onPremiumClick("forecast",beachCtx)` / `onPremiumClick("forecast_beat",beachCtx)`.

> Les call-sites carte/hero/dock/world qui n'ont PAS de plage précise (`landing`, `nav`, `archipel`, `world`, `chat`, `referral_banner`…) restent `openPremium("x")` sans 2e arg → le modal retombe sur le comportement île actuel. **Zéro régression** pour eux.

### Étape 3 — Consommer le `ctx` dans `PremiumModal` (A/B-gaté)

`Sargasses_PROD.jsx:5356` — nouvelle prop :
```js
function PremiumModal({onClose,lang,source,ctx,onActivated,sargData,island}){
```
Juste après les derivations île existantes (~`5386`, après `_topScore`), ajouter la **résolution de focus** :
```js
// pw_ctx (A/B) : le paywall parle de la plage REGARDÉE (ctx), pas de la "top île".
// Fallback intégral sur le comportement actuel si pas de ctx ou holdout.
const pwCtx=(()=>{try{const q=window.location.search;if(/[?&]pwctx=1/.test(q))return true;if(/[?&]pwctx=0/.test(q))return false;
  return abVariant("pw_ctx",["control","ctx"],[.3,.7])==="ctx"}catch(_){return false}})()
const _useCtx = pwCtx && !!ctx?.beachName
// Plage "héroïne" du paywall : ctx en variante, sinon top-île (inchangé)
const _heroName  = _useCtx ? ctx.beachName : _topName
const _heroScore = _useCtx ? (ctx.score ?? _topScore) : _topScore
const _heroStatus= _useCtx ? ctx.status : _aggStatus
const _heroTomorrow = _useCtx ? ctx.tomorrowStatus : null
```

**3a. Titre `h2` (`Sargasses_PROD.jsx:5931-5940`)** — surcharger UNIQUEMENT quand `_useCtx`, sinon laisser le code actuel intact. Insérer en tête du IIFE du titre, AVANT le `if(pwCalm&&_allCalm)` :
```js
const G={background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"};
if(_useCtx){
  // Verdict-driven, dérivé du STATUT RÉEL de la plage regardée (jamais inventé).
  const nm=<span style={{whiteSpace:"nowrap"}}>{_heroName}</span>
  // dégradation prévue connue → cap la promesse "sache AVANT que ça tourne, ici"
  if(_heroTomorrow && _heroStatus==="clean" && _heroTomorrow!=="clean")
    return lang==="es"?(<>{nm} cambia <span style={G}>mañana</span> — entérate antes</>)
      :lang==="en"?(<>{nm} turns <span style={G}>tomorrow</span> — know before</>)
      :(<>{nm} tourne <span style={G}>demain</span> — sache-le avant</>)
  if(_heroStatus==="avoid")
    return lang==="es"?(<>¿Cuándo vuelve {nm}? <span style={G}>Te aviso.</span></>)
      :lang==="en"?(<>When does {nm} clear? <span style={G}>I'll tell you.</span></>)
      :(<>Quand {nm} redevient propre ? <span style={G}>Je te préviens.</span></>)
  // propre/modéré : value-prop forecast positive, ancrée sur CETTE plage
  return lang==="es"?(<>Sabe cómo estará {nm} <span style={G}>mañana</span></>)
    :lang==="en"?(<>Know how {nm} looks <span style={G}>tomorrow</span></>)
    :(<>Sache si {nm} tient <span style={G}>demain</span></>)
}
```
> Réutilise EXACTEMENT le gradient `G` et la balise `<span style={G}>` du titre existant (`5932`) — même rendu doré. `verbalVerdict()`/`STATUS_WORD` du proto-plage-plongee (~`760`) = la même logique « statut → mot ».

**3b. Card 01 brief matin (`Sargasses_PROD.jsx:5971-5982`)** — quand `_useCtx`, l'eyebrow + le titre parlent de la plage regardée :
```js
// titre card 01
_useCtx
 ?_t(lang,`On veille ${_heroName} pour toi`,`We watch ${_heroName} for you`,`Vigilamos ${_heroName} por ti`)
 :( … code _topName actuel inchangé … )
// sous-ligne card 01
_useCtx&&_heroScore
 ?_t(lang,`Aujourd'hui ${_heroScore}/100 · ${verdictWord} · satellite`,`Today ${_heroScore}/100 · ${verdictWord} · satellite-verified`,`Hoy ${_heroScore}/100 · ${verdictWord} · satélite`)
 :( … code _topScore actuel inchangé … )
```
avec `const verdictWord=({clean:_t(lang,"propre","clean","limpia"),moderate:_t(lang,"modéré","moderate","moderada"),avoid:_t(lang,"à éviter","avoid","evitar")})[_heroStatus]||""`.
> Le Veilleur **rassure** : « On veille X pour toi », jamais « surveillance de X ».

**3c. Card 02 alerte (`Sargasses_PROD.jsx:5999-6011`)** — si `_useCtx` ET dégradation connue, rendre l'exemple **réel et nominatif** :
```js
_useCtx&&_heroTomorrow&&_heroStatus!==_heroTomorrow
 ?_t(lang,`${_heroName} : ${LL[_heroStatus]||_heroStatus} → ${LL[_heroTomorrow]||_heroTomorrow} demain`,
        `${_heroName}: ${LL[_heroStatus]} → ${LL[_heroTomorrow]} tomorrow`,
        `${_heroName}: ${LL[_heroStatus]} → ${LL[_heroTomorrow]} mañana`)
 :( … code générique actuel "Ta plage favorite a changé" inchangé … )
```
> `LL=T[lang]` est déjà dispo (`5357`) et contient `clean/moderate/avoid` traduits.

**3d. Scène `pw_constel` (`5749-5788`)** — la **promesse** (`promiseEl` `5756-5758`) et la **preuve** (`proof` `5759-5761`) consomment `_heroName`/`_heroScore` au lieu de `_topName`/`_topScore` quand `_useCtx`. Ne PAS changer le SVG (constellation, Veilleur, compte clean live restent à l'échelle île — c'est honnête : « ta côte »). Seule la ligne de promesse devient nominative :
```js
const proof=_useCtx
 ?_t(lang,`${_heroName} · ${_heroScore?_heroScore+"/100 · ":""}vérifié satellite`, …EN…, …ES…)
 :( … proof actuel inchangé … )
```

**3e. Prelude inchangé.** `showPrelude` (`5797+`) = plan/timeline/trust, agnostique de la plage. Ne pas toucher (évite tout risque sur le flow checkout).

### Patterns/assets à RÉUTILISER (ne rien réinventer)
- **Gradient or `G`** : `Sargasses_PROD.jsx:5755` / `5932` (mot doré du titre).
- **`VEILLEUR_MOOD` + `moodFromStatus`** : `161-168` → l'humeur du Veilleur suit `_heroStatus` quand `_useCtx` (sereine/vigilant/alerte) — déjà branché via `_constelMood` (`5391`), changer sa source en `_useCtx?ctx.status:_aggStatus`.
- **`miVeil(cx,cy,wing,lens)`** : `981` — la mascotte SVG, inchangée.
- **Freshness honnête** : `formatFreshness` (`6426`) + le pattern `fresh` (`2828`, fenêtre `<12h`) ; côté proto `freshLabel()` (`design/proto-plage-plongee.html` ~`776`) → si on affiche une fraîcheur dans le paywall ctx, **`<12h` sinon `"vérification en cours"`**, jamais de faux chrono.
- **`design/proto-plage-plongee.html`** : `verbalVerdict()` (~`760`), `STATUS_WORD`, et `openPremium(source){…beach:DATA.beach.id}` (~`873`) = la référence exacte de cette spec, déjà validée navigateur.
- **`design/proto-map-v2.html`** : la vue carte qui mène à la fiche (pas de paywall propre) — confirme que **le contexte plage naît dans la fiche**, pas dans la carte.
- **`src/HomeAZ.jsx`** : palette + ton golden-hour + Veilleur serein = la barre de goût pour la copie.

---

## A/B

- **Flag** : `pw_ctx` — `abVariant("pw_ctx",["control","ctx"],[.3,.7])` (`abVariant` def `Sargasses_PROD.jsx:1436`).
- **Override QA** : `?pwctx=1` force la variante ctx, `?pwctx=0` force le control. (Même pattern que `?pwcalm=`, `?pwscene=`, `?pwconstel=`.)
- **Control voit** : le paywall ACTUEL à l'identique (titre « Sois prévenu avant que ta plage tourne », Card 01 = top-île). Garanti car tous les blocs ctx sont gardés par `_useCtx` (false en control OU quand `ctx` absent).
- **Garde-fou de variante** : `_useCtx = pwCtx && !!ctx?.beachName`. Si la variante est active MAIS qu'on est entré par la carte/hero (pas de ctx), le modal retombe SILENCIEUSEMENT sur le comportement île → jamais de blanc.
- **Mesure** : `sg_premium_modal_open` porte désormais `beach` + `ctx_status` + `ab_pw_ctx` (les `ab_*` sont auto-attachés par `track`, `1448-1451`). Segmenter `sg_premium_modal_cta / sg_premium_modal_open` par `ab_pw_ctx`. Fenêtre 4-8 semaines (cf. cadence A/B repo).

---

## Données réelles à brancher

Tout vient du `ctx` construit dans la fiche, lui-même issu du JSON live — **rien d'inventé** :
- `ctx.beachName` ← `beach.name` (= slug=nom SEO, jamais renommé).
- `ctx.status` ← `beach.status` (`clean|moderate|avoid`), source `sargassum.json.levels[].status` / `scores`.
- `ctx.score` ← `beach.score` (0-100, `scores[id]`), affiché seulement si numérique.
- `ctx.tomorrowStatus` ← `weeklyData.forecast[1].status` (`weekly[id].forecast[]` — pipeline réel, JAMAIS `generateForecast` fallback ni cleanFloor atlantique).
- `_cleanCount/_totalCount` (compte île) restent calculés du live (`5366-5371`), affichés tels quels.
- **Honnêteté** :
  - Si `ctx.tomorrowStatus` absent (forecast manquant) → ne PAS afficher de phrase "demain" ; retomber sur la value-prop générique.
  - Si `ctx.score` absent → omettre le `/100`.
  - Aucune dégradation/amélioration "fabriquée" : la card 02 nominative n'apparaît que si `_heroStatus !== _heroTomorrow` réellement.
  - Fraîcheur (si affichée) via `formatFreshness`/`<12h`, sinon « vérification en cours ».

---

## SEO (si page)

**Sans objet — aucune page créée.** `PremiumModal` est un overlay in-app (React), pas une route. Pas de `title`/`meta`/`canonical`/`hreflang`/sitemap/`vite.config.js` touchés. Aucun lien sortant nouveau, aucune redirection. L'indexation des 136 pages plages SEO n'est pas impactée (slug=nom inchangé).

---

## Vérification

```powershell
# 0. Lint syntaxe (le monolithe doit parser)
npx esbuild "C:\Users\user\Desktop\Backup\sargagame\Sargasses_PROD.jsx" --bundle --format=esm --outfile=NUL --loader:.jsx=jsx --jsx=automatic --external:react --external:react-dom

# 1. Build complet (136+ pages générées)
npm run build

# 2. Servir le build local sur 8790
npx vite preview --port 8790 --strictPort
```

Vérif navigateur (Playwright MCP ou serveur 8799 du skill `sg-svg-scene`) :
1. `http://localhost:8790/?pwctx=1` → ouvrir une fiche plage **en alerte** → cliquer « Activer l'alerte » (urgency_banner). Le paywall doit titrer avec le **nom de CETTE plage** + « demain » si dégradation.
2. Console : `sg_premium_modal_open` doit logguer `{source:"urgency_banner", beach:"<id réel>", ctx_status:"<statut>", ab_pw_ctx:1}`.
3. `?pwctx=0` → MÊME fiche, même clic → paywall control identique à aujourd'hui (« Sois prévenu avant que ta plage tourne », Card 01 top-île).
4. Entrer par la carte (`openPremium("landing")`, pas de ctx) avec `?pwctx=1` → le paywall retombe sur le comportement île (pas de blanc, pas de "undefined").
5. Saison calme (toutes plages clean) + `?pwctx=1` → titre « Sache si `<plage>` tient demain » (positif, pas d'alarme).
6. Tester FR/EN/ES (`?lang=en`, `?lang=es`) sur chaque variante.
7. `prefers-reduced-motion: reduce` → aucune anim idle (la scène constel reste statique, déjà géré `5763`).
8. Cliquer le CTA → `sg_premium_modal_cta` puis flow checkout INCHANGÉ (Payment Link / on-site) — ne PAS modifier ce chemin.

---

## Garde-fous spécifiques

- **ADDITIF + réversible** : tous les blocs ctx sont gardés par `_useCtx`. Control = octet pour octet l'actuel. Le 2e arg de `openPremium` est optionnel → tous les call-sites existants compilent et se comportent à l'identique.
- **Conversion = `openPremium` UNIQUE** : on N'ajoute PAS de porte. On enrichit l'unique. `sg_premium_modal_cta`, `sg_checkout_redirect`, `sg_conversion` inchangés.
- **Checkout intouché** : ZÉRO modif sous le titre/cards (plan toggle, prelude, `startCheckout`, `doSubscribe`, `stripeUrlWith`, Payment Links, `stripe-config`). On ne touche QUE de la copie au-dessus du fold.
- **Le Veilleur rassure ≠ surveille** : copie nominative en « on veille X **pour toi** / je te préviens », jamais « surveillance / on te traque ». Pas d'urgence anxiogène : la card alerte n'apparaît que sur dégradation RÉELLE.
- **Data honnête** : jamais de nom de plage, score, ou « demain » inventé (mêmes garde-fous que `5397-5398`, `6050-6052`). `weekly[id].forecast`, jamais `generateForecast`/cleanFloor atlantique (cf. `feedback_forecast_floor_ban`).
- **slug=nom** : `ctx.beachName=beach.name` brut, aucun renommage.
- **Calme = tableau** : aucune anim idle ajoutée ; reduced-motion floor respecté (réutilise la scène constel statique existante).
- **i18n natif FR/EN/ES** : toute string passe par `_t(lang,fr,en,es)` (`68`). Aucune chaîne en dur monolingue.
- **Vérif navigateur obligatoire** avant push (l'app preview timeout → serveur local + Playwright, cf. skill `sg-svg-scene`).
