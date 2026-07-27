# Plan — P9 hardening batch

> Source: design doc `docs/DESIGN-P9-hardening.md` · ADRs `041, 042, 043, 044, 045, 046, 047`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise.
- **ADR-044 carve-out (applies to THIS plan):** test-infra-only parts (Stryker config +
  deps + ADV suites with no `src/` delta) and docs/prose-only parts (skill/agent/template
  prose) ARE exempt from the no-test-only rule — they have no implementation part to fold
  into. Parts **s-decisions, s-echo, s-cadence, s-planner-heuristic** ship as prose-only;
  the Stryker tooling rides inside **s-stryker** alongside the one real `src` change it
  carries (ADV-3, the empty-`procedure` lint guard).
- A part that would be a pure test pass over already-landed code merges into its neighbour.

### Surface gate (FROZEN — every commit honours it)

- The 7-export engine barrel (`engine/src/index.js`: `parsePipeline, validatePipeline,
  ALIAS_MAP, resolveAlias, resolvePipeline, assembleContract, normalizeFindings,
  validateManifest`) is UNCHANGED by every part. No part adds, removes, or re-signs an export.
- SC1 (no-manifest resolution) stays byte-identical; all scenario goldens (S1..S9, SC1/SC3,
  S-lean/full/reorder, S-harness-*, contract-equivalence) stay green.
- CI = `bash scripts/ci.sh`; never `--no-verify`; never commit on a red gate.
- **Count-assert maintenance (ADR-046):** `scripts/ci.sh` holds `EXPECTED_TESTS` and asserts
  the `node --test` runner's `# tests <N>` line equals it. **Baseline = 409.** Every part that
  adds/removes node `.test.js` cases bumps `EXPECTED_TESTS` IN THE SAME COMMIT so CI is green at
  every commit. bats tests do NOT count toward `EXPECTED_TESTS` (separate runner). Running tally:
  s-glob establishes 409 → s-roleexists 412 → s-stryker 414 → s-asm-parse 416.

### Dependency order (honoured by the part numbering below)

1. **s-glob first** — settles the `node --test 'test/**/*.test.js'` glob shape that s-stryker's
   `stryker.conf.json` `tap.testFiles` reuses, and stands up the `EXPECTED_TESTS=409` gate.
