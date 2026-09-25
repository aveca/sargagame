# Skill: Session Handoff / Continuity

## Trigger
Use this skill whenever a coding session is about to end, stop, or hand work to another agent.

## Objective
Leave a deterministic handoff so the next session can continue without relying on chat memory.

## Required checks
Capture branch name, HEAD SHA, origin/main SHA, PR number/state, PR head/base SHA, files changed, tests actually executed, CI/E2E/security status actually observed, unresolved problems, and exact next action.

## Required files
Update `.ai/current_state.md`, `.ai/changelog.md`, and `.ai/tasks.md`, following `.ai/handoff-template.md`.

## Truthfulness rules
Use PASS only for a test actually executed or a GitHub check currently verified.
Use PENDING when not yet run.
Use FAIL when it failed.
Use BLOCKED when execution cannot proceed.

Never convert local PASS into GitHub PASS, intended deploy into deployed, PR created into merged, or report claim into verified fact.

## Final handoff format
```text
HANDOFF
Branch: <branch>
HEAD: <sha>
Base: <sha>
PR: #<number> (<state>)

Executed:
- <test> = PASS/FAIL

Remote:
- CI = PASS/FAIL/PENDING
- E2E = PASS/FAIL/PENDING
- Security = PASS/FAIL/PENDING

Open issues:
- <issue>

Next:
- <exact action>
```

Then commit/push according to the repository workflow and leave the working tree clean whenever possible.