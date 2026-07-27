# Design — harness hygiene + prune gates

> Brief: three independently-revertable workstreams that harden craft's own harness.
> **A** closes two intention-port hygiene gaps (self-governance of the port's own sources;
> a single source of truth for the living-corpus enumeration duplicated between `ci.sh`
> and its test). **B** institutionalises periodic harness-pruning as an on-demand,
> propose-never-dispose review with an invariant-core denylist — minimal by construction,
> zero-drag when not invoked. **C** adds two advisory-first pre-completion gates (a
> touched-code stub-marker gate; a prose anti-slop lint) mirroring the `intention-lint`
> precedent (engine bin + src module, a promotable-to-blocking knob, a waiver token).
> Status: draft → self-reviewed ×3 → accepted

## Context

craft is a hexagonal feature-delivery engine: a thin orchestrator (`skills/run/SKILL.md`)
walks a declarative phase descriptor list (`pipeline/default.yml`) behind explicit ports,
each with a zero-config built-in default and a documented adapter spec under
`docs/adapters/`. Its durable premise is a **small invariant core** — the engine floors
in `contracts/core.md` (never-commit-on-red; validation-triage-gates-propose;
artifact-handoff; the blocker protocol; no-provenance-refs; no-suppression-directives;
no-swallowed-errors; bounded scope) — surrounded by swappable adapters. This change is
maintenance *on* that harness: it neither adds an engine floor nor touches a shipping
feature's behaviour. It bundles three workstreams that share only a design theme
("keep the harness honest and lean"), deliberately partitioned so each reverts alone.

### The three workstreams, and why they are separable

| WS | Concern | New surface | Reverts by |
|---|---|---|---|
| **A** | intention-port hygiene (self-governance + de-duplicate the corpus enumerator) | frontmatter on one living page; one shared enumerator | drop the frontmatter block; restore the inline enumerator |
| **B** | standing harness-prune review | one on-demand skill (prose) + a documented trigger | delete the skill dir |
| **C** | pre-completion gates (stub markers; prose slop) | two engine bins + src modules + one manifest block + `ci.sh` wiring | remove the bins/modules/block and their `ci.sh` calls |

**Coupling map (the revertability contract — the plan must honour it).** Two files are
touched by more than one workstream and must be edited in **non-adjacent hunks** so a
single-commit revert of one workstream never conflicts with another:

- `scripts/ci.sh` — **A2** rewrites the body of `run_intention_lint` (the inline `find`);
  **C** appends new `run_stub_lint` / `run_prose_lint` functions and their calls. Distinct
  regions; keep them apart.
- `docs/GUIDE-customizing.md` — **B** may add a prune-review entry; **C** may add a
  hygiene-gate entry. Separate sections.

Single-workstream touch-points the plan should still note (not couplings, listed so the
other workstreams stay clear of them): **C** alone appends `STUB-*` / `SLOP-*` tokens to the
`skills/run/SKILL.md` token family; **A** alone edits `docs/adapters/intention.md`. No
workstream shares an `engine/src` module with another.

No workstream shares an *engine/src* module with another (A touches no engine source; B
touches none; C adds its own). The one latent cross-workstream *data* interaction —
A1's subject globs vs C's new sources — is analysed in A1 (§A-DC2) and is advisory-only.

### As-is per workstream

**A — the intention port guards everyone but itself.** The just-shipped intention port
(`docs/adapters/intention.md`, `engine/src/intention.js`, `intention-subjects.js`,
`intention-lint-main.js`, `glob.js`) lets a living page declare `subjects: [<globs>]` in
line-1 frontmatter; a change touching those globs without touching the page raises an
advisory `INTENTION-DRIFT`. **The port's own four sources carry no such page** — a future
edit to `intention.js` is unguarded. Separately, the zero-config living-corpus
enumeration is **written twice**: `scripts/ci.sh` `run_intention_lint()` (bash `find`) and
`test/intention-lint-ci.test.js` `enumerateCorpus()` (JS `readdirSync`). Empirically they
produce the identical set today (§Pinned matrix) — but nothing keeps them in lockstep; a
new corpus category added to one drifts silently from the other.

**B — harness-pruning happens, but only as a one-off.** The prior
`shrink-core-prune-guardrails` run manually retired guardrails that had become drag
(count-pins, a doubled test run) — proof the need is real and recurring. But there is **no
institution**: nothing prompts a periodic "is this invariant / lint / skill-prose still
load-bearing against the *current* model's capability?" review, and nothing structurally
prevents such a review from dropping a load-bearing invariant. The memory index records
this as a standing follow-up ("standing harness-prune"). The risk in B is not the need —
it is scope: a "recurring capability review" invites auto-detection and auto-classification
machinery that would balloon a prose change into an engine.

