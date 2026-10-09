# Plan — arriving-GUARD rule in the construction contract

> Source: design doc `docs/contributing/design/arriving-guard-contract-rule.md` · ADRs 421, 422, 423, 424
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

**How this plan applies them.** One part, the design's "Delivery shape". It edits two files:
line 1 of `contracts/construction.md` and the `construction` entry of `PHASE_EXPECTATIONS` in
`engine/test/contract-equivalence.test.js`. One GUARD, one RED→GREEN cycle, no `engine/src/`
delta. The marker test cannot land apart from the contract line it pins (CI would be red in
between), so splitting would buy nothing. The part reverts on its own.

- **Paid eval sweep is not a part.** The `implementer-runs-guards` re-run per agent tier
  (design § Test strategy, "Paid sweep") is run by the orchestrator after this part lands,
  with the user's approval. No part runs `claude plugin eval` or any judge replay, and no part
  reads or edits `evals/**`.
- **Documentation updates are not a part.** The before → after numbers in the
  docs/guides/model-class-matrix.md note "Implementer case, 2026-10-09", the
  docs/contributing/maintainer-smokes.md § "Implementer case" paragraph (including its quote of
  the old sentence), and closing the BACKLOG.md entry "State the arriving-GUARD rule in the
  construction contract" belong to the documentation phase, after the sweep. No part touches
  them.
- **README corpus count.** The plan commit bumps README.md l. 180 from "[35 parted plans]" to
  "[36 parted plans]". The part adds no design doc, plan or ADR, so it does not touch README.md.

**Public surface.** The plan introduces no exported code symbol. The non-code surface it edits
and its downstream gates, all pre-paid inside Part 1:

| Surface | Downstream gates |
|---|---|
| `contracts/construction.md` line 1 (construction bundle, concatenated into every implementation spawn by engine/bin/contract-assemble.js) | `engine/test/contract-equivalence.test.js` `PHASE_EXPECTATIONS.construction` markers (edited in this part); `node engine/bin/contracts-lint.js contracts` (bundle non-empty, no "retrieval"); the agent-vs-inline "exactly two lines differ" test (unaffected: both modes carry the bundle); touched-`.md` prose lint in `scripts/ci.sh` (`engine/src/prose-lint-main.js` `BAN_LIST`) |

`contracts/` has no adapter mirror and no drift baseline: nothing is regenerated.
`agents/part-implementer.md` and its six mirrors under `adapters/` stay unchanged (its handback
line already has the RED/GREEN and deferred-observation slots the new clause names).

**Binding for the part.**

- No provenance references (ADR numbers, design ids, phase or backlog ids) in
  `contracts/construction.md` or `engine/test/contract-equivalence.test.js`. The verbatim text
  below cites none.
- No suppression directives. No backticks in the contract (no contract fragment uses them).
- Commit only the two files the part names (`git add <path> <path>` + `git commit`); never
  touch the branch, the index beyond those paths, the stash, or other files.
- Any command whose output may exceed ~100 lines writes to a scratch file under `$TMPDIR`;
  read back with `tail`/`grep`.

## Decision candidates

None open. ADRs 421–424 adopt every design recommendation: D-1 option (b), the exact line-1
text below; D-2 (a), on line 1; D-3 (a), `agents/part-implementer.md` unchanged; D-4 (c), both
markers pinned. The only plan-level choice, running the GUARD step before the RED step, is
forced by observability: with the GUARD marker added first, its pass is visible as a fully
green suite; added after the RED marker, it would hide behind that marker's failure.

## Part 1 — Treat a GUARD that fails on its first run as a RED in the construction contract

### Context

Files this part edits (both by hand):

- `contracts/construction.md` — 4 lines, ends with one newline, no backticks anywhere. The
  construction bundle: engine/bin/contract-assemble.js concatenates it into every
  implementation spawn (the only descriptor carrying it is `implementation` in
  pipeline/default.yml). l. 1 is today, exactly (355 bytes plus the newline):

  ```
  RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test. A plan GUARD entry is written, run, and confirmed passing for its stated reason: it owes no failure and no GREEN, and no step breaks code to watch it fail.
  ```

  Only l. 1 changes (GREEN 1). Its first two sentences stay byte-identical. Lines 2–4
  ("Scope: …", "Gate before commit; …", "Tests follow the conventions …") do not change. The
  file keeps 4 lines and its trailing newline.
