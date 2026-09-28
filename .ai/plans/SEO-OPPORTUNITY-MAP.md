# SEO-OPPORTUNITY-MAP — Audit 2026-09-27

> Généré par agent/growth/seo-multisite — basé sur audits scripts automatisés + build réel + FTP folders.
> Format : FACTS (observables) / HYPOTHESES (inférences) / ISSUES (bloquants) / IMPLEMENTED (déjà livré) / NEXT STEPS (actions concrètes).

---

## DOMAIN INVENTORY — 7 RÉGIONS CONFIGURÉES

| Domain | Region ID | Primary Lang | Secondary Langs | Currency | Live | Beaches | Pages (est.) | Sitemap | GSC |
|--------|-----------|--------------|-----------------|----------|------|---------|--------------|---------|-----|
| sargasses-martinique.com | mq | fr | en, es | EUR | ✅ | 53 | 807 | ✅ 164 URLs | ✅ Provisionné |
| sargasses-guadeloupe.com | gp | fr | en, es | EUR | ✅ | 83 | 842 | ❌ 0 URLs (sitemap-guadeloupe.xml absent) | ✅ Provisionné |
| sargassummiami.com | florida | en | es | USD | ❌ | 20 | ~125 | ✅ 14 KB | ❌ Non provisionné |
| sargassumpuntacana.com | puntacana | en | es | USD | ❌ | 12 | ~125 | ✅ 12 KB | ❌ Non provisionné |
| sargassumcancun.com | rivieramaya | es | en | USD | ❌ | 20 | ~125 | ✅ 14 KB | ❌ Non provisionné |
| sargazotulum.com | tulum | es | en | USD | ❌ | 8 | ~50 | ❓ | ❌ Non provisionné |
| barbados | barbados | en | — | USD | ❌ | 12 | ~30 | ❓ | ❌ Non provisionné |

---

## FACTS — Ce que les audits révèlent (chiffres réels)

### 1. TECHNICAL SEO BLOCKERS

| Issue | MQ | GP | USD Regions | Severity | Evidence |
|-------|----|----|-------------|----------|----------|
| **Missing canonical** | 171 pages | 171 pages | Non audité | **HIGH** | `seo-canonical-hreflang.cjs` — 342 pages sans canonical |
| **Canonical mismatch** | 1 | 1 | — | MEDIUM | 1 page MQ, 1 page GP avec canonical ≠ page URL |
| **Canonical invalid URL** | 1 | 1 | — | MEDIUM | 1 URL malformée par domaine |
| **Hreflang target missing** | 4 | 4 | — | **HIGH** | 4 liens hreflang vers pages inexistantes sur disque |
| **GP sitemap absent** | — | 0 URLs | — | **CRITICAL** | `seo-sitemap-check.cjs` : sitemap-guadeloupe.xml introuvable → 809 pages non soumises |
| **USD sitemaps non audités** | — | — | 3 domaines | **HIGH** | Scripts n'audite que MQ/GP (SITES array limité) |
| **Broken internal links** | 2,226 | 2,452 | — | **CRITICAL** | `seo-broken-links.cjs` : 4,678 liens cassés total |
| **Duplicate titles** | 213 groupes (427 pages) | 214 groupes (429 pages) | — | HIGH | `seo-meta-uniqueness.cjs` : 699/749 issues |
| **Duplicate descriptions** | 213 groupes (427 pages) | 214 groupes (428 pages) | — | HIGH | Même pattern que titres |
| **Schema errors** | 18 (datePublished manquant) | 18 (datePublished manquant) | — | MEDIUM | `seo-schema-validator.cjs` : Article sans datePublished |
| **Thin content** | 651 pages <300 mots | 649 pages <300 mots | — | MEDIUM | `seo-content-depth.cjs` : 1,300 pages thin total |

### 2. INDEXATION & COUVERTURE

| Métrique | MQ | GP | Florida | Punta Cana | Riviera Maya |
|----------|-----|-----|---------|------------|--------------|
| URLs dans sitemap | 164 | **0** | ~125 | ~125 | ~125 |
| Pages sur disque (indexables) | 615 | 809 | ~125 | ~125 | ~125 |
| Pages MANQUANTES au sitemap | **451** | **809** | Non audité | Non audité | Non audité |
| Orphelines (0 liens entrants) | 579 | 501 | Non audité | Non audité | Non audité |
| Pages avec peu de liens (1-2) | 97 | 181 | Non audité | Non audité | Non audité |
| Liens fantômes (href vers pages inexistantes) | 165 | 140 | Non audité | Non audité | Non audité |

