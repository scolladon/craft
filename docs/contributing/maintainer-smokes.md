# Maintainer smokes

On-demand checks a maintainer runs by hand — the pipeline smokes with `/craft:run`, the
behavioural eval suite with `claude plugin eval`; none is CI-gated.

## Manual acceptance check (inline fidelity) — not CI-gated

On demand / as a release smoke test: invoke craft with `--profile lean` (or `solo`) on a
real brief, confirm the inline phases commit artifacts in the same shape as the agent path
(the injected block differs only by the two carve-out lines —
`engine/test/contract-equivalence.test.js` proves that bound per descriptor), and record
the result in the run record under `inline-fidelity-check`. Rationale:
`docs/contributing/archive/DESIGN-P6-execution-topology.md`.

## Behavioural eval suite — not CI-gated

craft's behavioural cases live under `evals/` and run with `claude plugin eval` (Claude Code
2.1.291 or later): by hand, on demand, never in CI. Every case runs twice, with craft loaded and
without it. Results land in `evals/results/<timestamp>/`, which is gitignored. Rationale:
`docs/contributing/design/plugin-eval-suite.md`.

**Before any run.** Install the engine's dependencies in the checkout under test
(`npm ci` in `engine/`). A fresh worktree has none, and craft's pipeline resolver then fails at
its first step with `Cannot find package 'js-yaml'`.

**First run in this checkout** — the three cheap trigger cases, one run each:

```bash
claude plugin eval . --tag trigger --runs 1 --scaffold --no-publish --max-cost-usd 5
```

- The CLI asks once whether you trust the plugin. Answer it interactively: `--trust-plugin`
  answers it for CI, and craft never runs evals in CI.
- `--scaffold`: the two `run-fires-*` cases seed a `greet.sh`, so the bare model has a script
  to change ad hoc. The trigger cases never take `--allow-tools`: without a shell, craft stops at
  its first precondition and the bare model can only show its edit.
- `--max-cost-usd 5` is the fixed cap for the very first pilot; every later ceiling derives
  from a measured cost.
- Open `evals/results/<timestamp>/aggregate-result.json`. `suite.plugins` must list craft with
  no `problem` (`manifest_invalid`, `disabled_by_default`, `will_not_load`). If one is present,
  stop: the with-craft arm never loaded craft and the run means nothing.
- The run must not print `⚠ case … cannot pass with the granted tools`.
- The top-level `costUsd` prices the three trigger cases only. It says nothing about the
  fixture and agent cases, so no full-suite ceiling derives from it.

**Suite pilot** — every case once, before the first full run, in two invocations:

```bash
claude plugin eval . --tag trigger --runs 1 --no-publish --scaffold \
  --judge-model claude-sonnet-5-5 --max-cost-usd 5
claude plugin eval . --tag phase agent --runs 1 --no-publish --scaffold --allow-tools Write Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd 5
```

- Same flags as the full suite below, one run per case, under the same fixed USD 5 cap as the
  first run.
- If it exits 2, pilot each case it did not reach by name (`--case <name>`), each under the
  same cap, and add their `costUsd` to the partial run's. A case that alone hits the cap needs
  its own larger cap for its pilot; say so in the run record.
- Read each case's duration too: a case that ran into its `timeout_seconds` scored 0 in both arms
  and needs a larger budget before a full run.

**Full suite** — the same two invocations, each under its own ceiling:

```bash
claude plugin eval . --tag trigger --no-publish --scaffold \
  --judge-model claude-sonnet-5-5 --max-cost-usd <trigger-ceiling>
claude plugin eval . --tag phase agent --no-publish --scaffold --allow-tools Write Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd <phase-agent-ceiling>
```

- `--no-publish`: the CLI publishes the HTML report to claude.ai by default; the report stays
  on this machine.
- `--scaffold`: each fixture case copies its files into the sandbox through its own
  `scaffold.sh`, at most 10 lines, written and reviewed in this repo. Without the flag the CLI
  notes that the case runs against an unstaged workspace, and the fixture cases score 0 in both
  arms.
