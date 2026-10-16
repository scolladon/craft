# Plan — codex-rules-deploy-step

> Source: design doc `docs/contributing/design/codex-rules-deploy-step.md` · ADRs `601, 602, 603, 604`
> (candidate 1 = (a) copy, ADR-601; candidate 2 = (a) `cmp`, ADR-602; candidate 3 = (c)
> Configure-scoped pins plus a README-wide negative `ln -s` pin, ADR-603; candidate 4 = (a) POC
> record rows, ADR-604.)
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

## Plan shape (2 parts)

| # | Part | src delta | Files |
|---|---|---|---|
| 1 | README *Configure* rules deploy step + its pins | none (README prose + one test file) | `adapters/codex/test/native-surface.test.js`, `adapters/codex/README.md` |
| 2 | Record the 0.162.1 rules deploy observations | none (docs only) | `docs/contributing/specs/codex-poc-record.md` |

The pins and the README text they pin land together in Part 1: the pins are the RED, the README
paragraph is the GREEN. Part 2 is docs-prose with no `src/` delta and no test, so it stands alone;
its rows are the evidence the README's "on codex 0.162.1 a symlinked file … is not loaded"
sentence rests on. The parts touch disjoint files and either order works; run them 1 then 2.

Part 1 was dry-run during planning on a throwaway copy of `adapters/codex/`, `agents/` and
`skills/` (no repo state written):

| Check | Result |
|---|---|
| `node --test adapters/codex/test/native-surface.test.js`, today | 132 tests, 0 fail |
| same, after Part 1 TDD step 1 (pins added, README untouched) | 137 tests, **4 fail** (the four Configure pins), negative pin passes |
| same, after Part 1 TDD step 3 (README block added) | 137 tests, 0 fail |
| lens: README `cp` line turned into `ln -sf` | 2 fail: the `cp` pin and the negative pin |
| lens: README `cmp` line deleted | 1 fail: the `cmp` pin |
| `bash scripts/ci.sh` on the untouched branch tip | 9 suite summaries, every `# fail 0` |

## Public-surface decision

No new exported symbol. `sectionAfter`, `readConfigureSection`, `CONFIGURE_HEADING` and
`LN_SYMLINK_INTO_RULES_DIR` are **internal**: module-local to the test file, never exported.
No `src/`, `bin/`, barrel, registry or generated file changes; `adapters/codex/craft.rules` is not
touched, so it is not regenerated (ADR-573 holds) and its drift test stays green as is. The only
public surface touched is the adapter README itself, which Part 1 edits and pins. Root
`README.md` changes only in its plan count, owned by the plan commit.

## Decision candidates

Two details the design and ADRs leave open. The part text below uses the recommended option for
each; switching to the alternative changes only the quoted regex (Part 1) or drops one row
(Part 2).

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| 1 | Breadth of the README-wide negative pin regex | (a) any short-flag cluster carrying `s`: `/\bln[ \t]+-[A-Za-z]*s[A-Za-z]*[ \t]+\S+[ \t]+\S*\/rules\b/` (matches `ln -s`, `ln -sf`, `ln -fs`); (b) the design's literal `/ln -s[ \t]+\S+[ \t]+\S*\/rules\b/` | **(a)** | `ln -sf` is the usual re-deploy idiom and builds the same unloaded layout. Measured on the throwaway: the `ln -sf` lens turns the (a) pin red; (b) does not match `ln -sf`, so outside *Configure* nothing would catch it. (a) still refuses only a `rules` target: the skills line `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` stays green (measured). |
| 2 | Rows added to the *Re-probe — codex-cli 0.162.1* table | (a) six rows: L1, L2, L3, L4, V2, plus one row for V1, V3 and V4; (b) the five observations ADR-604's context names (L1–L4, V2) | **(a)** | Design candidate 4 says "L1–L4, V1–V4". V3 (`execpolicy check` exits 0 on no match too) and V4 (absent file: `cmp` exit 2, `execpolicy check` exit 1) are first 0.162.1 observations, and the README's "`cmp` printing nothing and exiting `0` is the verification" leans on V1/V4. V5 is already recorded (the empty-file row), so it is not repeated. |

Two corrections to the design's draft, not choices:

- The design's symlink pin `/do not symlink/i` fails on its own draft wording, which wraps
  "**Copy, do⏎not symlink**" across a line. The pin is `/do\s+not\s+symlink/i`.
