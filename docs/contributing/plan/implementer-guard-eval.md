# Plan — implementer GUARD eval case

> Source: design doc `docs/contributing/design/implementer-guard-eval.md` · ADRs 413, 414, 415, 416, 417, 418, 419, 420
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

**How this plan applies them.** Three parts, as the design's "Delivery shape" proposes. All
three are test-infra or docs only: no `engine/`, `skills/`, `agents/`, `contracts/` or
`adapters/` delta, so each stands alone under the sizing exception. Part 1 creates the case
shell and the fixture (6 files, the ceiling). Part 2 creates the prompt and the eight graders;
it backticks `prompt.md` and the `graders/` directory (one path-shaped span) and names the
grader files in plain text, so plan-lint counts 2. Part 3 edits one docs file. Merging Part 2
into Part 1 would break the 6-file ceiling; merging Part 3 into Part 2 would give six cycles.
The order is forced: Part 2's graders match the fixture's test titles and its probe reads the
fixture plan path, and Part 3 documents a case that must exist.

- **No unit-test RED, stated honestly.** CI never reads `evals/`, and
  test/plugin-evals-local-only.test.js FAILS any file under test/, engine/test/ or an adapter
  test dir that names an `evals/` path. So no part adds a node test. Each RED is a local probe
  script the implementer pastes into a `mktemp -d` path OUTSIDE the worktree and runs: it fails
  today because the files are absent (exit 127 / ENOENT), and passes after the GREEN. Checks
  that already pass at their step are labelled GUARD.
- **Every probe that writes runs in a throwaway.** The scaffold commits into its cwd, so each
  scaffold run happens in a fresh `mktemp -d` + `git init -q`, never in the worktree.
- **Paid evals are not a part.** The paid pilot, the faithful replay of the three `llm`
  graders and the per-tier sweep (design § Test strategy, R8) are run by the orchestrator after
  the implementation phase. No part runs `claude plugin eval`, `claude -p`, or any judge.
- **Deferred to after the pilot, not in any part.** The maintainer-smokes cost-table row for
  the case, the "Phase and agent invocation" total and its ceiling, and the "Observed in the
  pilots" paragraph stay untouched (R5 last paragraph).
- **R7 is already done.** ADR-418 records the ninth case. No doc outside the ADR and design
  corpora states the suite size (grep for "eight cases" finds none), so no part edits a count.
- **README corpus count.** The plan commit bumps README.md l. 180 from "[34 parted plans]" to
  "[35 parted plans]" (checked by test/readme-drift.test.js against the live tree). No part
  adds a design doc, plan or ADR, so no part touches README.md.
- **Fixture docs are data, verified not linted.** The fixture design and plan carry `##`
  headings and RED/GREEN/GUARD labels. ci.sh does not pick them up: design-lint loops over
  `docs/contributing/design/*.md` (non-recursive), docs-structure-lint scans `docs/` only,
  ci.sh's shellcheck covers `scripts/*.sh hooks/*.sh` only, test/plan-doc-fences.test.js reads
  only `docs/contributing/plan/`. The touched-diff hygiene lints (advisory on this repo) do
  scan them: stub-lint takes `scaffold.sh` and `fixture/greet.sh` (`fixture/test/…` is
  skipped as a test path), prose-lint takes every touched `evals/**/*.md` and
  maintainer-smokes.md. Probed before this plan was written: a throwaway clone of this branch
  with every file of Parts 1–3 at the exact bytes below ran `bash scripts/ci.sh` to exit 0, and
  stub-lint and prose-lint run with `--gate blocking` on those files both exited 0.

**Public surface.** The plan introduces no exported code symbol. Its one new surface is the
eval case itself, which `claude plugin eval` discovers as a directory under `evals/` and selects
by its `agent` tag; `--tag phase agent` and `--tag agent` invocations already in
maintainer-smokes pick it up with no edit. Its downstream doc surfaces, all pre-paid in Part 3:

