# US_SEO_DIAGNOSIS.md — Pourquoi les sites US ont 0 trafic, et quoi faire

> Diagnostic produit en session autonome (2026-06-24). **Aucune modif du pipeline de
> build n'a été faite ici** : les générateurs SEO alimentent 5 sites live (MQ/GP/US) ;
> les changer sans pouvoir vérifier en direct risquerait de casser les builds MQ/GP qui
> portent le MRR. Ce doc liste les étapes sûres à exécuter **ensemble, en ligne**.

## Constat

Les 3 sites US (`florida`/sargassummiami.com, `puntacana`, `rivieramaya`/sargassumcancun.com)
+ `barbados` (prêt à brancher) :
- ✅ ont chacun **12 plages inline**, `routes`/`seo`, build par région (`VITE_REGION=<id>`),
  déploiement par `prepare-ftp.cjs` vers `<region>.ftpDir`.
- ✅ génèrent une **page index région** + **pages plage** (via `vite.config.js`).
- ❌ **0 impression / 0 clic en Search Console** (audit verticales).

## Cause racine : surface SEO maigre + pas de soumission

La profondeur qui fait le trafic organique MQ/GP est **hardcodée MQ/GP** et NE bénéficie PAS aux sites US :

| Surface SEO | MQ/GP | US |
|---|---|---|
| Pages plage | 136 | ~12/région |
| Pages **communes** (`generate-seo-pages.cjs`, liste en dur mq/gp) | ✅ | ❌ |
| Pages **mois** (`/sargasses-juin-2026/`) | ✅ | ❌ |
| **Hubs conditions** + `/plages/` index + `/fiabilite/` | ✅ | ❌ |
| BreadcrumbList / FAQ schema | ✅ | partiel |

→ Un site US = ~13 pages indexables thin vs ~200+ pour MQ/GP. **Trop peu de surface pour ranker.**
À cela s'ajoute : domaines récents + **probable absence de soumission Search Console** (chaque domaine US doit être ajouté comme propriété GSC + sitemap soumis).

## Plan d'action (ordre de levier, à faire en ligne)

### A. Vérifs rapides (sans risque, à lancer d'abord)
1. Confirmer qu'un **sitemap.xml est généré et déployé** dans chaque build US :
   `VITE_REGION=florida npm run build` puis vérifier `dist/sitemap.xml` (et `<ftpDir>/`).
2. Vérifier l'**indexabilité** : `robots.txt` US n'interdit rien, `<link rel=canonical>` correct,
   `hreflang` cohérent (EN/ES) sur chaque domaine US.
3. Vérifier que les **12 pages plage US ont un contenu unique** (titre/description/FAQ
   localisés EN/ES) et pas un template vide.

### B. Élargir la surface (le vrai levier — medium effort, À TESTER par build région)
Rendre **région-aware** (paramétrer par `REGION` au lieu de constantes mq/gp) :
1. `generate-seo-pages.cjs` — générer des **pages "zone/ville"** pour les villes US
   (Miami Beach, Fort Lauderdale, Tulum, Playa del Carmen, Cancún Hotel Zone, Punta Cana/Bávaro…).
   Source : `REGION.beaches[].commune` + une petite liste curée par région.
2. Pages **mois** + **hubs conditions** + **/plages/ index** : généraliser depuis `vite.config.js`
   au lieu du chemin MQ/GP only.
   ⚠️ Chaque changement DOIT être validé par `VITE_REGION=<id> npm run build` sur **chaque** région
   (mq, gp, florida, puntacana, rivieramaya, barbados) avant push — c'est pour ça que c'est hors-scope autonome.

### C. Soumission & mesure (action fondateur — creds requis)
1. **Search Console** : ajouter chaque domaine US comme propriété + soumettre le sitemap.
   (`seo-submit-urls.cjs` peut pinger, mais l'ajout de propriété est manuel.)
2. **GA4 / Clarity** : remplir les placeholders dans `regions/<id>.json` (déjà notés pour barbados).
3. Laisser 2-4 semaines puis lire les impressions GSC par site.

### D. Acquisition complémentaire (au-delà du SEO pur)
- Les sites US ciblent des **touristes anglophones** : le canal SEO est lent à démarrer.
  Envisager, en parallèle, du contenu de partage viral EN/ES + la boucle de parrainage
  (déjà codée pour EUR — à étendre USD une fois quelques abonnés, cf. REFERRAL_LOOP.md §7).

## TL;DR
Le produit US est prêt, mais **trop maigre en pages et probablement pas soumis à GSC**.
Le gros levier = **généraliser les générateurs SEO MQ/GP aux régions US** (à tester build par build,
donc en ligne) + **soumettre les sitemaps en Search Console** (action fondateur).
