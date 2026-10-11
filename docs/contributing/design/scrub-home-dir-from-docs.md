# Design — scrub-home-dir-from-docs

> Brief: committed docs embed absolute home-directory paths that leak the maintainer's OS
> username and toolchain layout. Scrub the existing files and fix the source, in line with
> the memory store's existing rule that `findings.file` is repo-relative.
> Status: draft → self-reviewed ×3

## Context

**The leak, measured on `main` @ `f6de546`.** Two shapes, both carrying the real username:

- slash form: `/Users/<name>/…`
- dashed form: `-Users-<name>-…`. This is the Claude projects-dir encoding of a cwd, e.g.
  `~/.claude/projects/-Users-<name>-<dev-root>-craft`. The backlog entry does not
  mention this form, but it leaks the same username.

The combined count is **83 lines in 31 tracked files**:

| Tree | Files | Lines | Shape |
|---|---|---|---|
| `docs/contributing/plan/` | 19 | 63 | `- **Working directory**: \`/Users/<name>/<dev-root>/craft-<slug>\``-style precondition lines (each plan words it differently: "Working tree:", "Worktree:", "scope: work only in …"). Also absolute `cd <worktree>/engine && node --test …` / `bash <worktree>/scripts/ci.sh` gate commands, and dashed projects-dir args (`usage-miner-subagent-transcripts.md:1388,1490`). The heaviest files are `native-codex-binding.md` (24) and `native-copilot-binding.md` (13). |
| `docs/contributing/design/` | 4 | 7 | Toolchain install paths `/Users/<name>/.n/bin/{pi,node}` (`harness-hygiene-followups.md:283`, `native-pi-binding.md:87`). Dashed projects dirs (`usage-miner-subagent-transcripts.md:198-200,243`, `usage-telemetry-miner.md:98`). |
| `docs/contributing/archive/` | 4 | 7 | `DESIGN-P22…:63` (`git check-ignore` output naming `/Users/<name>/.gitignore`), `PLAN-P14…:147`, `PLAN-P15…:175,182,274`, `PLAN-P3…:32,314`. |
| `docs/contributing/adr/` | 1 | 2 | `035-repo-dir-and-out-of-repo-refs.md:10,24`: the forge→craft dev-dir rename, written as two absolute paths. |
| `docs/contributing/specs/` | 1 | 1 | `codex-poc-record.md:21`: install path `/Users/<name>/.n/bin/codex`. |
| `engine/test/` | 2 | 3 | `usage-mine-main.test.js:1309,1311` (the `dashedCwd` input/expected pair). `fixtures/aider/real-session.md:4` (a real captured aider command line whose `--llm-history-file` sits under `/private/tmp/claude-501/-Users-<name>-…`). |

On its own, the bare username is **not** a leak. It is also the public GitHub handle:
`README.md:7,71-72`, `.github/CODEOWNERS:2`, `.claude-plugin/marketplace.json:2`,
`docs/guides/comparison.md:12`, `test/source-hygiene.test.js:43,176-177`, and ADR-035
`:30-33` (marketplace name). `git grep -w <username>` matches 95 lines, so a username-word
rule is unusable.

Legitimate home-shaped strings exist, and any guard must leave them alone. These are
synthetic fixture homes: `/Users/alice` ×6 (opencode/pi fixtures and telemetry tests),
`/Users/example`, `/Users/me`, `/Users/someone` ×2, `/Users/other-clone…`, `/home/user` ×2,
and `/Users/x` + `-Users-x-` (`engine/src/observability/usage-mine-main.js:157` comment,
`plan/usage-telemetry-miner.md:336`, `usage-mine-main.test.js:1320`). There are also
`<name>`-style placeholders (`BACKLOG.md:502`), a non-root `…/home/cwd` sandbox path
(`design/arriving-guard-part-bound.md:67`, `plan/arriving-guard-part-bound.md:501`), and an ADR
slug containing `-home-` (`design/native-copilot-binding.md:302`).

**Where new leaks come from.** No template asks for an absolute path, and `templates/plan.md`
has no working-directory line. The spawn briefs hand the agent its absolute working
directory, and the agent copies it into the artifact. The briefs:

- `agents/planner.md:9`, `agents/designer.md:9`, `agents/part-implementer.md:8-9`,
  `agents/requirements-writer.md:9`, `agents/docs-writer.md:9`, `agents/reviewer.md:9`,
  `agents/refactor-executor.md:9`. Each is mirrored into 6 `adapters/*/agents/craft-*.md`
  copies (aider, antigravity, codex, copilot, cursor, opencode), kept in sync by `scripts/sync-adapter-agents.sh --check`, which runs in
  `scripts/static-lints.sh`.
