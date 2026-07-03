# Plan — Intention port: engine-owned protocol + zero-config `file` adapter

> Source: design doc `docs/design/intention-port.md` · ADRs 199–206
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules applied

- The design's six slices (a)–(f) become **8 parts**: the two heavy slices split per the
  design's own instruction — (b) → Part 2 (primitives) + Part 3 (read-side core); (d) →
  Part 5 (lint bin) + Part 6 (ci.sh wiring + corpus adoption). (a)→1, (c)→4, (e)→7, (f)→8.
- Parts 1 and 8 are **docs-only**; Part 6 is **tooling(ci.sh)+docs**; Part 7 is
  **prose(skills)+token-pin-test** — all four carry no `src/` delta and are legitimately
  standalone (no implementation part to fold into). Parts 2–5 are feature code with their
  tests folded in.
- Ordering unblocks forward: spec (protocol anchor, R1) → primitives → read-side core →
  manifest schema → lint bin → ci.sh wiring → seam prose → GUIDE/recipes. Parts are
  sequential on one shared working tree; each builds on the last.

**Cross-cutting invariants every part obeys** (from `contracts/core.md` + repo convention):
no provenance refs (ADR/PRD/slice numbers, `P<n>`) in any `src/`, `test/`, `skills/**`, or
`docs/adapters/**` byte; no suppression directives; no swallowed errors; hermetic engine
tests only (`engine/test-helpers/with-cwd.js` + `capture-io.js`, never ambient `cwd`/`$HOME`);
shell stays shellcheck-clean; never commit on a red gate. Every touched `engine/src/**`,
`skills/**`, `docs/adapters/**`, `docs/GUIDE-customizing.md` file is scanned by
`test/source-hygiene.test.js` for class-A (technique names: `mutation`, `stryker`, …),
class-B (`\bgh\b`/`\bgithub\b`), class-C (vendor-suffixed basenames) tokens — the design's
scope-honesty note flags this as a **content constraint**, especially for Parts 1, 7, 8.

---

## Part 1 — Intention port protocol spec (`docs/adapters/intention.md`)

### Context
New file `docs/adapters/intention.md`. Docs-only; **no `src/` delta**. This is R1
("protocol before storage") — the normative port contract that Parts 2–8 implement
against; it must **not reference files** in the protocol section (a backend answering the
three verbs satisfies the port).

- **Model it on the sibling specs, structurally:** `docs/adapters/memory.md` (pre/post
  verb style, "Core policy retained (NOT port verbs)", "Failure → blocker" with the
  config-vs-runtime split), `docs/adapters/backlog.md` (source set `{ file, custom }`,
  "`custom` invocation contract", "Safe invocation (untrusted …)"), and
  `docs/adapters/telemetry.md` (deep-sorted-serializable report shape).
- **Sections to author** (mirror the design §"Port protocol" and §"Custom adapter contract"):
  1. **Port interface** — three verbs in pre/post style:
     - `consult(scope, deps) → IntentionView` — return `{ entries: [{ path, purpose }], skipped: [{ page, reason }] }`
       for pages whose `subjects` intersect `scope` (a set of repo-relative paths); `purpose`
       = the page's H1 / first summary line. pre: `scope` repo-relative; `deps.readPage`,
       `deps.listCorpus` injected (no ambient FS). post: `entries` only for pages carrying
       valid `subjects`; no-`subjects` pages are omitted and listed in `skipped`; **never
       throws** (unreadable page → skip, not reject).
     - `record(entry, deps) → refs` — persist an ADR / page refresh / page creation, return
       written refs. State plainly (design scope-honesty note): for the `file` adapter this is
       a **thin relabel** of today's `docs/adr/` + living-page writes; the verb exists so a
       non-file backend receives the same writes at the same seams.
     - `assert-fresh(change, deps) → report` — freshness/coverage guard; **never throws**;
       gating is the engine's decision via `intention.gate`, not the adapter's. Give the exact
       report shape from design §"Port protocol" (`schemaVersion: 1`, `stale[]`, `uncovered[]`,
       `skipped[]`, `note`), deep-sorted-serializable (telemetry precedent).
  2. **Source set** — exactly `{ file, custom }`; `file` is the only built-in default;
     `custom` is the single runtime-resolvable escape hatch (a `ref` script, discrete argv).
     `rag`/`wiki`/`notion`/`confluence`/`code-graph` are **not sources** — documented recipes;
     the validator rejects them with a "use `source: custom`" hint.
  3. **Token vocabulary** — `INTENTION-DRIFT(<page>): <changed-path>` (one line per changed
     path on a non-waived stale page; carried into the PR body) and
     `INTENTION-WAIVE(<page>): <reason>` (fixed greppable; same family/scan as
     `NO-OP(<phase>):`, `WAIVER:`). Engine/protocol-level — every adapter emits identically.
  4. **`custom` invocation contract** — discrete argv, untrusted inputs never spliced into a
     shell string: `consult` → `["consult", scopeJson]` (stdout = view JSON); `record` →
     `["record", entryJson]` (exit 0 = success, non-zero = blocker); `assert` →
     `["assert", changeJson]` (stdout = report JSON; **non-zero exit = runtime blocker**).
     Reference `docs/adapters/backlog.md` §"Safe invocation" verbatim (argv array, never a
     shell string; double quotes are not a sandbox; presence-checked at manifest time,
     reachability at runtime). **Do NOT include worked recipes here** — those land in Part 8.
  5. **Failure → blocker** — config-vs-runtime split identical to `backlog.md`/`memory.md`:
     config errors (bad `source`/`gate`, unknown sub-key, missing `custom` `ref`, escaping
     `file` `ref`) caught by `manifest-lint` before any phase; runtime errors (missing/
     non-executable/non-zero `custom` script) escalate via the injected blocker protocol.
