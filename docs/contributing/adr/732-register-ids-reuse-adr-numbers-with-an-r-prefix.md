---
subjects:
  - docs/contributing/DOCTRINE.md
  - engine/src/doctrine.js
  - engine/src/doctrine-lint-main.js
supersedes:
  - adr: "723"
    scope: "the citation form and its target: doctrine cites R-NNN register ids, resolved against the register file instead of ADR files"
---
# 732 — Register ids reuse the ADR numbers with an `R-` prefix

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** supersedes ADR-723 (citation form)

## Context

604 distinct ADR ids are cited in 247 files outside the ADR directory, 47 of them by `DOCTRINE.md` as Evidence or Counter-cases. Once the files are gone, those ids need a target.

## Options considered

1. **Reuse the ADR numbers with an `R-` prefix; next id = highest + 1** *(recommended)* — pros: every cited number resolves; the dated tier needs no edit / cons: a scripted sweep of the live tier.
2. **Reuse the numbers and keep the `ADR-` prefix** — pros: no sweep / cons: names a line after a file kind that no longer exists.
3. **Renumber the live lines densely** — cons: breaks all 604 citations.

## Decision

Ratified by the user: option 1. Ruling `R-NNN` is ADR-NNN's line. The live tier is rewritten from `ADR-NNN` to `R-NNN` by `rulings-migrate cite`; in the dated tier an `ADR-NNN` reads as `R-NNN`.

Superseded from ADR-723: doctrine cites `ADR-NNN` and `doctrine-lint` resolves each against an ADR file.

Carried forward from ADR-723: `doctrine-lint` checks entry shape and that every cited id resolves to a live (not superseded) ruling.

## Consequences

- `R-\d{3,}` joins the provenance tokens banned from source and tests.
