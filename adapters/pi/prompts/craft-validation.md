---
description: Run the repo's engineering harness over the change and triage findings; also useful standalone after a hotfix.
argument-hint: [--profile <name>] [--skip <phase,...>]
---

# craft:validation

Input: $ARGUMENTS

Load `skills/validation/SKILL.md` from this repository and follow it verbatim
as the harness and triage procedure — its preamble and DoD assertion steps
are the single source; do not restate, summarize, or re-derive them here.
Thread $ARGUMENTS through exactly as that skill's own `$ARGUMENTS` input,
including any `--profile`, `--skip`, `--config`, `--harness`, or `--policy`
flags it may carry.
