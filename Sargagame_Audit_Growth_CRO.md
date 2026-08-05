# Audit Growth & CRO — Sargagame
### Head of Growth / Product Analytics — analyse décisionnelle à partir de l'export GA4 réel

**Périmètre analysé :** Google Sheet `Sargasses Emails` (13 onglets), export du **2026-08-02**
**Période couverte :** 2026-03-20 → 2026-08-02 (135 jours, activité réelle sur 118 jours)
**Volume :** 173 354 événements analytics, 20 paiements, 15 événements d'abonnement, 519 emails capturés, 3 797 emails envoyés, 960 relevés de plages sur 142 plages

---

## 0. À lire avant tout — ce que les données permettent et ne permettent pas

Conformément à votre consigne, chaque affirmation ci-dessous est étiquetée **[Observé]**, **[Hypothèse]** ou **[Donnée manquante]**. Avant le détail, voici la limite structurelle la plus importante du dataset :

> **[Observé] Il n'existe aucun identifiant utilisateur ou session persistant.** Le champ `session_id` n'est renseigné que sur 35 lignes (les événements `sg_conversion`), avec seulement 8 valeurs distinctes — dont la moitié sont des placeholders littéraux (`"direct"`, `"pass"`) et non de vrais identifiants. Il n'y a ni `user_pseudo_id`, ni `client_id`, ni cookie tracké. **Conséquence : impossible de reconstruire un funnel par utilisateur, un taux de rétention réel, un DAU/MAU, ou un temps moyen avant conversion à l'échelle individuelle.** Tout ce qui suit sur le "funnel" est un funnel **par volume d'événements** (proxy agrégé), pas un funnel séquentiel par visiteur. Je le signale à chaque fois que c'est pertinent plutôt qu'une seule fois ici, pour que ça ne se perde pas en cours de lecture.

Autres angles morts confirmés en creusant les 13 onglets :
- **[Donnée manquante]** Aucun champ device, navigateur, OS, pays (géolocalisation IP), ni source/medium/campagne UTM nulle part dans `analytics_events`. Seul un champ `island` (région produit, pas géo utilisateur) et un champ `source` contextuel (ex. `map_world`, `inline-beach`) existent par endroits.
- **[Observé]** Aucun événement ne trace les étapes "Landing SEO", "Carte SVG", "Fiche plage" telles que décrites dans votre funnel cible. Le seul événement de type "vue de page" (`sg_view`) ne couvre que la page "À propos" (127 occurrences sur 173k événements).
- **[Observé]** 69 flags A/B distincts coexistent dans les événements (`ab_pw_alertes`, `ab_landing_funnel`, `ab_exitcap`, etc.), sans lien vers un identifiant stable → impossible de mesurer l'uplift réel d'un seul de ces tests.

Le reste du rapport s'appuie exclusivement sur ce qui est mesurable dans ces conditions.

---

## 1. Vue d'ensemble

| Indicateur | Valeur | Statut |
|---|---|---|
| Sessions (proxy `sg_session_start`) | 140 291 | Observé |
| Utilisateurs uniques | Non calculable | Donnée manquante (pas d'ID) |
| Événements totaux | 173 354 (34 types distincts) | Observé |
| Sessions "retour" (`is_returning=true`) | 89 097 / 137 151 renseignées = **65,0 %** | Observé (proxy déclaratif client, pas un vrai cookie vérifié) |
| Sessions avec statut premium actif | 1 263 / 140 291 = **0,9 %** | Observé |
| Répartition mobile / desktop | — | Donnée manquante |
| Navigateurs | — | Donnée manquante |
| Pays des visiteurs | — | Donnée manquante |
| Sources de trafic (UTM, referrer) | — | Donnée manquante |
| Répartition géographique produit (`island`) | GP 49,5 % · MQ 38,0 % · Florida 7,3 % · Punta Cana 3,3 % · Riviera Maya 2,1 % | Observé |

**Signal fort et récurrent : l'expansion hors MQ/GP est réelle et déjà significative.** Le contexte produit fourni ne mentionne que Martinique/Guadeloupe, mais trois sources indépendantes convergent :
- Sessions analytics : 12,7 % hors MQ/GP
- Emails captés : 22,0 % hors MQ/GP (77 Florida + 27 Punta Cana + 10 Riviera Maya sur 519)
- Plages suivies (`beach_reports`) : 11,0 % hors MQ/GP (83 Florida + 19 Punta Cana + 5 Riviera Maya sur 960)

**[Hypothèse]** Soit une expansion géographique volontaire non documentée dans le brief que vous m'avez donné, soit un déploiement multi-marché en cours de test. Dans les deux cas, c'est un fait produit assez important pour être vérifié avec l'équipe avant toute décision — voir section Anomalies.

---

## 2. Funnel complet

### 2.1 Funnel observable (comptage d'événements, pas de déduplication par utilisateur possible)

| Étape | Événement | Volume | Taux vs étape précédente | Taux vs sessions |
|---|---|---:|---:|---:|
| 1. Session démarrée | `sg_session_start` | 140 291 | — | 100 % |
| 2. Paywall affiché | `sg_premium_modal_open` | 16 260 | 11,6 % | 11,6 % |
| 3. Clic CTA paywall | `sg_premium_modal_cta` | 251 | **1,54 %** | 0,18 % |
| 4. Redirection checkout (Mollie) | `sg_checkout_redirect` | 227 | 90,4 % | 0,16 % |
| 5. Conversion trackée in-app | `sg_conversion` | 35 | 15,4 % | 0,025 % |
| 6. Paiement réel confirmé (source de vérité = onglet `payments`, dédupliqué) | — | **14** | 40 % de l'étape 5 | 0,01 % |

**Le point de friction le plus violent, de loin : étape 2 → 3 (paywall affiché → clic CTA), avec 98,5 % d'abandon.** C'est là que se joue l'essentiel de la perte, pas au checkout (qui, lui, convertit plutôt bien : 90 % des clics CTA vont jusqu'à la redirection de paiement).

