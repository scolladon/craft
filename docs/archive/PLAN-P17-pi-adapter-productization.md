# Plan — P17: Pi adapter productization

> Source: design doc `docs/DESIGN-P17-pi-adapter-productization.md` · ADRs `093, 094, 095`
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

## Ordering and the phase-gate count contract (READ FIRST — every part)

All P17 code lives under `adapters/pi/` (incl. the one allowed edit to
`adapters/pi/src/engine.js`). Two gates apply at every commit:

- **Part gate** (uniform, run by the part-implementer): `cd adapters/pi && node --test 'test/**/*.test.js'`.
  This does NOT check the test count.
- **Phase-boundary gate** (the substrate gate CI runs): `bash scripts/ci.sh`. This
  HARD-ASSERTS `EXPECTED_PI_TESTS` against the live `adapters/pi` count and FAILS on drift.

Because `node --test` is count-blind but `scripts/ci.sh` is not, a part can be part-green
yet phase-red. **Therefore every part that changes the `adapters/pi` test count MUST, in the
same commit, edit `EXPECTED_PI_TESTS` in `scripts/ci.sh` to the exact new total.** The
never-commit-on-red invariant applies to the phase gate too: a commit that leaves
`scripts/ci.sh` red has violated it.

- Baseline before P17: `EXPECTED_PI_TESTS=86` (pinned in `scripts/ci.sh:24`; empirically
  confirmed: `adapters/pi` currently reports `# tests 86`). The `engine/` package
  (`EXPECTED_TESTS=650`) is UNAFFECTED — the `engine.js` P17 edits is the adapter's
  `adapters/pi/src/engine.js`, NOT the `engine/` package; do not touch `EXPECTED_TESTS`.
- The running total threads through the parts below: 86 → 90 → 93 → 98 → 101 → 104 → 109 →
  115 → 122 → 133 → 136. Each part's `### Gate` block restates its exact bump. These targets
  match the `it(...)` cases the plan's TDD steps enumerate. The printed count is the SOURCE OF
  TRUTH: if your RED step lands a different number of cases than the plan predicted (e.g. you
  split or merge a table-driven case), set `EXPECTED_PI_TESTS` to the number `node --test`
  actually prints (`# tests N`) for `adapters/pi`, not the plan's nominal target. Never commit
  with `scripts/ci.sh` reporting a count drift.

Dependencies land before consumers: `engine.js` (part 1), the committed manifest
(part 2), `tool-call-hook.js` (parts 3–4), and `roleless.js` (parts 5–6) all land
before `run.js` (parts 7–9) wires them; `cli.js` + the `bin` field land last (part 10).

> Out of plan (delivered separately, NOT part-gated): `docs/adapters/pi-poc-record.md`
> is refreshed on-demand to record the live 11-phase smoke (ADR-089/090 keep the live Pi
> walk an on-demand smoke, never CI-gated). It is under `docs/`, not `adapters/pi/`, so it
> carries no part gate and no `EXPECTED_PI_TESTS` bump. The design's "Acceptance / runtime"
> bullet is that artifact, handled at integrate-time, not a part here.

## Part 1 — Thread the committed-manifest path through engine.js

### Context

Target: `adapters/pi/src/engine.js` (the one allowed edit to the reused P16 lib).
Test: extend `adapters/pi/test/engine.test.js`.

Current signatures (pinned, engine.js):
- `export async function resolvePipeline()` — `engine.js:55-58`. Body:
  `const stdout = await run('node', [PIPELINE_RESOLVE_BIN, DEFAULT_PIPELINE]); return JSON.parse(stdout);`
- `export async function assembleBlock(phaseId)` — `engine.js:67-74`. Body shells
  `[CONTRACT_ASSEMBLE_BIN, '--descriptor-id', phaseId, '--contracts-dir', CONTRACTS_DIR]`.
- Private `run(file, args)` — `engine.js:34-45`, `execFile` argv-array, non-zero exit rejects
  `new Error(\`{ unit: engine-bin, reason: ${detail} }\`)`. Reused unchanged.
- Module constants: `PIPELINE_RESOLVE_BIN`, `CONTRACT_ASSEMBLE_BIN`, `DEFAULT_PIPELINE`,
  `CONTRACTS_DIR`, `REPO_ROOT` (three levels up from `adapters/pi/src`).

The engine bins ALREADY accept the args (no engine change needed — confirmed by reading):
- `engine/src/pipeline-resolve-main.js` `parseArgs` (lines 47-85): pipeline path is the 1st
  positional, **manifest path is the 2nd positional** (`else if (manifestPath === null) manifestPath = arg`).
- `engine/src/contract-assemble-main.js` `parseArgs` (lines 39-66): `--manifest <path>` flag.

DC-MAN wiring (design §The committed manifest → DC-MAN wiring):
- `resolvePipeline(manifestPath)` → when `manifestPath` is given, append it as positional 2:
  `run('node', [PIPELINE_RESOLVE_BIN, DEFAULT_PIPELINE, manifestPath])`.
- `assembleBlock(phaseId, manifestPath)` → when given, append `['--manifest', manifestPath]`.
- Both args **optional**: the zero-arg call paths stay byte-identical (R-no-sc1 / ADR-086).
  Existing `engine.test.js` zero-arg cases (lines 12-32, 34-61, 63-103, 105-111) MUST stay green.

House style (engine.test.js, pinned): `node:test` `describe/it`, `assert/strict`,
Given/When/Then `it` titles, AAA body, `sut` variable, top-of-file consts
(`REPO_ROOT`, `BLOCKER_MARKER`). `engine.test.js` shells the REAL bins (no DI doubles) — it is
an integration test against `engine/bin/*.js`. Write a fenced manifest fixture to a `mktemp` dir
(`fs.mkdtempSync(join(os.tmpdir(), …))`; state-mutating-probe rule — never write into the worktree;
clean up in `after`/`finally`).

