# Plan — auto-compaction-safety

> Source: design doc `docs/contributing/design/auto-compaction-safety.md` · ADRs `372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382`
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

## Plan shape (10 parts, sequential, one working tree `feat/auto-compaction-safety`)

| # | Part | Shape (`size=` label) | Files | RED cycles | Code delta |
|---|---|---|---|---|---|
| 1 | `scripts/run-ledger.sh` + shared run-repo test helper (+ README corpus counts) | script-cli | 4 | 5 | yes |
| 2 | Reorient hook + `hooks/bound-run.sh` + `SessionStart` registration | hook-script | 5 | 5 | yes |
| 3 | `run-state` pure derivation + shared ledger fixtures | pure-module | 3 | 5 | yes |
| 4 | `run-state` main + bin | lint-bin-port | 4 | 4 | yes |
| 5 | Steer hook + `PreCompact` registration | hook-script | 4 | 5 | yes |
| 6 | Claude adapter: compaction detection + estimate | port-field | 4 | 4 | yes |
| 7 | Core `compactionEstimate` + miner threading + telemetry spec | core-wiring | 6 | 5 | yes |
| 8 | Run skill + run-record spec + integrate delta file | docs-prose | 5 | 5 | no |
| 9 | Phase-skill emitters (workspace, implementation, review, validation) | docs-prose | 6 | 5 | no |
| 10 | Guide, poc-record, concepts row | docs-prose | 5 | 4 | no |

Ordering is load-bearing:

- 1 before 2 and 5: both hooks shell out to `run-ledger.sh locate`, and their tests build bound
  runs with the helper Part 1 creates.
- 2 before 5: Part 5 sources the `hooks/bound-run.sh` helper Part 2 creates and extends Part 2's
  no-op table and `hooks.json`.
- 3 before 4 and 5: Part 3 creates the shared ledger fixtures under
  `engine/test/fixtures/run-ledger/`; Part 4's acceptance test and Part 5's in-flight matrix read
  the same files, so the `run-state` rule and the steer hook's `awk` rule see identical inputs.
- 6 before 7: the core consumes the `CompactionEstimate` shape the adapter emits.
- 8 after 1–5: the prose names `run-ledger.sh open`, `run-state.js` and both hooks, and
  `test/run-record.test.js` pins those names. 9 after 8: the spec vocabulary (Part 8) lists
  the `PART`/`FINDINGS`/`HARNESS-BG` tokens whose emitting skills Part 9 edits. 10 last: it names
  both hooks and the miner report line.

Files shared across parts. plan-lint warns about these; the sharing is intentional.

- `hooks/hooks.json` and `test/hooks.test.js` (Parts 2, 5): merged, the two hook parts would be
  7 files and ~10 RED cycles.
- `test/run-record.test.js` (Parts 8, 9): merged, the two prose parts would be 9 files. The
  sequence is fixed, because Part 9's emitter rows extend Part 8's token table.
- `test/craft-root-shim.test.js` (Parts 2, 5, 8, 9): shared pin infrastructure. Each part moves
  only the rows its own edits change.

## Baseline — `bash scripts/ci.sh` is red before Part 1 (verified)

Reproduced at `499032f` (this branch before this plan) and again in a throwaway clone:

1. **`engine/test/readme-drift-main.test.js`** ("Given no root argument…") — `README.md`
   lines 180-181 claim `30 design docs`, `29 parted plans`, `371 ADRs`; once this plan is
   committed the tree holds **31 / 30 / 382**. Caused by this run's own design, ADR and plan
   commits. **Part 1 fixes it** as its first commit.
2. **`test/p22-memory.test.js`** ("Given the committed memory store content…") — the committed
   `.claude/craft-memory.md` holds 9 `part-sizing` entries against the test's recorded floor of 30
   ("a drop below the floor means bulk loss"). `main`'s `34c4036` (chore(metrics): record the
   shrink-agent-context-cost run) took the store from 36 to 11 `part-sizing` lines. Not this
   feature's defect — see **DC-1**. It must be settled before any part can close a green
   `ci.sh` gate.

With both fixed in the throwaway clone (README counts edited; the store restored from
`34c4036~1`), `bash scripts/ci.sh` exits 0. No other baseline failure exists.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How the pre-existing `p22-memory` red gets a green gate | (a) the orchestrator lands, before Part 1, `chore(memory): restore part-sizing entries lost in the shrink-agent-context-cost flush` — re-adding the `part-sizing` entries present at `34c4036~1` and absent at `34c4036`, keeping every other concern's current entries — and files a backlog follow-up for the flush that dropped them; (b) fix it on `main` in a separate PR first, then rebase this branch; (c) every part gate accepts exactly that one known failure | **(a)** | (a) is a root-cause data restore that keeps the floor honest and unblocks every gate in one commit, at the cost of a foreign commit on this branch. (b) is the cleanest history but blocks this run on another PR. (c) is a carve-out: it violates "never commit on a red gate" and hides any new regression in the same suite. Needs the user's call: the store is committed data and the cause of the loss is unknown. |

No other open choice: every other choice is fixed by ADRs 372–382 or by the "Design gaps this
plan closes" section below, which only makes the design's own stated properties hold.

## Design gaps this plan closes (verify, do not re-decide)

- **Open and the §0 lines in one call.** §0 step 4 runs `open` and the `append` of the held
  §0 lines in **one** Bash call. The design's principle is "same-call append": a compaction between
  `open` and that first `append` would otherwise leave a bound pointer with no `RESOLVE:` line.
- **`PHASE-START` on resume.** The design says a re-entered in-flight phase re-runs walk steps 2–4,
  "all of which are idempotent". Step 4 now appends `PHASE-START`, so it appends only when the
  phase's last event is not already `START`. Otherwise a resume would move the phase's
  `--since` instant and under-count its metrics row.
- **Absent `AWAITING` line.** `run-state` treats a missing `AWAITING(propose):` line as absent, never
  as the empty set. An absent line against a non-empty resolved set is the R7 mismatch (exit 1). An
  absent line against an empty resolved set is fine, with a warning. The rule stays "never a guess".
- **`HARNESS-BG` without a spec file.** A background technique that builds no scope-spec file (gate
  mode) records `spec=none`, so the token keeps one fixed shape.
- **Stale guide row.** `docs/guides/concepts.md` line 213 says the ledger gets "one append per phase
  boundary", which ADR-372 supersedes. The design's files-touched table omits it, so Part 10 fixes it.
- **Vacuous reorient assertion.** The design's test "reorient stdout contains `RESOLVE:`" is vacuous:
  the fixed rebuild text itself says "the flags on this run's RESOLVE: line". Part 2 asserts the
  ledger's own `RESOLVE:` record verbatim instead.
- **Existing pins that move.** `test/run-record.test.js` pins `into the in-session \`delta\` and hold it`
  in integrate step 3. Part 8 changes the step to a file write and updates that pin. Two more pins
  need the literal `.claude/craft-run-record.md` in the run skill's `## Done` region, so Part 8
  keeps that literal when it removes the residual-flush paragraph.

## Conventions binding every part

- **Tests.** `node:test`; Given/When/Then titles; AAA bodies; the unit under test is bound to `sut`.
  `test/` is CommonJS (`'use strict'`, `require`); `engine/` is ESM. Every temp repo or dir is a
  `realpath`'d `mkdtemp` (see `test/helpers/tmp-git-repo.js`: macOS `$TMPDIR` is a symlink). Clean up
  in `after`/`finally`.
- **No provenance references.** Source, test and fixture code and comments name no ADR, phase, part
  or backlog numbers. For `engine/src`, `engine/test/source-hygiene.test.js` enforces
  `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`. That regex also rejects the design's `P3`/`Q7`
  evidence labels and any identifier such as `p1`, so describe behaviour instead. Test titles and
  test comments anywhere never cite the design's evidence labels (`Q1`–`Q8`, `P1`–`P5`, spike or
  probe ids such as `A2`): `P<n>` reads as a program-phase reference in this repo.
- **No suppressions, no swallowed errors.** No lint-silencing comment of any flavour. Every non-zero
  exit writes one reason line to stderr. The only deliberate silent paths are the no-op paths the
  design names: `locate` outside a repo and the hooks' unbound cases.