2. **s-worktree before/with s-stryker** — `engine/package-lock.json` already exists (1.2K) and
   s-stryker REGENERATES it with the new devDeps; either way it is a NESTED lockfile the
   root-only `worktree-setup.sh` probe misses today. s-worktree's one-level-deep probe must
   already handle it so a fresh worktree comes up green (the P9 dogfood's red-worktree failure).
3. **s-roleexists before the mutation run** — its bin probe + ADV-1 (in s-stryker) are what the
   on-demand `npm run mutation` confirms kill; wire the live seam, then add the config that
   measures it.
4. **s-asm-parse + the 4 prose parts** are independent and land after the tooling spine.

---

## Part 1 — s-glob: explicit `.test.js` glob + count-assert gate

### Context

**Shape:** TDD / part-implementer — but the "test" here is CI self-proof (the gate IS the
behaviour). No new `.test.js` file; the RED is a deliberate scratch non-test `.js` proven excluded,
then the count-assert pinned at the current baseline.

**Items:** item 5 (ADR-046, DC-5a glob + DC-5b count-assert).

**File 1 — `scripts/ci.sh`** (current full body is one pipeline line at `:10`):
```bash
(cd engine && node --test) && bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts
```
Two changes, both in `ci.sh`:
- Replace `(cd engine && node --test)` with the explicit glob `(cd engine && node --test 'test/**/*.test.js')`. The single-quotes are load-bearing: the shell passes the literal pattern to Node, which globs it natively (confirmed Node v22 — bare `node --test` auto-runs EVERY `.js` under `test/` incl. non-test helpers; `test/**/*.test.js` excludes them structurally; `node --test test/` is BROKEN — 1 test / 1 fail — never use the dir form).
- Add a count-assert gate. Capture the runner output, parse its `# tests <N>` summary line, compare to a single `EXPECTED_TESTS` constant declared near the top of `ci.sh`. On mismatch, print the expected-vs-actual and exit non-zero. Pin **`EXPECTED_TESTS=409`** (verified: `cd engine && node --test 'test/**/*.test.js'` prints `# tests 409` today). Keep `set -euo pipefail` (already at `:5`); the script must stay shellcheck-clean (the `shellcheck scripts/*.sh hooks/*.sh` step in the same pipeline lints it).
  - Mechanism (pre-chewed): run the glob once into a variable (`output="$(cd engine && node --test 'test/**/*.test.js')"` — let the non-zero exit propagate under `pipefail` if tests fail), `echo "$output"` so the run is visible, then `actual="$(printf '%s\n' "$output" | awk '/^# tests / {print $3}')"` and `[ "$actual" = "$EXPECTED_TESTS" ] || { echo "ci: test count drift — expected ${EXPECTED_TESTS}, got ${actual}" >&2; exit 1; }`. Keep the remaining pipeline steps (bats, shellcheck, pipeline-lint, pipeline-resolve, contracts-lint) intact and gated on the same `&&` chain or sequential `set -e` flow.

**File 2 — `engine/package.json`** (`:9`, the `"test"` script): `"test": "node --test"` → `"test": "node --test 'test/**/*.test.js'"`. (Note: under `npm test` the single-quotes are inside the JSON string; npm hands the whole command to the shell, which strips them and passes the literal glob to Node — confirmed.)

**Surface:** no engine `src` touch, no export change, SC1 untouched. This is CI plumbing only.

### TDD steps

- **RED (manual scratch proof, NOT committed):** during the part, create a throwaway non-test file `engine/test/zz-scratch.js` containing a bare `console.log`/no `test()` call. Confirm bare `node --test` would auto-run it (the phantom) while `node --test 'test/**/*.test.js'` excludes it (count stays 409). Delete the scratch file before committing — it must never be staged.
- **RED (count-assert):** temporarily set `EXPECTED_TESTS=408` and run `bash scripts/ci.sh` → it must FAIL with `test count drift — expected 408, got 409`, proving the gate fires on drift. Reset to 409.
- **GREEN:** with the glob in both files and `EXPECTED_TESTS=409`, `bash scripts/ci.sh` passes (409 discovered, count matches, all downstream steps green).
- **REFACTOR:** ensure the count parse is a single named step with a clear failure message; no duplicated `node --test` invocation (run once, reuse the captured output).

### Gate

```
bash scripts/ci.sh
```

Confirms: glob discovers exactly 409 `.test.js`; count-assert matches `EXPECTED_TESTS=409`; bats + shellcheck (ci.sh stays shellcheck-clean) + the three lint bins all green.

### Commit

```
ci: explicit node --test glob and EXPECTED_TESTS count-assert gate
```

---

## Part 2 — s-worktree: nested-lockfile probe + bats net

### Context

**Shape:** test-infra-adjacent but with a real `scripts/` behaviour change — TDD / part-implementer (bats RED→GREEN). Lands BEFORE s-stryker so the `engine/package-lock.json` that part creates is already handled.

**Items:** item 4 (ADR-047, DC-4 = one-level-deep fallback scan).

**File 1 — `scripts/worktree-setup.sh`** (current root-only probe at `:13–27`):
```bash
installed=""
if   [ -f package-lock.json ]; then npm ci || npm install; installed="npm"
elif [ -f pnpm-lock.yaml ];    then pnpm install --frozen-lockfile; installed="pnpm"
... (10 lockfile branches) ...
else
  echo "craft-setup: no recognized lockfile/manifest — dependency install skipped (noted)."
fi
[ -n "$installed" ] && echo "craft-setup: dependencies installed in-worktree via $installed."
```
Add a **bounded one-level-deep fallback** that fires ONLY when the root probe found nothing (`installed=""`), BEFORE the "skipped (noted)" message. Shape (pre-chewed, KISS — one level, not a recursive walk):
- After the root `if/elif/else` block, guard on `[ -z "$installed" ]`.
- Scan immediate subdirs for a recognized lockfile. The primary craft case is `engine/package-lock.json`; cover at least `package-lock.json` in a subdir (mirror the npm branch). For the first subdir match: `cd "$dir"`, run the matching install (`npm ci || npm install`), set `installed="npm (nested: <dir>)"` so the existing `[ -n "$installed" ] && echo ...` line reports the nested dir, then stop scanning (first match wins, bounded).
  - Concrete idiom (keep `set -euo pipefail`-safe, shellcheck-clean — quote everything, no unquoted globs that error on no-match): iterate `for sub in */; do` (trailing-slash form lists only dirs; if no subdir, `*/` stays literal — guard with `[ -d "$sub" ]`), and inside check `[ -f "${sub}package-lock.json" ]`. On match: `( cd "$sub" && (npm ci || npm install) )` then `installed="npm (nested: ${sub%/})"` and `break`.
- Keep the `else`/"skipped (noted)" message reachable only when NEITHER root nor nested found a lockfile.
- The post-`POST` block (`:29–32`) is unchanged.
- shellcheck-clean: no unquoted expansions; the `for sub in */` no-match case yields the literal `*/` which the `[ -d ]` guard rejects — no error under `pipefail`.

**File 2 — `test/worktree.bats`** — add ONE `@test` mirroring the no-lockfile test at `:27–31`, using the `mk_worktree` helper (already `load`ed via `load helpers/worktree` at `:3`; helper at `test/helpers/worktree.bash:11–24` creates `$REPO`/`$WT` in `setup()` at `:11–16`):
```bash
@test "Given a worktree with a nested engine/package-lock.json, when setup runs, then it installs via the nested dir" {
  mkdir "$WT/engine"
  touch "$WT/engine/package-lock.json"
  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"installed in-worktree via npm (nested: engine)"* ]]
}
```
Note: `npm ci` in a bare `touch`ed (empty) lockfile dir will fail and fall back to `npm install`; with no `package.json` `npm install` succeeds (creates none) and exits 0 — assert on the install-reported message, not on installed packages. The existing no-lockfile test (`:27`) and the two teardown tests (`:52,:70,:87`) stay green.

**Surface:** no engine touch; bats only (NOT counted in `EXPECTED_TESTS` — separate runner). No `EXPECTED_TESTS` bump this part.

### TDD steps

- **RED:** add the nested-lockfile `@test` first; run `bats test/worktree.bats` → it FAILS today (the root-only probe misses `engine/package-lock.json`, so output reports "skipped (noted)", not "installed … via npm (nested: engine)").
- **GREEN:** add the one-level-deep fallback to `worktree-setup.sh`; the test passes (output reports the nested install).
- **REFACTOR:** confirm shellcheck-clean (`shellcheck scripts/worktree-setup.sh`); ensure the scan is bounded to one level and the no-match path still reaches "skipped (noted)".

### Gate

```
bash scripts/ci.sh
```

bats (incl. the new nested test + the existing no-lockfile/teardown tests) green; shellcheck-clean; node `# tests` still 409 (no node test added → `EXPECTED_TESTS` unchanged).

### Commit

```
fix(worktree): probe one level deep for a nested lockfile (engine/package-lock.json)
```

---

## Part 3 — s-roleexists: bin wires a real `roleExists` predicate

### Context

**Shape:** TDD / part-implementer.

**Items:** item 1 (ADR-047, DC-1a bin-only, DC-1b derive-from-bin-location, DC-1c filesystem-existence).

**The seam already exists — do NOT touch it.** `engine/src/resolve.js:154` reads
`const roleExists = typeof opts?.roleExists === 'function' ? opts.roleExists : () => true;` and
`:216–221` filters `effective.filter(d => d.role && !roleExists(d.role))`, emitting
`phases.${d.id}.role: "${d.role}" does not resolve to an installed agent`. The ONLY gap is the bin
calling 2-arg.

**File to edit — `engine/bin/pipeline-resolve.js`** (head + `:81`):
- Current imports (`:2–6`): `readFileSync` from `node:fs`; `parsePipeline`, `resolvePipeline`, `applyCliOverlay`, `parseManifestContent`. Add the FS/path/url imports for the probe (mirror `contract-assemble.js:3–4,10–11`):
  ```js
  import { existsSync } from 'node:fs';            // or add to the existing node:fs import line
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  ```
  (Combine `existsSync` into the existing `import { readFileSync } from 'node:fs';` → `import { readFileSync, existsSync } from 'node:fs';`.)
- Derive the plugin root + build the predicate near the top (after the imports, before/around the arg-parse — module scope is fine, matching `contract-assemble.js:10–11`):
  ```js
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const roleExists = ref =>
    !ref.startsWith('craft:') || existsSync(join(REPO_ROOT, 'agents', ref.slice(6) + '.md'));
  ```
  Rationale pinned in the design: `'craft:'.length === 6`; a craft-native `craft:<role>` resolves IFF `agents/<role>.md` exists at the plugin root (`<root>/agents/`, two levels up from `engine/bin/`); any non-`craft:` (external `my:`/`acme:`) ref STAYS PERMISSIVE (returns `true`) — external-ref "installed" is P14 territory (out of scope). The 8 craft agents: backlog-ticker, designer, docs-writer, planner, refactor-executor, reviewer, part-implementer, validation-triager.
- At `:81`, change `resolution = resolvePipeline(defaults, effectiveManifest);` → `resolution = resolvePipeline(defaults, effectiveManifest, { roleExists });`.
- No walk edit (DC-1a): `run/SKILL.md:186` already routes role-not-found through the existing `ok:false` row. No other bin change.

**Public surface:** `roleExists` is a bin-local `const` — **internal**, not exported. No `engine/src` change, no barrel change, the 7-export surface is untouched.

**Test — extend `engine/test/pipeline-resolve.bin.test.js`** (bin harness: `run(...args)` spawns the bin via `spawnSync(process.execPath, [binPath, ...args])` at `:12–14`; `binPath` `:8`, `pipelinePath` (the real `pipeline/default.yml`) `:9`, `manifestsDir = .../fixtures/manifests` `:10`). Add three `test()` cases + fixtures under `engine/test/fixtures/manifests/`:
- **Fixture `bad-role.md`** (fenced manifest): `phases.implementation.role: craft:plannr` (typo of `planner`). NOTE: a manifest passed via positional path is parsed by `parseManifestContent`, which extracts frontmatter only — so author it fenced (`---`/`---` + body) OR as a bare YAML fixture; mirror the existing `with-body.md` fenced shape. Use a real default phase id (`implementation`) so the descriptor carries the swapped role.
- **Fixture `good-role.md`**: `phases.implementation.role: craft:planner` (a real agent — `agents/planner.md` exists).
- **Fixture `external-role.md`**: `phases.implementation.role: acme:tdd-specialist` (external namespace).
- Test 1 (RED today): `sut(pipelinePath, badRolePath)` → `result.status === 2`; `result.stderr` includes `implementation` and `craft:plannr`. (Today the 2-arg call leaves the probe permissive → exit 0; that is the RED.)
- Test 2 (GREEN-side): `sut(pipelinePath, goodRolePath)` → `result.status === 0` (real craft agent resolves).
- Test 3 (GREEN-side): `sut(pipelinePath, externalRolePath)` → `result.status === 0` (external ref stays permissive).
- **R2/SC1 already covered:** the existing `:18` lean-profile test runs the bare `default.yml` (no swapped role) through the bin and asserts `ok:true` — that is the no-manifest/permissive path; it stays green because every default `role` is `craft:<role>` with `agents/<role>.md` present, so the probe never rejects. Do NOT add a redundant SC1 case.

**Count:** +3 node tests. Bump **`EXPECTED_TESTS` 409 → 412** in `scripts/ci.sh` in this commit.

### TDD steps

- **RED:** add the three fixtures + three tests; run `cd engine && node --test 'test/**/*.test.js'` → Test 1 FAILS (exit 0 instead of 2; the dormant guard is unreachable via the bin's 2-arg call). Tests 2/3 happen to pass already (permissive probe lets everything through) — that is expected; Test 1 is the discriminating RED.
- **GREEN:** add the `roleExists` predicate + pass it as the 3rd arg at `:81`. Test 1 now exits 2 naming the phase+ref; Tests 2/3 still pass for the right reason (real-agent existence / external permissiveness).
- **REFACTOR:** confirm the predicate is a single early-return expression (no nesting); bump `EXPECTED_TESTS` to 412.

### Gate

```
bash scripts/ci.sh
```

`# tests 412` matches the bumped `EXPECTED_TESTS`; SC1 lean-profile bin test green (R2 byte-identical no-swap path); all scenario goldens + bats green; `node engine/bin/pipeline-resolve.js pipeline/default.yml` (the ci.sh step) still exits 0 — the live default pipeline carries only resolvable craft-native roles.

### Commit

```
feat(pipeline-resolve): wire a real roleExists install-probe into the bin
```

---

## Part 4 — s-stryker: Stryker tooling + 3 ADV tests + empty-`procedure` lint guard

### Context

**Shape:** test-infra (Stryker config + deps + ADV suites) carrying ONE real `src` change (ADV-3). ADR-044 exemption applies to the tooling; the `src` guard makes it a legitimate TDD part regardless. Lands AFTER s-glob (reuses its glob) and s-worktree (its `engine/package-lock.json` is the nested lockfile that probe now handles).

**Items:** item 2 (ADRs 047/042; DC-2a `core@8.7.1`, DC-2b `tap-runner@8.7.1`, DC-2c on-demand script, DC-2d=ADR-042 reject empty `procedure` at lint).

**File 1 — `engine/package.json`:** the file today has NO `devDependencies` block (only `dependencies: { js-yaml }`, `scripts: { test, ci }`, `engines: { node: ">=18" }`). CREATE a `devDependencies` block with `@stryker-mutator/core@8.7.1` and `@stryker-mutator/tap-runner@8.7.1` (both declare engines `node >=18`, matching the engine's declared `"node": ">=18"` floor — KEEP `engines` at `>=18`; 9.x would force `>=20`, rejected by ADR-047). Add a `"mutation": "stryker run"` entry to the existing `scripts` block. The `"test"` script already became the glob in s-glob (do NOT re-touch it). Run `npm install` IN THE WORKTREE (`cd engine && npm install`) to add the deps and **REGENERATE `engine/package-lock.json`** (it already exists at 1.2K) — committed, NEVER hand-edited. (Engine deps are already installed in this worktree; `npm install` adds the new devDeps + rewrites the lockfile.)

**File 2 — NEW `engine/stryker.conf.json`:**
```json
{
  "testRunner": "tap",
  "tap": { "testFiles": ["test/**/*.test.js"] },
  "mutate": ["src/**/*.js"],
  "concurrency": 2
}
```
`tap.testFiles` REUSES s-glob's `test/**/*.test.js` glob verbatim. `mutate` is `src/**/*.js` only (bins/tests/helpers excluded). `concurrency` modest. No source change from the config itself.

**File 3 — `engine/src/manifest.js` (ADV-3, the ONLY `src` change in this part):** the shape-check ladder at `:259–273` in `validatePhaseBlock` has, at `:267–268`:
```js
    } else if (field === 'procedure' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.procedure must be a string`);
    }
```
`typeof '' === 'string'`, so `procedure: ""` lint-PASSES today. ADR-042 (DC-2d): reject an empty/whitespace-only procedure at lint. Strengthen the `procedure` branch to ALSO reject `value.trim() === ''` — fail-fast at the boundary (house input-validation rule). Pre-chewed edit (keep mutual-exclusivity of the ladder; the `role`/`model` branches stay string-shape-only — only `procedure` gains the emptiness guard per the design):
```js
    } else if (field === 'procedure' && (typeof value !== 'string' || value.trim() === '')) {
      errors.push(`phases.${phaseName}.procedure must be a non-empty string`);
    }
