# Canonical/hreflang + indexation — spec d'exécution

> Surface BLOQUANTE du plan (REFONTE-EXECUTION.md §7-B). KPI indexation : MQ ~3/30
> PASS, GP ~2/30 PASS (GSC). Cette surface n'a PAS d'UI : c'est de la tuyauterie
> SEO (`.htaccess`, `vite.config.js`, `prepare-ftp.cjs`, sitemaps, QA scripts).
> Aucun proto design (proto-map-v2 / proto-plage-plongee / HomeAZ) n'est touché —
> ils restent la barre de qualité des PAGES, pas de l'infra d'indexation.

---

## État actuel

### Ce qui marche (audit infra 2026-06-16, curl-validé prod — `project_gsc_indexation_gap.md:54-65`)
L'infra est **saine**. Le 3/30 n'est PAS un bug d'infra mais autorité de domaine +
crawl-budget sur 100+ pages programmatiques. Vérifié sans défaut :
- **www→non-www + http→https** : 1 hop, les deux domaines (`public/.htaccess:3-13`).
- **Clusters hreflang fr/en/es+x-default réciproques** : `setAltCluster()` (`vite.config.js:603-607`) reconstruit le cluster complet par sous-page EN/ES depuis `pages[].enPath/esPath`.
- **Per-island filtering actif** (cause racine 2026-04 corrigée, commit e6541e3) : `prepare-ftp.cjs:172-188` supprime les fiches de l'autre île. Vérifié : `martinique-ftp/plages` = 57 dirs, `guadeloupe-ftp/plages` = 88 dirs (≠ 136 = plus de duplicate cross-domain).
- **Zéro noindex accidentel.** Fiches plage riches+uniques (FAQ contextuelle par statut/exposition `vite.config.js:1128-1153`, météo datée `vite.config.js:801-813`, voisines).
- **Sitemaps per-domain corrects** : `martinique-ftp/sitemap.xml` = 107 URLs, `guadeloupe-ftp/sitemap.xml` = 137 URLs (généré `vite.config.js:696-752`, copié vers `sitemap.xml` par `prepare-ftp.cjs:215-222`).
- **Homepage GP** : template bespoke `writeRegionIndex()` (`prepare-ftp.cjs:416-643`) — canonical/hreflang/og/JSON-LD 100% GP (`prepare-ftp.cjs:446-450`). La homepage MQ vient de `index.html:15-19` (hardcodée MQ, correct car le build par défaut = MQ).
- **Sous-pages GP** : patchées par le bloc `region.id === 'gp'` (`prepare-ftp.cjs:236-337`) qui swappe `sargasses-martinique.com`→`sargasses-guadeloupe.com` (donc canonical/hreflang/og), GA4/Clarity IDs, geo, JSON-LD, titres.

### Source de génération canonical/hreflang (par type de page, `vite.config.js`)
| Type page | canonical | hreflang émis | Lignes |
|---|---|---|---|
| Homepage MQ | self `…-martinique.com/` | fr/en/es/x-default (cluster complet) | `index.html:15-19` |
| Homepage GP | self `…-guadeloupe.com/` | fr/en/es/x-default | `prepare-ftp.cjs:446-450` |
| Éditoriale FR (`pages[]`) | self | fr=self, en/es si `enPath/esPath`, x-default=self | `vite.config.js:504-510` |
| Sous-page EN (`enPages[]`) | self | cluster via `setAltCluster` | `vite.config.js:628,631-635` |
| Sous-page ES (`esPages[]`) | self | cluster via `setAltCluster` | `vite.config.js:673,676-680` |
| Fiche plage | self `…/plages/<slug>/` | fr=self + x-default=self, **en/es retirés** | `vite.config.js:1157-1164` |
| Hub `/plages/` | self | fr+x-default self, en/es retirés | `vite.config.js:1339-1344` |
| Hub zone `/plages/<zone>/` | self | fr+x-default self | `vite.config.js:1388-1393` |
| `/conditions/*` | self | fr+x-default self | `vite.config.js:1506-1511,1541-1546` |

