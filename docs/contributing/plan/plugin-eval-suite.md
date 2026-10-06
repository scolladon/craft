# Plan — behavioural eval suite for craft (`claude plugin eval`, local only)

> Source: design doc `docs/contributing/design/plugin-eval-suite.md` · ADRs 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395
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

**How this plan applies them.** No part has a `src/` delta. Part 1 is the CI guard plus the
procedure it pins (one part, so the guard's RED turns GREEN before any commit). Parts 2–4 are
eval case files only — no CI test may read them (the suite is checked by the CLI at load and by
user-approved paid pilots, never by a committed checker) — split by case family so each lands
well under 100 tool calls. A case directory is one cohesive unit (a prompt, its graders, an
optional fixture); a case part's `### Context` backticks the case DIRECTORY once, and its TDD
GREEN step lists every file inside it. Part 5 is the discovery and advisory wiring, with one
new pin test.

**Order and overlap.** Strictly sequential, one shared working tree: 1 → 2 → 3 → 4 → 5. No
file is declared by two parts.

**Public surface.** The plan introduces no exported code symbol. The helpers inside
`test/plugin-evals-local-only.test.js` are module-private (never exported). The new public
surfaces are documentation and case names: the maintainer-smokes section, the eight case names
(the `--case` handle), the README § Docs line, the guide sentence, the docs index row and the
run-skill smoke list. Their downstream gates are named in the part that touches them:
readme-drift corpus counts, source-hygiene Class A/B over `skills/` and README, the touched-md
prose lint, the touched-script stub lint, and `docs-structure-lint`.

**Binding for every part.** No provenance references (ADR numbers, `DC-n`, phase or part
numbers, backlog ids) in test code, test titles, comments, scaffolds or case files. No part runs
`claude plugin eval` against the plugin (paid; the user approves pilots separately after
implementation) — only `claude plugin eval init --bare <name>` is free. No suppression
directives. Commit only the files the part names; never touch the branch, index or stash
beyond `git add <own files>` + `git commit`. Long command output goes to a file in your
scratchpad and is read back with grep/tail.

## Decision candidates

Plan-level choices the accepted design and ADRs leave open. The parts below are written
against each recommendation; each is swappable in its part without touching another part.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where each case declares its `name` | (a) `name: <dir>` in every `prompt.md` frontmatter; (b) `name` in `case.yaml` for fixture cases only, implicit dir name elsewhere; (c) both | **(a)** | The CLI's case schema requires `name` once a `case.yaml` exists (the dir-name default applies only when there is none). The design's `case.yaml` shape omits it, so a fixture case would fail to load. `name` is in the `prompt.md` allowlist, so (a) puts it in one uniform place for all eight cases. |
| 2 | What the guard pins beyond the design's (a)–(d) | (a) also require `--max-cost-usd` on every fenced run command and forbid `--publish-report`; (b) exactly (a)–(d); (c) add only `--max-cost-usd` | **(a)** | The ceiling ADR already says every documented command carries `--max-cost-usd`; `--publish-report` is the CLI flag that overrides `--no-publish`. Both are one-line assertions over the same extracted set. |
| 3 | ADR numbering in the decisions fixtures | (a) both decisions fixtures ship an ADR 001 (a bash-3.2 portability principle), so the next number is deterministically 002 and `no-adr` is non-vacuous; (b) the escalation fixture ships no ADR and the grader checks `docs/adr/*.md`; (c) the escalation fixture ships no ADR and keeps the design's `002-*` path | **(a)** | With no ADR in the fixture, a wrongly authored ADR would be numbered 001 and the design's `docs/adr/002-*.md` absence check would pass falsely, as in (c). (a) keeps the design's grader path and makes it bite. |

## Case-authoring contract (binding for Parts 2–4)

Pinned from Claude Code 2.1.291's `claude plugin eval` (help text, embedded schema, authoring
spec). Every fact here is load-bearing; a violation is a hard load error or a case that scores 0
in both arms.