- **Hygiene scan** (`test/source-hygiene.test.js`). Class A forbids `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
  and class B forbids the words `gh` and `github` (word-bounded). Both apply in `skills/`, `agents/`,
  `contracts/`, `templates/`, `pipeline/`, `engine/src/`, `docs/contributing/specs/`,
  `docs/contributing/DOD.md`, `docs/guides/customizing.md` and `README.md`. Fixtures use a neutral
  technique id: `sample-technique`.
- **Bash.** Scripts must run on macOS `/bin/bash` 3.2. That rules out `mapfile`, `declare -A` and
  `${x,,}`. Guard empty arrays under `set -u` with `${a[@]+"${a[@]}"}`. Use POSIX `awk` only (BSD awk
  has no gawk `match(s, re, arr)` and no `gensub`). Every script must be shellcheck-clean; `ci.sh`
  runs `shellcheck scripts/*.sh hooks/*.sh`. New executables are committed with mode 100755
  (`chmod +x` before `git add`).
- **Digest the output.** Pipe every test run: `… 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'`
  or `| tail -25`. Send `ci.sh` output to a file and grep it; never read raw suite output whole.
- **Design vs code mismatch.** If a design statement is wrong against the code, STOP. Hand back a
  blocker `{ part, reason, ≤3 options }` rather than silently deviating.
- **Moving pins.** `test/craft-root-shim.test.js` pins the per-file count of
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/`. The part that adds an occurrence updates that file's count,
  and the counts below are exact. `test/living-corpus.test.js` `EXPECTED` gains the new specs page
  in Part 10.

## Public-surface decisions

- **Internal (no barrel entry).** These new JS exports stay internal: `deriveRunState`
  (`engine/src/run-state.js`), `main` (`engine/src/run-state-main.js`), the `EQUIV_WEIGHT_INPUT`,
  `EQUIV_WEIGHT_CACHE_READ` and `EQUIV_WEIGHT_OUTPUT` exports of
  `engine/src/observability/metrics-line.js`, and the Claude adapter's new `compactions` return
  field. `engine/src/index.js` exports only the pipeline and policy API; nothing is added to it.
- **Public, and the part that creates each surface pre-pays its gates:**
  - `scripts/run-ledger.sh`, the CLI the skills call through the shim. Gates: shellcheck glob;
    `test/run-ledger.test.js` (Part 1); the shim counts of every skill that invokes it (Parts 8, 9).
  - The two compaction hooks. Gates: the `hooks/hooks.json` registration test, the executable-mode
    check and the `hooks.json` shim count (Parts 2, 5).
  - The `run-state` bin. Gates: the bin test, and the run skill's shim count, since the skill
    invokes it (Parts 4, 8).
  - The new ledger tokens. Gates: the run-record spec vocabulary and the `test/run-record.test.js`
    token pins (Parts 8, 9).
  - The `runs[*].compactionEstimate` report key and its Markdown line. Gate: the telemetry spec's
    "Per run" / "Port interface" / "Claude binding" sections (Part 7).
  - The guide and poc-record. Gates: `test/living-corpus.test.js`, the class A/B hygiene scan and
    intention-lint (Part 10).

## Shared contracts (pinned — parts must agree byte-for-byte)

### Ledger line and tokens

A ledger line is `<run-id> <phase> <record>`: split on the first two spaces, and field 1 is the
run-id. Tokens are anchored at the start of `<record>`:

| Token | Regex over `<record>` (run-state, Part 3) | Emitted by |
|---|---|---|
| `RESOLVE: <craft flags verbatim, or none>` | `^RESOLVE: (.*)$` (not consumed by run-state) | run skill §0 step 4 |
| `AWAITING(propose): <ids comma-joined, or none>` | `^AWAITING\(propose\): (.+)$` — `none` → `[]`, else split on `,` and trim | run skill §0 step 1d, appended at step 4 |
| `PHASE-START(<phase>): <iso8601>` | `^PHASE-START\(([a-z][a-z0-9-]*)\): (\S+)$` | run skill walk step 4 |
| `PHASE-DONE(<phase>): <one-line outcome>` | `^PHASE-DONE\(([a-z][a-z0-9-]*)\): (.*)$` | run skill walk step 7 |
| `PART(<n>): <sha> size=<size> outcome=<pass\|blocked>` | `^PART\((\d+)\): ([0-9a-f]{7,40}) size=(\S+) outcome=(pass\|blocked)$` | implementation procedure 2 |
| `FINDINGS(<dimension>): c<cycle> <path> n=<count>` | `^FINDINGS\(([a-z][a-z0-9-]*)\): c(\d+) (\S+) n=(\d+)$` | review procedure 2 |
| `HARNESS-BG(<phase>:<technique-id>): pid=<pid> out=<path> spec=<path\|none>` | `^HARNESS-BG\(([a-z][a-z0-9-]*):([a-z0-9][a-z0-9-]*)\): pid=(\d+) out=(\S+) spec=(\S+)$` | validation procedure 1 (background) |
| existing `GATE(<phase>): green\|red` | `^GATE\(([a-z][a-z0-9-]*)\): (green\|red)` | walk step 7 |
| existing exact `NO-OP(<phase>):` | `^NO-OP\(([a-z][a-z0-9-]*)\):` (the charset excludes `validation:<t>`) | walk step 7 |
| existing `auto-skip:` | `autoSkipPhasesInText(record)` from `engine/src/observability/skip-signals.js` | walk step 1 |

A record that starts with a new token's literal prefix (`AWAITING(`, `PHASE-START(`,
`PHASE-DONE(`, `PART(`, `FINDINGS(`, `HARNESS-BG(`) but fails that token's full regex adds a
`warnings[]` entry. Example: a temp path containing whitespace.

### `scripts/run-ledger.sh` (Part 1 implements; Parts 2, 5, 8, 9 call)

```
<main>   = parent dir of `git rev-parse --path-format=absolute --git-common-dir`
           (identical from the checkout, a linked worktree, or a subdirectory of either)
<dir>    = <main>/.claude/craft-runs
run-id   = ^[a-z0-9][a-z0-9-]*$            (else exit 2)
phase    = ^[a-z][a-z0-9-]*$               (append only; else exit 2)
run-key  = <run-id>@$(date -u +%Y-%m-%dT%H:%M:%SZ)
pointer  = <dir>/<run-id>.pointer — ONE line "<run-key> <abs-ledger-path>"; the path is
           everything after the first space; written to a temp file in <dir> then `mv`d over
scratch  = <dir>/<run-id>.pre.md
delta    = <dir>/<run-id>.delta.json
header   = # craft run record (append-only)
```

| Verb | Behaviour | Exit |
|---|---|---|
| `open <run-id> [--in-place]` | Resolve `<main>`; on failure write git's reason to stderr and exit 1. `mkdir -p <dir>`. **Sweep**: remove every `*.pointer` whose ledger path is not a regular file, or whose line is malformed (no space). Target = scratch, or `<main>/.claude/craft-run-record.md` with `--in-place`. Write the header iff the target is absent or empty. If `<run-id>.pointer` already exists, write one stderr line saying it is replaced (run-id collision). Write the pointer. stdout: `<run-key> <target>` | 0 / 1 io / 2 usage |
| `append <run-id> <phase>` | Read stdin. Each non-blank line becomes one `printf '%s %s %s\n' <run-id> <phase> <line> >> <ledger>` — one write per line. Blank lines are skipped. Exit 1 when there is no pointer, when the ledger is not a regular file (**never recreated**), or when stdin held zero non-blank lines | 0 / 1 / 2 |
| `move <run-id> <worktree>` | Pointer must exist and name the scratch, and `<worktree>` must be a directory, else exit 1. Target = `<worktree, cd+pwd -P>/.claude/craft-run-record.md`: `mkdir -p` its `.claude`, header iff absent or empty. Append every scratch line after the scratch's header, in order. Rewrite the pointer with the **same** run-key and the target. `rm` the scratch. stdout: `<run-key> <target>` | 0 / 1 / 2 |
| `locate --transcript <path>` | Resolve `<main>` with rev-parse stderr sent to `/dev/null` (a non-repo cwd is this always-on hook's normal no-op, not an error). No output and exit 0 when: rev-parse fails, `<dir>` is absent, or `<path>` is empty or not a readable regular file. Candidates are pointers whose ledger is a regular file (`-f`, **not** `-r`, so an unreadable ledger surfaces in the hook's failure line) **and** whose run-key `grep -F -q -e <key> -- <path>` finds. Winner: greatest run-key timestamp, ties broken by greatest run-key string. stdout: `<run-id> <ledger>` | 0 / 2 usage |
| `locate --run <run-id>` | That run's pointer, if its ledger is a regular file. stdout: `<run-id> <ledger>`, or nothing | 0 / 2 |
| `close <run-id>` | `rm -f` the pointer, scratch and delta | 0 / 1 outside a repo |
| `dir` | stdout: `<dir>`. Does not create it (a query) | 0 / 1 outside a repo |
| no verb / unknown verb / missing argument | usage on stderr | 2 |

### Hook outputs (Parts 2, 5)

- `hooks/bound-run.sh` (sourced; first line `# shellcheck shell=bash`; no `set` options — it inherits
  the caller's). It resolves its own directory with the builtin `${BASH_SOURCE[0]%/*}` plus
  `cd … && pwd -P`, **never** `dirname`, so the missing-`jq` path needs no external command. When
  `BASH_SOURCE[0]` holds no `/`, the directory is `.`.
  - `never_block <hook-name>`: `trap` on `EXIT`. On a non-zero status, write exactly
    `craft <hook-name>: failed (exit <rc>)` to stderr and `exit 0`. A `PreCompact` exit 2 would
    block the compaction.
  - `bound_run`: first `command -v jq` (missing → one stderr line naming `jq`, return 0). Then read
    stdin once. `cwd` = `.cwd // empty` (fallback `$CLAUDE_PROJECT_DIR`); `transcript` =
    `.transcript_path // empty`. An empty transcript or a cwd that is not a directory → return 0 with
    no output. Otherwise `( cd "$cwd" && <hooks-dir>/../scripts/run-ledger.sh locate --transcript "$transcript" )`.
    locate's stderr is not redirected, so a failure keeps its reason. Prints `<run-id> <ledger-path>`
    or nothing, and returns 0.
- Bash 3.2 does not carry `set -e` into `$(…)`. Any helper called inside a command substitution
  must end with the command whose failure matters, or `return` that status explicitly. The failing
  status must reach the outer assignment, where `set -e` fires and `never_block` catches it.
- Both hooks: `#!/bin/bash`, `set -euo pipefail`, `source` the helper under
  `# shellcheck source=hooks/bound-run.sh`, call `never_block <own-name>` first, then
  `bound="$(bound_run)"`. Empty → `exit 0`. They split `bound` with `${bound%% *}` / `${bound#* }`,
  build the whole text in variables and print it with **one** `printf`, so a failure leaves stdout
  empty. They never write a file.
- **Reorient** (`hooks/reorient-after-compact.sh`). `<craft-root>` = `cd "<hooks-dir>/.." && pwd -P`.
  One `awk -v id=<run-id>` pass keeps lines whose `$1 == id`, counts them (`n`), keeps the last 30,
  each cut to 200 characters (`k = min(30, n)`), and prints the tail header then the lines. Text
  (the first line is one line):

  ```
  craft reorient — if you are not the craft orchestrator driving run <run-id>, ignore everything after this paragraph. Craft sub-agent: your task is still the prompt you were spawned with; re-derive your progress from `git status`, `git log` and the files you wrote; never repeat a commit that already landed.
  Orchestrator: your context was just compacted. Trust the run ledger over the summary.
  Ledger: <ledger-path>
  Rebuild (skills/run/SKILL.md, "Rebuild after compaction"):
  1. Re-run §0 steps 0b, 1 and 1b with the flags on this run's RESOLVE: line.
  2. load() the memory store; consult() the intention view.
  3. Pipe that Resolution into: node <craft-root>/engine/bin/run-state.js <ledger-path> --run <run-id>
  4. Resume every inFlight phase per the resume table, then walk from next.
  Ledger tail (last <k> of <n> lines of run <run-id>):
  <tail lines>
  ```
- **Steer** (`hooks/steer-compact-summary.sh`). One POSIX `awk -v id=<run-id>` pass over the
  **whole** ledger. It keeps `$1 == id` lines whose `$3` starts `PHASE-START(` or `PHASE-DONE(`, and
  extracts the phase by stripping the prefix and the trailing `):`. It records first-seen order and
  the last event per phase. Phases whose last event is START, in first-seen order, are joined with
  `, ` and cut to 200 characters; when there are none, the list reads `none recorded`. Text (four
  lines):

  ```
  craft compaction note: craft run <run-id> is bound to this session. Decide whose conversation you are summarising and apply only the matching paragraph.
  If it is the craft orchestrator's (it drives the craft workflow and calls run-ledger.sh), the summary must keep verbatim: run-id <run-id>; ledger <ledger-path>; phase(s) in flight: <in-flight list>; every commit hash that landed; any question put to the user and not yet answered, word for word; and the sentence "The run ledger outranks this summary."
  If it is a craft sub-agent's (it opens with a spawn prompt for one task and never calls run-ledger.sh), the summary must keep verbatim: the task statement of its spawn prompt; every file path it wrote; every commit hash it landed; the last step it completed. Leave out the run-id and ledger path: a sub-agent never writes the ledger.
  If neither, ignore this note.
  ```

### `run-state` (Parts 3, 4)

- Pure: `deriveRunState(lines, runId, resolution)`, where `lines` is `string[]` and `resolution` is
  the parsed pipeline-resolve JSON. It reads only `effective[].id` and the `gateDecisions[]` entry
  with `phaseId === 'propose'`; a missing entry or field means the empty set. It returns
  `{ kind: 'state', state }` or `{ kind: 'awaiting-mismatch', ledger: string[] | null, resolution: string[] }`.
- `state` keys, in this insertion order:
  - `run`
  - `completed`: string[] in `effective` order, where the last event is DONE, or the phase has an
    `auto-skip:` and is not in flight (in flight wins; a phase is never in both lists)
  - `inFlight`: `{ phase, since }[]` in `effective` order, where the last event is START
  - `next`: the first `effective` id in neither list, else `null`
  - `awaitingHarnesses`: the AWAITING set minus the released ids, in AWAITING order
  - `parts`: `{ n, sha, size, outcome }[]`, last line wins per `n`, sorted by `n`
  - `findings`: `{ dimension, cycle, path, count }[]` in ledger order
  - `background`: `{ phase, technique, pid, out, spec }[]` in ledger order
  - `warnings`: string[]
- Only lines whose field 1 equals `runId` count. AWAITING is the **last** matching line. Released(id)
  ⇔ `auto-skip: id` ∨ exact `NO-OP(id):` ∨ the **last** `GATE(id)` is `green`. Two cases add a
  warning and keep the phase out of `completed`/`inFlight`:
  - a PHASE-START/PHASE-DONE/auto-skip phase absent from `effective`
  - a token line failing its regex
- The mismatch is a set comparison. The `ledger` side is `null` when there is no AWAITING line and
  the resolved set is non-empty. No line with an empty resolved set is not a mismatch: it adds the
  warning `no AWAITING(propose) line for run <id>`.
- Bin: `engine/bin/run-state.js`, `node engine/bin/run-state.js <ledger-path> --run <run-id>`, with
  stdin = the Resolution JSON.
  - Exit 0: stdout is `JSON.stringify(state, null, 2) + '\n'`.
  - Exit 1 (mismatch): stdout empty; stderr has one line naming both sets
    (`run-state: AWAITING(propose) mismatch — ledger: <a,b|absent>; resolution: <c,d>`).
  - Exit 2: missing or unreadable ledger, stdin that is not JSON or lacks an `effective` array,
    missing `--run` or ledger argument, a surplus positional argument, or an unknown flag.

### Shared ledger fixtures — `engine/test/fixtures/run-ledger/` (Part 3 creates; Parts 4, 5 read)

Each file starts with the header line `# craft run record (append-only)`. Run-id `demo` throughout.
The default resolution used by the pure tests has effective ids
`workspace, design, decisions, planning, implementation, review, refactoring, validation, documentation, propose, integrate`
and propose awaiting `[validation]`. The `enable-architecture` resolution inserts `architecture`
after `validation` and awaits `[validation, architecture]`.

- `mid-review.md` — `demo resolve RESOLVE: none`; `demo resolve AWAITING(propose): validation`;
  START/DONE for workspace, design (isos `2026-09-22T10:00:00Z`, `…10:05:00Z`);
  `demo decisions auto-skip: decisions — evaluated unnecessary (no decision candidates)`;
  planning START / `GATE(planning): green` / DONE;
  implementation START / `PART(1): abc1234 size=pure-module outcome=pass` / `GATE(implementation): green` / DONE;
  `demo review PHASE-START(review): 2026-09-22T10:40:00Z`;
  `demo review FINDINGS(code): c1 /tmp/craft-review.fixture/code.c1.json n=3`.
  → completed `[workspace, design, decisions, planning, implementation]`; inFlight
  `[{review, 2026-09-22T10:40:00Z}]`; next `refactoring`; steer list `review`.
- `design-revision.md` — RESOLVE/AWAITING as above; workspace START/DONE; design START/DONE;
  decisions START/DONE; `demo design PHASE-START(design): 2026-09-22T10:30:00Z`.
  → completed `[workspace, decisions]`; inFlight `[{design, …10:30:00Z}]`; next `planning`;
  steer list `design`.
- `parallel.md` — RESOLVE/AWAITING; START/DONE for workspace…refactoring (decisions via
  `auto-skip:`); `PHASE-START(validation): 2026-09-22T11:00:00Z`, then
  `PHASE-START(documentation): 2026-09-22T11:02:00Z`.
  → inFlight `[validation, documentation]`; next `propose`; steer list `validation, documentation`.
- `resolve-only.md` — the RESOLVE and AWAITING lines only. → completed `[]`, inFlight `[]`, next
  `workspace`; steer list `none recorded`.
- `mixed-runs.md` — interleaves `other` lines
  (`other resolve AWAITING(propose): none`, `other design PHASE-START(design): 2026-09-21T09:00:00Z`,
  `other planning PHASE-START(planning): 2026-09-21T09:30:00Z`) with `demo` lines
  (RESOLVE; AWAITING validation; workspace and design START/DONE;
  `demo decisions PHASE-START(decisions): 2026-09-22T10:15:00Z`).
  → for demo: completed `[workspace, design]`, inFlight `[decisions]`, next `planning`, awaiting
  `[validation]` (other's `none` ignored); steer list exactly `decisions`.
- `mid-validation.md` (survival) — `demo resolve AWAITING(propose): validation, architecture`;
  START/DONE for workspace…review (decisions `auto-skip:`; `GATE(review): green`); refactoring START,
  `NO-OP(refactoring): nothing cleared the bar`, DONE;
  `demo validation PHASE-START(validation): 2026-09-22T11:00:00Z`;
  `demo validation HARNESS-BG(validation:sample-technique): pid=4242 out=/tmp/craft-validation.fixture/out spec=/tmp/craft-validation.fixture/spec`;
  `demo architecture auto-skip: architecture — evaluated unnecessary (no boundary change)`;
  `demo documentation PHASE-START(documentation): 2026-09-22T11:02:00Z`.
  → with the enable-architecture resolution: completed ends with `…, refactoring, architecture`;
  inFlight `[validation, documentation]`; next `propose`; awaitingHarnesses `[validation]`; one
  background entry `{ phase: 'validation', technique: 'sample-technique', pid: 4242, out: …, spec: … }`.

### `CompactionEstimate` and `compactionEstimate` (Parts 6, 7)

- The adapter emits `{ run, sourceKind: 'main' | 'subagent', cacheRead, input: [lo, hi], output: [lo, hi], summaryMissing }`.
  It carries no path, no text and no summary content. The constants live in the Claude adapter,
  never in the core:
  - `input` = `[3000, 5500]`
  - `cacheRead` = `preTokens` (non-finite → 0)
  - `t` = `Math.ceil(summaryChars / 4)`
  - `output` = `[Math.round(1.2 * t), Math.round(2.8 * t)]`
  - with no summary: `output = [1300, 2600]` and `summaryMissing: true`
  - A2 check #1 (preTokens 24715, 3380 chars): output `[1014, 2366]`; #2 (24707, 4906 chars):
    `t = 1227`, output `[1472, 3436]`
- Core `runs[*].compactionEstimate` = `{ count, main, subagent, input: [Σlo, Σhi], cacheRead: Σ, output: [Σlo, Σhi], equiv: [lo, hi], basis: 'estimate' }`,
  where `equiv[i] = Math.round(input[i]·EQUIV_WEIGHT_INPUT + cacheRead·EQUIV_WEIGHT_CACHE_READ + output[i]·EQUIV_WEIGHT_OUTPUT)`
  (weights 1 / 0.1 / 5, imported from `metrics-line.js`). Worked check #1 gives
  `equiv [10542, 19802]`, which contains the measured 12.4k; #2 gives `[12831, 25151]`, which
  contains 18.1k. The key is omitted when the run has no compaction. Compactions whose `run` has no
  events are ignored. Groups, recommendations, drift and baselines never read it.
- Markdown, one line per run that has the key, placed right after that run's group lines:
  `Compactions: <count> (main <main>, sub-agent <subagent>) — estimated summary-call cost <lo>k–<hi>k equiv (estimate; not in totals)`,
  with `<lo>`/`<hi>` = `Math.round(equiv/1000)`. Check #1 alone renders
  `Compactions: 1 (main 1, sub-agent 0) — estimated summary-call cost 11k–20k equiv (estimate; not in totals)`.

## Post-merge / validation-phase manual item — live smoke (not a part, not CI)

This is the design's on-demand live smoke. Run it in a throwaway session with
`--settings '{"autoCompactWindow":100000}'` and the plugin installed (not as a settings hook).
`run-ledger.sh open` a run, then fill context until compaction. Record in the poc-record:

- the plugin-registered `SessionStart[compact]` fired, and its block reached the model (nonce);
- the transcript binding held;
- a sub-agent compaction received the guard;
- each `isCompactSummary` line: the main summary keeps the run-id, the ledger path and the in-flight
  phase; a sub-agent summary keeps its task and no ledger path;
- a manual `/compact` is steered too.

This closes three unpinned assumptions: plugin vs settings hook parity, key-in-transcript on a real
main session, and which paragraph the summariser picks. Validation phase or post-merge, operator-run.
It is never gated.

## Part 1 — `scripts/run-ledger.sh` + shared run-repo test helper (+ README corpus counts)

### Context

- **Creates or edits (4):**
  - `scripts/run-ledger.sh` — new; mode 100755
  - `test/run-ledger.test.js` — new
  - `test/helpers/craft-run.js` — new shared helper; Parts 2 and 5 reuse it
  - `README.md` — corpus counts only
- **Contract.** Implement the "scripts/run-ledger.sh" block of Shared contracts exactly: verbs,
  exit codes, pointer format, sweep, newest-key rule, `-f` not `-r` in locate. Every non-zero exit
  writes one reason line to stderr.
- **First commit, README only.** In `README.md`, lines 180-181 read `[30 design docs]`,
  `[29 parted plans]`, `[371 ADRs]`. Set them to **31 / 30 / 382** (the tree holds 31 design docs;
  30 plans once this plan is committed; 382 ADRs). This clears the readme-drift red named in
  Baseline. Commit it on its own before the script, with the first message under Commit. Run
  `node engine/bin/readme-drift.js` to confirm it prints nothing.
- **Style precedents (read-only):**
  - scripts/worktree-setup.sh: header comment block with usage, `set -euo pipefail`, script dir via
    `BASH_SOURCE`
  - scripts/docs-structure-lint.sh: bash 3.2 empty-array idiom
  - Structure the script as one function per verb, plus `resolve_main`, `pointer_path`,
    `read_pointer` (sets `key` and `ledger` from the pointer line) and `usage_exit`. The
    `case "$1"` dispatch comes last. Functions stay ≤ 20 lines, nesting ≤ 2 (early returns).
- **Test precedents (read-only):**
  - test/emit-metrics-script.test.js: spawn `bash SCRIPT`, capture `{ status, stdout, stderr }`
  - test/worktree.test.js `mkWorktreeNoRemote`: `git init -q`, commit with
    `-c user.email/-c user.name`, `git worktree add`
  - test/helpers/tmp-git-repo.js: the realpath caveat
- **Helper API** (CommonJS, in `test/helpers/craft-run.js`):
  - `LEDGER_SCRIPT` — absolute path to the script
  - `LEDGER_HEADER` — `'# craft run record (append-only)'`
  - `createRunRepo()` → `{ parent, main, cleanup }`. `parent` = realpath(mkdtemp 'craft-run-'),
    `main` = parent/repo, `git init -q` plus one empty commit.
  - `addWorktree(main, dirName = 'repo-demo', branch = 'feat/demo')` → the absolute sibling path
    `parent/<dirName>`.
  - `runLedger(cwd, args, input = '')` → `spawnSync('bash', [LEDGER_SCRIPT, ...args], { cwd, input, encoding: 'utf8' })`,
    mapped to `{ status, stdout, stderr }`.
  - `writeTranscript(dir, texts)` → writes one JSONL line per text:
    `{"type":"user","message":{"content":[{"type":"tool_result","content":<text>}]}}`. Returns the
    path. This mimics how a Bash call's stdout lands in the transcript.
  - `bindRun({ runId = 'demo', ledgerLines = [], worktree = true })` → `createRunRepo`; `open`
    (with `--in-place` when `worktree` is false); if `worktree`, `addWorktree` + `move`. It appends
    `ledgerLines` to the ledger with `fs.appendFileSync` — test setup emulating an existing ledger,
    not the production write path. It writes a transcript holding `open`'s stdout. Returns
    `{ parent, main, worktree, ledgerPath, runKey, transcriptPath, cleanup }`.
- **Environment.** git ≥ 2.31 (`--path-format`); this box runs 2.55 and macOS /bin/bash 3.2.
  .claude/* is gitignored in this repo, so .claude/craft-runs/ needs no .gitignore change
  (ADR-301 posture).
- Binding: no provenance references (no ADR/phase/part numbers) in the script, tests or helper
  comments. If a design statement is wrong against the code, STOP and hand back a blocker
  `{ part, reason, ≤3 options }` rather than silently deviating.

### TDD steps

1. **RED — open.**
   - `Given a fresh repo, when open demo runs from the checkout, then stdout is "<key> <scratch>" with key matching ^demo@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$, the scratch holds exactly the header line, and demo.pointer holds the same line`.
   - `Given open --in-place, then no scratch exists and the pointer names <main>/.claude/craft-run-record.md; an existing in-place ledger keeps its content and gains no second header`.
   - `Given demo already open, when open demo runs again, then stderr names the replacement and exactly one demo.pointer exists`.
   - `Given run-id Bad_Id, then exit 2`.
   - Fails: script missing (exit 127). **GREEN**: `resolve_main`, `open`, pointer write via
     temp file + `mv`.
2. **RED — append.**
   - `Given an open run, when append demo design runs from a subdirectory of a linked worktree with stdin "r1\n\nr2\n", then the scratch gains "demo design r1" then "demo design r2" and nothing for the blank line`.
   - `Given no pointer, then exit 1 with a stderr reason`.
   - `Given all-blank stdin, then exit 1`.
   - `Given the ledger file deleted, then exit 1 and the file is not recreated`.
   - **GREEN**: `append`.
3. **RED — move.**
   - `Given a scratch with two records and a worktree ledger already holding the header, when move demo <worktree> runs, then the worktree ledger holds one header then the two records in order, the scratch is gone, and the pointer names the worktree ledger with the unchanged run-key`.
   - `Given no worktree ledger, then move creates it with the header`.
   - `Given an --in-place run, then move exits 1`.
   - `Given a worktree path that does not exist, then exit 1`.
   - **GREEN**: `move`.
4. **RED — locate + sweep.**
   - `locate --transcript`, all through `bindRun`:
     - a transcript without the key → `''`, exit 0
     - with the key → `demo <ledger>`
     - from the main checkout and from the worktree → the same answer
     - two pointers written directly with keys `a@2026-01-01T00:00:00Z` and `b@2026-01-02T00:00:00Z`, both ledgers present, both keys in the transcript → `b <ledger-b>`; write the pointers directly, never `sleep`
     - a missing transcript file → `''`, exit 0
     - a non-git cwd → `''`, exit 0, **empty stderr**
     - the ledger deleted → `''`
   - `locate --run demo` → the pair.
   - `Given one pointer whose ledger is missing and one live pointer, when open runs for a third run-id, then the stale pointer is removed and the live one kept`.
   - **GREEN**: `locate`, the sweep inside `open`.
5. **RED — close, dir, usage, ignore posture.**
   - `close demo` removes the pointer, the scratch and a `demo.delta.json` the test created.
   - `dir` prints `<main>/.claude/craft-runs` from the checkout and from the worktree, and exits 1
     from a non-git cwd.
   - Exit 2 for: no verb, unknown verb, `locate` without a flag, `append` with a bad phase `Bad`.
   - `Given this repository, when git check-ignore -q .claude/craft-runs/demo.pointer runs at the repo root, then it exits 0`.
   - **GREEN**: `close`, `dir`, `usage_exit`.
6. **REFACTOR** — one function per verb; no function > 20 lines; no nesting > 2; named constants
   for the header and file suffixes; shellcheck clean.

### Gate

```bash
node --test test/run-ledger.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
shellcheck scripts/run-ledger.sh && echo shellcheck-ok
node engine/bin/readme-drift.js; echo "readme-drift exit $?"
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

`ci exit` must be 0. It cannot be 0 until DC-1 is settled (see Baseline); a red caused only by
`test/p22-memory.test.js` is a blocker to hand back, never a reason to commit.

### Commit

Two commits, in order:

1. `docs(readme): refresh the design, plan and ADR corpus counts`
2. `feat(scripts): add run-ledger.sh as the run ledger's one write and locate surface`

## Part 2 — Reorient hook + `hooks/bound-run.sh` + `SessionStart` registration

### Context

- **Creates or edits (5):**
  - `hooks/bound-run.sh` — new; sourced helper
  - `hooks/reorient-after-compact.sh` — new; mode 100755
  - `hooks/hooks.json`
  - `test/hooks.test.js`
  - `test/craft-root-shim.test.js`
- **Contracts.** Implement the "Hook outputs" block of Shared contracts: `bound_run`, `never_block`
  and the reorient text byte-for-byte. The fixed text contains backticks and `§`: build it with
  single-quoted `printf` format pieces, never `echo -e`.
- **Registration.** Today the hooks file holds one `PreToolUse` entry (`matcher: "Bash"`, command
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh`). Add beside it:
  `"SessionStart": [{ "matcher": "compact", "hooks": [{ "type": "command", "command": "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/reorient-after-compact.sh" }] }]`.
  Its shim count goes **1 → 2**.
- **Shim test.** Update the `hooks/hooks.json` row of `TARGET_FILES` to `count: 2`. Replace the
  header comment ("Pinned counts (grep -rc … before rewrite) — 34 total across 15 files") with a
  count-free sentence ("Per-file pinned counts of shimmed invocations — kept per-file so a miscount
  on any single file fails loud"), since later parts move several rows.
- **Existing hooks test** (the file above): `runHook(hookName, fixtureName)` reads JSON fixtures
  from test/fixtures/hooks/ through `execFileSync` and exposes stderr only on failure. Leave it and
  the git-no-ext-diff matrix untouched, and add beside it:
  - `runHookWithPayload(hookName, payload, envOverrides = {})`: `spawnSync('/bin/bash', [hookPath], { input: JSON.stringify(payload), encoding: 'utf8', env })`,
    where `env` = a copy of `process.env` **with `CLAUDE_PROJECT_DIR` deleted** (tests may run
    inside a Claude session that sets it) plus `envOverrides`. Returns `{ status, stdout, stderr }`.
  - `const COMPACTION_HOOKS = ['reorient-after-compact.sh']` — Part 5 appends the steer hook, so
    the no-op table runs against both.
  - The payload shape: `{ session_id: 'sess-fixture', transcript_path, cwd, hook_event_name: 'SessionStart', source: 'compact' }`.
- **Helper (read-only, from Part 1).** test/helpers/craft-run.js provides `bindRun`,
  `createRunRepo`, `writeTranscript` and `LEDGER_HEADER`.
- **Script precedent (read-only).** hooks/git-no-ext-diff.sh (`#!/bin/bash`, `set -euo pipefail`,
  `jq -r`). The sourced-helper precedent is scripts/worktree-setup.sh, which sources
  scripts/detect-ecosystem.sh under a `# shellcheck source=` line.
- Binding: no provenance references (no ADR/phase/part numbers) in hook scripts, the helper or test
  comments. If a design statement is wrong against the code, STOP and hand back a blocker
  `{ part, reason, ≤3 options }` rather than silently deviating.

### TDD steps

1. **RED — registration.**
   - `Given hooks/hooks.json, when parsed, then SessionStart[0].matcher is "compact" and its command is the shimmed reorient path, which resolves under the repo to an existing file with an executable bit`.
   - `…then PreToolUse is unchanged`.
   - Shim row `hooks/hooks.json` = 2.
   - Fails: `SessionStart` undefined. **GREEN**: the `hooks.json` entry, plus an executable stub
     that sources the helper and exits 0.
2. **RED — silent no-op table** (over `COMPACTION_HOOKS`). Each case yields stdout `''` and
   status 0:
   - non-git cwd
   - git repo with no `.claude/craft-runs/`
   - unbound pointer (the transcript lacks the key)
   - torn-down ledger (ledger file deleted)
   - payload without `transcript_path`
   - `transcript_path` naming a missing file

   Plus: `Given PATH set to an empty temp dir, then stdout '', status 0, and stderr is exactly one line mentioning jq`.
   Fails on whichever case the stub mishandles once `bound_run` is wired. **GREEN**: `bound_run`.
3. **RED — never block.** `Given a bound run whose ledger is chmod 000 (skip when process.getuid() === 0), then stdout '', status 0, and stderr is one line matching ^craft reorient-after-compact: failed \(exit \d+\)$`.
   **GREEN**: `never_block`, called first.
4. **RED — reorient block.** Build with `bindRun({ ledgerLines })`: `demo resolve RESOLVE: --profile lean`,
   `demo resolve AWAITING(propose): validation`, `demo design PHASE-START(design): 2026-09-22T10:05:00Z`,
   and one `other design PHASE-START(design): 2026-09-21T09:00:00Z`. The payload cwd is the
   **worktree**. Assert:
   - the first line starts `craft reorient — if you are not the craft orchestrator driving run demo`
   - a line `Ledger: <ledgerPath>`
   - a line containing `node <repo-root>/engine/bin/run-state.js <ledgerPath> --run demo`, where
     `<repo-root>` is `fs.realpathSync` of this checkout (the hook uses `pwd -P`)
   - the tail contains `demo resolve RESOLVE: --profile lean` **verbatim** (the fixed text alone
     already contains `RESOLVE:`)
   - no line starting `other `
   - the header `Ledger tail (last 3 of 3 lines of run demo):`

   Plus: `Given a payload without cwd and CLAUDE_PROJECT_DIR set to the worktree, then the same block is printed`.
   **GREEN**: the tail `awk` and the single `printf`.
5. **RED — bound.** `Given 500 demo lines of 1,000 characters each, then output length ≤ 8000, the header reads "last 30 of 500", and every tail line is ≤ 200 characters`.
   **GREEN**: the tail cap and the per-line cut, if step 4 did not already hold them.
6. **REFACTOR** — the helper stays generic (no reorient text in it); hook functions ≤ 20 lines;
   named constants for the 30 / 200 caps; shellcheck clean.

### Gate

```bash
node --test test/hooks.test.js test/craft-root-shim.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
shellcheck hooks/*.sh && echo shellcheck-ok
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(hooks): reorient the session after a compaction from the bound run ledger`

## Part 3 — `run-state` pure derivation + shared ledger fixtures

### Context

- **Creates (3 spans):**
  - `engine/src/run-state.js` — new; ESM
  - `engine/test/run-state.test.js` — new
  - `engine/test/fixtures/run-ledger/` — new directory with the six fixture ledgers named in
    Shared contracts: mid-review.md, design-revision.md, parallel.md, resolve-only.md,
    mixed-runs.md, mid-validation.md. Their exact lines are listed there.
- **Contracts.** The "Ledger line and tokens" and "run-state" blocks of Shared contracts. Export
  only `deriveRunState(lines, runId, resolution)`; it is internal, with no entry in the
  engine/src/index.js barrel. It is pure: no I/O, no clock, no `process`.
- **Reuse (read-only).** `autoSkipPhasesInText(text)` from
  engine/src/observability/skip-signals.js returns the phase ids named by every `auto-skip:` marker
  in `text`; apply it to each record. The Resolution shape comes from `node engine/bin/pipeline-resolve.js pipeline/default.yml engine/test/fixtures/manifests/enable-architecture.yml`:
  - `effective[]` is objects with an `id`
  - `gateDecisions[]` is an ARRAY of `{ phaseId, gate, codeProducing }`, and only the
    `phaseId: 'propose'` entry carries `awaitingHarnesses` (built in engine/src/gates.js
    `buildProposeDecision`)
- **Test-side resolution builder.** `makeResolution(ids, awaiting)` →
  `{ effective: ids.map(id => ({ id })), gateDecisions: [{ phaseId: 'propose', awaitingHarnesses: awaiting }] }`.
  It lives in the test. `DEFAULT_IDS` and `ARCHITECTURE_IDS` are the two id lists in Shared
  contracts. Fixtures are read with `readFileSync(join(__dir, 'fixtures', 'run-ledger', name), 'utf8').split('\n')`.
- **Code shape.** A `parseRecord(line)` → `{ runId, phase, record }` helper; one small matcher per
  token; a fold that builds `lastEvent` per phase (a `Map`), `since` per phase, the release set,
  parts, findings, background and warnings; then projection over `effective` order. Every function
  ≤ 20 lines; named regex constants; immutable returns. Class A: no technique names in comments or
  identifiers.
- Binding: no provenance references in source or test. engine/test/source-hygiene.test.js rejects
  `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` anywhere in engine/src, so no `P3`-style labels
  and no identifiers like `p1`. If a design statement is wrong against the code, STOP and hand back a
  blocker `{ part, reason, ≤3 options }` rather than silently deviating.

### TDD steps

1. **RED — mid-review.** `Given mid-review.md and the default resolution, when deriveRunState runs for demo, then completed, inFlight and next are the fixture's expected values`.
   Fails: module missing. **GREEN**: parse, last-event fold, effective-order projection, `next`.
2. **RED — revision + parallel.**
   - `Given design-revision.md, then design is in flight (since 10:30) and absent from completed`
     — last event wins.
   - `Given parallel.md, then inFlight lists validation then documentation and next is propose`.
   - **GREEN**: `since` from the last START.
3. **RED — release matrix → awaitingHarnesses.** Inline ledgers over AWAITING `validation`:
   - released → `[]`: `auto-skip: validation — …`; exact `NO-OP(validation): …`;
     `GATE(validation): green`
   - not released → `['validation']`: `NO-OP(validation:sample-technique): …`; `NO-OP(verify): …`;
     `GATE(validation): green` followed by `GATE(validation): red`
   - **GREEN**: the release set and the AWAITING-minus-released projection.
4. **RED — mismatch + isolation.**
   - `Given AWAITING validation and a resolution awaiting validation, architecture, then kind is awaiting-mismatch with both sets`.
   - `Given the same sets in a different order, then kind is state`.
   - `Given no AWAITING line and a non-empty resolved set, then kind is awaiting-mismatch with ledger null`.
   - `…and an empty resolved set, then kind is state with the "no AWAITING(propose) line" warning`.
   - `Given mixed-runs.md, then only demo's lines count` — demo's expected values; other's
     `AWAITING … none` and open phases are ignored.
   - **GREEN**: the set comparison and the run-id filter.
5. **RED — parts, findings, background, warnings, survival.**
   - `mid-review.md` → `parts` `[{ n: 1, sha: 'abc1234', size: 'pure-module', outcome: 'pass' }]`
     and `findings` `[{ dimension: 'code', cycle: 1, path: '/tmp/craft-review.fixture/code.c1.json', count: 3 }]`.
   - A second `PART(1)` line with `outcome=blocked` → the last one wins.
   - `FINDINGS(code): c1 /tmp/a b.json n=2` (path with a space) → one warning, no entry.
   - `PHASE-START(bench): …` with `bench` absent from effective → one warning, not in inFlight.
   - `Given mid-validation.md and the architecture resolution, then next is propose, awaitingHarnesses is ['validation'], and background holds the one pid-4242 entry with pid as a number`.
   - **GREEN**: the token matchers and warnings.
6. **REFACTOR** — the matchers in a table (`{ prefix, regex, apply }`) if it removes duplication;
   no function > 20 lines; coverage check below ≥ 80% lines and branches for
   `engine/src/run-state.js`.

### Gate

```bash
(cd engine && node --test test/run-state.test.js) 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
(cd engine && node --test --experimental-test-coverage test/run-state.test.js 2>&1 | grep -E 'run-state\.js|^# (pass|fail)')
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(engine): derive run state from the ledger for a rebuild after compaction`

## Part 4 — `run-state` main + bin

### Context

- **Creates (4):**
  - `engine/src/run-state-main.js` — new; `export function main(argv, io)`, where
    `io = { stdout, stderr, readStdin }`
  - `engine/bin/run-state.js` — new; mode 100755
  - `engine/test/run-state-main.test.js` — new
  - `engine/test/run-state.bin.test.js` — new
- **Contract.** The bin paragraph of the "run-state" block in Shared contracts: argv, stdout
  format, exit codes 0/1/2, the stderr mismatch line. `main` reads the ledger with `readFileSync`
  (split on `\n`), parses stdin JSON, calls `deriveRunState` (from Part 3's engine/src/run-state.js)
  and maps the result kind to an exit code. It is internal, with no barrel entry.
- **Bin shape (read-only precedents).** engine/bin/filter-findings.js: a shebang, then
  `import { main }`, then the `process.argv[1] === fileURLToPath(import.meta.url)` guard, then
  `process.exit(main(process.argv.slice(2), { stdout, stderr, readStdin: () => readFileSync(0, 'utf8') }))`.
  The arg-parsing and `fail` style follows engine/src/filter-findings-main.js (`--flag value`
  extraction, the positional remainder, `fail(message, io)` returning the exit code).
- **Test precedents (read-only).**
  - engine/test/filter-findings-main.test.js: in-process `main` with
    `makeCaptureIo()` from engine/test-helpers/capture-io.js, `io.readStdin` injected, temp files via
    `mkdtempSync` with `after` cleanup. In-process tests never read fd 0.
  - engine/test/pipeline-resolve.bin.test.js: `spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8' })`.
- **Survival acceptance input.** Real `node engine/bin/pipeline-resolve.js <repo>/pipeline/default.yml engine/test/fixtures/manifests/enable-architecture.yml`
  stdout, passed as `input` to the run-state bin with Part 3's fixture mid-validation.md.
- Binding: no provenance references (the engine/src regex in Conventions applies). If a design
  statement is wrong against the code, STOP and hand back a blocker `{ part, reason, ≤3 options }`
  rather than silently deviating.

### TDD steps

1. **RED — happy path.** `Given mid-review.md and a default resolution on readStdin, when main runs with [ledger, '--run', 'demo'], then it returns 0 and stdout is the JSON of the expected state with 2-space indent and a trailing newline`.
   Also `--run demo` placed before the ledger path. Fails: module missing. **GREEN**: `main`.
2. **RED — mismatch.** `Given AWAITING validation and a resolution awaiting validation, architecture, then main returns 1, stdout is empty, and stderr names both sets`;
   plus the `absent` rendering for a ledger with no AWAITING line. **GREEN**: the mismatch branch.
3. **RED — exit 2.** Each case returns 2 with one stderr line and empty stdout:
   - missing ledger file
   - stdin `not json`
   - stdin `{}` (no `effective` array)
   - no `--run`
   - `--run` without a value
   - no ledger path
   - an unknown flag `--x`
   - a surplus positional argument

   **GREEN**: argument parsing and input validation.
4. **RED — bin + survival acceptance.** `Given pipeline-resolve's real output for default.yml with enable-architecture.yml piped into the run-state bin with mid-validation.md, then exit 0, next is "propose", awaitingHarnesses is ["validation"], and background has one entry`;
   plus `Given a missing ledger, the bin exits 2`. Fails: bin missing. **GREEN**: the bin.
5. **REFACTOR** — `main` ≤ 20 lines, delegating to `parseArgs`, `readInputs` and `render`; named
   exit-code constants; coverage ≥ 80% for `engine/src/run-state-main.js`.

### Gate

```bash
(cd engine && node --test test/run-state-main.test.js test/run-state.bin.test.js test/run-state.test.js) 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
(cd engine && node --test --experimental-test-coverage test/run-state-main.test.js 2>&1 | grep -E 'run-state-main\.js|^# (pass|fail)')
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(engine): add the run-state bin that checks the ledger against a re-resolved pipeline`

## Part 5 — Steer hook + `PreCompact` registration

### Context

- **Creates or edits (4):**
  - `hooks/steer-compact-summary.sh` — new; mode 100755
  - `hooks/hooks.json`
  - `test/hooks.test.js`
  - `test/craft-root-shim.test.js`
- **Contract.** The steer bullet of "Hook outputs" in Shared contracts: the `awk` rule and the
  four-line text byte-for-byte. It sources the helper Part 2 created (hooks/bound-run.sh,
  read-only here) and calls `never_block steer-compact-summary` first.
- **Registration.** Add
  `"PreCompact": [{ "matcher": "", "hooks": [{ "type": "command", "command": "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/steer-compact-summary.sh" }] }]`.
  The empty matcher is the only one pinned to fire on both the auto and the manual trigger. The
  `hooks/hooks.json` shim row goes **2 → 3**.
- **Hooks test.** Append `'steer-compact-summary.sh'` to `COMPACTION_HOOKS` (Part 2), so the whole
  no-op table and the missing-`jq` and unreadable-ledger cases run against both hooks. The
  unreadable-ledger stderr line names the hook: `craft steer-compact-summary: failed (exit N)`.
  Steer payload: `{ session_id: 'sess-fixture', transcript_path, cwd, hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null }`.
- **Shared fixtures (read-only, from Part 3).** The engine/test/fixtures/run-ledger/ directory,
  read from the process suite as `path.join(__dirname, '..', 'engine', 'test', 'fixtures', 'run-ledger', name)`.
  Feed each file's lines **minus its header and blank lines** to `bindRun({ ledgerLines })`
  (test/helpers/craft-run.js, from Part 1). Expected lists per fixture are in Shared contracts. The `awk` rule and `run-state`
  thus see identical inputs.
- `awk` portability: macOS runs BSD awk. Use `index()`, `substr()` and `sub()`, never
  `match(s, re, arr)`. `$3` is the token (for example `PHASE-START(review):`).
- Binding: no provenance references in the hook or test comments. If a design statement is wrong
  against the code, STOP and hand back a blocker `{ part, reason, ≤3 options }` rather than silently
  deviating.

### TDD steps

1. **RED — registration.** `Given hooks/hooks.json, when parsed, then PreCompact[0].matcher is "" and its command is the shimmed steer path to an existing executable`;
   shim row = 3. Fails: `PreCompact` undefined. **GREEN**: the entry plus an executable stub.
2. **RED — no-op table over both hooks.** `COMPACTION_HOOKS` gains the steer hook. Every Part 2
   case (six silent cases, missing `jq`, the chmod-000 ledger) now also runs for steer. **GREEN**:
   source the helper, `never_block`, `bound_run`.
3. **RED — steer note, mid-review, from a worktree cwd.** Assert:
   - the first line starts `craft compaction note: craft run demo`
   - the orchestrator paragraph (the line starting `If it is the craft orchestrator's`) comes
     before the sub-agent one (`If it is a craft sub-agent's`)
   - the orchestrator paragraph contains `run-id demo;`, `ledger <ledgerPath>;` and
     `phase(s) in flight: review;`
   - the sub-agent paragraph does not contain `<ledgerPath>`
   - the last line is `If neither, ignore this note.`

   **GREEN**: the `awk` pass and the single `printf`.
4. **RED — in-flight matrix on the shared fixtures.** `phase(s) in flight: <list>;` is exactly:
   - design-revision.md → `design`
   - parallel.md → `validation, documentation`
   - resolve-only.md → `none recorded`
   - mixed-runs.md → `decisions` (other's `design`/`planning` are not listed)

   **GREEN**: the first-seen order, the last-event-wins rule and the empty-list wording.
5. **RED — bound.** `Given 500 demo lines of 1,000 characters plus 40 demo PHASE-START lines with 30-character phase names, then output length ≤ 2000 and the in-flight list is cut to 200 characters`.
   **GREEN**: the list cap.
6. **REFACTOR** — the `awk` program in one named variable; named constants for the caps; shellcheck
   clean.

### Gate

```bash
node --test test/hooks.test.js test/craft-root-shim.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
shellcheck hooks/*.sh && echo shellcheck-ok
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(hooks): steer the compaction summary to keep the bound run's anchors`

## Part 6 — Claude adapter: compaction detection + estimate

### Context

- **Creates or edits (4):**
  - `engine/src/observability/adapters/claude/telemetry.js`
  - `engine/test/telemetry-claude.test.js`
  - `engine/test/fixtures/telemetry/compaction-main.jsonl` — new
  - `engine/test/fixtures/telemetry/compaction-subagent.jsonl` — new
- **Current code.** `parseLines(lines, since = null, context = null)` (around line 237) returns
  `{ events, skipped, markers, unlabelled }`. Loop order per line:
  1. trim/skip blank
  2. JSON.parse (malformed lines count toward `skipped`)
  3. the `since` filter (`parsed.timestamp < since` → continue)
  4. the main-loop `auto-skip:` marker scan
  5. `usage == null` → continue
  6. the synthetic-model skip
  7. the `includeInline === false` main-loop skip
  8. the usage fold

  `isSubagent = context?.sourceKind === 'subagent'`.
- **Change.** Add compaction detection **right after the `since` filter** (step 3), before the
  marker scan and before the `includeInline` skip, so `--since` applies to the boundary's own
  timestamp and `--no-inline` never touches compactions:
  - Boundary: `type === 'system' && subtype === 'compact_boundary'`. It opens a pending
    `{ run: parsed.sessionId ?? null, sourceKind: isSubagent ? 'subagent' : 'main', cacheRead: preTokens }`
    from `compactMetadata.preTokens`; a non-finite value becomes 0. If a pending compaction is
    already open, close it first as summary-missing.
  - Summary: `isCompactSummary === true`, with `message.content` a string. It closes the pending
    compaction with `summaryChars = content.length`. A non-string content closes it as
    summary-missing. With nothing pending, the line is ignored.
  - At the end of the stream a still-open compaction closes as summary-missing.
  - The return becomes `{ events, skipped, markers, unlabelled, compactions }`; update the JSDoc
    `@returns`.
- **Estimate shape and constants.** The "CompactionEstimate" block of Shared contracts:
  `SUMMARY_INPUT_TOKENS = [3000, 5500]`, `SUMMARY_OUTPUT_MULTIPLIERS = [1.2, 2.8]`,
  `SUMMARY_OUTPUT_FALLBACK = [1300, 2600]`, `CHARS_PER_TOKEN = 4`. These are vendor-specific named
  constants in this adapter; the core never sees `preTokens` or `summaryChars`.
  - Keep `parseLines` from growing: pure helpers `isCompactBoundary(parsed)`,
    `isCompactSummary(parsed)`, `openCompaction(parsed, sourceKind)`,
    `estimateCompaction(pending, summaryChars)` and `estimateWithoutSummary(pending)`, plus one
    `pending` local.
  - Other bindings are untouched: they return no `compactions`, and Part 7's front door defaults it
    with `?? []`.
- **Fixtures** (synthetic and anonymised: sessionId `sess-compact`, slug `compaction-fixture`, no
  paths, no real ids; the summary text is ASCII filler generated once in a `mktemp` scratch and never
  committed as a script).
  - compaction-main.jsonl, in order:
    1. an assistant usage line (`message.id` `msg-1`, ts `2026-03-01T09:59:00.000Z`)
    2. a boundary (ts `2026-03-01T10:00:00.000Z`,
       `compactMetadata { trigger: 'auto', preTokens: 24715, postTokens: 4100, cumulativeDroppedTokens: 0, durationMs: 31000, preservedMessages: 0, preservedSegment: null }`)
    3. two `{ type: 'attachment' }` lines with no usage
    4. a summary (`type: 'user'`, `isCompactSummary: true`, `message.content` exactly 3380 chars)
    5. an assistant usage line `msg-2`
    6. a second boundary (ts `2026-03-01T11:00:00.000Z`, preTokens 24707)
    7. two attachments
    8. a summary of exactly 4906 chars
    9. an assistant usage line `msg-3`
  - compaction-subagent.jsonl: the same sessionId, `agentId: 'agent-fixture'`, `isSidechain: true`;
    one usage line, one boundary (preTokens 30000), one summary of 2000 chars → output `[600, 1400]`.
- **Test precedents (read-only).** The file's existing `fixtureLines(name)` and
  `asyncLines(lines)` helpers, and its sub-agent context form
  `{ sourceKind: 'subagent', agentType: 'craft:planner', spawnId: 0 }`.
- Binding: no provenance references. engine/src is scanned for `/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`,
  so do not cite the design's `P3`/`Q7` labels in comments. If a design statement is wrong against
  the code, STOP and hand back a blocker `{ part, reason, ≤3 options }` rather than silently
  deviating.

### TDD steps

1. **RED — two estimates.** `Given compaction-main.jsonl, when parseLines runs, then compactions holds two main estimates with cacheRead 24715 and 24707, input [3000, 5500] each, outputs [1014, 2366] and [1472, 3436], and summaryMissing false`.
   Fails: `compactions` undefined. **GREEN**: the detection and estimate helpers.
2. **RED — no usage leak.** `Given compaction-main.jsonl, when parsed whole and parsed with its boundary, attachment and summary lines stripped, then the two events arrays are deep-equal and have three events`.
   It is expected to already pass; if it does, keep it as the regression guard and say so in the
   hand-back. **GREEN**: n/a, or fix the leak it exposes.
3. **RED — missing summary.** Inline lines:
   - `Given a boundary with no summary after it, then one estimate with summaryMissing true and output [1300, 2600]`.
   - `Given two boundaries before one summary, then the first closes as summary-missing and the second takes the summary`.
   - **GREEN**: the close-on-reopen rule and the end-of-stream close.
4. **RED — since, sub-agent, inline flag.**
   - `Given since 2026-03-01T10:30:00.000Z, then only the second boundary's estimate remains`.
   - `Given compaction-subagent.jsonl with a sub-agent context, then sourceKind is subagent and output is [600, 1400]`.
   - `Given includeInline false, then events drop the main-loop usage but compactions still holds both`.
   - **GREEN**: move the detection if any of these fail.
5. **REFACTOR** — `parseLines` gains at most a handful of lines; every new helper ≤ 20 lines;
   coverage ≥ 80% for the adapter file.

### Gate

```bash
(cd engine && node --test test/telemetry-claude.test.js test/telemetry-claude-discovery.test.js) 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
(cd engine && node --test --experimental-test-coverage test/telemetry-claude.test.js 2>&1 | grep -E 'claude/telemetry\.js|telemetry\.js|^# (pass|fail)')
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(telemetry): detect compaction boundaries and estimate their summary cost`

## Part 7 — Core `compactionEstimate` + miner threading + telemetry spec

### Context

- **Edits (6):**
  - `engine/src/observability/usage-aggregate.js`
  - `engine/src/observability/metrics-line.js`
  - `engine/test/usage-aggregate.test.js`
  - `engine/src/observability/usage-mine-main.js`
  - `engine/test/usage-mine-main.test.js`
  - `docs/contributing/specs/telemetry.md`
- **metrics-line** (the file above): lines 25-28 hold the module-private `EQUIV_WEIGHT_INPUT = 1`,
  `EQUIV_WEIGHT_CACHE_READ = 0.1`, `EQUIV_WEIGHT_CACHE_CREATION = 1.25` and
  `EQUIV_WEIGHT_OUTPUT = 5`. Change them to `export const` (internal exports, no barrel). The
  module still imports nothing.
- **Core** (the aggregate file above):
  - `aggregate(events, priceTable, baselineReport, threshold = DEFAULT_DRIFT_THRESHOLD, skipMarkers = [])`
    (around line 521) gains a trailing `compactions = []`.
  - The runs loop builds each `run` through `buildRunData(runId, slug, runEvents, priceTable)`.
    Group the compactions by `run` once (a `Map`), then push
    `estimate ? { ...run, compactionEstimate: estimate } : run` — no mutation.
  - `renderMarkdown(report)` (around line 570) adds the one line right after a run's group lines.
    Import the three weights from ./metrics-line.js. That import is not an adapter import, so
    rule R1 in test/architecture-boundaries.test.js stays green; the core must never import from
    ./adapters/.
  - Sum with `reduce`, never `Math.max(...spread)`. Keep the arithmetic NaN-safe.
  - Byte-identical report fixtures depend on the key being absent at count 0.
- **Front door** (the mine-main file above):
  - `streamTranscriptFiles(entries, transcriptDir, createReadStream, createInterface, containByRealpath, parseTranscriptLines, since = null, includeInline = true)`
    (around line 267) collects `compactions` (`?? []` per parse result; a `for…of` push, like
    `markers`) and returns it beside `events` and `markers`.
  - `main` (around line 481) destructures it and calls
    `aggregate(events, priceTable, baselineReport, threshold, markers, compactions)`.
- **Contract.** The "CompactionEstimate and compactionEstimate" block of Shared contracts:
  - key shape, the rounding, `basis: 'estimate'`, the Markdown wording
  - the worked-check numbers `[10542, 19802]` ∋ 12,400 and `[12831, 25151]` ∋ 18,100
- **Test precedents (read-only):**
  - engine/test/usage-aggregate.test.js: `makeEvent(overrides)` (run `run-1`) and `PRICE_TABLE`
  - engine/test/usage-mine-main.test.js:
    - `makeFixture({ lines })`, which writes projects-/project-slug/transcript.jsonl
    - `makeIo(overrides)`
    - `MAIN_USAGE_LINE` (sessionId `sess-aaa`)
    - `main(['--dir', transcriptDir], io)`, which writes report.json/report.md under the
      injected repo root
    - the existing `streamTranscriptFiles` test near line 221
- **Spec** (the telemetry spec above; its subjects glob is engine/src/observability/**):
  - "## Port interface": add a `compactions` bullet to the `collect` post: a path-free, text-free
    `CompactionEstimate[]`, Claude binding only, others none, defaulted to `[]` by the front door.
    Extend the `aggregate(...)` signature line with `skipMarkers?, compactions?`.
  - "## Claude binding": the boundary/summary detection and the estimate formula, including the
    fallback band.
  - "### Per run (`runs[*]`)": add the optional `compactionEstimate` key with its shape, "omitted
    when the run has no compaction", "never read by groups, totals, cost, drift or baselines",
    "schemaVersion stays 1 (additive)", and the Markdown line.
  - Class A/B: no technique names, no `gh`/`github`.
- Binding: no provenance references in source or tests (the engine/src regex in Conventions
  applies). If a design statement is wrong against the code, STOP and hand back a blocker
  `{ part, reason, ≤3 options }` rather than silently deviating.

### TDD steps

1. **RED — estimate + worked check.**
   - `Given one run-1 event and one main compaction for run-1 (cacheRead 24715, input [3000, 5500], output [1014, 2366]), when aggregate runs, then runs[0].compactionEstimate is { count: 1, main: 1, subagent: 0, input: [3000, 5500], cacheRead: 24715, output: [1014, 2366], equiv: [10542, 19802], basis: 'estimate' } and 12400 lies inside equiv`.
   - The same for the second worked check: `[12831, 25151]` ∋ 18100. Title the tests by their
     numbers ("the first worked check"), never by the spike's probe id.
   - `Given both on run-1 (the second as subagent), then count 2, main 1, subagent 1, and every band is the sum`.
   - Fails: key absent. **GREEN**: the weights export, the estimate fold, the attach.
2. **RED — isolation.**
   - `Given no compactions, then no run carries compactionEstimate`.
   - `Given compactions only for run-9, then run-1 carries none`.
   - `Given the same events with and without compactions, then the reports are deep-equal once compactionEstimate is removed from each run` — groups, cost, recommendations, drift with a
     baseline.
   - **GREEN**: omit at count 0, ignore unknown runs.
3. **RED — Markdown.** `Given the first worked check's report, then renderMarkdown has the exact line "Compactions: 1 (main 1, sub-agent 0) — estimated summary-call cost 11k–20k equiv (estimate; not in totals)" right after run-1's group line`;
   a report without the key has no `Compactions:` line. **GREEN**: the render line.
4. **RED — threading.**
   - `Given a parser stub returning no compactions field, when streamTranscriptFiles runs, then result.compactions deep-equals []`.
   - `Given the real Claude parseLines over a transcript holding a boundary and a summary, then result.compactions has one entry`.
   - **GREEN**: collect and return.
5. **RED — end to end.** `Given makeFixture with MAIN_USAGE_LINE plus a sess-aaa boundary and a summary line, when main runs, then report.json runs[0].compactionEstimate.count is 1 and report.md contains "(estimate; not in totals)"`.
   **GREEN**: pass `compactions` to `aggregate`.
6. **REFACTOR + spec.** New helpers ≤ 20 lines; named `THOUSAND`/rounding helpers. Then write the
   three telemetry-spec additions above; the prose lands after the code it names. Coverage ≥ 80%
   for both source files.

### Gate

```bash
(cd engine && node --test test/usage-aggregate.test.js test/usage-mine-main.test.js test/metrics-line.test.js test/telemetry-claude.test.js) 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
(cd engine && node --test --experimental-test-coverage test/usage-aggregate.test.js test/usage-mine-main.test.js 2>&1 | grep -E 'usage-aggregate\.js|usage-mine-main\.js|^# (pass|fail)')
node --test test/architecture-boundaries.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`feat(telemetry): report an estimated compaction cost per run outside the totals`

## Part 8 — Run skill + run-record spec + integrate delta file

### Context

- **Edits (5):**
  - `skills/run/SKILL.md` — 551 lines. Read it by heading range, never whole.
  - `docs/contributing/specs/run-record.md`
  - `skills/integrate/SKILL.md`
  - `test/run-record.test.js`
  - `test/craft-root-shim.test.js`
- **Names this part may cite** (all landed by Parts 1–5):
  - scripts/run-ledger.sh (verbs and exit codes in Shared contracts)
  - engine/bin/run-state.js
  - hooks/reorient-after-compact.sh and hooks/steer-compact-summary.sh
- **Shim budget, exact.** The run skill gains **2** shimmed occurrences (**6 → 8**) and integrate
  gains **1** (**1 → 2**). Update both `TARGET_FILES` rows.
  - The only two new run-skill occurrences:
    - at §0 step 4, `ledger="${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh"`
    - in the rebuild section, `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/run-state.js" <ledger-path> --run <run-id>`
  - Every other mention says `run-ledger.sh <verb>` bare. State once at step 4: "below,
    run-ledger.sh means that shimmed path", **without restating the shim string**; shell variables
    do not survive between Bash calls, so the orchestrator expands the path itself in each call.
    Never write a bare `${CLAUDE_PLUGIN_ROOT}/`.
  - The preserved prose "at the repo ROOT (the worktree/checkout root — NEVER `${CLAUDE_PLUGIN_ROOT}`, hard"
    in §0 1c-mem stays verbatim.
- **Run skill edits** (anchors are headings and step labels; renumber nothing, because
  skills/design/SKILL.md and skills/planning/SKILL.md cite walk step 4):
  - **§0 step 1d.** Keep "store its awaitingHarnesses[] in-session", and add "also emit
    `AWAITING(propose): <ids comma-joined, or none>` (appended at step 4)".
  - **§0 step 4.** Keep the first line starting `4. Open the **run record**`, which tests slice
    from. Replace the "Which root, and when" sub-block (buffer before `workspace`, flush from
    `workspace` on) with:
    - A prose sentence carrying the literal `run-ledger.sh open <run-id>` (the pinned test regex
      is `/run-ledger\.sh"? open <run-id>/`, and the code block below spells it `"$ledger" open`).
    - A code block that runs `open` and the held §0 lines' `append` in **one** Bash call:
      `"$ledger" open <run-id> && "$ledger" append <run-id> resolve <<'EOF'` … `EOF`. Add
      `--in-place` under `workspace: { strategy: in-place }`. The lines, in order: `RESOLVE: <craft flags verbatim, or none>`,
      `Resolution.record[]`, config/load notes, waivers, `AWAITING(propose): …`.
    - "Never silence `open`'s stdout: the run-key it prints into this session's transcript is what
      binds the compaction hooks to this run."
    - The flush-per-line sentence, containing verbatim: **`appended in the tool call that produces it or in the orchestrator's very next tool call`**.
    - The scratch rule: before `workspace` the ledger is `<run-id>.pre.md` under
      `run-ledger.sh dir`; `workspace` moves it into the worktree ledger in one call.
    - The §0 lines produced before the run-id exists (steps 0b–1e run before step 3 derives the
      slug) are the only in-session buffer: bounded to §0, and re-derivable by re-running §0.

    Keep the literal .claude/craft-run-record.md in this region.
  - **Walk step 4.** Add: at phase entry, in the same Bash call as the contract-assemble
    invocation, append `PHASE-START(<phase.id>): <iso8601>` (`date -u +%Y-%m-%dT%H:%M:%SZ`) via
    `run-ledger.sh append <run-id> <phase.id>`. Skip it when the phase is already in flight (a
    resumed phase keeps its first `PHASE-START`, so `--since` stays right). The contract-assemble
    code block's two existing shims are unchanged.
  - **Walk step 7.** Keep the first line `7. **Record outcome**`. Replace "flushing this phase's
    lines to the on-disk ledger (.claude/craft-run-record.md) before moving to the next
    descriptor — the phase-boundary flush" with: append `PHASE-DONE(<phase.id>): <one-line outcome>`
    for every phase that ran (NO-OP phases included), together with the existing `GATE`/`NO-OP`/`inline:`
    lines, in one `run-ledger.sh append` call to .claude/craft-run-record.md. That call must still
    fall within the flush-per-line window: the call that produced the line, or the very next one.
    A gate's `GATE` line may instead land in the gate's own call.
    - Keep the literal ledger path; keep every existing `GATE(`/`NO-OP(` sentence.
    - An auto-skipped phase records only its `auto-skip:` line (step 1), with no
      `PHASE-START`/`PHASE-DONE`.
  - **"## Cross-phase invariants", first bullet.** Add: the awaited set is "the
    `AWAITING(propose):` set minus recorded releases" (`auto-skip: <id>`, exact `NO-OP(<id>):`, the
    last `GATE(<id>)` green) — today's release rules, stated as ledger facts.
  - **Single-writer sentence** at step 4. "Only the orchestrator ever appends": add "— through its
    own tool calls, foreground or background; the compaction hooks only read".
  - **New `## Rebuild after compaction`**, between `## Review cadence — engine vs working-style` and
    `## Done`:
    1. The ledger outranks the summary. Locate the ledger from the reorient block's `Ledger:` line.
       Without a block (non-Claude harness, hook absent), use `run-ledger.sh locate --run <run-id>`,
       where the run-id is the topic slug re-derivable from the `/craft:run` message the summary
       keeps verbatim.
    2. Re-run §0 steps 0b, 1 and 1b with the flags on the ledger's `RESOLVE:` line; re-`load()`
       (1c-mem) and re-`consult()` (1c-int).
    3. Pipe that Resolution into the run-state invocation. Exit 1 (AWAITING mismatch: the manifest
       or flags changed mid-run) or exit 2 → blocker `{ rebuild, reason, ≤3 options }`, never a
       guess. Restore `completed`/`inFlight`/`next`/`awaitingHarnesses`/`parts`/`findings`/`background`
       and surface `warnings`.
    4. A foreground spawn blocks the orchestrator, so only a background Bash run (`HARNESS-BG`) can
       outlive an orchestrator compaction.
    5. Re-enter each in-flight phase at walk steps 2–4 (idempotent; step 4 skips a second
       `PHASE-START`), then resume per the design's resume table, copied as a Markdown table with
       rows for: any agent phase except review; `workspace`; `decisions`; `implementation`;
       `review`; `validation` / `architecture`; `propose` / `integrate`; `integrate` (after
       teardown). Say "VCS port" and never name a host CLI (class B).
    6. Walk from `next`.
  - **`## Done`:**
    - Delete the "**Ledger residual flush (only if the worktree still exists).**" paragraph.
    - In its place, one sentence that keeps the literal .claude/craft-run-record.md: once
      `integrate` has run worktree-teardown.sh, the ledger is gone; stop appending, and later
      lines stay in-session where they ship (final summary, PR body).
    - Memory save: replace "Hold the derived `delta` in-session across the rest of the walk" with
      "read the `delta` from `<run-id>.delta.json` under `run-ledger.sh dir` (written by `integrate`
      step 3) — never a summarised delta".
    - Keep verbatim: `save(repoRoot, view, delta, deps)`, `**once**, atomically`, the sentence
      starting "Writes are buffered all run and flushed once here", "this run's run-id", "before …
      worktree-teardown.sh", scripts/emit-metrics.sh, `--run`, `--phase`, `--since`,
      "re-counts the first".
    - Change the `--since` source to "the iso on that phase's latest `PHASE-START(<phase>):` line".
    - End with `run-ledger.sh close <run-id>` as the last action before the final message.
    - Never mention subagents/, `toolUseId`, `message.id` here (existing negative pin).
- **Integrate step 3** (the integrate skill above). Keep the heading line
  `3. **Derive the \`Done\`-bound memory delta, then consult \`teardown\`.**` and the phrase
  `read this run's run-id lines from the on-disk ledger`. Replace "into the in-session `delta` and
  hold it —" with: derive the `delta` and write it, in the same Bash call, to
  `"$("${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" dir)/<run-id>.delta.json"`.
  Keep "the teardown below removes the worktree … last point at which it can be read". The
  read → write → teardown order must stay textual.
- **Spec edits** (the run-record spec above; keep the pinned phrases `# craft run record (append-only)`,
  `header line is appended first`, `no header is re-written`, `` `>>` semantics``, `collision`,
  `decay-merges against the run-start`):
  - **"## File shape and header".** Replace the buffered-then-flushed rule with the scratch rule,
    and amend "Nothing is ever written to the pre-worktree checkout" by answering its three reasons
    one by one: the scratch is moved, never split; `close` removes the run's files; residue stays
    confined to one directory and `open` sweeps stale pointers.
  - **New "## Run directory".** The layout block from the design's "On-disk layout" section (the
    pointer, `.pre.md`, `.delta.json`, the worktree ledger, `$TMPDIR/craft-review.XXXXXX/<dim>.c<N>.json`),
    the `<run-key>` charset, the pointer line format, and the ignore posture (inherits the ledger's;
    no .gitignore change).
  - **"## Token vocabulary".** Add the 7 new tokens with their emitters: the first 7 rows of the
    Shared contracts token table.
  - **"## The absent-file case".** The header is written by `open` (scratch or in-place ledger) or
    `move` (worktree ledger) when absent; keep "header line is appended first".
  - **Heading "## The three write points and the single-writer rule"** → "## Write cadence and the
    single-writer rule". It carries the flush-per-line sentence verbatim (same phrase as the skill),
    run-ledger.sh as the one write surface (open/append/move/close) and the locate surface, and
    R4 carried forward (orchestrator tool calls only, foreground or background; hooks only read).
  - **"## Lifetime".** The run directory files; `close`.
  - **"## Derivation precedes teardown".** The delta is written to `<run-id>.delta.json` at integrate
    step 3 and read at `Done`. Rewrite the two live cases without "residual flush".
  - **New "## Compaction survival".** Names hooks/reorient-after-compact.sh (SessionStart `compact`)
    and hooks/steer-compact-summary.sh (PreCompact, empty matcher):
    - binding by run-key in transcript
    - silent no-op, never write, never block
    - the rebuild runs `run-state`
  - **"## Ledger vs. store" table.** The Write cadence cell "incremental, once per phase boundary"
    → "per line, as produced (`run-ledger.sh append`)".
  - **"## Inherited edges".** Add that `open` replaces a same-id pointer and says so on stderr.
- **Test file** (`test/run-record.test.js`): reuse its `sliceRegion(content, startPattern, endPattern)`,
  which joins lines with a space. For whole-file checks, normalise whitespace with
  `content.replace(/\s+/g, ' ')`. Add constants `FLUSH_PER_LINE`,
  `NEW_TOKENS = ['RESOLVE:', 'AWAITING(propose):', 'PHASE-START(', 'PHASE-DONE(', 'PART(', 'FINDINGS(', 'HARNESS-BG(']`
  and `RUN_SKILL_TOKENS = NEW_TOKENS.slice(0, 4)`. Part 9 adds the other three emitter checks.
- Class A/B hygiene applies to both skills and the spec. Prose-lint on skills is advisory; fix cheap
  hits.
- Binding: no provenance references in test code or comments (skills and specs may cite ADRs as
  today). If a design statement is wrong against the code, STOP and hand back a blocker
  `{ part, reason, ≤3 options }` rather than silently deviating.

### TDD steps

1. **RED — §0 step 4 + flush rule.**
   - Region `/^4\. Open the \*\*run record\*\*/` → `/^## Phase walk/` matches `/run-ledger\.sh"? open <run-id>/`,
     contains `FLUSH_PER_LINE`, `RESOLVE:` and `AWAITING(propose):`, and does **not** contain
     `buffer the lines in-session`.
   - The normalised spec contains `FLUSH_PER_LINE` and contains neither `buffered in-session` nor
     `once per phase boundary`.
   - Fails on the current text. **GREEN**: the step 4 rewrite, and the spec's "File shape",
     "Write cadence" and table edits.
