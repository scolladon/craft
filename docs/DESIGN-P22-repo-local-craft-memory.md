# Design — P22: repo-local craft memory (self-improving per repo)

> Brief: a memory store craft maintains **inside the repo it runs against**, accumulating per-repo
> learnings (toolchain quirks, discovered gate/test commands, recurring review findings, slice-sizing
> that worked, per-phase cost/latency) so each subsequent run on that repo is higher-quality, faster,
> and cheaper. Each run **reads** the store at start (skip re-probing, pre-empt known findings, size
> slices) and **writes back** what it learned at end.
> Status: accepted (ADRs 116-123) — draft → self-reviewed ×3 → refined (load/update lifecycle + memory constraints) → decisions ratified (advisory-cache premise + DC-1..DC-8 → ADRs 116-123). Three decisions deviated from the recommendation and are folded in below: ADR-118 (location → `.claude/craft-memory.md`, committed via re-include), ADR-122 (size bound = both caps, merge-before-insert, newest-window eviction), ADR-123 (whitelist enforced document-only).

This is a **spike-first, then build** task (BACKLOG P22). The spike below resolves the four open
questions — location/format, per-phase contribution, run-over-run measurement, anti-staleness/
anti-poisoning — and pins the in-repo discovery + write surfaces against the live codebase. The build
specifies a **memory port** mirroring the three existing port docs (`docs/adapters/{model,execution,
backlog}.md`), so storage location/format is an adapter concern and the engine owns only the
read/write contract. Genuinely load-bearing forks are surfaced as Decision candidates; the designer
decides none of them.

## Context

### What memory is — and what craft deliberately is NOT (pin the tension first)

craft is a hexagonal feature-delivery engine (`README.md`, `docs/GUIDE-customizing.md` §1): an abstract
phase sequence (`workspace → … → integrate`) that runs **exactly once per invocation**, with a
non-injectable invariant core (`GUIDE §2`). A defining value of that core is **mechanism over memory**:
the engine refuses to rely on the session *remembering* to do anything — ADR-082 rejected an
"already-intended, document only" option precisely because "the release would rely on the session
*remembering* to treat a no-op like a waiver; violates craft's mechanism-over-memory principle." ADR-103
makes the same move ("the ADR-082 ethos: mechanism over memory"). Artifact-is-the-handoff
(`contracts/core.md`, `skills/run/SKILL.md` "Artifact handoff") exists so that **no cross-phase state
lives in agent memory** — a dead worker respawns from the committed artifact, never a continuation.

P22 introduces persistent state, so it must be reconciled with that value rather than violating it. The
reconciliation is precise: **"mechanism over memory" bans hidden, in-session, unauditable state that
gates decisions. P22's store is the opposite of that** — it is a **committed, human-readable,
validate-on-read artifact** that is *advisory*, never gating. It does not replace any probe, gate, or
verdict; it only lets a run *skip re-deriving* something it can still re-derive on a cache miss. This
framing is load-bearing for the whole design and is the answer to "doesn't this break the engine's
no-memory discipline?": the store is an **optimization cache with provenance**, not a source of truth.

### "Repo under work" — the discovery mechanism the store must key to (pinned, HARD CONSTRAINT)

The store is **local to the target repo craft runs against** — the worktree/checkout root — discovered
the same way `.claude/workflow.md` is. It is **never** stored in the plugin's install/source tree
(`${CLAUDE_PLUGIN_ROOT}`). Pinned discovery facts:

| Fact | Pin | Source |
|---|---|---|
| Manifest default location | `.claude/workflow.md`, **relative to the repo root** | `engine/src/manifest-lint-main.js:10` (`DEFAULT_MANIFEST`) |
| "Repo root" for relative refs | `ROOT = dirname(dirname(manifestAbsPath))` — two dirs above the manifest, i.e. the worktree/checkout root | `engine/src/manifest-lint-main.js:56-59` (`buildFileExists`) |
| All later work happens in the worktree | "All subsequent work happens ONLY in this worktree/branch" | `skills/workspace/SKILL.md:30` |
| Plugin-relative ≠ repo-relative | the plugin reads its own files via `${CLAUDE_PLUGIN_ROOT}/…`; repo files resolve against ROOT | `skills/run/SKILL.md` (every `${CLAUDE_PLUGIN_ROOT}` ref vs manifest ROOT) |

**Dogfooding subtlety (must be explicit):** when craft runs *on itself*, the store sits in the craft
repo only because craft is the target. The mechanism keys to **ROOT (repo under work)**, never to
`${CLAUDE_PLUGIN_ROOT}`. The `adapters/pi/` PoC is the proof this distinction already exists and is
honoured — pi pins its manifest module-relative (`MANIFEST_PATH_DEFAULT`,
`docs/DESIGN-P17-pi-adapter-productization.md`) but that is the *manifest*, not a repo artifact; a
repo-local store always resolves against the target's ROOT.

### The gitignore reality that shapes location (a spike finding that forces a fork)

The user's **global gitignore excludes every `.claude/` directory** — verified live:
`git check-ignore -v .claude/anything` → `/Users/scolladon/.gitignore:1:.claude`. The repo already
copes with this: its own `.gitignore` (lines 6-10) **re-includes** specific committed `.claude/` paths
(`!examples/.claude/…`, `!adapters/pi/.claude/workflow.md`) so the sample manifests reach a clone and
CI (ADR-063). Consequence for P22: a `.claude/`-style store is **gitignored by default in this repo and
any repo that inherits that global ignore**, so "committed under `.claude/`" requires an explicit
per-repo re-include, while "committed at a non-dotfile path" or "deliberately gitignored" do not. This
is exactly why committed-vs-gitignored and the dot-path choice are coupled Decision candidates, not free
choices (DC-1, DC-2, DC-3).

**Resolved (ADR-118, deviated from the recommendation).** The decisions phase chose the conventional
dotfile home **`.claude/craft-memory.md`**, committed by having the build add a `.gitignore`
**re-include** for the store path (the ADR-063 `!`-line pattern) — *not* the non-dotfile default the
designer recommended. The store therefore commits and its learnings travel with the repo, co-located
with `.claude/workflow.md`. **Build consequence (new, load-bearing for the planner):** the feature must
emit/maintain a `.gitignore` re-include for the configured store path; the default ships one for
`.claude/craft-memory.md` and `.claude/craft-metrics.md` (the metrics artifact — ADR-119), both under
the same re-include. A repo that wants the store private removes the re-include or gitignores the path
(DC-2 stays configurable; the default is committed-under-`.claude/`).

