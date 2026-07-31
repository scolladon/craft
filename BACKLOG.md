# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine, re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip /
> insert / reorder), strong zero-config defaults, a small invariant core, per-port
> customization.

> SoT — *intent:* `docs/contributing/prd/PRD-customizable-engine.md` · *architecture:* `docs/contributing/prd/DESIGN-customizable-engine.md`
> · *decisions:* `docs/contributing/adr/` · *build scripts:* `docs/contributing/archive/PLAN-*.md` · *spikes:* `docs/contributing/archive/SPIKE.md`

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
`docs/contributing/design/*.md` in `scripts/ci.sh`, not just the templates (ADRs 178–181).

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

Per-part history lives in `git log`, `docs/contributing/archive/{DESIGN,PLAN}-P*.md`, and `docs/contributing/adr/` — not here.

**Standing invariants (the working contract):**
- **Data is the SoT, not prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
- Every phase is **dogfoodable** — runnable through `/craft:run` itself.
- Working style: part TDD, one part per dedicated agent (or session-direct for judgment-fused
  sweeps); 4-dimension review interleaved, every fix applied before the next; **CI green at every
  commit; `--no-verify` is the consumer's discretion, the craft gate is not.**

---

## Candidate phases (un-PRD'd — promoted from parked)

Beyond the PRD program. Real features, scoped but unscheduled — each is a coherent `/craft:run`.

### Open (scoped 2026-07-30 — follow-ups surfaced by the orchestrator-tax-hardening run, not yet scheduled)

**Newline-delimited scope specs.** `parseScopeSpec` splits on `,`, so a legal path containing a
comma (`a,b.js:1-9`) splits into fragments. It fails LOUDLY today — the fragment `a` carries no
range and is rejected — so nothing is silently mis-scoped, but the path form is unsupported. The
spec is now written to a file before being read into a variable, so switching the delimiter to a
newline would remove the ambiguity at the root (paths cannot contain newlines). Deferred because
it deviates from ADR-305's ratified comma-joined form and wants its own decision.

**Locality-advisory specificity.** `plan-lint`'s cognitive-locality warning fires on 14 of 23
committed plans (49 warnings, 37 of them two-part overlaps). The calibration is recorded in
`docs/contributing/design/orchestrator-tax-hardening.md` and the composition is honest — the
overlaps are real — but 61% is above the bar the design itself set. If operators learn to ignore
the line, revisit the detector's specificity (never its advisory status): candidates are weighting
by whether the shared path is *edited* vs merely *referenced*, and skipping paths declared only
inside quoted snippets.

**Windows path separators in the boundary filter.** `canonicalPath` compares textually against a
hardcoded `/`, so `--repo-root` is inert on a Windows root (`C:\repo` yields the prefix `C:\repo/`,
which never matches) and `parseScopeEntry` rejects any colon-bearing whole-file path. Out of scope
while the toolchain is POSIX-only; the fix is separator normalization before comparison.

**Line-length cap reaches a new call-site.** The known O(n²) pipe-split in `parseLine` (tracked
below) is now reachable from third-party tool output, not just bounded reviewer text: the
validation digest pipes a technique's own output through it. Measured trigger is ≥10k contiguous
whitespace on one line (progress bars, column-padded reporters): 10k → 88ms, 40k → 2.5s. A
`cut`-style cap at the pipe was rejected — it would corrupt canonical JSON payloads, which are
commonly one long line — so the fix belongs in `parseLine` itself.

### Open (scoped 2026-07-27 — follow-ups surfaced by the docs-audience-split run, not yet scheduled)

**Prose-lint excuse coverage for `docs/contributing/plan/`.** The `run_prose_lint` excuse
globs in `scripts/ci.sh` cover `docs/contributing/{adr,design,archive,specs,prd}/*` but not
`plan/*`, and several plan docs legitimately quote ban-list words while documenting the lint
itself — so every ci run prints advisory `SLOP-FOUND` noise for them. Harmless under the
`advisory` default, a hard red the day `hygiene.gate` flips to `blocking`. One glob clause +
the `test/hygiene-gates-ci.test.js` case-arm regex extension (the pinned pair moves together).

**README corpus-count freshness.** `README.md` says "270 ADRs" and "18 design docs" while
the tree holds 289 and 21 — the counts drift on every run because nothing recomputes them.
Either fold live counts into the readme-drift recompute (it already pins the telemetry
claims) or drop the numbers for count-free phrasing.

**docs-lint small hardenings.** Two benign residuals from the audience-split review: the
`--audience` dedupe under-lists co-offenders when a top-level entry name contains a space
(a false pass stays impossible — allowlisted names are spaceless); and
`docs/contributing/plan/readme-drift-guards.md`'s metrics link is invisible to lychee via a
parser quirk in that heavily-backticked file, not the fenced-block rationale its prose
claims — a fence-rebalancing edit would expose it. Both are one-line fixes when touched.

