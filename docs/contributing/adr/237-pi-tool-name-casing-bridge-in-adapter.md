# 237 — pi tool-name casing is bridged inside the pi event adapter

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-232

## Context

Live-pinning (design §D2 rows 13/14) found pi 0.80.10 tool names are lowercase (`bash`/`write`/`edit`), while the reused `gate.js` predicate keys off Claude's capitalized names (`'Bash'`, `WRITE_TOOLS={'Write','Edit','NotebookEdit'}`). The git-diff/write-path branches never fired against a real pi event before (the pi live smoke did not drive the guard). Somewhere must reconcile the casing.

## Options considered

1. **Normalize pi's lowercase `bash/write/edit` → the predicate's Claude names inside the pi event adapter** *(designer recommendation)* — pros: keeps the shared predicate binding-neutral (Claude names); the pi-specific casing lives in the pi adapter where it belongs. Cons: one mapping table in the adapter.
2. **Make the `gate.js` predicate case-insensitive** — cons: leaks pi specifics into a shared seam.
3. **Add lowercase aliases to the predicate's tool sets** — cons: same leak; grows the shared sets with binding-specific values.

## Decision

*Adopted as recommended (no user judgment).* Option 1. The pi event adapter (`tool-call-hook.js#adaptPiEvent` / the `craft-guard` extension) normalizes pi's lowercase `event.toolName` to the predicate's Claude-cased tool names before calling `toolCallGuard`. The shared predicate is unchanged and stays binding-neutral.

## Consequences

- `gate.js` stays binding-neutral (Claude tool names); no shared seam carries pi specifics.
- The casing bridge gets `node --test` cover over the pinned lowercase shapes (part of ADR-232's adapter test).
- Any future binding with its own casing repeats the pattern in its own adapter, not in the shared predicate.