### Existing port docs — the schema the build's Design MUST mirror

`docs/adapters/{model,execution,backlog}.md` share one schema: **`## Port interface`** (verbs with
pre/post), **`## Core policy retained (NOT port verbs)`** (what the orchestrator owns and adapters never
re-decide), **`## Binding set`** (`{ claude, pi }`), **`## Claude binding` / `## Pi binding`**, **`##
Failure → blocker`** (config errors caught at lint vs runtime errors via `{ unit, reason, ≤3 options }`).
The memory port follows this schema exactly (Design §Memory port). Prior art for "core policy retained":
the model port keeps *resolution order* out of the adapter; the backlog port keeps *id-form judgment*
out of the engine. The memory port keeps **what each phase contributes and the staleness policy** as
core policy — the adapter only persists/loads bytes.

### The read/write surfaces already exist in the orchestrator (pin every one)

P22 needs no new probes — every datum it stores is **already produced** today by a phase. Pinned
producers:

| Learning | Already produced by | Pinned source |
|---|---|---|
| Toolchain / ecosystem | `worktree-setup.sh` lockfile detection (`pnpm-lock.yaml`/`yarn.lock`/…) | `scripts/worktree-setup.sh:15-33`; `skills/workspace/SKILL.md` |
| Discovered gate/test command | implementation gate probe ("discovers the repo's test command → `pytest`") | `skills/implementation/SKILL.md:10-11`; `docs/SC5-second-instantiation-record.md:50` |
| Mutation tool present/absent | validation tool probe (no config → recorded no-op) | `docs/SC5-second-instantiation-record.md:53`; ADR-082 |
| Recurring review findings | `review` → normalized `Finding[]` `{file,line,severity,finding,fix?}` | `skills/review/SKILL.md`; `engine/bin/normalize-findings.js` |
| Slice-sizing that worked | `planning` slices + `implementation` per-slice pass/blocked outcomes | `skills/implementation/SKILL.md:19-28` |
| Per-phase cost / latency | `subagent_tokens` + `duration_ms` from each **agent spawn's** usage block | `skills/run/SKILL.md:315-317` ("Numbers are harness-sourced … exact, zero-cost. No agent is asked to report its own usage") |

Note the source boundary: token/latency numbers come from **the usage block a spawn returns**, so they
exist only for **agent-mode (spawned) phases**. Role-less / inline phases (`workspace`, `decisions`,
`propose`, `integrate` — `skills/run/SKILL.md:150-161`) run in-session with no spawn, so they have no
per-phase usage block; the metrics surface is therefore "per *spawned* phase," not "per phase." This is
a real boundary, not a gap — the cacheable, expensive work (design/plan/implement/review/validate) is
all agent-mode.

The run record (`skills/run/SKILL.md` step 4, §1c) is the in-session ledger that already aggregates
phase outcomes, probe results, and the harness-sourced usage numbers — it is the natural **write
buffer** the store is flushed from at run end, and the model-class matrix (`docs/model-class-matrix.md`,
`skills/run/SKILL.md:306-321`) is the precedent for "fill a committed, diffable artifact + append a
one-line run-record entry."

### Manifest surface for the adapter's config (pinned)

The validator (`engine/src/manifest.js`) recognizes top-level `paths` (P20's `paths.dod` lives there —
`validatePaths`, line 153-155) and recognizes `retrieval`/`execution` with no sub-validation (line 646).
The natural config seam for a memory port is a recognized top-level key validated like `backlog`
(source + ref) — this was DC-6. **Resolved (ADR-121):** a
new top-level **`memory:` key** `{ source: file|custom, ref }` is added to `TOP_KEYS`
(`engine/src/manifest.js:13`) and validated exactly like `backlog` (`validateBacklog`,
`engine/src/manifest.js:195`); `source: file` (default) with `ref` = the store path, default
`ref` = `.claude/craft-memory.md` (ADR-118); `custom` is reserved for a future adapter.

### Constraints from siblings and prior ADRs

- **ADR-022** (overlay precedence: project overrides user; per-invocation `--harness` overrides both):
  the store's scoping is **per-repo only** — no user-level or cross-repo layer — so it is *trivially
  compatible* with ADR-022 (it never participates in the manifest overlay; it is data the run reads, not
  config). This is deliberate: a cross-repo/user-level memory layer is **out of scope** (zero cross-repo
  leakage is a HARD CONSTRAINT) and would re-open ADR-022's precedence question.
- **P23** (policy hooks always/ask/never) and **P25** (customization generator) are siblings — keep this
  orthogonal: P22 writes *data*, P23 governs *prompts*, P25 generates *manifests*. A future "memory
  write needs confirmation" gate is a P23 concern layered on top, not built here.
- **No provenance refs** (`contracts/core.md`): P22/ADR numbers may appear in this doc, the ADRs, and
  prose, but **never** in shipped store entries or any source/test — store entries describe the repo, not
  craft's own backlog.

## Requirements

Verifiable statements true when this ships:

1. **The store lives in the target repo, keyed to ROOT, never to the plugin tree.** Discovery resolves
   against `dirname(dirname(manifest))` / the worktree root, identically to `.claude/workflow.md`. The
   default store path is **`.claude/craft-memory.md`** (ADR-118; overridable via the `memory:` key,
   ADR-121), committed via a repo `.gitignore` re-include the build emits/maintains. A run of
   craft-on-craft writes to the craft repo *because it is the target*; a run against any other repo
   writes there. There is exactly one mechanism and it never references `${CLAUDE_PLUGIN_ROOT}` as a
   write target. (HARD CONSTRAINT.)
2. **The store is advisory, never gating.** No gate, verdict, probe-floor, or blocker decision is *made*
   from a store entry. On a cache miss, or a store that is absent/empty/invalid, the run proceeds exactly
   as today (full probing) — the store can only *save* work, never *block* or *redirect* it. Deleting the
   entire store changes run *cost*, never run *correctness*.
