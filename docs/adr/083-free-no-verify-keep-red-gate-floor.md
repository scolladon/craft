# 083 — Free `--no-verify` (consumer discretion); keep the red-gate floor as engine-core

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** — (focused change resolving the parked P13.5 "ban-enforcement boundary"; user-directed)

## Context

craft conflated two distinct things under one ban: the **engine invariant** *"never commit on a red
gate"* (PRD §11) and the **adapter mechanism** that hard-denied `--no-verify` (`hooks/block-no-verify.sh`,
a PreToolUse Bash deny). The `--no-verify` block also equated "the repo's local git pre-commit hook == the
gate" — true for husky/lefthook repos, not universal (many repos gate in CI). The user's directive:
`--no-verify` is the **consumer's discretion**, not framework law — craft must not block it.

## Options considered

1. **Free `--no-verify`, keep the red-gate floor as engine-core (decoupled)** — remove the block; the
   orchestrator still enforces "never commit on a known-red *craft* gate" by running `gates.phase` itself.
   Pro: frees the consumer while preserving craft's actual value (not honor-system) / con: none material.
   *(chosen)*
2. **Ship-but-default-off** — keep `block-no-verify.sh` in the repo, unwire it from `hooks.json`, document
   it as opt-in. Pro: capability stays for repos that want it / con: leaves dead-by-default code; the user
   chose a clean removal.
3. **Drop both** the `--no-verify` block *and* the red-gate invariant — con: guts craft's core guarantee;
   degrades to the honor-system markdown frameworks craft beats (PRD §16).

## Decision

- **Remove `hooks/block-no-verify.sh` entirely** — delete the hook, its `hooks.json` wiring, its bats
  matrix, and its fixtures. craft no longer mechanically blocks `git commit|push|merge --no-verify`; a
  consumer who wants that enforcement re-adds their own hook (their discretion).
- **Keep "never commit on a red gate" as engine-core**, decoupled from `--no-verify`: the orchestrator
  enforces it by running the **craft gate** (`gates.phase`) at each cadence boundary — the *craft gate*,
  not the repo's local git pre-commit hook. The contract text drops the `; never --no-verify` clause and
  keeps "Never commit on a red gate."
- **Unaffected:** the `git-no-ext-diff.sh` hook (difftastic safety, unrelated) and the other core
  invariants (no provenance refs, no suppression directives, no swallowed errors, bounded scope) — they
  remain engine invariants; this directive concerned only `--no-verify`.

## Consequences

- `--no-verify` is now permitted; whether to forbid it is repo/consumer policy, not craft's.
- The red-gate floor is **not** honor-system: the orchestrator runs the gate and refuses to commit on a
  known-red craft gate, independent of any git flag. `--no-verify` only bypasses the *repo's* local git
  hook, which craft never equated with the craft gate.
- Resolves the `--no-verify` portion of P13.5. The broader "split engine-invariant from adapter-mechanism
  across every ban" remains available for the other inventory items if ever revisited, but no further ban
  is changed here.
