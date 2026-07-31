# Plan — codex 0.145.0 limitation re-probe: scriptable hook trust

> Source: design doc `docs/contributing/design/codex-0145-limitation-reprobe.md` · ADRs `315-320`
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

## Seven parts, and three deviations from the design's seven

The design also proposes seven parts, but not the same seven. Each deviation is stated so a
reviewer can disagree with the reasoning rather than guess it.

| Part | Design part | Ships |
|---|---|---|
| 1 | 1 | `adapters/codex/src/hook-trust.js` + its test + its mutation wiring |
| 2 | 2 | `adapters/codex/src/config-toml-trust.js` + its test + its mutation wiring |
| 3 | — (**new**) | `adapters/codex/src/app-server-client.js` + its test + its mutation wiring |
| 4 | 3 **+ 4** | `bin/trust-hook.js`, `src/trust-hook-main.js`, its test, **and** the three falsified in-source comments |
| 5 | 5 | `docs/contributing/specs/codex-poc-record.md` |
| 6 | 6 | `adapters/codex/README.md` + its `native-surface.test.js` pins |
| 7 | 7 | `BACKLOG.md` |

**Deviation 1 — the design's Part 4 (comment-only corrections) folds into Part 4 here.** A
comment-only part cannot produce an honest RED: the only test that would fail first is a
test asserting the text of a comment, which is a smell the review phase would rightly
flag. The three comments it corrects all assert that the scriptable path does not exist
(`launch-args.js`) or that `resolveCraftRoot` has exactly two callers (`craft-root.js`) —
statements Part 4 itself falsifies by shipping the path and the third caller. Landing the
capability and the retraction of "this capability does not exist" in one commit is the
correct atomicity: no commit in the branch's history claims both.

**Deviation 2 — the app-server spawn becomes a module (new Part 3), not an untested block
inside the bin.** The design puts `spawn`, the request framing, the timeout and the child
kill directly in `bin/trust-hook.js`, which leaves the mechanism behind the "it never
hangs" requirement with no test at all — in a binding that has already shipped one
unit-green/live-broken guard. Injecting `spawn` into a `src/` module makes every branch
assertable with a fake while keeping the real `node:child_process` import confined to the
bin, so **no test spawns real `codex`**. This is more consistent with ADR 315's rationale,
not less: the ADR names two modules illustratively, and its stated reason for rejecting a
shell script is precisely that this logic be unit-testable through injected dependencies.

**Deviation 3 — the mutation-config wiring is a rider on Parts 1, 2 and 3, never its own
part.** `engine/test/mutation-config.test.js` asserts the `mutate[]` ↔ `tap.testFiles`
pairing in both directions **and** that every referenced path exists on disk. A standalone
wiring part would therefore be un-orderable: placed before Parts 1-3 it references
nonexistent files; placed after, it leaves three commits in history where the guard-gating
modules are unmutated. Each part wires its own module in its own commit, which is also
what makes each part independently revertible.

`scripts/plan-lint.sh` on this file exits **0** and prints **four** cognitive-locality
warnings, verified by running it: `adapters/codex/package.json` (Parts 1, 4),
`engine/stryker.conf.json` (4 parts — reported as shared infrastructure),
`test/every-test-file-registers.test.js` (Parts 1, 3), `test/source-hygiene.test.js`
(Parts 5, 7). Every one is a file a part **names in order to state that it does not change
it**, or — for `stryker.conf.json` — the shared registry Deviation 3 explains. They are
advisory, the exit code is unchanged. Do not "fix" the plan in response.

## Facts every part needs (verified against this tree — do not re-verify)

**Suite wiring — no `scripts/ci.sh` edit is expected by any part.** `ci.sh` carries
`run_suite adapters/codex adapters/codex/test adapters/codex`; `run_suite` enumerates
`*.test.js` under the directory with `find … | sort` and passes them as explicit argv, so
a new test file is picked up with **no** script edit. Confirmed by reading `scripts/ci.sh`
directly — it matches the design's claim exactly. `test/every-test-file-registers.test.js`
carries `{ label: 'adapters/codex', dir: path.join(ROOT, 'adapters', 'codex', 'test') }`
and recurses (skipping only `fixtures/`), so every new file must register at least one
`test`/`it`/`describe`/`suite` call outside comments and string literals.
`adapters/codex/test/registration.test.js` asserts `ci.sh` contains
`run_suite adapters/codex` and that `every-test-file-registers.test.js` contains
`'adapters', 'codex', 'test'`. Both are already true. **Touch neither file.**

**Test dialect and cwd.** `adapters/codex/test/*.test.js` is ESM:
`import { describe, it } from 'node:test'` + `import assert from 'node:assert/strict'`.
`run_suite` invokes them with cwd `adapters/codex`, so any path must be derived from
`dirname(fileURLToPath(import.meta.url))` — **never** `process.cwd()`. Titles are
Given/When/Then, bodies are AAA, the system under test is bound to a variable named `sut`.
Precedent to copy: `adapters/codex/test/git-guard-adapter.test.js`.

**Never spawn `codex`, never touch a real `$CODEX_HOME`.** `codex` IS installed on this
machine. `adapters/pi/test/cli.test.js` is the cautionary precedent: a real-binary spawn
hangs the suite for tens of minutes. `codex app-server` additionally never exits on its
own. Every process and filesystem boundary in Parts 3 and 4 is injected; the tests pass
fakes. The single real `node:child_process` import in the whole change lives in
`adapters/codex/bin/trust-hook.js`, which no test imports.

**Never emit `--dangerously-bypass-hook-trust` or `bypass_hook_trust`, on any path.**
Note that `adapters/codex/src/launch-args.js` legitimately carries
`const FLAG_BYPASS_HOOK_TRUST = '--dangerously-bypass-hook-trust';` as an opt-in default-off
flag. Any structural text scan asserting the ban must therefore be **scoped to the four
files this change authors**, never to `adapters/codex/src/` as a whole.

**Mutation config — `engine/stryker.conf.json`.** Today `mutate[]` carries
`engine/src/**/*.js` plus eight concrete `adapters/*/src/*.js` paths;
`tap.testFiles` carries `engine/test/**/*.test.js` plus the eight matching
`adapters/*/test/*.test.js` paths. `engine/test/mutation-config.test.js` enforces four
things: every `adapters/` entry in `mutate[]` has `sourcePath.replace('/src/','/test/').replace(/\.js$/,'.test.js')`
in `tap.testFiles`; every `adapters/` entry in `tap.testFiles` has a matching `mutate[]`
source; no `adapters/` test entry contains `*`; every referenced path exists on disk.

**Repo-level gates that read what these parts touch:**

- `test/source-hygiene.test.js` scans an explicit path list that **includes**
  `docs/contributing/specs` and **excludes** `adapters/**`, `BACKLOG.md`, and
  `docs/contributing/plan`. Class A bans `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`;
  Class B bans `\bgh\b|\bgithub\b`. Both run through `grep -rEn` — **case-sensitive**.
  Verified in a throwaway file: the literal `https://github.com/adapters/codex.git` **trips
  Class B**, while `GitHub` in prose does not. Part 4 must obey this; see its block.
- `adapters/codex/test/native-surface.test.js` runs three hygiene loops over
  `authoredSurfaces()` (which includes `README.md`, and no `.js` file): no
  `/!`[^`]*`/` shell-injection expansion, no `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`
  provenance reference, and no bare `${CLAUDE_PLUGIN_ROOT}` once every
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` occurrence is stripped. Test files are **not**
  scanned, so a fixture may carry the raw shim string.
- `scripts/backlog-lint.sh` asserts only five headings exist:
  `## Status`, `## Candidate phases`, `## Parked`, `### Condition-gated`, `### Closed`.
- `intention-lint` runs over `scripts/living-corpus.sh`'s corpus (which includes
  `docs/contributing/specs/*.md` and `BACKLOG.md`). Check 1 skips any page whose
  frontmatter carries no `subjects:` key — the poc record has none, and none is added.
  Check 2 resolves the backticked pointers on `BACKLOG.md`'s `> SoT —` block (lines 7-8).
  **No part touches that block.**
