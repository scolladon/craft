# Plan — Harden & prove the Codex binding

> Source: design doc `docs/design/harden-prove-codex-binding.md` · ADRs `265, 266, 267`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it must
  earn it. No standalone test-only parts for FEATURE code: unit tests fold into the part
  whose code they exercise (A1, A2, B6, B9 each carry their own regression tests).
- EXCEPTION honoured here: **B7, B8, B10** are pure live-evidence probes with **no `src/`
  delta**, and **A5** is a fixture+pin-test with no `src/` delta. These are legitimately
  standalone under the test-infra/docs-only carve-out — they have no implementation part
  to fold into. B6 and B9 are impl parts (src+test); their fixes are NOT folded into each
  other or into the evidence probes.
- Parts share ONE working tree and land sequentially in the order below.

## Executor split (binding)

- **part-implementer agent (pure TDD, no live CLI)** — Parts 1–4 (A1, A2, A3, A4).
- **ORCHESTRATOR (live `codex` probe under a throwaway `CODEX_HOME`, isolation protocol
  §3 of the design) — NOT an agent** — Parts 5–9 (B6, B7, B8, B10, B9) and Part 10 (A5's
  rollout-fixture capture). A part-implementer agent CANNOT run the B-parts (real `codex`
  quota + hermetic-home isolation); the plan still fully specifies their code TDD/gate/
  commit, and marks the live-probe execution orchestrator-owned.

## Isolation protocol (§3) — every B-part and A5's capture obey this

- `mktemp -d` a throwaway home; export `CODEX_HOME`, `HOME`, `XDG_CONFIG_HOME` all inside
  it. State-mutating probes run there, NEVER in the worktree.
- Credentials by **copy, never read**: `cp ~/.codex/auth.json` and `cp ~/.codex/config.toml`
  into the throwaway home; do not open/print them.
- **Never `--ephemeral`** (it suppresses the session/rollout `.jsonl` that `--source codex`
  telemetry mines and A5 needs — a silent zero that reads as success).
- `git init` the `-C` directory so VCS-touching probes have a real repo.
- **Watchdog, not `timeout`** (macOS has no GNU `timeout`) — background watchdog bounds
  each run.
- **Isolation proof:** after each run `find ~/.codex -newermt '-15 minutes' -type f` MUST be
  empty (`-newermt`, NOT `ls -la` — SQLite `-wal`/`-shm` sidecars false-alarm an `ls`
  fingerprint). Trust an **independent re-run** of every observation, never `codex`'s own
  self-report.

## Decisions (bound — no open candidates)

Every load-bearing choice is pre-settled; this plan opens no new decision candidate.

- **ADR-265 (A3)** — `engine/src` is uniformly provenance-clean source (broad option); the
  guard scans `engine/src/**`; all 15 refs across 8 files are stripped. No engine-internal
  exemption.
- **ADR-266 (A2)** — the shared acceptance-probe harness is `engine/src/probe-harness.js`;
  each `probe.js` becomes a thin wrapper preserving its `runAcceptanceProbe` signature.
- **ADR-267 (A1)** — `adapters/opencode/src/git-guard-predicate.js` becomes a thin re-export
  of the shared engine module; no `engine/stryker.conf.json` edits.
- **DC-2 (B6 trust source)** — DEFERRED to probe time: codex-native trust if the live pin
  finds one, else JS `computeTrustedHash` replication. The hermetic regression test is
  written regardless; the wiring/algorithm is pinned from B6's live step 2, and its ADR is
  authored when the pin lands.
- **DC-3 (B9 launch guard)** — PRE-APPROVED option (b): regenerate via
  `buildExecpolicyRules()` and byte-compare against on-disk `craft.rules`; refuse on any
  drift. The fix + its ADR land only if B9's live probe confirms the runtime fail-open.

---

## Part 1 — A1: dedupe the git-ext-diff guard predicate to a shared engine home

### Context

**Executor:** part-implementer agent (pure TDD, no live CLI)

Working dir is the worktree root
`/Users/scolladon/workspace/perso/craft-harden-prove-codex-binding`; use repo-relative
paths. Pre-chewed — do NOT re-explore.

**Two byte-identical const triples exist today.**
- `engine/src/guards/tool-call-guard.js` — PRIVATE consts `COMPLIANT_MARKERS` (L11),
  `GIT_DIFF_SHOW_RE` (L16-17), `REASON_GIT_EXT_DIFF` (L19-20); private
  `guardBashCommand(command)` (L43-53) returns `{ block:false }` on a compliant marker or
  a non-`git diff/show` command, else `{ block:true, reason: REASON_GIT_EXT_DIFF }`.
  `toolCallGuard(event)` (L29-41), `guardWritePath` (L55-64), and exported
  `WRITE_TOOLS` (L5) STAY PUT untouched.
- `adapters/opencode/src/git-guard-predicate.js` — EXPORTS `COMPLIANT_MARKERS` (L2),
  `GIT_DIFF_SHOW_RE` (L7-8); PRIVATE `REASON_GIT_EXT_DIFF` (L10-11); EXPORTS
  `gitGuardPredicate(command)` (L19-29) — body byte-identical to `guardBashCommand`.
- Consumer that must keep importing unchanged: `adapters/opencode/src/git-guard-adapter.js:1`
  (`import { gitGuardPredicate } from './git-guard-predicate.js'`). Test that must stay
  green: `adapters/opencode/test/git-guard-predicate.test.js`. `engine/stryker.conf.json`
  names the opencode predicate in mutate + tap.testFiles — must remain paired.

**What ships.** New `engine/src/guards/git-ext-diff-predicate.js` exporting the three consts
(`COMPLIANT_MARKERS`, `GIT_DIFF_SHOW_RE`, `REASON_GIT_EXT_DIFF`) + `gitExtDiffPredicate(command)`
(the `gitGuardPredicate`/`guardBashCommand` body VERBATIM; returns `{ block, reason? }` with
the identical reason string). Then:
- `tool-call-guard.js`: `import { gitExtDiffPredicate } from './git-ext-diff-predicate.js';`
  replace `guardBashCommand`'s body with `return gitExtDiffPredicate(command);` (or call it
  directly from `toolCallGuard`) and DELETE its three now-duplicated private consts. `WRITE_TOOLS`
  / `toolCallGuard` / `guardWritePath` unchanged.
