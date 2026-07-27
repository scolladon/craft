# Design — docs-audience-split

> Brief: restructure `docs/` into an audience-based split — end-user `docs/guides/` vs contributor `docs/contributing/` — via `git mv`, keeping pipeline-written paths working through consumer-manifest `paths.*` overrides and every CI guard green.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What `docs/` is today

The tree mixes two audiences at one level. Top-level (19 files): `GUIDE-concepts.md`,
`GUIDE-customizing.md`, `model-class-matrix.md` (end-user), `DOD.md`,
`metrics-baseline.report.json`, five `DESIGN-*.md`, three `PLAN-*.md`, three `PRD-*.md`,
three `PR-*.md` (contributor/legacy). Plus subtrees `adr/` (282 files), `archive/` (50),
`design/` (20), `plan/` (19), `adapters/` (16 — contract specs `execution.md`, `gate.md`,
`intention.md`, `memory.md`, `model.md`, `policy.md`, `telemetry.md`, `vcs.md`,
`backlog.md`, plus seven `*-poc-record.md`). An untracked `docs/.DS_Store` exists but is
not a move subject.

### How doc paths are resolved (two independent layers)

1. **Consumer-facing skill defaults.** Phase skills probe a manifest `paths.*` key and
   fall back to a `docs/*` default: `skills/design/SKILL.md` → `paths.design` else
   `docs/design/`; `skills/decisions/SKILL.md` → `paths.adr` else `docs/adr/`;
   `skills/planning/SKILL.md` → `paths.plan` else `docs/plan/`;
   `skills/requirements/SKILL.md` → `paths.requirements` else `docs/requirements/`;
   `skills/validation/SKILL.md` → `paths.dod` else `docs/DOD.md`. These defaults are what a
   *fresh consumer repo* gets; they are not craft-specific.
2. **Engine acceptance.** `engine/src/manifest.js` `validateManifest` accepts a `paths`
   sub-object; `validatePaths` file-checks only `paths.dod` — `paths.design/adr/plan/
   requirements` are recognised but inert (no validation, no default injection). The init
   emitter (`engine/test/init-emit.test.js`) is pure pass-through: whatever path you hand it
   is written back verbatim. **The engine hardcodes no craft-specific doc path.**

The consequence: moving craft's own docs does **not** require changing engine code or
shipped skill defaults. It requires (a) craft's own manifest to declare `paths.*` overrides,
and (b) a precise literal sweep of craft-repo-internal references that name craft's own tree.

### Craft-repo-internal infrastructure that hardcodes craft's own doc tree

These are load-bearing (CI or runtime breaks if the on-disk tree moves and they do not):

- `scripts/living-corpus.sh` — the single source of truth for the intention living corpus.
  Globs `docs/adapters/*.md`, `docs/{DESIGN-*,DOD,GUIDE-customizing,GUIDE-concepts}.md`,
  plus `BACKLOG.md`. Zero-file enumeration is a hard error (`exit 1`).
- `test/living-corpus.test.js` — pins the corpus as an exact `EXPECTED` set of 25 literal
  paths; any move that is not mirrored here fails `deepStrictEqual`.
- `test/source-hygiene.test.js` — `SCANNED_PATHS` hardcodes `docs/adapters`, `docs/DOD.md`,
  `docs/GUIDE-customizing.md`; allowlist filters name `docs/adapters/{pi-poc-record,vcs,
  backlog,telemetry}.md` and `docs/GUIDE-customizing.md` (line-agnostic regexes).
- `engine/src/readme-drift-main.js` — `telemetryFindings` hardcodes the literal
  `join(root, 'docs/metrics-baseline.report.json')` (~line 103). `test/readme-drift.test.js`
  and `engine/test/readme-regions.test.js` pin the exact README string
  `[27 telemetered runs](docs/metrics-baseline.report.json)`.