- `--allow-tools Write Bash`: the runner ignores a skill's own tool grants, and the fixture
  cases write files and run git and craft's lint scripts. Bash stays unscoped because craft's
  skills call their scripts by absolute plugin path, which no `Bash(<prefix>:*)` scope in a case
  file can name. The grant reaches every case in the invocation, whatever its `allowed_tools`
  lists: a case listing only `Read, Glob, Grep, Skill` was handed Bash, Edit and Write. Hence
  the separate trigger invocation. The child's shell runs inside the CLI's OS sandbox.
- `--judge-model claude-sonnet-5-5`: the default judge is haiku, below the sonnet-tier floor for
  rubric graders. The judge is never the model under test.
- `--max-cost-usd <ceiling>`: ceiling = that invocation's suite-pilot `costUsd` × runs × 1.5.
- `--runs` stays at the default 3, the CLI's floor; `--runs 1` is only for piloting a new or
  edited case. `-j` stays at 1: every run shares one subscription rate limit.

**One case.** Add `--case <name>` to the full-suite invocation for its tag, with `--runs 1`
while iterating.

**Debugging a scaffold.** Pass `--keep-temp` to keep the sandbox. Each `scaffold.sh` refuses to
run outside a git repository or in one that already has a commit, so running one by hand in this
checkout, or in any other directory, stops before it copies or commits anything.

**Git inside the sandbox (macOS).** `/usr/bin/git` is the Xcode shim, and inside the eval
sandbox it fails: `couldn't create cache file '…/T/xcrun_db-…'`, then `Failed to locate 'git'`.
`PATH` cannot route around it: a probe child (2026-10-07) kept the operator's `PATH` order,
with a Homebrew git directory ahead of `/usr/bin`, yet `type -a git` listed only
`/usr/bin/git`, and a `PATH` prepend inside the command still resolved `/usr/bin/git`. A
scaffold runs outside the sandbox, where git works, so `reviewer-tests-findings` writes the
reviewed range's diff into the git directory after its last commit, and its prompt names that
file; both arms get it. The sandbox's repository root is the run's `HOME`, one level above the
workspace, so the file is `../.git/review-range.diff` from the agent's working directory, and
the scaffold locates it with `git rev-parse --git-dir` rather than a fixed `.git/`. `planning-plan-lints` keeps the failure: no grader depends on the
planner's commit. A case whose outcome needs git inside the child scores 0 on such a machine.

**Reading results.**

- The headline per case is Δ = with − without.
- `with-only` graders match craft-only tokens. They report whether craft fired and sit outside
  the score.
- A Δ near 0 with a high without-craft score means the bare model already does the job. That is
  the evidence a prune candidate needs.
- Exit 1: a case scored below `--threshold` (1.0 by default); informational for a local run.
  Exit 2: the ceiling was hit and the results are partial. Re-pilot that case and recompute the
  ceiling rather than raising the cap blindly.
- An implausible jump is judge-gaming until you have read what the judge graded. The judge
  answers one word per vote and records no reasoning; the `evidence` field holds the text it
  saw. Before the first full run, read each grade and ask whether you would have scored it
  differently.
- Keep one clause per `llm` grader. A FAIL on a multi-clause criterion does not say which clause
  failed: `tdd-parts` once failed a valid plan three votes out of three, and the same plan passed
  both halves once split.

**Evidence, not gate.** Before enacting an approved `craft:prune` candidate, or a prompt-surface
audit edit under `skills/` or `agents/`, run the case(s) that drive the touched unit on the tree
before and after the change. Compare Δ and the with-craft score.

| Unit | Case(s) |
|---|---|
| `skills/run` | `run-fires-craft-this`, `run-fires-default-workflow`, `run-quiet-unrelated` |
| `skills/planning`, `agents/planner.md` | `planning-plan-lints` |
| `agents/reviewer.md` | `reviewer-tests-findings` |
| `skills/decisions` | `decisions-noop-when-clear`, `decisions-escalates-fork` |
| `skills/prune`, `contracts/core.md` | `prune-refuses-core` |