**C — nothing catches a stub or slop phrase before it ships.** `intention-lint` is the
established deterministic gate shape (`engine/bin/intention-lint.js` 6-line shim over
`engine/src/intention-lint-main.js` returning `EXIT_OK=0`/`EXIT_INVALID=2`, wired into
`ci.sh`'s enumerate-and-run). There is no equivalent gate for two well-known
completion-hygiene failures: a `TODO`/`FIXME`/`stub` marker left in touched code, and
LLM "slop" prose (filler phrasing) in docs and PR bodies. `test/source-hygiene.test.js` is
the token-grep precedent (a scoped `SCANNED_PATHS` list + `allowlistFilters` to avoid
self-flagging); the `intention.gate: advisory|blocking` manifest key + the
`INTENTION-WAIVE(<page>): <reason>` prose token are the precedent knob + waiver shapes.

### Constraints inherited from the codebase (binding)

- **Engine-bin pattern (the only mutation scope).** A new deterministic gate is a
  ~6-line `engine/bin/<name>.js` shim importing `main(argv, io)` from
  `engine/src/<name>-main.js` (all logic there — Stryker mutates `engine/src/**` only),
  plus an `engine/test/<name>-main.test.js` logic suite and a `<name>.bin.test.js`
  spawn-smoke. `intention-lint` is the exact precedent to copy for C.
- **Advisory-first + knob + waiver.** New guards default to advisory: a finding prints a
  run-record notice but exits 0; a `gate: advisory|blocking` manifest knob promotes it;
  a **fixed greppable prose token** (`INTENTION-WAIVE`-family, placed in the design doc /
  PR body — **never an inline code directive**) waives a specific finding.
- **Token family.** `NO-OP(<phase>):`, `GATE(<phase>): green|red`, `WAIVER:`,
  `INTENTION-DRIFT(<page>):`, `INTENTION-WAIVE(<page>):` are fixed greppable run-record
  tokens. Any C token joins this family verbatim.
- **`contracts/core.md` is the invariant core** — the engine floors. It is the natural
  **denylist** for B: those invariants may never be *proposed* for pruning.
- **No-suppression-directives (core floor).** The C waiver must be a **prose token**, not
  a `// stub-lint-disable` comment — an inline lint-silencing directive is exactly what
  the floor bans. This is load-bearing for C's design.
- **No-swallowed-errors (core floor).** An unreadable file is a loud error line (mirroring
  `intention-lint-main`'s `cannot read <path>` accumulation), never a silent skip.
- **No-provenance-refs (core floor).** New C source/test must not embed phase/ADR/backlog
  numbers in marker sets, messages, or fixtures. (Design docs may reference prior work by
  slug — house style; the ban is on *source and test*.)
- **Enumerate-and-run discipline (`ci.sh`).** Every lint is enumerated (find, not glob)
  and a zero-file enumeration is a hard error, never a silent skip.
- **Structure-lint family (bash).** `scripts/{design,backlog,docs-structure}-lint.sh` are
  thin `awk` heading checks — the alternative home to an engine bin when no parsing is
  needed. `source-hygiene.test.js` is a third home (a `node:test` grep over `SCANNED_PATHS`).
- **Zero-config / zero-drag.** A repo that never invokes B pays nothing (an uninvoked
  skill is inert). C's gates default advisory and scope to the branch diff, so a clean
  change is a no-op. No new runtime dependency (bash + node built-ins).
- **Standalone-skill precedent.** `skills/metrics/SKILL.md` (`craft:metrics`) is a
  session-owned, on-demand skill that is **not** a pipeline phase — the exact home shape
  for B. `requirements` and `architecture` in `pipeline/default.yml` (`enabled: false`) are
  the "declared-but-off phase" alternative.

Provenance for this design: `docs/adapters/intention.md` + `docs/design/intention-port.md`
(port shape, tokens, knob/waiver) · `docs/DESIGN-shrink-core-prune-guardrails.md` (the
one-off prune this institutionalises; advisory-signal + enumerate-and-run precedents) ·
`test/source-hygiene.test.js` (token-grep + self-flag avoidance) · `contracts/core.md`
(the invariant floors / B denylist) · `skills/metrics/SKILL.md` (standalone-skill home).

## Requirements

What must be true when this ships (verifiable), grouped by workstream. Each reverts alone.

**Workstream A**

- **A-R1 — the port self-governs.** A living page in the zero-config corpus declares
  `subjects` covering the intention port's own engine sources, so a branch that edits
  `engine/src/intention*.js` (or `glob.js`, per §A-DC2) without touching that page raises
  an advisory `INTENTION-DRIFT`. The page passes `intention-lint` (its `subjects` is a
  non-empty list of non-empty strings). Because this very change edits those sources, the
  governing page is itself touched in this branch — the drift is self-satisfied on
  landing, not left dangling.
- **A-R2 — one enumerator.** The living-corpus file set is defined in exactly one place;
  `scripts/ci.sh` and `test/intention-lint-ci.test.js` both consume it. Adding or removing
  a corpus category is a one-site edit. The consumed set is byte-identical to today's
  (§Pinned matrix); `bash scripts/ci.sh` stays green.

**Workstream B**

- **B-R1 — an on-demand review exists.** A `craft:prune` skill can be invoked on demand;
  it inspects the harness surface (contracts, lints, skill/agent prose) against the current
  model identity and emits a **proposal** of prune candidates with rationale.
- **B-R2 — propose, never dispose.** The skill never deletes or edits harness files. An
  approved prune is enacted only through a normal craft feature run, where the existing
  gates protect the core.
- **B-R3 — the core is undroppable.** No candidate that maps to a `contracts/core.md`
  invariant can appear in a proposal; the skill reads the core contract as a hard denylist.
- **B-R4 — zero drag.** B adds no default pipeline phase and no new engine module under the
  recommended options; a repo that never runs `craft:prune` is byte-identical to today.

**Workstream C**

- **C-R1 — stub gate.** A configurable stub-marker set is grepped across the branch's
  touched code in the gate cadence; a hit prints a `STUB-FOUND(<file>): <marker>@L<n>`
  notice. Default advisory (exit 0); `blocking` makes an un-waived hit a non-zero gate; a
  `STUB-WAIVE(<file>): <reason>` prose token clears a specific finding.
- **C-R2 — prose anti-slop lint.** A configurable ban-list of slop phrases is grepped over
  the touched docs (and, at propose time, the PR body); a hit prints
  `SLOP-FOUND(<file>): <phrase>`. Same advisory-default / knob / `SLOP-WAIVE` waiver.
- **C-R3 — precedent-faithful.** Each gate is an engine bin + src module + tests (or the
  chosen home, §C-DC2/§C-DC5), wired into `ci.sh` enumerate-and-run; unreadable input is a
  loud error, not a swallowed skip; the waiver is a prose token, never an inline directive;
  no new runtime dependency.
- **C-R4 — no existing-debt avalanche.** The gates scope to the branch diff, not the whole
  repo, so pre-existing markers/prose are not the target and a clean change is a no-op.

**Cross-cutting**

- **X-R1 — independent revertability.** Reverting any one workstream's commit(s) leaves the
  other two green (the coupling map is honoured; `ci.sh`/GUIDE/token-family hunks are
  non-adjacent).
- **X-R2 — gates hold.** Full `node --test` suites + Stryker green; `ci.sh` green; no new
  runtime dependency; mutation scope uncut; no engine floor added.

## Design

### Cross-cutting — the pinned matrix (empirical, this session)

Pinned live in this worktree (`node v22.22.3`), not from memory. The one behaviour this
change must match empirically is **A2's claim that the two enumerators agree today** (so
unifying them is behaviour-preserving). The glob / frontmatter / diff-format behaviours C
and A1 rely on are already pinned in `docs/design/intention-port.md` (P1–P13) and are
reused by reference, not re-pinned.

| # | Behaviour under test | Probe | Pinned result |
|---|---|---|---|
| E1 | `ci.sh` bash enumerator vs test JS enumerator produce the same **set** | ran both over the live worktree, normalised to repo-relative + `LC_ALL=C sort`, `diff` | **set-identical**, 17 entries |
| E2 | corpus composition | — | 10× `docs/adapters/*.md`, 4× `docs/DESIGN-*.md`, `docs/DOD.md`, `docs/GUIDE-customizing.md`, `BACKLOG.md` |
| E3 | the only divergence is **order** | `diff` before common collation | bash `sort` under `en_US.UTF-8` orders `adapters` < `DESIGN`; node `[].sort()` (UTF-16 code units) orders `DESIGN` < `adapters` — **a single source must pin collation or compare as a set, never as a sequence** |
| E4 | path form is consumer-agnostic | — | `ci.sh` emits repo-relative; the test builds absolute but `execFileSync`s with `cwd: ROOT`; `intention-lint-main`'s `readFileSync`/`basename` accept either → a shared enumerator emitting **repo-relative** paths is consumable by both |
| E5 (reused) | glob `*` non-crossing / `**` crossing; frontmatter absent→null / malformed→throw; diff `git diff --no-ext-diff --name-only <base>..HEAD` | — | as pinned P3/P4/P8/P10/P11 in `docs/design/intention-port.md`; not re-pinned |

Consequence: E3 is load-bearing for §A-DC4 — the shared enumerator emits a deterministically
sorted (`LC_ALL=C`) repo-relative list, or the JS consumer compares as a `Set`.

---

### Workstream A — intention-port hygiene (small)

#### A1 — self-governance via `subjects` on `docs/adapters/intention.md`

`docs/adapters/intention.md` opens today with `# Intention adapter spec` — **no
frontmatter**, so `parseSubjects` returns `null` and the page is skipped. Adding a line-1
`subjects:` block naming the port's own sources makes the page self-governing **with no new
corpus wiring** (it is already in `docs/adapters/*.md`, already enumerated, already scanned
by `source-hygiene`). Shape:

```yaml
---
subjects:
  - engine/src/intention*.js   # intention.js, intention-subjects.js, intention-lint-main.js
  - engine/src/glob.js         # shared matcher — see §A-DC2 (over-flag trade-off)
---
# Intention adapter spec
```

Mechanics and edges:

- **Passes `intention-lint` check 1** — `subjects` is a non-empty list of non-empty strings
  (E5-reused frontmatter contract). No banned `source-hygiene` token is introduced (globs
  carry no vendor/technique names), so `docs/adapters/` scan stays green.
- **No dangling drift on the landing branch (either way).** Whether *this* change trips the
  page depends on whether it edits the named sources. A/B/C mostly do **not** touch
  `engine/src/intention*.js` or `glob.js` (A2's enumeration lives in `ci.sh`, not in
  `intention-lint-main.js`; C touches `glob.js` only if it chooses to reuse `matchGlob`).
  So either (i) no named source changes → no match → the page is never flagged (trivially
  clean), or (ii) a named source does change (e.g. C reusing `glob.js`) → because A1 also
  *touches* `intention.md`, `assertFresh`'s `touched.includes(page)` short-circuits and
  `buildStaleRow` returns `null`. No dangling `INTENTION-DRIFT` in either case.
- **Cross-feature interaction (advisory only).** Listing shared `glob.js` means *any future
  change touching `glob.js`* — including C, if C reuses `matchGlob` for path filtering —
  raises an advisory `INTENTION-DRIFT(docs/adapters/intention.md)`. It is advisory and
  clears with an `INTENTION-WAIVE` token; §A-DC2 records the include/exclude trade-off. It
  never blocks and never couples the workstreams at the *file* level.
- **Scope boundary (keeps A independent of B/C).** A1 governs **only** the intention port's
  four sources. It deliberately does **not** claim C's new `engine/src/{stub,prose}-lint-main.js`
  — those either self-govern within C or stay under incremental adoption (advisory absence).
  Coupling C's self-governance into A1's page would break revertability.

#### A2 — single source of truth for the living-corpus enumeration

Today `run_intention_lint()` (bash) and `enumerateCorpus()` (JS) each independently list the
corpus. E1 pins them set-identical; E3 warns the equality is order-sensitive. Recommended
shape (§A-DC3): a **`scripts/living-corpus.sh`** that prints the corpus one repo-relative
path per line, `LC_ALL=C`-sorted (E3/E4), shellcheck-clean:

- `scripts/ci.sh` `run_intention_lint()` replaces its inline `find` block with a read of
  `scripts/living-corpus.sh`'s output (then appends `BACKLOG.md` as today, or the script
  emits it — a one-line detail for the plan), preserving the **zero-file-is-hard-error**
  discipline (`ci.sh` still fails if the enumerator emits nothing).
