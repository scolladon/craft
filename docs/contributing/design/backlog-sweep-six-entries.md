# Design — backlog-sweep-six-entries

> Brief: sweep six small open BACKLOG.md entries in one run and one PR, with one plan part per
> entry (two for E2 if a lint lands). Each part is RED-first where code changes and lands as its
> own one-line conventional commit. All six entries are flipped in place in the same PR, using the
> sibling shape "— delivered 2026-MM-DD** (branch)."
> Status: draft → self-reviewed ×3

Entry key, used only in this doc and never in planned source or test:

| Key | BACKLOG.md line | Entry |
|---|---|---|
| E1 | :521 | "`test/docs-structure-lint.test.js` runs its script under the inherited environment." |
| E2 | :539 | "A provenance ref sits in shipped adapter source." |
| E3 | :530 | "`docs/contributing/specs/memory.md` is a living spec no freshness guard can see." |
| E4 | :478 | "The lint mains re-implement helpers `cli-io.js` already exports." |
| E5 | :488 | "`adr.frozen` can still exempt every citation without tripping the whole-tree guard." |
| E6 | :851 | "Carry the credential-rotation caveat into every binding's probe record." |

Every fact below was re-checked in the worktree at `868456c` (git 2.56.0, node v22.22.3, darwin).
Probes that create repositories ran in mktemp throwaways. Throwaway paths are shown as `<tmp>`.

## Context

### Toolchain and gates

- The root has no `package.json`. The root lane is `bash scripts/ci.sh`; the engine lane is
  `npm --prefix engine test`.
- `scripts/ci.sh:82-134` runs the hygiene gates over the merge-base touched set. `run_stub_lint`
  passes non-test `*.js|*.mjs|*.cjs|*.ts|*.sh`, `run_prose_lint` passes `*.md` outside
  `docs/contributing/{adr,design,archive,specs,prd,plan}`. Both run at the posture
  `node engine/bin/hygiene-gate.js .claude/workflow.md` resolves, which is **`advisory`** today:
  findings print, and the exit stays 0.
- Mutation: `engine/stryker.conf.json` mutates `engine/src/**/*.js` plus 14 listed adapter files,
  including `adapters/pi/src/tool-call-hook.js`. The tap runner is used. Per-hunk scope is ONE
  combined `--mutate "fileA:r1,fileB:r2"` (`.claude/workflow.md` "Per-hunk mutation scope").
- `README.md:179-180` holds the receipts: `51 design docs`, `50 parted plans`, `484 ADRs`. That
  matches `ls` today (51 / 50 / 484). This doc makes the design count 52.

### E1 — `sut` spawns the audience lint under `process.env`

- `test/helpers/tmp-git-repo.js:10-17` `pinnedGitEnv()` returns `{ PATH, GIT_CONFIG_GLOBAL:
  '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }` with no `HOME`.
  `createTmpGitRepo` (:29-52) uses it for its own git calls and returns `{ root, cleanup }` (:51).
- `test/docs-structure-lint.test.js:92-99` `sut(dir, cwd)` runs `execFileSync('bash', [SCRIPT,
  '--audience', dir], { encoding: 'utf8', cwd })` with no `env`. Its three callers are the tests
  that build repos with `createTmpGitRepo` (:109, :132, :150).
- `scripts/docs-structure-lint.sh:20` `root="$(git rev-parse --show-toplevel)"` follows an ambient
  `GIT_DIR`/`GIT_WORK_TREE` to the decoy. The `git -C "$root" ls-files -- "$rel"` at :43 sits inside
  a process substitution, so its failure does not trip `set -e`, and the loop sees zero entries.
- `test/tmp-git-repo.test.js:29-40` `withAmbientEnv(overrides, act)` restores from saved values
  and deletes only keys that were absent before. It is local to that suite.
- Convention: helper modules get an eponymous suite (`test/helpers/region-slice.js` ↔
  `test/region-slice.test.js`, `tmp-git-repo.js` ↔ `tmp-git-repo.test.js`). `craft-run.js` is the
  one exception.

Pinned in a throwaway (helper and script read from the worktree). The decoy is a `git init`-ed
mkdtemp dir, with `GIT_DIR=<decoy>/.git`, `GIT_WORK_TREE=<decoy>` and
`GIT_INDEX_FILE=<decoy>/.git/index`:

| Repo | Ambient | Spawn env | Exit |
|---|---|---|---|
| three stray top-level dirs (`docs/a`, `docs/b`, `docs/c`) | none | inherited | 2 |
| same | none | `pinnedGitEnv()` | 2 |
| same | decoy | inherited | **0** (`fatal: … is outside repository at '<tmp>/decoy-…'`, then nothing reported) |
| same | decoy | `pinnedGitEnv()` | 2 |
| clean (`README.md`, `guides/`, `contributing/`) | none | `pinnedGitEnv()` | 0 |
| clean, reached through a symlinked path | none | `pinnedGitEnv()` | 0 |

The script needs nothing beyond `PATH` and git. No `HOME` is needed: all three existing
`createTmpGitRepo` cases keep their verdict under the pinned env.

### E2 — provenance refs in shipped code

- `adapters/pi/src/run.js:96` is ` * - DC-3: does NOT add --model/--provider to argv`
  (from 8ef1244, "productize Pi adapter").
- The dry grep found **two more in the same adapter**:
  `adapters/pi/src/tool-call-hook.js:51` ` * DC-5: a not-yet-existing dir cannot be a symlink, …`
  and `:79` ` * Runtime symlink re-check for write tools (DC-5).`
- `contracts/core.md:4` reads "No provenance refs (phase/ADR/backlog numbers) in source or test."
  No lint enforces it.
- House regex: ten adapter test files declare the same literal,
  `PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i` (e.g.
  `adapters/pi/test/native-surface.test.js:15`, `adapters/codex/test/execpolicy-rules.test.js:8`).
  They scan authored native surfaces (prompts, agent bodies, READMEs, extension text), not `src/`.
  The literal has no `DC-\d+` alternative.
