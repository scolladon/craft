# 132 — Full rename of the `slice-implementer` agent to `part-implementer`

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P24-rename-slice-vocabulary.md · **Supersedes/Refines:** none

## Context

The per-unit TDD worker agent is named `slice-implementer`. That identity is not only
documentation: it is engine configuration. `pipeline/default.yml` carries `role:
craft:slice-implementer`, and `engine/src/manifest.js` lists `slice-implementer` in the
`MODELS_KEYS` set that `validateModels` checks user `models:` keys against. The backlog's aside
that this rename needs "no engine-descriptor change" is therefore factually wrong — the question
is how completely to rename the identity, not whether engine config is touched.

## Options considered

1. **Full rename** *(designer recommendation)* — pros: one canonical token; the P8.5 lockstep pattern (config + golden descriptor + tests flip in the same commit, green by construction); no alias to maintain. Cons: edits engine config and the golden `Resolution`.
2. **Identifier-stable** — pros: golden descriptor byte-identical; honors the backlog's "no engine-descriptor change". Cons: the jargon survives in the agent roster — a half-rename.
3. **Full rename + back-compat alias** — pros: tolerates stale references. Cons: a new alias mechanism (`alias-map.js` is phase-id-only today) for a one-off internal id with no external consumers.

## Decision

Rename `slice-implementer` → `part-implementer` fully and in lockstep, with **no alias**. The
user ratified the recommendation. The agent file, `MODELS_KEYS`, `pipeline/default.yml` `role:`,
every pinning test, and all docs/examples flip in the same commit so CI is green by construction;
the golden descriptor diff is confined to the `role:` line.

## Consequences

- `agents/slice-implementer.md` → `agents/part-implementer.md` (file + `name:`); engine config and
  the golden `Resolution` change in exactly the renamed token.
- No alias is added; `alias-map.js` stays phase-id-only. A manifest referencing the old agent key
  is invalid after this change (no external consumer depends on it).
- `EXPECTED_TESTS=941` / `EXPECTED_PI_TESTS=202` must hold — strings change inside existing tests,
  none are added or removed.
