# Plan — eval-sweep follow-ups: reviewer severity scale, haiku session floor, sandbox git

> Source: design doc `docs/contributing/design/eval-sweep-followups.md` · ADRs 396, 397, 398, 399, 400, 401, 402
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

**How this plan applies them.** No part has an `engine/src/` delta. Three parts, strictly
sequential on one working tree, separated by two orchestrator checkpoints that spend money and
are never part work:

```text
Part 1 (commit C1: procedure, route B, prompt clauses, README floor)
  → Checkpoint A (orchestrator, paid: S1–S3 pilots incl. P2, then S4 before runs)
Part 2 (commit C2: reviewer severity scale + agreement tests + six mirrors)
  → Checkpoint B (orchestrator, paid: S5 sweep per tier)
Part 3 (results docs: matrix cells/note/How to refresh, maintainer-smokes costs and
        "Reviewer output shape", BACKLOG closure)
```

- Part 1 is docs plus two eval-case prompt edits and one scaffold line: no behaviour a CI test
  may pin (no test reads the eval case tree), so it has no RED; its gate is the suites that
  already pin the touched files.
- Part 2 is the one part with behaviour: a strict RED (the agreement test) → GREEN (the agent
  bullet, then the mirror sync).
- Part 3 is docs only and consumes numbers it must not invent: the orchestrator hands them over
  in the block named in Part 3's context.
- Probe P1 already ran (outcome O1: route B). It is not a part and nothing of it is committed.
- **Overlap, stated:** `docs/contributing/maintainer-smokes.md` is declared by Part 1 and
  Part 3. They cannot merge: Part 1 writes the procedure the paid runs execute (it must land
  before Checkpoint A), and Part 3 writes measured costs and the measured P2 finding that exist
  only after Checkpoints A and B. The two parts edit disjoint paragraphs, named in each part.

**Public surface.** The plan introduces no exported code symbol. The two helpers Part 2 adds
to `test/p10-structure.test.js` are module-private (never exported). Public, non-code surfaces
and their downstream gates, pre-paid in the part that touches them:

| Surface | Part | Downstream gates |
|---|---|---|
| `agents/reviewer.md` Contract bullet (agent-facing) | 2 | six adapter mirrors via `scripts/sync-adapter-agents.sh --write`, `--check` in ci; six adapter byte-identity suites; `test/source-hygiene.test.js` (scans `agents/`); `test/plugin-evals-local-only.test.js` (scans `agents/` for fenced eval commands) |
| README FAQ entry | 1 | `test/readme-drift.test.js` + `scripts/readme-drift.sh` (cost anchor patterns); `test/source-hygiene.test.js` (README); `test/plugin-evals-local-only.test.js` (no unflagged fenced eval command in README); touched-md prose lint |
| maintainer-smokes sweep procedure | 1, 3 | `test/plugin-evals-local-only.test.js` (every fenced `claude plugin eval` carries `--no-publish` and `--max-cost-usd`, none carries `--trust-plugin` or `--publish-report`); `docs-structure-lint docs/contributing`; prose lint |
| model-class matrix guide | 3 | `test/plugin-evals-local-only.test.js` (guides scan); `docs-structure-lint docs/guides` and `--audience docs`; prose lint |
| `BACKLOG.md` | 3 | `scripts/backlog-lint.sh`; intention-lint (SoT pointer blocks only) |

**Binding for every part.**

- No part runs `claude plugin eval` (paid; the orchestrator runs it with user approval at the
  checkpoints).
- No provenance references (ADR numbers, phase/part/step numbers, backlog ids) in test code,
  test titles, test comments, scaffolds or case files. Docs (maintainer-smokes, matrix, README,
  BACKLOG) may cite ADRs but need not.
- No grader file changes (the before/after must measure only the agent edit).
- No suppression directives. Commit only the files the part names (`git add <path>…` +
  `git commit`); never touch the branch, index beyond your own adds, stash or other files.
- Any command whose output may exceed ~100 lines writes to a scratch file; read back with
  `tail`/`grep`. `bash scripts/ci.sh` must be green before every commit. One timing test
  (`normalizeFindings … sub-quadratically`) is a known flake: re-run ci once before treating
  it as red.
- Avoid the prose-lint ban list (`engine/src/prose-lint-main.js` `BAN_LIST`: delve, leverage,
  seamless, robust, "it's important to note", "in conclusion") in every touched `.md`.

## Decision candidates

