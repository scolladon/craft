# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine, re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip /
> insert / reorder), strong zero-config defaults, a small invariant core, per-port
> customization.

> SoT — *intent:* `docs/PRD-customizable-engine.md` · *architecture:* `docs/DESIGN-customizable-engine.md`
> · *decisions:* `docs/adr/` · *build scripts:* `docs/archive/PLAN-*.md` · *spikes:* `docs/archive/SPIKE.md`

## Status — PRD program complete (P0–P16 ✅)

Every PRD goal (G1–G14) and success criterion (SC1–SC9) is discharged. **G13 met
2026-06-20** — a non-Claude provider (Gemini, via the Pi adapter) ran a construction phase
end-to-end (`docs/adapters/pi-poc-record.md`). The PRD defines **no P17**: §17 ends at P16,
itself tagged *"(next program)"*; anything beyond is un-PRD'd backlog (see *Candidate phases*).
**P17 delivered 2026-06-21** — the first post-PRD candidate: the Pi adapter is productized into a
`craft-pi` full-walk entrypoint + live `tool_call` guard wrapper (ADRs 093–095).
**P18 delivered 2026-06-21** — walk/parallelism enforcement: the resolver emits a `reviewPlan`
(`passes` + named `stop_rule`) on the review descriptor, so `passes`/`convergence` are engine-enforced
rather than walk-judgment, and a repeatable per-invocation `--harness <phase>.<knob>=<value>` overlay
lands at CLI-wins precedence (ADRs 096–099; discharges the re-parked ADR-064).
**P19 delivered 2026-06-21** — "nothing to do" is now a recorded, first-class outcome for both
judgment phases: `decisions` adopts clear, ADR/principle-aligned recommendations without escalating
(escalating only genuine forks), and both phases record a single greppable `NO-OP(<phase>):` line
carried into the PR body (ADRs 100–103).
**P20 delivered 2026-06-21** — DoD-aware verification: an optional Definition-of-Done artifact (a
free-text checklist at `docs/DOD.md`, or wherever `paths.dod` points) folds into the `validation`
phase (default-ON). It asserts the DoD per criterion, *reads* the gate/mutation results rather than
re-running them, lets the DoD subsume architecture-alignment with an honest gap-note (the
`architecture` phase stays default-off), and on absence records a non-blocking `NO-OP(verify): no DoD
declared` carried into the PR body. `manifest-lint` validates `paths.dod` when declared; the rest of
`paths.*` stays reserved-but-inert (ADRs 104–110).
**P21 delivered 2026-06-21** — running craft in a loop: a docs + example recipe (`examples/loop/` plus
a GUIDE §4 "use-pattern" subsection) for an operator-owned OUTER loop that re-invokes one craft pass
until the DoD is met. Canonical form is Claude Code's `/loop /craft:run`, self-paced on the printed
run-record `verify:` verdict; a headless `craft-pi` exit-code variant is documented as a contrast. No
engine change — craft still runs exactly one gated pass per invocation; the loop composes a Claude
Code primitive over an existing entry point (ADRs 111–115).
**P22 delivered 2026-06-22** — repo-local self-improving memory: a 7th port (`docs/adapters/memory.md`)
whose `load`/`save` verbs maintain an **advisory, never-gating** cache in the TARGET repo
(`.claude/craft-memory.md`, committed via a `.gitignore` re-include), accumulating mechanically-derived
learnings (toolchain, discovered gate command, recurring findings, part-sizing, per-phase metrics).
Validate-on-read + confidence/decay + merge-before-insert + a newest-window size cap keep it fresh and
bounded; the content whitelist is document-only; deleting the store changes run *cost*, never
*correctness*. Configured via a new top-level `memory:` manifest key (ADRs 116–123).
**P23 delivered 2026-06-22** — configurable policy hooks: a per-repo/per-user permission layer over the
outward/hard-to-reverse VCS-port actions (`isolate`/`commit`/`push`/`propose`/`integrate`/`teardown` +
`external-send`/`backlog-write`). Three verdicts — `always`/`ask`/`never` — resolve through the existing
overlay precedence (per-invocation `--policy <action>=<verdict>` > project manifest `policy:` > user
`~/.claude/craft-policy.md`), with per-action reversibility-keyed defaults so an unconfigured repo behaves
exactly as before (merge still confirms). A pure `engine/src/policy.js` module plus a `{claude, pi}`-bound
Policy port (`docs/adapters/policy.md`) split interactive `AskUserQuestion` from headless
degrade-to-blocker (pre-approved via a per-invocation `always`); an `always` verdict *supersedes* the
hardcoded merge/PR confirmation (enabling headless auto-merge), while the three engine floors
(never-commit-on-red, validation-triage-gates-propose, artifact-handoff) stay non-overridable and
un-nameable (ADRs 124–130).
**P24 delivered 2026-06-22** — rename the plan-decomposition unit "slice" → **part**: a
behavior-preserving, cross-cutting vocabulary rename landed green-by-construction. The plan heading
(`## Part N`) + `plan-lint.sh` keyword, the worker agent (`craft:slice-implementer` →
`craft:part-implementer`, including `pipeline/default.yml` `role:`, `manifest.js` `MODELS_KEYS`, and the
golden descriptor), the `gates.slice` → `gates.part` manifest key (a breaking schema change), the
`slice-sizing` → `part-sizing` memory concern (including the committed store data), and all live prose
flip in lockstep; dated history docs are swept too for a globally clean grep. Only `Array.slice`/
English-verb uses (sense E) and the rename's own meta-docs (the P24 design/plan docs + ADRs 131–135)
retain "slice". Test counts held (941/202). The agent-name rename **did** touch engine config and the
golden descriptor — the original "no engine-descriptor change expected" aside was factually wrong (ADRs
131–135). Two follow-ups it surfaced were resolved in the same change: the `MODELS_KEYS` membership gap
is now pinned by a test (the `'refactor-executor'` survivor is killed); the `IMPROVES_BY` sizing
predicate's `=> true` survivor is documented inline as a provable equivalent (the discriminating-field
family); and `docs/DOD.md` was reduced to durable criteria only, with per-change criteria moving to the
design doc — ending the recurring "feature-acceptance section goes stale" item (P21/P23/P24).
**P25 delivered 2026-06-23** — interactive customization generator (the manifest "front door"): a new
standalone skill `craft:init` that, run inside a target repo, probes its capabilities, interviews the user
over the full Tier-0/1 catalog, and writes a lint-clean **named manifest** `.claude/craft-<name>.md`
(direct write, emit→temp→lint→move-on-exit-0; an INVALID emit never lands). A named config is a *full*
manifest (frontmatter + prose, the shape `validateManifest` accepts), a sibling of `.claude/workflow.md` —
multiple coexist and the live default is never touched. The consumption path ships too: a new
per-invocation `--config <name>` token on `/craft:run` resolves `.claude/craft-<name>.md` as the manifest
for that run, **distinct** from `--profile` (which sets the execution-archetype map) and composing with it;
an absent target is a loud STOP. Pure `engine/src/{init-emit,init-config}.js` cores + their bins, a
read-only `scripts/detect-ecosystem.sh` factored out of and shared with `worktree-setup.sh`, and
orchestrator-only `--config` wiring — **no new runtime port, no engine bin change** (both manifest bins
already accept an arbitrary path). 97% mutation score on the new cores; the emit→lint round-trip is the
load-bearing property (ADRs 136–142).

