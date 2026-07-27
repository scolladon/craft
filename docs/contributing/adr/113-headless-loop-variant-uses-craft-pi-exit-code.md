# 113 — The headless loop contrast uses craft-pi's exit code plus a DoD-presence precondition

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P21-loop-recipe.md · **Supersedes/Refines:** none

## Context

The canonical recipe puts Claude in the loop and reads the run record (ADR-112). Operators who want
a **fully unattended** loop (cron, CI re-trigger, a Makefile target — no Claude, no human) need a
different signal, because the only non-interactive entry point is `craft-pi`, and `craft-pi` (pinned
in the design) **prints no run record**: its stdout is empty on success and only a blocker
`{ unit, reason }` line reaches **stderr** on failure; its exit code is **binary** — `0` (walk
completed, no blocker) or `2` (a blocker halted the walk). Crucially, a **DoD-absent** pass also
exits `0` (P20/ADR-107 makes DoD-absence a non-blocking `NO-OP(verify):`), so exit `0` alone
conflates "DoD met" with "no DoD at all."

## Options considered

1. **Exit code + best-effort stderr grep + a DoD-presence precondition** — `0`⇒met (made sound by
   the precondition), `2`+`verify` in stderr⇒not-yet, `2` otherwise⇒blocked; refuse to start if no
   DoD resolves. *(designer's recommendation for the headless path; chosen)* — pros: uses exactly
   the signal craft-pi actually exposes; the precondition closes the absent/met trap / cons: the
   not-yet vs blocked split is best-effort (depends on the spawned `validation` pi writing the
   criterion text to stderr); conservative fallback is "blocked → halt."
2. **Exit code only** — cons: cannot distinguish a DoD-unmet (iterate) from a red gate / tool /
   resolution failure (halt) — loses the iterate-vs-halt split and risks blind spinning.
3. **Parse `docs/DOD.md` checkbox state directly** — cons: couples to the file format and bypasses
   the per-criterion *session judgment* (a `- [ ]` line may still be asserted met); re-derives
   doneness instead of reading craft's verdict.

## Decision

The **headless contrast** (documented, not the canonical path) drives `craft-pi` from an
operator-owned harness and reads craft-pi's **exit code** as the primary stop signal, disambiguated
by a **best-effort stderr grep** for `verify`, under a mandatory **DoD-presence precondition**:

- Before looping, assert a DoD resolves (`docs/DOD.md` or the manifest's `paths.dod` target). If
  none, **refuse to start** — because exit `0` would otherwise be read as "met" when it may mean
  "absent."
- `exit == 0` ⇒ **MET** (sound only under the precondition) ⇒ stop.
- `exit == 2` **and** stderr mentions `verify` ⇒ **NOT-YET** (a DoD-criterion-unmet blocker) ⇒
  iterate (bounded, ADR-114).
- `exit == 2` otherwise (red gate, unreachable tool, resolution failure, opaque stderr) ⇒
  **BLOCKED** ⇒ halt for a human. Opaque stderr is classified BLOCKED, never NOT-YET (the
  conservative direction).

This path is presented as a *contrast/escape hatch*, with its limits stated plainly: it cannot see
the positive verdict text, the not-yet split is best-effort, and under the headless adapter an unmet
criterion halts the walk so the worktree may not advance (the bound is the safety net).

## Consequences

- Operators get a real unattended option without an engine change, with its weaker signal documented
  honestly rather than hidden.
- The DoD-presence precondition is load-bearing on this path (it is what makes `exit==0 ⇒ MET`
  sound) and is *not* needed on the canonical path, where the model reads the actual verdict.
- Because this path is a documented pattern (not a shipped shell script, per ADR-115), it lives as
  prose in the example README / GUIDE; the recipe does not commit or test a `loop.sh`.
