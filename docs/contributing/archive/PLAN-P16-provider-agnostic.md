# Plan — P16: provider-agnostic ports/adapters boundary + Pi adapter PoC

> Source: design doc `docs/DESIGN-P16-provider-agnostic.md` · ADRs `084, 085, 086, 087, 088, 089, 090, 091, 092`
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

## Ordering (ADR-084)

ALL boundary parts (1–3) land first; THEN all Pi parts (4–7). The Pi parts `consume`
the committed port-spec docs from parts 2–3 as pre-chewed input. If the Pi runtime proves
un-installable at implementation time, parts 1–3 still ship as a coherent change and the
Pi parts escalate as a blocker (ADR-084 consequence), never sinking the run.

## Gate placeholders (resolved here)

- **Engine src/test part gate** (parts 1, 4, 5, 6): `cd engine && node --test 'test/**/*.test.js'`
- **Adapters/pi part gate** (parts 4, 5, 6 also run): `cd adapters/pi && node --test 'test/**/*.test.js'`
- **Docs-only part gate** (parts 2, 3, 7): `bash scripts/ci.sh` (no engine src/test delta — the full
  substrate gate is the cheapest honest proof a docs part changed no behaviour; it also runs
  `pipeline-lint`/`pipeline-resolve`/`contracts-lint`/`shellcheck`/`bats`).
- **Phase-boundary / full substrate gate** (run once after part 7): `bash scripts/ci.sh`
  (engine `node --test` + `EXPECTED_TESTS` count guard + `bats test/` + `shellcheck scripts/*.sh
  hooks/*.sh` + `pipeline-lint`/`pipeline-resolve` on `pipeline/default.yml` + `contracts-lint`).

## EXPECTED_TESTS ledger (the 634-count guard — `scripts/ci.sh` line 10)

Baseline (verified this checkout): `EXPECTED_TESTS=634`, all green. Per CRITICAL fact 1, EVERY
part that adds/removes a `node --test` test under `engine/test/**` MUST update `EXPECTED_TESTS`
in `scripts/ci.sh` in the SAME commit. Pi-adapter tests live OUTSIDE `engine/test/` (part 4
establishes their separate home + their own count guard `EXPECTED_PI_TESTS`), so they never touch
`EXPECTED_TESTS`. Per-part deltas:

| Part | engine/test Δ | `EXPECTED_TESTS` after | adapters/pi test Δ | `EXPECTED_PI_TESTS` after |
|---|---|---|---|---|
| 1 (DC-9) | 0 (guard test repurposed in place, net 0) | **634** (unchanged) | — | — |
| 2 (docs) | 0 | 634 | — | — |
| 3 (docs) | 0 | 634 | — | — |
| 4 (pi scaffold + bin-wrapper) | 0 | 634 | **+N₄** | **N₄** (new guard) |
| 5 (pi exec + gate predicate) | 0 | 634 | **+N₅** | **N₄+N₅** |
| 6 (pi probe runner) | 0 | 634 | **+N₆** | **N₄+N₅+N₆** |
| 7 (pi-poc-record docs) | 0 | 634 | 0 | unchanged |

N₄/N₅/N₆ are the concrete counts the part agent writes; each adapters/pi part states the exact new
`EXPECTED_PI_TESTS` value in its gate after counting its own `# tests` line.

---

## Part 1 — DC-9: lift per-role model tier into the descriptor + Claude re-baseline

### Context

This is the ONE behaviour-touching boundary part (ADR-092). It moves the canonical per-role model
tier from `agents/*.md` frontmatter (Claude-only) into `pipeline/default.yml` as an adapter-neutral
`model:` descriptor field, surfaces it on the resolved descriptor, and re-documents the resolution
order — then PROVES the Claude spawn-model per phase is byte-identical to today.

**Pre-chewed key fact — there is NO engine/src spawn-model computation.** Verified: `engine/src/**`
never computes a spawn model. It only (a) carries `manifest.models.fallback` into a record
(`resolve.js:160`, function `buildManifestRecords`) and (b) validates manifest `models.<role>` /
`phases.<id>.model` types (`manifest.js`). The actual model resolution is **orchestrator prose** in
`skills/run/SKILL.md` (the LLM follows it). So DC-9's engine change is narrow: teach the descriptor
parser to carry `model`, seed `default.yml`, and let the resolver's existing object-spread surface it.
The resolution-order change is a SKILL.md prose edit. **The resolver requires NO new code** — confirm
the spread carries it (see TDD step 2).

**Role → current agent-pin tier table (READ from `agents/<role>.md` frontmatter `model:` — seed
`default.yml` with EXACTLY these so the re-baseline proves equivalence):**

| default.yml phase id | `role:` | agent file | tier to seed in `model:` |
|---|---|---|---|
| requirements | craft:requirements-writer | agents/requirements-writer.md | `opus` |
| design | craft:designer | agents/designer.md | `opus` |
| planning | craft:planner | agents/planner.md | `opus` |
| implementation | craft:part-implementer | agents/part-implementer.md | `sonnet` |
| review | craft:reviewer | agents/reviewer.md | `opus` |
| refactoring | craft:refactor-executor | agents/refactor-executor.md | `sonnet` |
| validation | craft:validation-triager | agents/validation-triager.md | `sonnet` |
| architecture | craft:architecture-triager | agents/architecture-triager.md | `opus` |
| documentation | craft:docs-writer | agents/docs-writer.md | `sonnet` |

