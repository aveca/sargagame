# Offre B2B — Le Veilleur Pro (sargasses)

> Doc de référence pour la prospection B2B sortante (`b2b-outreach.cjs` + `data/b2b-targets.json`).
> Cible : hôtels de bord de mer, clubs de plage, offices de tourisme, mairies littorales.
> Zones : Martinique (mq), Guadeloupe (gp), Riviera Maya (rivieramaya), Punta Cana (puntacana), Miami / Floride (florida).
> But : transformer le trafic B2B (1 hôtel installé spontanément le widget, anoli-lodges) en revenu récurrent.

## Pourquoi un tier B2B maintenant

- Le grand public convertit à **2,8 %** (3 480 modal opens → 99 CTA → 12 conversions) à 4,99 €/mo. Le revenu par lead est faible et le funnel est saturé sur le copy du modal.
- Les **établissements** ont un problème mesurable en euros : une plage couverte de sargasses = annulations, mauvais avis, remboursements, clients déçus. Leur willingness-to-pay est d'un ordre de grandeur supérieur à celui d'un particulier.
- On a déjà la donnée (Copernicus AFAI par plage + prévision 7 j + persistance) et l'infra de diffusion (emails automatisés, widget embeddable `public/widget/embed`). Le coût marginal d'un client B2B est ~0.
- Un hôtel a installé le widget **sans qu'on lui demande** → la demande existe, elle n'est juste pas encore monétisée.

## Les 3 produits B2B

### 1. Brief quotidien Pro (entrée de gamme)
Email automatique chaque matin (06 h locale) avec l'état réel des 3-5 plages les plus proches de l'établissement : indice AFAI, tendance, prévision 7 j, alerte avant échouage.
- **Cible** : petits hôtels, gîtes, clubs de plage, restaurants de bord de mer.
- **Valeur** : répondre à « y a-t-il des sargasses aujourd'hui ? » avec une donnée fiable, anticiper auprès des clients.
- **Pricing suggéré** :
  - EUR (MQ/GP) : **29 €/mois** ou **290 €/an** (2 mois offerts).
  - USD (Riviera Maya / Punta Cana / Miami) : **$39/mois** ou **$390/an**.

### 2. Widget premium marque blanche (cœur de gamme)
Le widget public (`public/widget/embed`) en version **payante, sans branding Sargasses**, aux couleurs de l'établissement, intégrable sur leur site / page de réservation.
- **Cible** : hôtels avec site propre, offices de tourisme, résidences hôtelières.
- **Valeur** : rassurer le visiteur AVANT la réservation (réduit l'incertitude = réduit l'abandon panier) ; afficher la transparence comme argument de vente.
- **Inclus** : widget white-label + brief quotidien (produit 1) + badge « plage surveillée au satellite ».
- **Pricing suggéré** :
  - EUR : **79 €/mois** ou **790 €/an**.
  - USD : **$99/mois** ou **$990/an**.

