# Doctrine

Principles distilled from user-ratified decisions. The decisions phase cites an entry as
`DOCTRINE(D-<n>)` when it adopts a recommendation the entry covers.

## D-1 — A flag behaves the same on a terminal and on a pipe
- **Trigger:** A flag's effect could depend on whether stdout is a terminal.
- **Rule:** It does the same on both; pipe-specific output is a separate flag.
- **Evidence:** ADR-002
- **Counter-cases:** none
