# 029 — Harness override merge: deep-merge one level

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P8-harness-config.md · **Supersedes/Refines:** none

## Context

`edits.js` `applyAllowedOverrides` applies whitelisted phase-override fields (role, model,
harness) to a descriptor by **scalar-replace**: `patch[field] = override[field]`. For `harness`
this is wrong: a partial manifest override `phases.validation.harness: {scope: per-file}` REPLACES
the whole block, dropping the descriptor's default `tool: stryker`. PRD §8 ("Defaults are strong;
every knob is optional") implies tune-one-knob — a partial override should keep the unset defaults.

## Options considered

1. **Scalar-replace (status quo)** — simplest; a partial override silently loses default knobs.
2. **Deep-merge one level** — manifest knobs merge over the descriptor's default `harness`; objects
   merge at the top level, override keys win, unset default keys survive; role/model stay
   scalar-replace. *(user choice)*
3. **Recursive deep-merge** — merge arbitrarily nested sub-objects. Unneeded: the canonical knobs
   are scalars/arrays, and array semantics (below) make recursion ambiguous.

## Decision

`harness` deep-merges **one level**; every other allowed field stays scalar-replace.
`applyAllowedOverrides` gets a harness branch: when BOTH the descriptor default and the override
`harness` are plain objects (non-null, non-array), `patch.harness = {...descriptor.harness,
...override.harness}`; otherwise fall through to scalar-replace (a descriptor with no default
harness, or a null/array override, lands the override as-is — the shape validator (ADR-030) rejects
malformed values before the resolver runs). **Arrays replace, not union:** an override
`dimensions: [code]` yields exactly `[code]`, not a union with the default — a repo that names
`dimensions` wants that exact set. The transform stays pure/immutable: the spread builds a new
object; neither the (deep-frozen) default nor the override is mutated.

## Consequences

`phases.validation.harness: {scope: per-file}` now preserves `tool: stryker` — the intuitive
tune-one-knob UX. Array-valued knobs (`dimensions`) replace wholesale, which the walk prose states
explicitly so no one expects partial-array merge. `role`/`model` semantics are unchanged (a swap is
a wholesale identity replacement). The one-level bound is documented; forward-compat unknown
sub-keys (ADR-030) merge at the top level only.
