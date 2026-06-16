# SEO requête par requête — spec d'exécution

> Surface phase **D** du dashboard (`design/REFONTE-MASTER.md`). Lot : « SEO requête par requête + nouvelles pages (`/près-de-moi`, `/aujourdhui`, zones) + OG + 301 legacy ». État dashboard : 🔴 à faire.
> Pré-requis dur : phase **B** « Canonical/hreflang + indexation » (tâche htaccess `task_d48a64ca`) doit être verte AVANT de toucher au pageShell. Cette spec ne touche PAS pageShell ; elle agit sur `vite.config.js` (génération titres/meta/sitemap) + `public/.htaccess`. Les deux peuvent avancer en parallèle sans collision de fichiers.
> Tout est ADDITIF, réversible, vérifié au build. Aucune modification du runtime React n'est requise sauf pour brancher les 2 nouvelles pages au routeur SPA (additif, derrière override).

---

## État actuel

Le SEO est généré **au build** par `vite.config.js`, plugin `seo-pages` → hook `closeBundle()` (l.330+). Il n'y a PAS de SSR : chaque « page » est une copie de `dist/index.html` (le shell de l'app) avec `<title>`/`<meta>`/`<link rel=canonical>`/hreflang/JSON-LD/`<noscript>` réécrits par regex, plus un `<noscript>` éditorial pour le crawl. Le SPA s'hydrate par-dessus.

Pipeline de déploiement : le build MQ produit `dist/` **et** un miroir `dist/_gp/` ; `scripts/prepare-ftp.cjs` copie `dist/` dans `martinique-ftp/` ET `guadeloupe-ftp/`, puis overlaie `dist/_gp/` sur `guadeloupe-ftp/` (l.380-384). **Conséquence centrale : tout fichier de `dist/` existe sur les DEUX domaines**, sauf override `_gp/`.

### Ce qui marche
- **Titres/meta par page éditoriale** : array `pages[]` (`vite.config.js` l.399-427), 27 entrées, chacune `{path,title,desc,enPath,esPath}`. Boucle de génération l.495-574.
- **Homepage** (`index.html` l.13-14) déjà repositionnée « Plages Martinique aujourd'hui · Score 0-100 ». Pages plages : titre `${b.name} — Sargasses ${island} aujourd'hui` (l.1084), desc data-driven (l.1093-1103).
- **Canonical + hreflang** : réécrits par page (l.504-510 éditoriaux, 1157-1164 plages, 1388-1393 zones). Cluster fr/en/es/x-default propre, tags en/es retirés quand pas de variante (anti cluster-cassé homepage).
- **Sitemaps par domaine** : `buildSitemap(domain,isGP)` (l.696-746), 2 fichiers `sitemap-martinique.xml` / `sitemap-guadeloupe.xml`. Priorité éditoriaux pilotée par île : `mqEditPrio`/`gpEditPrio` (l.699-700).
- **OG par plage** : photo réelle si dispo (`_beachImages[b.id]`, l.1170-1171), sinon `og-image.png` statique. **Hubs/éditoriaux : tous sur `og-image.png` statique** (`index.html` l.30 hérité, jamais réécrit pour eux).
- **Zones côtières** `/plages/<zone>/` : déjà générées depuis `COAST_ZONES` (`scripts/lib/coast-zones.cjs`), boucle l.1370-1407. Niveau commune NON couvert (zone = regroupement de communes).
- **301 legacy** : `public/.htaccess` (315 lignes). Règles communes/plages → `/plages/<slug>/`, `?$ → /$1/` trailing-slash (l.300-305), SPA fallback (l.254-260), filet 302 fiabilité (l.248-252).

### Ce qui manque / casse
1. **Cannibalisation `/saison-*`** : `saison-sargasses-martinique` ET `saison-sargasses-guadeloupe` sont générés dans la boucle MQ (l.404-405) → présents dans `dist/` → **servis sur les DEUX domaines**. Pire : les **deux sitemaps les déclarent tous les deux** (l.721-722, mqEditPrio/gpEditPrio appliqués mais les 2 URLs y sont). Donc `sargasses-guadeloupe.com/saison-sargasses-martinique/` existe, est crawlable, et concurrence la home GP / la saison GP. Idem `sargasses-martinique.com/saison-sargasses-guadeloupe/`. Canonical est self (l.504) → Google voit 2 pages quasi-identiques (texte swap MQ↔GP via `_gp/`) sur chaque domaine.
2. **Titres pas alignés sur les requêtes réelles** (GSC, cf. `project_gsc_queries`) :
   - `sargasse martinique en temps réel` (162 clk, pos 3,86 = #1) et `… en direct` (66% CTR) → la **home** dit « aujourd'hui · Score 0-100 », pas « en temps réel / en direct ». La carte (`carte-sargasses`) capte « carte » mais pas « temps réel » en tête de title.
   - `meteo sargasse*` (cluster >110 clk/sem en hausse) → 2 pages dédiées existent (`meteo-sargasses-*`, l.425-426) ✅ mais pas branchées au maillage interne.
   - `aujourd'hui` (30 clk) → seulement dans la home title. Pas de page `/sargasses-aujourdhui/`.
