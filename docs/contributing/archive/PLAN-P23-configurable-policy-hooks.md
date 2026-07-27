# Plan — Configurable policy hooks: always / ask / never

> Source: design doc `docs/DESIGN-P23-configurable-policy-hooks.md` · ADRs `124–130`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Ordering rationale (read first)

Five parts, dependency-ordered so the pure module lands first and each later part builds
on a committed predecessor in the same worktree:

1. **`policy.js` pure module + its full unit suite** (resolvePolicy, mergePolicyScopes,
   DEFAULT_VERDICT, floors-not-nameable, Supersede surface, headless degradation) + the
   `engine/src/index.js` export surface. Everything downstream imports from here.
2. **`validatePolicy`** in `manifest.js` — depends on `POLICY_ACTIONS`/`VERDICTS` from part 1.
3. **Resolve + per-invocation `--policy` flag** in `pipeline-resolve-main.js` — depends on
   `mergePolicyScopes` (part 1) and `validatePolicy` (part 2).
4. **User-file load** (`~/.claude/craft-policy.md`) in `pipeline-resolve-main.js` — depends
   on part 2's validator and part 3's merge wiring (it adds the third/lowest scope).
5. **Docs + orchestrator prose** (port spec `policy.md`, `run/SKILL.md` consult invariant +
   `--policy` flag-strip, the four outward-action skill rewrites) — docs/prose-only, no
   `src/` delta, legitimately standalone; sequenced last so the prose describes shipped code.

### EXPECTED_TESTS reconciliation (the phase-boundary trap — applies to parts 1–4)

`scripts/ci.sh` (the phase-boundary gate, run via `bash scripts/ci.sh`) asserts an EXACT
engine test count: `EXPECTED_TESTS=843` today. Parts 1–4 each ADD tests, so each MUST, **in
its own commit**, update `EXPECTED_TESTS` in `scripts/ci.sh` to the new total. The
forget-proof procedure for every code part:

1. Write the part's tests + code.
2. Run `cd engine && node --test 'test/**/*.test.js' 2>&1 | grep '^# tests'` to read the new
   total `N` the suite now reports.
3. Set `EXPECTED_TESTS=N` in `scripts/ci.sh` (replace the prior literal) in the SAME commit.
4. Confirm with `bash scripts/ci.sh` before committing (it must print no "test count drift").

The per-part gate (`cd engine && node --test 'test/**/*.test.js'`) does NOT check the count,
so the drift only bites at the phase boundary — every code part below restates this in its
Gate block so it is impossible to forget. **`EXPECTED_PI_TESTS=202` does NOT change**: P23
adds no `adapters/pi` test and no pi `src/` delta (pi's `engine.js:resolvePipeline` shells out
to the engine bin and forwards the resolution JSON verbatim, so the additive `Resolution.policy`
field rides through untouched). The starting `EXPECTED_TESTS=843` is the literal that part 1
edits first; parts 2–4 each edit whatever literal the prior part left.

---

## Part 1 — policy.js pure module + unit suite

### Context

**New file `engine/src/policy.js`** — a pure, immutable, no-I/O module. Mirror the discipline
of `engine/src/cli-overlay.js` (pure merge helpers, `Object.freeze` nowhere needed for
internal helpers but frozen for exported constants) and `engine/src/memory.js` (frozen
exported `CONCERNS` via `Object.freeze([...])`, frozen maps via `Object.freeze({...})` — see
`memory.js:50` `CONCERNS`, `memory.js:265` `KEY_FIELDS`, `memory.js:287` `SEVERITY_RANK`).

Exports to add (all frozen where they are data; pure functions otherwise):

- `POLICY_ACTIONS` — `Object.freeze(['isolate','commit','push','propose','integrate','teardown','external-send','backlog-write'])`.
  These are the VCS-port verbs verbatim plus the two non-VCS outward actions (ADR-126, design D2).
- `VERDICTS` — `Object.freeze(['always','ask','never'])` (design D6).
- `DEFAULT_VERDICT` — `Object.freeze({ isolate:'always', commit:'always', push:'ask', propose:'ask', integrate:'ask', teardown:'ask', 'external-send':'ask', 'backlog-write':'always' })`
  (ADR-127, design D6 — per-action default keyed by reversibility; remote/irreversible → `ask`, local reversible → `always`).
- `resolvePolicy(action, effectivePolicy)` → `effectivePolicy[action] ?? DEFAULT_VERDICT[action]`
  (design D2 "Resolution to verdict"). Pure O(1) lookup over the already-merged flat map.
