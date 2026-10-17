# Design — ledger-stamps-own-timestamps

> Brief: `PHASE-START(<phase>): <iso>` lines carry a time the orchestrator writes into the text.
> In past runs the late-phase stamps were round minutes invented by the model and later than the
> events they mark (`PHASE-START(propose): 15:10:00Z` after the PR merged at 14:39:24Z). Fix:
> `scripts/run-ledger.sh append` stamps the time itself.
> Status: draft → self-reviewed ×3

## Context

`scripts/run-ledger.sh` (ADR-380, ADR-384) is the only way to write to the ledger. `cmd_append`
reads records from stdin and writes each non-blank line as-is:

```bash
printf '%s %s %s\n' "$run_id" "$phase" "$line" >> "$ledger"
```

The script already has a clock: `utc_now()` (`date -u "$UTC_STAMP_FORMAT"`,
`UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'`). Today only `open` (the run-key) and
`load_trusted_pointer` (the past-key check) use it.

The time comes from prose. `skills/run/SKILL.md:299-303`, walk step 4 **Phase-start marker**,
tells the orchestrator to append `PHASE-START(<phase.id>): <iso8601>` and to compute the time with
`date -u +%Y-%m-%dT%H:%M:%SZ`. Nothing enforces this, and the backlog incident shows the model does
not always run the command. Of all the tokens in the run-record vocabulary, only `PHASE-START`
carries a time (`docs/contributing/specs/run-record.md:85`). `HARNESS-BG` carries
`pid/out/spec` and no time.

**Consumers of the line shape `<run-id> <phase> <record>`:**

| Consumer | How it parses | Uses the PHASE-START time? |
|---|---|---|
| `engine/src/run-state.js` `parseRecord` | `LINE_RE = /^(\S+) (\S+) (.*)$/`, then every token regex is anchored at the start of `record`. `PHASE_START_RE = ^PHASE-START\((phase)\): (\S+)$` | yes → `inFlight[].since` (`applyTimelineRecord`, `projectTimeline`) |
| `hooks/steer-compact-summary.sh` `STEER_IN_FLIGHT_AWK_PROGRAM` | `$1 == id`, `index($3, "PHASE-START(") == 1`, phase = `substr($3, 13)` minus `):` | no (only the phase id) |
| `hooks/reorient-after-compact.sh` `reorient_tail` | `$1 == id`; prints each line cut to 200 chars | no (prints the line) |
| `skills/run/SKILL.md` §Done (`:594-597`) | the orchestrator copies the time from the phase's latest `PHASE-START(<phase>):` line into `emit-metrics.sh --phase … --since <iso>` | yes |
| `engine/src/observability/metrics-emit-main.js` | `--since` is checked only with `Date.parse` (`:168`) | consumes it |
| final summary / PR body (`skills/run/SKILL.md:184-185`) | "only the lines whose run-id prefix is this run's" | no |

`engine/src/observability/skip-signals.js` `autoSkipPhasesInText` reads only `record`.
`hooks/bound-run.sh`, `test/memory-store.test.js` and `test/concepts-frames.test.js` mention the
ledger but never parse a line. No adapter mentions `PHASE-START` (grep over `adapters/`).

**Pinned matrix (probed 2026-10-17 in a mktemp repo, real `run-ledger.sh` and `run-state.js` from
this tree, macOS `/bin/bash` 3.2.57):**

| Input / line | Today's result |
|---|---|
| `append demo design` ← `PHASE-START(design): 2026-10-17T15:10:00Z` (an invented time) | exit 0, written verbatim: the script accepts any time |
| `append` ← `PHASE-START(review):` (no time) | exit 0, written verbatim; `run-state` → warning `malformed PHASE-START record`, phase **not** in flight |
| `run-state` over `demo design PHASE-START(design): <iso>` | in flight, `since` = the iso |
| `run-state` over `<iso> demo plan PHASE-START(plan): …` (stamp first) | line **silently dropped** (runId ≠ `demo`), no warning |
| `run-state` over `demo planning <iso> PHASE-START(planning): …` (stamp third) | record starts with the iso, so it matches no token: **silently ignored**, no warning |
| steer awk over the same two stamped shapes | both phases **silently lost**; `demo x PHASE-START(x):` (no time) → `START x` |
| `/bin/bash` 3.2 `[[ $l =~ ^(PHASE-START\([a-z][a-z0-9-]*\):)( .*)?$ ]]` | matches `PHASE-START(design):` and `PHASE-START(design): <iso>`. Does not match `PHASE-START(design):x`, `PHASE-START(Bad):`, `PHASE-DONE(…)` or `note PHASE-START(…)` |