Two PINNED, EMPIRICALLY-VERIFIED observables (probed against the real bins in a throwaway dir — use
these exact RED hooks, they genuinely fail today and pass once the args are threaded):
- **resolvePipeline thread** — a manifest with `pipeline.skip: [refactoring]` drops `effective` from
  **11 → 10** phases (and `refactoring` leaves the id list). Zero-arg resolution = 11 phases. So
  `resolvePipeline(skipManifestPath)` must yield `effective.length === 10`; `resolvePipeline()` yields 11.
  Fixture: `---\ngates:\n  phase: "node --test"\npipeline:\n  skip: [refactoring]\n---\n# probe\n`.
- **assembleBlock thread** — the engine injects the manifest `context:` value **VERBATIM as a string**
  (`engine/src/contract.js` `extractContext` = `String(value)` — it is NOT the file's content; the path
  string itself is appended, and the assemble bin does NOT run `validateManifest`, so the value need not
  reference a real file). So a fixture `context: PI_CTX_MARKER` makes `assembleBlock('implementation',
  ctxManifestPath)` return a block CONTAINING `PI_CTX_MARKER`; `assembleBlock('implementation')` does NOT.
  Fixture: `---\ngates:\n  phase: "node --test"\ncontext: PI_CTX_MARKER\n---\n# probe\n`.

### TDD steps

- RED — add to `engine.test.js`: `it('Given a manifest that skips refactoring, when
  resolvePipeline(manifestPath) is called, then effective has 10 phases and excludes refactoring')` —
  write the skip fixture to a `mktemp` dir, `result = await resolvePipeline(fixturePath)`, assert
  `result.effective.length === 10` and no `effective` entry has `id === 'refactoring'`. Fails today:
  `resolvePipeline()` ignores its arg, so the run is zero-arg → 11 phases, refactoring present.
- RED — `it('Given a manifest with a context value, when assembleBlock(id, manifestPath) is called, then
  the assembled block contains the manifest context value verbatim')` — write the context fixture, call
  `assembleBlock('implementation', fixturePath)`, assert the returned string includes `PI_CTX_MARKER`.
  Fails today: `assembleBlock` drops the 2nd arg, never passes `--manifest`, so the value is never injected.
- RED — `it('Given no manifest path, when resolvePipeline() is called, then effective still has 11
  phases (R-no-sc1 unchanged)')` and `it('Given no manifest path, when assembleBlock(design) is called,
  then it returns a non-empty block (R-no-sc1 unchanged)')` — guard the optional-arg contract. These two
  are already covered in spirit by the existing zero-arg cases (lines 12-32, 34-61); add the explicit
  11-phase guard so the optional-arg contract is pinned by a named test.
- GREEN — edit `resolvePipeline` to accept `manifestPath` and conditionally append the positional;
  edit `assembleBlock` to accept `manifestPath` and conditionally append `['--manifest', manifestPath]`.
  Keep `run` and all constants unchanged.
- REFACTOR — if both call sites grow a conditional-append, extract a tiny local
  `withManifest(args, manifestPath)` helper (<20 lines, immutable: returns a new array). No engine logic.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'` (part gate — must be green).
Phase gate: set `EXPECTED_PI_TESTS` in `scripts/ci.sh` to **90** (86 + 4 new cases:
skip-resolve, context-assemble, 11-phase resolve guard, non-empty assemble guard). Set it to the
printed `# tests N` if your RED count differs. Then `bash scripts/ci.sh` must be green before commit.

### Commit

`feat(pi): thread committed-manifest path through engine resolve and assemble`

## Part 2 — Ship the committed manifest and prove it lint-clean

### Context

This is a data-file + test-infra part (no new `src/` logic): it ships the manifest the bin
will resolve against (part 9) and proves it lint-clean in CI, since the bin does NOT re-lint
at runtime (design §The committed manifest).

Targets:
- NEW `adapters/pi/.claude/workflow.md` — the committed manifest (DC-MAN, ADR-094). It lives
  UNDER `adapters/pi/` so the bin loads it by a module-relative absolute path regardless of
  launch cwd (the `engine.js` `REPO_ROOT` idiom). Exact contents (design §The committed manifest,
  pinned — fenced frontmatter + prose body):
  ```
  ---
  # craft-pi committed manifest — resolves every code-producing phase's gate.
  # No provider/model pinned here (DC-3 passthrough): craft-pi stays provider-neutral.
  gates:
    phase: "node --test"
  ---
  # craft-pi manifest (policy rationale in prose body — never reaches the YAML parser)
  ```
  `gates` accepts EXACTLY `{ part, phase, review-batch }` (`engine/src/manifest.js` `GATE_FIELDS`,
  line 36). No `adapter:` key, no provider/model pin (out of scope; DC-3).
- NEW `adapters/pi/test/manifest.test.js`.

Engine seams the test reuses (read, do not re-implement):
- `parseManifestContent(content)` — `engine/src/frontmatter.js:50-54`. Fenced file → YAML
  frontmatter parsed, prose body ignored (keys on content opening with `---`). Returns object or null.
- `validateManifest(manifest, opts?)` — `engine/src/manifest.js:581-627`. Pure; never throws;
  returns `{ ok, errors[] }`. `opts.fileExists` defaults to "assume present" when omitted — for the
  committed manifest's `gates`-only content there are no file refs, so the default is correct.
- `resolvePipeline` (from `adapters/pi/src/engine.js`, now manifest-aware after part 1) — to prove
  full resolution against the committed manifest yields `ok: true`.

Resolve the manifest path in the test the way the bin will (module-relative absolute):
`join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'workflow.md')` from
`adapters/pi/test/` → `adapters/pi/.claude/workflow.md`. Read it with `readFileSync(path, 'utf8')`.

House style: import `parseManifestContent` from `../../../engine/src/frontmatter.js` and
`validateManifest` from `../../../engine/src/manifest.js` (the test reaches into the engine package,
mirroring how `engine.test.js` reaches the engine bins via `REPO_ROOT`). `node:test`, `assert/strict`,
Given/When/Then, AAA, `sut`, consts.

### TDD steps

- RED — `manifest.test.js`: `it('Given the shipped committed manifest, when parsed, then
  parseManifestContent returns an object with gates.phase')` — read `adapters/pi/.claude/workflow.md`,
  `parseManifestContent(content)`, assert `result.gates.phase` is a non-empty string. Fails: the file
  does not exist yet (readFileSync throws).
