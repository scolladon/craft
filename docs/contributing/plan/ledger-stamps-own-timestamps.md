# Plan — ledger-stamps-own-timestamps

> Source: design doc `docs/contributing/design/ledger-stamps-own-timestamps.md` · ADRs `615, 616, 617, 618`
> (all four take the design's recommended options: `append` stamps `PHASE-START` only and the
> line shape stays `<run-id> <phase> <record>` (615); a supplied time is overwritten, exit 0,
> one stderr note (616); `HARNESS-BG` carries no time (617); tests bracket the stamp between
> two second-truncated clock reads (618))
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (2 parts)

| # | Part | Size class | Production delta | Files edited |
|---|---|---|---|---|
| 1 | `run-ledger.sh append` stamps `PHASE-START` | pure-module (shell) | `scripts/run-ledger.sh` (~+17 / −1) | the script, its suite, the hooks suite |
| 2 | The prose names `append` as the time's writer | docs-prose | none | the run skill, the run-record spec, their pin suite |

The design's Part 2 (the two cross-consumer hook tests) is folded into Part 1: it adds no
production code, and one of its two tests (reorient) only passes once Part 1's GREEN lands,
so it is a GUARD over Part 1's code, not a part of its own. Part 1 holds 3 files and one
RED→GREEN cycle; Part 2 holds 3 files and one RED→GREEN cycle. Folding both into one part
would put 6 files and two unrelated cycles (shell vs prose) behind one agent; kept apart.

Every edit below was applied to a throwaway `git clone` of `main` (`fee97f6`) and checked
there (macOS `/bin/bash` 3.2.57 is the host bash, so the suite ran under it):

| Check | Before GREEN | After GREEN |
|---|---|---|
| `node --test test/run-ledger.test.js` | 74 pass / 4 fail (RED 1, 2, 3, 5) | 78 / 0 |
| `node --test test/hooks.test.js` (two new guards added) | 79 / 1 fail (the reorient guard) | 80 / 0 |
| `node --test test/run-record.test.js` (three new pins) | 49 / 3 fail (RED 1, 2, 3) | 52 / 0 |
| `bash scripts/ci.sh` after both parts committed | — | exit 0 |

No new exported symbol, command, barrel entry or verb: `stamp_record` and
`PHASE_START_PATTERN` are internal to `scripts/run-ledger.sh` (the script's verbs stay
`open|append|locate|close|dir`; `test/run-record.test.js` pins that set). No README, guide or
adapter surface mentions the `PHASE-START` time (grep over `README.md`, `docs/guides/`,
`adapters/` is empty), so no downstream surface gate applies.

## Decision candidates

Choices the design and ADRs leave open. The plan is written with each recommendation; the
alternatives are listed so the user can swap one before implementation starts.

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| PC-1 | A `date` failure inside `stamp_record` | (a) **Fatal**: capture `now="$(utc_now)" \|\| return`, and in `cmd_append` assign `record="$(stamp_record "$line")"` on its own line so `set -e` aborts the script. (b) **The design's literal snippet**: `printf '%s %s' "${BASH_REMATCH[1]}" "$(utc_now)"` inside the printf args, where a failing `date` is swallowed and writes `PHASE-START(x): ` with no time. | (a) | (b) swallows an error (guardrail). The cost of (a) is three lines. It cannot be red-tested without a PATH-stubbed `date`, which ADR-618 declines; and the probe showed a stubbed `date` already fails earlier, in `load_trusted_pointer`'s past-key check (`refusing an untrusted pointer`, exit 1). So (a) is a defensive guard with no test, stated here rather than hidden. |
| PC-2 | Which non-stamped tokens the verbatim guard pins | (a) The design's three lines (`PHASE-START(design):x`, `PHASE-START(Bad):`, `PHASE-DONE(design): ok`) **plus** one `HARNESS-BG(validation:fuzz): pid=1 out=o spec=none` line. (b) The design's three lines only. | (a) | ADR-617 decides `HARNESS-BG` stays verbatim; one extra stdin line pins that decision at zero cost. |

## Part 1 — run-ledger.sh append stamps PHASE-START

