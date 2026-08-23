# /alertes/ (hub Premium = le veilleur personnel) — spec d'exécution

> Surface : `/alertes/` (+ `/en/sargassum-alerts/` + `/es/alertas-sargazo/`).
> Rôle dans le plan : phase **C · balayage page par page** + sert les leviers #1/#2
> (capture email 0,35 % + modal→CTA 2 %). C'est LA page d'intention « être prévenu
> AVANT que ça arrive » (problème vécu #6 du MASTER, cœur Premium).
> Barre = HomeAZ. Additif + A/B + réversible + vérifié navigateur. Conversion = `openPremium(source)` UNIQUE.

---

## État actuel

**La page existe en SEO mais n'a AUCUNE expérience dédiée dans l'app.**

1. **Génération SEO** — `vite.config.js`, plugin `seo-pages`, `closeBundle()` :
   - Entrée déclarée l.402 du tableau `pages` :
     `{ path: 'alertes', enPath: 'en/sargassum-alerts', esPath: 'es/alertas-sargazo', title: 'Alertes sargasses Martinique et Guadeloupe — Notifications en temps réel', desc: '...' }`
   - Noscript éditorial : objet `editorialContent['alertes']` l.434 (un `<article>` H1 + « Comment ça marche » + « Pourquoi s'abonner » + liens vers `/` et `/previsions/`).
   - Le plugin copie `index.html` → `dist/alertes/index.html` (mêmes title/desc/canonical/noscript dédiés), puis variantes EN/ES.
   - Sitemap : l.706 `<loc>${d}/alertes/</loc>` priority 0.8 changefreq weekly.
   - BreadcrumbList JSON-LD injecté l.757/762-763 (`breadcrumbAlertes`).
   - → **Indexation, meta, breadcrumb, noscript = OK, ne pas casser.**

2. **Comportement runtime (le trou)** — `Sargasses_PROD.jsx` :
   - Le hero/landing (`LazyHomeAZ` / `GameFunnel` / `HeroVerdict`, montés l.11072-11144) ne s'affiche **QUE si `pathname === "/"`** (`showHero`, l.10393-10399). Sur `/alertes/`, `showHero=false`.
   - Aucune branche ne lit `pathname` pour `/alertes/`. Le visiteur atterrit donc directement sur la **carte / Archipel** (`navWorld` true par défaut l.10415), sans rien qui parle d'alertes. **La promesse de la SERP (« notifications temps réel ») n'est honorée nulle part au-dessus du pli.**

3. **Briques d'alerte qui EXISTENT déjà (à réutiliser, ne PAS réinventer)** :
   - `AlertScene` (l.7601-7663) : scène SVG 9 s « 6h du matin, le téléphone reçoit l'alerte, l'itinéraire bascule vers la plage propre ». Plancher reduced-motion l.7619. **C'est le visuel-clé du hub.** Déjà utilisée par `HeroVerdict` écran 4 (l.9283).
   - `AlertCapture` (l.7426-) : capture email click-triggered (« 🔔 Être prévenu si ça change »), POST Apps Script `source:"beach_alert"`, masquée si `sg_email` présent, event `sg_email_submit{source:"beach_alert",beach_id}`. Promesse vraie (entre dans le drip verdict matin).
   - `InlineEmailCapture` (l.6782-6867) : champ unique gratuit, A/B `em1`, POST Apps Script `source:"inline-beach"`, `sg_email_submit{source:"inline_beach"}`.
   - Push : `loadPushNow` / `PushPrimer` (l.10241-10295) + `InlinePushCTA` (l.6534) → OneSignal natif. Opt-in au **moment de valeur** (event `sg:value_moment`), jamais à froid (refus natif = blocage permanent du domaine).
   - Favoris : `favorites` = `g("sg_fav",[])` (l.10080) + `myBeachId` (`sg_my_beach`, l.10081). `findMostRelevantThreat(banks,beaches,favorites,...)` l.1362 sait scorer la menace sur les favoris.
   - `BrandIcon` (l.7669) : icônes maison `bell`/`brief`/`cal7`/`satellite`/`score`/`map` (remplacent les emojis OS sur surfaces de marque).
   - `Veilleur` (mascotte, `mood`), `verdictMeta`, `ScoreBlob`, `_t(lang,...)`, `abVariant(testId,variants,weights)` (l.1436), `track`, `g`/`s` (localStorage).

**Ce qui marche** : SEO/indexation/noscript de la page. **Ce qui manque** : tout l'écran live — un hub Premium qui (a) tient la promesse temps-réel, (b) capture l'email (levier #1), (c) ouvre `openPremium("alertes")` (levier modal→CTA).

---

## Objectif (barre HomeAZ + KPI visé)

Faire de `/alertes/` un **hub « Le veilleur personnel »** à la barre HomeAZ (golden-hour, calme au repos, Le Veilleur **rassure ≠ surveille**, zéro image IA), qui :

1. **Honore la promesse SERP** au-dessus du pli : « On surveille TA plage pendant que tu dors. Tu n'ouvres l'app que le jour où ça change. » (demande #1 GSC = temps réel / aujourd'hui).
2. **Capture l'email** d'entrée de hub, champ unique, promesse vraie (drip verdict matin) → attaque le **0,35 %** (KPI #2, levier #1).
3. **Ouvre `openPremium("alertes")`** sur la valeur (alerte la veille + brief matin + 7 j) → nourrit le **modal→CTA 2 %** (KPI #1) avec une source contextualisée mesurable.
4. Reste **escapable** vers la carte/fiche (anti-cul-de-sac), funnel + deep-links intacts.

KPI suivis (events existants, voir A/B) : `sg_email_submit{source:"alertes"}`, `sg_premium_modal_open{source:"alertes"}`, `sg_push_*`, puis `cta_to_redirect` (Apps Script funnel).

---

## Changements exacts (étape par étape)

> **Patron d'intégration** = identique à HomeAZ : un composant React monté **uniquement** sur le bon `pathname`, additif, derrière flag, control = comportement actuel (carte). On NE crée PAS de nouveau fichier de build : `AlertScene` + briques vivent déjà dans le monolithe. Le hub est un composant local de `Sargasses_PROD.jsx` (pas de Shadow DOM nécessaire : on n'a pas de CSS à classes génériques, on style inline comme `HeroVerdict`).

### Étape 1 — Détecter la route `/alertes/` (et EN/ES)

Dans le composant App (près de `showHero`, l.10393), ajouter un state dérivé du pathname :

```js
// Hub Premium /alertes/ (+ EN/ES). Comme showHero : pathname-gated, 1× au mount.
const ALERT_PATHS = /^\/(?:alertes|en\/sargassum-alerts|es\/alertas-sargazo)\/?$/
const[showAlertHub,setShowAlertHub]=useState(()=>{
  try{
    if(!ALERT_PATHS.test(window.location.pathname))return false
    if(window.location.search.includes("premium"))return false // deeplink paywall direct
    return true
  }catch(_){return false}
})
```

### Étape 2 — Flag A/B `pw_alertes` (3e bras additif)

À côté de `homeAZ` (l.10446), même forme :

```js
// A/B hub alertes : control = page actuelle (carte/Archipel directe), hub = écran dédié.
// Override ?pw_alertes=1/0. Conversion (openPremium) inchangée.
const[alertHubVariant]=useState(()=>{
  try{const q=window.location.search
    if(/[?&]pw_alertes=1/.test(q))return"hub"
    if(/[?&]pw_alertes=0/.test(q))return"control"
    return abVariant("pw_alertes",["control","hub"],[.5,.5])
  }catch(_){return"control"}
})
```

`showAlertHub` final = `showAlertHub && alertHubVariant==="hub"`.

### Étape 3 — Le composant `AlertHub` (nouveau, dans le monolithe)

Placer la fonction juste après `HeroVerdict` (≈ l.9555, avant `WorldBonus`). Gabarit visuel = **écran 4 « premium » de HeroVerdict** (l.9277-9306) étendu en page complète, MÊME palette/typo (`'Anton'` titres, fond `linear-gradient(180deg,#0C1D21,#0A1714)`, accent `#FFC72C`). Réutilise `AlertScene`, `BrandIcon`, `Veilleur`, `_t`, `track`.

Structure verticale (mobile-first, `maxWidth:560,margin:"0 auto"`) :

1. **Pli 1 — promesse + Le Veilleur serein** (golden-hour, calme au repos — pas d'anim idle hors `AlertScene`) :
   - Eyebrow daté `{dateLong} · LE VEILLEUR PERSONNEL`.
   - H1 `'Anton'` : `_t("On surveille ta plage pendant que tu dors.","We watch your beach while you sleep.","Vigilamos tu playa mientras duermes.")`
   - `<Veilleur mood="calm" size={64}/>` (un seul satellite, œil mi-clos, ne fixe pas l'utilisateur — règle de marque).
   - Sous-titre : `_t("Tu n'ouvres l'app que le jour où ça change. Le reste du temps, profite.","You only open the app the day it changes.","Solo abres la app el día que cambia.")`

2. **Pli 2 — `<AlertScene/>`** (l.7601, déjà reduced-motion-safe) dans un wrap arrondi identique à l.9283.

3. **Pli 3 — capture email gratuite (levier #1)** : réutiliser EXACTEMENT le markup/handler de `AlertCapture`/`InlineEmailCapture` mais en version « hub », champ unique :
   - Copie : `_t("Reçois le verdict du matin sur ta plage. Gratuit.","Get the morning verdict for your beach. Free.","Recibe el veredicto de la mañana. Gratis.")`
   - Sur submit : `track("sg_email_submit",{source:"alertes"})`, `s("sg_email",email)`, POST Apps Script identique à l.6801-6804/7438-7441 avec `source:"alertes"` (le drip-email accepte les nouvelles sources comme `beach_alert`). État `done` = même confirmation verte « le verdict du matin arrive dans ta boîte ». Masquer le champ si `g("sg_email")` (déjà inscrit) → afficher à la place « ✓ Tu es inscrit · gérer mes alertes » qui ouvre `openPremium("alertes_subscribed")`.
   - **Honnêteté** : ne PAS promettre du push tant qu'il n'est pas activé ; la promesse email est vraie par construction (entre dans le drip verdict matin).

4. **Pli 4 — preuve de valeur Premium** (3 lignes, icônes `bell`/`brief`/`cal7`, copie de l.9286-9288 mais contextualisée « TA plage ») :
   - `bell` : `_t("Une alerte la VEILLE quand un banc arrive sur ta plage","An alert the DAY BEFORE sargassum reaches your beach","Una alerta la VÍSPERA cuando llega el sargazo")`
   - `brief` : `_t("Le brief du matin : ta meilleure plage du jour","The morning brief: your best beach today","El brief matutino: tu mejor playa")`
   - `cal7` : `_t("Les 7 jours de prévisions, plage par plage","The 7-day forecast, beach by beach","Los 7 días de pronóstico")`

5. **Pli 5 — CTA conversion UNIQUE** : bouton or pleine largeur (style l.9297-9301) :
   `onClick={()=>onPremium("alertes")}` → `openPremium("alertes")`.
   Sous-ligne `_t("Sans engagement — annulable en 1 clic", ...)` (l.9304).

6. **Pli 6 — sorties (anti-cul-de-sac, escapable)** : deux liens discrets, pas de pop-up :
   - `_t("Voir l'état des plages maintenant →", ...)` → `onShowMap()` (ferme le hub, va à la carte).
   - `_t("Comment marchent nos prévisions →", ...)` → `href="/previsions/"` (maillage interne, déjà dans le noscript).
   - Header : une croix (×) en haut-droite qui `setShowAlertHub(false)` (révèle la carte derrière), comme la croix Archipel l.11399.

**Signature** : `function AlertHub({lang,island,beach,onPremium,onShowMap,onClose}){...}`
- `beach` = le `heroPick`/meilleur favori si dispo, pour personnaliser « ta plage » (sinon copie générique « ta plage »).
- Veiller au **plancher reduced-motion** : aucune anim infinie ; seul `AlertScene` bouge (1 boucle 9 s, déjà gardée l.7619).

### Étape 4 — Monter `AlertHub` au-dessus de la carte (z dédié)

Dans le rendu de App, à côté du bloc hero (l.11072), AVANT le shell carte, ajouter :

```jsx
{showAlertHub && alertHubVariant==="hub" && (
  <div style={{position:"fixed",inset:0,zIndex:1006,overflowY:"auto",background:"#0A1714"}}>
    <AlertHub
      lang={lang} island={island}
      beach={heroPick /* ou meilleur favori */}
      onPremium={src=>openPremium(src||"alertes")}
      onShowMap={()=>{setShowAlertHub(false);track("sg_alerts_to_map",{})}}
      onClose={()=>{setShowAlertHub(false);track("sg_alerts_close",{})}}
    />
  </div>
)}
```

- z 1006 = au-dessus de la carte (1005) et de l'Archipel, **sous** la fiche (1010) et le paywall (1100+) — `openPremium` s'ouvre par-dessus, intact.
- **Garde-fou nav_world** : empêcher l'auto-ouverture Archipel quand le hub est visible. Dans l'effet l.10421-10426, ajouter `||showAlertHub` à la liste des conditions qui `return` (sinon l'Archipel s'ouvre derrière).
- L'engagement-screen l.10432 : ajouter `showAlertHub?"alertes":` au début de la chaîne `screen=`.

### Étape 5 — Tracking (events `sg_*`, réutiliser à l'identique)

- Au mount du hub : `track("sg_alerts_view",{variant:"hub",lang})`.
- Email : `sg_email_submit{source:"alertes"}` (déjà whitelisté l.1467 ? — `sg_email_submit` y est) + `sg_email_view`.
- CTA : `openPremium("alertes")` émet déjà `sg_premium_modal_open{source:"alertes"}` (l.10963).
- Sorties : `sg_alerts_to_map`, `sg_alerts_close`.
- Si on ajoute un bouton push optionnel : réutiliser `loadPushNow("alertes")` (l.10253) + events `sg_push_*` existants — **jamais** de prompt natif à froid.

---

## A/B

- **Flag** : `pw_alertes` — `abVariant("pw_alertes",["control","hub"],[.5,.5])`.
- **Override QA** : `?pw_alertes=1` force le hub, `?pw_alertes=0` force le control.
- **Control voit** : exactement le comportement actuel sur `/alertes/` → la carte / Archipel directe (rien ne change pour le control, additif strict).
- **Hub voit** : l'écran `AlertHub` plein écran au mount, escapable vers la carte.
- Conversion (openPremium → Stripe on-site → pw_calm/pw_prelude) **strictement identique** dans les deux bras.
- Éval : `node scripts/automation/ab-eval.cjs --days=28` (compare `sg_premium_modal_open` & `sg_email_submit` par bras) + funnel Apps Script (`cta_to_redirect`). Mesure 4-8 semaines.

---

## Données réelles à brancher

- **Plage personnalisée** : `heroPick` (l.10465, meilleure plage propre du jour / plus proche si géoloc) OU premier favori (`g("sg_fav",[])[0]` → lookup dans `allBeaches`). Si aucune → copie générique « ta plage » (jamais inventer un nom).
- **Freshness** : `sargData.updatedAt` / `erddapTimestamp`. Règle dure : si âge ≥ 12 h, ne PAS afficher « EN DIRECT » ; afficher `_t("Vérification en cours", ...)`. Réutiliser le `upd` déjà calculé côté HeroVerdict (footer l.3312) ou recalculer `(Date.now()-new Date(sargData.updatedAt))/3.6e6 < 12`.
- **Forecast (preuve « la veille »)** : si on illustre avec un vrai banc, lire `weekly[beach.id].forecast[]` (champs réels confirmés : `day,date,afai,status,confidence,type,regime,sources`). N'afficher un « banc arrive le X » QUE si un `forecast[i].status` passe à `moderate`/`avoid` — sinon rester sur la scène générique `AlertScene`. **Jamais de `cleanFloor` atlantique** ; la teinte/le verdict suivent uniquement `forecast[].status/regime` (`feedback_forecast_floor_ban`).
- **Email** : POST Apps Script `APPS_SCRIPT_URL` (l.1446), `{email,island,source:"alertes",date:ISO}`, `mode:"no-cors"`. `island` = `IS_NEW_REGION?REGION.id.toUpperCase():hostname.includes("guadeloupe")?"GP":"MQ"` (comme l.6800/7437).
- **Honnêteté** : aucune fausse stat (« 12 000 abonnés »), aucun faux timestamp, aucune promesse push non tenue.

---

## SEO (si page)

**Ne RIEN casser** — la page est déjà indexée et générée. Le hub est runtime-only (JS), le crawl voit toujours le noscript + meta.

- **Title / desc / canonical / hreflang** : déjà gérés par le plugin `seo-pages` (l.402 + boucle EN/ES). Canonical = `/alertes/` (FR), `/en/sargassum-alerts/`, `/es/alertas-sargazo/`. Vérifier que les 3 sont émis et `<link rel="alternate" hreflang>` croisés (le plugin gère via `enPath`/`esPath`).
- **slug = nom = SEO** : `alertes` / `sargassum-alerts` / `alertas-sargazo` — **ne pas renommer**.
- **noscript** : `editorialContent['alertes']` (l.434) reste la source crawlable. Optionnel (amélioration, hors-scope strict) : enrichir d'un lien vers `/danger-sargasses-h2s/` (déjà cité dans d'autres articles) pour densifier le maillage — sinon ne pas toucher.
- **Maillage interne** : le hub pointe vers `/previsions/` (lien réel, dans le noscript) et la carte `/`. Vérifier chaque href avec `curl` avant ship (`feedback_validate_hrefs`).
- **Sitemap / BreadcrumbList** : déjà présents (l.706, l.757/762). Ne pas dupliquer.
- **Indexation MQ 3/30 · GP 2/30** : ne pas aggraver — comme le hub est JS pur au-dessus d'un index déjà servi, l'empreinte crawl est inchangée. Ne PAS modifier le pageShell (tâche htaccess `task_d48a64ca` est bloquante AVANT toute modif shell — ici on n'y touche pas).

---

## Vérification

> L'app preview TIMEOUT (rAF continu) → serveur local + Playwright (skill `sg-svg-scene`).

1. **Syntaxe JSX avant edit du monolithe** (obligatoire) :
   ```bash
   node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
   ```
2. **Proto isolé d'abord (recommandé)** : prototyper `AlertHub` en `design/proto-alertes.html` (réutiliser le moteur Veilleur v2 de `proto-veilleur-clip-v2.html` + `AlertScene`), servir + Playwright :
   ```bash
   python -m http.server 8790 --bind 127.0.0.1   # background
   # script .cjs DANS le repo : navigate http://127.0.0.1:8790/design/proto-alertes.html
   # waitForTimeout(1200) ; capter pageerror + console.error ; screenshot ; Read le png ; scroll + click CTA
   ```
   Juger soi-même la capture à la barre HomeAZ (calme au repos, Veilleur serein, lisible). Corriger AVANT port.
3. **Build complet** (intégration) :
   ```bash
   npm run build   # attendre "built in", vérifier le chunk + 136 pages + 0 erreur
   ```
4. **Vérif route live** (après build, sur le dist servi en 8790) :
   - `http://127.0.0.1:8790/alertes/?pw_alertes=1` → le hub s'affiche, Veilleur calme, AlertScene joue 1 boucle, email + CTA présents.
   - `http://127.0.0.1:8790/alertes/?pw_alertes=0` → carte (control), inchangé.
   - Click CTA → `openPremium("alertes")` ouvre le paywall (vérifier `sg_premium_modal_open` en console réseau `/collect`).
   - Submit email factice → confirmation verte, `sg_email_submit{source:"alertes"}` part.
   - Croix / « voir l'état maintenant » → ferme le hub, carte derrière, pas d'Archipel auto-ouvert.
   - `prefers-reduced-motion` (émuler dans Playwright) → aucune anim infinie, AlertScene figée.
5. **hreflang/href** : `curl -sI https://sargasses-martinique.com/alertes/` (200), idem `/en/sargassum-alerts/`, `/es/alertas-sargazo/`, `/previsions/`.

---

## Garde-fous spécifiques

- **Le Veilleur = UN satellite, rassure ≠ surveille** : `mood="calm"`, œil mi-clos, ne fixe JAMAIS l'utilisateur (pas d'œil-HAL). C'est une page « alerte/surveillance » → risque #1 de glisser vers l'anxiogène : la copie doit **rassurer** (« profite, on veille »), pas effrayer.
- **Doctrine calme** : repos = tableau. Seule `AlertScene` anime (1 boucle 9 s, déjà reduced-motion-safe l.7619). `prefers-reduced-motion` = plancher dur (early-return avant tout rAF). Pas de halo pulsant idle, pas d'aquarium.
- **Pas de UI-dans-l'UI** (`feedback_no_ui_in_ui`) : l'info vit dans la page ; pas de pop-up flottant par-dessus. Les sorties sont des liens en flux, pas des modals.
- **Conversion = `openPremium("alertes")` UNIQUE** : ne créer aucune autre porte d'achat. `stripe-config.php` JAMAIS touché.
- **Honnêteté push** : ne pas promettre de notification push tant que l'opt-in n'est pas fait ; ne jamais déclencher le prompt natif OneSignal à froid (refus = blocage permanent du domaine, l.10292-10294). Email = la promesse tenue par défaut.
- **Additif strict** : `pw_alertes==="control"` = ZÉRO changement de comportement sur `/alertes/`. Hub gated derrière `pathname` ET flag.
- **Forecast** : aucune `cleanFloor` atlantique ; tout « banc arrive » se branche UNIQUEMENT sur `weekly[id].forecast[].status/regime` réels (`feedback_forecast_floor_ban`).
- **SEO** : ne pas supprimer/renommer la page ni son noscript ; ne pas modifier le pageShell (htaccess bloquant). Valider chaque href par `curl` avant ship.
- Bump `public/sw.js CACHE_NAME` à chaque deploy de code. `git pull --rebase` avant push, stage fichier par fichier (jamais `git add -A`).
- **Vérif navigateur obligatoire** avant tout ship ; si la capture n'atteint pas la barre HomeAZ, refaire à la main avant de porter (pas d'agent-slop en prod).
