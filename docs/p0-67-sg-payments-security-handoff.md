# P0.67 §1 — sg-payments Worker security: sanitized handoff

**Status: BLOCKED — awaiting the authoritative Worker source.**
No Worker source edit, no deployment, no secret handling, no payment operation
was performed. This document is the handoff only.

**Date:** 2026-11-03
**Mission:** SARGAGAME P0.67 — payment security + scientific trust

---

## 1. Why this is a handoff and not a fix

The mission states the deployed `sg-payments` Worker source is external to the
`aveca/sargagame` repository and asks to find the authoritative source in the
authorized workspace, or else prepare a sanitized handoff.

**Search performed on 2026-11-03 across the repository and the workspace:**

| Identifier | Occurrences in repo |
|---|---|
| `NAMECHEAP_BEARER` | 0 |
| `NAMECHEAP_MAIL_TOKEN` | 0 |
| `ALLOWED_ORIGINS` | 0 |
| `CLICK_REDIRECT_HOSTS` | 0 |
| `COLLECT_HOSTS` | 0 |
| `RESEND_API_KEY` | 3 (unrelated scripts, not the Worker) |
| `ALLOWED_HOSTS` | 7 (unrelated scripts/workflows, not the Worker) |

The only Worker present is `workers/sargagame/index.js` (18,450 bytes). It is
the **regional asset/payment Worker** (`sargagame-__REGION__` per
`wrangler.template.jsonc`) that terminates `/api/mollie` and
`/api/mollie-webhook.php`. It does **not** contain any of the six sg-payments
allowlist identifiers and no Namecheap code.

**Conclusion: the authoritative `sg-payments` source is not in this repository
and not in the workspace.** It was therefore not invented, mirrored or guessed
— `AGENTS.md` forbids fabricating a canonical source, and a guessed copy is
worse than no copy because it would let a future agent "fix" a file that is not
what is deployed.

---

## 2. Findings as reported (founder's read-only Cloudflare inspection)

Repeated verbatim from the mission brief. **Independently unverified here: this
runtime has no Cloudflare MCP available** (the MCP servers configured are
`playwright`, `google-search-console` — disabled — and `resend` — tools
disabled), so no live Worker state can be confirmed from this environment.

Deployed Worker: **sg-payments**
Version: `36fa827a-a39c-4156-9359-30fc383eb6c5`
Created: 2026-10-02 04:11 UTC

| # | Finding | Severity |
|---|---|---|
| F1 | Hardcoded `NAMECHEAP_BEARER` literal in the Worker source | P0 — credential in source |
| F2 | `env.NAMECHEAP_MAIL_TOKEN` used as fallback to the hardcoded value | P0 — defeats secret rotation |
| F3 | `NAMECHEAP_MAIL_TOKEN` binding **absent** on the Worker | P0 — provider currently relies on F1 |
| F4 | `RESEND_API_KEY` binding present | informational — managed correctly |
| F5 | Tulum exists in Worker **routes** but is absent from `ALLOWED_HOSTS` | P1 — host allowlist gap |
| F6 | Tulum absent from `ALLOWED_ORIGINS` | P1 — CORS allowlist gap |
| F7 | Tulum absent from `CLICK_REDIRECT_HOSTS` | P1 — redirect allowlist gap |
| F8 | Tulum already present in `COLLECT_HOSTS` | informational — confirms intent, so F5–F7 are oversights rather than a deliberate policy |

**No credential value is recorded, echoed or reproduced anywhere in this
repository, this document, the commit history or the pull requests.**

---

## 3. Required correction (spec for whoever holds the source)

1. **Delete the hardcoded bearer literal.** No fallback, no `||` default.
2. **Read the credential from a managed secret binding only**:
   `const token = env.NAMECHEAP_MAIL_TOKEN`.
3. **Missing or empty binding ⇒ skip the provider.** Do not throw, do not
   fall back to the literal, do not retry with another source.
