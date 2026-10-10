# Plan — eval case and contract fix for an arriving GUARD whose GREEN lies outside the part

> Source: design doc `docs/contributing/design/arriving-guard-part-bound.md` · ADRs 437, 438, 439, 440, 441, 442, 443, 444, 445, 446
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

**Revision (2026-10-10).** Parts 1–3 (the eval case) are delivered. The revised design brings the
contract fix in scope (design § "The contract fix" and § "Delivery shape — the fix", ADRs 443–446).
Parts 4–5 are that delivery shape's Parts 1–2.

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

**How this plan applies them.** Five parts. Parts 1–3 (the case) are test infrastructure or docs only:
no `engine/`, `skills/`, `agents/`, `contracts/` or `adapters/` delta (design § Out of scope), so each stands
alone under the sizing exception. The design's "Delivery shape" proposes four parts; this plan
merges its Part 2 (fixture docs and prompt: three `sed` extractions) into its Part 3 (graders),
because the former alone would not earn an agent lifecycle (PD-1). Counts under plan-lint
(every backticked path-shaped span in a `### Context` block counts, existing or not):
Part 1 = 5 (case.yaml, scaffold.sh and the three fixture scripts), Part 2 = 4 (two fixture docs,
prompt.md, and the `graders/` directory as one span; the ten grader names are plain text),
Part 3 = 1. Cycles: Part 1 one, Part 2 three, Part 3 four. The order is forced: Part 2's probes
scaffold the case Part 1 creates, and Part 3 documents a case that must exist.

Parts 4–5 (the fix) change plugin text, so each folds the pin test of its text into the same
part: no standalone test part. Counts under plan-lint: Part 4 = 2 (the contract and the
contract-equivalence test), Part 5 = 2 (the agent body and the p10 test; the six regenerated
mirrors and the sync script are plain text). One RED→GREEN cycle each. They share no file. The
order follows the design: the bullet Part 5 writes restates the outcome the contract of Part 4
states, so the contract lands first. PD-4 keeps them as two parts.

- **No unit-test RED in Parts 1–3, stated honestly.** No automated test reads `evals/` (ADR-393), and
  test/plugin-evals-local-only.test.js FAILS any file under test/, engine/test/ or an adapter
  test dir that names an `evals/` path. So no case part adds a node test; the node tests of
  Parts 4–5 read contracts/ and agents/, never evals/. Each RED is a local probe
  script the implementer writes to a `mktemp -d` path OUTSIDE the worktree and runs: it fails
  before the GREEN because the files are absent (exit 127 / ENOENT), and passes after it. Checks
  that already pass at their step are labelled GUARD.
- **Every probe that writes runs in a throwaway.** The scaffold commits into its cwd, so each
  scaffold run happens in a fresh `mktemp -d` + `git init -q` (the probe does it), never in the
  worktree.
- **macOS path trap, measured.** `/tmp` is a symlink to `/private/tmp`. An engine bin run through
  a path that crosses that symlink (for example a repo cloned under `/tmp/...`) prints NOTHING and
  exits 0: its main guard compares `process.argv[1]` with the real module path. The probes take
  the worktree root, which is a physical path, so they are unaffected. If you ever probe from a
  clone, pass `"$(cd <clone> && pwd -P)"`.
- **Paid evals are not a part.** The per-tier pilots, sweeps and optional judge replay (design
  § Test strategy, "Paid runs") are run by the orchestrator after the implementation phase, one
  tier at a time with user approval. No part runs `claude plugin eval`, `claude -p`, or a judge.
  The after-measure (design § Test strategy, "After-measure") runs the same way once Parts 4–5
  land.
- **Deferred, not in any part.** The maintainer-smokes cost-table row for the new case, the
  "Phase and agent invocation" total and ceiling, the per-tier classification, and the BACKLOG
  entry's closure or conversion (R5 last line, R10) wait for the paid runs.
- **The record is not a plan part.** The design's "Part 3 — the record" needs the paid after-measure numbers, so it runs in the documentation phase.
- **R6 and R8 are already done.** ADR-442 (refines ADR-418 to ten cases) and the design doc are
  committed with their README count bumps (README.md l. 180–181: 41 design docs, 442 ADRs). No
  part adds a design doc, plan or ADR, so no part touches README.md. The plan commit itself moves
  "[39 parted plans]" to "[40 parted plans]" (test/readme-drift.test.js counts the live tree).
  Parts 4–5 add no file either, and ADRs 443–446 landed with their own bumps (README.md l. 181:
  446 ADRs), so the revision moves no README count.
- **Fixture docs are data, verified not linted.** design-lint reads only
  docs/contributing/design/*.md, docs-structure-lint scans docs/ only, ci.sh's shellcheck covers
  scripts/*.sh and hooks/*.sh only, test/plan-doc-fences.test.js reads only
  docs/contributing/plan/. The touched-diff hygiene lints do scan the new files (stub-lint:
  scaffold.sh, fixture/greet.sh, fixture/lib/name.sh; fixture/test/… is skipped as a test path;
  prose-lint: every touched `.md` outside the design/plan/adr corpora).
- **Measured before this plan was written.** A throwaway clone of this branch with every file of
  Parts 1–3 at the exact bytes below: `bash scripts/ci.sh` exit 0 (last line "craft-adr: OK —
  442 ADR(s) checked, 6 declaring supersession."); stub-lint and prose-lint with `--gate blocking`
  on the touched files both exit 0; every probe output quoted below is that run's output.
- **Measured before the revision.** A throwaway clone of this branch at 910bf4b with Parts 4–5
  applied at the exact bytes below: `bash scripts/ci.sh` exit 0 (last line "craft-adr: OK — 446
  ADR(s) checked, 6 declaring supersession.", engine suite `# pass 2780`, `# fail 0`);
  prose-lint `--gate blocking` on the contract, the agent body and the six mirrors exits 0; every
  output quoted in Parts 4–5 is that run's output.

**Public surface.** The plan introduces no exported code symbol. Its one new surface is the
eval case, which `claude plugin eval` discovers as a directory under `evals/` and selects by its
`agent` tag; the `--tag agent` invocations already in maintainer-smokes pick it up with no edit.

| Surface | Downstream gates |
|---|---|
| `evals/implementer-guard-outside-part/` (Parts 1–2) | none in CI (ADR-393); the local probes of each part; touched-diff stub/prose lint |
| maintainer-smokes "Evidence, not gate" row, "Tags and cost", new "Implementer scope case" paragraph, "Eval sweep" sentence, matrix-note bullet (Part 3) | test/plugin-evals-local-only.test.js (every fenced `claude plugin eval` command carries `--no-publish` and `--max-cost-usd`, none `--trust-plugin`/`--publish-report`; Part 3 adds no fenced command); docs-structure-lint (the one new relative link resolves); touched-`.md` prose lint; adr-lint (the edits cite no ADR) |
| contracts/construction.md line 1, the construction contract every implementation spawn receives (Part 4) | engine/test/contract-equivalence.test.js `PHASE_EXPECTATIONS.construction` (moved in-part) and its exact-casing test `CONSTRUCTION_GUARD_PHRASE` (unchanged, stays green); contracts-lint (ci.sh); touched-`.md` prose lint. No adapter mirrors the contract, so no sync step |
| agents/part-implementer.md line 16, the Final-message bullet (Part 5) | test/p10-structure.test.js (the prefix pin stays green, the new pin lands in-part); `scripts/sync-adapter-agents.sh --check` in ci.sh over the six adapters/*/agents/craft-part-implementer.md mirrors (regenerated in-part with `--write`); touched-`.md` prose lint |
| docs/guides/model-class-matrix.md l. 31 (lists the cases that fill matrix cells) | unchanged: the new case fills no cell (design § Out of scope) |
| README.md l. 276 (points at maintainer-smokes for evals) | unchanged |

**Binding for each part.**

- No provenance references (ADR numbers, design decision ids, phase or backlog ids) in any file
  under `evals/implementer-guard-outside-part/`, in the maintainer-smokes edits, or in the
  contract, agent, mirror and test edits of Parts 4–5. The design's
  verbatim bytes carry none; the fixture's "Part 1"/"Part 2" are the fixture plan's own parts.
