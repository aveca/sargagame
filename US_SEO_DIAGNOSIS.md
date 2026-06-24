# US_SEO_DIAGNOSIS.md — Pourquoi les sites US ont 0 trafic, et quoi faire

> Diagnostic révisé (2026-06-24) après inspection du build réel. **Correction d'une
> hypothèse initiale fausse** : les sites US ne sont PAS maigres.

## Constat réel (après build)

`scripts/lib/region-seo-pages.cjs` (800 l.) est **déjà région-aware** et génère, pour
chaque région US, un jeu de pages riche. Build `VITE_REGION=florida` mesuré :
- **~125 pages** générées · **12 plages** + **35 resorts** + hubs (forecast/today/map/season)
  + page mois (`/sargassum-june-2026/`) + `/sargassum-health-risks/` (8 Q&A) + sitemap.

Donc l'infra SEO US est **saine**. Le « 0 impression Search Console » ne vient PAS d'un
manque de pages côté code.

## Causes réelles du 0 trafic (par ordre de probabilité)

1. **Sitemaps probablement pas soumis à Google Search Console.** Chaque domaine US
   (sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com) doit être ajouté
   comme propriété GSC + sitemap soumis. ⟶ **action fondateur (creds GSC)**.
2. **Domaines récents** : indexation Google = plusieurs semaines après soumission.
3. **florida + puntacana étaient EN uniquement** alors qu'ils déclarent `secondaryLangs:["es"]`.
   Le set /es/ ne s'active que si `regions/seo-content/<id>.es.json` existe (cf.
   `scripts/lib/region-langs.cjs`). ⟶ **EN COURS DE CORRECTION** : ajout de
   `florida.es.json` + `puntacana.es.json` → double la surface SEO (Miami + Punta Cana
   ont une énorme audience hispanophone). S'active tout seul au prochain build.

## Plan d'action

### ✅ Fait / en cours (sûr, automatique)
- [x] Contenu ES Miami + Punta Cana (`regions/seo-content/florida.es.json`,
      `puntacana.es.json`) → active `/es/` sur ces 2 sites, double les pages indexables.

### ⚠️ Actions fondateur (creds requis — je ne peux pas)
- [ ] **Search Console** : ajouter chaque domaine US comme propriété + soumettre le sitemap.
- [ ] **GA4 / Clarity** : remplir les placeholders `regions/<id>.json` (mesurer le trafic).

### 🟢 Leviers code additionnels (à valider build par build, en ligne)
- Étendre les pages « zone/ville » US (Miami Beach, Fort Lauderdale, Tulum, Playa del
  Carmen, Cancún Hotel Zone, Bávaro…) via `region-seo-pages.cjs` si on veut plus de longue traîne.
- Barbados : écrire son `seo-content/barbados.json` avant go-live (EN).

## TL;DR
L'infra SEO US est bonne (~125 pages/site). Le trafic = **0** surtout parce que les
sitemaps ne sont (probablement) **pas soumis à GSC** + domaines récents. Le levier code
le plus propre — **ajouter l'espagnol à Miami & Punta Cana** — est fait. Le reste est
une action fondateur (Search Console) + du temps d'indexation.
