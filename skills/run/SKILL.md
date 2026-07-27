---
name: run
description: Run the craft feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description. Triggers - "apply the workflow", "use my default workflow", "craft this".
argument-hint: <backlog-id | path/to/spec.md | "feature description">
---

# craft — orchestrator

You are running the craft workflow. The SESSION is the orchestrator: it resolves the
input, talks to the user (ADRs, escalations, merge confirmation), verifies every
delegated artifact, applies review fixes, runs phase-boundary gates, and owns all
synthesis (run record, backlog follow-ups, PR body). Heavy work runs in the craft role
agents per each phase skill's instructions.

Input: `$ARGUMENTS`

## 0 — Resolve

0a. **Parse craft flags from the input** first: strip any `--profile <name>`,
   `--skip <id,…>`, repeatable `--harness <phase>.<knob>=<value>`, and repeatable
   `--policy <action>=<verdict>` tokens (they may appear anywhere — lead or trail;
   comma-split the skip ids; `--harness` and `--policy` may each be repeated for multiple
   knobs/actions). Also strip `--config <name>` when present (at most one occurrence);
   hold the name for manifest-path resolution below.
   **`--config` is distinct from `--profile`**: `--config` selects *which manifest file
   is read*; `--profile` sets the *execution map inside* that manifest. The two compose —
   both may be present in the same invocation. Hold `--profile`/`--skip`/`--harness`/`--policy`
   for step 1b. The
   **non-flag remainder is the input brief** consumed at step 2 — a flags-only
   input (e.g. `--profile lean`) leaves an empty brief, and step 2 STOPs as
   ambiguous exactly as a zero-argument invocation does. These are per-invocation
   overrides: they win over the manifest's `pipeline.profile`/`pipeline.skip`/`phases.<id>.harness`/`policy:`
   (the bin merges them at highest precedence).

0b. **Resolve the manifest path.** When `--config <name>` was parsed in step 0a:
   run `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/config-resolve.js" <name>` via Bash. This
   resolves `<name>` across BOTH scopes — local `./.claude/craft-<name>.md` (always wins)
   then user `~/.claude/craft-<name>.md` — so there is no separate existence check.
   - On exit 0: stdout is the ABSOLUTE winning path — hold it as `<manifest-path>`.
     Surface any stderr scope/shadow note into the run record (advisory; the config
     still resolved). Steps 1 (`manifest-lint.sh <manifest-path>`) and 1b
     (`pipeline-resolve … [manifest-path]`) pass it through UNCHANGED — both already
     accept an absolute path.
   - On non-zero exit: STOP; surface stderr verbatim — either the two-scope
     neither-found diagnostic (names both `./.claude/craft-<name>.md` and
     `~/.claude/craft-<name>.md`) or a bad-name/traversal diagnostic. Never silently
     fall back to `.claude/workflow.md`.
   When `--config` is absent: use `.claude/workflow.md` as `<manifest-path>` (today's
   behaviour, unchanged).

1. Run `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/manifest-lint.sh" <manifest-path>` (passing the
   resolved path from step 0b). It must pass — on INVALID, STOP and surface the errors.
   Read the manifest (frontmatter = config, body = policy rationale). No manifest =
   pure defaults via each phase's capability probe.

1b. Run `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/pipeline-resolve.js" \
        "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/pipeline/default.yml" [manifest-path] \
        [--profile <name>] [--skip <id,…>] [--harness <phase>.<knob>=<value>]… \
        [--policy <action>=<verdict>]…` via Bash,
    capturing stdout. The manifest path argument (the resolved path from step 0b) is
    included only when a manifest file was found in step 1; the `--profile`/`--skip` flags
    are appended only when parsed in step 0a; each `--harness` occurrence is forwarded as a
    separate `--harness <phase>.<knob>=<value>` argument in the order parsed; each `--policy`
    occurrence is forwarded as a separate `--policy <action>=<verdict>` argument in the order
    parsed. The bin folds all three over the manifest at highest precedence — CLI `--harness`
    and `--policy` values win over their manifest counterparts (a bad knob value or unknown
    phase or unknown action exits non-zero; stderr names the violation).
    - On non-zero exit (this includes resolver `ok: false` — a rejected `role:` or a
      stranded consumer — whose `errors[]` are written to stderr, never as stdout JSON):
      STOP; surface stderr to the user; refuse to proceed.
    - If `effective[]` is empty: STOP; surface "no enabled phases in resolution".
    Parse the JSON as `Resolution`.