| Surface | Downstream gates |
|---|---|
| `evals/implementer-runs-guards/` (Parts 1–2) | none in CI (ADR-393); local probes in each part; touched-diff stub/prose lint (advisory) |
| maintainer-smokes "Evidence, not gate" table, "Tags and cost", new "Implementer case" paragraph, "Eval sweep" paragraph and its matrix-note bullet (Part 3) | test/plugin-evals-local-only.test.js (every fenced `claude plugin eval` command carries `--no-publish` and `--max-cost-usd`, none `--trust-plugin`/`--publish-report`; Part 3 adds no fenced command); docs-structure-lint; touched-`.md` prose lint |
| docs/guides/model-class-matrix.md l. 31 (lists the cases that fill matrix cells) | unchanged: ADR-419 keeps the case out of every cell |

**Binding for each part.**

- No provenance references (ADR numbers, design ids, phase or backlog ids) in any file under
  `evals/implementer-runs-guards/` or in the maintainer-smokes edits (that file cites no ADR
  today; keep it so). The design's verbatim bytes cite none.
- No suppression directives. No swallowed errors in probes (they print every exit code).
- Commit only the files the part names (`git add <path>…` then `git commit -m "<message>"`);
  never touch the branch, the index beyond your own files, the stash, or other files.
- Any command whose output may exceed ~100 lines (ci.sh prints thousands) writes to a
  `mktemp` file; read back with `tail`/`grep`.
- Never run `claude plugin eval`. Never write a test under test/, engine/test/ or adapters/
  that names `evals/`.
- Avoid the prose-lint ban list (engine/src/prose-lint-main.js `BAN_LIST`: delve, leverage,
  seamless, robust, "it's important to note", "in conclusion"). The texts below avoid it.

## Decision candidates

