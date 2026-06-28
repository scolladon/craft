# Design — nested `pipeline.insert` fail-loud

> Brief: make the nested `pipeline.insert` form (`{ after, phase: { … } }`) fail loud instead of silently no-op'ing.
> Status: draft → self-reviewed ×3 → accepted

## Context

`pipeline.insert` lets a declination manifest add a new phase at a chosen position. The
engine consumes **one** insert shape — the FLAT shape `{ after|before, id, procedure, … }`
— whose sibling fields become the new descriptor. A NESTED shape
`{ after|before, phase: { id, … } }` parses as valid YAML, passes `manifest-lint` with
`exit 0`, and resolves with `ok: true` — yet the intended phase never lands. The shipped
example `examples/everything-claude-toolkit/workflow.md` (lines 13–19) ships exactly this
non-functional nested form, so a user who copies it inherits a silently broken insert.

This was pinned and parked by the predecessor work, not discovered here:

- `docs/design/simpler-phase-authoring.md:77` pinned the FLAT-vs-NESTED divergence and
  declared "fixing it is out of scope" for that increment.
- `docs/design/simpler-phase-authoring.md:367` listed "Fixing the `everything-claude-toolkit`
  example's nested `phase:` insert" as explicit out-of-scope follow-up.
- `BACKLOG.md:167` ("Candidate phases") frames the decision: **reject loudly** (loud-misconfiguration
  ethos) vs **normalize** — "either way the example must be corrected to a working insert."

Constraining patterns this change must follow:

- **Loud-misconfiguration ethos.** A misconfigured declination aborts at lint, never
  silently (`docs/design/simpler-phase-authoring.md:60`; the unknown-key, `validateReorder`,
  and `validateTechnique` precedents). `manifest-lint` exits `2` on any accumulated error.
- **Validator house style** (`engine/src/manifest.js`): each `validateX(value, errors)`
  checks array/object shape, accumulates into `errors[]` with **no short-circuit and no
  throw**, and `validateManifest` returns `{ ok, errors }`. `validatePipelineKeys`
  (~`manifest.js:464`) dispatches `reorder → validateReorder` (~`manifest.js:344`) but has
  **no `insert` handler**. `validateTechnique` (~`manifest.js:365`) is the closest sibling:
  require a non-empty string `id`, type-check known sub-keys, allow unknown sub-keys
  (forward-compat).
- **Governance/contracts are untouched.** This is input-validation hardening at the manifest
  boundary, not a contract or pipeline-semantics change.

## Requirements

When this ships:

1. A `pipeline.insert` entry carrying a `phase:` key is an **invalid manifest**:
   `manifest-lint` exits `2`; `validateManifest` returns `ok: false`.
2. A `pipeline.insert` entry lacking a non-empty string `id` is invalid the same way.
3. The error **names the offending entry** (its `id` if present, else its `after`/`before`
   anchor, else its index) and **points at the FLAT shape**.
4. The FLAT shape (canonical anchor `after: implementation` and alias `after: implement`)
   still lints clean and still resolves with the phase present — no regression.
5. An absent `pipeline.insert` still lints clean.
6. `examples/everything-claude-toolkit/workflow.md` ships a working FLAT insert and lints
   clean under the new rule (`test/examples-lint.bats` stays green).
7. `scripts/ci.sh` `EXPECTED_TESTS` is bumped in lockstep with the new `node:test` cases.

## Design

### Bug mechanics (confirmed)

`applyInserts` (`engine/src/edits.js:108`) does `const { after, before, ...phaseData } = ins;`
then `newDescriptor = { enabled:true, contract:[], …, ...phaseData }`.

- FLAT `{ after, id, procedure, … }` → `phaseData` carries `id`/`procedure`/… → a well-formed
  descriptor.
- NESTED `{ after, phase:{…} }` → `phaseData` is `{ phase:{…} }` → `newDescriptor` has **no
  top-level `id`** and a stray `phase:` key. It is still pushed, as a phantom descriptor.

### Pinned empirical matrix

Pinned by importing the real engine modules (`validateManifest`, `applyInserts`,
`resolveAlias`, `resolvePipeline`) against `pipeline/default.yml` — read-only probes, run
outside the worktree. **Today's behaviour:**

| `pipeline.insert` entry | `manifest-lint` (`validateManifest`) | `resolvePipeline` |
|---|---|---|
| FLAT canonical `{ after: implementation, id, procedure, execution }` | `ok:true`, exit 0 | `ok:true`; `license-scan` present after `implementation`; record `insert: license-scan (after:implementation)` |
| FLAT alias `{ after: implement, id, … }` | `ok:true` | `ok:true`; alias-resolved; `license-scan` present after `implementation`; record `insert: license-scan (after:implementation)` |
| NESTED `{ after: implement, phase:{ id, … } }` | **`ok:true` — silent pass** | **`ok:true`** — effective pipeline contains a `null`-id phantom in the `implementation+1` slot; `license-scan` **absent**; record `insert: undefined (after:implementation)` |
| absent | `ok:true` | `ok:true` |