- `scripts/docs-structure-lint.sh` + `test/docs-structure-lint.test.js` — enforce "dated
  docs (`*-P<n>-*`, `SC5-*`, `SPIKE.md`) only under `docs/archive/`". Includes a "live
  `docs/` tree passes" assertion that runs the lint over the real tree.
- `test/p10-structure.test.js` — asserts `docs/GUIDE-customizing.md` references
  `examples/loop/`.
- Engine intention tests (`engine/test/intention-subjects.test.js`,
  `intention-self-governance.test.js`, `glob.test.js`, `intention-lint-main.test.js`,
  `intention.test.js`, `dod.test.js`) — enumerate/pin corpus paths under `docs/adapters`,
  `docs/DESIGN-*`, `docs/DOD.md`.
- **Skill spec-pointers** — `skills/*/SKILL.md` cite craft's *own* port specs as
  `docs/adapters/<port>.md` (e.g. `skills/run/SKILL.md` "see `docs/adapters/memory.md`",
  "see `docs/adapters/intention.md`", "see `docs/adapters/execution.md`", …;
  `skills/{propose,documentation,integrate,workspace,decisions,validation,metrics,prune}/
  SKILL.md`). These are read at runtime relative to `CRAFT_ROOT`, so the literal must track
  the file's real location.
- **Adapter authored surfaces** — `adapters/README.md`, `adapters/{aider,cursor,
  antigravity}/README.md`, config templates, `adapters/antigravity/skills/craft-run/SKILL.md`,
  and adapter `src` cite `docs/adapters/*-poc-record.md` / `../docs/adapters/`.
- `README.md` — links to `docs/GUIDE-*`, `docs/DOD.md`, `docs/metrics-baseline.report.json`,
  `docs/archive`, `docs/model-class-matrix.md`; guarded by readme-drift + readme-regions.
- `.claude/workflow.md` — craft's own manifest. Currently declares only
  `phases.validation.harness`; **no `paths.*` block yet.**

### Non-load-bearing references (historical / machine-maintained)

`docs/adr/**`, `docs/design/**`, `docs/archive/**` and the legacy top-level `DESIGN-*/PLAN-*/
PRD-*/PR-*` files cross-reference each other and `docs/adapters/…`. `BACKLOG.md` and
`.claude/craft-memory.md` carry historical path strings. Whether to rewrite these is DC6/DC5.

### The hygiene gate is advisory — but its excuse globs go stale on move

`ci.sh` resolves the hygiene posture from `.claude/workflow.md`; craft declares no `hygiene`
key, so it resolves to the `advisory` default (`engine/src/hygiene-gate-main.js`
`DEFAULT_GATE`). Under `advisory`, `run_prose_lint` reports but does not fail — so relocating
the historical docs (all *touched* by the rename, all quoting ban-list words) produces
advisory noise, **not** a red gate today. Two consequences the migration must handle: (a)
`run_prose_lint`'s excuse globs `docs/adr/*|docs/design/*|docs/archive/*` name the *old*
locations — after the move they match nothing, so the moved historical docs fall out of the
excuse and a future `hygiene: gate: blocking` flip would turn them into hard failures; the
globs must be rewritten to `docs/contributing/{adr,design,archive}/*` (and extended to
`prd/` + `specs/`, which likewise quote ban-list words). (b) The two new `README.md` router
pages are touched `*.md` under *no* excused dir, so they are prose-linted — they must be
ban-list-clean.

### Constraints (binding)

- All moves via `git mv` (history preserved).
- Full suite (`engine/test`, seven `adapters/*/test`, root `test/`) + CI drift guards stay
  green — per craft's per-part gating, **every part** is green, not just the endpoint.
- Adapter agent bodies (`adapters/<v>/agents/craft-<role>.md`) are byte-identical to shared
  `agents/<role>.md` (`adapters/*/test/native-surface.test.js`). Shared `agents/*.md` bodies
  carry **no** `docs/` path (verified) — so this feature triggers no agent-body sweep; the
  adapter sweep is confined to per-adapter *authored* surfaces (READMEs, configs, entrypoint
  skill). Any future swept string inside a *shared* body would need all-mirror sync.