- `skills/planning/SKILL.md:28`, `skills/design/SKILL.md:24`, `skills/requirements/SKILL.md:20`.

The agents genuinely need the absolute path at runtime as their spawn cwd. The defect is
only in what gets written into committed files.

**Existing rule to align with.** `docs/contributing/specs/memory.md:175`: `findings.file` is
"repo-RELATIVE … never absolute — no `$HOME`/username". The same rule is restated in
`skills/review/SKILL.md:24-25` and `skills/run/SKILL.md:561-565` (memory save). No rule covers
design, plan, ADR, or spec docs.

**Contract injection.** `contracts/core.md` is the fragment the engine prepends to every role
spawn on every binding. Its invariants are pinned by `CORE_MARKERS` in
`engine/test-helpers/contract-markers.js` and asserted by
`engine/test/contract-equivalence.test.js:78`. Because it goes through engine assembly, it
reaches all 7 bindings with no adapter mirror to sync.
`engine/test/fixtures/contracts/core.md` is an independent, already-divergent fixture and is
not a mirror.

**Lint machinery.**

- `scripts/static-lints.sh` is hard-blocking and covers the whole corpus.
- `prose-lint` only checks touched files, is advisory, and skips
  `docs/contributing/{adr,design,archive,specs,prd,plan}/*` (`scripts/ci.sh:129`). It cannot
  host this check.
- `test/source-hygiene.test.js` is already the home for whole-tree forbidden-token classes:
  A (technique names), B (VCS-host CLI), C (vendor-suffixed basenames via
  `listTrackedFiles`, `:69`). It runs in `scripts/ci.sh:60` (`run_suite process test`) on CI
  (`ubuntu-latest`) and locally.
- `plan-lint` (`engine/src/plan-lint-main.js`) is a shipped product gate. It runs per plan at
  plan-phase close in any user repo, and it is never run over the committed plan corpus.

**Precedents.**

- ADR-135 swept dated ADR/PLAN/DESIGN records for a vocabulary rename. The user chose
  "a globally clean grep" over freezing history.
- ADR-153 kept frozen ADR text verbatim and refined it forward.
- Recent designs mark `docs/contributing/{prd,archive}/*` as "historical design records,
  frozen" (`design/transient-model-retry.md`, Out of scope).

## Requirements

- R1. At HEAD, no tracked file contains a real home-rooted path in either the slash or the
  dashed form. A `<placeholder>` segment and a named synthetic fixture segment are allowed.
- R2. The scrub rewrites paths only. Any wording around a rewritten path is reworded only as
  far as the substitution forces. Every rewritten line keeps its meaning: a command still
  names what runs and from where, and a pinned fact still states the same fact.
- R3. Every role that writes a committed artifact is told to write repo-relative paths and to
  use placeholders for out-of-repo locations. The spawn still receives the absolute working
  directory.
- R4. Unless DC-2 (c) is chosen: a hard-blocking guard fails `bash scripts/ci.sh`, both
  locally and on CI, on any new leak of the R1 shape anywhere in the tracked tree. It raises zero false positives
  on today's legitimate strings.
- R5. The engine test fixtures keep their behavioural coverage. `dashedCwd` still maps
  separators to dashes, and the aider real-session parse still yields the same pinned tokens
  and model.
- R6. No git history rewrite. The leak stays in published history (see Out of scope).

## Design

### 1. Scrub (existing files)

The substitution table is the same for every tree. Which trees are in scope is DC-1.

