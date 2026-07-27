# 044 — Planner carve-out for test-infra/docs-only parts

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none

## Context

The planner contract (`agents/planner.md`) and the plan template forbid standalone test-only parts
— a sound default for FEATURE code (tests fold into the part whose code they exercise). But a
test-infrastructure-only or docs-only change (e.g. this batch's Stryker config + ADV tests, a
test-helper relocation, a pure-docs part) is legitimately test-only with no `src/` delta and no
implementation part to fold into. In a prior run the orchestrator had to explicitly override the
heuristic; the rule has no exception clause.

## Options considered

1. **Prose carve-out** — add an exemption clause to `agents/planner.md` + `templates/plan.md`:
   test-infra-only and docs-only parts are exempt from the no-standalone-test-only rule. Zero
   schema/lint surface. *(designer's recommendation; chosen)*
2. **Structured `### Kind:` flag** — a part-kind field on the template + a `plan-lint.sh` exemption
   branch. More surface for a distinction the planner can read from the part's own Context.
3. **Leave as-is** — orchestrator overrides per run.

## Decision

`agents/planner.md` and `templates/plan.md` gain an exemption clause: a part whose entire delta is
test-infrastructure (tooling config, test helpers, fixtures, mutation/ADV/property suites) or
documentation — with NO `src/` change — is exempt from the no-standalone-test-only rule, because it
has no implementation part to fold into. Feature-code test-only parts remain forbidden.

## Consequences

The planner recognizes the exemption from the written rule, no orchestrator override needed. The
distinction stays a judgment the planner reads from the part's own `### Context` (presence/absence
of a `src/` delta) — no template schema or `plan-lint.sh` change. The structured-flag option is
deferred; if a machine-checkable kind is ever needed, ADR-044 is the reversal point.
