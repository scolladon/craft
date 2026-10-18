---
subjects:
  - skills/run/SKILL.md
---
# 631 — A closed run is rebuilt from the PR state, then re-elects and writes its status

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/driver-rebuild-bg-lock-gaps.md · **Supersedes/Refines:** Refines ADR-624 (adds a rebuild path for the `close` → status window)

## Context

In a driven run, §Done writes the status after `run-ledger.sh close`. A kill in that window leaves a
merged PR, no ledger and no status. A live probe (E1) showed that a supervisor-restarted `--bg` session
keeps its transcript, re-runs `close` (a silent exit 0 on a closed run) and writes `FINISHED`. A session
rebuilt from a summary has no ledger to rebuild from: `run-ledger.sh locate --run <run-id>` prints
nothing, and the rebuild table had no row for that.

## Options considered

1. **Rebuild keyed on the PR state through the VCS port** *(recommended)*: `locate` prints nothing, so
   the run is closed. Driven runs query the PR whose head is `<type>/<run-id>`. Merged → `finished`.
   Otherwise → `blocked integrate`. Pros: no new state; the VCS host is the authority on "merged", the
   same source a careful driver checks. Cons: needs a VCS round trip.
2. **A closed-run marker in the git common dir** (`craft-runs/<run-id>.closed`). Cons: a new file and a
   third ledger state. Because status is the last call, no step could remove the marker, so it would
   outlive every run.
3. **Status (intent) before `close`**, superseding ADR-624. Cons: the driver can start the next entry
   while this run's ledger is still open.

## Decision

The user ratified option 1 and chose to re-elect. When `locate` prints nothing at rebuild step 1, the
run is closed. Never re-`open` it. Undriven: tell the user the run is closed and stop. Driven: query the
PR for the run's branch through the VCS port.
- **Exactly one merged PR:** run the normal Driver hand-off election from the merged default branch,
  then `finished <pr-url> --election … --prompt …`. When nothing is elected, call `finished <pr-url>`
  alone.
- **None merged** (open, closed unmerged, or no PR): `blocked integrate` with
  `not merged <pr-or-branch>`.
- **More than one merged:** blocker `{ rebuild, reason, ≤3 options }`.

The status write stays the last tool call. Exit 4 means the status already exists, for example because
a transcript-intact restart already wrote it. Exit 4 and every other non-zero exit are surfaced, never
a blocker.

## Consequences

- `close` on an already-closed run is a pinned, silent exit 0, so a restarted session can re-run it.
- No new state file and no new port operation.
- ADR-624 and ADR-629 hold unchanged.
