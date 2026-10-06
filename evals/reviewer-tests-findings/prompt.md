---
name: reviewer-tests-findings
description: The craft reviewer on the tests dimension returns structured findings that name the untested shout path.
tags: [agent]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash]
---
Use the craft reviewer agent on the tests dimension over HEAD~1..HEAD of this repo; return its final findings verbatim.
