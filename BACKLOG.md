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

### Open (scoped 2026-10-16 — follow-ups surfaced by the native-surface-skills-title-fix run, not yet scheduled)

**ADR-253 still records that codex loads the shared skills by reference.**
`docs/contributing/adr/253-codex-shared-skills-by-reference.md:1` is titled "Codex loads shared craft
skills by reference" with status `accepted`, and its Decision chose the by-reference marketplace entry.
`docs/contributing/specs/codex-poc-record.md:332` marks that claim DISPROVEN on 0.145.0 and 0.162.1
(0 of 19 by reference; 19 of 19 through the `$CODEX_HOME/skills` symlinks), and
`adapters/codex/README.md:48` says the same. `git grep 'ADR-253'` finds no superseding ADR. Fix: a
user-ratified ADR that supersedes 253 with the symlink route (its option 3), keeping the
`adapters/codex/skills/` must-not-exist consequence.

### Open (scoped 2026-10-16 — follow-ups surfaced by the copilot-git-argv-normalising-guard run, not yet scheduled)

**Compose the destructive-git predicate into the codex hook.** `adapters/codex/src/execpolicy-rules.js`
discloses that `git -C . push` and `--git-dir=… push` bypass its `.rules` prefix match. The copilot binding
now judges normalised argv with `gitDestructivePredicate`; the codex guard hook does not compose it
(ADR-579 scoped it to copilot). Proof to run first: feed `adapters/codex/hooks/craft-guard.js` a
`git -C . push origin main` payload and confirm it exits 0 (allows). Then decide whether codex also
takes the plain-command gate.