**Role-less phases get NO `model:` field** (they spawn no role-agent): `workspace`, `decisions`,
`propose`, `integrate`. (`backlog-ticker`→`haiku` is a docs-phase micro-worker invoked WITHIN the
`documentation` phase, not a top-level role-bearing descriptor phase — do NOT add a `model:` to any
descriptor for it; its pin stays in `agents/backlog-ticker.md`.)

**Exact files + symbols to touch:**

1. `pipeline/default.yml` — add one `model:` line to each of the nine role-bearing phases above, with
   the seeded tier. The file is a YAML list of descriptor objects (see e.g. the `implementation` entry:
   `id`/`archetype`/`contract`/`procedure`/`role`/`consumes`/`produces`/`gate`). Place `model:` adjacent
   to `role:` for readability. Leave the four role-less phases untouched.

2. `engine/src/descriptor.js` — function `normalizeEntry(raw, index)` (lines 46–96). It currently
   carries `role`, `gate`, `harness` as conditional fields (lines 83–94). Add `model` the SAME way:
   ```js
   if (raw.model !== undefined && raw.model !== null) {
     entry.model = String(raw.model);
   }
   ```
   Add it ONLY when present (absent → field genuinely absent, mirroring `role`). No new required field,
   no enum validation (the tier is a craft-class string the adapter maps; the engine has no model
   vocabulary — keep it as opaque as `role`).

3. `engine/src/resolve.js` — VERIFY (do NOT add code unless the verify fails): the resolver threads the
   whole descriptor object through with object-spread. `resolveExecution` returns `{ ...d, execution }`
   (line 110); `effective` is `execResult.descriptors.filter(d => d.enabled)` (line 278). The spread
   preserves `model`, so it surfaces on `resolution.effective[i].model` and in
   `pipeline-resolve.js` JSON output for free. `foldRegisteredPhases` (lines 181–201) only re-seeds
   defaults for REGISTERED/INSERTED phases (not default phases), so default-phase `model` is untouched.
   The TDD RED in step 2 confirms the surfacing without new resolver code.