```
The existing positive test (`manifest.test.js:777` `procedure: 'acme:my-planner'` → ok:true) and negative type test (`:788` `procedure: 42` → ok:false, error includes `phases.planning.procedure` + `string`) STAY GREEN — the new message still contains `phases.planning.procedure` and `string` (the `:797` assertion keys on `.includes('string')`, satisfied by "non-empty string").

**Public surface:** `manifest.js` body-only change (one shape-check predicate + message); `validateManifest` export signature UNCHANGED — **internal** edit. No barrel/export touch. SC1 untouched (no `default.yml` change). `stryker.conf.json` + `package-lock.json` are config/generated, not source.

**Tests (3 ADV closures):**
- **ADV-1 — exactly-one-error count, in `engine/test/scenarios.test.js`** (mirror the S2-neg test at `:302–314`; `resolvePipeline` imported, `loadDefault()`/`loadScenarioManifest()` helpers in scope). Construct a manifest with TWO role-bearing phases — one resolvable, one not — and a probe that rejects ONLY the bad one; assert `result.errors.length === 1` AND the single error names the bad phase. This pins the filter's true-branch COUNT (`resolve.js:216–221`), not just `ok:false`. Construction: build the manifest inline (`{ phases: { planning: { role: 'my:good' }, implementation: { role: 'my:bad' } } }`) and call `sut(defaults, manifest, { roleExists: ref => ref !== 'my:bad' })`; assert `result.ok === false`, `result.errors.length === 1`, `result.errors[0]` includes `implementation` and `my:bad`. (+1 node test.)
- **ADV-2 — producer-content marker, STRENGTHEN the existing S2 producer assertion in `scenarios.test.js:281`.** Today `:281` asserts `hasCI(result, 'Decision-candidates')`. Strengthen to a producer-SPECIFIC marker so a mutated producer fragment is caught: assert the producer's distinctive sentence `hasCI(result, 'Decision-candidates section is mandatory')` (the producer fragment's opening line — `contracts/producer.md:2`). This is an in-place strengthening of an existing assertion — **NOT a new test** (no count change from ADV-2). Verify the marker is present in `REAL_FRAGMENTS.producer` so the test stays green.
- **ADV-3 — empty-`procedure` boundary, in `engine/test/manifest.test.js`** (mirror the procedure type test at `:788–798`; `validateManifest` imported, `ALWAYS_EXISTS` fileExists helper in scope). New test: `phases.planning.procedure: ""` → `result.ok === false` and an error includes `phases.planning.procedure` (+ `string`). (+1 node test.)

**Count:** +2 node tests (ADV-1, ADV-3; ADV-2 strengthens in place). Bump **`EXPECTED_TESTS` 412 → 414** in `scripts/ci.sh` in this commit.

**Mutation run (on-demand, NOT in `ci.sh`):** after GREEN, run `cd engine && npm run mutation` to confirm the three ADV mutants are killed (roleExists filter true-branch via ADV-1; producer-content via ADV-2; empty-`procedure` boundary via ADV-3). This is a confirmation step, not a gate — `ci.sh` stays fast (R4). If a target mutant survives, treat it as a blocker `{ ADV-N, surviving-mutant, ≤3 options }` and surface — do not weaken the gate.

### TDD steps

- **RED:** add ADV-1 (new), ADV-3 (new), and the strengthened ADV-2 assertion. Run `cd engine && node --test 'test/**/*.test.js'`:
  - ADV-3 FAILS today (`procedure: ""` currently lint-passes → `ok:true`, test expects `ok:false`).
  - ADV-1 passes already (the guard exists in `resolve.js`) — it is the COUNT-pinning regression that the mutation run validates; keep it.
  - ADV-2 strengthened assertion: passes today (the producer marker is present) — it tightens the mutant-catch; the mutation run proves it now kills the producer-content mutant.
- **GREEN:** add the empty-`procedure` guard to `manifest.js`; ADV-3 passes. Add the Stryker deps/config + `package-lock.json`. Bump `EXPECTED_TESTS` to 414.
- **REFACTOR:** run `cd engine && npm run mutation`; confirm ADV-1/2/3 mutants die. Ensure `stryker.conf.json` `tap.testFiles` matches the s-glob pattern exactly.

### Gate

```
bash scripts/ci.sh
```

`# tests 414` matches the bumped `EXPECTED_TESTS`; existing procedure type/positive tests (`manifest.test.js:777,788`) green; S2 producer test green with the tightened marker; all goldens + bats + shellcheck green. (The slow `npm run mutation` is run on-demand for confirmation, deliberately NOT part of `ci.sh`.)