- Neighbouring guards: `test/source-hygiene.test.js` holds whole-tree classes A-D. Class D
  (:93-108 `listHomePathCandidateLines(cwd, env)`, :436-447 `withThrowawayRepo`) is a
  `git grep`-over-tracked-files scan with a throwaway-repo seam test. `engine/src/stub-lint-main.js`
  is a 48-line adapter over `engine/src/hygiene-lint-core.js`: a marker list, `scan`, a found
  token and a waiver regex. ci.sh runs it touched-only, at the hygiene posture.

**Dry grep, comment lines only.** A heuristic comment detector: `//`, `/*`, a leading `*`, and `#`
in shell. It ran over 404 tracked code files: `engine/{src,bin,test,test-helpers}`,
`adapters/*/{src,test,bin}`, `scripts`, `hooks`, `test`.

| Pattern | Shipped code (`engine/src`, `engine/bin`, `adapters/*/src`, `scripts`, `hooks`) | Tests (`engine/test`, `test`) | Verdict on the hits |
|---|---|---|---|
| `\bDC-\d+\b` | 3 (all `adapters/pi/src`) | 0 | all real provenance |
| `\bADR-\d+\b` | 0 | 11 (10 + 1) | 10 real (`engine/test/manifest.test.js:639` "ADR-011: per-phase skip", `resolve.test.js:482` "ADR-312, ADR-313", `test/source-hygiene.test.js:35` "ADR-191"); 1 false positive: `adr-lint-main.test.js:1011` "the pattern ADR-(01) match ADR-012" is domain data |
| `\bP\d+\b` | 1 (`scripts/worktree-teardown.sh:52` "(P11 dogfood)") | 22 | real: `usage-mine-main.test.js:661-1055` "P29-1 … P29-19" section banners, `manifest.test.js:916` "Pre-P3" |
| `\b[Pp]art \d+\b` | 0 | 8 | real: `hygiene-lint-core.test.js:315-516` "Part 2 hardening", `test/living-corpus.test.js:12`, `test/source-hygiene.test.js:219` "per Part 9" |
| `\bBACKLOG\b` | 6 | 7 | **all false positives**: the file name `BACKLOG.md` (`engine/src/intention-lint-main.js:5,135,136,197`, `scripts/ci.sh:64`, `scripts/living-corpus.sh:4`, and the intention-lint test banners) |
| `\b[RTF]\d+\b` | 3 | 28 | mixed: `engine/src/findings.js:197` "R10" and `engine/src/observability/adapters/claude/telemetry.js:59` "F6" are provenance, while `engine/src/observability/metrics-line.js:9` "R3 in test/architecture-boundaries.test.js" names an in-repo rule label that `architecture-boundaries.test.js:129-152` defines (false positive) |
| `\bSC?\d+\b` | 1 | 24 | `scripts/docs-structure-lint.sh:3` "`SC5-*`" is a file-name pattern (false positive); `engine/test/scenarios.test.js` "S1 … S9, SC1" are scenario ids the suite itself defines (ambiguous) |

**House regex plus `DC-\d+`, whole lines, case-insensitive** (`git grep -n -i -P`):

| Area | Hits | What they are |
|---|---|---|
| shipped code (`engine/src`, `engine/bin`, `hooks`, `scripts`, `adapters/*/{src,bin,extensions,hooks,plugins}/**`) | **4** | the 3 pi `DC-n` + `scripts/worktree-teardown.sh:52` "P11" — all real |
| `engine/test` | 165 | `adr-lint-main.test.js` 92 (`ADR-001` ×74 as fixture data), `plan-lint-main.test.js` 28 (`Part 1`/`Part 2` plan-heading fixtures), `usage-mine-main.test.js` 20 (`P29-n`) |
| `test` | 14 | includes `docs-structure-lint.test.js:32` `DESIGN-P9-foo.md` (fixture name) and `p10-structure.test.js:229-243`, which greps *for* `P21` |
| `adapters/*/test` | 1 | `adapters/pi/test/tool-call-hook.test.js:128` (a test title) |
| `skills` / `templates` | 15 / 2 | deliberate `ADR-NNN` citations, which adr-lint checks; `templates/plan.md` `## Part 1` is template shape |

What the evidence shows: over shipped code the house regex is exact (4/4 real, 0 false positives),
and `\b[RTF]\d+\b` is not (1 of 3 is a false positive). Over tests and prose the house regex is
mostly domain data, so a scan there needs a comment-only filter or per-file allowlists.

### E3 — subject-less living specs

- Half resolved: `docs/contributing/specs/memory.md:1-3` already carries
  `subjects: [engine/src/observability/memory.js]`. `git log -S'subjects:' --
  docs/contributing/specs/memory.md` → `cae7206 feat: close the decision-drift propagation gap (#14)`.
- Corpus: `scripts/living-corpus.sh` enumerates `docs/contributing/specs/*.md`,
  `docs/contributing/prd/DESIGN-*.md`, `docs/contributing/DOD.md`, `docs/guides/concepts.md`,
  `docs/guides/customizing.md` and `BACKLOG.md`. Pages with line-1 `subjects:` today: `intention.md`,
  `memory.md`, `run-record.md`, `telemetry.md`. `DOD.md` has frontmatter but no `subjects` key.
  Pages without frontmatter: `specs/{backlog,execution,gate,model,policy,vcs}.md`, the seven
  `specs/*-poc-record.md`, the five `prd/DESIGN-*.md`, `guides/{concepts,customizing}.md`.
