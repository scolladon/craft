---
name: planning-plan-lints
description: The planning phase turns an accepted design into a parted TDD plan that passes craft's plan lint.
tags: [agent]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Bash]
---
Run the craft planning phase standalone in the git repository in the current working directory, for the accepted design docs/design/shout-flag.md (decision in docs/adr/001-shout-flag-uppercases.md); write the plan to docs/plan/shout-flag.md.
