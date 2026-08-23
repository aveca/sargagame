# 00 — START SESSION

Tu démarres une session de développement sur Sargagame.

## Étape 1 : Compréhension

Lis dans l'ordre :
1. `CLAUDE.md` (doctrine + état + money-path)
2. `AGENTS.md` (contrat universel)
3. `NEXT_SESSION.md` (handoff/WIP)
4. `git status` + `git log --oneline -5`
5. `git diff --stat HEAD~1` (dernière modification)

## Étape 2 : Diagnostic

Réponds au format :

```
STATUS:
- Région live : [MQ|GP|FL|PU|RM]
- État build : [OK|KO]
- Bundle eager : [X] Ko
- MRR estimé : [€]
- Dernier commit : [hash] [message]

RISKS:
- [risque immédiat 1]
- [risque immédiat 2]

Dette technique:
- [dette critique 1]
- [dette critique 2]

Opps business:
- [opportunité 1]
- [opportunité 2]
```

## Étape 3 : Plan

Si l'utilisateur a une demande :
1. Fichiers concernés (path exact)
2. Dépendances (imports, API, build)
3. Risques de régression
4. Rollback possible

Si aucune demande :
- Propose 3 tâches priorisées par impact business

## Règle

**Ne code rien** avant d'avoir :
- compris l'architecture
- identifié les fichiers concernés
- vérifié que l'existant ne couvre pas déjà le besoin
