# AI Operating System — Sargagame

## Architecture

Ce dossier contient les prompts et personas pour les agents IA travaillant sur Sargagame.

## Structure

```
.ai/
├── prompts/              # Points d'entrée spécialisés
│   ├── 00-start-session  # Démarrage de session (OBLIGATOIRE)
│   ├── 01-audit          # Comprendre avant d'agir
│   ├── 02-feature-builder # Créer une feature
│   ├── 03-bug-hunter     # Corriger un bug
│   ├── 04-security-review # Review sécurité
│   ├── 05-growth-agent   # Optimiser la croissance
│   ├── 06-release-agent  # Livrer en production
│   └── 07-univers-motion-agent # Univers & Motion (Le Veilleur)
│
└── personas/             # Panel d'agents adverses
    ├── senior-engineer   # Faisabilité technique
    ├── product-manager   # Impact business
    ├── ux-critic         # Expérience mobile
    └── adversarial-reviewer # Failles et risques
```

## Utilisation

### Par tâche

| Tâche | Prompt | Persona |
|-------|--------|---------|
| Début de session | `00-start-session` | senior-engineer |
| Comprendre le code | `01-audit` | adversarial-reviewer |
| Créer une feature | `02-feature-builder` | product-manager + ux-critic |
| Corriger un bug | `03-bug-hunter` | senior-engineer |
| Review sécurité | `04-security-review` | adversarial-reviewer |
| Optimiser revenue | `05-growth-agent` | product-manager |
| Déployer | `06-release-agent` | senior-engineer + ux-critic |
| Univers & Motion (Le Veilleur) | `07-univers-motion-agent` | design visuel + copywriter narratif + ux-critic |

### Panel de review

Pour toute décision non trivial :
1. Lire les 2-3 personas pertinents
2. Chaque persona donne son verdict
3. Le verdict **adversarial** prime en cas de conflit
4. Appliquer sans redemander

## Intégration

### Claude Code
Claude Code lit automatiquement `CLAUDE.md` + `AGENTS.md`.
Les prompts sont des instructions complémentaires.

### Cursor
Les règles `.cursor/rules/*.mdc` sont chargées automatiquement selon les globs.

### OpenCode
OpenCode lit `AGENTS.md` comme contrat universel.
Les prompts sont des instructions complémentaires.

## Règle

**AGENTS.md fait autorité.** En cas de conflit avec un autre fichier,
AGENTS.md gagne pour les interdictions produit.