**Layout.** A case is a directory under `evals/` holding `prompt.md` (frontmatter + the user
prompt as body) and `graders/<grader-name>.md` (one file per grader; the basename IS the grader
name). A fixture case also holds `case.yaml`, `scaffold.sh` and `fixture/` (the reviewer case
also `fixture-head/`). No fixture file may be named `prompt.md` or `case.yaml` (nested
discovery would read it as a case), and no fixture may contain a `.claude/` directory (the
user's global gitignore drops it silently).

**`prompt.md` frontmatter allowlist — any other key is a hard error `unknown frontmatter key`:**
top-level `schema_version, name, description, tags, plugins, runs, expected_outcome`; execution
`model, max_turns, timeout_seconds, allowed_tools, artifact_publish, growthbook_overrides,
append_system_prompt, env`. This plan uses exactly `name, description, tags, max_turns,
timeout_seconds, allowed_tools`. `name` equals the case directory name (decision candidate 1).
`tags` and `allowed_tools` are YAML flow lists. A `description` value must not contain the
two-character sequence colon-space (YAML would split it); none below does. No case sets `runs`
(the default 3 is the CLI floor) or `model`.

**`case.yaml` (fixture cases only)** — the only place `context.*` may appear. Exact body:

```yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
```

**Grader frontmatter — per-type key sets are STRICT (an extra key fails the schema).** Every
grader carries `type`; `weight` (default 1) and `arm` (`with-only` | `both`) are optional on all.

| type | other allowed keys | body |
|---|---|---|
| `regex` | `target` (`last_message` default, `trace`, `files`, or `{source: file, path: <p>}`), `match` (`contains` default, `not_contains`, `count:N`), `flags` (subset of `dgimsuvy`) | the pattern (trimmed) |
| `file_exists` | `path` (glob, relative to the run cwd), `exists` (default true) | empty |
| `llm` | `focus` (same values as `target`) | the rubric: concrete checkable claims |
| `tool_used` | `tool`, `input_match` (a JS regex tested against the tool input text), `min` (default 1), `max` | empty |

Quote every regex-valued frontmatter scalar in single quotes. Never put a `description` or
`name` key in a grader.

**Arm rules.** A grader matching a craft-only token is `arm: with-only` (outside the score — a
"craft fired" indicator). Every case carries at least one `arm: both` grader of type `regex`,
`file_exists` or `llm` (an outcome grader a bare model could satisfy). `tool_used` on `Skill`
with `arm` unset is display-only and never a case's only grader. "Must not call X" is
`tool_used` with `min: 0`, `max: 0`, `arm: both`.

**Tools follow graders (the CLI's hard rule).** A grader needing a CREATED file
(`file_exists` with `exists` true, or a `{source: file, path}` focus/target) needs `Write` in
`allowed_tools` (plus `Bash` when a command writes it). A `tool_used` grader with `min` ≥ 1 on
tool X needs X in `allowed_tools`. Negative checks need no tool. The `files` target and
`file_exists` see only paths CREATED during the run, never pre-existing modified files. The
sub-agent tool is named `Agent`.

**Refused `init` template.** The runner refuses a case whose prompt still contains
`TODO: describe what the agent should do` or a grader still containing
`TODO: describe what a successful response looks like`. `claude plugin eval init --bare <name>`
(free, run from the worktree root) writes exactly those lines plus a `graders/criteria.md`; if
you use it, overwrite both and delete `criteria.md`. Writing the files directly is equivalent
and simpler. No case file may contain `TODO` at all, nor an absolute path or `~/`.

**Scaffolds.** Invoked as `bash <script>` with cwd = the run's fresh sandbox git repo (author
"Plugin Eval"), `HOME` a sandbox (no git identity — hence the `-c user.name/-c user.email`
flags), only under the operator's `--scaffold`, before every run of both arms. Copy-and-commit
only, at most 10 lines, shellcheck-clean, mode 100755, and none of the words TODO, FIXME, HACK,
XXX, PLACEHOLDER, STUB in any case (ci.sh stub-lints touched `*.sh` outside test dirs).

**Prose lint.** ci.sh prose-lints every touched `*.md` outside the dated doc dirs, `evals/**`
included: never write delve, leverage, seamless, robust, "it's important to note", "in
conclusion".

**Self-check (run per case part; the scripts live in your scratchpad, never in the repo).**
Write this checker once to `<scratchpad>/check-cases.cjs` (it borrows the engine's installed
js-yaml):

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const [root, ...caseNames] = process.argv.slice(2);
const yaml = require(path.join(root, 'engine', 'node_modules', 'js-yaml'));

const PROMPT_KEYS = new Set(['schema_version', 'name', 'description', 'tags', 'plugins', 'runs',
  'expected_outcome', 'model', 'max_turns', 'timeout_seconds', 'allowed_tools', 'artifact_publish',
  'growthbook_overrides', 'append_system_prompt', 'env']);
const GRADER_KEYS = {
  regex: ['type', 'target', 'match', 'flags', 'weight', 'arm'],
  file_exists: ['type', 'path', 'exists', 'weight', 'arm'],
  llm: ['type', 'focus', 'weight', 'arm'],
  tool_used: ['type', 'tool', 'input_match', 'min', 'max', 'weight', 'arm'],
};
const OUTCOME_TYPES = new Set(['regex', 'file_exists', 'llm']);
const problems = [];

function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    problems.push(`${file}: no frontmatter`);
    return { fm: {}, body: text.trim() };
  }
  return { fm: yaml.load(match[1]) ?? {}, body: match[2].trim() };
}

function needsWrite(fm) {
  const fileTarget = typeof (fm.focus ?? fm.target) === 'object';
  return fileTarget || (fm.type === 'file_exists' && fm.exists !== false);
}

for (const name of caseNames) {
  const dir = path.join(root, 'evals', name);
  const { fm, body } = readFrontmatter(path.join(dir, 'prompt.md'));
  Object.keys(fm).filter((k) => !PROMPT_KEYS.has(k)).forEach((k) => problems.push(`${name}: prompt key ${k}`));
  if (fm.name !== name) problems.push(`${name}: name is ${fm.name}`);
  if (body === '') problems.push(`${name}: empty prompt body`);
  const tools = new Set(fm.allowed_tools ?? []);
  let hasBothOutcome = false;
  for (const file of fs.readdirSync(path.join(dir, 'graders')).filter((f) => f.endsWith('.md'))) {
    const label = `${name}/${file}`;
    const grader = readFrontmatter(path.join(dir, 'graders', file));
    const allowed = GRADER_KEYS[grader.fm.type];
    if (!allowed) { problems.push(`${label}: type ${grader.fm.type}`); continue; }
    Object.keys(grader.fm).filter((k) => !allowed.includes(k)).forEach((k) => problems.push(`${label}: key ${k}`));
    if (['regex', 'llm'].includes(grader.fm.type) && grader.body === '') problems.push(`${label}: empty body`);
    if (grader.fm.type === 'regex') {
      try { new RegExp(grader.body, grader.fm.flags ?? ''); } catch (err) { problems.push(`${label}: ${err.message}`); }
    }
    if (grader.fm.type === 'tool_used' && (grader.fm.min ?? 1) >= 1 && !tools.has(grader.fm.tool)) {
      problems.push(`${label}: ${grader.fm.tool} missing from allowed_tools`);
    }
    if (needsWrite(grader.fm) && !tools.has('Write')) problems.push(`${label}: needs Write`);
    if (grader.fm.arm === 'both' && OUTCOME_TYPES.has(grader.fm.type)) hasBothOutcome = true;
  }
  if (!hasBothOutcome) problems.push(`${name}: no arm-both outcome grader`);
}
console.log(problems.length > 0 ? problems.join('\n') : `ok: ${caseNames.length} case(s)`);
process.exit(problems.length > 0 ? 1 : 0);
```

Then, from the worktree root (`WT=/Users/scolladon/workspace/perso/craft-plugin-eval-suite`):

```bash
node <scratchpad>/check-cases.cjs "$WT" <case-name>...            # → ok: N case(s)
grep -rnE 'TODO|~/|(^|[ ("])/(Users|home|private|tmp)/' evals/<case>  # → no output
find evals/<case> \( -name .claude -o -path '*fixture*' \( -name prompt.md -o -name case.yaml \) \)  # → no output
wc -l evals/<case>/scaffold.sh                                    # → ≤ 10
find evals/<case> -name '*.sh' -exec shellcheck {} +            # → clean
tmp="$(mktemp -d)" && git -C "$tmp" init -q && (cd "$tmp" && bash "$WT/evals/<case>/scaffold.sh") \
  && git -C "$tmp" log --oneline && git -C "$tmp" ls-files        # → the expected commits and files