- `prose-lint` is advisory (`.claude/workflow.md` declares no `hygiene:` key, so
  `engine/bin/hygiene-gate.js` resolves `advisory`) and runs over every touched `*.md`
  **except** `docs/contributing/{adr,design,archive,specs,prd}`. Its ban list is
  `delve`, `leverage`, `seamless`, `robust`, `it's important to note`, `in conclusion`.
  `README.md`, `BACKLOG.md` and this plan are read by it; keep the prose clean anyway.
  **This plan trips all six advisorily, on purpose** — the line above quotes the ban list
  verbatim so an implementer writing README or backlog prose does not have to go and look
  it up. The gate is advisory, the six `SLOP-FOUND` lines are self-reference, and two
  shipped plans in this directory already carry exactly the same six. Do not triage them.
- `docs-structure-lint` only rejects basenames matching `SPIKE.md`, `SC5-*`, or
  `*-P[0-9]*-*` outside `docs/*/archive/`. Nothing here matches.

**`resolveCraftRoot` — the shared self-locator.** `adapters/codex/src/craft-root.js`
exports `resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync })`. It up-walks
`const UP_LEVELS_TO_REPO_ROOT = ['..', '..', '..']` (line 16) from the caller's own
directory, asserts the result exists and contains `engine/bin`, and returns
`fsOps.realpathSync(root)`. `adapters/codex/bin/` sits at exactly the same depth as
`adapters/codex/src/` and `adapters/codex/hooks/`, so the constant is reused **unchanged**.

**Bin shim shape.** Every `engine/bin/*.js` is six lines:

