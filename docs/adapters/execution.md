# Execution adapter spec

## Port interface

- `spawn(role, ctx) → result` — launch a worker with the given identity and run context; the
  adapter maps `role` to its own worker primitive and runs the phase under the injected block.
  - **role**: a registered worker identity (e.g. `craft:part-implementer`) — the adapter maps it
    to its own worker primitive (Claude: a Task subagent typed `craft:<role>`; Pi: a fresh `pi`
    run).
  - **ctx**: the assembled run context — the engine-assembled **injected block**
    (`contract-assemble` output: core + bundles + retrieval note + manifest context), the working
    directory, the task dynamics (phase id, part text, gate string, commit message, artifact
    paths), and the resolved **model** (from the Model port).
  - **pre**: `ctx.injectedBlock` is non-empty (assembled at phase entry); the working dir is an
    isolated workspace (VCS `isolate` ran).
  - **post**: a worker ran the phase to completion under the injected block; **the contribution
    is in a committed artifact** (artifact-is-the-handoff — core invariant, port-agnostic);
    `result` carries the worker's final message + usage block. A dead worker → fresh respawn fed
    from the artifact, never a continuation.

- `runInline(ctx) → result` — role-less / in-process execution; the session is both
  orchestrator and worker.
  - **ctx**: same shape as `spawn`; the injected block is assembled with the inline carve-outs
    (`the commit is the handoff` / `the session model`).
  - **pre**: `ctx.injectedBlock` non-empty; working dir is the current repo (no separate
    isolation step for role-less phases).
  - **post**: identical to `spawn` (committed artifact); the "final message to parent" line is
    moot (no parent session receives it).

## Core policy retained (NOT port verbs)

The following decisions are owned by the orchestrator/core and are not re-decided by any
adapter:

- **When a phase runs `spawn` vs `runInline`**: determined by `phase.execution` (`agent` |
  `inline`) in the resolved pipeline — the adapter only receives the chosen path.
- **Fan-out parallelism**: agent-mode only; `runInline` is sequential. The multi-dimension
  harness stays `agent` even under a lean profile.
- **Dead-worker invariant**: a dead worker → fresh respawn fed from the artifact, never a
  continuation. The port must not violate this invariant.

## Binding set

The valid bindings are **`{ claude, pi, opencode, copilot, codex }`**.

## Claude binding

`spawn` is the "Agent spawns" invariant block in `skills/run/SKILL.md`:

1. Spawn a Task with `subagent_type: craft:<role>` and the resolved `model` param.
2. Prepend the step-3 injected block to the spawn prompt, then working dir + task dynamics +
   artifact paths.
3. Await the commit; verify on return.

`runInline` is the inline branch of the same walk step: load the injected block (assembled
with `--inline`; carries the two carve-out lines); if `phase.role` resolves to a local agent
def, load that body right after the block; run in-session. Verify, gate, record, and handoff
are identical to `spawn`.

## Pi binding

`spawn`:

- **Subprocess**: run `pi -p "<injectedBlock + dynamics>"` via `execFile('pi', args)` — argv
  array, stdin ignored (pi hangs on an open stdin pipe in `-p` mode), no shell interpolation
  (untrusted-input discipline). Optionally prepend `--mode json` for structured JSONL output
  (`parseUsage` reads it).
- **SDK (documented, richer alternative)**: `createAgentSession` + `session.prompt(injectedBlock
  + dynamics)`. The SDK variant is documented here as the preferred path for production use; the
  subprocess variant is the shipped binding. The adapter chooses one; the port contract is
  identical either way.

`runInline`: Pi has no harness-native inline concept; treat as sequential per-phase
subprocess — one `pi -p` invocation per phase, artifact-handoff carries state between phases.

Pi omits sub-agents → sequential per-phase runs; the artifact-handoff invariant carries state
where Claude would use fan-out.

**Native discoverable surface (`adapters/pi/`).** pi also ships as a `pi install`-able package on
top of the same subprocess seam: a `/craft-run` prompt-template entrypoint
(`adapters/pi/prompts/craft-run.md`, plus one dispatcher per exposed phase) that loads the shared
`skills/run/SKILL.md` verbatim — single-sourced, not re-authored — and one extension
(`adapters/pi/extensions/craft-guard/`) wiring the git-guard `tool_call` hook, the `CRAFT_ROOT`
export, and the `craft` flag. This changes *discoverability*, not topology: the interactive
`/craft-run` walk still drives the SAME proven sequential per-phase runs described above — no
subagent is introduced, no new port verb is added.

## opencode binding

`spawn` dispatches the opencode subagent `craft:<role>` (`agents/craft-<role>.md`, `mode:
subagent`) via the task tool / `@craft-<role>`, gated by `permission.task`:

1. Prepend the step-3 injected block (`ctx.injectedBlock`, the agent-mode `contract-assemble`
   output) to the spawn prompt, then working dir + task dynamics + artifact paths.