- Harness semantics (`docs/contributing/specs/intention.md:144-160`, `engine/src/intention.js:57-81`):
  a page with subjects `G` is stale when a changed path matches `G`, the page itself was not
  touched by the change, and no `INTENTION-WAIVE(<page>): <reason>` names it.
  `engine/src/intention-lint-main.js` (the ci.sh gate) checks only subjects **form** and the
  BACKLOG SoT pointers. It does not check that globs match files, so that check is done here.
  `assert-fresh` runs in the validation phase (`skills/validation/SKILL.md:98-108`) and is advisory
  under the default `intention.gate`.
- No test pins the real corpus's `skipped[]` list. `test/living-corpus.test.js:30,33` pins only page
  enumeration, which adding frontmatter does not change.

Code each candidate page names, with tracked-ness checked (`git ls-files --error-unmatch`):

| Page | Code it names | Clear code subject? |
|---|---|---|
| `policy.md` | `engine/src/policy.js` (`resolvePolicy`, `mergePolicyScopes`, `POLICY_ACTIONS`) | yes |
| `gate.md` | `engine/src/gates.js` `resolveGate` (:13), `engine/src/guards/tool-call-guard.js` (:154), plus per-adapter guard files | yes, for the core |
| `vcs.md` | `scripts/worktree-setup.sh` (:66), `scripts/worktree-teardown.sh` (:72) | yes |
| `model.md` | `adapters/{pi,opencode,copilot,codex}/src/model-tier-map.js` (:59-103); aider and cursor also ship one | yes |
| `backlog.md` | no code path; the `file` adapter is `agents/backlog-ticker.md` (prose) and the source set sits in the shared `engine/src/manifest-vocabulary.js:54` | no |
| `execution.md` | only `skills/run/SKILL.md` and `agents/craft-*` (prose) | no |

### E4 — duplicate predicates

Bodies compared verbatim:

| Symbol | Sites | Body | Identical? |
|---|---|---|---|
| `isRegularFile(p)` | `engine/src/cli-io.js:19` (exported), `manifest-lint-main.js:27`, `intention-lint-main.js:25`, `plan-lint-main.js:63` | `try { return statSync(p).isFile(); } catch { return false; }` | yes (4) |
| `isDirectoryPath(p)` | `adr-lint-main.js:78`, `intention-lint-main.js:33` | `try { return statSync(p).isDirectory(); } catch { return false; }` | yes (2) |
| `isNonEmptyString` | `adr-lint-main.js:466` `(v)`, `intention.js:112` `(value)` | `typeof x === 'string' && x.trim() !== ''` | yes (2) |
| `isNonSymlinkFile(p)` | `adr-lint-main.js:99` | `lstatSync(p).isFile()`; the comment at :90-98 forbids merging it | **no**: different syscall, kept |
| `isNonEmptyStringList` | `intention-lint-main.js:154` | array, **`length > 0`**, entries `length > 0` | **no**, kept |
| `isNonEmptyStringListForm` | `adr-lint-main.js:229` | array (empty allowed), entries `length > 0` | **no**, kept |
| `isListOfNonEmptyStrings` | `manifest.js:226` | array (empty allowed), entries `trim() !== ''` | **no**, kept |

Callers only ever read the fs predicates as booleans (`!x`, `&&`, ternary):
`intention-lint-main.js:107,131`, `adr-lint-main.js:707`, `manifest-lint-main.js:61,78,92` and
`plan-lint-main.js:335`. So the `cli-io.js:23` equivalent-mutant note ("undefined is falsy") holds
for every caller after the move. `cli-io.js` is imported today by `config-resolve-main`,
`init-land-main`, `promote-plan-main`, `tune-plan-main`, `adr-lint-main` and `plan-lint-main`
(the last two for `findRepoRoot` only). `engine/test/cli-io.test.js` covers `isRegularFile`,
`fail` and the exit constants. Five adapter copies of `isNonEmptyString` exist
(`adapters/{antigravity,codex×2,copilot,cursor}/src`) and are outside this entry.

### E5 — the whole-tree guard on `adr.frozen`

`engine/src/glob.js:54-72`: `PROBE_PATHS = [README.md, Makefile, engine/src/adr-lint-main.js,
docs/contributing/adr/001-example.md, a/b/c/d/e.txt]`, and `matchesEveryPath(glob)` requires every
probe to match **one** glob. Call sites: `engine/src/adr-lint-main.js:527` (`resolveExemptSet` →
`universal`), :646-648 (`sweepHits` emits `adr.frozen entry '<g>' exempts the whole tree, which
disables the citation sweep`), and `engine/src/manifest.js:368-372` (the same text as a validation
error).

Pinned with the worktree's `glob.js` (`MD` = `README.md`, `docs/contributing/adr/001-example.md`,
`a/b/c/d/e.md`):

| `adr.frozen` | `matchesEveryPath` per entry | per-probe hits (5 probes) | covers every `MD` probe |
|---|---|---|---|
| `**`, `**/*`, `{**,}`, `**/?*` | true | 11111 | true |
| `*` | false | 11000 | false |
| `**/*.md`, `**/*.m?`, `**/[A-Za-z0-9]*.md`, `{**/*.md,x}`, `**/*.{md,js}` | false | 10010 / 10110 | **true** |
| `**/*.MD` | false | 10010 (darwin matches case-insensitively) | **true** |
| `docs/**`, `**/adr/**`, `{docs,skills}/**`, `*/**`, `**/*.js` | false | ≤ 3 of 5 | false |
| `['*', '*/**']` (two entries) | false, false | union 11111 | **true** |
| `['*.md', '*/**/*.md']` (two entries) | false, false | union 10010 | **true** |

End to end with the real `engine/bin/adr-lint.js` in a throwaway repo: ADR 001 is superseded by 002,
and `ADR-001` is cited in `README.md`, `docs/guide/x.md` and `src/y.js`.

| `adr.frozen` | Exit | Findings |
|---|---|---|
| `['nothing/**']` | 2 | 3 `DECISION-CITE-FOUND` |
| `['**/*.md']` | 2 | 1 (`src/y.js` only) |
| `['*', '*/**']` | **0** | none; prints `craft-adr: OK`, so the sweep is fully disabled |
| `['**']` | 2 | the whole-tree finding |