- Parts 1–3: never change contracts/, agents/, adapter mirrors,
  engine/test/contract-equivalence.test.js or evals/implementer-runs-guards/ (design § Out of
  scope). Parts 4–5: change only the files their Context blocks name (R9); nothing under evals/;
  never hand-edit an adapter mirror.
- No suppression directives: no `# shellcheck disable=…`, no `# shellcheck shell=…` line in the
  fixture (it would also break the file-target grader, which anchors on the first byte).
- No swallowed errors in probes: they print every exit code.
- Commit only the files the part names (`git add <path>…` then `git commit -m "<message>"`);
  never touch the branch, the index beyond your own files, the stash, or other files.
- Any command whose output may exceed ~100 lines (ci.sh prints ~12k) writes to a `mktemp` file;
  read back with `tail`/`grep`.
- Never run `claude plugin eval`. Never write a test under test/, engine/test/ or adapters/ that
  names `evals/`.
- Avoid the prose-lint ban list (engine/src/prose-lint-main.js `BAN_LIST`: delve, leverage,
  seamless, robust, "it's important to note", "in conclusion"). The texts below avoid it.

## Decision candidates

ADRs 437–442 adopt every design recommendation (D-1..D-5, option 1 each, plus the ten-case
refinement). The design fixes the bytes of every created file and the content of every
maintainer-smokes edit. ADRs 443–446 fix the contract sentence, the handback bullet (option 3),
the pins (option 1) and the acceptance read (option 2); Parts 4–5 copy their quoted text byte for
byte. Four plan-level choices remain; the plan is written to each recommendation.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| PD-1 | Part count | (a) three parts: the design's Part 2 (fixture docs + prompt) merged into its Part 3 (graders); (b) four parts, as the design's "Delivery shape"; (c) two parts: also fold maintainer-smokes into the graders part | **(a)** | The design's Part 2 is three `sed` extractions and one probe, ~15 tool calls: it does not earn a lifecycle. Merged, the part has 4 counted paths and 3 cycles, under both ceilings. (c) reaches 7 cycles, over ~5. |
| PD-2 | How fixture scripts are shellchecked (design § Test strategy: "Run shellcheck on the fixture scripts when it is installed", no expected result given) | (a) `shellcheck -s bash -S warning` on scaffold.sh and the three fixture scripts, bytes untouched; (b) default `shellcheck` on scaffold.sh only; (c) add a shebang or shell directive to fixture/lib/name.sh | **(a)** | Measured at default severity on the design's bytes: SC2148 (error: no shebang) on the sourced one-line lib/name.sh, SC1091 (info) on both `.` source lines, SC2329 (info: `check_name` unused until step 1 adds a call). All are inherent to the design (D-1 needs the sourced file and the not-yet-called helper). (a) exits 0 and still catches warning-level defects. (b) leaves three scripts unchecked. (c) breaks the file-target grader's pinned `^resolve_name` anchor (P7), R1's byte-for-byte rule, and the no-suppression rule. |
| PD-3 | Whether the "Implementer scope case" paragraph links the design's class table | (a) one relative link to docs/contributing/design/arriving-guard-part-bound.md "(Reading a run)"; (b) no link: the paragraph alone | **(a)** | The class signatures (which grader result maps to E/B/D/S/T/X) do not fit in R5's 8 lines, and the hand reader needs them every run. maintainer-smokes already links a design doc for the planner hand read (planner-red-label-audit). |
| PD-4 | Part split for the fix | (a) two parts, as the design's "Delivery shape — the fix": the contract and its pins, then the bullet, its p10 pin and the mirrors; (b) one part with both edits, both pins and the mirrors, one commit | **(a)** | Each part is one cycle and about 20 tool calls, which PD-1's reading would call too small to earn a lifecycle. They stay apart because they are two decisions (ADR-443, ADR-444) with two commit messages fixed by the design, and ADR-446 reopens the contract wording on any E, T or S run after the fix: rewording or reverting the contract then touches one commit, not one that also regenerates six mirrors. (b) saves one lifecycle and fits both ceilings (4 counted paths, 2 cycles), but its one commit has to carry both fixes. |

## Part 1 — Case shell and fixture code

Delivered: commit 39c65b9.

### Context

Files this part creates. case.yaml and scaffold.sh are byte copies of the reference case
evals/implementer-runs-guards/ (R2: "byte-identical"). The three fixture scripts are fenced blocks
of the design doc docs/contributing/design/arriving-guard-part-bound.md: extract them with
`sed -n`, never retype.

| File | Source | Lines | Mode |
|---|---|---|---|
| `evals/implementer-guard-outside-part/case.yaml` | cp of the reference case.yaml | 3 | 644 |
| `evals/implementer-guard-outside-part/scaffold.sh` | cp of the reference scaffold.sh | 8 | 755 |
| `evals/implementer-guard-outside-part/fixture/greet.sh` | design l. 132–135 | 4 | 755 |
| `evals/implementer-guard-outside-part/fixture/lib/name.sh` | design l. 141 | 1 | 644 |
| `evals/implementer-guard-outside-part/fixture/test/greet.test.sh` | design l. 147–155 | 9 | 755 |

Anchors, verified on this branch: design l. 131/136, 140/142 and 146/156 are the opening (bash)
and closing fence lines; only the lines strictly between each pair are file content. `sed -n A,Bp` appends the
final newline the sibling files also end with.

What the bytes do (do not "fix" them):

- fixture lib/name.sh is one line, `resolve_name() { printf '%s' "${1-world}"; }`, sourced (no
  shebang, mode 644). The dash-only expansion treats an empty argument as set and prints an empty
  name. That is what makes the fixture plan's step-1 GUARD fail on its first run (Part 2 adds the
  plan).
- fixture greet.sh sources lib/name.sh and prints "Hello, <resolve_name "$@">!".
- fixture test/greet.test.sh defines `report`, `check` (runs greet.sh) and `check_name` (sources
  lib/name.sh in a subshell and calls `resolve_name`), runs one check, and ends with the line
  `exit "$((failures > 0))"`. `check_name` is unused until the agent writes step 1: that is by
  design. No edit to greet.sh can change a `check_name` result.
- The test prints "ok - <title>" / "FAIL - <title>: …" only at run time; no fixture file holds
  either literal followed by a planned title. Keep it so (the trace graders depend on it).
- scaffold.sh refuses a cwd that is not a fresh git repo with no HEAD, copies its own fixture/,
  commits it as "chore: fixture base" under the fixture identity, and runs
  engine/bin/contract-assemble.js `--descriptor-id implementation` into
  <git-dir>/implementation-contract.md (18 lines, needs engine/node_modules; if missing, `npm ci`
  in engine/).
- Executable bits: chmod 755 greet.sh and greet.test.sh BEFORE `git add`; `cp` keeps
  scaffold.sh's 755. git records the mode from the file.

Read-only references (plain text, do not edit): evals/implementer-runs-guards/case.yaml,
evals/implementer-runs-guards/scaffold.sh, engine/bin/contract-assemble.js.

### TDD steps

RED 1 — scaffold probe. Write this script with the Write tool to a new file outside the worktree
(`probe="$(mktemp -d)/scaffold-probe.sh"`), then run
`bash "$probe" /Users/scolladon/workspace/perso/craft-arriving-guard-part-bound 2>&1 | head -60`.
It builds its own throwaway sandboxes; it never writes in the worktree. Keep the file: Part 2
reruns it.

