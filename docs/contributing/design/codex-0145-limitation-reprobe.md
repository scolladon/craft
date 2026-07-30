# Design — codex 0.145.0 limitation re-probe: scriptable hook trust delivered, shared-skill limitation re-pinned

> Brief: re-probe the two codex-binding limitations pinned against codex 0.144.6 on the installed
> 0.145.0. Scriptable hook-trust is LIFTED — deliver a scriptable trust path. Shared skills by
> reference STILL FAILS — keep the symlink fallback and re-pin the limitation. A third defect
> surfaced: `codex plugin marketplace add` resolves the bare path `adapters/codex` as a GitHub
> `owner/repo` shorthand rather than as a local directory.
> Status: draft → self-reviewed ×3 → accepted

---

## Context

Two limitations were recorded against `codex-cli 0.144.6` and left open in `BACKLOG.md` under
`### Open (scoped 2026-07-20 — follow-ups surfaced by the codex binding, not yet scheduled)`
(L355): hook-trust has no scriptable write path (L357), and shared craft skills do not load by
reference (L377). Both are also carried in `docs/contributing/specs/codex-poc-record.md` — the
runtime evidence record — whose every row is pinned at 0.144.6.

The installed CLI is now `codex-cli 0.145.0`. The orchestrator re-probed both limitations live,
in two throwaway `CODEX_HOME`s with auth copied in, isolation proven by mtime-find
(`find ~/.codex -newer <marker>` → 0 entries), never using
`--dangerously-bypass-hook-trust`. **This design is layered on that pinned evidence; no part of it
is designed from memory of codex.** The pinned matrix is reproduced below because it is
load-bearing for every choice in *Design*.

### Pinned matrix — codex-cli 0.145.0 (re-probe evidence)

**Identity.** Binary `codex-cli 0.145.0`; npm `@openai/codex@0.145.0`. The vendored native binary
moved under `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`
— the record's install-path row is stale.

**(1) Scriptable hook-trust — LIFTED.** Trust is neither a state file nor a DB row (the state
sqlite carries no trust table); it is a **`config.toml` key**. The headless read path is
`codex app-server`, speaking newline-delimited JSON-RPC on stdio:

| # | Request |
|---|---|
| 1 | `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"…","version":"…"}}}` |
| 2 | `{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwds":["<repo>"]}}` |

`hooks/list` returns one `HookMetadata` per hook, carrying `key`, `currentHash`, `trustStatus`,
`enabled`, `source`, `sourcePath`, `handlerType`, `matcher`, `timeoutSec`, `isManaged`, `command`.

| Field | Observed value shape |
|---|---|
| `key` | `"<ABSOLUTE $CODEX_HOME>/config.toml:pre_tool_use:0:0"` — contains `/` **and** `:` |
| `currentHash` | `"sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4"` |
| `trustStatus` | one of `managed` \| `untrusted` \| `trusted` \| `modified` |

The write path is an append to `$CODEX_HOME/config.toml`:

```toml
[hooks.state."<key from hooks/list>"]
trusted_hash = "<currentHash from hooks/list>"
```

Re-running `hooks/list` then reports `trustStatus: "trusted"`. **Observed live.** The hash covers
the hook **definition**, not the script file's contents: changing the hook `command` moved
`currentHash` from `sha256:cf8ef5ea…` to `sha256:031fe4e9…`. `modified` is therefore the
definition-tamper signal.

**(1c) Fail-closed proven in BOTH directions**, ground-truthed by side-effect, with the real
`adapters/codex/hooks/craft-guard.js` wired and trusted by the path above:

| Case | Command codex was told to run | Ground truth | Verdict |
|---|---|---|---|
| BLOCK | `git diff > OUT.txt` | `OUT.txt` **absent** | denied — never ran |
| ALLOW | `git diff --no-ext-diff > ALLOWED.txt` | `ALLOWED.txt` non-empty, real unified diff | allowed — ran normally |

The allow case is not ceremony: a prior regression shipped a guard that blocked *everything* while
unit-green. Both directions were checked deliberately, and any future re-probe must do the same.

**(1d) The real `PreToolUse` payload on 0.145.0 is still Claude-shaped** — `tool_name: "Bash"`,
`tool_input.command`, `cwd`, plus new `model`, `permission_mode`, `tool_use_id`, `turn_id`.
`bridgeExecutedCommand` in `adapters/codex/src/git-guard-adapter.js` reads `tool_input.command` and
is **correct against 0.145.0 with no change**. Two vocabularies must not be conflated: the hook
payload names the event `"PreToolUse"` (PascalCase); the app-server protocol enum names it
`"preToolUse"` (camelCase, alongside `permissionRequest, postToolUse, preCompact, postCompact,
sessionStart, sessionEnd, userPromptSubmit, subagentStart, subagentStop, stop`).

**(2) Shared skills by reference — STILL HOLDS.** `codex plugin add` still COPIES into
`$CODEX_HOME/plugins/cache/…` and the generated `.codex-plugin/plugin.json` drops every
out-of-tree field:

| Source `plugin.json` | Cached `.codex-plugin/plugin.json` |
|---|---|
| craft: `{name, version, description, author, skills:"../../../../skills"}` | `{description, name}` — `skills` dropped |
| craft-codex: `{…, hooks:"../../hooks.json", skills:"./skills"}` | `{description, name}` — `hooks` **and** `skills` dropped |

