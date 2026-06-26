# Memory adapter spec

## Port interface

- `load(repoRoot, deps) → MemoryView` — read and validate the store rooted at `repoRoot`; return
  a MemoryView whose `entries` contain only the observations that survived validate-on-read.
  - **pre**: `repoRoot` is the resolved worktree/checkout root (never the plugin dir); `deps`
    carries `readStore: (path) => string|null`, `validators: { [concern]: (entry) => bool }`, and
    optional `ref` (the configured `memory.ref`, default `.claude/craft-memory.md`). The port
    joins `ref` under `repoRoot` and, if the resolved path escapes the root, reads nothing and
    returns an empty view (traversal containment) — it never reads outside the repo.
  - **post**: `entries` is keyed by the five concerns; entries that fail their concern's
    validate-on-read predicate are dropped from `entries` and listed in `evicted`; `loadNote`
    records the reason when the view is empty or partial. An absent/empty/malformed store returns
    an **empty view, never an error** (advisory-only invariant — ADR-116). The returned view
    never contains a gating value; the load path never throws.

  Store location: `<repoRoot>/.claude/craft-memory.md`. Metrics live separately in
  `<repoRoot>/.claude/craft-metrics.md` (ADR-119) — they are never loaded or written by this
  port.

- `save(repoRoot, view, delta, deps) → { writeNote: string|null, view: object }` — flush the
  run's buffered observations into the store as one atomic write.
  - **pre**: `view` is the MemoryView returned by `load()` at run start (stale entries already
    removed); `delta` is the array of buffered `{ concern, payload }` observations for this run;
    `deps` carries `writeStore: (path, content) => void`, optional `ref` (the configured
    `memory.ref`, default `.claude/craft-memory.md`, joined under `repoRoot` with the same
    traversal containment as `load`), optional `caps`, and optional `run` provenance
    (`{ run, commit, date }`). A `ref` that escapes the root skips the write with a `writeNote`
    warning — it never writes outside the repo.
  - **post**: the store reflects the reconciled result of applying the ADDED / REFRESHED /
    DECAYED / EVICTED transitions plus both-caps eviction; the write is a single
    `deps.writeStore` call (no half-write); non-re-observed entries are **decayed, not deleted**;
    a failed `writeStore` is recorded in `writeNote` and `save` returns normally — it never
    throws and never blocks (ADR-120).

## Core policy retained (NOT port verbs)

The following decisions are owned by the orchestrator/core and are not re-decided by any
adapter:

- **Per-phase write surface**: which concern each phase contributes and the exact fields it is
  permitted to write are fixed by the orchestration spec and this document's content whitelist.
  An adapter persists/loads bytes; it never decides what, how much, or how an entry is re-checked.

- **Validate-on-read policy**: each concern carries a cheap predicate the engine evaluates on
  every loaded entry. `part-sizing` defaults to `() => true` when no validator is provided
  (weak planner hint — no stable re-check). The validate-on-read map is injected at call-site
  via `deps.validators`; the adapter applies it but does not define it.

- **Confidence/decay model + canonical constants** (from `engine/src/memory.js`):
  - `FLOOR = 0` — minimum confidence (inclusive); an entry decayed to this value is evicted
  - `CEILING = 5` — maximum confidence; refreshes cannot raise above this
  - `STEP = 1` — increment/decrement applied per refresh/decay cycle
  - `WINDOW = 50` — size of the newest-entry candidate window for cap eviction
  - Transitions: ADDED (new observation, starts at `FLOOR + STEP = 1`), REFRESHED (re-observed,
    confidence `+STEP` up to CEILING; payload rewritten only when `improves()` is true), DECAYED
    (not observed this run, confidence `-STEP`; evicted when it would reach FLOOR), EVICTED
    (confidence at/below FLOOR or dropped by cap eviction).

- **Advisory-only bound (ADR-116)**: the store is never a gate. A malformed/unreadable store is
  a recorded load no-op, not a blocker. A failed `save` is a recorded warning (ADR-120), not a
  blocker. The memory system informs phases; it never blocks them.

- **Size ceiling + both-caps eviction (ADR-122)**: `evictToCaps` loops until the store fits both
  `maxEntries` and `maxBytes`. Only the WINDOW (50) newest entries are candidates for cap
  eviction; within the window the least-relevant entry (lowest confidence; ties → oldest
  provenance date) is dropped first.

- **Per-repo scoping**: the store is always rooted at the individual repo's worktree via
  `repoRoot`; cross-repo sharing is never performed.

- **Store committed via re-include (ADR-118)**: `.claude/craft-memory.md` lives in the repo and
  is committed (via gitignore re-include) so it persists across worktrees and sessions.

- **Content whitelist (ADR-123)**: the per-concern schemas below are the enforcement surface.
  Compliance rests on this spec + each phase's documented write surface + human review of the
  diffable store. There is **no reject-at-write code and no schema lint**; this document is
  intentionally the only enforcement layer.