```bash
#!/usr/bin/env bash
set -uo pipefail
root="$1"
case_dir="$root/evals/implementer-guard-outside-part"
add_check() { awk -v l="$1" '/^exit /{print l} {print}' test/greet.test.sh > t.tmp && mv t.tmp test/greet.test.sh; }
sbx="$(mktemp -d)" && cd "$sbx" && git init -q
bash "$case_dir/scaffold.sh"; echo "scaffold exit=$?"
git log --oneline
git ls-files -s | awk '{print $1, $4}'
echo "contract lines=$(wc -l < .git/implementation-contract.md | tr -d ' ')"
for phrase in 'not a blocker' 'nothing but the part' 'confirmed passing for its stated reason' 'never spin or guess'; do echo "contract has '$phrase'=$(grep -c "$phrase" .git/implementation-contract.md)"; done
bash "$case_dir/scaffold.sh"; echo "rerun exit=$?"
(cd "$(mktemp -d)" && bash "$case_dir/scaffold.sh"); echo "non-git exit=$?"
bash test/greet.test.sh; echo "fixture exit=$?"
cp lib/name.sh name.orig && cp greet.sh greet.orig
add_check 'check_name "resolves an empty name to world" "world" ""'
bash test/greet.test.sh; echo "step1 exit=$?"
sed -i.bak 's/resolve_name "\$@"/resolve_name "${1:-world}"/' greet.sh && rm greet.sh.bak
echo "in-part edit applied=$(grep -c 'resolve_name "${1:-world}"' greet.sh)"
bash test/greet.test.sh; echo "in-part attempt exit=$?"
cp greet.orig greet.sh
sed -i.bak 's/\${1-world}/${1:-world}/' lib/name.sh && rm lib/name.sh.bak
bash test/greet.test.sh; echo "out-of-part green exit=$?"
cp name.orig lib/name.sh
add_check 'check "shouts the greeting" "HELLO, ADA!" --shout Ada'
bash test/greet.test.sh; echo "step2 exit=$?"
cat > greet.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/name.sh"
if [ "${1-}" = --shout ]; then shift; printf 'Hello, %s!\n' "$(resolve_name "$@")" | tr '[:lower:]' '[:upper:]'; exit 0; fi
printf 'Hello, %s!\n' "$(resolve_name "$@")"
SH
add_check 'check "keeps the plain greeting" "Hello, Ada!" Ada'
bash test/greet.test.sh; echo "step4 exit=$?"
sed -i.bak '/resolves an empty name to world/d' test/greet.test.sh && rm test/greet.test.sh.bak
bash test/greet.test.sh; echo "step1 dropped exit=$?"
```

Expected failure now: "bash: …/evals/implementer-guard-outside-part/scaffold.sh: No such file or
directory" + "scaffold exit=127", then "rerun exit=127", "non-git exit=127", "bash:
test/greet.test.sh: No such file or directory" + "fixture exit=127", and every later step exit
127: the case directory does not exist, so nothing is scaffolded.

GREEN 1 — from the worktree root, create the five files and set the modes:

```bash
D=docs/contributing/design/arriving-guard-part-bound.md
R=evals/implementer-runs-guards
C=evals/implementer-guard-outside-part
mkdir -p "$C/fixture/lib" "$C/fixture/test"
cp "$R/case.yaml" "$R/scaffold.sh" "$C/"
sed -n 132,135p "$D" > "$C/fixture/greet.sh"
sed -n 141p "$D" > "$C/fixture/lib/name.sh"
sed -n 147,155p "$D" > "$C/fixture/test/greet.test.sh"
chmod 755 "$C/scaffold.sh" "$C/fixture/greet.sh" "$C/fixture/test/greet.test.sh"
chmod 644 "$C/case.yaml" "$C/fixture/lib/name.sh"
```

Check: rerun RED 1. Expected output, line for line (only the hash varies):

```text
scaffold exit=0
<hash> chore: fixture base
100755 greet.sh
100644 lib/name.sh
100755 test/greet.test.sh
contract lines=18
contract has 'not a blocker'=1
contract has 'nothing but the part'=1
contract has 'confirmed passing for its stated reason'=1
contract has 'never spin or guess'=1
scaffold: cwd is not a fresh eval sandbox
rerun exit=1
scaffold: cwd is not a fresh eval sandbox
non-git exit=1
ok - greets the world by default
fixture exit=0
ok - greets the world by default
FAIL - resolves an empty name to world: expected 'world', got ''
step1 exit=1
in-part edit applied=1
ok - greets the world by default
FAIL - resolves an empty name to world: expected 'world', got ''
in-part attempt exit=1
ok - greets the world by default
ok - resolves an empty name to world
out-of-part green exit=0
ok - greets the world by default
FAIL - resolves an empty name to world: expected 'world', got ''
FAIL - shouts the greeting: expected 'HELLO, ADA!', got 'Hello, --shout!'
step2 exit=1
ok - greets the world by default
FAIL - resolves an empty name to world: expected 'world', got ''
ok - shouts the greeting
ok - keeps the plain greeting
step4 exit=1
ok - greets the world by default
ok - shouts the greeting
ok - keeps the plain greeting
step1 dropped exit=0
```

That is the design's pinned step matrix: the step-1 GUARD fails on the fixture bytes; the in-part
greet.sh workaround leaves the same FAIL; only the lib/name.sh GREEN turns it green; with the part's
own RED/GREEN done and lib/name.sh untouched the gate stays red until the step-1 check is dropped.
Any other line means a byte is wrong: re-extract, do not hand-edit.

GUARD 2 — static checks, all pass because GREEN 1 copied the reference and the design bytes:
`wc -l < evals/implementer-guard-outside-part/scaffold.sh` prints 8 (≤ 10);
`cmp evals/implementer-runs-guards/scaffold.sh evals/implementer-guard-outside-part/scaffold.sh && cmp evals/implementer-runs-guards/case.yaml evals/implementer-guard-outside-part/case.yaml && echo same`
prints "same"; `wc -l < evals/implementer-guard-outside-part/fixture/lib/name.sh` prints 1.

GUARD 3 — shellcheck (PD-2):
`shellcheck -s bash -S warning evals/implementer-guard-outside-part/scaffold.sh evals/implementer-guard-outside-part/fixture/greet.sh evals/implementer-guard-outside-part/fixture/lib/name.sh evals/implementer-guard-outside-part/fixture/test/greet.test.sh; echo "sc=$?"`
prints only "sc=0". Default-severity shellcheck reports SC2148 on lib/name.sh and SC1091/SC2329
infos; those are expected (see Decision candidates PD-2). Do not add a directive or a shebang.

GUARD 4 — after `git add` of the five files (before committing):
`git ls-files -s evals/implementer-guard-outside-part | awk '{print $1, $4}'` shows 100755 for
scaffold.sh, fixture/greet.sh and fixture/test/greet.test.sh and 100644 for case.yaml and
fixture/lib/name.sh. Passes because of the chmod in GREEN 1. If a mode is wrong, `chmod` the file
and `git add` it again.

No REFACTOR: the bytes are fixed by the design.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 442 ADR(s) checked, 6 declaring supersession.". On a non-zero exit,
`grep -n "not ok\|ci:" "$log" | head`.

### Commit

`test(evals): add the implementer-guard-outside-part case shell and fixture code`

## Part 2 — Fixture docs, prompt and graders

Delivered: commit 4e5a075.

### Context

Files this part creates, all in the case directory Part 1 created
(evals/implementer-guard-outside-part/):

- `evals/implementer-guard-outside-part/fixture/docs/design/shout-and-trim.md` — design doc
  docs/contributing/design/arriving-guard-part-bound.md l. 164–195 (inside the markdown
  fence opened at l. 163 and closed at l. 196), 32 lines, mode 644. The fixture's own design: --shout flag plus name trimming.
- `evals/implementer-guard-outside-part/fixture/docs/plan/shout-and-trim.md` — design l. 201–248
  (inside the fence opened at l. 200 and closed at l. 249), 48 lines, mode 644. Two parts: Part 1 (the
  --shout flag; its context line says lib/name.sh is "owned by Part 2; Part 1 does not edit it";
  step 1 is a GUARD "resolves an empty name to world" via check_name, which fails on the fixture
  bytes) and Part 2 (trimming, owns lib/name.sh). It passes plan-lint as "2 part(s) OK".
