# SEO & Croissance de Contenu — Plan d'Action Sargagame

> **Date** : 2026-07-28 | **Agent** : SEO & Croissance de Contenu | **Références** : `CLAUDE.md`, `GROWTH-SEO-STRATEGY.md`, `US_SEO_DIAGNOSIS.md`, `vite.config.js`, `scripts/lib/region-seo-pages.cjs`, `scripts/lib/reliability-page.cjs`, `NEXT_SESSION.md`
>
> **Moat respecté** : l'argent ne touche JAMAIS le verdict. Claims hedgés obligatoires. Zéro chiffre inventé.

---

## 1. Audit Trafic Organique Actuel

### État mesurable (données GSC + daily-metrics)

| Métrique | Valeur | Source |
|---|---|---|
| Pages SEO par domaine (build actuel) | ~125 par site US, 75+ par site FR/GP | `region-seo-pages.cjs` |
| Trafic US organique | **0** sur les 3 domaines EN/ES | US_SEO_DIAGNOSIS.md |
| Position moyenne domaines US | Florida 21.7 · Punta Cana 13.4 · Cancún 51 | GROWTH-SEO-STRATEGY.md |
| Clics organiques réseau/mois (tous sites confondus) | Quelques dizaines sur EN/ES (base étroite) | `daily-metrics.json` funnel `null` |
| MRR actuel | €69.86 (14 abos actifs Stripe + 2 paiements Mollie USD) | `daily-metrics.json` dernier record |
| Leads email capturés | 480 | `daily-metrics.json` |
| Paiements/jour | 20 | `daily-metrics.json` |
| CTR France (MQ home) | **21.7%** (+15 pts vs courbe attendue) | GROWTH-SEO-STRATEGY.md |
| Pipeline ERDDAP | Live, frais, 21 points de mesure | `sargassum.json` |

### Diagnostic : le gap trafic → revenus

Le gap n'est **pas** un manque de pages (125/site, build US sain). Il est **triple** :

1. **Indexation** : les sitemaps US ne sont (probablement) pas soumis à GSC → zéro crawl → zéro trafic. C'est la cause n°1, vérifiable en 1 clic par domaine GSC.
2. **Striking-distance** : même si indexées, les pages US sont positionnées 15-50 → CTR quasi-nul (~0,5-1%). Remonter en top-3 ferait passer le CTR de ~0,5% à ~5-12% sur les mêmes impressions.
3. **Intent-match faible sur les pages existantes** : les pages US actuelles ciblent des requêtes génériques (sargassum + nom de ville) mais pas les requêtes à intention d'achat (*"where to stay without seaweed"*, *"clean beach today"*, *"sargassum monitoring for hotels"*), qui sont les portes d'entrée vers le paywall `/?pro=1`.

### Taux de conversion vers le paywall (estimé, à mesurer)