- `mergePolicyScopes(user, project, perInvocation)` → flat `{ action: verdict }` map.
  **Last-scope-wins per action**, precedence `perInvocation > project > user` (design D1 "Scope
  precedence", D3 step 1). Each scope argument is itself a flat `{ action: verdict }` map (NOT the
  three-list YAML shape — normalization from `{ always:[...], ask:[...] }` lists to the flat map is
  `normalizePolicyBlock`, below; this function merges already-flat maps). Implement as
  `{ ...(user ?? {}), ...(project ?? {}), ...(perInvocation ?? {}) }` — a fresh object, inputs
  never mutated (mirror `cli-overlay.js`'s "input never mutated; returned object always freshly
  constructed" discipline). Spread order makes the highest-precedence scope's key win, which is
  exactly last-scope-wins per action.
- `normalizePolicyBlock(block)` → flat `{ action: verdict }` map. Converts the three-list YAML
  shape `{ always:[a,b], ask:[c], never:[d] }` into `{ a:'always', b:'always', c:'ask', d:'never' }`.
  Pure; absent/empty block → `{}`; an absent verdict key contributes nothing. Lives in `policy.js`
  (beside `mergePolicyScopes`, which consumes its output) because it is pure data-shape logic that
  belongs with the merge it feeds; part 3's bin and part 4's user-file load both import it from
  here. **It assumes a VALIDATED block** (no double-verdict — `validatePolicy` in part 2 has already
  rejected those before this runs); a stray double-verdict would simply last-key-wins, which never
  occurs on a validated block. **Public-surface decision: PUBLIC** — added to the `index.js` barrel
  in this part (same gate as the other exports).
- `consult(action, ctx)` → `{ verdict, surface }` (design D5 seam signature). PURE QUERY (CQS —
  never performs the side-effect). `ctx` carries `{ effectivePolicy, binding }` where `binding ∈
  {'claude','pi'}`. Compute `verdict = resolvePolicy(action, ctx.effectivePolicy)`. Map verdict +
  binding → `surface` per the design D4 table:
  - `always` → `surface: 'proceed'` (both bindings).
  - `never`  → `surface: 'refuse'` (both bindings).
  - `ask` + `claude` → `surface: 'ask-then-proceed'`.
  - `ask` + `pi`     → `surface: 'degrade-to-blocker'` (ADR-130 headless degradation; a
    per-invocation `--policy <action>=always` is already folded into `effectivePolicy` upstream,
    so under `pi` a live `ask` means "not pre-approved" → degrade).
  Pre-condition `action ∈ POLICY_ACTIONS` (design D5 pre); an unknown action is a programming
  error here (config-level unknown-action is caught earlier by `validatePolicy`, part 2) — guard
  with an early return/throw consistent with the module's pure style; do NOT swallow.

**`engine/src/index.js`** (current 7-export barrel, all `export { x } from './y.js'` one-liners —
see file) — add `export { resolvePolicy, mergePolicyScopes, normalizePolicyBlock, POLICY_ACTIONS, VERDICTS, DEFAULT_VERDICT, consult } from './policy.js';`.
**Public-surface decision: these symbols are PUBLIC** (the engine `src/index.js` barrel is the
engine's public surface; `validatePolicy` in part 2 and the bin wiring in parts 3–4 import the
named exports from `./policy.js` directly, but the barrel is the documented entry point and must
enumerate them). The barrel is the only surface gate in this repo for engine src exports — there
is no generated API report, no exhaustiveness switch over exports, no separate facade. Adding the
seven names to `index.js` in THIS part pre-pays that gate. (Note: `pipeline/default.yml` is a
frozen surface, but `policy.js` is `engine/src`, not that surface — design D6 confirms.)

**New test file `engine/test/policy.test.js`** — mirror `engine/test/cli-overlay.test.js` exactly:
`import { test } from 'node:test'; import assert from 'node:assert/strict';` then
`import { ... } from '../src/policy.js';`. Style: Given/When/Then test titles, AAA body, `const sut = <fn>;`
first line, one behaviour per test (see `cli-overlay.test.js:7-15`). Cover (design Test strategy):

- `resolvePolicy`: listed action → its verdict (one test per verdict round-trip:
  `always`/`ask`/`never`); unlisted action → its per-action `DEFAULT_VERDICT[action]`
  (e.g. `resolvePolicy('integrate', {})` → `'ask'`; `resolvePolicy('commit', {})` → `'always'`).
- **DEFAULT_VERDICT table pins (ADR-127 safe-by-default premise):** `assert.equal(DEFAULT_VERDICT.integrate, 'ask')`
  and `assert.equal(DEFAULT_VERDICT.commit, 'always')` — the unconfigured-repo-still-confirms-merge guarantee.
- **Floors NOT policy-nameable (R6 / ADR-128):** `assert.ok(!POLICY_ACTIONS.includes('never-commit-on-red'))`,
  same for `'validation-triage-gates-propose'` and `'artifact-handoff'`. Proves no verdict can reach the absolute floors.
- `mergePolicyScopes` precedence (the property-test lens, since this is a merge/precedence pair
  like `applyCliOverlay`): project overrides user for the same action; per-invocation overrides
  both; a scope omitting an action leaves the lower scope's verdict intact; last-scope-wins (not
  union). Add a property test: for arbitrary `{u,p,i}` over `POLICY_ACTIONS × VERDICTS`,
  `resolvePolicy(a, mergePolicyScopes(u,p,i))` equals the verdict from the highest scope naming
  `a`, else `DEFAULT_VERDICT[a]` (quantify with a small enumerated loop, not a fuzz lib — node:test only).