A unit missing from this table has no behavioural evidence. Say so in the proposal rather than
implying coverage.

**Tags and cost.** `trigger`: the three run cases, on the session model, run without a tool
grant. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles. Measured `costUsd` per case, one run in each arm (suite pilot, 2026-10-06):

| Case | Tag | `costUsd` | Δ |
|---|---|---|---|
| `run-quiet-unrelated` | trigger | 0.11 | 0.00 |
| `run-fires-craft-this` | trigger | 0.39 | +1.00 |
| `run-fires-default-workflow` | trigger | 0.31 | +1.00 |
| `decisions-noop-when-clear` | phase | 0.33 | +0.50 |
| `decisions-escalates-fork` | phase | 0.29 | 0.00 |
| `prune-refuses-core` | phase | 0.32 | +1.00 |
| `reviewer-tests-findings` | agent | 0.38 | +0.67 |
| `planning-plan-lints` | agent | 0.64 | 0.00 |

Trigger invocation: USD 0.81, ceiling USD 4 at three runs. Phase and agent invocation:
USD 1.96, ceiling USD 9.

**Reviewer output shape.** `reviewer-tests-findings` spawns `craft:reviewer` directly, outside
the review phase, so the agent receives no per-line output contract. Its `findings-shape` grader
therefore accepts a severity word, in any case, within 300 characters of a fixture file name,
in either order, rather than mirroring the normalizer's line grammar. A finding about a missing
test has no line to cite, and the agent writes `HIGH` in one run and `Severity: high` in the
next.

**Observed in the pilots.** craft's skills load in the with-craft arm (`suite.plugins` lists
craft with no `problem`, and the skill fires). craft's agents load too: the child's `init` event
lists every `craft:*` agent, and the reviewer and planner cases spawn theirs. A scaffold reads its
own case directory and the plugin directory (`prune-refuses-core` copies `contracts/` from it),
and commits its fixture. Spawned agents read plugin files by absolute path (the planner read
`templates/plan.md` and ran `scripts/plan-lint.sh`). `prune-refuses-core` reads nothing outside
the sandbox: it looks for `skills/` and `agents/` in the sandbox, finds only the copied
`contracts/`, and says so. Without a shell, the `run-fires-*` cases stop at the run skill's
first step and name no workflow stage, which is why `workflow-engaged` accepts a stop at a
workflow step. A loaded skill's body reaches the `trace` a regex grader reads: the decisions
skill's template line appears there, which is why the decisions graders exclude it.

**What the Δ column says.** `decisions-escalates-fork` 0.00: the bare model escalates the fork
as well, but the fixture's design doc calls it "a product call no ADR covers", which hands it
the answer. `prune-refuses-core` +1.00 measures the denylist firing; the bare model also keeps
the rule, on its own reasoning. `planning-plan-lints` 0.00: the bare plan passes both TDD
clauses; craft's evidence there is the with-only `plan-lint-ok` and `part-sections`.

**Unconfirmed until a later pilot.** Whether craft's hooks load in the eval child: no pilot
command triggered the `git diff` guard, and the trace carries no hook events.

**Troubleshooting: every Bash-granting case is refused.** An error starting "the Docker
(~/.docker, DOCKER_CONFIG) credential store on this machine holds a symbolic link inside it"
means the CLI found a link inside `~/.docker`; it scans that directory even when
`DOCKER_CONFIG` points elsewhere. Docker Desktop's per-user CLI install puts links in
`~/.docker/bin`. Switch Docker Desktop to the System CLI install (Settings → Advanced), move
`~/.docker/bin` out of `~/.docker`, and drop it from your `PATH`. Moving it removes Docker
Model Runner's inference engine until Docker reinstalls it, which brings the links back.

## Model-class matrix (cross-tier) — not CI-gated

