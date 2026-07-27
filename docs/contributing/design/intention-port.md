# Design — Intention port: engine-owned protocol + zero-config `file` adapter

> Brief: make architectural intention a first-class craft port — an engine-owned
> protocol (`consult` / `record` / `assert-fresh`) wired at fixed seams, with a
> zero-config `file` adapter (markdown + `subjects:` frontmatter, glob-∩-diff
> freshness, advisory-first) and a `source: custom` argv escape hatch mirroring the
> backlog port.
> Status: draft → self-reviewed ×3 → accepted

## Context

### The as-is: a ported engine, one un-ported knowledge concern

Craft is a hexagonal feature-delivery engine (`docs/DESIGN-customizable-engine.md`): a
thin orchestrator (`skills/run/SKILL.md`) walks a declarative phase descriptor list
behind explicit ports, each with a `{ file|claude, custom }`-shaped source set, a
zero-config built-in default, and a documented spec under `docs/adapters/`. The
established port specs this design mirrors:

- **`docs/adapters/backlog.md`** — source set `{ file, custom }`; the `custom` verb
  invokes a `ref` script with **discrete argv** (untrusted `id`/`refs` never touch a
  shell string); config-vs-runtime failure split; `github-issues`/`jira`/`linear` are
  documented **recipes, not sources** (the validator rejects them with a targeted
  "use `source: custom`" hint).
- **`docs/adapters/memory.md`** — load-once/save-once run lifecycle; **advisory-only,
  never-gating** (ADR-116/120); a content whitelist (ADR-123) that *bans* semantic
  prose and "this codebase prefers X" summaries; per-phase slice **prepended into the
  slot-1 injected contract block** (`skills/run/SKILL.md` walk step 4).
- **`docs/adapters/telemetry.md`** — newest port; vendor-neutral event shape;
  advisory **drift** signal emitted only against a committed baseline; a stable
  serialized report artifact.

Architectural intention — *why* the system is shaped as it is, what each module is
for, which invariants bind it — is the last knowledge concern with **no port**. It is
aggregated in four stores, guarded for freshness/coverage in none, and fed/consulted by
prose convention only:

| Store | Role | Guarded today by | Gap |
|---|---|---|---|
| `docs/DESIGN-customizable-engine.md` | living architecture (SoT-named by `BACKLOG.md`) | nothing — `ci.sh` design-lint enumerates only `docs/design/*.md` + template | not even form-linted |
| `docs/adapters/*.md` (living port specs) | living port contracts | `test/source-hygiene.test.js` greps banned tokens only | no form/freshness lint |
| `docs/adr/` | append-only decision record | numbering convention | fine as history; nothing links a decision to the code it governs |
| `docs/design/*.md` (per-run) | per-change intention record | `scripts/design-lint.sh` (required sections) | fine as history — frozen at ship |
| `BACKLOG.md` SoT pointer block (lines 8–9) | the only index naming the above | `scripts/backlog-lint.sh` (section headings) | the pointers themselves are unvalidated prose |

### Constraints inherited from the codebase (binding)

- **Provenance is deliberately one-way** (`skills/run/SKILL.md` "Provenance" invariant
  + `test/source-hygiene.test.js`): docs point at code; **code never points back**. Any
  freshness check must therefore map code paths → intention pages *from the doc side* —
  a page declares the code it governs, never the reverse.
- **Frontmatter precedent** (`engine/src/frontmatter.js`, `engine/src/dod.js`): a YAML
  block opens on **line 1 only** (a mid-file `---` is a markdown `hr`, never a fence);
  a *genuinely absent* block returns `null` (advisory skip), while a block that **opens
  but mis-types its YAML fails loud**. `parseDod` is the exact template to follow — do
  not re-invent frontmatter handling.
- **Manifest machinery** (`engine/src/manifest.js`, `manifest-vocabulary.js`,
  `manifest-lint-main.js`): a new top-level key needs an entry in `TOP_KEYS`, a
  `validate<Key>` mirroring `validateMemory`/`validateBacklog`, and a `switch` case.
  Manifest file-refs are **realpath-contained** against the repo root
  (`engine/src/contain.js` via `checkFileRef`) — a bare-path fallback is an
  arbitrary-read oracle on an untrusted clone.