- **Public-surface decision:** this doc is a **public port spec** (a new adapter surface).
  Surface it lands on: it lives under `docs/adapters/` which `test/source-hygiene.test.js`
  already lists in `SCANNED_PATHS` (the whole dir) — **no `SCANNED_PATHS` entry to add**, but
  the content is grepped automatically. **Consequence (binding):** state the code-graph / wiki
  recipes' *existence* here without any bare `gh`/`github` (class-B) or technique-name (class-A)
  token — the `backlog.md` `gh` allowlist is content-scoped to `backlog.md` and does **not**
  cover `intention.md`. `docs-structure-lint.sh` only rejects dated basenames outside
  `docs/archive/`; `intention.md` is unaffected. No barrel/registry/GUIDE edit here (GUIDE is
  Part 8).

### TDD steps
Docs-only — no RED code test. Verification is the source-hygiene gate + a structural
self-check.
- **GREEN:** author `docs/adapters/intention.md` with the five sections above.
- **Check (acts as the gate):** run the Part gate — `test/source-hygiene.test.js` must stay
  green (zero new class-A/B/C hits from the new file). Grep the file yourself for `\bgh\b`,
  `\bgithub\b`, and technique names before committing.
- **REFACTOR:** ensure the protocol section names no files; move any file-mechanics prose into
  a clearly-labelled "`file` adapter procedure" section (like `backlog.md`), keeping the
  protocol backend-agnostic.

### Gate
`node --test test/source-hygiene.test.js`

### Commit
`docs(adapters): intention port protocol spec`

---

## Part 2 — Glob matcher + `subjects` frontmatter parser (engine primitives)

### Context
The two mechanical primitives the `file` adapter and the lint share. New files:
`engine/src/glob.js`, `engine/src/intention-subjects.js`. Tests: new
`engine/test/glob.test.js`, `engine/test/intention-subjects.test.js`.

