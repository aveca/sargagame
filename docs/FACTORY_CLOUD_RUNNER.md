# Sargagame Remote Cloud Runner

The Sargagame remote cloud runner utilizes Cloudflare D1 for a factory_jobs queue, claim/finish protocol in `scripts/factory/cloud-runner.mjs`, and a GitHub Actions workflow `factory-cloud-runner.yml` scheduled every 15 minutes with a 55-minute timeout. The workflow runs on a GitHub-hosted runner, leveraging a local Ollama qwen2.5-coder:7b model via Docker and Aider. Changes are made in isolated `factory/cloud-*` branches, gated by npm test and npm run build. PR-only publication is enforced, with no auto-merge. D1 tracks events and heartbeats in `factory_events` and `factory_heartbeats`.

## Constraints
- Repository scope: `aveca/sargagame` only.
- Task type: `DOCS`.
- Job ID: `factory-e2e-night-20261014-002`.
- Do not modify `.github/`, `scripts/factory/cloud-runner.mjs`, wrangler configuration, deployment workflows, secrets, or environment files.
- Do not add credentials.
- Make the smallest tested change that fulfills the task.
- Do not claim tests passed unless actual code changes and tests pass.
