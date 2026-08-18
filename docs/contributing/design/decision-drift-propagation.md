# Design — decision-drift propagation

> Brief: make a reversed decision detectable before it is silently contradicted,
> recorded mechanically, and surfaced at review — by closing the READ side (ADRs
> become consultable), mechanising supersession, and emitting a drift EVENT.
> No fourth write-side artifact.
> Status: draft → self-reviewed ×3 → accepted

## Context

### Propagation today is write-side strong, read-side absent

Four write-side artifacts already record a decision: the design doc
(`<paths.design>/<slug>.md`), the ADR (`<paths.adr>/NNN-<slug>.md`), the run-record
ledger (`.claude/craft-run-record.md`, run-local, gitignored), and the memory store
(`.claude/craft-memory.md`, committed). Nothing reads an ADR back.

The read side that exists is the intention port. `consult(scope, deps) → IntentionView`
(`engine/src/intention.js`) returns the living pages whose `subjects:` frontmatter globs
intersect a scope; `skills/run/SKILL.md` §1c-int builds one `IntentionView` per run, and
step 4 prepends the phase's slice into the **slot-1 injected contract block** — the single
injection surface, shared with the memory hint. Its corpus is whatever
`deps.listCorpus()` returns, wired in `scripts/ci.sh` and the run skill to
`scripts/living-corpus.sh`: 26 pages (`docs/contributing/specs/*.md`,
`docs/contributing/prd/DESIGN-*.md`, `docs/contributing/DOD.md`, `docs/guides/concepts.md`,
`docs/guides/customizing.md`, `BACKLOG.md`).

**The ADR directory is not in that corpus, and zero of the 350 ADRs carry `subjects:` —
or any frontmatter fence at all.** `consult` cannot return an ADR, on either axis.

Two standing rules are written as if it could:

- `skills/decisions/SKILL.md` step 1 — a candidate is ADOPTED without escalation when its
  design recommendation "aligns with an existing ADR".
- `agents/designer.md` — "Read the repo's existing design docs, ADRs, and the code patterns
  the feature must follow BEFORE designing."

Both are unindexed wishes over 350 files. Also note `skills/run/SKILL.md` step 4 scopes the
intention hint to "the `design` and `planning` phases only" — `decisions`, the phase that
actually applies the ADR-alignment rule, receives nothing.

### Supersession is by hand, and the header field is not machine-readable

The corpus is 338 `accepted`, 11 `accepted — adopted-as-recommended` (two spellings), and
exactly **1** `superseded`. The one worked example,
`docs/contributing/adr/348-arch-gate-resolves-to-the-declared-technique.md`, did three
things correctly and entirely by hand:

1. flipped `docs/contributing/adr/050-architecture-report-gate-and-exceptions.md`'s
   `Status:` to `superseded by ADR-348`, and prepended a blockquote note to it;
2. stated the **scope** of the supersession in both directions — "Not all of ADR-050 is
   stale", then a `Carried forward from ADR-050, unchanged …` list and a
   `Superseded from ADR-050: …` sentence;
3. swept the citations.

Nothing in the repo would have caught it had it not. It did not sweep completely:
`examples/architecture/workflow.md:3-5` — a **live** example manifest, not a dated ledger —
still states ADR-050's superseded rule in the present tense ("runs dependency-cruiser over
the change … safe to enable mid-adoption (ADR-049/ADR-050). All-current."). That is real,
live, uncaught drift sitting in the tree today.

The existing header field cannot carry the mechanical requirement. Its 350 values spread
as: 42 files omit the field entirely, 204 say `none`, and the remaining 104 spread over 15
leading verbs (`refines` 71, `mirrors` 12, `applies` 5, `supersedes` 2, `extends` 2,
`coupled` 2, `contrasts` 2, and nine singletons including two that open with a bare
number). It is prose.

### The dated-ledger convention is deliberate, not a defect

Of 123 files outside `docs/contributing/adr/` that cite `ADR-NNN`, **96** sit under
`docs/contributing/{archive,design,plan,prd}/` — per-run design docs, plans, PRDs and
archived program docs. `docs/contributing/archive/PLAN-P10-default-phases.md:71` still
states ADR-050's superseded rule in the present tense and that is **fine**: those files are
records of what was true on their date. `docs/contributing/specs/intention.md` states the
same rule from the other side — "Frozen records (design history, archived docs, per-run
design docs, decision records) simply carry no `subjects`, so they are never
freshness-guarded, by construction." **27 files** remain in the live tier.

### The lint family has two shapes

| Shape | Members | Scope | Posture | Waiver |
|---|---|---|---|---|
| Structural | `scripts/design-lint.sh` (awk over required `## ` headings), `scripts/plan-lint.sh` → `engine/bin/plan-lint.js`, `scripts/manifest-lint.sh`, `scripts/docs-structure-lint.sh` | whole corpus, looped in `ci.sh` (`for d in templates/design.md docs/contributing/design/*.md`) | hard-blocking, exit 2 | none |
| Hygiene | `engine/src/{stub,prose}-lint-main.js` over `engine/src/hygiene-lint-core.js` | `compute_touched` diff vs `main` | `hygiene.gate: advisory\|blocking` manifest knob, resolved once by `engine/bin/hygiene-gate.js` | per-file `STUB-WAIVE(<file>)` / `SLOP-WAIVE(<file>)` collected from `--waiver-source` files |

The hygiene core's `main(argv, io, { self, waiverPattern, foundToken, scan }) → exitCode`
already owns `parseArgs` (`--gate`, `--waiver-source`, `--` sentinel), `collectWaived`,
`isSelf`, byte-cap-guarded `scanFile`, and the
`gate === 'blocking' && (findings || readErrors) ? EXIT_FOUND : EXIT_OK` decision.

### Token vocabulary and the ledger

Fixed, greppable, engine/protocol-level tokens, one record per line, space-delimited,
prefixed by run-id and emitting phase (`docs/contributing/specs/run-record.md`):
`NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:` (executing-harness skips only),
`POLICY(...)`, `INTENTION-DRIFT(<page>):`, `INTENTION-WAIVE(<page>):`, `STUB-FOUND(<file>):`,
`STUB-WAIVE(<file>):`, `SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`. The orchestrator is the
**single writer** (R4); lines flush at each phase boundary and are carried into the PR body
by `skills/documentation/SKILL.md` / `skills/propose/SKILL.md`.