**[Observé] Écart entre `sg_conversion` (35) et paiements réels confirmés (14) : le tracking de conversion sur-compte d'un facteur ~2,5x.** Vraisemblablement parce que `sg_conversion` se déclenche aussi pour des passes gratuits/tests ou se déclenche en double sur un même paiement (voir section Anomalies pour les doublons identifiés côté paiements). À vérifier avec l'équipe engineering avant d'utiliser cet événement comme métrique de pilotage.

### 2.2 Ce qui manque dans ce funnel par rapport à votre brief

Votre funnel cible est : *Landing SEO → Carte SVG → Fiche plage → Verdict gratuit → Paywall → Checkout Mollie → Premium activé*.

**[Observé]** Sur les 6 premières étapes, seule "Paywall" est directement instrumentée. Il n'existe **aucun événement dédié** pour landing, carte, fiche plage ou verdict gratuit. Le paywall (`sg_premium_modal_open`) se déclenche en réalité majoritairement (**59,5 %**, 9 669 occurrences) via un trigger **temporel automatique** (`source: engagement_50s` — 50 secondes passées sur le site), pas via une action de contenu (voir 5.1). Ça veut dire qu'on ne peut pas dire aujourd'hui combien d'utilisateurs voient effectivement la carte, une fiche plage, ou un verdict avant de convertir ou d'abandonner — c'est un vrai trou dans l'instrumentation du haut de funnel, pas juste un détail technique.

### 2.3 Tendance mensuelle — le signal le plus important du rapport

| Mois | Sessions | Paywall ouvert | Taux ouverture | `sg_conversion` | Taux conversion / sessions |
|---|---:|---:|---:|---:|---:|
| Avril 2026 | 25 631 | 3 114 | 12,1 % | 8 | 0,031 % |
| Mai 2026 | 26 496 | 5 601 | **21,1 %** | 7 | 0,026 % |
| Juin 2026 | 35 401 | 3 765 | 10,6 % | 16 | **0,045 %** |
| Juillet 2026 | 48 985 | 3 440 | 7,0 % | 4 | **0,0082 %** |
| Août 2026 (2 jours) | 3 777 | 340 | 9,0 % | — | partiel |

**[Observé] Juillet est le mois avec le plus de trafic jamais enregistré (+38 % vs juin, +91 % vs avril) et, simultanément, le taux de conversion le plus bas de toute la période (5x inférieur à juin).** Le taux d'exposition au paywall (opens/sessions) est aussi en baisse continue depuis mai (21,1 % → 10,6 % → 7,0 %). La croissance du trafic ne se traduit pas en croissance du revenu — elle se dilue.

**[Hypothèse]** Trois causes possibles, à trancher avec les données produit/marketing que je n'ai pas : (a) les nouvelles sources de trafic de juillet amènent des visiteurs à plus faible intention d'achat (ex. SEO longue traîne peu qualifié, ou expansion géographique Florida/Punta Cana où le produit est moins mature) ; (b) un changement produit a réduit le déclenchement du paywall ou sa pertinence ; (c) juillet correspond à un pic saisonnier de recherche sargasses qui amène des visiteurs "juste pour vérifier une plage" sans intention de payer. **C'est la question n°1 à investiguer cette semaine.**

---

## 3. Analyse acquisition

### 3.1 Ce qui est mesurable : la capture d'emails comme proxy d'acquisition

Faute de source/medium/UTM dans les événements produit, le seul proxy d'acquisition disponible est l'onglet `Emails` (519 captures) :

| Source de capture | Volume | Part |
|---|---:|---:|
| `map_world` (carte) | 210 | 40,5 % |
| `inline-beach` (fiche plage) | 152 | 29,3 % |
| `exit_intent` (popup sortie) | 69 | 13,3 % |
| `weekend-landing` | 36 | 6,9 % |
| `beach_alert` | 17 | 3,3 % |
| Signaux B2B (`b2b_pro`, `b2b_trial`, `b2b_collectivite_request`, `b2b_hotel_request`) | 6 | 1,2 % |
| Autres (pay_intent, onsite_wallet/checkout, manuel…) | 29 | 5,6 % |

**[Observé]** La carte et les fiches plages génèrent à elles seules 70 % des captures email — ce sont vos meilleures pages d'engagement, cohérent avec la proposition de valeur (prévision par plage).

