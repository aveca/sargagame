# Continuité OpenCode pour Factory V3 — capacités d'intégration

> **Principe directeur** : OpenCode reste un **outil utilisé par Factory**.
> Ce document décrit ce que Factory V3 doit pouvoir faire **sur** OpenCode
> (comme un opérateur humain le ferait), et non un remplacement de Factory.
> Aucun second orchestrateur n'est créé : `scripts/factory-v3/run.cjs` reste le
> seul orchestrateur de jobs ; `scripts/factory-v3/continuity.cjs` est une
> **opération ponctuelle** (détecter → lire → classifier → choisir → reprendre →
> vérifier) qui s'appuie sur les briques existantes.
>
> Module : `scripts/factory-v3/lib/continuity.cjs` · CLI : `scripts/factory-v3/continuity.cjs`
> Tests : `tests/unit/factory-v3-continuity.test.cjs` (10/10 verts)

---

## 1. Vue d'ensemble

```
continuity.cjs (CLI, UNE opération)
   │
   ├─ detectStuckSessions()      → session-registry.normalizeSession
   ├─ loadCheckpoint()           → checkpoints JSON atomiques (dernier point validé)
   ├─ classifySessionFailure()   → error-classifier.classifyFailure (429/5xx/auth/…)
   ├─ selectFallbackModel()      → model-registry (cooldowns) + failover.chooseNextCandidate
   ├─ decideRetry()/computeDelayMs() → retry-policy (backoff exponentiel + jitter, Retry-After)
   ├─ resumeSession()            → CLI local `opencode run --session <id>` (opérateur humain)
   ├─ verifyResume()             → failover.verifyModelUsed (preuve modèle+fournisseur+session)
   └─ journalContinuity()        → observer.appendJsonl (journal append-only, sans secret)
```

Anti-concurrence : `acquireContinuityLock()` / `releaseContinuityLock()` s'appuient sur
le verrou tokenisé de `model-registry` (`state/continuity/continuity.lock`). Une seule
opération de continuité peut s'exécuter à la fois, tous runners confondus.

---

## 2. Les 8 capacités requises

### Capacité 1 — Détecter une session OpenCode bloquée

| Élément | Valeur |
|---|---|
| Primitive | `continuity.detectStuckSessions({ sessions, nowMs })` |
| Source | CLI `opencode session list --format json -n <n>` (lecture seule) |
| Règle | une session est « bloquée » si son état normalisé est `WAITING`, `BLOCKED` ou `RECOVERING`, ou si elle est `stale` (silence > `SESSION_STALE_MS`) |
| Preuve | `state/continuity/journal.jsonl` (entrée `CONTINUITY_*`), sortie CLI `--inspect` |

### Capacité 2 — Lire son dernier état

| Élément | Valeur |
|---|---|
| Primitive | `continuity.loadCheckpoint(stateDir, sessionId)` / `saveCheckpoint(...)` |
| Support | `state/continuity/checkpoints/<sessionId>.json`, écriture atomique (`writeJsonAtomic`) |
| Contenu | dernier point validé (commit, étape, modèle actif), horodatage, catégorie de la dernière erreur |
| Garantie | le contexte n'est jamais perdu : la reprise repart de ce point, pas de zéro |

### Capacité 3 — Identifier une erreur fournisseur

