# B2C OFFER RESEARCH — Benchmark concurrentiel (sargassum direct + travel/outdoor apps)

**Date :** 2026-09-27
**Mission :** B2C Monetization / Offer Architecture Lab — étape 2 (recherche externe)
**Sources :** web live, septembre 2026. Prix observés = constats datés, pas des vérités permanentes.
**Règle :** ne pas copier les stratégies ; utiliser comme benchmarks pour calibrer FREE vs PAID, one-time vs recurring, trial, paywall position, pricing psychology.

---

## 1. SARGASSUM DIRECT

### 1.1 Sargassum Report (sargassumreport.com) — concurrent direct le plus structuré

| Dimension | Observé |
|-----------|---------|
| Free | Recherche resort, niveaux de risque par plage, rapports voyageurs, travel planner (recommandations par dates), prévisions mensuelles 2026 par destination, newsletter hebdo email |
| Paid | **Personalized Resort Check = $19 one-shot** : hôtel + dates + historique + outlook + alternatives proches, livré sous 24h. "Trusted by 450+ travelers" (social proof chiffrée) |
| One-time | Oui ($19, produit humain, pas d'abonnement) |
| Monthly / Annual | Non observé (pas d'abonnement B2C) |
| Alertes | Crowdsourced traveler alerts (gratuit) |
| Favoris / monitoring | Non observé |
| Personalization | Oui — c'est LE produit payant ($19, humain) |
| Trial | Non applicable (one-shot) |
| Paywall position | Contextuel : "Need Resort-Specific Advice?" sur les pages destination + "Plan Your Trip with Confidence" |
| Pricing psychology | $19 = sous le seuil $20, "delivered within 24 hours", preuve sociale 450+ |
| What remains free | Tout le contenu de découverte (cartes, risques, rapports, planner) |
| What is monetized | Le jugement personnalisé humain sur TON hôtel + TES dates |

**Implication Sargagame :** valide le modèle "MON STAY / Personalized one-shot ~$19". Sargagame peut faire la même chose en AUTOMATIQUE (données existantes : destination + dates + forecast + alternatives) à coût marginal ~0 — avantage structurel vs produit humain 24h.

### 1.2 SargaTrack (sargatrack.com, Martinique) — veille citoyenne

| Dimension | Observé |
|-----------|---------|
| Free | 100% gratuit : carte collaborative, signalements géolocalisés, photos terrain, relevés H₂S, "Plage propre" mode |
| Paid | Aucun. 4 600+ utilisateurs Martinique. Cherche partenaires régionaux / subventions (B2G angle) |
| Modèle éco | Bénévolat + future subvention / partenariats collectivités |

**Implication Sargagame :** confirme que le gratuit collaboratif capte l'usage local (résidents) mais ne monétise pas. Sargagame ne doit pas concurrencer sur le gratuit citoyen ; son edge = donnée satellite + forecast + décision (pas le signalement).

### 1.3 FanGass (fangass.com, Katchak Agency) — météo sargasses Antilles

| Dimension | Observé |
|-----------|---------|
| Free | 154 plages, carte live, score 0-5, bulletin quotidien "Tonton Sargasse", votes baigneurs, odeur, widget écran d'accueil. **Sans compte, sans pub** |
| Paid | Aucun. Financé par l'agence ("gratuit pour vous, pas pour nous") |
| Couverture | Guadeloupe 47, Martinique 44, St-Martin 20, St-Barth 11, RD 32 (+ PR, Floride, Jamaïque, Mexique) |

**Implication Sargagame :** le gratuit "météo du jour" est commoditisé (3 acteurs gratuits sur la même zone). La différenciation ne peut pas être "l'état du jour" — elle doit être forecast + fiabilité + alternatives + monitoring (ce que les gratuits n'ont pas : FanGass = J+0/J+1, pas de J+7, pas de confiance publiée).

---

## 2. TRAVEL / OUTDOOR APPS

### 2.1 Surfline — la référence "forecast freemium" la plus proche

| Dimension | Observé (2026) |
|-----------|----------------|
| Free | Forecast court (quelques jours), cams limitées basse résolution + pubs |
| Paid | **Premium ~$15.99/mo ou ~$119.99/yr** ; Premium with ads $69.99/yr ; Premium+ $149.99/yr (partageable 3 comptes ≈ $50/user) ; Forecast-only plan (sans cams) ; Student -50% |
| Trial | 7 jours, **annual uniquement** |
| Monthly vs annual | Monthly = le plus cher, flexibilité saisonnière. Annual = -35%. "Monthly is our most expensive plan" (assumé explicitement) |
| Alertes | Basiques gratuites ; custom avancées (swell/vent/marée par spot) = Premium |
| Favoris | Spots favoris illimités = Premium |
| Offline / advanced data | 16-17 jours forecast, modèles HD, historique, analyse swell = Premium |
| Pricing psychology | Annualisation agressive (-35%), partage familial, tier "with ads" d'appel, Forecast-only comme décoy vers Premium complet |

**Implication Sargagame :** le pattern dominant = **forecast court gratuit / forecast long payant + alertes custom + favoris illimités**. Transposition directe : J+0/J+1 gratuits, J+2→J+7 + alertes "ta plage bascule" + favoris illimités = payant. Le tier "with ads" et le partage sont des idées de second ordre (pas pour le MVP offre).

### 2.2 Windy — le généreux

| Dimension | Observé |
|-----------|---------|
| Free | Cartes météo/vagues multi-modèles (ECMWF/GFS/NAM), généreux |
| Paid | **Premium ~$25-35/yr** : pas de temps plus fins, outlook plus long, updates fréquentes, historique radar/satellite |

**Implication Sargagame :** un Premium ~$30/yr peut exister avec un free généreux SI la valeur payante est de la donnée *plus fine / plus longue / historique*. Calibre la zone Watch Annual (~€20-30/yr) comme crédible face au marché.

### 2.3 AllTrails — le standard outdoor US

| Dimension | Observé |
|-----------|---------|
| Free | Découverte, navigation avec signal |
| Paid | **Plus $35.99/yr** (offline, wrong-turn alerts, live sharing, overlays météo) ; **Peak $79.99/yr** (AI routing, heatmaps) ; trial 7 jours |
| Pattern | Free = discovery (avec signal) → Paid = navigation/sécurité hors-réseau |

**Implication Sargagame :** le paywall "sécurité/éviter la mauvaise surprise" (offline maps ≈ ne pas se tromper de plage) convertit à ~$36/yr. Parallèle : "ne découvre pas les algues une fois la serviette posée" = même job-to-be-done que wrong-turn alerts.

### 2.4 Komoot — le cas d'école one-time → subscription (avertissement)

| Dimension | Observé |
|-----------|---------|
| Avant 2025 | One-time region packs : €3.99 / €8.99 bundle / €29.99 world — "buy once, own forever" |
| Après 02/2025 | Nouveaux users **forcés** vers Premium €59.99/yr (monthly €6.99, **weekly €4.99**). Legacy gardent leurs packs. Backlash communautaire fort |
| Points clés | **Weekly €4.99 = le price point "trip"** (un voyage = une semaine, pas un an). Free = 1 région + trial 7 jours Premium |

**Implications Sargagame (2) :**
1. Le **weekly/trip pass ~€5** est un price point validé par le marché pour l'usage ponctuel — aligne Trip 7j ~€4.99 avec la réalité marché.
2. **Ne jamais retirer un one-time acheté pour forcer l'abonnement** (backlash Komoot). Tout Watch récurrent doit s'ajouter, jamais remplacer le Trip Pass.

### 2.5 Flighty — le modèle "trip + lifetime" le plus sophistiqué

| Dimension | Observé |
|-----------|---------|
| Free | Généreux : vols illimités, live data, météo, stats, watch app. Pas de pub |
| Paid | **Weekly $4.99 / Monthly $9.99 / Annual $59.99 / Lifetime $299** (+ family tiers). **Premier vol = Pro gratuit complet** (pas de trial à activer, le produit se vend lui-même) |
| Pattern | Free = tracking ; Pro = alertes avant les compagnies + prédictions + historique illimité + imports. "Free on your first flight" = trial déguisé en expérience |

**Implications Sargagame (3) :**
1. **"Premier séjour = Watch gratuit"** : offrir le monitoring complet sur le premier trip (puis convertir en Watch) > trial 7 jours classique.
2. **Weekly $4.99** confirme le price point trip.
3. **Lifetime $299** : à garder en tête comme ancre haute / offre fondatrice éventuelle, pas MVP.

### 2.6 LazySurfer / Windguru / NDBC (contexte)
- LazySurfer : free tier réel + Pro moins cher que Surfline, personnalisation ML par user. Valide "personnalisé < prix du leader".
- Windguru/NDBC : data brute gratuite. Confirme : la data brute ne se monétise pas, seul le *jugement* (forecast + alertes + personnalisation) se monétise.

### 2.7 Beach Buddy / NALU Surf
- Non trouvés comme offres structurées comparables (apps de niche sans pricing public pertinent). Exclus du benchmark — pas de données, pas d'invention.

---

## 3. PATTERNS COMMUNS (synthèse)

| Pattern | Acteurs | Transposition Sargagame |
|---------|---------|-------------------------|
| Free = découverte + court terme ; Paid = long terme + profondeur | Surfline, Windy, AllTrails | J+0/J+1 free → J+2/J+7 + confiance + historique paid |
| Alertes custom + favoris = cœur du récurrent | Surfline, AllTrails | "Ta plage bascule" + favoris illimités = Watch |
| Trial sur annual, monthly = flexibilité chère assumée | Surfline, AllTrails | Trial 7j sur Watch Annual ; Watch Monthly plus cher au prorata, assumé |
| Weekly/trip pass ~€5 = price point voyage | Komoot, Flighty | Trip 7j ~€4.99 aligné marché |
| One-shot personnalisé ~$19 = prix du jugement humain | Sargassum Report | "Mon Séjour" auto à ~€10-20 (marge structurelle : coût ~0) |
| Premier usage complet gratuit > trial à activer | Flighty | Premier trip = Watch offert, puis conversion |
| Ne jamais retirer du one-time acheté | Komoot (contre-exemple) | Watch s'ajoute, ne remplace jamais Trip Pass |
| Gratuits locaux (SargaTrack, FanGass) | — | Ne pas concurrencer le J+0 gratuit ; différencier sur forecast + fiabilité + alternatives |
| Lifetime comme ancre haute | Flighty | Éventuel, pas MVP |

---

## 4. ZONES DE PRIX OBSERVÉES (constats, pas recommandations)

| Produit | Zone marché observée |
|---------|----------------------|
| Trip / weekly pass | €4.99 – $5.99 |
| Watch monthly (outdoor/travel) | $9.99 – $15.99/mo (leaders) ; Sargagame contexte FR voyage = bas de fourchette |
| Watch annual | $25 – $60/yr (Windy $25-35, AllTrails $36, Komoot €60, Surfline $120) |
| Personalized one-shot | $19 (Sargassum Report, humain) |
| B2B pro (référence interne) | €79/mo, €690/yr — inchangé, hors scope |

---

## 5. SOURCES

- sargassumreport.com (home, /hotels, /travel-planner, pages destination, forecast 2026) — sept. 2026
- linkedin.com/company/sargatrack + hubmonster.io/p/sargatrack — août 2026
- fangass.com + appbrain.com/app/fangass — juil-août 2026
- support.surfline.com (membership types, free vs premium, price tier updates 2025-05-05) + safewaters.ai (2026-04-15) + lazysurfer.app/compare (2026-06-06)
- windup.live/blog/windy-app-review (2026)
- alltrails.com/plans + alltrails.com/en-gb/plus
- betterineurope.eu Komoot vs AllTrails (2026-05-28) + localsinsider.com Komoot review (2026-06-01) + hikeload.com (2026-05-19) + theplanetedit.com + droidlore.com
- flighty.com/pricing + apps.apple.com Flighty IAP + store.flightyapp.com lifetime + apppricinglab.com + flightelite.app/blog (2026-01-09)
- Beach Buddy / NALU : pas de pricing public pertinent trouvé → exclus (pas d'invention)
