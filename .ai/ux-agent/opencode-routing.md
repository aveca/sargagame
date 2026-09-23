# OpenCode Multi-Provider Routing — Sargagame

> Testé en réel le 2026-09-16. Ne PAS inventer d'autres IDs sans re-test.

## Auto-routeur `opencode-auto` (2026-09-16)

**Lancer OpenCode avec sélection automatique du backend** :

```bat
opencode-auto <args opencode>
:: exemples
opencode-auto --version
opencode-auto run "corrige le bug X"
opencode-auto            :: TUI interactif avec le 1er backend vivant
```

Ordre testé : Kimi K3 → DeepSeek V4 flash-0731 → Nemotron 3 Super → Ollama local.
Le 1er backend qui répond `2xx` à 1 requête chat `max_tokens=1` est choisi.
Indisponible = 401/402/403/404/408/410/429/5xx/timeout/connexion refusée.

Simulation de panne (test) : `set OC_AUTO_SKIP=kimi,deepseek,nemotron && opencode-auto ...`

Fichiers : `.ai/ux-agent/opencode-auto.cjs` (logique) · `.ai/ux-agent/opencode-auto.cmd` (shim repo) · `%APPDATA%\npm\opencode-auto.cmd` (shim global, PATH).

## ⚠️ Découverte 2026-09-16 : NVIDIA attribue des endpoints éphémères

- `deepseek-ai/deepseek-v4-flash-0731` listé dans `/v1/models` mais le POST renvoie
  `404 "Function id ... not found"` **selon l'heure** (testé OK à 19h30, 404 à 19h45).
- Conséquence : le health-check du launcher est **obligatoire** — faire confiance au
  catalogue `/v1/models` seul mènerait à sélectionner un backend mort.
- Kimi K3 cold-start NVIDIA observé à **~120 s** (requête 1-token). Ne pas baisser le
  timeout du launcher en dessous de 150 s.

## Chaîne de routing

| Rang | Modèle exact | Provider | Statut test | Latence (requête min.) |
|------|-------------|----------|-------------|------------------------|
| PRIMARY | `nvidia/moonshotai/kimi-k3` | NVIDIA (clé API en place, jamais affichée) | ✅ OK | ~3–5 s à chaud, **~120 s cold-start** |
| FALLBACK 1 | `nvidia/deepseek-ai/deepseek-v4-flash-0731` | NVIDIA | ⚠️ **intermittent** (OK à 19h30, 404 à 19h45) | ~4 s quand vivant |
| FALLBACK 2 | `nvidia/nvidia/nemotron-3-super-120b-a12b` | NVIDIA | ✅ OK | ~6 s |
| FALLBACK FINAL | `ollama/qwen2.5-coder:14b` | Ollama local (localhost:11434) | ✅ OK | ~39 s (1er appel, charge le modèle) |

## IDs morts (410 Gone sur NVIDIA au 2026-09-16) — ne pas utiliser

- `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `deepseek-v4-flash` (alias non datés)
- `qwen/qwen3.5-397b-a17b`, `z-ai/glm-5.2`, `meta/llama-3.3-70b-instruct`, `nvidia/nemotron-3-nano-30b-a3b`

## IDs inexistants / payants

- `ollama` local `qwen3.5:8b` → **404 registry Ollama, ce modèle n'existe pas**. Remplacé par `qwen2.5-coder:14b` (installé).
- `ollama-cloud/deepseek-v4-pro|v4.1-flash|kimi-k3` → 402, nécessite abonnement Ollama payant.

## Usage

Config : `opencode.jsonc` (racine repo). Agents `primary` : `build` (Kimi K3, défaut), `fb1-deepseek`, `fb2-nemotron`, `fb3-local`.

- En TUI : toucher **Tab** pour cycler `build → fb1-deepseek → fb2-nemotron → fb3-local`.
- En one-shot : `opencode run --agent fb1-deepseek "..."`.
- La bascule est **manuelle** (Tab) : opencode 1.18.9 n'a pas de re-try automatique multi-modèles en cas de 410/429. Le coût de bascule = 1 toucher.

## Simulation effectuée (preuve)

1. Primaire "mort" : `opencode run -m nvidia/deepseek-ai/deepseek-v4-pro "..."` → `410 Gone` (échec réel, pas simulé par mock).
2. Bascule agent : `opencode run --agent fb1-deepseek "..."` → `OK` (166 s car contexte repo chargé ; le modèle lui-même répond en ~4 s hors contexte).

## Limites

- Pas d'auto-fallback natif : si Kimi rate une session en cours, basculer manuellement (Tab). Une erreur mid-session ne re-route pas la conversation.
- `qwen2.5-coder:14b` (local) : qualité inférieure aux modèles cloud, uniquement dépannage.
- Les EOL NVIDIA datés (0731, 0813) finissent par disparaître : re-tester `fb1` mensuellement.