- `engine/src/dod.js`: DoD frontmatter opens at **line 1 only**. `git mv` preserves content,
  so `DOD.md`'s frontmatter stays valid after the move.
- Vendor-binding location contract (ADR-191) is unaffected — no vendor-suffixed source moves.
- The target structure is **user-decided**; this doc designs the migration, not the shape.

## Requirements

When this ships:

1. `docs/README.md` exists and routes: "using craft → `guides/`; contributing → `contributing/`".
2. End-user tree `docs/guides/` holds `concepts.md` (from `GUIDE-concepts.md`),
   `customizing.md` (from `GUIDE-customizing.md`), `model-class-matrix.md`.
3. Contributor tree `docs/contributing/` holds `README.md` (explains the subtrees), `adr/`,
   `design/`, `plan/`, `specs/` (from `adapters/`), `archive/`, `prd/` (absorbs the stray
   top-level `DESIGN-*/PLAN-*/PRD-*/PR-*`), `DOD.md`, `metrics-baseline.report.json`.
4. No tracked file remains directly under `docs/` except `docs/README.md`; no top-level
   `docs/` subdir exists except `guides/` and `contributing/`.
5. Every move preserves git history (`git log --follow` traverses the rename).
6. Craft's `.claude/workflow.md` declares `paths.design`, `paths.adr`, `paths.plan`,
   `paths.dod` pointing at the `contributing/` locations; `manifest-lint.sh` passes.
7. A future `/craft:design` (etc.) run on craft writes its artifact under
   `docs/contributing/design/` (resp. adr/plan/DOD) via those overrides.
8. Every runtime skill spec-pointer resolves to the file's real new location.
9. The intention living corpus enumerates the moved pages (no zero-file error, no stale
   path); `living-corpus.sh` and its pinned test agree.
10. `readme-drift`, `living-corpus`, `source-hygiene`, `docs-structure-lint`, `design-lint`,
    `intention-lint`, `p10-structure`, `readme-regions`, and all adapter `native-surface`
    guards pass.
11. A guard fails loud if a new stray file appears directly under `docs/` or a new top-level
    `docs/` subdir is introduced.
12. No dangling intra-`docs/` link remains after the sweep (verification per DC5).

## Design

### Move map (authoritative old → new)

| Old | New | Kind |
|---|---|---|
| `docs/GUIDE-concepts.md` | `docs/guides/concepts.md` | move + rename (drop `GUIDE-`) |
| `docs/GUIDE-customizing.md` | `docs/guides/customizing.md` | move + rename |
| `docs/model-class-matrix.md` | `docs/guides/model-class-matrix.md` | move |
| `docs/adapters/` (all 16) | `docs/contributing/specs/` | move + dir rename |
| `docs/adr/` (282) | `docs/contributing/adr/` | move |
| `docs/design/` (20) | `docs/contributing/design/` | move |
| `docs/plan/` (19) | `docs/contributing/plan/` | move |
| `docs/archive/` (50) | `docs/contributing/archive/` | move |
| `docs/DOD.md` | `docs/contributing/DOD.md` | move |
| `docs/metrics-baseline.report.json` | `docs/contributing/metrics-baseline.report.json` | move |
| `docs/DESIGN-*.md` (5, incl. `DESIGN-history.md`) | `docs/contributing/prd/` | move |
| `docs/PLAN-*.md` (3) | `docs/contributing/prd/` | move |
| `docs/PRD-*.md` (3) | `docs/contributing/prd/` | move |
| `docs/PR-*.md` (3) | `docs/contributing/prd/` | move |
| — | `docs/README.md` (new) | create |
| — | `docs/contributing/README.md` (new) | create |

`specs/` holds contract specs **and** `*-poc-record.md` together — the target structure
names it "contract specs + poc records"; splitting `records/` would change the decided shape
and is therefore not designed here.

### Reference-handling model (three categories)