**[Observé]** Le pipeline B2B existe mais est embryonnaire : 6 leads captés sur 519 (1,2 %), pour une offre positionnée à 79€/mois-690€/an. Autrement dit, la stratégie B2B est documentée mais quasi non-instrumentée et non-testée à ce stade — voir section Pricing.

### 3.2 Ce qui n'est pas mesurable
**[Donnée manquante]** Trafic qui convertit / trafic inutile, opportunités SEO par requête, performance par device/navigateur/pays : rien de tout ça n'est calculable sans Search Console croisé à un identifiant de session, ou sans UTM sur les événements produit. Vous avez mentionné avoir des exports Search Console — je peux les croiser si vous me les partagez, mais ils ne contiennent que des données de clics/impressions Google, pas de comportement post-clic.

---

## 4. Analyse UX comportementale

### 4.1 Signal de friction directe (rage clicks)
**[Observé]** L'événement `sg_friction` (type `"rage"`) a été déclenché 1 030 fois, concentré sur deux écrans : `world` (la carte/vue monde) et `mapintro`. C'est un signal comportemental fort et sous-exploité : ces utilisateurs cliquent frénétiquement, signe de confusion ou de composant qui ne répond pas. Recommandation en section 9.

### 4.2 Comportement au paywall
**[Observé]** Sur les fermetures de paywall où la donnée est connue (`via`) : 81,5 % ferment via le bouton X (fermeture volontaire et rapide), le reste via `prelude_close`/`hot_close`. Le temps passé avant fermeture (`time_spent`) a une **médiane de 3 secondes** contre une moyenne de 219 secondes — la distribution est donc extrêmement asymétrique : la grande majorité des gens regardent 3 secondes et partent, une minorité reste très longtemps (onglet resté ouvert en arrière-plan, très probablement, plutôt qu'une vraie lecture attentive de 3-4 minutes).

### 4.3 Nouveaux vs récurrents
**[Observé]** 65 % des sessions sont marquées "retour" (`is_returning=true`). C'est un bon signal d'engagement organique — les gens reviennent sur le produit sans qu'on puisse dire s'ils reviennent 2 fois ou 50 fois (pas d'ID pour compter la fréquence individuelle).

### 4.4 Mobile vs desktop
**[Donnée manquante]** Aucun champ device nulle part dans les 173k événements. Impossible de répondre à cette partie du brief sans ajouter ce paramètre au tracking (device_type, viewport, ou user-agent parsé) — c'est un gain rapide à instrumenter, à faible coût engineering.

---

## 5. Analyse paywall

### 5.1 Le paywall se déclenche majoritairement par le temps, pas par l'intention

| Source du déclenchement (`sg_premium_modal_open.source`) | Volume | Part |
|---|---:|---:|
| `engagement_50s` (timer 50s passées sur site) | 9 669 | 59,5 % |
| `map_scrub_forecast` (interaction carte/prévision) | 2 065 | 12,7 % |
| `chasse_detail` + `chasse_detail_fc` | 2 087 | 12,8 % |
| `forecast` | 413 | 2,5 % |
| `archipel` | 251 | 1,5 % |
| `forecast_teaser` | 182 | 1,1 % |
| Autres (deeplink, urgency_banner, beach_sheet, beach_story…) | ~1 590 | 9,9 % |

**[Observé] Les paiements réels que j'ai pu attribuer à une source de paywall (via le champ `ref` de l'onglet `payments`) proviennent de triggers orientés contenu — `chasse_detail_fc`, `map_scrub_forecast`, `forecast_teaser` — pas du timer `engagement_50s`.** Le timer génère 6 fois plus de volume que les triggers contenu réunis mais n'apparaît dans aucune référence de paiement confirmé. **[Hypothèse]** Le paywall déclenché par le temps interrompt sans contexte d'achat ("vous êtes là depuis 50s, achetez") alors que le paywall déclenché par le contenu arrive au moment où l'utilisateur veut activement une info précise (verdict d'une plage). C'est cohérent avec le taux de clic CTA catastrophique de 1,54 % : la majorité des impressions de paywall sont mal positionnées dans le parcours.

### 5.2 Le plan annuel ne convertit jamais
**[Observé]** Sur les redirections checkout trackées, 47 (20,7 %) concernent un plan `annual`. **Aucun paiement réel avec un plan annuel n'apparaît dans l'onglet `payments`** (tous les montants observés — 4,99€, 7,99€, 14,99€, 5,99$, 11,99$ — correspondent à des offres mensuelles ou des pass ponctuels p7/p30/p120). Taux de conversion du plan annuel sur la période observée : **0 %**. **[Hypothèse]** Soit un frein psychologique/prix sur l'engagement annuel, soit un bug empêchant la finalisation de ce paiement précis — à tester en priorité (P0, section 9), car c'est un signal net et vérifiable, pas une extrapolation.

