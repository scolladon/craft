# Plan — driver-contract-in-craft-run

> Source: design doc `docs/contributing/design/driver-contract-in-craft-run.md` · ADRs `619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629`
> (all eleven take the design's recommended option: one per-entry state dir named by
> `CRAFT_DRIVER_STATE`, files `status` / `next.md` / `next.prompt` (619); env only, no craft
> flag (620); election as two files (621); every `--policy` token stripped, any verdict (622);
> bare tokens only, a leftover is exit 3 (623); writes land in run §Done after `close` and in a
> "Driven stop" invariant (624); `BLOCKED` at terminal stops only (625); an unmerged run reports
> `BLOCKED integrate: not merged …` (626); workspace reaches the worktree by absolute path,
> never `EnterWorktree` (627); engine module + main + bin + `scripts/` wrapper (628); an
> existing `status` is never overwritten (629))
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

## Plan shape (4 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | Pure driver-state module: status grammar + `--policy` strip | pure-module | engine/src/driver-state.js (new) | module + its suite |
| 2 | driver-state main, bin and `scripts/` wrapper | io-shell | engine/src/driver-state-main.js, engine/bin/driver-state.js, scripts/driver-state.sh (new) | 3 sources + 2 suites |
| 3 | Run + workspace skill prose: probe, Driven stop, hand-off, election, absolute-path worktree | docs-prose | none | 3 skills + 2 process tests |
| 4 | Driver spec + policy-spec link | docs-prose | none | 2 specs + 2 process tests |

The design's "Parts (pre-chewed)" sketched five parts. Its Part 4 (workspace step 5, one
paragraph + one pin) is folded into Part 3: alone it would not earn an agent lifecycle, and
Part 3 + workspace stays at 5 files / 5 RED→GREEN cycles. The spec stays apart (folding it
into Part 3 would put 8 files in one Context block).

### Resolved gates (live probes, recorded 2026-10-17 — not work for any part)

- **P1 — env propagation: PASS.** `CRAFT_DRIVER_STATE` set on the `claude --bg` launcher's
  environment was read by `printenv` inside the session (CLI 2.1.302). The `claude --bg --resume`
  path was not probed: the spec (Part 4) tells drivers to re-set the variable on resume. So the
  state dir reaches the run by env only — no `--driver-state` flag exists, nothing to strip
  besides `--policy`.
- **P2 — sibling edit without `EnterWorktree`: PASS.** A `--bg` session wrote a file inside a
  sibling git worktree with the Write tool, with no `EnterWorktree` call and no permission
  prompt; the control Write into the shared checkout was refused by the isolation guard. So the
  workspace skill reaches the worktree by absolute path, with no background-session branch and
  no `.claude/worktrees/` layout. The spec still documents a `PermissionRequest` hook as the
  fallback for CLI versions where this does not hold (ADR-627 consequence) — prose only.

### Cross-part traps (pre-paid; every part agent reads this)

- **Source hygiene** (test/source-hygiene.test.js) scans `engine/src`, `engine/bin`, `scripts`
  whole-line, and test titles + comments, for provenance tokens — `ADR-?\d+`, `P\d+`,
  `Part \d+`, `DC-\d+`, and case-sensitive `R\d+`/`T\d+`/`F\d+` in shipped code. Never write
  "P1", "DC-5", "R4" etc. in source, shell comments, test titles or test comments. It also
  scans `skills/`, `engine/src`, `docs/contributing/specs/` and README for `\bgh\b`,
  `\bgithub\b`, and for `stryker|mutation|mutant` — use `https://example.test/org/repo/pull/70`
  as the sample PR URL everywhere, and say "the VCS host" instead of naming a CLI.
- **No public barrel entry.** Every new export is **internal**: `engine/src/index.js` is NOT
  touched (it exports only pipeline/policy surface). The only public surface is the CLI
  `scripts/driver-state.sh` (verbs `active`, `finished`, `blocked`), documented in Part 4's spec.
- **Stryker** already covers new files: engine/stryker.conf.json mutates `engine/src/**/*.js` and
  its tap runner globs `engine/test/**/!(*.differential).test.js`. No config edit. Do not name a
  test file `*.differential.test.js`.
- **Test discovery**: scripts/ci.sh enumerates every `*.test.js` under engine/test and test/
  with find; test/every-test-file-registers.test.js only requires each file to register ≥1
  `test(`. No registry edit.
