# Plan — Interactive customization generator (the manifest "front door")

> Source: design doc `docs/DESIGN-P25-interactive-manifest-generator.md` · ADRs `136, 137, 138, 139, 140, 141, 142`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

> **Provenance lives in this doc only.** No `P25`/ADR/backlog string may appear in any
> emitted source, test, fixture, or — for the emitter — in any manifest it produces (R9).
>
> **Phase gate (`bash scripts/ci.sh`) is count-pinned.** `scripts/ci.sh:10` holds
> `EXPECTED_TESTS=942` and asserts the `node --test` total EQUALS it. Every part that adds
> engine tests MUST bump that literal by exactly the number of `test(...)` cases it adds,
> **in the same commit**. The running tally below is the contract:
>
> | Part | engine tests added | `EXPECTED_TESTS` after |
> |---|---|---|
> | 1 (bash helper) | 0 | 942 (unchanged) |
> | 2 (emitter) | 34 (22 unit + 6 property + 6 bin) | 976 |
> | 3 (`--config`) | 14 (8 helper + 4 overlay + 2 bin) | 990 |
> | 4 (skill, docs) | 0 | 990 (unchanged) |
>
> The per-part `### TDD steps` end with the explicit `EXPECTED_TESTS` edit where the count
> changes. If a part lands a different test count than planned, set `EXPECTED_TESTS` to the
> actual `# tests` line `node --test` prints — the literal must match reality, not this table.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

**Decomposition & order (justified).** Four parts, sequential, sharing one worktree, each
landing atomically green:

1. **Detection helper (bash)** — the probe substrate; the most independent unit. Bats + shellcheck only (no engine `node --test`), a clean standalone leaf.
2. **Pure emitter + bin** — the TDD core (D4). Folds its unit + round-trip property + bin-level lint-round-trip + direct-overwrite/rollback tests (test-strategy 1, 2, 4, 5). Depends on nothing from part 1; ordered second because it is the feature's heart.
3. **`--config <name>` consumption** — the orchestrator-only end-to-end wiring (D8). A pure name→path containment helper + bin + `skills/run/SKILL.md` prose; folds test-strategy 6 (overlay-over-named-fixture + name-validation). Independent of parts 1–2 but ordered after the emitter so the named file it resolves has a producer.
4. **`craft:init` skill** — docs/prose, no `src/` delta (ADR-142). Standalone per the sizing exception. **Last**, because it orchestrates the now-built helper (part 1), emitter+bin (part 2), and references the `--config` consumption path (part 3) the user will run next.

**Public-surface decision (settled up-front, per new exported symbol).**
- `scripts/detect-ecosystem.sh` (part 1): a sourced bash helper. Surface gates = `shellcheck scripts/*.sh` + `bats test/` (both already in `scripts/ci.sh:32`). No engine barrel, no JS facade. Internal to the script layer; `worktree-setup.sh` is its only consumer in-repo, `craft:init` (part 4) is the second.
- `engine/src/init-emit.js` exporting `emitManifest`, `joinManifest` (part 2): generator-internal, **NOT** added to the public barrel `engine/src/index.js`. Precedent: `memory.js`, `cli-overlay.js`, `frontmatter.js`, `manifest-lint-main.js`, `normalize-findings-main.js` are all engine-internal and absent from `index.js`; they are consumed by bins/skills directly. `init-emit.js` follows that class. Its bin `engine/bin/init-emit.js` is the surface `craft:init` invokes.
- `engine/src/init-config.js` exporting `resolveConfigPath` (part 3): same class — generator/orchestrator-internal, not in the barrel. Its bin `engine/bin/init-config.js` is the surface `skills/run/SKILL.md` invokes. ADR-137's "engine bins unchanged" constraint binds the *existing* `manifest-lint`/`pipeline-resolve` bins; a new helper bin is permitted (and the only way to give the name-containment check a tested home without touching those two).

---

## Part 1 — Read-only ecosystem detection helper (bash)

### Context

**Goal (D1, ADR-141).** Factor the lockfile→ecosystem detection table out of
`scripts/worktree-setup.sh` into a new **read-only** helper `scripts/detect-ecosystem.sh`
that performs NO install/mutation, and have `worktree-setup.sh` *source* it for detection
while keeping its own install behaviour byte-for-byte. The helper is the probe `craft:init`
(part 4) calls; `worktree-setup.sh` must never be called by the generator (it installs).

**The table to factor (current `scripts/worktree-setup.sh:14-23`, exact mapping):**
```
package-lock.json  → npm        pnpm-lock.yaml → pnpm     yarn.lock     → yarn
bun.lockb|bun.lock → bun        uv.lock        → uv       poetry.lock   → poetry
Cargo.toml         → cargo      go.mod         → go       Gemfile.lock  → bundler
composer.lock      → composer
```
Order matters: `worktree-setup.sh` evaluates this as an `if/elif` chain top-to-bottom
(first match wins). The helper must preserve that precedence.

**Helper form (pinned).** Bash, because the consumer (`worktree-setup.sh`) is bash and the
design says "decide helper form from how `worktree-setup.sh` must consume it". The helper:
- Provides a function `detect_ecosystem <dir>` that echoes one of the ecosystem tokens
  (`npm|pnpm|yarn|bun|uv|poetry|cargo|go|bundler|composer`) on stdout, or echoes nothing
  and returns non-zero when no recognized lockfile/manifest is present in `<dir>`.
