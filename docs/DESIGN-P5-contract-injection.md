# DESIGN — P5: engine-owned contract injection + DESIGN split

> Scope of this doc: the P5-specific build decisions. The *living* architecture is
> `docs/DESIGN-customizable-engine.md` §"Engine-owned contract injection (the P5 crux)"; this doc
> pins **what P5 builds** against it. Decisions: ADRs 015–019 (this phase) on top of 003/006/007.
> SoT — intent: `docs/PRD-customizable-engine.md` (§7 injection catalog, §11 invariant core, §19/R10).

## 1 — Problem

Today every `agents/<role>.md` carries its full `Contract:` section; the §11 cross-phase invariants
are scattered across agent bodies, `run/SKILL.md`, and `DESIGN.md` prose. An agent swap (G5) can
drop the contract. P5 relocates the **invariant** portion into an engine-owned store the
orchestrator assembles and injects on **every** run — spawn *and* inline — and thins the agents to
role essence so a swap cannot drop what the engine now owns.

The engine mechanism already exists and is frozen: `assembleContract` (export #5) and
`normalizeFindings` (export #6), both pure, both unit-tested. **P5 supplies the fragment content,
the I/O shell that loads it, the walk wiring, the agent thinning, and the DESIGN split — it does
not touch the 7-export public surface.**

## 2 — The store: `core` (U) + 6 bundles

`contracts/{core,producer,construction,harness-read,harness-exec,delivery,refinement}.md`
(ADR-003/015). `core` is always-on/implicit; `descriptor.contract` names the bundle(s) layered on
top (ADR-006, a list). The closed vocabulary is `BUNDLE_VOCAB` in `engine/src/graph.js`, which
grows from 6 to 7 (adds `refinement`).

### 2.1 — Bundle → invariant mapping (sourced verbatim-in-meaning from today's agent bodies + §11)

| Bundle | `contract:` carriers (default.yml) | Relocated invariant content |
|---|---|---|
| **core (U)** | every phase | never commit on a red gate · never `--no-verify` · **artifact-handoff** (carve-out) · blocker protocol `{ unit, reason, ≤3 options }` — never spin/guess · no provenance refs (phase/ADR/backlog) in source or test · no suppression directives (`@ts-ignore`/`eslint-disable`/coverage-ignore/lint-silencing) · no swallowed errors · bounded scope; work only in the given working directory · **model resolution** (carve-out) |
| **producer** | design (`[producer]`), planning (`[producer]`), requirements\* | fill the named template/schema · Decision-candidates + pre-chewed-context mandate · self-review to convergence (≤3) · state-mutating probes run in a `mktemp` throwaway, never the worktree |
| **construction** | implementation (`[construction]`) | RED→GREEN→REFACTOR strictly · gate-before-commit; one atomic commit · Given/When/Then + AAA + `sut` test conventions absent a context override |
| **harness-read** | review (`[harness-read]`) | read-only; structured findings `{file:line, severity, finding, fix}` · zero findings is a legitimate, converged outcome · fix-delta rounds verify prior findings + review the fix diff |
| **harness-exec** | validation (`[harness-exec]`), architecture\* | a tool runs; the AI triages survivors/violations (kill-or-prove-equivalent / fix-or-justify) · never weaken a test · gate-green before commit |
| **delivery** | documentation, propose, integrate (`[delivery]`) | content traceable to committed artifacts / shipped surface · touch only listed targets · the session owns synthesis records |
| **refinement** | refactoring (`[refinement]`) — **new** | behavior-preserving strictly: tests change only mechanically (moved/renamed/re-imported), no public-API behaviour change · one atomic `refactor(<scope>):` commit per spec; gate-green throughout |

\* `requirements`/`architecture` are default-off (no skill dir until P10); their `contract:` is
already set in `pipeline/default.yml` and validates against the vocabulary.

### 2.2 — Boundary rule (ADR-015)

Invariant that **must survive an agent swap** → a bundle (or U). Method/identity particular to one
role → stays as **craft** in the thinned agent. Examples that stay craft: designer's
empirical-pinning method and "design within the house style"; planner's public-surface-decision
discipline and sizing rules; slice-implementer's "the slice, the whole slice, nothing but the
slice"; reviewer's `--no-ext-diff` git hygiene and "tests dimension: no mutation analysis";
validation-triager's per-survivor triage procedure; refactor-executor's "execute HOW, never decide
WHAT"; docs-writer's "match each page's voice"; backlog-ticker's single-edit discipline.

## 3 — Assembly path (identical for spawn and inline)

`assembleContract(descriptor, manifest, fragments, opts)` concatenates, in fixed order
(`engine/src/contract.js`, already built):

```
[U core]                                  ← expandCore: carve-out markers → agent|inline variant
[bundle(s) named by descriptor.contract]  ← in list order; unknown name throws
[derived retrieval note]                  ← engine-derived; never stored in a fragment
[manifest global context, verbatim]
[manifest per-phase context, verbatim]
[dynamics: wd, paths, diff range, slice, gate cmd, commit msg]   ← appended by the caller, not assembleContract
```

The **two inline carve-outs** live in `core` as markers (`@@ARTIFACT_HANDOFF@@`,
`@@MODEL_RESOLUTION@@`); `expandCore` emits the agent variant by default and the inline variant when
`opts.execution === 'inline'` — *artifact-is-the-handoff* → "the commit is the handoff (no agent
context to lose)"; *model-resolution+fallback* → "the session model" (SP1). Every other U line binds
verbatim inline. **Exactly two lines differ between modes** — the frozen test asserts it.

- **spawn**: the block is prepended to the Task prompt; the thin agent def supplies only craft.
- **inline**: the same block is loaded into the session at phase entry; the session follows it.

## 4 — Loading seam (ADR-016): the impure shell over the pure core

`assembleContract` never reads disk (ADR-002). `Resolution` is golden-frozen (SC1), so assembly
cannot fold into `pipeline-resolve`. Therefore:

- **`engine/bin/contract-assemble.js`** — reads `contracts/*.md` into `fragments`, takes the phase
  descriptor (JSON) + optional manifest + `--inline`, calls `assembleContract`, prints the block.
  The walk (`run/SKILL.md` step 3) calls it once per phase.
- **`engine/bin/contracts-lint.js`** — all 7 fragments present + non-empty; each basename ∈
  `BUNDLE_VOCAB`; no fragment contains the `retrieval` string. Appended to `ci.sh`.
- **`engine/bin/normalize-findings.js`** — the session's CLI access to `normalizeFindings`; the
  review path pipes reviewer output through it (ADR-019).

Production fragments live at repo-root `contracts/`; the mechanism unit tests keep their minimal
`engine/test/fixtures/contracts/` stubs (content-independent — they test ordering/carve-outs, not
wording). The fixtures gain a `refinement.md` stub so the assembly tests can exercise `[refinement]`.

## 5 — R8 guard (ADR-018): deterministic block-equivalence

`engine/test/contract-equivalence.test.js`: for each default-pipeline phase, assemble the **production**
block (from `contracts/`) and assert it carries every invariant marker its archetype + bundles must
(a fixed checklist derived from §2.1), and that the inline variant swaps exactly the two carve-out
lines. Pure, CI-gating, no LLM. Retires the historical "fixed-prompt agent-output diff".

## 6 — DESIGN split (ADR-007, DC-18 = relabel-only)

`git mv docs/DESIGN.md docs/DESIGN-history.md`; add a one-line frozen-history header; fix the
inbound cross-references (BACKLOG SoT line and any pointer that treats `DESIGN.md` as living). The
pre-P4 vocabulary inside it (old phase names, the retired `skills/mutation/` ·
`agents/mutation-triager.md` paths) is **correct-as-history** and is *not* rewritten — that was P4's
deliberate deferral. `docs/DESIGN-customizable-engine.md` remains the living SoT.

## 7 — Slice plan (routed by shape)

| # | Slice | Shape / agent | Gate-critical assertions |
|---|---|---|---|
| 1 | `refinement` vocabulary + data wiring | slice-implementer (TDD) | `BUNDLE_VOCAB` accepts `refinement`; `default.yml` `refactoring.contract:[refinement]` validates; `[refinement]` assembles core+refinement; SC1/scenario suite still green |
| 2 | author the 7 production `contracts/*.md` + `contracts-lint` | slice-implementer (content + lint TDD) | lint: 7 present, non-empty, no `retrieval`, names ⊆ vocab; ci.sh wired |
| 3 | `contract-assemble.js` bin + R8 block-equivalence test + walk wiring | slice-implementer (TDD) + the `run/SKILL.md` step-3 edit | per-phase block carries its invariant set; inline swaps exactly 2 lines |
| 4 | thin the 8 agent defs | refactor-executor (behavior-preserving) | R8 equivalence holds; no invariant text left in any agent body |
| 5 | `normalize-findings` wiring for review + DESIGN split | slice-implementer (R10 wire) + session-direct (relabel) | review path keys on fields; `DESIGN-history.md` exists; cross-refs fixed |

A 4-dimension review (perf / security / code / test) follows **every** slice; every fix lands
before the next slice. `scripts/ci.sh` green at every commit; never `--no-verify`.

## 8 — Surface gate (P5)

The assembled injected block per phase is equivalent to today's scattered contract (the deterministic
R8 guard); `assembleContract` is the single contract home (no invariant text duplicated between
`contracts/` and `agents/`); the inline variant swaps exactly the two carve-out lines; SC1 + the
scenario suite stay green (the **resolver** untouched; `default.yml` changes only the one
`refactoring.contract` line, golden-safe); the 7-export public surface is unchanged; CI green at
every commit.
