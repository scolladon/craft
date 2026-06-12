# Workflow promotion — abstract engine, per-repo declination

Promote tsgit's `/apply-workflow` into a reusable workflow any project can adopt, with
tsgit as the first concrete instantiation. Hard requirement: fully operational on a
fresh machine with zero session memory — every load-bearing rule lives in an enforced,
versioned mechanism, placed by the enforcement hierarchy:

1. **Mechanical** (strongest): tool hooks, scripts the workflow executes, commit/CI gates.
2. **Versioned instruction**: command text, phase skills, agent definitions, repo
   manifest — loaded whenever they govern the work (just-in-time loading is fine; what
   is banned is *unversioned* or *recall-dependent* placement).
3. **Session memory: never** — scratch and pointers only.

## Decisions (this design session, 2026-06-12)

| Choice | Decision |
|---|---|
| Packaging | **Personal plugin** (own git repo + personal marketplace): command, phase skills, agent defs, hooks, templates, lifecycle scripts ship as one versioned unit |
| Name | **`forge`** — orchestrator invoked `/forge:run <input>` (plugin namespacing is mandatory; `commands/` is legacy, so the orchestrator ships as a skill), phase skills `/forge:<phase>`. Verb-able, no collision with the harness Workflow tool / `/workflows` |
| Segregation | **Three layers**: thin orchestrator command (resolve input, parse+validate manifest, run phase sequence, hold gates) → **one skill per phase** (default handler text, loaded just-in-time = progressive disclosure; independently invocable standalone, e.g. `/forge:review` on any branch) → **role agents** spawned per the phase skills' instructions |
| Declination | **Manifest + override files**: committed `.claude/workflow.md` (YAML frontmatter + prose); long handlers as referenced files; no manifest = pure defaults via capability probing |
| Role contracts | **Plugin agent definitions** (model pinned in frontmatter, invariant contract in body); invocations pass only dynamic context |
| Agent naming | **Plain roles, no prefix** (`designer`, `planner`, `reviewer`, `slice-implementer`, `refactor-executor`, `mutation-triager`, `docs-writer`, `backlog-ticker`) — the plugin namespace supplies `forge:` |
| Docs delegation | **Sonnet for all doc pages**; **haiku only for the backlog tick**, guarded (see Docs phase) |
| Entry point | **Plugin entry point only** (`/forge:run <input>`); no repo alias; legacy trigger phrases ("apply the workflow", "use my default workflow") map to it via the repo/global CLAUDE.md pointers |
| Manifest format | **Markdown + YAML frontmatter** — machine fields parse deterministically, prose carries the why |
| Global CLAUDE.md | "Default feature workflow" section **replaced by a ~3-line trigger pointer** to the plugin command; the precedence rule is deleted (the manifest mechanism subsumes it) |

## Plugin layout (`forge` plugin, own repo)

```
forge/
├── plugin.json
├── skills/
│   ├── run/SKILL.md              # /forge:run <backlog-id | file | description> — thin orchestrator
│   │                             #   (skills/, not legacy commands/; namespacing is mandatory)
│   ├── branch/SKILL.md           # one skill per phase — default handlers, loaded just-in-time
│   ├── design/SKILL.md
│   ├── adr/SKILL.md
│   ├── plan/SKILL.md
│   ├── implement/SKILL.md
│   ├── review/SKILL.md           # also standalone: /forge:review on any branch
│   ├── refactor/SKILL.md
│   ├── mutation/SKILL.md         # also standalone: /forge:mutation after a hotfix
│   ├── docs/SKILL.md
│   ├── pr/SKILL.md
│   └── merge/SKILL.md
├── agents/                       # surface namespaced as forge:<name> — no prefix needed
│   ├── designer.md               # fable — design doc, self-review ≤3, decision candidates
│   ├── planner.md                # fable — plan with pre-chewed per-slice context blocks
│   ├── reviewer.md               # fable — read-only, dimension passed as parameter
│   ├── slice-implementer.md      # sonnet — TDD contract, slice gate, blocker protocol
│   ├── refactor-executor.md      # sonnet — behavior-preserving, spec-scoped (never judges)
│   ├── mutation-triager.md       # sonnet — kill or document-equivalent
│   ├── docs-writer.md            # sonnet — affected pages only, content from design doc
│   └── backlog-ticker.md         # haiku — flip + append refs ONLY
├── hooks/
│   ├── hooks.json
│   ├── git-no-ext-diff.sh        # PreToolUse(Bash): inject --no-ext-diff into git diff/show
│   └── block-no-verify.sh        # PreToolUse(Bash): block git commit/push --no-verify
├── templates/
│   ├── design.md                 # design doc skeleton (decision-candidates section required)
│   ├── plan.md                   # plan skeleton — defines the slice schema plan-lint checks
│   └── adr.md                    # ADR skeleton (used when the repo has no own template)
└── scripts/
    ├── worktree-setup.sh         # detect package manager → install deps (never symlink)
    ├── worktree-teardown.sh      # REFUSES while the mutation run-lock exists in the
    │                             #   worktree / checkout root (per branch strategy);
    │                             #   then prune worktree/branch; run declination pre-teardown
    ├── manifest-lint.sh          # validate manifest fields/values — shared by run + every
    │                             #   standalone phase skill (no duplicated parse rules)
    └── plan-lint.sh              # validate each slice against templates/plan.md's schema
```

