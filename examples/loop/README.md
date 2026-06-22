# Loop recipe — running craft iteratively

craft runs **one gated pass per invocation**. This directory shows how to wrap that
invariant in an operator-owned loop that re-invokes craft until the DoD is met.
The loop is NOT a craft feature. No engine edit, no new manifest key, no new craft flag.

The `workflow.md` here is a normal craft manifest; its only job is to point the
`validation` phase at the sample DoD in this directory (`paths.dod: loop/DOD.md`), which
is the acceptance bar the loop converges on.

---

## 1. Canonical recipe — `/loop /craft:run` (ADR-112, ADR-114)

```
/loop /craft:run <backlog-id | spec file | feature description>
```

Omit the interval so the model self-paces. Each iteration runs one `/craft:run` pass.
Because `/craft:run` prints the **full run record** in its final message, the model (the
loop's runner) reads the **actual P20 verdict directly** — no exit code, no stderr grep,
no classifier.

**Stop-condition table** — the model applies this after each pass:

| Run-record outcome | Model's action |
|---|---|
| `verify: DoD met` and no `verify: … unmet` | STOP — done. |
| a `verify: … unmet` outcome | CONTINUE — not yet; run another pass. |
| any other blocker `{ unit, reason }` (red gate, unreachable tool, resolution failure) | SURFACE-AND-HALT — a human must intervene. |
| `NO-OP(verify):` (no DoD declared) | SURFACE-AND-HALT — premise violated; do not mistake "no DoD" for "done." |

**Bound.** The operator caps `/loop`'s cadence or sets a small iteration bound.
Non-convergence is surfaced, never a silent spin.

**Inputs are stable.** The same `/craft:run <input>` runs each pass; the worktree evolves
under a fixed DoD. Idempotency: an already-met change records `verify: DoD met` on pass 1
and stops immediately.

**Manifest role.** The `paths.dod: loop/DOD.md` key in this directory's `workflow.md` is
what points the `validation` phase at the sample DoD this loop converges on.

---

## 2. Headless contrast — `craft-pi` exit code (ADR-113, prose only)

For a **fully unattended** loop (cron, CI re-trigger, Makefile target — no Claude in the
loop), the only non-interactive entry point is `craft-pi`, which **prints no run record**:
stdout is empty on success; only a blocker `{ unit, reason }` line reaches stderr; the
exit code is binary (`0` / `2`).

This is the **escape hatch, not the recommendation.**

**DoD-presence precondition (check once, before looping).** Assert that a DoD resolves —
either `docs/DOD.md` or the manifest's `paths.dod` target. If neither exists, refuse to
start. A DoD-absent pass also exits `0` (ADR-107 makes DoD-absence a non-blocking
`NO-OP(verify):`); without the precondition, `exit 0` would be ambiguous between "met" and
"absent." The precondition is what makes `exit == 0 ⇒ MET` sound.

**Exit-code decision table:**

| Exit | Condition | Action |
|---|---|---|
| `0` | MET (sound only under the precondition) | stop |
| `2` and stderr mentions `verify` | NOT-YET — a DoD-criterion-unmet blocker | iterate (bounded) |
| `2` otherwise (red gate / unreachable tool / resolution failure / opaque stderr) | BLOCKED | halt for a human |

Opaque stderr is BLOCKED, never NOT-YET — the conservative direction.

**Honest limits.** `craft-pi` cannot see the positive verdict text. The not-yet-vs-blocked
split is best-effort: it depends on the spawned `validation` pi writing the criterion text
to stderr. Under the headless adapter an unmet criterion halts the walk, so the worktree
may not advance — the iteration bound is the safety net.

---

## 3. Why example-first, not an engine-native loop (ADR-111)

| Axis | Example-first (this recipe) | Engine-native `loop:` phase / flag |
|---|---|---|
| Generality | operator composes any outer cadence — `/loop`, cron, CI re-trigger, `craft-pi` headless | one baked stop policy; every variation requires an engine change |
| Invariant core | one gated pass per invocation stays provable in isolation | "one gated pass" becomes "one-or-N passes," complicating every gate/handoff proof |
| Protocol surface | loop uses existing P20 `verify:` vocabulary; nothing new to learn | new manifest key + resolver + lint + tests + "loop blocker vs pass blocker" protocol |
| Composability | reads the verdict craft already produces | parallel doneness mechanism alongside DoD |

craft is opinion-free about **what** you inject and owns only per-pass orchestration.
**When** to stop iterating is the operator's policy. Future "add loop flag" requests hit
this standing decision.
