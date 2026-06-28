# Plan — nested `pipeline.insert` fail-loud

> Source: design doc `docs/DESIGN-nested-insert-fail-loud.md` · ADRs `169, 170, 171`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle — it must earn it. No standalone test-only
  parts for FEATURE code: the unit tests fold into the implementation part whose code
  they exercise.
- This change is ONE atomic part. The validator (`validateInsert` + `insertLabel` +
  dispatch), its `node:test` cases, the example flatten, the `EXPECTED_TESTS` bump, and
  the optional bats end-to-end guard are COUPLED at the same gate boundary:
  `test/examples-lint.bats` lints every shipped example through `manifest-lint`, so the
  moment `validateInsert` exists the example's nested insert turns that suite RED; and
  `scripts/ci.sh` asserts the engine `node:test` count TWICE against the same glob, so
  the new cases drift the count unless bumped in the same commit. They MUST land
  together. No genuine independent seam exists — a split would commit a red gate.

## Decisions (bound — no open candidates)

Every load-bearing choice is pre-decided; this plan opens no new decision candidates:

- **DC1 / ADR-169** — FAIL LOUD: reject the nested shape at `manifest-lint` via a new
  `validateInsert` in `engine/src/manifest.js`. Do NOT touch `edits.js` / `resolve.js`.
- **DC2 / ADR-170** — strictness: per entry, if it owns a `phase` key push the
  nested-shape rejection (name the entry, point at the flat shape) then `continue`; else
  require a non-empty string `id`; allow other keys (forward-compat). Mirror
  `validateReorder` / `validateTechnique`: accumulate into `errors[]`, no short-circuit,
  no throw.
- **DC3 / ADR-171** — lint-only: `resolve` / `applyInserts` stay permissive.
- **DC4 / ADR-169** — example uses the canonical anchor `after: implementation`.
- **Authored choice (within mandate):** the optional bats end-to-end exit-2 guard IS
  included (design "Test strategy" delegates the call; the repo already keeps an
  end-to-end-through-the-CLI section in `test/manifest-lint.bats`, and the cost is one
  fixture + one `@test` folded into this same part — bats is not counted in
  `EXPECTED_TESTS`). It proves the fail-loud guarantee through the real bin, not just
  the pure validator.

## Part 1 — Reject nested `pipeline.insert` at manifest-lint + flatten the example

### Context

Pre-chewed — do NOT re-explore. Working dir is the worktree root
`/Users/scolladon/workspace/perso/craft-nested-insert-fail-loud`; use repo-relative
paths from there.

**What ships:** a `pipeline.insert` entry carrying a `phase:` key (the nested shape) or
lacking a non-empty string `id` becomes an invalid manifest — `validateManifest` returns
`ok:false`, `manifest-lint` exits `2`, the error names the entry and points at the flat
shape `{ after|before, id, procedure, … }`. The flat shape (canonical anchor
`after: implementation` AND the alias `after: implement`) still lints clean. The shipped
example is flattened to a working FLAT insert.

**FILE `engine/src/manifest.js` — add the validator and wire it in.**
- `validateReorder(reorder, errors)` lives at ~line 344 — it is the STYLE TEMPLATE
  (array guard with `errors.push(...)` + `return`; per-entry loop; prefixed messages; no
  throw). `validateTechnique` (~line 365) is the closest sibling for the per-entry
  object/`id` checks (`Object.hasOwn` + `typeof … !== 'string' || … === ''` → push
  `${prefix}.id must be a non-empty string`).
- ADD `function insertLabel(entry, i)` (JSDoc it like its neighbours): return
  `entry.id` when it is a string; else `after:${entry.after}` / `before:${entry.before}`
  when that anchor is a string; else the index `i`. The nested entry has no top-level
  `id` by definition, so it labels by anchor/index — that is exactly why requirement 3
  specifies the fallback.
- ADD `function validateInsert(insert, errors)` next to `validateReorder` (JSDoc it):
  - `!Array.isArray(insert)` → `errors.push('pipeline.insert must be a list of insert entries')`; `return`.
  - per entry, `!entry || typeof entry !== 'object' || Array.isArray(entry)` →
    `errors.push(\`pipeline.insert[${label}] must be an object\`)`; `continue`.
  - `Object.hasOwn(entry, 'phase')` → `errors.push(\`pipeline.insert[${label}]: nested "phase:" form is not supported — use the flat shape { after|before, id, procedure, … }\`)`; `continue` (skip the id check — the nested id lives inside `phase:`, so a "missing id" complaint would mislead; the flat-shape pointer already tells the author what to do).
  - `!Object.hasOwn(entry, 'id') || typeof entry.id !== 'string' || entry.id === ''` →
    `errors.push(\`pipeline.insert[${label}].id must be a non-empty string\`)`.
  - Accumulate ACROSS entries; the only per-entry early-`continue`s are the malformed
    and nested cases; no global short-circuit, no throw. Compute `label = insertLabel(entry, i)` once per entry.