| Leaked form | Becomes |
|---|---|
| `cd /Users/<name>/…/craft-<slug> && <cmd>` | `<cmd>` (gate commands run from the worktree root) |
| `cd /Users/<name>/…/craft-<slug>/<sub> && <cmd>` | `cd <sub> && <cmd>` |
| `bash /Users/<name>/…/craft-<slug>/scripts/ci.sh` | `bash scripts/ci.sh` |
| worktree passed as an argument or assigned (`bash "$probe" <abs>`, `WT=<abs>`, `w=<abs>`) | `"$PWD"` (the command already runs from the worktree root) |
| precondition line naming the worktree | `` `<worktree>` `` (e.g. `- **Working directory**: the worktree root (\`<worktree>\`)`) |
| main-checkout absolute path (`/Users/<name>/<dev-root>/craft/<file>`) | repo-relative `<file>`, or `<main-repo-dir>` when the checkout itself is meant |
| ADR-035 `/Users/<name>/…/forge` → `…/craft` | `<dev-root>/forge` → `<dev-root>/craft` |
| toolchain install path `/Users/<name>/.n/bin/<tool>` | `<node-bin>/<tool>` (DC-7) |
| dashed projects dir (real username, then the dashed workspace layout, then the repo) | `-Users-<name>-<repo>`, with the literal `<name>` placeholder. The separator encoding stays visible, and the layout segments go too (DC-7 a). |
| `git check-ignore` output `/Users/<name>/.gitignore:1:.claude` | `~/.gitignore:1:.claude` (the fact is "a *global* gitignore matches") |

ADR-035 decided that the dev directory gets renamed from forge to craft as the final session
action. The username prefix carries none of that decision. A path-only rewrite therefore
leaves the decision content unchanged, which is the ADR-135 posture, not a supersede.

The scrub is hand-applied per line, not a blind `sed`. Gate commands in the 19 plan files
take four different shapes (`cd X && …`, `bash X/scripts/…`, `WT=X`, `w=X`), and a few lines
need the surrounding prose kept grammatical (`harden-prove-codex-binding.md:73`, "use
repo-relative …"). Where a command has already left the worktree (`eval-sweep-followups.md:165`
runs after `cd "$t"`), the path becomes `<worktree>/…` rather than a relative path.
Residue closure is the R4 guard itself: it goes green only when the sweep is complete.

### 2. Guard (new leaks)

The recommended vehicle is class D in `test/source-hygiene.test.js` (DC-2). The recommended
match rule is shape-based, with a fixed placeholder allowlist, over the whole tracked tree
(DC-3).

