# Plan — Craft customizable engine: P1 foundational net + P2 manifest-lint hardening (P3–P5 outlined)

> Source: design doc `docs/DESIGN-customizable-engine.md` (accepted, commit b6a37c0) · ADRs `001–008`
> The plan is the implementation script AND the knowledge handoff. Slice agents start with
> zero context: whatever a slice block omits is paid later as agent rediscovery. `plan-lint.sh`
> enforces the per-slice schema — the plan phase cannot close without it.

## Scope & ordering

This plan **fully slices P1** (the characterization + scenario test net + CI, GREEN before any
abstraction — SC1, SC4) and **P2** (harden `manifest-lint`). P3–P5 are **outlined** at lower
resolution (a non-`## Slice` section `plan-lint` does not gate) because OQ7 makes them
dogfoodable once P1 is green; each may be replanned per-workstream via `/craft:design` +
`/craft:plan`.

Build order (linear, dependency-respecting): `1` (substrate) → `2,3,4` (bash characterization,
mutually independent) → `5,6,7,8,9` (Node core deterministic seams) → `10` (gate/waiver +
scenario capstone) → `11` (P2 hardening). Slices 1–10 = P1; slice 11 = P2.

## Why characterization slices are legitimate here (sizing-rule note)

The template's "no standalone test-only slices" rule targets *feature* TDD — don't write a
test-only slice for code this plan also adds. P1's entire mandate (PRD §13, SC4) is the
opposite: lay a net over **pre-existing, untested** bash (`manifest-lint`, hooks, worktree
scripts) and the new deterministic core. Slices 2–4 pin pre-existing behavior; each earns its
lifecycle (distinct fixtures, distinct script, distinct failure modes). Slices 5–10 are not
test-only — each lands a deterministic function *and* the fixtures that exercise it in one slice
(the fold the rule prescribes). The live orchestrator (`run/SKILL.md`) is **not** rewired in
P1; it keeps its hardcoded 1→11 table. The Node core exists and is unit-green but unconsumed, so
runtime behavior is unchanged — SC1 holds trivially, and the golden fixtures *assert* the
resolver equals today's pipeline so P3's rewire is identical by construction.

## Node core public surface (decided up front — ADR-002)