**P26 delivered 2026-06-23** — auto-skip phases craft evaluates as unnecessary: a pre-phase
**necessity** decision that generalizes the P19 runtime no-op into a cheaper *didn't-need-to-run*.
The resolver computes pure static **eligibility** as an additive `effective[].autoSkipEligible`
(`non-floor ∧ strand-clean ∧ ¬required` — no code-producing rule, no archetype allowlist; the four
floor phases and any strand-risking phase self-exclude, yielding `{decisions, review, refactoring,
validation, documentation}` over the default pipeline), and the walk runs the dynamic necessity probe
for eligible phases, recording a distinct fixed token `auto-skip: <phase> — evaluated unnecessary
(<signal>)` (separate from `WAIVER:` operator-skip and `NO-OP(<phase>):` ran-found-nothing). A new
per-phase manifest knob `phases.<id>.required: true` pins a phase to always run, with narrow precedence
(it defends only against auto-skip; an explicit `pipeline.skip`/`enabled:false` still wins, and
`skip`+`required` on one phase is a lint error). An auto-skipped executing-harness releases its
`propose`-gate via the recorded-no-op path. Pure `engine/src/autoskip.js` core composing
`checkStrandedConsumers`, an additive `Resolution` field in `resolve.js`, the `required` knob +
collision lint in `manifest.js`, and walk prose — **no new runtime port, no engine bin change**.
(During implementation the eligible-set truth table was corrected: `decisions` is strand-clean because
`planning` self-supplies it, so it is eligible.) ADRs 143–147.