Citation mass by type: `git grep -c -P 'ADR-\d{3}'` gives 3,085 hits in 433 `.md` files, 103 in 5
`.js`, 2 in `.yml` and 1 in `.gitignore`. Markdown carries 96.7% of the citations.

The knob is documented in `docs/guides/customizing.md:187-199`. Its :195-196 sentence is **wrong
today**: it says a glob whose every segment is a wildcard (`**`, `*`, `**/*`) is rejected, but `*` is
accepted. `engine/test/manifest.test.js:2634` pins that acceptance, and the table above shows `*`
matches 2 of 5 probes.

### E6 — credential-rotation caveat

- `docs/contributing/specs/codex-poc-record.md:497-508` "Isolation-method caveat — the mtime proof has
  a blind spot" is the model. Its rule paragraph (:506-508): mtime-find proves *filesystem*
  isolation only, so treat copied credentials as consumed, keep probe windows inside the access
  token's lifetime, and expect a re-login afterwards. :305-308 points to it from the smoke section.
- `docs/contributing/specs/cursor-poc-record.md:40-45` carries the partial caveat: the
  `Library/Keychains` symlink, described as a "read-only login keychain; a token refresh writes back
  the operator's own token". :48-50 shows that its isolation proof is `find ~/.cursor -type f -newer
  <marker>`. That window does not cover `~/Library/Keychains`, which the symlink shares read-write.
- The poc-record convention for every binding is established in one place:
  `adapters/README.md:7-10` ("Each binding ships its own README … plus a live contract-discovery
  record in `docs/contributing/specs/<tool>-poc-record.md`"). No page documents the probe
  isolation protocol across bindings. `docs/contributing/maintainer-smokes.md` covers craft's own
  eval and smoke runs, not binding probes.
- ADR-320 (`docs/contributing/adr/320-poc-record-appends-a-dated-re-probe.md`): a record gains
  dated sections, and only falsified rows are corrected in place.

## Requirements

| # | Requirement | Proof |
|---|---|---|
| R1 | `createTmpGitRepo` returns `{ root, env, cleanup }`, where `env` is the helper's allowlisted git env (no `HOME`, no `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`). | RED T1.1 (`env` is `undefined` today). |
| R2 | Every `createTmpGitRepo`-based `--audience` spawn in `test/docs-structure-lint.test.js` runs under that env. A decoy ambient `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` yields exit 2 for three stray dirs. | RED T1.2 (exit 0 today, pinned above). |
| R3 | No `DC-n` ref remains in shipped adapter code; the three sentences keep their meaning. | `git grep -n -P '\bDC-\d+\b' -- ':(glob)adapters/*/src/**'` is empty. Under DC-1 (b), RED T2.2. |
| R4 | DC-1 outcome is applied: no rule, a class-E whole-tree test, or a hygiene-lint adapter. With (b) or (c), ci.sh still exits 0. | T2.1/T2.2 or T2.3, plus `bash scripts/ci.sh`. |
| R5 | `policy.md`, `gate.md`, `vcs.md` and `model.md` carry line-1 `subjects:`, and every glob matches ≥ 1 tracked file. `backlog.md`, `execution.md`, the poc records, the PRD pages and the guides stay subject-less, with the reasons recorded. | the evidence command in E3 Design; `bash scripts/ci.sh` (intention-lint form check). |
| R6 | `isRegularFile`, `isDirectoryPath` and `isNonEmptyString` each have one definition, under DC-3, and every consumer imports it. `isNonSymlinkFile` and the three list predicates are untouched. | `git grep -n 'function isRegularFile\|function isDirectoryPath\|function isNonEmptyString(' -- engine/src` returns only the shared module(s). Existing suites stay green unedited. RED T4.1. |
| R7 | DC-2 outcome is applied. Under (a), `['**/*.md']` and `['*', '*/**']` are rejected at both sites; `*`, `**/archive`, `docs/history/**`, `frozen/**` and `[]` stay accepted; the existing whole-tree message is unchanged. Under every option, `customizing.md` no longer claims `*` is rejected. | RED T5.1-T5.3, or the doc diff. |
| R8 | `cursor-poc-record.md` carries the full caveat, and a standing rule sits where the poc-record convention lives. | `grep -n` evidence in E6 Design. |
| R9 | Six BACKLOG entries are flipped in place: E3's memory half carries the cae7206 evidence, and an entry already on disk is flipped with evidence, not re-implemented. | diff review. |
| R10 | `README.md` receipts are bumped in a separate docs commit (designs +1, plans +1, ADRs +N). | `readme-drift` inside `bash scripts/ci.sh`. |

## Design

Part order follows risk: docs and tests first, then engine changes, so each engine part's Stryker
run starts from a green base. Suggested order: E1 → E2 → E3 → E6 → E4 → E5, then the README bump,
then the BACKLOG flips.

### E1 — pass the helper's env to the spawn that judges the repo

Context block:

- `test/helpers/tmp-git-repo.js` — `createTmpGitRepo(relativeFilePaths)`: return
  `{ root, env: pinnedGitEnv(), cleanup }` (:51). `pinnedGitEnv` stays private. Each call builds a
  fresh object, so callers cannot share mutable state. Freezing it is optional (`execFileSync`
  accepts a frozen `env`; checked).
- `test/docs-structure-lint.test.js:92-99` — `sut(dir, cwd, env)`, passing `{ encoding: 'utf8', cwd,
  env }`. The three callers (:109, :132, :150) destructure `{ root, env, cleanup }` and call
  `sut(…, root, env)` (or `sut(…, linkedRoot, env)`).
- `withAmbientEnv` placement follows DC-4.
- The fixture-dir `--audience` tests (:41-71) are not built by `createTmpGitRepo`; see Out of scope.

### E2 — strip the refs; optional provenance rule (DC-1)

Strip, keeping each sentence:

```js
// adapters/pi/src/run.js:96
 * - does NOT add --model/--provider to argv
// adapters/pi/src/tool-call-hook.js:51
 * A not-yet-existing dir cannot be a symlink, so the nearest existing
// adapters/pi/src/tool-call-hook.js:79
 * Runtime symlink re-check for write tools.
```

These are comment-only edits, which Stryker does not mutate, so no mutation run is needed. Run
`node engine/bin/stub-lint.js -- adapters/pi/src/run.js adapters/pi/src/tool-call-hook.js`. Under
DC-1 (b), `scripts/worktree-teardown.sh:52` also becomes `(… under set -e, seen in a live
teardown dogfood).` without "P11".

DC-1 (b) shape, class E in `test/source-hygiene.test.js`. Context block:

- Add near :86-108:
  ```js
  // Class E: phase / decision-record / backlog numbering in shipped code (contracts/core.md).
  // Scoped to shipped code only: tests, skills and templates carry such tokens as fixture data or
  // as deliberate ADR citations that adr-lint checks.
  const PROVENANCE_REF_PATTERN = '\\b(ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+)\\b';
  const SHIPPED_CODE_PATHSPECS = ['engine/src', 'engine/bin', 'hooks', 'scripts',
    ':(glob)adapters/*/src/**', ':(glob)adapters/*/bin/**', ':(glob)adapters/*/extensions/**',
    ':(glob)adapters/*/hooks/**', ':(glob)adapters/*/plugins/**'];
  function listProvenanceRefLines(cwd, env = process.env) // git grep -n -i -P … -- <pathspecs>; status 1 → []; else rethrow
  ```
  This mirrors `listHomePathCandidateLines(cwd, env)` (:93-108): the same `withoutGitLocation(env)`
  and the same `GIT_GREP_NO_MATCH` handling. It does not reuse `runGrep`, whose catch swallows grep
  errors.
- `withThrowawayRepo(files, assertOnRepo)` (:436-447) writes flat files only. Teach it to create
  parent dirs (`fs.mkdirSync(path.dirname(p), { recursive: true })`) so the seam test can plant
  `engine/src/a.js`. Class D behaviour is unchanged.
- Live test: `listProvenanceRefLines(ROOT)` is `[]`, and the assertion message lists `file:line`.
  Echoing the text is safe here, unlike class D, which never echoes it.

DC-1 (c) shape, for comparison: `engine/src/provenance-lint-main.js` (an adapter over
`hygiene-lint-core.js`, as `stub-lint-main.js` is), `engine/bin/provenance-lint.js`, the token
`PROVENANCE-FOUND`, the waiver `PROVENANCE-WAIVE(<file>)`, and `run_provenance_lint` in ci.sh over
touched code at `hygiene_gate`. It is new engine source, so it enters mutation scope.

### E3 — subjects for the four pages with a clear code subject

Line-1 frontmatter, prepended unchanged above the existing `# … adapter spec` title:

```yaml
# docs/contributing/specs/policy.md
---
subjects:
  - engine/src/policy.js
---
# docs/contributing/specs/gate.md
---
subjects:
  - engine/src/gates.js
  - engine/src/guards/**
---
# docs/contributing/specs/vcs.md
---
subjects:
  - scripts/worktree-setup.sh
  - scripts/worktree-teardown.sh
---
# docs/contributing/specs/model.md
---
subjects:
  - adapters/*/src/model-tier-map.js
