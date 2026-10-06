# Design — behavioural eval suite for craft (`claude plugin eval`, local only)

> Brief: give craft a behavioural eval suite under `claude plugin eval` (Claude Code ≥ 2.1.291).
> It runs locally, by hand, never in CI. It feeds the model-class matrix, and it is the advisory
> evidence step for `craft:prune` removals and prompt-surface audits.
> Status: draft → self-reviewed ×3 → accepted

## Context

**What exists.** craft's checks are structural only:

- `scripts/ci.sh` runs the node suites (`run_suite`, which `find`s `*.test.js` under `engine/test`, `adapters/*/test`, `test`).
- It also runs the lint chain (shellcheck over `scripts/*.sh hooks/*.sh`, `design-lint` over `docs/contributing/design/*.md`, `docs-structure-lint`, `sync-adapter-agents --check`), the touched-diff hygiene lints (`run_stub_lint`, `run_prose_lint`) and whole-corpus `adr-lint`.
- `.github/workflows/ci.yml` runs only `bash scripts/ci.sh` and `bash scripts/readme-drift.sh`.

None of these measures whether a skill or agent behaves as its prompt says.

**Surfaces this design touches:**

| Surface | Today |
|---|---|
| `docs/contributing/maintainer-smokes.md` | Four sections, each "— not CI-gated". The "Model-class matrix (cross-tier)" section describes a full-pipeline sweep that fills `docs/guides/model-class-matrix.md`, with five dimensions (planner / part-TDD / structured-review / blocker / full-pipeline-completion) plus per-phase tokens. Every cell is still "— (not yet run)". |
| `docs/guides/model-class-matrix.md` | Template. Its "How to refresh" section points at the maintainer-smokes section. No test pins its shape (`engine/test/model-class-shape.test.js` pins contract assembly and findings normalization, not this file). |
| `skills/prune/SKILL.md` | Advisory, read-only, propose-never-dispose (ADR-209). "Enacting an approved prune" routes an approved candidate through a normal craft run. Pinned by `test/prune-lens.test.js`. It has no adapter mirror (`grep -rl prune adapters` → nothing). |
| `skills/run/SKILL.md` § "Maintainer smokes — not CI-gated" (l. 476–480) | Lists the on-demand checks one by one ("inline fidelity, the model-class matrix, registered-phase dispatch, second-instantiation"). The adapter `craft-run` shims (antigravity, codex, cursor) are 22-line shims and do not carry this list. |
| Prompt-audit workflow | No standalone doc exists. PR #17's audit was a plain craft run. The only places that govern prompt-surface edits are `skills/integrate/SKILL.md` step 4, which offers a baseline refresh when `skills/`/`agents/` change, and `skills/metrics/SKILL.md` § refreshing the baseline. Both are generic run-time prompts that execute in **every** user's repo. |
| `README.md` § Docs (l. 258–268) | Ends with "Contributing to craft itself? Dev loop: `claude --plugin-dir /path/to/craft`." This is the natural discovery line. |
| `.claude-plugin/plugin.json` | Has no `experimental` key. Every installed user receives this manifest. |
| `.gitignore` | Has no `evals/` entry. |

**Constraining decisions:**

- **ADR-209** (`docs/contributing/adr/209-standing-harness-prune-skill.md`): prune is manual and advisory. The user declined auto-classifying load-bearing units and declined an advisory CI signal, so eval evidence for prune must stay a human-run step.
- **ADR-247** (`docs/contributing/adr/247-copilot-proof-seams-plus-on-demand-smoke.md`): the house precedent for "deterministic seams in CI plus an on-demand paid smoke".
- **ADR-355** (`docs/contributing/adr/355-adr-lint-is-whole-corpus-and-hard-blocking.md`) governs `adr-lint`. This doc cites only accepted ADRs, so the hard-blocking gate stays green.

**Static constraints probed in this tree** (a new file under `evals/` must not trip them):

| Gate | Scope | Effect on `evals/` |
|---|---|---|
| `run_suite` (`ci.sh` l. 15–45) | `find <suite_dir> -name '*.test.js'` over 9 fixed dirs | `evals/` is never a suite dir. Cases carry no `*.test.js`. |
| `test/every-test-file-registers.test.js` | `SUITE_DIRS` list | Unaffected. |
| `test/source-hygiene.test.js` | `SCANNED_PATHS` = pipeline, skills, agents, contracts, templates, engine/src, specs, DOD, customizing.md, README.md | `evals/` is not scanned. **Edits to `skills/prune/SKILL.md`, `skills/run/SKILL.md` and `README.md` are scanned.** Their wording must avoid Class A (`stryker\|mutation\|mutant\|…`) and Class B (`\bgh\b\|\bgithub\b`). |
| `run_stub_lint` (`ci.sh` l. 114–127) | Touched `*.js\|*.sh\|…` outside test dirs. Touched `*.md` count only as waiver sources. | Case `scaffold.sh` files are stub-linted (advisory; `.claude/workflow.md` has no `hygiene` block). They carry none of `TODO FIXME HACK XXX PLACEHOLDER STUB`. |
| `run_prose_lint` (`ci.sh` l. 129–140) | Touched `*.md` except adr/design/archive/specs/prd/plan | Every `evals/**/*.md` is prose-linted (advisory). Prompts and rubrics avoid `delve, leverage, seamless, robust, it's important to note, in conclusion`. |
| shellcheck (`ci.sh` l. 80) | `scripts/*.sh hooks/*.sh` only | `evals/**/scaffold.sh` is not shellchecked in CI. The author shellchecks it by hand during the build, so CI never reads `evals/`. |
| `docs-structure-lint --audience docs` | Top level of `docs/` must be README.md, guides/, contributing/ | `evals/` sits at the repo root, never under `docs/`. |
| `design-lint`, `adr-lint`, `intention-lint` | `docs/contributing/{design,adr}` and a fixed living corpus | Fixture docs under `evals/*/fixture/docs/...` are outside every scope. |
| User global gitignore | Excludes every `.claude/` (`.gitignore` l. 1–5) | **A fixture must never carry `.claude/`.** It would silently drop from the commit. Fixtures run on no-manifest defaults. |

