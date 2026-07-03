# Design — backlog-sot-adapter (P11)

> Brief: introduce a backlog PORT — `resolve(id) → {title, brief}` and `complete(id, refs[]) → void` —
> so input resolution and the closing tick work against any tracker; default `file` reproduces today
> byte-for-byte; hexagonal split puts id-form + when-complete-fires in the CORE and the per-source
> resolve/complete mechanism in the PORT (prose). Gate G7, scenario S6.
> Status: draft → self-reviewed ×3 → accepted → revised ×1 against ADRs 054-060
>
> Revision note (ADRs 054-060): the source set is `{ file, custom }` only — `github-issues`/`jira`/
> `linear` are NOT built-in sources; they survive as documented `custom` recipes (ADR-055). `backlog`
> MUST be an object `{ source, ref }`; a bare string is hard-rejected, NOT migrated (ADR-054). Adapter
> procedures live in one referenced spec doc (ADR-056); failure-is-a-blocker relies on the existing
> `core.md` line (ADR-057); failures split config→engine-exit / runtime→session-blocker (ADR-058); the
> `custom` complete guard is exit-code + documented idempotency (ADR-059); the `file` id-form stays
> orchestrator prose-judgment, no engine regex (ADR-060).

## Context

The backlog source-of-truth is currently hardwired to one shape: a markdown file. Two seams touch it,
and neither abstracts the tracker.

**Resolution seam — `engine/src/resolve.js`.** `buildManifestRecords(manifest)` (lines 123–141) emits,
ONLY when `typeof manifest.backlog === 'string'`, the line
`backlog: "<x>" declared — Backlog.resolve required at input-classify.` This is the existing stub —
it names *that* a backlog is declared but not *which adapter* resolves it. The orchestrator
(`skills/run/SKILL.md` step 2) classifies an input as a backlog id "only if the manifest declares
`backlog:`; look the entry up there" — and the lookup is implicitly file-shaped.

**Validation seam — `engine/src/manifest.js`.** `backlog` is in `TOP_KEYS` (line 12) but has NO
sub-validation: the switch (lines 315–338) has no `case 'backlog'`, falling through under the comment
"backlog … recognized; no sub-validation" (line 337). Today `backlog` is a bare string
(`manifest.test.js:53` → `backlog: 'my-backlog'`; the S6 fixture → `backlog: PROJ-42`).

**Tick seam — prose.** `skills/documentation/SKILL.md` step 2 ("Backlog tick — guarded") spawns
`craft:backlog-ticker` and accepts the diff only if it touches exactly the expected line(s), else the
session does the one-line edit. `agents/backlog-ticker.md` is the `file` adapter's `complete` body in
prose: flip `[ ]`/`[~]`→`[x]`, append the reference suffix, one file one edit, haiku.

**Constraints that bind this design:**

- `engine/src/**` is PURE JS, NO I/O (ADR-002), and is the mutation-scored surface (Stryker mutates
  `engine/src/**/*.js`; `engine/stryker.conf.json`). The actual resolve/complete I/O is tool-backed and
  session/agent-executed — `file`=Edit, `custom`=a runtime-resolvable repo script/command (which itself
  wraps `gh`, the Atlassian MCP, Linear, or anything) — so the port CANNOT be JS that does the I/O.
- The invariant core (PRD §11, line 362): "Adapter failure is a blocker, never a silent pass — a
  backlog `resolve`/`complete` … that cannot be reached escalates via the blocker protocol; the closing
  tick is never silently skipped." This is already a `core.md` contract line and binds every spawn.
- The hexagonal split (SP6, line 221): the **core** owns *which id-form is a backlog id* and *when
  `complete` fires* (delivery, after the PR exists); the **port** owns only `resolve`/`complete`.
  Ownership here is *conceptual*, not necessarily JS — ADR-060 keeps the `file` id-form as orchestrator
  prose-judgment (no engine regex), so the core's only id-related JS is config validation (shape +
  source), not an id-form predicate.