---
```

Pinned with `matchGlob` over `git ls-files`: `policy.js` 1, `gates.js` 1, `guards/**` 2
(`git-ext-diff-predicate.js`, `tool-call-guard.js`), each worktree script 1, and
`adapters/*/src/model-tier-map.js` 6. `parseSubjects` returns the expected arrays for the block and
the unquoted-glob forms.

`model.md` uses the glob, not the four described bindings. Every tier map is a Model-port `select`
implementation, so an aider or cursor tier-map change flagging `model.md` is a true signal that the
page does not describe that binding yet. The flag is advisory.

Left subject-less, with the reason recorded in the BACKLOG flip:

- `backlog.md`, `execution.md`: their implementations are prose (agents, `skills/run/SKILL.md`). The
  only code is the shared `manifest-vocabulary.js`, so subjecting to it would flag on every
  vocabulary edit.
- `*-poc-record.md` (7 pages): **records, not living pages**. Each pins observations to one binary
  version and date. ADR-320 forbids re-pinning un-re-probed rows. A subject on adapter source would
  raise drift that must not be fixed by editing the record to match the code. This call is
  clear-cut and is not a decision candidate. They stay in the corpus and appear in `skipped[]` as
  `no-subjects`. Changing `scripts/living-corpus.sh` is out of scope.
- `prd/DESIGN-*.md` (5) and `guides/{concepts,customizing}.md`: they span the whole engine, with no
  bounded code subject. `DESIGN-history.md` is the house example of a `no-subjects` page.

No false drift on this branch: every page gaining subjects is touched by this branch, so
`buildStaleRow` excludes it. No E1-E6 change touches `policy.js`, `gates.js`, `guards/**` or a tier
map. `scripts/worktree-teardown.sh` changes only under DC-1 (b), and `vcs.md` is touched anyway.

Evidence command for the validation phase (read-only):

```bash
node --input-type=module -e "
import { assertFresh } from './engine/src/intention.js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8' }).split('\n').filter(Boolean);
const changed = sh('git', ['diff', '--no-ext-diff', '--name-only', 'main...HEAD']);
const r = assertFresh({ changed, touched: changed, waived: ['docs/contributing/specs/intention.md'] },
  { listCorpus: () => sh('bash', ['scripts/living-corpus.sh']), readPage: (p) => readFileSync(p, 'utf8') });
console.log(JSON.stringify(r.stale), r.skipped.length);"
```

Expected: `stale` holds only the waived `intention.md` row (E4/E5 touch `intention*.js` and
`glob.js`), and `skipped` shrinks by 4 against `main`.

INTENTION-WAIVE(docs/contributing/specs/intention.md): the dedupe moves private predicates out of intention.js and intention-lint-main.js and the guard change adds exports to glob.js; the page describes none of them, so its consult and assert-fresh contract is unchanged.

### E4 — one definition per predicate

Context block (under DC-3 (a)):

- `engine/src/cli-io.js` — add exports `isDirectoryPath(p)` (the `statSync(p).isDirectory()` body
  plus the catch note) and `isNonEmptyString(value)` (the `trim() !== ''` body). Update the :1-5
  header, which today names only the config-resolve/init-land/promote-plan mains, so that it covers
  every engine module that imports from it.
- `engine/src/manifest-lint-main.js:20-33`, `plan-lint-main.js:58-70`,
  `intention-lint-main.js:20-39`: delete the local copies (doc comments included) and import from
  `./cli-io.js`. Drop `statSync` from the `node:fs` imports where it becomes unused (check each
  file).
- `engine/src/adr-lint-main.js:73-88` (`isDirectoryPath`) and :462-468 (`isNonEmptyString`): delete
  them and extend the :29 import. Leave :90-110 `isNonSymlinkFile` and :229
  `isNonEmptyStringListForm` byte-identical.
- `engine/src/intention.js:108-114`: delete it and import `isNonEmptyString`. The :97-102
  equivalent-mutant note on `classifySubjects` stays valid.
- Keep `intention-lint-main.js:154` `isNonEmptyStringList` and `manifest.js:226`
  `isListOfNonEmptyStrings` as they are (they differ, see Context).

### E5 — the whole-tree guard (DC-2)

DC-2 (a) shape. Context block:

- `engine/src/glob.js` — add:
  ```js
  /** Representative markdown paths: a root page, a nested record, a deep page. */
  export const MARKDOWN_PROBE_PATHS = Object.freeze(['README.md', 'docs/contributing/adr/001-example.md', 'a/b/c/d/e.md']);
  /** True when the globs together match every given probe — union semantics, not per entry. */
  export function coversEveryPath(globs, probePaths) {
    return probePaths.every((candidate) => globs.some((glob) => matchGlob(candidate, glob)));
  }
  ```
  `matchesEveryPath(glob)` stays and keeps its per-entry message.
- `engine/src/adr-lint-main.js:514-528` `resolveExemptSet` — `universal` is unchanged. Add a field
  `setLevel` that lists the two new findings: when no single entry is universal but
  `coversEveryPath(strings, PROBE_PATHS)` → `adr.frozen entries together exempt the whole tree,
  which disables the citation sweep`; and when `coversEveryPath(strings, MARKDOWN_PROBE_PATHS)` and neither
  whole-tree finding (per entry or set level) fired → `adr.frozen exempts every markdown file, which disables the
  citation sweep where ADR citations live`. `sweepHits` (:643-660) pushes them after the `universal` findings. `strings` =
  `frozen.filter((g) => typeof g === 'string')`: adr-lint reads the manifest unvalidated.
- `engine/src/manifest.js:368-372` — the same two checks after the per-entry loop, with the same
  message text as `errors`. `frozen` is already validated as a list of non-empty strings at :365.
- Extract the two message strings into named constants in each module. They are not shared across
  modules today, which matches the existing per-entry message.
- `docs/guides/customizing.md:195-198`: replace the "every segment is a wildcard (`**`, `*`, `**/*`)"
  sentence with the semantic rule: a set of entries is rejected when, together, it matches every
  path of a representative corpus or every markdown path, where ADR citations live; `*` (root-level
  only) stays accepted.

DC-2 (c) shape: only the `customizing.md` edit, stating that the guard rejects single whole-tree
entries only, that `**/*.md` and multi-entry unions such as `['*', '*/**']` pass, and that the
stderr exempt-set line is the only signal. It also fixes the `*` claim.

### E6 — full cursor caveat plus a standing rule

- `docs/contributing/specs/cursor-poc-record.md`: append `## Isolation-method caveat — the mtime
  proof has a blind spot` after the last section, using the record's own `##` level. The codex
  caveat is also an appended section. No row is falsified, so nothing is corrected in place
  (ADR-320). Content, limited to what the record
  pins: the isolation proof is an mtime-find over `~/.cursor` (:48-50); the auth seed is a symlink to
  the operator's real login keychain (:40-45), which sits outside that window. The record calls that keychain "read-only" and also says a refresh
  "writes back"; the caveat keeps the observed half: any token refresh during a probe writes the
  operator's real keychain, and no filesystem check over `~/.cursor` can
  see it. Whether Cursor's refresh token rotates server-side was **not probed**, so state that and
  assume it does. Then give the three mitigations verbatim in substance: keep probe windows inside
  the access token's lifetime, treat seeded credentials as consumed, expect a re-login afterwards.
  Add a one-line pointer at the end of the :40-45 bullet ("See *Isolation-method caveat* below."),
  mirroring codex :307-308.
