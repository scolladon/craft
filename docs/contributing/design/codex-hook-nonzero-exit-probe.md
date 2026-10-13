# Design — codex binding: a crashing guard hook still denies

> Brief: codex-cli 0.161.0 runs the tool call when a PreToolUse hook exits with any status other
> than 2, including a signal death (probed, matrix below). Make `adapters/codex/hooks/craft-guard.js`
> turn any crash into exit 2 with a `craft-guard:` reason on stderr, pin that with tests that make
> the guard crash, replace the DEFERRED POC-record row with the pinned result, and close the BACKLOG
> entry "Probe what codex does with a hook that exits neither 0 nor 2".
> Status: draft → self-reviewed ×3

## Context

### What codex does with a hook exit status (pinned, codex-cli 0.161.0)

Method: an offline fake Responses provider (`wire_api = "responses"`, no `auth.json`) in a throwaway
`HOME` and `CODEX_HOME`. The hook is registered in the throwaway `config.toml` under
`[[hooks.PreToolUse]]`. `--dangerously-bypass-hook-trust` is passed in the throwaway only; trust is
a separate axis, and a marker file proves each hook ran. The fake model emits one
`exec_command {cmd: "echo PROBE"}`. Every codex call was wrapped, including `--version`. Isolation:
`find ~/.codex -newer <marker>` returned 0 files.

| Hook behaviour | `command_execution` items | turn-2 `function_call_output` | Verdict |
|---|---|---|---|
| exit 0 (control) | 2 | `Process exited with code 0 … PROBE` | runs |
| exit 2 + stderr (control) | 0 | `Command blocked by PreToolUse hook: probe-deny. Command: echo PROBE` | **denied** |
| exit 1 (3/3 repeats) | 2 | `Process exited with code 0 … PROBE` | fail-open |
| exit 3, exit 127 | 2 | executed | fail-open |
| `bash -c "exit 1"`, `sh -c "exit 1"` | 2 | executed | fail-open |
| `node -e 'throw …'` (uncaught, exit 1) | 2 | executed | fail-open |
| `node <missing>.js` (exit 1) | 2 | executed | fail-open |
| the shell SIGKILLs itself | 2 | executed | fail-open |

On 0.161.0 only exit 2 denies. Any other exit status, and death by signal, runs the tool call.

### Why today's guard can exit 1

`adapters/codex/hooks/craft-guard.js` has two static imports (lines 22-23: `resolveCraftRoot` from
`../src/craft-root.js`, `decideGuard` from `../src/git-guard-adapter.js`). ESM links and evaluates
static imports before the module body runs, so the `try/catch` in `main()` (lines 49-73) never sees a
failure there. Throws inside the body are already handled and pinned in
`adapters/codex/test/craft-guard-hook.test.js` (bad JSON, empty stdin, a reason-less block → exit 2).
Two more paths escape that `try`: a throw in an event callback (exit 1), and an event loop that
drains before any verdict (exit 0).

### Node mechanism matrix (pinned, node v22.22.3, CI runs node 22)

Each row is a throwaway `.mjs` in a mktemp directory, fed `x` on stdin.

