# Le Veilleur — Veille côtière (B2B) — EN CONSTRUCTION

> ⚠️ Offre en cours de définition, non câblée. Les paliers ci-dessous (Brief / Pro / Territory) sont une direction de travail, PAS un produit live : pas de white-label livrable aujourd'hui, pas d'essai promis, pas de Payment Link créé. L'action B2B aujourd'hui = « parlons-en ». On vend ce qui existe.

> Doc de référence pour la prospection B2B sortante (`b2b-outreach.cjs` + `data/b2b-targets.json`).
> Cible : hôtels de bord de mer, clubs de plage, offices de tourisme, mairies littorales.
> Zones : Martinique (mq), Guadeloupe (gp), Riviera Maya (rivieramaya), Punta Cana (puntacana), Miami / Floride (florida).
> But : transformer le trafic B2B (1 hôtel installé spontanément le widget, anoli-lodges) en revenu récurrent.

## Le réveil : pourquoi un veilleur côtier

- **La douleur, en langage d'exploitant.** Une plage envahie un matin = des clients déçus, des avis négatifs, parfois des remboursements — et vous l'apprenez souvent en même temps qu'eux. Le déclic : avec Le Veilleur, vous devenez celui qui connaît la fin de l'histoire avant ses clients. L'alerte arrive AVANT les sargasses.
- **Un projet né ici, pas un SaaS hors-sol.** Le Veilleur est indépendant, opéré depuis la Martinique, sur des données publiques et auditables (Copernicus Marine, NOAA). Le même satellite qui veille la mer pour le voyageur peut veiller votre rivage — et il regarde la mer, jamais vos visiteurs.
- **La donnée existe déjà.** Indice AFAI par plage, croisé 4×/jour, prévision J+1→J+7, 136+ plages sur 5 régions, infra de diffusion en place. Le coût marginal d'un rivage de plus est proche de zéro.
- **La demande s'est montrée seule.** Un hôtel a installé le widget public sans qu'on le lui demande — le besoin existe ; reste à le servir proprement, une fois le produit câblé.

## Les 3 paliers (en cours de définition — non câblés)

### 1. Brief — la dépêche du matin pour votre rivage (entrée de gamme)
Chaque matin, l'état réel des 3 à 5 plages les plus proches de votre établissement : indice AFAI mesuré au satellite, tendance, prévision J+1→J+7, et l'alerte « le matin où ça bascule » — avant l'échouage, pas après.
- **Cible** : petits hôtels, gîtes, clubs de plage, restaurants de bord de mer.
- **Valeur** : répondre à « y a-t-il des sargasses aujourd'hui ? » avec une donnée datée et auditable, et prévenir le client avant l'arrivée des algues — zéro surprise, zéro déception.
- **Prix de référence** (direction, non câblé) :
  - EUR (MQ/GP) : **29 €/mois** ou **290 €/an**.
  - USD (Riviera Maya / Punta Cana / Floride) : **$39/mois** ou **$390/an**.

### 2. Pro — la preuve sur votre site (cœur de gamme)
L'état de vos plages affiché sur votre site / page de réservation, à vos couleurs, pour rassurer le visiteur AVANT qu'il réserve — la preuve datée plutôt qu'un adjectif. (Widget aux couleurs de l'établissement : piste de travail, pas un livrable promis aujourd'hui — voir « Cadre honnête ».)
- **Cible** : hôtels avec site propre, offices de tourisme, résidences hôtelières.
- **Valeur** : lever l'incertitude au moment de la décision (moins d'incertitude = moins d'abandon), et faire de la transparence un argument de vente.
- **Inclus (cible)** : affichage à vos couleurs + le Brief (palier 1) + badge « plage veillée au satellite ».
- **Prix de référence** (direction, non câblé) :
  - EUR : **79 €/mois** ou **790 €/an**.
  - USD : **$99/mois** ou **$990/an**.