**Self-hosting.** Under the worktree strategy, the plugin that is running is the main checkout. So
the run that builds this change still writes its ledger with today's script, which is a clean
"before" baseline.

## Requirements

- **R1.** The time on a `PHASE-START` line comes from `run-ledger.sh`'s own UTC clock, taken when
  `append` writes the line. The caller has no say in it.
- **R2.** Ledgers opened before the change and still open must stay readable by every consumer,
  with no migration. Old and new lines mix inside one file.
- **R3.** Every line that is not a `PHASE-START` line is written byte for byte as today.
- **R4.** `skills/run/SKILL.md` step 4 no longer tells the orchestrator to compute or write the time.
  The run-record spec says who writes it.
- **R5.** `--since` (SKILL.md §Done) and `run-state` `inFlight[].since` read the time stamped by the
  script without any change to their code.
- **R6.** No production clock override (an env var or flag). Such an override would bring back the
  hole this change closes, because the orchestrator could set it.

## Design

Shown with the recommended options DC-1 (a), DC-2 (a), DC-3 (a) and DC-4 (a). Each alternative's
row in Decision candidates lists what it changes.

**Contract.** `append` recognises a record that starts with the `PHASE-START` token and owns
everything after the token:

```
stdin record                                   written line
PHASE-START(design):                        →  demo design PHASE-START(design): 2026-10-17T16:26:06Z
PHASE-START(design): 2026-10-17T15:10:00Z   →  demo design PHASE-START(design): 2026-10-17T16:26:06Z   (+ stderr note)
PHASE-START(design):x                       →  demo design PHASE-START(design):x                       (verbatim; run-state warns, as today)
PHASE-DONE(design): ok                      →  demo design PHASE-DONE(design): ok                      (verbatim)
```

The line shape stays `<run-id> <phase> <record>`, so `LINE_RE`, `PHASE_START_RE`, both hook awk
programs and every fixture stay as they are (R2, R5). A ledger that was open before the change
holds old lines with a model-written time and new lines with a script-written time. Both have the
same shape, so `run-state` folds them the same way. The time is taken per stamped line, at write
time. A batch with no `PHASE-START` line never calls `date`.

### Part 1 — `run-ledger.sh append` stamps `PHASE-START`

- **Files:** `scripts/run-ledger.sh`; tests in `test/run-ledger.test.js`, `// append` section
  (after the test at `:318`).
- **Symbols changed:** `cmd_append` (current: `cmd_append() { local run_id="${1:-}" phase="${2:-}"; … printf '%s %s %s\n' "$run_id" "$phase" "$line" >> "$ledger" … }`).
  New: `readonly PHASE_START_PATTERN='^(PHASE-START\([a-z][a-z0-9-]*\):)( .*)?$'` beside the
  other `*_PATTERN` constants, and a function `stamp_record <line>` that prints the record to
  write:

  ```bash
  # The caller never supplies a phase-start time: a model-written one has been
  # seen to postdate the very events it marks.
  stamp_record() {
    local line="$1"
    if [[ ! $line =~ $PHASE_START_PATTERN ]]; then printf '%s' "$line"; return; fi
    [ -z "${BASH_REMATCH[2]}" ] || printf 'run-ledger: append: replaced a supplied PHASE-START time\n' >&2
    printf '%s %s' "${BASH_REMATCH[1]}" "$(utc_now)"
  }
  ```

  The `cmd_append` loop writes `"$(stamp_record "$line")"` in place of `"$line"`. Update the
  header `# Usage:` comment for `append`: it says one line, that `append` stamps
  `PHASE-START(<phase>):` with its own UTC time.
- **Helpers / fixtures:** `withRun`, `runLedger`, `LEDGER_HEADER` from
  `test/helpers/craft-run.js`. Add a local `const utcNowSeconds = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');`.
  The bracket check `before <= stamp <= after` holds on these strings because `date` and the
  helper both truncate to the second and use the same fixed-width format.
