# TASKS.md — Sargagame Quality Roadmap

## Status Legend
- [ ] Pending
- [x] Done
- [~] In Progress
- [-] Cancelled

---

## Cycle 1: P0 Critical Fixes (Race Conditions) ✅ ALL DONE

### P0-1: Extract Google Apps Script URL constant ✅
- **Status**: [x] Done
- **Fix**: Replaced 9 duplicates with single `APPS_SCRIPT_URL` constant

### P0-2: Add AbortController to data bootstrap ✅
- **Status**: [x] Done
- **Fix**: Added AbortController + `cancelled` flag to 6 parallel fetches

### P0-3: Add AbortController to community reports fetch ✅
- **Status**: [x] Done
- **Fix**: Added AbortController + cleanup on unmount

### P0-4: Add AbortController to payment status polling ✅
- **Status**: [x] Done
- **Fix**: Added AbortController + `signal.aborted` check in retry loop

### P0-5: Add AbortController to image manifest fetches ✅
- **Status**: [x] Done
- **Fix**: Added AbortController to 4 deferred fetch useEffects

---

## Cycle 2: P1 Accessibility & Performance ✅ MOSTLY DONE

### C2-P1: Fix undersized touch targets (7 buttons < 44px) ✅
- **Status**: [x] Done
- **Fix**: Added `minHeight:44` + `role="button"` + `tabIndex={0}` + `onKeyDown` to 7 elements

### C2-P1: Add loading states to 5 form submit buttons ✅
- **Status**: [x] Done
- **Fix**: Added `busy` state + `disabled` + loading text to 5 forms

### C2-P1: Move inline @keyframes to CSS files ✅
- **Status**: [x] Done
- **Fix**: Moved BeachScene + Celebration animations to `app-runtime.css`

### C2-P1: Remove will-change:transform from .sg-pin ✅
- **Status**: [x] Done
- **Fix**: Removed GPU layer waste on 50+ map pins

### C2-P2: Add CSP meta tag to index.html ✅
- **Status**: [x] Done
- **Fix**: Added Content-Security-Policy covering scripts, styles, fonts, images, connect, frames

### C2-P2: Add og:image:alt to pages missing it ✅
- **Status**: [x] Done
- **Fix**: Added to `public/for-hotels/index.html`, `public/a-propos/index.html`

### C2-P2: Fix /about/ missing canonical + OG + hreflang ✅
- **Status**: [x] Done
- **Fix**: Added canonical, full OG tags, twitter cards, hreflang to `/about/index.html`

---

## Cycle 3: P0 Payment Flow Bug Fix ✅ DONE

### C3-P0: Fix Mollie Components not mounting (payStep timing bug) ✅
- **Status**: [x] Done
- **Bug**: Prewarm effect ran on mount (empty deps `[]`) before `payStep` became true → refs were null → Components never mounted → payment form never worked
- **Fix**: Split into two effects:
  1. **Script preload** (empty deps): Loads `mollie.js`, initializes Mollie instance, sets `payReadyRef.current=true`
  2. **Component mount** (deps `[payStep, lang]`): Mounts Components when `payStep=true` and refs exist
- **Also**: Fixed `payPrewarmPromiseRef` for Mollie so `startCheckout` doesn't reject with "no prewarm"

---

## Verification
- ✅ `npm run build` — zero warnings
- ✅ `npm run test` — 88/90 pass (2 stale worktree failures unrelated)
- ✅ Bundle budget — 201.8 Ko ≤ 210 Ko gzip
- ✅ All P0 race conditions eliminated
- ✅ All P1 accessibility issues fixed
- ✅ Payment flow bug fixed (Mollie Components now mount correctly)

---

## Files Modified
- `src/Sargasses_PROD.jsx` — P0 race conditions, P1 accessibility, P2 CSP/SEO
- `src/app-runtime.css` — Keyframes moved from inline, will-change removed
- `src/PremiumModal.jsx` — Payment flow bug fix (Mollie Components mount timing)
- `index.html` — CSP meta tag
- `public/for-hotels/index.html` — og:image:alt, twitter cards
- `public/a-propos/index.html` — og:image:alt
- `public/about/index.html` — canonical, OG, twitter, hreflang