The `resolve` step has no own skill — it opens the orchestrator (it must run before any
phase skill is chosen). Phase skills invoked **standalone** (outside a `/forge:run`)
first validate + read the manifest via the shared `manifest-lint.sh` — gates, context,
and override apply identically, with zero per-skill duplication of parse rules — default
their scope to the current branch's diff against the default branch, and **establish the
global context's preconditions themselves** against the **current checkout root** (no
branch phase ran, so no worktree exists: tooling activation declared in the global
context file targets the checkout the skill runs in).

**Invariants live in two non-overridable tiers.** *Cross-phase* invariants live in the
orchestrator: phase ordering, gate placement, gating relationships (mutation triage
gates the PR), the protected-phase list, the agent-spawn context-assembly rule, and the
**run record** (skip reasons, no-op justifications, probe outcomes — maintained by the
orchestrator, landing in the final summary and the PR body). *Phase-local* invariants
live in each phase skill's **preamble**: the `manifest-lint.sh` call and the phase's
own probe run **always**; scope defaulting and precondition setup run **only-if-unset**
(a `/forge:run` pipeline has already established scope and worktree preconditions at the
branch phase — standalone runs establish them here, against the current checkout root).
`override:` replaces only the skill's **procedure body** — the preamble always runs,
which is what keeps standalone invocations correct too: a standalone `/forge:mutation`
still probes and still validates the manifest even when the body is overridden.
Cross-phase invariants that cannot apply standalone (there is no PR to gate) simply
don't — the preamble is the binding floor. A manifest `skip:` never binds a standalone
invocation (explicit user intent wins; the preamble surfaces the skip note and
proceeds); the run record exists only in pipeline mode.

`plan-lint.sh` is only possible because `templates/plan.md` defines a machine-checkable
slice schema (required headings per slice: context block, TDD steps, gate, commit
message) — the planner fills the template, the script lints the structure.

- **Session remains the orchestrator** (unchanged from today): input resolution, branch
  setup, ADR conversation, slice verification, review-fix application, phase-boundary
  gates, synthesis artifacts (follow-ups, PR body), CI monitoring, merge + cleanup.
  Phase skills execute **in the main conversation** (that is what makes session-owned
  phases possible); they are never pushed into subagents wholesale.
- **Why phase skills, not one big command:** (1) progressive disclosure — a phase's
  handler text enters context only when that phase runs, instead of 24KB up front;
  (2) standalone reuse — `/forge:review` (the 4-dimension battery) or `/forge:mutation`
  are useful outside the full pipeline; (3) clean override semantics — the phase skill
  always loads and its preamble runs; `override:` swaps only the procedure body for the
  repo's file (structural, not textual).
- **Injection survives the factoring at all three points:** hooks fire at the tool-call
  layer; `context:` files are appended at agent-spawn time (invocation prompt, assembled
  by the session per the ORCHESTRATOR's assembly rule — held there precisely so an
  `override:` can never drop it); `override:` swaps the loaded skill's procedure body
  for the repo file (the preamble still runs). Skill text itself is never
  parameterized — the session applies declination *around* it, by design.
- **Agent defs carry the invariant contract** (TDD steps, blocker protocol `{slice,
  reason, ≤3 options}`, no-suppression rules, artifact-is-the-handoff). The invocation
  carries only dynamics: worktree path, slice context block, diff range, declination
  context files. Subagents can die mid-flight and cannot be continued — every phase is
  designed so its committed artifact, not agent context, is the handoff, and the
  recovery is always a **fresh respawn fed from that artifact**, never a continuation.