1c. Seed the run record (step 4) with every entry in `Resolution.record[]` as
    its initial lines. Subsequent phase outcomes, skip reasons, no-op
    justifications, probe results, and forced actions are appended.

1c-mem. **Load memory store (once per run).** Resolve the store path from the
    manifest's `memory.ref` (default `.claude/craft-memory.md`, ADR-118/121), rooted
    at the repo ROOT (the worktree/checkout root — NEVER `${CLAUDE_PLUGIN_ROOT}`, hard
    constraint). Call `load(repoRoot, deps)` — see `docs/contributing/specs/memory.md` Claude
    binding. Hold the single `MemoryView` in-session beside the run record for the
    duration of this run. A cold, absent, or malformed store yields an empty view and
    records a load no-op — the run proceeds exactly as today (advisory-only, never a
    blocker; ADR-116/120). `load` is called **once per run, not per phase**.

1c-int. **Load intention view (once per run).** Build an in-session `IntentionView` via
    the intention port's `consult` — see `docs/contributing/specs/intention.md` `file` adapter
    procedure. With no `intention:` manifest key, probe the zero-config corpus
    (`docs/contributing/specs/*.md`, `docs/DESIGN-*.md`, `docs/DOD.md`, `docs/guides/customizing.md`);
    hold the single `IntentionView` in-session beside the run record for the duration of
    this run. A cold or absent corpus yields an empty view and records a load no-op —
    **never a blocker** (advisory). This view is **not** carried in the `MemoryView` — a
    genuine parallel mechanism, loaded once here exactly like the memory store above but
    kept in its own in-session slot. `consult` is called **once per run, not per phase**.
    Two fixed, greppable run-record tokens join the existing family
    (`NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`):
    `INTENTION-DRIFT(<page>): <changed-path>` and `INTENTION-WAIVE(<page>): <reason>` —
    see `docs/contributing/specs/intention.md` Token vocabulary; emitted by the `validation` phase's
    `assert-fresh` walk. Four more tokens join the same family from the `ci.sh` hygiene
    cadence: `STUB-FOUND(<file>): <marker>@L<n>`, `STUB-WAIVE(<file>): <reason>`,
    `SLOP-FOUND(<file>): <entry>`, and `SLOP-WAIVE(<file>): <reason>`.

1d. `Resolution.gateDecisions` is an ARRAY of `{ phaseId, gate, codeProducing }`
    (the `propose` entry also carries `awaitingHarnesses[]`). Find the entry whose
    `phaseId === "propose"` and store its `awaitingHarnesses[]` in-session as the
    executing-harness ids that must land before `propose` starts `pr create`
    (a missing entry or absent field = the empty set).

1e. Surface `Resolution.waivers[]` in the run record. The engine pre-formats a
    `WAIVER: …` line into `record[]` **only for executing-harness skips**
    (`proposeGateReleased: true` — e.g. `validation`/`architecture`); those arrive
    via step 1c. For every OTHER waiver (a skipped `review`/`refactoring`,
    `proposeGateReleased: false` — the engine writes no record line), append your own
    loud waiver notice to the run record so **every** skip is visible (ADR-005).
    Use `waivers[]` for the gate-release decision (each `proposeGateReleased: true`
    releases that phase's `propose`-gate).

2. Classify the input (the non-flag remainder from step 0a): **backlog id** (matches the
   repo's backlog convention — only if the manifest declares `backlog:`; look the entry
   up there) | **file path** (read it) | **free-text brief** (use verbatim). Empty or
   ambiguous → STOP and ask. For the per-source `resolve` mechanism see
   `docs/contributing/specs/backlog.md`: for `source: file`, classify by the repo's backlog
   convention (prose-judgment) and resolve by reading the entry; for `source: custom`,
   the script owns the id-form and resolve runs `ref` with argv `["resolve", id]` —
   `id` is untrusted, passed as a discrete argument (never spliced into a shell string)
   and validated against the source's id-form before invoking (see the spec's safe-invocation
   note). Id-not-found, an id failing the id-form, or an unreachable `custom` source is a
   **runtime blocker** (never a guessed brief).
