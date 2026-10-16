# Design — rules integrity launch wiring: call `assertRulesIntegrity` from a launch or install path, or keep it on demand

> Brief: `assertRulesIntegrity` is exported and unit-tested, but nothing calls it. The design that
> introduced it asked for a launch precondition, and none was wired. Decide whether to wire it into a
> launch or install path or keep it on demand, then land the choice in this run: code and tests if it
> is wired; BACKLOG, record and comment wording if it is not. The backlog entry is ticked either way.
> Status: draft → self-reviewed ×3

---

## Context

### Proof that the check is unwired

`git grep -n assertRulesIntegrity -- adapters bin engine scripts` (run 2026-10-16):

```
adapters/codex/src/execpolicy-rules.js:92:export function assertRulesIntegrity(onDiskText) {
adapters/codex/test/execpolicy-rules.test.js:6:import { buildExecpolicyRules, assertRulesIntegrity, … }
adapters/codex/test/execpolicy-rules.test.js:83:describe('assertRulesIntegrity() — refuse a drifted/malformed …
adapters/codex/test/execpolicy-rules.test.js:84,92,99,105,111: five `it`s
```

Every other match is prose: `BACKLOG.md`, ADRs 573/575/576, the POC record, and design and plan docs.

The request for a launch precondition is in `docs/contributing/design/harden-prove-codex-binding.md`:

- L421–428 (B9 *Fix-shape*): "The binding must detect a corrupt/unparseable rules file AT LAUNCH and
  REFUSE to proceed … a launch precondition that regenerates the expected text via
  `buildExecpolicyRules()` and byte-compares it to the on-disk `craft.rules`".
- L431–435 (RED): "Edge: an ABSENT `craft.rules` mismatches the non-empty generated text → THROW (no
  rules = unprotected, refuse)".
- L436 (GREEN): "implement the precondition; wire it at the launch boundary."
- L525–532 (DC-3): option (b), regenerate and byte-compare, was pre-approved (L496–498).

The check was implemented (`115bcce`). The L436 wiring was not done.

### What exists

- **The check.** `adapters/codex/src/execpolicy-rules.js` `assertRulesIntegrity(onDiskText)`
  (L92–100) is a pure function. It takes text, does no fs access, returns `{ intact: true }`, and
  throws `Error('craft execpolicy rules integrity check failed: …')` (L96) on any byte difference
  from `buildExecpolicyRules()` (L70–75). Its JSDoc (L77–91) says at L84–86: "Nothing in the binding
  calls this check yet: it protects only when a caller runs it before relying on the layer".
- **The binding has no launch path of its own.** `adapters/codex/src/launch-args.js`
  `buildLaunchArgs({ workingDir, bypassHookTrust = false })` (L45) only builds argv and does no I/O.
  Its one caller is `adapters/codex/src/probe.js` `runAcceptanceProbe({ codexRunner, fsOps })`
  (L20–28). That probe drives `engine/src/probe-harness.js` with an injected runner, and only
  `adapters/codex/test/probe.test.js` calls it. Operators start codex themselves:
  `adapters/codex/README.md` *Usage* (L180–186) is `codex exec "/craft-run …"`.
- **The only bin an operator runs** is `adapters/codex/bin/trust-hook.js`. It is a thin entry:
  `buildDependencies()` (L34–53) binds fs and spawn, and `readConfig` (L23–32) maps ENOENT to `''`.
  The logic lives in `adapters/codex/src/trust-hook-main.js`:
  - `main(argv, deps)` (L167–176) maps any throw to `EXIT_REFUSED`.
  - `run(argv, deps)` (L140–160) runs `parseCheckMode` → `resolveConfigPath(env)` (L53–61, which
    reads `CODEX_HOME`, then `HOME/.codex`) → `assertGuardScriptPresent` → `fetchHooksListing` (it
    spawns `codex app-server`) → report warnings and errors → `selectAndAnnounceHook` → `planTrust`
    → `assertEnabled` → `assertListingComplete` → `reportCheckOutcome` (`--check`) or
    `applyWriteOutcome` (write).
  - Exit codes are `EXIT_OK=0`, `EXIT_UNTRUSTED=1` and `EXIT_REFUSED=2` (L25–27).
  - Every I/O is injected.

  This bin is the install step: *Install-time hook trust*, README L94–138. README L136–138 says
  `--check` "is not wired into every launch; an operator must invoke it, or wire it into their own
  pipeline".