### Ce qui manque / défauts confirmés (correctifs à exécuter)
1. **Pas de garde "toute URL sitemap répond 200"** (recommandé `project_gsc_indexation_gap.md:65`). `seo-sitemap-check.cjs` vérifie disque↔sitemap mais **pas le code HTTP réel** (ni 301/302). C'est exactement ce qui a laissé passer `/methode-carte/` masquée par un 301 (et `/a-propos/`, `/fiabilite/` avant). **C'est le correctif #1 de cette spec** : il transforme une classe de bugs récurrente en échec CI.
2. **Sitemap freshness gonflée** (`project_gsc_indexation_gap.md:61`) : tout en `changefreq daily` + `lastmod` = date de build bumpée à CHAQUE build (`vite.config.js:694` → `today`) même sans changement de contenu. Google apprend à ignorer le signal `lastmod`. Les fiches plage devraient porter le `lastmod` de la vraie dernière bascule de statut.
3. **`.htaccess:259` lookahead SPA incohérent** : exclut `api/|assets/|en/|beaches/|config/|plages/` mais **pas `es/`**. En pratique inerte (le guard `!-d` ligne 257-258 sert les vrais dossiers `/es/...` avant la règle), mais asymétrie fragile — un jour où `/es/<x>/` n'existe pas sur disque, la route tombe sur `index.html` MQ (canonical MQ) au lieu d'un 404. Ajouter `es/` au lookahead = cohérence + filet.
4. **Pression Indexing API faible** : `seo-submit-urls.cjs` tourne 2×/sem (`weekly-seo-automation.yml`). Sur 100+ pages programmatiques avec autorité faible, passer la soumission des URLs Tier-1 (audit-discovered) à **quotidienne** accélère le re-crawl (idée déjà notée `project_gsc_indexation_gap.md:49`).
5. **Pas de hreflang entre MQ et GP** : les deux domaines sont traités comme des sites séparés. C'est VOULU (contenu distinct par île, pas de traduction). Ne PAS ajouter de hreflang fr-FR croisé MQ↔GP — ce serait du faux signal (même langue, contenu différent) → laisser tel quel. Documenté ici pour qu'un futur exécutant ne "corrige" pas à tort.

---

## Objectif (barre HomeAZ + KPI visé)
- **Barre** : invisible pour l'utilisateur (zéro changement de pixel) — l'objectif est que Googlebot indexe plus de pages, pas qu'un humain voie quelque chose. La "barre HomeAZ" ici = ne RIEN casser de ce qui marche en prod (canonicalisation, funnel, deep-links).
- **KPI** : faire monter le ratio PASS dans `audit-full.json` (MQ 3/30 → viser >10/30, GP 2/30 → viser >8/30 sur 60-90j). Mesure = `scripts/automation/data/audit-summary.json` (audit GSC quotidien CI). Signal réel à J+14 minimum (Google lent à réévaluer).
- **Effet de levier** : un sitemap honnête (lastmod réel) + zéro URL sitemap qui 301/404 + plus de pression Indexing API = meilleur crawl-budget sur les pages qui convertissent (fiches plage, hubs, `/carte-sargasses/`).

---

## Changements exacts (étape par étape)

> Aucun de ces changements ne touche `Sargasses_PROD.jsx`, `src/HomeAZ.jsx`,
> `src/MapView.jsx`, les protos, ni `stripe-config.php`. C'est de l'infra build/QA.

### Changement 1 — Garde "URL sitemap → 200 réel" (correctif #1, NON-A/B)
Étendre `scripts/automation/seo-sitemap-check.cjs` pour ajouter un mode "live HTTP probe" qui interroge les vraies URLs du sitemap en prod et échoue si une réponde 301/302/404.

Détail :
- Ajouter une fonction `probeLive(domain, paths)` qui fait un `https.request` `HEAD` (fallback `GET` si HEAD 405) sur chaque URL `<loc>` du sitemap déployé, en suivant **0 redirect** (`{ followRedirect:false }` manuel — on veut détecter le 301).
- Classer : `200` = OK, `301/302` = **FAIL bloquant** (URL au sitemap mais redirigée = exactement le bug methode-carte/a-propos), `404/410` = FAIL, `5xx` = warning (transitoire).
- Réutiliser le pattern réseau de `health-check.cjs:22-52` (https.get + timeout 15s + retry) — ne pas réécrire un client HTTP.
- Sortie : ajouter `liveProbe: { ok, redirected:[...], notFound:[...] }` dans `data/sitemap-check.json`.
- Mode : flag `--live` (par défaut OFF = comportement actuel disque-only, pour les runs build offline). En CI hebdo, l'appeler avec `--live`.
- **Exit code 1** si `redirected.length || notFound.length` en mode `--live` → fait échouer le step CI.

