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
- **Harness-as-a-Service (HaaS)** — craft is itself a delivery harness offered as a reusable, configurable, governed layer (sense a); it also *hosts* harnesses (review, validation, architecture, …) as pluggable sub-services (sense b). The engine wires and gates each harness around an engine-owned invariant contract; the harness is pluggable, the contract is not. Seven native bindings under `adapters/` drive the same engine core on non-Claude runtimes, proving the ports are pluggable — see the bindings table under [Layout](#layout).
- **Bounded long-running work** — git-worktree isolation + parted TDD + per-phase role agents (some parallel, e.g. the review fan-out) + bounded per-phase scope, so large multi-step work stays safe and resumable.

Recognize any of these? [docs/GUIDE-concepts.md](docs/GUIDE-concepts.md) maps craft's
mechanisms onto four frames people already use for agentic delivery — Karpathy's
*write-the-loop*, Böckeler's harness taxonomy, config layers, and Osmani's inner/outer
loop + the Verdict — so the shape above reads as familiar, not new.

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

`--config <name>` resolves the manifest for that run across two scopes — repo-local
`./.claude/craft-<name>.md` first, then user-scope `~/.claude/craft-<name>.md` — local always wins
when both exist (distinct from `--profile`, which sets the execution map inside whichever manifest
is read). An absent target at both scopes is a loud stop naming both paths — it never silently
falls back to `.claude/workflow.md`.

Phase skills also run standalone: `/craft:review` (multi-dimension review battery on
the current branch), `/craft:validation` (scoped harness run + triage),
`/craft:init` (interview-driven named-manifest generator — writes `.claude/craft-<name>.md` locally
or, with `--scope user`, to `~/.claude/craft-<name>.md`),
`/craft:promote-config` (relocates a named config between the two scopes),
`/craft:metrics` (zero-arg usage-telemetry miner — mines transcript history and prints a structured usage report), etc.

## Customize — `.claude/workflow.md` in your repo

No manifest = sensible defaults via capability probing (lockfile detection, test-script
discovery, technique-config probe, remote probe). The manifest declares only what
probing can't infer. Zero-config delivery requires one precondition: **a discoverable
test/validate command** — a repo with one runs the full default pipeline on any toolchain
(validated on a non-tsgit Python/pytest repo; see
[docs/archive/SC5-second-instantiation-record.md](docs/archive/SC5-second-instantiation-record.md)); a
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
- `adapters/<tool>/` — native bindings of the same engine core on non-Claude runtimes.
  Each has its own README plus a live contract-discovery record in
  `docs/adapters/<tool>-poc-record.md`; all proofs are on-demand, not CI-gated.

| Binding | Kind | Guard posture |
|---|---|---|
| [`pi`](adapters/pi/) | headless subprocess — the `craft-pi` bin drives the full 11-phase walk (the original HaaS portability proof) | `tool_call` predicate + gate-command wrapper |
| [`opencode`](adapters/opencode/) | native-interactive — commands + subagents + `opencode.json` via opencode's own subagent dispatch | enforcing `tool.execute.before` plugin |
| [`copilot`](adapters/copilot/) | native plugin — local `agents`/`hooks`/`commands` + shared craft `skills/` via two `--plugin-dir` flags | path containment + `--deny-tool` enforce; the `preToolUse` hook is an observational audit trail |
| [`codex`](adapters/codex/) | local marketplace (shared `skills/` by reference) via `multi_agent_v1` subagent dispatch | **denying** PreToolUse hook (exit 2 genuinely blocks) + execpolicy defence-in-depth |
| [`cursor`](adapters/cursor/) | headless one-turn agent (`cursor-agent -p`), live-proven incl. a full construction run | enforcing `beforeShellExecution` deny — `failClosed: true` is load-bearing |
| [`aider`](adapters/aider/) | headless edit loop — the auto-commit is the handoff (exit code is not the success signal); execution GO | **NO-GO** — no deny-capable pre-execution surface exists; declined honestly |
| [`antigravity`](adapters/antigravity/) | customization declination — **not** a runnable port binding (no headless execution port); human-driven in the GUI | shipped but pinned from docs, not live-verified |

## Design provenance

[docs/DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md) — the living
engine architecture (phases, contract injection, ports, enforcement hierarchy);
[docs/DESIGN-history.md](docs/DESIGN-history.md) — the frozen workflow-promotion
migration record. [docs/archive/SPIKE.md](docs/archive/SPIKE.md) — the empirical
spike that pinned hook inheritance, `updatedInput` composition (same-snapshot,
last-writer-wins → hence deny-based hooks), model override precedence, and the skill
invocation surface.
