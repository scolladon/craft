# 126 — The policy action vocabulary is the VCS-port verbs verbatim

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

Operators name actions in the policy config (`never: [...]`). The vocabulary can track the existing
VCS-port verb names (`docs/adapters/vcs.md`) or use plain-English action names. Maintaining two
vocabularies for the same underlying verbs risks drift between the policy surface and the port.

## Options considered

1. **VCS-port verbs verbatim** (`isolate`/`commit`/`push`/`propose`/`integrate`/`teardown` + `external-send`/`backlog-write`) *(designer recommendation; chosen — user judgment)* — pros: one verb set shared with the VCS port, no drift. Cons: `merge` is named `integrate` and `pr-create` is `propose` — less obvious to operators.
2. **Plain-English** (`push`/`pr-create`/`merge`/`delete-branch` + `external-send`/`backlog-write`) — pros: matches operator expectation. Cons: drifts from the VCS-port verb names used elsewhere in the code.
3. **Per-phase coarse** (`workspace`/`propose`/`integrate`/`documentation`) — pros: fewest names. Cons: too coarse — `integrate` performs two distinct irreversible actions (merge, teardown) operators want to govern separately.

## Decision

The canonical, frozen `POLICY_ACTIONS` set is the **VCS-port verb names verbatim** — `isolate`,
`commit`, `push`, `propose`, `integrate`, `teardown` — plus the two non-VCS outward actions
`external-send` and `backlog-write`. To govern a merge, operators write the action `integrate`; to
govern PR creation, `propose`. Policy vocabulary and VCS-port vocabulary stay a single set.
Granularity is **per-verb**, so `integrate` (merge) and `teardown` are independently governable.

## Consequences

- No vocabulary drift; one set of verb names across the codebase.
- Operators must learn that `integrate` = merge and `propose` = pr-create — documented in `policy.md` with an alias note.
- The per-verb granularity matches the real seams (integrate does merge then teardown as distinct steps).
