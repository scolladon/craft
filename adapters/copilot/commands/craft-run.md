---
description: Run the craft feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description.
---

# craft-run

Input: $ARGUMENTS

Resolve the pipeline manifest first: run
`node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/pipeline-resolve.js" "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/pipeline/default.yml"`
as a shell step before following the procedure below.

Follow `skills/run/SKILL.md` in this repository verbatim as the run procedure —
its preamble and numbered steps are the single source for flag parsing, manifest
and pipeline resolution, phase walking, and contract assembly; do not restate,
summarize, or re-derive them here. Thread $ARGUMENTS through exactly as that
skill's own `$ARGUMENTS` input, including any `--profile`, `--skip`, `--config`,
`--harness`, or `--policy` flags it may carry — the engine parses them identically
regardless of which binding dispatched this command.