- The contract-injection pattern (P5, `docs/DESIGN-P5-contract-injection.md`): an invariant that must
  survive an agent swap lives in `contracts/<bundle>.md`; method particular to one role stays craft in
  the thinned agent. The delivery bundle (`contracts/delivery.md`) is injected into
  documentation/propose/integrate.
- Validator house style: each top-level key gets a `validate<Key>` helper mirroring
  `validateModels`/`validateGates`/`validatePr` — accumulate errors, never throw, never short-circuit.
- No provenance refs (phase/ADR/backlog numbers) in source or test; design docs carry provenance.

Prior art this design extends: `docs/DESIGN-P5-contract-injection.md` (bundle boundary rule),
`docs/PRD-customizable-engine.md` §9/§11/§17, `docs/SPIKE.md` SP6 (the pinned contract matrix).

## Requirements

When this ships, all of the following are verifiable:

1. **File default unchanged (S6/SC1).** A manifest with `backlog: { source: file, ref: <path> }`
   drives the exact resolution + tick behaviour shipped today: same `craft:backlog-ticker` single-edit
   flip-and-append, byte-for-byte. The Resolution-layer record line for a `file` source is recognisable
   as "file". A bare-string `backlog: <path>` is REJECTED at validation (ADR-054) — not coerced — so the
   two existing string-form tests named in ADR-054 (the `manifest.test.js` unit case + the S6 fixture)
   AND any other bare-string fixture (see Test strategy: `valid-basic.workflow.md`) migrate to the object
   form as part of this change.
2. **Manifest validation, loud on bad shape/source.** `validateManifest` rejects a non-object `backlog`
   with `backlog must be an object { source, ref }`; rejects `backlog.source ∉ {file, custom}` with a
   named error (`unknown backlog source: <x>`); rejects an unknown sub-key under `backlog`; rejects a
   missing `ref`. For a non-built-in tracker value (`github-issues`/`jira`/`linear`) it emits the
   targeted hint `backlog source '<x>' is not built-in — use source: custom with a ref to a resolver
   script` (ADR-055). `manifest-lint.sh` surfaces these and exits non-zero (the run STOPs at
   `run/SKILL.md` step 1).
3. **Record line names the active adapter.** `buildManifestRecords` emits a line that names the
   resolved source (`file` | `custom`), so the run record shows which adapter is active — not just
   "a backlog is declared".
4. **Unreachable source → blocker, never silent skip.** A `custom` source whose script is
   missing/non-exec/non-zero (or whose wrapped tool is unauthed/down) escalates via the blocker protocol
   `{ unit, reason, ≤3 options }`. The closing tick is never silently skipped — it lives in the run
   record and stays open as a blocker (ADR-057/058).
5. **id-not-found → blocker, never guess.** `resolve(id)` on an id absent from the source escalates a
   blocker; it never fabricates a title/brief.
6. **`complete` is idempotent + guarded.** `file` touches exactly the entry line(s) (existing exact-line
   diff guard). For `custom`, a non-zero exit is a blocker (never a silent tick-skip); idempotency
   (re-running converges — a closed item stays closed, refs appended once) is the custom script's
   *documented contract*, not framework-asserted (ADR-059).
7. **Core owns the boundary.** *Which id-form is a backlog id* and *when `complete` fires* (delivery,
   after the PR exists) are owned by the CORE/prose the engine governs, not by any adapter. This is a
   conceptual boundary, not new JS: the `file` id-form stays orchestrator prose-judgment (no engine
   regex, no id-pattern knob — ADR-060), and `custom` id-form is the script's concern.

## Design

### The split (the crux)

The port is NOT JS-that-does-I/O. It is a **two-layer split**: a tiny testable CORE delta in
`engine/src/**`, and a per-source **adapter procedure** in injected prose the session/agent follows.

