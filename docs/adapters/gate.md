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

The valid bindings are **`{ claude, pi, opencode, copilot }`**. A binding is listed here when it
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

**Enforcement profile: mixed — two layers enforce, the third is observational only.**

Copilot exposes no denying hook (a live probe showed `git push --force origin main` executing
unimpeded under a firing-but-observational hook), so the guard binds as **three layers**, only
two of which actually enforce:

| Layer | Mechanism | Enforcing? |
|---|---|---|
| Containment | native path verification; `--add-dir <worktree>` required, `--allow-all-paths` forbidden | **Yes** — live-proven: an out-of-tree `create` was blocked with no `--allow-all-paths` supplied |
| Command policy | the `--deny-tool` pattern set from `adapters/copilot/src/deny-tool-args.js` | **Yes** — live-proven; denial rules take precedence even over `--allow-all-tools` |
| Audit | the `preToolUse` hook (`adapters/copilot/hooks/craft-observer.js`) → `adapters/copilot/src/git-guard-adapter.js` → the shared `toolCallGuard` predicate | **No — observational** |

**tool-guard**: the enforcing layers are launch-time, built by `buildLaunchArgs` in
`adapters/copilot/src/deny-tool-args.js` — `--add-dir <workingDir>` (never `--allow-all-paths`)
plus a `--deny-tool=shell(...)` pattern per entry in `DENY_TOOL_PATTERNS` (flag-order and
long-form variants of `git push`, `git reset --hard`, `git clean -fd`, `git branch -D`). Because
these enforce at the CLI boundary before a tool ever runs, they cover the destructive-git set and
out-of-tree path access directly.

**`--deny-tool` is defence-in-depth, not an adversarial sandbox.** The matcher is live-pinned as
**prefix matching on the command string** — it does not parse argv (`docs/adapters/copilot-poc-
record.md` row 20). Each pattern therefore only covers the literal flag orders it enumerates: an
interposed global option (`git -C <dir> push`, `git --git-dir=… push`, `git -c k=v push`) bypasses
every pattern in the set, live-confirmed for `git -C . push` against `shell(git push)`. A blanket
`shell(git:*)` would close that gap but is deliberately rejected — it denies *all* git, which would
break craft's own git-heavy workflow. This layer catches accidental destructive git; it is not a
guarantee against an adversarial agent working around it.

The `preToolUse` hook fires on every tool call and is wired for audit only: it reads the
lowercase, string-encoded Copilot event, reshapes it (`adaptCopilotEvent` maps `bash`→`Bash`,
`create`→`Write`, `edit`→`Edit`, and bridges the executed `path` field — never `file_path`, which
does not exist in Copilot's tool schemas — unconditionally onto `file_path` so an inspected decoy
can never mask the field the tool actually executes on) and applies the shared `gate.js`
`toolCallGuard` predicate unmodified, single-sourcing the git-diff/`--no-ext-diff` rule across
every binding. It records the verdict to stderr and **always exits 0** — this is deliberate:
neither `{"permission":"deny"}` on stdout nor a non-zero exit blocked a tool call in the live
probe, so the hook must never be read as, or "fixed" into, a blocking control.

**The carve-out is written down, never papered over**: for this binding the ext-diff rule is
**advisory**, because the mechanism that would enforce it — the `preToolUse` hook — cannot deny.
The containment and destructive-git rules above are enforced natively and are strictly stronger
than an advisory hook; only the ext-diff rule rides on the observational layer. Never imply the
hook blocks.

**gate-command**: the resolved gate string runs as a normal subprocess; the never-commit-on-red
invariant applies identically to the other three bindings.

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