3. Derive a kebab-case topic slug (≤6 words). Print:
   `Resolved → topic: <slug>, brief: <one line>` for user confirmation.
4. Open the **run record** (in-session ledger): seeded from `Resolution.record[]`
   (step 1c); every subsequent phase outcome, skip reason, no-op justification, probe
   result, and forced action is appended. It ships in the final summary and the PR body.

## Phase walk (driven by Resolution.effective[])

Walk each phase descriptor in `Resolution.effective[]` order. For each phase:

1. **Necessity probe (auto-skip).** If `phase.autoSkipEligible` is `true`, evaluate against the
   live change whether the phase has any work *before assembling the contract*. The per-phase
   signal (auto-skip only when **provably empty**; any doubt runs the phase):

   | Eligible phase | Provably-empty signal ⇒ auto-skip |
   |---|---|
   | `decisions` | the design doc's Decision-candidates section is empty (no load-bearing choice to put to the user) — the up-front form of the runtime decisions no-op; session-owned, so auto-skip avoids an empty user conversation rather than an agent spawn |
   | `review` | no reviewable source diff in scope since `implementation` (e.g. a docs/config-only change) |
   | `refactoring` | no source change in scope to motivate a structural pass (same signal as `review`); when source *was* touched, it runs and may record `NO-OP(refactoring):` |
   | `documentation` | no `design`/`change` content maps to any documentation surface |
   | `validation` | no mutable code changed in scope — the technique no-op signal, evaluated *before* spawning the run |
   | `architecture` | no dependency-graph-affecting change (no import/module-boundary edits) since `implementation` |

   When provably empty: (a) append the fixed token
   `auto-skip: <phase> — evaluated unnecessary (<signal>)` to the run record (e.g.
   `auto-skip: review — evaluated unnecessary (no source diff in scope)`) — distinct from `WAIVER:`
   and `NO-OP(<phase>):`; (b) if the phase is an executing-harness, release its `awaitingHarnesses`
   entry (see Cross-phase invariants); (c) continue WITHOUT running the phase — no contract
   assembled, no agent spawned, no commit. When the probe is non-empty, or the phase is not
   `autoSkipEligible`, the phase runs exactly as today. When emptiness cannot be proven, RUN the
   phase (doubt runs; never auto-skip on an unprovable judgment).

2. **Resolve the skill** — invoke `phase.procedure` **verbatim** (the descriptor's
   `procedure:` field — e.g. `craft:design`, or an inserted phase's `craft:bench` /
   `acme:bench`). For every craft-native phase the procedure is `craft:<phase.id>` and the
   skill dir name equals `phase.id`, so default phases are unaffected. An **inserted** phase
   carries its own `procedure:` and may name a craft-local skill or a namespaced one — the walk
   dispatches the string as-is; cross-plugin dispatch is SP2-proven, and the derived-plugin
   *registration* surface (`craft.extends:`) registers the phases/agents the walk dispatches —
   a registered or inserted phase resolves, carries its contract bundle, and executes under the
   engine-owned contract. `requirements` and `architecture` are default-off and have no skill dir until P10.
   If the skill or plugin a `procedure` names is not installed (no `skills/<id>/` dir for a
   craft-native procedure; no installed plugin for a namespaced one) → the loud STOP
   "procedure `<phase.procedure>` resolves to no installed skill" — the intended guard, not a
   silent skip. **Swap-fidelity (G5) — a swap changes *who* runs a phase or *which skill*
   orchestrates it, never *what invariants bind it*.** A manifest may swap a default phase's
   worker (`phases.<id>.role`) or its orchestrating skill (`phases.<id>.procedure`); either way
   the descriptor `id` is unchanged, so the injected contract (step 4) — assembled from that `id`
   — is identical, and the swapped worker (agent or inline) always runs inside the same
   engine-owned contract. A `role:`- or `procedure:`-swapped phase can never drop the invariant
   core. A swapped default-phase `procedure:` is dispatched **verbatim** exactly like an inserted
   one (above); a procedure that resolves to no installed skill STOPs via the same "resolves to no
   installed skill" guard. A swapped `role:` the resolver's `roleExists` probe rejects makes
   `pipeline-resolve` exit non-zero at §0 (resolver `ok: false`) — the role case of the existing
   non-zero-exit error-path row — before the walk dispatches anything, uniformly for agent and
   inline. The bin wires a live install-probe for craft-native `craft:<role>` refs (a typo'd role
   fails closed); external `my:`/`acme:` refs fail closed unless the ref is registered via
   `extends` (`extends.agents` ∪ the `role:` of every registered/inserted phase). **Inserted/registered-phase contract execution ships:** the walk passes the resolved descriptor to
   `contract-assemble` via `--descriptor-json` (step 4), so a novel/registered `id` EXECUTEs
   under the engine-owned contract — the same core + declared bundles that wrap any default phase.