- **Nothing deploys `craft.rules`.** README *Load* and *Configure* never tell the operator to copy
  `adapters/codex/craft.rules` into `$CODEX_HOME/rules/`. This is a separate open entry,
  `BACKLOG.md` L246–252. On every documented install the deployed file is therefore **absent**, and
  `assertRulesIntegrity('')` throws.
- **The enforcing layer already covers the rule's commands.** The trusted PreToolUse hook
  (`adapters/codex/hooks/craft-guard.js`, README table L147: **Enforcing**) denies `push`,
  `reset --hard` and `clean` without `--dry-run` (`engine/src/guards/git-destructive-predicate.js`
  L5–8, L90–92), after normalising global options. The `.rules` layer is **Partial**
  (defence-in-depth). It is stricter than the hook only on a non-`--hard` `git reset`.
- **Surface split (ADR-574; record row 3, `docs/contributing/specs/codex-poc-record.md` L334).** On
  codex-cli 0.162.1, a malformed (unparseable) rules file has different effects by surface:
  - `codex exec`, the binding's launch path, refuses to start (fail closed, 3/3).
  - The app-server thread/turn path skips the rules and runs the command (fail open, 3/3).
  - The TUI was not probed.

### Pinned matrix — what the byte-compare catches that codex does not (2026-10-16)

The designer ran these. They are hermetic or read-only, and no agent session was started.
`codex execpolicy check` ran with a throwaway `CODEX_HOME=<throwaway>/ch` (codex-cli 0.162.1), and
afterwards `<throwaway>/ch` held only the probe's own output file. Each variant ran twice, with the
same result both times. Command: `codex execpolicy check --rules <variant> <git> push`.

