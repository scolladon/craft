# 133 — The `gates.slice` manifest key is renamed `gates.part`

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P24-rename-slice-vocabulary.md · **Supersedes/Refines:** none

## Context

`gates.slice` is the manifest key for the per-commit *targeted* gate (the check run over the
touched files of one unit), as distinct from `gates.phase`. It is a separate sense from the plan
unit, but it is named after it. It lives in the `GATE_FIELDS` validation set in
`engine/src/manifest.js`, in three manifest fixtures, and in skill prose; the live default
pipeline resolves code-producing phases to `<gates.phase>`, so there is no `<gates.slice>`
placeholder to rewire. Renaming the key is therefore a manifest-schema change with no
descriptor-substitution impact.

## Options considered

1. **Keep `gates.slice`** *(designer recommendation)* — pros: no schema break; "targeted gate" is an honest reframing of the prose. Cons: a residual "slice" token survives in the schema.
2. **Rename to `gates.part`** *(user choice)* — pros: total vocabulary consistency; no surviving "slice" in the manifest schema. Cons: a breaking manifest-schema change — a repo declaring `gates: { slice: … }` fails validation after the rename.
3. **Rename the whole cadence triad** (`slice`/`phase`/`review-batch`) — pros: uniform. Cons: drags `phase`/`review-batch` into scope with no mandate.

## Decision

Rename `gates.slice` → `gates.part`. The user chose total vocabulary consistency over schema
stability, deviating from the recommendation. `GATE_FIELDS`, the three fixtures, and the pinning
test flip in lockstep. `gates.phase` and `gates.review-batch` are unchanged.

## Consequences

- The manifest schema accepts `gates.part` and rejects `gates.slice`; this is a breaking change for
  any external manifest using the old key (none known in this repo's surface).
- No `<gates.slice>` placeholder exists in the live pipeline, so descriptor substitution is
  unaffected.
- Skill/template prose referencing the targeted gate names `gates.part`.