2. Await the commit; verify on return.

The artifact-is-the-handoff and dead-worker-respawn invariants hold unchanged. Review fan-out is
N parallel subagents.

`runInline` is the opencode primary agent running in-session (inline carve-outs) — same shape as
the Claude inline branch.

**Subagent-depth topology**: `subagent_depth: 1` — the orchestrator runs the primary agent, and
a subagent cannot itself fan out further. If depth-1 fan-out degrades a parallel review step, the
fallback is sequential-per-phase (one subagent invocation per phase in turn, artifact-handoff
carrying state between them, as in the Pi binding) — this is a live item, not yet exercised
against a real opencode run.

**Failure → blocker**: an unreachable subagent, a non-zero `permission.task` guard block, or a
dead subagent with no committed artifact all escalate through the injected blocker protocol; the
startup-vs-mid-phase split is identical to the Pi binding above.

## Copilot binding

`spawn` dispatches a Copilot subagent via the `task` tool
(`{ name, prompt, agent_type, description, model?, reasoning_effort?, context_tier?, mode:
'background'|'sync' }`); config `subagents.agents.<name>` carries the per-subagent
`model`/`effortLevel`/`contextTier` (each may be `"inherit"`). `list_agents`/`read_agent` are the
discovery surface for what a session can dispatch to; `/fleet` enables parallel subagent
execution. `runInline` is the primary agent running in-session, with the same inline carve-outs
as the Claude and opencode bindings.

**Native discoverable surface.** Copilot loads plugins from **two** repeatable `--plugin-dir`
flags: `--plugin-dir <repo>` resolves the shared craft skills at `<repo>/skills/<name>/SKILL.md`
**by reference** — the binding ships no `adapters/copilot/skills/` directory, so drift between
the shared source and a copy is structurally impossible — and `--plugin-dir
<repo>/adapters/copilot` supplies this binding's own `agents/`, `hooks/`, and `commands/`.
`copilot plugin install owner/repo` plus `copilot plugin install owner/repo:adapters/copilot` is
the distribution path once published. The entrypoint is the shared `run` skill itself — its own
frontmatter name, directly invocable via the `skill` tool as `{ skill: "run" }` (confirmed live:
`userInvocable: true`); `commands/craft-run.md` is the thin adapter-local command that names the
input and defers to it, dispatched headlessly as `copilot -p "/craft-run <input>"`. Artifact-is-
the-handoff and dead-worker-respawn hold unchanged.

## Codex binding

`spawn` dispatches via the `multi_agent_v1` namespace (`spawn_agent`, `send_input`, `wait_agent`,
`resume_agent`, `close_agent`). Two facts are non-obvious and load-bearing:

- The concurrency cap is **4 slots including the orchestrator**, so usable fan-out width is
  **3** — wide phases batch to that width rather than assuming a flat 4-way spread.
- Codex **suppresses** fan-out unless a user turn, an `AGENTS.md`, or a skill instruction
  explicitly asks for delegation. The binding's adapter-authored entrypoint carries that ask
  itself; without it, a run silently degrades to sequential per-phase execution with no error.

`codex exec` takes one user message and runs the whole request to completion — the same shape as
the copilot and opencode bindings (one invocation walks every phase), not one invocation per
phase.

**Native discoverable surface.** A local file-backed marketplace (`"source": "local"`) carries
two plugin entries: `craft`, resolving the shared `skills/` directory **by reference** at the
repo root (no adapter-local copy, so drift between the shared source and a copy is structurally
impossible), and `craft-codex`, supplying this binding's own `hooks/`, `agents/`, and entrypoint.
Installed via `codex plugin marketplace add` then `codex plugin add`.

Artifact-is-the-handoff and dead-worker-respawn hold unchanged.

## Failure → blocker

Adapter failure is a blocker, never a silent pass: a `spawn` or `runInline` that cannot reach
its worker, a non-zero Pi subprocess exit, or a worker that dies mid-phase escalates through the
blocker protocol that `contracts/core.md` injects into every spawn
(`{ unit, reason, ≤3 options }`). This spec relies on that injected invariant and does not
restate it.

Failures split by where they are detectable:

**Startup errors** (knowable before the phase body runs): worker binary not found, model
unavailable before launch, working dir missing or not isolated. Escalate immediately — the
phase never starts.

**Mid-phase errors** (knowable only at runtime): a Pi subprocess exits non-zero mid-phase; an
agent dies without a committed artifact; the working dir was mutated outside the isolated
workspace. Escalate via the blocker protocol. A committed partial artifact is a valid respawn
target — the respawned worker reads it and continues from the last committed state.

The "dead worker → respawn from artifact, never a continuation" invariant means the adapter
must NOT attempt to resume a partially-live worker. Tear it down and respawn from the artifact.