On demand / when a maintainer wants the full-pipeline + output-quality matrix: run the
full pipeline on a representative brief once per agent tier of the Claude class — opus
(`claude-opus-5-5`), sonnet (`claude-sonnet-5-5`), haiku (`claude-haiku-4-5`) — record a
tier×dimension PASS/PARTIAL/FAIL table (dimensions: planner / part-TDD / structured-review /
blocker / full-pipeline-completion), and capture the per-phase tokens + wall-clock into the
committed artifact and the run record. A column names the tier the craft agents run at. The
session runs at opus or sonnet, since craft does not support a haiku session; the haiku
column routes the agents to haiku through the manifest's `models.*` keys or the sub-agent
override below.

**Numbers are harness-sourced.** The orchestrator reads `subagent_tokens` and `duration_ms`
from that phase's own sub-agent transcript, not from the spawn's returned final-message usage
block — that block reflects only the sub-agent's last turn, not its cumulative usage, so
trusting it undercounts by roughly two orders of magnitude. This is one file read per phase,
not zero-cost. No agent is asked to report its own usage.

**Where results land:** fill `docs/guides/model-class-matrix.md` (the committed, diffable
artifact template) and append a one-line entry to the run record under
`model-class-matrix`. Rationale: `docs/contributing/archive/DESIGN-P13-nfr-hardening.md`.

**Eval sweep (planner and structured-review rows).** The planner and structured-review cells can
be filled from the behavioural eval suite instead: the `agent`-tagged cases
(`planning-plan-lints` fills planner, `reviewer-tests-findings` fills structured-review), three
runs per tier. The session stays at sonnet in every column; only the agent tier `<agent-id>` moves:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --tag agent --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- Session tier: `claude-sonnet-5-5` in every column. A haiku session
  is not supported, and a fixed session leaves the agent tier as the one variable per column.
  The sonnet column (session and agents at sonnet) repeats the 2026-10-07 configuration and
  is the control against it; the opus and haiku columns are not comparable with 2026-10-07,
  whose session ran at the column tier.
- `<ceiling>`: pilot each tier first with `--runs 1` under the fixed USD 5 cap; ceiling = that
  tier's `costUsd` × 3 × 1.5. Prices differ per tier, and the sonnet column pays an opus judge.
  Measured on 2026-10-07 with the session at the column tier, pilot then sweep: opus USD
  1.00 / 3.07, sonnet 0.56 / 1.61, haiku 0.53 / 1.49; only the sonnet figures carry over to a
  sonnet session.
- `<judge>` is `claude-sonnet-5-5` for the opus and haiku columns and `claude-opus-5-5` for the
  sonnet column, so the judge
  is never at the agent tier under test; it may share the session's tier.
- `--model` moves only the session.
  `agents/planner.md` and `agents/reviewer.md` pin `model: opus`, so the agents need both
  variables (sweep of 2026-10-07, Claude Code 2.1.292): with `CLAUDE_CODE_SUBAGENT_MODEL`
  alone the pin won and a sonnet session spawned opus agents; adding
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` moved them to the override's tier, which equalled the
  session's in that sweep. The override also reaches agents the bare arm spawns, so both
  arms run their agents at the column tier. The trace check below verifies the tiers on
  every run.
- `--keep-temp` keeps each run's sandbox and its trace; the result JSON's `tracePath` points
  at it. The opus column cannot show whether the override works, because the pin is opus.
- Cell = the case's with-craft mean score: PASS = 1.0, PARTIAL ≥ 0.5, FAIL < 0.5.
- The trigger, decisions and prune results, and each tier's Δ for the two agent cases, go in a
  one-line note under the matrix table, not in new rows; the template's shape does not change.
- part-TDD, blocker, full-pipeline-completion and the per-phase tokens stay with the
  full-pipeline run above; no eval case reaches them.

**Plugin checkout, around each tier.** Before launching a tier, outside any sandbox, make sure
`evals/results/` exists, resolve the git directory and mark the time:

```bash
root=<suite.root>; mkdir -p "$root/evals/results"
common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)
marker=$(mktemp) && touch "$marker"
```

After the tier, list what changed since the mark:

```bash
find "$root" -cnewer "$marker" -not -path "$root/evals/results" -not -path "$root/evals/results/*" \
  -not -path "$root/.git/objects/*" -not -path "$root/.git/logs/*" -not -path "$root/.git/index"