- `adapters/opencode/src/git-guard-predicate.js` becomes a thin re-export:
  `export { COMPLIANT_MARKERS, GIT_DIFF_SHOW_RE } from '../../../engine/src/guards/git-ext-diff-predicate.js';`
  and `export { gitExtDiffPredicate as gitGuardPredicate } from '../../../engine/src/guards/git-ext-diff-predicate.js';`.
  Import path `../../../engine/src/guards/…` is the SAME depth codex/copilot/pi src already
  use to reach `engine/src/guards/tool-call-guard.js` (confirmed:
  `adapters/codex/src/git-guard-adapter.js:14`). This is a NEW engine import for opencode
  (it imported nothing from engine before).

**Invariant to re-verify on the delta** (rerouting through a helper can silently drop a
guarantee): the block reason string MUST stay byte-identical —
`'git diff/show must carry --no-ext-diff (external diff mangles parsed output)'` — and
`WRITE_TOOLS`/`guardWritePath` behaviour is untouched.

**Public-surface decision — CROSS-PACKAGE by direct path, NOT barreled.** The engine barrel
`engine/src/index.js` re-exports only `parsePipeline`/`validatePipeline`/`resolvePipeline`/…
and does NOT list `guards/tool-call-guard.js` — the established convention is that adapters
import engine guards by direct relative path (`../../../engine/src/guards/…`). Therefore the
new `git-ext-diff-predicate.js` is deliberately **NOT** added to `engine/src/index.js`; its
one cross-package consumer is the opencode re-export, updated in-part. Downstream surface
gates checked and pre-paid here: (a) engine barrel — no edit (correct, matches precedent);
(b) Stryker — the `engine/src/**/*.js` mutate glob (`engine/stryker.conf.json:16-17`)
auto-covers the new file, the new engine test kills its mutants, NO stryker edit; (c)
`engine/test/mutation-config.test.js` validates only `adapters/` pairings — the opencode
mutate/testFiles pairing is undisturbed (a 0-mutant re-export is harmless), so it stays
green; (d) no generated API report / registry / README enumerates engine guard modules.

**Hygiene (contract):** the new module ships provenance-clean (ADR-265 binds every new
`engine/src` file from birth) — no ADR/phase/backlog refs in code or test; no suppression
directives; no swallowed errors.

### TDD steps

RED
1. Add `engine/test/guards/git-ext-diff-predicate.test.js` (Given/When/Then titles, AAA
   body, `const sut = gitExtDiffPredicate`): compliant marker (`--no-ext-diff`, `rtk proxy`)
   → `{ block:false }`; `git diff` without `--no-ext-diff` → `{ block:true, reason: '<exact
   reason>' }`; non-git command → `{ block:false }`; interposed global option
   (`git -C /x diff`) → blocked; `git show-ref`/`git stash show`/`git difftool` → NOT blocked
   (regex negatives). Run `cd engine && node --test test/guards/git-ext-diff-predicate.test.js`.
   Expected failure: module absent → import throws.

GREEN
2. Create `engine/src/guards/git-ext-diff-predicate.js` (three consts + `gitExtDiffPredicate`,
   body verbatim from `gitGuardPredicate`). Re-run the new test → green.
3. Rewire `tool-call-guard.js` (import + delete its three private consts) and rewrite
   `adapters/opencode/src/git-guard-predicate.js` as the thin re-export.

REFACTOR / behaviour-preservation proof
4. Run `cd engine && node --test test/tool-call-guard.test.js` and
   `cd adapters/opencode && node --test test/git-guard-predicate.test.js` — BOTH must stay
   green UNMODIFIED; that is the proof the reroute preserved behaviour. Confirm the reason
   string is byte-identical and no provenance refs / suppression directives were introduced.

### Gate

Part touches BOTH engine and the opencode adapter — run BOTH:
- `cd engine && node --test test/guards/git-ext-diff-predicate.test.js test/tool-call-guard.test.js`
- `cd adapters/opencode && node --test test/git-guard-predicate.test.js`

All green. Never commit on a red gate.

### Commit

`refactor(guards): dedupe git-ext-diff predicate into a shared engine module`

---

## Part 2 — A2: dedupe the acceptance-probe harness across four bindings

### Context

**Executor:** part-implementer agent (pure TDD, no live CLI)

Pre-chewed — do NOT re-explore. `adapters/{opencode,copilot,codex,pi}/src/probe.js` are
four near-verbatim copies. BYTE-IDENTICAL across all four: `assertMutationsInsideThrowaway`,
`assertGateGreenBeforeCommit`, `assertCommittedArtifact`, `evaluateTrace`; consts
`PHASE_ID='implementation'`, `MODEL_TIER='sonnet'`. Each exports
`runAcceptanceProbe({ <b>Runner, fsOps })` and builds an evidence object via `buildEvidence`.

Variation points (confirmed):

| binding  | runner param     | versionKey        | PORTS_EXERCISED                     | extra runner args |
|----------|------------------|-------------------|-------------------------------------|-------------------|
| opencode | `opencodeRunner` | `opencodeVersion` | Execution, Model, Gate, VCS (4)     | none |
| copilot  | `copilotRunner`  | `copilotVersion`  | Execution, Model, Gate, VCS (4)     | `buildLaunchArgs` from `./deny-tool-args.js` |
| codex    | `codexRunner`    | `codexVersion`    | Execution, Model, Gate (3, no VCS)  | `buildLaunchArgs` from `./launch-args.js` |
| pi       | `piRunner`       | `piVersion`       | Execution, Model, Gate, VCS (4)     | none |

codex/copilot COMPUTE `launchArgs` from `targetPath` (`buildLaunchArgs({ workingDir: targetPath })`)
and pass it as the runner arg `launchArgs` — the extra-args slot is a **function of
targetPath**, not a static object. Reference shape confirmed in `adapters/codex/src/probe.js`
(`runAcceptanceProbe` L~96-115): `const launchArgs = buildLaunchArgs({ workingDir: targetPath });`
then `codexRunner({ phaseId, modelTier, workingDir, launchArgs })`; evidence =
`{ targetPath, codexVersion, model, portsExercised: PORTS_EXERCISED.slice(), phases: trace.phases ?? [] }`.