- Standing rule: a short `## Probe records` section in `adapters/README.md`, after :7-10. That page
  establishes the `<tool>-poc-record.md` convention for every binding, and it is where a new
  binding's author starts. The rule: an mtime-find over the tool's real home proves filesystem
  isolation only. A probe that seeds a credential carrying a rotating refresh token, whether by
  copy or by shared store, must record the credential-rotation caveat in its record, with the three
  mitigations, and cite `codex-poc-record.md` "Isolation-method caveat" as the worked example. The
  section must carry no ADR or phase numbers. `adapters/README.md` is outside every
  `PROVENANCE_REF` test today, but the contract applies, and `run_prose_lint` will scan it as a
  touched `*.md`.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Should hygiene carry a provenance-ref rule? (E2) | (a) **No rule**: strip the 3 pi refs and rely on review. (b) **Class E whole-tree test** in `test/source-hygiene.test.js`: the house `PROVENANCE_REF` alternation plus `DC-\d+`, case-insensitive `git grep -P`, over shipped code only (`engine/src`, `engine/bin`, `hooks`, `scripts`, `adapters/*/{src,bin,extensions,hooks,plugins}/**`); strip the 4 current hits (3 pi + `worktree-teardown.sh:52` "P11"). (c) **Dedicated `provenance-lint`** as a `hygiene-lint-core` adapter (stub-lint-style), touched-diff over code and tests, with `PROVENANCE-FOUND`/`PROVENANCE-WAIVE`, at the hygiene posture. | (b) | Dry grep: over shipped code the regex is exact (4 hits, all real, 0 false positives), so a whole-tree test is red only on a real leak and needs no allowlist. It fails ci.sh loudly. (c) does not: posture is `advisory` today, so it would print and pass, and it adds an engine module plus mutation scope. Over tests, (c)'s noise is 165 regex hits in `engine/test`, mostly fixture data (`ADR-001` ×74, `Part 1/2` ×44). (a) leaves the next leak to a manual sweep, which is how this one was found. Cost of (b): tests stay unguarded, and `R10`/`F6`-style ids are not caught (`\b[RTF]\d+\b` has 1 false positive in 3 over `engine/src`). |