- **Plugin hooks are global once installed** — and the spike (2026-06-12, CLI 2.1.175;
  see `forge-spike/README.md`) pinned the mechanics: (1) **plugin hooks DO fire for
  subagent tool calls** (verified: both spike hooks intercepted a subagent's Bash call)
  — no belt-and-braces duplication in agent defs needed; (2) **`updatedInput` does NOT
  compose**: same-event rewriting hooks all receive the same input snapshot and the
  last writer wins wholesale (verified: plugin rewrite silently discarded when the
  user-level rtk hook rewrote the same call; ordering ran user-source last, and that
  order is observed, not contractual). Therefore the forge git-mangler guard
  (`git diff`/`git show` without `--no-ext-diff`, which fixes difftastic but not rtk)
  uses **deny-with-corrective-message naming the exact corrected command** — verified
  to beat a concurrent `updatedInput` deterministically, order-independent. One
  corrected retry instead of a silent clobber. The `--no-verify` block is a plain deny
  with no contention concern.

## Declination manifest (`.claude/workflow.md`, committed per repo)

YAML frontmatter (parsed by the command), markdown body (rationale). Every field
optional; defaults come from capability probing. Shape:

```yaml
---
backlog: docs/BACKLOG.md                  # enables backlog-id input resolution + tick
paths: { design: docs/design, adr: docs/adr, plan: docs/plan }
context: .claude/workflow/serena.md       # GLOBAL: injected into EVERY agent invocation
gates:  # placeholder vocabulary defined below, substituted by the executor at run time
  slice: "npx vitest run <touched-tests> && npm run check:types && npx biome check <touched-files>"
  phase: "npm run validate"
  review-batch: "npm run check:spelling"  # extra per-batch gate before each fix commit
phases:
  design:   { context: .claude/workflow/faithfulness.md }   # per-phase context
  mutation: { override: .claude/workflow/mutation.md }
  merge:    { merge-flags: "--admin", non-blocking-jobs: [mutation, benchmark-compare] }
pr: { creator: session, pre-pr-gate: "npm outdated" }
scripts: { pre-teardown: .claude/workflow/serena-prune.sh }  # post-setup also available
models: {}  # per-AGENT override, e.g. { reviewer: opus } — applied at spawn time
            # (spike-confirmed: invocation param takes precedence over frontmatter)
---
```

Three declination verbs per phase: **default** (absent — capability-probed handler),
**context** (file injected verbatim into agent invocations — specializes; available
top-level for all-agents mandates like the Serena one, or per-phase), **override**
(the phase skill still loads and its preamble runs; the file replaces only the
*procedure body* — invariant survival comes from the preamble, in pipeline and
standalone alike), plus **skip: <reason>** (no-op, reason recorded
in the run record — the orchestrator-maintained record defined above, landing in the
final summary and PR body). **Protected phases refuse `skip:`** — branch, **plan**, implement,
review, refactor, and the mutation *probe* (the probe may conclude no-op; a manifest may
not pre-empt it). Plan is protected because implement's slice prompts are assembled FROM
the plan's context blocks — skipping it strands a protected phase (sequence-editing
through a dependency hole). Design stays skippable WITHOUT stranding plan: the plan
preamble probes for a design doc — present → hard input; absent → the planner's
mandatory input is the resolved brief and it performs its own exploration (slower,
never blocked). Branch accepts no skip either; a repo that rejects worktrees declares
`branch: { strategy: in-place }` (new branch in the current checkout) instead — under
in-place, the lifecycle scripts target the checkout: deps installed in place, the
mutation run-lock written at the checkout root, teardown reduced to branch deletion
(still refusing on the lock). `manifest-lint.sh` rejects skip on any protected phase.
Project policy that probing can't infer (merge flags, PR ownership, non-blocking CI
jobs) is plain frontmatter.

