# Plan — codex binding: a crashing guard hook still denies

> Source: design doc `docs/contributing/design/codex-hook-nonzero-exit-probe.md` · ADRs 518, 519, 520, 521, 522
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

Shape of this plan: Part 1 is the code change (the five red tests and the guard rewrite, one
atomic commit, four RED→GREEN cycles). Part 2 is docs-only (no code delta): the operator-facing
residual, the POC-record row, the BACKLOG close-out, and the root README corpus counts that the
phase gate checks against the tree.

## Decision candidates

None open. Every load-bearing choice is settled: guard shape (ADR-518, one file, handlers at the
top, dynamic imports inside the try), no-verdict deny via a beforeExit handler (ADR-519, ratified
by the user), both process handlers (ADR-520), throwaway-tree fixtures (ADR-521), scope limited
to the codex guard (ADR-522). The BACKLOG parenthetical uses the branch name
`fix/codex-hook-nonzero-exit-probe` as the invocation directs (the design said the bare slug); the
sibling entry "A step id still sits in a test title" uses the same branch-name form. The root
README count refresh is not a choice: the readme-drift guard fails the phase gate without it
(proof below).

Baseline measured before planning (node v22.22.3, this worktree at the ADR-522 commit):
`npm --prefix adapters/codex test` → pass 602, fail 0. `bash scripts/ci.sh` → exit 1, the only
failures are the two readme-drift tests (engine "Given no root argument, when main runs, then it
resolves DEFAULT_ROOT against the real repo root…" and process "Given the live repo tree, when
readme-drift runs, then it exits 0 with no findings"); `bash scripts/readme-drift.sh` prints
`corpus-counts: docs/contributing/design/ claims 57, tree holds 58` and
`corpus-counts: docs/contributing/adr/ claims 517, tree holds 522`. This plan file adds a 57th
plan, so the plan count drifts too. `bash scripts/static-lints.sh` → exit 0. Part 2 clears the
drift; Part 1's gate therefore does not run the full `ci.sh`.

## Part 1 — the guard denies every in-process crash

### Context

Files this part edits (nothing else):

- `adapters/codex/hooks/craft-guard.js` — the PreToolUse guard codex runs. 73 lines today.
  - Lines 1-21: header JSDoc. Keep every existing paragraph. It deliberately never spells the
    word for the try/catch cleanup clause (it says "unconditional exit-0 cleanup block"),
    because test "Given the hook source text, when scanned, then it contains no finally block"
    runs `/\bfinally\b/` over the whole file, comments included. New comment text must not
    contain that word either. The scan reads only the guard, so the test file may use a
    try/finally for fixture cleanup.
  - Lines 22-23: the two static imports to delete — resolveCraftRoot from ../src/craft-root.js
    and decideGuard from ../src/git-guard-adapter.js.
  - Line 28: `FAIL_CLOSED_REASON = 'denied (fail-closed)'` (keep, and keep its comment).
  - `readStdin()` lines 30-39: unchanged. Its `raw += chunk` in the data callback is the real
    crash outside the try (stdin above V8's max string length throws `RangeError: Invalid
    string length`, exit 1 today).
  - `denyWith(reason)` lines 41-44: writes `craft-guard: <reason>\n` to stderr, `process.exit(2)`.
  - `allow()` lines 46-48: `process.exit(0)`. Must stay an explicit `process.exit`: an explicit
    exit does not emit `beforeExit`, which is what keeps the new no-verdict handler off the
    allow path.
  - `main()` lines 50-71: `try { CRAFT_ROOT = resolveCraftRoot(import.meta.url); raw = await
    readStdin(); payload = JSON.parse(raw); verdict = decideGuard(payload); block → denyWith(reason
    ?? FAIL_CLOSED_REASON) / else allow() } catch (err) { denyWith(err?.message ||
    FAIL_CLOSED_REASON) }`. The comment at lines 52-54 explains why resolveCraftRoot runs inside
    the try; extend it to cover the imports.
  - Line 73: bare `main();` — keep it a floating call. A top-level `await main()` would exit 13
    on an unsettled await even with handlers (design matrix row M7).
- `adapters/codex/test/craft-guard-hook.test.js` — 92 lines, one describe block
  `craft-guard hook — enforcing exit-code contract` with 8 tests that must stay green unchanged.
  - Imports today: `describe, it` (node:test), `assert` (node:assert/strict), `spawnSync`
    (node:child_process), `readFileSync` (node:fs), `fileURLToPath` (node:url), `dirname, join`
    (node:path). Extend node:fs with `cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync,
    writeFileSync`; add `tmpdir` from node:os.
  - Consts: `HOOK` (absolute path to the guard, from import.meta.url), `WORKING_DIR = '/repo'`.
  - Helpers: `run(payload)` (spawnSync process.execPath on HOOK, utf8), `execPayload(cmd)`,
    `patchPayload(...paths)`. New consts go after `WORKING_DIR` (they call `execPayload`, a
    hoisted function declaration, but read `WORKING_DIR`, a const).
  - Style: node:test `describe`/`it`, Given/When/Then titles, `sut` variable, AAA body. Put the
    five new tests in a NEW describe block `craft-guard hook — a crash still denies`.

Read-only references (do not edit): adapters/codex/src/craft-root.js (`resolveCraftRoot`
throws unless the up-walked root holds engine/bin — the reason the unresolvable fixture creates
an empty engine/bin), adapters/codex/src/git-guard-adapter.js (statically imports
../../../engine/src/guards/tool-call-guard.js, which is what fails to resolve in fixture A),
adapters/codex/test/config.test.js `withSpacedRoot` (the mktemp + symlink + rmSync precedent).
Nothing on the guard path reads `process.env.CRAFT_ROOT` while modules evaluate, so importing
before setting it keeps today's order.

Hard lines: do not touch hooks.json, config.template.toml, adapters/codex/src/hook-trust.js, or
anything under adapters/codex/src (the guard path and registered command are fixed). No new
dependency. No static import anywhere in the guard. No provenance tokens in the guard (whole-line
scan, case-insensitive: ADR-n, Pn, Part n, backlog #n, DC-n; case-sensitive Rn/Tn/Fn) or in test
titles and comments (same list minus Rn/Tn/Fn) — so do not cite the design's matrix row
ids or fixture letters either; test/source-hygiene.test.js enforces it.

Public surface: none. No new export; the guard is an entry script, the new test helpers stay
file-local.

### TDD steps

New test helpers (write first, top of the test file after `WORKING_DIR`):

```js
const ADAPTER_DIR = join(dirname(HOOK), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const ALLOWED_PAYLOAD = execPayload('git diff --no-ext-diff');
// Skips `import(` and comment lines (they start with ` * ` or `//`).
const STATIC_IMPORT_LINE = /^\s*import\s[^(]/m;
const THROWING_STDIN_LISTENER =
  "process.stdin.once('data', () => { throw new RangeError('Invalid string length'); });";
const NEVER_ENDING_STDIN = 'process.stdin.destroy();';
const FLOATING_REJECTION = "Promise.reject(new Error('floating rejection'));";

// Copies hooks/ and src/ into a throwaway root; breakTree then removes or stubs one piece.
function withGuardCopy(breakTree, act, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'craft-guard-crash-'));
  try {
    const adapterCopy = join(root, 'adapters', 'codex');
    for (const dir of ['hooks', 'src']) {
      cpSync(join(ADAPTER_DIR, dir), join(adapterCopy, dir), { recursive: true });
    }
    breakTree({ root, adapterCopy });
    const guard = join(adapterCopy, 'hooks', 'craft-guard.js');
    return act(spawnSync(process.execPath, [...nodeArgs, guard], { input: ALLOWED_PAYLOAD, encoding: 'utf8' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// engine/bin present so resolveCraftRoot passes; engine/src absent so the predicate import fails.
function withoutEngineSources({ root }) {
  mkdirSync(join(root, 'engine', 'bin'), { recursive: true });
}

// Every import resolves through the symlinked engine; the stub runs `body` then returns a root.
function stubbedCraftRoot(body) {
  return ({ root, adapterCopy }) => {
    symlinkSync(join(REPO_ROOT, 'engine'), join(root, 'engine'));
    writeFileSync(
      join(adapterCopy, 'src', 'craft-root.js'),
      `export function resolveCraftRoot() { ${body} return '/'; }\n`,
    );
  };
}
```

Every fixture spawns the copied guard with the compliant payload, which today's guard allows —
so any exit other than 2 is the bug. Every new test asserts `sut.status === 2`, a stderr line
matching its regex (multiline flag, so node's own warning lines around it do not matter), and
`sut.stdout === ''`.

Cycle 1 — dependencies load inside the try

1. RED — `Given the hook source text, when scanned, then it has no static import statement`:
   `assert.doesNotMatch(readFileSync(HOOK, 'utf8'), STATIC_IMPORT_LINE)`. Fails today: lines
   22-23 (`import { resolveCraftRoot } from …`, `import { decideGuard } from …`) match.
2. RED — `Given a guard copy whose engine predicate cannot be resolved, when the hook process runs, then it exits 2 naming the missing module on stderr`:
   `withGuardCopy(withoutEngineSources, (sut) => …)`; stderr `/^craft-guard: .*tool-call-guard/m`.
   Fails today with status 1: ESM links git-guard-adapter's static import before `main()` runs,
   so its `ERR_MODULE_NOT_FOUND` escapes the try and node prints a stack with no `craft-guard:`
   line.
3. GREEN — in the guard: delete lines 22-23; add `function denyOnCrash(err) { denyWith(err?.message
   || FAIL_CLOSED_REASON); }`; inside `main()`'s try, first
   `const { resolveCraftRoot } = await import('../src/craft-root.js');` and
   `const { decideGuard } = await import('../src/git-guard-adapter.js');`, then today's body
   unchanged; the catch calls `denyOnCrash(err)`. Both new tests pass; the 8 existing tests stay
   green.

Cycle 2 — a throw outside the try

4. RED — `Given a guard copy whose stdin listener throws, when the hook process runs, then it exits 2 with the error on stderr`:
   `withGuardCopy(stubbedCraftRoot(THROWING_STDIN_LISTENER), …)`; stderr
   `/^craft-guard: Invalid string length$/m`. Fails after cycle 1 with status 1: the throw
   happens in a stdin `data` callback, past the async boundary of `main()`'s try, and no process
   handler exists, so node prints the RangeError stack and exits 1.
5. GREEN — above `main();` (and above any code that can throw), register
   `process.on('uncaughtException', denyOnCrash);`.

Cycle 3 — a floating rejection under an inherited warn mode

6. RED — `Given a guard copy that leaves a promise rejection unhandled under the warn rejection mode, when the hook process runs, then it exits 2 with the rejection on stderr`:
   `withGuardCopy(stubbedCraftRoot(FLOATING_REJECTION), …, ['--unhandled-rejections=warn'])`;
   stderr `/^craft-guard: floating rejection$/m`. Fails after cycle 2 with status 0: in warn
   mode the rejection is never routed to `uncaughtException`, node only prints a warning, and the
   guard goes on to allow the compliant payload (pinned 3/3 on the prototype with the
   `unhandledRejection` line removed). This is the only mode where that handler is the sole
   cover, so the test fails if the handler is ever deleted.
7. GREEN — register `process.on('unhandledRejection', denyOnCrash);` next to the first handler.

Cycle 4 — the event loop drains with no verdict

8. RED — `Given a guard copy whose stdin never ends, when the event loop drains, then it exits 2 with the fail-closed reason`:
   `withGuardCopy(stubbedCraftRoot(NEVER_ENDING_STDIN), …)`; stderr
   `/^craft-guard: denied \(fail-closed\)$/m`. Fails after cycle 3 with status 0 and empty
   stderr: stdin is destroyed so `end` never fires, `readStdin()` never settles, nothing throws
   or rejects, and node exits 0 when the loop drains.
9. GREEN — add `function denyWithoutVerdict() { denyWith(FAIL_CLOSED_REASON); }` and register
   `process.on('beforeExit', denyWithoutVerdict);` with the other two handlers.

GUARD entries (green before and after every cycle — re-run them at each GREEN):

- All 8 existing tests in `craft-guard hook — enforcing exit-code contract`. They already pass
  today; the prototype of this exact shape passed 8/8.
- In particular `Given a compliant payload, when the hook process runs, then it exits 0 and writes nothing to stdout`:
  after cycle 4 it is the proof that `beforeExit` stays silent on the allow path, because
  `allow()` ends in an explicit `process.exit(0)`, which does not emit `beforeExit`.
- `Given the hook source text, when scanned, then it contains no finally block`: passes as long
  as no new comment or code spells the word.

REFACTOR (all tests green before and after):

- Named exit codes: `const DENY_EXIT_CODE = 2;` and `const ALLOW_EXIT_CODE = 0;`, used by
  `denyWith` and `allow`. No other literal 2 or 0 exit codes remain.
- File layout top to bottom: header, constants, `denyWith`, `denyOnCrash`,
  `denyWithoutVerdict`, the three `process.on` registrations, `readStdin`, `allow`, `main`,
  `main();`. Handlers sit above everything that can fail.
- Header JSDoc: add one paragraph saying why the file has no static import — ESM links static
  imports before the body runs, so a dependency that fails to resolve, parse or evaluate would
  exit 1 before any handler exists, and codex 0.161.0 runs the tool call on every exit status
  except 2; the handlers are registered first and the dependencies imported inside the try, so a
  load failure, a throw from an event callback, an unhandled rejection, and an event loop that
  drains with no verdict all reach the same deny call. Add one sentence on what no code here can
  catch (it still fails open): node unable to run this file (missing or unparseable), `node`
  missing from PATH, a signal killing the process, a throwing preload in an inherited
  NODE_OPTIONS. Comments say why, never narrate the code; no provenance tokens; never the word
  the finally-scan bans.
- Replace the lines 52-54 comment with one that covers both the dynamic imports and
  resolveCraftRoot (a throw at module level would exit before any verdict); keep the catch's
  "must fail CLOSED" comment, mentioning load failures.
- Each function stays under 20 lines, nesting at most 2.

### Gate

Run from the worktree root, output to a file, read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
npm --prefix adapters/codex test > "$LOG/codex.log" 2>&1; echo "exit=$?"; grep -nE '^# (pass|fail)|^not ok' "$LOG/codex.log"
node --test test/source-hygiene.test.js > "$LOG/hygiene.log" 2>&1; echo "exit=$?"; grep -nE '^# (pass|fail)|^not ok' "$LOG/hygiene.log"
```

Expected: codex suite pass 607 (602 + 5 new), fail 0; source-hygiene fail 0. Do not run the
full `bash scripts/ci.sh` as this part's gate: it is red on the readme-drift corpus counts until
Part 2 lands (baseline above). Never commit on a red gate.

### Commit

`fix(codex): deny every in-process crash of the guard hook`

## Part 2 — operator docs: the fail-open residual, the POC row, the BACKLOG close-out, the corpus counts

### Context

Docs only, no code delta. Files this part edits (nothing else):

- `adapters/codex/README.md` — section `## Guard — honest enforcement profile`.
  - Line 145, the table row whose Layer cell is "PreToolUse hook (hooks/craft-guard.js)". Its
    Mechanism cell today reads "Exits code 2 with the reason on stderr". Make it (one table
    line, Strength cell untouched): "Exits code 2 with the reason on stderr. Any crash inside the
    guard (a module that fails to load, a throw, a rejected promise) also exits 2. codex 0.161.0
    runs the call on every other exit status, so a failure before the guard runs fails open (see
    below)".
  - Lines 149-165, the "Read unsoftened…" bullet list (4 bullets, wrapped at ~88 columns, bold
    on the key verb). Append a fifth bullet after the "Hook enforcement is bought…" bullet:
    "- The PreToolUse hook **fails open** when node cannot run the guard file at all: `node`
    missing from `PATH` (the shell exits 127), the guard file missing or unparseable, the process
    killed by a signal, or a `--require`/`--import` preload in an inherited `NODE_OPTIONS` that
    throws. codex 0.161.0 runs the tool call on every exit status except 2, and no code inside
    the guard runs early enough to catch these."
  - Pins on this file (adapters/codex/test/native-surface.test.js, read-only): no provenance
    token (case-insensitive ADR-n, Pn, Part n, backlog #n), no exclamation mark directly before
    a backtick span, no bare CLAUDE_PLUGIN_ROOT placeholder; honesty pins `/fail open/i`,
    `/not measured/i`, `/git -C/` etc. must still match. Never write the lowercase host name
    "github" in this README.
- `docs/contributing/specs/codex-poc-record.md` — the last line (526), the final row of the
  `## Re-probe — codex-cli 0.161.0` table: `| Hook exiting 1: fail-open or fail-closed (0.161.0) |
  **DEFERRED.** Not probed. |`. Replace it in place (the record corrects rows inside their
  version-pinned section) with exactly this one line:

  | Hook exiting neither 0 nor 2 (0.161.0) | **CONFIRMED (0.161.0): fail-open.** Only exit 2 denies. Exit 1 (3/3 repeats), 3 and 127, `bash -c "exit 1"`, `sh -c "exit 1"`, an uncaught `node -e` throw, `node <missing>.js` and a self-SIGKILL each produced 2 `command_execution` items and turn-2 output `Process exited with code 0 … PROBE`. Controls: exit 0 ran the command; exit 2 + stderr produced 0 items and `Command blocked by PreToolUse hook: probe-deny. Command: echo PROBE`. Hook registered in a throwaway `config.toml`, trust bypassed there only, a marker file proving each hook ran. |

  This file sits in the source-hygiene scan (no "gh"/"github" word, no mutation-tool names, no
  home-rooted path) and in the intention-lint living corpus.
- `BACKLOG.md` — lines 180-185, the first entry under `### Open (scoped 2026-10-12 — follow-ups
  surfaced by the codex-hooks-quote-plugin-root run, not yet scheduled)`. Keep it in place under
  that heading (delivered siblings stay where they were scoped). Sibling format (lines 196-206,
  211-217): bold title ending `— delivered <date>**`, next line opens with the parenthetical and a
  period, prose wrapped at ~100 columns, ADR numbers allowed here, closing with
  `Design context:` and a markdown link to the design doc. Replace the entry with:

  **Probe what codex does with a hook that exits neither 0 nor 2 — delivered 2026-10-13**
  (fix/codex-hook-nonzero-exit-probe). codex-cli 0.161.0 runs the tool call on every hook exit
  status except 2, and on a signal death (offline fake-provider smoke; the matrix is in the POC
  record). The guard now turns any crash it can see into exit 2 with a `craft-guard:` reason: its
  dependencies load inside the try, and process handlers deny an uncaught throw, an unhandled
  rejection, and an event loop that drains with no verdict (ADRs 518-521). What no in-guard code
  can catch still fails open and is written down in the codex README: `node` missing from
  `PATH`, the guard file unloadable, a signal, a throwing `NODE_OPTIONS` preload. Design context:
  [codex-hook-nonzero-exit-probe](docs/contributing/design/codex-hook-nonzero-exit-probe.md).

  Wrap to the sibling width; the wording may be tightened, the facts may not change.
  BACKLOG.md is checked by backlog-lint (section headings), intention-lint (SoT pointers) and
  prose-lint (filler words: delve, leverage, seamless, robust, "it's important to note", "in
  conclusion").
- `README.md` (root) — lines 198-200, section `## craft builds craft`, the receipts sentence:
  "[57 design docs](docs/contributing/design/), [56 parted plans](docs/contributing/plan/),
  [517 ADRs](docs/contributing/adr/)". These counts are checked against the tree by
  readme-drift (scripts/readme-drift.sh; engine/src/readme-drift-main.js `corpusCountFindings`).
  Set each to the count readme-drift reports — at planning time 58 design docs, 57 parted plans
  (this plan included), 522 ADRs. Derive the numbers by running `bash scripts/readme-drift.sh`
  at implementation time, not from this text: a later commit may add a file. Touch only the
  three numbers. This file is in the source-hygiene scan too (no bare "gh"/"github" word).

Read-only references: docs/contributing/design/codex-hook-nonzero-exit-probe.md (Context
matrices, Part 3 prose), the Part 1 guard as committed (adapters/codex/hooks/craft-guard.js) —
the README and BACKLOG claims must match what it does.

Public surface: none (prose only).

### TDD steps

No code delta and no new test. Each edit is checked by an existing test or lint:

1. GUARD — adapters/codex/test/native-surface.test.js README pins (provenance, shell-injection,
   plugin-root token, honesty pins including `/fail open/i`): pass today, and the new row text
   and bullet carry none of the banned tokens.
2. GUARD — test/source-hygiene.test.js over the POC record and root README: pass today; the new
   row and the count edit add no "gh"/"github", no mutation-tool word, no home-rooted path.
3. GUARD — intention-lint over the living corpus plus BACKLOG.md, backlog-lint, and prose-lint
   over the touched README.md and BACKLOG.md: pass today; the edits add no SoT pointer change, no
   section-heading change, and no filler word.
4. RED (existing tests, already failing) — test/readme-drift.test.js "Given the live repo tree,
   when readme-drift runs, then it exits 0 with no findings" and engine/test readme-drift
   "Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo
   root and finds no unusable-input errors": fail at the start of this part because the root
   README claims 57 design docs, 56 plans and 517 ADRs while the tree holds more (baseline above).
5. GREEN — set the three root README numbers to the counts `bash scripts/readme-drift.sh`
   reports; both tests pass.

Order: edit the codex README (row, then bullet), the POC row, the BACKLOG entry, then run
`bash scripts/readme-drift.sh` and set the root README numbers from its output.

REFACTOR: re-read the codex README row and bullet against the committed guard; every claim
(what exits 2, what fails open) must match its code and its header comment.

### Gate

Run from the worktree root, output to files, read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
bash scripts/readme-drift.sh; echo "exit=$?"
npm --prefix adapters/codex test > "$LOG/codex.log" 2>&1; echo "exit=$?"; grep -nE '^# (pass|fail)|^not ok' "$LOG/codex.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail|^ci:|SLOP-FOUND|-lint: ' "$LOG/ci.log" | head -40
```

Expected: readme-drift exit 0 with no findings; codex suite fail 0; `ci.sh` exit 0 (it runs every
suite, intention-lint, static-lints incl. backlog-lint and design-lint, stub/prose/adr lints).
Never commit on a red gate.

### Commit

`docs(codex): record the hook exit-status matrix and the guard's fail-open residual`
