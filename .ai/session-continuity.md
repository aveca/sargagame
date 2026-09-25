# Session Continuity & Anti-Regression Protocol

## Purpose
Make every AI development session start from the real current repository state, not from memory, an old report, or a copied prompt.

## Source-of-truth hierarchy
When sources conflict, use this order:
1. Git working tree + actual code
2. GitHub: main, branches, PR state, PR head/base SHAs, checks
3. Executed test output from the current session
4. `.ai/current_state.md`
5. `.ai/tasks.md`, `.ai/bugs.md`, `.ai/decisions.md`, `.ai/changelog.md`
6. Previous agent reports / chat summaries

Never claim a test, deploy, merge, or production state is verified unless it is currently observable from GitHub or was actually executed in the current session.

## Mandatory session preflight
Before changing code, every agent must:
1. Read CLAUDE.md, AGENTS.md, NEXT_SESSION.md, .ai/current_state.md, .ai/tasks.md, .ai/bugs.md.
2. Inspect Git: `git status --short`, `git branch --show-current`, `git log --oneline --decorate -10`, `git fetch origin --prune`, `git rev-parse origin/main`, and compare the branch against `origin/main`.
3. Inspect GitHub: open PRs, recently merged PRs, the current branch PR, PR head/base SHAs, real CI/E2E/security status, and mergeability/conflicts.
4. Inspect the recent diff and search the repository for existing implementations before creating anything.
5. Build a Regression Map covering critical paths touched recently, existing code to reuse, overlapping open PRs, failed/blocked checks, and features that must not be rewritten.

## Hard rules
### Do not trust reports blindly
A report saying “CI 7/7 green” is not proof. Verify the PR exists, the reported SHA is current, checks are attached to that SHA, and required workflows completed successfully.

### Never implement twice
Before creating a component, utility, route, analytics event, data model, skill, or script, search the repository first.

### Never overwrite recent work accidentally
If a requested change overlaps a recent PR, compare the actual diff, preserve already-shipped behavior, make the smallest additive change, and run regression checks for the affected path.

### Never treat local green as remote green
Local tests prove only the current local tree. GitHub checks prove the pushed commit. They are separate gates.

## Session exit / handoff
Before ending a session, update `.ai/current_state.md`, `.ai/changelog.md`, and `.ai/tasks.md`.

The handoff must record exact branch, exact HEAD SHA, base SHA, PR number/state, tests actually executed, tests not executed, known failures, and the exact next action.

Do not write “ready/green/complete” when any mandatory gate is unverified.

## Recommended compact session report
```text
SESSION PREFLIGHT
- branch:
- HEAD:
- origin/main:
- PR:
- PR head:
- PR base:
- CI:
- E2E:
- security:
- recent merged work:
- conflict risk:
- task:

REGRESSION MAP
- must preserve:
- reuse:
- blocked/failed:
- files likely affected:
```