### Context

Files this part edits:

- `scripts/run-ledger.sh` — the ledger's only write surface. `set -euo pipefail`, `LC_ALL=C`.
  - Constants block (`:17-25`). `UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'` is at `:24`. Add,
    right after it:
    `readonly PHASE_START_PATTERN='^(PHASE-START\([a-z][a-z0-9-]*\):)( .*)?$'`
    (verified on `/bin/bash` 3.2: with `set -u`, `${BASH_REMATCH[2]}` is the empty string when
    the optional group does not participate, so no unbound-variable error).
  - `utc_now()` at `:76` — `date -u "$UTC_STAMP_FORMAT"`. Reuse it; do not call `date` directly.
  - `cmd_append()` at `:188-203`, current body:

    ```bash
    cmd_append() {
      local run_id="${1:-}" phase="${2:-}"
      … validation unchanged (:190-195) …
      local wrote=0 line
      while IFS= read -r line || [ -n "$line" ]; do
        [ -n "$line" ] || continue
        printf '%s %s %s\n' "$run_id" "$phase" "$line" >> "$ledger"
        wrote=1
      done
      [ "$wrote" -eq 1 ] || die "no non-blank input for $run_id $phase"
    }
    ```

  - Header comment `:8-13` (`# Usage: run-ledger.sh open <run-id>` / `#        run-ledger.sh append <run-id> <phase>` / …).
    Add one comment line after the block (keep `usage_exit`'s heredoc at `:27-` unchanged):
    `# append stamps each PHASE-START(<phase>): record with its own UTC clock.`
- `test/run-ledger.test.js` — the script's suite. Section banner `// append` at `:315`. The
  first append test (`:318-329`, the `r1`/`r2` verbatim test) stays as is; insert the new tests
  right after it (before `Given no pointer, when append runs…` at `:331`).
  - Already imported at the top (`:8-17`): `LEDGER_HEADER`, `runLedger`, `bindRun` (via the
    local `withRun(options, act)` at `:43-50`), `fs`, `path`, `assert`, `test`.
  - `runLedger(cwd, args, input)` (test/helpers/craft-run.js `:53`) spawns
    `bash scripts/run-ledger.sh …` and returns `{ status, stdout, stderr }`.
  - `withRun({ worktree: false }, (run) => …)` gives `run.main` (checkout) and
    `run.ledgerPath`; the ledger starts as `${LEDGER_HEADER}\n`.
  - Add these module-level helpers just above the new tests (all verified in the probe):

    ```js
    const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    const STAMPED_PHASE_START = /^demo design PHASE-START\(design\): (\S+)$/;
    const utcNowSeconds = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const ledgerRecordsOf = (ledgerPath) => fs.readFileSync(ledgerPath, 'utf8').split('\n').slice(1, -1);

    function assertStampedBetween(record, before, after) {
      const match = record.match(STAMPED_PHASE_START);
      assert.ok(match, `expected a stamped PHASE-START line, got ${record}`);
      assert.match(match[1], ISO_SECOND);
      assert.ok(before <= match[1] && match[1] <= after, `expected ${match[1]} within [${before}, ${after}]`);
    }
    ```

    The string comparison is sound: `date -u '+%Y-%m-%dT%H:%M:%SZ'` and `utcNowSeconds()` are
    both second-truncated and fixed-width. Each test reads `before` immediately before
    `sut(...)` and `after` immediately after (AAA: `before` in Arrange, `after` first in Assert).
- `test/hooks.test.js` — hooks suite. Line `:8` imports
  `const { bindRun, createRunRepo, writeTranscript } = require('./helpers/craft-run');` —
  add `runLedger` to that destructure. Helpers in-file: `runHookWithPayload(hookName, payload)`
  (`:431`), `compactionPayload({ transcriptPath, cwd })` (`:446`, reorient's SessionStart
  payload), `steerPayload({ transcriptPath, cwd })` (`:456`, PreCompact payload). Insert the two
  new tests right after the test `Given a PHASE-START(implementation) followed by 40 records…`
  (ends just before `const CONTROL_CHARS = …`, ~`:919`). Pattern to copy: that test's
  `const bound = bindRun(...); try { … } finally { bound.cleanup(); }` shape, with
  `cwd: bound.worktree` in the payload.

Read-only references (do not edit): engine/src/run-state.js (`PHASE_START_RE` requires
`: (\S+)$`, so the stamp must be one token with nothing after it);
hooks/steer-compact-summary.sh (`STEER_IN_FLIGHT_AWK_PROGRAM`, reads `$3` only);
hooks/reorient-after-compact.sh (`reorient_tail`, prints the line); ADRs 615-618 in
docs/contributing/adr/.

Pinned behaviour bytes (ADR-615/616):

```
stdin record                                   written line
PHASE-START(design):                        →  demo design PHASE-START(design): <now>
PHASE-START(design): 2000-01-01T00:00:00Z   →  demo design PHASE-START(design): <now>   + stderr "run-ledger: append: replaced a supplied PHASE-START time"
PHASE-START(design): 15:10:00Z soon         →  demo design PHASE-START(design): <now>   + same stderr line
PHASE-START(design):x                       →  verbatim, no stderr
PHASE-START(Bad):                           →  verbatim
PHASE-DONE(design): ok / HARNESS-BG(…) / RESOLVE: none / r1  →  verbatim
```

Exit status stays 0 in every row. A batch with no `PHASE-START` line never calls `date`.

### TDD steps

Every test: Given/When/Then title, AAA body, `const sut = runLedger;` (or
`runHookWithPayload` in the hooks suite). No provenance ids in titles or comments.

1. **RED** — `Given an open run, when append receives PHASE-START(design): with no time, then the ledger line carries a UTC stamp taken between the call start and end`.
   stdin `'PHASE-START(design):\n'`; assert status 0, exactly one record,
   `assertStampedBetween`, `result.stderr === ''`.
   Fails because: the script writes the record verbatim, so the line is
   `demo design PHASE-START(design):` and `STAMPED_PHASE_START` does not match.
2. **RED** — `Given an open run, when append receives PHASE-START(design): with a supplied time, then the written time is the script own and stderr names the replacement`.
   stdin `'PHASE-START(design): 2000-01-01T00:00:00Z\n'`; assert stamped between, record does
   not include `2000-01-01`, stderr matches `/replaced a supplied PHASE-START time/`.
   Fails because: the supplied `2000-01-01T00:00:00Z` is written verbatim and is earlier than
   `before`; stderr is empty.
3. **RED** — `Given an open run, when append receives a PHASE-START whose tail holds spaces, then the whole tail is replaced by one stamp`.
   stdin `'PHASE-START(design): 15:10:00Z soon\n'`; assert stamped between.
   Fails because: the line is written verbatim; `15:10:00Z soon` holds a space, so
   `STAMPED_PHASE_START`'s `(\S+)$` does not match.
4. **RED** — `Given a batch mixing a RESOLVE line and a PHASE-START line, when append runs, then only the PHASE-START line is stamped and the order is kept`.
   stdin `'RESOLVE: none\nPHASE-START(design):\n'`; assert two records, first is exactly
   `demo design RESOLVE: none`, second stamped between.
   Fails because: the second line is written verbatim as `demo design PHASE-START(design):`.
5. **GREEN** — in `scripts/run-ledger.sh`: add `PHASE_START_PATTERN` (Context), then add above
   `cmd_append`:

   ```bash
   # The caller never supplies a phase-start time: a model-written one has been
   # seen to postdate the very events it marks.
   stamp_record() {
     local line="$1"
     if [[ ! $line =~ $PHASE_START_PATTERN ]]; then printf '%s' "$line"; return; fi
     [ -z "${BASH_REMATCH[2]}" ] || printf 'run-ledger: append: replaced a supplied PHASE-START time\n' >&2
     local token="${BASH_REMATCH[1]}" now
     now="$(utc_now)" || return
     printf '%s %s' "$token" "$now"
   }
   ```

   and in `cmd_append` change `local wrote=0 line` to `local wrote=0 line record`, and the loop
   write to two lines (a separate assignment, so a failing substitution trips `set -e`; see
   PC-1):

   ```bash
       record="$(stamp_record "$line")"
       printf '%s %s %s\n' "$run_id" "$phase" "$record" >> "$ledger"
   ```

   Add the `# append stamps each PHASE-START(<phase>): record with its own UTC clock.` header
   comment line. Steps 1-4 pass; the existing `r1`/`r2` test still passes.
6. **GUARD** — `Given an open run, when append receives a malformed PHASE-START, a bad phase id, a PHASE-DONE and a HARNESS-BG, then each is written verbatim`.
   stdin `'PHASE-START(design):x\nPHASE-START(Bad):\nPHASE-DONE(design): ok\nHARNESS-BG(validation:fuzz): pid=1 out=o spec=none\n'`;
   assert `ledgerRecordsOf` deep-equals the four lines prefixed `demo design `, and stderr is
   `''`. Passes because: none of the four matches `PHASE_START_PATTERN` (no space after the
   colon / uppercase id / other tokens), so `stamp_record` prints them unchanged — and it also
   passed before step 5, since the old loop wrote everything verbatim.
7. **GUARD** (hooks suite) — `Given a PHASE-START(design) appended through run-ledger.sh without a time, when steer-compact-summary runs, then design is reported in flight`.
   Arrange: `const bound = bindRun();` then
   `runLedger(bound.main, ['append', 'demo', 'design'], 'PHASE-START(design):\n');`. Act:
   `sut('steer-compact-summary.sh', steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }))`.
   Assert status 0 and stdout matches `/phase\(s\) in flight: design;/`. Passes because: the
   steer awk reads only `$3` (`PHASE-START(design):`), which the stamp does not move (it passes
   on the pre-step-5 script too — probe-verified).
8. **GUARD** (hooks suite) — `Given a PHASE-START(design) appended through run-ledger.sh without a time, when reorient-after-compact runs, then the tail line carries the stamped ISO time`.
   Same Arrange; Act: `sut('reorient-after-compact.sh', compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }))`.
   Assert status 0 and stdout matches
   `/demo design PHASE-START\(design\): \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/`. Passes because:
   step 5 stamps the line and reorient prints ledger lines as written (probe: it fails against
   the pre-step-5 script, which is why it sits after GREEN).
9. **REFACTOR** — none expected; check `stamp_record` stays under 20 lines, no nesting > 2, and
   the new tests carry no duplicated literal beyond the shared helpers.

### Gate

`bash scripts/ci.sh`

### Commit

`feat(run-ledger): stamp phase-start records with the script's own clock`

## Part 2 — the prose names append as the time's writer

### Context

Files this part edits:

- `skills/run/SKILL.md`
  - Phase walk step 4 **Phase-start marker** paragraph, `:299-303`, current text:

    ```
       **Phase-start marker.** At phase entry, in the same Bash call as the
       contract-assemble invocation above, append `PHASE-START(<phase.id>): <iso8601>`
       (`date -u +%Y-%m-%dT%H:%M:%SZ`) via `run-ledger.sh append <run-id> <phase.id>`. Skip
       this append when the phase is already in flight — a resumed phase keeps its first
       `PHASE-START`, so a later `--since` derivation stays right.
    ```

    Replace with (probe-verified against every run-record pin):

    ```
       **Phase-start marker.** At phase entry, in the same Bash call as the
       contract-assemble invocation above, append `PHASE-START(<phase.id>):` via
       `run-ledger.sh append <run-id> <phase.id>`, with no time: `append` stamps the line
       with its own UTC clock and replaces any time written after the token. Skip this
       append when the phase is already in flight — a resumed phase keeps its first
       `PHASE-START`, so a later `--since` derivation stays right.
    ```

  - §Done metrics paragraph, `~:594-596`, the clause
    ``where `--since` is the iso on that`` / ``phase's latest `PHASE-START(<phase>):` line in the ledger``
    becomes
    ``where `--since` is the iso `run-ledger.sh` stamped on that`` / ``phase's latest `PHASE-START(<phase>):` line in the ledger``.
    Keep the backticks around `run-ledger.sh`: the verb-dispatch pin in
    test/run-record.test.js (`Given every run-ledger.sh invocation …`, `~:431`) matches
    `run-ledger\.sh"?\)?"? ([a-z]+)\b` and would read an unquoted `run-ledger.sh stamped` as an
    unknown verb `stamped`.
- `docs/contributing/specs/run-record.md`
  - Token table row `:85`: keep the token and regex cells; the *Emitted by* cell
    `run skill walk step 4` becomes
    ``run skill walk step 4; the `<iso8601>` is stamped by `run-ledger.sh append` ``.
  - Write-cadence list item 2, `:186-189`: after
    ``step 4 appends `PHASE-START(<phase.id>):` at phase entry`` insert
    `` — `append` writes the time, never the orchestrator`` (then the existing `; step 7 appends …`
    continues; rewrap to the file's ~90-col width).
- `test/run-record.test.js` — prose pins. Line `:7` imports
  `{ FROM_TOP, TO_END, normaliseWhitespace, sliceProse }` from `./helpers/region-slice`; add
  `sliceRegion` (exported by test/helpers/region-slice.js; returns the raw lines joined by
  `\n`, whereas `sliceProse` already collapses all whitespace — so a line-based `find` needs
  `sliceRegion`, and a wrapped phrase needs no extra `normaliseWhitespace`). `runSkill` and
  `runRecordSpec` are module constants (`:47-48`). Insert the three tests right after the
  existing `Given skills/run/SKILL.md phase walk step 4, when the assemble region is read, then
  it appends a PHASE-START marker at phase entry` test (`:95-99`), reusing its slice bounds
  `/^4\. \*\*Assemble the injected block\*\*/` → `/^5\. \*\*Execute\*\*/`. Neither the step-4
  region nor §Done contains the word `stamp` today (checked).

Existing pins that must stay green (checked in the probe): step-4 region still includes
`PHASE-START(<phase.id>):` (`:95`); §Done still includes `PHASE-START(`, `--phase`, `--since`,
`re-counts the first`, and two `--session "$CLAUDE_CODE_SESSION_ID"` (`:155`, `:293`, `:301`).

### TDD steps

Each test: Given/When/Then title, AAA body; the slice call is the Act and its value is
`result` (the file's existing convention for prose pins).

1. **RED** — `Given skills/run/SKILL.md phase walk step 4, when the assemble region is read, then it no longer tells the orchestrator to compute the time and says append stamps it`.
   `result = sliceProse(runSkill, <step-4 bounds>)`; assert `!result.includes('date -u')` and
   `result.includes('stamps')`.
   Fails because: step 4 still carries `` (`date -u +%Y-%m-%dT%H:%M:%SZ`) ``.
2. **RED** — `Given the run-record spec token table, when the PHASE-START row is read, then it names run-ledger.sh append as the time writer`.
   Arrange `vocabulary = sliceRegion(runRecordSpec, /^## Token vocabulary/, /^## /)`; Act
   `result = vocabulary.split('\n').find((line) => line.startsWith('| \`PHASE-START('))`;
   assert `result` is truthy and `result.includes('run-ledger.sh append')`.
   Fails because: the row's *Emitted by* cell reads only `run skill walk step 4`.
3. **RED** — `Given skills/run/SKILL.md §Done, when read, then the --since iso is the one run-ledger.sh stamped`.
   `result = sliceProse(runSkill, /^## Done/, TO_END)`; assert
   ``result.includes('the iso `run-ledger.sh` stamped on that phase')``.
   Fails because: §Done says `the iso on that phase's latest …`, naming no writer.
4. **GREEN** — apply the three prose edits from Context (step 4, §Done, spec row) plus the spec
   write-cadence item 2 insertion. Steps 1-3 pass; every existing run-record pin stays green.
5. **REFACTOR** — rewrap the edited paragraphs to their neighbours' width; no other wording
   change.

### Gate

`bash scripts/ci.sh`

### Commit

`docs(run): say run-ledger.sh append stamps the phase-start time`
