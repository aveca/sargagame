# Audit GitHub Actions — Sargagame

Date : 2026-10-30
Dépôt : aveca/sargagame
Périmètre : les 38 fichiers de .github/workflows, références d'actions, runtimes, permissions, déclencheurs et échecs d'exploitation observés.

## Résultat exécutif

- 38 workflows présents. Les anciens inventaires de 11 et 33+ étaient incomplets.
- 127 références d'actions, pour 8 actions externes uniques. Chaque référence externe est épinglée sur un SHA de commit complet de 40 caractères.
- 7 workflows qui installaient Node.js 20 installent désormais Node.js 24.
- Deux workflows sont shell-only et n'utilisent aucune action tierce : check-mail-backlog.yml et setup-mail-forwarders.yml.
- Le contrôle scripts/autopilot/check-github-actions-policy.cjs est exécuté par CI Tests. Il bloque les références d'actions non épinglées, les SHA inattendus pour les actions gérées et les cibles Node.js 20.
- Les workflows read-only déclarent contents: read. Les permissions d'écriture des pipelines multi-jobs ont été réduites aux jobs qui publient ou commitent réellement.

## Actions épinglées

| Action | Version | SHA |
|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| actions/upload-artifact | v7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |
| actions/download-artifact | v8.0.2 | 9000827ccba6bdab643e8b6fd33ac0654aef8333 |
| actions/cache | v6.1.0 | 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 |
| supabase/setup-cli | v3.0.1 | 45a513f8c64c0bc8e0e3dfe572b5c95be85f6359 |
| lycheeverse/lychee-action | v2.9.0 | e7477775783ea5526144ba13e8db5eec57747ce8 |
| cloudflare/wrangler-action | v4.1.3 | 953926a2e2182532811c01a25e53647d93bf07c0 |

Les 7 migrations de Node.js 20 vers 24 concernent : agent-handoff.yml, apply-supabase-schema.yml, cine-atlas.yml, daily-social-reservoir.yml, ga4-diagnose.yml, release-social-reservoir.yml et scene-clips.yml.

## Inventaire exhaustif des workflows

Les déclencheurs sont résumés par catégorie ; les expressions cron et filtres exacts restent dans les YAML, qui sont la source de vérité.

| Workflow | Déclencheurs | Rôle / garde opérationnelle |
|---|---|---|
| ab-evaluator.yml | Planifié + manuel | Analyse UX first-party et verdicts A/B. |
| agent-handoff.yml | Planifié + manuel | Boucle de handoff des agents ; crée branches et PR, nécessite les droits d'écriture correspondants. |
| apply-supabase-schema.yml | Push main sur chemins de schéma + manuel | Applique le schéma au projet Supabase live ; sensible, voir décisions. |
| check-mail-backlog.yml | Manuel | Lit les messages IMAP en attente et les transfère ; shell-only. |
| ci-tests.yml | Push + PR + manuel | Tests du dépôt ; inclut la nouvelle politique de pinning. |
| cine-atlas.yml | Manuel | Rendu de clips/vidéos via FFmpeg. |
| cloudflare-production.yml | Push main + workflow_run + manuel | Déploiement Workers/Pages avec portes de fraîcheur, certification et paiement. |
| daily-brief.yml | Planifié + manuel | Email quotidien aux abonnés et commit du marqueur anti-doublon. |
| daily-copernicus.yml | Planifié + push main + manuel | Ingestion ERDDAP, gate intégrité/fraîcheur, métriques, email automation et orchestration build. |
| daily-social-reservoir.yml | Planifié + manuel | Prépare le réservoir de contenus sociaux. |
| data-refresh.yml | Planifié + manuel | Chemin secondaire de refresh ERDDAP ; rôle de secours conservé. |
| deploy-edge-function.yml | Manuel | Déploiement d'une Supabase Edge Function. |
| factory-cloud-runner.yml | Manuel, double opt-in | Runner Ollama hébergé legacy neutralisé ; hors du routage Factory actif. |
| ga4-diagnose.yml | Manuel | Diagnostics GA4. |
| generate-og-images.yml | Planifié + manuel | Génération et commit des images Open Graph. |
| live-production-sentinel.yml | Planifié + manuel | Surveillance production/CI et remontée d'incidents GitHub. |
| morning-brief.yml | Planifié + manuel | Brief matinal OneSignal. |
| notify-photos.yml | Planifié + manuel | Scrutation et notification des photos visiteurs. |
| perf-budget.yml | PR + push main + manuel | Budget performance et rapport Lighthouse. |
| provision-barbados.yml | Manuel | Provisioning/déploiement Barbados. |
| provision-ga4.yml | Manuel | Création/vérification des propriétés GA4 régionales. |
| provision-gsc.yml | Manuel | Création/vérification des propriétés Search Console et délégation. |
| push-debug.yml | Manuel | Diagnostic OneSignal ; jamais planifié. |
| relance-gap.yml | Manuel | Relance lead/pass ; send mode false par défaut. |
| release-social-reservoir.yml | Manuel | Publication explicite du contenu social préparé. |
| revoke-pass.yml | Manuel uniquement | Révocation d'accès et mise à jour des enregistrements pour remboursement/chargeback. |
| scene-clips.yml | Manuel | Rendu de scènes/clips. |
| seo-guard.yml | Planifié + PR + manuel | Vérification sitemap/liens live ; lecture seule. |
| setup-mail-forwarders.yml | Manuel | Création des forwarders cPanel vers Gmail ; shell-only. |
| smtp-test.yml | Manuel | Autotest SMTP. |
| support-reply.yml | Manuel | Envoi d'une réponse support préparée. |
| user-journey-audit.yml | Planifié + workflow_run + manuel | Audit E2E des parcours et rapport d'incidents. |
| veilleurs.yml | Planifié + manuel | Orchestration de veilles et commit de synthèse. |
| weekend-email.yml | Planifié + manuel | Bulletin abonnés du week-end et marqueur anti-doublon. |
| weekly-optimize.yml | Planifié + manuel | Optimisation CRO/analytics et rapports hebdomadaires. |
| weekly-outreach.yml | Planifié + manuel | Emails sortants backlinks/B2B ; sensible, voir décisions. |
| weekly-seo-automation.yml | Planifié + manuel | Audits SEO, mises à jour et rapports. |
| weekly-ux-report.yml | Planifié + manuel | Rapport UX/GA4 hebdomadaire. |

