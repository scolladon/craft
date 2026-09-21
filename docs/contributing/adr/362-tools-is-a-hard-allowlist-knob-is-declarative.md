---
subjects:
  - agents
  - engine/src/manifest-vocabulary.js
  - engine/src/manifest.js
---
# 362 — tools: is a hard allowlist; the phases knob is declarative

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** none

## Context

No agent declares a `tools:` key, so all nine inherit the full tool surface including every
MCP server — a measured 53k of context on every agent's first turn, re-read on all
68,144 turns of the corpus. A restricted list demonstrably cuts this (Explore, which
declares one, starts at 18k). The brief asked for a `phases.<id>.tools` knob so a repo can
widen the list. Design pinned the blocking fact: the spawn surface is
`(subagent_type, prompt, description, model, isolation)` — there is **no** `tools`
parameter, so no manifest knob can mechanically widen a list at spawn time.

## Options considered

1. **Hard allowlist in the agent def; knob is lint-validated and contract-surfaced but never
   applied at spawn** (recommended) — pros: keeps the floor reduction, which is real and
   static; keeps widening declarable and lintable / cons: the knob does not bind mechanically.
2. **Agent def carries a default; init emits a repo-local agent override file** — pros: real
   enforcement / cons: a new emit target and a second home for agent definitions — a large
   change hiding inside a small knob.
3. **No knob; a repo that needs more forks the agent def** — pros: honest and minimal / cons:
   loses the declaration.

## Decision

`tools:` in the agent definition is the real lever and is a **hard allowlist**. No agent
list declares an MCP tool (`mcp__*`) or a sub-agent-spawning tool — those two exclusions are
the spawn-floor lever; the rest of each list is role fit. The reviewer's list contains no
mutating tool, turning the read-only prose rule into a mechanical one.

`phases.<id>.tools` is accepted and validated by manifest-lint and surfaced in the injected
contract block. It is **declarative only** — it is never applied at spawn, because the
binding offers nowhere to apply it.

## Consequences

- The spawn floor drops for every role, on every turn, with no behavioural change asked of
  any agent.
- The reviewer's read-only guarantee stops depending on the reviewer reading its contract.
- The knob's declarative status must be stated where it is documented, or an operator will
  reasonably expect it to bind.
- If the spawn surface ever gains a `tools` parameter, the knob is already declared and
  validated; only the application site is missing.
