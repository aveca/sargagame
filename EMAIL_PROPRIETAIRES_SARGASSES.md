# Email type — À envoyer aux propriétaires des sites Sargasses

Objet : Intégration CTA, suivi d'audience et liens de paiement — Sites Sargasses (Martinique / Guadeloupe / …)

Bonjour,

Je vous transmets un package prêt à intégrer sur votre site sargasses afin d'améliorer le tunnel de conversion et le suivi d'audience, en respectant le RGPD (CNIL) et vos prix actuels.

## Ce qui est inclus

1. **Composants CTA réutilisables** : boutons, liens contextuels, bandeau sticky mobile.
2. **Bandeau consentement RGPD / CNIL** : affichage obligatoire avant tout suivi analytique.
3. **Tracking d'événements** : clics sur CTA, impressions, soumissions de formulaires, initiation de paiement (compatible GA4 / Matomo).
4. **Liens Stripe configurés** : liens TEST par défaut (aucun vrai paiement activé).
5. **Page « Alertes »** : formulaire d'inscription aux alertes gratuites (7 jours).

## Ce qui ne change pas

- Vos prix et conditions existants restent inchangés.
- Aucun vrai paiement n'est activé tant que vous ne remplacez pas les liens TEST par vos vrais liens Stripe.
- Aucun suivi utilisateur avant consentement explicite via le bandeau RGPD.

## Étapes d'intégration

1. Copiez les fichiers du package sur votre serveur.
2. Suivez le guide `INTEGRATION_SARGASSES.md` (copier-coller du CSS, des scripts, du bandeau RGPD et des CTA sur chaque page).
3. Testez en local ou en staging.
4. Remplacez les liens `buy.stripe.com/TEST_…` par vos vrais liens Stripe Payment Links quand vous serez prêt.
5. Déployez en production.

## Contact

Je reste disponible pour toute question sur l'intégration ou l'adaptation à votre charte graphique.

Cordialement,