- **Bin auto-enumeration**: engine/test/bin-entry-symlink.bin.test.js spawns every
  engine/bin/*.js with argv `['/nonexistent']` and requires a non-zero exit or output. The new
  bin satisfies it by treating `/nonexistent` as an unknown verb (exit 2 + usage on stderr).
- **Ambient env**: a test of this repo may itself run inside a driven session. Every spawn test
  builds its env as `{ ...process.env }` then `delete env.CRAFT_DRIVER_STATE` (or sets it
  explicitly); unit tests of the main inject `deps.env` and never read or mutate `process.env`.
- **README count**: no part adds a design, plan or ADR, so README.md:200 counts stay as the
  planning commit leaves them.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| PDC-1 | Exit code when a write fails mid-call (an `fs` error on write/rename, after validation passed) — the design's exit table has no row for it | (a) **Distinct exit 5**: stderr `driver-state: cannot write <name>: <error message>`, the call's own `*.tmp.<pid>` removed, `status` never written after a failure (files renamed earlier in the same call stay). (b) Rethrow: node prints the stack, exit 1 (collides with `active`'s "not driven" code). | (a) | One documented code the orchestrator can surface (R9 posture) and the spec can list; (b) overloads exit 1 and prints a stack to the person. Part 2 implements (a); flipping to (b) is a one-branch change in Part 2's main and one row in Part 4's spec. |

## Part 1 — Pure driver-state module: status grammar and `--policy` strip

### Context

Creates `engine/src/driver-state.js` and `engine/test/driver-state.test.js`. Pure: no `node:`
import, no I/O, no `process`. Mirror the shape of engine/src/policy.js (JSDoc per export,
`Object.freeze` on exported arrays, named constants, early returns). ESM (`export`), like every
engine/src file. The test is ESM too: `import { test } from 'node:test'; import assert from
'node:assert/strict';` then `import { … } from '../src/driver-state.js';`.

Exports (all **internal** — consumed only by Part 2's main and this suite; no barrel entry):

```js
export const STATUS_VERBS = Object.freeze(['FINISHED', 'BLOCKED']);
export const MAX_REASON_CHARS = 240;
export function finishedLine(prUrl)          // → { line: 'FINISHED <url>' } | { error: string }
export function blockedLine(phaseId, reason) // → { line: 'BLOCKED <phase>: <reason>' } | { error: string }
export function stripPolicyFlags(prompt)     // → { prompt: string, leftovers: string[] }
export function findBarePolicyTokens(text)   // → string[] of bare `--policy` / `--policy=…` tokens
```

Module-private named constants (no magic values): `URL_RE = /^https?:\/\/\S+$/`,
`PHASE_ID_RE = /^[a-z][a-z0-9-]*$/`, `POLICY_FLAG = '--policy'`,
`POLICY_FLAG_INLINE_PREFIX = '--policy='`, `WHITESPACE_RUN = /\s+/g`, `SEPARATOR_SPLIT = /(\s+)/`,
`LINE_BREAK = /[\n\r]/`, `FLAG_VALUE_MARK = '='`.

Line grammar (the `line` carries NO trailing newline; Part 2 appends `\n` when writing):

- `finishedLine(url)`: `URL_RE` must match the raw argument (no trim) → `FINISHED ${url}`;
  else `{ error }` naming the bad url. Empty, `'https://x y'`, `'example.test/pull/70'`,
  `'ftp://x'` are errors.
- `blockedLine(phase, reason)`: `PHASE_ID_RE` on phase (`'Bad-Phase'`, `'1x'`, `''` → error).
  Reason: replace `WHITESPACE_RUN` with one space → `trim()` → empty is an error → truncate to
  `MAX_REASON_CHARS` **code points** (`[...s].slice(0, MAX_REASON_CHARS).join('')`, so a
  surrogate pair is never split) → `trimEnd()`. Line = `BLOCKED ${phase}: ${reason}`.

Strip algorithm (prototyped in a throwaway; idempotent and leftover-free over a 500-case
seeded corpus):

1. `tokens = prompt.split(SEPARATOR_SPLIT).filter((t) => t !== '')` — words and whitespace runs
   alternate, so `tokens.join('')` is the input byte for byte.
2. A token is a **flag** when it equals `POLICY_FLAG` or starts with `POLICY_FLAG_INLINE_PREFIX`.
   A backticked or quoted mention (`` `--policy`` …, `"--policy"`) is a different token and stays.
3. Walk the tokens. A non-flag token is kept. For a flag at index `i`, set `j = i + 1`; if the
   flag is exactly `POLICY_FLAG`, `tokens[j]` is a separator with no `LINE_BREAK`, and
   `tokens[j + 1]` includes `FLAG_VALUE_MARK` → the value is consumed too (`j += 2`). Then, if
   `tokens[j]` is a separator with no `LINE_BREAK`, drop it as well (`j += 1`). Continue at `j`.
   So the value of a flag is the next token **on the same line**, and a line break is never
   removed (line structure survives).
4. `prompt = kept.join('')`; `leftovers = findBarePolicyTokens(prompt)`.

`findBarePolicyTokens(text)` = `text.split(WHITESPACE_RUN)` filtered by the flag predicate. It is
the independent post-condition Part 2's main turns into exit 3; for real input `leftovers` is
always `[]` (that is the property the corpus test pins), so Part 2 tests exit 3 by injecting a
strip stub.

Strip expectations (one table-driven test, one row each; `sut = stripPolicyFlags`):

| Input | `prompt` out |
|---|---|
| `'/craft:run --policy push=always --policy propose=always Compose x'` | `'/craft:run Compose x'` |
| `'--policy is mentioned'` | `'is mentioned'` |
| `'a --policy=push=always b'` | `'a b'` |
| `'a --policy integrate=never b'` / `'a --policy push=ask b'` | `'a b'` |
| `'run --policy'` | `'run '` |
| `'a --policy x=y\nb'` | `'a \nb'` |
| `'line1\n--policy a=b\nline3'` | `'line1\n\nline3'` |
| `` 'keep `--policy push=always` here' `` and `'say "--policy" here'` | unchanged |
| `'--skip review --profile lean --harness review.passes=2 --config x'` | unchanged |
| `'x --policy --policy=a=b y'` | `'x y'` |

Seeded corpus: copy the `mulberry32(seed)` PRNG from engine/test/codex-telemetry.test.js
(`function mulberry32(seed)` at ~:365) into this suite as a local helper; fixed seed 42, 500
cases, each 1–8 fragments joined with a space or a newline (30 %), drawn from:

```js
const FRAGMENTS = Object.freeze(['--policy push=always', '--policy=integrate=never',
  '`--policy x=always`', '"--policy"', '--skip review', 'word', '--policy', 'x=y', '--policy\n']);
```

Per case assert `leftovers` is `[]`,
`findBarePolicyTokens(out.prompt)` is `[]`, and `stripPolicyFlags(out.prompt).prompt === out.prompt`.

### TDD steps

1. RED — `engine/test/driver-state.test.js`: "Given a merged PR url, when finishedLine runs,
   then it returns the FINISHED line" + rejection rows (empty, inner space, no scheme, `ftp://`).
   Fails: `Cannot find module '../src/driver-state.js'` (module does not exist).
2. GREEN — create the module with `STATUS_VERBS`, `MAX_REASON_CHARS`, `URL_RE`, `finishedLine`.
3. RED — `blockedLine` rows: `('resolve', 'a\n  b')` → `BLOCKED resolve: a b`; a 300-char reason
   → exactly 240 code points after `': '`; a reason of 239 ASCII + one emoji (surrogate pair) at
   position 240 keeps the whole emoji; a reason ending in a space at the cut has no trailing
   space; `('Bad-Phase', 'x')`, `('', 'x')`, `('resolve', '  \n ')` → `{ error }`. Fails:
   `blockedLine` is not exported (`SyntaxError: … does not provide an export named 'blockedLine'`).
4. GREEN — `PHASE_ID_RE`, `WHITESPACE_RUN`, `blockedLine`.
5. RED — `findBarePolicyTokens`: `'a --policy x=y --policy=b=c'` → `['--policy', '--policy=b=c']`;
   `` '`--policy` "--policy"' `` → `[]`. Fails: export missing.
6. RED — the strip table above (one `test` per row via a `for` over a frozen rows array, title
   built from the row), and the seeded-corpus property test ("Given 500 seeded prompts mixing
   policy flags, quoted mentions and other flags, when stripped, then no bare policy token
   survives and a second strip changes nothing"). Both fail: `stripPolicyFlags` export missing.
7. GREEN — `findBarePolicyTokens`, then `stripPolicyFlags` per the algorithm.
8. REFACTOR — functions ≤ 20 lines (extract `isFlag`, `isSameLineSeparator`, `consumedUntil`),
   nesting ≤ 2, JSDoc on every export, no comment that restates code.

### Gate

`bash scripts/ci.sh` (pipe to a file; read the `# fail` lines and the last `ci:` line). For the
inner loop: `cd engine && node --test test/driver-state.test.js`.

### Commit

`feat(engine): add the driver-state status grammar and policy-flag strip`

## Part 2 — driver-state main, bin and scripts wrapper

### Context

Creates `engine/src/driver-state-main.js`, `engine/bin/driver-state.js`,
`scripts/driver-state.sh`, `engine/test/driver-state-main.test.js`,
`engine/test/driver-state.bin.test.js`. Builds on Part 1's engine/src/driver-state.js
(`finishedLine`, `blockedLine`, `stripPolicyFlags`).

Patterns to copy (read-only):
- engine/bin/run-state.js → the bin, minus `readStdin`:
  ```js
  #!/usr/bin/env node
  import { isEntryPoint } from '../src/cli-io.js';
  import { main } from '../src/driver-state-main.js';
  if (isEntryPoint(import.meta)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
  Mode 100755 (`chmod +x`, then `git add` — check with `git ls-files -s`).
- scripts/emit-metrics.sh → the wrapper (mode 100755): header comment saying what it forwards,
  `set -euo pipefail`, `SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`,
  `node "${SCRIPTS_DIR}/../engine/bin/driver-state.js" "$@"`. Must pass `shellcheck`
  (scripts/static-lints.sh runs `shellcheck scripts/*.sh`).
- engine/src/init-land-main.js `main(argv, io, deps = {})` with `deps.x ?? default` resolution;
  engine/src/run-state-main.js for a `fail(message, io)` that writes `driver-state: <msg>\n`.
- engine/test/config-resolve.bin.test.js for the spawn suite (`spawnSync(process.execPath,
  [BIN, …], { encoding: 'utf8', env })`, mkdtemp + `rmSync` in `finally`);
  test/emit-metrics-script.test.js for spawning the wrapper with `bash`.

Main contract — `export function main(argv, io, deps = {})`, returns the exit code:

```
deps.env   ?? process.env       read CRAFT_DRIVER_STATE only
deps.fs    ?? { lstatSync, statSync, accessSync, readFileSync, writeFileSync, renameSync, unlinkSync }  (node:fs)
deps.pid   ?? process.pid
deps.strip ?? stripPolicyFlags  (seam for the exit-3 branch, which real input never reaches)
```

| Verb | Exit | When |
|---|---|---|
| `active` | 0 + stdout `<dir>\n` | env value is an absolute path (`path.isAbsolute`) to an existing directory (`statSync(..).isDirectory()`) that is writable (`accessSync(dir, constants.W_OK)`) |
| `active` | 1, silent | variable unset or `''` |
| any verb | 2 + stderr | set but relative / missing / not a dir / not writable (stderr names which) |
| `finished <pr-url> [--election <md> --prompt <file>]` | 0 | written |
| `blocked <phase-id> <reason…>` | 0 | written (reason = remaining argv joined with `' '`) |
| `finished` / `blocked` | 2 | not driven (unset/empty), bad env, missing/extra args, only one of `--election`/`--prompt`, unreadable election/prompt file, grammar error from Part 1 — nothing written |
| `finished` | 3 | `strip(prompt).leftovers` non-empty — nothing written, stderr lists them |
| `finished` / `blocked` | 4 | `lstatSync(<dir>/status)` succeeds (a dangling symlink counts) — nothing written |
| `finished` / `blocked` | 5 | an fs error while writing (PDC-1 (a)) — stderr `driver-state: cannot write <name>: <message>`; that file's temp removed; `status` not written |
| none / unknown verb (incl. `/nonexistent`) | 2 | usage on stderr: `driver-state: usage: driver-state active | finished <pr-url> [--election <md> --prompt <file>] | blocked <phase-id> <reason…>` |

Validation order (everything that can refuse runs before the first write): verb → env →
args/grammar → read election + prompt files → `lstat(status)` (ENOENT = proceed; any other error
→ exit 5) → strip/leftovers. Exit constants named: `EXIT_OK`, `EXIT_NOT_DRIVEN`, `EXIT_INVALID`,
`EXIT_POLICY_LEFTOVER`, `EXIT_STATUS_EXISTS`, `EXIT_WRITE_FAILED`; file names named:
`STATUS_FILE = 'status'`, `ELECTION_FILE = 'next.md'`, `PROMPT_FILE = 'next.prompt'`;
`ENV_VAR = 'CRAFT_DRIVER_STATE'`.

Atomic write, one helper `publish(dir, name, content, deps)`: `tmp = join(dir,
\`${name}.tmp.${pid}\`)` → `writeFileSync(tmp, content, { flag: 'wx' })` → `renameSync(tmp,
join(dir, name))`; on any throw: `unlinkSync(tmp)` (an ENOENT from that unlink is expected and
ignored by code check, any other unlink error is appended to the same stderr line), report, exit 5.
Order for `finished` with election: `next.md` (election file content verbatim) → `next.prompt`
(the stripped prompt) → `status`. `status` content = the Part 1 line + `'\n'`. `blocked` and
`finished` without election write `status` only. A rename over a symlink at `next.*` replaces the
link, never its target (rename semantics — pin it in a test).

### TDD steps

1. RED — `engine/test/driver-state-main.test.js` "active" rows with mkdtemp dirs and `deps.env`:
   absolute writable dir → 0 + stdout path; `{}` and `{ CRAFT_DRIVER_STATE: '' }` → 1 and empty
   stderr; relative `'state'`, a missing path, a regular file, and a dir whose injected
   `accessSync` throws EACCES → 2 with stderr naming the cause. Fails: module not found.
2. GREEN — main skeleton: verb dispatch, usage, env resolution (`resolveStateDir(env, fs)` →
   `{ dir } | { notDriven } | { error }`), `active`.
3. RED — `blocked`: writes `status` = `BLOCKED resolve: a b\n` for reason argv `['a\n', ' b']`;
   bad phase → 2 and the dir stays empty; unset env → 2, nothing written; an existing `status`
   → 4 and its bytes unchanged; a dangling symlink at `status` → 4. Fails: `blocked` falls into
   the unknown-verb usage branch (exit 2, nothing written) — the success and exit-4 rows fail.
4. GREEN — `publish` helper + `blocked` + the `lstat` guard.
5. RED — `finished`: without election → `FINISHED https://example.test/org/repo/pull/70\n`;
   with election → `next.md` byte-equal to the election file, `next.prompt` equal to
   `'/craft:run Next entry'` for a prompt file `'/craft:run --policy push=always Next entry'`;
   write order through a `deps.fs` wrapper whose `renameSync` calls the real one then records
   `readdirSync(dir).sort()` — expect `[['next.md'], ['next.md','next.prompt'],
   ['next.md','next.prompt','status']]`; only `--election` given → 2; unreadable prompt path →
   2; a `deps.strip` stub returning `{ prompt: 'x', leftovers: ['--policy'] }` → 3, dir empty;
   `renameSync` throwing on the `next.prompt` rename → 5, no `*.tmp.*` file, no `status`; a
   symlink at `next.md` pointing to an outside file → after success the outside file is
   unchanged and `next.md` is a regular file; after every success and every refusal the dir
   lists no `*.tmp.*`. Fails: `finished` hits the usage branch.
6. GREEN — `finished` (arg pairing, file reads, strip, ordered publishes).
7. RED — `engine/test/driver-state.bin.test.js`: spawn the bin with env minus
   `CRAFT_DRIVER_STATE` → `active` exits 1; with it set to a mkdtemp dir → `blocked resolve
   manifest invalid` exits 0 and `status` reads `BLOCKED resolve: manifest invalid\n`; spawn
   `bash scripts/driver-state.sh active` with the var set → exit 0, stdout the dir (the
   wrapper resolves the bin relatively and forwards `"$@"` and the exit code); `finished` with
   no args through the wrapper → exit 2 (code passthrough). Fails: bin and wrapper files do not
   exist (`MODULE_NOT_FOUND` / bash "No such file").
8. GREEN — create the bin and the wrapper (modes 100755).
9. GUARD — engine/test/bin-entry-symlink.bin.test.js now enumerates `driver-state.js` and passes:
   `/nonexistent` is an unknown verb → exit 2 with usage.
10. REFACTOR — each function ≤ 20 lines, no boolean params, nesting ≤ 2; `main` is a dispatch
    table over verbs.

### Gate

`bash scripts/ci.sh` (pipe to a file; grep `# fail`, `not ok`, `ci:`). Inner loop:
`cd engine && node --test test/driver-state-main.test.js test/driver-state.bin.test.js`.

### Commit

`feat(engine): add the driver-state bin and script`

## Part 3 — Run and workspace skill prose: driver probe, Driven stop, hand-off, election, absolute-path worktree

### Context

Edits `skills/run/SKILL.md`, `skills/workspace/SKILL.md`, `skills/integrate/SKILL.md`,
`test/craft-root-shim.test.js`; creates `test/driver-contract.test.js` (CommonJS like every
test/ suite: `'use strict'; const { test } = require('node:test'); const assert =
require('node:assert'); const { TO_END, sliceProse } = require('./helpers/region-slice');`).
Pattern: test/fold-followups.test.js (named constants for every region regex and phrase,
`sut` = the sliced region, Given/When/Then titles). Part 2's CLI is what the prose calls.

**Shim count (load-bearing).** test/craft-root-shim.test.js `TARGET_FILES` pins
`{ file: 'skills/run/SKILL.md', count: 9 }` — the number of `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/`
occurrences. This part adds **exactly three**: one in step 0-driver, one in the Driven stop
block, one in the §Done hand-off block → bump to `count: 12`. Every other mention says
"driver-state.sh <verb>" by name only (no shim), and multi-call blocks use a
`driver="…/driver-state.sh"` variable like §0 step 4's `ledger=` (run skill ~:142).
skills/workspace and skills/integrate gain no shim (counts 2 and 1 stay).

Anchors in skills/run/SKILL.md (line numbers at branch tip):

1. **§0, new step before `0a.` (:19)** — insert verbatim (start-of-line label `0-driver.`):
   ```
   0-driver. **Driver probe.** Run
      `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh" active` via Bash. Exit 0 =
      this run is **driven**: an outside driver set `CRAFT_DRIVER_STATE` to a state dir and waits
      for the run's status file there (`docs/contributing/specs/driver.md`). Exit 1 = not driven;
      nothing below changes. Exit 2 = the variable is set but unusable: surface its stderr and
      continue undriven — a broken env never stops a run. Nothing is held in session state: every
      later use re-runs `driver-state.sh active`, so a compaction or a resume loses nothing.
   ```
2. **Rebuild after compaction, step 2 (:528)** — append to the step: "and re-run
   `driver-state.sh active` (no ledger token records it: the env is the source of truth)".
   Keep `RESOLVE:` in the step (pinned by test/run-record.test.js).
3. **Cross-phase invariants, new bullet right after `- **Blockers**` (:487-488), before
   `- **Policy consult**`:**
   ````
   - **Driven stop**: when the run is about to end its turn at a terminal stop it cannot
     continue from — any STOP in §0 or in the walk error paths, the workspace collision STOP, an
     escalation the user declined or left with no way forward, a `degrade-to-blocker` policy
     surface — its last tool call is one Bash call:
     ```
     driver="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh"
     "$driver" active >/dev/null && "$driver" blocked <phase-id> "<reason>"
     ```
     Every §0 stop uses phase id `resolve`. An escalation is still asked first; only a stop the
     run cannot continue from writes `BLOCKED`. The ledger stays open, so the run resumes as
     after any STOP. Undriven, `active` exits 1 and nothing is written; a non-zero exit from
     `blocked` is surfaced to the user, never a blocker.
   ````
4. **§Done, the `close` paragraph (:603-604)** — "the last action" → "the last ledger action".
   Then insert, between it and `Final message:` (:606):
   ````
   **Driver hand-off.** Once `close` has run, run `driver-state.sh active`; exit 1 skips this
   paragraph. Driven (exit 0):
   - **PR merged** — elect the next item (below), write the rationale to `next.md` and the
     ready-to-paste prompt to `next.prompt` in a fresh `mktemp -d` dir outside the working tree,
     then call `driver-state.sh finished` with both. No election → `finished <pr-url>` alone.
     Exit 3 (the prompt still held a bare `--policy` token) → re-run `finished <pr-url>` alone
     and say in the final message that the election was withheld and why.
   - **No merge** (`integrate` resolved to `never`, the merge ask declined, `integrate`
     skipped, or no remote) → `driver-state.sh blocked integrate "not merged <pr-or-branch>"`,
     no election.
   ```
   driver="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh"
   "$driver" active
   "$driver" finished <pr-url> --election <tmp-dir>/next.md --prompt <tmp-dir>/next.prompt
   "$driver" finished <pr-url>
   "$driver" blocked integrate "not merged <pr-or-branch>"
   ```
   Each Bash call starts with the `driver=` line. The status write is the run's last tool call:
   nothing follows it but the final message. Exit 4 (a status already exists) or any other
   non-zero exit is surfaced to the user, never a blocker.

   **Election (driven runs only).** With `backlog: { source: file }`: the first open entry
   top-down in the backlog file that is unblocked — no unmet dependency, no paid eval, no
   interactive-only step — with the context a cold session needs (decision points, gates, known
   traps). The prompt is `/craft:run <entry>`; the script strips any `--policy` flag, because
   pre-approval belongs to the driver, per entry. `source: custom` (no list operation) or no
   `backlog:` key: no election, the status alone. An undriven run elects nothing.
   ````
   Final message paragraph stays as is.

skills/workspace/SKILL.md step 5 (:41, last line) — replace
"5. All subsequent work happens ONLY in this worktree/branch." with:
```
5. All subsequent work happens ONLY in this worktree/branch, reached by its **absolute path**:
   Bash as `cd <abs-worktree-path> && …`, file tools at `<abs-worktree-path>/…`, agents spawned
   with it as their working directory. Never move the session itself with a working-directory
   relocation tool (Claude Code's `EnterWorktree`): for a worktree outside `.claude/worktrees/`
   it raises a permission prompt that auto mode cannot approve, which halts a background
   session, and a background session's edit guard already accepts edits at the worktree's
   absolute path.
```
(`strategy: in-place` keeps using the checkout root — step 2 already says so; unchanged.)

skills/integrate/SKILL.md step 5 (:49-51) — "it is the last action of the run skill's `Done`"
→ "it is the last ledger action of the run skill's `Done`" (the driver status write now follows
it). No test pins the old wording (grep "last action" over test/ is empty).

Existing pins that must stay green (read-only): test/run-record.test.js (§Done: `run-ledger.sh
close`, `save(repoRoot, view, delta, deps)`, `**once**, atomically`, the buffered-flush sentence,
`PHASE-START(`, `worktree-teardown.sh`, `outlives`; Rebuild: `run-state.js`, `locate --run`,
`RESOLVE:`, `inFlight`, a `` | `review` `` row; section order Review cadence < Rebuild < Done;
workspace step 2 fenced block), test/craft-run.test.js, test/fold-followups.test.js. Prose-lint
runs on touched skills: avoid `delve`, `leverage`, `seamless`, `robust`. Source hygiene scans
skills/ for `gh`/`github` — none in the text above.

Region constants for the new suite: `DRIVER_PROBE_START = /^0-driver\. /`, `STEP_0A = /^0a\. /`;
`DRIVEN_STOP_START = /^- \*\*Driven stop\*\*/`, `POLICY_CONSULT = /^- \*\*Policy consult\*\*/`;
`DONE_START = /^## Done/` with `TO_END`; `HANDOFF_START = /^\*\*Driver hand-off\.\*\*/`,
`FINAL_MESSAGE = /^Final message:/`; `ELECTION_START = /^\*\*Election \(driven runs only\)\.\*\*/`;
`REBUILD_START = /^## Rebuild after compaction/`, `DONE_HEADING = /^## Done/`;
`WORKSPACE_STEP_5 = /^5\. All subsequent work/` with `TO_END`.

