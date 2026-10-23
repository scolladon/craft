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

1. **Re-read an unpaired `))` body as `$( … )`; fail closed on a line continuation inside the opener
   or closer** — cons: the pairing count reads raw text, so a `)` in a comment or in a `"…"` that
   spans a nested `$( )` makes it re-read a body bash keeps as arithmetic; in the re-read a `#`
   hides a `$(git push)` that bash runs (bash 5.3, found at review)
2. **Fail closed on an unpaired `))` body and on a line continuation inside the opener or closer**
   *(recommended)* — pros: neither reading is trusted where the scanner and bash can disagree;
   ADR-594 applies
3. **Model line continuations and bash's pairing everywhere** — cons: bash removes continuations
   before tokenising, outside single quotes and some heredoc bodies, and pairs parens with its own
   comment and quote rules; a copy would drift

## Decision

Adopted-as-recommended (no user judgment; option 1 was replaced at review, and the user approved the
fix diff): option 2, aligned with ADR-689 and ADR-594. A `$` followed by a line continuation fails
closed too, which also covers `"$\⏎(git push)"`. ADR-689's re-read stays for a single `)` closer.

## Consequences

A `$(( … ))` whose body does not pair its parens outside `\x`, `'…'` and `"…"` is denied, for
example ``$(( `printf 1 #(` ))``. The re-read verdict for a single `)` closer is kept per source
index, so nested re-reads stay linear in depth.
