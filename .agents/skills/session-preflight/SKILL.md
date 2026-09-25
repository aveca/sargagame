# Skill: Session Preflight / GitHub Regression Guard

## Trigger
Use this skill at the start of every coding session, before proposing implementation or editing files.

## Objective
Synchronize the agent with the real repository and GitHub state and prevent regressions caused by stale context.

## Procedure
### 1. Read project memory
Read: CLAUDE.md, AGENTS.md, NEXT_SESSION.md, .ai/current_state.md, .ai/tasks.md, .ai/bugs.md.

### 2. Inspect local Git
Run:
```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
git fetch origin --prune
git rev-parse origin/main
git diff --stat origin/main...HEAD
```

### 3. Inspect GitHub
Using `gh` or the available GitHub integration, verify open PRs, recent merged PRs, the current branch PR, PR head/base SHA, checks attached to the current PR head, and mergeability/conflicts.

Useful commands when `gh` is available:
```bash
gh pr list --state open --limit 20
gh pr view <PR> --json state,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,statusCheckRollup
gh run list --branch <branch> --limit 20
```

### 4. Search before building
Use `rg` to find existing routes, components, hooks, utilities, analytics events, data contracts, tests, and skills.

### 5. Create a regression map
Output:
```text
REGRESSION MAP
Preserve:
- <critical paths/features>

Reuse:
- <existing components/utilities>

Recent PR overlap:
- <PRs/files>

Remote checks:
- <actual status>

Risk:
- LOW | MEDIUM | HIGH
```

### 6. Resolve contradictions
When a report conflicts with the repository or GitHub, trust the actual code/GitHub state, record the discrepancy in the handoff, and do not repeat the stale claim.

### 7. Gate implementation
Do not edit files until the preflight and regression map are complete.

## Non-negotiable
Never say CI is green without current CI evidence, that something does not exist without searching, that a feature is new without checking recent PRs, or that a change is safe without checking overlapping changes.

The skill is read-only: diagnose first and modify nothing during preflight.