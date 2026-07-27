# 265 — engine/src is provenance-clean source; the guard scans engine/src/**

- **Status:** accepted
- **Date:** 2026-07-21
- **Design:** docs/design/harden-prove-codex-binding.md · **Supersedes/Refines:** none

## Context

`engine/src/observability/adapters/claude/{telemetry,pricing}.js` carry `ADR-`/`Part `
references in comments, violating the no-provenance-in-source rule. They survive because
the existing `PROVENANCE_REF` grep suites scan **adapter surfaces only**
(`adapters/pi/test/native-surface.test.js`, `adapters/opencode/test/agents.test.js`),
never `engine/src`. A full scan of `engine/src` with the same regex finds 15 refs across 8
files — the 2 claude adapter files plus `manifest-harness`, `manifest-vocabulary`,
`manifest-pipeline-edits`, `manifest`, `gates`, and `skip-signals` — all genuine
breadcrumbs, no false positives. The backlog framed this as "extend the grep and strip, OR
exempt engine-internal comments — pick one, do not leave it neither."

## Options considered

1. **Scoped: extend the grep to `engine/src/observability/adapters/**` only, strip the 4
   claude refs, ADR-ratify an engine-internal-comment exemption** — pros: small diff, closes
   the adapter-nested leak. Cons: keeps two classes of source under two different provenance
   rules. *(designer's recommendation)*
2. **Broad: treat ALL `engine/src` as provenance-clean source — extend the guard to
   `engine/src/**`, strip all 15 refs across 8 files** *(chosen)* — pros: one uniform rule,
   most faithful to the absolute "no provenance in source, ever" invariant, no exemption
   carve-out to maintain. Cons: widest diff — touches engine internals unrelated to any
   binding.
3. **Exempt: ADR a blanket engine-internal exemption, strip nothing** — pros: least work.
   Cons: leaves the adapter-nested claude leak standing; contradicts that `claude/` is
   literally an adapter.

## Decision

**The no-provenance-in-source invariant applies uniformly to all of `engine/src` — there is
no engine-internal exemption.** The provenance guard is extended to scan `engine/src/**`
(alongside the existing adapter surfaces) and must find **zero** `ADR-`/`P<n>`/`Part <n>`/
`backlog #<n>` references. All 15 comment references across the 8 files are reworded to
state the rationale in prose without the numbered reference. Provenance lives in design docs,
ADRs, and the PR body — never in source or test.

## Consequences

- Any NEW `engine/src` file — including `engine/src/probe-harness.js` created for A2 in this
  same run — must be provenance-clean from birth; the extended guard enforces it.
- The guard test pins the known offenders **positively** (asserts the concrete files are
  scanned and clean), not merely "no matches anywhere" — a glob resolving to zero files must
  not pass vacuously.
- Comment rewrites are behaviour-preserving (all 15 matches are in `//` or `*` comment lines,
  none in executable code or load-bearing string literals).
- Future engine-internal design breadcrumbs move to the ADR/design layer, keeping the source
  free of numbered cross-references.
