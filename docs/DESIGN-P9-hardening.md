# Design — P9 hardening batch

> Brief: a post-P9 closure mini-phase bundling the two P9-tied BACKLOG sections —
> "Parked from P9" (2 items) + "Engine/tooling hardening (surfaced during the P9 dogfood)"
> (6 items) — into ONE design. Wire the dormant `roleExists` seam (ADR-037) into the live
> path; stand up mutation tooling so the validation phase runs for real; and close six
> engine/tooling footguns the P9 dogfood surfaced (models.fallback, nested-lockfile probe,
> `node --test` discovery, decisions cross-candidate prompt, brief-echo noise, review cadence).
> Surface gate FROZEN: 7-export engine surface, SC1 byte-identical, all scenario goldens green
> at every commit.
> Status: ACCEPTED — ratified as ADRs 041–047. Deviations from the design's recommendations:
> DC-5b → glob **+ count-assert gate** (ADR-046); DC-10 → item 10 **DROPPED** (ADR-045); DC-3a →
> walk-prose default `sonnet` (ADR-041); DC-3b closed → fable→opus (`4b8f75a`). All other
> recommendations adopted as-is.

## Context

This batch sits on top of a LIVE, green engine (P1–P9; 409 `node --test` + 42 bats on
`feat/p9-hardening-batch`). It is NOT a feature phase — it is closure: every item is a gap the
P9 dogfood *surfaced* (a dead fable spawn, a red worktree, a phantom test, a dormant seam),
recorded verbatim in `BACKLOG.md` under two sections. The SoT for scope is those two sections;
this design reads each item's BACKLOG text as binding and pins every code anchor it names.

The house style this design follows (`docs/DESIGN-P9-agent-swap.md`, ADRs 037–040):

- **Surface-gate discipline.** The 7-export engine barrel (`engine/src/index.js`:
  `parsePipeline, validatePipeline, ALIAS_MAP, resolveAlias, resolvePipeline, assembleContract,
  normalizeFindings, validateManifest`) is FROZEN; any new export is itself a load-bearing
  decision candidate. SC1 (no-manifest resolution) stays byte-identical. All scenario goldens
  (S1..S9, SC1/SC3, S-lean/full/reorder, S-harness-*, contract-equivalence) stay green at every
  commit. CI = `bash scripts/ci.sh`.
- **Injected-predicate seam.** `resolvePipeline(defaults, manifest, opts)` already reads
  `opts.roleExists` (added P9, ADR-037), mirroring `validateManifest`'s `opts.fileExists`. The
  core stays I/O-free; the caller supplies the probe.
- **Data is the SoT.** `pipeline/default.yml` is authoritative; the walk reads data with strong
  fallbacks (P8 review.harness precedent, ADR-031).
- **Config + a dedicated script over weakening a test.** Slow/optional tooling gets its own
  on-demand entrypoint; the always-on gate (`ci.sh`) stays fast.

### What the code actually shows today (pinned, not assumed)

Each item's BACKLOG anchor was verified against source before designing:

