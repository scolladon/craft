# Design — eval-sweep follow-ups: reviewer severity scale, haiku session floor, sandbox git

> Brief: make the two agent eval cases (`planning-plan-lints`, `reviewer-tests-findings`) measure
> the agent at each tier rather than the harness around it. Three follow-ups from the 2026-10-07
> sweep: the reviewer names no severity scale, a haiku session stops before planning, and git
> fails inside the eval sandbox. Done only when a per-tier re-sweep shows the effect.
> Status: accepted (ratified as ADR-396…402)

## Context

**What exists.** The eval sweep (`docs/contributing/maintainer-smokes.md` § Model-class matrix,
"Eval sweep (planner and structured-review rows)", l. 208–239) runs the `agent`-tagged cases at
each tier: `--model <id>` for the session, plus `CLAUDE_CODE_SUBAGENT_MODEL=<id>` and
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` for the agents. Its 2026-10-07 result
(`docs/guides/model-class-matrix.md` l. 22–45) is:

| Cell | opus | sonnet | haiku |
|---|---|---|---|
| planner (`planning-plan-lints`, with-arm mean) | PASS 1.00 | PASS 1.00 | FAIL 0.33 |
| structured-review (`reviewer-tests-findings`) | PARTIAL 0.78 | PARTIAL 0.67 | PARTIAL 0.56 |

Three harness effects sit inside those numbers:

1. **Severity scale.** `agents/reviewer.md` (23 lines) names no severity scale. The scale
   `CRITICAL|HIGH|MEDIUM|LOW` lives only in `contracts/harness-read.md` l. 2, which the review
   phase injects. The case spawns the reviewer directly (ADR-388), so the reviewer never sees the
   scale. It wrote one in 1 of 3 opus runs and in 0 of 3 sonnet and 0 of 3 haiku runs, and
   `findings-shape` failed every other run. That is 8 of the 9 structured-review points lost.
2. **haiku session.** In 2 of 3 sweep runs and in the pilot, the haiku *session* loaded
   `craft:planning`, announced the phase as running and ended its turn without spawning the
   planner. **Settled by the user:** craft does not support a haiku session. Item 2 becomes a
   documented floor (README and model-class matrix). `skills/planning` gets no change.
3. **Sandbox git.** `/usr/bin/git` fails in the eval child's Bash in 51 of 52 swept runs. Agents
   worked around it in different ways: opus switched to `/opt/homebrew/bin/git`, sonnet read the
   files instead of the diff, and one haiku reviewer `cd`'d into the plugin checkout and reviewed
   craft. A dry run of this design's trace check (E10) also finds one haiku planner-case run that
   moved into the plugin checkout.

**Surfaces this design touches:**

| Surface | Today |
|---|---|
| `agents/reviewer.md` | Contract bullets l. 15–23. The status set `{VERIFIED, SUSPECT, RULED-OUT, PROBE}` (l. 20–22) already duplicates `contracts/harness-read.md` l. 2, and no test pins that the two agree. |
| `adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/craft-reviewer.md` | Body mirrors. `scripts/sync-adapter-agents.sh --write` rewrites them, and `--check` runs in `scripts/ci.sh` l. 86. Each adapter's `native-surface.test.js` (or `opencode/test/agents.test.js`) pins byte-identity through `bodyOf`. |
| `test/p10-structure.test.js` | Reviewer tests at l. 260–292 (`readToolsList(filePath)` l. 57, `listAgentFiles()` l. 43). It pins only the tools list. No test pins reviewer body text. |
| `contracts/harness-read.md` | l. 2: `{ file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }`. `engine/src/findings.js` parses `severity` as a free string and does not validate the scale. |
| `evals/reviewer-tests-findings/` | `prompt.md` (one-line prompt "…over HEAD~1..HEAD of this repo…"), `scaffold.sh` (9 of the 10 allowed lines), `graders/findings-shape.md` (both-arm regex, `flags: i`). |
| `evals/planning-plan-lints/` | `scaffold.sh` (7 lines). The planner commits its plan (`agents/planner.md` l. 38). No grader depends on that commit. |
| `docs/contributing/maintainer-smokes.md` | "Git inside the sandbox (macOS)" l. 97–100; "Evidence, not gate" l. 120–133; "Reviewer output shape" l. 153–158; sweep procedure l. 208–239. |
| `docs/guides/model-class-matrix.md` | "How to refresh" l. 6–13; the cells; the note l. 28–45. |
| `README.md` | No statement on which model may run the session. FAQ starts l. 236. `engine/src/readme-regions.js` `extractCostClaims` reads from the "What does a run cost?" anchor to the end of the file (patterns `(\d+) telemetered runs`, `≈([\d.]+) hours`, `to ≈(\d+) hours`, `half an hour|under \d+ minutes`). |
| `BACKLOG.md` § "Open (scoped 2026-10-06 …)" | The three entries at l. 215–220 (severity scale), l. 222–225 (haiku), l. 227–231 (sandbox git). |

**Governing decisions.** ADR-386: scaffolds are ≤10 lines, copy and commit, and refuse outside a
fresh sandbox. A scaffold that grows past copy-and-commit is a review finding. ADR-387: every case
keeps a both-arm outcome grader. ADR-388: the reviewer case drives the agent directly. ADR-389:
the sweep reaches agent tiers through the sub-agent model override. ADR-390: the sweep fills only
the planner and structured-review cells (PASS = 1.0, PARTIAL ≥ 0.5, FAIL < 0.5). ADR-391: the
judge is sonnet, or opus for the sonnet column, and never the agent model. ADR-392: ceiling =
pilot `costUsd` × runs × 1.5, and `--runs 1` is for pilots only. ADR-393: no test reads `evals/`.
ADR-395: the suite has exactly eight cases, so no probe case may be committed.

### Pinned external behaviour (Claude Code 2.1.291–2.1.292, macOS, read 2026-10-07)

Sources: `code.claude.com/docs/en/plugin-evals.md` (fetched 2026-10-07), the kept traces
`/private/tmp/e-*/out/trace.jsonl`, and `~/craft-eval-results/*/aggregate-result.json`. All were
read without running anything.

| # | Fact | Source |
|---|---|---|
| E1 | The child loads no project configuration: "no `.claude/` directory, `CLAUDE.md`, or `.mcp.json` loads from above the workspace or inside it, even one a `scaffold_script` wrote". A `settings.json` `env.PATH` route is therefore not possible. | docs, § How runs are isolated |
| E2 | The scaffold runs outside the OS sandbox. Its environment is the operator's `PATH`, `HOME` set to the run's temp home, `TMPDIR` and `TERM=dumb`. It is a separate process, so nothing it exports reaches the child. CLT git works there: the fixture commits exist. | docs, § case.yaml; fixture history in traces |
| E3 | The child's environment is an allowlist: `PATH`, locale, proxy settings, provider and auth variables, most `ANTHROPIC_*` and `CLAUDE_CODE_*`, and `EVAL_*`. A case's `env` keys must match `EVAL_[A-Z0-9_]*`. `append_system_prompt` is a case key. No case key touches the OS sandbox. | docs, § prompt.md fields |
| E4 | In the child, `/usr/bin/git` prints `couldn't create cache file '/var/folders/…/T/xcrun_db-…' (errno=Operation not permitted)` and then `xcode-select: Failed to locate 'git'…`. | trace `e-ozppbm` (haiku sweep, reviewer, with arm) |
| E5 | In the child, `ls /Library/Developer/CommandLineTools/usr/bin/git` returns `Operation not permitted`, while `/opt/homebrew/bin/git --version` prints `git version 2.56.0`. | trace `e-MOkcFY` (2.1.291, `run-fires-craft-this`) |
| E6 | In the child, the first `PATH` entries are the operator's, in the operator's order (`~/.antigravity-ide/…` first). `path_helper` would have put `/usr/local/bin` first, so the child's shell does not reset `PATH` through `path_helper`. | trace `e-MOkcFY`; `/usr/libexec/path_helper -s` on this box |
| E7 | **Unexplained:** in the same child, `PATH="/opt/homebrew/bin:$PATH"; hash -r; type git` printed `git is /usr/bin/git`. An in-command prepend did not change the lookup, but the absolute path ran. The operator's `PATH` on this box puts `/opt/homebrew/bin` (entry 9) before `/usr/bin` (entry 15). | trace `e-MOkcFY` |
| E8 | Assistant events with a `parent_tool_use_id` belong to the agent. `message.model` carries a dated id, for example `claude-haiku-4-5-20251001`, so a tier check must match on the prefix. | trace `e-ozppbm`: 6 session events, 53 agent events, all haiku |
| E9 | Each run entry carries `costUsd` (judge included, ADR-391), `tracePath`, and `graders[]` with `name`/`passed`. The top level carries `claudeVersion`, `suite.modelOverride`, `suite.judgeModel` and `suite.root`. | `aggregate-result.json` |

| E10 | The § 3 trace check, dry-run over the 2026-10-07 haiku sweep aggregate, gives these counts. Reviewer case, with arm: `left` 26 / 0 / 0, which includes the known run. Planning case, with arm, run 2: `left=3` (`cd /Users/…/craft && touch test-write.txt`). So a haiku planner-case run also moved into the plugin checkout and probed it for write access. `gitfail` ranges from 0 to 13 per run, and is non-zero in both arms. | `~/craft-eval-results/2026-10-07T07-35-42-092Z` |

E7 contradicts E6 unless something other than `PATH` order decides the lookup. Every `PATH`-based
route therefore depends on probe P1 (§ Design 4).

## Requirements

- **R1** `agents/reviewer.md` names the severity scale `CRITICAL, HIGH, MEDIUM, LOW`. The six
  adapter mirrors are byte-identical to it (`sync-adapter-agents.sh --check` passes). A test pins
  that the reviewer's severity set equals the set in `contracts/harness-read.md`.
- **R2** `README.md` states that the session must run at opus or sonnet tier, that a haiku session
  is not supported, and that haiku stays routable per agent. The model-class matrix note states
  the same floor.
- **R3** The sweep procedure names the session tier and the agent tier separately. It names a
  trace check that every run must pass: session events at the session tier, agent events at the
  column tier, both matched on the prefix (E8).
- **R4** The sandbox-git outcome is pinned by probe P1 before any paid sweep. The reviewer case
  then meets the acceptance rule of the chosen route (§ Design 4). In every reviewer-case run, no
  Bash command moves to an absolute path outside the run's sandbox, and none names the plugin
  root (`suite.root`): `left=0` in the § 3 trace check.
- **R5** Before/after evidence for `agents/reviewer.md` is recorded per tier: the with-arm score,
  Δ, and the `findings-shape` pass count. The before runs and the after runs use the same tree
  except for the reviewer edit.
- **R6** The planner and structured-review cells and the note under the matrix table are refilled
  from 3 runs per tier. The three BACKLOG entries are closed.
- **R7** Nothing in this change breaks ADR-393 (no test reads `evals/`) or ADR-395 (eight cases).
  The P1 probe case is never committed. Scaffolds stay ≤10 lines with their guard intact, and no
  machine-specific path is committed to a case.
- **R8** `bash scripts/ci.sh` is green before every commit. No grader changes, so the before/after
  comparison measures only the agent edit.

## Design

### 1. Reviewer severity scale (item 1)

One new Contract bullet in `agents/reviewer.md`, placed after the status bullet (after l. 22) and
before "Final message". It uses the set notation the status bullet already uses:

```markdown
- Rate each finding's severity over {CRITICAL, HIGH, MEDIUM, LOW}, written as that
  upper-case word.
```

- The bullet states the scale only. The per-line shape (`file:line`, suggested fix) stays in
  `contracts/harness-read.md`, which the phase injects. A finding about a missing test has no
  line to cite (maintainer-smokes "Reviewer output shape"), so the shape is not needed outside the
  phase. Alternatives: D1.
- In the review phase the scale now reaches the reviewer twice, once from the agent body and once
  from the contract. The two copies match, and a test keeps them matching.
- Mirrors: run `bash scripts/sync-adapter-agents.sh --write`, then `--check`. The six adapter
  byte-identity suites then pass without edits.
- The `findings-shape` grader is unchanged (R8).

**Agreement test** (`test/p10-structure.test.js`, after the reviewer tools tests at l. 292):

- `agentSetFor(text, key)`: builds `<key>[^{]*\{([^}]+)\}` (case-insensitive), splits the
  capture on `,` and trims. Keys: `severity`, `claim status`.
- `contractSetFor(text, key)`: builds `<key>\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)` and splits the
  capture on `|`. Keys: `severity`, `status`.
- Both return `[]` when there is no match. The test asserts the agent's set is non-empty, so the
  RED case is never an equal pair of empty sets.
- Test: "Given the reviewer agent and the harness-read contract, when each one's severity scale is
  read, then both name the same non-empty scale".
- A second test of the same shape covers the status set (`claim status over {…}` against
  `status?: …`). That duplication already exists and is unpinned. The same two helpers cover it,
  so no extra helper is needed.
- RED first: the reviewer has no severity set today, so the extraction returns nothing and the
  test fails.

### 2. haiku session floor (item 2, documentation only)

**README.md**: one new FAQ entry, placed after "Does it work on an existing, messy repo?". It sits
after the cost anchor, so `extractCostClaims` already matches on the earlier cost entry, and the
new text contains none of the four cost patterns:

```markdown
**Which model should run the session?** opus or sonnet. The session model runs `/craft:run`,
the phase skills, and every phase set to `execution: inline`. A haiku session is not
supported: in the behavioural eval sweep it loaded the planning skill and ended its turn
without spawning the planner. haiku stays routable per agent through `models.<agent>` and
`models.fallback`.
```

**`docs/guides/model-class-matrix.md`**: the note's haiku-planner sentence becomes the floor
statement, and the columns are defined as the agent tier (§ 3, D6).

### 3. Session tier in the sweep (open question B)

With a haiku session out of support, the 2026-10-07 haiku planner cell measured an unsupported
session rather than the haiku planner. The recommended procedure (D2) holds the session at sonnet
for every column and varies only the agent tier:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --tag agent --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- `<judge>` is unchanged (ADR-391): sonnet for the opus and haiku columns, opus for the sonnet
  column. In the haiku and opus columns the judge now has the same tier as the session. ADR-391
  forbids only a judge at the agent's tier, and the agent is the model under test, so this
  remains compliant. The ADR phase should restate this explicitly.
- The sonnet column (session sonnet, agent sonnet) has the same configuration as 2026-10-07.
  It is the control column for the procedure change.
- The override also reaches agents the bare arm spawns, such as a general-purpose agent. Both
  arms therefore run their agents at the column tier.
- **P2, the FORCE probe.** It is unverified whether `FORCE=1` makes agents follow the env model or
  the session model when the two differ, because the 2026-10-07 sweep had them equal. The
  haiku-column pilot (§ 5, step S1) settles it at no extra cost. Session events must match
  `claude-sonnet-5-5*` and agent events must match `claude-haiku-4-5*`. If the agent events show
  sonnet, `FORCE` follows the session: D2 (a) and (b) cannot be implemented. Stop before any
  further sweep step and re-open ADR-398 and ADR-402 with the user together. There is no silent
  fallback to D2 (c).

**Per-run trace check** (read-only, for any `aggregate-result.json`): the snippet and its
reading rules live in `docs/contributing/maintainer-smokes.md` § Model-class matrix, "Trace check,
every run", which is the procedure of record. It reports per run the session and agent tiers,
`gitfail` (tool results saying `Failed to locate 'git'`) and `left` (absolute paths outside the
run's sandbox that any tool input string names, payload excluded, resolved for `..`, minus system binaries and, for the
planner case, the plugin's own `templates/` and `scripts/`), and flags an errored run as
`NO-TRACE` and a reaped sandbox as `TRACE-GONE`. Around each tier, a file-time check
(`find <suite.root> -cnewer <marker>`, plus the common git directory for a worktree) lists what
changed in the plugin checkout: writes, deletions, renames, links and planted git config or
hooks. Writes elsewhere are visible only through `left`.

### 4. Sandbox git (item 3)

**Probe P1 (paid, cheap, needs approval; runs before any route is built).** A throwaway plugin in
a `mktemp -d` directory, never committed (R7):

```text
$probe/.claude-plugin/plugin.json   {"name":"git-probe","version":"0.0.0"}
$probe/evals/git-probe/case.yaml    schema_version "1.0"; context.scaffold_script: scaffold.sh
$probe/evals/git-probe/scaffold.sh  { echo "PATH=$PATH"; type -a git; git --version; } > .git/scaffold-git.txt 2>&1
$probe/evals/git-probe/prompt.md    tags [probe]; max_turns 4; allowed_tools [Bash]; body below
$probe/evals/git-probe/graders/ran.md   regex, target last_message: after-prepend=
```

Prompt body: "Run this exact command once with the Bash tool and reply with its output verbatim":

```bash
cat .git/scaffold-git.txt; echo "child PATH=$PATH"; type -a git; echo "resolved=$(command -v git)"; git --version 2>&1 | tail -n 1; ls -l /opt/homebrew/bin/git /usr/local/bin/git 2>&1; PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; hash -r; echo "after-prepend=$(command -v git)"; git --version 2>&1 | tail -n 1; echo "shell=$0"
```

```bash
claude plugin eval "$probe" --case git-probe --runs 1 --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd 1
```

- Launch the probe from the same shell context the sweep will use. In that shell, record
  `echo "$PATH" | tr : '\n' | grep -nE '^/usr/bin$|^/opt/homebrew/bin$'; type -a git` beside the
  result.
- The hard-coded `/opt/homebrew/bin` lives only in the throwaway probe and is never committed.
- Read the result from `out/trace.jsonl`, since kept sandboxes are sealed.

| Outcome | Child shows | Meaning | Route |
|---|---|---|---|
| O1 | Operator `PATH` order with a non-Xcode git dir before `/usr/bin`; `resolved` and `after-prepend` are both `/usr/bin/git` | The lookup ignores `PATH` order. This reproduces E7. | `PATH` routes are not possible → B or C |
| O2 | `/usr/bin` before the non-Xcode dir; `after-prepend` resolves the non-Xcode git, which runs | The child's shell reorders `PATH`, and an in-command prepend works | An operator-side `PATH` cannot work. A route that tells the agent which git to use would change what is measured → B or C |
| O3 | Operator `PATH` order; `resolved` is a non-Xcode git that runs | The 2026-10-07 sweep was launched from a shell with `/usr/bin` first | A is possible |
| O4 | No git runs in the child, even by absolute path | The sandbox can read no git on this machine | B or C |

**Route A: operator-side PATH (procedure only).** The sweep procedure gains a precondition: launch
from a shell where `command -v git` does not print `/usr/bin/git`. The new paragraph replaces
"Git inside the sandbox (macOS)". Nothing machine-specific is committed. A machine whose only git
is the Xcode shim has no git the sandbox can read (E5): its cells carry the floor note of route C.
Acceptance: in the S1 pilot, `gitfail=0` for every run. A non-zero count is read in the trace
before the route is rejected: an agent that calls `/usr/bin/git` by its full path does not count
against the route.

**Route B: the scaffold writes the range's diff.** The scaffold runs outside the sandbox, where
CLT git works (E2). After its last commit, `evals/reviewer-tests-findings/scaffold.sh` gains one
line (9 → 10):

```bash
git diff --no-ext-diff HEAD~1 HEAD > "$(git rev-parse --git-dir)/review-range.diff"
```

- The file lives in the git directory, so the working tree and `git status` match HEAD. The
  sandbox's repository root is the run's `HOME`, one level above the workspace, so the file is
  `../.git/review-range.diff` from cwd; the child can read it, as it reads the rest of the run's
  sandbox.
- The prompt names the file (D4 wording): "…over HEAD~1..HEAD of the git repository in the current
  working directory (the range's diff is also saved at ../.git/review-range.diff)…".
- It works on every machine, including one with only the Xcode shim.
- It changes what is measured: the reviewer can review without running git. Both arms receive the
  same file.
- `planning-plan-lints` is not covered. Its git noise stays, and no grader depends on it.
- The scaffold now goes beyond copy-and-commit, so the ADR phase records a refinement of ADR-386.
- Acceptance: in the S1 pilot, every reviewer-case run has `left=0`, and the findings name
  `greet.sh` or `test/greet.test.sh` (the `names-the-gap` grader passes or the judge `evidence`
  shows the change was read). `gitfail` may be non-zero.

**Route C: documented floor.** The cases stay as they are. The "Git inside the sandbox" paragraph
gains: "the structured-review cells measure the review plus the git workaround; a run whose
reviewer leaves cwd (`left>0`) is named in the matrix note". Acceptance: the trace check runs and
its counts are reported.

**Leave-the-sandbox guard (D4).** The recommended guard is a prompt clause naming the working
directory. It goes in both agent cases, since E10 shows the planner case leaving too. The real
review phase also passes the absolute working directory to the reviewer (`agents/reviewer.md`
l. 9). The clause is visible in the case and applies to both arms.
`append_system_prompt` would reach both arms too, but it is hidden from anyone reading
`prompt.md`, and nothing shows that it reaches the spawned reviewer: it appends to the child
*session's* system prompt. A guard bullet in `agents/reviewer.md` would be a second edit to the
unit under before/after test and would confound R5.

### 5. Run matrix and evidence

Every paid step needs approval, one tier at a time (maintainer-smokes, brief). Before any run,
the checkout under test needs `npm ci` in `engine/`. Never pass `--trust-plugin`. Gate each launch
on `command -v claude` and check that the log shows `Ablation: … (N runs)`. C1 is the commit with
the procedure, the git route and the D4 clause. C2 is C1 plus the reviewer scale (§ 1).

| Step | Tree | Selector | Session / agent | Judge | Runs | Ceiling | Read |
|---|---|---|---|---|---|---|---|
| S0 = P1 | throwaway | `--case git-probe` | sonnet / — | sonnet (unused: regex grader only) | 1 | USD 1 | outcome O1/O2/O3 → route |
| S1 = P2 | C1 | `--tag agent` | sonnet / haiku | sonnet | 1 | USD 5 | agent tier (P2), route acceptance, per-case `costUsd` |
| S2 | C1 | `--tag agent` | sonnet / sonnet | opus | 1 | USD 5 | per-case `costUsd` |
| S3 | C1 | `--tag agent` | sonnet / opus | sonnet | 1 | USD 5 | per-case `costUsd` |
| S4 (before) | C1 | `--case reviewer-tests-findings` | per tier | per tier | 3 | that tier's pilot reviewer-case `costUsd` × 3 × 1.5 | with-arm score, Δ, `findings-shape` passes |
| S5 (after, sweep) | C2 | `--tag agent` | per tier | per tier | 3 | tier pilot top-level `costUsd` × 3 × 1.5 | cells, Δ, `findings-shape` passes |

- The table follows D2 (a), ratified as ADR-398. If P2 shows FORCE follows the session, no step
  after S1 runs: ADR-398 and ADR-402 are re-opened with the user together, and the table is
  re-planned from their answer. There is no silent fallback to D2 (b) or (c).
- Order: S0, S1 (haiku first, because it settles P2), S2, S3, then S4 per tier, then C2, then S5
  per tier.
- A ceiling hit (exit 2) means re-pilot that tier. Do not raise the cap (ADR-392).
- S5's ceilings derive from pilots run on C1. C2 adds one bullet to the reviewer's prompt, which
  is a negligible cost change, so no second pilot is needed.
- **Cost estimate** from the 2026-10-07 per-tier figures (pilot / sweep: opus 1.00 / 3.07, sonnet
  0.56 / 1.61, haiku 0.53 / 1.49), with a sonnet session moving the opus column down and the haiku
  column up: pilots about USD 2.5, before runs about USD 3, sweeps about USD 6, probe under USD
  0.5. Total about USD 12. Under D5 (c) the before runs drop to about USD 1.
- Per-case cost from one aggregate: `jq '[.cases[] | select(.name=="reviewer-tests-findings") | .arms[][] | .costUsd] | add'`.
- `findings-shape` passes: `jq '[.cases[] | select(.name=="reviewer-tests-findings") | .arms.with[] | .graders[] | select(.name=="findings-shape") | .passed] | map(select(.)) | length'`.
- Every S-step's aggregate is copied to `~/craft-eval-results/` before merge.

### 6. Where results land

- **Matrix cells** (`docs/guides/model-class-matrix.md` l. 22, 24): S5's with-arm means, banded
  under ADR-390, each labelled `(x.xx, eval)`.
- **Note** under the table, rewritten. It gives:
  - the date, `claudeVersion` and 3 runs per arm;
  - that the session is held at sonnet and the columns name the agent tier;
  - Δ planner / review per tier;
  - the reviewer before → after per tier (with-arm, `findings-shape` passes out of 3);
  - the git route and its counts (`gitfail`, `left`);
  - the haiku session floor sentence;
  - the unchanged lines: trigger, decisions and prune not swept, and the full-pipeline rows.
- **How to refresh** (matrix l. 6–13): one sentence saying the columns name the agent tier, with
  the session held at a supported tier (D6).
- **maintainer-smokes**:
  - sweep procedure l. 208–239: the command per § 3, a session-tier bullet, the P2 finding, and
    the S1–S3 costs replacing the 2026-10-07 costs;
  - l. 223: delete "A haiku pilot can read cheap because haiku sometimes stops before planning",
    since the session is no longer haiku;
  - "Git inside the sandbox" l. 97–100: per route;
  - "Reviewer output shape" l. 153–158: the agent now names the scale, the line shape still comes
    only from the phase, and the grader stays lenient;
  - first paragraph of § Model-class matrix l. 191–196: per D6. The haiku column routes the
    agents to haiku (manifest `models.*` or the sub-agent override) under an opus or sonnet
    session.
- **BACKLOG.md**: the three entries (l. 215–231) collapse into one entry,
  "**Eval-sweep follow-ups — delivered 2026-10-DD** (fix/eval-sweep-followups)". It names the
  scale fix with its before → after, the haiku session floor, the git route, and the sweep cost.
  This is the house style used for "Suite pilot … — delivered".

### 7. Error semantics and edge behaviour

- **P2 shows that FORCE follows the session.** Stop before S2, and before any further sweep
  step. Re-open ADR-398 and ADR-402 with the user together; there is no silent fallback. C1's
  sweep-procedure text and the rest of the run matrix wait on their answer. The S1 data still
  counts as a sonnet-agent pilot.
- **P1 is inconclusive** (the child never runs the command, or the output is truncated). Re-run
  once. Never infer a route from a missing outcome.
- **A trace's `message.model` has no dated suffix.** The check matches on the prefix, so it holds
  either way (E8).
- **A sealed sandbox.** Read only `out/trace.jsonl` with jq. Never run git inside a kept sandbox.
- **The haiku column's planner still fails with a sonnet session.** That is a haiku-planner result
  and goes in the cell. The session floor no longer explains it.
- **Claude Code updates between steps.** Record `claudeVersion` per aggregate. If it changes
  between S4 and S5, the before/after carries a version note.
- **Route B on a machine with no git at all.** The scaffold fails at its first commit, as it does
  today, and the run scores 0 with `scaffold failed`. Nothing new.

### 8. Parts (pre-chewed context)

1. **Probe P1 (paid, no commit).** Build the throwaway plugin of § 4 under `mktemp -d`. Launch it
   from the sweep's shell context. Record the operator `PATH` and `type -a git` beside it. Read
   the outcome from the kept trace. The ratified D3 rule maps the outcome to a route.
2. **Procedure, route and floor docs (commit C1).**
   - Edit `docs/contributing/maintainer-smokes.md` l. 97–100, 191–196, 208–239 per §§ 3–4.
   - Route B only: add the scaffold line to `evals/reviewer-tests-findings/scaffold.sh` and
     shellcheck it by hand, since ci's shellcheck covers `scripts/` and `hooks/` only.
   - Add the D4 clause to `evals/reviewer-tests-findings/prompt.md` and
     `evals/planning-plan-lints/prompt.md`, in the prompt body only (frontmatter unchanged).
   - Add the README FAQ entry (§ 2).
   - Gate: `test/plugin-evals-local-only.test.js` stays green: every fenced `claude plugin eval`
     command in maintainer-smokes carries `--no-publish` and `--max-cost-usd`, and none carries
     `--trust-plugin`. The README must contain no fenced eval command.
   - `scripts/readme-drift.sh` stays clean.
   - Avoid the prose-lint ban list (`engine/src/prose-lint-main.js` `BAN_LIST`).
3. **Pilots and before runs (paid, no commit).** Run S1 to S4 on C1. Check P2 at S1. Record the
   per-case costs and the before-evidence table.
4. **Reviewer severity scale (commit C2).**
   - RED: the agreement test in `test/p10-structure.test.js` (§ 1).
   - GREEN: the `agents/reviewer.md` bullet, then `bash scripts/sync-adapter-agents.sh --write`
     to update the six `adapters/*/agents/craft-reviewer.md`.
   - Gate: `bash scripts/ci.sh`. This also runs the six adapter byte-identity suites and
     `sync-adapter-agents.sh --check`.
   - This edits `agents/`, so integrate offers the metrics baseline refresh. That refresh is its
     own reviewed step.
5. **Sweep (paid, no commit).** Run S5 per tier on C2, with the trace check on every aggregate.
6. **Results docs (commit).** Write the matrix cells, the note and How to refresh; the
   maintainer-smokes costs and "Reviewer output shape"; and the BACKLOG closure (§ 6).

## Decision candidates

Ratified as ADR-396…402: ADR-396 records the haiku session floor (item 2, settled by the user);
D1–D6 map to ADR-397–402 as named in the # column.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 → ADR-397 | How the reviewer gets the severity scale, and how agent and contract stay consistent | (a) one Contract bullet naming the set `{CRITICAL, HIGH, MEDIUM, LOW}`, plus an agreement test against `contracts/harness-read.md` (status set pinned the same way); (b) copy the full finding shape from `harness-read.md` l. 2 into the agent, with a test pinning the two lines equal; (c) point the agent at `contracts/harness-read.md` by path | **(a)** | (a) fixes the measured loss (8 of 9 points) with the smallest duplication, and the test catches drift. (b) duplicates the `file:line` and fix shape, which the phase already injects and which a missing-test finding cannot satisfy. (c) fails outside the phase: a directly spawned agent has no plugin-root path, and the six mirrors run on hosts with different layouts. |
| D2 → ADR-398 | Session tier in the eval sweep (open question B) | (a) hold the session at sonnet for every column and vary only the agent tier through `CLAUDE_CODE_SUBAGENT_MODEL` + `FORCE`; (b) hold the session at sonnet for the haiku column only; (c) keep session = column tier and mark the haiku planner cell as a session-floor result | **(a)**, provided P2 passes | (a) is the only option where a column differs from the others by agent tier alone: one variable, a supported session everywhere, and the session's relay of the findings (graded on `last_message`) held constant. The cost is comparability of the opus column with 2026-10-07, since its session changes. The sonnet column is unchanged and serves as the control. (b) keeps two columns comparable but mixes session tiers across columns. (c) keeps measuring an unsupported configuration and leaves the haiku planner unmeasured. |
| D3 → ADR-399 | Sandbox-git route (item 3), mapped from the P1 outcome | (a) operator-side `PATH` precondition in the procedure (route A); (b) the scaffold writes the range's diff into `.git/` and the prompt names it (route B, refines ADR-386); (c) documented floor, cases unchanged (route C) | **O3 → (a); O1, O2 or O4 → (b)** | (a) changes nothing in the cases and measures the reviewer as it really works, but it is possible only if the child honours `PATH`, which E7 puts in doubt. (b) works on every machine, including one with only the Xcode shim, and removes the trigger for leaving the sandbox. Its cost is that the reviewer may no longer run git. (c) leaves structured-review measuring the workaround, which is the problem the brief exists to remove. |
| D4 → ADR-400 | Guard against an agent leaving the sandbox | (a) a case-prompt clause in both agent cases: "the git repository in the current working directory"; (b) `append_system_prompt` in both agent cases; (c) a working-tree bullet in `agents/reviewer.md` | **(a)**, with the `left` trace check run either way | (a) mirrors what the real phase passes (an absolute working directory), is visible in the case, and applies to both arms. (b) is hidden from anyone reading `prompt.md` and may not reach the spawned agent. (c) is a second edit to the unit under before/after test, which confounds R5, and it goes beyond the brief's item 1. |
| D5 → ADR-401 | Baseline for the reviewer before/after (evidence, not gate) | (a) a fresh 3-run before per tier on C1 (S4); (b) reuse the 2026-10-07 sweep as "before"; (c) a fresh before at the haiku column only | **(a)** | Only (a) isolates the scale edit. (b) is free, but it confounds the edit with the session hold and the git route, both of which move the review cells. (c) costs about USD 1 against about USD 3 but shows the effect at one tier only, while the brief asks for per-tier evidence. |
| D6 → ADR-402 | Meaning of the matrix columns now that a haiku session is out of support, which also affects the full-pipeline rows | (a) every column names the agent tier, with the session held at a supported tier, and both procedures say so; (b) eval rows use agent tier; the full-pipeline haiku cells read "n/a — haiku session not supported"; (c) define only the eval rows and leave the full-pipeline procedure for its first run | **(a)** | One table with one column meaning. (b) gives one column two meanings across rows. (c) defers a definition that the floor already forces, and the next full-pipeline run would start without one. |

## Test strategy

- **Unit (CI).** Two agreement tests in `test/p10-structure.test.js`: severity set and status set,
  `agents/reviewer.md` against `contracts/harness-read.md`. RED before the bullet, GREEN after.
  Mutation check by hand: dropping `LOW` from either file, or renaming `HIGH`, must fail the
  severity test.
- **Mirror integrity (CI).** `sync-adapter-agents.sh --check`, plus the existing per-adapter
  byte-identity suites. No new test.
- **Guard tests that must stay green.**
  - `test/plugin-evals-local-only.test.js` (fenced command flags in maintainer-smokes, README,
    guides, skills and agents; no CI surface names `evals/`);
  - `test/readme-drift.test.js` (FAQ cost anchor);
  - `test/p10-structure.test.js` tools-list pins (the reviewer's tools stay unchanged).
- **No test over `evals/`** (ADR-393). The scaffold and prompt edits are checked by hand
  (shellcheck, line count ≤10, guard line untouched) and by the S1 pilot.
- **Behavioural evidence (local, paid, approved).**
  - P1: the route decision. P2: the agent-tier semantics.
  - S4 → S5: the reviewer before/after per tier (with-arm, Δ, `findings-shape` passes out of 3).
  - S5: the cells.
  - The trace check (§ 3) runs on every aggregate. A run whose agent tier is wrong invalidates its
    tier.
  - Every grade at every tier is shown to the user, who decides whether any should be scored
    differently. The judge answers in one word, so the `evidence` is what gets read.
- **Expected effect, stated before measuring.** `findings-shape` passes in at least 2 of 3 runs
  per tier after C2, against 1/0/0 of 3 before. The haiku planner cell moves off the session floor,
  in either direction. If an expectation fails, record it as a finding against the edit or the
  case. Never retune the grader to make it pass.

## Out of scope

- **A run-skill or planning-skill guard that refuses a haiku session.** The user settled item 2 as
  documentation only.
- **`docs/guides/customizing.md` l. 303 (model resolution ends at "the session model").** The
  README FAQ is the user-facing statement. A third copy would duplicate it with no reader who
  needs it there.
- **Tightening `findings-shape` (upper case only, `file:line` required).** It would confound the
  before/after (R8). Revisit at the next grader calibration.
- **Committing a git-probe case or a sandbox-git check case.** ADR-395 fixes eight cases, and
  ADR-393 forbids a CI test over `evals/`.
- **Fixing git for `planning-plan-lints` under route B.** No grader depends on the planner's
  commit. Its `gitfail` and `left` counts are still checked and reported in the matrix note, and
  the D4 clause covers the leave risk there.
- **Sweeping trigger, decisions and prune per tier.** ADR-390 limits the sweep to the two rows.
- **Explaining E7 beyond what P1 shows.** Root-causing the child shell's lookup is Claude Code's
  concern. The design only needs to know which route works.
- **Running the full-pipeline matrix rows.** D6 defines their columns but runs nothing.
- **The metrics baseline refresh triggered by the `agents/` edit.** It is integrate's own reviewed
  step, coupled to the README FAQ and the calibration pin.
