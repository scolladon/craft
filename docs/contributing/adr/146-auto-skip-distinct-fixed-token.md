# 146 — `auto-skip:` is a distinct, walk-appended fixed token

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P26-auto-skip-unnecessary-phases.md · **Supersedes/Refines:** none

## Context

An auto-skip is a third reason a phase does not run, alongside the operator waiver
(`WAIVER:`, ADR-005) and the runtime no-op (`NO-OP(<phase>):`, ADR-103). The brief wants it
surfaced as its **own** signal — "didn't-need-to-run" is auditably different from "operator
chose to skip" and from "ran, found nothing". Repo memory `prefer-fixed-greppable-tokens`
favours one fixed token over per-context phrasing.

## Options considered

1. **New fixed token `auto-skip: <phase> — evaluated unnecessary (<signal>)`** *(designer + user choice)* — walk-appended to the run record. Pros: one grep (`grep -F 'auto-skip:'`) finds every auto-skip across run records and PR bodies; distinct from `WAIVER:`/`NO-OP(<phase>):`; preserves the three-way distinction the brief asks for.
2. **Reuse `NO-OP(<phase>):` with an `(evaluated)` qualifier** — Cons: collapses "didn't run" and "ran, found nothing" under one grep, losing the distinction.
3. **Emit a static `Resolution.record[]` line from the resolver** — Cons: the *decision to skip* is dynamic (only the walk sees the diff); eligibility is static and rides `effective[].autoSkipEligible`, but the skip line cannot be static.

## Decision

*Adopted-as-recommended (user-confirmed).* The walk appends the fixed token
`auto-skip: <phase> — evaluated unnecessary (<signal>)` to the run record when an eligible
phase's necessity probe proves it empty (e.g.
`auto-skip: review — evaluated unnecessary (no source diff in scope)`). It is distinct from
`WAIVER:` and `NO-OP(<phase>):`, walk-appended (not a `Resolution.record[]` line), and flows
into the PR body via the existing run-record → PR-body carry (no new plumbing). `WAIVER:` and
`NO-OP(<phase>):` semantics are untouched.

## Consequences

- Three greppable non-run reasons coexist, each with a single fixed prefix:
  `WAIVER:` (operator), `NO-OP(<phase>):` (ran-empty), `auto-skip:` (didn't-run).
- The token is orchestrator-owned prose (the walk), matching where `NO-OP`/`POLICY` are emitted.
- The `<signal>` parenthetical records *why* the phase was judged empty, for the audit trail.