```
CORE (engine/src/**, pure JS, mutation-scored)          PORT/ADAPTER (prose, tool-backed)
──────────────────────────────────────────────          ─────────────────────────────────────
• validateBacklog(backlog, fileExists, errors)          resolve(id) → {title, brief}   per source
    ← manifest.js                                        complete(id, refs[]) → void    per source
    non-object → reject                                  failure → blocker escalation   (core.md line)
    source ∈ {file, custom}                              file   = Edit (today, byte-for-byte)
    github-issues/jira/linear → "use custom" hint        custom = <ref> resolve/complete (runtime)
    file.ref via checkFileRef; custom.ref non-empty only
• backlogSourceOf(backlog) → source  ← resolve.js helper
    drives the record line naming file | custom
• when-complete-fires sequencing  ← already enforced by
    the propose/documentation delivery-walk ordering
    (no new code: documentation's tick runs in the
     delivery archetype, after propose has the PR)
```

The core's **JS** delta answers exactly one question: *is this manifest's backlog config valid, and
which source is active?* (validation + record line). The *id-form predicate* — *is this string a
backlog id?* — is the second half of the core's conceptual ownership, but per ADR-060 it stays **prose
judgment** for `file` (no engine regex, no id-pattern knob) and is the script's concern for `custom`;
it is NOT a JS delta. Everything tool-backed — the actual Edit/script call — lives in the adapter
prose, dispatched by source. This keeps the scored surface a tiny, deterministic delta while the
adapters stay swappable prose, exactly the P5 bundle pattern.

### The contract matrix (two sources)

Per ADR-055 the source set is exactly **`{ file, custom }`**. `file` is the only built-in adapter
(today's behaviour byte-for-byte); `custom` is a single runtime-resolvable escape hatch named by `ref`,
invoked generically, that wraps any tracker. The framework guarantees the **seam**, not a tracker's
availability.

| `backlog.source` | resolve(id) → {title, brief} | complete(id, refs[]) | reachability | failure → blocker trigger | pinned |
|---|---|---|---|---|---|
| `file` (default) | look up `id` in the backlog md; id-form = the **repo's backlog convention** (orchestrator prose-judgment, no engine regex — ADR-060; this repo's own `BACKLOG.md` keys by free-text + `P<n>`/`P<n>.<m>` labels) | flip `[ ]`/`[~]`→`[x]` + append refs via `craft:backlog-ticker` (one file, one edit; exact-line diff guard) | `ref` file exists (validator `checkFileRef`) | ref missing → validator error (config); id-line absent → runtime blocker | current behaviour |
| `custom` | `<ref> resolve <id>` → stdout `{title, brief}`; id-form is the script's concern | `<ref> complete <id> <refs…>` (exit 0 = success; idempotency is the script's documented contract — ADR-059) | `ref` non-empty (validator); script resolvability is checked at runtime, NOT at validation (ADR-055/058) | script missing/non-exec/exit ≠ 0 → runtime blocker; id-not-found → runtime blocker | seam always available (script repo-provided/runtime-resolvable) |

id-form ownership (the CORE half of "which id-form is a backlog id"): `file` stays prose-judgment — the
orchestrator (`run/SKILL.md` step 2) classifies an input as a `file` backlog id by the repo's own
backlog convention, with **no hardcoded engine regex and no `backlog.id-pattern` knob** (ADR-060). This
repo's own backlog keys by `P<n>`/free-text, so a universal regex would be provably wrong here. `custom`
delegates id-form entirely to its resolver script — the engine has no opinion.

#### Custom recipes (gh, jira) — SP6 pins, empirically captured

The SP6 (`docs/SPIKE.md`, design-resolved 2026-06-15) gh/jira mechanisms do NOT survive as built-in
sources (ADR-055); they survive as **worked `custom` recipes** the user can copy into a resolver script.
Re-pinned live on 2026-06-18 in a `mktemp` throwaway — read-only probes only; *complete* paths were NOT
exercised live (a close/transition is a real side-effect) but their tool existence is confirmed. These
are reference copy-paste content for `docs/adapters/backlog.md`, not engine behaviour:

- **GitHub issues** (a `custom` script wrapping `gh`):
  - `resolve <id>` → `gh issue view <id> --json title,body` (map `title`→title, `body`→brief).
  - `complete <id> <refs…>` → `gh issue close <id> --comment "<refs>" --reason completed`
    (single idempotent call — re-closing a closed issue is a no-op).
  - id-form: `^#?\d+$`. Pinned: gh 2.93.0 ✓ authed ✓; `--json title,body` ✓; `close --comment/--reason` ✓.