- RED — `it('Given the shipped committed manifest, when validated, then validateManifest reports no
  errors')` — `validateManifest(parseManifestContent(content))`, assert `{ ok: true, errors: [] }`.
  Fails until the file exists and is lint-clean.
- RED — `it('Given the committed manifest, when the full pipeline is resolved against it, then ok is
  true and gates.phase is resolvable')` — call `resolvePipeline(manifestPath)`, assert `result.ok ===
  true` (proves the DC-G floor is satisfiable: a non-empty `gates.phase` exists to substitute in part 7).
- GREEN — create `adapters/pi/.claude/workflow.md` with the exact fenced contents above.
- REFACTOR — none expected (data file). Confirm the prose body line is present so the fenced/no-fence
  branch in `parseManifestContent` keys correctly (content opens with `---`).

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **93** (90 + 3: parse, validate, resolve). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): ship committed gate manifest and assert it lint-clean`

## Part 3 — Tool-call hook: Pi-event adapter, fail-safe, veto shape

### Context

NEW module `adapters/pi/src/tool-call-hook.js`; NEW test `adapters/pi/test/tool-call-hook.test.js`.
This part lands the factory + the Pi→guard adapter + the fail-safe try/catch + the exact veto shape.
The symlink re-check is part 4 — in THIS part `symlinkRecheck` is a write-branch passthrough that
returns `{ block: false }` for any tool (so the wrapper compiles and the non-symlink paths are proven),
and part 4 replaces its body with the runtime resolution.

Reused pure predicate (DO NOT modify — R-pure): `toolCallGuard(event)` from
`adapters/pi/src/gate.js:28-40`. Shape it expects: `{ tool, tool_input: { command?, file_path? },
working_dir }` → `{ block: boolean, reason? }`. `WRITE_TOOLS = new Set(['Write','Edit','NotebookEdit'])`
(gate.js:4); reuse the same membership notion in the hook (re-declare a local `WRITE_TOOLS` const in
the hook module — part 4 needs it for the write-branch check; do not import a non-exported const).

Factory shape (design §Tool-call wrapper, pinned):
```
export function toolCallHook(guard = toolCallGuard) {
  return async (event, ctx) => {
    try {
      const guardEvent = adaptPiEvent(event, ctx);
      const verdict = guard(guardEvent);
      if (verdict.block) return verdict;          // { block:true, reason? }
      return await symlinkRecheck(guardEvent);    // part 4 fills this; part 3 = passthrough
    } catch {
      return { block: true };                     // R-failsafe — any throw → block
    }
  };
}
```
`adaptPiEvent(event, ctx)` maps Pi's `tool_call` event to the guard shape. Pinned against
`@earendil-works/pi-coding-agent@0.79.8` (pi-poc-record version): `event.tool ?? event.name` → `tool`;
`event.input ?? event.arguments` → source of `command` / `file_path`; session working dir from
`ctx` (e.g. `ctx.workingDir ?? ctx.cwd`) → `working_dir`. A mapping table, unit-tested with a fixture
event — a field-name mismatch is caught by the fixture, never in production.

Veto shape (gate.md, pinned): exactly `{ block: true, reason? }` — NEVER a `permission: "deny"` field.
`block:false` is returned only by passing the predicate's `{ block:false }` through (after part 4's
re-check clears). The handler is `async` (Pi handler signature is `async (event, ctx) => …`).

House style: model fixtures as top-of-file consts (a `piToolCallEvent` builder like `gate.test.js`'s
`bashEvent`/`writeEvent` helpers, gate.test.js:7-17). `sut = toolCallHook(...)`. Because the handler is
async, tests `await sut(event, ctx)`.

### TDD steps

- RED — `tool-call-hook.test.js`: `it('Given a Pi tool_call event for a bare git diff, when the hook
  runs, then it returns block:true with a reason (delegates to the pure predicate)')` — build a Pi-shaped
  event (`{ name: 'Bash', arguments: { command: 'git diff HEAD~1' }}`, ctx with working dir), `sut =
  toolCallHook()`, assert `(await sut(event, ctx)).block === true` and `typeof result.reason === 'string'`.
  Fails: module does not exist.
- RED — `it('Given a Pi event the predicate clears, when the hook runs, then it returns block:false
  (passthrough through the write re-check)')` — a Read event with an outside path → `{ block: false }`.
- RED — fail-safe: `it('Given a guard that throws, when the hook runs, then it returns block:true
  (fail-safe)')` — `sut = toolCallHook(() => { throw new Error('boom'); })`, assert `block:true`.
- RED — veto shape: `it('Given a blocked event, when the hook runs, then the result has no permission
  field (pinned veto shape)')` — assert `Object.hasOwn(result, 'permission') === false`.
- RED — adapter mapping: `it('Given a Pi event using name/arguments field names, when adapted, then the
  guard receives tool and tool_input.command')` — pass a recording guard double capturing its arg,
  assert it received `{ tool: 'Bash', tool_input: { command: '…' }, working_dir: '…' }`.
- GREEN — implement `toolCallHook`, `adaptPiEvent`, and a passthrough `symlinkRecheck`
  (`async () => ({ block: false })` for now). Local `WRITE_TOOLS` const declared for part 4.
- REFACTOR — keep functions <20 lines; `adaptPiEvent` uses early returns / nullish coalescing, no nesting >2.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **98** (93 + 5). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): add tool-call hook with Pi-event adapter and fail-safe veto`

## Part 4 — Tool-call hook: runtime symlink re-check on the write branch

### Context

Target: `adapters/pi/src/tool-call-hook.js` — replace part 3's passthrough `symlinkRecheck` with the
runtime resolution, and add `resolveExistingAncestorRealpath` (DC-5). Extend
`adapters/pi/test/tool-call-hook.test.js` with a `mktemp` symlink fixture (state-mutating-probe rule:
NEVER the worktree — use `fs.mkdtemp(os.tmpdir() + sep)`).

Why (design §Symlink re-check): `toolCallGuard`'s `guardWritePath` is LEXICAL (`resolve()` + prefix
compare, gate.js:54-63). A symlink whose lexical path is inside the working dir but whose realpath
parent is outside escapes it. The wrapper adds a RUNTIME re-check ONLY on the write branch, only after
the lexical guard already said `block:false`.

Symlink re-check shape (design, pinned):
```
async function symlinkRecheck({ tool, tool_input, working_dir }) {
  if (!WRITE_TOOLS.has(tool)) return { block: false };
  const realWorking = await fs.realpath(working_dir);
  const parent = dirname(resolve(realWorking, tool_input.file_path));
  const realParent = await resolveExistingAncestorRealpath(parent);   // DC-5
  if (realParent === realWorking || realParent.startsWith(realWorking + sep)) return { block: false };
  return { block: true };
}
```
DC-5 — `resolveExistingAncestorRealpath(p)`: `realpath` of a non-existent path throws `ENOENT`. Walk up
to the nearest EXISTING ancestor and `realpath` THAT. A brand-new dir cannot itself be a symlink to
outside (it does not exist yet), so containment of the nearest existing ancestor is sufficient and
correct, and permits the legitimate new-file-in-new-dir case. Implement by catching `ENOENT` and
recursing/looping on `dirname(p)` until `fs.realpath` succeeds (terminates at the filesystem root,
which always exists). Keep <20 lines, early-return, no nesting >2.

Imports: `import { realpath } from 'node:fs/promises'`; `import { resolve, dirname, sep } from
'node:path'`. The fail-safe outer try/catch in `toolCallHook` (part 3) already converts any throw
from `symlinkRecheck` (e.g. an unexpected non-ENOENT `lstat`/`realpath` error) into `{ block: true }`
(R-failsafe) — do not swallow inside `symlinkRecheck`; let it throw to the wrapper.

Test fixtures (design §Symlink re-check test strategy, pinned cases), each in its own `mktemp` dir,
cleaned up in a `finally`/`after`:
- a real symlink `${tmp}/link → /etc` (use `fs.symlink('/etc', join(tmp,'link'))`), then a Write to
  `${tmp}/link/x` with `working_dir = tmp`.
- a write inside `${tmp}/sub/new/x` where `sub/new` does NOT exist yet, `working_dir = tmp`.
- a Read tool with an outside `file_path`, `working_dir = tmp`.

### TDD steps

- RED — `it('Given a Write through a symlink whose realpath escapes the working dir, when the hook
  runs, then it returns block:true (the case the lexical guard misses)')` — build the
  `${tmp}/link → /etc` fixture, Write to `${tmp}/link/x`, `await sut(event, ctx)`, assert `block:true`.
  Fails: part 3's passthrough returns `{ block:false }`.
- RED — `it('Given a Write into a not-yet-existing subdir inside the working dir, when the hook runs,
  then it returns block:false (DC-5 nearest-existing-ancestor is contained)')` — assert `block:false`.
- RED — `it('Given a non-write tool with an outside file_path, when the hook runs, then it returns
  block:false (re-check is write-only)')` — Read event → `block:false`.
- GREEN — implement `symlinkRecheck` (real body) + `resolveExistingAncestorRealpath`. The lexical guard
  in `toolCallGuard` still runs first inside the factory; the re-check only fires on the write branch
  after `block:false`.
- REFACTOR — extract the containment check (`realParent === realWorking || startsWith(realWorking + sep)`)
  into a named helper if it reads clearer; keep immutable, <20 lines.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **101** (98 + 3). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): runtime symlink re-check defeats lexical write-guard escapes`

## Part 5 — Role-less steps: workspace and decisions

### Context

NEW module `adapters/pi/src/roleless.js`; NEW test `adapters/pi/test/roleless.test.js`. This part lands
the two simplest DI'd headless steps; propose + integrate are part 6. Each step is a small DI'd function
so it unit-tests without touching real FS / git / gh (design §Role-less phases; ADR-095).

Export shape: a `rolelessSteps` object (or individual named exports) keyed by phase id — `run.js`
(part 9) calls `deps.rolelessSteps.<id>(...)`. Each step returns a recorded outcome object
`{ ok: boolean, record: string, blocker? }` (immutable). Never an LLM run, never a silent skip.

- `workspace` (DC-WS, ADR-095): assume the bin runs inside an already-prepared checkout. DI a git probe
  (`{ isGitRepo: () => boolean }` or `{ gitProbe }`). If a repo is present → `{ ok: true, record:
  'workspace: using current checkout (bin context)' }`. If absent → blocker `{ ok: false, blocker:
  { unit: workspace, reason: 'no git repository in checkout' } }`. Creates NO worktree (design: worktree
  creation is the launcher's concern; out of scope `--target-dir`).
- `decisions` (DC-DEC, ADR-095): ALWAYS a recorded no-op — `{ ok: true, record: 'decisions: no-op
  (headless) — no interactive user to ratify forks' }`. Never invokes any LLM/spawn double (there is none
  to inject — assert by giving it no spawn dep and proving it still succeeds).

