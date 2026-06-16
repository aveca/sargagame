# Hubs zones & communes (/plages/<zone>/ + /plages/<commune>/) — spec d'exécution

> Surface : pages d'agrégation géographique entre la home (FAR) et la fiche plage (NEAR).
> Profondeur MID du monde unifié (`REFONTE-MASTER.md` §0 : FAR=carte / **MID=côte/quartier `/plages/<zone>/`** / NEAR=plage).
> Lecture préalable faite : `vite.config.js`, `scripts/lib/coast-zones.cjs`, `scripts/prepare-ftp.cjs`, `public/.htaccess`, `Sargasses_PROD.jsx`, `src/HomeAZ.jsx`, `design/proto-map-v2.html`, `design/proto-plage-plongee.html`, `public/data/beaches-list.json`, `public/api/copernicus/sargassum.json`.

---

## État actuel

### Ce qui EXISTE (7 hubs zones, server-generated, indexés)
- **Source unique** : `scripts/lib/coast-zones.cjs` — `COAST_ZONES` = **3 zones MQ + 4 zones GP** (7 hubs), classées par **commune** (jamais par lng brut, garde-fou `feedback_beach_geography`).
  - MQ : `plages-sud-martinique`, `plages-cote-caraibe-martinique`, `plages-cote-atlantique-martinique`.
  - GP : `plages-sud-grande-terre`, `plages-nord-grande-terre`, `plages-basse-terre-cote-caraibe`, `plages-iles-guadeloupe`.
  - Chaque zone : `{ slug, name, shortName, titleName?, communes:[...], intro }`.
- **Génération** : `vite.config.js` **L1366-1413** (boucle `for (const z of COAST_ZONES[islandCode])`). Pour chaque zone :
  - filtre `zBeaches = islandBeaches.filter(b => z.communes.includes(b.commune))` ; skip si vide (L1371-1372).
  - `zClean` = nb de plages `clean` aujourd'hui via `statusById` (issu de `SARGASSUM_REF`, L1313).
  - `statusBadge(st)` (L1314-1318) → pastille Propre/Modéré/À éviter.
  - écrit `dist/plages/<z.slug>/index.html` (L1401-1403) + miroir GP `dist/_gp/plages/<z.slug>/index.html` (L1404-1408).
  - title/desc/canonical/og/twitter via `.replace()` sur `htmlSubpage` (L1385-1400) ; **hreflang : fr + x-default self uniquement**, en/es retirés (L1389-1393) car pas de variante traduite.
  - JSON-LD `CollectionPage` + `BreadcrumbList` (L1383-1384). Sitemap `priority 0.75` (L1409-1411).
- **Lien remontant** plage→zone : `vite.config.js` **L1063-1069** (`zoneOf`) + **L1247-1248** (`zoneLine` injecté dans le `<noscript>` de chaque fiche). Maillage hiérarchique home→zone→plage.
- **Whitelist FTP** : `scripts/prepare-ftp.cjs` **L172-188** — `zoneSlugs = zoneSlugsFor(ownIslandForZones)` ; la garde anti-duplicate garde `plages/index.html` + slugs plages de l'île + slugs zones. **Bug payé 2026-06-12** : sans cette whitelist les hubs MQ étaient supprimés au packaging (404).
- **Hub parent** `/plages/` (toutes les plages, groupées par commune) : `vite.config.js` **L1300-1364** (`communeListHtml` L1319-1327) + htaccess L205 (`^plages/?$ → /plages/index.html`).

