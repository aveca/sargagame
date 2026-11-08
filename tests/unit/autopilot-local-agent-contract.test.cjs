'use strict'

// tests/unit/autopilot-local-agent-contract.test.cjs
//
// GARDE-FOU : l'agent LOCAL de la factory doit pouvoir DÉMARRER.
//
// RÉGRESSION RÉELLE (constatée le 2026-11-08 sur le PC du fondateur) :
// la factory était vivante (heartbeat frais, lock détenu, statuts GitHub
// publiés) et ne produisait AUCUN travail. Chaque mission se terminait par
// « impl failed after 4 attempts: agent exit 3 ».
//
// Deux causes cumulées, toutes deux dans le dépôt :
//
// 1. `implement.cjs` lançait l'agent SANS nettoyer l'environnement. L'env du
//    runner porte `NVIDIA_API_KEY` (portée User), et l'adaptateur
//    `.ai/ux-agent/opencode-auto.cjs` refuse CLOUd credentials → `exit 3`
//    AVANT même de démarrer. Le chemin jumeau
//    (`local-agent-executor.cjs`) nettoyait déjà l'env : les deux chemins
//    d'agent ne partageaient pas le même contrat.
//
// 2. OpenCode 1.18.34 n'expose PAS de provider `ollama` intégré sur cette
//    machine : `opencode models ollama` → « Provider not found: ollama », et
//    l'agent échouait avec une erreur opaque (« Unexpected server error »)
//    alors que le modèle local répondait parfaitement (vérifié : exit 0,
//    réponse « OK »). Ollama expose une API compatible OpenAI sur `/v1` :
//    il suffit de DÉCLARER le provider.
//
// Ce test verrouille les deux invariants.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const IMPLEMENT = path.join(ROOT, 'scripts', 'autopilot', 'implement.cjs')
const ADAPTER = path.join(ROOT, '.ai', 'ux-agent', 'opencode-auto.cjs')
const EXECUTOR = path.join(ROOT, 'scripts', 'autopilot', 'local-agent-executor.cjs')

// ── 1. Le spawn de l'agent nettoie les credentials cloud ─────────────────────

const implementSource = fs.readFileSync(IMPLEMENT, 'utf8')

for (const key of ['NVIDIA_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY']) {
  assert.ok(
    new RegExp(`${key}:\\s*undefined`).test(implementSource),
    `scripts/autopilot/implement.cjs must strip ${key} from the agent environment — the local-only adapter refuses cloud credentials and exits 3, so the agent could never start`,
  )
}
assert.ok(
  /SARGA_LOCAL_ONLY:\s*'1'/.test(implementSource),
  'scripts/autopilot/implement.cjs must set SARGA_LOCAL_ONLY=1 for the agent (same contract as local-agent-executor.cjs)',
)
assert.ok(
  /OLLAMA_HOST:/.test(implementSource),
  'scripts/autopilot/implement.cjs must pass OLLAMA_HOST to the agent so it reaches the local Ollama server',
)

// Le chemin jumeau doit rester conforme (les DEUX chemins d'agent).
const executorSource = fs.readFileSync(EXECUTOR, 'utf8')
for (const key of ['NVIDIA_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
  assert.ok(
    new RegExp(`${key}:\\s*undefined`).test(executorSource),
    `scripts/autopilot/local-agent-executor.cjs must keep stripping ${key}`,
  )
}

// ── 2. L'adaptateur déclare le provider local ───────────────────────────────

const adapterSource = fs.readFileSync(ADAPTER, 'utf8')

assert.ok(
  /OPENCODE_CONFIG/.test(adapterSource),
  '.ai/ux-agent/opencode-auto.cjs must export a provider configuration through OPENCODE_CONFIG — OpenCode 1.18.34 has no built-in `ollama` provider on this machine (Provider not found: ollama)',
)
assert.ok(
  /@ai-sdk\/openai-compatible/.test(adapterSource),
  '.ai/ux-agent/opencode-auto.cjs must register the local provider with @ai-sdk/openai-compatible (Ollama serves an OpenAI-compatible API on /v1)',
)
assert.ok(
  /baseURL:\s*ollamaBase\s*\+\s*'\/v1'/.test(adapterSource),
  ".ai/ux-agent/opencode-auto.cjs must point the local provider at ollamaBase + '/v1'",
)

// La config ecrite doit etre un MERGE, pas un remplacement : la config
// globale du fondateur porte les permissions (`edit`/`bash: allow`) dont
// l'agent a besoin pour modifier les fichiers.
assert.ok(
  !/delete\s+env\.OPENCODE_CONFIG/.test(adapterSource),
  '.ai/ux-agent/opencode-auto.cjs must not delete the global OPENCODE_CONFIG — the local provider config is MERGED with it so the founder permissions stay active',
)

// ── 4. Un agent qui « réussit » sans rien changer reste DIAGNOSTIQUABLE ────
//
// Cas RÉEL observé le 2026-11-08 : l'agent local a bien démarré (exit 0) et
// a même appelé son outil d'écriture, mais le modèle local (9B) a produit un
// CHEMIN CORROMPU (`tests/u nit/.agent-probe.txt` au lieu de
// `tests/unit/.agent-probe.txt`). Le diff du worktree est donc resté vide et
// le parcage ne disait QUE « scope violation: FAIL_TARGET_UNCHANGED: no
// files modified by agent » — sans aucun moyen de savoir POURQUOI.
//
// De plus, le CLI OpenCode écrit les APPELS D OUTILS sur stderr et la
// réponse du modèle sur stdout : une trace built on stdout seule ne contenait
// que les lignes `[local-agent] …` — le diagnostic restait vide.

assert.ok(
  /\[r\.out,\s*r\.err\]/.test(implementSource) || /r\.out[\s\S]{0,120}r\.err/.test(implementSource),
  'scripts/autopilot/implement.cjs must keep BOTH stdout and stderr in agentLog — the OpenCode CLI writes its tool calls on stderr, so a stdout-only trace carries no diagnostic',
)

const orchestratorSource = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8')
const guardIdx = orchestratorSource.indexOf('evaluateScopeGuard(allowedScope, diff.files)')
assert.ok(guardIdx > 0, 'orchestrator.cjs must evaluate the scope guard')
const guardBlock = orchestratorSource.slice(guardIdx, guardIdx + 1200)
assert.ok(
  /impl\.agentLog/.test(guardBlock),
  'orchestrator.cjs must surface the agent trace when the scope guard fails — otherwise a successful-but-empty agent run is undiagnosable',
)
assert.ok(
  /scope violation:[^`]*\$\{hint\}/.test(guardBlock),
  'the park reason must carry the agent trace excerpt (the `hint` built from the agent log) when the scope guard fails',
)
assert.ok(
  /hint\s*=\s*agentTrace/.test(guardBlock) && /agentTrace[\s\S]{0,200}impl\.agentLog/.test(guardBlock),
  'the hint must be built from the agent log captured by implement.cjs',
)

// ── 5. Le refus cloud reste en place (contrat local-only) ────────────────────

assert.ok(
  /Refusing cloud LLM credentials/.test(adapterSource),
  '.ai/ux-agent/opencode-auto.cjs must keep refusing cloud credentials (the local-only contract of the factory worker)',
)
assert.ok(
  /process\.exit\(3\)/.test(adapterSource),
  '.ai/ux-agent/opencode-auto.cjs must keep the exit code 3 for a cloud-credential refusal (distinct from a generic failure)',
)

console.log(
  'PASS: the local agent can actually start (cloud credentials are stripped before the spawn, the local Ollama provider is declared for OpenCode, and the global config is merged rather than replaced)',
)