- `test/intention-lint-ci.test.js` replaces `enumerateCorpus()`/`mdFilesIn()` with
  `execFileSync('bash', ['scripts/living-corpus.sh'], { cwd: ROOT })` split on newlines.
  Because it consumes the same script, drift is structurally impossible; the existing
  "intention-lint exits 0 over the real corpus" assertion is unchanged.
- **What stays honest.** `BACKLOG.md` is appended by whichever side owns it today; the shared
  script owns only the *discovered* pages (`docs/adapters/*.md`, `docs/DESIGN-*.md`, the two
  fixed pages). The plan pins whether `BACKLOG.md` is inside or outside the script — but both
  consumers must agree, so it belongs in the shared source too (recommended: the script emits
  the complete list including `BACKLOG.md`).

Alternatives (a set-equality *test* keeping both enumerators; a JS `engine/src` module) are
§A-DC3 — both are heavier or leave the duplication in place.

---

### Workstream B — standing harness-prune (largest design weight; kept minimal)

The brief's recommendation, adopted here as the **minimal coherent B**: an **on-demand
skill** + a **documented trigger**, **propose-never-dispose**, with the **invariant core as
a hard denylist** — no default pipeline phase, no engine code, no automated deletion.
Everything beyond this is enumerated as a balloon axis (§B-DC1–6) and gathered in the loud
**B SCOPE RISK** note below.