- **RED tests (Given/When/Then, AAA, `sut = runLedger`):**
  1. `Given an open run, when append receives PHASE-START(design): with no time, then the ledger line carries a UTC stamp taken between the call's start and end`
  2. `Given an open run, when append receives PHASE-START(design): 2000-01-01T00:00:00Z, then the written time is the script's own, not the supplied one, and stderr names the replacement`
  3. `Given an open run, when append receives a PHASE-START with a space-holding tail, then the whole tail is replaced by one stamp` (`PHASE-START(design): 15:10:00Z soon` → `PHASE-START(design): <iso>`, which matches `run-state`'s `(\S+)$`)
  4. `Given an open run, when append receives PHASE-START(design):x, PHASE-START(Bad): and PHASE-DONE(design): ok, then each is written verbatim` (R3, regression guard: green on arrival)
  5. `Given a batch mixing a RESOLVE line and a PHASE-START line, when append runs, then only the PHASE-START line is stamped and the order is kept`

  The existing test at `:318` (`r1`/`r2` verbatim) stays as the R3 guard.

### Part 2 — the consumers read a script-stamped line

These tests guard against regressions and are green on arrival (R2, R5). They prove that the line
the script writes is the shape the readers parse. Every current fixture is written by a direct
append (`bindRun`'s `ledgerLines`), not by the script.

- **Files:** `test/hooks.test.js` (beside the steer test at `:900`).
- **Fixture:** `bindRun({})`, then `runLedger(bound.main, ['append', 'demo', 'design'], 'PHASE-START(design):\n')`.
- **Tests:**
  1. `Given a PHASE-START(design) appended through run-ledger.sh without a time, when steer-compact-summary runs, then design is reported in flight`
  2. `Given a PHASE-START(design) appended through run-ledger.sh without a time, when reorient-after-compact runs, then the tail line carries the stamped ISO time`

`engine/test/run-state.test.js` already pins `demo design PHASE-START(design): <iso>` →
`inFlight` (`:213`, `:247`). The written shape is that exact string, so `run-state` needs no new
test and no code change.

### Part 3 — the prose contract

- **Files:** `skills/run/SKILL.md`, `docs/contributing/specs/run-record.md`; tests in
  `test/run-record.test.js`.
- **`skills/run/SKILL.md:299-303`** (step 4) becomes:

  > **Phase-start marker.** At phase entry, in the same Bash call as the contract-assemble
  > invocation above, append `PHASE-START(<phase.id>):` via `run-ledger.sh append <run-id>
  > <phase.id>`, with no time: `append` stamps the line with its own UTC clock and replaces any
  > time written after the token. Skip this append when the phase is already in flight — a
  > resumed phase keeps its first `PHASE-START`, so a later `--since` derivation stays right.

- **`skills/run/SKILL.md:594-597`** (§Done): "the iso on that phase's latest `PHASE-START(<phase>):`
  line" becomes "the iso `run-ledger.sh` stamped on that phase's latest `PHASE-START(<phase>):`
  line".
- **`docs/contributing/specs/run-record.md:85`**: the row keeps its token and regex. Its
  *Emitted by* cell becomes "run skill walk step 4; the `<iso8601>` is stamped by
  `run-ledger.sh append`". In **R3 item 2** (`:186-189`), after "appends
  `PHASE-START(<phase.id>):` at phase entry", add "— `append` writes the time, never the
  orchestrator".
- **Tests** (reuse `sliceProse` and the step-4 slice at `:95`):
  1. `Given skills/run/SKILL.md phase walk step 4, when the assemble region is read, then it no longer tells the orchestrator to compute the time and says append stamps it` (asserts that `date -u` is absent and that `stamps` is present)
  2. `Given the run-record spec token table, when the PHASE-START row is read, then it names run-ledger.sh append as the time's writer`
  3. `Given skills/run/SKILL.md §Done, when read, then the --since iso is the one run-ledger.sh stamped`

**ADR impact (for the decisions phase).** ADR-379 Option 1 reads "`PHASE-START(<phase>):
<iso8601>` at walk step 4", which describes the line but not who writes the time. ADR-380 says
`append` "writes each as one `<run-id> <phase> <record>` line". From this change on, `append`
rewrites the time of a `PHASE-START` record, so it refines ADR-380.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Where the script's time lives | (a) **Fill the time of `PHASE-START` only**. The shape stays `<run-id> <phase> <record>`. Files: `run-ledger.sh`, SKILL.md, spec. (b) **Stamp every line, third field**: `<run-id> <phase> <iso> <record>`. `LINE_RE` becomes 4 groups with a fallback for old 3-field lines. The steer awk moves from `$3` to `$4` with the same fallback. The reorient tail spends 21 of its 200 chars on the stamp. `PHASE_START_RE` drops its time and `since` comes from the line stamp. Every fixture in `test/hooks.test.js`, `engine/test/run-state*.test.js` and `engine/test/fixtures/run-ledger/*.md` changes, plus the spec's line-format section. (c) **Stamp every line, first field**: `<iso> <run-id> <phase> <record>`. Same changes as (b), and it also breaks `$1 == id` in both hooks and `parseRecord`'s runId, so a ledger that was open before the change needs a check on whether field 1 is an ISO time. | (a) | Pinned: today's readers given a (b) or (c) line drop it **silently**, with no warning, so a missed reader fails quietly. (a) changes no reader and no fixture, and old and new lines mix in one ledger (R2). Per-line times for every token have no consumer today (YAGNI). |
| DC-2 | A `PHASE-START` record that arrives with its own time | (a) **Overwrite**: discard everything after `PHASE-START(<id>):`, stamp, exit 0, print one stderr note. (b) **Reject**: exit 2 and write nothing from that call. Needs stdin buffered and validated before any write, because today's loop writes line by line. (c) **Keep alongside**: `PHASE-START(<id>): <script-iso> claimed=<supplied>`. `PHASE_START_RE`'s `(\S+)$` must change to accept the suffix, and the spec regex with it. | (a) | R1 holds in every case. An orchestrator still holding the old step-4 text (a plugin update mid-run, or a cached habit) keeps working, while (b) turns each phase entry into a blocker turn. The stderr note keeps the replacement visible. (c) records a value already shown to be unreliable, and it is the only option that changes a reader. |
| DC-3 | `HARNESS-BG` time | (a) **No time**: the token carries no time, and its consumer (rebuild resume: `kill -0 <pid>`, `out` size) needs none. (b) **Add `at=<iso>`**, stamped by `append`. This changes `HARNESS_BG_RE`, the spec row and `skills/validation/SKILL.md:137`. | (a) | No reader of a background run uses a time. Adding one is scope with no consumer. |
| DC-4 | How tests pin a clock-dependent write | (a) **Bracket**: `before <= stamp <= after`, both truncated to the second, plus a format regex. No change to production code. (b) **PATH-stubbed `date`** in the test env, for an exact value. Test-only, but couples the test to the script calling `date` through `PATH`. (c) **Env clock override** in `run-ledger.sh` (e.g. `CRAFT_LEDGER_NOW`). | (a) | (c) breaks R6, because the orchestrator could set the override. (a) proves R1 for an invented time from another day (`2000-01-01…`) with no stub. A collision only within the same second is out of reach for any model-invented time worth catching. |

## Test strategy

- **Unit / integration (Part 1):** `test/run-ledger.test.js`, which runs the real script in a
  throwaway repo through `withRun`. Tests 1-3 and 5 fail against the current tree, since the line
  is written verbatim. Test 4 is the R3 guard.
- **Cross-consumer (Part 2):** `test/hooks.test.js` runs the real hooks over a ledger the real
  script wrote. These are guards, green on arrival. They fail if the stamped shape ever stops
  matching the awk field positions.
- **Prose pins (Part 3):** `test/run-record.test.js`. Test 1 fails today (`date -u` is present),
  test 2 fails (no writer named) and test 3 fails (no "stamped").
- **No change** to `engine/test/run-state*.test.js` or the fixtures: the line shape is the same.
- **Shell portability:** `scripts/ci.sh` runs the suite under the host bash. The pattern was
  checked on `/bin/bash` 3.2.57 (pinned matrix above).
- **Gate:** `bash scripts/ci.sh`; `bash scripts/design-lint.sh` on this doc.
- **Live proof:** the first craft run after the merge. Its ledger's `PHASE-START` times should
  fall between the surrounding commit and PR timestamps, which is the check the incident failed.

## Out of scope

- **Retro-fixing past ledgers or metrics rows** built from model-written times. They are closed
  or gone, and the metrics ledger is append-only.
- **Tightening `PHASE_START_RE`'s `(\S+)` to a strict ISO regex.** Only the script writes the time
  now, so a non-ISO value can only come from a hand edit.
- **Checking that the token's `(<phase>)` matches the `<phase>` argument of `append`**: the probe
  shows `append demo design ← PHASE-START(review):` is accepted today. Nothing shows this causes
  harm, so this change does not touch it.
- **Per-line times for every token** (DC-1 b/c): no consumer.
- **`docs/contributing/design/auto-compaction-safety.md` and `docs/contributing/plan/*`**: these
  are historical records and stay frozen.
