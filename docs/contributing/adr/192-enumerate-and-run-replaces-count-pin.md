# 192 — enumerate-and-run plus a registration meta-test replaces the EXPECTED_TESTS pin

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** retires the ci.sh count pins

## Context

ci.sh pins exact test counts (EXPECTED_TESTS and siblings) to catch silent test-file
drops via glob miss. The pin requires an edit on every test-adding change and cannot
detect a strong test replaced by a weak one (Stryker owns that). The failure mode worth
keeping is: a test file exists on disk but the runner never loads it.

## Options considered

1. **Enumerate-and-run + meta-test** (recommended) — ci.sh passes the enumerated file
   list to the runner (a missing file is a hard error), and a meta-test asserts every
   `test/**/*.test.js` on disk registered ≥1 test — pros: zero per-PR edits;
   self-maintaining / cons: none material.
2. **Committed file manifest diffed by lint** — cons: the manifest is a pin with the same
   per-PR edit tax.
3. **Auto-derived count cached between runs** — cons: ratchet complexity, false alarms on
   legitimate removals.

## Decision

**Adopted-as-recommended (no user judgment).** All EXPECTED_* count pins in ci.sh are
retired in favour of enumerate-and-run plus a registration meta-test per suite root.

## Consequences

Adding or removing tests no longer touches ci.sh. Glob-miss protection strengthens (the
check is per-file, not aggregate-count). Weak-test regressions remain Stryker's job, as
before.
