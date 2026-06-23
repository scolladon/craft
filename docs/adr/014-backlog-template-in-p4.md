# 014 — The backlog doc template ships with the P4 vocabulary rename

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md (§As-is → to-be, `templates/*`) · **Refines:** none

## Context

`templates/` ships `design.md`, `adr.md`, and `plan.md` — the producer templates the
specification phases fill — but no `backlog.md`, even though `BACKLOG.md` has a stable,
repeated structure (status table · Done · Next · Then · Deferred · Notes) and the backlog port
(SP6, P6/P11) will eventually read and tick it. P4 is the vocabulary pass; the question was
whether to fold the missing doc template(s) in now or keep P4 a pure rename.

## Options considered

1. **Add the backlog template here** — `templates/backlog.md` lands alongside the rename as a
   natural sibling to the existing producer templates; closes a visible gap. *(user choice)*
2. **Keep P4 a pure rename** — defer all template work to the backlog-port phase (P6/P11) so the
   surface gate ("engine data untouched, golden Resolution byte-identical") stays minimal.

## Decision

`templates/backlog.md` ships in P4 as a documentation part. It captures the `BACKLOG.md`
section contract so future backlog-port work (and humans) have a canonical structure to fill.
The **structure-lint scripts** named as "optional" in the decision remain deferred: a
`backlog-lint`/`design-lint` is its own TDD build (script + bats fixtures + CI wiring) and is
not required to land the template. It is recorded as a follow-up, not built here, to keep the
P4 PR scoped.

## Consequences

`templates/` becomes complete for the SoT docs that exist today. The template is **data/docs
only** — it touches no engine code, no `pipeline/default.yml`, and no gate, so the P4 surface
gate (golden Resolution byte-identical; SC1 + scenario + manifest-lint suites green) is
unaffected. A `backlog-lint` follow-up is left in `BACKLOG.md` Deferred for whoever builds the
backlog port; until then the template is advisory, not enforced.
