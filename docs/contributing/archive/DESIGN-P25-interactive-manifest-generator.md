# Design — Interactive customization generator (the manifest "front door")

> Brief: P25 — a standalone craft skill (`craft:init`), run *inside a target repo*, that scaffolds a **named** craft customization by probing the repo's capabilities and interviewing the user, then writing a lint-clean **named manifest file** `.claude/craft-<name>.md`. The name the user gives *is* the file's identity, and a new `--config <name>` invocation token makes craft load that named file for a run. End-to-end: generator **and** consumption path ship together.
> Status: accepted

## Context

### What exists today — the customization subsystem

craft is customized by hand-authoring a single file: `.claude/workflow.md` at the target repo's root — **YAML frontmatter (config) + markdown body (prose rationale)**, parsed by `engine/src/frontmatter.js` (`parseManifestContent` keys off the opening `---` fence; the prose body never reaches the YAML parser). That file is the entire injection surface; everything below is *what shape it must take*, *who reads it*, and — now that P25 ships end-to-end — *how a second, **named** manifest file is selected for a run*.

**The manifest schema (`engine/src/manifest.js`).** `validateManifest(parsed, { fileExists })` is a pure, never-throwing validator returning `{ ok, errors[] }`. Its constraints, pinned:
- A frozen top-level key whitelist `TOP_KEYS` (`manifest.js:14`): `backlog, memory, paths, context, gates, phases, pr, scripts, models, pipeline, retrieval, execution, extends, policy`. Any other key → `unknown top-level key`.
- A dispatch `switch` (`manifest.js:708`) routes each key to a `validateX(value, …, errors)` validator. Adding a config surface = adding to `TOP_KEYS` + a validator + a `switch` arm (the P21/P22/P23 precedent: `memory:` was "validated exactly like `backlog`", `policy:` got `validatePolicy`). **P25 adds no key** — it only emits keys already accepted.
- Phase blocks (`PHASE_NAMES`, `PHASE_FIELDS`) accept `context, override, strategy, merge-flags, non-blocking-jobs, harness, execution, enabled, role, model, procedure`. `skip:` on a phase is **inert by design** (ADR-011) — it errors with a redirect to `pipeline.skip`.
- `models` keys (`MODELS_KEYS`, `manifest.js:46`): `fallback, designer, planner, reviewer, part-implementer, refactor-executor, validation-triager, docs-writer, backlog-ticker`.
- `pipeline` sub-keys (`PIPELINE_KEYS`): `profile, skip, insert, reorder`.
- `extends` sub-blocks (`EXTENDS_KEYS`): `phases, agents, profiles, backlog-adapters`.

**Profile vs. config — a load-bearing distinction (ADR-137).** These are two **distinct first-class concepts**, deliberately kept separate:
- A **profile** is *only* an execution-archetype map. Built-in: `BUILTIN_PROFILES` in `engine/src/profile.js` — `solo`, `lean`, `full`, each a **6-archetype → `inline`|`agent` map** (`setup, specification, construction, harness, refinement, delivery`). User-registered: `extends.profiles.<name>` — validated by `validateExtendsProfileEntry` (`manifest.js:598`), which **requires all six archetype keys**, values `inline|agent` only; resolved by `expandProfile(name, registeredProfiles)` (`profile.js:50`) when `pipeline.profile: <name>` names it. A profile **cannot** carry `models`, `gates`, `pipeline.skip`, `phases.<id>.harness`, `policy`, or any other knob.
- A **config** (new in P25) is a *full named manifest* — the complete frontmatter+prose shape `validateManifest` accepts — stored at `.claude/craft-<name>.md` and selected by `--config <name>` (ADR-136/137). It carries *any* config a manifest can.

Selected by **two different tokens that never overload one word**: `--profile <name>` sets the execution map; `--config <name>` selects which whole manifest file is read. A named config *may itself* set `pipeline.profile`, optionally overridden by a CLI `--profile` (they compose).

**The overlay & resolution path** (where any named thing resolves through):
- `engine/src/cli-overlay.js` `applyCliOverlay(manifest, { profile, skip, harness })` folds per-invocation `--profile`/`--skip`/`--harness` over **whatever manifest object was loaded**, at **highest precedence** (ADR-022), before resolution. `--profile <name>` sets `merged.pipeline.profile`. `--policy` folds separately via `mergePolicyScopes` (`pipeline-resolve-main.js:295`). **Crucially: the overlay folds over whatever manifest the resolve step loaded** — so once `--config <name>` makes the loaded manifest be `.claude/craft-<name>.md`, the existing overlay applies to it unchanged.
- `engine/src/resolve.js` `resolvePipeline(defaults, manifest, opts)` → `{ ok, errors, effective[], record[], gateDecisions[], waivers[] }`. Profile expansion happens at `resolve.js:241`; an unknown profile name throws → `ok:false`.
- Precedence for execution: `phases.<id>.execution` > `pipeline.profile` > top-level `execution:` (`resolve.js:82` `resolvePhaseExecution`).

