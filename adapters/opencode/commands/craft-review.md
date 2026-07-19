---
description: Parallel multi-dimension review with per-dimension convergence over the current change; also useful standalone on any branch.
---

# craft:review

Input: $ARGUMENTS

!`bash "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/manifest-lint.sh" .claude/workflow.md`

Follow `skills/review/SKILL.md` in this repository verbatim as the review
procedure — its preamble and per-dimension convergence steps are the single
source; do not restate, summarize, or re-derive them here. Thread $ARGUMENTS
through exactly as that skill's own `$ARGUMENTS` input, including any
`--profile`, `--skip`, `--config`, `--harness`, or `--policy` flags it may
carry — the engine parses them identically regardless of which binding
dispatched this command.