| # | Construct | Exit | Note |
|---|---|---|---|
| M1 | `process.on('uncaughtException', deny)` written above a static `import './missing.mjs'` | 1 | static imports are hoisted: the handler is never registered |
| M2 | `try { await import('./missing.mjs') } catch { exit 2 }` | 2 | `ERR_MODULE_NOT_FOUND` reaches the catch |
| M3 | same, the imported module has a syntax error / throws while evaluating | 2 / 2 | `SyntaxError` / the thrown error reach the catch |
| M4 | top-level `await import('./missing.mjs')`, `uncaughtException` handler only | 2 | a rejected top-level await goes to `uncaughtException` |
| M4b | same, `unhandledRejection` handler only | 1 | **not** delivered to `unhandledRejection` |
| M5 | floating `import('./missing.mjs')` (no await), either handler alone | 2 | default `--unhandled-rejections=throw` |
| M5b | same, `NODE_OPTIONS=--unhandled-rejections=warn` or `none`, `uncaughtException` only | 0 | **fail-open**: the rejection only warns |
| M5c | same modes, `unhandledRejection` handler present | 2 | the handler fires in every mode |
| M6 | `throw` inside a `process.stdin.on('data')` callback, inside a `try` | 1 | the throw escapes the `try` (async boundary) |
| M6b | same, `uncaughtException` handler present | 2 | |
| M7 | top-level `await new Promise(() => {})` | 13 | unsettled top-level await, even with an `uncaughtException` handler |
| M7b | same, `process.exitCode = 2` set first, or a `beforeExit` handler that denies | 2 / 2 | |
| M8 | floating `main()` whose promise never settles, event loop drains | 0 | **fail-open**, no output at all |
| M8b | same, `process.exitCode = 2` set first | 2 | silent: no stderr reason |
| M8c | same, `process.on('beforeExit', deny)` | 2 | the reason is written |
| M9 | `process.exitCode = 2; process.exit(0)` | 0 | an explicit allow still wins |
| M9b | `beforeExit` handler, then `process.exit(0)` | 0 | `beforeExit` is not emitted on an explicit exit |
| M10 | `process.exitCode = 2`, then an uncaught throw with no handler | 1 | `exitCode` alone does not cover a crash |
| M11 | `NODE_OPTIONS=--import=<module that throws>` on the prototype guard | 1 | a preload fails before the entry module runs |

### Guard-level matrix (pinned, node v22.22.3)

Each fixture copies `adapters/codex/{hooks,src}` into a mktemp tree, plus `engine/` for every
fixture except A, then breaks one thing. "Current" is today's `craft-guard.js`. "Prototype" is
behaviourally the Part 1 shape (DC-1 (iii), DC-2 (b), DC-3 (a)); it differs only by inlining the
two small deny helpers. The payload is the compliant `git diff --no-ext-diff`, which today's guard allows.

| Fixture | Current | Prototype |
|---|---|---|
| A — `engine/bin/` present, `engine/src/` absent (git-guard-adapter's import fails to resolve) | exit 1, `ERR_MODULE_NOT_FOUND` stack | exit 2, `craft-guard: Cannot find module '…/engine/src/guards/tool-call-guard.js' …` |
| B — `src/craft-root.js` replaced by a stub whose `resolveCraftRoot` adds a stdin `data` listener that throws `RangeError('Invalid string length')` | exit 1 | exit 2, `craft-guard: Invalid string length` |
| C — `src/craft-root.js` replaced by a stub that calls `process.stdin.destroy()` (no `end` event ever comes) | **exit 0** | exit 2, `craft-guard: denied (fail-closed)` (a `process.exitCode = 2` variant also gave exit 2, with no stderr) |
| D — `src/git-guard-adapter.js` given a syntax error | exit 1 | exit 2, `craft-guard: Unexpected token '='` |
| F — `src/apply-patch-paths.js` throws while it evaluates | exit 1 | exit 2, `craft-guard: evaluation boom` |
| R — `src/craft-root.js` stubbed to leave a floating `Promise.reject(new Error('floating rejection'))`, node run with `--unhandled-rejections=warn` | **exit 0** | exit 2, `craft-guard: floating rejection` (with the `unhandledRejection` line deleted: exit 0, 3/3; under the default mode the `uncaughtException` handler still gives exit 2) |
| E — `hooks/craft-guard.js` itself given a syntax error | exit 1 | **exit 1** (residual) |
| real guard, unmodified tree, 600,000,000 bytes of `a` on stdin | exit 1, `RangeError: Invalid string length` at `craft-guard.js:35` (`raw += chunk`) | exit 2, `craft-guard: Invalid string length` |

The last row shows that B's crash class is real in the shipped guard. stdin longer than V8's
maximum string length (2^29 − 24 characters on 64-bit) overflows `raw += chunk` in the `data`
callback, outside the `try`. Not proven: whether codex ever sends a hook payload that large. C's
trigger exists only in a fixture. No real-code path that drains the loop without a verdict was
found. The prototype also passes all 8 existing tests in `craft-guard-hook.test.js` (pass 8,
fail 0).

### Prior decisions this design follows

- ADR-255: the Codex hook enforces by exit 2 + stderr reason. This design keeps that as the only
  deny route.
- ADR-512 and ADR-517: the registered command and the trust matcher's allow-list are fixed. The
  guard path stays `adapters/codex/hooks/craft-guard.js` (`GUARD_SCRIPT_SEGMENTS`,
  `adapters/codex/src/hook-trust.js:22`). `hooks.json`, `config.template.toml` and `hook-trust.js`
  are not touched.
- ADR-320: the POC record corrects rows in place inside the version-pinned re-probe section. The
  DEFERRED row lives in the `## Re-probe — codex-cli 0.161.0` section, so it is replaced there.
- Codex's `currentHash` covers the hook **definition**, not the guard script's bytes
  (`docs/contributing/specs/codex-poc-record.md:375`, pinned on 0.145.0, not re-pinned on 0.161.0).
  Editing the script's contents therefore needs no `trust-hook` re-run.

### Settled before this design (user decision, not re-opened)

Outcome (a): harden the guard. Any crash becomes exit 2 with a reason on stderr, pinned by a test
that makes the guard throw. The POC record gets a version-pinned row. The BACKLOG entry closes.

## Requirements

- **R1** Any crash after node starts evaluating `craft-guard.js` ends in exit 2 with a non-empty
  `craft-guard: <reason>` line on stderr and empty stdout. Crash means: a dependency fails to
  resolve, parse or evaluate; a throw outside `main()`'s `try`; or an unhandled rejection (in every
  `--unhandled-rejections` mode only under DC-3 (a); under the default mode either way).