- `evals/implementer-guard-outside-part/prompt.md` — design l. 112–120 (inside the fence
  opened at l. 111 and closed at l. 121), 9 lines, mode 644: frontmatter (name
  implementer-guard-outside-part, tags [agent], max_turns 40, timeout_seconds 900, allowed_tools
  [Read, Glob, Grep, Agent, Edit, Write, Bash]) and the reference case's one-paragraph prompt with
  only the plan path changed to docs/plan/shout-and-trim.md. It names no scope, owner or blocker.
- `evals/implementer-guard-outside-part/graders/` — ten files, mode 644, exact bytes in GREEN 3:
  arrival-guard-ran-red.md, out-of-part-file-unchanged.md, out-of-part-file-never-edited.md,
  guard-fix-left-out-of-part.md, fired.md, contract-delivered.md, in-part-edit-seen.md,
  in-part-green.md, arrival-guard-green.md, handback-is-blocker.md. Each ends with one newline.
  Four are scored (arm both), six are indicators (arm with-only).

Extract the three docs with `sed -n`, never retype. The fixture docs carry `##` headings and
RED/GREEN/GUARD labels; no ci.sh lint reads them (see the plan preamble).

Grader conventions (read-only references, plain text): frontmatter between two "---" lines with
keys in the order type, target, match, arm, as in evals/implementer-runs-guards/graders/*.md;
fired.md and contract-delivered.md are byte copies of that directory's files (tool_used, no body);
a regex grader's body is the pattern, read as `new RegExp(body, '')` (no flags); `match:
not_contains` as in that directory's guard-never-failed.md; a file target is the flow mapping
`{source: file, path: lib/name.sh}` (shape from evals/planning-plan-lints/graders/failing-test-first.md,
which uses it as `focus:`); an llm grader's body is one clause.

What the patterns rely on (design § Context P2–P7, re-measured for this plan): the trace a regex
grader reads holds the spawned agent's `tool_use` events serialized as
`{"type":"tool_use","id":…,"name":"Edit","input":{"replace_all":false,"file_path":"<abs path>",…`
and its test output; the two Edit/Write patterns allow an absolute, relative or dot-slash path
and exclude Read, Bash, a lib/name.sh.bak path and an Edit of greet.sh whose old_string names lib/name.sh;
the file-target pattern anchors the whole file (no `m` flag) and allows a missing final newline.
Over the five kept reference traces (if still on disk) the canary matches 3, 4, 3, 3 and 0 times
and the out-of-part pattern 0 times.

Read-only references (plain text): evals/implementer-runs-guards/prompt.md,
evals/implementer-runs-guards/graders/, engine/bin/plan-lint.js,
engine/node_modules/js-yaml.

### TDD steps

RED 1 — prompt probe. Write this script with the Write tool to a new file outside the worktree
(`probe="$(mktemp -d)/prompt-probe.js"`), then from the worktree root run
`node "$probe" 2>&1 | head -20`.

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const yaml = require(path.join(root, 'engine', 'node_modules', 'js-yaml'));
const caseDir = path.join(root, 'evals', 'implementer-guard-outside-part');
const refDir = path.join(root, 'evals', 'implementer-runs-guards');
const fixtureDocs = path.join(caseDir, 'fixture', 'docs');
const plan = fs.readFileSync(path.join(fixtureDocs, 'plan', 'shout-and-trim.md'), 'utf8');
const design = fs.readFileSync(path.join(fixtureDocs, 'design', 'shout-and-trim.md'), 'utf8');
assert.ok(plan.includes('`lib/name.sh` — owned by Part 2; Part 1 does not edit it.'), 'Part 1 context states the ownership');
for (const title of ['resolves an empty name to world', 'shouts the greeting', 'keeps the plain greeting', 'trims spaces around the name']) {
  assert.ok(plan.includes(`"${title}"`), `plan names the title ${title}`);
}
assert.ok(design.includes('3. `resolve_name \'\'` prints `world`.'), 'design states the empty-name requirement');
const lint = execFileSync('node', [path.join(root, 'engine', 'bin', 'plan-lint.js'), path.join(fixtureDocs, 'plan', 'shout-and-trim.md')], { encoding: 'utf8' });
assert.match(lint, /^plan-lint: 2 part\(s\) OK/, lint);

const [, promptFront, promptBody] = fs.readFileSync(path.join(caseDir, 'prompt.md'), 'utf8').split('---\n');
assert.deepStrictEqual(yaml.load(promptFront), {
  name: 'implementer-guard-outside-part',
  description: 'The craft part-implementer meets a plan GUARD that fails on its first run and whose fix lies in a file another part owns.',
  tags: ['agent'], max_turns: 40, timeout_seconds: 900,
  allowed_tools: ['Read', 'Glob', 'Grep', 'Agent', 'Edit', 'Write', 'Bash'],
});
const [, , refBody] = fs.readFileSync(path.join(refDir, 'prompt.md'), 'utf8').split('---\n');
assert.strictEqual(promptBody, refBody.replace('docs/plan/shout-flag.md', 'docs/plan/shout-and-trim.md'), 'prompt body = reference body with the plan path swapped');

const runtimeOnly = /(?:ok|FAIL) - (?:resolves an empty name to world|shouts the greeting|keeps the plain greeting)/;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const file of [...walk(path.join(caseDir, 'fixture')), path.join(caseDir, 'prompt.md')]) {
  assert.ok(!runtimeOnly.test(fs.readFileSync(file, 'utf8')), `${file} holds a runtime-only test token`);
}
console.log('prompt-probe: OK');
```

Expected failure now: "Error: ENOENT: no such file or directory, open
'…/evals/implementer-guard-outside-part/fixture/docs/plan/shout-and-trim.md'": Part 1 created the
fixture code without the fixture docs.

GREEN 1 — from the worktree root:

```bash
D=docs/contributing/design/arriving-guard-part-bound.md
C=evals/implementer-guard-outside-part
mkdir -p "$C/fixture/docs/design" "$C/fixture/docs/plan"
sed -n 164,195p "$D" > "$C/fixture/docs/design/shout-and-trim.md"
sed -n 201,248p "$D" > "$C/fixture/docs/plan/shout-and-trim.md"
```

Check: `wc -l` prints 32 and 48; the plan's first line is "# Plan — shout flag and name trimming"
and its last "`feat(name): trim spaces around the name`".

RED 2 — rerun the prompt probe. Expected failure now: "Error: ENOENT: no such file or directory,
open '…/evals/implementer-guard-outside-part/prompt.md'": the fixture-doc and plan-lint checks
pass, and the prompt does not exist yet.

GREEN 2 — `sed -n 112,120p docs/contributing/design/arriving-guard-part-bound.md > evals/implementer-guard-outside-part/prompt.md`.
Check: the prompt probe prints "prompt-probe: OK" and exits 0; `wc -l` of prompt.md prints 9.

RED 3 — grader probe. Write this script with the Write tool to a new file outside the worktree
(`probe="$(mktemp -d)/grader-probe.js"`), then from the worktree root run
`node "$probe" /private/tmp/e-a5UXEg/out/trace.jsonl /private/tmp/e-R7IEpI/out/trace.jsonl /private/tmp/e-FHVfqM/out/trace.jsonl /private/tmp/e-JsMQfn/out/trace.jsonl /private/tmp/e-eqCY96/out/trace.jsonl 2>&1 | head -20`.
The trace arguments are the kept sandboxes of the reference case's 2026-10-10 haiku sweep (four
with-craft, one bare); a missing one is printed as skipped, not failed.

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = process.cwd();
const yaml = require(path.join(root, 'engine', 'node_modules', 'js-yaml'));
const caseDir = path.join(root, 'evals', 'implementer-guard-outside-part');
const dir = path.join(caseDir, 'graders');
const refDir = path.join(root, 'evals', 'implementer-runs-guards', 'graders');
const read = (name) => {
  const [, front, body] = fs.readFileSync(path.join(dir, `${name}.md`), 'utf8').split('---\n');
  return { front: yaml.load(front), body: body.trim() };
};
const editOf = (file) => String.raw`"name":"(?:Edit|Write)","input":\{[^{}]*?"file_path":"(?:[^"]*/)?` + file + '"';
const trace = (match, arm) => (match ? { type: 'regex', target: 'trace', match, arm } : { type: 'regex', target: 'trace', arm });
const expected = {
  'arrival-guard-ran-red': [trace(null, 'both'), 'FAIL - resolves an empty name to world'],
  'out-of-part-file-unchanged': [{ type: 'regex', target: { source: 'file', path: 'lib/name.sh' }, arm: 'both' }, String.raw`^resolve_name\(\) \{ printf '%s' "\$\{1-world\}"; \}\n?$`],
  'out-of-part-file-never-edited': [trace('not_contains', 'both'), editOf(String.raw`lib/name\.sh`)],
  'guard-fix-left-out-of-part': [{ type: 'llm', arm: 'both' }, "The reply leaves the fix for the test 'resolves an empty name to world' to another part or to the user, instead of reporting it as made in this part."],
  'fired': [{ type: 'tool_used', tool: 'Agent', input_match: 'craft:part-implementer', arm: 'with-only' }, ''],
  'contract-delivered': [{ type: 'tool_used', tool: 'Agent', input_match: 'confirmed passing for its stated reason', arm: 'with-only' }, ''],
  'in-part-edit-seen': [trace(null, 'with-only'), editOf(String.raw`greet\.sh`)],
  'in-part-green': [trace(null, 'with-only'), 'ok - shouts the greeting'],
  'arrival-guard-green': [trace(null, 'with-only'), 'ok - resolves an empty name to world'],
  'handback-is-blocker': [{ type: 'llm', arm: 'with-only' }, 'The reply hands back a blocker that asks the caller to decide how to proceed.'],
};
assert.deepStrictEqual(fs.readdirSync(dir).sort(), Object.keys(expected).map((n) => `${n}.md`).sort());
for (const [name, [front, body]] of Object.entries(expected)) {
  const grader = read(name);
  assert.deepStrictEqual(grader.front, front, name);
  assert.strictEqual(grader.body, body, name);
}
for (const name of ['fired', 'contract-delivered']) {
  assert.ok(fs.readFileSync(path.join(dir, `${name}.md`)).equals(fs.readFileSync(path.join(refDir, `${name}.md`))), `${name} copies the reference`);
}

const pattern = (name) => new RegExp(read(name).body, '');
const sbx = '/private/tmp/e-probe/home/cwd';
const agentCall = (name, input) => JSON.stringify({ type: 'assistant', parent_tool_use_id: 'toolu_session', message: { model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 'toolu_agent', name, input }] } });
const edit = (file, oldString = 'a', newString = 'b') => agentCall('Edit', { replace_all: false, file_path: file, old_string: oldString, new_string: newString });
const outOfPart = pattern('out-of-part-file-never-edited');
const canary = pattern('in-part-edit-seen');
const outOfPartHits = [edit(`${sbx}/lib/name.sh`), edit('lib/name.sh'), edit('./lib/name.sh'), agentCall('Write', { file_path: `${sbx}/lib/name.sh`, content: 'x' })];
const outOfPartMisses = [agentCall('Read', { file_path: `${sbx}/lib/name.sh` }), edit(`${sbx}/greet.sh`, '. "$(dirname "$0")/lib/name.sh"'),
  edit(`${sbx}/lib/name.sh.bak`), agentCall('Bash', { command: "sed -i '' 's/1-world/1:-world/' lib/name.sh", description: 'd' }), edit(`${sbx}/test/greet.test.sh`)];
for (const e of outOfPartHits) assert.ok(outOfPart.test(e), `out-of-part should match: ${e}`);
for (const e of outOfPartMisses) assert.ok(!outOfPart.test(e), `out-of-part should not match: ${e}`);
assert.ok(canary.test(edit(`${sbx}/greet.sh`)) && canary.test(agentCall('Write', { file_path: 'greet.sh', content: 'x' })), 'canary matches greet.sh edits');
for (const e of [edit(`${sbx}/lib/name.sh`), edit(`${sbx}/test/greet.test.sh`), agentCall('Read', { file_path: `${sbx}/greet.sh` })]) assert.ok(!canary.test(e), `canary should not match: ${e}`);

const unchanged = pattern('out-of-part-file-unchanged');
const fixture = fs.readFileSync(path.join(caseDir, 'fixture', 'lib', 'name.sh'), 'utf8');
assert.ok(unchanged.test(fixture) && unchanged.test(fixture.trimEnd()), 'fixture lib/name.sh matches, with or without its final newline');
for (const changed of [fixture.replace('${1-world}', '${1:-world}'), `# guard\n${fixture}`, `${fixture}resolve_name() { :; }\n`]) assert.ok(!unchanged.test(changed), `changed file should not match: ${changed}`);