### Memory transitions

`engine/src/observability/memory.js`: `FLOOR = 0`, `CEILING = 5`, `STEP = 1`, `WINDOW = 50`;
`CONCERNS = [toolchain, gate-cmd, validation-tool, findings, part-sizing]`. `reconcileConcern`
(line ~480) walks existing entries: matched in `observedMap` → REFRESHED
(`Math.min(entry.confidence + STEP, CEILING)`), unmatched → DECAYED
(`newConf = entry.confidence - STEP`, kept only `if (newConf > FLOOR)`); unmatched delta
observations → ADDED at `FLOOR + STEP`. `save(repoRoot, view, delta, deps)` is the only
write; the store carries 43 `findings` entries, several at `confidence: 4` — four more runs
of passive decay before a wrong one dies. There is no active retraction.

`skills/review/SKILL.md` step 3 is the `findings` concern's read/write surface: recurring
entries are read as advisory watch-items prepended to each reviewer spawn; the run writes
back the findings that recurred, keyed by `file` + `pattern`.

### Pinned corpus matrix

Probed in this worktree (`feat/decision-drift-propagation` at `a0cd94b`) on 2026-08-18.
Every number below is a command result, not a recollection.

| Probe | Command | Result |
|---|---|---|
| ADR count | `ls docs/contributing/adr/*.md \| wc -l` | 350 |
| ADRs with `subjects:` | `grep -l '^subjects:' docs/contributing/adr/*.md \| wc -l` | **0** |
| ADRs with any frontmatter fence | `head -1` each, `grep -qx -- '---'` | **0** |
| Status spread | `grep -h '^- \*\*Status:\*\*' … \| sort \| uniq -c` | 338 accepted · 9 `accepted — adopted-as-recommended (no user judgment)` · 2 `accepted (adopted-as-recommended, no user judgment)` · 1 `superseded by ADR-348` |
| `Supersedes/Refines:` field absent | `grep -L 'Supersedes/Refines' … \| wc -l` | 42 |
| Field leading-verb spread (308 present) | field value, `awk '{print tolower($1)}'`, `uniq -c` | `none` 204 · `refines` 71 · `mirrors` 12 · `applies` 5 · `supersedes` 2 · `extends` 2 · `coupled` 2 · `contrasts` 2 · 9 singletons (`retires`, `relates`, `follows`, `discharges`, `builds`, `amends`, `272`, `271`) |
| Files citing `ADR-NNN` outside the ADR dir | `git grep -l -E 'ADR-[0-9]{3}' -- ':!docs/contributing/adr'` | 123 |
| … of those, in the dated-ledger tier | `-- archive design plan prd` | 96 |
| … of those, in the live tier | inverse | **27** |
| Live citations of the one superseded ADR | `git grep -n ADR-050` minus frozen tier | 1 — `examples/architecture/workflow.md:5` (present tense, stale) |
| `living-corpus.sh` page count | `bash scripts/living-corpus.sh \| wc -l` | 26 |
| Spec pages carrying `subjects:` | frontmatter `awk` over `docs/contributing/specs/*.md` | 2 of 17 — `intention.md` (`engine/src/intention*.js`, `engine/src/glob.js`) and `telemetry.md` (`engine/src/observability/**`); `memory.md` and `run-record.md` declare none |
| Engine modules parsing an ADR | `grep -rn 'adr' engine/src/*.js` | 1 hit, `alias-map.js:11` (`adr: 'decisions'`) — no ADR parser exists |

Two consequences fall straight out: adding a frontmatter block to `templates/adr.md` is
**purely additive** (no existing ADR has a fence, so `extractFrontmatter` returns `null` and
every legacy ADR classifies as `no-subjects` — a skip, never an error); and any supersession
lint keyed on a strict declaration passes all 350 legacy files unconditionally, because none
of them declares one.

## Requirements

1. `templates/adr.md` carries a line-1 frontmatter block declaring the repo paths the ADR
   governs, so every ADR authored from the template carries it by construction. An ADR that
   governs no path declares an empty list rather than omitting the key.
2. `consult(scope, deps)` returns governing ADRs alongside living pages, as the same
   `{ path, purpose }` entry shape. An ADR's `purpose` resolves to its H1 minus the leading
   `#` — for ADR-348 that is the string starting `348 — ` and carrying the rest of its title,
   so the number travels with the entry and a phase can cite it without a second read.
3. `assert-fresh`'s `stale[]`, `uncovered[]` and `skipped[]` sets are **byte-identical**
   before and after this change for any input. No ADR ever appears in a freshness report,
   in any field — a decision record is frozen by construction and must not become a
   freshness-guarded page.
4. The `design`, `decisions` and `planning` phases each receive their intention slice —
   living pages and governing ADRs together — via the existing slot-1 prepend. No second
   injection surface is added. `skills/run/SKILL.md` step 4's "the `design` and `planning`
   phases only" is widened to include `decisions`.
5. Backfill is lazy: an ADR without the block is a silent skip, exactly as a living page
   without `subjects` is today. No pass over the 350-file corpus ships.
6. An ADR lint exists in the lint family and is wired into `scripts/ci.sh`. `ADR-348` — the
   corpus's only supersession — is backfilled with the strict declaration as this change's
   one worked backfill, which makes it the lint's live proving ground. With that backfill and
   nothing else, the lint exits non-zero with **exactly one** finding:
   `examples/architecture/workflow.md`'s live present-tense citation of superseded ADR-050.
   Once this change corrects that comment it exits 0 over all 350 files.
7. A strict-form supersession declaration in ADR *M* naming target *N* mechanically requires
   all three of: (a) *N*'s `Status:` reads `superseded by ADR-M`; (b) *M* states the SCOPE of
   the supersession in both directions — what is superseded AND what is carried forward —
   with "nothing carried forward" statable explicitly, never by omission; (c) every live-tier
   citation of *N* is updated or waived.
8. The citation sweep never flags a dated-ledger path. The exempt set derives from the
   resolved manifest paths, never from a hardcoded `docs/…` literal — `paths.adr`,
   `paths.design`, `paths.plan` are manifest-configurable and nothing may assume craft's own
   layout.
