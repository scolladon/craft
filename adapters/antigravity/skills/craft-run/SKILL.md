---
name: craft-run
description: Run the craft feature-delivery workflow inside Antigravity on a backlog id, a spec/PRD file, or a free-text feature description.
---

# craft — Antigravity entrypoint

The full orchestrator procedure lives in `${CRAFT_ROOT}/skills/run/SKILL.md`. Read it
and follow it as the orchestrator — this file only records the Antigravity-specific
binding notes; it does not restate the procedure.

Binding notes (measured, not assumed — see `docs/contributing/specs/antigravity-poc-record.md`):

- **Single-agent topology.** The Antigravity (Gemini) agent IS both orchestrator and
  worker. The role agents in `agents/craft-*.md` are followed as self-directed guidance
  per phase, NOT spawned as parallel subagents — Antigravity exposes no pinned headless
  spawn verb, so the multi-agent fan-out other bindings use is degraded to one agent here.
- **Run the engine via `run_command`.** Each engine step is
  `node ${CRAFT_ROOT}/engine/bin/<bin>.js …` executed through the agent's `run_command`
  tool; keep `CRAFT_ROOT` set to the craft checkout.
- **The guard is on.** `plugins/craft/hooks.json` registers a PreToolUse hook that denies
  `git diff`/`git show` without `--no-ext-diff`; keep such commands compliant.
- **No PR automation is bound.** Push/PR steps run as ordinary `run_command` git/gh calls
  under your own review, not through a bound delivery port.
