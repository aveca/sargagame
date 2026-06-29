# AGENT_WORKFLOW.md — Accord de fonctionnement (autonomie)

> Préférences durables du fondateur pour le travail de l'agent Claude sur ce repo.
> Établi 2026-06-24. À respecter dans toutes les sessions.

## Autonomie & merge
- **Avancer sans demander de validation à chaque étape.** Le fondateur délègue ;
  ne pas redemander « je merge ? » à chaque PR.
- **Merger les PR de façon autonome** dès que : (a) la CI est **verte**, ET
  (b) le changement est **sûr / réversible / additif** (ne casse rien d'existant,
  pas de migration destructive). Activer un paiement Mollie en fait partie : c'est
  permis et attendu (cf. § Paiements), pas un motif de blocage.
- **Décisions ambiguës / architecture / pricing → trancher via panel d'agents
  adverses (Workflow) et suivre LEUR verdict** (pas l'humain). Escalade au fondateur
  UNIQUEMENT pour la liste des vrais blocages : nouveau compte/secret tiers,
  action physique/légale, dépense non autorisée.
- Push sur `main` = auto-deploy des 5 sites → un merge est un déploiement. C'est OK
  pour les changements sûrs ci-dessus.

## Branche & PR
- Développer sur une **branche par item** (n'importe quel `claude/*`), commit → push
  → PR → CI verte → merge `main` (auto build+deploy).
- Toujours **commit → push → PR**. PR en draft par défaut, passée ready avant merge.
- Messages de commit clairs ; build/`php -l`/tests vérifiés avant push.

## Paiements (contexte 2026-06)
- **Mollie on-site = LIVE PARTOUT** (carte Components + Apple Pay natif). Go-live réels :
  EUR (MQ/GP) 25/06 · USD (florida/puntacana/rivieramaya) 26/06 (validé par un vrai
  paiement $5.99). **B2B recurring Mollie live depuis #210** (29/06 : `pro_monthly` 79€ /
  `brief_monthly` 29€ in-repo). **Stripe = legacy seul** (16 abos EUR continuent d'y
  facturer, source de vérité MRR ; liens USD DÉSACTIVÉS — ne jamais y renvoyer un CTA).
  `PAY_CAPTURE_ONLY` = **kill-switch par surface** (défaut `IS_NEW_REGION && !MOLLIE_LIVE_USD`),
  PAS un état waitlist global ; Barbados reste capture-only, non câblé Mollie.
- **L'agent câble ET déploie les changements de paiement lui-même, ADDITIVEMENT**
  (revue par agent adverse + un vrai paiement test post-deploy ; ne jamais casser le flux
  B2C existant). Escalade UNIQUEMENT la liste des vrais blocages (nouveau compte/secret
  tiers, action physique/légale, dépense non autorisée) — jamais pour le timing de go-live
  ni le pricing.
- Détails & checklist go-live : `MOLLIE_MIGRATION.md`. Readiness : section dans ce même doc.

## Qualité / sécurité
- Code argent : non-testable en local (API Mollie live) → **revue par agent adverse
  avant merge + un vrai paiement test post-deploy**. On câble et on ship quand même
  (additivement), on ne reste pas « dormant ».
- Surfacer les contradictions (code vs réalité) au lieu de foncer.
- Persister les décisions/handoffs en `.md` (ce fichier, `MOLLIE_MIGRATION.md`,
  `NEXT_SESSION.md`) pour survivre aux sessions.