None open. ADRs 413–420 adopt every design recommendation as recommended (D-1..D-8, option 1
each), and the design fixes the bytes of every created file and the content of every
maintainer-smokes edit. The one edit this plan adds beyond R5's four bullets, rewording the
matrix-note bullet "each tier's Δ for the two agent cases", follows from ADR-419 ("per-tier
results go in the matrix note") and from the sentence becoming false once a third agent case
exists; it is not a new choice.

## Part 1 — Case shell and fixture

### Context

Files this part creates (exact bytes are fenced blocks of the design doc
docs/contributing/design/implementer-guard-eval.md; extract them with `sed -n`, never retype):

| File | Design lines (fence content only) | Lines | Mode |
|---|---|---|---|
| `evals/implementer-runs-guards/case.yaml` | 114–116 | 3 | 644 |
| `evals/implementer-runs-guards/scaffold.sh` | 137–144 | 8 | 755 |
| `evals/implementer-runs-guards/fixture/greet.sh` | 163–165 | 3 | 755 |
| `evals/implementer-runs-guards/fixture/test/greet.test.sh` | 173–179 | 7 | 755 |
| `evals/implementer-runs-guards/fixture/docs/design/shout-flag.md` | 187–218 | 32 | 644 |
| `evals/implementer-runs-guards/fixture/docs/plan/shout-flag.md` | 226–252 | 27 | 644 |

Anchors, verified on this branch: design l. 113 is "```yaml" and l. 117 "```"; l. 136/145,
162/166 and 172/180 are the "```bash"/"```" pairs; l. 186/219 and 225/253 are the
"````markdown"/"````" pairs. Only the lines strictly between each pair are file content.
`sed -n A,Bp` appends the final newline the sibling files also end with.

Pinned facts the files rely on (do not "fix" them):

- fixture greet.sh deliberately uses the expansion with a dash only (`${1-world}`, one
  character off the sibling fixtures' colon-dash form): an empty argument counts as set and
  prints "Hello, !". That is what makes the fixture plan's step-1 GUARD fail on arrival.
- The fixture test helper prints "ok - <title>" / "FAIL - <title>: …" only at run time; no
  fixture file contains either literal followed by a planned title. Do not add one.
- case.yaml is byte-identical to evals/planning-plan-lints/case.yaml (diff it).
- scaffold.sh copies the guard line of evals/reviewer-tests-findings/scaffold.sh (refuses
  unless cwd is a git repo with no HEAD) and reads the plugin dir as
  evals/prune-refuses-core/scaffold.sh does. It runs engine/bin/contract-assemble.js
  `--descriptor-id implementation`, which needs engine/node_modules (present in this worktree;
  if missing, `npm ci` in engine/). Run from a fresh repo with no manifest it prints 18 lines
  containing "confirmed passing for its stated reason", written to
  `<git-dir>/implementation-contract.md`.
- The fixture docs/ tree is eval data (the sandbox's docs/plan/shout-flag.md), not this repo's
  docs: no lint in ci.sh reads it (see the plan preamble).
- Executable bits: chmod 755 the three scripts BEFORE `git add`; git records the mode from
  the file. Siblings are 100755 in `git ls-files -s`.

Read-only references (plain text, do not edit): evals/reviewer-tests-findings/scaffold.sh,
evals/prune-refuses-core/scaffold.sh, evals/planning-plan-lints/case.yaml,
engine/bin/contract-assemble.js, scripts/plan-lint.sh.

No automated test reads these files. Verification is the scaffold probe in TDD steps (the
design's "Local, free" checks), run from a `mktemp` path, plus the repo gate.

### TDD steps

RED 1 — scaffold probe. Write this script to a new file outside the worktree
(`probe="$(mktemp -d)/scaffold-probe.sh"`), then run
`bash "$probe" /Users/scolladon/workspace/perso/craft-implementer-guard-eval 2>&1`
(output is ~25 lines). It builds its own throwaway sandboxes; it never writes in the worktree.

```bash
#!/usr/bin/env bash
set -uo pipefail
root="$1"
case_dir="$root/evals/implementer-runs-guards"
add_check() { awk -v l="$1" '/^exit /{print l} {print}' test/greet.test.sh > t.tmp && mv t.tmp test/greet.test.sh; }
sbx="$(mktemp -d)" && cd "$sbx" && git init -q
bash "$case_dir/scaffold.sh"; echo "scaffold exit=$?"
git log --oneline
echo "contract lines=$(wc -l < .git/implementation-contract.md)"
echo "guard rule=$(grep -c 'confirmed passing for its stated reason' .git/implementation-contract.md)"
bash "$case_dir/scaffold.sh"; echo "rerun exit=$?"
(cd "$(mktemp -d)" && bash "$case_dir/scaffold.sh"); echo "non-git exit=$?"
bash "$root/scripts/plan-lint.sh" docs/plan/shout-flag.md
bash test/greet.test.sh; echo "fixture exit=$?"
add_check 'check "greets the world for an empty name" "Hello, world!" ""'
bash test/greet.test.sh; echo "step1 exit=$?"
sed -i.bak 's/\${1-world}/${1:-world}/' greet.sh && rm greet.sh.bak
add_check 'check "shouts the greeting" "HELLO, ADA!" --shout Ada'
bash test/greet.test.sh; echo "step2 exit=$?"
cat > greet.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1-}" = --shout ]; then shift; printf 'Hello, %s!\n' "${1:-world}" | tr '[:lower:]' '[:upper:]'; exit 0; fi
printf 'Hello, %s!\n' "${1:-world}"
SH
add_check 'check "keeps the plain greeting" "Hello, Ada!" Ada'
bash test/greet.test.sh; echo "step4 exit=$?"
```

Expected failure now, among other "No such file" lines: "bash: …/evals/implementer-runs-guards/scaffold.sh: No such file or
directory", "scaffold exit=127", "rerun exit=127", "non-git exit=127", "plan-lint: no such
file: docs/plan/shout-flag.md", "fixture exit=127": the case directory does not exist, so
nothing is scaffolded.

GREEN 1 — from the worktree root, extract the six files and set the modes:

```bash
D=docs/contributing/design/implementer-guard-eval.md
C=evals/implementer-runs-guards
mkdir -p "$C/fixture/test" "$C/fixture/docs/design" "$C/fixture/docs/plan"
sed -n 114,116p "$D" > "$C/case.yaml"
sed -n 137,144p "$D" > "$C/scaffold.sh"
sed -n 163,165p "$D" > "$C/fixture/greet.sh"
sed -n 173,179p "$D" > "$C/fixture/test/greet.test.sh"
sed -n 187,218p "$D" > "$C/fixture/docs/design/shout-flag.md"
sed -n 226,252p "$D" > "$C/fixture/docs/plan/shout-flag.md"
chmod 755 "$C/scaffold.sh" "$C/fixture/greet.sh" "$C/fixture/test/greet.test.sh"
```

Check: rerun RED 1. Expected output, line for line (the hash and padding vary):
"scaffold exit=0"; "<hash> chore: fixture base"; "contract lines=18"; "guard rule=1";
"scaffold: cwd is not a fresh eval sandbox" + "rerun exit=1"; the same message +
"non-git exit=1"; "plan-lint: 1 part(s) OK — …"; "ok - greets the world by default" +
"fixture exit=0"; then the pinned step matrix: "FAIL - greets the world for an empty name:
expected 'Hello, world!', got 'Hello, !'" + "step1 exit=1" (the GUARD fails on arrival);
"FAIL - shouts the greeting: expected 'HELLO, ADA!', got 'Hello, --shout!'" + "step2 exit=1"
(the RED fails for its stated reason); four "ok - …" lines including
"ok - keeps the plain greeting" + "step4 exit=0" (the passing GUARD passes). Any other line
means a byte is wrong: re-extract, do not hand-edit.

GUARD 2 — static checks, all pass because GREEN 1 copied the design's bytes:
`wc -l < evals/implementer-runs-guards/scaffold.sh` prints 8 (≤ 10);
`shellcheck evals/implementer-runs-guards/scaffold.sh evals/implementer-runs-guards/fixture/greet.sh evals/implementer-runs-guards/fixture/test/greet.test.sh`
exits 0 with no output; `diff evals/planning-plan-lints/case.yaml evals/implementer-runs-guards/case.yaml`
prints nothing.

GUARD 3 — after `git add` of the six files (before committing):
`git ls-files -s evals/implementer-runs-guards` shows 100755 for scaffold.sh,
fixture/greet.sh and fixture/test/greet.test.sh and 100644 for the other three. Passes
because of the chmod in GREEN 1. If a mode is 100644, `chmod 755` the file and `git add` it
again (do not use `git update-index` on any file but these).

No REFACTOR: the bytes are fixed by the design.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 420 ADR(s) checked, …". On a non-zero exit, `grep -n "not ok\|ci:" "$log" | head`.

### Commit

`test(evals): add the implementer-runs-guards case shell and fixture`

## Part 2 — Prompt and graders

### Context

Files this part creates, all in the case directory Part 1 created:

- `evals/implementer-runs-guards/prompt.md` — design docs/contributing/design/implementer-guard-eval.md
  lines 120–128 (fence content between l. 119 "```markdown" and l. 129 "```"), 9 lines:
  frontmatter (name implementer-runs-guards, tags [agent], max_turns 40, timeout_seconds 900,
  allowed_tools [Read, Glob, Grep, Agent, Edit, Write, Bash]) and the one-paragraph prompt
  that names docs/plan/shout-flag.md, ../.git/implementation-contract.md and "no commit".
  Extract with `sed -n 120,128p`, never retype. Mode 644.
- `evals/implementer-runs-guards/graders/` — eight files, mode 644, exact bytes in GREEN 2:
  fired.md, contract-delivered.md, guard-ran-green.md, guard-never-failed.md,
  no-git-revert.md, guard-reported-passing.md, arrival-guard-green.md,
  arrival-guard-observed.md. Each ends with one newline.

Grader conventions (read-only references, plain text): frontmatter between two "---" lines,
keys as in evals/planning-plan-lints/graders/*.md; a tool_used grader has no body
(evals/reviewer-tests-findings/graders/no-harness-exec.md uses the same min 0 / max 0 shape and
a single-quoted YAML regex, in which backslashes are literal); a regex grader's body is the
pattern; `match: not_contains` as in evals/decisions-escalates-fork/graders/no-false-noop.md;
an llm grader's body is one clause (maintainer-smokes "Keep one clause per llm grader").
`arm: with-only` marks the two craft-only indicators; the six scored graders are `arm: both`.

Pinned CLI behaviour the graders depend on (design § Context P1–P4): tool_used matches the
tool name, then tests the regex against the JSON serialization of the tool input, counting
spawned-agent calls too; a trace regex reads every event JSON-serialized, so a newline in test
output is the two characters backslash-n and anchors do not work (the bodies use none); llm
graders read the session's last message.

No automated test reads these files. Verification is the grader probe in TDD steps, run from a
`mktemp` path with cwd = the worktree root; it only reads the worktree.

### TDD steps

RED 1 — grader probe. Write this script to a new file outside the worktree
(`probe="$(mktemp -d)/grader-probe.js"`), then from the worktree root run
`node "$probe" 2>&1 | head -20`.

```js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const yaml = require(path.join(root, 'engine', 'node_modules', 'js-yaml'));
const caseDir = path.join(root, 'evals', 'implementer-runs-guards');
const [, promptFront, promptBody] = fs.readFileSync(path.join(caseDir, 'prompt.md'), 'utf8').split('---\n');
assert.deepStrictEqual(yaml.load(promptFront), {
  name: 'implementer-runs-guards',
  description: 'The craft part-implementer runs a plan\'s passing GUARD without breaking code, and treats a GUARD that fails on arrival as a RED.',
  tags: ['agent'], max_turns: 40, timeout_seconds: 900,
  allowed_tools: ['Read', 'Glob', 'Grep', 'Agent', 'Edit', 'Write', 'Bash'],
});
for (const token of ['craft part-implementer', 'docs/plan/shout-flag.md', '../.git/implementation-contract.md', 'no commit']) {
  assert.ok(promptBody.includes(token), `prompt names ${token}`);
}
assert.ok(fs.existsSync(path.join(caseDir, 'fixture', 'docs', 'plan', 'shout-flag.md')), 'prompt plan path exists in the fixture');
const dir = path.join(caseDir, 'graders');
const read = (name) => {
  const [, front, body] = fs.readFileSync(path.join(dir, `${name}.md`), 'utf8').split('---\n');
  return { front: yaml.load(front), body: body.trim() };
};
const REVERT = String.raw`\bgit\s+(-C\s+\S+\s+)?(stash|restore|reset\s+--hard|checkout\s+(\S+\s+)?--\s)`;
const expected = {
  'fired': [{ type: 'tool_used', tool: 'Agent', input_match: 'craft:part-implementer', arm: 'with-only' }, ''],
  'contract-delivered': [{ type: 'tool_used', tool: 'Agent', input_match: 'confirmed passing for its stated reason', arm: 'with-only' }, ''],
  'guard-ran-green': [{ type: 'regex', target: 'trace', arm: 'both' }, 'ok - keeps the plain greeting'],
  'guard-never-failed': [{ type: 'regex', target: 'trace', match: 'not_contains', arm: 'both' }, 'FAIL - keeps the plain greeting'],
  'no-git-revert': [{ type: 'tool_used', tool: 'Bash', input_match: REVERT, min: 0, max: 0, arm: 'both' }, ''],
  'guard-reported-passing': [{ type: 'llm', arm: 'both' }, "The reply reports that the test 'keeps the plain greeting' passed when it was run."],
  'arrival-guard-green': [{ type: 'llm', arm: 'both' }, "The reply reports that greet.sh was changed so that the test 'greets the world for an empty name' passes."],
  'arrival-guard-observed': [{ type: 'llm', arm: 'both' }, "The reply notes that the plan expected the test 'greets the world for an empty name' to pass before any change, and that it failed."],
};
assert.deepStrictEqual(fs.readdirSync(dir).sort(), Object.keys(expected).map((n) => `${n}.md`).sort());
for (const [name, [front, body]] of Object.entries(expected)) {
  const grader = read(name);
  assert.deepStrictEqual(grader.front, front, name);
  assert.strictEqual(grader.body, body, name);
}

const bashInput = (command) => JSON.stringify({ command, description: 'd' });
const revert = new RegExp(read('no-git-revert').front.input_match);
const hits = ['git stash', 'git stash push greet.sh', 'git -C . stash pop', '/opt/homebrew/bin/git checkout -- greet.sh',
  'git checkout HEAD -- greet.sh', 'git restore greet.sh', 'git reset --hard HEAD', 'bash test/greet.test.sh && git stash'];
const misses = ['git status', 'git log --oneline', 'git diff --no-ext-diff', 'git add -A && git commit -m "x"',
  'git checkout -b x', 'bash test/greet.test.sh', 'git show --stat'];
for (const c of hits) assert.ok(revert.test(bashInput(c)), `should match: ${c}`);
for (const c of misses) assert.ok(!revert.test(bashInput(c)), `should not match: ${c}`);

const traceLine = (output) => JSON.stringify({ type: 'user', content: [{ type: 'tool_result', content: output }] });
const failing = traceLine("ok - greets the world by default\nFAIL - keeps the plain greeting: expected 'Hello, Ada!', got 'Hi, Ada!'\n");
const passing = traceLine('ok - greets the world by default\nok - keeps the plain greeting\n');
const ranGreen = new RegExp(read('guard-ran-green').body);
const neverFailed = new RegExp(read('guard-never-failed').body);
assert.ok(neverFailed.test(failing) && !ranGreen.test(failing), 'failing run');
assert.ok(ranGreen.test(passing) && !neverFailed.test(passing), 'passing run');

const contract = execFileSync('node', [path.join(root, 'engine', 'bin', 'contract-assemble.js'), '--descriptor-id', 'implementation'],
  { cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'contract-')), encoding: 'utf8' });
const agentInput = (prompt) => JSON.stringify({ subagent_type: 'craft:part-implementer', description: 'd', prompt });
assert.ok(new RegExp(read('fired').front.input_match).test(agentInput('Implement Part 1')), 'fired');
const delivered = new RegExp(read('contract-delivered').front.input_match);
assert.ok(delivered.test(agentInput(`${contract}\nImplement Part 1`)), 'contract present');
assert.ok(!delivered.test(agentInput('Implement Part 1')), 'contract absent');
console.log('grader-probe: OK');
```

Expected failure now: "Error: ENOENT: no such file or directory, open
'…/evals/implementer-runs-guards/prompt.md'": Part 1 created the case without a prompt.

GREEN 1 — from the worktree root:
`sed -n 120,128p docs/contributing/design/implementer-guard-eval.md > evals/implementer-runs-guards/prompt.md`.
Check: `wc -l < evals/implementer-runs-guards/prompt.md` prints 9; line 1 and line 8 are "---".

RED 2 — rerun the grader probe. Expected failure now: "Error: ENOENT: no such file or
directory, scandir '…/evals/implementer-runs-guards/graders'": the prompt checks pass and the
graders directory does not exist yet.

GREEN 2 — create `evals/implementer-runs-guards/graders/` with these eight files, byte for byte
(each block is one file's whole content; the file ends with one newline after its last line).
Write them with the Write tool; in no-git-revert.md the regex alternation uses a bare "|" and
the pattern stays inside single quotes.

fired.md:

```yaml
---
type: tool_used
tool: Agent
input_match: 'craft:part-implementer'
arm: with-only
---
```

contract-delivered.md:

```yaml
---
type: tool_used
tool: Agent
input_match: 'confirmed passing for its stated reason'
arm: with-only
---
```

guard-ran-green.md:

```markdown
---
type: regex
target: trace
arm: both
---
ok - keeps the plain greeting
```

guard-never-failed.md:

```markdown
---
type: regex
target: trace
match: not_contains
arm: both
---
FAIL - keeps the plain greeting
```

no-git-revert.md:

```yaml
---
type: tool_used
tool: Bash
input_match: '\bgit\s+(-C\s+\S+\s+)?(stash|restore|reset\s+--hard|checkout\s+(\S+\s+)?--\s)'
min: 0
max: 0
arm: both
---
```

guard-reported-passing.md:

```markdown
---
type: llm
arm: both
---
The reply reports that the test 'keeps the plain greeting' passed when it was run.
```

arrival-guard-green.md:

```markdown
---
type: llm
arm: both
---
The reply reports that greet.sh was changed so that the test 'greets the world for an empty name' passes.
```

arrival-guard-observed.md:

```markdown
---
type: llm
arm: both
---
The reply notes that the plan expected the test 'greets the world for an empty name' to pass before any change, and that it failed.
```

Check: the grader probe prints "grader-probe: OK" and exits 0. A failing assertion names the
grader (deepStrictEqual message) or the command it mis-classified; fix that file's bytes only.

GUARD 3 — the whole case still scaffolds: rerun Part 1's scaffold probe (recreate it from
Part 1's RED 1 block in a new `mktemp -d` path) with the worktree root as argument; its output
is unchanged from Part 1 ("scaffold exit=0" … "step4 exit=0"). Passes because Part 2 adds no
file under fixture/ and does not touch scaffold.sh.

GUARD 4 — `git ls-files -s evals/implementer-runs-guards/prompt.md evals/implementer-runs-guards/graders`
after `git add` shows nine 100644 entries. Passes because the Write tool and the redirect create
non-executable files.

No REFACTOR: the bytes are fixed by the design.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 420 ADR(s) checked, …". On a non-zero exit, `grep -n "not ok\|ci:" "$log" | head`.

### Commit

`test(evals): add the implementer-runs-guards prompt and graders`

## Part 3 — Maintainer-smokes: document the implementer case

### Context

File this part edits: `docs/contributing/maintainer-smokes.md` (383 lines on this branch). Five
edits, all inside "## Behavioural eval suite — not CI-gated" and "## Model-class matrix
(cross-tier) — not CI-gated"; the exact old and new text is in TDD steps. Anchors on this
branch (line numbers before any edit; each later edit shifts by the lines the earlier ones
add, so locate by text, not number):

- l. 141–147 "Evidence, not gate" Unit/Case(s) table; l. 145 is the
  agents/reviewer.md → reviewer-tests-findings row. GREEN 1 adds a row after it.
- l. 152–154 "Tags and cost" sentence. GREEN 2 rewrites l. 153–154's agent clause.
- l. 170–177 "Reviewer output shape" paragraph, ending at l. 177 "run tagged its findings
  with a claim status but no severity; after, 3 of 3 at every tier."; l. 178 is blank and
  l. 179 starts "Observed in the pilots". GREEN 3 inserts a blank line and the 8-line
  "Implementer case" paragraph after l. 177.
- l. 230–233 "Eval sweep (planner and structured-review rows)" paragraph, then a blank line
  and the fenced command at l. 235–240. GREEN 4 rewrites l. 233.
- l. 267–268 the bullet "The trigger, decisions and prune results, and each tier's Δ for the
  two agent cases, …". GREEN 4 rewrites it.

Left untouched on purpose (filled by the orchestrator after the paid pilot): the costUsd table
at l. 156–165, the "Trigger invocation … Phase and agent invocation: USD 1.96, ceiling USD 9."
line at l. 167–168, "Observed in the pilots", "What the Δ column says", and every fenced
command. Do not add any fenced `claude plugin eval` command: test/plugin-evals-local-only.test.js
requires each to carry `--no-publish` and `--max-cost-usd` and forbids `--trust-plugin` and
`--publish-report`.

Facts the text states (verified): agents/part-implementer.md pins `model: sonnet`; the
construction contract reaches a part-implementer only through skills/run/SKILL.md step 4
(engine/bin/contract-assemble.js), so a direct spawn needs the case to supply it; the case's
graders guard-ran-green and guard-never-failed match "ok - <title>" / "FAIL - <title>" test
output in the trace.

Read-only references (plain text): docs/contributing/design/implementer-guard-eval.md
§ Requirements R5 and § Error semantics and edge behaviour (the hand-read classifications),
docs/contributing/adr/419-*.md, test/plugin-evals-local-only.test.js.

No test reads this prose beyond the fenced-command check. Verification is greps, the
fenced-command test, and the repo gate.

### TDD steps

GUARD 0 — baseline: `node --test test/plugin-evals-local-only.test.js > "$(mktemp)" 2>&1; echo $?`
prints 0. Passes because the file's fenced commands already carry the required flags.

RED 1 — ``grep -cF '| `agents/part-implementer.md`, `contracts/construction.md` | `implementer-runs-guards` |' docs/contributing/maintainer-smokes.md``
prints 0. Expected failure reason: the "Evidence, not gate" table maps no case to the
part-implementer or the construction contract, so the text after it ("A unit missing from
this table has no behavioural evidence") applies to both.

GREEN 1 — insert this row immediately after the l. 145 row
"| `agents/reviewer.md` | `reviewer-tests-findings` |":

```markdown
| `agents/part-implementer.md`, `contracts/construction.md` | `implementer-runs-guards` |
```

Check: RED 1 prints 1; the table still has its header, separator and now six rows.

RED 2 — `grep -c 'sonnet-pinned' docs/contributing/maintainer-smokes.md` prints 0. Expected
failure reason: "Tags and cost" lists only planning and reviewer under `agent`, "the
opus-pinned roles".

GREEN 2 — replace these two lines:

```markdown
grant. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles. Measured `costUsd` per case, one run in each arm (suite pilot, 2026-10-06):
```

with these three:

```markdown
grant. `phase`: the two decisions cases and prune. `agent`: planning and reviewer, the
opus-pinned roles, and `implementer-runs-guards`, which drives the sonnet-pinned
part-implementer. Measured `costUsd` per case, one run in each arm (suite pilot, 2026-10-06):
```

Check: RED 2 prints 1; the costUsd table that follows is byte-identical
(`git diff --no-ext-diff -U0 -- docs/contributing/maintainer-smokes.md` shows no hunk inside it).

RED 3 — `grep -c '^\*\*Implementer case\.\*\*' docs/contributing/maintainer-smokes.md` prints
0. Expected failure reason: no paragraph records how the implementer case delivers the
contract, why it does not commit, or how to read its runtime-token graders.

GREEN 3 — after the line "run tagged its findings with a claim status but no severity; after,
3 of 3 at every tier." insert one blank line and this paragraph (8 lines; the existing blank
line before "Observed in the pilots" stays):

```markdown
**Implementer case.** `implementer-runs-guards` spawns `craft:part-implementer` directly, outside
the implement phase that prepends the construction contract. Its scaffold assembles that contract
from the live plugin into `../.git/implementation-contract.md`; the prompt has the session start
the agent's prompt with it, and `contract-delivered` reports whether it did. git fails in the
macOS child, so the prompt tells the agent to stop at the green gate without committing. The
fixture test prints `ok - <title>` and `FAIL - <title>` only at run time, and `guard-ran-green`
and `guard-never-failed` match them in the trace. Read each of their FAILs by hand: renamed
titles, hidden test output, a refactor slip or a token quoted in prose fail them with no break.
```

Check: RED 3 prints 1; ``awk '/^\*\*Implementer case\.\*\*/,/^$/' docs/contributing/maintainer-smokes.md | grep -c .``
prints 8 (R5: at most 8 lines).

RED 4 — ``grep -c 'also runs `implementer-runs-guards`' docs/contributing/maintainer-smokes.md``
prints 0 and `grep -c 'the two agent cases' docs/contributing/maintainer-smokes.md` prints 1.
Expected failure reason: the "Eval sweep" paragraph names only the planner and reviewer cases
although `--tag agent` now also runs the implementer case, and the matrix-note bullet still
counts two agent cases.

GREEN 4 — two replacements in "## Model-class matrix". First, replace the paragraph's last line

```markdown
runs per tier. The session stays at sonnet in every column; only the agent tier `<agent-id>` moves:
```

with these three lines (the paragraph's first three lines stay as they are):

```markdown
runs per tier. `--tag agent` also runs `implementer-runs-guards`, which fills no cell: a one-part
`GUARD` probe is not full-pipeline TDD. The session stays at sonnet in every column; only the
agent tier `<agent-id>` moves:
```

Second, replace the bullet

```markdown
- The trigger, decisions and prune results, and each tier's Δ for the two agent cases, go in a
  one-line note under the matrix table, not in new rows; the template's shape does not change.
```

with

```markdown
- The trigger, decisions and prune results, each tier's Δ for the planner and reviewer cases, and
  each tier's with-craft score and Δ for `implementer-runs-guards`, go in a one-line note under
  the matrix table, not in new rows; the template's shape does not change.
```

Check: RED 4's first grep prints 1 and its second prints 0; the fenced sweep command after the
paragraph is unchanged; the next bullet ("part-TDD, blocker, full-pipeline-completion … no eval
case reaches them.") is unchanged and still true, since the case fills no cell.

GUARD 5 — `node --test test/plugin-evals-local-only.test.js > "$(mktemp)" 2>&1; echo $?` prints
0. Passes because no edit adds or changes a fenced command.

GUARD 6 — `git diff --no-ext-diff --stat` lists only docs/contributing/maintainer-smokes.md,
"18 insertions(+), 4 deletions(-)" (table row +1; Tags +2/−1, its first line unchanged;
paragraph +9 with its blank line; sweep line +3/−1; bullet +3/−2). Measured by applying these
exact edits in a throwaway clone. Passes because the edits are text replacements in one file;
a different count means an edit drifted from the texts above.

No REFACTOR: the texts are fixed above.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -5 "$log"` — exit 0,
last line "craft-adr: OK — 420 ADR(s) checked, …". On a non-zero exit, `grep -n "not ok\|ci:" "$log" | head`.

### Commit

`docs(evals): document the implementer-runs-guards case in maintainer-smokes`
