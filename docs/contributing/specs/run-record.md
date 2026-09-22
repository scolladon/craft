---
subjects:
  - skills/run/SKILL.md
---
# The run-record ledger

## File shape and header

One append-only markdown file at `.claude/craft-run-record.md`, rooted at the root of the
tree the run is working in — never `${CLAUDE_PLUGIN_ROOT}`.

That tree changes exactly once per run, so the root is stated per write point rather than
once for the file. `workspace` creates the worktree; lines produced **before** it go to a
scratch ledger — `<run-id>.pre.md` under `run-ledger.sh dir` (see Run directory below) —
and `workspace` moves that scratch into the **worktree** ledger in one call, after which
every write goes to the worktree root. Only `.claude/craft-runs/` is ever written in the
checkout, answering the old worry one reason at a time: the scratch is moved, never
split; `close` removes the run's files; residue stays confined to one directory and
`open` sweeps stale pointers. Under `workspace: { strategy: in-place }` there is no
second tree, so the checkout root is the only root and the file opens at resolve time.
`skills/run/SKILL.md` §0 step 4 is the binding statement of this rule.

A header line opens the file when it is absent:

```
# craft run record (append-only)
```

Every subsequent line is one record, space-delimited, prefixed by the run-id:

```
orchestrator-tax-hardening resolve auto-skip: requirements — evaluated unnecessary (brief is a spec)
orchestrator-tax-hardening design GATE(design): green
orchestrator-tax-hardening validation INTENTION-DRIFT(intention): engine/src/glob.js
```

**One record is one line** — a multi-line no-op justification folds to one line before it
is appended. See Token vocabulary below for the tokens this file adds; this file otherwise
only narrows where tokens land.

## Field shape

Field 1 is the run-id: the kebab-case topic slug already derived at `skills/run/SKILL.md`
§0 step 3, and already the `.claude/craft-metrics.md` key — re-derivable from the same
brief with no extra state. Field 2 is the emitting phase: some tokens carry their own
phase (`GATE(<phase>)`, `NO-OP(<phase>)`) and some do not (`auto-skip:`, `WAIVER:`,
`INTENTION-DRIFT(<page>)`), so this column is what makes every line uniformly
attributable regardless of which token family produced it.

**Path and secret discipline.** The ledger is run-local, but it is the derivation source
for the memory delta, and the memory store IS committed. A line that would become a store
entry carries the store's guardrails already: paths recorded repo-RELATIVE, never
absolute (an absolute path leaks `$HOME` and the username into a committed file), and any
command recorded BARE, with a leading env or secret assignment prefix stripped. See
`docs/contributing/specs/memory.md`; the scrub is the producer's obligation at both hops,
since `save` performs no validation on the write path.

## Run directory

Every run-scoped file besides the ledger itself lives under one directory:

```
<main>/.claude/craft-runs/                 <main> = parent dir of `git rev-parse --path-format=absolute --git-common-dir`; gitignored
  <run-id>.pointer    "<run-key> <abs-ledger-path>"   written by open, retargeted by move, removed by close
  <run-id>.pre.md     scratch ledger, worktree strategy only, from §0 step 4 until `workspace`
  <run-id>.delta.json memory delta, written at integrate step 3, read at Done
  <run-id>.final.md   this run's own ledger lines, snapshotted at integrate step 3, read at Done
<worktree>/.claude/craft-run-record.md      the ledger — path and line format unchanged
$TMPDIR/craft-review.XXXXXX/<dim>.c<N>.json normalised review findings, out of tree
```

`<run-key>` is `<run-id>@<UTC ISO-8601 seconds>`, charset `[a-z0-9-]@[0-9TZ:-]` — nothing
in it needs JSON escaping, so it greps literally in a transcript. The pointer is one
line, `<run-key> <abs-ledger-path>`, the path being everything after the first space.
With `workspace: { strategy: in-place }` the pointer names
`<main>/.claude/craft-run-record.md` directly and there is no scratch file. Everything
under `.claude/craft-runs/` inherits the ledger's ignore posture (see Lifetime below); no
`.gitignore` change ships for it.