- Reads only (test `[ -f ... ]`); runs NO `npm ci`/`cargo fetch`/etc. — pure detection.
- Is `source`-able without side effects (guard the "run as script" path so sourcing it
  defines the function without executing detection): mirror the `if [ "${BASH_SOURCE[0]}"
  = "$0" ]` direct-exec guard idiom so it can also be invoked as `detect-ecosystem.sh <dir>`
  by `craft:init`.

**Refactor `worktree-setup.sh` (behaviour-preserving).** Replace the inline `if/elif`
ecosystem branch (lines 14-23, NOT the nested-`engine/` fallback at 25-31 nor the
no-match `else` at 32-35) with: `source` the helper, call `installed="$(detect_ecosystem .)"`,
then `case "$installed" in npm) npm ci || npm install;; pnpm) pnpm install --frozen-lockfile;;
…` — i.e. detection comes from the helper, the **install command stays in `worktree-setup.sh`**
(the helper never installs). The success message `craft-setup: dependencies installed
in-worktree via $installed.` (line 36) and the no-match path (lines 32-35) are unchanged.
`set -euo pipefail` (line 7) stays; under it, `detect_ecosystem` returning non-zero must not
abort the script when no lockfile is present — capture with `installed="$(detect_ecosystem .)"
|| installed=""` so the no-match path is reached.

**Test home (pinned).** New `test/detect-ecosystem.bats`, loading a fixture-builder. The
existing bats layout: `test/*.bats` files, `load helpers/<name>` from `test/helpers/<name>.bash`,
`mktemp -d "${BATS_TMPDIR}/..."` throwaway dirs created in `setup()` and removed in `teardown()`
(see `test/worktree.bats:11-21` and `test/helpers/worktree.bash`). `SCRIPTS_DIR=
"${BATS_TEST_DIRNAME}/../scripts"`. bats merges stderr into `$output` by default.

**`worktree-setup.sh` install-intact assertion.** `test/worktree.bats` already proves the
install branch (the nested-`engine/package-lock.json` npm-stub test at `worktree.bats:33`,
and the no-lockfile "skipped (noted)" test at `:27`). Re-run them after the refactor (they
are the regression guard that detection-extraction did not change install behaviour) — do
NOT delete or weaken them. Add at most a thin assertion in the new bats file that the helper
itself, run against a `package-lock.json` fixture dir, installs NOTHING (no `node_modules`
appears, no network) — i.e. it is detection-only.

### TDD steps

RED (write `test/detect-ecosystem.bats` first; each `@test` Given/When/Then-titled):
1. `Given a dir with package-lock.json, when detect_ecosystem runs, then it echoes "npm" and exits 0` — fails: `scripts/detect-ecosystem.sh` does not exist.
2. `Given a dir with go.mod, when detect_ecosystem runs, then it echoes "go"` — fails likewise.
3. `Given a dir with Cargo.toml, when detect_ecosystem runs, then it echoes "cargo"`.
4. `Given a dir with both package-lock.json and Cargo.toml, when detect_ecosystem runs, then it echoes "npm" (first-match precedence)` — pins the if/elif order.
5. `Given a dir with no recognized lockfile, when detect_ecosystem runs, then it echoes nothing and exits non-zero`.
6. `Given a package-lock.json fixture, when the helper runs, then no node_modules is created (detection is read-only, no install)` — assert `[ ! -d "$dir/node_modules" ]` after the call.
7. `Given the helper is sourced (not executed), when sourced, then detect_ecosystem is defined and no detection ran` — assert the source-guard.

GREEN:
8. Create `scripts/detect-ecosystem.sh`: shebang `#!/usr/bin/env bash`, `set -euo pipefail`,
   define `detect_ecosystem()` with the `if/elif` table above echoing the token; add the
   direct-exec guard that calls `detect_ecosystem "${1:-.}"` only when run as a script.
9. Refactor `scripts/worktree-setup.sh` per Context: source the helper, replace lines 14-23
   with a helper call + `case` install dispatch, keep the message/no-match/nested paths intact.

REFACTOR:
10. Confirm no duplicated table remains in `worktree-setup.sh`; the mapping lives once in the
    helper. Keep both scripts shellcheck-clean (no `SC2155` from `local x="$(...)"` splits —
    declare then assign if shellcheck flags it).

(No engine `node --test` files touched → `EXPECTED_TESTS` stays 942. Do NOT edit `scripts/ci.sh`.)

### Gate

```
bats test/detect-ecosystem.bats test/worktree.bats \
  && shellcheck scripts/detect-ecosystem.sh scripts/worktree-setup.sh
```
(Part gate for a bash-helper part: the touched bats + shellcheck over the touched `.sh`.
`test/worktree.bats` is included because the refactor touches `worktree-setup.sh`.)

### Commit

```
feat: read-only ecosystem detection helper shared with worktree-setup
```

---

## Part 2 — Pure manifest emitter + bin

### Context

**Goal (D4, the TDD-able core).** A pure `emitManifest(answers) → { frontmatter, prose }`
plus a `joinManifest({ frontmatter, prose }) → string` joiner in new `engine/src/init-emit.js`,
and a thin I/O bin `engine/bin/init-emit.js` the `craft:init` skill (part 4) invokes. The
emitter produces a manifest in the EXACT shape the existing lint + validator accept — **no
schema change** (R7, ADR-136).

**Serializer reuse (pinned).** `js-yaml` `dump` is already imported in-repo at
`engine/src/memory.js:18` (`import { load as yamlLoad, dump as yamlDump } from 'js-yaml'`).
Reuse it: `import { dump } from 'js-yaml'`. Do not add a dependency.