- **R1b** (only under DC-2 (b)) An event loop that drains with no verdict ends in exit 2 with
  `craft-guard: denied (fail-closed)` on stderr.
- **R2** The allow path is byte-for-byte unchanged: exit 0, empty stdout, empty stderr.
- **R3** The 8 existing tests in `adapters/codex/test/craft-guard-hook.test.js` stay green
  unchanged. No `finally` in the hook source. No construct that can end in exit 0 without the allow
  verdict.
- **R4** The registered command, the guard file path, `hooks.json`, `config.template.toml` and
  `hook-trust.js` are unchanged.
- **R5** What no in-guard code can catch is written down where an operator reads it: the README's
  "Read unsoftened" list, and the guard's header comment. The four cases are: node cannot run the
  file at all, `node` is missing from `PATH`, a signal kills the process, or a preload in an
  inherited `NODE_OPTIONS` throws.
- **R6** `docs/contributing/specs/codex-poc-record.md`: the DEFERRED row "Hook exiting 1:
  fail-open or fail-closed (0.161.0)" becomes a CONFIRMED (0.161.0) row carrying the pinned matrix.
- **R7** `BACKLOG.md`: the entry "Probe what codex does with a hook that exits neither 0 nor 2" is
  marked delivered, in the house format.
- **R8** No new dependency. The adapter stays dependency-free.

## Design

### Part 1 — the guard (`adapters/codex/hooks/craft-guard.js`)

Context block:
- Symbols today: `FAIL_CLOSED_REASON` (const), `readStdin(): Promise<string>`,
  `denyWith(reason: string): never` (stderr line + `process.exit(2)`), `allow(): never`
  (`process.exit(0)`), `async main(): Promise<void>`, bare `main();` call at the bottom.
- Imports today: lines 22-23, both static, both relative to the hook file.
- Header comment lines 1-20: it must keep forbidding a `finally` and an unconditional exit-0
  cleanup, and keep "never writes to stdout on the allow path".
- Nothing on the guard path reads `process.env.CRAFT_ROOT` while modules evaluate (grep of
  `engine/src/guards`, `src/git-guard-adapter.js`, `src/apply-patch-paths.js`: no hits). Importing
  before setting `CRAFT_ROOT` matches today's order.

