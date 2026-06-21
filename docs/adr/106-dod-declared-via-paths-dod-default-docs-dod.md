# 106 — DoD is declared via `paths.dod`, defaulting to `docs/DOD.md`

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

The DoD artifact needs a declaration surface. Craft already has an established `paths.<artifact>` convention
(`paths.adr|design|requirements|plan`), each a manifest key with a well-known default directory. The DoD
should follow the least-surprising extension of that convention.

## Options considered

1. **`paths.dod` only** — no default location; unset ⇒ absent ⇒ warning — cons: drops the discoverable
   default.
2. **Fixed `docs/DOD.md` only** — cons: drops manifest control / override.
3. **Both** — `paths.dod` overrides, `docs/DOD.md` is the probed default. *(designer's recommendation)* —
   pros: matches every existing `paths.<artifact>`-with-default; least surprising / cons: one inversion vs
   precedent (below).

## Decision — *adopted-as-recommended (no user judgment)*

A repo declares its DoD via the manifest key **`paths.dod`** (a path to a single file); when unset, the
verification probes the well-known default **`docs/DOD.md`**. This mirrors the key-else-default shape of
every existing `paths.<artifact>` probe.

**The one deliberate inversion vs precedent:** existing `paths.*` probes *create the dir/artifact if absent*
(the artifact is always produced). A DoD is repo-authored and optional, so its probe **warns on absence and
never creates** (ADR-107).

## Consequences

- `paths.dod` joins the recognized `paths.*` family; a manifest may point it at any path (e.g. `docs/DOD.md`,
  `.craft/dod.md`).
- The verification reads the DoD file **verbatim as trusted operator input** (same trust model as `context:`
  files; manifest-lint is the only gate) — never interpreting it as instructions to the engine.
- A *declared* `paths.dod` pointing at a missing file is a lint error (ADR-110); a plain absent `paths.dod`
  with no `docs/DOD.md` is the runtime warning (ADR-107), not a lint error.