## Binding set

The valid bindings are **`{ claude, pi }`**.

## Claude binding

`load`: called once per run, at run start, by the session orchestrator. Reads
`<repoRoot>/.claude/craft-memory.md` via the injected `deps.readStore` (typically
`fs.readFileSync`). The single `MemoryView` is held in-session for the duration of the run.

At each phase's entry the orchestrator slices the concern(s) the phase reads and **prepends the
relevant entries into the step-3 injected contract block** as part of the pre-chewed context
(`skills/run/SKILL.md` §"Agent spawns" slot 1). This is the single injection surface — it
applies identically whether the phase spawns (block prepended to the Task prompt) or runs inline
(block loaded at phase entry).

`save`: called once per run, at run end, by the session orchestrator. Writes
`<repoRoot>/.claude/craft-memory.md` via `deps.writeStore` (typically `fs.writeFileSync`).
Metrics come from the usage block the spawn already returns — zero extra cost.

## Pi binding

Identical filesystem semantics rooted at the pi run's working directory; `deps.readStore` and
`deps.writeStore` are filesystem calls against `<workingDir>/.claude/craft-memory.md`.

Pi has no fan-out, so per-phase context injection is sequential: between each `pi -p` subprocess
invocation the orchestrator reads the concern slice from the in-memory view and prepends it to
the next invocation's injected block. The artifact-handoff invariant carries state between pi
phases (see `docs/adapters/execution.md` Pi binding). Metrics are collected per-phase from each
subprocess's output.

### Custom adapter (documented future seam)

`source: custom` is reserved as a future escape hatch — a named script invoked for `load` and
`save` in the same subprocess-argv pattern as the backlog adapter. It is **not implemented**;
the validator rejects `source: custom` with a targeted hint to wait for the built binding or
patch the engine. Only `file` (the default, built-in binding above) is currently valid.

## Failure → blocker

**Runtime errors are never blockers.** The advisory-only invariant (ADR-116) covers both verbs:

- A store that is absent, empty, malformed, or has validate-on-read failures is a **recorded
  load no-op** — `load` returns an empty or partial view; the run continues with whatever is
  available.
- A `save` that cannot write (disk full, permission denied) is a **recorded warning**
  (`writeNote` is set on the returned result); `save` never throws and never blocks (ADR-120).
- There is **no locking**: last-flush-wins across concurrent sessions.

**Config errors** (knowable from the manifest alone, no I/O): an unknown `memory:` sub-key, an
unrecognized `source` value, or a `custom` ref that is missing but that binding is not yet
implemented. These are caught by the manifest validator at startup; surfaced as a non-zero exit
before any phase begins (same pattern as `backlog.md` and `model.md` config-error rows).

## Content whitelist (per-concern entry schemas)

HARD BAN: only mechanically-derived, mechanically-validatable facts. **No free-form text, no
semantic summaries, no "this codebase prefers X" prose, no LLM-inferred content, no code
snippets, no PII.** Each field value must be a string, number, or boolean that another tool or
script could independently verify. This ban is enforced **document-only** (ADR-123): the spec
defines the schemas and forbids non-mechanical content; each phase's documented write surface is
trusted to comply; human review of the diffable store is the final check.

Concerns are the five keys exported as `CONCERNS` from `engine/src/memory.js`:
`toolchain`, `gate-cmd`, `validation-tool`, `findings`, `part-sizing`.

| Concern | Entry shape (fields) | Merge key | Validate-on-read re-check | Explicitly NOT stored |
|---|---|---|---|---|
| `toolchain` | `{ ecosystem, lockfileFingerprint }` | `ecosystem` | `ecosystem` is a non-empty string; `lockfileFingerprint` is a non-empty string | dep names/versions, install logs, prose summaries |
| `gate-cmd` | `{ phase, command }` | `phase` | `phase` is a non-empty string; `command` is a non-empty BARE command (no leading env/secret assignment prefix) | exit codes, timing, command output, env/secret prefixes (e.g. `TOKEN=…`) |
| `validation-tool` | `{ id, configFingerprint }` | `id` | `id` is a non-empty string; `configFingerprint` is a non-empty string | config contents, validation scores, test output |
| `findings` | `{ file, severity, pattern }` | `file` + `pattern` | `file` is a non-empty repo-RELATIVE path (never absolute — no `$HOME`/username); `severity` is one of `low\|medium\|high\|critical`; `pattern` is a non-empty string | file content, stack traces, prose explanations, absolute paths, PII |
| `part-sizing` | `{ size, outcome }` | `size` | no stable re-check (defaults to `() => true`) | rationale, effort estimates, free-form notes |

Every entry also carries the engine-managed fields `confidence` (integer `FLOOR`..`CEILING`) and
`provenance: { run, commit, date }` (SHA + ISO date). These are written by the reconciler, not
by the phase write surface. Example provenance: `{ run: "run-001", commit: "a1b2c3d", date: "2024-03-15" }`.