**The fenced shape `parseManifestContent` expects (`engine/src/frontmatter.js:50-54`).**
A fenced file opens with `---`; `extractFrontmatter` collects lines between the first and
second `---` fence; the body after the second fence is prose and never reaches the YAML
parser. So `joinManifest` MUST produce exactly:
```
---\n<yaml-dump-output>---\n\n<prose>\n
```
(`dump` already terminates with `\n`; place the closing fence on its own line, then a blank
line, then prose). Round-trip target: `parseManifestContent(joined)` returns the frontmatter
object; `validateManifest(thatObject, { fileExists: () => true })` returns `{ ok: true,
errors: [] }`.

**The keys the emitter may produce, and their EXACT validated shapes** (from
`engine/src/manifest.js`; these are the round-trip contract — emit only these, only in these
shapes):
- `TOP_KEYS` whitelist (`manifest.js:14`): `backlog, memory, paths, context, gates, phases,
  pr, scripts, models, pipeline, retrieval, execution, extends, policy`. Any other top-level
  key → `unknown top-level key` (hard fail). The emitter must NEVER emit outside this set.
- `models.<agent>` — `MODELS_KEYS` (`manifest.js:46`): `fallback, designer, planner, reviewer,
  part-implementer, refactor-executor, validation-triager, docs-writer, backlog-ticker`.
  Value = a model tier string. Unknown key → error.
- `gates.<field>` — `GATE_FIELDS` (`manifest.js:37`): only `part, phase, review-batch`.
  **NB: `gates` is keyed by gate-cadence field, NOT by phase id.** The interview's
  "test/gate command" (the probed `testCmd`) emits as `gates.part` and/or `gates.phase`
  (the gate command strings) — emitting `gates.<phaseId>` would fail `unknown gates field`.
- `phases.<id>` — `PHASE_NAMES` (`manifest.js:24`): `workspace, requirements, design, decisions,
  planning, implementation, review, refactoring, validation, architecture, documentation,
  propose, integrate`. Fields per block — `PHASE_FIELDS` (`manifest.js:31`): `context, override,
  strategy, merge-flags, non-blocking-jobs, harness, execution, enabled, role, model, procedure`.
  `execution` value `inline|agent`; `harness` is an object (`dimensions[]:string`, `passes`/
  `max_cycles` positive int, `convergence` `low-only|none|≥0 number`, `tool`/`scope` string,
  `incremental` bool — `validateHarness`, `manifest.js:350`). **`skip:` on a phase is INERT
  (ADR-011) — emitting it is a hard error.** The emitter must NEVER emit a per-phase `skip`.
  `context`/`override` are file-refs (existence-checked).
- `pipeline.<key>` — `PIPELINE_KEYS` (`manifest.js:53`): `profile, skip, insert, reorder`.
  `skip` = array of phase-id strings; `profile` = a profile-name string (`solo|lean|full` or a
  registered name); `insert` = array (only `reorder` gets element-shape validation —
  `validateReorder`, `manifest.js:330`; `skip`/`insert` pass through as arrays). Emit
  drops/skips as `pipeline.skip: [...]`, NOT per-phase.
- `backlog: { source, ref }` — `validateBacklog` (`manifest.js:199`). `source ∈ {file, custom}`
  (or a registered adapter name). For `file`, `ref` is a file-ref (existence-checked). For
  `custom`, `ref` is a required non-empty string. Only keys `source`/`ref` allowed.
- `memory: { source, ref }` — `validateMemory` (`manifest.js:242`), same shape as backlog.
- `policy: { always|ask|never: [actions] }` — `validatePolicy` (`manifest.js:296`). Verdict
  keys ∈ `VERDICTS` (`policy.js:36`: `always, ask, never`); actions ∈ `POLICY_ACTIONS`
  (`policy.js:20`: `isolate, commit, push, propose, integrate, teardown, external-send,
  backlog-write`). An action in two verdicts → conflict error (emit each action under at
  most one verdict).
- `paths: { dod: <file-ref> }` — `validatePaths` (`manifest.js:157`) checks only `dod` as a
  file-ref; other `paths` sub-keys are inert. The DoD interview point emits `paths.dod`.
- `context: <path>` — top-level `context` is a file-ref (`checkFileRef`, validated at
  `manifest.js:712`). Per-phase house-rules emit as `phases.<id>.context`.
- `extends` is OUT of scope (Tier-2, design "Out of scope") — the emitter must never produce it.

**Catalog-point → key map (D3 table, the emit contract).** name→filename (not a key);
skip→`pipeline.skip`; model→`models.<agent>`(+`models.fallback`); gate→`gates.part`/`gates.phase`;
execution→`phases.<id>.execution`; profile→`pipeline.profile`; harness→`phases.<phase>.harness.*`;
backlog→`backlog:{source,ref}`; memory→`memory:{source,ref}`; policy→`policy:{always,ask,never}`;
context→`context:`/`phases.<id>.context`; override→`phases.<id>.override`; role/procedure→
`phases.<id>.role`/`phases.<id>.procedure`; insert→`pipeline.insert:[...]`; DoD→`paths.dod`.

**Minimal-manifest rule (D4).** Defaulted/empty answer points are OMITTED from the
frontmatter (a defaults-only `answers` emits `{}` → a manifest with empty frontmatter that
still lints clean — `validateManifest({}, …)` is `{ ok: true }`, and the orchestrator treats
an empty-frontmatter manifest as pure defaults; `manifest-lint-main.js:78` returns exit 0
for a fence with no config). "Declare only what probing can't infer."

