# Préparation commerciale Phase 0.9 — Emails et liste d'hôtels à contacter

> **Règle** : ce fichier prépare UNIQUEMENT des templates et une liste de cibles. **Aucun email n'est envoyé.** L'envoi relève du fondateur, après validation technique du premier abonnement.
>
> Prix inchangés : Pro 79 €/mois, Pro annuel 690 €/an. Essai gratuit 30 j possible (Brief gratuit 30j).

## 1. Liste des 18 hôtels Grade A (cibles prioritaires)

| # | Hôtel | Plage | Région | Chambres | Langue | Ordre d'appel |
|---|-------|-------|--------|----------|--------|---------------|
| 1 | Hôtel Bakoua | Pointe-du-Bout, Les Trois-Îlets | Martinique | 138 | FR | 1 |
| 2 | Le Village Courbaril | Anse à l'Âne, Les Trois-Îlets | Martinique | 60+ | FR | 1 |
| 3 | Hôtel Carayou & SPA | Pointe-du-Bout, Les Trois-Îlets | Martinique | 132 | FR | 1 |
| 4 | Bambou Resort | Anse Mitan, Les Trois-Îlets | Martinique | 80+ | FR | 1 |
| 5 | Hauts de Caritan | Sainte-Anne | Martinique | 15+ | FR | 1 |
| 6 | La Toubana Hôtel & Spa | Sainte-Anne (baie) | Guadeloupe | 40+ | FR | 2 |
| 7 | Le Relais du Moulin | Le Helleux, Sainte-Anne | Guadeloupe | 60 | FR | 2 |
| 8 | Village Pierre & Vacances | Bois Jolan, Sainte-Anne | Guadeloupe | 200+ | FR | 2 |
| 9 | Kaz Ananas | Le Helleux, Sainte-Anne | Guadeloupe | 7 | FR | 2 |
| 10 | Loews Miami Beach Hotel | South Beach, Collins Ave | Miami / Floride | 790 | EN | 3 |
| 11 | 1 Hotel South Beach | Mid-Beach, Collins Ave | Miami / Floride | 425 | EN | 3 |
| 12 | Kimpton Surfcomber | South Beach | Miami / Floride | 180 | EN | 3 |
| 13 | Hyatt Ziva Cancún | Punta Cancún (2 plages) | Cancún / Riviera Maya | 547 | ES | 4 |
| 14 | Secrets Maroma Beach | Playa Maroma | Cancún / Riviera Maya | 412 | ES | 4 |
| 15 | Grand Velas Riviera Maya | Playa del Carmen | Cancún / Riviera Maya | 539 | ES | 4 |
| 16 | Hyatt Zilara Cap Cana | Juanillo Beach | Punta Cana | 375 | ES | 5 |
| 17 | Sanctuary Cap Cana | Juanillo Beach (sud) | Punta Cana | 324 | ES | 5 |
| 18 | Zoetry Agua Punta Cana | Uvero Alto | Punta Cana | 92 | ES | 5 |

**Total : 18 prospects Grade A** (Martinique 5, Guadeloupe 4, Miami 3, Cancún 3, Punta Cana 3).

Source : `.ai/prospect-list-grade-a.md` (préservé, non modifié).

## 2. Templates d'emails de prospection (à ne PAS envoyer avant validation technique)

### Objet commun (à adapter par région)
- FR : « Sargasses devant votre plage à [Plage] — prévision satellite pour [Hôtel] »
- EN : « Sargassum in front of your beach at [Beach] — satellite forecast for [Hotel] »
- ES : « Sargazo frente a su playa en [Playa] — pronóstico por satélite pour [Hotel] »

### Template FR (Martinique / Guadeloupe)

```
Bonjour,

Je m'appelle [X]. Je surveille les sargasses par satellite pour les plages de [Martinique / Guadeloupe].
Votre établissement, [Hôtel], est situé juste devant [Plage].

Je vous contacte car les sargasses peuvent impacter directement l'expérience de vos clients
sur la plage. J'ai développé un outil de prévision quotidienne par plage (verdict : présence /
absence, confiance, évolution) qui aide les hôteliers à anticiper le nettoyage et à informer
leurs clients avant leur arrivée.

Proposition : un accès d'essai gratuit 30 jours, puis :
- Pro mensuel : 79 €/mois
- Pro annuel : 690 €/an

Seriez-vous ouvert à un échange de 10 minutes cette semaine ?

Cordialement,
[X]
```

### Template EN (Miami / Floride)

```
Hello,

My name is [X]. I monitor sargassum by satellite for Miami Beach beaches.
Your hotel, [Hotel], is right in front of [Beach].

I'm reaching out because sargassum can directly impact your guests' beach experience.
I've built a daily per-beach forecast tool (verdict: presence / absence, confidence, trend)
that helps hoteliers anticipate cleaning and inform guests before arrival.

Proposition: a free 30-day trial, then:
- Pro monthly: $79/month
- Pro annual: $690/year

Would you be open to a 10-minute call this week?

Best regards,
[X]
```

### Template ES (Cancún / Riviera Maya / Punta Cana)

```
Hola,

Me llamo [X]. Monitorea el sargazo por satélite para las playas de [Cancún / Riviera Maya / Punta Cana].
Su hotel, [Hotel], está justo frente a [Playa].

Le contacto porque el sargazo puede impactar directamente la experiencia de sus clientes en la playa.
He desarrollado una herramienta de pronóstico diario por playa (veredicto: presencia / ausencia,
confianza, tendencia) que ayuda a los hoteleros a anticipar la limpieza e informar a los huéspedes
antes de su llegada.

Propuesta: prueba gratuita de 30 días, luego:
- Pro mensual: $79/mes
- Pro anual: $690/año

¿Estaría abierto a una llamada de 10 minutos esta semana?

Saludos cordiales,
[X]
```

## 3. Email de conversion après essai (template, non envoyé)

```
Bonjour [Nom],

Votre essai gratuit de 30 jours pour la prévision sargasses de [Plage] touche à sa fin.

Pour continuer à recevoir les prévisions quotidiennes et protéger l'expérience plage de vos clients :
- Pro mensuel : 79 €/mois
- Pro annuel : 690 €/an (2 mois offerts)

Lien de paiement sécurisé : [lien Mollie généré via b2b-create-checkout.php]

Cordialement,
[X]
```

## 4. Suivi paiements / abonnements (à préparer, non activé)

| Élément | Outil | Statut |
|---------|-------|--------|
| Tableau de bord paiements hôteliers | `payment_grants` (Supabase) | À activer après provisioning |
| Suivi abonnements actifs | `verify_subscription?kind=b2b_pro` | À tester (Test Plan §4) |
| Alertes expiration / annulation | Webhook `canceled` / `expired` | À tester (Test Plan §4) |

## 5. Ordre de contact recommandé

1. Martinique (marché local, français, appels faciles) — commencer par **Hôtel Bakoua**
2. Guadeloupe (même langue, proximité)
3. Miami (EN, marché huge, plus de valeur si ça marche)
4. Cancún (ES, plus complexe, gros volume)
5. Punta Cana (ES, dernier car éloigné)

---

**Rappel** : aucun email envoyé, aucun appel passé avant validation technique du premier abonnement. Ce fichier est une préparation uniquement.