# Plan — P5: engine-owned contract injection + DESIGN split

> Source: design doc `docs/DESIGN-P5-contract-injection.md` · ADRs `015–019` (on 003/006/007)
> The plan is the implementation script AND the knowledge handoff. Part agents start with zero
> context: whatever a part block omits is paid later as agent rediscovery.
> Repo has no manifest → engine defaults. Part gate: `cd engine && node --test` (+ `shellcheck
> scripts/*.sh hooks/*.sh` and/or `bats test/` when shell is touched). Phase-boundary gate:
> `bash scripts/ci.sh`. Never `--no-verify`.

## Sizing rules

- Every part costs a full agent lifecycle — it must earn it. No standalone test-only parts.
- Parts are sequential; they share one working tree and build on each other.

## Part 1 — `refinement` bundle vocabulary + `default.yml` wiring

### Context
The 6th bundle (ADR-015) is added here, proving golden-safety before any content lands.
- **`engine/src/graph.js:1-4`** — `const BUNDLE_VOCAB = new Set(['core','producer','construction','harness-read','harness-exec','delivery'])`. Add `'refinement'` to this set. This set is consulted by `validatePipeline` (`engine/src/graph.js:87-99`, the `for (const bundle of d.contract)` loop) — without the edit, `validatePipeline` rejects the new `default.yml` and `pipeline-lint.js` fails in `ci.sh`.
- **`engine/test/graph.test.js:98-113`** — the "bundle vocab" block. The negative test ("unknown bundle name → ok false") at :100 uses a bogus name and stays valid. The positive test ("valid bundle names → ok true") at :113 — extend its fixture descriptors to include a `contract: [refinement]` case so the new vocab member is covered.
- **`pipeline/default.yml:86-95`** — the `refactoring` descriptor; line 88 is `  contract: []`. Change to `  contract:\n    - refinement` (list form, matching the other descriptors' style, e.g. lines 22-23 `contract:\n    - producer`).
- **`engine/test/fixtures/contracts/`** — 6 stub bundles. Add `refinement.md` (a minimal stub, ~1 line e.g. `Behavior-preserving; tests change only mechanically.`) so assembly tests can exercise `[refinement]`. **Must NOT contain the string `retrieval`** (the no-retrieval fixture test at `contract.test.js:118-126` iterates `FRAGMENTS`).
- **`engine/test/contract.test.js:15-22`** — the `FRAGMENTS` object reads the 6 fixtures via `readBundle`. Add `refinement: readBundle('refinement')`. **`engine/test/scenarios.test.js`** has the same `readBundle` helper (~line 41) and an S-test FRAGMENTS — check whether it enumerates bundles; if it builds a FRAGMENTS map, add `refinement` there too.
- **Golden-safety (verified):** no scenario/resolve test asserts a descriptor's raw `contract` value — they assert `effective.map(d=>d.id)`, roles, archetypes, gates, waivers. `refactoring` stays archetype `refinement`, so the waiver test (`scenarios.test.js:594-606`, `proposeGateReleased:false`) is unaffected.

### TDD steps
- RED: add a `contract.test.js` case — `assembleContract({id:'refactoring',contract:['refinement'],execution:'agent'}, {}, FRAGMENTS, {})` includes the refinement fixture content. Fails: `refinement` not in `FRAGMENTS` (and would throw "Unknown contract bundle" once wired through validation). 
- RED: add/extend the `graph.test.js` positive-vocab test with a `[refinement]` descriptor → expect `ok:true`. Fails: `refinement` ∉ `BUNDLE_VOCAB`.
- GREEN: add `'refinement'` to `BUNDLE_VOCAB`; add `engine/test/fixtures/contracts/refinement.md`; add `refinement` to the test `FRAGMENTS` map(s); set `refactoring.contract:[refinement]` in `default.yml`.
- REFACTOR: confirm `node engine/bin/pipeline-lint.js pipeline/default.yml` and `pipeline-resolve.js` still exit 0.

### Gate
`cd engine && node --test` && `node engine/bin/pipeline-lint.js pipeline/default.yml` && `node engine/bin/pipeline-resolve.js pipeline/default.yml`

### Commit
`feat(engine): add refinement contract bundle to the closed vocabulary (ADR-015)`

## Part 2 — author the 7 production `contracts/*.md` + `contracts-lint`

### Context
Author the **real** contract store at repo-root `contracts/` (ADR-003/016), sourced verbatim-in-
meaning from the agent bodies + `run/SKILL.md` §"Cross-phase invariants" + the §2.1 mapping table
in the design doc. These are *production* files, distinct from the `engine/test/fixtures/contracts/`
mechanism stubs (which stay minimal).
- **Source A — agent bodies** (`agents/*.md`, the `Contract:` sections): `designer.md` → producer; `planner.md` → producer; `part-implementer.md` → construction (+ the "Forbidden, always" list → core); `reviewer.md` → harness-read; `refactor-executor.md` → refinement; `validation-triager.md` → harness-exec; `docs-writer.md` + `backlog-ticker.md` → delivery.
- **Source B — `skills/run/SKILL.md:127-180`** ("Cross-phase invariants"): artifact-handoff, blocker protocol, gates, model resolution, provenance → core (generalised).
- **Carve-out markers (core only):** the two lines must embed `@@ARTIFACT_HANDOFF@@` and `@@MODEL_RESOLUTION@@` verbatim — `engine/src/contract.js:1-17` defines them and `expandCore` rewrites them per mode. The agent-variant text the engine emits is `'the agent commit is the handoff; a dead agent respawns from the artifact'` and `'the role model resolved from manifest→agent-pin→fallback'`; author the core lines so the *surrounding* prose reads correctly once the marker is substituted (e.g. `Artifact handoff: @@ARTIFACT_HANDOFF@@`).
- **No `retrieval` string anywhere** in any fragment (engine derives it — `contract.js:54-56` `deriveRetrievalNote`; guarded by `contract.test.js:118-126`).
- **Bundle contents** = the §2.1 table rows. Mirror the fixture decomposition (`engine/test/fixtures/contracts/*.md`, already the right shape) but with the full real text.
- **New bin `engine/bin/contracts-lint.js`** — model on `engine/bin/pipeline-lint.js` (`engine/bin/pipeline-lint.js` is 673B: read a path, validate, exit 0/2 with stderr). It must: resolve `contracts/` relative to a passed dir arg (default the repo `contracts/`); assert all 7 files (`core` + the 6 in `BUNDLE_VOCAB`) exist + non-empty; assert no file contains `retrieval` (case-insensitive); exit 2 with a clear message on any failure. Import `BUNDLE_VOCAB`? It's not exported — either export it from `graph.js` (additive, surface-safe — it's not one of the 7 index exports) or inline the 7 names in the lint with a comment pointing at `graph.js`. **Prefer exporting** `BUNDLE_VOCAB` from `graph.js` and re-using it (one vocab home).
- **`scripts/ci.sh:11`** — the single pipeline line. Append ` && node engine/bin/contracts-lint.js contracts` to it (the ci.sh convention: "parts that add new binaries append to this file").