- **Jira** (a `custom` script wrapping the Atlassian MCP / a CLI):
  - `resolve <id>` → `getJiraIssue` (`fields: [summary, description]`,
    `responseContentFormat: markdown`) → title=summary, brief=description.
  - `complete <id> <refs…>` → `transitionJiraIssue` → Done + `addCommentToJiraIssue` (refs).
  - id-form: `^[A-Z][A-Z0-9]+-\d+$` (e.g. `PROJ-42`). Pinned: MCP tools present ✓
    (getJiraIssue/transition/addComment); complete NOT exercised live.

Both recipes' failure modes (tool missing/unauthed, 404) are runtime blockers via the `custom` seam —
the script exits non-zero, which the framework escalates (ADR-058/059). **Linear** has no MCP in this
environment, so it is just another `custom` recipe a user would write; it is NOT a built-in source.

### CORE deltas (the scored surface)

**`engine/src/manifest.js` — `validateBacklog(backlog, fileExists, errors)`**, called from a new
`case 'backlog':` in the switch (mirrors `validateModels`/`validateScripts`):

- Rejects a non-object `backlog` (a string, array, or scalar) → `backlog must be an object { source, ref }`
  (ADR-054). There is NO string→file coercion and no migration carry. (The accumulate-don't-throw house
  style holds: this is one `errors.push`, no short-circuit.)
- Accepts an object `{ source, ref }`. Unknown sub-key under `backlog` → `unknown backlog field: <k>`.
- `source ∉ BACKLOG_SOURCES` (`Object.freeze(new Set(['file', 'custom']))`) →
  `unknown backlog source: <source> (expected one of file, custom)`. A non-built-in tracker value
  (`github-issues`/`jira`/`linear`) gets the targeted hint mirroring the `mutation-triager` rename
  pattern: `backlog source '<source>' is not built-in — use source: custom with a ref to a resolver
  script` (ADR-055).
- `ref`: for `file`, route through `checkFileRef('backlog.ref', ref, fileExists, errors)` (existing
  helper — the ref must be an existing path). For `custom`, `ref` is a runtime-resolvable script/command
  string: required-and-non-empty but NOT a `fileExists` check — a `custom` ref is resolvable at runtime,
  so a missing/non-exec script is a *runtime* blocker, not a config error (ADR-055/058). `file` with no
  `ref` defaults to the current backlog path convention.

**`engine/src/resolve.js` — `buildManifestRecords`** replaces the existing `typeof manifest.backlog
=== 'string'` branch (lines 127–131) with object-shaped reading that names the resolved source, e.g.
`backlog: source "custom" (ref: <ref>) — Backlog.resolve required at input-classify.` A `file` source
emits the file-shaped line (S6 still matches `/backlog/i`). A new helper `backlogSourceOf(backlog)`
normalises the object into a `source` string (`file` | `custom`) so the record line and any future
consumer share one source-of-truth. This is the line the run record shows; it MUST name the active
adapter (Requirement 3).