### 3. Territory — tout le littoral, baie par baie (haut de gamme)
Pour les **mairies, offices de tourisme et groupes hôteliers** qui veillent plusieurs plages à la fois : la même mer, lue crique par crique sur tout votre territoire.
- rapport quotidien (PDF/email) couvrant TOUTES les plages de la commune ou du portefeuille, baie par baie — pas une moyenne qui lisse la côte ;
- accès **API JSON** (même format que `public/api/copernicus/sargassum.json`) pour vos propres écrans / affichages / apps ;
- historique + export pour le reporting (saison sargasses, communication publique, demandes d'aide / subventions).
- **Cible** : mairies littorales (Sainte-Anne, Le Gosier, Playa del Carmen, Miami Beach…), offices de tourisme, groupes hôteliers.
- **Prix de référence** (direction, non câblé) :
  - EUR : **199 €/mois** ou **1 990 €/an**.
  - USD : **$249/mois** ou sur devis.

## Grille récap (prix de référence — paliers non câblés)

| Palier      | EUR (MQ/GP)          | USD (US/MX/DR)        | Cible type                              |
|-------------|----------------------|-----------------------|-----------------------------------------|
| 1. Brief    | 29 €/mo · 290 €/an   | $39/mo · $390/an      | Petit hôtel, gîte, club, resto plage    |
| 2. Pro      | 79 €/mo · 790 €/an   | $99/mo · $990/an      | Hôtel avec site, résidence, office      |
| 3. Territory| 199 €/mo · 1 990 €/an| $249/mo · sur devis   | Mairie, office, groupe hôtelier         |

État réel : ces paliers sont **en cours de définition et NON câblés** (pas de Payment Link, pas de white-label livrable, pas d'essai promis). Aucune facturation B2B active aujourd'hui. L'action B2B aujourd'hui = **« parlons-en »**, sur preuve datée avant pitch.

## Pitch email (premier contact, consultatif)

Le `b2b-outreach.cjs` envoie déjà UN email consultatif gratuit (« voyez l'état de vos plages en direct »). Ce doc décrit l'**upsell payant** quand l'établissement répond / clique. Le fondateur prend le relais humain sur les réponses chaudes.

**Objet** : Vos plages, surveillées au satellite — pour vos clients

**Corps (FR, MQ/GP)** — preuve avant pitch, ask honnête :

> Bonjour,
>
> La première question d'un client avant de réserver chez vous, c'est souvent : « est-ce qu'il y a des sargasses sur la plage ? ». Et une plage envahie un matin, vous l'apprenez parfois en même temps que lui : avis négatif, déception, parfois remboursement.
>
> On ne va pas vous le promettre, on va vous le montrer. Le Veilleur est un satellite qui veille la mer (données publiques Copernicus Marine + NOAA, indice par plage, croisé 4×/jour) — il regarde la mer, jamais vos visiteurs. Voici l'état réel des plages autour de chez vous aujourd'hui, daté : [aperçu]. Avec la prévision J+1→J+7, vous prévenez le client AVANT l'arrivée des algues.
>
> Et on est honnêtes jusqu'au bout : notre taux d'erreur est publié et audité chaque jour, par régime. En saison calme, 100 % de nos prévisions « mer propre » se sont vérifiées (2 805 contrôles, 2026-05-19 → 2026-06-18) ; tous régimes confondus on tourne autour de 75-78 %, et les rares alertes de saison calme sont affichées en faible confiance. Vous voyez nos réussites comme nos limites — c'est précisément ce que les outils gratuits ne publient pas.
>
> L'offre pour les établissements est en cours de finition (paliers Brief / Pro / Territory, à partir de 29 €/mois). Aujourd'hui, le mieux : parlons-en. Je vous montre l'état de vos plages en direct quand vous voulez — répondez simplement à cet email.
>
> Bien à vous,
> Le Veilleur · veille côtière opérée depuis la Martinique

**Corps (EN, Miami / Riviera Maya / Punta Cana)** — à brancher quand le copy EN/ES sera prêt côté `b2b-outreach.cjs` (aujourd'hui le template retombe sur le FR/MQ pour les island US) :

> Hi,
>
> The first question a guest asks before booking is often: "is there sargassum on the beach right now?" And when a beach gets buried overnight, you often find out at the same time they do — a bad review, a let-down guest, sometimes a refund.
>
> We won't promise it, we'll show it. Le Veilleur is a satellite that watches the sea (public Copernicus Marine + NOAA data, per-beach index, cross-checked 4×/day) — it watches the sea, never your guests. Here's the real, dated state of the beaches near you today: [preview]. With the J+1→J+7 forecast, you warn the guest BEFORE the seaweed lands.
>
> And we stay honest all the way: our miss rate is published and audited every day, by regime. In calm season, 100% of our "clean water" forecasts proved correct (2,805 checks, 2026-05-19 → 2026-06-18); across all regimes we run ~75-78%, and the rare calm-season alerts are flagged low-confidence. You see our wins and our limits — exactly what the free tools don't publish.
>
> The offer for businesses is still being finalized (Brief / Pro / Territory tiers, from $39/mo). Today, the best step: let's talk. I'll show you your beaches live whenever you like — just reply.
>
> Best,
> Le Veilleur · coastal watch, operated from Martinique

## Pour câbler l'offre (ce qui manque avant de la rendre live)

Tant que ces points ne sont pas faits, l'offre reste « en construction » et l'ask est « parlons-en ». Ne jamais promettre un essai, un white-label ou un prix « disponible » avant ça.

- Brancher un copy EN/ES dans `b2b-outreach.cjs` (`buildEmailHTML`) selon `target.island` (florida/rivieramaya → EN, puntacana → ES/EN). Aujourd'hui, tout island ≠ `gp` retombe sur le template FR/Martinique.
- Créer les Payment Links / prix correspondants (3 paliers × 2 devises × mensuel/annuel) puis les référencer dans `regions/<id>.json`. (B2C neuf = Mollie pass-only ; le B2B récurrent reste à trancher techniquement — ne pas réutiliser les liens USD Stripe désactivés.)
- Le palier Pro (affichage à vos couleurs) : ajouter un flag `?brand=<id>&hideLogo=1` au widget `public/widget/embed`, servi uniquement aux clients payants (token). Tant que non livré, ne pas l'annoncer comme white-label.
- L'API (palier Territory) : exposer la donnée publique `public/api/copernicus/sargassum.json` derrière une clé (compteur d'appels, pas de nouveau pipeline).
