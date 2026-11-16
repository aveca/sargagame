# Pipeline commercial Sargagame

> Système de suivi des prospects et conversions.
> Dernière mise à jour : 2026-11-16.

## Étapes du pipeline

| Étape | Code | Définition | Action suivante |
|-------|------|------------|-----------------|
| **Identifié** | `identified` | Prospect trouvé (nom + zone) | Vérifier existence et activité |
| **Vérifié** | `verified` | Existence confirmée (site, activité, localisation) | Qualifier le potentiel |
| **Qualifié** | `qualified` | Potentiel commercial évalué (score 1-5) | Préparer le contact |
| **À contacter** | `to_contact` | Message personnalisé prêt | Envoyer la prospection |
| **Contacté** | `contacted` | Premier message envoyé | Attendre réponse (7 j) |
| **Réponse reçue** | `response_received` | Prospect a répondu | Qualifier l'intérêt |
| **Intéressé** | `interested` | Intérêt confirmé | Proposer le diagnostic / Premium |
| **Client** | `client` | Paiement reçu (49 € ou abonnement) | Suivi et fidélisation |
| **Perdu** | `lost` | Pas d'intérêt ou pas de réponse après 3 relances | Archiver |

## Règles de transition

- Un prospect ne passe à `verified` que si son existence est confirmée par une source publique vérifiable.
- Un prospect ne passe à `qualified` que si son potentiel commercial est évalué (score 1-5).
- Un prospect ne passe à `contacted` que si le message a réellement été envoyé (pas de "simulé").
- Un prospect ne passe à `client` que si un paiement réel a été reçu (jamais un formulaire).
- Un formulaire soumis ≠ une vente. Un prospect enregistré ≠ un client.

## Scoring de qualification (1-5)

| Score | Critère |
|-------|---------|
| 5 | Hôtel 4-5* bord de mer, zone touristique majeure, présence web active |
| 4 | Hôtel 3* bord de mer, zone touristique |
| 3 | Résidence/appart-hôtel, zone touristique |
| 2 | Location de vacances, zone moins touristique |
| 1 | Professionnel du tourisme (office, agence) |

## Prochaines actions par étape

| Étape | Action automatique |
|-------|-------------------|
| `identified` | Rechercher site officiel + coordonnées |
| `verified` | Évaluer potentiel + personnaliser proposition |
| `qualified` | Préparer message de prospection |
| `to_contact` | Envoyer le message (autorisation requise) |
| `contacted` | Relance après 7 jours si pas de réponse |
| `response_received` | Qualifier l'intérêt, proposer le diagnostic |
| `interested` | Envoyer le lien de paiement (quand disponible) |
| `client` | Suivi, upsell vers Premium |
| `lost` | Archiver, ne plus contacter |

## Métriques du funnel (séparées)

| Métrique | Source | Ne pas confondre avec |
|----------|--------|----------------------|
| Visites landing page | Analytics first-party / GA4 | — |
| Formulaires commencés | Événement `sg_diagnostic_form_start` | Visites |
| Formulaires envoyés | Événement `sg_diagnostic_form_submit` | Formulaires commencés |
| Prospects enregistrés | Événement `sg_diagnostic_capture_confirmed` (serveur confirme) | Formulaires envoyés |
| Prospects qualifiés | Pipeline `qualified` | Prospects enregistrés |
| Ventes payées | Paiement Mollie confirmé (webhook) | Prospects qualifiés |
| Chiffre d'affaires | Somme des paiements confirmés | Ventes (peut inclure des remboursements) |

## Règle d'or

**Un formulaire envoyé n'est pas une vente.**
**Un prospect enregistré n'est pas un client.**
**Seul un paiement confirmé par Mollie compte comme une vente.**