**P27 delivered 2026-06-25** — de-specialize craft: no validation **technique** (mutation/Stryker,
dependency-cruiser) or VCS-host **CLI** (`gh`) name survives in any plugin-defining source
(`pipeline/ skills/ agents/ contracts/ templates/ engine/src/ docs/adapters/ docs/DOD.md
docs/GUIDE-customizing.md README.md`); concrete tools live only in consumer config, `examples/`, a
port's adapter binding, and the kept `// equivalent mutant` dogfood comments. The two executing-harness
phases (`validation`, `architecture`) collapse onto ONE generic gate-harness mechanism: an opaque
`harness.techniques` list knob (mirroring review's `dimensions`) validated fail-closed by a new
`validateTechnique`, an engine-emitted `harness.techniquePlan` (`deriveTechniquePlan`, mirroring
`deriveReviewPlan`; `isExecutingHarness` extracted to a shared `engine/src/exec-harness.js`), and a
skill that resolves its technique set by **declared → derived (README/CONTRIBUTING/config) → fallback
(language test-script) → clean no-op** precedence (ADR-149 reframed `validation` from a mutation-locked
phase into the project's general engineering harness; discovery is skill judgment, engine stays
agnostic). One generic `harness-triager` replaces both technique triagers; delivery (`propose`/`integrate`)
routes through the VCS port verbs `propose(title,body)`/`integrate(prUrl)` with `gh` confined to the
adapter binding. Breaking renames: `mutation-tool`→`validation-tool` memory concern (re-keyed on `id`),
`.craft-mutation.lock`→`.craft-validation.lock`; the `mutation→validation` phase alias removed (clean
break). A `test/source-hygiene.bats` grep-gate is the durable proof (reviewed allowlist for kept
evidence + the adapter binding). craft dogfoods via a committed `.claude/workflow.md` declaring its own
mutation technique. ADRs 148–155.

**Follow-ups delivered 2026-06-28** — activation of two mechanisms shipped but left dormant by the batched
backlog-clearing run: the **structured-DoD auto-assertion** is now wired into `validation` so a `kind: auto`
criterion is mechanically asserted against the run's recorded per-phase gate evidence (a fixed
`GATE(<phase.id>): green|red` token), with `judgment` criteria human-asserted and the non-blocking
`NO-OP(verify)` no-DoD path preserved; and the **structure linters now guard the live docs** —
`backlog-lint`/`design-lint` enforce `BACKLOG.md`, the migrated `templates/backlog.md`, and every
`docs/design/*.md` in `scripts/ci.sh`, not just the templates (ADRs 178–181).

**P29 delivered 2026-06-29** — usage telemetry miner: a new **Telemetry port** (`docs/adapters/telemetry.md`) with `collect`/`aggregate` verbs — `collect` parses transcript data into a vendor-neutral, path-free, PII-free `UsageEvent[]` stream (a `telemetry-claude.js` binding reads the Claude JSONL transcript format and hosts the per-model pricing table + `--prices` override); `aggregate` is a pure deterministic core (`engine/src/usage-aggregate.js`) consuming the stream and emitting a structured report. The per-run `.claude/craft-metrics.md` writer is upgraded to record the real `cache_read`/`cache_creation` split (previously lossy `cache=hit|miss`) by reusing the `telemetry-claude` line parser. A new standalone skill `craft:metrics` (zero-arg) mines transcript history and prints the usage report; the miner is advisory, never gating (ADRs 182–188).

