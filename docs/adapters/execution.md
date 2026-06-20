# Execution adapter spec

## Port interface

- `spawn(role, ctx) → result` — launch a worker with the given identity and run context; the
  adapter maps `role` to its own worker primitive and runs the phase under the injected block.
  - **role**: a registered worker identity (e.g. `craft:slice-implementer`) — the adapter maps it
    to its own worker primitive (Claude: a Task subagent typed `craft:<role>`; Pi: a fresh `pi`
    run).
  - **ctx**: the assembled run context — the engine-assembled **injected block**
    (`contract-assemble` output: core + bundles + retrieval note + manifest context), the working
    directory, the task dynamics (phase id, slice text, gate string, commit message, artifact
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

The valid bindings are **`{ claude, pi }`**.

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

- **Subprocess (PoC)**: run `pi -p "<injectedBlock + dynamics>"` via `execFile('pi', args)` —
  argv array, no shell interpolation (untrusted-input discipline). Optionally prepend
  `--mode json` for structured JSONL output (`parseUsage` reads it).
- **SDK (documented, richer alternative)**: `createAgentSession` + `session.prompt(injectedBlock
  + dynamics)`. The SDK variant is documented here as the preferred path for production use; the
  subprocess variant is the PoC binding. The adapter chooses one; the port contract is identical
  either way.

`runInline`: Pi has no harness-native inline concept; treat as sequential per-phase
subprocess — one `pi -p` invocation per phase, artifact-handoff carries state between phases.

Pi omits sub-agents → sequential per-phase runs; the artifact-handoff invariant carries state
where Claude would use fan-out.

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
