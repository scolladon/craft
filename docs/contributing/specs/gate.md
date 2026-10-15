---
subjects:
  - engine/src/gates.js
  - engine/src/guards/**
---
# Gate adapter spec

## Port interface

Two distinct mechanisms make up the gate port:

- **tool-guard**: intercept a tool call before execution and veto it when the call violates an
  invariant (e.g. `git diff`/`git show` without `--no-ext-diff`; a path access outside the
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

- `hooks/git-no-ext-diff.sh` — matched to `Bash` tool calls. Detects `git diff` or `git show`
  invocations (allowing global options `-C`, `-c`, `--git-dir`, `--work-tree` between `git` and
  the subcommand) that do not carry `--no-ext-diff`. On a match: emits
  `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
  permissionDecisionReason: "... Re-issue exactly: <fixed-command>" } }` — the corrected command
  is included in the denial so the caller can retry immediately. Passes through: already-compliant
  calls (`*--no-ext-diff*`) and explicitly proxied raw calls (`*rtk proxy*`).
  Rationale for deny-over-rewrite: two `updatedInput` hooks on one event do not compose (same
  snapshot, last writer wins); a deny beats a concurrent rewrite deterministically — one corrected
  retry, no clobber.

  On a crash: Claude Code 2.1.296 treats only exit 2 from a PreToolUse hook as a deny. Exit 1,
  exit 127 and a signal death run the Bash call and show the model a clean result, while exit
  2's stderr reaches the model as `PreToolUse:Bash hook error: [<hook path>]: <stderr>`. So the
  hook turns any failure bash can see into exit 2 with
  `craft git-no-ext-diff: failed (exit <n>), call denied` on stderr, where `<n>` is the status
  it would have exited with, or `craft git-no-ext-diff: no verdict reached, call denied` when
  it would have exited 0 before reaching a verdict. The JSON deny stays the matcher's verdict,
  and a grep failure is a crash, never a no-match: only grep's exit 1 with a printed zero count
  allows. TERM and HUP deny the same way, through traps that hand their status to the crash
  path. With `jq` missing from `PATH`, every Bash call is denied. Still fail-open, because no
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
  (`cat`, `jq`, `grep` and `sed` all do) died at the deadline, the TERM trap ran at once, and
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
`tool_call` predicate (the Pi-side equivalent of `git-no-ext-diff.sh`'s regex logic) is
unit-tested separately (part 5).

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
`git diff`/`show` without `--no-ext-diff` predicate the Claude and Pi bindings enforce. A block
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
| Hook | the `preToolUse` hook (`adapters/copilot/hooks/craft-guard.js`) → `copilotGuard` in `adapters/copilot/src/git-guard-adapter.js` = the destructive-git predicate, then the shared `toolCallGuard` predicate | **Yes** (>= 1.0.92) — denied the destructive and ext-diff rows in the live probe |

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

**Residuals**, written down rather than papered over:

- A hook timeout **fails open**. With no `timeoutSec`, a hook that denied after 20 s still denied;
  at 40 s and 70 s the tool executed (1.0.98). The default is about 30 s; the guard runs well under
  a second.
- Copilot does not persist the hook's stderr audit line anywhere (the `--output-format json`
  stream, `$COPILOT_HOME/logs`): the hook yields no audit trail.
- The out-of-tree `create` denial reaches the model as the generic `denied (fail-closed)` reason,
  because the containment branch carries no reason.
- Git run from a file or a tool the command names indirectly (scripts, `make`, `npm run`, a heredoc
  written to a file and run later, `watch`, `ssh host '…'`, `su -c`, `script -c`, `parallel`,
  `git rebase --exec`, gitconfig aliases), and a dynamic string passed to an evaluator
  (`bash -c "$CMD"`, `eval "$X"`) or word-splitting in the command word (`git${IFS}diff`).
- Destructive verbs outside the shipped set (`checkout -f`/`.`, `restore`, `branch -M`,
  `update-ref -d`, `filter-branch`, `send-pack`).
- Closed, not a residual: cross-call shell state. A function or variable defined in one `bash` call
  was not visible in the next, even with a reused `shellId`, and only `bash` executes shell text
  (`read_bash`, `stop_bash`, `list_bash` cannot inject input) — 1.0.92 and 1.0.98.
- Intended false blocks, each costing one re-issue with literal words: any-word anchoring
  (`echo git push`, `ls /x/git push`), a dynamic command head followed by a verb word, a dynamic
  word at git's option or subcommand position (`git $OPTS status`), and a dynamic `reset`/`branch`
  argument before `--` (`git reset $SHA`).

**gate-command**: the resolved gate string runs as a normal subprocess; the never-commit-on-red
invariant applies identically to the other three bindings.

## Codex binding

**Enforcement profile: strongest recorded so far — the PreToolUse hook genuinely denies.**

Three layers, with distinct enforcement strength:

| Layer | Mechanism | Enforcing? |
|---|---|---|
| PreToolUse hook | `hooks.json` → `hooks/craft-guard.js` → the shared engine guard; exit 2 + stderr reason | **Yes — live-proven; the command never runs and the denial is fed back to the model** |
| Execpolicy `.rules` | `prefix_rule` with nested-list alternation | Partially — token-prefix over argv; defence-in-depth only |
| Sandbox | `-s workspace-write` + `writable_roots` | Unmeasured — claims nothing |

**tool-guard**: `hooks.json`'s `PreToolUse` entry runs `hooks/craft-guard.js` on every tool call.
The hook reads the payload from stdin, keys off `tool_name`/`tool_input` (never the request
body — the tool surface varies by model, and the hook payload is the only surface present across
every model case), reshapes it through `adaptCodexEvent`, and applies the shared engine guard
(`engine/src/guards/tool-call-guard.js`) unmodified — the same predicate the Claude, Pi, and
Copilot bindings enforce. A block exits **code 2** with the reason on stderr: the command never
runs, and Codex feeds the denial back to the model as `function_call_output` on the next turn. A
pass exits 0 and writes nothing to stdout. Any throw — malformed JSON, an unrecognised
`apply_patch` payload shape, an absent `cwd` — is treated as fail-closed, denying rather than
guessing.

**Because this hook genuinely denies, the git-ext-diff rule ships ENFORCED here — the Copilot
binding's advisory carve-out does not carry over.** This is the strongest guard profile recorded
across the five bindings.

`apply_patch` is Codex's write tool, and it is freeform: a Lark-grammar tool with **no structured
path field**, its payload raw patch text. Containment therefore parses **every** filename out of
the patch body — `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:` — not
just the first, because one patch may touch many files and a first-only check reproduces the
known decoy hazard (an in-tree leading hunk masking an out-of-tree later one) in a new shape. A
patch that yields no parsable path fails **closed**.

Four statements ship here unsoftened, honesty over a stronger-sounding claim:

- `git -C . push` and `git --git-dir=.git push` **bypass** the execpolicy layer entirely —
  live-pinned NO MATCH. Enumerating more flag orders cannot close this gap, and a blanket
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