| Phase | What | ADRs |
|---|---|---|
| P0 | Spikes SP1–SP8 — feasibility decisions | — |
| P1 | Characterization net + Node engine core + scenario goldens | — |
| P2 | `manifest-lint` hardened (later folded into Node core) | — |
| P3 | Rewire live walk + fold manifest validation into Node core | 009–012 |
| P4 | Generic vocabulary (concern-named phases + alias map) | 013–014 |
| P5 | Engine-owned contract injection + DESIGN split | 015–019 |
| P6 | Execution topology — `inline\|agent` + `solo`/`full`/`lean` + per-invocation args | 020–023 |
| P7 | Pipeline editing — skip / insert / reorder + verbatim-procedure dispatch (SC3) | 024–027 |
| P8 | Per-phase harness config (deep-merged knobs) | 028–031 |
| P8.5 | Rename **forge→craft** + namespace propagation | 032–036 |
| P9 | Agent/skill swap via manifest (contract injected around the swap; S2) | 037–040 |
| P9.5 | Hardening batch — live role probe, nested-lockfile, ci glob, full-engine mutation baseline (80%) | 041–047 |
| P10 | New default phases — optional `requirements` + `architecture` harness (default-off; S4/S5) | 048–053 |
| P11 | Backlog SoT abstraction — `{ file, custom }` two-source port (S6) | 054–060 |
| P12 | DX — `GUIDE-customizing.md` + injection catalog + lint-clean `examples/` | 061–064 |
| P13 | NFR hardening — bin mutation coverage + model-class matrix | 065–068 |
| P13.5 | Ban-enforcement boundary — free `--no-verify` (consumer discretion) | 083 |
| P14 | Derived-plugin extension surface (`extends:`; S7/G8) | 069–075 |
| P15 | Second-instantiation — non-tsgit Python/pytest repo, zero-manifest (SC5/G9) | 076–082 |
| P16 | Provider-agnostic — six port seams + Pi adapter PoC; **G13 met** | 084–092 |
| P17 | Pi adapter productized — `craft-pi` full 11-phase walk bin + live `tool_call` wrapper (first post-PRD candidate) | 093–095 |
| P18 | Walk/parallelism enforcement — resolver emits a `reviewPlan` on the review descriptor (passes/convergence now engine-enforced) + repeatable per-invocation `--harness` overlay; discharges ADR-064 | 096–099 |
| P19 | "Nothing to do" as a first-class phase outcome — `decisions` adopts clear ADR-aligned recommendations without escalating; both judgment phases record a greppable `NO-OP(<phase>):` no-op carried into the PR body | 100–103 |
| P20 | DoD-aware verification — optional DoD artifact (`docs/DOD.md` / `paths.dod`) folds into `validation` (default-ON); per-criterion assertion, warn-on-absence `NO-OP(verify):`, DoD subsumes (1)/(2), `paths.dod` lint-validated | 104–110 |
| P21 | Running craft in a loop — operator-owned outer-loop recipe (`/loop /craft:run` self-paced on the run-record verdict; headless `craft-pi` exit-code contrast); docs + `examples/loop/`, no engine change | 111–115 |
| P29 | Usage telemetry miner — new Telemetry port (`collect`/`aggregate`); `telemetry-claude` binding + per-model pricing table; deterministic `usage-aggregate.js` core; `.claude/craft-metrics.md` writer upgraded to real `cache_read`/`cache_creation` split; `craft:metrics` standalone skill (advisory, never gating) | 182–188 |

Per-part history lives in `git log`, `docs/archive/{DESIGN,PLAN}-P*.md`, and `docs/adr/` — not here.