### 5.3 Avant ou après le paywall ?
Le problème est **avant** le paywall (déclenchement + pertinence du moment) largement plus qu'après : une fois le CTA cliqué, 90,4 % des utilisateurs vont jusqu'à la redirection de paiement (peu de perte), et le checkout Mollie lui-même semble bien finaliser (aucune preuve de blocage technique côté Mollie dans les données). La perte se joue à 98,5 % entre "voir le paywall" et "cliquer dessus".

---

## 6. Analyse pricing / offres

### 6.1 Grille de prix observée dans les paiements réels

| Référence (`ref`) | Prix | Devise | Occurrences réelles |
|---|---:|---|---:|
| Abonnement mensuel (onsite, sans ref) | 4,99 | € | 2 |
| `gp_monthly_forecast_teaser` / `gp_monthly_map_scrub_forecast` | 4,99 | € | 2 |
| `mq_p7_map_scrub_forecast` / `mq_p7_chasse_detail_fc` (pass 7 jours) | 7,99 | € | 2 (dédupliqué) |
| `mq_p30_map_scrub_forecast` (pass 30 jours) | 14,99 | € | 1 |
| `gp_p7_map_scrub_forecast` (pass 7 jours) | 7,99 | € | 1 |
| `florida_p30_deeplink` | 11,99 | $ | 1 |
| `florida_p7_chasse_detail_fc` | 5,99 | $ | 1 |

**[Observé] Anomalie de structure de prix concrète : l'abonnement mensuel (4,99€, reconductible, accès continu) coûte moins cher que le pass 7 jours (7,99€, accès limité dans le temps).** Un acheteur rationnel n'a aucune raison de prendre le pass 7 jours plutôt que l'abonnement mensuel — c'est strictement moins avantageux à prix quasi égal. C'est un cas typique de **cannibalisation par construction de la grille de prix**, pas juste une hypothèse : les chiffres parlent d'eux-mêmes une fois les deux offres mises côte à côte.

### 6.2 B2B : stratégie documentée, zéro revenu observé
**[Observé]** Les tarifs B2B (79€/mois, 690€/an) que vous mentionnez n'apparaissent dans aucune ligne de l'onglet `payments`. Le seul signal B2B présent est en amont du funnel : 6 leads captés + une trentaine d'emails B2B envoyés (`b2b_pro`, `b2b_b0/b2/b6/b13`, `b2b_collectivite_request`, `b2b_hotel_request`). **[Donnée manquante]** Impossible de savoir si ces leads ont été relancés commercialement en dehors du produit (call, devis manuel) — si c'est le cas, ce revenu existerait mais serait invisible dans ce dataset.

### 6.3 Comparaison des offres — ce qui est demandé mais non calculable
**[Donnée manquante]** Un vrai comparatif de performance par offre (taux de conversion par plan, LTV par plan) nécessiterait un funnel avec plan visible à chaque étape (pas seulement au paiement) et un identifiant utilisateur — les deux manquent ici. Ce que je peux affirmer avec les 14 transactions réelles : le pass 7 jours (mentionné dans 4 des 14 transactions déduplquées) est l'offre la plus fréquente dans cet échantillon, mais l'échantillon est trop petit (14 événements) pour en tirer une conclusion statistique fiable — c'est un constat descriptif, pas un résultat de test.

---

## 7. Cohortes

### 7.1 Ce qui est mesurable malgré l'absence d'ID
En croisant les emails de l'onglet `payments` avec les dates de capture de l'onglet `Emails` (10 correspondances sur 14 transactions réelles) :

| Client | Source de capture | Délai capture → paiement |
|---|---|---:|
| 8 clients sur 10 matchés | `pay_intent`, `onsite_checkout`, `inline-beach`, `hero_inline` | **< 1 heure** (souvent < 1 minute) |
| jcroulier@gmail.com | `beach_alert` | 12,8 jours |
| williamswingle@comcast.net | `map_world` | 11,1 jours |

**[Observé] 80 % des conversions matchées se font dans la même session que la capture d'email — l'achat est majoritairement un acte impulsif immédiat, pas le fruit d'une séquence de nurture.** Seuls 2 cas sur 10 montrent un délai de plus d'une semaine. **[Hypothèse forte, bien étayée]** Ça remet en question le ROI attendu de la séquence drip email (j3/j7/j14/j21 — 1 554 envois observés) sur la conversion payante : si l'essentiel de l'achat se joue en session, l'investissement marginal le plus rentable est probablement l'expérience on-site au moment du paywall, pas l'enrichissement de la séquence email. **[Donnée manquante]** Je ne peux pas exclure que le drip génère du revenu que je ne peux pas tracer (retour via lien direct sans re-capture d'email) — un simple paramètre UTM sur les liens des emails de drip réglerait cette incertitude.

### 7.2 Ce qui n'est pas mesurable
**[Donnée manquante]** Rétention réelle (utilisateur revient J+7, J+30), LTV par cohorte d'acquisition, churn réel des abonnements récurrents (l'onglet `subscription_events` ne couvre que 15 événements, dont 11 échecs de paiement concentrés sur un compte de test interne — voir Anomalies) : aucun de ces calculs n'est fiable sur cet échantillon.

---

## 8. Anomalies détectées

Classées par impact décisionnel :

