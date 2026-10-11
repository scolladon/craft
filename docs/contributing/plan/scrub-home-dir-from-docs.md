# Plan — scrub-home-dir-from-docs

> Source: design doc `docs/contributing/design/scrub-home-dir-from-docs.md` · ADRs `466, 467, 468, 469, 470, 471`
> (all six take the design's recommended options: DC-1 (a) sweep every tracked file, DC-2 (a)
> source-hygiene class D, DC-3 (a) shape-based rule + placeholder set, DC-4 (a) one core-contract
> line + `CORE_MARKERS` pin + plan-template Gate note, DC-5 (a) plan-lint unchanged, DC-6 (a)
> engine fixtures use the `x` home, DC-7 (a) neutral placeholders)
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

## Plan shape (5 parts)

| # | Part | src delta | Edits | Gate |
|---|---|---|---|---|
| 1 | Source fix + README counts | none (contract prose, test helper, template, one new process test) | 5 files | engine suite + 5 process suites + readme-drift + contracts-lint |
| 2 | Scrub the two native-binding plans | none (docs) | 2 files, 37 lines | residue probe + plan fences |
| 3 | Scrub the other 17 plans | none (docs) | 17 files, 26 lines | residue probe + plan fences |
| 4 | Scrub design, archive, ADR-035, spec | none (docs) | 10 files, 17 lines | residue probe + `bash scripts/ci.sh` |
| 5 | Class-D guard + engine fixtures | none (test file + 2 engine test inputs) | 3 files | source-hygiene suite + engine suite |

