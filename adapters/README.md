# adapters — native bindings of the craft engine

craft's core is provider-neutral behind nine ports (execution, model, gate, code-access,
backlog, VCS, memory, policy, intention). **craft itself is the Claude Code adapter**; each
directory here re-binds the same engine core to another runtime — proof the seams are real.

Each binding ships its own README (install, how to drive it, guard posture) plus a live
contract-discovery record in [`../docs/contributing/specs/<tool>-poc-record.md`](../docs/contributing/specs/).
All proofs are on-demand, not CI-gated. The port contracts themselves are documented in
[`../docs/contributing/specs/`](../docs/contributing/specs/) (`execution.md`, `gate.md`, `model.md`, …).

## Bindings and guard postures

The guard posture is the load-bearing column: it states whether the runtime offers a
pre-execution surface that can genuinely **deny** a tool call (craft's enforcement floor),
and how the binding uses it. A runtime without a deny-capable surface gets an honest NO-GO,
not a pretend guard.

| Binding | Kind | Guard posture |
|---|---|---|
| [`pi`](pi/) | headless subprocess — the `craft-pi` bin drives the full 11-phase walk (the original HaaS portability proof) | `tool_call` predicate + gate-command wrapper |
| [`opencode`](opencode/) | native-interactive — commands + subagents + `opencode.json` via opencode's own subagent dispatch | enforcing `tool.execute.before` plugin |
| [`copilot`](copilot/) | native plugin — local `agents`/`hooks`/`commands` + shared craft `skills/` via two `--plugin-dir` flags | path containment + `--deny-tool` enforce; the `preToolUse` hook is an observational audit trail |
| [`codex`](codex/) | local marketplace (shared `skills/` by reference) via `multi_agent_v1` subagent dispatch | **denying** PreToolUse hook (exit 2 genuinely blocks) + execpolicy defence-in-depth |
| [`cursor`](cursor/) | headless one-turn agent (`cursor-agent -p`), live-proven incl. a full construction run | enforcing `beforeShellExecution` deny — `failClosed: true` is load-bearing |
| [`aider`](aider/) | headless edit loop — the auto-commit is the handoff (exit code is not the success signal); execution GO | **NO-GO** — no deny-capable pre-execution surface exists; declined honestly |
| [`antigravity`](antigravity/) | customization declination — **not** a runnable port binding (no headless execution port); human-driven in the GUI | shipped but pinned from docs, not live-verified |
