---
subjects:
  - skills/run/SKILL.md
---
# The run-record ledger

## File shape and header

One append-only markdown file per run, `<git-common-dir>/craft-runs/<run-id>.md` — the
directory `run-ledger.sh dir` prints — never `${CLAUDE_PLUGIN_ROOT}` and never inside a
working tree (ADR-384). The git common dir is shared by every worktree of the repository
and no commit can write inside it, so the ledger has one root for the whole run, whatever
the workspace strategy: `open` creates it at §0 step 4, every later write goes to it, and
nothing moves it. A cloned repository can never plant or seed it. `skills/run/SKILL.md`
§0 step 4 is the binding statement of this rule.

A header line opens the file:

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

Every run-scoped file lives under one directory, inside the git common dir, where no
commit can write — so a cloned repository can never plant a pointer or a ledger
(ADR-384):

```
<git-common-dir>/craft-runs/              <git-common-dir> = `git rev-parse --path-format=absolute --git-common-dir`; shared by every worktree
  <run-id>.md         the run's ledger, from `open` at §0 step 4 until `close` at Done
  <run-id>.pointer    "<run-key> <abs-ledger-path>"   written by open, removed by close
  <run-id>.impacts.md  the run's discovered-impacts store, from open to close; written only by defer and verdict
$TMPDIR/craft-review.XXXXXX/<dim>.c<N>.json normalised review findings, out of tree
```

`<run-key>` is `<run-id>@<UTC ISO-8601 seconds>`, charset `[a-z0-9-]@[0-9TZ:-]` — nothing
in it needs JSON escaping, so it greps literally in a transcript. The pointer is one
line, `<run-key> <abs-ledger-path>`, the path being everything after the first space. A
pointer binds only when its key names its own run-id with a past timestamp and it names
that run's own ledger, `craft-runs/<run-id>.md`, with no symlink on the way.
`run-ledger.sh` refuses to run outside a git work tree, so a committed directory laid out
like a bare repository is never taken for the git dir.

## Token vocabulary

Seven more fixed, greppable tokens join the existing run-record family (`NO-OP(<phase>):`,
`GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`, `INTENTION-DRIFT(<page>):`,
`INTENTION-WAIVE(<page>):`, `STUB-FOUND(<file>):`, `STUB-WAIVE(<file>):`,
`SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`, `MODEL-RETRY(<role>):`,
`MODEL-DEGRADED(<tier>):`), all anchored at the start of `<record>`:

| Token | Regex over `<record>` | Emitted by |
|---|---|---|
| `RESOLVE: <craft flags verbatim, or none>` | `^RESOLVE: (.*)$` (not consumed by `run-state`) | run skill §0 step 4 |
| `AWAITING(propose): <ids comma-joined, or none>` | `^AWAITING\(propose\): (.+)$` — trimmed; `none` → `[]`, else split on `,`, each id trimmed, empty ids dropped | run skill §0 step 1d, appended at step 4 |
| `PHASE-START(<phase>): <iso8601>` | `^PHASE-START\(([a-z][a-z0-9-]*)\): (\S+)$` | run skill walk step 4; the `<iso8601>` is stamped by `run-ledger.sh append` |
| `PHASE-DONE(<phase>): <one-line outcome>` | `^PHASE-DONE\(([a-z][a-z0-9-]*)\): (.*)$` | run skill walk step 7 |
| `PART(<n>): <sha> size=<size> outcome=<pass\|blocked>` | `^PART\((\d+)\): ([0-9a-f]{7,40}) size=(\S+) outcome=(pass\|blocked)$` | implementation procedure 2 |
| `FINDINGS(<dimension>): c<cycle> <path> n=<count>` | `^FINDINGS\(([^():\s]+)\): c(\d+) (\S+) n=(\d+)$` | review procedure 2 |
| `HARNESS-BG(<phase>:<technique-id>): pid=<pid> out=<path> spec=<path\|none>` | `^HARNESS-BG\(([a-z][a-z0-9-]*):([^():\s]+)\): pid=(\d+) out=(\S+) spec=(\S+)$` | validation procedure 1 (background) |

A record that starts with a new token's literal prefix but fails that token's full regex
adds a `warnings[]` entry (`run-state`) instead of parsing.

The tokens below are greppable only: no regex row, and `run-state` does not consume them.

- `LESSONS: <path> (<outcome>)[, …]` — emitted by the `lessons` phase (`craft:lessons`
  step 6), one line per run that harvested.
- `NO-OP(lessons): <reason>` — the `lessons` phase's instance of `NO-OP(<phase>):`;
  `run-state` consumes it only through the generic `NO-OP(<phase>):` fold.