3. **Pages manquantes (REFONTE-MASTER « 5 nouvelles »)** : `/sargasses-pres-de-moi/`, `/sargasses-aujourdhui/`, OG dynamiques par plage (SVG→PNG). Zones niveau **commune** absentes (seules les méta-zones existent).
4. **OG hubs/éditoriaux génériques** : un seul `og-image.png` pour ~27 pages éditoriales + hubs → partages indistincts, pas de signal de fraîcheur/lieu.
5. **htaccess** : `quand-sargasses-guadeloupe → /saison-sargasses-guadeloupe/` existe (l.121) mais pas l'équivalent MQ ni les variantes « météo ». SPA fallback (l.259) exclut `plages/` mais pas les nouvelles racines → OK tant que les pages sont générées en dur (sinon servies par le shell = doublon de home).

---

## Objectif (barre HomeAZ + KPI visé)

- **Barre HomeAZ** ne s'applique pas au HTML SEO (c'est du `<noscript>` + meta) MAIS s'applique aux **OG images dynamiques** (SVG→PNG) : doivent passer la barre golden-hour de `proto-home-az` / `sg-design-system` (palette `--sg-*` de `index.html` l.55, Le Veilleur 1 satellite serein, zéro image IA).
- **KPI visé** : récupérer le volume des requêtes haute-intention déjà positionnées et capter la longue traîne géo. Cibles mesurables sur 4-8 sem (GSC) :
  - `… en temps réel` / `… en direct` : titres en tête → maintenir/améliorer pos 3,86 et le CTR (déjà 27-66%).
  - Tuer la cannibalisation `/saison-*` (1 page saison par domaine) → consolider le jus, sortir GP de pos 70.
  - Nouvelles pages `/aujourdhui` + `/pres-de-moi` : capter « aujourd'hui » (intention #1 GSC = temps réel/aujourd'hui) et le « near me » géo.
  - OG dynamiques → CTR social/SERP (signal secondaire, pas bloquant funnel).
- **Conversion** : ces pages mènent au shell app → `openPremium(source)` reste l'unique porte. Les nouvelles pages passent un `source` contextualisé (`seo_aujourdhui`, `seo_pres_de_moi`).

---

## Changements exacts (étape par étape)

Ordre par levier (1 = cannibalisation, mesurable vite et 0 risque ; 5 = OG, cosmétique).

### Étape 1 — Désambiguïsation `/saison-*` (anti-cannibalisation) — `vite.config.js`

