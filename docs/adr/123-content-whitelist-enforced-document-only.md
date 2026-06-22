# 123 — The content whitelist is enforced by documentation and the write surface, not a runtime guard

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

The store may hold only mechanically-derived, mechanically-validatable facts (commands, fingerprints,
normalized findings, metrics) — design Req 10 — so validate-on-read stays cheap and poisoning stays
bounded. How strictly to enforce this is a build-cost-vs-safety fork.

## Options considered

1. **Reject-at-write + schema lint** *(designer recommendation)* — pros: mechanical guard for a safety
   property. Cons: more code + a dedicated test.
2. **Reject-at-write only** — pros: runtime enforced. Cons: unproven by a test.
3. **Document-only** *(chosen — user judgment)* — pros: least code; the port spec forbids
   non-mechanical content and each phase's write surface complies. Cons: a future phase could silently
   write prose, eroding the cheap-validation guarantee.

## Decision

The whitelist is **document-only**: the memory port spec (`docs/adapters/memory.md`) defines the
per-concern entry schemas and forbids free-form / semantic / LLM-inferred content, code snippets, and
PII; each phase's documented write surface is trusted to comply. There is **no reject-at-write code and
no schema lint**.

## Consequences

- Smaller build: no write-time schema validator, no whitelist lint test.
- The cheap-validation guarantee rests on write-surface discipline plus human review of the diffable
  store (ADR-117), not a runtime gate — consistent with the advisory-cache premise (ADR-116), where a
  non-conforming entry is at worst wasted cost, never a wrong decision.
- If non-mechanical content proves to leak in practice, reject-at-write (option 1) is a clean later
  upgrade.
- Deviates from the design recommendation → triggers a design revision (scope-fold) before planning.