- `LESSON-REVERIFY(<lesson>): <changed-path>` — emitted by the `validation` phase, one
  line per changed path on each unwaived `assert-fresh` lessons row; resolved by the
  `lessons` phase. It never joins the drift set and never reaches `intention.gate`.
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
  for `STUB-WAIVE` and `INTENTION-WAIVE`. A `STUB-WAIVE`, `SLOP-WAIVE` or
  `DECISION-CITE-WAIVE` waiver is a line that starts with the token followed by
  `: <reason>`, outside a fenced code block; the same token mid-sentence, in an inline
  code span, a table cell or a fence is a mention and waives nothing. It belongs to the
  `ci.sh` hygiene cadence
  family, not to a phase procedure. `DECISION-CITE-FOUND(<file>):` is **not** a
  run-record token and never appears here — under the hard-blocking lint posture a
  finding stops `ci.sh` and there is no run to fold it into; it is the lint's stdout
  format only.
- `MEMORY-RETRACT(<concern>): <merge-key>` — emitted by the phase that owns a concern's
  write surface, on a mechanical re-check that disproves a stored entry (never a
  judgment call). Derived at `skills/run/SKILL.md` `## Done` into
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
- `DEFERRED(<file>): I<n> <title>` — emitted by `run-ledger.sh defer`, phase column = the
  capturing phase, one line per entry. `<file>` is the entry's locus file, keyed as for
  `FOLDED`.
- `TRIAGED(I<n>): <verdict> — <rationale>` — emitted by `run-ledger.sh verdict` under
  phase `impact-triage`; `<verdict>` is one of reject / backlog:ready / backlog:spike.
- `FOLDED(<file>): <finding> -> <sha>` — emitted by the phase that folds, under the run
  skill invariant Impacts: fold or defer at discovery, one line per folded finding,
  appended after its fold commit. `<file>` is the finding's repo-relative locus file; a
  fold that spans several files writes one line per file. A finding with no locus file of
  its own keys on the run's design doc path. `<sha>` is the fold commit. Nothing splits
  on the ` -> `. A source fold made after the executing-harness started ends its line with
  `(outside the executing-harness run)`.
- `FILED(<file>): I<n> <title> — not folded: <reason>` — emitted by the `impact-triage`
  phase after the BACKLOG commit, one line per filed entry. `<file>` is keyed as for
  `FOLDED`, so both verdicts on one file grep by the same key; `<reason>` is the entry's
  `Not folded: ` sentence. Both tokens reach the PR trailer as run-record lines, so
  `<finding>` and `<reason>` carry repo-relative paths, a placeholder (`<worktree>`,
  `<main-repo-dir>`) for an out-of-repo location, and no secret or env assignment.
- `NO-OP(planning): no part remains — <justification>` and
  `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` — the two
  fixed reason idioms of the generic `NO-OP(<phase>):` token for a run whose earlier
  phases already landed every deliverable. The first is emitted by the `planning`
  procedure's no-op branch once every check in that branch passes (coverage, sha shape,
  landed this run, not the run's own paperwork, spot-check);
  `<justification>` maps each design requirement to the commit that delivered it
  (`R1 → <sha>, R2 → <sha>, …`). The second is emitted by the `implementation`
  preamble when no plan exists and the run record holds the first. The first is
  appended in one call with its `PHASE-DONE` line; the second joins its `PHASE-DONE` line only with a green gate (on red, `PHASE-DONE` follows the green re-run).
  `run-state` consumes only the generic prefix.

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

## The absent-file case

`run-ledger.sh open` writes the ledger fresh — the header line is appended first, then
the seeded `Resolution.record[]` entries from §1c — through a temp file and a rename, so a
leftover ledger with no open pointer never leaks into the new run. A run-id that is still
open is refused, never overwritten (see Inherited edges).

## The present-file case

Once the ledger exists, no header is re-written; new lines are appended (`>>` semantics)
after whatever is already there.

## Write cadence and the single-writer rule

`run-ledger.sh` is the one write surface — `open`/`append`/`defer`/`verdict`/`close` —
and also the locate surface (`locate --transcript`/`locate --run`) the compaction hooks
read through. Every ledger line is appended in the tool call that produces it or in the
orchestrator's very next tool call — never held longer than that.

1. **`open`, at §0 step 4.** Creates the ledger, the pointer and the impacts store and
   appends the seeded `Resolution.record[]` lines in the same call. It refuses — exit 3, nothing written — a
   run-id whose trusted pointer and ledger exist; see Inherited edges.
2. **`append`, at every phase boundary and whenever a line is produced.** Phase walk
   step 4 appends `PHASE-START(<phase.id>):` at phase entry — `append` writes the
   time, never the orchestrator; step 7 appends `PHASE-DONE(<phase.id>):` together
   with the phase's `GATE`/`NO-OP`/`inline:` lines, within the same flush-per-line
   window.
