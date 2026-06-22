# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine, re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip /
> insert / reorder), strong zero-config defaults, a small invariant core, per-port
> customization.

> SoT — *intent:* `docs/PRD-customizable-engine.md` · *architecture:* `docs/DESIGN-customizable-engine.md`
> · *decisions:* `docs/adr/` · *build scripts:* `docs/PLAN-*.md` · *spikes:* `docs/SPIKE.md`

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
learnings (toolchain, discovered gate command, recurring findings, slice-sizing, per-phase metrics).
Validate-on-read + confidence/decay + merge-before-insert + a newest-window size cap keep it fresh and
bounded; the content whitelist is document-only; deleting the store changes run *cost*, never
*correctness*. Configured via a new top-level `memory:` manifest key (ADRs 116–123).

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

Per-slice history lives in `git log`, `docs/{DESIGN,PLAN}-P*.md`, and `docs/adr/` — not here.

**Standing invariants (the working contract):**
- **Data is the SoT, not prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
- Every phase is **dogfoodable** — runnable through `/craft:run` itself.
- Working style: sliced TDD, one slice per dedicated agent (or session-direct for judgment-fused
  sweeps); 4-dimension review interleaved, every fix applied before the next; **CI green at every
  commit; `--no-verify` is the consumer's discretion, the craft gate is not.**

---

## Candidate phases (un-PRD'd — promoted from parked)

Beyond the PRD program. Real features, scoped but unscheduled — each is a coherent `/craft:run`.

### P23 — Configurable policy hooks: always / ask / never (user + project precedence)

Expose **three configurable policy hooks** that govern what the craft plugin may do autonomously,
settable at **both user and project level with the same precedence rule as the manifest** (project
overrides user; per-invocation could override both, consistent with ADR-022 overlay precedence):

- **`always:`** — actions the plugin should always do without asking (auto-approved).
- **`ask:`** — actions the plugin must ask the user about before doing (confirmation gate).
- **`never:`** — actions the plugin must never do (hard prohibition).

This is craft's own permission/policy layer — the engine-level analogue of the harness's
"confirm before hard-to-reverse/outward actions" discipline, made declarative and per-repo/per-user
configurable. It dovetails with the headless role-less semantics (e.g. `integrate` stop-before-merge
becomes an `ask:`/`never:` policy rather than a hardcoded default) and with the HaaS framing
(a configurable policy seam is part of what makes craft a harness-as-a-service).

Scope: decide the config surface (manifest keys + user-level file, merged at the existing overlay
precedence), the vocabulary of nameable actions (push, merge, PR-create, external sends, file
deletes, …), how `ask:` surfaces to an interactive orchestrator vs a headless bin (in headless,
`ask:` ⇒ treat as `never:`/blocker unless pre-approved), and how each phase consults the policy.
Likely a new policy port + overlay logic following `cli-overlay.js`. (Promoted from session feedback
2026-06-21.)

### P24 — Rename the "slice" vocabulary to standard software-engineering terminology

The plan decomposes work into **slices** (one atomic TDD commit each). "Slice" reads as craft
jargon; replace it with a term closer to mainstream software-engineering vocabulary. Candidate
replacements to weigh in the design: **increment** (Scrum "potentially-shippable increment" — closest
fit), **work item**, or **work unit**. ("Vertical slice" is the actual industry term but keeps the
disliked word; "task" collides with issue-tracker tasks.)

Scope is a cross-cutting rename, not a one-file edit — it touches: `templates/plan.md` (`## Slice N`
headings), `scripts/plan-lint.sh` (keys on the `Slice` heading), the `craft:slice-implementer` agent
(name + `agents/` def + `skills/implementation`), `skills/planning`, the planner's output prose, and
the design/plan doc voice. The agent name and the lint keyword are load-bearing — the rename must stay
mechanically consistent across all of them in one pass. No engine-descriptor change expected (the
pipeline knows phases, not slices). Decide the exact term in that change's decisions phase. (Promoted
from session feedback 2026-06-21.)

### P25 — Interactive customization generator (the manifest "front door")

A tool/skill that, run *inside a target repo*, scaffolds a **named** craft customization by probing
the repo's capabilities and interviewing the user, then writing a lint-clean `.claude/workflow.md`
declination. Today the only way to customize is to hand-author the manifest (P12 documents it,
`manifest-lint` validates it) — this is the missing onboarding front door. The "name" the user gives is
the dedicated override's identity.

Load-bearing design questions (decide in its own decisions phase):
- **Named override shape** — a user-defined `pipeline.profile` entry, or a separate named manifest file?
  (Profiles are built-in today: `lean`/`solo`; user-defined named profiles is the real extension.)