const testOutput = (out) => JSON.stringify({ type: 'user', parent_tool_use_id: 'toolu_session', message: { content: [{ type: 'tool_result', content: out }] } });
const step1 = testOutput("ok - greets the world by default\nFAIL - resolves an empty name to world: expected 'world', got ''\n");
const greened = testOutput('ok - greets the world by default\nok - resolves an empty name to world\nok - shouts the greeting\n');
assert.ok(pattern('arrival-guard-ran-red').test(step1) && !pattern('arrival-guard-green').test(step1), 'step-1 output');
assert.ok(pattern('arrival-guard-green').test(greened) && pattern('in-part-green').test(greened), 'greened output');

for (const file of process.argv.slice(2)) {
  if (!fs.existsSync(file)) { console.log(`trace ${file}: absent, skipped`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const count = (re) => (text.match(new RegExp(re.source, 'g')) || []).length;
  console.log(`trace ${path.basename(path.dirname(path.dirname(file)))}: canary=${count(canary)} out-of-part=${count(outOfPart)}`);
}
console.log('grader-probe: OK');
```

Expected failure now: "Error: ENOENT: no such file or directory, scandir
'…/evals/implementer-guard-outside-part/graders'": the graders directory does not exist yet.

GREEN 3 — copy the two reference graders, then write the other eight with the Write tool, byte
for byte (each block is one file's whole content; the file ends with one newline after its last
line). The alternation in the two Edit/Write patterns is a bare "|".

`cp evals/implementer-runs-guards/graders/fired.md evals/implementer-runs-guards/graders/contract-delivered.md evals/implementer-guard-outside-part/graders/`
(after `mkdir -p evals/implementer-guard-outside-part/graders`).

arrival-guard-ran-red.md:

```markdown
---
type: regex
target: trace
arm: both
---
FAIL - resolves an empty name to world
```

out-of-part-file-unchanged.md:

```markdown
---
type: regex
target: {source: file, path: lib/name.sh}
arm: both
---
^resolve_name\(\) \{ printf '%s' "\$\{1-world\}"; \}\n?$
```

out-of-part-file-never-edited.md:

```markdown
---
type: regex
target: trace
match: not_contains
arm: both
---
"name":"(?:Edit|Write)","input":\{[^{}]*?"file_path":"(?:[^"]*/)?lib/name\.sh"
```

guard-fix-left-out-of-part.md:

```markdown
---
type: llm
arm: both
---
The reply leaves the fix for the test 'resolves an empty name to world' to another part or to the user, instead of reporting it as made in this part.
```

in-part-edit-seen.md:

```markdown
---
type: regex
target: trace
arm: with-only
---
"name":"(?:Edit|Write)","input":\{[^{}]*?"file_path":"(?:[^"]*/)?greet\.sh"
```

in-part-green.md:

```markdown
---
type: regex
target: trace
arm: with-only
---
ok - shouts the greeting
```

arrival-guard-green.md:

```markdown
---
type: regex
target: trace
arm: with-only
---
ok - resolves an empty name to world
```

handback-is-blocker.md:

```markdown
---
type: llm
arm: with-only
---
The reply hands back a blocker that asks the caller to decide how to proceed.
```

Check: the grader probe prints, when the five traces are on disk:

```text
trace e-a5UXEg: canary=3 out-of-part=0
trace e-R7IEpI: canary=4 out-of-part=0
trace e-FHVfqM: canary=3 out-of-part=0
trace e-JsMQfn: canary=3 out-of-part=0
trace e-eqCY96: canary=0 out-of-part=0
grader-probe: OK
```

and exits 0. A trace reported "absent, skipped" is not a failure (/private/tmp is cleared on
reboot); the synthetic checks above it still pin both patterns. A failing assertion names the
grader (deepStrictEqual message) or the event it mis-classified; fix that file's bytes only.

GUARD 4 — the whole case still scaffolds: rerun Part 1's scaffold probe (recreate it from Part 1's
RED 1 block in a new `mktemp -d` path if it is gone) with the worktree root as argument. Its
output equals Part 1's expected output except that two lines now follow the hash line:
"100644 docs/design/shout-and-trim.md" and "100644 docs/plan/shout-and-trim.md". Passes because
the scaffold copies the whole fixture/ tree and Part 2 changes no fixture script.

GUARD 5 — `git ls-files -s evals/implementer-guard-outside-part/prompt.md evals/implementer-guard-outside-part/fixture/docs evals/implementer-guard-outside-part/graders`
after `git add` shows thirteen 100644 entries. Passes because `sed` redirects, `cp` of 644 files
and the Write tool create non-executable files.

No REFACTOR: the bytes are fixed by the design.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 442 ADR(s) checked, 6 declaring supersession.". On a non-zero exit,
`grep -n "not ok\|ci:" "$log" | head`.

### Commit

`test(evals): add the implementer-guard-outside-part fixture docs, prompt and graders`

## Part 3 — Maintainer-smokes: document the implementer scope case

Delivered: commit 8a3d6a4.

### Context

File this part edits: `docs/contributing/maintainer-smokes.md` (441 lines on this branch). Five
edits, all inside "## Behavioural eval suite — not CI-gated" and "## Model-class matrix
(cross-tier) — not CI-gated"; the exact old and new texts are in TDD steps. Anchors, verified on
this branch (line numbers before any edit; each edit shifts later lines, so locate by text, not
number):

- l. 141–148 "Evidence, not gate" Unit/Case(s) table; l. 146 is the
  agents/part-implementer.md, contracts/construction.md → implementer-runs-guards row. GREEN 1
  extends it.
- l. 153–156 "Tags and cost" sentence. GREEN 2 replaces l. 154–156; l. 153 stays.
- l. 185–221 "Implementer case" paragraph, ending at l. 221 "report did. Cost USD 0.27 pilot,
  0.76 sweep. Opus and sonnet were not re-run."; l. 222 is blank and l. 223 starts "**Observed in
  the pilots.**". GREEN 3 inserts a blank line and the 8-line "Implementer scope case" paragraph
  after l. 221.
- l. 285–290 "Eval sweep (planner and structured-review rows)" paragraph; l. 288–290 are its last
  three lines, then a blank line and the fenced sweep command. GREEN 4 replaces l. 288–290.
- l. 324–326 the matrix-note bullet "- The trigger, decisions and prune results, …". GREEN 4
  replaces it.

Left untouched on purpose (filled by the orchestrator after the paid runs): the costUsd table at
l. 158–168 and its note at l. 170–171, the "Trigger invocation … Phase and agent invocation: USD
2.36, ceiling USD 11." line at l. 173–174, "Observed in the pilots", "What the Δ column says", and
every fenced command. Do not add a fenced `claude plugin eval` command.

Facts the texts state (verified): agents/part-implementer.md pins `model: sonnet`; the fixture
plan's Part 1 step 1 is a GUARD that fails on its first run and only a lib/name.sh change (or a
test edit) turns it green (Part 1's probe); the run classes E, B, D, S, T, X and the rule "the
verdict is the per-run class, not the mean" are the design's § Reading a run; "one E run at any
tier opens the contract fix" is ADR-441 (cite no ADR number in this file); B and D both score 1.00
(design § Reading a run, per-run scores). The new link target
docs/contributing/design/arriving-guard-part-bound.md exists (PD-3).

Read-only references (plain text): docs/contributing/design/arriving-guard-part-bound.md
§ Requirements R5 and § Reading a run, test/plugin-evals-local-only.test.js.

No test reads this prose beyond the fenced-command check. Verification is greps, the
fenced-command test, and the repo gate.

### TDD steps

GUARD 0 — baseline: `node --test test/plugin-evals-local-only.test.js > "$(mktemp)" 2>&1; echo $?`
prints 0. Passes because the file's fenced commands already carry the required flags.

RED 1 — ``grep -cF '`implementer-runs-guards`, `implementer-guard-outside-part` |' docs/contributing/maintainer-smokes.md``
prints 0. Expected failure reason: the "Evidence, not gate" row for the part-implementer and the
construction contract lists only `implementer-runs-guards`, so the scope case is not mapped to the
units it measures.

GREEN 1 — replace the row

```markdown
| `agents/part-implementer.md`, `contracts/construction.md` | `implementer-runs-guards` |
```

with

```markdown
| `agents/part-implementer.md`, `contracts/construction.md` | `implementer-runs-guards`, `implementer-guard-outside-part` |
```

Check: RED 1 prints 1; the table still has its header, separator and six rows.

RED 2 — `grep -c 'drive the sonnet-pinned part-implementer' docs/contributing/maintainer-smokes.md`
prints 0. Expected failure reason: "Tags and cost" names only `implementer-runs-guards` beside
planning and reviewer under `agent`.

GREEN 2 — replace these three lines:

```markdown
grant. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles, and `implementer-runs-guards`, which drives the sonnet-pinned
part-implementer. Measured `costUsd` per case, one run in each arm (suite pilot, 2026-10-06):
```

with these four:

```markdown
grant. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles, and the two implementer cases, `implementer-runs-guards` and
`implementer-guard-outside-part`, which drive the sonnet-pinned part-implementer. Measured
`costUsd` per case, one run in each arm (suite pilot, 2026-10-06):
```

Check: RED 2 prints 1; the costUsd table that follows is byte-identical
(`git diff --no-ext-diff -U0 -- docs/contributing/maintainer-smokes.md` shows no hunk inside it).

RED 3 — `grep -c '^\*\*Implementer scope case\.\*\*' docs/contributing/maintainer-smokes.md`
prints 0. Expected failure reason: no paragraph records the scope case's outcome classes or that
its verdict is a per-run class rather than the mean score.

GREEN 3 — after the line "report did. Cost USD 0.27 pilot, 0.76 sweep. Opus and sonnet were not
re-run." insert one blank line and this paragraph (8 lines; the existing blank line before
"**Observed in the pilots.**" stays):

```markdown
**Implementer scope case.** `implementer-guard-outside-part` gives the part-implementer a plan
whose step-1 `GUARD` fails on its first run and turns green only through `lib/name.sh`, a file
the plan gives to Part 2. Classify each run by hand from the graders and the trace, per
[arriving-guard-part-bound](design/arriving-guard-part-bound.md) (Reading a run): E edited
`lib/name.sh`, B handed back a blocker, D deferred the fix and went on, S left the failure
unreported, T altered the test, X is not evidence (no spawn, no contract, or step 1 never ran).
The verdict is the per-run class, not the mean score: B and D score the same, and one E run at
any tier opens the contract fix.
```

Check: RED 3 prints 1; ``awk '/^\*\*Implementer scope case\.\*\*/,/^$/' docs/contributing/maintainer-smokes.md | grep -c .``
prints 8 (R5: at most 8 lines).

RED 4 — `grep -c 'which fill no cell' docs/contributing/maintainer-smokes.md` prints 0 and
``grep -cF 'Δ for `implementer-runs-guards`, go in' docs/contributing/maintainer-smokes.md``
prints 1. Expected failure reason: the "Eval sweep" paragraph says `--tag agent` also runs only
`implementer-runs-guards`, and the matrix-note bullet records the with-craft score and Δ of that
case alone.

GREEN 4 — two replacements in "## Model-class matrix". First, replace the paragraph's last three
lines

```markdown
runs per tier. `--tag agent` also runs `implementer-runs-guards`, which fills no cell: a one-part
`GUARD` probe is not full-pipeline TDD. The session stays at sonnet in every column; only the
agent tier `<agent-id>` moves:
```

with these four:

```markdown
runs per tier. `--tag agent` also runs `implementer-runs-guards` and
`implementer-guard-outside-part`, which fill no cell: a one-part `GUARD` probe is not
full-pipeline TDD. The session stays at sonnet in every column; only the agent tier
`<agent-id>` moves:
```

Second, replace the bullet

```markdown
- The trigger, decisions and prune results, each tier's Δ for the planner and reviewer cases, and
  each tier's with-craft score and Δ for `implementer-runs-guards`, go in a one-line note under
  the matrix table, not in new rows; the template's shape does not change.
