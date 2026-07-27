# 127 — Unlisted actions default by per-action reversibility, not a blanket verdict

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

When no policy (or an incomplete one) is configured, an unlisted action needs a default verdict —
this *is* craft's out-of-the-box autonomy. A single blanket default is either too noisy (`ask`
everywhere) or too loose (`always` everywhere). The default also interacts with ADR-128 (Supersede):
a blanket `always` default plus Supersede would auto-merge unconfigured repos with no human gate — a
behavior change from today, where craft always stops for merge confirmation.

## Options considered

1. **Per-action default from the reversibility table** *(designer recommendation; chosen — user judgment, after the cross-candidate interaction re-check)* — remote/irreversible (`push`, `propose`, `integrate`, `teardown`, `external-send`) default `ask`; local reversible (`isolate`, `commit`, `backlog-write`) default `always`. pros: encodes the actual risk axis; keeps today's behavior (merge confirms) for unconfigured repos. Cons: a small per-action table to maintain.
2. **`always` everywhere** — pros: backward-compatible for local flow. Cons: combined with ADR-128 (Supersede) it removes the human merge gate by default — not today's behavior.
3. **`ask` everywhere** — pros: safest. Cons: noisy out of the box.

## Decision

`DEFAULT_VERDICT` is **per-action**, keyed by reversibility/outwardness: `push`, `propose`,
`integrate`, `teardown`, `external-send` default to `ask`; `isolate`, `commit`, `backlog-write`
default to `always`. An unconfigured repo therefore behaves like today — merge and remote actions
ask, local actions proceed. The default table lives in `engine/src/policy.js` beside `POLICY_ACTIONS`.

## Consequences

- Default-unconfigured behavior matches today's stop-for-merge-confirmation.
- Auto-merge (ADR-128) is **opt-in** via an explicit `always: [integrate]`, never the default — this is what keeps Supersede safe-by-default.
- The per-action default table is a small frozen map to maintain alongside the action vocabulary.
