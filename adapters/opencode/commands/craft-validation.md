---
description: Run the repo's engineering harness over the change and triage findings; also useful standalone after a hotfix.
---

# craft:validation

Input: $ARGUMENTS

!`bash "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/manifest-lint.sh" .claude/workflow.md`

Follow `skills/validation/SKILL.md` in this repository verbatim as the harness
and triage procedure — its preamble and DoD assertion steps are the single
source; do not restate, summarize, or re-derive them here. Thread $ARGUMENTS
through exactly as that skill's own `$ARGUMENTS` input, including any
`--profile`, `--skip`, `--config`, `--harness`, or `--policy` flags it may
carry — the engine parses them identically regardless of which binding
dispatched this command.