```js
// class D — absolute home-rooted paths (slash form + Claude projects-dir dashed form)
const PATH_START = "(?:^|[\\s`'\"(=:\\[{,>])";
const HOME_SLASH = new RegExp(`${PATH_START}/(?:Users|home)/([A-Za-z0-9._-]+)`, 'g');
const HOME_DASHED = new RegExp(`(?:${PATH_START}|/)-(?:Users|home)-([A-Za-z0-9._]+)-`, 'g');
const PLACEHOLDER_HOMES = new Set(['alice', 'example', 'me', 'someone', 'user', 'x', 'other-clone']);
function findHomePathLeaks(line) { /* captured segments not in PLACEHOLDER_HOMES */ }
```

- **Candidate lines** come from `git grep -nIE '/(Users|home)/|-(Users|home)-'`, run from
  `ROOT`. `-I` skips binaries. The judging happens in JS, so the rule does not depend on the
  PCRE support of the host's git build.
- **Anchoring.** A home root counts only at a path start: line start, whitespace, quote,
  backtick, `( = : [ { , >`, or `/` for the dashed form. So `…/home/cwd`, `/fake/home/user`,
  and an ADR slug containing `-home-` all pass.
- **Placeholders.** Any segment starting with `<` fails the `[A-Za-z0-9._-]` class, so
  `/Users/<name>/` passes with no special case. `PLACEHOLDER_HOMES` is the set pinned from
  today's tree. A real user who happens to be named `alice` would be missed, and that miss is
  accepted.
- **Linux.** `/home/<seg>/` and `-home-<seg>-` are covered by the same rule. Windows
  `C:\Users\…` has 0 hits today and is not covered (Out of scope).
- **Self-reference.** The detector's own leak-shaped test inputs are built at runtime from
  parts (`['', 'Users', SYNTHETIC].join('/')`), so the scanned test file never holds a
  literal leak. The same applies to this design doc and to future docs: describe the shape
  with `<name>` only.

**Pinned against the tree** (run with a throwaway node script, read-only):

| Probe | Result |
|---|---|
| 16-row synthetic matrix (see Test strategy) | 0 mismatches |
| `git grep` candidates over 1,496 tracked files | 112 lines |
| flagged by the rule | **83**, all 83 the maintainer's: matches the leak inventory exactly, **0 false positives** |
| the same rule restricted to the docs-ish scope | flags only the maintainer's lines once `x` is allowlisted |
| a `$HOME`-literal rule (DC-3 b) on this box | 74 slash + 10 dashed lines, the same 83 distinct lines. On CI (`ubuntu-latest`) `$HOME` is the runner's own home, which appears in no committed file, so it can never fire there. |

### 3. Source fix (stop new leaks)

The recommended fix is DC-4 (a): one invariant line in `contracts/core.md`, injected into
every role spawn on every binding:

```text
Committed artifacts carry repo-relative paths — never an absolute or home-rooted path (/Users/<name>, /home/<name>); name an out-of-repo location by placeholder (<worktree>, <main-repo-dir>, <node-bin>).
```

It adds a `CORE_MARKERS` entry (`'repo-relative paths'`) so the contract-equivalence test pins
the line's presence. In `templates/plan.md`, the `### Gate` comment gains: "commands run from
the worktree root — write them repo-relative (`cd engine && …`), never `cd <absolute path>`."
The spawn briefs keep "the absolute working directory", per R3.

The orchestrator writes ADRs, BACKLOG entries, and the run record itself, and receives no
contract block. Those writes are covered by the R4 guard, not by a prompt line. ADR-035 was
session-authored.

### 4. Edge behaviour

- A future dated doc that has to *quote* a leak (for example a postmortem) uses `<name>`. The
  guard has no waiver token, because a real path has no legitimate reason to be committed.
- The aider fixture is a real capture. Only the username segment of an unparsed `>` echo line
  changes. In a throwaway copy, the rewrite plus the `dashedCwd` pair change kept
  `aider-telemetry.test.js` + `usage-mine-main.test.js` at 125/125 passing.
- `/private/tmp/claude-501/` (a uid) and `~/…` paths are not username leaks and stay as they
  are.
- `README.md:180` cites "46 design docs". This doc makes it 47, and `readme-drift` (a CI job)
  counts it. The plan must bump the count in the same branch.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Scope of the existing-file scrub | (a) **Sweep all 31 files**, including `archive/` and ADR-035, path-only per the §1 table. (b) **Sweep living and dated design/plan/specs; freeze `archive/` (4 files) and ADR-035.** The guard then needs a path exemption for those 5 files, and the leak stays visible at HEAD in them. (c) **No sweep; stop new leaks only.** The guard then needs an 83-line baseline allowlist. | (a) | The username prefix carries no decision or provenance content, so the ADR's decision text is byte-identical apart from a path prefix (ADR-135 posture, which the user chose last time). Freezing keeps no extra provenance, because history keeps the original regardless (R6). (b) and (c) make the guard carry exemptions forever. |
| DC-2 | Guard vehicle | (a) **Class D in `test/source-hygiene.test.js`**: whole tracked tree, runs in `ci.sh` `run_suite process test`, hard-blocking locally and on CI. (b) **New engine bin** (`engine/src/home-path-lint-main.js` + `engine/bin` shim + suite) plus one line in `scripts/static-lints.sh`. (c) **No guard**: rely on the source fix. | (a) | It is the existing home for "forbidden token in tracked files" classes, so it needs no new bin, shim, or registration surface. (b) only pays off if the check ships to user repos (DC-5). (c) fails because 19 plans show the same leak recurring run after run with nothing checking it. |
| DC-3 | Match rule | (a) **Shape-based**: anchored `/Users\|home/<seg>` + dashed `-Users\|home-<seg>-`, `<…>` segments pass, plus a fixed `PLACEHOLDER_HOMES` allowlist, over the whole tree. Pinned at 83/83 and 0 false positives. (b) **`$HOME`/`id -un`-derived literal** path and dashed form: zero allowlist, but blind on CI and on any other contributor's machine. (c) **Shape-based with test dirs and fixtures exempted** instead of an allowlist. | (a) | It works the same everywhere, including CI. (b) catches only the person running it. (c) would have missed the aider fixture, which is exactly a real-capture leak. The allowlist's cost is one set constant. |
| DC-4 | Source-fix shape | (a) **One `contracts/core.md` invariant + `CORE_MARKERS` pin + a plan-template `### Gate` comment.** (b) **Agent-def rule** in the 7 affected `agents/*.md` + regenerated mirrors in the 6 adapters that carry agents (about 40 files). (c) **Template lines only** (`templates/plan.md` working-directory line + Gate note; nothing for design/spec writers). | (a) | One line reaches every role on every binding through engine assembly, with no mirror churn. The design-doc leaks were toolchain pins, not working dirs, so a plan-only fix (c) misses them. Cost: 205 bytes added to every spawn's injected block (`core.md` is 958 B today). |
| DC-5 | Should `plan-lint` reject a home-rooted path? | (a) **No**: the repo guard covers committed plans. (b) **Yes**, with the detector in `engine/src`, shared by `plan-lint` and the class-D test. This makes it a product-wide gate in user repos. | (a) | The brief is about this repo's disclosure. A product-wide gate is a new user-facing behaviour nobody asked for. Revisit if a user repo reports the same leak. |
| DC-6 | Engine test fixtures (`usage-mine-main.test.js:1309,1311`, `fixtures/aider/real-session.md:4`) | (a) **In**: rewrite the segment to the existing `x` placeholder. Pinned 125/125 green in a throwaway copy. (b) **Out**: add the file paths to a guard exemption. | (a) | It is the same leak in a public file. Coverage is unchanged (R5), and the rewrite removes the need for any path exemption. |
| DC-7 | Replacement vocabulary for out-of-repo paths | (a) **Neutral placeholders** (`<worktree>`, `<main-repo-dir>`, `<dev-root>`, `<node-bin>`), with repo-relative paths for in-repo ones. (b) **`~`-relative** (`~/.n/bin/pi`, `~/<dev-root>/…`): drops the username, keeps the toolchain and workspace layout. (c) **`$HOME`-relative**: same as (b), shell-expandable. | (a) | The brief names toolchain layout as part of the leak, and (b) and (c) keep it. `<worktree>` and `<main-repo-dir>` are already house vocabulary (`skills/run/SKILL.md:551,558`). |

## Test strategy

- **Class D detector unit** in `test/source-hygiene.test.js`, Given/When/Then, `sut =
  findHomePathLeaks`, a matrix of 16 rows. `{U}` stands for a synthetic segment that is built
  at runtime.
  - Flagged: `cd /Users/{U}/w && x`, `` `/Users/{U}` ``, `/home/{U}/x`,
    `projects/-Users-{U}-craft`, `"cwd":"/Users/{U}/p"`, `` `~/.claude/projects/-home-{U}-craft` ``.
  - Not flagged: `/Users/<name>/x`, `/Users/alice/p`, `/private/tmp/e-…/home/cwd/g.sh`,
    `/fake/home/user`, `adr/241-copilot-adapter-home-dist.md`, `~/.claude/projects`,
    `$HOME/.claude`, `github.com/{U}/craft`, `-Users-x-craft`, `/home/user`.
  - This exact matrix is already pinned green against the §2 regexes.
- **Class D tree assertion**: the real tracked tree has zero leaks. It is RED before the scrub
  (83 lines) and GREEN after it. This is the residue-closure proof for §1.
- **Contract pin**: `CORE_MARKERS` gains `'repo-relative paths'`.
  `engine/test/contract-equivalence.test.js:78` goes RED before the `contracts/core.md` line
  lands.
- **Template pin**: one assertion that `templates/plan.md`'s `### Gate` comment carries
  "repo-relative". It sits beside `test/plan-doc-fences.test.js`, the only test that already reads
  the template (`TEMPLATE_PATH`, `:8`).
- **Fixture regression**: `engine/test/aider-telemetry.test.js` and
  `engine/test/usage-mine-main.test.js` stay green after the DC-6 rewrite. They are guard
  entries, not RED.
- **Gates**: `npm --prefix engine test` (part) and `bash scripts/ci.sh` (phase), plus
  `bash scripts/design-lint.sh` on this doc and `bash scripts/readme-drift.sh` after the count
  bump.

## Out of scope

- **Git history rewrite.** It would mean force-pushing a ruleset-guarded `main` and breaking
  forks. The leak stays recoverable from history, so the scrub only cleans HEAD and the files
  shown on GitHub.
- **The bare username or GitHub handle** (README badge, CODEOWNERS, marketplace name): this is
  public identity, not a filesystem path.
- **Windows `C:\Users\<name>\` shapes**: 0 occurrences, and no Windows author.
- **`/private/tmp/claude-<uid>/` paths**: a uid identifies no one.
- **The spawn briefs' "absolute working directory"**: agents need it at runtime (R3).
- **`plan-lint` product-wide enforcement**: deferred by DC-5 (a).
- **Workspace-layout segments inside placeholder-user lines** (`/Users/x/…`, `-Users-x-…` in
  `plan/usage-telemetry-miner.md:336`, `usage-mine-main.js:157`, `usage-mine-main.test.js:1320`):
  they carry no username, so they stay as they are.
