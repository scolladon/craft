---
subjects:
  - engine/src/adr-lint-main.js
  - engine/src/manifest.js
  - engine/src/manifest-vocabulary.js
  - docs/contributing/specs/run-record.md
  - docs/guides/customizing.md
  - scripts/ci.sh
supersedes:
  - adr: "356"
    scope: "the citation-sweep exempt set: there is no sweep"
  - adr: "357"
    scope: "the DECISION-CITE-WAIVE token: retired with the sweep"
  - adr: "480"
    scope: "the anchored waiver rule's coverage of DECISION-CITE-WAIVE: the token is retired"
  - adr: "486"
    scope: "the adr.frozen guard: the adr manifest key is removed"
---
# 735 — The whole-tree citation sweep, its waiver and `adr.frozen` retire

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** supersedes ADR-356, ADR-357, ADR-480, ADR-486

## Context

`adr-lint` C3 failed the gate on any live-tier citation of a superseded ADR, because a superseded ADR file read as live. A superseded register line names its successor on the same line, so a citation of it lands on the pointer.

## Options considered

1. **Retire C3, `DECISION-CITE-WAIVE` and `adr.frozen`; `doctrine-lint` keeps the one machine-read citation set honest** *(recommended)* — pros: deletes the sweep, exempt-set and waiver code / cons: a prose citation of a superseded id is no longer flagged.
2. **Port C3 into `rulings-lint` with the waiver and a renamed knob** — cons: keeps half of `adr-lint`'s 728 lines for a case the pointer already covers.
3. **Port C3 without waiver or knob** — cons: a whole-tree blocking gate with no per-line escape.

## Decision

Ratified by the user, with the breaking change for consumers (ADR-740): option 1. The whole-tree citation sweep, the `DECISION-CITE-WAIVE` token and the `adr` manifest key (`adr.frozen`) are removed.

Superseded from ADR-356: the derived exempt set.

Carried forward from ADR-356: nothing — there is no sweep left to exempt anything from.

Superseded from ADR-357: the token.

Carried forward from ADR-357: nothing — the token has no remaining check.

Superseded from ADR-480: coverage of `DECISION-CITE-WAIVE`.

Carried forward from ADR-480: the anchored waiver rule for every other waiver token.

Superseded from ADR-486: the `adr.frozen` guard.

Carried forward from ADR-486: nothing — the key it guarded is removed.

## Consequences

- The CHANGELOG names the removed key and token.