- **Immutability**: inputs never mutated (mirror `cli-overlay.test.js`'s frozen-input assertion);
  result is a fresh object (mutating the result does not touch inputs).
- **Idempotence**: `mergePolicyScopes` of the same scopes twice is `assert.deepEqual` (mirror
  `cli-overlay.test.js` idempotence test).
- **Supersede surface (ADR-128, load-bearing):** `consult('integrate', { effectivePolicy: { integrate:'always' }, binding:'claude' })`
  → `{ verdict:'always', surface:'proceed' }` (an `always` verdict supersedes the former merge
  confirmation — NOT ask-then-proceed). Symmetric test for `propose`.
- **Unconfigured integrate still confirms (safe-by-default):** `consult('integrate', { effectivePolicy: {}, binding:'claude' })`
  → `{ verdict:'ask', surface:'ask-then-proceed' }`.
- **Headless degradation + pre-approval (ADR-130):** `consult('integrate', { effectivePolicy: {}, binding:'pi' })`
  → `surface:'degrade-to-blocker'`; `consult('integrate', { effectivePolicy: { integrate:'always' }, binding:'pi' })`
  → `surface:'proceed'` (pre-approval rode the per-invocation `always` into effectivePolicy upstream).
- **Verdict→surface matrix** for `always`/`never` under both bindings (`proceed`/`refuse`, binding-invariant).
- **`normalizePolicyBlock`**: `{ always:['integrate'], ask:['propose'] }` → `{ integrate:'always', propose:'ask' }`;
  an absent verdict key contributes nothing; empty/absent block → `{}`.

### TDD steps

- RED: write `engine/test/policy.test.js` with all cases above. Run `cd engine && node --test 'test/policy.test.js'`
  — fails: `Cannot find module '../src/policy.js'` (module does not exist yet).
- GREEN: create `engine/src/policy.js` with the frozen constants, `resolvePolicy`, `mergePolicyScopes`,
  `normalizePolicyBlock`, `consult` as specified. Add the seven exports to `engine/src/index.js`. Run the suite — green.
- REFACTOR: extract the verdict→surface mapping into a small frozen lookup table
  (`{ always:'proceed', never:'refuse' }` + the `ask` binding split) if it reads cleaner than a
  switch; keep functions <20 lines, early-return, no magic strings (surface tokens as named consts
  if repeated). Confirm immutability/idempotence tests still pass.

### Gate

- **Part gate:** `cd engine && node --test 'test/**/*.test.js'` (must be green; does NOT check count).
- **EXPECTED_TESTS reconciliation (REQUIRED in THIS commit):** after green, run
  `cd engine && node --test 'test/**/*.test.js' 2>&1 | grep '^# tests'` to read new total `N`, then
  set `EXPECTED_TESTS=N` in `scripts/ci.sh` (replacing `843`). Verify with `bash scripts/ci.sh` — no drift.

### Commit

`feat(engine): policy.js — POLICY_ACTIONS, verdicts, resolvePolicy, mergePolicyScopes, consult`

---

## Part 2 — validatePolicy in manifest.js

### Context

**`engine/src/manifest.js`** — add policy validation, mirroring `validateMemory` (`manifest.js:241`)
and `validateBacklog` (`manifest.js:198`). Three edits:

1. **TOP_KEYS** (`manifest.js:13`, the `Object.freeze(new Set([...]))` listing
   `'backlog','memory','paths','context','gates','phases','pr','scripts','models','pipeline','retrieval','execution','extends'`)
   — add `'policy'` to the set.
2. **New `validatePolicy(policy, errors)`** function (no `fileExists` needed — policy validation is
   config-only, no file refs; signature is `(policy, errors)`). Import `POLICY_ACTIONS` and `VERDICTS`
   from `./policy.js` at the top of `manifest.js` (the file already imports from `./alias-map.js`,
   `./descriptor.js`, `./graph.js` — add `import { POLICY_ACTIONS, VERDICTS } from './policy.js';`).
   **No import cycle:** `policy.js` is pure and imports nothing from the engine (least of all
   `manifest.js`), so `manifest.js → policy.js` is a one-way edge.
   Validation rules (design D6 validator checks, ADR-126/129, R7):
   - Not an object / null / array → `errors.push('policy must be an object { always, ask, never }')` and return
     (mirror `validateMemory`'s `typeof … !== 'object' || === null || Array.isArray` guard at `manifest.js:242`).
   - Each KEY must be in `VERDICTS` → unknown verdict key → `errors.push(\`unknown policy verdict: ${key} (expected one of always, ask, never)\`)`.
   - Each VALUE must be an array → non-list value → `errors.push(\`policy.${key} must be a list of action names\`)`.
   - Each action name in each list must be in `POLICY_ACTIONS` → unknown action → `errors.push(\`unknown policy action: ${name}\`)`.
     (This is also what makes naming an engine floor an error: `'never-commit-on-red'` ∉ `POLICY_ACTIONS`
     → "unknown policy action" — R6 cross-check.)
   - **Intra-scope double-verdict (ADR-129):** an action listed under two verdict keys in the SAME
     block → `errors.push(\`policy action ${name} assigned more than one verdict\`)`. Track seen
     action→verdict across keys; on a second verdict for the same action, push the error. (Cross-scope
     conflicts are NOT errors — those resolve by precedence at merge time, never reach this validator,
     which sees ONE scope's block.)
   - Errors ACCUMULATE (no short-circuit after the first, except the top-level type guard which returns) —
     mirror the accumulate-don't-short-circuit style of `validateMemory`/`validateHarness`.
3. **Dispatch in the switch** (`manifest.js:657`, `validateManifest`'s `switch (key)`) — add a
   `case 'policy': validatePolicy(value, errors); break;` beside `case 'memory'` (`manifest.js:683`).

**Note on the flat-map normalization:** `validatePolicy` validates the THREE-LIST YAML shape
(`{ always:[...], ask:[...], never:[...] }`) and does NOT normalize — the flat `{ action: verdict }`
map is produced by `normalizePolicyBlock` (landed in `policy.js` in part 1, already public on the
barrel). This part's validator works directly on the three-list shape; the normalizer is invoked
later by the bin (part 3) and the user-file load (part 4). No new normalizer decision here.

**Tests — extend `engine/test/manifest.test.js`** (the validator suite; imports
`import { validateManifest, registeredBacklogNames } from '../src/manifest.js';` at top,
`ALWAYS_EXISTS = () => true`). Add a `policy` block mirroring the memory block at `manifest.test.js:1438-1530`,
one behaviour per test, `const sut = validateManifest;`:

- `{ policy: { always: ['integrate'] } }` + ALWAYS_EXISTS → `ok: true`.
- `{ policy: { never: ['nonsense-action'] } }` → error includes `'unknown policy action'`.
- `{ policy: { maybe: ['integrate'] } }` → error includes `'unknown policy verdict'`.
- `{ policy: { always: 'integrate' } }` (non-list) → error includes `'must be a list'`.
- `{ policy: { ask: ['integrate'], never: ['integrate'] } }` (intra-scope double-verdict) → error
  includes `'more than one verdict'` (ADR-129).
- `{ policy: { never: ['never-commit-on-red'] } }` (naming an engine floor) → error includes
  `'unknown policy action'` (R6 — the floor is not in POLICY_ACTIONS).
- `{ policy: 'x' }` (bare string) → error includes `'policy must be an object'`.
- `{}` (no policy block) → `ok: true` (missing policy is NOT an error — engine defaults, R7).

(`normalizePolicyBlock` is already landed and unit-tested in part 1 — this part does not touch it.)

### TDD steps

- RED: add the `policy` validator tests to `manifest.test.js`. Run
  `cd engine && node --test 'test/manifest.test.js'` — fails:
  `unknown top-level key: policy` (TOP_KEYS not yet updated) / `validatePolicy is not defined`.
- GREEN: add `'policy'` to TOP_KEYS, the `validatePolicy` function, the import of
  `POLICY_ACTIONS`/`VERDICTS` from `./policy.js`, and the `case 'policy'` dispatch. Run the suite — green.
- REFACTOR: factor the double-verdict tracking into a small helper if it exceeds the ~20-line
  budget; keep error messages as the literals the tests assert substrings of; no boolean params.

### Gate

- **Part gate:** `cd engine && node --test 'test/**/*.test.js'`.
- **EXPECTED_TESTS reconciliation (REQUIRED in THIS commit):** read the new total via
  `cd engine && node --test 'test/**/*.test.js' 2>&1 | grep '^# tests'` and set `EXPECTED_TESTS` in
  `scripts/ci.sh` to it (replacing part 1's literal). Verify `bash scripts/ci.sh` — no drift.

### Commit

`feat(engine): validate the policy manifest key (verdicts, actions, intra-scope conflict)`

---

## Part 3 — resolve path + per-invocation --policy flag

### Context

**`engine/src/pipeline-resolve-main.js`** — wire policy into the resolve path and add the
per-invocation `--policy <action>=<verdict>` flag. Pin against the real file:

1. **`parseArgs` (`pipeline-resolve-main.js:84`)** currently parses `--profile`, `--skip`, `--harness`
   and returns `{ pipelinePath, manifestPath, profile, skip, harness }`. Add a repeatable `--policy`
   flag, parsed in the `for` loop beside the `else if (arg === '--harness')` branch (`:112`), using
   the same `takeValue(i, arg)` helper (`:91`) and the same grammar-error discipline:
   - Grammar: `--policy <action>=<verdict>`. Split on the FIRST `=` (mirror `--harness`'s `indexOf('=')`
     at `:116`). No `=` → write a grammar-error line to `io.stderr` and `return null` (exit 2). Define
     `const POLICY_GRAMMAR_MSG = 'pipeline-resolve: --policy expects <action>=<verdict>\n';` next to
     `HARNESS_GRAMMAR_MSG` (`:41`).
   - LHS is the action, RHS is the verdict. Validate `action ∈ POLICY_ACTIONS` and `verdict ∈ VERDICTS`
     (import both from `./policy.js`); an unknown action or verdict → a grammar/validation error line
     to stderr and `return null` (exit 2). Message e.g.
     `pipeline-resolve: --policy unknown action/verdict: <token>\n`.
   - Accumulate into a `perInvocationPolicy` object `{ [action]: verdict }` (a flat map — last
     occurrence of an action wins, consistent with last-scope-wins). Initialize lazily like
     `harness = harness ?? []`.
   - Add `perInvocationPolicy` (default `undefined`/`{}`) to the returned object and to the JSDoc
     return type (`:82`).
2. **`main` (`:161`)** destructures `parsed` (`:165`) and, at `:190`, calls
   `applyCliOverlay(manifest ?? {}, { profile, skip, harness })`. AFTER that line (design D5/ADR-125
   "mergePolicyScopes runs in the resolve path right after applyCliOverlay"), compute the effective
   policy and attach it to the resolution:
   - Extract the PROJECT-scope policy from the manifest: `manifest?.policy` is the three-list block;
     normalize it via `normalizePolicyBlock` (from part 1, `./policy.js`) → flat project map (empty
     `{}` when absent). Import `mergePolicyScopes`, `normalizePolicyBlock`, `POLICY_ACTIONS`, `VERDICTS`
     from `./policy.js` at the top of `pipeline-resolve-main.js`.
   - USER scope is added in part 4 — for THIS part, user scope is `{}` (a literal empty map; part 4
     replaces it with the loaded user-file map). Leave a clear seam: `const userPolicy = {}; // part 4: load ~/.claude/craft-policy.md`.
   - `const effectivePolicy = mergePolicyScopes(userPolicy, projectPolicy, perInvocationPolicy ?? {});`
   - Attach as an ADDITIVE top-level field on the resolution AFTER `resolvePipeline` succeeds and
     BEFORE `io.stdout.write(JSON.stringify(resolution, …))` at `:228`:
     `resolution.policy = effectivePolicy;` — but build a fresh object to honour immutability:
     `const withPolicy = { ...resolution, policy: effectivePolicy };` and serialize `withPolicy`.
     This leaves `effective[]`/`record[]`/`gateDecisions[]`/`waivers[]` untouched (ADR-125).
   - **Edge:** when no policy is configured anywhere (`effectivePolicy` is the empty merge `{}`), still
     attach `policy: {}` — a present-but-empty map is the documented "all actions at DEFAULT_VERDICT"
     state (design D1 data shape; `resolvePolicy` falls back to `DEFAULT_VERDICT` per action). The
     orchestrator reads `Resolution.policy` and consults; an empty map means every consult resolves to
     the default verdict. (Do NOT omit the field — the orchestrator always reads it.)

**Tests — extend `engine/test/pipeline-resolve-main.test.js`** (tests `main(argv, io)` with
`makeCaptureIo()` from `../test-helpers/capture-io.js`; helper `writeTmp(name, content)` writes a
manifest to a tmp dir; `pipelinePath` is the real `pipeline/default.yml`; parse stdout JSON as the
Resolution — see `pipeline-resolve-main.test.js:26-42` and the `--harness` grammar tests at `:556-590`).
Add, mirroring the `--harness` grammar test shape, `const sut = main;`:

- `--policy integrate=ask` parses and `Resolution.policy.integrate === 'ask'` (read stdout JSON).
- A project manifest with `policy: { always: [integrate] }` + per-invocation `--policy integrate=ask`
  → `Resolution.policy.integrate === 'ask'` (per-invocation wins over project — ADR-022 precedence).
  Use `writeTmp` to author the manifest fixture inline (frontmatter-fenced `---\npolicy:\n  always: [integrate]\n---\n`).
- A project manifest with `policy: { always: [integrate] }` and NO per-invocation flag →
  `Resolution.policy.integrate === 'always'`.
- No policy anywhere → `Resolution.policy` is present and `{}` (deepEqual empty object); and
  `resolvePolicy('integrate', Resolution.policy)` would be `'ask'` (assert via importing resolvePolicy,
  or assert the empty map directly — prefer asserting `Resolution.policy` deepEquals `{}`).
- Malformed `--policy integrate` (no `=`) → `result === 2` and stderr matches `/--policy expects/`.
- `--policy integrate=maybe` (bad verdict) → `result === 2` and stderr matches the unknown-verdict message.
- `--policy bogus=ask` (bad action) → `result === 2` and stderr matches the unknown-action message.

(The bin integration test `engine/test/pipeline-resolve.bin.test.js` spawns the real bin; you MAY add
one spawn-based smoke `--policy integrate=ask` there too, but the `main`-level tests above are the
primary coverage and keep the suite fast — prefer extending `pipeline-resolve-main.test.js`.)

### TDD steps

- RED: add the `--policy` parse/precedence/grammar tests to `pipeline-resolve-main.test.js`. Run
  `cd engine && node --test 'test/pipeline-resolve-main.test.js'` — fails: `--policy` is treated as an
  unknown option (exit 2 with "unknown option --policy") and `Resolution.policy` is undefined.
- GREEN: add the `--policy` branch to `parseArgs` (with `POLICY_GRAMMAR_MSG` and the
  action/verdict validation), thread `perInvocationPolicy` through `main`, compute `effectivePolicy`
  via `mergePolicyScopes(normalizePolicyBlock(manifest?.policy ?? {}) ...)` with the `userPolicy = {}`
  seam, and attach `policy` to the serialized resolution. Run the suite — green.
- REFACTOR: if the `--policy` parse branch + validation exceeds ~20 lines, extract a
  `parsePolicyToken(value, io) → { action, verdict } | null` helper beside `coerceHarnessValue`
  (`:55`); keep the grammar messages as named consts; no nesting >2 (early-return on each error).

### Gate

- **Part gate:** `cd engine && node --test 'test/**/*.test.js'`.
- **EXPECTED_TESTS reconciliation (REQUIRED in THIS commit):** read the new total and set
  `EXPECTED_TESTS` in `scripts/ci.sh` (replacing part 2's literal). Verify `bash scripts/ci.sh` — no
  drift. Also confirm the full phase gate's tail (`node engine/bin/pipeline-resolve.js pipeline/default.yml`)
  still exits 0 — the additive `policy: {}` field must not break the no-manifest resolve path.

### Commit

`feat(engine): resolve effective policy onto Resolution + per-invocation --policy flag`

---

## Part 4 — user-file load (~/.claude/craft-policy.md)

### Context

**`engine/src/pipeline-resolve-main.js`** — replace part 3's `userPolicy = {}` seam with a real
load of the user-level policy file `~/.claude/craft-policy.md` (ADR-124), validated by the SAME
`validatePolicy` (one validator, two call sites) and normalized by the same `normalizePolicyBlock`,
with the SAME traversal-containment discipline as `memory.js:resolveStorePath` (`memory.js:37-42`).

Pin the read pattern against the real code:

- The file is a Markdown file with a YAML-frontmatter `policy:` block. Parse it with the existing
  `extractFrontmatter` (from `./frontmatter.js` — `manifest-lint-main.js:5` imports it; the parse path
  is `extractFrontmatter(content)` → YAML text → `load(...)` → `{ policy: { always:[...] } }`). Reuse
  `parseManifestContent` from `./frontmatter.js` (already imported at `pipeline-resolve-main.js:7`) — it
  handles the fenced/fence-less decision and returns the parsed object (or null). The user file is
  fenced (frontmatter + body), so `parseManifestContent(content)` yields `{ policy: {...} }`.
- **Path + home resolution, kept testable (no real `~` read in tests):** there is NO existing
  `homedir()` usage in `engine/src` (confirmed by grep) — this is genuinely new ground. Inject the
  user-file READ so tests stay pure, mirroring how `main` injects `io` and `memory.js:load` injects
  `deps.readStore`. Concretely: give `main` an optional third parameter
  `deps = { readUserPolicy }` where `readUserPolicy()` returns the user-file CONTENT string or `null`
  (absent/unreadable). Default it (when `deps`/`readUserPolicy` absent) to a real reader that:
  1. computes `path = join(homedir(), '.claude', 'craft-policy.md')` (import `homedir` from `node:os`,
     `join` already imported `:2`);
  2. applies the traversal-containment check exactly like `resolveStorePath`: resolve the path and
     confirm it stays within `join(homedir(), '.claude')` — a path escaping that root reads nothing
     (returns null). (For the fixed filename this is trivially satisfied; the discipline is encoded so a
     future configurable ref cannot escape — design D6 / ADR-124.)
  3. `readFileSync(path, 'utf8')` wrapped in try/catch → returns `null` on ENOENT/any read error (a
     missing user file is NOT an error — engine defaults, R7; mirror `manifest-lint-main.js:isRegularFile`'s
     swallow-to-false, but here swallow-to-null with the read recorded as "no user policy").
  Update the bin wrapper `engine/bin/pipeline-resolve.js` only if needed — it currently calls
  `main(process.argv.slice(2), { stdout, stderr })`; the new third `deps` param defaults internally, so
  the bin wrapper needs NO change (the production reader is the default). Confirm by reading the wrapper.
- **Validation parity (R7):** after parsing the user file into an object, run
  `validateManifest({ policy: userBlock }, { fileExists: () => true })` and check `.ok`/`.errors` — this
  reuses the SAME `validatePolicy` (one validator, two call sites) WITHOUT needing to export the internal
  `validatePolicy` (the public `validateManifest` is the entry point; add it to the existing
  `import { validatePhases, RESERVED_HARNESS_KEYS } from './manifest.js';` at `pipeline-resolve-main.js:8`
  → `import { validatePhases, RESERVED_HARNESS_KEYS, validateManifest } from './manifest.js';`). `userBlock`
  here is the WHOLE parsed user object `{ policy: {...} }`'s `.policy` value; pass it under a fresh
  `{ policy: userBlock }` so only the policy key is validated (the user file carries only `policy:`). On
  ANY error, `main` writes the errors to `io.stderr` (same diagnostic style as the project-manifest INVALID
  path) and `return 2` — a malformed USER file is a config error before any phase runs, identical to a
  malformed project manifest (design D7). A user file with NO `policy:` block (or absent file) → empty user
  scope `{}`, no error.
- **Merge:** `const userPolicy = normalizePolicyBlock(userBlock ?? {});` then the part-3
  `mergePolicyScopes(userPolicy, projectPolicy, perInvocationPolicy ?? {})` now folds all three scopes
  in the correct precedence (`perInvocation > project > user`).

**Tests — extend `engine/test/pipeline-resolve-main.test.js`** (inject the user-file reader via the
new `deps` third arg so tests are pure — pass `main(argv, io, { readUserPolicy: () => '---\npolicy:\n  never: [integrate]\n---\n' })`):

- User file `never: [integrate]`, no project policy, no flag → `Resolution.policy.integrate === 'never'`.
- User file `never: [integrate]` + project manifest `always: [integrate]` (via `writeTmp`) →
  `Resolution.policy.integrate === 'always'` (project overrides user — precedence).
- User file `never: [integrate]` + project `always: [integrate]` + `--policy integrate=ask` →
  `Resolution.policy.integrate === 'ask'` (per-invocation overrides both — full precedence chain).
- User file absent (`readUserPolicy: () => null`) → `Resolution.policy` is the project/default map; no error.
- Malformed user file (`readUserPolicy: () => '---\npolicy:\n  maybe: [integrate]\n---\n'`, unknown
  verdict) → `result === 2` and stderr names the invalid user policy.
- Traversal/containment is covered by the resolver-returns-null discipline; if the default reader's
  containment helper is extracted as a pure function, add one unit test for it in `policy.test.js` or a
  small helper test (path inside `.claude` → kept; path escaping → null). (Only if extracted as a named
  pure fn — otherwise the injected-reader tests above suffice and a real-FS traversal test is out of scope.)

### TDD steps

- RED: add the user-scope precedence + malformed-user-file tests to `pipeline-resolve-main.test.js`,
  passing the injected `readUserPolicy`. Run `cd engine && node --test 'test/pipeline-resolve-main.test.js'`
  — fails: `main` ignores the third arg, `userPolicy` is still the empty seam, so user-scope verdicts
  never appear in `Resolution.policy`.
- GREEN: add the optional `deps` param + default real reader (with `homedir()` + containment +
  swallow-to-null), the user-file parse via `parseManifestContent`/`extractFrontmatter`, the
  `validatePolicy` parity check (→ exit 2 on error), and wire `userPolicy` into the existing
  `mergePolicyScopes` call (replacing the part-3 `{}` seam). Run the suite — green.
- REFACTOR: extract `loadUserPolicy(deps) → { block, errors }` as a small pure-ish helper (the only
  impure bit is the injected read) to keep `main` readable; keep the containment check as a named helper
  mirroring `resolveStorePath`; no swallowed errors beyond the documented absent-file→null.

### Gate

- **Part gate:** `cd engine && node --test 'test/**/*.test.js'`.
- **EXPECTED_TESTS reconciliation (REQUIRED in THIS commit):** read the new total and set
  `EXPECTED_TESTS` in `scripts/ci.sh` (replacing part 3's literal). Verify `bash scripts/ci.sh` — no
  drift. Confirm `node engine/bin/pipeline-resolve.js pipeline/default.yml` (phase-gate tail) still exits
  0 with the default reader (no real `~/.claude/craft-policy.md` present → null → empty user scope).

### Commit

`feat(engine): load user-scope policy from ~/.claude/craft-policy.md`

---

## Part 5 — policy port spec + orchestrator/skill prose

### Context

Docs-and-prose-only part — NO `src/` delta, NO test, NO `EXPECTED_TESTS` change (legitimately
standalone per the sizing rules; there is no implementation part to fold into because the engine
code already landed in parts 1–4 and this part only describes/wires the seam in prose). This is
design D5 (consult seam) + D6 (port spec) + the orchestrator/skill rewrites.

**1. New `docs/adapters/policy.md`** — the port spec, mirroring `docs/adapters/memory.md` structure
exactly (read it: headers are `# … adapter spec` → `## Port interface` → `## Core policy retained
(NOT port verbs)` → `## Binding set` (`{ claude, pi }`) → `## Claude binding` → `## Pi binding` →
`## Failure → blocker`; see `memory.md:1,3,37,81,85,101,119`). Content to encode:

- **Port interface:** the single read verb `consult(action, ctx) → { verdict, surface }` (design D5
  signature block, including the pre/post: `action ∈ POLICY_ACTIONS`; `ctx` carries the resolved
  `effectivePolicy` + `binding`; CQS-pure — never mutates, never performs the action; post returns
  verdict + surfacing instruction `proceed | ask-then-proceed | refuse | degrade-to-blocker`).
- **Core policy retained (NOT port verbs):** the verdict resolution itself (`resolvePolicy` over the
  flat map), `DEFAULT_VERDICT` per-action defaults (ADR-127), the `POLICY_ACTIONS` vocabulary
  (ADR-126), and the three non-nameable engine floors (never-commit-on-red, validation-triage-gates-
  propose, artifact-handoff) — state explicitly these are NOT in `POLICY_ACTIONS` and no verdict
  reaches them (R6/ADR-128).
- **The `integrate`=merge / `propose`=pr-create alias note** (ADR-126) — operators write
  `always: [integrate]` for auto-merge, `never: [propose]` to forbid PR creation.
- **Binding set `{ claude, pi }`**, then **Claude binding** (the D4 table's `claude` column:
  `always`→proceed+record `POLICY(always:<action>)`; `ask`→`AskUserQuestion` at the seam, approve→
  proceed+`POLICY(ask:<action>→approved)`, decline→`POLICY(ask:<action>→declined)` + recorded
  no-op/blocker per reversibility; `never`→refuse+`POLICY(never:<action>)`) and **Pi binding** (the
  `pi` column: `always`/`never` identical; `ask`→degrade-to-`never` recorded blocker
  `POLICY(degraded:<action>)` UNLESS a per-invocation `--policy <action>=always` pre-approved it,
  ADR-130). Pin the greppable record tokens verbatim (design D4 "Greppable record tokens":
  `POLICY(always:<action>)`, `POLICY(ask:<action>→approved|declined)`, `POLICY(never:<action>)`,
  `POLICY(degraded:<action>)`).
- **Supersede (ADR-128):** `always: [integrate]` supersedes the former hardcoded merge confirmation →
  config-driven auto-merge; safe-by-default because the unconfigured default is `ask` (ADR-127).
- **Custom adapter (documented future seam)** — mirror `memory.md:112` "### Custom adapter
  (documented future seam)": a `custom` policy source is reserved/unbuilt (design Out of scope).
- **Failure → blocker** — mirror `memory.md:119`: CONFIG errors (unknown action/verdict, non-list,
  intra-scope double-verdict, user-file/`--policy` escaping its root) → caught at lint/resolve →
  non-zero exit before any phase (R7); RUNTIME "errors" are verdicts not errors — a `never` refusal is
  a recorded no-op/blocker, a headless unapproved `ask` is a recorded blocker via the `contracts/core.md`
  blocker protocol `{ unit, reason, ≤3 options }` (do NOT restate the protocol — reference it, same as
  `vcs.md`).

**2. `skills/run/SKILL.md`** — two edits:
  - **§0a flag-strip (`run/SKILL.md:19-21`)** currently strips `--profile`/`--skip`/`--harness`. Add
    `--policy <action>=<verdict>` to the stripped/forwarded set (repeatable, may appear lead or trail),
    and forward each occurrence to the bin in §1b (`run/SKILL.md:33-41`) as a separate
    `--policy <action>=<verdict>` argument, in parsed order — exactly as `--harness` is forwarded.
  - **Add a "Policy consult" cross-phase invariant** under `## Cross-phase invariants (non-overridable)`
    (`run/SKILL.md:238`), beside "Artifact is the handoff": *before any phase performs a nameable
    outward action (a member of `POLICY_ACTIONS`), the session calls `Policy.consult(action)` over the
    held `Resolution.policy` + the active binding and obeys the returned surface (`proceed` /
    `ask-then-proceed` via `AskUserQuestion` / `refuse` / `degrade-to-blocker`), appending the matching
    `POLICY(...)` token to the run record.* Note that `Resolution.policy` is held in-session for the run
    beside the `MemoryView` (it arrives on the Resolution parsed in §0 step 1b — cross-reference the
    §1c-mem MemoryView hold at `run/SKILL.md:55` as the structural twin). State the floors stay absolute
    and are not consultable (R6).

**3. Outward-action phase skill rewrites** — each names, in its preamble/procedure, the action(s) it
performs and consults before acting (design D5 "the seam in the orchestrator"):
  - **`skills/integrate/SKILL.md`** — step 2 (`integrate/SKILL.md:17`, currently "**The user confirms
    the merge** — never merge unprompted." then `gh pr merge`): DROP the hardcoded confirmation line;
    replace with: consult the `integrate` action and obey the verdict — `ask` (the default, ADR-127)
    confirms with the user exactly as today, `never` refuses and records `POLICY(never:integrate)` (a
    blocker), `always` proceeds with no confirmation (superseding the former hardcoded stop, ADR-128) —
    then `gh pr merge …`. Step 3 (teardown, `integrate/SKILL.md:22`) — consult `teardown` separately
    (per-verb granularity, ADR-126) before `worktree-teardown.sh`.
  - **`skills/propose/SKILL.md`** — step 2 (`push -u origin`, `propose/SKILL.md:20`) consult `push`;
    step 3 (`pr.creator`, `propose/SKILL.md:21`) — the `pr.creator: user` stop becomes the `propose`
    action's default `ask` verdict; consult `propose` and obey (`always: [propose]` supersedes the
    `user` stop → auto-create the PR, ADR-128; `ask`/default → hand the body to the user; `never` →
    refuse + record).
  - **`skills/workspace/SKILL.md`** — step 2 (`git worktree add` + setup, `workspace/SKILL.md:25`)
    consult `isolate` (default `always`, ADR-127 — proceeds silently unless a policy forbids it).
  - **`skills/documentation/SKILL.md`** — step 2 backlog tick (`documentation/SKILL.md:23`) consult
    `backlog-write` (default `always`); the `source: custom` external `ref` run (`documentation/SKILL.md:27`)
    consult `external-send` (default `ask`). Name both actions in the procedure where they occur.

  Keep each rewrite minimal and diff-scoped — name the action, reference `docs/adapters/policy.md` for the
  surface semantics, do NOT restate the full D4 table in every skill (single source of truth is `policy.md`).

### TDD steps

- This is a docs/prose part — there is NO RED/GREEN/REFACTOR test cycle (no `src/` delta, no engine
  behaviour to test; the engine surface decisions were already tested in parts 1–4). The "verification"
  is editorial/structural:
  - RED (proxy): `docs/adapters/policy.md` does not exist; `grep -n 'Policy consult' skills/run/SKILL.md`
    finds nothing; `grep -n 'confirms the merge' skills/integrate/SKILL.md` still finds the hardcoded line.
  - GREEN: author `docs/adapters/policy.md` mirroring `memory.md`; add the `--policy` strip/forward and the
    Policy-consult invariant to `run/SKILL.md`; rewrite the four skills to name + consult their actions and
    drop the hardcoded merge-confirmation line.
  - REFACTOR: re-read against `memory.md`/`vcs.md` for structural parity (all six section headers present,
    Failure→blocker references the blocker protocol rather than restating it); confirm the greppable
    `POLICY(...)` tokens match design D4 verbatim; confirm no skill restates the full surface table.

### Gate

- **Part gate:** `cd engine && node --test 'test/**/*.test.js'` — trivially green (this part has NO
  engine/`src/` delta and adds NO test; the count is unchanged from part 4). **`EXPECTED_TESTS` is NOT
  touched in this part.**
- **Phase-boundary gate (the meaningful one for this prose part):** `bash scripts/ci.sh` — it runs
  `bats test/`, `shellcheck scripts/*.sh hooks/*.sh`, the pipeline/contracts lints, and the engine/pi
  `node --test` count checks. Run it before the phase closes to confirm the prose edits (port doc,
  `run/SKILL.md`, the four skill rewrites) did not break any bats structural assertion or shellcheck, and
  that both test counts still match (engine = part 4's literal, pi = 202, both unchanged here).

### Commit

`docs(policy): policy port spec + consult seam in orchestrator and outward-action skills`
