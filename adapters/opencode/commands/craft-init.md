---
description: Scaffold a craft customization by interview and write a named manifest.
---

# craft:init

Input: $ARGUMENTS

!`bash "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/detect-ecosystem.sh" .`

Follow `skills/init/SKILL.md` in this repository verbatim as the manifest
generator procedure — its preamble, interview, and lint-then-land steps are
the single source; do not restate, summarize, or re-derive them here. Thread
$ARGUMENTS through exactly as that skill's own `$ARGUMENTS` input.