- **Lint families**: two exist. (1) bash structure-lints (`scripts/design-lint.sh`,
  `backlog-lint.sh`, `docs-structure-lint.sh`) — thin `awk` heading checks. (2) engine
  lint bins — a ~6-line shim (`engine/bin/manifest-lint.js`) over
  `engine/src/<name>-main.js`, with logic in `engine/src/**` (so mutation analysis
  reaches it) and a `engine/test/<name>.bin.test.js` spawn-smoke plus
  `<name>-main.test.js` logic suite. `scripts/ci.sh` **enumerates-and-runs** every lint
  (find, not glob); a zero-file enumeration is a hard error.
- **Slot-1 is the only injection surface** (`skills/run/SKILL.md` step 4 memory-hint
  clause): per-phase context is prepended into the assembled contract block. There is
  **no second injection surface** — a consult slice must ride slot 1 too.
- **Consult seam today** (`skills/documentation/SKILL.md` preamble; `agents/docs-writer.md`):
  affected pages are chosen by **LLM judgment only**; `docs-writer` **updates listed
  pages, cannot create** a page or notice an unlisted stale one.
- **Token family** (`skills/run/SKILL.md`): `NO-OP(<phase>):`, `GATE(<phase>): green|red`,
  `auto-skip: <phase> — …`, `WAIVER: …`, `POLICY(...)` are fixed greppable run-record
  tokens. The new `INTENTION-DRIFT(<page>):` / `INTENTION-WAIVE(<page>):` join this
  family — engine/protocol-level, so every adapter emits them identically.
- **Settled by the PRD conversation (§7), not open here**: memory stays a sibling (its
  ADR-123 prose ban is load-bearing); `DESIGN-history.md` stays frozen and is never the
  adapter's index (anything index-like is *derived* from subjects, or uses the
  ADR-196 committed-snapshot-drift pattern); no PostToolUse/Stop hook; the one-way
  provenance rule is untouched; the default adapter adds **no new runtime dependency**
  (bash + node built-ins); zero-config is **byte-identical** behaviour on a repo with no
  `intention:` key beyond advisory notes.

Provenance for this design: `docs/PRD-intention-port.md` (intent) ·
`docs/DESIGN-customizable-engine.md` (architecture) · `docs/adapters/{backlog,memory,telemetry}.md`
(shape) · ADR-116/118/120/123 (advisory-only + memory boundary) · ADR-196 (committed-snapshot drift).

## Requirements

What must be true when this ships (verifiable):

- **R1 — Protocol before storage.** `docs/adapters/intention.md` defines the port as
  three verbs (`consult` / `record` / `assert-fresh`), their pre/post, the report
  shape, the advisory/blocking semantics, and the token vocabulary — **without
  referencing files**. Any backend answering the three verbs satisfies the port.
- **R2 — Source set `{ file, custom }`.** `file` is the only built-in default; `custom`
  is the single runtime-resolvable escape hatch (a `ref` script invoked with discrete
  argv). Non-built-in backends (`rag`, `wiki`, `notion`, `confluence`, `code-graph`)
  are **documented recipes**; the manifest validator rejects them as an
  `intention.source` value with a targeted "use `source: custom`" hint.
- **R3 — One `file`-adapter primitive.** A living page declares `subjects: [<globs>]`
  in line-1 frontmatter; consult filtering, freshness, and coverage all derive from
  that single declaration. **No parallel map file, no second source of truth.** A page
  without `subjects` is noted advisorily and skipped — absence is never an error.
- **R4 — Consult at design + planning.** The `design` and `planning` phases receive the
  intention slice whose subjects intersect the change scope, prepended into the
  **slot-1** injected contract block (the surface the memory hint already uses).
- **R5 — Record at decisions + documentation.** ADR writes (decisions) and page
  refresh/create (documentation) route **through the port**; the `file` adapter routes
  to today's `docs/adr/` + living-page locations byte-for-byte, so a non-file backend
  receives writes at the same seams.
