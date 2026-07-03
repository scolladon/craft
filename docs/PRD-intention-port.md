# PRD — Intention port: aggregate, guard, and wire architectural intention

> Status: **draft for discussion** — outcome of the 2026-07-03 design conversation.
> This is a pre-run brief: a later `/craft:run docs/PRD-intention-port.md` produces the
> real design doc; the Decision candidates below are the expected ADR forks.

## 1. Problem

Craft's architectural intention — why the system is shaped the way it is, what each
module is for, which invariants bind it — is **aggregated in four places, guarded in
none of them for freshness or coverage, and fed/consulted through prose convention
only**:

| Store | Role | What guards it today | Gap |
|---|---|---|---|
| `docs/DESIGN-customizable-engine.md` | the living architecture (named SoT by `BACKLOG.md`) | **nothing** — `ci.sh` design-lint enumerates only `docs/design/*.md` + template | not even form-linted; freshness is convention |
| `docs/adapters/*.md` (9 port specs) | living port contracts | **nothing** (only `source-hygiene.bats` greps them for banned tokens) | same |
| `docs/adr/` (198) | append-only decision record | numbering + template convention | fine as history; nothing links decisions to the code they govern |
| `docs/design/*.md` (per-run) | per-change intention record | `design-lint.sh` (required sections = form) | fine as history — frozen at ship time by design |
| `BACKLOG.md` SoT pointer block | the only index naming the above | `backlog-lint.sh` (section headings) | pointers themselves unvalidated |

Feeding and consulting is judgment-only:

- The **documentation phase** picks affected pages by LLM judgment (the affected-page
  probe), refreshes **only pages that already exist**, and cannot create pages or
  notice an unlisted stale page.
- The **designer/planner** consult prior intention only insofar as their prompts say
  "read the repo" — there is no injection seam that slices relevant intention the way
  the memory port slices concerns into the slot-1 context block.
- The **provenance rule** (code never carries intention refs — PreToolUse hook +
  `source-hygiene.bats`) makes traceability deliberately one-way: docs point at code,
  code never points back. So any freshness check must map code paths → intention
  entries from the doc side.

The memory port explicitly does **not** hold this: ADR-123's content whitelist bans
semantic summaries and "this codebase prefers X" prose. Intention is the last
knowledge concern in craft without a port.

## 2. Intent

Make intention documentation a first-class port: the engine owns the invariant —
*"intention is recorded at the seams that produce it, consulted at the seams that need
it, and its living pages are kept demonstrably fresh"* — while a swappable adapter
owns storage and retrieval. Default adapter: plain markdown in-repo, zero-config,
capability-probed, no new runtime dependency.

## 3. Goals

- **G1 — Engine-owned protocol first.** The port contract (verbs, seams, report
  shape, failure semantics, token vocabulary) is defined without reference to any
  storage. The default `file` adapter then adds exactly one mechanical primitive:
  living pages declare their *subjects* (path globs they govern), and everything
  mechanical — consult filtering, freshness, coverage — derives from that single
  declaration. No parallel map file, no second source of truth.
- **G2 — Consult seam.** Design and plan phases receive the intention slice relevant
  to the change (pages whose subjects intersect the touched scope) through the same
  slot-1 injected-context surface the memory port already uses.
- **G3 — Record seam.** The decisions phase records ADRs and the documentation phase
  refreshes/creates living pages **through the port**, so a non-file backend receives
  writes at the same seams.
- **G4 — Guard.** `assert-fresh(change)` reports, per living page: *stale* (a changed
  path matches its subjects, the page was not touched in the branch, and no waiver
  token is present) and *uncovered* (a declared load-bearing scope matched by no
  page). Advisory at introduction (greppable run-record + PR-body line), promotable
  to a gate via manifest knob.
- **G5 — Genericity.** `intention:` manifest key, `source: file` built-in default +
  `source: custom` argv-contract escape hatch (same shape as the backlog port). RAG
  index, external wiki, code-graph tools are documented **custom recipes**, never
  built-in sources.