2. **RED — walk tokens + vocabulary.**
   - Region `/^4\. \*\*Assemble the injected block\*\*/` → `/^5\. \*\*Execute\*\*/` contains
     `PHASE-START(<phase.id>):`.
   - Region `/^7\. \*\*Record outcome\*\*/` → `/^8\. \*\*On blocker\*\*/` contains
     `PHASE-DONE(<phase.id>):` and does **not** contain `phase-boundary flush`.
   - The spec region `/^## Token vocabulary/` → `/^## /` contains every `NEW_TOKENS` entry.
   - The run skill contains every `RUN_SKILL_TOKENS` entry.
   - The spec contains `.claude/craft-runs/` and a `## Compaction survival` region naming both hook
     paths.
   - **GREEN**: step 1d, walk steps 4 and 7, invariants, and the spec's vocabulary, "Run directory"
     and "Compaction survival".
3. **RED — rebuild section.** A `## Rebuild after compaction` heading exists after
   `## Review cadence` and before `## Done`. Its region contains `run-state.js`,
   `locate --run`, `RESOLVE:`, `inFlight` and a table row starting ``| `review` ``.
   **GREEN**: the section.
4. **RED — Done.** The Done region contains `.delta.json` and `run-ledger.sh close`, contains
   `PHASE-START(`, and does **not** contain `residual flush`. Every existing Done pin stays green,
   including the two that need `.claude/craft-run-record.md`. The spec contains no
   `residual flush`. **GREEN**: the Done rewrite and the spec's "Derivation precedes teardown".