### TDD steps

1. RED — `test/driver-contract.test.js`: "Given the run skill §0, when the driver-probe step is
   read, then it calls driver-state.sh active and continues undriven on exit 2" (region
   `DRIVER_PROBE_START`→`STEP_0A` names `driver-state.sh" active`, `CRAFT_DRIVER_STATE`,
   `continue undriven`); plus "Given the Rebuild section, when step 2 is read, then it re-runs
   driver-state.sh active". Fails: `region start /^0-driver\. / not found` (assert from
   region-slice) and the rebuild region lacks `driver-state.sh active`.
2. GREEN — insert step 0-driver and the Rebuild step-2 clause.
3. RED — "Given the cross-phase invariants, when the Driven stop bullet is read, then its last
   call writes BLOCKED through driver-state.sh blocked and §0 stops use phase id resolve"
   (region names `"$driver" blocked <phase-id>`, `active >/dev/null &&`, ``phase id `resolve` ``,
   `degrade-to-blocker`, `workspace collision`). Fails: region start not found.
4. GREEN — insert the Driven stop bullet.
5. RED — three tests: (a) in the §Done region, `indexOf('run-ledger.sh close')` <
   `indexOf('Driver hand-off')` < `indexOf('"$driver" finished')`, and the region says
   `the last ledger action` and `last tool call`; (b) the hand-off region names
   `blocked integrate "not merged <pr-or-branch>"`, `next.md`, `next.prompt`, `mktemp -d`,
   `Exit 3`, `Exit 4`; (c) in test/craft-root-shim.test.js change the run-skill count 9 → 12.
   Fails: (a)/(b) region start `/^\*\*Driver hand-off\.\*\*/` not found; (c) `12 !== 9`.