### Open (scoped 2026-07-26 — follow-ups surfaced by the sp9-findings-adoption run, not yet scheduled)

**Line-length cap in the findings normalizer.** `parseLine`'s pipe-split
(`engine/src/findings.js`) is O(n²) on a single pathological line (a long whitespace run
before a trailing `|`): measured ~1.5s at 40k chars, ~40s at 200k. Pre-existing (the status
peel added no overhead) and reviewer-deferred: a cap rejects oversized lines up front, which
is a behavior change needing its own design line — the existing ReDoS tests only exercise
5k chars, so raise them past where the quadratic bites when the cap lands.

**Adapter agent-mirror sync tooling.** Six adapters mirror shared `agents/*.md` bodies
(copilot/codex/cursor/antigravity/opencode keep frontmatter + body, aider is body-only) and
their drift guards are byte-identity tests — so every shared-agent edit means six manual
syncs discovered one red suite at a time. A `scripts/sync-adapter-agents.sh` (or generating
the mirrors at test time) turns the guard's red into one command; the aider body-only +
leading-newline-strip variant is the trap to encode.

**findings.js mutation-baseline hardening.** The per-hunk validation run killed everything
in this change's hunks, but a full-file scoped run still shows ~20 pre-existing survivors
(regex constants, severity/finding trims, JSON-shape guards). One sitting with the repo's
established triage conventions (kill or document `// equivalent mutant (…)`) closes the
file's baseline gap.

### Open (scoped 2026-07-25 — follow-ups surfaced by the readme-drift-guards run, not yet scheduled)

**Scripted, CI-regenerable README demo.** A committed terminal-recording tape (e.g. a
charmbracelet/vhs script) that renders the decisions-checkpoint moment of a run into the
README's hero GIF deterministically — the demo is code, regenerated after UI changes with one
command, never a stale hand-recorded capture. Needs a live run to record against; pairs with
the drift-guard ethos (`docs/design/readme-drift-guards.md`): a demo that can be regenerated is
a demo that can be gated.

**Public front-door completion set.** The remaining world-class-README items scoped during the
2026-07-25 README revamp, each small but distinct: an honest comparison table vs adjacent
approaches (spec-driven kits, plain agent prompting); a devcontainer + cloud-IDE badge making
"try craft in 2 minutes" literal; community scaffolding (CONTRIBUTING.md with the local
`scripts/ci.sh` loop, SECURITY.md, issue templates incl. an adapter-request form); release
discipline (CHANGELOG, tagged releases, marketplace-version badge) so `plugin.json`'s version
stops being the only maturity signal.

### Open (scoped 2026-07-23 — follow-ups surfaced by the aider binding, not yet scheduled)

**Per-source zero-files note in the usage miner.** `usage-mine-main.js`'s `NO_FILES_NOTE`
is the hardcoded literal `no .jsonl transcript files found`, emitted verbatim under every
`--source` — including `--source aider`, whose transcript is `.aider.chat.history.md`, not
`.jsonl`. An operator debugging an empty aider mine sees a factually wrong filename. Cosmetic
and advisory-only (a zero-file mine already yields an empty report cleanly), so it was left out
of the aider binding's scope; the existing exact-string test pins the note for the claude/default
source. Follow-up: derive the zero-file note wording from the resolved per-source matcher (mirror
the `resolveFileMatcher`/`DEFAULT_READ_ROOTS` per-source seam) rather than the `.jsonl` literal.

**`--file` editable-targets surface in launch-args for edit-phases.** `buildLaunchArgs`
emits `--read` (read-only role/context) + `--message` but no `--file` (editable target), so an
incremental EDIT to an existing file relies on Aider auto-adding the target to the chat. A
full-pipeline dogfood (craft orchestrator driving Aider per-part to build Game of Life) confirmed
Aider reliably *creates* files but an edit-to-existing-file was unreliable — a weak local model
no-op'd on the edit even with `--file` spliced in (so a capable model is also required; the
missing `--file` surface is necessary-not-sufficient). Follow-up: add an optional editable-targets
parameter to `buildLaunchArgs` that emits one `--file <path>` per touched file for edit-phases,
keeping `--read` for role/context only. See the full-pipeline row in
`docs/adapters/aider-poc-record.md`.

### Open (scoped 2026-07-20 — follow-ups surfaced by the copilot binding, not yet scheduled)

