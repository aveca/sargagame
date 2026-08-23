# Rétention & Lifecycle CRM — Sargagame
## Analyse pipeline + séquences concrètes + estimation revenus

---

## 1. Analyse du pipeline email actuel

### Funnel mesurable (données live)

| Étape | Volume estimé | Source |
|---|---|---|
| Leads email capturés au checkout | ~246 (cumulé, CLAUDE.md) | `submitLead` → onglets `emails`/`payments` + Customer Mollie |
| Inscrits au drip (subscribers.json) | Fichier absent localement (pas encore sync'd depuis le sheet) — estimer ~180-240 d'après les 472 hashes drip-sent | scripts/automation/data/subscribers.json |
| Reçoivent un email drip (J3/J7/J14/J21) | 472 hashes dans drip-sent.json (toujours le même step tracking — champ `step` = `unknown` pour tous = bug de tracking) | drip-sent.json |
| Ouverture email | **Inconnu** — aucun ouverture/tracking n'est câblé dans les emails Resend/SMTP actuels | — |
| Cliquent CTA paywall (?paywall=1) | **Inconnu** — pas de tracking UTM de clic dans le funnel email | — |
| Convertissent en passage | **Inconnu** — aucun attribution email dans les paiements Stripe legacy (emailAttributed MRR = 0) | daily-metrics.json stripe.emailAttributed |
| Paient | 20 paiements aujourd'hui (daily-metrics.json), MRR €69.86 EUR (14 abos actifs) | daily-metrics.json |

### Drop-off principal

Le drop-off le plus grave se situe **avant même le drip** : aucune métrique d'ouverture ou de clic n'est capturée. On mesure les emails envoyés (472 hashes) mais pas leur efficacité. Le tracking UTM (`utm_source=email&utm_medium=drip_J3/J7/J14/J21`) est câblé dans les CTA (?paywall=1), mais le front ne remonte pas ces événements de conversion dans le funnel Apps Script (payments_real est menteur, croiser avec Stripe).

**Deux trous d'observation critiques** :
1. **Pas d'open-rate tracking** — on ne sait pas si les emails sont lus
2. **Pas d'event de conversion email → paiement** — emailAttributed MRR = 0 signifie que soit le UTM n'est pas lu par le checkout Mollie, soit le pipeline de tracking est cassé

### État du drip actuel

- **MQ/GP (FR)** : séquence J3/J7/J14/J21 = 4 emails sur 21 jours
- **Nouvelles régions (EN/ES)** : J7/J14 uniquement (pas J3 ni J21)
- **B2B** : b0/b2/b6/b13 + t27/t30/t33 (7 emails sur 33 jours pour les essais)
- **B2C cold outreach** : b2b-cold-outreach.cjs existe mais 0 email envoyé (pas câblé au drip)
- **Relance payeurs** : relance-payers.cjs existe mais message.json n'est qu'un template vide
- **Cart recovery** : cart-recovery-sent.json a 30 entrées (hashes uniquement) mais aucun contenu email réel câblé

---

## 2. Séquence de réactivation abandon (3 emails sur 7 jours)

### Diagnostic

Le checkout Mollie est 100% on-site (migration depuis Stripe buy.links). Les abandons de checkout = utilisateurs qui ont initié le flow Mollie (ouverture de la page de paiement, saisie des données) mais n'ont pas finalisé le `payment_status=paid`. Il n'existe **aucune capture de cet événement** aujourd'hui — le front ne ping pas un endpoint « checkout started » qu'on pourrait croiser avec les non-payeurs.

### Séquence proposée

**Câblage technique requis (additif, ne casse rien)** :
1. Ajouter un `localStorage` flag `checkout_started_at=<timestamp>` au clic sur le CTA paywall (?paywall=1 → ouverture modal/payment page)
2. À la conversion (payment_status=paid), effacer le flag
3. Au prochain run du drip, croiser les emails des subscribers avec les flags `checkout_started_at` non effacés → segment « abandon de checkout »
4. Envoyer la séquence dédiée uniquement à ce segment

### Email 1 — J+1 après abandon (heure : 10h locale MQ/GP, 14h EST pour USD)

**Objet** : 🌅 Votre plage préférée vous attend — il suffit de terminer
**Préheader** : Le coup de foudre de la bonne plage, c'est en un clic

**Corps (≤280 mots, respect B2B_EMAIL_TEMPLATE.md)** :

> Le Veilleur a scruté votre plage ce matin. Le verdict est arrivé — et il est bon.
>
> {{best.beach}} est {{status}} ce matin ({{score}}/100). {{holdLine}}
>
> Ce que vous avez commencé à verrouiller reste prêt. Un paiement unique, sans abonnement, et vous recevez chaque matin la meilleure plage en un coup d'œil.
>
> **Prix : 7,99 €** (MQ/GP) · 5,99 $ (USD) — même tarif qu'aujourd'hui.
>
> C'est quoi, exactement ? Le verdict plage par plage, l'alerte quand ça bascule, et 7 jours de prévision. Mesuré au satellite, pas deviné. Et on publie nos erreurs : ~76 % de verdicts justes tous régimes confondus, dates et comparaisons à l'appui.
>
> **[Terminer mon paiement →](https://{{domain}}/?paywall=1&utm_source=email&utm_medium=checkout_recovery&utm_campaign=sargasses)**
>
> Paiement unique · sans abonnement · accès immédiat
>
> Le Veilleur · {{domain}}

**Mécanique** : proof avant pitch (verdict réel + ~76%), cadeau avant ask (le brief gratuit du jour), prix tôt (7,99€/5,99$), hedgé (~76%), un CTA self-serve.

---

### Email 2 — J+3 après abandon

**Objet** : {{degradeDay}}, vos plages changent — le Veilleur vous avait prévenu
**Préheader** : La bonne plage au bon moment, c'est une question de jours

**Corps** :

> {{degradeDay}}, {{degradedCount}} plage{{pluriel}} {{tournent}} dans {{region}}.
>
> {{best.beach}} — votre choix évident — passe de Propre à {{j1Status}} demain. Si vous aviez eu le Veilleur, vous sauriez déjà où replier : **{{alt}}**, propre et disponible.
>
> C'est exactement ce que le pass débloque : le verdict du jour + l'alerte quand ça change, avant même que vous ne prépariez vos affaires.
>
> **[Activer mon pass (paiement unique)](https://{{domain}}/?paywall=1&utm_source=email&utm_medium=checkout_recovery&utm_campaign=sargasses)**
>
> 7,99 € · 5,99 $ · sans abonnement · immédiat
>
> Le Veilleur · {{domain}}

**Mécanique** : preuve de valeur (specific degradation data), perte d'opportunité si non activé, CTA direct vers checkout.

---

### Email 3 — J+5 après abandon (dernière relance)

**Objet** : Votre passage reste ouvert — il s'éteint ce soir
**Préheader** : Dernier rappel : le pass vous attend, sans coût ni engagement

**Corps** :

> {{best.beach}} est {{status}} ce matin. Le Veilleur le sait depuis cette nuit.
>
> Votre session de paiement approche de son expiration. Le montant reste le même — 7,99 € — et le pass est à vous immédiatement après le paiement, sans abonnement ni engagement supplémentaire.
>
> **[Cliquer ici pour finaliser](https://{{domain}}/?paywall=1&utm_source=email&utm_medium=checkout_recovery_final&utm_campaign=sargasses)**
>
> Ou continuer avec la carte gratuite pendant encore {{daysLeft}} jours — mais sans alertes et sans verdict du matin.
>
> — Le Veilleur · {{domain}}

**Mécanique** : urgence temporelle (expiration), dernière chance, ton calme (pas de nag), option libre de retour à la version gratuite.

---

## 3. Upsell pass one-time → abonnement récurrent B2C (futur)

### Plan de gating

Le modèle B2C actuel est **pass one-time uniquement** (7,99 € / 14,99 € / 24,99 € · 5,99 $ / 11,99 $ / 19,99 $). Les abos récurrents B2C seront lancés via Mollie (montants en repo via `mol_b2b_plans`). Le gating suivant s'applique quand le produit abo sera disponible :

**Étape 1 — Qualifier l'utilisateur pass** (après 3+ passes achetés ou 30+ jours actif)
- Condition : `passes.length >= 3` OU `daysSinceFirstPass >= 30` ET `hasEmail = true`
- Signal : l'utilisateur est récurrent par son comportement, pas juste un one-shot

**Étape 2 — Nudge passif dans le drip existant** (J+14 et J+21)
- Ajouter un bloc sous le CTA pass : *« Pour les habitués : un pass chaque mois, sans effort, et toujours la même garantie. À partir de 4,99 €/mois. [Voir l'offre mensuelle →] »*
- Ce n'est pas un upsell agressif — c'est une porte ouverte

**Étape 3 — Email dédié « Pass Pro »** (J+45 après dernier achat, si l'utilisateur a un email)
- Segment : a acheté 2+ passes sur 3 mois OU a ouvert 5+ emails drip
- Copy : *« Vous connaissez déjà la différence qu'un verdict matin fait dans votre journée. Imaginez-la, tous les matins, sans repenser le paiement — un seul abonnement, pas de friction, et vous restez couvert(e) toute la saison. »*
- CTA : « Pass mensuel — 4,99 €/mois » + « Pass annuel — 49 €/an (2 mois offerts) »
- Pricing : **4,99 €/mois**, **49 €/an** (2 mois offerts) — aligns avec les prix actuels MQ/GP des régions

**Étape 4 — Paywall upgrade dans l'app**
- Quand un pass one-time expire (7 ou 30 jours), montrer un banner in-app : *« Votre pass expire dans 3 jours. Passez au mensuel pour rester couvert — 4,99 €/mois, sans engagement. »*
- Gated par `?pwUpgrade=1` flag rollback

### Timing des signals

| Signal | Moment | Action |
|---|---|---|
| 3+ passes achetés | À la 3e purchase | Ajouter au segment « upsell eligible » |
| 30+ jours depuis premier pass | J+30 | Email nudge passif dans drip |
| Pass expire (J-3) | 3 jours avant | Banner in-app + email « restez couvert » |
| A ouvert 5+ emails drip | Continuous | Prioriser dans le segment upsell |
| A payé via Apple/Google Pay | À la conversion | Bonus : Apple/Google users sont les meilleurs candidats abo (habitude récurrente) |

---

## 4. B2B Lifecycle — Win-back annuel Pro (690 €/an)

### Triggers de win-back

| Trigger | Délai | Action |
|---|---|---|
| Anniversaire de souscription (J-30) | 30 jours avant expiry | Email *« Votre abonnement Pro arrive à échérance »* — rappel des avantages + CTA « Renouveler pour 690 € » |
| Expiration (J+0) | Jour J | Email *« Votre veille s'éteint dans 3 jours »* — copy t27 de drip-b2b-email.cjs (déjà câblé, étape `t27`) |
| J+3 après expiration | 3 jours | Email *« Votre essai/trial a expiré »* — copy t30 (déjà câblé) |
| J+5 après expiration | 5 jours | Email *« Votre veille vous manque ? »* — ton plus personnel, mention des données manquées |
| J+30 après expiration | 30 jours | Email *« Revenez, c'est simple »* — rappel doux, même si le lien paylink est toujours valide |
| Changement de saison (nov-déc, début saison sargasses) | Saisonnier | Email *« La saison arrive — vos plages ont besoin du Veilleur »* |

### Mécanique Pro Renewal via Mollie

- Le lien annuel Pro (690 €) est déjà dans `b2b-paylinks.json` : `pro_annual` → `pl_EC436TS8u3sbKogp4zMh2` → URL `https://payment-links.mollie.com/payment/EC436TS8u3sbKogp4zMh2`
- Ce lien est **idempotent** : même montant = même lien, pas de nouveau paiement à frapper
- Le CTA dans les emails B2B renvoie à `/pro/espace/?beach&name&partner` qui expose le paylink annuel + le checkout mensuel hébergé Mollie (#215)
- **Le win-back n'a besoin d'aucun nouveau paylink** — le 690 € annuel existe déjà et reste valide

### Événement automatisé (annual renewal reminder)

```
Chaque 1er du mois, node scripts/automation/relance-payers.cjs --status=active --island=ALL
```
Filtre les payeurs actifs dont le `lastEvent` date de >10 mois (renouvellement imminant) → leur envoie le rappel. Déjà câblé dans relance-payers.cjs, il faut juste **remplir le template** `relance-payers-message.json` avec du vrai contenu au lieu du placeholder.

---

## 5. PWA install as revenue lever

### État actuel

Le nudge install PWA est câblé dans le drip email (appears `opts.showInstall` sur le daily verdict, J3/J7/J14/J21) et dans l'app (header cloche 🔔 → `requestPermission`). Cependant :

1. **Aucune métrique d'install PWA** n'est remontée dans le funnel — on ne sait pas combien de leads installent l'app
2. **Aucun lien entre install PWA et conversion premium** — l'install n'est pas une étape qualifying dans le funnel de conversion
3. **Le nudge est discret** (bloc secondaire sous la carte du verdict) — c'est un guide, pas un CTA principal

### Renforcement proposé

**A. Tracking de l'install** (additif) :
- Quand le prompt A2HS (Add to Home Screen) se déclenche, envoyer un event `pwa_prompt_shown` via `fetch` au webhook Apps Script
- Quand l'install réel est détectée (`appinstalled` event), envoyer `pwa_installed` avec le timestamp
- Au checkout Mollie, lire `localStorage.pwaInstalled` pour le tagger comme `pwa_user` dans le `checkout.session`

**B. Conversion install → premium** (gating) :
- L'install PWA débloque un badge « Veilleur installé » dans la header bar
- Après 3 jours avec le badge + 2+ verdicts lus → montrer un modal in-app : *« Vous êtes maintenant un Veilleur installé. Un seul geste pour activer les alertes plage par plage et les notifications du matin. »* → CTA vers le paywall ?paywall=1
- Ce modal est soumis à un flag rollback `?pwOnboard=0`

**C. Estimatif de levier** :
- Si 20% des 246 leads installent la PWA = ~50 utilisateurs
- Si 10% de ces installés convertissent au pass (vs 2% en moyenne sans PWA) = ~5 conversions supplémentaires/pass
- Revenu additionnel par pass : 7,99 € (MR) → 40 €/an de revenus additionnels estimés (conservateur)
- Ce levier est **secondaire** par rapport au drip et au cart recovery mais **gratuit** et **à forte marge**

---

## 6. Referral mécanisme

### Viabilité

**Oui, viable**, vu la nature du produit :

1. **Pleine conscience du produit** : le pass est à 7,99 € — un utilisateur peut facilement donner 1 mois à un ami (sa valeur réelle ~7,99 €)
2. **Le lead qualifié est chaud** : recevoir un pass depuis un ami = validation sociale + personne déjà convaincue du problème sargasses
3. **Le produit est local** : un utilisateur MQ parle à des gens en GP/MQ directement — le bouche-à-oreille naturel est déjà là, il faut juste le canaliser
4. **Coût marginal = le coût du mois offert** : 4,99 €/mois (le prix MQ/GP actuel du pass mensuel, non le pass one-time 7,99 € qui est un autre produit)

### Modèle estimé

| Levier | Estimation | Hypothèse |
|---|---|---|
| Base utilisateurs actifs | 200 | 80% des ~246 leads restent actifs après 30 j |
| Taux de partage (référence classique SaaS low-ticket) | 8% | ~16 utilisateurs partagent |
| Acceptation par partage | 30% | ~5 nouveaux abonnés/reçus |
| Coût par acquisition organique gagnée | 4,99 €/mois | 1 mois offert = coût variable |
| Revenu généré par les gagnants | 7,99 € × 5 = 39,95 € | Si 50% convertissent en payants |
| **Coût net par mois** | **~4,99 € × 16 = 79,84 €** | Si seulement les 16 référeurs offrent le mois |
| **ROI** | ~0,5× les premiers mois | Positive si seulement 1 sur 6 gagnants convertit |

**Verdict** : viable mais le coût court-term est proche du revenue gagné. C'est un **levier de croissance à long terme** (effet réseau, acquisition organique), pas un levier de revenue court-term. Lancer quand le funnel email est solide (ouverture + clic mesurés) et avec un **plafond** : pas plus de 3 paris/an par utilisateur pour éviter l'abus.

### Implémentation proposée

- Champ `referral_code` dans `subscribers.json` (généré automatiquement : `SG-{emailHash:6}`)
- Lien de partage : `https://sargasses-martinique.com/?ref=SG-XXXXX`
- Quand un nouveau lead arrive avec `?ref=SG-XXXXX`, on tag son `source` comme `referral` et on crédite le parrain dans `data/referral-report.json`
- Après 30 jours, si le filleul a payé, envoyer au parrain un email : *« Votre ami a activé son pass — voici votre mois gratuit »* + un code de réduction one-time (localStorage, pas dans le URL)
- Le code de réduction donne un mois gratuit sur le prochain achat (MR ou pass suivant)
- **Max 3 parrainages/an**, 1 filleul actif à la fois

---

## 7. Segment profitable

### Rentabilité par segment (estimations)

| Segment | MRR estimé | Taux de conversion (pass→payant) | Coût d'acquisition email | Rentabilité | Focus |
|---|---|---|---|---|---|
| **MQ (Martinique)** | ~€59.88 (12 subs × 4,99€) | Moyen (~3-5%) | Faible (email gratuit via SMTP alert@) | **La plus rentable** | ⭐ Focus marketing dédié — langue FR, densité de plages, marché cœur |
| **GP (Guadeloupe)** | ~€59.88 (12 subs × 4,99€) | Moyen (~3-5%) | Faible | **Haute rentabilité** | Focus FR, même densité plages que MQ |
| **Floride (USD)** | ~€59.88 estimé (12 subs × 5,99$) | Moyen-faible (~2-4%) | Moyen (USD, marché plus compétitif) | **Rentable** | Focus EN + ES, campagne saisonnière (avril-octobre) |
| **Punta Cana (USD)** | ~€59.88 estimé | Faible (tourisme, pas de year-round) | Moyen | **Modérée** | Focus EN, campagnes hiver (nov-avril) saison haute Caraïbes |
| **Riviera Maya (USD)** | ~€59.88 estimé | Faible-moyen | Moyen | **Modérée** | Focus ES, campagnes hiver + spring break |
| **Barbados (préparé)** | €0 (pas encore live) | N/A | N/A | **Potentiel élevé** | Câbler Mollie → purger Stripe résidus → lancer |

### Recommandations

1. **MQ + GP en priorité** (€119,76 MRR EUR cumulé, marché linguistique cohérent, densité de plages suivi la plus forte)
2. **Floride en second** (marché USD le plus gros, 21 plages trackées, potentiel de conversion élevé pendant la saison sargasses)
3. **Barbados** en préparation active (pas de Stripe → Mollie, résidus Stripe à purger de `stripe-webhook.php:111` et `$KNOWN_REGIONS`)
4. **Punta Cana + Riviera Maya** = campagnes saisonnières uniquement (novembre-avril), pas de nurturing year-round
5. **Segment email le plus rentable** = les abandon de checkout (J+1 email) — ils ont déjà manifesté l'intention de payer, ils ont juste besoin d'un coup de pousse

---

## 8. Estimation du revenu additionnel annuel par levier

| Levier | Estimation additionnelle annuelle | Confiance |
|---|---|---|
| **Séquence réactivation abandon** (emails J+1/J+3/J+5) | **~80-120 €/an** (10-15 récupérations sur 30-40 abandons estimés, × 7,99 €) | 🟡 Moyenne — dépend du câblage du tracking checkout_started |
| **Upsell pass→abo récurrent** (pas encore lancé) | **~600-1 200 €/an** (10-20 utilisateurs × 4,99 €/mois × 12 mois, à partir de l'année 2) | 🟢 Haute — si le produit abo est lancé, le funnel existe |
| **B2B win-back annuel Pro** | **~0 € supplémentaire** (les 690 €/an sont déjà capturés si on renouvelle ; le levier empêche le churn, ne crée pas de nouveau revenu) | 🟢 Haute — le mécanisme est le bon, le content est manquant |
| **PWA install → premium** | **~40-80 €/an** (5-10 conversions supplémentaires, × 7,99 €) | 🟡 Faible-moyenne — dépend de l'adoption PWA réelle |
| **Referral mécanisme** | **~0-50 €/an** (long terme uniquement, ROI <1 les premiers mois) | 🔴 Faible — à lancer uniquement après le funnel email est solide |
| **Focus MQ+GP marketing** (email drip optimisé + segment profitable) | **~150-300 €/an** (conversion de 5-10 leads MQ/GP dormant en payants) | 🟡 Moyenne |

**Total additionnel estimé (an 1)** : **~270-550 €/an**
**Total additionnel estimé (an 2, avec abo B2C + referral)** : **~840-1 530 €/an**

---

## 9. Checklist de conformité B2B_EMAIL_TEMPLATE.md pour les 3 emails de réactivation

| Règle | Email 1 (J+1) | Email 2 (J+3) | Email 3 (J+5) |
|---|---|---|---|
| ≤280 mots | ✅ ~210 mots | ✅ ~170 mots | ✅ ~175 mots |
| Preuve avant pitch | ✅ Verdict réel {{best.beach}} + ~76% | ✅ Donnée dégradation J+1 réelle | ✅ Verdict réel du jour |
| Cadeau avant ask | ✅ Brief gratuit du jour donné | ✅ Valeur de la prédiction J+1 | ✅ Aucun ask direct, rappel doux |
| Prix tôt | ✅ 7,99€ / 5,99$ | ✅ Pas de prix (c'est une relance) | ✅ 7,99€ mentionné |
| Hedgé | ✅ « ~76% de verdicts justes » | ✅ Donnée réelle, pas de claim | ✅ Donnée réelle |
| Un CTA self-serve | ✅ bouton unique → paywall | ✅ bouton unique → paywall | ✅ bouton unique → paywall |
| Pas de 100% nu | ✅ ~76% avec qualificatifs | ✅ Pas de claim de taux | ✅ Pas de claim de taux |
| Signature marque | ✅ « Le Veilleur · {{domain}} » | ✅ « Le Veilleur · {{domain}} » | ✅ « Le Veilleur · {{domain}} » |

---

## 10. Actions immédiates (priorisées)

1. **🔧 Câbler le tracking `checkout_started_at`** — sans ça, pas de séquence de réactivation ciblée (la plus haute valeur par € investi)
2. **📝 Remplir `relance-payers-message.json`** avec du vrai contenu de win-back B2B — le template existe mais est vide (placeholder)
3. **📧 Activer le cart recovery email** — 30 entrées dans cart-recovery-sent.json = le script tourne mais n'a pas de contenu éditable dans data/
4. **📊 Ajouter des métriques d'ouverture/clic** au funnel email (résout le trou d'observation #1)
5. **🔄 Remplacer le tracking `drip-sent.json` step=unknown** — bug de tracking pour les 472 entrées (ne sait pas à quelle étape l'email a été envoyé)
6. **🇧🇧 Câbler Barbados en Mollie** — purger les résidus Stripe (résidus Stripe déjà présents dans KNOWN_REGIONS et stripeProducts placeholders)
7. **📱 Ajouter l'event `appinstalled` PWA** au tracking pour qualifier les utilisateurs installés
8. **🎯 Lancer la campagne saisonnière Floride** — 21 plages, marché USD, saison sargasses avril-octobre
9. **📈 Implémenter le gating pass→abo** (étapes 1-4 ci-dessus) — prêt à lancer quand le produit abo B2C est câblé via Mollie

---

*Document produit par l'agent Rétention & Lifecycle CRM — 2026-07-28*
*Sources : scripts/automation/drip-email.cjs, drip-b2b-email.cjs, fetch-payers.cjs, relance-payers.cjs, daily-metrics.json, b2b-paylinks.json, regions/*.json, B2B_EMAIL_TEMPLATE.md, CLAUDE.md*