5. **RED — integrate + shims.** In the integrate step 3 region, replace the assertion
   `/into the in-session \`delta\` and hold it/u` with `/write it[^.]*<run-id>\.delta\.json/u`, and
   assert the indices `read this` < `.delta.json` < `worktree-teardown.sh`. Shim rows: run
   skill = 8, integrate = 2. **GREEN**: the integrate edit, and the rebuild's run-state
   invocation (if not yet in).
6. **REFACTOR** — reread the touched run-skill regions for stale "phase-boundary flush" or "buffer"
   wording elsewhere (`grep -n 'flush' skills/run/SKILL.md`). The only survivor allowed is the
   store's "Writes are buffered all run and flushed once here". Renumber nothing.

### Gate

```bash
node --test test/run-record.test.js test/craft-root-shim.test.js test/decision-tokens.test.js test/gate-token.test.js test/intention-token.test.js test/hygiene-gates-ci.test.js test/source-hygiene.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`docs(run): append the ledger per line and rebuild the run after a compaction`

## Part 9 — Phase-skill emitters (workspace, implementation, review, validation)

### Context

- **Edits (6):**
  - `skills/workspace/SKILL.md`
  - `skills/implementation/SKILL.md`
  - `skills/review/SKILL.md`
  - `skills/validation/SKILL.md`
  - `test/run-record.test.js`
  - `test/craft-root-shim.test.js`
- **Preamble wording, all four skills.** Each has a "WRITES (buffered to run record, flushed at run
  end)" clause in its "Memory read/write surface" preamble item: workspace preamble 3,
  implementation 3, review 3, validation 3. Each becomes "WRITES (appended to the run record as
  produced; saved to the store once at `Done`)".
- **Shim budget, exact.** One shimmed run-ledger.sh invocation per skill:
  - workspace **2 → 3**
  - implementation **0 → 1** — add the new `TARGET_FILES` row
    `{ file: 'skills/implementation/SKILL.md', count: 1 }` in alphabetical position, between
    documentation and init
  - review **1 → 2**
  - validation **3 → 4**

  Any further mention in the same file is the bare `run-ledger.sh <verb>`.
- **Workspace, procedure step 2.** The strategy-`worktree` code block becomes **one** Bash call:
  `git worktree add ../<repo>-<slug> -b <type>/<slug> && "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/worktree-setup.sh" <abs-worktree-path> [manifest scripts.post-setup] && "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" move <run-id> <abs-worktree-path>`,
  with one line per command joined by `&&` and `\`. Add the reason: a compaction cannot split the
  three. The in-place strategy runs no `move`, since §0 opened with `--in-place`.
- **Implementation, procedure step 2** (after "the commit exists and matches the part promise"):
  once verified, append `PART(<n>): <sha> size=<size> outcome=<pass|blocked>` via
  `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" append <run-id> implementation`,
  in the verification's own Bash call or the very next one.
  - `<size>` is the part's shape label from the plan's shape table, `?` when unknown.
  - A landed commit found without a `PART` line on resume is verified first, then gets its line.