4. `skills/run/SKILL.md` — the "**Model resolution & fallback**" invariant block (lines 263–271).
   Current text resolves the model as `manifest models.<agent> → the agent def's pinned model`. Rewrite
   the resolution ORDER to read the descriptor field as the canonical agent-pin source:
   `manifest models.<role> → the descriptor's model: field (the canonical per-role tier; the agent-def
   frontmatter pin is the Claude binding of that same tier) → models.fallback → engine default sonnet →
   session model`. Keep every other sentence (degraded-tier memory, respawn-from-artifact, "never pay
   the same dead spawn twice") byte-for-byte. This is the documented-resolution-order change ADR-092
   calls observable; it does NOT change the per-phase RESULT because the descriptor tier == the agent
   pin (proven by the equivalence assertion below).

**Re-baseline target set in `engine/test/` (precisely spotted — these are the ONLY tests that observe
descriptor shape; spot-checked, no full-descriptor deep-equal exists elsewhere):**

- `engine/test/descriptor.test.js:340–345` — the guard test
  `'…then no descriptor carries a model field'` asserts `Object.hasOwn(d, 'model') === false` for every
  descriptor. This WILL go RED when `default.yml` carries `model:`. **Repurpose it IN PLACE** (net 0
  test count) into the equivalence assertion: for each of the nine role-bearing phases assert
  `d.model === <seeded tier>` matching the table above, AND for the four role-less phases assert
  `Object.hasOwn(d, 'model') === false`. This single test IS the re-baseline proof: it pins that the
  surfaced tier equals today's agent-pin tier byte-for-byte.
- `engine/test/descriptor.test.js:316` golden-table test uses `STRUCTURAL_FIELDS` (line 297–300) which
  does NOT include `model` and `EXPECTED_DESCRIPTORS` (no `model` keys) — it iterates only the listed
  structural fields, so it stays green WITHOUT edit. Do NOT add `model` to `STRUCTURAL_FIELDS` (that
  would force `model` onto role-less entries and break the absence assertion). Leave it untouched.

**Tests that stay green BY CONSTRUCTION (state the reason; do NOT edit them):**

- `engine/test/contract-equivalence.test.js`, `engine/test/model-class-shape.test.js`,
  `engine/test/contract.test.js`, `engine/test/contract-assemble*.test.js` — `assembleContract`
  (`engine/src/contract.js`) reads ONLY `descriptor.id` and `descriptor.contract` (signature
  `(descriptor, manifest, fragments, opts)`); it never serializes the descriptor object, so the new
  `model` field CANNOT enter the assembled block. The `model-class-shape` BARE_TIER_NAMES guard
  (`opus|sonnet|haiku` must be absent from the assembled block) is therefore unaffected — the tiers live
  in the descriptor data, never in the contract text. SC1 injected-block bytes per phase are unchanged.
- `engine/test/resolve.test.js`, `engine/test/scenarios.test.js`,
  `engine/test/pipeline-resolve-main.test.js`, `engine/test/pipeline-resolve.bin.test.js` — all access
  fields by name (`effective.map(d => d.id)`, `d.contract`, `d.produces`, `byId`); none does a
  full-descriptor `deepEqual`, so a new key is invisible to them.
- `engine/test/manifest.test.js:765` already validates `phases.<id>.model` must be a string — unrelated
  to default.yml descriptors; untouched.

### TDD steps

- **RED 1** — `descriptor.test.js`: convert the line-340 guard. New assertion (role-bearing phases carry
  the seeded tier; role-less phases carry none). Run `cd engine && node --test test/descriptor.test.js`
  → fails: every role-bearing descriptor currently lacks `model` (default.yml not yet seeded, parser not
  yet carrying it). Failure reason: `expected 'opus', got undefined` on the first role-bearing phase.
- **GREEN 1** — add the `if (raw.model …)` carry in `normalizeEntry` (descriptor.js) AND seed the nine
  `model:` lines in `default.yml`. Re-run → green. (Verify resolver spread surfaces it — see RED 2.)
- **RED 2** — add ONE assertion to an existing resolve/scenario test region (extend the SC1 anchor test
  in `engine/test/scenarios.test.js` near line 99 where `effective.map(d => d.id)` is asserted): assert
  `result.effective.find(d => d.id === 'implementation').model === 'sonnet'` and that
  `result.effective.find(d => d.id === 'workspace').model === undefined`. If the spread already carries
  it this is green immediately on the GREEN-1 code — that is the desired proof the resolver needs NO new
  code. If RED, the resolver is stripping the field — fix by ensuring the descriptor object is spread,
  not field-picked. **Fold this assertion into the existing SC1 test (net 0 new test).**
- **GREEN 2** — confirm green with no resolver code change (expected) or the minimal spread fix.
- **REFACTOR** — update `skills/run/SKILL.md` model-resolution prose (step 4 above). No test asserts that
  prose; the equivalence is carried by the descriptor.test.js tier assertions. Re-run the full engine
  suite: `cd engine && node --test 'test/**/*.test.js'` → `# tests 634`, all green (count unchanged
  because both new assertions were folded into existing tests). `EXPECTED_TESTS` stays **634** — no
  `scripts/ci.sh` edit needed for the count. Run `node engine/bin/pipeline-resolve.js pipeline/default.yml`
  and `node engine/bin/pipeline-lint.js pipeline/default.yml` to confirm the seeded `model:` parses and
  resolves cleanly (no unknown-field rejection — `pipeline-lint` only runs `parsePipeline` +
  `validatePipeline`, neither of which whitelists fields).

### Gate

`cd engine && node --test 'test/**/*.test.js'` (expect `# tests 634`, all pass), then
`bash scripts/ci.sh` to prove the full substrate (count guard `EXPECTED_TESTS=634` unchanged,
`pipeline-resolve`/`pipeline-lint` accept the seeded descriptor). Never commit on red.

### Commit

`feat(engine): lift per-role model tier into pipeline descriptor (DC-9)`

---

## Part 2 — docs/adapters: execution.md + model.md port specs + run/SKILL.md seam anchors

### Context

Docs-only part (no `src/` delta) — standalone per the sizing EXCEPTION (ADR-087: Execution/Model are
DOCUMENTED SEAMS, no `engine/src` shim). Writes the two new port-author specs and adds the one-line
"(this is the port's verb — Claude binding)" anchors in `run/SKILL.md`.

**House shape to mirror — `docs/adapters/backlog.md` (READ it; copy its section structure):** the
sections are `## Port interface` (verb signatures with `→` return shapes + pre/postcondition prose),
a binding/source set, per-binding procedure, a `## Failure → blocker` section that RELIES ON the
`contracts/core.md` blocker protocol (`{ unit, reason, ≤3 options }`) and does NOT restate it, and
copy-paste reference bindings. Each new doc follows this exact rhythm.

**`docs/adapters/execution.md`** — port verbs from DESIGN §"Execution port spec" (lines 171–202):
- `spawn(role, ctx) → result` — role = a registered worker identity (`craft:<role>`); ctx = the
  engine-assembled injected block (`contract-assemble` output: core + bundles + retrieval note +
  manifest context) + working dir + task dynamics (phase id, part, gate string, commit message,
  artifact paths) + the resolved model (from the Model port). **pre**: `ctx.injectedBlock` non-empty;
  working dir is an isolated workspace (VCS `isolate` ran). **post**: a worker ran the phase under the
  injected block; the contribution is in a COMMITTED ARTIFACT (artifact-is-the-handoff, port-agnostic
  core invariant); `result` carries the worker's final message + usage block. A dead worker → fresh
  respawn fed from the artifact, NEVER a continuation (core invariant the port must not violate).
- `runInline(ctx) → result` — role-less / in-process; injected block assembled with the inline
  carve-outs (`the commit is the handoff` / `the session model`); post identical to `spawn`
  (committed artifact); the "final message to parent" line is moot.
- **Core policy retained (NOT port verbs):** when a phase runs `spawn` vs `runInline`; which §11
  invariants transform under inline; fan-out parallelism (agent-mode only; inline is sequential).
- **Documented bindings** (first two): **Claude** = the `run/SKILL.md` "Agent spawns" invariant (Task,
  `subagent_type: craft:<role>`, model param, injected block prepended) / inline branch. **Pi** = a
  fresh headless `pi` run per phase (`pi -p "<injectedBlock + dynamics>"` / `--mode json`), or the SDK
  embed `createAgentSession`/`session.prompt` as the documented RICHER alternative (ADR-090: subprocess
  is the PoC binding; SDK is documented-not-used). Pi omits sub-agents → sequential per-phase runs,
  artifact-handoff carries state.
- `## Failure → blocker`: a `spawn`/`runInline` that cannot reach its worker, a non-zero Pi subprocess
  exit, a worker that dies mid-phase → escalate via the injected blocker protocol; relies on
  `contracts/core.md`, does not restate it.

**`docs/adapters/model.md`** — port verbs from DESIGN §"Model port spec" (lines 204–223):
- `select(model) → handle` — bind the run to a tier/id. **pre**: `model` resolved by core policy.
  **post**: the worker runs on that model, or the adapter raised model-down → core fallback.
- `isAvailable(model) → bool` — adapter probe; lets core skip a known-down tier.
- **Core policy retained:** resolution order **manifest `models.<role>` → descriptor `model:` field →
  `models.fallback` → engine default sonnet → session** (this is the DC-9 order — keep it identical to
  the part-1 SKILL.md prose, single source of truth); degraded-tier memory for the run; supported class
  is **Haiku-4.5-and-up** (SP5). The port exposes only bind + probe.
- **Documented bindings:** **Claude** = the Task `model` param + the descriptor `model:` tier (canonical)
  whose Claude binding is each `agents/<role>.md` frontmatter pin. **Pi** = `model:`/`scopedModels:` on
  `createAgentSession` (or `pi --model …`); `getModel(provider,id)` / `modelRegistry.find` to map the
  craft tier (`opus|sonnet|haiku`) → a Pi provider+model; `modelRegistry.getAvailable()` for
  `isAvailable`. The tier→provider mapping is the adapter's concern; the resolution ORDER is core.
- `## Failure → blocker`: model-down is NOT a task blocker — it triggers core fallback re-resolution +
  respawn-from-artifact; a tier that resolves to no provider/key is a runtime blocker via the protocol.

**`run/SKILL.md` anchors (one line each, additive — no behaviour change):**
- In the "**Agent spawns**" invariant block (lines 250–261): append one line —
  `(This block is the Execution port's spawn verb — the Claude binding. See docs/adapters/execution.md.)`
- In the "**Model resolution & fallback**" block (now edited by part 1, lines ~263–271): append one
  line — `(This is the Model port's select/isAvailable — the Claude binding. See docs/adapters/model.md.)`
  Do NOT re-touch the resolution-order sentence part 1 wrote.

### TDD steps

Docs-only — no RED/GREEN unit cycle (no executable surface). The "test" is the substrate gate proving
zero behaviour change: prose docs + two one-line anchors, no `src`/`pipeline`/`contracts` edit.
- **Author** `docs/adapters/execution.md` and `docs/adapters/model.md` mirroring the `backlog.md`
  house shape exactly (sections above).
- **Anchor** the two one-line pointers in `run/SKILL.md`.
- **Verify** `bash scripts/ci.sh` stays green end-to-end (no test-count change; no lint regression;
  `bats`/`shellcheck` untouched). Confirm no `engine/test` delta → `EXPECTED_TESTS` stays 634.

### Gate

`bash scripts/ci.sh` (full substrate; expect `# tests 634`, all green, all lints pass). Never commit on red.

### Commit

`docs(adapters): execution + model port specs and Claude seam anchors (ADR-087)`

---

## Part 3 — docs/adapters: vcs.md + gate.md (transcribe extracted mechanisms)

### Context

Docs-only part (no `src/` delta) — standalone per the sizing EXCEPTION (ADR-091/DC-8: complete the
four-doc `docs/adapters/` set). `vcs.md` and `gate.md` TRANSCRIBE already-extracted mechanisms — they
introduce NO new extraction and re-decide NO semantics (ADR-091 consequence). Same `backlog.md`
house shape (verbs · binding set · pre/postconditions · failure→blocker via the injected protocol).

**`docs/adapters/vcs.md`** — the SP8 VCS verbs are already pinned; transcribe them. From DESIGN
(line 26, line 266) the verb set is **`isolate / commit / diff / defaultBranch / propose / integrate /
teardown`**. Mechanism today: `scripts/worktree-setup.sh` / `scripts/worktree-teardown.sh` + `gh`/git
CLI (READ both scripts to transcribe the actual `isolate`→`teardown` lifecycle and ordering; the bats
spec `test/worktree.bats` pins behaviour). Document:
- each verb signature + pre/postconditions (`isolate` → an isolated workspace before any `spawn`;
  `commit` → the artifact-is-the-handoff; `teardown` → cleanup ordering after `integrate`);
- the binding set: **Claude** = `worktree-setup/teardown.sh` + `gh`/git; **Pi** = the SAME scripts +
  `gh`/git called directly by the adapter (the worktree mechanism is NOT Claude-specific — DESIGN
  line 266).
- `## Failure → blocker`: a verb that fails (e.g. `isolate` cannot create the worktree, `commit` on a
  red gate is forbidden) escalates via the injected protocol; relies on `contracts/core.md`.

**`docs/adapters/gate.md`** — the Gate/tool-guard port is already extracted: `hooks/*` (PreToolUse)
+ per-phase gate strings resolved by `engine/src/gates.js` (`resolveGate`). (READ `hooks/git-no-ext-diff.sh`
and skim `engine/src/gates.js` `resolveGate` to transcribe accurately.) Document:
- the two mechanisms: (i) the **mechanical tool-guard** (PreToolUse hook — e.g. refuse `git diff`
  without `--no-ext-diff`; protect paths outside the working dir) and (ii) the **engine-owned gate
  command** (the descriptor's resolved gate string, run as a subprocess at the gate-cadence boundary).
- the **never-commit-on-red** invariant + gate-cadence (targeted gate per fix commit; phase gate once
  per round) as core policy the port enforces, not re-decides.
- binding set: **Claude** = PreToolUse `hooks/*` + Bash exec of the gate string. **Pi** = the
  `pi.on("tool_call", h) → { block: true, reason }` extension hook (Pi's pre-tool veto; the veto shape
  is EXACTLY `{ block: true }`, there is no `permission: "deny"`; handler errors block fail-safe) PLUS
  the engine-owned gate command run as a normal subprocess WRAPPER (Pi has no harness-hook concept —
  DESIGN line 264). Forward-reference: the deterministic `tool_call` predicate is unit-tested in part 5.
- `## Failure → blocker`: a gate that exits non-zero blocks the commit (never a silent pass); a
  `tool_call` veto is enforcement, not a blocker.

### TDD steps

Docs-only — no RED/GREEN unit cycle. READ `scripts/worktree-setup.sh`, `scripts/worktree-teardown.sh`,
`hooks/git-no-ext-diff.sh`, `engine/src/gates.js` (`resolveGate`), `test/worktree.bats`, `test/hooks.bats`
to transcribe the EXISTING behaviour faithfully (no invention). Author both docs mirroring `backlog.md`.
Verify `bash scripts/ci.sh` stays green (no `src`/script/hook edit → no behaviour change; no test-count
change; `EXPECTED_TESTS` stays 634).

### Gate

`bash scripts/ci.sh` (full substrate; expect `# tests 634`, all green). Never commit on red.

### Commit

`docs(adapters): vcs + gate port specs completing the spec set (ADR-091)`

---

## Part 4 — adapters/pi: scaffold + engine-bin invocation wrapper + CI test-home

### Context

First Pi part (ADR-085: code lives under a NEW top-level `adapters/pi/` tree; `engine/**` stays
core-only; adapters depend on engine, never the reverse). This part establishes (a) the `adapters/pi/`
tree + its package, (b) the wrapper that drives the engine core unchanged via its bins, and (c) the CI
test-home + count guard for Pi units (CRITICAL fact 3). Consumes the committed port specs from
parts 2–3.

**Tree to create (ADR-085):**
```
adapters/pi/
  package.json        # { "name": "@craft/adapter-pi", "type": "module", "private": true,
                      #   "scripts": { "test": "node --test 'test/**/*.test.js'" } }
  src/engine.js       # the engine-bin invocation wrapper (this part)
  test/engine.test.js # unit tests for the wrapper (this part)
```
Mirror `engine/package.json` shape (READ it: `{"name":"@craft/engine","type":"module","private":true,
"scripts":{"test":"node --test 'test/**/*.test.js'"}}`). The Pi adapter is Node so its deterministic
seams run under `node --test` in CI (ADR-089).

**`adapters/pi/src/engine.js` — the engine-bin invocation wrapper.** It calls the engine's existing
bins to get the SAME deterministic outputs the Claude orchestrator consumes (DESIGN §"Pi adapter
shape", lines 252–267):
- `resolvePipeline()` → run `node <repoRoot>/engine/bin/pipeline-resolve.js <repoRoot>/pipeline/default.yml`
  via `execFile` (argv array, NO shell — untrusted-input discipline from `backlog.md`), parse stdout
  JSON → return `resolution` (the `{ ok, effective, record, gateDecisions, waivers }` object;
  `effective[i]` now carries `model` after part 1). Non-zero exit → blocker (surface stderr).
- `assembleBlock(phaseId)` → run `node <repoRoot>/engine/bin/contract-assemble.js` for the phase
  (READ `engine/bin/contract-assemble.js` and `engine/src/contract-assemble-main.js` for the exact
  flag surface: `--descriptor-id <id>`, `--inline`, `--contracts-dir`, and the `--descriptor-json`
  path/`-` stdin form for registered phases — see `run/SKILL.md` lines ~120–135). Capture stdout = the
  injected block. Non-zero exit → blocker.
- Resolve `<repoRoot>` relative to the adapter file via `fileURLToPath(import.meta.url)` +
  `join(__dir, '..', '..', '..')` (adapters/pi/src → repo root is three up). Confirm by asserting
  `engine/bin/pipeline-resolve.js` exists at the resolved path in a test.
- Pure orchestration: no business logic duplicated from the engine — the adapter REUSES the core
  byte-for-byte (the load-bearing P16 thesis). Backlog/VCS reuse is config (DESIGN matrix): document in
  a header comment that Backlog `file`/`custom` and the SP8 worktree scripts are called directly,
  unchanged — but binding those is parts 5–6, not here.

**Public-surface decision (up front):** every symbol exported from `adapters/pi/src/**`
(`resolvePipeline`, `assembleBlock` here; `buildPiArgs`/`runPhase`/`parseUsage`/`toolCallGuard` in
part 5; `runAcceptanceProbe` in part 6) is **internal to the `@craft/adapter-pi` package** —
consumed only by that package's own bin/tests. The package is `private: true`; this repo has NO
adapter barrel, facade, generated API report, exhaustiveness switch, or registry that an adapter
export must register with (the engine's `engine/src/index.js` re-export surface is core-only and the
adapter does NOT extend it). So there is NO downstream surface gate to pre-pay — exports stay package-
internal. Do NOT add an `adapters/pi/index.js` barrel (YAGNI: one consumer).

**CI test-home (CRITICAL fact 3) — extend `scripts/ci.sh`:**
- `engine/test` is core-only; ci.sh line 12 runs only `cd engine && node --test`. Add a SECOND
  `node --test` invocation for the adapter with its OWN count guard so the engine `EXPECTED_TESTS=634`
  invariant is untouched (ADR-085 — adapter code must not perturb the core test contract). Insert after
  the engine block (before the `bats … && shellcheck …` chain on line 24):
  ```bash
  EXPECTED_PI_TESTS=<N₄>   # this part's adapters/pi test count
  pi_output="$(cd adapters/pi && node --test 'test/**/*.test.js' 2>&1)" && pi_status=0 || pi_status=$?
  echo "$pi_output"
  [ "$pi_status" -eq 0 ] || { echo "ci: adapters/pi node --test failed (exit ${pi_status})" >&2; exit "$pi_status"; }
  actual_pi_tests="$(printf '%s\n' "$pi_output" | awk '/^# tests / {print $3}')"
  [ "$actual_pi_tests" = "$EXPECTED_PI_TESTS" ] || { echo "ci: pi test count drift — expected ${EXPECTED_PI_TESTS}, got ${actual_pi_tests}" >&2; exit 1; }
  ```
  Set `<N₄>` to the exact `# tests` count this part's `adapters/pi/test` emits. The engine
  `EXPECTED_TESTS=634` line is NOT touched.
- `scripts/ci.sh` shellcheck glob is `scripts/*.sh hooks/*.sh` — if this part adds ANY `.sh` under
  `adapters/pi/`, extend the glob to include `adapters/pi/**/*.sh` (this part is Node-only, so likely
  no glob change — state which in the commit). The ci.sh edit itself must pass `shellcheck scripts/*.sh`.

### TDD steps

- **RED** — `adapters/pi/test/engine.test.js`: assert `resolvePipeline()` returns an object with
  `ok === true` and `effective` containing a phase whose `id === 'implementation'` and `model === 'sonnet'`
  (proving it reuses the part-1 descriptor surfacing through the real bin), and that `assembleBlock('design')`
  returns a non-empty string containing a known core marker (e.g. the blocker-protocol phrase
  `{ unit, reason, ≤3 options }` — READ `contracts/core.md` to pin an exact substring). Run
  `cd adapters/pi && node --test 'test/**/*.test.js'` → fails (`src/engine.js` does not exist).
  Failure reason: module-not-found / function undefined.
- **GREEN** — implement `adapters/pi/src/engine.js` with `execFile`-based (argv-array, no-shell)
  invocation of the two engine bins, repo-root resolution, JSON parse, non-zero-exit→throw(blocker).
  Re-run → green.
- **REFACTOR** — extend `scripts/ci.sh` with the `EXPECTED_PI_TESTS` block; run `bash scripts/ci.sh`
  end-to-end → engine `# tests 634` AND adapters/pi `# tests <N₄>` both green; `shellcheck scripts/*.sh
  hooks/*.sh` passes on the edited ci.sh. State `<N₄>` (the counted value) in the gate line.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'` (expect `# tests <N₄>`), then `bash scripts/ci.sh`
(engine `# tests 634` unchanged + adapters/pi `# tests <N₄>` guarded + all lints green). Never commit on red.

### Commit

`feat(adapters-pi): scaffold + engine-bin invocation wrapper with CI test-home (ADR-085)`

---

## Part 5 — adapters/pi: subprocess Execution binding + tool_call gate predicate

### Context

Builds on part 4's wrapper. Binds the two CI-DETERMINISTIC Pi seams (ADR-089: these ARE unit-tested in
CI; the LIVE Pi run is not): the subprocess Execution binding (ADR-090: `pi -p` / `--mode json`) and
the `tool_call` gate predicate (DESIGN §"Pi adapter shape" Gate row + §"Test strategy" gate-guard unit
check, lines 336–337). Pinned Pi surface (DESIGN lines 66–116 — do NOT re-derive from memory):

- Package `@earendil-works/pi-coding-agent@0.79.8`, bin `pi`. Execution: `pi -p "<query>"`
  (print-and-exit) and `pi --mode json` (JSONL event stream incl. the `usage` block for the run record).
- Gate veto shape is EXACTLY `return { block: true, reason?: string }` — there is NO `permission: "deny"`
  shape. `tool_call` handler errors BLOCK the tool (fail-safe). The hook fires after
  `tool_execution_start`, before the tool executes.

**Files (extend the part-4 tree):**
- `adapters/pi/src/execution.js` — `buildPiArgs(injectedBlock, dynamics, { jsonMode }) → string[]`: the
  PURE subprocess-arg shaper returning the argv array for `pi` (`['-p', prompt]` or `['--mode','json','-p',prompt]`).
  Untrusted-input discipline (`backlog.md`): the prompt is a single discrete argv element, never
  interpolated into a shell string; `execFile('pi', args)` not `exec`. Plus `runPhase(phaseId, ctx)` that
  composes part-4's `assembleBlock` + `buildPiArgs` + `execFile`, returning `{ finalMessage, usage,
  exitCode }`; non-zero exit → blocker. The `usage` parse from `--mode json` JSONL is a pure function
  `parseUsage(jsonlText) → usage|null` (split on `\n` only — strict LF, DESIGN line 86).
- `adapters/pi/src/gate.js` — `toolCallGuard(event) → { block: boolean, reason?: string }`: the PURE
  predicate enforcing the mechanical guards Claude does via PreToolUse hooks. Seed it with the same
  guards `gate.md` (part 3) documents: (i) a `git diff`/`git show` tool call lacking `--no-ext-diff` →
  `{ block: true, reason }` (mirrors `hooks/git-no-ext-diff.sh` — READ it for the exact match logic);
  (ii) a tool call writing a path OUTSIDE the working dir → `{ block: true }`. A permitted call →
  `{ block: false }`. This is "the one deterministically-testable seam of the adapter" (DESIGN line 337).
  Keep it a pure function of the event (no live Pi session) so it is fully unit-testable.

These are FEATURE seams → their tests FOLD into this part (sizing rule: no standalone test-only part
for feature code). All live under `adapters/pi/test/` → count goes into `EXPECTED_PI_TESTS`, never
`EXPECTED_TESTS`.

### TDD steps

- **RED (gate predicate)** — `adapters/pi/test/gate.test.js`: `toolCallGuard` Given a `git diff`
  tool-call event WITHOUT `--no-ext-diff` returns `{ block: true }`; Given the same WITH `--no-ext-diff`
  returns `{ block: false }`; Given a write to a path outside the working dir returns `{ block: true }`.
  Run `cd adapters/pi && node --test 'test/**/*.test.js'` → fails (`gate.js` absent).
- **RED (arg shaper / usage)** — `adapters/pi/test/execution.test.js`: `buildPiArgs(block, dyn, {jsonMode:false})`
  returns `['-p', <prompt>]` with the prompt as ONE element (assert the array length + that the prompt
  element contains the injected block verbatim, no shell metachar splitting); `{jsonMode:true}` prepends
  `['--mode','json']`. `parseUsage` Given a JSONL stream containing a `usage` event returns the usage
  object; Given LF-delimited input with a trailing partial line splits on `\n` only. Fails (`execution.js`
  absent).
- **GREEN** — implement `gate.js` (pure predicate, early-returns, named constants for the guarded flags,
  no nesting >2) and `execution.js` (`buildPiArgs` pure; `parseUsage` pure; `runPhase` composing
  `assembleBlock` + `execFile('pi', …)`). Re-run → green.
- **REFACTOR** — dedupe any guard-flag constants shared with the `gate.md` doc intent; update
  `scripts/ci.sh` `EXPECTED_PI_TESTS` to the new total (part-4 N₄ + this part's added tests). Run
  `bash scripts/ci.sh` → engine 634 unchanged, adapters/pi new total green.

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'` (expect the new `# tests` total), then
`bash scripts/ci.sh` with `EXPECTED_PI_TESTS` updated to that total (engine `EXPECTED_TESTS=634`
untouched). Never commit on red.

### Commit

`feat(adapters-pi): subprocess execution binding + tool_call gate predicate (ADR-090)`

---

## Part 6 — adapters/pi: acceptance-probe harness (one construction phase, mktemp-isolated)

### Context

Builds on parts 4–5. Implements the acceptance-probe RUNNER that drives ONE construction-bearing phase
end-to-end through the Pi adapter (ADR-088/DC-5: a single construction phase is the literal program gate
R-pi-scenario). Per ADR-089/DC-6 the LIVE Pi run is an ON-DEMAND smoke, NOT CI-gated — so this part
lands the runner + its DETERMINISTIC parts (unit-tested in CI) and the structural assertions; actually
EXECUTING the live Pi run is on-demand (part 7 records its evidence). **If Pi cannot be installed
in-env, the runner + deterministic tests still land; the live invocation escalates as a blocker
(ADR-084) — it does not block this part's commit, which gates on the deterministic units.**

**Safety (DESIGN §Acceptance probe line 295; SP8; the state-mutating-probe rule):** the entire probe
runs in a `mktemp` throwaway repo, NEVER the worktree. Pi's `tool_call`/exec surface and any
`commit`/`git` verb mutate only the throwaway. The runner MUST create the throwaway via `mktemp -d`,
`isolate` it (VCS port — `git init` / the worktree script), run the phase there, and assert mutations
stayed inside it.

**Files (extend the part-4/5 tree):**
- `adapters/pi/src/probe.js` — `runAcceptanceProbe({ piRunner, fsOps }) → { passed, evidence }`. It:
  1. `mktemp -d` a throwaway repo, `isolate` it (VCS `isolate`).
  2. Assemble the `construction`/`implementation` injected block via part-4 `assembleBlock` +
     a tiny free-text brief as dynamics.
  3. `select` a Pi model tier→provider via the Model binding (map `implementation`'s `sonnet` tier).
  4. `spawn` ONE Pi run via part-5 `runPhase` under the injected `construction` contract, with the
     part-5 `toolCallGuard` armed + the engine-owned gate command wrapped as a subprocess gate.
  5. Assert STRUCTURE only (DESIGN line 288–292 — NEVER LLM prose, because Pi runs a different model
     and content differs): a RED→GREEN→commit part landed; the gate ran and was GREEN before the commit
     (never-commit-on-red); the working tree mutated ONLY inside the throwaway; a committed artifact
     exists as the handoff.
  6. Return `evidence` (target identity, Pi version, model, ports exercised, per-phase outcome) for
     part 7's record doc.
- The Pi process invocation + filesystem ops are INJECTED (`piRunner`, `fsOps`) so the assertion logic
  is unit-testable WITHOUT a live Pi session (mirror the engine's IO-injection idiom — READ
  `engine/test-helpers/capture-io.js` for the pattern). The structural-assertion functions
  (`assertCommittedArtifact`, `assertGateGreenBeforeCommit`, `assertMutationsInsideThrowaway`) are PURE
  over a captured run-trace → fully CI-testable with a fixture trace.

**Test split:** the structural-assertion functions + the probe orchestration over an INJECTED fake
`piRunner`/`fsOps` are unit-tested in `adapters/pi/test/probe.test.js` (CI, deterministic — count into
`EXPECTED_PI_TESTS`). The LIVE Pi run is NOT in CI (ADR-089) — it is the on-demand smoke recorded in
part 7.

### TDD steps

- **RED** — `adapters/pi/test/probe.test.js`: with an INJECTED fake `piRunner` that returns a canned
  run-trace (a green RED→GREEN→commit with the gate green before the commit, mutations confined to the
  throwaway path) and a fake `fsOps`, `runAcceptanceProbe` returns `{ passed: true }` and `evidence`
  with the expected keys. A SECOND test: a trace with a commit-on-red → `{ passed: false }` (proves the
  never-commit-on-red structural assertion fires). A THIRD: a trace mutating a path OUTSIDE the throwaway
  → `{ passed: false }`. Run `cd adapters/pi && node --test 'test/**/*.test.js'` → fails (`probe.js`
  absent).
- **GREEN** — implement `probe.js` with injected `piRunner`/`fsOps`, the `mktemp -d` isolate step, and
  the three pure structural-assertion functions. Re-run → green.
- **REFACTOR** — extract the structural-assertion helpers into small pure functions (early returns, no
  nesting >2); update `scripts/ci.sh` `EXPECTED_PI_TESTS` to the new total. Run `bash scripts/ci.sh` →
  engine 634 unchanged, adapters/pi new total green. (The live smoke is NOT run here — it is part 7's
  on-demand evidence; this part's gate is the deterministic units only.)

### Gate

`cd adapters/pi && node --test 'test/**/*.test.js'` (expect the new `# tests` total), then
`bash scripts/ci.sh` with `EXPECTED_PI_TESTS` updated (engine `EXPECTED_TESTS=634` untouched).
Never commit on red.

### Commit

`feat(adapters-pi): acceptance-probe harness for one construction phase (ADR-088)`

---

## Part 7 — docs/adapters/pi-poc-record.md (on-demand smoke evidence)

### Context

Docs-only part (no `src/` delta) — standalone per the sizing EXCEPTION. The evidence doc for the Pi
PoC on-demand smoke (ADR-089/DC-6), mirroring `docs/SC5-second-instantiation-record.md` and ADR-080's
record pattern. This is the diffable proof of R-pi-scenario, refreshed when the smoke is re-run.

**Mirror shape — READ `docs/SC5-second-instantiation-record.md`** (its sections: a `> blockquote`
preamble explaining "engine path is CI-proven by fixtures; this records the on-demand RUNTIME smoke",
a `## Verdict: PASS`, a `## Target repo` table with attributes, then per-phase/per-port outcome). The
Pi record's fields (DESIGN line 291–293):
- target identity (the `mktemp` throwaway repo + the tiny free-text brief);
- **Pi version `0.79.8`** (pinned), the resolved model/provider used;
- ports exercised: Execution (`spawn` one Pi run under the `construction` contract), Model (`select` the
  `sonnet`-tier→Pi-provider mapping), Gate (the `tool_call` guard fired + the gate-command wrapper ran +
  never-commit-on-red held), VCS (`isolate` the throwaway, `commit` the handoff);
- per-phase outcome: RED→GREEN→commit landed, gate green before commit, mutations confined to the
  throwaway, committed artifact = the handoff.
- A `> not CI-gated` note pointing at the part-6 runner and explaining the live run is on-demand.

**Honest-state caveat (carry it explicitly in the doc):** if the live Pi smoke was run, record the
real outcome. If Pi could not be installed in-env at implementation time (the ADR-084 blocker case),
the record states **PENDING** with the reason and the exact on-demand command to run later — the
deterministic adapter + its CI units (parts 4–6) are the landed proof of the seams; the live run is the
runtime-fidelity smoke that this doc captures when executed. Do NOT fabricate a PASS for a run that did
not happen (mirrors `backlog.md`'s "complete path was not exercised live" honesty).

### TDD steps

Docs-only — no RED/GREEN unit cycle. Author `docs/adapters/pi-poc-record.md` mirroring the SC5 record
shape with the fields above. If the live smoke ran, transcribe its real per-port/per-phase outcome; else
record PENDING with the on-demand command and reason (no fabricated PASS). Verify `bash scripts/ci.sh`
stays green (no `src`/test delta; `EXPECTED_TESTS` stays 634; `EXPECTED_PI_TESTS` unchanged).

### Gate

`bash scripts/ci.sh` (full substrate; engine `# tests 634` + adapters/pi total both green, all lints
pass). Never commit on red. This is also the **phase-boundary gate** — run it once here to prove the
whole P16 change (boundary + Pi) leaves the substrate green.

### Commit

`docs(adapters): Pi PoC on-demand smoke evidence record (ADR-089)`