### TDD steps
- RED: `engine/test/contracts-lint.test.js` — spawn `contracts-lint.js` against a temp dir missing a bundle → exit 2; against a dir with a `retrieval` string → exit 2; against the real `contracts/` → exit 0. Fails: bin doesn't exist / fragments don't exist.
- GREEN: author the 7 `contracts/*.md`; write `contracts-lint.js`; (if chosen) export `BUNDLE_VOCAB` from `graph.js`.
- GREEN: append the `contracts-lint` line to `ci.sh`.
- REFACTOR: dedupe the vocab source; ensure `shellcheck scripts/ci.sh` passes.

### Gate
`cd engine && node --test` && `shellcheck scripts/*.sh hooks/*.sh` && `node engine/bin/contracts-lint.js contracts`

### Commit
`feat(contracts): author the 7-fragment engine contract store + contracts-lint (ADR-003/016)`

## Part 3 — `contract-assemble.js` bin + R8 block-equivalence + walk wiring

### Context
Wire the pure assembler to disk and into the orchestrator (ADR-016/018).
- **New bin `engine/bin/contract-assemble.js`** — model on `engine/bin/pipeline-resolve.js` (reads files, `js-yaml load`, calls a pure fn, prints). Args: a phase descriptor as JSON (or `--descriptor-id <id>` resolving against `pipeline/default.yml` via `parsePipeline`), optional manifest path, `--inline` flag, optional `--contracts-dir` (default `contracts/`). Read the 7 fragments into a `fragments` object keyed `{core, producer, construction, 'harness-read', 'harness-exec', delivery, refinement}`; call `assembleContract(descriptor, manifest, fragments, { execution: inline ? 'inline' : 'agent' })` (signature: `engine/src/contract.js:90`); print the block to stdout; exit 2 with stderr on a bad bundle/missing file.
- **`assembleContract` contract (frozen):** `(descriptor{id,contract[]}, manifest{context?,phases?}, fragments, opts{execution?}) → string`. Order: core → bundles (list order) → retrieval note → global ctx → per-phase ctx. Throws `Unknown contract bundle` on a name ∉ fragments. The dynamics block is the **caller's** to append (not assembled here) — the bin prints only the assembled block; the walk appends dynamics in the spawn prompt.
- **R8 test `engine/test/contract-equivalence.test.js`** — load the **production** `contracts/` (not fixtures), `parsePipeline(pipeline/default.yml)`, and for each descriptor assert the assembled block contains a fixed checklist of invariant markers for `core` + each named bundle (derive the checklist from §2.1 — short unique substrings, e.g. core: `never commit`, `blocker protocol`, `provenance`; producer: `template`, `convergence`, `mktemp`; refinement: `behavior-preserving`, `mechanically`). Assert the inline variant (`execution:'inline'`) differs from agent by **exactly two lines** (reuse the `diffLines` pattern from `contract.test.js:30-41`) and those are the two carve-outs.
- **`skills/run/SKILL.md:75-78`** — step 3, the `P5 TODO`. Rewrite: at phase entry the orchestrator runs `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/contract-assemble.js" --descriptor-id <phase.id> [manifest-path] [--inline]` and uses stdout as the injected contract block — **prepended** to the spawn prompt (agent) or **loaded in-thread** (inline). Remove "For now, agent defs carry their own contracts." Update §"Agent spawns" (`SKILL.md:158-165`) so the spawn's first segment is the engine-assembled block; the agent def supplies craft only. The manifest `context:` is now carried *inside* the assembled block (assembleContract appends it) — reconcile the §"Agent spawns" wording (it currently says the prompt embeds context separately) so context isn't double-injected.

