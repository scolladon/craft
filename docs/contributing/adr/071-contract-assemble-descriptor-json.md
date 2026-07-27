# 071 — `contract-assemble` learns inserted/registered descriptors via `--descriptor-json`

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** refines ADR-025 (closes the deferred inserted-phase execution rider)

## Context

`contract-assemble-main.js` (`main()`, lines 94-110) re-parses `pipeline/default.yml` and does
`descriptors.find(d => d.id === descriptorId)`, STOPping "unknown descriptor-id" for any id not in the
13 defaults. An inserted/registered id (`bench`, `acme:bench`) therefore has no execution-time contract
— the P7-deferred rider (ADR-025). The walk already parses the `Resolution` (run/SKILL.md step 1b) and
holds the resolved descriptor for the phase it is about to enter.

## Options considered

1. **`--descriptor-json <path|->`** — the walk passes the single resolved descriptor it already holds;
   the bin finds `descriptorId` in it, falling back to `default.yml` only when the flag is absent / pro:
   zero recomputation, bin stays Resolution-schema-ignorant / con: a new flag the walk must supply.
   *(designer's recommendation)*
2. **`--resolution <path>`** — pass the whole Resolution; bin reads `effective[]` / con: bin learns the
   Resolution schema (coupling).
3. **Re-resolve inside the bin** from `--manifest` + `default.yml` / con: duplicates the resolver; two
   code paths can drift.

## Decision

`contract-assemble` accepts **`--descriptor-json`** carrying the resolved descriptor (or descriptor
set); when present, `descriptorId` is matched against that set; when absent, the default-path behavior
(parse `default.yml`, find by id) is **byte-unchanged**. A colon-bearing id (`acme:bench`) is accepted
as a discrete argv value. An id absent from *both* the flag set and the defaults still STOPs — the
guard survives.

## Consequences

- Inserted/registered phases EXECUTE under the engine-owned contract: the descriptor that reaches
  `assembleContract` carries the phase's declared `contract:` bundles, so core + declared bundles wrap
  the registered procedure with no contract-content change (R5/R9 via the existing assembler).
- `run/SKILL.md` step 3 passes `--descriptor-json` for inserted/registered phases; the default-phase
  path is unchanged. The "rides with P14" caveat in step 3 and the Walk error-paths inserted-id row are
  removed (STOP → EXECUTE).
- The bin never learns the Resolution schema; the walk owns extracting the one descriptor it passes.