3. **Resolve execution** — use `phase.execution` (`agent` | `inline`) from the
   Resolution. Apply manifest override (`phases.<id>.override`,
   `phases.<id>.context`) as before.

4. **Assemble the injected block** — at phase entry run:
   ```
   node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/contract-assemble.js" \
     --descriptor-id <phase.id> \
     [--manifest <manifest-path>] \
     [--inline]          # only when phase.execution is "inline"
     [--contracts-dir "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/contracts"]
   ```
   For an inserted or registered phase (any phase whose `id` is not among the engine defaults),
   append `--descriptor-json <path>` where `<path>` is a temp file the walk writes the
   resolved descriptor JSON to (single object or array written via `writeFileSync`), or
   `--descriptor-json -` to pipe the JSON on stdin. The flag value is a **file path** (or
   the literal `-` for stdin) — the bin reads the content with `readFileSync(path)` / reads
   stdin; passing JSON text inline as the arg value does not work. The bin resolves
   `phase.id` against the loaded descriptor set so the registered id EXECUTEs; the
   default-phase path (no flag) is unchanged.
   Via Bash, capturing stdout as the **injected contract block**. On non-zero
   exit: STOP; surface stderr; refuse to proceed. On **agent** execution the
   block is PREPENDED to the Task spawn prompt. On **inline** execution the
   block is loaded into the session at phase entry and the session follows it.

   **Memory hint (advisory).** Before assembling the block, slice the in-session
   `MemoryView` for this phase's concern(s) (see per-phase notes in each phase skill's
   Preamble). If the slice is non-empty, **prepend it into the injected contract block
   as part of the pre-chewed context** — this is slot 1 of the **Agent spawns**
   invariant below (the same slot whether the phase is agent-spawned or inline; no
   second injection surface is added). A hint that failed validate-on-read was already
   dropped at `load` — if the slice is empty, the phase probes as today. This read is
   purely advisory and never gates. See `docs/contributing/specs/memory.md` Claude binding.

   **Intention hint (advisory).** For the `design` and `planning` phases only, slice the
   in-session `IntentionView` for this phase's change scope: the `entries` whose subjects
   intersect the phase's touched set. If the slice is non-empty, prepend it into the SAME
   slot-1 prepend, alongside the memory hint — no second injection surface. An empty slice
   means the phase probes as today. See `docs/contributing/specs/intention.md`.