**The manifest-path selection step — where `--config` plugs in (ADR-137, pinned).** The orchestrator (`skills/run/SKILL.md`) already *selects which manifest path to read* and passes it as a **positional arg** to both manifest bins — today always `.claude/workflow.md`:
- `scripts/manifest-lint.sh` → `engine/bin/manifest-lint.js` → `engine/src/manifest-lint-main.js`. `resolveManifestPath(argv)` returns `argv[0] ?? '.claude/workflow.md'` (`manifest-lint-main.js:16-18`) — **it already accepts an arbitrary path arg.** The bash wrapper `exec`s `"$@"` straight through (`manifest-lint.sh:4`). `fileExists` is rooted at `dirname(dirname(manifestAbsPath))` (`manifest-lint-main.js:57`) — for `.claude/craft-<name>.md` that still resolves to repo root, identically to `.claude/workflow.md`. Exit `0` valid / `2` invalid with a diagnostic block.
- `engine/bin/pipeline-resolve.js` → `engine/src/pipeline-resolve-main.js`. `parseArgs` reads two positionals — `pipelinePath` then `manifestPath` (`pipeline-resolve-main.js:184-188`) — and `main` parses `manifestPath`'s content via `parseManifestContent` (`:268`). **It already accepts an arbitrary manifest path.** `skills/run/SKILL.md` step 1b already passes `[manifest-path]` as that positional.

**Consequence, pinned:** `--config <name>` is **orchestrator-only wiring — no engine bin changes.** The orchestrator resolves `.claude/craft-<name>.md`, and passes *that* path where it already passes `.claude/workflow.md` (lint step 1; resolve step 1b). Both bins consume an arbitrary path today.

**The lint the output must pass.** The same `manifest-lint` chain above. `test/examples-lint.bats` (ADR-063) gates every shipped `examples/*/workflow.md` through this lint — the anti-rot precedent any generator-emitted sample must satisfy.

**The capability probes that exist.** Two distinct probes, neither purpose-built for a generator:
1. `scripts/worktree-setup.sh` — **lockfile/ecosystem detection** (`worktree-setup.sh:14-23`: `package-lock.json`→npm, `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`/`bun.lock`→bun, `uv.lock`→uv, `poetry.lock`→poetry, `Cargo.toml`→cargo, `go.mod`→go, `Gemfile.lock`→bundler, `composer.lock`→composer). Its job is *installing* deps in-worktree; ecosystem detection is a side effect, and it has **no read-only / report-only mode** — it runs `npm ci`, `cargo fetch`, etc.
2. The **gate probe** — the test-command discovery used by `workspace`/`implementation` to find `pytest`/`go test`/`cargo test`/`node --test`/a `make test` or CI script (`docs/adapters/gate.md` `resolveGate`, precedence `descriptor.gate → manifest.gates[phaseId] → none`; read-only). A repo with no discoverable test command hits the gate-floor refusal by design.

**The skill surface.** Phase skills live in `skills/<id>/SKILL.md`, **auto-discovered** (`.claude-plugin/plugin.json` has no `skills` key). A new skill is a new `skills/<name>/SKILL.md` — no plugin.json edit. `AskUserQuestion` appears in **exactly one** existing skill — `skills/run/SKILL.md`, the orchestrator — which owns *all* user conversation. Phase worker skills never ask the user directly. `craft:init` adopts this same orchestrator stance (ADR-142): the **session** probes, interviews, emits, and lints; no worker agent is spawned.

**The headless contrast.** `craft-pi` (`adapters/pi/src/run.js`) drives the walk as a subprocess with **stdin ignored** (`spawnPi`, `stdio:['ignore',…]`) — **no interactive user exists**. P23 set the precedent: a `claude`-binding `AskUserQuestion` *degrades to a recorded blocker* under `pi` unless pre-approved. P25's interview is **interactive-only** (ADR-139); headless answer-file mode is a deferred follow-up.

### Constraining ADRs / docs