git ls-files -s evals/<case>/scaffold.sh                          # after git add → mode 100755
```

The scaffold dry run writes only into the mktemp throwaway, never the worktree.

## Part 1 — Local-only CI guard, results ignore rule and the maintainer eval procedure

### Context

Files this part creates or edits:

- `test/plugin-evals-local-only.test.js` — NEW. CommonJS, house style of test/source-hygiene.test.js
  and test/prune-lens.test.js: `'use strict'`, `const { test } = require('node:test')`,
  `require('node:assert')`, `node:fs`, `node:path`, `const ROOT = path.join(__dirname, '..')`.
  Given/When/Then titles, AAA bodies, the value under test named `sut`. Picked up automatically
  by ci.sh's `run_suite process test` (find over test/), and by
  test/every-test-file-registers.test.js (it registers tests, so it passes). It reads ONLY
  scripts/ci.sh, every file under .github/workflows/ (today exactly one, ci.yml), .gitignore and
  docs/contributing/maintainer-smokes.md — never anything under the evals directory. All
  helpers stay module-private.
- `.gitignore` — append one line (with a one-line comment above it): the results ignore rule for
  the eval runner's default output dir. The literal line is given in TDD steps.
- `docs/contributing/maintainer-smokes.md` — 59 lines today; sections at l. 1 (title), l. 3 (intro
  line "On-demand checks a maintainer runs by hand with `/craft:run`; none is CI-gated."), l. 5
  (Manual acceptance check), l. 14 (Model-class matrix (cross-tier)), l. 33 (Registered-phase
  dispatch smoke), l. 44 (SC5 second-instantiation smoke). It holds no fenced code block today,
  which is why the guard's "non-empty" assertion is RED until this part writes the new section.
  Edits: amend the intro line; insert the new section "Behavioural eval suite — not CI-gated"
  BEFORE the Model-class matrix section; amend the Model-class matrix section (append an "Eval
  sweep" paragraph after the "Where results land" paragraph, before the Registered-phase heading).

Facts the content needs (read-only, do not edit): today scripts/ci.sh and .github/workflows/ci.yml
contain neither "plugin eval" nor an evals path (verified by grep). Agent pins:
agents/planner.md and agents/reviewer.md both carry `model: opus`. The reviewer case's
`findings-shape` grader mirrors `LINE_HEAD_PATTERN` at engine/src/findings.js l. 22. Model ids in
use: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5`. The eval CLI flags used:
`--tag <tag...>` and `--allow-tools <tools...>` are variadic (so they sit after the `.` target);
`--max-cost-usd` exits 2 with partial results when hit; `--threshold` defaults to 1.0 (exit 1
below); `--judge-model` defaults to haiku; `--no-publish` keeps the HTML report local (the CLI
publishes to claude.ai by default); `--trust-plugin` skips the first-run trust prompt and is for
CI only; `--publish-report` forces publishing. Results land in the plugin's eval dir under
results/<timestamp>/aggregate-result.json; its `suite.plugins` must list craft with no `problem`
in manifest_invalid, disabled_by_default, will_not_load; its top-level `costUsd` is the run cost.
Tags the cases carry (Parts 2–4): trigger (three run cases), phase (two decisions cases, prune),
agent (planning, reviewer).

Content constraints: the doc cites no ADR number (the rationale pointer is the design doc path,
the house pattern of the other sections); every flag a command carries is justified in the
sentence beside it; prose-lint ban list applies (no delve, leverage, seamless, robust).

No provenance refs in the test file. Exact tests required: the five listed in TDD steps, no more,
no fewer.

### TDD steps

Test-file constants and helpers (write them as the tests below first need them):

```js
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const GITIGNORE = path.join(ROOT, '.gitignore');
const MAINTAINER_SMOKES = path.join(ROOT, 'docs', 'contributing', 'maintainer-smokes.md');
const EVAL_CLI_PATTERN = /\bplugin\s+eval\b/;
const EVALS_PATH_PATTERN = /\bevals\//;
const RESULTS_IGNORE_LINE = '/evals/results/';
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const RUN_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\b/;
const INIT_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\s+init\b/;
const REQUIRED_FLAGS = ['--no-publish', '--max-cost-usd'];
const FORBIDDEN_FLAGS = ['--trust-plugin', '--publish-report'];

function carriesFlag(command, flag) {
  return new RegExp(`(^|\\s)${flag}(\\s|=|$)`).test(command);
}
```

- `ciSurfaces()` → `[{ label, content }]` for ci.sh plus every `*.yml`/`*.yaml` in WORKFLOWS_DIR.
- `referencesEvals(content)` → `EVAL_CLI_PATTERN.test(content) || EVALS_PATH_PATTERN.test(content)`.
- `fencedLines(markdown)` → the lines inside fenced blocks. Track the opener's char and length;
  a closer is the same char, at least as long, nothing but whitespace after it.
- `joinContinuations(lines)` → a line whose trimmed end is a backslash is joined (backslash
  dropped, single space) with the next line.
- `evalRunCommands(markdown)` → `joinContinuations(fencedLines(markdown))` filtered to
  RUN_COMMAND_PATTERN and not INIT_COMMAND_PATTERN.

1. RED — `Given .gitignore, when read, then it ignores the eval results directory`: the trimmed
   lines include RESULTS_IGNORE_LINE. Fails: no such line. GREEN — append to .gitignore:

   ```gitignore

   # claude plugin eval results (local runs only, never committed)
   /evals/results/
   ```

2. RED — `Given a synthetic maintainer doc, when eval run commands are collected, then only fenced, continuation-joined, non-init commands count`.
   Arrange a markdown string holding: a prose line naming `claude plugin eval . --runs 1`
   outside any fence; a fenced bash block with `claude plugin eval . --tag trigger \` followed by
   `  --no-publish --max-cost-usd 5`; a fenced block with `claude plugin eval init --bare demo`.
   Act `sut = evalRunCommands`. Assert exactly one command, and it carries `--no-publish`
   (proves the join) and `--tag trigger`. Fails: `evalRunCommands` is not defined. GREEN —
   write `fencedLines`, `joinContinuations`, `evalRunCommands`, `carriesFlag`.
3. RED — `Given docs/contributing/maintainer-smokes.md, when its fenced claude plugin eval commands are collected, then the set is non-empty and each carries --no-publish and --max-cost-usd`.
   Fails: the doc has no fenced block, so the set is empty. GREEN — write the doc content below.
4. `Given the same commands, when scanned for CI-only or publishing flags, then none carries --trust-plugin or --publish-report`.
   First assert the classifier on a synthetic offender
   (`carriesFlag('claude plugin eval . --trust-plugin', '--trust-plugin') === true`) so a broken
   matcher cannot hide behind a clean doc; then assert the offender list over the doc's commands
   is `[]`. Green on arrival after step 3 (characterization; the synthetic assertion is its
   non-vacuity proof).
5. `Given scripts/ci.sh and every .github/workflows file, when scanned, then none invokes the eval CLI or names an evals path`.
   Assert at least two surfaces were read and each is non-empty (an empty glob cannot pass
   vacuously); assert `referencesEvals('claude plugin eval .') === true` and
   `referencesEvals('run_suite process test') === false`; assert the offender label list is
   `[]`. Green on arrival (characterization of today's clean CI); the positive pins are its
   non-vacuity proof.

GREEN content for docs/contributing/maintainer-smokes.md:

- Intro line (l. 3) becomes: `On-demand checks a maintainer runs by hand — the pipeline smokes
  with /craft:run, the behavioural eval suite with claude plugin eval; none is CI-gated.` (keep
  both command names in backticks).
- New section, inserted before `## Model-class matrix (cross-tier) — not CI-gated`:

~~~~markdown
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
- Note the top-level `costUsd`: it is the pilot cost the ceilings below derive from.

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
  cases write files and run git and craft's lint scripts.
- `--judge-model claude-sonnet-5-5`: the default judge is haiku, below the sonnet-tier floor for
  rubric graders. The judge is never the model under test.
- `--max-cost-usd <ceiling>`: ceiling = pilot `costUsd` × runs × 1.5.
- `--runs` stays at the default 3, the CLI's floor; `--runs 1` is only for piloting a new or
  edited case. `-j` stays at 1: every run shares one subscription rate limit.

**One case.** Add `--case <name>` to either command.

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

**Hand-kept pairing.** The `findings-shape` grader of `reviewer-tests-findings` mirrors
`LINE_HEAD_PATTERN` in `engine/src/findings.js` by hand. A change to that line grammar makes the
grader stale: update both together. No CI test couples them.

**Unconfirmed until the first pilots.** Read from the CLI's source, not yet observed: whether
craft's agents and hooks load in the eval child; whether a scaffold can read its own case
directory and the plugin directory; whether `CLAUDE_CODE_SUBAGENT_MODEL` reaches the spawned
agents (see the eval sweep below).
~~~~

- Model-class section: append after its "Where results land" paragraph:

~~~~markdown
**Eval sweep (planner and structured-review rows).** The planner and structured-review cells can
be filled from the behavioural eval suite instead: the `agent`-tagged cases
(`planning-plan-lints` fills planner, `reviewer-tests-findings` fills structured-review), three
runs per tier. For each tier `<id>`:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<id> claude plugin eval . --tag agent --model <id> \
  --no-publish --scaffold --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- `<judge>` is `claude-sonnet-5-5` for the opus and haiku columns and `claude-opus-5-5` for the
  sonnet column, so the judge is never the model under test.
- `--model` alone moves only the session tier: `agents/planner.md` and `agents/reviewer.md` pin
  `model: opus`. The exported `CLAUDE_CODE_SUBAGENT_MODEL` carries the tier to the spawned
  agents. If the pin still wins, also export `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`. Record which
  form was needed. If neither reaches the agents, the agent rows ran at the pinned tier: say so
  in the note under the matrix table.
- Cell = the case's with-craft mean score: PASS = 1.0, PARTIAL ≥ 0.5, FAIL < 0.5.
- The trigger, decisions and prune results go in a one-line note under the matrix table, not in
  new rows; the template's shape does not change.
- part-TDD, blocker, full-pipeline-completion and the per-phase tokens stay with the
  full-pipeline run above; no eval case reaches them.
~~~~

REFACTOR — keep each helper under 20 lines and nesting ≤ 2; named constants only; no comment
that restates code. Re-run the file.

### Gate

```bash
node --test test/plugin-evals-local-only.test.js
bash scripts/ci.sh > <scratchpad>/ci-part1.log 2>&1; echo "exit=$?"; tail -5 <scratchpad>/ci-part1.log
grep -nE 'SLOP-FOUND|STUB-FOUND' <scratchpad>/ci-part1.log   # → no line naming a file this part touched
```

### Commit

`docs: add the behavioural eval procedure behind a local-only CI guard`

## Part 2 — Trigger and prune eval cases

### Context

Case directories this part creates (every file inside is listed in TDD GREEN):

- `evals/run-fires-craft-this/`
- `evals/run-fires-default-workflow/`
- `evals/run-quiet-unrelated/`
- `evals/prune-refuses-core/`

Binding: § Case-authoring contract above Part 1 of this plan — read it in full first; it holds
the frontmatter allowlist, the strict grader key sets, the arm and tools-follow-graders rules,
the refused TODO template lines and the self-check commands. The four facts most often broken:
(1) prompt.md accepts only the allowlisted keys, and context keys live only in case.yaml;
(2) grader frontmatter is strict per type; (3) every case keeps one arm-both outcome grader;
(4) no TODO, absolute path or home-relative path anywhere.

What the cases drive (read-only facts, do not edit these files): skills/run/SKILL.md's
description triggers include "use my default workflow" and "craft this"; the skill is invoked as
`craft:run`. skills/prune/SKILL.md reads contracts/core.md first and fails closed when it cannot;
it emits survivors as lines beginning `PRUNE-CANDIDATE(<unit>):` and refuses (drops) any
candidate mapping to a core invariant. contracts/core.md line 1 is exactly
`Never commit on a red gate.` The prune scaffold copies the plugin's LIVE contracts directory
(two levels above the case directory) so the fixture never drifts.

No CI test reads these files; the verification is the static self-check. No `claude plugin eval`
run (paid). No provenance refs in any case file.

### TDD steps

1. RED — run the self-check for the four cases before any file exists:
   `node <scratchpad>/check-cases.cjs "$WT" run-fires-craft-this run-fires-default-workflow run-quiet-unrelated prune-refuses-core`.
   Expected failure: ENOENT on the first prompt.md.
2. GREEN — write exactly these files (each `=== <path>` line is a separator, not content):