```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/<name>-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

The self-invocation guard is why importing the module from a test never runs it.

**No provenance refs anywhere in source, test, README, config or the poc record** —
no ADR number, no phase number, no `Part N`, no backlog number.

**Pinned protocol values** (from the live 0.145.0 re-probe; these are the only pinned
facts — nothing beyond them may be invented):

| Item | Value |
|---|---|
| request 1 | `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"…","version":"…"}}}` |
| request 2 | `{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwds":["<repo>"]}}` |
| id-2 response envelope | `{"id":2,"result":{"data":[{"cwd":"<abs>","hooks":[…],"warnings":[],"errors":[]}]}}` — one `data` entry **per requested cwd**; all four entry fields `required` |
| `errors[]` element | `{ message, path }` — a non-empty `errors[]` means codex failed to load some hook config |
| `HookMetadata` fields | `key`, `currentHash`, `trustStatus`, `enabled`, `source`, `sourcePath`, `handlerType`, `matcher`, `timeoutSec`, `isManaged`, `command` |
| `key` shape | `"<ABSOLUTE $CODEX_HOME>/config.toml:pre_tool_use:0:0"` — carries `/` **and** `:` |
| `currentHash` shape | `"sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4"` |
| `trustStatus` | `managed` \| `untrusted` \| `trusted` \| `modified` |
| write shape | `[hooks.state."<key>"]` newline `trusted_hash = "<currentHash>"` |
| registered `command` | `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js` |

**Two things the re-probe did NOT pin — design around them, never guess:**

1. Whether `hooks/list` reports `command` **raw** or **shell-expanded**. Both variants
   must match (Part 1).
2. Whether `hooks/list` requires an **authenticated `CODEX_HOME`**. The re-probe ran with
   auth copied in and never tested the unauthenticated case. The tool surfaces an
   app-server error verbatim instead of interpreting it, and the README orders the trust
   step after `codex login` (Part 6).

The id-2 response envelope is **not** on that list: it is pinned by the live response and
by the generated protocol schema, and is in the table above. A shape that does not match it
still throws — the fail-loud posture holds for a protocol change, not for an unknown.

## Part 1 — `hooks/list` transport and the trust plan

### Context

**Ships:** NEW `adapters/codex/src/hook-trust.js`, NEW
`adapters/codex/test/hook-trust.test.js`, and two lines in `engine/stryker.conf.json`.

**Public-surface decision, made here:** all four exports are **internal to the codex
binding**. `adapters/codex/` has no barrel, no index, no facade and no exhaustiveness
switch, and `adapters/codex/package.json` (`{name, type:"module", private, scripts:{test}}`)
declares no `exports` or `bin` field and gains none. The **only** downstream registry that
must be paid in this same commit is `engine/stryker.conf.json`; `scripts/ci.sh` and
`test/every-test-file-registers.test.js` pick the new test file up with no edit. There is
no other surface gate to pre-pay.

**Module — `adapters/codex/src/hook-trust.js`, pure: no `node:fs`, no `node:child_process`,
no `process`.** Four exports:

- `buildRequests({ cwd }) → string[]` — exactly two newline-terminated JSON-RPC lines, in
  order, matching the pinned table above byte-for-byte in method names and ids
  (`initialize` id `1`, `hooks/list` id `2`), with `params.cwds` equal to `[cwd]`.
  `clientInfo.name` and `clientInfo.version` are module-level named constants (suggested:
  a `craft`-prefixed client name and a plain semver string); no literal is written at a
  call site. **Nothing beyond these two lines is emitted** — `notifications/initialized`
  and every other method is unpinned and therefore not invented. A missing or non-string
  `cwd` throws rather than emitting `["undefined"]`.
- `parseHooksList(stdoutText, { requestId }) → { hooks, warnings, errors }` — splits on
  `\n`, drops blank lines, `JSON.parse`s each remaining line, and reads the response object
  whose `id === requestId`. Selection is **by id, never by position**: notifications and the
  `initialize` response interleave freely. Throw paths, each with the observed value in the
  message: a JSON-RPC `error` member on the matched response (throw with the server's own
  `error.message`); a line that does not parse as JSON (throw — a silently dropped line is
  exactly how a "0 hooks found" false negative would look); no response carrying
  `requestId`.
  **The envelope is pinned** (live response + the generated `HooksListResponse` schema,
  where all four entry fields are `required`):

  ```json
  {"id":2,"result":{"data":[{"cwd":"<abs>","hooks":[/* HookMetadata */],"warnings":[],"errors":[]}]}}
  ```

  `result.data` is one entry **per requested cwd**. `buildRequests` always sends exactly
  one cwd, so exactly one entry is the invariant: a `data` that is not an array of length
  one **throws**, naming the observed length. Hooks are `entry.hooks`; `warnings` and
  `errors` are returned alongside them, never dropped. `errors[]` carries
  `{ message, path }` per entry. Any shape that does not match — `result` not an object,
  `data` absent, an entry missing any of `cwd`/`hooks`/`warnings`/`errors`, or any of the
  three arrays not an array — **throws, naming the observed top-level keys**. Never return
  an empty `hooks` from an unrecognised shape: an empty list reads as "no craft hook
  registered", which the caller would then refuse over, hiding a protocol change behind a
  plausible message.
- `selectCraftHook(hooks, { errors = [] } = {}) → HookMetadata` — matches on `command`
  **containing the path tail** `/adapters/codex/hooks/craft-guard.js`. Exactly one match
  returns it; **zero throws, two-or-more throws**, each message naming what it saw
  including every candidate's `sourcePath`.
  **A non-empty `errors` changes the zero-match message, and that is load-bearing.** A
  non-empty `errors[]` means codex failed to load some hook configuration — precisely the
  case where craft's guard could be missing because its config never parsed. The zero-match
  throw must then **quote each `{ message, path }`** rather than reporting a bare "no craft
  hook registered", which would send the operator looking for a registration bug that is
  really a config-load failure. With an empty `errors`, the plain zero-match message stands.
  Matching on the tail rather than a realpath'd absolute path is load-bearing: codex runs
  hook commands through a shell that expands both `${CRAFT_ROOT:-…}` and the POSIX `:-`
  default, and whether `hooks/list` echoes the command raw or expanded was **not pinned**.
  The tail is invariant under both. The residual is stated rather than hidden — the tail
  also matches a *different* craft checkout's guard, which is still fail-closed craft code
  (over-restriction, never a bypass), and two registrations present as a multi-match and
  are refused. Refusing is right: codex layers user (`$CODEX_HOME/config.toml`) over
  project (`.codex/`), so a double registration means two denials and an ambiguous answer
  to which config file holds the trust. The failure this binding cannot tolerate is the
  silent one; a loud refusal naming both `sourcePath`s leaves a fixable problem.
- `planTrust(hook) → { action, key, hash, from, enabled }` with `action ∈ 'write' | 'noop'`:

  | `trustStatus` | `action` | rationale |
  |---|---|---|
  | `trusted` | `noop` | already trusted; the idempotent re-run |
  | `untrusted` | `write` | the install case |
  | `modified` | `write` | craft changed its own hook definition; re-trust |
  | `managed` | `noop` | enterprise/managed policy; a user-scope write is not craft's to make |
  | anything else | **throw** | an unknown status is not a benign default |

  `key` and `hash` come from the hook's `key` / `currentHash`. `from` is the observed
  `trustStatus` string — the state being transitioned out of. It is **not** a previous
  hash: `hooks/list` does not report one, and inventing one would be fabrication.
  `enabled` rides along because `hooks/list` reports it and it is decision-bearing — a
  hook that is registered, trusted and **disabled** is the "looks installed, enforces
  nothing" state Part 4 refuses on. `planTrust` performs no I/O and never writes: it
  returns an intent Part 4 executes. That CQS split is what lets every branch be asserted
  without a `config.toml`.

**Fail-closed posture.** Every throw here becomes a non-zero exit with a reason in Part 4.
The guard fails closed by denying; this tool fails closed by refusing to write and saying
why — never by writing a best guess.

**Fixtures — build them inside the test file** (no `fixtures/` directory; the codex suite
has none and `every-test-file-registers.test.js` skips such directories anyway). Use the
real shapes:

- `key`: `/fixture/codex-home/config.toml:pre_tool_use:0:0`
- `currentHash`: `sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4`
- raw `command`: `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js`
- expanded `command`: `node /fixture/repo/adapters/codex/hooks/craft-guard.js`
- a foreign hook `command` for the zero-match and multi-match cases, e.g.
  `node /fixture/repo/other/hooks/something.js`
- the **real response envelope**, built once as a test helper so every case reuses it:
  `{"jsonrpc":"2.0","id":2,"result":{"data":[{"cwd":"/fixture/repo","hooks":[…],"warnings":[],"errors":[]}]}}`.
  Do not flatten it into a bare array in the fixtures — a fixture that omits the wrapper
  would let a parser that ignores `data` pass.
- an errors fixture: the same envelope with
  `"errors":[{"message":"failed to load hook config","path":"/fixture/codex-home/config.toml"}]`
  and `"hooks":[]`

**Mutation wiring, in this same commit — `engine/stryker.conf.json`:** append
`"adapters/codex/src/hook-trust.js"` to `mutate[]` and
`"adapters/codex/test/hook-trust.test.js"` to `tap.testFiles`. Both directions of
`engine/test/mutation-config.test.js` are then satisfied and both paths exist on disk.
Add **no** glob.

### TDD steps

1. **RED** — `adapters/codex/test/hook-trust.test.js`, `describe('buildRequests()')`:
   *Given a repo root cwd, when buildRequests runs, then it emits the initialize line then
   the hooks/list line, each newline-terminated, with ids 1 and 2 and params.cwds equal to
   the cwd.* Parse each emitted line back with `JSON.parse` and assert on the object, not
   on a string literal. Add *Given a missing cwd, when buildRequests runs, then it throws*.
   Expected failure: `Cannot find module '../src/hook-trust.js'`.
2. **RED** — `describe('parseHooksList()')`: the id-2 response selected across interleaved
   notifications, returning `hooks` from `result.data[0].hooks` **plus** its `warnings` and
   `errors`; the same over an out-of-order stream where the id-2 response arrives **before**
   id-1; a JSON-RPC `error` member throws with the server's message; a malformed line
   throws; a stream with no id-2 response throws; a `result` with no `data` throws naming
   its keys; a `data` array of length two throws naming the length; an entry missing
   `errors` throws. Expected failure: same module-not-found, then wrong behaviour.
3. **RED** — `describe('selectCraftHook()')`: single match on the **raw** command form
   returns it; single match on the **shell-expanded** absolute form returns it (this pair
   is the regression test for the one unpinned field the design routes around — without it
   the matcher would be green only against whichever variant the author imagined); zero
   matches with an empty `errors` throws the plain message; zero matches with a **non-empty**
   `errors` throws a message quoting each error's `message` and `path`; two matches throws
   with both `sourcePath`s in the message.
4. **RED** — `describe('planTrust()')`: five cases — `trusted`→`noop`, `untrusted`→`write`,
   `modified`→`write`, `managed`→`noop`, and an unknown status throws. Each asserts `key`,
   `hash`, `from` and `enabled` are carried through.
5. **GREEN** — write `adapters/codex/src/hook-trust.js` with the four exports above,
   minimally. Named constants for the two ids, the two method names, the client identity,
   the guard path tail and the four known statuses. No function over 20 lines, no nesting
   past two levels, early returns.
6. **GREEN** — add the two `engine/stryker.conf.json` entries; run
   `node --test engine/test/mutation-config.test.js` and see it stay green.
7. **REFACTOR** — collapse any duplicated line-splitting or status-mapping into a single
   named helper; verify every throw message names the offending value; confirm no
   `node:fs`, `node:child_process` or `process` reference exists in the module.

### Gate

```
node --test adapters/codex/test/hook-trust.test.js
node --test adapters/codex/test/*.test.js
node --test engine/test/mutation-config.test.js
node --test test/every-test-file-registers.test.js
```

All green before committing. `bash scripts/ci.sh` is the phase-boundary gate.

### Commit

`feat(codex): read hooks/list and plan the guard hook trust action`

## Part 2 — quoted-key `config.toml` upsert

### Context

**Ships:** NEW `adapters/codex/src/config-toml-trust.js`, NEW
`adapters/codex/test/config-toml-trust.test.js`, and two lines in
`engine/stryker.conf.json`.

**Public-surface decision:** both exports are **internal to the codex binding**. Same
reasoning and same single downstream registry as Part 1 — `engine/stryker.conf.json`, paid
in this commit. No barrel, no facade, no package-manifest field.

**There is no TOML parser in this repo, and none is added.** `engine/package.json`
`dependencies` is `{"js-yaml": "^4.1.0"}` and nothing else. The target subset is one table
with one key, written into a file the operator owns, so a targeted upsert is written
instead of a parser — a parser would rewrite the operator's whole `config.toml`.

**Exports**

- `toQuotedTomlKey(key) → string` — wraps in `"` after escaping, in this order and no
  other: `\` → `\\` **first** (or the escape escapes itself), then `"` → `\"`, then every
  control character (U+0000–U+001F and U+007F) → `\uXXXX` with four uppercase hex digits.
  Sequential `.replace()` calls are safe **in that order only**, because a control
  character can never be produced by the two preceding steps. The `/` and `:` in the pinned
  key need no escape but **do** make the quoted form mandatory: a bare key would be read as
  dotted-path segments.
- `upsertTrustedHash(tomlText, { key, hash }) → string` — returns new text; never mutates
  its input, never deletes, never reorders, never rewrites any other line.
  - Header line is `[hooks.state.<quoted>]` where `<quoted>` is `toQuotedTomlKey(key)`.
    Locate it by exact match on the trimmed line.
  - The table's extent runs from the line after the header to the next line-initial `[`
    (or end of text).
  - Within that extent, replace the `trusted_hash` assignment (a line matching
    `/^\s*trusted_hash\s*=/`) with `trusted_hash = "<escaped hash>"`. If the table exists
    **without** a `trusted_hash`, insert the assignment immediately after the header. If
    the table contains **more than one** `trusted_hash` assignment, **throw** — the file is
    already invalid TOML (duplicate key), and silently rewriting half of it is worse than
    refusing.
  - When the table is absent, append the block at end of text, preceded by exactly one
    blank line, first adding the terminating newline if the input lacks one, and ending
    with a trailing newline.
  - Empty or whitespace-only input yields a file containing just the block, with no
    leading blank line.
  - **The `hash` value is emitted through the same escaper as the key.** A quoted TOML key
    and a TOML basic string obey identical escaping rules, so reusing `toQuotedTomlKey` for
    the value closes the hole where a `"` arriving in `currentHash` would break the
    operator's config. Do not write a second escaper.

**Edge behaviour, stated because each one is a silent-corruption route**

- **Idempotence is byte-level**: `upsert(upsert(t)) === upsert(t)`, asserted directly.
- **A pre-existing table with a different hash** is updated in place — this is the
  `modified` path. It must not produce a second table with the same key; a TOML
  duplicate-key error would break the operator's whole config, which is strictly worse
  than an untrusted hook.
- **The key is machine-specific.** It embeds the absolute `$CODEX_HOME/config.toml` path
  and the `:pre_tool_use:0:0` positional suffix, so it can never be pre-baked into
  `adapters/codex/config.template.toml` and must always be read live. A template constant
  would be wrong on every other machine, and wrong on the same machine as soon as a hook is
  registered ahead of craft's.
- **Stale entries are never pruned.** If the positional suffix shifts, `hooks/list` reports
  craft's hook under a new untrusted key; the tool trusts the new key and leaves the orphan
  alone. Deleting keys out of a user's config is a larger authority than trusting one hook,
  and the orphan is inert because its key names a hook that no longer exists.
- **The subset the scanner understands is narrow, and that is written down rather than
  assumed away.** Table boundaries are detected by line-initial `[`, so a `config.toml`
  whose multi-line basic string contains a line starting with `[` would fool the scan. The
  exposure is confined to the *replace* path, which only runs when the exact quoted header
  line was already found; the append path writes at end of text and cannot mis-detect
  anything. If codex's config ever grows shapes this subset cannot read, a real parser is
  the escape — not a widened regex.

**Mutation wiring, in this same commit — `engine/stryker.conf.json`:** append
`"adapters/codex/src/config-toml-trust.js"` to `mutate[]` and
`"adapters/codex/test/config-toml-trust.test.js"` to `tap.testFiles`. No glob.

### TDD steps

1. **RED** — `adapters/codex/test/config-toml-trust.test.js`,
   `describe('toQuotedTomlKey()')`: a table-driven matrix over the pinned key, a
   `$CODEX_HOME` path containing `"`, one containing `\`, and one containing a control
   character (a literal tab, U+0009 — which the escaper must render as the four-hex-digit
   form for U+0009, not as TOML's shorthand tab escape, because the escaper maps every
   control character uniformly), each asserting the exact emitted string. Then two
   invariants
   applied to every matrix row — the emitted value opens and closes with `"`, and carries
   no unescaped `"` between them. There is **no round-trip assertion**: no unescaper
   exists, and writing one only to satisfy a test would be a second implementation of the
   same rules. Expected failure: `Cannot find module '../src/config-toml-trust.js'`.
2. **RED** — `describe('upsertTrustedHash()')`, one case per route: empty input; a
   whitespace-only input; a file carrying unrelated tables (assert every unrelated line
   survives verbatim); a file already carrying the table with the **same** hash (assert
   byte-identical output); a file carrying the table with a **different** hash (assert the
   value is replaced **and** the output contains exactly one occurrence of the table
   header); a file carrying the table with no `trusted_hash` key; a file whose table
   carries two `trusted_hash` assignments (assert it throws); an input with no terminating
   newline (assert the appended block is still correctly separated and terminated).
3. **RED** — *Given any of the above inputs, when upsertTrustedHash is applied twice, then
   the second application is byte-identical to the first.* Drive it over the same matrix.
4. **GREEN** — write `adapters/codex/src/config-toml-trust.js`. Named constants for the
   table-header prefix, the assignment key name, and the control-character bound. Small
   functions, early returns, no mutation of the input string.
5. **GREEN** — add the two `engine/stryker.conf.json` entries; `mutation-config.test.js`
   stays green.
6. **REFACTOR** — extract the "find the table extent" scan into one named helper shared by
   the replace and insert routes; confirm the module imports nothing from `node:fs`.

### Gate

```
node --test adapters/codex/test/config-toml-trust.test.js
node --test adapters/codex/test/*.test.js
node --test engine/test/mutation-config.test.js
node --test test/every-test-file-registers.test.js
```

All green before committing. `bash scripts/ci.sh` is the phase-boundary gate.

### Commit

`feat(codex): upsert the hook trust hash into config.toml`

## Part 3 — the app-server client: spawn, frame, time out, kill

### Context

**Ships:** NEW `adapters/codex/src/app-server-client.js`, NEW
`adapters/codex/test/app-server-client.test.js`, and two lines in
`engine/stryker.conf.json`. Independent of Parts 1 and 2 — it shares no symbol with either
— but it is placed after them because Part 4 consumes all three.

**Why this is a module and not eight lines inside `bin/trust-hook.js`.** The framing,
timeout and kill are the mechanism behind the "it never hangs" requirement, and
`codex app-server` never exits on its own: an unkilled child or an unbounded read stalls
craft's own tooling. An untested block of exactly that logic, inside a binding that has
already shipped one unit-green/live-broken guard, is the same failure shape a second time.
Injecting `spawn` makes every branch of it assertable with a fake, and **no test spawns
real `codex`** — the module never imports `node:child_process`; the bin binds the real one.

**Public-surface decision:** the export is **internal to the codex binding**. No barrel, no
facade, no `package.json` field. The one downstream registry paid in this same commit is
`engine/stryker.conf.json`; `ci.sh` and `test/every-test-file-registers.test.js` need no
edit.

**Module — `adapters/codex/src/app-server-client.js`. One export, a factory, so the bin
binds the real `spawn` exactly once:**

```
createAppServerRunner({ spawn }) → ({ requests, cwd, timeoutMs, responseId }) => Promise<string>
```

The returned runner resolves with the **accumulated stdout text**, which Part 1's
`parseHooksList` then parses. The client does not interpret the payload beyond finding its
terminator — parsing strictness stays in one place.

Named module constants: `APP_SERVER_COMMAND = 'codex'`, `APP_SERVER_ARGS = ['app-server']`,
`DEFAULT_TIMEOUT_MS` (a `timeoutMs` argument overrides it).

**Behaviour, branch by branch — each one is a test below:**

1. `spawn(APP_SERVER_COMMAND, APP_SERVER_ARGS, { cwd })`.
2. Write every line of `requests` to the child's stdin, then **`end()` stdin immediately**.
   A closed stdin is what makes it impossible for the child to fall back to an interactive
   prompt — the trap that made a failed `git clone` look like a hang during the re-probe.
   Nothing is ever written to the child afterwards.
3. Accumulate stdout with `setEncoding('utf8')` into a buffer. Split on `\n`, process only
   **complete** lines, and keep the trailing fragment in the buffer — a chunk boundary
   mid-line must not be read as a terminator or a parse failure.
4. Resolve as soon as either (a) a complete line parses to an object whose `id ===
   responseId`, or (b) a complete line **fails** to parse. Case (b) resolves rather than
   rejecting on purpose: the accumulated text is handed to `parseHooksList`, whose strict
   parser produces the precise message. Rejecting here would duplicate that rule in two
   places and give a worse diagnostic than a timeout.
5. Timeout: on expiry, kill the child and **reject with an error naming the timeout and the
   elapsed milliseconds**. Never resolve with partial text — a fallback to "assume
   untrusted" is exactly the silent degradation this binding refuses.
6. A child `error` event (a `spawn` that fails, e.g. `codex` not on PATH) rejects naming it.
7. A child `exit` before the response rejects naming the exit code and any collected
   stderr.
8. **The child is killed exactly once on every route** — success, timeout, child error,
   early exit — and the promise settles exactly once. Implement as a single `finish()`
   guard both the resolve and reject paths route through; a double `kill()` or a
   settle-after-settle is the bug class this shape exists to prevent.

**Test harness — `adapters/codex/test/app-server-client.test.js`.** Build a fake child in
the test file: an object with `stdin` (`write` recording calls, `end` recording that it was
called), `stdout` and `stderr` as tiny emitters the test drives (`setEncoding`, `on`), an
`on(event, handler)` registry for `error`/`exit`, and a `kill()` counter. The fake `spawn`
records its `(command, args, options)` and returns that child. Drive the clock with an
injected-free approach: pass a small `timeoutMs` and let the real timer fire, or emit the
response synchronously before it — do **not** add a clock dependency the production code
would otherwise not need.

**Mutation wiring, in this same commit — `engine/stryker.conf.json`:** append
`"adapters/codex/src/app-server-client.js"` to `mutate[]` and
`"adapters/codex/test/app-server-client.test.js"` to `tap.testFiles`. No glob.

### TDD steps

1. **RED** — *Given a scripted stream whose id-2 response arrives normally, when the runner
   runs, then it resolves with the accumulated stdout, writes both request lines to stdin,
   ends stdin, and kills the child exactly once.* Assert the `spawn` call carried
   `'codex'`, `['app-server']` and the given `cwd`. Expected failure:
   `Cannot find module '../src/app-server-client.js'`.
2. **RED** — *Given stdout that arrives split mid-line across two chunks, when the runner
   runs, then it still resolves on the reassembled response line.* Emit the response JSON
   as two chunks that break inside the line, and assert the resolved text is the full line.
3. **RED** — *Given a stream where no response ever arrives, when the timeout elapses, then
   the runner rejects with an error naming the timeout, and the child is killed exactly
   once.* Use a small `timeoutMs`.
4. **RED** — *Given a child that exits non-zero before responding, when the runner runs,
   then it rejects naming the exit code and the collected stderr.*
5. **RED** — *Given a spawn that emits an `error` event, when the runner runs, then it
   rejects naming the error.*
6. **RED** — *Given a complete line that is not valid JSON, when the runner runs, then it
   resolves with the accumulated text* (so the caller's strict parser owns the message),
   *and the child is killed exactly once.*
7. **RED** — *Given a stream that emits the response and then more data, when the runner
   runs, then the promise settles once and `kill()` was called once.* This is the
   double-settle pin.
8. **GREEN** — write `adapters/codex/src/app-server-client.js`. Single `finish()` guard,
   named constants, no `node:child_process` import, no function over 20 lines.
9. **GREEN** — add the two `engine/stryker.conf.json` entries; `mutation-config.test.js`
   stays green.
10. **REFACTOR** — confirm the line-buffering helper is one named function used by the one
    `data` handler, and that every reject path passes through `finish()`.

### Gate

```
node --test adapters/codex/test/app-server-client.test.js
node --test adapters/codex/test/*.test.js
node --test engine/test/mutation-config.test.js
node --test test/every-test-file-registers.test.js
```

All green before committing. `bash scripts/ci.sh` is the phase-boundary gate.

### Commit

`feat(codex): add the injected-spawn app-server client with a bounded read`

## Part 4 — the entry point, plus the three claims it falsifies

### Context

**Ships:** NEW `adapters/codex/bin/trust-hook.js` (the first `bin/` under any adapter),
NEW `adapters/codex/src/trust-hook-main.js`, NEW
`adapters/codex/test/trust-hook-main.test.js`, and comment-only edits to three existing
files. **Depends on Parts 1, 2 and 3** — it imports all three modules.

**Public-surface decision:** `main` is **internal to the codex binding**; the bin file is
the operator-facing surface, invoked **by path**
(`node adapters/codex/bin/trust-hook.js`, `node adapters/codex/bin/trust-hook.js --check`)
with no `CRAFT_ROOT` needed, since the entry self-locates through `resolveCraftRoot`. Its
downstream surface gates, both deliberately deferred to a later part and named here so
nobody thinks they were forgotten: the adapter README documents the command (Part 6) and
the backlog records it as delivered (Part 7). `adapters/codex/package.json` gains **no**
`bin` field — an in-place adapter is invoked by path, and adding one would imply an
install step this change does not ship. `.gitignore` does not exclude `adapters/**`, so
the new directory is tracked with no edit. `trust-hook-main.js` is orchestration over
injected dependencies and **stays out of `engine/stryker.conf.json` `mutate[]`**,
consistent with how the adapter's other entry-shaped modules are treated — so
`mutation-config.test.js` needs no edit in this part.

**`adapters/codex/src/trust-hook-main.js` — signature**

```
main(argv, {
  runAppServer,   // ({ requests, cwd, timeoutMs, responseId }) => Promise<string>
                  // accumulated stdout. `requests` already carries the cwd inside the
                  // hooks/list params; the `cwd` here is the child process's own working
                  // directory, the same repo root. `responseId` is the id whose arrival
                  // ends the read — Part 3's client owns the framing, `main` names the id.
  readConfig,     // (path) => string   ('' when the file is absent)
  writeConfig,    // (path, text) => void
  guardScriptExists, // (path) => boolean
  resolveRoot,    // () => string
  env,            // { CODEX_HOME, HOME }
  stdout, stderr,
}) => Promise<number>   // exit code
```

`guardScriptExists` is **added by this plan**. The design states the module is
"orchestration, all I/O injected" and its flow step 2 refuses when the guard script is
absent, but the signature it prints carries no existence checker — so as written, `main`
would have to reach for `node:fs` directly and break its own injection rule and the "every
seam is unit-testable through injected dependencies" requirement. The bin binds it to
`existsSync`; the tests pass a predicate. Nothing else about the signature changes.

**Exit codes — named constants, pinned here because the design says only "non-zero":**
`EXIT_OK = 0`; `EXIT_UNTRUSTED = 1` (`--check` reporting `untrusted` or `modified`);
`EXIT_REFUSED = 2` (every refusal: no home, missing guard script, zero or multiple
matches, a disabled hook, an app-server error, a timeout, an unrecognised argv entry).
The split lets CI distinguish "not trusted yet" from "the tool could not decide" — two
outcomes that call for different operator actions.

**Flow**

1. Parse `argv`. `--check` selects read-only mode. **Any other argv entry is a loud
   `EXIT_REFUSED` usage error** — silently ignoring a typo like `--chek` would write when
   the operator asked to check.
2. `codexHome` = `env.CODEX_HOME` when non-empty, else `<env.HOME>/.codex`. With **both**
   unset or empty, refuse before touching the filesystem — never resolve a path against an
   `undefined` segment and write a `config.toml` somewhere nobody asked for.
   `configPath` = `<codexHome>/config.toml`.
3. `guardScriptPath` = `<resolveRoot()>/adapters/codex/hooks/craft-guard.js`. Refuse when
   `guardScriptExists(guardScriptPath)` is false. This is a **precondition check, not the
   matcher** (Part 1 matches on the
   path tail): trusting a hook definition while this checkout's guard script is missing or
   misplaced would register trust for something that cannot run.
4. `runAppServer` with `buildRequests({ cwd: resolveRoot() })` and the hooks/list
   `responseId` → `parseHooksList` → `selectCraftHook(hooks, { errors })` → `planTrust`.
   **Report every `warnings[]` entry on stdout** — they are non-fatal but they are the only
   signal an operator gets that codex had something to say about the hook configuration,
   and swallowing them here is how a warning becomes invisible. `errors[]` is passed into
   `selectCraftHook`, which quotes it on a zero match. Echo the matched hook's `sourcePath`
   and `command` to stdout **before any write**, so what is being trusted is visible rather
   than inferred.
5. Refuse when the matched hook reports `enabled === false` — in **both** modes. Trusting
   a disabled hook yields a binding that reports success and enforces nothing.
6. `--check`: report the plan, never call `writeConfig`, return `EXIT_OK` for `trusted`
   and `managed`, `EXIT_UNTRUSTED` for `untrusted` and `modified`.
7. Write mode: `noop` → report the status, return `EXIT_OK`. `write` → `readConfig` →
   `upsertTrustedHash` → `writeConfig` → report `key` and `from`→`hash`, return `EXIT_OK`.
8. Any throw → a **single-line** reason on stderr, return `EXIT_REFUSED`. No stack traces.
   The config is written once, whole, or not at all.

All operator output carries one fixed named prefix constant (suggested `trust-hook: `), so
the lines are greppable.

**`adapters/codex/bin/trust-hook.js` — a thin shim, and the only place the real `spawn` is
bound.** It mirrors `engine/bin/stub-lint.js` (self-invocation guard so importing it in a
test never runs it), with **one deliberate divergence**: every existing `engine/bin/*.js`
calls a synchronous `main` and passes its return straight to `process.exit`. This `main` is
async, so the bin awaits it and exits with the resolved code, and a **rejected promise
exits `EXIT_REFUSED` with the reason on stderr** rather than surfacing as an unhandled
rejection.

The bin constructs the real dependency object and nothing else — it carries **no decision
and no framing logic**:

- `runAppServer` = `createAppServerRunner({ spawn })` from Part 3, with `spawn` imported
  from `node:child_process`. This import is the single point in the whole change where a
  real `codex` process can be created; every branch of what happens next is unit-tested in
  Part 3 against a fake.
- `readConfig` / `writeConfig` over `node:fs` — `readConfig` returns `''` when the file is
  absent (`ENOENT` is the install case, not an error; any other error rethrows).
- `guardScriptExists` = `existsSync`.
- `resolveRoot` = `() => resolveCraftRoot(import.meta.url)`.
- `env: process.env`, and the two streams.

Nothing in this file needs a test of its own: strip the dependency bindings and what remains
is the `engine/bin` shim archetype, byte-for-byte in shape.

**The three falsified in-source claims, corrected in this same commit — comments only, no
behaviour change:**

- `adapters/codex/src/launch-args.js`, the comment block above the
  `if (bypassHookTrust)` branch. It currently reads
  `// Open question, deliberately not assumed either way: whether an *untrusted* hook in
  headless mode fails loudly or silently no-ops.` — **falsified**: it silently no-ops,
  confirmed on both 0.144.6 and 0.145.0. Replace it with that statement. The paragraph
  above it says the intended path is "a one-time trust of the craft guard hook at install
  time"; reword it to say that step is now scriptable. `buildLaunchArgs({ workingDir,
  bypassHookTrust = false })` keeps its signature, its default, its `FLAG_BYPASS_HOOK_TRUST`
  constant and its opt-in branch **untouched**.
- `adapters/codex/src/git-guard-adapter.js`, the comment above `bridgeExecutedCommand`
  currently opens `The real codex 0.144.6 PreToolUse payload is Claude-shaped`. The 0.145.0
  payload dump re-confirms `tool_input.command` is still the executed field, so **no code
  changes**; refresh only the version the comment names. The new payload fields (`model`,
  `permission_mode`, `tool_use_id`, `turn_id`) are additive and ignored — `adaptCodexEvent`
  destructures only `{ tool_name, tool_input, cwd }`. Say so, so a later reader does not
  "add support" for fields nothing consumes.
- `adapters/codex/src/craft-root.js` line 13, `// Both callers of this resolver —
  adapters/codex/src/*.js and adapters/codex/hooks/*.js — sit exactly three directories
  below the repo root`. Add the third caller, `adapters/codex/bin/*.js`. `UP_LEVELS_TO_REPO_ROOT`
  is **unchanged** — the new directory is at the same depth.

Comments are prose only: no version-provenance reference beyond the plain version number,
no ADR, phase or backlog reference.

**Test — `adapters/codex/test/trust-hook-main.test.js`.** Build a small in-test harness:
a fake `runAppServer` returning canned stdout, an in-memory config (a `readConfig` closure
over a string plus a `writeConfig` recording every call), a fake `resolveRoot` returning a
synthetic root, a `guardScriptExists` predicate the test controls, and string-collecting
`stdout`/`stderr` objects exposing `write(s)`. Because the existence check is injected, no
case needs a real path: the happy paths pass `() => true`, and the refusal case passes
`() => false` and asserts the rejected path was the one under
`<root>/adapters/codex/hooks/craft-guard.js`.

### TDD steps

1. **RED** — `describe('main() — write mode')`: *Given an untrusted craft hook and an empty
   config, when main runs, then it calls writeConfig exactly once with the upserted text
   and returns 0.* Assert the written text contains the quoted header and the hash.
   Expected failure: `Cannot find module '../src/trust-hook-main.js'`.
2. **RED** — *Given an already-trusted hook, when main runs, then writeConfig is never
   called and it returns 0.* Then the same for `managed`.
3. **RED** — *Given a `modified` hook and a config already carrying the table with an older
   hash, when main runs, then writeConfig is called once and the written text carries
   exactly one occurrence of the table header.*
4. **RED** — refusal matrix, each asserting the return code is `EXIT_REFUSED`, `writeConfig`
   was never called, and a single non-empty line reached stderr: both `CODEX_HOME` and
   `HOME` unset (assert `runAppServer` was **never** called — it refuses before any
   I/O); a missing guard script (assert `runAppServer` was never called); a hook list with
   zero craft matches **and an empty `errors[]`**; a hook list with two craft matches; a
   matched hook with `enabled === false`; a `runAppServer` that rejects with a timeout
   error (assert the stderr line names the timeout); a stream carrying a JSON-RPC `error`
   member; an unrecognised argv entry.
5. **RED** — the listing-diagnostics pair, both of which are how a silently-missing guard
   becomes visible: *Given a response with zero craft matches and a non-empty `errors[]`,
   when main runs, then it returns `EXIT_REFUSED` and the stderr line quotes each error's
   `message` and `path`* — not a bare "no craft hook registered". And *Given a response
   carrying `warnings[]`, when main runs, then every warning is reported on stdout* and the
   run still completes normally.
6. **RED** — `describe('main() — --check mode')`: `trusted` → 0, `managed` → 0,
   `untrusted` → `EXIT_UNTRUSTED`, `modified` → `EXIT_UNTRUSTED`, `enabled === false` →
   `EXIT_REFUSED`; **every one of them asserts `writeConfig` was never called.**
7. **RED** — the negative pin, two assertions in one `describe`:
   (a) **behavioural** — across every path exercised above, the collected stdout, the
   collected stderr and every text passed to `writeConfig` contain neither
   `--dangerously-bypass-hook-trust` nor `bypass_hook_trust`;
   (b) **structural** — read the five files this change authors as text
   (`src/hook-trust.js`, `src/config-toml-trust.js`, `src/app-server-client.js`,
   `src/trust-hook-main.js`, `bin/trust-hook.js`, resolved from `import.meta.url`) and
   assert neither token appears in any of them. **Scope the structural scan to exactly
   those five paths** — `src/launch-args.js` legitimately carries the flag as an opt-in
   constant, and a directory-wide scan would fail on it.
8. **GREEN** — write `adapters/codex/src/trust-hook-main.js` implementing the flow above,
   then `adapters/codex/bin/trust-hook.js`. Keep the bin free of any decision: it binds
   real dependencies, awaits `main`, exits.
9. **GREEN** — apply the three comment corrections. Re-run the existing
   `adapters/codex/test/launch-args.test.js`, `git-guard-adapter.test.js` and
   `craft-root.test.js` unchanged; all three must stay green, which is the proof the edits
   were comment-only.
10. **REFACTOR** — collapse the refusal paths into one `refuse(reason)` helper so every
    refusal emits identically; confirm `main` has no nesting past two levels and no
    function over 20 lines; confirm the module imports no `node:child_process` — the only
    file in this change that may is `bin/trust-hook.js`.

### Gate

```
node --test adapters/codex/test/trust-hook-main.test.js
node --test adapters/codex/test/launch-args.test.js
node --test adapters/codex/test/git-guard-adapter.test.js
node --test adapters/codex/test/craft-root.test.js
node --test adapters/codex/test/*.test.js
node --test test/every-test-file-registers.test.js
```

All green before committing. Do **not** run `adapters/codex/bin/trust-hook.js` itself —
that would spawn real `codex`. `bash scripts/ci.sh` is the phase-boundary gate.

### Commit

`feat(codex): ship the scriptable hook-trust helper with a read-only check`

## Part 5 — record the 0.145.0 re-probe in the poc record

### Context

**Ships:** edits to `docs/contributing/specs/codex-poc-record.md` only. No code, no test.
A docs-only part with no `src/` delta, standalone by the sizing exception.

**The rule that governs every edit here: rows that were NOT re-probed on 0.145.0 keep
their 0.144.6 pin.** Re-labelling the whole record 0.145.0 would assert evidence nobody
gathered — the exact failure mode this file exists to prevent. The version pin therefore
moves from a document-wide implicit to being explicit where the two probes differ, and each
corrected row names the version it was observed under. The execution-port, sandbox-mode,
telemetry and execpolicy rows are **not** re-labelled.

**Two lint traps specific to this file. Read them before writing a single line.**
`test/source-hygiene.test.js` scans `docs/contributing/specs` with `grep -rEn`,
case-sensitively:

- **Class B** bans `\bgh\b|\bgithub\b`. The `git clone` error text from the live probe
  contains `https://github.com/adapters/codex.git`, whose lowercase `github` **trips the
  gate**. Verified in a throwaway file, not assumed. The allowlist in that test carries no
  entry for this file, and none is added — widening a hygiene allowlist to quote a URL is
  a worse trade than describing the same fact without it. Write the host as **`GitHub`**
  in prose (capitalised — it does not match), and render the error with the host segment
  elided, e.g. `Error: git clone https://<host>/adapters/codex.git … failed with status
  exit status: 128` / `fatal: repository '…/adapters/codex.git/' not found`. The
  load-bearing fact is that a bare path is resolved as an `owner/repo` shorthand against a
  remote host, and that survives the elision intact.
- **Class A** bans `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`.
  Do not name any coverage technique in this file.

**Self-check before committing:** `grep -rEn '\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md`
and `grep -rEn 'stryker|mutation|mutant' docs/contributing/specs/codex-poc-record.md` must
both print nothing.

**The file carries no `subjects:` frontmatter and gains none** — `parseSubjects` returns
`null` and `intention-lint` skips the page rather than rejecting it, so editing the body
keeps that gate green. `prose-lint` does **not** read this file (`docs/contributing/specs`
is in `ci.sh`'s skip set).

**Rows to correct in place — exact locations verified against the file:**

| Location | Current text | Change |
|---|---|---|
| L17-18 | `codex-cli 0.144.6` / `@openai/codex@0.144.6` | re-pin to 0.145.0, keeping the "do they agree" discipline as its own row |
| L21 | install path → vendored native binary | correct: the vendor path moved under `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex` |
| L23-47 `## Probe method` | the 0.144.6 isolation protocol + the un-isolated `--help` deviation | **keep both**, and add the 0.145.0 method beneath: two throwaway `CODEX_HOME`s with auth copied in, isolation proven by `find ~/.codex -newer <marker>` returning **0 entries** (111 and 139 entries landed in the throwaway homes), zero use of the bypass flag |
| L103 skills-by-reference row | `DEFERRED — highest-value row to close next` | **DISPROVEN on 0.145.0**, with 0/19 vs 19/19 measured through the app-server `skills/list` method |
| L128 untrusted-hook row | "It silently no-ops… the most dangerous behaviour found" | **keep, unsoftened** — re-confirmed on 0.145.0 |
| L129 "Can trust be persisted?" | `CONFIRMED (surface) / DEFERRED (write path not exercised)` | **CONFIRMED (write path exercised on 0.145.0)**, naming the key/hash mechanism |
| L131-140 "Consequence for the binding" | ends "launch-time trust verification is **not yet implemented**" | rewrite: the scriptable path exists and a read-only check is available. **Both wrong postures stay stated unsoftened** — always-bypass downgrades an environment-wide control, never-trust leaves the guard absent while appearing installed |
| L293-309 open-rows table | row 0 `PARTIAL` (no scriptable path), row 1 `DISPROVEN` | row 0 → **DELIVERED on 0.145.0**; row 1 → re-pinned 0.144.6 → 0.145.0, **still a codex limitation** |

**New content — one section, not scattered.** Add a single
`## Re-probe — codex-cli 0.145.0` section carrying: the two-request `hooks/list` sequence;
**the id-2 response envelope** — `result.data[]`, one entry per requested cwd, each entry
`{ cwd, hooks, warnings, errors }` with all four required, and `errors[]` elements shaped
`{ message, path }` — recorded as CONFIRMED against both the live response and the
generated protocol schema, because it is what the delivery's parser is pinned to and an
unrecorded envelope is the next re-probe's rediscovery cost; the `HookMetadata` field list;
the `config.toml` write shape; the `trustStatus` enum; the
BLOCK/ALLOW ground-truth matrix (`git diff > OUT.txt` → `OUT.txt` **absent**, denied;
`git diff --no-ext-diff > ALLOWED.txt` → non-empty real unified diff, allowed — **record
both directions**, because recording only the denial is how this binding once shipped a
guard that blocked everything while unit-green); the 0.145.0 `PreToolUse` payload dump
with its new `model` / `permission_mode` / `tool_use_id` / `turn_id` fields; the
two-vocabulary warning (`"PreToolUse"` PascalCase in the hook payload vs `"preToolUse"`
camelCase in the protocol enum — do not conflate); the protocol event-name enum
(`preToolUse, permissionRequest, postToolUse, preCompact, postCompact, sessionStart,
sessionEnd, userPromptSubmit, subagentStart, subagentStop, stop`); the 0/19-vs-19/19
skills result with the cached-manifest field-drop table; and the `marketplace add`
source-form matrix (bare → resolved as an `owner/repo` shorthand and fails; `./`-prefixed
→ works; absolute → works) with its root cause. State the source-form finding as
**observed 0.145.0 behaviour, not a regression** — whether 0.144.6 resolved the bare form
differently was never re-probed.

**Two new DEFERRED rows** the delivery designs around rather than assumes, both belonging
in this section: whether `hooks/list` requires an authenticated `CODEX_HOME` (the re-probe
ran with auth copied in and never tested the unauthenticated case), and whether
`hooks/list` reports `command` raw or shell-expanded.

### TDD steps

No RED is available: this part ships prose into a file no test asserts over, and inventing
a text-assertion test for an evidence record would pin wording rather than behaviour. The
executable checks are the repo's own gates, run in this order:

1. **RED (gate-first)** — before editing, run
   `grep -rEn '\bgh\b|\bgithub\b' docs/contributing/specs/` and record the current
   allowlisted hits, so a new offender introduced by this edit is distinguishable from the
   pre-existing ones. Then run `node --test test/source-hygiene.test.js` and confirm it is
   green **before** the edit.
2. **GREEN** — apply the row corrections in place, then append the
   `## Re-probe — codex-cli 0.145.0` section, obeying the two lint traps above.
3. **GREEN** — re-run `node --test test/source-hygiene.test.js` (still green: zero new
   Class A or Class B hits) and `bash scripts/ci.sh`'s intention-lint step
   (`node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)`).
4. **REFACTOR** — re-read every row that was **not** touched and confirm none of them now
   reads as if it were re-probed on 0.145.0. That sweep is the part's real acceptance
   criterion.

### Gate

```
node --test test/source-hygiene.test.js
node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)
bash scripts/docs-structure-lint.sh docs/contributing
grep -rEn '\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md   # must print nothing
grep -rEn 'stryker|mutation|mutant' docs/contributing/specs/codex-poc-record.md   # must print nothing
```

### Commit

`docs(specs): record the codex 0.145.0 re-probe evidence`

## Part 6 — the adapter README, and the pins that hold it honest

### Context

**Ships:** edits to `adapters/codex/README.md` and new assertions in
`adapters/codex/test/native-surface.test.js`, **in the same commit**, so the documented
posture cannot silently drift back. **Depends on Part 4** — it documents the command Part 4
ships.

**Three edits to `adapters/codex/README.md`, and nothing else:**

- **L15, inside `## Load`** — `codex plugin marketplace add adapters/codex` becomes
  `codex plugin marketplace add ./adapters/codex`. Add one line disclosing why: on 0.145.0
  a bare path matches the documented `owner/repo` shorthand and is resolved against a
  remote host rather than as a local directory; the `./` prefix is what marks it local. An
  absolute path also works but is not what the README shows, because it differs per
  checkout.
- **L26** — `**The 19 shared skills do NOT load by reference on Codex 0.144.6 (pinned
  live).**` re-pins to 0.145.0, with the ground truth: **0 of 19** without the symlink
  fallback, **19 of 19** with it, measured through the app-server's own skills-listing
  method rather than inferred. **The symlink block at L33-35 STAYS, and stays framed as the
  working path, not a contingency** — it is the only route that loads all 19. Do not retire
  it, do not soften it, do not move it below a "if the above fails" hedge.
- **L51-75, `## Install-time hook trust`** — step 1 becomes the scriptable command
  (`node adapters/codex/bin/trust-hook.js`), with the interactive trust-on-prompt route
  **retained** as the alternative. Order it **after** `codex login`: whether `hooks/list`
  requires an authenticated `CODEX_HOME` is unpinned, so the documented order avoids the
  question rather than answering it. Steps 2 and 3 are unchanged — the bypass flag stays
  named and stays discouraged. Step 4 ("Launch-time trust *verification* is not implemented
  in this binding") is rewritten to describe `node adapters/codex/bin/trust-hook.js --check`
  as available on demand and deliberately **not** wired into every launch.
- **L77-107, `## Guard — honest enforcement profile`** — every carve-out stays unsoftened.
  The last bullet, "Hook enforcement is bought at the cost documented above: it depends on
  the one-time install-time trust step", is updated to say that step is now **scriptable** —
  not that the cost vanished.

**Everything the README must keep — `adapters/codex/test/native-surface.test.js`
`describe('README.md — honesty pins')` already pins seven strings, and every one survives
these edits:** `git -C`, `fail open`, `not measured`, `--dangerously-bypass-hook-trust`,
`$CODEX_HOME/skills`, `trust` together with `silently no-ops|silent no-op`, and
`--ephemeral`. Verify each after editing; none is in a section being rewritten wholesale.

**Two pins to add, in the same `describe` block, in this same commit:**

1. *Given README.md, when scanned, then it shows the `./`-prefixed local marketplace source
   form and discloses the shorthand misresolution.* Assert `/codex plugin marketplace add \.\/adapters\/codex/`
   **and** `/owner\/repo/`. The `./` prefix must be asserted **specifically** — a pin that
   merely required the string `adapters/codex` would pass against the broken bare form,
   which is the defect being fixed.
2. *Given README.md, when scanned, then it documents the scriptable trust path and its
   read-only check.* Assert `/bin\/trust-hook\.js/` and `/--check/`.

**Hygiene the new README prose must satisfy** (all three loops read `README.md` through
`authoredSurfaces()`): no `/!`[^`]*`/` shell-injection expansion — never place `!`
immediately before a backticked span; no provenance reference matching
`/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` — in particular do not write "step P1"
or any `P<digit>` token; no bare `${CLAUDE_PLUGIN_ROOT}` outside the
`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim. `test/source-hygiene.test.js` does **not**
scan `adapters/**`, so `github`/`mutation` are not banned here — but there is no reason to
write either. `prose-lint` **does** read this file (advisory); keep the additions
declarative and clear of `delve`, `leverage`, `seamless`, `robust`, `it's important to
note`, `in conclusion`.

### TDD steps

1. **RED** — add the two new pins to `describe('README.md — honesty pins')` in
   `adapters/codex/test/native-surface.test.js`, following the existing case shape
   (`const sut = readFileSync(README_PATH, 'utf8'); assert.match(sut, …)`). Expected
   failure: both fail — the README still shows the bare `adapters/codex` source form and
   names no trust-hook command.
2. **GREEN** — apply the four README edits above. Both new pins pass.
3. **GREEN** — re-run the whole `native-surface.test.js` file: the seven pre-existing
   honesty pins and all three hygiene loops must be green with **no** edit to them. If a
   pre-existing pin breaks, the README edit went too far — restore the pinned string rather
   than relaxing the pin.
4. **REFACTOR** — re-read `## Install-time hook trust` end to end and confirm the bypass
   flag is still described as environment-wide and discouraged, and that step 1's new
   command has not been promoted into "and now trust is automatic". Granting trust stays an
   explicit operator act.

### Gate

```
node --test adapters/codex/test/native-surface.test.js
node --test adapters/codex/test/*.test.js
```

Both green before committing. `bash scripts/ci.sh` is the phase-boundary gate.

### Commit

`docs(codex): document the scriptable trust path and the local marketplace source form`

## Part 7 — the backlog ledger

### Context

**Ships:** edits to `BACKLOG.md` only. Docs-only, no `src/` delta, standalone by the sizing
exception. **Last part** — it claims delivery, so everything it claims must already be in
the tree.

**The file's own convention, read from the neighbouring entries in the same section:** a
delivered follow-up **stays in place** under its `### Open (scoped 2026-07-20 — follow-ups
surfaced by the codex binding, not yet scheduled)` heading; its bold title gains
`— delivered <YYYY-MM-DD>` plus the run name; its body states mechanism and evidence.
**The date is `2026-07-31` and the run name is `codex-0145-limitation-reprobe`** — pinned
here so no part guesses either.
The model to copy is the neighbouring **"Measure what each codex sandbox mode actually
blocks, per mode — delivered 2026-07-21"** entry (same section, a few paragraphs below),
which names the run in parentheses and then states the measured ground truth. Entries are
**not** moved to a separate delivered section.

**Entry (1) — "Hook-trust for the codex binding — PARTIALLY delivered 2026-07-21;
scriptable-trust stays OPEN (codex-0.144.6 limitation)":**

- Title becomes delivered, dated today, naming this run.
- The first bullet (the already-delivered `fb4b922` payload-shape fix) is left **as-is**.
- The second bullet's 0.144.6-era finding is **retained as history** — an untrusted hook
  silently no-ops, still true, re-confirmed on 0.145.0. Only the limitation clause ("codex
  0.144.6 exposes no scriptable/headless hook-trust write path … Trust is interactive-only")
  is replaced, by: the 0.145.0 mechanism (`hooks/list` over `codex app-server` → a
  `[hooks.state."<key>"] trusted_hash` write into `$CODEX_HOME/config.toml`), the
  fail-closed BLOCK/ALLOW ground truth, and the shipped surface
  (`adapters/codex/bin/trust-hook.js`, plus `--check`).
- Keep the existing note that `codex plugin add` drops the plugin's out-of-plugin
  `../../hooks.json` reference, so the guard must be wired via `config.toml [hooks]` — the
  0.145.0 re-probe independently re-confirmed it.

**Entry (2) — "Prove craft's shared skills load by reference on codex — PROBED 2026-07-21;
DISPROVEN, stays OPEN (codex-0.144.6 limitation)": it STAYS OPEN.**

- Title re-pins `codex-0.144.6` → `codex-0.145.0` and dates the re-probe.
- Body keeps finding (1), the fixed manifest-location bug (`b204182`), unchanged.
- Finding (2)'s by-reference evidence is replaced with the 0.145.0 ground truth: 0 of 19
  shared skills load without the symlink farm, 19 of 19 with it, measured through the
  app-server's own skills-listing method; plus the cached-manifest field-drop (the `craft`
  entry loses `skills`; the `craft-codex` entry loses **both** `hooks` and `skills`).
- **The symlink fallback stays named as the working route.**

**Defect (3) — the marketplace source form** is recorded in the same section as a
delivered doc fix (the `./` prefix), stated as **observed 0.145.0 behaviour, not a
regression** — 0.144.6's resolution of the bare form was never re-probed. It opens **no**
new follow-up.

**Gates over this file:**

- `scripts/backlog-lint.sh BACKLOG.md` asserts only that five headings are present:
  `## Status`, `## Candidate phases`, `## Parked`, `### Condition-gated`, `### Closed`.
  **None of them moves** — every edit here is inside `### Open (scoped 2026-07-20 …)`.
- `intention-lint` resolves the backticked pointers on the `> SoT —` block at lines 7-8.
  **Do not touch that block**, and do not introduce a new backticked path on it.
- `BACKLOG.md` is **not** in `test/source-hygiene.test.js`'s scanned-path list, so
  `github`/`mutation` are not banned here. `prose-lint` **does** read it (advisory) —
  avoid `delve`, `leverage`, `seamless`, `robust`, `it's important to note`,
  `in conclusion`.

### TDD steps

No RED is available: `test/backlog-lint.test.js` exercises the linter against its own
fixtures, not against `BACKLOG.md`'s content, and no test asserts over backlog prose.
Inventing one would pin an entry's wording, which is exactly the kind of brittle text
assertion this repo keeps out of the process suite. The executable checks are the repo's
own gates:

1. **RED (gate-first)** — run `bash scripts/backlog-lint.sh BACKLOG.md` and
   `node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)` **before** editing;
   both must be green, so any later failure is unambiguously caused by this edit.
2. **GREEN** — rewrite entry (1)'s title and second bullet, re-pin entry (2)'s title and
   second finding, and add the defect-(3) delivered note. Keep every retained sentence
   byte-identical rather than paraphrasing it — a re-worded history row is a silently
   changed record.
3. **GREEN** — re-run both gates; both green.
4. **REFACTOR** — read entry (2) once more and confirm it still reads as **OPEN against
   codex**, not as delivered. The single most likely error in this part is a delivered-sounding
   rewrite of an entry that is still a live vendor limitation.

### Gate

```
bash scripts/backlog-lint.sh BACKLOG.md
node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)
bash scripts/ci.sh
```

`bash scripts/ci.sh` runs in full here: this is the last part, so it doubles as the
phase-boundary gate.

### Commit

`docs(backlog): close scriptable hook-trust and re-pin the shared-skill limitation`
