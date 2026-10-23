---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 692 — bash decides `$((` on a paired body and an unsplit closer

- **Status:** accepted
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** refines ADR-689

## Context

ADR-689 re-reads a `$((` whose level-0 `)` is not followed by `)` as `$( … )`. Review probes under
bash 3.2.57 and 5.3.20 showed two more inputs to that choice. bash keeps `$((` as arithmetic only
when the body pairs every `(` and `)` outside `\x`, `'…'` and `"…"`, counting the parens inside
backtick bodies: ``echo $(( `printf g%st i #)` push ))`` runs `git push`. And bash drops a line
continuation before it decides, so `$\⏎((`, `$(\⏎(` and `)\⏎)` all split the opener or the closer
where the tokeniser sees no split; with a `#` in the body each one hides a substitution.

## Options considered

1. **Apply the pairing rule; fail closed on a line continuation inside the opener or closer**
   *(recommended)* — pros: the pairing rule is bash's own; the continuation spellings are rare and
   unmodelled, so ADR-594 applies
2. **Model line continuations everywhere** — cons: bash removes them before tokenising, outside single
   quotes and some heredoc bodies; a pre-pass would have to copy those exceptions

## Decision

Adopted-as-recommended (no user judgment): option 1, aligned with ADR-689 and ADR-594. A `$`
followed by a line continuation fails closed too, which also covers `"$\⏎(git push)"`.

## Consequences

A body bash 3.2 re-reads but 5.3 keeps as arithmetic (a `#` comment holding a `)`) is re-read as a
substitution: the guard sees the 3.2 reading, which holds every command the 5.3 reading runs. The
re-read verdict is kept per source index, so nested re-reads stay linear in depth.