## Token vocabulary

Seven more fixed, greppable tokens join the existing run-record family (`NO-OP(<phase>):`,
`GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`, `INTENTION-DRIFT(<page>):`,
`INTENTION-WAIVE(<page>):`, `STUB-FOUND(<file>):`, `STUB-WAIVE(<file>):`,
`SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`), all anchored at the start of `<record>`:

| Token | Regex over `<record>` | Emitted by |
|---|---|---|
| `RESOLVE: <craft flags verbatim, or none>` | `^RESOLVE: (.*)$` (not consumed by `run-state`) | run skill §0 step 4 |
| `AWAITING(propose): <ids comma-joined, or none>` | `^AWAITING\(propose\): (.+)$` — `none` → `[]`, else split on `,` and trim | run skill §0 step 1d, appended at step 4 |
| `PHASE-START(<phase>): <iso8601>` | `^PHASE-START\(([a-z][a-z0-9-]*)\): (\S+)$` | run skill walk step 4 |
| `PHASE-DONE(<phase>): <one-line outcome>` | `^PHASE-DONE\(([a-z][a-z0-9-]*)\): (.*)$` | run skill walk step 7 |
| `PART(<n>): <sha> size=<size> outcome=<pass\|blocked>` | `^PART\((\d+)\): ([0-9a-f]{7,40}) size=(\S+) outcome=(pass\|blocked)$` | implementation procedure 2 |
| `FINDINGS(<dimension>): c<cycle> <path> n=<count>` | `^FINDINGS\(([a-z][a-z0-9-]*)\): c(\d+) (\S+) n=(\d+)$` | review procedure 2 |
| `HARNESS-BG(<phase>:<technique-id>): pid=<pid> out=<path> spec=<path\|none>` | `^HARNESS-BG\(([a-z][a-z0-9-]*):([a-z0-9][a-z0-9-]*)\): pid=(\d+) out=(\S+) spec=(\S+)$` | validation procedure 1 (background) |

A record that starts with a new token's literal prefix but fails that token's full regex
adds a `warnings[]` entry (`run-state`) instead of parsing.

## Compaction survival

Two hooks bind a session to a run and never write the ledger:

- `hooks/reorient-after-compact.sh` (`SessionStart` `compact`) prints the ledger path and
  the rebuild steps into the freshly-compacted session, so the summary is not the only
  surviving memory of the run.
- `hooks/steer-compact-summary.sh` (`PreCompact`, empty matcher) steers the summary the
  compactor is about to write, so it keeps the run-id, ledger path and in-flight phases
  verbatim.

Both bind by run-key: they grep the transcript for the run-key `open` printed, and a
transcript miss or a non-repo cwd is a silent no-op — no output, exit 0, never a block.
A rebuild reads the ledger and re-runs `run-state` (see `skills/run/SKILL.md`
"Rebuild after compaction") to restore
`completed`/`inFlight`/`next`/`awaitingHarnesses`/`parts`/`findings`/`background`.

- `DECISION-REVERSAL(ADR-NNN): <what changed> -> ADR-MMM` — `NNN` is the superseded
  target, `MMM` the superseding ADR, `<what changed>` is the `scope` string from the
  strict `supersedes` declaration verbatim, so the token and the ADR cannot disagree.
  Emitted by the `decisions` phase, one line per `supersedes` entry authored that run.
  The scope string folds to one line before it is appended (the one-record-one-line
  rule). The token is greppable, never parsed — nothing splits on the ` -> `, so a `->`
  inside a scope string is a cosmetic wart, not an ambiguity. A refinement emits
  nothing — only a reversal is a reversal. A supersession authored outside a craft run
  emits no token at all; that is why `adr-lint` and this token are separate mechanisms,
  and neither substitutes for the other.