### 3. CANNIBALISATION (GSC Data - 2026-09-25 snapshot)

| Site | Queries tracked | Cannibalized | Top Conflicts |
|------|-----------------|--------------|---------------|
| MQ | 289 | 9 | `sargasse martinique en temps réel` (2 URLs), `sargasse martinique aujourd'hui` (2 URLs), `carte sargasse martinique` (2 URLs) |
| GP | 330 | 8 | `sargasse guadeloupe en direct` (2 URLs), `sargasse guadeloupe 2026` (2 URLs), `carte sargasse guadeloupe en direct` (2 URLs) |
| Florida | 348 | 7 | `miami beach seaweed today` (2 URLs), `miami sargazo hoy` (2 URLs ES/EN), `miami beach sargassum today` (2 URLs) |
| Punta Cana | 250 | 5 | `punta cana seaweed today live` (4 URLs dont barbados/haiti!), `sargassum punta cana` (2 URLs) |
| Riviera Maya | 310 | 1 | `sargasse mexique en direct` (5 URLs EN) |

### 4. POSITION TRACKING (90j window, 2026-09-25)

| Site | Page | Position → Position | Delta | Impressions |
|------|------|---------------------|-------|-------------|
| **Riviera Maya** | `/` (ES) | 24.2 → 28 | **+3.8** ⬇️ | 184 |
| **Riviera Maya** | `/en/` | 54.3 → 58.2 | **+3.9** ⬇️ | 177 |
| **Riviera Maya** | `/en/sargassum-forecast/` | 68.6 → 74.1 | **+5.5** ⬇️ | 99 |
| **GP** | `/plages/plage-de-sainte-anne/` | 7.7 → 19.4 | **+11.7** ⬇️ | 42 |
| **MQ** | `/en/` | 4.3 → 7.6 | **+3.3** ⬇️ | 42 |

**Gains** : `/en/seaweed-map/` (RM) -6.6, `/sarg_carte_satellite_app` (GP) -5.4

### 5. CTR DIAGNOSTIC (AWR curve)

| Site | Winners | Underperformers | Best CTR Gains |
|------|---------|-----------------|----------------|
| MQ | 4 | 0 | `/sargasses-record-2026/` pos 11.7 → +6.53pt |
| GP | 4 | 0 | `/en/sargassum-map/` pos 12.7 → +10.82pt |
| Florida | 6 | 0 | `/seaweed-map/` pos 11.5 → +25.71pt |
| Punta Cana | 3 | 0 | `/sargassum-forecast/` pos 10.4 → +11.9pt |
| Riviera Maya | 0 | 0 | — |

---

## HYPOTHESES — Inférences basées sur les faits

| Hypothèse | Base | Confiance |
|-----------|------|-----------|
| **GP sitemap absent = 0 trafic organique GP** | Sitemap 0 URLs + 809 pages orphelines + GP ~0/j vs MQ ~16-95/j | 95% |
| **USD domains non provisionnés GSC = 0 impressions** | US_SEO_DIAGNOSIS.md confirmé + provision-gsc.cjs non exécuté | 90% |
| **Cannibalisation home vs /carte-sargasses/ = perte CTR** | 9 queries MQ + 8 GP avec home + carte-sargasses en compétition | 85% |
| **Broken links /track-click.php = email tracking cassé** | 1,124+ occurrences MQ + 1,192+ GP | 95% |
| **Duplicate titles = pages /beach/ + /plages/ même contenu** | Alias /beach/ noindex mais titres identiques à fiche primaire | 90% |
| **Activity pages (dive/surf/kids) noindex = orphelines** | 0 liens entrants + noindex + pas dans sitemap | 80% |
| **USD regions ont contenu ES mais /es/ non indexé** | florida.es.json + puntacana.es.json existent, region-langs.cjs les émet | 85% |

---

## ISSUES — Bloquants classés par priorité

### 🔴 P0 — CRITICAL (Bloque le trafic)
1. **GP sitemap absent** — 809 pages non soumises à Google
2. **USD domains non provisionnés GSC** — 3 domaines, 0 impressions
3. **4,678 broken internal links** — Dont 2,316 vers `/track-click.php` (email tracking cassé)
4. **Hreflang targets missing** — 8 liens vers pages inexistantes (4 MQ + 4 GP)

