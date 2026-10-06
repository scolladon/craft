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

**First run in this checkout** — the three cheap trigger cases, one run each:

```bash
claude plugin eval . --tag trigger --runs 1 --no-publish --max-cost-usd 5
```

- The CLI asks once whether you trust the plugin. Answer it interactively: `--trust-plugin`
  answers it for CI, and craft never runs evals in CI.
- `--max-cost-usd 5` is the fixed cap for the very first pilot; every later ceiling derives
  from a measured cost.
- Open `evals/results/<timestamp>/aggregate-result.json`. `suite.plugins` must list craft with
  no `problem` (`manifest_invalid`, `disabled_by_default`, `will_not_load`). If one is present,
  stop: the with-craft arm never loaded craft and the run means nothing.
- The run must not print `⚠ case … cannot pass with the granted tools`.
- The top-level `costUsd` prices the three trigger cases only. It says nothing about the
  fixture and agent cases, so no full-suite ceiling derives from it.

**Suite pilot** — every case once, before the first full run:

```bash
claude plugin eval . --runs 1 --no-publish --scaffold --allow-tools Write Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd 5
```

- Same flags as the full suite below, one run per case, under the same fixed USD 5 cap as the
  first run.
- If it exits 2, pilot each case it did not reach by name (`--case <name>`), each under the
  same cap, and add their `costUsd` to the partial run's. A case that alone hits the cap needs
  its own larger cap for its pilot; say so in the run record.
- Read each case's duration too: a case that ran into its `timeout_seconds` scored 0 in both arms
  and needs a larger budget before a full run.

**Full suite:**

```bash
claude plugin eval . --no-publish --scaffold --allow-tools Write Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd <ceiling>
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
  file can name. The grant reaches only the cases that list Bash, and the child's shell runs
  inside the CLI's OS sandbox.
- `--judge-model claude-sonnet-5-5`: the default judge is haiku, below the sonnet-tier floor for
  rubric graders. The judge is never the model under test.
- `--max-cost-usd <ceiling>`: ceiling = suite-pilot `costUsd` × runs × 1.5.
- `--runs` stays at the default 3, the CLI's floor; `--runs 1` is only for piloting a new or
  edited case. `-j` stays at 1: every run shares one subscription rate limit.

**One case.** Add `--case <name>` to the full-suite command, with `--runs 1` while iterating.
Only the `run-*` cases work with the first-run command, which carries neither `--scaffold` nor
`--allow-tools`.

**Debugging a scaffold.** Pass `--keep-temp` to keep the sandbox. Each `scaffold.sh` refuses to
run outside a git repository or in one that already has a commit, so running one by hand in this
checkout, or in any other directory, stops before it copies or commits anything.

**Reading results.**

- The headline per case is Δ = with − without.
- `with-only` graders match craft-only tokens. They report whether craft fired and sit outside
  the score.
- A Δ near 0 with a high without-craft score means the bare model already does the job. That is
  the evidence a prune candidate needs.
- Exit 1: a case scored below `--threshold` (1.0 by default); informational for a local run.
  Exit 2: the ceiling was hit and the results are partial. Re-pilot that case and recompute the
  ceiling rather than raising the cap blindly.
- An implausible jump is judge-gaming until you have read the judge's reasoning. Before the
  first full run, read each grade and ask whether you would have scored it differently.

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

**Tags and cost.** `trigger`: the three run cases, on the session model, the cheapest
meaningful run. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles and the dearest. Cheap to dear: `run-quiet-unrelated`, the two `run-fires-*`,
the two `decisions-*`, `prune-refuses-core`, `reviewer-tests-findings`, `planning-plan-lints`.

**Reviewer output shape.** `reviewer-tests-findings` spawns `craft:reviewer` directly, outside
the review phase, so the agent receives no per-line output contract. Its `findings-shape` grader
therefore accepts a severity word and a `file:line` on one line, in either order, rather than
mirroring the normalizer's line grammar.

**Observed in the first pilots.** craft's skills load in the with-craft arm (`suite.plugins`
lists craft with no `problem`, and the skill fires). A scaffold reads its own case directory and
commits its fixture. A loaded skill's body reaches the `trace` a regex grader reads: the
decisions skill's template line appears there, which is why the decisions graders exclude it.

**Unconfirmed until a later pilot.** Read from the CLI's source, not yet observed: whether
craft's agents and hooks load in the eval child; whether a scaffold can read the plugin
directory (`prune-refuses-core` copies `contracts/` from it); whether
`CLAUDE_CODE_SUBAGENT_MODEL` reaches the spawned agents (see the eval sweep below); whether
`prune-refuses-core` reads files under the plugin root beyond the copied `contracts/`; whether
the `run-fires-*` cases, with craft loaded, name two workflow stages before stopping at their
first precondition, as `workflow-engaged` requires.

**Troubleshooting: every Bash-granting case is refused.** An error starting "the Docker
(~/.docker, DOCKER_CONFIG) credential store on this machine holds a symbolic link inside it"
means the CLI found a link inside `~/.docker`; it scans that directory even when
`DOCKER_CONFIG` points elsewhere. Docker Desktop's per-user CLI install puts links in
`~/.docker/bin`. Switch Docker Desktop to the System CLI install (Settings → Advanced), move
`~/.docker/bin` out of `~/.docker`, and drop it from your `PATH`. Moving it removes Docker
Model Runner's inference engine until Docker reinstalls it, which brings the links back.

## Model-class matrix (cross-tier) — not CI-gated

On demand / when a maintainer wants the full-pipeline + output-quality matrix: run the
full pipeline across the Claude class — opus (`claude-opus-5-5`), sonnet
(`claude-sonnet-5-5`), haiku (`claude-haiku-4-5`) — on a representative brief,
record a tier×dimension PASS/PARTIAL/FAIL table (dimensions: planner / part-TDD /
structured-review / blocker / full-pipeline-completion), and capture the per-phase
tokens + wall-clock into the committed artifact and the run record.

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
runs per tier. For each tier `<id>`:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<id> claude plugin eval . --tag agent --model <id> \
  --no-publish --scaffold --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- `<ceiling>`: pilot each tier first with `--runs 1` under the fixed USD 5 cap; ceiling = that
  tier's `costUsd` × 3 × 1.5. Prices differ per tier, and the sonnet column pays an opus judge.
- `<judge>` is `claude-sonnet-5-5` for the opus and haiku columns and `claude-opus-5-5` for the
  sonnet column, so the judge is never the model under test.
- `--model` alone moves only the session tier: `agents/planner.md` and `agents/reviewer.md` pin
  `model: opus`. The exported `CLAUDE_CODE_SUBAGENT_MODEL` carries the tier to the spawned
  agents. If the pin still wins, also export `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`. Record which
  form was needed. If neither reaches the agents, the agent rows ran at the pinned tier: say so
  in the note under the matrix table.
- Cell = the case's with-craft mean score: PASS = 1.0, PARTIAL ≥ 0.5, FAIL < 0.5.
- The trigger, decisions and prune results, and each tier's Δ for the two agent cases, go in a
  one-line note under the matrix table, not in new rows; the template's shape does not change.
- part-TDD, blocker, full-pipeline-completion and the per-phase tokens stay with the
  full-pipeline run above; no eval case reaches them.

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