### Ce qui MANQUE / ne va pas
1. **Le visuel est très loin de la barre HomeAZ.** Les hubs zones sont du HTML inline `font-family:system-ui` (L1382) : `<article>` blanc, `<ul>`, badges plats. Zéro golden-hour, zéro Veilleur, zéro scène. C'est une page d'annuaire, pas le monde MID.
2. **Pas de page par commune.** 19 communes MQ + 23 communes GP (42 au total, dont 15 à 1 seule plage) ont du trafic GSC potentiel (« plages [commune] sargasses », « [commune] sargasses aujourd'hui ») mais **aucune URL dédiée**. Seul le hub `/plages/` les liste en `<h2>`.
3. **Donnée « morte » sur le hub** : la liste donne le statut du jour mais **aucune lecture synthétique** (combien propres / le meilleur spot maintenant / la tendance 7j de la zone). Pas de CTA conversion (`openPremium`) ni de capture email.
4. **Risque de cul-de-sac** : depuis le hub on ne peut qu'aller en fiche ou vers une autre zone ; pas de flyTo carte ciblée sur la zone.

### Contraintes de routing DURES (vérifiées dans le code)
- **Pas de SPA fallback sous `/plages/`.** `public/.htaccess` **L259** : `RewriteRule ^(?!api/|assets/|en/|beaches/|config/|plages/)(.*)$ /index.html`. `plages/` est **exclu** → une URL `/plages/X/` qui n'a pas de fichier physique **renvoie 404** (pas l'app). ⇒ **toute page commune DOIT être générée au build** (comme les hubs zones), sinon 404.
- **Collisions de slug** : les slugs de communes nus collisionnent avec des 301 legacy et entre îles :
  - `.htaccess` redirige déjà `^plages/sainte-anne/ → /plages/plage-de-sainte-anne/` (L38), `^plages/grande-anse/ → …` (L32), `^plages/caravelle/`, `^plages/souffleur/`, etc.
  - `sainte-anne` existe en **MQ ET GP** ; un seul `/plages/sainte-anne/` ne peut servir les deux (chaque domaine ne sert que ses plages via prepare-ftp).
  - ⇒ **le scheme commune NE PEUT PAS être `/plages/<commune>/` nu.** Voir « Changements » : préfixe `commune-`.
- Les beaches **n'ont pas de champ `slug`** ; il est dérivé partout via `slugify(b.name)` (`vite.config.js` **L24**). `Schoelcher` vs `Schœlcher` = doublon de données (slugs `schoelcher` / `sch-lcher`) → à fusionner avant de générer (sinon 2 communes fantômes).
- Le deep-link React `/plages/:slug` (`Sargasses_PROD.jsx` **L10526-10535**) ne matche QUE par nom de plage ; il ignore zones/communes. Donc les hubs n'ouvrent jamais l'app par erreur (bien).

---

## Objectif (barre HomeAZ + KPI visé)

Faire des pages MID **le pont golden-hour** entre la carte et la fiche, à la barre `home_az` (palette golden-hour, fonts Anton/Bricolage/JetBrains Mono, Le Veilleur serein, doctrine calme = repos = tableau, reduced-motion floor, zéro image IA), **sans casser l'indexation existante** (les 7 hubs sont déjà classés).

KPI servis (cf. `REFONTE-EXECUTION.md` §8) :
- **Demande #1 = temps réel / aujourd'hui** → le hub crie « X plages propres MAINTENANT dans <zone> » + meilleur spot du jour.
- **Carte = 25 % des clics** → CTA « voir <zone> sur la carte » (flyTo) bien visible.
- **modal→CTA 2 %** → 1 surface `openPremium('zone_forecast')` contextualisée (la prévision 7j de la zone est le hook Premium).
- **Capture email 0,35 %** → 1 demo-gate single-field optionnel (« sois prévenu quand <zone> redevient propre »).
- **SEO long-tail** : +42 pages communes (couverture requêtes « plages <commune> sargasses »), sans cannibaliser les hubs zones ni les fiches.

Cible mesurable : hub zone restylé qui (a) garde son rang d'indexation, (b) augmente le taux clic-vers-fiche, (c) expose un `openPremium('zone_forecast')`.

---

## Changements exacts (étape par étape)

