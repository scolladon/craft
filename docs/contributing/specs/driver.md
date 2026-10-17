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
finished = "FINISHED " url            url   = ^https?://[\x21-\x7e]+$  (printable ASCII)
blocked  = "BLOCKED " phase ": " reason   phase = ^[a-z][a-z0-9-]*$
reason   = 1..240 code points; control, format and line-separator characters become spaces,
           whitespace runs collapse to one space, trimmed; a longer reason is truncated, not refused
```

The file is one `\n`-terminated line; split it on the first space. Example:
`FINISHED https://example.test/org/repo/pull/70`.

`FINISHED` means merged: the run writes it only after its own integrate phase merged the PR, and
an unmerged run writes `BLOCKED integrate: not merged <pr-or-branch>`. A driver that must be sure
checks the merge with its VCS host on reading `FINISHED`. Stops before the run starts
(manifest or scope resolution) use phase `resolve`.

## Write order and atomicity

`next.md`, then `next.prompt`, then `status`. Each file is written to `<file>.tmp.<pid>` in the
state dir and moved into place: `next.*` by rename, `status` by a hard link that fails when the
target exists, so a `status` that appears between the check and the write is never replaced.
`status` is the run's last tool call. It is never overwritten: an existing `status` (checked with
`lstat` first, so a symlink counts) refuses the write. The state dir must sit on a filesystem
that supports hard links; elsewhere the link fails and the call exits 5 with no status written.
Once `status` is linked it is published: a temp that cannot be removed afterwards is a warning
on stderr and the call still exits 0.

## Exit codes

`scripts/driver-state.sh finished <pr-url> [--election <md> --prompt <prompt>]` and
`blocked <phase-id> <reason…>`, or `blocked <phase-id> -` to read the reason from stdin (the run
passes free text this way, through a quoted heredoc, so no shell expands it):

| Exit | Verb | Meaning |
|---|---|---|
| 0 | all | written (`active`: driven, directory printed) |
| 1 | `active` only | not driven |
| 2 | all | bad env, bad grammar, missing or extra args, unreadable election or prompt file; nothing written |
| 3 | `finished` | after stripping, the prompt still holds a token that reads as `--policy` (see Strip rule); nothing written |
| 4 | `finished`, `blocked` | `status` already exists, before or during the call; it is never replaced |
| 5 | `finished`, `blocked` | a filesystem write failed; a temp file this call created is removed (a pre-existing one is left alone) and `status` is never written after a failure |

## Strip rule

Before `next.prompt` is written, every bare whitespace-delimited `--policy <value>` (the value
is the next token on the same line holding `=`) and every `--policy=…` token is removed.
Pre-approval never travels through an election.

A token the strip keeps but a reader could still take for the flag — invisible characters inside
it, Unicode dashes, non-ASCII homoglyphs, another case, punctuation or markdown emphasis glued to
it (`(--policy`, `--policy:`, `**--policy**`) — is
not removed but reported. Detection fails closed: any non-ASCII letter may stand in for the
letter at its place, so `--` followed by any six non-ASCII letters (`--привет`) is reported too. Either way the call exits 3 and the run writes the status without an election.

Quoted or backticked mentions are kept. Residual risk: an orchestrator could still read a quoted
mention as a flag, so the driver's own outward guard stays the real boundary.

## Background sessions

The workspace reaches the worktree by absolute path and never calls `EnterWorktree`. Recorded
result: a `--bg` session wrote into a sibling git worktree with no prompt while a Write into the
shared checkout was refused (CLI 2.1.302).

Fallback for CLI versions where this does not hold: a driver-side `PermissionRequest` hook that
allows `EnterWorktree` only for a git-registered sibling `<repo>-<slug>` worktree whose path
holds no symlink.
