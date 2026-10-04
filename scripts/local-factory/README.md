# Usine locale Sargasses — Couche C

> Couche locale complémentaire : rendu vidéo/animation et publication sociale. Le cloud reste la couche critique pour la donnée, le déploiement et le revenu.

## Architecture actuelle

| Couche | Fonction | PC éteint ? |
|---|---|---|
| **A — GitHub Actions + Cloudflare/hosting** | données Copernicus, build, déploiement, health checks, growth/ops | ✅ |
| **B — Agents locaux** | raisonnement/implémentation ponctuelle | ❌ |
| **C — Local factory** | rendu, contenu et publication locale | ❌ |

Le local n'est pas le source of truth des données scientifiques ni du paiement.

## Observabilité

La couche A dispose maintenant d'un sentinel de production qui contrôle périodiquement les domaines publics, le smoke paiement, les échecs GitHub Actions et, lorsque configuré, les erreurs des Workers Cloudflare. Les incidents sont fingerprintés pour éviter une avalanche de tickets identiques.

## Principe de sécurité

Aucune automation locale ne doit copier des secrets dans le dépôt. Les secrets Cloudflare/Mollie/Supabase restent dans GitHub Actions ou dans les emplacements de configuration protégés prévus par le projet.

## Contenu local

La factory locale :
1. récupère le dernier état utile du dépôt ;
2. produit les briefs/vidéos locaux ;
3. publie uniquement les canaux explicitement activés ;
4. écrit un journal de run et rattrape au redémarrage.

Les tâches non-monetary-critical peuvent attendre le prochain boot sans mettre en danger la couche A.
