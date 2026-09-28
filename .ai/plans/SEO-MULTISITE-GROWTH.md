# SEO-MULTISITE-GROWTH — Architecture 5+ Domaines

> Généré par agent/growth/seo-multisite — Architecture technique + stratégie de croissance multi-sites.
> Basé sur : regions/*.json, scripts/lib/region-seo-pages.cjs, scripts/lib/dedicated-pages.cjs, GROWTH-SEO-STRATEGY.md, US_SEO_DIAGNOSIS.md.

---

## 1. MODÈLE MULTI-SITES — PRINCIPES GOOGLE RESPECTÉS

### 1.1 Chaque domaine = Une région + Une langue + Un intent local

| Domaine | Région | Langue primaire | Secondaires | Device | Intent principal |
|---------|--------|-----------------|-------------|--------|------------------|
| sargasses-martinique.com | Martinique (MQ) | FR | EN, ES | Mobile-first | Touriste FR Antilles + local |
| sargasses-guadeloupe.com | Guadeloupe (GP) | FR | EN, ES | Mobile-first | Touriste FR Antilles + local |
| sargassummiami.com | Florida (FL) | EN | ES | Mobile-first | Touriste US/CA + résident FL + hispanophone |
| sargassumpuntacana.com | Punta Cana (PC) | EN | ES | Mobile-first | Touriste US/CA/EU + résident RD + hispanophone |
| sargassumcancun.com | Riviera Maya (RM) | ES | EN | Mobile-first | Touriste MX/US/CA + résident QR + hispanophone |

### 1.2 Règles de différenciation (OBLIGATOIRES)

| Élément | Règle | Implémentation |
|---------|-------|----------------|
| **Contenu** | Zéro substitution mécanique de noms | `region-seo-pages.cjs` utilise `region.name`, `beach.commune`, `beach.name` réels |
| **Données** | Seules les plages `beach.island === region.id` | `dedicated-pages.cjs` filtre par `beachFilter.island` |
| **Métadonnées** | Title/desc/H1 localisés + date du jour | `region-seo-pages.cjs` + `vite.config.js` injectent `today` + `beaches.length` |
| **Hreflang** | Cluster complet par page (self + sœurs + x-default) | `pageShell()` génère alternates via `slugIndex` |
| **Canonical** | Fiche primaire = `/plages|beaches|playas/<slug>/` | `primaryBeachPath()` dans `dedicated-pages.cjs` |
| **Sitemap** | Un par domaine, lastmod = date du build | `region-seo-pages.cjs` + `dedicated-pages.cjs` écrivent `sitemap.xml` |
| **Robots** | Spécifique par domaine | `prepare-ftp.cjs` génère `robots.txt` par région |

### 1.3 Ce qui est INTERDIT (Google guidelines)

- ❌ Cloaking / géolocalisation abusive
- ❌ Doorway pages (pages minces créées pour rank)
- ❌ Redirections trompeuses
- ❌ Réseau de domaines artificiels (footer links vers tous les domaines)
- ❌ Contenu dupliqué cross-domain sans canonical/hreflang
- ❌ Anchor text exact-match spam cross-domain

---

## 2. ARCHITECTURE TECHNIQUE — GENERATORS EXISTANTS

### 2.1 Pipeline de génération (ordre d'exécution dans `vite.config.js` → `seo-pages` plugin)

```
1. region-seo-pages.cjs (USD regions ONLY)
   ├─ Hub pages: /, /forecast/, /today/, /map/, /season/, /methodology/
   ├─ Beach pages: /beaches|playas/<slug>/ (fiche primaire riche)
   ├─ Resort pages: /resorts|hoteles/<slug>/ + /brief/ (B2B)
   ├─ Area hubs: /areas|zonas/<commune>/ (≥2 plages, < total région)
   ├─ B2B Hotel Landing: /sargassum-for-hotels/ | /sargazo-para-hoteles/
   ├─ Month pages: /sargassum-[month]-[year]/ | /sargazo-[mes]-[año]/
   ├─ Health pages: /sargassum-health-risks/ | /sargazo-salud-riesgos/
   ├─ Legal pages: /terms/, /privacy/, /refund/ (i18n)
   └─ Sitemap.xml + hreflang cluster

2. reliability-page.cjs (ALL regions)
   ├─ /fiabilite/ (FR), /reliability/ (EN), /fiabilidad/ (ES)
   └─ Backtest data + régime reliability

3. month-pages.cjs (MQ/GP only)
   └─ /sargasses-[mois]-[année]/ + miroirs _gp/

4. today-pages.cjs (ALL regions)
   ├─ /aujourdhui/ (FR), /today/ (EN), /hoy/ (ES)
   ├─ Data-driven: top plages du jour + CTA Plan/Trip
   └─ Sitemap patch daily (lastmod = today, changefreq daily)

5. dedicated-pages.cjs (ALL regions)
   ├─ /beach/<slug>/ + /beach/<id>/ → noindex,follow, canonical → primaire
   ├─ /poi/<slug>/ + /poi/<id>/ → noindex,follow
   ├─ /region/<slug>/ → noindex,follow, canonical → /
   ├─ /activity/<type>/ → indexable si ≥2 plages flaggées, sinon noindex
   └─ Enrichissement: nearby, resorts, facts, activities (data-driven)

6. civic-pages.cjs (MQ/GP only)
   └─ /presse/, /soutenir/

7. commune-seo-pages.cjs (MQ/GP only)
   └─ 32 communes littorales → hub vers fiches plage
```

### 2.2 Fichiers de configuration région (source de vérité)

```
regions/
├── mq.json              # Martinique - FR primary
├── gp.json              # Guadeloupe - FR primary
├── florida.json         # Florida - EN primary, ES secondary
├── puntacana.json       # Punta Cana - EN primary, ES secondary
├── rivieramaya.json     # Riviera Maya - ES primary, EN secondary
├── tulum.json           # Tulum - ES primary, EN secondary
├── barbados.json        # Barbados - EN only (prepared, not live)
├── index.cjs            # Loader + validation + getRegionByDomain
├── _schema.json         # Schéma de validation
├── seo-content/
│   ├── mq.json          # Content FR MQ
│   ├── gp.json          # Content FR GP
│   ├── florida.json     # Content EN FL
│   ├── florida.es.json  # Content ES FL (existe ✅)
│   ├── puntacana.json   # Content EN PC
│   ├── puntacana.es.json # Content ES PC (existe ✅)
│   ├── rivieramaya.json # Content ES RM
│   ├── rivieramaya.en.json # Content EN RM (existe ✅)
│   └── tulum.json       # Content ES Tulum
├── resorts/
│   ├── florida.json     # 35 resorts
│   ├── puntacana.json   # 35 resorts
│   └── rivieramaya.json # 35 resorts
└── og/                  # Open Graph images par région
```

---

## 3. CROSS-DOMAIN LINKING — ARCHITECTURE CONTRÔLÉE

### 3.1 Principes

| Principe | Implémentation |
|----------|----------------|
| **User value only** | Liens uniquement si intérêt réel pour l'utilisateur |
| **No footer spam** | Pas de liste de tous les domaines en footer |
| **Contextual anchors** | Ancres descriptives, pas exact-match |
| **Reciprocal controlled** | MQ↔GP bidirectionnel, USD→Caribbean unidirectionnel |
| **Hreflang pas cross-domain** | Hreflang = même contenu langue différente, PAS domaines différents |

### 3.2 Matrice de liens autorisés

| Source → Target | Autorisé | Ancres exemples | Pages cibles |
|-----------------|----------|-----------------|--------------|
| MQ ↔ GP | ✅ Bidirectionnel | "Guadeloupe", "Martinique", "Autres îles" | Home, /carte-sargasses/, /plages-sans-sargasses/ |
| PC ↔ RM | ✅ Bidirectionnel | "Cancún & Riviera Maya", "Punta Cana" | Home, /sargassum-for-hotels/, /beaches/ |
| FL → PC, RM | ✅ Unidirectionnel | "Caribbean beaches", "Punta Cana", "Cancún" | Hotel landing, /beaches/ |
| PC, RM → FL | ❌ Non | — | — |
| Tous → MQ/GP | ❌ Non (sauf MQ↔GP) | — | — |
| MQ/GP → USD | ❌ Non | — | — |

### 3.3 Implémentation technique

```javascript
// Dans pageShell() / networkFooter() — NETWORK array partagé
const NETWORK = [
  { name: { en: 'Martinique', es: 'Martinica' }, url: 'https://sargasses-martinique.com/' },
  { name: { en: 'Guadeloupe', es: 'Guadalupe' }, url: 'https://sargasses-guadeloupe.com/' },
  { name: { en: 'Punta Cana', es: 'Punta Cana' }, url: 'https://sargassumpuntacana.com/' },
  { name: { en: 'Cancún & Riviera Maya', es: 'Cancún y Riviera Maya' }, url: 'https://sargassumcancun.com/' },
  { name: { en: 'Miami & Florida', es: 'Miami y Florida' }, url: 'https://sargassummiami.com/' }
]

// Filtrage : n'afficher que les domaines AUTORISÉS pour cette région
const allowed = getAllowedCrossLinks(region.id) // fn à implémenter
const links = NETWORK.filter(n => allowed.includes(n.url))
  .map(n => `<a href="${n.url}" rel="noopener">${n.name[lang]}</a>`).join(' · ')
```

### 3.4 Fonction `getAllowedCrossLinks(regionId)` à implémenter

```javascript
function getAllowedCrossLinks(regionId) {
  const map = {
    'mq': ['https://sargasses-guadeloupe.com/'],
    'gp': ['https://sargasses-martinique.com/'],
    'puntacana': ['https://sargassumcancun.com/'],
    'rivieramaya': ['https://sargassumpuntacana.com/'],
    'florida': ['https://sargassumpuntacana.com/', 'https://sargassumcancun.com/'],
    'tulum': ['https://sargassumpuntacana.com/', 'https://sargassumcancun.com/'],
  }
  return map[regionId] || []
}
```

---

## 4. HREFLANG STRATEGY — PAR RÉGION

### 4.1 Clusters par région

| Région | Langue primaire (racine) | Secondaires (/lang/) | Cluster hreflang |
|--------|--------------------------|----------------------|------------------|
| **MQ** | FR (`/`) | EN (`/en/`), ES (`/es/`) | fr ↔ en ↔ es + x-default=fr |
| **GP** | FR (`/`) | EN (`/en/`), ES (`/es/`) | fr ↔ en ↔ es + x-default=fr |
| **FL** | EN (`/`) | ES (`/es/`) | en ↔ es + x-default=en |
| **PC** | EN (`/`) | ES (`/es/`) | en ↔ es + x-default=en |
| **RM** | ES (`/`) | EN (`/en/`) | es ↔ en + x-default=es |
| **Tulum** | ES (`/`) | EN (`/en/`) | es ↔ en + x-default=es |

### 4.2 Règles hreflang (implémentées dans `pageShell`)

1. **Chaque page connaît ses sœurs** via `slugIndex[lang][kind]`
2. **Slugs identiques cross-lang** (dérivés du nom plage/résort) — seul préfixe `/lang/` change
3. **x-default = langue primaire** (comportement historique FL/PC conservé)
4. **Pages noindex** : pas de hreflang (Google ignore de toute façon)
5. **Validation** : `seo-canonical-hreflang.cjs` vérifie bidirectionnel + target exists

---

## 5. CANONICAL STRATEGY

### 5.1 Règles par type de page

| Type de page | Canonical | Raison |
|--------------|-----------|--------|
| **Fiche plage primaire** (`/plages|beaches|playas/<slug>/`) | Self | Page riche, maillée, sitemapée |
| **Alias `/beach/<slug>/` + `/beach/<id>/`** | → Primaire | Duplicate content contrôlé, noindex,follow |
| **POI pages** | Self (si indexable) ou → Home | Coquille fine, noindex par défaut |
| **Region pages** (`/region/<slug>/`) | → Home (`/`) | Doublon intent home, noindex,follow |
| **Activity pages** | Self si indexable (≥2 plages) | Contenu unique par activité |
| **Activity 'kids'** | → `/activity/family/` | Doublon strict (même flag source) |
| **Resort pages** | Self | Contenu unique par hôtel |
| **Resort brief** | Self + noindex | Actif commercial, pas SEO |
| **Hotel landing** | Self | Page B2B indexable, intention achat |
| **Area hubs** | Self | Contenu unique par commune |
| **Month/Health/Legal** | Self | Contenu unique |

### 5.3 Implémentation

```javascript
// dedicated-pages.cjs — primaryBeachPath()
const PRIMARY_BEACH_DIR = { fr: 'plages', en: 'beaches', es: 'playas' }
function primaryBeachPath(region, beach) {
  const lang = region.primaryLang || 'fr'
  const dir = PRIMARY_BEACH_DIR[lang] || 'plages'
  const slug = beach.slug || slugify(beach.name)
  return `/${dir}/${slug}/`
}

// generateBeachPage() → canonicalPath: primaryBeachPath(region, beach), robots: 'noindex,follow'
```

---

## 6. SITEMAP ARCHITECTURE

### 6.1 Un sitemap.xml par domaine

Chaque build régional génère `dist/sitemap.xml` → copié dans `*-ftp/sitemap.xml`

### 6.2 Contenu par région (estimé)

| Région | Pages indexables | Pages noindex (aliases) | Total sitemap |
|--------|------------------|------------------------|---------------|
| MQ | ~164 | ~643 | 164 URLs |
| GP | **0 (BUG)** | ~842 | **0 URLs** |
| FL | ~125 | ~50 | ~125 URLs |
| PC | ~125 | ~50 | ~125 URLs |
| RM | ~125 | ~50 | ~125 URLs |
| Tulum | ~50 | ~20 | ~50 URLs |

### 6.3 lastmod Honnêteté

- **Pages statiques** (editorial, methodologie) : `lastmod` = date build (rafraîchi 4×/j via CI)
- **Pages dynamiques** (beach, today, forecast) : `lastmod` = date du jour (pipeline data)
- **Jamais de `lastmod` futur** — `dateModifiedFromPipeline: true` dans region.json

### 6.4 Bug GP Sitemap — Diagnostic

Le `seo-sitemap-check.cjs` cherche `sitemap-guadeloupe.xml` dans `guadeloupe-ftp/` mais le build génère `sitemap.xml` (sans suffixe régional). 

**Fix** : Modifier `prepare-ftp.cjs` pour renommer `sitemap.xml` → `sitemap-guadeloupe.xml` pour GP, ou modifier `seo-sitemap-check.cjs` pour chercher `sitemap.xml`.

---

## 7. PAGE VALUE CONTRACT — Ce qui rend une page VALIDE

### 7.1 Beach Page (fiche primaire `/plages|beaches|playas/<slug>/`)

```
✅ H1 unique : "{Beach Name} ({Region}) — {Status}, Beach Score {score}/100"
✅ Status temps réel (ERDDAP-live, mis à jour 4×/j)
✅ Beach Score 0-100 + label colorié
✅ Forecast 7 jours avec confidence %
✅ Source data expliquée (Copernicus/NOAA AFAI)
✅ Fiabilité par régime (lien /fiabilite/)
✅ Photo réelle (gplace Wikimedia/CC BY)
✅ Plages proches (haversine ≤5km, même région)
✅ Résorts proches (si région FL/PC/RM)
✅ Faits réels (kids/snorkel/parking flags)
✅ Activités liées (snorkel→snorkel, kids→family, parking→parking)
✅ Alternative du jour (si plage avoid/moderate → plus proche clean)
✅ Partage UTM natif (WhatsApp/FB/Twitter/Email/Copy)
✅ JSON-LD Beach + FAQPage (si FAQ dispo)
✅ CTA vers PassOffer / PremiumModal
✅ Liens retour : Carte, Toutes les plages
```

### 7.2 Alias `/beach/<slug>/` (noindex,follow)

- Même contenu que primaire
- `canonical` → primaire
- `robots: noindex,follow`
- **HORS sitemap** (signal contradictoire sinon)

### 7.3 Activity Page (`/activity/<type>/`)

```
✅ Indexable SEULEMENT si ≥2 plages réelles flaggées
✅ 'kids' → canonicalise vers 'family' (même flag source)
✅ 'surf'/'dive' sans flag source → noindex,follow (anti-thin)
✅ Liste plages triées par status (clean > moderate > avoid) puis score
✅ Liens vers fiches PRIMAIRES (/plages|beaches|playas/)
✅ JSON-LD ItemList (indexable) ou TouristAttraction (noindex)
```

### 7.4 Area Hub (`/areas|zonas/<commune>/`)

```
✅ SEULEMENT si ≥2 plages dans la commune ET < total région
✅ Liste plages de la commune avec status live
✅ Alternative du jour pour chaque plage
✅ Cross-link vers page éditoriale ville si existe (extraPages matching)
✅ JSON-LD ItemList
```

---

## 8. CONTENT DIFFERENTIATION — Par domaine

### 8.1 Martinique (MQ) — FR
- Communes : Les Anses-d'Arlet, Sainte-Anne, Sainte-Luce, Le Diamant, Les Trois-Îlets, Le Carbet, Schœlcher, Case-Pilote, Le Prêcheur, Grand'Rivière, Macouba, Basse-Pointe, Le Lorrain, Le Robert, François, Vauclin, Marin, Rivière-Pilote, Rivière-Salée, Ducos, Saint-Esprit, Saint-Joseph, Lamentin, Fort-de-France
- Spécificités : Côte Caraïbe (protégée) vs Atlantique (exposée), Rocher du Diamant, Les Salines

### 8.2 Guadeloupe (GP) — FR
- Communes : Deshaies, Sainte-Anne, Gosier, Saint-François, Bouillante, Les Saintes, Marie-Galante, Pointe-Noire, Vieux-Habitants, Goyave, Petit-Bourg, Baie-Mahault, Lamentin, Baillif, Vieux-Fort, Capesterre-Belle-Eau, Saint-Claude, Gourbeyre, Trois-Rivières
- Spécificités : Basse-Terre (sous-le-vent, protégée), Grande-Terre (exposée), Dépendances (Saintes, Marie-Galante, Désirade)

### 8.3 Florida (FL) — EN/ES
- Villes : Miami Beach, South Beach, Fort Lauderdale, Palm Beach, Jupiter, Key West, Key Largo, Islamorada, Marathon, Cocoa Beach, Daytona Beach, Clearwater, Hollywood, Haulover, Sunny Isles, Deerfield, Delray, Crandon Park, Bahia Honda
- Spécificités : Keys (exposées), Côte Est (Gulf Stream), Côte Ouest (Golfe), Saison ouragans

### 8.4 Punta Cana (PC) — EN/ES
- Zones : Bávaro (4 plages), Cortecito, Cabeza de Toro, Macao, Uvero Alto, Cap Cana (3 plages), Punta Cana
- Spécificités : Bavaro = zone hôtelière dense, Cap Cana = marina/luxe, Macao = sauvage

### 8.5 Riviera Maya (RM) — ES/EN
- Villes : Cancún (7 plages), Playa del Carmen, Tulum (2 plages), Akumal, Cozumel (2 plages), Isla Mujeres, Puerto Morelos, Mahahual, Holbox, Xpu-Ha, Maroma, Punta Maroma
- Spécificités : Zone hôtelière Cancún, Playa del Carmen (ferry Cozumel), Tulum (archéo), Cozumel/Isla Mujeres (îles), Sian Ka'an (réserve)

---

## 9. PROGRAMMATIC SEO — CLUSTERS SOUTENUS PAR DONNÉES RÉELLES

### 9.1 Clusters validés (données existantes)

| Cluster | Template | Données requises | Pages/région | Statut |
|---------|----------|------------------|--------------|--------|
| **Beach Today** | `/beach/<slug>/` | Beach Object + forecast + status | N plages | ✅ LIVE |
| **Beach Forecast** | Inclus dans fiche | weekly[beachId].forecast | N plages | ✅ LIVE |
| **Area Hub** | `/areas|zonas/<commune>/` | beach.commune + ≥2 plages | M communes | ✅ LIVE |
| **Activity** | `/activity/<type>/` | beach flags (snorkel/kids/parking) | 4 types max | ✅ LIVE |
| **Resort Brief** | `/resorts|hoteles/<slug>/brief/` | resort.beachId + forecast | R resorts | ✅ LIVE (B2B) |
| **Hotel Landing** | `/sargassum-for-hotels/` | resorts[] + beaches[] + data | 1 par région | ✅ LIVE (USD) |
| **Month Recap** | `/sargassum-[month]-[year]/` | history.json régional | 1/mois | ✅ LIVE |
| **Today Page** | `/today|aujourdhui|hoy/` | levels + weekly + top beaches | 1/jour | ✅ LIVE |

### 9.2 Clusters à construire (données disponibles)

| Cluster | Template | Données requises | Est. pages | Priorité |
|---------|----------|------------------|------------|----------|
| **Commune Pages (USD)** | `/beaches/<city>/` ou `/areas/<city>/` | beach.commune + ≥2 plages | 5-10/région | P1 |
| **Beach vs Beach** | `/beach/<a>-vs-<b>/` | 2 Beach Objects réels | Combinaisons proches | P2 |
| **Question/FAQ** | `/faq/<beach>/` | Beach Object + forecast + reliability | N plages | P1 |
| **Seasonal** | `/sargassum-season-<year>/` | history.json + outlook | 1/an | P2 |
| **Health/Safety** | `/sargassum-health-<beach>/` | reliability + H2S info | N plages | P3 |

### 9.3 Clusters NON supportés (données manquantes)

- ❌ Hôtels inventés (seuls 35 resorts/région confirmés pour FL/PC/RM)
- ❌ Plages inventées (seules plages dans regions/*.json)
- ❌ Activités sans flag source (surf, dive, fishing, sailing, romance)
- ❌ Communes sans plage trackée
- ❌ Météo marine détaillée (vent, houle, marée) — pas dans pipeline actuel

---

## 10. INTERNAL LINK GRAPH — Architecture cible

```
HOME (/)
├─ Carte live (/carte-sargasses/ | /sargassum-map/ | /mapa-sargazo/)
├─ Aujourd'hui (/aujourdhui/ | /today/ | /hoy/)
├─ Prévisions 7j (/previsions/ | /forecast/ | /pronostico-sargazo/)
├─ Alertes (/alertes/ | /sargassum-alerts/ | /alertas-sargazo/)
├─ Plages (listing) (/plages/ | /beaches/ | /playas/)
│   ├─ Fiche plage primaire (/plages/<slug>/)
│   │   ├─ Plages proches (haversine)
│   │   ├─ Résorts proches (si FL/PC/RM)
│   │   ├─ Faits (kids/snorkel/parking)
│   │   ├─ Activités (snorkel/family/parking)
│   │   ├─ Alternative du jour
│   │   └─ CTA PassOffer
│   └─ Alias /beach/<slug>/ (noindex → canonical primaire)
├─ Zones / Communes (/areas/ | /zonas/ | /plages/<commune>/)
│   └─ Hub commune → fiches plages de la commune
├─ Activités (/activity/<type>/)
│   ├─ Snorkeling → plages flag snorkel
│   ├─ Famille → plages flag kids
│   └─ Parking → plages flag parking
├─ Fiabilité (/fiabilite/ | /reliability/ | /fiabilidad/)
├─ Saison (/saison-sargasses-<region>/)
├─ Meilleures plages (/meilleures-plages-<region>-sargasses/)
├─ B2B Hôtels (/sargassum-for-hotels/ | /sargazo-para-hoteles/)
│   ├─ Annuaire resorts (/resorts|hoteles/)
│   └─ Brief resort (/resorts|hoteles/<slug>/brief/)
├─ Santé (/sargassum-health-risks/ | /sargazo-salud-riesgos/)
├─ Légal (/terms/, /privacy/, /refund/)
└─ Cross-domain (contrôlé)
    MQ ↔ GP (bidirectionnel)
    PC ↔ RM (bidirectionnel)
    FL → PC, RM (unidirectionnel)
```

---

## 11. GSC PROVISIONING — CHECKLIST

### 11.1 Domaines à provisionner (action fondateur)

| Domaine | Méthode | Status | Bloquant |
|---------|---------|--------|----------|
| sargasses-martinique.com | FILE (déjà fait) | ✅ | — |
| sargasses-guadeloupe.com | FILE (déjà fait) | ✅ | — |
| sargassummiami.com | FILE | ❌ | `FTP_SERVER_FLORIDA` + `GOOGLE_SERVICE_ACCOUNT_JSON` |
| sargassumpuntacana.com | FILE | ❌ | `FTP_SERVER_PUNTACANA` + `GOOGLE_SERVICE_ACCOUNT_JSON` |
| sargassumcancun.com | FILE | ❌ | `FTP_SERVER_RIVIERAMAYA` + `GOOGLE_SERVICE_ACCOUNT_JSON` |
| sargazotulum.com | FILE | ❌ | `FTP_SERVER_TULUM` + domaine non provisionné Cloudflare |
| barbados | FILE | ❌ | Non live, pas de FTP |

### 11.2 Script prêt : `scripts/automation/provision-gsc.cjs`

```bash
# Exécution (nécessite secrets GH + FTP creds)
node scripts/automation/provision-gsc.cjs florida puntacana rivieramaya
# Ou via GH Actions workflow_dispatch
```

### 11.3 Post-provisioning

1. `seo-submit-urls.cjs` — Submit all sitemap URLs via Indexing API
2. `seo-position-tracker.cjs` — Démarre le tracking 90j
3. Monitor Coverage report dans GSC (indexées vs soumises)

---

## 12. TECHNICAL SEO FIXES — Plan d'action

### 12.1 Fixes P0 (Cette semaine)

| Fix | Fichier(s) | Description |
|-----|------------|-------------|
| **GP Sitemap** | `prepare-ftp.cjs` ou `seo-sitemap-check.cjs` | Renommer `sitemap.xml` → `sitemap-guadeloupe.xml` pour GP |
| **Broken /track-click.php** | `dedicated-pages.cjs`, `region-seo-pages.cjs` | Remplacer par endpoint Worker `/api/track-click` ou retirer |
| **Missing canonical (342 pages)** | `dedicated-pages.cjs`, `region-seo-pages.cjs` | Ajouter `canonicalPath` à toutes les pages générées |
| **Hreflang target missing (8)** | Identifier URLs manquantes + corriger target ou retirer hreflang | Audit `canonical-hreflang.json` pour détails |
| **USD audit coverage** | `seo-canonical-hreflang.cjs`, `seo-sitemap-check.cjs` | Étendre `SITES` array aux 3 domaines USD |

### 12.2 Fixes P1 (Semaine 2)

| Fix | Fichier(s) | Description |
|-----|------------|-------------|
| **Duplicate titles (856 pages)** | `dedicated-pages.cjs` | Différencier alias `/beach/` vs primaire via suffixe " — Alias" ou meilleur : noindex suffit, titre peut rester |
| **Thin content (1,300 pages)** | `dedicated-pages.cjs`, `region-seo-pages.cjs` | Enrichir avec forecast, nearby, facts, activities là où absent |
| **Schema datePublished** | `region-seo-pages.cjs`, `dedicated-pages.cjs` | Ajouter `datePublished` + `dateModified` aux Article JSON-LD |
| **Cannibalization home vs /carte-sargasses/** | `vite.config.js` (seo-pages plugin) | Consolidation : une page cible par query head, l'autre noindex ou intent différent |

### 12.3 Fixes P2 (Semaine 3)

| Fix | Fichier(s) | Description |
|-----|------------|-------------|
| **Position drops Riviera Maya** | `region-seo-pages.cjs` | Enrichir home ES + EN avec plus de signaux frais (beaches.length, clean count, date) |
| **GP page drop Sainte-Anne** | `dedicated-pages.cjs` | Vérifier canonical + hreflang + liens entrants vers cette page |
| **MQ /en/ page vide** | `region-seo-pages.cjs` | Page EN MQ générée mais 0 mots — soit enrichir, soit noindex |

---

## 13. CONTENT STRATEGY — Longue Traîne par Région

### 13.1 MQ/GP (FR mature — défendre + longue traîne communes)

| Intent | Pages existantes | Nouvelles pages (communes) | Volume est. |
|--------|------------------|----------------------------|-------------|
| `sargasse [commune] martinique` | 8 pages communes | 24 communes manquantes | 32 total |
| `sargasse [commune] guadeloupe` | 8 pages communes | 20 communes manquantes | 28 total |
| `meteo sargasse [region]` | 2 pages | Étendre à communes | — |
| `plage sans sargasse [commune]` | Via area hubs | Déjà couvert par `/areas/` | — |

### 13.2 Florida (EN/ES — striking distance + flood)

| Intent | Pages existantes | Nouvelles pages | Volume est. |
|--------|------------------|-----------------|-------------|
| `sargassum [beach] today` | 20 plages | 0 (couvert) | 20 |
| `is there seaweed in [beach]` | 0 | 20 FAQ pages | 20 |
| `best beaches no sargassum [city]` | 1 page | 5 city pages | 6 |
| `sargazo [playa] hoy` (ES) | 0 (ES activé) | 20 FAQ ES | 20 |
| `playas sin sargazo [ciudad]` (ES) | 0 | 5 city pages ES | 5 |

### 13.3 Punta Cana (EN/ES — striking distance + flood)

| Intent | Pages existantes | Nouvelles pages | Volume est. |
|--------|------------------|-----------------|-------------|
| `sargassum [beach] today` | 12 plages | 0 | 12 |
| `sargazo [playa] hoy` | 12 plages ES | 0 | 12 |
| `bavaro vs cap cana sargassum` | 1 page éditoriale | 3 comparaisons | 4 |
| `best beaches no sargassum punta cana` | 1 page | 3 zones (Bávaro/Cap Cana/Macao) | 4 |

### 13.4 Riviera Maya (ES primary — plus gros pool)

| Intent | Pages existantes | Nouvelles pages | Volume est. |
|--------|------------------|-----------------|-------------|
| `sargazo [playa] hoy` | 20 plages | 0 | 20 |
| `mejores playas sin sargazo [zona]` | 1 page | 5 zones (Cancún/PDC/Tulum/Cozumel/Isla Mujeres) | 6 |
| `pronóstico sargazo [playa]` | Inclus fiche | FAQ dédiées | 20 |
| `temporada sargazo 2026` | 1 page | Mois pages existantes | — |
| `sargazo cancun hoy` | 1 page | FAQ + zone hôtelière | 5 |

---

## 14. FRESHNESS STRATEGY — Données temps réel comme moat

### 14.1 Signaux de fraîcheur visibles

| Page | Signal affiché | Source |
|------|----------------|--------|
| Home | "Mis à jour {date} — 4×/jour" | `updatedAt` du pipeline |
| Fiche plage | "Données du {date} — Satellite {erddapTimestamp}" | `levels[beachId].timestamp` |
| Forecast | "Confiance J+1: 85% — J+3: 62%" | `weekly[beachId].forecast[].confidence` |
| Today page | "État du {today} — {cleanCount} plages propres" | Calculé au build |
| Month page | "Bilan {month} {year} — {n} jours de données" | `history.json` régional |

### 14.2 Règles anti-fabrication

- ❌ Jamais "live", "temps réel", "maintenant" sans preuve technique
- ❌ Jamais "mis à jour il y a 5 min" si build 6h ago
- ✅ Toujours `updatedAt` ISO + `erddapTimestamp` + `stale` flag
- ✅ `dataAgeHours` affiché dans UI (BeachExperience)
- ✅ `/fiabilite/` publie les vrais taux d'erreur par régime

---

## 15. SEO → PRODUCT FUNNEL — Tracking

### 15.1 Parcours mesuré

```
ORGANIC LANDING (GSC query + landing page)
    → BEACH OBJECT (fiche primaire /plages/<slug>/)
    → FORECAST VIEW (scroll forecast 7j)
    → ALTERNATIVE CLICK (findAlternativeToday)
    → PASSOFFER VIEW (CTA "Voir les offres")
    → CHECKOUT (Mollie on-site)
    → PAYMENT (webhook → grant)
```

### 15.2 Events à tracker (existant + à ajouter)

| Event | Existant | À ajouter | Description |
|-------|----------|-----------|-------------|
| `sg_organic_landing` | ❌ | ✅ | Source=organic, query (si dispo), landing page |
| `sg_beach_view` | ✅ | — | Beach ID + status + score |
| `sg_forecast_expand` | ✅ | — | Beach ID + days viewed |
| `sg_alternative_click` | ✅ | — | From beach → To beach + km |
| `sg_pass_offer_view` | ✅ | — | Pass type + beach context |
| `sg_checkout_start` | ✅ | — | Pass type + amount |
| `sg_payment_success` | ✅ | — | Pass type + amount + provider |

### 15.3 Attribution source

```javascript
// Dans track() — taguer synthétique vs organique
const source = document.referrer.includes('google') ? 'organic' :
               document.referrer.includes('facebook') ? 'social' :
               document.referrer ? 'referral' : 'direct'
// Stocker dans sessionStorage pour attribution cross-page
```

---

## 16. MONETIZATION HANDOFF — Points de jonction pricing

> Cette branche NE MODIFIE PAS le pricing. Points de jonction documentés pour la branche pricing parallèle.

| SEO Landing | Free Value Delivered | Paid Entry Point (existant) | Pricing Branch Responsibility |
|-------------|---------------------|----------------------------|-------------------------------|
| `/beach/<slug>/` | Status + Score + Forecast 7j + Alternative | PassOffer (Pass 30j 14,99€ / TripPass 4,99€) | PassOffer pricing cards |
| `/today/` | Top 3 plages du jour + CTA Plan | PassOffer (bullets séjour) | PassOffer copy séjour |
| `/sargassum-for-hotels/` | Couverture resorts + status + fiabilité | B2B Pro 79$/mo / 690$/an + essai 30j | B2B paylinks + trial flow |
| `/activity/<type>/` | Plages flaggées + status | PassOffer | PassOffer |
| `/areas/<commune>/` | Hub zone + alternatives | PassOffer | PassOffer |

**Rollback flags existants** : `?pwcomic=0`, `?pwcopy=0`, `?triplabels=0`, `?sgpayorder=0` — préservés.

---

## 17. AUTOMATION — Pipeline QUERY → PAGE → INDEX → MEASURE

### 17.1 Boucle hebdomadaire existante (`.github/workflows/weekly-seo-automation.yml`)

```
SEO Audit (GSC/GA4/CrUX) → 22 analyzers
    → Auto-Optimize (fixes data-driven)
    → Auto-Copywriting (meta CTR-driven)
    → Fix 404s
    → Optimize meta
    → Enrich content
    → Rebuild + FTP
    → Link Graph + Broken Links + Schema + Meta Uniqueness + Canonical/Hreflang + Content Depth + Sitemap Check + Image Alt
    → Orphan Healer
    → Submit URLs to Indexing API
    → Commit + Push → Auto-deploy
```

### 17.2 Gaps à combler

| Gap | Solution |
|-----|----------|
| **Query → Opportunity** | `seo-cannibalization.cjs` + `seo-ctr-diagnostic.cjs` existent → créer `seo-opportunity-engine.cjs` qui sort `QUERY → IMPRESSIONS → POSITION → PAGE → GAP → ACTION` |
| **Action → Page Creation** | `generate-seo-pages.cjs` a `findKeywordGaps()` stub vide → implémenter lecture vrais gaps GSC |
| **Page → Validate** | `seo-schema-validator.cjs` + `seo-content-depth.cjs` existent → intégrer dans pipeline pre-commit |
| **Validate → Index** | `seo-submit-urls.cjs` existe → étendre aux USD regions |
| **Index → Measure** | `seo-position-tracker.cjs` + `seo-ctr-diagnostic.cjs` existent → dashboard unifié |

### 17.3 Nouveau script : `seo-opportunity-engine.cjs`

```javascript
// Input: position-history.json + cannibalization.json + ctr-diagnostic.json
// Output: opportunity-map.json avec catégories:
// HIGH_OPPORTUNITY: impressions > 50, position 4-20, page existante améliorable
// MEDIUM_OPPORTUNITY: impressions 10-50, position 10-50, page manquante créable
// LOW_OPPORTUNITY: impressions < 10, position > 50
// NOT_SUPPORTED: intent sans données réelles (ex: surf sans flag)
```

---

## 18. MULTI-SITE EXPANSION — Nouveaux domaines

### 18.1 Critères de go/no-go

| Critère | Seuil | Vérification |
|---------|-------|--------------|
| **Real Demand** | ≥500 impressions/mois GSC sur queries marque+région | GSC ou Ahrefs/SEMrush |
| **Real Data** | ≥10 plages trackées ERDDAP dans bbox | Pipeline copernicus couvre la zone |
| **Unique Beach Inventory** | Plages uniques (pas doublon région existante) | `beach.island` distinct |
| **Language Support** | Contenu SEO natif (pas traduction auto) | `seo-content/<id>.<lang>.json` |
| **Operational Support** | FTP + DNS + SSL + GSC provisionnés | Creds disponibles |
| **SEO Value** | Striking distance queries existantes | Position tracker |

### 18.2 Candidats évalués

| Région | Pays | Demande | Données | Plages | Langue | Ops | Verdict |
|--------|------|---------|---------|--------|--------|-----|---------|
| Barbados | Barbados | Faible | Partielle | 12 | EN | ❌ | **NOT SUPPORTED** |
| Tulum | Mexique | Moyenne | Partielle (partagée RM) | 8 | ES/EN | ⚠️ DNS | **PREPARED NOT LIVE** |
| Guadeloupe (déjà live) | France | Forte | Complète | 83 | FR/EN/ES | ✅ | **LIVE** |
| Martinique (déjà live) | France | Forte | Complète | 53 | FR/EN/ES | ✅ | **LIVE** |

---

## 19. SUCCESS METRICS — KPIs par phase

### Phase 1 (Semaines 1-2) — Technical Foundation
- [ ] GP sitemap : 0 → 150+ URLs soumises
- [ ] Broken links : 4,678 → <100
- [ ] Missing canonical : 342 → 0
- [ ] Hreflang targets missing : 8 → 0
- [ ] USD GSC provisionné : 0 → 3 domaines

### Phase 2 (Semaines 3-4) — Content & Indexation
- [ ] Duplicate titles : 856 → <100
- [ ] Thin pages : 1,300 → <500
- [ ] Orphan pages : 1,080 → <200
- [ ] Cannibalized queries : 30 → <10
- [ ] USD pages indexées : 0 → >200

### Phase 3 (Mois 2-3) — Traffic Growth
- [ ] Clics organiques EN/ES : baseline → ×3
- [ ] Position moyenne têtes USD : 20-50 → ≤10
- [ ] Queries EN/ES avec ≥1 clic/mois : 0 → >50
- [ ] Organic → PASS conversion : measurable

---

## 20. RISQUES & MITIGATION

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Google pénalise flood programmatique | Faible | Élevé | Contenu unique par page (Beach Object + forecast), pas de substitution mécanique |
| Indexation lente (semaines) | Élevée | Moyen | Indexing API + sitemap daily + internal linking fort |
| Cannibalisation cross-domain | Faible | Moyen | Canonical + hreflang stricts, cross-links contrôlés |
| Seasonal traffic drop (oct-mar) | Certaine | Élevé | Focus long-tail + B2B (moins saisonnier) + contenu evergreen |
| Concurrent copie modèle | Moyenne | Faible | Moat = données live + fiabilité publiée + Beach Object granulaire |
| GSC provisioning bloqué fondateur | Élevée | Bloquant | Script prêt, relance hebdo, fallback : soumission manuelle |

---

## 21. NEXT ACTIONS — Ordre d'exécution

1. **Fix GP sitemap** (P0) — `prepare-ftp.cjs` ou `seo-sitemap-check.cjs`
2. **Fix broken /track-click.php links** (P0) — Remplacer par Worker endpoint
3. **Add missing canonicals** (P0) — 342 pages
4. **Fix hreflang targets** (P0) — 8 URLs
5. **Extend audit scripts to USD** (P0) — Modifier `SITES` arrays
6. **Deduplicate beach titles** (P1) — Alias vs primaire
7. **Enrich thin pages** (P1) — Forecast + nearby + facts + activities
8. **Fix schema datePublished** (P1) — Article JSON-LD
9. **Consolidate home vs carte-sargasses** (P1) — Cannibalization
10. **Provision GSC USD** (P1) — Action fondateur + script
11. **Activate /es/ FL + PC** (P2) — Content existe, build auto
12. **Create commune pages USD** (P2) — Miami Beach, Cancún Hotel Zone, etc.
13. **Build FAQ pages per beach** (P2) — Schema FAQPage
14. **Cross-domain linking architecture** (P2) — `getAllowedCrossLinks()`
15. **Measure organic → PASS** (P3) — GA4 + Mollie attribution

---

## 22. ROLLBACK STRATEGY

| Changement | Flag rollback | Fichier |
|------------|---------------|---------|
| Cross-domain links | `?xdomain=0` | `networkFooter()` |
| Commune pages USD | `?communepages=0` | `region-seo-pages.cjs` |
| FAQ pages | `?faqpages=0` | `dedicated-pages.cjs` |
| Area hubs | `?seoareas=0` (existant) | `region-seo-pages.cjs` |
| Month pages | `?seomonths=0` | `month-pages.cjs` |
| Today pages | `?seotoday=0` | `today-pages.cjs` |
| Dedicated pages | `?seodedicated=0` | `dedicated-pages.cjs` |

**Tous les ajouts SEO doivent avoir un flag rollback `?flag=0`** — Loi dure AGENTS.md.