---
subjects:
  - engine/src/gates.js
  - engine/src/guards/**
---
# Gate adapter spec

## Port interface

Two distinct mechanisms make up the gate port:

- **tool-guard**: intercept a tool call before execution and veto it when the call violates an
  invariant (e.g. `git diff` without `--no-ext-diff`; a path access outside the
  working directory). The veto is enforcement — it is not a blocker.

- **gate-command**: run the descriptor's resolved gate string as a subprocess at the
  gate-cadence boundary. A non-zero exit blocks the commit (never a silent pass). The gate string
  is resolved by `engine/src/gates.js` `resolveGate` with precedence
  `descriptor.gate → manifest.gates[phaseId] → none`.

## Gate-cadence policy (core-owned, port-enforced)

The following decisions are owned by the orchestrator/core and are not re-decided by any adapter:

- **Never commit on red**: a gate that exits non-zero blocks the commit. The port enforces this
  invariant; it does not re-decide it.
- **Targeted gate per fix commit**: every fix commit runs its own targeted gate before landing.
- **Phase gate once per round**: the full phase gate runs once at the end of the round, not after
  every individual fix.
- **Gate string resolution order**: `descriptor.gate` (highest) → `manifest.gates[phaseId]` →
  empty string (no gate required for non-code-producing phases). Code-producing phases with no
  resolvable gate are a floor error caught at pipeline resolution time.

## Binding set

The valid bindings are **`{ claude, pi, opencode, copilot, codex }`**. A binding is listed here when it
**ships a guard binding**, regardless of enforcement strength — this set does not by itself
convey how strong that guard is. Because the set no longer conveys strength, **each per-binding
section below states its own enforcement profile explicitly.**

## Claude binding

**tool-guard**: PreToolUse hooks in `hooks/*`, wired via `hooks/hooks.json`. Each hook receives
the tool input on stdin as JSON and emits a `hookSpecificOutput` JSON object on stdout. The current
hook set:

- `hooks/git-no-ext-diff.sh` — matched to `Bash` tool calls. A bash crash shell around a node
  verdict: it runs `node engine/bin/claude-ext-diff-verdict.js` (`engine/src/claude-ext-diff-hook-main.js`),
  which reads the payload on the inherited stdin and judges `tool_input.command` with
  `gitExtDiffPredicate`, the engine's ext-diff rule and the module codex's and copilot's Bash
  paths use for that rule. The parse sees through wrappers, assignments, subshells, groups,
  reserved words, quote removal, `sh -c`/`eval` and git global options, judges `--no-ext-diff`
  and `rtk proxy` per invocation, and reads quoted text and heredoc bodies as data. A literal
  `--ext-diff` (the last setting before `--`) is denied on every git verb, and `git config` naming
  an `alias`, `include.path` or `includeIf.*` key is denied. `git diff` without `--no-ext-diff` is
  denied; a bare `git show` (any form) is allowed, since git runs no external diff for `show`
  without `--ext-diff`. `git show` is judged like `git diff` when a dynamic option word follows
  the last `--no-ext-diff`, or when the argv git receives may differ from the parsed words: a
  dynamic head (`$G show`), a dynamic global-option value before the verb (`git -C $D show`;
  quoting is not tracked, so `git -C "$D" show` is an accepted over-block), or any word before
  `git` in the same simple command that is not a literal `env`/`command`/`exec`/`nohup`/`time`/
  `nice`/`timeout`/`sudo`/`builtin`/`echo` or an option, number or `NAME=value` operand (`xargs`,
  `parallel`, an unknown or dynamic command). `env -S`/`--split-string` followed by any later word
  is unparseable and denied fail-closed for every command. So is a `;` that follows a heredoc
  inside a `$( )` or `<( )` substitution body: bash 5.3 reprints such a body without that `;`,
  merging the commands around it. A newline, `&&`, `||`, `|` or `&` after the heredoc is
  unaffected, and `git commit -m "$(cat <<'EOF' … EOF⏎)"` still parses. The commands inside a
  `$(( … ))` or `$[ … ]` body reach the predicates; a `'` in that body, a body whose parens do not
  pair, and a line continuation after `$`, between `$(` and `(` or between the closing `))` are
  unparseable, and so are any `case` word in a `$( )`, `<( )` or `>( )` body and any bash 5.3
  `${ …; }`/`${| …; }` function substitution (ADR-687 to ADR-693). Node prints
  exactly one token: `allow`, on which the hook exits 0 with no output, or
  `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
  permissionDecisionReason: "craft: <engine reason>" } }`, which the hook prints as given. The
  reason is the engine's with one `craft: ` prefix:
  `craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)`,
  `craft: command not parseable (env -S re-splits its string with the words after it) — denied fail-closed`,
  `craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed`,
  `craft: --ext-diff is denied on every git verb (external diff mangles parsed output)`,
  `craft: git config naming an alias or include key is denied — an alias can run any git verb`, or the
  config-channel, inline-alias or parse-failure reason (an over-long command included). A
  `tool_input.command` that is absent, `null` or empty is allowed; one that is not a string
  inside JSON objects makes node exit 1, a crash.
  Rationale for deny-over-rewrite: two `updatedInput` hooks on one event do not compose (same
  snapshot, last writer wins); a deny beats a concurrent rewrite deterministically — one corrected
  retry, no clobber.

  On a crash: Claude Code 2.1.296 treats only exit 2 from a PreToolUse hook as a deny. Exit 1,
  exit 127 and a signal death run the Bash call and show the model a clean result, while exit
  2's stderr reaches the model as `PreToolUse:Bash hook error: [<hook path>]: <stderr>`. So the
  hook turns any failure bash can see into exit 2 with
  `craft git-no-ext-diff: failed (exit <n>), call denied` on stderr, where `<n>` is the status
  it would have exited with, or `craft git-no-ext-diff: no verdict reached, call denied` when
  it would have exited 0 before reaching a verdict. The JSON deny stays the verdict,
  and only node's exact `allow` token allows: a node that is missing, older than the engine's
  range, crashes, is killed by a signal, or exits 0 without a token is a crash, as are stdin that
  is not JSON, a missing feed sentinel and a feed that cannot start. Node's own stderr precedes
  the craft line. TERM and HUP deny the same way, through traps that hand their status to the crash
  path. With `node` missing from `PATH`, or older than the engine's supported range
  (`^22.18.0 || >=24.2.0`), every Bash call is denied. Still fail-open, because no
  code in the hook can catch them: `/bin/bash` missing, the hook file missing or not
  executable, and SIGKILL or any other untrapped signal. The probe matrix is in
  [the design doc](../design/claude-hook-nonzero-exit-probe.md).

  On a timeout: Claude Code sends SIGTERM to a hook that runs past its `timeout` (documented
  default 600 s; `hooks/hooks.json` sets none), then runs the Bash call whatever the hook exits
  with or prints, and the model sees a clean result with no hook event. On 2.1.296, with the
  hook interrupted in a background wait, the probe tried both deny channels after the TERM:
  exit 2 with a stderr reason, and a JSON `permissionDecision: "deny"` on stdout. Both were
  ignored. On 2.1.299, with the hook stalled in a foreground command, the SIGTERM reached the
  hook's whole process tree, found by parent pid, so a foreground child that dies on TERM
  (the probed hook's `cat`, `jq`, `grep` and `sed` all do, as does `node`, the hook's only
  child now) died at the deadline, the TERM trap ran at once, and
  its crash deny was ignored the same way. A tree that survived the TERM was SIGKILLed about
  1.2–1.7 s later. Claude Code did not hang. So a timeout fails open, and nothing the hook does
  after the deadline is read. The TERM and HUP traps stay: they deny either signal from any
  other sender. The timeout matrices are in
  [the background-wait design doc](../design/claude-hook-timeout-probe.md) and
  [the foreground-stall design doc](../design/claude-hook-foreground-stall-probe.md).

**gate-command**: the resolved gate string is executed as a Bash subprocess. Non-zero exit blocks
the commit.

## Pi binding

**tool-guard**: Pi exposes `pi.on("tool_call", handler)`. The handler receives the pending tool
call and returns `{ block: true, reason }` to veto it. The veto shape is exactly `{ block: true }`;
there is no `permission: "deny"` field. Handler errors block fail-safe (an unhandled throw in the
handler is treated as a veto). Pi has no harness-hook concept — the `pi.on("tool_call", ...)` hook
is Pi's equivalent of the PreToolUse mechanism, not a hook file on disk. The deterministic
`tool_call` predicate (the Pi-side equivalent of `git-no-ext-diff.sh`'s ext-diff verdict) is
unit-tested separately (part 5); it enforces the same widened rule (`--ext-diff` on any verb, `git config` alias/include keys; `git show` judged on `--ext-diff`, not default-denied).

**gate-command**: Pi has no harness-hook concept for gate execution; the resolved gate string is
run as a normal subprocess via `execFile` or equivalent (argv array, no shell). The never-commit-
on-red invariant applies identically — non-zero exit blocks the commit.

## opencode binding

**Enforcement profile: enforcing.**

**tool-guard**: `adapters/opencode/plugins/git-guard.ts` registers a `tool.execute.before(input,
output)` hook (opencode 1.18.3 expects a plugin's hooks at the top level, keyed by hook name, not
wrapped in a `hooks` object). The plugin composes `adapters/opencode/src/git-guard-adapter.js`
(`commandFromToolEvent`, reading the bash command from `output.args.command` with a defensive
`input.args.command` fallback) over `adapters/opencode/src/git-guard-predicate.js` — the same
`git diff` without `--no-ext-diff` predicate the Claude and Pi bindings enforce (the shared predicate also denies any-verb `--ext-diff`, `git show` judged on `--ext-diff`, and `git config` alias/include keys). A block
verdict throws inside the hook, which opencode surfaces to the caller as the tool failure; the
worker retries with the corrected call. `opencode.json`'s `permission.external_directory: deny`
is the containment mechanism alongside the guard, denying tool access outside the working
directory.

**gate-command**: the resolved gate string runs as a normal subprocess; the never-commit-on-red
invariant applies identically to the other bindings.

## Copilot binding

**Enforcement profile: all three layers enforce on copilot >= 1.0.92.**

Until 1.0.63 the `preToolUse` hook fired but could not deny (a live probe showed
`git push --force origin main` executing unimpeded). On 1.0.92 a JSON deny on stdout and an exit
code 2 both block the tool, and the hook is the enforcing layer
(`docs/contributing/specs/copilot-poc-record.md` row 11, live probe 2026-10-15). The guard binds as
**three layers**:

| Layer | Mechanism | Enforcing? |
|---|---|---|
| Containment | native path verification; `--add-dir <worktree>` required, `--allow-all-paths` forbidden | **Yes** — live-proven: an out-of-tree `create` was blocked with no `--allow-all-paths` supplied; with it, the hook alone still denied (file absent) |
| Command policy | the `--deny-tool` pattern set from `adapters/copilot/src/deny-tool-args.js` | **Yes** — live-proven; denial rules take precedence even over `--allow-all-tools`; the floor on a copilot older than 1.0.92 |
| Hook | the `preToolUse` hook (`adapters/copilot/hooks/craft-guard.js`) → `copilotGuard` in `adapters/copilot/src/git-guard-adapter.js` = the plain-command gate, then the destructive-git predicate, then the shared `toolCallGuard` predicate | **Yes** (>= 1.0.92) — denied the destructive and ext-diff rows in the live probe |

**Deny and crash channel.** A block writes `{"permissionDecision":"deny","permissionDecisionReason":…}`
on stdout and exits 0; the model sees the reason. A guard that throws, an unresolvable import and an
unadaptable payload deny too: exit 2 shows `hook exited with code 2`, a missing hook file or a
missing `node` shows `(hook errored)`. `{"permission":"deny"}` is still ignored (the tool
executes). The hook is declared in `$COPILOT_HOME/settings.json`: on 1.0.98 a hook in `config.json`
is not loaded (1.0.92 migrated it).

**tool-guard**: the launch-time layers are built by `buildLaunchArgs` in
`adapters/copilot/src/deny-tool-args.js` — `--add-dir <workingDir>` (never `--allow-all-paths`)
plus a `--deny-tool=shell(...)` pattern per entry in `DENY_TOOL_PATTERNS` (flag-order and
long-form variants of `git push`, `git reset --hard`, `git clean -fd`, `git branch -D`).

**`--deny-tool` is defence-in-depth, not an adversarial sandbox.** The matcher is live-pinned as
**prefix matching on the command string** — it does not parse argv
(`docs/contributing/specs/copilot-poc-record.md` row 20). An interposed global option
(`git -C <dir> push`, `git --git-dir=… push`, `git -c k=v push`) bypasses every pattern in the set,
live-confirmed for `git -C . push` against `shell(git push)`. A blanket `shell(git:*)` is
deliberately rejected — it denies *all* git. The hook is the second layer that closes that gap: it
tokenises the command, so `git -C . push origin main` was denied with the ref unmoved (1.0.92 and
1.0.98).

The hook reads the lowercase Copilot event, whose `toolArgs` arrives as a JSON object on 1.0.92
(a JSON-encoded string on 1.0.63), and reshapes it (`adaptCopilotEvent` maps `bash`→`Bash`,
`create`→`Write`, `edit`→`Edit`, and bridges the executed `path` field — never `file_path`, which
does not exist in Copilot's tool schemas — unconditionally onto `file_path` so an inspected decoy
can never mask the field the tool actually executes on). It applies the shared `gate.js`
`toolCallGuard` predicate unmodified, single-sourcing the git-diff/`--no-ext-diff` rule across
every binding. The ext-diff rule is therefore enforced for this binding: `git diff HEAD~1 > f`
was denied (file absent) and `git diff --no-ext-diff HEAD~1 > f` executed.

**Plain-command gate.** First stage of the hook. When a command mentions git, it must be plain:
literal or quoted words; `;`, `&&`, `||`, `|`, `&` and newline separators; literal output redirects;
none of `$ \` \ ! ( ) { } [ ] * ? < #` outside single quotes; no evaluator or wrapper in command
position; no `GIT_CONFIG_`; see the near-git rules below. Otherwise the hook denies with
`craft: command too complex to verify near git — spell it plainly`; the remedy is to re-issue the
git part plainly. The `"$(cat <<'EOF' … EOF)"` commit idiom that some harnesses emit is denied. On
macOS `/bin/bash` 3.2 it fails to parse when the body holds an odd quote, an odd backtick or an
unbalanced `(`, and an unbalanced `)` in the body ends the substitution early and runs the rest as
shell. Commit the way craft's core contract teaches: `git commit -m "<message>"` (one
double-quoted `-m` per paragraph), or `git commit -F <file>` when the message holds
`` " $ ` \ ! ``. On copilot the file outside the working tree is written by a `bash` call that
does not mention git (`printf '%s\n' '<message>' > /tmp/msg`): `create` outside the working
directory is denied by containment, and so is a write whose message names git and holds `$` or a
backtick.

**Near-git rules.** Beyond plainness, four rules apply to any command that mentions git:

- `-c <key>=…` and `--config-env=<key>=…` keys must be in a safe set: `user.name`, `user.email`,
  `commit.gpgsign`, `tag.gpgsign`, `core.quotepath`, `color.ui`, `init.defaultbranch`,
  `format.pretty`, `diff.noprefix`, any `color.*`, `advice.*` or `log.*`, and `pager.<cmd>=false`.
  Any other key denies: git runs the value of keys such as `core.fsmonitor`, `core.sshCommand`,
  `credential.helper` and `core.pager` (proven with real git).
- Any `GIT_<NAME>=` assignment near git denies, for the same reason.
- Shells anywhere: `sh bash zsh dash ksh fish csh tcsh mksh yash busybox eval` deny at **any** word
  position (an unlisted wrapper such as `caffeinate` or `stdbuf` could otherwise put a shell out of
  command position), while `env exec command nohup time sudo nice timeout xargs source . trap hash
  builtin enable fc coproc alias mapfile readarray compgen` deny in command position (the last
  three run their `-C` callback as shell text).
- A command word that opens with `=` denies: zsh expands `=git` to git's path.

**Guard modules.** The guard logic lives in `engine/src/guards/`: `shell-tokeniser.js` (bash
tokeniser), `git-argv.js` (git global-option normaliser), `shell-git-invocations.js` (anchoring and
judging), `git-plain-command-gate.js` (the plain-command gate), `git-destructive-predicate.js`,
`git-ext-diff-predicate.js` and `git-bash-verdict.js` (the shared Bash verdict copilot and codex
call: gate, then destructive git, then ext-diff over one parse). The guard protects parsed command
output from an external diff driver by reading command text; it is not a sandbox.

**Verdict deadline.** The verdict is computed in a worker thread under a 5 s deadline; a miss denies
(`craft: guard verdict timed out — denied fail-closed`) instead of letting copilot's ~30 s timeout
fail open. Re-probe on 1.0.98 (live probe 2026-10-16): `git -C . push origin main` denied (ref
unmoved); `git status --short && git tag allowed` executed; `bash -c 'git push origin main'` denied
by the gate; the commit idiom executed (denied since ADR-606); a forced deadline denied.

**Residuals**, written down rather than papered over:

- A hook timeout **fails open**. With no `timeoutSec`, a hook that denied after 20 s still denied;
  at 40 s and 70 s the tool executed (1.0.98). The default is about 30 s; the 5 s verdict deadline
  is the guarantee, and a realistic command runs well under a second.
- Copilot does not persist the hook's stderr audit line anywhere (the `--output-format json`
  stream, `$COPILOT_HOME/logs`): the hook yields no audit trail.
- Git reached through channels a static guard cannot follow, accepted by design: `echo push | xargs git`;
  stdin into a shell (`bash <<< 'git push'`, `sh <<EOF … EOF`); `$((…))` bodies; an interpreter
  given a literal string (`python3 -c 'import os; os.system("git push")'`); git run from a file or
  a tool the command names indirectly (scripts, `make`, `npm run`, a heredoc written to a file and
  run later, `watch`, `ssh host '…'`, `su -c`, `script -c`, `parallel`, `git rebase --exec`);
  gitconfig-file aliases; a dynamic string passed to an evaluator (`bash -c "$CMD"`, `eval "$X"`);
  word-splitting in the command word (`git${IFS}diff`).
- The ext-diff rule's residuals: a dynamic `--ext-diff` word on a non-diff verb
  (`X=--ext-diff; git log -p $X`) and a fully dynamic `git config` key (`git config "$K" diff`),
  both blocked by the plain gate on codex and copilot only; an alias already present in a
  gitconfig; `git config --edit` through `GIT_EDITOR` and `git clone -c alias.*`, both also
  blocked by the plain gate on codex and copilot only. Deliberate
  over-blocks: `git config --get alias.x`, `git config --get include`, `git config alias.x status`,
  `echo git log --ext-diff`, `git log --grep --ext-diff`, and an alias or include word after a word
  that may be git and a verb that is `config` or unreadable (`grep -rn "$PAT" config include`,
  `grep "$a" "$b" alias`) — the same shape as `command $G config alias.x` and
  `git $C alias.x`, which the rule must deny.
- `diff.<driver>.textconv` runs on a bare `git show` as on `git log -p` and `git diff --no-ext-diff`;
  no rule covers textconv. Git older than 2.17.0 is unprobed. `env -S` backslash escapes
  (`env -S 'git\_show\_--ext-diff'`) are not modelled.
- A renamed or copied git binary (`ln -s "$(command -v git)" x; ./x push`, `cp`) is not visible to a
  string guard; `hash -p` is blocked.
- Destructive verbs outside the shipped set (`checkout -f`/`.`, `restore`, `branch -M`,
  `update-ref -d`, `filter-branch`, `send-pack`).
- Closed, no longer residuals: `--ext-diff` on non-diff verbs and `git config` alias/include
  writes, including a `rename-section`/`copy-section` onto an `alias` or `include` section; shell aliases via an `alias` builtin with a git word, `GIT_CONFIG_*`
  env channels and `-c include.path`, and brace/glob/`$'\…'`/`$"…"`/dashed `git-<verb>`/wrapper
  dynamic words now block. Work is bounded by a 131072-char cap and a nesting cap, backed by the
  verdict deadline: the 80 KB `eval` chain that took 49 s and then
  aborted now denies in 0.06 s (live probe 2026-10-15). Every fail-closed denial carries a reason,
  including `craft: write outside the working directory is denied in this binding`.
  Codex `write_stdin` into a tty session is closed too: `[features] unified_exec_tty = false` in
  the template and `-c features.unified_exec_tty=false` in the documented `codex exec` command
  make codex refuse `tty: true`, and a non-tty session's stdin is closed, so `write_stdin` fails
  (offline probe 2026-10-18, 0.162.1; the template key and the flag re-confirmed 2026-10-22 on
  0.163.0).
  Closed only while that config holds: without the flag, a
  trusted project's `.codex/config.toml` setting `unified_exec_tty = true` overrides the template
  key and reopens it. Only `codex exec` was probed (not the TUI or app-server turns), and a codex
  release that ignores the key would reopen it silently.
  Copilot `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or
  interactive (pty) sessions (live probe 2026-10-21, 3/3 each). The request `tools` list carries
  `bash`, `read_bash`, `stop_bash`, `list_bash` only, a `write_bash` call is rejected as
  `Tool 'write_bash' does not exist`, and an async shell's stdin is `/dev/null`. The preToolUse
  hook fires for the call and the guard passes that name through unjudged. A copilot version whose
  request `tools` list carries `write_bash` again reopens it.
- Closed, not a residual: cross-call shell state. A function or variable defined in one `bash` call
  was not visible in the next, even with a reused `shellId`, and only `bash` executes shell text
  (`read_bash`, `stop_bash`, `list_bash` cannot inject input) — 1.0.92 and 1.0.98.
- Intended false blocks, each costing one re-issue with a literal command: `git commit -c <rev>` (read as an unsafe `-c` key); `git add scripts/sh`; `bash -c 'git status'`;
  a `$` or backtick in any quoted word, or a backslash or exclamation mark in a double-quoted one
  (`git commit -m 'cost $5'`, `git commit -m "stop!"`); a callback builtin in command position
  (`git log | mapfile -t a`); a commit-message write whose message names git and holds `$` or a
  backtick (`printf %s 'fix(git): costs $5' > /tmp/m` — rephrase it); `git log # c`; `git diff > o < i`; `echo git push` and
  `ls /x/git push` (any-word anchoring); a dynamic command head; a dynamic word at git's option or
  subcommand position (`git $OPTS status`); a dynamic `reset`/`branch` argument (`git reset $SHA`);
  pattern words (brace/glob) near a verb word; a dynamic word before a verb word; a file named
  `git-<verb>`; an opaque `$'\…'` passed to an evaluator; and control-flow-unreached git (a static
  guard cannot know `a && git push` short-circuits).

**gate-command**: the resolved gate string runs as a normal subprocess; the never-commit-on-red
invariant applies identically to the other three bindings.

## Codex binding

**Enforcement profile: strongest recorded so far — the PreToolUse hook genuinely denies.**

Three layers, with distinct enforcement strength:

| Layer | Mechanism | Enforcing? |
|---|---|---|
| PreToolUse hook | `hooks.json` → `hooks/craft-guard.js` → the shared Bash verdict (`plainGitCommandVerdict`) for Bash, `toolCallGuard` containment per path for `apply_patch`; exit 2 + stderr reason | **Yes — live-proven; the command never runs and the denial is fed back to the model** |
| Execpolicy `.rules` | `prefix_rule` with nested-list alternation | Partially — token-prefix over argv; defence-in-depth only |
| Sandbox | `-s workspace-write` + `writable_roots` | Unmeasured — claims nothing |

**tool-guard**: `hooks.json`'s `PreToolUse` entry runs `hooks/craft-guard.js` on every tool call.
The hook reads the payload from stdin, keys off `tool_name`/`tool_input` (never the request
body — the tool surface varies by model, and the hook payload is the only surface present across
every model case), reshapes it through `adaptCodexEvent`, and judges it: a Bash call by
`plainGitCommandVerdict` (`engine/src/guards/git-bash-verdict.js`), the same verdict the Copilot
binding enforces; an `apply_patch` call by `toolCallGuard`, once per extracted path. A block exits **code 2** with the reason on stderr: the command never
runs, and Codex feeds the denial back to the model as `function_call_output` on the next turn. A
pass exits 0 and writes nothing to stdout. Any throw — malformed JSON, an unrecognised
`apply_patch` payload shape, an absent `cwd` — is treated as fail-closed, denying rather than
guessing.

**Because this hook genuinely denies, the git-ext-diff rule ships ENFORCED here — the Copilot
binding's advisory carve-out does not carry over; destructive git and the plain-command gate ship
enforced too.** Unlike Copilot, codex takes the gate without a verdict deadline: its default hook
timeout exceeded 90 s when measured and the slowest measured verdict took about 190 ms (ADR-641). This is the strongest guard profile recorded
across the five bindings.

`apply_patch` is Codex's write tool, and it is freeform: a Lark-grammar tool with **no structured
path field**, its payload raw patch text. Containment therefore parses **every** filename out of
the patch body — `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:` — not
just the first, because one patch may touch many files and a first-only check reproduces the
known decoy hazard (an in-tree leading hunk masking an out-of-tree later one) in a new shape. A
patch that yields no parsable path fails **closed**.

Four statements ship here unsoftened, honesty over a stronger-sounding claim:

- `git -C . push` and `git --git-dir=.git push` **bypass** the execpolicy layer entirely —
  live-pinned NO MATCH; the PreToolUse hook denies both forms with the destructive-git push reason. Enumerating more flag orders cannot close this gap, and a blanket
  `pattern=["git"]` rule would deny *all* git, breaking craft's own git-heavy workflow.
- A malformed `.rules` file **may fail open** at runtime — treated as fail-open until proven
  otherwise.
- Per-sandbox-mode blocking was **not measured**. The binding selects `-s workspace-write` and
  documents the selection; it does not advertise containment.
- Hook enforcement costs `--dangerously-bypass-hook-trust`, which is required for headless
  automation to clear the trust prompt and emits a visible warning item every run. That trade —
  a denying guard in exchange for a bypassed trust prompt — is this binding's central posture.

**gate-command**: the resolved gate string runs as a normal subprocess; the never-commit-on-red
invariant applies identically to the other four bindings.

## Failure → blocker

**Gate exits non-zero**: this is a commit block, never a silent pass. The adapter surfaces the
non-zero exit to the orchestrator, which escalates via the blocker protocol that `contracts/core.md`
injects into every spawn (`{ unit, reason, ≤3 options }`). This spec relies on that injected
invariant and does not restate it.

**tool_call veto**: this is enforcement, not a blocker. The veto prevents the tool call from
executing; the worker retries with the corrected call. No blocker protocol is raised.

**Config errors** (knowable before any gate runs): a gate string that references a non-existent
script; a `hooks/hooks.json` that references a hook file that does not exist. Caught at startup
or at pipeline resolution time.