**Prose body (D4).** A markdown body: the named-customization heading + one line of rationale
per emitted point, reading like `examples/*/workflow.md` (a `---`-fenced frontmatter + prose
body — see `examples/architecture/workflow.md` for the shape). It carries **no provenance**
(R9): no `P25`/`ADR`/backlog token anywhere in frontmatter or prose.

**`Answers` shape (the emitter input — define it; the skill in part 4 builds it from the
interview).** A plain object whose presence-of-key drives emission, e.g.
`{ name, skip?: string[], models?: {<agent>: tier}, gate?: {part?, phase?}, execution?:
{<phaseId>: 'inline'|'agent'}, profile?, harness?: {<phaseId>: {...}}, backlog?: {source, ref},
memory?: {source, ref}, policy?: {always?: [], ask?: [], never?: []}, context?: string,
phaseContext?: {<phaseId>: string}, override?: {<phaseId>: string}, role?: {<phaseId>: ref},
procedure?: {<phaseId>: ref}, insert?: any[], dod?: string }`. Document this shape in a
JSDoc block on `emitManifest`. `name` is consumed by the skill for the filename, NOT emitted
into frontmatter.

**The bin (`engine/bin/init-emit.js`, the I/O seam — mirror `engine/bin/manifest-lint.js`
and `engine/bin/normalize-findings.js`).** Pattern: `#!/usr/bin/env node`, import a `main`
from a `*-main.js`, guard `if (process.argv[1] === fileURLToPath(import.meta.url))`. Add
`engine/src/init-emit-main.js` exporting `main(argv, io)` that: reads an answers-JSON path
from `argv[0]` (or stdin via `readStdin`), parses it, calls `emitManifest`+`joinManifest`,
writes the joined manifest to the out-path `argv[1]` (the temp path the skill chose), and
returns exit 0; on a malformed answers JSON, write a diagnostic to stderr and return non-zero
(no swallowed error). Keep `emitManifest`/`joinManifest` pure in `init-emit.js`; the I/O
(read JSON, write file) lives only in `init-emit-main.js`.

**Test style (`engine/test/manifest.test.js` is the model).** `import { test } from
'node:test'; import assert from 'node:assert/strict';`. Given/When/Then titles, AAA bodies,
`const sut = ...`. Combinatorial coverage uses plain `for…of` loops over `node:test` (the
repo has NO `fast-check` — see `engine/test/policy.test.js` for the in-repo combinatorial
style). Bin-level tests `spawnSync(process.execPath, [bin, ...args])` — model
`engine/test/manifest-lint.bin.test.js`. New test files:
`engine/test/init-emit.test.js` (pure unit + round-trip property) and
`engine/test/init-emit.bin.test.js` (bin lint-round-trip + direct-overwrite/rollback).

### TDD steps

RED — `engine/test/init-emit.test.js` (pure; ~22 cases):
1. `Given defaults-only answers (name only), when emitManifest runs, then frontmatter is {} (minimal)` — fails: `init-emit.js` absent.
2. `Given answers with skip, when emitManifest runs, then frontmatter.pipeline.skip equals the ids` — and assert NO per-phase `skip` key anywhere.
3. `Given answers with models.reviewer, when emitManifest runs, then frontmatter.models.reviewer is set`.
4. `Given answers with a gate command, when emitManifest runs, then it emits gates.part (a GATE_FIELDS key), never gates.<phaseId>`.
5. `Given answers with execution per phase, when emitManifest runs, then frontmatter.phases.<id>.execution is inline|agent`.
6. `Given answers with profile, when emitManifest runs, then frontmatter.pipeline.profile is the name`.
7. `Given answers with a harness knob, when emitManifest runs, then frontmatter.phases.<phase>.harness is the object`.
8. `Given answers with backlog, when emitManifest runs, then frontmatter.backlog is { source, ref }`.
9. `Given answers with memory, when emitManifest runs, then frontmatter.memory is { source, ref }`.
10. `Given answers with policy, when emitManifest runs, then frontmatter.policy groups actions under verdicts with no action in two verdicts`.
11. `Given answers with a global context path, when emitManifest runs, then frontmatter.context is the path`.
12. `Given answers with a per-phase context, when emitManifest runs, then frontmatter.phases.<id>.context is the path`.
13. `Given answers with override, when emitManifest runs, then frontmatter.phases.<id>.override is the path`.
14. `Given answers with role/procedure swap, when emitManifest runs, then phases.<id>.role / .procedure are set`.
15. `Given answers with insert, when emitManifest runs, then frontmatter.pipeline.insert is the array`.
16. `Given answers with a DoD artifact, when emitManifest runs, then frontmatter.paths.dod is the path`.
17. `Given any answers, when emitManifest runs, then every top-level frontmatter key is in TOP_KEYS` (assert against the imported/duplicated whitelist; iterate `Object.keys`).
18. `Given any answers, when emitManifest runs, then no per-phase skip key is ever emitted` (ADR-011 guard, dedicated case over a phase-bearing answers).
19. `Given any answers, when the joined output is built, then it contains no provenance token (/\b(P25|ADR-?\d+|backlog)\b/i)` (R9; regex over `joinManifest(...)`).
20. `Given a frontmatter+prose pair, when joinManifest runs, then the output is ---\n<yaml>---\n\n<prose> and parseManifestContent returns the frontmatter` (fence-shape contract).
21. `Given defaults-only answers, when joined and parsed and validated, then validateManifest is ok:true` (minimal round-trip).
22. `Given an emitted minimal manifest, when joinManifest runs, then the prose body carries the customization heading` (prose presence).