9. The lint does not fail `ci.sh` on the 350 pre-existing files by virtue of what they do not
   declare. Legacy-green must be structural (the checks do not fire), not incidental (a
   scoping accident that a later change reverses).
10. `DECISION-REVERSAL(ADR-NNN): <what changed> -> ADR-MMM` joins the fixed token vocabulary,
    is emitted by the `decisions` phase, lands in the run record with the phase column, and is
    carried into the PR body exactly like its siblings. It is documented in
    `docs/contributing/specs/run-record.md` and in the run skill's §1c-int token list.
11. `engine/src/observability/memory.js` gains a **RETRACTED** transition: an entry a run
    proves wrong is evicted immediately (confidence → `FLOOR`), not decayed by one `STEP`.
12. Every existing memory invariant still holds after 11: the store is advisory-only and never
    a gate; `save` never throws and never blocks; `load` returns an empty view on a malformed
    store; a `degraded` view still declines the write before any filesystem access.
13. A retraction of an entry that is not in the store is a no-op, not an error — the delta is
    derived from a run-local ledger and may name an entry another session already evicted.
14. Four spec pages are refreshed in the same change, on two different grounds — probed, not
    assumed (only two of the four carry `subjects:` today):

    | Page | `subjects:` today | Why it must move |
    |---|---|---|
    | `specs/intention.md` | `engine/src/intention*.js`, `engine/src/glob.js` | **freshness-guarded** — this change edits `intention.js`, so it emits `INTENTION-DRIFT` if left |
    | `specs/telemetry.md` | `engine/src/observability/**` | **freshness-guarded** — this change edits `observability/memory.js` |
    | `specs/memory.md` | *none* | correctness — it is the spec for the transition model being extended |
    | `specs/run-record.md` | *none* | correctness — it is the spec for the token vocabulary being extended |

    `specs/memory.md` and `specs/run-record.md` govern code they do not declare, so today they
    can silently rot. Adding `subjects:` to both (one line each) closes that hole inside the
    change that noticed it.

## Design

### Surfaces touched

| Path | Symbol / anchor | Today | After |
|---|---|---|---|
| `templates/adr.md` | line 1 | no frontmatter | line-1 fence carrying the governance declaration |
| `engine/src/intention.js` | `consult(scope, deps)` | `readSubjectPages(deps)` over `deps.listCorpus()` | additionally walks the governing lane; entry shape unchanged |
| `engine/src/intention.js` | `assertFresh(change, deps)` | `readSubjectPages(deps)` | **unchanged input set** — Req 3 |
| `engine/src/intention.js` | `readSubjectPages(deps)` (private) | one corpus, from `deps.listCorpus()` | parameterised by which corpus list it walks |
| `engine/src/intention-subjects.js` | `parseSubjects(content)` | keyed on `subjects` | **unchanged** — one key, one parser, both lanes |
| `scripts/living-corpus.sh` | whole file | 26 living pages | unchanged (Req 3) |
| `scripts/governing-corpus.sh` | — | absent | new: enumerates `<adr-dir>/*.md`, same zero-file-is-an-error discipline |
| `engine/src/adr-lint-main.js` + `engine/bin/adr-lint.js` + `scripts/adr-lint.sh` | `main(argv, io) → exitCode` | absent | new lint |
| `scripts/ci.sh` | after the `design-lint` loop | — | one invocation over the resolved ADR dir |
| `docs/contributing/adr/348-arch-gate-resolves-to-the-declared-technique.md` | line 1 | no fence | the one worked backfill — `supersedes: [{ adr: "050", scope: … }]` (Req 6) |
| `examples/architecture/workflow.md` | lines 3-5 | states ADR-050's superseded dependency-cruiser rule in the present tense | restated as the ADR-348 rule — the lint's first real catch |
| `engine/src/observability/memory.js` | `reconcileConcern(concern, existing, observedMap, delta, provenance)` | REFRESHED / DECAYED / ADDED / EVICTED | + RETRACTED, ahead of the REFRESHED branch |
| `skills/run/SKILL.md` | step 4 intention-hint clause; §1c-int token list | design + planning; 11 tokens | + decisions; + up to 3 tokens (see the §3 tally) |
| `skills/decisions/SKILL.md` | preamble 2, steps 1 and 5 | `record` routing, ADR authoring | + governance declaration, + supersession authoring, + token emission |
| `skills/review/SKILL.md` | step 3 memory surface | READS/WRITES `findings` | + RETRACTS |
| `docs/contributing/specs/{intention,telemetry}.md` | `subjects:` frontmatter | governs code this change edits | refreshed — else they emit `INTENTION-DRIFT` (Req 14) |
| `docs/contributing/specs/{memory,run-record}.md` | no `subjects:` | govern code they do not declare | refreshed **and** given `subjects:` (Req 14) |

### 1 — ADRs become consultable, without becoming freshness-guarded

The tension is explicit: `consult` and `assertFresh` share `readSubjectPages(deps)`, which
reads one corpus (`deps.listCorpus()`) under one key (`subjects`). Requirement 2 wants ADRs
in `consult`'s input; requirement 3 forbids them from `assertFresh`'s. The split therefore
has to land somewhere, and where it lands is DC-1.

The recommended shape splits at the **enumeration** boundary, which is where the corpus is
already single-sourced. `scripts/living-corpus.sh` keeps its exact output; a sibling
`scripts/governing-corpus.sh <adr-dir>` enumerates the ADR directory with the same
zero-files-is-a-hard-error discipline. `deps` grows one optional injection:

```
consult(scope, { readPage, listCorpus, listGoverning })
assertFresh(change, { readPage, listCorpus })      // listGoverning never read
```

`readSubjectPages(list, readPage)` is parameterised by the list it walks, nothing else.
`consult` calls it twice — once per lane — and concatenates, sorting by `path` as today.
`assertFresh` calls it once with `listCorpus`, exactly as today. An absent `listGoverning`
yields an empty governing lane, so a repo with no ADR directory consults exactly as it does
now. **The frontmatter key stays `subjects:`** in both lanes: one convention, one parser
(`parseSubjects` is untouched), one form for `intention-lint` to check.