| # | Item | Anchor (file:line) — VERIFIED | Surprise vs. the BACKLOG note |
|---|---|---|---|
| 1 | `roleExists` live probe | `engine/bin/pipeline-resolve.js:81` calls `resolvePipeline(defaults, effectiveManifest)` (2-arg). The guard is ALREADY wired in `engine/src/resolve.js:216–221` (`effective.filter(d => d.role && !roleExists(d.role))`) and `:154` reads `opts?.roleExists` defaulting `() => true`. | Confirmed dormant: the guard exists; only the bin's 2-arg call leaves it permissive. The walk (`run/SKILL.md:186`) ALREADY routes role-not-found through the existing `ok:false` row. |
| 2 | Mutation adequacy | `engine/package.json` deps = `js-yaml` only, `"test":"node --test"`. No `stryker.conf` anywhere. `validation.harness` in `default.yml:114–116` names `tool: stryker`. | Stryker 9.x requires **Node ≥20**; engine declares `"node": ">=18"`. 8.7.1 supports `>=18`. Pinned below. |
| 3 | models.fallback | `default.yml` is a YAML **sequence** (`- id: workspace …`); `descriptor.js:108` throws unless `Array.isArray(raw)`. There is **no place** for a top-level `models:` key. The resolver ALREADY reads `manifest.models?.fallback` (`resolve.js:132–138`) and emits a record line; S8 fixture (`models: {fallback: haiku}`) + S8 test pin it. The walk (`run/SKILL.md:239–246`) reads `models.<agent>` → agent-pin → `models.fallback` → session model. Agents pin (CURRENT, post-`4b8f75a`): designer/planner/reviewer=`opus` (fable retired by the user), rest=`sonnet`/`haiku`. | The *manifest* fallback path is fully built+tested. What remains is a **default** fallback (no-manifest runs have none). The fable re-evaluation (DC-3b) is now USER-CLOSED → `opus`. A top-level `models:` key in `default.yml` is structurally impossible without restructuring `parsePipeline`'s array contract (frozen). |
| 4 | Nested-lockfile probe | `scripts/worktree-setup.sh:11` `cd "$WT"`, `:14` probes `[ -f package-lock.json ]` at root only. craft's lockfile would be `engine/package-lock.json`. `test/worktree.bats` exercises only the no-lockfile path (`:27`). | No bats test creates a nested lockfile yet — the net must be extended. |
| 5 | `node --test` discovery | `engine/package.json:9` + `scripts/ci.sh:10` both `(cd engine && node --test)` (bare). All 18 files under `engine/test/` end `.test.js`; helpers live OUTSIDE in `engine/test-helpers/`. No count-assert gate exists. | Empirically pinned (Node v22.22.3): bare `node --test` auto-runs every `.js`; `node --test 'test/**/*.test.js'` excludes non-`.test.js`; `node --test test/` treats the dir as a file and **fails** (1 test, 1 fail) — the "405 vs 1" footgun. |
| 6 | decisions cross-candidate prompt | `skills/decisions/SKILL.md:14–26` — the Procedure has no step prompting an interaction check before authoring ADRs. The P9 DC-D voided DC-A's rationale (caught manually). | Pure-prose insertion; no engine touch. |
| 7 | step 0a brief echo | `skills/run/SKILL.md:15` (`Input: $ARGUMENTS`), `:19` ("Parse craft flags from `$ARGUMENTS`"), `:23` ("a flags-only `$ARGUMENTS`") — the rendered brief inlines `$ARGUMENTS` 3×. | Pure prose; behaviour identical. |
| 8 | review cadence | `skills/review/SKILL.md:21,34–35` = a single `review` phase over the whole change (per-dimension convergence). The per-part "4-dimension review after every code part" working style lives only in `BACKLOG.md:289–293` (Notes/Working style) and `:278–281` (the item). Cross-link target: `BACKLOG.md:228` "later walk/parallelism pass" (Parked from P8). | A process/doc decision; nothing in the skills states the canonical cadence. |
| 9 | contract-assemble parses WHOLE manifest as YAML | `engine/bin/contract-assemble.js:95` does `load(readFileSync(args.manifestPath, 'utf8')) ?? {}` on the entire `.claude/workflow.md` (frontmatter **+** markdown body). The shared `engine/src/frontmatter.js#parseManifestContent` (extracts ONLY the fence) is imported by the *other two* bins — `pipeline-resolve.js:6,70` and (`extractFrontmatter`) `manifest-lint.js:6,68` — but NOT by this one (the oldest bin). | **Empirically pinned (mktemp, Node v22.22.3):** raw `load()` on a fenced manifest whose body holds a `---` thematic break throws `expected a single document in the stream, but found more` (sibling of the BACKLOG-quoted "…or a document separator is expected"; both from js-yaml's multi-document path). `parseManifestContent` on the same file returns the frontmatter object clean. ⇒ `--manifest` is **dead** on every real fenced manifest → global **and** per-phase `context:` injection is dead whenever a manifest exists. The P9 run dodged it: the craft repo has no manifest, so the orchestrator called `contract-assemble` WITHOUT `--manifest`. **Why it survived the suite:** the fixture `test/fixtures/manifests/with-body.md` (fenced, real markdown body) EXISTS but `contract-assemble.test.js` only exercises `--manifest` on the flag-without-value error path (`:129`) — it never assembles a contract from a fenced manifest, so the happy-path throw was never asserted. (Pinned: that very fixture throws `can not read a block mapping entry…(13:9)` under today's raw load.) |
| 10 | ~~assembleContract aliasing~~ **(DROPPED — ADR-045; evidence retained)** | `engine/src/contract.js:108` looks up `manifest?.phases?.[descriptor.id]?.context` by the **canonical** `descriptor.id` with NO `resolveAlias`. But `resolve.js:30` (`aliasResolve`, the `Object.fromEntries(Object.entries(manifest.phases).map(([k,v]) => [resolveAlias(k), v]))` idiom) AND `manifest.js:284` (`!PHASE_NAMES.has(resolveAlias(phaseName))`) BOTH alias forge-era keys. `resolveAlias` lives in `engine/src/alias-map.js:29` (already barrel-exported alongside `ALIAS_MAP`). | **Empirically pinned (engine cwd):** a manifest keyed `phases.plan` (forge-era alias of `planning`) binds per-phase `context:` → `false` today; aliasing the manifest's phases keys before lookup → `true`; a **canonical** `phases.planning` key → STILL `true` after the fix (`resolveAlias` returns canonical keys unchanged → existing canonical-key callers unperturbed). #9 hides #10: you can't reach the lookup until parsing works. |
| 11 | "no test-only parts" heuristic vs a legit test-only entry | `agents/planner.md:18` ("Sizing: **no standalone test-only parts** (fold tests into the part whose code they exercise)…") + `templates/plan.md:11–14` ("No standalone test-only parts: coverage/interop/property tests fold into the implementation part…"). | Sound default for FEATURE code, but a **test-infra/docs-only** change (this batch's own Stryker config + ADV tests, or pure test-helper work) is legitimately test-only with no `src/`. In the separate run the orchestrator had to explicitly OVERRIDE the heuristic — friction the heuristic should absorb itself. |

### Empirically pinned external matrix (Stryker — item 2)

State-mutating probes ran in `mktemp` throwaways (never the worktree). `npm view` + a glob
behaviour probe under Node v22.22.3:

| Pin | Value | Source |
|---|---|---|
| Engine Node floor (declared) | `"node": ">=18"` | `engine/package.json:5–7` |
| Stryker `core` latest | `9.6.1` — **engines `node >=20`** | `npm view @stryker-mutator/core` |
| Stryker `core` Node-18-compatible | `8.7.1` — **engines `node >=18.0.0`** | `npm view @stryker-mutator/core@8.7.1 engines` |
| Runner for `node --test` (emits TAP) | `@stryker-mutator/tap-runner@8.7.1` — engines `node >=14.18.0` | `npm view @stryker-mutator/tap-runner@8.7.1` |
| Framework-agnostic fallback runner | command-runner is **bundled in core** (no standalone pkg — 404) | `npm view @stryker-mutator/command-runner` → 404 |

> The version choice (8.7.1 vs 9.6.1) is itself a decision candidate (DC-2a) because 9.x forces
> bumping the declared Node floor to `>=20`; the runner choice (tap-runner vs command-runner) is
> DC-2b.

### Glob behaviour matrix (item 5, pinned under Node v22.22.3, throwaway dir)

| Command | Tests discovered | Note |
|---|---|---|
| `node --test` (bare, cwd=engine) | every `.js` under `test/` incl. non-`.test.js` helpers | the phantom-test footgun (409→410 in P9) |
| `node --test 'test/**/*.test.js'` | only `.test.js` files (recursive) | **the fix** — excludes helpers structurally |
| `node --test test/` | **1 test, 1 FAIL** | dir-arg treated as a single file → broken; the "405 vs 1" footgun |

### Contract-assembly matrix (items 9 + 10, pinned in mktemp throwaways, Node v22.22.3)

State-mutating probes ran in `mktemp` dirs (never the worktree). Item 9's raw-load probe ran with
the engine as cwd (so its `js-yaml` dep resolves) but read the throwaway file by absolute path.

| Probe | Input | Result | Item |
|---|---|---|---|
| `load(readFileSync(manifest))` (today's `contract-assemble.js:95`) | synthetic fenced manifest, `---` thematic break in body | **THROWS** `expected a single document in the stream, but found more` | 9 |
| `load(readFileSync(manifest))` (today's `contract-assemble.js:95`) | the EXISTING fixture `test/fixtures/manifests/with-body.md` (fenced, markdown body, no `---` break) | **THROWS** `can not read a block mapping entry; a multiline key may not be an implicit key (13:9)` | 9 |
| `parseManifestContent(readFileSync(manifest))` (the shared helper) | both fenced manifests above | clean (`{pipeline:{profile:lean}}` / `{context, phases:…}`) — body never reaches the parser | 9 |
| `assembleContract(planningDescriptor, {phases:{plan:{context}}}, …)` | forge-era alias key `plan` | per-phase `context` binds → **`false`** | 10 |
| same, after aliasing manifest phases keys via `resolveAlias` | forge-era alias key `plan` | binds → **`true`** | 10 |
| same fix, canonical key `planning` | canonical key | STILL binds → **`true`** (no perturbation) | 10 |

> The other two bins already prove the `parseManifestContent`/`extractFrontmatter` idiom in
> production (`pipeline-resolve.js:70`, `manifest-lint.js:68`); item 9 is adoption, not invention.

## Requirements

What must be true when this batch ships (verifiable, not aspirational). Grouped by item.

| # | Requirement | Item |
|---|---|---|
| R1 | `node engine/bin/pipeline-resolve.js pipeline/default.yml <manifest-with-typod-role>` returns `ok:false` naming the phase + ref; a manifest with a real craft-native `role:` (`craft:<role>` with `agents/<role>.md` present) still resolves `ok:true`. External `my:`/`acme:` refs STAY PERMISSIVE (P14 territory). | 1 |
| R2 | SC1 (no-manifest) stays byte-identical: the bin wiring a real probe must NOT change a no-manifest run (no swapped role ⇒ probe never consulted). | 1 |
| R3 | `engine/` has a mutation config a `validation` phase can invoke; running it kills/surfaces real survivors. ADV-1 (roleExists filter true-branch through a rejecting probe yields exactly one error), ADV-2 (producer-content mutant), ADV-3 (empty-string-`procedure` boundary) are closed by added tests. | 2 |
| R4 | The full mutation run is NOT in always-on `ci.sh` (it is slow); it has a dedicated entrypoint the validation phase invokes on demand. | 2 |
| R5 | A no-manifest craft run has a declared model fallback (no dead-spawn-then-session-model on a degraded tier). The fable-pin re-evaluation is USER-CLOSED: designer/planner/reviewer pin `opus` (commit `4b8f75a`); the standing requirement is the DEFAULT-fallback home (DC-3a), defense-in-depth for any future model-down (incl. opus overload). | 3 |
| R6 | `pipeline/default.yml` SC1 record[] + descriptors[] stay byte-identical (the models.fallback mechanism must NOT mutate the descriptor sequence or SC1). | 3 |
| R7 | `worktree-setup.sh` installs deps when the lockfile lives one level deep (`engine/package-lock.json`), shellcheck-clean; a bats test guards the nested-lockfile path. | 4 |
| R8 | `ci.sh` + `engine/package.json` discover exactly the intended `.test.js` set (no phantom non-test `.js`); a count drift or a non-test `.js` cannot silently pass. | 5 |
| R9 | The `decisions` skill prompts the session to check ratified choices for cross-candidate interaction BEFORE authoring ADRs. | 6 |
| R10 | `run/SKILL.md` step 0a references the input once; behaviour identical. | 7 |
| R11 | The canonical review cadence (per-part vs single phase) is decided and documented in a single named home, cross-linked to the Parked-from-P8 walk/parallelism pass. | 8 |
| R12 | Surface gate held: 7-export surface unchanged; SC1 byte-identical; all scenario goldens + 42 bats green at every commit; new tooling deps added with a lockfile; never `--no-verify`. | all |
| R13 | `contract-assemble.js --manifest <fenced .claude/workflow.md>` parses the frontmatter ONLY (markdown body, incl. a `---` thematic break, never reaches the YAML parser) and injects global + per-phase `context:`; a fence-less fixture still parses whole; a no-`--manifest` call is byte-identical to today. | 9 |
| ~~R14~~ | **DROPPED (ADR-045)** — no `assembleContract` forge-era aliasing; the assembler stays canonical-only. Item 9's parse fix is unaffected. | 10 |
| R15 | The planner heuristic RECOGNIZES test-infra/docs-only changes as a legitimate exemption from the no-standalone-test-only rule (no orchestrator override needed); FEATURE-code test-only parts stay forbidden. | 11 |

## Design

### Item 1 — `roleExists` live install-probe (wire the dormant seam)

The guard already exists and is tested (`resolve.js:216–221`; S2-bad-role negative). The ONLY
gap is that `pipeline-resolve.js:81` calls 2-arg. The design: the bin constructs a real
`roleExists` predicate and passes it as the 3rd `opts` arg.

**The predicate's contract (the disambiguator).** A `role` ref resolves IFF:
- it is a **craft-native** ref (`craft:<role>`) AND `agents/<role>.md` exists in the plugin root
  (the 8 agents: backlog-ticker, designer, docs-writer, planner, refactor-executor, reviewer,
  part-implementer, validation-triager); OR
- it is an **external** ref (any non-`craft:` namespace, e.g. `my:`/`acme:`) — STAYS PERMISSIVE
  ("installed" is P14 registration territory; ADR-037 punts it to the caller). The probe returns
  `true` for external refs.

So the predicate is: `ref => !ref.startsWith('craft:') || existsSync(join(REPO_ROOT, 'agents', ref.slice(6) + '.md'))` (`'craft:'.length === 6`, verified). A typo'd craft-native ref
(`craft:plannr`) fails closed; an external ref passes; a real craft-native ref passes. This reads
the filesystem — which is why it lives in the **bin** (I/O boundary), never in the pure core
(ADR-037).

**Where `agents/` lives.** `agents/` is at the **plugin root** (`<root>/agents/`), TWO levels up
from `engine/bin/`. The established idiom is `engine/bin/contract-assemble.js:10–11`:
`const __dir = dirname(fileURLToPath(import.meta.url)); const REPO_ROOT = join(__dir, '..', '..');`
then `join(REPO_ROOT, 'agents')`. The bin derives the root from its own location — no new flag
(DC-1b weighs explicit-flag vs derive). The walk's `${CLAUDE_PLUGIN_ROOT}` is the same root, but
the bin already self-locates (as `contract-assemble.js` does for `contracts/`).

**Walk touch?** The walk ALREADY routes role-not-found through the existing `ok:false` row
(`run/SKILL.md:186`, P9/s4). Wiring the bin alone makes the dormant guard live end-to-end — no
walk edit is load-bearing. (DC-1c surfaces whether a one-line prose note "the probe is now live"
is worth it.)

**SC1 (R2):** a no-manifest run carries no swapped role; every default `role` is `craft:<role>`
with `agents/<role>.md` present → the probe returns `true` for all → guard finds nothing → `ok`
unchanged, record byte-identical. The probe is consulted but never rejects on the default path.

### Item 2 — Validation mutation-adequacy (stand up Stryker for `engine/`)

Today `validation` no-ops (no stryker config). The design adds a Node-18-compatible Stryker setup
scoped to `engine/`, driven by `node --test` via the TAP runner, plus the three ADV-closing tests.

**Pinned deps (empirical, above):** `@stryker-mutator/core@8.7.1` + `@stryker-mutator/tap-runner@8.7.1`
(both Node `>=18`, matching the declared floor — DC-2a/DC-2b decide the version + runner). Added to
`engine/package.json` devDependencies + an `engine/package-lock.json` (which item 4's nested-probe
then also exercises — the two items dovetail).

**Config shape:** `engine/stryker.conf.json` — `testRunner: "tap"`, `tap.testFiles: ["test/**/*.test.js"]`
(reusing item 5's glob), `mutate: ["src/**/*.js"]`, `concurrency` modest. No source change.

**Where the run lives (DC-2c — slow-run placement):** mutation is SLOW; it does NOT belong in the
always-on `ci.sh`. The design adds a dedicated on-demand entrypoint (`engine/package.json` script
`"mutation": "stryker run"`, invoked as the `validation` phase's `tool` per `default.yml:114–116`).
`ci.sh` stays the fast substrate gate.

**ADV closures (R3) — three new tests, pure-Node:**
- **ADV-1:** assert that a *resolvable* role through a *rejecting* probe yields **exactly one**
  error (pin the filter's true-branch count, not just `ok:false`). Construction: a manifest with
  two role-bearing phases, one good ref + one bad, probe rejects only the bad → `errors.length===1`
  naming the bad phase. (Closes the roleExists filter true-branch mutant.)
- **ADV-2:** a producer-content mutant — strengthen the existing producer-bundle assertion so a
  mutated producer fragment is caught (assert a producer-specific marker, not just non-empty).
- **ADV-3:** empty-string-`procedure` boundary — the current shape check at `manifest.js:267`
  (`field === 'procedure' && typeof value !== 'string'`) ACCEPTS `""` (verified: `typeof '' === 'string'`),
  so `phases.<id>.procedure: ""` lint-passes today. DC-2d decides whether to add a NEW emptiness
  guard (reject `value.trim() === ''`) or accept and let the walk STOP at dispatch. The ADV-3 test
  pins the chosen boundary either way.

### Item 3 — models.fallback default + fable re-evaluation

The *manifest* fallback path is built+tested (S8). Two gaps remain, and the mechanism question has
a hard constraint:

**Hard constraint:** `default.yml` is a YAML **sequence**; `parsePipeline` (`descriptor.js:108`)
throws on a non-array. A top-level `models:` key is therefore impossible without restructuring the
descriptor file into a mapping `{phases: [...], models: {...}}` and changing the parser's array
contract — a frozen surface, and SC1-breaking. So "add `models:` to `default.yml`" as the BACKLOG
phrasing suggests is NOT viable as written. The three real homes for a *default* fallback:

- **(A) Walk-prose constant** — `run/SKILL.md:243` already says "else the session's own model".
  Replace "session model" with an explicit named default model as the engine's declared fallback
  (e.g. `sonnet`, guaranteed-available), keeping `models.fallback` (manifest) as the override.
  Zero engine/data change; SC1 untouched.
- **(B) A sibling `pipeline/models.yml`** (or a `models:` block the bin reads separately and folds
  into the manifest before `resolvePipeline`) — keeps data as SoT but adds a new data file + a bin
  read path + a resolver/record interaction (risk to SC1 record[]).
- **(C) Manifest-only** — declare nothing as a craft default; document that a repo SHOULD set
  `models.fallback`. Leaves a no-manifest run with only the session-model fallback (the status quo
  pain).

DC-3a decides the home. **Fable re-evaluation (DC-3b) is now USER-DECIDED/CLOSED** — resolved to
**replace fable→opus**, not "keep fable + fallback". The user retired the fable pins on
designer/planner/reviewer directly in the live plugin (`agents/designer.md:4`,
`agents/planner.md:4`, `agents/reviewer.md:4` now read `model: opus`; commit `4b8f75a`
"chore(agents): retire unavailable fable pin for opus", on `feat/p9-hardening-batch`). So the
dead-fable-spawn pain is removed at the source: there is no intermittent-Fable pin left to die.

DC-3a (the **default** `models.fallback` home) STAYS OPEN as defense-in-depth: a named default
fallback still matters for ANY future model-down — including an opus overload — so a no-manifest
run never dead-spawns-then-falls-to-the-session-model on a degraded tier. The fallback default is
independent of the now-closed pin question; it is worth declaring regardless of which model the
agents pin. LIVE EVIDENCE (the original trigger): this run's then-fable-pinned designer spawn died
(Fable unavailable) and, with no declared default fallback, paid one dead spawn before falling to
the session model — exactly R5's pain. Retiring the fable pins fixed the *pin* half; the *default
fallback* half (DC-3a) remains the standing mitigation for the next model-down.

**SC1 (R6):** options (A) and (C) touch no data → SC1 byte-identical trivially. Option (B) MUST
prove the new read path adds no record line on a no-manifest run (the resolver's
`buildManifestRecords` only emits when `manifest.models?.fallback` is a non-empty string; a default
folded as `defaults.models` is NOT read there — so (B) would need the fold to land in the *manifest*
position, which WOULD add an SC1 record line ⇒ SC1-breaking unless suppressed). This asymmetry is
why (A) is the recommendation.

### Item 4 — worktree-setup.sh nested-lockfile probe

`worktree-setup.sh:14` probes `[ -f package-lock.json ]` at the worktree root only. The design:
probe one level deep as a fallback, OR take a configurable deps path. Two shapes (DC-4):

- **(a) Fixed one-level-deep fallback:** after the root probe misses, scan immediate subdirs for a
  recognized lockfile and `cd` into the first match before installing. Zero-config; covers
  `engine/package-lock.json` automatically. Bounded (one level, not a full walk — KISS).
- **(b) Configurable deps path:** a 3rd positional arg / env (`CRAFT_DEPS_DIR`) the caller sets;
  explicit, no scan. Needs the walk/manifest to supply it.

Either stays shellcheck-clean (the existing `set -euo pipefail` + the part-2 bats net in `test/`
guards it). **R7 net:** extend `test/worktree.bats` with a nested-lockfile fixture
(`mk_worktree` + `mkdir engine && touch engine/package-lock.json`, assert the install path reports
the nested dir). The existing no-lockfile test (`:27`) stays green.

### Item 5 — node --test discovery footguns

Pinned behaviour (above): bare `node --test` auto-runs non-test `.js` (the phantom); the glob
`'test/**/*.test.js'` excludes them; `node --test test/` is broken on this Node. The design:

- Replace the bare `node --test` in `scripts/ci.sh:10` AND `engine/package.json:9`
  (`"test"` script) with the explicit glob `node --test 'test/**/*.test.js'` (quoted so the shell
  passes the literal pattern to Node, which globs it natively — confirmed Node v22). This
  structurally excludes any future non-test `.js` under `test/` (DC-5a: glob vs a count-assert
  gate vs both).
- **Count-assert gate (RATIFIED — ADR-046, DC-5b=(b)).** In ADDITION to the glob, a gate asserts the
  discovered test count equals an expected pinned number, catching silent count *drift* (not just a
  phantom file). **Mechanism (pre-chewed for the plan):** after `node --test 'test/**/*.test.js'`,
  parse the runner's `# tests <N>` summary line and compare to an expected count held as a single
  constant (e.g. an `EXPECTED_TESTS` var in `scripts/ci.sh`). Every part that adds/removes tests
  bumps that number IN THE SAME COMMIT, so CI stays green at every commit; the expected count lands
  at its FINAL post-batch value as the last test-changing part settles.

The glob closes the phantom-file footgun (the P9 409→410 drift root cause); the count-assert adds
drift detection at the per-part maintenance cost the user accepted (ADR-046).

### Item 6 — decisions cross-candidate interaction prompt

`skills/decisions/SKILL.md:14–26` Procedure walks candidates independently. The design inserts ONE
step (pure prose, no engine touch) before ADR authoring: after all candidates are ratified and
BEFORE writing ADRs (current step 2's commit), prompt the session to check whether any ratified
choice's rationale is voided/altered by another ratified choice (the P9 DC-D-voids-DC-A pattern); if
so, re-surface the affected candidate to the user before authoring. DC-6 decides placement (a new
step 2.5 between ratify and author, vs. folding into the existing scope-fold rule at step 3).

### Item 7 — run/SKILL.md step 0a brief echo

`run/SKILL.md` inlines `$ARGUMENTS` at `:15`, `:19`, `:23`. The design: step 0a references the input
once (e.g. "Parse craft flags from the input" rather than re-printing `$ARGUMENTS`; the `Input:`
line at `:15` stays as the single canonical echo). Pure prose; behaviour identical; no DC (a
mechanical trim — but listed as DC-7 only to confirm WHICH of the three references is the canonical
keeper, since that is a one-line judgment).

### Item 8 — review cadence (canonical decision + home)

The skills describe a single `review` phase (`review/SKILL.md:21,34–35`); the per-part
"4-dimension review after every code part" working style lives only in `BACKLOG.md`. The design
DECIDES the canonical cadence and DOCUMENTS it in one named home, cross-linked to the
Parked-from-P8 walk/parallelism pass (`BACKLOG.md:228`). Three homes/shapes (DC-8):

- **(a) Single phase is canonical; per-part is a working-style note** — document in `run/SKILL.md`
  that the engine cadence is the single `review` phase; the per-part interleave is a session
  discipline, not an engine invariant (cross-link the P8 parallelism pass for a future knob).
- **(b) Model per-part as a harness/run knob** — a `run`/harness knob (`review.cadence:
  per-part|phase`) the walk honors; bigger surface (engine + data + walk), defers to the
  parallelism pass.
- **(c) BACKLOG-note only** — record the decision in BACKLOG, no skill change.

This is a process/doc decision (no code behaviour change in the recommended (a)); DC-8 carries it.

### Item 9 — contract-assemble.js parses the WHOLE manifest as YAML (real engine bug)

`contract-assemble.js:95` does `load(readFileSync(args.manifestPath, 'utf8')) ?? {}` on the entire
`.claude/workflow.md` — frontmatter AND markdown body. The body is not valid YAML, so js-yaml
throws; the EXACT message depends on the body (a `---` thematic break → `expected a single document
in the stream, but found more`; a markdown/code-fence body like the `with-body.md` fixture →
`can not read a block mapping entry; a multiline key may not be an implicit key`). Either way the
throw is universal across real fenced manifests. The other two bins never do this — they go through
the shared `engine/src/frontmatter.js` helper:
`pipeline-resolve.js:70` calls `parseManifestContent(readFileSync(manifestPath, 'utf8'))`;
`manifest-lint.js:68` calls `extractFrontmatter(content)`. `contract-assemble.js` (the oldest bin)
simply never adopted it.

**The fix (mirror `pipeline-resolve.js` EXACTLY).** Replace the bin's raw `load`:

- `import { parseManifestContent } from '../src/frontmatter.js';` (drop the now-unused
  `import { load } from 'js-yaml';` — verify no other `load` use remains in the bin; today line 5
  is the only `js-yaml` import and line 95 the only call).
- At `:95`, `manifest = parseManifestContent(readFileSync(args.manifestPath, 'utf8')) ?? {};`
  — the `?? {}` survives because `parseManifestContent` returns `null` for an empty/absent block
  (its signature is `(content: string) => object | null`, confirmed `frontmatter.js:50`), and the
  bin's downstream `assembleContract(descriptor, manifest, …)` wants an object. This is byte-for-byte
  the `pipeline-resolve.js:70` idiom (which also coerces `manifest ?? {}` at its overlay call).

No new export, no signature change, no `src` change. The `catch` block's error message
(`contract-assemble: failed to parse manifest: …`) stays — it now only fires on a genuinely malformed
frontmatter block, not on every well-formed fenced manifest.

**No-`--manifest` path (the P9-dodge) is untouched:** the `if (args.manifestPath)` guard at `:93`
already short-circuits; `manifest = {}` stays the default. SC1-class no-manifest behaviour identical.

### Item 10 — DROPPED (ADR-045: no forge-era migration support)

**Item 10 is dropped.** craft is single-tenant and already migrated; it behaves as if it always
existed, so `assembleContract` stays canonical-only — no per-phase `resolveAlias` normalization and
no migration warn-lint. The pre-existing P4 vocabulary aliasing in `resolve.js`/`manifest.js` (the
frozen `ALIAS_MAP`/`resolveAlias` exports) is left untouched. Item 9 (the namespace-agnostic
contract-assemble parse bug) still ships. The original analysis is retained below as the evidence
behind the decision — **none of it is implemented.**

<details><summary>Original item-10 analysis (NOT implemented — see ADR-045)</summary>

#### ~~Item 10 (original)~~ — assembleContract doesn't resolveAlias per-phase keys (latent behind #9)

`contract.js:108` looks up `manifest?.phases?.[descriptor.id]?.context` by the canonical
`descriptor.id`, with NO `resolveAlias`. A consuming manifest using forge-era keys
(`plan`/`implement`/`mutation`/`merge`) therefore silently fails to bind its per-phase `context:`
(pinned `false`), even after #9 makes the manifest parse. #9 hides #10: the lookup is unreachable
until parsing works.

**The fix — alias the manifest's phases keys inside `assembleContract`'s BODY (signature frozen).**
Reuse the EXACT `resolve.js:30` idiom (`aliasResolve`):
`Object.fromEntries(Object.entries(manifest.phases).map(([k, v]) => [resolveAlias(k), v]))`. In
`contract.js`, add `import { resolveAlias } from './alias-map.js';` (already a barrel export — no
new surface) and normalize the phases map ONCE before the per-phase lookup, e.g.:

```
const phaseMap = manifest?.phases
  ? Object.fromEntries(
      Object.entries(manifest.phases).map(([k, v]) => [resolveAlias(k), v]),
    )
  : undefined;
const phaseCtx = extractContext(phaseMap?.[descriptor.id]?.context);
```

(replacing ONLY the lookup expression at `:108`; the `if (phaseCtx) sections.push(phaseCtx)` guard
at `:109` is untouched, as is the global `context` lookup/push at `:105–106` — it has no phase key).

**Placement — body of the export, NOT the bin (DC-10).** Normalizing inside `assembleContract`
fixes ALL callers uniformly (the bin today; any future caller) and is the only spot that keeps the
fix from regressing if a second caller appears. The alternative (alias in `contract-assemble.js`
before the call) leaves the export itself canonical-only. `assembleContract` has exactly one
production caller (`contract-assemble.js:112`) plus tests, so a body change is safe and minimal.

**Export-stability (R14) + no-perturbation of contract-equivalence/S2/S9.** The exported signature
`(descriptor, manifest, fragments, opts)` is untouched. Every existing `assembleContract` test
(contract.test.js per-phase uses `phases.design`/`phases.planning`; S2 uses `phases.planning`;
contract-equivalence iterates canonical descriptor ids; S9 uses an empty/retrieval-only manifest)
keys on CANONICAL ids — and `resolveAlias` returns canonical ids unchanged (`alias-map.js:32`), so
the normalized map is identical to the un-normalized one for those inputs. Pinned `true`/`true` above.

**This also closes the user's separate "forge→craft migration incomplete in consuming repos"
friction:** aliasing is now consistent across the THREE manifest consumers (resolve, lint, contract)
— a consuming repo on forge-era keys binds everywhere, not just in resolve/lint. DC-10 surfaces
whether to ALSO add a migration WARN-lint (`manifest-lint` warns on forge-era phase keys) or rely on
silent consistent aliasing alone.

</details>

### Item 11 — planner heuristic vs a legitimately test-only entry

`agents/planner.md:18` + `templates/plan.md:11–14` forbid standalone test-only parts — a sound
default for FEATURE code (a test with no production code is usually a missing part). But a
**test-infra/docs-only** change (this batch's own Stryker config + ADV tests; pure test-helper work;
a docs-only refresh) is legitimately test-only with no `src/` touch, and in the separate run the
orchestrator had to explicitly OVERRIDE the heuristic. The refinement: let the heuristic RECOGNIZE
test-infra/docs-only changes so no override is needed. Three shapes (DC-11):

- **(a) Prose carve-out** in `agents/planner.md:18` + `templates/plan.md:11–14`: the rule keeps
  "no standalone test-only parts for FEATURE code" and adds "test-infra-only and docs-only parts
  (tooling config, test helpers, fixtures, ADV/property suites with no `src/` delta) ARE exempt —
  they have no implementation part to fold into." Pure prose; no schema/lint change; mirrors how
  the other planner sizing rules live as prose.
- **(b) Structured part-kind/archetype flag** the plan template carries (e.g. `### Kind:
  feature|test-infra|docs` per part; `plan-lint.sh` exempts non-`feature` kinds from the
  no-test-only check). Adds template schema + a lint branch — bigger surface.
- **(c) Leave as-is** — orchestrator overrides per run (the status quo friction).

Pure prose/doc for (a); independent of items 1–10 (it touches `agents/planner.md` + `templates/`,
no engine). The plan template's own `## Sizing rules` is the natural home for the carve-out.

### Dependency order (which items land before others)

- **Item 1 before Item 2's ADV-1.** ADV-1 asserts the roleExists *filter true-branch* (exactly-one-
  error through a rejecting probe). That assertion is engine-test only (it does not need the bin
  probe), so it can land independently — BUT the mutation run (item 2) that *measures* whether ADV-1
  killed its mutant must run after the Stryker config exists. So: item 1 (bin wiring) and ADV-1 (test)
  are independent of each other; both must precede the *mutation run* that validates them. Land
  item 2's config + ADV tests, then run mutation to confirm ADV-1/2/3 kill.
- **Item 2 deps (Stryker) interact with Item 4.** Adding `@stryker-mutator/*` to
  `engine/package.json` creates `engine/package-lock.json` — the very nested lockfile item 4's probe
  must handle. Land item 4's probe + bats net BEFORE or WITH item 2's deps, so the worktree-setup
  path is green for the new lockfile (otherwise a fresh worktree comes up red exactly as the P9
  dogfood did).
- **Item 3's mechanism (DC-3a) is the only open half** — DC-3b (the fable re-eval) is USER-CLOSED
  (`opus`, `4b8f75a`), so the pair no longer needs joint ratification. DC-3a stands alone as the
  default-fallback home; its decision no longer depends on a pin question.
- **Items 5, 6, 7, 8 are independent** of each other and of 1–4 (5 is CI/script; 6/7 are pure prose
  in different skills; 8 is a doc decision). Item 5's glob is REUSED by item 2's `stryker.conf`
  (`tap.testFiles`) — so item 5's glob shape should be settled before item 2's config references it.
- **No item mutates `pipeline/default.yml` descriptors or SC1.** Item 3 is the only one tempted to;
  the design forbids it (the models.fallback default goes to walk-prose/sidecar, never the descriptor
  sequence).
- **Item 9 stands alone (item 10 DROPPED — ADR-045).** s-asm-parse touches only
  `contract-assemble.js`'s body (adopt `parseManifestContent`), changes no exported signature, and is
  independent of items 1–8 and 11. It is test-pinned by a fenced-manifest bin test. The former
  item-10 alias part is dropped; nothing now depends on it.
- **Item 11 is independent prose** (`agents/planner.md` + `templates/plan.md`) of every other item;
  it gates nothing and nothing gates it. Land any time.

## Decision candidates

Grouped by item so the decisions phase walks them per item. The designer NEVER decides these; the
user ratifies in the ADR phase. Every "surface"-flagged choice from the invocation appears.

**RATIFIED — ADRs 041–047 (rows retained for reasoning; the ratified choice is the recommendation
except where noted):** DC-1a/1b/1c, DC-2a/2b/2c, DC-2d, DC-4, DC-5a, DC-6, DC-7, DC-8, DC-9, DC-11
adopted as recommended (ADR-047 consolidates the mechanicals; DC-2d=ADR-042, DC-8=ADR-043,
DC-11=ADR-044). **Two deviations:** **DC-5b → (b) glob + count-assert gate** (ADR-046); **DC-10 →
item 10 DROPPED entirely** — no `assembleContract` aliasing, no warn-lint (ADR-045: craft is
single-tenant + migrated, behaves as if it always existed). **DC-3a → (a) walk-prose default
`sonnet`** (ADR-041); **DC-3b CLOSED → fable→opus** (`4b8f75a`).

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| **DC-1a** | Whether wiring the bin's `roleExists` probe needs a walk touch, or the bin suffices | (a) Bin-only — construct the predicate in `pipeline-resolve.js`, pass as 3rd arg; the walk already routes role-not-found via `run/SKILL.md:186`. (b) Bin + a one-line walk note that the probe is now live. | **(a) Bin-only.** The walk's `ok:false` row already covers it (P9/s4); no new walk behaviour. | Minimal surface; the guard + walk row already exist — only the call-site is 2-arg. |
| **DC-1b** | How the bin finds `agents/` for the craft-native probe | (a) Derive plugin root from the bin's own location — `join(dirname(fileURLToPath(import.meta.url)), '..', '..')`, the `contract-assemble.js:10–11` idiom (two levels up to the plugin root holding `agents/`). (b) New `--agents-dir` flag the walk passes. (c) Read `CLAUDE_PLUGIN_ROOT` env. | **(a) Derive from bin location.** No new flag/env; matches the existing `REPO_ROOT` derivation in `contract-assemble.js`. | Smallest surface; no walk/flag change; one established idiom for "bin self-locates the plugin root". |
| **DC-1c** | Craft-native probe strictness for the 8 agents | (a) Filesystem existence of `agents/<role>.md` (real probe). (b) Hardcoded allow-list of the 8 agent names. | **(a) Filesystem existence.** Survives an agent add/rename without editing the bin; matches `fileExists` precedent. | A hardcoded list drifts; the FS probe is self-maintaining and mirrors ADR-037's `fileExists`. |
| **DC-2a** | Stryker version (engine Node floor) | (a) `@stryker-mutator/core@8.7.1` (Node `>=18`, matches declared floor). (b) `@stryker-mutator/core@9.6.1` (latest) + bump `engine/package.json` engines to `>=20`. | **(a) 8.7.1.** Keeps the declared `>=18` floor; no engines bump, no risk to Node-18 consumers. | The repo declares `>=18`; 9.x silently requires `>=20`. 8.7.1 is the highest Node-18-safe line. |
| **DC-2b** | Stryker test runner | (a) `@stryker-mutator/tap-runner@8.7.1` — drives `node --test` (TAP) directly. (b) command-runner (bundled) running `node --test` as an opaque command. | **(a) tap-runner.** Native `node --test` integration (per-test coverage analysis); matches the repo's `node --test` substrate. | tap-runner understands TAP/per-test results; command-runner is coarse (whole-suite per mutant). |
| **DC-2c** | Where the (slow) mutation run lives | (a) Dedicated `engine/package.json` script (`"mutation":"stryker run"`) the `validation` phase invokes on demand; NOT in `ci.sh`. (b) In always-on `ci.sh`. (c) A separate CI job/workflow. | **(a) On-demand script.** `ci.sh` stays the fast substrate gate; the validation phase invokes the script per `default.yml`'s `tool: stryker`. | Mutation is slow; the SoT (`validation.harness.tool`) already names stryker — the phase, not the substrate gate, owns it. |
| **DC-2d** | Empty-string `procedure` boundary (ADV-3) | (a) Reject empty `procedure` at lint (`value.trim() === ''` → error). (b) Accept empty string; let the walk STOP at dispatch. | **(a) Reject at lint.** Fail-fast at the boundary (house input-validation rule); an empty procedure is never meaningful. | Catches the typo at lint, not three phases later at dispatch; matches "validate at system boundaries". |
| **DC-3a** | Home for the DEFAULT models.fallback (the `default.yml` top-level `models:` key is structurally impossible — sequence, not mapping) | (a) Walk-prose named default model in `run/SKILL.md:243` (replace "session model" with an explicit guaranteed-available model); `models.fallback` (manifest) stays the override. (b) Sibling `pipeline/models.yml` the bin folds into the manifest. (c) Manifest-only — no craft default; document repos SHOULD set it. | **(a) Walk-prose named default.** Zero engine/data change → SC1 byte-identical trivially; keeps the manifest override path intact. | `parsePipeline` rejects a non-array `default.yml`; (b) risks an SC1 record line; (a) is the P8-precedent "walk reads data with a strong fallback" with no surface cost. |
| **DC-3b** ✅ CLOSED (user-decided) | Re-evaluate the fable pins on designer/planner/reviewer | — | **RESOLVED: replace fable→opus.** designer/planner/reviewer now pin `model: opus` (`agents/{designer,planner,reviewer}.md:4`, commit `4b8f75a`). NOT "keep fable + fallback". | The user retired the unavailable fable pin directly in the live plugin; no intermittent-Fable pin remains to dead-spawn. DC-3a (default fallback) STAYS OPEN as the standing model-down mitigation. |
| **DC-4** | worktree-setup.sh nested-lockfile probe shape | (a) Fixed one-level-deep fallback scan after the root miss. (b) Configurable deps path (3rd arg / `CRAFT_DEPS_DIR`). (c) Both — scan, with the env as an override. | **(a) One-level-deep fallback.** Zero-config, covers `engine/package-lock.json`, bounded to one level (KISS); no walk/manifest plumbing. | The pain is purely "lockfile in a subdir"; a bounded one-level scan fixes it with no new config surface. |
| **DC-5a** | node --test discovery fix | (a) Explicit glob `node --test 'test/**/*.test.js'` in `ci.sh` + `engine/package.json`. (b) A count-assert gate only. (c) Both glob + count-assert. | **(a) Glob.** Structurally excludes non-`.test.js` (the phantom root cause); confirmed working under Node v22. | The glob fixes the actual footgun (phantom file); a count-assert alone still runs the phantom. |
| **DC-5b** | Add a test-count-assert gate (drift detection) | (a) No — glob suffices. (b) Yes — assert the discovered count == an expected number. | **(a) No.** The glob removes the phantom; a count-assert adds per-part maintenance (update the number every part). | Drift from legitimate new tests is normal and noisy to gate; the phantom (the real bug) is already closed by the glob. |
| **DC-6** | Placement of the decisions cross-candidate interaction prompt | (a) New step 2.5 between ratify and ADR-author. (b) Fold into the existing scope-fold rule (step 3). | **(a) New step 2.5.** Interaction-check must happen BEFORE authoring (the P9 lesson); the scope-fold rule fires AFTER a deviation, too late. | The voided-rationale case (DC-D voids DC-A) must be caught before ADRs are written, not after. |
| **DC-7** | Which `$ARGUMENTS` reference is the canonical keeper in run/SKILL.md | (a) Keep the `Input:` line (`:15`); make step 0a reference "the input". (b) Keep step 0a's first mention; drop the `Input:` line. | **(a) Keep `Input:` line.** It is the documented argument-hint echo; step 0a then refers to "the input" abstractly. | The `Input:` line pairs with the frontmatter `argument-hint`; step 0a's job is flag-parsing, not echoing. |
| **DC-8** | Canonical review cadence + its documentation home | (a) Single `review` phase is canonical; per-part is a documented session working-style (home: `run/SKILL.md`, cross-link P8 parallelism pass). (b) Model per-part as a `run`/harness knob (engine + data + walk). (c) BACKLOG-note only. | **(a) Single phase canonical + working-style note.** No code behaviour change; honest about the engine cadence; defers the per-part knob to the named parallelism pass. | The engine's cadence IS the single phase; the per-part interleave is a discipline. Modeling it as a knob (b) is the parallelism pass's job, not this batch's. |
| **DC-9** | How `contract-assemble.js` parses the manifest | (a) Adopt the shared `parseManifestContent` from `frontmatter.js` (mirror `pipeline-resolve.js:70` exactly; drop the `js-yaml` `load` import). (b) Inline a one-off fence-strip in the bin (no shared helper). | **(a) Adopt `parseManifestContent`.** Single home, identical to the other two bins; the bug is precisely that this bin diverged from the shared helper. | DRY + house "single home both bins share" (frontmatter.js docstring); inlining re-introduces the divergence that caused the bug. |
| **DC-10** | Where the per-phase `resolveAlias` normalization lives + whether to add a migration warn-lint | (a) Normalize inside `assembleContract`'s body (reuse the `resolve.js:30` idiom); aliasing alone closes the binding bug. (b) (a) PLUS a `manifest-lint` WARN on forge-era phase keys (migration nicety). (c) Normalize in the bin only (`contract-assemble.js`), leaving the export canonical-only. | **⚠ OVERRIDDEN → item 10 DROPPED (ADR-045): no aliasing, no warn-lint** (craft is single-tenant + migrated). ~~Original rec: (a) normalize in the body; no warn-lint.~~ | The body normalization mirrors the established `aliasResolve` idiom and makes aliasing consistent across all three consumers; (c) leaves the export buggy for any future caller; the warn-lint (b) is scope the binding fix doesn't need. (If the user wants migration nudges, (b) is the home — but it is additive, not load-bearing.) |
| **DC-11** | How the planner heuristic models a legit test-infra/docs-only part | (a) Prose carve-out in `agents/planner.md:18` + `templates/plan.md` ("test-infra-only and docs-only parts are exempt from the no-test-only rule"). (b) A structured part-kind/archetype flag the plan template carries (`### Kind: feature\|test-infra\|docs`), `plan-lint.sh` exempts non-feature kinds. (c) Leave as-is; orchestrator overrides per run. | **(a) Prose carve-out.** Closes the friction with zero schema/lint surface; mirrors how the other sizing rules live as prose; the exemption is a judgment the planner already makes, just now written down. | The override pain is purely "the rule has no exception clause"; a prose clause fixes it. (b) adds template+lint surface for a distinction the planner can read from the part's own `### Context` (no `src/` delta); (c) keeps the friction. |

## Test strategy

What proves each item. Pure-Node where the engine is touched; bats for scripts; prose-review for
docs. All existing 409 node + 42 bats stay green at every commit.

| Item | Proof |
|---|---|
| 1 | **bin integration test** (`engine/test/pipeline-resolve.bin.test.js`): a manifest with `phases.implementation.role: craft:plannr` (typo of a real craft agent) → exit 2 + stderr names the phase+ref; a manifest with `craft:planner` (real) → exit 0; a manifest with `acme:tdd-specialist` (external) → exit 0 (permissive). SC1 (no manifest) → exit 0, record byte-identical (existing SC1 bin test covers this). |
| 2 | **3 pure-Node ADV tests** (`scenarios.test.js`/`manifest.test.js`): ADV-1 exactly-one-error count through a rejecting probe; ADV-2 producer-content marker assertion; ADV-3 empty-`procedure` boundary (lint reject per DC-2d). **Mutation run** (`stryker run` via the new script) confirms the three mutants are killed — run on demand, NOT in `ci.sh`. |
| 3 | If DC-3a=(a)/(c): no automated test (prose). If (b): a bin/resolver test that a no-manifest run carries the default fallback WITHOUT an SC1 record line (SC1 byte-identical assertion). DC-3b: CLOSED, no test (the fable→opus pin landed via `4b8f75a` — a config choice, no behaviour test). |
| 4 | **bats** (`test/worktree.bats`): nested-lockfile fixture (`mkdir engine && touch engine/package-lock.json`) → setup reports install via the nested dir; existing no-lockfile test (`:27`) stays green. shellcheck-clean (the `shellcheck scripts/*.sh` step in `ci.sh:10`). |
| 5 | **CI self-proof**: `ci.sh` + `engine/package.json` switched to the glob; the existing 409-test suite still discovers 409 (no phantom); a deliberate scratch non-`.test.js` under `test/` (throwaway, NOT committed) confirmed excluded by the glob during design. DC-5b: if chosen, a count-assert gate test. |
| 6 | **Prose review** in the docs phase (no automated test for a skill prose step — consistent with how the scope-fold rule is doc-pinned). |
| 7 | **Prose review** + a render check that `$ARGUMENTS` appears once in step 0a. No behaviour test (identical behaviour). |
| 8 | **Prose review** (a doc decision; the chosen cadence documented + cross-linked). |
| 9 | **bin integration test** (EXTEND the existing `engine/test/contract-assemble.test.js` bin harness — `spawnSync(process.execPath, [binPath, …])` at `:3,8,12`): add a happy-path test passing the EXISTING fenced fixture `test/fixtures/manifests/with-body.md` via `--manifest <path> --descriptor-id <id>` → exit 0, stdout is the assembled block (RED today: exit 2 + stderr `failed to parse manifest` — pinned, the fixture throws under raw load). Add a fenced manifest carrying `context:`/`phases.<id>.context:` → assert those lines appear in stdout (proves injection is live, not just non-throwing). A no-`--manifest` call → exit 0, byte-identical to today (regression guard, already covered by existing tests). No new fixture strictly required (reuse `with-body.md`); a context-bearing fixture may be added for the injection assertion. |
| 10 | **DROPPED (ADR-045)** — no test; item 10 is out of scope (no forge-era aliasing). |
| 11 | **Prose review** in the docs phase (a planner-heuristic doc change; no automated test — consistent with how the other planner sizing rules are prose-pinned). Render check: the carve-out clause is present in both `agents/planner.md` and `templates/plan.md`. |

### Property/round-trip lenses

No parser/matcher/round-trip pair is newly touched: the `roleExists` predicate is a boolean probe
(not a parser); the glob is a discovery flag. Item 3 option (b) would add a YAML read path (a fold),
which would warrant a fold-idempotence test — flagged in DC-3a's test column. Item 9 ADOPTS an
existing parse path (`parseManifestContent`, already round-trip-proven by `pipeline-resolve.js` +
`manifest-lint.js` tests) rather than introducing one — no new property surface. Item 10 is dropped
(ADR-045), so no new alias-normalization property surface is introduced.

## Part shape (for the plan phase)

Pre-chewed per-item context so the plan phase can size parts. Each part is one atomic TDD commit
(Red→Green→Refactor, Given/When/Then, `sut` body) unless it is pure prose. House convention
(per `docs/PLAN-P9-agent-swap.md`): each part carries exact file paths, symbol name-paths, current
signatures, and the fixtures/helpers to extend. Final part sequencing is the plan phase's job;
the dependency-order note above constrains it.

| Part candidate | Scope (one line) | Pre-chewed context |
|---|---|---|
| **s-roleexists** (item 1) | Bin constructs + passes a real `roleExists` predicate (DC-1*) | **`engine/bin/pipeline-resolve.js`:** `:81` `resolvePipeline(defaults, effectiveManifest)` → add 3rd arg `{ roleExists }`. Build `roleExists` near the top using the `contract-assemble.js:10–11` idiom: `import { existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');` then `const roleExists = ref => !ref.startsWith('craft:') || existsSync(join(REPO_ROOT, 'agents', ref.slice(6) + '.md'));` (DC-1b/1c). **Guard already in `resolve.js:216–221`** — do NOT touch it. **Test:** extend `engine/test/pipeline-resolve.bin.test.js` (the bin harness; spawns the bin via child_process). Fixtures: reuse/add manifests under `engine/test/fixtures/`. Red: typo'd `craft:plannr` resolves `ok:true` (exit 0) today; Green: exit 2 + naming stderr. SC1 bin test unchanged. |
| **s-stryker** (item 2) | Stryker config + deps + 3 ADV tests + on-demand script (DC-2*) | **`engine/package.json`:** add devDeps `@stryker-mutator/core@8.7.1` + `@stryker-mutator/tap-runner@8.7.1`; add script `"mutation":"stryker run"`; (the `"test"` script switches to the glob in s-glob). **NEW `engine/stryker.conf.json`:** `testRunner:"tap"`, `tap.testFiles:["test/**/*.test.js"]`, `mutate:["src/**/*.js"]`. **NEW `engine/package-lock.json`** (generated — never hand-edited; run `npm install` in the worktree). **Tests:** ADV-1 in `scenarios.test.js` (exactly-one-error through a rejecting probe — construct a 2-role-phase manifest, probe rejects one, assert `errors.length===1`); ADV-2 strengthen the producer assertion in `scenarios.test.js`/`contract.test.js`; ADV-3 in `manifest.test.js` (empty-`procedure` reject per DC-2d, mirroring the `role`/`model` shape tests). Surface: `engine/src` shape-checks may gain the empty-string guard (DC-2d) — that is the only `src` touch. |
| **s-worktree** (item 4) | Nested-lockfile probe + bats net (DC-4) | **`scripts/worktree-setup.sh`:** after the root probe block (`:14–26`), add a bounded one-level-deep fallback when `installed=""` (scan immediate subdirs for a recognized lockfile, `cd` into the first match, install). Keep `set -euo pipefail`; shellcheck-clean. **`test/worktree.bats`:** add a `@test` mirroring `:27` but with `mkdir "$WT/engine" && touch "$WT/engine/package-lock.json"` (use the `mk_worktree` helper at `test/helpers/worktree.bash:11–24`); assert the output reports the install. **Land WITH/BEFORE s-stryker** (the lockfile it creates is the nested one). |
| **s-glob** (item 5) | Explicit `.test.js` glob + count-assert gate (DC-5a + DC-5b) | **`scripts/ci.sh:10`:** `(cd engine && node --test)` → `(cd engine && node --test 'test/**/*.test.js')`. **`engine/package.json:9`:** `"test":"node --test"` → `"test":"node --test 'test/**/*.test.js'"`. Confirmed under Node v22 the glob discovers the same 409. **ALSO add the count-assert gate (ADR-046):** in `scripts/ci.sh`, after the glob run, parse `# tests <N>` and assert `== EXPECTED_TESTS` (a constant in `ci.sh`); bump `EXPECTED_TESTS` in every commit that changes the count. Settle the glob shape FIRST — s-stryker's `stryker.conf.json` `tap.testFiles` reuses it. |
| **s-decisions** (item 6) | Cross-candidate interaction step in decisions skill (DC-6) | **`skills/decisions/SKILL.md`:** insert a step 2.5 (between ratify-each-candidate `:21–22` and the scope-fold rule `:23–26`): "Before authoring ADRs, check whether any ratified choice's rationale is voided or altered by another ratified choice; if so, re-surface the affected candidate to the user." Pure prose; no engine touch. |
| **s-echo** (item 7) | Trim step 0a brief echo (DC-7) | **`skills/run/SKILL.md`:** `:19` "Parse craft flags from `$ARGUMENTS`" → "from the input"; `:23` "a flags-only `$ARGUMENTS`" → "a flags-only input"; keep the `Input: $ARGUMENTS` line at `:15` as the single canonical echo. Pure prose; behaviour identical. |
| **s-cadence** (item 8) | Document canonical review cadence (DC-8) | **`skills/run/SKILL.md`** (if DC-8=(a)): a note that the engine cadence is the single `review` phase; the per-part 4-dimension interleave is a session working-style, with a cross-link to the Parked-from-P8 walk/parallelism pass (`BACKLOG.md:228`). Update `BACKLOG.md:278–281` to record the decision. Pure prose/doc. |
| **s-asm-parse** (item 9) | contract-assemble adopts `parseManifestContent` (DC-9) | **`engine/bin/contract-assemble.js`:** at `:5` REMOVE `import { load } from 'js-yaml';`; ADD `import { parseManifestContent } from '../src/frontmatter.js';` (mirror `pipeline-resolve.js:6`). At `:95` `manifest = load(readFileSync(args.manifestPath, 'utf8')) ?? {};` → `manifest = parseManifestContent(readFileSync(args.manifestPath, 'utf8')) ?? {};` (mirror `pipeline-resolve.js:70`; `parseManifestContent` sig `(content) => object\|null`, `frontmatter.js:50`). The `try/catch` at `:94–99` + its `failed to parse manifest` message STAY. Confirm `load` is unused elsewhere in the bin (it is — `:5` import + `:95` call are the only uses). **Test:** EXTEND `engine/test/contract-assemble.test.js` (bin harness, `spawnSync` at `:3,8,12`). RED: `--manifest test/fixtures/manifests/with-body.md --descriptor-id <id>` → exit 2 today (raw load throws); GREEN: exit 0 + assembled block. Reuse `with-body.md`; optionally add a `context:`-bearing fenced fixture under `test/fixtures/manifests/` to assert injection lines in stdout. **No `src` change; no export change.** (The former s-asm-alias dependent is dropped — land any time after s-roleexists.) |
| ~~s-asm-alias~~ (item 10) — **DROPPED (ADR-045), DO NOT PLAN** | item 10 is out of scope (no forge-era aliasing); the original pre-chew that follows is MOOT | **`engine/src/contract.js`:** ADD `import { resolveAlias } from './alias-map.js';` (already barrel-exported — no new surface). At `:108`, replace `const phaseCtx = extractContext(manifest?.phases?.[descriptor.id]?.context);` with a normalize-then-lookup: build `const phaseMap = manifest?.phases ? Object.fromEntries(Object.entries(manifest.phases).map(([k, v]) => [resolveAlias(k), v])) : undefined;` (the EXACT `resolve.js:30` `aliasResolve` idiom) then `const phaseCtx = extractContext(phaseMap?.[descriptor.id]?.context);`. Global-context lookup at `:105–106` UNCHANGED. **Exported signature `(descriptor, manifest, fragments, opts)` UNCHANGED** — body-only. **Test:** EXTEND `engine/test/contract.test.js` mirroring the per-phase-context test at `:142–156`: manifest `{phases:{plan:{context: …}}}` on the `planning` descriptor → per-phase context appears verbatim (RED today: absent). Add a canonical-key regression assertion (`phases.planning` still binds). contract-equivalence/S2/S9 unaffected (canonical keys self-alias — pinned). DC-10=(b)? Add a `manifest-lint` WARN test only if the user picks the warn-lint. Land AFTER s-asm-parse. |
| **s-planner-heuristic** (item 11) | Planner heuristic carve-out for test-infra/docs-only (DC-11) | **`agents/planner.md:18`** (the "Sizing: no standalone test-only parts…" bullet) + **`templates/plan.md:11–14`** (the "No standalone test-only parts…" bullet under `## Sizing rules`): if DC-11=(a), add an exemption clause — "test-infra-only and docs-only parts (tooling config, test helpers, fixtures, ADV/property suites with no `src/` delta) ARE exempt; they have no implementation part to fold into." Keep the FEATURE-code rule intact. Pure prose; no engine/schema touch. If DC-11=(b): also add `### Kind:` to the template schema + a `plan-lint.sh` exemption branch (bigger surface — only if the user picks it). |

## Out of scope

| Item | Why excluded |
|---|---|
| P14 derived-plugin registration ("what counts as installed" for external `my:`/`acme:` role refs) | ADR-037 punts external-ref resolution to the caller; this batch keeps external refs PERMISSIVE. The probe only checks craft-native `agents/<role>.md`. |
| Restructuring `default.yml` into a mapping to host a top-level `models:` key | Breaks `parsePipeline`'s frozen array contract + SC1; the default models.fallback goes to walk-prose/sidecar instead (DC-3a). |
| `passes>1` multi-reviewer fan-out / numeric `convergence:<n>` enforcement | Parked from P8 (walk/parallelism pass); item 8 cross-links it but does not implement it. |
| Per-invocation `--harness`/`--role`/`--procedure` CLI flags | Would follow the `cli-overlay.js` pattern in a later phase (Parked from P8); not in this batch. |
| Worktree-teardown.sh production hardening (PID-before-kill, realpath guard) | Deferred to the VCS-adapter phase (`BACKLOG.md:250`); item 4 touches setup, not teardown. |
| Mutation testing of `scripts/`/`hooks/`/`skills/` (non-engine) | Stryker is scoped to `engine/src` (the only Node source); shell + prose are guarded by bats + review. |
| Making per-part review an engine invariant (a cadence knob) | DC-8 recommends documenting the single-phase cadence as canonical; the knob is the parallelism pass's job. |
| Forge-era / old-vocabulary phase-key support (`assembleContract` aliasing, migration warn-lint) | DROPPED per ADR-045 — craft is single-tenant and migrated; the assembler stays canonical-only. The pre-existing P4 `resolve.js`/`manifest.js` aliasing (frozen `ALIAS_MAP`/`resolveAlias`) is left untouched. |