6. GREEN — rewrite the `close` sentence, insert the hand-off paragraph + block; edit
   skills/integrate step 5 wording.
7. RED — "Given the election paragraph, when read, then it is driven-only, elects the first open
   unblocked file-backlog entry top-down, writes no election for custom or absent backlogs, and
   carries no pre-approval" (names `driven runs only`, `source: file`, `first open entry`,
   `top-down`, `unblocked`, `source: custom`, `no election`; `!sut.includes('=always')`).
   Region `ELECTION_START`→`FINAL_MESSAGE`; the hand-off region `HANDOFF_START`→`FINAL_MESSAGE`
   also holds no `=always`. Fails: region start not found.
8. GREEN — insert the election paragraph.
9. RED — "Given the workspace skill step 5, when read, then the worktree is reached by absolute
   path and EnterWorktree is never used" (names `absolute path`, `cd <abs-worktree-path> &&`,
   `EnterWorktree`, `Never move the session`). Fails: `absolute path` absent from today's step 5.
10. GREEN — replace workspace step 5.
11. GUARD — test/run-record.test.js, test/craft-run.test.js, test/fold-followups.test.js pass
    unchanged (the edits add text; no pinned phrase is removed — "the last action" is not pinned).

### Gate

`bash scripts/ci.sh` (pipe to a file; grep `# fail`, `not ok`, `ci:`, `SLOP-FOUND`). Inner loop:
`node --test test/driver-contract.test.js test/craft-root-shim.test.js test/run-record.test.js test/craft-run.test.js test/fold-followups.test.js`.