3. **`defer`**, when a phase discovers an impact it does not fold. Stores the entry and
   appends its `DEFERRED` line. It refuses — exit 2, nothing written — an entry with no
   proof, no expected, a bad locus (absolute, home-rooted, holding whitespace or a `..`
   step), an unknown reason or a control character. Concurrent calls never share an id.
4. **`verdict`**, in the `impact-triage` phase, one per entry. Records the judgement in
   the store and appends the `TRIAGED` line. The rationale is exactly one line with no
   control character.
5. **`close`, at `Done`.** Removes the pointer, the ledger, the store and its id claims, once the run
   record has been read for the final message. On an already-closed run it is a silent
   exit 0, so a restarted session that re-runs it loses nothing.

**R4 — one writer.** Only the orchestrator appends to the ledger and the store — through
its own tool calls, foreground or background. No role agent writes it, in any phase, including phases
that run in parallel with another (e.g. `documentation` alongside a background
executing-harness). The compaction hooks only read.

## Lifetime — run-local, not committed

The ledger lives inside the git common dir, which git never tracks, so it is never
committed and no `.gitignore` change ships for it (ADR-384). It is run-local: `close`
removes it at `Done`.

It survives a context reset and `scripts/worktree-teardown.sh` alike — teardown removes
the worktree, and the ledger was never in it. **R1 is durability against context loss
and against worktree loss**: `Done` reads the whole run from the ledger after
`integrate`'s teardown.

## Derivation at Done

The memory `delta` (`docs/contributing/adr/303-memory-delta-derives-from-the-ledger.md`)
is derived — read — from the ledger's run-id lines at `Done`, after the whole phase walk,
teardown included: the ledger outlives the worktree, so the derivation reads the file,
never a summary, and `save` runs exactly once, unweakened (R3).

## Failure posture

A failed ledger append is surfaced to the user in-session and the run continues; it is
**not** recorded into the ledger itself (that would be circular). Same posture as a
failed `save` (ADR-120): a write failure never blocks delivery work.

A refused `open` (exit 3) is not a write failure: the orchestrator STOPs, because a run
that continued would append into the other run's ledger.

## Inherited edges

**Run-id collision.** The run-id is the topic slug, so a genuine re-run of the same
feature reuses it — inherited, not introduced: `.claude/craft-metrics.md` already keys on
the same slug and already carries repeat records for one id. While the first run is open
— its trusted pointer and its ledger exist, from `open` to `close` — `open` on the same id
refuses with exit 3 and touches neither file. No process outlives a tool call, so nothing
tells a live run from a crashed one: the orchestrator STOPs (§0 step 4) and the user
chooses stop, discard (`close`, then `open`) or re-slug. A second run of the same topic
never inherits the first one's lines, and never discards them unasked.

**Resume double-`Done`.** A run that reaches `Done` twice (once before a reset, once
after) calls `save` twice. This is convergent, not corrupting: `save` decay-merges
against the run-start `MemoryView` and entries are advisory, so the second call
reconciles to the same result rather than compounding.

**Pointer replacement.** `run-ledger.sh open` on a `<run-id>` whose leftover pointer is
untrusted (a stamp in the future, say) replaces it and writes one stderr line saying so.
Such a pointer can bind no run — `locate` and `append` refuse it — so replacing it
discards nothing live.

## Ledger vs. store

| Property | Ledger (`craft-runs/<run-id>.md`) | Store (`.claude/craft-memory.md`) |
|---|---|---|
| Lifetime | run-local, in the git common dir, removed by `close` at `Done` | committed, travels with the repo |
| Write cadence | per line, as produced (`run-ledger.sh append`) | buffered all run, flushed once at `Done` |
| Write mode | append-only, never rewritten | whole-file temp-write + rename |
| Decay / eviction | none — history is the point | decay-merged, size-capped |
| Failure posture | warning in-session, run continues | recorded warning, never a blocker |
| Concurrency | single writer; one ledger per run | no locking, last-flush-wins |

The two never touch: `run-ledger.sh append` never calls `save`, and `save` never writes
the ledger file. The one directional link that does exist — the delta derivation reading
ledger lines and handing `save` a value — is deliberate and one-way.

Neither is the committed metrics ledger at `.claude/craft-metrics.md` — a third,
distinct artifact, keyed by run-id and phase like the two above but populated by
`scripts/emit-metrics.sh`, not by the orchestrator. See
[`docs/contributing/specs/telemetry.md`'s Metrics ledger row section](./telemetry.md#metrics-ledger-row).