- `DECISION-CITE-WAIVE(<file>): <reason>` — the `adr-lint` C3 live-tier-citation waiver,
  collected from `--waiver-source` files (the design doc and the PR body), exactly as
  for `STUB-WAIVE` and `INTENTION-WAIVE`. It belongs to the `ci.sh` hygiene cadence
  family, not to a phase procedure. `DECISION-CITE-FOUND(<file>):` is **not** a
  run-record token and never appears here — under the hard-blocking lint posture a
  finding stops `ci.sh` and there is no run to fold it into; it is the lint's stdout
  format only.
- `MEMORY-RETRACT(<concern>): <merge-key>` — emitted by the phase that owns a concern's
  write surface, on a mechanical re-check that disproves a stored entry (never a
  judgment call). Derived at `skills/integrate/SKILL.md` step 3 into
  `{ concern, payload, retract: true }`. It inherits the ledger's path/secret scrub
  unmodified.

  **On-ledger rendering.** `keyOf` (`engine/src/observability/memory.js`) joins a
  concern's key fields with `\x00`, which cannot travel on a ledger line, so the
  rendering has to be chosen explicitly rather than left to infer. For the `findings`
  concern the key fields are `file` + `pattern` (`KEY_FIELDS.findings`): the payload is
  the merge key split on the first run of whitespace, the first field is `file`
  (repo-RELATIVE, matching every other ledger path), the remainder is `pattern`. This
  rendering is well-defined only because a repo-relative path in this repo carries no
  whitespace; it is not a total rendering — a consumer whose paths do contain whitespace
  would need a different scheme, and any future concern's merge key must state its own
  rendering rather than assume this split.

## The absent-file case

The header is written by `run-ledger.sh open` — to the scratch ledger, or to the
in-place ledger under `workspace: { strategy: in-place }` — when the target is absent or
empty; the header line is appended first, then the seeded `Resolution.record[]` entries
from §1c. `run-ledger.sh move` writes it again, under the same rule, to the worktree
ledger if that file is itself absent or empty when the scratch is moved in.

## The present-file case

When the ledger already exists (a resume, or a second run in the same worktree), no
header is re-written; new lines are appended (`>>` semantics) after whatever is already
there.

## Write cadence and the single-writer rule

`run-ledger.sh` is the one write surface — `open`/`append`/`move`/`snapshot`/`close` — and also the
locate surface (`locate --transcript`/`locate --run`) the compaction hooks read through.
Every ledger line is appended in the tool call that produces it or in the orchestrator's
very next tool call — never held longer than that.

1. **`open`, realized at `workspace`.** §0 step 4 opens the scratch ledger (or the
   in-place ledger) and appends the seeded `Resolution.record[]` lines in the same call;
   `workspace` then `move`s the scratch into the worktree ledger, in one call, so the
   worktree ledger ends up holding the whole run in order. Under the in-place strategy
   there is no scratch and no second write.
2. **`append`, at every phase boundary and whenever a line is produced.** Phase walk
   step 4 appends `PHASE-START(<phase.id>):` at phase entry; step 7 appends
   `PHASE-DONE(<phase.id>):` together with the phase's `GATE`/`NO-OP`/`inline:` lines,
   within the same flush-per-line window.
3. **`snapshot`, at integrate step 3.** Copies this run's own lines to `<run-id>.final.md`
   before teardown, after `integrate` appended its `PHASE-DONE`.
4. **`close`, at `Done`.** Removes the pointer, the scratch (if any), the delta file and
   the snapshot.

**R4 — one writer.** Only the orchestrator appends to the ledger — through its own tool
calls, foreground or background. No role agent writes it, in any phase, including phases
that run in parallel with another (e.g. `documentation` alongside a background
executing-harness). The compaction hooks only read.

## Lifetime — run-local, not committed

The ledger is gitignored by the existing `.claude/*` rule — it is not one of the three
re-included names (`craft-memory.md`, `craft-metrics.md`, `workflow.md`). Everything
under `.claude/craft-runs/` inherits the same posture. No `.gitignore` change ships for
either, in this part or any other (ADR-301).

