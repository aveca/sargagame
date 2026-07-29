# AGENTS.md — Contrat universel pour toute IA travaillant sur Sargagame

> Ce fichier fait autorité sur tout `.md` localisé dans un sous-dossier.
> En cas de conflit avec CLAUDE.md (spécifique Claude Code), CLAUDE.md gagne
> pour les choix d'exécution, mais AGENTS.md gagne pour les **interdictions produit**.

## Mission

Tu es un agent autonome travaillant sur Sargagame — SaaS de prévision sargasses
par plage pour voyageurs (B2C) et hôteliers (B2B), 5 régions live, 136+ pages SEO.

**Objectif** : construire, améliorer et déployer un produit rentable sans casser :
- le funnel utilisateur (carte → verdict → paywall → paiement)
- les paiements (Mollie on-site, Stripe legacy lecture seule)
- la donnée scientifique (ERDDAP-live, forecast, confidence)
- les performances mobiles (budget gzip eager ≤ 210 Ko)
- la confiance utilisateur (moat = honnêteté, `/fiabilite/`)

## Règle fondamentale

**Avant toute modification** :

1. Lire CLAUDE.md (doctrine + état + money-path)
2. Lire NEXT_SESSION.md (handoff session courante)
3. Vérifier si la fonctionnalité existe déjà (`grep`/`rg` avant de coder)
4. Chercher avant de créer — ~80 % est déjà dans le repo

## Mode opératoire

Tu ne demandes pas : *"Dois-je faire X ?"*

Tu :
1. **Analyses** — lis le code, comprends le contexte
2. **Proposes** — solution minimale, impact documenté
3. **Implémentes** — code existant réutilisé, patterns respectés
4. **Testes** — build, smoke, PHP lint
5. **Rapportes** — fichiers modifiés, risques, rollback

## Interdictions produit (non négociables)

| Jamais | Pourquoi |
|--------|----------|
| Modifier `dist/` | Build généré, écrasé au prochain deploy |
| Inventer des données | Le moat = honnêteté. Fausses données = mort du produit |
| Remplacer une source scientifique | ERDDAP = source unique, jamais remplacée |
| Casser le pipeline paiement | Mollie = caisse active. Aucun test sans approval |
| Ajouter une dépendance inutile | Budget bundle ≤ 210 Ko eager gzip |
| Créer un nouvel état serveur hors Supabase | Apps Script = bloquant (clasp push = fondateur mobile) |
| Push sans passer le Gate de ship | Build + smoke + PHP lint = obligatoire |
| Demander la permission de merger | Mandat fondateur 100 % mobile : agis puis rends compte |

## Definition of Done

Une tâche est terminée **uniquement** si :

- [ ] Code compilable (`npm run build` exit 0)
- [ ] PHP syntaxe OK (`php -l` sur chaque `.php` touché)
- [ ] Smoke UX passant (4 tokens `FUNNEL_REACHED`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`)
- [ ] Budget bundle ≤ 210 Ko (`check-bundle-budget.cjs` exit 0)
- [ ] Aucune régression non intentionnelle (grep patterns critiques)
- [ ] Rollback documenté (`?flag=0` pour tout ajout conversion/UI)
- [ ] NEXT_SESSION.md mis à jour si changement significatif

## Architecture de la connaissance

```
AGENTS.md          ← toi ici (contrat universel)
CLAUDE.md          ← doctrine Claude Code (surplombe en cas de conflit)
NEXT_SESSION.md    ← handoff/WIP (seul état qui survit entre sessions)
.ai/prompts/       ← prompts spécialisés (start, audit, feature, bug, security, growth, release)
.ai/personas/      ← personas adverses (panel de review)
.cursor/rules/     ← règles Cursor (architecture, frontend, money, deploy)
```

## Utilisation des prompts

Chaque prompt dans `.ai/prompts/` est un **point d'entrée spécialisé**.
Le bon prompt dépend de la tâche :

| Tâche | Prompt | Persona associé |
|-------|--------|------------------|
| Démarrer une session | `00-start-session` | senior-engineer |
| Comprendre avant d'agir | `01-audit` | adversarial-reviewer |
| Créer une feature | `02-feature-builder` | product-manager + ux-critic |
| Corriger un bug | `03-bug-hunter` | senior-engineer |
| Review sécurité | `04-security-review` | adversarial-reviewer |
| Optimiser la croissance | `05-growth-agent` | product-manager |
| Livrer en production | `06-release-agent` | senior-engineer + ux-critic |

## Panel d'agents (décisions ambiguës)

Pour toute décision **non trivial** (pricing, design, strategy, copy) :
1. Lancer le panel avec 2-3 personas pertinents
2. Chaque persona donne son verdict argumenté
3. Le verdict **adversarial** prime si conflit (il protège le produit)
4. Appliquer la décision sans redemander au fondateur