### 3. Rapport quotidien multi-plages + API (haut de gamme)
Pour les **mairies, offices de tourisme et groupes hôteliers** qui gèrent plusieurs plages / établissements :
- rapport quotidien PDF/email couvrant TOUTES les plages de la commune ou du portefeuille ;
- accès **API JSON** (même format que `public/api/copernicus/sargassum.json`) pour brancher leurs propres écrans/affichages/apps ;
- historique + export pour reporting (saison sargasses, communication publique, demandes d'aide / subventions).
- **Cible** : mairies littorales (Sainte-Anne, Le Gosier, Playa del Carmen, Miami Beach...), offices de tourisme, chaînes (Karibea, Iberostar, Bahia Principe...).
- **Pricing suggéré** :
  - EUR : **199 €/mois** ou **1 990 €/an**.
  - USD : **$249/mois** ou sur devis pour les grands groupes.

## Grille récap

| Produit                         | EUR (MQ/GP)          | USD (US/MX/DR)        | Cible type                              |
|---------------------------------|----------------------|-----------------------|-----------------------------------------|
| 1. Brief quotidien Pro          | 29 €/mo · 290 €/an   | $39/mo · $390/an      | Petit hôtel, gîte, club, resto plage    |
| 2. Widget premium marque blanche| 79 €/mo · 790 €/an   | $99/mo · $990/an      | Hôtel avec site, résidence, office      |
| 3. Rapport multi-plages + API   | 199 €/mo · 1 990 €/an| $249/mo · sur devis   | Mairie, office, groupe hôtelier         |

Tous : engagement mensuel sans durée, opt-out immédiat, facturation Stripe (Payment Link ou checkout on-site, cf. `create-checkout.php`).
Essai : **14 jours gratuits** sur les produits 1 et 2 (le brief tourne déjà, coût marginal nul) — réduit la friction du premier oui.

## Pitch email (premier contact, consultatif)

Le `b2b-outreach.cjs` envoie déjà UN email consultatif gratuit (« voyez l'état de vos plages en direct »). Ce doc décrit l'**upsell payant** quand l'établissement répond / clique. Le fondateur prend le relais humain sur les réponses chaudes.

**Objet** : Vos plages, surveillées au satellite — pour vos clients

**Corps (FR, MQ/GP)** :

> Bonjour,
>
> La première question d'un client avant de réserver chez vous, c'est souvent : « est-ce qu'il y a des sargasses sur la plage ? ». Y répondre avec une donnée fiable, c'est une réservation de plus et une déception en moins.
>
> On surveille au satellite (Copernicus Marine, indice par plage) l'état réel des plages autour de votre établissement, avec une prévision à 7 jours et une alerte AVANT l'échouage. Trois façons de l'utiliser :
>
> 1. **Le brief chaque matin** par email (l'état de vos plages, 29 €/mois) ;
> 2. **Un widget à vos couleurs** sur votre site, pour rassurer le visiteur avant qu'il réserve (79 €/mois) ;
> 3. **Le rapport complet + accès données** si vous gérez plusieurs plages (199 €/mois).
>
> Les deux premiers sont en **essai gratuit 14 jours**, sans engagement. Vous voulez que je vous montre l'état de vos plages aujourd'hui ? Répondez simplement à cet email.
>
> Bien à vous,
> L'équipe Le Veilleur · Sargasses Martinique

**Corps (EN, Miami / Riviera Maya / Punta Cana)** — à brancher quand le copy EN/ES sera prêt côté `b2b-outreach.cjs` (aujourd'hui le template retombe sur le FR/MQ pour les island US) :

> Hi,
>
> The first question a guest asks before booking is often: "is there sargassum on the beach right now?". Answering it with reliable data means one more booking and one less disappointment.
>
> We track your nearby beaches by satellite (Copernicus Marine, per-beach index), with a 7-day forecast and an alert BEFORE the seaweed lands. Three ways to use it:
>
> 1. **A daily brief** by email ($39/mo);
> 2. **A white-label widget** in your brand colors on your website, to reassure guests before they book ($99/mo);
> 3. **The full multi-beach report + data API** if you manage several beaches ($249/mo).
>
> The first two come with a **14-day free trial**, no commitment. Want me to show you your beaches today? Just reply.
>
> Best,
> The Sargassum Watch team

## Notes d'implémentation (pour plus tard, hors scope de ce doc)

- Brancher un copy EN/ES dans `b2b-outreach.cjs` (`buildEmailHTML`) en fonction de `target.island` (florida/rivieramaya → EN, puntacana → ES/EN). Aujourd'hui, tout island ≠ `gp` retombe sur le template FR/Martinique.
- Créer les Payment Links / prix Stripe correspondants (3 produits × 2 devises × mensuel/annuel) puis les référencer dans `regions/<id>.json`.
- Le white-label widget : ajouter un flag `?brand=<id>&hideLogo=1` au widget existant `public/widget/embed`, servi uniquement aux clients payants (token).
- L'API : exposer la donnée déjà publique `public/api/copernicus/sargassum.json` derrière une clé pour le tier 3 (compteur d'appels, pas de nouveau pipeline).