### Commit

```
test(engine): stand up Stryker (8.7.1 + tap-runner), ADV-1/2/3, and reject empty procedure at lint
```

---

## Part 5 — s-asm-parse: contract-assemble adopts `parseManifestContent`

### Context

**Shape:** TDD / part-implementer. Independent of every other part (no shared anchor); lands here after the tooling spine.

**Items:** item 9 (ADR-047, DC-9 adopt the shared helper). Item 10 is DROPPED (ADR-045) — NO alias part.

**The bug (pinned):** `engine/bin/contract-assemble.js:95` does `load(readFileSync(args.manifestPath, 'utf8')) ?? {}` on the ENTIRE `.claude/workflow.md` (frontmatter + markdown body). js-yaml throws on any real fenced manifest (a `---` thematic break → `expected a single document in the stream, but found more`; the `with-body.md` fixture → `can not read a block mapping entry…`). The other two bins go through the shared `engine/src/frontmatter.js#parseManifestContent` (`pipeline-resolve.js:6,70`; `manifest-lint.js` via `extractFrontmatter`). `contract-assemble.js` (oldest bin) never adopted it.

**File to edit — `engine/bin/contract-assemble.js`:**
- At `:5` REMOVE `import { load } from 'js-yaml';` from THIS BIN ONLY. ADD `import { parseManifestContent } from '../src/frontmatter.js';` (mirror `pipeline-resolve.js:6`). Confirm `load` has no other use in the bin — verified: `:5` import + `:95` call are the ONLY `js-yaml` uses in the bin. Do NOT remove the `js-yaml` package dependency from `engine/package.json` — `frontmatter.js:53` still uses `load` internally; the bin merely stops importing it directly.
- At `:95`, `manifest = load(readFileSync(args.manifestPath, 'utf8')) ?? {};` → `manifest = parseManifestContent(readFileSync(args.manifestPath, 'utf8')) ?? {};`. `parseManifestContent` sig is `(content: string) => object|null` (`frontmatter.js:50–54`), so the `?? {}` survives (returns `null` for an empty/absent block; downstream `assembleContract(descriptor, manifest, …)` wants an object). Byte-for-byte the `pipeline-resolve.js:70` idiom.
- The `try/catch` at `:94–99` + its `contract-assemble: failed to parse manifest: …` message STAY — it now fires only on a genuinely malformed frontmatter block, not on every well-formed fenced manifest.
- The no-`--manifest` path (`if (args.manifestPath)` guard at `:93`) is UNCHANGED → `manifest = {}` default → SC1-class behaviour identical (R13 regression).