## Requirements

1. **R1 — Suite.** 5–8 cases under the eval dir. Each is `<case>/prompt.md` plus `graders/*.md`, and a `case.yaml` only when the case needs a fixture. Together they satisfy the CLI's own floors:
   - ≥1 should-NOT-fire case;
   - ≥1 outcome grader per case (not only `tool_used`/`tool_order`);
   - `runs` ≥ 3 (inherited default; no case sets `runs` lower);
   - ablation left at `with-without`.
2. **R2 — Cases load.** Every case loads under CLI 2.1.291:
   - no `prompt.md` frontmatter key outside the pinned allowlist;
   - no `init` template `TODO` line;
   - no absolute or `~/` path;
   - every tool a grader implies is listed in `allowed_tools`.
3. **R3 — Never CI.** `scripts/ci.sh`, `.github/workflows/*` and every `*.test.js` neither invoke `claude plugin eval` nor read anything under `evals/`. A CI guard test pins this positively.
4. **R4 — Results stay local.**
   - `/evals/results/` is gitignored.
   - Every documented `claude plugin eval` run command carries `--no-publish`. A CI guard test pins this over `maintainer-smokes.md`.
   - Any documented `--scaffold` / `--allow-tools` / `--trust-plugin` / `--mocks off` sits next to the sentence that justifies it.
5. **R5 — Maintainer procedure.** `docs/contributing/maintainer-smokes.md` covers: how to run; the cost ceiling; `--runs`; reading the with/without Δ; the model-class sweep. The existing model-class section is amended to say which matrix rows the eval sweep fills, not duplicated.
6. **R6 — Advisory evidence.** `skills/prune/SKILL.md` says a removal candidate *should* be checked against the relevant case(s) before it is enacted. The same advice for prompt-surface audits lives in the maintainer-smokes eval section. No new engine floor, token, lint or pipeline phase.
7. **R7 — Discovery.**
   - One README line (§ Docs) and one sentence in `docs/guides/model-class-matrix.md` § How to refresh point at the procedure.
   - The run skill's smoke list stays a true enumeration (DC-10).
   - The README's "31 design docs" claim is drift-gated (`engine/src/readme-drift-main.js` `corpusCountFindings`, run by `engine/test/readme-drift-main.test.js` and `scripts/readme-drift.sh`). It is bumped to 32 in the same commit as this doc. Any later ADR added by the decisions phase bumps the ADR count the same way.

## Design

### Pinned `claude plugin eval` contract (Claude Code 2.1.291, probed 2026-10-06)

Pinned from `claude plugin eval --help` / `init --help` and a throwaway `init --bare`. Where the help is silent, it is pinned by a static read of the CLI's bundled source (embedded zod schema, runner argv/env construction, authoring-interview spec). No paid run was made. Rows marked **(smoke)** are inferred from source and must be confirmed by the first user-approved pilot.

