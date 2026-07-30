# 309 — The two prune lenses split by a fixed rationale prefix, not a new token

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The prune skill gains a second candidate class — a decision procedure where stating one
missing fact would suffice — alongside the existing model-capability lens. Both emit the same
candidate token, so nothing distinguishes them when grepping the record for whether the new
lens ever fired.

## Options considered

1. **Same token, fixed rationale prefix** *(recommended)* — pros: honours the no-new-token constraint; keeps the repo's preference for fixed greppable markers over per-context idiom / cons: the prefix is a convention a writer can forget.
2. **Same token, class carried only in free prose** — pros: nothing to remember / cons: the class is invisible to grep, so the lens cannot be audited.
3. **Same token plus a fourth candidate field naming the missing fact** — pros: most explicit / cons: changes the documented three-field shape for information the existing rationale field already carries.

## Decision

**Adopted-as-recommended (no user judgment).** Both lenses emit the existing
`PRUNE-CANDIDATE(<unit>)` token. A rule-vs-fact candidate prefixes its rationale with a fixed
marker, so the two classes are greppable apart with no new token and no shape change.

## Consequences

The candidate shape stays three fields. Auditing whether the new lens has ever fired is one
grep. No token-family documentation changes, since no token was added.