**Public surface:** bin body-only. No `engine/src` change, no export change, the 7-export surface untouched. `assembleContract`'s global `context:` (`contract.js:105–106`) and per-phase `context:` (`:108`, canonical-id lookup) are UNCHANGED — item 10 dropped, so NO `resolveAlias` normalization is added to `contract.js`.

**Test — extend `engine/test/contract-assemble.test.js`** (bin harness: `run(args)` = `spawnSync(process.execPath, [binPath, ...args], { cwd: repoRoot })` at `:11–16`; `binPath` `:8`, `repoRoot` `:9`). The existing `--manifest` test at `:129` only hits the flag-without-value error path — the fenced happy path is unasserted. Add:
- **Test A (RED today):** `sut(['--descriptor-id', 'design', '--manifest', 'engine/test/fixtures/manifests/with-body.md'])` → `result.status === 0`, `result.stdout` includes the assembled core markers (e.g. `never commit on a red gate`, matching the `:26` style). Today the raw `load` throws on `with-body.md` → exit 2 + stderr `failed to parse manifest` — that is the RED. (Path is relative to `repoRoot` since `cwd: repoRoot`; the existing fixture lives at `engine/test/fixtures/manifests/with-body.md`.)
- **Test B (injection live, not just non-throwing):** add a NEW context-bearing fenced fixture `engine/test/fixtures/manifests/with-context.md`:
  ```
  ---
  context: GLOBAL_CONTEXT_SENTINEL
  phases:
    design:
      context: DESIGN_CONTEXT_SENTINEL
  ---

  # Repo workflow
  BODY_SENTINEL prose with a --- thematic break to prove the body never reaches the parser.
  ```
  PINNED SEMANTICS (`contract.js:64` `extractContext`): it INLINES the value verbatim as a string — `if (!value) return ''; if (Array.isArray(value)) return value.join('\n'); return String(value);`. It does NOT read a file. So the literal `context:` string is injected directly into the assembled block. Global `context:` is injected at `:105–106`; per-phase `context:` at `:108–109` keyed by the CANONICAL `descriptor.id` (here `design`). Assertions for `sut(['--descriptor-id', 'design', '--manifest', 'engine/test/fixtures/manifests/with-context.md'])`:
  - `result.status === 0`;
  - `result.stdout.includes('GLOBAL_CONTEXT_SENTINEL')` (global injection live);
  - `result.stdout.includes('DESIGN_CONTEXT_SENTINEL')` (per-phase injection live for the `design` descriptor);
  - `!result.stdout.includes('BODY_SENTINEL')` (the markdown body + its `---` thematic break never reached the parser/output — the whole point of the fix).
