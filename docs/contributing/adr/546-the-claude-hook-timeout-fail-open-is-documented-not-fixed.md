---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
---
# 546 — The Claude Code hook-timeout fail-open is documented, not fixed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-timeout-probe.md · **Supersedes/Refines:** refines ADR-541

## Context

ADR-541 left open which signal Claude Code sends to a hook that runs past its timeout. A live probe answered it on Claude Code 2.1.296, with a 3 s hook timeout. Claude Code sends SIGTERM at the deadline. The hook's TERM trap runs and exits 2 with the craft deny reason. Claude Code then runs the Bash call anyway, and the model sees a clean result (3/3). A TERM trap that prints the JSON deny on stdout and exits 0 is ignored the same way (1/1). Nothing the hook does after the deadline is read.

## Options considered

1. **Document the timeout as residual, change no code** *(the user's rule: harden only on a proven fail-open the hook can act on)* — pros: matches the evidence / cons: the fail-open stays.
2. **Harden through the TERM trap (JSON deny on stdout)** — ruled out live: the call still ran.
3. **Leave the "unprobed" wording** — cons: the operator docs stay silent on a proven fail-open, against ADR-538.

## Decision

Option 1. The user approved one extra paid turn to test the only hook-side candidate, the JSON deny from the TERM trap, and chose document-only if it missed. It missed. The TERM and HUP traps stay as ADR-541 set them, because they still deny a TERM or HUP from any other sender. The timeout behaviour is written into the hook header and `gate.md` (ADR-538). This refines ADR-541's "Carried forward" line, which said the timeout signal stays unprobed: the signal is SIGTERM, and its exit status is ignored.

## Consequences

A hook run past its timeout (600 s by default for PreToolUse) still lets the Bash call through. Closing that needs a Claude Code change, not a craft one. A future Claude Code release that honours a post-deadline deny needs a new live probe before any doc says so.