Problème : chaque domaine sert les 2 pages saison. Fix : **chaque domaine ne déclare et ne canonise QUE sa propre saison ; l'autre saison reste servie (pas de 404) mais canonise vers la page du bon domaine + sort des sitemaps.**

1a. **Sitemap** — `buildSitemap` (l.721-722). Remplacer les 2 lignes inconditionnelles par des lignes conditionnées à l'île :
```js
${isGP ? '' : `  <url><loc>${d}/saison-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
`}${isGP ? `  <url><loc>${d}/saison-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
` : ''}
```
Résultat : `sitemap-martinique.xml` ne liste QUE saison-MQ ; `sitemap-guadeloupe.xml` ne liste QUE saison-GP. (Idem traitement à appliquer à `sargasses-martinique-cette-semaine` / `sargasses-guadeloupe-cette-semaine` l.738-739 et `meteo-sargasses-martinique`/`-guadeloupe` l.740-741 — même motif : la page de l'autre île ne doit pas être au sitemap du domaine.)

1b. **Canonical cross-domaine pour la page de l'autre île.** Dans la boucle éditoriale (l.495+), pour la **variante MQ** (`mqPageHtml`, l.530) : si `p === 'saison-sargasses-guadeloupe'` (ou `-cette-semaine`/`meteo-` GP), forcer le canonical vers le domaine GP. Ajouter, juste avant `writeFileSync(resolve(dir,'index.html'),mqPageHtml)` (l.531) :
```js
// Pages de l'AUTRE île servies sur ce domaine (build partagé) : canonical
// cross-domaine vers le bon domaine = pas de doublon indexable, jus consolidé.
const GP_OWN = new Set(['saison-sargasses-guadeloupe','sargasses-guadeloupe-cette-semaine','meteo-sargasses-guadeloupe'])
let _mqOut = mqPageHtml
if (GP_OWN.has(p)) _mqOut = _mqOut.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://sargasses-guadeloupe.com/${p}/" />`)
                                  .replace(/<meta name="robots"[^>]*>/, '') // (au cas où)
writeFileSync(resolve(dir, 'index.html'), _mqOut)
```
Et symétriquement pour `gpPageHtml` (l.573) avec un `MQ_OWN = new Set(['saison-sargasses-martinique','sargasses-martinique-cette-semaine','meteo-sargasses-martinique'])` → canonical vers `sargasses-martinique.com`.

> Pourquoi canonical cross-domaine et pas 301 : la page existe et est servable ; règle projet « ne JAMAIS 301 un chemin servable » (htaccess l.108-115, leçon /a-propos/). Canonical cross-domaine = signal propre, réversible, sans casser un éventuel lien entrant.

1c. **Ne PAS désaligner les titres** : les titres saison sont déjà distincts MQ vs GP (l.404-405) et le swap `_gp/` les garde corrects. Rien à changer côté title.

### Étape 2 — Titres/meta alignés sur les requêtes GSC — `vite.config.js` + `index.html`

Source de vérité requêtes : `project_gsc_queries` (snapshot avril) + relancer `weekly-seo-automation.yml` pour le live AVANT de figer (les volumes ont ×4). Règles : `en temps réel`/`en direct`/`aujourd'hui` = mots qui convertissent en CTR, à mettre **en tête** de title (≤60 car. visibles).