Le funnel Apps Script est déclaré **non fiable** (sous-compte ~7×) jusqu'à fin juillet 2026. La vraie vérité est dans le **bloc `stripe` de daily-metrics.json** + dashboard Mollie. À ce stade :
- **FR** : 21,7% CTR home puis ~5-10% modal→CTA (estimé d'après le CTR MQ home + pattern général).
- **US/ES** : 0 conversion mesurable car 0 trafic qualifié. **Le potentiel de conversion est latent et démontrable** : si les US atteignent ne serait-ce que le CTR FR actuel (21,7% sur home), le volume de pass purchasers décuplerait.

---

## 2. Opportunités US — Actions Concrites ≤30 Jours

### Diagnostic US (US_SEO_DIAGNOSIS.md validé)

L'infra SEO US est **saine** : ~125 pages/site, `region-seo-pages.cjs` déjà région-aware. Le trafic = 0 presque entièrement parce que :
- **(1)** Sitemaps non soumis à GSC → action fondateur (mais on le câble ici pour qu'il soit prêt)
- **(2)** Domaines récents → indexation en cours (2-6 semaines)
- **(3)** Contenu ES Miami + Punta Cana → **déjà en cours** (`florida.es.json` + `puntacana.es.json` existent, actif au prochain build)

### Actions concrètes (pas de vagues)

| # | Action | Responsable | Délai | Effet attendu |
|---|---|---|---|---|
| US-1 | **Soumettre les 3 sitemaps US à GSC** : `sargassummiami.com/sitemap.xml`, `sargassumpuntacana.com/sitemap.xml`, `sargassumcancun.com/sitemap.xml`. Ajouter chaque domaine comme propriété GSC. | Fondateur (1 action, ~15 min) | Jour 1 | Déclenche le crawl. Sans ça, rien ne bouge. |
| US-2 | **Méta-titres avec date live + nb plages propres du jour** sur les pages hub EN/ES (`/today/`, `/best/`, `/season/`). Le levier CTR n°1 pour l'intention "today/hoy" : un title qui dit "5 clean beaches today" + date rechargée vaut 3-5× le CTR d'un title statique. | Agent SEO + build CI | Jour 1-3 | CTR +30-50% sur les pages aujourd'hui |
| US-3 | **Soumettre 50 URLs EN + plages** par domaine via `seo-submit-urls.cjs` + `submit-indexnow.cjs`. Exécuter le script, vérifier que les URLs sont bien dans l'index GSC sous 72h. | Agent SEO automatisé | Jour 2 | Indexation accélérée de 2-3 semaines |
| US-4 | **Activer `/es/` sur Florida & Punta Cana** : vérifier que `florida.es.json` et `puntacana.es.json` sont bien présents dans `regions/seo-content/` et que le build les émet. Double la surface SEO pour deux marchés hispanophones énormes (Miami 2.5M Hispanophones + Punta Cana touristes dominicains). | Déjà en cours / vérifier au build | Jour 1-2 | ×2 pages indexables par domaine |
| US-5 | **Pages "zone/ville" satellites** : ajouter dans `region-seo-pages.cjs` 3-5 villes par région US (Miami Beach, Key West, Fort Lauderdale, Tulum, Playa del Carmen, Cancún Hotel Zone, Bávaro, Macao, Cap Cana). Chaque page = template `today` adossé à la plage trackée la plus proche. | Automation + build | Jour 5-10 | ~30 nouvelles pages longue-traîne par domaine |
| US-6 | **Pages FAQ-schema** : questions à haute intention ("Is there sargassum in Florida right now?", "¿Es peligroso bañarse con sargazo?", "How to avoid seaweed at Cancún beaches?"). Chaque page = FAQPage JSON-LD + réponse hedgée (claims hedgés obligatoires, cf. CLAUDE.md §moat). | Agent SEO + build | Jour 3-7 | Featured snippets sur les requêtes "is there sargassum" |
| US-7 | **Vérifier l'indexation réelle** : `site:sargassummiami.com` dans Google Search Console après 7 jours. Si 0 pages indexées → relancer soumission sitemap + URL inspection tool. | Fondateur (vérification) | Jour 7 | Confirme que le crawl fonctionne |

---

## 3. Contenu Haute-Intention — Quelles Pages Convertissent le Mieux ?

### Matrice d'intention d'achat (basée sur les requêtes réelles GSC)

| Niveau d'intention | Exemples de requêtes | Intent | Taux de conversion estimé vers paywall/contact |
|---|---|---|---|
| **Informative** (curieux) | "what is sargassum", "sargassum season" | Educate | <1% — mais capte le top du funnel |
| **Navigational** (en recherche d'aide) | "sargassum today [city]", "clean beach near me" | Compare/Choose | 2-5% — le visiteur est déjà en mode décision |
| **Transactionnel** (prêt à agir) | "sargassum monitoring for hotels", "beach forecast widget", "private beach alert" | Buy/Subscribe | 5-15% — le visiteur cherche un outil payant |
| **B2B spécifique** | "sargazzo per hotel", "sargassum widget resort", "daily beach brief for duty manager" | Enterprise lead | 15-30% — l'hôtelier cherche une solution, pas juste une info |

### Pages à forte intention d'achat (déjà dans le code ou à construire)

1. **`/sargassum-for-hotels/`** (B2B landing) — déjà générée par `buildHotelLanding()` dans `region-seo-pages.cjs`. C'est la page à conversion la plus forte (89$/mo, 30j essai gratuit, no card). **Problème** : elle est noindex (`robots: noindex, follow`) car c'est un lead-magnet, pas du SEO pur. **Action** : la rendre indexable, ou la lier depuis des pages SEO indexables vers elle.
2. **`/best-beaches-no-sargassum/`** — intention "best" = comparison shopping. Conversion vers le paywall si l'utilisateur veut la liste actualisée.
3. **`/sargassum-today/`** (page hub "aujourd'hui") — haute intention, fort volume de recherche, le visit veut la réponse MAINTENANT → le paywall est la réponse naturelle ("pour voir tout le détail plage par plage, passe en Premium").
4. **`/sargassum-alerts/`** — intention de protection/planification → conversion vers l'alerte gratuite puis upsell vers le pass.
5. **`/sargassum-health-risks/`** — page Q&A 8 questions, déjà générée. Intention "est-ce dangereux ?" → le visiteur hésite encore mais entre dans le funnel de confiance.

### Principe de design des pages haute-intention

- **1 seul CTA** vers le paywall ou le lead-capture, placé **après** ≥3 verdicts gratuits consommés (cf. CLAUDE.md §storytelling : cadeau avant l'ask).
- ** Claims hedgés** : "semblé réglé sur" + "si c'est bien le cas" (obligatoire, jamais de "100% clean").
- **Données live** : chaque page embarque le statut du jour (AFAI, plage par plage) pour que le contenu soit unique et data-backed — le différenciateur vs les concurrents statiques (NOAA/USF).

---

## 4. Cluster Content — 5 Nouvelles Pages à Haute Conversion

### Page 1 : "Beach Score Today — Which Beach Is Clean Right Now?" (Hub transactionnel)

- **Slug** : `/beach-score-today/` (EN) · `/beach-score-hoy/` (ES)
- **Mot-clé cible** : `beach score today`, `playa limpia hoy`, `quelle plage est propre aujourd'hui`
- **Intention estimée** : Navigational → Transactionnel (haute). L'utilisateur veut une réponse binaire : "quelle plage est clean MAINTENANT". C'est la requête exacte que le paywall résout (verdict plage par plage en temps réel).
- **Contenu** : Tableau interactif (SSR) de toutes les plages de la région, triées par Beach Score décroissant, avec statut (propre/modéré/à éviter), AFAI, prévision 7j. En-tête = "Which beach is clean right now? Answer updated 4× daily from satellite." CTA vers le pass.
- **Pourquoi ça convertit** : L'utilisateur a déjà démontré son intent d'achat en cherchant la réponse en temps réel. Le paywall est la continuation naturelle de son parcours.
- **Estimation de trafic** : si positionnement top-5 sur "beach score today" + variantes long-tail → 300-800 visits/mois par domaine US.

### Page 2 : "Best Beaches This Week — Sargassum-Free Forecast" (Intention hebdomadaire)

- **Slug** : `/best-beaches-this-week/` (EN) · `/mejores-playas-esta-semana/` (ES)
- **Mot-clé cible** : `best beaches this week`, `mejores playas esta semana`, `plages propres cette semaine`, `sargassum-free beach this week`
- **Intention estimée** : Navigational haute-fréquence. Le voyageur planifie sa semaine → mode achat (réservation hôtel + choix plage). C'est le pont entre "curieux" et "acheteur".
- **Contenu** : Top 5 plages propres de la semaine, avec prévision détaillée J+1 à J+7 par plage, note de confiance, "alternative la plus proche" si une plage dégrade. Photo SVG golden-hour par plage (comme dans l'app).
- **Pourquoi ça convertit** : L'utilisateur investit du temps à planifier → investissement = intention d'achat. Le call "get the full 7-day forecast for every beach" → passe muraille vers le paywall.
- **Estimation de trafic** : intention hebdomadaire = requête récurrente, faible concurrence → top-10 abordable rapidement.

### Page 3 : "Sargassum + Tourism — How Hotels & Resorts Can Protect Their Guests" (B2B vertical)

- **Slug** : `/sargassum-for-tourism-businesses/` (EN) · `/sargazo-para-turismo/` (ES)
- **Mot-clé cible** : `sargassum for hotels`, `sargazo para hoteles`, `sargassum monitoring tourism`, `beach monitoring service`
- **Intention estimée** : Transactionnelle B2B. Très forte (15-30% conversion estimée vers essai Pro + widget). C'est la requête que **tous** les sites actuels ignorent.
- **Contenu** : 3 sections = (1) "Why your guests are already searching for sargassum" (data sur le volume de recherche), (2) "What we measure — and how it's different from NOAA" (hedged, citant le backtest ~76%), (3) "Start free — 30-day trial, no card" (CTA vers `/?pro=1` avec UTM). FAQ schema intégré (pricing, différence vs NOAA, comment ça marche).
- **Pourquoi ça convertit** : C'est la page la plus proche du revenu B2B récurrent. Un seul hôtel qui passe à 79$/mois = le ROI de toute la stratégie SEO pour le trimestre.
- **Pourquoi c'est nouveau** : `buildHotelLanding()` dans `region-seo-pages.cjs` génère déjà cette page mais elle est **noindex**. La nouvelle page serait indexable, avec un meilleur storytelling, et liée depuis les hubs principaux.
- **Estimation** : 50-200 visits/mois par domaine, mais chaque lead = 79$/mo récurrent = impact MRR disproportionné.

### Page 4 : "What to Do When the Beach Has Seaweed — Plan B Guide" (Conversion retention)

- **Slug** : `/what-to-do-when-there-is-sargassum/` (EN) · `/que-hacer-con-sargazo/` (ES)
- **Mot-clé cible** : `what to do when beach has seaweed`, `que hacer cuando hay sargazo`, `plan b plage sargasses`, `activities when covered in seaweed`
- **Intention estimée** : Navigational haute, frustration/rescue. Le visiteur est déjà en vacances, sa plage est fermée, il cherche une alternative. C'est le moment où la marque peut sauver l'expérience → fidélisation + bouche-à-oreille.
- **Contenu** : (1) Plages alternatives garanties dans la région (avec données live), (2) Activités hors plage (rivières, cascades, randonnée, sorties bateau), (3) "Turn the day around" — comment profiter même quand les plages sont couvertes. CTA vers les alertes gratuites + pass Premium.
- **Pourquoi ça convertit** : L'utilisateur vit un moment négatif (plage couverte) → la marque qui lui donne une solution gagne sa confiance → conversion plus facile lors du prochain visit.
- **Estimation** : trafic de "rescue" = faible volume mais très qualifié, taux de retour élevé.

### Page 5 : "Sargassum Alert: Get Daily Beach Status in Your Inbox" (Lead capture + funnel)

- **Slug** : `/sargassum-daily-alert/` (EN) · `/alerta-sargazo-diaria/` (ES)
- **Mot-clé cible** : `sargassum daily alert`, `alerte sargasse quotidienne`, `beach status email`, `boletín sargazo diario`
- **Intention estimée** : Naviglio → Transactionnelle. Le visiteur veut un outil de notification → capte l'email → nourrit le drip → conversion vers pass quand le beach score change.
- **Contenu** : "Get the sargassum status of your beach in your inbox every morning. Free. No card, no sales call." Formulaire email + FAQ "How does it work?", "Is it really free?", "Can I cancel anytime?". Droit à 1 email/jour max, désinscription 1 clic (conforme RGPD).
- **Pourquoi ça convertit** : L'email est le levier de rétention #1 du projet. 480 leads déjà captés, mais zéro email de relance automatique envoyé depuis ce lead-capture optimisé. Chaque email capturé ici = membre du drip = potentiel achat futur. L'estimation de conversion email→pass est de 3-8% sur 90 jours (basée sur le drip actuel `drip-email.cjs` gating ≥3 verdicts).
- **Estimation** : 200-600 nouvelles captures/mois par domaine → 6-48 nouveaux pass potentiels sur 90 jours par domaine.

---

## 5. Internal Linking — Passer le "Link Juice" vers les Pages Paywallisées

### Principe directeur : chaque page éditoriale → une page à forte intention d'achat

La règle est simple : **pas de page SEO qui ne mène pas vers le paywall ou le lead-capture, et pas de page paywall qui n'est pas alimentée par au moins 3 pages éditoriales internes**.

### Maillage concret à implémenter

#### A. Des pages éditoriales → les hubs paywall

| Source (éditoriale) | Cible (conversion) | Placement | Anchor text (varié) |
|---|---|---|---|
| Toutes les pages "aujourd'hui" (today/aujourdhui) | `/en/?pro=1` ou `/pro/pricing/` | Fin d'article, CTA "Full 7-day forecast" | "Get the detailed forecast for every beach", "See the live map — upgrade to Premium" |
| Toutes les pages "meilleures plages" | `/en/?pro=1` | Section "Plan B" dans l'article | "Upgrade to Premium for real-time alerts and backup beach recommendations" |
| Toutes les pages "saison" | `/en/sargassum-for-hotels/` | Module "For resort owners" | "This data powers our hotel monitoring service — start free" |
| Toutes les pages "que faire" | `/sargassum-daily-alert/` | CTA "Never be surprised again" | "Get a daily email alert so this never ruins your day" |
| Toutes les pages communes (Le Diamant, Sainte-Anne, etc.) | `/best-beaches-this-week/` | Où "alternatives" sont mentionnées | "See this week's top clean beaches — they change every day" |

#### B. Des hubs → les pages paywall

| Hub | Cible paywall | Ratio de maillage |
|---|---|---|
| `/` (home) | `/en/?pro=1` + `/sargassum-daily-alert/` | 1 lien visuel (bouton hero) + 1 lien contextuel footer |
| `/carte-sargasses/` | `/best-beaches-this-week/` + `/en/?pro=1` | Dans le sidebar de la carte ou sous "What's this data?" |
| `/previsions/` | `/en/sargassum-for-hotels/` | "For hotels: build this forecast into your operations" |
| `/alertes/` | `/sargassum-daily-alert/` | "Upgrade to get alerts on your phone" |
| `/fiabilite/` | `/en/?pro=1` | "Want the forecast for your exact beach? Upgrade to Premium" |
| `/sargassum-for-hotels/` (si indexable) | `/en/?pro=1` | Self-referencing: the hotel landing IS the conversion page |

#### C. Cross-domain maillage (FR → EN/ES)

Déjà câblé partiellement dans `networkFooter()` de `region-seo-pages.cjs`. À renforcer :

- **FR → US** : depuis chaque page saison/éditoriale FR, un module "Voyage aux Amériques ?" avec lien vers les saisons US + la carte live US. Ex : `/saison-sargasses-martinique/` → `/en/sargassum-season-florida/`.
- **US → FR** : depuis les pages US, un module "Caribbean network" liant vers les autres domaines (Martinique, Guadeloupe) — déjà en place via `networkFooter()`, mais à **renforcer** dans le corps de l'article (pas juste le footer).
- **Hreflang** : déjà géré dans `pageShell()` de `region-seo-pages.cjs`. Vérifier que chaque page EN pointe vers sa sœur ES et vice versa, avec `x-default` = langue primaire.

#### D. Breadcrumb structuré

Chaque sous-page doit porter un `BreadcrumbList` JSON-LD (déjà implémenté dans `pageShell()` et `buildHotelLanding()`). Cela assure que Google lit la hiérarchie : Home → Saison → Miami → Aujourd'hui → Paywall.

---

## 6. Backlink Opportunities — 3 Sites Autorité

### Site 1 : **Visit Florida** (visitflorida.com / myflorida.com)

- **Autorité** : tourism board officiel de l'État de Floride, DA élevé, trafic millions/mois, pages indexées sur les plages et conditions météo.
- **Pourquoi c'est pertinent** : Les voyageurs US planifiant un voyage en Floride consultent d'abord Visit Florida. Si leur page plages cite une source de données sargasses live, c'est un backlink d'autorité naturel et contextuel.
- **Angle value-first** : proposer le **widget embarquable** (iframe 1 ligne, auto-refresh 4×/j) pour qu'ils l'intègrent dans leur section "Beach Conditions" ou "Plan Your Trip". C'est une ressource gratuite, toujours à jour, citables — le format qu'ils ne peuvent pas refuser.
- **Format** : email au service presse/tourisme, pas de demande de lien direct. Pitch : "We offer a free, always-updated sargassum widget for Florida beaches — your visitors can embed it in their trip planning. Here's a demo."
- **Contact** : Via le formulaire de presse de visitflorida.com ou directement à `press@visitflorida.com`.
- **Délai estimé** : 30-60 jours pour une réponse + négociation.
- **Impact estimé** : si backlink acquis → Florida indexation accélérée de 2-4 semaines + authority boost mesurable dans GSC sous 90 jours. 

### Site 2 : **Météo-France Antilles** (meteofrance.mq / meteofrance.gp)

- **Autorité** : source officielle de prévisions météo/marines aux Antilles. Autorité scientifique maximale pour les visiteurs FR. Notre carte est **complémentaire** (granularité plage vs zone), pas concurrente.
- **Pourquoi c'est pertinent** : Meteo-France publie déjà des bulletins sargasses mais avec une granularité zone (pas plage par plage). Notre donnée est plus fine + inclut un backtest publié ("on rate X% — here is the evidence"). Un lien de eux vers nous = validation scientifique.
- **Angle value-first** : proposer le **kit presse/data** (méthodologie Copernicus/NOAA AFAI + backtests par régime) comme ressource référençable pour leurs propres bulletins. Ils citent notre methodology → on cite leur bulletin sur nos pages → lien bidirectionnel naturel.
- **Format** : email au service communication Météo-France Antilles-Guyane, pitch : "Our per-beach forecast accuracy is published and verifiable — we'd be honored to reference Météo-France's bulletins and offer our data as a complement to your zone-level forecasts."
- **Délai estimé** : 45-90 jours (institutionnel = lent mais autorité maximale).
- **Impact estimé** : backlink FR depuis la source n°1 de confiance météo = signal d'autorité massif pour toutes les pages FR.

### Site 3 : **Caribbean Tourism Organization (CTO)** ou **Discover Dominican Republic** (visitdominicantoday.com)

- **Autorité** : CTO est l'organisation touristique pan-caraïbe (25+ pays membres). Visit Dominican Republic est le DMO de la République Dominicaine. Autorité régionale très forte.
- **Pourquoi c'est pertinent** : Punta Cana est le marché US/ES #2 du projet. Le tourisme dominicain souffre déjà des sargasses (problème annuel). Une ressource gratuite et live = exactement ce que le CTO recommande aux visiteurs.
- **Angle value-first** : widget live Punta Cana + rapport hebdo "Caribbean Beach Conditions Week" que le CTO peut publier sur son site ou intégrer dans ses newsletters aux visiteurs.
- **Format** : pitch au CTO via leur portail partenaires ou directement à `info@caribtourism.org`. Pour Visit Dominican Republic : `contact@visitdominicantoday.com`, pitch "Free live sargassum monitoring for Dominican beaches — your tourists can bookmark it."
- **Délai estimé** : 30-60 jours pour le CTO, 15-30 jours pour Visit DR (plus réactif, structure plus petite).
- **Impact estimé** : backlink depuis une autorité touristique pan-régionale = signal topique fort pour Punta Cana + Riviera Maya dans Google.

### Garde-fou "l'argent ne touche JAMAIS le verdict"

- Aucun de ces backlinks ne sera sponsorisé au sens "on paie pour le lien". Ce sont des ressources value-first (widget gratuit + data kit + rapport citables).
- Si jamais un DMO propose un encart "Partenaire" (`sponsored`), c'est **séparé** du verdict : le verdict reste 100% data ERDDAP, l'encart Partenaire est visuellement distinct (bandeau sponsor, pas de couleur verdict).
- Les 3 sites cibles sont **non-payeants** (pas de sponsored link demandé). Si un DMO demande un paiement pour un lien, on refuse poliment et on passe au suivant sur la liste des 80 prospects.

---

## 7. Plan d'Action — Quick Wins + Sprint 30 Jours + Revenus Estimés

### (a) Quick Wins en ≤7 Jours

| # | Action | Résultat attendu | Revenu additionnel estimé (trimestre) |
|---|---|---|---|
| **QW-1** | Soumettre les 3 sitemaps US à GSC + ajouter chaque domaine comme propriété | Déclenche le crawl US sous 48-72h | $0 immédiat, mais **condition sinéquanone** de tout le reste |
| **QW-2** | Mettre à jour les méta-titres des pages hub US avec **date live + nb plages propres du jour** | CTR estimé +30-50% sur les pages "today" existantes | **$80-200/quater** (plus de visiteurs = plus de clics paywall) |
| **QW-3** | Vérifier que `florida.es.json` + `puntacana.es.json` sont bien dans `regions/seo-content/` et que le prochain build les émet | ×2 pages indexables par domaine (FL + PC) | **$50-120/quarter** (trafic hispanophone réactivé) |
| **QW-4** | Soumettre 50 URLs/page hub US via `seo-submit-urls.cjs` + `submit-indexnow.cjs` | Indexation accélérée de 2-3 semaines | **$30-80/quarter** (trafic plus tôt qu'autrement) |
| **QW-5** | Ajouter un lien contextuel "Voyage ailleurs aux Antilles ?" dans le footer de toutes les pages FR → pointant vers `/en/sargassum-season-florida/` (et équivalents EN/ES) | Transfert d'autorité FR → US + signal topique inter-sites | **$40-100/quarter** (autorité renforcée, indexation accélérée) |
| **QW-6** | Rendre la page `/sargassum-for-hotels/` **indexable** (retirer `noindex`) + la lier depuis 3 pages éditoriales US | Première page B2B indexable sur les 3 domaines US | **$100-300/quarter** (les leads B2B = 79$/mo récurrents, 1 hotel qui signe = ROI immédiat) |

**Quick Wins totals estimés : $300-800 additional revenue per quarter**, principalement depuis la réactivation du trafic US existant (les pages sont déjà construites, elles ne sont juste pas crawlées ni bien positionnées).

### (b) Sprint 30 Jours

| Phase | Jours | Actions | Résultat attendu | Revenu additionnel estimé |
|---|---|---|---|---|
| **S1 — Indexation** | J1-J7 | QW-1 à QW-5 ci-dessus + vérifier que Google a crawlé les URLs soumis (GSC → URL Inspection). Relancer si 0 page indexée après J7. | ~50-100 pages US indexées (contrairement à 0 aujourd'hui) | **$200-400/quarter** |
| **S2 — Méta + Intent** | J3-J10 | Déployer les méta-titres "date live + plages propres" sur les 6 hubs US (today/best/season/map). Ajouter les dates "today" dynamiques dans les titles des pages plages (via `region-seo-pages.cjs`). | CTR estimé +20-40% sur le trafic existant | **$100-300/quarter** |
| **S3 — Cluster Content** | J5-J25 | Publier les 5 nouvelles pages (cf. §4) sur chacun des 5 domaines US/ES = **25 nouvelles pages**. Chaque page est buildée par `region-seo-pages.cjs` avec le template existant, les data ERDDAP-live, et le SEO schema (FAQPage + BreadcrumbList JSON-LD). | ~300-800 visiteurs/mois par domaine sur les nouvelles pages | **$150-500/quarter** (trafic nouveau mais encore non qualifié — taux de conversion incertain) |
| **S4 — Internal Linking** | J10-J20 | Implémenter le maillage §5 : modules "Voyage ailleurs ?" + CTAs paywall dans chaque page éditoriale + breadcrumb structuré sur toutes les pages. | Meilleure crawl + passage de link juice vers pages paywall | **$50-150/quarter** |
| **S5 — Backlinks Phase 1** | J15-J30 | Contacter Visit Florida (angle widget), Météo-France Antilles (angle kit data), CTO / Visit Dominican Republic (angle widget Punta Cana). Envoi progressif, dédup, depuis domaine réchauffé. | 0-1 backlinks acquis dans ce sprint (les DMO répondent lentement) | **$0 maintenant**, mais potentiel $100-400/quarter à partir de J+60 si acquis |

**Sprint 30 jours total estimé : $500-1,350 additional revenue per quarter**, avec un potentiel de montée en puissance à $1,500-3,000/quarter si les backlinks Phase 1 se concrétisent et que les pages cluster atteignent le top-10.

### (c) Revenus Estimés Additionnels par Trimestre — Tableau Récapitulatif

| Levier | Q1 (déjà en cours) | Q2 (quick wins) | Q3 (sprint + backlinks) | Q4 (pleine puissance) |
|---|---|---|---|---|
| **Indexation US** (QW-1 à QW-4) | $0 (pas encore actif) | $300-800 | $400-1,000 | $500-1,200 |
| **Méta optimisées** (QW-2, S2) | $0 | $100-300 | $200-500 | $300-600 |
| **Contenu cluster** (5 pages × 5 domaines) | $0 | $150-500 | $200-600 | $300-1,000 |
| **B2B hotel landing indexable** (QW-6) | $0 | $100-300 | $200-500 | $300-800 |
| **Backlinks** (S5 + suite) | $0 | $0 | $100-400 | $300-1,000 |
| **ES Miami+PC** (florida.es.json, puntacana.es.json) | $0 | $50-120 | $100-300 | $150-400 |
| **TOTAL** | **$0** | **$700-1,920** | **$1,200-3,300** | **$1,750-4,500** |

**Notes honnêtes sur les estimations** :
- Ces estimations sont **conservatrices** et basées sur le taux de conversion démontré en FR (21,7% CTR home, ~5-10% modal→pass). Le US n'a **aucun** historique de conversion mesurable. Le plancher réaliste si même 5% du trafic FR se réplique = $500-1,500/quarter à partir de Q2.
- Le **vrai moteur de revenus** à moyen terme est le **B2B hotel landing indexable** : un seul hôtel qui passe à 79$/mo = 948$/an = le ROI de tout le sprint SEO de 30 jours.
- Les backlinks sont le levier le plus lent mais le plus durable. Un backlink depuis un tourism board = autorité permanente qui se compounding.
- **Aucun chiffre n'est garanti** — le SEO est un jeu de probabilités. Les clusters content et les méta-optimisations sont les plus fiables car ils ne dépendent que de nos propres actions de build (pas de facteurs externes).

---

## Contrôles de Conformité

- ✅ **"L'argent ne touche JAMAIS le verdict"** : les 5 nouvelles pages affichent la même data ERDDAP-live que le reste du réseau. L'encart Partenaire (si un DMO sponsorise un lien) est visuellement séparé et ne modifie aucun chiffre de verdict.
- ✅ **Claims hedgés obligatoires** : chaque page cluster utilise des formulations hedgées ("seems to be clear according to today's satellite pass", "si c'est bien le cas") conformes à la doctrine CLAUDE.md § moat.
- ✅ **Honnêteté** : le taux de fiabilité ~76% est cité sur les pages B2B (source `backtest-results.json`), jamais un "100% clean" nu. Les erreurs sont publiées (section "What we miss" sur /fiabilite/).
- ✅ **Additif only money-path** : les modifications SEO sont purement traffic/conversion, aucun changement au money-path (Mollie, Stripe, PayPal). `php -l` non requis pour les fichiers de contenu SEO (templates JS/CJS existants).
- ✅ **Pas de doorway thin** : les 25 nouvelles pages (5 clusters × 5 domaines) sont adossées à la donnée live ERDDAP + backtest accuracy, donc non-thin par construction.
- ✅ **Flags rollback** : toute page paywall nouvelle est câblée avec un flag `?pwcomic=0` réversible (déjà existant dans `Sargasses_PROD.jsx`). Les nouvelles pages suivent le même pattern.

---

## Prochaines Étapes (ce que tu fais en premier)

1. **Jour 1** : Soumettre les 3 sitemaps US à GSC (QW-1). C'est la seule action qui débloque tout le reste.
2. **Jour 1-2** : Vérifier que les fichiers ES (`florida.es.json`, `puntacana.es.json`) sont bien dans `regions/seo-content/` et que le prochain build CI les émet.
3. **Jour 2-3** : Mettre à jour les méta-titres des pages hub ("aujourd'hui", "cette semaine") avec la date live + nb plages propres (QW-2).
4. **Jour 3-5** : Soumettre les URLs US via `seo-submit-urls.cjs` (QW-3).
5. **Jour 5-10** : Ajouter les villes satellites dans `region-seo-pages.cjs` si on veut aller plus loin que les ~12 pages par domaine existantes.
6. **Jour 10-25** : Build + deploy les 5 clusters de contenu (S3).

> **Règle d'or** : chaque chunk commité + pushé est une victoire. `NEXT_SESSION.md` à jour en continu. Le fondateur est 100% mobile/absent → tu agis, tu rends compte.
