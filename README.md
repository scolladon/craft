# craft

A feature-delivery workflow engine for Claude Code, packaged as a plugin. One abstract
phase sequence — **workspace → design → decisions → planning → implementation → review →
refactoring → validation → documentation → propose → integrate** — that any repo adopts
as-is and customizes through a committed declination manifest. Zero session-memory
dependence: every load-bearing rule lives in a hook, a script, or versioned instruction text.

## Why craft

- **Industrialize delivery** — one gated phase sequence, repeatable; every load-bearing rule lives in a hook, a script, or versioned instruction text, not session memory.
- **Declinate per repo** — a committed `.claude/workflow.md` manifest customizes the pipeline (skip / insert / reorder / swap agent or skill / profile / per-phase harness config); no manifest = strong probed defaults.
- **Manage comprehension debt** — design docs + sliced plans with pre-chewed context blocks capture *what* the change is and *how* it was built, so understanding survives context resets.
- **Manage intention debt** — ADRs and user-ratified decision candidates capture *why* every load-bearing choice was made.
- **Formalize the architecture harness with its own lifecycle** — a standalone `architecture` phase (probe → run dependency-cruiser → triage violations → gate the PR), default-off, enabled by one manifest line.
- **Formalize engineering harnesses with their own lifecycles** — `review` (dimensions / passes / convergence) and `validation` (mutation: tool / scope / triage) are first-class AI harnesses with their own config and gates.
- **A framework for AI harnesses** — the engine wires and gates whatever harness a repo brings (review, validation, architecture, …) around an engine-owned invariant contract; a harness is pluggable, the contract is not.
- **Bounded long-running work** — git-worktree isolation + sliced TDD + per-phase role agents (some parallel, e.g. the review fan-out) + bounded per-phase scope, so large multi-step work stays safe and resumable.

## Install

```bash
claude plugin marketplace add <this-repo-path-or-url>
claude plugin install craft@scolladon
```

Dev loop: `claude --plugin-dir /path/to/craft`.

## Use

```
/craft:run <backlog-id | path/to/spec.md | "feature description">
```

Phase skills also run standalone: `/craft:review` (multi-dimension review battery on
the current branch), `/craft:validation` (scoped mutation run + triage), etc.

## Customize — `.claude/workflow.md` in your repo

No manifest = sensible defaults via capability probing (lockfile detection, test-script
discovery, mutation-config probe, remote probe). The manifest declares only what
probing can't infer. Schema, declination verbs (`context:` / `override:` / `skip:`),
protected phases, and gate placeholder vocabulary: see
[docs/DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md).
`scripts/manifest-lint.sh` validates the manifest
and refuses to run on unknown keys — misconfiguration fails loudly.

## Layout

- `skills/run` — orchestrator (cross-phase invariants, run record)
- `skills/<phase>` — one per phase: non-overridable Preamble + overridable Procedure
- `agents/` — role contracts with pinned models (designer, planner, reviewer,
  slice-implementer, refactor-executor, validation-triager, docs-writer, backlog-ticker,
  requirements-writer, architecture-triager).
  A pinned model that goes down falls back (manifest `models.fallback` → session model)
  and the degraded tier is remembered for the rest of the run.
- `hooks/` — PreToolUse guards: `git diff/show` without `--no-ext-diff` is denied with
  the corrected command; `--no-verify` is denied flat
- `scripts/` — worktree setup/teardown (mutation run-lock aware), manifest lint, plan lint
- `templates/` — design / plan (defines the slice schema plan-lint enforces) / ADR

## Design provenance

[docs/DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md) — the living
engine architecture (phases, contract injection, ports, enforcement hierarchy);
[docs/DESIGN-history.md](docs/DESIGN-history.md) — the frozen workflow-promotion
migration record. [docs/SPIKE.md](docs/SPIKE.md) — the empirical
spike that pinned hook inheritance, `updatedInput` composition (same-snapshot,
last-writer-wins → hence deny-based hooks), model override precedence, and the skill
invocation surface.
