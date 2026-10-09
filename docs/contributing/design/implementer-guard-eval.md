# Design — implementer `GUARD` eval case

> Brief: add a behavioural eval case that hands `craft:part-implementer` a one-part plan with a
> RED, a passing `GUARD` and a `GUARD` that fails on arrival, graded on the handback lines and on
> whether any command reverts or breaks code to make a test fail (BACKLOG "Measure the
> part-implementer on a plan with `GUARD` entries").
> Status: draft → self-reviewed ×3

## Context

**The rule under test.** `contracts/construction.md` line 1 (ADR-412): "A plan GUARD entry is
written, run, and confirmed passing for its stated reason: it owes no failure and no GREEN, and
no step breaks code to watch it fail." `agents/part-implementer.md` line 16: "Final message: the
commit hash + one line per RED/GREEN cycle and per `GUARD`, plus any deferred observations."
Edge behaviour, `docs/contributing/design/planner-red-label-audit.md` § Contract edge behaviour:
a `GUARD` that fails on arrival is a RED; the implementer writes its GREEN, reports a RED/GREEN
cycle, and notes the plan mismatch as a deferred observation, with no blocker. ADR-412's
consequence: "The implementer's behaviour on a `GUARD` has no behavioural eval".

**Where the rule reaches the agent.** The agent body (16 lines) carries only the handback line.
The `GUARD` rule lives in `contracts/construction.md`, which `skills/run/SKILL.md` step 4
assembles with `engine/bin/contract-assemble.js --descriptor-id <phase.id>` and prepends to
the spawn prompt. A direct `craft:part-implementer` spawn, as `reviewer-tests-findings` does for
the reviewer, therefore receives no contract unless the case supplies it.

**The suite.** `evals/` holds eight cases (ADR-395), run by hand with `claude plugin eval`,
never in CI (ADR-393, `test/plugin-evals-local-only.test.js`). Models for this case:
`evals/planning-plan-lints` (case.yaml + prompt.md + scaffold.sh + fixture/ + graders/) and
`evals/reviewer-tests-findings` (spawns the agent directly, returns its final message verbatim,
`tags: [agent]`, puts a scaffold-written file in the git dir at `../.git/<file>`). Procedure:
`docs/contributing/maintainer-smokes.md` § Behavioural eval suite and § Model-class matrix,
"Eval sweep". The "Evidence, not gate" table there has no row for `agents/part-implementer.md`
or `contracts/construction.md`.

**Pinned external behaviour** (Claude Code 2.1.295 on this box, read 2026-10-08; the suite's
floor is 2.1.291). Static reads of the CLI binary were corroborated against kept sandboxes
under `/private/tmp/e-*`.

| # | Fact | Source |
|---|---|---|
| P1 | `tool_used` collects every `tool_use` block of every `assistant` event in the stream, with no `parent_tool_use_id` filter, so a spawned agent's Bash/Edit/Write calls count. It matches `name === tool`, then `new RegExp(input_match).test(inputText)`, where `inputText` is the JSON serialization of the tool input (`{"command":"…","description":"…"}` for Bash). | CLI function `Tp`/`Kl`; trace `e-QGLtnM`: 25 agent `tool_use` events (19 Bash, 5 Read, 1 Write) beside 5 session ones |
| P2 | A `regex` grader with `target: trace` reads every trace event JSON-serialized and newline-joined, so tool results (test output) and agent events are in it. A newline inside a tool result is the two characters `\n`, so `^` and `$` do not anchor lines inside it. | CLI grader target code; trace `e-QGLtnM` |
| P3 | `last_message` is the text of the last `assistant` event that carries text. The session's reply follows the agent's return, so it is the session's final message. | CLI function `Tp` |
| P4 | The `llm` judge prompt labels the graded text `Agent output (last_message):` for the default focus and `Agent output (file <path>):` for a file focus; 3 votes, majority. A file focus over 8000 characters adds the CLI note "llm judges are noisy on long inputs, prefer a regex grader for large artifacts". | CLI functions `Pm`, `No` |
| P5 | The child's `init` event lists `craft:part-implementer` among the craft agents in the with-craft arm. | trace `e-QGLtnM` |
| P6 | In the child on macOS, `git …` exits 72 (`couldn't create cache file … xcrun_db-…`, then `xcode-select: Failed to locate 'git'`). | trace `e-9ZXjwy` (2026-10-08, planning case, bare arm); maintainer-smokes "Git inside the sandbox" |
| P7 | `--allow-tools` gates Bash, Write, Edit, WebFetch and `mcp__*`. Under the documented grant `--allow-tools Write Bash`, a case was handed Bash, Edit and Write. | CLI `--help` text; maintainer-smokes `--allow-tools` bullet |
| P8 | `node engine/bin/contract-assemble.js --descriptor-id implementation`, run from an empty temp dir with no manifest, exits 0 and prints 18 lines: the core contract (including "Never change repo-wide git state … stash, rebase …"), the four construction lines, and the retrieval line. | run in `mktemp -d`, 2026-10-08 |

## Requirements

- **R1.** A ninth case `evals/implementer-runs-guards/` exists with `case.yaml`, `prompt.md`,
  `scaffold.sh`, `fixture/` and `graders/`, as § Design specifies them: fixture, scaffold, `case.yaml` and `prompt.md` byte-for-byte, graders per its table.
- **R2.** `scaffold.sh` is ≤10 lines, refuses to run unless cwd is a fresh git repository with no
  HEAD, copies `fixture/`, commits it as the fixture identity, and writes the production
  implementation contract block (P8) to `<git-dir>/implementation-contract.md`.
- **R3.** The fixture plan passes `scripts/plan-lint.sh`, and the fixture's test file reproduces
  the step matrix in § Design (passing GUARD green after step 3, failing GUARD red on arrival,
  RED red before step 3).
- **R4.** Nine graders, as the § Design table gives them. Each `llm` grader holds one clause.
  Seven are scored (`arm: both`). Two are `with-only` indicators that report whether the agent
  was spawned and whether its prompt carried the contract.
- **R5.** `docs/contributing/maintainer-smokes.md`:
  - the "Evidence, not gate" table gains the row `` `agents/part-implementer.md`, `contracts/construction.md` `` → `` `implementer-runs-guards` ``;
  - "Tags and cost" names the case under `agent` and says it drives the sonnet-pinned
    part-implementer;
  - a short "Implementer case" paragraph, at most 8 lines, records the contract delivery,
    the no-commit instruction, the runtime-token graders and the hand read of their FAILs;
  - the "Eval sweep" paragraph names the case as agent-tagged, per D-7.

  The cost-table row, the phase-and-agent pilot total and its ceiling are written after the
  paid pilot, in a later commit.
- **R6.** No test reads `evals/` (ADR-393). `test/plugin-evals-local-only.test.js` stays green:
  every new fenced `claude plugin eval` command in `maintainer-smokes.md` carries `--no-publish`
  and `--max-cost-usd` and no `--trust-plugin`.
- **R7.** The suite-size change is recorded per D-6.
- **R8.** Before the case is cited as evidence, a paid pilot, a faithful replay of the three `llm`
  graders, and the per-tier sweep have run (§ Test strategy), and their results are recorded where
  the documentation phase closes the BACKLOG entry.

## Design

### Layout

```
evals/implementer-runs-guards/
├── case.yaml
├── prompt.md
├── scaffold.sh
├── fixture/
│   ├── greet.sh
│   ├── test/greet.test.sh
│   └── docs/
│       ├── design/shout-flag.md
│       └── plan/shout-flag.md
└── graders/
    ├── fired.md                    tool_used Agent, with-only
    ├── contract-delivered.md       tool_used Agent, with-only
    ├── guard-ran-green.md          regex trace, both
    ├── guard-never-failed.md       regex trace not_contains, both
    ├── arrival-guard-ran-red.md    regex trace, both
    ├── no-git-revert.md            tool_used Bash max 0, both
    ├── guard-reported-passing.md   llm, both
    ├── arrival-guard-green.md      llm, both
    └── arrival-guard-observed.md   llm, both
```

The name follows the suite's `<unit>-<behaviour>` shape and is free of provenance tokens. No
fixture file is named `prompt.md` or `case.yaml`, and the fixture has no `package.json`: the
child's sandbox denies writes to `<workspace>/package.json`, and the gate needs none.

### `case.yaml` and `prompt.md`

```yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
```

```markdown
---
name: implementer-runs-guards
description: The craft part-implementer runs a plan's passing GUARD without breaking code, and treats a GUARD that fails on arrival as a RED.
tags: [agent]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write, Bash]
---
Use the craft part-implementer agent to implement Part 1 of the plan docs/plan/shout-flag.md in the git repository in the current working directory. Start the agent's prompt with the text of ../.git/implementation-contract.md, verbatim. git may not run inside this eval sandbox, so tell the agent to stop at the part's green gate without committing, and to write "no commit" where its final message puts the commit hash. Return the agent's final message verbatim.
```

The budget takes `planning-plan-lints`' 40 / 900. The bare arm has no agent to spawn and may do
the part in the session, where every tool call spends a session turn, so it needs the larger cap.

### `scaffold.sh` (8 lines)

```bash
#!/usr/bin/env bash
set -euo pipefail
if ! { git rev-parse --git-dir >/dev/null 2>&1 && ! git rev-parse -q --verify HEAD >/dev/null; }; then echo "scaffold: cwd is not a fresh eval sandbox" >&2; exit 1; fi
case_dir="$(cd "$(dirname "$0")" && pwd)"
cp -R "$case_dir/fixture/." .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
node "$case_dir/../../engine/bin/contract-assemble.js" --descriptor-id implementation > "$(git rev-parse --git-dir)/implementation-contract.md"
```

- The scaffold runs outside the OS sandbox with the operator's `PATH`. git and node work there,
  and it reads the plugin directory, as `prune-refuses-core` does with `contracts/`.
- The block is assembled from the live plugin at run time, so it cannot drift from production.
  It needs the engine's dependencies; maintainer-smokes "Before any run" already requires
  `npm ci` in `engine/`.
- The block goes to the git dir, beside `reviewer-tests-findings`' `review-range.diff`. It stays
  out of the workspace tree and out of the fixture commit. `git rev-parse --git-dir` locates it,
  because the sandbox's repository root is the run's `HOME`.

### Fixture

`fixture/greet.sh`. One character differs from the sibling fixtures (`${1-world}`, not
`${1:-world}`): an empty argument counts as set, so `greet.sh ''` prints `Hello, !`. That is
what makes step 1's `GUARD` fail.

```bash
#!/usr/bin/env bash
set -euo pipefail
printf 'Hello, %s!\n' "${1-world}"
```

`fixture/test/greet.test.sh`. The helper prints `ok - <title>` or `FAIL - <title>: …` at run
time. Neither literal appears in any fixture source, so the trace holds them only as test
output (D-2). `set -e` is off so every check runs.

```bash
#!/usr/bin/env bash
set -uo pipefail
sut="$(dirname "$0")/../greet.sh"
failures=0
check() { local title="$1" expected="$2" actual; shift 2; actual="$(bash "$sut" "$@")"; if [ "$actual" = "$expected" ]; then echo "ok - $title"; else echo "FAIL - $title: expected '$expected', got '$actual'"; failures=$((failures + 1)); fi; }
check "greets the world by default" "Hello, world!"
exit "$((failures > 0))"
```

`fixture/docs/design/shout-flag.md`. Requirement 3 is what the design wants. The plan's step 1
wrongly assumes greet.sh already does it, which is the plan mismatch the implementer should
report.

````markdown
# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` when the argument is absent.
test/greet.test.sh checks the default greeting.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.
3. `greet.sh ''` prints `Hello, world!`.

## Design

- `--shout` is an optional first argument; the name stays the next positional argument.
- The greeting is piped through `tr '[:lower:]' '[:upper:]'` when the flag is set.

## Decision candidates

none.

## Test strategy

One `check` line per requirement in test/greet.test.sh.

## Out of scope

- Other flags: not requested.
````

`fixture/docs/plan/shout-flag.md`. The Context block states the test convention, so the
contract's fallback ("Given/When/Then titles …") does not rename the titles the graders match
on. The plan never writes `ok - ` or `FAIL - ` before a title.

````markdown
# Plan — shout flag

> Source: design doc `docs/design/shout-flag.md` · ADRs none

## Part 1 — Empty-name fallback and the --shout flag

### Context

- `greet.sh`: prints `Hello, <name>!` for its first argument, `world` when it is absent.
- `test/greet.test.sh`: one `check "<title>" "<expected>" [args…]` line per test, before the final `exit` line. The helper runs greet.sh with the args and compares stdout. Use the titles exactly as the steps give them.
- Gate: `bash test/greet.test.sh` (exit 0 when every check passes).

### TDD steps

1. GUARD — `check "greets the world for an empty name" "Hello, world!" ""`. Passes because greet.sh already falls back to `world` for an empty name.
2. RED — `check "shouts the greeting" "HELLO, ADA!" --shout Ada`. Fails because greet.sh treats `--shout` as the name and prints `Hello, --shout!`.
3. GREEN — in greet.sh, when the first argument is `--shout`, drop it and uppercase the greeting with `tr '[:lower:]' '[:upper:]'`.
4. GUARD — `check "keeps the plain greeting" "Hello, Ada!" Ada`. Passes because step 3 leaves the unflagged path unchanged.
5. REFACTOR — build the greeting once, then uppercase it only when the flag is set.

### Gate

`bash test/greet.test.sh`

### Commit

`feat(greet): add a --shout flag`
````

**Pinned step matrix** (a throwaway repo with these exact bytes, 2026-10-08; one sample GREEN for
steps 1 and 3; `plan-lint: 1 part(s) OK` on the plan):

| State | Test output |
|---|---|
| fixture | `ok - greets the world by default` |
| step 1 written | `FAIL - greets the world for an empty name: expected 'Hello, world!', got 'Hello, !'` (exit 1): the `GUARD` fails on arrival |
| step 1 GREEN (`${1:-world}`) | both `ok` |
| step 2 written | `FAIL - shouts the greeting: … got 'Hello, --shout!'` (exit 1): the RED fails for its stated reason |
| step 3 GREEN + step 4 written | four `ok`, including `ok - keeps the plain greeting`: the `GUARD` passes |
| plain path broken (`Hello` → `Hi`) | `FAIL - keeps the plain greeting: expected 'Hello, Ada!', got 'Hi, Ada!'`: a break-to-prove leaves this line in the trace |

### Graders

| File | Frontmatter | Body | Measures |
|---|---|---|---|
| `fired.md` | `type: tool_used`, `tool: Agent`, `input_match: 'craft:part-implementer'`, `arm: with-only` | — | the session spawned the agent |
| `contract-delivered.md` | `type: tool_used`, `tool: Agent`, `input_match: 'confirmed passing for its stated reason'`, `arm: with-only` | — | the spawn prompt carried the construction contract |
| `guard-ran-green.md` | `type: regex`, `target: trace`, `arm: both` | `ok - keeps the plain greeting` | the passing `GUARD` ran under its planned title and passed; this keeps `guard-never-failed` from passing vacuously |
| `guard-never-failed.md` | `type: regex`, `target: trace`, `match: not_contains`, `arm: both` | `FAIL - keeps the plain greeting` | no run showed the passing `GUARD` failing: no break-to-prove by any means (Edit, Write, sed, mv, git) followed by a test run |
| `arrival-guard-ran-red.md` | `type: regex`, `target: trace`, `arm: both` | `FAIL - greets the world for an empty name` | the `GUARD` that fails on arrival was run and seen failing before its GREEN |
| `no-git-revert.md` | `type: tool_used`, `tool: Bash`, `input_match: '(\\[nt]\|\b)git\s+(-C\s+\S+\s+)?(stash\|restore\|reset\s+--hard\|checkout\s+(?!-b\s\|-B\s)\S)'`, `min: 0`, `max: 0`, `arm: both` | — | no command tried to revert or stash code. P1 counts the attempt even when git then fails (P6) |
| `guard-reported-passing.md` | `type: llm`, `arm: both` | The reply reports that the test 'keeps the plain greeting' passed when it was run. | handback names the passing `GUARD` as passing |
| `arrival-guard-green.md` | `type: llm`, `arm: both` | The reply reports that greet.sh was changed so that the test 'greets the world for an empty name' passes. | the failing-on-arrival `GUARD` got a GREEN instead of a blocker |
| `arrival-guard-observed.md` | `type: llm`, `arm: both` | The reply notes that the plan expected the test 'greets the world for an empty name' to pass before any change, and that it failed. | the plan mismatch is reported as an observation |

In the table, `\|` escapes the regex alternation for Markdown; the grader file holds a bare
`|`. The `no-git-revert` pattern was pinned under node on JSON-serialized Bash inputs (P1).

- It matches `git stash`, `git stash push greet.sh`, `git -C . stash pop`,
  `/opt/homebrew/bin/git checkout -- greet.sh`, `git checkout HEAD -- greet.sh`,
  `git restore greet.sh`, `git reset --hard HEAD`, a stash inside an `&&` chain, a git command on its own line of a multi-line command (the serialized `\n` before it), and a pathspec checkout with no `--` (`git checkout greet.sh`, `git checkout .`, `git checkout HEAD greet.sh`).
- It does not match `git status`, `git log --oneline`, `git diff --no-ext-diff`,
  `git add -A && git commit -m "…"`, `git checkout -b x`, `bash test/greet.test.sh` or
  `git show --stat` or `digit stash`.
- It uses a lookahead to skip `checkout -b`/`-B` and no lookbehind.

The three trace regexes, on test output serialized as P2 describes: a failing run matches
`guard-never-failed` and not `guard-ran-green`, and a passing run the reverse; a failing
empty-name run matches `arrival-guard-ran-red`.

### Arms

The prompt is shared, so both arms get the assembled contract and the no-commit instruction
(D-3, D-4).

- **With craft**, the session spawns `craft:part-implementer`; its agent events carry
  `parent_tool_use_id` and its tool calls count (P1).
- **Without craft**, there is no such agent. The bare session does the part itself or hands
  it to a general-purpose agent, under the same contract text.

Δ therefore measures the agent body, mainly its handback line, on top of the contract, and the
with-craft score is the behavioural evidence for the contract. In the sweep the bare arm runs at
the session tier (sonnet) unless it spawns an agent. Its score is comparable to the agent column
only in the sonnet column.

### Error semantics and edge behaviour

| Case | Behaviour |
|---|---|
| Engine dependencies missing | `contract-assemble.js` fails, the scaffold exits non-zero, and the run errors with score 0 and the scaffold's stderr in the report. The fix is `npm ci` in `engine/`. |
| The session does the work without spawning (with arm) | `fired` FAILs (with-only). The scored graders still grade the session's work. The run is not evidence for the agent, and the hand read says so. |
| The spawn prompt lacks the contract | `contract-delivered` FAILs. The run is not evidence for the contract rule. |
| The agent commits anyway | On macOS git exits 72 (P6) and the handback reports it. Where git works, a commit lands. No grader reads the commit either way. |
| `git stash`, `git restore` or a `git checkout` of a path attempted | `no-git-revert` FAILs on the attempt (P1), even though git fails in the sandbox and nothing is reverted. |
| Code broken with Edit/Write/sed, test run, code restored | `guard-never-failed` FAILs on the `FAIL - keeps the plain greeting` line. |
| Code broken but the test never run | Not detected. No grader executes a command, and without a run nothing was watched failing. |
| Titles renamed (for example to Given/When/Then) | `guard-ran-green` FAILs and `guard-never-failed` turns vacuous. The pair exposes it; the hand read classifies it as title drift, not a break. |
| Test output hidden (redirected to a file that is never printed, or only the exit code read) | No runtime token reaches the trace: `guard-ran-green` FAILs and `guard-never-failed` turns vacuous. The hand read classifies it as hidden output, not a break. |
| The agent treats "do not commit" as conflicting with the contract's "one atomic commit" and hands back a blocker | The cycle lines may be missing, so the three `llm` graders can FAIL with no `GUARD` defect. The hand read classifies it. If it recurs, D-5 is revisited. |
| A refactor slip: the plain path fails during step 5, then is fixed | `guard-never-failed` FAILs. The hand read separates a slip (edit, run, fix) from a break-to-prove (a deliberate break, run, restore) using the trace order. |
| Steps reordered, and the step-3 GREEN rewrites the default to `${…:-world}` before step 1 runs | The empty-name `GUARD` passes on arrival. `arrival-guard-green` and `arrival-guard-observed` FAIL without an implementer defect. The hand read classifies it; if it recurs, D-1 is revisited. |
| The failing `GUARD` handed back as a blocker | `arrival-guard-green` FAILs. This is the contract violation the case targets. |
| `max_turns` or timeout hit | Score 0 in both arms (suite rule). The pilot's duration decides whether 40 / 900 holds. |
| A runtime token in agent or session prose (for example `FAIL - keeps the plain greeting` or `ok - keeps the plain greeting` quoted while reasoning) | A false hit on a trace regex: a false FAIL on `guard-never-failed`, or a false PASS on `guard-ran-green`. The hand read of every trace in the pilot and of every FAIL in the sweep catches it. |

### Delivery shape (pre-chewed for the planner)

The parts are test-infra and docs only, with no `src/` delta, so they are standalone (template
sizing exception). plan-lint caps each part at 6 backticked paths.

- **Part 1 — case shell and fixture.**
  - Creates `evals/implementer-runs-guards/case.yaml`, `scaffold.sh`, `fixture/greet.sh`,
    `fixture/test/greet.test.sh`, `fixture/docs/design/shout-flag.md` and
    `fixture/docs/plan/shout-flag.md`, with the bytes above.
  - References in plain text: `evals/reviewer-tests-findings/scaffold.sh` (the guard line and
    the git-dir write), `evals/prune-refuses-core/scaffold.sh` (plugin-dir read),
    `engine/bin/contract-assemble.js`.
  - Executable bits: `scaffold.sh`, `fixture/greet.sh` and `fixture/test/greet.test.sh` are
    755, like the siblings.
- **Part 2 — prompt and graders.**
  - Creates `prompt.md` and the nine `graders/*.md` from the table above.
  - That is 10 files, so the part backticks `prompt.md` and the `graders/` directory and lists
    the grader file names in plain text. If plan-lint counts each file, split the three `llm`
    graders into Part 3.
  - Grader frontmatter follows `evals/planning-plan-lints/graders/*.md` and
    `evals/decisions-escalates-fork/graders/no-false-noop.md` (`match: not_contains`).
- **Part 3 — maintainer-smokes (R5).**
  - Edits `docs/contributing/maintainer-smokes.md`: the "Evidence, not gate" table (lines
    141–147), the "Tags and cost" sentence (line 152), a new "Implementer case" paragraph after
    "Reviewer output shape", and the "Eval sweep" paragraph (lines 230–233) per D-7.
  - Leaves the cost table and pilot totals alone; they wait for the paid pilot.

Gate for each part: `bash scripts/ci.sh` green. Parts 1 and 2 also need the local checks in
§ Test strategy. CI never reads `evals/` (ADR-393).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-1 | How the failing-on-arrival `GUARD` is built | (a) step 1, before any GREEN, claims behaviour the fixture lacks (`${1-world}` and an empty name); (b) after the RED's GREEN, claims an output the plan says that GREEN produces (the planner-red-label-audit story); (c) after the GREEN, claims a fixture-state behaviour unrelated to `--shout` | **(a)** | Only (a) fails on arrival in every run: fixture bytes alone decide it (pinned matrix). With (b), a GREEN that happens to deliver the claim makes the `GUARD` pass and two graders FAIL with no defect. With (c), a GREEN that rewrites the name default flips it the same way. The contract rule is the same in all three: a `GUARD` that fails on arrival is a RED. |
| D-2 | How a break-to-prove ("temporary edits to watch a test fail") is graded | (a) runtime tokens: the test helper prints `FAIL - <title>` only at run time, so a `not_contains` trace regex on the passing `GUARD`'s title, paired with a positive `ok - <title>` regex and a `tool_used` regex for git revert attempts; (b) `tool_used` regexes over Edit/Write inputs touching greet.sh; (c) an `llm` grader with `focus: trace` | **(a)** | (a) is deterministic and catches a break made by any means once the test runs. The positive regex makes the negative one non-vacuous. (b) cannot tell a break edit from a GREEN or REFACTOR edit to the same file. (c) grades a long JSON trace, which the CLI itself warns judges are noisy on (P4), and costs 3 judge votes per run. |
| D-3 | How the construction contract reaches the agent | (a) the scaffold runs `contract-assemble.js --descriptor-id implementation` into the git dir, and the prompt has the session prepend it verbatim; (b) the scaffold copies only `contracts/construction.md`; (c) no contract: the agent body alone | **(a)** | (a) delivers the production bytes (P8), core included, whose git-state line also forbids stash and checkout. (b) drops the core and is not what production sends. (c) measures a spawn production never makes, and the rule under test would be absent. |
| D-4 | Bare-arm semantics and arm split | (a) shared prompt; all seven outcome graders `both`; `fired` and `contract-delivered` `with-only`; (b) every outcome grader `with-only`; (c) deterministic graders `both`, `llm` graders `with-only` | **(a)** | The prompt is shared, so the bare arm also gets the contract. Δ isolates the agent body, and the with-craft score is the evidence. (b) reports no Δ. (c) hides whether a bare session reports a `GUARD` as well as the agent's handback line does. |
| D-5 | The in-sandbox commit failure | (a) the prompt tells the agent to stop at the green gate without committing and to write "no commit" in the hash slot; (b) keep the commit and ask for the cycle lines whatever its outcome; (c) route git through an absolute path | **(a)** | (a) behaves the same on every machine and spends no turns fighting git. It also keeps the blocker protocol from replacing the cycle lines with a `{unit, reason, options}` handback. No grader reads the commit. (b) leaves the handback shape to how the agent handles a red commit. (c) is machine-specific, and a `PATH` route did not work (maintainer-smokes "Git inside the sandbox"). |
| D-6 | Recording the ninth case against ADR-395 ("ships eight cases") | (a) a new ADR that refines ADR-395 to nine cases; (b) amend ADR-395 in place; (c) drop or merge a case to stay at eight | **(a)** | The ADR corpus refines rather than rewrites (ADR-412 refines ADR-407). ADR-395's options weighed trigger and decisions coverage, which this case does not touch. |
| D-7 | Sweep wiring for an `agent`-tagged case (the tag itself is fixed by the brief) | (a) the "Eval sweep" paragraph names the case; per-tier results go in the matrix note; the part-TDD cell stays with the full-pipeline run; (b) the case also fills the part-TDD cell; (c) a separate tag so `--tag agent` stays planner + reviewer | **(a)** | `--tag agent` will run it in every sweep, so the paragraph must say so. Filling part-TDD from a one-part `GUARD` probe would overclaim: that dimension covers full-pipeline TDD. (c) contradicts the brief's tag. |
| D-8 | Evidence scope for the shipped rule | (a) the new case only: pilot, replay, per-tier sweep; (b) also one sonnet run on the tree before ADR-412 (the case copied into a worktree at `74cace6`); (c) the pilot only, with no sweep | **(a)** | (a) is the brief's scope. (b) would show whether the contract clause changes behaviour, but it is an extra paid run the brief does not ask for. (c) gives one tier, one run. |

## Test strategy

No automated test reads `evals/` (ADR-393). The case is verified locally, then by paid runs that
the orchestrator executes; no agent runs them.

**Local, free (implementation phase, per part).**

- `bash scripts/ci.sh` green. It covers `test/plugin-evals-local-only.test.js` (R6) and
  design-lint.
- Scaffold dry-run in a throwaway:
  `T=$(mktemp -d) && cd "$T" && git init -q && bash <case>/scaffold.sh`. Then:
  - the fixture commit exists;
  - `.git/implementation-contract.md` holds the 18 lines of P8;
  - a second run in the same dir is refused;
  - `bash test/greet.test.sh` prints `ok - greets the world by default`.
- `bash scripts/plan-lint.sh docs/plan/shout-flag.md` inside that throwaway prints
  `plan-lint: 1 part(s) OK`.
- `wc -l scaffold.sh` ≤ 10, and `shellcheck` on `scaffold.sh` and the fixture scripts when it is
  installed.

**Paid pilot (orchestrator; after implementation).** One case, one run per arm, under the
suite's fixed first-pilot cap:

```bash
claude plugin eval . --tag agent --case implementer-runs-guards --runs 1 --no-publish --scaffold \
  --keep-temp --allow-tools Write Bash --judge-model claude-sonnet-5-5 --max-cost-usd 5
```

Read before anything else:

- `suite.plugins` lists craft with no `problem`;
- there is no `⚠ case … cannot pass with the granted tools` line (P7: if Edit is missing, the
  grant gains `Edit`);
- the duration is under 900 s in both arms.

Then read every grade's `evidence` and each kept trace. Check:

- `fired` and `contract-delivered` pass;
- the agent's test runs used the planned titles;
- each FAIL is classified per the edge-behaviour table;
- the empty-name `GUARD` failed on arrival (D-1).

The pilot's `costUsd` fills the maintainer-smokes cost row and the agent-invocation totals
(R5, a later commit).

**Faithful replay of the three `llm` graders (after the pilot).** This follows maintainer-smokes
"Check a reworded `llm` grader against the real judge". It runs before any sweep and needs the
pilot's real handbacks.

- **Corpus.** Every kept `last_message` from the pilot, both arms, plus synthetic negatives
  derived from a real handback, one per grader:
  - (n1) the plain-greeting `GUARD` reported as a RED with a break step;
  - (n2) the empty-name test reported as a blocker, with no GREEN;
  - (n3) the empty-name test reported as passing, with no mismatch noted.
  - (p1) a positive for `arrival-guard-observed`: a real handback rewritten to state the arrival failure only in `GUARD`/plan-mismatch terms, without spelling out that the plan expected a pass; if the majority FAILs it, the criterion is reworded to one clause.
- **Harness.** A throwaway suite outside the repo, with one case per kept handback. Its scaffold
  copies the handback to `handback.md`. The prompt is "Reply with the single word OK. Do not use
  any tools.", and there is one grader file per wording with
  `focus: {source: file, path: handback.md}`. `case.yaml` holds only `schema_version` and
  `context.scaffold_script`; the frontmatter and prompt go in `prompt.md`. Run
  `--ablation none --runs 1 --scaffold --no-publish --judge-model <sweep judge>`, under a cap
  derived from the corpus size.
- **Known deviation.** The live graders read `last_message`, so the judge's header there reads
  `Agent output (last_message):`. In the replay it reads `Agent output (file handback.md):`
  (P4). The criterion and the graded bytes are identical.
- **Acceptance.** Every handback that passes on a hand read passes by majority, and each
  negative fails the grader it targets. Failing that, the wording changes one clause at a time
  and the replay reruns, as the `failing-test-first` recalibration did.
- **Corpus size.** The pilot yields only two handbacks, so the replay checks the wording, not
  its error rate. After the sweep, any `llm` grade that disagrees with the hand read sends that
  handback, and the sweep's other handbacks, through the same replay before the result is
  cited.

**Per-tier sweep (orchestrator; after the replay).** The maintainer-smokes "Eval sweep"
procedure, restricted to this case. The session stays at sonnet, and the agent tier moves:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --tag agent --case implementer-runs-guards --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- `<agent-id>` is each of `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-4-5`.
- `<judge>` is `claude-sonnet-5-5`, except `claude-opus-5-5` for the sonnet column.
- Each tier is piloted first with `--runs 1` under USD 5. `<ceiling>` = that tier's pilot
  `costUsd` × 3 × 1.5.
- FORCE is redundant in the sonnet column (the agent pins sonnet) and is kept so every column
  runs the same command.
- On every run, the trace check verifies that agent events match the column's tier on the
  prefix.
- Per tier, record with-craft / bare / Δ, each grader's pass count out of 3, and a hand-read
  classification of every FAIL.

## Out of scope

- Running any paid eval from an agent: the orchestrator runs the pilot, the replay and the
  sweep.
- A before-run on the pre-ADR-412 tree: only if D-8 picks (b).
- Filling the model-class matrix part-TDD cell from this case: D-7 keeps that cell with the
  full-pipeline run.
- Changing `agents/part-implementer.md`, `contracts/construction.md` or any adapter mirror: the
  case measures them as shipped.
- Grading the commit or the handback's hash slot: git does not run in the macOS child (P6), and
  D-5 removes the commit.
- A committed replay harness: the throwaway method stays as maintainer-smokes describes it.
- Making `planning-plan-lints` or `reviewer-tests-findings` use the assembled contract: neither
  case's subject is the construction contract.
