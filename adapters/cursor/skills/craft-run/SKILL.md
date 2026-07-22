---
name: craft-run
description: Run the craft feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description. Triggers - "apply the workflow", "use my default workflow", "craft this".
---

Input: $ARGUMENTS

Resolve the pipeline manifest first: run
`node "${CRAFT_ROOT}/engine/bin/pipeline-resolve.js" "${CRAFT_ROOT}/pipeline/default.yml"`
as a shell step before following the procedure below.

Follow `skills/run/SKILL.md` in this repository verbatim as the run procedure — its
preamble and numbered steps are the single source for flag parsing, manifest and
pipeline resolution, phase walking, and contract assembly; do not restate, summarize,
or re-derive them here. Thread $ARGUMENTS through exactly as that skill's own
`$ARGUMENTS` input.

Delegation: spawn each phase worker as its craft role subagent (the `craft-<role>`
definitions installed under `.cursor/agents/`) rather than working sequentially, and
pass each spawn its resolved model with `--model`. The per-role tier rides that launch
arg — the subagent frontmatter carries no model field. Batch spawns conservatively; do
not assume the spawn tool queues gracefully past its concurrent cap.