### 🟠 P1 — HIGH (Dégrade significativement)
5. **342 pages sans canonical** — Google ignore ces pages
6. **856 pages titres/descriptions dupliqués** — Cannibalisation interne
7. **1,080 pages orphelines structurelles** — 0 lien entrant
8. **1,300 pages thin content (<300 mots)** — Risque filtre qualité

### 🟡 P2 — MEDIUM (Optimisation)
9. **Schema Article sans datePublished** — 36 erreurs
10. **Position drops Riviera Maya** — Home ES + EN + forecast en baisse
11. **GP page `/plages/plage-de-sainte-anne/` drop -11.7 positions**
12. **MQ `/en/` drop -3.3 positions** (page EN vide, 0 mots)

### 🟢 P3 — LOW (Polish)
13. **Canonical mismatch (2 pages)** — 1 MQ + 1 GP
14. **Canonical invalid URL (2 pages)** — 1 MQ + 1 GP

---

## IMPLEMENTED — Ce qui est DÉJÀ opérationnel (ne pas refaire)

| Feature | Fichiers | Statut |
|---------|----------|--------|
| **Region config centralisée** | `regions/*.json`, `regions/index.cjs` | ✅ Source unique |
| **Beach pages enrichies (P1)** | `dedicated-pages.cjs` (nearby, resorts, facts, activities) | ✅ LIVE 6 domaines |
| **Area hubs (zone/ville)** | `region-seo-pages.cjs` (computeAreas, findAlternativeToday) | ✅ LIVE |
| **B2B Hotel Landing** | `buildHotelLanding`, `buildResortBrief`, `buildResortDirectory` | ✅ LIVE USD |
| **Dedicated pages** | `/beach/`, `/poi/`, `/region/`, `/activity/` (noindex aliases) | ✅ Sprint #25 |
| **Hreflang bilingual** | `region-langs.cjs`, `pageShell` alternates | ✅ ES/EN USD, FR/EN/ES GP |
| **Canonical primary beach path** | `primaryBeachPath()` dans `dedicated-pages.cjs` | ✅ |
| **Sitemap generation** | `dedicated-pages.cjs`, `region-seo-pages.cjs`, `month-pages.cjs`, `today-pages.cjs` | ✅ |
| **Weekly SEO automation** | `.github/workflows/weekly-seo-automation.yml` (22 steps) | ✅ Running |
| **GSC provisioning script** | `scripts/automation/provision-gsc.cjs` | ✅ Prêt (action fondateur) |
| **Canonical/hreflang validator** | `seo-canonical-hreflang.cjs` | ✅ |
| **Sitemap completeness check** | `seo-sitemap-check.cjs` | ✅ |
| **Orphan detector/healer** | `seo-orphan-detector.cjs`, `seo-orphan-healer.cjs` | ✅ |
| **CTR diagnostic** | `seo-ctr-diagnostic.cjs` | ✅ |
| **Position tracker** | `seo-position-tracker.cjs` | ✅ |
| **Content depth audit** | `seo-content-depth.cjs` | ✅ |
| **Meta uniqueness** | `seo-meta-uniqueness.cjs` | ✅ |
| **Broken links check** | `seo-broken-links.cjs` | ✅ |
| **Schema validator** | `seo-schema-validator.cjs` | ✅ |
| **Cannibalization detector** | `seo-cannibalization.cjs` | ✅ |

---

## NEXT STEPS — Actions concrètes priorisées

### Phase 1 — Technical Fixes (Cette semaine)
1. **Fix GP sitemap** — `seo-sitemap-check.cjs` ne trouve pas `sitemap-guadeloupe.xml` → vérifier `region-seo-pages.cjs` écriture sitemap pour GP
2. **Fix broken /track-click.php links** — Remplacer par endpoint Worker fonctionnel ou retirer
3. **Fix hreflang target missing** — Identifier les 4 URLs manquantes par domaine
4. **Add canonical to 342 pages** — Pages noindex/aliases doivent avoir canonical vers primaire
5. **Extend audit scripts to USD regions** — Modifier `SITES` array dans `seo-canonical-hreflang.cjs` et `seo-sitemap-check.cjs`

