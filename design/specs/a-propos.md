# /a-propos/ (page confiance) — spec d'exécution

> Cadre : `design/REFONTE-EXECUTION.md` + tête `design/REFONTE-MASTER.md`. Barre = `src/HomeAZ.jsx` (golden-hour, Le Veilleur **rassure ≠ surveille**, doctrine calme, zéro image IA). Tout = ADDITIF + A/B + réversible + vérifié navigateur, control intact, conversion via `openPremium` UNIQUE (ici : deep-link `/?paywall=1`), tracking `sg_*` identiques, data HONNÊTE.

---

## État actuel

**Architecture (important) :** `/a-propos/` est une **page HTML 100 % statique**, PAS un écran du monolithe React. Elle vit dans `public/a-propos/index.html` (308 lignes) + `public/a-propos/colors_and_type.css` (tokens lift de `Sargasses_PROD.jsx`). Vite copie `public/` verbatim dans `dist/` (aucune génération dans `vite.config.js` — vérifié : la seule occurrence `a-propos` dans `vite.config.js` est la ligne sitemap `708`). Donc :
- **`abVariant()` est INDISPONIBLE ici** (c'est une primitive React du monolithe). L'A/B doit être fait par un petit script inline dans la page statique (cf. section A/B).
- Page **FR-only** et **MQ-only** : `scripts/prepare-ftp.cjs:684` whiteliste `'a-propos'` pour MQ uniquement ; `vite.config.js:708` n'émet l'URL sitemap que `${isGP ? '' : ...}`. Le pendant USD/EN est `public/about/index.html` (page séparée, encre `#0A1714`, hors scope ici).

**Ce qui est servi / le maillage (vérifié) :**
- `public/.htaccess:110-115` : `/a-propos/` est une **vraie page** ; un 301 legacy la masquait (régression 2026-06-10) — règle dure « ne JAMAIS 301 un chemin servable ».
- `public/.htaccess:248-252` : `^(fiabilite|reliability|fiabilidad)/?$ → /a-propos/ [R=302,L]` **uniquement si la page fiabilité manque** (`!-f !-d`). Donc /a-propos/ est le filet de secours de /fiabilite/.
- La page pointe **2× vers `/fiabilite/`** (l.197 et l.260) → maillage interne à NE PAS casser.
- CTA conversion : `<a href="/?paywall=1&utm_source=apropos">` (l.299) et `/?paywall=1&utm_source=apropos_tarifs` (l.301). C'est le **vrai** déclencheur : `Sargasses_PROD.jsx:10966` lit `?paywall=1` au mount et appelle `openPremium("deeplink_apropos")` puis `history.replaceState`. ✅ branché.

**Ce qui marche :** structure narrative solide (5 sections numérotées 01→05 + hero + CTA night), tokens corrects (`colors_and_type.css`), copie honnête (« On se trompe parfois. On l'écrit. », « On ne fabrique pas d'avis. »), liens fiabilité corrects, CTA fonctionnel.

**Ce qui ne passe PAS la barre HomeAZ / ce qui manque :**
1. **Aucune scène golden-hour.** Le hero est un bloc texte sur fond crème + grille CSS ; pas de mer/soleil/Veilleur. HomeAZ et `proto-map-v2.html` ouvrent sur une mer golden-hour pleine + Le Veilleur. → Hero off-brand.
2. **Le Veilleur est absent** alors que la page « confiance » est l'endroit idéal pour le présenter (rassure ≠ surveille).
3. **Données 100 % en dur / FAUSSE FRAÎCHEUR** — viol direct de la doctrine :
   - l.149 `<span>Maj. 07:03</span>` (timestamp inventé), l.222 `document` n/a (page sans JS) — la « fraîcheur » affichée ne lit RIEN.
   - l.148 `4×/jour`, l.176 `1×/heure`, badges `SAT · L4`, `SIR v1.4` : OK (descriptifs méthode, pas des mesures), mais aucune fraîcheur réelle ni hit-rate réel.
   - l.199-225 graphe backtest = **courbe SVG décorative inventée** (paths codés en dur `M0,48 L26,44…`), pas la vraie précision. À remplacer par un chiffre réel ou à assumer comme schéma de méthode (pas un résultat).
   - l.243 bio fondateur « 45 min perdus » : OK (récit, pas une donnée mesurée).
4. **Témoignages (section 04)** : déjà vidée volontairement (« On ne fabrique pas d'avis ») → bon, à garder, mais la remplacer par de la **preuve mesurable réelle** (fiabilité chiffrée tirée du backtest).
5. **Pas de canonical / og / hreflang** dans le `<head>` (l.3-7) → trou SEO (cf. tâche B indexation).
6. **Largeur figée `max-width:390px`** (l.10) — mobile-only ; la barre veut le « app feel » responsive (chrome capé ~520-560px, cf. `feedback_responsive_app_feel`).
7. **Aucun tracking `sg_*`** : on ne sait pas combien voient /a-propos/, ni le CTR vers le paywall.

---

## Objectif (barre HomeAZ + KPI visé)

Refondre `/a-propos/` à la barre HomeAZ : **ouvrir sur une scène golden-hour avec Le Veilleur** (qui veille la mer, serein), puis dérouler la preuve de confiance avec **des chiffres RÉELS** (fiabilité par régime tirée du backtest, fraîcheur live réelle), et **conclure sur le CTA paywall** déjà branché.

La page confiance est un **amplificateur de conversion** (elle est visée par le lien trust du paywall et le 302 fiabilité), pas une porte de conversion nouvelle. Donc :
- **KPI primaire = CTR `/a-propos/` → `/?paywall=1` (clic CTA).** Aujourd'hui non mesuré (0 tracking). On instrumente d'abord, puis on optimise. Cible directionnelle : faire monter le CTR de la page confiance ; secondairement contribuer au goulot **modal→CTA 2 %** en arrivant « réchauffé » sur le paywall.
- **Garde-fou honnêteté = #1** : remplacer toute fausse fraîcheur / faux graphe par du réel ou rien (doctrine `feedback_data_reliability` + kill-switch <12h).

---

## Changements exacts (étape par étape)

> Tout se passe dans `public/a-propos/index.html` (+ éventuellement `public/a-propos/colors_and_type.css` déjà présent, ne PAS dupliquer les tokens). On garde le squelette 5 sections, on remplace **hero + section 02 (backtest) + section 04 (preuve)** par du réel, on ajoute scène + Veilleur + fraîcheur live + tracking + A/B. **Control = la page actuelle** (servie quand `?az=0` ou hors-bucket).

### 1. `<head>` — SEO + assets (réutiliser tokens existants)
Dans `public/a-propos/index.html` l.3-7, ajouter AVANT `</head>` (cf. section SEO pour les valeurs exactes) :
- `<link rel="canonical" href="https://sargasses-martinique.com/a-propos/">`
- `<meta name="description" content="…">` (cf. SEO)
- OG/Twitter de base (réutiliser `public/social-share.png` déjà déployé).
- Préconnect fonts identique à `proto-map-v2.html:7-9` (Anton + Bricolage + JetBrains Mono) — déjà importé via `colors_and_type.css:8`, donc **ne pas re-importer**, juste s'assurer du `preconnect`.

### 2. HERO → scène golden-hour + Le Veilleur (réutiliser `proto-map-v2`)
Remplacer le bloc `.hero` (l.121-126) par une scène SVG golden-hour pleine largeur (hauteur ~46svh), **portée 1:1 de `design/proto-map-v2.html`** :
- **Fond mer** : copier le `#stage` background gradient de `proto-map-v2.html:22-24` (golden-hour radial + linéaire) + `.sun` l.25-28 (`sunBreath 11s` — animation respiration douce, autorisée car lente/non-idle-aquarium ; coupée par reduced-motion).
- **Le Veilleur** : copier le groupe SVG `#veilleur` de `proto-map-v2.html:126-135` (1 seul satellite, œil mi-clos serein, halo `#phalo`, antenne dot vert). C'est la version « rassure ≠ surveille » validée. Le poser coin haut-droit. **NE PAS** le faire fixer l'utilisateur (pas d'œil-HAL). Pour une version plus riche/animée 3 humeurs, le SVG source canonique est `design/proto-veilleur-clip-v2.html` (œil mi-clos, snap couleur, transform corrigé) — préférer le `#veilleur` compact de proto-map-v2 pour la page (statique au repos, doctrine calme).
- **Copie hero** par-dessus (garder le H1 actuel mais le passer en golden-hour) :
  - eyebrow : `À PROPOS · TRANSPARENCE` (style `.eyebrow` de `proto-plage-plongee.html:110`).
  - H1 Anton : « **POURQUOI NOUS FAIRE CONFIANCE ?** » (garder, mais blanc sur scène + `text-shadow`, cf. `proto-plage-plongee.html:118-121`).
  - sous-titre : garder l.124 mais en `.sub` clair sur scène.
  - **Pill fraîcheur LIVE réelle** (remplace l.125/149) : reprendre le composant `.freshpill` de `proto-plage-plongee.html:88-94` (dot pulse + texte mono). Texte = fraîcheur calculée par le script inline (cf. section Données réelles). **Jamais de timestamp en dur.**
- Veil de lisibilité bas : copier `.veil` de `proto-map-v2.html:66`.
- Pattern SVG/cover-math : viewBox `0 0 800 600`, `preserveAspectRatio` — réutiliser le moteur de la skill `sg-svg-scene` (1 seul rAF, pause `visibilitychange`, **early-return reduced-motion avant tout rAF**).

### 3. SECTION 02 (BACKTEST) → fiabilité RÉELLE par régime
Remplacer le faux graphe SVG (l.199-225) et le chiffre absent par les **vrais** chiffres tirés du backtest (même source que `/fiabilite/`). Deux options, choisir la robuste :

**Option retenue (statique au build, zéro JS bloquant) :** au build, injecter les chiffres réels dans la page via un nouveau bout de `scripts/lib/reliability-page.cjs` OU un mini step `closeBundle` qui lit `scripts/automation/data/backtest-results.json` et stamp la page. MAIS comme `/a-propos/` est committé dans `public/` (jamais généré), préférer :

**Option simple et honnête (runtime, fetch same-origin) :** garder le `.bt-wrap` night card, mais :
- remplacer la courbe inventée par **un grand chiffre réel** `.bt-stat-big` rempli par fetch JS : `fetch('/api/copernicus/sargassum.json')` n'a PAS le hit-rate ; le hit-rate vit dans `backtest-results.json` qui n'est **pas** publié dans `public/api/`. → **Publier** `dist/api/reliability.json` (petit) au build depuis `backtest-results.json` (`regimeReliability.regimes.{calm|high}` + `window` + `headline`), puis la page fait `fetch('/api/reliability.json')`.
  - Champs à publier (exacts, vérifiés dans `backtest-results.json`) : `overall.statusHitRate` (78), `totalPairs` (3300), `regimeReliability.window` ("2026-05-17 → 2026-06-16"), `regimeReliability.regimes.calm.cleanReliabilityPct` (100), `.cleanSamples` (2395), `.falseAlarmRatePct` (22), `regimeReliability.headline.fr`.
  - Affichage HONNÊTE (instruction `feedback_data_reliability` + note `regimeReliability`) : **publier le hit-rate PAR RÉGIME, jamais le global seul** (le global 78 % masque que les ALERTES saison calme sont peu fiables). Montrer : « **100 %** des prévisions “mer propre” vérifiées (saison calme, sur 2395) » + « les rares alertes restent à faible confiance tant que la donnée ne confirme pas » + fenêtre datée.
  - Si `reliability.json` indispo (fetch fail) → **la section saute** (n'écrire RIEN), comme `reliability-page.cjs:12`.
- Garder le lien `→ /fiabilite/` (l.197) intact.
- Le petit schéma « prévu vs observé » peut RESTER **uniquement s'il est étiqueté comme schéma de méthode** (pas un résultat) ; sinon le supprimer. Ne pas laisser croire que c'est une mesure.

### 4. SECTION 04 (PREUVE) → garder le refus des faux avis + lien fiabilité
Garder tel quel (l.254-261) : c'est déjà honnête. Optionnel : injecter le même chiffre réel « X prévisions confrontées au satellite » (de `reliability.json`) pour donner du poids mesurable.

### 5. Chrome / responsive
- Topbar (l.115-118) : garder le `← Retour` (href `/`) + sélecteur langue (cosmétique FR-only : laisser, ne pas activer EN/ES ici).
- `max-width:390px` (l.10) → passer à **520px** pour l'app-feel (cf. `feedback_responsive_app_feel` : chrome capé 520-560px), garder le shadow page. Vérifier que la scène reste correcte en 520px.

### 6. Tracking `sg_*` (instrumenter — KPI primaire)
Ajouter un script inline qui POST same-origin sur `/collect.php` (cf. `public/collect.php` : accepte `{ d: <payload JSON> }` en POST, 204, fire-and-forget) :
- au load : `sendBeacon('/collect.php', JSON.stringify({ev:'sg_view', page:'apropos', az:<variant>}))`.
- au clic CTA (`.cta-btn` l.299 + `.cta-alt` l.301) : `sg_apropos_cta` avec `{src:'apropos'|'apropos_tarifs', az}` **avant** la navigation (le paywall fire ensuite ses propres `sg_*` côté app). **Réutiliser les noms d'events de l'app** ; ne PAS inventer un nouveau schéma de funnel (cf. `funnel_tracking_gap`). Si un event « page confiance vue » existe déjà côté monolithe, l'aligner.
- Le clic CTA navigue toujours vers `/?paywall=1&utm_source=apropos` (inchangé) → la conversion reste `openPremium` UNIQUE.

---

## A/B

- **Flag : `az`** (cohérent avec la famille `home_az`). Comme la page est statique (pas de `abVariant()` React), l'A/B est géré par un **script inline** en tête de page :
  ```js
  // Bucket persistant 50/50, override URL ?az=1 (variant) / ?az=0 (control)
  var qs=new URLSearchParams(location.search), az;
  if(qs.get('az')==='1'||qs.get('az')==='0'){ az=qs.get('az')==='1';
    try{localStorage.setItem('sg_az_apropos',az?'1':'0')}catch(e){} }
  else { try{var s=localStorage.getItem('sg_az_apropos');
    az = s!=null ? s==='1' : Math.random()<0.5;
    localStorage.setItem('sg_az_apropos',az?'1':'0')}catch(e){ az=Math.random()<0.5 } }
  document.documentElement.classList.toggle('az-on', az);
  ```
- **Control (`az=0`) = la page actuelle EXACTE** : tout le nouveau (scène SVG hero, Veilleur, freshpill, fiabilité réelle, responsive 520px) est gardé sous `.az-on` (CSS) ou ne s'active que si `az` est vrai (JS). Le hero texte/grille actuel et le `max-width:390px` restent le default. → control 100 % intact, réversible (retirer `.az-on` = retour à l'actuel).
- **Variant (`az=1`)** : scène golden-hour + Le Veilleur + fraîcheur live + fiabilité réelle + 520px.
- L'override `?az=1`/`?az=0` est testable à la main (vérif navigateur).
- **Mesure** : le bucket `az` part dans chaque beacon `sg_view`/`sg_apropos_cta` → comparer le CTR CTA control vs variant via `stats.php` / l'analyse first-party (28j). Pas de jugement de goût fondateur ; A/B live (cf. `feedback_dont_show_wip`).

---

## Données réelles à brancher

| Donnée affichée | Source réelle | Champ exact | Honnêteté |
|---|---|---|---|
| Pill fraîcheur hero | `GET /api/copernicus/sargassum.json` | `updatedAt` → `(Date.now()-updatedAt)/3.6e6` h | **<12h → « il y a Nh » ; ≥12h → « vérification en cours »** (kill-switch, jamais de timestamp en dur). Remplace l.149 `Maj. 07:03`. |
| Hit-rate fiabilité | `GET /api/reliability.json` (à publier au build) | `regimeReliability.regimes.calm.cleanReliabilityPct` (100) + `.cleanSamples` (2395) + `.window` | **Par régime, jamais le global seul.** Montrer la fenêtre datée + l'échantillon. |
| « X prévisions confrontées » | idem | `totalPairs` (3300) | chiffre brut, daté. |
| Headline fiabilité | idem | `regimeReliability.headline.fr` | copier verbatim (déjà rédigé honnête). |
| Sources (Copernicus/NOAA/Open-Meteo) | descriptif méthode | — | OK tel quel (méthode, pas mesure) ; **retirer `Maj. 07:03`** des 3 cards `.src-meta`. |
| Bio fondateur, garanties 24h/30j/Stripe | récit/offre | — | OK (pas des données mesurées). Vérifier cohérence offre avec l'app (essai 24h sans CB). |

**Nouveau fichier à publier au build** : ajouter dans `vite.config.js` (closeBundle, à côté de la génération `/fiabilite/`, ~l.685) :
```js
// /api/reliability.json — sous-ensemble PUBLIC du backtest pour /a-propos/ (même source que /fiabilite/)
try {
  const bt = JSON.parse(readFileSync(resolve(__dirname,'scripts/automation/data/backtest-results.json'),'utf-8'))
  const out = { overall: bt.overall, totalPairs: bt.totalPairs, computed: bt.computed,
                regimeReliability: bt.regimeReliability }
  const apiDir = resolve(__dirname,'dist/api'); mkdirSync(apiDir,{recursive:true})
  writeFileSync(resolve(apiDir,'reliability.json'), JSON.stringify(out))
} catch(e){ console.warn('reliability.json non publié:', e.message) }
```
(vérifier que `mkdirSync/writeFileSync` sont importés en tête de `vite.config.js` ; sinon `import { ... } from 'node:fs'`.) **Ne PAS** exposer les champs résiduels par plage si on ne veut pas les afficher — garder le payload minimal.

---

## SEO (si page)

- **Slug** : `/a-propos/` — **NE PAS renommer** (slug = nom = SEO ; sitemap `vite.config.js:708` ; 302 fallback fiabilité ; lien trust paywall). Trailing slash conservé.
- **`<title>`** : garder « Pourquoi nous faire confiance — Sargasses Antilles » (l.6) ou affiner « À propos · Sources & fiabilité — Sargasses Martinique ». 1 seule version (pas par requête, page institutionnelle).
- **`<meta name="description">`** (manquant) à ajouter : ~155c, honnête, ex. « Données satellite Copernicus & NOAA, méthode publique, fiabilité mesurée chaque jour contre l'observation réelle. Qui est derrière Sargasses Martinique. »
- **`<link rel="canonical" href="https://sargasses-martinique.com/a-propos/">`** (manquant) — auto-référent. **C'est la tâche B (canonical/hreflang)** ; ne pas ajouter de hreflang vers une version EN/ES qui n'existe pas pour cette page (page FR-only ; le pendant USD est `/about/`, contenu différent → **pas** d'alternate hreflang croisé, sinon mauvaise paire).
- **OG** : `og:title`, `og:description`, `og:url` (canonical), `og:image` = `https://sargasses-martinique.com/social-share.png` (asset déployé).
- **Ne pas casser l'indexation** : la page est servie statique (`!-f !-d` la protège du 302). Garder les 2 liens `→ /fiabilite/` (maillage). Ne pas ajouter `noindex`. Après build, **vérifier qu'elle reste HTTP 200** (cf. Vérification + `feedback_validate_hrefs`).
- **GP/USD** : la refonte reste **MQ-only** (whiteliste `prepare-ftp.cjs:684` inchangée). Ne pas l'ajouter à GP (sinon orphelin FR crawlable côté GP) ni aux régions USD (elles ont `/about/`).

---

## Vérification

```bash
# 1. Serveur local (depuis le repo) — file:// est BLOQUÉ pour les fetch
python -m http.server 8790 --bind 127.0.0.1   # background

# 2. Playwright (script .cjs DANS le repo) — control ET variant
#    navigate http://127.0.0.1:8790/public/a-propos/index.html?az=0   (control = page actuelle)
#    navigate http://127.0.0.1:8790/public/a-propos/index.html?az=1   (variant = scène + Veilleur)
#    waitForTimeout(1200) ; capter pageerror + console.error ;
#    screenshot mobile (390) + 520 ; Read le png et JUGER à la barre HomeAZ ;
#    vérifier : Le Veilleur ne fixe pas l'utilisateur, scène golden-hour propre,
#    freshpill = vrai âge (<12h) ou « vérification en cours », fiabilité = chiffre réel.
#    cliquer .cta-btn → l'URL devient /?paywall=1&utm_source=apropos (NE PAS casser).

# 3. reduced-motion floor : émuler prefers-reduced-motion → AUCUNE animation (sun/pulse off, early-return rAF).

# 4. Build complet (le step reliability.json + sitemap doivent passer) :
npm run build   # attendre "built in", 0 erreur ; vérifier dist/a-propos/index.html + dist/api/reliability.json présents + dist/sitemap.xml contient /a-propos/

# 5. Honnêteté fraîcheur (doit lire le vrai updatedAt) :
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const h=(Date.now()-new Date(d.updatedAt))/3.6e6;console.log(h.toFixed(1)+'h',h<12?'-> il y a Nh':'-> vérification en cours')"

# 6. Liens fiabilité encore vivants (ne pas régresser le maillage) :
#    curl -sI https://sargasses-martinique.com/fiabilite/  (attendu 200) ;
#    curl -sI https://sargasses-martinique.com/a-propos/   (attendu 200, JAMAIS 301)
```
Pas de `file://`. Pas de preview app (timeout rAF). JUGER soi-même la capture ; si ça ne passe pas la barre HomeAZ → corriger AVANT ship.

---

## Garde-fous spécifiques

- **Page STATIQUE, pas React** : ne PAS importer `abVariant`/`openPremium`/composants du monolithe ici. L'A/B = script inline `az` ; la conversion = deep-link `/?paywall=1&utm_source=apropos` (déjà branché `Sargasses_PROD.jsx:10966`). **Ne pas dupliquer** la logique paywall.
- **Zéro fausse fraîcheur** : supprimer `Maj. 07:03` (l.149) et toute heure en dur. Freshness UNIQUEMENT depuis `updatedAt` réel + kill-switch <12h. Supprimer/étiqueter le faux graphe SVG (l.199-225) — ne jamais présenter une courbe inventée comme une mesure.
- **Fiabilité = par régime, daté, échantillon affiché** ; jamais le global 78 % seul (masque la faiblesse des alertes saison calme). Source unique = `backtest-results.json` (même que `/fiabilite/`).
- **Le Veilleur = 1 seul satellite, rassure ≠ surveille** : œil mi-clos serein, ne fixe jamais l'utilisateur, pas d'œil-HAL. Réutiliser `#veilleur` de `proto-map-v2.html:126-135` (validé). Doctrine calme : au repos = tableau (sun-breath lent OK, pas d'aquarium ; reduced-motion = plancher dur).
- **Zéro image IA.** Tout en SVG/CSS (tokens `colors_and_type.css`).
- **NE PAS** activer la page sur GP ni USD (reste MQ-only FR ; whiteliste `prepare-ftp.cjs` et skip sitemap GP inchangés). Pas de hreflang croisé /a-propos ↔ /about (contenus différents).
- **NE JAMAIS 301** `/a-propos/` (régression 2026-06-10) ; garder servable (le 302 fiabilité l.251 dépend de `!-f !-d`). Garder les 2 liens `→ /fiabilite/`.
- **Tracking** : réutiliser les noms `sg_*` existants, ne pas créer un schéma de funnel parallèle (`funnel_tracking_gap`). Beacon fire-and-forget vers `/collect.php` (POST 204).
- **Control intact + réversible** : tout le neuf sous `.az-on` / `az` true ; retirer = retour exact à l'actuel.
- **Shabbat ven 18h → sam 19h : ne RIEN déployer.** SW bump (`public/sw.js CACHE_NAME`) au deploy de code. `git pull --rebase` avant push ; stage fichier par fichier (jamais `git add -A`).
