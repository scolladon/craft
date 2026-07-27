# 110 — manifest-lint validates the `paths.dod` file-ref only

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

`paths` is a recognized top-level manifest key but is **reserved-but-inert**: `validateManifest` falls
through with no sub-validation (`engine/src/manifest.js`, the *"paths, retrieval, execution: recognized; no
sub-validation"* branch). A *declared* `paths.dod` pointing at a missing file is almost certainly a typo the
author wants caught at lint, consistent with how `context:`/`scripts:` file-refs are checked by
`checkFileRef`. The question (DC-6) is how far to extend `paths` validation.

## Options considered

1. **Validate all `paths.*`** — add full sub-validation to the `paths` key — cons: out of P20 scope; could
   break repos relying on `paths`'s inertness.
2. **Stay inert** — a missing declared DoD surfaces only at runtime as the verify warning — cons: defers all
   feedback to runtime; lets a typo'd path masquerade as plain absence.
3. **Validate `paths.dod` only** — a declared `paths.dod` must reference an existing file; the rest of `paths`
   stays inert. *(designer's recommendation; chosen)* — pros: catches the typo at the boundary; bounded to
   P20 / cons: a narrow special-case in the `paths` switch.

## Decision — *adopted-as-recommended (no user judgment)*

`manifest-lint` validates **`paths.dod` only**: when `paths.dod` is declared, it must reference an existing
file (via the existing `checkFileRef`), failing lint with a clear `paths.dod references missing file: <path>`
message. The remaining `paths.*` keys stay **reserved-but-inert** — no behaviour change. **An absent
`paths.dod` is not a lint error** — absence is the runtime warning (ADR-107), distinct from a declared-but-
missing typo.

## Consequences

- A typo'd DoD path fails fast at manifest-lint, before any phase runs; a genuinely DoD-less repo lints clean
  and gets the runtime `NO-OP(verify):` warning.
- The `paths` reserved-but-inert contract is preserved for every key except `dod`; widening it is a separate,
  out-of-scope item.
- This validation bites only when `paths.dod` is *declared*; it never fires on the default `docs/DOD.md`
  probe path (DC-2/ADR-106), which is a runtime concern.