- **Interview transport** — interactive only (orchestrator `AskUserQuestion`), or also a headless/
  flag-driven mode usable from `craft-pi`?
- **Discovery layer** — reuse the existing capability probes (`worktree-setup.sh`, the gate probe) vs.
  a purpose-built probe.
- **Output** — write `.claude/workflow.md` directly vs. emit a draft for review; always run
  `manifest-lint` before landing.

Likely a new skill (`craft:init`/customize) plus a probe+interview+emit pipeline. Distinct from P22
(repo memory) and P23 (policy hooks). Best built *through* craft itself (dogfood). (Promoted from
session feedback 2026-06-21.)

### P26 — Auto-skip phases craft evaluates as unnecessary (config `required:` override)

Today craft skips a phase only when **told to** — `--skip`/`pipeline.skip` (operator waiver), a
default-off descriptor (`enabled: false`, e.g. requirements/architecture), or a runtime **no-op**
(P19: `decisions`/`refactoring` find nothing to do, `validation`'s DoD sub-concern). What it does
**not** do is *evaluate, up front, whether a phase is even needed for this change* and skip it when
it provably has nothing to do.

Add a pre-phase **necessity evaluation**: before entering a phase, craft decides — from the actual
change (diff shape, the artifacts the phase consumes/produces, the capability probe already run) —
whether the phase has any work. If it provably does not, **auto-skip** it and record why — **unless
the phase is marked `required:` in config**, which forces it to run regardless. `required:` is the
operator's escape hatch against a wrong evaluation, and the safe pin for any phase an operator never
wants silently dropped.

This **generalizes the P19 runtime no-op** (phase ran, found nothing) into a cheaper
*didn't-need-to-run* decision, and it is the inverse of `pipeline.skip` (operator skips a phase craft
would run; here craft skips a phase the operator didn't pin). Load-bearing design questions (own
decisions phase):
- **Evaluation signal per phase** — what makes a phase provably empty (no consumed artifact changed?
  empty diff in the phase's scope? probe finds no tooling?), and which phases are even *eligible*
  (the three non-overridable floors and producer phases are likely never auto-skippable).
- **`required:` config surface** — a per-phase manifest knob (`phases.<id>.required: true`), its
  precedence vs `--skip`/`enabled:false`, and the default (opt-in vs opt-out per phase).
- **Surfacing** — auto-skip is **not** an operator waiver: it needs its own run-record token /
  `Resolution` signal (e.g. `auto-skip: <phase> — evaluated unnecessary (<signal>)`), distinct from
  `WAIVER:` and `NO-OP(<phase>)`.
- **Consumer-strand safety** — an auto-skip must respect the resolver's stranded-consumer guard:
  never skip a phase whose `produces` a later enabled phase `consumes`.

Distinct from P23 (policy governs outward *actions*, not phase necessity) and from P25 (which
*authors* a manifest; this *evaluates at run time*). (Promoted from session feedback 2026-06-22.)

---

## Parked

### Condition-gated (do when the trigger fires)

- **Migrate the `bats` suite to `node --test`** (user-requested, portability) — **evaluate first.**
  Worktree/hook scripts need real-process assertions (likely `node:test` + `child_process`); judge
  whether a JS port keeps shell-behavior fidelity before committing to the migration.
- **Extract an `extends-validation` module** (P14 refactor no-op) — pull the shared `checkFileRef`
  leaf + `validateExtends*` cluster out of `manifest.js` when validation grows further. Deferred
  because the cluster shares `checkFileRef` with the scripts/backlog/phases validators (needs the
  shared leaf first) and `manifest.js` is still under the 800-line max.
- **`backlog-lint` / `design-lint` structure lints** — the optional enforcing half of ADR-014
  (the `templates/backlog.md` template shipped at P4; the structure lint + bats fixtures did not).
- **Built-in per-tracker backlog adapter** (e.g. first-class `github-issues`) — rides the P14
  derived-plugin surface (a plugin shipping a backlog adapter); the repo-`custom`-script escape
  hatch (P11) already covers the tracker case today.
- **Single-source the harness-knob type schema** (P18 refactor follow-up) — the knob vocabulary is
  encoded twice: `coerceHarnessValue` (CLI coercion, `pipeline-resolve-main.js`) and `validateHarness`
  (typing, `manifest.js`) both enumerate `passes`/`max_cycles`/`convergence`/`incremental`/`dimensions`.
  A shared knob→type map would let coercion and validation derive from one declaration. Deferred at P18
  as feature-sized (its own design); do it when a knob is added or renamed and the duplication bites.
- **Extend the `NO-OP(<phase>):` token to `architecture`/`validation`** (P19 follow-up) — those two
  phases still record a no-op in the older "no-op with a note" idiom; ADR-103 defines the
  `NO-OP(<phase>):` token as extensible to them. Bringing them under it gives the whole run record one
  greppable no-op shape. Behaviour-touching (it changes their recorded line, near the
  propose-gate-release wording of ADR-082), so scoped out of P19 as its own small change.
- **Mechanical guard for the `NO-OP(<phase>):` token spelling** (P19 follow-up) — the token's
  grep-symmetry contract is currently unguarded (verified only by one-shot greps at implementation
  time); a future edit could silently drift one copy's spelling. A tiny repo check (a `package.json`/CI
  grep asserting each phase's token string is present) would make the symmetry self-enforcing. Deferred
  to avoid adding a new CI surface inside a wording-only change.
- **Per-hunk mutation scope must be one comma-separated `--mutate`** (P20 follow-up — real correctness
  risk). In P20's `validation` phase, scoping per-hunk with two *separate* `--mutate file:range` flags
  made Stryker honor only the last (under-scoped to one hunk), reporting a falsely-clean 100 % (2
  mutants) that hid a real survivor; the single combined `--mutate "fileA:r1,fileB:r2"` surfaced 13
  mutants + 1 survivor. Whatever builds the mutation invocation (the `validation` skill / a helper)
  should emit ONE comma-separated `--mutate` for multi-hunk scopes — ideally asserting the instrumented
  mutant count is plausible — so a silent under-scope can't pass the gate on a fake score.
- **Structured / checkable DoD criteria (DC-5 v2)** (P20 follow-up) — P20 shipped a free-text DoD
  (ADR-109). A structured schema (each criterion tagged auto-checkable vs judgment, naming a gate
  command / file-exists assertion) would enable mechanical met-ness for the auto subset, at the cost of
  a schema + parser a repo must learn. Build only once free-text proves the surface.
- **DoD trust on contributor branches** (P20 follow-up — surfaced by the security review) — P20 reads
  the DoD as trusted operator input (sound on a maintainer checkout). If craft is ever run against
  contributor/PR branches in an automated context, `docs/DOD.md` (or the `paths.dod` target) is editable
  by an untrusted author who could soften the bar. The fence already stops the DoD being obeyed as
  engine instructions, and "evidenced by phase results, never re-run" mitigates; document that asserting
  agents treat criteria as *claims to verify against phase evidence*, not ground truth, and that DoD
  content is part of the reviewed diff.
- **`docs/DOD.md` "Feature-acceptance criteria (current change)" section goes stale** (P21 follow-up —
  surfaced in P21's `validation`) — the repo DoD's evergreen sections (General / Mutation / Gates /
  Architecture) apply to every change, but the "current change" section is still P20's feature criteria;
  P21 deliberately did not touch `docs/DOD.md` (the loop example ships its own `examples/loop/DOD.md`),
  so the `verify:` step had no P21-specific acceptance lines to assert against. Decide the intended
  model: reset the per-feature section each change, drop it in favour of per-feature criteria living in
  the design doc's Requirements, or template it. Until then, `verify:` asserts the evergreen sections and
  records the per-feature section's provenance honestly.
- **Repo-local memory hardening** (P22 follow-ups — surfaced by review/validation) — the memory port
  (`docs/adapters/memory.md`, ADRs 116–123) ships deliberate document-only / mechanism-only choices that
  leave clean upgrade paths: (a) the **`custom` memory adapter** binding is reserved in the `memory:` key
  but only `file` is built; (b) the content whitelist is **document-only** — a **reject-at-write + schema
  lint** is the documented upgrade if non-mechanical content (abs paths, secrets, prose) ever leaks in
  practice; (c) `reconcile` does not **dedupe same-key entries on load** (advisory; the write surface
  normally maintains uniqueness) — a load-time collapse would harden against a hand-edited store; (d)
  `evictToCaps` re-serializes per drop, an **O(n²) cap-shrink edge** (lowering a cap on an already-large
  store) a bulk-prune would fix (YAGNI at current bounded sizes); (e) **run-over-run measurement** has no
  smoke yet — an SC5-style on-demand smoke driving load→save→`.claude/craft-metrics.md` across two runs
  would prove the improvement loop end-to-end. None blocking; each is bounded by the advisory-cache
  premise (worst case wasted cost, never wrong correctness).

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