5. **Execute** via the resolved execution mode (`phase.execution`).

   **`agent`** (default): spawn `craft:<role>` (or the manifest-swapped role) as a Task,
   structured per the **Agent spawns** invariant below — the step-4 injected block
   PREPENDED to the spawn prompt, then working dir, task dynamics, artifact paths. Await
   the commit; verify on return.

   **`inline`**: run the phase body **in-thread — no Task spawn**. The step-4 block was
   assembled with `--inline`; load it as the governing constraint for this phase. If
   `phase.role` is present AND resolves to a **local** agent def
   (`agents/<name>.md`, `<name>` = the role ref minus any `craft:` namespace), **also load
   that agent body (sans frontmatter)** right after the block and follow it as
   self-directed craft — the same two artifacts a spawn carries, in the same order; the
   spawn-only "final message to the parent" line is moot (no parent). A role that resolves
   to no local def (e.g. `acme:planner`) runs on the block alone. The session is both
   orchestrator and worker for this phase. Verify, gate, record, and handoff are
   **identical** to `agent` — the block already carries the inline carve-outs (the commit
   is the handoff; the session model). Role-less phases
   (`workspace`/`decisions`/`propose`/`integrate`) are session-owned regardless of mode.

   Session-owned responsibilities by archetype:
   - `setup`: workspace preparation and setup
   - `specification`: verify artifact; conversation if no `role` field (decisions)
   - `construction`: verify each part; run phase gate per gate-cadence invariant
   - `harness` (`harness-read ∈ contract`): apply ALL findings; converge per the
     `phase.harness` knobs (dimensions/passes/max_cycles/convergence — `craft:review` reads them)
   - `refinement`: judgment (scan + scoping); apply ALL findings
   - `harness` (`harness-exec ∈ contract`): start background run with the `phase.harness`
     tool/scope/incremental (`craft:validation` reads them); gate `propose`
     on triage completion (see invariants below)
   - `delivery` (`documentation`): synthesis (follow-ups, backlog guard) — may
     parallel a running executing-harness
   - `delivery` (`propose`): pre-propose gate; body; PR creation per policy — does
     NOT start until every id in the in-session `awaitingHarnesses` set has landed
     and its gate is green
   - `delivery` (`integrate`): user confirms; cleanup

6. **Gate** — read the gate string (`.gate`) from the `Resolution.gateDecisions`
   entry whose `phaseId === phase.id`.
   If `codeProducing: true`: apply gate-cadence invariant (targeted gate per fix
   commit; phase gate once per round; never commit on known-red).
   If `codeProducing: false` and gate non-empty: run gate once at phase boundary.
   If gate is empty string: no gate check.

7. **Record outcome** in the run record (appended to the seeded entries). An
   inline-executed phase is noted: `inline: <phase.id> — ran in-session`. At each
   phase boundary where a gate ran, append the fixed greppable token
   `GATE(<phase.id>): green` or `GATE(<phase.id>): red` to the run record — one
   line per phase gate result. An auto-skipped or waived executing-harness records
   no `GATE(...)` line (the phase did not produce a recorded gate result). A judgment
   phase (`decisions`/`refactoring`) that records a `NO-OP(<phase>):` line — e.g.
   `NO-OP(decisions): no user-judgment decisions — …` or `NO-OP(refactoring): nothing
   cleared the bar — …` — has produced its outcome; it is NOT a missing artifact and
   never re-runs or escalates as a gap. The `validation` phase's DoD sub-concern
   records a `NO-OP(verify): no DoD declared — …` line under the same convention:
   it has produced its outcome; it is NOT a missing artifact and never re-runs or
   escalates as a gap.

8. **On blocker**: escalate `{ phase/part, reason, ≤3 candidate options }`. Never
   spin, never silently abandon.

9. **On model-down** (not a task blocker): mark tier degraded; re-resolve to
   fallback; respawn from artifact. Record degradation in run record.

`design` and `review` are already concern-named (no alias); every other craft-native phase
id maps to a `skills/<id>/` dir of the same name after the P4 rename, so its `procedure` is
`craft:<phase.id>` and the walk dispatches it with no translation table. Inserted phases
bring their own `procedure`, dispatched verbatim (step 2).

### Walk error paths

