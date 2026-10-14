# Sargagame Factory E2E Cycle

The Sargagame Factory E2E cycle is designed to ensure the reliability and quality of the factory's operations. The cycle consists of the following steps:

1. **Cloudflare D1 factory_jobs queue**: Tasks are added to the `factory_jobs` queue with a status of `queued`.

2. **Claim via scripts/factory/cloud-runner.mjs**: The `cloud-runner.mjs` script is scheduled to run every 15 minutes. It claims a task from the queue by updating the task's status to `running`.

3. **Local Ollama qwen2.5-coder:7b + Aider on the hosted runner**: The claimed task is processed locally using the Ollama qwen2.5-coder:7b model and Aider. The processing is isolated in the `factory/cloud-*` branch.

4. **npm test and npm run build gates**: The task must pass the npm test and npm run build gates to proceed.

5. **PR-only publication with no auto-merge**: The task must be published as a pull request (PR) and must be reviewed and merged manually.

6. **D1 factory_events/factory_heartbeats reporting**: The factory's progress is reported in the `factory_events` and `factory_heartbeats` tables.

7. **Production merge requires green CI on the exact head SHA**: The task can only be merged into production if it has a green CI status on the exact head SHA.

8. **Live end-to-end operation is proven only by a completed run of this pipeline**: Live end-to-end operation is proven only by a completed run of this pipeline.

**Repository scope**: aveca/sargagame only. Task type: DOCS. Job ID: factory-e2e-night-20261014-001.
