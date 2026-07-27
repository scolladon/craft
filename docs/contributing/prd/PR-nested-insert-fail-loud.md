# feat: reject nested `pipeline.insert` form at manifest-lint (fail loud)

## Problem

`applyInserts` consumed only the FLAT insert shape `{ after|before, id, procedure, … }`. The
nested shape `{ after, phase: { id, … } }` parsed and resolved `ok: true`, but spread into a
descriptor with no top-level `id` — a `null`-id phantom phase was injected and the intended
phase silently vanished, with **no error at lint or resolve**. The shipped
`examples/everything-claude-toolkit/workflow.md` used the nested form, demonstrating a
silently-broken insert a user would copy.

## Decision (ADRs 169–171)

- **169** — FAIL LOUD: reject the nested shape at `manifest-lint` via a new `validateInsert`,
  matching the loud-misconfiguration ethos and the existing unknown-key / `validateReorder` /
  `validateTechnique` precedent (option a, over normalize/hybrid).
- **170** — strictness model (ii): per entry, a `phase:` key triggers a targeted "use the flat
  shape" message (then `continue`), else require a non-empty string `id`; other keys allowed
  (forward-compat). Mirrors the sibling validators (accumulate, no throw).
- **171** — lint-only scope: `resolvePipeline`/`applyInserts` stay permissive; the `null`-id
  resolve path is a documented residual (follow-up filed in BACKLOG).

## What changed

- `engine/src/manifest.js` — new module-private `validateInsert(insert, errors)` +
  `insertLabel(entry, i)` (label fallback: id → `after:`/`before:` anchor → index), dispatched
  from `validatePipelineKeys`.
- `examples/everything-claude-toolkit/workflow.md` — insert flattened to
  `{ after: implementation, id: license-scan, … }` (canonical anchor).
- `skills/init/SKILL.md`, `docs/GUIDE-customizing.md` — de-staled the "silently no-ops"
  parenthetical and documented the nested-form rejection.
- `BACKLOG.md` — shipped bullet removed; resolve-time-hardening follow-up filed.

## Test plan

- 13 new `node:test` cases in `engine/test/manifest.test.js`: nested→`ok:false` (+flat-shape
  message + entry label by id/anchor/index), missing/empty/non-string `id`, non-array insert,
  non-object & primitive entries, flat canonical + alias anchors → `ok:true`, absent insert →
  `ok:true`.
- `test/manifest-lint.bats` — end-to-end exit-2 guard (`invalid-nested-insert.workflow.md`)
  asserting the named entry + flat-shape pointer.
- `init-emit.test.js` round-trip fixture moved nested→flat (the nested form is now invalid).
- `scripts/ci.sh` `EXPECTED_TESTS` 1143 → 1156. Full `ci.sh` green.
- Mutation (stryker, per-hunk on the new code): **98.61%** — 71 killed, 1 survivor proven
  EQUIVALENT (`insertLabel` object-guard `typeof` clause: entering the block for a primitive
  reads `undefined` id/after/before and falls through to the same index return).

Governance / contracts untouched — input-validation hardening only.