RED — the **round-trip property** (still `engine/test/init-emit.test.js`; ~6 cases, plain
`for…of` over an answer matrix):
23. The matrix as **6 distinct `test(...)` cases** (one per variant, so the count is exact),
    each titled `Given <variant> answers, when emit→join→parse→validate, then ok:true`:
    (a) every Tier-0 point set together, (b) every Tier-1 point set together, (c)
    `models.<agent>` WITH `models.fallback`, (d) `models.<agent>` WITHOUT fallback, (e)
    defaults-only, (f) a maximal all-points answers. Each asserts
    `validateManifest(parseManifestContent(joinManifest(emitManifest(a))), { fileExists: () => true }).ok === true`.
    (These 6 are SEPARATE from cases 1–22 above → 22 unit + 6 property = 28 in this file.)

GREEN:
24. Write `engine/src/init-emit.js`: pure `emitManifest(answers)` (omit absent points; map per
    the key table; never emit per-phase `skip`, never emit outside `TOP_KEYS`, never emit
    `extends`) and `joinManifest({ frontmatter, prose })` using `dump` from `js-yaml` and the
    fence shape. JSDoc the `Answers` shape.
25. Write `engine/src/init-emit-main.js` (`main(argv, io)` — read answers JSON, emit+join,
    write to out-path; non-zero + stderr on malformed JSON) and `engine/bin/init-emit.js`
    (the thin guarded entrypoint, mirroring `engine/bin/manifest-lint.js`).

