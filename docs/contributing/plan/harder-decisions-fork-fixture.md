# Plan — harder fixture for `decisions-escalates-fork`

> Source: design doc `docs/contributing/design/harder-decisions-fork-fixture.md` · ADRs 425, 426, 427, 428
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

**How this plan applies them.** One part, as the design's "Delivery shape" proposes. It is
fixture-only (an eval-case data file): no `engine/`, `skills/`, `agents/`, `contracts/` or
`adapters/` delta, so it stands alone under the sizing exception. It edits one file, one
line, with one RED→GREEN cycle.

- **No unit-test RED, stated honestly.** CI never reads `evals/` (ADR-393), and
  test/plugin-evals-local-only.test.js FAILS any file under test/, engine/test/ or an adapter
  test dir that names an `evals/` path. So the part adds no node test. Its RED is a local
  probe script the implementer writes to a `mktemp -d` path OUTSIDE the worktree and runs: it
  scaffolds the case into a throwaway git sandbox and counts the dropped phrase. It fails
  today because the phrase is present, and passes after the GREEN. Checks that already pass
  at their step are labelled GUARD.
- **Every probe that writes runs in a throwaway.** The case's scaffold.sh commits into its
  cwd, so the probe runs it in a fresh `mktemp -d` + `git init -q`, never in the worktree.
- **README corpus count.** The plan commit bumps README.md l. 180 from "[36 parted plans]" to
  "[37 parted plans]" (checked by test/readme-drift.test.js against the live tree). The part
  adds no design doc, plan or ADR, so it does not touch README.md.