Garde-fou de réutilisation : `seo-sitemap-check.cjs` parse déjà les sitemaps (`parseSitemapUrls` l.78-82) et connaît les domaines (`SITES` l.22-25). Greffer dessus, ne pas créer un nouveau script.

### Changement 2 — `lastmod` honnête sur les fiches plage (correctif #2, NON-A/B)
Dans `vite.config.js`, le sitemap des fiches plage est construit dans la boucle `for (const b of beaches)` (sitemap entries autour de `sitemapMQBeaches`/`sitemapGPBeaches`, après `vite.config.js:1043`). Aujourd'hui le `lastmod` global = `today` (`vite.config.js:694`).

Détail :
- Source de la vraie date de changement : `public/data/history.json` (ou l'historique par plage déjà lu pour la beach memory) — prendre la date de la dernière bascule de `status` de la plage. Si indisponible, fallback sur le `updatedAt` de `public/api/copernicus/sargassum.json`.
- Pour les fiches plage : `<lastmod>` = date du dernier changement de statut de CETTE plage, pas `today`.
- Pour les pages éditoriales statiques (`/comprendre-sargasses/`, `/danger-sargasses-h2s/`, etc.) : `lastmod` = `article:modified_time` déjà calculé (`vite.config.js:516` `modDate`) — déjà honnête, garder.
- Garder `changefreq daily` UNIQUEMENT sur homepage + `/carte-sargasses/` + `/previsions/` + fiches plage (vrai contenu quotidien). Passer les éditoriaux statiques à `monthly` (déjà le cas l.728-737, OK) et les hubs à `weekly`.
- **Honnêteté (doctrine)** : ne JAMAIS bumper un `lastmod` si le contenu de la page n'a pas changé. C'est la version SEO de la règle "pas de fausse fraîcheur" du `sg-design-system`.

### Changement 3 — `es/` dans le lookahead SPA (correctif #3, NON-A/B)
`public/.htaccess:259` :
```apache
RewriteRule ^(?!api/|assets/|en/|beaches/|config/|plages/)(.*)$ /index.html [L]
```
→ devenir :
```apache
RewriteRule ^(?!api/|assets/|en/|es/|beaches/|config/|plages/)(.*)$ /index.html [L]
```
Pur ajout de `es/|` après `en/|`. Idempotent (le guard `!-d` couvre déjà les dossiers existants). Symétrie avec `en/`. Vérifier que `prepare-ftp.cjs` copie bien `.htaccess` tel quel (il vient de `public/`, copié verbatim par `copyRecursive` — pas de swap MQ/GP nécessaire sur ce fichier car il n'a pas d'URL absolue de domaine sauf le bloc www l.5-6 qui matche les deux domaines).

### Changement 4 — Soumission Indexing API quotidienne pour Tier-1 (correctif #4, NON-A/B)
Dans `weekly-seo-automation.yml`, `seo-submit-urls.cjs` tourne 2×/sem. Option la moins risquée :
- Ajouter un step dans `daily-copernicus.yml` (qui tourne déjà 4×/j) qui appelle `seo-submit-urls.cjs --tier=1 --max=20` (URLs audit-discovered uniquement, cap quota GSC 200/j/site).
- **Garde-fou impératif** (`feedback_workflow_dispatch_sideeffects`) : ce step ne doit JAMAIS tourner sur `workflow_dispatch` (retry manuel = spam Indexing API → quota brûlé). Conditionner `if: github.event_name == 'push' || github.event_name == 'schedule'`.
- `continue-on-error: true` (un quota dépassé ne doit pas casser le build/deploy).
- Vérifier d'abord que `seo-submit-urls.cjs` accepte `--tier`/`--max` (sinon ajouter le parsing args). NE PAS dupliquer la logique de tiers déjà décrite `project_gsc_indexation_gap.md:37`.

### Ordre d'exécution (1 action complète par tick, cadence REFONTE §1)
1. Changement 3 (`.htaccess` es/) — 1 ligne, zéro risque, vérif curl. **Faire en premier.**
2. Changement 1 (garde sitemap→200 live) — le filet qui attrape les régressions futures.
3. Changement 2 (lastmod honnête) — le vrai signal SEO.
4. Changement 4 (Indexing API quotidien) — accélérateur, en dernier (effet mesurable lent).

---

## A/B
**Aucun A/B.** Cette surface est de l'infra SEO server-side (redirections, sitemaps,
balises `<head>` rendues à Googlebot) : il n'y a pas d'expérience utilisateur à
splitter, et un A/B sur du canonical/hreflang créerait des signaux contradictoires
pour Google (deux canonicals selon un cookie = catastrophe d'indexation). Les
changements sont **déterministes et globaux**.

Réversibilité (à la place de l'A/B) :
- Chaque changement est un commit isolé, `git revert`-able.
- Changement 3 (`.htaccess`) : retirer `es/|` = retour exact à l'état actuel.
- Changement 1 (`--live`) : OFF par défaut → n'affecte rien tant que le flag CLI n'est pas passé.
- Changement 4 : retirer le step `daily-copernicus.yml` = retour à 2×/sem.
- Le control "vu par tout le monde" = le comportement prod actuel ; ces changements ne modifient aucun rendu visible.

---

## Données réelles à brancher
- **`lastmod` fiches plage** : `public/data/history.json` (date dernière bascule statut par plage) ; fallback `public/api/copernicus/sargassum.json` `.updatedAt`. **Honnêteté** : si pas de changement de statut → garder le `lastmod` précédent, ne pas mettre `today`.
- **Garde sitemap→200** : pas de données JSON, ce sont des probes HTTP live contre `https://sargasses-martinique.com` / `https://sargasses-guadeloupe.com` (les `<loc>` réels du sitemap déployé).
- **Indexing API** : `scripts/automation/data/audit-full.json` (URLs `Discovered/Crawled/Unknown` = Tier-1) — déjà produit par `seo-audit.cjs` quotidien.
- **Aucune donnée inventée** : les compteurs "53 plages" (MQ) / "83 plages" (GP) des titres homepage doivent matcher `beaches-list.json` filtré par île (vérifiable : `martinique-ftp/plages`=57 dirs incl. hubs, fiches réelles=53). Ne pas hardcoder un compteur faux.

---

## SEO (si page)
Pas de NOUVELLE page créée. Règles à NE PAS casser sur l'existant :
- **canonical self-référent** sur chaque page indexable (déjà le cas — la garde du Changement 1 le protège contre les régressions 301).
- **hreflang réciproque** fr/en/es+x-default où une traduction existe ; **pas** de hreflang croisé MQ↔GP (contenu distinct, même langue = faux signal — voir État actuel défaut #5).
- **slug = nom = SEO** : `slugify(b.name)` est la source unique (`vite.config.js:24`, `prepare-ftp.cjs:29`). JAMAIS renommer une plage (`reference_beaches_data_quality`). Le `lastmod` honnête ne touche pas les slugs.
- **Ne JAMAIS 301 un chemin servable** (leçon `/a-propos/`, `/methode-carte/`, `/fiabilite/`) : c'est précisément la classe de bug que le Changement 1 verrouille en CI.
- **Maillage interne** : intact (noscript éditorial GP `prepare-ftp.cjs:594-614`, cross-island `rewriteCrossIsland` `vite.config.js:483-494`). Ne pas y toucher.
- **robots.txt** : régénéré per-domain (`prepare-ftp.cjs:223-230`), 1 sitemap par domaine. OK, ne pas toucher.
- **`neptunes_fury.html`** reste `Disallow` (robots) → ne PAS le 301 tant que disallow (`project_gsc_indexation_gap.md:63`).

---

## Vérification

> Rappel REFONTE §3 : l'app preview TIMEOUT → serveur local + Playwright.
> Ici la majorité de la vérif est curl/HTTP, pas navigateur.

```bash
# 0) Syntaxe JS de vite.config (Changement 2) — pas de JSX ici, juste parse :
node --check vite.config.js

# 1) Build complet (intègre Changement 2, génère dist/ + sitemaps) :
npm run build            # attendre "built in", 0 erreur, ~136 pages
node scripts/prepare-ftp.cjs   # produit martinique-ftp/ + guadeloupe-ftp/

# 2) Sitemaps régénérés, lastmod honnête (Changement 2) :
#    Vérifier qu'un build sans changement de données NE bump PAS tous les lastmod.
grep "<lastmod>" guadeloupe-ftp/sitemap.xml | sort | uniq -c
#    → doit montrer des dates VARIÉES (pas tout en today) sur les fiches plage.

# 3) Garde sitemap→200 live (Changement 1), contre la prod :
node scripts/automation/seo-sitemap-check.cjs --live
#    → exit 0 attendu ; si /methode-carte/ ou autre 301 → exit 1 + liste.

# 4) Canonical/hreflang QA (régression) — doit rester à ~0 issue :
node scripts/automation/seo-canonical-hreflang.cjs
#    → byKind vide ou inchangé vs avant le patch.

# 5) .htaccess es/ (Changement 3) — vérif syntaxe rewrite + symétrie en/es.
#    En prod après deploy, curl les routes virtuelles ES et un vrai dossier ES :
curl -sI https://sargasses-martinique.com/es/ | head -1          # 200 (dossier réel)
curl -sI https://sargasses-martinique.com/es/mapa-sargazo/ | head -1  # 200 (dossier réel)

# 6) Smoke prod post-deploy (les pages qui DOIVENT répondre 200, pas 301) :
for u in /methode-carte/ /a-propos/ /fiabilite/ /plages/ /carte-sargasses/; do
  echo -n "$u -> "; curl -sI "https://sargasses-martinique.com$u" | head -1
done
#    → tous 200. Aucun 301.

# 7) Indexing API (Changement 4) — dry-run AVANT de câbler le cron :
node scripts/automation/seo-submit-urls.cjs --tier=1 --max=5 --dry-run
#    → liste 5 URLs Tier-1 sans soumettre. Vérifier qu'elles sont réelles (200).
```
Playwright (optionnel, seulement si on touchait du rendu — ici non) : non requis,
aucun pixel ne change. Si doute sur le head rendu d'une page générée :
```bash
python -m http.server 8790 --bind 127.0.0.1   # background
# puis script .cjs DANS le repo : navigate http://127.0.0.1:8790/martinique-ftp/plages/<slug>/ ,
# evaluate document.querySelector('link[rel=canonical]').href + les hreflang.
```

---

## Garde-fous spécifiques
- **JAMAIS toucher `stripe-config.php`** ni le funnel (`openPremium`, events `sg_*`) — cette surface ne les croise pas, mais le build les embarque ; vérifier `npm run build` reste vert.
- **JAMAIS 301 un chemin servable.** Le Changement 1 EXISTE pour empêcher la récidive (a-propos / methode-carte / fiabilite). Si la garde live échoue après un futur ajout `.htaccess`, c'est un VRAI bug, pas un faux positif — corriger la règle, pas la garde.
- **Pas de hreflang croisé MQ↔GP** (faux signal même-langue/contenu-différent). Ne pas "améliorer" ça.
- **Honnêteté lastmod** = règle dure : pas de fraîcheur inventée (miroir SEO de la doctrine `feedback_data_reliability` + ban fausse fraîcheur du `sg-svg-scene`).
- **`workflow_dispatch` interdit pour le step Indexing API** (`feedback_workflow_dispatch_sideeffects`) : `if: github.event_name == 'push' || 'schedule'` + `continue-on-error`. Sinon un retry manuel brûle le quota GSC (200/j).
- **Per-island filtering** (`prepare-ftp.cjs:172-188`) est la correction de la cause racine 2026-04 : ne JAMAIS la retirer ni copier `dist/` complet vers les deux FTP. Si `martinique-ftp/plages` repasse à 136 dirs → duplicate cross-domain de retour.
- **Shabbat ven 18h→sam 19h : aucun deploy** (GH Actions couvrent l'ops).
- **`git pull --rebase` avant push** ; **jamais `git add -A`** (stage fichier par fichier) ; **bump `public/sw.js` `CACHE_NAME`** seulement si du code app change (ici non : ce sont des fichiers build/CI/.htaccess → pas de SW bump nécessaire, mais vérifier qu'aucun asset hashé ne change).
- **Validation hrefs** (`feedback_validate_hrefs`) : tout chemin déclaré au sitemap DOIT répondre 200 — c'est désormais automatisé par le Changement 1.