- WIRE in `validatePipelineKeys(pipeline, errors)` (~line 464): it already has
  `if (Object.hasOwn(pipeline, 'reorder')) { validateReorder(pipeline.reorder, errors); }`
  at ~line 471. Add a sibling guard immediately after:
  `if (Object.hasOwn(pipeline, 'insert')) { validateInsert(pipeline.insert, errors); }`.
- `'insert'` is ALREADY in `PIPELINE_KEYS` (line 58: `Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']))`) — no whitelist change.

**Public-surface decision — INTERNAL.** `validateInsert` and `insertLabel` are
module-private `function` declarations, exactly like `validateReorder` /
`validateTechnique` / `validateHarness` / `validatePipelineKeys` (none are exported).
The only exports are `validateManifest` (line 790), `validatePhases` (525),
`registeredBacklogNames` (200), `RESERVED_HARNESS_KEYS` (73). The barrel
`engine/src/index.js:7` re-exports ONLY `validateManifest`. Do NOT add the new functions
to `export` or to the barrel — they are reached and tested through `validateManifest`. No
registry, exhaustiveness switch, API report, or README surface lists these internals, so
there is no downstream surface gate to pre-pay.

**FILE `engine/test/manifest.test.js` — add 5 `node:test` cases (N = 5).**
- Header: `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`,
  `import { validateManifest, registeredBacklogNames } from '../src/manifest.js'`.
  Helper `const ALWAYS_EXISTS = () => true;` is already defined (line 10). House style:
  Given/When/Then title, AAA body, `const sut = validateManifest;`. An existing
  `pipeline.insert: []` ok case sits at line 95 and the `reorder` cases at lines
  118–189 — add the new insert cases right after the existing insert case (~line 104) to
  keep the section cohesive. The 5 cases (one `test(...)` each):
  1. Given a nested insert `{ after: 'implement', phase: { id: 'license-scan' } }`, →
     `result.ok === false` and `result.errors.some(e => e.includes('flat shape'))`.
     (Arrange: `{ pipeline: { insert: [{ after: 'implement', phase: { id: 'license-scan' } }] } }`.)
  2. Given a flat insert entry missing a string `id` and no `phase:`
     (`{ after: 'implementation', procedure: 'x:y' }`), → `result.ok === false` and
     `result.errors.some(e => e.includes('.id must be a non-empty string'))`.
  3. Given a FLAT insert with canonical anchor
     `{ after: 'implementation', id: 'license-scan', procedure: 'my-toolkit:license-check', execution: 'inline' }`,
     → `assert.deepEqual(result, { ok: true, errors: [] })` (regression).
  4. Given a FLAT insert with alias anchor
     `{ after: 'implement', id: 'license-scan', procedure: 'my-toolkit:license-check' }`,
     → `assert.deepEqual(result, { ok: true, errors: [] })` (regression — the alias is
     NOT id-validated against known phases at lint).
  5. Given a manifest whose `pipeline` block is present but has no `insert` key
     (`{ pipeline: {} }`), → `assert.deepEqual(result, { ok: true, errors: [] })` (the
     `Object.hasOwn` guard means absent insert never triggers `validateInsert`).
  All five pass `{ fileExists: ALWAYS_EXISTS }` as the second arg, matching every
  sibling test.

**FILE `examples/everything-claude-toolkit/workflow.md` — flatten the insert (DC4).**
- Lines 13–19 currently read (inside the `pipeline:` block):
  ```yaml
  pipeline:                                           #                                           (PRD,    §7 #11)
    insert:
      - after: implement
        phase:
          id: license-scan
          procedure: my-toolkit:license-check        # a toolkit command becomes a real phase
          execution: inline
          gate: "npx license-checker --production"
  ```
  REPLACE the insert block with the FLAT shape, anchor `after: implementation`:
  ```yaml
  pipeline:                                           #                                           (PRD,    §7 #11)
    insert:
      - after: implementation
        id: license-scan
        procedure: my-toolkit:license-check          # a toolkit command becomes a real phase
        execution: inline
        gate: "npx license-checker --production"
  ```
  Change ONLY the insert block shape + anchor. Preserve the `# … (PRD, §7 #11)` marker
  comment on the `pipeline:` line, the `my-toolkit:license-check` inline comment, and
  every other line of the file (frontmatter keys, the prose table, etc.). `test/examples-lint.bats`
  lints this file via `manifest-lint` and asserts `output` contains `"valid."` with exit 0.

**FILE `scripts/ci.sh` — bump the count (one line, asserted twice).**
- Line 10 is `EXPECTED_TESTS=1143` (defined ONCE; asserted at the per-dir check ~line 19
  and the repo-root check ~line 31 against the SAME engine glob). Adding N = 5
  `node:test` cases makes both observed counts 1148. Change the single line to
  `EXPECTED_TESTS=1148`. Do NOT touch `EXPECTED_PI_TESTS` (202) — adapters/pi is
  unchanged.

