# 010 — P3 manifest validation accepts the new manifest surface

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-P3-orchestrator-rewire.md · **Refines:** DESIGN-customizable-engine §"Manifest schema extensions"

## Context

The engine consumes new manifest keys the old `manifest-lint` does not recognize: the top-level
`pipeline:` (`profile`/`skip`/`insert`), `retrieval:`, and `execution:` (ADR-008), plus the
`pipeline.skip: [...]` list. The orchestrator runs manifest validation **first** in §0 and stops
on INVALID — so until validation accepts these keys, the rewired walk rejects any customization
manifest ("unknown top-level key: pipeline") before the engine is ever called, leaving the
rewire usable only zero-config.

## Options considered

1. **Extend validation for the new keys now** — add `pipeline`/`retrieval`/`execution` as known
   top-level keys and recognize the `pipeline.{profile,skip,insert}` shape, so a customization
   manifest lints clean and the rewired walk honors it. *(designer recommended · user choice)*
2. **Minimal: remove `PROTECTED` only** — defer new-key wiring to P4; the live walk stays
   zero-config until then.

## Decision

P3 validation accepts the new surface: `pipeline:`, `retrieval:`, `execution:` are known
top-level keys; `pipeline.{profile,skip,insert}` is recognized shape. **Phase *names* stay the
old set** (alias wiring is still P4 — ADR-004); the **contents** of `pipeline.skip` are not
name-validated here (the engine's strand-check owns skip semantics at resolve time). This change
lands inside the folded Node validator (ADR-012), not the retired bash parser.

## Consequences

The rewire is functional for real customization, not just SC1: a `pipeline.skip:[…]` manifest
lints clean, then the engine resolves + strand-checks it. Shape validation (known keys) stays in
the validator; semantic validation (stranding) stays in the resolver — the two layers remain
independently testable. New keys are additive; existing manifests are unaffected (N1).