**Standing invariants (the working contract):**
- **Data is the SoT, not prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
- Every phase is **dogfoodable** — runnable through `/craft:run` itself.
- Working style: part TDD, one part per dedicated agent (or session-direct for judgment-fused
  sweeps); 4-dimension review interleaved, every fix applied before the next; **CI green at every
  commit; `--no-verify` is the consumer's discretion, the craft gate is not.**

---

## Candidate phases (un-PRD'd — promoted from parked)

Beyond the PRD program. Real features, scoped but unscheduled — each is a coherent `/craft:run`.

**Intention self-governance + corpus single-source — delivered 2026-07-04** (`harness-hygiene-prune-gates`).
`docs/adapters/intention.md` now carries `subjects: [engine/src/intention*.js, engine/src/glob.js]`,
so the port dogfoods its own freshness guard (ADR-207). The living-corpus enumeration is
single-sourced behind `scripts/living-corpus.sh`, consumed by both `scripts/ci.sh` and
`test/intention-lint-ci.test.js` (ADR-208).

**Pre-completion hygiene gates + `craft:prune` — delivered 2026-07-04** (same run). Two
advisory-first lints (`engine/bin/{stub,prose}-lint.js`) run in `ci.sh` over the branch-diff
touched set: a stub-marker gate over touched source and a prose anti-slop gate over touched
docs (+ the PR body as a capability), governed by one `hygiene.gate: advisory|blocking`
manifest knob (default advisory, ADRs 210–212) with `STUB-WAIVE`/`SLOP-WAIVE` prose waivers.
`skills/prune/SKILL.md` is an on-demand, propose-never-dispose harness-prune review with
`contracts/core.md` as a fail-closed denylist (ADR-209; the five automation balloon axes were
put to the user and declined).

**Follow-ups surfaced this run (deferred, scoped):**
- **Wire `prose-lint` over the PR body at propose.** The bin accepts a PR-body file as a
  capability (proven by test); `skills/propose` is not yet wired to invoke it over the drafted
  body. One-line integration when wanted.
- **Promote the hygiene gates to blocking in `ci.sh`.** `hygiene.gate: blocking` is validated
  and the bins honor `--gate blocking`, but `ci.sh` runs them advisory-only (craft's own
  manifest declares no `hygiene` block). Wire `ci.sh` to the resolved knob once the marker-set
  and ban-list are tuned enough to hard-gate.
- **Shared `hygiene-lint-core` when a 3rd hygiene gate lands.** `stub-lint-main.js` and
  `prose-lint-main.js` share identical `parseArgs`/`collectWaived`/`isSelf`/`main` boilerplate;
  held at the YAGNI rule-of-three boundary (refactoring no-op this run). Centralize when a
  third gate makes the duplication bite.
- **`hygiene-lint` hardening (advisory-only exposures, reviewer LOWs).** An option-injection
  `--` end-of-options separator; waiver-path normalization (exact repo-relative match today); a
  `BAN_LIST` metacharacter-escape guard (the list is user-curated); an optional large-file size
  threshold. Batch when the gates go blocking.

_(Prior: the shrink-core-prune-guardrails run (2026-07-03) surfaced two candidates and
delivered both in the same PR: structured DoD criteria for `docs/DOD.md`, and the
drift-baseline refresh cadence documented in `skills/metrics/SKILL.md` + offered at
integrate.)_

P26 (auto-skip unnecessary phases) was the last promoted candidate and shipped 2026-06-23 — see the
**P26 delivered** note under Status above.

---

## Parked

### Condition-gated (do when the trigger fires)

- **Single-source the harness-knob type schema** (P18 refactor follow-up) — the knob vocabulary is
  encoded twice: `coerceHarnessValue` (CLI coercion, `pipeline-resolve-main.js`) and `validateHarness`
  (typing, `manifest.js`) both enumerate `passes`/`max_cycles`/`convergence`/`incremental`/`dimensions`.
  A shared knob→type map would let coercion and validation derive from one declaration. Deferred at P18
  as feature-sized (its own design); do it when a knob is added or renamed and the duplication bites.
  Re-evaluated 2026-06-28 (batched backlog-clearing run): still an honest no-op — the coerce/validate
  knob sets are structurally asymmetric and the trigger has not fired (a faithful single-source costs
  more abstraction than the duplication removes).