**Category 1 — consumer-facing skill defaults: UNCHANGED.** `docs/design/`, `docs/adr/`,
`docs/plan/`, `docs/requirements/`, `docs/DOD.md` in `skills/{design,decisions,planning,
requirements,validation}/SKILL.md` stay as the shipped fallback. Rationale: these are the
right defaults for an arbitrary consumer repo; craft redirects itself via its own manifest
(Category "manifest" below), not by churning every consumer's default.

**Category 2 — craft-repo-internal load-bearing literals: SWEPT precisely.** The exhaustive
set (verify against `git grep` at implementation time, do not trust this list as closed):

- `scripts/living-corpus.sh` glob paths + `test/living-corpus.test.js` `EXPECTED` set.
- `test/source-hygiene.test.js` `SCANNED_PATHS` + allowlist regexes (`docs/adapters/*` →
  `docs/contributing/specs/*`; `docs/DOD.md` → `docs/contributing/DOD.md`;
  `docs/GUIDE-customizing.md` → `docs/guides/customizing.md`).
- `engine/src/readme-drift-main.js` metrics literal (DC2) + `README.md` metrics link string
  + `test/readme-drift.test.js` + `engine/test/readme-regions.test.js` pinned strings.
- `scripts/docs-structure-lint.sh` (`ARCHIVE_DIR` now `docs/contributing/archive`) +
  `test/docs-structure-lint.test.js` "live tree" assertion.
- `scripts/ci.sh` `run_prose_lint` excuse globs (`docs/adr/*|docs/design/*|docs/archive/*` →
  `docs/contributing/{adr,design,archive}/*`, + `prd/` + `specs/`) — noise-hygiene under the
  current advisory posture, load-bearing under a `blocking` flip.
- `test/p10-structure.test.js` (`docs/GUIDE-customizing.md` → `docs/guides/customizing.md`).
- Engine intention tests enumerating corpus paths (sweep in lockstep with `living-corpus.sh`).
- Skill spec-pointers: every `docs/adapters/<port>.md` → `docs/contributing/specs/<port>.md`
  across `skills/*/SKILL.md`, including the runtime `CRAFT_ROOT`-relative reads (not a
  decision — folded into the sweep; these must be correct or the running skill cites a
  missing file).
- Skill guide/DOD/metrics/matrix/archive pointers (`skills/run`, `skills/prune`,
  `skills/metrics`, `skills/integrate`, `skills/validation`).
- Adapter authored surfaces: `adapters/README.md`, `adapters/{aider,cursor,antigravity}/
  README.md`, config templates, `adapters/antigravity/skills/craft-run/SKILL.md`, adapter
  `src` citing `docs/adapters/*-poc-record.md`.
- `README.md` links to `docs/GUIDE-*`, `docs/DOD.md`, `docs/archive`, `docs/model-class-matrix.md`.
- `templates/pr-body.md` (`docs/design/<slug>.md` → `docs/contributing/design/<slug>.md`).
- `examples/**` — `examples/*/workflow.md` + example READMEs cite `docs/{GUIDE-*,DOD.md,
  archive,adapters,design}`. Triage each at `git grep` time: a pointer at craft's *own* doc
  (sweep) vs an illustration of a *consumer* default like `docs/design/` (leave). Example
  guards (`test/examples-lint.test.js`, `named-config-example.test.js`,
  `examples-deliberation-review.test.js`) may pin some strings — update those in lockstep.

**Category 3 — historical/machine-maintained: policy per DC5/DC6.** Intra-`docs/` cross-links
in `adr/**`, `design/**`, `archive/**`, moved `prd/**`; `BACKLOG.md`; `.claude/craft-memory.md`.

**Craft manifest overrides** (`.claude/workflow.md`, new `paths:` block):

```yaml
paths:
  design: docs/contributing/design
  adr: docs/contributing/adr
  plan: docs/contributing/plan
  dod: docs/contributing/DOD.md
```