- **Test C (regression, R13):** a no-`--manifest` call `sut(['--descriptor-id', 'design'])` → `result.status === 0` byte-identical to today (already covered by `:20`/`:33` — do NOT duplicate; this is noted as the regression guard, not a new test).

**Count:** +2 node tests (Test A + Test B). Bump **`EXPECTED_TESTS` 414 → 416** in `scripts/ci.sh` in this commit.

### TDD steps

- **RED:** add Test A (and Test B's fixture + test). Run `cd engine && node --test 'test/**/*.test.js'` → Test A FAILS (exit 2, stderr `failed to parse manifest` — raw `load` throws on the fenced `with-body.md`).
- **GREEN:** swap `load` → `parseManifestContent` (drop the `js-yaml` import). Test A passes (exit 0, assembled block); Test B passes (parse succeeds, body text absent / injection present per the verified `extractContext` semantics).
- **REFACTOR:** confirm `js-yaml` is no longer imported in the bin; bump `EXPECTED_TESTS` to 416.

### Gate

```
bash scripts/ci.sh
```

`# tests 416` matches the bumped `EXPECTED_TESTS`; the `node engine/bin/...` lint steps green; no-`--manifest` path byte-identical (existing `:20/:33` tests green); all goldens + bats green.

### Commit

```
fix(contract-assemble): parse manifest frontmatter via parseManifestContent (drop raw js-yaml load)
```

---

## Part 6 — s-decisions: cross-candidate interaction prompt (prose)

### Context

**Shape:** prose-only (ADR-044 carve-out — no implementation part to fold into). No RED/GREEN; the gate is `bash scripts/ci.sh` + consistency review.

**Items:** item 6 (ADR-047, DC-6 = new step 2.5 between ratify and ADR-author).

**File to edit — `skills/decisions/SKILL.md`** (full Procedure is `:14–26`). Current numbered steps under `## Procedure`:
- `:18` step 1 — "No decision candidates? Skip honestly…"
- `:20–22` step 2 — "Per candidate: present ≤3 options… capture the user's decision as `<adr-dir>/NNN-<title>.md`… commit each as `docs(adr): NNN <title>`."
- `:23–26` step 3 — "**Scope-fold rule:** if any decision deviates…"

Insert a NEW step BETWEEN the per-candidate capture (step 2) and the scope-fold rule (step 3), per DC-6 (the interaction-check must happen BEFORE ADRs are authored — the scope-fold rule fires AFTER a deviation, too late). Renumber so it reads as a step 2.5 (or renumber 3→4 and make this 3 — keep the existing scope-fold rule's content verbatim, only its number shifts). Content (mirror the imperative, terse house voice of the surrounding steps):

> **N. Cross-candidate interaction check (before authoring ADRs):** once all candidates are ratified and before writing the ADRs, check whether any ratified choice's rationale is voided or altered by another ratified choice (the P9 DC-D-voids-DC-A pattern). If so, re-surface the affected candidate to the user for re-decision before authoring.

(Avoid provenance refs in shipped prose — phrase the example abstractly, e.g. "a later choice can void an earlier one's rationale", without ADR/DC numbers in the skill body. The "P9 DC-D" mention here is plan-internal context, NOT to be copied into the skill text.)

**Surface:** pure prose; no engine/data/lint touch; no `EXPECTED_TESTS` change.

### TDD steps

Prose — no RED/GREEN. Gate is `bash scripts/ci.sh` (confirms the skill change breaks nothing) + a consistency read that the new step is correctly placed between ratify and author, the scope-fold rule's content is preserved verbatim under its shifted number, and no provenance refs (ADR/DC/phase numbers) leaked into the skill body.

### Gate

```
bash scripts/ci.sh
```

Must stay green (the prose edit touches no shell/manifest/engine behaviour — CI confirms no collateral breakage; `# tests` unchanged at 416).

### Commit

```
docs(decisions): add a cross-candidate interaction check before ADR authoring
```

---

## Part 7 — s-echo: trim step 0a brief echo (prose)

### Context

**Shape:** prose-only (ADR-044 carve-out). No RED/GREEN; gate is `bash scripts/ci.sh` + consistency.

**Items:** item 7 (ADR-047, DC-7 = keep the `Input:` line as the single canonical echo).

**File to edit — `skills/run/SKILL.md`.** `$ARGUMENTS` is inlined 3× — `:15` (`Input: $ARGUMENTS`), `:19` ("Parse craft flags from `$ARGUMENTS`"), `:23` ("a flags-only `$ARGUMENTS`"). DC-7 keeps the `:15` `Input:` line (it pairs with the frontmatter `argument-hint` at `:4`) as the single canonical echo; step 0a then refers to "the input" abstractly. Edits:
- `:19` "Parse craft flags from `$ARGUMENTS` first:" → "Parse craft flags from the input first:".
- `:23` "a flags-only `$ARGUMENTS` (e.g. `--profile lean`)" → "a flags-only input (e.g. `--profile lean`)".
- KEEP `:15` `Input: \`$ARGUMENTS\`` unchanged (the single canonical echo).
Behaviour identical — flag-parsing semantics (`--profile`/`--skip` stripping, non-flag remainder = brief, per-invocation precedence ADR-022) are unchanged; only the redundant re-prints of `$ARGUMENTS` become "the input".

**Surface:** pure prose; no engine touch; no `EXPECTED_TESTS` change.

### TDD steps

Prose — no RED/GREEN. Gate is `bash scripts/ci.sh` + a render check that `$ARGUMENTS` appears EXACTLY ONCE in `skills/run/SKILL.md` (the `:15` `Input:` line) and that step 0a's flag-parse semantics read identically.

### Gate

```
bash scripts/ci.sh
```

Green (no behaviour change; `# tests` unchanged at 416). Render check: `grep -c '\$ARGUMENTS' skills/run/SKILL.md` returns 1.

### Commit

```
docs(run): trim step 0a brief echo to a single canonical Input reference
```

---

## Part 8 — s-cadence: document canonical review cadence (prose/doc)

### Context

**Shape:** prose/doc-only (ADR-044 carve-out). No RED/GREEN; gate is `bash scripts/ci.sh` + consistency.

**Items:** item 8 (ADR-043, DC-8 = single `review` phase is canonical; per-part interleave is a documented session working-style; cross-link the Parked-from-P8 walk/parallelism pass).

**File 1 — `skills/run/SKILL.md`:** add a short note (near the orchestration/working-style prose) stating that the ENGINE cadence is the single `review` phase over the whole change (per-dimension convergence — `review/SKILL.md:21,34–35`), and that the per-part "4-dimension review after each code part" is a SESSION working-style/discipline, not an engine invariant; cross-link the later walk/parallelism pass as the home for a future per-part cadence knob (`passes>1` / numeric-convergence parallelism, Parked from P8). Phrase abstractly — no ADR/phase numbers in the shipped prose; refer to "the walk/parallelism pass" by name, not by number.

**File 2 — `BACKLOG.md`:** the cadence item lives at `:278–281` ("**Review cadence — per-part vs single phase.**"); the cross-link target is the Parked-from-P8 entry at `:228` ("Would harden in a later walk/parallelism pass"); the working-style note is at `:289–293`. Record the DECISION on the `:278–281` item: mark it resolved (the canonical cadence = single `review` phase; per-part interleave = documented session working-style; per-part knob deferred to the walk/parallelism pass), cross-linking `:228`. Tick the checkbox `- [ ]` → `- [x]` for that item if the house convention ticks resolved-and-documented items (verify against the file's existing tick style; the docs phase's backlog-ticker normally owns the tick — here the decision is the deliverable, so record the resolution text and leave the formal tick to the docs phase if that is the repo convention).

**Surface:** pure prose/doc; no engine/data/lint touch; no `EXPECTED_TESTS` change.

### TDD steps

Prose — no RED/GREEN. Gate is `bash scripts/ci.sh` + a consistency read that the cadence note in `run/SKILL.md` matches the engine reality (single `review` phase) and the BACKLOG item records the decision + cross-links the walk/parallelism pass, with no provenance numbers leaked into the shipped `run/SKILL.md` prose.

### Gate

```
bash scripts/ci.sh
```

Green (doc-only; `# tests` unchanged at 416).

### Commit

```
docs(run): document single-phase review as canonical, per-part as a session working-style
```

---

## Part 9 — s-planner-heuristic: test-infra/docs-only carve-out (prose)

### Context

**Shape:** prose-only (ADR-044 carve-out). Independent of every other part — gates nothing, nothing gates it. No RED/GREEN; gate is `bash scripts/ci.sh` + consistency.

**Items:** item 11 (ADR-044, DC-11 = prose carve-out; the live planner contract this batch's own planning had to override — item 11 writes the exemption down).

**File 1 — `agents/planner.md:18`** (the Sizing bullet): current text —
> "- Sizing: no standalone test-only parts (fold tests into the part whose code they exercise); a part must earn its agent lifecycle; sequential parts share one working tree and build on each other."

Add an exemption clause keeping the FEATURE-code rule intact, e.g. append: "— EXCEPT test-infra-only and docs-only parts (tooling config, test helpers, fixtures, ADV/property suites with no `src/` delta), which are legitimately test-only and have no implementation part to fold into."

**File 2 — `templates/plan.md:10–14`** (the `## Sizing rules` bullets): current —
> "- ... No standalone test-only parts: coverage/interop/property tests fold into the implementation part whose code they exercise.
> - A part that would be a pure test pass over already-landed code merges into its neighbour."

Add a third bullet (or a clause on the first) carving out test-infra/docs-only parts, mirroring the `agents/planner.md` wording: "- Test-infra-only and docs-only parts (tooling config, test helpers, fixtures, docs/prose) are EXEMPT from the no-test-only rule — they have no implementation part to fold into." Keep the FEATURE-code rule and the merge-into-neighbour rule intact.

DC-11 chose (a) prose; NO `### Kind:` schema flag, NO `plan-lint.sh` branch (those are DC-11 alt (b), rejected). So `scripts/plan-lint.sh` is UNCHANGED.

**Surface:** pure prose; no engine/schema/lint touch; no `EXPECTED_TESTS` change. (Self-note: THIS plan already applies the carve-out — its prose parts ship as test/doc-only per ADR-044; s-planner-heuristic makes that exemption part of the standing contract.)

### TDD steps

Prose — no RED/GREEN. Gate is `bash scripts/ci.sh` + a consistency read that the carve-out clause is present in BOTH `agents/planner.md` and `templates/plan.md`, the FEATURE-code rule is preserved in both, `scripts/plan-lint.sh` is untouched, and no provenance numbers leak into the shipped prose.

### Gate

```
bash scripts/ci.sh
```

Green (prose-only; `plan-lint.sh` schema unchanged; `# tests` unchanged at 416).

### Commit

```
docs(planner): carve out test-infra and docs-only parts from the no-test-only rule
```