3. **A memory port is defined with `load`/`save` verbs**, mirroring the three existing port docs'
   schema, with bindings `{ claude, pi }` and a `## Failure → blocker` split (config errors at lint;
   runtime errors via `{ unit, reason, ≤3 options }`). What each phase contributes and the staleness
   policy are **core policy retained**, not adapter verbs.
4. **Each phase has a defined read/write contract** (Design §Per-phase contract). Reads happen at phase
   entry (advisory hints prepended to the spawn/inline context); writes are buffered in the run record
   and flushed once at run end. No phase writes mid-flight in a way that a later-failing phase could
   leave a partially-poisoned store (atomic single flush — Req 6).
5. **Run-over-run improvement is measurable from committed artifacts.** A baseline (first run, cold
   store) and each subsequent run record per-**spawned**-phase `tokens`/`duration_ms` (already
   harness-sourced from the spawn's usage block — so agent-mode phases only) plus cache hit/miss counts,
   so a diff of two run records shows the delta. The numbers are harness-sourced, never self-reported
   (the model-class-matrix discipline, `skills/run/SKILL.md:315`).
6. **A stale or poisoned entry cannot degrade a run** (the make-or-break property). Every entry carries
   **provenance** (which run/commit produced it), a **confidence/decay** signal, and is **validated on
   read** (re-checked cheaply against current reality before use); influence is **bounded** (advisory
   only, Req 2); the flush is **atomic** (Req 4). A failed validate-on-read silently falls through to
   full probing and marks the entry for eviction — never a blocker, never a wrong action.
7. **The store is human-readable and diffable**, so a reviewer can audit what craft learned and a `git
   diff` of the store is meaningful (mirrors `docs/model-class-matrix.md`).
8. **Scope is per-repo only** — no user-level or cross-repo memory; zero cross-repo leakage by
   construction (the store is a repo artifact, not a global one).
9. **The store is bounded in size.** It has **both** a global entry-count cap **and** a max-byte guard
   (ADR-122). Entries are ordered oldest→newest (newest appended last). On write, **merge-before-insert**:
   an observation that matches an existing entry (same concern + key) is merged rather than duplicated, and
   its stored value is rewritten **only when the new observation improves the entry's meaning**. When a
   `save` would exceed **either** cap, **eviction-on-cap** restricts the removal candidate set to the **50
   newest entries** and drops the least-relevant within that window (lowest confidence/decay score; ties →
   oldest provenance), repeating until both caps are satisfied; entries older than the newest-50 window are
   never cap-evicted (old staleness is handled only by decay+floor and validate-on-read). The cap is itself
   an anti-staleness guard: unbounded growth means diff-noise, review cost, and an ever-larger poisoning
   surface (§Constraints).
10. **Only mechanically-derived, mechanically-validatable facts are stored** (positive whitelist). Every
    entry is a command, a fingerprint, a normalized finding, or a metric — something a phase can re-derive
    and validate-on-read can re-check by a cheap stat/exists/fingerprint. **Free-form, semantic, or
    LLM-inferred content is banned** (no prose summaries, no "this codebase prefers X", no code snippets,
    no PII). The whitelist is enforced **document-only** (ADR-123): the memory port spec defines the
    per-concern schemas and forbids non-mechanical content, and each phase's documented write surface is
    trusted to comply — there is **no reject-at-write code and no schema lint**. This is what keeps
    validate-on-read cheap and the poisoning surface bounded (§Constraints).

## Design

### Shape of it — three lines

A run is: **load the store (validate each entry on read) → use surviving entries as advisory hints,
re-deriving anything that misses or fails validation → buffer what was learned in the run record →
flush once, atomically, at run end.** Every hint is a shortcut over a probe that still exists; nothing
the store says is ever trusted without a cheap re-check.

### The store as an optimization cache with provenance (the reconciliation, made concrete)

The store is **not** a knowledge base craft reasons from; it is a **cache of prior derivations**, each
tagged so a stale tag is detectable and ignorable. Concretely, every entry is the answer to a question a
phase *would otherwise re-derive*:

- "What is the test/gate command here?" — answered by the implementation gate probe (`pytest`/`go
  test`/…). Cached so the next run skips re-discovery — **but still runs the command**; the cache saves
  the *discovery*, never the *execution* (the gate is sacred, Req 2).
- "Does a mutation tool exist?" — answered by the validation probe. Cached; re-validated by a cheap
  presence check (config file still there?) before the run trusts it.
- "Which findings recur?" — answered by `review`. Cached as advisory *watch-items* the reviewer is told
  to look for first; the reviewer still reviews the full diff (a cached finding pre-empts, never
  replaces, review).
- "What slice size landed cleanly?" — answered by planning+implementation outcomes. Cached as a planner
  hint ("slices of ~N touched files passed first-try last run"); the planner still plans.

This is why deleting the store changes only cost: every entry is a memo of a computation the run can
still perform. This advisory-cache-with-provenance framing — the store is never a source of truth that
gates a decision — is the load-bearing premise the whole design rests on; it is **ratified as ADR-116**
(adopted as recommended), and every Decision candidate below assumes it.

### Read lifecycle — when `load` fires (one read, consulted many times)

`load(repoRoot)` is called **once, at run start** — folded into the run's existing setup, right after the
run record is seeded (`skills/run/SKILL.md:49-51, 81`) and before the first phase walks. It is **not**
re-called per phase. The single returned `MemoryView` is held in-session beside the run record; each phase,
at its entry, reads only its concern-slice from that already-validated view (the per-phase Reads column in
§Per-phase read/write contract). The hint is injected through the existing pre-chewed-context path — slot 1
of the **Agent spawns** structure (`skills/run/SKILL.md:264-275`): block PREPENDED to the Task prompt for
agent-mode phases, loaded at phase entry for inline phases. No new injection surface, no new orchestrator
step beyond the one-time `load`.

Why once, not per-phase: a per-phase reload re-pays the validate-on-read pass (the only non-trivial cost of
`load`) for every phase, for **no** correctness gain — this run never observes its *own* writes mid-run (its
only `save` is at run end, §Update semantics), so the view it loaded at the top is the view it would reload.
Worse, per-phase reload would *widen* the window in
which a concurrent run's flush could be observed mid-pipeline, turning a benign last-flush-wins race
(ADR-120) into a within-run inconsistency. One read at the top is cheaper and strictly more consistent. (If a
reviewer judges per-phase reload genuinely contestable on a future concurrency model, it is a clean fork —
but the spike found no consumer that needs intra-run freshness, so it is recorded as the rationale here, not
escalated to a DC.)

Cold / absent / invalid store at load time is already specified (Req 2; §Edge behaviour "Cold store",
"Store deleted"): the one-time `load` yields an empty view and every phase probes exactly as today. This
subsection only pins *when* the read happens; *what a degenerate read returns* is unchanged.

### Update semantics — the single `save`-time merge rule, and the "only-useful, non-outdated" guarantee

Writes are buffered, never live: across the run, each phase appends what it observed to the **run record**
(the in-session ledger, `skills/run/SKILL.md:81`) — the same buffer that already holds phase outcomes,
probe results, and harness-sourced usage numbers. Nothing touches the store file mid-run. At **run end**,
the orchestrator derives the `delta` from those buffered observations and calls `save(repoRoot, delta)`
**once**, as a single atomic flush (temp-write + rename / single overwrite — Req 6; §Edge behaviour
"Atomicity"). This is the same run-end synthesis slot that fills the model-class-matrix and backlog
follow-ups — one diffable artifact write per run.

**Per-entry merge, as a state transition.** For each store concern, `save` reconciles the loaded entry
against this run's observation. Every entry is in exactly one post-state:

| Transition | Trigger this run | Effect on the entry |
|---|---|---|
| **ADDED** | Observed, and no matching entry existed at load | New entry: confidence = floor + 1 step, provenance = `{run, commit, date}` stamped now |
| **REFRESHED** | Observed, and a matching entry existed (same concern + key) | confidence **↑** (capped at ceiling); provenance **restamped** to this run; value rewritten **only if the new observation improves the entry's meaning** — otherwise the stored value is left untouched (merge-before-insert, ADR-122). Re-observation always counts as a refresh for confidence/decay even when the value is unchanged. |
| **DECAYED** | A matching entry existed but was **not** re-observed this run (and did not fail validate-on-read at load) | confidence **↓** one step; entry **kept** (a one-off miss must not evict a stable fact); provenance unchanged |
| **EVICTED** | confidence would fall **below the floor** after decay, **or** validate-on-read dropped it at load (stale-at-use), **or** the size cap forced it out *while in the newest-50-entry window* (§Constraints) | entry **removed** from the flushed store |

"Key" is the concern's natural identity (e.g. gate-cmd keyed by phase; toolchain keyed by ecosystem;
a finding keyed by `file+pattern`) — REFRESH matches on key, it never appends a duplicate. Note the key is
a *subset* of the stored shape: a findings entry stores `file+severity+pattern` but keys on `file+pattern`,
so a recurrence at the same `file+pattern` with a changed severity is a REFRESH (severity is mutable
payload), not a second entry. Matching is the adapter persisting bytes; *what counts as the same key* and
*the floor/ceiling/step values* are **core policy** (§Memory port "Core policy retained"), so an adapter
cannot weaken them.

