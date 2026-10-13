---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 527 — The fuzz oracle checks argv, env, stdout and a side-effect marker

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

node has two inputs, argv and its environment, and a shell can run something before node starts. Measured: without an env check, a matcher that admits a leading `NODE_OPTIONS=…` word survives (0 failures against 40); without a marker, a `$(mark)` inside an absolute interpreter path exits 0 with a correct argv.

## Options considered

1. **Exit 0, empty stderr, one rooted argv ending in the tail** — the brief's oracle alone
2. **Option 1 plus a `mark` stub marker and empty stdout**
3. **Option 2 plus no `NODE_*` variable reaching the stub** *(recommended)*

## Decision

Adopted-as-recommended (no user judgment): option 3. A trusted command passes only with exit 0 and no signal, empty stdout and stderr, exactly one stub-node invocation with one argument opening with `/` and ending with the guard tail, no marker file in the run's cwd, and no `NODE_*` name in the stub's exported environment. Aligns with checking every consumer of the command, the shell and node alike.

## Consequences

Stricter than the brief; every added check is fail-closed, so it can only turn a case red.