**Why this order (never commit on red).** The class-D tree assertion ("zero leaks in the
tracked tree") is RED until every one of the 83 lines is rewritten. So the scrub lands first
(Parts 2-4, docs only, each closed by a username residue probe that is equivalent to the
class-D rule on this machine; see design §2, "a `$HOME`-literal rule … the same 83 distinct
lines"), and the guard lands last (Part 5). In Part 5, the tree assertion's RED names exactly
the 3 engine-test lines that Part 5 itself rewrites, so the guard proves residue closure for
the whole sweep.

**Why README in Part 1.** The design doc, ADRs 466-471 and this plan are already committed, so
`bash scripts/readme-drift.sh` and its live-tree test (`test/readme-drift.test.js`, "Given the
live repo tree …") are RED from the first implementation commit (design 46→47, plans 45→46,
ADRs 465→471). Bumping in Part 1 keeps every later phase gate green.

**Leak inventory at plan time** (HEAD `e46283a`, the design rule run read-only over every
tracked file): 83 lines in 31 files, matching the design's Context table exactly. The plan,
the design and ADRs 466-471 contain no leak. Re-derive it at any time with the residue probe in
§ Scrub rules; never paste the real username into a committed file or a handback.

**Line numbers** below are at `e46283a`. Parts 2-4 edit lines in place (no line is added or
removed), so the numbers stay valid across parts.

## Public-surface decision

- **`contracts/core.md` invariant line: public.** It is injected into every role spawn on
  every binding. Surface gates, all paid in Part 1:
  - `CORE_MARKERS` in engine/test-helpers/contract-markers.js gains `'repo-relative paths'`.
    It is read by engine/test/contract-equivalence.test.js (per-descriptor marker test, `:73`)
    and engine/test/scenarios.test.js (S2, `:320`, which uses `REAL_FRAGMENTS` = the real
    `contracts/core.md`).
  - `node engine/bin/contracts-lint.js contracts`: the bundle must not contain the word
    "retrieval" (the new line does not).
  - No adapter mirror: no file under `adapters/` carries core-contract text (checked:
    `git grep -l "Bounded scope"` hits only `contracts/core.md`, the engine test helper, two
    assemble tests and engine/test/fixtures/contracts/core.md). That fixture is an independent,
    already-divergent stand-in. **Do not touch it.**
  - docs/guides/concepts.md:193 cites `contracts/core.md:2` (the artifact-handoff line). Insert
    the new line **after line 7** so line 2 does not move.
  - docs/guides/customizing.md §2 lists orchestration guarantees, not core.md line by line
    (it has no output-digest or suppression entry either). It stays untouched, per DC-4 (a).
- **`templates/plan.md` Gate comment: public** (shipped template). Surface gates:
  test/plan-doc-fences.test.js (fence balance; the edit adds no fence) and the
  test/source-hygiene.test.js class A/B scans over `templates/` (the new words contain no
  technique or host-CLI token).
- **`findHomePathLeaks` and the class-D constants: internal.** They are test-local to
  test/source-hygiene.test.js and not exported. No barrel, no registry.
- **New test file `test/plan-template.test.js`: internal.** `run_suite process test` in
  scripts/ci.sh discovers it via `find`, and test/every-test-file-registers.test.js only requires
  that it registers at least one `test(` call.

## Decision candidates

The design pre-decides the scrub table, the guard and the source fix. Two load-bearing choices
remain open. The parts below are written for each **Recommend** option. If another option is
picked, the change noted under that DP applies.

- **DP1: consecutive relative `cd` lines inside one fenced block.** The design's §1 table
  turns `cd <abs>/<sub> && <cmd>` into `cd <sub> && <cmd>`. In 10 lines of the two
  native-binding plans, such a line shares a fenced block with other commands (for example,
  native-codex-binding.md:262-265 runs `engine`, then `adapters/pi`, then `adapters/copilot`,
  then the root). The absolute form was paste-safe line by line. The literal relative form is
  not: after `cd engine`, the next `cd adapters/pi` fails, which breaks R2 ("a command still
  names … from where").
  - (a) Literal table form on every line: `cd <sub> && <cmd>`.
  - (b) Subshell form `(cd <sub> && <cmd>)` for a `cd <sub>` line in a fenced block that holds
    more than one command line; the literal table form everywhere else. `(cd X && …)` is
    already house vocabulary (auto-compaction-safety.md has 8 such lines,
    pin-claim-status-set-to-contract.md has 3).
  - (c) Rewrite without `cd` (`node --test engine/test/…`). This changes the command itself
    (`node --test` glob roots and the package cwd), so it is not path-only.
  - **Recommend (b).** It keeps each block paste-safe from the worktree root and adds two
    characters per affected line. If (a) is picked, Part 2 drops the parentheses in the lines
    the Part 2 table marks "subshell".
- **DP2: sizing of the multi-file scrub parts.** Parts 3 and 4 edit 17 and 10 files, over the
  6-file ceiling. Each edit is a one-line, path-only rewrite against a single shared table
  (§ Scrub rules). The cognitive load is the table, not the file count, and the tool-call
  estimate is about 26 and 17 line edits plus probes.
  - (a) One part per tree group, declaring the edited files by glob in `### Context` (a glob
    span counts once in plan-lint) and listing every file and line in plain text. 5 parts.
  - (b) Split to at most 6 backticked files per part: Part 3 becomes 3 parts and Part 4 becomes
    2. 8 parts, 3 extra agent lifecycles, each re-reading the same table.
  - (c) Merge Parts 3 and 4 into one part: 27 files, 43 lines, about 110-130 tool calls. That
    is over budget.
  - **Recommend (a).** If (b) is picked, split Part 3's file table into
    {arriving-guard … harness-hygiene-followups}, {hermetic … plugin-eval-suite},
    {refuse-open … usage-miner-subagent-transcripts}, and split Part 4 into {ADR-035, archive}
    and {design, spec}. Each split part keeps the same probe and gate, scoped to its own files.

Decided in-plan (not load-bearing, no alternative changes behaviour):

- The core line sits after the `Bounded scope` line (line 8). It is thematically adjacent (the
  working directory), and it keeps the `core.md:2` citation valid.
- The template pin is a new sibling suite, `test/plan-template.test.js`, not a test appended to
  test/plan-doc-fences.test.js. That keeps the fence suite single-purpose.
- The class-D tree-assertion failure message lists `file:line` only, never the line text. CI
  logs are public, and the line text would print the leaked username into them.
- In the dashed form, the design's `-Users-<name>-<repo>` keeps the repo's own name (`craft`,
  `node-sgd-bench-arm-a-plain`, …) and drops the `<dev-root>` segments. The slash-form input of
  the same `dashedCwd` mapping example (plan usage-miner-subagent-transcripts.md:974) is
  rewritten to match, so the example still maps correctly: `/Users/<name>/craft` →
  `-Users-<name>-craft`.

## Scrub rules (Parts 2-4)

Read this once; Parts 2-4 apply it and do not restate it.

**Shorthand.** `<abs>` = the line's absolute worktree path `/Users/<name>/<dev-root>/craft-<slug>`
(the real username and dev-root layout are on disk; never write them anywhere). The real
username is `$(id -un)`; derive it at runtime only. In a "leaked form" or "shape" column, `<name>` and
`<real>` both mean that real username as it sits on disk; in a "becomes" column, `<name>` is the
literal placeholder text to write.

**Residue probe** (read-only; prints per-file counts only, never line text):

```bash
u="$(id -un)"; git grep -cIE "/(Users|home)/$u|-(Users|home)-$u" -- <pathspec…>; echo "exit=$?"
```

RED = it prints `<file>:<count>` lines and `exit=0`. GREEN = no file lines and `exit=1`.

**Substitution table** (design §1, with DP1 (b) folded in):

| Leaked form | Becomes |
|---|---|
| `cd <abs> && <cmd>` | `<cmd>` (commands run from the worktree root) |
| `export PATH="…:$PATH" && cd <abs> && <cmd>` | `export PATH="…:$PATH" && <cmd>` |
| `cd <abs>/<sub> && <cmd>`, the only command in its fenced block, or inline prose | `cd <sub> && <cmd>` |
| `cd <abs>/<sub> && <cmd>`, in a fenced block holding other command lines | `(cd <sub> && <cmd>)` (DP1 b) |
| bare `cd <abs>/<sub>` line whose following lines rely on it | `cd <sub>` |
| `bash <abs>/scripts/ci.sh` | `bash scripts/ci.sh` |
| worktree passed as an argument (`bash "$probe" <abs>`) or assigned (`WT=<abs>`, `w=<abs>`) | `"$PWD"` → `bash "$probe" "$PWD"`, `WT="$PWD"`, `w="$PWD"` |
| a path used after the command has left the worktree (after `cd "$t/box"`) | `<worktree>/<rest>` |
| precondition or prose naming the worktree (`Working directory: <abs>`, `Worktree: <abs>`, "scope: work only in `<abs>`", "repo root (`<abs>`)") | `` `<worktree>` ``; where the line held a bare (unquoted) `<abs>`, write: the worktree root (`<worktree>`) |
| main-checkout path `/Users/<name>/<dev-root>/craft/<file>` | `<main-repo-dir>/<file>` (the P3-era plan pointed at the main checkout; keeping the placeholder keeps that fact and the sentence grammar) |
| ADR-035 `/Users/<name>/<dev-root>/forge` | `<dev-root>/forge` (the `.../craft` half stays) |
| toolchain install path `/Users/<name>/.n/bin/<tool>` | `<node-bin>/<tool>` |
| dashed projects dir `-Users-<name>-<dev-root-dashed>-<repo>` (real username) | `-Users-<name>-<repo>`: literal `<name>`, dev-root segments dropped, repo name kept |
| `git check-ignore` output `/Users/<name>/.gitignore:1:.claude` | `~/.gitignore:1:.claude` |

**Forced rewording (R2: only as far as the substitution forces).** Four precondition
sentences claim "absolute paths", which the rewrite makes false:

- native-codex-binding.md:24-25 and native-copilot-binding.md:24-25: "Absolute paths in every
  command." → "Repo-relative paths in every command, run from the worktree root."
- native-pi-binding.md:20 and opencode-adapter.md:20: "Work ONLY here; absolute paths." →
  "Work ONLY here; repo-relative paths."

Any other prose stays byte-identical. Leave `/private/tmp/claude-501/…`, `~/…`, `$HOME/…`, and
the `/Users/x` / `-Users-x-` placeholder-user lines untouched.

**How to edit.** Hand-apply per line. Read each line range first (`sed -n`); this prints the
username into your own context only, which is fine. A per-shape replacement over identical lines
of one file (Edit `replace_all` on an exact shape string, or one anchored `perl -pi -e` per shape
with `$(id -un)` interpolated) is allowed. A single catch-all regex is not. After editing, run
`git --no-pager diff --no-ext-diff -U0 -- <files>` and check every hunk against the table.
`git diff --stat` must show the same insertion and deletion counts (in-place line edits only).

## Part 1 — Core-contract repo-relative rule, plan-template Gate note, README counts

### Context

**Files this part edits or creates (5):**

- `contracts/core.md`: 11 lines, 958 bytes. Insert one line **after line 7** (`Bounded scope;
  work only in the given working directory.`), before line 8 (`Never change repo-wide git
  state …`). The exact bytes, from design §3:

  ```text
  Committed artifacts carry repo-relative paths — never an absolute or home-rooted path (/Users/<name>, /home/<name>); name an out-of-repo location by placeholder (<worktree>, <main-repo-dir>, <node-bin>).
  ```

  No `@@…@@` marker, so the line renders identically in agent and inline mode. The
  contract-equivalence "exactly two lines differ" test (engine/test/contract-equivalence.test.js
  `:108`) stays green. Lint: `node engine/bin/contracts-lint.js contracts` rejects only empty
  bundles and the word "retrieval".
- `engine/test-helpers/contract-markers.js`: `export const CORE_MARKERS = [ … ]` (11 entries,
  ending `'Turn budget',`). Append `'repo-relative paths',`. `hasCI` matches
  case-insensitively by substring. Consumers (read-only): engine/test/contract-equivalence.test.js
  (per-descriptor test "Given descriptor …, when assembled in agent mode, then core markers are
  all present", which reads the real contracts directory via `readFragment`), and
  engine/test/scenarios.test.js S2 (`:320`, `REAL_FRAGMENTS.core` = real `contracts/core.md`).
  The other scenarios fragments come from engine/test/fixtures/contracts/, but no other test
  iterates `CORE_MARKERS`.
- `templates/plan.md`: the Part 1 `### Gate` comment (lines 35-37) currently reads:

  ```text
  <!-- The part gate command(s) for this part (from the manifest's gates.part,
       placeholders resolved: <touched-tests>, <touched-files>). -->
  ```

  It becomes (design §3):

  ```text
  <!-- The part gate command(s) for this part (from the manifest's gates.part,
       placeholders resolved: <touched-tests>, <touched-files>). Commands run from
       the worktree root — write them repo-relative (`cd engine && …`), never
       `cd <absolute path>`. -->
  ```

  The template's `## Part 2` skeleton (bare `### Gate`) stays as is.
- `test/plan-template.test.js` (new, CommonJS like its siblings: `'use strict'`,
  `require('node:test')`, `require('node:assert')`, `node:fs`, `node:path`). Path constant:
  `const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'plan.md');` (same as
  test/plan-doc-fences.test.js:8). One small helper `gateGuidance(markdown)` returns the text
  from the first `### Gate` heading to the next `\n### ` heading. Name the heading string as a
  constant; assert the heading exists, because `indexOf` → -1 otherwise.
- `README.md`: lines 180-181, inside `## craft builds craft`:
  `[46 design docs](docs/contributing/design/)` → `47`,
  `[45 parted plans](docs/contributing/plan/)` → `46`,
  `[465 ADRs](docs/contributing/adr/)` → `471`. Leave "raw telemetry for 25 runs" alone. The
  guard is `bash scripts/readme-drift.sh` (engine/src/readme-drift-main.js, corpus-counts
  sub-guard: plain .md file count per directory). It is wired as its own CI job
  (.github/workflows/ci.yml `readme-drift`), not inside scripts/ci.sh, and is also asserted by
  test/readme-drift.test.js "Given the live repo tree, when readme-drift runs, then it exits 0
  with no findings".

**Do not touch:** engine/test/fixtures/contracts/core.md, the agents/*.md spawn briefs and
their adapter mirrors (they keep "the absolute working directory", R3), docs/guides/*,
BACKLOG.md.

**Style.** Given/When/Then titles, AAA body, `const sut = …`. No ADR, phase or backlog numbers in
code or test comments. Comments say why, not what.

### TDD steps

1. **RED 1 (pre-existing).** `node --test test/readme-drift.test.js`: "Given the live repo tree
   …" fails with `Expected clean exit`, and the output lists
   `corpus-counts: docs/contributing/design/ claims 46, tree holds 47`, the plan line
   (claims 45, holds 46) and `…/adr/ claims 465, tree holds 471`.
   `bash scripts/readme-drift.sh` exits 1 with the same three findings.
2. **GREEN 1.** Bump the three README counts. RED 1 passes, and `bash scripts/readme-drift.sh`
   exits 0.
3. **RED 2.** Append `'repo-relative paths'` to `CORE_MARKERS`. Then
   `npm --prefix engine test` fails: every per-descriptor "core markers are all present" test
   reports `core marker "repo-relative paths" missing from assembled block`, and scenarios S2
   reports `swap dropped core marker: "repo-relative paths"`. The real core fragment has no
   such line yet.
4. **GREEN 2.** Insert the design §3 line into `contracts/core.md` after line 7. RED 2 passes.
   GUARD: engine/test/contract.test.js output-digest and turn-budget tests (they find lines
   by prefix, so position-independent), the "exactly two lines differ" equivalence test (the
   new line is mode-invariant), and `node engine/bin/contracts-lint.js contracts` (exit 0).
5. **RED 3.** Create `test/plan-template.test.js` with one test, "Given the plan template, when
   its first ### Gate guidance is read, then it tells the planner to write gate commands
   repo-relative". It asserts that `gateGuidance(...)` includes `repo-relative`. It fails
   because the current comment only names `gates.part` and its placeholders.
6. **GREEN 3.** Edit the `templates/plan.md` Gate comment as in Context. RED 3 passes.
   GUARD: test/plan-doc-fences.test.js (no fence added) and test/source-hygiene.test.js
   (class A/B over `templates/`, `contracts/`, `README.md`: no new token).
7. **REFACTOR.** Keep the `gateGuidance` helper under 10 lines, and use named constants for the
   heading and the asserted phrase. `git --no-pager diff --no-ext-diff --stat` must list exactly
   the 5 files above.

### Gate

```bash
log="$(mktemp -d)"
npm --prefix engine test > "$log/engine.txt" 2>&1; echo "engine exit=$?"; grep -E '^# (pass|fail)' "$log/engine.txt"
node --test test/plan-template.test.js test/plan-doc-fences.test.js test/readme-drift.test.js test/source-hygiene.test.js test/every-test-file-registers.test.js > "$log/process.txt" 2>&1; echo "process exit=$?"; grep -E '^# (pass|fail)' "$log/process.txt"
bash scripts/readme-drift.sh; echo "readme-drift exit=$?"
node engine/bin/contracts-lint.js contracts
```

All four exit 0. The phase gate, `bash scripts/ci.sh`, runs at the phase boundary.

### Commit

`fix(contract): require repo-relative paths in committed artifacts`

## Part 2 — Scrub the native codex and copilot binding plans

### Context

Docs only. Apply § Scrub rules above (table, DP1 (b) subshell rule, forced rewording, how to
edit) to the two heaviest files: 37 leak lines.

**Files this part edits (2):**

- `docs/contributing/plan/native-codex-binding.md` (24 lines)
- `docs/contributing/plan/native-copilot-binding.md` (13 lines)

Per-line targets. "block=N" is the number of command lines in the line's fenced block.
"subshell" marks the DP1 (b) lines.

| File | Line(s) | Shape | Becomes |
|---|---|---|---|
| codex | 23 | `- **Working directory**:` then `` `<abs>` `` | `` - **Working directory**: the worktree root (`<worktree>`) `` |
| codex | 24-25 | "… Absolute paths in / every command." | forced rewording (§ Scrub rules) |
| codex | 262, 263, 264 (block=4) | `cd <abs>/{engine,adapters/pi,adapters/copilot} && node --test …` | subshell `(cd engine && node --test … \| tail -30)` etc. |
| codex | 265 | `cd <abs> && node --test 'test/*.test.js' …` | `node --test 'test/*.test.js' …` |
| codex | 406 (block=3) | `cd <abs>/adapters/codex && …` | subshell |
| codex | 407 | `cd <abs> && node --test …` | drop the `cd` |
| codex | 408, 1225, 1511, 1704, 1841 | `export PATH="/tmp/craft-codex-stubs:$PATH" && cd <abs> && bash scripts/ci.sh …` | `export PATH="/tmp/craft-codex-stubs:$PATH" && bash scripts/ci.sh …` |
| codex | 538, 717, 852, 993, 1393 (block=1) | `cd <abs>/<sub> && …` | `cd <sub> && …` |
| codex | 981 (block=2) | bare `cd <abs>/adapters/codex`; the next line runs `node --input-type=module -e "import('./src/…')" > craft.rules` and relies on it | bare `cd adapters/codex` |
| codex | 1224 (block=2), 1509 (block=3), 1839, 1840 (block=3) | `cd <abs>/<sub> && …` | subshell |
| codex | 1510, 1705 | `cd <abs> && git diff …` / `cd <abs> && grep -rEn …` | drop the `cd` |
| copilot | 23 | `- **Working directory**:` then `` `<abs>` `` | as codex 23 |
| copilot | 24-25 | "… Absolute paths / in every command." | forced rewording |
| copilot | 217 (block=3) | `cd <abs>/adapters/copilot && …` | subshell |
| copilot | 218 | `cd <abs> && node --test test/every-test-file-registers.test.js` | drop the `cd` |
| copilot | 219, 1373 | `bash <abs>/scripts/ci.sh` | `bash scripts/ci.sh` |
| copilot | 323, 426, 608, 821, 1179 (block=1) | `cd <abs>/<sub> && …` | `cd <sub> && …` |
| copilot | 1034 (block=2) | `cd <abs>/engine && …` | subshell |
| copilot | 1035, 1372 | `cd <abs> && node --test …` | drop the `cd` |

Read-only reference: test/plan-doc-fences.test.js (fence balance over every plan doc; the
rewrite must not touch a fence line).

### TDD steps

1. **RED (probe).** Residue probe over the two files prints
   `docs/contributing/plan/native-codex-binding.md:24` and
   `docs/contributing/plan/native-copilot-binding.md:13`, `exit=0`.
2. **GREEN.** Rewrite the 37 lines plus the two forced-rewording sentence pairs, per the
   table. The probe prints no file lines and `exit=1`.
3. **REFACTOR.** Review every `git diff --no-ext-diff -U0` hunk against the table. The only
   changes are path segments, the dropped `cd <abs> && ` prefixes, the added subshell
   parentheses and the two forced sentences. `--stat` shows equal insertions and deletions.
   GUARD: test/plan-doc-fences.test.js stays green (no fence line edited).

### Gate

```bash
u="$(id -un)"; git grep -cIE "/(Users|home)/$u|-(Users|home)-$u" -- docs/contributing/plan/native-codex-binding.md docs/contributing/plan/native-copilot-binding.md; echo "residue exit=$?"
node --test test/plan-doc-fences.test.js > "$(mktemp)" 2>&1; echo "fences exit=$?"
```

Expect `residue exit=1` with no file lines, and `fences exit=0`.

### Commit

`docs(plan): scrub home-rooted paths from the native binding plans`

## Part 3 — Scrub the remaining 17 plans

### Context

Docs only. Apply § Scrub rules above. Per DP2 (a), the edited files are declared by one glob
span and listed in full below. Part 2 already cleaned native-codex-binding.md and
native-copilot-binding.md; do not touch them, and do not touch this plan file
(scrub-home-dir-from-docs.md, which has no leak).

**Edited files:** `docs/contributing/plan/*.md`, exactly these 17 (26 lines):

| File (under docs/contributing/plan/) | Line(s) | Shape → becomes |
|---|---|---|
| arriving-guard-part-bound.md | 192 | `` `bash "$probe" <abs> 2>&1 \| head -60` `` → `bash "$probe" "$PWD" …` |
| ci-lint-chain-fail-closed.md | 97 | `Worktree: <abs>. Bash on this` → `` Worktree: the worktree root (`<worktree>`). Bash on this `` |
| ci-lint-chain-fail-closed.md | 409 | `w=<abs>` → `w="$PWD"` (the block's later lines use `"$w/…"`) |
| decisions-remote-slack-example.md | 24 | `` **Working directory (work ONLY here):** `<abs>` `` → `` … `<worktree>` `` |
| eval-sweep-followups.md | 165 | `… bash <abs>/evals/reviewer-tests-findings/scaffold.sh \` runs after `cd "$t/box"` → `bash <worktree>/evals/reviewer-tests-findings/scaffold.sh \` |
| eval-sweep-followups.md | 290, 441, 597 | `cd <abs> && scratch=$(mktemp -d)` → `scratch=$(mktemp -d)` |
| harden-prove-codex-binding.md | 73 | `` `<abs>`; use repo-relative `` → `` `<worktree>`; use repo-relative `` |
| harder-decisions-fork-fixture.md | 85 | `Worktree: <abs>.` → `` Worktree: the worktree root (`<worktree>`). `` |
| harder-decisions-fork-fixture.md | 129 | `` `bash "$probe" <abs> 2>&1` `` → `bash "$probe" "$PWD" 2>&1` |
| harness-hygiene-followups.md | 184, 185 | `/Users/<name>/.n/bin/pi`, `…/node` → `<node-bin>/pi`, `<node-bin>/node` ("the same directory" stays true) |
| hermetic-test-suites.md | 232 | `` **repo root** (`<abs>`) `` → `` **repo root** (`<worktree>`) `` |
| implementer-guard-eval.md | 150 | `` `bash "$probe" <abs> 2>&1` `` → `bash "$probe" "$PWD" 2>&1` |
| native-pi-binding.md | 19 (+20) | `` - **Working tree**: `<abs>` (branch `` → `` … `<worktree>` (branch ``; line 20 (`… Work ONLY here; absolute paths.`) gets the forced rewording |
| nested-insert-fail-loud.md | 47 | `` `<abs>`; use repo-relative `` → `` `<worktree>`; use repo-relative `` |
| opencode-adapter.md | 19 (+20) | as native-pi-binding.md:19-20 (forced rewording on line 20 included) |
| plugin-eval-suite.md | 204 | `` (`WT=<abs>`): `` → `` (`WT="$PWD"`): `` |
| refuse-open-on-live-run-id.md | 104 | `Working directory: <abs>` → `` Working directory: the worktree root (`<worktree>`) `` |
| refuse-open-on-live-run-id.md | 401 | same, keeping the trailing `.` |
| simpler-phase-authoring.md | 20 | `` - **Working tree:** `<abs>` `` → `` … `<worktree>` `` |
| sp9-findings-adoption.md | 49 | `` scope: work only in `<abs>`. `` → `` scope: work only in `<worktree>`. `` |
| usage-miner-subagent-transcripts.md | 974 | `` `/Users/<real>/<dev-root>/craft` → `-Users-<real>-<dev-root-dashed>-craft` `` (the `dashedCwd` mapping example) → `` `/Users/<name>/craft` → `-Users-<name>-craft` `` (literal `<name>`; see Decision candidates, "decided in-plan") |
| usage-miner-subagent-transcripts.md | 1388 | `--dir "$HOME/.claude/projects/-Users-<real>-<dev-root-dashed>-craft"` → `--dir "$HOME/.claude/projects/-Users-<name>-craft"` |
| usage-miner-subagent-transcripts.md | 1490 | `` `$HOME/.claude/projects/-Users-<real>-<dev-root-dashed>-craft` `` → `` `$HOME/.claude/projects/-Users-<name>-craft` `` |

Lines 975-976 of
usage-miner-subagent-transcripts.md (`/private/tmp/claude-501/-Users-…-craft/…`) already use
`…` and are not leaks. Leave them.

Read-only reference: test/plan-doc-fences.test.js.

### TDD steps

1. **RED (probe).** Residue probe over `docs/contributing/plan` prints the 17 files above
   (counts summing to 26), `exit=0`.
2. **GREEN.** Rewrite the 26 lines and the two forced-rewording clauses per the table. The probe
   prints no file lines and `exit=1`.
3. **REFACTOR.** Review every `git diff --no-ext-diff -U0` hunk against the table. `--stat` lists
   exactly the 17 files, with equal insertions and deletions. GUARD:
   test/plan-doc-fences.test.js and test/docs-history.test.js (it follows
   sp9-findings-adoption.md through its rename; a content edit does not affect it) stay green.

### Gate

```bash
u="$(id -un)"; git grep -cIE "/(Users|home)/$u|-(Users|home)-$u" -- docs/contributing/plan; echo "residue exit=$?"
node --test test/plan-doc-fences.test.js test/docs-history.test.js > "$(mktemp)" 2>&1; echo "suites exit=$?"
```

Expect `residue exit=1` with no file lines, and `suites exit=0`.

### Commit

`docs(plan): scrub home-rooted paths from the remaining plans`

## Part 4 — Scrub the design, archive, ADR-035 and spec docs

### Context

Docs only. Apply § Scrub rules above. Per DP2 (a), the archive and design files are declared
by glob spans and listed in full below.

**Edited files (10, 17 lines):** `docs/contributing/adr/035-repo-dir-and-out-of-repo-refs.md`,
`docs/contributing/archive/*.md` (4 files), `docs/contributing/design/*.md` (4 files),
`docs/contributing/specs/codex-poc-record.md`.

| File (under docs/contributing/) | Line(s) | Shape → becomes |
|---|---|---|
| adr/035-repo-dir-and-out-of-repo-refs.md | 10 | `` `/Users/<name>/<dev-root>/forge` get renamed to `.../craft` `` → `` `<dev-root>/forge` get renamed to `.../craft` `` |
| adr/035-repo-dir-and-out-of-repo-refs.md | 24 | `` **Repo directory: renamed** `/Users/<name>/<dev-root>/forge` → `` → `` … `<dev-root>/forge` → `` (the line-25 `.../craft` stays). The decision text stays byte-identical otherwise (ADR-135 sweep posture; not a supersede). Lines 30-33 carry the public GitHub handle (marketplace name), which is not a path; leave them. |
| archive/DESIGN-P22-repo-local-craft-memory.md | 63 | `` → `/Users/<name>/.gitignore:1:.claude` `` → `` → `~/.gitignore:1:.claude` `` |
| archive/PLAN-P14-derived-plugin-extension.md | 147 | `` `cd <abs>`. `` → `` `cd <worktree>`. `` |
| archive/PLAN-P15-second-instantiation.md | 175 | single-command block `cd <abs>/engine && node --test 'test/scenarios.test.js'` → `cd engine && node --test 'test/scenarios.test.js'` |
| archive/PLAN-P15-second-instantiation.md | 182, 274 | `bash <abs>/scripts/ci.sh` → `bash scripts/ci.sh` |
| archive/PLAN-P3-orchestrator-rewire.md | 32 | `` at `/Users/<name>/<dev-root>/craft/engine/src/index.js` `` → `` at `<main-repo-dir>/engine/src/index.js` `` |
| archive/PLAN-P3-orchestrator-rewire.md | 314 | `` `/Users/<name>/<dev-root>/craft/skills/run/SKILL.md` `` → `` `<main-repo-dir>/skills/run/SKILL.md` `` |
| design/harness-hygiene-followups.md | 283 | `/Users/<name>/.n/bin/pi`, `/Users/<name>/.n/bin/node` → `<node-bin>/pi`, `<node-bin>/node` |
| design/native-pi-binding.md | 87 | `` `/Users/<name>/.n/bin/pi` `` → `` `<node-bin>/pi` `` |
| design/usage-miner-subagent-transcripts.md | 198, 199, 200 | table cells `-Users-<real>-<dev-root-dashed>-node-sgd-bench-arm-{a-plain,b-staged,c-craft}` → `-Users-<name>-node-sgd-bench-arm-a-plain` etc.; every other cell stays byte-identical |
| design/usage-miner-subagent-transcripts.md | 243 | `` `~/.claude/projects/-Users-<real>-<dev-root-dashed>-craft` `` → `` `~/.claude/projects/-Users-<name>-craft` `` |
| design/usage-telemetry-miner.md | 98 | `` `~/.claude/projects/-Users-<real>-<dev-root-dashed>-craft/*.jsonl` `` → `` `~/.claude/projects/-Users-<name>-craft/*.jsonl` `` (the `…-node-tsgit` reference on line 99 stays) |
| specs/codex-poc-record.md | 21 | `` `/Users/<name>/.n/bin/codex` → Node shim … `` → `` `<node-bin>/codex` → Node shim … `` |

**Lints these files sit under** (read-only references): scripts/static-lints.sh runs
design-lint over every `docs/contributing/design/*.md` (heading schema only, not touched here)
and docs-structure-lint. scripts/ci.sh runs adr-lint whole-corpus (structure and superseded
citations, none introduced). docs/contributing/specs/codex-poc-record.md is in the living
corpus (test/living-corpus.test.js), so intention-lint runs over it in ci.sh. prose-lint skips
all four trees (scripts/ci.sh `:129`). That is why this part's gate is the full
`bash scripts/ci.sh`.

### TDD steps

1. **RED (probe).** Residue probe over `docs/contributing/adr docs/contributing/archive
   docs/contributing/design docs/contributing/specs` prints the 10 files (counts summing to 17),
   `exit=0`.
2. **GREEN.** Rewrite the 17 lines per the table. The probe prints no file lines and `exit=1`.
3. **REFACTOR.** Review every `git diff --no-ext-diff -U0` hunk against the table. `--stat` lists
   exactly the 10 files, with equal insertions and deletions. GUARD: `bash scripts/ci.sh`
   stays green (design-lint, adr-lint and intention-lint see unchanged structure).
4. **Whole-tree check.** Residue probe with no pathspec: it now lists only
   `engine/test/fixtures/aider/real-session.md:1` and `engine/test/usage-mine-main.test.js:2`
   (Part 5's scope). Any other file is residue from Parts 2-3: fix it here under the same
   table, and name it in the handback.

### Gate

```bash
u="$(id -un)"; git grep -cIE "/(Users|home)/$u|-(Users|home)-$u" -- docs/contributing/adr docs/contributing/archive docs/contributing/design docs/contributing/specs; echo "residue exit=$?"
log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -n 20 "$log"
```

Expect `residue exit=1` with no file lines, and `ci exit=0`.

### Commit

`docs: scrub home-rooted paths from design, archive, ADR and spec docs`

## Part 5 — Source-hygiene class D: block home-rooted paths across the tracked tree

### Context

Test and test-fixture only. This part adds the guard (design §2, DC-2 (a), DC-3 (a)) and
rewrites the last 3 leak lines, which are engine test inputs (DC-6 (a)).

**Files this part edits (3):**

- `test/source-hygiene.test.js` (223 lines, CommonJS). Existing structure to extend:
  - imports `test`, `assert`, `execFileSync`, `path`; `const ROOT = path.join(__dirname, '..')`.
  - classes A/B grep the explicit `SCANNED_PATHS` (no engine/test, no dated docs). Class C
    (`findMisplacedVendorFiles`, `listTrackedFiles`) scans tracked basenames. **Class D is
    whole-tree on purpose**: the leak lived in dated docs and engine fixtures, which A/B never
    scan. Say why in one comment, and cite no ADR number. The existing class C comment cites
    one; that is old code, so don't copy it.
  - `listTrackedFiles` swallows a git failure into `[]`. **Do not reuse that pattern**: the new
    git call must rethrow anything but the no-match exit.
  - Line 43 holds the README canonical-URL constant, which carries the public GitHub handle.
    The handle is not a path, and class D ignores it (no `/Users/` or `/home/` root).
  - Put the class-D constants and helpers after the class C constants (below
    `readmeCanonicalUrlOnlyFilter`), and append the three class-D tests at the end of the file.
- `engine/test/usage-mine-main.test.js`: lines 1309 and 1311, in the test "Given a plain
  absolute cwd, when dashedCwd runs, then every path separator becomes a dash". Today it holds
  `sut('/Users/<real>/<dev-root>/craft')` and `assert.equal(result,
  '-Users-<real>-<dev-root-dashed>-craft')`. Change **only the username segment**, to `x`, in
  both lines. The `<dev-root>` segments stay byte-identical: placeholder-user lines are out of
  scope (design "Out of scope"). The neighbouring test at `:1320` already uses `-Users-x-craft`.
- `engine/test/fixtures/aider/real-session.md`: line 4 is a real captured `> /opt/homebrew/bin/aider
  … --llm-history-file /private/tmp/claude-501/-Users-<real>-<dev-root-dashed>-craft/…` echo
  line. Change **only the username segment** to `x`. The `>` echo line is not parsed: the
  aider parser's pinned tokens (input 781, output 19) and model
  (`ollama_chat/qwen2.5-coder:7b`) come from other lines. Consumers (read-only):
  engine/test/aider-telemetry.test.js `:46`, `:56`, and engine/test/usage-mine-main.test.js
  `:1778`-`:1800` (copies the fixture into a temp history dir). The design pinned both suites
  at 125/125 after this rewrite, in a throwaway copy.

**Class-D code to add** (design §2; names are binding, bodies indicative, each function ≤20
lines):

```js
// Class D: absolute home-rooted paths leak the author's OS username and workspace layout.
// Whole tracked tree on purpose — dated docs and test fixtures carried every past leak.
const PATH_START = "(?:^|[\\s`'\"(=:\\[{,>])";
const HOME_SLASH_PATTERN = new RegExp(`${PATH_START}/(?:Users|home)/([A-Za-z0-9._-]+)`, 'g');
const HOME_DASHED_PATTERN = new RegExp(`(?:${PATH_START}|/)-(?:Users|home)-([A-Za-z0-9._]+)-`, 'g');
const PLACEHOLDER_HOMES = new Set(['alice', 'example', 'me', 'someone', 'user', 'x', 'other-clone']);
const HOME_CANDIDATE_PATTERN = '/(Users|home)/|-(Users|home)-';
const GIT_GREP_NO_MATCH = 1;
const LOCATED_LINE_PATTERN = /^(.+?):(\d+):(.*)$/;

function findHomePathLeaks(line) {
  return [HOME_SLASH_PATTERN, HOME_DASHED_PATTERN]
    .flatMap((pattern) => [...line.matchAll(pattern)])
    .map((match) => match[1])
    .filter((segment) => !PLACEHOLDER_HOMES.has(segment));
}

function listHomePathCandidateLines() {
  try {
    return execFileSync('git', ['grep', '-nIE', HOME_CANDIDATE_PATTERN], {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).split('\n').filter(Boolean);
  } catch (err) {
    if (err.status === GIT_GREP_NO_MATCH) return [];
    throw err;
  }
}
```

- `matchAll` with `g` regexes is stateless per call. Never use `.test` on these `g` regexes,
  because `lastIndex` would carry over between calls.
- A `<…>` segment, a `${…}` interpolation, and `{U}` all fail the segment class, so they pass
  with no special case.
- **Self-reference.** The scanned test file must hold no literal leak. Build the flagged inputs
  with a named synthetic segment that is not in `PLACEHOLDER_HOMES` and has no dash (the dashed
  class excludes `-`): `const SYNTHETIC_HOME = 'synthetic';`. Then write
  `` `cd /Users/${SYNTHETIC_HOME}/w && x` `` and so on. In the source text, `${` follows the
  root, so the line fails the segment class and is not flagged. Not-flagged inputs can be
  literals.
- **Failure message.** List the offending `file:line` only, never the line text: CI logs are
  public.

**The 16-row matrix** (design Test strategy; `{U}` = `${SYNTHETIC_HOME}`; already pinned at 0
mismatches against these regexes):

- Flagged (6): `cd /Users/{U}/w && x` · `` `/Users/{U}` `` · `/home/{U}/x` ·
  `projects/-Users-{U}-craft` · `"cwd":"/Users/{U}/p"` · `` `~/.claude/projects/-home-{U}-craft` ``
- Not flagged (10): `/Users/<name>/x` · `/Users/alice/p` · `/private/tmp/e-abc/home/cwd/g.sh` ·
  `/fake/home/user` · `adr/241-copilot-adapter-home-dist.md` · `~/.claude/projects` ·
  `$HOME/.claude` · `github.com/{U}/craft` · `-Users-x-craft` · `/home/user`

### TDD steps

1. **RED 1.** Add two tests:
   (a) "Given leak-shaped lines in slash and dashed form, when findHomePathLeaks judges each,
   then every one is flagged". For each of the 6 rows, assert
   `sut(line).length > 0`, naming the row in the message.
   (b) "Given placeholder, synthetic-fixture and non-root home-shaped lines, when
   findHomePathLeaks judges each, then none is flagged". For each of the 10 rows, assert
   `deepStrictEqual(sut(line), [])`.
   Both fail with `ReferenceError: findHomePathLeaks is not defined`.
2. **GREEN 1.** Add the constants and `findHomePathLeaks` as above. 16/16 rows pass.
3. **RED 2.** Add "Given the tracked tree, when every home-rooted candidate line is judged,
   then zero leaks remain". First assert that `listHomePathCandidateLines()` is non-empty: the
   tree always holds the synthetic `/Users/alice` fixtures, so an empty scan means the git call
   broke, not that the tree is clean. Then parse each line with `LOCATED_LINE_PATTERN`, keep
   those where `findHomePathLeaks(text).length > 0`, map them to `file:line`, and assert none
   remain. It fails listing exactly `engine/test/fixtures/aider/real-session.md:4`,
   `engine/test/usage-mine-main.test.js:1309` and `:1311`. Parts 2-4 removed the other 80. If
   any other file is listed, a previous part left residue: rewrite it per § Scrub rules in this
   part and name it in the handback.
4. **GREEN 2.** Rewrite the username segment to `x` in the 3 engine lines. RED 2 passes.
   GUARD: engine/test/aider-telemetry.test.js (pinned tokens and model unchanged; the echo line
   is unparsed) and engine/test/usage-mine-main.test.js (`dashedCwd` still maps every
   separator to a dash: `/Users/x/…` → `-Users-x-…`) stay green.
5. **REFACTOR.** Pull the `file:line` mapping into a small helper if the test body exceeds 20
   lines. Run the whole-tree residue probe from § Scrub rules: no file lines, `exit=1`.
   `git --no-pager diff --no-ext-diff --stat` lists exactly the 3 files.

### Gate

```bash
log="$(mktemp -d)"
node --test test/source-hygiene.test.js test/every-test-file-registers.test.js > "$log/process.txt" 2>&1; echo "process exit=$?"; grep -E '^# (pass|fail)' "$log/process.txt"
npm --prefix engine test > "$log/engine.txt" 2>&1; echo "engine exit=$?"; grep -E '^# (pass|fail)' "$log/engine.txt"
```

Both exit 0. The phase gate, run once after this part, is
`bash scripts/ci.sh > "$(mktemp)" 2>&1` (read the tail) plus `bash scripts/readme-drift.sh`.

### Commit

`test(hygiene): block home-rooted paths across the tracked tree`
