# Plan — rules-integrity-launch-wiring

> Source: design doc `docs/contributing/design/rules-integrity-launch-wiring.md` · ADRs `599, 600`
> (Landing A only: candidate 1 = (a) keep `assertRulesIntegrity` on demand, ADR-599; candidate
> 2 = (a) full record, ADR-600. Candidates 3 and 4 apply only to Landings B/C and are moot.
> Landings B and C are not planned.)
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

## Plan shape (1 part)

| # | Part | src delta | Files |
|---|---|---|---|
| 1 | Record the rules integrity check as kept on demand | one JSDoc comment (3 lines → 5), no code | `adapters/codex/src/execpolicy-rules.js`, `BACKLOG.md`, `docs/contributing/specs/codex-poc-record.md` |

One part. There is no behaviour change, so there is no RED and no GREEN code. The JSDoc edit
and the doc edits state the same decision in the same words ("kept on demand by decision
(2026-10-16) … no launch path of its own"), and they share one proof: the grep set in the
gate. Splitting the comment from the docs would give a one-comment part whose only gate is
`ci.sh`, run twice for nothing.

Every edit below was applied to a throwaway `git clone` of the branch tip (`146260c8`), with
`engine/node_modules` linked in, and checked there:

| Check | Result on the edited clone |
|---|---|
| The 7 old→new swaps below | each old text matched exactly once; 7 applied |
| `bash scripts/ci.sh` | exit 0, 0 failing tests in every suite |
| `git grep -n "calls this check yet" -- adapters` | no match |
| `git grep -c "kept on demand" -- BACKLOG.md docs/contributing/specs/codex-poc-record.md adapters/codex/src/execpolicy-rules.js` | `BACKLOG.md:3`, `adapters/codex/src/execpolicy-rules.js:1`, `docs/contributing/specs/codex-poc-record.md:2` |
| `git grep -l assertRulesIntegrity -- adapters bin engine scripts` | the source file and its test only |

The `06e1983` claims in the new text were checked: `git cat-file -p 06e1983` is dated
2026-07-21, and `adapters/codex/craft.rules` at `06e1983` differs from the committed file only in
the disclosure comment (lines 8–10).

## Public-surface decision

No new exported symbol. `assertRulesIntegrity(onDiskText)` keeps its signature, its
`{ intact: true }` return and its thrown message byte for byte; `buildExecpolicyRules()` and
`adapters/codex/craft.rules` are untouched, so the committed rules file is not regenerated
(ADR-573 holds). No barrel, README surface, registry or report is touched. `README.md` is not
edited by this part: its only change in this run is the plan count, which the plan commit owns.

## Decision candidates

Three wording details the design and ADRs leave open. The plan text below uses the recommended
option for each; switching to an alternative changes only the quoted text in Part 1.

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| 1 | Suffix on the ticked entry title (`BACKLOG.md` L237) | (a) `— closed by decision, kept on demand, 2026-10-16`; (b) the design's `— closed 2026-10-16, kept on demand`; (c) `— delivered 2026-10-16` | **(a)** | The file has two "closed" shapes: L683 and L916 put the outcome first and the date last (`— closed by measurement, detector unchanged, 2026-07-31`); L1336 is `— closed 2026-07-04` with no outcome. Requirement 1 asks for a suffix that names the outcome, so (a) copies the L916 shape. (c) is the shape for shipped work, and nothing ships. |
| 2 | JSDoc wording (`execpolicy-rules.js` L84–86) | (a) "Nothing in the binding calls it: it is kept on demand because the binding has no launch path of its own (operators start codex themselves), so …"; (b) the design's "The binding runs this check on demand only: it has no launch path of its own …" | **(a)** | (b) can be read as "the binding runs this check", which the code does not do. (a) keeps the "nothing … calls it" fact that every other surface states, and drops only "yet". Both are version-free and carry no provenance. |
| 3 | Record rows added to the *Re-probe — codex-cli 0.162.1* table | (a) three rows: empty file, comments-only file, the 2026-07-21 copy; (b) only the two rows Requirement 2 names | **(a)** | All three are 2026-10-16 `execpolicy check` observations from the design's pinned matrix. The third row is the evidence for reason (iv) in the ticked entry ("byte drift … has not changed enforcement"). Without it, that reason points at nothing in the record. |

## Validation-phase notes

- Mutation: none. The only `src/` change is inside a JSDoc block, and Stryker mutates no
  comment. The design's test strategy says the same.
- Architecture boundaries: unaffected (no import changes).
- Environment trap seen during planning: in a worktree-isolated session, a hook may refuse
  `git log`, `git status` and `git diff`. `git grep` and `git cat-file` still ran. If that
  happens, the part gate's greps below are all `git grep` or plain `grep`.

## Part 1 — Record the rules integrity check as kept on demand

### Context

Edited files (no other file changes):

- `adapters/codex/src/execpolicy-rules.js` — JSDoc of `assertRulesIntegrity` (comment block
  L77–91, function at L92). L84 stays; L85–86 are replaced by four lines (net +2). Today L84–86 read
  " * drift (malformed content included), not one probed variant. Nothing in the" /
  " * binding calls this check yet: it protects only when a caller runs it before" /
  " * relying on the layer, and then refuses rather than proceed.". After the edit the
  function moves to L94. The function body, the thrown message (L96 today) and
  `buildExecpolicyRules()` (L70–75) must stay byte-identical.
- `BACKLOG.md` — four places:
  - L237–244, the entry "Should a launch or install path call `assertRulesIntegrity`?", inside
    `### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet
    scheduled)`. Ticked in place: it stays in that section. It gets a title suffix and a
    branch parenthetical, the same as the delivered sibling at L256 (title line ends `**`,
    next line starts `(<branch>). …`). Its question text is kept. A bold-led sub-paragraph is
    added after it, the same shape as the `**Re-probe on 0.162.1 (2026-10-15): split by
    surface.**` sub-paragraph under the L1266 entry.
  - L246–252, the open deploy-step entry "No install step deploys `craft.rules` …". One fact
    sentence goes on the end of L252. The title stays as it is and the entry stays open.
  - L1274–1276, the delivered "Malformed `.rules` execpolicy" entry (title at L1266). Its
    mitigation sentence gains "kept on demand by decision (2026-10-16)".
  - Line numbers shift as edits land: +15 after L244 once the sub-paragraph is in, then +18
    from the deploy-step entry onward. Apply edits by the quoted old text, not by line number.
- `docs/contributing/specs/codex-poc-record.md`:
  - L334, row 3 of the POC table: its last sentence gains the decision clause.
  - L566, the last row of the *Re-probe — codex-cli 0.162.1* table ("Integrity check against
    the probed malformed text (0.162.1)"): it gains the decision clause, and three new rows
    are added directly after it, before the blank line and the closing paragraph ("The
    2026-07-21 runtime fail-open verdict …", which stays).
  - Rule from ADR-320: append, never erase. Each new row is pinned `(0.162.1)` and dated, and
    no existing row text is removed. Only the two clauses above are added to existing rows.

Read-only references (plain text, do not edit): the design
docs/contributing/design/rules-integrity-launch-wiring.md (§ Landing A and the pinned matrix);
ADRs docs/contributing/adr/599-rules-integrity-check-stays-on-demand.md and
docs/contributing/adr/600-on-demand-choice-is-recorded-on-every-surface.md; ADR-320
(docs/contributing/adr/320-poc-record-appends-a-dated-re-probe.md); B9 lines L421–436 of
docs/contributing/design/harden-prove-codex-binding.md.

Wording pins: none. `git grep` over test/, engine/test/ and adapters/*/test/ for "calls this
check yet", "no caller in the binding", "Nothing in the binding calls", "protects only when",
"kept on demand", "matchedRules" and "comments-only" finds no assertion. The only test files
that name `assertRulesIntegrity` are the five behaviour `it`s in
adapters/codex/test/execpolicy-rules.test.js (L83–116), and none of them reads the JSDoc. Its
provenance sweep covers only the generated `.rules` text. test/living-corpus.test.js lists
codex-poc-record.md as a corpus member and reads none of its rows. The
adapters/codex/test/native-surface.test.js pins `/fail open/i` and `/refuses? to start/i`
(L314–325) cover the adapter README, which this part does not touch.

Surfaces that describe the check today. `git grep` outside the design, plan and ADR dirs finds
exactly these four, and this part edits all four plus the entry itself: the JSDoc (L85),
BACKLOG L1274, record L334 and record L566. Neither README names the check, and ADR-600 keeps
it that way.

Constraints: no provenance refs (ADR, part, phase or backlog numbers) in the JSDoc, which is
source. BACKLOG and record prose may cite ADRs, as their siblings do. No codex version in the
JSDoc (ADR-573). No home-rooted paths anywhere. Use `<git>`, `<file>` and similar
placeholders, as below.

### TDD steps

No behaviour changes, so there is no RED step and no GREEN code. Each item below is either a
GUARD (it already passes and must still pass) or a text swap. Apply each swap by matching the
quoted old text exactly once, not by line number.

1. GUARD — adapters/codex/test/execpolicy-rules.test.js (all `describe`s, including
   `assertRulesIntegrity() — refuse a drifted/malformed deployed rules file`). It passes
   before and after the edit, because the edit is inside a comment and the function, the
   message and the generator are untouched.
2. GUARD — `git grep -l assertRulesIntegrity -- adapters bin engine scripts` lists exactly
   adapters/codex/src/execpolicy-rules.js and adapters/codex/test/execpolicy-rules.test.js,
   before and after. This proves that no caller was added, and the new JSDoc text does not
   name the symbol.
3. EDIT — `adapters/codex/src/execpolicy-rules.js` JSDoc. Old:

   ~~~text
    * drift (malformed content included), not one probed variant. Nothing in the
    * binding calls this check yet: it protects only when a caller runs it before
    * relying on the layer, and then refuses rather than proceed.
   ~~~

   New:

   ~~~text
    * drift (malformed content included), not one probed variant. Nothing in the
    * binding calls it: it is kept on demand because the binding has no launch
    * path of its own (operators start codex themselves), so it protects only when
    * a caller runs it before relying on the layer, and then refuses rather than
    * proceed.
   ~~~

4. EDIT — `BACKLOG.md` entry title (L237–238). Old:

   ~~~text
   **Should a launch or install path call `assertRulesIntegrity`?**
   `adapters/codex/src/execpolicy-rules.js` exports it and
   ~~~

   New:

   ~~~text
   **Should a launch or install path call `assertRulesIntegrity`? — closed by decision, kept on demand, 2026-10-16**
   (feat/rules-integrity-launch-wiring). `adapters/codex/src/execpolicy-rules.js` exports it and
   ~~~

5. EDIT — `BACKLOG.md`: add the decision sub-paragraph after L244. Old:

   ~~~text
   and none was wired. Open question: wire it into a launch or install path, or keep it on
   demand. Question only; no fix is scoped.
   ~~~

   New (the old two lines, a blank line, then the sub-paragraph; the existing blank line
   before the deploy-step entry stays):

   ~~~text
   and none was wired. Open question: wire it into a launch or install path, or keep it on
   demand. Question only; no fix is scoped.

   **Decision (2026-10-16): kept on demand** (ADR-599, ADR-600).
   `git grep -n assertRulesIntegrity -- adapters bin engine scripts` still matches only the
   definition and its test. (i) The binding launches nothing: `buildLaunchArgs` builds argv only,
   its sole caller is the conformance probe, and operators run `codex exec` themselves, so the
   instruction to "wire it at the launch boundary"
   (`docs/contributing/design/harden-prove-codex-binding.md` L421–436, B9) has no boundary to land on.
   (ii) On that launch path, codex 0.162.1 already refuses to start on an unparseable rules file
   (3/3). (iii) No install step deploys `craft.rules`, so a wired check would find the file absent
   on every documented install. (iv) Byte drift on a valid file has not changed enforcement: the
   rule body has been identical since `06e1983`, while a refusing check would refuse such a copy.
   The one gap codex misses, an empty or comments-only copy that parses cleanly and forbids nothing
   (`codex execpolicy check`, 0.162.1), comes from the copy step, so it moves to the deploy-step
   entry below. Pinned matrix and design context:
   [rules-integrity-launch-wiring](docs/contributing/design/rules-integrity-launch-wiring.md).
   ~~~

6. EDIT — `BACKLOG.md` deploy-step entry (L251–252). The entry stays open. Old:

   ~~~text
   Fix: one *Configure* step naming the copy, pinned like the other README instructions in
   `adapters/codex/test/native-surface.test.js`.
   ~~~

   New:

   ~~~text
   Fix: one *Configure* step naming the copy, pinned like the other README instructions in
   `adapters/codex/test/native-surface.test.js`. Measured 2026-10-16 (`codex execpolicy check`,
   0.162.1): an empty or comments-only `craft.rules` parses cleanly and forbids nothing, so no
   codex parse error flags a void copy, and the step that copies the file owns verifying what it
   wrote.
   ~~~

7. EDIT — `BACKLOG.md` delivered malformed-rules entry (L1274–1276). Old:

   ~~~text
   refuses on any drift (malformed included). It is an exported, unit-tested check with no caller in
   the binding: it protects only when something invokes it. (The committed-file drift-guard already
   existed; this covers the deployed copy.)
   ~~~

   New:

   ~~~text
   refuses on any drift (malformed included). It is an exported, unit-tested check with no caller in
   the binding, kept on demand by decision (2026-10-16) because the binding has no launch path of its
   own: it protects only when something invokes it. (The committed-file drift-guard already
   existed; this covers the deployed copy.)
   ~~~

8. EDIT — `docs/contributing/specs/codex-poc-record.md` row 3 (L334). Replace this tail of the
   row (the rest of the row is unchanged). Old:

   ~~~text
   It is an exported, unit-tested check with no caller in the binding, so it protects only when something invokes it. |
   ~~~

   New:

   ~~~text
   It is an exported, unit-tested check with no caller in the binding, kept on demand by decision (2026-10-16) because the binding has no launch path of its own, so it protects only when something invokes it. |
   ~~~

9. EDIT — `docs/contributing/specs/codex-poc-record.md` integrity row (L566) plus three new
   rows directly after it. Old (the tail of L566):

   ~~~text
   against the committed file it returns `{ intact: true }`. Nothing in the binding calls it. |
   ~~~

   New:

   ~~~text
   against the committed file it returns `{ intact: true }`. Nothing in the binding calls it: kept on demand by decision (2026-10-16), because the binding has no launch path of its own. |
   | Empty rules file, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Hermetic: `codex execpolicy check --rules <file> <git> push` with a throwaway `CODEX_HOME` that afterwards held only the probe's own output; no agent session. An empty file → exit 0, `{"matchedRules":[]}`: it parses cleanly and forbids nothing. Twice, same result. `assertRulesIntegrity('')` throws. |
   | Comments-only rules file, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same method. `adapters/codex/craft.rules` truncated before `prefix_rule(`, so only the disclosure comment remains → exit 0, `{"matchedRules":[]}`: it parses cleanly and forbids nothing. Twice, same result. `assertRulesIntegrity` throws. Unlike the malformed variant, it raises no parse error for `codex exec` to refuse on; that `codex exec` then loads it silently is inferred from the parse result, not run. |
   | Older deployed copy, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same method. The 2026-07-21 `craft.rules` (`06e1983`), whose rule body matches today's and whose disclosure comment differs → exit 0, `forbidden`, matchedPrefix `git push`, the same match as the committed file. `assertRulesIntegrity` throws on it: the check is byte-identical, so it refuses a copy whose enforcement is unchanged. |
   ~~~

10. REFACTOR — none. Do not reflow neighbouring lines and do not touch any other row or
    entry.

### Gate

Run from the worktree root. Each line shows its expected result.

```bash
log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "exit=$?"  # exit=0
grep -E '^# fail [1-9]|^not ok' "$log"                             # no output
git grep -n "calls this check yet" -- adapters                     # no output (exit 1)
git grep -n -w yet -- adapters/codex/src/execpolicy-rules.js       # no output (exit 1)
git grep -c "kept on demand" -- BACKLOG.md docs/contributing/specs/codex-poc-record.md adapters/codex/src/execpolicy-rules.js
#   BACKLOG.md:3  adapters/codex/src/execpolicy-rules.js:1  docs/contributing/specs/codex-poc-record.md:2
git grep -l assertRulesIntegrity -- adapters bin engine scripts
#   adapters/codex/src/execpolicy-rules.js  adapters/codex/test/execpolicy-rules.test.js  (only these two)
git grep -n assertRulesIntegrity -- adapters/codex/src             # one line: the `export function` definition (L94)
git grep -c "matchedRules" -- docs/contributing/specs/codex-poc-record.md   # :2
grep -n '^\*\*No install step deploys' BACKLOG.md                  # title unchanged (entry stays open)
git diff --no-ext-diff -U0 -- adapters/codex/src/execpolicy-rules.js BACKLOG.md docs/contributing/specs/codex-poc-record.md | grep '^+' | grep -E '/Users/|/home/'   # no output
```

The last line checks only added lines: the record already holds a `/Users/…` placeholder at L487,
so a whole-file grep is not a valid check. If the session's hook refuses `git diff`, the quoted new
text in steps 3–9 is the full added text, and it contains no home-rooted path.

### Commit

`docs(codex): record the rules integrity check as kept on demand`
