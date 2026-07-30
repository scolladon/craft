# 308 — plan-lint moves to an engine bin over a pure src module

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

`plan-lint` is an awk script. The new overlap check needs cross-part set intersection, which
awk handles badly, and a lint that stays in `scripts/` ships with no mutation coverage —
the mutation config scopes to `engine/src` only. Three sibling lints already follow a bin-shim
over pure-src archetype.

## Options considered

1. **Stay in the awk script, extended** — pros: smallest diff / cons: set intersection is awk-hostile; zero mutation coverage for the new logic.
2. **Move the whole lint to an engine bin over a pure src module; the script becomes a shim** *(recommended)* — pros: matches the house archetype; the only mutation-covered home / cons: bigger diff; touches a shipped surface.
3. **Keep the schema check in awk, add overlap as a separate bin** — pros: existing script untouched / cons: doubles the invocation surface for one plan file.

## Decision

**Ratified by the user, as recommended.** The lint moves to `engine/bin/plan-lint.js` (a thin
shim) over `engine/src/plan-lint-main.js` (pure, `main(argv, io)`), matching the intention,
stub, and prose lints. `scripts/plan-lint.sh` becomes a shim so existing callers keep working.
The resolved gate string stays the literal `plan-lint`.

## Consequences

The new logic is mutation-covered. Bin-level tests belong beside the other bin smoke tests,
not in the repo-root suite — bins are not mutated, so relocating them on a coverage rationale
would be void. Callers invoking the shell script are unaffected, and the pinned gate string
means no scenario fixture re-tunes.
