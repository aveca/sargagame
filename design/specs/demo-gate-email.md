# Demo-gate email à l'aha-moment — spec d'exécution

> Surface : capture email déclenchée AU MOMENT « aha » (le verdict + la prévision 7 j prennent vie sous les yeux), en échange de la démo continuée. **Levier #1** (capture actuelle 0,35 %). Cadre : `design/REFONTE-EXECUTION.md` + `design/REFONTE-MASTER.md`.
> Cible : bras A/B `demo_gate`, ADDITIF, réversible, control 100 % intact.

---

## État actuel

**Le composant de capture existant** — `Sargasses_PROD.jsx:6782` `function InlineEmailCapture({lang,beachName})` :
- Rendu UNE seule fois, dans la fiche plage, ligne `Sargasses_PROD.jsx:3500` :
  `<InlineEmailCapture lang={lang} beachName={beach.name}/>` — coincé entre le badge H2S (l.3489) et le « forecast teaser » flouté (l.3503).
- C'est une **carte statique** (titre + champ email + bouton). Aucun lien avec un moment d'engagement : elle est posée dans le scroll de la fiche, l'utilisateur la voit froide. Tracking : `sg_email_view` (l.6791), `sg_email_submit` (l.6796 — `source:"inline_beach"`), `sg_email_dismiss` (l.6859). A/B interne `em1` control/curiosity (l.6790).
- Garde anti-réaffichage : `g("sg_email_prompt",false)` (l.6788). POST vers Apps Script `no-cors` (l.6801) avec `{email,island,source,date}`. Stocke `sg_email` + `sg_email_prompt` en localStorage (l.6797-6798).
- **Ce qui marche** : le pipe email (Apps Script → Sheet `subscribers` → drip J+3/J+7/J+14, cf. `reference_email_system`). Le composant fonctionne, i18n FR/EN/ES OK, freshness honnête (pas de faux chrono).
- **Ce qui manque (cause du 0,35 %)** : la demande est faite AVANT toute valeur perçue, hors de tout moment fort. Pas de « gate » : la démo (forecast 7 j) reste accessible (floutée certes, mais c'est un teaser, pas un échange). Pas de wiring sur le moment où le Veilleur révèle le verdict/la courbe — le moment exact où l'utilisateur ressent « ah, ça marche ». Aucun A/B au niveau du *placement/déclenchement*, seulement sur la *copie* (`em1`).

**L'aha-moment existe déjà, sous forme d'animation, dans 2 surfaces :**
1. **HomeAZ** (`src/HomeAZ.jsx`, bras `home_az`) — beat 3 « PREMIUM » : `computeScroll()` (l.336) lève les barres de prévision `#fcBars .fcbar` (l.368-369) et déclenche `sg_landing_view{s:"premium"}` (l.375). C'est le pic d'engagement de la landing.
2. **proto-plage-plongee** (`design/proto-plage-plongee.html`, futur bras `pw_beach_dive`) — beat 3 : `raiseForecastBars()` (l.1426) + `applyForecastScrub(prog[3])` (l.1365). Les barres 7 j montent une par une = LE moment révélation.

**Données réelles dispo** (live `public/api/copernicus/sargassum.json`, vérifié 2026-06-16) :
`weekly[id].forecast[]` = `[{day,date,afai,status,confidence,type,regime,sources}]` — 7 entrées. `source:"erddap-live"`, `updatedAt` ISO. Le verdict du jour = `forecast[0].status` + `scores`. **Tout est honnête et déjà branché** dans la fiche via `activeWeekly?.forecast` (cf. `Sargasses_PROD.jsx:4365`).

---

## Objectif (barre HomeAZ + KPI visé)

Transformer la capture froide en **gate à l'aha-moment** : au pic d'engagement (le Veilleur vient de révéler le verdict + la courbe 7 j de TA plage), proposer « Reçois ce verdict chaque matin » — l'email débloque/prolonge la valeur (les jours 3→7 de la courbe, ou « le matin où ça change »).

- **Barre HomeAZ** : même golden-hour, même Le Veilleur serein (rassure ≠ surveille), doctrine calme (repos = tableau, `prefers-reduced-motion` = plancher dur), zéro image IA, info DANS la scène (pas de pop-up flottante par-dessus le monde — cf. `feedback_no_ui_in_ui`). La carte de capture est un **panneau ancré dans le flux du beat**, pas une modale qui surgit.
- **KPI** : capture email **0,35 % → cible ≥ 3 %** (×8). Mesuré par `sg_email_submit / sg_email_view` segmenté par `placement`. Garde-fou : ne PAS dégrader `sg_premium_modal_open` (le gate ne doit pas voler le clic Premium — il est en aval/parallèle, jamais en travers de `openPremium`).

---

## Changements exacts (étape par étape)

> Principe : on ne touche PAS le pipe (Apps Script, drip). On change QUAND et OÙ la demande est faite, et on la lie à l'aha. 1 composant réutilisé, 2 points de branchement (fiche + HomeAZ), tout sous le flag `demo_gate`.

### Étape 1 — Généraliser `InlineEmailCapture` en `DemoGateCapture` (rétro-compatible)

Dans `Sargasses_PROD.jsx`, à `function InlineEmailCapture` (l.6782), **ajouter des props** sans casser l'appel existant :

```jsx
function InlineEmailCapture({lang,beachName,placement="inline_beach",headline,sub,ctaLabel,onSubmitted,forecastDays}){
```

- `placement` (string) — passé tel quel dans `track("sg_email_view",{placement})` (l.6791) et `track("sg_email_submit",{source:placement,variant:em1V})` (l.6796 — remplacer `source:"inline_beach"` par `source:placement`). Valeurs : `"inline_beach"` (défaut, control actuel), `"aha_dive"`, `"aha_home"`.
- `headline`/`sub`/`ctaLabel` — overrides de copie optionnels (objets `{fr,en,es}` ou chaînes déjà résolues) ; si absents → fallback sur la copie `em1` existante (l.6828-6843). Ne PAS supprimer la copie existante.
- `onSubmitted` — callback appelé après `setSubmitted(true)` (l.6799) ; permet à l'aha-scene de continuer la démo (révéler J3→J7) après capture.
- `forecastDays` — tableau optionnel `[{day,status}]` (= `weekly[id].forecast`) pour la mini-courbe « preuve » dans la carte (voir étape 3).

L'appel existant l.3500 reste **inchangé** quand `demo_gate` = control (placement défaut, copie défaut). Aucune régression.

### Étape 2 — Brancher le gate dans la fiche (aha = forecast teaser)

Dans la fiche, le moment « aha » non-premium est le **forecast teaser flouté** (l.3503-3529 : la prévision demain blurée + « Débloquer les 7 jours »). C'est exactement le point de tension valeur.

- Sous flag `demo_gate=on` ET `!isPremium` : à l'emplacement actuel de `<InlineEmailCapture>` (l.3500), passer en mode aha :
  ```jsx
  const demoGate=(()=>{try{const q=window.location.search;if(/[?&]demogate=1/.test(q))return true;if(/[?&]demogate=0/.test(q))return false;return abVariant("demo_gate",["control","gate"],[.5,.5])==="gate"}catch(_){return false}})()
  ```
  (le déclarer une fois dans le composant fiche, à côté de `pwH2s` l.3082.)
- Quand `demoGate` :
  ```jsx
  <InlineEmailCapture lang={lang} beachName={beach.name} placement="aha_dive"
     forecastDays={(activeWeekly?.forecast||[]).slice(0,7)}
     headline={{fr:`Reçois le verdict de ${beach.name} chaque matin`,en:`Get ${beach.name}'s verdict every morning`,es:`Recibe el veredicto de ${beach.name} cada mañana`}}
     sub={{fr:"La courbe complète des 7 jours + alerte le matin où ça change. Gratuit.",en:"The full 7-day curve + alert the morning it flips. Free.",es:"La curva completa de 7 días + alerta la mañana que cambia. Gratis."}}
     ctaLabel={{fr:"Recevoir",en:"Get it",es:"Recibir"}}/>
  ```
  Quand `!demoGate` → l'appel actuel (control) reste l.3500 inchangé.
- **Ordre** : le gate vient JUSTE APRÈS le teaser flouté (l.3529) — l'utilisateur voit la prévision floue (aha visuel), puis la carte « débloque-la gratuitement par email ». NE PAS retirer le `onPremiumClick("forecast_teaser")` (l.3504) : le clic Premium reste un chemin parallèle (le gate ne remplace JAMAIS `openPremium`).

### Étape 3 — Mini-preuve dans la carte (réutiliser le pattern `fcBars`)

Dans `InlineEmailCapture`, quand `forecastDays` est fourni, rendre une **bande de 7 mini-barres** AU-DESSUS du champ (entre `sub` l.6843 et le `<form>` l.6844), 3 visibles + 4 floutées :

- Réutiliser le pattern visuel des barres de `HomeAZ` (`#fcBars .fcbar`, cf. `src/home-az-assets.js`) et de `proto-plage-plongee` (`.fcbar`, l.193 + `raiseForecastBars` l.1426) : barres `scaleY` montantes, couleur = `ST[status].c` (clean=vert, mod=jaune, avoid=corail). Les 3 premières nettes (= ce que l'utilisateur voit déjà), les 4 dernières `filter:blur(5px)` = ce que l'email débloque. Texte sous la bande : `J1 J2 J3 · · · ·`.
- Inline-styles cohérents avec la carte existante (l.6817-6822, gradient `#0D1E1C→#142824`, glow ambient). **Pas de nouvelle anim infinie** (doctrine calme) : la montée des barres se joue une fois au montage (CSS transition `transform .5s`, stagger par `transition-delay`), early-return si `prefers-reduced-motion` (barres figées à `scaleY(1)`).
- Honnêteté : les barres reflètent les VRAIS `forecast[].status`. Si `forecastDays` vide/absent → ne rien rendre (pas de barre inventée).

### Étape 4 — Brancher le gate dans HomeAZ (aha = beat 3 « PREMIUM »)

HomeAZ est en Shadow DOM, contenu trusté byte-identique (`src/home-az-assets.js` généré par `scripts/build-homeaz.cjs`). NE PAS éditer le HTML/CSS du proto à la main dans le JS. Le gate y est **un hook**, pas un nouveau DOM injecté en `innerHTML` (interdit, hook sécurité).

Approche minimale, additive, sans toucher la scène SVG :
- Ajouter un hook `H.onAha` au moteur (`src/HomeAZ.jsx`), appelé UNE fois quand le beat 3 atteint le pic — au point exact où `sg_landing_view{s:"premium"}` se déclenche (`computeScroll`, l.375) :
  ```js
  if(active===3 && prog[3]>0.2 && !fired.premium){ fired.premium=true; track("sg_landing_view",{s:"premium"}); if(!dead && H.onAha) H.onAha(); }
  ```
- Côté composant React `HomeAZ` (l.728 `const hooks={...}`), ajouter `onAha:()=>{ cbRef.current.onAha && cbRef.current.onAha(); }` et propager la prop `onAha` (l.703).
- Côté app (montage HomeAZ dans `Sargasses_PROD.jsx`, ~l.10446+), passer `onAha={()=>setShowDemoGate(true)}` SEULEMENT si `demo_gate=on`. `showDemoGate` rend, en overlay ancré au bas du flux HomeAZ (PAS une modale flottante par-dessus la scène — un panneau sous le viewport, cohérent `feedback_no_ui_in_ui`), un `<InlineEmailCapture placement="aha_home" forecastDays={heroForecast} .../>`. Au submit (`onSubmitted`), fermer le gate et laisser le CTA Premium natif (`ctaPremium` → `openPremium("landing_premium")`, `src/HomeAZ.jsx:522`) intact.
- **Si HomeAZ control (`home_az`=control)** : ne rien faire — le gate HomeAZ n'existe que quand `home_az=az`. Le gate fiche (étape 2) couvre le control HomeAZ.

### Étape 5 — Garde anti-spam unifiée

- Le composant lit déjà `g("sg_email_prompt",false)` (l.6788) → si déjà capturé/dismiss, il ne s'affiche nulle part (fiche ET HomeAZ). Conserver tel quel.
- HomeAZ : `onAha` ne doit déclencher le gate qu'une fois par session (drapeau local `ahaFired`) ET seulement si `!g("sg_email_prompt",false)`.

---

## A/B

- **Flag : `demo_gate`** — `abVariant("demo_gate",["control","gate"],[.5,.5])`. Override URL `?demogate=1` (force gate) / `?demogate=0` (force control). Pattern identique à `pw_h2s` (l.3082) / `pw_planb` (l.3078).
- **Control voit** : exactement l'app actuelle — `InlineEmailCapture` froide à l.3500 (placement `inline_beach`, copie `em1`), forecast teaser flouté inchangé, aucune carte au beat 3 de HomeAZ.
- **Variant `gate` voit** : capture liée à l'aha (copie contextualisée « verdict de {plage} chaque matin » + mini-courbe preuve) dans la fiche au point teaser, et un panneau au beat 3 dans HomeAZ.
- L'A/B interne `em1` (copie) reste actif et orthogonal : on garde `variant:em1V` dans `sg_email_submit` pour ne pas casser l'analyse en cours.
- Éval : `node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script. Segmenter `sg_email_view`/`sg_email_submit` par `placement` ET `ab_demo_gate`. **Goût = data live, jamais validation fondateur.**

---

## Données réelles à brancher

- **Verdict + courbe** : `weekly[id].forecast[]` (champs `day,date,afai,status,confidence,type,regime`). Fiche : `activeWeekly?.forecast` (déjà calculé, `Sargasses_PROD.jsx:4365`). HomeAZ : la prévision de la plage hero (`heroPick`/`sargData.weekly[heroId].forecast`).
- **Plage** : `beach.name` (fiche), `beach.name`/`heroPick.name` (HomeAZ). Slug = nom (jamais renommer).
- **Honnêteté** (durs) :
  - Freshness réelle : réutiliser le rendu honnête existant (jamais de faux chrono). Si `updatedAt` > 12 h → « vérification en cours », pas « EN DIRECT » (cf. `freshLabel()` `src/HomeAZ.jsx:128`).
  - Barres = vrais `forecast[].status`. **Jamais** de `cleanFloor` atlantique ni de teinte inventée (`feedback_forecast_floor_ban`) ; la couleur vient UNIQUEMENT de `status/regime`.
  - Si pas de forecast → pas de mini-courbe (rien d'inventé).
- **Email** : POST inchangé vers Apps Script (l.6801) `{email,island,source:placement,date}`. `island` via la logique existante (l.6800). Pipe drip J+3/J+7/J+14 inchangé (`reference_email_system`).

---

## SEO (si page)

**Aucune nouvelle page, aucune route, aucun changement d'URL.** Le gate est un composant in-app monté dans la fiche (`/plages/<slug>/`) et la landing existantes. Donc :
- Pas de title/meta/canonical/hreflang à toucher ; les 136 pages plage + leur indexation (MQ ~3/30, GP ~2/30) ne sont PAS impactées (le gate est rendu côté client, after-hydration, dans le shell existant).
- `slug=nom=SEO` respecté (on ne touche aucun slug).
- Ne pas injecter de contenu qui bloque le LCP/indexation : le gate est additif et lazy (n'apparaît qu'au scroll/aha), sous le fold.
- Maillage interne : inchangé.

---

## Vérification

```bash
# 0) syntaxe JSX du monolithe AVANT tout (obligatoire avant build)
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"

# 0bis) si src/HomeAZ.jsx modifié → régénérer assets si markup touché (sinon inutile)
#   node scripts/build-homeaz.cjs   (NE PAS éditer src/home-az-assets.js à la main)

# 1) serveur local (l'app preview TIMEOUT à cause du rAF) — background
python -m http.server 8790 --bind 127.0.0.1

# 2) Playwright (script .cjs DANS le repo) — vérifier les 3 chemins :
#   a. fiche control : navigate http://127.0.0.1:8790/?demogate=0 → ouvrir une plage →
#      capture froide présente, forecast teaser flouté, AUCUNE mini-courbe.
#   b. fiche gate    : ?demogate=1 → ouvrir une plage → carte aha avec mini-courbe 7j
#      (3 nets + 4 floutés), copie « verdict de <plage> », champ email.
#   c. HomeAZ gate   : ?home_az=1&demogate=1 → scroller jusqu'au beat 3 « PREMIUM » →
#      panneau gate apparaît UNE fois, sous le viewport, pas par-dessus la scène.
#   Pour chaque : waitForTimeout(1200), capter pageerror + console.error, screenshot, Read le png.
#   Soumettre un email bidon → vérifier état "submitted" (✅) + track sg_email_submit{source:"aha_dive"|"aha_home"}.
#   prefers-reduced-motion : relancer en emulant reduce → barres figées, gate cliquable, zéro rAF qui tourne.

# 3) build complet (intégration) :
npm run build   # attendre "built in", vérifier chunk + 136 pages + 0 erreur

# 4) smoke EUR : rebuild MQ d'abord (cf. REFONTE-EXECUTION §5).
```

**JUGER soi-même les captures** (barre = HomeAZ). Si la carte est moche/illisible ou si la mini-courbe ne ressemble pas aux barres HomeAZ → corriger AVANT ship.

---

## Garde-fous spécifiques

- **Conversion = `openPremium(source)` UNIQUE, intacte.** Le gate ne remplace, ne masque, ni ne retarde JAMAIS un chemin Premium : `onPremiumClick("forecast_teaser")` (l.3504) et `ctaPremium`/`openPremium("landing_premium")` (`src/HomeAZ.jsx:522`) restent cliquables en parallèle. Mesurer que `sg_premium_modal_open` ne baisse pas dans le bras gate.
- **Tracking `sg_*` à l'identique** : réutiliser `sg_email_view`/`sg_email_submit`/`sg_email_dismiss` (pas de nouvel event qui casserait le funnel — leçon `funnel_tracking_gap`). Seul ajout = la prop `placement` DANS ces events existants.
- **Pas de pop-up par-dessus la scène** (`feedback_no_ui_in_ui`) : dans HomeAZ, le gate est un panneau ancré dans le flux (bas du beat), pas une modale flottante centrée. Dans la fiche, c'est une carte dans le scroll (comme aujourd'hui).
- **Doctrine calme + reduced-motion plancher dur** : la montée des barres = transition one-shot au montage, JAMAIS d'anim `infinite`. `prefers-reduced-motion` → early-return, barres figées, tout cliquable (cf. `src/HomeAZ.jsx:562`).
- **Le Veilleur = UN satellite serein** : si on ajoute une réaction du Veilleur à la capture (ex. clin d'œil au submit), il rassure ≠ surveille (œil mi-clos, jamais HAL). Optionnel — ne pas faire si ça alourdit le slice.
- **Shadow DOM HomeAZ** : aucun `innerHTML`. Si du DOM doit être injecté dans le shadow → `createContextualFragment` + `<style>.textContent` (cf. `src/HomeAZ.jsx:726-727`). Idéalement, le gate React vit HORS du shadow (overlay React classique sous l'hôte), piloté par `onAha` — zéro édition du markup trusté.
- **Additif + réversible** : control byte-identique à la prod actuelle. `?demogate=0` doit rendre l'app strictement comme avant.
- **Anti-spam** : un seul affichage par session, jamais si `sg_email_prompt` déjà vrai (déjà capturé/dismiss).
