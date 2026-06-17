# 021 — Third profile `lean` + per-archetype profile expansion

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P6-execution-topology.md · **Supersedes/Refines:** refines ADR-008

## Context

ADR-008 set three-level execution precedence (per-phase field > profile > top-level default) with
profiles as named bundles; PRD §10 named `solo` (all non-harness inline) and `full` (all agent). A
common middle ground — *inline the cheap judgment/synthesis phases, isolate the heavy code-producer
and the harnesses* — has no name. The existing profile model (`{ defaultExecution, harnessStaysAgent }`)
is **binary**: it cannot express "some non-harness archetypes inline, others agent." Profiles are
**convenience sugar, not capability** — any topology is already expressible by hand via the per-phase
`execution:` precedence — so the question is only whether to ship a named preset for the common mix.

## Options considered

1. **`solo`/`full` only**; express any middle via per-phase `execution:` — zero new vocab, but no
   memorable name for a frequent mix. *(designer recommended, YAGNI)*
2. **Add `lean` to the closed vocab** (`solo|full|lean`); generalise `expandProfile` to a
   per-archetype map — a named preset; one more (pure-sugar) engine opinion. *(user choice)*
3. **Open, manifest-defined profiles** (`pipeline.profiles.<name>: <map>`) — fullest customization,
   but a real parse/validate/expand feature, P7+ scope.

## Decision

The closed profile vocabulary becomes **`solo | full | lean`**. `expandProfile` returns a
**per-archetype execution map**; `applyProfileToArchetype` looks the descriptor's archetype up in it.
The **harness-stays-agent caveat is promoted to an unconditional invariant** in
`applyProfileToArchetype` (harness → `agent` regardless of the map — the SP1 parallelism caveat binds
across every profile, present and future). Maps:

| Profile | setup | specification | construction | refinement | delivery | harness |
|---|---|---|---|---|---|---|
| `solo` | inline | inline | inline | inline | inline | **agent** |
| `lean` | inline | inline | **agent** | **agent** | inline | **agent** |
| `full` | agent | agent | agent | agent | agent | **agent** |

**Profiles remain derivable sugar.** `lean` ≡ `execution: inline` top-level + `phases.{implementation,
refactoring}.execution: agent` (harness auto-stays agent at the top-level default too). The DX docs
(README/DESIGN/`examples/`) record this derivation so the named presets never read as the only way.

## Consequences

`profile.js` generalises from a binary flag to a per-archetype map; `solo`/`full` behaviour is
byte-identical (S1/SC1 hold). `pipeline.profile` and `--profile` (ADR-022) accept `solo|full|lean`.
An **S-lean** scenario pins the new split (ADR-023). The harness invariant is now structurally
unconditional — a future fourth profile cannot drop it. Adding a future named profile is one map
entry; the per-phase `execution:` escape hatch covers anything left unnamed.
