# 059 — `custom` complete guard: exit-code blocker + documented idempotency

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

The `file` adapter's `complete` has a strong bounded-change guard: the session accepts the diff
only if it touches exactly the expected entry line(s). A `custom` source is a remote/opaque
mechanism — there is no local diff to inspect. What can the framework guard, given it is "just
the framework" and not responsible for a tracker's correctness, while still honouring the
non-negotiable §11 invariant that the closing tick is never *silently* skipped?

## Options considered

1. **Exit-code + documented idempotency** — treat the custom script's non-zero exit as a
   blocker (visible; user fixes + resumes); idempotency (re-run converges) is documented as the
   *script's* contract, not framework-asserted. pros: matches "just the framework"; keeps the
   no-silent-skip invariant / cons: a script that exits 0 but did nothing is not caught.
   *(designer's recommendation, reframed for file+custom)*
2. **Exit-code + done-state probe** — additionally re-resolve the id to confirm it reached
   "done". cons: assumes every custom resolver exposes a queryable done-state — not guaranteed.
3. **No guard (fire-and-forget)** — cons: a silent failure could skip the tick — violates §11.

## Decision

For a `custom` source, `complete` is guarded by **exit code + a documented idempotency
contract**:

- The framework runs `<ref> complete <id> <refs…>`. A **non-zero exit is a blocker** via the
  blocker protocol — never a silent tick-skip (§11). A zero exit is taken as success.
- **Idempotency** — re-running `complete` converges (a closed item stays closed; refs appended
  once) — is the **custom script's documented contract**, stated in `docs/adapters/backlog.md`,
  not asserted by the framework.

The `file` adapter keeps its exact-line diff guard unchanged.

## Consequences

- `skills/documentation/SKILL.md` step 2: `file` → today's `craft:backlog-ticker` exact-line
  guard; `custom` → run `<ref> complete …`, non-zero exit ⇒ blocker.
- `docs/adapters/backlog.md` states the custom-script contract: stdout shape for `resolve`,
  exit-0-on-success and idempotency for `complete`.
- The framework does not post-condition-probe a custom tracker — deliberate, per
  [[055-backlog-two-source-model]] ("we guarantee the seam, not the tracker").
- Aligns with [[058-backlog-failure-class-split]] (runtime errors are session blockers).