[ "$common" = "$root/.git" ] || find "$common" -cnewer "$marker" \( -name config -o -name hooks -o -path '*/hooks/*' \)
```

It must print nothing. It reads inode change times only, so it runs no git after the tier and
sees what `git status` hides: ignored paths (`.claude/`, `node_modules/`), a deleted or
renamed file (through its parent directory), a moved-in file that kept its old mtime, a new
symlink or directory, and a planted git `config` or hook — in the checkout's own `.git/`, or,
when the plugin runs from a linked worktree, in the common git directory. Anything it lists was
changed by a run that left its sandbox: name it in the note under the matrix table and restore
it before the next tier. Writes outside the plugin checkout are not covered here; the trace
check's `left` is the only signal for them.

**Trace check, every run.** Run it on each `aggregate-result.json`. It reads only the kept
traces: a kept sandbox is sealed, so never run git inside it.

```bash
f=evals/results/<ts>/aggregate-result.json; root=$(jq -r .suite.root "$f")
jq -r '.cases[] | .name as $n | .arms | to_entries[] | .key as $a | .value[] | [$n, $a, ((.error // "") | tostring | length), (.tracePath // "")] | @tsv' "$f" |
while IFS=$'\t' read -r name arm errlen trace; do
  if [ ! -s "$trace" ]; then
    if [ "$errlen" -gt 0 ]; then state=NO-TRACE; else state=TRACE-GONE; fi
    printf '%s %s %s\n' "$name" "$arm" "$state"; continue
  fi
  sandbox=$(dirname "$(dirname "$trace")")
  allowed="$sandbox /dev /bin /sbin /usr/bin /usr/sbin /usr/local/bin /opt/homebrew/bin /Library/Developer/CommandLineTools/usr/bin"; exact=""
  [ "$name" = planning-plan-lints ] && { allowed="$allowed $root/templates $root/scripts"; exact=$root; }
  tiers=$(jq -r 'select(.type=="assistant") | "\(if .parent_tool_use_id then "agent" else "session" end)=\(.message.model)"' "$trace" | sort -u | tr '\n' ' ')
  gitfail=$(jq -s --arg m "Failed to locate 'git'" '[.[] | select(.type=="user") | .message.content[]? | select(.type=="tool_result" and ((.content | tostring) | contains($m)))] | length' "$trace")
  left=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use")
      | (if .name == "Grep" then .input | del(.pattern) else .input end)
      | del(.content, .new_string, .old_string, .edits, .new_source, .todos, .prompt, .description) | .. | strings' "$trace" |
    grep -oE "(^|[[:space:]\"'=(;&|<>\`]|:-)/[^[:space:]\"'\\;&|()<>,{}\`]*" | sed -E 's|^[^/]*||; s|^/tmp(/\|$)|/private/tmp\1|; s|^/var(/\|$)|/private/var\1|' |
    awk -v allowed="$allowed" -v exact="$exact" '
      { n = split($0, seg, "/"); depth = 0
        for (i = 2; i <= n; i++) { if (seg[i] == "" || seg[i] == ".") continue
          if (seg[i] == "..") { if (depth > 0) depth--; continue } out[++depth] = seg[i] }
        p = ""; for (i = 1; i <= depth; i++) p = p "/" out[i]; if (p == "") p = "/"
        k = split(allowed, a, " "); inside = (p == exact)
        for (i = 1; i <= k; i++) if (p == a[i] || index(p, a[i] "/") == 1) inside = 1
        if (!inside) count++ }
      END { print count + 0 }')
  printf '%s %s %s gitfail=%s left=%s\n' "$name" "$arm" "${tiers:-NO-EVENTS }" "$gitfail" "$left"