Three load-bearing facts the matrix establishes (two correct a prior assumption):

- **`validateManifest` and `resolvePipeline` are independent paths.** `validateManifest`
  performs no alias resolution and never calls `resolvePipeline`; `resolvePipeline` never
  calls `validateManifest`. The fail-loud gate is `manifest-lint` only.
- **The alias works at runtime.** `resolve.js:28-31` (`aliasResolve`) maps `after: implement`
  → `after: implementation` *before* `applyInserts`. So the example's `after: implement` is
  already runtime-correct; the example's only defect is the nested wrapper, not the anchor.
  (This corrects the recon assumption that a working insert needs the canonical anchor.)
- **The nested shape is worse than a no-op.** It resolves `ok:true` while injecting a
  `null`-id phantom phase into the effective pipeline — a latent landmine, not merely a
  missing phase.

### Option (a) — FAIL LOUD at lint (recommended)

Single locus: `engine/src/manifest.js`. Mirror `validateReorder`/`validateTechnique`.

1. **New `validateInsert(insert, errors)`** placed next to `validateReorder` (~`manifest.js:355`):
   - `insert` not an array → push `pipeline.insert must be a list of insert entries`; return.
   - per entry not a plain object → push `pipeline.insert[<label>] must be an object`; `continue`.
   - entry has own `phase` key → push the nested-shape rejection: name the entry and point at
     the FLAT shape, e.g. `pipeline.insert[<label>]: nested "phase:" form is not supported — `
     `use the flat shape { after|before, id, procedure, … }`; then `continue` (skip the id
     check for this entry — the nested entry's `id` lives *inside* `phase:`, so a "missing id"
     complaint would be misleading; the flat-shape pointer already tells the author what to do).
   - entry lacks a non-empty string `id` → push `pipeline.insert[<label>].id must be a `
     `non-empty string`.
   - Accumulate **across entries**; the only per-entry early-`continue`s are the two above
     (malformed entry, nested entry) — there is no global short-circuit and no throw.
2. **Entry label helper** `insertLabel(entry, i)`: `id` (if a string) → else `after:<x>` /
   `before:<x>` anchor → else index `i`. The nested case has no top-level `id` by definition,
   so it labels by anchor/index — which is why requirement 3 specifies that fallback.
3. **Dispatch** in `validatePipelineKeys` (~`manifest.js:471`), beside the `reorder` branch:
   `if (Object.hasOwn(pipeline, 'insert')) validateInsert(pipeline.insert, errors);`
   (`insert` is already a member of `PIPELINE_KEYS`, `manifest.js:58`.)
4. **No change to `scripts/manifest-lint.sh` or `engine/bin/manifest-lint.js`** — the bin
   shells `validateManifest` and already exits `2` on any `errors[]`. Pinned: an invalid
   manifest prints `INVALID manifest … Fix the manifest — craft refuses to run …` and exits
   `2` today (unknown-key probe). Wiring `validateInsert` in is sufficient.
5. **Example fix** — `examples/everything-claude-toolkit/workflow.md:13-19`: flatten to the
   FLAT shape (anchor per DC4):
   ```yaml
   pipeline:
     insert:
       - after: implementation
         id: license-scan
         procedure: my-toolkit:license-check
         execution: inline
         gate: "npx license-checker --production"
   ```

**Coupling the planner must honour:** `test/examples-lint.bats` lints every
`examples/*/workflow.md` through `manifest-lint` and asserts "valid". Adding `validateInsert`
turns that suite **red** until the example is flattened — so the validator change and the
example fix MUST land in the same part (or adjacent parts within the same gate boundary).

**Files touched (a):** `engine/src/manifest.js` · `engine/test/manifest.test.js` ·
`examples/everything-claude-toolkit/workflow.md` · `scripts/ci.sh` (EXPECTED_TESTS, two
occurrences) · optionally `test/manifest-lint.bats` (end-to-end exit-2 guard, see DC3/test
strategy). **Not touched:** `engine/src/edits.js`, `engine/src/resolve.js`,
`scripts/manifest-lint.sh`, `engine/bin/manifest-lint.js`, `pipeline/default.yml`,
`test/source-hygiene.bats`, any contract/governance file.

### Option (b) — NORMALIZE the nested shape

Locus: `engine/src/edits.js` `applyInserts` (or a pre-pass in `resolve.js` `aliasResolve`).

1. In `applyInserts`, before destructuring, detect a nested entry: when `isPlainObject(ins.phase)`,
   build the effective entry as `{ after: ins.after, before: ins.before, ...ins.phase }`
   (flatten `phase` up; `after`/`before` stay siblings). Then proceed unchanged.
