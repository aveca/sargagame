## Scope

- [ ] Single focused task / responsibility
- [ ] No unrelated refactor
- [ ] Branch follows `agent/<role>/<task>` (or documented exception)

## Validation

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `node scripts/check-bundle-budget.cjs`
- [ ] Mobile UX smoke / relevant E2E
- [ ] Payment funnel checked if affected

## Safety

- [ ] No secrets committed
- [ ] No direct production changes unless explicitly required
- [ ] Existing analytics preserved
- [ ] Eager JS remains <= 210 KB gzip

## Handoff

- [ ] `.ai/current_state.md` updated
- [ ] `.ai/tasks.md` updated if task status changed
- [ ] `.ai/changelog.md` updated for meaningful changes

## Agent summary

**What changed:**

**Why:**

**Tests / evidence:**

**Known risks / follow-up:**