No other `engine/src` file changes. *When complete fires* needs no new code — it is already the
delivery-archetype ordering in the walk (`documentation`'s tick runs after `propose` has the PR), an
existing invariant. **The whole mutation-scored surface is exactly:** one validator helper
(`validateBacklog`) + its `case 'backlog':` wiring + one constant set (`BACKLOG_SOURCES = {file, custom}`)
+ the `github-issues`/`jira`/`linear` → "use custom" rejection hint + the `checkFileRef` route for
`file.ref` and non-empty-only check for `custom.ref` (all in `manifest.js`); plus the record-line
generalisation + `backlogSourceOf` source-normaliser naming `file | custom` (in `resolve.js`). Nothing
else in `engine/src/**` changes.

### PORT/ADAPTER deltas (the prose surface)

The per-source resolve/complete procedures + the failure-is-a-blocker escalation live in **one new
spec doc, `docs/adapters/backlog.md`** (ADR-056), referenced from `skills/run/SKILL.md` step 2 and
`skills/documentation/SKILL.md` step 2 — not inlined into the skills, not a contract clause. The spec
holds: the port interface (`resolve`/`complete`), the `file` adapter procedure, the `custom` invocation
contract (stdout shape for `resolve`, exit-0-on-success + the script's idempotency contract for
`complete`), and the gh + jira **custom recipes** above. The shape:

- **Resolution (`skills/run/SKILL.md` step 2)** gains a one-line pointer to the spec + source-dispatch:
  classify the input as a backlog id (for `file`, by the repo's backlog convention — prose-judgment,
  ADR-060; for `custom`, the script owns the id-form), then `resolve` via the source's mechanism
  (`file` → Edit read; `custom` → `<ref> resolve <id>`). id-not-found or an unreachable `custom` source
  → runtime blocker (Requirement 4/5), never a guessed brief.
- **Tick (`skills/documentation/SKILL.md` step 2)** generalises "Backlog tick — guarded" by source:
  `file` → today's `craft:backlog-ticker` path with its exact-line diff guard (unchanged);
  `custom` → run `<ref> complete <id> <refs…>`, **non-zero exit ⇒ blocker** (never a silent tick-skip,
  §11/ADR-059). Idempotency for `custom` is the script's documented contract (stated in the spec doc),
  NOT framework-asserted — the framework guarantees the seam, not the tracker (ADR-055/059).
  `agents/backlog-ticker.md` stays the `file` adapter body verbatim.
- **Failure→blocker** is already `contracts/core.md`'s "Adapter failure is a blocker, never a silent
  pass" line, injected into every spawn (ADR-057). No reinforcing clause is added to
  `contracts/delivery.md`; the adapter spec *references* the core invariant, never restates it (the P5
  "one contract home, no duplicated invariant text" rule).

### Error semantics (failures split by class — ADR-058)

Failures split into two classes by where they are detectable, NOT both onto one path:

1. **Config errors** — knowable from the manifest alone, no I/O: non-object `backlog`, unknown
   `source`, unknown sub-key, missing required `ref`, a `file` `ref` that does not exist. Caught by
   `validateBacklog`; surfaced as a **non-zero exit** from `manifest-lint` / `pipeline-resolve` — the
   run STOPs at `run/SKILL.md` step 1 (the existing loud-STOP path).
2. **Runtime errors** — knowable only by invoking a live tool: a `custom` script
   missing/non-exec/non-zero, an id absent from the source (`resolve` not-found), a wrapped tool
   unauthed/down. These escalate via the **session blocker protocol** `{ unit, reason, ≤3 options }`.
   The pure engine never probes a live tool.

Because `custom.ref` is runtime-resolvable, a missing/non-exec `custom` script is a **runtime** blocker,
not a config error — `validateBacklog` checks only that `custom.ref` is a non-empty string (ADR-055/058).
The `custom` `complete` guard is exit-code + a documented idempotency contract (ADR-059): a non-zero
exit is a blocker (never a silent tick-skip, §11), a zero exit is taken as success, and idempotency is
the script's responsibility, not the framework's.

## Decisions (ratified)

Every load-bearing choice this design surfaced was taken to the decisions phase and ratified as an ADR.
This table records the decisions made (not open questions); each row names the chosen option and its ADR.
Two rows (DC-1, DC-2) were **decided AGAINST the designer's original recommendation** — the design above
has been revised to match the ratified choice.

| # | Choice | Ratified decision | ADR |
|---|---|---|---|
| 1 | Bare-string `backlog: <path>` form at validation | **Hard-reject** — `backlog` MUST be an object `{ source, ref }`; a non-object is a named validation error (`backlog must be an object { source, ref }`), surfaced by `manifest-lint`/`pipeline-resolve` as a non-zero loud STOP. No string→file coercion, no migration carry. The two existing string-form tests + the S6 fixture migrate to the object form. *(reverses the designer's "migrate-with-record" recommendation.)* | [054](adr/054-backlog-manifest-object-shape.md) |
| 2 | Source set / per-tracker adapters | **Two-source model `{ file, custom }`** — `file` is the only built-in adapter; `custom` is a single runtime-resolvable escape hatch (`<ref> resolve/complete`) wrapping any tracker. `github-issues`/`jira`/`linear` are NOT valid sources — the validator rejects them with a "use source: custom with a ref to a resolver script" hint. gh/jira survive as documented **custom recipes** in the spec doc, not built-in sources. *(reframes beyond the designer's "enumerated sources" recommendation.)* | [055](adr/055-backlog-two-source-model.md) |
| 3 | Physical home of the adapter procedures | **One new `docs/adapters/backlog.md` spec**, referenced from `skills/run` + `skills/documentation` — not inlined, not a contract clause. | [056](adr/056-backlog-adapter-spec-doc.md) |
| 4 | Where the failure-is-a-blocker clause lives | **Rely on the existing `contracts/core.md` line** (injected into every spawn); no reinforcing clause in `delivery.md`. The spec references it, never restates it. | [057](adr/057-backlog-blocker-clause-core.md) |
| 5 | How failures surface | **Split by failure class** — config errors (non-object backlog, unknown source, unknown sub-key, missing required ref, a `file` ref that doesn't exist) → engine non-zero exit (loud STOP); runtime errors (custom script missing/non-exec/non-zero, id-not-found, tool down) → session blocker protocol. | [058](adr/058-backlog-failure-class-split.md) |
| 6 | `complete` guard for `custom` | **Exit-code + documented idempotency** — non-zero exit ⇒ blocker (never silent); idempotency (re-run converges) is the script's documented contract, NOT framework-asserted. `file` keeps its exact-line diff guard. *(The original DC-6 "single-id post-condition probe" presumed live per-tracker adapters; the two-source reframe (ADR-055) made a custom tracker opaque/un-probeable, so the ratified guard is exit-code-only — the framework guarantees the seam, not the tracker.)* | [059](adr/059-custom-complete-guard.md) |
| 7 | The `file` id-form predicate | **Keep prose-judgment** — `run/SKILL.md` step 2 classifies a `file` id by the repo's backlog convention; no engine regex, no `backlog.id-pattern` knob. `custom` id-form is the script's concern. The manifest knob is the pre-analysed deferred upgrade path. | [060](adr/060-file-id-form-prose-judgment.md) |

## Test strategy

**Mutation-adequate engine tests (the scored surface — `engine/src/**`, Stryker):**

- `engine/test/manifest.test.js` — `validateBacklog`: Given/When/Then per branch, `sut = validateManifest`.
  Cases: valid `{source: file, ref: <existing>}` → ok; valid `{source: custom, ref: <non-empty>}` → ok
  (and asserts the `custom` ref is NOT path-checked — a non-existent `custom.ref` still passes
  validation, kills the mutant that would route `custom.ref` through `checkFileRef`); non-object
  `backlog` (string/array/number) → error contains `backlog must be an object`; `{source: bogus}` →
  error contains `unknown backlog source`; `{source: linear}` (also `github-issues`, `jira`) → the
  targeted "use source: custom" hint (kills the rename-hint mutant, mirrors the existing
  `mutation-triager`→`validation-triager` test at `manifest.test.js:695`); unknown sub-key →
  `unknown backlog field`; `file` with a missing ref file → `checkFileRef` miss; `{source: custom}`
  with empty/absent `ref` → required-ref error. An **exactly-one-error count** assertion through a
  single bad field (mirrors ADV-1) to kill accumulator off-by-one mutants. The **migrated** string
  case: `engine/test/manifest.test.js:53` (`backlog: 'my-backlog'`) changes to
  `backlog: { source: file, ref: <existing> }`; a *new* case asserts a bare string now ERRORS with
  `backlog must be an object` (pins ADR-054's hard-reject — the reverse of the old migrate trap).
- `engine/test/resolve.test.js` — `buildManifestRecords`/`backlogSourceOf`: object-form `{source: file}`
  and `{source: custom}` each emit a record line whose text names that source (kills the string-literal
  mutants that would collapse both sources to one label, and the mutant swapping `"custom"`→`""`);
  `file` still matches `/backlog/i`; absent backlog → no line. A marker assertion per source (mirrors
  ADV-2 producer-content marker).
- `engine/test/scenarios.test.js` — **S6 strengthened**: the partial assertion at line 432
  (`r.toLowerCase().includes('backlog')`) becomes a source-naming assertion (the record names the active
  adapter). The S6 fixture `engine/test/fixtures/scenarios/S6/manifest.yml` migrates from
  `backlog: PROJ-42` to `backlog: { source: file, ref: <existing> }` (or a `custom` variant); the `file`
  variant is the byte-for-byte characterization (Requirement 1).

**Manifest-lint bats fixtures (`test/fixtures/manifest/` + `test/manifest-lint.bats`):**

- file-good (`{source: file, ref: <existing>}`) → exits 0, "valid."
- file-bad-ref (`{source: file, ref: <missing-file>}`) → exits 2, references-missing-file message.
- custom-good (`{source: custom, ref: ./scripts/backlog.sh}`) → exits 0 (the ref is NOT path-checked).
- custom-bad (`{source: custom}` with no/empty `ref`) → exits 2, required-ref message.
- unknown-source (`{source: bogus}`) → exits 2, output contains `unknown backlog source`.
- linear→use-custom (`{source: linear}`) → exits 2 with the `use source: custom` hint (pins ADR-055).

**Existing-fixture migration (REQUIRED — the hard-reject would otherwise turn fixtures red):** the
bare-string `backlog:` in the passing fixture `test/fixtures/manifest/valid-basic.workflow.md`
(currently `backlog: my-backlog`) MUST migrate to `backlog: { source: file, ref: <existing> }` — under
ADR-054 a bare string now fails validation, so leaving it would flip a green bats fixture red. This is
a *third* migration site beyond the two named in ADR-054 (the `manifest.test.js:53` unit case and the
S6 scenario fixture).

**File-default characterization (the regression floor):** the migrated S6 `file`-shaped behaviour and
the `craft:backlog-ticker` single-edit flip-and-append must stay green — the `file` path is unchanged
(Requirement 1). The whole `node --test` + bats suite stays green at every commit; never `--no-verify`.

**Parked `backlog-lint` item:** `BACKLOG.md`'s parked "backlog-lint / design-lint structure lints"
(routed to "P6/P11") is the optional half of the backlog template enforcement. It is RELEVANT here only
as the manifest-lint backlog fixtures above; the full template-structure lint (does a backlog *entry*
match `templates/backlog.md`) is a separate concern and stays parked unless folded in as a decision —
flag, do not silently absorb.

## Out of scope

- **Per-tracker built-in adapters.** `github-issues`/`jira`/`linear` are NOT built-in sources
  (ADR-055); they are documented `custom` recipes. The framework owns exactly one external contract
  (its own `file` markdown) plus the generic `custom` invocation contract — not N trackers' uptime/wire
  formats. A real per-tracker built-in adapter is out of scope.
- **Live gh/jira round-trip E2E.** No live `gh issue close` or Jira transition is run in CI — the gh/jira
  recipes are pinned empirically (read-only probes) and the wire mechanism is prose; a live round-trip
  would mutate a real tracker and needs credentials CI lacks.
- **Linear adapter / MCP.** No Linear MCP in this environment; `linear` is rejected as a `source` and is
  just another `custom` recipe a user would write (ADR-055). A built-in Linear adapter is not designed
  from memory of an unpinned external system.
- **A JS I/O bin for resolve/complete.** The engine stays pure/no-I/O (ADR-002); the adapters are
  tool-backed prose the session/agent runs. Building an `engine/bin/backlog-*.js` that shells out is
  explicitly not this change.
- **A `backlog.id-pattern` manifest knob / machine-enforced `file` id-form.** Deferred (ADR-060): the
  `file` id-form stays orchestrator prose-judgment. The knob is the pre-analysed upgrade path if a future
  repo needs machine-enforced `file` id-matching — deliberately not foreclosed, not built here.
- **Inserted-phase / derived-plugin registration.** A custom *backlog adapter shipped by a derived
  plugin* (vs a repo `custom` script/command) rides with the P14 registration surface, not here.
- **The `when-complete-fires` ordering itself.** Already enforced by the delivery-walk ordering; this
  change consumes it, it does not rebuild it.
