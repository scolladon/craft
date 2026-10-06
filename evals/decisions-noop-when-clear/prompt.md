---
name: decisions-noop-when-clear
description: The decisions phase adopts a clear, ADR-aligned recommendation without asking the user, and still records it as an ADR.
tags: [phase]
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---
Run the craft decisions phase standalone on docs/design/shout-flag.md.