## Réduction de permissions

- ci-tests.yml et perf-budget.yml demandent explicitement contents: read.
- Les workflows read-only et diagnostic déclarent contents: read au lieu d'hériter des permissions par défaut du dépôt.
- daily-copernicus.yml a maintenant contents: read par défaut. fetch-data reçoit contents: write + actions: write ; email-automation reçoit contents: write ; retry conserve seulement actions: write + contents: read.
- daily-brief.yml, weekend-email.yml et weekly-outreach.yml ont contents: read par défaut ; seul le job qui commit les marqueurs/états reçoit contents: write.
- veilleurs.yml donne contents: write uniquement au job synthesis qui commit le digest.
- Les workflows à job unique qui doivent publier ou provisionner gardent les permissions nécessaires à leur propre fonction. Aucun gate de production ou de sécurité n'a été assoupli.

## Incidents observés dans les runs du 30 octobre 2026

### Fraîcheur des données / production

Les échecs récents de Cloudflare Production, Daily Copernicus + Deploy et Data Freshness proviennent du gate de fraîcheur satellite existant, pas de la migration des actions. Le gate refuse les observations ERDDAP au-delà du SLA opérationnel de 900 minutes. Les exemples observés dans les logs étaient d'environ 1 509 à 1 757 minutes de retard et un contrôle régional pré-déploiement mesurait 4 550 minutes. Le pipeline a donc bloqué la publication/le déploiement au lieu de présenter des données anciennes comme actuelles.

Live Production Sentinel a signalé un état dégradé et des échecs CI dans la même période. Ses logs ne prouvent pas une panne HTTP live ; les preuves pointent d'abord vers les échecs CI et la fraîcheur des données. Ne pas abaisser le SLA pour obtenir un run vert.

### Livraison des emails

Les jobs mail ont montré des refus/timeouts de connexion SMTP et un rejet d'authentification SMTP 535. Il faut traiter cela séparément comme un problème de fournisseur/identifiants. Aucun secret, destinataire, envoi, ni retry n'a été modifié ou lancé pendant cet audit.

## Décisions requérant une validation explicite — laissées inchangées

1. **Application automatique du schéma Supabase live** — apply-supabase-schema.yml se lance sur push main quand les fichiers de schéma/script changent, ainsi qu'en manuel. Le workflow appelle l'API Management Supabase live. Décider si les changements de schéma doivent rester automatiques ou passer par une approbation/manuelle avant de modifier le déclencheur.
2. **Purge planifiée de données** — daily-copernicus.yml contient l'étape planifiée Purge analytics_events (>90j), avec la clé de service Supabase. La rétention/suppression est destructive ; confirmer durée, sauvegarde et restauration avant de modifier.
3. **Prospection sortante planifiée** — weekly-outreach.yml a un déclencheur hebdomadaire actif et fixe OUTREACH_INTL=1 ; les scripts envoient des emails de prospection backlinks/B2B. Aucun envoi n'a été lancé pendant l'audit. Confirmer si ce programme planifié doit rester actif ou être suspendu.
4. **Autres messages abonnés/marketing planifiés** — daily-copernicus contient des opérations OneSignal win-back et des alertes SMTP/revenue/UX/deliverability ; d'autres workflows envoient les bulletins quotidiens/hebdomadaires. Aucun envoi massif n'a été lancé ni modifié.
5. **Workflows manuels à impact élevé** — revoke-pass.yml, setup-mail-forwarders.yml, provision-barbados.yml et deploy-edge-function.yml restent manuels par conception. Conserver leurs garde-fous.

## Limites de cette livraison

Le runner GitHub hébergé basé sur Ollama reste neutralisé. La route Factory active est documentée comme utilisant des API cloud (NVIDIA et quotas cloud gratuits disponibles), pas Ollama local ; aucun modèle local n'a été installé ou invoqué. Cette livraison porte sur les workflows, le pinning d'actions, les permissions et les tests. Elle ne modifie ni données satellite, ni tunnel de paiement/checkout, ni prix, ni secrets, ni destinataires d'emails, ni contenu de la base de production.