| Concern | Pinned behaviour |
|---|---|
| Discovery | `<eval dir>/**/case.yaml` OR `prompt.md` + `graders/*.md`. Eval dir = `--eval-dir`, else `experimental.evals` (string, relative to plugin root, `"experimental": {"evals": "quality/evals"}`), else `evals/`. Both files may coexist in one case dir; `prompt.md`/`graders/` override or extend `case.yaml`. |
| `prompt.md` frontmatter | Only the top-level keys `schema_version name description tags plugins runs expected_outcome` and the execution keys `model max_turns timeout_seconds allowed_tools artifact_publish growthbook_overrides append_system_prompt env`. Anything else is a hard error: `unknown frontmatter key`. |
| `case.yaml` only | `context.{scaffold_script, history_file, add_dirs}`. `schema_version` is required (≤ `1.x`). `execution.max_turns` ≤ 200 (default 10), `timeout_seconds` ≤ 3600 (default 300), `runs` ≤ 50 (default 3). `execution.env` keys must match `EVAL_*` — "anything else must come from the operator's shell". |
| Grader file | `graders/<name>.md`. Basename = grader name. Frontmatter `type` is required. The body fills `criteria` (llm/baseline) or `pattern` (regex). A `.md` with no frontmatter is skipped silently. |
| Grader types | `regex` (`target: last_message\|trace\|files\|mock_calls\|{source: file, path}`, `match: contains\|not_contains\|count:N`, `flags` ⊆ `dgimsuvy`); `file_exists` (`path` glob, `exists`); `llm` (`focus` as target); `tool_used` (`tool`, `input_match`, `min` default 1, `max`); `tool_order` (`before`, `after`); `baseline`. All take `weight` (default 1) and `arm: with-only\|both`. **No grader executes a command.** "Passes plan-lint" or "normalizes" must be observed in the trace or replicated as a regex. |
| `files` target | Paths **created** during the run. A pre-existing file that was modified does not appear. `file_exists` reads the same list. |
| Ablation | `with-without` by default whenever the plugin resolves. A `with-only` grader is a plugin-fired indicator, outside the score. `tool_used: Skill` with `arm` unset is display-only. A "must not call X" check is `min: 0, max: 0, arm: both`. |
| Tool grant | Effective tools = case `allowed_tools` ∩ (read-only set ∪ operator `--allow-tools`). Gated: `Bash, Write, Edit, WebFetch, mcp__*`. The runner's own warning: "a skill's own allowed-tools does not count inside a run — add Write (or Edit / Bash) to the case's allowed_tools and grant it with --allow-tools". The sub-agent tool is named `Agent`. |
| Child session | `claude -p --output-format stream-json --verbose --max-turns N --permission-mode dontAsk --setting-sources user [--model=X] --plugin-dir <plugin>`, with `CLAUDE_CONFIG_DIR`/`HOME` set to a sandbox. The maintainer's `~/.claude/CLAUDE.md` is therefore **not** loaded, and "use my default workflow" fires only through the run skill's own description triggers. **(smoke)** Whether plugin `agents/*.md` and `hooks/` load in the child. |
| Sandbox | The run cwd is a fresh git repo per run (author "Plugin Eval"). The plugin dir, the case dir and `add_dirs` are readable. No absolute or `~/` paths are allowed in prompts or graders. |
| `scaffold_script` | Runs only with `--scaffold` (otherwise: notice "the case runs against an unstaged workspace"). Invocation is `bash <script>`, with cwd = the run's sandbox cwd and env `PATH`, sandbox `HOME`/`TMPDIR`, `GIT_CONFIG_NOSYSTEM=1`. stdout is ignored; stderr is kept for errors. SIGKILL after 120 s. A non-zero exit makes the run errored and scored 0. It runs before **every** run, both arms. |
| `add_dirs` | Must resolve inside the case or plugin dir, outside VCS metadata. It grants **read** rules (`Read/Glob/Grep(<dir>/**)`) and copies nothing into cwd. **(smoke)** How the child learns the path. |
| Run flags | `--case <glob>`, `--tag`, `--runs`, `--model`, `--judge-model` (default **haiku**), `--max-cost-usd` (checked before each launch, exit 2, partial results; paid graders skipped on breach), `--no-publish` (**default publishes the HTML report to claude.ai**), `--threshold` (default 1.0, exit 1 below), `-j` 1–8 (shared rate limit), `--trust-plugin`, `--scaffold`, `--allow-tools`, `--mocks`, `--keep-temp`, `--json`, `--report`, `--output-dir`. |
| Results | `<plugin>/<eval dir>/results/<timestamp>/aggregate-result.json`. `suite.plugins[]` must list craft with no `problem` ∈ {`manifest_invalid`, `disabled_by_default`, `will_not_load`}. Top-level `costUsd`. On a subscription credential `costUsd` is an API-equivalent figure; the binding constraint is the subscription rate limit. |
| Floors (CLI interview spec) | ≥1 should-NOT-fire case. Every case has an outcome grader. Runs ≥ 3. Ablation stays. llm judge sonnet-tier or larger and never the agent model. Grade outcomes over trajectories. Budgets: one-shot ≈ 60–120 s / 5 turns; repo-reading work ≈ 600–900 s / 25–40 turns. An under-set budget scores 0 in **both** arms. |

### Layout

```
evals/                                  # CLI default; no plugin.json key (DC-1)
├── run-fires-craft-this/               prompt.md, graders/
├── run-fires-default-workflow/         prompt.md, graders/
├── run-quiet-unrelated/                prompt.md, graders/          ← should-NOT-fire
├── planning-plan-lints/                case.yaml, scaffold.sh, fixture/, prompt.md, graders/
├── reviewer-tests-findings/            case.yaml, scaffold.sh, fixture/, fixture-head/, prompt.md, graders/
├── decisions-noop-when-clear/          case.yaml, scaffold.sh, fixture/, prompt.md, graders/
├── decisions-escalates-fork/           case.yaml, scaffold.sh, fixture/, prompt.md, graders/
├── prune-refuses-core/                 case.yaml, scaffold.sh, prompt.md, graders/
└── results/                            gitignored (/evals/results/)
```

- **Case names** are kebab-case and free of `-P<n>-` / `SC5-` / `SPIKE`. They are unique, because `--case` cannot tell duplicates apart.
- **Fixture naming.** No fixture file is named `prompt.md` or `case.yaml`, since nested discovery would treat it as a case. No fixture carries `.claude/`.
- **`case.yaml` shape** (fixture cases only):
  ```yaml
  schema_version: "1.0"
  context:
    scaffold_script: scaffold.sh
  ```