- **ADR-011** — per-phase `skip:` is inert; skips live at `pipeline.skip`. The emitter must never emit per-phase `skip`.
- **ADR-022** — overlay precedence `per-invocation > project > user`; `applyCliOverlay` is the fold. A named config *is* the project manifest for the run; CLI flags still fold over it at highest precedence.
- **ADR-063** — every shipped example manifest must pass `manifest-lint` (`examples-lint`). A generator-shipped sample/fixture inherits this.
- **ADR-116/118-121** (P22 memory) / **ADR-124-130** (P23 policy) — the precedent shape for *adding a feature cleanly*: a pure `engine/src/` module, mirrored test surface, a single orchestrator seam. P25 reuses this skeleton minus a runtime port (it *authors* config; it does not gate a run).
- **`docs/GUIDE-customizing.md §3` (P12)** — the *manual* front door's injection catalog (Tier-0: skip/model/gate/execution/profile/harness/backlog/memory/policy; Tier-1: context/override/role-or-procedure/insert/DoD) is exactly the question-set `craft:init` interviews over (ADR-140 — the **full** Tier-0/1 catalog). P25 scaffolds manifests that read as if hand-authored per this guide.

**The seven ratifying ADRs (P25 decisions phase):**
- **ADR-136** — a named customization is a **full named manifest file** `.claude/craft-<name>.md` (frontmatter+prose), a sibling of the live `.claude/workflow.md`; multiple named configs coexist. (Deviates from the design's prose-identity MVP recommendation.)
- **ADR-137** — P25 ships **end-to-end**: a new `--config <name>` token resolves `.claude/craft-<name>.md` as the manifest for a run; `--profile` stays the execution map; the two compose; an absent `--config` target is a loud blocker. (Pulls "named-manifest resolution" *into* scope.)
- **ADR-138** — `craft:init` writes the named file by **direct overwrite, lint-gated** (emit→temp, lint, move into place on exit 0). (Deviates from the design's review-draft recommendation; the premise shifted to a dedicated sibling file.)
- **ADR-139** — the interview is **interactive-only**. (As recommended.)
- **ADR-140** — the interview covers the **full Tier-0/1 catalog**. (Deviates from the design's curated-set recommendation.)
- **ADR-141** — discovery reuses a **read-only detection helper + the gate probe**, never `worktree-setup.sh`. (As recommended.)
- **ADR-142** — `craft:init` is a **standalone skill**, not a walk phase. (As recommended.)

This design is **a standalone skill + a pure emitter + a read-only detection helper + a one-line orchestrator wiring** (`--config <name>`). It produces a config artifact consumed by the existing lint + resolver, and adds **no new runtime port and no engine bin change**; the §2 invariant floor of `docs/GUIDE-customizing.md` is untouched.

## Requirements

When this ships, all of the following are verifiable:

1. **R1 — In-repo named manifest file.** Run inside a target repo, `craft:init` writes a single complete `.claude/craft-<name>.md` (frontmatter + prose) carrying a customization the user **names**. The file name *is* the customization's identity (ADR-136); multiple named configs coexist as siblings of `.claude/workflow.md`. The live `.claude/workflow.md` is never touched by a named run.

2. **R2 — Lint-clean output, always.** Every emitted `.claude/craft-<name>.md` passes `engine/bin/manifest-lint.js` (exit 0). The generator emits to a **temp path**, lints it, and **moves it into place only on exit 0** (ADR-138) — an INVALID manifest never lands. A lint failure is surfaced, never swallowed (R8).

3. **R3 — Probe-grounded defaults.** Before interviewing, the generator probes the repo's capabilities (at minimum: ecosystem/lockfile, a discoverable test command, presence of a git remote, presence of mutation/architecture tooling) and pre-fills interview defaults from the probe. A probe that finds nothing for a dimension degrades to a question (or a documented skip), never to a guessed-wrong value baked silently into the manifest.

4. **R4 — Interview covers the full Tier-0/1 catalog (ADR-140).** The interview surfaces **every** Tier-0/1 customization point of `docs/GUIDE-customizing.md §3` the repo can actually use (skip/model/gate/execution/profile/harness/backlog/memory/policy/context/role-or-procedure/insert/DoD), each defaulted from the probe where possible. Points the probe rules out are skipped or asked with a "no-ops in your repo" note — never silently dropped. The user may accept all defaults (a minimal manifest) or override per point.

5. **R5 — `--config <name>` consumption path (ADR-137).** A new per-invocation `--config <name>` token makes the orchestrator (`skills/run/SKILL.md`) load `.claude/craft-<name>.md` as the manifest for that run, in place of `.claude/workflow.md`. `--config` composes with the existing overlay: `--profile`/`--skip`/`--harness`/`--policy` still fold over the named manifest at highest precedence (ADR-022). An absent `--config` target file is a **loud blocker** (STOP), never a silent fallback to the default manifest. `--profile` and `--config` stay distinct concepts (execution map vs. full manifest) and may combine.

6. **R6 — Idempotent direct overwrite (ADR-138).** Re-running `craft:init` for an existing name regenerates that one named config in place by direct write. Because the target is a dedicated named sibling file, this never endangers `.claude/workflow.md` or any other named config. The lint gate still runs before landing; an INVALID re-emit never replaces a previously-valid file (it STOPs at the temp-path lint step before the move).

7. **R7 — The output composes with the overlay correctly.** A named config resolves through the existing precedence (`phases.<id>.execution` > `pipeline.profile` > top-level `execution:`; CLI `--profile`/`--skip`/… at highest precedence) with **no new resolution path inside the engine** — the named file flows through the *same* `manifest-lint` + `pipeline-resolve` chain via the orchestrator's existing manifest-path selection step. The generator emits only keys `validateManifest` already accepts; **no schema change** (ADR-136).

8. **R8 — Loud failure, no silent state.** Every failure mode — lint refusal, an unwritable `.claude/`, a probe error, an aborted interview, an absent `--config` target — surfaces explicitly (message + non-zero/STOP) and leaves the repo in a known state. State-mutating probes never run against the user's working tree (they run read-only or in a `mktemp` throwaway).

9. **R9 — No provenance leakage into the emitted manifest.** The generated `.claude/craft-<name>.md` carries no `P25`/ADR/backlog references in its config or prose (the no-provenance rule for produced artifacts); provenance lives in this design doc and the PR body only.

## Design

`craft:init` is a **probe → interview → emit → lint → land** pipeline, shipped as a standalone skill plus a pure emitter and a read-only detection helper. It authors config; it adds no runtime port, no engine bin change, and lowers no floor. Separately, the **orchestrator gains `--config <name>`** so the named file is consumable end-to-end.

```
  in-repo `craft:init` invocation (standalone — NOT a /craft:run phase)
        │
        ▼
  [1] PROBE  ──────────► CapabilityReport  (read-only; mutating probes in mktemp)
        │                { ecosystem, lockfile, testCmd, hasRemote,
        │                  mutationTool, archTool, existingNames[] }
        ▼
  [2] INTERVIEW ───────► Answers            (AskUserQuestion, the full Tier-0/1 catalog;
        │                                     defaults pre-filled from the report;
        │                                     name = the file identity)
        ▼
  [3] EMIT  ───────────► ManifestDraft      (pure: Answers → {frontmatter object, prose body})
        │                                    serialized via js-yaml dump + a prose template
        ▼
  [4] LINT  ───────────► manifest-lint.sh <temp>   (exit 0 required; on non-zero → STOP)
        │
        ▼
  land: move temp → .claude/craft-<name>.md   (direct overwrite, only on lint exit 0)


  Later, an unrelated run consumes it:
  /craft:run --config <name> <brief>
        │
        ▼
  orchestrator resolves path .claude/craft-<name>.md (absent → loud STOP)
        │  passes that path as the existing [manifest-path] positional to:
        ├─► manifest-lint.sh  .claude/craft-<name>.md        (step 1)
        └─► pipeline-resolve.js … .claude/craft-<name>.md …  (step 1b)
             (--profile/--skip/--harness/--policy still fold at highest precedence)
```

### D1 — The probe step (CapabilityReport, ADR-141)

A pure-ish probe producing one immutable record:

```js
// CapabilityReport (pinned shape)
{
  ecosystem:    'npm' | 'pnpm' | 'yarn' | 'bun' | 'uv' | 'poetry' |
                'cargo' | 'go' | 'bundler' | 'composer' | null,   // null = unrecognized
  lockfile:     string | null,             // the detected lockfile name
  testCmd:      string | null,             // discovered gate command, e.g. 'node --test', 'pytest'
  hasRemote:    boolean,                   // git remote present (propose/integrate viability)
  mutationTool: 'stryker' | null,          // validation harness viability
  archTool:     'dependency-cruiser' | null,
  existingNames: string[],                 // existing .claude/craft-*.md names (overwrite awareness)
}
```

**Reuse vs. purpose-built (ADR-141).** The detection logic is reused, **not** the side-effecting script:
- `worktree-setup.sh` *installs* deps (no read-only mode) — `craft:init` must **never** call it (it would mutate the tree, violating R8). Instead the **lockfile→ecosystem table** (`worktree-setup.sh:14-23`) is factored into a **read-only shared helper** that `worktree-setup.sh` then consults for detection while keeping its own install behaviour unchanged. The helper maps a lockfile presence to `{ ecosystem, lockfile }` and performs **no** install.
- The **gate probe's** test-command discovery is reused directly (already read-only; `resolveGate` precedence `descriptor.gate → manifest.gates[phaseId] → none`).
- A state-mutating probe (e.g. "does `stryker init` succeed") runs in a `mktemp` throwaway, never the worktree (R8, and the global state-mutating-probe rule).

### D2 — What "name" binds to (ADR-136)

The name *is the manifest file's identity*. `craft:init` writes the whole manifest to `.claude/craft-<name>.md` — a complete frontmatter+prose file in the exact shape `validateManifest` accepts, a sibling of the live `.claude/workflow.md`. Multiple named configs coexist in one repo. This is the most expressive binding (it carries *any* config, unlike a profile which holds only the execution map) and requires a resolution path so craft can load it by name — supplied by D8 (`--config <name>`). The emitter writes only keys `validateManifest` already accepts, so **no schema change** ships.

The `<name>` is validated as a filesystem-safe single segment (kebab-case, no path separators, no traversal) so it composes into `.claude/craft-<name>.md` without escaping `.claude/` — mirroring the containment discipline in `memory.js` (`resolveStorePath` rejects a `ref` that escapes the repo root).

### D3 — The interview step (ADR-139, ADR-140)

Interactive-only, driven by the orchestrator-style `AskUserQuestion` the session owns (ADR-139; the session, not a worker, runs the whole skill). The interview covers the **full Tier-0/1 catalog** (ADR-140), one question per catalog point the probe deems usable, **defaulted from the CapabilityReport**:

| Catalog point (GUIDE §3) | Question (defaulted from probe) | Emits (manifest key) |
|---|---|---|
| name | "Name this customization" | the `.claude/craft-<name>.md` filename (D2) |
| skip (T0 #1) | "Drop any phase? (dependency-checked)" | `pipeline.skip: […]` |
| model (T0 #2) | "Route any agent to a deeper/cheaper model?" | `models.<agent>` (+ `models.fallback`) |
| gate (T0 #3) | "Test/gate command?" (default = probed `testCmd`) | `gates.<phase>` |
| execution (T0 #4) | "Per-phase inline/agent?" | `phases.<id>.execution` |
| profile (T0 #5) | "Whole-flow mode: full / lean / solo?" | `pipeline.profile` |
| harness (T0 #6) | "Tune review/validation rigor?" | `phases.<phase>.harness.*` |
| backlog (T0 #7) | "Use a tracker? (file / custom)" | `backlog: { source, ref }` |
| memory (T0 #8) | "Enable per-repo advisory memory?" | `memory: { source, ref }` |
| policy (T0 #9) | "Permission posture for outward actions?" | `policy: { always, ask, never }` |
| context (T1 #8) | "House-rules file to inject (global / per-phase)?" | `context: <path>` / `phases.<id>.context` |
| override (T1 #9) | "Replace a procedure body with your own file?" | `phases.<id>.override` |
| role / procedure swap (T1 #10) | "Swap a phase's agent or orchestrating skill?" | `phases.<id>.role` / `phases.<id>.procedure` |
| insert (T1 #11) | "Insert a new phase?" | `pipeline.insert: [...]` |
| DoD (T1 #12) | "Point at a Definition-of-Done artifact?" | `paths.dod` |

A point the probe rules out (e.g. `validation` harness when `mutationTool: null`, `propose`/`integrate` config when `hasRemote: false`, `architecture` harness when `archTool: null`) is either skipped from the interview or asked with a "this will no-op in your repo" note (ADR-140) — never emitted as a setting that silently no-ops without the user knowing.

**The no-test-command edge.** When the gate probe finds `testCmd: null`, the gate question has no default *and* a manifest that ships without a discoverable gate hits craft's **gate-floor refusal** at run time (a code-producing phase with no resolvable gate is a floor error — `docs/adapters/gate.md`). The interview surfaces this: it asks for an explicit gate command and warns that leaving it empty produces a manifest craft will refuse to run. This is the one case where "accept all defaults" cannot yield a runnable manifest, and the generator says so rather than emitting a manifest that fails only later.

### D4 — The emit step (pure, the TDD-able core)

`emitManifest(answers) → { frontmatter, prose }` lives in `engine/src/` (e.g. `engine/src/init-emit.js`):
- `frontmatter` is a plain object containing **only keys `validateManifest` accepts** (R7), serialized with `js-yaml` `dump` — **already imported and in use in-repo** (`engine/src/memory.js:18` `import { … dump as yamlDump } from 'js-yaml'`), so the emitter reuses a proven serializer rather than a new dependency. Empty/defaulted points are omitted (a minimal manifest, matching the guide's "declare only what probing can't infer").
- The emitter never emits a per-phase `skip:` (ADR-011 guard) and never emits a key outside `TOP_KEYS`.
- `prose` is a markdown body (the named-customization heading + a one-line rationale per emitted point), so the output reads like the hand-authored `examples/*/workflow.md` (frontmatter + prose). It carries **no provenance** (R9).
- The two are joined as `---\n<yaml>\n---\n\n<prose>` — the exact fenced shape `parseManifestContent` expects (`frontmatter.js:50`).

This step is **pure and the natural property-test surface** (Test strategy): `answers → emit → parseManifestContent → validateManifest` must round-trip to `ok:true` for every answer combination.

### D5 — The lint + land step (ADR-138: direct overwrite, lint-gated)

After emit, `craft:init` **emits to a sibling temp file, lints the temp, and moves it into place only on lint exit 0** (ADR-138):
- Write the candidate to a sibling temp file **inside the repo's `.claude/`** — e.g. `.claude/.craft-<name>.<pid>.tmp`. The location is load-bearing: `manifest-lint`'s `fileExists` ROOT is `dirname(dirname(manifestAbsPath))` (`manifest-lint-main.js:57`), so a temp file at `.claude/.craft-<name>.<pid>.tmp` resolves its repo-relative ref-existence checks against the **repo root** — exactly as the final `.claude/craft-<name>.md` would. (A temp in an unrelated throwaway dir would lint structure but check ref-existence against the wrong root.) The temp is a sibling of the final file on the same filesystem, so the move below is an atomic `rename`.
- Run `engine/bin/manifest-lint.js <temp-path>` — the bin accepts an arbitrary positional path (`manifest-lint-main.js:16-18`).
- On lint **non-zero**: STOP; surface the `manifest-lint` diagnostic block; **remove the temp file; nothing lands**; any prior `.claude/craft-<name>.md` is byte-for-byte untouched (R6).
- On lint **exit 0**: `rename` the temp file to `.claude/craft-<name>.md` (atomic direct overwrite of a same-name file).

Because the target is a dedicated named sibling, direct overwrite never endangers the live `.claude/workflow.md` (ADR-138). There is **no review-draft mode and no merge** — re-running for a name regenerates that named config idempotently.

### D6 — Error semantics

| Failure | Behaviour (R8) |
|---|---|
| Emitted manifest fails lint | STOP; surface the `manifest-lint` diagnostic block; remove the temp file; do **not** land; any prior same-name file untouched. |
| `.claude/` unwritable | STOP; report the path + reason; no partial file left. |
| Probe error (e.g. git absent) | Degrade the affected dimension to "ask the user / documented skip"; never abort the whole run on one probe miss. |
| No discoverable test command (`testCmd: null`) | Ask for an explicit gate command; warn that an empty gate produces a manifest craft refuses at run time (gate-floor). Do not emit a silently-unrunnable manifest. |
| Mutating probe needed | Run in `mktemp` throwaway; never touch the worktree. |
| Re-run for an existing name | Direct overwrite after a clean lint (ADR-138); idempotent; only that named file is replaced. |
| Interview aborted | Leave the repo unchanged (no temp, no landed file). |
| `--config <name>` target absent (at `/craft:run` time) | Loud STOP in the orchestrator (ADR-137); never a silent fallback to `.claude/workflow.md`. |

### D7 — Where the skill registers and is named (ADR-142)

A new `skills/init/SKILL.md`, **auto-discovered** (no plugin.json edit). It is a **standalone skill named `craft:init`**, invoked directly in a target repo — **not** a phase in the default 11-phase `/craft:run` walk (it authors config *before* a run; a phase would entangle config-authoring with the run it configures). It mirrors the **run skill's orchestrator stance** (`skills/run/SKILL.md`): the **session** probes, interviews, emits, and lints — **no worker agent is spawned** (the work is conversation + a pure emit + a lint subprocess). Its `SKILL.md` structure mirrors a session-owned phase skill — a **Preamble** (probe + `<name>` validation) and a **Procedure** (interview → emit → temp-lint → land) — but, like `run`, it owns its own `AskUserQuestion` conversation rather than delegating.

### D8 — The `--config <name>` consumption path (ADR-137 — orchestrator-only, no engine bin change)

The named file is inert unless craft can load it by name. `--config <name>` is added to the orchestrator (`skills/run/SKILL.md`) as a **new per-invocation token**, wired through the **existing manifest-path selection step** — no engine bin changes (both bins already accept an arbitrary manifest path; see Context):

- **Step 0a (flag parsing).** Add `--config <name>` to the strip-and-hold flag set alongside `--profile`/`--skip`/`--harness`/`--policy`. Hold the name. Like the others, it is per-invocation. **Distinct from `--profile`** (ADR-137): `--config` selects *which manifest file is read*; `--profile` sets the *execution map* inside whichever manifest is read. The two compose and may both be present.
- **Manifest-path resolution (before step 1).** When `--config <name>` is present, resolve the manifest path to `.claude/craft-<name>.md` (validated as a safe single segment). If that file is **absent → loud STOP** (ADR-137: never a silent fallback to `.claude/workflow.md`). When `--config` is absent, behaviour is exactly today's (`.claude/workflow.md`, or pure defaults when none).
- **Step 1 (lint).** Run `manifest-lint.sh <resolved-path>` — the wrapper passes the path through (`manifest-lint.sh:4`); INVALID → STOP (existing behaviour, unchanged).
- **Step 1b (resolve).** Pass `<resolved-path>` as the existing `[manifest-path]` positional to `pipeline-resolve.js`. The `--profile`/`--skip`/`--harness`/`--policy` flags are appended exactly as today and **fold over the named manifest at highest precedence** via `applyCliOverlay` (`pipeline-resolve-main.js:275`) + `mergePolicyScopes` (`:295`) — the overlay folds over whatever manifest was loaded, so no overlay change is needed.
- A named config that itself sets `pipeline.profile` is honoured; a CLI `--profile` overrides it (existing precedence, ADR-022).

**Pinned delta summary for the planner:** the *only* engine-adjacent change is in `skills/run/SKILL.md` (flag parse + path resolution + the absent-file STOP). `engine/bin/manifest-lint.js`, `engine/src/manifest-lint-main.js`, `engine/bin/pipeline-resolve.js`, and `engine/src/pipeline-resolve-main.js` are **unchanged** — they already accept an arbitrary positional manifest path. `engine/src/cli-overlay.js` is **unchanged** — it already folds over the loaded manifest.

## Decision candidates

All load-bearing choices were ratified in the P25 decisions phase (ADRs 136-142). This table is now a **settled-decisions record** — there are no open candidates.

| # | Choice | Decision (ADR) | Outcome vs. original recommendation |
|---|---|---|---|
| 1 | **Named-override shape** — what "name" binds to mechanically | A **full named manifest file** `.claude/craft-<name>.md` (frontmatter+prose, the shape `validateManifest` accepts); multiple coexist as siblings of `.claude/workflow.md` (**ADR-136**) | **Deviation.** Design recommended (C) prose/metadata identity in the single live manifest; the user chose the most expressive binding (a dedicated named file carrying any config). |
| 2 | **Consumption scope** — generator only vs. end-to-end | **End-to-end**: a new `--config <name>` token resolves `.claude/craft-<name>.md` for a run; `--profile` stays the execution map; the two compose; absent target = loud blocker (**ADR-137**) | **Deviation / scope expansion.** Design deferred named-manifest resolution to a follow-up ("out of scope"); the user pulled it into P25 so the feature is usable on landing. |
| 3 | **Output mode** — direct write vs. review draft | **Direct overwrite, lint-gated** (emit→temp, lint, move into place on exit 0); idempotent regeneration of a named config (**ADR-138**) | **Deviation.** Design recommended (B) review-draft-then-land; the dedicated-sibling premise (ADR-136) removed the clobber risk that justified the draft. |
| 4 | **Interview transport** — interactive vs. headless | **Interactive-only** (orchestrator `AskUserQuestion`); headless answer-file deferred (**ADR-139**) | **As recommended.** |
| 5 | **Interview breadth** — curated vs. full | **Full Tier-0/1 catalog**, each defaulted from the probe; probe-ruled-out points skipped or noted (**ADR-140**) | **Deviation.** Design recommended (C) a curated common set + advanced opt-in; the user chose completeness (the probe bounds the question count anyway). |
| 6 | **Discovery layer** — reuse vs. purpose-built | **Read-only detection helper** (lockfile→ecosystem, shared with `worktree-setup.sh`) **+ the gate probe**; never call `worktree-setup.sh`; mutating probes in `mktemp` (**ADR-141**) | **As recommended.** |
| 7 | **Skill name + placement** — standalone vs. walk phase | **Standalone skill `craft:init`**, auto-discovered, invoked directly — not a `/craft:run` phase; session-owned, no worker agent (**ADR-142**) | **As recommended.** |

## Test strategy

The repo tests with `node --test` (`engine/package.json`), Given/When/Then titles, AAA bodies, `sut` variable (`engine/test/manifest.test.js` is the model). The generator decomposes into a **pure core (detection helper, `emitManifest`) + thin I/O seams (`AskUserQuestion`, fs write, lint subprocess, the orchestrator path-resolution)** so the bulk is unit-testable without a live interview.

1. **Emit round-trip (property/integration — the load-bearing lens).** For a generated matrix of `Answers`, assert `validateManifest(parseManifestContent(emit(answers).joined), { fileExists: ()=>true }).ok === true`. This is *the* property: **every interview outcome emits a lint-clean manifest** (R2). The parser/validator pair (`frontmatter.js` + `manifest.js`) is exactly a round-trip surface the global property-test rule flags. Cover **every answer combination** including: defaults-only (minimal manifest), every Tier-0 point set, every Tier-1 point set, and `models.<agent>` with/without `models.fallback`.
2. **Emit unit tests.** `emitManifest(answers)` — defaulted points omitted (minimal manifest); each catalog point maps to the correct key (`models.reviewer`, `pipeline.skip`, `policy.always`, `gates.<phase>`, `phases.<id>.execution`, `paths.dod`, …); **no key outside `TOP_KEYS`** ever emitted; **no per-phase `skip:`** ever emitted (ADR-011 guard); **no provenance** string (`P25`/`ADR`/backlog id) ever appears in frontmatter or prose (R9 — assert via regex over the joined output).
3. **Detection-helper unit tests (ADR-141).** The read-only lockfile→ecosystem helper over fixture repos (a fixture with `package-lock.json` → `{ecosystem:'npm', lockfile:'package-lock.json'}`; one with `go.mod` → `'go'`; one with no recognized lockfile → `null`). Assert the helper performs **no install / no mutation** (it is pure detection). Assert `worktree-setup.sh` still installs (its behaviour is unchanged by the refactor — a smoke or a guarded bats assertion that the install branch is intact). Mutating probes asserted to run only against a `mktemp` path, never the fixture root.
4. **Lint-round-trip integration (`bin`-level).** Emit a manifest, write to a temp `.claude/craft-<name>.md`, run `engine/bin/manifest-lint.js <path>` as a subprocess, assert exit 0 + "valid." The same gate `examples-lint` (ADR-063) applies to any shipped generator fixture/sample.
5. **Direct-overwrite + rollback-on-invalid (ADR-138, R6).** A valid emit lands at `.claude/craft-<name>.md`; a **deliberately-broken emit** (inject an invalid value) → temp-lint exits 2 → generator STOPs, the temp file is removed, **nothing lands**, and a **pre-existing valid same-name file is byte-for-byte intact** (the rollback property). A re-run for an existing name overwrites only that file (assert other `.claude/craft-*.md` and `.claude/workflow.md` untouched).
6. **`--config <name>` resolution (ADR-137).** The orchestrator path-resolution seam: `--config foo` selects `.claude/craft-foo.md` and that path flows to both `manifest-lint.sh` and `pipeline-resolve.js`; the overlay (`--profile`/`--skip`/`--harness`/`--policy`) folds over the named manifest at highest precedence (assert via `applyCliOverlay`/`pipeline-resolve` over a named-manifest fixture — e.g. a named config setting `pipeline.profile: full` overridden by CLI `--profile lean`); an **absent `--config` target is a loud blocker** (the resolution refuses, never falls back to `.claude/workflow.md`). The `<name>`-validation rejects path-separator/traversal names.

The interview transport (`AskUserQuestion`) is a thin seam mocked in unit tests; an on-demand manual smoke (run `craft:init` in a throwaway repo, accept defaults, confirm the landed `.claude/craft-<name>.md` lints, then `/craft:run --config <name>` loads it) covers the live conversation + the end-to-end consumption path, mirroring craft's other not-CI-gated smokes.

## Out of scope

- **Headless / `craft-pi` answer-file mode (ADR-139).** Deferred until a concrete non-Claude onboarding need exists; the interview is interactive-only. A follow-up backlog item captures it.
- **Editing/merging an existing rich manifest.** Frontmatter-merge with precedence-aware reconciliation is out; `craft:init` direct-overwrites a named file (ADR-138), never merges into an existing one.
- **Tier-2 derived-plugin authoring** (`extends.phases`/`agents`/`profiles`/`backlog-adapters`). The generator scaffolds Tier-0/1 customization, not a derived plugin — that is a packaging task, not a per-repo declination.
- **A run-time port.** The generator authors config consumed by the existing lint + resolver; it adds no new port to the hexagon and no new floor invariant (the §2 invariant core of `docs/GUIDE-customizing.md` is untouched).
- **Changing `validateManifest`/`TOP_KEYS`.** The generator emits only already-accepted keys; no schema change ships (ADR-136).
- **An engine bin change for `--config`.** None is needed — `manifest-lint`/`pipeline-resolve` already accept an arbitrary manifest path; `--config` is orchestrator-only wiring (ADR-137).

> **No longer out of scope (moved IN by ADR-137):** *named-manifest resolution* — a path that loads `.claude/craft-<name>.md` by name. P25 ships it end-to-end via the `--config <name>` token; it is now a first-class requirement (R5/D8), not a deferred follow-up.
