---
subjects:
  - engine/src/intention*.js   # intention.js, intention-subjects.js, intention-lint-main.js
  - engine/src/glob.js         # shared matcher — advisory over-flag trade-off
---
# Intention adapter spec

## Port interface

- `consult(scope, deps) → IntentionView` — return the living pages whose declared subjects
  intersect `scope`, as `{ path, purpose }` pairs.
  - **pre**: `scope` is a set of repo-relative paths — the touched set for the change or phase
    under consideration; `deps` carries `readPage: (page) => string|null` and
    `listCorpus: () => string[]`, both injected. The port never touches the filesystem itself.
  - **post**: `entries` contains one `{ path, purpose }` pair per page whose subjects intersect
    `scope` — `purpose` is the page's one-line summary (its heading or first summary line). A
    page that carries no usable subjects is omitted from `entries` and listed in `skipped` as
    `{ page, reason }`. An unreadable page (`deps.readPage` returns `null`) is skipped, never
    rejected. `consult` **never throws**.

  ```json
  {
    "entries": [{ "path": "docs/contributing/specs/telemetry.md", "purpose": "Telemetry adapter spec" }],
    "skipped": [{ "page": "docs/contributing/prd/DESIGN-history.md", "reason": "no-subjects" }]
  }
  ```

- `record(entry, deps) → refs` — persist an ADR, a page refresh, or a page creation, and return
  the refs that were written.
  - **pre**: `entry` describes what is being persisted — its kind (ADR / page refresh / page
    creation), target, and content; `deps` carries the backend's write primitive, injected.
  - **post**: `refs` is the list of references written (an ADR id, a page path, …). A `record`
    that cannot complete escalates as a blocker rather than silently dropping the entry.

  For the built-in `file` backend this verb is a thin relabel of today's ADR and living-page
  writes — no new write path, no new location. The verb exists as a seam so a non-file backend
  receives the same writes at the same call sites; what "persisting" means for that backend is
  entirely its own concern.

- `assert-fresh(change, deps) → report` — the freshness/coverage guard.
  - **pre**: `change` describes what shifted since the last assertion — which paths changed,
    which pages were touched by the same change, which pages carry a waiver, and (optionally)
    which scopes are declared load-bearing. How a backend computes `change` is its own concern.
  - **post**: `report` never signals a gating decision — gating is the engine's decision, driven
    by the `intention.gate` configuration knob, never the adapter's. `assert-fresh` **never
    throws**; an input it cannot reason about (e.g. an empty changed set) yields an empty,
    advisory report, not an error.

  Report shape (`schemaVersion: 1`, deep-sorted-serializable — every object's keys sorted
  alphabetically, mirroring the telemetry report convention):

  ```json
  {
    "note": "no living pages carry subjects",
    "schemaVersion": 1,
    "skipped": [{ "page": "docs/contributing/prd/DESIGN-history.md", "reason": "no-subjects" }],
    "stale": [
      {
        "changedPaths": ["engine/src/observability/memory.js"],
        "page": "docs/contributing/specs/telemetry.md",
        "waived": false
      }
    ],
    "uncovered": [{ "scope": "engine/src/observability/**" }]
  }
  ```

  - `stale[]` — one entry per page whose subjects were touched by the change, was itself not
    touched, and carries no waiver. `waived: true` marks a page that would otherwise be stale but
    carries a waiver — it is still reported (a telemetry-style record of the decision) but never
    carries drift.
  - `uncovered[]` — present only when the caller declares load-bearing scopes; a scope matched by
    no page's subjects appears here. Absent that declaration, `uncovered` is always `[]` — a
    recorded no-op, not an omission.
  - `skipped[]` — pages with no usable subjects; skip is advisory, never an error.
  - `note` — set only when nothing in the corpus carries subjects to assert against; omitted
    otherwise.

  Each non-waived `stale` entry emits, one line per changed path, the run-record token
  `INTENTION-DRIFT(<page>): <changed-path>` (see Token vocabulary below).

## Source set

The valid sources are exactly **`{ file, custom }`**.

- `file` is the only built-in adapter — the zero-config default, described in full below.
- `custom` is the single runtime-resolvable escape hatch: a `ref` script the session invokes
  with discrete arguments for all three verbs.