- **Review, procedure step 2** (after the normalize-findings pipe):
  - In the same Bash call, write the canonical `Finding[]` to
    `<dir>/<dimension>.c<cycle>.json`. `<dir>` is one `mktemp -d "${TMPDIR:-/tmp}/craft-review.XXXXXX"`
    per review phase, reused across cycles: out of tree, the same throwaway discipline as
    validation's `$out`.
  - Append `FINDINGS(<dimension>): c<cycle> <path> n=<count>` via
    `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" append <run-id> review`.
  - Add the rule: after a compaction, a dimension with no `FINDINGS` line for the current cycle is
    re-spawned, because its reviewer output may have been lost before it was persisted.
  - Standalone (no craft run): skip the append; the file still lands.
- **Validation, procedure 1, the `run-style: background` bullet.**
  - Create the out-of-tree `$out` and `$specfile` (the triage bullet's two `mktemp` files) in a
    foreground call that prints their paths. Shell variables do not survive between Bash calls, so
    the background call uses those paths literally.
  - The backgrounded command's first statement, before the technique starts, appends
    `HARNESS-BG(<phase>:<technique-id>): pid=<pid> out=<path> spec=<path>` via
    `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" append <run-id> <phase>`.
  - `<pid>` is the same pid written to the run-lock. `spec=none` when the technique builds no
    scope-spec file (gate mode).
  - Class A: write no technique name; `sample-technique`-style ids only in tests.
  - Keep the existing pins `NO-OP(validation):`, `NO-OP(validation:<technique-id>):` and
    `NO-OP(verify):` (test/no-op-token.test.js).
- **Test file** (`test/run-record.test.js`, from Part 8, which holds `NEW_TOKENS`). Add an
  emitter table
  `[['PART(', 'skills/implementation/SKILL.md'], ['FINDINGS(', 'skills/review/SKILL.md'], ['HARNESS-BG(', 'skills/validation/SKILL.md']]`
  and a preamble table over the four skills.
- Class A/B hygiene applies to all four skills. Prose-lint is advisory.
- Binding: no provenance references in test code or comments. If a design statement is wrong
  against the code, STOP and hand back a blocker `{ part, reason, ≤3 options }` rather than silently
  deviating.

### TDD steps

1. **RED — preamble wording.** For each of the four skills: no
   `buffered to run record, flushed at run end`, and contains
   `appended to the run record as produced`. **GREEN**: four preamble edits.
2. **RED — workspace move.** The workspace procedure step 2 region (`/^2\. \*\*Consult \`isolate\` action\*\*/`
   → `/^3\. /`) contains `worktree-setup.sh`, then `run-ledger.sh" move <run-id>`, in that order,
   inside one fenced block. Shim row workspace = 3. **GREEN**: the code block.
3. **RED — implementation PART.** The implementation skill contains
   `PART(<n>): <sha> size=<size> outcome=<pass|blocked>`. New shim row implementation = 1.
   Emitter row `PART(`. **GREEN**: procedure 2.
4. **RED — review FINDINGS.** The review skill contains
   `FINDINGS(<dimension>): c<cycle> <path> n=<count>`, `mktemp -d` and `re-spawned`. Shim row
   review = 2. Emitter row `FINDINGS(`. **GREEN**: procedure 2 and the respawn rule.
5. **RED — validation HARNESS-BG.** The validation skill contains
   `HARNESS-BG(<phase>:<technique-id>): pid=<pid>`. Shim row validation = 4. Emitter row
   `HARNESS-BG(`. **GREEN**: the background bullet.
6. **REFACTOR** — `grep -n 'flushed at run end' skills/*/SKILL.md` returns nothing; renumber
   nothing.

### Gate

```bash
node --test test/run-record.test.js test/craft-root-shim.test.js test/no-op-token.test.js test/decision-tokens.test.js test/source-hygiene.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`docs(skills): append part, findings and background-run lines as each is produced`

## Part 10 — Guide, poc-record, concepts row

### Context

- **Creates or edits (5):**
  - `docs/guides/customizing.md`
  - `docs/contributing/specs/auto-compaction-poc-record.md` — new
  - `docs/guides/concepts.md`
  - `test/living-corpus.test.js`
  - `test/auto-compaction-docs.test.js` — new
- **Guide.** Section `## 4. Examples index — a sample per point` ends with
  `### Running craft in a loop — a use-pattern` (around lines 428-441), then `---` and
  `## 5. Tailor in one sitting`. Add, after the loop subsection and before the `---`,
  `### Long sessions — auto-compaction (Claude Code)`. It covers:
  - the formula: compaction fires at `autoCompactWindow − 33000`; the 1M default fires at 967k
  - the recommended `autoCompactWindow: 233000` (fires at 200k)
  - per session: `claude --settings '{"autoCompactWindow":233000}'`; or user settings
  - the value is read at launch only and inherited unchanged by every spawn
  - spawns above 200k will compact mid-task
  - the plugin's two compaction hooks (reorient, steer), both silent outside a craft run
  - craft never writes the user's settings

  Class A/B hygiene applies: this guide is scanned.
- **Poc-record.** A new page in the *-poc-record.md shape. Heading precedents:
  docs/contributing/specs/cursor-poc-record.md and docs/contributing/specs/pi-poc-record.md
  (`# … PoC — …`, a lead blockquote, `## Verdict: **GO** (<date>)`, then evidence sections). No
  front-matter; intention-lint accepts none.
  - **Headings, exact** (the new test pins them by title). The body may keep the Q1–Q8 and P1–P5
    row labels; the test never names them.
    - `# Auto-compaction PoC — spike evidence record`
    - `## Verdict: **GO** (2026-09-21)` — CLI 2.1.278
    - `## Matrix` — Q1–Q8 and C-H3
    - `## Fire point pins` — Q1
    - `## Hook payload shapes` — Q3, with the `<sid>`/`<proj>` placeholders
    - `## Survival scoring` — Q6
    - `## Summary-call cost` — Q7
    - `## Model-triggered compaction routes` — spike 2: none
    - `## Pinned while designing` — P1–P5, the design's "Pinned external behaviour" rows
    - `## Live smoke (pending)` — the manual item above
  - **Sources (read-only):** the design's "Pinned external behaviour" section, and the run-local
    spike findings in the main checkout at
    `.claude/spike-auto-compaction.findings.md`. That file is
    gitignored and already uses `<sid>`/`<proj>`. If it is unreadable, build from the design alone
    and say so in the hand-back.
  - **Anonymise:**
    - nonces become `<nonce>` (the source has `NONCE-SS-…` and `NONCE-PC-…`)
    - no session UUIDs, no transcript paths, no agent ids, no /Users/ or /home/
  - **Wording:** no technique tool names (class A) and no `gh`/`github` (class B).
- **Concepts row.** Line 213 of the concepts guide: the "Protect the orchestrator's own memory
  across a reset" row says "one append per phase boundary". It becomes "appended per line as
  produced". Keep the literal .claude/craft-run-record.md (pinned by test/concepts-frames.test.js).
- **Living corpus.** Add `'docs/contributing/specs/auto-compaction-poc-record.md'` to `EXPECTED`,
  in sorted position after aider-poc-record.md.
- **New test file** (`test/auto-compaction-docs.test.js`, CommonJS, Given/When/Then):
  - the guide subsection pins
  - the poc-record anonymisation guard (see the TDD steps)
  - the concepts row
- Binding: no provenance references in test code or comments. If a design statement is wrong
  against the code, STOP and hand back a blocker `{ part, reason, ≤3 options }` rather than silently
  deviating.

### TDD steps

1. **RED — corpus + page shape.** `EXPECTED` gains the poc-record. The new test asserts the page
   exists with every exact `## ` heading listed in Context, and holds the content anchors
   `compact_boundary`, `isCompactSummary`, `--path-format=absolute` and
   `Compaction blocked by PreCompact hook`. Fails: the page is missing. **GREEN**: write the page.
2. **RED — anonymisation guard.** The poc-record content matches none of:
   - `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/`
   - `/\/Users\//`, `/\/home\//`
   - `/NONCE-/`
   - `/agent-[0-9a-f]{6,}/`
   - `/\.claude\/projects\//`

   It also contains `<sid>` and `<nonce>`. **GREEN**: anonymise the page.
3. **RED — guide subsection.** The region from `### Long sessions — auto-compaction (Claude Code)`
   to the next `^#{2,3} ` heading contains `autoCompactWindow`, `233000`, `--settings`,
   `reorient-after-compact.sh`, `steer-compact-summary.sh` and `never writes`. **GREEN**: the
   subsection.
4. **RED — concepts row.** The concepts guide does not contain `one append per phase boundary`
   and contains `appended per line as produced`. **GREEN**: the row edit.
5. **REFACTOR** — reread both guides for tone; `bash scripts/living-corpus.sh` lists the new page.

### Gate

```bash
node --test test/auto-compaction-docs.test.js test/living-corpus.test.js test/concepts-frames.test.js test/source-hygiene.test.js test/p10-structure.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
log=$(mktemp); bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; grep -E '^not ok|^ci:' "$log" | head -20
```

### Commit

`docs: recommend autoCompactWindow and record the auto-compaction evidence`