- **R6 — Guard at validation + CI.** `assert-fresh(change)` reports per living page
  **stale** (a changed path matches the page's subjects, the page was not touched in the
  branch, and no waiver token is present) and **uncovered** (a declared load-bearing
  scope matched by no page). It **never throws**; gating is decided by the engine per
  the `intention.gate` knob, defaulting to **advisory** (drift lines in the run record +
  PR body).
- **R7 — Deterministic form guard, day one.** A new `intention-lint` enters `ci.sh`
  (enumerate-and-run) and gates on two deterministic checks with **zero new
  dependencies**: (a) `subjects` frontmatter *validity* across the living corpus, (b)
  `BACKLOG.md` SoT-pointer *resolution*.
- **R8 — Zero-config identity.** A repo with no `intention:` key and no `subjects`
  frontmatter runs **byte-identically** to today, plus at most advisory notes.

### Per-change acceptance criteria (this repo's convention: here, not `docs/DOD.md`)

The change lands as six slices; each carries a mechanically verifiable acceptance test.
Sizes are honest estimates; §Design flags the two slices that are bigger than they look.

| Slice | Deliverable | Acceptance criterion (verifiable) |
|---|---|---|
| **(a)** | `docs/adapters/intention.md` port spec | `scripts/ci.sh`'s source-hygiene grep over `docs/adapters/` stays green (no banned class-A/B/C tokens in the new spec); the spec documents all three verbs + the `{ file, custom }` source set + the custom argv contract. |
| **(b)** | `subjects` parser + `assert-fresh` core in `engine/src/`, bin shim | Unit suite: a valid `subjects` list parses; an absent block → `null`/skip; a block that opens with malformed YAML **throws** (mirrors `parseDod`); glob-∩-diff freshness returns *stale* for scenario A and *not-stale* for scenario B (§Pinned matrix). Mutation analysis reaches the core (logic in `engine/src/**`). |
| **(c)** | `intention:` manifest schema + validator | `engine/test/manifest-lint-main.test.js` extended: valid `intention` blocks pass; unknown sub-key, bad `source`, `rag`/`wiki` source (targeted hint), non-`{advisory,blocking}` `gate`, missing `custom` `ref` each produce the exact error and a non-zero exit **before any phase runs**. |
| **(d)** | `intention-lint` + `ci.sh` wiring + living-corpus `subjects` adoption | `bash scripts/... ` (or `node engine/bin/intention-lint.js`) exits 0 on the adopted corpus and non-zero on a page with a mis-typed `subjects` block or an unresolvable SoT pointer; `ci.sh` enumerate-and-run includes it (zero-file enumeration is a hard error); the full `ci.sh` is green. |
| **(e)** | Seam wiring prose (`skills/run/SKILL.md`, `skills/documentation/SKILL.md`) | The run walk loads an `IntentionView` once per run and prepends the per-phase consult slice into the slot-1 block at `design`/`planning`; the documentation phase computes the mechanical affected-page floor `(diff ∩ subjects) ∪ probe` and escalates a coverage gap via the blocker protocol. No new injection surface added. |
| **(f)** | `docs/GUIDE-customizing.md` section + custom recipe docs | The GUIDE gains an intention-port entry in its injection catalog; `docs/adapters/intention.md` carries ≥1 worked `custom` recipe (a code-graph/tokensave consult) exercised to the backlog port's recipe depth (consult path live, record documented). |

Traceability to PRD success criteria: R8 ⇒ SC1; slice (e) dogfood + R6 ⇒ SC2; slice
(f) ⇒ SC3; R7 ⇒ SC4; R4 ⇒ SC5.

## Design

### Two layers — the split is the point (same as backlog)

1. **The protocol (engine-owned ceremony).** Three verbs, the seams that invoke them,
   the report shape, blocker/advisory semantics, the fixed token vocabulary. This layer
   **never mentions files** — it is where a project plugs its own enforcement
   (`source: custom`).
2. **The `file` adapter (default).** Markdown pages, `subjects:` frontmatter,
   glob-∩-diff freshness. These are this adapter's **private mechanics**; they exist
   only because craft's zero-config rule demands a fully specified no-manifest default —
   exactly like backlog's `file` adapter reproducing today's behaviour byte-for-byte.

### Port protocol (`docs/adapters/intention.md`)

