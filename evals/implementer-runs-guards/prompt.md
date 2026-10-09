---
name: implementer-runs-guards
description: The craft part-implementer runs a plan's passing GUARD without breaking code, and treats a GUARD that fails on arrival as a RED.
tags: [agent]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write, Bash]
---
Use the craft part-implementer agent to implement Part 1 of the plan docs/plan/shout-flag.md in the git repository in the current working directory. Start the agent's prompt with the text of ../.git/implementation-contract.md, verbatim. git may not run inside this eval sandbox, so tell the agent to stop at the part's green gate without committing, and to write "no commit" where its final message puts the commit hash. Return the agent's final message verbatim.