- **`engine/src/glob.js` — `export function matchGlob(path, pattern)`** — the **single**
  `node:path` `matchesGlob` call site (per ADR-206: isolate behind ONE internal helper so an
  experimental-API churn is a single-site swap). `import { matchesGlob } from 'node:path'`
  (confirmed `typeof === 'function'` on the repo's node v22.22.3). Signature:
  `(path: string, pattern: string) => boolean`; never throws (a non-match returns `false`).
  Pins to reproduce (design §"Pinned matrix" P1–P6):
  - P2 `matchGlob('engine/src/observability/memory.js', 'engine/src/observability/*') === true`
  - P3 `matchGlob('engine/src/observability/adapters/claude/telemetry.js', 'engine/src/observability/*') === false` (`*` does not cross `/`)
  - P4 same path vs `'engine/src/observability/**'` `=== true` (`**` crosses segments)
  - P5 `matchGlob('docs/adapters/telemetry.md', 'docs/adapters/*.md') === true`
  - P6 `matchGlob('engine/src/dod.js', 'engine/src/observability/**') === false` (never throws)
- **`engine/src/intention-subjects.js` — `export function parseSubjects(content)`** — mirror
  `engine/src/dod.js` `parseDod` **exactly** (read it first — it is the template). Reuse
  `import { extractFrontmatter } from './frontmatter.js'` + `import { load } from 'js-yaml'`.
  Contract (design §"file adapter mechanics" + pins P7–P10):
  - absent frontmatter block (`extractFrontmatter` → `null`) → return `null` (advisory skip).
  - block present without a `subjects` key → return `null` (skip).
  - block opens but mis-types YAML → **throw** `new Error('intention: malformed YAML frontmatter — …')`
    (author error, surfaced loud — the `parseDod` L37–39 pattern).
  - valid → return the `subjects` list. Pin P7: `subjects: ['engine/src/observability/**','docs/adapters/telemetry.md']`
    parses; a mid-file `---` (markdown hr) is ignored (`extractFrontmatter` opens on line 1 only).
  - **Edge (design test strategy):** CRLF frontmatter parses (`extractFrontmatter` already
    strips trailing `\r`); the returned `subjects` must be validated as a **list of non-empty
    strings** by the caller (Part 5's lint) — `parseSubjects` returns the raw parsed value; do
    the list/non-empty-string shape check where it is consumed, OR expose a companion
    validator — keep `parseSubjects` a thin parse mirroring `parseDod` (which returns
    `{ criteria }` unshaped and defers shape to `validateDodCriteria`). Prefer: `parseSubjects`
    returns the raw `subjects` value (or `null`); shape-validation lives in Part 5.
- **Public-surface decision:** both are **engine-internal** — imported directly by Part 3
  (`intention.js`) and Part 5 (`intention-lint-main.js`). **Do NOT add to `engine/src/index.js`**
  (the curated barrel already exports a `consult` from `policy.js`; keep the intention surface
  out of it). No API report/registry in this repo. Source-hygiene scans `engine/src` — carry no
  provenance refs, no `equivalent mutant` comments unless genuinely documenting a surviving
  mutant.
- **Test conventions:** `node:test` + `node:assert/strict`, Given/When/Then titles, AAA body,
  `sut` variable (see `engine/test/dod.test.js`, `engine/test/frontmatter.test.js`). Pure
  functions — no cwd/FS dependence, so no `with-cwd` needed here.

### TDD steps
- **RED** (`engine/test/glob.test.js`): P2–P6 cases → fail (module absent / `matchGlob`
  undefined).
- **RED** (`engine/test/intention-subjects.test.js`): valid list parses (P7); absent block →
  `null` (P8); block without `subjects` → `null` (P9); mis-typed opened block **throws** (P10);
  CRLF block parses → fail (module absent).
- **GREEN:** implement `matchGlob` (5-line `node:path` wrapper) and `parseSubjects` (mirror
  `parseDod`), minimal to pass.
- **REFACTOR:** confirm `matchesGlob` appears **only** inside `glob.js`; confirm `parseSubjects`
  reuses `extractFrontmatter` (no re-invented frontmatter scan); dedupe any throw-message
  construction.

### Gate
`cd engine && node --test test/glob.test.js test/intention-subjects.test.js`

### Commit
`feat(intention): glob matcher + subjects frontmatter parser`

---

## Part 3 — `file`-adapter read-side core: `consult` + `assert-fresh` (`engine/src/intention.js`)

### Context
New file `engine/src/intention.js` exporting the two read-side protocol verbs for the `file`
adapter; new test `engine/test/intention.test.js`. Pure functions over injected deps — the
`engine/src/observability/memory.js` / `engine/src/dod.js` precedent (pure, no I/O, invoked by
skill prose via the Claude binding; **only test callers + the spec/skill reference it — this is
the established engine-internal reference-impl pattern, NOT dead code**; `dod.js` documents
exactly this: "there is no in-process JS caller of this function today").

- Imports: `import { matchGlob } from './glob.js'` and `import { parseSubjects } from './intention-subjects.js'` (Part 2).
- **`export function consult(scope, deps) → IntentionView`** — `scope` = array of repo-relative
  paths (the phase/change touched set); `deps = { readPage, listCorpus }` injected (no ambient
  FS). For each page in `deps.listCorpus()`: read via `deps.readPage(page)`; `parseSubjects` it;
  if `subjects` present and `∃ p ∈ scope, ∃ g ∈ subjects : matchGlob(p, g)` → push
  `{ path: page, purpose }` (purpose = the page's H1 / first non-empty summary line — extract
  from the read content); a page without `subjects` → push `{ page, reason: 'no-subjects' }` to
  `skipped`; an unreadable page (`readPage` returns `null`) → skip (not reject). Return
  `{ entries, skipped }`. **Never throws.**
- **`export function assertFresh(change, deps) → report`** — the freshness/coverage guard.
  `change = { changed: string[], touched: string[], waived: string[], covers?: string[] }` where
  `changed` = branch cumulative diff paths, `touched` = pages/paths modified in the branch,
  `waived` = pages named by `INTENTION-WAIVE(<page>)` tokens, `covers` = optional
  `intention.covers` scopes. `deps = { readPage, listCorpus }`. Compute (design §"file adapter
  mechanics" + §"Port protocol" report shape):
  - **stale:** page P with subjects G is stale ⟺ `∃ c ∈ changed, ∃ g ∈ G : matchGlob(c, g)`
    **AND** `P ∉ touched` **AND** `P ∉ waived`. Emit `{ page, changedPaths: [matching c…], waived: false }`.
    A waived page (`P ∈ waived`) emits `{ …, waived: true }` (design: telemetry-style report row)
    and produces **no** `INTENTION-DRIFT` line — the drift-line emission is the caller's/skill's
    concern; the report just carries `waived: true`.
  - **uncovered:** only when `covers` present — a `covers` scope matched by **no** page's
    subjects → `{ scope }`. Absent `covers` → `uncovered: []` (recorded no-op).
  - **skipped:** pages with no `subjects` → `{ page, reason: 'no-subjects' }`.
  - **note:** set `'no living pages carry subjects'` **only** when nothing to assert (no page
    carried subjects); omit otherwise.
  - `schemaVersion: 1`. **Deep-sorted-serializable** (telemetry precedent) — sort array entries
    deterministically (by `page`, then `changedPaths`) so the report is stable across runs.
  - **Never throws.** A diff that cannot be computed → empty `changed` set → an advisory no-op
    (no stale rows), never a throw (the caller supplies `changed`; `assertFresh` treats empty
    `changed` as "nothing stale").
- **Pinned scenarios (design P12–P13 / dogfood):** scenario A (`changed` has a subject match,
  page ∉ touched, not waived) → one `stale` row (drift). Scenario B (subject changed AND page
  touched) → no `stale` row. Waiver present → `waived: true`, no drift.
- **Edge matrix (design):** a subject glob matching zero changed paths → no stale, no error; a
  page listed in another page's subjects AND itself changed → that page is `touched` so not
  stale; `covers` present but empty → `uncovered: []`; empty corpus → `note` set.
- **Non-array `subjects` defence (Part 2 defers shape-validation to Part 5's CI gate):** a
  `subjects` that parses without throwing but is not a list (e.g. a bare scalar `subjects: foo`)
  must be coerced to "no usable subjects → skip the page", **never iterated as a string's
  characters**. Guard `Array.isArray(subjects)` before the `∃ g ∈ subjects` loop in both verbs
  (defence in depth — `intention-lint` gates form in CI, but the core never crashes on
  malformed-but-non-throwing input).
- **Public-surface decision:** **engine-internal** — **not** added to `engine/src/index.js`
  (avoids the `policy.js` `consult` name collision already in the barrel; the intention verbs
  are referenced by the seam prose via the spec, not by an in-process JS import). No
  barrel/registry edit. Source-hygiene scans `engine/src`.
- **Test conventions:** `engine/test/intention.test.js`, `node:test`, Given/When/Then, `sut`.
  Deps are plain in-test fakes (`readPage`/`listCorpus` returning fixture strings/arrays) — no
  real FS, no `with-cwd`. Cover the full report-shape matrix (stale, waived, uncovered-with/
  without-covers, skipped, empty-note) + a **property lens** for the freshness invariant
  `stale(P) ⟺ (∃ changed ∩ subjects(P)) ∧ P ∉ touched ∧ ¬waived(P)` over generated
  `(changed, subjects, touched, waived)` tuples, anchored by scenarios A/B (design test strategy).

### TDD steps
- **RED:** `consult` — intersecting page returns `{ path, purpose }`; no-`subjects` page →
  `skipped`; unreadable page skipped; empty scope → empty entries. `assertFresh` — scenario A →
  stale row; scenario B → none; waived → `waived:true`+no drift; `covers` miss → `uncovered`;
  empty corpus → `note`; property-lens invariant. All fail (module absent).
- **GREEN:** implement `consult` + `assertFresh` minimally against Part 2 primitives.
- **REFACTOR:** extract the shared "does any subject glob match any of these paths" predicate
  (used by both verbs) into one small internal helper; keep functions <20 lines; sort keys for
  stable serialization once.

### Gate
`cd engine && node --test test/intention.test.js`

### Commit
`feat(intention): file-adapter consult + assert-fresh core`

---

## Part 4 — `intention:` manifest schema + `validateIntention`

### Context
Extend the manifest validator so an `intention:` block is validated at startup (config errors
stop the run before any phase — the backlog/memory precedent). Files:
`engine/src/manifest-vocabulary.js`, `engine/src/manifest.js`. Tests: extend
`engine/test/manifest.test.js` (pure `validateManifest` shape matrix) **and**
`engine/test/manifest-lint-main.test.js` (end-to-end exit-code, design acceptance (c)).

- **`engine/src/manifest-vocabulary.js`:**
  - Add `'intention'` to the `TOP_KEYS` frozen Set (currently ends `…'extends', 'policy'`).
  - Add, mirroring `BACKLOG_SOURCES`/`MEMORY_SOURCES` at the file's tail:
    `export const INTENTION_SOURCES = Object.freeze(new Set(['file', 'custom']));`
    `export const INTENTION_GATES = Object.freeze(new Set(['advisory', 'blocking']));`
- **`engine/src/manifest.js`:**
  - Import `INTENTION_SOURCES`, `INTENTION_GATES` alongside the existing vocab imports.
  - Add `NON_BUILTIN_INTENTION` sibling to the existing `NON_BUILTIN_TRACKERS` constant:
    `Object.freeze(new Set(['rag', 'wiki', 'notion', 'confluence', 'code-graph']))`.
  - Add `function validateIntention(intention, fileExists, errors)` — model on `validateMemory`
    (L174–205) and `validateBacklog` (L131–166). Rules (design §"Manifest schema"):
    - non-object / null / array → `errors.push('intention must be an object { source, ref, gate, covers }')`; return.
    - unknown sub-key (allowed: `source`, `ref`, `gate`, `covers`) → `unknown intention field: <k>`.
    - `source` **required**; if missing → `intention must declare a source (one of file, custom)`.
    - `source` not in `INTENTION_SOURCES`: if in `NON_BUILTIN_INTENTION` →
      `intention source '<s>' is not built-in — use source: custom with a ref to a resolver script`
      (targeted hint, mirroring the `NON_BUILTIN_TRACKERS` branch); else
      `unknown intention source: <s> (expected one of file, custom)`.
    - `gate` if present must be in `INTENTION_GATES` else `unknown intention gate: <g> (expected one of advisory, blocking)`.
    - `covers` if present must be a list of non-empty strings else `intention.covers must be a list of non-empty strings`.
    - `source: file` → `checkFileRef('intention.ref', ref, fileExists, errors)` (realpath-contained
      file-ref — `checkFileRef` from `manifest-file-ref.js`, containment already wired through
      `buildFileExists` in `manifest-lint-main.js`; `ref` optional here).
    - `source: custom` → `ref` **required** non-empty string else `intention.ref is required for source custom`.
  - Add `case 'intention': validateIntention(value, fileExists, errors); break;` to the
    `validateManifest` switch (L370–408) — the exhaustiveness surface.
- **Public-surface decision:** `validateIntention` is a **private** function in `manifest.js`
  (not exported — mirrors `validateMemory`/`validateBacklog`). `INTENTION_SOURCES`/`INTENTION_GATES`
  are exported from `manifest-vocabulary.js` (internal-facing, mirrors `BACKLOG_SOURCES`).
  **Surface gates pre-paid in-part:** (1) `TOP_KEYS` — the vocabulary registry (edited);
  (2) the `validateManifest` `switch` — exhaustiveness `case` (added); (3) the
  `engine/test/manifest.test.js` "all known top-level keys" test (~L50) — **add an `intention:
  { source: 'file', ref: null }` line** so it stays representative (it will not fail without it,
  but keep it complete). `validateManifest` is already barrelled in `engine/src/index.js` — no
  barrel change. `scripts/manifest-lint.sh` merely `exec`s the node bin — **no parallel bash
  vocab edit** (verified).
- **Failure split (design):** config errors here (bad `source`/`gate`, unknown sub-key, missing
  `custom` `ref`, escaping `file` `ref`) → non-zero `manifest-lint` exit **before any phase**;
  runtime errors (custom script reachability) are out of scope for this part.

### TDD steps
- **RED** (`engine/test/manifest.test.js`, extend the existing validate matrix): valid
  `intention: { source: 'file' }` → ok; valid `{ source: 'custom', ref: './intention.sh', gate: 'blocking', covers: ['engine/src/observability/**'] }`
  → ok; non-object → 1 error; unknown sub-key → error; missing `source` → error; `source: 'rag'`
  → the targeted "use source: custom" hint; `source: 'bogus'` → generic unknown-source error;
  `gate: 'loud'` → gate error; `covers: ['', 1]` → covers error; `source: 'custom'` without `ref`
  → required-ref error. All fail (no `intention` case → `unknown top-level key: intention`).
- **RED** (`engine/test/manifest-lint-main.test.js`, extend): a fenced `.claude/workflow.md`
  fixture (or `writeTmp`) whose `intention.source: rag` → `main` returns `2`, stderr contains
  `INVALID manifest` + the targeted hint (design acceptance (c): exact message + non-zero exit
  **before any phase**). Follow the existing `writeTmp` / `makeCaptureIo` harness (L17–23, L104).
- **GREEN:** add vocab constants, `validateIntention`, the switch case.
- **REFACTOR:** factor the source/`ref` required-vs-optional branch to read like `validateMemory`;
  ensure the targeted-hint branch reuses the `NON_BUILTIN_*` pattern (no duplicated string logic).

### Gate
`cd engine && node --test test/manifest.test.js test/manifest-lint-main.test.js`

### Commit
`feat(intention): intention manifest schema + validator`

---

## Part 5 — `intention-lint` deterministic form guard (bin + main)

### Context
The **day-one gating form guard** (distinct from the advisory runtime `assert-fresh`): logic in
`engine/src/intention-lint-main.js`, a ~5-line shim `engine/bin/intention-lint.js`, a logic
suite `engine/test/intention-lint-main.test.js`, a spawn-smoke `engine/test/intention-lint.bin.test.js`.
It reuses Part 2's primitives. **Not wired into `ci.sh` yet** — that is Part 6 (the `ci.sh`
header rule: "Parts that add new binaries append to this file so CI never references a binary
before it exists").

- **`engine/bin/intention-lint.js`** — copy the shim shape verbatim from
  `engine/bin/manifest-lint.js` / `engine/bin/contracts-lint.js`:
  ```
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/intention-lint-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
- **`engine/src/intention-lint-main.js` — `export function main(argv, io) → exitCode`** — mirror
  `manifest-lint-main.js`'s I/O style (`readFileSync`, `io.stdout/io.stderr.write`, `EXIT_OK=0`/
  `EXIT_INVALID=2`). `argv` = the enumerated corpus file paths **plus** `BACKLOG.md` (Part 6's
  `ci.sh` supplies them). Classify each argv path by `basename`:
  - `basename === 'BACKLOG.md'` → **SoT-pointer resolution** (design §"intention-lint" check 2):
    read the file, find the backtick-wrapped paths on the SoT line(s) (the `> SoT — …` block,
    `BACKLOG.md` lines 8–9), and resolve each: a plain path exists as a file; a trailing-slash
    path exists as a directory; a glob (contains `*`) matches ≥1 real file (use
    `matchGlob` from `./glob.js` against a directory listing). Pinned to resolve **today**:
    `` `docs/PRD-customizable-engine.md` ``, `` `docs/DESIGN-customizable-engine.md` ``,
    `` `docs/adr/` ``, `` `docs/archive/PLAN-*.md` `` (≥1), `` `docs/archive/SPIKE.md` ``. An
    unresolvable pointer → accumulate an error → non-zero exit.
  - else → **`subjects` validity** (design check 1): `parseSubjects` (from `./intention-subjects.js`);
    a present `subjects` must be a **list of non-empty strings** (this is where Part 2's deferred
    shape-check lives); a mis-typed opened block makes `parseSubjects` **throw** → catch → push
    error → non-zero. A page with **no** frontmatter passes (incremental adoption — absence is
    never an error).
  - Accumulate all errors; exit `2` with a `craft-intention: …` diagnostic block on any error
    (mirror `failInvalid` in `manifest-lint-main.js`); exit `0` with a one-line OK message
    otherwise.
  - **Root/containment:** resolve argv paths for reads the same way `manifest-lint-main.js` does
    (relative to cwd / repo root); reuse `containByRealpath` from `./contain.js` if reading files
    the SoT line names, so a malicious pointer cannot become an arbitrary-read oracle.
- **Public-surface decision:** `main` is exported for tests (the `-main.js` convention); the bin
  is the public CLI surface. **Not** barrelled in `engine/src/index.js`. The `ci.sh` wiring is
  deliberately deferred to Part 6.
- **Fixtures / hermeticity:** build fixture corpora in `mktemp`/`with-cwd` temp dirs (never the
  worktree) — a clean page (valid `subjects`), a no-frontmatter page (passes), a mis-typed-`subjects`
  page (fails), a `BACKLOG.md` with a resolvable SoT line (passes) and one with a dangling
  backtick path (fails). See `engine/test/manifest-lint-main.test.js` `writeTmp` (L17–23) and
  `engine/test/dod-assert.bin.test.js` for the spawn-smoke shape (`spawnSync(process.execPath, [bin, …])`).
- **`ci.sh` note for the implementer:** do **not** touch `ci.sh` here; Part 6 owns it.

### TDD steps
- **RED** (`engine/test/intention-lint-main.test.js`): clean corpus argv → `0`; a mis-typed-`subjects`
  page → `2` + diagnostic; a `subjects` that is a scalar/empty-string-list → `2`; a no-frontmatter
  page → `0`; a `BACKLOG.md` with all pointers resolvable → `0`; a `BACKLOG.md` with a
  non-existent backtick path → `2`; file / dir / glob pointer resolution each covered. All fail
  (module absent).
- **RED** (`engine/test/intention-lint.bin.test.js`): the shim exits `0` on a clean fixture
  corpus and non-zero on a seeded violation (spawn-smoke).
- **GREEN:** implement `main` + the shim minimally.
- **REFACTOR:** split the SoT-resolution and subjects-validity checks into two small internal
  functions; reuse `failInvalid`-style diagnostic emission; confirm `matchesGlob` is still only in
  `glob.js` (SoT glob matching goes through `matchGlob`).

### Gate
`cd engine && node --test test/intention-lint-main.test.js test/intention-lint.bin.test.js`

### Commit
`feat(intention): intention-lint deterministic form guard`

---

## Part 6 — Wire `intention-lint` into `ci.sh` + adopt living-corpus `subjects`

### Context
Activate the day-one guard and adopt the primitive on the living corpus. **No `src/` delta** —
tooling(`scripts/ci.sh`) + docs(frontmatter) + one process test. Depends on Part 5's bin
existing (same working tree).

- **`scripts/ci.sh`** — append an `intention-lint` invocation that **enumerates-and-runs** over
  the living corpus, matching the `run_suite` zero-file discipline (L15–45): a zero-file
  enumeration is a **hard error** (`exit 1`), never a silent skip. Enumerate the design's
  zero-config corpus via `find` — `docs/adapters/*.md`, `docs/DESIGN-*.md`, `docs/DOD.md`,
  `docs/GUIDE-customizing.md` — plus `BACKLOG.md`, collect into a bash array (the `while IFS= read
  -r … done < <(find …)` pattern already in `ci.sh`), guard emptiness, then
  `node engine/bin/intention-lint.js "${files[@]}"`. Place it in the trailing `&&` bin chain
  (L55–58) alongside `pipeline-lint`/`contracts-lint`, or as a guarded block before it. Keep
  shellcheck-clean (quote every expansion; the existing file is the style reference).
- **Corpus `subjects` adoption (SC2 dogfood):** add line-1 frontmatter to
  `docs/adapters/telemetry.md` (currently line 1 = `# Telemetry adapter spec`, no frontmatter):
  prepend
  ```
  ---
  subjects: ['engine/src/observability/**']
  ---
  ```
  so a change under `engine/src/observability/**` that leaves `telemetry.md` untouched (and
  unwaived) makes `assert-fresh` emit `INTENTION-DRIFT(docs/adapters/telemetry.md): …`. Adopt
  `subjects` on any other living page whose governed subtree is unambiguous (conservative: start
  with `telemetry.md` only — a page without `subjects` is advisorily skipped, never an error, so
  under-adoption is safe; over-claiming a glob is the only failure mode). Frontmatter here
  introduces no class-A/B/C token and `docs-structure-lint` is filename-only — both stay green;
  no test pins `telemetry.md`'s line-1/H1 (source-hygiene greps content, not position), so
  prepending a fence is safe.
- **Process test** — new `test/intention-lint-ci.test.js` (process suite, `node --test test/…`
  from repo root; CommonJS `'use strict'` + `require('node:test')` like the other `test/*.test.js`):
  (1) assert `scripts/ci.sh` contains an `intention-lint` invocation (wiring pin — a future
  refactor that drops it fails loudly, mirroring the positive-location convention in
  `test/source-hygiene.test.js`); (2) run `node engine/bin/intention-lint.js` over the real
  enumerated corpus (+`BACKLOG.md`) and assert exit `0` (the adopted corpus, incl. the new
  `telemetry.md` `subjects`, is valid). Use `execFileSync`/`spawnSync` with `cwd: ROOT`.
- **Public-surface decision:** no new exported symbol. The `subjects:` frontmatter is a new
  **doc-convention surface** — now gated by `intention-lint` in `ci.sh` (this part activates that
  gate). The wiring pin test is the surface guard.

### TDD steps
- **RED** (`test/intention-lint-ci.test.js`): the "ci.sh references intention-lint" assertion
  fails (not wired yet); the "corpus lints clean" assertion may fail if `telemetry.md` lacks
  `subjects` in a way the corpus test expects — order: write the test first, see it red.
- **GREEN:** add the `subjects` frontmatter to `telemetry.md`; wire the enumerate-and-run block
  into `ci.sh`.
- **REFACTOR:** dedupe the corpus enumeration if it mirrors `run_suite` closely; confirm
  `shellcheck scripts/ci.sh` is clean; confirm the zero-file guard triggers `exit 1` (mirror the
  `run_suite` message form).
- **Phase-boundary check:** run the full phase gate `bash scripts/ci.sh` — it must be green with
  `intention-lint` now in the chain.

### Gate
`shellcheck scripts/ci.sh && node --test test/intention-lint-ci.test.js`

### Commit
`feat(intention): wire intention-lint into ci.sh + adopt living-corpus subjects`

---

## Part 7 — Wire the `consult` / `record` / `assert-fresh` phase seams (prose + token pins)

### Context
Wire the protocol into the phase walk. **No `src/` delta** — `skills/**` prose + a token-pin
process test. This is the design's heaviest *wiring* slice (scope-honesty: the consult lifecycle
is a genuine new load-once mechanism, not a one-line tweak). All seam wiring is **prose**; the
engine core (Parts 2–3) is the reference the prose points to (memory-adapter precedent: the skill
"calls `load`" in prose via the Claude binding).

- **`skills/run/SKILL.md`** (464 lines — read the memory anchors first):
  - **New load-once step** beside `1c-mem` (L73–80, "Load memory store (once per run)"): add
    `1c-int. Load intention view (once per run).` — build an in-session `IntentionView` via the
    intention port's `consult` (design §"Run lifecycle"): probe the corpus (design zero-config
    corpus), hold the single view in-session beside the run record; a cold/absent corpus →
    empty view + a recorded no-op; **never a blocker** (advisory). State plainly it is **not**
    carried in `MemoryView` (ADR-123 bans this prose) — a genuine parallel mechanism.
  - **Step-4 memory-hint clause** (L194–201, "Memory hint (advisory)"): extend the SAME slot-1
    prepend so that for the `design` and `planning` phases the per-phase **intention slice**
    (the `IntentionView` entries whose subjects intersect this phase's change scope) is prepended
    into the injected contract block — **the same slot 1, no second injection surface** (R4;
    design §"Seam wiring"). Advisory; empty slice → phase probes as today.
  - **Token family** (L76-ish token list / L131–134 fixed-token prose): register
    `INTENTION-DRIFT(<page>): <changed-path>` and `INTENTION-WAIVE(<page>): <reason>` as fixed
    greppable run-record tokens joining `NO-OP`/`GATE`/`auto-skip`/`WAIVER`/`POLICY`.
- **`skills/design/SKILL.md`** + **`skills/planning/SKILL.md`** — a Preamble note that the phase
  receives the intention consult slice on slot 1 (advisory), paralleling `planning`'s existing
  "Memory read/write surface (advisory)" clause (`planning/SKILL.md` L14–20).
- **`skills/decisions/SKILL.md`** — note ADR writes route **through the port** `record`; the
  `file` adapter's `record` is today's `docs/adr/` writes byte-for-byte (thin relabel — the
  existing step-5 authoring is unchanged; add the port framing only).
- **`skills/documentation/SKILL.md`** (41 lines) — the real contract change (design §"Seam
  wiring" + ADR-204): the affected-page floor is **mechanical** — `(diff ∩ subjects) ∪ probe`
  (the existing LLM probe in the Preamble ∪ pages whose `subjects` the diff matches). A **coverage
  gap** (a load-bearing changed scope matched by no page's subjects, under `intention.covers`)
  escalates via the **blocker protocol** `{ unit, reason, ≤3 options }`; **`docs-writer` stays
  update-only** (it cannot create a page — a human decides whether a new page is owed). Page
  refresh/create routes through `record`.
- **`skills/validation/SKILL.md`** (131 lines) — add: run `assert-fresh(change)` (advisory);
  emit `INTENTION-DRIFT(<page>): <path>` lines into the run record + PR body per non-waived
  stale page; a waived page (`INTENTION-WAIVE`) emits none; gating obeys `intention.gate`
  (default `advisory`; `blocking` wires into the **existing** validation gate — no new engine
  floor).
- **Token-pin test** — new `test/intention-token.test.js` (process suite; mirror
  `test/no-op-token.test.js`'s positive `grep`-pin style, `execFileSync('grep', …)`): positively
  pin the literals `INTENTION-DRIFT(` and `INTENTION-WAIVE(` in the skill files that emit them
  (`skills/run/SKILL.md`, `skills/validation/SKILL.md`). A positive pin makes a future
  token-rename fail loudly (memory: "prefer fixed greppable tokens").
- **Public-surface decision:** `INTENTION-DRIFT`/`INTENTION-WAIVE` are a **public run-record
  protocol surface** (every adapter emits them) — pre-paid by the pin test here + the spec (Part
  1). **Content constraint:** `skills/**` is in `SCANNED_PATHS` — the new prose must carry no
  `\bgh\b`/`\bgithub\b` (class-B) or technique-name (class-A) tokens, and **no provenance refs**
  (no ADR/`P<n>` numbers in skill prose). No new injection surface (R4 — reuse slot 1 only).

### TDD steps
- **RED** (`test/intention-token.test.js`): assert `INTENTION-DRIFT(` present in
  `skills/run/SKILL.md` and `skills/validation/SKILL.md`; `INTENTION-WAIVE(` present where the
  waiver is defined → fail (tokens not yet in prose).
- **GREEN:** edit the six skill files as above; add the tokens.
- **REFACTOR:** re-read each edited skill for a single coherent slot-1 story (no second injection
  surface); confirm `docs-writer` stays update-only; run `test/source-hygiene.test.js` to catch
  any accidental class-A/B/C token, and `test/no-op-token.test.js` to confirm no existing pin
  broke.

### Gate
`node --test test/intention-token.test.js test/source-hygiene.test.js`

### Commit
`feat(intention): wire consult/record/assert-fresh phase seams`

---

## Part 8 — GUIDE injection-catalog entry + worked `custom` recipes

### Context
Docs-only; **no `src/` delta**. Completes slice (f) — the GUIDE integration + the `custom`
escape-hatch worked examples. Edits `docs/GUIDE-customizing.md` and appends to the Part-1
`docs/adapters/intention.md`.

- **`docs/GUIDE-customizing.md`** — add an **intention-port entry** to the injection catalog. The
  hexagon/port model lives at L45–83 (the ports list: Execution, Model, Gate, Code-access,
  Backlog, VCS, Memory, Policy) and the catalog at §3 (L121+). Add Intention as a first-class
  port in the port enumeration and a catalog row describing its injection points (`intention.source`
  `{ file, custom }`, `intention.gate` `advisory|blocking`, `intention.covers`), mirroring how
  Memory/Backlog appear. **Content constraint:** `GUIDE-customizing.md` is in `SCANNED_PATHS`;
  the existing `file / gh /` backlog-axis label (L58, class-B allowlisted for backlog) is the
  **only** sanctioned `gh` — do **not** introduce `gh`/`github` on the intention row.
- **`docs/adapters/intention.md`** (append a "Custom recipes (copy-paste reference)" section,
  matching `docs/adapters/backlog.md` L53–84) — ≥1 fully-worked `custom` recipe to backlog-recipe
  depth (consult path live, record documented):
  - a **code-graph / tokensave consult** (map changed paths → owning symbols/pages) — the primary
    worked recipe;
  - optionally a **wiki record + consult** (structured-MCP page CRUD) and a **RAG-index consult**
    (embed scope → nearest intention pages), documented at recipe (not source) depth.
  Each recipe: discrete-argv invocation (`["consult", scopeJson]` etc.), an `id-form`/scope-form
  allowlist note, and a "Pinned" line stating what was exercised vs documented (backlog recipe
  convention). **Content constraint (binding, design scope-honesty note):** write these WITHOUT
  any bare `gh`/`github` (class-B) or technique-name (class-A: `mutation`, `stryker`, …, `rag` is
  fine as an adapter-recipe word but avoid tool-technique names that trip class-A) token — the
  `backlog.md` `gh` allowlist does **not** extend to `intention.md`. Grep the file for `\bgh\b`,
  `\bgithub\b`, and the class-A pattern before committing.
- **Public-surface decision:** the GUIDE catalog entry is a **public doc surface** (the canonical
  customization catalog); the recipes are public reference. Both are grepped by
  `test/source-hygiene.test.js` (GUIDE + `docs/adapters/` are in `SCANNED_PATHS`). No barrel/registry.

### TDD steps
Docs-only — no RED code test.
- **GREEN:** add the GUIDE catalog entry; append the recipes to `intention.md`.
- **Check (acts as the gate):** `test/source-hygiene.test.js` stays green (self-grep for
  class-A/B/C first). Verify the GUIDE entry sits in the same catalog structure as Memory/Backlog.
- **REFACTOR:** cross-link the GUIDE entry → `docs/adapters/intention.md`; ensure the recipe depth
  matches `backlog.md` (consult live, record documented) without over-claiming.

### Gate
`node --test test/source-hygiene.test.js`

### Commit
`docs(intention): GUIDE injection-catalog entry + custom recipes`
