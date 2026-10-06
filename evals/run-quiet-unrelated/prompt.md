---
name: run-quiet-unrelated
description: A plain git question gets a direct answer and never invokes a craft skill.
tags: [trigger]
max_turns: 3
timeout_seconds: 90
allowed_tools: [Read, Glob, Grep, Skill]
---
In two sentences, how does `git merge --squash` differ from `git rebase`?
