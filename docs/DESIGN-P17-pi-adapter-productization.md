# Design — P17: Pi adapter productization

> Brief: productize the P16 Pi adapter PoC (PRD non-goal N4, multi-provider parity). Two deliverables,
> both under `adapters/pi/`: (1) the **`craft-pi` user entrypoint** that walks the engine-resolved
> pipeline and, per ADR-093, drives the **full 11-phase walk** — spawning `pi` for each worker phase
> and running a defined **headless step** for each role-less phase — gated by a **committed manifest**
> so every code-producing phase resolves a real gate; (2) the **live `pi.on("tool_call", …)` wrapper**
> around the already-pure `toolCallGuard` predicate, adding fail-safe try/catch and a `realpath`/`lstat`
> symlink-escape re-check the lexical guard cannot catch. The P16 library pieces (`engine.js`,
> `execution.js`, `gate.js`) are reused; the entrypoint adds one small contained change to `engine.js`
> (an optional manifest-path arg on each of `resolvePipeline`/`assembleBlock`) to thread the committed
> manifest into resolution + assembly — the engine bins already accept it. The
> git-invocation guard is NOT touched (standing parity constraint).
> Status: draft → revised against ADR-093 → self-reviewed ×3 → accepted

> **Revision note (ADR-093).** The first draft recommended **DC-1 = (a)**: a single-`implementation`
> PoC subset. The user **overrode that and ratified DC-1 = (c): the full 11-phase walk**
> (`docs/adr/093-craft-pi-drives-full-11-phase-walk.md`). This revision re-specifies the entrypoint as
> a full-walk bin: it classifies each phase as **worker** (has a `role` → spawn `pi`) or **role-less**
> (no `role` → a session-owned step in Claude; in the non-interactive bin, a defined **headless step**),
> ships a **committed manifest** so every worker-phase gate resolves to a real command, and surfaces the
> genuinely-new forks the full walk opens (headless `decisions`/`integrate`/`propose`, `workspace` in a
> bin, the manifest's home + wiring, gate mechanics across all phases). Deliverable 2 (the `tool_call`
> wrapper + symlink re-check) is **unchanged** — (c) does not touch it. The previously-adopted DC-2/-3/
> -4/-5/-6/-7 still hold; DC-4's file list, the Test strategy, and Out-of-scope are updated to cover the
> full walk + the role-less steps + the committed manifest. Old **DC-8** ("gate-command execution when
> the resolved gate is a placeholder") is **superseded** by ADR-093's "the committed manifest resolves
> all gates" — re-expressed as the new **DC-G** (gate mechanics across all phases).

## Context

### What P16 landed (the library; reused here)

P16 (ADR-084..092, `docs/DESIGN-P16-provider-agnostic.md`) extracted the six-port hexagon and proved
portability with an **on-demand smoke** — not a user-facing bin. What exists in `adapters/pi/` today,
pinned against this worktree:

| File | Symbol(s) | Signature / shape | Status |
|---|---|---|---|
| `adapters/pi/src/engine.js` | `resolvePipeline()` | `→ Promise<{ ok, errors, effective, record, gateDecisions, waivers }>` — shells `node engine/bin/pipeline-resolve.js pipeline/default.yml` via the private `run()` (`execFile`), parses JSON. **Pinned: NO manifest argument is passed** (`run('node', [PIPELINE_RESOLVE_BIN, DEFAULT_PIPELINE])`, engine.js:56). | done |
| | `assembleBlock(phaseId)` | `→ Promise<string>` — shells `node engine/bin/contract-assemble.js --descriptor-id <id> --contracts-dir contracts/` (engine.js:67-74). **Pinned: NO `--manifest` is passed.** | done |
| | `run(file, args)` (private) | `→ Promise<string>` — `execFile(file, args, { encoding:'utf8' })`; non-zero exit rejects `new Error("{ unit: engine-bin, reason: <stderr|message> }")` (engine.js:34-45). | done |
| `adapters/pi/src/execution.js` | `buildPiArgs(injectedBlock, dynamics, { jsonMode })` | `→ string[]` argv for `execFile('pi', args)`; prompt is one discrete argv element; prepends `--mode json` when `jsonMode`. Prompt = `${injectedBlock}\n\n## Phase dynamics\n${k: v…}`. | done |
| | `parseUsage(jsonlText)` | `→ object\|null` — LF-split JSONL, returns the `usage` event payload (`event.type === 'usage'` → `event.usage`). | done |
| `adapters/pi/src/gate.js` | `toolCallGuard(event)` | **PURE** `({ tool, tool_input, working_dir }) → { block, reason? }`; private `guardBashCommand`, `guardWritePath`; `GIT_DIFF_SHOW_RE`; `WRITE_TOOLS = {Write,Edit,NotebookEdit}`. | done |
| `adapters/pi/src/probe.js` | `runAcceptanceProbe({ piRunner, fsOps })` | `→ Promise<{ passed, evidence }>` — DI'd probe driver, structural assertions only. | done (smoke harness) |

The P16 acceptance smoke ran one construction phase end-to-end on **Gemini** (non-Claude), recorded in
`docs/adapters/pi-poc-record.md` (PASS, 2026-06-20). That record pins three runtime facts P17 inherits:

- **stdin MUST be ignored** (`/dev/null`): `pi` hangs waiting for interactive input in `-p` mode with
  an open stdin pipe.
- the craft `sonnet` tier was mapped to `google/gemini-2.5-flash` for the free-tier smoke (Anthropic
  unavailable — account credit). The mapping lived in the (uncommitted) one-off runner, **not** in
  committed adapter code; DC-3 (passthrough) keeps it out of committed code.
- the smoke was driven by an *uncommitted* `piRunner`; `runAcceptanceProbe` requires the caller to
  inject `piRunner` + `fsOps`.

### What the entrypoint consumes (engine resolution shape, pinned empirically)

`node engine/bin/pipeline-resolve.js pipeline/default.yml` (zero-manifest) returns the resolution the
Claude orchestrator also consumes. Pinned this checkout (the 11-phase SoT is `pipeline/default.yml`):

```
keys: { ok, errors, effective, record, gateDecisions, waivers }
effective: 11 phases, in order:
  id             | archetype     | role                      | descriptor gate   | model | kind
  workspace      | setup         | —                         | —                 | —     | role-less
  design         | specification | craft:designer            | —                 | opus  | worker
  decisions      | specification | —                         | —                 | —     | role-less
  planning       | specification | craft:planner             | plan-lint         | opus  | worker
  implementation | construction  | craft:slice-implementer   | <gates.phase>     | sonnet| worker
  review         | harness       | craft:reviewer            | <gates.phase>     | opus  | worker
  refactoring    | refinement    | craft:refactor-executor   | <gates.phase>     | sonnet| worker
  validation     | harness       | craft:validation-triager  | <validation gate> | sonnet| worker
  documentation  | delivery      | craft:docs-writer         | —                 | sonnet| worker
  propose        | delivery      | —                         | pr.pre-pr-gate    | —     | role-less
  integrate      | delivery      | —                         | —                 | —     | role-less
```

**Seven worker phases** carry a `role` (design, planning, implementation, review, refactoring,
validation, documentation): the bin drives each by spawning `pi`. **Four role-less phases** carry no
`role` (workspace, decisions, propose, integrate): in the Claude adapter these are *session-owned*,
driven interactively by the orchestrator (`skills/run/SKILL.md` "Session-owned responsibilities by
archetype"). The non-interactive bin (`pi -p`, stdin ignored) has no interactive session to own them,
so P17 designs a **headless step** for each (§Role-less phases).

Five load-bearing facts for the full-walk entrypoint, **pinned not assumed** (ran in throwaway dirs):

1. **`gateDecisions` is a LIST** of `{ phaseId, gate, codeProducing }` (the `propose` entry also carries
   `awaitingHarnesses[]`). Look-up is `gateDecisions.find(d => d.phaseId === id)`, NOT an object index.

2. **The engine returns gate strings as literal placeholders, even with a manifest.** Pinned twice:
   - Zero-manifest, `implementation` → `{ gate: "<gates.phase>", codeProducing: true }` and the run is
     still `ok: true` — the placeholder string is truthy, so the code-producing **floor** check
     (`gates.js` `resolveGateDecisions`: `if (codeProducing && !gate)`) does **not** fire.
   - With a manifest `gates: { phase: "node --test" }`, `implementation`'s `gateDecisions` entry is
     **still** `gate: "<gates.phase>"` — the manifest value does **not** lift the placeholder in
     `gateDecisions`. (`resolveGate` in `gates.js` returns `descriptor.gate` first when truthy, and
     `descriptor.gate` is the literal `<gates.phase>`; the `manifest.gates[phaseId]` branch keys by
     phase id and never sees the `phase`/`slice` cadence keys.)
   - **Therefore the placeholder→command substitution is the orchestrator's job, not the engine's.**
     The Claude `implementation` skill does it (`skills/implementation/SKILL.md` lines 10-14: "Probe
     gates: `gates.slice` … `gates.phase`"): it reads the manifest's `gates` map and substitutes
     `<gates.phase>` → `manifest.gates.phase`, `<validation gate>` → `manifest.gates.phase`/the
     validation gate, falling back to a probed command, REFUSING if a code-producing phase has none.
     **The bin must replicate this substitution** (§Gate mechanics; DC-G). This is the deepest
     consequence of (c): the committed manifest is what makes the placeholders resolve to real commands.

3. **A manifest is wired through the engine bins, which already accept it.** `pipeline-resolve.js`
   takes `[manifest.yml]` as an optional second positional (`pipeline-resolve-main.js` `parseArgs`,
   lines 79-81); `contract-assemble.js` takes `--manifest <path>` (`contract-assemble-main.js`
   `parseArgs`, line 46-49). The adapter's `resolvePipeline()`/`assembleBlock()` simply do **not pass
   them today**. Threading the committed manifest path through both calls is a small, contained change
   to `engine.js` (DC-MAN), not a new engine path.

4. **`parseManifestContent`** (`engine/src/frontmatter.js:50`) parses the committed manifest:
   a fenced `.claude/workflow.md` (YAML frontmatter + prose body) **or** a bare-YAML fixture — both
   yield `{ gates, pr, … }`. The bin reads the manifest's `gates` map from this to do the substitution.

5. `effective[i]` for a worker phase carries: `id, archetype, enabled, contract[], procedure,
   consumes[], self_supply[], produces[], execution, role, gate, model`. The entrypoint maps
   `role`→worker, `model`→Model port (DC-3), the **substituted** gate→Gate port, `id`→`assembleBlock`.

### What each role-less phase actually does (pinned from its skill + scripts)

| Phase | Claude (session-owned) | Deterministic core | Interactive / LLM-judgment core | Headless analogue (this doc, §Role-less phases) |
|---|---|---|---|---|
| `workspace` | branch + worktree, in-worktree deps, tooling activation | `git worktree add`; `scripts/worktree-setup.sh <path> [post]` (lockfile-probed install); branch/path collision = STOP | infer branch type from brief; manifest `context:` tooling activation | bin runs inside an already-prepared checkout (DC-WS); no worktree creation in the bin |
| `decisions` | per-candidate ADR conversation with the user | ADR dir/template/number probe; commit `docs(adr): NNN …` | **the user decides each load-bearing fork** (`skills/decisions/SKILL.md` step 2); zero-candidate = honest no-op | **no-op with a recorded note** by default (DC-DEC); P19 makes "nothing to do" a first-class outcome |
| `propose` | pre-PR gate, push, `gh pr create` | `git push -u`; `gh pr create` (body from docs phase); **no remote → propose+integrate no-op** (`skills/propose/SKILL.md` preamble) | PR body synthesis | deterministic push + PR **iff** remote+`gh`+auth present, else **recorded no-op** (DC-PROP) |
| `integrate` | monitor CI to green, **user confirms merge**, cleanup | `gh pr merge --squash --delete-branch`; `scripts/worktree-teardown.sh` | **the user confirms the merge** (`skills/integrate/SKILL.md` step 2: "never merge unprompted") | **stop-before-merge** by default (DC-INT): push/PR done, STOP, human merges |

### The hexagon boundary P17 binds (already documented)

`docs/adapters/{execution,model,gate,vcs,backlog}.md` are the adapter-author contracts (P16). P17
*binds* Execution + Model + Gate + VCS for the `craft-pi` entrypoint across the full walk; it adds **no
new port** and changes **no port spec semantics**. Relevant pinned clauses:

- `execution.md` Pi binding: "`spawn`: `pi -p` via `execFile`, argv array, no shell interpolation;
  optionally `--mode json`. `runInline`: Pi has no harness-native inline concept; treat as sequential
  per-phase subprocess — one `pi -p` per phase, artifact-handoff carries state." Pi omits sub-agents →
  **sequential per-phase runs** across all seven worker phases.
- `gate.md` Pi binding: "`pi.on("tool_call", handler)` returns `{ block: true, reason }`; veto shape is
  exactly `{ block: true }`, no `permission: "deny"`. Handler errors block fail-safe." For
  **gate-command**: "the resolved gate string is run as a normal subprocess via `execFile` … argv array,
  no shell. The never-commit-on-red invariant applies identically — non-zero exit blocks the commit."
- `model.md` Pi binding: "`select`: map craft tier (`opus|sonnet|haiku`) to a Pi provider+model … the
  tier→provider mapping is the adapter's concern; the resolution order is core policy."

### Standing constraint (stated, NOT a task)

The git-invocation guard (`GIT_DIFF_SHOW_RE` in `adapters/pi/src/gate.js` and the identical `GIT_RE` in
`hooks/git-no-ext-diff.sh`) is bypassable by compound commands / qualified binaries / env-prefixes —
**identically in both files, deliberately** (Claude↔Pi parity; 19 mutation survivors accepted-by-parity).
It guards output-mangling, not security. **P17 does not touch it.** Any future tightening lands in BOTH
files together, never Pi-only. The symlink-escape re-check (Deliverable 2b) is a *write-path* hardening
on the `WRITE_TOOLS` branch — orthogonal to the git-guard regex, and lives only in the wrapper, not the
predicate, so parity is unaffected.

## Requirements

When P17 ships, both deliverables are verifiable:

**Deliverable 1 — the `craft-pi` full-walk entrypoint:**

| # | Requirement | Source | Mechanism (this doc) |
|---|---|---|---|
| R-bin | A user-facing `craft-pi` entrypoint exists, invocable without arguments, that drives a craft run on Pi | ADR-086; ADR-093; BACKLOG P17 | §Entrypoint shape; DC-2 |
| R-walk | The entrypoint walks the engine-resolved `effective[]` in order across **all 11 phases**, classifying each as worker or role-less | ADR-093; pinned resolution | §Phase walk |
| R-worker | For each **worker phase** (has a `role`) the bin assembles that phase's block (`assembleBlock(id)` **with the manifest**), shapes the args (`buildPiArgs`), and spawns `pi` (stdin ignored) | execution.md; ADR-093 | §Worker phases |
| R-roleless | For each **role-less phase** the bin runs the defined **headless step** (workspace/decisions/propose/integrate) — never an LLM run, never a silent skip; each step's behaviour is recorded | ADR-093; the four skills | §Role-less phases; DC-WS/DC-DEC/DC-PROP/DC-INT |
| R-manifest | A **committed manifest** ships with the adapter so every code-producing phase's gate placeholder resolves to a real command; the bin threads it into resolution + assembly and substitutes `<gates.phase>`/`<validation gate>` from its `gates` map | ADR-093 ("committed manifest resolves all gates") | §The committed manifest; §Gate mechanics; DC-MAN/DC-G |
| R-reuse | The entrypoint reuses `engine.js` + `execution.js` (imports the existing exports); the only `engine.js` change is threading the manifest path into the two bin calls (DC-MAN); zero engine logic is re-implemented | BACKLOG P17 "MUST be reused byte-for-byte"; ADR-093 | §Entrypoint shape; DC-MAN |
| R-argv | `pi` is always spawned via `execFile('pi', argv)` with the prompt as one discrete argv element and **stdin ignored** (`/dev/null`); never an interpolated shell string | pi-poc-record; execution.md | §Spawn discipline |
| R-invariants | The walk honours the cross-phase invariants the Claude orchestrator owns: artifact-is-the-handoff, gate-before-commit (never commit on red, across **every** code-producing phase), executing-harness gates `propose` (validation triage before `propose` runs) | run/SKILL.md cross-phase invariants; gate.md | §Gate mechanics; §Cross-phase invariants |
| R-headless-safe | No headless step performs an **irreversible or outward-facing** action (merge; force-push) without an **explicit opt-in**; the default never merges | ADR-093 (headless semantics); integrate.md | §Role-less phases; DC-INT |
| R-no-sc1 | The default Claude `/craft:run` path is byte-identical — `craft-pi` is a separate entrypoint, no manifest schema change, no edit to engine resolution logic (only the adapter threads an already-accepted arg) | ADR-086; R-sc1 (P16) | §Entrypoint shape |

**Deliverable 2 — the live `tool_call` wrapper (UNCHANGED by ADR-093):**

| # | Requirement | Source | Mechanism |
|---|---|---|---|
| R-wrap | A live `pi.on("tool_call", async (event, ctx) => { … })` wrapper exists that adapts a Pi `tool_call` event to a `toolCallGuard` event and returns Pi's veto shape `{ block: true, reason? }` | gate.md; BACKLOG P17 | §Tool-call wrapper |
| R-failsafe | The wrapper wraps the guard call in try/catch and returns `{ block: true }` on **any** throw (fail-safe) | BACKLOG P17 (a); P16 review flag | §Tool-call wrapper |
| R-symlink | Before permitting a **write** (Write/Edit/NotebookEdit), the wrapper `realpath`/`lstat`-resolves the write target's parent directory and re-checks containment, defeating symlink escapes the lexical `resolve()` guard cannot catch | BACKLOG P17 (b); P16 review flag | §Symlink re-check; DC-5 |
| R-pure | `toolCallGuard` stays a pure predicate — both (a) and (b) live in the wrapper, never the predicate | BACKLOG P17 | §Tool-call wrapper |
| R-parity | The wrapper does not alter the git-guard regex or its parity with `hooks/git-no-ext-diff.sh` | standing constraint | §Cross-phase invariants; Out of scope |

## Design

### The crux: a full-walk bin over reused engine seams, gated by a committed manifest

Both deliverables are **bindings of seams P16 already documented**. The full walk (c) keeps that —
pipeline resolution, contract assembly, the guard predicate, the arg shaper are reused — and adds:
(i) a **manifest thread** so the engine resolves against the committed adapter manifest (one-line
`engine.js` change, DC-MAN); (ii) a **placeholder→command gate substitution** the orchestrator already
does in Claude (DC-G); (iii) a **worker-vs-role-less classifier** and a **headless step per role-less
phase** (§Role-less phases). P17 is **glue + I/O + the four headless steps + the two review-flagged
hardenings + the committed manifest**.

```
   user runs: craft-pi  (inside a prepared checkout — DC-WS)
        │
        ▼
   src/cli.js  (DC-2: bin in package.json → src/cli.js; thin)
        │  manifestPath = MODULE_REL_MANIFEST              ← adapters/pi/.claude/workflow.md (DC-MAN)
        │  manifest = parseManifestContent(read(manifestPath))  ← §The committed manifest
        │  resolvePipeline(manifestPath)                   ← engine.js (manifest threaded, DC-MAN)
        │  for each phase in effective[] (ALL 11), in order:
        │    if WORKER (has role):                         ← §Worker phases
        │       block = assembleBlock(id, manifestPath)    ← engine.js (manifest threaded, DC-MAN)
        │       gate  = resolveGateCommand(phase, manifest)← §Gate mechanics (DC-G) substitute placeholder
        │       argv  = buildPiArgs(block, dynamics,{jsonMode:true})  ← execution.js (reused; DC-6)
        │       result= spawnPi(argv, {cwd, env})          ← NEW thin spawn (src/run.js)
        │          └─ pi process, tool_call wrapper armed (subprocess extension path, DC-7)
        │       if codeProducing: runGate(gate) green before commit  ← never-commit-on-red
        │       parseUsage(stdout) → run record            ← execution.js (reused; DC-6)
        │    else ROLE-LESS:                               ← §Role-less phases
        │       workspace  → assert prepared checkout, record   (DC-WS)
        │       decisions  → no-op + record                     (DC-DEC)
        │       propose    → push + gh pr create IF remote/gh, else no-op  (DC-PROP)
        │       integrate  → STOP before merge (push/PR done, human merges) (DC-INT)
        ▼
   committed artifact = handoff to the next sequential phase
```

New code lives in `adapters/pi/src/` (DC-4): `cli.js` (entry), `run.js` (the walk + classifier +
spawn + gate cadence + manifest thread), `roleless.js` (the four headless steps, DI'd), and
`tool-call-hook.js` (the wrapper + symlink re-check). The committed manifest is a data file shipped
**under `adapters/pi/`** and resolved by the bin via an absolute path relative to its own module
location (the `engine.js` `REPO_ROOT` idiom), so the adapter's shipped gates load regardless of the
launch cwd (DC-MAN).

### Entrypoint shape (`craft-pi`)

**Invocation (DC-2, bin → `src/cli.js`):** add a `bin` field to `adapters/pi/package.json`:
`"bin": { "craft-pi": "src/cli.js" }`, and a shebang'd `src/cli.js` mirroring the engine thin-bin idiom
(`engine/bin/*.js`: shebang, `import { main } from '../src/run.js'`, guard on
`process.argv[1] === fileURLToPath(import.meta.url)`, `process.exit(await main(...))`). `cli.js` holds
**no logic** — it parses argv, calls `main`, maps the result to an exit code. Matches the repo's
established `bin/X.js` → `src/X-main.js` split, keeps `main` DI-testable (`cli.js` is the only
un-unit-tested line), is the smallest selection mechanism per ADR-086.

**`main(argv, io, deps)` (in `src/run.js`):**
- `io = { stdout, stderr }` (injected, never `process.*` inside `main`).
- `deps = { resolvePipeline, assembleBlock, spawnPi, runGate, loadManifest, rolelessSteps, env }` — DI
  for unit-testing the full walk without a live `pi` or a live FS; defaults wire the real `engine.js`
  exports, the real `spawnPi`, the real `runGate`, the real manifest load, and the real `roleless.js`
  steps.
- Returns a number exit code; `0` = walk completed, `2` = blocker (resolution failed / a worker phase
  exited non-zero / a gate red / a role-less step blocked).

**Reuse (R-reuse):** `run.js` imports `resolvePipeline`, `assembleBlock` from `./engine.js` and
`buildPiArgs`, `parseUsage` from `./execution.js`. The **only** `engine.js` change is DC-MAN — thread
the committed-manifest path into the two bin calls (the bins already accept it). No engine business
logic is re-implemented.

### The committed manifest (R-manifest; DC-MAN)

ADR-093 requires a committed manifest "so every phase gate resolves [to a] real command", **shipping
with the adapter**. It lives **under `adapters/pi/`** (DC-MAN, recommend `adapters/pi/.claude/workflow.md`)
and the bin resolves its absolute path **relative to its own module location** (the `engine.js`
`REPO_ROOT` idiom: `dirname(fileURLToPath(import.meta.url))` → up to `adapters/pi/`), so the adapter's
shipped gates always load **regardless of the launch cwd** and the launch repo's own `.claude/` stays
the *target's* concern. (`.claude/workflow.md` is the canonical manifest filename —
`examples/gate-command/workflow.md` frontmatter: "In your real repo this file lives at the project root
as `.claude/workflow.md`" — and `parseManifestContent` parses the fenced file.) Minimum contents — a
`gates` map so the construction/harness placeholders resolve:

```yaml
---
# craft-pi committed manifest — resolves every code-producing phase's gate.
# No provider/model pinned here (DC-3 passthrough): craft-pi stays provider-neutral.
gates:
  phase: "node --test"        # the authoritative phase-boundary gate for implementation/refactoring/review
  # slice:  (optional) targeted per-slice gate; omit → falls back to gates.phase per slice
---
# craft-pi manifest (policy rationale in prose body — never reaches the YAML parser)
```

- **No `adapter:` key, no provider/model pin** (DC-3 passthrough preserved per ADR-093 consequences):
  the manifest carries gate commands only. The tier→provider selection is `spawnPi`'s concern via
  operator-supplied `--provider`/`--model` + env (DC-3).
- **Validity**: `gates` accepts exactly `{ slice, phase, review-batch }` (`engine/src/manifest.js`
  `GATE_FIELDS`). `parseManifestContent` parses the fenced file. The committed manifest is a **shipped
  artifact, lint-clean by construction** — `pipeline-resolve.js` parses but does **not** run
  `validateManifest` (the Claude path lints separately, run/SKILL.md step 1), so the bin does **not**
  re-lint at runtime; instead a **CI/unit test asserts the committed manifest passes `validateManifest`**
  (§Test strategy). A malformed committed manifest is caught in CI, never silently mis-resolves at run.
- **`<validation gate>`**: `validation`'s descriptor gate is `<validation gate>` (a separate literal).
  The substitution maps it to `manifest.gates.phase` (the validation triage gate is the same project
  gate; the engine has no distinct `gates.validation` key), or a probed mutation command — but
  validation is non-code-producing (`codeProducing:false`), so a missing gate is a no-op, not a floor
  error (§Gate mechanics).
- **`propose`'s `pr.pre-pr-gate`**: resolves only if the manifest declares `pr.pre-pr-gate`; absent →
  the gate string `pr.pre-pr-gate` is an unmatched literal, treated as "no pre-PR gate" by the propose
  step (it is non-code-producing). Optional to add; not required for never-commit-on-red.

**DC-MAN wiring** — `engine.js` change (the one allowed edit to the reused lib):
- `resolvePipeline(manifestPath)` → `run('node', [PIPELINE_RESOLVE_BIN, DEFAULT_PIPELINE, manifestPath])`
  when `manifestPath` is given (positional 2, already parsed by `pipeline-resolve-main.js`).
- `assembleBlock(phaseId, manifestPath)` → append `['--manifest', manifestPath]` when given
  (already parsed by `contract-assemble-main.js`). The manifest is threaded into assembly so any
  manifest `context:` is appended to the injected block, matching the Claude path.
- Both arguments are **optional** — the existing zero-arg call paths (and the P16 smoke) are unchanged,
  preserving R-no-sc1.

### Phase walk

`main` loads the committed manifest (path + parsed object), calls `resolvePipeline(manifestPath)`; on
`ok === false` it writes `resolution.errors` to `io.stderr` and returns `2` (never proceed on an
unresolved pipeline). On `ok`, it walks `effective[]` **in order across all 11 phases**, classifying
each by presence of `role`:

#### Worker phases (R-worker: design, planning, implementation, review, refactoring, validation, documentation)

1. `block = await assembleBlock(phase.id, manifestPath)` (reused, manifest threaded). A reject (bad id,
   bin failure) is the blocker-shaped `{ unit: engine-bin, reason }` error `engine.js` already throws —
   surface and return `2`.
2. `gateCmd = resolveGateCommand(phase, manifest)` (§Gate mechanics; DC-G) — substitutes the placeholder.
3. `dynamics = { phaseId: phase.id, model: phase.model, gate: gateCmd, … }`.
4. `argv = buildPiArgs(block, dynamics, { jsonMode: true })` (reused; `jsonMode` so `parseUsage` reads
   the run record — DC-6).
5. `result = await spawnPi(argv, { cwd, env })` — see §Spawn discipline. A non-zero `pi` exit is a
   blocker: surface `{ unit: pi-run, reason: <stderr> }`, **stop the walk**, return `2` (no later phase
   runs; no commit on a failed phase).
6. **Gate before commit** (only when `codeProducing` — implementation, refactoring): run `gateCmd` as a
   subprocess; non-zero exit blocks (never commit on red), return `2`. Harness phases (review,
   validation) are non-code-producing — they **propose**, they do not auto-commit (§Cross-phase
   invariants); their gate, when run, gates `propose` (R-invariants).
7. The committed artifact is the handoff; the next sequential phase reads it (no Pi sub-agents).

#### Role-less phases (R-roleless: workspace, decisions, propose, integrate)

The bin runs a **defined headless step** for each — never an LLM run, never a silent skip — and records
the outcome. Each step is a small DI'd function in `src/roleless.js` (so it unit-tests without touching
the real FS / git / gh). The recommended behaviours (decisions surfaced as DC-WS/DC-DEC/DC-PROP/DC-INT):

- **`workspace` (DC-WS):** the bin assumes it runs **inside an already-prepared checkout** (the bin is
  launched from somewhere; that somewhere is the working tree). The step asserts a git repo is present
  and records "workspace: using current checkout (bin context)". It does **not** create a worktree —
  worktree creation is the launcher's concern, and a bin creating its own worktree then `cd`-ing into it
  fights the isolation/safety rule (state-mutating runs in isolation is satisfied by the caller running
  `craft-pi` inside a throwaway/prepared dir, exactly as the P16 smoke ran in a `mktemp`).
- **`decisions` (DC-DEC):** **no-op with a recorded note** ("decisions: no-op (headless) — no
  interactive user to ratify forks"). Aligned with `skills/decisions/SKILL.md` (zero-candidate = honest
  no-op) and BACKLOG **P19** (a clean no-op is a first-class, recorded outcome for the decisions phase,
  not an implicit skip). The decision-candidates the design surfaced are the orchestrator's to ratify;
  a non-interactive bin has no user, so it records the no-op honestly and proceeds. The scope-fold rule
  (`skills/decisions/SKILL.md` step 5 — a deviation from the design's recommendation re-spawns the
  designer) is **moot in headless no-op**: a no-op ratifies nothing, so there is no deviation to fold
  back. (The design doc consumed by the worker phases is whatever was committed before `craft-pi` ran.)
- **`propose` (DC-PROP):** **deterministic push + PR iff remote+`gh`+auth are present**, else a recorded
  no-op. Mirrors `skills/propose/SKILL.md` ("no remote → propose AND integrate no-op with a note"). The
  step probes: remote configured? `gh` on PATH and authed? If yes → `git push -u origin <branch>` then
  `gh pr create` (body assembled from the documentation-phase artifact + run record). If no → record
  "propose: no-op (no remote / no gh / not authed) — work stays on the local branch" and continue. A
  push/PR failure is a blocker `{ unit: propose, reason }`.
- **`integrate` (DC-INT):** **stop-before-merge** (R-headless-safe). The step does **not** merge: the
  PR is open (or the branch pushed), and the bin STOPs, recording "integrate: stopped before merge —
  human merges (headless safety)". Merge is irreversible + outward-facing; ADR-093 directs strongly
  toward not performing such actions without explicit opt-in. (DC-INT surfaces an opt-in
  auto-merge-behind-a-flag alternative for the user.) No worktree teardown either — the bin did not
  create the worktree (DC-WS).

### Spawn discipline

`spawnPi(argv, opts)` (new, in `src/run.js`) is the one place `pi` is launched:

```
execFile('pi', argv, { cwd: opts.cwd, env: opts.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, cb)
```

Pinned discipline:
- **stdin ignored** (`stdio[0] = 'ignore'` → `/dev/null`): mandatory — `pi` hangs on an open stdin pipe
  in `-p` mode (pi-poc-record). The single most failure-prone runtime fact; asserted in a unit test
  against the spawn-options object (DI'd `execFile`).
- **argv array, never a shell string** (R-argv): `buildPiArgs` already guarantees the prompt is one
  discrete element; `spawnPi` never uses `exec`/`shell:true`.
- **non-zero exit = blocker**: the callback rejects with `{ unit: pi-run, reason: <stderr> }` mirroring
  `engine.js`'s `run()`; `main` surfaces it, stops the walk, returns `2`.
- **model/provider (DC-3 passthrough)**: `buildPiArgs` does **not** add `--model`/`--provider` — it only
  formats `dynamics` into the prompt. The tier→provider selection is `spawnPi`'s concern: the operator
  supplies `--provider`/`--model` (+ provider key via the child env), which `spawnPi` appends to `argv`
  / sets on `opts.env`. `phase.model` (the craft tier) still travels in the prompt `dynamics` and is
  recorded in the run record.

### Gate mechanics across all phases (R-manifest, R-invariants; DC-G, supersedes old DC-8)

The full walk has **two code-producing phases** (implementation, refactoring) that must never commit on
a red gate, so the bin **must** turn the placeholder gate string into a real command. `resolveGateCommand`
(new, in `src/run.js`, DI'd) replicates the orchestrator's substitution:

```
function resolveGateCommand(phase, resolution, manifest) {
  // Source the decision from resolution.gateDecisions (a LIST): it carries the normalized
  // gate ('' not undefined) AND codeProducing. effective[i].gate carries the SAME literal
  // placeholder (pinned), but only gateDecisions gives codeProducing for the floor check.
  const decision = resolution.gateDecisions.find(d => d.phaseId === phase.id);   // pinned: list, .find
  const raw = decision?.gate ?? '';
  if (raw === '<gates.phase>')     return manifest?.gates?.phase ?? '';   // implementation/refactoring/review
  if (raw === '<validation gate>') return manifest?.gates?.phase ?? '';   // no distinct gates.validation key
  if (raw === 'pr.pre-pr-gate')    return manifest?.pr?.['pre-pr-gate'] ?? '';
  return raw;   // 'plan-lint' (planning) / '' (no gate: design/decisions/documentation/workspace/integrate)
}
```

(Pinned: `effective[i].gate` is `undefined` for design/workspace/decisions/documentation/integrate and
the literal placeholder for the rest; `gateDecisions[i].gate` normalizes `undefined` → `''`. The bin
reads `gateDecisions` so `codeProducing` is available for the floor.)

- **Floor across code-producing phases (never-commit-on-red):** before committing a `codeProducing`
  worker phase (implementation, refactoring), the bin runs the resolved gate with `runGate(cmd, cwd)`
  (`execFile`, argv, no shell; non-zero → blocker, return `2`, no commit). If the resolved command is
  **empty** for a code-producing phase, that is a **blocker** (`{ unit: gate, reason: "code-producing
  phase <id> has no resolvable gate — supply gates.phase in the committed manifest", options: [...] }`)
  — the committed manifest's whole purpose (ADR-093) is to prevent this; an empty gate here means the
  shipped manifest is wrong, and the bin refuses rather than commit gateless. This is the new-DC-G floor
  that supersedes old DC-8's "advisory-only" path (which would have let a construction phase commit with
  no authoritative gate — disallowed under (c)).
- **Harness phases gate `propose`, not their own commit** (R-invariants): `review` and `validation` are
  `codeProducing:false` — they produce reports, not commits. Their resolved gate runs to **gate
  `propose`**: `propose`'s headless step does not push/PR until `validation` has run (or recorded a
  no-op) and the phase gate is green (mirrors `skills/propose/SKILL.md` preamble cross-phase check +
  run/SKILL.md "executing-harness triage gates propose"). In a headless bin with no separate harness
  worker process, this reduces to: the bin runs validation's gate after the validation `pi` run and
  before the propose step; a red gate blocks (`2`).
- **`plan-lint`** (planning) and **empty** gates (design/decisions/documentation/workspace/integrate)
  run as-is / not at all — `plan-lint` is a real engine script the bin can run; empty = no gate check.

### Tool-call wrapper (UNCHANGED by ADR-093)

New module (DC-4, `src/tool-call-hook.js`). Exports the factory the extension registers:

```
export function toolCallHook(guard = toolCallGuard) {
  return async (event, ctx) => {
    try {
      const guardEvent = adaptPiEvent(event, ctx);     // map Pi tool_call → toolCallGuard event shape
      const verdict = guard(guardEvent);               // pure predicate (reused)
      if (verdict.block) return verdict;               // { block:true, reason? }
      return await symlinkRecheck(guardEvent);          // §Symlink re-check (writes only)
    } catch {
      return { block: true };                           // R-failsafe — any throw → block
    }
  };
}
```

- **Adapter shape**: `adaptPiEvent` maps Pi's `tool_call` event (`event.tool` / `event.name`,
  `event.input` / `event.arguments`, session working dir from `ctx`) to the
  `{ tool, tool_input: { command?, file_path? }, working_dir }` shape `toolCallGuard` expects. Pi field
  names are pinned at implementation time against `@earendil-works/pi-coding-agent@0.79.8` (the
  pi-poc-record version) — a mapping table, unit-tested with a fixture event; a field-name mismatch is
  caught by the fixture, not in production.
- **Veto shape (pinned)**: returns exactly `{ block: true, reason? }` — **no** `permission: "deny"`
  (gate.md). `block:false` is returned by passing the predicate's `{ block:false }` through after the
  symlink re-check clears.
- **Fail-safe (R-failsafe)**: the outer try/catch returns `{ block: true }` on any throw — including a
  throw from `symlinkRecheck` (e.g. an unexpected `lstat` error).
- **Purity (R-pure)**: `toolCallGuard` is passed in (default = the real one) and called unchanged.

Live registration: for the subprocess PoC binding (ADR-090, `pi -p`), the wrapper is registered via an
extension file passed to `pi`'s `additionalExtensionPaths`. Whether the bin arms the live hook via the
subprocess extension path or only unit-proves the factory is **DC-7** (recommend unit-prove + on-demand
smoke).

### Symlink re-check (the wrapper-level write hardening; UNCHANGED)

`toolCallGuard`'s `guardWritePath` is **lexical** (`resolve()` + prefix compare, gate.js:54-63). A
symlink whose lexical path is inside the working dir but whose `realpath` parent is outside escapes it
(e.g. `${cwd}/link → /etc`, then a write to `${cwd}/link/passwd`). The wrapper adds a *runtime* re-check
**only on the write branch**, only after the lexical guard says `block:false`:

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

**Edge — parent may not exist** (new file in a new dir): `realpath` of a non-existent path throws
`ENOENT`. Handled by **DC-5** (walk up to the nearest existing ancestor and `realpath` that): a
brand-new directory cannot itself be a symlink to outside (it does not exist yet), so containment of the
nearest existing ancestor is sufficient and correct, and permits the legitimate new-file-in-new-dir
case. `lstat` detects that a *final* existing component is itself a symlink; `realpath` on the nearest
existing ancestor folds that in. The re-check is `async` (Pi's handler signature is
`async (event, ctx) => …`).

### Cross-phase invariants (the Claude orchestrator owns; the entrypoint honours)

- **Artifact-is-the-handoff**: sequential Pi runs carry no shared memory; each phase's contribution is a
  committed artifact the next phase reads. The walk never passes live state between `pi` processes.
- **Gate-before-commit / never-commit-on-red**: applies to **every** code-producing phase
  (implementation, refactoring). The resolved gate runs and must be green before the commit; red → `2`,
  no commit. An empty resolved gate on a code-producing phase is itself a blocker (DC-G).
- **Executing-harness triage gates `propose`**: `validation` (archetype harness, harness-exec) must run
  (or record a no-op) and its gate be green before the `propose` step pushes/PRs. The bin enforces this
  by walking validation → (documentation may parallel) → propose in `effective[]` order and checking the
  gate before the propose step (R-invariants).
- **Scope expansion re-enters review**: any feature behaviour added during construction/refinement that
  is not a fix to an existing finding gets its own feature-scoped review before the harness gate closes.
  In the linear bin walk this is honoured by ordering (review precedes refactoring precedes validation);
  the bin does not re-loop, matching the engine cadence (one `review` over the change).
- **Dead worker → respawn from artifact** (execution.md): a `pi` process that dies mid-phase is torn
  down; the respawn reads the last committed artifact. The subprocess model makes this trivial — there
  is no live worker to resume; a respawn is a fresh `spawnPi`.

## Decision candidates

> **(A) NEW candidates opened by ADR-093 (c).** Genuine forks; ≤3 options each + a recommendation —
> **for the user/orchestrator to decide, not pre-decided here.**

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-MAN | **The committed manifest's home + how the bin finds + wires it through resolution/assembly** | (a) a fixture **under `adapters/pi/`** (recommend `adapters/pi/.claude/workflow.md`) the bin resolves by an **absolute, module-relative path** (the `engine.js` `REPO_ROOT` idiom) and passes as `pipeline-resolve.js`'s 2nd positional + `contract-assemble.js`'s `--manifest`; (b) the **launch-cwd `.claude/workflow.md`** (whatever repo the bin is run in supplies the gates); (c) no committed file — the bin injects a synthetic `{ gates: { phase } }` and writes a temp manifest per run | **(a)** | ADR-093 says the manifest **ships with the adapter** — it must load deterministically regardless of where `craft-pi` is launched, which a module-relative absolute path guarantees (mirrors how `engine.js` already resolves `REPO_ROOT`/`DEFAULT_PIPELINE`); the bins already accept the path args, so wiring is a contained `engine.js` edit, not a new engine path (preserves R-no-sc1). (b) is the right model **only** if `craft-pi` is meant to honour the *target* repo's gates rather than ship its own — a real fork: surface it, because it changes whose manifest binds (target vs adapter). (c) avoids a committed file but loses diffability and re-implements what a committed manifest gives for free. |
| DC-G | **Gate-command execution across the full walk** (supersedes DC-8) | (a) the bin substitutes the placeholder from the committed manifest's `gates` map and runs the resolved command authoritatively via `execFile` before each code-producing commit; an **empty** resolved gate on a code-producing phase is a **blocker** (refuse to commit gateless); harness gates (review/validation) gate the `propose` step; (b) trust `pi`'s in-phase gate only (advisory) and skip the bin-run authoritative gate; (c) run the authoritative gate only for `implementation`, treat `refactoring` as non-gated | **(a)** | ADR-093 makes "the committed manifest resolves all gates" the rule, and gate.md says never-commit-on-red applies identically via an authoritative subprocess; (b) lets a construction phase commit with no authoritative gate (the exact hole old DC-8 left, now closed by (c)'s mandate); (c) silently drops refactoring's floor (refactoring is `codeProducing:true`, pinned). |
| DC-WS | **`workspace` in a bin context** | (a) the bin runs **inside an already-prepared checkout** (launcher's concern), asserts a repo + records, creates no worktree; (b) the bin creates its own worktree via `scripts/worktree-setup.sh` then `cd`s into it; (c) the bin takes a `--target-dir` argument and operates there | **(a)** | The bin is launched from somewhere — that checkout is the work tree; the isolation/safety rule is satisfied by the caller launching `craft-pi` inside a throwaway/prepared dir (exactly as the P16 smoke ran in a `mktemp`), so a self-created worktree adds `cd`-fighting complexity for no safety gain and orphans teardown (DC-INT does not tear down). (c) is a clean future extension but adds argv surface the no-arg `craft-pi` deliverable (R-bin) does not need now. |
| DC-DEC | **Headless `decisions` phase** | (a) **no-op with a recorded note** ("no decisions — headless"), proceed; (b) consume a pre-supplied decisions/answers file if present, else no-op; (c) drive `pi` to self-author ADRs from the design's decision-candidates | **(a)** | A non-interactive bin has no user to ratify forks; ADR-093 makes role-less phases headless, and BACKLOG **P19** establishes that a clean, *recorded* no-op is a legitimate first-class decisions outcome — align with it. (b) is a sound future enrichment (surface it) but needs a file format + path convention not in scope now. (c) lets an LLM unilaterally decide load-bearing forks with no human — exactly what the decisions phase exists to prevent. |
| DC-PROP | **Headless `propose` phase** (no remote / no `gh` / no auth) | (a) **graceful recorded no-op** when remote/`gh`/auth is absent, else deterministic `git push -u` + `gh pr create` (push/PR failure = blocker); (b) hard **blocker** when no remote/`gh` (force the operator to configure one); (c) always attempt push, let `git`/`gh` errors surface raw | **(a)** | `skills/propose/SKILL.md` already specifies "no remote → propose AND integrate no-op with a note" (the P16 smoke ran local-only); a recorded no-op matches that and keeps the local-only run usable end-to-end. (b) makes the common local-only case unusable; (c) leaks raw tool errors instead of an honest recorded no-op and conflates "no remote configured" (expected) with "push failed" (a real blocker). |
| DC-INT | **Headless `integrate` phase** | (a) **stop-before-merge**: push/PR done (by propose), the bin STOPs and records; the human merges; (b) **auto-merge behind an explicit opt-in flag/env** (`--auto-merge` / `CRAFT_PI_AUTO_MERGE=1`), default off → (a); (c) full auto-merge (`gh pr merge --squash --delete-branch`) | **(a)** | Merge is irreversible + outward-facing; ADR-093 + R-headless-safe direct strongly toward never performing such actions without explicit opt-in, and `skills/integrate/SKILL.md` ("never merge unprompted") encodes the same. (b) is the right *next* step if the user wants unattended runs — surface it as the opt-in path; (c) auto-merges with no human in a headless bin, the highest-blast-radius default, rejected. |

> **(B) Previously-adopted candidates KEPT unchanged by ADR-093** (ids + one-line "kept"; full text in
> the prior revision's table, unchanged where noted):

| # | Kept |
|---|---|
| DC-2 | **kept:** entrypoint invoked via a `bin` field in `adapters/pi/package.json` → shebang'd thin `src/cli.js` (the engine thin-bin idiom). |
| DC-3 | **kept:** model/provider **passthrough** — operator supplies `--provider`/`--model` (+ key via env), no committed provider/model map (preserves provider-neutrality; ADR-093 explicitly preserves DC-3 passthrough). |
| DC-4 | **kept (file list UPDATED for the full walk):** one file per concern in `adapters/pi/src/` — now `cli.js` (entry) + `run.js` (walk + classifier + spawn + gate cadence + manifest thread) + `roleless.js` (the four headless steps, DI'd) + `tool-call-hook.js` (wrapper + symlink re-check); plus the committed data file `adapters/pi/.claude/workflow.md` (DC-MAN) and the `bin` field in `adapters/pi/package.json`. |
| DC-5 | **kept:** symlink re-check parent-ENOENT handling = walk up to the nearest **existing** ancestor and `realpath` that (permits new-file-in-new-dir; closes the new-dir symlink hole). |
| DC-6 | **kept:** wire `parseUsage` — spawn worker phases with `jsonMode:true`, parse the JSONL, record the usage block in the run record. |
| DC-7 | **kept:** live-hook arming = **unit-prove the `toolCallHook` factory** (fail-safe + symlink re-check) in isolation; the bin registers it via the subprocess extension path, live arming exercised only by the on-demand smoke (ADR-089/090: Pi runs are on-demand smokes, not CI-gated). |

> **DC-1 = (c)** is now ratified (ADR-093) — no longer a candidate. **DC-8 is superseded** by ADR-093
> ("the committed manifest resolves all gates"); its concern is re-expressed as **DC-G** above.

## Test strategy

All new logic is DI'd so the load-bearing seams are unit-testable without a live `pi`, a live FS, or
live git/gh — matching the P16 pattern (`probe.test.js` injects `piRunner`/`fsOps`; `engine.test.js`
shells the real bins). New test files extend `adapters/pi/test/` (`node --test`, `describe/it`,
`assert/strict`, Given/When/Then titles, AAA, `sut` variable, fixtures as module consts — the existing
house style). Mutation is covered by `adapters/pi/stryker.conf.json` (`mutate: ["adapters/pi/src/**/*.js"]`),
so new `src/` files are in the mutation set automatically.

**Full-walk entrypoint (`run.test.js`, new):**
- **Walk ordering across 11 phases**: `main` walks `effective[]` in order; the worker phases (design,
  planning, implementation, review, refactoring, validation, documentation) each call
  `assembleBlock`+`buildPiArgs`+`spawnPi` once, in order — assert with recording
  `spawnPi`/`assembleBlock` DI doubles and a canned 11-phase resolution.
- **Worker/role-less classification**: role-less phases (workspace, decisions, propose, integrate) call
  their `rolelessSteps.<id>` DI double, **not** `spawnPi` — assert the spawn double is called exactly for
  the 7 worker phases and each role-less step double once.
- **Manifest threaded**: `resolvePipeline`/`assembleBlock` DI doubles receive the committed-manifest
  path (DC-MAN); assert the path is passed.
- **Resolution failure**: `resolvePipeline().ok === false` → `main` returns `2`, writes `errors` to
  `io.stderr`, spawns nothing, runs no role-less step.
- **Worker `pi` exit non-zero**: a phase whose `spawnPi` rejects → `main` returns `2`, no further phases
  run, no commit (never-commit-on-red, stop-the-walk).
- **Spawn discipline**: `spawnPi` passes `stdio[0] === 'ignore'` (stdin ignored — the pinned
  hang-avoidance fact) and an argv array (never a shell string) — assert against the DI'd `execFile`
  double's captured options.
- **Usage wiring (DC-6)**: a `--mode json` stdout fixture → `parseUsage` result is recorded in the run
  record returned by `main`, per worker phase.

**Gate mechanics (`run.test.js`, DC-G):**
- `resolveGateCommand` substitutes `<gates.phase>` → `manifest.gates.phase` (implementation, refactoring,
  review), `<validation gate>` → `manifest.gates.phase`, `pr.pre-pr-gate` → `manifest.pr['pre-pr-gate']`,
  passes `plan-lint` through, maps empty → `''` — table-driven, against a canned manifest object.
- **Never-commit-on-red across code-producing phases**: a `runGate` double returning non-zero for the
  `implementation` (and separately `refactoring`) gate → `main` returns `2`, no commit, walk stops.
- **Empty gate on a code-producing phase is a blocker (DC-G floor)**: a manifest with **no** `gates.phase`
  → `resolveGateCommand(implementation)` empty → `main` returns `2` with a `{ unit: gate, … }`-shaped
  blocker, before any commit.
- **Harness gates `propose`**: a red `validation` gate blocks the `propose` step (it is not reached) →
  `2`; a green validation gate lets `propose` run.

**Role-less headless steps (`roleless.test.js`, new — DI'd git/gh/fs doubles):**
- `workspace` (DC-WS): asserts a git repo present (DI'd probe) and records "using current checkout"; a
  missing repo → blocker.
- `decisions` (DC-DEC): always a recorded no-op; never invokes any LLM/spawn double.
- `propose` (DC-PROP): with a remote+`gh`+auth DI double → calls push + `gh pr create` (argv, no shell);
  with no remote → recorded no-op, no push; a push failure → blocker.
- `integrate` (DC-INT): default → STOP before merge, never calls the `gh pr merge` double, records the
  stop; (if the opt-in is added later, a separate test gates the merge path behind the flag).

**Tool-call wrapper (`tool-call-hook.test.js`, new) — UNCHANGED:**
- Adapts a Pi `tool_call` fixture event → `toolCallGuard` shape → returns `{ block:true, reason }` for a
  bare `git diff` (delegates to the pure predicate, unchanged).
- **Fail-safe (R-failsafe)**: a `guard` double that throws → `{ block: true }`; a `symlinkRecheck` that
  throws (`lstat` real error) → `{ block: true }`.
- Returns exactly `{ block: true, reason? }` — never a `permission` field (pinned veto shape).
- `toolCallGuard` is unmodified — its existing tests in `gate.test.js` stay green (regression proof of
  R-pure).

**Symlink re-check (in `tool-call-hook.test.js`, with a `mktemp` fixture dir — never the worktree):**
- A real symlink `${tmp}/link → /etc` then a write to `${tmp}/link/x` → `{ block: true }` (the case the
  lexical guard misses).
- A genuine write inside `${tmp}/sub/new/x` where `sub/new` does not exist yet → `{ block: false }`
  (DC-5: nearest existing ancestor `${tmp}` is contained) — new-file-in-new-dir allowed.
- A non-write tool (Read) with an outside `file_path` → `{ block: false }` (re-check is write-only).

**Committed manifest is lint-clean (`manifest.test.js`, new):**
- The shipped `adapters/pi/.claude/workflow.md` parses via `parseManifestContent` and passes
  `validateManifest` (no errors) — catches a malformed committed manifest in CI, since the bin does not
  re-lint at runtime (§The committed manifest).
- A full resolution against the committed manifest yields `ok: true` and a non-empty `gates.phase` so
  `resolveGateCommand(implementation)` resolves to a real command (the DC-G floor is satisfiable).

**`engine.js` manifest thread (extend `engine.test.js`):**
- `resolvePipeline(manifestPath)` passes the path as the 2nd positional to `pipeline-resolve.js`;
  `resolvePipeline()` (no arg) is unchanged (R-no-sc1) — assert against a DI'd/temp-fixture run.
- `assembleBlock(id, manifestPath)` appends `--manifest <path>`; `assembleBlock(id)` unchanged.

**Acceptance / runtime (on-demand, NOT CI-gated — ADR-089/090):**
- `docs/adapters/pi-poc-record.md` refreshed to record the **bin** running the **full 11-phase walk**
  end-to-end (vs. P16's single uncommitted-runner phase): evidence shape (Pi version `0.79.8`, model,
  ports exercised, **per-phase outcome for all 11** incl. each role-less step's recorded behaviour, the
  committed-manifest gate command, the bin invocation). The deterministic seams are CI-proven; the live
  `pi` walk remains on-demand.

**No new property-test lens**: P17 adds no parser/matcher/round-trip pair (`parseUsage`/`buildPiArgs`
are reused, already covered). The git-guard regex is untouched, so its mutation-survivor parity baseline
is unchanged.

## Out of scope

- **The git-invocation guard** (`GIT_DIFF_SHOW_RE` / `hooks/git-no-ext-diff.sh`) — standing parity
  constraint; not touched. Any tightening is a separate change landing in both files together.
- **A manifest `adapter: claude|pi` selection key** — ADR-086 defers it until a 2nd-or-later adapter
  graduates past PoC; `craft-pi` is a separate entrypoint by construction. ADR-093 confirms the fuller
  walk does not foreclose later reuse by an `adapter:` key.
- **SDK-embed (`createAgentSession`) binding** — ADR-090 keeps the bin on the `pi -p` subprocess
  binding; the SDK path stays the documented richer alternative (execution.md), not built here.
- **Pi as a CI/runtime dependency** — ADR-089 keeps the live Pi walk an on-demand smoke; no CI job
  installs `pi` or holds a provider key.
- **A committed provider/model map** — DC-3 (kept) recommends passthrough; baking a provider table (incl.
  the P16 Gemini accident) into the repo is explicitly avoided. The committed manifest (DC-MAN) carries
  **gate commands only**, no provider/model pin.
- **Auto-merge in `integrate`** — DC-INT defaults to stop-before-merge; auto-merge is the opt-in
  alternative for the user to ratify, not built as the default.
- **A `--target-dir` argument / bin-created worktree** — DC-WS assumes a prepared checkout; operating on
  an arbitrary target dir (and self-creating/tearing-down a worktree) is a future extension.
- **A pre-supplied decisions/answers file** — DC-DEC defaults to a recorded no-op; consuming an answers
  file is the surfaced future enrichment, not built now.
- **Sequential-fan-out for Pi review/validation** (`passes > 1`) — re-expressing multi-reviewer fan-out
  as sequential Pi runs is deferred (P18; P16 Out-of-scope, unchanged). The bin runs one `pi` per
  harness phase.
- **Changing any port spec semantics** — `docs/adapters/*.md` are reused as-is; P17 binds them, never
  re-decides them.
- **Engine resolution/gate logic changes** — the bin **substitutes** placeholders the way the Claude
  orchestrator already does (DC-G) and **threads** an already-accepted manifest arg (DC-MAN); it does
  not change `gates.js`, `resolve.js`, or the engine bins.