RED — `engine/test/init-emit.bin.test.js` (subprocess + fs; ~6 cases):
26. `Given an answers JSON, when the init-emit bin writes a manifest and manifest-lint runs on it, then manifest-lint exits 0 and reports valid` (test-strategy 4 — emit a manifest to a temp `.claude/craft-<name>.md` under a mktemp repo root so `fileExists` ROOT = repo root, spawn `engine/bin/manifest-lint.js <path>`, assert exit 0 + "valid.").
27. `Given a valid emit, when written to .claude/craft-<name>.md, then the file exists with the fenced shape` (land happy-path).
28. `Given a hand-written INVALID manifest text at a temp path (e.g. an unknown top-level key), when manifest-lint runs on it, then lint exits 2` — the rollback precondition (test-strategy 5). Write the bad manifest text DIRECTLY to the temp path (do NOT try to coerce the pure `emitManifest`, which by construction cannot emit an invalid key); the point is to prove the temp-lint gate (D5) rejects an invalid candidate, which is what gates the skill's move-on-exit-0 in part 4.
29. `Given a pre-existing valid .claude/craft-<name>.md and a sibling temp candidate that fails lint, when lint exits 2 and the (simulated) land step is skipped, then the pre-existing file is byte-for-byte unchanged` (rollback property at the fs level: write a known-good file, write a bad temp sibling, lint the temp → 2, assert the good file's bytes are intact — the move never happened because lint was non-zero, and the bad temp is the only artifact to discard).
30. `Given the init-emit bin with a malformed answers JSON, when it runs, then it exits non-zero and writes a diagnostic to stderr` (loud failure, R8 — no swallowed error).
31. `Given the init-emit bin with no out-path, when it runs, then it exits non-zero with a usage diagnostic` (arg-guard).

GREEN: covered by step 25 (bin already handles these); add the malformed-JSON/usage guards
to `init-emit-main.js` if a RED case is still failing.

REFACTOR:
32. Extract any duplicated key-mapping into small named helpers inside `init-emit.js`
    (one mapper per catalog group; keep functions < 20 lines, early-return on absent points,
    no boolean params). Confirm immutability (build a fresh frontmatter object; never mutate
    `answers`).
33. **Bump `EXPECTED_TESTS`**: this part adds **34** engine `test(...)` cases (22 unit + 6
    property in `init-emit.test.js` + 6 bin in `init-emit.bin.test.js`). Recount the actual
    `# tests` delta with `cd engine && node --test 'test/init-emit*.test.js' | grep '^# tests'`
    and set `scripts/ci.sh:10` `EXPECTED_TESTS=976`; if the real delta differs, set the literal
    to `942 + actual_delta`. Edit `scripts/ci.sh` in THIS commit.

### Gate

```
cd engine && node --test test/init-emit.test.js test/init-emit.bin.test.js
```
(Part gate: `node --test` over the touched test files. The full count-pinned phase gate
`bash scripts/ci.sh` runs once at the phase boundary; the `EXPECTED_TESTS` bump in step 33
keeps it green.)

### Commit

```
feat: pure manifest emitter + bin for craft:init
```

---

## Part 3 — `--config <name>` consumption path (orchestrator wiring)

### Context

**Goal (D8, R5, ADR-137).** Make a named manifest file `.claude/craft-<name>.md` loadable
for a run via a new per-invocation `--config <name>` token. **Orchestrator-only wiring** —
the existing `engine/bin/manifest-lint.js` and `engine/bin/pipeline-resolve.js` are
UNCHANGED (both already accept an arbitrary positional manifest path — see below); `--config`
is a flag-parse + path-resolution + absent-file STOP in `skills/run/SKILL.md`, backed by one
new pure name→path helper + its bin.

**Why the existing bins are already enough (pinned, do NOT modify them):**
- `engine/src/manifest-lint-main.js:16-18` `resolveManifestPath(argv)` returns
  `argv[0] ?? '.claude/workflow.md'` — arbitrary path. `scripts/manifest-lint.sh:4` is
  `exec node "$ROOT/engine/bin/manifest-lint.js" "$@"` — passes the path through. `fileExists`
  ROOT is `dirname(dirname(manifestAbsPath))` (`manifest-lint-main.js:57`) → for
  `.claude/craft-<name>.md` that is the repo root, identical to `.claude/workflow.md`.
- `engine/src/pipeline-resolve-main.js:184-188` reads two positionals (`pipelinePath`,
  `manifestPath`); `main` parses `manifestPath`'s content. Arbitrary path already.
- `engine/src/cli-overlay.js` `applyCliOverlay(manifest, { profile, skip, harness })`
  (`cli-overlay.js:56`) folds `--profile`/`--skip`/`--harness` over **whatever manifest
  object was loaded**, setting `merged.pipeline.profile` from `profile` (`cli-overlay.js:82`)
  at highest precedence. `--policy` folds via `mergePolicyScopes` (`pipeline-resolve-main.js`).
  Because the overlay folds over the loaded manifest, once the loaded manifest IS the named
  file, the overlay applies unchanged — **no overlay change needed.**

**The new pure helper (the `<name>`-validation home — test-strategy 6's validation clause).**
New `engine/src/init-config.js` exporting `resolveConfigPath(repoRoot, name) → { ok: true,
path } | { ok: false, error }`. Containment discipline **mirrors `engine/src/memory.js`
`resolveStorePath` (`memory.js:37-42`)**: `resolvePath(rootAbs, '.claude/craft-' + name +
'.md')`, reject when the resolved target is not the repo root and does not start with
`rootAbs + pathSep` (path-traversal containment). Additionally reject a `name` that is not a
filesystem-safe single segment — no `/`, no `\`, no `..`, kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`)
— BEFORE joining, so a traversal name (`../../etc/x`) is refused with a clear error, not
silently contained. The helper does NOT check file existence (that is the orchestrator's
absent-file STOP, which needs an fs check the pure helper avoids).

**The new bin (the surface the orchestrator invokes — a NEW bin is allowed; ADR-137 only
freezes the two existing manifest bins).** `engine/bin/init-config.js` mirroring
`engine/bin/manifest-lint.js`: a thin guarded entrypoint over a new
`engine/src/init-config-main.js` `main(argv, io)` that takes `argv[0]` = name, resolves via
`resolveConfigPath` against `process.cwd()` (the repo root), and on `ok` prints the resolved
relative path to stdout (exit 0); on `!ok` writes the error to stderr (exit non-zero). The
orchestrator runs this to turn `--config <name>` into the path it then passes to
`manifest-lint.sh` and `pipeline-resolve.js`.

**Orchestrator wiring in `skills/run/SKILL.md` (prose edits, pinned to existing steps):**
- **Step 0a** (`skills/run/SKILL.md:19-28`) currently strips `--profile`/`--skip`/`--harness`/
  `--policy`. ADD `--config <name>` to that strip-and-hold set: it is per-invocation; hold the
  name. Add the explicit note that `--config` is **distinct from `--profile`** (config selects
  *which manifest file is read*; profile sets the *execution map* inside it) and that the two
  **compose** (both may be present).
- **New manifest-path resolution, before step 1.** When `--config <name>` was parsed: run
  `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js" <name>` to resolve+validate the path
  to `.claude/craft-<name>.md`; on the bin's non-zero exit (bad name/traversal) STOP and
  surface stderr. Then check the resolved file EXISTS; **absent → loud STOP** ("`--config
  <name>`: no manifest at `.claude/craft-<name>.md`", never a silent fallback to
  `.claude/workflow.md` — R5/ADR-137). When `--config` is absent, behaviour is exactly today's
  (`.claude/workflow.md`, or pure defaults when none).
- **Step 1** (`skills/run/SKILL.md:30-33`): run `manifest-lint.sh <resolved-path>` (the
  resolved named path instead of the hardcoded `.claude/workflow.md`); INVALID → STOP
  (existing behaviour, unchanged).
- **Step 1b** (`skills/run/SKILL.md:35-51`): pass `<resolved-path>` as the existing
  `[manifest-path]` positional to `pipeline-resolve.js`; the `--profile`/`--skip`/`--harness`/
  `--policy` flags append exactly as today and fold over the named manifest at highest
  precedence. A named config that itself sets `pipeline.profile` is honoured; a CLI
  `--profile` overrides it (existing precedence). Note this explicitly.

**Test home (engine).** `engine/test/init-config.test.js` (new — pure helper unit +
name-validation/containment). The overlay-folds-over-named-fixture regression
(test-strategy 6's precedence clause) lands as cases in the EXISTING
`engine/test/cli-overlay.test.js` (it owns `applyCliOverlay` coverage) — model its existing
style. Use a fixture: a named-config object setting `pipeline.profile: 'full'`, assert
`applyCliOverlay(named, { profile: 'lean' }).pipeline.profile === 'lean'` (CLI wins) and that
without `--profile` the named `full` survives. A bin-level test
`engine/test/init-config.bin.test.js` (subprocess, model `manifest-lint.bin.test.js`) covers
the resolve-and-print + reject-traversal paths.

### TDD steps

RED — `engine/test/init-config.test.js` (pure; ~8 cases):
1. `Given a kebab-case name "ci", when resolveConfigPath runs, then ok:true and path ends with .claude/craft-ci.md` — fails: `init-config.js` absent.
2. `Given a name with a slash "a/b", when resolveConfigPath runs, then ok:false with a path-separator error`.
3. `Given a traversal name "../escape", when resolveConfigPath runs, then ok:false (containment, never a contained guess)`.
4. `Given an UpperCase name, when resolveConfigPath runs, then ok:false (kebab-case only)`.
5. `Given an empty name, when resolveConfigPath runs, then ok:false`.
6. `Given a name with a backslash, when resolveConfigPath runs, then ok:false`.
7. `Given a valid name, when resolveConfigPath runs, then the resolved path is contained under repoRoot/.claude` (assert `startsWith`).
8. `Given a name with a dot segment "a..b", when resolveConfigPath runs, then ok:false`.

RED — `engine/test/cli-overlay.test.js` (ADD ~4 cases; test-strategy 6 precedence):
9. `Given a named config with pipeline.profile full and a CLI --profile lean, when applyCliOverlay folds, then pipeline.profile is lean (CLI wins over the named manifest)`.
10. `Given a named config with pipeline.profile full and no CLI profile, when applyCliOverlay folds, then pipeline.profile stays full (named manifest honoured)`.
11. `Given a named config and a CLI --skip, when applyCliOverlay folds, then the skip applies over the named manifest`.
12. `Given a named config with a context key and a CLI --profile, when applyCliOverlay folds, then non-profile named keys survive (overlay only touches profile/skip/harness)`.

RED — `engine/test/init-config.bin.test.js` (subprocess; ~2 cases):
13. `Given the init-config bin with a kebab name, when it runs, then it exits 0 and prints .claude/craft-<name>.md`.
14. `Given the init-config bin with a traversal name, when it runs, then it exits non-zero and writes a containment error to stderr`.

GREEN:
15. Write `engine/src/init-config.js` (`resolveConfigPath` — segment validation then
    `resolveStorePath`-style containment, mirroring `memory.js:37-42`).
16. Write `engine/src/init-config-main.js` (`main(argv, io)`) + `engine/bin/init-config.js`
    (thin guarded entrypoint).

REFACTOR + wiring:
17. Edit `skills/run/SKILL.md` per Context (step 0a add `--config`; new path-resolution block
    with the absent-file STOP; steps 1 and 1b use the resolved path). Prose only — no engine
    bin edit to `manifest-lint`/`pipeline-resolve`. Keep the `--profile` vs `--config`
    distinction explicit. **No provenance** (no `ADR`/`P25` tokens) in the skill prose.
18. **Bump `EXPECTED_TESTS`**: this part adds **14** engine `test(...)` cases (8 init-config +
    4 cli-overlay + 2 bin). Recount the real delta (`cd engine && node --test
    'test/init-config*.test.js' test/cli-overlay.test.js | grep '^# tests'` minus the
    cli-overlay baseline) and set `scripts/ci.sh:10` `EXPECTED_TESTS=990` (or `976 +
    actual_delta`). Edit `scripts/ci.sh` in THIS commit.

### Gate

```
cd engine && node --test test/init-config.test.js test/init-config.bin.test.js test/cli-overlay.test.js
```
(Part gate: `node --test` over the touched test files — the new init-config files plus the
extended `cli-overlay.test.js`. `skills/run/SKILL.md` is prose, gated by the phase-boundary
`bash scripts/ci.sh` which has no skill-lint but must stay count-green via step 18.)

### Commit

```
feat: --config <name> selects a named manifest for a run
```

---

## Part 4 — The `craft:init` skill (standalone, session-owned)

### Context

**Goal (D7, ADR-142, R1–R9).** A new standalone skill `skills/init/SKILL.md`,
auto-discovered (`.claude-plugin/plugin.json` has no `skills` key — confirm: a new
`skills/<name>/SKILL.md` needs no plugin.json edit). **Docs/prose only — no `src/` delta**;
it orchestrates the helper (part 1), the emitter bin (part 2), the `manifest-lint` bin, and
references the `--config` consumption path (part 3). This is the standalone-docs sizing
exception (no implementation part to fold into). `EXPECTED_TESTS` stays at 990 (part 3's
value) — this part adds no engine test.

**Stance (D7).** `craft:init` is **NOT** a phase in the `/craft:run` walk. It mirrors the
**run skill's orchestrator stance** (`skills/run/SKILL.md`): the **session** probes,
interviews, emits, and lints — **no worker agent is spawned**. `AskUserQuestion` appears in
exactly one existing skill today (`skills/run/SKILL.md`); `craft:init` is the second, and
owns its own conversation. Structure mirrors a session-owned phase skill: a **Preamble**
(probe + `<name>` validation) and a **Procedure** (interview → emit → temp-lint → land).

**Frontmatter (model on `skills/run/SKILL.md:1-5`).** `name: init`, a `description`
triggering on "scaffold a craft customization / craft:init / generate a named manifest", an
`argument-hint` for an optional name.

**Procedure to author (the probe→interview→emit→lint→land pipeline, D1–D5):**
1. **Preamble — probe (read-only, R3/R8/ADR-141).** Build the `CapabilityReport`
   (`{ ecosystem, lockfile, testCmd, hasRemote, mutationTool, archTool, existingNames[] }`,
   D1 shape):
   - ecosystem/lockfile: invoke `bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-ecosystem.sh" .`
     (part 1) — read-only; never `worktree-setup.sh`.
   - testCmd: the gate probe's read-only test-command discovery (`docs/adapters/gate.md`
     `resolveGate`, precedence `descriptor.gate → manifest.gates[phaseId] → none`).
   - hasRemote: `git remote` presence (a probe miss degrades that dimension to a question,
     never aborts — D6).
   - mutationTool/archTool: presence of stryker / dependency-cruiser config.
   - existingNames: glob `.claude/craft-*.md` for overwrite awareness.
   - Any state-mutating probe runs in a `mktemp` throwaway, never the worktree (R8).
   - `<name>` validation: the same kebab/containment rule part 3's `resolveConfigPath`
     enforces — reuse it (invoke `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js"
     <name>` to validate+resolve the target path, so the skill and the consumption path agree
     on the name rule and the path).
2. **Procedure — interview (interactive-only, D3/ADR-139/ADR-140).** Drive `AskUserQuestion`
   over the **full Tier-0/1 catalog** (the D3 table — skip/model/gate/execution/profile/
   harness/backlog/memory/policy/context/override/role-or-procedure/insert/DoD), one question
   per catalog point the probe deems usable, **defaulted from the CapabilityReport**. A point
   the probe rules out (`validation` harness when `mutationTool: null`; `propose`/`integrate`
   config when `hasRemote: false`; `architecture` harness when `archTool: null`) is skipped or
   asked with a "this will no-op in your repo" note — never emitted as a silent no-op (R4).
   **The no-test-command edge (D3):** when `testCmd: null`, ask for an explicit gate command
   and warn that leaving it empty yields a manifest craft refuses at run time (gate-floor) —
   the one case "accept all defaults" cannot yield a runnable manifest; say so.
3. **Procedure — emit (pure, D4).** Assemble the `Answers` object from the interview (the
   part-2 `Answers` shape) and write it to a `mktemp` JSON file; invoke `node
   "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-emit.js" <answers.json> <temp-manifest-path>`
   (part 2 bin) to produce the candidate manifest text.
4. **Procedure — temp-lint + land (D5/ADR-138, R2/R6/R8).** Write the candidate to a sibling
   temp file **inside the repo's `.claude/`** — e.g. `.claude/.craft-<name>.<pid>.tmp` (the
   location is load-bearing: `manifest-lint`'s `fileExists` ROOT is
   `dirname(dirname(manifestAbsPath))` = repo root, so ref-existence checks resolve correctly;
   a temp in an unrelated dir would check the wrong root). Run `bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/manifest-lint.sh" <temp-path>`:
   - lint **non-zero** → STOP; surface the `manifest-lint` diagnostic block; **remove the temp
     file; nothing lands**; any prior `.claude/craft-<name>.md` is byte-for-byte untouched
     (R6/R8). Never swallow the lint failure.
   - lint **exit 0** → `rename`/`mv` the temp file to `.claude/craft-<name>.md` (atomic direct
     overwrite, same-dir same-filesystem; ADR-138). The live `.claude/workflow.md` is never
     touched.