- **G6 — Close the form gap now.** The living corpus (architecture doc, port specs,
  DOD, GUIDE) enters the lint set: valid subjects frontmatter, resolvable `BACKLOG.md`
  SoT pointers. Cheap, deterministic, day-one.

## 4. Non-goals

- **Machine-verified truthfulness.** Whether a page still *tells the truth* about the
  code is judgment — it stays with the documentation phase (docs-writer sourcing from
  the design doc) and the DoD's judgment criteria. The mechanical guard asserts the
  ritual (the page was reconsidered), not the truth.
- **Folding the memory port in.** Memory stays the mechanical-facts sibling; its
  ADR-123 whitelist ban on semantic prose is load-bearing and untouched.
- **Rewriting frozen records.** `DESIGN-history.md`, `docs/archive/`, per-run design
  docs, ADRs stay append-only history; they are never freshness-guarded (that is what
  kept the DoD per-change section stale — records don't rot, living pages do).
- **Built-in RAG / indexing / external-wiki clients.** Custom recipes only.
- **Per-edit hooks.** No PostToolUse/Stop wiring — intention changes per *change*,
  not per edit; the phase seams and CI are the right granularity.

## 5. Proposed shape (for the design phase to elaborate)

Two layers, and the split is the whole point — the same split as the backlog port:

- **The protocol (engine-owned ceremony).** Three verbs, the seams that invoke them,
  the report shape, blocker/advisory semantics, and the fixed token vocabulary. This
  layer never mentions files. Any backend answering the verbs satisfies it — this is
  where a project plugs its own enforcement (`source: custom`).
- **The `file` adapter (default implementation).** Markdown pages, `subjects:`
  frontmatter, glob-∩-diff freshness. These are this adapter's private mechanics —
  they exist only because craft's zero-config rule requires a fully specified
  no-manifest default, exactly like backlog's `file` adapter.

**Port protocol** — `docs/adapters/intention.md`, verbs:

- `consult(scope) → IntentionView` — pages (paths + one-line purposes) whose subjects
  intersect `scope`; the orchestrator assembles the slot-1 block from the view
  (just-in-time loading, progressive disclosure — never inline whole pages).
- `record(entry) → refs` — persist an ADR / page refresh / page creation; the default
  adapter routes to today's `paths.*` locations byte-for-byte.
- `assert-fresh(change) → report` — stale/uncovered findings as above; never throws;
  gating decided by the engine per the manifest knob, not by the adapter.

**Default (`file`) adapter mechanics:**

- Living pages carry frontmatter `subjects: [<globs>]`. Pages without it are noted
  advisorily and skipped — adoption is incremental, absence is never an error.
- Waiver: fixed greppable token `INTENTION-WAIVE(<page>): <reason>` in the change's
  design doc or PR body (same family as `NO-OP(<phase>):`).
- Drift output: `INTENTION-DRIFT(<page>): <changed-path>` line in the run record,
  carried into the PR body — mirrors the telemetry drift-signal precedent.
- Coverage list: optional `intention.covers: [<globs>]` in the manifest declares the
  load-bearing scopes; absent → coverage check is a recorded no-op (probing can
  propose a list, never impose one).
- Zero-config probe: no `intention:` key → look for the conventional corpus
  (`docs/adapters/`, `docs/DESIGN-*.md`, `docs/DOD.md`); found pages without subjects
  → advisory notes only. A bare repo runs exactly as today.

**Wiring (engine-owned, per-phase):**

| Seam | Verb | Behaviour |
|---|---|---|
| design, plan | `consult` | relevant slice into the slot-1 injected block (memory-port surface) |
| decisions | `record` | ADRs through the port (default: unchanged `docs/adr/` writes) |
| documentation | `record` + mechanical affected-page floor | affected pages = (diff ∩ subjects) ∪ probe judgment; a coverage gap escalates via the blocker protocol (docs-writer stays update-only) |
| validation + CI | `assert-fresh` | advisory drift lines; `intention-lint` in `ci.sh` guards frontmatter validity + SoT-pointer resolution (deterministic parts) day-one |

**Custom adapter contract** (backlog-port shape): `ref` script invoked with discrete
argv — `["consult", scopeJson]` (stdout: view JSON), `["record", entryJson]`,
`["assert", changeJson]` (stdout: report JSON; non-zero exit = runtime blocker).
`id`/paths are untrusted input: argv elements, never shell interpolation. Recipes to
document: tokensave/code-graph consult, Confluence/Notion record+consult, RAG-index
consult.

## 6. Decision candidates (the expected ADR forks)

1. **Port or convention?** (a) **first-class port + `docs/adapters/intention.md`**
   *(recommended — same second-instantiation-proven split as backlog/memory; genericity
   is a hard requirement and only a port delivers it)*; (b) fold into the memory port
   as a semantic concern (breaks ADR-123); (c) no port — lints + prose only (guards
   the default but forfeits pluggability).
2. **Verb set.** (a) **`consult` / `record` / `assert-fresh`** *(recommended — the
   guard must live behind the port or non-file backends are unguardable)*; (b)
   `consult`/`record` only, guard as engine lint (file-backend-only guard); (c)
   `load`/`save` memory mirror (no guard verb at all).
3. **Subject declaration** *(file-adapter scope only — custom adapters map
   change-scope → intention units however they choose).* (a) **`subjects:`
   frontmatter on each living page**
   *(recommended — one primitive, no second SoT, diffs with the page)*; (b) central
   CODEOWNERS-style map file (greppable in one place but a new staleness liability);
   (c) none — keep the LLM-judgment probe (status quo, nothing mechanical to guard).
4. **Guard strength at introduction.** (a) **advisory drift lines + `intention.gate:
   advisory|blocking` knob, deterministic form checks gating from day one**
   *(recommended — consistent with the drift-signal precedent and the
   just-completed guardrail pruning; promote once tuned)*; (b) blocking freshness
   lint day one (ceremony-drag risk); (c) judgment-only DoD criterion (decorates,
   doesn't guard).
5. **Guarded corpus.** (a) **living pages only; ADRs + per-run design docs stay
   append-only, form-guarded history** *(recommended — records don't rot by
   construction)*; (b) everything incl. ADRs (imposes supersession bookkeeping);
   (c) manifest-declared page list only (no zero-config default).
6. **Coverage-gap handling in the documentation phase.** (a) **escalate via the
   blocker protocol; docs-writer stays update-only** *(recommended — smallest
   contract change, human decides whether a new page is owed)*; (b) docs-writer
   gains template-based page creation (delivery-contract amendment); (c) record the
   gap advisorily only.

## 7. Settled by the conversation (constraints, not forks)

- Memory port is a **sibling**, never merged; the two share only the injection
  surface.
- `DESIGN-history.md` stays frozen; it is **not** the adapter's index. No manually
  maintained index at all — anything index-like is derived from subjects (if a
  committed index is ever wanted, use the ADR-196 committed-snapshot-drift pattern).
- No PostToolUse/Stop hook for this concern (wrong granularity).
- Provenance rule unchanged: pages point at code via subjects; code stays free of
  intention refs.
- Default adapter: no new runtime dependency (bash + node built-ins, enumerate-and-run
  in `ci.sh`).

## 8. Success criteria

- **SC1** Zero-config: a repo with no `intention:` key and no subjects frontmatter
  runs byte-identically to today, plus at most advisory notes.
- **SC2** Dogfood: craft's living corpus declares subjects; changing
  `engine/src/observability/*` without touching `docs/adapters/telemetry.md` (or
  waiving) yields an `INTENTION-DRIFT` line in the run record and PR body.
- **SC3** Second instantiation: at least one `custom` recipe exercised to the same
  depth as the backlog port's `gh` recipe (consult path live, record documented).
- **SC4** Deterministic checks (frontmatter validity, SoT-pointer resolution) run
  green in `ci.sh` with zero new dependencies.
- **SC5** Designer/planner spawns demonstrably receive the consult slice for a change
  touching a declared subject (visible in the assembled slot-1 block).