done
```

- `NO-TRACE`: the run errored before Claude started (a failed scaffold, a CLI swapped by an
  auto-update mid-run). It has no grades worth reading: re-run it, never fill a cell from it.
  `TRACE-GONE`: the run did not error but its kept sandbox has since been removed (macOS
  clears `/private/tmp` on reboot); its grades stand, but its tiers and `left` cannot be read.
- `tiers`: assistant events with a `parent_tool_use_id` are the agent's. Session events
  must name `claude-sonnet-5-5` and agent events the column's `<agent-id>`, matched on the
  prefix: `message.model` carries a dated id such as `claude-haiku-4-5-20251001`. A run
  whose agent events show another tier invalidates its column: say so in the note under
  the matrix table and leave the cell unfilled. A with-arm run with no `agent=` entry, or a
  run with no `session=` entry (`NO-EVENTS`), cannot show its tier: name it in the note.
- `left`: absolute paths a run's tools named outside its own sandbox (the parent of `out/`).
  Every string in a tool's input counts — Bash commands line by line, and every file tool's
  path or Glob pattern — except payload: file contents, edit strings, notebook sources, todo
  text, agent prompts and Grep's regex. A path counts wherever it starts a line or follows
  whitespace, a quote, `=`, `(`, `;`, `&`, `|`, `<`, `>`, a backtick or `:-`. Paths are
  resolved for `..`, and `/tmp` and `/var` are read as their `/private` targets. System
  binary directories and `/dev` are allowed, and so is the Command Line Tools `bin`, which
  agents try when `/usr/bin/git` fails. The planner case also may name the plugin root itself
  and its `templates/` and `scripts/`, which the planning skill reads and runs. Every run must
  show `left=0`; name any run with `left>0` in the note under the matrix table, after reading
  the paths in its trace, since prose such as ` / ` or a `sed` address can over-count. Not
  counted: paths reached through `~`, a variable or a relative `..` chain; the file-time check
  above catches them only when they change the plugin checkout.
- `gitfail`: how many tool results say `Failed to locate 'git'`. It is reported in the note,
  not a pass condition.

## Registered-phase dispatch smoke — not CI-gated

On demand / when end-to-end cross-plugin fidelity must be confirmed: spin up a throwaway
two-plugin fixture (mirroring SP2's `/tmp/craft-sp2`) and drive it with
`claude -p --plugin-dir craft --plugin-dir <pluginB>`, using a manifest that registers a
phase via `extends.phases` pointing at a `pluginB:` procedure. Assert the registered phase
dispatches (the walk reaches step 2 for it) and spawns (an agent is started under the
assembled contract). Document the result in the run record. This smoke is on-demand, NOT
CI-gated — the engine path it exercises is CI-proven by the S7 scenario fixture; this smoke
adds runtime cross-plugin fidelity without coupling CI to a second install.

## SC5 second-instantiation smoke — not CI-gated

On demand / when zero-config fidelity on a non-tsgit toolchain must be confirmed: take a
second repo with a test command discoverable without a manifest and **no** `.claude/workflow.md`
(e.g. a small Python + `pytest` project), then drive the default pipeline against it on a small
free-text brief (zero manifest ⇒ no `backlog:`, so the input is a brief/file, never a backlog
id). Confirm the per-phase capability-probe matrix: `worktree-setup.sh` detects the ecosystem
(or reports a noted skip when no lockfile is recognized); the gate probe discovers the repo's
test command (`pytest`/`go test`/`cargo test`/…) and `implementation` runs rather than hitting
the gate-floor REFUSE; `validation` no-ops with a note when no techniques declared/probed
(and its `propose`-gate entry is released, so the walk reaches `propose`); `propose`/`integrate`
no-op when there is no remote. Record the target's identity, toolchain, discovered gate command,
and per-phase outcomes in `docs/contributing/archive/SC5-second-instantiation-record.md`. This smoke is on-demand, NOT
CI-gated — the engine path it exercises (toolchain-neutral resolution) is CI-proven by the `SC5`
scenario fixture; this smoke adds runtime fidelity on a real second toolchain without coupling CI
to a non-JS install.