Shape (DC-1 (iii), DC-2 (b), DC-3 (a)):

```js
// no static import anywhere in this file: the crash handlers must be registered
// before any dependency is linked
const DENY_EXIT_CODE = 2;
const ALLOW_EXIT_CODE = 0;
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

function denyWith(reason) {
  process.stderr.write(`craft-guard: ${reason}\n`);
  process.exit(DENY_EXIT_CODE);
}

function denyOnCrash(err) {
  denyWith(err?.message || FAIL_CLOSED_REASON);
}

function denyWithoutVerdict() {
  denyWith(FAIL_CLOSED_REASON);
}

process.on('uncaughtException', denyOnCrash);
process.on('unhandledRejection', denyOnCrash);
process.on('beforeExit', denyWithoutVerdict);

// readStdin, allow() unchanged except allow() uses ALLOW_EXIT_CODE

async function main() {
  try {
    const { resolveCraftRoot } = await import('../src/craft-root.js');
    const { decideGuard } = await import('../src/git-guard-adapter.js');
    process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);
    // …rest of today's body, unchanged
  } catch (err) {
    denyOnCrash(err);
  }
}

main();
```

Why each piece is there:
- **Dynamic imports inside the `try`** (M2, M3): a dependency that fails to resolve, parse or
  evaluate is denied with its message. Fixtures A, D and F go from 1 to 2.
- **`uncaughtException`** (M6b, M4): a throw outside the `try`, such as the real `raw += chunk`
  overflow, is denied. Fixture B and the 600 MB row go from 1 to 2.
- **`unhandledRejection`** (M5b, M5c): with `uncaughtException` alone, a floating rejection under
  an inherited `--unhandled-rejections=warn|none` falls through to exit 0. It costs one line.
- **`beforeExit`** (M8, M8c, M9b): if the loop drains before any verdict, the guard denies with
  `FAIL_CLOSED_REASON` instead of exiting 0. Explicit `process.exit(…)` calls do not emit it, so
  neither the allow path nor a deny can trigger it.
- `main()` stays a floating call, not a top-level `await`. An unsettled top-level await exits 13
  even with handlers (M7). The floating form plus `beforeExit` has no such hole.
- The catch reuses `denyOnCrash` so the reason rule (`err?.message || FAIL_CLOSED_REASON`) lives
  in one place. A rejection whose reason is not an `Error` (`undefined`, a string) gets
  `FAIL_CLOSED_REASON`.
- Named exit codes replace the literals `2` and `0`, which would otherwise repeat in a second
  spot (the house rule against magic values).

Header comment: keep the existing paragraphs. Add one paragraph saying the file has no static
import, so the crash handlers are registered before any dependency loads, and every crash ends in
the same deny call. Add one sentence on the residual (R5). Wording must say why, not narrate the
code, and carry no ADR/backlog/phase reference.

### Part 2 — tests (`adapters/codex/test/craft-guard-hook.test.js`)

Context block:
- Existing helpers: `HOOK` (path const), `run(payload)` (spawnSync `process.execPath` on `HOOK`),
  `execPayload(cmd)`, `patchPayload(...paths)`. Style: `node:test`, `describe`/`it`,
  Given/When/Then titles, `sut`, AAA.
- `config.test.js` already uses `mkdtempSync` + `symlinkSync` + `rmSync` in a test helper. That is
  the precedent for a mktemp tree. A `finally` in the test file is fine: the `finally` scan reads
  only `HOOK`.

New helpers (in the test file, not shared):

```js
const ADAPTER_DIR = join(dirname(HOOK), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const ALLOWED_PAYLOAD = execPayload('git diff --no-ext-diff');

// copies hooks/ and src/ into a throwaway root; breakTree then removes or stubs one piece
function withGuardCopy(breakTree, act, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'craft-guard-crash-'));
  try {
    const adapterCopy = join(root, 'adapters', 'codex');
    for (const dir of ['hooks', 'src']) {
      cpSync(join(ADAPTER_DIR, dir), join(adapterCopy, dir), { recursive: true });
    }
    breakTree({ root, adapterCopy });
    return act(spawnSync(process.execPath, [...nodeArgs, join(adapterCopy, 'hooks', 'craft-guard.js')],
      { input: ALLOWED_PAYLOAD, encoding: 'utf8' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
```

