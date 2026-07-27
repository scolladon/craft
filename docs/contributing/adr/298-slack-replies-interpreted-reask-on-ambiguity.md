# 298 — Slack replies are interpreted, with re-ask on genuine ambiguity

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/decisions-remote-slack-example.md · **Supersedes/Refines:** none

## Context

A human replying from Slack — often on mobile — answers a fork in natural language. The
session must map that reply to one of the ≤3 posted options before authoring the ADR, and a
misread would put a wrong decision on permanent record.

## Options considered

1. **Exact-token only** — pros: unambiguous / cons: brittle; "the first one, but rename it"
   forces a re-ask a human would find pedantic.
2. **Interpret, re-ask on genuine ambiguity** *(recommended)* — pros: tolerates natural
   replies while honoring never-guess / cons: judgment call on what counts as ambiguous.
3. **Interpret freely, best-effort pick** — pros: never blocks / cons: risks a wrong ADR from
   a misread — guessing, by another name.

## Decision

**Adopted-as-recommended (no user judgment).** The session interprets the reply against the
posted option letters and labels; a reply it cannot confidently map is re-asked in the
channel. It never best-effort-picks.

## Consequences

The escalation context file states the mapping rule and the re-ask duty; the run record shows
the reply text alongside the option it resolved to, keeping the audit trail readable.
