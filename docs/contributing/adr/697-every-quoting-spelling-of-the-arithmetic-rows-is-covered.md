---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 697 — Every quoting spelling of the arithmetic rows is covered

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/guard-arith-cleanup.md · **Supersedes/Refines:** scopes ADR-694 and ADR-695

## Context

The run's brief named eight rows in their `'…'` spelling. The same rows run git in other spellings:
`$'…'` holding a literal `$` or a numeric escape decoding to `$` or a backtick (`\44`, `\x24`,
`\x60`, `\140`; `\u24` and `\U…24` on 5.3 only), `"a[\$(…)]"` and a bare `a[\$\(…\)]` under `let`
or `[[` (design tables H, J and L, rows 61–73, 82–89, 104, 105, 107, 108).

## Options considered

1. **Cover every quoting form** *(recommended)* — pros: one rule per behaviour (lesson 006); same
   handlers; cost: one more call site (`readAnsiC`), one more flag site (`onBackslash`) and a pure
   escape decoder
2. **Cover only the `'…'` spelling** — cons: rows 69–72, 82, 83, 85, 88, 104 and 105 keep running git

## Decision

Ratified by the user: option 1, though it reaches past the brief's eight rows. The same rows in
another spelling are the same behaviour and the same handlers.

## Consequences

The decoder reads `\xHH`, `\NNN` (low byte only, as bash keeps it), `\uHHHH` and `\UHHHHHHHH`; an escape
counts when it decodes to `$`, a backtick, `(`, `{` or `[`. `\n`, `\t`, `\e` and `\033` never match,
so `IFS=$'\n'` and `$'\033[1m'` keep their verdict.
