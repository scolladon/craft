---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
---
# 551 — The foreground-stall timeout fail-open is documented, not fixed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/claude-hook-foreground-stall-probe.md · **Supersedes/Refines:** refines ADR-546

## Context

ADR-546 was probed with the hook interrupted in a background wait. A hook stalled in a foreground command defers its TERM trap until the child exits, so whether Claude Code waits, hangs or runs the call was open. A live probe answered it on Claude Code 2.1.299, with a 3 s hook timeout. At the deadline Claude Code sends SIGTERM to the hook's whole process tree, found by parent pid, not by process group. A foreground `sleep` died with it, the TERM trap ran at once, and its crash deny was ignored (2/2). A tree that survived the TERM was SIGKILLed about 1.2–1.7 s later (2/2 timed rows; a coarser third agrees). The call ran every time, the model saw a clean result, and Claude Code did not hang.

## Options considered

1. **Document the foreground stall as the same fail-open, change no code** *(the user's rule: harden only on a proven fail-open the hook can act on)* — pros: matches the evidence / cons: the fail-open stays.
2. **Write that the session hangs** — ruled out live: `claude -p` exited 0 every run.
3. **A hook-side fix** — none exists: the foreground child is killed, survivors are SIGKILLed, and nothing the hook returns after the deadline is read (ADR-546).

## Decision

Option 1, the user's decision rule for this probe: the call ran, so the "a stall in a foreground command was not probed" qualifier is dropped from the hook header and `gate.md`. The TERM and HUP traps stay. This refines ADR-546, whose probe covered only the background wait.

## Consequences

A hook stalled anywhere past its timeout lets the Bash call through. Closing that still needs a Claude Code change. A release that changes the tree signal or the SIGKILL escalation needs a new live probe before any doc says so.