The consequence that makes requirement 3 structural rather than aspirational: **no ADR path
is ever passed to `assertFresh`**, so no ADR can appear in `stale[]`, `uncovered[]` **or**
`skipped[]`. A key-discriminator design (DC-1 alternative b) would instead leave all 350 ADRs
inside the freshness walk as `no-subjects` skip rows on every run — 350 rows of report noise
for zero information.

Requirement 3 constrains the *freshness report* only. An ADR with a present-but-malformed
fence still appears in **`consult`'s** `skipped[]` as `malformed-subjects` — that is the
existing "a broken page must read as broken" rule, and it is the right signal on a lane a
phase is about to read from.

**One flat `entries` list.** Governing ADRs and living pages share the `{ path, purpose }`
shape and one sorted array; the `IntentionView` JSON in `docs/contributing/specs/intention.md`
does not change. A reader tells them apart by path — an entry under the resolved `paths.adr`
is a decision record — so no `kind` discriminator is added to a documented port shape for
information the path already carries.

**Entry shape and purpose.** An ADR's `purpose` comes from the existing `extractPurpose`,
which strips the frontmatter fence and returns the first non-empty line minus its leading
`#`. On `348-arch-gate-…md` that is ``348 — `<arch gate>` resolves to the declared
technique's own run`` — a usable one-liner with the number in it, so a phase reading the
slot-1 block can cite it without a second read.

**Lazy backfill.** The declaration is absent from all 350 legacy ADRs; absence is a skip.
An ADR joins the consultable set the first time a run has reason to touch it (DC-2). The
governing lane therefore starts empty and grows by use, which is the same adoption curve
`subjects:` already has on living pages.