- **`scaffold.sh` shape** (DC-2). Shared body, ≤ 10 lines, shellchecked by hand:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  src="$(cd "$(dirname "$0")" && pwd)/fixture"
  cp -R "$src/." .
  git add -A
  git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
  ```
  A case that needs a diff range (reviewer) commits twice: a base, then `fixture-head/` copied over and committed. `prune-refuses-core` copies `"$(dirname "$0")/../../contracts"` (the plugin's **live** contracts, so they never drift) instead of a `fixture/`. **(smoke)** Whether the scaffold process can read its own case dir and the plugin dir.

### Cases

Budget column: `max_turns / timeout_seconds`. Tools column: the case's `allowed_tools`. Arm column: the arm of each grader. "Without meaningful?" says whether the no-plugin arm yields signal (DC-3).

| Case | Drives | Fixture | Tools | Budget | Graders (type, arm — spec) | Without meaningful? |
|---|---|---|---|---|---|---|
| `run-fires-craft-this` | skill `craft:run` (trigger) | none (empty sandbox) | `Read, Glob, Grep, Skill` | 8 / 180 | `fired`: tool_used `Skill` `input_match: craft:run`, arm unset (display-only). `workflow-engaged`: llm, both — "the reply treats the request as input to a multi-phase delivery workflow (resolving a brief/manifest, naming phases, or stopping on a workflow precondition); it does not present a finished implementation". Prompt: "craft this: add a `--shout` flag to greet.sh that uppercases the greeting." | **Yes.** The bare model answers ad hoc, so Δ = trigger uplift. |
| `run-fires-default-workflow` | skill `craft:run` (trigger, second input shape) | none | as above | 8 / 180 | Same two graders. Prompt: "Use my default workflow to add a `--shout` flag to greet.sh." | **Yes** |
| `run-quiet-unrelated` | skill `craft:run` (must NOT fire) | none | `Read, Glob, Grep, Skill` | 3 / 90 | `not-fired`: tool_used `Skill` `input_match: craft:` `min: 0 max: 0`, both. `answers`: llm, both — "states in ≤ 3 sentences that a squash merge collapses the branch into one new commit on the target while a rebase replays each commit onto the new base". Prompt: "In two sentences, how does `git merge --squash` differ from `git rebase`?" | **Yes.** Expected Δ ≈ 0. A negative Δ means over-triggering. |
| `planning-plan-lints` | skill `craft:planning` → agent `craft:planner` | `greet.sh`; `docs/design/shout-flag.md` (6 craft headings, zero decision candidates); `docs/adr/001-shout-flag-uppercases.md` | `Read, Glob, Grep, Skill, Agent, Write, Bash` | 40 / 900 | `plan-written`: file_exists `docs/plan/*.md`, both. `plan-lint-ok`: regex `trace` `plan-lint: \d+ part\(s\) OK`, with-only (the plugin's own lint line). `tdd-parts`: llm `{source: file, path: docs/plan/shout-flag.md}`, both — "every part names a failing test before changing greet.sh; each part carries Context, TDD steps, Gate and Commit; no part touches a file the design does not name". Prompt: "Run the craft planning phase standalone for the accepted design docs/design/shout-flag.md (decision in docs/adr/001-shout-flag-uppercases.md); write the plan to docs/plan/shout-flag.md." | **Yes** for `tdd-parts` (does planner prose beat a bare plan?). The lint line is with-only. |
| `reviewer-tests-findings` | agent `craft:reviewer`, dimension `tests` (direct, DC-4) | base commit: `greet.sh`, `test/greet.test.sh`, `package.json` (`"test"` and a `"mutation"` script naming the mutation tool); head commit: `--shout` added to greet.sh with no test | `Read, Glob, Grep, Agent, Bash` | 25 / 600 | `findings-shape`: regex `last_message`, flags `m`, both — `^(\S+\s+\S+:\d+\s+[—–-]\s+\S\|\s*\[\s*\{)` (the per-line head from `engine/src/findings.js` `LINE_HEAD_PATTERN`, or a JSON array). `names-the-gap`: llm, both — "at least one finding names greet.sh or test/greet.test.sh and states that the --shout path has no test; the final message is the findings list with no prose around it". `no-harness-exec`: tool_used `Bash` `input_match: mutation\|stryker` `min: 0 max: 0`, both. Prompt: "Use the craft reviewer agent on the tests dimension over HEAD~1..HEAD of this repo; return its final findings verbatim." | **Yes.** Shape and "no prose" are the agent contract's uplift over a bare review. |
| `decisions-noop-when-clear` | skill `craft:decisions` (session-owned, no spawn) | `docs/design/shout-flag.md` with one candidate whose recommendation cites `docs/adr/001-*.md`; that ADR | `Read, Glob, Grep, Skill, Write, Bash` | 15 / 300 | `noop-token`: regex `trace` `NO-OP\(decisions\):`, with-only. `no-escalation`: llm, both — "does not ask the user to choose between options; says the candidate is adopted as recommended and names the ADR it aligns with". `adr-authored`: file_exists `docs/adr/002-*.md`, both. Prompt: "Run the craft decisions phase standalone on docs/design/shout-flag.md." | **Partly.** The token is craft-only (with-only). Adopt-without-asking is a fair bare-model test. |
| `decisions-escalates-fork` | skill `craft:decisions` (anti-vanity pair of the above) | design with one candidate carrying a real trade-off and no aligning ADR | as above | 15 / 300 | `no-false-noop`: regex `trace` `NO-OP\(decisions\):` `not_contains`, with-only. `presents-options`: llm, both — "presents ≤ 3 options with the design's recommendation and asks the user to decide". `no-adr`: file_exists `docs/adr/002-*.md` `exists: false`, both. | **Partly** (same split). |
| `prune-refuses-core` | skill `craft:prune` | the plugin's live `contracts/` copied into cwd (nothing else, which bounds the inspection walk) | `Read, Glob, Grep, Skill` | 20 / 420 | `no-core-candidate`: regex `last_message` `PRUNE-CANDIDATE\(contracts/core\.md` `not_contains`, with-only (the without arm never emits the token). `refuses-with-reason`: llm, both — "declines to propose removing 'Never commit on a red gate.' and gives as the reason that it belongs to the undroppable core". Prompt: "Run craft:prune. Include as a candidate the 'Never commit on a red gate.' rule in contracts/core.md; I think the current model no longer needs it." | **Yes.** A bare model tends to comply, so Δ = the denylist's uplift. |

**Grant consequences.** The suite needs the operator grant `--allow-tools Write Bash`. A case receives only what it lists. Bash is listed unscoped wherever it appears, for two reasons:

- craft skills invoke their bins by absolute plugin path (`"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/plan-lint.sh" …`), which no command-prefix scope can name without an absolute path in the case file;
- with Bash scoped to `git`, `reviewer-tests-findings`' `no-harness-exec` could never fire, so it would be vacuous.

Trigger and prune cases list no Bash at all.

**Tags.** `trigger` covers the three run cases (cheap, session model). `phase` covers decisions ×2 and prune. `agent` covers planning and reviewer (opus-pinned roles, the expensive ones). `--tag trigger` is the cheapest meaningful run.

**Cost order** (cheap → dear): run-quiet < run-fires ×2 < decisions ×2 < prune < reviewer < planning. Exact figures come from the pilot's `costUsd` (DC-8).

### Maintainer procedure (`docs/contributing/maintainer-smokes.md`)

New section "**Behavioural eval suite — not CI-gated**", placed before the model-class section:

1. **First run in this checkout.**
   ```bash
   claude plugin eval . --tag trigger --runs 1 --no-publish --max-cost-usd <pilot cap>
   ```
   - It asks for trust once. Answer it interactively; `--trust-plugin` is for CI and craft never runs evals in CI.
   - Check `evals/results/<ts>/aggregate-result.json`: `suite.plugins` lists craft with no blocking `problem`, and no `⚠ … cannot pass with the granted tools` line was printed.
2. **Full suite.**
   ```bash
   claude plugin eval . --no-publish --scaffold --allow-tools Write Bash \
     --judge-model claude-sonnet-5-5 --max-cost-usd <ceiling>
   ```
   Every flag sits next to its reason:
   - `--no-publish`: publishing is the CLI default and an external surface.
   - `--scaffold`: the scaffolds are craft's own reviewed ≤ 10-line copies into the sandbox; without it, fixture cases run against an empty repo and score 0 in both arms.
   - `--allow-tools`: the runner ignores a skill's own tool grants; the fixture cases write files and run git.
   - `--judge-model`: the default judge is haiku.
   - `-j` stays 1: the shared subscription rate limit.
   `--runs` is left at the default 3 (DC-8).
3. **One case.** Add `--case <name>` (and `--runs 1` while iterating on a new case).
4. **Reading results.**
   - The headline per case is **Δ = with − without**.
   - `with-only` graders are the "craft fired" indicator.
   - A case with Δ ≈ 0 and a high without-arm score is evidence that the bare model already does the job. That is exactly what a prune candidate needs.
   - Exit codes: exit 1 = some case below `--threshold` (1.0 by default; informational for a local run); exit 2 = the ceiling hit, results are partial.
   - An implausible jump is judge-gaming until spot-checked by hand.
5. **Evidence, not gate.** Before enacting an approved prune candidate, or a prompt-surface audit edit to `skills/`/`agents/`, run the case(s) that drive the touched unit on the pre-change and post-change tree. Compare Δ and the with-arm score. A table maps each unit to its case(s): `skills/run` → run-*, `skills/planning` + `agents/planner` → planning-plan-lints, `agents/reviewer` → reviewer-tests-findings, `skills/decisions` → decisions-*, `skills/prune` + `contracts/core.md` → prune-refuses-core. A unit with no case has no behavioural evidence, so the doc says so rather than implying coverage.

The **model-class matrix section** is amended, not duplicated (DC-6):

- The eval sweep (same command plus `--model <id>` per tier, run 3×, judge per DC-7) fills the **planner** and **structured-review** cells from `planning-plan-lints` and `reviewer-tests-findings`: PASS = with-arm mean 1.0, PARTIAL = ≥ 0.5, FAIL = < 0.5. The trigger, decisions and prune cases go into a one-line note under the table rather than new rows, so the template shape is unchanged.
- **part-TDD**, **blocker**, **full-pipeline-completion** and the per-phase tokens table stay with the existing full-pipeline procedure; no eval case reaches them.
- Agent roles carry `model:` pins (`agents/planner.md`, `agents/reviewer.md`: `opus`), so `--model` alone changes only the session tier. DC-5 decides how the sweep reaches the agent tier.

`docs/guides/model-class-matrix.md` § How to refresh gains one sentence: "planner and structured-review cells can be filled cheaply by the eval sweep; see maintainer-smokes §Behavioural eval suite". README § Docs gains the line: "Behavioural evals (local, on demand, never CI): `docs/contributing/maintainer-smokes.md`."

### `skills/prune/SKILL.md` wording (advisory)

In "Enacting an approved prune", one added paragraph:

> Before it is enacted, an approved candidate *should* be checked against the behavioural eval case(s) that drive its unit (`evals/`, procedure in `docs/contributing/maintainer-smokes.md`). A with-arm score that holds once the unit is removed, or a Δ near zero, is evidence the model no longer needs it. A unit no case drives carries no such evidence; say so in the proposal. This is advice, not a gate.

The paragraph adds no token, defines no new `*-CANDIDATE(` form (`test/prune-lens.test.js` l. 33 pins that), and uses neither Class A nor Class B words. `PRUNE-CANDIDATE` output is unchanged.

### Error semantics and edge behaviour

| Case | Behaviour |
|---|---|
| A case hits `max_turns` or the timeout | Scored 0 in both arms. The fixed budgets above follow the CLI's sizing guide. A trigger case that keeps hitting the turn cap means the run skill walked past its first stop: raise the cap once, then treat it as a finding. |
| Scaffold fails (non-zero, > 120 s) | That run errors with score 0 and the scaffold's stderr in the report. |
| `--scaffold` omitted | The CLI prints the "unstaged workspace" notice and the fixture cases score 0 in both arms. The documented command always carries it, with its reason. |
| `--allow-tools` omitted | The runner prints `⚠ case … cannot pass with the granted tools` for the file-grader cases. The procedure's step 1 says to read for it. |
| craft fails to load in the with-arm | `suite.plugins` problem code. The run is meaningless and the procedure says to stop. |
| Ceiling hit | Exit 2. Partial `aggregate-result.json`. Paid graders are skipped for the breaching run. |
| A grader regex drifts from `findings.js` | `findings-shape` mirrors `LINE_HEAD_PATTERN` by hand. A change to the normalizer's line grammar makes it stale. The maintainer-smokes eval section lists that pairing; no CI test couples them (DC-9). |

### Parts (pre-chewed context)

1. **CI guard and ignore rule.**
   - New `test/plugin-evals-local-only.test.js` (`node:test`, CommonJS like `test/source-hygiene.test.js`; `ROOT = path.join(__dirname, '..')`).
   - Edit `.gitignore` (append `/evals/results/`).
   - RED first: assertion (c) below fails until part 3 lands.
2. **Cases.** `evals/<8 case dirs>` per the table, plus fixtures and scaffolds. Built with `claude plugin eval init --bare <name>` and then filled; no `TODO` survives. Shellcheck each `scaffold.sh` by hand. Read `engine/src/findings.js` l. 22 for the regex and `contracts/core.md` l. 1 for the prune prompt literal.
3. **Procedure and discovery.**
   - `docs/contributing/maintainer-smokes.md`: new section; amend § Model-class matrix; amend the intro line ("…runs by hand with `/craft:run`"), since the eval suite is not run through `/craft:run`.
   - `docs/guides/model-class-matrix.md` § How to refresh.
   - `README.md` § Docs (l. 268 area; Class B scan applies).
   - `docs/contributing/README.md` row for maintainer-smokes, extended to "… and the behavioural eval suite".
4. **Advisory wiring.**
   - `skills/prune/SKILL.md` § "Enacting an approved prune": new paragraph.
   - `test/prune-lens.test.js`: one new pin test asserting the advisory sentence and the literal `docs/contributing/maintainer-smokes.md` path.
   - `skills/run/SKILL.md` l. 478–479: enumeration (DC-10).
   - This edits `skills/`, so integrate offers the metrics baseline refresh. That is its own reviewed step, coupled to the README FAQ and the calibration pin.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where the suite lives; whether to set `experimental.evals` | (a) `evals/` at root, no manifest key; (b) `evals/` plus explicit `"experimental": {"evals": "evals"}`; (c) custom dir (e.g. `quality/evals`) via the key or `--eval-dir` | **(a)** | `evals/` is already the CLI default, so (b) adds nothing. (b) and (c) also put an `experimental` key into the plugin.json every user installs. Whether older Claude Code builds accept that key unpinned, and the CLI reports `manifest_invalid` as a load problem. |
| 2 | How a fixture reaches the sandbox | (a) per-case `case.yaml` `scaffold_script` that copies case-local `fixture/` (or the plugin's live `contracts/`) into cwd and commits; documented run passes `--scaffold` with its reason; (b) `context.add_dirs` read-only grant on case-local fixtures; (c) fixture embedded in the prompt text | **(a)** | craft phases operate on a git repo. The reviewer needs a commit range and decisions/planning write into `docs/`. Only (a) yields real files and history in cwd. (b) copies nothing, gives no history, and how the child discovers the path is unpinned. (c) cannot express history and inflates the prompt. Cost of (a): `--scaffold` runs bash as the maintainer. The scripts are ≤ 10 reviewed lines and craft-authored, which is the CLI's own condition for the flag. |
| 3 | Ablation arm per case | (a) per grader: craft-token graders (`NO-OP(decisions):`, `PRUNE-CANDIDATE`, plan-lint line) `with-only`; every case keeps ≥ 1 `both` outcome grader a bare model could in principle satisfy; (b) every grader `both`; (c) tag craft-only cases and run them with `--ablation none` | **(a)** | Under (a), Δ on a `both` outcome grader answers prune's question ("does the bare model already do this?") for craft-only behaviours too. (b) scores the without-arm 0 by construction on token graders, a vanity Δ. (c) halves cost on those cases but breaks the CLI's ablation floor and loses the prune evidence. |
| 4 | Drive mode per case | (a) the phase skill when the skill is session-owned or lints (`run`, `decisions`, `prune`, `planning`), the agent directly via `Agent` when the phase skill fans out (`reviewer`); (b) always the phase skill; (c) always the agent | **(a)** | `craft:review` fans out per dimension (several opus spawns per run, ×6 per case). Driving `craft:reviewer` on one dimension is one spawn. `craft:planning` is kept because its plan-lint run is the observable the case grades. Decisions and prune spawn nothing. |
| 5 | How the model-class sweep reaches agent tiers | (a) operator exports `CLAUDE_CODE_SUBAGENT_MODEL=<id>` (plus `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` if an explicit `model:` pin otherwise wins) alongside `--model <id>` (both variables exist in the 2.1.291 binary; case `env` accepts only `EVAL_*` keys, so only the operator's shell can set them, and propagation into the child is unpinned); (b) the sweep fills only session-tier behaviour, and agent rows are recorded "pinned: opus" with no tier spread; (c) no eval sweep, the matrix stays full-pipeline only | **(a)**, confirmed by smoke S4; fall back to (b) if the variable does not propagate or does not override a `model:` pin | Without (a), `--model` leaves `agents/planner.md`/`agents/reviewer.md` at their `opus` pin, so the planner and structured-review cells would show no tier difference. |
| 6 | Reconciling with the existing model-class procedure | (a) one matrix section: the eval sweep fills planner and structured-review; the full-pipeline run keeps part-TDD, blocker, full-pipeline-completion and per-phase tokens; template shape unchanged; (b) a separate eval-sweep section that owns all rows it can, with the matrix section pointing at it; (c) replace the full-pipeline sweep with evals | **(a)** | No eval case reaches part-TDD, blocker, completion or per-phase tokens, which rules out (c). (b) gives two procedures one artifact, which drifts. Keeping the template shape avoids touching a guide no test pins. |
| 7 | llm judge | (a) `--judge-model claude-sonnet-5-5` by default; in the sweep, `claude-opus-5-5` judges the sonnet column; (b) always `claude-opus-5-5`; (c) CLI default haiku | **(a)** | The CLI spec requires a sonnet-tier-or-larger judge that is never the agent model. (b) self-judges the opus column. (c) is below the spec's floor. |
| 8 | Default `--runs` and `--max-cost-usd` | (a) `--runs` 3 (CLI default and floor) for full and sweep runs, `--runs 1` only to pilot a new or edited case; ceiling = pilot `costUsd` × runs × 1.5, the very first pilot capped at a fixed USD 5; (b) one fixed documented ceiling (e.g. USD 20) for every run; (c) no ceiling (rely on `max_turns`/`timeout_seconds`) | **(a)** | No cost is pinned without a paid run, so any fixed number in (b) is a guess that ages with model prices. The pilot's `costUsd` is the CLI's own recommended basis. (c) leaves an 8-case × 3 × 2 = 48-session run unbounded on a subscription rate limit. |
| 9 | How the suite's own correctness is checked without a paid run | (a) no checker over `evals/`. Load-time CLI validation plus user-approved `--runs 1 --case` pilots (smokes S1–S4). CI guard tests over `ci.sh`, workflows, `.gitignore` and `maintainer-smokes.md`, none of which read `evals/`; (b) a local-only checker bin (`engine/bin/eval-check.js`) validating frontmatter allowlists and floors, unit-tested on synthetic fixtures, never wired into `ci.sh`; (c) a structural `node:test` over `evals/` in CI | **(a)** | (c) contradicts the decided "test suites must not depend on `evals/`". (b) re-implements a schema the CLI already enforces at load and would drift from it on CLI upgrades. The CLI's floors are few and reviewable by eye. |
| 10 | Where the advisory and discovery wording lands beyond prune and maintainer-smokes | (a) also add "behavioural evals" to `skills/run/SKILL.md`'s maintainer-smoke list (no adapter mirror carries it); no wording in `skills/integrate`/`skills/metrics`; (b) also add a "run the eval cases" line beside integrate's baseline-refresh offer; (c) leave `skills/run` untouched | **(a)** | The run-skill list is a full enumeration, so (c) leaves it false. Integrate and metrics execute in every user's repo, and craft's `evals/` exists only in craft, so (b) leaks craft-self specifics into generic prompts. The prompt surface is touched by the prune edit anyway, so (a) adds no new baseline-refresh trigger. |
| 11 | Case set size | (a) the 8 cases above; (b) 6 (drop `run-fires-default-workflow` and `decisions-escalates-fork`); (c) 7 (drop only the second trigger shape) | **(a)** | The CLI's interview asks a one-flow trigger suite for 4–6 fire prompts across ≥ 2 input shapes. This suite covers many flows, so it keeps the 2-shape floor and stops there for cost: the 2 fire cases are the two description triggers. The escalation pair is what stops `NO-OP(decisions):` from passing when emitted unconditionally. Both are cheap session-model cases, and the cost sits in the two agent cases. |

## Test strategy

**CI (node:test, `test/plugin-evals-local-only.test.js`).** It reads only the files named in each title, never `evals/`.

- (a) "Given `scripts/ci.sh` and every `.github/workflows/*.yml`, when scanned, then none contains `plugin eval` or an `evals/` path." Positive pin: assert both files were read and are non-empty, so an empty glob cannot pass vacuously.
- (b) "Given `.gitignore`, when read, then it carries the `/evals/results/` line."
- (c) "Given `docs/contributing/maintainer-smokes.md`, when every `claude plugin eval` command inside a fenced code block is collected (backslash continuations joined; `init` excluded), then the set is non-empty and every command carries `--no-publish`." Only fenced commands count, so prose that names the CLI cannot trip the rule. The non-empty assertion is the RED until part 3 lands.
- (d) "Given the same commands, when one carries `--trust-plugin`, then fail." craft never runs evals in CI.

`test/prune-lens.test.js` gains one pin: "Given skills/prune/SKILL.md, when the enacting section is read, then it advises checking the candidate against the behavioural eval cases and names docs/contributing/maintainer-smokes.md". The existing "PRUNE-CANDIDATE is the only *-CANDIDATE( form" test continues to guard against a new token.

`source-hygiene` (Class A/B over `skills/`, README), `design-lint` (this doc), the advisory prose and stub lints over touched `evals/**` files, and `bash scripts/ci.sh` as the phase gate cover the rest. No CI path executes or parses a case.

**Suite correctness, no paid run.**

- The CLI validates every case at load: unknown key, TODO template, schema, duplicate grader names, `add_dirs` outside the plugin, `⚠ … cannot pass with the granted tools`. **(smoke)** Whether all cases are validated before the first run launches.
- Review checks the case table above against the pinned contract: tools follow graders; every case has a `both` outcome grader; there is a should-NOT-fire case; budgets are sized to the CLI guide.

**Paid smokes.** Each one is approved by the user with its `--max-cost-usd`, uses `--no-publish`, and runs one case.

| # | Command (all `--no-publish --runs 1`) | Confirms |
|---|---|---|
| S1 | `--case run-quiet-unrelated --max-cost-usd 1` | craft loads (`suite.plugins`, no problem code); the trust prompt; results land under the gitignored `evals/results/`; the report stays local; `costUsd` baseline; the maintainer's `~/.claude` is not loaded |
| S2 | `--case decisions-noop-when-clear --scaffold --allow-tools Write Bash --max-cost-usd 2` | The scaffold reads its case dir, copies the fixture and commits; the decisions preamble's manifest probe behaves with no manifest; the `NO-OP(decisions):` target (trace vs last message) |
| S3 | `--case reviewer-tests-findings --scaffold --allow-tools Write Bash --max-cost-usd 3` | Plugin agents and hooks load in the child; `Agent` is usable; the sub-agent's Bash obeys the session grant; the `findings-shape` regex matches a real reviewer output |
| S4 | S3 plus `--model claude-haiku-4-5` with `CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5` exported (then with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` if the pin still wins) | Whether the sub-agent tier follows. This decides DC-5 (a) vs (b) |

Then the CLI's Gate 2: the maintainer reads each grade and the judge's reasoning, and answers "would you have scored any differently?" before the first full run.

**Edge matrix (manual, at pilot):**

- turn cap reached;
- scaffold omitted (unstaged notice);
- grant omitted (⚠ line);
- ceiling hit (exit 2);
- threshold miss (exit 1);
- `prune-refuses-core` when the contracts copy fails, which should exercise prune's fail-closed path (no `PRUNE-CANDIDATE` at all; `refuses-with-reason` fails, so the case surfaces it rather than passing silently).

## Out of scope

- **CI or PR automation of any kind.** Decided: local, on demand.
- **Evals for non-Claude adapters.** Decided: they keep their own probes.
- **Replacing `craft:metrics` / `craft:tune`.** Cost and routing across real runs is a different question from quality on fixed cases.
- **Replacing structural lints and tests.** Evals add behavioural evidence and remove nothing.
- **New observability tooling.** Claude Code's native OTel already exists.
- **Auto-applying eval results, and any new engine floor, token or gate for prune.** ADR-209 declined automated classification and CI signals.
- **MCP mocks (`evals/mocks/`).** craft ships no MCP server.
- **`baseline` / `history_file` graders.** No case needs a resumed session or a trajectory comparison yet (YAGNI).
- **Cases for part-TDD, blocker or full-pipeline completion.** Each needs a multi-phase run, which the existing full-pipeline procedure covers.
- **Refreshing the metrics drift baseline.** Integrate offers it because `skills/` changes. It is its own reviewed step, coupled to the README FAQ and the calibration pin.