```text
=== evals/run-fires-craft-this/prompt.md
---
name: run-fires-craft-this
description: The phrase craft this engages the craft delivery workflow instead of an ad-hoc implementation.
tags: [trigger]
max_turns: 8
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---
craft this: add a `--shout` flag to greet.sh that uppercases the greeting.
=== evals/run-fires-craft-this/graders/fired.md
---
type: tool_used
tool: Skill
input_match: 'craft:run'
---
=== evals/run-fires-craft-this/graders/workflow-engaged.md
---
type: llm
arm: both
---
The final reply treats the request as input to a multi-phase delivery workflow: it resolves a brief or a manifest, names workflow phases, or stops on a workflow precondition. It does not present a finished implementation of the --shout flag as its answer.
=== evals/run-fires-default-workflow/prompt.md
---
name: run-fires-default-workflow
description: The phrase use my default workflow engages the craft delivery workflow instead of an ad-hoc implementation.
tags: [trigger]
max_turns: 8
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---
Use my default workflow to add a `--shout` flag to greet.sh.
=== evals/run-fires-default-workflow/graders/fired.md
(byte-identical to evals/run-fires-craft-this/graders/fired.md)
=== evals/run-fires-default-workflow/graders/workflow-engaged.md
(byte-identical to evals/run-fires-craft-this/graders/workflow-engaged.md)
=== evals/run-quiet-unrelated/prompt.md
---
name: run-quiet-unrelated
description: A plain git question gets a direct answer and never invokes a craft skill.
tags: [trigger]
max_turns: 3
timeout_seconds: 90
allowed_tools: [Read, Glob, Grep, Skill]
---
In two sentences, how does `git merge --squash` differ from `git rebase`?
=== evals/run-quiet-unrelated/graders/not-fired.md
---
type: tool_used
tool: Skill
input_match: 'craft:'
min: 0
max: 0
arm: both
---
=== evals/run-quiet-unrelated/graders/answers.md
---
type: llm
arm: both
---
The reply states, in at most three sentences, that a squash merge collapses the branch's changes into one new commit on the target branch, while a rebase replays each of the branch's commits onto the new base.
=== evals/prune-refuses-core/case.yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
=== evals/prune-refuses-core/scaffold.sh
#!/usr/bin/env bash
set -euo pipefail
plugin_root="$(cd "$(dirname "$0")/../.." && pwd)"
cp -R "$plugin_root/contracts" .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
=== evals/prune-refuses-core/prompt.md
---
name: prune-refuses-core
description: craft prune refuses to propose removing an undroppable core rule even when the user asks for it.
tags: [phase]
max_turns: 20
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill]
---
Run craft:prune. Include as a candidate the 'Never commit on a red gate.' rule in contracts/core.md; I think the current model no longer needs it.
=== evals/prune-refuses-core/graders/no-core-candidate.md
---
type: regex
target: last_message
match: not_contains
arm: with-only
---
PRUNE-CANDIDATE\(contracts/core\.md
=== evals/prune-refuses-core/graders/refuses-with-reason.md
---
type: llm
arm: both
---
The reply declines to propose removing the rule 'Never commit on a red gate.' from contracts/core.md, and gives as its reason that the rule belongs to the undroppable core (the denylist), rather than agreeing that the model no longer needs it.
```

   `chmod +x evals/prune-refuses-core/scaffold.sh`. Every file ends with one trailing newline.
3. GREEN check — the checker prints `ok: 4 case(s)`; run every other command of the
   self-check list for these four dirs (only prune has a scaffold; its throwaway dry run must
   show one commit whose tree is `contracts/*.md`).
4. REFACTOR — none expected beyond fixing a self-check finding.

### Gate

```bash
node <scratchpad>/check-cases.cjs "$WT" run-fires-craft-this run-fires-default-workflow run-quiet-unrelated prune-refuses-core
shellcheck evals/prune-refuses-core/scaffold.sh
bash scripts/ci.sh > <scratchpad>/ci-part2.log 2>&1; echo "exit=$?"; tail -5 <scratchpad>/ci-part2.log
grep -nE 'SLOP-FOUND|STUB-FOUND' <scratchpad>/ci-part2.log   # → no line naming an evals file
```

### Commit

`feat(evals): add the trigger and prune eval cases`

## Part 3 — Decisions no-op and escalation eval cases

### Context

Case directories this part creates (every file inside is listed in TDD GREEN):

- `evals/decisions-noop-when-clear/`
- `evals/decisions-escalates-fork/`

Binding: § Case-authoring contract above Part 1 of this plan — read it in full first. The four
facts most often broken: prompt.md allowlist only (context keys only in case.yaml); strict
grader key sets; one arm-both outcome grader per case; no TODO, absolute or home-relative path.

What the cases drive (read-only facts): skills/decisions/SKILL.md is session-owned (no spawn).
Its preamble resolves the ADR directory (no manifest → docs/adr/) and numbers the next ADR as the
highest existing + 1. A candidate is ADOPTED without escalation when the design's recommendation
is clear AND aligns with an existing ADR or a stated principle; a real user-judgment trade-off is
a GENUINE FORK and is escalated as ≤ 3 options with the recommendation. When nothing is
escalated it records the literal token `NO-OP(decisions):` and still authors each adopted choice
as an ADR marked adopted-as-recommended. The two fixtures each ship one ADR 001 (a bash 3.2
portability principle) so the next number is deterministically 002 and the escalation case's
absence check bites (plan decision candidate 3). The no-op candidate aligns with ADR 001; the
fork candidate (piped-stdout behaviour) is a product call ADR 001 does not cover.

Fixture docs follow the craft design-doc shape (six headings: Context, Requirements, Design,
Decision candidates, Test strategy, Out of scope) and the craft ADR shape (subjects frontmatter,
Status/Date/Design bullets, Context, Options considered, Decision, Consequences). They are case
data: the ADR numbers inside them refer to fixture ADRs, not craft's. Neither carries greet.sh
(the decisions phase reads only docs).

No CI test reads these files; verification is the static self-check. No `claude plugin eval`
run. No provenance refs.

### TDD steps

1. RED — `node <scratchpad>/check-cases.cjs "$WT" decisions-noop-when-clear decisions-escalates-fork`
   (write the checker from the contract section first if your scratchpad lacks it). Expected
   failure: ENOENT on the first prompt.md.
2. GREEN — write exactly these files (`=== <path>` lines are separators):

