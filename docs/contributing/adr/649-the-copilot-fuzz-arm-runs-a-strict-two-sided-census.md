---
subjects:
  - adapters/copilot/test/git-guard.differential.test.js
  - engine/test-helpers/plain-gate-generator.js
supersedes: []
---
# 649 — The copilot fuzz arm runs a strict two-sided census

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

The predicate fuzz never judged `copilotGuard`, so gate regressions and gaps (`mapfile`/`readarray`/`compgen -C`) went unseen. The new arm needs an oracle that says what is a false allow, what is an intended false block, and how documented residuals stay out.

## Options considered

1. **Strict two-sided census** (recommended) — pins both directions and the documented false-block list / cons: one tag per core shape plus a doc line per tag.
2. **False-allow only** — cheapest / cons: the intended-false-block list and the quoted-word rule stay unchecked; an over-broad gate change passes silently.
3. **Strict, residuals not generated** — simpler / cons: loses proof that a residual next to a real git argv does not mask it.

## Decision

Ratified by the user: option 1. A FALSE ALLOW is a run where the shell executed a destructive or ext-diff git argv that carries no residual marker and `decideGuard` allowed the command. Every block whose run executed no such argv must carry a copilot intended-false-block tag (`quoted-expansion`, `unplain-character`, `evaluator-word`, `unsafe-config`, `any-word-anchor`, `control-flow-unreached`), and each tag maps to one rule stated in the living docs. String-runner fragments carry the residual marker inside their string and are tagged `residual`; either verdict is accepted for them. A killed shell, or a syntax error on a fragment not tagged shell-dependent, fails the census.

## Consequences

The arm is strict at the default seed and under the GUARD_FUZZ_* scale knobs. A new gate block that no doc rule covers fails the arm until a tag and a doc line are added. Hardening a residual (blocking `watch`) does not fail the arm.
