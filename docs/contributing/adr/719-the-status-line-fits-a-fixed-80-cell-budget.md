---
subjects:
  - hooks/progress/bind.ts
supersedes: []
---
# 719 — The status line fits a fixed 80-cell budget

- **Status:** accepted
- **Date:** 2026-10-30
- **Design:** docs/contributing/design/progress-status-line-bar.md · **Supersedes/Refines:** none

## Context

The bar line degrades as width shrinks: drop `next`, then the bar. The mod API exposes
`viewport.columns` to an `AbovePrompt` render hook, and allows a status push from there.

## Options considered

1. **Live width** from `viewport.columns`, re-pushed on change, 80 while unknown *(recommended
   by the design)* — cons: width state, a render-hook push path, and a no-viewport rule
2. **The same width, applied at the next tool call or turn** — cons: a stale line after a resize
3. **A fixed 80-cell budget, no width tracking**

## Decision

Option 3, ratified by the user against the recommendation. The line is fitted to 80 cells and
no terminal width is read or stored. The design's no-viewport question has no subject under
this choice and is dropped.

## Consequences

No width state and no render-hook push. A terminal narrower than 80 may clip or wrap the line;
a wider one does not show more than the 80-cell form.
