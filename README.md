# craft

A feature-delivery workflow engine for Claude Code, packaged as a plugin. One abstract
phase sequence — **workspace → design → decisions → planning → implementation → review →
refactoring → validation → documentation → propose → integrate** — that any repo adopts
as-is and customizes through a committed declination manifest. Zero session-memory
dependence: every load-bearing rule lives in a hook, a script, or versioned instruction text.

craft applies a **Harness-as-a-Service (HaaS)** pattern: the model (Model port), the runtime
(Execution port), the per-repo advisory memory store (Memory port), the usage-telemetry sink
(Telemetry port), and each per-phase harness are pluggable; the engine-owned invariant contract is not. This is a *pattern* — a reusable, governed
layer you install — not a hosted SaaS.

## Why craft

- **Industrialize delivery** — one gated phase sequence, repeatable; every load-bearing rule lives in a hook, a script, or versioned instruction text, not session memory.
- **Declinate per repo** — a committed `.claude/workflow.md` manifest customizes the pipeline (skip / insert / reorder / swap agent or skill / profile / per-phase harness config); no manifest = strong probed defaults.
- **Manage comprehension debt** — design docs + parted plans with pre-chewed context blocks capture *what* the change is and *how* it was built, so understanding survives context resets.
- **Manage intention debt** — ADRs and user-ratified decision candidates capture *why* every load-bearing choice was made.
- **Formalize the architecture harness with its own lifecycle** — a standalone `architecture` phase (probe → run → triage violations → gate the PR), default-off, enabled by one manifest line. Uses executing-harnesses (techniques declared per repo).
- **Formalize engineering harnesses with their own lifecycles** — `review` (dimensions / passes / convergence) and `validation` are first-class AI harnesses with their own config and gates. Both are executing-harnesses (techniques declared per repo).
- **Harness-as-a-Service (HaaS)** — craft is itself a delivery harness offered as a reusable, configurable, governed layer (sense a); it also *hosts* harnesses (review, validation, architecture, …) as pluggable sub-services (sense b). The engine wires and gates each harness around an engine-owned invariant contract; the harness is pluggable, the contract is not. `adapters/pi/` (the `craft-pi` bin) drives the same engine core on a non-Claude runtime, proving the Execution port is pluggable (portability proof; on-demand, not CI-gated).
- **Bounded long-running work** — git-worktree isolation + parted TDD + per-phase role agents (some parallel, e.g. the review fan-out) + bounded per-phase scope, so large multi-step work stays safe and resumable.

## Install

```bash
claude plugin marketplace add <this-repo-path-or-url>
claude plugin install craft@scolladon
```

Dev loop: `claude --plugin-dir /path/to/craft`.

## Use

```
/craft:run <backlog-id | path/to/spec.md | "feature description">
/craft:run --config <name> <backlog-id | path/to/spec.md | "feature description">
```

`--config <name>` loads `.claude/craft-<name>.md` as the manifest for that run (distinct
from `--profile`, which sets the execution map inside whichever manifest is read). An
absent `--config` target is a loud stop — it never silently falls back to `.claude/workflow.md`.

Phase skills also run standalone: `/craft:review` (multi-dimension review battery on
the current branch), `/craft:validation` (scoped harness run + triage),
`/craft:init` (interview-driven named-manifest generator — writes `.claude/craft-<name>.md`),
`/craft:metrics` (zero-arg usage-telemetry miner — mines transcript history and prints a structured usage report), etc.

## Customize — `.claude/workflow.md` in your repo

No manifest = sensible defaults via capability probing (lockfile detection, test-script
discovery, technique-config probe, remote probe). The manifest declares only what
probing can't infer. Zero-config delivery requires one precondition: **a discoverable
test/validate command** — a repo with one runs the full default pipeline on any toolchain
(validated on a non-tsgit Python/pytest repo; see
[docs/SC5-second-instantiation-record.md](docs/SC5-second-instantiation-record.md)); a
repo with no test command hits the gate-floor refusal by design (non-negotiable). **Start with [docs/GUIDE-customizing.md](docs/GUIDE-customizing.md)** —
the mental model (hexagon · ports · the invariant core you can't change) plus the full
injection catalog (skip / model / gate / execution / profile / harness / backlog / memory /
context / override / swap / insert), each linked to a runnable [`examples/`](examples/)
sample. Deeper schema, declination verbs, and protected phases: see
[docs/DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md).
`scripts/manifest-lint.sh` validates the manifest
and refuses to run on unknown keys — misconfiguration fails loudly.

## Layout

- `skills/run` — orchestrator (cross-phase invariants, run record)
- `skills/<phase>` — one per phase: non-overridable Preamble + overridable Procedure
- `agents/` — role contracts with pinned models (designer, planner, reviewer,
  part-implementer, refactor-executor, validation-triager, docs-writer, backlog-ticker,
  requirements-writer, architecture-triager).
  A pinned model that goes down falls back (manifest `models.fallback` → session model)
  and the degraded tier is remembered for the rest of the run.
- `hooks/` — PreToolUse guard: `git diff/show` without `--no-ext-diff` is denied with
  the corrected command (`--no-verify` is the consumer's discretion — craft does not block it)
- `scripts/` — worktree setup/teardown (validation run-lock aware), manifest lint, plan lint
- `templates/` — design / plan (defines the part schema plan-lint enforces) / ADR
- `adapters/pi/` — reference Pi adapter: a separate `craft-pi` entrypoint that drives the full 11-phase walk on a non-Claude runtime via the engine's ports (the HaaS portability proof; on-demand, not CI-gated)

## Design provenance

[docs/DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md) — the living
engine architecture (phases, contract injection, ports, enforcement hierarchy);
[docs/DESIGN-history.md](docs/DESIGN-history.md) — the frozen workflow-promotion
migration record. [docs/SPIKE.md](docs/SPIKE.md) — the empirical
spike that pinned hook inheritance, `updatedInput` composition (same-snapshot,
last-writer-wins → hence deny-based hooks), model override precedence, and the skill
invocation surface.