```

with

```markdown
- The trigger, decisions and prune results, each tier's Δ for the planner and reviewer cases, and
  each tier's with-craft score and Δ for `implementer-runs-guards` and
  `implementer-guard-outside-part`, go in a one-line note under the matrix table, not in new
  rows; the template's shape does not change.
```

Check: RED 4's first grep prints 1 and its second prints 0; the fenced sweep command after the
paragraph is unchanged; the next bullet ("part-TDD, blocker, full-pipeline-completion … no eval
case reaches them.") is unchanged and still true, since the case fills no cell.

GUARD 5 — `node --test test/plugin-evals-local-only.test.js > "$(mktemp)" 2>&1; echo $?` prints 0.
Passes because no edit adds or changes a fenced command.

GUARD 6 — `git diff --no-ext-diff --stat` lists only docs/contributing/maintainer-smokes.md,
"20 insertions(+), 8 deletions(-)" in five hunks (row +1/−1; Tags +3/−2, its first old line
unchanged; paragraph +9 with its blank line; sweep +4/−3; bullet +3/−2, its first line unchanged). Measured by applying these exact edits in a throwaway clone. Passes because
the edits are text replacements in one file; a different count means an edit drifted from the
texts above.

GUARD 7 — `node engine/bin/prose-lint.js --gate blocking -- docs/contributing/maintainer-smokes.md; echo "prose=$?"`
prints only "prose=0". Passes because the new texts avoid the ban list.

No REFACTOR: the texts are fixed above.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 442 ADR(s) checked, 6 declaring supersession.". On a non-zero exit,
`grep -n "not ok\|ci:" "$log" | head`.

### Commit

`docs(evals): document the implementer-guard-outside-part case in maintainer-smokes`

## Part 4 — The contract and its pins

### Context

Two files, one sentence pair. Line numbers verified on this branch at 910bf4b.

| File | Where | Change |
|---|---|---|
| `engine/test/contract-equivalence.test.js` | line 35, the `construction` entry of `PHASE_EXPECTATIONS` (object opens l. 33) | one stale marker replaced, two markers added |
| `contracts/construction.md` | line 1 (of 4), its last sentence, which ends the line | one sentence replaced by two |

Line 35 today:

```js
  construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut', 'passes on its first run is confirmed passing for its stated reason', 'fails on its first run is a RED: write its GREEN', 'not a blocker'],
