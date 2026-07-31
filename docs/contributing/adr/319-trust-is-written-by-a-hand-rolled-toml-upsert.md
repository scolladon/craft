# 319 — Trust is written by a hand-rolled TOML upsert, not by an unpinned RPC

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

Trust is persisted as a `config.toml` table whose key is an absolute path plus an index — it
contains `/` and `:` and must be written as a quoted TOML key. The write must be idempotent: a
second run over an already-trusted hook must produce a byte-identical file, and a changed hash must
replace the value without duplicating the table header.

Three write strategies were available. The live probe proved exactly one of them.

## Options considered

1. **Hand-rolled quoted-key upsert over the pinned one-table/one-key subset** *(recommended)* — pros: this is the write that was proven live; no new dependency; the subset is small enough to pin exhaustively with a table-driven escaping matrix / cons: hand-rolled TOML escaping, which must be tested rather than trusted.
2. **Add a TOML parser dependency** — pros: correct escaping for free / cons: the repo has exactly one runtime dependency (`js-yaml`); adding a parser to write two lines inverts that posture, and a full parser would rewrite the operator's whole `config.toml` rather than appending to it.
3. **Drive codex's own `config/batchWrite` over app-server** — pros: the vendor's own path, the one the TUI uses / cons: **UNPINNED.** `config/batchWrite` was observed only as a string in the binary and in a TUI log message. It was never exercised. Designing the write path against an unprobed RPC is precisely the failure this binding's poc record exists to prevent.

## Decision

**Decided by the session on the evidence, with the user's ratified scope.** The helper performs a
hand-rolled quoted-key upsert. Option 3 is rejected *for now* on evidence grounds, not on merit.

## Consequences

The escaping seam is tested as a matrix — a `$CODEX_HOME` containing `"`, one containing `\`, one
containing a control character — plus two invariants: the emitted key opens and closes with `"` and
carries no unescaped `"` between them. It is not round-tripped, because no unescaper exists and
writing one only to satisfy a test would be a second implementation of the same rules.
Double-application is asserted byte-identical.

If `config/batchWrite` is ever preferred, it requires its own live probe first. Recording that
precondition here is the point of this ADR: the option is not closed, it is un-evidenced.
