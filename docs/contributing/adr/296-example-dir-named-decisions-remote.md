# 296 — The example directory is named `decisions-remote`

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/decisions-remote-slack-example.md · **Supersedes/Refines:** refines 293 (point-descriptive example dir names)

## Context

The sample demonstrates remote-routing of the decisions-phase fork conversation, with Slack
as the worked transport. The directory name frames whether the catalog advertises a pattern
(remote escalation) or a product integration (Slack).

## Options considered

1. **`decisions-remote`** *(recommended, per the resolved brief)* — pros: names the pattern;
   survives a future Teams/other-transport variant / cons: generic name over Slack-specific
   content.
2. **`decisions-slack`** — pros: says exactly what is inside / cons: brands the injection
   point by one vendor; a second transport would fork the catalog.
3. **`decisions-remote-slack`** — pros: both / cons: verbose; catalog names elsewhere stay
   point-descriptive, not compound.

## Decision

**Adopted-as-recommended (no user judgment).** The directory is `examples/decisions-remote/`.
The prose names Slack explicitly as the worked instance and marks Teams out of scope, so the
generic name never over-promises a transport-agnostic surface that does not exist.

## Consequences

A future Teams or generic-webhook variant lands as prose or a sibling sample without renaming
this one; the README row wording must carry "Slack" so the catalog stays searchable by vendor.