| DC-2 | `adr.frozen`: widen the guard or document the gap? (E5) | (a) **Widen with set-level union checks**: reject when the entries together cover every `PROBE_PATHS` probe, or every `MARKDOWN_PROBE_PATHS` probe, at both sites; fix the `customizing.md` `*` sentence. (b) **Widen per entry, markdown class only** (`**/*.md` rejected); document that unions such as `['*', '*/**']` still pass. (c) **Document only** in `customizing.md:187-199`: name both gaps and fix the `*` sentence. | (a) | Pinned: `['*', '*/**']` turns adr-lint into `exit 0, craft-adr: OK` with every citation unswept. That is a whole-tree hole in the guard named "whole-tree", worse than the `**/*.md` case the entry names. (b) closes the named case and leaves the worse one. (a) is about 10 lines in `glob.js` plus one hunk at each call site, the existing message and tests stay byte-identical, and every pinned legitimate glob stays accepted. (c) keeps a guard that is visible-and-wrong, the outcome the entry rejects. |
| DC-3 | Where does the shared `isNonEmptyString` live? (E4) | (a) **`cli-io.js`** with the two fs predicates; `intention.js` imports it from there. (b) fs predicates → `cli-io.js`; `isNonEmptyString` → a new pure `engine/src/predicates.js` (+ `engine/test/predicates.test.js`). (c) fs predicates → `cli-io.js`; keep both `isNonEmptyString` copies and record why. | (a) | One home, which is the brief's stated shape. Importing a pure function performs no I/O. `cli-io.js` only *imports* `node:fs` at module scope and calls it inside function bodies. The cost is that `intention.js` (header: "Pure — no I/O") gains an import edge to an fs-importing module. (b) keeps that edge clean at the price of a new module and suite for one 3-line function. (c) leaves the entry half-done. |
| DC-4 | Where does `withAmbientEnv` live once two suites need it? (E1) | (a) **Extract** to `test/helpers/ambient-env.js` with an eponymous `test/ambient-env.test.js`; `tmp-git-repo.test.js` and `docs-structure-lint.test.js` import it. (b) **Copy** the 12 lines into `docs-structure-lint.test.js`. | (a) | Two copies of restore-from-saved-values logic is the drift this sweep removes elsewhere (E4). The `process.env.X = undefined` → `"undefined"` trap lives in one place. Cost: one helper plus one small suite, under the house helper convention. |

## Test strategy

TDD per part: write the test RED first and confirm it fails on the shipped code **for the stated
reason** before writing production code. Titles use Given/When/Then, bodies are AAA, and the unit
under test is bound to `sut`. No provenance keys (E1…E6, DC-n, BACKLOG lines) in any test or source
text. Verify each part's RED and GREEN from its commit, because part-implementer handbacks have come
back empty.

**E1.**

- T1.1 (`test/tmp-git-repo.test.js`): Given a decoy `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and an
  ambient `HOME` on the parent, when `createTmpGitRepo` builds a repo, then the returned `env` has
  exactly the keys `PATH`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and `GIT_CONFIG_NOSYSTEM`. RED:
  `env` is `undefined`.
- (DC-4 (a)) T1.0 (`test/ambient-env.test.js`): an absent key is deleted after `act`, a present key
  is restored, and restoration happens when `act` throws. These tests pin the extracted helper. It
  is a move, not a behaviour change, so the RED is the missing module.
- T1.2 (`test/docs-structure-lint.test.js`): Given a decoy `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`
  on the parent process, when `--audience` lints a repo with three stray top-level dirs, then it
  exits 2 and names `a`, `b` and `c`. RED: exit 0 (pinned). Seed the decoy with `git init -q` under a
  test-local allowlist env, wrap the call in `withAmbientEnv`, and remove the decoy in `finally`.
- Gate: `node --test test/tmp-git-repo.test.js test/docs-structure-lint.test.js
  test/ambient-env.test.js`. No Stryker run: `test/` is outside mutation scope.

**E2.**

- Under (a): the evidence command in R3, plus `node engine/bin/stub-lint.js -- <files>`.
- Under (b), T2.1 (seam): Given a throwaway repo tracking `engine/src/a.js` with `// DC-3: x` and
  `engine/test/a.test.js` with `// P29-1`, when `listProvenanceRefLines(repo, hermeticGitEnv())`
  runs, then only `engine/src/a.js:1` is reported. RED: `ReferenceError`.
- Under (b), add T2.1b: `BACKLOG.md` and `SC5-*` text in `scripts/x.sh` is not reported, which pins
  the false-positive forms.
