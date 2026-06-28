# 179 — Structure linters guard the live docs, not just the templates

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/activate-dod-and-live-doc-lints.md · **Supersedes/Refines:** refines the H-section linters of the clear-backlog-candidates run

## Context

`backlog-lint.sh` and `design-lint.sh` exist and run in `ci.sh`, but only against
`templates/backlog.md` and `templates/design.md` — the live `BACKLOG.md` and the live
design docs are unguarded. The live `BACKLOG.md` uses a richer structure (`## Status`,
`## Candidate phases`, `## Parked`, `### Condition-gated`, `### Closed`) that the
template-shaped `backlog-lint` rejects; the live design docs under `docs/design/*.md`
already conform to `templates/design.md` (one pre-existing doc diverged and is repaired).

## Options considered

1. **Generalize the linter to the live structure + point `ci.sh` at the live docs.**
   Pros: least churn; enforces what actually exists; pinned to pass today. Cons: the
   linter's required-set tracks craft's own roadmap shape. **(recommended)**
2. **Migrate `BACKLOG.md` to the template shape, keep the linter strict.** Pros: linter
   unchanged. Cons: rewrites the live roadmap for no extra enforcement.

## Decision

The structure linters enforce the live docs. `backlog-lint`'s required-set generalizes to
the live structure and its heading match widens to H2 **and** H3; `ci.sh` lints `BACKLOG.md`
and globs `docs/design/*.md`. `design-lint`'s required-set is unchanged — the live design
docs already conform. A live design doc missing a required section is repaired to conform,
never exempted.

## Consequences

Every craft run's design doc is now structurally enforced (including this run's own doc);
the live roadmap is enforced; one pre-existing design doc that used a `## Decision log`
heading and omitted `## Decision candidates` is repaired. The disposition of the shipped
backlog template is decided separately in ADR-181.