4. **Safe fallback**: the request path proceeds without Namecheap (the feature
   it serves degrades or is skipped) and the reason is recorded.
5. **Redact all logs**: log the binding's *presence* (`true`/`false`) and the
   provider name, never the token, never a prefix or suffix of it, never its
   length. Log at most a stable reason code such as
   `namecheap_provider_skipped:missing_binding`.
6. **Add Tulum to `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, `CLICK_REDIRECT_HOSTS` —
   but only after the intended production domain is confirmed.** Tulum's DNS
   CNAME and Worker routes exist and a sentinel reports HTTP 200, which
   suggests the domain, but a 200 is not proof of the *canonical* host. Confirm
   against `regions/tulum.json` and the live DNS record before editing.
7. **Tests to accompany the correction** (in the authoritative repo):
   - provider failure (Namecheap returns 5xx / times out) ⇒ safe degradation,
     no retry storm, no credential in the error;
   - missing binding ⇒ provider skipped, reason recorded, no literal used;
   - every allowed regional host (all six regions) accepted, an unknown host
     rejected;
   - CORS: allowed origins accepted, disallowed origins rejected;
   - redirect: every entry in `CLICK_REDIRECT_HOSTS` accepted, an off-list
     target rejected.

**Explicitly NOT authorized by this handoff:** secret rotation, secret
revocation, secret write/creation, any Worker deploy, any payment, any webhook
replay. Those stay with the founder.

---

## 4. What was delivered instead, in this repository

Because no Worker source was available, the durable half of §1 — preventing
this class of defect from ever entering the repository again — was implemented:

**`scripts/scan-hardcoded-credentials.cjs`** — fail-closed scanner.
- 6 rules: `_BEARER|_TOKEN|_API_KEY|_SECRET|_PASSWORD|_PAT` literal assignment,
  `Authorization: Bearer <literal>`, quoted `Bearer <literal>`,
  `sk_live_`/`rk_live_` provider secrets, PEM private-key blocks.
- A character-level source classifier distinguishes **executable code from
  comments, strings and template literals**, so a documentation example or a
  generated-code snippet never trips the gate.
- Values containing URL/path syntax are rejected as non-credentials, and
  `test_*`/`demo_*`/fixture placeholders are ignored.
- **It never prints, stores or transmits a secret.** A finding reports
  `file:line rule masked-preview`, where the mask is a fixed 20-character
  fingerprint (`first4 + 12 stars + last4`), and shorter than 8 characters it
  is fully starred.
- Exit 0 = clean, exit 1 = at least one hardcoded credential (CI gate).
- Current repository result: `CREDENTIAL_SCAN_OK scanned=970 findings=0`.

**`tests/unit/scan-hardcoded-credentials.test.cjs`** — proves **both**
directions, using synthetic strings only, asserting on rule names and counts:
- 6 positive probes (a hardcoded bearer literal, a token assignment, an
  Authorization header, a quoted Bearer, a `sk_live_` key, a PEM header) each
  reported by the expected rule, exactly once;
- 8 negative probes (block comment, line comment, explicit `test_*` fixture,
  `<placeholder>`, `process.env` indirection, the vite.config.js
  generated-code pattern, a URL with an `api_secret` variable, a prose string
  that merely names the variable) each reported **zero** times;
- redaction contract, allowlist, template-suffix and skipped-directory
  behaviour.

---

## 5. How to finish this work

1. Retrieve the authoritative `sg-payments` source (Cloudflare Dashboard →
   Workers & Pages → sg-payments → Quick edit / or the deployment pipeline that
   ships it).
2. Do **not** paste the source into this repository to "fix it here", unless a
   deliberate decision is made to make this repository the canonical source —
   that decision needs approval because it changes where the truth lives.
3. Apply §3 to the authoritative source.
4. Add `scripts/scan-hardcoded-credentials.cjs` to that repository's CI as a
   first line of defence, so F1 cannot silently return.
5. Rotate the exposed credential. **This handoff does not and must not do it.**