### Commit

`feat(run): write the driver status and election from a driven run`

## Part 4 — Driver spec and policy-spec link

### Context

Creates `docs/contributing/specs/driver.md`; edits `docs/contributing/specs/policy.md`,
`test/living-corpus.test.js`, `test/driver-contract.test.js` (append; created in Part 3 — extend
its region-slice require with `sliceRegion` for the table-row pin).

Living corpus: scripts/living-corpus.sh enumerates every docs/contributing/specs/*.md, so the new
spec is intention-linted (`subjects` frontmatter must be a list of non-empty strings) and
test/living-corpus.test.js pins the corpus as an exact set — add
`'docs/contributing/specs/driver.md',` to `EXPECTED` between the `cursor-poc-record.md` and
`execution.md` entries (sorted order).

Frontmatter (copy policy.md's form):
```
---
subjects:
  - engine/src/driver-state.js
  - engine/src/driver-state-main.js
  - scripts/driver-state.sh
---
# Driver contract spec
```

Required sections (H2), content from the design §Design and Part 2's exit table:
- `## Activation` — `CRAFT_DRIVER_STATE` = absolute path to an existing writable per-entry dir
  the driver creates; unset/empty = not driven, craft writes nothing; set the variable again on
  `claude --bg --resume` (only the launch path was probed: env set on the `claude --bg`
  launcher reaches the session).
- `## State dir layout` — the 4-row table (`status` craft-last, `next.md` rationale, `next.prompt`
  raw prompt with every bare `--policy` token stripped, anything else = the driver's; craft never
  reads or writes it).
- `## Status grammar` — the fenced grammar block, verbatim lines:
  `finished = "FINISHED " url            url   = ^https?://\S+$`,
  `blocked  = "BLOCKED " phase ": " reason   phase = ^[a-z][a-z0-9-]*$`,
  `reason   = 1..240 chars, whitespace runs (incl. newlines) collapsed to one space, trimmed`;
  one `\n`-terminated line; split on the first space. `FINISHED` means **merged**; an unmerged
  run writes `BLOCKED integrate: not merged <pr-or-branch>`; §0 stops use phase `resolve`.
- `## Write order and atomicity` — `next.md` → `next.prompt` → `status`, each via
  `<file>.tmp.<pid>` + rename in the state dir; `status` is the run's last tool call; never
  overwritten (`lstat`, a symlink counts).
- `## Exit codes` — table `| Exit | Verb | Meaning |`, one row per code, first cell the bare
  number (`| 0 |`, `| 1 |` — `active` only, `| 2 |`, `| 3 |`, `| 4 |`, `| 5 |`), meanings as
  Part 2's table (exit 5 per PDC-1 (a)).
- `## Strip rule` — bare whitespace-delimited `--policy <value>` (value = next token on the same
  line holding `=`) and `--policy=…`; quoted/backticked mentions kept; residual risk: an
  orchestrator could still read a quoted mention as a flag, so the driver's own outward guard
  stays the real boundary.
- `## Background sessions` — the workspace reaches the worktree by absolute path and never
  calls `EnterWorktree`; recorded result: a `--bg` session wrote into a sibling git worktree with
  no prompt while a Write into the shared checkout was refused (CLI 2.1.302). Fallback for CLI
  versions where this does not hold: a driver-side `PermissionRequest` hook that allows only a
  git-registered sibling `<repo>-<slug>` worktree whose path holds no symlink.

Placeholders only for paths (`<state>`, `<repo>-<slug>`); no home-rooted path. No `gh` or
`github` token (source-hygiene scans specs) — say "verify the merge with the VCS host".

docs/contributing/specs/policy.md `## Claude binding` (:86-102) — append one line after the
ADR-128 paragraph (before `## Pi binding`): "Pre-approval never travels through an election: a
driven run's ready-to-paste next prompt has every `--policy` flag stripped (see `driver.md`)."

### TDD steps

1. RED — `test/living-corpus.test.js`: add the driver.md entry to `EXPECTED`. Fails: the
   set-equality test reports `docs/contributing/specs/driver.md` expected but not emitted.
2. RED — append to `test/driver-contract.test.js`: "Given the driver spec, when read, then it
   carries the status grammar lines and the exit-code rows for 2, 3 and 4" (region
   `/^## Status grammar/`→`/^## /` names the three grammar lines; region `/^## Exit codes/`→
   `/^## /` holds table rows starting `| 2 |`, `| 3 |`, `| 4 |`; use `sliceProse`, which collapses
   the grammar block's column alignment, so match the single-spaced phrases
   `finished = "FINISHED " url`, `phase = ^[a-z][a-z0-9-]*$`, `reason = 1..240 chars`, and
   `sliceRegion` for the table rows; whole spec names
   `CRAFT_DRIVER_STATE`, `--resume`, `PermissionRequest`). Fails: ENOENT reading driver.md.
3. RED — "Given the policy spec's Claude binding, when read, then it links the driver spec"
   (region `/^## Claude binding/`→`/^## Pi binding/` includes `driver.md` and `--policy`).
   Fails: region lacks `driver.md`.
4. GREEN — write the spec; add the policy.md line.
5. GUARD — ci.sh's intention-lint step passes over the new spec (valid `subjects`), and
   test/source-hygiene.test.js passes (no host-CLI token, no home path).

### Gate

`bash scripts/ci.sh` (pipe to a file; grep `# fail`, `not ok`, `ci:`, `INVALID`).

### Commit

`docs(specs): add the driver contract spec`