2a. **Home** (`index.html` l.13) — le title actuel « Plages Martinique aujourd'hui · Score 0-100 (sargasses, mer, soleil) 2026 » est bon pour le pivot « score » mais perd le #1 query `sargasse martinique en temps réel`. **A/B le title** (voir section A/B `seo_home_title`). Variante proposée :
`Sargasses Martinique en temps réel · plage par plage aujourd'hui 2026`
(garde « aujourd'hui », ajoute « en temps réel » + « en direct » via meta description). Modifier UNIQUEMENT via le mécanisme A/B (post-build patch conditionnel, cf. A/B) — NE PAS éditer la valeur en dur sans bras de contrôle.

2b. **Carte** (`pages[]` l.400) — title `Carte des sargasses Martinique en temps réel (2026)` : déjà bon (« carte » + « temps réel »). Garder.

2c. **Brancher au maillage interne** les pages `meteo-sargasses-*` (l.425-426, isFaq, déjà au sitemap l.740-741 priorité 0.9) : ajouter un lien depuis les `<noscript>` de la home (vite genère le noscript home dans `index.html` ; le lien interne se pose dans le noscript éditorial des pages voisines). Concrètement, dans `editorialContent` des pages `faq`, `comprendre-sargasses`, `saison-*`, ajouter `<a href="/meteo-sargasses-martinique/">météo des sargasses</a>`. (Le maillage interne `<noscript>` est crawlé ; cf. `rewriteCrossIsland` l.483 qui prouve que les `<a href="/plages/...">` du noscript sont lus.)

2d. **Description : injecter « en direct »** sur la home meta description A/B (l.14) : `… mise à jour en direct plusieurs fois par jour.` (honnête : la donnée est rafraîchie 4×/j, cf. CLAUDE.md ; « en direct » est défendable, « temps réel » au sens strict aussi car affiché live). Voir garde-fou honnêteté.

### Étape 3 — Nouvelle page `/sargasses-aujourdhui/` (FR, + EN/ES) — `vite.config.js`

C'est une page éditoriale → s'ajoute à `pages[]` (l.399). Ajouter l'entrée :
```js
{ path: 'sargasses-aujourdhui', enPath: 'en/sargassum-today', esPath: 'es/sargazo-hoy', title: 'Sargasses Martinique aujourd\'hui — état en direct plage par plage 2026', desc: 'Y a-t-il des sargasses en Martinique aujourd\'hui ? État du jour de chaque plage, mis à jour plusieurs fois par jour par satellite. Carte en temps réel et prévision 7 jours.' },
```
Puis ajouter son `editorialContent['sargasses-aujourdhui']` (bloc `<article>` comme les autres, l.429+) — H1 « Sargasses en Martinique aujourd'hui », paragraphe daté `${today}`, top zones propres du jour (réutiliser le pattern noscript zone l.1382), liens vers `/carte-sargasses/`, `/previsions/`, `/meteo-sargasses-martinique/`. Ajouter au `faqSchemas` (l.463 modèle) 3-4 Q/R « Y a-t-il des sargasses aujourd'hui ? », « Quelle plage propre aujourd'hui ? ». Ajouter au **sitemap** MQ + entrée EN/ES (l.738 modèle, priority 0.9, changefreq daily). Le swap `_gp/` produit automatiquement la version GP « Sargasses Guadeloupe aujourd'hui ».

> La génération éditoriale (boucle l.495) gère déjà : MQ + GP-mirror + canonical/hreflang/og + EN/ES (si enPath/esPath via boucles l.620-681). Donc une seule entrée `pages[]` + son editorialContent + 1 ligne sitemap = page complète sur les 2 domaines en 3 langues.

### Étape 4 — Nouvelle page `/sargasses-pres-de-moi/` (FR, + EN/ES) — `vite.config.js` + SPA runtime

« Near me » est une intention géo : la page statique sert le SEO (texte + liste plages par commune) ET, hydratée, déclenche la géoloc côté app pour proposer la plage propre la plus proche.

4a. **Statique (SEO)** — même mécanique que l'étape 3 : entrée `pages[]` :
```js
{ path: 'sargasses-pres-de-moi', enPath: 'en/sargassum-near-me', esPath: 'es/sargazo-cerca-de-mi', title: 'Sargasses près de moi — plage propre la plus proche aujourd\'hui (Martinique)', desc: 'Trouvez la plage sans sargasses la plus proche de vous en Martinique. Géolocalisation, état en direct par plage, itinéraire. Mise à jour satellite plusieurs fois par jour.' },
```
`editorialContent` : H1 « Plages sans sargasses près de moi », intro, puis **liste par commune** (réutiliser `[...new Set(beaches.map(b=>b.commune))]` déjà dispo dans le scope build, beaches l.767) avec liens `/plages/<slug>/`. C'est le contenu indexable (la géoloc ne marche pas pour le crawler).

4b. **Runtime (géoloc)** — la page hydrate le shell. Détecter le pathname dans le bootstrap de `Sargasses_PROD.jsx` (là où `getLang()`/routing virtuel est résolu — chercher `location.pathname`) : si `/sargasses-pres-de-moi/`, **après interaction utilisateur** (pas au mount — cf. `molo_ladder`, le cold geolocation prompt a été tué commit 5041206a), montrer un CTA « Trouver ma plage propre » qui appelle `navigator.geolocation` puis trie les plages par distance et statut. **Additif + derrière override** `?nearme=1`. Conversion : un clic sur une plage = `onOpenBeach`, puis paywall via `openPremium('seo_pres_de_moi')`.

> RESPECT MOLO : `feedback`/mémoire « kill cold geolocation prompt at mount ». La géoloc NE se déclenche QU'au clic explicite. Le contenu statique doit être pleinement utile SANS géoloc (liste par commune).

### Étape 5 — OG images dynamiques par plage (SVG→PNG) — nouveau script + `vite.config.js`

5a. **Générateur** — nouveau `scripts/lib/og-image.cjs` exportant `generateOgImages(beaches, statusById, outDir)`. Pour chaque plage : composer un SVG 1200×630 réutilisant **la palette `--sg-*`** (mêmes valeurs que `index.html` l.55) + la silhouette Le Veilleur de `design/proto-veilleur-clip-v2.html` (1 satellite, œil mi-clos serein — `sg-svg-scene`/`sg-design-system`) + le **nom de la plage** + le **badge verdict/Score** du jour + freshness datée. Rendu SVG→PNG via **`sharp`** (déjà dépendance du repo, cf. `project_social_generators` « SVG→PNG via sharp »). Écrire `dist/og/<slug>.png`.

5b. **Branchement** — dans la boucle plages (l.1170), si `dist/og/<slug>.png` existe, préférer cet OG dynamique au photo/statique :
```js
.replace(/<meta property="og:image" [^>]*>/, existsSync(resolve(outDir,'og',b.slug+'.png')) ? `<meta property="og:image" content="https://${domain}/og/${b.slug}.png" />` : (_beachImages[b.id] ? ... : ...))
```
(garder le fallback photo → statique). Appeler `generateOgImages(...)` dans `closeBundle()` après la génération des plages (où `statusById` est en scope).

> **Barre HomeAZ + interdits** : l'OG est du dessin SVG propriétaire, JAMAIS d'image IA. Doctrine calme (statique = OK, c'est une image figée). Le Veilleur rassure ≠ surveille. Si le rendu ne passe pas la barre au premier jet → le refaire à la main avant de brancher (cf. règle anti agent-slop). **Verrou** : aligner sur `project_social_generators` (share-cards VERROUILLÉES jusqu'à funnel sain) — l'OG par plage est moins risqué (pas de viral, juste SERP) MAIS le brancher derrière l'A/B `seo_og_dynamic` et ne PAS le généraliser aux hubs tant que le funnel n'est pas sain.

### Étape 6 — 301 legacy + complétude htaccess — `public/.htaccess`

6a. Ajouter le pendant MQ du redirect `quand-sargasses-*` (l.121) :
```apache
RewriteRule ^quand-sargasses-martinique/?$ /saison-sargasses-martinique/ [R=301,L]
```
6b. Ajouter les nouvelles racines à la règle trailing-slash (l.304) pour cohérence : insérer `sargasses-aujourdhui|sargasses-pres-de-moi` dans l'alternance.
6c. **Ne PAS** ajouter de 301 vers les nouvelles pages tant qu'elles ne sont pas générées+vérifiées (sinon boucle/masquage). Les nouvelles pages sont générées en dur → le SPA fallback (l.259) ne les capture pas (elles existent comme fichiers) → OK.
6d. **Vérifier** qu'aucune nouvelle racine n'entre en collision avec le filet 302 fiabilité (l.251) ni le SPA fallback : `sargasses-aujourdhui` et `sargasses-pres-de-moi` ne matchent ni `(fiabilite|reliability|fiabilidad)` ni les exclusions — OK.

---

## A/B

Les pages SEO statiques ne passent pas par `abVariant()` (pas de JS au crawl). On A/B au **build** : générer 2 jeux de titres et router par cookie/poids n'est pas faisable en statique pur. Donc :

- **`seo_home_title`** (titre/desc home) → A/B **applicatif** : le shell s'hydrate ; au mount, si bras `variant`, **réécrire `document.title` + meta description** côté client (`abVariant("seo_home_title",["control","variant"],[50,50])`, override `?seo_home_title=1/0`). Le `<title>` HTML reste le **control** (ce que Google indexe — donc le control = la version SEO « sûre ») ; la variante n'affecte que l'onglet/partage runtime → **mesure le CTR via GSC en alternant le title HTML manuellement par build sur 2 périodes** (A puis B, 4 sem chacune) plutôt qu'un vrai split (Google ne voit qu'un title par URL). **Control = title HTML actuel** (`index.html` l.13). Documenter la période de bascule dans `reference_ab_tests`.
- **`seo_og_dynamic`** (OG plage dynamique vs photo) → flag de **build** : `process.env.SEO_OG_DYNAMIC === '1'` active l'étape 5b ; sinon comportement actuel (photo/statique = control). Réversible par variable d'env du workflow. Pas d'override URL (build-time).
- **`nearme`** (géoloc runtime sur `/sargasses-pres-de-moi/`) → `abVariant("nearme",["control","variant"],[50,50])` + override `?nearme=1/0`. **Control** : la page sert son contenu statique (liste par commune) sans CTA géoloc. Variante : ajoute le CTA « Trouver ma plage propre ».

Conversion inchangée partout : `openPremium(source)` unique, events `sg_*` identiques.

---

## Données réelles à brancher

- **Requêtes** : `project_gsc_queries` (baseline) + artefacts live `scripts/automation/data/*.json` (produits par `weekly-seo-automation.yml`). **Relancer le workflow et lire le dernier JSON AVANT de figer les titres** (volumes ×4 depuis le snapshot).
- **Statut/verdict du jour** (pages `aujourdhui`, zones, OG) : `statusById` en scope build (dérivé de `SARGASSUM_REF`/levels, cf. l.1373 `statusById[b.id]`). Honnêteté : afficher l'état réel par plage, jamais inventé.
- **Freshness** : la donnée pipeline est rafraîchie ~4×/j (`public/api/copernicus/sargassum.json`, champ `updatedAt`). Sur l'OG et les nouvelles pages : afficher `${today}` (date du build = date du contenu) ; ne JAMAIS écrire « il y a X minutes » côté statique. Règle dure `feedback_data_reliability` / skill : freshness <12h sinon « vérification en cours ».
- **Score 0-100** : pour l'OG, réutiliser le score pipeline existant (même source que les fiches). Ne pas recalculer.
- **Géoloc** (`pres-de-moi` runtime) : `navigator.geolocation` → tri par distance haversine sur `beaches-list.json` (lat/lng présents). Aucune donnée stockée (RGPD).

---

## SEO (pages)

- **title / meta** : voir étapes 2-4. ≤60 car. visibles pour le title, ≤155 pour la description. Mots à placer en tête : `en temps réel`, `en direct`, `aujourd'hui`, `carte`, `météo`.
- **canonical** : self pour chaque page sur son domaine, SAUF les pages « de l'autre île » qui canonisent cross-domaine (étape 1b). Réécrit via le pattern `replace(/<link rel="canonical"[^>]*>/, ...)` déjà partout.
- **hreflang** : réutiliser le cluster existant (fr/en/es/x-default). Pour `aujourdhui`/`pres-de-moi` : enPath/esPath fournis → la boucle pose le cluster automatiquement (l.505-510 + boucles EN/ES l.620-681). Tags en/es retirés si pas de variante (jamais de fallback homepage).
- **slug = nom = SEO** : ne JAMAIS renommer une plage. Les nouveaux slugs (`sargasses-aujourdhui`, `sargasses-pres-de-moi`) sont des slugs de page, pas de plage — OK, additifs.
- **Maillage interne** : poser dans les `<noscript>` éditoriaux des liens `/plages/<slug>/`, `/carte-sargasses/`, `/previsions/`, `/meteo-sargasses-<ile>/`. `rewriteCrossIsland` (l.483) gère les liens cross-île. Ne PAS créer de phantom href (slug inexistant) — il les strip (l.492) mais autant les éviter.
- **Ne pas casser l'indexation** : tout est additif. Le seul retrait est sitemap (étape 1a) = volontaire (la page reste servie + canonical cross-domaine, donc pas de 404, juste « non déclarée » sur le mauvais domaine). Pré-requis : ne PAS toucher pageShell tant que `task_d48a64ca` (canonical/hreflang htaccess) n'est pas vert.
- **OG** : `og:image` 1200×630 (déjà la taille déclarée, `index.html` l.31-32). Dynamique par plage (étape 5), statique ailleurs.

---

## Vérification

```bash
# 0) Syntaxe vite.config.js (ESM) après edits
node --check vite.config.js

# 1) Build complet MQ (génère dist/ + _gp/). Attendre "built in", 0 erreur, 136+ pages.
npm run build

# 2) Vérifier les pages générées (titres/canonical) — pas de cat, lire ciblé :
node -e "const fs=require('fs');for(const p of ['saison-sargasses-martinique','saison-sargasses-guadeloupe','sargasses-aujourdhui','sargasses-pres-de-moi']){try{const h=fs.readFileSync('dist/'+p+'/index.html','utf8');const t=(h.match(/<title>([^<]*)<\/title>/)||[])[1];const c=(h.match(/rel=\"canonical\" href=\"([^\"]*)\"/)||[])[1];console.log(p,'\n  title:',t,'\n  canonical:',c)}catch(e){console.log(p,'MISSING')}}"

# 3) Vérifier la dé-cannibalisation des sitemaps :
node -e "const fs=require('fs');const mq=fs.readFileSync('dist/sitemap-martinique.xml','utf8');const gp=fs.readFileSync('dist/sitemap-guadeloupe.xml','utf8');console.log('MQ a saison-MQ:',mq.includes('saison-sargasses-martinique/'),'| MQ a saison-GP:',mq.includes('saison-sargasses-guadeloupe/'));console.log('GP a saison-GP:',gp.includes('saison-sargasses-guadeloupe/'),'| GP a saison-MQ:',gp.includes('saison-sargasses-martinique/'))"
# Attendu : MQ→true/false ; GP→true/false.

# 4) Vérifier le GP-mirror des nouvelles pages :
node -e "const fs=require('fs');console.log('GP aujourdhui:',fs.existsSync('dist/_gp/sargasses-aujourdhui/index.html'),'| GP pres-de-moi:',fs.existsSync('dist/_gp/sargasses-pres-de-moi/index.html'))"

# 5) OG images (si étape 5 activée) : présence + dimensions
node -e "const fs=require('fs');const sharp=require('sharp');const f='dist/og/le-diamant.png';if(fs.existsSync(f)){sharp(f).metadata().then(m=>console.log('OG',m.width+'x'+m.height,m.format))}else console.log('OG non généré (SEO_OG_DYNAMIC off)')"

# 6) Rendu visuel OG (barre HomeAZ) — Playwright via serveur local (l'app preview TIMEOUT) :
python -m http.server 8790 --bind 127.0.0.1   # background
#   script .cjs DANS le repo : navigate http://127.0.0.1:8790/dist/og/le-diamant.png OU
#   ouvrir le SVG source ; screenshot ; Read le png ; JUGER (golden-hour, Veilleur serein, lisible).

# 7) Runtime nearme — esbuild check du monolithe AVANT edit, puis Playwright :
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('JSX OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"
#   Playwright : navigate /sargasses-pres-de-moi/?nearme=1 ; pageerror+console.error ; vérifier CTA présent, géoloc NON déclenchée au mount.

# 8) Smoke EUR (rebuild MQ d'abord) : ouvrir dist/index.html via 8790, vérifier hydratation OK, 0 console.error.
```

---

## Garde-fous spécifiques

- **Pré-requis bloquant** : ne PAS modifier `pageShell`/canonical au niveau htaccess tant que `task_d48a64ca` (phase B) n'est pas vert. Cette spec touche `vite.config.js` (génération) + `public/.htaccess` (2 lignes additives) — si `task_d48a64ca` réécrit aussi `.htaccess`, **coordonner / rebaser** (un seul éditeur d'htaccess à la fois).
- **Build partagé MQ→GP** : toute page ajoutée à `pages[]` apparaît sur les DEUX domaines. Pour les pages mono-île (saison, cette-semaine, météo), TOUJOURS gérer le canonical cross-domaine + l'exclusion sitemap (étape 1). Oublier = re-créer la cannibalisation.
- **Ne JAMAIS 301 un chemin servable** (htaccess l.108-115, leçon /a-propos/ 2026-06-10 + /methode-carte/ 2026-06-16). Cannibalisation `/saison-*` = canonical cross-domaine, PAS 301.
- **Mesurer avant de consolider** : `project_funnel`/MASTER « mesurer GSC avant 301 ». La dé-cannibalisation se fait par canonical (réversible), pas par suppression. Relancer `weekly-seo-automation.yml` et lire les volumes live avant de figer un title (A/B period-based).
- **Honnêteté data** : « en temps réel » / « en direct » défendables (rafraîchi 4×/j, affiché live) ; NE PAS écrire « il y a X min » en statique. Freshness <12h sinon « vérification en cours » (skill). Statut par plage = réel, jamais inventé. `feedback_forecast_floor_ban` : zéro cleanFloor atlantique dans tout texte/forecast.
- **MOLO géoloc** : sur `/pres-de-moi/`, géoloc UNIQUEMENT au clic explicite (jamais au mount — commit 5041206a, `molo_ladder`). Contenu pleinement utile sans géoloc.
- **OG = SVG propriétaire** : zéro image IA. Barre HomeAZ + `sg-design-system` (palette `--sg-*`, Le Veilleur 1 satellite serein, rassure ≠ surveille). Si le rendu ne passe pas → refaire à la main avant branchement. Garder verrouillé aux hubs tant que funnel non sain (cohérence `project_social_generators`).
- **Additif + réversible** : control = comportement actuel pour chaque flag. `seo_og_dynamic` derrière `SEO_OG_DYNAMIC` env ; `nearme` derrière `?nearme=` ; titres en A/B period-based avec control = title HTML actuel.
- **Slug = nom = SEO** : ne renommer aucune plage. Nouveaux slugs = pages, pas plages.
- **Shabbat** : aucun deploy ven 18h → sam 19h. Build/vérif OK hors fenêtre, push après.
- **Git** : `git pull --rebase` avant push ; stager fichier par fichier (jamais `git add -A`) ; bump `public/sw.js` `CACHE_NAME` si du code runtime change (étape 4b). Commit terminé par `Co-Authored-By: Claude ...`.