1. **[Observé — impact revenu]** Paiements en double : `tr_VzYFK5ihNua7Wq4fWyETJ` (jcroulier@gmail.com, 7,99€) et `tr_3nxkaEMuRfPM2TWLXQeTJ` apparaissent chacun **deux fois**, à quelques centaines de millisecondes d'écart, même montant, même référence — signature classique d'un double déclenchement de webhook Mollie, pas d'un double achat volontaire. Si votre reporting revenu ne déduplique pas déjà là-dessus, il surestime le CA d'au moins 15,98€ sur cet échantillon.
2. **[Observé — impact revenu/support]** Deux clients (yohannbarillet@yahoo.fr, francois.courteau@gmail.com) ont payé deux fois à quelques minutes/heures d'écart avec des `session_id` **différents** (donc deux transactions Stripe distinctes, pas un doublon technique) — à vérifier auprès d'eux, ce sont potentiellement deux vrais remboursements à faire.
3. **[Observé — qualité de données]** Une transaction en mode test Stripe (`cs_test_...`) est enregistrée avec le statut `paid` dans l'onglet production `payments`, au même titre que les vraies transactions.
4. **[Observé — qualité de données]** Un événement d'abonnement porte l'ID `in_TEST_deploy_v24_delete_me` — un enregistrement de test explicitement nommé "à supprimer" qui ne l'a jamais été.
5. **[Observé — impact fiabilité paiement]** 11 des 15 lignes de `subscription_events` sont des `invoice.payment_failed`, et 6 d'entre elles proviennent du même compte (`yacovassaraf@gmail.com` / variante `yacovawsaraf@gmail.com`) sur une fenêtre d'une heure le 26 juin — cohérent avec du test interne plutôt que du vrai churn client, mais si ce n'est pas du test, c'est un taux d'échec de paiement alarmant à investiguer immédiatement.
6. **[Observé — qualité de données]** Deux adresses email dans `subscription_events` sont stockées avec des guillemets littéraux inclus (`"egoursaud@wanadoo.fr"`) — bug d'échappement CSV/JSON qui casse toute jointure email vers ces lignes.
7. **[Observé — instrumentation]** 4 276 lignes de `analytics_events` sont des doublons exacts (même date, même événement, mêmes paramètres) — sur-comptage probable côté client (double envoi réseau) affectant tous les totaux d'événements de quelques points de pourcentage.
8. **[Observé — instrumentation]** Dans `email_events`, le nombre d'emails "ouverts" (907) dépasse le nombre d'emails "délivrés" (836) — incohérence logique (on ne peut pas ouvrir plus d'emails qu'il n'en a été délivré), signe d'un pipeline de tracking emails qui perd des événements `delivered` plus souvent que des événements `opened`.
9. **[Observé — instrumentation]** 2 événements sont datés dans le futur par rapport à la date d'export (2026-08-03 07:46 alors que l'export date du 2026-08-02) — probablement un simple décalage de fuseau horaire, mais à vérifier si votre pipeline dépend d'un cutoff strict par date.
10. **[Observé — gouvernance produit]** 69 flags A/B actifs simultanément dans la même fenêtre de données, sans identifiant utilisateur stable pour mesurer l'effet d'aucun d'entre eux. Ce n'est pas un problème de données mais un problème de process : à ce niveau de multiplicité, même avec un bon tracking utilisateur, la puissance statistique de chaque test individuel serait très faible et les effets d'interaction entre tests seraient ingérables.
11. **[Observé]** Le champ `unsubscribed` de l'onglet `Emails` est vide sur 100 % des 519 lignes (aucune valeur `TRUE`/`FALSE` renseignée) — soit personne ne s'est jamais désabonné (peu probable), soit le champ n'est simplement pas câblé.
12. **[Observé]** L'onglet `feedback` ne contient qu'**une seule ligne** (note 4/5, sans commentaire) malgré 3 demandes de feedback envoyées — la collecte de feedback qualitatif est quasiment à l'arrêt.

---

## 9. Roadmap CRO — backlog priorisé

Pour chaque item : **problème observé / preuve / hypothèse / action / KPI attendu**.

### P0 — impact revenu élevé + effort faible (à faire cette semaine)

**P0.1 — Dédupliquer les paiements et auditer le revenu réel**
- *Problème observé* : au moins 2 paires de paiements dupliqués par double webhook, 1 transaction test comptée comme réelle, 1 ligne de test explicitement marquée "à supprimer".
- *Preuve* : section Anomalies #1, #3, #4.
- *Action* : ajouter une clé d'idempotence sur le webhook Mollie/Stripe (dédup par `session_id`/`transaction_id`), purger les lignes de test du dataset de reporting.
- *KPI attendu* : revenu reporté = revenu réel, à ±0€ d'écart la semaine suivante.

**P0.2 — Investiguer la chute de conversion de juillet malgré le pic de trafic**
- *Problème observé* : taux de conversion sessions→paiement 5x plus bas en juillet qu'en juin, alors que le trafic est au plus haut.
- *Preuve* : section 2.3.
- *Hypothèse* : dilution par du trafic à faible intention (nouvelles zones géo, SEO longue traîne) ou effet produit récent.
- *Action* : segmenter juillet par île/source dès que le tracking le permettra (voir P0.4) ; en attendant, comparer qualitativement les changements produit déployés fin juin/début juillet.
- *KPI attendu* : identifier la cause sous 1 semaine ; objectif de retour à ≥0,03 % de conversion sessions→paiement d'ici fin du mois suivant.