`paths.dod` is the only key `validatePaths` file-checks — so the referenced file must exist
when `manifest-lint.sh` runs (it will, post-move). `paths.requirements` is intentionally
omitted: craft self-supplies requirements inside design docs and produces no standalone
requirements artifact today; if craft ever enables the requirements phase, the audience-split
guard's allowlist (below) must admit whatever `paths.requirements` names (see Out of scope).

### Intra-`docs/` link mechanics (informs DC5)

Sibling relative links survive the moves that preserve sibling offset: `adr/`, `design/`,
`plan/`, `archive/` all become children of `contributing/`, so an ADR's `../design/foo.md`
resolves before and after. The breakers are (a) the `adapters/` → `specs/` **rename** — any
`…/adapters/…` link dangles; (b) the `GUIDE-*` → `guides/` cross-tree move (leaves
`contributing/` for a sibling of it); (c) `DOD.md`/`metrics` filename+tree change; and (d)
every root-relative `docs/…` absolute link. The sweep and DC5 target exactly these.

### New audience-split guard (informs DC4)

Extend `scripts/docs-structure-lint.sh` (keeps one docs lint, one test) to also assert the
top-level shape: the only tracked entry directly under `docs/` is `README.md`; the only
subdirectories are `guides/` and `contributing/`. Implementation shape — after the existing
dated-doc check, enumerate `find docs -maxdepth 1` (tracked only, via `git ls-files` to
ignore `.DS_Store`) and fail listing any entry not in `{README.md, guides, contributing}`.
This is the loud regression fence for requirement 11: a future stray `docs/FOO.md` or
`docs/newdir/` trips it. Positive-pin the invariant in the test (assert the good tree has
exactly those three entries) so the rule cannot pass vacuously.

**Sequencing constraint:** the top-level-allowlist rule (and its live-tree assertion) can
only be *activated* once the top level is clean — i.e. in the **final** migration part, after
every tree has moved. Adding it earlier would make each intermediate part fail its own new
guard, since the not-yet-moved trees (`adr/`, `DOD.md`, `GUIDE-*`, …) still sit at the top
level. The dated-doc rule's `ARCHIVE_DIR` retarget, by contrast, moves with the archive part.

### Error semantics / edge behaviour

- `living-corpus.sh` still hard-errors on zero enumeration; after the sweep it enumerates the
  moved corpus, so a *silent* miss (glob updated for one tree, file physically still in the
  old place) surfaces as the pinned-set `deepStrictEqual` failure, not a false green.
- `git mv` of a whole directory is atomic per part; a half-moved tree cannot be committed
  because the moving part also updates that tree's guard in the same commit.
- `.DS_Store` is untracked → excluded from every `git ls-files`-based guard; the new lint
  must scan tracked entries only, or it would false-positive on developer junk.

## Decision candidates