- **Pre-probed.** Before this plan was written, a throwaway clone of this branch (with the
  worktree's engine/node_modules linked in) took the GREEN 1 command below: the probe printed
  the GREEN 1 expected lines, `git diff --numstat` showed `1 1` on the one file, and
  `bash scripts/ci.sh` exited 0 with its log ending on the craft-adr OK line.

**Public surface.** None. The part introduces no exported symbol, command, barrel entry or
doc surface; it changes one data line of an existing eval fixture, which `claude plugin eval`
copies into its sandbox via the case's unchanged scaffold.sh.

**Binding for the part.**

- No provenance references (ADR numbers, design ids, phase or backlog ids) in the fixture
  file. The edit only removes text, so it adds none.
- No suppression directives. No swallowed errors in the probe (it prints every exit code).
- Commit only the one file (`git add <path>` then `git commit -m "<message>"`); never touch
  the branch, the index beyond that file, the stash, or other files.
- `bash scripts/ci.sh` prints tens of thousands of lines: write it to a `mktemp` file and
  read back with `tail`/`grep`.
- Never run `claude plugin eval`. Never write a test under test/, engine/test/ or adapters/
  that names `evals/`.

## Decision candidates

None open. ADRs 425–428 adopt every design recommendation (D-1..D-4, option (a) each): the
edit drops only the uncovered-fork sentence (425), the pilot gates the sweep on validity
only (426), a Δ near 0 is recorded as prune evidence (427), and the before baseline is the
2026-10-06 pilot (428). The design pins the exact bytes of the edited line.

## Follow-on, not parts

These run after the implementation phase and are owned by others; no part performs them.

- **Paid pilot and 3-run sweep** (design § Test strategy, R3): the orchestrator runs
  `claude plugin eval . --tag phase --case decisions-escalates-fork --runs 1 …`, checks the
  validity items of ADR-426, then the 3-run with `--max-cost-usd` = pilot `costUsd` × 3 × 1.5,
  hand-reads every FAIL against the design's outcome matrix and runs the trace check per run.
- **Before → after record** (R4): the documentation phase edits
  docs/contributing/maintainer-smokes.md (cost-table row l. 164, the note line under the
  table l. 170, "What the Δ column says" l. 221–223) and closes the BACKLOG.md entry
  (l. 195–198), with the D-3 reading of ADR-427.

## Part 1 — Drop the uncovered-fork sentence from the fixture design doc

### Context

Worktree: /Users/scolladon/workspace/perso/craft-harder-decisions-fork-fixture.

File to edit (the only one): `evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md`,
line 27, the single data row of its `## Decision candidates` table. Current bytes of the
row's Why cell (last cell), verbatim:

```text
| Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. Whether piped callers matter more than predictability is a product call no ADR covers. |
```

Target bytes of the same cell (R1; ADR-425 option (a)):

```text
| Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. |
```

The rest of line 27 (the `| 1 | What …` prefix and alternatives (a)–(c), the `**(a)**`
recommendation) and every other line of the file stay byte-identical. File today: 1420 bytes,
`shasum` a293275b06ed017421a6cfd02cd4eef59f6e1a3b. After the edit: 1333 bytes (87 removed:
one space plus the 86-character sentence), `shasum` 132e177a58581b8acb367bb26f7f52102ec9c659.

Do NOT change (ADR-425 and the design's "Remaining fork signals" table): Context lines 9–10
("Some callers pipe its output into scripts that match on `Hello`."), Requirement 1 on line 14
("… on a terminal."), the Design pointer on lines 20–21 ("Its behaviour when stdout is not a
terminal is decision candidate 1."), the table header. Nothing else under
evals/decisions-escalates-fork/ changes: case.yaml, prompt.md, scaffold.sh,
fixture/docs/adr/001-greet-stays-bash-3-portable.md and the four graders (fired.md,
no-adr.md, no-false-noop.md, presents-options.md) are out of scope.

Read-only references: evals/decisions-escalates-fork/scaffold.sh (refuses a cwd that is not a
fresh git repo with no HEAD; copies fixture/ into cwd and commits "chore: fixture base"),
evals/decisions-noop-when-clear/fixture/docs/design/shout-flag.md (the sibling; untouched),
test/plugin-evals-local-only.test.js (why no node test may name `evals/`).

Other mentions of the dropped phrase stay as they are: BACKLOG.md l. 196 and
docs/contributing/maintainer-smokes.md l. 222 belong to the follow-on documentation phase;
docs/contributing/plan/plugin-eval-suite.md l. 646 and l. 800 are a dated record (design
§ Out of scope); the design doc and ADR-425 quote it on purpose. No test or lint reads any of
them for this phrase.

### TDD steps

RED 1 — scaffold probe. Write this script to a new file outside the worktree
(`probe="$(mktemp -d)/fork-fixture-probe.sh"`), then run
`bash "$probe" /Users/scolladon/workspace/perso/craft-harder-decisions-fork-fixture 2>&1`
(4 lines of output). It builds its own throwaway sandbox; it never writes in the worktree.

```bash
#!/usr/bin/env bash
set -uo pipefail
case_dir="$1/evals/decisions-escalates-fork"
sbx="$(mktemp -d)" && cd "$sbx" && git init -q
bash "$case_dir/scaffold.sh"; echo "scaffold exit=$?"
git log --oneline | sed 's/^[0-9a-f]* //'
echo "product call=$(grep -c 'product call' docs/design/shout-flag.md)"
echo "trade-off kept=$(grep -c 'break when a caller adds' docs/design/shout-flag.md)"
```

Expected now: "scaffold exit=0", "chore: fixture base", "product call=1",
"trade-off kept=1". The RED line is "product call=1" (target 0): the fixture's Why cell still
ends with the sentence that names the fork as uncovered, so the scaffolded sandbox hands an
eval arm the conclusion.

GUARD 1 — the "trade-off kept=1" line of the same probe already passes at RED 1, because the
trade-off clause precedes the sentence being dropped. It must still print 1 after GREEN 1.

GREEN 1 — from the worktree root, drop the sentence with one anchored substitution (BSD and
GNU sed both accept `-i.bak`):

```bash
F=evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md
sed -i.bak 's/ Whether piped callers matter more than predictability is a product call no ADR covers\. |$/ |/' "$F" && rm "$F.bak"
```

Check: rerun the RED 1 probe. Expected, line for line: "scaffold exit=0",
"chore: fixture base", "product call=0", "trade-off kept=1". Any other line means the
substitution missed or over-matched: read `git diff --no-ext-diff` of the file and edit line
27 alone until its Why cell matches the Context block's target bytes and the rest of the line
matches the current bytes. Never use checkout, restore or stash to undo it.

GUARD 2 — static checks on the worktree, passing because GREEN 1 removed exactly the
sentence:

- `git diff --no-ext-diff --numstat` prints exactly one line:
  `1	1	evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md`.
- `shasum evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md` prints
  132e177a58581b8acb367bb26f7f52102ec9c659.
- `grep -c 'ADR' evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md` prints 0
  and `grep -c 'docs/adr/001' evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md`
  prints 1: the doc's only ADR reference left is the Context link to ADR 001.

No REFACTOR: the bytes are fixed by the design.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -1 "$log"` —
exit 0 AND last line "craft-adr: OK — 428 ADR(s) checked, 4 declaring supersession."
Require both: an exit 0 whose log does not end on the craft-adr line means a step was
skipped, so treat it as red. On failure, `grep -n "^not ok\|^ci:\|unexpected" "$log" | head`.
Plus the RED 1 probe output of GREEN 1 and the GUARD 2 checks, all as stated.

### Commit

`test(evals): drop the uncovered-fork hint from the decisions-escalates-fork fixture`