**Ordering and merge-before-insert (ADR-122).** Entries are stored **oldest→newest** (a new entry is
appended last; provenance order is the store's order). On every observation `save` does
**merge-before-insert**: it first looks for a matching entry (same concern + key) and, if found, takes the
REFRESHED path above — and *the stored value is rewritten only when the new observation improves the
entry's meaning* (it is more interesting / better; e.g. a finding's severity escalates, a fingerprint
genuinely changes). When the observation is equivalent, the value is left byte-for-byte untouched so the
`git diff` shows no churn, while confidence/decay still treats it as a refresh (the entry does not decay).
Only when no match exists is a new entry appended (ADDED). This is why a re-run on an unchanged repo
produces an essentially empty diff: equivalent re-observations restamp provenance/confidence in
frontmatter without rewriting payloads.

**The guarantee, and which mechanism enforces it.** The store is required to hold **only currently-useful,
non-outdated** entries (Req 6). Three distinct staleness kinds exist, and each dies by a *named, different*
mechanism — none overlaps, together they are total:

| Staleness kind | Example | Killed by | When |
|---|---|---|---|
| **Outdated-at-use** (was true, now wrong) | cached `pnpm` gate after repo switched to `yarn`; finding whose file was deleted | **validate-on-read** drops it from the `MemoryView` and flags EVICT | at the next `load` (use time) |
| **Chronically-unobserved** (no longer surfaced by any phase) | a gate-cmd for a removed toolchain that no phase probes anymore | **decay + confidence floor** → EVICT | at `save` (run end), after enough consecutive misses |
| **Unbounded accumulation** (correct but too much) | hundreds of historical findings inflating the store | **size cap eviction** (§Constraints) → EVICT the **newest-window least-relevant** entry (lowest confidence within the 50 newest; ties → oldest provenance) | at `save`, when either cap is hit |

So: validate-on-read kills the *wrong*, decay+floor kills the *forgotten*, and the size cap trims the
*recent excess* — bounding only churn in the newest-50 window, never established old facts, which decay+floor
and validate-on-read still govern. Bounded influence (Req 2) ensures that until any of them fires, a
surviving-but-stale entry can at worst waste one re-derivation, never mislead. The §Anti-staleness
four-guard model is the *defence-in-depth* restatement of the same machinery from the read side; this table
is its write-side, lifecycle view.

### Constraints — what the store may hold, and how big it may get

These bound the store's content and size as first-class core policy (the adapter persists bytes; it never
decides *what* or *how much*). They are the third anti-staleness mechanism (size cap) and the cheap-validation
precondition (content whitelist) named in §Update semantics.

**Content whitelist (Req 10) — only mechanically-derived, mechanically-validatable facts.** An entry may be
**only** one of:

