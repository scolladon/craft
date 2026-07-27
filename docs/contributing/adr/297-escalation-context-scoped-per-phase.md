# 297 — The Slack escalation context is scoped per-phase, not global

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/decisions-remote-slack-example.md · **Supersedes/Refines:** none

## Context

A context file can inject globally (`context:`, every agent and inline run) or per-phase
(`phases.decisions.context`, that phase only). The Slack escalation protocol instructs the
session how to conduct the decisions-phase fork conversation — and nothing else.

## Options considered

1. **Per-phase `phases.decisions.context`** *(recommended, per the resolved brief)* — pros: the
   protocol reaches exactly the phase it governs; every other phase's contract slot stays
   clean / cons: a second sample is needed to show the global form (one already exists).
2. **Global `context:`** — pros: one key / cons: leaks `external-send` instructions into
   design/planning/review contract slots where they are noise and could mis-fire.

## Decision

**Adopted-as-recommended (no user judgment).** The manifest declares
`phases.decisions.context: .claude/workflow/slack-escalation.md`. The global form remains
demonstrated by the existing karpathy-as-context sample.

## Consequences

The escalation instructions are invisible outside the decisions phase; the sample doubles as
the catalog's worked instance of the *per-phase* context form.