**P0.3 — Corriger la grille de prix pass 7 jours vs abonnement mensuel**
- *Problème observé* : le pass 7 jours (7,99€) coûte plus cher que l'abonnement mensuel (4,99€) pour moins de valeur.
- *Preuve* : section 6.1.
- *Action* : soit remonter le prix de l'abonnement mensuel, soit repositionner le pass 7 jours comme option "sans engagement" avec un prix cohérent (ex. entre l'abonnement et le pass 30 jours), soit fusionner les deux offres.
- *KPI attendu* : part de l'abonnement mensuel dans le mix d'offres, à suivre avant/après changement.

**P0.4 — Instrumenter device, plateforme et source de trafic (UTM)**
- *Problème observé* : impossible de répondre à 4 des 9 sections demandées (mobile/desktop, navigateur, pays, acquisition détaillée) faute de champs.
- *Action* : ajouter `device_type`, `platform`, `utm_source/medium/campaign` à l'objet de paramètres commun envoyé sur chaque événement (pas seulement au paiement).
- *KPI attendu* : couverture de ces champs sur >95 % des nouveaux événements sous 2 semaines.

**P0.5 — Investiguer le taux de conversion nul du plan annuel**
- *Problème observé* : 47 redirections checkout vers le plan annuel, 0 paiement confirmé.
- *Preuve* : section 5.2.
- *Action* : vérifier manuellement le tunnel de paiement annuel de bout en bout (test end-to-end), vérifier le prix affiché vs prix réellement facturé par Mollie/Stripe pour ce plan.
- *KPI attendu* : au moins 1 paiement annuel confirmé après correction, puis taux de conversion annuel > 0 %, mesuré en continu.

### P1 — impact revenu moyen/élevé, effort moyen (30-60 jours)