| Condition | Behavior |
|---|---|
| Non-zero exit from `pipeline-resolve` (incl. resolver `ok: false` — a swapped `role:` the `roleExists` probe rejects, or a stranded consumer — whose `errors[]` are written to stderr, never stdout JSON) | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase's `procedure` resolves to no installed skill (no `skills/<id>/` dir for a craft-native procedure, e.g. an enabled requirements/architecture pre-P10; no installed plugin for a namespaced one; **incl. a swapped default-phase `procedure:`**) | Stop; surface "procedure `<phase.procedure>` resolves to no installed skill" |
| `awaitingHarnesses` on `propose` is empty | Propose is not gated on any harness; proceed normally |
| `waivers[]` is non-empty | Executing-harness waivers are pre-formatted in `record[]`; surface every other waiver (review/refactoring) to the run record yourself per §1e; continue |
| A skip strands a consumer | `ok: false` already; covered by the stop-on-error path |
| manifest-lint exits 2 (invalid) | Stop; surface errors (existing behavior; unchanged) |

## Cross-phase invariants (non-overridable)

- **Executing-harness triage gates `propose`**: a phase is an executing-harness when
  `archetype: harness` and `harness-exec ∈ contract`. `propose` does not start
  `pr create` until every phase id in the in-session `awaitingHarnesses` set (the
  `awaitingHarnesses[]` of the `Resolution.gateDecisions` entry whose
  `phaseId === "propose"`, captured in §0 step 1d) has landed its run and its gate is
  green. `documentation` (archetype: `delivery`) may parallel a
  background executing-harness; `propose` may not.
  If an executing-harness was waived (skipped via `pipeline.skip`), its gate is
  released — the waiver is in `Resolution.waivers[]` and pre-formatted in
  `Resolution.record[]` — and `propose` may proceed without waiting for it.
  Likewise, if an awaited executing-harness **records a runtime no-op** — it is
  enabled and in `effective[]` (so it carries no engine waiver and IS in
  `awaitingHarnesses`), but at runtime its tool-agnostic probe finds nothing and
  the phase ends with a note, never landing a run — its `awaitingHarnesses` entry
  is released, symmetric to the skip-waiver above. This release is NOT an engine
  waiver (the engine emits waivers for skip/disable only, when the phase is absent
  from `effective[]`); it is the orchestrator treating a recorded no-op as a
  release at gate-check time, so `propose` may proceed without waiting for the
  no-op'd harness. Likewise, a recorded `auto-skip:` of an awaited executing-harness (it never
  lands a run, by the same up-front necessity probe) releases its `awaitingHarnesses` entry the
  same way — the orchestrator treats a recorded `auto-skip:` as a release at gate-check time,
  exactly as it treats a recorded no-op; this is NOT an engine waiver (the phase is in
  `effective[]`). So `propose` is never left waiting on a harness that auto-skipped.
  Clarification for `validation`: the entry may carry two recorded
  sub-outcomes — the technique note AND a `NO-OP(verify):` line (DoD sub-concern);
  the entry is **released** only when no technique run lands, and is **satisfied** by
  a landed and triaged technique run regardless of any `NO-OP(verify):` line — the
  verify no-op never independently blocks or releases the single gate entry.

- **Scope expansion re-enters the harness-read phase**: any feature behavior added
  after a phase with `archetype: harness` and `harness-read ∈ contract` has run —
  during phases of archetype `construction` or `refinement` — that is NOT a fix to an
  existing finding gets its own feature-scoped review before the executing-harness gate
  closes. The `refinement` phase's re-review is scoped to the refinement diff only and
  does not substitute. A scope expansion that reaches the executing-harness gate
  unreviewed is a workflow breach.

- **Artifact is the handoff**: every delegated agent's contribution must be in a
  committed artifact before the phase closes. A dead agent = fresh respawn fed from
  the artifact, never a continuation.

- **Gates**: each fix commit gates on the TARGETED check (`gates.part` over the
  touched files + `gates.review-batch` if declared); the full phase-boundary gate
  runs ONCE per round — after each code-producing phase, after each
  `harness`/`refinement` fix round, and before push — not after every intra-round
  commit. Nothing is ever committed on a known-red gate.