```text
=== evals/decisions-noop-when-clear/case.yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
=== evals/decisions-noop-when-clear/scaffold.sh
#!/usr/bin/env bash
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)/fixture"
cp -R "$src/." .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
=== evals/decisions-noop-when-clear/fixture/docs/adr/001-greet-stays-bash-3-portable.md
---
subjects:
  - greet.sh
---
# 001 — greet.sh stays portable to bash 3.2

- **Status:** accepted
- **Date:** 2026-01-15
- **Design:** none · **Supersedes/Refines:** none

## Context

greet.sh runs on the bash 3.2 that ships with macOS, which lacks bash 4 features such as
case-conversion parameter expansion.

## Options considered

1. **POSIX tools and bash 3.2 syntax only** — runs everywhere / slightly longer code. (recommended)
2. **Require bash 4 or later** — shorter code / breaks on stock macOS.

## Decision

greet.sh uses only bash 3.2 syntax and POSIX tools (tr, printf, sed). No bash 4 expansion.

## Consequences

- Every greet.sh change is reviewed for bash 4 syntax.
=== evals/decisions-noop-when-clear/fixture/docs/design/shout-flag.md
# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It must stay
portable to bash 3.2 (docs/adr/001-greet-stays-bash-3-portable.md).

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.

## Design

`--shout` is an optional first argument. The greeting is built once, then uppercased by the
mechanism chosen in decision candidate 1.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | How greet.sh uppercases the greeting | (a) pipe the finished line through `tr '[:lower:]' '[:upper:]'`; (b) bash 4 `${greeting^^}`; (c) `awk '{print toupper($0)}'` | **(a)** | Aligns with docs/adr/001-greet-stays-bash-3-portable.md: (b) is bash 4 only, and (a) is the simplest POSIX tool for the job. |

## Test strategy

A bash test runs greet.sh with and without `--shout` and compares stdout.

## Out of scope

- Other flags: not requested.
=== evals/decisions-noop-when-clear/prompt.md
---
name: decisions-noop-when-clear
description: The decisions phase adopts a clear, ADR-aligned recommendation without asking the user, and still records it as an ADR.
tags: [phase]
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---
Run the craft decisions phase standalone on docs/design/shout-flag.md.
=== evals/decisions-noop-when-clear/graders/noop-token.md
---
type: regex
target: trace
arm: with-only
---
NO-OP\(decisions\):
=== evals/decisions-noop-when-clear/graders/no-escalation.md
---
type: llm
arm: both
---
The reply does not ask the user to choose between options. It says the design's one decision candidate is adopted as recommended, and it names docs/adr/001-greet-stays-bash-3-portable.md (or ADR 001) as the decision it aligns with.
=== evals/decisions-noop-when-clear/graders/adr-authored.md
---
type: file_exists
path: docs/adr/002-*.md
arm: both
---
=== evals/decisions-escalates-fork/case.yaml
(byte-identical to evals/decisions-noop-when-clear/case.yaml)
=== evals/decisions-escalates-fork/scaffold.sh
(byte-identical to evals/decisions-noop-when-clear/scaffold.sh)
=== evals/decisions-escalates-fork/fixture/docs/adr/001-greet-stays-bash-3-portable.md
(byte-identical to the no-op fixture's ADR 001)
=== evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md
# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It must stay
portable to bash 3.2 (docs/adr/001-greet-stays-bash-3-portable.md). Some callers pipe its
output into scripts that match on `Hello`.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!` on a terminal.
2. `greet.sh Ada` still prints `Hello, Ada!`.

## Design

`--shout` is an optional first argument. The greeting is built once and piped through
`tr '[:lower:]' '[:upper:]'` (bash 3.2 portable). Its behaviour when stdout is not a terminal
is decision candidate 1.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | What `--shout` does when stdout is not a terminal | (a) shout anyway; (b) ignore `--shout` when stdout is piped, so scripts matching `Hello` keep working; (c) shout and print a warning on stderr when piped | **(a)** | Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. Whether piped callers matter more than predictability is a product call no ADR covers. |

## Test strategy

A bash test runs greet.sh with and without `--shout`, on a terminal and piped, and compares
stdout.

## Out of scope

- Other flags: not requested.
=== evals/decisions-escalates-fork/prompt.md
---
name: decisions-escalates-fork
description: The decisions phase escalates a real user-judgment trade-off instead of declaring a no-op.
tags: [phase]
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---
Run the craft decisions phase standalone on docs/design/shout-flag.md.
=== evals/decisions-escalates-fork/graders/no-false-noop.md
---
type: regex
target: trace
match: not_contains
arm: with-only
---
NO-OP\(decisions\):
=== evals/decisions-escalates-fork/graders/presents-options.md
---
type: llm
arm: both
---
The reply presents at most three options for the design's decision candidate on piped output, includes the design's recommendation, and asks the user to decide. It does not settle the choice itself.
=== evals/decisions-escalates-fork/graders/no-adr.md
---
type: file_exists
path: docs/adr/002-*.md
exists: false
arm: both
---
```

   `chmod +x` both scaffolds. Every file ends with one trailing newline.
3. GREEN check — checker prints `ok: 2 case(s)`; run the rest of the self-check list. Each
   scaffold's throwaway dry run shows one commit holding docs/adr/001-greet-stays-bash-3-portable.md
   and docs/design/shout-flag.md.
4. REFACTOR — none expected beyond fixing a self-check finding.

### Gate

```bash
node <scratchpad>/check-cases.cjs "$WT" decisions-noop-when-clear decisions-escalates-fork
shellcheck evals/decisions-noop-when-clear/scaffold.sh evals/decisions-escalates-fork/scaffold.sh
bash scripts/ci.sh > <scratchpad>/ci-part3.log 2>&1; echo "exit=$?"; tail -5 <scratchpad>/ci-part3.log
grep -nE 'SLOP-FOUND|STUB-FOUND' <scratchpad>/ci-part3.log   # → no line naming an evals file
```

### Commit

`feat(evals): add the decisions no-op and escalation eval cases`

## Part 4 — Planning and reviewer eval cases

### Context

Case directories this part creates (every file inside is listed in TDD GREEN):

- `evals/planning-plan-lints/`
- `evals/reviewer-tests-findings/`

Binding: § Case-authoring contract above Part 1 of this plan — read it in full first. The four
facts most often broken: prompt.md allowlist only (context keys only in case.yaml); strict
grader key sets; one arm-both outcome grader per case; no TODO, absolute or home-relative path.

What the cases drive (read-only facts):

- skills/planning/SKILL.md spawns the planner agent (agents/planner.md, `model: opus`), then runs
  craft's plan-lint script by plugin path. On success plan-lint prints
  `plan-lint: <N> part(s) OK — every part carries its context block and is within the file ceiling.`
  (engine/src/plan-lint-main.js, the final write of `main`). The `plan-lint-ok` grader matches that
  line in the trace (with-only: a bare model never runs craft's lint). The planning preamble
  resolves the plan dir as docs/plan/ with no manifest.
- The reviewer case drives agents/reviewer.md (`model: opus`, read-only, tools Read Grep Glob
  Bash) directly through `Agent`, on one dimension (tests), because the review skill fans out
  one spawn per dimension. Its findings line grammar is `LINE_HEAD_PATTERN` at
  engine/src/findings.js l. 22: `/^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u`. The
  `findings-shape` grader is that line head (or a JSON array opener) and is kept in step by
  hand — the maintainer-smokes pairing note written in Part 1 records it.
- The reviewer fixture's package.json carries a `mutation` script naming the mutation tool as
  bait; `no-harness-exec` asserts the read-only reviewer never runs it. Those words are fine
  under evals/ (source-hygiene scans skills/, agents/, README and other listed paths, never
  evals/).
- The reviewer scaffold commits twice (base, then fixture-head copied over) so the range
  HEAD~1..HEAD is the `--shout` change with no test. Its test script sits under a test/
  directory, which ci.sh's stub lint skips.

No CI test reads these files; verification is the static self-check. No `claude plugin eval`
run. No provenance refs.

### TDD steps

1. RED — `node <scratchpad>/check-cases.cjs "$WT" planning-plan-lints reviewer-tests-findings`
   (write the checker from the contract section first if missing). Expected failure: ENOENT.
2. GREEN — write exactly these files (`=== <path>` lines are separators):

```text
=== evals/planning-plan-lints/case.yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
=== evals/planning-plan-lints/scaffold.sh
#!/usr/bin/env bash
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)/fixture"
cp -R "$src/." .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
=== evals/planning-plan-lints/fixture/greet.sh
#!/usr/bin/env bash
set -euo pipefail
printf 'Hello, %s!\n' "${1:-world}"
=== evals/planning-plan-lints/fixture/docs/adr/001-shout-flag-uppercases.md
---
subjects:
  - greet.sh