### TDD steps
- RED: `contract-assemble.test.js` — run the bin for `--descriptor-id design` → stdout includes producer markers + core; `--descriptor-id design --inline` → stdout includes "the session model". Fails: bin absent.
- RED: `contract-equivalence.test.js` per-phase invariant-marker checklist + 2-line inline diff. Fails: bin/markers absent.
- GREEN: write `contract-assemble.js`; make the equivalence checklist pass against the real `contracts/` (adjust fragment wording if a marker is missing — the fragments are the source of truth).
- GREEN (doc): rewrite `run/SKILL.md` step 3 + §"Agent spawns".
- REFACTOR: ensure no double-injection of `context:`.

### Gate
`cd engine && node --test` && `node engine/bin/contract-assemble.js --descriptor-id review`

### Commit
`feat(engine): contract-assemble bin + deterministic R8 block-equivalence; wire the walk (ADR-016/018)`

## Part 4 — thin the 8 agent defs to identity + craft

### Context
Behavior-preserving relocation (ADR-017): the invariant text now lives in `contracts/` and is
injected by part 3's wiring, so it is **removed** from the agent bodies. Guarded by part 3's R8
equivalence test (the union — injected block + thin agent — still carries every invariant).
- **Files:** `agents/{designer,planner,part-implementer,reviewer,refactor-executor,validation-triager,docs-writer,backlog-ticker}.md`. Each currently has a `Contract:` section.
- **Remove** every line whose content is now an engine invariant (per §2.1): "never commit on red", "--no-verify", artifact-handoff, blocker protocol `{ ... ≤3 options }`, provenance, suppression directives, swallowed errors, bounded scope, model resolution, the bundle-specific invariants (template-fill, convergence, RED→GREEN, read-only-findings, behavior-preserving, etc.).
- **Keep** (craft, per §2.2): role identity (the opening "You write the design document…" / "You execute refactor specs…" sentence), the role's *method* particulars (designer's empirical-pinning + house-style; planner's public-surface-decision + sizing; part-implementer's "the part, the whole part"; reviewer's `--no-ext-diff` hygiene + tests-dimension caveat + the findings *format line*; validation-triager's per-survivor triage procedure; docs-writer's voice-matching + source-traceability-to-design; backlog-ticker's single-edit discipline), and each agent's **Final message:** format line.
- **Frontmatter unchanged** (`name`, `description`, `model`). The `model:` pins stay (designer/planner/reviewer are `fable`; others sonnet/haiku) — out of scope for P5.
- **No pointer stub** (ADR-017): do not add "see contracts/" prose.
- This is a `refactor-executor`-shaped part: pre-scoped, behavior-preserving, no test logic changes. The "test" that must stay green is the R8 equivalence + the full suite.

