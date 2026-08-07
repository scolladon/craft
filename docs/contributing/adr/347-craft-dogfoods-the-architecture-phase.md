# 347 — craft dogfoods the `architecture` phase with a repo-native boundary rule

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** none

## Context

The `architecture` phase ships default-off. The change that added
`engine/src/observability/adapters/claude/discovery.js`, moved a shared vocabulary out of
two bindings into `engine/src/observability/role-phase.js`, and widened the front door's
reach recorded an honest gap in its own DoD: no dependency or layering boundary check ran
over it. That is precisely the change shape an architecture harness exists for.

Two facts constrain the response. First, `skills/architecture/SKILL.md` **does exist** —
enabling the phase would not hit the "procedure resolves to no installed skill" STOP.
Second, the manifest declares no `architecture` technique, so enabling it alone lands on
the skill's terminal tier: `NO-OP(architecture): no techniques declared/probed`. Enabling
without a technique buys nothing at the cost of a phase.

The repo has no dependency-cruiser, madge, or eslint; `engine/package.json` carries one
dependency (`js-yaml`) and two devDependencies. It already expresses architectural rules as
plain Node test files over source text (`test/source-hygiene.test.js`,
`test/hermetic-suite.test.js`). The layering that exists and that the prior change
stressed: `usage-aggregate.js` is a pure core importing only `./skip-signals.js`; the
per-tool `telemetry.js` files are adapters importing shared vocabulary upward;
`usage-mine-main.js` is the composition root and legitimately imports every adapter.

## Options considered

1. **Land `test/architecture-boundaries.test.js` and declare it as a `boundaries`
   technique with `phases.architecture.enabled: true`** — pros: the repo gets the rule,
   the triage contract, the run-record tokens, and the mechanical DoD evidence ADR-108
   names / cons: one opus-tier spawn per code-touching run; the phase buys ceremony, not
   enforcement, since `ci.sh` runs the rule either way. *(designer's recommendation)*
2. **Land the rule file only, phase stays default-off** — pros: same enforcement, no
   per-run cost / cons: the DoD line keeps citing a gate that never runs.
3. **Leave everything as-is and record why** — pros: zero change / cons: keeps a standing
   lie in `DOD.md`.

## Decision

craft dogfoods the phase. Three things land together:

1. `test/architecture-boundaries.test.js`, expressing the boundary rules over source text
   with no new dependency: the pure core must not import adapters; adapters must not
   import one another; only a composition root (`*-main.js`) may import adapters.
2. A `boundaries` technique declared under `phases.architecture.harness.techniques` in
   `.claude/workflow.md`, mirroring the shape of the existing `validation` block.
3. `phases.architecture.enabled: true`.

The honest framing, recorded so nobody rediscovers it as a surprise: **the rule file is the
enforcement; the phase is the triage discipline and the evidence trail.** `ci.sh` runs the
rule whether or not the phase is enabled. What enabling buys is that a violation gets
triaged under a contract — fixed, or documented as a deliberate exception — instead of
being whatever the person who hit the red did next.

## Consequences

- The phase becomes part of craft's own default pipeline, bounded by
  `autoSkipEligible: true` — a change with no import or module-boundary edits auto-skips it.
- `<arch gate>` must now resolve to something executable; ADR-348 settles that.
- `DOD.md`'s architecture line stops being unbacked.
- Adding a genuinely-needed cross-layer import now requires either restructuring or a
  recorded exception — a real constraint on future work, accepted deliberately.
- The rule file, not a vendored tool config, is where boundary rules are edited.
