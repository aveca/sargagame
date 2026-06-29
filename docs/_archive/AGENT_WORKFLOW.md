# AGENT_WORKFLOW.md — Accord de fonctionnement (autonomie)

> Préférences durables du fondateur pour le travail de l'agent Claude sur ce repo.
> Établi 2026-06-24. À respecter dans toutes les sessions.

## Autonomie & merge
- **Avancer sans demander de validation à chaque étape.** Le fondateur délègue ;
  ne pas redemander « je merge ? » à chaque PR.
- **Merger les PR de façon autonome** dès que : (a) la CI est **verte**, ET
  (b) le changement est **sûr / réversible / dormant** (ne casse rien, n'active pas
  de paiement, pas de migration destructive).
- **Demander d'abord UNIQUEMENT** pour : décisions vraiment ambiguës, choix
  d'architecture, pricing, ou tout ce qui **active/charge de l'argent** en prod.
- Push sur `main` = auto-deploy des 5 sites → un merge est un déploiement. C'est OK
  pour les changements sûrs ci-dessus.

## Branche & PR
- Développer sur **`claude/hello-vn2kry`** (créer si absente). Ne jamais pousser sur
  une autre branche sans permission explicite.
- Toujours **commit → push → PR**. PR en draft par défaut, passée ready avant merge.
- Messages de commit clairs ; build/`php -l`/tests vérifiés avant push.

## Paiements (contexte 2026-06)
- **Stripe = mort.** Remplaçant = **Mollie on-site** (PayPal écarté). En attente de
  validation Mollie (~4j) → paywall en **mode capture/waitlist** (`PAY_CAPTURE_ONLY=true`).
- **Ne pas activer les paiements** ni charger d'argent sans le go-live explicite du
  fondateur. Le code paiement/offres se prépare **dormant**, prêt à flipper.
- Détails & checklist go-live : `MOLLIE_MIGRATION.md`. Readiness : section dans ce même doc.

## Qualité / sécurité
- Rester conservateur sur le code argent : préparer + documenter plutôt que coder à
  l'aveugle une logique intestable (ex. récompense parrainage Mollie avant validation).
- Surfacer les contradictions (code vs réalité) au lieu de foncer.
- Persister les décisions/handoffs en `.md` (ce fichier, `MOLLIE_MIGRATION.md`,
  `NEXT_SESSION.md`) pour survivre aux sessions.