- **Agent spawns**: every role-agent spawn is structured as:
  1. **Injected contract block** (from step 4 above, includes the assembled core +
     bundle invariants + derived retrieval note + manifest `context:` appended by
     the assembler; **plus the memory hint prepended** when the MemoryView slice for
     this phase is non-empty — see step 4 memory-hint clause and `docs/contributing/specs/memory.md`
     Claude binding). Do NOT separately re-inject `context:` — the assembler already
     appends it; double-injection is a breach.
  2. **Working directory** and **task dynamics** (phase id, part text, gate string).
  3. **Artifact paths**: committed artifacts passed by PATH — the agent reads them
     in-place. The prompt embeds the pre-chewed context and the load-bearing deltas,
     not a second verbatim copy. A respawn from a partial artifact points at the
     on-disk state rather than re-transcribing it.
  The pre-chew mandate forbids making an agent re-explore the codebase — reading a
  committed plan is not re-exploring.
  (This block is the Execution port's spawn verb — the Claude binding. See docs/contributing/specs/execution.md.)

- **Model resolution & fallback**: resolve each spawn's model as manifest
  `models.<role>` → the descriptor's `model:` field (the canonical per-role tier;
  the agent-def frontmatter pin is the Claude binding of that same tier) →
  `models.fallback` → engine default `sonnet` → session model (pass the resolved
  tier as the spawn's model param). If a spawn dies on a model-availability error
  (model down/overloaded/unknown — NOT a task blocker, which uses the blocker
  protocol), mark that model **degraded for the rest of the run** and re-resolve to
  `models.fallback` if declared, else the engine default `sonnet`, else the session's
  own model (guaranteed available). Record the degradation in the run record,
  then respawn from the artifact. Once a tier is known degraded this run, later spawns
  skip straight to the fallback — never pay the same dead spawn twice.
  (This is the Model port's select/isAvailable — the Claude binding. See docs/contributing/specs/model.md.)

- **Blockers** escalate to the user as `{ phase/part, reason, ≤3 candidate options }`
  — never spin, never silently abandon.

- **Policy consult**: before any phase performs a nameable outward action (a member of
  `POLICY_ACTIONS` — see `docs/contributing/specs/policy.md`), the session calls
  `Policy.consult(action, { effectivePolicy: Resolution.policy, binding })` over the
  held `Resolution.policy` and the active binding, and obeys the returned surface:
  `proceed` (execute silently), `ask-then-proceed` (raise `AskUserQuestion` then
  execute on approval), `refuse` (do not execute; no-op or block per reversibility),
  or `degrade-to-blocker` (headless `ask` with no pre-approval — block and record).
  One `POLICY(...)` token is appended to the run record per consult (see
  `docs/contributing/specs/policy.md` greppable record tokens). The three engine floors
  (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`) are
  **not** in `POLICY_ACTIONS` and are never consulted — they remain absolute.

- **Provenance**: no phase/ADR/backlog references inside source or test code, ever.
  Design docs and the PR body carry provenance.

## Manual acceptance check (inline fidelity) — not CI-gated

On demand / as a release smoke test: invoke craft with `--profile lean` (or `solo`) on a
real brief, confirm the inline phases commit artifacts in the same shape as the agent path
(the injected block differs only by the two carve-out lines —
`engine/test/contract-equivalence.test.js` proves that bound per descriptor), and record
the result in the run record under `inline-fidelity-check`. Rationale:
`docs/archive/DESIGN-P6-execution-topology.md`.

## Model-class matrix (cross-tier) — not CI-gated

On demand / when a maintainer wants the full-pipeline + output-quality matrix: run the
full pipeline across the Claude class — opus (`claude-opus-4-8`), sonnet
(`claude-sonnet-4-6`), haiku (`claude-haiku-4-5-20251001`) — on a representative brief,
record a tier×dimension PASS/PARTIAL/FAIL table (dimensions: planner / part-TDD /
structured-review / blocker / full-pipeline-completion), and capture the per-phase
tokens + wall-clock into the committed artifact and the run record.

**Numbers are harness-sourced.** The orchestrator reads `subagent_tokens` and
`duration_ms` from the usage block the spawn already returns — exact, zero-cost. No
agent is asked to report its own usage.

**Where results land:** fill `docs/guides/model-class-matrix.md` (the committed, diffable
artifact template) and append a one-line entry to the run record under
`model-class-matrix`. Rationale: `docs/archive/DESIGN-P13-nfr-hardening.md`.

## Registered-phase dispatch smoke — not CI-gated

On demand / when end-to-end cross-plugin fidelity must be confirmed: spin up a throwaway
two-plugin fixture (mirroring SP2's `/tmp/craft-sp2`) and drive it with
`claude -p --plugin-dir craft --plugin-dir <pluginB>`, using a manifest that registers a
phase via `extends.phases` pointing at a `pluginB:` procedure. Assert the registered phase
dispatches (the walk reaches step 2 for it) and spawns (an agent is started under the
assembled contract). Document the result in the run record. This smoke is on-demand, NOT
CI-gated — the engine path it exercises is CI-proven by the S7 scenario fixture; this smoke
adds runtime cross-plugin fidelity without coupling CI to a second install.

## SC5 second-instantiation smoke — not CI-gated

On demand / when zero-config fidelity on a non-tsgit toolchain must be confirmed: take a
second repo with a test command discoverable without a manifest and **no** `.claude/workflow.md`
(e.g. a small Python + `pytest` project), then drive the default pipeline against it on a small
free-text brief (zero manifest ⇒ no `backlog:`, so the input is a brief/file, never a backlog
id). Confirm the per-phase capability-probe matrix: `worktree-setup.sh` detects the ecosystem
(or reports a noted skip when no lockfile is recognized); the gate probe discovers the repo's
test command (`pytest`/`go test`/`cargo test`/…) and `implementation` runs rather than hitting
the gate-floor REFUSE; `validation` no-ops with a note when no techniques declared/probed
(and its `propose`-gate entry is released, so the walk reaches `propose`); `propose`/`integrate`
no-op when there is no remote. Record the target's identity, toolchain, discovered gate command,
and per-phase outcomes in `docs/archive/SC5-second-instantiation-record.md`. This smoke is on-demand, NOT
CI-gated — the engine path it exercises (toolchain-neutral resolution) is CI-proven by the `SC5`
scenario fixture; this smoke adds runtime fidelity on a real second toolchain without coupling CI
to a non-JS install.

## Review cadence — engine vs working-style

The engine cadence is the single `review` phase over the whole change (per-dimension
convergence, owned by `craft:review`). The "4-dimension review after every code part"
is a **session working-style** — a discipline the orchestrator may apply, not an engine
invariant. A first-class per-part review cadence (multi-reviewer fan-out, `passes>1`,
numeric convergence enforcement) is deferred to the later walk/parallelism pass, which is
its home.

## Done

**Memory save (once per run).** Derive `delta` from the run-record-buffered observations
(every concern-keyed fact each phase wrote to the run record this run). Resolve the store
path from `memory.ref` (default `.claude/craft-memory.md`) rooted at the repo ROOT, same
as `load` (the engine joins `ref` under the repo root and refuses a path that escapes it).
Call `save(repoRoot, view, delta, deps)` **once**, atomically — `view` is the run-start
`MemoryView` (so non-re-observed entries decay rather than vanish) and `deps` carries
`writeStore`/`caps`/`run`/`ref`. A failed save is a recorded
warning in the run record — **never a blocker** (ADR-120); no locking (last-flush-wins).
Writes are buffered all run and flushed once here, so a phase that blocked mid-run leaves
the store unchanged (atomicity; Req 6).

**Metrics artifact (separate, append-only).** For each agent-spawned phase that returned a
usage block, append one line to `.claude/craft-metrics.md` (ADR-119):
`<run-id> <phase-id> tokens=<subagent_tokens> duration_ms=<duration_ms> cache_read=<n> cache_creation=<n>` (degrades to `cache=na` when the split is unavailable).
Source: the usage block the spawn already returns — exact, zero extra cost. Role-less /
inline phases have no spawn usage block; omit them. Metrics go to `.claude/craft-metrics.md`
**only** — never into the learnings store `.claude/craft-memory.md`.

Final message: the PR URL (or branch name if no remote) + one-line summary + the run
record.
