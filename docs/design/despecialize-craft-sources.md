# Design — De-specialize craft sources

> Brief: The engine and plugin sources must be technique- and vendor-agnostic — no mutation/Stryker, dependency-cruiser, or `gh` name in any plugin-defining source; specific tools live only in consumer config, examples, or a port adapter.
> Status: accepted (decisions ratified as ADRs 148-155; ADR-149 redefined the validation concern — see §2, §9, and the resolved decision log)

## Context

craft is a phase-pipeline engine. Two over-specificities of the same smell currently bleed concrete techniques and a concrete VCS host into plugin-defining sources (`pipeline/`, `skills/`, `agents/`, `contracts/`, `templates/`, `engine/src/`, the port specs under `docs/adapters/`, `docs/DOD.md`, `docs/GUIDE-customizing.md`):

1. **Harness technique-lock.** The `validation` and `architecture` phases are the same executing-harness descriptor (`archetype: harness`, `harness-exec ∈ contract`) with a hardcoded `harness.tool`. `pipeline/default.yml` pins `validation.harness.tool: stryker` (line 122) and `architecture.harness.tool: dependency-cruiser` (line 139). The two phase skills, the two triager agents, the `harness-exec` contract, the `mutation→validation` alias entry, the `mutation-tool` memory concern, the `.craft-mutation.lock` name, and `docs/DOD.md`'s "Mutation testing" section all hardcode the technique.

2. **Delivery vendor-lock.** `skills/propose/SKILL.md` and `skills/integrate/SKILL.md` name `gh pr create` / `gh pr merge` directly in prose, even though the VCS port (`docs/adapters/vcs.md`) already defines `propose(title,body)→prUrl` and `integrate(prUrl)→void` with `gh` confined to the Claude binding (line 76 — a correct keep).

The patterns to mirror already exist in-repo (verified in place):

- **`review` harness knob + engine-emitted plan.** `pipeline/default.yml` review descriptor carries `harness: { dimensions: [...], passes, max_cycles, convergence }`. `engine/src/manifest.js` `validateHarness` (lines 360-365) validates `dimensions` as a list of strings. `engine/src/resolve.js` `deriveReviewPlan(harness)` (lines 128-134) projects the raw knobs into an **engine-emitted** `harness.reviewPlan = { passes, stop_rule }`, attached **only** to `REVIEW_PHASE_ID` in `baseEffective` (lines 297-303). `skills/review/SKILL.md` reads `phase.harness.reviewPlan.passes` / `.stop_rule` (binding) but `phase.harness.dimensions` (raw consumer list). This is the exact shape to mirror: a raw consumer list (`dimensions`) plus an engine-emitted plan.
- **probe-and-enumerate, declined-by-absence.** `skills/init/SKILL.md` (CapabilityReport, lines 55-82) probes tool configs and declines a dimension by absence. `skills/validation/SKILL.md` (lines 44-50) probes "mutation tooling configured?" and no-ops when absent.
- **abstract verb in skill, vendor CLI in adapter.** `docs/adapters/vcs.md` Port interface (lines 28-38) + Claude binding (line 76).

Constraining ADRs already in force (frozen — not rewritten by this change): the executing-harness floor "triage-gates-propose" (`engine/src/gates.js` `isExecutingHarness`, keyed on contract not tool — already technique-neutral); the harness-config-as-policy seam (ADR-030); the engine-emitted-plan precedent (`deriveReviewPlan`); the auto-skip necessity probe (ADRs 143-147); the memory content whitelist (ADR-123).

### Empirically pinned facts (run against the live engine in this worktree)

