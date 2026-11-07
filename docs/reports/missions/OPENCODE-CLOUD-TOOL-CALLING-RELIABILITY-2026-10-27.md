# OpenCode native tool-calling reliability — 2026-10-27

## Verdict

**Provider integration hardened; 24/7 availability is not guaranteed.**

The owner reported that OpenCode CLI with the NVIDIA-hosted model
`nemotron-3.5-super-vl-120b-a12b` completed four native tool-calling scenarios.
Those live-provider results are owner-reported evidence; this repository change
does not independently repeat them because a real provider call may consume
quota or incur cost.

## Confirmed repository defect

The existing `.ai/ux-agent/opencode-auto.cjs` was deliberately local-only:
it exited when a cloud credential was present, removed `NVIDIA_API_KEY`, and
always pinned OpenCode to an Ollama model. The production task executor in
`scripts/autopilot/local-agent-executor.cjs` also explicitly removed the NVIDIA
credential and only selected `ollama/<model>`. Updating the adapter alone
would not enable cloud execution through the actual autopilot executor.

## Changes on this branch

- Added explicit `--cloud` mode to the adapter. Cloud mode requires
  `SARGA_CLOUD_ENABLED=1`, `NVIDIA_API_KEY`, and a model ID beginning with
  `nvidia/`.
- Kept local Ollama mode as the default. Presence of a cloud key does not
  automatically choose cloud or send a request.
- Added explicit executor selection through
  `SARGA_AUTOPILOT_PROVIDER=local|nvidia`. NVIDIA mode requires the same
  enable flag, key, and `SARGA_CLOUD_MODEL`.
- Cloud tasks make one attempt only. This intentionally avoids hidden retries
  that could multiply API requests or repeat agent actions. Local mode retains
  the existing bounded retry/model-routing behavior.
- Added no-network tests for provider policy, argument construction, and
  environment isolation. These tests use a dummy, non-valid key and make no
  model/API requests.
- The P0.1 guard and `STOP-Autonomie` marker were not modified. No supervisor
  was restarted and no deployment or PR merge was performed.

## Configuration

Default local mode requires no new variables.

To explicitly opt into NVIDIA mode for a controlled task, configure in the
task process environment:

- `SARGA_AUTOPILOT_PROVIDER=nvidia`
- `SARGA_CLOUD_ENABLED=1`
- `SARGA_CLOUD_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b`
- `NVIDIA_API_KEY` supplied securely through the environment (never commit it)

Only enable cloud mode where API use and any associated quota/cost are authorized.
Unset `SARGA_CLOUD_ENABLED` or choose the local provider to prevent cloud
requests. Do not place credentials in command arguments, committed files, logs,
or reports.

## Reliability boundary

This change does **not** guarantee 24/7 operation. Cloud runs still depend on
credential validity, provider availability, quota/rate limits, OpenCode model
availability, and network connectivity. A cloud error is returned explicitly;
there is no automatic local fallback after a cloud failure because the local
model is known not to support the required native tool-calling behavior in the
reported configuration. Retrying an agent task blindly can repeat side effects,
so cloud mode is single-shot.

A more resilient future design would require independent, pre-tested providers
with native tool calling, per-provider health/capability probes, bounded
circuit-breaker/backoff policies, and explicit rules for which failures are safe
to retry. Free OpenRouter availability is not a dependable 24/7 fallback based
on the timeout reported by the owner. A cloud SLA would need to be separately
verified and approved.

## Validation status

- Reported live NVIDIA native tool-calling scenarios: 4/4 passed (owner report;
  not rerun by this change).
- New repository-level policy tests: added; CI execution remains pending at
  the time of this report.
- Real NVIDIA API request from this implementation: not made.
- Production deployment: not performed.
- Auto-merge or runtime restart: not performed.

## Next step

Wait for CI to execute the no-network regression tests, review the diff, and
then make one explicitly authorized, bounded cloud test using the existing
tool-calling acceptance scenarios. Capture the API result and cost/quota
information if the provider exposes it. Do not describe the system as
24/7-guaranteed; describe it as cloud-capable with an explicit provider
dependency and bounded failure behavior.
