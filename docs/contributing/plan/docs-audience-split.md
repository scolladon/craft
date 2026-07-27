# Plan — docs-audience-split

> Source: design doc `docs/design/docs-audience-split.md` · ADRs `283–289`
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

## Orientation (read once, applies to every part)

This is a **relocation migration** (ADR-289: one green part per moved tree). Nothing here
adds an exported code symbol; the only new surfaces are two router README pages and a new
`--audience` mode on the existing `docs-structure-lint.sh` (wired into `ci.sh`) — no barrel,
facade, or API-report gate applies. The whole feature is: `git mv` a tree, sweep that tree's
**load-bearing literals**, update that tree's **guard/test**, stay green, commit. Sequential
parts share one working tree and build on each other.

**Three reference categories (design §Reference-handling — memorize the boundary):**
- **Category 1 — shipped consumer skill defaults: LEAVE.** `skills/design` (`docs/design/`),
  `skills/planning` (`docs/plan/`), `skills/decisions` (`docs/adr/`), `skills/validation`
  (`docs/DOD.md`), `skills/requirements` (`docs/requirements/`) fallbacks stay `docs/*`.
  `examples/dod-artifact/workflow.md` and `examples/loop/README.md` cite `docs/DOD.md` as the
  **consumer default** — LEAVE. Craft redirects only itself, via its manifest (Part 8).
- **Category 2 — craft-repo-internal LOAD-BEARING literals: SWEEP.** scripts, tests,
  `skills/*` spec-pointers, adapter authored surfaces, `examples/*` pointers at craft's OWN
  docs, `README.md`, `templates/pr-body.md`, `engine/src` literals. Each part carries the
  exact `git grep` command + the known hit list for its tree.
- **Category 3 — historical / machine-maintained: policy per ADR-288.** Intra-`docs/`
  cross-links in `adr/**`, `design/**`, `plan/**`, `archive/**`, moved `prd/**` are relocated
  **verbatim** by `git mv` (prose backtick citations are NOT swept — they are historical
  record). `BACKLOG.md`: rewrite **live/actionable** path strings only; leave dated
  run-record entries verbatim. `.claude/craft-memory.md`: **never touch** (byte-verbatim).

