---
subjects:
  - engine/src/driver-state.js
  - engine/src/driver-state-main.js
  - scripts/driver-state.sh
---
# Driver contract spec

A driver is an external program that launches craft runs and reads what each run leaves behind.
A run is driven when the driver hands it a state directory; otherwise craft writes nothing.

## Activation

`CRAFT_DRIVER_STATE` is the absolute path to an existing, writable per-entry directory the
driver creates. Unset or empty means not driven: craft writes nothing.

`scripts/driver-state.sh active` probes it: exit 0 prints the directory, exit 1 means not
driven, exit 2 means the variable is set but unusable (relative, missing, not a directory, not
writable).

Set `CRAFT_DRIVER_STATE` again on `claude --bg --resume`. Only the launch path was probed: the
variable set on the `claude --bg` launcher reaches the session; the resume path was not
verified.

## State dir layout

| File | Writer | Content |
|---|---|---|
| `status` | craft, last | one line, see Status grammar |
| `next.md` | craft | the rationale for the elected next item |
| `next.prompt` | craft | the ready-to-paste next prompt, every bare `--policy` token stripped |
| anything else | the driver | craft never reads or writes it |

## Status grammar

```
finished = "FINISHED " url            url   = ^https?://\S+$
blocked  = "BLOCKED " phase ": " reason   phase = ^[a-z][a-z0-9-]*$
reason   = 1..240 chars, whitespace runs (incl. newlines) collapsed to one space, trimmed
```

The file is one `\n`-terminated line; split it on the first space. Example:
`FINISHED https://example.test/org/repo/pull/70`.

`FINISHED` means merged. An unmerged run writes `BLOCKED integrate: not merged <pr-or-branch>`;
verify the merge with the VCS host before writing `FINISHED`. Stops before the run starts
(manifest or scope resolution) use phase `resolve`.

## Write order and atomicity

`next.md`, then `next.prompt`, then `status`. Each file is written to `<file>.tmp.<pid>` in the
state dir and renamed into place. `status` is the run's last tool call. It is never
overwritten: an existing `status` (checked with `lstat`, so a symlink counts) refuses the write.

## Exit codes

`scripts/driver-state.sh finished <pr-url> [--election <md> --prompt <prompt>]` and
`blocked <phase-id> <reason…>`:

| Exit | Verb | Meaning |
|---|---|---|
| 0 | all | written (`active`: driven, directory printed) |
| 1 | `active` only | not driven |
| 2 | all | bad env, bad grammar, missing or extra args, unreadable election or prompt file; nothing written |
| 3 | `finished` | the prompt still holds a bare `--policy` token after stripping; nothing written |
| 4 | `finished`, `blocked` | `status` already exists; nothing written |
| 5 | `finished`, `blocked` | a filesystem write failed; the call's temp file is removed and `status` is never written after a failure |

## Strip rule

Before `next.prompt` is written, every bare whitespace-delimited `--policy <value>` (the value
is the next token on the same line holding `=`) and every `--policy=…` token is removed.
Pre-approval never travels through an election.

Quoted or backticked mentions are kept. Residual risk: an orchestrator could still read a quoted
mention as a flag, so the driver's own outward guard stays the real boundary.

## Background sessions

The workspace reaches the worktree by absolute path and never calls `EnterWorktree`. Recorded
result: a `--bg` session wrote into a sibling git worktree with no prompt while a Write into the
shared checkout was refused (CLI 2.1.302).

Fallback for CLI versions where this does not hold: a driver-side `PermissionRequest` hook that
allows `EnterWorktree` only for a git-registered sibling `<repo>-<slug>` worktree whose path
holds no symlink.