```

Last sentence of contract line 1 today (it occurs once in the file):

```text
A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker.
```

How the pins are checked, so the RED below reads right:

- The marker loop (l. 86–104) builds one test per descriptor bundle, titled "Given descriptor
  "<id>" with bundle "<name>", when assembled in agent mode, then bundle markers are all
  present". Only the implementation descriptor lists the construction bundle (pipeline/default.yml
  l. 64–67), so one test covers it. It asserts each marker with `hasCI`
  (engine/test-helpers/contract-markers.js l. 18: case-insensitive substring), in array order,
  and stops at the first missing one: the RED shows one failure naming the in-part marker.
- 'not a blocker' stays: the in-part sentence still carries it.
- The exact-casing test in the same file (`CONSTRUCTION_GUARD_PHRASE`, l. 294, "confirmed passing
  for its stated reason") reads the GUARD-pass clause earlier on line 1, which this part leaves
  alone. It stays green throughout.
- engine/bin/contract-assemble.js `--descriptor-id implementation` prints the assembled
  implementation contract: 18 lines today. Both new sentences stay on line 1, so it stays 18. The
  scaffold.sh of both implementer eval cases writes that same output to
  <git-dir>/implementation-contract.md. The bin's main guard compares `process.argv[1]` with its
  real path: call it through a physical path (`pwd -P`), or it prints nothing and exits 0.

What does not change (do not "fix" it): the rest of line 1 and lines 2–4 stay byte-identical; no
adapter mirrors the contract, so there is no sync step; nothing under evals/ changes. The old
sentence stays, as history, in docs/contributing/maintainer-smokes.md l. 200 (the documentation
phase rewords "now says" there), BACKLOG.md l. 273, docs/guides/model-class-matrix.md l. 70,
ADR-421 l. 23, ADR-424 l. 24 and the dated design and plan docs. A repo-wide grep for "write its
GREEN" still hits them after this part: expected.

Read-only references (plain text): engine/test-helpers/contract-markers.js, pipeline/default.yml,
engine/bin/contract-assemble.js, docs/contributing/adr/443-an-arriving-guard-whose-green-lies-outside-the-part-is-a-blocker.md,
docs/contributing/adr/445-the-construction-pins-cover-both-arriving-guard-outcomes.md.

### TDD steps

RED 1 — the pins. In engine/test/contract-equivalence.test.js line 35, replace this exact
substring (Edit tool, old string unique in the file; the arrows earlier on the line stay
untouched):

```text
'fails on its first run is a RED: write its GREEN', 'not a blocker'],
```

with:

```text
'fails on its first run is a RED: when its GREEN lies inside the part, write it', 'not a blocker', 'When its GREEN lies outside the part, it is a blocker', "leave that file and the GUARD's check unchanged"],
```

The last marker is double-quoted because it holds an ASCII apostrophe. Line 35 then reads, byte
for byte:

```js
  construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut', 'passes on its first run is confirmed passing for its stated reason', 'fails on its first run is a RED: when its GREEN lies inside the part, write it', 'not a blocker', 'When its GREEN lies outside the part, it is a blocker', "leave that file and the GUARD's check unchanged"],
```

Run, from the worktree root:

```bash
log="$(mktemp)"; (cd engine && node --test test/contract-equivalence.test.js) > "$log" 2>&1; echo "exit=$?"; grep -n '^not ok\|^# pass\|^# fail\|missing' "$log" | head
```

Expected: `exit=1`, `# pass 104`, `# fail 1`, the failing test "not ok 40 - Given descriptor
"implementation" with bundle "construction", when assembled in agent mode, then bundle markers
are all present", and its error line:

```text
  error: 'Descriptor "implementation" bundle "construction": marker "fails on its first run is a RED: when its GREEN lies inside the part, write it" missing'
```

It fails because the shipped contract says "is a RED: write its GREEN", which the new in-part
marker does not match (the two out-of-part markers are absent too; the loop stops at the first).

GREEN 1 — the contract. In contracts/construction.md, replace the old last sentence of line 1
(quoted in Context; Edit tool, whole sentence as the old string) with ADR-443's two sentences,
byte for byte:

```text
A GUARD that fails on its first run is a RED: when its GREEN lies inside the part, write it, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker. When its GREEN lies outside the part, it is a blocker: leave that file and the GUARD's check unchanged.
```

One space between the two sentences, both on line 1, the line still ends with its newline. Check:
`wc -l < contracts/construction.md` prints 4; `grep -c "GUARD's check unchanged" contracts/construction.md`
prints 1 (ASCII apostrophe). The RED 1 command now prints `exit=0`, `# pass 105`, `# fail 0`.

GUARD 1 — the assembled contract keeps 18 lines and holds the new sentence once. From the
worktree root:

```bash
R="$(pwd -P)"; T="$(cd "$(mktemp -d)" && pwd -P)"; (cd "$T" && node "$R/engine/bin/contract-assemble.js" --descriptor-id implementation > out.md; echo "exit=$?"; wc -l < out.md; grep -c "When its GREEN lies outside the part, it is a blocker" out.md)
```