**The standing link-check is the PRE-EXISTING `links` (lychee) job in `.github/workflows/ci.yml`**
— it resolves every relative markdown link + `#fragment` across ALL `./**/*.md` (repo-wide,
`--offline`, `fail: true`). Verified facts (I ran it): it is **FILE-relative** (a `../README.md`
from `docs/GUIDE-concepts.md` resolves to the repo README and passes; an `adapters/memory.md`
from `docs/` resolves to `docs/adapters/memory.md`), it is **currently green** (zero real
danglers — the handful a naive grep finds are all inside ``` `` ```-code-spans or ```` ``` ````
fences, which lychee correctly ignores). This satisfies ADR-287/requirement 12 already; the
planner does NOT add a second checker (DRY — a bash reimplementation would diverge on
resolution/fragments). **Every part's obligation:** keep lychee green — rewrite every clickable
breaker so no NEW dangler appears. It only sees **clickable** `[text](target)` links; prose
``` `docs/adapters/x.md` ``` and fenced-block links are invisible. `ci.sh` does NOT run lychee,
so the craft per-part/phase gates will NOT catch a missed link — Part 9 runs lychee once on the
final tree to close that gap before the PR. Breaker facts (from lychee's file-relative model):
sibling links between `adr/ design/ plan/ archive/` **auto-survive** (all become children of
`contributing/`, offset preserved); so does every `../DOD.md` / `../metrics-baseline.report.json`
link from those trees (both move INTO `contributing/`). The genuine clickable breakers — the
`adapters/`→`specs/` rename (Part 1) and the guides' one-level-deeper nesting (Part 2) — are
enumerated in those parts. `README.md`, `examples/**`, `adapters/**/*.md` are also lychee-scanned,
so the Category-2 sweeps of THEIR `docs/…` links are link-health-enforced, not just cosmetic.

**living-corpus is edited by FOUR parts in lockstep** (Parts 1/2/7/8). `scripts/living-corpus.sh`
has ONE find block enumerating `docs/adapters/*.md` + top-level `DESIGN-*.md, DOD.md,
GUIDE-customizing.md, GUIDE-concepts.md`; `test/living-corpus.test.js` pins the result as an
`EXPECTED` `Set`; `skills/run/SKILL.md:90` + `scripts/ci.sh:63` + `scripts/living-corpus.sh:3-4`
restate the globs in prose/comments. Each corpus-member move rewrites its find clause and
**re-pins `EXPECTED` by RUNNING `bash scripts/living-corpus.sh` and pasting the output** —
never by hand (intention hint). The find block's end state after all four parts:
```
{
  find docs/contributing/specs -maxdepth 1 -name '*.md'
  find docs/contributing/prd  -maxdepth 1 -name 'DESIGN-*.md'
  find docs/contributing      -maxdepth 1 -name 'DOD.md'
  find docs/guides            -maxdepth 1 \( -name 'concepts.md' -o -name 'customizing.md' \)
} 2>/dev/null
```
Note `docs/guides` uses named clauses (NOT `-name '*.md'`) so `model-class-matrix.md` — in
`guides/` but NOT in the corpus — is excluded.

**Cited line numbers are from the pre-migration tree** — earlier parts shift `ci.sh` /
test-file lines as they edit them. Locate every edit by its CONTENT (the described token /
regex / find-clause), never by line number.

**Gate conventions (every part):**
- **Part gate:** `node --test 'test/**/*.test.js'` (root suite) is mandatory. Parts that
  touch `engine/**` also run `(cd engine && node --test 'test/**/*.test.js')`. Part 1 also
  runs the touched adapter suites: `for a in aider antigravity cursor; do (cd adapters/$a &&
  node --test 'test/**/*.test.js'); done`.
- **Phase gate (once, at the phase boundary — after Part 9):** `bash scripts/ci.sh`.
  `ci.sh` **HANGS** if real agent binaries are on `PATH`. Prepend fast-failing stubs first:
  ```
  D=$(mktemp -d); for b in pi opencode copilot codex cursor antigravity aider; do
    printf '#!/bin/sh\nexit 2\n' > "$D/$b"; chmod +x "$D/$b"; done; export PATH="$D:$PATH"
  ```
- **Never commit on red.** Each part is one atomic conventional commit; `git mv` (never
  delete+add) so `git log --follow` traverses every rename (Part 9 asserts this).
- **No provenance refs** (phase/ADR/backlog numbers) in swept source or test strings; **no**
  suppression directives; **no** swallowed errors.

## Part 1 — Relocate adapter contract specs → docs/contributing/specs

### Context
Move `docs/adapters/` (16 files: `execution.md gate.md intention.md memory.md model.md
policy.md telemetry.md vcs.md backlog.md` + 7 `*-poc-record.md`) → `docs/contributing/specs/`.
Command: `mkdir -p docs/contributing && git mv docs/adapters docs/contributing/specs`.

**Category-2 load-bearing literal sweep — `docs/adapters` → `docs/contributing/specs`.**
Verify closure with `git grep -n 'docs/adapters' -- ':!docs/' ':!.claude/craft-memory.md'`
(after the mv, re-run and confirm ZERO hits outside `BACKLOG.md` dated entries). Known hit list:
- `scripts/living-corpus.sh` — line 17 find glob `find docs/adapters -maxdepth 1 -name '*.md'`
  → `find docs/contributing/specs -maxdepth 1 -name '*.md'`; header comment lines 3–4 update
  `docs/adapters/*.md` → `docs/contributing/specs/*.md`.
- `scripts/ci.sh` — line 63 comment `docs/adapters/*.md` → `docs/contributing/specs/*.md`;
  line 132 `run_prose_lint` excuse glob: append `|docs/contributing/specs/*` to the case
  pattern (advisory posture; keep consistent-with-disk).
- `test/living-corpus.test.js` — the 16 `docs/adapters/*` entries in `EXPECTED` → the new
  `docs/contributing/specs/*` paths. **Re-pin by running the script** (see Orientation).
- `test/source-hygiene.test.js` — `SCANNED_PATHS` line 18 `docs/adapters` →
  `docs/contributing/specs`; allowlist regexes that name adapters files: line 104
  `/\/docs\/adapters\/pi-poc-record\.md:/` → `docs/contributing/specs/pi-poc-record.md`;
  line 123 `vcs\.md` clause `docs/adapters` → `docs/contributing/specs`; line 127
  `backlog\.md` clause; line 143 `telemetry\.md` clause. Comment strings on lines 102/118/124/140
  that name `docs/adapters/...` update in step (line-agnostic regexes stay line-agnostic).
- `engine/test/intention-self-governance.test.js` — line 9 `const PAGE =
  'docs/adapters/intention.md'` → `'docs/contributing/specs/intention.md'` (this READS the
  real file at line 10–13 via `resolve(...,'..','..',PAGE)`; load-bearing).
- `test/p22-memory.test.js` — lines 63–64 existence check `docs/adapters/memory.md` →
  `docs/contributing/specs/memory.md`.
- `skills/*/SKILL.md` spec-pointers (all `docs/adapters/<port>.md` → `docs/contributing/specs/<port>.md`):
  `skills/run/SKILL.md` lines 81,88,90,99,123,223,229,365,375,388,394,401 (line 90 is the
  §1c-int corpus prose `(docs/adapters/*.md, …)` → `docs/contributing/specs/*.md`);
  `skills/documentation/SKILL.md` 15,30,32,37,41; `skills/integrate/SKILL.md` 17,25,29;
  `skills/propose/SKILL.md` 21,23,41; `skills/decisions/SKILL.md` 15 (ONLY line 15 — lines
  11 & 14 `docs/adr/` are Category-1 consumer defaults, LEAVE); `skills/validation/SKILL.md` 97;
  `skills/workspace/SKILL.md` 25.
- Adapter authored surfaces (`*-poc-record.md` / `../docs/adapters/` citations; no adapter
  TEST pins these — verified): `adapters/README.md` 8,10; `adapters/aider/README.md` 7,
  `adapters/aider/config.template.yml` 31, `adapters/aider/src/model-tier-map.js` 5;
  `adapters/antigravity/README.md` 7,62, `adapters/antigravity/config.template.json` 3,
  `adapters/antigravity/hooks/craft-guard.js` 24, `adapters/antigravity/src/antigravity-guard-adapter.js` 25,
  `adapters/antigravity/skills/craft-run/SKILL.md` 12; `adapters/cursor/README.md` 8.
- `examples/*` pointers at craft's OWN spec (clickable + prose): `examples/backlog-custom/workflow.md` 16,
  `examples/backlog-github-issues/README.md` 42, `examples/backlog-github-issues/workflow.md` 42
  (all `../../docs/adapters/backlog.md` → `../../docs/contributing/specs/backlog.md`).

**Clickable intra-`docs/` breaker (adapters rename):** `git grep -nE '\]\((\.\./)+adapters/' --
'docs/**'`. Rewrite `../adapters/` → `../specs/` where it now resolves under `contributing/`;
the guide files (`docs/GUIDE-*`, moved in Part 2) reference `adapters/*.md` — those are handled
in Part 2 when the guides move. Known clickable hit in the moved corpus: none survive that dangle
after the mv except cross-tree ones owned by Part 2. Prose backtick `docs/adapters/…` citations
inside `docs/contributing/{adr,design,plan,archive}/**` are Category-3 — **leave verbatim**.

**NOT load-bearing / synthetic — LEAVE:** `engine/test/{intention.test.js,intention-subjects.test.js,
glob.test.js,intention-lint-main.test.js}` use `docs/adapters/*` as **in-memory corpus keys /
glob-match inputs / temp-fixture paths** — they never read the real tree, stay green untouched,
and carry no operational meaning. Do not churn them.

`.claude/craft-memory.md:461` names `docs/adapters/telemetry.md` in a dated provenance entry —
**never touch** (ADR-288). `BACKLOG.md` `docs/adapters/*` hits (lines 15,40,53,106,132,159-ish,
237,392,445,476,516,525,567) are almost all dated "P## delivered" run-records — leave verbatim;
sweep ONLY a genuinely live/actionable open-item path if one is found (triage each at grep time).

### TDD steps
- RED: after the `git mv`, run the part gate. `test/living-corpus.test.js` fails
  (`deepStrictEqual`: script no longer emits the pinned `docs/adapters/*` set),
  `engine/test/intention-self-governance.test.js` fails (`ENOENT` reading the old `PAGE`),
  `test/p22-memory.test.js` fails (existence check on the vanished file). NOTE
  `test/source-hygiene.test.js` does NOT fail on the vanished path — its `grep` errors on the
  missing dir, `runGrep` swallows to empty, and the test passes VACUOUSLY (MEMORY: zero-match
  rules pass vacuously). Its real RED appears once you retarget `SCANNED_PATHS` to
  `docs/contributing/specs` but leave the allowlist regexes naming `docs/adapters/…`: the
  class-B scan then finds un-allowlisted `gh`/`github` hits in `specs/{vcs,backlog,telemetry}.md`
  → offenders → RED. So `SCANNED_PATHS` and the allowlist regexes MUST move together.
- GREEN: apply the full literal sweep above (SCANNED_PATHS + allowlist regexes in lockstep);
  re-pin `EXPECTED` by running `bash scripts/living-corpus.sh` and pasting its output into the `Set`.
- REFACTOR: `git grep -n 'docs/adapters' -- ':!.claude/craft-memory.md' ':!BACKLOG.md'` returns
  ZERO; confirm `git log --follow -- docs/contributing/specs/telemetry.md` traverses the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'` + `(cd engine && node --test 'test/**/*.test.js')`
+ `for a in aider antigravity cursor; do (cd adapters/$a && node --test 'test/**/*.test.js'); done`.
(Phase gate `bash scripts/ci.sh` with agent-binary stubs runs once after Part 9.)

### Commit
`docs: relocate adapter contract specs to docs/contributing/specs`

## Part 2 — Split end-user guides → docs/guides

### Context
Three moves (rename dropping `GUIDE-`): `git mv docs/GUIDE-concepts.md docs/guides/concepts.md`,
`git mv docs/GUIDE-customizing.md docs/guides/customizing.md`,
`git mv docs/model-class-matrix.md docs/guides/model-class-matrix.md` (`mkdir -p docs/guides`
first). `model-class-matrix.md` keeps its name; the two GUIDE files drop the prefix.

**Category-2 sweep.** Closure greps: `git grep -n -E 'docs/GUIDE-|docs/model-class-matrix' --
':!docs/contributing/' ':!.claude/craft-memory.md'`. Known hit list:
- `scripts/living-corpus.sh` — line 18 find clause: DELETE `-o -name 'GUIDE-customizing.md' -o
  -name 'GUIDE-concepts.md'` from the `find docs -maxdepth 1 (…)` group and ADD a new line
  `find docs/guides -maxdepth 1 \( -name 'concepts.md' -o -name 'customizing.md' \)`
  (NOT `-name '*.md'` — excludes `model-class-matrix.md`); header comment lines 3–4 update.
- `test/living-corpus.test.js` — `EXPECTED`: `docs/GUIDE-concepts.md`→`docs/guides/concepts.md`,
  `docs/GUIDE-customizing.md`→`docs/guides/customizing.md`. **Re-pin by running the script.**
- `scripts/ci.sh` line 63 comment `docs/GUIDE-customizing.md` → `docs/guides/customizing.md`.
- `test/source-hygiene.test.js` — `SCANNED_PATHS` line 20 `docs/GUIDE-customizing.md` →
  `docs/guides/customizing.md`; allowlist regex line 134 `docs\/GUIDE-customizing\.md:...file
  \/ gh \/` → `docs/guides/customizing.md` (keep it line-agnostic); comment line 131 updates.
- `test/p10-structure.test.js` — lines 180–181 `docs/GUIDE-customizing.md` → `docs/guides/customizing.md`
  (grep-for-`examples/loop/` content assertion; the guide file keeps that string).
- `skills/run/SKILL.md` — line 90 §1c-int prose `docs/GUIDE-customizing.md` →
  `docs/guides/customizing.md`; line 430 `docs/model-class-matrix.md` → `docs/guides/model-class-matrix.md`.
- `skills/prune/SKILL.md` — lines 45,71,93 `docs/model-class-matrix.md` → `docs/guides/model-class-matrix.md`.
- `README.md` — lines 52 & 201 `docs/GUIDE-concepts.md` → `docs/guides/concepts.md`; lines 146
  & 200 `docs/GUIDE-customizing.md` → `docs/guides/customizing.md`. (These README lines are NOT
  in the `readme-regions.test.js` pinned set — free to edit; do NOT touch the FAQ telemetry line.)
- `examples/README.md` 3,34,77 and `examples/named-config/{README.md:23,workflow.md:34}` —
  `docs/GUIDE-customizing.md` (various `../` depths) → `.../guides/customizing.md` at the same
  relative depth (e.g. `../docs/GUIDE-customizing.md` → `../docs/guides/customizing.md`).

**Guide files' OWN internal links (the guides sit one level DEEPER now — `docs/` → `docs/guides/`
— so `../` links and same-dir targets shift).** Grep: `git grep -nE '\]\(' -- docs/guides/`.
Rewrite in `docs/guides/concepts.md` and `docs/guides/customizing.md`:
- same-dir sibling: `[..](GUIDE-customizing.md)` → `[..](customizing.md)`, `[..](GUIDE-concepts.md)`
  → `[..](concepts.md)`.