**Lift the binding-neutral guard predicate to a shared home — delivered 2026-07-20**
(native-codex-binding). `engine/src/guards/tool-call-guard.js` is now the single home for
`toolCallGuard`/`WRITE_TOOLS`; pi and copilot both import it, and the codex binding does too. One
correction to the original framing: it did **not** end up with "all three bindings" importing the
lifted module — opencode never imported `adapters/pi/src/gate.js` in the first place and keeps its
own narrower `gitGuardPredicate`. The residual duplication this entry also flagged —
`COMPLIANT_MARKERS`/`GIT_DIFF_SHOW_RE`/`REASON_GIT_EXT_DIFF` copied verbatim between the (now
relocated) predicate and opencode's — **delivered 2026-07-21** (harden-prove-codex-binding, A1):
the three constants now live once in `engine/src/guards/git-ext-diff-predicate.js` (with
`gitExtDiffPredicate`); `tool-call-guard.js` imports it and opencode's `git-guard-predicate.js`
is a thin re-export (ADR-267). `REASON_GIT_EXT_DIFF` stays module-private (no external consumer).

**Deduplicate the acceptance-probe harness across four bindings — delivered 2026-07-21**
(harden-prove-codex-binding, A2). The four near-verbatim `adapters/{opencode,copilot,codex,pi}/src/probe.js`
copies now wrap one shared `engine/src/probe-harness.js` exporting
`runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs })` (ADR-266).
`portsExercised` was added to the original signature — it genuinely varies (codex binds no VCS
port: 3 ports vs the others' 4); `extraRunnerArgs` is a function of `targetPath` (copilot/codex
compute `launchArgs` from it, opencode/pi omit it). Each binding keeps its exported
`runAcceptanceProbe` signature unchanged, so the four `probe.test.js` suites stay green; the
harness gained executed mutation coverage in `engine/src/**` (96.55%).

**Mutation-cover the adapter sources — delivered 2026-07-20** (native-codex-binding). The original
prescription was a per-adapter `stryker.conf.json`; the ratified outcome is the opposite. A
per-adapter mutation config would invent a JavaScript-specific tool pattern at the adapter layout
level, which a future non-JS adapter would inherit nonsensically. Instead the consumer-level
`engine/stryker.conf.json` — craft-*the-consumer* declaring its own validation technique, not part
of the toolchain-neutral engine contract — grows both its `mutate` scope and its `tap.testFiles`
list together to cover the guard seams: `adapters/codex/src/{apply-patch-paths,execpolicy-rules,
git-guard-adapter}.js`, `adapters/copilot/src/git-guard-adapter.js`,
`adapters/opencode/src/{git-guard-adapter,git-guard-predicate}.js`, and
`adapters/pi/src/tool-call-hook.js`. `adapters/pi/stryker.conf.json` remains an orphan wired into
nothing — its cleanup is still a separate follow-up.

`tap.testFiles` names each covering test file directly rather than globbing `adapters/*/test/`. The
glob form was written first and did not survive its own first run: it pulls in the probe suites,
which spawn the real agent CLI, so on any machine with `pi` installed Stryker's dry run hung until
it timed out and the whole technique was unrunnable — the failure that had left this item marked
delivered without ever having executed. Per-source test files keep the run hermetic (18s) and cost
no coverage; `engine/test/mutation-config.test.js` pins the pairing in both directions and bans a
binding-wide adapter glob outright.

First run over the new scope: 306 mutants, 91.50%. The codex seams were triaged to 93.29% — the
`apply_patch` candidate-field and raw-string branches had been pinned only by `block: true`
assertions, which cannot separate "parsed, then contained" from "failed closed", so a patch
arriving in the `patch` or `text` field had no test proving the guard saw it at all.

**Provenance refs leak in `engine/src/observability/adapters/claude/` — delivered 2026-07-21**
(harden-prove-codex-binding, A3). The user ratified the BROAD option over the scoped one
(ADR-265): all `engine/src` is provenance-clean source, no engine-internal exemption. A new
`engine/test/source-hygiene.test.js` extends the guard to `engine/src/**` (pinning the 8 known
offenders positively and asserting a non-empty scan set), and all 15 comment refs across 8 files
(`claude/{telemetry,pricing}.js`, `manifest{,-harness,-vocabulary,-pipeline-edits}.js`, `gates.js`,
`observability/skip-signals.js`) were reworded to prose without the numbered reference
(comment-only, behaviour-preserving).

**Stronger destructive-git denial for the Copilot binding.** `--deny-tool` is **prefix matching on the
command string** (pinned live). `shell(git push)` blocks `git push --force origin main`, but
`git -C . push` and reordered flags like `git clean -df` slip past a literal pattern. The shipped set
enumerates realistic flag-order and long-form variants and documents the residual gap honestly, but
enumeration cannot cover interposed global options (`git -C`, `--git-dir=`, `-c k=v`). `shell(git:*)`
would close it completely but denies **all** git, breaking craft's own git-heavy workflow. Revisit if
Copilot ships a richer matcher, or via a wrapper that normalises argv before the guard.

### Open (scoped 2026-07-20 — follow-ups surfaced by the codex binding, not yet scheduled)