<!-- Every load-bearing choice not pre-decided by the target structure. The user decides
     these in the ADR phase; the recommendations are the designer's, not decisions. -->

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where craft redirects its moved trees | (a) craft `.claude/workflow.md` declares `paths.*` overrides + leave shipped skill `docs/*` defaults unchanged; (b) change the engine/skill defaults to the new `contributing/` paths (affects every consumer); (c) hybrid — change defaults for craft-shaped trees, override the rest | **(a)** | Skill defaults are sensible for arbitrary consumers; craft is just another consumer and should redirect via its own manifest. (b) churns every downstream repo for craft's private reorg. |
| 2 | `readme-drift-main.js` metrics path | (a) update the hardcoded literal to `docs/contributing/metrics-baseline.report.json`; (b) make it manifest-configurable (`paths.metrics` or similar) then set it; (c) keep the file at `docs/` top level as an exception | **(a)** | It is a single craft-internal artifact read by a craft-internal guard, not a consumer knob; a literal update is minimal and honest. (b) invents config for one caller; (c) violates requirement 4. |
| 3 | Intention living-corpus after the move | (a) update the default glob list at its homes — `scripts/living-corpus.sh` + `skills/run/SKILL.md` §1c-int (+ any engine-level intention-corpus default the consult uses) — to the new paths (`docs/contributing/specs/*.md`, `docs/contributing/prd/DESIGN-*.md`, `docs/contributing/DOD.md`, `docs/guides/customizing.md`, `docs/guides/concepts.md`); (b) add an explicit `intention:` manifest key to craft's `.claude/workflow.md`; (c) drop the moved `DESIGN-*` legacy docs from the corpus, keep only specs+DOD+guides | **(a)** | The zero-config corpus is craft-shaped already; updating the script + the §1c-int prose keeps CI and runtime aligned with no new manifest surface. `intention.ref` (source `file`) is a single file-ref, not a glob list, so (b) does not cleanly express the multi-glob corpus. (c) silently narrows governance coverage. |
| 4 | The stray-file regression fence | (a) extend `scripts/docs-structure-lint.sh` + its test to also enforce the top-level allowlist; (b) add a new dedicated `docs-audience-lint.sh` + test; (c) enforce via a `test/*.test.js` assertion only (no shell lint) | **(a)** | One docs-structure lint, one fixture pair, one CI wiring — the dated-doc rule and the audience-shape rule are the same concern (docs/ tree structure). (b) doubles the surface; (c) skips the shell/`shellcheck` + fixture pattern the repo already uses. |
| 5 | Intra-`docs/` cross-reference sweep + verification | (a) mechanically rewrite the breakers (`adapters`→`specs`, `GUIDE-*`→`guides/`, `DOD`/`metrics`, all root-relative `docs/…`) across `docs/**` and add a link-check step (resolve every relative md link under `docs/`, fail on dangling); (b) rewrite breakers but verify by one-shot `git grep` audit, no standing link-check; (c) sweep only load-bearing refs, leave historical docs' internal links dangling | **(a)** | Sibling links survive the moves, so the rewrite is bounded to the named breakers; a standing link-check turns "no dangling link" (requirement 12) into an enforced invariant, not a one-time promise. (b) leaves future regressions unguarded; (c) knowingly ships broken links in the corpus. |
| 6 | `BACKLOG.md` + `.claude/craft-memory.md` historical path strings | (a) rewrite live/actionable path strings, leave dated run-memory history verbatim; (b) rewrite all occurrences everywhere; (c) leave both untouched | **(a)** | `BACKLOG.md` open items should point at real files; `.claude/craft-memory.md` is machine-maintained run history where old paths are accurate *as-of-then* — rewriting fabricates history. (b) corrupts the ledger; (c) leaves live backlog links dangling. |
| 7 | Migration parting / commit strategy | (a) one part per moved tree — each `git mv` + its load-bearing sweep + its guard update in one green commit, with the top-level-allowlist guard activated in a final part; (b) single atomic commit for all moves+sweeps; (c) moves-first commit, then a sweep commit | **(a)** | Matches craft's per-part gating and keeps each diff reviewable and independently green; shared files (`living-corpus.sh`, `docs-structure-lint.sh`, `README.md`) are edited incrementally but left consistent-with-disk at every part boundary, and the stray-file fence lands last (once the top level is clean). (b) is one unreviewable mega-diff; (c) is red between the two commits (guards reference moved files), violating the never-red-gate rule. |

## Test strategy

**Per-part green (the gate).** Each part runs `bash scripts/ci.sh` equivalent to green
before commit: `run_suite` over `engine/test`, all seven `adapters/*/test`, root `test/`;
then `intention-lint`, `shellcheck scripts/*.sh`, `pipeline-lint`, `contracts-lint`,
`backlog-lint`, `design-lint` over `templates/design.md` + `docs/design/*.md` (this doc
included — 6 headings present), and `docs-structure-lint`.

**Guard-by-guard, what proves each stays green:**
- *living-corpus*: `test/living-corpus.test.js` `EXPECTED` set rewritten to the moved paths;
  the script's globs rewritten; the zero-file negative case is fixture-driven and unaffected.
  Re-pin `EXPECTED` by running `bash scripts/living-corpus.sh` on the moved tree, not by hand.