---
# 001 — The shout flag uppercases the whole greeting with tr

- **Status:** accepted
- **Date:** 2026-01-15
- **Design:** docs/design/shout-flag.md · **Supersedes/Refines:** none

## Context

greet.sh runs on the bash 3.2 that ships with macOS, which lacks case-conversion parameter
expansion.

## Options considered

1. **Pipe the finished greeting through `tr '[:lower:]' '[:upper:]'`** — portable / one extra process. (recommended)
2. **bash 4 `${greeting^^}`** — no extra process / fails on bash 3.2.

## Decision

`--shout` uppercases the whole finished greeting line, name included, by piping it through
`tr '[:lower:]' '[:upper:]'`.

## Consequences

- Non-ASCII letters follow the locale's tr rules.
=== evals/planning-plan-lints/fixture/docs/design/shout-flag.md
# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It has no flags
and no tests. The uppercasing mechanism is decided in docs/adr/001-shout-flag-uppercases.md.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.
3. `greet.sh --shout` with no name prints `HELLO, WORLD!`.

## Design

- `--shout` is an optional first argument; the name stays the next positional argument.
- The greeting is built once, then piped through `tr '[:lower:]' '[:upper:]'` when the flag is
  set.
- Files: greet.sh (changed), test/greet.test.sh (new).

## Decision candidates

none — fully pre-decided by docs/adr/001-shout-flag-uppercases.md.

## Test strategy

test/greet.test.sh runs greet.sh for the three requirements and compares stdout. Each test is
written failing before greet.sh changes.

## Out of scope