The ledger survives a context reset for exactly as long as the worktree does. It does not
survive `scripts/worktree-teardown.sh` (the `integrate` phase's step 3), which removes
the tree and the ledger inside it. **R1 is durability against context loss, never
against worktree loss** — a run whose tree has been torn down is back to having nothing
to read.

The run directory's own files — the pointer, the scratch (if any), the delta file and the
snapshot —
live in the checkout, not the worktree, so they outlive teardown until `run-ledger.sh
close <run-id>` removes them: the last action of `skills/run/SKILL.md` §Done.

## Derivation precedes teardown

`Done` runs after the whole phase walk, and the walk's last phase (`integrate`) is the
one that tears the worktree down. By the time `Done`'s own step runs, if teardown ran,
the ledger file is already gone. The memory `delta`
(`docs/contributing/adr/303-memory-delta-derives-from-the-ledger.md`) is therefore
derived — read — from the ledger's run-id lines and **written to `<run-id>.delta.json`**
(under `run-ledger.sh dir`) at the last point the worktree is still alive, i.e. before
`integrate` invokes `worktree-teardown.sh`; `skills/integrate/SKILL.md` step 3 carries
the matching pointer. `Done` then reads that same `<run-id>.delta.json` back — never a
summarised delta — and calls `save` exactly once, unweakened (R3) — query and command
separate; the read/write pair moves earlier, the save does not.

Two live cases at `Done`:

- **Teardown did not run** (the run stopped at `propose`, or `teardown` was declined).
  The tree is alive, the ledger holds the whole run, and `<run-id>.delta.json` already
  carries the same delta `integrate` step 3 wrote.
- **Teardown ran.** The ledger's on-disk tail is `integrate`'s `PHASE-DONE`, appended
  just before it. Anything `Done` appends exists in-session only — where it already
  ships, in the final summary and the PR body — while `<run-id>.delta.json` and
  `<run-id>.final.md` survive teardown (they live in the checkout, not the worktree) for
  `Done` to read.

## Failure posture

A failed ledger append is surfaced to the user in-session and the run continues; it is
**not** recorded into the ledger itself (that would be circular). Same posture as a
failed `save` (ADR-120): a write failure never blocks delivery work.

## Inherited edges

**Run-id collision.** The run-id is the topic slug, so a genuine re-run of the same
feature reuses it; a resume then reads the earlier run's lines as its own. This is
inherited, not introduced — `.claude/craft-metrics.md` already keys on the same slug and
already carries repeat records for one id. The run-local ruling narrows it further: it
can only bite when one worktree hosts two runs of the same topic, since a fresh tree
starts empty.

**Resume double-`Done`.** A run that reaches `Done` twice (once before a reset, once
after) calls `save` twice. This is convergent, not corrupting: `save` decay-merges
against the run-start `MemoryView` and entries are advisory, so the second call
reconciles to the same result rather than compounding.

**Pointer replacement.** `run-ledger.sh open` on a `<run-id>` that already has a pointer
replaces it and writes one stderr line saying so (a run-id collision) — the same
inherited collision above, now visible at the moment it happens rather than only at
resume.

## Ledger vs. store

| Property | Ledger (`.claude/craft-run-record.md`) | Store (`.claude/craft-memory.md`) |
|---|---|---|
| Lifetime | run-local, gitignored, dies with the worktree | committed, travels with the repo |
| Write cadence | per line, as produced (`run-ledger.sh append`) | buffered all run, flushed once at `Done` |
| Write mode | append-only, never rewritten | whole-file temp-write + rename |
| Decay / eviction | none — history is the point | decay-merged, size-capped |
| Failure posture | warning in-session, run continues | recorded warning, never a blocker |
| Concurrency | single writer; one run per worktree | no locking, last-flush-wins |

The two never touch: `run-ledger.sh append` never calls `save`, and `save` never writes
the ledger file. The one directional link that does exist — the delta derivation reading
ledger lines and handing `save` a value — is deliberate and one-way.

Neither is the committed metrics ledger at `.claude/craft-metrics.md` — a third,
distinct artifact, keyed by run-id and phase like the two above but populated by
`scripts/emit-metrics.sh`, not by the orchestrator. See
[`docs/contributing/specs/telemetry.md`'s Metrics ledger row section](./telemetry.md#metrics-ledger-row).