> Ordre par levier : **(1)** restyle des 7 hubs zones existants (gain SEO immédiat, pages déjà indexées), **(2)** création des pages communes (nouvelle surface). Tout est server-generated dans `vite.config.js` (ces pages NE sont PAS l'app React ; elles ne portent donc pas un `abVariant()` JS classique — voir §A/B pour le bras serveur).

### ÉTAPE 1 — Restyler les 7 hubs zones (golden-hour, server-side)

**Fichiers** : `vite.config.js` (bloc L1366-1413) + `scripts/lib/coast-zones.cjs` (enrichir les données zone).

**1a. Enrichir `COAST_ZONES`** dans `scripts/lib/coast-zones.cjs` (source unique, consommée aussi par prepare-ftp) :
- ajouter par zone (optionnel, défauts dérivables) : `tone` (`'shelter'` côte sous-le-vent/Caraïbe, `'exposed'` Atlantique/est, `'mixed'` sud/îles) pour piloter la teinte mer et le ton de la phrase ; rien d'inventé côté data.

**1b. Remplacer le `zNoscript` plat (L1382) par un gabarit golden-hour réutilisant `proto-map-v2`.**
Construire une fonction `renderZoneHub(z, zBeaches, statusById, weekly, today, domain, islandCode)` (à poser près de la boucle, ~L1366) qui émet un HTML **standalone, self-contained** (CSS inline dans `<style>`, pas de dépendance au bundle React, comme `/a-propos/` et les pages `reliability`). Réutiliser **tel quel** depuis `design/proto-map-v2.html` :
- `:root` golden-hour (L11-15 du proto : `--sky*`, `--gold`, `--green/--amber/--coral`, `--tealL`).
- `#stage` mer golden-hour CSS (L22-24), `.sun` + `@keyframes sunBreath` (L25-28), `.veil` (L66), media `prefers-reduced-motion` (L67).
- `.live` pill (EN DIRECT + heure réelle) L37-41, `.langs` non pertinent (hub fr only → omettre), `.head h1` + `.gauge` (jauge « X/Y propres ») L45-51.
- `.dock .pill` = **sélecteur de profondeur** Carte/Plages/Premium (L52-55) — sur le hub : 3 liens `<a>` (Carte=`/carte-sargasses/`, Plages=`/plages/`, l'onglet courant « <zone> » aria-pressed).
- la **scène SVG** : reprendre `island` + `pins` du proto, mais en **mode statique** (pas de pan/zoom JS lourd côté hub SEO) — afficher l'outline de l'île (`design/mq-outline.json` pour MQ ; pour GP, fallback sur une silhouette simple ou omettre la scène et garder un bandeau golden-hour CSS si l'outline GP manque — NE PAS inventer une géo fausse). Les pastilles = 1 pin/plage de la zone, couleur = statut réel.
- Le **Veilleur** (proto L125-129, `#veilleur`, œil mi-clos, coin haut-droit, `aria-hidden`) — **UN seul**, posé sur la scène, ne fixe pas l'utilisateur (`rassure ≠ surveille`).

**1c. Contenu data réel du hub (sous la scène, lisible sans JS)** :
- H1 : `Plages — <z.name>` (garde `slug=nom` : ne PAS changer `z.name`/`z.slug`).
- Ligne live : `<zClean>/<zBeaches.length> propres aujourd'hui · satellite Copernicus · <today>`.
- **Meilleur spot du jour** : `zBeaches` triés (clean d'abord, puis score si dispo), top 1 mis en avant avec lien fiche.
- Liste plages (garder l'actuelle L1374-1376 : nom + commune + `statusBadge`), mais stylée golden-hour (cartes sombres, pas `<li>` blanc).
- **Tendance 7j de la zone** : agréger `weekly[slugify(b.name)].forecast[]` des plages de la zone → « la zone s'améliore / se dégrade / stable cette semaine » (compter les jours `clean` vs `moderate/avoid` sur l'horizon). Honnête : si `weekly` manque pour une plage, l'exclure du calcul, ne pas extrapoler.
- **CTA carte (flyTo)** : `<a href="/carte-sargasses/?zone=<z.slug>">Voir <z.shortName> sur la carte</a>` — branché côté app (voir 1e).
- **CTA Premium** : `<a href="/?openpremium=zone_forecast&zone=<z.slug>">…</a>` OU, si le hub charge un mini-JS d'enhancement, `onclick` → renvoie vers la home avec param ; la conversion **reste `openPremium(source)` UNIQUE** dans l'app (jamais un 2e checkout). Source = `'zone_forecast'`.
- **Capture email (optionnel, single-field)** : `<form action="/collect.php" …>` même-origine (cf. `reference_first_party_analytics` : `/collect.php` existe en `public/`) — 1 champ email, intent « préviens-moi quand <zone> redevient propre ». Aligne le levier #1.
- Liens croisés autres zones (garder L1377-1378) + lien `/plages/` + (NOUVEAU) liens vers les **pages communes** de la zone (étape 2).

**1d. Conserver intact** : title/desc/canonical/og/twitter/hreflang/JSON-LD/sitemap (L1385-1411) — seul le **corps** change (le `<noscript>`/contenu visible). Ne pas toucher au miroir `_gp/` (L1404-1408) ni au sitemap (L1409-1411).

**1e. flyTo carte par zone (app, additif)** : dans `Sargasses_PROD.jsx`, lire `?zone=<slug>` au mount carte ; si présent, après chargement `allBeaches`, centrer/zoomer la `LazyMapView` sur le bbox des plages de la zone (réutiliser `COAST_ZONES` côté front via un petit map slug→communes embarqué, ou exposer `/api/zones.json` généré au build). **Anti-cul-de-sac** (`REFONTE-MASTER §4B-8`). Garder le control intact (sans `?zone`, comportement actuel).

### ÉTAPE 2 — Créer les pages communes `/plages/commune-<slug>/`

**Décision URL (impose par les collisions, cf. État actuel)** : préfixe **`commune-`** → `/plages/commune-le-gosier/`, `/plages/commune-sainte-anne/`, etc.
- Évite les 301 legacy (`/plages/sainte-anne/` reste un redirect vers la fiche).
- Évite la collision MQ↔GP : chaque domaine ne génère que SES communes (prepare-ftp filtre).
- `slug=nom` respecté : le slug commune = `commune-` + `slugify(commune)`.

**Fichier** : `vite.config.js`, **nouveau bloc juste après la boucle zones (après L1413)**, modèle calqué sur le bloc zones.

**2a. Itération** :
```
for (const islandCode of ['gp','mq']) {            // même ordre GP-first que /plages/ (L1300)
  const islandBeaches = beaches.filter(b => b.island === islandCode)
  // fusionner le doublon Schoelcher/Schœlcher AVANT de grouper :
  const normCommune = c => c.replace('Schœlcher','Schoelcher')
  const communes = groupBy(islandBeaches, b => normCommune(b.commune))
  for (const [commune, cBeaches] of Object.entries(communes)) {
    const cSlug = 'commune-' + slugify(commune)
    // ... rendu (réutilise renderZoneHub avec name=commune, scope=communes)
  }
}
```

**2b. Seuil** : générer une page pour **toutes** les communes (même 1 plage) — 42 pages. Justification : long-tail « plages <commune> sargasses » + maillage. Pour les communes à 1 plage, **canonical = la page commune** mais ajouter un lien fort vers la fiche unique (la fiche reste canonical de SON slug ; pas de duplicate car contenu différent : commune = contexte géo + tendance, fiche = la plage). Si risque duplicate jugé trop fort sur les 1-plage, alternative : `canonical` de la page commune → la fiche unique (à trancher après mesure GSC ; **défaut = page autonome** pour maximiser la couverture).

**2c. Contenu** (réutilise `renderZoneHub`, scope commune) :
- H1 : `Plages de <commune> — sargasses aujourd'hui` (`slug=nom`).
- Live : `<clean>/<n> propres aujourd'hui · <today>`.
- Zone parente : lien remontant `<a href="/plages/<zoneOf(cBeaches[0]).slug>/">` (réutilise `zoneOf`, L1067) — maillage commune→zone→home.
- Liste plages de la commune + statut réel + tendance 7j (même agrégation `weekly`).
- Lien carte `?commune=<slug>` (flyTo, même mécanique que zone, optionnel) + CTA Premium `openPremium('commune_forecast')`.

**2d. title/meta/canonical/hreflang/JSON-LD** : calquer L1385-1411.
- title : `Sargasses à <commune> aujourd'hui — état des plages en temps réel`.
- desc : `<n> plages surveillées à <commune> (<island>) : <clean> propres aujourd'hui. État sargasses temps réel + prévision 7 jours.`
- canonical self `https://<domain>/plages/commune-<slug>/`.
- hreflang fr + x-default self (pas de variante en/es) — copier L1389-1393.
- JSON-LD `CollectionPage` + `BreadcrumbList` (Accueil > Plages > <zone> > <commune>).
- sitemap `priority 0.7`, `changefreq daily`.
- miroir `_gp/` pour les communes GP (copier L1404-1408).

**2e. Whitelist FTP** : `scripts/prepare-ftp.cjs` L172-188 — étendre la garde pour conserver `commune-*`. Option propre : exporter depuis `coast-zones.cjs` un helper `communeSlugsFor(island)` (calcule depuis beaches-list) OU élargir la condition L181 : `if (!islandSlugs.has(entry) && !zoneSlugs.has(entry) && !entry.startsWith('commune-'))`. **Sans ça, mêmes 404 que le bug 2026-06-12.** Charger `communeSlugsFor` depuis la même source unique pour rester cohérent.

**2f. Lien depuis les hubs zones** (étape 1c) et depuis `/plages/` (L1320-1326) : ajouter sous chaque `<h2>commune</h2>` un lien `<a href="/plages/commune-<slug>/">Toutes les plages de <commune> →</a>`.

### Réutilisation d'assets (récap)
- `design/proto-map-v2.html` : palette `:root`, `#stage` mer, `.sun`, `.live`, `.head/.gauge`, `.dock .pill` (sélecteur profondeur), scène île+pins, **#veilleur** (L125-129), reduced-motion media.
- `design/proto-plage-plongee.html` : pas le moteur scroll complet (overkill pour une page MID statique), mais réutiliser ses **tokens** `:root` (L19-35) et le pattern teinte mer pilotée par `status réel` (`--seaTint`, jamais cleanFloor — `feedback_forecast_floor_ban`).
- `src/HomeAZ.jsx` : la barre de qualité de référence ; viser le même niveau de finition. (NE PAS importer son code : le hub est standalone HTML, pas React.)
- skill `sg-svg-scene` : moteur viewBox 800×600 slice, 1 rAF max, pièges payés (sticky void, transform de pose, snap couleur). Skill `sg-design-system` : palette/fonts/Veilleur/doctrine calme.

---

## A/B

Les hubs/communes sont des **pages HTML server-generated**, pas des composants React montés derrière un `abVariant()` runtime. Stratégie A/B en 2 temps :

1. **Bras serveur réversible (toggle build)** : flag **`zones_az`** lu dans `vite.config.js` via `process.env.SG_ZONES_AZ` (ou constante en tête de fichier).
   - `SG_ZONES_AZ=0` (ou absent) → **control** = rendu actuel intact (HTML inline system-ui, L1382). Le contenu/SEO actuel ne bouge pas.
   - `SG_ZONES_AZ=1` → **variant** = `renderZoneHub` golden-hour.
   - Réversible : un seul env flip + rebuild ⇒ retour control sans perte. Aucune URL supprimée, aucun 301.
   - Override visiteur (pour QA/screenshot live) : générer les DEUX corps et exposer la variante via `?zones_az=1/0` lu par un mini-script d'enhancement non bloquant (progressive enhancement ; le `<noscript>`/contenu par défaut = celui choisi par le build). KISS : v1 = flip build only, override visiteur en v2 si besoin de mesurer côté users.

2. **Mesure** : ces pages portent déjà le snippet analytics first-party (même `index.html` base via `htmlSubpage`). Tracker l'entrée hub→fiche et hub→`openPremium` avec les events `sg_*` existants (réutiliser `sg_beach_open` source `'zone_hub'`/`'commune_hub'` ; `sg_premium_open` source `'zone_forecast'`). **Ne PAS inventer de nouveaux noms d'event** (`funnel_tracking_gap`). Évaluer via `node scripts/automation/ab-eval.cjs --days=28` + funnel Apps Script.

**Ce que voit le control** : exactement la page actuelle (annuaire HTML inline), inchangée. Les pages communes étant NOUVELLES, leur « control » = leur absence ; on les ship derrière `zones_az=1` et on compare le trafic SEO acquis (additif, aucun risque de régression sur l'existant).

Convention pour la sortie structurée : flag A/B = **`zones_az`** (override QA `?zones_az=1/0`).

---

## Données réelles à brancher

Toutes server-side au build (déterministe, daté), depuis les JSON déjà lus dans `vite.config.js` :
- **Statut du jour** : `SARGASSUM_REF` → `statusById[b.id]` (déjà utilisé L1313). Valeurs `clean|moderate|avoid`. `zClean` = count `clean`.
- **Score 0-100** (si dispo) : `sargassum.json.scores` ou `b.score` — pour trier le « meilleur spot ». Si absent → tri `clean` d'abord puis alpha (comportement actuel L1374-1375).
- **Tendance 7j** : `sargassum.json.weekly[slugify(b.name)].forecast[]` (clés = name-slug ; champs `day,date,afai,status,confidence,type,regime,sources` — vérifié sur `grande-anse`). Agréger sur les plages de la zone/commune : compter jours `clean` vs `moderate+avoid`. **Honnêteté** : `type:'observation'` (J0) vs `type:'tendance'` (J1+) — libeller « prévision » au-delà de J0 ; exclure les plages sans `weekly` du calcul (ne pas extrapoler).
- **Fraîcheur** : `sargassum.json.updatedAt` + `dataAgeMinutes`. **Règle dure (skill `sg-design-system`)** : si âge > 12 h, afficher « vérification en cours » au lieu d'un faux « EN DIRECT / heure ». Ne JAMAIS afficher un timestamp inventé (proto `.live` montre l'heure → la calculer depuis `updatedAt`, pas `Date.now()` brut si stale).
- **Date** : `today` (L134 / L694) = `new Date().toISOString().slice(0,10)`.
- **Interdits data** : zéro `cleanFloor` atlantique ; la teinte mer / le verdict se branchent UNIQUEMENT sur `status/regime` réels (`feedback_forecast_floor_ban`). Zéro image IA. Pas de promesse « 80 % justes » globale sur ces pages (utiliser la fiabilité **par régime** si on l'affiche, cf. `project_reliability_badge`).

---

## SEO (si page)

**Hubs zones (existants — NE PAS casser l'indexation, ils sont déjà classés)** :
- title/desc/canonical/og/twitter/hreflang/JSON-LD **inchangés** (L1385-1411). Seul le corps visible change. Re-vérifier après build que les `.replace()` matchent toujours (le restyle ne doit pas altérer le `<head>`).
- hreflang : `fr` + `x-default` self uniquement (pas de en/es) — pattern L1389-1393.
- Maillage : home→zone (depuis carte/footer), plage→zone (`zoneLine` L1248), zone→plages + zone↔zones + zone→communes (nouveau).

**Pages communes (nouvelles)** :
- **slug=nom** : `commune-` + `slugify(commune)`. Ne JAMAIS renommer une commune (= requête SEO).
- title/desc uniques par commune (cf. 2d), canonical self, hreflang fr+x-default self, JSON-LD CollectionPage+BreadcrumbList, ajout sitemap (`sitemapMQBeaches`/`sitemapGPBeaches`).
- **Anti-cannibalisation** : ne pas dupliquer le contenu d'un hub zone ; la commune cible une intention plus fine (« plages <commune> »). Pour les communes à 1 plage : surveiller GSC ; si « Duplicate, submitted URL not selected as canonical » apparaît, basculer canonical commune→fiche (cf. leçon `^plages/?$` duplicate, htaccess L202-205).
- **Ne pas créer de 301 qui masque une page servable** (leçon `/a-propos/` & `/methode-carte/`, htaccess L107-115). Les pages communes sont servies physiquement → aucun 301 dessus.
- Vérifier qu'aucun slug `commune-<x>` n'entre en conflit avec un slug de plage existant (préfixe `commune-` garantit l'unicité ; tout de même asserter au build : `if (allBeachSlugs.has(cSlug)) throw`).

---

## Vérification

```bash
# 0) Syntaxe JSX du monolithe (si on touche Sargasses_PROD.jsx pour ?zone flyTo)
node -e "require('esbuild').transform(require('fs').readFileSync('Sargasses_PROD.jsx','utf8'),{loader:'jsx',jsx:'automatic'}).then(()=>console.log('OK')).catch(e=>{console.log((e.errors||[]).map(x=>x.text+' @L'+(x.location&&x.location.line)).join('\n'));process.exit(1)})"

# 1) Build complet (génère hubs + communes). Vérifier: "built in", 136 pages, +N hubs zones, +M communes, 0 erreur
SG_ZONES_AZ=1 npm run build   # variant
# puis control pour comparer:
npm run build                 # SG_ZONES_AZ absent = control

# 2) Compter les pages générées
node -e "const fs=require('fs');const d='dist/plages';const dirs=fs.readdirSync(d).filter(e=>fs.statSync(d+'/'+e).isDirectory());console.log('total sous-/plages/:',dirs.length);console.log('hubs zones:',dirs.filter(e=>!e.startsWith('commune-')&&e.startsWith('plages-')).length);console.log('communes:',dirs.filter(e=>e.startsWith('commune-')).length)"

# 3) Vérifier le <head> SEO intact d'un hub (canonical/hreflang/title)
node -e "const h=require('fs').readFileSync('dist/plages/plages-sud-martinique/index.html','utf8');['<link rel=\"canonical\"','hreflang=\"fr\"','<title>'].forEach(s=>console.log(s, h.includes(s)?'OK':'MANQUE'))"

# 4) Serveur local + Playwright (l'app preview TIMEOUT — toujours serveur+PW)
python -m http.server 8790 --bind 127.0.0.1   # background, depuis le repo
# script .cjs DANS le repo (sinon 'Cannot find module playwright'):
#   navigate http://127.0.0.1:8790/dist/plages/plages-sud-martinique/index.html
#   waitForTimeout(1200); capter pageerror + console.error; screenshot; Read le png
#   JUGER la capture à la barre HomeAZ (golden-hour, Veilleur serein, calme au repos, lisible)
#   idem une page commune: .../dist/plages/commune-sainte-anne/index.html
#   reduced-motion: emulateMedia({reducedMotion:'reduce'}) → vérifier 0 animation (plancher dur)

# 5) prepare-ftp : confirmer que communes + hubs survivent au packaging
node scripts/prepare-ftp.cjs   # lire "plages filtrées … gardées (dont N hubs zones)" + communes conservées
node -e "const fs=require('fs');['martinique-ftp','guadeloupe-ftp'].forEach(f=>{const d=f+'/plages';if(!fs.existsSync(d))return;const c=fs.readdirSync(d).filter(e=>e.startsWith('commune-'));console.log(f,'communes:',c.length, c.slice(0,3).join(','))})"

# 6) hrefs : aucune page commune/zone ne doit 404 (feedback_validate_hrefs)
#   après deploy: curl -sI https://sargasses-martinique.com/plages/commune-sainte-anne/ | head -1  → 200
```

---

## Garde-fous spécifiques

- **Routing** : `/plages/*` n'a PAS de SPA fallback (htaccess L259) → toute page DOIT être générée au build. Ne jamais compter sur l'app pour servir un hub/commune manquant (= 404, pas l'app).
- **Slug** : préfixe `commune-` OBLIGATOIRE (collisions avec 301 legacy `sainte-anne`/`grande-anse`/… htaccess + collision MQ↔GP). Asserter au build l'unicité vs slugs plages.
- **Doublon data** : fusionner `Schœlcher`→`Schoelcher` avant de grouper (sinon 2 communes fantômes). Tout fix de `commune` dans beaches-list passe par `check-beach-proximity.cjs` (`reference_beaches_data_quality`).
- **Source unique** : zones (et idéalement le helper `communeSlugsFor`) restent dans `scripts/lib/coast-zones.cjs`, consommés par vite ET prepare-ftp. Ne JAMAIS redéfinir les zones dans `vite.config.js` (commentaire L1067).
- **FTP whitelist** : étendre `prepare-ftp.cjs` L181 pour garder `commune-*` (sinon 404 au packaging, bug 2026-06-12).
- **SEO non-régression** : restyle = corps seulement ; `<head>` (canonical/hreflang/JSON-LD/og) intact. Aucune page supprimée, aucun 301 ajouté sur un chemin servable.
- **Doctrine calme** : repos = tableau (pas d'aquarium). `prefers-reduced-motion` = early-return / `animation:none` (proto L67). Le Veilleur = 1 satellite, œil mi-clos, ne fixe pas l'utilisateur (`rassure ≠ surveille`).
- **Conversion** : `openPremium(source)` UNIQUE dans l'app ; le hub renvoie vers l'app, ne crée jamais un 2e checkout. `stripe-config.php` JAMAIS touché.
- **Honnêteté data** : freshness <12 h sinon « vérification en cours » ; forecast = `weekly[].forecast[]` réel ; jamais de `cleanFloor` atlantique ; zéro image IA.
- **Shabbat** : ven 18 h → sam 19 h, aucun deploy (GH Actions couvrent).
- **Anti-cul-de-sac** : chaque hub/commune offre flyTo carte + fiche + zone parente (jamais une impasse).