| Concern | Entry holds | Validate-on-read re-check | Explicitly NOT stored |
|---|---|---|---|
| toolchain | ecosystem id + lockfile fingerprint | fingerprint still matches? | rationale prose, dependency lists |
| gate-cmd | the literal command string + phase | command still resolvable? | command *output*, logs |
| mutation-tool | tool id + config-file fingerprint | config file still present? | mutation results |
| findings | `file + severity + pattern` (a normalized `Finding` shape) | file still exists? | code snippets, diff hunks, the finding's prose body, any PII |
| slice-sizing | numeric size + pass/blocked outcome | (used as a weak planner hint; no per-use re-check) | file contents, slice rationale |
| metrics | `tokens`, `duration_ms`, hit/miss counts (harness-sourced) | (append-only history in the separate `.claude/craft-metrics.md` artifact; not decayed, exempt from the cap — ADR-119) | self-reported numbers |

The hard ban: **no free-form, semantic, or LLM-inferred content** — no "this codebase prefers pattern X",
no natural-language summaries, no code excerpts, no secrets/PII. Two reasons this is load-bearing, not
hygiene: (1) validate-on-read stays a cheap stat/exists/fingerprint precisely because every entry is
mechanically re-checkable — a prose claim has no cheap re-check, so it could never be safely trusted and
would violate Req 6; (2) the poisoning surface stays bounded because the worst a whitelisted entry can carry
is a wrong command/fingerprint that bounded influence (Req 2) already neutralises, whereas an inferred claim
could mislead a human reviewer auditing the diff. (Richer inferred knowledge is a deliberate later item —
§Out of scope.)

*How* the whitelist is enforced is **resolved by ADR-123 as document-only** (deviated from the
recommendation): the memory port spec (`docs/adapters/memory.md`) defines the per-concern entry schemas
and forbids non-mechanical content, and each phase's documented write surface is trusted to comply. There
is **no reject-at-write code and no schema lint** — the cheap-validation guarantee rests on write-surface
discipline plus human review of the diffable store (ADR-117), consistent with the advisory-cache premise
(ADR-116): a non-conforming entry is at worst wasted cost, never a wrong decision. If non-mechanical content
proves to leak in practice, reject-at-write is a clean later upgrade.

**Per-entry shape constraints.** A findings entry stores `file + severity + pattern` and never the code or
the finding's prose; a gate-cmd entry stores the command and never its output; a metrics row is
harness-sourced numbers only (never agent-self-reported — the model-class-matrix discipline,
`skills/run/SKILL.md:315`). These per-entry shapes are what make the whole store auditable by `git diff`
(Req 7) and keep each row's validate-on-read O(1).

**Size ceiling and eviction-on-cap (Req 9, ADR-122 — deviated from the recommendation).** The store is
bounded by **both** a global **entry-count cap** **and** a **max-byte guard** on the serialized file (the
designer recommended a single global entry-count cap; the decisions phase chose both, with refined write
and eviction rules). Both default values are tunable config; the byte cap is measured on the one serialized
markdown file (ADR-117). Entries are ordered **oldest→newest**. When a run-end `save` would exceed
**either** cap, eviction runs **before** the flush, restricted to a moving window:

1. Restrict the removal candidate set to the **50 newest entries** (the recent-churn window). Entries older
   than this window are **never** cap-evicted — old staleness is handled only by decay+floor and
   validate-on-read.
2. Within that window, drop the **least-relevant** entry: lowest confidence/decay score; break ties by
   **oldest provenance** (the `{run, commit, date}` stamp) — the least-recently-reaffirmed entry loses first.
3. Repeat (re-computing the window over the now-smaller store) until **both** caps are satisfied, then flush
   atomically.

Small-store edge: if the store has ≤ 50 entries the window is the whole store, so the policy degrades to
"drop the least-relevant overall"; as entries are removed the window re-computes over the shrinking store.
This reuses the exact decay/confidence score §Update semantics already maintains, so the cap adds no new
scoring machinery — it is decay's eviction applied under hard ceilings, scoped to the newest-window, instead
of a global confidence floor. Metrics history is **exempt** from this cap: it lives in the separate
append-only `.claude/craft-metrics.md` artifact (ADR-119), is never decayed, and the cap governs only the
*learnings* store. Rationale for capping at all: an uncapped store grows monotonically across every run,
turning the diffable artifact (Req 7) into review-hostile noise and steadily enlarging the poisoning
surface — the cap is an anti-staleness guard, not just a space guard. Bounding eviction to the newest-50
window deliberately protects established (older) facts from being culled by recent churn.

### Memory port (mirrors `docs/adapters/{model,execution,backlog}.md`)

The build adds `docs/adapters/memory.md` with this schema:

**`## Port interface`**

- `load(repoRoot) → MemoryView` — read the store rooted at `repoRoot` and return a validated view:
  each entry passed through validate-on-read, surviving entries grouped by concern (toolchain, gate-cmd,
  findings, slice-sizing, metrics). **Called exactly once per run, at run start** (see §Read lifecycle) —
  one filesystem read, one validation pass; the single returned `MemoryView` is held in-session and each
  phase consults its concern-slice at entry. **pre:** `repoRoot` is the resolved worktree/checkout root
  (never the plugin dir). **post:** the view contains only entries that passed validation *or* are flagged
  advisory-only-low-confidence; an absent/empty/malformed store yields an **empty view**, never an error
  (Req 2) — a malformed store is recorded as a no-op-load note, not a blocker.
