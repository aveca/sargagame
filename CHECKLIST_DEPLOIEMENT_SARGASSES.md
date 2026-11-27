# Checklist de déploiement — Sites Sargasses

À cocher avant chaque mise en ligne sur un site Sargasses.

## Avant intégration (code)

- [ ] Fichier `cta-styles.css` copié et accessible sur le site
- [ ] Fichier `consent-manager.js` copié et accessible
- [ ] Fichier `events.js` copié et accessible
- [ ] Bandeau RGPD (`gdpr-banner.html`) inséré avant `</body>` sur chaque page
- [ ] Attribut `data-site` renseigné sur `<body>` (ex: `sargasses_martinique`)
- [ ] Liens Stripe pointent vers des URLs TEST (`buy.stripe.com/TEST_…`)
- [ ] Prix affichés inchangés (7,99 € / 14,99 € / 24,99 €, Pro 79 €/mois, 690 €/an)

## Sur chaque page (carte, offres, fiabilité, alertes)

- [ ] CTA principal présent avec `data-cta`, `data-page`, `data-site`
- [ ] Lien vers la page Offres présent sur la page Carte
- [ ] Lien vers la page Carte présent sur la page Alertes et Fiabilité
- [ ] Bandeau sticky mobile présent sur Carte et Prévisions (si applicable)
- [ ] Scripts `consent-manager.js` puis `events.js` chargés après le bandeau RGPD

## Tests fonctionnels

- [ ] Bandeau RGPD s'affiche au premier chargement
- [ ] Clic sur "Accepter" masque le bandeau et stocke le consentement
- [ ] Aucun événement tracking envoyé avant consentement
- [ ] Après consentement, clic sur un CTA envoie `cta_click`
- [ ] Formulaire d'alerte envoie `form_submit` après consentement
- [ ] Boutons Stripe ouvrent bien une page de paiement TEST
- [ ] Aucune erreur console JavaScript
- [ ] Affichage correct sur mobile (pas de scroll horizontal, zone tactile ≥ 44px)

## Mise en production (seulement après validation ci-dessus)

- [ ] Remplacer les liens TEST par les vrais liens Stripe Payment Links (uniquement avec votre accord explicite)
- [ ] Configurer `CONFIG.provider` et `CONFIG.measurementId` dans `events.js` (GA4 ou Matomo)
- [ ] Vérifier que les événements remontent dans votre outil d'analyse
- [ ] Documenter les CGV et le droit de rétractation si ce n'est pas déjà fait

## Après déploiement (J+7, J+30)

- [ ] Vérifier le taux de clic des CTA principaux
- [ ] Vérifier le taux de soumission du formulaire d'alerte
- [ ] Vérifier le taux d'initiation de paiement (checkout_initiated)
- [ ] Produire un rapport simple à J+30