| Élément | Valeur |
|---|---|
| Primitive | `continuity.classifySessionFailure({ stdout, stderr, events })` |
| Moteur | `error-classifier.classifyFailure` (catégories : `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `PROVIDER_UNAVAILABLE`, `AUTH_ERROR`, `CODE_ERROR`…) |
| Sortie | `{ category, providerLimited, modelSpecific, httpStatus, retryAfterMs, reason }` |
| Distinction clé | `429` fournisseur (transitoire, bascule possible) ≠ erreur de code (aucune bascule) ≠ auth (bascule sans retry) |

### Capabilité 4 — Sélectionner un modèle de secours

| Élément | Valeur |
|---|---|
| Primitive | `continuity.selectFallbackModel({ registry, currentModel, classification, candidates })` |
| Moteur | `model-registry` (cooldowns, breakers, limites par fournisseur) + `failover.chooseNextCandidate` |
| Règle | fournisseur limité → **autre fournisseur** ; problème propre au modèle → **autre modèle du même fournisseur** ; modèle en cooldown → écarté |
| Aucun doublon | la logique de sélection n'est pas réimplémentée : elle est empruntée au moteur de failover existant |

### Capacité 5 — Interagir avec OpenCode comme un opérateur humain

| Élément | Valeur |
|---|---|
| Primitive | `continuity.resumeSession(...)` |
| Commande | `opencode run --dir <repo> -m <provider/model> --format json --print-logs --log-level INFO --title factory-continuity-<id> --session <id> "<prompt>"` |
| Identité d'opérateur | on **rouvre la session existante** (`--session`) au lieu d'en créer une nouvelle : l'historique, le contexte et les identifiants de session sont conservés |
| Sécurité | aucune valeur de secret n'est passée dans le prompt (redaction `redactText`) |

### Capacité 6 — Envoyer un prompt de reprise

| Élément | Valeur |
|---|---|
| Primitive | `continuity.buildContinuityPrompt({ mission, checkpoint, errorText, modelRef, providerID })` |
| Contenu | mission d'origine + **dernier point validé** + erreur constatée + consigne « REPRISE APRES BASCULE DE MODELE : ne pas rejouer les étapes validées, ne rien fabriquer » |
| Reprise | le prompt est envoyé **dans la session existante** : le contexte OpenCode est conservé |

### Capacité 7 — Superviser les commandes et les résultats

| Élément | Valeur |
|---|---|
| Primitive | `continuity.resumeSession()` (résultat) + `continuity.journalContinuity()` |
| Supervision | `exec.runProcess` retourne `exitCode`, `timedOut`, `idleTimedOut`, `stdout`, `stderr`, durée, PID, et les fichiers de log `%TEMP%/factory-v3-exec/*.log` |
| Journal | `state/continuity/journal.jsonl` — append-only, une entrée par opération (`CONTINUITY_RESUME`, `CONTINUITY_NO_FALLBACK`, `CONTINUITY_LOCK_BUSY`, `CONTINUITY_DRY_RUN`) |
| Backoff | `retry-policy.decideRetry()` → délai exponentiel + jitter, `Retry-After` prioritaire (jamais de boucle infinie : max 3 tentatives par fournisseur) |

### Capacité 8 — Vérifier que la session a effectivement repris

| Élément | Valeur |
|---|---|
| Primitive | `continuity.verifyResume({ result, sessionId, modelRef })` |
| Preuve exigée | `failover.verifyModelUsed` : le **modèle**, le **fournisseur** et l'**identifiant de session** doivent apparaître sur **la même ligne** de log |
| Refus | si la preuve ne correspond pas → `verified: false` → la reprise est déclarée **NON vérifiée** (code de sortie 3), jamais « réussie » |
| Mise à jour | le checkpoint passe à `verified: true` et le registre Factory enregistre `recordSuccess` + `recordFailover` + `recordResume` |

---

## 3. Runbook

```bash
# 1) Voir les sessions bloquées (lecture seule, aucun quota consommé)
node scripts/factory-v3/continuity.cjs --inspect --limit 40

# 2) Voir le journal de continuité et les checkpoints
node scripts/factory-v3/continuity.cjs --status --limit 20

# 3) Reprendre une session précise (dry-run d'abord : aucune écriture)
node scripts/factory-v3/continuity.cjs --resume --session ses_xxx --dry-run
node scripts/factory-v3/continuity.cjs --resume --session ses_xxx --mission "Reprendre la Phase 0.7"

# 4) Reprise réelle
node scripts/factory-v3/continuity.cjs --resume --session ses_xxx --candidate nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b --candidate ollama/qwen2.5-coder:7b
```

Codes de sortie : `0` reprise vérifiée · `1` erreur · `2` aucune session bloquée ·
`3` reprise non vérifiée · `4` verrou occupé (opération concurrente).

---

## 4. Limites assumées (honnêteté)

- Le CLI ne **fabric** aucune preuve : sans ligne de log contenant modèle + fournisseur +
  session, la reprise est marquée non vérifiée.
- Une erreur de code (`CODE_ERROR`) ou de coût (`COST_VIOLATION`) **ne** déclenche
  **jamais** de changement de modèle : c'est le contrat existant du moteur de failover.
- La continuité agit sur **une** session à la fois : le verrou interdit les exécutions
  concurrentes (une session OpenCode ne peut pas recevoir deux consignes simultanées).
- Le module ne remplace ni la boucle de jobs (`run.cjs`) ni le registre de sessions
  (`session-registry.cjs`) : il s'y branche.
- Les secrets ne transitent ni dans le prompt, ni dans le journal, ni dans les logs
  de la continuité (`redactText` est appliqué systématiquement).
