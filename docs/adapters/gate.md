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

The valid bindings are **`{ claude, pi }`**.

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