- Under (b), T2.2 (live): Given the tracked tree, when class E scans shipped code, then zero hits.
  RED: the 4 hits listed. GREEN after the strip.
- Under (c): fixture tests in `engine/test/provenance-lint-main.test.js`, mirroring
  `stub-lint-main.test.js`, plus per-hunk Stryker on the new module.
- Gate: `node --test test/source-hygiene.test.js`; `bash scripts/ci.sh` exits 0.

**E3.** Docs only, no RED test: `intention-lint` validates form, and the change is frontmatter. Run
the evidence command in E3 Design, `bash scripts/ci.sh` (intention-lint step) and
`node --test test/living-corpus.test.js test/intention-lint-ci.test.js`.

**E4.**

- T4.1 (`engine/test/cli-io.test.js`):
  - `isDirectoryPath`: a dir → true, a file → false, a missing path → false.
  - `isNonEmptyString`: `'x'` → true, `'  '` → false, `''` → false, `1` → false, `undefined` → false.
  - RED: the import of the missing exports fails, so the suite fails to load.
- Then remove the copies. `engine/test/{intention,intention-lint-main,adr-lint-main,manifest-lint-main,plan-lint-main}.test.js`
  must stay green **unedited**; that is the behaviour-preservation proof.
- Mutation: per-hunk Stryker with ONE `--mutate "engine/src/cli-io.js:<r>,engine/src/adr-lint-main.js:<r>,…"`.
  Check that the instrumented mutant count is ≥ the hunk count. Deleting hunks and import lines carry no
  mutants, so the instrumented set is `cli-io.js`'s two new functions; expect ≥ 1 mutant each.

**E5** (under DC-2 (a)).

- T5.1 (`engine/test/glob.test.js`):
  - `coversEveryPath(['*', '*/**'], PROBE_PATHS)` → true.
  - `coversEveryPath(['**/*.md'], MARKDOWN_PROBE_PATHS)` → true.
  - `coversEveryPath(['*.md', '*/**/*.md'], MARKDOWN_PROBE_PATHS)` → true.
  - `coversEveryPath(['*'], MARKDOWN_PROBE_PATHS)` → false.
  - `coversEveryPath(['docs/**'], MARKDOWN_PROBE_PATHS)` → false.
  - `coversEveryPath([], PROBE_PATHS)` → false.
- T5.2 (`engine/test/manifest.test.js`, beside :2609-2645): `['**/*.md']` and `['*', '*/**']` are
  rejected with the new texts. `['*']` (:2634), `['**/archive']`, `['docs/history/**']` and `[]`
  stay accepted unedited.
- T5.3 (`engine/test/adr-lint-main.test.js`, beside :1607): a git fixture (`gitTmpRoot` +
  `writeCleanSupersession` + `stageAll`) with `frozen: ['*', '*/**']` → exit 2 with the set-level
  finding (RED: exit 0, pinned). `['**/*.md']` → exit 2 with the markdown finding. The :1607 test
  stays unedited, which pins that the per-entry message is unchanged.
- Property lens (the guard is a matcher over sets): for every glob in a fixed list of legitimate
  scoped globs (`docs/**`, `**/archive`, `docs/contributing/design/**`, `*`, `frozen/**`), every
  subset of size ≤ 2 stays accepted.
- Mutation: per-hunk Stryker with ONE `--mutate` over the `glob.js`, `adr-lint-main.js` and
  `manifest.js` hunks.

**E6.** Docs only. Evidence: `grep -n "Isolation-method caveat" docs/contributing/specs/cursor-poc-record.md`
and `grep -n "Probe records" adapters/README.md`. `bash scripts/ci.sh` must show no prose-lint
finding on `adapters/README.md` (advisory posture: read the output, not the exit).

**Bookkeeping traps.**

- `README.md:179-180` receipts: this design doc makes the design count 52, the plan 51, and each
  ADR from the decisions phase adds to 484. `readme-drift` (in `bash scripts/ci.sh`) goes red until
  they are bumped. Bump them in **one separate docs commit** after the plan and ADRs exist. Never
  bundle the bump into a part commit.
- After the Done memory save, re-derive `CONCERN_FLOORS` in `test/p22-memory.test.js` (count entries
  at confidence ≥ 2 per concern) in the bookkeeping commit.
- `engine/test/findings.test.js:611` is a known sub-ms flake; rerun once.
- Phase gates: `bash scripts/ci.sh` exits 0, `npm --prefix engine test` is green, and
  `node engine/bin/stub-lint.js -- <file>` is silent on every touched source file.

## Out of scope

- `engine/src/findings.js:197` "R10" and `engine/src/observability/adapters/claude/telemetry.js:59`
  "F6" are provenance ids in shipped comments (dry grep above). The house regex does not cover
  them, and stripping them was not asked.
- Provenance comments in tests: 40 comment hits under the house regex (ADR 10, P 22, Part 8 —
  e.g. `usage-mine-main.test.js` "P29-n", `manifest.test.js` "ADR-011", `hygiene-lint-core.test.js`
  "Part 2 hardening") plus 28 `R/T/F` ids and the test file names `test/p{10,20,22}-*.test.js`:
  proven by the dry grep. Cleaning them is a separate sweep.
- Five adapter copies of `isNonEmptyString` (`adapters/{antigravity,codex×2,copilot,cursor}/src`):
  the entry names the lint mains only.
- The fixture-dir `--audience` spawns at `test/docs-structure-lint.test.js:41-71` and
  `engine/test/adr-lint-main.test.js:51-57` `runGit` also inherit `process.env`. This is a hunch
  for a false pass; to prove it, rerun the T1.2 decoy against the good-fixture test.
- The ten copies of the `PROVENANCE_REF` literal across `adapters/*/test`: they could import one
  shared constant, but no defect is shown.
- `scripts/living-corpus.sh` keeps enumerating `*-poc-record.md` as living-corpus members (listed
  under `skipped[]`). Excluding records from the enumerator changes the corpus contract.