- `[..](adapters/<port>.md)` (no `../`) → `[..](../contributing/specs/<port>.md)`;
  `[..](../adapters/README.md)` → `[..](../../adapters/README.md)` (repo-root `adapters/`, not the specs tree).
- `[..](DESIGN-customizable-engine.md)` / `[..](PRD-customizable-engine.md)` →
  `[..](../contributing/prd/DESIGN-customizable-engine.md)` (resp. `PRD-…`); `[..](adr/)` →
  `[..](../contributing/adr/)`.
- `[..](../README.md)` → `[..](../../README.md)`; `[..](../agents/…)`→`[..](../../agents/…)`;
  `[..](../scripts/…)`→`[..](../../scripts/…)`; `[..](../skills/…)`→`[..](../../skills/…)`
  (every `../<repo-dir>` becomes `../../<repo-dir>` because the file dropped one level deeper).
These targets need not exist yet when this part runs (Parts 1/3/4/7 supply `specs/ adr/ prd/`);
the standing link-check lands only in Part 9, by which time all targets exist.

### TDD steps
- RED: after the `git mv`, run the part gate. Genuine REDs: `test/living-corpus.test.js`
  (`deepStrictEqual` — script no longer emits the GUIDE paths) and `test/p10-structure.test.js`
  (`grepQ_plain('examples/loop/', docs/GUIDE-customizing.md)` → file missing → assert fails).
  `test/source-hygiene.test.js` again passes VACUOUSLY on the vanished `docs/GUIDE-customizing.md`
  file; its real RED appears when you retarget `SCANNED_PATHS` to `docs/guides/customizing.md`
  but leave the allowlist regex naming `docs/GUIDE-customizing.md` — the `file / gh /` hexagon
  label then scans un-allowlisted → offender. Move `SCANNED_PATHS` + that allowlist regex together.