**P1.1 — Rééquilibrer le déclenchement du paywall vers l'intention plutôt que le temps**
- *Preuve* : section 5.1 (le trigger `engagement_50s` génère 59,5 % des impressions mais n'apparaît dans aucun paiement attribué).
- *Action* : réduire la fréquence/priorité du trigger temporel, renforcer les triggers contenu (`chasse_detail_fc`, `map_scrub_forecast`) qui, eux, convertissent.
- *KPI attendu* : taux de clic CTA du paywall (`sg_premium_modal_cta`/`sg_premium_modal_open`), objectif : sortir de 1,54 % vers un chiffre à un ordre de grandeur supérieur.

**P1.2 — Traiter les écrans à friction (rage clicks) : `world` et `mapintro`**
- *Preuve* : section 4.1, 1 030 événements `sg_friction` concentrés sur ces deux écrans.
- *Action* : session replay ou audit UX manuel ciblé sur ces deux écrans en priorité.
- *KPI attendu* : baisse du volume de `sg_friction` de 30 % en 60 jours.

**P1.3 — Réduire la dépendance au drip email, renforcer l'expérience on-site au paywall**
- *Preuve* : section 7.1 (80 % des conversions matchées se font en <1h de la capture email).
- *Action* : réallouer une partie de l'effort produit/design du drip (j14, j21 notamment, séquences longues) vers l'optimisation du modal paywall lui-même (copy, preuve sociale, urgence contextuelle).
- *KPI attendu* : taux de conversion du paywall en session (déjà suivi en P1.1), à comparer au taux de conversion attribuable au drip une fois les UTM en place (P0.4/P1.5).

**P1.4 — Nettoyer et fiabiliser le pipeline emails**
- *Preuve* : section 8, anomalies #6, #8, #11.
- *Action* : corriger l'échappement des emails, réconcilier `delivered`/`opened`, câbler le champ `unsubscribed`.
- *KPI attendu* : cohérence `delivered ≥ opened ≥ clicked` restaurée à 100 %.

**P1.5 — Ajouter des UTM aux liens des emails de drip et de relance de panier**
- *Preuve* : section 7.1 (incertitude explicitement notée sur l'attribution du drip).
- *Action* : paramètres UTM systématiques sur `daily_verdict`, `drip_j3/j7/j14/j21`, `cart_recovery_*`.
- *KPI attendu* : % de paiements attribuables à une source email connue (actuellement non mesurable).

**P1.6 — Documenter et probablement geler une partie des 69 tests A/B actifs**
- *Preuve* : section 8, anomalie #10.
- *Action* : inventaire des tests actifs avec propriétaire et date de fin prévue ; arrêter les tests sans hypothèse claire ou sans propriétaire identifié.
- *KPI attendu* : nombre de tests A/B actifs simultanément, cible < 5-8 pour retrouver une puissance statistique exploitable une fois l'ID utilisateur en place.

### P2 — impact plus long terme ou effort plus élevé (60-180 jours)

**P2.1 — Mettre en place un identifiant utilisateur/session persistant**
- *Action* : `user_pseudo_id` (cookie/local storage) propagé sur tous les événements. C'est le prérequis technique à peu près tout ce qui est demandé en section Cohortes et qui ne peut pas être fait aujourd'hui.
- *KPI attendu* : couverture > 95 % des sessions avec un ID stable.

**P2.2 — Explorer la piste B2B avec un vrai test payant**
- *Preuve* : section 6.2 (6 leads, 0 revenu confirmé).
- *Action* : contact commercial direct sur les 6 leads existants + les ~30 emails B2B envoyés, avant d'investir davantage en amont de funnel B2B.
- *KPI attendu* : premier paiement B2B confirmé, ou apprentissage qualitatif sur le frein.

**P2.3 — Valider ou clarifier l'expansion Florida / Punta Cana / Riviera Maya**
- *Preuve* : section 1 (12-22 % du volume selon la source, hors du périmètre annoncé).
- *Action* : confirmer avec l'équipe produit si c'est un test volontaire ; si oui, l'isoler dans le reporting pour ne pas polluer les métriques MQ/GP.
- *KPI attendu* : reporting segmenté par marché disponible.

**P2.4 — Restaurer la collecte de feedback qualitatif**
- *Preuve* : section 8, anomalie #12 (1 seule réponse sur 519 utilisateurs captés).
- *Action* : revoir le déclenchement des demandes de feedback (actuellement quasi jamais envoyées).
- *KPI attendu* : > 20 réponses de feedback par mois.

---

## 10. Conclusion CTO / Growth

### Les 5 actions qui peuvent probablement augmenter le CA le plus vite

1. **Corriger la grille de prix pass 7 jours / mensuel (P0.3)** — c'est gratuit à changer et supprime une cannibalisation qui coûte du revenu tous les jours depuis le lancement.
2. **Diagnostiquer la chute de conversion de juillet (P0.2)** — vous perdez proportionnellement plus de revenu sur votre mois de plus fort trafic ; corriger ça a plus de levier que n'importe quelle optimisation marginale ailleurs.
3. **Rééquilibrer le trigger du paywall vers l'intention plutôt que le temps (P1.1)** — le levier avec le ratio effort/impact le plus favorable : 98,5 % de perte à une seule étape, avec une cause déjà identifiée dans les données.
4. **Réparer le tunnel de paiement annuel (P0.5)** — 47 tentatives, 0 conversion, c'est soit un revenu perdu pur, soit un bug à corriger en une itération.
5. **Dédupliquer et auditer le pipeline de paiement (P0.1)** — pas un levier de croissance en soi, mais un prérequis pour que toutes les décisions suivantes s'appuient sur des chiffres fiables.

### Métriques à suivre chaque semaine à partir de maintenant

1. Sessions (`sg_session_start`) — volume et tendance
2. Taux paywall affiché / sessions
3. **Taux clic CTA / paywall affiché** — métrique la plus critique du funnel actuellement
4. Taux checkout redirigé / CTA cliqué
5. Paiements réels confirmés (source : `payments`, dédupliqués) — pas `sg_conversion` tant que l'écart de x2,5 n'est pas expliqué
6. Revenu réel par devise (€ et $ séparément tant qu'il n'y a pas de conversion fiable)
7. Répartition des paiements par plan (mensuel / p7 / p30 / p120 / annuel)
8. Taux de conversion du plan annuel spécifiquement (actuellement 0 %)
9. Volume `sg_friction` sur les écrans `world` et `mapintro`
10. Part de trafic/revenu hors MQ/GP (à isoler si l'expansion est confirmée)

---

## Synthèse finale

### Top 10 découvertes
1. Le funnel perd 98,5 % de son volume entre l'affichage du paywall et le clic sur son CTA — c'est le vrai goulot d'étranglement, pas le checkout.
2. Juillet = trafic record + conversion la plus basse de la période observée.
3. Le pass 7 jours coûte plus cher que l'abonnement mensuel pour moins de valeur (cannibalisation par construction).
4. Le plan annuel a 47 tentatives de paiement et 0 conversion confirmée.
5. 80 % des conversions matchées se font dans l'heure suivant la capture email — l'achat est majoritairement un acte impulsif, pas un fruit du nurture.
6. Le trigger de paywall dominant (59,5 % du volume) est temporel, pas contextuel, et n'apparaît dans aucun paiement attribué.
7. Il n'existe aucun identifiant utilisateur persistant dans tout le dataset — ni le funnel par utilisateur, ni la rétention réelle, ni le DAU/MAU ne sont calculables aujourd'hui.
8. Le B2B (79€/mois-690€/an) a une stratégie documentée mais zéro revenu confirmé et un pipeline de 6 leads seulement.
9. 69 tests A/B tournent simultanément sans moyen de mesurer l'effet d'aucun.
10. Le pipeline de paiement contient des doublons de webhook, une transaction de test comptée comme réelle, et des enregistrements de debug jamais nettoyés.

### Top 10 opportunités de croissance les plus rentables
1. Repricer le pass 7 jours vs abonnement mensuel
2. Réparer le tunnel de paiement annuel
3. Recentrer le déclenchement du paywall sur l'intention (contenu) plutôt que le temps
4. Investiguer et corriger la chute de conversion de juillet
5. Traiter la friction sur les écrans `world`/`mapintro`
6. Ajouter UTM + device au tracking pour débloquer l'optimisation acquisition
7. Relancer commercialement les 6 leads B2B existants avant d'investir plus en amont
8. Fiabiliser l'attribution email (drip vs achat en session) pour arbitrer l'investissement contenu
9. Mettre en place un ID utilisateur persistant pour débloquer cohortes et rétention réelles
10. Clarifier et, si pertinent, capitaliser sur l'expansion Florida/Punta Cana/Riviera Maya déjà en cours

### Top 10 erreurs les plus coûteuses (déjà commises ou en cours)
1. Grille de prix qui cannibalise l'abonnement récurrent au profit d'un pass ponctuel moins rentable
2. Paywall majoritairement déclenché sans lien avec l'intention d'achat
3. Doublons de paiement non dédupliqués dans le reporting revenu
4. Transaction de test comptée comme du revenu réel
5. Enregistrement de test nommé "à supprimer" jamais supprimé, en production
6. Absence totale d'identifiant utilisateur, qui bloque toute analyse de rétention/LTV depuis le début
7. Prolifération de 69 tests A/B sans méthode de mesure de l'effet
8. Séquence drip email coûteuse à produire (1 554 envois j3-j21) dont l'impact réel sur la conversion payante n'est pas mesurable et semble, sur l'échantillon observé, marginal
9. Pipeline emails incohérent (plus d'ouvertures que de délivrances), qui fausse potentiellement les décisions de contenu email
10. Feedback utilisateur quasiment jamais collecté (1 réponse sur 519 contacts) malgré la demande envoyée

### Top 10 KPI à suivre en permanence
Voir section 10, liste des 10 métriques hebdomadaires — reprise ici pour la synthèse : sessions, taux paywall/session, **taux clic CTA/paywall (métrique n°1)**, taux checkout/CTA, paiements réels dédupliqués, revenu par devise, mix des plans, taux de conversion plan annuel, volume friction (`sg_friction`), part de trafic/revenu hors MQ/GP.

### Notes globales (/10)

| Dimension | Note | Justification courte |
|---|---:|---|
| Produit | 6/10 | Proposition de valeur claire (prévision par plage) et engagement réel (65 % de sessions retour), mais fonctionnalités secondaires (jeu, feedback) très peu utilisées |
| UX | 5/10 | Friction mesurée et concentrée sur 2 écrans identifiables ; paywall mal positionné dans le parcours |
| Conversion | 3/10 | 98,5 % de perte à l'étape critique, plan annuel à 0 %, cannibalisation de prix active |
| Rétention | Non notable | Impossible à évaluer sans identifiant utilisateur — le proxy `is_returning` (65 %) est encourageant mais ne remplace pas une vraie mesure |
| Instrumentation Analytics | 3/10 | Pas d'ID utilisateur, pas de device/UTM, doublons d'événements, incohérences emails, mais events business (paiements) bien structurés une fois nettoyés |
| Potentiel de croissance | 7/10 | Trafic en croissance réelle (+91 % avril→juillet), plusieurs corrections à faible effort avec impact revenu direct et déjà identifiées |

### Analyses impossibles avec les données actuelles, et ce qu'il faudrait pour les débloquer

| Analyse demandée | Pourquoi impossible aujourd'hui | Donnée à ajouter |
|---|---|---|
| Funnel par utilisateur réel | Pas d'ID persistant | `user_pseudo_id` ou cookie stable sur tous les événements |
| DAU/MAU, stickiness | Pas d'ID persistant | Idem |
| Rétention J+7/J+30, churn réel | Pas d'ID persistant | Idem |
| Répartition mobile/desktop, navigateur | Champ absent | `device_type`, `user_agent` parsé |
| Pays des visiteurs | Champ absent | Géolocalisation IP ou déclaratif |
| Sources de trafic (SEO, paid, referrer) | Champ absent | UTM systématiques + referrer |
| Temps moyen avant conversion (vrai) | Pas d'ID persistant, uniquement estimable par recoupement email (10 cas) | ID persistant + horodatage premier contact |
| Uplift réel de chacun des 69 tests A/B | Pas d'ID persistant pour lier exposition → résultat | ID persistant + réduction du nombre de tests simultanés |
| LTV par cohorte/plan | Échantillon de 14 paiements réels, pas d'historique de renouvellement exploitable | Plus de volume + ID persistant + événements de renouvellement/annulation fiables |
| ROI réel du drip email vs achat en session | Pas d'UTM sur les liens email | UTM sur tous les liens sortants des emails |

---

*Méthodologie : toutes les données chiffrées de ce rapport proviennent des 13 onglets du Google Sheet fourni (`Emails`, `subscription_events`, `analytics_events`, `email_events`, `drip_log`, `feedback_requests`, `email_tracking`, `beach_reports`, `payments`, `email_log`, `feedback`), lus intégralement et recoupés entre eux. Aucun chiffre de ce rapport n'est estimé sans base de calcul explicite ci-dessus.*
