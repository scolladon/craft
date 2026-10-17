---
subjects:
  - engine/src/driver-state.js
  - skills/run/SKILL.md
---
# 621 — The election is written as next.md (rationale) and next.prompt (the raw prompt)

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The spike's single markdown election held the prompt in a fenced block. Stripping flags inside a fence needs a hand-rolled markdown parser.

## Options considered

1. **Two files: `next.md` + `next.prompt`, the strip runs over the whole prompt file** *(recommended)* — pros: no fence parser; the prompt file is exactly what §0 step 0a parses
2. **One markdown file, strip inside the fence** — cons: a parser to fuzz
3. **JSON `{ item, rationale, prompt }`** — cons: unreadable for the person

## Decision

**adopted-as-recommended (no user judgment)** — option 1. `next.prompt` holds only the ready-to-paste prompt as raw text; `next.md` holds the rationale and never repeats the prompt.

## Consequences

- A driver pastes `next.prompt` verbatim.