Ground truth via the app-server `skills/list` method (authoritative, not inference): **without**
the symlink fallback, **0 of 19** shared craft skills load (only the physically-copied local
`craft-codex:craft-run` appears); **with** it, **19 of 19** load at scope `user`, paths resolving
through the symlink back to the repo. The dropped `hooks` field independently re-confirms the
existing rule that the guard must be wired via `config.toml [hooks]`, never via marketplace
install.

**(3) New defect — a bare path is resolved as a GitHub `owner/repo` shorthand.**
`codex plugin marketplace add --help` documents SOURCE as "a local path, `owner/repo[@ref]`, HTTPS
Git URL, or SSH Git URL". A bare `adapters/codex` matches the **`owner/repo` shorthand**, so 0.145.0
resolves it against GitHub instead of the local directory:

```
Error: git clone https://github.com/adapters/codex.git … failed with status exit status: 128
fatal: repository 'https://github.com/adapters/codex.git/' not found
```

It first presented as a hang only because that `git clone` stalls on interactive credential
prompting for a repository that does not exist; with `GIT_TERMINAL_PROMPT=0` it fails fast. **This
is a source-form misresolution, not a hang** — and it is not called a regression, because whether
0.144.6 resolved the bare form differently was never re-probed. Observed 0.145.0 behaviour only.

| Form | Result |
|---|---|
| `adapters/codex` | resolved as `github.com/adapters/codex` → fails, or stalls on the credential prompt |
| `./adapters/codex` | **works** — `{"marketplaceName":"craft-codex-marketplace","installedRoot":"…"}` |
| `/abs/path/…/adapters/codex` | **works** |

`adapters/codex/README.md` L15 documents the bare form — a live docs defect. The remedy is the
`./` prefix, which is what disambiguates a local path from the shorthand. An absolute path also
works but cannot be written literally in documentation, since it differs per checkout.

### House patterns this change must follow

- **Injected-dependency seams, no CLI spawn in tests** (ADR-261). `scripts/ci.sh` runs
  `run_suite adapters/codex adapters/codex/test adapters/codex`, enumerating `*.test.js` with
  `find` — a new test file needs **no** `ci.sh` edit, and `test/every-test-file-registers.test.js`
  picks it up automatically.
- **Thin bin over a pure `*-main.js`**: every `engine/bin/*.js` is six lines —
  `import { main } from '../src/<x>-main.js'` then
  `process.exit(main(process.argv.slice(2), { stdout, stderr }))`. Impurity lives in the entry, the
  decision logic is pure and unit-tested.
- **Adapters live in place** (ADR-085); the codex binding's home is `adapters/codex/` (ADR-252),
  which ships **no** `bin/` today — this change creates the first, or declines to.
- **Guard-adjacent adapter sources carry mutation coverage**, paired 1:1 with their own test file:
  `engine/test/mutation-config.test.js` asserts every `adapters/*` entry in
  `engine/stryker.conf.json` `mutate[]` has its `…/test/<same-name>.test.js` in `tap.testFiles`,
  bans binding-wide globs, and asserts every referenced path exists.
- **No provenance refs in source, test, README, agents or config**; `adapters/codex/test/native-surface.test.js`
  (L287) enforces this over every authored adapter surface with
  `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`.
- **`adapters/codex/agents/*.md` bodies are byte-identical mirrors** of `agents/*.md`
  (`native-surface.test.js` L154). No agent body is touched by this change.

## Requirements

1. A scriptable, headless path that takes craft's PreToolUse guard hook from `untrusted` to
   `trusted` on codex 0.145.0, using **only** the pinned mechanism: `codex app-server` →
   `initialize` → `hooks/list` → write `[hooks.state."<key>"] trusted_hash` into
   `$CODEX_HOME/config.toml`.
2. The path **never** uses, emits, suggests, or documents `--dangerously-bypass-hook-trust`, and
   never sets `bypass_hook_trust` as a config key.
3. It trusts **exactly one** hook — the one whose `command` names
   `adapters/codex/hooks/craft-guard.js`. Zero matches or more than one match is a loud non-zero
   failure, never a "trust them all" fallback: a tool that blanket-trusts every listed hook is a
   scriptable re-implementation of the global bypass flag.
4. It is idempotent: a second run over an already-trusted hook writes nothing and exits 0. A run
   over a `modified` hook rewrites the single `trusted_hash` value in place — it never appends a
   duplicate `[hooks.state."<key>"]` table, which would make the user's `config.toml` unparseable.