Fixtures:
- **unresolvable dependency**: `mkdirSync(<root>/engine/bin, { recursive: true })` and no
  `engine/src`. `resolveCraftRoot` would pass, and git-guard-adapter's import of
  `../../../engine/src/guards/tool-call-guard.js` fails. `engine/bin` is there so that a later
  reorder calling `resolveCraftRoot` before the import cannot make the test pass on resolveCraftRoot's
  own throw. The assertion on `tool-call-guard` pins the cause either way.
- **throw outside the try**: `symlinkSync(<repo>/engine, <root>/engine)` so every import resolves,
  then overwrite `<adapterCopy>/src/craft-root.js` with a stub:
  `export function resolveCraftRoot() { process.stdin.once('data', () => { throw new RangeError('Invalid string length'); }); return '/'; }`.
- **no verdict ever reached**: same symlink, stub `resolveCraftRoot` calls `process.stdin.destroy()`
  and returns `'/'`.
- **floating rejection**: same symlink, stub `resolveCraftRoot` runs
  `Promise.reject(new Error('floating rejection'))` without awaiting it and returns `'/'`. The
  helper takes optional node args so this case spawns `[ '--unhandled-rejections=warn', hookPath ]`.
  That mode is the only one where `unhandledRejection` is the sole cover (M5b), so the test fails
  if that handler is deleted.

### Part 3 — prose

- `adapters/codex/README.md:145` (PreToolUse row, Mechanism cell). Append: "Any crash inside the
  guard (a module that fails to load, a throw, a rejected promise) also exits 2. codex 0.161.0
  runs the call on every other exit status, so a failure before the guard runs fails open (see
  below)."
- Same README, the bullet list under "Read unsoftened" (lines 152-165). New bullet: the hook **fails
  open** when node cannot run the guard file at all. The four cases are: `node` missing from
  `PATH` (the shell exits 127); the guard file missing or unparseable; the process killed by a
  signal; a `--require`/`--import` preload in an inherited `NODE_OPTIONS` that throws. codex
  0.161.0 runs the tool call on every exit status except 2. Do not write lowercase "github" in the
  README; the source-hygiene check bans it.
- `docs/contributing/specs/codex-poc-record.md:526`, replaced in place:

  | Hook exiting neither 0 nor 2 (0.161.0) | **CONFIRMED (0.161.0): fail-open.** Only exit 2 denies. Exit 1 (3/3 repeats), 3 and 127, `bash -c "exit 1"`, `sh -c "exit 1"`, an uncaught `node -e` throw, `node <missing>.js` and a self-SIGKILL each produced 2 `command_execution` items and turn-2 output `Process exited with code 0 … PROBE`. Controls: exit 0 ran the command; exit 2 + stderr produced 0 items and `Command blocked by PreToolUse hook: probe-deny. Command: echo PROBE`. Hook registered in a throwaway `config.toml`, trust bypassed there only, a marker file proving each hook ran. |
- `BACKLOG.md:180-185`. Retitle to `**Probe what codex does with a hook that exits neither 0 nor 2
  — delivered <date>**`, add `(codex-hook-nonzero-exit-probe)` as the sibling entries do, and replace
  the body with three sentences: the verdict (fail-open on every status except 2, and on a signal
  death), the guard change (any crash now exits 2), and the residual. Link this design doc.

### Edge behaviour