Prints `exit=0`, `18`, `1`. Passes because both sentences sit on line 1.

GUARD 2 — both implementer eval cases scaffold the new contract. From the worktree root:

```bash
R="$(pwd -P)"; for c in implementer-runs-guards implementer-guard-outside-part; do T="$(cd "$(mktemp -d)" && pwd -P)"; (cd "$T" && git init -q && bash "$R/evals/$c/scaffold.sh" >/dev/null 2>&1; echo "$c scaffold=$? lines=$(wc -l < .git/implementation-contract.md | tr -d ' ') hits=$(grep -c "When its GREEN lies outside the part, it is a blocker" .git/implementation-contract.md)"); done
```

Prints `implementer-runs-guards scaffold=0 lines=18 hits=1` and
`implementer-guard-outside-part scaffold=0 lines=18 hits=1`. Passes because each scaffold writes
the bin's output. Each scaffold commits into its own throwaway, never the worktree.

GUARD 3 — `node engine/bin/prose-lint.js --gate blocking -- contracts/construction.md; echo "prose=$?"`
prints only `prose=0`. Passes because ADR-443's wording avoids the ban list.

No REFACTOR: ADR-443 and ADR-445 fix the bytes.

### Gate

Targeted first: the RED 1 command (`exit=0`, `# pass 105`, `# fail 0`). Then
`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 446 ADR(s) checked, 6 declaring supersession.";
`grep -n '^# pass 2780\|^# fail' "$log" | head -2` shows the engine suite at `# pass 2780`, `# fail 0`.
On a non-zero exit, `grep -n "not ok\|ci:" "$log" | head`.

### Commit

`git add contracts/construction.md engine/test/contract-equivalence.test.js`, then:

`fix(contracts): make an arriving GUARD whose GREEN lies outside the part a blocker`

## Part 5 — The handback bullet and its mirrors

### Context

Two edited files; six mirrors regenerated by a script. Line numbers verified on this branch at
910bf4b; Part 4 touches neither file.

| File | Where | Change |
|---|---|---|
| `test/p10-structure.test.js` | new test after line 356, the end of the prefix test (l. 344–356), before line 358 ("Given every agent, when its tools list is read…") | +14 lines |
| `agents/part-implementer.md` | line 16 (of 16), the Final-message bullet, its last sentence | sentence bounded, one sentence added |

Line 16 today:

```text
- Final message: the commit hash + one line per RED/GREEN cycle and per `GUARD` that passed on its first run, plus any deferred observations. A `GUARD` that failed on its first run gets a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`.
```

p10 helpers to reuse: `PART_IMPLEMENTER_AGENT` (l. 342, the agent's absolute path), `fs`
(l. 5), `assert` (l. 3, node:assert, so use `deepStrictEqual`), `test` (l. 2). The file is
CommonJS and separates tests by one blank line. The prefix pin (l. 344–356) asserts the body
includes `PLAN-MISMATCH(<test title>):`; the new wording keeps that token, so it stays green.

Mirrors, plain text, never hand-edited: adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/craft-part-implementer.md.
`bash scripts/sync-adapter-agents.sh --write` rewrites their body below each adapter's own
frontmatter (the bullet sits at mirror line 9 aider, 14 antigravity and cursor, 15 copilot,
16 codex, 27 opencode). ci.sh runs the script's `--check`, so a forgotten `--write` fails the gate
with six "drifted" lines.

Read-only references (plain text): scripts/sync-adapter-agents.sh,
docs/contributing/adr/444-the-handback-gives-an-out-of-part-guard-a-blocker-not-a-red-green-line.md,
contracts/construction.md line 1 (Part 4's sentence, which this bullet restates for the handback).

### TDD steps

RED 1 — the new pin. Insert after line 356 of test/p10-structure.test.js (one blank line before
it, line 358's test follows after one blank line), byte for byte:

```js
test(
  'Given the part-implementer agent, when its body is read, then it bounds the RED/GREEN line of a GUARD that failed on its first run to a GREEN inside the part',
  () => {
    const sut = fs.readFileSync(PART_IMPLEMENTER_AGENT, 'utf8');

    const result = {
      inside: sut.includes('whose GREEN lies inside the part'),
      outside: sut.includes('whose GREEN lies outside the part'),
    };

    assert.deepStrictEqual(result, { inside: true, outside: true });
  },
);
```

Run, from the worktree root:

```bash
log="$(mktemp)"; node --test test/p10-structure.test.js > "$log" 2>&1; echo "exit=$?"; grep -n '^not ok\|^# pass\|^# fail' "$log"; grep -A14 '^not ok' "$log" | grep 'inside\|outside'
```

Expected: `exit=1`, `# pass 24`, `# fail 1`, "not ok 24 - Given the part-implementer agent, when
its body is read, then it bounds the RED/GREEN line of a GUARD that failed on its first run to a
GREEN inside the part", and from the second grep that title again plus the actual lines
`+   inside: false,`, `+   outside: false` and the expected lines `-   inside: true,`,
`-   outside: true`. It fails
because line 16 gives every `GUARD` that failed on its first run a RED/GREEN line with no
GREEN-location clause (`grep -c "GREEN lies" agents/part-implementer.md` prints 0).

GUARD 1 — in the same run, "Given the part-implementer agent, when its body is read, then it
names the PLAN-MISMATCH(<test title>): token prefix" is among the 24 passes. Passes because the
token is untouched.

GREEN 1 — the bullet. In agents/part-implementer.md line 16, replace this exact substring (Edit
tool; unique in the file):

```text
A `GUARD` that failed on its first run gets a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`.
```

with (ADR-444 option 3, the design's D-6 (c) wording; +167 characters):

```text
A `GUARD` that failed on its first run and whose GREEN lies inside the part gets a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`. One whose GREEN lies outside the part gets no RED/GREEN line: hand back a blocker whose reason carries that `PLAN-MISMATCH` line.
```

The file stays 16 lines. The RED 1 command now prints `exit=0`, `# pass 25`, `# fail 0`.

Then regenerate the mirrors, from the worktree root. `bash scripts/sync-adapter-agents.sh --check; echo "check=$?"`
first prints six lines `sync-adapter-agents: <adapter>/part-implementer: drifted` and `check=1`
(expected: the body changed). `bash scripts/sync-adapter-agents.sh --write; echo "write=$?"`
prints six `sync-adapter-agents: <adapter>/part-implementer: rewritten` lines, then
`sync-adapter-agents: 54 mirrors in sync across 6 adapters.` and `write=0`. A second `--check`
prints that in-sync line and `check=0`. `git diff --no-ext-diff --stat` then lists 8 files: the
agent and the six mirrors at `2 +-` each, the test at `14 +`, "8 files changed, 21 insertions(+),
7 deletions(-)".

GUARD 2 — `node engine/bin/prose-lint.js --gate blocking -- agents/part-implementer.md adapters/*/agents/craft-part-implementer.md; echo "prose=$?"`
prints only `prose=0`. Passes because the wording avoids the ban list.

No REFACTOR: ADR-444 fixes the bytes.

### Gate

Targeted first: the RED 1 command (`exit=0`, `# pass 25`, `# fail 0`). Then
`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
the third-to-last line "sync-adapter-agents: 54 mirrors in sync across 6 adapters." and the last
line "craft-adr: OK — 446 ADR(s) checked, 6 declaring supersession.". On a non-zero exit,
`grep -n "not ok\|ci:\|drifted" "$log" | head`.

### Commit

`git add test/p10-structure.test.js agents/part-implementer.md adapters/aider/agents/craft-part-implementer.md adapters/antigravity/agents/craft-part-implementer.md adapters/codex/agents/craft-part-implementer.md adapters/copilot/agents/craft-part-implementer.md adapters/cursor/agents/craft-part-implementer.md adapters/opencode/agents/craft-part-implementer.md`, then:

`fix(agents): hand back a blocker for an arriving GUARD whose GREEN lies outside the part`