Signature: each step takes a single DI deps bag (e.g. `workspace({ gitProbe })`, `decisions()` or
`decisions({})`), returns the outcome synchronously or as a Promise — pick one shape and keep it uniform
across all four steps (part 6 must match). Recommended: all four `async`, returning a Promise, for a
uniform `await deps.rolelessSteps[id](...)` call site in part 9.

House style: `node:test`, `assert/strict`, Given/When/Then, AAA, `sut`, DI doubles as inline consts
(mirror `probe.test.js`'s `makeFsOps`/`piRunner` double idiom, probe.test.js:11-15).

### TDD steps

- RED — `roleless.test.js`: `it('Given a present git repo, when workspace runs, then ok is true and the
  record notes the current checkout')` — `sut = workspace`, DI a `gitProbe` double returning truthy,
  assert `result.ok === true` and `result.record` mentions "current checkout". Fails: module missing.
- RED — `it('Given no git repo, when workspace runs, then it returns a workspace blocker')` — gitProbe
  returns falsy, assert `result.ok === false` and `result.blocker.unit === 'workspace'`.
- RED — `it('Given the decisions step, when it runs, then it returns a recorded no-op and invokes no
  spawn')` — `sut = decisions`, call with no spawn dep, assert `result.ok === true` and `result.record`
  contains "no-op".
- GREEN — implement `workspace` and `decisions` in `roleless.js`; export `rolelessSteps` (with the two
  keys so far; part 6 adds the rest).
- REFACTOR — factor a tiny `recorded(ok, record, blocker?)` outcome builder if both steps share the
  shape; immutable, <20 lines.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **104** (101 + 3). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): headless workspace and decisions role-less steps`

## Part 6 — Role-less steps: propose and integrate

### Context

Target: `adapters/pi/src/roleless.js` — add `propose` and `integrate` to `rolelessSteps`. Extend
`adapters/pi/test/roleless.test.js`. Match part 5's outcome shape and async/sync choice exactly.

- `propose` (DC-PROP, ADR-095): deterministic push + PR **iff** remote+`gh`+auth are present, else a
  recorded no-op. DI a deps bag, e.g. `{ hasRemote, ghAvailable, ghAuthed, gitPush, ghPrCreate }`
  (predicates + action doubles, argv-array actions, never a shell string — mirrors execFile discipline).
  - All three present → call `gitPush` (`git push -u origin <branch>`) then `ghPrCreate` (PR body from
    the documentation-phase artifact + run record — pass it in via the deps/args) → `{ ok: true, record:
    'propose: pushed + PR created' }`.
  - Any absent → `{ ok: true, record: 'propose: no-op (no remote / no gh / not authed) — work stays on
    the local branch' }`, calls NO push.
  - A push/PR failure (action double throws / non-zero) → blocker `{ ok: false, blocker: { unit:
    propose, reason } }`. Distinguish "no remote configured" (expected no-op) from "push failed" (a real
    blocker) — do not conflate (design DC-PROP rationale).
- `integrate` (DC-INT, ADR-095): STOP-before-merge. Does NOT merge. DI a `ghPrMerge` double and assert
  it is NEVER called. Returns `{ ok: true, record: 'integrate: stopped before merge — a human merges
  (headless safety)' }`. No worktree teardown (the bin did not create the worktree, DC-WS). Auto-merge
  is out of scope (DC-INT default; opt-in flag is a documented future extension).

### TDD steps

- RED — `it('Given remote, gh, and auth all present, when propose runs, then it pushes and creates a
  PR')` — DI all predicates truthy + recording `gitPush`/`ghPrCreate` doubles, assert both called once
  and `result.ok === true`. Fails: propose not implemented.
- RED — `it('Given no remote, when propose runs, then it records a no-op and does not push')` —
  `hasRemote` falsy, assert `gitPush` NOT called and `result.record` contains "no-op".
- RED — `it('Given a push failure, when propose runs, then it returns a propose blocker')` — `gitPush`
  double throws, assert `result.ok === false` and `result.blocker.unit === 'propose'`.
- RED — `it('Given the integrate step, when it runs, then it stops before merge and never calls
  gh pr merge')` — DI a `ghPrMerge` spy, assert it is never called and `result.record` contains
  "stopped before merge".
- RED — `it('Given the integrate step, when it runs, then ok is true (the stop is a success outcome,
  not a blocker)')`.
- GREEN — implement `propose` and `integrate`; add both to `rolelessSteps`.
- REFACTOR — extract the "all three present" predicate into a named helper (`canPropose(deps)`), keep
  early returns, no boolean-param smells, <20 lines.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **109** (104 + 5). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): headless propose (push/PR iff remote) and stop-before-merge integrate`

## Part 7 — run.js: resolveGateCommand placeholder substitution + code-producing floor

### Context

NEW module `adapters/pi/src/run.js`; NEW test `adapters/pi/test/run.test.js`. This part lands ONLY
`resolveGateCommand` (pure) — no spawn, no walk yet. It replicates what the Claude orchestrator does:
turn the engine's literal placeholder gate strings into real commands from the committed manifest (DC-G,
ADR-094; supersedes old DC-8).

Why placeholders persist (design §entrypoint consumes, pinned twice empirically): the engine returns
gate strings as LITERAL placeholders even WITH a manifest — `resolveGate` in `engine/src/gates.js:44-52`
returns `descriptor.gate` first (truthy), and the descriptor gates ARE the literals. Confirmed in
`pipeline/default.yml`: `implementation`/`review`/`refactoring` → `<gates.phase>` (lines 76, 89, 107),
`validation` → `<validation gate>` (line 120), `planning` → `plan-lint` (line 62), `propose` →
`pr.pre-pr-gate` (line 163). So substitution is the bin's job.

`resolveGateCommand(phase, manifest)` substitution table (design §Gate mechanics, pinned):
- `<gates.phase>` → `manifest.gates.phase` (applies to implementation, refactoring, review)
- `<validation gate>` → `manifest.gates.phase` (validation triage gate is the same project gate; engine
  has no distinct `gates.validation` key)
- `pr.pre-pr-gate` → `manifest.pr?.['pre-pr-gate']` (resolves only if the manifest declares it; absent →
  empty/no pre-PR gate)
- `plan-lint` → passes through unchanged (a real engine script the bin can run)
- empty / unrecognized literal → `''`

Source the gate + `codeProducing` from `resolution.gateDecisions` (a LIST, NOT object index): look up
`gateDecisions.find(d => d.phaseId === phase.id)` — it carries the normalized gate (`''` not undefined)
AND `codeProducing`. (design §Five load-bearing facts, fact 1; gates.js `resolveGateDecisions` pushes
`{ phaseId, gate, codeProducing }`, and `propose` additionally carries `awaitingHarnesses[]`.)

Code-producing floor (DC-G, never-commit-on-red): the substitution itself returns the command; the
FLOOR check (empty resolved command on a `codeProducing` phase → blocker) is enforced at the call site
in part 9's walk. In THIS part, prove the substitution + a helper that classifies "empty resolved gate
on a code-producing phase" so part 9 can call it. Recommended: `resolveGateCommand` returns the string;
add a tiny pure helper the floor check uses, OR return `{ command, codeProducing }` — pick the shape
part 9 consumes and document it here. Keep `resolveGateCommand` pure (no I/O); it takes the phase
(with `id`), the parsed `manifest`, and the `gateDecisions` entry (or the whole resolution).

House style: `node:test`, `assert/strict`, Given/When/Then, AAA, `sut`, table-driven cases against a
canned manifest object const (`{ gates: { phase: 'node --test' }, pr: { 'pre-pr-gate': 'make pre-pr' } }`)
and canned `gateDecisions` entries. No DI doubles needed (pure function).

### TDD steps

- RED — `run.test.js`: table-driven `it` per substitution row — `it('Given the implementation phase and
  a manifest with gates.phase, when resolveGateCommand runs, then it returns node --test')`; same for
  refactoring and review (`<gates.phase>`); `<validation gate>` → `manifest.gates.phase`;
  `pr.pre-pr-gate` → `manifest.pr['pre-pr-gate']`; `plan-lint` → `plan-lint`; an empty/unknown literal →
  `''`. Fails: module/function missing.
- RED — `it('Given a code-producing phase whose resolved gate is empty (manifest has no gates.phase),
  when classified, then it is flagged as a floor violation')` — manifest `{}`, implementation
  gateDecisions `{ codeProducing: true, gate: '<gates.phase>' }` → resolved command empty AND
  `codeProducing` true → the floor helper returns true (part 9 turns this into a `{ unit: gate }`
  blocker). Pin the exact observable the floor helper exposes.
- GREEN — implement `resolveGateCommand` + the floor-classification helper in `run.js`. Map-driven
  substitution (a `const SUBSTITUTIONS` object), early returns, immutable.
- REFACTOR — keep the substitution table as a named const map; functions <20 lines; no magic strings
  (name the placeholder literals as consts).

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **115** (109 + 6: 5 substitution rows + 1 floor-classification; if you
split rows differently, set to the printed `# tests N`). Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): resolve gate placeholders from the committed manifest with a code-producing floor`

## Part 8 — run.js: spawnPi and runGate subprocess runners

### Context

Target: `adapters/pi/src/run.js` — add the two subprocess runners `main` (part 9) wires: `spawnPi(argv,
opts)` (the ONE place `pi` is launched) and `runGate(command, opts)` (runs a resolved gate command).
Landing both here gives the REAL defaults unit coverage; part 9 then injects DI doubles for the walk
tests, so the production runners are not left uncovered. Extend `adapters/pi/test/run.test.js`. DI the
spawner (`execFile`) so the options object is asserted without a live `pi`/gate — pass `execFile` (or a
thin `runner`) via the deps bag; the production default is `node:child_process` `execFile`.

Both runners share `engine.js`'s private `run` idiom (engine.js:34-45): Promise-wrapped `execFile`,
argv-array (never a shell string), non-zero exit rejects with a `{ unit: <…>, reason: <stderr|message> }`
blocker error, success resolves stdout.

`runGate(command, opts)` — the resolved gate command (part 7) is a string like `"node --test"`. Split
it into file + args for `execFile` (e.g. `command.split(/\s+/)` → `[file, ...args]`; no shell, no
`shell:true` — R-argv discipline identical to `spawnPi`). Non-zero exit → `{ unit: gate, reason }`
blocker (never-commit-on-red); exit 0 → resolves. `runGate` is the `deps.runGate` default `main` uses for
the gate-before-commit floor (part 9 step f).

Spawn shape (design §Spawn discipline, pinned):
```
execFile('pi', argv, { cwd: opts.cwd, env: opts.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, cb)
```
Pinned discipline (each its own assertion):
- **stdin ignored** (`stdio[0] === 'ignore'` → `/dev/null`): MANDATORY — `pi` hangs on an open stdin
  pipe in `-p` mode (pi-poc-record). The single most failure-prone runtime fact; assert against the
  captured options object of the DI'd `execFile` double.
- **argv array, never a shell string** (R-argv): assert the 2nd arg is the array, and `execFile` (not
  `exec`/`shell:true`) is used. `buildPiArgs` (reused from `execution.js`) already guarantees the prompt
  is one discrete element — `spawnPi` does not re-format it.
- **non-zero exit = blocker**: the callback path rejects with `{ unit: pi-run, reason: <stderr> }`
  mirroring `engine.js`'s `run()` (engine.js:34-45). On success resolves stdout (string).
- **model/provider (DC-3 passthrough)**: `spawnPi` does NOT add `--model`/`--provider` to argv on its
  own; the operator supplies `--provider`/`--model` (+ provider key via child env), which `spawnPi`
  threads through `opts.env`/appended argv per the operator's input. Keep `buildPiArgs` provider-free.

Wrap `execFile` in a Promise as `engine.js`'s private `run` does (engine.js:34-45) — same blocker error
string shape (`{ unit: pi-run, reason: ... }`).

House style: DI the spawner; capture-and-assert the options object (mirror the design's "assert against
the DI'd `execFile` double's captured options"). `node:test`, `assert/strict`, Given/When/Then, AAA, `sut`.

### TDD steps

- RED — `it('Given spawnPi is called, when it launches pi, then stdio[0] is ignore (stdin ignored)')` —
  DI an `execFile` double capturing `(file, args, options, cb)`; `sut = spawnPi`; assert
  `captured.options.stdio[0] === 'ignore'`. Fails: function missing.
- RED — `it('Given spawnPi is called, when it launches pi, then it passes the argv array unchanged and
  the file is pi')` — assert `captured.file === 'pi'` and `captured.args` is the same array reference/value.
- RED — `it('Given pi exits non-zero, when spawnPi runs, then it rejects with a pi-run blocker carrying
  stderr')` — execFile double invokes cb with `(err, '', 'boom')`, assert rejection message contains
  `unit: pi-run` and `boom`.
- RED — `it('Given pi exits zero, when spawnPi runs, then it resolves with stdout')` — cb with
  `(null, 'OUT', '')`, assert resolves to `'OUT'`.
- RED — `it('Given a gate command string, when runGate runs, then it splits the command into file and
  args (no shell)')` — DI `execFile` double, `runGate('node --test', opts)`, assert `captured.file ===
  'node'` and `captured.args` deep-equals `['--test']`.
- RED — `it('Given the gate exits non-zero, when runGate runs, then it rejects with a gate blocker')` —
  cb `(err, '', 'fail')`, assert rejection message contains `unit: gate`.
- RED — `it('Given the gate exits zero, when runGate runs, then it resolves')` — cb `(null, 'ok', '')`,
  assert resolves.
- GREEN — implement `spawnPi` and `runGate` (Promise-wrapped `execFile`, default spawner = real
  `execFile`, overridable via deps for tests).
- REFACTOR — extract the shared Promise/blocker wrapper both runners use (same shape as `engine.js`'s
  `run`); keep each <20 lines, no duplication.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **122** (115 + 7: spawnPi stdin-ignored, argv+file, non-zero-blocker,
resolve-stdout; runGate split, non-zero-blocker, resolve). Set to printed `# tests N` if your RED count
differs. Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): spawnPi and runGate subprocess runners with non-zero exit as blocker`

## Part 9 — run.js: main full 11-phase walk wiring

### Context

Target: `adapters/pi/src/run.js` — add `main(argv, io, deps)`, the full-walk orchestration that wires
everything from parts 1–8 and the role-less steps from 5–6. Extend `adapters/pi/test/run.test.js`. This
is the largest part but is glue + I/O only (no new business logic) — all seams are DI'd, no live `pi`/FS.

`main(argv, io, deps)` (design §Entrypoint shape, pinned):
- `io = { stdout, stderr }` (injected; NEVER `process.*` inside `main`).
- `deps = { resolvePipeline, assembleBlock, spawnPi, runGate, loadManifest, rolelessSteps, env }` —
  defaults wire the real `engine.js` exports (`resolvePipeline`/`assembleBlock` from `./engine.js`),
  the real `spawnPi` and `runGate` (both from part 8 — argv, no shell, non-zero blocks), the real
  manifest load
  (module-relative path to `adapters/pi/.claude/workflow.md` via the `REPO_ROOT` idiom: from
  `adapters/pi/src/run.js`, `join(__dir, '..', '.claude', 'workflow.md')`), and `rolelessSteps` from
  `./roleless.js`.
- Returns a number exit code: `0` = walk completed; `2` = blocker (resolution failed / a worker phase
  exited non-zero / a gate red / an empty gate on a code-producing phase / a role-less step blocked).

Reused (R-reuse): `buildPiArgs`, `parseUsage` from `./execution.js` (execution.js:16, 33). `resolveGateCommand`
+ floor helper (part 7), `spawnPi` + `runGate` (part 8). This part adds NO new subprocess runner — it
only wires the ones already landed; the gate-red tests inject a `runGate` double, the real default is the
one unit-covered in part 8.

Walk algorithm (design §Phase walk, pinned):
1. Load committed manifest (path + parsed object); call `resolvePipeline(manifestPath)`. On
   `resolution.ok === false`: write `resolution.errors` to `io.stderr`, return `2` (spawn nothing, run
   no role-less step).
2. Walk `effective[]` IN ORDER across all 11 phases. Classify each by presence of `role`:
   - **Worker** (has `role`: design, planning, implementation, review, refactoring, validation,
     documentation):
     a. `block = await deps.assembleBlock(phase.id, manifestPath)` (reject = `{ unit: engine-bin }`
        blocker → return `2`).
     b. `gateCmd = resolveGateCommand(phase, manifest, gateDecisionsEntry)` (part 7).
     c. `dynamics = { phaseId: phase.id, model: phase.model, gate: gateCmd, … }`.
     d. `argv = buildPiArgs(block, dynamics, { jsonMode: true })`.
     e. `result = await deps.spawnPi(argv, { cwd, env })`; non-zero `pi` exit (reject) → `{ unit: pi-run }`
        blocker, STOP the walk, return `2` (no later phase runs; no commit on a failed phase).
     f. `parseUsage(result)` → record usage in the run record (DC-6).
     g. **Gate before commit** ONLY when `codeProducing` (implementation, refactoring): run `gateCmd`
        via `deps.runGate`; non-zero → return `2` (never commit on red). EMPTY resolved gate on a
        `codeProducing` phase → `{ unit: gate, reason: 'code-producing phase <id> has no resolvable
        gate — supply gates.phase in the committed manifest' }` blocker, return `2`, BEFORE any commit
        (DC-G floor, part 7's floor helper).
   - **Role-less** (no `role`: workspace, decisions, propose, integrate): call
     `deps.rolelessSteps[phase.id](...)` (NOT `spawnPi`). A step returning `ok:false` (blocker) → surface
     and return `2`.
3. **Harness gates propose** (R-invariants): `validation` (archetype harness, harness-exec) gate must be
   green before the `propose` step pushes/PRs. Enforced by `effective[]` order (validation precedes
   propose) + running validation's resolved gate before reaching the propose step; a red validation gate
   → propose is not reached → `2`. (`validation` is non-code-producing, so its gate is run as the
   propose-gate, not as its own commit gate.)
4. Each committed artifact is the handoff; the next sequential phase reads it (no Pi sub-agents).

`cwd`/`env` for the subprocess runners: `cwd` is the launch checkout (DC-WS — the bin runs inside an
already-prepared checkout). Source it from `deps.env`/an injected cwd, defaulting to `process.cwd()` at
the `cli.js` boundary (part 10) and threaded into `deps` — `main` itself never reads `process.*` (use
the injected value). `env` is the child env carrying any operator-supplied provider key (DC-3 passthrough).

Run record: `main` accumulates a per-phase record (model, gate command, usage, role-less outcome) and
makes it observable to tests (return it alongside the code, or write it to `io.stdout` and assert).

Five load-bearing facts (design, pinned): `gateDecisions` is a LIST (`.find(d => d.phaseId === id)`,
fact 1); the manifest does NOT lift the placeholder in `gateDecisions` (substitution is the bin's job,
fact 2); `effective[i]` for a worker phase carries `id, role, model, gate, archetype, …` (fact 5).

House style: DI everything via `deps`; canned 11-phase resolution object const (mirror the real
`effective[]` order in design §entrypoint consumes lines 66-79); recording spawn/assemble/runGate/
rolelessStep doubles (mirror `probe.test.js` double idiom). `node:test`, `assert/strict`, Given/When/Then,
AAA, `sut = main`.

### TDD steps

- RED — `it('Given a canned 11-phase resolution, when main walks, then the 7 worker phases each call
  spawnPi once in order and the 4 role-less phases call their rolelessSteps double, not spawnPi')` —
  recording doubles; assert spawn called for exactly the 7 worker ids in order and each role-less step
  once. Fails: `main` missing.
- RED — `it('Given resolution.ok is false, when main runs, then it returns 2, writes errors to stderr,
  and spawns nothing')`.
- RED — `it('Given assembleBlock receives the manifest path, when main walks, then the path is threaded
  (DC-MAN)')` — assert the assemble double captured the manifest path arg.
- RED — `it('Given a worker pi exit non-zero, when main walks, then it returns 2 and no later phase
  runs')` — spawnPi double rejects on `implementation`; assert review/refactoring never spawned.
- RED — `it('Given a red gate on implementation, when main walks, then it returns 2 and does not
  commit')` — `runGate` double non-zero for implementation → `2`.
- RED — `it('Given a red gate on refactoring, when main walks, then it returns 2')` — separate
  code-producing phase coverage.
- RED — `it('Given an empty resolved gate on a code-producing phase, when main walks, then it returns 2
  with a unit: gate blocker before any commit')` — manifest with no `gates.phase` → DC-G floor.
- RED — `it('Given a red validation gate, when main walks, then the propose step is not reached and main
  returns 2')` and `it('Given a green validation gate, when main walks, then propose runs')` (R-invariants).
- RED — `it('Given a --mode json stdout fixture, when a worker phase runs, then parseUsage result is
  recorded in the run record per worker phase')` (DC-6) — spawnPi double returns a JSONL usage fixture;
  assert the run record carries the parsed usage.
- RED — `it('Given a role-less step returns a blocker, when main walks, then main returns 2')` —
  workspace double `ok:false`.
- GREEN — implement `main`: load manifest, resolve, classify-and-walk, gate-before-commit, harness-gate-
  propose ordering, usage recording. Extract per-phase handlers (`runWorkerPhase`, `runRolelessPhase`)
  to keep `main` and each handler <20 lines, early returns, no nesting >2.
- REFACTOR — name the worker-phase id set / role-less id set as consts; ensure the run record is built
  immutably (new object per phase appended).

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **133** (122 + 11: walk-order, ok-false, manifest-thread, pi-nonzero,
red-impl, red-refactor, empty-floor, validation-red, validation-green, usage, roleless-blocker). Set to
printed `# tests N` if your RED count differs. Then `bash scripts/ci.sh` green.

### Commit

`feat(pi): main drives the full 11-phase walk with gates and role-less steps`

## Part 10 — cli.js thin bin and the package bin field

### Context

This is a packaging part (the design names `cli.js` "the only un-unit-tested line"). It holds NO logic:
it parses argv, calls `main`, maps the result to an exit code — mirroring the engine thin-bin idiom
(`engine/bin/pipeline-resolve.js:1-7`, `engine/bin/contract-assemble.js:1-7`: shebang, `import { main }
from '../src/...'`, guard on `process.argv[1] === fileURLToPath(import.meta.url)`, `process.exit(...)`).

Targets:
- NEW `adapters/pi/src/cli.js` — shebang `#!/usr/bin/env node`; `import { main } from './run.js'`;
  `import { fileURLToPath } from 'node:url'`; guard `if (process.argv[1] === fileURLToPath(import.meta.url))
  { process.exit(await main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr })); }`.
  `main` is async (part 9) so use a top-level `await` (the module is ESM, `"type": "module"` in
  `adapters/pi/package.json`) or wrap in an async IIFE.
- EDIT `adapters/pi/package.json` — add `"bin": { "craft-pi": "src/cli.js" }` (DC-2, ADR-086). Current
  package.json (pinned): `{ "name": "@craft/adapter-pi", "type": "module", "private": true, "scripts":
  { "test": "node --test 'test/**/*.test.js'" } }`.
- NEW `adapters/pi/test/cli.test.js` — a STRUCTURAL test (the bin is not unit-DI-tested; assert the
  packaging contract). It is a test-infra part (it exercises the packaging, not new src logic), so it
  is legitimately standalone.

The structural test reads files via the module-relative path (`join(dirname(fileURLToPath(import.meta.url)),
'..', ...)` from `adapters/pi/test/`): read `package.json` and `src/cli.js`.

### TDD steps

- RED — `cli.test.js`: `it('Given the pi adapter package, when its bin field is read, then craft-pi maps
  to src/cli.js')` — `JSON.parse(readFileSync('../package.json'))`, assert `pkg.bin['craft-pi'] ===
  'src/cli.js'`. Fails: no `bin` field yet.
- RED — `it('Given the cli entry, when its source is read, then it has the node shebang and imports main
  from run.js')` — read `../src/cli.js`, assert it starts with `#!/usr/bin/env node` and contains
  `from './run.js'`. Fails: file missing.
- RED — `it('Given the cli entry, when its source is read, then it guards on import.meta.url before
  calling process.exit')` — assert it contains the `process.argv[1] === fileURLToPath(import.meta.url)`
  guard (so importing the module does not run it). Fails: file missing.
- GREEN — create `adapters/pi/src/cli.js` with the thin-bin shape; add the `bin` field to
  `adapters/pi/package.json`.
- REFACTOR — none (the file is intentionally minimal); confirm it carries no logic beyond argv→main→exit.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'`.
Phase gate: `EXPECTED_PI_TESTS` → **136** (133 + 3: bin-field, shebang+import, import.meta guard). Set to
printed `# tests N` if your RED count differs. Then `bash scripts/ci.sh` green — this is the final P17
commit, so the full substrate gate must pass clean.

### Commit

`feat(pi): add craft-pi bin entrypoint wiring cli to the full-walk main`
