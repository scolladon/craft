# 299 — The sample updates both catalog indexes

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/decisions-remote-slack-example.md · **Supersedes/Refines:** refines 292 (readme-only example coverage guard)

## Context

The mechanical guard only enforces an `examples/README.md` row. The customizing guide keeps
its own examples index, and the two indexes have drifted before — reconciling them was a
dedicated piece of work.

## Options considered

1. **README row only** — pros: the guard-enforced minimum / cons: reopens the exact index
   drift previously closed.
2. **README row + customizing.md index row** *(recommended)* — pros: the two catalogs stay
   reconciled; matches what the policy/intention/memory samples did / cons: one more touched
   file.

## Decision

**Adopted-as-recommended (no user judgment).** The change adds the guard-required
`examples/README.md` row and a matching row in the `docs/guides/customizing.md` examples
index.

## Consequences

Catalog readers find the sample from either entry point; the documentation phase treats the
customizing.md row as in-scope, not optional.
