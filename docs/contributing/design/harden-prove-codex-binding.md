# Design — Harden & prove the Codex binding

Ten parts. Five **A-parts** are behaviour-preserving code cleanups landed by strict
TDD, one atomic commit each. Five **B-parts** are live-probe investigations the
**orchestrator** runs against the real `codex` CLI in a throwaway home — this design
supplies the protocol, the hypothesis, and (for the parts assumed to fail open) the
fix-shape and its regression test. The designer/implementer never spawns `codex`.

Evidence rows land later in `docs/adapters/codex-poc-record.md`; backlog checkboxes
flip in the documentation phase. Neither is in this doc's scope.

---

## Context

**A-parts (cleanups).** Four bindings (opencode, copilot, codex, pi) accreted
byte-identical duplication as each was ported: the git-ext-diff guard constants live
twice (A1), the acceptance-probe harness lives four times (A2), a provenance leak sits
in an engine-nested adapter (A3), and a dead per-adapter Stryker config never got swept
(A4). A5 closes the one telemetry gap the binding shipped with a documented DEFERRED
note: no real `codex` rollout `.jsonl` was ever read, so the persisted-record token
shape is pinned only against synthetic fixtures.

**B-parts (proofs).** The Codex binding ships several postures it has never observed
under a live `codex`: whether an untrusted hook silently no-ops (B6), whether shared
skills actually load by reference (B7), what each sandbox mode blocks (B8), whether a
malformed execpolicy fails open at runtime (B9), and whether `CLAUDE_PLUGIN_ROOT`
substitutes in a hook template (B10). B6 and B9 are assumed to need real code + a
fail-loud fix; the rest are pure evidence unless a probe contradicts the shipped
posture.

---

## Requirements

Close every outstanding follow-up surfaced by the native-codex-binding work, sourced from
`BACKLOG.md` (the two `Open (scoped 2026-07-20 …)` sections) and this doc's part list:

- **A1–A5 (code cleanups)** — behaviour-preserving or additive, each via strict TDD, one atomic
  commit: A1 dedupe the git-ext-diff guard-predicate constants to a single home; A2 dedupe the
  acceptance-probe harness across the four bindings; A3 strip provenance refs from `engine/src`
  and extend the source-hygiene guard; A4 remove the orphaned `adapters/pi/stryker.conf.json`;
  A5 capture a real codex rollout fixture and pin its token-bearing record shape.
- **B6–B10 (live-probe investigations)** — run the real `codex` CLI under the isolation protocol
  (below); each records a CONFIRMED evidence row and, if a probe reveals a fail-open, ships a fix
  + regression test in the same run: B6 launch-time hook-trust; B7 shared-skill load-by-reference;
  B8 per-mode sandbox blocking; B9 malformed `.rules` runtime fail-open; B10 `CLAUDE_PLUGIN_ROOT`
  substitution.
- **Non-goals** are captured in *Out of scope*.

## Design

### A1 — Dedupe the git-ext-diff guard predicate to a shared home

**Context block**
- `engine/src/guards/tool-call-guard.js`: PRIVATE consts `COMPLIANT_MARKERS` (L11),
  `GIT_DIFF_SHOW_RE` (L16-17), `REASON_GIT_EXT_DIFF` (L19-20); `guardBashCommand`
  (L43-53). `toolCallGuard` (L29-41) and `WRITE_TOOLS` (L5, exported) stay put.
- `adapters/opencode/src/git-guard-predicate.js`: EXPORTS `COMPLIANT_MARKERS` (L2),
  `GIT_DIFF_SHOW_RE` (L7-8); PRIVATE `REASON_GIT_EXT_DIFF` (L10-11);
  `gitGuardPredicate(command)` (L19-29) → `{ block, reason? }`. The three consts are
  byte-identical to tool-call-guard's.
- Consumers of the opencode module (must keep importing): `adapters/opencode/src/git-guard-adapter.js:1`
  (`import { gitGuardPredicate }`); `adapters/opencode/test/git-guard-predicate.test.js:3`;
  `engine/stryker.conf.json` mutate L23 + testFiles L12.

**Approach.** Create `engine/src/guards/git-ext-diff-predicate.js` exporting the three
consts + `gitExtDiffPredicate(command)` (the current opencode `gitGuardPredicate` body,
verbatim; returns `{ block, reason? }` with the identical reason string). Then:
- `tool-call-guard.js` imports `{ gitExtDiffPredicate }` and replaces `guardBashCommand`'s
  body with `return gitExtDiffPredicate(command)`; delete its three now-duplicated
  private consts.