- **Repo-local memory hardening** (P22 follow-ups — surfaced by review/validation) — the memory port
  (`docs/adapters/memory.md`, ADRs 116–123) ships deliberate document-only / mechanism-only choices that
  leave clean upgrade paths: (a) the **`custom` memory adapter** binding is reserved in the `memory:` key
  but only `file` is built; (b) the content whitelist is **document-only** — a **reject-at-write + schema
  lint** is the documented upgrade if non-mechanical content (abs paths, secrets, prose) ever leaks in
  practice; (d) `evictToCaps` re-serializes per drop, an **O(n²) cap-shrink edge** (lowering a cap on an
  already-large store) a bulk-prune would fix (YAGNI at current bounded sizes); (e) **run-over-run
  measurement** has no smoke yet — an SC5-style on-demand smoke driving load→save→`.claude/craft-metrics.md`
  across two runs would prove the improvement loop end-to-end. None blocking; each is bounded by the
  advisory-cache premise (worst case wasted cost, never wrong correctness). _((c) load-time same-key
  dedupe shipped 2026-06-28 in the batched backlog-clearing run.)_
- **Interactive generator hardening** (P25 follow-ups — surfaced by review/validation) — `craft:init`
  shipped deliberate scope edges that leave clean upgrade paths: (a) **headless/answer-file interview
  mode** for `craft-pi`/non-Claude onboarding (interactive-only today; the interview is a conversation
  and `craft-pi` has no interactive stdin — ship when a concrete non-Claude onboarding need exists);
  (b) **merge-into-existing named config** (the generator direct-overwrites a named file today, never
  merges; precedence-aware frontmatter reconciliation is its own feature). None blocking; each is a
  bounded edge of an advisory-cost feature (worst case: a manual step, never wrong output — every emit is
  lint-gated before it lands). _((c) deterministic land helper + (d) `examples/named-config/` sample
  shipped 2026-06-28 in the batched backlog-clearing run.)_
- **Atomic-open path containment (TOCTOU / hardlink).** `engine/src/contain.js` closes the symlink-escape
  gap but returns the *lexical* path, so a symlink swapped into an ancestor between check and I/O, or a
  hardlink to an external file planted inside the root, is not caught (documented in the module header).
  Trigger: if the local advisory threat model ever hardens to untrusted multi-writer roots, replace the
  check-then-use with an atomic open (`O_NOFOLLOW`-style) and canonical-path I/O. YAGNI today (fixed
  roots; a planter could write the target directly).

### Closed — won't-do (rationale recorded)

- **DC-9 registered-phase model seed** — *resolved by design, not implemented.* The walk
  model-resolution chain (`models.<role>` → `descriptor.model` → `models.fallback` → engine
  default `sonnet`) already resolves a model-less registered phase via fallback. Seeding a fixed
  `model` into `foldRegisteredPhases` would shadow `models.fallback` (a flexibility **regression**);
  inheriting the replaced default's tier violates ADR-073 (full-replace = no field inheritance).
  A registered phase that wants a tier sets it in its own descriptor or via `models.<role>`.
- **P13.5 broader scope (ban-split across every rule)** — the headline `--no-verify` question is
  resolved (P13.5/ADR-083). The remaining bans (`git-no-ext-diff` difftastic safety; contract
  provenance / suppression / swallowed-error bans) are *correctly* engine invariants; splitting
  adapter-mechanism from engine-invariant for them is unwarranted unless a consumer needs it.
- **Live `gh`/`jira` round-trip E2E** for the custom backlog recipes — a real `gh issue close` /
  Jira transition mutates a tracker and needs credentials CI lacks. The recipes are pinned
  empirically (read-only probes) + prose; a gated opt-in test is the home if ever wanted.
- **`backlog.id-pattern` manifest knob** (machine-enforced `file` id-form) — ADR-060: `file`
  id-form stays orchestrator prose-judgment until a repo actually needs the machine check. YAGNI.