#### The minimal shape

- **Home — `skills/prune/SKILL.md` (`craft:prune`), a standalone session-owned skill**
  modelled on `skills/metrics/SKILL.md`. It is **not** added to `pipeline/default.yml`; it
  is invoked on demand ("craft:prune", "harness prune review", "delete the harness against
  the new model"). An uninvoked skill is inert → zero drag (B-R4).
- **What it inspects (read-only).** The harness surface: `contracts/*.md`, the lint set
  (`scripts/*-lint.sh`, `engine/bin/*-lint.js` + their `engine/src` modules), and
  skill/agent prose (`skills/**`, `agents/**`) — flagging *drag* that the current model no
  longer needs (redundant belt-and-braces guidance, lints superseded by a newer mechanism,
  prose that re-states what the model now does natively). It reads the current model
  identity from the run context / `docs/model-class-matrix.md`.
- **What it produces.** A **proposal only**: a structured list of prune candidates, each
  with (unit, rationale, what-would-replace-the-safety-it-provided). It emits a fixed
  greppable advisory token in the run record (e.g. `PRUNE-CANDIDATE(<unit>): <rationale>` —
  exact token is a plan detail, joins the token family). It **writes no harness file**
  (B-R2).
- **The undroppable-core guarantee (B-R3), realised structurally, not by a classifier:**
  1. **Denylist.** The skill reads `contracts/core.md` and **refuses to emit any candidate**
     that maps to a core invariant. The denylist is *data that already exists* — consistent
     with craft's engine-owned-invariant pattern; B invents no new authority. **Fail-closed:**
     if the denylist source is unreadable, the skill emits **no** proposals rather than
     proposing against an empty denylist.
  2. **Propose-only.** The skill deletes nothing; a human reviews the proposal.
  3. **Enactment through the pipeline.** An approved prune is a *normal craft feature run*
     (design → decisions → … → validation), where `contracts-lint`, `source-hygiene`, the
     mutation gate, and the DoD lints already protect the core. The "gate that can never drop
     a load-bearing invariant" is therefore the **existing** gate set, not new machinery.
- **The advisory signal (recommended: documented trigger, §B-DC5).** The lightest coherent
  signal is a **documented cadence/trigger note** (e.g. the integrate/metrics flow suggests
  running `craft:prune` when a run deliberately bumped the recorded model class), reusing the
  already-committed `docs/model-class-matrix.md` and the metrics model-identity data. No new
  detector, no new drift engine.

#### `> ⚠ B SCOPE RISK — read before planning`

**Verdict: B stays small *only if* the user affirmatively declines every balloon axis.** The
minimal B above is *pure prose*: one `SKILL.md`, one documented trigger, `contracts/core.md`
reused as a denylist — **no `engine/src` module, no bin, no pipeline phase, no
auto-detection, no auto-classification, no automated deletion.** That is a genuinely small,
independently-revertable change (delete the skill dir).

But the "recurring capability review" framing **forks on five axes**, each of which converts
B from prose into engine machinery:

| Balloon axis | Minimal (recommended) | If taken instead → |
|---|---|---|
| **Trigger** (§B-DC2) | manual / documented | a **recorded-model-bump auto-detector** — new engine code diffing model identity across runs |
| **Enactment** (§B-DC3) | propose-only | a **semi/fully-automated pruner** — a mutating tool, and a direct tension with the core no-automated-deletion posture |
| **"Load-bearing" test** (§B-DC4) | core-denylist + human judgment | an **auto-classifier** of what is load-bearing — the single largest balloon; effectively unbounded |
| **Signal** (§B-DC5) | documented note / reuse metrics | a **new drift engine** — new `engine/src` + schema |
| **Home** (§B-DC1) | standalone skill | a **new pipeline phase** — default-pipeline drag on every run, contradicting zero-drag |

**Recommendation to the orchestrator:** obtain an explicit user decision on §B-DC1–B-DC5
**before planning**. If the user wants the minimal shape (decline all balloons), B plans as a
small prose part and ships alongside A and C. **If the user wants any balloon axis, descope B
to its own separate change** so A and C are not stalled behind an unbounded B. A and C do not
depend on B in any way.

---

### Workstream C — pre-completion gates (medium)

Two deterministic gates, each faithful to the `intention-lint` precedent. They share a
posture (advisory-first, knob, prose waiver, touched-set scope) but are independent checks.

#### C1 — stub-marker gate

- **Input = the branch diff, not the repo.** `ci.sh` computes the touched set
  `git diff --no-ext-diff --name-only <base>..HEAD` (E5-reused format; `--no-ext-diff` per
  the scripted-git rule), filters to still-existing **source** files (the stub gate scans
  code; the exact source/docs partition — by ecosystem extension — is a plan detail), and
  passes them as **argv** to the bin — mirroring `intention-lint`'s argv contract *and*
  `assert-fresh`'s diff source. Scoping to the diff means pre-existing debt is out of scope
  (C-R4). Base resolution (merge-base with trunk) is a plan detail as in the intention port;
  **a diff that cannot be computed yields an empty touched set — an advisory no-op, never a
  crash** (mirrors `assert-fresh`). On trunk, `<base>..HEAD` is empty → a clean no-op.
- **Check.** For each argv file, grep for the stub-marker set (§C-DC1; default recommended
  `TODO|FIXME|HACK|XXX|PLACEHOLDER|STUB`, case-insensitive, word-boundary). A hit accumulates
  `STUB-FOUND(<file>): <marker>@L<n>`.
- **Home = engine bin (§C-DC2).** `engine/bin/stub-lint.js` (6-line shim) +
  `engine/src/stub-lint-main.js` `main(argv, io) → exit code` (`EXIT_OK=0`,
  `EXIT_FOUND=2` when blocking) + `engine/test/stub-lint-main.test.js` +
  `stub-lint.bin.test.js`. The touched-set resolution + marker set + waiver logic has enough
  branching to warrant mutation coverage that bash `grep` cannot carry.
- **Self-flag avoidance.** The marker *definitions* live in `engine/src/stub-lint-main.js` —
  which would self-match if scanned. Two structural defences, per the `source-hygiene`
  precedent: (1) the gate scopes to the **touched diff** (the definition file is rarely in a
  feature diff), and (2) the bin **excludes its own source path** from the scan set. A hit in
  the definition file on the rare PR that edits it is cleared by a `STUB-WAIVE` token.
- **Advisory default + knob + waiver.** Default advisory (print, exit 0). The manifest knob
  (§C-DC6) promotes to blocking (un-waived hit → `EXIT_FOUND`). `STUB-WAIVE(<file>): <reason>`
  — a **prose token** in the design doc / PR body (never an inline `// stub-lint-disable`,
  which the core no-suppression floor bans) — clears a specific finding.
- **Error semantics.** An unreadable argv file → a loud `cannot read <file>` error line
  (mirrors `intention-lint-main`), never a swallowed skip.

#### C2 — prose anti-slop lint

- **Ban-list.** A configurable set of slop phrases (§C-DC4; a small fixed seed the user
  curates — the designer does **not** fix the list). Case-insensitive, word-boundary,
  phrase-aware.
- **Scope + where it runs (§C-DC5).** Two surfaces at two seams: touched **docs** (from the
  same branch-diff touched set) at the `ci.sh` gate cadence; the **PR body** at the propose
  phase (the PR body only exists there). `SLOP-FOUND(<file>): <phrase>` accumulates.
- **Home (§C-DC5).** Recommended engine bin (`engine/bin/prose-lint.js` +
  `engine/src/prose-lint-main.js` + tests) for mutation coverage and a shared `main(argv,io)`
  shape with C1; the `source-hygiene` test-grep and a `ci.sh` bash grep are the alternatives.
- **Self-flag avoidance.** Identical to C1: the ban-list lives in the lint's own source, so
  the scan excludes that path and scopes to the touched set; a `SLOP-WAIVE(<file>): <reason>`
  prose token clears an intentional use.
- **Advisory default + knob + waiver.** As C1.

#### C — the manifest knob (shared)

C1 and C2 sit in one workstream, so they may share **one** manifest block (§C-DC6):

```yaml
hygiene:
  gate: advisory        # {advisory, blocking}; default advisory
```

One new `TOP_KEYS` entry + one `validateHygiene` (mirroring `validateIntention`) + one
`switch` case in `engine/src/manifest*.js` — the intention-port manifest-work precedent. A
single `hygiene.gate` promotes both gates together; per-gate keys and a no-manifest-knob
option are §C-DC6. The knob mirrors `intention.gate` exactly so `manifest-lint` catches a
bad value before any phase runs.

#### C — wiring + error semantics (cross-gate)

`ci.sh` gains `run_stub_lint` / `run_prose_lint` (non-adjacent to `run_intention_lint` per
the coupling map), each computing the touched set and passing argv to its bin, respecting the
`hygiene.gate` knob. A blocking, un-waived finding is a non-zero `ci.sh` exit; advisory
findings print and pass. New tokens `STUB-FOUND`/`STUB-WAIVE`/`SLOP-FOUND`/`SLOP-WAIVE` join
the `skills/run/SKILL.md` token family. No source/test embeds provenance refs.

## Decision candidates

The user decides these in the ADR phase; the designer only recommends. `†` marks a **B
balloon axis** — see the B SCOPE RISK note.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| A1 | Self-governance host page | (a) `docs/adapters/intention.md` (already in corpus + scanned); (b) a dedicated new living page; (c) `docs/DESIGN-customizable-engine.md` | **(a)** | Zero new corpus wiring; the page already documents exactly these sources. (b) adds an un-wired page; (c) over-broadens the subjects to the whole architecture. |
| A2-subj | A1 subject globs | (a) `engine/src/intention*.js` + `engine/src/glob.js`; (b) the four files enumerated literally; (c) `engine/src/intention*.js` only (exclude shared `glob.js`) | **(a)** | The `*` glob (E5-reused P3: non-crossing) covers the three intention files cleanly and glob semantics *are* port mechanics. Trade-off: (a) advisory over-flags on any `glob.js` change (incl. C reusing `matchGlob`) — clears with a waiver. Pick (c) if that over-flag is unwanted; (b) is verbose and rots on a rename. |
| A2-src | A2 single-source shape | (a) `scripts/living-corpus.sh` emitting paths, consumed by `ci.sh` + the test; (b) keep both enumerators, add a set-equality *test*; (c) an `engine/src/living-corpus.js` module + tiny bin | **(a)** | Bash is `ci.sh`'s native home; a `find` needs no mutation coverage; `execFileSync`-consumable by the test (E4). (b) leaves the duplication (only guards it); (c) over-engineers a `find` into a bin/process dependency. |
| A2-ord | A2 output contract | (a) emit `LC_ALL=C`-sorted repo-relative paths; (b) emit unsorted, each consumer sorts; (c) consumers compare as a `Set` | **(a)** | E3 pins the equality as order-sensitive across locales; pinning collation at the source is the one deterministic contract. (b) re-introduces the drift risk; (c) works but hides the ordering contract. |
| B1 † | B home | (a) standalone on-demand skill `craft:prune`; (b) an `enabled: false` pipeline phase; (c) documented convention only (+ external harness-audit tools) | **(a)** | Matches the `craft:metrics` standalone-skill precedent; on-demand ⇒ zero drag. (b) risks becoming a default phase; (c) has no craft-owned artifact. |
| B2 † | Prune trigger | (a) manual / documented cadence; (b) recorded-model-bump **auto-detection**; (c) a cadence timer | **(a)** | Manual keeps B prose-only. (b)/(c) are engine machinery — the first balloon axis. |
| B3 † | Enactment / gating | (a) **propose-only** (human enacts via a normal craft run); (b) semi-automated pruner with confirm; (c) automated deletion behind the core-denylist | **(a)** | Propose-only + pipeline enactment gives the undroppable-core guarantee with existing gates. (b)/(c) are mutating tools in tension with the core no-automated-deletion posture. |
| B4 † | "Load-bearing" determination | (a) `contracts/core.md` denylist + human judgment in the proposal; (b) a new dedicated denylist file; (c) an **auto-classifier** of load-bearing-ness | **(a)** | Reuses existing invariant data; no new authority. (c) is the single largest, effectively unbounded balloon. (b) duplicates `core.md`. |
| B5 † | Advisory signal | (a) documented trigger note only; (b) reuse metrics model-class drift (one advisory line when model identity changed vs baseline); (c) a new drift engine | **(a)** or **(b)** | (a) is zero-code; (b) reuses the shipped metrics drift path for near-zero cost. (c) is a new `engine/src` + schema — a balloon. |
| B6 | Prune inspection scope | (a) contracts + lints + skill/agent prose (core-denylisted); (b) also test suites / mutation guards; (c) everything incl. pipeline descriptors | **(a)** | The drag lives in prose + redundant lints; (b) risks proposing safety-net removal; (c) invites dropping structural invariants. |
| C1 | Stub-marker set | (a) `TODO\|FIXME\|HACK\|XXX\|PLACEHOLDER\|STUB` (case-insensitive, word-boundary); (b) that + `WIP\|TBD\|NOTE`; (c) minimal `TODO\|FIXME\|XXX` | **(a)** | Covers the standard completion markers without over-catching prose (`NOTE`/`TBD` appear legitimately). The designer surfaces; the user fixes the set. |
| C2-home | Stub-lint home | (a) engine bin + `src` module (mutation-covered, `intention-lint` pattern); (b) `ci.sh` bash grep; (c) `test/*.test.js` grep (`source-hygiene` pattern) | **(a)** | Touched-set + waiver + knob logic wants mutation coverage `awk`/`grep` can't carry; shares `main(argv,io)` with C2. |
| C3-set | Touched-set source | (a) `ci.sh` computes the diff, passes existing files as **argv** (mirrors `intention-lint` + `assert-fresh`); (b) the bin computes the diff itself; (c) whole-corpus scan | **(a)** | Keeps the bin pure (no ambient git in the mutation-scoped core); (b) puts process/git I/O in the mutate scope; (c) floods on pre-existing debt (breaks C-R4). |
| C4 | Prose slop ban-list | (a) a **small fixed seed** the user curates (e.g. delve / leverage / seamless / robust / "it's important to note" / "in conclusion"); (b) a larger curated list; (c) reference an external style list at runtime | **(a)** | A short high-precision seed keeps false positives low and is fully in-repo/greppable; the user owns the exact list. (c) adds a runtime dependency (banned). |
| C5-home | Prose-lint home + scope | (a) engine bin over touched docs (`ci.sh`) + PR body (propose); (b) `source-hygiene`-style test-grep over the docs corpus; (c) `ci.sh` bash grep | **(a)** | Shares C1's `main` shape + mutation coverage; the PR-body surface only exists at propose, so a bin invoked at two seams is cleanest. (b) can't see the PR body; (c) no mutation coverage. |
| C6 | Gate knob shape | (a) one `hygiene: { gate: advisory\|blocking }` block (one new `TOP_KEY`, mirrors `intention.gate`); (b) per-gate `stub.gate` / `prose.gate`; (c) no manifest knob — advisory-only, promote by a deliberate change | **(a)** | One validator for the whole workstream; least manifest churn; C1+C2 promote together (same workstream). (b) doubles the validator work; (c) is lighter but the brief asks for a promotable knob. |
| C7 | Advisory-vs-blocking default | (a) both advisory; (b) both blocking; (c) stub blocking / prose advisory | **(a)** | Advisory-first is the house posture (drift-signal precedent) — promote once tuned. (b) risks ceremony-drag on day one; (c) splits the default confusingly. |
| C8 | Waiver token form | (a) `STUB-WAIVE(<file>)` / `SLOP-WAIVE(<file>)` prose tokens (mirror `INTENTION-WAIVE`); (b) one shared `HYGIENE-WAIVE(<file>)`; (c) reuse the generic `WAIVER:` | **(a)** | Per-gate greppability matches the token family. (b) loses which gate is waived; (c) over-broadens an existing token. All are **prose tokens**, never inline directives (core floor). |

## Test strategy

**Workstream A.**
- **A1** (`engine/test` reuse): `docs/adapters/intention.md`'s new `subjects` parses to a
  non-empty string list (`intention-lint` check 1 green); `bash scripts/ci.sh` green with the
  block added (`source-hygiene` unaffected — no banned token). Dogfood: a fixture change under
  `engine/src/intention*.js` with the page **untouched** yields
  `INTENTION-DRIFT(docs/adapters/intention.md)`; touching (or `INTENTION-WAIVE`-ing) the page
  clears it — asserting `buildStaleRow`'s `touched`/`waived` short-circuits over the real page.
- **A2**: a `test/*.test.js` asserts `scripts/living-corpus.sh`'s output equals the pinned
  17-entry set (compared as a `Set`, per E3); `test/intention-lint-ci.test.js` (now consuming
  the script) still exits 0 over the real corpus; `shellcheck scripts/*.sh` green;
  `ci.sh`'s zero-file-is-hard-error path still fires (a stubbed empty enumerator → non-zero).
  **State-mutating probes** (any script that writes) run in a `mktemp` throwaway, never the
  worktree.

**Workstream B.** Prose-only under the recommended options → no engine unit test. Verifiable
by inspection/spawn: `craft:prune` invoked on a fixture emits a proposal, **writes no harness
file** (assert no diff to `contracts/`/`scripts/`/`skills/`/`agents/` after a dry run), and
**omits every `contracts/core.md` invariant** from the candidate list (seed the proposal input
with a core-invariant unit and assert it is refused). If any balloon axis is later taken, that
axis brings its own `engine/test` suite (out of scope for the minimal B).

**Workstream C.**
- **stub-lint-main** (`engine/test`, hermetic): a file with `TODO`/`FIXME` in the argv set →
  `STUB-FOUND` accumulated; advisory default exits 0; `blocking` knob → `EXIT_FOUND`; a
  `STUB-WAIVE` token for that file clears it; the bin's **own source path is excluded** from
  the scan (self-flag defence — RED without the exclusion, GREEN with it); an unreadable argv
  file → a loud `cannot read` error line (no swallow). `stub-lint.bin.test.js` spawn-smoke:
  exit 0 clean, non-zero on a seeded blocking hit.
- **prose-lint-main**: a doc with a seeded slop phrase → `SLOP-FOUND`; ban-list source path
  excluded; advisory/knob/waiver matrix as above; the PR-body surface exercised via argv.
- **property lens** (a matcher is touched): for the marker/phrase matcher,
  `hit(file) ⟺ ∃ marker ∈ set : matches(file, marker)` over generated inputs, anchored by the
  seeded fixtures.
- **`ci.sh` integration**: `run_stub_lint`/`run_prose_lint` enumerate-and-run green on a clean
  branch (no touched markers), non-zero on a seeded blocking violation; `shellcheck` green;
  hunks non-adjacent to `run_intention_lint` (revert-independence).
- **Mutation**: Stryker over `engine/src/**` reaches the two new modules with no
  `stryker.conf.json` edit (the recursive glob precedent); per-hunk runs emit ONE combined
  `--mutate` (the workflow-manifest gotcha).

**Cross-cutting.** `bash scripts/design-lint.sh docs/design/harness-hygiene-prune-gates.md`
green on this doc; a revert-rehearsal (revert each workstream's commit(s) in isolation) leaves
`ci.sh` green (X-R1); full suites + Stryker green (X-R2).

## Out of scope

- **Automated harness deletion / a pruner tool** — B is propose-never-dispose; a mutating
  pruner is a balloon axis (§B-DC3), a separate deliberate decision.
- **Auto-detection of model bumps and auto-classification of load-bearing invariants** — the
  two largest B balloon axes (§B-DC2/§B-DC4); the minimal B is manual + a fixed denylist.
- **A new pipeline phase for prune or for the hygiene gates** — B is a standalone skill; C
  wires into the existing `ci.sh` gate cadence. No default-pipeline drag added.
- **Fixing the exact stub-marker set or the exact slop ban-list** — surfaced as §C-DC1/§C-DC4;
  the user owns the lists (the designer never decides decision candidates).
- **Whole-repo stub/slop enforcement** — the gates scope to the branch diff (C-R4);
  pre-existing debt is not this change's target.
- **Making the C gates blocking by default** — advisory-first per the house posture (§C-DC7);
  promotion is a later, deliberate manifest change.
- **New engine floors / touching `contracts/core.md`** — B *reads* core.md as a denylist and
  C adds an advisory gate; neither adds nor edits an invariant floor.
- **Governing C's or B's new sources under A1** — A1 governs only the intention port's four
  sources; coupling B/C self-governance into A1 would break independent revertability.
- **New runtime dependency** — bash + node built-ins only, across all three workstreams.