- `engine/test/contract-equivalence.test.js` — the `PHASE_EXPECTATIONS` const (l. 33–40), its
  `construction` entry at l. 35, today exactly:

  ```js
    construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut'],
  ```

  The per-bundle loop (l. 86–105) runs, for each descriptor and each bundle in
  `descriptor.contract`, the test
  `Given descriptor "<id>" with bundle "<bundle>", when assembled in agent mode, then bundle markers are all present`.
  For this bundle the one instance is
  `Given descriptor "implementation" with bundle "construction", when assembled in agent mode, then bundle markers are all present`
  (`ok 40` in today's run). It asserts each marker in order with `hasCI(result, marker)` and
  fails on the first missing one with the message
  `Descriptor "implementation" bundle "construction": marker "<marker>" missing`.
  `hasCI` (engine/test-helpers/contract-markers.js, read-only) is a case-insensitive substring
  check: `haystack.toLowerCase().includes(marker.toLowerCase())`. `FRAGMENTS.construction` is
  read from the real contracts/construction.md at module load, so the test sees the file as
  it stands.

Baseline (measured on this branch): `(cd engine && node --test test/contract-equivalence.test.js)`
reports `# tests 104`, `# pass 104`, `# fail 0`.

Read-only references (do not edit): docs/contributing/design/arriving-guard-contract-rule.md
§ Design "The line after" (source of the verbatim text) and "Contract edge behaviour";
docs/contributing/adr/421-a-guard-failing-on-its-first-run-is-a-red.md;
engine/test-helpers/contract-markers.js; engine/src/contracts-lint-main.js;
engine/src/prose-lint-main.js (`BAN_LIST`: the new text uses none of its words).
Not touched: agents/part-implementer.md, adapters/**, engine/test/scenarios.test.js (reads the
file into `REAL_FRAGMENTS`, asserts none of its text), engine/test/fixtures/contracts/**,
evals/**.

### TDD steps

GUARD 1 (`confirmed passing for its stated reason` marker): in
`engine/test/contract-equivalence.test.js`, append `'confirmed passing for its stated reason'`
to the `construction` array, giving:

```js
  construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut', 'confirmed passing for its stated reason'],
```

Run `(cd engine && node --test test/contract-equivalence.test.js > "$TMPDIR/ce.log" 2>&1); echo $?`
and `grep -E '^# (pass|fail)' "$TMPDIR/ce.log"`: exit 0, 104 pass, 0 fail. Why it passes: l. 1
of contracts/construction.md already carries "confirmed passing for its stated reason" (the
plan GUARD sentence). It pins the phrase the eval's contract-delivered grader matches, so a
later rewording fails CI instead of a paid run. Never break the contract to watch it fail.

RED 1 (`fails on its first run is a RED` marker): append `'fails on its first run is a RED'`
to the same array, giving exactly:

```js
  construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut', 'confirmed passing for its stated reason', 'fails on its first run is a RED'],
```

Re-run the same command: exit non-zero, 103 pass, 1 fail. The failing test is
`Given descriptor "implementation" with bundle "construction", when assembled in agent mode, then bundle markers are all present`,
with `Descriptor "implementation" bundle "construction": marker "fails on its first run is a RED" missing`.
Expected failure reason: the contract's only GUARD rule today says a GUARD "owes no failure
and no GREEN" and says nothing about one that fails on its first run.

GREEN 1: replace l. 1 of `contracts/construction.md` with exactly this one line (verbatim from
the design; GUARD bare, no backticks):

```
RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test. A plan GUARD entry is written, run, and confirmed passing for its stated reason, and no step breaks code to watch it fail. A GUARD that passes on its first run owes no failure and no GREEN. A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker.
```

Re-run: exit 0, 104 pass, 0 fail. Checks: `wc -l < contracts/construction.md` prints 4;
`git diff --no-ext-diff -U0 -- contracts/construction.md` shows one hunk, `@@ -1 +1 @@`;
`grep -c 'retrieval' contracts/construction.md` prints 0; `grep -c "$(printf '\140')" contracts/construction.md`
(counts backticks) prints 0. Contract assembly in a throwaway:
`T=$(mktemp -d) && (cd "$T" && node <worktree>/engine/bin/contract-assemble.js --descriptor-id implementation > "$T/out.txt"); echo $?`
prints 0, `wc -l < "$T/out.txt"` prints 18, and `grep -c 'confirmed passing for its stated reason' "$T/out.txt"`
and `grep -c 'fails on its first run is a RED' "$T/out.txt"` each print 1.
`<worktree>` is the absolute, symlink-free worktree path: the bin's entry guard compares
`process.argv[1]` with its own resolved path, so a path through a symlink (macOS `/var` →
`/private/var`) exits 0 and prints nothing.

REFACTOR: none. The change is one prose line and two array entries; there is no duplication
or structure to improve, and the sibling entries of `PHASE_EXPECTATIONS` stay one-line arrays.

### Gate

`bash scripts/ci.sh > "$TMPDIR/ci.log" 2>&1; echo $?` prints 0; read `tail -n 30 "$TMPDIR/ci.log"`.
It runs `contracts-lint`, the engine suite (including contract-equivalence.test.js and
scenarios.test.js), test/plugin-evals-local-only.test.js, readme-drift and the touched-`.md`
prose lint. On a non-zero exit, `grep -n -E 'not ok|fail|error' "$TMPDIR/ci.log" | head -40`.

### Commit

`fix(contracts): treat a GUARD that fails on its first run as a RED`