- `adapters/opencode/src/git-guard-predicate.js` becomes a thin re-export:
  `export { COMPLIANT_MARKERS, GIT_DIFF_SHOW_RE } from '<engine>/guards/git-ext-diff-predicate.js'`
  and `export { gitExtDiffPredicate as gitGuardPredicate } from '<engine>/guards/git-ext-diff-predicate.js'`.
  Its public import surface (`COMPLIANT_MARKERS`, `GIT_DIFF_SHOW_RE`, `gitGuardPredicate`)
  stays importable unchanged.

Import path from the opencode adapter: `../../../engine/src/guards/git-ext-diff-predicate.js`
— opencode's src sits at the same depth as the codex/copilot/pi src that already import
`engine/src/guards/tool-call-guard.js` (this is a NEW engine import for opencode, which
until now imported nothing from the engine).

**Invariant to re-verify on the delta** (rerouting through a new helper can silently
drop a guarantee the old path made): the reason string returned on block MUST remain
byte-identical (`'git diff/show must carry --no-ext-diff (external diff mangles parsed
output)'`), and `WRITE_TOOLS`/`guardWritePath` behaviour is untouched.

**Test plan (TDD, red first).**
1. RED: add a unit test for the new module `engine/test/guards/git-ext-diff-predicate.test.js`
   (Given/When/Then, sut = `gitExtDiffPredicate`) covering: compliant marker → not
   blocked; `git diff` without `--no-ext-diff` → blocked with the exact reason;
   non-git command → not blocked; the interposed-global-option cases the regex allows.
   Fails (module absent).
2. GREEN: create the module; wire tool-call-guard + opencode re-export.
3. The existing `adapters/opencode/test/git-guard-predicate.test.js` and the engine
   tool-call-guard tests MUST stay green unmodified — that is the behaviour-preservation
   proof.

**Stryker.** `engine/src/**/*.js` (mutate glob L17) auto-covers the new file; the new
engine test provides the killing coverage. Opencode's re-export becomes a 0-mutant file
but keeps its mutate/testFiles pairing (mutation-config.test.js requires the pairing to
exist, not to carry mutants). No stryker edit needed. Home + re-export-vs-retarget is
**DC-5**.

---

### A2 — Dedupe the acceptance-probe harness across four bindings

**Context block**
- Four near-verbatim copies: `adapters/{opencode,copilot,codex,pi}/src/probe.js`.
- BYTE-IDENTICAL across all four: `assertMutationsInsideThrowaway`,
  `assertGateGreenBeforeCommit`, `assertCommittedArtifact`, `evaluateTrace`; shared
  consts `PHASE_ID='implementation'`, `MODEL_TIER='sonnet'`.
- Variation points (confirmed by reading all four):

  | binding  | runner param     | versionKey        | PORTS_EXERCISED                       | extra runner args |
  |----------|------------------|-------------------|---------------------------------------|-------------------|
  | opencode | `opencodeRunner` | `opencodeVersion` | Execution, Model, Gate, VCS (4)       | none |
  | copilot  | `copilotRunner`  | `copilotVersion`  | Execution, Model, Gate, VCS (4)       | `buildLaunchArgs` from `./deny-tool-args.js` |
  | codex    | `codexRunner`    | `codexVersion`    | Execution, Model, Gate (3, no VCS)    | `buildLaunchArgs` from `./launch-args.js` |
  | pi       | `piRunner`       | `piVersion`       | Execution, Model, Gate, VCS (4)       | none |

- codex/copilot COMPUTE `launchArgs` from `targetPath`
  (`buildLaunchArgs({ workingDir: targetPath })`) and pass it as the runner arg
  `launchArgs` — so the extra-args slot is a **function of targetPath**, not a static
  object.
- Test suites that must stay green: `adapters/{opencode,copilot,codex,pi}/test/probe.test.js`.

