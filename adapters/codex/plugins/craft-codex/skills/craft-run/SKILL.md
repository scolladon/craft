---
name: craft-run
description: Run the craft feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description. Triggers - "apply the workflow", "use my default workflow", "craft this".
---

Input: $ARGUMENTS

Resolve the pipeline manifest first: run
`node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/pipeline-resolve.js" "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/pipeline/default.yml"`
as a shell step before following the procedure below.

Follow `skills/run/SKILL.md` in this repository verbatim as the run procedure — its
preamble and numbered steps are the single source for flag parsing, manifest and
pipeline resolution, phase walking, and contract assembly; do not restate, summarize,
or re-derive them here. Thread $ARGUMENTS through exactly as that skill's own
`$ARGUMENTS` input.

Delegation: explicitly ask for `multi_agent_v1` subagent delegation — spawn phase
workers with `spawn_agent` rather than working sequentially. The usable concurrent
fan-out width is 3 (the pinned cap is 4 slots "including you"). Any phase that would
otherwise fan out wider than 3 concurrent workers must batch its spawns to 3 at a
time; do not assume `spawn_agent` queues gracefully past the cap.