### TDD steps
- (refactor part — no new RED) Pre-condition: part 3's R8 test is green with the *current* fat agents (the engine already carries the invariants; the agents are now redundant copies).
- Execute: strip the `Contract:` invariant lines from each of the 8 agents, leaving identity + craft + final-message.
- Verify: `cd engine && node --test` green (R8 unaffected — it reads `contracts/`, not agents); manually confirm no agent body still contains an invariant substring (grep the §2.1 markers across `agents/` → only craft remains).

### Gate
`cd engine && node --test` && `grep -RIl "never commit on a red\|blocker protocol\|--no-verify" agents/ ; test $? -eq 1`

### Commit
`refactor(agents): thin all 8 role defs to identity + craft; invariants now engine-injected (ADR-017)`

## Part 5 — `normalize-findings` wiring for review + DESIGN split

### Context
Two small, independent finishers (ADR-019 + ADR-007/DC-18).
- **`normalize-findings` (R10):** new bin `engine/bin/normalize-findings.js` — reads raw reviewer output from stdin (or a path arg), calls `normalizeFindings` (`engine/src/findings.js:137`, frozen export), prints the canonical `Finding[]` as JSON. `normalizeFindings(raw) → {file,line,severity,finding,fix?}[]`; tolerates a JSON array OR a per-line `<severity> <file>:<line> — <finding> [| <fix>]` list; throws on structurally unrecoverable input. Wire it in `skills/run/SKILL.md` / `skills/review/SKILL.md`: the session pipes each reviewer's findings through it before applying, keying on fields not layout. RED: `engine/test/normalize-findings-bin.test.js` — feed both shapes, assert identical canonical JSON; feed garbage, assert exit 2.
- **DESIGN split (relabel-only):** `git mv docs/DESIGN.md docs/DESIGN-history.md`. Add a one-line header to the top of `DESIGN-history.md`: `> **Frozen migration record.** The living engine architecture is docs/DESIGN-customizable-engine.md (ADR-007). Pre-P4 vocabulary below is correct-as-history.` Do **not** rewrite the old phase names inside. Fix inbound cross-refs: `grep -rn "DESIGN\.md" --include=*.md . | grep -v DESIGN-customizable | grep -v DESIGN-P` and repoint any that treat `DESIGN.md` as the living doc (e.g. check `BACKLOG.md`, `README.md`, the PRD §16). The BACKLOG SoT line (`BACKLOG.md:7`) already points architecture at `DESIGN-customizable-engine.md` — verify it needs no change.

### TDD steps
- RED: `normalize-findings-bin.test.js` — JSON-array input and per-line input yield byte-identical canonical JSON; malformed input exits 2. Fails: bin absent.
- GREEN: write `normalize-findings.js`; wire the review path in `run/SKILL.md`/`review/SKILL.md`.
- GREEN: `git mv docs/DESIGN.md docs/DESIGN-history.md`; add the frozen header; fix cross-refs.
- REFACTOR: `bash scripts/ci.sh` fully green; confirm no dangling `docs/DESIGN.md` link.

### Gate
`cd engine && node --test` && `bash scripts/ci.sh`

### Commit
`feat(engine): normalize-findings bin wired for review output; split DESIGN.md → DESIGN-history.md (ADR-019/007)`
