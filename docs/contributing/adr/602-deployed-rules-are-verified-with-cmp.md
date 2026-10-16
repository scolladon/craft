---
subjects:
  - adapters/codex/README.md
---
# 602 — The deployed rules copy is verified with `cmp` against the committed file

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/codex-rules-deploy-step.md · **Supersedes/Refines:** none

## Context

An empty or comments-only `craft.rules` parses cleanly and forbids nothing, and a stale copy parses and
forbids less, so no codex error flags a bad deploy. The step that copies the file owns checking it. The
README must not name `assertRulesIntegrity` (ADR-600). The drift test pins the committed file
byte-identical to the generator, so a byte compare against the committed file reaches the same verdict.

## Options considered

1. **`cmp adapters/codex/craft.rules <copy>`** — pros: catches empty, comments-only, truncated, stale
   and absent copies; needs no codex / cons: says nothing about whether codex parses it.
   *(designer's recommendation)*
2. **`codex execpolicy check --rules <copy> git push`, read `"decision":"forbidden"`** — pros: the
   installed codex parses the file / cons: misses a stale copy that still forbids `git push`; exits 0
   on both outcomes, so the operator must read JSON.
3. **Both** — pros: byte and parse verdicts / cons: the parse verdict adds nothing `codex exec`'s own
   startup refusal does not.

## Decision

Option 1, **adopted-as-recommended (no user judgment)**: it aligns with ADR-599 (the deploy step
verifies what it writes) and ADR-600 (the README stays silent on the symbol). The README's verify line
is `cmp` of the committed file against the deployed copy; silence and exit `0` is a pass.

## Consequences

- Neither check proves codex loads the file; that rests on the recorded 0.162.1 load observation.
- `cmp` passes on a file symlink, so the copy-not-symlink rule (ADR-601) carries that case.