`rag`, `wiki`, `notion`, `confluence`, and `code-graph` are **not** sources — they are documented
recipes for backends a project wires up itself via `source: custom`. The manifest validator
rejects any of these as an `intention.source` value with a targeted hint to use `source: custom`.

## Token vocabulary

Two fixed, greppable tokens join the existing run-record family (`NO-OP(<phase>):`,
`GATE(<phase>):`, `WAIVER:`, …). They are engine/protocol-level — every backend, built-in or
custom, emits them identically:

- `INTENTION-DRIFT(<page>): <changed-path>` — one line per changed path on a non-waived stale
  page, carried into the run record and the PR body.
- `INTENTION-WAIVE(<page>): <reason>` — marks a page's staleness as acknowledged and accepted; a
  waived page never emits `INTENTION-DRIFT`.

## `custom` invocation contract

The `ref` script is invoked as a subprocess with **discrete argv** for each verb. `scope`,
`entry`, and `change` are untrusted — they originate from a diff, a phase's working set, or the
environment — so they are passed as literal argv elements, never interpolated into a shell
string:

- `consult` → argv `["consult", scopeJson]`: the script prints the `IntentionView` JSON on
  stdout.
- `record` → argv `["record", entryJson]`: exit `0` = success, non-zero = a blocker.
- `assert` → argv `["assert", changeJson]`: the script prints the report JSON on stdout; **a
  non-zero exit is a runtime blocker**, never a silent pass.

Safe-invocation rules are inherited verbatim from the backlog adapter spec's "Safe invocation"
section: pass an argv array, never a shell string; double-quoting an interpolation is not a
sandbox; the `ref` is presence-checked at manifest validation time, reachability is a runtime
concern only. This section defines the mechanical contract only — worked recipes for specific
backends are documented separately.

## Failure → blocker

Failure splits by where it is detectable, matching every other adapter spec:

- **Config errors** (knowable from the manifest alone, no I/O): a non-object `intention` block,
  an unknown `source` or `gate` value, an unknown sub-key, a missing `ref` for `source: custom`,
  or a `file` `ref` that escapes the repo root or does not exist. These are caught by the
  manifest validator at startup and surfaced as a non-zero exit **before any phase runs**.
- **Runtime errors** (knowable only by invoking a live backend): a `custom` script that is
  missing, non-executable, or exits non-zero. These escalate through the injected blocker
  protocol (`{ unit, reason, ≤3 options }`) — the same invariant every other adapter relies on
  without restating it.

## `file` adapter procedure

The zero-config default. No new runtime dependency; every mechanic below is built from
primitives already in the codebase.

**Subject declaration.** A living page opts in by declaring `subjects: [<globs>]` in line-1
frontmatter — the same frontmatter convention used elsewhere in the codebase: a block absent
entirely parses to nothing (advisory skip); a block present without a `subjects` key also skips;
a block that opens but mis-types its YAML fails loud. Consult filtering, freshness, and coverage
all derive from this single declaration — there is no parallel map file and no second source of
truth. A page without `subjects` is never an error; incremental adoption is the expected steady
state.

**Freshness = glob ∩ diff.** `change` for the `file` backend is the branch's cumulative diff
against its base. A page `P` with subjects `G` is stale when some changed path matches some glob
in `G`, `P` itself was not touched by the change, and no waiver names `P`. A diff that cannot be
computed yields an empty changed set — an advisory no-op, never a failure.

**Waiver.** The `INTENTION-WAIVE(<page>): <reason>` token, placed in the change's design doc or
PR body, marks a page's staleness as accepted.

**Coverage.** An optional `intention.covers: [<globs>]` configuration entry declares scopes that
must be governed by at least one page's subjects; a scope matched by no page is `uncovered`.
Without a `covers` declaration, the coverage check is a recorded no-op — probing may *propose* a
covers list, never *impose* one.

**Zero-config probe.** With no `intention:` configuration key at all, the `file` backend probes
the conventional corpus: `docs/contributing/specs/*.md`, `docs/contributing/prd/DESIGN-*.md`,
`docs/contributing/DOD.md`, `docs/guides/customizing.md`, `docs/guides/concepts.md`. Pages in
that corpus without `subjects` yield advisory notes only —
a bare repository runs exactly as it does today. Frozen records (design history, archived docs,
per-run design docs, decision records) simply carry no `subjects`, so they are never
freshness-guarded, by construction.