5. **Error semantics (D6 table).** `.claude/` unwritable → STOP with path+reason, no partial
   file. Interview aborted → leave the repo unchanged (no temp, no landed file). Every failure
   surfaces explicitly (message + STOP) and leaves a known state (R8).
6. **Done message.** Report the landed path `.claude/craft-<name>.md`, that it lints clean,
   and the next step: `/craft:run --config <name> <brief>` (the part-3 consumption path).
   **No provenance** (R9) in the skill prose OR in anything it emits — the emitted manifest's
   no-provenance is already enforced by part 2; the skill must not inject any either.

**No automated unit test (D-test-strategy).** The interview transport (`AskUserQuestion`) is
a live conversation — the skill's behaviour is covered by an on-demand manual smoke (run
`craft:init` in a throwaway repo, accept defaults, confirm the landed file lints, then
`/craft:run --config <name>` loads it), mirroring craft's other not-CI-gated smokes
(`skills/run/SKILL.md` "Manual acceptance check" / "SC5 second-instantiation smoke"). The
pure pieces it orchestrates (emitter, name-resolution) are CI-covered by parts 2 and 3.

### TDD steps

This is a **docs/prose part — no RED/GREEN test cycle** (no `src/` delta, no engine tests;
`EXPECTED_TESTS` is UNCHANGED at 990, do NOT edit `scripts/ci.sh`). The "test" is the
authoring discipline:
1. Author `skills/init/SKILL.md` with the frontmatter + Preamble + Procedure above. Every
   invoked path is a REAL artifact landed by parts 1–3: `scripts/detect-ecosystem.sh`,
   `engine/bin/init-emit.js`, `engine/bin/init-config.js`, `scripts/manifest-lint.sh`.
2. Self-check: the skill never calls `worktree-setup.sh` (it installs — ADR-141); never
   spawns a worker agent (session-owned — ADR-142); never touches `.claude/workflow.md`
   (named sibling only — ADR-136); emits to temp then lints then moves (ADR-138); carries no
   provenance token (R9).
3. Confirm auto-discovery: `.claude-plugin/plugin.json` has no `skills` key, so the new
   `skills/init/SKILL.md` is discovered without a manifest edit (verify by reading
   `.claude-plugin/plugin.json`).

### Gate

```
bash scripts/ci.sh
```
(This docs part has no engine test of its own; its gate is the phase-boundary substrate gate,
which must stay green. `EXPECTED_TESTS` is unchanged from part 3 at 990, so the count
assertion passes; `shellcheck`/`bats` cover no new `.sh`/`.bats` here. There is no skill-lint
in the substrate gate — the skill's correctness is the manual smoke per Test strategy.)

### Commit

```
feat: craft:init skill scaffolds a named manifest by interview
```