| Case | Result |
|---|---|
| Compliant payload | exit 0, no output (R2; M9b: `beforeExit` is not emitted) |
| Blocking payload | exit 2 with the predicate's reason (unchanged) |
| Dependency missing / syntax error / throws while evaluating | exit 2, the error's message |
| stdin over V8's maximum string length | exit 2, `Invalid string length` |
| A floating rejection, in any `--unhandled-rejections` mode | exit 2, the rejection's message (fixture R) |
| A rejection whose reason is not an `Error` | exit 2, `denied (fail-closed)` |
| The event loop drains with no verdict | exit 2, `denied (fail-closed)` |
| `craft-guard.js` itself unparseable, `node` not on `PATH`, signal death, a throwing preload | residual: exit 1 / 127 / signal / 1, so codex 0.161.0 runs the call (R5) |
| The stderr reader is gone (stderr closed with `2>&-`, or a pipe whose read end was destroyed before the deny) | exit 2. Pinned on the prototype: fixture A with `2>&-`, and fixture B spawned with its stderr pipe destroyed before stdin was written (3/3) |

The reason text can carry absolute paths (an `ERR_MODULE_NOT_FOUND` message names both files).
Codex feeds stderr back to the model. Today's catch already does this for resolveCraftRoot's
path-bearing errors, so this is not a new exposure class.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How a crash outside today's `try` becomes a deny | (i) dynamic `await import()` of the two dependencies inside `main()`'s `try`, nothing else; (ii) a zero-import entry that registers the handlers, then dynamic-imports a new module holding today's body; (iii) one file: handlers at the top, dynamic imports inside `main()`'s `try` | (iii) | (i) fixes fixtures A, D and F but leaves B and the real 600 MB overflow at exit 1 (M6), so it does not meet "any crash". (ii) covers the same cases as (iii), but needs a new `src/` module. It also needs `denyWith` in both files: either duplicated, or moved to a third module, which the entry would then have to import statically, breaking zero-import. And the `finally` scan has to cover two files. (iii) covers everything in-guard code can reach. It is the smallest diff to the one file the matcher names, and was prototyped green against all 8 existing tests. |
| DC-2 | The event loop drains with no verdict (fixture C: exit 0 today) | (a) nothing, so it stays exit 0; (b) a `beforeExit` handler that denies with `FAIL_CLOSED_REASON`; (c) `process.exitCode = 2` set at the top | (b), flagged: the trigger is fixture-only | This is not a "crash" in the brief's wording, and no real-code trigger was found, so (a) is the strict-scope reading. But the header comment's invariant is that every path ends in a deny, and the current code breaks it (C: exit 0). (b) restores it with a reason on stderr (M8c) and never fires on an explicit `process.exit` (M9b). So it is safe against the allow path. (c) is also safe against allow (M9), but denies **silently** (M8b): it is the blank-reason denial the existing `FAIL_CLOSED_REASON` comment warns against. And it adds nothing for crashes (M10). |
| DC-3 | Which process-level handlers | (a) `uncaughtException` and `unhandledRejection`; (b) `uncaughtException` only | (a) | (b) handles every case under node's default mode (M4, M5, M6b), but an inherited `--unhandled-rejections=warn` or `none` lets a floating rejection end in exit 0 (M5b; fixture R with the line deleted: exit 0, 3/3). Not proven: whether codex passes the user's `NODE_OPTIONS` to hooks. (a) closes the case in every mode (M5c) for one line. `unhandledRejection` alone is not an option: it misses a rejected top-level await (M4b). |
| DC-4 | How to pin the throw-outside-the-try class in a test | (a) a mktemp copy with `src/craft-root.js` stubbed to throw from a stdin `data` listener; (b) the real overflow, over 512 MiB of stdin to the real guard; (c) no test, only the unresolvable-dependency test | (a) | (b) took ~20 s locally on a 600 MB input, too heavy for the per-part gate. (c) leaves the `uncaughtException` handler with no test: deleting it would stay green. (a) runs in milliseconds and throws the same error type from the same kind of callback as the real overflow. It is red today (exit 1). |
| DC-5 | Scope | (a) the codex guard only; (b) also audit the sibling guards (`adapters/cursor/hooks/craft-guard.js`, root `hooks/git-no-ext-diff.sh`) | (a) | This is the brief's scope, and the sibling guards have no proof for this problem: no host exit-status matrix, no crash fixture. Copilot's observer cannot deny by design (ADR-243). Each sibling gets one line in Out of scope saying how to prove it. |

