---
description: Run the craft feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description.
argument-hint: <backlog-id | file | description>
---

# craft:run

Input: $ARGUMENTS

Load `skills/run/SKILL.md` from this repository and follow it verbatim as the
run procedure — its preamble and numbered steps are the single source for
flag parsing, manifest and pipeline resolution, phase walking, and contract
assembly; do not restate, summarize, or re-derive them here. Thread
$ARGUMENTS through exactly as that skill's own `$ARGUMENTS` input, including
any `--profile`, `--skip`, `--config`, `--harness`, or `--policy` flags it
may carry.