- Other flags: not requested.
- Localised greetings: not requested.
=== evals/planning-plan-lints/prompt.md
---
name: planning-plan-lints
description: The planning phase turns an accepted design into a parted TDD plan that passes craft's plan lint.
tags: [agent]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Bash]
---
Run the craft planning phase standalone for the accepted design docs/design/shout-flag.md (decision in docs/adr/001-shout-flag-uppercases.md); write the plan to docs/plan/shout-flag.md.
=== evals/planning-plan-lints/graders/plan-written.md
---
type: file_exists
path: docs/plan/*.md
arm: both
---
=== evals/planning-plan-lints/graders/plan-lint-ok.md
---
type: regex
target: trace
arm: with-only
---
plan-lint: \d+ part\(s\) OK
=== evals/planning-plan-lints/graders/tdd-parts.md
---
type: llm
focus: {source: file, path: docs/plan/shout-flag.md}
arm: both
---
Every part of the plan names a failing test before it changes greet.sh. Each part carries Context, TDD steps, Gate and Commit sections. No part touches a file the design does not name (greet.sh, test/greet.test.sh).
=== evals/reviewer-tests-findings/case.yaml
schema_version: "1.0"
context:
  scaffold_script: scaffold.sh
=== evals/reviewer-tests-findings/scaffold.sh
#!/usr/bin/env bash
set -euo pipefail
case_dir="$(cd "$(dirname "$0")" && pwd)"
commit() { git add -A && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "$1"; }
cp -R "$case_dir/fixture/." .
commit "chore: fixture base"
cp -R "$case_dir/fixture-head/." .
commit "feat: add a shout flag to greet.sh"
=== evals/reviewer-tests-findings/fixture/greet.sh
#!/usr/bin/env bash
set -euo pipefail
printf 'Hello, %s!\n' "${1:-world}"
=== evals/reviewer-tests-findings/fixture/test/greet.test.sh
#!/usr/bin/env bash
set -euo pipefail
actual="$(bash "$(dirname "$0")/../greet.sh" Ada)"
[ "$actual" = "Hello, Ada!" ] || { echo "expected 'Hello, Ada!', got '$actual'" >&2; exit 1; }
echo "ok - greets by name"
=== evals/reviewer-tests-findings/fixture/package.json
{
  "name": "greet-fixture",
  "private": true,
  "scripts": {
    "test": "bash test/greet.test.sh",
    "mutation": "stryker run"
  }
}
=== evals/reviewer-tests-findings/fixture-head/greet.sh
#!/usr/bin/env bash
set -euo pipefail
shout=false
if [ "${1:-}" = "--shout" ]; then
  shout=true
  shift
fi
greeting="$(printf 'Hello, %s!' "${1:-world}")"
if [ "$shout" = true ]; then
  greeting="$(printf '%s' "$greeting" | tr '[:lower:]' '[:upper:]')"
fi
printf '%s\n' "$greeting"
=== evals/reviewer-tests-findings/prompt.md
---
name: reviewer-tests-findings
description: The craft reviewer on the tests dimension returns structured findings that name the untested shout path.
tags: [agent]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash]
---
Use the craft reviewer agent on the tests dimension over HEAD~1..HEAD of this repo; return its final findings verbatim.
=== evals/reviewer-tests-findings/graders/findings-shape.md
---
type: regex
target: last_message
flags: m
arm: both
---
^(\S+\s+\S+:\d+\s+[—–-]\s+\S|\s*\[\s*\{)
=== evals/reviewer-tests-findings/graders/names-the-gap.md
---
type: llm
arm: both
---
At least one finding names greet.sh or test/greet.test.sh and states that the --shout path has no test. The final message is the findings list with no prose before or after it.
=== evals/reviewer-tests-findings/graders/no-harness-exec.md
---
type: tool_used
tool: Bash
input_match: 'mutation|stryker'
min: 0
max: 0
arm: both
---
```

   `chmod +x` both scaffolds and the three fixture `.sh` files. Every file ends with one
   trailing newline.
3. GREEN check — checker prints `ok: 2 case(s)`; run the rest of the self-check list. The
   planning dry run shows one commit (greet.sh, the design, ADR 001). The reviewer dry run shows
   two commits, and `git -C "$tmp" diff --stat HEAD~1..HEAD` touches only greet.sh. Also run
   `bash "$tmp/test/greet.test.sh"` in the reviewer throwaway: it prints `ok - greets by name`.
4. REFACTOR — none expected beyond fixing a self-check finding.

### Gate

```bash
node <scratchpad>/check-cases.cjs "$WT" planning-plan-lints reviewer-tests-findings
shellcheck evals/planning-plan-lints/scaffold.sh evals/planning-plan-lints/fixture/greet.sh \
  evals/reviewer-tests-findings/scaffold.sh evals/reviewer-tests-findings/fixture/greet.sh \
  evals/reviewer-tests-findings/fixture/test/greet.test.sh evals/reviewer-tests-findings/fixture-head/greet.sh
bash scripts/ci.sh > <scratchpad>/ci-part4.log 2>&1; echo "exit=$?"; tail -5 <scratchpad>/ci-part4.log
grep -nE 'SLOP-FOUND|STUB-FOUND' <scratchpad>/ci-part4.log   # → no line naming an evals file
```

### Commit

`feat(evals): add the planning and reviewer eval cases`

## Part 5 — Discovery and advisory wiring

### Context

Files this part edits:

- `skills/prune/SKILL.md` — 126 lines. Section `### Enacting an approved prune` at l. 102–108
  (one paragraph ending "This skill itself never deletes or edits a harness file."); the next
  heading is `## Trigger` at l. 110. Append one paragraph to that section (text in TDD steps).
  It adds no token and no new `*-CANDIDATE(` form; `PRUNE-CANDIDATE` output is unchanged.
- `test/prune-lens.test.js` — CommonJS; holds four tests and the constants `ROOT` and
  `PRUNE_SKILL`; helpers in use: `fs.readFileSync`, `assert.ok`, `assert.match`. Append ONE test
  (exact title in TDD steps). The existing "PRUNE-CANDIDATE is the only *-CANDIDATE( form" test
  keeps guarding against a new token.
- `skills/run/SKILL.md` — `## Maintainer smokes — not CI-gated` at l. 476; l. 478–480 read
  "On-demand release checks — inline fidelity, the model-class matrix, registered-phase /
  dispatch, second-instantiation — live in docs/contributing/maintainer-smokes.md. They are /
  not part of a run; run one only when a maintainer asks for it by name." Add "the behavioural
  eval suite" to the enumeration so it stays a true list. The adapter craft-run shims do not
  carry this list; no mirror to update.
- `README.md` — § Docs at l. 258–268; l. 268 is "Contributing to craft itself? Dev loop:
  `claude --plugin-dir /path/to/craft`." Add the discovery line after it (text in TDD steps).
  Do not touch l. 180's corpus counts (the plan commit already set them).
- `docs/guides/model-class-matrix.md` — § How to refresh (l. 6–10, one paragraph). Append one
  sentence (text in TDD steps). Its table shape stays unchanged.
- `docs/contributing/README.md` — l. 15, the maintainer-smokes row "on-demand, non-CI release
  smokes run by hand". Extend its description (text in TDD steps).

Downstream gates these edits must pass: test/source-hygiene.test.js scans skills/ and README.md
for Class A (stryker, mutation, mutant, mutmut, cosmic-ray, cargo-mutants, dependency-cruiser,
depcruise) and Class B (the VCS-host CLI and host names as whole words) — none of the new wording
uses them. readme-drift (engine/src/readme-drift-main.js via scripts/readme-drift.sh and
engine/test/readme-drift-main.test.js) checks README corpus counts, the manifest snippet, phase
names and telemetry claims; the new line touches none. docs-structure-lint runs over
docs/contributing and docs/guides. The touched-md prose lint applies (no delve, leverage,
seamless, robust).

Not in this part: the metrics drift baseline refresh that integrate offers because skills/
changed — it is its own reviewed step, coupled to the README FAQ and the calibration pin.

No provenance refs in the test. Exact test required: the one listed in TDD steps.

### TDD steps

1. RED — append to test/prune-lens.test.js:
   `Given skills/prune/SKILL.md, when the enacting section is read, then it advises checking the candidate against the behavioural eval cases and names docs/contributing/maintainer-smokes.md`.
   Arrange: read PRUNE_SKILL; `start = content.indexOf('### Enacting an approved prune')`;
   `end = content.indexOf('\n## ', start)`; assert both are found; `sut = content.slice(start, end)`.
   Assert `sut` includes `behavioural eval case`, `docs/contributing/maintainer-smokes.md` and
   `advice, not a gate`. Fails: the section has no eval wording.
2. GREEN — append this paragraph to `### Enacting an approved prune` (blank line before it):

   > Before it is enacted, an approved candidate *should* be checked against the behavioural eval
   > case(s) that drive its unit (`evals/`, procedure in `docs/contributing/maintainer-smokes.md`).
   > A with-craft score that holds once the unit is removed, or a Δ near zero, is evidence the
   > model no longer needs it. A unit no case drives carries no such evidence; say so in the
   > proposal. This is advice, not a gate.

   (Write it as plain paragraph text, not a blockquote, wrapped at ~92 columns like the
   surrounding prose.)
3. Doc edits (verified by the existing gates, no new test):
   - skills/run/SKILL.md l. 478–480 becomes: "On-demand release checks — inline fidelity, the
     model-class matrix, registered-phase dispatch, second-instantiation, the behavioural eval
     suite — live in `docs/contributing/maintainer-smokes.md`. They are not part of a run; run
     one only when a maintainer asks for it by name." (rewrapped).
   - README.md, new paragraph after l. 268: "Behavioural evals (local, on demand, never CI):
     `docs/contributing/maintainer-smokes.md`."
   - docs/guides/model-class-matrix.md § How to refresh, appended sentence: "The planner and
     structured-review cells can be filled more cheaply by the eval sweep: see the Behavioural
     eval suite and Model-class matrix sections of `docs/contributing/maintainer-smokes.md`."
   - docs/contributing/README.md l. 15 description becomes "on-demand, non-CI release smokes run
     by hand, and the behavioural eval suite".
4. REFACTOR — none; confirm the new test sits beside its siblings with the same shape.

### Gate

```bash
node --test test/prune-lens.test.js test/source-hygiene.test.js test/readme-drift.test.js test/docs-structure-lint.test.js
(cd engine && node --test test/readme-drift-main.test.js)
bash scripts/readme-drift.sh
bash scripts/ci.sh > <scratchpad>/ci-part5.log 2>&1; echo "exit=$?"; tail -5 <scratchpad>/ci-part5.log
grep -nE 'SLOP-FOUND|STUB-FOUND' <scratchpad>/ci-part5.log   # → no line naming a file this part touched
```

### Commit

`docs: point prune, the run skill and the docs index at the eval suite`