**What ships.** New `engine/src/probe-harness.js` exporting
`runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs = () => ({}) })`
(`portsExercised` ADDED to the brief's signature — it genuinely varies):

```
export async function runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs = () => ({}) }) {
  const targetPath = await fsOps.mktemp();
  const trace = await runner({ phaseId: PHASE_ID, modelTier: MODEL_TIER, workingDir: targetPath, ...extraRunnerArgs(targetPath) });
  const passed = evaluateTrace(trace, targetPath);
  const evidence = { targetPath, [versionKey]: trace[versionKey], model: trace.model, portsExercised: portsExercised.slice(), phases: trace.phases ?? [] };
  return { passed, evidence };
}
```

Move `PHASE_ID`, `MODEL_TIER`, the four `assert*`, and `evaluateTrace` into the harness.
Each `probe.js` becomes a thin wrapper preserving its exported `runAcceptanceProbe({ <b>Runner,
fsOps })` signature EXACTLY, e.g. codex:

```
export async function runAcceptanceProbe({ codexRunner, fsOps }) {
  return runProbeHarness({
    runner: codexRunner, fsOps,
    versionKey: 'codexVersion',
    portsExercised: Object.freeze(['Execution', 'Model', 'Gate']),
    extraRunnerArgs: (targetPath) => ({ launchArgs: buildLaunchArgs({ workingDir: targetPath }) }),
  });
}
```

pi/opencode OMIT `extraRunnerArgs` (default `() => ({})`); copilot supplies its
`deny-tool-args` `buildLaunchArgs`. Import path from each adapter:
`../../../engine/src/probe-harness.js`.

**Invariant to re-verify on the delta.** Each binding's evidence object must be structurally
identical to today's: the version property key is the binding's own (`[versionKey]`),
`portsExercised` is a fresh `.slice()` copy (NOT the frozen array), and the runner is called
with the SAME keys it receives today — `launchArgs` ONLY where it exists; pi/opencode must
NOT gain a `launchArgs: undefined` key (the spread of `{}` guarantees this).

**Public-surface decision — CROSS-PACKAGE by direct path, NOT barreled.** `runProbeHarness`
is a new engine export consumed only by the four adapter wrappers via
`../../../engine/src/probe-harness.js`; it is deliberately NOT added to `engine/src/index.js`
(same direct-path convention as A1's guard). The four adapters keep their `runAcceptanceProbe`
export UNCHANGED (public surface preserved → the four `probe.test.js` stay green). Surface
gates pre-paid: (a) engine barrel — no edit; (b) Stryker `engine/src/**/*.js` glob
(`engine/stryker.conf.json:16-17`) auto-covers `probe-harness.js`, the new engine test kills
its mutants, NO stryker edit; do NOT add adapter probe suites to stryker testFiles —
`mutation-config.test.js` bans binding-wide adapter globs precisely because probe suites
spawn the real CLI and hang the dry run; (c) no API report / registry / README lists it.

**Hygiene (contract):** `probe-harness.js` ships provenance-clean (ADR-265 binds it from
birth); no suppression directives; no swallowed errors.

### TDD steps

RED
1. Add `engine/test/probe-harness.test.js` — hermetic unit test with a FAKE runner (a plain
   async fn returning a canned trace; NEVER spawns a CLI) and a fake `fsOps.mktemp`. Assert:
   (a) `extraRunnerArgs(targetPath)` is merged into the runner call (fake asserts it received
   the extra key computed from the mktemp path); (b) `versionKey` is read dynamically off the
   trace into `evidence[versionKey]`; (c) `evidence.portsExercised` is a COPY (mutating it
   does not mutate the input array); (d) a red gate (`gateOutcome:'red'`), a missing artifact
   (`committedArtifact:null`), and an out-of-throwaway mutation each flip `passed` false;
   (e) the happy path returns `passed:true`. Run
   `cd engine && node --test test/probe-harness.test.js`. Expected failure: module absent.

GREEN
2. Create `engine/src/probe-harness.js`; reduce each of the four `probe.js` to its wrapper
   per the table (preserve each `runAcceptanceProbe` signature and each binding's
   `buildLaunchArgs` import where it exists).

REFACTOR / behaviour-preservation proof
3. Run all four `adapters/*/test/probe.test.js` — MUST stay green UNMODIFIED (the wrappers
   preserve the public signature and evidence shape). Confirm pi/opencode wrappers pass NO
   `launchArgs` key; confirm no provenance refs / suppression directives.

### Gate

Part touches engine + all four adapters — run engine harness test AND all four probe suites:
- `cd engine && node --test test/probe-harness.test.js`
- `cd adapters/opencode && node --test test/probe.test.js`
- `cd adapters/copilot && node --test test/probe.test.js`
- `cd adapters/codex && node --test test/probe.test.js`
- `cd adapters/pi && node --test test/probe.test.js`

All green. Never commit on a red gate.

### Commit

`refactor(probe): extract the shared acceptance-probe harness into engine`

---

## Part 3 — A3: strip provenance refs from engine/src and extend the guard (ADR-265)

### Context

**Executor:** part-implementer agent (pure TDD, no live CLI)

Pre-chewed — do NOT re-explore. ADR-265 (broad) is RATIFIED: **all `engine/src` is
provenance-clean source, no engine-internal exemption.** The existing `PROVENANCE_REF` grep
suites scan ADAPTER surfaces only (`adapters/pi/test/native-surface.test.js:15`,
`adapters/opencode/test/agents.test.js:25`, `adapters/opencode/test/commands.test.js`),
never `engine/src`. A full scan finds **15 refs across 8 `engine/src` files** — all genuine
breadcrumbs, no false positives:

- `engine/src/observability/adapters/claude/telemetry.js` — `ADR-188` @L113, `ADR-187` @L174 (2)
- `engine/src/observability/adapters/claude/pricing.js` — `Part 3` @L54, `Part 4` @L94 (2)
- `engine/src/manifest-harness.js` (3), `engine/src/skip-signals.js` (2 — one keeps the
  `auto-skip: …` token example, drops the `ADR-146:` prefix), `engine/src/manifest-vocabulary.js` (2),
  `engine/src/manifest-pipeline-edits.js` (2), `engine/src/manifest.js` (1), `engine/src/gates.js` (1).

Detection regex (reuse the existing `PROVENANCE_REF` constant — a detector legitimately
naming what it detects is the established exception, and the guard test is not itself a new
leak): `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`.

**What ships.** A new engine-side guard test `engine/test/source-hygiene.test.js` extending
provenance coverage to `engine/src/**`, plus the 15 comment-only rewrites.

The guard test MUST pin the known offenders **POSITIVELY** (ADR-265 consequence): enumerate
`engine/src/**/*.js` (recursive), assert the resolved file set is **NON-EMPTY** (a glob
resolving to zero files must not pass vacuously), assert each of the 8 named files IS in the
scanned set, and assert every scanned file is clean of `PROVENANCE_REF`. Use the
`fileURLToPath`/`join(REPO_ROOT, …)` idiom already in `engine/test/mutation-config.test.js`
(REPO_ROOT = two levels up from the test file) for path resolution.

**Rewrite rule (behaviour-preserving, comment-only).** All 15 matches are in `//` or `*`
comment lines — NONE in executable code or a load-bearing string literal. State the rationale
in prose WITHOUT the numbered reference (e.g. `ADR-188` → the reason it points to;
`skip-signals.js:14` keeps the `auto-skip: …` token example, drops the `ADR-146:` prefix).
The `engine/src/probe-harness.js` born in Part 2 is already clean under this guard.

**Public-surface decision — NONE.** No new exported symbol: this part adds a test file and
edits comments only. No barrel/registry/API-report change.

**Hygiene (contract):** the rewrites themselves must not introduce a new ref; the new test
file must not carry one (the `PROVENANCE_REF` regex literal inside it is the detector
exception, not a leak). No suppression directives; no swallowed errors.

### TDD steps

RED
1. Add `engine/test/source-hygiene.test.js`: enumerate `engine/src/**/*.js`, assert the set
   is non-empty, assert the 8 offender files are present in the set, and assert each scanned
   file contains no `PROVENANCE_REF` match. Run
   `cd engine && node --test test/source-hygiene.test.js`. Expected failure: 15 refs across
   8 files still present → the "clean" assertion fails on the offenders.

GREEN
2. Strip/reword all 15 comment refs across the 8 files (comment-only, one file at a time):
   `claude/telemetry.js`, `claude/pricing.js`, `manifest-harness.js`, `skip-signals.js`,
   `manifest-vocabulary.js`, `manifest-pipeline-edits.js`, `manifest.js`, `gates.js`. Re-run
   the guard test → green.

REFACTOR / behaviour-preservation proof
3. Re-run the FULL engine suite `cd engine && node --test 'test/**/*.test.js'` — every
   pre-existing engine test stays green (comment-only edits touch no executable code or
   string literal). Confirm the `skip-signals.js` `auto-skip: …` token example is preserved
   (only the numbered prefix dropped).

### Gate

- `cd engine && node --test test/source-hygiene.test.js`
- (behaviour-preservation) `cd engine && node --test 'test/**/*.test.js'`

All green. Never commit on a red gate.

### Commit

`refactor(observability): strip provenance refs from engine/src and extend the guard`

---

## Part 4 — A4: remove the orphaned per-adapter Stryker config

### Context

**Executor:** part-implementer agent (pure TDD, no live CLI)

Pre-chewed — do NOT re-explore. Dead file:
`adapters/pi/stryker.conf.json` (`{"testRunner":"tap",…,"mutate":["adapters/pi/src/**/*.js"],…}`).
Wired into NOTHING — no npm script, no `scripts/ci.sh`; `.claude/workflow.md`'s mutation
probe is `test -f engine/stryker.conf.json` exclusively. `engine/stryker.conf.json` ALREADY
covers `adapters/pi/src/tool-call-hook.js` (mutate + tap.testFiles). ADR-263 rejects
per-adapter configs as "an unexecuted config file".

Guard test to extend: `engine/test/mutation-config.test.js`. It already resolves
`REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')` and imports
`{ existsSync }` / `{ join }` (L1-8) — reuse both. Its existing tests validate the
`engine/stryker.conf.json` mutate/testFiles pairing and ban binding-wide adapter globs
(L52-58).

**What ships.** Delete `adapters/pi/stryker.conf.json`; add one test to
`engine/test/mutation-config.test.js` asserting no per-adapter `stryker.conf.json` exists.

**Public-surface decision — NONE.** No new exported symbol (file deletion + test extension).

**Hygiene (contract):** no provenance refs / suppression directives in the added test.

### TDD steps

RED
1. Add to `engine/test/mutation-config.test.js` a test that POSITIVELY pins the known
   offender: assert `existsSync(join(REPO_ROOT, 'adapters/pi/stryker.conf.json'))` is
   `false`; then a general sweep asserting no `adapters/**/stryker.conf.json` resolves
   (enumerate `adapters/*/stryker.conf.json` via `existsSync` over the four known binding
   dirs, or a `find`-style check — assert the resolved list is empty). Run
   `cd engine && node --test test/mutation-config.test.js`. Expected failure: the pi config
   still present → the `=== false` assertion fails.

GREEN
2. `git rm adapters/pi/stryker.conf.json`. Re-run the test → green.

REFACTOR / behaviour-preservation proof
3. Re-run `cd engine && node --test test/mutation-config.test.js` — the four pre-existing
   `engine/stryker.conf.json` pairing/glob tests stay green (dead-file removal touches
   nothing they assert).

### Gate

- `cd engine && node --test test/mutation-config.test.js`

Engine-only is correct despite the deletion living under `adapters/pi/`: the removed file is
an unexecuted config with NO covering adapter test (the design's whole point — it was wired
into nothing), so the assertion that proves the change lives in the engine guard test. No
`adapters/pi` behaviour changed, so no adapter-side gate applies. Green. Never commit on a red
gate.

### Commit

`chore(stryker): remove the orphaned per-adapter pi config`

---

## Part 5 — B6: launch-time hook-trust verification + fail-loud fix (HIGHEST PRIORITY)

### Context

**Executor:** ORCHESTRATOR (live codex probe, isolation protocol §3 of the design) — NOT an agent

Pre-chewed — do NOT re-explore. This part BOTH (a) runs the live untrusted-hook probe under
the §3 throwaway home to pin codex's trust-write format (DC-2), AND (b) lands a hermetic
fail-loud fix + regression test. **This is the FIRST live construction run — its rollout
`.jsonl` is captured for Part 10 (A5) before teardown (§3 "A5 capture rides here").**

Relevant files:
- `adapters/codex/hooks/craft-guard.js` — enforcing PreToolUse hook: exit 2 + stderr denies;
  every path (deny / fail-closed / unreadable payload) ends in a deny; never writes stdout on
  the allow path.
- `adapters/codex/hooks.json` — registers
  `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js` under
  `PreToolUse` matcher `*`.
- `adapters/codex/src/launch-args.js` — `buildLaunchArgs({ workingDir, bypassHookTrust=false })`
  (L45); `FLAG_BYPASS_HOOK_TRUST='--dangerously-bypass-hook-trust'` (L21) is OPT-IN, default
  OFF; its comment (L58-72) already names the open question (untrusted headless hook may fail
  loud OR silently no-op). codex has `hooks.state` / `trusted_hash` trust state.
- The codex adapter has NO barrel/package `exports` — src modules are internal, imported by
  relative path within the adapter. `buildLaunchArgs` is consumed by
  `adapters/codex/src/probe.js:102` (the construction/launch driver).

**Live probe protocol (orchestrator, §3 throwaway home).**
1. Install the binding's hook UNTRUSTED (fresh `hooks.state`, no `trusted_hash` for
   craft-guard). Run a `codex exec` command the guard WOULD deny (a `git diff` without
   `--no-ext-diff`, or a write outside `-C`). Observe: does it run? Any stderr warning?
   Independent re-run confirms — never trust codex's self-report.
2. Establish trust the codex-native way (whatever writes `hooks.state`/`trusted_hash`).
   Capture EXACTLY what codex writes: file location, JSON shape, and what `trusted_hash` is
   computed over (command string? hook file bytes?). **This pins DC-2.**
3. Re-run the same denied command; confirm it is now blocked.
4. Isolation proof: `find ~/.codex -newermt '-15 minutes' -type f` empty. Copy the run's
   rollout `.jsonl` out of the throwaway home to
   `engine/test/fixtures/codex/real-rollout.jsonl` for Part 10 (BEFORE teardown).

**Hypothesis.** The untrusted hook silently no-ops (command runs, no error) — the worst case
the launch-args comment anticipates; the fix below is assumed needed.

**Fix-shape (assumed needed).** New internal helper `adapters/codex/src/hook-trust.js`:
- `computeTrustedHash(...)` — reproduces codex's `trusted_hash` over the craft-guard hook
  (algorithm pinned from probe step 2 / DC-2).
- `writeHookTrust({ codexHome })` — writes the `trusted_hash` into `$CODEX_HOME/hooks.state`
  so the install step is SCRIPTABLE, not manual.
- `verifyHookTrust({ codexHome })` → `{ trusted: boolean }` — reads `hooks.state`, checks
  craft-guard's entry matches the expected hash.

Wire `verifyHookTrust` at the launch boundary (the point where `buildLaunchArgs`' argv is
consumed to spawn codex): before spawn, if untrusted → THROW a LOUD error (refuse to launch;
a guard that only appears installed is worse than a visible refusal). NEVER emit
`--dangerously-bypass-hook-trust` to paper over it (it disables the trust gate for EVERY hook
in the environment, not just craft's). The exact integration point and the hash algorithm are
pinned from the live probe (DC-2); the hermetic regression test drives the module directly and
is written regardless.

**Public-surface decision — INTERNAL to the codex adapter.** `computeTrustedHash`,
`writeHookTrust`, `verifyHookTrust` are exported from `adapters/codex/src/hook-trust.js` and
consumed by relative import within the codex adapter only. The codex adapter has no
barrel/package `exports`, so there is NO cross-package surface to update. NOT added to
`engine/stryker.conf.json` mutate — adapter mutation is opt-in per-file and
`mutation-config.test.js` validates only EXISTING pairings; adding a new adapter src file to
mutate would also require adding its test to testFiles, and the design does not scope mutation
here. No registry/exhaustiveness switch names these.

**Hygiene (contract):** no provenance refs / suppression directives; no swallowed errors —
the fail-loud path THROWS with context, never silently returns. The live probe is
state-mutating → §3 throwaway, never the worktree.

### TDD steps

RED (hermetic — no live CLI)
1. `adapters/codex/test/hook-trust.test.js`: given a `hooks.state` (written in a `mktemp`
   home) WITHOUT craft-guard's trusted hash → `verifyHookTrust` returns `{ trusted:false }`
   and the launch-verify wrapper THROWS (fail-loud). Given a `hooks.state` WITH the matching
   hash (written by `writeHookTrust`) → `verifyHookTrust` returns `{ trusted:true }` and
   launch proceeds. Edge: an ABSENT `hooks.state` (fresh home) → treated as untrusted → THROW
   (never trusted-by-default). Run `cd adapters/codex && node --test test/hook-trust.test.js`.
   Expected failure: module absent.

LIVE PROBE (orchestrator, §3) — pins DC-2 and captures A5's fixture
2. Run the probe protocol steps 1-4 above; record the `hooks.state` format / hash source into
   the evidence; author DC-2's ADR from the live pin.

GREEN
3. Implement `hook-trust.js` with the pinned hash algorithm; wire `verifyHookTrust` at the
   launch boundary to throw on untrusted. Re-run the hermetic test → green.

REFACTOR
4. Diff-review: functions <20 lines, early-return, no swallowed errors (throw with context),
   no provenance refs. Confirm the fix never emits `--dangerously-bypass-hook-trust`.

### Gate

- `cd adapters/codex && node --test test/hook-trust.test.js`
- (isolation, orchestrator) `find ~/.codex -newermt '-15 minutes' -type f` is EMPTY after the
  live probe.

Green. Never commit on a red gate. (If the live probe CONTRADICTS the fail-open hypothesis —
codex already fails loud when untrusted — the fix collapses to the scriptable
`writeHookTrust`/`verifyHookTrust` install helper + its test; report this as a resolved
uncertainty, not a blocker.)

### Commit

`fix(codex): fail loud when the craft-guard hook is untrusted at launch`

---

## Part 6 — B7: prove shared skills load by reference (live evidence, no src delta)

### Context

**Executor:** ORCHESTRATOR (live codex probe, isolation protocol §3 of the design) — NOT an agent

Pre-chewed — do NOT re-explore. PURE EVIDENCE probe: no `src/` delta expected. Legitimately
standalone (test-infra/docs-only carve-out).

Relevant files:
- `adapters/codex/marketplace.json` — two local plugins: `craft` (`source: local,
  path: ./plugins/craft`) and `craft-codex` (`./plugins/craft-codex`).
- `adapters/codex/plugins/craft/plugin.json` — `"skills": "../../../../skills"` (resolves up
  four levels to repo-root `skills/`).
- `adapters/codex/plugins/craft-codex/plugin.json` — `"hooks": "../../hooks.json"`,
  `"skills": "./skills"` (only `craft-run`).
- Repo-root `skills/` holds 19 shared skills.

**Live probe protocol (orchestrator, §3 throwaway home).**
1. Install the local marketplace `craft-codex-marketplace` into the throwaway codex home;
   install both plugins.
2. Enumerate `skills/` on disk → the expected set (DERIVE the count from the directory; do
   NOT hardcode 19 — a 20th skill must not pass silently).
3. Assert codex's skill registry lists every enumerated skill by name after install (loaded).
4. Invoke at least one shared skill; capture its transcript (invocable).
5. Isolation proof: `find ~/.codex -newermt '-15 minutes' -type f` empty; independent re-run
   of the registry listing.

**Hypothesis / evidence.** The `../../../../skills` path is structurally correct → expected
PURE EVIDENCE (registry listing of all shared skills + one invocation transcript). Only if a
skill is MISSING from the registry (broken manifest path) does a fix arise — then the
`skills` path in `plugins/craft/plugin.json` is the suspect; that would be a NEW code change,
reported back as a blocker with the three-option protocol rather than guessed here.

**Public-surface decision — NONE** (no src delta on the happy path).

**Hygiene (contract):** state-mutating install → §3 throwaway, never the worktree; credentials
by copy, never read; never `--ephemeral`.

### TDD steps

Evidence-only (no unit test — this is a live probe, not feature code):
1. Run probe protocol steps 1-5 above under the §3 throwaway home.
2. Capture the registry listing + one invocation transcript as the evidence carried to the
   documentation phase (phase 9), where the `docs/adapters/codex-poc-record.md` row and the
   BACKLOG checkbox flip land — NOT in this plan's scope.
3. If (and only if) a skill is missing → STOP and report a blocker `{ unit: plugins/craft
   skills path, reason: skill absent from registry, options: [fix the manifest path / adjust
   the marketplace install / accept-and-doc the limitation] }`.

### Gate

Evidence-only, no gate (no `src/` delta). Orchestrator confirms isolation:
`find ~/.codex -newermt '-15 minutes' -type f` is EMPTY after the run; the registry listing
is confirmed by an independent re-run.

### Commit

No code commit on the pure-evidence path (the evidence is carried to the documentation
phase). Commit ONLY if the probe yields a durable evidence artifact worth pinning in-repo
(e.g. a captured transcript fixture) → `docs(codex): capture shared-skills load-by-reference
evidence`. If the probe surfaces a required fix, that fix lands under its own `fix(codex): …`
commit per the blocker resolution.

---

## Part 7 — B8: measure what each sandbox mode blocks (live evidence, no src delta)

### Context

**Executor:** ORCHESTRATOR (live codex probe, isolation protocol §3 of the design) — NOT an agent

Pre-chewed — do NOT re-explore. PURE EVIDENCE probe: no `src/` delta expected. Standalone
(test-infra/docs-only carve-out).

Relevant files:
- `adapters/codex/src/launch-args.js` selects `-s workspace-write` (L18-19); full-access is
  never emitted. `adapters/codex/config.template.toml:12` sets `sandbox_mode = "workspace-write"`.
  Both state per-mode blocking was NEVER measured against this binding — a posture, not a
  containment guarantee.
- Modes: `codex exec -s read-only | workspace-write | danger-full-access`.

**Live probe protocol (orchestrator, §3 throwaway repo `git init`'d under the throwaway home).**
Fixed 3×3 matrix — for each mode, attempt each action, record blocked/allowed:

| action ↓ / mode →                         | read-only | workspace-write | danger-full-access |
|-------------------------------------------|-----------|-----------------|--------------------|
| write file inside cwd                     |           |                 |                    |
| write file outside cwd (throwaway `$HOME`)|           |                 |                    |
| network fetch (curl to a loopback listener the orchestrator starts) | | | |

**Hypothesis.** read-only blocks all three writes; workspace-write allows write-inside-cwd,
blocks write-outside-cwd + network; danger-full-access allows all. **Fail-open trigger:**
workspace-write allowing an outside-cwd write OR a network fetch would contradict the selected
posture and demand a mode change or explicit doc correction (reported as a blocker, not fixed
by guess). Pure evidence otherwise.

**Public-surface decision — NONE** (no src delta on the happy path).

**Hygiene (contract):** loopback-only network listener; §3 throwaway repo + home; independent
re-run per cell.

### TDD steps

Evidence-only (no unit test — live probe):
1. Run the 3×3 matrix under the §3 throwaway home; record blocked/allowed per cell with an
   independent re-run of each observation.
2. Carry the completed matrix as evidence to the documentation phase (row + BACKLOG flip land
   there, out of this plan's scope).
3. If a fail-open trigger fires → STOP and report a blocker `{ unit: launch-args sandbox
   posture, reason: workspace-write allowed <cell>, options: [tighten the emitted -s mode /
   doc-correct the containment claim / escalate] }`.

### Gate

Evidence-only, no gate (no `src/` delta). Orchestrator confirms isolation:
`find ~/.codex -newermt '-15 minutes' -type f` EMPTY; each matrix cell confirmed by an
independent re-run.

### Commit

No code commit on the pure-evidence path (evidence carried to the documentation phase).
Commit ONLY a durable evidence artifact if produced → `docs(codex): capture sandbox-mode
blocking matrix`. A required fix lands under its own `fix(codex): …` per the blocker
resolution.

---

## Part 8 — B10: exercise `CLAUDE_PLUGIN_ROOT` substitution (live evidence, no src delta)

### Context

**Executor:** ORCHESTRATOR (live codex probe, isolation protocol §3 of the design) — NOT an agent

Pre-chewed — do NOT re-explore. PURE EVIDENCE probe: no `src/` delta expected. Standalone
(test-infra/docs-only carve-out).

Relevant file:
- `adapters/codex/hooks.json:8` —
  `"command": "node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`
  — a shell-style default-expansion: `CRAFT_ROOT` if set, else `CLAUDE_PLUGIN_ROOT`.

**Live probe protocol (orchestrator, §3 throwaway home).**
1. UNSET `CRAFT_ROOT`, SET `CLAUDE_PLUGIN_ROOT` to the plugin root; install the hook.
2. Trigger a PreToolUse event; assert the guard actually runs from the
   `CLAUDE_PLUGIN_ROOT`-resolved path (it denies a command it should deny → the node path
   resolved).
3. Separately confirm `:-` DEFAULT semantics: with `CRAFT_ROOT` set, that value wins; with
   only `CLAUDE_PLUGIN_ROOT`, the fallback resolves.
4. Isolation proof: `find ~/.codex -newermt '-15 minutes' -type f` empty; independent re-run.

**Hypothesis.** codex substitutes `${CLAUDE_PLUGIN_ROOT}`. **Real risk:** if codex does only
flat `${VAR}` substitution and NOT POSIX `:-` default-expansion, the compound
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` breaks and the hook path never resolves — a broken
template needing a fix (split the fallback out of the template), reported as a blocker rather
than guessed. Pure evidence if the compound resolves both ways.

**Public-surface decision — NONE** (no src delta on the happy path). If the fix IS needed it
edits `adapters/codex/hooks.json` (config, not an exported symbol) — still no barrel surface.

**Hygiene (contract):** §3 throwaway home; env vars set inside the throwaway only; independent
re-run.

### TDD steps

Evidence-only (no unit test — live probe):
1. Run probe protocol steps 1-4 above under the §3 throwaway home.
2. Carry the resolution evidence (both `:-` branches) to the documentation phase.
3. If the compound fails to resolve → STOP and report a blocker `{ unit: hooks.json command
   template, reason: codex lacks POSIX :- expansion, options: [split the fallback into a
   resolved command / precompute CRAFT_ROOT at install / doc the requirement] }`.

### Gate

Evidence-only, no gate (no `src/` delta). Orchestrator confirms isolation:
`find ~/.codex -newermt '-15 minutes' -type f` EMPTY; both branches confirmed by independent
re-run.

### Commit

No code commit on the pure-evidence path (evidence carried to the documentation phase).
Commit ONLY a durable evidence artifact if produced → `docs(codex): capture
CLAUDE_PLUGIN_ROOT substitution evidence`. A required template fix lands under its own
`fix(codex): …` per the blocker resolution.

---

## Part 9 — B9: malformed `.rules` fail-open probe + regenerate-and-byte-compare fix

### Context

**Executor:** ORCHESTRATOR (live codex probe, isolation protocol §3 of the design) — NOT an agent

Pre-chewed — do NOT re-explore. Runs AFTER B6 (Part 5): until B6 proves the craft-guard hook
enforces, a "blocked `git push`" here could come from the hook, not the execpolicy — B6 must
establish the hook enforces before B9 attributes a block to the rules layer. This part BOTH
runs the live fail-open probe AND lands a hermetic fix (DC-3 pre-approved: option b).

Relevant files:
- `adapters/codex/craft.rules` — shipped Starlark; header (L8-9) states "A malformed .rules
  file does not fail closed: treat it as fail open (unresolved) at runtime". The single rule
  forbids `["git", ["push","clean","reset"]]`.
- `adapters/codex/src/execpolicy-rules.js` — `buildExecpolicyRules()` (L69-74) deterministically
  GENERATES that exact `.rules` text; `FORBIDDEN_GIT_SUBCOMMANDS = ['push','clean','reset']` (L15).
- The codex adapter has NO barrel/package `exports` — src is internal.

**Live probe protocol (orchestrator, §3 throwaway home).**
1. Seed the throwaway home with a DELIBERATELY malformed `craft.rules` (e.g. a truncated
   `prefix_rule(` — unparseable Starlark).
2. Run a real `codex exec` command the INTACT rule would forbid (`git push` in the throwaway
   repo). Independent re-run.
3. Observe: blocked (fail-closed) or allowed (fail-open)?
4. Isolation proof: `find ~/.codex -newermt '-15 minutes' -type f` empty.

**Hypothesis.** Fail-open (per the shipped comment + backlog): the forbidden `git push` runs
because the malformed rule resolves to no match → the fix below is needed.

**Fix-shape (DC-3 pre-approved, option b — hermetic, no codex subprocess).** A launch
precondition that regenerates the expected text via `buildExecpolicyRules()` and byte-compares
it to the on-disk `craft.rules`; any drift (malformed OR semantic) throws a loud refusal.
Catches EVERY drift, not just the one malformed variant probed. New internal module (e.g.
`adapters/codex/src/execpolicy-integrity.js`) exporting the precondition (name it for what it
checks, e.g. `verifyExecpolicyIntegrity({ rulesPath })` → throws on drift); wire it at the
launch boundary alongside B6's `verifyHookTrust`.

**Public-surface decision — INTERNAL to the codex adapter.** The precondition is exported from
its new `adapters/codex/src` module and consumed by relative import within the codex adapter
only; no barrel/package `exports`, so no cross-package surface. NOT added to
`engine/stryker.conf.json` mutate (adapter mutation opt-in per-file; `mutation-config.test.js`
validates only existing pairings). No registry/exhaustiveness switch names it.

**Hygiene (contract):** the fix THROWS with context on drift (no swallowed error, no
fail-open); no provenance refs / suppression directives. Live probe is state-mutating → §3
throwaway, never the worktree.

### TDD steps

RED (hermetic — no live CLI)
1. `adapters/codex/test/execpolicy-integrity.test.js`: given on-disk rules text that DIFFERS
   from `buildExecpolicyRules()` output (a malformed truncation AND a semantic drift case),
   the precondition THROWS. Given the EXACT generated text, it passes. Edge: an ABSENT
   `craft.rules` mismatches the non-empty generated text → THROW (no rules = unprotected,
   refuse). Run `cd adapters/codex && node --test test/execpolicy-integrity.test.js`.
   Expected failure: precondition absent.

LIVE PROBE (orchestrator, §3) — confirms the runtime fail-open (runs AFTER B6)
2. Run probe protocol steps 1-4 above; confirm `git push` runs under a malformed rule
   (fail-open). If CONFIRMED, the fix is justified; author DC-3's ADR from the evidence.

GREEN
3. Implement `execpolicy-integrity.js`; wire the precondition at the launch boundary to throw
   on any drift. Re-run the hermetic test → green.

REFACTOR
4. Diff-review: <20 lines, early-return, throw-with-context (no swallowed error / no
   fail-open), byte-compare against `buildExecpolicyRules()` as the single source of truth,
   no provenance refs.

### Gate

- `cd adapters/codex && node --test test/execpolicy-integrity.test.js`
- (isolation, orchestrator) `find ~/.codex -newermt '-15 minutes' -type f` EMPTY after the
  live probe.

Green. Never commit on a red gate. (If the live probe CONTRADICTS fail-open — codex already
fails closed on a malformed `.rules` — report it: the byte-compare integrity precondition
still lands as defence-in-depth against silent drift, but frame the ADR around drift-detection
rather than a live fail-open fix.)

### Commit

`fix(codex): refuse launch on execpolicy drift via regenerate-and-byte-compare`

---

## Part 10 — A5: real codex rollout fixture + telemetry pin

### Context

**Executor:** ORCHESTRATOR (the rollout `.jsonl` is captured live during Part 5's B6 run per
§3 — "A5 capture rides here" — then this part authors the pin test) — NOT an agent

Pre-chewed — do NOT re-explore. LAST part: depends on the real rollout captured out of B6's
construction run. Standalone (fixture + pin-test, no `src/` delta on the envelope-identical
path — the test-infra carve-out).

Relevant files:
- `engine/src/observability/adapters/codex/telemetry.js` — `parseLines` (L196-216) matches the
  `turn.completed` envelope; `tokensFromCodexUsage` (L65-75) extracts `input_tokens` +
  `cached_input_tokens` (capped) + `output_tokens`; session id held from `thread.started`
  (`thread_id`/`id`, L118-133). The binding header (L10-19) records the DEFERRED gap: whether
  the persisted rollout `.jsonl` (`--source codex` reads it) carries the SAME `turn.completed`
  envelope as the live `codex exec --json` stream was UNPINNED (no rollout existed locally).
- Existing SYNTHETIC fixtures: `engine/test/fixtures/codex/{single-turn,multi-turn,malformed}.jsonl`.
- Existing test suite: `engine/test/codex-telemetry.test.js`.
- Captured fixture (from Part 5, §3): `engine/test/fixtures/codex/real-rollout.jsonl`.

**What ships.** Drop the captured `engine/test/fixtures/codex/real-rollout.jsonl` into the
repo and extend `engine/test/codex-telemetry.test.js` to pin its token-bearing record shape
against the binding: the event type that carries usage in the PERSISTED file and the four
fields `parseLines`/`tokensFromCodexUsage` read (`input_tokens`, `cached_input_tokens`,
`output_tokens`, `reasoning_output_tokens`) plus the `thread.started` session id.

**Contingency (this is where the DEFERRED gap resolves).** If the persisted rollout uses the
SAME `turn.completed` envelope → A5 is PURE PINNING (behaviour-preserving, no `src/` delta;
still standalone under the carve-out). If it uses a DIFFERENT envelope/type, `parseLines`
currently fails safe to ZERO events on the real file — a real bug — and the fix is to teach
`parseLines` to recognise the rollout's actual usage record. That fix, if needed, is surfaced
from the captured evidence (NOT guessed here); it turns this into a `src`-touching part whose
same test then proves the fix.

**Public-surface decision — NONE** on the envelope-identical path (fixture + test only). If the
contingency fix is needed, it edits `parseLines` inside the EXISTING
`engine/src/observability/adapters/codex/telemetry.js` — no NEW exported symbol, no barrel
change; `telemetry.js` is already under the `engine/src/**/*.js` Stryker glob so the extended
test provides killing coverage with no config edit.

**Hygiene (contract):** the fixture is a captured real rollout — verify it carries NO
credential/secret bytes before committing (it is a token-count telemetry record, not auth);
no provenance refs / suppression directives in the test. ADR-265 binds any `telemetry.js`
edit to stay provenance-clean.

### TDD steps

CAPTURE (orchestrator, done during Part 5 per §3)
0. The real rollout `.jsonl` was copied out of B6's throwaway home to
   `engine/test/fixtures/codex/real-rollout.jsonl` before teardown (never `--ephemeral`, so
   the rollout exists). Confirm the file is present and non-empty.

RED
1. Extend `engine/test/codex-telemetry.test.js`: feed `real-rollout.jsonl` through
   `parseLines` and assert the parsed events' token totals EQUAL the values read directly out
   of the captured record (`input_tokens`, `cached_input_tokens` capped, `output_tokens`,
   `reasoning_output_tokens`) and the session id equals the `thread.started` id. Run
   `cd engine && node --test test/codex-telemetry.test.js`. Expected failure: fixture absent
   until dropped in; AND, if the persisted envelope differs, `parseLines` returns zero events
   → the token-total assertion fails (surfacing the contingency).

GREEN
2. Add the fixture. If envelope-identical → the binding already passes. Else apply the
   contingency fix to `parseLines` (recognise the rollout's actual usage record) and re-run
   → green.

REFACTOR
3. If `parseLines` was touched: diff-review it stays provenance-clean, early-return, no
   swallowed error; re-run the FULL engine suite `cd engine && node --test 'test/**/*.test.js'`
   so the synthetic-fixture cases stay green alongside the real one.

### Gate

- `cd engine && node --test test/codex-telemetry.test.js`
- (if `parseLines` was touched) `cd engine && node --test 'test/**/*.test.js'`

Green. Never commit on a red gate.

### Commit

`test(codex): pin real rollout token shape` — or, if the contingency fix was needed,
`fix(codex): parse persisted-rollout usage records in telemetry`.