**`record` for `file`.** ADR writes and living-page refresh/create route through today's existing
write locations, unchanged — this backend's `record` adds no new write path.

## Custom recipes (copy-paste reference)

These are worked examples to copy into a `custom` resolver script for `intention.source:
custom`. They are not built-in sources.

### Code-graph consult — `custom` script wrapping a code-graph query server

A code-graph server that already tracks file-level dependencies can widen `consult`'s input set
beyond literal glob matches: a changed file's *structural dependents* may be governed by a page
whose `subjects` glob never names the changed file itself.

- **consult:** argv `["consult", scopeJson]` — the script parses `scope` (the changed
  repo-relative paths), asks the code-graph server for each path's dependents, unions that
  expanded set with `scope`, then reuses the `file` adapter's subjects-intersection rule against
  the corpus to build `{ entries, skipped }`; prints the `IntentionView` JSON on stdout.
- **record / assert:** documented only, not exercised here. A code-graph server has no natural
  write verb for architectural intention, so a script wrapping one typically delegates `record`
  and `assert` to the `file` adapter's existing ADR/page writes and glob ∩ diff arithmetic — only
  `consult`'s input set changes.
- **scope-form (enforce before invoking):** each `scope` entry must be a repo-relative path with
  no leading `/` and no `..` segment — `^(?!/)(?!.*\.\.)[\w./-]+$` — refuse (blocker) on a miss.
- **Pinned:** a code-graph server (tokensave) present in this session; the dependents step was
  exercised live — querying `engine/src/frontmatter.js`'s dependents returned 7 real files,
  including `engine/src/dod.js` and `engine/src/observability/memory.js`, confirming the widening
  step returns real structural data. The subjects-intersection and the `record`/`assert`
  delegation were not exercised live — documented only.

Failure modes (server unreachable, an index that is stale or absent) are runtime blockers via the
`custom` seam — the script exits non-zero.

### Wiki record + consult — `custom` script wrapping a structured page-CRUD server

A wiki whose pages are the intention corpus can back `record`/`consult` directly: `record`
creates or refreshes a page, `consult` fetches pages and applies the same subjects-intersection
rule the `file` adapter uses.

- **record:** argv `["record", entryJson]` — map `entry.target` to a page id/title and
  `entry.content` to the page body; create the page if absent, otherwise update it in place;
  print the written refs (page id/link) on stdout; exit 0 = success, non-zero = blocker.
- **consult:** argv `["consult", scopeJson]` — list pages under the configured space, read each
  page's stored `subjects` metadata, apply the same intersection rule as the `file` adapter, and
  print `{ entries, skipped }` on stdout.
- **id-form (space key, enforce before invoking):** `^[A-Z][A-Z0-9]{1,9}$` — refuse (blocker) on
  a miss.
- **Pinned:** a structured page-CRUD server (the Atlassian MCP) present in this session
  (`getConfluencePage`, `createConfluencePage`, `updateConfluencePage`) — tool presence confirmed;
  neither verb was exercised live (a create/update is a real side effect against a live space) —
  documented only.

Failure modes (space missing, unauthenticated, unreachable) are runtime blockers via the `custom`
seam — the script exits non-zero.

### Embedding-index consult — `custom` script wrapping a nearest-neighbor index

An embedding index over the intention corpus can answer `consult` by nearest-neighbor lookup
instead of glob matching: embed each path in `scope`, query the index for the nearest pages, and
return them as `entries` above a similarity floor.

- **consult:** argv `["consult", scopeJson]` — embed each `scope` entry, query the index for its
  nearest pages, keep matches above a fixed similarity floor, and print `{ entries, skipped }` on
  stdout (a page below the floor is not a miss — it is simply absent from `entries`, matching
  `consult`'s never-throws contract).
- **record / assert:** documented only. An index needs re-embedding after a page write, so a
  script wrapping one typically re-indexes the written page inside `record` and otherwise
  delegates freshness arithmetic to the `file` adapter.
- **scope-form (enforce before invoking):** same repo-relative-path allowlist as the code-graph
  recipe above — refuse (blocker) on a miss.
- **Pinned:** no embedding-index server is present in this session — this recipe is documented
  only, never exercised.

Failure modes (index unreachable, an empty index) are runtime blockers via the `custom` seam —
the script exits non-zero.