**Gate placeholder vocabulary** (defined by the engine, substituted by the executor):
`<touched-files>` = files changed by the unit of work being gated; `<touched-tests>` =
test files among them **plus the tests covering the touched source files** (the slice's
plan block names them; review batches reuse the round's reviewed set). Empty-set rule:
a placeholder that resolves empty drops its command from the gate chain — it never
silently passes a runner invoked with no matching files, and never blocks on vacuity.

### Injection surfaces (what a repo can inject, and where it lands)

| # | Surface | Injects | Lands |
|---|---|---|---|
| 1 | Policy fields (frontmatter) | Facts probing can't infer (merge flags, PR creator, non-blocking jobs, paths, models) | Orchestrator behavior at resolve time |
| 2 | `gates:` commands | The repo's engineering harness, any technology | Executed verbatim at slice/phase/review-batch gates |
| 3 | `context:` files (global / per-phase) | Additive constraints: tool mandates, domain invariants, extra contract lines | Appended verbatim to agent invocation prompts; read by the session for session-owned work |
| 4 | `override:` files (per-phase) | A full replacement procedure for genuinely project-shaped work | Replaces the phase skill's procedure body (the preamble still runs) |
| 5 | `skip: <reason>` | An honest no-op (non-protected phases only) | Phase skipped; reason in the run record (final summary + PR body) |
| 6 | Mechanical: repo `.claude/hooks` + `scripts:` (post-setup / pre-teardown) | Unforgettable rules (forbidden patterns) and lifecycle steps (tooling prune) | Tool-call layer / executed by the lifecycle scripts |

NOT injectable, deliberately: the phase sequence (including `skip:` on protected
phases), gate placement (commands yes, existence no), gating relationships (mutation
triage gates the PR), session-ownership boundaries, the context-assembly rule, and the
hard rules (no `--no-verify`, no red-gate commits). These live in the orchestrator —
the layer no declination verb reaches. Changing them is a plugin change, not a
declination. `manifest-lint.sh` validates the manifest against the known field set
AND value constraints (unknown keys, skip-on-protected, dangling file refs) and
refuses to run — misconfiguration fails loudly, never silently.

### Capability probes (the zero-config floor — what a bare repo gets)

| Probe | Looks for (in order) | Nothing found → |
|---|---|---|
| Package manager / deps | lockfiles (`package-lock`, `pnpm-lock`, `yarn.lock`, `Cargo.toml`, `uv.lock`, `go.mod`, …) | skip dep install, note it |
| `gates.phase` | repo-declared scripts (`validate`/`check`/`test` in package scripts, `Makefile`, `justfile`) | gate = build+test best-effort; if none, REFUSE to run implement (a workflow without any gate is not this workflow) |
| `gates.slice` | test runner config (vitest/jest/pytest/cargo/go test) | fall back to `gates.phase` per slice (slower, never gateless) |
| Mutation config | `stryker.config.*`, `mutmut`/`cosmic-ray` config, `cargo-mutants` | phase no-ops with note |
| Remote / PR | `git remote`, `gh` availability | pr + merge no-op with note |
| Default branch | `origin/HEAD`, `main`/`master` | ask the user once, record in manifest |
| Templates | repo's own ADR/design templates in `paths:` | plugin `templates/` |

## Phase/hook table

| Phase | Default handler (bare repo gets this) | tsgit declination |
|---|---|---|
| **resolve** | File path or free-text brief; backlog-id form only if `backlog:` declared | `backlog: docs/BACKLOG.md`, `^\d+(\.\d+)+$` entries |
| **branch** | `git worktree add ../<repo>-<slug> -b <type>/<slug>` (`<type>` inferred from the brief — feat/fix/chore, default feat) → run `worktree-setup.sh` (deps installed in-worktree, never symlinked) → apply declination context | global `serena.md` context (reaches every agent): activate on worktree, symbol-tools-default mandate, stale-activation recovery (mkdir placeholder → activate → rmdir); `serena-prune.sh` as pre-teardown script |
| **design** | `forge:designer` (fable): read existing design/ADR docs, write `docs/design/<slug>.md`, self-review ≤3, return decision candidates (never decides them), commit | Context adds: git-faithfulness — pin real git empirically (scrubbed env, signing off), record the matrix |
| **adr** | Session-owned. ≤3 options per decision; `docs/adr/NNN-<title>.md`; skip honestly if none. **Scope-fold rule:** decisions deviating from the design → fresh design-revision agent fed the ADRs + existing doc (artifacts, not agent context, are the handoff) | default |
| **plan** | `forge:planner` (fable): plan with **pre-chewed per-slice context blocks** (files, symbol paths, signatures, fixtures, pinned bytes); slice sizing rules (no test-only slices). **Gate: `plan-lint.sh`** validates every slice carries its block before the phase closes | default |
| **implement** | One `forge:slice-implementer` (sonnet) per slice, sequential, shared worktree. Slice gate from manifest `gates.slice`; session verifies each commit; full `gates.phase` once after the last slice | gates as in manifest above |
| **review** | Parallel read-only `forge:reviewer` (fable) per dimension — default set: code, security, tests, perf (perf calibrates to the diff; zero findings legitimate). The tests dimension **excludes mutation analysis** (deferred to the mutation phase — never anticipated or duplicated here), with one carve-out: reviewers MAY flag **suspected-equivalent mutants as advisory notes** — that prediction is precisely the input the mutation triager's prompt consumes; only the full analysis is deferred. Session applies all fixes, batches per dimension; each batch gates on the targeted checks (`gates.slice`) + `gates.review-batch` before its commit; `gates.phase` per round. Convergence: LOW-only → done, no relaunch; MEDIUM+ → fresh reviewer scoped to the fix delta only; ≤3 cycles. HIGH/CRITICAL security → user sees the fix diff before commit | review-batch spelling gate; perf dimension scoped to CLAUDE.md §Performance |
| **refactor** | Session owns judgment (in-thread candidate scan seeded by the diff, scoped specs); `forge:refactor-executor` (sonnet) executes; behavior-preserving, integrate-don't-defer, no-op needs written justification; re-review scoped to refactor diff; runs **before** mutation | default |
| **mutation** | **Probe (preamble):** mutation config present? Absent → no-op with note. Present → background run scoped to the PR's touched code, **writing a run-lock file in the worktree** (cleared when the run lands); **docs phase may run in parallel while it grinds**; PR waits for triage (orchestrator invariant); `forge:mutation-triager` (sonnet) kills or documents equivalents — **reviewer-predicted equivalent mutants are passed verbatim into its prompt** (assembly rule + triager agent contract, both non-overridable homes). **Never destroy the worktree while a run is alive** — mechanically backed by `worktree-teardown.sh` refusing on the lock (lock carries PID + timestamp; teardown auto-clears a dead-PID lock, otherwise requires an explicit force flag — recorded in the run record in pipeline mode; standalone, the flag itself is the explicit user intent and the script echoes what it destroyed) | `mutation.md` override (body only): Stryker line-range scoping recipe, `--incremental`, vitest-4 false-survivor triage (hand-apply mutant → run named test), post-refactor scope = whole files + triage filters to feature-changed logic, concurrency safety (run only after sandbox copy completes; never `npm install` during the run) |
| **docs** | Runs **in parallel with the background mutation run**. `forge:docs-writer` (sonnet) for affected pages only (skip honestly if none). **Backlog tick:** `forge:backlog-ticker` (haiku) flips `[ ]`→`[x]` + appends refs ONLY — **session guard: accept only if the diff touches exactly the expected lines, else redo in-session** (a delegated agent has rewritten entry bodies before). Session keeps synthesis: follow-up backlog entries, PR body | Backlog follow-ups placed in dependency order (manifest body note) |
| **pr** | Probe remote — none → pr **and** merge no-op with note (work stays on the local branch). Else push `-u`; `pr.creator: session\|user` decides who runs `gh pr create` (default: session); `pr.pre-pr-gate` runs first — gate contract is **check + documented remediation + documented exceptions** (remediation/exceptions in the manifest body or a phase context file, never memory) | `creator: session`; pre-PR gate `npm outdated` → bump in own `chore(deps)` commit; documented exception: `@ls-lint` same-version publisher false flag (local-only, ignorable) |
| **merge+cleanup** | Monitor CI → fix to green (skip `non-blocking-jobs`) → **user confirms** → `gh pr merge --squash --delete-branch <merge-flags>` → `worktree-teardown.sh` (uses `git sync` if available, else fetch+prune+remove) → declination teardown | `--admin` flag; non-blocking: `mutation`, `benchmark-compare`; teardown prunes the worktree's `~/.serena` project entry (the activate/prune matched pair, now script-enforced) |

Hard rules (unchanged, now living in the orchestrator + agent defs + hooks): never
commit on a red gate, never `--no-verify` (hook-blocked), never suppression directives
(tsgit: hook-blocked in-repo), never phase/ADR refs in code (tsgit: hook-blocked),
**never skip the review dimensions**, **never skip the refactor pass** (its honest
no-op-with-justification is the only out), **mutation triage gates the PR**,
artifact-is-the-handoff, escalate blockers as `{slice, reason, ≤3 options}`.

## Memory-to-harness mapping

Model: the Stryker triage procedure (memory → project CLAUDE.md, 2026-06-12). Same
migration, final homes:

| Item (today: memory/prose) | Target layer |
|---|---|
| `--no-ext-diff` on scripted git diff/show (+ rtk literal-prefix gap) | **Mechanical** — plugin PreToolUse hook, **rtk-aware** (consolidated handling of both manglers; no reliance on hook ordering) |
| `--no-verify` ban | **Mechanical** — plugin PreToolUse hook |
| Worktree deps install, never symlink | **Mechanical** — `worktree-setup.sh` |
| Tooling activate/prune matched pair + Serena stale-activation recovery | tsgit global `serena.md` context (activation + recovery; reaches session and every agent) + `serena-prune.sh` as `scripts.pre-teardown` |
| Closing steps (CI monitor, ignore non-blocking jobs, admin merge, `git sync`, prune) | merge handler default + tsgit manifest fields |
| Scope-fold → fresh design-revision agent | adr phase default handler |
| Reviewer-predicted equivalent mutants → triage prompt verbatim | orchestrator assembly rule + `forge:mutation-triager` agent contract (both non-overridable; stated in the default mutation row, not the tsgit override) |
| Post-refactor mutation whole-file scope + triage filter; concurrent-Stryker safety | tsgit `mutation.md` override |
| Stryker false-survivor triage (already in project CLAUDE.md) | tsgit `mutation.md` override (single home; CLAUDE.md keeps a pointer) |
| Session creates PRs; admin-merge necessity | tsgit manifest `pr.creator` / `merge-flags` |
| Backlog dependency-order convention | tsgit manifest body |
| Plan-as-knowledge-handoff contract | `forge:planner` contract + **mechanical** `plan-lint.sh` gate |

## Migration plan

0. **Spike — DONE (2026-06-12, CLI 2.1.175; record: `forge-spike/README.md`).**
   (a) hooks fire in subagents: CONFIRMED → belt-and-braces dropped; (b) `updatedInput`
   composition: same-snapshot last-writer-wins, user source ran last → git-mangler
   guard is deny-with-corrective-message (verified to beat concurrent rewrites);
   (c) per-invocation `model` overrides agent frontmatter: CONFIRMED (transcript-
   verified) → `models:` manifest field implementable; (d) `/forge:run` + `$ARGUMENTS`:
   CONFIRMED verbatim.
1. **Build the plugin** (new repo + personal marketplace entry): 12 skills (run + 11
   phases), 8 agent defs, 2 hooks, 4 scripts, 3 templates. Distil the engine text from
   `apply-workflow.md`, genericized — each step of the old command becomes a phase
   skill; the invariants become the `run` orchestrator's text.
2. **tsgit declination** (feature branch): add `.claude/workflow.md` manifest +
   `.claude/workflow/{serena,faithfulness,mutation}.md` + `serena-prune.sh`; delete
   `.claude/commands/apply-workflow.md`;
   update CLAUDE.md §Development Workflow to point triggers ("apply the workflow", "the
   usual flow") at `/forge:run` + manifest; move the CLAUDE.md Stryker-triage notes into
   `mutation.md`, leaving a pointer. The `npm outdated` ls-lint false-flag caveat lands
   in the manifest body (versioned), NOT memory.
3. **Global CLAUDE.md**: replace the "Default feature workflow" section with the ~3-line
   trigger pointer ("use my default workflow" → `/forge:run`); delete the precedence rule.
4. **Prune migrated memories** (each now harness-owned): `--no-ext-diff`/rtk manglers,
   worktree node_modules, Serena lifecycle + stale-activation, closing steps, admin-merge,
   PR creator, backlog ordering, apply-workflow learnings, equivalent-mutant triage
   pointers. Keep only genuine scratch (e.g. upstream-bug status); anything a workflow
   run depends on must have landed in a versioned layer first.
5. **Validate fresh-machine operability**: run `/forge:run` on a small tsgit backlog
   item in a session with memory ignored; checklist — hooks fired (observe an injected
   `--no-ext-diff` surviving rtk), setup script ran, manifest-lint + plan-lint gated,
   manifest fields honored (admin-merge, non-blocking jobs, skip-protection), no step
   needed a memory recall.
6. **Second instantiation smoke test** (proves the abstraction): point `/forge:run` at
   a repo with no manifest; confirm the probe table's fallbacks engage (mutation no-ops
   with a note, backlog input form disabled, gates discovered or refused per spec).