**FILE `test/manifest-lint.bats` (+ fixture) — end-to-end exit-2 guard.**
- The suite loads `helpers/manifest-lint` and sets `FIXTURES="${BATS_TEST_DIRNAME}/fixtures/manifest"`;
  invalid cases call `run_lint "${FIXTURES}/<name>.workflow.md"` then assert
  `[ "$status" -eq 2 ]` and `[[ "$output" == *"…"* ]]` (see the unknown-top-key / skip
  cases). Fixtures are markdown files with a YAML frontmatter block (e.g.
  `test/fixtures/manifest/invalid-unknown-top-key.workflow.md`).
- ADD fixture `test/fixtures/manifest/invalid-nested-insert.workflow.md`:
  ```markdown
  ---
  pipeline:
    insert:
      - after: implement
        phase:
          id: license-scan
  ---

  # Nested pipeline.insert (unsupported)
  ```
- ADD one `@test` to `test/manifest-lint.bats` (Given/When/Then title): `run_lint` the
  new fixture; assert `[ "$status" -eq 2 ]` and `[[ "$output" == *"flat shape"* ]]`
  (and, mirroring siblings, `[[ "$output" == *"INVALID manifest"* ]]`). bats is NOT
  counted in `EXPECTED_TESTS`.

**Do NOT touch** (per ADR-171 / design "Files touched"): `engine/src/edits.js`,
`engine/src/resolve.js`, `scripts/manifest-lint.sh`, `engine/bin/manifest-lint.js`,
`pipeline/default.yml`, `engine/src/index.js`, `test/source-hygiene.bats`, any
contract/governance file.

**Hygiene (contract):** no provenance refs (ADR / phase / backlog numbers) in `manifest.js`,
the tests, the fixture, the example, or `ci.sh` — provenance lives in the design doc and
PR body only. No suppression directives. `test/source-hygiene.bats` stays untouched and
green: this change adds only `insert` / `phase` / "flat shape" vocabulary — no technique
or VCS-host-CLI tokens.

### TDD steps

RED
1. Add the 5 `node:test` cases above to `engine/test/manifest.test.js`. Run
   `cd engine && node --test 'test/**/*.test.js'`. Expected failure: cases 1 and 2 FAIL
   — with no `validateInsert` wired in, the nested entry and the id-less entry both lint
   `ok:true`, so `result.ok === false` and the `flat shape` / `.id must be a non-empty
   string` assertions do not hold. Cases 3–5 already pass (no false positives), which is
   the regression baseline.

GREEN
2. In `engine/src/manifest.js` add `insertLabel(entry, i)` and `validateInsert(insert,
   errors)` next to `validateReorder`, then add the
   `if (Object.hasOwn(pipeline, 'insert')) { validateInsert(pipeline.insert, errors); }`
   dispatch in `validatePipelineKeys`. Re-run `cd engine && node --test
   'test/**/*.test.js'` — all 5 new cases GREEN, every pre-existing case still GREEN.
3. Flatten `examples/everything-claude-toolkit/workflow.md` to the FLAT shape (anchor
   `after: implementation`) per Context, so `test/examples-lint.bats` lints it valid
   under the new rule.
4. Bump `scripts/ci.sh` line 10 to `EXPECTED_TESTS=1148`.
5. Add the bats fixture `test/fixtures/manifest/invalid-nested-insert.workflow.md` and
   the `@test` exit-2 guard to `test/manifest-lint.bats`.

REFACTOR
6. Diff-review the validator against `validateReorder` / `validateTechnique`: confirm the
   shared house style (early-return array guard, per-entry `continue`, prefixed
   messages, no throw), no nesting > 2 (use early `continue`), no magic strings beyond
   the message literals, `insertLabel` is the single source of the entry label. Confirm
   no provenance refs and no exports added. No behavioural change in this step.

### Gate

- Part gate (RED→GREEN loop): `cd engine && node --test 'test/**/*.test.js'` — covers
  `engine/test/manifest.test.js` (the 5 new cases) and every existing engine test.
- Phase-boundary verification (this single part IS the whole phase — run it before
  committing, since the example fix + count bump + bats guard are only exercised here):
  `bash scripts/ci.sh`. It runs engine tests asserting the count (1148, per-dir AND
  repo-root), adapters/pi tests (202), `bats test/` (INCLUDING `examples-lint.bats` —
  green only after the flatten — and `manifest-lint.bats` with the new guard),
  shellcheck, `pipeline-lint`, `pipeline-resolve`, `contracts-lint`. Must exit 0. Never
  commit on a red gate.

### Commit

`feat: reject nested pipeline.insert at manifest-lint and flatten the toolkit example`
