# Model Router API

## Overview

The Model Router is a runtime infrastructure layer that selects the best AI model for a given request. It does NOT decide what action to take — it only chooses the model to execute it.

## Core API

### `ModelRouter`

```javascript
import { ModelRouter } from './.ai/runtime/model-router/index.js';

const router = new ModelRouter({
  defaultTaskType: 'default',
  defaultCriticality: 'P1',
  enableFallback: true,
  enableBlacklist: true,
  enableQuotas: true,
  enableFailureTracking: true,
  enableRetry: true,
  maxFallbackAttempts: 3,
  globalTimeout: 60000,
  unhealthyThreshold: 0.2,
  persistenceEnabled: true,
  globalBudget: { maxCostPerHour: 10, maxCostPerDay: 50, currency: 'USD' },
});
```

### `selectModel(request)`

Selects the best model for a request. Returns a selection result.

**Input:**
```javascript
{
  taskType: 'reasoning',        // reasoning|coding|analysis|fast|long-context|...
  criticality: 'P0',            // P0|P1|P2|P3
  contextSize: 8000,           // estimated context tokens
  estimatedTokens: 1000,       // estimated total tokens
  estimatedInputTokens: 800,   // estimated input tokens (optional)
  estimatedOutputTokens: 200,  // estimated output tokens (optional)
  budget: 0.01,               // max cost budget (optional)
  constraints: {              // optional constraints
    deployment: 'cloud',       // local|cloud
    maxLatency: 'fast',        // fast|medium|slow
    minReliability: 0.9,       // minimum reliability score
  },
  preferredModels: ['nemotron'], // preferred model order
  excludedModels: ['qwen-7b'],   // models to exclude
}
```

**Output:**
```javascript
{
  modelId: 'nemotron',
  provider: 'nvidia',
  confidence: 0.65,
  reason: 'high confidence, meets reliability threshold, cost-effective, healthy',
  estimatedCost: 0.001,
  deployment: 'cloud',
}
```

### `call(request)`

Executes a model call with automatic fallback, retry, and blacklisting.

```javascript
const result = await router.call({
  taskType: 'reasoning',
  criticality: 'P0',
  messages: [{ role: 'user', content: 'Hello' }],
  options: { temperature: 0.7, maxTokens: 1000 },
  maxFallbackAttempts: 3,
});
```

**Returns:**
```javascript
{
  content: 'response text',
  tokens: 150,
  model: 'nemotron',
  provider: 'nvidia',
  attempts: 1,
  fallbackUsed: false,
  confidence: 0.65,
  estimatedCost: 0.001,
}
```

## Components

### `ModelBlacklist`
- TTL-based temporary blacklisting
- Health states: `healthy`, `degraded`, `blacklisted`, `unavailable`
- Integrates with failure history and quota manager

### `QuotaManager`
- Per-model request/token quotas with sliding windows
- Global cost budget (hourly/daily)
- Integration with `CostLedger` for persistent tracking

### `FailureHistory`
- Tracks failure rates per model
- Health indicators: `healthy` (< 0.15), `degraded` (0.15-0.2), `unhealthy` (>= 0.2)
- Used for live reliability scoring

### `QueuePersistence`
- Writes events to `queue.jsonl` (source of truth for AI OS V2)
- Saves/restores state via `state.json`
- Buffered writes for performance

### `CostLedger`
- Records actual API costs to `cost-ledger.jsonl`
- Daily/hourly budget tracking
- Prevents runaway costs

## Events

All events are emitted to `queue.jsonl`:
- `model_selected` — model chosen for a request
- `model_selection_failed` — no models available
- `preference_overridden` — preferred model was not selected
- `call_success` — model call succeeded
- `call_failure` — model call failed
- `fallback` — fallback to another model
- `blacklisted` — model blacklisted
- `escalation` — auth error escalated
- `all_models_failed` — all fallback attempts exhausted
- `model_blacklisted` — model added to blacklist
- `model_unblacklisted` — model removed from blacklist
- `model_blacklist_expired` — blacklist entry expired
- `quota_set` — quota configured
- `quota_consumed` — quota consumed
- `failure_recorded` — failure recorded

## Criticality Profiles

| Profile | Reliability Weight | Cost Weight | Speed Weight | Min Reliability |
|---------|---------------------|-------------|--------------|-----------------|
| P0 | 0.5 | 0.05 | 0.1 | 0.9 |
| P1 | 0.35 | 0.2 | 0.15 | 0.85 |
| P2 | 0.2 | 0.35 | 0.2 | 0.8 |
| P3 | 0.1 | 0.5 | 0.25 | 0.75 |

## Model Registry

| Model | Provider | Deployment | Max Context | Reliability |
|-------|----------|------------|------------|------------|
| nemotron | nvidia | cloud | 128k | 0.95 |
| nemotron-mini | nvidia | cloud | 32k | 0.93 |
| glm | zhipu | cloud | 128k | 0.92 |
| glm-deep | zhipu | cloud | 200k | 0.90 |
| ling-suite | ling | cloud | 32k | 0.89 |
| qwen-7b | alibaba | cloud | 32k | 0.87 |
| qwen-14b | alibaba | cloud | 32k | 0.89 |
| qwen-32b | alibaba | cloud | 32k | 0.91 |

## Concurrency & Locking

The router acquires an exclusive filesystem lock (mkdir-based, atomic on NTFS) at `.ai/runtime/model-router/.lock/` when `persistenceEnabled: true`. A second router instance in the same working directory will throw `ModelRouter cannot acquire router lock ...`. The lock has a 5-minute TTL; if a crashed process leaves a stale lock, the next instance cleans it up automatically.

**AI OS V2 integration**: when invoked under the Supervisor, the Supervisor must hold its own `.ai/.lock.supervisor/` lock BEFORE invoking the router. The router lock is a defensive inner guard and does NOT replace the Supervisor-level lock. Set `autoLock: false` in `ModelRouter` options if the Supervisor guarantees serialization externally.

## Crash Recovery

- **state.json** is written atomically (tmp + rename) — partial writes never land.
- **queue.jsonl** is the event source of truth (append-only); any state.json corruption can be replayed from queue.jsonl.
- **cost-ledger.jsonl** is also append-only and crash-safe; budget tracking reads it on every `canConsume` call.
- **Signal handlers** (`SIGINT`, `SIGTERM`, `beforeExit`, `uncaughtException`) flush buffers and release the lock before exit.

## Auth Error Handling

`AUTH_ERROR` and `BAD_REQUEST` are *non-retryable*: `_callWithRetry` exits immediately on these codes (no exponential backoff wasted on permanent failures). The router escalates directly via the `escalation` event in `queue.jsonl`.