5. The `config.toml` key is emitted as a **quoted** TOML key (the key contains `/` and `:`, and
   the quoted form must survive `"` and `\` in a `$CODEX_HOME` path).
6. It never hangs. Every read of the app-server is bounded by a timeout that fails loud, and the
   spawned child can never sit waiting on an interactive prompt — the two ways a scripted CLI call
   stalls forever. Defect (3) is the cautionary case: what looked like a hang was a child process
   blocked on a credential prompt, which `GIT_TERMINAL_PROMPT=0` turns into a fast failure. The
   CI-hang trap of a real-binary test spawn is the other.
7. Every seam is unit-testable through injected dependencies. **No test spawns real `codex`**, and
   no test writes to a real `$CODEX_HOME`.
8. The guard's fail-closed behaviour is unchanged. `git-guard-adapter.js` and
   `hooks/craft-guard.js` keep their current verdict semantics; the re-probe confirms
   `tool_input.command` is still the right field.
9. `docs/contributing/specs/codex-poc-record.md` records the 0.145.0 re-probe with its evidence,
   corrects the rows the re-probe falsified, and does **not** re-label rows that were not
   re-probed on 0.145.0 as if they had been.
10. `adapters/codex/README.md` documents the scriptable trust path, uses the `./`-prefixed
    marketplace-add form with the bare-path/`owner/repo` misresolution disclosed, and **keeps** the
    `$CODEX_HOME/skills` symlink fallback as the working path for shared skills.
11. `BACKLOG.md` entry (1) closes as delivered; entry (2) stays open, re-pinned from 0.144.6 to
    0.145.0 with the 0/19-vs-19/19 evidence. Both follow the file's in-place conventions.
12. `scripts/ci.sh` is green at every commit, including `design-lint`, `backlog-lint`,
    `intention-lint`, `docs-structure-lint`, and the codex suite.

## Design

Seven parts. Parts 1–3 are the delivery, by strict TDD. Part 4 is comment-only: it corrects the
in-source claims the re-probe falsified, and changes no behaviour. Parts 5–7 are the doc and ledger
updates. Each part is one atomic commit.

### Part 1 — `hooks/list` transport + trust plan (pure)

**Context block**

- NEW `adapters/codex/src/hook-trust.js`. NEW test `adapters/codex/test/hook-trust.test.js`.
- Reuses `adapters/codex/src/craft-root.js` → `resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync })`,
  which up-walks `UP_LEVELS_TO_REPO_ROOT = ['..','..','..']` (L16) and asserts the result contains
  `engine/bin`. A module at `adapters/codex/bin/` or `adapters/codex/src/` sits at exactly that
  depth, so the constant is reused unchanged; its comment at L13 ("Both callers of this resolver —
  `adapters/codex/src/*.js` and `adapters/codex/hooks/*.js`") gains the third caller in Part 3.
- Prior art for pure NDJSON/record parsing with injected I/O:
  `engine/src/observability/adapters/codex/telemetry.js` (rollout `.jsonl` envelopes).

**Exports (all pure — no `fs`, no `child_process`)**

- `buildRequests({ cwd }) → string[]` — the two pinned JSON-RPC lines, in order, each
  newline-terminated. `initialize` id `1`, `hooks/list` id `2`. `params.cwds` is `[cwd]`, where
  `cwd` is the resolved repo root — the same value the probe passed, and the root craft's own
  guard contains against; no `--cwd` override is offered because a different cwd would list a
  different hook set. `clientInfo.name`/`.version` are named constants, not literals sprinkled at
  the call site. Nothing beyond the pinned sequence is sent: `notifications/initialized` and every
  other method is unpinned and therefore not invented.
- `parseHooksList(stdoutText, { requestId }) → HookMetadata[]` — splits on newlines, discards
  blank lines, JSON-parses each, and selects the response whose `id === requestId`. Notifications
  and the `initialize` response interleave and are ignored by id, never by position. A JSON-RPC
  `error` member throws with the server's own message. No matching response throws. A malformed
  line throws rather than being skipped — a silently-dropped line is how a "0 hooks found" false
  negative would look.
- `selectCraftHook(hooks) → HookMetadata` — matches on `command` containing the path **tail**
  `/adapters/codex/hooks/craft-guard.js`. Exactly one match returns; **zero throws, more than one
  throws**, each naming what it saw, including every candidate's `sourcePath`.

  **Matching on the tail, not on the absolute path, is deliberate and load-bearing.** The registered
  command is `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js`
  (`adapters/codex/hooks.json`), and codex runs hook commands through a shell that expands both the
  variable and the POSIX `:-` default. Whether `hooks/list` reports that command **raw** or
  **shell-expanded** was not pinned by the re-probe. A matcher keyed on the realpath'd absolute
  guard path would therefore match nothing on the raw variant — a tool that fails loud on every
  single run, which is the same "unit-green, live-broken" class as the payload-shape regression this
  binding already ate once. The tail is identical under both variants, so the matcher works either
  way. `resolveCraftRoot` is still used, for the step-2 existence check that the guard script is
  really there — the two concerns stay separate.

  The residual this buys is small and stated rather than hidden: the tail also matches a *different*
  craft checkout's guard. That checkout's guard is still fail-closed craft code, so the exposure is
  over-restriction, never a bypass — and if both are registered, it presents as a multi-match and is
  refused.

  The multi-match case is real, not theoretical: codex layers user (`$CODEX_HOME/config.toml`) over
  project (`.codex/`), so craft's guard can end up registered twice. Refusing is the right verdict —
  two registrations mean two denials and an ambiguous answer to *which* config file holds the
  trust — and refusing is acceptable **because it is loud**. The failure this binding cannot
  tolerate is the silent one; a non-zero exit naming both `sourcePath`s leaves the operator with a
  fixable, visible problem.

- `planTrust(hook) → { action, key, hash, from, enabled }` where `action ∈ 'write' | 'noop'`:

  | `trustStatus` | action | rationale |
  |---|---|---|
  | `trusted` | `noop` | already trusted; idempotent re-run |
  | `untrusted` | `write` | the install case |
  | `modified` | `write` | definition changed (craft updated `hooks.json`); re-trust, reporting `from`→`hash` |
  | `managed` | `noop` | trusted by enterprise/managed policy; a user-scope write is not craft's to make |
  | anything else | throw | an unknown status is not a benign default |

  `planTrust` never writes and never reads the filesystem — it returns an intent that Part 3
  executes. This is the CQS split that lets every branch above be asserted without a `config.toml`.

  `enabled` rides along on the plan because `hooks/list` reports it and it is decision-bearing: a
  hook that is registered, trusted, and **disabled** is precisely the "looks installed, enforces
  nothing" state the record calls the most dangerous behaviour found in this binding. Part 3
  refuses on `enabled === false` rather than reporting a cheerful success.

**Fail-closed posture.** Every throw path here surfaces as a non-zero exit with a reason. The
inverse of the guard: the guard fails closed by denying; this tool fails closed by refusing to
write and saying why, never by writing a best guess.

### Part 2 — quoted-key `config.toml` upsert (pure)

**Context block**

- NEW `adapters/codex/src/config-toml-trust.js`. NEW test `adapters/codex/test/config-toml-trust.test.js`.
- The repo has **no TOML parser** — `engine/package.json` `dependencies` is `{"js-yaml": "^4.1.0"}`
  and nothing else. The target subset is one table with one key, so a targeted upsert is written
  rather than a parser (see *Decision candidates*).
- Shape being written is pinned above: `[hooks.state."<key>"]` / `trusted_hash = "<hash>"`.

**Exports**

- `toQuotedTomlKey(key) → string` — wraps in `"`, escaping `\` → `\\` and `"` → `\"` first
  (backslash first, or the escape escapes itself), and control characters as `\uXXXX`. The `/` and
  `:` in the pinned key need no escape but **do** make the quoted form mandatory — a bare key
  would be read as dotted-path segments.
- `upsertTrustedHash(tomlText, { key, hash }) → string` — locates the line equal to
  `[hooks.state.<quoted>]`, and within that table (up to the next line-initial `[`) replaces the
  `trusted_hash = …` assignment, inserting one if the table exists without it. When the table is
  absent it appends the block at end of text, preceded by exactly one blank line (adding the
  missing terminating newline first if the input lacks one), and ends with a trailing newline.
  Never deletes, never reorders, never rewrites any other line.

**Edge behaviour, stated because each one is a silent-corruption route**

- **Idempotence is byte-level**: `upsert(upsert(t)) === upsert(t)`, asserted directly.
- **Empty / whitespace-only input** yields a file containing just the block.
- **A pre-existing table with a different hash** is updated in place — this is the `modified` path,
  and it must not produce a second table with the same key (a TOML duplicate-key error would break
  the user's whole config, which is worse than an untrusted hook).
- **The key is machine-specific.** It embeds the absolute `$CODEX_HOME/config.toml` path and the
  `:pre_tool_use:0:0` positional suffix. It can never be pre-baked into
  `adapters/codex/config.template.toml` and must always be read live — a template constant would
  be wrong on every other machine, and wrong on the same machine after a hook is added ahead of
  craft's.
- **Stale entries are never pruned.** If the positional suffix shifts (another `PreToolUse` hook is
  added first), `hooks/list` reports craft's hook as a new untrusted key; the tool trusts the new
  key and leaves the orphan entry alone. Deleting keys out of a user's config is a larger
  authority than trusting one hook; the orphan is inert because its key names a hook that no
  longer exists. Documented rather than silently handled.
- **The subset the scanner understands is narrow, and that is written down rather than assumed
  away.** Table boundaries are detected by line-initial `[`; a `config.toml` whose multi-line basic
  string contains a line starting with `[` would fool that scan. The exposure is confined to the
  *replace* path, which only runs when the exact quoted header line was already found; the append
  path writes at end of text and cannot mis-detect anything. If codex's config ever grows shapes
  this subset cannot read, candidate 6 (a real parser) is the escape, not a widened regex.

### Part 3 — the entry point: app-server spawn + write, injected

**Context block**

- NEW `adapters/codex/src/trust-hook-main.js` (orchestration, all I/O injected) and NEW
  `adapters/codex/bin/trust-hook.js` (thin wrapper; the **only** place a real `codex` process is
  spawned). NEW test `adapters/codex/test/trust-hook-main.test.js`.
- Wrapper shape mirrors `engine/bin/stub-lint.js` / `engine/bin/readme-drift.js`:
  `if (process.argv[1] === fileURLToPath(import.meta.url)) …` — the self-invocation guard means
  importing the module in a test never runs it. **One deliberate divergence**: every existing
  `engine/bin/*.js` calls a synchronous `main` and passes its return straight to `process.exit`.
  This `main` is async (it awaits the app-server), so the wrapper awaits it and exits with the
  resolved code, and a rejected promise exits non-zero with the reason on stderr rather than
  surfacing as an unhandled rejection.
- `adapters/codex/package.json` is `{name, type:"module", private, scripts:{test}}`; a `bin` field
  is not required for an in-place adapter invoked by path.

**Signature**

```
main(argv, {
  runAppServer,   // ({ requests, cwd, timeoutMs }) => Promise<string>  — accumulated stdout.
                  // `requests` already carries the cwd inside hooks/list params; the `cwd` here is
                  // the child process's own working directory, set to the same repo root.
  readConfig,     // (path) => string   ('' when absent)
  writeConfig,    // (path, text) => void
  resolveRoot,    // () => string       (defaults to resolveCraftRoot(import.meta.url))
  env,            // { CODEX_HOME, HOME }
  stdout, stderr,
}) → Promise<number>   // exit code
```

**Flow**

1. Resolve `codexHome` = `env.CODEX_HOME` or `<env.HOME>/.codex`. With **both** unset, refuse —
   never resolve a path against an `undefined` segment and write a `config.toml` somewhere nobody
   asked for. `configPath` = `<codexHome>/config.toml`.
2. `guardScriptPath` = `<resolveRoot()>/adapters/codex/hooks/craft-guard.js`. Refuse if the file
   does not exist. This is a precondition check, not the matcher (Part 1 matches on the path tail):
   trusting a hook definition while this checkout's guard script is missing or misplaced would
   register trust for something that cannot run.
3. `runAppServer` with `buildRequests({ cwd: resolveRoot() })` → `parseHooksList` →
   `selectCraftHook` → `planTrust`. The matched hook's `sourcePath` and `command` are echoed to
   stdout before any write, so what is being trusted is visible, not inferred.
4. Refuse when the matched hook reports `enabled === false`: trusting a disabled hook yields a
   binding that reports success and enforces nothing.
5. `noop` → report the status and exit 0. `write` → `readConfig` → `upsertTrustedHash` →
   `writeConfig` → report `key` and `from`→`hash`, exit 0.
6. Any throw → single-line reason on stderr, exit non-zero. No stack traces, no partial writes:
   the config is written once, whole, or not at all.

Invocation is by path — `node adapters/codex/bin/trust-hook.js` and
`node adapters/codex/bin/trust-hook.js --check` — with no `CRAFT_ROOT` needed, since the entry
self-locates through `resolveCraftRoot`.

**`--check` mode** (candidate 4): identical up to step 4 — including the disabled-hook refusal —
then reports the plan and exits 0 for `trusted`/`managed`, non-zero for `untrusted`/`modified`, and
**never** calls `writeConfig`. This is the honest read of the trust state the binding could not previously
perform, and it is exactly what turns README point 4 from "not implemented" into "available, not
automatic".

**The real spawn, in `bin/trust-hook.js` only.** `spawn('codex', ['app-server'])`, write both
request lines to stdin, accumulate stdout, resolve once the id-2 response is seen or the timeout
fires, then end stdin and kill the child. `codex app-server` is a long-running server that never
exits on its own, so an unkilled child or an unbounded read stalls craft's own tooling exactly the
way defect (3) stalled — a child nobody can answer, waited on forever. The timeout is a named
constant, and its expiry is a loud non-zero failure naming the timeout, never a fallback to "assume
untrusted". The child's stdin carries only the two request lines and is then closed, so it can
never fall back to prompting.

**Unpinned, therefore stated as unknown rather than assumed.** Two rows, both landing in the poc
record as DEFERRED, both designed around rather than guessed at:

1. **Does `hooks/list` require an authenticated `CODEX_HOME`?** The re-probe ran with auth copied in
   and never tested the unauthenticated case. The tool surfaces an app-server error verbatim instead
   of interpreting it, and the README orders the trust step after `codex login`.
2. **Does `hooks/list` report `command` raw or shell-expanded?** Designed around by matching on the
   path tail (Part 1), which is invariant under both. Closing this row is a one-request follow-up
   probe, not a blocker.

### Part 4 — re-confirm the guard; correct two stale in-source claims (no behaviour change)

**Context block**

- `adapters/codex/src/git-guard-adapter.js` → `bridgeExecutedCommand(toolInput)` reads
  `toolInput?.command ?? toolInput?.cmd`. The 0.145.0 payload dump confirms `tool_input.command`
  is still the executed field. **No code change.** Its comment already says "pinned by dumping the
  live hook stdin" and stays true; only the version it names, if any, is refreshed.
- `adapters/codex/src/launch-args.js` L68–72 carries
  `// Open question, deliberately not assumed either way: whether an *untrusted* hook in headless
  mode fails loudly or silently no-ops.` — **falsified**: it silently no-ops, confirmed on both
  0.144.6 and 0.145.0. And the paragraph above it says the intended path is "a one-time trust of
  the craft guard hook at install time", which is now a scriptable step rather than an
  interactive-only one. Both are comment-only corrections; `buildLaunchArgs({ workingDir,
  bypassHookTrust = false })` (L45) keeps its signature, its default, and its opt-in `if
  (bypassHookTrust)` branch (L73) untouched.
- `adapters/codex/src/craft-root.js` L13 comment gains the `adapters/codex/bin/*.js` caller.
- Comments are prose-only: no ADR, phase, backlog or version-provenance reference in source.

The new payload fields (`model`, `permission_mode`, `tool_use_id`, `turn_id`) are additive and
ignored by the adapter; `adaptCodexEvent` destructures only `{ tool_name, tool_input, cwd }`, so
they need no handling. Stated so a later reader does not "add support" for fields nothing consumes.

### Part 5 — `docs/contributing/specs/codex-poc-record.md`: record the 0.145.0 re-probe

**Context block** — exact rows in play:

| Location | Current text | Change |
|---|---|---|
| L17–18 | `codex-cli 0.144.6` / `@openai/codex@0.144.6` | re-pin to 0.145.0, keeping the "do they agree" discipline |
| L21 | install path → vendored native binary | correct: vendor path moved under `codex/node_modules/` |
| L23–47 "Probe method" | 0.144.6 isolation protocol + the un-isolated `--help` deviation | add the 0.145.0 method: two throwaway `CODEX_HOME`s, auth copied, mtime-find isolation proof, zero bypass-flag use |
| L103 skills-by-reference row | DEFERRED, "highest-value row to close next" | resolve to DISPROVEN on 0.145.0, with 0/19 vs 19/19 via `skills/list` |
| L128 untrusted-hook row | "It silently no-ops… most dangerous behaviour found" | keep — re-confirmed on 0.145.0 |
| L129 "Can trust be persisted?" | `CONFIRMED (surface) / DEFERRED (write path not exercised)` | **CONFIRMED (write path exercised)** with the key/hash mechanism |
| L131–140 "Consequence for the binding" | ends "launch-time trust verification is **not yet implemented**" | rewrite: the scriptable path exists; both wrong postures still stated unsoftened |
| L293–309 open-rows table | row 0 PARTIAL (no scriptable path), row 1 DISPROVEN | row 0 → DELIVERED on 0.145.0; row 1 → re-pinned to 0.145.0, still a codex limitation |

New content added, not scattered: one `## Re-probe — codex-cli 0.145.0` section carrying the
`hooks/list` request sequence, the `HookMetadata` field list, the `config.toml` write shape, the
`trustStatus` enum, the BLOCK/ALLOW ground-truth matrix, the 0.145.0 payload dump with its new
fields, the PascalCase/camelCase two-vocabulary warning, the protocol event-name enum, the
0/19-vs-19/19 skills result, and the `marketplace add` source-form matrix (bare / `./`-prefixed /
absolute) with the `owner/repo`-shorthand root cause and the `git clone` error text. It also carries
the two new DEFERRED rows the delivery designs around rather than assumes: whether `hooks/list`
needs an authenticated `CODEX_HOME`, and whether it reports `command` raw or shell-expanded.

**Honesty rule for this part**: rows that were *not* re-probed on 0.145.0 keep their 0.144.6 pin.
Re-labelling the whole record 0.145.0 would fabricate evidence — the exact failure mode this file
exists to prevent. The version pin therefore moves from being a document-wide implicit to being
explicit where it differs.

The file is in the intention-lint living corpus (`scripts/living-corpus.sh` enumerates
`docs/contributing/specs/*.md`). It carries no `subjects:` frontmatter, so `parseSubjects` returns
`null` and the page is skipped, not rejected — editing the body keeps `intention-lint` green, and
this change does not add frontmatter to it.

### Part 6 — `adapters/codex/README.md`

**Context block** — sections and the tests that pin them:

- L7–40 `## Load`. L15 `codex plugin marketplace add adapters/codex` → `codex plugin marketplace
  add ./adapters/codex`, with one line disclosing why: on 0.145.0 a bare path matches the
  `owner/repo` GitHub shorthand and is resolved against GitHub, and the `./` prefix is what marks
  it as a local path. An absolute path works too but is not what the README shows, since it varies
  per checkout. L26 `**The 19 shared skills do NOT load by reference on Codex 0.144.6 (pinned
  live).**` → re-pin to 0.145.0 with the 0/19-vs-19/19 ground truth. The symlink block at L33–35
  **stays**, and stays framed as the working path, not a contingency.
- L51–75 `## Install-time hook trust`. Step 1 becomes the scriptable command; the interactive
  trust-on-prompt route is retained as the alternative. Steps 2 and 3 are unchanged: the bypass
  flag stays named and stays discouraged. Step 4 ("Launch-time trust verification is not
  implemented") is rewritten to describe `--check` — available on demand, deliberately not wired
  into every launch. That rewrite is contingent on candidate 4 resolving to (a); under (b) step 4
  stands unchanged, and under (c) it becomes a statement that launch fails on an untrusted hook.
- L77–107 `## Guard — honest enforcement profile` keeps every carve-out unsoftened; the row about
  hook enforcement being "bought at the cost of the one-time install-time trust step" is updated
  to say that step is now scriptable, not that the cost vanished.
- `adapters/codex/test/native-surface.test.js` L307 `describe('README.md — honesty pins')` pins
  `git -C`, `fail open`, `not measured`, `--dangerously-bypass-hook-trust`, `$CODEX_HOME/skills`,
  `trust` + `silently no-ops|silent no-op`, `--ephemeral`. **Every one survives.** Two pins are
  added in the same commit: the `./`-prefixed marketplace-add form with its shorthand-misresolution
  disclosure, and the scriptable trust path. The pin asserts the `./` prefix specifically — a pin
  that merely required the string `adapters/codex` would pass against the broken bare form.
  The hygiene loops at L277/L287/L297 (`authoredSurfaces()` includes
  `README.md`) keep the README free of shell-injection expansions, provenance refs, and bare
  `${CLAUDE_PLUGIN_ROOT}`.
- `README.md` is *not* in `run_prose_lint`'s exclusion list in `scripts/ci.sh`, so the advisory
  prose gate reads it; keep the edits declarative.

### Part 7 — `BACKLOG.md`

**Context block** — the file's own conventions, read from the neighbouring entries in the same
section: a delivered follow-up stays **in place** under its `### Open (scoped …)` heading, its bold
title gaining `— delivered <YYYY-MM-DD>` plus the run name, its body stating mechanism and
evidence. The model to copy is the neighbouring **"Measure what each codex sandbox mode actually
blocks, per mode — delivered 2026-07-21"** entry, which sits inside this same `### Open (scoped …)`
heading. Entries are not moved to a separate delivered section.

- **L357 entry (1)** — title changes from "PARTIALLY delivered 2026-07-21; scriptable-trust stays
  OPEN (codex-0.144.6 limitation)" to delivered, dated today, naming this run. Body: the
  0.144.6-era finding is retained as history (an untrusted hook silently no-ops — still true), and
  the limitation clause is replaced by the 0.145.0 mechanism (`hooks/list` over `codex
  app-server` → `[hooks.state."<key>"] trusted_hash`), the fail-closed BLOCK/ALLOW ground truth,
  and the shipped surface. The already-delivered `fb4b922` payload-shape bullet is left as-is.
- **L377 entry (2)** — stays OPEN. Title re-pins `codex-0.144.6` → `codex-0.145.0` and dates the
  re-probe. Body keeps the fixed manifest-location bug, and replaces the by-reference evidence
  with the 0.145.0 `skills/list` ground truth (0/19 without the symlink farm, 19/19 with it) plus
  the cached-manifest field-drop table. The symlink fallback stays named as the working route.
- **Defect (3)** is recorded in the same section as a delivered doc fix (the `./` prefix), stating
  it as observed 0.145.0 behaviour rather than as a regression — 0.144.6's resolution of the bare
  form was never re-probed. It opens no new follow-up.
- `scripts/backlog-lint.sh` only asserts the five required headings, none of which move.
  `intention-lint` checks BACKLOG's `> SoT —` pointer block (L8–9) resolves; that block is not
  touched.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Shape of the trust helper** | (a) node bin + pure `src/` modules, injected deps; (b) shell script (`install.sh`) driving `codex` + `awk`/`sed`; (c) fold into an existing module with no new entry point | **(a)** | JSON-RPC framing, id-matching and TOML basic-string escaping are exactly what shell does badly; `ci.sh` shellcheck covers only `scripts/*.sh` + `hooks/*.sh`, so an adapter shell script would ship unlinted; (a) is the repo's own thin-bin-over-pure-main pattern and the only one that satisfies "no test spawns real codex" cleanly. |
| 2 | **Where it lives** | (a) `adapters/codex/bin/trust-hook.js` + `adapters/codex/src/*.js` (creates the first adapter `bin/`, setting a precedent for the other six bindings); (b) `engine/bin/` + `engine/src/`; (c) `scripts/codex-trust-hook.sh` at repo root | **(a)** | The app-server protocol and `config.toml` shape are codex-specific; ADR-085/ADR-252 put binding-specific surface in the adapter. (b) would put a vendor protocol client in the engine core. The precedent question — do adapters get `bin/` dirs — is the real decision here and is yours. |
| 3 | **Command scope** | (a) trust-only command, README keeps the other install steps as documented manual steps; (b) a full `install.js` that also does `marketplace add`, `plugin add`, the symlink farm and the config merge; (c) fold trust into a launch precondition so every run self-heals | **(a)** | Smallest surface that closes the limitation. (b) spawns `codex` for two subcommands and owns symlink creation in a user's `$CODEX_HOME` — much larger authority, and the marketplace-path defect it would absorb is a one-line doc fix. (c) makes every launch pay an app-server spawn and turns a security decision into an implicit one. |
| 4 | **Read-only verify mode** | (a) ship `--check` (reports trust state, never writes, non-zero when untrusted); (b) trust-only, no verify — README keeps "launch-time trust verification is not implemented"; (c) wire verification into `buildLaunchArgs`/the launch path so an untrusted hook fails the run | **(a)** | The `hooks/list` read is already implemented for the trust path, so `--check` costs one flag and no launch-time spawn. It converts the binding's standing honesty caveat into a capability an operator or CI can invoke, without making every run pay for it. (c) is defensible later, once the auth question in Part 3 is pinned. |
| 5 | **Re-trust on `modified`** | (a) automatic — a `modified` hook is re-trusted after verifying its `command` still names craft's own guard script; (b) require an explicit `--retrust` flag, so a definition change never silently regains trust; (c) refuse and tell the operator to re-trust interactively | **(a)** | `currentHash` covers the hook **definition**, not the guard script's contents, and the tool only ever trusts a hook whose command names craft's own guard script — so the realistic `modified` cause is craft updating its own `hooks.json`. (b) is the stricter posture and is a legitimate call if you want a human in the loop on any definition change; it costs one flag and one README line. |
| 6 | **TOML write strategy** | (a) hand-rolled quoted-key upsert over the pinned one-table/one-key subset; (b) add a TOML parser dependency; (c) drive codex's own `config/batchWrite` over app-server | **(a)** | The repo has exactly one runtime dependency (`js-yaml`); adding a TOML parser to write two lines inverts that posture. **(c) is UNPINNED** — `config/batchWrite` was only seen as a string in the binary and as the TUI's path; the direct config write is what was proven live, and designing against an unprobed RPC is the failure mode this record exists to prevent. If you prefer (c), it needs its own live probe first. |
| 7 | **How much of the poc-record changes** | (a) append one dated `Re-probe — codex-cli 0.145.0` section + surgically correct only the rows the re-probe falsified, leaving un-re-probed rows pinned at 0.144.6; (b) full rewrite, re-pinning every row to 0.145.0; (c) bump the version-identity rows only, evidence lives in the design doc | **(a)** | (b) would assert 0.145.0 evidence for rows nobody re-probed — fabrication in the one document whose purpose is refusing that. (c) leaves the falsified hook-trust rows standing as current truth, which is the more dangerous half of the record. (a) keeps the record's CONFIRMED/DEFERRED discipline intact and makes the version pin explicit where it differs. |

## Test strategy

Strict TDD, Given/When/Then titles, AAA bodies, `sut` variable, one atomic commit per part, full
`scripts/ci.sh` green at every commit.

**Unit seams (new, `adapters/codex/test/`)** — `run_suite` enumerates the directory with `find`, so
no `ci.sh` edit is needed and `test/every-test-file-registers.test.js` picks the files up:

- `hook-trust.test.js` — `buildRequests` emits the two pinned lines with the pinned ids and
  `params.cwds`; `parseHooksList` selects by id across interleaved notifications, over an
  out-of-order stream, and over a stream where the id-2 response arrives before id-1; throws on a
  JSON-RPC `error` member, on a malformed line, and on a missing response. `selectCraftHook`
  returns the single match, throws on zero, throws on two — **and matches both command variants**:
  the raw `node ${CRAFT_ROOT:-…}/adapters/codex/hooks/craft-guard.js` form and a fully shell-expanded
  absolute form. That pair is the regression test for the one unpinned field this design routes
  around; without it the matcher could be green against whichever variant the author imagined.
  `planTrust` covers all five status branches including the unknown-status throw. Fixtures are
  captured `hooks/list` payloads — real field names, real key shape
  (`…/config.toml:pre_tool_use:0:0`), real `sha256:` hash.
- `config-toml-trust.test.js` — `toQuotedTomlKey` over the pinned key, over a `$CODEX_HOME`
  containing `"`, one containing `\`, and one containing a control character. `upsertTrustedHash`
  over: empty file; file with unrelated tables; file already carrying the table with the same hash
  (byte-identical output); file carrying the table with a **different** hash (value replaced, and
  the output contains exactly one occurrence of the table header); file carrying the table with no
  `trusted_hash` key. Double-application asserted byte-identical. The escaping seam gets a
  table-driven matrix plus two invariants — the emitted key opens and closes with `"`, and carries
  no unescaped `"` between them — rather than a round-trip, since no unescaper exists to round-trip
  against and writing one only to satisfy a test would be a second implementation of the same
  rules.
- `trust-hook-main.test.js` — `main` driven with a fake `runAppServer` returning canned stdout, a
  fake in-memory config, and a fake `resolveRoot`. Asserts: the write path writes once with the
  upserted text and exits 0; the already-trusted path writes **nothing** and exits 0; a missing
  guard script refuses before spawning; a zero-match / multi-match hook list exits non-zero with a
  reason and writes nothing; a disabled matched hook exits non-zero and writes nothing; both
  `CODEX_HOME` and `HOME` unset refuses before touching the filesystem; a timeout from
  `runAppServer` exits non-zero naming the timeout; `--check` never calls `writeConfig` and returns
  non-zero for `untrusted`/`modified`. A negative assertion pins that **no** code path emits
  `--dangerously-bypass-hook-trust` or the `bypass_hook_trust` key.

**No test spawns real `codex`, and no test touches a real `$CODEX_HOME`.** Every filesystem and
process boundary is injected. This is not a preference: a real-binary spawn hangs CI for tens of
minutes on any machine where the tool is installed, and `codex app-server` never exits on its own.

`run_suite` invokes the codex suite with cwd `adapters/codex`, so the new tests locate fixtures the
way the existing ones do — from `dirname(fileURLToPath(import.meta.url))`, never from
`process.cwd()`.

**Mutation coverage.** `adapters/codex/src/hook-trust.js` and
`adapters/codex/src/config-toml-trust.js` join `engine/stryker.conf.json` `mutate[]`, with
`adapters/codex/test/hook-trust.test.js` and `adapters/codex/test/config-toml-trust.test.js` added
to `tap.testFiles` in the same commit — `engine/test/mutation-config.test.js` enforces that
pairing in both directions and refuses binding-wide globs. These two modules gate whether the guard
enforces at all, which is the same reason `git-guard-adapter.js` is already mutated.
`trust-hook-main.js` is orchestration over injected deps and stays out of `mutate[]`, consistent
with how the adapter's other entry-shaped modules are treated.

**Doc/ledger gates.** `scripts/design-lint.sh` over this file (six required headings);
`scripts/backlog-lint.sh` over `BACKLOG.md`; `intention-lint` over the living corpus (which
includes the edited poc record and `BACKLOG.md`); `docs-structure-lint` over `docs/contributing`
and the audience split. The new README pins land in `native-surface.test.js` in the same commit as
the README edit, so the documented posture cannot silently drift back.

**Live re-verification is out of this change's test scope by design.** The evidence in *Context*
is the pinned matrix; re-running it is an on-demand operator probe in a throwaway `CODEX_HOME`,
never a CI gate — the poc record is explicitly not CI-gated.

## Out of scope

- **Delivering by-reference shared-skill loading.** Re-probed and still broken on 0.145.0; the
  symlink fallback stays. Nothing to build, and the backlog entry stays open against codex.
- **Retiring or automating the symlink fallback.** It is the only route that loads 19/19; a helper
  that creates symlinks in a user's `$CODEX_HOME` is a separate authority question.
- **Any change to the guard's verdict logic.** The re-probe confirms `tool_input.command` is still
  correct; fail-closed semantics are untouched.
- **Wiring trust verification into every launch.** `buildLaunchArgs` keeps its current posture; the
  `--check` mode is on demand (candidate 4).
- **A full codex installer** (marketplace add, plugin add, symlink farm, config merge) — candidate 3.
- **Using `config/batchWrite` or any other unprobed app-server method.** Only the pinned
  `initialize` + `hooks/list` sequence is used.
- **`--dangerously-bypass-hook-trust` and the `bypass_hook_trust` config key**, in any form,
  including as a documented escape hatch.
- **Re-probing rows the 0.145.0 run did not cover** (sandbox modes, execpolicy matcher semantics,
  telemetry envelopes). They keep their 0.144.6 pins.
- **Agent bodies** — `adapters/codex/agents/*.md` are byte-identity mirrors and are not touched, so
  no six-adapter mirror sync is triggered.
- **The other six bindings.** If candidate 2 establishes an adapter `bin/` convention, applying it
  to aider, antigravity, copilot, cursor, opencode or pi is a later change.
