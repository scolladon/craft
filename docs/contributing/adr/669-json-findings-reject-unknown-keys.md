---
subjects:
  - engine/src/findings.js
supersedes: []
---
# 669 — JSON findings reject every unknown key

- **Status:** accepted
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/normalize-findings-silent-field-loss.md · **Supersedes/Refines:** ADR-667

## Context

`mapJsonItem` destructures the canonical fields and silently ignores every other key, so a finding
that carries `suggested fix` beside the canonical fields exits 0 and loses its fix. The same silent
drop applies to any misspelt or invented key (`Fix`, `suggestion`).

## Options considered

1. **Reject every key outside `{file, line, severity, finding, fix, status}`** *(recommended)* —
   pros: closes the whole class, the allow-list is the contract shape (ADR-667) / cons: a reviewer
   that adds a harmless key now exits 2; a validation technique emitting extras moves to the
   NON-CANONICAL triager branch
2. **Reject only the legacy aliases `file:line` and `suggested fix`** — pros: remediation hint,
   no other input changes / cons: every other unknown key stays a silent drop

## Decision

The user chose option 1. The throw is `Finding at index N has an unknown field: "<key>"`, checked
after the missing-required-field check. `status` stays unvalidated.

## Consequences

Every JSON finding key is either honoured or refused; nothing is dropped silently. The per-line
shape is unaffected, because it never carries extra keys.