- *source-hygiene*: `SCANNED_PATHS` + allowlist regexes rewritten; the class-A/B/C synthetic
  cases are path-independent and unaffected; positively re-pin the scanned doc locations so
  the rule cannot pass vacuously on a renamed tree (MEMORY: zero-match rules pass vacuously).
- *readme-drift / readme-regions*: metrics literal (DC2) + README link string moved together;
  `recomputeClaims` reads the file at its new path; the pinned README region string updated in
  both `test/readme-drift.test.js` and `engine/test/readme-regions.test.js`.
- *docs-structure-lint*: `ARCHIVE_DIR` → `docs/contributing/archive`; fixtures unchanged
  (they test the dated-doc rule in isolation); the "live tree" test passes post-move; **new**
  top-level-allowlist assertions added with a good+bad fixture pair.
- *intention-lint / subjects*: engine intention tests enumerating corpus paths rewritten in
  lockstep with `living-corpus.sh`; `subjects:` frontmatter globs (over `engine/src`) are
  unaffected by the page move.
- *p10-structure*: `docs/GUIDE-customizing.md` → `docs/guides/customizing.md`.
- *adapter native-surface*: agent bodies stay byte-identical (no doc path in them); the
  per-adapter README/config/entrypoint honesty pins are re-asserted after their `docs/adapters`
  → `docs/contributing/specs` citations are rewritten.
- *manifest-lint*: passes with the new `paths:` block (`paths.dod` file-ref resolves post-move).
- *prose-lint (advisory)*: `run_prose_lint` excuse globs retargeted to
  `docs/contributing/{adr,design,archive}/*` (+ `prd/`, `specs/`) so the moved historical docs
  stay excused; the two new `README.md` router pages verified ban-list-clean. Non-failing under
  the advisory default, but re-run under a temporary `hygiene: gate: blocking` in a mktemp
  manifest to prove the excuse retarget holds if craft ever flips posture.

**New guard (requirement 11).** Good fixture: a `docs/`-shaped tree with only `README.md`,
`guides/`, `contributing/` → exit 0. Bad fixtures: a stray `docs/STRAY.md` and a stray
`docs/extra/` dir → exit 2, each named in stderr. Positive-pin the live tree's three-entry
top level so the rule fails loud on a future stray.

**Link-check (DC5-(a)).** A step that resolves every relative markdown link target under
`docs/**` and fails on any non-existent target, run once in CI; proves requirement 12 as a
standing invariant. Fixture: a doc with a known-dangling link → non-zero. **Caveat:** the
282-file ADR/archive corpus may already carry pre-existing dead links unrelated to this move;
a naive whole-tree check would go red on day one. Scope the check to the links this change
rewrites, or baseline the existing danglers and fail only on *new* ones — do not let legacy
breakage block the migration PR (feeds the DC5 recommendation).

**History (requirement 5).** Spot-assert `git log --follow` traverses at least one file per
moved tree across the rename (moves done via `git mv`, not delete+add).

## Out of scope

- Changing shipped consumer skill defaults (`docs/design/`, `docs/adr/`, …) — DC1 keeps them;
  a consumer's own tree is not craft's concern here.
- Editing doc *content* beyond path strings and the two new `README.md` router/tree-guide
  pages — this is a relocation, not a rewrite.
- A `docs/contributing/requirements/` tree — craft produces no standalone requirements
  artifact today; if the requirements phase is later enabled, `paths.requirements` and the
  audience-split allowlist must be revisited together (flagged, not built).
- The vendor-binding location contract (ADR-191) and any `engine/src/observability/adapters/`
  layout — no vendor-suffixed source moves.
- Removing/rewriting frozen run-memory history in `.claude/craft-memory.md` (DC6-(a) leaves it
  verbatim) and any change to the memory-store mechanism.
- Splitting `specs/` into a separate `records/` subtree — the target structure keeps contract
  specs and poc records together under `specs/`.