- Requirement 1 asks for the default (`~/.codex/rules/`) and "created if absent"; the design's
  draft prose names neither. The README text in Part 1 adds "(default `~/.codex/rules/`, created
  if absent)".

## Validation-phase notes

- Mutation: no `src/` change, so nothing for Stryker to mutate. The pins' own strength is
  covered by the hand lenses in Part 1 TDD step 4.
- Architecture boundaries: unaffected (no import changes).
- Environment trap seen during planning: in this worktree-isolated session the guard hook
  refused `bash scripts/ci.sh > <file> 2>&1` and any command carrying a shell variable in an
  option position. Plain `bash scripts/ci.sh` ran; the harness persisted its long output to a
  file, which `grep -E '^# (tests|fail) '` digests. For commits, rtk may rewrite `git add` /
  `git commit` to `rtk git …`, which the guard refuses; use `/usr/bin/git add <file>` and
  `/usr/bin/git commit -m '<msg>'`, one plain command each.

## Part 1 — README Configure rules deploy step and its pins

### Context

Edited files (no other file changes):

- `adapters/codex/test/native-surface.test.js` (391 lines, ESM, `node:test` +
  `node:assert/strict`; `readFileSync` and `README_PATH` already imported/defined at L3 and L13).
  Four insertions:
  1. Two module constants after `const ENTRYPOINT_LINE_BUDGET = 40;` (L42):
     `CONFIGURE_HEADING` and `LN_SYMLINK_INTO_RULES_DIR` (exact text in TDD step 1).
  2. A module-local `sectionAfter(text, heading)` helper after `bodyOf` (L72–74), before
     `agentPath` (L76). It mirrors `sectionAfter` in test/community-scaffolding.test.js L24–30
     byte for byte in logic: `indexOf(heading)` → `null` when absent, else the body up to the
     next `^## ` line (multiline search), or to end of text. Not imported from there (that suite
     is CommonJS and exports nothing).
  3. Inside `describe('README.md — honesty pins', …)` (L307–391), after its last `it` ("…
     documents the scriptable trust path and its read-only check", L385–390) and before the
     closing `});` at L391: a describe-local `readConfigureSection()` helper and five `it`s
     (exact text in TDD step 1).
  - House test style in this describe: Given/When/Then titles, `const sut = …;`, blank line,
    then the assertion(s). The existing negative pin at L371–382 (bare owner/repo
    marketplace source) is the precedent for a README-wide `doesNotMatch` guard.
- `adapters/codex/README.md` (196 lines). `## Configure` is L85–92: one paragraph ending
  "from this binding's own tier map (src/model-tier-map.js)." at L92 (the path is backticked in the README), then a blank line and
  `## Install-time hook trust — read this before running headlessly` at L94. The new paragraph,
  fenced block and closing paragraph go after L92, before that blank line (exact text in TDD
  step 3). "Configure" occurs nowhere else in the README, so `indexOf('## Configure')` finds L85.
  The README's only `ln -s` today is L59, `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>`;
  it must stay untouched. Commands elsewhere are run from the repository root (L114), and bare
  triple-backtick fences are the house fence style (L58–60).

Constraints the README text must meet (all already met by the text in TDD step 3):

- Hygiene scans over the README in the same test file (L277–305): no `PROVENANCE_REF` match
  (L40, case-insensitive: `ADR-n`, `Pn`, `Part n`, `backlog #n`), no `` !`…` `` shell
  injection, no bare `${CLAUDE_PLUGIN_ROOT}` outside the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`
  shim.
- Must not name `assertRulesIntegrity` (ADR-600) nor show a `node -e` import of it.
- No literal user directory: only `$CODEX_HOME`, `$HOME` and `~/.codex`, as L86 already does.
- The existing honesty pins over the whole README keep passing (they match tokens elsewhere in
  the file; the new text removes nothing).
- Do not edit the `## Guard` table (L140–150) or any other section: out of scope.

Read-only references (plain text, do not edit): design
docs/contributing/design/codex-rules-deploy-step.md (§ Design, § Pinned matrix); ADRs
docs/contributing/adr/601-craft-rules-is-copied-not-symlinked.md,
602-deployed-rules-are-verified-with-cmp.md, 603-rules-deploy-pins-are-scoped-to-configure.md,
600-on-demand-choice-is-recorded-on-every-surface.md; adapters/codex/craft.rules (16 lines, the
file the step copies); adapters/codex/test/execpolicy-rules.test.js L73–81 (drift guard that
pins the committed file byte-identical to the generator, which is why `cmp` against the
committed file is the integrity verdict).

Placement of the deploy step is load-bearing: ADR-603 scopes four pins to the `## Configure`
body, so moving the step to any other section turns them red by design.

### TDD steps

1. RED — add to adapters/codex/test/native-surface.test.js:

   After L42:

   ```js
   const CONFIGURE_HEADING = '## Configure';
   const LN_SYMLINK_INTO_RULES_DIR = /\bln[ \t]+-[A-Za-z]*s[A-Za-z]*[ \t]+\S+[ \t]+\S*\/rules\b/;
   ```

   After `bodyOf` (L72–74):

   ```js
   /** The body between `heading` and the next `## ` heading, or null when `heading` is absent. */
   function sectionAfter(text, heading) {
     const start = text.indexOf(heading);
     if (start === -1) return null;
     const body = text.slice(start + heading.length);
     const next = body.search(/^## /m);
     return next === -1 ? body : body.slice(0, next);
   }
   ```

   At the end of `describe('README.md — honesty pins', …)`:

   ```js
     function readConfigureSection() {
       const section = sectionAfter(readFileSync(README_PATH, 'utf8'), CONFIGURE_HEADING);
       assert.notEqual(section, null, `README.md has no "${CONFIGURE_HEADING}" heading`);
       return section;
     }

     it('Given the Configure section of README.md, when scanned, then it names $CODEX_HOME/rules/ as the deploy target', () => {
       const sut = readConfigureSection();

       assert.match(sut, /\$CODEX_HOME\/rules\//);
     });

     it('Given the Configure section of README.md, when scanned, then it copies adapters/codex/craft.rules into the rules directory', () => {
       const sut = readConfigureSection();

       assert.match(sut, /cp adapters\/codex\/craft\.rules \S*\/rules\/craft\.rules/);
     });

     it('Given the Configure section of README.md, when scanned, then it verifies the copy byte-for-byte against the committed file', () => {
       const sut = readConfigureSection();

       assert.match(sut, /cmp adapters\/codex\/craft\.rules \S*\/rules\/craft\.rules/);
     });

     it('Given the Configure section of README.md, when scanned, then it says to copy and not symlink the rules file', () => {
       const sut = readConfigureSection();

       assert.match(sut, /do\s+not\s+symlink/i);
     });

     // A symlinked rules file is not loaded, yet every file-level check passes on it,
     // so the README must never show one, in any section.
     it('Given every ln -s README.md shows, when its target is inspected, then none lands in a rules directory', () => {
       const sut = readFileSync(README_PATH, 'utf8');

       assert.doesNotMatch(sut, LN_SYMLINK_INTO_RULES_DIR);
     });
   ```

   Run `node --test adapters/codex/test/native-surface.test.js`. Expected: 137 tests, 4 fail.
   - RED "names $CODEX_HOME/rules/ as the deploy target" — fails with `The input did not match
     the regular expression /\$CODEX_HOME\/rules\//`; the quoted input is only the
     `config.template.toml` paragraph, because today's Configure body has no rules step.
   - RED "copies adapters/codex/craft.rules into the rules directory" — same failure kind: no
     `cp adapters/codex/craft.rules …` line in the Configure body.
   - RED "verifies the copy byte-for-byte against the committed file" — same: no `cmp` line.
   - RED "says to copy and not symlink the rules file" — same: no "do not symlink" phrase.
   - The `notEqual(section, null)` assertion passes in all four (the heading exists at L85), so
     each failure is the content match, not a missing section.
2. GUARD — "every ln -s README.md shows … none lands in a rules directory": passes today and
   after GREEN, because the README's only `ln -s` (L59) targets `$CODEX_HOME/skills/<name>`. It
   guards against a future symlinked rules step anywhere in the README.
3. GREEN — in adapters/codex/README.md, insert after L92 (the line ending
   "(`src/model-tier-map.js`)."), so a blank line separates it from that paragraph and from
   `## Install-time hook trust`:

   ````markdown
   Deploy the execpolicy rules file: copy `craft.rules` into `$CODEX_HOME/rules/` (default
   `~/.codex/rules/`, created if absent), the directory codex loads `*.rules` files from.
   From the repository root:

   ```
   mkdir -p "${CODEX_HOME:-$HOME/.codex}/rules"
   cp adapters/codex/craft.rules "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
   cmp adapters/codex/craft.rules "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
   ```

   `cmp` printing nothing and exiting `0` is the verification: the deployed copy is
   byte-identical to the committed file. No codex error flags a bad copy — an empty or
   comments-only file parses cleanly and forbids nothing — so do not skip it. **Copy, do
   not symlink**: on codex 0.162.1 a symlinked file in `$CODEX_HOME/rules/` is not
   loaded, yet it passes `cmp` and `codex execpolicy check`, both of which follow the
   link. Re-run all three lines whenever `adapters/codex/craft.rules` changes; a stale
   copy still parses and may forbid less.
   ````

   Why each piece (do not drop any): `${CODEX_HOME:-$HOME/.codex}` resolves to codex's own
   default when `CODEX_HOME` is unset (a bare `$CODEX_HOME` would make `mkdir` target `/rules`);
   every operand is relative or double-quoted, so a spaced checkout path stays one word; the step
   writes one named file and never replaces the directory, so the operator's own `*.rules`
   files survive. A `cmp` mismatch (`differ: char N, line M`, exit 1) or an absent target
   (`No such file`, exit 2) is remedied by re-copying; the prose needs no branch per case.

   Re-run the suite: 137 tests, 0 fail (the four REDs and every hygiene scan and honesty pin
   pass). Then check `grep -n 'CODEX_HOME/rules' adapters/codex/README.md` returns lines and
   `grep -c assertRulesIntegrity adapters/codex/README.md` prints `0`.
4. REFACTOR — none expected. Then the hand lenses, each on the README only, never committed,
   restoring the GREEN README after each (keep a copy outside the repo, e.g. under `mktemp -d`,
   and copy it back): (a) turn the `cp` line into `ln -sf …` → the `cp` pin and the negative pin
   fail (measured in planning); (b) delete the `cmp` line → the `cmp` pin fails (measured);
   (c) move the new block under `## Guard` → the four Configure pins fail. After restoring, the
   suite is 137/0 again.

### Gate

- `node --test adapters/codex/test/native-surface.test.js` → `# tests 137`, `# fail 0`.
- `bash scripts/ci.sh` → exit 0, every `# fail ` summary line reads `0` (9 suites). If the guard
  hook refuses the redirected form, run it plain and grep the persisted output for
  `^# (tests|fail) `.
- `git diff --no-ext-diff --stat` shows exactly the two files above.

### Commit

`docs(codex): add the craft.rules copy-and-verify step to Configure`

## Part 2 — Record the 0.162.1 rules deploy observations in the POC record

### Context

Edited file (no other file changes):

- `docs/contributing/specs/codex-poc-record.md` (574 lines). Section `## Re-probe — codex-cli
  0.162.1` starts at L541; its method paragraph is L543–548; its `| Probe | Result |` table runs
  L550–569. The last row today (L569) is the "Older deployed copy, execpolicy check
  (0.162.1)" row. L570 is blank, then the closing paragraph "The 2026-07-21 runtime fail-open
  verdict was planned as a `codex exec` run, …" (L571–574) — it stays, unchanged, after the
  table. Six new rows go directly after L569, before the blank line (exact text in TDD step 2).

Row conventions copied from the three 2026-10-16 rows at L567–569:

- Label column ends `(0.162.1)`; result column opens `**CONFIRMED (0.162.1), 2026-10-16.**`
  (or `…, 2026-10-16: <verdict>.**`, the shape L558 and L564 use for a verdict suffix).
- The first row of a new method states it; later rows say "Same method.", as L568–569 do.
- Placeholders, never literal paths: `<path>`, `<link>`, `<work>`, `<marker>`, and `<git>` for
  the git argv word in `execpolicy check` commands (L567 uses `<git> push`).
- Run counts as 3/3, 2/2.
- The record's header (L3–6) says every row is CONFIRMED or DEFERRED; these are all CONFIRMED.

Constraints:

- Append only (ADR-320, docs/contributing/adr/320-poc-record-appends-a-dated-re-probe.md): no
  existing row text changes.
- No ADR numbers in the rows: none of the surrounding 0.162.1 rows cites one.
- test/source-hygiene.test.js scans docs/contributing/specs/ with class-A
  `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise` and
  class-B `\bgh\b|\bgithub\b`: the new rows must contain none of those words.
- test/living-corpus.test.js lists this file as a corpus member and reads none of its rows;
  engine/bin/intention-lint.js (run by ci.sh over the living corpus) checks only `subjects`
  frontmatter and BACKLOG SoT pointers. No test pins this table's shape or row count.
- No home-rooted path. `~/.codex` in an isolation-proof clause is the house form (L543).

Source of every number (read-only, plain text): design
docs/contributing/design/codex-rules-deploy-step.md § Pinned matrix (L1–L4 load table, V1–V5
verification table, load-detector method, isolation proof); the 2/2 independent re-run of the
symlinked-file case is stated in docs/contributing/adr/601-craft-rules-is-copied-not-symlinked.md
§ Context. The design probe's parse error reads `<path>:16`; the existing L565 row reads `:15`
for a different deployed file. Quote each as measured; do not reconcile them.

### TDD steps

No behaviour changes, so there is no RED and no GREEN code.

1. GUARD — test/source-hygiene.test.js and test/living-corpus.test.js pass before and after:
   the first because the rows below carry no class-A/class-B word, the second because it reads
   only the corpus file list.
2. Text edit — insert these six lines directly after the L569 row
   (the "Older deployed copy, execpolicy check (0.162.1)" row), each one table row:

   ```markdown
   | Copied rules file, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: loaded.** Hermetic: a throwaway `CODEX_HOME` with no `auth.json`, so no session can reach a model; isolation proven by `find ~/.codex -newer <marker>` = 0 entries. Load detector: `craft.rules` minus its last line, so a loaded file stops `codex exec --skip-git-repo-check -s read-only -C <work> "say hi" < /dev/null` at startup, and a file that is not loaded lets it reach the model call (the session header, then `401 Unauthorized … wss://api.openai.com/v1/responses`, exit 1). A regular-file copy at `$CODEX_HOME/rules/craft.rules` → exit 1 at startup with `Error loading rules: <path>:16: starlark error … Parse error`, before any session. 3/3. |
   | Symlinked rules file, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: not loaded.** Same method. `$CODEX_HOME/rules/craft.rules` a symlink to the malformed file → no rules error; the session header, then `401 Unauthorized`, exit 1. 3/3, and 2/2 in an independent re-run: 5/5. The adapter README's deploy step copies the file for this reason. |
   | Symlinked rules directory, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: followed.** Same method. `$CODEX_HOME/rules` itself a symlink to a directory holding the malformed `craft.rules` → exit 1 at startup with `Error loading rules`. 3/3. |
   | Non-`.rules` file in the rules directory (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: not parsed.** Same method. A well-formed `craft.rules` copy beside a malformed `NOTES.md` → no rules error; the session header, then `401 Unauthorized`. 2/2. Only `*.rules` files are parsed. |
   | `cmp` and `execpolicy check` on a symlinked file (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: both follow the link.** File-level, one run each (`execpolicy check` is offline and deterministic). A symlink to the committed bytes: `cmp adapters/codex/craft.rules <link>` → exit 0; `codex execpolicy check --rules <link> <git> push` → exit 0, `"decision":"forbidden"`. Both pass on a layout codex does not load (the symlinked-file row above), so neither detects it. |
   | `cmp` and `execpolicy check` on a copied and an absent file (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same file-level method; flag form from `codex execpolicy check --help`: `--rules <PATH> <COMMAND>...`. Copied `craft.rules`: `cmp` → exit 0; `<git> push` → exit 0, `"decision":"forbidden"`, matchedPrefix `git push`; `<git> status` → exit 0, `{"matchedRules":[]}`. `execpolicy check` exits 0 on a match and on no match alike, so its verdict is on stdout. Absent file: `cmp` → exit 2, `No such file or directory`; `execpolicy check` → exit 1, `failed to read policy … No such file or directory`. |
   ```

   Keep the blank line and the closing paragraph after the last new row.
3. Verify — `grep -c '(0.162.1), 2026-10-16' docs/contributing/specs/codex-poc-record.md`
   prints `9` (3 before + 6); `grep -c '^| ' docs/contributing/specs/codex-poc-record.md` prints
   `153` (147 before + 6); `grep -nE 'mutation|mutant|stryker|\bgh\b|github'
   docs/contributing/specs/codex-poc-record.md` prints nothing new (none exist today);
   `sed -n 569,577p` shows the six rows, then the blank line, then "The 2026-07-21 runtime
   fail-open verdict …".

### Gate

- `bash scripts/ci.sh` → exit 0, every `# fail ` summary line reads `0` (9 suites). If the guard
  hook refuses the redirected form, run it plain and grep the persisted output for
  `^# (tests|fail) `.
- `git diff --no-ext-diff --stat` shows exactly the one file above, +6 lines.

### Commit

`docs(codex): record the 0.162.1 rules deploy observations in the POC record`