Settled already, so not candidates: harden the guard rather than document only (user decision).
The registered command and guard path (ADR-512/517). Exit 2 as the only deny route (ADR-255).
Replacing the POC row in place (ADR-320).

## Test strategy

Part gate: `npm --prefix adapters/codex test`. Phase gate: `bash scripts/ci.sh`. Pipe both to a
file and read back only the summary and any failure.

New tests in `adapters/codex/test/craft-guard-hook.test.js`, each red on today's code (fixture
exits observed in the guard-level matrix):

| Title | Fixture | Assertions | Today |
|---|---|---|---|
| Given a guard copy whose engine predicate cannot be resolved, when the hook process runs, then it exits 2 naming the missing module on stderr | unresolvable dependency | `status === 2`; stderr matches `/^craft-guard: .*tool-call-guard/m`; stdout `''` | exit 1 |
| Given a guard copy whose stdin listener throws, when the hook process runs, then it exits 2 with the error on stderr | throw outside the try | `status === 2`; stderr matches `/^craft-guard: Invalid string length$/m`; stdout `''` | exit 1 |
| Given a guard copy whose stdin never ends, when the event loop drains, then it exits 2 with the fail-closed reason (only if DC-2 (b)) | no verdict ever reached | `status === 2`; stderr matches `/^craft-guard: denied \(fail-closed\)$/m`; stdout `''` | exit 0 |
| Given a guard copy that leaves a promise rejection unhandled under the warn rejection mode, when the hook process runs, then it exits 2 with the rejection on stderr (only if DC-3 (a)) | floating rejection | `status === 2`; stderr matches `/^craft-guard: floating rejection$/m`; stdout `''` | exit 0 |
| Given the hook source text, when scanned, then it has no static import statement | none (`readFileSync(HOOK)`) | `doesNotMatch(/^\s*import\s[^(]/m)` | red: lines 22-23 |

Why the source scan: the first test fails only if git-guard-adapter is imported statically again.
A static import of `craft-root.js` would resolve in every fixture and slip past all of them. The
scan pins the structural rule ("no static import") directly, the same way the existing `finally`
scan does. The regex skips `import(` and the header comment's ` * ` lines. Checked: it matches today's file
and does not match the prototype.

Existing 8 tests: unchanged and green (prototype run: pass 8, fail 0). The allow test already
asserts exit 0 and empty stdout. Under DC-2 (b) it also proves `beforeExit` stays silent on the
allow path.

Not tested in the suite, and why: the real >512 MiB overflow (DC-4 (b), recorded here once as
evidence); the residual classes (by definition not reachable from in-guard code); a codex
end-to-end run (the exit-2 → block contract is already pinned in the POC record, and this change
adds no new exit status).

Prose checks: `bash scripts/design-lint.sh` on this doc. The README hygiene and intention-lint run
inside `scripts/ci.sh` and cover the README, POC-record and BACKLOG edits.

## Out of scope

- `adapters/codex/src/hook-trust.js`, `hooks.json`, `config.template.toml`: unchanged (R4).
- The residual itself (node cannot load the guard file, `node` missing from `PATH`, signal death,
  a throwing `NODE_OPTIONS` preload). No code inside the guard can catch these. They are
  documented, not fixed.
- Capping stdin size. The overflow now denies. A size limit with its own reason is separate
  behaviour, and nobody asked for it.
- The JSON `hookSpecificOutput` deny path. It stays deferred; exit 2 is the route.
- Removing absolute paths from deny reasons. Existing behaviour, not widened here.
- `adapters/cursor/hooks/craft-guard.js`: not checked for this crash class. To prove it: run the
  same static-import fixture (A) against it, and pin Cursor's exit-status matrix the same way as
  above.
- Root `hooks/git-no-ext-diff.sh` (the Claude Code hook): not checked. To prove it: make the
  script exit 1 under a live Claude Code PreToolUse call and see whether the Bash call runs.
- `adapters/copilot`: its observer cannot deny by design (ADR-243), so this problem does not
  apply.