### Phase 2 — Content & Cannibalization (Semaine 2)
6. **Consolidate home vs /carte-sargasses/** — Une seule page cible par query head
7. **Deduplicate beach page titles** — Alias /beach/ vs fiche primaire /plages/
8. **Fix thin content** — Enrichir pages <300 mots avec données réelles (forecast, facts, nearby)
9. **Fix schema datePublished** — Ajouter dateModified/datePublished aux Article JSON-LD

### Phase 3 — Indexation & GSC (Semaine 2-3)
10. **Provision GSC pour 3 domaines USD** — Exécuter `provision-gsc.cjs` (action fondateur)
11. **Submit all sitemaps via Indexing API** — `seo-submit-urls.cjs` déjà prêt
12. **Fix cannibalization USD** — `punta cana seaweed today live` a 4 compétiteurs dont barbados/haiti

### Phase 4 — Expansion Longue Traîne (Semaine 3-4)
13. **Activate /es/ on Florida + Punta Cana** — florida.es.json + puntacana.es.json existent
14. **Create commune pages for USD** — Miami Beach, Fort Lauderdale, Key West, Cancún Hotel Zone, Playa del Carmen, Tulum, Bávaro, Cap Cana, Macao
15. **Build question/FAQ pages per beach** — Schema FAQPage avec données live (status, score, forecast)

### Phase 5 — Authority & Conversion (Mois 2)
16. **Cross-domain linking architecture** — MQ↔GP, PC↔RM, FL→Caribbean (contrôlé, pas footer spam)
17. **B2B widget embeddable** — Link-bait pour netlinking hôtelier
18. **Weekly sargassum report** — PDF/data citable par médias/DMO
19. **Measure organic → PASS conversion** — GA4 + Mollie tracking par landing page

---

## GSC DATA AVAILABILITY

| Source | Disponible | Notes |
|--------|------------|-------|
| `seo-audit.cjs` (GSC API) | ❌ **Non** | Requiert `GOOGLE_SERVICE_ACCOUNT_JSON` env (secrets GH seulement) |
| `seo-position-tracker.cjs` | ✅ Oui | Historique 90j local (scripts/automation/data/position-history.json) |
| `seo-ctr-diagnostic.cjs` | ✅ Oui | Basé sur position-history.json |
| `seo-cannibalization.cjs` | ✅ Oui | Basé sur position-history.json |
| `provision-gsc.cjs` | ✅ Script prêt | Action fondateur requise pour credentials |

**GSC = UNAVAILABLE en local** — Données réelles impressions/clics/position seulement via GH Actions secrets.

---

## COMPETITIVE GAP ANALYSIS

| Cluster | MQ/GP Position | USD Position | Concurrents | Notre Moat |
|---------|----------------|--------------|-------------|------------|
| `sargasse [region] aujourd'hui` | 1-3 | 10-25 | NOAA (institutionnel), blogs | Beach Score par plage + forecast 7j + fraîcheur 4×/j |
| `sargazo [region] hoy` | N/A | 13-50 | howisthesargassum.com (MX only) | ES-first + données live par plage |
| `best beaches no sargassum [region]` | 3-5 | 20-65 | TripAdvisor, blogs hôteliers | Alternative du jour (findAlternativeToday) + fiabilité publiée |
| `sargassum forecast [beach]` | 5-10 | 30-70 | Aucun par plage | Prévision 7j + confidence % par plage |
| `seaweed [beach] today` | 5-15 | 15-40 | Blogs locaux | Score temps réel + alternative intelligente |

---

## MONETIZATION HANDOFF POINTS

| SEO Landing | Free Value | Beach Object | Decision Value | Existing Paid Entry |
|-------------|------------|--------------|----------------|---------------------|
| `/beach/[slug]/` | Status today + Score + Forecast 7j | ✅ Complet | Alternative intelligente + fiabilité | PassOffer (Pass 30j / TripPass) |
| `/today/` (MQ/GP) | Top plages du jour + CTA Plan | ✅ Via deep-link | Plan semaine personnalisé | PassOffer (bullets séjour) |
| `/sargassum-for-hotels/` (USD) | Couverture hôtels + status | ✅ Par resort | Brief gratuit 30j + alertes | B2B Pro 79$/mo / 690$/an |
| `/activity/[type]/` | Plages flaggées (snorkel/family/parking) | ✅ Filtrées | Plan B par activité | PassOffer |
| `/areas/[commune]/` | Hub zone + plages + alternative | ✅ Regroupées | Choix éclairé par zone | PassOffer |

**Aucune modification pricing/paywall dans cette branche** — Points de jonction documentés pour branche pricing parallèle.