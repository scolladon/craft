# 022 — Per-invocation args via `pipeline-resolve` bin flags

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P6-execution-topology.md · **Supersedes/Refines:** none (realises SP3)

## Context

SP3 confirmed `$ARGUMENTS` reaches the orchestrator skill verbatim in headless `-p` (flag tokens,
comma-lists, embedded quotes preserved). forge-level flags — `--profile`, `--skip` — must shape
resolution and compose with the repo manifest at **CLI-wins** precedence. The constraint: the
engine's 7-export module surface and `pipeline/default.yml` must stay untouched (the P6 surface
gate). `resolvePipeline` already honours `pipeline.profile` and `pipeline.skip` from a manifest, so
the only question is **where the CLI overlay is merged**.

## Options considered

1. **Orchestrator parses flags from `$ARGUMENTS`, passes them as CLI args to `pipeline-resolve.js`;
   the bin merges them into the effective manifest at highest precedence before calling
   `resolvePipeline`.** Authoritative merge stays in the deterministic, unit-testable engine layer;
   `resolvePipeline` (and the 7 exports) untouched — the bin is not part of the frozen surface.
   *(recommended)*
2. **Orchestrator writes an ephemeral `mktemp` merged manifest, passes `--manifest <tmp>`.** No bin
   API change, but couples walk prose to the manifest YAML schema; runtime YAML construction; harder
   error surfacing.
3. **Walk post-processes `Resolution` in-session.** Duplicates precedence logic between engine and
   walk — DRY violation, drift risk.

## Decision

`engine/bin/pipeline-resolve.js` gains two optional flags: **`--profile <name>`** (overrides
`pipeline.profile`) and **`--skip <id,…>`** (comma-split, **union-extends** `pipeline.skip`; the
existing resolver step alias-resolves the ids). The pipeline path stays positional; the manifest
path stays positional and optional; flags may appear anywhere. The bin constructs an **effective
manifest** = repo manifest with the CLI overlay applied (profile override, skip union) and hands it
to `resolvePipeline`, which is **unchanged**. The orchestrator (`run/SKILL.md` step 1b) strips
leading `--profile`/`--skip` tokens out of `$ARGUMENTS`, forwards them to the bin, and treats the
**non-flag remainder as the brief** (step 2); a flags-only `$ARGUMENTS` yields an empty brief → the
existing ambiguous-input STOP. `--profile lean` is thus a first-class per-invocation topology switch.

## Consequences

CLI-wins precedence lives in one deterministic home (the bin). `resolvePipeline`, the 7 exports, and
`pipeline/default.yml` are untouched — the surface gate holds. Bin flag precedence is unit-tested
(CLI profile beats manifest profile; `--skip` unions; flags compose with positionals — ADR-023).
P7's full pipeline-editing surface (skip-any / insert / reorder via manifest) is a superset; this is
only the per-invocation CLI overlay over the two fields the resolver already consumes.