**Slot-1 widening.** `skills/run/SKILL.md` step 4's intention-hint clause changes "For the
`design` and `planning` phases only" to name `decisions` as well. The slice rule is unchanged
(entries whose declared paths intersect the phase's touched set), the injection point is
unchanged (the same slot-1 prepend that carries the memory hint), and an empty slice still
means the phase probes as it does today.

### 2 — The strict supersession declaration

The existing `**Supersedes/Refines:**` header line stays exactly as it is — free prose, the
human sentence. The machine-readable fact goes in the frontmatter block requirement 1 already
introduces (DC-3), so there is one new home, not two:

```yaml
---
subjects:
  - engine/src/gates.js
supersedes:
  - adr: "050"
    scope: "dependency-cruiser as the gate, the exception home, and the report producer"
---
```

`scope` is the one-line answer to "what part". It is required and must be non-empty: a
boolean supersession is the wrong model, and the corpus's only worked example says so
outright ("Not all of ADR-050 is stale"). `supersedes` absent = the 350-file default = every
check below is inert.

`adr-lint` reads this block with `extractFrontmatter` + `js-yaml` `load` directly rather than
through `parseSubjects`, which returns only `parsed.subjects`. Both keys live in one fence;
neither requires the other.

`skills/decisions/SKILL.md` step 5 gains the authoring obligations that make the lint
satisfiable in the same commit: write the `supersedes` entry, flip the target's `Status:` to
`superseded by ADR-M`, prepend the target's blockquote note, write both scope anchors, and
sweep the live-tier citations.

### 3 — `adr-lint`

A `bin` + `-main.js` pair (`main(argv, io) → exitCode`), invoked via `scripts/adr-lint.sh`,
mirroring `plan-lint`. Signature:

```
adr-lint.sh <adr-dir> [--manifest <path>] [--waiver-source <file>]...
```

It performs four checks, of which the last three fire **only** on an ADR carrying a
strict-form `supersedes` entry:

**C0 — declaration form (all ADRs).** If a frontmatter fence is present, `subjects` must be a
list of non-empty strings and each `supersedes` entry must be `{ adr: <string>, scope: <non-empty string> }`.
A **missing** fence is not a finding (Req 5/9). Malformed YAML in a *present* block is a
finding — `parseSubjects` already throws on exactly this, and a broken page must read as
broken. This is the direct analogue of `intention-lint`'s `checkSubjectsForm`.

*Enforcement boundary.* C0 checks form, never presence: it cannot require the block without a
touched-scope, which DC-5(a) deliberately does not have. Requirement 1 is therefore satisfied
by the **template** — the `decisions` phase authors from `templates/adr.md`, which carries the
block — not by the lint. The residual gap is a hand-written ADR that bypasses the template;
it is caught the first time it needs to supersede something, and never wedges the gate before
that. Buying presence-checking would cost either a 350-file backfill (out of scope) or the
touched-scope whose downsides DC-5 records.

The `adr` value is the **zero-padded 3-digit id exactly as it appears in the filename and in
`ADR-NNN` prose** (`"050"`, not `50`). One string then serves all three lookups — filename
prefix, status line, citation regex — with no padding arithmetic anywhere.

**C1 — target status flip.** For `supersedes: [{ adr: N }]` in ADR *M*, the file in `<adr-dir>`
whose name starts `N-` must carry `- **Status:** superseded by ADR-M`. Resolution is by
filename prefix, matching the decisions skill's own "highest existing + 1" filename probe; an
unresolvable *N*, or two files sharing the prefix, is a finding, not a crash.

**C2 — scope stated in both directions.** *M*'s body must contain both anchors, each naming
*N*. The match is a line-anchored **prefix**, `^Superseded from ADR-N\b` and
`^Carried forward from ADR-N\b` — everything after the id is free prose. That is deliberate:
ADR-348's own lines read `Carried forward from ADR-050, unchanged and now stated
tool-independently:` and `Superseded from ADR-050: every mention of dependency-cruiser…`, so a
stricter `ADR-N:` colon match would fail the one file that got this right by hand. The lint
checks that both anchors exist and name *N*; it never reads the prose after them.

Both are required. "Nothing survives" is stated as `Carried forward from ADR-N: nothing —
<why>`, never by omitting the anchor: the author must *answer* the partial-supersession
question, and a boolean supersession is precisely the model ADR-348 rejected ("Not all of
ADR-050 is stale"). Requiring the anchor to name *N* keeps the two halves attributable when
one ADR supersedes two.

**C3 — live-tier citation sweep.** One `git grep -n -E 'ADR-(N1|N2|…)'` pass over the
**tracked** tree — tracked-only, matching `docs-structure-lint.sh --audience`, so untracked
junk and `node_modules` can never enter the sweep — minus the exempt set. Every remaining hit
is `DECISION-CITE-FOUND(<file>): ADR-N@L<n>` unless waived.

The exempt set (DC-6) is the resolved `paths.adr`, `paths.design`, `paths.plan`, plus the
`archive/` and `prd/` siblings of their common parent, overridable by an `adr.frozen: [<globs>]`
manifest key. Nothing hardcodes a `docs/contributing/…` literal — those three keys are
manifest-configurable and a consumer's layout is its own. Exempting `paths.adr` also covers
*M* itself and the target file, so no self-flagging rule is needed: a decision record citing
another decision record is a historical statement, on the same footing as a dated plan.

Edges: a tree with no git (or a `git grep` that fails) yields a **recorded skip** on stderr
and exit 0 for C3 — a sweep that cannot run is not a pass claim and not a crash, matching
`compute_touched`'s degrade-to-empty posture in `ci.sh`. Zero ADRs declaring `supersedes` skips
the `git grep` entirely — no process is spawned on the common path. Target numbers are
regex-escaped into the alternation, never interpolated raw.

**Waiver.** `DECISION-CITE-WAIVE(<file>): <reason>`, collected from `--waiver-source` files
by the hygiene core's `collectWaived` with a module-specific `waiverPattern`. The design doc
and the PR body are the natural waiver sources, exactly as they are for `STUB-WAIVE` and
`INTENTION-WAIVE`.

**Token tally — the honest cost.** The vocabulary is 11 tokens today. This change adds
**three** run-record tokens: `DECISION-REVERSAL` (Req 10, not optional),
`DECISION-CITE-WAIVE` (DC-7 — a waiver is a decision and belongs in the record, exactly as
`INTENTION-WAIVE` does), and `MEMORY-RETRACT` (DC-10). `DECISION-CITE-FOUND(<file>):` is
**not** among them — under DC-5(a) the lint is hard-blocking, so a finding stops `ci.sh` and
there is no run to fold it into; it is the lint's stdout format, reusing the hygiene core's
`${foundToken}(${file}): …` shape, nothing more. Choosing DC-5(b) instead would flip that: an
advisory finding *would* need to join the vocabulary, taking the count to 15.

**Legacy-green.** Structural, not incidental: C1–C3 are gated on a declaration no legacy ADR
carries, and C0 is gated on a fence no legacy ADR has. All 350 pass with the checks *not
firing*, which survives any later re-scoping of `ci.sh`.

**The one worked backfill.** Legacy-greenness has a corollary that is easy to miss: with the
corpus untouched, C1–C3 never execute against real data at all, and the gate would ship
green-because-inert. This change therefore backfills **ADR-348** — the corpus's only
supersession, and the file whose hand-written shape C1/C2 were derived from — with:

```yaml
---
supersedes:
  - adr: "050"
    scope: "dependency-cruiser as the gate, the exception home, and the report producer"
---
```

C1 then passes immediately (ADR-050 already reads `superseded by ADR-348`), C2 passes
immediately (both anchors are already in ADR-348's Decision section), and **C3 fires once**:
`examples/architecture/workflow.md:5` — a live example manifest describing the superseded
dependency-cruiser rule in the present tense. That is a real bug the lint exists to catch;
this change fixes it by restating the comment as the ADR-348 rule. The result is a gate proven
against the tree, not only against `engine/test/fixtures/`.

**`ci.sh` wiring.** One line appended to the existing `&&` chain, after the `design-lint`
loop:

```bash
&& bash scripts/adr-lint.sh docs/contributing/adr
```

Hard-blocking, whole-corpus, no `hygiene.gate` knob (DC-5) — a superseded decision left
un-propagated is a correctness fact about the decision log, not a style smell.

### 4 — `DECISION-REVERSAL`, an event not a log

One fixed token joins the vocabulary:

```
DECISION-REVERSAL(ADR-NNN): <what changed> -> ADR-MMM
```

- `NNN` = the superseded target, `MMM` = the superseding ADR, `<what changed>` = the
  `scope` string from the strict declaration verbatim, so the token and the ADR cannot
  disagree.
- Emitted by the **`decisions`** phase, one line per `supersedes` entry authored this run,
  appended by the orchestrator at the phase-boundary flush (write point 2 in
  `docs/contributing/specs/run-record.md`) — the single-writer rule R4 is untouched, the
  phase does not write the ledger itself.
- A **refinement** emits nothing. A refinement carries an earlier decision forward; only a
  reversal is a reversal.
- Carried into the PR body by `skills/documentation/SKILL.md` step 5 / `skills/propose/SKILL.md`
  alongside the run record, exactly as `INTENTION-DRIFT` and `SLOP-FOUND` are — which is
  what "surfaced at review" means here. No new PR-body surface.
- Ledger line shape (run-id, phase, token), and it inherits the ledger's path/secret
  discipline unchanged:

```
decision-drift-propagation decisions DECISION-REVERSAL(ADR-050): dependency-cruiser as the gate, the exception home, and the report producer -> ADR-348
```

Edges. The scope string folds to **one line** before it is appended (the ledger's
one-record-one-line rule); the token is greppable, never parsed — nothing splits on the
` -> `, so a `->` occurring inside a scope string is a cosmetic wart, not an ambiguity. A
supersession authored outside a craft run emits no token at all; that is exactly why B and C
are separate mechanisms — `adr-lint` is the durable guard on the artifact, `DECISION-REVERSAL`
is the run-time event on the ledger. Neither substitutes for the other.

No `DRIFT.md`. A standalone drift log would be a fourth write-side artifact needing its own
freshness guard — the exact problem under repair.

### 5 — RETRACTED

A fifth transition, ahead of REFRESHED in `reconcileConcern`'s per-entry branch:

| Transition | Trigger | Effect on confidence |
|---|---|---|
| ADDED | observation with no stored match | `FLOOR + STEP` (1) |
| REFRESHED | observation matches a stored entry | `min(c + STEP, CEILING)` |
| DECAYED | stored entry not observed this run | `c - STEP`, kept only while `> FLOOR` |
| **RETRACTED** | **run proves the stored entry wrong** | **→ `FLOOR`, dropped this run** |
| EVICTED | at/below `FLOOR`, or dropped by cap eviction | removed |

The delta gains a retraction marker on the existing observation shape (DC-8):
`{ concern, payload, retract: true }`. `indexDelta` keys it identically
(`entryKey(concern, payload)`), so `reconcileConcern` matches it against the store by the same
`file` + `pattern` merge key it already uses. The branch order is: retraction → drop (do not
push, do not add); observation → REFRESHED; neither → DECAYED. A retraction whose key matches
nothing stored is a no-op — it is not added, and no error is raised (Req 13); `addedEntries`
filters retraction-marked observations out of the ADDED path.

**How a retraction reaches `save`.** `delta` is not assembled in memory across the run — it is
**derived from the ledger** at `skills/integrate/SKILL.md` step 3, as concern-keyed facts, at
the last point the worktree is alive. A retraction must therefore survive that hop, which
means it needs a ledger line of its own (DC-10). The recommended form is one more fixed token,
`MEMORY-RETRACT(<concern>): <merge-key>`, emitted by the retracting phase and derived at step 3
into `{ concern, payload, retract: true }`. It inherits the ledger's path/secret scrub
unmodified — a `findings` merge key is `file` + `pattern`, and `file` is stored repo-RELATIVE.

**What proves an entry wrong** (DC-9): the recommended bound is that only the phase owning a
concern's write surface may retract that concern, and only on a *mechanical* re-check —
`skills/review/SKILL.md` step 3 retracts a `findings` entry when the run re-checked the
entry's own `file` + `pattern` at that location and it is absent. That keeps the store's
content whitelist intact (only mechanically-verifiable facts) and keeps retraction from
becoming an LLM judgment call laundered into a committed file.

**Invariants preserved** (Req 12): the change is confined to `reconcileConcern` /
`addedEntries`, both of which run inside `save` *after* the `view.degraded` guard is
evaluated and before any path resolution — so a degraded view still declines the write with
`writeNote: 'save skipped: load was degraded'`, `save` still never throws, `load` is untouched,
and the store remains advisory-only. `FLOOR`/`CEILING`/`STEP`/`WINDOW` keep their values;
RETRACTED reuses `FLOOR`, it does not introduce a sixth constant.

### 6 — Non-goals inside the touched code

`assertFresh` gains no ADR analogue. There is deliberately no `ADR-DRIFT(<adr>)` token that
fires when a change touches a path an ADR governs — that would make every ADR a freshness-
guarded page and reintroduce requirement 3's problem through the back door. An ADR that
should change is surfaced by *being consulted* on slot 1, which is the read-side fix.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How ADRs enter `consult` without entering `assert-fresh` | (a) Separate enumeration lanes — ADRs keep the `subjects:` key, `consult` takes a second `deps.listGoverning`, `assertFresh` reads only `listCorpus` so its input set is literally untouched; (b) one widened corpus plus a distinct key (`governs:` on ADRs, `subjects:` on living pages), `readSubjectPages` key-parameterised; (c) one widened corpus, `subjects:` everywhere, plus a `frozen: true` flag `assertFresh` filters on | **(a)** | (a) puts the split where the corpus is already single-sourced (`scripts/living-corpus.sh` is documented as *the* enumerator), so no ADR path is ever passed to `assertFresh` and Req 3 holds by construction rather than by a runtime filter a later corpus edit can defeat; it also leaves `parseSubjects` and `intention-lint`'s form check untouched — one key, one parser. (b) walks all 350 ADRs in every freshness report and emits 350 `no-subjects` skip rows — report noise for zero information — and adds a second frontmatter key for the same concept. (c) makes correctness depend on a per-file flag authored 350 times; one missed flag is a false drift on a frozen record. |
| DC-2 | The lazy-backfill trigger — which run writes the governance block into a pre-existing ADR | (a) The `decisions` phase only, and only for ADRs it authors or supersedes (the write already routes through the intention port's `record`); (b) any phase that reads an ADR backfills it as a side effect (`design` too); (c) no automatic backfill — `adr-lint` C0 requires the block on any ADR the change touches, the author writes it by hand | **(a)** | (a) keeps every ADR write behind the one verb that already owns them (`record`), so the backfill inherits its blocker semantics and its byte-for-byte file-adapter routing. (b) makes a read phase a writer — the designer contract is read-then-design, and a design-phase commit touching ADRs muddies the artifact-handoff boundary. (c) is honest but leaves the governing lane empty for as long as authors forget, which is the failure mode the change exists to end. |
| DC-3 | Where the machine-readable supersession declaration lives | (a) Frontmatter `supersedes: [{ adr, scope }]`, beside `subjects`; the existing `**Supersedes/Refines:**` header line stays free prose; (b) a second strict header line `**Supersedes:** ADR-050 — <scope>` alongside the existing free-text field; (c) reuse the existing `Supersedes/Refines:` field under a strict grammar, normalising the 104 non-`none` values | **(a)** | (c) means rewriting 104 free-text values spread over 15 leading verbs to make a rule that fires on 1 file machine-checkable — a 350-file migration the brief rules out. (b) states the same fact in two prose lines, two homes for one truth, and the lint would have to decide which wins. (a) reuses the fence Req 1 already introduces; the prose line keeps saying what it says today to a human. |
| DC-4 | The scope-of-supersession model the lint enforces | (a) Two required prose anchors in the superseding ADR (`Superseded from ADR-N:` / `Carried forward from ADR-N:`), each naming N, with "nothing" statable explicitly; lint checks anchors, never prose; (b) structured lists in frontmatter (`supersedes: [{ adr, superseded: [...], carried: [...] }]`), body prose free; (c) the one-line `scope:` string alone, prose sections optional | **(a)** | (a) mechanises ADR-348 verbatim rather than inventing a shape — it is the only worked example in 350 files and it got this right. Requiring both anchors forces the partial-supersession question to be *answered*; requiring the `ADR-N` reference in each keeps them attributable when one ADR supersedes two. (b) pushes prose into YAML, where the *why* becomes a quoted string nobody reads. (c) makes "not all of it is stale" assertable in one clause with no statement of what survived — precisely the failure ADR-348 avoided by hand. |
| DC-5 | The lint's posture and blast radius | (a) Whole-corpus, hard-blocking, every check conditional on a declaration no legacy ADR carries — joins the `design-lint` loop in `ci.sh`; (b) touched-diff scoped via `compute_touched`, honouring `hygiene.gate` (advisory default), joining the stub/prose block; (c) whole-corpus but advisory-only (prints, always exits 0) | **(a)** | (a) is legacy-green *structurally* (Req 9) and keeps checking a supersession in every later run — under (b), a target ADR's `Status:` can regress, or a new live citation of a superseded ADR can land, in any run that does not touch those files. Supersession is a correctness fact about the decision log, so `hygiene.gate`'s advisory default is the wrong posture; (c) reproduces today's state, where ADR-348 was correct only because a human was careful. Cost of (a) is one `git grep` pass per superseding ADR — 1 today. |
| DC-6 | What counts as a dated-ledger path (the C3 exempt set) | (a) Fixed prefix list in the lint (`docs/contributing/{archive,design,plan,prd}/**` + the ADR dir); (b) derived from resolved manifest paths (`paths.adr`, `paths.design`, `paths.plan`) plus archive/PRD conventions, with an optional `adr.frozen: [<globs>]` manifest override; (c) inverted — an explicit live allowlist (`skills/**`, `contracts/**`, `templates/**`, `examples/**`, `docs/guides/**`, `docs/contributing/specs/**`, `BACKLOG.md`) | **(b)** | `paths.design`/`paths.plan`/`paths.adr` are manifest-configurable and only skill prose reads them today; a hardcoded `docs/contributing/design/**` in engine code would contradict the manifest for every consumer whose layout differs, and (a) does exactly that. (c) fails closed in the wrong direction — a surface nobody listed silently stops being swept, which is how a live citation goes stale unnoticed. (b) defaults to today's layout for craft with zero configuration and stays honest elsewhere. |
| DC-7 | The C3 waiver token | (a) A new fixed token `DECISION-CITE-WAIVE(<file>): <reason>`, collected by the hygiene core's `collectWaived` from `--waiver-source` files; (b) reuse the generic `WAIVER:` token; (c) an inline marker in the citing file itself | **(a)** | (a) matches the `STUB-WAIVE`/`SLOP-WAIVE`/`INTENTION-WAIVE` family exactly and reuses `collectWaived` unchanged — one `waiverPattern` constant. (b) collides: `WAIVER:` is scoped to executing-harness skips (`skills/run/SKILL.md` step 111) and carries no `(<file>)` parameter, so it cannot be attributed. (c) scatters the decision across the files being swept and needs its own lint to stay honest. Cost of (a) is one more token in a vocabulary this change already grows — see the tally in §3. |
| DC-8 | How a retraction reaches `save` | (a) A marker field on the existing delta observation: `{ concern, payload, retract: true }`; (b) a separate argument: `save(repoRoot, view, delta, retractions, deps)`; (c) a sentinel payload (`confidence: FLOOR`) in the delta | **(a)** | (a) reuses `indexDelta`/`entryKey` untouched — a retraction keys against the store by the same merge key an observation does, so no second lookup path exists to drift. (b) widens the port's only write verb's arity, which every binding (claude, pi) and the spec's Claude-binding prose would have to follow. (c) overloads a field the reconciler owns and the whitelist forbids the phase surfaces from writing, so a malformed store could forge a retraction. |
| DC-9 | What may emit a retraction | (a) Only the phase owning that concern's write surface, and only on a mechanical re-check of the entry's own validated fields (e.g. `review` re-checks `file` + `pattern`); (b) any phase may retract any concern on an observed contradiction; (c) retractions are derived at `Done` from the ledger (from `DECISION-REVERSAL` and harness outcomes), never emitted by a phase | **(a)** | (a) keeps the content whitelist's "only mechanically-verifiable facts" bound intact — the retraction is as checkable as the entry it kills — and matches the existing per-phase write-surface rule that already says which concern each phase may touch. (b) lets one phase's judgment evict another's evidence with no re-check, which is how an advisory store starts lying. (c) is tidy but cannot express the actual trigger: a wrong `findings` entry is proven wrong by the reviewer looking, not by a decision being reversed. |
| DC-10 | How a retraction survives the ledger hop — `delta` is derived from ledger lines at `integrate` step 3, not held in memory | (a) A new fixed token `MEMORY-RETRACT(<concern>): <merge-key>`, derived at step 3 into `{ …, retract: true }`; (b) a polarity marker on the phase's existing buffered `findings` write line, so no new token is added; (c) no ledger hop — the retracting phase mutates the in-session `MemoryView` directly and `save` writes the mutated view | **(a)** | (a) matches the vocabulary convention the whole ledger is built on: a fixed `TOKEN(<param>):` is greppable, attributable by the ledger's phase column, and survives a context reset exactly as `INTENTION-DRIFT` does. (b) saves a token but overloads a line whose derivation rule ("concern-keyed facts") has one meaning today, so a mis-derivation silently *adds* the entry it meant to kill. (c) breaks the documented `save(repoRoot, view, delta, deps)` contract where `view` is the **run-start** view — mutating it is what makes non-re-observed entries vanish instead of decay, and it is invisible to a resumed run. Cost of (a) is one more token — the third this change adds; see the §3 tally. |

## Test strategy

**Unit — `engine/test/intention.test.js` (extend).** London-school, Given/When/Then titles,
AAA bodies, `sut`. `deps` is already fully injected (`readPage`, `listCorpus`), so the
governing lane is one more injected fake.

- Given a corpus with one living page and one governing ADR whose paths intersect the scope,
  When `consult` runs, Then `entries` carries both, sorted by `path`.
- Given a governing ADR with a frontmatter fence but no governance key, When `consult` runs,
  Then it is skipped, never rejected.
- Given `deps` with no `listGoverning`, When `consult` runs, Then the result equals today's.
- **The Req-3 lock**: Given identical `change` and `deps` with a governing lane populated,
  When `assertFresh` runs, Then the report is deep-equal to the report from the same input
  with the lane empty — no ADR in `stale`, `uncovered` **or** `skipped`.
- Purpose extraction over a real ADR body (fence + `# NNN — title`).

**Unit — `engine/test/adr-lint-main.test.js` (new).** `main(argv, io)` with an injected `io`,
mirroring `engine/test/intention-lint-main.test.js`. Fixtures under
`engine/test/fixtures/adr/`: a legacy ADR (no fence), a well-formed supersession pair, and
one fixture per violation. Edge matrix:

| Case | Expected |
|---|---|
| ADR with no frontmatter fence | exit 0, no finding (legacy-green) |
| Fence present, malformed YAML | finding |
| Fence present, `subjects` a string not a list / an empty-string element | finding |
| `supersedes` entry missing `scope`, or `scope` empty/whitespace | finding |
| Target ADR's `Status:` still `accepted` | C1 finding |
| Target number resolves to no file | C1 finding, no crash |
| `Superseded from ADR-N:` present, `Carried forward from ADR-N:` absent | C2 finding |
| `Carried forward from ADR-N: nothing — <why>` | pass |
| `Carried forward from ADR-N, unchanged and …:` (ADR-348's real comma form) | pass — the prefix match, not a colon match |
| Anchor present but naming a different ADR | C2 finding |
| `adr: 50` (unpadded) against file `050-…md` | C0 finding — the id is the padded string |
| Two files sharing the `N-` filename prefix | C1 finding, no crash |
| Live-tier citation of N | C3 finding, one line per hit |
| Same citation under each exempt path | pass |
| Same citation with a matching `DECISION-CITE-WAIVE(<file>)` in a `--waiver-source` | pass |
| Citation inside the superseding ADR itself, or inside the target | pass (never self-flags) |
| Two ADRs superseding two targets | both swept, findings attributed per target |

**Unit — `engine/test/memory.test.js` (extend).**

- Given a stored entry at `confidence: 4` and a delta retracting its key, When `save` runs,
  Then the entry is absent from the returned view (not `confidence: 3`).
- Given a retraction whose key matches nothing stored, When `save` runs, Then the store is
  unchanged and no entry is ADDED (Req 13).
- Given a delta carrying a retraction **and** an observation for the same key, Then the
  retraction wins (branch order is pinned, not incidental).
- Given `view.degraded === true` and a delta of retractions, Then `writeNote` is
  `'save skipped: load was degraded'` and `deps.writeStore` is never called (Req 12).
- Given a `writeStore` that throws, Then `save` returns a `writeNote` and does not throw.
- Property lens over the transition table: for any (stored confidence ∈ `FLOOR..CEILING`) ×
  (observed | not-observed | retracted), the resulting confidence is in range and RETRACTED
  always yields absence — the reconciler is the round-trip-shaped surface here.

**Integration — `test/` (repo-root suite).**

- `test/adr-lint-ci.test.js` (new), mirroring `test/intention-lint-ci.test.js`: shells out to
  `scripts/adr-lint.sh` over the **real** `docs/contributing/adr` and asserts exit 0 — the
  standing legacy-green guard (Req 6/9). It is red from the moment ADR-348 is backfilled until
  `examples/architecture/workflow.md` is corrected: that red-then-green pair is the proof the
  gate is live rather than inert, and it must be observed in that order, not skipped by
  landing both edits in one commit.
- `scripts/governing-corpus.sh` enumerates non-zero and errors on an empty directory, same
  discipline as `living-corpus.sh`.
- `ci.sh` invokes the lint (grep-level assertion, matching how the existing lint wiring is
  guarded).

**Docs/consistency.** `scripts/design-lint.sh` over this doc; `intention-lint` over the three
refreshed specs; the run-record token list in `skills/run/SKILL.md` §1c-int and
`docs/contributing/specs/run-record.md` name `DECISION-REVERSAL` identically (one assertion,
so the two lists cannot drift apart).

**Mutation.** `npm --prefix engine run mutation`, per-hunk scope as ONE comma-separated
`--mutate` (repeated flags silently drop all but the last). The branch-order guard in
`reconcileConcern` and the conditional gating in `adr-lint` C0–C3 are the hunks most likely
to harbour survivors — both are pinned by a dedicated test above rather than by coverage
incident.

## Out of scope

- **A 350-file `subjects:` backfill on ADRs.** Absence is a skip; the lane grows by use (Req 5).
- **Normalising the 104 free-text `Supersedes/Refines:` values.** The header line stays prose;
  the machine-readable fact is a new declaration (DC-3), so no migration is needed.
- **A standalone `DRIFT.md` drift log.** Explicitly rejected: a fourth write-side artifact
  needs its own freshness guard, which is the problem being solved.
- **An `ADR-DRIFT(<adr>)` freshness token.** Making ADRs freshness-guarded contradicts Req 3
  and the frozen-record convention; the read-side fix is consultation, not a guard.
- **Retracting concerns other than `findings` in this change.** The transition is generic in
  `reconcileConcern`, but only `skills/review/SKILL.md` gains a documented retraction surface
  (DC-9); the other four concerns keep passive decay until a phase has a mechanical re-check
  worth trusting.
- **Un-stale-ing the dated-ledger citations.** `docs/contributing/archive/PLAN-P10-default-phases.md:71`
  and the 95 other frozen-tier citations stay exactly as they are — that is the convention,
  not a defect.
- **A `custom`-backend contract for the governing lane.** The `custom` script's `consult` argv
  contract is unchanged; how a non-file backend distinguishes a governing record from a living
  page is its own concern, documented when a backend needs it.
- **Widening the intention hint beyond `design`/`decisions`/`planning`.** The later phases
  read the design doc and the plan, which already carry what the earlier phases consulted.
- **Mechanically requiring the governance block's presence.** C0 checks form, never presence;
  buying presence costs a 350-file backfill or a touched-scope, both rejected above. The
  template is the enforcement surface for new ADRs.
- **Changing the `decisions` phase's triage or no-op path.** The adopt-or-escalate rule, the
  ADR-number probe (highest existing + 1), the cross-candidate interaction check, the
  `NO-OP(decisions)` first-class no-op, and the scope-fold rule are all untouched. The phase
  gains inputs (a populated slot-1 slice) and two authoring obligations, not a new procedure.
- **A second injection surface.** The governing ADRs ride the existing slot-1 prepend. No
  phase gains a new prompt section, and the `IntentionView` JSON shape does not change.