Plan-level choices the design and ADRs leave open. The parts are written against each
recommendation; each is swappable inside its part.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where the paid checkpoints live in the plan | (a) a `## Checkpoint` section between the parts it separates, plus the sequence diagram above; (b) the preamble only; (c) a note inside each preceding part's `### Commit` | **(a)** | plan-lint splits parts only at `## Part`, so a `## Checkpoint` heading carrying no `###` heading sits inside the preceding part's range without changing its four-section check or its context block (the block ends at the next `###`). Reading top-to-bottom, the orchestrator meets the stop exactly where it must stop. (b) separates the stop from its position. (c) puts paid-run text inside a block a part-implementer reads as its own instructions. |
| 2 | Which part drops the haiku-pilot sentence and rewrites the session-tier text of the sweep procedure | (a) Part 1, everything that does not need a measured value; Part 3 adds only costs and the measured P2 finding; (b) Part 3 does the whole sweep-procedure rewrite after the sweep | **(a)** | The pilots on C1 must run the procedure as written; (b) leaves the committed command at `--model <id>` while the runs use a sonnet session, so C1 would not be the tree that describes what ran. |
| 3 | How Part 2 declares the six regenerated mirrors under the 6-file ceiling | (a) one glob span `adapters/*/agents/craft-reviewer.md` (counts as one path); (b) six spans plus a `--file-ceiling` override; (c) list them in plain text | **(a)** | The mirrors are script output with zero authoring load, but they ARE edited files and must be committed with the agent edit (ci's `--check` fails otherwise). (a) keeps them declared and countable; (b) needs a lint override the plan gate does not pass; (c) hides edited files. |
| 4 | How Part 3 receives the measured values | (a) the orchestrator passes the filled hand-off block (Part 3 § Context) in the part's invocation, with the aggregate paths so the implementer can spot-check; (b) the orchestrator commits a results file the part reads; (c) the part recomputes everything from the aggregates | **(a)** | (b) commits a scratch artefact or needs a later delete; (c) re-derives judgment calls (user rescoring, invalid tiers, expectation misses) that are not in the aggregates. (a) keeps one source for every number and lets the part refuse on a missing field. |

## Part 1 — Sweep procedure, sandbox-git route B, prompt clauses and README session floor (commit C1)

### Context

Files this part edits (five):

- `docs/contributing/maintainer-smokes.md` — three paragraphs, nothing else:
  1. "**Git inside the sandbox (macOS).**" paragraph, l. 97–100 (route B text).
  2. First paragraph under "## Model-class matrix (cross-tier) — not CI-gated", l. 191–196
     (columns name the agent tier).
  3. "**Eval sweep (planner and structured-review rows).**" block, l. 208–239 (sonnet session,
     session-tier bullet, judge rule, `--model` bullet, trace check). Keep the 2026-10-07 cost
     numbers in the `<ceiling>` bullet as they are (Part 3 replaces them); delete only the
     sentence "A haiku pilot can read cheap because haiku sometimes stops before planning."
     Do NOT touch "Reviewer output shape" (l. 153–158): Part 3 owns it.
- `evals/reviewer-tests-findings/scaffold.sh` — 9 lines today; gains one line after the last
  `commit "feat: add a shout flag to greet.sh"` (l. 9), reaching exactly 10 (the scaffold
  ceiling). Guard line l. 3 untouched. ci's shellcheck covers only scripts/ and hooks/, so
  shellcheck this file by hand; ci's touched-diff stub lint does scan it.
- `evals/reviewer-tests-findings/prompt.md` — body line l. 9 only; frontmatter l. 1–8 unchanged.
  Today: "Use the craft reviewer agent on the tests dimension over HEAD~1..HEAD of this repo;
  return its final findings verbatim."
- `evals/planning-plan-lints/prompt.md` — body line l. 9 only; frontmatter unchanged. Today:
  "Run the craft planning phase standalone for the accepted design docs/design/shout-flag.md
  (decision in docs/adr/001-shout-flag-uppercases.md); write the plan to docs/plan/shout-flag.md."
- `README.md` — one new FAQ entry inserted between "**Does it work on an existing, messy
  repo?**" (l. 247–249) and "**What happens when a gate goes red?**" (l. 251). The FAQ starts
  at "## FAQ" (l. 236). The README corpus count already reads 32 parted plans (the plan commit
  bumped it); do not touch l. 180.

Read-only references (do not edit): the design doc docs/contributing/design/eval-sweep-followups.md
§ 2, § 3, § 4 route B; ADRs 396, 398, 399, 400, 402 under docs/contributing/adr/;
engine/src/readme-regions.js (extractCostClaims reads from the "What does a run cost?" anchor
to end of file, patterns: "(\d+) telemetered runs", "≈([\d.]+) hours", "to ≈(\d+) hours",
"half an hour|under \d+ minutes" — the new FAQ text must contain none of them);
test/plugin-evals-local-only.test.js (fence parser: a fenced line matching
"claude plugin eval" must carry --no-publish and --max-cost-usd and must not carry
--trust-plugin or --publish-report; also forbids any script or test file from naming an evals
path); evals/reviewer-tests-findings/graders/ (unchanged — names-the-gap, findings-shape,
no-harness-exec).

Settled facts this part writes down (from probe P1, already run, outcome O1): the eval child
keeps the operator's PATH order with a Homebrew git directory ahead of /usr/bin, yet
`type -a git` lists only /usr/bin/git, and a PATH prepend inside the command still resolves
/usr/bin/git. Route A (operator PATH) and route C (documented floor) are out; route B is in.
No machine-specific path (a Homebrew prefix) may be committed to a case file; the docs may name
the shim path /usr/bin/git.

Behaviour of the new scaffold line: the scaffold runs outside the OS sandbox with the
operator's git, so `git diff --no-ext-diff HEAD~1 HEAD > .git/review-range.diff` writes the
fixture range's diff inside `.git/`; the working tree and `git status` still match HEAD, and
the child can read the file (sandbox reads cover cwd). Both arms receive the same file. The
planner case gets no git fix (no grader depends on its commit); it gets only the
working-directory clause.

### TDD steps

RED: none. Every edit is prose, a prompt string or a scaffold line; no CI test may read the
eval case tree, and the existing suites below already pin the touched docs. Verification is the
gate plus a throwaway scaffold run.

GREEN, in order:

1. `evals/reviewer-tests-findings/scaffold.sh`: append exactly this line after l. 9:

   ```bash
   git diff --no-ext-diff HEAD~1 HEAD > .git/review-range.diff
   ```

   Then `shellcheck evals/reviewer-tests-findings/scaffold.sh` and confirm
   `wc -l < evals/reviewer-tests-findings/scaffold.sh` prints 10.
   Throwaway run (never in the worktree):

   ```bash
   t=$(mktemp -d); mkdir "$t/home" "$t/box"; cd "$t/box" && git init -q \
     && HOME="$t/home" bash /Users/scolladon/workspace/perso/craft-eval-sweep-followups/evals/reviewer-tests-findings/scaffold.sh \
     && grep -c '^+' .git/review-range.diff && git status --porcelain | wc -l
   ```

   Expect a non-zero `+` count naming greet.sh, and 0 porcelain lines. Then `rm -rf "$t"`.
2. `evals/reviewer-tests-findings/prompt.md` body becomes exactly:

   ```text
   Use the craft reviewer agent on the tests dimension over HEAD~1..HEAD of the git repository in the current working directory (the range's diff is also saved at .git/review-range.diff); return its final findings verbatim.
   ```

3. `evals/planning-plan-lints/prompt.md` body becomes exactly:

   ```text
   Run the craft planning phase standalone in the git repository in the current working directory, for the accepted design docs/design/shout-flag.md (decision in docs/adr/001-shout-flag-uppercases.md); write the plan to docs/plan/shout-flag.md.
   ```

4. `README.md`: insert this FAQ entry (verbatim from the design) after the "existing, messy
   repo" entry, separated by one blank line on each side:

   ```markdown
   **Which model should run the session?** opus or sonnet. The session model runs `/craft:run`,
   the phase skills, and every phase set to `execution: inline`. A haiku session is not
   supported: in the behavioural eval sweep it loaded the planning skill and ended its turn
   without spawning the planner. haiku stays routable per agent through `models.<agent>` and
   `models.fallback`.
   ```

5. maintainer-smokes "Git inside the sandbox (macOS)" (l. 97–100) becomes:

   ```markdown
   **Git inside the sandbox (macOS).** `/usr/bin/git` is the Xcode shim, and inside the eval
   sandbox it fails: `couldn't create cache file '…/T/xcrun_db-…'`, then `Failed to locate 'git'`.
   `PATH` cannot route around it: a probe child (2026-10-07) kept the operator's `PATH` order,
   with a Homebrew git directory ahead of `/usr/bin`, yet `type -a git` listed only
   `/usr/bin/git`, and a `PATH` prepend inside the command still resolved `/usr/bin/git`. A
   scaffold runs outside the sandbox, where git works, so `reviewer-tests-findings` writes the
   reviewed range's diff to `.git/review-range.diff` after its last commit, and its prompt names
   that file; both arms get it. `planning-plan-lints` keeps the failure: no grader depends on the
   planner's commit. A case whose outcome needs git inside the child scores 0 on such a machine.
   ```

6. maintainer-smokes § Model-class matrix, first paragraph (l. 191–196) becomes:

   ```markdown
   On demand / when a maintainer wants the full-pipeline + output-quality matrix: run the
   full pipeline on a representative brief once per agent tier of the Claude class — opus
   (`claude-opus-5-5`), sonnet (`claude-sonnet-5-5`), haiku (`claude-haiku-4-5`) — record a
   tier×dimension PASS/PARTIAL/FAIL table (dimensions: planner / part-TDD / structured-review /
   blocker / full-pipeline-completion), and capture the per-phase tokens + wall-clock into the
   committed artifact and the run record. A column names the tier the craft agents run at. The
   session runs at opus or sonnet, since craft does not support a haiku session; the haiku
   column routes the agents to haiku through the manifest's `models.*` keys or the sub-agent
   override below.
   ```

7. maintainer-smokes "Eval sweep" block (l. 208–239):
   - Lead paragraph: replace "three runs per tier. For each tier `<id>`:" with "three runs per
     tier. The session stays at sonnet in every column; only the agent tier `<agent-id>` moves:".
   - Fenced command becomes (keep the `bash` fence):

     ```bash
     CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
       claude plugin eval . --tag agent --model claude-sonnet-5-5 \
       --no-publish --scaffold --keep-temp --allow-tools Write Bash \
       --judge-model <judge> --max-cost-usd <ceiling>
     ```

   - New first bullet: "- Session tier: `claude-sonnet-5-5` in every column. A haiku session
     is not supported, and a fixed session leaves the agent tier as the one variable per column.
     The sonnet column (session and agents at sonnet) repeats the 2026-10-07 configuration and
     is the control against it; the opus and haiku columns are not comparable with 2026-10-07,
     whose session ran at the column tier."
   - `<ceiling>` bullet: delete only "A haiku pilot can read cheap because haiku sometimes stops
     before planning." Keep the rest verbatim.
   - `<judge>` bullet: replace "so the judge is never the model under test." with "so the judge
     is never at the agent tier under test; it may share the session's tier."
   - `--model` bullet (l. 226–232) becomes: "- `--model` moves only the session.
     `agents/planner.md` and `agents/reviewer.md` pin `model: opus`, so the agents need both
     variables (sweep of 2026-10-07, Claude Code 2.1.292): with `CLAUDE_CODE_SUBAGENT_MODEL`
     alone the pin won and a sonnet session spawned opus agents; adding
     `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` moved them to the override's tier, which equalled the
     session's in that sweep. The override also reaches agents the bare arm spawns, so both
     arms run their agents at the column tier. The trace check below verifies the tiers on
     every run."
   - Keep the `--keep-temp`, Cell, note and full-pipeline bullets verbatim.
   - After the last bullet, add a paragraph "**Trace check, every run.** Run it on each
     `aggregate-result.json`. It reads only the kept traces: a kept sandbox is sealed, so never
     run git inside it." followed by this fenced block, verbatim from the design § 3:

     ```bash
     f=evals/results/<ts>/aggregate-result.json; root=$(jq -r .suite.root "$f")
     jq -r '.cases[] | .name as $n | .arms | to_entries[] | .key as $a | .value[] | "\($n)\t\($a)\t\(.tracePath)"' "$f" |
     while IFS=$'\t' read -r name arm trace; do
       sandbox=$(dirname "$(dirname "$trace")")
       cmds=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="Bash") | .input.command' "$trace")
       tiers=$(jq -r 'select(.type=="assistant") | "\(if .parent_tool_use_id then "agent" else "session" end)=\(.message.model)"' "$trace" | sort -u | tr '\n' ' ')
       gitfail=$(grep -c "Failed to locate 'git'" "$trace")
       left=$(printf '%s\n' "$cmds" | grep -E '(cd|git +-C) +"?/' | grep -cvF "$sandbox")
       [ "$name" = reviewer-tests-findings ] && left=$(( left + $(printf '%s\n' "$cmds" | grep -cF "$root") ))
       printf '%s %s %s gitfail=%s left=%s\n' "$name" "$arm" "$tiers" "$gitfail" "$left"
     done
     ```

     then three bullets:
     - "`tiers`: assistant events with a `parent_tool_use_id` are the agent's. Session events
       must name `claude-sonnet-5-5` and agent events the column's `<agent-id>`, matched on the
       prefix: `message.model` carries a dated id such as `claude-haiku-4-5-20251001`. A run
       whose agent events show another tier invalidates its column: say so in the note under
       the matrix table and leave the cell unfilled."
     - "`left`: every `cd` or `git -C` to an absolute path outside the run's own sandbox (the
       parent of `out/`), plus, for `reviewer-tests-findings`, any command that names the
       plugin root (`suite.root`). The planner case runs `scripts/plan-lint.sh` by its absolute
       plugin path, so it is spared that second count. Every reviewer-case run must show
       `left=0`; name any run with `left>0` in the note under the matrix table."
     - "`gitfail`: how often the trace says `Failed to locate 'git'`. It is reported in the
       note, not a pass condition."

REFACTOR: re-read the three maintainer-smokes paragraphs top to bottom: no sentence still says
the session runs at the column tier, no sentence claims a measured P2 result (Part 3 adds it),
and the fenced command still carries `--no-publish` and `--max-cost-usd`.

### Gate

```bash
cd /Users/scolladon/workspace/perso/craft-eval-sweep-followups && scratch=$(mktemp -d)
shellcheck evals/reviewer-tests-findings/scaffold.sh
test "$(wc -l < evals/reviewer-tests-findings/scaffold.sh)" -eq 10
node --test test/plugin-evals-local-only.test.js test/readme-drift.test.js test/source-hygiene.test.js test/docs-structure-lint.test.js > "$scratch/p1.txt" 2>&1; tail -n 12 "$scratch/p1.txt"
bash scripts/readme-drift.sh
bash scripts/ci.sh > "$scratch/ci.txt" 2>&1; echo "exit=$?"; tail -n 20 "$scratch/ci.txt"
```

### Commit

`fix(evals): hold the sweep session at sonnet and hand the reviewer case its range diff`

Files: `docs/contributing/maintainer-smokes.md`, `evals/reviewer-tests-findings/scaffold.sh`,
`evals/reviewer-tests-findings/prompt.md`, `evals/planning-plan-lints/prompt.md`, `README.md`.
This commit is C1, the tree Checkpoint A runs on.

## Checkpoint A — pilots and before runs (orchestrator only, paid, needs user approval)

Not a part: no implementer runs this. Run on C1 (Part 1's commit), from the worktree root.

Preconditions, every launch: `npm ci` in engine/ of the checkout under test (once); gate the
launch on `command -v claude`; never pass `--trust-plugin`; one tier at a time, each approved by
the user; check the log shows `Ablation: … (N runs)`; run the trace check (maintainer-smokes
"Trace check, every run") on every aggregate; copy every aggregate-result.json to
~/craft-eval-results/ before merge; show the user every grade at every tier (read the judge's
`evidence`, the judge answers in one word). A ceiling hit (exit 2) means re-pilot that tier;
never raise the cap.

| Step | Selector | Session / agent (`CLAUDE_CODE_SUBAGENT_MODEL`, FORCE=1) | Judge | Runs | Ceiling | Read |
|---|---|---|---|---|---|---|
| S1 = P2 | `--tag agent` | sonnet / `claude-haiku-4-5` | `claude-sonnet-5-5` | `--runs 1` | USD 5 | agent tier (P2); route-B acceptance; top-level and per-case `costUsd` |
| S2 | `--tag agent` | sonnet / `claude-sonnet-5-5` | `claude-opus-5-5` | `--runs 1` | USD 5 | top-level and per-case `costUsd` |
| S3 | `--tag agent` | sonnet / `claude-opus-5-5` | `claude-sonnet-5-5` | `--runs 1` | USD 5 | top-level and per-case `costUsd` |
| S4 (before), per tier | `--case reviewer-tests-findings` | sonnet / that tier | that tier's judge | 3 (default) | that tier's pilot reviewer-case `costUsd` × 3 × 1.5 | with-arm mean, Δ, `findings-shape` passes of 3, `claudeVersion`, `gitfail`/`left` |

Stop rules:

- **P2 at S1.** Session events must match `claude-sonnet-5-5*` and agent events
  `claude-haiku-4-5*`. If agent events show sonnet, FORCE follows the session: stop before S2,
  run nothing further, and re-open ADR-398 and ADR-402 with the user together. No silent
  fallback. The S1 data then counts as a sonnet-agent pilot.
- **Route-B acceptance at S1.** Every reviewer-case run has `left=0`, and its findings name
  greet.sh or test/greet.test.sh (`names-the-gap` passes, or the judge `evidence` shows the
  change was read). `gitfail` may be non-zero. A miss is a blocker to the user
  ({unit: route B, reason, options}), not a retry loop.
- Any run whose agent tier is wrong invalidates that tier.

Useful reads: per-case cost `jq '[.cases[] | select(.name=="reviewer-tests-findings") | .arms[][] | .costUsd] | add' "$f"`;
`findings-shape` passes `jq '[.cases[] | select(.name=="reviewer-tests-findings") | .arms.with[] | .graders[] | select(.name=="findings-shape") | .passed] | map(select(.)) | length' "$f"`.

Record for Part 3: S1–S3 top-level `costUsd` per tier, S1 agent/session model ids and
`claudeVersion`, and per tier the S4 reviewer with-arm mean, Δ, `findings-shape` passes,
`claudeVersion`, `costUsd`.

## Part 2 — Reviewer severity scale with an agent/contract agreement test (commit C2)

### Context

Files this part edits:

- `test/p10-structure.test.js` (318 lines, CommonJS, `node:test` + `node:assert`; `ROOT` at
  l. 8; `listAgentFiles()` l. 43; `readToolsList(filePath)` l. 57). The reviewer tests sit at
  l. 260–294: "…then it declares no dedicated editor tool" (l. 268) and "…then it is exactly the
  read-plus-Bash set" (l. 283–294). Insert the two new helpers and two new tests after l. 294
  and before the test "Given every agent, when its tools list is read, then no entry is an MCP
  tool or a sub-agent-spawning tool" (l. 296). No new file.
- `agents/reviewer.md` (23 lines). Contract bullets l. 15–23. The claim-status bullet is
  l. 20–22 ("Tag each emitted finding with its claim status over\n  {VERIFIED, SUSPECT,
  RULED-OUT, PROBE}, …"); "Final message" bullet is l. 23. The new bullet goes between them.
  Frontmatter (l. 1–6) and the tools list are unchanged (pinned by the tools tests above).
- `adapters/*/agents/craft-reviewer.md` — the six body mirrors (aider, antigravity, codex,
  copilot, cursor, opencode). Never hand-edit: `bash scripts/sync-adapter-agents.sh --write`
  rewrites the BODY only (keeps each adapter's own frontmatter); `--check` (read-only) runs in
  ci at scripts/ci.sh l. 86. Byte-identity is pinned per adapter by
  adapters/{aider,antigravity,codex,copilot,cursor}/test/native-surface.test.js and
  adapters/opencode/test/agents.test.js through their `bodyOf`; ci runs each adapter suite
  with the adapter directory as cwd.

Read-only reference: contracts/harness-read.md l. 2, today "Structured findings: each finding
reported as { file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix, status?:
VERIFIED|SUSPECT|RULED-OUT|PROBE }. …". Do not edit it. engine/src/findings.js parses severity
as a free string; it is not touched.

Public surface: the agent bullet is agent-facing (public); its gates are the mirror sync, the
six byte-identity suites, test/source-hygiene.test.js (scans agents/: no mutation-tool names,
no VCS-host CLI tokens) and test/plugin-evals-local-only.test.js (no fenced eval command in
agents/). The two test helpers are internal (module-private, not exported).

Out of this part: the `findings-shape` grader (unchanged), the eval prompts (Part 1), the
metrics baseline refresh integrate offers after an agents/ edit (its own reviewed step).

### TDD steps

RED 1 — severity agreement. Add, after l. 294:

```js
const REVIEWER_AGENT = path.join(ROOT, 'agents/reviewer.md');
const HARNESS_READ_CONTRACT = path.join(ROOT, 'contracts/harness-read.md');

// A directly spawned reviewer sees only its own body; the review phase also injects the
// contract. Each set is written in both places, so the two copies must stay equal.
function agentSetFor(text, key) {
  const match = text.match(new RegExp(`${key}[^{]*\\{([^}]+)\\}`, 'i'));
  if (!match) return [];
  return match[1].split(',').map((entry) => entry.trim());
}

function contractSetFor(text, key) {
  const match = text.match(new RegExp(`${key}\\??:\\s*([A-Z-]+(?:\\|[A-Z-]+)+)`));
  if (!match) return [];
  return match[1].split('|');
}
```

Test title: "Given the reviewer agent and the harness-read contract, when each one's severity
scale is read, then both name the same non-empty scale". Body (AAA, `sut`): read both files;
`const result = agentSetFor(sut, 'severity');` assert `result.length > 0` with message
"agents/reviewer.md should name a severity set", then
`assert.deepStrictEqual([...result].sort(), [...contractSetFor(contract, 'severity')].sort())`.
Run `node --test test/p10-structure.test.js`. **Expected failure:** the non-empty assertion —
the reviewer body has no "severity" word today, so `agentSetFor` returns `[]`.

Status agreement (same shape, characterization, passes on arrival — the duplication already
exists and is unpinned): title "Given the reviewer agent and the harness-read contract, when
each one's claim-status set is read, then both name the same non-empty set"; keys
`agentSetFor(sut, 'claim status')` against `contractSetFor(contract, 'status')`. The agent text
spans a line break ("claim status over\n  {…}"); `[^{]*` crosses it. Expected: GREEN at once;
its RED is proven in REFACTOR.

GREEN — in `agents/reviewer.md`, insert after l. 22 and before "- Final message:":

```markdown
- Rate each finding's severity over {CRITICAL, HIGH, MEDIUM, LOW}, written as that
  upper-case word.
```

Then `bash scripts/sync-adapter-agents.sh --write` (expect exactly the six craft-reviewer.md
mirrors to change; `git status --short` must show nothing else changed by the script) and
`bash scripts/sync-adapter-agents.sh --check` (exit 0). Re-run `node --test
test/p10-structure.test.js`: both new tests pass.

REFACTOR — hand mutation check, editing with the Edit tool and reverting with the Edit tool
(never `git checkout`/`git restore`): (1) drop `LOW` from the agent bullet → severity test
fails; (2) rename `HIGH` to `HIGHER` → fails; (3) drop `PROBE` from the agent's status set →
status test fails. Restore each edit, re-run `--write`/`--check` if a mirror was resynced
meanwhile, and confirm all green. No helper refactor is expected; the two helpers stay
module-private.

### Gate

```bash
cd /Users/scolladon/workspace/perso/craft-eval-sweep-followups && scratch=$(mktemp -d)
node --test test/p10-structure.test.js test/sync-adapter-agents.test.js test/source-hygiene.test.js test/plugin-evals-local-only.test.js > "$scratch/p2.txt" 2>&1; tail -n 12 "$scratch/p2.txt"
bash scripts/sync-adapter-agents.sh --check
for a in aider antigravity codex copilot cursor; do (cd "adapters/$a" && node --test test/native-surface.test.js > "$scratch/$a.txt" 2>&1; echo "$a exit=$?"); done
(cd adapters/opencode && node --test test/agents.test.js > "$scratch/opencode.txt" 2>&1; echo "opencode exit=$?")
bash scripts/ci.sh > "$scratch/ci.txt" 2>&1; echo "exit=$?"; tail -n 20 "$scratch/ci.txt"
```

### Commit

`fix(agents): name the severity scale in the reviewer contract`

Files: `agents/reviewer.md`, `test/p10-structure.test.js`, and the six
`adapters/<adapter>/agents/craft-reviewer.md` mirrors, added by explicit path. This commit is
C2, the tree Checkpoint B runs on.

## Checkpoint B — the sweep (orchestrator only, paid, needs user approval)

Not a part. Run on C2, same preconditions and per-run trace check as Checkpoint A.

| Step | Selector | Session / agent | Judge | Runs | Ceiling | Read |
|---|---|---|---|---|---|---|
| S5, per tier (haiku, sonnet, opus) | `--tag agent` | sonnet / that tier | `claude-sonnet-5-5` for opus and haiku, `claude-opus-5-5` for sonnet | 3 (default) | that tier's S1–S3 pilot top-level `costUsd` × 3 × 1.5 | per case with-arm mean and Δ; reviewer `findings-shape` passes of 3; `gitfail`/`left`; `claudeVersion`; `costUsd` |

- No second pilot: C2 adds one bullet to the reviewer prompt, a negligible cost change.
- If `claudeVersion` differs between S4 and S5 for a tier, the before/after carries a version
  note (hand it to Part 3).
- Show every grade to the user; record any rescoring the user decides, with its reason.
- Expected effect, stated before measuring: `findings-shape` passes in at least 2 of 3 runs per
  tier after C2; the haiku planner cell moves off the session floor, in either direction. A miss
  is recorded as a finding against the edit or the case (hand it to Part 3). Never retune a
  grader.
- Fill Part 3's hand-off block completely before spawning Part 3.

## Part 3 — Results: model-class matrix, maintainer-smokes costs and reviewer shape, BACKLOG closure

### Context

Files this part edits (three):

- `docs/guides/model-class-matrix.md` (86 lines): "## How to refresh" paragraph l. 8–12; the
  planner row l. 22 and structured-review row l. 24 of the tier table (header l. 20 unchanged:
  the columns keep their model ids); the italic note l. 28–43 (rewrite whole); the "*Last run:*"
  line l. 85–86. Rows part-TDD, blocker, full-pipeline-completion and the tokens table stay
  "— (not yet run)" / "—".
- `docs/contributing/maintainer-smokes.md` — two places only (Part 1 owns the rest of the
  sweep block): the `<ceiling>` bullet's cost sentence "Measured on 2026-10-07, pilot then
  sweep: opus USD 1.00 / 3.07, sonnet 0.56 / 1.61, haiku 0.53 / 1.49." and the end of the
  `--model` bullet (append the P2 finding); plus the "**Reviewer output shape.**" paragraph
  (l. 153–158 before Part 1; locate it by its bold lead).
- `BACKLOG.md` — under "### Open (scoped 2026-10-06 — follow-ups surfaced by the
  plugin-eval-suite run, not yet scheduled)" (l. 178): the three entries "**The reviewer agent
  carries no severity scale.**" (l. 215–220), "**haiku ends its turn after loading the planning
  skill.**" (l. 222–225) and "**A reviewer that loses git in the eval sandbox leaves it.**"
  (l. 227–231) collapse into one delivered entry in their place. House style precedent: the
  entry "**Fill the model-class matrix from the eval sweep — delivered 2026-10-07**" at l. 206.

Read-only references: the design doc § 6 (where results land) and § 7; ADRs 396, 398, 399,
401, 402; the aggregates named in the hand-off block (spot-check only).

**Hand-off block — the orchestrator passes it filled in the invocation; refuse (blocker
protocol) if any field is missing. Never compute, round differently or invent a value.**

| Key | Value per | Source |
|---|---|---|
| `sweepDate` | — | S5 date (YYYY-MM-DD) |
| `claudeVersion` | S1, S4 per tier, S5 per tier | aggregate top level |
| `p2` | — | S1 session and agent model ids seen (e.g. `claude-sonnet-5-5…` / `claude-haiku-4-5-20251001`) |
| `cell.planner`, `cell.review` | tier | S5 with-arm mean, 2 decimals |
| `delta.planner`, `delta.review` | tier | S5 Δ, signed, 2 decimals |
| `before.review` | tier | S4 with-arm mean + `findings-shape` passes n/3 |
| `after.review` | tier | S5 with-arm mean + `findings-shape` passes n/3 |
| `gitfail` | case × tier | S5 per-run min–max, with arm and bare arm |
| `left` | case × tier | S5 total, plus each run with `left>0` (case, arm, command) |
| `invalidTiers` | — | tiers whose agent events showed another model, or "none" |
| `cost.pilot` | tier | S1–S3 top-level `costUsd` |
| `cost.before` | tier | S4 `costUsd` |
| `cost.sweep` | tier | S5 `costUsd` |
| `cost.probe`, `cost.total` | — | P1 `costUsd`; sum of probe, pilots, before runs and sweep |
| `rescore` | — | user rescoring decisions with reasons, or "none" |
| `expectationMisses` | — | failed expectations (findings-shape < 2/3 at a tier, …), or "none" |
| `aggregates` | — | paths under ~/craft-eval-results/ |

Banding (ADR-390): PASS = 1.00, PARTIAL ≥ 0.50, FAIL < 0.50; cell format `PASS (1.00, eval)`.
A tier in `invalidTiers` gets `— (agent tier not reached)` in both eval cells.

### TDD steps

RED: none (docs only, no behaviour). Verification is the gate.

GREEN:

1. Matrix "How to refresh": append one sentence to the paragraph: "A column names the tier
   the craft agents run at; the session runs at opus or sonnet (a haiku session is not
   supported), and the haiku column routes the agents to haiku."
2. Matrix rows l. 22 and l. 24: band each `cell.*` value per tier.
3. Matrix note: rewrite l. 28–43 as one italic-led paragraph carrying, in this order:
   - "*Eval sweep, `sweepDate` (Claude Code `claudeVersion` of S5, 3 runs per arm).*" and the
     unchanged cell definition sentence ("Cell = with-craft mean of `planning-plan-lints`
     (planner) and `reviewer-tests-findings` (structured-review); "eval" marks a cell from the
     sweep, not the full pipeline.");
   - the column meaning: the session ran at sonnet in every column, the columns name the agent
     tier, the trace check showed agent events at each column's tier (or names `invalidTiers`);
     the opus and haiku columns are not comparable with 2026-10-07, whose session ran at the
     column tier;
   - the floor: craft does not support a haiku session (README FAQ); in the 2026-10-07 sweep a
     haiku session loaded `craft:planning` and ended its turn without spawning the planner, so
     haiku is measured as an agent tier only;
   - "Δ planner / review: opus … / …, sonnet … / …, haiku … / …." from `delta.*`;
   - reviewer severity scale before → after per tier: "with-arm (findings-shape passes of 3)",
     from `before.review` → `after.review`, plus a version note if S4 and S5 `claudeVersion`
     differ for a tier;
   - sandbox git: the reviewer case reads the range's diff the scaffold writes; `gitfail`
     ranges and `left` totals per case; name every run with `left>0`;
   - one sentence per `rescore` entry and per `expectationMisses` entry, if any;
   - unchanged closers: "Trigger, decisions and prune were not swept per tier. part-TDD,
     blocker and full-pipeline-completion need the full-pipeline run."
4. Matrix "*Last run:*" line: "*Last run:* `sweepDate` — eval sweep, planner and
   structured-review rows only, agent tier per column under a sonnet session (USD
   `cost.total` for the probe, pilots, before runs and sweep). The full-pipeline run has not
   been done yet."
5. maintainer-smokes `<ceiling>` bullet: replace the 2026-10-07 cost sentence with "Measured on
   `sweepDate` with the session at sonnet, pilot then sweep, per agent tier: opus USD … / …,
   sonnet … / …, haiku … / …." from `cost.pilot` / `cost.sweep`.
6. maintainer-smokes `--model` bullet: append "With the session at sonnet and the override at
   haiku (pilot of `sweepDate`, Claude Code `claudeVersion` of S1), agent events showed
   `claude-haiku-4-5`: FORCE follows the override, not the session." (only if `p2` shows a haiku
   agent id; otherwise the run stopped at Checkpoint A and this part does not exist).
7. maintainer-smokes "Reviewer output shape" becomes: "**Reviewer output shape.**
   `reviewer-tests-findings` spawns `craft:reviewer` directly, outside the review phase. The
   agent names the severity scale {CRITICAL, HIGH, MEDIUM, LOW} itself, and a structure test
   keeps that set equal to the review contract's; the per-line shape (`file:line`, suggested
   fix) still comes only from the phase. The `findings-shape` grader therefore stays lenient: a
   severity word, in any case, within 300 characters of a fixture file name, in either order. A
   finding about a missing test has no line to cite. Before the agent named the scale it wrote
   `HIGH` in one run and `Severity: high` in the next; after, `findings-shape` passed … of 3 at
   opus, … at sonnet and … at haiku." (from `after.review`).
8. BACKLOG: replace the three entries with one entry, house style:
   "**Eval-sweep follow-ups — delivered `sweepDate`** (fix/eval-sweep-followups).
   `agents/reviewer.md` names the severity scale {CRITICAL, HIGH, MEDIUM, LOW}, pinned equal to
   `contracts/harness-read.md` by a structure test; `reviewer-tests-findings` before → after per
   agent tier (with-arm, `findings-shape` of 3): opus …, sonnet …, haiku …. A haiku session is
   not supported (README FAQ); the eval sweep holds the session at sonnet and the matrix
   columns name the agent tier. Sandbox git: `PATH` cannot route the eval child to a working
   git, so the reviewer case's scaffold writes the range's diff to `../.git/review-range.diff`;
   `left` … in every reviewer-case run. USD `cost.total` for the probe, pilots, before runs and
   sweep." For each `expectationMisses` entry, add one open entry in the same section stating
   the miss and its measured numbers.

REFACTOR: every number in the three files traces to one hand-off key; no sentence still says the
reviewer gets no severity scale outside the phase or that a haiku session is measured; spot-check
one cell and one `findings-shape` count against its aggregate with the jq reads in Checkpoint A.

### Gate

```bash
cd /Users/scolladon/workspace/perso/craft-eval-sweep-followups && scratch=$(mktemp -d)
node --test test/plugin-evals-local-only.test.js test/docs-structure-lint.test.js test/backlog-lint.test.js test/living-corpus.test.js > "$scratch/p3.txt" 2>&1; tail -n 12 "$scratch/p3.txt"
bash scripts/backlog-lint.sh BACKLOG.md
bash scripts/docs-structure-lint.sh docs/guides && bash scripts/docs-structure-lint.sh --audience docs
bash scripts/ci.sh > "$scratch/ci.txt" 2>&1; echo "exit=$?"; tail -n 20 "$scratch/ci.txt"
```

### Commit

`docs: record the agent-tier eval sweep in the model-class matrix`

Files: `docs/guides/model-class-matrix.md`, `docs/contributing/maintainer-smokes.md`,
`BACKLOG.md`.