| Probe | Result | Consequence for this design |
|---|---|---|
| `manifest-lint` on `harness.techniques: [a,b]` | **valid, exit 0** — `validateHarness` passes unknown sub-keys with no type-check | A `techniques` validation must be ADDED, mirroring `dimensions`; it is not free today. |
| `manifest-lint` on `harness.techniques: "notalist"` | **valid, exit 0** (no check today) | Without the new check a malformed `techniques` would silently pass — fail-closed must be added. |
| `pipeline-resolve` `effective[].validation` today | carries `harness: { tool: stryker, scope: per-hunk }` verbatim; no engine-emitted plan | The exec-harness has no analogue of `reviewPlan` today — resolved by ADR-155 (emit `techniquePlan`). |
| `pipeline.skip: [mutation]` | resolves via `ALIAS_MAP` to `validation`, skips it, emits a WAIVER line | Removing the alias makes `--skip mutation` a no-op, not an error (next row). |
| `pipeline.skip: [unknown-id]` | **`ok: true`**, phase stays in `effective`, silent no-op | Removing the `mutation` alias is a clean break: `--skip mutation` silently does nothing; canonical `--skip validation` still works. |
| `architecture` example manifest | sets only `enabled: true`; relies on `default.yml` `tool: dependency-cruiser` + probe | After de-specialization the example must DECLARE its technique, same as craft's own validation (bootstrap). |
| pi adapter technique surface | `validation` handled as gate-command plumbing only (`validationGateCmd`); the sole `mutation` references in `probe.js` are filesystem-mutation sense (`assertMutationsInsideThrowaway`); one kept `EQUIVALENT-MUTANT:` dogfood comment | Pi needs **no** technique edits (resolved by ADR-151). |
| `MODELS_KEYS` (`manifest.js:46`) | contains `validation-triager`, NOT `architecture-triager` | Pre-existing asymmetry; informs generic-triager-naming (#1) and its manifest-key migration. |
| `detect-ecosystem.sh:3` "NO install or mutation" | filesystem-mutation sense | False positive — out of scope, keep. |

## Requirements

When this ships, all are true:

1. **No technique name** (`stryker`/`mutation`/`mutant`, `dependency-cruiser`/`depcruise`) and **no host CLI** (`gh`/`github`) appears in any plugin-defining source: `pipeline/`, `skills/`, `agents/`, `contracts/`, `templates/`, `engine/src/`, `docs/adapters/*`, `docs/DOD.md`, `docs/GUIDE-customizing.md`, `README.md`. They appear ONLY in: consumer config (`context:`/`override:`/manifest knobs), `examples/`, a port adapter's binding section, and the kept `// equivalent mutant (…)` dogfood comments in `engine/src` and `adapters/pi`.
2. **One generic gate-harness mechanism** replaces the two hardcoded ones: a phase declares a set of techniques (`harness.techniques`); each runs scoped to the change; each is independently GATE-or-TRIAGE and independently declinable.
3. **No technique resolved by any tier** (explicit empty declaration, or no declaration **and** no derivable convention **and** no fallback test command) → the executing-harness phase **no-ops cleanly** — records the no-op token, releases its `propose`-gate entry. `propose` still works through the VCS port verb. The technique set is resolved by the validation skill's **declared → derived → fallback → no-op** precedence (ADR-149); the no-op is the terminal tier, not the default.
4. **N resolved techniques** (declared, derived from repo conventions, or the fallback gate command) → each runs, each gate-or-triage per its config, each individually declined-by-absence at probe time.
5. **`propose`/`integrate` route through the VCS port verbs** (`propose(title,body)`, `integrate(prUrl)`) in skill prose; swapping to a non-GitHub host requires editing only the VCS adapter binding — no skill edit.
6. **The `validation` phase NAME stays.** The floor invariant "triage-gates-propose" stays (it is already technique-neutral — it names the phase, not the technique).
7. **One generic findings-triager** replaces both `validation-triager` and `architecture-triager`.
8. **Renames land:** `.craft-mutation.lock` → `.craft-validation.lock` (script + VCS spec + teardown protocol); the `mutation-tool` memory concern → `validation-tool`; the `mutation: 'validation'` alias entry removed.
9. **`docs/DOD.md`** no longer carries a technique-named "Mutation testing" section; **`docs/GUIDE-customizing.md`** and **`README.md`** carry no technique/vendor names (point to `examples/`).
10. **Examples migrate** to stay lint-green under the new knob shape; the one-line on-ramp survives as `examples/` presets.
11. **craft's own validation harness is discoverable** (ADR-149): craft's README / CONTRIBUTING / consumer config document its mutation command, so the validation skill **derives** the mutation technique even with no `.claude/workflow.md`. An explicit `.claude/workflow.md` declaration is **sufficient but not required**. Either way, craft-on-craft dogfood mutation coverage does not silently no-op after de-specialization. No technique name lives in plugin source.
12. **CI green at every commit;** the craft gate stays non-waivable; the engine `node:test` + bats + lint suites pass.

## Design

### 1. The generic gate-harness mechanism

A single descriptor shape for any executing-harness phase. The phase declares a **list of techniques**; the engine validates the list and emits a per-technique **plan**; the skill walks the plan, probing-or-running each technique, GATE-or-TRIAGE per its mode.

**Consumer-facing knob (`harness.techniques`)** — mirrors `dimensions`. A list of technique descriptors:

```yaml
# pipeline/default.yml — validation descriptor (technique-AGNOSTIC core)
- id: validation
  archetype: harness
  contract: [harness-exec]
  procedure: craft:validation
  role: craft:harness-triager        # generic triager (ADR-148)
  model: sonnet
  consumes: [change]
  produces: [validation-report]
  gate: <validation gate>
  harness:
    scope: per-hunk                  # phase-level default scope (per-technique may override)
    techniques: []                   # EMPTY in core — no DECLARED technique ⇒ skill discovery (derive→fallback→no-op, ADR-149)
```

A **technique descriptor** (each element of `techniques[]`) carries:

| Field | Type | Meaning | Default |
|---|---|---|---|
| `id` | string (required) | technique label; the `commit-prefix` scope and the `validation-tool` memory key | — |
| `probe` | string | shell predicate; technique is declined-by-absence when it exits non-zero (config + binary present) | always-present if omitted |
| `run` | string | command to run over the scoped change | — (required unless `mode: triage` with a self-contained `run`) |
| `scope` | `per-hunk` \| `per-file` | overrides the phase-level `scope` | phase `scope` |
| `mode` | `gate` \| `triage` | `gate` = run, command exit decides pass/fail; `triage` = run, spawn the generic triager over findings | `gate` |
| `run-style` | `background` \| `sync` | `background` writes the run-lock and lets `documentation` parallel; `sync` blocks | `sync` |
| `triage-procedure` | string (path) | `context:`-relative ref to the technique's own triage procedure, passed verbatim to the triager | — (none = generic triage) |
| `commit-prefix` | string | conventional-commit type for triage commits, e.g. `test`, `fix`, `chore` | `chore` |

This is **technique-agnostic**: `mutation` and `dependency-cruiser` are now ordinary `id` values a consumer supplies — the core ships `techniques: []`.

**Validation (`engine/src/manifest.js` `validateHarness`).** Add a `techniques` branch mirroring the `dimensions` branch (lines 360-365), but list-of-objects:

```js
if (Object.hasOwn(harness, 'techniques')) {
  const t = harness.techniques;
  if (!Array.isArray(t)) {
    errors.push(`phases.${phaseName}.harness.techniques must be a list`);
  } else {
    t.forEach((tech, i) => validateTechnique(tech, phaseName, i, errors));
  }
}
```

`validateTechnique` checks: `id` is a non-empty string; `mode` ∈ `{gate, triage}` if present; `run-style` ∈ `{background, sync}` if present; `scope` ∈ `{per-hunk, per-file}` if present; `probe`/`run`/`triage-procedure`/`commit-prefix` are strings if present. Unknown sub-keys pass (forward-compat, consistent with the existing `validateHarness` posture). This is **load-bearing**: the pinned probe shows `techniques` passes today with no check — the new check is what makes a malformed list fail-closed.

The legacy `tool`/`scope`/`incremental` checks (lines 384-392) are **removed** (`tool` is gone; `scope` survives as the phase-level scope, kept; `incremental` folds into a per-technique opaque passthrough if a consumer needs it). Keep the `scope` string check.

**Engine-emitted plan (`engine/src/resolve.js`).** Mirror `deriveReviewPlan`. Add `deriveTechniquePlan(harness)` that projects each raw technique descriptor into a resolved one with defaults filled (`mode` default `gate`, `run-style` default `sync`, `scope` inheriting the phase scope, `commit-prefix` default `chore`), producing `harness.techniquePlan = [{ id, probe?, run?, scope, mode, runStyle, triageProcedure?, commitPrefix }, …]`. Attach it in `baseEffective` for **executing-harness** descriptors, mirroring the review attach (lines 297-303):

```js
const baseEffective = execResult.descriptors
  .filter(d => d.enabled)
  .map(d => {
    if (d.id === REVIEW_PHASE_ID && d.harness)
      return { ...d, harness: { ...d.harness, reviewPlan: deriveReviewPlan(d.harness) } };
    if (isExecutingHarnessDescriptor(d) && d.harness)
      return { ...d, harness: { ...d.harness, techniquePlan: deriveTechniquePlan(d.harness) } };
    return d;
  });
```

`isExecutingHarnessDescriptor` is the same predicate `gates.js` defines module-privately as `isExecutingHarness` (`archetype === HARNESS_ARCHETYPE && contract.includes('harness-exec')`, lines 71-76). It is **not exported today** — extract it (and the `EXECUTING_HARNESS_CONTRACT` constant) to a shared module so both `gates.js` and `resolve.js` bind one definition, no second copy. The skill then reads `phase.harness.techniquePlan` (binding, engine-emitted) the way `review` reads `reviewPlan` (ratified — ADR-155 emits the plan). Skill-**discovered** techniques (ADR-149 derived/fallback tiers) are resolved through the same `deriveTechniquePlan` defaults at skill runtime, so declared and discovered techniques share one default set.

### 2. The skill body (`skills/validation/SKILL.md`, technique-neutral) — owns technique **discovery**

Per ADR-149, `validation` is the project's general **engineering harness** (lint, test, mutation, prettier, typecheck, …), and its technique set is **discovered from the project's own validation conventions** — not craft-declared. The engine stays technique-agnostic: it carries only the opaque `harness.techniques` knob and the emitted `techniquePlan` (§1); it names no technique and parses no prose. The **discovery is skill (LLM) judgment** — the same home as the existing gate-command capability probe — never engine code. mutation is one ordinary technique among many.

The skill resolves its active technique set in this **precedence order** (first non-empty tier wins; lower tiers are not consulted):

1. **Declared.** `phases.validation.harness.techniques` in the craft config (manifest) is non-empty → use it verbatim. This is the engine-resolved `techniquePlan` (§1); the skill applies no further discovery.
2. **Derived.** No declaration → the skill reads the repo's own validation conventions (`README` / `CONTRIBUTING` / craft config) and derives **one technique per documented validation command**: a pass/fail tool (`lint`, `test`, `format --check`, `typecheck`, …) becomes a **GATE** technique; a mutation-style tool whose findings need judgment becomes a **TRIAGE** technique. Each derived technique is resolved through the same `deriveTechniquePlan` defaults (§1) at skill runtime.
3. **Fallback.** No documented convention → the single test command deduced from the language manifest (the **existing gate-command capability probe**) runs as one **GATE** technique.
4. **Clean no-op.** None of the above yields a technique → the phase records the existing no-op token and releases its `propose`-gate entry (the terminal tier — see Error semantics).

This **strengthens** (does not contradict) the brief's "zero declared techniques → clean no-op": an explicit **empty** declaration still no-ops, but an **absent** declaration now derives the repo's real harness rather than no-opping. An explicit empty declaration is therefore the way a consumer opts a repo *out* of validation.

Preamble + Procedure, rewritten so **no technique name appears**:

- **Preamble discovery + probe (replaces the "mutation tooling configured?" probe).** Resolve the active technique set by the precedence above (declared `techniquePlan` → derived from conventions → fallback gate command). For each resolved technique, run its `probe` predicate (a derived/fallback technique's probe is the presence of its own command/config). A technique whose probe fails is **declined-by-absence** — recorded `NO-OP(validation:<technique-id>): declined — probe absent`, removed from this run's active set. If, after discovery and probing, the **active set is empty** (no tier yielded a technique, or all were declined) → the phase records the existing clean no-op note and **ends here**; its `propose`-gate entry is released by the run orchestrator's existing recorded-no-op release path (`skills/run/SKILL.md` Cross-phase invariants — already generic). A manifest may never pre-empt the probe.
- **Procedure (per active technique).** Scope per the technique's `scope` (default phase scope). If `run-style: background`: start the run in the background, write `<root>/.craft-validation.lock ← <pid> <iso-timestamp>`, clear on landing (`documentation` may parallel). If `sync`: run synchronously, nothing to lock. Then:
  - `mode: gate` → the technique's `run`/gate command decides pass/fail; record per-technique outcome.
  - `mode: triage` → on a non-empty findings set, spawn **`craft:harness-triager`** with: the findings filtered to the change's lines; **reviewer-predicted advisory notes verbatim** (see §6); the gate; the commit message `<commit-prefix>(validation): <technique-id> <scope>`; global + phase `context:` files **including the technique's `triage-procedure` ref verbatim**.
- **DoD sub-concern** (lines 16-34) stays, but the bracketed asserted-instead phrase becomes technique-neutral: `<gates green, harness techniques triaged-or-no-op'd>` (was "mutation triaged-or-no-op'd").
- **Gate-satisfaction note** (lines 52-57): "the mutation run lands and triages green" → "every active technique's run lands and triages/gates green"; "lands no mutation run at all" → "lands no technique run at all".
- **Lock**: every `.craft-mutation.lock` → `.craft-validation.lock`; "mutation run alive" → "validation run alive".

`skills/architecture/SKILL.md` becomes a thin instance of the **same** mechanism (ADR-150 keeps it as a distinct phase identity, default-off, sharing the generic body): `architecture`'s skill body is generalized identically (discover-or-declare techniques; sync default; triage mode); its core descriptor ships `techniques: []` too. The §2 discovery precedence applies to `architecture` as well — an `architecture` repo with documented boundary-check conventions derives them, absent any, it cleanly no-ops (its default-off state already favors the no-op).

### 3. The generic triager (`agents/harness-triager.md`)

One agent replaces `validation-triager.md` and `architecture-triager.md`. Its contract is the **union abstraction** already present in both: *for each finding, verify it is real per the context block's triage procedure; if real, resolve it (the resolution the technique's procedure names — a kill test, an edge fix, …) under the RED→GREEN gate; only if provably benign, document the exception inline per the repo's convention with one line of proof; never weaken a test/rule to clear a finding.* The technique-specific vocabulary ("survivors of a mutation run", "mutation-resistant kill test", "dependency-cruiser's own rule config") is **removed from the agent body** and lives in the technique's `triage-procedure` ref (consumer config), which the spawn injects verbatim. Final message per finding: RESOLVED / EXCEPTION (proof line) / FALSE (triage evidence) / blocker.

`contracts/harness-exec.md` is rewritten technique-neutral: "A tool runs; the AI triages findings: resolve each (the resolution the technique names) or prove it benign and document it inline — never simply accept a finding. Never weaken a test or rule to clear a finding. Gate-green before commit." (was "triages survivors or violations … kill with a test … clear a violation").

`contracts/core.md:5` suppression list "coverage/mutation ignores" → "coverage ignores" (drop the technique-named member; the generic "lint-silencing comments of any flavour" already covers the rest).

### 4. Memory concern rename (breaking — ADR)

`engine/src/memory.js`: `CONCERNS` member `mutation-tool` → `validation-tool` (line 53); `KEY_FIELDS['mutation-tool']` → `KEY_FIELDS['validation-tool']` keyed on `['tool']` → keyed on `['id']` (the technique id, since "tool" is now technique-keyed); `IMPROVES_BY` predicate likewise. The entry schema in `docs/adapters/memory.md` (line 151) and the prose (lines 144, 296, 304, 310) rename `mutation-tool` → `validation-tool`. The kept equivalent-mutant comment at line ~549 stays. This is a **store-schema rename** (old `mutation-tool` entries in a committed store become unrecognized and decay) — recorded in a new ADR per the brief.

### 5. Delivery port routing

`skills/propose/SKILL.md`: replace the two `gh pr create` references (lines 26, 31) with the VCS port verb — "invoke the VCS port `propose(title, body)` (see `docs/adapters/vcs.md`); the adapter owns the host CLI." The drafted body is unchanged. `skills/integrate/SKILL.md`: replace the `gh pr merge <#> --squash --delete-branch` block (lines 26-29) with "invoke the VCS port `integrate(prUrl)`; `--squash`/`--delete-branch`/`merge-flags` semantics live in the adapter binding." Line 36 "mutation run-lock" → "validation run-lock".

`docs/adapters/vcs.md` (a port spec — must be agnostic): the `teardown` verb (line 41) and the Teardown lock protocol (lines 48-58) rename `.craft-mutation.lock` → `.craft-validation.lock` and "mutation phase/run" → "validation phase/run" / "long-running harness run". Line 76 (`gh` in the Claude binding) and lines 80-83 (Pi binding `gh`) **stay** — that is where the vendor CLI is allowed to live.

`scripts/worktree-teardown.sh`: `LOCK="$WT/.craft-mutation.lock"` → `.craft-validation.lock`; the header comment + all "mutation run" strings → "validation run". The lock-protocol logic is unchanged.

### 6. Review→validation advisory coupling (generalize)

`skills/review/SKILL.md:36-38` and `agents/reviewer.md:16-18` name "suspected-equivalent mutants" feeding "the mutation triager's prompt". Generalize to technique-neutral advisory vocabulary: the tests dimension MAY flag **suspected-benign harness findings** as advisory notes kept for the executing-harness phase; the validation skill passes them verbatim to `craft:harness-triager`. The cross-phase channel (review note → triager prompt) is preserved; only the mutation-specific noun changes. Ratified — ADR-154 keeps the coupling generalized.

### 7. DoD / GUIDE / README neutralization

- `docs/DOD.md`: **remove** the "## Mutation testing" section (lines 19-26). The durable bar keeps "all gates green / triaged-or-documented" only in technique-neutral language if anything; per the brief the technique-named section is removed. The "Architecture boundaries" N/A note (lines 41-44) drops "dependency-cruiser" → "the architecture boundary check did not run".
- `docs/GUIDE-customizing.md`: "validation (default: mutation testing)" / "architecture (default: dependency-cruiser)" (line 32) → "validation and architecture are executing-harnesses; declare techniques per repo — see `examples/`." The `--harness` coercion table (lines 244-251) drops the `tool` row, adds a `techniques` row (comma-or-object list). The hexagon diagram's **VCS-axis** `gh` labels ("file / gh / …" VCS column line 59, "gh/git" line 74) → "VCS host CLI"; the **Backlog-axis** label `file / gh / jira / linear` (line 58) stays (Backlog port, out of scope — see Out of scope). The probe-defaults prose (line 372, and the README mirror lines 51-52) "mutation-config probe" → "technique-config probe".
- `README.md`: lines 20-22, 46-47, 77 drop "dependency-cruiser"/"mutation" from the harness descriptions → "executing-harnesses (techniques declared per repo)"; "scoped mutation run + triage" → "scoped harness run + triage"; "mutation run-lock aware" → "validation run-lock aware". Provenance/history docs untouched (frozen).

`agents/planner.md:20` and `templates/plan.md:14` test-category list "mutation/ADV/property suites" → "harness/ADV/property suites" (technique-neutral; these are sizing examples, the word "mutation" is the only technique reference).

`skills/run/SKILL.md` (5 in-scope hits, neutralized without changing logic — the release path is already tool-agnostic): line 128 auto-skip table "no mutable code changed … the mutation no-op signal" → "… the technique no-op signal"; lines 306-308 the `validation` clarification "the mutation note", "no mutation run lands", "a landed and triaged mutation run" → "the technique note", "no technique run lands", "a landed and triaged technique run"; line 422 SC5 prose "no-ops with a note when no mutation tooling configured" → "… when no techniques declared/probed". The release semantics (an awaited executing-harness that records a runtime no-op releases its `awaitingHarnesses` entry, lines 292-304) are **already technique-neutral** — they key on "records a runtime no-op", never on the word mutation — so requirement 3's zero-technique gate-release works unchanged; only the surrounding prose carries the technique name.

### 8. The init interviewer (probe-and-enumerate, generalized)

`skills/init/SKILL.md` (6 hits) hardcodes two technique probes: `mutationTool` (Stryker config files, lines 55-57), `archTool` (dependency-cruiser config files, line 58), both in the `CapabilityReport` shape (lines 78-79) and the harness interview question (line 116). Generalize to **probe-and-enumerate** (the brief's mirror target): replace the two named probes with a single technique-config enumeration — probe for *generic* harness-technique config presence the same way the gate probe enumerates test runners (it already does this for `testCmd`, lines 44-45), and surface whatever is found as candidate technique ids the interview offers (declined-by-absence). The `CapabilityReport` drops `mutationTool`/`archTool`, gains a neutral `harnessTechniques: string[]` (the enumerated candidate ids, possibly empty). The harness question (line 116) becomes "Declare validation/architecture techniques for this repo?" with probe-grounded defaults. No technique name remains in the skill; the names a consumer ends up declaring come from their repo's own config files, not from craft's source.

This init enumeration feeds the **declared** tier (ADR-149 tier 1) — it is an *authoring aid* that helps a consumer write an explicit `harness.techniques` block at init time. It is complementary to, not a replacement for, the validation skill's runtime **derive/fallback** discovery (ADR-149 tiers 2-3): a consumer who skips the interview still gets their harness derived at phase runtime. Both surfaces enumerate the same repo conventions; neither hardcodes a technique name.

### 9. craft's own validation harness (dogfood survival under discovery)

Today `validation` auto-detects `stryker.conf` by filename. After de-specialization the skill can no longer key on that filename — and per **ADR-149** it no longer needs to. The skill **derives** craft's harness from craft's own validation conventions: the precedence of §2 means that as long as craft's `README` / `CONTRIBUTING` / consumer config **document the mutation command**, the derived tier (tier 2) supplies the mutation technique with zero declaration. craft-on-craft dogfood coverage therefore survives by **discoverability**, not by a mandatory declaration.

An explicit `.claude/workflow.md` declaration is **sufficient but not required** — it short-circuits to the declared tier (tier 1) and is the most robust dogfood guarantee. The shape (example, illustrating the new knob against craft's own Stryker tooling):

```yaml
# .claude/workflow.md (craft's OWN consumer manifest — NOT plugin source)
phases:
  validation:
    harness:
      techniques:
        - id: mutation
          probe: "test -f stryker.conf.json && npx --no-install stryker --version"
          run: "npx stryker run --mutate $SCOPE"
          mode: triage
          run-style: background
          triage-procedure: .claude/workflow/mutation-triage.md
          commit-prefix: test
```

The dogfood requirement (req. 11) is satisfied by **either** path: craft's conventions documenting the mutation command (derived), **or** the declaration above (declared). The failure mode the requirement forbids — silent no-op of craft's own mutation coverage — only occurs if craft both omits the declaration **and** stops documenting its mutation command; keeping the README/CONTRIBUTING harness section is the durable guard. `examples/.claude/workflow/mut.md` (and a sibling manifest) ships the declaration block as a copyable preset, so the one-line **declared** on-ramp survives for consumers who prefer it over discovery.

### 10. Alias removal

`engine/src/alias-map.js`: remove the `mutation: 'validation'` entry. Every other `ALIAS_MAP` member is a genuine old→new PHASE rename (`branch→workspace`, `prd→requirements`, …); `mutation` is the lone technique-name anomaly. The pinned probe confirms removal is a clean break: `--skip mutation` becomes a silent no-op (unknown ids stay in `effective`), the canonical `--skip validation` is unaffected. `manifest.js:114-117` deprecation hint for `models.mutation-triager` retargets to `harness-triager` (ADR-148 renames the triager).

### Error semantics

- A malformed `techniques` list (non-array, a technique missing `id`, a bad `mode`/`run-style`/`scope` enum) fails `manifest-lint` loudly (exit 2), same posture as a bad `dimensions`/`passes`. This is the new fail-closed behaviour the pin showed is absent today.
- A technique whose `probe` fails is declined-by-absence — recorded, never a blocker.
- A technique `run` that errors at runtime is a blocker `{ validation:<id>, reason, ≤3 options }` — never a silent pass (existing harness-exec posture).
- Empty active technique set **after the full declared → derived → fallback discovery** (ADR-149) → clean no-op + propose-gate release (existing recorded-no-op path). The no-op is the **terminal** discovery tier, not the default: an absent declaration derives the repo's harness before any no-op.

## Decision log (resolved — ADRs 148-155)

All eight candidates are ratified. This is now a resolved log, not an open-questions table. The decisions conversation **adopted seven as recommended** and **redefined one** (#2 → ADR-149): the designer recommended a declared-only `.claude/workflow.md` site; the user reframed `validation` as a convention-discovered engineering harness. That deviation is folded into §2, §9, the Requirements, and the Test strategy above.

| # | Decision | ADR | Ratified choice | vs. designer recommendation |
|---|---|---|---|---|
| 1 | Generic triager naming | [148](../adr/148-generic-harness-triager-name.md) | **`harness-triager`** replaces both `validation-triager` and `architecture-triager`; technique vocabulary lives in each technique's `triage-procedure` ref; `MODELS_KEYS` migrates `validation-triager`→`harness-triager` and the deprecation hint retargets. | Adopted as recommended (user judgment). |
| 2 | The validation concern itself | [149](../adr/149-validation-is-convention-discovered-engineering-harness.md) | **DEVIATION.** `validation` is a general **engineering harness** (lint/test/mutation/format/typecheck/…) whose technique set is **discovered** by the skill in precedence **declared → derived → fallback → no-op**. The engine stays agnostic (knob + emitted plan only); the skill owns discovery; mutation is one technique among many. An explicit empty declaration still no-ops; an absent declaration now **derives** the repo's real harness. | **Redefined.** Designer recommended declared-only via `.claude/workflow.md`; user reframed to convention discovery. Strengthens the brief's capability-probing story rather than contradicting it. |
| 3 | One harness phase vs two identities | [150](../adr/150-keep-validation-and-architecture-as-two-identities.md) | **Keep both** `validation` and `architecture` as two phase identities sharing the one generic mechanism; `architecture` stays default-off. | Adopted as recommended. |
| 4 | Pi adapter scope | [151](../adr/151-pi-adapter-no-technique-edits.md) | **No technique edits** to `adapters/pi` — its `validation` is gate-command plumbing, its `mutation` strings are filesystem-sense, its one equivalent-mutant comment is kept dogfood. Grep gate allowlists pi's filesystem-sense strings by path. | Adopted as recommended. |
| 5 | README + GUIDE scope | [152](../adr/152-neutralize-readme-and-guide.md) | **Neutralize both** `README.md` and `docs/GUIDE-customizing.md` (technique + VCS-host names removed, point to `examples/`); Backlog-port `gh`/`jira`/`linear` adapter labels stay. | Adopted as recommended. |
| 6 | Memory concern + lock rename (breaking) | [153](../adr/153-rename-validation-tool-concern-and-lock.md) | **Rename both** `mutation-tool`→`validation-tool` (keyed on the technique `id`) and `.craft-mutation.lock`→`.craft-validation.lock` across all three sites; record the store-schema break. Refines ADR-036 and ADR-049 forward. | Adopted as recommended. |
| 7 | Review→harness advisory coupling | [154](../adr/154-generalize-review-harness-advisory-coupling.md) | **Keep, generalized** — the review tests dimension MAY flag **suspected-benign harness findings**; the validation skill injects them verbatim into the `harness-triager` spawn. The cross-phase channel is preserved; only the mutation noun is removed. | Adopted as recommended. |
| 8 | Exec-harness engine-emitted plan | [155](../adr/155-emit-technique-plan-mirroring-review-plan.md) | **Emit `harness.techniquePlan`** via `deriveTechniquePlan(harness)`, mirroring `deriveReviewPlan`; defaults resolved once in pure engine code; `isExecutingHarness` extracted to a shared module. Declared techniques resolve through the engine plan; skill-discovered techniques (ADR-149) resolve through the same defaults at skill runtime. | Adopted as recommended. |

## Test strategy

Engine (`engine/test`, `node:test`):

- **`manifest.test.js`** — `validateHarness` over `techniques`: a valid list of technique objects passes; non-array fails; a technique missing `id` fails; bad `mode`/`run-style`/`scope` enum fails; unknown technique sub-keys pass (forward-compat). Edge matrix: empty `techniques: []` valid; `techniques` absent valid; the removed `tool` key — assert it is no longer specially validated. The pinned "string passes today" case becomes a now-fails assertion (the fail-closed delta).
- **`resolve.test.js`** — `deriveTechniquePlan` projection: defaults filled (`mode→gate`, `run-style→sync`, `scope` inherits phase scope, `commit-prefix→chore`); plan attached to executing-harness descriptors in `effective[]` and NOT to non-harness phases; review's `reviewPlan` attach is unchanged (regression). Property-test lens: `deriveTechniquePlan` is a pure projection — round-trip that every input technique appears once in the plan with all defaults resolved, for a generated list of partial technique descriptors.
- **`alias-map`** (covered in `resolve.test.js`) — `mutation` no longer resolves to `validation`; `--skip mutation` leaves `validation` in `effective` (the clean-break assertion); all other aliases unchanged.
- **`memory.test.js`** — `CONCERNS` contains `validation-tool`, not `mutation-tool`; `KEY_FIELDS`/`IMPROVES_BY` keyed on the renamed concern; an old `mutation-tool` entry in a loaded store is unrecognized (decays).
- **`gates.test.js`** — the executing-harness floor (`isExecutingHarness`, propose awaits) is unchanged (regression — it never named a technique).

Discovery precedence (ADR-149 — **scenario-fidelity, not CI-unit**, the same home as the gate-command probe):

- The validation skill's **declared → derived → fallback → no-op** precedence is exercised as scenario fixtures, not engine unit tests, because discovery is LLM judgment over repo prose:
  - **Declared** — a repo with a non-empty `phases.validation.harness.techniques` uses it verbatim; no derivation runs.
  - **Derived** — a repo with **no** declaration but a documented validation section (README / CONTRIBUTING) yields one technique per documented command (GATE for pass/fail tools, TRIAGE for mutation-style).
  - **Fallback** — a repo with neither runs the language-manifest test command as a single GATE technique (reuses the existing gate-command probe fixture).
  - **No-op** — a repo with an explicit **empty** declaration, or no declaration and nothing documented and no deducible test command, records the no-op token and releases the propose-gate (assert via the run-orchestrator recorded-no-op path, which IS CI-tested and technique-neutral).
- The engine-side seam these scenarios sit on top of (`deriveTechniquePlan` defaults, the no-op release path) is CI-unit-tested above; only the prose-reading judgment is scenario-graded.

Source-hygiene gate (the principle's enforcement — new bats or CI grep):

- A **grep gate** asserting zero hits for `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise` and for the VCS-host CLI `gh`/`github` across the plugin-defining source set (`pipeline/ skills/ agents/ contracts/ templates/ engine/src/ docs/adapters/ docs/DOD.md docs/GUIDE-customizing.md README.md`), with a precise allowlist (each entry justified, so the gate fails on a NEW leak but passes on the kept ones):
  - `equivalent mutant` / `EQUIVALENT-MUTANT` — the kept dogfood comments in `engine/src` and `adapters/pi`.
  - filesystem-sense `mutation`/`Mutations` in `scripts/detect-ecosystem.sh`, `adapters/pi/src/probe.js`, and `docs/adapters/pi-poc-record.md` (the throwaway-confinement assertion) — not the technique.
  - `gh`/`github-issues` in `docs/adapters/backlog.md` and the `NON_BUILTIN_TRACKERS` set in `engine/src/manifest.js:179` — the **Backlog port** adapter recipe, where a host CLI legitimately lives (a port's adapter implementation, an allowed location per the principle). The grep-gate must scope the `gh`/`github` ban to the VCS-host concern, not the Backlog tracker concern, OR allowlist these two sites by path.

  This gate is the durable proof of requirement 1 and must itself be in CI. The allowlist is the load-bearing boundary between "technique-name leak" (fail) and "kept evidence / adapter recipe" (pass) — it is reviewed, not open-ended.

Examples lint (`examples-lint` CI gate, ADR-063):

- `examples/.claude/workflow/mut.md`, `examples/architecture/workflow.md`, `examples/review-harness/workflow.md` migrate to the `techniques` knob shape and stay lint-green. `review-harness/workflow.md:38` (`harness: { tool: stryker, … }`) migrates to a `techniques` block (the explicit migration the pin surfaced).

Manual / on-demand (not CI-gated):

- The SC5 second-instantiation smoke (`skills/run/SKILL.md` lines 413-428) prose updates ("validation no-ops with a note when no mutation tooling configured" → "…when no techniques declared/probed"); the behaviour is the same clean no-op + propose-gate release.
- craft-on-craft dogfood: with the new `.claude/workflow.md` declaring the `mutation` technique, confirm the validation phase actually runs Stryker (does not silently no-op) — the requirement-11 proof.

## Out of scope

- **Renaming the `validation` phase itself** — the brief explicitly keeps the phase NAME `validation`; only technique names inside it change.
- **The floor invariant token `validation-triage-gates-propose`** (`engine/src/policy.js`, `skills/run/SKILL.md`, `docs/adapters/policy.md`, `docs/GUIDE-customizing.md`) — it names the phase, not a technique; already technique-neutral, unchanged.
- **Frozen history** — ADRs (`docs/adr/*`), dated `DESIGN-*`/`PLAN-*`/`PRD-*`/`SPIKE` docs, BACKLOG history. Not rewritten even where they name `validation-triager`/mutation.
- **The kept dogfood comments** — `// equivalent mutant (…)` justifications in `engine/src` and `adapters/pi`, and pi's `EQUIVALENT-MUTANT:` comment — these are evidence, kept verbatim.
- **craft's own Stryker tooling** — `engine/stryker.conf.json`, `adapters/pi/stryker.conf.json`, `engine/package.json` mutation scripts — craft's dev/dogfood toolchain, kept; they are not plugin-defining source.
- **`detect-ecosystem.sh` / pi `probe.js` "mutation" strings** — filesystem-mutation sense, not the technique; false positives, untouched.
- **Pi adapter technique parity** (ADR-151 = no edits) — pi names no technique in a technique sense.
- **The Backlog-port `gh` recipe** — `docs/adapters/backlog.md`'s `github-issues` `custom`-script recipe wrapping `gh` (lines 57-65), the `NON_BUILTIN_TRACKERS` set (`manifest.js:179`), and the GUIDE hexagon's Backlog-axis label (`file / gh / jira / linear`, GUIDE line 58). These are a **port adapter implementation** (an allowed location) for the Backlog port, a separate concern from the harness/delivery despecialization. The VCS-port `gh` (GUIDE hexagon lines 59/74 `gh CLI` / `gh/git`, and the propose/integrate skills) IS in scope and is neutralized in §5/§7. Generalizing the Backlog tracker vocabulary is flagged for a separate change if the principle is later extended to the Backlog port.
- **`docs/adapters/pi-poc-record.md`** — a frozen POC record; its "mutations" are filesystem-mutation sense (throwaway confinement), not the technique. Untouched.