**Approach.** Create `engine/src/probe-harness.js` exporting
`runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs = () => ({}) })`
(note: `portsExercised` ADDED to the brief's signature — it genuinely varies).

```
export async function runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs = () => ({}) }) {
  const targetPath = await fsOps.mktemp();
  const trace = await runner({ phaseId: PHASE_ID, modelTier: MODEL_TIER, workingDir: targetPath, ...extraRunnerArgs(targetPath) });
  const passed = evaluateTrace(trace, targetPath);
  const evidence = { targetPath, [versionKey]: trace[versionKey], model: trace.model, portsExercised: portsExercised.slice(), phases: trace.phases ?? [] };
  return { passed, evidence };
}
```

The four `probe.js` become thin wrappers preserving their exported
`runAcceptanceProbe({ <b>Runner, fsOps })` signature EXACTLY, e.g. codex:

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

pi/opencode omit `extraRunnerArgs` (default `() => ({})`); copilot supplies its
`deny-tool-args` `buildLaunchArgs`.

**Invariant to re-verify on the delta.** Each binding's evidence object must be
structurally identical to today's: the version property key is the binding's own
(`[versionKey]`), `portsExercised` is a fresh `.slice()` copy (not the frozen array),
and the runner is called with the SAME keys it receives today (`launchArgs` only where
it exists — pi/opencode must NOT gain a `launchArgs: undefined` key; the spread of
`{}` guarantees this).

**Test plan (TDD, red first).**
1. RED: `engine/test/probe-harness.test.js` — hermetic unit test of `runProbeHarness`
   with a FAKE runner (never spawns a CLI): asserts (a) `extraRunnerArgs(targetPath)` is
   merged into the runner call, (b) `versionKey` is read dynamically off the trace,
   (c) `portsExercised` is copied, (d) a red gate / missing artifact / out-of-throwaway
   mutation each flip `passed` false. Fails (module absent).
2. GREEN: create `engine/src/probe-harness.js`; reduce each `probe.js` to its wrapper.
3. All four `adapters/*/test/probe.test.js` MUST stay green unmodified.

**Stryker.** `engine/src/probe-harness.js` falls under the mutate glob; the new
`engine/test/probe-harness.test.js` (under the `engine/test/**` testFiles glob) kills
those mutants. Do NOT add the adapter probe suites to stryker testFiles —
`mutation-config.test.js` bans binding-wide adapter globs precisely because probe suites
are the ones that would hang the dry run. Home is **DC-4**.

---

### A3 — Provenance-ref leak in the engine-nested Claude adapter

**Context block**
- Leaking files: `engine/src/observability/adapters/claude/telemetry.js` (`ADR-188` @L113,
  `ADR-187` @L174) and `.../claude/pricing.js` (`Part 3` @L54, `Part 4` @L94) — 4 refs.
- Wider blast radius (regex `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`): 15 refs
  across 8 `engine/src` files (manifest-harness 3, skip-signals 2, claude/telemetry 2,
  claude/pricing 2, manifest-vocabulary 2, manifest-pipeline-edits 2, manifest 1,
  gates 1). All genuine breadcrumbs, no false positives.
- De-facto boundary: the PROVENANCE_REF grep suites
  (`adapters/pi/test/native-surface.test.js:15`, `adapters/opencode/test/agents.test.js:25`,
  also `adapters/opencode/test/commands.test.js`) scan ADAPTER surfaces only, never
  `engine/src`. The nuance: `engine/src/observability/adapters/claude/` is literally an
  adapter nested under `engine/src`.

**Approach (RATIFIED — ADR-265, option (a) BROAD).** The user chose the broad option over
the designer's recommendation (b): **all `engine/src` is provenance-clean source, no
engine-internal exemption.** Extend the guard to scan `engine/src/**` and strip ALL 15 refs
across the 8 files. The guard test MUST pin the known offenders POSITIVELY: assert the
concrete offending files are scanned and clean AND that the scanned file set is non-empty —
a glob resolving to zero files must not pass vacuously. Reuse the existing PROVENANCE_REF
regex constant (a detector legitimately naming what it detects is the established exception;
the guard test does not itself count as a new leak).

**Test plan (TDD, red first) — RATIFIED option (a).**
1. RED: extend the provenance-guard coverage to `engine/src/**` (a new engine-side guard
   test, e.g. `engine/test/source-hygiene.test.js`, since the existing suites live under
   `adapters/*/test/`); assert the 8 known files are scanned and clean and the file set is
   non-empty. Fails now (15 refs present across 8 files).
2. GREEN: strip/reword all 15 comment refs across `claude/{telemetry,pricing}.js`,
   `manifest-harness.js`, `manifest-vocabulary.js`, `manifest-pipeline-edits.js`,
   `manifest.js`, `gates.js`, and `skip-signals.js` — state the rationale in prose without
   the numbered reference (e.g. `ADR-188` → the reason it points to; `skip-signals.js:14`
   keeps the `auto-skip: …` token example, drops the `ADR-146:` prefix).
3. All rewrites are comment-only (behaviour-preserving); no executable code or load-bearing
   string literal is touched. The new `engine/src/probe-harness.js` (A2) is born clean under
   the same guard.
4. ADR-265 records this decision (authored in the decisions phase — done).

---

### A4 — Remove the orphaned per-adapter Stryker config

**Context block**
- Dead file: `adapters/pi/stryker.conf.json` (`{"testRunner":"tap",…,"mutate":["adapters/pi/src/**/*.js"],…}`).
  Wired into NOTHING — no npm script, no `ci.sh`; `.claude/workflow.md`'s mutation probe
  is `test -f engine/stryker.conf.json` exclusively.
- `engine/stryker.conf.json` ALREADY covers `adapters/pi/src/tool-call-hook.js`
  (mutate L24, testFiles L13). ADR-263 explicitly rejects per-adapter configs as "an
  unexecuted config file".
- Guard test to extend: `engine/test/mutation-config.test.js` (already "bans a
  binding-wide adapter glob" at L52-58).

**Approach.** Delete the file. Extend `mutation-config.test.js` with a test asserting no
per-adapter `stryker.conf.json` exists.

**Test plan (TDD, red first).**
1. RED: new test — POSITIVELY pin the known offender: assert
   `existsSync(join(REPO_ROOT, 'adapters/pi/stryker.conf.json'))` is `false`; then a
   general sweep asserting no `adapters/**/stryker.conf.json` resolves. Fails now (file
   present).
2. GREEN: `git rm adapters/pi/stryker.conf.json`.
3. Behaviour-preserving (dead file); every other suite stays green.

---

### A5 — Real codex rollout fixture + telemetry pin

**Context block**
- Binding: `engine/src/observability/adapters/codex/telemetry.js`. `parseLines`
  (L196-216) matches the `turn.completed` envelope; `tokensFromCodexUsage` (L65-75)
  extracts `input_tokens` + `cached_input_tokens` (capped) + `output_tokens`; session id
  is held from `thread.started` (`thread_id`/`id`, L118-133).
- The binding's own header (L10-19) records the DEFERRED gap: whether the persisted
  rollout `.jsonl` (`--source codex` reads it) carries the SAME `turn.completed`
  envelope as the live `codex exec --json` stream is unpinned — no rollout existed
  locally to read.
- Existing SYNTHETIC fixtures: `engine/test/fixtures/codex/{single-turn,multi-turn,malformed}.jsonl`.
- Existing test suite: `engine/test/codex-telemetry.test.js`.

**Approach.** Save a REAL captured rollout durably as
`engine/test/fixtures/codex/real-rollout.jsonl` (the orchestrator captures it during a
B-part live run — see §5 ordering) and pin its token-bearing record shape against the
binding. Record shape to pin: the event type that carries usage in the PERSISTED file
and the four fields `parseLines`/`tokensFromCodexUsage` read (`input_tokens`,
`cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`) plus the
`thread.started` session id.

**Contingency (this is where the DEFERRED gap resolves).** If the persisted rollout uses
the SAME `turn.completed` envelope, A5 is pure pinning (behaviour-preserving). If it uses
a DIFFERENT envelope/type, `parseLines` currently fails safe to zero events on the real
file — a real bug — and the fix is to teach `parseLines` to recognise the rollout's
actual usage record. That fix, if needed, is surfaced from the captured evidence, not
guessed here.

**Test plan (TDD, red first).**
1. RED: extend `engine/test/codex-telemetry.test.js` — feed the real fixture through
   `parseLines` and assert the events' token totals equal the values read directly out
   of the captured record. Fails until the fixture is dropped in (and, if the envelope
   differs, until `parseLines` handles it).
2. GREEN: add the fixture; if envelope-identical the binding already passes; else apply
   the contingency fix.

---

### B6 — Launch-time hook-trust verification (HIGHEST PRIORITY — real code + fix)

**Context block**
- `adapters/codex/hooks/craft-guard.js`: enforcing PreToolUse hook — exit 2 + stderr
  denies; every path (deny / fail-closed / unreadable payload) ends in a deny; never
  writes stdout on the allow path.
- `adapters/codex/hooks.json`: registers `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js`
  under `PreToolUse` matcher `*`.
- `adapters/codex/src/launch-args.js`: `buildLaunchArgs({ workingDir, bypassHookTrust=false })`
  (L45). `FLAG_BYPASS_HOOK_TRUST='--dangerously-bypass-hook-trust'` (L21) is OPT-IN,
  default OFF, and its comment (L58-72) already names the open question: an untrusted
  headless hook may fail loud OR silently no-op — the latter means "guard absent while
  appearing installed".
- codex has `hooks.state` / `trusted_hash` trust state.

**Probe protocol (orchestrator, in a throwaway CODEX_HOME — see §3).**
1. Install the binding's hook UNTRUSTED (fresh `hooks.state`, no trusted_hash for
   craft-guard). Run a `codex exec` command the guard WOULD deny (e.g. a `git diff`
   without `--no-ext-diff`, or a write outside `-C`). Observe: does the command run?
   Any error/warning on stderr? Independent re-run confirms — never trust codex's
   self-report.
2. Establish trust the codex-native way (whatever writes `hooks.state`/`trusted_hash`).
   Capture EXACTLY what codex writes: the file location, the JSON shape, and what the
   `trusted_hash` is computed over (the command string? the hook file bytes?).
3. Re-run the same denied command; confirm it is now blocked.

**Hypothesis.** The untrusted hook silently no-ops (command runs, no error) — the
worst case the launch-args comment anticipates.

**Fix-shape (assumed needed).** New helper `adapters/codex/src/hook-trust.js`:
- `computeTrustedHash(...)` — reproduces codex's trusted_hash over the craft-guard hook
  (algorithm pinned from step 2 above).
- `writeHookTrust({ codexHome })` — writes the trusted_hash into `$CODEX_HOME/hooks.state`
  so the install step is SCRIPTABLE, not manual.
- `verifyHookTrust({ codexHome })` → `{ trusted: boolean }` — read `hooks.state`, check
  craft-guard's entry matches the expected hash.

Launch path: before the codex subprocess spawns, call `verifyHookTrust`; if untrusted,
throw a LOUD error (refuse to launch — a guard that only appears installed is worse than
a visible refusal). NEVER emit `--dangerously-bypass-hook-trust` to paper over it (it
disables the trust gate for every hook in the environment, not just craft's).

**Regression test plan (TDD, red first).**
1. RED: `adapters/codex/test/hook-trust.test.js` — given a `hooks.state` WITHOUT
   craft-guard's trusted hash, `verifyHookTrust` → `{ trusted: false }`, and the
   launch-verify wrapper THROWS (fail-loud). Given a `hooks.state` WITH the matching
   hash (written by `writeHookTrust` in a mktemp home), `verifyHookTrust` →
   `{ trusted: true }` and launch proceeds. Edge: an ABSENT `hooks.state` (fresh home)
   is treated as untrusted → THROW, never as trusted-by-default. Fails (module absent).
2. GREEN: implement `hook-trust.js`; wire the launch-verify at the spawn boundary.

The trust-hash source of truth (delegate to codex's own trust command vs. replicate the
hash in JS) is **DC-2** — it cannot be decided before step 2's live pin.

---

### B7 — Prove shared skills load by reference via local-marketplace install

**Context block**
- `adapters/codex/marketplace.json`: two local plugins — `craft`
  (`source: local, path: ./plugins/craft`) and `craft-codex` (`./plugins/craft-codex`).
- `adapters/codex/plugins/craft/plugin.json`: `"skills": "../../../../skills"` — resolves
  from `adapters/codex/plugins/craft/` up four levels to the repo-root `skills/`.
- `adapters/codex/plugins/craft-codex/plugin.json`: `"hooks": "../../hooks.json"`,
  `"skills": "./skills"` (only `craft-run`).
- Repo-root `skills/` holds 19 shared skills (architecture, decisions, design,
  documentation, implementation, init, integrate, metrics, planning, promote-config,
  propose, prune, refactoring, requirements, review, run, tune, validation, workspace).

**Probe protocol (orchestrator, throwaway home).**
1. Install the local marketplace `craft-codex-marketplace` into the throwaway codex home;
   install both plugins.
2. Enumerate `skills/` on disk → the expected set of 19 (do NOT hardcode the number in
   the assertion — derive it from the directory so a 20th skill can't pass silently).
3. Assert codex's skill registry lists all 19 by name after install (loaded).
4. Invoke at least one shared skill and capture its transcript (invocable).

**Hypothesis / evidence.** The `../../../../skills` path is structurally correct, so
this is expected to be PURE EVIDENCE: registry listing of all 19 + one invocation
transcript. Only if a skill is missing from the registry (broken manifest path) does a
fix arise — then the `skills` path in `plugins/craft/plugin.json` is the suspect.

---

### B8 — Measure what each codex sandbox mode blocks, per mode

**Context block**
- `adapters/codex/src/launch-args.js` selects `-s workspace-write` (L18-19);
  full-access is never emitted. `config.template.toml:12` sets
  `sandbox_mode = "workspace-write"`. Both files state plainly that per-mode blocking
  was NEVER measured against this binding — a posture, not a containment guarantee.
- Modes: `codex exec -s read-only | workspace-write | danger-full-access`.

**Probe protocol (orchestrator, throwaway repo `git init`'d under the throwaway home).**
Fixed 3×3 matrix — for each mode, attempt each action and record blocked/allowed:

| action ↓ / mode →     | read-only | workspace-write | danger-full-access |
|-----------------------|-----------|-----------------|--------------------|
| write file inside cwd |           |                 |                    |
| write file outside cwd (sibling of the throwaway repo, e.g. throwaway `$HOME`) | | | |
| network fetch (curl to a loopback listener the orchestrator starts) | | | |

**Hypothesis.** read-only blocks all three writes; workspace-write allows write-inside-cwd,
blocks write-outside-cwd + network; danger-full-access allows all. **Fail-open trigger:**
workspace-write allowing an outside-cwd write or a network fetch would contradict the
selected posture and demand either a mode change or an explicit doc correction. Pure
evidence otherwise.

---

### B9 — Malformed `.rules` execpolicy: does runtime fail OPEN? (assume yes)

**Context block**
- `adapters/codex/craft.rules`: shipped Starlark; its own header (L8-9) states "A
  malformed .rules file does not fail closed: treat it as fail open (unresolved) at
  runtime". The single rule forbids `["git", ["push","clean","reset"]]`.
- `adapters/codex/src/execpolicy-rules.js`: `buildExecpolicyRules()` (L69-74)
  deterministically GENERATES that exact `.rules` text;
  `FORBIDDEN_GIT_SUBCOMMANDS = ['push','clean','reset']` (L15).
- `execpolicy check` treats malformed as a hard error; the RUNTIME enforcement path on
  the same input is unpinned.

**Probe protocol (orchestrator, throwaway home).**
1. Seed the throwaway home with a DELIBERATELY malformed `craft.rules` (e.g. a truncated
   `prefix_rule(` — unparseable Starlark).
2. Run a real `codex exec` command that the INTACT rule would forbid (`git push` in the
   throwaway repo). Independent re-run.
3. Observe: blocked (fail-closed) or allowed (fail-open)?

**Hypothesis.** Fail-open (per the shipped comment + backlog) — the forbidden `git push`
runs because the malformed rule resolves to no match.

**Fix-shape (assumed needed) — see DC-3 for the alternatives.** The binding must detect a
corrupt/unparseable rules file AT LAUNCH and REFUSE to proceed unprotected, rather than
run with silently-void enforcement. Recommended shape (DC-3 option b): a launch
precondition that regenerates the expected text via `buildExecpolicyRules()` and
byte-compares it to the on-disk `craft.rules`; any drift (malformed included) throws a
loud refusal. This is hermetic (no codex subprocess), deterministic, and catches ANY
drift — not just the one malformed variant probed.

**Regression test plan (TDD, red first).**
1. RED: `adapters/codex/test/execpolicy-integrity.test.js` — given on-disk rules text
   that differs from `buildExecpolicyRules()` output (malformed or drifted), the launch
   precondition THROWS; given the exact generated text, it passes. Edge: an ABSENT
   `craft.rules` mismatches the non-empty generated text → THROW (no rules = unprotected,
   refuse). Fails (precondition absent).
2. GREEN: implement the precondition; wire it at the launch boundary.

---

### B10 — Exercise `CLAUDE_PLUGIN_ROOT` substitution in a hook command template

**Context block**
- `adapters/codex/hooks.json:8`: `"command": "node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`
  — a shell-style default-expansion: `CRAFT_ROOT` if set, else `CLAUDE_PLUGIN_ROOT`.

**Probe protocol (orchestrator, throwaway home).**
1. UNSET `CRAFT_ROOT` and SET `CLAUDE_PLUGIN_ROOT` to the plugin root; install the hook.
2. Trigger a PreToolUse event; assert the guard actually runs from the
   `CLAUDE_PLUGIN_ROOT`-resolved path (e.g. it denies a command it should deny, proving
   the node path resolved).
3. Separately confirm the `:-` DEFAULT semantics: with `CRAFT_ROOT` set, that value wins;
   with only `CLAUDE_PLUGIN_ROOT`, the fallback resolves.

**Hypothesis.** codex substitutes `${CLAUDE_PLUGIN_ROOT}`. **Real risk:** if codex does
only flat `${VAR}` substitution and NOT POSIX `:-` default-expansion, the compound
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` breaks and the hook path never resolves — a broken
template needing a fix (split the fallback out of the template). Pure evidence if the
compound resolves both ways.

---

## 3. Isolation protocol (shared by every B-part)

Every live probe runs the real `codex` binary; each MUST be hermetic and MUST NOT touch
the worktree or the operator's real `~/.codex`.

- **Throwaway home.** `mktemp -d`; export `CODEX_HOME`, `HOME`, and `XDG_CONFIG_HOME` all
  pointed inside it. State-mutating probes run there, never in the worktree.
- **Credentials by COPY, never read.** `cp ~/.codex/auth.json` and `cp ~/.codex/config.toml`
  into the throwaway `CODEX_HOME`. Do not open/print their contents.
- **Never `--ephemeral`.** It suppresses the session/rollout files `--source codex`
  telemetry mines (and that A5 needs) — a silent zero that reads as success.
- **`git init` the `-C` directory** so VCS-touching probes have a real repo.
- **Watchdog, not `timeout`.** macOS has no GNU `timeout`; use a background watchdog
  process to bound each run.
- **Isolation proof.** After a run, `find ~/.codex -newermt '-15 minutes' -type f` MUST
  be empty. Use `find -newermt`, NOT `ls -la` — SQLite `-wal`/`-shm` sidecars false-alarm
  an `ls` fingerprint. Trust an independent re-run of the observation, never codex's own
  self-report of what it did.
- **A5 capture rides here.** The first successful live construction run (B6) leaves a
  real rollout `.jsonl` in the throwaway home; copy it out to
  `engine/test/fixtures/codex/real-rollout.jsonl` before teardown.

---

## Decision candidates

**Resolutions (decisions phase, 2026-07-21):**
- **DC-1 → (a) BROAD, RATIFIED (ADR-265).** User chose the broad cleanup over the
  designer's rec (b). engine/src becomes provenance-clean source; guard scans `engine/src/**`;
  all 15 refs stripped. A3 section above already reflects this.
- **DC-4 → (a) ADOPTED (ADR-266).** `engine/src/probe-harness.js`.
- **DC-5 → (a) ADOPTED (ADR-267).** opencode predicate = thin re-export.
- **DC-2 (B6 trust source) → DEFERRED to probe time.** Auto-rule: codex-native trust if the
  live probe finds one, else JS hash replication. ADR authored when B6's live pin lands.
- **DC-3 (B9 launch guard) → PRE-APPROVED option (b)** (regenerate-and-byte-compare), per the
  operator's "proceed autonomously with recommended mechanism" ruling; the fix + its ADR land
  only if B9 confirms the runtime fail-open.

The original candidate write-ups (recommendations preserved for the record) follow.

**DC-1 (A3) — Scope of the provenance-ref cleanup.**
- (a) Treat ALL `engine/src` as source-to-clean: extend the grep to `engine/src` and
  strip all 15 refs across 8 files. Widest diff; touches manifest*/gates unrelated to any
  binding.
- (b) **[recommend]** Extend the grep to `engine/src/observability/adapters/**` only,
  strip the 4 `claude/` refs, and record an ADR ratifying: engine-INTERNAL comments may
  carry ADR breadcrumbs, but adapter surfaces — including those nested inside `engine/src`
  — must be provenance-clean. Scoped, principled, closes the leak, and settles the
  either/or the backlog says is currently "neither".
- (c) Ratify a blanket engine-internal exemption via ADR and strip nothing. Least work;
  leaves the adapter-nested leak standing.

**DC-2 (B6) — Trust-hash source of truth for scriptable hook-trust.** (Cannot be settled
until the live probe pins what codex writes into `hooks.state`.)
- (a) **[recommend, if available]** Delegate to codex's own trust mechanism/command to
  populate `hooks.state`; the binding's install helper shells out to it. Codex owns the
  format, so the write stays correct across codex versions.
- (b) Replicate codex's `trusted_hash` algorithm in JS (`computeTrustedHash`) and write
  `hooks.state` directly. No codex subprocess at install, but couples the binding to a
  codex internal that can drift.
- (c) Manual trust only + launch-time verify (no scriptable install). Rejected — the
  backlog names scriptable install as the point of the item.

**DC-3 (B9) — Launch guard against a malformed/void execpolicy.**
- (a) Launch-time `codex execpolicy check` gate that refuses on error — delegates to
  codex's authoritative parser, but spawns a codex subprocess at every launch.
- (b) **[recommend]** Regenerate via `buildExecpolicyRules()` and byte-compare against the
  on-disk `craft.rules`; refuse on any drift. Hermetic, deterministic, catches every
  drift (malformed or semantic), no subprocess.
- (c) Hand-rolled JS Starlark validator. Brittle; duplicates codex's parse semantics.

**DC-4 (A2) — Home of the shared probe harness.**
- (a) **[recommend]** `engine/src/probe-harness.js` — mirrors A1's lift into `engine/src`,
  where the four bindings already reach for `guards/tool-call-guard.js`; inherits the
  `engine/src/**` mutate glob for free.
- (b) A new `adapters/`-level shared module. Rejected — no existing adapters-shared home,
  and it would sit outside the stryker mutate scope the harness now needs.

**DC-5 (A1) — Opencode predicate module after the lift.**
- (a) **[recommend]** Keep `adapters/opencode/src/git-guard-predicate.js` as a thin
  re-export of the engine module. Preserves its public import surface AND its
  stryker mutate/testFiles pairing with zero config edits (a 0-mutant re-export is
  harmless).
- (b) Delete it and retarget `engine/stryker.conf.json` (mutate L23 + testFiles L12) at
  the engine module. Larger blast radius; changes the opencode import surface consumers
  depend on.

---

## Test strategy

- **A-parts (TDD, RED first):** each part's `### TDD steps` above is the strategy — a failing
  test pinning the target behaviour, minimal code to pass, then a behaviour-preservation proof
  (the pre-existing suites stay green *unmodified* for the refactors A1/A2; comment-only diffs for
  A3; a guard test for A4). A5 pins the real fixture against `parseLines`.
- **B-parts (fix portions):** the fail-open fixes (B6 guard-payload, B9 execpolicy integrity) are
  TDD'd with a RED test written against the live-captured real shape, then LIVE-verified against the
  real `codex` binary (unit-green alone is precisely what let the guard ship broken).
- **Mutation:** the changed logic (new engine modules, the guard-payload and telemetry-envelope
  fixes, the execpolicy integrity assertion) is per-hunk mutation-covered via `engine/stryker.conf.json`;
  surviving mutants are triaged (killed or proven equivalent).
- **Live-probe evidence** is recorded in `docs/adapters/codex-poc-record.md`; the isolation protocol
  below guarantees no touch to the operator's real `~/.codex`.

## Out of scope

- **Stronger destructive-git denial for the Copilot binding** — parked, blocked on upstream:
  `--deny-tool` is prefix-matching and cannot cover interposed global options (`git -C`,
  `--git-dir=`, `-c k=v`) without a richer upstream matcher or an argv-normalising wrapper. The
  shipped enumerated deny-set and its honestly-documented residual gap stay in place; the BACKLOG
  entry stays open, not closed.
- **The two codex-0.144.6 platform limitations** this run *confirms* but cannot fix in the binding:
  scriptable hook-trust (B6 — codex exposes no headless trust-write path) and by-reference
  shared-skill loading (B7 — codex plugin-cache drops out-of-tree refs). Both stay open with a
  precise blocker reason; the symlink fallback is the working path for shared skills.

## Ordering & dependencies

**A-parts** are independent atomic commits and can land in any order, with one
constraint:
- **DC-1 is now settled (a, ADR-265)** so A3 is unblocked — it strips all 15 refs across 8
  files and extends the guard to `engine/src/**`.
- **A5** is blocked on a captured real rollout, which comes from a live B run (§3) — so
  A5 commits AFTER the first successful B-part construction run, not before.

A1, A2, A3, A4 are all decision-free now (DC-1/DC-4/DC-5 settled) and can land first.

**B-parts** share the §3 isolation harness (stand it up once) and then:
- **B6 first** (highest priority): until the guard hook is proven actually active, B9's
  rules-enforcement probe is meaningless — a "blocked" result could come from the hook,
  not the execpolicy. B6 must establish that the hook enforces before B9 attributes a
  block to the rules layer.
- **B9 after B6.** Its fix-shape is blocked on **DC-3** and on the live confirmation that
  runtime fails open.
- **B6's fix** is blocked on **DC-2** and on the live pin of codex's trust-hash write.
- **B7, B8, B10** are independent of each other and of B6/B9; run them on the same
  throwaway harness in any order.
- **A5's fixture** is copied out of B6's construction run (§3) before teardown.

Recommended sequence: A1 → A2 → A4 → (DC-1) → A3 → stand up §3 harness → B6 → B7/B8/B10
→ B9 → A5.