- GREEN: apply the sweep + guide-file link rewrites; re-pin `EXPECTED` via the script.
- REFACTOR: `git grep -n -E 'docs/GUIDE-|docs/model-class-matrix' -- ':!.claude/craft-memory.md'
  ':!BACKLOG.md'` → ZERO; `git log --follow -- docs/guides/customizing.md` traverses the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'` + `(cd engine && node --test 'test/**/*.test.js')`.

### Commit
`docs: split end-user guides into docs/guides`

## Part 3 — Relocate ADRs → docs/contributing/adr

### Context
`git mv docs/adr docs/contributing/adr` (282 files). ADRs cross-link each other and
`../design/` — those are SIBLING links that auto-survive (both become children of
`contributing/`); their `../design/docs-audience-split.md` etc. keep resolving. No intra-ADR
link rewrite is required by the move (verify: `git grep -nE '\]\(\.\./(guides|adapters)/' --
docs/contributing/adr/` — expect none; any `../adapters/` hit → rewrite to `../specs/`).

**Category-2 sweep** (`docs/adr/` as craft's OWN tree, NOT the consumer default). Closure grep:
`git grep -nE '\]\(docs/adr/|\bdocs/adr/' -- README.md scripts/ci.sh`. Known hits:
- `README.md` line 119 `[270 ADRs](docs/adr/)` → `docs/contributing/adr/`; line 203
  `| [docs/adr/](docs/adr/) |` → `docs/contributing/adr/` (both occurrences on the line).
- `scripts/ci.sh` line 132 `run_prose_lint` excuse glob: `docs/adr/*` → `docs/contributing/adr/*`.
- `BACKLOG.md`: lines 9 (`*decisions:* docs/adr/`) and 163 (`docs/adr/`) — these are the live
  "where things live" legend/pointer → rewrite to `docs/contributing/adr/`. Leave dated entries.

**LEAVE (Category-1):** `skills/decisions/SKILL.md` lines 11 & 14 (`paths.adr` else `docs/adr/`
consumer default). **LEAVE (Category-3):** every `` `docs/adr/…` `` prose citation inside
`docs/contributing/{design,plan,archive,prd}/**` and `.claude/craft-memory.md`.

### TDD steps
- RED: no test pins the ADR tree location directly, so the part gate is green before edits;
  the RED here is the closure grep — `git grep '\]\(docs/adr/' README.md` still shows the old
  link. GREEN it by the sweep.
- GREEN: apply the README + ci.sh + BACKLOG-live sweep; move the tree.
- REFACTOR: `git grep -nE '\]\(docs/adr/' -- README.md` → ZERO; `git log --follow --
  docs/contributing/adr/283-docs-move-redirect-via-manifest-paths.md` traverses the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'`.

### Commit
`docs: relocate ADRs to docs/contributing/adr`

## Part 4 — Relocate design docs → docs/contributing/design

### Context
`git mv docs/design docs/contributing/design` (20 files, incl. THIS feature's design doc).
Sibling links to `../adr/ ../plan/ ../archive/` auto-survive. `../adapters/` links (if any) →
`../specs/` — grep `git grep -nE '\]\(\.\./adapters/' -- docs/contributing/design/`.

**Load-bearing ci.sh design-lint glob (critical — a broken glob = red gate, not a silent skip).**
`scripts/ci.sh` line 82: `for d in templates/design.md docs/design/*.md; do bash
scripts/design-lint.sh "$d" …`. After the move `docs/design/*.md` matches nothing and (nullglob
off) expands to the literal → `design-lint.sh` on a missing file → exit 2 → RED. Rewrite to
`docs/contributing/design/*.md`. This keeps THIS design doc (`docs-audience-split.md`, 6 headings
present) under the design-lint at its new home.

**Category-2 sweep.** Closure grep: `git grep -nE 'docs/design/' -- README.md scripts/ci.sh
templates/pr-body.md examples/ BACKLOG.md`. Known hits:
- `README.md` line 118 `[18 design docs](docs/design/)` → `docs/contributing/design/`.
- `scripts/ci.sh` line 132 excuse glob `docs/design/*` → `docs/contributing/design/*`.
- `templates/pr-body.md` line 36 `<docs/design/<slug>.md or none>` → `<docs/contributing/design/<slug>.md
  or none>` (design DC-swept; not a consumer default — craft's own PR-body template).
- `examples/deliberation-review/workflow.md` line 94 clickable
  `[…](../../docs/design/sp9-findings-adoption.md)` → `../../docs/contributing/design/sp9-findings-adoption.md`
  (points at craft's real design doc). No example TEST pins this string (verified).
- `BACKLOG.md` lines 130, 206, 407 name `docs/design/…` — line 130 (`docs/design/*.md in
  scripts/ci.sh`) is a live description of the ci.sh glob → rewrite to `docs/contributing/design/*.md`;
  206 & 407 cite specific design docs in dated "delivered" context → leave verbatim (triage each).

**LEAVE (Category-1):** `skills/design/SKILL.md:13` (`paths.design` else `docs/design/`).

### TDD steps
- RED: closure grep shows old `docs/design/` links; ci.sh line 82 still globs the old dir.
  (Root suite has no design-tree pin, so `node --test` alone is green pre-edit — the phase gate
  `ci.sh` is what would go red on the stale glob; prove the glob edit by running
  `bash scripts/design-lint.sh docs/contributing/design/docs-audience-split.md` → exit 0.)
- GREEN: move the tree; retarget the ci.sh glob + full literal sweep.
- REFACTOR: `git grep -nE '\]\(docs/design/|docs/design/\*' -- README.md scripts/ci.sh
  templates/pr-body.md examples/` → ZERO; `for d in docs/contributing/design/*.md; do bash
  scripts/design-lint.sh "$d"; done` all exit 0; `git log --follow --
  docs/contributing/design/docs-audience-split.md` traverses the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'`. Additionally run
`for d in templates/design.md docs/contributing/design/*.md; do bash scripts/design-lint.sh "$d"
|| exit 1; done` (mirrors the ci.sh line just edited).

### Commit
`docs: relocate design docs to docs/contributing/design`

## Part 5 — Relocate plan docs → docs/contributing/plan

### Context
`git mv docs/plan docs/contributing/plan` (19 files). **This includes THIS plan doc**
(`docs/plan/docs-audience-split.md` → `docs/contributing/plan/docs-audience-split.md`) — the
plan file rides its own migration; expected and coherent (`paths.plan` declared in Part 8 already
names `docs/contributing/plan`). Sibling links auto-survive; `../adapters/` (if any) → `../specs/`
(grep `git grep -nE '\]\(\.\./adapters/' -- docs/contributing/plan/`).

**Category-2 sweep.** Closure grep: `git grep -nE '\]\(docs/plan/|\bdocs/plan/' -- README.md
BACKLOG.md`. Known hits:
- `README.md` line 118 `[17 parted plans](docs/plan/)` → `docs/contributing/plan/`.
- `BACKLOG.md`: any live "where plans live" pointer → `docs/contributing/plan/`; dated
  references verbatim (triage; the corpus has few live `docs/plan/` pointers).
- No ci.sh excuse glob for `plan/` exists today (only adr/design/archive) — none to retarget
  here; `prd/` + `specs/` additions are owned by Parts 7 & 1.

**LEAVE (Category-1):** `skills/planning/SKILL.md:11` (`paths.plan` else `docs/plan/`).
**LEAVE (Category-3, lychee-invisible):** the `[27 telemetered runs](docs/metrics-baseline.report.json)`
quote inside `docs/plan/readme-drift-guards.md` sits inside a fenced/code block quoting the README
verbatim — lychee extracts ZERO links from that file (confirmed), so it is NOT a dangler and needs
no rewrite. `git mv` relocates it verbatim (ADR-288). (The design doc's copy is inside backticks —
same story.)

### TDD steps
- RED: closure grep shows the old README plan link. `node --test` is green pre-edit (no root
  test pins the plan tree).
- GREEN: move the tree; sweep README + BACKLOG-live.
- REFACTOR: `git grep -nE '\]\(docs/plan/' -- README.md` → ZERO; `git log --follow --
  docs/contributing/plan/docs-audience-split.md` traverses the rename (proves THIS plan doc kept
  history).

### Gate
Part gate: `node --test 'test/**/*.test.js'`.

### Commit
`docs: relocate plan docs to docs/contributing/plan`

## Part 6 — Relocate archive → docs/contributing/archive (retarget dated-doc lint scope)

### Context
`git mv docs/archive docs/contributing/archive` (50 files, incl. dated `SC5-*`, `SPIKE.md`,
`*-P<n>-*`). The **dated-doc rule** (`scripts/docs-structure-lint.sh`) requires those files under
`ARCHIVE_DIR="$DOCS_DIR/archive"`. Per design (ARCHIVE_DIR → `docs/contributing/archive`,
**fixtures unchanged**), do NOT edit the script's `ARCHIVE_DIR` line and do NOT touch the
fixtures — instead change the real-tree INVOCATION dir from `docs` to `docs/contributing`, so
`$DOCS_DIR/archive` resolves to `docs/contributing/archive` while fixtures (passed as `<fixture>`,
archive at `<fixture>/archive`) stay valid.
- `scripts/ci.sh` line 83: `bash scripts/docs-structure-lint.sh docs` → `… docs/contributing`.
- `test/docs-structure-lint.test.js` line 31–33 (`live docs/ tree passes …`): change the call
  `path.join(ROOT, 'docs')` → `path.join(ROOT, 'docs/contributing')`. (Fixture tests at lines
  12 & 16 are UNCHANGED — they exercise the rule in isolation.)
- No dated files land outside `docs/contributing/archive` (specs/adr/design/plan/prd/DOD names
  carry no `SC5-`/`SPIKE`/`-P<digit>-` token — verified), so the retargeted scan stays green.

**Category-2 sweep.** Closure grep: `git grep -nE 'docs/archive' -- README.md scripts/ci.sh
skills/ examples/ BACKLOG.md`. Known hits:
- `README.md` line 120 `[instantiation record](docs/archive/SC5-second-instantiation-record.md)`
  → `docs/contributing/archive/SC5-second-instantiation-record.md`.
- `scripts/ci.sh` line 132 excuse glob `docs/archive/*` → `docs/contributing/archive/*`.
- `skills/run/SKILL.md` lines 415 (`docs/archive/DESIGN-P6-execution-topology.md`), 432
  (`docs/archive/DESIGN-P13-nfr-hardening.md`), 457 (`docs/archive/SC5-second-instantiation-record.md`)
  → `docs/contributing/archive/…`.
- `examples/everything-claude-toolkit/workflow.md` line 35 `docs/archive/SPIKE.md` →
  `docs/contributing/archive/SPIKE.md`.
- `BACKLOG.md` line 9 (`*build scripts:* docs/archive/PLAN-*.md · *spikes:* docs/archive/SPIKE.md`)
  and 163 (`docs/archive/{DESIGN,PLAN}-P*.md`) — live legend pointers → `docs/contributing/archive/…`.

### TDD steps
- RED: do the `git mv` FIRST, then run the part gate. `test/docs-structure-lint.test.js`
  "live tree" test (still calling `docs-structure-lint.sh docs`) fails: the dated
  `SC5-*`/`SPIKE.md`/`*-P<n>-*` files now sit at `docs/contributing/archive`, outside
  `ARCHIVE_DIR=docs/archive`, so the scan reports them as violations (exit 2). That failure is
  the RED and proves the scope must retarget.
- GREEN: retarget the invocation dir `docs` → `docs/contributing` (ci.sh line 83 + the
  live-tree test call) so `$DOCS_DIR/archive` resolves to `docs/contributing/archive`; apply
  the literal sweep. (Fixtures stay at `docs/adapters`-era paths → unchanged.)
- REFACTOR: `bash scripts/docs-structure-lint.sh docs/contributing` exits 0; the two fixture
  tests still pass; `git grep -nE '\]\(docs/archive/|\bdocs/archive/' -- README.md skills/
  examples/ scripts/ci.sh` → ZERO; `git log --follow -- docs/contributing/archive/SPIKE.md`
  traverses the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'` (runs `docs-structure-lint.test.js`, incl. the
retargeted live-tree assertion + unchanged fixture tests).

### Commit
`docs: relocate archive to docs/contributing/archive`

## Part 7 — Relocate legacy PRD/DESIGN/PLAN/PR docs → docs/contributing/prd

### Context
Move the 14 stray top-level program docs into one tree: `mkdir -p docs/contributing/prd` then
`git mv` each of `docs/DESIGN-*.md` (5: `customizable-engine, history, nested-insert-fail-loud,
portable-named-configs, shrink-core-prune-guardrails`), `docs/PLAN-*.md` (3), `docs/PRD-*.md` (3),
`docs/PR-*.md` (3) → `docs/contributing/prd/` (names preserved). Their mutual sibling links
survive (all land together in `prd/`): e.g. `docs/DESIGN-history.md:2` `[…](DESIGN-customizable-engine.md)`
stays valid. Verify no outbound clickable breakers: `git grep -nE '\]\((\.\./|adr/|adapters/)' --
docs/contributing/prd/` (expect essentially none; rewrite any `../adapters/`→`../specs/`).

**living-corpus (DESIGN-* clause).** `scripts/living-corpus.sh` line 18: change the remaining
`find docs -maxdepth 1 \( -name 'DESIGN-*.md' \)` to `find docs/contributing/prd -maxdepth 1
-name 'DESIGN-*.md'` (only DESIGN-*, matching the original corpus scope; PLAN-*/PRD-*/PR- were
never corpus members). Header comment lines 3–4 update `docs/DESIGN-*.md` → `docs/contributing/prd/DESIGN-*.md`.
`test/living-corpus.test.js` — the 5 `docs/DESIGN-*.md` `EXPECTED` entries → `docs/contributing/prd/DESIGN-*.md`.
**Re-pin by running the script.** `scripts/ci.sh` line 63 comment + `skills/run/SKILL.md:90`
§1c-int prose `docs/DESIGN-*.md` → `docs/contributing/prd/DESIGN-*.md`.

**Category-2 sweep.** Closure grep: `git grep -nE 'docs/(DESIGN|PLAN|PRD|PR)-' -- ':!docs/contributing/'
':!.claude/craft-memory.md' ':!BACKLOG.md'`. Known hits beyond corpus:
- `README.md` line 202 `[DESIGN-customizable-engine.md](docs/DESIGN-customizable-engine.md)` →
  `docs/contributing/prd/DESIGN-customizable-engine.md`.
- `scripts/ci.sh` line 132 excuse glob: append `|docs/contributing/prd/*` (prd docs quote
  ban-list words; keep them excused, consistent-with-disk).
- `.claude/craft-memory.md` `file: docs/GUIDE-concepts.md` / `docs/design/...` dated entries —
  never touch. `BACKLOG.md` DESIGN/PLAN/PR references are dated run-records → leave verbatim
  (triage; these legacy program docs are historical).

### TDD steps
- RED: part gate before edits — `test/living-corpus.test.js` fails (script now enumerates
  `docs/contributing/prd/DESIGN-*.md`).
- GREEN: move the 14 files; rewrite the living-corpus DESIGN-* clause + README + ci.sh excuse
  glob + §1c-int prose; re-pin `EXPECTED` via the script.
- REFACTOR: `git grep -nE 'docs/(DESIGN|PLAN|PRD|PR)-' -- ':!docs/contributing/' ':!.claude/'
  ':!BACKLOG.md'` → ZERO; `git log --follow -- docs/contributing/prd/DESIGN-history.md` traverses
  the rename.

### Gate
Part gate: `node --test 'test/**/*.test.js'`.

### Commit
`docs: relocate legacy PRD/DESIGN/PLAN/PR docs to docs/contributing/prd`

## Part 8 — Relocate DOD + metrics; declare craft manifest paths overrides

### Context
Two top-level file moves + the manifest `paths:` block (ADR-283/289: block lands with the DOD
move because `paths.dod` is the only file-checked key). `git mv docs/DOD.md docs/contributing/DOD.md`
and `git mv docs/metrics-baseline.report.json docs/contributing/metrics-baseline.report.json`.

**Manifest `paths:` block** — add to `.claude/workflow.md` frontmatter (top level, sibling of
`phases:`):
```yaml
paths:
  design: docs/contributing/design
  adr: docs/contributing/adr
  plan: docs/contributing/plan
  dod: docs/contributing/DOD.md
```
`engine/src/manifest.js` `validatePaths` (lines 91–95) file-checks ONLY `paths.dod` (and parses
its DoD frontmatter via `readFile`); `design/adr/plan` are recognized-but-inert (accepted, not
validated). `docs/contributing/DOD.md` exists post-mv and its frontmatter opens at line 1
(preserved by `git mv`), so `manifest-lint` passes. `paths.requirements` is intentionally OMITTED
(craft ships no standalone requirements artifact). Adding a known `paths` key does NOT require a
README manifest-snippet change (`readme-drift` validates the snippet against the schema, not
against `.claude/workflow.md`).

**metrics literal + README telemetry (ADR-284) — move in lockstep:**
- `engine/src/readme-drift-main.js` line 103: `join(root, 'docs/metrics-baseline.report.json')`
  → `join(root, 'docs/contributing/metrics-baseline.report.json')`.
- `test/readme-drift.test.js`: line 14 `REPORT_PATH = path.join(ROOT,'docs','metrics-baseline.report.json')`
  → `path.join(ROOT,'docs','contributing','metrics-baseline.report.json')`; in `withMutatedCopy`
  (lines 41,45,49) the throwaway copy must mirror the new path — `fs.mkdirSync(path.join(tmpRoot,
  'docs','contributing'), {recursive:true})` and `reportPath: path.join(tmpRoot,'docs','contributing',
  'metrics-baseline.report.json')`.
- `README.md` line 119 `[raw telemetry for 27 runs](docs/metrics-baseline.report.json)` and line
  176 `[27 telemetered runs](docs/metrics-baseline.report.json)` → `docs/contributing/metrics-baseline.report.json`.
- `engine/test/readme-regions.test.js` `FAQ_SENTENCE` (lines 63 AND 224) pin the line-176 string
  — update both to the new path. (Line 176 is the pinned FAQ region; line 119 receipts line is NOT pinned.)

**DOD literal sweep.** Closure grep: `git grep -nE 'docs/DOD\.md' -- ':!docs/contributing/'
':!.claude/craft-memory.md' ':!examples/dod-artifact/' ':!examples/loop/'`. Known hits:
- `scripts/living-corpus.sh` line 18: remove `-o -name 'DOD.md'` from the `find docs -maxdepth 1`
  group; ADD `find docs/contributing -maxdepth 1 -name 'DOD.md'` (metrics `.json` is not `-name '*.md'`,
  auto-excluded). Header comment lines 3–4 update.
- `test/living-corpus.test.js` `EXPECTED`: `docs/DOD.md` → `docs/contributing/DOD.md`. **Re-pin via script.**
- `scripts/ci.sh` line 63 comment `docs/DOD.md` → `docs/contributing/DOD.md`.
- `test/source-hygiene.test.js` `SCANNED_PATHS` line 19 `docs/DOD.md` → `docs/contributing/DOD.md`.
- `test/p20-dod.test.js` — every `docs/DOD.md` (lines 11,13,18,20,21,26,29,39,44,49) →
  `docs/contributing/DOD.md`.
- `skills/run/SKILL.md:90` §1c-int prose `docs/DOD.md` → `docs/contributing/DOD.md`.
- `engine/src/dod.js:21` back-compat COMMENT `docs/DOD.md` → `docs/contributing/DOD.md` (comment
  only; `engine/src` is source-hygiene-scanned but this is a doc-path in a comment, no ban-list word).
- `BACKLOG.md` live legend pointers to `docs/DOD.md` (e.g. line 106 scope list) → `docs/contributing/DOD.md`;
  dated "P20 delivered" line 159 and other dated entries → leave verbatim (triage).

**LEAVE (Category-1 consumer defaults):** `skills/validation/SKILL.md` 12 & 16 (`paths.dod` else
`docs/DOD.md`); `examples/dod-artifact/workflow.md` 3,10,15,17 and `examples/loop/README.md:55`
(illustrate the `docs/DOD.md` consumer default — NOT craft's moved file). `test/init-emit.test.js` (root)
and `engine/test/{manifest.test.js,manifest-lint-main.test.js}` use `docs/DOD.md` as SYNTHETIC
inputs (pass-through / mocked `fileExists` / temp-root fixtures) — leave untouched. Guard: if the
part gate reveals any of these actually READS the real `docs/DOD.md` (vs a temp fixture), retarget
that one; the known set is synthetic.

### TDD steps
- RED: sequence the micro-steps so each has a real failure. (1) Add the `paths:` block BEFORE the
  DOD `git mv` → `node engine/bin/manifest-lint.js .claude/workflow.md` fails (`paths.dod
  references missing file: docs/contributing/DOD.md`). (2) After the metrics `git mv`,
  `test/readme-drift.test.js` live-tree test fails (`main.js` `readFileSync` throws on the
  vanished report). (3) After the DOD `git mv`, `test/living-corpus.test.js` (`deepStrictEqual`)
  and `test/p20-dod.test.js` (existence + `grep` on the real DOD) fail. NOTE
  `test/source-hygiene.test.js`'s `docs/DOD.md` entry passes VACUOUSLY on the vanished path
  (DOD carries no ban-list word) — retarget `SCANNED_PATHS` to keep the scan covering the moved
  file, not for a RED. `engine/test/readme-regions.test.js` `FAQ_SENTENCE` does NOT fail on the
  mv (README text unchanged); it goes RED only transiently if you edit the README line but not
  the pin — edit both together.
- GREEN: move both files; add the `paths:` block; retarget the readme-drift literal + both test
  pins + README lines; sweep DOD literals; re-pin living-corpus `EXPECTED` via the script.
- REFACTOR: `node engine/bin/manifest-lint.js .claude/workflow.md` exits 0; `git grep -nE
  'docs/DOD\.md|docs/metrics-baseline' -- ':!docs/contributing/' ':!.claude/craft-memory.md'
  ':!examples/dod-artifact/' ':!examples/loop/' ':!*/manifest*.test.js' ':!*/init-emit.test.js'`
  → ZERO; `git log --follow -- docs/contributing/DOD.md` and `… metrics-baseline.report.json`
  traverse their renames.

### Gate
Part gate: `node --test 'test/**/*.test.js'` + `(cd engine && node --test 'test/**/*.test.js')`.
Additionally run `node engine/bin/manifest-lint.js .claude/workflow.md` (exit 0).

### Commit
`docs: relocate DOD and metrics under docs/contributing, add manifest paths`

## Part 9 — Capstone: router READMEs, top-level audience guard, link-check confirmation, history pins

### Context
After Parts 1–8 the `docs/` top level holds ONLY `guides/` and `contributing/` (all 19 stray
files and every subtree moved). This part makes the shape a **loud invariant**, adds the two
router pages, wires the history spot-asserts, and confirms link health. It is the ONLY part
allowed to activate the top-level allowlist (ADR-286 sequencing: the fence can pass only once the
top level is clean).

**A. Router pages (new; ban-list-clean — they are touched, un-excused `*.md`, so `run_prose_lint`
scans them).**
- `docs/README.md`: routes readers — "using craft → `guides/`; contributing to craft →
  `contributing/`". Keep it short, link `guides/` and `contributing/README.md`. This file's
  existence satisfies requirement 4 (the only tracked file directly under `docs/`).
- `docs/contributing/README.md`: one-screen map of the subtrees (`adr/ design/ plan/ specs/
  archive/ prd/`, `DOD.md`, `metrics-baseline.report.json`). Note `specs/` holds contract specs
  AND `*-poc-record.md` together.
- Author both with NO ban-list words (avoid `stryker/mutation/gh/github/…`); verify with
  `node engine/bin/prose-lint.js --gate blocking -- docs/README.md docs/contributing/README.md`
  (exit 0) — belt-and-suspenders even though the live posture is advisory.

**B. Audience allowlist rule — extend `scripts/docs-structure-lint.sh` (ADR-286).** Add a
`--audience <dir>` mode: enumerate the TRACKED entries immediately under `<dir>` and exit 2
listing any not in `{README.md, guides, contributing}`. Robust recipe (handles abs/rel `<dir>`
and ignores the untracked `docs/.DS_Store` because `git ls-files` is tracked-only): normalize to
a repo-relative base — `root="$(git rev-parse --show-toplevel)"; rel="$(cd "$dir" && pwd)";
rel="${rel#"$root"/}"` — then `git -C "$root" ls-files -- "$rel" | sed -E "s#^${rel}/##" | cut
-d/ -f1 | sort -u`. Have the TEST invoke fixtures by repo-relative path so prefixes line up.
Default (no flag) keeps running ONLY the dated-doc check on `<dir>` (fixtures unchanged; Part 6
already routes the real dated-doc scan to `docs/contributing`). Wire into `scripts/ci.sh`
(after line 83): add `bash scripts/docs-structure-lint.sh --audience docs`.
- `test/docs-structure-lint.test.js`: add (a) NEW audience-good fixture
  `test/fixtures/docs-audience-good/` (tracked `README.md` + `guides/.gitkeep` +
  `contributing/.gitkeep`) → `--audience` exits 0; (b) audience-stray-file fixture (+`STRAY.md`)
  → exit 2 naming `STRAY.md`; (c) audience-stray-dir fixture (+`extra/.gitkeep`) → exit 2 naming
  `extra`; (d) POSITIVE-PIN the live tree: `--audience docs` exits 0 AND assert the tracked
  top-level set equals exactly `{README.md, guides, contributing}` (so the rule cannot pass
  vacuously — MEMORY: zero-match rules pass vacuously). NOTE fixtures must be git-tracked for
  `git ls-files` to see them; commit `.gitkeep` placeholders.

**C. Link-check confirmation (ADR-287; requirement 12) — PLANNER DECISION: reuse the existing
lychee `links` job, do NOT add a second checker.** The standing invariant ADR-287 mandates
("resolves relative markdown link targets, fails on danglers, green day one, loud on new dangler")
is ALREADY provided by the pre-existing `links` job in `.github/workflows/ci.yml` (lychee, FILE-
relative, `--include-fragments`, `--offline`, `fail: true`, repo-wide `./**/*.md`). It is green
today (zero real danglers) and stays the enforcement. A bash `docs/**`-scoped reimplementation
would violate DRY, cover less (no fragments), and could diverge on resolution — so it is NOT
built (this reconciles ADR-287 with the discovered mechanism; the "add a link-check" wording is
satisfied by the check that already exists). `ci.sh` does not run lychee, so this part CLOSES the
early-detection gap by running it once on the final tree as a REFACTOR step:
`lychee --offline --include-fragments --no-progress './**/*.md'` → **0 Errors**. Any error means
an earlier part left a clickable breaker un-swept — fix that part's sweep (DC5 rejects shipping
broken links), do not baseline it.

**D. History spot-asserts (requirement 5) — `test/docs-history.test.js` + a CI checkout fix.**
The `ci` job's `actions/checkout@v4` in `.github/workflows/ci.yml` (the step that runs
`bash scripts/ci.sh`, which runs this test) uses the DEFAULT shallow (`fetch-depth: 1`) clone —
`git log --follow` across renames needs full history. Add `with:\n  fetch-depth: 0` to THAT
checkout (line ~14; leave the `readme-drift`/`links` job checkouts as-is). No guard pins
`ci.yml`, so this edit is safe. The test: for one representative file per moved tree, run
`git log --follow --name-only --format='' -- <new-path>` and assert the output includes the OLD
path string (proving the rename was `git mv`, not delete+add). Representatives:
`docs/contributing/specs/telemetry.md`←`docs/adapters/telemetry.md`;
`docs/guides/customizing.md`←`docs/GUIDE-customizing.md`;
`docs/contributing/adr/283-docs-move-redirect-via-manifest-paths.md`←`docs/adr/…`;
`docs/contributing/design/docs-audience-split.md`←`docs/design/…`;
`docs/contributing/plan/docs-audience-split.md`←`docs/plan/…`;
`docs/contributing/archive/SPIKE.md`←`docs/archive/SPIKE.md`;
`docs/contributing/prd/DESIGN-history.md`←`docs/DESIGN-history.md`;
`docs/contributing/DOD.md`←`docs/DOD.md`.

No `src/` production code changes here; the new surfaces are two READMEs + the `--audience`
extension to one existing shell script + fixtures/tests + one `ci.yml` line, all gated by
`ci.sh`+`shellcheck`+their own tests (no barrel/API-report to pre-pay).

### TDD steps
- RED: write the new `test/docs-structure-lint.test.js` audience cases and `test/docs-history.test.js`
  FIRST. They fail: the `--audience` mode is unimplemented (unknown flag), and the history test
  fails if any move used delete+add (or if the checkout is shallow — hence the `fetch-depth: 0`
  fix). Each RED names its missing capability.
- GREEN: create `docs/README.md` + `docs/contributing/README.md` (ban-list-clean); add the
  `--audience` mode to `docs-structure-lint.sh` + wire `docs-structure-lint.sh --audience docs`
  into `ci.sh`; add the three audience fixtures (commit `.gitkeep`); implement the history test;
  add `fetch-depth: 0` to the `ci` job checkout in `.github/workflows/ci.yml`.
- REFACTOR: `bash scripts/docs-structure-lint.sh --audience docs` exit 0; `shellcheck
  scripts/docs-structure-lint.sh` clean; the top-level check `git ls-files docs | …` confirms
  exactly `{README.md, guides, contributing}`; run `lychee --offline --include-fragments
  --no-progress './**/*.md'` → **0 Errors** (final-tree link confirmation, item C); confirm
  `node engine/bin/prose-lint.js --gate blocking -- docs/README.md docs/contributing/README.md`
  exits 0.

### Gate
Part gate: `node --test 'test/**/*.test.js'` + `(cd engine && node --test 'test/**/*.test.js')`.
Additionally: `bash scripts/docs-structure-lint.sh --audience docs`, `shellcheck scripts/*.sh`,
and the final-tree `lychee … './**/*.md'` → 0 Errors (all exit 0).

**Phase-boundary gate (after this part):** stub agent binaries (see Gate conventions), then
`bash scripts/ci.sh` — must be fully green: `run_suite` ×9, `run_intention_lint` (living corpus
enumerates the moved pages), `design-lint` over `docs/contributing/design/*.md`,
`docs-structure-lint` (dated on `docs/contributing`, audience on `docs`), `manifest-lint`/
`readme-drift`, and both advisory hygiene lints. (The lychee `links` job runs in GitHub CI, not
`ci.sh`; the item-C REFACTOR run stands in for it locally.)

### Commit
`feat(docs): audience-split top-level guard, router READMEs, history pins`