2. **Ambiguity rule:** if an entry carries *both* a `phase:` block and sibling phase fields,
   that is contradictory — push an error (CQS: `applyInserts` is a command; a resolve-level
   error path exists, see the reorder-error precedent at `resolve.js:290`) rather than
   silently picking one. (Pinned: the only real-world nested form carries no siblings.)
3. No lint change; both shapes resolve and the phase lands.
4. The example may stay nested or be flattened; recommend flattening anyway for one canonical
   teaching shape.

**Downsides:** blesses two shapes for one concept; `validateManifest` still never validates
insert ids, so the broader `null`-id silent path (any insert missing `id`) stays unguarded —
(b) fixes only the nested-vs-flat ambiguity, not the loud-misconfiguration gap.

**Files touched (b):** `engine/src/edits.js` · `engine/test/edits.test.js` ·
`examples/everything-claude-toolkit/workflow.md` (optional) · `scripts/ci.sh` (EXPECTED_TESTS).
**Not touched:** `engine/src/manifest.js` validator path, `manifest-lint`.

### Governance / contracts

Untouched. No phase contract, gate semantics, descriptor invariant, or pipeline DAG rule
changes. The only behaviour change is at the manifest input boundary (a) or the insert
normalizer (b).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Fail-loud vs normalize the nested insert | (a) reject at `manifest-lint` (`validateInsert`); (b) normalize/flatten in `applyInserts`; (c) hybrid: normalize at resolve + warn at lint | **(a)** | Matches the loud-misconfiguration ethos and the unknown-key/`validateReorder`/`validateTechnique` precedent; one shape per concept; smallest, most consistent surface. (c) adds a soft-warning channel craft does not have. |
| 2 | `validateInsert` strictness model | (i) require `id` only (nested fails via missing top-level `id`); (ii) check `phase:` first with a targeted "use the flat shape" message (early-`continue`), then require `id`, allow other unknown keys; (iii) require `id` + strict unknown-key whitelist for insert entries | **(ii)** | Best pedagogy — names the nested marker, points at the flat shape (requirement 3), and avoids a misleading double "missing id" complaint on the nested entry — without freezing the insert field set; `gate`/`harness`/`role`/`model` are recent additions, so a strict whitelist (iii) needs perpetual maintenance and `validateTechnique` already chose forward-compat. (i) gives a confusing "missing id" message for the nested case. |
| 3 | Enforcement scope | (a) lint-only (brief-scoped); (b) lint + `applyInserts`/resolve also reject nested/`null`-id (defense in depth) | **(a) lint-only** | Honours the brief ("catch it at lint, before resolution") and keeps scope tight; `manifest-lint` is the boundary CI runs. The pinned `null`-id-phantom-with-`ok:true` resolve path is recorded as a documented residual / follow-up rather than widened scope. |
| 4 | Example insert anchor | (a) canonical `after: implementation`; (b) keep alias `after: implement` | **(a) canonical** | Both are pinned-working and lint-clean; an exemplary example should not lean on the deprecated alias. Low stakes. |

## Test strategy

Unit (`engine/test/manifest.test.js`, `node:test`, Given/When/Then titles, AAA, `sut`):

- Given a nested insert (`{ after, phase:{ id, … } }`), `validateManifest` → `ok:false`; the
  error names the entry and mentions the flat shape.
- Given an insert entry missing a string `id`, → `ok:false`.
- Given a FLAT insert, canonical anchor → `ok:true` (regression).
- Given a FLAT insert, alias anchor `after: implement` → `ok:true` (regression; the alias is
  not validated against known ids at lint).
- Given an absent `pipeline.insert`, → `ok:true`.
- (If DC1 lands (b)) `engine/test/edits.test.js`: a nested entry flattens to a real descriptor
  with `id` present; the both-`phase`-and-siblings entry errors.

End-to-end (bats): `test/examples-lint.bats` already gates the example — it flips green once
the example is flattened. Optionally add a `test/manifest-lint.bats` case asserting a nested
insert manifest exits `2` with the flat-shape pointer in the message (mirrors the ADR-168
end-to-end-guard habit).

Count + hygiene:
- Bump `scripts/ci.sh` `EXPECTED_TESTS` by exactly the number of new `node:test` cases (both
  the per-dir and repo-root assertions), in the same change.
- `test/source-hygiene.bats` is **untouched** — the change introduces only `insert` / `phase`
  / "flat shape" vocabulary, no technique or VCS-host-CLI tokens.

## Out of scope

- **Resolve-time hardening** of the nested / `null`-id insert path. `resolvePipeline` stays
  permissive (DC3 (a)); the pinned `ok:true`-with-`null`-id-phantom is a documented residual,
  not fixed here.
- **Validating insert anchors** (`after`/`before` pointing at a non-existent / disabled phase)
  — a separate insert-applicability concern, not the nested-shape bug.
- **Insert-id collision** with an existing phase id — downstream DAG concern.
- **`provenance`/governance changes** — none; this is input-validation hardening.