| Variant of the deployed file | `execpolicy check` (0.162.1) | `assertRulesIntegrity` |
|---|---|---|
| committed `adapters/codex/craft.rules` | exit 0, `forbidden`, matchedPrefix `git push` | `{ intact: true }` |
| the 2026-07-21 copy (`06e1983`; only the disclosure comment differs, `fd8f1dc`) | exit 0, `forbidden`, the same match | **throws** |
| comments-only (truncated before `prefix_rule(`) | exit 0, `{"matchedRules":[]}` | **throws** |
| empty file | exit 0, `{"matchedRules":[]}` | **throws** |
| last line `)` removed (the 0.162.1 re-probe's malformed variant) | exit 1, `starlark error … Parse error` | **throws** |

What the table shows:

- **codex's parser accepts a void file.** An empty or comments-only file parses cleanly and forbids
  nothing. The 0.162.1 refuse-to-start on `codex exec` (re-probe row 5e,
  `docs/contributing/design/codex-0162-reprobe.md`) followed a parse error, and these files have
  none. That `codex exec` then loads them silently is an inference from the parse result, not a
  run. Of the checks in this repo, only the byte-compare flags them.
- **Byte drift can leave enforcement unchanged.** `git log -p -- adapters/codex/craft.rules` shows
  that the rule body (`pattern`, `decision`, `justification`) has been identical since `06e1983`. The
  only change since then is the disclosure comment (`fd8f1dc`, ADR-573). A wired, refusing check
  would therefore refuse an operator's hand-deployed 2026-07-21 copy even though that copy enforces
  exactly what the current file enforces. This is by design: the existing test
  `execpolicy-rules.test.js` L111 pins the check as byte-identical, not fuzzy.
- The deployed path, `$CODEX_HOME/rules/craft.rules`, is the one the 0.162.1 re-probe used (record
  L560, re-probe row 5a). This design pins no new runtime path.

### Candidate wirings, verified against the code

| Candidate | Real? | Finding |
|---|---|---|
| `trust-hook-main.js` `run()` | **Yes** | The only operator-run step. `--check` is the documented "launch-time verification" an operator can wire into a pipeline (README L130–138). All I/O is injected, so a new `readRules` dependency fits the existing seam. |
| A new dedicated bin (`bin/check-rules.js` + `src/check-rules-main.js`) | **Yes** | Still on demand, but runnable from a shell. Today "on demand" means writing a `node -e` import. |
| `buildLaunchArgs` / probe harness | **No** | `buildLaunchArgs` builds argv and does no I/O. Its only caller is a conformance probe that only tests invoke, with an injected runner. Neither one sits on any path an operator uses to launch codex. |
| The PreToolUse hook (`hooks/craft-guard.js`), per tool call | **No (dropped)** | When the hook runs, it already denies the rule's commands with a stronger parse. When it does not run (untrusted, `node` missing), a check inside it does not run either. Wiring the check there would tie the enforcing layer's liveness to the partial layer's file and add an fs read to every tool call. |
| Keep on demand, record why | **Yes** | A wording-only landing. |

### Constraints already decided

- **ADR-573**: the disclosure, the JSDoc and the refusal message carry no codex version. Neither
  landing changes the thrown message (L96), so `adapters/codex/craft.rules` is not regenerated.
- **ADR-574**: the malformed-rules status stays split by surface, pinned to its version, and
  "treat it as fail open". The `/fail open/i` and `/refuses? to start/i` README pins
  (`adapters/codex/test/native-surface.test.js` L314–325) stay green unchanged.
- **ADR-575**: this entry sits in the run-scoped `### Open (scoped 2026-10-15 …)` section. It is
  ticked in place, following the house convention: the ext-diff entry at `BACKLOG.md` L256 is
  "— delivered 2026-10-16", and L916 is "— closed by measurement, detector unchanged".
- **ADR-576**: the docs call the check unwired, and "a later wiring change updates it". Landing B
  supersedes that wording on every surface it lists. Landing A keeps it and adds the reason.
- **The README never names `assertRulesIntegrity`** (`docs/contributing/plan/codex-0162-reprobe.md`
  L455). Both landings keep it that way: Landing B describes the behaviour, not the symbol.
- **Corpus counts are gated** (`test/readme-drift.test.js` → `scripts/readme-drift.sh`). This
  design's commit bumps `README.md` L200 from 71 design docs to 72. The plan and ADR commits bump
  their own counts.
- **No provenance refs** in source or tests, and no home-rooted paths in committed artifacts.

## Requirements

Common to both landings:

1. The entry at `BACKLOG.md` L237–244 is ticked in place. Its bold title gains a dated suffix that
   names the outcome, and a paragraph records the decision with its evidence: the grep, the B9 lines
   and this design's pinned matrix.
2. `docs/contributing/specs/codex-poc-record.md` records the 2026-10-16 `execpolicy check`
   observations: an empty or comments-only file parses cleanly and matches nothing. They go in as
   rows in the existing *Re-probe — codex-cli 0.162.1* section, marked `(0.162.1)` and dated
   (ADR-320). No older row is erased.
3. Row 3 (L334), L566 and `BACKLOG.md` L1273–1277 state the decided wiring status exactly. The
   JSDoc (L84–86) does too in Landing B. In Landing A it follows candidate 2. No surface claims a
   caller that the code does not have.
4. The `BACKLOG.md` L246–252 deploy-step entry stays open and unsolved. Unless candidate 2 = b, it
   gains one sentence of fact for whoever schedules it: an empty or comments-only deployed file
   voids the layer and codex does not catch it, so the copy step must deal with verification.
5. `assertRulesIntegrity`'s signature, return value and message are unchanged, and so are
   `buildExecpolicyRules()` and `craft.rules`.
6. `bash scripts/ci.sh` is green at every commit.

Landing B adds:

7. `node adapters/codex/bin/trust-hook.js`, in both write mode and `--check`, reads
   `<codexHome>/rules/craft.rules` and resolves `<codexHome>` exactly the way `config.toml` is
   resolved. It then:
   - exits `2` and writes nothing when the file is present and drifted;
   - reports a warning and leaves the trust outcome unchanged when the file is absent;
   - reports `rules intact` when the file matches.
8. Every refusal the listing triggers today still fires before the rules file is read, and the bin
   tests (`trust-hook.bin.test.js` L110–141) stay green unchanged.

## Design

### Landing A (recommended, candidate 1a): keep it on demand, record why

There is no behaviour change. One part, one commit, documentation plus one source comment.

**Context block**

- `adapters/codex/src/execpolicy-rules.js` JSDoc L84–86. Today it reads: "Nothing in the binding
  calls this check yet: it protects only when a caller runs it before relying on the layer, and then
  refuses rather than proceed."
- `BACKLOG.md`:
  - L237–244, this entry, inside `### Open (scoped 2026-10-15 — …)`;
  - L246–252, the deploy-step entry;
  - L1265–1277, the delivered malformed-`.rules` entry, including its mitigation sentence.
- `docs/contributing/specs/codex-poc-record.md`:
  - row 3 (L334);
  - the *Re-probe — codex-cli 0.162.1* table, which holds the integrity row at L566 and the
    well-formed control at L560.

**Change.**

1. **The JSDoc (candidate 2).** Under 2a, "yet" goes and the reason is stated, version-free and
   with no provenance:

   ```
    * drift (malformed content included), not one probed variant. The binding
    * runs this check on demand only: it has no launch path of its own (operators
    * start codex themselves), so it protects only when a caller runs it before
    * relying on the layer, and then refuses rather than proceed.
   ```

   This edits a comment only. No test pins the JSDoc, and Stryker does not mutate comments.
2. **BACKLOG L237.** The title becomes `**Should a launch or install path call
   \`assertRulesIntegrity\`? — closed 2026-10-16, kept on demand**`. The question text stays. A
   paragraph is appended that gives the four reasons below and points at this design.
3. **BACKLOG L246–252.** One sentence is appended stating the 2026-10-16 fact: an empty or
   comments-only `craft.rules` parses cleanly and forbids nothing (`execpolicy check`, 0.162.1), so
   codex catches a bad copy on no surface. Whichever deploy step lands owns verifying what it
   deploys. The entry stays open, and no fix is designed here.
4. **BACKLOG L1273–1277, row 3, L566.** "no caller in the binding" stays. Each gains "kept on demand
   by decision (2026-10-16): the binding has no launch path of its own". The new record rows
   (Requirement 2) are added next to L566.
5. **No README change.** The README documents neither the deploy nor the check
   (`docs/contributing/plan/codex-0162-reprobe.md` L455 keeps it silent on the symbol),
   and steps 1–4 of *Install-time hook trust* are untouched.
6. **The ADR phase** records the choice. It refines ADR-576 by replacing "a later wiring change
   updates it" with "kept on demand". It also states that `harden-prove-codex-binding.md` L436 ("wire
   it at the launch boundary") is not carried out, because the binding has no launch boundary.

**Why on demand.**

- (i) The binding launches nothing. `buildLaunchArgs` builds argv only, and operators run
  `codex exec` themselves, so the L436 "launch boundary" does not exist.
- (ii) On that launch path, codex 0.162.1 already refuses to start on an unparseable file (re-probe row 5e,
  3/3).
- (iii) No install step deploys the file, so on every documented install a wired check finds it
  absent and cannot refuse without breaking `trust-hook.js` for every operator (candidate 3).
- (iv) Byte drift on a valid file has never changed enforcement: the rule body has been identical
  since `06e1983`, while a refusing check would refuse such a copy.

The real gap, a void-but-parseable copy that codex accepts silently, comes from the copy step. It
therefore belongs to the deploy-step entry (L246–252). That step can verify what it just wrote, or
deploy a symlink to the committed file, which the existing drift guard
(`execpolicy-rules.test.js`, committed file == generator) already pins.

### Landing B (alternative, candidate 1b): `trust-hook.js` verifies the deployed rules

This is what the planner builds if the user picks 1b. It is shown with the recommended options for
candidates 3 and 4. Two parts: code and tests, then docs.

**Context block**

- `adapters/codex/src/trust-hook-main.js`:
  - `resolveConfigPath(env)` (L53–61);
  - `run(argv, deps)` (L140–160);
  - the `main` JSDoc dependency list (L160–166);
  - the constants at L29–32;
  - imports `toDisplayText` from `./safe-text.js` and `join` from `node:path`.
- `adapters/codex/bin/trust-hook.js`: `readConfig` (L23–32) and `buildDependencies()` (L34–53).
- `adapters/codex/test/trust-hook-main.test.js`:
  - `createDeps({...})` (L55–113) builds the dependency bag. It needs a `readRules` field plus a
    `readRulesCalls` tracker.
  - `countOutputLines` assertions at L418, L431, L443, L458 and L472. Every one of these runs
    reaches the rules step, so each count rises by one.
  - `assertRefused` (L127–131).
- `adapters/codex/test/trust-hook.bin.test.js` L110–141 asserts stdout `''` and stderr equal to the
  spawn-ENOENT line. The sandbox has no codex, so the run refuses at `fetchHooksListing`, before the
  rules step. These tests stay unchanged, which pins that order.
- `adapters/codex/test/native-surface.test.js` L385–390 (*documents the scriptable trust path*) is
  the home for one new README pin.
- `engine/stryker.conf.json` already lists `adapters/codex/src/trust-hook-main.js` in `mutate`
  (L33) and its suite in `tap.testFiles` (L13). No config change is needed.

**Part B1: code (TDD).** The shape, in `trust-hook-main.js`:

```js
import { assertRulesIntegrity } from './execpolicy-rules.js';

const RULES_DIR_NAME = 'rules';
const RULES_FILE_NAME = 'craft.rules';

function resolveCodexHome(env) { /* body of today's resolveConfigPath, minus the file join */ }
const resolveConfigPath = (env) => join(resolveCodexHome(env), CONFIG_FILE_NAME);
const resolveRulesPath = (env) => join(resolveCodexHome(env), RULES_DIR_NAME, RULES_FILE_NAME);

// An absent file is the layer not installed, which no documented install step does yet;
// only a present file that drifts is a refusal.
function verifyDeployedRules({ rulesPath, readRules, stdout }) {
  const shown = toDisplayText(rulesPath);
  const onDiskText = readRules(rulesPath);
  if (onDiskText === null) {
    stdout.write(`${OUTPUT_PREFIX}warning: no craft.rules deployed at ${shown} — the execpolicy layer is not installed\n`);
    return;
  }
  try {
    assertRulesIntegrity(onDiskText);
  } catch (error) {
    throw new Error(`${error.message} (path=${shown})`, { cause: error });
  }
  stdout.write(`${OUTPUT_PREFIX}rules intact: ${shown}\n`);
}
```

In `run()`:

- `rulesPath` is resolved next to `configPath`, so an unset environment still refuses before any I/O.
- `verifyDeployedRules({ rulesPath, readRules, stdout })` is called after `assertListingComplete(errors)`
  and before the mode split, in both modes (candidate 4a).
- A drift throws, and `main` already maps that to `EXIT_REFUSED`. Write mode therefore never reaches
  `writeConfig`, and `--check` never returns `0`.

The exit code for drift is not a candidate. Every refusal in this module is a throw that `main` maps
to `2`, and `1` means a hook state ("untrusted or modified", README L132–133).

In `bin/trust-hook.js`, `readTextOrNull(path)` replaces the body of `readConfig`. ENOENT returns
`null`, and any other error is rethrown. `readConfig = (path) => readTextOrNull(path) ?? ''` keeps its
behaviour, and `readRules = readTextOrNull` joins `buildDependencies()`. A symlinked deployed file
reads through to its target, so a symlink to the committed `craft.rules` is intact.

**Part B2: docs.**

- **README *Install-time hook trust*.** Step 4 (L130–138) gains: both modes also check
  `$CODEX_HOME/rules/craft.rules` against the shipped `craft.rules`. The run refuses (exit `2`) when
  the file is present and differs, warns when it is absent, and fixes the problem by re-copying the
  file. One pin is added in `native-surface.test.js`. The symbol stays unnamed.
- **The JSDoc (L84–86)** becomes "`bin/trust-hook.js` runs this check in both modes …".
- **Row 3, L566 and BACKLOG L1273–1277** replace "no caller in the binding" with "called by
  `bin/trust-hook.js`; absent file reported, not refused".
- **The entry title (L237)** gains "— delivered 2026-10-16".
- **The ADR phase** supersedes ADR-576's "unwired" wording.

The rows required by Requirements 2 and 4 land as in Landing A.

### Landing C (alternative, candidate 1c): a dedicated `check-rules` bin

Compared with Landing B, Landing C leaves `trust-hook.js` and its tests untouched and adds:

- `adapters/codex/src/check-rules-main.js` `main(argv, deps)`, with `deps = { readRules, env,
  stdout, stderr }`. It takes no arguments (any argument refuses), and it exits `0` when the file is
  intact, `1` when it is absent and `2` when it has drifted or the path cannot be resolved. The
  codex-home resolution is shared with `trust-hook-main.js` by extracting it into a small module, so
  the two bins cannot disagree on the path.
- `adapters/codex/bin/check-rules.js`: a thin entry that calls `isEntryPoint(import.meta)`, the same
  shape as `bin/trust-hook.js`.
- `check-rules-main.test.js` and `check-rules.bin.test.js` (the entry-point guard parity cases from
  `trust-hook.bin.test.js` L67–103).
- `engine/stryker.conf.json` gains the new src file in `mutate` and its suite in `tap.testFiles`.
- One README paragraph sits after step 4, with a native-surface pin.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Wire `assertRulesIntegrity` into a launch or install path, or keep it on demand** | (a) keep it on demand, record why, and hand the verification fact to the deploy-step entry (Landing A); (b) wire it into `trust-hook-main.js` `run()`, in both modes (Landing B); (c) a dedicated `bin/check-rules.js` (Landing C) | **(a)** | See *Why on demand* (i)–(iv). There is no launch path to wire (`buildLaunchArgs` builds argv; operators run `codex exec`). That path already refuses an unparseable file (5e, 3/3). Absent is the default state, so a wired check verifies nothing on any documented install. The one gap codex misses, an empty or comments-only copy (pinned 2026-10-16), comes from the copy step, so it belongs to the deploy entry (L246–252). Pick (b) if you want hand-deployers covered now. Its costs, each measured above: one more concern inside `trust-hook`, five stdout-count test edits, a refusal of the 2026-07-21 copy (whose enforcement is identical), and a "not installed" warning on every documented install until the deploy entry lands. (c) adds a bin, a test pair and Stryker entries for a check nobody is told to run, because nothing tells anyone to deploy the file. |
| 2 | **Landing A: what the wording records** (only if 1a) | (a) tick the entry; reword the JSDoc's "yet" to the on-demand reason; add "kept on demand" to row 3, L566 and BACKLOG L1273–1277; append the void-copy fact to the deploy entry; (b) (a) without the JSDoc edit and without touching the deploy entry; (c) (a) plus a README sentence giving the `node -e` invocation | **(a)** | "Nothing … calls this check *yet*" reads as pending wiring once the decision is not to wire, so it would become a false sentence in source. The deploy entry is where the void-copy fact matters, and leaving it out drops the one new finding. (c) documents checking a file the README never tells anyone to deploy, and it would break the README's silence on the check (`docs/contributing/plan/codex-0162-reprobe.md` L455). |
| 3 | **Absent deployed file** (only if 1b or 1c) | (a) report it (a stdout warning in B, exit `1` in C) and leave the trust outcome unchanged; (b) refuse with exit `2`, as `harden-prove-codex-binding.md` L433–435 planned; (c) report it in write mode, and exit `1` from `--check` | **(a)** | (b) breaks `trust-hook.js` on every documented install, because nothing deploys the file (`BACKLOG.md` L246). L433–435 assumed a deployed file. Choosing (a) refines that edge, and the ADR names it. (c) makes `--check` disagree with write mode, which breaks the README L134–136 invariant ("refuses on exactly the states the write path refuses"). |
| 4 | **Which `trust-hook` modes run the check, and where** (only if 1b) | (a) both modes, after `assertListingComplete` and before the mode split, so drift refuses before any write; (b) `--check` only, leaving write mode unchanged; (c) both modes, but write mode persists trust first and then exits `2` on drift | **(a)** | (a) keeps the README L134–136 symmetry, which the existing "both modes refuse a partial listing" test (L393) pins. It also leaves the bin tests unchanged, because they refuse at the spawn. Its cost: drift blocks trusting the enforcing hook until the operator re-copies the file. (b) breaks the symmetry. (c) makes exit `2` mean "partly done", a meaning no other refusal in `main` has. |

## Test strategy

Strict TDD (Given/When/Then titles, AAA bodies, a `sut` variable, RED before GREEN). Pipe the full
`bash scripts/ci.sh` to a file and grep the summary at every commit.

**Landing A.** No behaviour changes, so there is no RED.

- The JSDoc edit is checked by `adapters/codex/test/execpolicy-rules.test.js` staying green. Its
  provenance sweep covers only the generated text, and the edit adds no ADR, part or backlog number.
  Stryker is not run, because a comment edit changes no mutant.
- Docs gates: `scripts/backlog-lint.sh BACKLOG.md`, `intention-lint` over the living corpus (the
  record), `docs-structure-lint`, and `readme-drift` (no count moves in that part).

**Landing B, Part B1**, in `adapters/codex/test/trust-hook-main.test.js`. A new
`describe('main() — deployed rules integrity')`. Each item below is RED before the code exists:

- Given an intact deployed `craft.rules`, when main runs in write mode, then it reports
  `rules intact` naming `<codexHome>/rules/craft.rules` and writes trust as before (exit `0`).
- Given a drifted deployed file (one byte appended), when main runs in write mode, then it refuses
  with `2`, `writeConfig` is never called, and the single stderr line names the path and
  `integrity check failed`.
- Given a drifted file and a trusted hook, when main runs with `--check`, then it returns `2`, not
  `0`. This is the symmetry pin.
- Given an empty deployed file, when main runs, then it refuses (exit `2`). An empty file is
  present, not absent: this pins the `null`-versus-`''` boundary.
- Given `readRules` returning `null`, when main runs in either mode, then one `warning: no
  craft.rules deployed` line is written and the exit code is the one the trust plan gives
  (`0`/`1`).
- Given `CODEX_HOME` set, or only `HOME`, when main runs, then `readRules` is asked for
  `join(<home>, 'rules', 'craft.rules')`. This is the path-parity test, next to the existing
  config-path matrix at L510–565.
- Given a listing refusal (zero matches, or listing errors), when main runs, then `readRules` is
  never called. This pins the order.
- Given `readRules` throwing an `EACCES` error, when main runs, then it refuses with `2`, quoting
  the error, so the error is not swallowed.
- Given a `CODEX_HOME` carrying a line feed, when the rules line is written, then it stays on one
  line. This is the `toDisplayText` contract, following the L406–487 pattern.

`createDeps` defaults `readRules` to `() => buildExecpolicyRules()`, so the other suites keep their
intent. The five `countOutputLines` expectations rise by one.

Mutation: run Stryker on `trust-hook-main.js` with the corpus narrowed to `trust-hook-main.test.js`
and `execpolicy-rules.test.js`, then hand-check each survivor against the full covering set.

`trust-hook.bin.test.js` stays unchanged and must stay green, which proves the order.
`bin/trust-hook.js` has no unit tests (thin-entry convention, not in `mutate`). Its ENOENT→`null`
mapping is the same as the existing `readConfig`.

**Landing B, Part B2.** One `native-surface.test.js` pin: the README step 4 names `craft.rules`
alongside `--check`. It is RED before the README edit. Every existing honesty pin
(L314–325, L385–390) stays green unchanged.

**Landing C** mirrors B's matrix in `check-rules-main.test.js`: exit `0`, `1` and `2`, path parity,
an unexpected argument, a read error and line-feed safety. `check-rules.bin.test.js` covers the three
entry-point cases. Stryker covers the new src file.

**All landings.** Before each commit, grep the changed files for `/Users/` and `/home/`. No test
spawns real codex. The `execpolicy check` observations are recorded evidence, and re-running them is
an on-demand operator step in a throwaway `CODEX_HOME`.

## Out of scope

- **Deploying `craft.rules` to `$CODEX_HOME/rules/`** (`BACKLOG.md` L246–252). It changes the
  install surface, and it is the next entry. This run adds one sentence of fact to it and nothing else.
- **Probing the TUI's rules path**, and the app-server fail-open itself. Both are codex behaviour,
  and the TUI question is a separate entry (L228–235).
- **Wiring `trust-hook.js --check` into a launch.** The binding has no launch path to wire it into.
- **Making the byte-compare fuzzy** (comparing only the rule body) to stop refusing an
  enforcement-identical old copy. It is pinned as byte-identical (`execpolicy-rules.test.js` L111),
  and DC-3 approved byte-compare.
- **Checking sibling files in `$CODEX_HOME/rules/`.** A malformed non-craft file there is outside
  what this binding ships.
- **`buildLaunchArgs` and the probe harness.** They are not launch paths (Context).