Documented in the pre/post style of `docs/adapters/{memory,telemetry}.md`:

- **`consult(scope, deps) → IntentionView`** — return the pages whose subjects intersect
  `scope` (a set of repo-relative paths), as `{ path, purpose }` pairs (one-line purpose
  = the page's H1 / first summary line). The orchestrator assembles the slot-1 block
  from the view (just-in-time, progressive disclosure — **never inline whole pages**).
  - *pre*: `scope` is repo-relative paths (the touched set for the change/phase);
    `deps.readPage`, `deps.listCorpus` are injected (no ambient FS in the core).
  - *post*: `entries` contains only pages carrying valid `subjects`; a page without
    `subjects` is omitted and noted in `skipped`; never throws (an unreadable page is a
    skip, not a rejection).
- **`record(entry, deps) → refs`** — persist an ADR / page refresh / page creation and
  return the written refs. The `file` adapter routes to today's `docs/adr/` +
  living-page locations byte-for-byte (a **thin relabel** for the built-in — see the
  scope-honesty note). The verb exists so a non-file backend receives the same writes.
- **`assert-fresh(change, deps) → report`** — the freshness/coverage guard. **Never
  throws.** Gating is the engine's decision via `intention.gate`, **not** the adapter's.
  Report shape (deep-sorted-serializable, telemetry-style):

  ```
  {
    "schemaVersion": 1,
    "stale":     [ { "page": "docs/adapters/telemetry.md",
                     "changedPaths": ["engine/src/observability/memory.js"],
                     "waived": false } ],
    "uncovered": [ { "scope": "engine/src/observability/**" } ],   // only when intention.covers present
    "skipped":   [ { "page": "docs/DESIGN-history.md", "reason": "no-subjects" } ],
    "note":      "no living pages carry subjects"                  // only when nothing to assert
  }
  ```

  Each non-waived `stale` entry emits, one line per changed path, the run-record token
  `INTENTION-DRIFT(<page>): <changed-path>` (carried into the PR body — the telemetry
  drift-signal precedent). A `waived: true` entry emits no drift line.

### `file` adapter mechanics

- **Subject declaration.** Line-1 frontmatter `subjects: [<globs>]`, parsed by
  **reusing `extractFrontmatter` + `js-yaml`** with `parseDod`'s exact contract: absent
  block → `null` (skip, advisory); block present without a `subjects` key → skip; block
  that **opens but mis-types its YAML → throw** (author error, surfaced loud). No new
  frontmatter code.
- **Freshness = glob ∩ diff, doc-side.** `change` = the branch's cumulative
  `git diff --no-ext-diff --name-only <base>..HEAD` against the branch base (merge-base
  with trunk); `--no-ext-diff` per the repo's scripted-git rule. Base resolution reuses
  the change-scope the run already reasons over and is an implementation detail for the
  plan. A diff that cannot be computed yields an empty change set — an advisory no-op,
  never a throw. A page P
  with subjects G is **stale** ⟺ `∃ c ∈ changed : ∃ g ∈ G : matchesGlob(c, g)` **AND**
  `P ∉ changed` **AND** no `INTENTION-WAIVE(P)` token is present.
- **Waiver.** Fixed greppable token `INTENTION-WAIVE(<page>): <reason>` in the change's
  design doc or PR body (same family/scan as `NO-OP(<phase>):`, `WAIVER:`).
- **Coverage.** Optional `intention.covers: [<globs>]` in the manifest declares the
  load-bearing scopes; a scope matched by *no* page's subjects is `uncovered`. Absent
  `covers` → the coverage check is a recorded no-op (probing may *propose* a list, never
  *impose* one).
- **Zero-config probe.** No `intention:` key → probe the conventional corpus
  (`docs/adapters/*.md`, `docs/DESIGN-*.md`, `docs/DOD.md`, `docs/GUIDE-customizing.md`);
  pages without `subjects` yield advisory notes only. A bare repo runs exactly as today
  (R8/SC1). Frozen records (`docs/DESIGN-history.md`, `docs/archive/**`, per-run design
  docs, ADRs) simply carry no `subjects` and are therefore never freshness-guarded — by
  construction, records don't rot.

### Pinned matrix (empirical — the default adapter's mechanical primitives)

Pinned this session in the worktree (`node v22.22.3`) and a throwaway git repo, not
from memory. These are the load-bearing external behaviours the `file` adapter matches:

| # | Behaviour under test | Probe | Pinned result |
|---|---|---|---|
| P1 | glob matcher, **node built-in, zero-dep** | `node:path` `matchesGlob` present? | `typeof matchesGlob === 'function'` (node 22; experimental/stability-1, non-warning) |
| P2 | `*` scope | `matchesGlob('engine/src/observability/memory.js', 'engine/src/observability/*')` | `true` (single segment) |
| P3 | `*` does **not** cross `/` | `matchesGlob('…/adapters/claude/telemetry.js', 'engine/src/observability/*')` | `false` |
| P4 | `**` crosses segments | `matchesGlob('…/adapters/claude/telemetry.js', 'engine/src/observability/**')` | `true` |
| P5 | `*.md` glob | `matchesGlob('docs/adapters/telemetry.md', 'docs/adapters/*.md')` | `true` |
| P6 | non-match | `matchesGlob('engine/src/dod.js', 'engine/src/observability/**')` | `false` (never throws) |
| P7 | subjects list parse | `load(extractFrontmatter(page))` | `{ subjects: ['engine/src/observability/**','docs/adapters/telemetry.md'] }`; mid-file `---` hr ignored |
| P8 | absent block | `extractFrontmatter('# page\nno fm\n')` | `null` (→ advisory skip) |
| P9 | block without `subjects` key | `load(extractFrontmatter('---\nname: foo\n---\n…'))` | `{ name: 'foo' }` (no `subjects` → skip) |
| P10 | mis-typed YAML in an **opened** block | `load(extractFrontmatter('---\nsubjects: [unclosed\n---\n…'))` | **throws `YAMLException`** (fail loud — matches `parseDod`) |
| P11 | diff path format | `git diff --no-ext-diff --name-only <base>..HEAD` | newline-separated, repo-relative paths |
| P12 | freshness scenario A (subject changed, page untouched) | end-to-end throwaway repo | `stale: true` (drift emitted) |
| P13 | freshness scenario B (subject changed **and** page touched) | end-to-end throwaway repo | `stale: false` (no drift) |

Consequence for authors: subject globs use `**` to govern a subtree (`engine/src/observability/**`)
and `*`/`*.md` for a single directory level — pin P3 makes the distinction load-bearing.

### Manifest schema (`intention:` key)

Mirror `validateMemory`/`validateBacklog` (`engine/src/manifest.js`):

```yaml
intention:
  source: file            # {file, custom}; default when key absent = file (zero-config)
  ref: ./intention.sh     # custom → required non-empty string; file → optional file-ref
  gate: advisory          # {advisory, blocking}; default advisory
  covers: ['engine/src/observability/**']   # optional list of load-bearing scopes
```

- Add `intention` to `TOP_KEYS` (`manifest-vocabulary.js`); add
  `INTENTION_SOURCES = {file, custom}` and `INTENTION_GATES = {advisory, blocking}`; add
  a `case 'intention'` in `validateManifest`.
- `validateIntention`: object-or-error; unknown sub-key → error (allowed:
  `source`/`ref`/`gate`/`covers`); `source` required and in `INTENTION_SOURCES`
  (`rag`/`wiki`/`notion`/`confluence`/`code-graph` → targeted "not built-in — use
  `source: custom` with a ref to a resolver script"); `gate` if present in
  `INTENTION_GATES`; `covers` if present a list of non-empty strings; **`source: file`**
  → `ref` optional, checked as a **realpath-contained file-ref** (`checkFileRef` →
  `containByRealpath`); **`source: custom`** → `ref` required non-empty string
  (presence at manifest time, reachability at runtime — the backlog split).
- Failure split matches every other adapter spec: **config errors** (non-object
  `intention`, bad `source`/`gate`, unknown sub-key, missing `custom` `ref`, a `file`
  `ref` that escapes the root or is missing) are caught by `manifest-lint` and stop the
  run at step 1 before any phase; **runtime errors** (a `custom` script missing /
  non-executable / non-zero exit) escalate via the injected blocker protocol.

### Seam wiring (engine-owned, per phase)

| Seam | Verb | Behaviour |
|---|---|---|
| `design`, `planning` | `consult` | relevant slice prepended into the slot-1 injected block (the memory-hint surface — **no second surface**) |
| `decisions` | `record` | ADRs through the port (`file`: unchanged `docs/adr/` writes) |
| `documentation` | `record` + mechanical affected-page floor | affected pages = `(diff ∩ subjects) ∪ probe judgment`; a coverage gap escalates via the blocker protocol (`docs-writer` stays update-only — DC #6) |
| `validation` + CI | `assert-fresh` | advisory drift lines; the deterministic `intention-lint` gates `subjects` validity + SoT-pointer resolution in `ci.sh` day-one |

**Run lifecycle (bigger than prose — flagged).** Consult needs an in-session
`IntentionView`, loaded **once per run** at run start (a new step beside the existing
memory `load` at `skills/run/SKILL.md` §1c-mem) and sliced per phase at step 4,
prepended into the *same* slot-1 block. Intention is **not** carried in the
`MemoryView` (the ADR-123 whitelist bans exactly this prose), so this is a genuine new
load-once mechanism paralleling memory's lifecycle — not a one-line prose tweak. It is
still advisory: a cold/absent corpus yields an empty view and the phase probes as
today.

### `intention-lint` — deterministic CI guard (distinct from `assert-fresh`)

Two verbs, two homes: **`assert-fresh`** is the *runtime, per-change, advisory-first*
freshness guard; **`intention-lint`** is the *deterministic, day-one, gating* form
guard. They share the frontmatter + glob primitives but answer different questions.
`intention-lint` checks, over the enumerated living corpus:

1. **`subjects` validity.** For each corpus page that opens a frontmatter block, a
   present `subjects` must be a list of non-empty strings; a mis-typed block fails loud
   (throw → non-zero). A page with **no** frontmatter passes (incremental adoption —
   absence is never an error).
2. **SoT-pointer resolution.** Each backtick-wrapped path in the `BACKLOG.md` SoT line
   resolves: a plain path exists as a file, a trailing-slash path exists as a directory,
   a glob matches ≥1 file. Pinned to resolve today: `docs/PRD-customizable-engine.md`,
   `docs/DESIGN-customizable-engine.md`, `docs/adr/`, `docs/archive/PLAN-*.md`
   (matches ≥1), `docs/archive/SPIKE.md` all present.

Home: logic in `engine/src/intention-lint-main.js`, a ~6-line
`engine/bin/intention-lint.js` shim (the `manifest-lint.js` pattern), a
`engine/test/intention-lint.bin.test.js` spawn-smoke + `intention-lint-main.test.js`
logic suite, wired into `ci.sh`'s enumerate-and-run. (The engine-bin home vs the bash
structure-lint home is DC #7 — the parser + glob logic wants mutation coverage, which
`awk` cannot carry.)

### Custom adapter contract (backlog-port shape)

The `ref` script is invoked as a subprocess with **discrete argv** — `id`/scope/entry
values are **untrusted** (they originate from a diff, a brief, or the environment) and
are never interpolated into a shell string:

- `consult` → argv `["consult", scopeJson]`; stdout = view JSON.
- `record` → argv `["record", entryJson]`; exit 0 = success, non-zero = blocker.
- `assert` → argv `["assert", changeJson]`; stdout = report JSON; **non-zero exit = a
  runtime blocker** (never a silent pass).

Safe-invocation rules are inherited verbatim from `docs/adapters/backlog.md` (argv
array, never a shell string; double quotes are not a sandbox; the `ref` is
presence-checked at manifest time, reachability is runtime). Recipes to document
(consult path live, record documented — backlog `gh`-recipe depth): a **code-graph /
tokensave consult** (map changed paths → owning symbols/pages); a **wiki record +
consult** (Confluence/Notion page CRUD via structured MCP args); a **RAG-index
consult** (embed the scope, return nearest intention pages). These are recipes, **not
sources** (R2).

### Scope-honesty notes (per the brief's "say so" mandate)

- **Consult lifecycle** is the heaviest slice: a new load-once `IntentionView` +
  per-phase slice, not prose (flagged above).
- **`record` is thin for the `file` adapter** — it relabels today's `docs/adr/` +
  page-refresh writes. Its weight is entirely on the `custom` seam and the documentation
  phase's affected-page floor + coverage-gap escalation (DC #6), which is a real
  contract change to `skills/documentation/SKILL.md` even though `docs-writer` stays
  update-only.
- **Source-hygiene already covers `docs/adapters/intention.md`** — `SCANNED_PATHS` in
  `test/source-hygiene.test.js` lists the whole `docs/adapters` directory, so the new
  spec is grepped automatically (no new `SCANNED_PATHS` entry needed). The consequence
  is a constraint on the spec's *content*: it must state its code-graph/wiki recipes
  without tripping the class-A/B/C token grep (no bare `gh`/`github`/technique names).
- **The invariant core is not touched.** Advisory mode adds a run-record token and a
  slot-1 slice — no new engine floor; the three floors (`never-commit-on-red`,
  `validation-triage-gates-propose`, `artifact-handoff`) stay absolute. Blocking mode
  wires into the *existing* validation gate. This keeps faith with the just-completed
  core-shrink / guardrail-prune direction.

## Decision candidates

The user decides these in the ADR phase; the designer only recommends. Candidates 1–6
are the PRD §6 forks (refined against this exploration); 7–8 were surfaced by pinning
the mechanics.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Port or convention? | (a) first-class port + `docs/adapters/intention.md`; (b) fold into the memory port as a semantic concern; (c) no port — lints + prose only | **(a)** | Same second-instantiation-proven split as backlog/memory; genericity is a hard requirement and only a port delivers it. (b) breaks ADR-123; (c) forfeits pluggability. |
| 2 | Verb set | (a) `consult` / `record` / `assert-fresh`; (b) `consult`/`record` only, guard as an engine lint (file-backend-only guard); (c) `load`/`save` memory mirror (no guard verb) | **(a)** | The guard must live behind the port or non-file backends are unguardable. |
| 3 | Subject declaration *(file-adapter scope only)* | (a) `subjects:` frontmatter per living page; (b) a central CODEOWNERS-style map file; (c) none — keep the LLM-judgment probe | **(a)** | One primitive, no second SoT, diffs with the page. (b) is a new staleness liability; (c) leaves nothing mechanical to guard. |
| 4 | Guard strength at introduction | (a) advisory drift lines + `intention.gate: advisory\|blocking` knob, deterministic form checks gating from day one; (b) blocking freshness lint day one; (c) judgment-only DoD criterion | **(a)** | Consistent with the drift-signal precedent and the guardrail pruning; promote once tuned. (b) risks ceremony-drag; (c) decorates without guarding. |
| 5 | Guarded corpus | (a) living pages only; ADRs + per-run design docs stay append-only, form-guarded history; (b) everything incl. ADRs; (c) manifest-declared page list only | **(a)** | Records don't rot by construction. (b) imposes supersession bookkeeping; (c) has no zero-config default. |
| 6 | Coverage-gap handling in the documentation phase | (a) escalate via the blocker protocol; `docs-writer` stays update-only; (b) `docs-writer` gains template-based page creation; (c) record the gap advisorily only | **(a)** | Smallest contract change; a human decides whether a new page is owed. (b) is a delivery-contract amendment; (c) never closes the gap. |
| 7 | `intention-lint` home | (a) engine bin (`engine/src/intention-lint-main.js` + shim), mutation-tested; (b) bash `awk` structure-lint (the `design-lint.sh` family); (c) fold the form checks into `assert-fresh` and run that in CI | **(a)** | The frontmatter-YAML + glob logic needs mutation coverage `awk` cannot carry; (b) also can't cleanly parse YAML; (c) conflates the advisory runtime verb with the day-one gating form check (DC #4 keeps them distinct). |
| 8 | Glob engine (zero-dep) | (a) `node:path` `matchesGlob` (pinned P1–P6); (b) hand-rolled glob→RegExp in `engine/src`; (c) shell out to `git` pathspec matching | **(a)** | Built-in, zero-dep, pinned working on the repo's node 22.22.3. Risk: it is stability-1 (experimental); if that churn is unacceptable, (b) is a ~20-line pure fallback that keeps the core mutation-testable and node-version-independent. (c) reintroduces a shell/process dependency in a hot path. |

## Test strategy

- **Engine unit (`engine/test/**`, `node:test`, hermetic via `test-helpers/with-cwd.js`
  / capture-io — never ambient `cwd`/`$HOME`):**
  - `subjects` parse: valid list; absent block → skip; block-without-`subjects` → skip;
    mis-typed opened block → **throws** (pins P7–P10, the `parseDod` contract).
  - `assert-fresh`: report-shape matrix — stale, waived (no drift line), uncovered
    (only with `covers`), skipped (no-subjects), empty `note`.
  - `validateIntention`: config-error matrix — non-object; unknown sub-key; each bad
    `source` incl. the `rag`/`wiki` targeted hint; bad `gate`; missing `custom` `ref`; a
    `file` `ref` escaping the root (containment); each asserts the exact message + a
    non-zero exit before any phase (extends `manifest-lint-main.test.js`).
  - `intention-lint-main`: subjects-validity green/red; SoT-pointer resolution
    green/red (file / dir / glob / missing).
- **Property lens (parser + matcher — a round-trip/matcher pair is touched):** for the
  glob matcher, `path ∈ subject-set ⟺ matchesGlob(path, someGlob)`; for freshness, the
  invariant `stale(P) ⟺ (∃ changed ∩ subjects(P)) ∧ P ∉ changed ∧ ¬waived(P)` over
  generated `(changed, subjects, touched, waived)` tuples (anchored by pinned scenarios
  A/B, P12–P13).
- **Bin spawn-smoke:** `engine/test/intention-lint.bin.test.js` — the shim exits 0 on a
  clean corpus, non-zero on a seeded violation.
- **Process suites (`test/`, shellcheck-clean shell):** `ci.sh` enumerate-and-run
  includes `intention-lint` (a zero-file enumeration is a hard error); the new
  `docs/adapters/intention.md` (already under the `docs/adapters` scan) and the
  living-corpus `subjects` adoption keep `source-hygiene.test.js` green — no banned
  class-A/B/C tokens introduced.
- **Dogfood / SC2:** declare `subjects: [engine/src/observability/**]` on
  `docs/adapters/telemetry.md`; a fixture change under `engine/src/observability/*`
  without touching (or waiving) the page yields an `INTENTION-DRIFT(docs/adapters/telemetry.md): …`
  line in the run record and PR body; adding an `INTENTION-WAIVE` token suppresses it.
- **Edge matrix:** CRLF frontmatter; a page listed in `subjects` of another page and
  itself changed; a subject glob matching zero paths (no drift, no error); `covers`
  present but empty; `intention.gate: blocking` with a stale page → non-zero validation
  gate; a diff that cannot be computed → empty change set → advisory no-op; unknown
  top-level `intention` shape → config error.

## Out of scope

- **Machine-verified truthfulness** — whether a page still *tells the truth* stays
  judgment (documentation phase + DoD criteria); the guard asserts the ritual, not the
  truth.
- **Folding in the memory port** — memory stays the mechanical-facts sibling; its
  ADR-123 prose ban is load-bearing and untouched.
- **Freshness-guarding frozen records** — `DESIGN-history.md`, `docs/archive/**`,
  per-run design docs, ADRs stay append-only history; they carry no `subjects` and are
  never guarded (records don't rot).
- **Built-in RAG / indexing / external-wiki / code-graph clients** — `custom` recipes
  only, never built-in sources.
- **Per-edit hooks** — no PostToolUse/Stop wiring; intention changes per *change*, not
  per edit; the phase seams + CI are the right granularity.
- **A manually maintained index** — no hand-written page list; anything index-like is
  derived from `subjects`, or uses the ADR-196 committed-snapshot-drift pattern if a
  committed snapshot is ever wanted.
- **New engine floors** — the invariant core is unchanged; advisory mode is a token + a
  slot-1 slice, blocking mode reuses the existing validation gate.