**The Claude ext-diff hook shares the anchor and global-option gaps.** `hooks/git-no-ext-diff.sh`
(a separate bash matcher) allows `(git diff)`, `FOO=1 git diff`, `env/command/!/time git diff`,
`{ git diff; }`, `git --no-pager diff`, `git -p diff` and `git --git-dir .git diff` (pinned read-only in
the design doc's Pinned A table). Its crash contract (ADR-533…541) makes a rewrite its own change.

**A copilot-level differential fuzz arm.** The committed fuzz
(`engine/test/guards/shell-git-invocations.differential.test.js`) exercises the shared predicates only,
never `copilotGuard` and its plain-command gate, so it could not find the gate's idiom-smuggling and
command-position bypasses that review found by hand. Add a generator arm (idiom bodies, evaluator
builtins, redirect/reserved-word prefixes, unlisted wrappers) judged through `copilotGuard`.

**The fuzz goes red at scale on unclassified safe-direction false blocks.** With
`GUARD_FUZZ_SEEDS` set to fresh seeds and `GUARD_FUZZ_COUNT=1500`, 5-6 commands per 5-10 seeds fail the
census as "unexpected false block": git reached only through a short-circuited `&&`, a function defined
in a pipeline subshell, or a `cat <(…)` log race. The default seed stays green. Classify them (or make
the oracle wait for process substitutions) so the scale knob is usable as a gate.

**Craft's heredoc commit idiom fails under macOS `/bin/bash` 3.2 when the message holds an apostrophe.**
`git commit -m "$(cat <<'EOF' … don't … EOF)"` is a syntax error in bash 3.2 (reproduced locally and live
on copilot, which runs `/bin/bash`); bash 5 accepts it. The copilot guard allows the idiom; bash rejects
it. Document the workaround for bindings that shell out to bash 3.2 (multiple `-m "…"` with double
quotes), or pick a commit form both shells parse.

**Copilot `write_bash` into an interactive (pty) session is unprobed.** Copilot 1.0.98 ships a
`write_bash` tool (`{shellId, input}`) the guard never sees. Headless sessions have stdin at EOF, so
nothing reaches the shell (probed); an interactive session with a pty may differ. Probe it with a
throwaway home and a stub git before relying on the guard interactively.

### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet scheduled)

**Does the interactive codex TUI apply a malformed `.rules` file like `codex exec` or like the
app-server?** On codex 0.162.1 a malformed `$CODEX_HOME/rules/craft.rules` makes `codex exec`
refuse to start (fails closed, 3/3) while the app-server thread/turn path skips the rules and
runs the command (fails open, 3/3); record: `docs/contributing/specs/codex-poc-record.md`,
*Re-probe — codex-cli 0.162.1*. Which path the TUI takes was not probed. How to prove it: in a
throwaway `CODEX_HOME`, deploy the malformed rules, drive the TUI to run `git clean -f`
against an untracked file, and check whether the file survives. Question only; no fix is
scoped.

**Should a launch or install path call `assertRulesIntegrity`? — closed by decision, kept on demand, 2026-10-16**
(feat/rules-integrity-launch-wiring). `adapters/codex/src/execpolicy-rules.js` exports it and
`adapters/codex/test/execpolicy-rules.test.js` tests it, but `grep -rn assertRulesIntegrity`
matches nothing else: no bin, launch path or install step runs it, so a drifted or malformed
deployed rules file is caught only when someone invokes the check. The design that introduced
it (`docs/contributing/design/harden-prove-codex-binding.md`) asked for a launch precondition,
and none was wired. Open question: wire it into a launch or install path, or keep it on
demand. Question only; no fix is scoped.

**Decision (2026-10-16): kept on demand** (ADR-599, ADR-600).
`git grep -n assertRulesIntegrity -- adapters bin engine scripts` still matches only the
definition and its test. (i) The binding launches nothing: `buildLaunchArgs` builds argv only,
its sole caller is the conformance probe, and operators run `codex exec` themselves, so the
instruction to "wire it at the launch boundary"
(`docs/contributing/design/harden-prove-codex-binding.md` L421–436, B9) has no boundary to land on.
(ii) On that launch path, codex 0.162.1 already refuses to start on an unparseable rules file
(3/3). (iii) No install step deploys `craft.rules`, so a wired check would find the file absent
on every documented install. (iv) Byte drift on a valid file has not changed enforcement so far:
the rule body has been identical since `06e1983`, while a refusing check would refuse such a copy.
That holds only while the rule body stays unchanged: once `FORBIDDEN_GIT_SUBCOMMANDS` or the
generator changes, a stale deployed copy still parses and forbids less, codex warns about nothing,
and only the byte check catches it, so revisit this decision then. The gap codex misses today, an empty or comments-only copy that parses cleanly and forbids nothing
(`codex execpolicy check`, 0.162.1), comes from the copy step, so it moves to the deploy-step
entry below. Pinned matrix and design context:
[rules-integrity-launch-wiring](docs/contributing/design/rules-integrity-launch-wiring.md).

**No install step deploys `craft.rules` to `$CODEX_HOME/rules/`.** `adapters/codex/README.md`
lists the execpolicy `.rules` file as a guard layer (*Guard — honest enforcement profile* table),
but neither *Load* nor *Configure* tells an operator to copy `adapters/codex/craft.rules` into
`$CODEX_HOME/rules/`, the directory codex loads it from; `git grep 'CODEX_HOME/rules'` finds the
path only in the POC record and this file. Unless someone copies it by hand, the layer is absent.
Fix: one *Configure* step naming the copy, pinned like the other README instructions in
`adapters/codex/test/native-surface.test.js`. Measured 2026-10-16 (`codex execpolicy check`,
0.162.1): an empty or comments-only `craft.rules` parses cleanly and forbids nothing, so no
codex parse error flags a void copy, and the step that copies the file owns verifying what it
wrote. The same holds for a stale copy once the rule body changes: it parses and forbids less.

### Open (scoped 2026-10-14 — follow-ups surfaced by the stryker-9-upgrade run, not yet scheduled)

**The git ext-diff guard misses a diff/show its segment splitter or anchor never sees — delivered 2026-10-16**
(feat/copilot-git-argv-normalising-guard). `gitExtDiffPredicate` is rebuilt on a shared bash tokeniser
(`engine/src/guards/shell-tokeniser.js`), git global-option normaliser (`git-argv.js`) and invocation
anchor (`shell-git-invocations.js`): escapes, `( )`, `{ }`, `!`, `time`, `env`/`command`/`exec`, `NAME=v`
prefixes, quote removal and every git 2.54 global option are modelled, and a git invocation starts at
any word named git (ADR-580). Unparseable or unmodelled shell fails closed (ADR-582, ADR-594); the
parser is linear and capped at 131072 characters. Differentially fuzzed against `/bin/bash` and real git
(0 false allows over 30000 generated commands). Exotic adversarial shapes stay ext-diff residuals on
bindings other than copilot (the guard protects parsed output, not a sandbox). Original entry:
`gitExtDiffPredicate` (`engine/src/guards/git-ext-diff-predicate.js`) splits a command into
shell segments and blocks a segment that starts with `git … diff|show` and lacks `--no-ext-diff`.
Two gaps let a non-compliant call through (each reproduced against the predicate; each returns
`block: false` where the shell runs the diff):
- `splitSegments` (L36-55) ignores backslash escapes, so `\"` or `\'` opens a quote the shell never
  opens and swallows every later separator: `echo \"; git diff` and `echo \'; git diff`. The
  shell does split there (`bash -c 'echo \"; echo SECOND'` prints `"` then `SECOND`).
- `GIT_DIFF_SHOW_RE` (L13-15) is anchored at `^\s*git`, so a segment with anything else before
  `git` is skipped: `(git diff)`, `true && (git diff)`, `{ git diff; }`, `FOO=1 git diff`,
  `env git diff`, `command git diff`, `! git diff`, `time git diff`. Only command substitution is a
  documented residual today.
Not introduced by the Stryker move; found by its security review. The guard protects parsed output
from an external diff, not a sandbox boundary. Fix candidates: treat `\` + next char as a literal
pair outside single quotes; add `(`/`)` to the separators; accept `{`, `!`, `time`, `env`,
`command`, `exec` and `NAME=value` prefixes before `git`, or pin the ones left out as documented
residuals with `block: false` tests.

**Drop the `typed-rest-client` override once Stryker resolves past the exact `qs` pin.**
`engine/package.json` overrides `typed-rest-client` to 2.3.0 because 2.3.1 (picked under
`@stryker-mutator/core@10.0.0`'s `~2.3.0`) pins `qs` at 6.15.1, which carries GHSA-q8mj
(ADR-572). **Trigger:** a Stryker release whose `typed-rest-client` range admits a fixed `qs`, or a
`typed-rest-client` 2.3.x that unpins it. Then remove the override, `npm install`, and confirm
`npm --prefix engine audit` shows no Stryker-tree advisory.

### Open (scoped 2026-10-14 — follow-ups surfaced by the adapter-entry-symlink-guard run, not yet scheduled)

**`isEntryPoint` fails open when argv[1]'s symlink is swapped after the module loads — delivered
2026-10-14** (fix/entry-guard-symlink-swap-race). `isEntryPoint(import.meta)` now returns Node's own
`import.meta.main` and throws an error naming the supported range when it is undefined (ADR-563,
ADR-564); argv[1] is never read. `engine/package.json` declares `^22.18.0 || >=24.2.0`, a breaking
change (ADR-569). A committed preload swaps a test-made link while the entry's dependencies load
(ADR-567): `engine/test/bin-entry-swap-race.bin.test.js` (adr-lint) and
`adapters/codex/test/trust-hook.bin.test.js` (`--check`) assert exit 2 and that the swap fired
(ADR-566). Before the fix, repoint and unlink exited 0 with no output; after it, both exit 2.
Original entry:
`isEntryPoint` (`engine/src/cli-io.js:84-91`) real-paths `process.argv[1]` again after Node has
already resolved and loaded the main module. If that link is repointed or unlinked in between
(for example an upgrade that swaps a `current` link), the check returns false and the entry exits
0 with no output. For `adapters/codex/bin/trust-hook.js --check`, exit 0 means "trusted".
Reproduced in a sealed sandbox with a `module.register` load hook that swaps the link while
`trust-hook-main.js` loads: repoint and unlink both give `rc=0`, no output; the control gives
`rc=2`. Not a regression: before the adapter-entry-symlink-guard change, every symlinked run exited
0. It affects all 24 engine bins and both adapter entries. Fix candidate: prefer Node's own
answer, `import.meta.main ?? isEntryPoint(import.meta.url, process.argv[1])`. `import.meta.main`
is true when run and false when imported on Node 22.22.3, and undefined on older Node (engine
declares `>=18`). That needs an ADR on the real-path comparison (ADR-564 supersedes it), and a test
that reproduces the race.

### Open (scoped 2026-10-14 — follow-ups surfaced by the entry-guard-symlink-swap-race run, not yet scheduled)

**Stryker stays pinned to 8.7.1 for a Node floor the engine no longer declares — delivered
2026-10-14** (chore/stryker-9-upgrade). `@stryker-mutator/core` and `tap-runner` are exact-pinned at
10.0.0 (ADR-570 supersedes the P9-hardening DC-2a/2b; ADR-571), and a `typed-rest-client` 2.3.0
override keeps `qs` past its advisories (ADR-572): Stryker-tree `npm audit` advisories 15 → 0.
8.7.1 could not score on the supported 24 line: on Node 24.11.0 a narrowed `cli-io.js` run gives 0
killed and 28 errors, against 29 killed on 10.0.0 (Node 22, 24 and 25 alike). Full runs on Node
22.22.3: 8.7.1 scored 94.07% over 10141 mutants in 37m27s (under load); 10.0.0 scores 94.17% over
10312 in 30m34s. The shared survivor set is identical. Of the 171 empty-statement mutants 10.0.0
adds, 3 survived the full suite and now die to new tests, one of them a guard gap: a non-compliant
`git diff` before a `;`/`&&`/`|`/newline separator was untested. Design context:
[stryker-9-upgrade](docs/contributing/design/stryker-9-upgrade.md). Original entry:
the P9-hardening decisions (DC-2a/2b) chose `@stryker-mutator/core@8.7.1` because 9.x requires Node
`>=20` and the engine declared `>=18`. The engine now declares `^22.18.0 || >=24.2.0` (ADR-564), so
that reason is gone. Moving to 9.x is a separate change: it needs its own ADR against that decision
and a full mutation run to compare scores and timings with 8.7.1.

### Open (scoped 2026-10-14 — follow-ups surfaced by the bin-entry-symlink-guard run, not yet scheduled)

**Adapter entry points exit 0 silently when invoked through a symlinked path — delivered
2026-10-14** (fix/adapter-entry-symlink-guard). `adapters/codex/bin/trust-hook.js` and
`adapters/pi/src/cli.js` now guard `main` with `isEntryPoint(import.meta.url, process.argv[1])`,
imported directly from `engine/src/cli-io.js` (ADR-561). Each entry has its own behavioural link
test, and the pi literal-string pin is gone (ADR-562). `adapters/codex/test/trust-hook.bin.test.js`
and `adapters/pi/test/cli.test.js` spawn each entry through a test-made link, through npm's
extensionless bin link (pi), and from an importer script. Before the fix, the link tests failed
with exit 0; after it, codex passes 3 of 3 and pi 10 of 10. Original entry:
`adapters/codex/bin/trust-hook.js:54` and `adapters/pi/src/cli.js:4` still guard `main` with
`process.argv[1] === fileURLToPath(import.meta.url)`, the same defect the engine bins had (ADR-559
kept them out of that change). Through a symlinked checkout each exits 0 with no output; from the
physical path each exits 2 (design `docs/contributing/design/bin-entry-symlink-guard.md`, Out of
scope). Fix: import `isEntryPoint` from `engine/src/cli-io.js` (the adapters already import from
`engine/src/`), and rewrite `adapters/pi/test/cli.test.js:49`, which pins the literal guard string,
into a behavioural symlink check like `engine/test/bin-entry-symlink.bin.test.js`.

### Open (scoped 2026-10-14 — follow-ups surfaced by the claude-hook-foreground-stall-probe run, not yet scheduled)

**Engine bins exit 0 silently when invoked through a symlinked path — delivered 2026-10-14**
(fix/bin-entry-symlink-guard). All 24 bins now guard `main` with `isEntryPoint(import.meta.url,
process.argv[1])` from `engine/src/cli-io.js` (ADR-556), which then real-pathed both sides; only
`ENOENT` on argv[1] meant "not the entry point" (both behaviours superseded by ADR-564). `engine/test/bin-entry-symlink.bin.test.js`
spawns every bin through a test-made symlink and asserts it is loud (ADR-560). It failed 25 of 26
before the fix and passes 26 of 26 after. Original entry: every `engine/bin/*.js`
(24 of 24) runs `main` only when `process.argv[1] === fileURLToPath(import.meta.url)`. Node
resolves `import.meta.url` to the real path, while `argv[1]` keeps the symlinked one, so a bin
reached through a symlink (macOS `/var` → `/private/var`, a symlinked checkout or plugin dir)
never calls `main` and exits 0 with no output. Reproduced on a clone whose README claims 1
design doc: `bash scripts/readme-drift.sh .` from the `/var/…` path exits 0 silently; from the
`/private/var/…` path it prints `claims 1, tree holds 63` and exits 1. Any gate that shells out
to a bin from such a path passes without running. Fix candidate: compare real paths
(`realpathSync(process.argv[1])`), pinned by a test that invokes one bin through a symlink and
asserts a non-zero exit on bad input.

### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-timeout-probe run, not yet scheduled)

**Probe a Claude Code hook timeout while the hook is stalled in a foreground command — delivered 2026-10-14**
(fix/claude-hook-foreground-stall-probe). The call runs and Claude Code does not hang: at the
deadline Claude Code 2.1.299 sends SIGTERM to the hook's whole process tree (by parent pid, not
by process group), so a foreground `sleep` died, the deferred TERM trap ran and its crash deny was
ignored (2/2), and a tree that survived TERM was SIGKILLed about 1.2–1.7 s later (2/2 timed
rows; a coarser third agrees); the model saw a clean result every time (live `claude -p` probe, 5 haiku turns, a 3 s
`timeout`). Nothing the hook can act on, so the change is document-only: the hook header and the
gate spec drop the "not probed" qualifier and state the tree TERM and the SIGKILL escalation
(ADRs 551-555).
Design context: [claude-hook-foreground-stall-probe](docs/contributing/design/claude-hook-foreground-stall-probe.md).

### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-nonzero-exit-probe run, not yet scheduled)

**Probe what Claude Code does when a PreToolUse hook times out — delivered 2026-10-13**
(fix/claude-hook-timeout-probe). At a hook's `timeout`, Claude Code 2.1.296 sends SIGTERM, then
runs the Bash call whatever the hook exits with or prints, and the model sees a clean result: the
TERM trap's crash deny (3/3) and a JSON deny printed from the TERM trap (1/1)
were both ignored (live `claude -p` probe, 6 haiku turns, a 3 s `timeout`). Nothing the hook does
after the deadline is read, so the change is document-only: the hook header and the gate spec now
list the timeout as fail-open, and the TERM and HUP traps stay, denying either signal from any
other sender.
`hooks/hooks.json` sets no `timeout`, so the documented 600 s default applies (ADRs 546-550).
Design context: [claude-hook-timeout-probe](docs/contributing/design/claude-hook-timeout-probe.md).

### Open (scoped 2026-10-13 — follow-ups surfaced by the codex-hook-nonzero-exit-probe run, not yet scheduled)

**Probe whether the cursor guard fails open on a crash — delivered 2026-10-13**
(fix/cursor-hook-nonzero-exit-probe). The cursor guard has the codex static-import gap: with its
engine predicate unresolvable it exits 1 with no stdout. cursor-agent 2026.07.20-8cc9c0b blocks
that call under the shipped `failClosed: true`, as it does exit 127 and a SIGKILL death; exit 2
denies whatever `failClosed` says (live `cursor-agent -p` probe, 5 turns; the matrix and the hook
branch order are in the POC record). No fail-open is proven, so the guard is not hardened;
`failClosed: true` stays load-bearing and test-pinned. Still fail-open, as already recorded: an
install without `failClosed`, and a malformed `hooks.json` (ADRs 543-545). Design context:
[cursor-hook-nonzero-exit-probe](docs/contributing/design/cursor-hook-nonzero-exit-probe.md).

**Probe whether the Claude Code guard hook fails open on a crash — delivered 2026-10-13**
(fix/claude-hook-nonzero-exit-probe). Claude Code 2.1.296 runs the Bash call on hook exit 1
(3/3), exit 127 and a SIGKILL death, and the model sees a clean result; only exit 2 denies (live
`claude -p` probe, 8 haiku turns). `hooks/git-no-ext-diff.sh` now turns every failure bash can see
into exit 2 with a `craft git-no-ext-diff:` reason: an EXIT trap, TERM and HUP traps, a
`verdict_reached` flag, feed sentinels, and a matcher that allows only on grep's exit 1 with a
printed zero count (which also closes a pipe-buffer SIGPIPE allow on large commands). With `jq`
missing, every Bash call is denied; the README now names `jq` as a requirement. Still fail-open:
`/bin/bash` missing, the hook file missing, SIGKILL or another untrapped signal (ADRs 533-542).
Design context:
[claude-hook-nonzero-exit-probe](docs/contributing/design/claude-hook-nonzero-exit-probe.md).

### Open (scoped 2026-10-12 — follow-ups surfaced by the codex-hooks-quote-plugin-root run, not yet scheduled)

**Probe what codex does with a hook that exits neither 0 nor 2 — delivered 2026-10-13**
(fix/codex-hook-nonzero-exit-probe). codex-cli 0.161.0 runs the tool call on every hook exit
status except 2, and on a signal death (offline fake-provider smoke; the matrix is in the POC
record). The guard now turns any crash it can see into exit 2 with a `craft-guard:` reason: its
dependencies load inside the try, and process handlers deny an uncaught throw, an unhandled
rejection, and an event loop that drains with no verdict (ADRs 518-521). What no in-guard code
can catch still fails open and is written down in the codex README: `node` missing from
`PATH`, the guard file unloadable, a signal, a throwing `NODE_OPTIONS` preload. Design context:
[codex-hook-nonzero-exit-probe](docs/contributing/design/codex-hook-nonzero-exit-probe.md).

**Commit a differential test for the codex trust matcher — delivered 2026-10-13**
(chore/codex-trust-matcher-differential-fuzz). `adapters/codex/test/hook-trust-differential.test.js`
generates 2000 commands at a fixed seed (grammar fragments plus edits of the known bypass
witnesses), keeps the 75 that `selectCraftHook` trusts, and runs each under sh, bash, dash and zsh
with a stub `node`. A command passes only when the stub ran once on one rooted guard path, the
shell relayed the stub's exit status, the stdin, stdout and stderr sentinels arrived intact, the
exported env equals the shell's own baseline, and nothing was written outside its run directory.
Fourteen single-rule matcher reverts each fail it; HEAD passes with no differential. A shell
missing from `PATH` skips its own leg with a reason, and CI now installs zsh (ADRs 523-532). Design
context:
[codex-trust-matcher-differential-fuzz](docs/contributing/design/codex-trust-matcher-differential-fuzz.md).

### Open (scoped 2026-10-12 — follow-ups surfaced by the backlog-sweep-hooks-quote-dev-tools run, not yet scheduled)

**`adapters/codex/hooks.json` carries the same unquoted plugin-root path — delivered 2026-10-12**
(codex-hooks-quote-plugin-root). Proven first: codex-cli 0.161.0 runs a hook command as
`<login shell> -c <command>`, the shell taken from the user database with `$SHELL` ignored
(offline fake-provider smoke, no auth copied). From a spaced root, zsh runs the unquoted form but
bash, sh and dash split it. Both registrations now quote the whole path (ADR-512, literal TOML
string per ADR-513), and `trust-hook`'s matcher accepts that one double-quoted operand. Review
then proved the matcher's own contract leaky; it is now an allow-list: a bare or absolute `node`,
one operand rooted at `/` or at the shim plus `/`, path characters only (ADRs 514, 515, 517;
`/proc/self/cwd` aliases bounded as a non-goal beside the accepted `..` traversal case). A live run
trusted the quoted hook and the guard denied `git diff` with no bypass flag. Design context:
[codex-hooks-quote-plugin-root](docs/contributing/design/codex-hooks-quote-plugin-root.md).

### Open (scoped 2026-10-12 — follow-ups surfaced by the public-front-door-completion run, not yet scheduled)

**Quote the plugin-root placeholder in `hooks/hooks.json` — delivered 2026-10-12**
(backlog-sweep-hooks-quote-dev-tools). The three commands now double-quote the whole path,
`"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/<script>.sh"` (ADR-508). Exec form was rejected
because it has no shell to expand the `CRAFT_ROOT` override (ADR-217). `claude plugin validate .`
reports no hooks warnings. `test/hooks.test.js` expands each registered command under `sh -c`
from a plugin root containing a space, with `CRAFT_ROOT` unset and set. Design context:
[backlog-sweep-hooks-quote-dev-tools](docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md).

**CI installs `bats` and `yq` that nothing runs — delivered 2026-10-12**
(backlog-sweep-hooks-quote-dev-tools). The user chose to drop both (ADR-509).
`scripts/install-dev-tools.sh` now installs only `shellcheck` and `jq`. The yq download, the
checksums and the architecture probe are gone, along with their tests. The orphaned
`test/helpers/{hooks,worktree,manifest-lint}.bash` are deleted. The inline-install guard covers
apt only (ADR-510), and the devcontainer smoke no longer checks yq (ADR-511). Design context:
[backlog-sweep-hooks-quote-dev-tools](docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md).

### Open (scoped 2026-10-12 — follow-ups surfaced by the provenance-sweep-part-two run, not yet scheduled)

**A step id still sits in a test title — delivered 2026-10-12**
(test/memory-port-doc-title). The `test/memory-store.test.js` title "Given the memory port doc
was authored in S4" now reads "Given the memory port doc ships under the contributing specs",
which states what the test checks without the step id. Class E (ADR-490) still does not match
`S\d+`: `engine/test/scenarios.test.js` uses `S1`–`S9` as scenario names it defines itself, so
no narrower rule is added. Design context:
[provenance-sweep-part-two](docs/contributing/design/provenance-sweep-part-two.md).

### Open (scoped 2026-10-12 — follow-ups surfaced by the backlog-sweep-six-entries run, not yet scheduled)

**Single-letter rule ids still sit in shipped code comments — delivered 2026-10-12**
(chore/provenance-sweep-part-two). `R10` (`engine/src/findings.js`) and `F6`
(`engine/src/observability/adapters/claude/telemetry.js`) are dropped from their comments, and
the `R3` comment in `engine/src/observability/metrics-line.js` states the composition-root rule
in words. Class E's shipped-code scan gains a `(?-i:[RTF]\d+)` token, case-sensitive inside the
case-insensitive scan, so `-f2-` in `scripts/run-ledger.sh` and a lower-case `r1` are not
reported (ADR-489). The seven test lines citing `R10` or `F6` say what they pin without the id
(ADR-492); the other test-side single-letter ids, and the `R1`–`R3` rule names in
`test/architecture-boundaries.test.js`, are unchanged. Design:
[provenance-sweep-part-two](docs/contributing/design/provenance-sweep-part-two.md); ADR-489–492.

**Provenance refs in tests are unguarded — delivered 2026-10-12**
(chore/provenance-sweep-part-two). The 46 test comments and titles carrying provenance are
reworded to give the reason, along with three assert messages, three fixture headings and two
example-data lines that read as refs. Class E now also scans `engine/test`, `test` and
`adapters/*/test`, reporting a hit only on a comment line or a line-anchored
`test`/`it`/`describe` title, with no allowlist; the 146 remaining hits are fixture data
(ADR-490). `test/p10-structure.test.js`, `test/p20-dod.test.js` and `test/p22-memory.test.js`
are now `test/plugin-structure.test.js`, `test/repo-dod.test.js` and `test/memory-store.test.js`,
and the `subjects:` of ADR-436 and ADR-449 follow (ADR-491). Design:
[provenance-sweep-part-two](docs/contributing/design/provenance-sweep-part-two.md); ADR-489–492.

### Open (scoped 2026-10-11 — follow-ups surfaced by the stub-lint-ci-self-reference run, not yet scheduled)

**A waiver token quoted in prose is a live waiver — delivered 2026-10-12**
(fix/waiver-mention-not-waiver). `collectWaived` in `engine/src/hygiene-lint-core.js` now
counts a waiver only on a line that starts at column 0 with the token followed by `: <reason>`
(non-empty), outside a fenced code block (ADR-479, ADR-482, ADR-483). The core composes that
anchor around each gate's bare pattern, so the gate constants and call sites are unchanged
(ADR-481). The fix covers `STUB-WAIVE`, `SLOP-WAIVE` and `DECISION-CITE-WAIVE`, since all three
reach the same function (ADR-480). Fences use a line-based CommonMark subset: CRLF-safe, with
the closer indented at most max(3, opener indent) columns (ADR-484). The 962 tracked `.md`
files now yield 0 live waivers, down from 83 raw matches. A differential fuzz against
markdown-it leaves two accepted fail-open classes, both needing a fence that is not a fence or
is left unclosed. Design:
[waiver-mention-not-waiver](docs/contributing/design/waiver-mention-not-waiver.md);
ADR-479–484.

**Residual prose-marker findings in tracked source — delivered 2026-10-12**
(fix/residual-prose-markers). The six non-self-reference hits are reworded comments now: prose
"stub" in `engine/src/hygiene-lint-core.js` (module header and `MAX_FILE_BYTES` note) and
`engine/src/hygiene-gate-main.js`, and prose "placeholder" in `engine/src/gates.js`,
`adapters/pi/src/run.js` and `engine/src/observability/adapters/aider/telemetry.js`.
`stub-lint` prints nothing for all six files. The marker set and the case-insensitive rule
(ADR-210) are unchanged, and no identifier was renamed.

### Open (scoped 2026-10-11 — follow-ups surfaced by the transient-model-retry run, not yet scheduled)

**Four process suites each carry their own region slicer — delivered 2026-10-11**
(test/centralise-region-slicer). One helper, `test/helpers/region-slice.js`, replaces the four
copies, and its own suite is `test/region-slice.test.js`. There were 38 call sites, not 4. No
single join kept all four suites green, so the helper has two shapes (ADR-472): `sliceRegion`
returns the exact lines joined with `'\n'`, which the concepts Sources bullet count needs for
its `^…/m` anchor, and `sliceProse` collapses whitespace for the word-wrapped pins in
run-record and model-retry. "From the top" and "to the end" are now the `FROM_TOP` / `TO_END`
sentinels (ADR-473). A start or end pattern that is given but not found fails the assertion.
A `null`, `undefined`, string or omitted boundary throws `TypeError`, which also closes a
second widening path: run-record's slicer used to slice to EOF when the end argument was left
out. Before switching to fail-loud, every call site that used to widen was checked against
its target file. Each end marker exists, so no hidden false pass was exposed.

**Capture the error text the Task tool surfaces on a real 529.** The transient-overload retry
classifies on the strings the Claude Code bundle uses (`529`, `overloaded_error`, `Repeated 529
Overloaded errors`, the "high load … switch to Sonnet" off-switch), read from CLI 2.1.296 with
`strings`. The text the session actually receives from a dead spawn was never captured. On the
next real overload, save that text and check it against the classification in
`skills/run/SKILL.md`.

### Open (scoped 2026-10-09 — follow-ups surfaced by the harder-decisions-fork-fixture run, not yet scheduled)

**`ci.sh` lint chain fails open — delivered 2026-10-09** (fix/ci-lint-chain-fail-closed). The
static lints moved to `scripts/static-lints.sh`, which has its own `set -euo pipefail` and runs
one statement per line. `ci.sh` calls it as a bare line (ADR-429, ADR-430). In the old
`&&` list, seven of the ten lints failed open: shellcheck, pipeline-lint, pipeline-resolve,
contracts-lint and the three `docs-structure-lint.sh` calls. Now every failing lint stops the
build with that lint's own exit status.

`test/static-lints-ci.test.js` copies the shipped script into a mktemp throwaway with stubbed
lints and appends one trailing statement (ADR-432). The trailing statement is needed because a
`&&` list that ends its own script already propagates its status. The test fails each of the ten
positions in turn (ADR-431). It was 9 of 10 red against a verbatim move of the old list, and
12 of 12 green after the fix. It also pins `ci.sh`'s bare call and its errexit. Bash 3.2 is
pinned locally; CI's ubuntu run is the first bash 5 run.

**`docs-structure-lint.sh --audience` fails from a symlinked repo path — delivered 2026-10-09**
(fix/docs-structure-lint-symlink). Line 21 now resolves the directory with `pwd -P`, so both sides
of the prefix strip are physical paths. `test/docs-structure-lint.test.js` runs `--audience`
through a symlink to a mktemp throwaway repo: exit 2 before the fix, exit 0 after. Original
report: line 20 takes the root from `git rev-parse --show-toplevel`, which returns the resolved
path. Line 21 builds the
directory with `cd "$dir" && pwd`, which keeps the logical path. Under a symlinked checkout
(macOS `mktemp -d` → `/var/folders/…`, where `/var` → `/private/var`), the line-22 prefix strip
misses, and `--audience docs` exits 2 with "unexpected top-level entry under docs: docs".
Reproduced 2026-10-09 from a clone of the branch: exit 2 from the symlinked path, exit 0 after
`cd -P`. This is the exit 2 the fail-open entry above observed. Since that entry's fix, the exit
stops `ci.sh` instead of being masked. Fix: resolve both paths the same way (`pwd -P` at line
21), with a test that runs `--audience` from a symlinked throwaway.

**Prune review: the decisions skill's escalation path — delivered 2026-10-10**
(chore/prune-decisions-escalation). `craft:prune` proposed one candidate, ratified: the
escalate-when conditions and "when in doubt, escalate" are cut from `skills/decisions/SKILL.md`;
any candidate the adopt rule does not admit is a genuine fork. ADR-433 records the partial
supersession. The adopt sentence and the `NO-OP(decisions):` path are unchanged. with-craft / bare / Δ
over three runs per arm after the cut (Claude Code 2.1.296, session at opus, judge sonnet):
`decisions-escalates-fork` 1.00 / 1.00 / 0.00 (USD 0.91), `decisions-noop-when-clear`
1.00 / 0.50 / +0.50 (USD 1.01; the bare arm writes no ADR). Every with-only grader passed 3 of 3.
No fixture covers a clear, ADR-aligned recommendation over a real user trade-off.

### Open (scoped 2026-10-06 — follow-ups surfaced by the plugin-eval-suite run, not yet scheduled)

**Suite pilot and grader calibration for the behavioural eval suite — delivered 2026-10-06**
(fix/eval-grader-calibration). Every case ran once in both arms; the costs, Δ values and
settled observations are in `docs/contributing/maintainer-smokes.md` § Behavioural eval suite
(trigger invocation USD 0.81, phase and agent invocation USD 1.96). Three graders scored a
correct craft output as a failure and were recalibrated. `workflow-engaged` demanded two named
stages, but without a shell the run skill stops at its first step: it now accepts a stop at a
workflow step, and the `run-fires-*` cases seed a `greet.sh` so the bare model's ad-hoc edit is
visible (Δ 0.00 → +1.00). `findings-shape` demanded a `file:line` and an upper-case severity,
which a missing-test finding cannot cite and the agent does not always write. `tdd-parts`
failed a valid plan on a two-clause criterion and was split into one grader per clause
(Δ −0.50 → 0.00). Two procedure corrections: `--allow-tools` reaches every case in an
invocation, so the trigger cases now run in their own invocation without it; a fresh worktree
needs `npm ci` in `engine/` before any run. Still unconfirmed: whether craft's hooks load in
the eval child.

**Harder fixture for `decisions-escalates-fork` — delivered 2026-10-09**
(fix/harder-decisions-fork-fixture). The fixture's design doc no longer ends its Why cell with
"a product call no ADR covers"; the trade-off itself stays. with-craft / bare / Δ, before → after:
1.00 / 1.00 / 0.00 (suite pilot 2026-10-06, 1 run per arm) → 1.00 / 1.00 / 0.00 (pilot, 1 run
per arm, USD 0.31) and 1.00 / 1.00 / 0.00 (3 runs per arm, USD 0.92; Claude Code 2.1.295,
session at opus, judge sonnet). Every grader passed 3 of 3 in both arms; there was no FAIL to
read. Every bare run escalated on its own, noting that the Why cell argues against the
recommended option and that Requirement 1 covers only a terminal. This is the prune evidence
maintainer-smokes "Reading results" asks for, for the decisions skill's escalation path;
nothing is pruned here, and the case stays for its with-only `no-false-noop` grader.

**The planner labels an already-passing test as RED — delivered 2026-10-08**
(fix/planner-red-label-audit). `agents/planner.md` now says a RED fails against the code as it
stands at its step, a test that already passes is a `GUARD` entry (never RED), a new-behaviour
test comes before the GREEN that satisfies it, and no step breaks code to watch a test fail;
`templates/plan.md` names the `GUARD` entry. Review found `contracts/construction.md` still
required every test written first to fail, so it now runs a planned `GUARD` as passing and the
part-implementer handback reports each `GUARD`. `planning-plan-lints` with-craft / bare / Δ per
agent tier, before → after: opus 1.00 / 1.00 / 0.00 → unchanged, sonnet 1.00 / 1.00 / 0.00 →
unchanged, haiku 0.67 / 0.89 / −0.22 → 1.00 / 1.00 / 0.00. RED labels by hand (the judge cannot
see them): 7 of 19 with-craft plans clean before (C1 5, C2 8, C3 6), 8 of 9 after (one haiku plan
leaves a passing test unnamed in a RED step; one more haiku plan is a borderline read), which
meets the design's 8-of-9 rule only at the threshold. Haiku never writes the `GUARD` token
(0 of 3). USD 6.85 for the before and after runs.

**Measure the part-implementer on a plan with `GUARD` entries — delivered 2026-10-09**
(feat/implementer-guard-eval). `evals/implementer-runs-guards` hands `craft:part-implementer` a
one-part plan with a `GUARD` that fails on arrival, a RED and a passing `GUARD`, prepended with
the assembled construction contract; nine graders, three of them `llm`, validated by a faithful
replay (18 of 18 grades matched the hand read). Per agent tier, with-craft / bare / Δ over three
runs: opus 0.57 / 0.29 / +0.29, sonnet 0.57 / 0.29 / +0.29, haiku 0.86 / 0.29 / +0.57. No run
broke code or attempted a git revert to watch a test fail. The arrival rule did not hold: opus
and sonnet handed back a blocker on the failing `GUARD` in every run, haiku wrote its GREEN but
never reported the plan mismatch. USD 3.77, pilots and replay included.

**State the arriving-`GUARD` rule in the construction contract — delivered 2026-10-09**
(fix/arriving-guard-contract-rule). Line 1 of `contracts/construction.md` now confirms a `GUARD`
"passing for its stated reason" only when it passes on its first run, and says a `GUARD` that
fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, note the plan
mismatch as a deferred observation, not a blocker. A planned RED that passes stays a blocker.
`engine/test/contract-equivalence.test.js` pins the new clauses, and pins the eval grader's
phrase with its exact casing. `implementer-runs-guards` with-craft / bare / Δ per agent tier,
before → after (3 runs per arm): opus 0.57 / 0.29 / +0.29 → 1.00 / 0.29 / +0.71, sonnet
0.57 / 0.29 / +0.29 → 1.00 / 0.29 / +0.71, haiku 0.86 / 0.29 / +0.57 → unchanged. Opus and
sonnet no longer block: every run wrote the GREEN, reported the mismatch and ran past step 1.
Haiku writes the GREEN but reported the mismatch in 1 of 4 runs (pilot included). USD 3.43,
pilots included.

**Haiku omits the arriving-`GUARD` deferred observation — delivered 2026-10-10**
(fix/haiku-arriving-guard-handback). The `Final message` bullet of `agents/part-implementer.md`
now scopes its `GUARD` line to a `GUARD` that passed on its first run, and gives a `GUARD` that
failed on its first run a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test
title>): the plan expected it to pass; it failed on its first run`. `test/plugin-structure.test.js`
pins the token prefix; the contract is unchanged. `implementer-runs-guards` at haiku,
with-craft / bare / Δ over 3 runs, before → after: 0.86 / 0.29 / +0.57 → 1.00 / 0.29 / +0.71;
`arrival-guard-observed` 0 of 3 → 3 of 3, with a `PLAN-MISMATCH` line in every run. The step-1
label moved less: two runs wrote `GUARD` with a RED/GREEN note, one kept a plain `GUARD` label.
Opus and sonnet were not re-run. USD 1.03, pilot included.

**Bound the arriving-`GUARD` exemption to the part — delivered 2026-10-10**
(fix/arriving-guard-part-bound). `evals/implementer-guard-outside-part` gives the part-implementer
a step-1 `GUARD` that fails on its first run and turns green only through `lib/name.sh`, a file
the plan gives to Part 2. With the contract as shipped, haiku edited that file in 3 of 4 runs and
altered the check in the fourth; sonnet and opus blocked in 4 of 4. Line 1 of
`contracts/construction.md` now writes the GREEN only when it lies inside the part; when it lies
outside, the `GUARD` is a blocker that leaves that file and the check unchanged. The
part-implementer's `Final message` bullet hands such a `GUARD` back as a blocker carrying its
`PLAN-MISMATCH` line. `engine/test/contract-equivalence.test.js` and `test/plugin-structure.test.js`
pin both. `implementer-guard-outside-part` with-craft per tier, before → after (3-run sweep):
opus 1.00 → 1.00, sonnet 1.00 → 1.00, haiku 0.42 → 1.00; every after-run blocked (12 of 12).
`implementer-runs-guards` after: opus and sonnet 1.00, haiku 0.95 and 0.90 over two sweeps.
USD 12.24, pilots, a regression repeat and a reverted rewording included.

**Haiku omits the arriving-`GUARD` plan mismatch after the part bound — closed unproven,
agent and fixture unchanged, 2026-10-11** (docs/haiku-guard-mismatch-ownership). With the
part-bound handback bullet, `implementer-runs-guards` at haiku omitted the `PLAN-MISMATCH`
observation in 2 of 7 runs (0 of 4 before the change); sonnet and opus held at 1.00. The
suspected cause, a reference plan that never says who owns `greet.sh`, has no support in the
traces: the 7 haiku traces on disk show no run asking who owns `greet.sh`, and plan step 3
already edits it. Both omitting runs fixed `greet.sh` as a plain bug, without naming the
arriving-`GUARD` rule, and handed back a generic summary; the 5 passing runs named the rule at
the failure in 3 cases. Thinking blocks are empty, so only the visible text was read. The shift
itself is within noise: 2 of 7 against 0 of 4 has a one-sided Fisher p of 21/55 ≈ 0.38.
Separating a ~20% omission rate from zero needs about 20 runs per arm, so no fixture probe and
no rewording were run. Free: no paid sweep.

**Fill the model-class matrix from the eval sweep — delivered 2026-10-07**
(docs/model-class-matrix-eval-sweep). The planner and structured-review cells of
`docs/guides/model-class-matrix.md` are filled from three runs per tier: planner PASS / PASS /
FAIL, structured-review PARTIAL for all three tiers (opus / sonnet / haiku). The sub-agent
override reaches the agents only with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`; without it a sonnet
session spawned opus agents. `docs/contributing/maintainer-smokes.md` § Model-class matrix now
exports both variables, keeps the sandbox, and says how to check the agent tier in the trace.
USD 9.07 for the sweep, pilots included.

**Eval-sweep follow-ups — delivered 2026-10-08** (fix/eval-sweep-followups).
`agents/reviewer.md` names the severity scale {CRITICAL, HIGH, MEDIUM, LOW}, pinned equal to
`contracts/harness-read.md` by a structure test; `reviewer-tests-findings` before → after per
agent tier (with-arm, `findings-shape` of 3): opus 1.00 (3/3) → 1.00 (3/3), sonnet 0.78 (1/3) →
1.00 (3/3), haiku 0.78 (1/3) → 1.00 (3/3). A haiku session is not supported (README FAQ); the
eval sweep holds the session at sonnet and the matrix columns name the agent tier. Sandbox git:
`PATH` cannot route the eval child to a working git, so the reviewer case's scaffold writes the
range's diff to `../.git/review-range.diff`; no run wrote outside its sandbox (the
plugin-checkout file-time check stayed empty), and `left` was 0 in every reviewer-case run except
one haiku run that probed `/opt/homebrew` for git and tried a denied read of an invented
plugin-checkout path. USD 8.78 for the probe, pilots, before runs and sweep.

**Recalibrate the `failing-test-first` grader — delivered 2026-10-08**
(fix/recalibrate-failing-test-first-grader). The grader's second sentence now reads "Steps that
add only already-passing tests, before or after that change, neither satisfy nor fail this."
A `claude -p` replay of the judge prompt proved unfaithful (0 of 10 real false FAILs
reproduced), so the wordings were replayed through the real sonnet judge in a throwaway
plugin-eval suite that plants each recorded plan: genuine-PASS plans failed went from 14 of 32 to
2 of 32, and all 4 hand-built negatives still fail. `docs/contributing/maintainer-smokes.md`
§ Behavioural eval suite describes the method. USD 5.26 for the replay.

**Pin the engine's claim-status set to the review contract — delivered 2026-10-11**
(chore/pin-claim-status-set-to-contract). `engine/test/findings.test.js` reads the contract's
`status?:` set and drives each status through `normalizeFindings` as a per-line record; every one
must round-trip in contract order. `STATUS_PREFIX_PATTERN` stays private, with no production
change. A status added to the contract alone now fails CI, not just a run. Before, the parser
threw on the first per-line record carrying it and rejected the whole batch; it did not drop the
status silently. A status the parser accepts but the contract does not name goes undetected.
That is unused acceptance: JSON-layout statuses already pass unvalidated. The extraction is
anchored at the closing `}`, so a spaced pipe or a free-text set fails on the non-empty assertion.
A source-read test in `engine/test/` was measured to abort every full Stryker run.

**Behavioural cases for the units no case drives.** The eval suite's unit table names what is
covered (`run`, `planning`/planner, reviewer, `decisions`, `prune`/core contract). Prune
candidates in any other skill or agent carry no behavioural evidence. Add a case for a unit
the next time a prune or prompt audit targets it, not speculatively.

### Open (scoped 2026-09-22 — follow-ups surfaced by the auto-compaction-safety run, not yet scheduled)

**Live smoke for the plugin-registered compaction hooks — delivered 2026-10-11**
(docs/live-smoke-compaction-hooks). All checks hold on CLI 2.1.296, recorded in
`docs/contributing/specs/auto-compaction-poc-record.md` §"Live smoke (2026-10-11)". The
plugin-registered `SessionStart[compact]` and `PreCompact` hooks fired on 4/4 compactions
(main auto, main manual, sub-agent ×2) and match the settings-hook spike. A ledger nonce the
model never saw came back from context. The run-key bound the real main transcript. The
sub-agent got the guard and ignored the rebuild. The summaries kept the run-id, ledger path
and phase (main) or the task with no ledger path (sub-agent), and a manual `/compact` was
steered too. One drift: the automatic summary paraphrases the in-flight phase.

**`open` on a live run-id discards that run's ledger — delivered 2026-10-11**
(fix/refuse-open-on-live-run-id). `run-ledger.sh open` now exits 3 and writes nothing when the
run-id still has a trusted pointer and its ledger: a run stays open from `open` to `close`, and
whether an open run is dead is the user's call. No pid or tree probe was added — measured, no
process outlives a tool call, and a worktree/branch probe reads a live run as dead before
`workspace` and after teardown. §0 step 4 STOPs on the refusal with three options: stop, discard
(`close`, then `open`), or re-slug. The refusal prints no run-key, so no compaction hook binds to
the refused attempt. An untrusted leftover pointer is still replaced with the stderr warning.

**Surface the compaction estimate at `Done` — delivered 2026-10-11**
(feat/compaction-estimate-at-done). A run-level `emit-metrics` call that names `--session` now
also reads that session's own main transcript, for its compactions only, and prints one advisory
`Compactions:` line after the rows from the miner's formatter. It is never a ledger row, never in
totals or drift, and exit codes are unchanged. A `--phase` call prints nothing; a run-level call
without `--session` (or with an empty one) writes one stderr note instead. `Done` passes
`--session "$CLAUDE_CODE_SESSION_ID"` on both calls and relays the line in the final message.
Design: [compaction-estimate-at-done](docs/contributing/design/compaction-estimate-at-done.md);
ADR-455–461.

**The miner double-counts a compaction the CLI re-appends — delivered 2026-10-11**
(fix/miner-compaction-uuid-dedup). `parseLines` now skips a `compact_boundary` or
`isCompactSummary` line whose `uuid` was already consumed in the same call, with no state change,
so a re-appended pair neither opens a second compaction nor closes a different pending one. A
compaction line with no `uuid` keeps the old behaviour; billed events and the marker scan are
untouched. Pinned by `compaction-reappended.jsonl` (main and sub-agent contexts) plus inline
cases for a duplicate pair arriving while a later boundary is still open.

### Open (scoped 2026-08-19 — follow-ups surfaced by the decision-drift-propagation run, not yet scheduled)

**A transient model 529 permanently degrades the highest-value phase — delivered 2026-10-11**
(fix/transient-model-retry). The model-resolution invariant in `skills/run/SKILL.md` now
classifies a spawn's availability error. A transient overload (`529` as a status or error code,
or `overloaded_error`) is respawned once on the same tier, immediately, recording
`MODEL-RETRY(<role>): <tier> overload`. Any other or unclassifiable error, an overload on that
retry, or text that also matches a permanent error degrades the tier for the run as before,
recording `MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>`. The allowance is
per spawn; once a tier is degraded, later spawns and retries go straight to the fallback.
`docs/contributing/specs/model.md` states the same rule; both tokens join the run-record family.
Pinned by `test/model-retry-token.test.js`. Design:
[transient-model-retry](docs/contributing/design/transient-model-retry.md); ADR-462–465.

**`stub-lint` flags `scripts/ci.sh`'s own mentions of `stub-lint` — delivered 2026-10-11**
(fix/stub-lint-ci-self-reference). The lint's own name is now a token, not a marker:
`engine/src/stub-lint-main.js` strips `stub-lint` (case-insensitive, word-bounded) from each line
before matching (ADR-474, ADR-477). The exemption is per token, never per line or file, so a real
`# TODO: x` or `# stub: fill in` in `ci.sh` is still reported, and `stub-linter`, `STUB-WAIVE(x)`
and `STUB-FOUND(x)` still fire (ADR-476). The `ci.sh` hygiene header now names the lints instead
of using a bare prose "stub" (ADR-475). `node engine/bin/stub-lint.js --gate blocking --
scripts/ci.sh` prints nothing. Pinned by fixture tests in `engine/test/stub-lint-main.test.js`,
not a process test over the real file (ADR-478). Design:
[stub-lint-ci-self-reference](docs/contributing/design/stub-lint-ci-self-reference.md);
ADR-474–478.

**The lint mains re-implement helpers `cli-io.js` already exports — delivered 2026-10-12**
(chore/backlog-sweep-six-entries). `isRegularFile`, `isDirectoryPath` and `isNonEmptyString`
now have one definition each, exported from `engine/src/cli-io.js` (ADR-487). The local copies
in `adr-lint-main.js`, `intention-lint-main.js`, `manifest-lint-main.js`, `plan-lint-main.js`
and `intention.js` are deleted; the suites of those modules stayed green unedited.
`adr-lint`'s lstat-based `isNonSymlinkFile` and the list-form predicates are untouched. Design:
[backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).

**`adr.frozen` can still exempt every citation without tripping the whole-tree guard — delivered
2026-10-12** (chore/backlog-sweep-six-entries). Both guard sites (manifest validation and the
adr-lint sweep) now also reject a frozen list whose entries together match every whole-tree
probe path, or every markdown probe path (ADR-486). `**/*.md` and `['*', '*/**']` are rejected
(the second turned adr-lint into `exit 0` with no citation checked); a root-only `*` stays
accepted, and the per-entry check and its message are unchanged. `docs/guides/customizing.md`
states the rule; its old claim that `*` is rejected is corrected. The probe sets are
representative, not exhaustive: a list crafted to skip one probe still passes. Design:
[backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).

### Open (scoped 2026-08-07 — follow-ups surfaced by the harness-hygiene-followups run, not yet scheduled)

**The committed baseline's `review-waste` recommendations are stale against the threshold that
produced them — delivered 2026-10-12** (chore/baseline-review-waste-replay-guard).
`replayRecommendations` in `engine/src/observability/usage-aggregate.js` re-derives a report's
run-derived recommendations (`review-waste`, `turn-budget`) from its own `runs` through the
current rules, and passes every other kind through verbatim. The new root guard
`test/metrics-baseline-replay.test.js` fails `bash scripts/ci.sh` when the committed baseline
disagrees with that replay. The committed report was regenerated by the same function, with no
re-mine: its 15 `review-waste` entries became the 4 that `billedTurns > 85` selects, and `runs`
is byte-identical, so the README cost claims and the calibration pin are unchanged. The
regeneration command lives in `docs/contributing/specs/telemetry.md` § "Committed baseline
replay". Design:
[baseline-review-waste-replay-guard](docs/contributing/design/baseline-review-waste-replay-guard.md) (ADR-493–499).

**Two spawn sites still carry the defects their siblings just had fixed — delivered 2026-10-12**
(fix/sibling-spawn-site-defects). `listTrackedFiles` in `test/source-hygiene.test.js` no longer
catches a failed `git ls-files`: it takes `(cwd, paths, env = process.env)`, the throw
propagates, and the env is stripped of `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` like its
in-file sibling `listHomePathCandidateLines`. That strip matters in practice: a hook running in
a linked worktree exports an absolute `GIT_DIR`, which otherwise turns a non-repo listing into
a silent success. `test/helpers/tmp-git-repo.js` now runs git under an allowlisted env (`PATH`
plus the three `GIT_CONFIG_*` pins, no `HOME`): an ambient `GIT_DIR`/`GIT_WORK_TREE`/
`GIT_INDEX_FILE` can no longer redirect it, and an inherited `HOME` can no longer drop fixtures
through the user's global excludes file. New eponymous suite `test/tmp-git-repo.test.js`; each
fix landed RED-first. `runGrep` is untouched. Design:
[sibling-spawn-site-defects](docs/contributing/design/sibling-spawn-site-defects.md).

**`test/docs-structure-lint.test.js` runs its script under the inherited environment —
delivered 2026-10-12** (chore/backlog-sweep-six-entries). `createTmpGitRepo` now returns
`{ root, env, cleanup }`, where `env` is its allowlisted git env, and `sut` spawns the lint under
it. A new decoy test plants `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` on the parent process and
expects exit 2 naming the three stray dirs; it exited 0 before the fix. `withAmbientEnv` moved
to the shared `test/helpers/ambient-env.js` with its own suite (ADR-488). Design:
[backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).

**`docs/contributing/specs/memory.md` is a living spec no freshness guard can see — delivered
2026-10-12** (chore/backlog-sweep-six-entries). The memory.md half was already done:
`subjects: [engine/src/observability/memory.js]` landed in PR #14 (cae7206). The corpus sweep
gave `policy.md`, `gate.md`, `vcs.md` and `model.md` subjects (`engine/src/policy.js`;
`engine/src/gates.js` + `engine/src/guards/**`; the two worktree scripts;
`adapters/*/src/model-tier-map.js`), each glob matching tracked files; the branch's
assert-fresh run shows no unwaived drift. Left subject-less on purpose: `backlog.md` and
`execution.md` (their implementation is prose, and the only shared code is the vocabulary
module every edit touches), the `*-poc-record.md` pages (records pinned to one binary version
and date, so drift must never be "fixed" by editing them to match code), and the PRD pages and
guides (they span the whole engine). Design:
[backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).

**A provenance ref sits in shipped adapter source — delivered 2026-10-12**
(chore/backlog-sweep-six-entries). The `DC-` refs at `adapters/pi/src/run.js:96` and
`adapters/pi/src/tool-call-hook.js:51,79`, and a `P11` in `scripts/worktree-teardown.sh:52`, are
stripped with each sentence kept. A whole-tree source-hygiene test now greps shipped code
(`engine/src`, `engine/bin`, `hooks`, `scripts`, adapter source/bin/extension/hook/plugin
trees) for phase, decision-record, part, backlog and design-candidate numbering and fails with
each `file:line` (ADR-485); it runs with an ambient `GIT_LITERAL_PATHSPECS` stripped, which
would otherwise hide every adapter match. Tests, skills and templates are out of its scope.
Design: [backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).

**Committed docs disclose the maintainer's home directory — delivered 2026-10-11**
(fix/scrub-home-dir-from-docs). The real count was 83 lines in 31 tracked files, not 18: a
second form, the dashed Claude projects-dir name (`-Users-<name>-…`), carried the username
too, including a captured aider fixture. Every file was swept in place, `archive/` and ADR-035
included, with only the path text changed (ADR-466). Out-of-repo locations are now named by
placeholder (`<worktree>`, `<main-repo-dir>`, `<node-bin>`; ADR-471), and the two engine
fixtures use the `x` placeholder home (ADR-470). Git history is not rewritten.

No template mandated the absolute path: spawn briefs pass it, and planners transcribed it. A
`contracts/core.md` invariant now tells every role that committed artifacts carry repo-relative
paths, and the `templates/plan.md` Gate note says the same (ADR-468; plan-lint unchanged,
ADR-469). Class D in `test/source-hygiene.test.js` blocks a home-rooted path anywhere in the
tracked tree (ADR-467). Review hardened its first cut: the anchor is now a fail-closed negative
lookbehind, matching is case-insensitive, the scan runs `git grep -naiE` from a git env
stripped of `GIT_DIR`, and an unparsable row throws. Placeholders such as `/Users/<name>/` in
this file pass.

### Open (scoped 2026-07-30 — follow-ups surfaced by the orchestrator-tax-hardening run, not yet scheduled)

**Newline-delimited scope specs — delivered 2026-07-31** (scheduled-backlog-sweep, ADR-323).
`parseScopeSpec` now splits on the newline instead of the comma — a path containing a comma
parses as one legitimate entry, and the retired comma-joined form is unsupported by design
rather than by accident. Per-entry trimming survives unchanged. One correction the closing
run surfaced mid-implementation: ADR-323's own consequence text claimed the retired
comma-joined form would throw — verified false. A narrow guard (ADR-327) now rejects the
common swallowed-entry shape (a whole comma-joined spec arriving as a single entry, whose
file part still carries another entry's range), without disturbing colon-bearing paths or
comma-bearing paths, which stay supported. One residual hole is deliberate and recorded in
ADR-327, not fixed: a comma-joined spec whose *first* entry carries no range still collapses
silently, because every formulation that catches it also rejects a legitimate comma-bearing
path.

**Locality-advisory specificity — closed by measurement, detector unchanged, 2026-07-31**
(scheduled-backlog-sweep, ADR-324). Re-measured over the whole committed corpus: 24 plans, 15
emitting, 54 warnings, 41 two-part. The originally recorded 49/14-of-23/37 reproduces exactly
once the plan doc added 2026-07-31 is subtracted, so nothing drifted structurally — one plan
was added. A trap in the original framing: the recorded `49` was always the *mergeable*
subtotal (≤3-part overlaps), not the total (54, which also counts 5 shared-infrastructure
overlaps of >3 parts) — the two coincided by accident. Both named candidates were measured
over the whole corpus, not estimated, and both were rejected: edited-vs-referenced weighting
is a near-disable (54→8, only 6 of 41 two-part overlaps survive, `### Commit` resolves zero
paths in 163/163 parts, and it destroys a genuine edit-edit overlap); the quoted-snippet skip
removes 0 and its one removal under a literal reading is wrong. The detector stays advisory
and unchanged. The one direction the data supports — a cue-based filter on prose idioms like
"precedent"/"template" — removes 4 of 54, all true noise by manual reading, but needs a
labelled sample before it is a result; that stays a backlog direction, not something this run
shipped.

**Windows path separators in the boundary filter — half closed by evidence, half documented,
2026-07-31** (scheduled-backlog-sweep, ADR-325). The colon-rejection claim is **false**:
`C:\repo\a.js:*` and `C:\repo\a.js:1-9` both parse correctly today, because the greedy head
that lets a colon inside a path survive to the pattern's last colon is deliberate and already
documented in the module comment — that half of the original entry never held.
`canonicalPath`'s inertness on a Windows root is real and reproduced (`C:\repo` yields the
prefix `C:\repo/`, which no incoming path starts with), and it stays deliberately unfixed:
there is no Windows CI to prove a normalization against, and shipping one into a toolchain
that is POSIX-only end to end (`scripts/*.sh`, `hooks/*.sh`, bats, shellcheck) would read as
Windows support the rest of the repo cannot honour. A fix lands only alongside a Windows CI
job that exercises it.

**Line-length cap reaches a new call-site — delivered 2026-07-31** (scheduled-backlog-sweep,
ADR-321). One defect, closed together with the sibling entry under "sp9-findings-adoption"
below. `parseLine`'s pipe-split now uses a linear lookaround delimiter (`/(?<=\s)\|(?=\s)/u`)
plus a 16,384-character cap in `parseLineShape`, raised with a dedicated cap-named error
before the split ever runs. Measured at 200,000 characters: 20,550 ms → 0.48 ms (independently
reproduced in review). One correction to the recorded trigger: it was written as "a whitespace
run before a trailing `|`" — that undersold the exposure. Any interior whitespace run not
immediately followed by `|`+whitespace was quadratic; a run that completed a successful split
was always fast. The pipe's presence was never the deciding factor.

### Open (scoped 2026-07-27 — follow-ups surfaced by the docs-audience-split run, not yet scheduled)

**Prose-lint excuse coverage for `docs/contributing/plan/` — delivered 2026-07-31**
(scheduled-backlog-sweep). `scripts/ci.sh`'s `run_prose_lint` excuse arm now lists
`docs/contributing/plan/*` alongside the other five provenance/design globs, and the
order-locked, anchorless regex in `test/hygiene-gates-ci.test.js` was extended in the same
commit — the byte-pinned pair moved together, as recorded. Measured impact: `prose-lint` over
all 24 plan files went from 32 `SLOP-FOUND` lines across 7 files to zero once they route
through the skip arm.

**README corpus-count freshness — delivered 2026-07-31.** The receipts sentence claimed "270
ADRs" and "18 design docs" against a tree holding 320 and 25; the counts drifted on every run
because nothing recomputed them. Both halves are now closed: the stale figures were corrected,
and `readme-drift` gained a fourth sub-guard that recounts the tree. The README drives the
check — a claim is any markdown link whose label opens with a count and whose target is a
directory (`[25 design docs](docs/contributing/design/)`), so adding a counted directory link
puts it under guard with no code change, while prose links carrying an incidental number ("raw
telemetry for 27 runs") and links to a single file are excluded by that same shape. The
telemetry run count keeps its existing sub-guard: it is derived from the committed report, not
from the tree.

**docs-lint small hardenings — delivered 2026-07-31** (scheduled-backlog-sweep). Both fixed,
with two corrections to the original framing. The `--audience` dedupe in
`scripts/docs-structure-lint.sh` compared a joined, space-delimited string instead of
individual elements, so a top-level entry name containing a space could swallow a genuine
neighbour; measured worse than recorded — the symmetric case drops **both** single-word
entries at the boundary, not one. It is now an element-exact loop (bash 3.2-compatible); a
false pass stays impossible by construction. And the wrong prose about the lychee-invisible
metrics link was **not** in `readme-drift-guards.md` at all — that file contains zero
occurrences of "lychee". It was in `docs/contributing/plan/docs-audience-split.md:356-360`.
The real cause was never a fenced-block rationale: a bare closing fence in
`readme-drift-guards.md` closed a nested mermaid block one line early, flipping the next bare
fence from closer to opener and swallowing 130+ lines, including the link. Both the fence
(rebalanced) and the mis-diagnosing prose (corrected in place, at its real home) are fixed; a
new `test/plan-doc-fences.test.js` guard now catches an unbalanced fence across every plan
doc.

### Open (scoped 2026-07-26 — follow-ups surfaced by the sp9-findings-adoption run, not yet scheduled)

**Line-length cap in the findings normalizer — delivered 2026-07-31** (scheduled-backlog-sweep,
ADR-321). The same defect as the "Line-length cap reaches a new call-site" entry above under
"orchestrator-tax-hardening" — closed together, one fix. `parseLine`'s pipe-split now uses a
linear lookaround delimiter and a 16,384-character cap in `parseLineShape`, raised past the
existing 5,000-character ReDoS guards so they still exercise the split rather than the cap,
now asserting the specific cap/format message rather than a loose `/Cannot parse findings/`
prefix. Measured at 200,000 characters: 20,550 ms → 0.48 ms. One correction: the trigger was
never specifically "a whitespace run before a trailing `|`" — any interior whitespace run not
immediately followed by `|`+whitespace was quadratic, pipe or no pipe.

**Adapter agent-mirror sync tooling — delivered 2026-07-31** (scheduled-backlog-sweep,
ADR-326). Shipped as `scripts/sync-adapter-agents.sh`: read-only `--check` by default, an
explicit `--write` required to mutate anything, replacing each mirror's body only while
preserving its own frontmatter byte-for-byte (aider's body-only, no-fence, leading-newline-
stripped variant is encoded as its own write shape, not folded into the frontmatter-preserving
one). `--check` is wired into `scripts/ci.sh`. opencode's missing byte-identity guard — the
one adapter of the six that lacked one — is added, so all six mirrors are independently
guarded rather than five; the tool is never the only thing checking itself.

**findings.js mutation-baseline hardening — delivered 2026-07-31** (scheduled-backlog-sweep,
ADR-322). Measured baseline was 34 unkilled of 224 instrumented (27 survived + 7 uncovered),
not the ~20 originally recorded. Three redundant empty/shape guards were deleted (ADR-322 —
the array guard in `parseJsonShape`, `parseLineShape`'s empty-`nonBlank` early return, and
`normalizeFindings`'s empty-string guard, all provably unreachable or redundant, verified by
differential over the empty/whitespace/JSON probe set and the full existing suite); the
`Zero findings → []` contract those guards enforced in code now lives in JSDoc, with the two
empty-input tests as its only executable proof. The remaining survivors were triaged to the
repo's kill-or-document convention. Review caught that 4 of the resulting "equivalent mutant"
documentation comments were actually killable — the reasoning had assumed JS `.` only excludes
`\n`, but it also excludes `\r`, and two of the four were live scope-widening bugs, not just
missed coverage. All four were converted to real kills; `findings.js` finishes with 3
in-place equivalent-mutant comments, not 7.

### Open (scoped 2026-07-25 — follow-ups surfaced by the readme-drift-guards run, not yet scheduled)

**Scripted, CI-regenerable README demo.** A committed terminal-recording tape (e.g. a
charmbracelet/vhs script) that renders the decisions-checkpoint moment of a run into the
README's hero GIF deterministically — the demo is code, regenerated after UI changes with one
command, never a stale hand-recorded capture. Needs a live run to record against; pairs with
the drift-guard ethos (`docs/design/readme-drift-guards.md`): a demo that can be regenerated is
a demo that can be gated.

**Public front-door completion set — delivered 2026-10-12** (public-front-door-completion).
README now carries a `## How craft compares` table that compares approach categories (plain
agent prompting, spec-driven kits, craft) rather than named products, with every craft cell
linked to evidence in this repo and no digits (ADR-500, ADR-501), plus a plugin-version badge
read from `.claude-plugin/plugin.json` and an "Open in Codespaces" shields badge (ADR-507).
`.devcontainer/devcontainer.json` and the CI `ci` job share `scripts/install-dev-tools.sh`,
which verifies yq against pinned per-arch SHA-256 checksums (ADR-505); the Codespace cold start
is a not-CI-gated maintainer smoke, and README states no duration until it is measured.
CONTRIBUTING.md (any process; `scripts/ci.sh` green + Conventional Commits, ADR-506),
SECURITY.md (a detail-free public contact request, ADR-504) and four issue forms landed.
CHANGELOG.md backfills 1.0.0 and cuts 1.1.0; `docs/contributing/releasing.md` holds the
procedure, and `plugin.json` moved to 1.1.0 so marketplace users receive the post-tag work
(ADR-503). Tagging `v1.1.0` stays a maintainer action after merge. Each claim is pinned by a
root repo-shape test (ADR-502). Design context:
[public-front-door-completion](docs/contributing/design/public-front-door-completion.md).

### Open (scoped 2026-07-23 — follow-ups surfaced by the aider binding, not yet scheduled)

**Per-source zero-files note in the usage miner — delivered 2026-07-31**
(scheduled-backlog-sweep). The zero-file note is now derived from the resolved per-source
matcher instead of the hardcoded `.jsonl` literal, mirroring the `resolveFileMatcher`/
`DEFAULT_READ_ROOTS` per-source seam. `--source aider` now names its real transcript file,
`.aider.chat.history.md`; the existing exact-string test pinning the note for the
claude/default source stays green, byte-unchanged.

**`--file` editable-targets surface in launch-args for edit-phases — delivered 2026-07-31**
(scheduled-backlog-sweep). `buildLaunchArgs` now takes an optional editable-targets parameter
and emits one `--file <path>` per touched file, keeping `--read` for role/context only;
omitting the parameter emits byte-identical argv to before. The record keeps its
CONFIRMED/OPEN discipline honestly: `--file` is necessary but not sufficient — the
full-pipeline dogfood already on record showed a weak local model no-op on an
edit-to-existing-file even with `--file` spliced into that turn's argv, so a capable model is
also required. The edit-to-existing path is still not claimed proven; only file creation is
CONFIRMED live. See `docs/contributing/specs/aider-poc-record.md` (the entry's cited
`docs/adapters/aider-poc-record.md` does not exist — a stale path, corrected here).

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

**Stronger destructive-git denial for the Copilot binding — delivered 2026-10-16**
(feat/copilot-git-argv-normalising-guard). A live probe showed copilot >= 1.0.92 honours a
`preToolUse` deny (`permissionDecision: "deny"`; the 1.0.63 probe used a key copilot ignores), so the
hook now enforces (ADR-578): a plain-command gate (ADR-595, ADR-596) → `gitDestructivePredicate` over
normalised argv (push, `reset --hard`, forced branch delete, non-dry-run clean, inline aliases and
config channels; ADR-579/583/584/590) → the shared guard, with the verdict computed in a worker thread
and denied at a 5 s deadline so copilot's ~30 s hook timeout cannot fail open. `--deny-tool` stays the
floor. Ground truth on copilot 1.0.92 and 1.0.98 (bare-remote ref unmoved; allow direction executes).
Original entry: `--deny-tool` is **prefix matching on the
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
- **Re-confirmed 2026-10-15 on codex 0.162.1 (codex-0162-reprobe).** The untrusted-hook
  fail-open reproduced: with the template `[[hooks.PreToolUse]]` block copied verbatim and
  `trust-hook.js --check` reporting `from=untrusted` (exit 1), `codex exec` ran
  `git diff > OUT.txt` (exit 0, `OUT.txt` 101 B) and the JSONL stream carried zero hook or
  warning items. `bin/trust-hook.js` then worked end to end: trust written (exit 0, the same
  `sha256:38713365…` hash as on 0.161.0), `--check` reported trusted/noop, a re-run left
  `config.toml` byte-identical, `git diff > OUT.txt` was blocked (`OUT.txt` absent, the guard's
  `--no-ext-diff` reason) and `git diff --no-ext-diff > ALLOWED.txt` ran (101 B, a real diff).
  The fail-open is still unchanged codex behaviour, so the entry stays MITIGATED, not closed.

**Prove craft's shared skills load by reference on codex — re-probed 2026-10-15; STILL DISPROVEN,
stays OPEN (codex-0.162.1 limitation).** Two findings: (1) **manifest location bug, FIXED
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

**Re-probe on 0.162.1 (2026-10-15): unchanged — re-pinned 0.145.0 → 0.162.1.**
`codex plugin marketplace add ./adapters/codex` plus `plugin add` for both entries: both cached
`.codex-plugin/plugin.json` are `{description, name}`, `skills` and `hooks` dropped. Through the
app-server `skills/list` method (`forceReload: true`): **0 of 19** shared skills load by
reference, **19 of 19** load via the symlink fallback (registered as `craft:<name>`, scope
`user`). The symlink fallback stays documented as required, not optional. "Load by reference"
is not achievable on codex 0.162.1; re-check on the next minor version.

**Carry the credential-rotation caveat into every binding's probe record — scoped 2026-07-31,
delivered 2026-10-12** (chore/backlog-sweep-six-entries). `cursor-poc-record.md` now carries a
full *Isolation-method caveat* section: the keychain symlink sits outside the mtime-find
window, any refresh during a probe writes the operator's real keychain, server-side rotation
was not probed and is assumed, plus the three mitigations. The standing rule lives in a new
*Probe records* section of `adapters/README.md`, the page that sets the poc-record convention
and where a new binding's author starts. Design:
[backlog-sweep-six-entries](docs/contributing/design/backlog-sweep-six-entries.md).
Original scope: surfaced by the codex 0.145.0 re-probe. Every binding record documents isolation as an mtime-find
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

**Malformed `.rules` execpolicy — treat as fail open: on 0.162.1 the app-server path fails open and
`codex exec` refuses to start — recorded 2026-07-21, re-probed 2026-10-15**
(harden-prove-codex-binding, B9). Runtime auto-loads `$CODEX_HOME/rules/` (a directory of `.rules`
files); `execpolicy check` treats a malformed file as a hard error, but the codex binary carries the
literal runtime message `Error parsing rules; custom rules not applied.` — read on 2026-07-21, from
that string alone, as: on a parse error the rules are **not applied** (fail-open), so a forbidden
command runs; the 0.162.1 re-probe below splits that by surface. Mitigation (`115bcce`, DC-3):
`assertRulesIntegrity(onDiskText)` byte-compares the deployed rules to `buildExecpolicyRules()` and
refuses on any drift (malformed included). It is an exported, unit-tested check with no caller in
the binding, kept on demand by decision (2026-10-16) because the binding launches nothing itself
(operators run `codex exec`): it protects only when something invokes it. (The committed-file drift-guard already
existed; this covers the deployed copy.)

**Re-probe on 0.162.1 (2026-10-15): split by surface.** The 2026-07-21 verdict rested on the
binary string alone; no runtime side effect was recorded. On 0.162.1, ground-truthed by side
effect (`git clean -f` against an untracked `VICTIM.txt`, the deployed `craft.rules` with its
last line `)` removed): `codex exec`, this binding's launch path, exits 1 at startup with
`Error loading rules: … starlark error`, emits no events, and the file survives (fails closed,
3/3); the app-server thread/turn path emits a `configWarning` (`Error parsing rules; custom
rules not applied.`), runs the command, and the file is deleted (fails open, 3/3). With the
well-formed file both paths block. The interactive TUI was not probed. Treat a malformed rules
file as fail open. Evidence: `docs/contributing/specs/codex-poc-record.md`,
*Re-probe — codex-cli 0.162.1*.

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

### Open (scoped 2026-10-11 — run last, after every other open entry)

**Spike an unattended backlog driver.** Today each run ends by electing the next entry and
handing back a prompt, and a person types `/clear` and pastes it. The session cannot clear its
own context, so a loop that clears the backlog has to drive it from outside. Two candidates to
spike: a `claude -p "/craft:run <brief>"` process per entry, which is a fresh context every
time but cannot ask anything; or an interactive session in `tmux`, where a driver waits for the
session to go idle (a `Stop` hook writing a marker file), then sends `/clear` and the next
`/craft:run` with `tmux send-keys`, so a person can attach and answer when a run asks. Both need
the elected next entry written to a brief file rather than to the chat, every routine outward
action (push, PR, merge) pre-approved by policy, and stop conditions: a blocker, a CI that stays
red after one fix round, a budget cap, an empty backlog. Open questions: what the driver does at
a decisions-phase question or a paid-eval ask, how it detects that a run asked rather than
finished, and how it notifies the person when it stops. Deliver a spike report with a
recommendation and one attended end-to-end loop over two real entries.

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
- **A `macos-latest` job for the hooks' `LC_ALL=C` guard** — *premise refuted 2026-10-11.* The
  entry assumed CI's awk never aborts, so the multibyte-locale hook tests passed vacuously on
  `ubuntu-latest`. Measured there, `/usr/bin/awk` is gawk 5.2.1 (alternatives priority 10 over
  mawk's 5). With the guard removed, gawk dies with `invalid regexp: Invalid collation character`
  on the byte-range control-chars ERE, so all 4 multibyte tests fail, as they do under macOS awk.
  The existing ubuntu job already runs them, so it already catches a guard removal. Only mawk and
  original-awk pass vacuously, and CI uses neither.