The deterministic core is one **portable ESM Node module** at `engine/` (`package.json` with
`"type": "module"`; tested by built-in `node --test`, Node ≥18; `js-yaml` the only runtime dep).
The public surface is re-exported from `engine/src/index.js`. The **shape below is frozen by
slice 5** (no later slice may change a signature), but the *file grows incrementally* — each slice
adds **only** its own re-export, never references a module that does not yet exist (a premature
re-export would break that slice's `node --test` gate with `ERR_MODULE_NOT_FOUND`). Slice 5 lands
the first three lines (`parsePipeline`, `validatePipeline`, `ALIAS_MAP/resolveAlias` — the last
stubbed until slice 6); slices 6→9 each wire in their line. Every Node slice that touches the
surface carries a *surface gate* line naming the export it locks.

```js
// engine/src/index.js — END-STATE public surface (signatures frozen at slice 5; file built up across slices 5→9)
export { parsePipeline }            from './descriptor.js' // (yamlText:string) => Descriptor[]   (throws on malformed)   [slice 5]
export { validatePipeline }         from './graph.js'      // (Descriptor[]) => { ok:boolean, errors:string[] }            [slice 5]
export { ALIAS_MAP, resolveAlias }  from './alias-map.js'  // resolveAlias(name:string) => canonicalId:string              [slice 6]
export { resolvePipeline }          from './resolve.js'    // (defaults:Descriptor[], manifest:Manifest) => Resolution     [slice 7]
export { assembleContract }         from './contract.js'   // (descriptor, manifest, fragments, opts) => injectedBlock     [slice 8]
export { normalizeFindings }        from './findings.js'   // (raw:string) => Finding[]                                    [slice 9]
```

Shapes (JSDoc typedefs, no TS — `types > runtime checks` applied via JSDoc + schema validation
at the parse boundary):

- **Descriptor** `{ id, archetype, enabled, contract:string[], procedure, role?, execution, model?, gate?, harness?, consumes:string[], produces:string[], self_supply:string[] }` — `contract` is normalized to a list (ADR-006); `enabled` defaults `true`; `execution` defaults `agent`.
- **Manifest** the parsed `.claude/workflow.md` frontmatter object (`pipeline`, `retrieval`, `execution`, `phases`, `models`, `gates`, …) — read-only input; the core never parses the markdown body.
- **Resolution** `{ effective:Descriptor[], waivers:Waiver[], gateDecisions:GateDecision[], record:string[] }` — `effective` is the walked order; `waivers` records every skip/disable that releases a propose-gate (ADR-005); `gateDecisions` is the per-phase resolved gate + the code-producing floor; `record` is the human-readable run-record lines.
- **Finding** `{ file, line, severity, finding, fix }` — the canonical field set consumers key on, never on layout (R10).

CLI entrypoints (ADR-002), added with the slice that first needs them:
`engine/bin/pipeline-lint.js <default.yml> [manifest]` (validate; exit 0/2 — slice 5) and
`engine/bin/pipeline-resolve.js <default.yml> [manifest]` (emit effective Resolution as JSON —
slice 10). These are the seams the orchestrator/CI invoke; the orchestrator wiring is P3.

## Gates (no manifest → probe-derived)

craft ships **no** `.claude/workflow.md`, so gates resolve by capability probe, not `gates.slice`:
- **Node slice** → `node --test engine/test/<file>.test.js` (targeted).
- **Bash slice** → `bats test/<file>.bats` + `shellcheck <touched .sh>`.
- **Phase-boundary gate (P1 close, run once):**
  `node --test engine/ && bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml` — the GitHub Actions workflow grows into this exact command: slice 1 commits the substrate legs (`node --test`, `bats`, `shellcheck`), slice 5 appends `pipeline-lint` (binary now exists), slice 10 appends `pipeline-resolve`. CI is never red on a not-yet-created binary.
Never commit on a red gate; never `--no-verify` (the repo's own `block-no-verify` hook forbids it).

## Slice 1 — Test-harness substrate + CI + shellcheck baseline

### Context
Walking skeleton for the whole net; nothing tests product logic yet beyond a smoke assertion,
but it lands the gate substrate every later slice rides and brings existing bash to
shellcheck-clean (real GREEN). No `engine/`, `test/`, `.github/` exist (probed absent).
- **Create** `engine/package.json` → `{ "name":"@craft/engine", "type":"module", "private":true, "engines":{"node":">=18"}, "scripts":{"test":"node --test"}, "dependencies":{"js-yaml":"^4.1.0"} }`. Add `engine/.gitignore` for `node_modules/`.
- **Create** `engine/test/smoke.test.js` — one `node:test` (`import { test } from 'node:test'; import assert from 'node:assert/strict'`) asserting `1+1===2`, proving the runner + ESM resolution work.
- **Create** `test/smoke.bats` — `bats-core` smoke (`@test "bats runs" { run true; [ "$status" -eq 0 ]; }`); confirms bats on PATH (verified: `/opt/homebrew/bin/bats`).
- **Create** `.github/workflows/ci.yml` — on push/PR: checkout; `actions/setup-node@v4` (node 22); `cd engine && npm ci`; install `bats` (`bats-core/bats-action` or `npm i -g bats`) + `shellcheck` (`ludeeus/action-shellcheck` or apt) + `jq`/`yq`. **Run only the substrate gate at this slice** — `node --test engine/ && bats test/ && shellcheck scripts/*.sh hooks/*.sh`. The `pipeline-lint`/`pipeline-resolve` steps are **added to the workflow in slices 5 and 10** when those binaries first exist, so CI is never red on a non-existent file through slices 2–4 ("never commit on a red gate" stays literally true). Single `ci` job, fail-fast.
- **shellcheck baseline**: run `shellcheck scripts/*.sh hooks/*.sh` against **every** file the gate glob matches — `scripts/{manifest-lint,plan-lint,worktree-setup,worktree-teardown}.sh` + `hooks/{block-no-verify,git-no-ext-diff}.sh` (note `scripts/*.sh` includes `plan-lint.sh`); fix every finding minimally (or annotate with a justified `# shellcheck disable=...` carrying a why-comment). These are touched-but-behavior-preserving edits — pin the parsers under slices 2–4 next.
- **Surface gate**: this slice fixes the repo layout invariant `engine/` = Node home, `test/` = bats home, `.github/workflows/ci.yml` = the single CI mirror of the phase gate. Later slices add files under these, never relocate them.

### TDD steps
- RED: `npm ci` + `node --test engine/` + `bats test/` + `shellcheck scripts/*.sh hooks/*.sh` all fail/missing (no package, no runner config, latent shellcheck findings).
- GREEN: add `engine/package.json` + smoke tests + CI workflow; clear/annotate every shellcheck finding on existing scripts until `shellcheck scripts/*.sh hooks/*.sh` exits 0; both smoke suites pass.
- REFACTOR: factor the substrate gate into a shared definition (`engine/package.json` `scripts.ci` or `scripts/ci.sh`) so CI and local share one string; slices 5/10 append the `pipeline-lint`/`pipeline-resolve` steps to that one definition (it grows with the binaries, never references them ahead of their creation).

### Gate
`node --test engine/ && bats test/ && shellcheck scripts/*.sh hooks/*.sh`

### Commit
`test(harness): node:test + bats runners, shellcheck-clean, CI skeleton`

## Slice 2 — Characterize `manifest-lint.sh` (valid/invalid + historical regressions)

### Context
Pins `scripts/manifest-lint.sh` (read in full) behavior as the SC4 regression net **before** P2
rewrites its parser. Key current behavior to lock: exit 0 + `"$MF valid."` on a good manifest;
exit 2 + `"INVALID manifest"` + bullet list on a bad one; exit 0 with a "pure defaults" note when
the file or frontmatter is absent (lines 13–23). The two historical bugs are *already fixed* by
the `¦` comma-protection (lines 68–70 and 99–101) — this slice locks that they stay fixed.
- **Create** `test/manifest-lint.bats` invoking `scripts/manifest-lint.sh <fixture>` with `run`, asserting `$status` + `$output` substrings.
- **Create fixtures** under `test/fixtures/manifest/`:
  - `valid-basic.workflow.md` — frontmatter using `backlog paths context gates phases pr scripts models` (the `TOP_KEYS`, line 25) with simple values → expect exit 0.
  - `valid-inline-array.workflow.md` — an inline map carrying a **comma-bearing array**, e.g. `gates: { phase: "a && b", review-batch: [x, y, z] }` and `phases: { review: { context: [a.md, b.md] } }` → exercises the comma-protection; expect exit 0 (this is the regression #1 fixture).
  - `valid-quoting.workflow.md` — quoted values containing `#`, `:` and spaces (regression #2 — comment-strip / quote handling) → expect exit 0.
  - `invalid-unknown-top-key.workflow.md` → `"unknown top-level key"`, exit 2.
  - `invalid-unknown-phase.workflow.md` → `"unknown phase"`, exit 2.
  - `invalid-skip-protected.workflow.md` (`phases: { plan: { skip: true } }`) → `"skip: is refused on protected phase"`, exit 2 (line 109/117; this behavior is **retained at P1**, removed only at P3 when the graph replaces `PROTECTED`).
  - `invalid-dangling-file.workflow.md` (`context: ./nope.md`) → `"references missing file"`, exit 2.
  - `absent` case: point the script at a non-existent path → exit 0 + `"no manifest"`.
- Use `craft`'s own repo as `ROOT` resolution context, or set fixtures self-contained with referenced files present/absent as needed (note `check_one_file` resolves against `ROOT=dirname(dirname(MF))` and CWD — place referenced files accordingly under the fixture dir).

### TDD steps
- RED: no `test/manifest-lint.bats` — `bats test/manifest-lint.bats` errors (missing file).
- GREEN: add the bats file + fixtures; every assertion passes against the **current** script (characterization — no production change expected). If any case reveals a latent discrepancy, fold the minimal fix here and note it in the commit body-less message scope.
- REFACTOR: extract a `run_lint` bats helper (`load`-ed) to DRY the `run scripts/manifest-lint.sh ...` boilerplate.

### Gate
`bats test/manifest-lint.bats && shellcheck scripts/manifest-lint.sh`

### Commit
`test(manifest-lint): characterize valid/invalid incl. comma+quoting regressions`

## Slice 3 — Characterize the PreToolUse hooks (deny/allow matrices)

### Context
Pins `hooks/block-no-verify.sh` and `hooks/git-no-ext-diff.sh` (both read in full) — synthetic
PreToolUse JSON on stdin, assert the emitted decision.
- `block-no-verify.sh`: reads stdin JSON, `jq -r '.tool_input.command'`; on a `git commit|push|merge … --no-verify` emits `permissionDecision:"deny"` JSON and exit 0; otherwise bare exit 0 with no output.
- `git-no-ext-diff.sh`: lets through commands already carrying `--no-ext-diff` or `rtk proxy` (exit 0, no output); on a scripted `git diff`/`git show` (incl. global opts `-C`, `-c`, `--git-dir=`, `--work-tree=`) emits `deny` JSON whose `permissionDecisionReason` ends with the corrected `… --no-ext-diff …` command; does **not** match `git stash show`, `git show-ref`, `git difftool`.
- **Create** `test/hooks.bats` feeding fixtures via stdin: `printf '%s' "$json" | run hooks/<hook>.sh`. Assert `$status -eq 0` and parse `$output` with `jq -r '.hookSpecificOutput.permissionDecision'`.
- **Create fixtures** under `test/fixtures/hooks/` (one JSON per case) or build inline heredocs:
  - block-no-verify: `git commit -m x --no-verify` → deny; `git push --no-verify` → deny; `git commit -m x` → allow (empty); non-git `npm test` → allow.
  - git-no-ext-diff: `git diff HEAD~1` → deny + reason contains `git diff --no-ext-diff HEAD~1`; `git -C /x show abc` → deny + corrected; `git diff --no-ext-diff x` → allow; `git stash show` → allow; `rtk proxy git diff` → allow.
- Requires `jq` on PATH (already used by the hooks; CI installs it).

### TDD steps
- RED: no `test/hooks.bats` — `bats test/hooks.bats` errors.
- GREEN: add the bats file + fixtures; assertions pass against current hooks (characterization). Any reason-string mismatch → fix the test to the real bytes (the hook is the SoT) or fold a minimal hook fix + note.
- REFACTOR: a `decision()` bats helper that pipes a json fixture through a named hook and echoes the parsed `permissionDecision`.

### Gate
`bats test/hooks.bats && shellcheck hooks/block-no-verify.sh hooks/git-no-ext-diff.sh`

### Commit
`test(hooks): characterize no-verify + no-ext-diff deny/allow matrices`

## Slice 4 — Characterize worktree setup/teardown (install + lock protocol)

### Context
Pins `scripts/worktree-setup.sh` and `scripts/worktree-teardown.sh` (both read in full) — the VCS
adapter the design names (SP8). The valuable, deterministic behavior is the **teardown lock
protocol**; setup's lockfile-detection branch is characterizable without a real package install.
- `worktree-setup.sh <wt> [post]`: picks an installer by lockfile (`package-lock.json`→npm, `pnpm-lock.yaml`→pnpm, … `composer.lock`→composer); with **no** recognized lockfile prints `"no recognized lockfile/manifest — dependency install skipped (noted)."` and exit 0; runs `[post]` if given.
- `worktree-teardown.sh <main> <wt> [--pre-teardown s] [--force]`: reads `<wt>/.craft-mutation.lock` = `"<pid> <iso>"`; **live** PID without `--force` → exit 3 + `"REFUSED — mutation run alive"`; live PID with `--force` → clears lock + `"FORCED past live mutation run"`; **dead** PID → `"stale lock … auto-cleared"` + proceeds; then `git worktree remove` + branch delete (guarded against `main`/`master`).
- **Create** `test/worktree.bats` with a `setup()` building a throwaway git repo + worktree in `$BATS_TMPDIR` (`git init`, `git worktree add`), and `teardown()` cleaning it.
- Fixtures/cases:
  - setup: empty dir (no lockfile) → exit 0 + "skipped (noted)"; dir with a `package-lock.json` but stub `npm` on a shimmed `PATH` (or assert only the branch chosen via a dry-run flag) — prefer asserting the **no-lockfile** + **post-script-runs** branches to avoid network/installs.
  - teardown live-lock refusal: write `.craft-mutation.lock` = `"$$  <ts>"` (current shell PID, guaranteed live) → exit 3, REFUSED; with `--force` → exit 0, FORCED, lock gone.
  - teardown stale-lock: write a dead PID (e.g. `999999`) → "auto-cleared", worktree removed.
- Note: `kill -0 "$PID"` (line 28) drives liveness; use `$$` for live, an unused high PID for dead.

### TDD steps
- RED: no `test/worktree.bats` — `bats test/worktree.bats` errors.
- GREEN: add the bats file + the git-repo `setup()`/`teardown()`; assert the no-lockfile, post-script, live-refuse, force, and stale-clear paths against current scripts.
- REFACTOR: extract a `mk_worktree` helper; keep each `@test` to a single behavior (object-calisthenics one-assertion intent).

### Gate
`bats test/worktree.bats && shellcheck scripts/worktree-setup.sh scripts/worktree-teardown.sh`

### Commit
`test(worktree): characterize setup install branch + teardown lock protocol`

## Slice 5 — Engine module: descriptor parse + default pipeline data + graph validation

### Context
Introduces `engine/` and **freezes the public surface** (above). Lands the deterministic
descriptor parser, the canonical default pipeline as YAML data, and the graph validator — the
SC1 *data* characterization (the default list encodes today's pipeline exactly).
- **Create** `pipeline/default.yml` — the **13-descriptor** default list (11 enabled + 2
  default-off). The DESIGN §"Phase descriptor schema" table (lines ~183–196) carries only **8** of
  the fields; the design's bundle table (lines 308–316) and the agent frontmatter pins supply the
  rest. **Enumerated here so the slice agent never re-derives** (concern-named `id`s; `execution`
  omitted → defaults `agent`; **`model` omitted by design** — the descriptor default is "the role's
  frontmatter pin," resolved by the Model port, *not* carried in the data nor read by the Node core
  at P1; `procedure`/`role` are **concern-named to-be refs** — the Node core validates structure,
  **not** skill/agent file existence, so the still-old skill dirs + the `validation-triager` agent
  rename land at P4 and the `requirements-writer`/`architecture-triager` agents at P10 without
  blocking this data):

  | `id` | `archetype` | `enabled` | `contract` (atop implicit `core`/U) | `procedure` | `role` | `consumes` | `self_supply` | `produces` | `gate`/`harness` |
  |---|---|---|---|---|---|---|---|---|---|
  | `workspace` | setup | true | `[]` | `craft:workspace` | — | — | — | `workspace` | — |
  | `requirements` | specification | **false** | `[producer]` | `craft:requirements` | `craft:requirements-writer` | `workspace` | — | `requirements` | — |
  | `design` | specification | true | `[producer]` | `craft:design` | `craft:designer` | `workspace, requirements` | `requirements` | `design` | — |
  | `decisions` | specification | true | `[]` | `craft:decisions` | — *(session-owned)* | `design` | `design` | `decisions` | — |
  | `planning` | specification | true | `[producer]` | `craft:planning` | `craft:planner` | `design, decisions` | `design, decisions` | `plan` | `plan-lint` |
  | `implementation` | construction | true | `[construction]` | `craft:implementation` | `craft:slice-implementer` | `workspace, plan` | — | `change` | `<gates.phase>` |
  | `review` | harness | true | `[harness-read]` | `craft:review` | `craft:reviewer` | `change` | — | `review-report` | `<gates.phase>` per round |
  | `refactoring` | refinement | true | `[]` | `craft:refactoring` | `craft:refactor-executor` | `change` | — | `change` | `<gates.phase>` |
  | `validation` | harness | true | `[harness-exec]` | `craft:validation` | `craft:validation-triager` | `change` | — | `validation-report` | `<validation gate>` · `harness: {tool: stryker, scope: per-hunk}` |
  | `architecture` | harness | **false** | `[harness-exec]` | `craft:architecture` | `craft:architecture-triager` | `change` | — | `architecture-report` | `<arch gate>` · `harness: {tool: dependency-cruiser}` |
  | `documentation` | delivery | true | `[delivery]` | `craft:documentation` | `craft:docs-writer` *(+`craft:backlog-ticker`)* | `design, change` | — | `docs` | — |
  | `propose` | delivery | true | `[delivery]` | `craft:propose` | — *(session-owned)* | `change` | — | `pr` | `pr.pre-pr-gate` |
  | `integrate` | delivery | true | `[delivery]` | `craft:integrate` | — *(session-owned)* | `pr` | — | — | — |

  Bundle mapping resolves the design's `harness`-archetype ambiguity explicitly: **`review` →
  `[harness-read]`**, **`validation`/`architecture` → `[harness-exec]`** (design lines 313–314);
  producers (`design`/`requirements`/`planning`) → `[producer]`; `implementation` → `[construction]`
  (the design scopes `construction` to "implementation slices" only — line 312); the `delivery`
  cluster → `[delivery]`; `workspace`/`decisions`/**`refactoring`** carry only the implicit U
  (`[]`). **`refactoring` is deliberately U-only:** the design bundle table provides **no**
  `refinement` bundle, and the construction bundle's RED→GREEN/test-authoring contract is *wrong*
  for a behavior-preserving phase (cf. `agents/refactor-executor.md` — no RED→GREEN, gate stays
  green). Its behavior-preserving discipline stays **agent-side role craft** at P5 (only invariant
  contract relocates; role-specific craft stays in the thin agent). A future `refinement` bundle,
  if wanted, is a design follow-up — not asserted here. **Model→pin reference** (the Model port resolves these from agent
  frontmatter downstream — listed for traceability + slice-10 S8, *not* stored in the data):
  designer/planner/reviewer = `fable`; slice-implementer/refactor-executor/validation-triager
  (today `mutation-triager`)/docs-writer = `sonnet`; backlog-ticker = `haiku`.
- **Append** `node engine/bin/pipeline-lint.js pipeline/default.yml` to the shared CI definition
  (`scripts.ci` / `.github/workflows/ci.yml`) — the first engine binary now exists, so CI starts
  mirroring it here (slice 1 deferred this step until the binary existed).
- **Create** `engine/src/descriptor.js` → `parsePipeline(yamlText)`: `js-yaml` `load`, then per
  entry apply defaults (`enabled:true`, `execution:'agent'`, list-normalize `contract`, default
  `consumes/produces/self_supply` to `[]`), validate required fields (`id, archetype, contract,
  procedure`) and the `archetype` enum (`setup|specification|construction|harness|refinement|
  delivery`) — **throw** a descriptive error on violation (no silent coercion). Pure, returns a
  new frozen array (immutable).
- **Create** `engine/src/graph.js` → `validatePipeline(descriptors)`: returns `{ok, errors[]}`
  checking — unique `id`s; `self_supply ⊆ consumes`; every `consumes` artifact **either** has some
  earlier *enabled* `produces` (edge resolves to the **nearest enabled producer earlier in order**)
  **or is listed in that consumer's `self_supply`** — a consumer that self-supplies an otherwise
  absent input is **not** dangling. This exemption is what lets the default list validate with
  `requirements`/`architecture` **default-off** (`design.consumes:[workspace,requirements]` is
  absorbed by `design.self_supply:[requirements]`, per design §"Dependency graph" line 241).
  Also: acyclic (a refinement re-`produces:[change]` must not create a cycle — resolve consumer
  edges to the nearest *earlier* producer only); `contract` names ∈ the closed bundle vocabulary
  `{core,producer,construction,harness-read,harness-exec,delivery}` (ADR-003/006). Pure.
- **Create** `engine/src/index.js` (the frozen surface) and `engine/bin/pipeline-lint.js`
  (`parsePipeline(readFile(argv)) → validatePipeline`; print errors; `process.exit(ok?0:2)`).
- **Create** `engine/test/descriptor.test.js` + `engine/test/graph.test.js` with fixtures under
  `engine/test/fixtures/pipeline/` (`default` symlink/copy of `pipeline/default.yml`;
  `cycle.yml`; `dangling-consume.yml` — a consume with no enabled producer **and not** in
  `self_supply` → `{ok:false}`; `disabled-producer-absorbed.yml` — a default-off producer whose
  sole consumer lists the artifact in `self_supply` → `{ok:true}`; `bad-archetype.yml`;
  `selfsupply-not-subset.yml`).
- **Surface gate**: locks `parsePipeline`, `validatePipeline`, `ALIAS_MAP/resolveAlias` (stubbed
  empty here, filled slice 6), and the Descriptor shape. Downstream slices import, never redefine.

### TDD steps
- RED: `engine/test/descriptor.test.js` asserts `parsePipeline(default)` yields 13 descriptors with defaults applied and `validatePipeline` returns `{ok:true}` **even with `requirements`/`architecture` default-off** (the `self_supply` exemption); the invalid fixtures (incl. `dangling-consume.yml`) return `{ok:false}` with the specific error, and `disabled-producer-absorbed.yml` returns `{ok:true}` — all fail (no module).
- GREEN: implement `descriptor.js` + `graph.js` + `index.js` + `pipeline-lint.js` + `pipeline/default.yml` until green; add a golden test asserting the parsed default deep-equals the enumerated 13-descriptor table — `id, archetype, enabled, contract, procedure, role, consumes, self_supply, produces` (the **structural** fields the data carries; **not** resolved `model`, which the Model port derives from the agent pin downstream). This is the SC1 data anchor.
- REFACTOR: split edge-resolution into a small named helper (`nearestEarlierProducer`); keep each file <200 lines, single-responsibility.

### Gate
`node --test engine/test/descriptor.test.js engine/test/graph.test.js && node engine/bin/pipeline-lint.js pipeline/default.yml`

### Commit
`feat(engine): descriptor parse + graph validation + default pipeline data`

## Slice 6 — Engine module: old→new phase alias map (DC-4)

### Context
The single shared old→new alias map (ADR-004) consulted by *both* the resolver walk (slice 7)
and, at P4, `manifest-lint`. Lands as data + a pure resolver; the lint-side consumer is P4.
**Deliberate pull-forward:** DESIGN line 287 / ADR-004 say "the map lands when the rename
executes (P4)" — that refers to the **rename execution + lint-side wiring + the alias fixture in
the lint suite**, all of which stay P4 (see the P4 outline). The *engine-internal map + pure
`resolveAlias`* land here in P1 because slice 7's resolver consumes it (`mutation:` → `validation`,
slice 7 step 1). No contradiction once the consumer/fixture split is stated.
- **Create** `engine/src/alias-map.js` → `export const ALIAS_MAP` = the frozen table from
  DESIGN §"Manifest & alias resolution" / PRD §6.4: `branch→workspace, prd→requirements,
  adr→decisions, plan→planning, implement→implementation, mutation→validation,
  refactor→refactoring, docs→documentation, pr→propose, merge→integrate`. Add `resolveAlias(name)`
  → returns the canonical id (identity for an already-canonical or unknown-but-valid id; the
  design keeps `prd` registered even though `requirements` is default-off). Pure, no throw on a
  canonical input.
- **Create** `engine/test/alias-map.test.js`: table-test every old name → its new id; round-trip
  stability (`resolveAlias(resolveAlias(x)) === resolveAlias(x)`); a canonical id maps to itself;
  the map has exactly the 10 documented entries (guard against silent drift).
- Re-export `ALIAS_MAP, resolveAlias` from `index.js` (replacing the slice-5 stub).
- **Surface gate**: locks `resolveAlias`/`ALIAS_MAP`; the resolver and the future lint consumer
  bind to this one home — no second copy (the DC-4 anti-drift guarantee).

### TDD steps
- RED: `engine/test/alias-map.test.js` asserts each mapping + round-trip — fails (no module).
- GREEN: implement `alias-map.js`; wire into `index.js`; tests green.
- REFACTOR: derive the entry-count guard from `Object.keys(ALIAS_MAP).length` so adding an alias forces an intentional test update.

### Gate
`node --test engine/test/alias-map.test.js`

### Commit
`feat(engine): shared old→new phase alias map`

## Slice 7 — Engine module: pipeline resolution (profile, edits, precedence, strand refusal)

### Context
The structural resolver — `(defaults, manifest) → effective pipeline` — the DC-5 graph-only
strictness and the ADR-008 execution precedence. Gate/waiver *accountability* output is slice 10;
this slice owns *which phases, in what order, in what execution mode*.
- **Create** `engine/src/profile.js` → `expandProfile(name)` returning an edit-set: `solo` =
  every phase `execution:inline` + lean harness knobs, **except phases of `archetype: harness`
  stay `agent`** (the SP1 parallelism caveat, encoded as a static archetype rule since the
  per-`harness.dimensions` opt-in does not resolve until P8 — design line 172 / PLAN P8 outline;
  P1 asserts the conservative static behavior, not a `dimensions`-driven one); `full` = the rich
  defaults. Closed profile vocabulary; unknown profile → throw.
- **Create** `engine/src/resolve.js` → `resolvePipeline(defaults, manifest)`:
  1. **alias-resolve** every id the manifest names (via `resolveAlias`) so `mutation:` edits hit
     the `validation` descriptor;
  2. **expand `manifest.pipeline.profile`** into per-phase edits;
  3. **apply `pipeline.skip` / `pipeline.insert` / explicit `phases.<id>` field overrides**
     (`role`, `model`, `harness`, `execution`, `enabled`); `insert` honors `after:`/`before:` and
     joins the graph; a shipped `enabled:false` descriptor turns on with `phases.<id>.enabled:true`;
  4. **resolve `execution`** per phase by the three-level precedence **explicit phase field >
     profile > top-level `execution:` default > descriptor default(`agent`)** (ADR-008);
  5. **validate the effective graph** via `validatePipeline`; additionally a **skip that strands**
     a non-`self_supply` consumer → push a structured error and **refuse** (return `{ok:false}`),
     and (dormant, specified) a reorder placing a consumer before its producer → reject;
  6. return `Resolution.effective` (the walked order) + a `record[]` of every edit applied. A
     **default-off** descriptor left off is a recorded default-skip, never a strand.
- **Create** `engine/test/resolve.test.js` + manifest fixtures `engine/test/fixtures/manifests/`:
  `none` (no manifest) → effective == today's 11 enabled in order (**SC1 zero-config golden**);
  `skip-decisions` → allowed (`planning` self-supplies `decisions`); `skip-design` → **refused**
(`documentation` consumes `design` without `self_supply`); `skip-planning` → **refused** (strands
  `implementation`); `skip-workspace` → refused; `profile-solo` → execution flips to inline except
  the `harness`-archetype phases; `exec-precedence` (top-level `execution:agent` + `profile:solo`
  + explicit `phases.implementation.execution:agent`) → isolates two of the three ADR-008 legs +
  the caveat, each on a different phase so no result has two causes: `documentation` = `inline`
  (**profile beat top-level `agent`**), `implementation` = `agent` (**explicit field beat the
  profile's `inline`**), `validation` = `agent` (the harness-archetype caveat — labelled
  separately, *not* a precedence leg); a **second** fixture `exec-toplevel-default` (bare top-level
  `execution:inline`, **no profile**) isolates the third leg — a non-harness phase with no explicit
  field flips from its descriptor default (`agent`) to `inline`, proving **top-level default beat
  the descriptor default**; `insert-bench` (`pipeline.insert: [{id: bench, after: validation, …}]`)
  → joins + validates; `enable-requirements` → default-off flips on, graph still valid.

### TDD steps
- RED: `resolve.test.js` cases assert the effective order/exec/refusals — fail (no resolver).
- GREEN: implement `profile.js` + `resolve.js`; wire `resolvePipeline` into `index.js`; the
  zero-config golden + every edit/strand/precedence case pass.
- REFACTOR: split the pipeline into named pure steps (`aliasResolve → expandProfiles → applyEdits
  → resolveExecution → validate`) composed in `resolvePipeline`; immutable transforms only.

### Gate
`node --test engine/test/resolve.test.js`

### Commit
`feat(engine): pipeline resolution — profile, edits, precedence, strand refusal`

## Slice 8 — Engine module: engine-owned contract assembly (the P5 crux, function only)

### Context
The pure assembler `(descriptor, manifest, fragments, opts) → injectedBlock` from DESIGN
§"Engine-owned contract injection" / §"Assembly path". The **real** `contracts/*.md` fragments
and the relocation out of agent defs + wiring into the live walk are **P5**; this slice locks
the *function contract* against **fixture** fragments so the seam is unit-pinned now (R-contract,
R-shape, R-retrieval, S9).
- **Create** `engine/src/contract.js` → `assembleContract(descriptor, manifest, fragments, opts)`
  concatenating, in the fixed order (design §"Assembly path"): `[U core][bundle(s) named by
  descriptor.contract, in list order][derived retrieval note][manifest global context verbatim]
  [per-phase context verbatim][dynamics]`. `opts.execution === 'inline'` emits the **inline
  variants of exactly the two U carve-outs** — *artifact-is-the-handoff* → "the commit is the
  handoff (no agent context to lose)"; *model-resolution+fallback* → "the session model" — and
  **nothing else changes** (every other U line binds verbatim). `fragments` is an injected map
  `{core, producer, construction, harness-read, harness-exec, delivery}` (so P5 can swap the real
  files in with zero function change — dependency inversion). Pure; returns a string.
- **Create** `engine/test/contract.test.js` + `engine/test/fixtures/contracts/*.md` (minimal
  representative bundle stubs mirroring the DESIGN §"Decomposition into composable bundles" table —
  e.g. `core.md` carries the U lines incl. the two carve-out markers; `producer.md` the
  designer/planner craft incl. the `mktemp` write-isolation line from `agents/designer.md`):
  - assert **U core is always present** regardless of `descriptor.contract`;
  - assert a `contract:[producer, harness-read]` descriptor layers both bundles atop U in order;
  - assert global + per-phase `context:` files are appended **verbatim**;
  - assert the **derived retrieval note** is injected and **no retrieval string lives in the
    bundle fixtures** (SC8/S9);
  - assert `opts.execution:'inline'` swaps **exactly** the two carve-out lines (diff the agent vs
    inline output → exactly two changed lines).
- **Surface gate**: locks `assembleContract` signature; P5 supplies real `fragments` + wires it
  into `run/SKILL.md` without touching the signature.

### TDD steps
- RED: `contract.test.js` asserts presence/order/verbatim/inline-swap — fails (no module).
- GREEN: implement `contract.js`; wire into `index.js`; all assertions pass against fixtures.
- REFACTOR: model the carve-out swap as a single `inlineVariant(line)` map keyed by a marker, so
  "exactly two lines change" is structurally guaranteed, not asserted by accident.

### Gate
`node --test engine/test/contract.test.js`

### Commit
`feat(engine): engine-owned contract assembly with inline carve-outs`

## Slice 9 — Engine module: shape-agnostic findings normalizer (R10)

### Context
The `findings-normalize` seam (DESIGN §"Output shape (R10)") — raw role output → the canonical
`Finding` field set, tolerating a **JSON array** and a **per-line list** interchangeably (SP5
showed Haiku emits review findings as JSON, others per-line). The *consumers* (review at P5,
per-harness specifics at P8) wire it in later; this slice pins the normalizer.
- **Create** `engine/src/findings.js` → `normalizeFindings(raw)`: if `raw` parses as a JSON array
  of `{file,line,severity,finding,fix}` → map to `Finding[]`; else parse the documented per-line
  form (`<severity> <file>:<line> — <finding> | <fix>` or the design's `{file:line, severity,
  finding, fix}` per-line layout) → same `Finding[]`. Key on **fields, never layout**; tolerate
  missing optional `fix`; **throw** only on structurally unrecoverable input (handle, never
  silently drop). Pure.
- **Create** `engine/test/findings.test.js` + `engine/test/fixtures/findings/` (`array.json`,
  `per-line.txt`, `mixed-whitespace.txt`, `empty` → `[]` is legitimate, `malformed` → throws):
  assert the JSON and per-line fixtures normalize to the **same** `Finding[]`; zero findings →
  `[]`; field-keyed access works under both shapes.

### TDD steps
- RED: `findings.test.js` asserts JSON-array and per-line inputs yield identical `Finding[]` —
  fails (no module).
- GREEN: implement `findings.js`; wire into `index.js`; both shapes + empty + malformed pass.
- REFACTOR: split `parseJsonShape`/`parseLineShape` behind one dispatch on a cheap shape sniff;
  no duplicated field-mapping.

### Gate
`node --test engine/test/findings.test.js`

### Commit
`feat(engine): shape-agnostic findings normalizer`

## Slice 10 — Gate/waiver decision layer + S1–S9 scenario golden suite (capstone)

### Context
The accountability layer over slice 7's structural resolver: per-phase **gate resolution**, the
**code-producing-gate floor**, **harness-waiver → propose-gate release** (ADR-005), and the
**S1–S9 scenario goldens** that assert *pipeline resolution + gate decisions* (PRD §13 — never
LLM prose). Adds `pipeline-resolve` CLI. This is real new code (the gate/waiver output), not a
test pass — the scenarios exercise it end-to-end at the resolution layer.
- **Extend** `engine/src/resolve.js` (or a sibling `engine/src/gates.js` imported by it) so
  `resolvePipeline` also emits `Resolution.gateDecisions` + `Resolution.waivers`:
  - per phase, resolve the effective gate (`descriptor.gate` → manifest `gate`/`gates.phase` →
    capability probe placeholder); for a **code-producing** phase (`change ∈ produces`:
    `implementation, refactoring` — the harnesses produce `*-report`, not `change`) with **no**
    resolvable gate → **refuse** (the non-waivable floor). **SC1 zero-config outcome is
    deterministic:** in the `none` golden every code-producing phase carries a `descriptor.gate`
    from the data (`implementation`/`refactoring` = `<gates.phase>`), so the floor **passes, never
    refuses** — assert this explicitly in the SC1 case (incl. `review`/`validation`
    `codeProducing:false`) so the golden's floor result is pinned;
  - a `review|refactoring|validation` that is skipped/disabled → record a **waiver** in
    `waivers[]` and, for an executing-harness (`validation`, `architecture`), **release its
    propose-gate** (it cannot gate on a phase not run) + a loud `record[]` line;
  - the **propose-gate ordering invariant**: `propose` waits on every *run* executing-harness's
    gate (expressed by archetype, not phase name); `documentation` may parallel, `propose` may not.
- **Create** `engine/bin/pipeline-resolve.js` → `resolvePipeline` → `JSON.stringify(resolution)`
  to stdout (the seam P3's orchestrator + CI consume).
- **Append** `node engine/bin/pipeline-resolve.js pipeline/default.yml` to the shared CI
  definition (`scripts.ci` / `.github/workflows/ci.yml`) — CI now mirrors the full P1
  phase-boundary gate (substrate + `pipeline-lint` from slice 5 + this resolve smoke).
- **Create** `engine/test/scenarios.test.js` + `engine/test/fixtures/scenarios/{S1..S9}/`
  (`workflow.md` manifest + `expected.json` golden of the relevant Resolution slice). What each
  asserts **now** and the phase that completes it (PRD §17 traceability):
  - **S1** `profile: solo` → execution inline (multi-dim harness stays agent); lean harness knobs. *(e2e P6)*
  - **S2** `phases.planning.role: my:domain-planner` → `Resolution` golden shows the role swapped; **plus** a separate `assembleContract(planningDescriptor, manifest, fragments, {})` assertion that U + `[producer]` still inject around the swapped role (this assertion runs against `assembleContract`'s output, **not** the Resolution golden — `Resolution` carries no contract block). *(e2e P9)*
  - **S3** `pipeline.insert: bench` → inserted, graph valid, gate resolved. *(e2e P7)*
  - **S4** `phases.requirements.enabled:true` → default-off→on, graph valid (design self-supplies). *(agent P10)*
  - **S5** `phases.architecture.enabled:true` → on, harness gate resolved. *(agent P10)*
  - **S6** `backlog:` declared → `record` marks Backlog.resolve required at input-classify. *(adapter P11)*
  - **S7** namespaced inserted phase/role (`acme:bench`) → accepted/validated. *(registration P14)*
  - **S8** `models.fallback` present + a degraded tier → `gateDecisions`/`record` capture the fallback re-resolution policy. *(NFR matrix P13)*
  - **S9** derived `retrieval:` → an `assembleContract(descriptor, manifest, fragments, {})` assertion (again on `assembleContract`'s output, not the Resolution golden) that the derived strategy note injects and **zero** retrieval strings live in the bundle fixtures. *(e2e P5)*
  - **SC1** the `none`/zero-config golden (from slice 7) re-asserted here as the suite's anchor: the 11 enabled phases (of the 13-descriptor list) in today's order/roles.
- **Note (no silent caps):** S6/S7 are *partial* at P1 (resolution-layer only — their ports/UX
  land at P11/P14); the scenario file `log`s this so the suite never reads as "fully covered."

### TDD steps
- RED: `scenarios.test.js` runs each manifest through `resolvePipeline` and diffs against
  `expected.json`; the gate/waiver assertions (floor refusal, harness waiver, propose-gate
  release) fail (layer not built).
- GREEN: implement the gate/waiver layer + `pipeline-resolve.js`; every scenario golden + the
  SC1 anchor pass; a code-producing phase with no gate refuses; a skipped validation releases its
  propose-gate with a recorded waiver.
- REFACTOR: factor gate resolution + waiver emission into `engine/src/gates.js` (pure), keeping
  `resolve.js` structural; the scenario fixtures stay declarative data.

### Gate
`node --test engine/test/scenarios.test.js && node engine/bin/pipeline-resolve.js pipeline/default.yml`
**Phase-boundary gate (P1 close, run once — the exact command CI mirrors):**
`node --test engine/ && bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml`

### Commit
`feat(engine): gate/waiver decisions + S1–S9 scenario golden suite`

## Slice 11 — (P2) Harden `manifest-lint.sh`: yq parse + subset-parser fallback

### Context
P2: re-implement `scripts/manifest-lint.sh`'s YAML parse on **`yq`** (verified on PATH:
`/opt/homebrew/bin/yq`) with the **existing sed/awk subset parser as the fallback** when `yq` is
absent, **behavior-preserving** — the slice-2 characterization + historical-regression suite is
the guard rail (must stay green throughout). The two historical regressions (comma-in-array,
quoting) become *structurally impossible* under `yq`, not just patched. Then **evaluate** the
ADR-002 follow-up (fold shape validation into the Node core) and record the decision.
- **Touch** `scripts/manifest-lint.sh`: front a `parse_frontmatter()` that uses `yq` when
  available (`yq -o=props` / `yq '.. | …'` to enumerate keys + values), else falls through to the
  current line-walk (lines 53–123, kept intact as the fallback path). Preserve every current
  message string + exit code (slice-2 fixtures assert them) — `TOP_KEYS`, `PHASE_NAMES`,
  `PROTECTED`, dangling-file, unknown-key, skip-on-protected all unchanged at P2 (`PROTECTED`
  removal is **P3**, alias-map reading is **P4** — out of this slice).
- **Extend** `test/manifest-lint.bats` (slice 2) with a `yq`-absent run (shim `PATH` without `yq`)
  asserting the fallback path produces **identical** verdicts on every fixture — proving the two
  parsers agree (the anti-regression property).
- **Decision artifact**: append a short note to ADR-002's consequences (or a one-paragraph
  `docs/adr/002-…` follow-up record) capturing the fold evaluation — recommend deferring the
  fold into the Node core to **P3** (when `PROTECTED` is removed and the resolver already parses
  manifests), keeping `manifest-lint` Bash-but-yq-backed until then. Record the rationale in the
  run record.

### TDD steps
- RED: add the `yq`-absent fallback-equivalence cases to `test/manifest-lint.bats`; they fail
  (no fallback branch / parser divergence on the comma+quoting fixtures).
- GREEN: introduce the `yq`-backed parse with the subset parser as fallback until the full
  slice-2 + slice-11 suite is green under **both** `yq`-present and `yq`-absent PATHs.
- REFACTOR: isolate `parse_frontmatter()` as the single parse seam; the validation logic consumes
  its normalized output regardless of backend (one responsibility per function); shellcheck-clean.

### Gate
`bats test/manifest-lint.bats && shellcheck scripts/manifest-lint.sh`

### Commit
`refactor(manifest-lint): yq parse with subset-parser fallback`

## Downstream phases (P3–P5 outline)

Lower-resolution per the brief; OQ7 makes each dogfoodable once P1 is green, so each **may be
replanned per-workstream** via `/craft:design` + `/craft:plan`. Listed here for sequencing +
the surface gates they must honor.

- **P3 — Phase-abstraction core (rewire the walk; SC1 green).** Make `run/SKILL.md` *consume*
  the Node core: replace the hardcoded 1→11 table (lines 32–46) with a walk over
  `pipeline-resolve` output; the §11 cross-phase invariants stay but generalise **by archetype**
  (not phase name). Remove the static `PROTECTED` from `manifest-lint` (the graph now computes
  stranding). **Surface gate:** the slice-7/10 golden Resolution is the contract — the rewired
  walk must reproduce it; the slice-1 phase-boundary gate + scenario suite stay green
  (behavior-identical by construction). Likely slices: walk-skeleton over resolved data; gate
  cadence wiring; `PROTECTED` removal under the slice-2 suite; run-record emission from
  `Resolution.record`.
- **P4 — Generic vocabulary (rename + aliases; SC1 still green).** The single coordinated rename:
  skill dirs (`skills/branch→workspace, adr→decisions, plan→planning, implement→implementation,
  mutation→validation, refactor→refactoring, docs→documentation, pr→propose, merge→integrate`),
  agent files (`mutation-triager→validation-triager`, …), the default descriptor ids (already
  concern-named in `pipeline/default.yml`), and **wiring `manifest-lint` to read the slice-6
  `ALIAS_MAP`** (one source of truth — DC-4). Add the alias-resolution fixture to the slice-2
  suite (PRD §13). `requirements`/`architecture` stay new (no dir to rename); `prd` stays a
  registered alias. **Surface gate:** `resolveAlias` is the only alias home — no second copy.
- **P5 — Engine-owned injection (relocate contract; thin agents; doc split).** Create the real
  `contracts/{core,producer,construction,harness-read,harness-exec,delivery}.md` fragments
  (content relocated from the agent defs + §11), feed them as the slice-8 `assembleContract`
  `fragments` map, and wire assembly into the walk (spawn **and** inline). Strip the relocated
  contract from `agents/*.md` (thin role craft only — e.g. `agents/designer.md` keeps the craft,
  drops the universal invariants). Derive + inject the retrieval-strategy note (S9; **zero**
  retrieval strings in plugin content — SC8). Re-baseline the fixed-prompt **agent-output diff**
  (R8) — the one deliberate, re-baselined change. Execute the **DESIGN split** (ADR-007):
  `docs/DESIGN.md → docs/DESIGN-history.md`; `DESIGN-customizable-engine.md` is the living SoT;
  fix cross-references. **Surface gate:** `assembleContract`'s signature is frozen (slice 8) —
  P5 supplies data + call sites only; the slice-8 assertions (U always present, inline swaps
  exactly two lines) must stay green.

## Blockers / open items

- **None blocking P1.** Toolchain verified present (Node 22 `node --test`, bats, shellcheck, yq).
- **CI runner tools** — the GitHub Actions image must provide `bats`, `shellcheck`, `jq`, `yq`
  (slice 1 wires the install steps; called out so the workflow author doesn't assume them).
- **P8/P10/P11/P14 boundaries are honored, not crossed** — `harness:` internals, the
  `requirements`/`architecture` agent bodies, backlog adapter impls, and derived-plugin
  registration are out of P1–P5 scope; the scenario suite asserts only the resolution-layer slice
  that exists today and logs the partial coverage (no silent caps).
