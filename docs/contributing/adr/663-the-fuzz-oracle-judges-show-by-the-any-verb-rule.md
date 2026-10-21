---
subjects:
  - engine/test-helpers/git-differential-harness.js
supersedes: []
---
# 663 — The fuzz oracle judges show by the any-verb rule

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/git-show-ext-diff-default-deny.md · **Supersedes/Refines:** none

## Context

ADR-662 drops `show` from the ext-diff default-deny. The differential fuzz judges every generated
command against real bash through `judgeArgv`, which treats `show` like `diff`: firing unless
`--no-ext-diff` is the last setting. Left as is, the oracle would call every newly allowed bare
`show` a false allow, and the generator emits no `show` shape that checks the new boundary in
either direction.

## Options considered

1. **Change the oracle and the generator in lock-step** *(recommended)* — pros: the census keeps
   judging the rule against what bash and the stub log, independent of predicate code / cons: new
   generator entries reshuffle every seed, so the census at scale is re-run
2. **Change the oracle only** — pros: seeds stay stable / cons: nothing generated probes
   `show --ext-diff`, `show --stat` or the dynamic and brace `show` spellings

## Decision

Adopted-as-recommended (no user judgment). `judgeArgv` treats only `diff` as default-firing;
`show` falls under the any-verb rule (fires when the last ext-diff setting before `--` is
`--ext-diff`). The generator gains `show` verb shapes on both sides of the rule and untagged
special fragments for the dynamic option word, the brace spelling and the dynamic head that holds
`git diff`, each an expected block.

## Consequences

The scaled census (`GUARD_FUZZ_COUNT=1500`, four seed batches) runs on the new generator before
the change ships. The oracle judges logged argv, after expansion, so it carries no dynamic-word
term of its own.