**Hook-trust for the codex binding — one finding closed, one mitigated; scriptable trust landed
2026-07-31 on codex 0.145.0.** Two findings on the original live probe (throwaway CODEX_HOME). The
over-blocking guard is closed. The untrusted-hook **fail-open is not**: it was reproduced on
0.145.0 and remains unchanged codex behaviour that craft cannot fix from the outside. What closed
is the blocker underneath it — trust had no scriptable write path, so the one-time mitigation could
not be automated. It now can. Both findings, in order:
- **DELIVERED — the guard over-blocked EVERY command (fixed, `fb4b922`).** The real codex
  `PreToolUse` payload is Claude-shaped (`tool_name:"Bash"`, `tool_input:{command}`, `cwd`;
  patches: `tool_name:"apply_patch"`, `tool_input:{command:"<patch>"}`), but the adapter expected
  codex-internal `exec_command`/`cmd` + patch in `input`/`patch`/`text`, so `adaptCodexEvent` threw
  on every real payload → fail-closed → blocked all commands. This is the exact "unit-green,
  live-broken" gap: all `adapters/codex/` unit tests passed against a fictional payload shape. Fix:
  read `tool_input.command`. Live-verified: benign `echo` ALLOWED, `git diff` BLOCKED with the
  ext-diff reason.
