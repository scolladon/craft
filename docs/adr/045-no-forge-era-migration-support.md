# 045 — No forge-era migration support (drop `assembleContract` aliasing + warn-lint)

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none (deviates from the design's item-10 recommendation)

## Context

`assembleContract` (`engine/src/contract.js`) looks up `manifest.phases[descriptor.id]` by canonical
id with no `resolveAlias`, whereas `resolve.js` and `manifest.js` alias the old (pre-P4 vocabulary,
"forge-era") phase keys `plan`/`implement`/`mutation`/`merge` → canonical. So a consuming manifest
keyed by old-vocab names would silently fail to bind per-phase `context:`/`override:` in the contract
assembler — a real asymmetry (reported as a MEDIUM bug). The design recommended closing it by aliasing
in `assembleContract` (optionally plus a migration warn-lint).

## Options considered

1. **Aliasing only, no warn-lint** — normalize keys in `assembleContract`'s body. *(designer's recommendation)*
2. **Aliasing + a `manifest-lint` warn** on forge-era keys — migration nudge, additive surface.
3. **No forge-era support at all** — neither aliasing nor warn-lint. *(user choice; deviates from the recommendation)*

## Decision

craft is single-tenant — there are no external consumers and our own configs are already migrated to
the canonical vocabulary. There is no migration to plan; craft behaves as if it always existed. So
NEITHER the `assembleContract` old-vocab aliasing NOR a migration warn-lint is added: `assembleContract`
stays canonical-only, which is the consistent posture for a system with no forge-era inputs. Item 10
(the `s-asm-alias` slice) is dropped from the batch. The pre-existing P4 vocabulary aliasing in
`resolve.js`/`manifest.js` (the frozen `ALIAS_MAP`/`resolveAlias` exports) is left untouched — ripping
it out is a separate, larger change against the frozen surface and was not undertaken here.

## Consequences

Item 10 is dropped; item 9 (the namespace-agnostic `contract-assemble.js` body-parse bug) still ships.
The `resolve.js`-aliases-but-`assembleContract`-does-not asymmetry remains, but is unreachable with
canonical-keyed manifests (the only kind we author) — canonical keys self-alias, so no live trigger
exists. This ADR is the reversal point should multi-tenant/old-vocab support ever be needed: re-add
the body aliasing (and optionally the warn-lint) per the design's item-10 sketch.
