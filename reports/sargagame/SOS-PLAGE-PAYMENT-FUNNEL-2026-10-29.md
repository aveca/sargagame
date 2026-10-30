# SOS Plage — diagnostic visuel et funnel paiement (29 octobre 2026)

## Défauts confirmés

1. Le titre SOS et la CTA inline de BeachSheet inséraient des balises HTML dans une chaîne passée à React. React affichait les balises comme du texte.
2. La description de l'offre SOS utilisait des balises <br/> dans une chaîne, elles aussi visibles littéralement.
3. Le conteneur SOS était rendu directement sur le backdrop plein écran, sans panneau dimensionné ni centré. Le composant possédait un panelRef pour son focus trap, mais ne l'attachait pas à la racine.
4. Le flux SOS renvoyait le client sur ?sos_success=1, alors que le gestionnaire global de retour Mollie écoute ?mollie_return=1.
5. Le flux SOS ne sauvegardait pas le paymentId dans sg_mollie_pending. Le gestionnaire de retour ne pouvait donc pas vérifier le paiement et accorder le pass SOS 24 h.
6. L'allowlist Supabase et l'agrégateur de funnel comptaient le démarrage et l'erreur SOS, mais pas le redirect vers le checkout ni le paiement SOS confirmé.
7. La certification historique MOLLIE_TEST_CERTIFICATION.md décrit une clé test_ sur le domaine de production. La capture Mollie montre également « this is a testmode payment ». Cette certification ne prouve donc pas qu'un paiement LIVE est opérationnel.

## Correctifs sur cette branche

- Titre rendu avec de vrais nœuds JSX et avantages rendus avec une liste HTML sémantique traduite FR/EN/ES.
- Panneau SOS responsive, centré, scrollable et accessible (role=dialog, aria-modal, titre associé, focus trap attaché).
- Retour de paiement unifié sur ?mollie_return=1 ; stockage du payment ID, pass SOS, durée d'un jour et plage choisie dans sessionStorage et localStorage avant redirection.
- Événements sg_sos_checkout_redirect et sg_sos_checkout_paid ajoutés au funnel, avec taux de start→redirect, redirect→paid et start→paid.
- Un test E2E Playwright local simule la création et la confirmation Mollie, sans requête vers un vrai checkout et sans prélèvement.
- Le Worker et le fallback PHP échouent fermé sur les six domaines publics quand la clé Mollie n'est pas live_. Les clés test restent autorisées en local/preview.
- La certification historique est explicitement étiquetée TEST ONLY.

## Blocage LIVE restant

Le Worker Cloudflare utilise un secret externe au dépôt : MOLLIE_API_KEY. Le checkout hébergé visible dans la capture indique que le runtime public utilise actuellement le mode test. La valeur du secret ne peut pas être lue ni corrigée par un changement de code dans GitHub.

Après merge et déploiement autorisé du garde-fou, l'opérateur doit définir une seule fois le secret Worker MOLLIE_API_KEY avec la clé LIVE Mollie du compte, via les secrets Cloudflare. Ne jamais committer ni transmettre cette clé. Ensuite, un vrai paiement LIVE de 1 € doit être autorisé et contrôlé dans Mollie, le webhook, la table Supabase payment_grants et le déblocage SOS.

## État de livraison

Les tests de contrat et le scénario Playwright utilisent des IDs et réponses simulés. Aucun paiement réel n'est effectué. Aucun secret n'est lu ou modifié. Aucun merge ni déploiement de production n'a été effectué.