- **MITIGATED, not closed, 2026-07-31 on codex 0.145.0 — the fail-open stands; scriptable
  hook-trust now exists to work around it.** Re-probed in a throwaway `CODEX_HOME` (isolation proven
  by mtime-find over the real one: zero entries newer than the reference marker). Fail-open was
  reproduced first on 0.145.0 — an untrusted hook still silently no-ops, ground-truthed: the command
  ran and the hook never fired. That behaviour is unchanged. What changed is the write path.
  Trust is **not** a state file and **not** a DB row — it is a `config.toml` key. `hooks/list` over
  `codex app-server` (newline-delimited JSON-RPC on stdio) returns each hook's `key`, `currentHash`
  and `trustStatus`; writing `[hooks.state."<key>"] trusted_hash = "<currentHash>"` flips it to
  trusted. Shipped as `adapters/codex/bin/trust-hook.js`, with `--check` as a read-only verification.
  Proven live in **both** directions by ground-truth side-effect, not exit code: `git diff > OUT.txt`
  blocked (OUT.txt absent) and `git diff --no-ext-diff > ALLOWED.txt` allowed (file non-empty, real
  diff) — both checked deliberately, since this binding once shipped a guard that blocked everything
  while unit-green. `--dangerously-bypass-hook-trust` was never used. The earlier finding that
  `codex plugin add` drops the plugin's out-of-plugin `../../hooks.json` ref still holds on 0.145.0,
  so the guard must still be wired via `config.toml [hooks]`.
  **The shipped binary was then dogfooded end to end**, not just unit-tested: `--check` reported
  untrusted (exit 1) → trust wrote the table (exit 0) → `--check` reported trusted (exit 0) → a
  re-run was byte-identical → `git diff` was blocked with the guard's own reason and `git diff
  --no-ext-diff` ran. That dogfood **caught a real defect the unit suite could not**: the client
  closed the child's stdin after writing, and `codex app-server` treats stdin EOF as shutdown, so it
  exited having answered only `initialize`. Fixed by keeping stdin open and bounding the call with
  the timeout and kill instead; the fake child in the unit suite now models EOF-as-shutdown so the
  regression cannot return.

**Prove craft's shared skills load by reference on codex — re-probed 2026-07-31; STILL DISPROVEN,
stays OPEN (codex-0.145.0 limitation).** Two findings: (1) **manifest location bug, FIXED
(`b204182`)** — codex 0.144.6 `plugin marketplace add <root>` only reads
`<root>/.claude-plugin/marketplace.json`; the binding shipped a root `marketplace.json`, so the
marketplace never registered ("marketplace root does not contain a supported manifest"). Relocated +
README + regression test. (2) **by-reference shared-skill loading does NOT work (codex limitation)**
— even with the manifest fixed, `codex plugin add` COPIES the plugin into
`$CODEX_HOME/plugins/cache/…` and DROPS the `craft` entry's out-of-tree
`skills: "../../../../skills"` reference (the cached `.codex-plugin/plugin.json` carries no `skills`
field), so the 19 shared skills are absent. Local skills survive (`craft-codex`'s
`./skills/craft-run` is copied). The documented **symlink fallback** loads all 19
(`ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>`).

**Re-probe on 0.145.0 (2026-07-31): unchanged — re-pinned 0.144.6 → 0.145.0.** Ground-truthed this
time through the app-server's `skills/list` method rather than by inspecting the cache: **0 of 19**
shared skills load by reference, **19 of 19** load via the symlink fallback (registered as
`craft:<name>`). The cached `.codex-plugin/plugin.json` drops **both** `skills` and `hooks`. The
symlink fallback therefore stays documented as required, not optional. "Load by reference" is not
achievable on codex 0.145.0; re-check on the next minor version.

**Carry the credential-rotation caveat into every binding's probe record — scoped 2026-07-31, OPEN.**
Surfaced by the codex 0.145.0 re-probe. Every binding record documents isolation as an mtime-find
over the tool's real home directory, and that check is sound for filesystem writes — it reported
zero for every probe in that run. But probes that copy an `auth.json` into a throwaway home share a
**refresh token that rotates server-side on use**, silently invalidating the copy the operator's real
home still holds; the next real use fails and needs a re-login. No filesystem check can see this.
The codex record now carries the caveat. Scope, checked record by record rather than assumed: the
codex record is the only one that copies a rotating credential into a throwaway home. `copilot` ran
with zero credentials; `aider` seeds an env-var/file API key with no rotating refresh token;
`opencode`, `pi` and `antigravity` use `mktemp`/`env -i` throwaways with no credential seeding at
all; `cursor` symlinks the login keychain and already documents that a token refresh writes the
operator's own token back. So the item is not "add this to six records". It is: give `cursor` the
full caveat (it carries a partial one), and make the caveat a standing rule for any future probe
that seeds a rotating credential, with the practical mitigations — keep probe windows inside the
access token's lifetime, treat copied credentials as consumed, expect a re-login afterwards.

**Local marketplace source form in the codex README — delivered 2026-07-31.** Surfaced by the
0.145.0 re-probe. `codex plugin marketplace add` accepts "a local path, owner/repo[@ref], an HTTPS
Git URL, or an SSH Git URL", and a bare `adapters/codex` matches the **owner/repo shorthand** — so
0.145.0 resolved it to a remote clone of a non-existent repository instead of the local directory.
What was captured is the clone's own failure — `exit status: 128`, repository not found; the stall
beforehand is **inferred** to be interactive credential prompting (it fails fast with prompting
disabled), never observed directly. The README documented that bare form.
Fixed to `./adapters/codex` (an absolute path also works, but cannot be written literally in docs),
pinned in `adapters/codex/test/native-surface.test.js` on the `./` prefix itself — a pin requiring
only the substring `adapters/codex` would pass against the broken form. Recorded as observed 0.145.0
behaviour, **not** a regression: the bare form was never re-tested against 0.144.6.

**Measure what each codex sandbox mode actually blocks, per mode — delivered 2026-07-21**
(harden-prove-codex-binding, B8). Measured via real `codex exec -s <mode>` with ground-truth
side-effect checks (files created / loopback listener hits), corroborated by the persisted sandbox
policy JSON in the state DB. **read-only** blocks all writes + network; **workspace-write** (the
binding's selection) allows writes to the workspace cwd and `$TMPDIR` (`/private/tmp`), BLOCKS a
genuinely-outside write (e.g. `~`) and BLOCKS network; **danger-full-access** allows writes +
network. workspace-write is now a MEASURED containment posture: it contains genuinely-outside writes
and network, not merely a documented selection.

**Malformed `.rules` execpolicy fails OPEN at runtime — CONFIRMED + mitigated 2026-07-21**
(harden-prove-codex-binding, B9). Runtime auto-loads `$CODEX_HOME/rules/` (a directory of `.rules`
files); `execpolicy check` treats a malformed file as a hard error, but the codex binary carries the
literal runtime message `Error parsing rules; custom rules not applied.` — on a parse error the
rules are **not applied** (fail-open), so a forbidden command runs. Mitigation (`115bcce`, DC-3):
`assertRulesIntegrity(onDiskText)` byte-compares the deployed rules to `buildExecpolicyRules()` and
refuses on any drift (malformed included) — a hermetic, scriptable install/launch precondition that
catches a voided rules file before relying on the layer. (The committed-file drift-guard already
existed; this covers the deployed copy.)

**Clean up the orphaned `adapters/pi/stryker.conf.json` — delivered 2026-07-21**
(harden-prove-codex-binding, A4). Removed; `engine/test/mutation-config.test.js` gained a positive
pin (`existsSync(adapters/pi/stryker.conf.json) === false`) plus a sweep asserting no per-adapter
`stryker.conf.json` exists across the four binding dirs. `engine/stryker.conf.json` already covered
`adapters/pi/src/tool-call-hook.js` (ADR-263).

---

**`craft:tune` — feedback-driven config tuner (propose-diff) — delivered 2026-07-04** (`config-tuner`).
Closes the observe→improve loop `craft:metrics` left half-built, CQS-separate from the miner. The
miner gains a `phase-skip` recommendation from the `auto-skip:` run-record token (`skip-signals.js`,
plus a `role` field on the model-routing rec so the tuner maps straight to a role). A pure
`tune-plan.js` maps the two lint-clean signals — `model-routing → models.<role>` and repeated
`phase-skip → pipeline.skip` — to a proposed patch, and surfaces cache-hotspot / review-waste /
`drift[]` / recurring memory findings as advisory (no manifest knob exists for them). The `craft:tune`
skill resolves a **named** config two-scope, presents the diff, and lands through the same
emit→lint→`init-land` path `craft:init`/`craft:promote-config` use — never `.claude/workflow.md`, never
auto-applied (the human confirm is the gate). An SC-style two-run smoke (mine → tune → re-mine) asserts
the proposed route moved the flagged phase's priced cost. Retires the parked _Repo-local memory
hardening (e)_ gap.

---

**Portable named configs (user-scope resolution) + `craft:promote-config` — delivered 2026-07-04** (`portable-named-configs`).
Two-scope `--config` resolution via a new `config-resolve` bin (repo-local `.claude/craft-<name>.md`
wins → user `~/.claude/craft-<name>.md` → loud STOP naming both), mirroring the shipped
`craft-policy.md` `per-invocation > project > user` precedent. `craft:init` gains an interview scope
question (default local) + `--scope user|local` flag with a shadow-warn when a local same-name would
shadow a user-scope config. New `craft:promote-config` skill relocates a named config between scopes
(MOVE default, `--demote`, refuse-then-`--force`, lint-at-destination), with all branching in a pure
`promote-plan` module. Extracted shared `cli-io.js`.

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

**Hygiene-lint follow-up set — closed 2026-07-04** (design
`docs/design/close-hygiene-lint-followups.md`). All four follow-ups above delivered in one
change; the set is closed and the only thing left open is config, never code:
- **`prose-lint` over the PR body at propose** — `skills/propose/SKILL.md` now scans the drafted
  body advisorily under the same `hygiene.gate` knob, honoring `SLOP-WAIVE(<file>)`.
- **`ci.sh` wired to the resolved knob** — `ci.sh` resolves `hygiene.gate` via
  `engine/bin/hygiene-gate.js` and passes `--gate` (plus a `--` sentinel) to both bins. Craft
  stays advisory by choice; flipping to blocking is a one-line manifest edit
  (`hygiene.gate: blocking`), never code — the sole remaining open item, and it is config.
- **Shared `engine/src/hygiene-lint-core.js`** — extracted now (ahead of rule-of-three) so the
  shared hardening lands once; `{stub,prose}-lint-main.js` are thin adapters over it.
- **`hygiene-lint` hardening** — `--` end-of-options, waiver-path normalization, waiver-source
  read-error gating under blocking, dangling-flag validation, a large-file size cap (scanned
  files *and* waiver sources), and `BAN_LIST` metacharacter escaping — all landed with tests.

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
  as feature-sized (its own design).
  Re-evaluated 2026-06-28 (batched backlog-clearing run): still an honest no-op — the coerce/validate
  knob sets are structurally asymmetric (a faithful single-source costs
  more abstraction than the duplication removes).
  **Trigger:** a harness knob is added or renamed and maintaining the two enumerations bites — not yet fired.
- **Repo-local memory hardening** (P22 follow-ups — surfaced by review/validation) — the memory port
  (`docs/adapters/memory.md`, ADRs 116–123) ships deliberate document-only / mechanism-only choices that
  leave clean upgrade paths: (a) the **`custom` memory adapter** binding is reserved in the `memory:` key
  but only `file` is built; (b) the content whitelist is **document-only** — a **reject-at-write + schema
  lint** is the documented upgrade if non-mechanical content (abs paths, secrets, prose) ever leaks in
  practice; (d) `evictToCaps` re-serializes per drop, an **O(n²) cap-shrink edge** (lowering a cap on an
  already-large store) a bulk-prune would fix (YAGNI at current bounded sizes). None blocking; each is bounded by the
  advisory-cache premise (worst case wasted cost, never wrong correctness).
  **Trigger:** (a) a non-`file` memory backend is needed (bind a `custom` adapter); (b) non-mechanical
  content (abs paths, secrets, prose) ever leaks into memory in practice; (d) a cap is lowered on an
  already-large store. _((c) load-time same-key
  dedupe shipped 2026-06-28 in the batched backlog-clearing run; (e) run-over-run measurement retired
  2026-07-04 by the `craft:tune` mine→tune→re-mine smoke.)_
- **Interactive generator hardening** (P25 follow-ups — surfaced by review/validation) — `craft:init`
  shipped deliberate scope edges that leave clean upgrade paths: (a) **headless/answer-file interview
  mode** for `craft-pi`/non-Claude onboarding (interactive-only today; the interview is a conversation
  and `craft-pi` has no interactive stdin);
  (b) **merge-into-existing named config** (the generator direct-overwrites a named file today, never
  merges; precedence-aware frontmatter reconciliation is its own feature). None blocking; each is a
  bounded edge of an advisory-cost feature (worst case: a manual step, never wrong output — every emit is
  lint-gated before it lands).
  **Trigger:** (a) a concrete non-Claude onboarding need exists (`craft-pi`/headless, no interactive
  stdin); (b) merging rather than overwriting a named config becomes a real need. _((c) deterministic land helper + (d) `examples/named-config/` sample
  shipped 2026-06-28 in the batched backlog-clearing run.)_
- **Atomic-open path containment (TOCTOU / hardlink).** `engine/src/contain.js` closes the symlink-escape
  gap but returns the *lexical* path, so a symlink swapped into an ancestor between check and I/O, or a
  hardlink to an external file planted inside the root, is not caught (documented in the module header).
  **Trigger:** if the local advisory threat model ever hardens to untrusted multi-writer roots, replace the
  check-then-use with an atomic open (`O_NOFOLLOW`-style) and canonical-path I/O. YAGNI today (fixed
  roots; a planter could write the target directly).
- **opencode-binding follow-ups** (surfaced by design/review/validation, advanced by the 2026-07-18 live smoke) —
  the native opencode binding (`adapters/opencode/`) was run against a live opencode 1.18.3
  (`docs/adapters/opencode-poc-record.md`, verdict PASS on the free `opencode/north-mini-code-free` tier): the
  construction phase (Execution/Model/Gate/VCS), the config load, and the git-guard block are proven, and four
  layout/API defects it surfaced are fixed. Residual, still-open edges: (a) the **remaining live matrix** — the
  `opencode run --format json` event schema for the telemetry path, the depth-1 fan-out topology across multiple
  role subagents (the smoke ran a single brief, not the full role-dispatch walk), the instructions/skill-sourcing
  convention (config-relative `instructions` paths vs the repo-root manifest and adapter-root skill bodies), and
  wiring the plugin's `worktree`/`directory`/`$` context into the shell that backs a command template's
  shell-injection syntax (the shared root seam — now known feasible); (b) **git-guard fail-loud** — the command
  field is now pinned to `output.args.command` and verified, but extraction still fails OPEN (returns `''` → allow)
  if that field is ever absent; make it fail loud on a no-field miss so a future opencode API drift surfaces rather
  than silently disarming the guard; (c) **mutation coverage for `adapters/opencode/src/*`** — the pure seams are
  `node --test`-covered but not mutation-tested (no `adapters/opencode/stryker.conf.json`); the engine telemetry
  sibling is mutation-gated via the manifest, the adapter's own `src` is not. None blocking; each is a bounded
  edge of a now-live-proven binding.
  **Trigger:** (a) the next live opencode session captures a `--format json` transcript / drives the multi-role
  walk; (b) an opencode release changes the tool-event shape; (c) the adapter's pure seams grow enough that
  mutation coverage earns its config.
- **`MODELS_KEYS` omits `requirements-writer`** (surfaced by the opencode config part) —
  `engine/src/manifest-vocabulary.js` `MODELS_KEYS` lacks `requirements-writer` (one of the nine canonical
  roles), so a `models: { requirements-writer: … }` entry in any `.claude/workflow.md` fails `validateManifest`
  under BOTH the Claude and opencode bindings. Pre-existing — not introduced by the opencode port; a one-line
  set addition plus a vocabulary test.
  **Trigger:** someone needs to pin the `requirements-writer` model via a manifest `models.` entry.
- **Native Google Antigravity binding — two verdicts (2026-07-21).** The fifth binding attempt split
  in two at Phase 0. **(1) Port-binding adapter (the runnable codex/copilot analog): NO-GO** —
  **Antigravity 2.3.0 exposes no headless, scriptable, one-turn-and-exit agent invocation with
  machine-readable output** (the execution port every craft binding is built on). It is a GUI-first
  product (an Electron "Hub" + a separately-installed VS Code-fork IDE, both driving a Windsurf-lineage
  `language_server` / "Cascade" engine over a CSRF-protected private localhost RPC; Google-OAuth). Its
  `HEADLESS` env mode only pipes raw stdin to the LS with a log-line-only stdout — no turn schema. **(2)
  Customization declination: BUILT** at `adapters/antigravity/`. Antigravity's customization contract is
  documented and real, so craft's content was packaged onto it, driven by a human in the GUI (the Gemini
  agent invokes the `craft-run` skill and follows the workflow). Landed + CI-gated: 9 byte-identical role
  agents, a PreToolUse guard hook keyed on the PINNED payload (`toolCall.args.CommandLine`) that reuses
  the shared predicate and denies `git diff`/`show` without `--no-ext-diff` while allowing `echo`/`npm
  test` (both directions; the codex fail-closed-on-everything trap avoided), an entrypoint skill,
  `plugins/craft/hooks.json`, README + config template. Deny wire is `{"decision":"deny"}` on stdout.
  Ports with no pinnable contract (execution/launch-args, model-tier map, acceptance probe) were
  deliberately NOT built. Evidence pinned against the shipped artifact (`app.asar` source,
  `language_server` strings, one isolated live `--stamp` = `Built at CL: 947215217`,
  `//depot/branches/agy_ls_release_branch/2.3`). Full record: `docs/adapters/antigravity-poc-record.md`.
  **Trigger:** (a) a headless agent subcommand with machine-readable turn+tool events, or a documented
  local-API contract, unblocks the runnable port-binding adapter — re-run the Phase 0 gate first; (b) a
  GUI session through OAuth can close the declination's OPEN live rows (guard deny fired against a real
  tool call, `.agents/` load path + `enable-customization-skills`, `${CRAFT_ROOT}` hook env-var
  expansion, per-sandbox blocking, a captured `transcript.jsonl` token record).

- **Native Cursor binding — GO, full port-binding adapter (2026-07-22).** The sixth binding. Phase 0
  pinned the real `cursor-agent` contract LIVE (`2026.07.20-8cc9c0b`, isolated authenticated runs;
  full record `docs/adapters/cursor-poc-record.md`). Cursor ships BOTH load-bearing surfaces, so the
  runnable adapter was built at `adapters/cursor/`: headless port `cursor-agent -p --output-format
  json`, and an enforcing `.cursor/hooks.json` `beforeShellExecution` guard whose **stdout-JSON**
  `{"permission":"deny"}` blocks a non-compliant `git diff/show` — live-proven (denies the target,
  allows `echo`, NOT overridden by `--force`/`--yolo`; the fail-closed-on-everything trap avoided).
  The live payload carries the command at top-level `command` (NOT `tool_input.command` — the codex
  trap). Landed + CI-gated across 8 atomic commits: 9 byte-identical role agents (Cursor's
  `.cursor/agents` schema = `name`+`description` only — no per-agent model field, the Antigravity
  lesson), the guard reusing the shared git-ext-diff predicate, the manifest, a `craft-run` entrypoint
  skill, model-tier map (`opus→claude-opus-4-8-high`, `sonnet→claude-sonnet-5-high`, `haiku→composer-2.5`),
  launch-args, acceptance probe, telemetry pinned to a real rollout, README + config template.
  **Measured, not assumed:** the guard MUST stay `failClosed:true` (a crashing guard otherwise fails
  OPEN); a malformed `hooks.json` fails OPEN (install must validate); `--sandbox enabled` did NOT
  contain a shell write outside the workspace under `--force` (the guard is the enforcement layer);
  `.cursor/rules/*.mdc` + the shared skills/agents load by reference via symlink. Telemetry: Cursor's
  token counts are DISJOINT (Anthropic convention) and live only in the result envelope — the
  persisted transcript is token-LESS. Auth is macOS-keychain-bound and `$HOME`-derived, so isolated
  runs seed auth via a `Library/Keychains` symlink, not a file copy.
  **Open follow-ups (scoped 2026-07-22, not yet scheduled):** (a) write-path containment is not
  enforceable — Cursor has no pre-write hook (only `afterFileEdit`, post-hoc); revisit if Cursor
  ships a `beforeWriteFile`-style event. (b) `--source cursor` is deliberately NOT wired into the
  persisted-file miner (Cursor persists no tokens → it would always read zero, the silent-zero trap);
  wire it only if a live-result-envelope capture path is added. (c) Scriptable hook-trust and the
  one-workspace-went-quiet robustness edge (a workspace subjected to ~7 rapid differing-hook rewrites
  went silent; a fresh workspace restored firing) stay OPEN — craft installs one stable manifest, so
  neither affects production.

- **Native Aider binding — two verdicts (2026-07-23).** The seventh binding attempt. Aider is
  architecturally unlike its general-agent siblings: a focused edit loop, not a tool-calling agent
  a hook can intercept. **(1) Execution binding — GO.** A runnable adapter is built at
  `adapters/aider/`: role agents, a model-tier map, launch-args, first-class VCS posture (Aider
  auto-commits internally; the adapter resets on a red gate rather than trusting the exit code), an
  acceptance probe, and telemetry wired into the usage miner via `--source aider`. Measured pins:
  **exit code is NOT a success signal** (a hard LLM API error still exits `0` with no commit — the
  commit landing is the real result signal, and the commit is the handoff); the shell surface runs
  **unsandboxed**; the shared git-ext-diff predicate is **MOOT** (Aider drives git internally via
  GitPython, never shells `git diff`); auth is **env/file, not keychain** (litellm reads
  `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` from the process env — the Cursor keychain lesson does not
  transfer); attribution is disabled, so commits stay one-line conventional. **(2) Guard binding —
  NO-GO (declined honestly).** Aider ships no deny-capable pre-execution hook anywhere in its
  complete argparse surface — `--yes-always` auto-approves rather than gating, and Aider commits
  with `--no-verify` by default, bypassing even git's own pre-commit hook. No guard is built; the
  copilot/antigravity precedent applies. Full record: `docs/adapters/aider-poc-record.md`.
  **Trigger:** Aider ships a pre-tool deny-capable hook — re-run the Phase 0 guard gate.

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