- `save(repoRoot, delta) → void` — flush the run's buffered learnings as one atomic write, merging
  `delta` into the store with confidence/decay update and provenance stamp. **pre:** the run has reached
  its write point (run end / phase-set complete); `delta` is the run-record-buffered learnings. **post:**
  the store is updated atomically (temp-write + rename, or a single-file overwrite) so a crash mid-flush
  never leaves a half-written/poisoned store; entries not re-observed this run have their confidence
  decayed (not deleted — decay, so a one-off miss doesn't evict a stable fact).

**`## Core policy retained (NOT port verbs)`** — owned by the orchestrator/core, never re-decided by an
adapter:

- **What each phase contributes** (the write surface, §Per-phase contract) — the adapter persists bytes;
  it does not decide which phase writes what.
- **Validate-on-read policy** — *how* an entry is re-checked before use (the cheap re-derivation per
  concern) is core policy; the adapter only returns stored bytes + metadata.
- **Confidence/decay model** — the scoring and decay-on-miss rule is core policy.
- **Advisory-only bound** — the store never gates; an adapter cannot make it gate.
- **Scoping** — per-repo only; the adapter has no user/global layer to expose.

**`## Binding set`** — `{ claude, pi }`.

**`## Claude binding`** — `load`/`save` are filesystem reads/writes against `repoRoot` performed by the
session orchestrator: **`load` once at run start, `save` once at run end**. The single `MemoryView` is
held in-session (alongside the run record); at each phase's entry the orchestrator slices the concern this
phase reads and **prepends it into the step-3 injected contract block as part of the pre-chewed context** —
the same slot, assembled the same way, whether the phase spawns an agent (block PREPENDED to the Task
prompt) or runs inline (block loaded at phase entry) — `skills/run/SKILL.md:140-148, 264-275` ("Agent
spawns", slot 1 "Injected contract block"). No second injection surface is added: the hint is one more
pre-chewed fact the assembler folds in, never a separate prompt section. Metrics come from the usage block
the spawn already returns — zero extra cost.

**`## Pi binding`** — identical filesystem semantics rooted at the pi run's working dir; pi has no
fan-out, so per-phase metrics are collected sequentially (the artifact-handoff invariant already carries
state between pi phases — `docs/adapters/execution.md` Pi binding).

**`## Failure → blocker`** — **Config errors** (knowable from manifest alone): unknown `memory:` sub-key,
bad `source`/`ref` (ADR-121) — caught by the validator; non-zero exit before any phase
(mirrors backlog/model config-error rows). **Runtime errors**: a store that is malformed,
unreadable, or fails validate-on-read is **NOT a blocker** — it falls through to full probing and is
recorded as a load no-op (Req 2 makes the store unable to block). A `save` that cannot write at all (disk
full / permission denied) is **also never a blocker** — it is a **recorded warning**, and there is **no
locking** (concurrent runs are last-flush-wins). A missed cache write must never fail a green run; a lost
write costs at most one re-derivation next run, never correctness (ADR-120).

### Per-phase read/write contract

Reads are advisory hints injected at phase entry; writes are buffered in the run record and flushed once
at run end (Req 4). The contract per phase:

| Phase | Reads (advisory hint at entry) | Writes (buffered → flushed at end) |
|---|---|---|
| `workspace` | last ecosystem/toolchain → skip re-detect if lockfile unchanged | detected ecosystem, lockfile fingerprint |
| `planning` | slice-sizing that landed cleanly last run | (none directly; sizing observed at implementation) |
| `implementation` | discovered gate/test command → skip re-discovery (still **runs** it) | gate/test command, per-slice size + pass/blocked outcome |
| `review` | recurring `Finding[]` as watch-items reviewers check first | findings that recurred this run (file/severity/pattern, **not** provenance refs) |
| `validation` | mutation tool present/absent → skip re-probe (still re-validates presence) | mutation tool + config fingerprint |
| all spawned (cross-cutting) | — | per-spawned-phase `tokens` + `duration_ms` + cache hit/miss (usage-block-sourced; agent-mode phases only) |

Reads at entry never gate: a hint that fails validate-on-read is dropped and the phase probes as today.
Writes never happen mid-phase to the store file — they accrue in the run record so a phase that later
blocks cannot leave a partial store (atomicity, Req 6).

### Anti-staleness & anti-poisoning (the make-or-break property — four independent guards)

A bad entry is defeated by **four layers, any one of which suffices** — defence in depth so no single
mechanism is load-bearing alone:

1. **Bounded influence (the ceiling).** The store is advisory-only (Req 2; forward-pointer ADR-116): the worst a
   poisoned entry can do is waste the cost of one re-derivation, because every consumer still has its
   real probe/gate behind the hint. A poisoned "gate command is `foo`" entry doesn't run `foo` — the
   implementation phase still discovers and runs the real command on validate-on-read failure. **This is
   the primary guard**; the other three reduce wasted cost and surface rot, but correctness rests here.
2. **Validate-on-read (the freshness check).** Before a hint is used, a cheap concern-specific re-check
   runs: toolchain → lockfile fingerprint matches? gate-cmd → command still resolvable? mutation-tool →
   config file still present? findings → file still exists? A miss drops the hint and flags the entry
   for decay/eviction. Validation is **cheap by construction** (a stat/exists/fingerprint, never a full
   re-probe) so it never costs more than it saves.
3. **Confidence + decay (the aging signal).** Each entry carries a confidence score raised when
   re-observed and decayed when a run completes without re-observing it (decay, not delete — one miss
   shouldn't evict a stable fact). Below a floor, an entry is advisory-only-low-confidence (used only as
   a weak hint) then evicted. Decay makes stale entries *fade* rather than persist forever.
4. **Provenance (the audit trail).** Each entry records which run/commit produced it (a SHA + date, like
   `docs/model-class-matrix.md` rows), so a human `git diff`/blame can see what craft learned and when —
   and a reviewer can delete a bad entry by hand. Provenance here is *store metadata about the repo*, not
   a source-code provenance ref (the no-provenance contract bans P22/ADR refs in *source/test/shipped
   entries describing the change* — an entry's "produced by run @sha" tag is store bookkeeping, allowed;
   see the No-provenance-leak test in §Test strategy for the boundary).

A fifth, structural guard backs these four: the **size ceiling + content whitelist** (§Constraints, Req 9 &
Req 10). The cap bounds how large the poisoning surface can get (eviction-on-cap over the newest-50 window,
least-relevant-first — ADR-122); the whitelist bounds what a poisoned entry can *be* (a re-checkable
command/fingerprint, never an unverifiable inferred claim — enforced document-only via the port spec and
write-surface discipline, ADR-123, not a runtime guard). The four guards above neutralise any single bad
entry; these two bound the *population* of entries. See §Update semantics for the "which mechanism kills
which staleness kind" mapping.

The decay model, confidence floor, validate-on-read recipes, size ceiling, and content whitelist are all
**core policy** (port spec), so an adapter cannot weaken them.

### Run-over-run improvement measurement

The baseline is the **first run against a cold store** (all cache misses); every run appends, to the
separate metrics artifact **`.claude/craft-metrics.md`** (ADR-119) and to its run record: per-phase
`tokens`, `duration_ms` (both harness-sourced — `skills/run/SKILL.md:315`), and cache **hit/miss** counts.
Improvement is the diff between two runs' metrics blocks: fewer probe re-derivations (hits up), lower phase
tokens/latency on cached phases, and pre-empted findings (recurring findings caught earlier). This mirrors
the model-class-matrix pattern: a committed, diffable artifact plus a one-line run-record entry. **No new
measurement machinery** — it reads numbers the harness already returns. Metrics land in a **separate
append-only artifact** (ADR-119), never in the learnings store: metrics are append-only history (never
decayed, exempt from the size cap), while the learnings store decays and evicts — different lifecycles. The
metrics artifact lives alongside the store under the same `.gitignore` re-include (ADR-118).

### Why a port, not engine code baked in

Same reasoning the three existing ports follow (`docs/adapters/*.md`): the *contract* (load/save,
validate-on-read, advisory-only, per-phase write surface) is engine-owned and uniform; the *storage*
(single file vs dir, JSON vs markdown+frontmatter, committed vs gitignored) is an adapter/config choice
that must vary per repo and per harness (Claude/pi). Baking storage into the engine would re-decide for
every repo what DC-1/DC-2/DC-3 leave to the operator, and would couple the engine to a filesystem layout
— exactly what the model/execution/backlog ports avoid.

### Edge behaviour (hunted in self-review)

- **Cold store (first ever run):** `load` → empty view → every phase probes as today; `save` writes the
  first entries. Identical correctness to a no-store run, just no speedup. (Req 2.)
- **Store deleted between runs:** identical to cold store. Deleting the store is always safe (Req 2).
- **Repo toolchain changed (e.g. switched `pnpm`→`yarn`):** validate-on-read lockfile-fingerprint miss
  → hint dropped → re-detect → entry overwritten with decayed-then-refreshed confidence. No wrong action.
- **Poisoned entry (hand-edited / merge-mangled):** worst case is one wasted re-derivation (guard 1);
  validate-on-read likely drops it (guard 2); confidence decays it (guard 3). Never a wrong gate.
- **craft-on-craft (dogfooding):** store resolves to the craft repo's ROOT *because craft is the
  target*; the mechanism never points at `${CLAUDE_PLUGIN_ROOT}`. (HARD CONSTRAINT, Req 1.)
- **Run blocks mid-pipeline:** no store write happened yet (writes flush only at run end) → store is
  unchanged → next run is unpoisoned by the failed run. (Atomicity, Req 6.)
- **Concurrent runs (two craft passes on the same repo):** last-flush-wins on the single atomic write;
  because entries are advisory and decay-merged, a lost write costs a re-derivation next run, never
  correctness. (Bounded influence.) No locking is used — last-flush-wins (ADR-120).
- **Store at the size cap when a new useful entry is learned:** eviction-on-cap runs at `save` over the
  **50 newest entries** (least-relevant-first, ties → oldest provenance — §Constraints, ADR-122) so the
  fresh, just-reaffirmed entry survives only if it is not itself the weakest in that window; established
  older entries outside the window are never cap-evicted. The cap pushes out recent rot, not established
  signal. Worst case if every windowed entry is equally fresh: one re-derivation next run for the evicted
  one (bounded influence again).
- **Re-run on an unchanged repo (merge-before-insert):** every observation matches an existing entry and
  is equivalent, so `save` rewrites no payloads (improve-only, ADR-122) — provenance/confidence restamp in
  frontmatter but the `git diff` of the store body is essentially empty. No churn, no duplicate entries.
- **Non-conforming write attempt (a phase tries to buffer prose / a snippet):** there is **no
  reject-at-write guard** (whitelist is document-only, ADR-123). The port spec and the phase's documented
  write surface are trusted not to buffer non-mechanical content; if a future phase did, the entry would
  reach the store but — being advisory (ADR-116) — is at worst wasted cost, never a wrong decision, and is
  visible for human deletion in the diffable store (ADR-117). The structural defence is write-surface
  discipline plus review, not a runtime gate.

## Decision log (resolved — was: Decision candidates)

The designer decided none of these; the decisions phase ratified each as an ADR (116-123). This is now a
**decision log**: each row records the chosen option and its ADR. Three deviated from the designer's
recommendation (118, 122, 123) and have been folded into the sections above.

| # | Choice | Resolution | ADR |
|---|---|---|---|
| DC-1 | **Store format** | **(b) single markdown + YAML frontmatter** — as recommended. Human-readable + diffable, one file keeps atomic flush trivial, frontmatter is machine-parseable. | **ADR-117** |
| DC-2 | **Committed vs gitignored** | **(c) operator choice via config, default committed** — as recommended. Learnings travel with the repo by default; a team can opt to gitignore by removing the re-include. | **ADR-118** |
| DC-3 | **Store location within the repo** | **(a) under `.claude/` → `.claude/craft-memory.md`, committed via a repo `.gitignore` re-include** — **DEVIATES** from the recommended non-dotfile default. Conventional dotfile home alongside `.claude/workflow.md`; the build emits/maintains the re-include (ADR-063 `!`-line pattern). | **ADR-118** |
| DC-4 | **Where run-over-run metrics land** | **(b) separate append-only metrics artifact → `.claude/craft-metrics.md`** — as recommended. Learnings stay small/cache-like (decays/evicts); metrics are append-only history (never decayed, exempt from the size cap). | **ADR-119** |
| DC-5 | **`save` failure & concurrency policy** | **(a) failed save = recorded warning, never blocks a green run; no locking (last-flush-wins)** — as recommended. A missed cache write must never fail real work; bounded influence covers the low-stakes race. | **ADR-120** |
| DC-6 | **Memory config seam in the manifest** | **(a) new top-level `memory:` key** `{ source: file\|custom, ref }`, validated like `backlog` in `engine/src/manifest.js` (added to `TOP_KEYS`, line 13; mirrors `validateBacklog`, line 195); default `ref` = `.claude/craft-memory.md`; `custom` reserved/unbuilt — as recommended. | **ADR-121** |
| DC-7 | **Max-size ceiling & eviction-on-cap** (Req 9, §Constraints) | **BOTH a global entry-count cap AND a max-byte guard**, with **merge-before-insert** (improve-only) and **newest-50-window least-relevant eviction** (ties → oldest provenance; entries outside the window never cap-evicted) — **DEVIATES** from the recommended single global entry-count cap with global lowest-confidence-first eviction. Both cap values are tunable config. | **ADR-122** |
| DC-8 | **How the content whitelist is enforced** (Req 10, §Constraints) | **document-only** — the port spec defines per-concern schemas and forbids non-mechanical content; each phase's documented write surface complies; **no reject-at-write code, no schema lint** — **DEVIATES** from the recommended reject-at-write + schema lint. Enforced by the port spec + write surfaces + human review of the diffable store. | **ADR-123** |

(Spike note retained for the record: DC-2/DC-3 were **forced into existence** by a live finding — the
global `.claude/` gitignore — not by taste. The decisions phase chose `.claude/craft-memory.md` anyway,
accepting the committed re-include the build must ship; this is the deviation ADR-118 records.)

## Test strategy

The build is part engine surface (manifest key + validator), part orchestrator prose (per-phase
read/write contract), part doc (the port spec). Verification matches the repo's house style (`node
--test` for engine, mechanical lints for contracts, prose for orchestrator behaviour proven by the SC5
smoke):

- **Manifest validation (MECHANICAL, `node --test` — `engine/test/`).** The `memory:` key (ADR-121):
  a valid `memory: { source: file, ref: … }` lints OK; an unknown sub-key / unknown `source` /
  missing `ref` for `custom` → `INVALID … unknown … key` exit 2 (mirror the backlog validator tests,
  `engine/src/manifest.js` `validateBacklog`, line 195). Control: a bespoke unknown top-level key still
  fails. Default `ref` resolves to `.claude/craft-memory.md` when `memory:` is omitted.
- **Validate-on-read & advisory-only (MECHANICAL, the core safety property).** Unit-test the
  validate-on-read recipes against a fabricated store: a toolchain entry whose lockfile fingerprint no
  longer matches is **dropped** from the view; a gate-cmd entry whose command no longer resolves is
  dropped; a findings entry whose file is gone is dropped. Property: **a `load` of an arbitrary
  malformed/poisoned store never throws and never yields a gating decision** — it yields an empty-or-
  filtered view (Req 2, Req 6). This is the make-or-break test and gets a dedicated suite.
- **Atomicity (MECHANICAL).** A `save` interrupted before completion (simulated) leaves the prior store
  intact (temp+rename / single overwrite never half-writes). A run that blocks mid-pipeline writes
  nothing.
- **Confidence/decay (MECHANICAL).** An entry re-observed gains confidence; an entry not re-observed
  across a run decays; below floor it goes advisory-only then evicts. Deterministic from a seeded
  store + a synthetic run delta. Asserts the §Update-semantics ADDED/REFRESHED/DECAYED/EVICTED transitions.
- **Size-cap eviction & merge-before-insert (MECHANICAL, Req 9 / ADR-122).** Three assertions on a seeded
  store: (1) **both caps** — a `save` never flushes a store exceeding the entry-count cap *or* the byte
  cap; seed over each cap independently and assert eviction fires for whichever is exceeded. (2)
  **newest-window eviction** — seed a store over the entry-count cap with a low-confidence entry *outside*
  the 50-newest window and a higher-confidence entry *inside* it; assert the dropped entry is the
  least-relevant *within the window* (ties → oldest provenance) and that the old, outside-window low-confidence
  entry **survives** (never cap-evicted). (3) **merge-before-insert** — a delta whose observation matches an
  existing key produces no duplicate entry; an equivalent (non-improving) re-observation leaves the stored
  value byte-for-byte unchanged (refreshing only provenance/confidence), while an improving observation
  rewrites the value. Deterministic from seeded stores + synthetic deltas.
  *(No content-whitelist lint/reject-at-write test — ADR-123 enforces the whitelist document-only via the
  port spec and write surfaces, not a runtime guard. The validate-on-read suite above still proves
  freshness, which is a distinct property.)*
- **Round-over-run measurement (MECHANICAL, light).** Given two run-record metrics blocks (cold then
  warm), assert the diff shows hits↑ and the cached phase's recorded probe cost↓ — the numbers are
  fixture-fed (harness-sourced in production), so the test asserts the *diff arithmetic*, not live
  tokens.
- **No-provenance-leak (MECHANICAL, core contract).** No `P22`/`ADR` token appears in any shipped store
  default/sample or in source/test (the entry's `produced-by @sha` provenance is a SHA, not a craft
  backlog ref — the store-bookkeeping-vs-source-provenance boundary, §Anti-staleness guard 4). Grep
  assertion, matching the existing no-provenance lints.
- **Dogfooding / ROOT-keying (prose + smoke).** Like SC5 (`docs/SC5-second-instantiation-record.md`),
  an on-demand smoke confirms the store resolves against the target repo's ROOT, never
  `${CLAUDE_PLUGIN_ROOT}` — the engine path (root resolution) is CI-proven; the smoke adds runtime
  fidelity. State-mutating probes during the spike ran in `mktemp` throwaways, never the worktree.

## Out of scope

- **Cross-repo / user-level / global memory** — zero cross-repo leakage is a HARD CONSTRAINT; a global
  layer would re-open ADR-022 precedence and is explicitly excluded (Req 8).
- **The store gating any decision** — it is advisory-only forever (Req 2); a "memory says skip the gate"
  fast-path is never built. The gate, verdict, and probe floor stay sacred.
- **Confirmation/policy on writes** — "ask before writing memory" is a P23 (policy-hooks) concern layered
  on top, not built here. P22 writes data; P23 governs prompts.
- **A memory-aware customization generator** — P25's manifest front-door is orthogonal; it may later
  *seed* a store, but P22 builds only the read/write mechanism.
- **Semantic/LLM-derived learnings** (e.g. "this codebase prefers pattern X") — P22 stores only
  mechanically-derived, mechanically-validatable facts (commands, fingerprints, findings, metrics) so
  validate-on-read stays cheap and poisoning stays bounded. This is the negative face of the positive
  whitelist (Req 10, §Constraints): the whitelist says what *is* allowed; this scope line excludes the
  richer inferred knowledge that a future iteration might add. Richer inferred knowledge is a later item.
- **A `custom` (DB/remote) memory adapter implementation** — the port leaves room for it (DC-6, like
  backlog `custom`), but only the `file` binding is built; `custom` is a documented recipe.
