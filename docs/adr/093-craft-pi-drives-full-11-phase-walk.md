# 093 — `craft-pi` entrypoint drives the full 11-phase walk

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P17-pi-adapter-productization.md · **Supersedes/Refines:** none

## Context

P17 productizes the P16 Pi adapter PoC into a real `craft-pi` user entrypoint (ADR-086: a separate
entrypoint). The load-bearing scope question is *how much of the 11-phase craft pipeline that bin
drives*. Zero-manifest resolution leaves construction/harness gates as unresolved placeholders, and
four phases (`workspace`/`decisions`/`propose`/`integrate`) carry no `craft:<role>` worker — in the
Claude adapter they are session-owned, driven interactively by the orchestrator. Anything beyond a
single gated phase therefore needs a committed manifest (so gates resolve) and defined behaviour for
the role-less phases in a non-interactive bin.

## Options considered

1. **Single `implementation` phase** — the P16 probe via the real bin; operator supplies one gate.
   pros: smallest, fully-gated, ships now / cons: thin reading of "productize". *(designer's recommendation)*
2. **Worker subset design→documentation** — drive the 7 worker phases; needs a committed manifest.
   pros: real multi-phase run / cons: still skips the role-less orchestrator phases.
3. **Full 11-phase walk** — all phases incl. the role-less ones; needs a manifest AND defined
   headless semantics for `workspace`/`decisions`/`propose`/`integrate`. pros: true end-to-end parity
   with the Claude path / cons: largest scope; most genuinely-new semantics. *(chosen by the user)*

## Decision

`craft-pi` drives the **full 11-phase walk**. To make this resolvable and safe:

- A **committed manifest** ships with the adapter so every phase gate resolves to a real command
  (no `<gates.phase>` placeholder reaches a code-producing commit — never-commit-on-red holds). This
  resolves DC-8 to "committed manifest resolves all gates", superseding the single-phase DC-8(c).
- The four **role-less phases get explicit headless semantics** (defined in the revised design): the
  deterministic ones (`workspace`, `propose`) run as local steps; the interactive ones (`decisions`,
  `integrate`) get a defined non-interactive behaviour rather than an interactive conversation.
- Provider/model selection stays **passthrough** (DC-3): the committed manifest resolves *gates*, not
  a baked-in provider/model — `craft-pi` remains provider-neutral.

## Consequences

- The design must be revised before planning to specify: the committed manifest's contents; the
  headless behaviour of each role-less phase; how `decisions`/`integrate` behave without an
  interactive orchestrator. These open new load-bearing sub-decisions, surfaced as fresh
  decision-candidates by the design revision (not pre-decided here).
- Scope and test surface grow well beyond the P16 probe: sequential per-phase `pi` runs with
  artifact-handoff across all worker phases, plus the role-less-phase steps.
- The on-demand live smoke (ADR-089/090, not CI-gated) becomes a fuller end-to-end run; the
  deterministic walk/spawn/gate logic remains the CI-proven part.
- A fuller walk does not foreclose later reuse by a manifest `adapter:` key (ADR-086) should a
  second adapter graduate.
