---
name: run
description: Run the forge feature-delivery workflow on a backlog id, a spec/PRD file, or a free-text feature description. Triggers - "apply the workflow", "use my default workflow", "forge this".
argument-hint: <backlog-id | path/to/spec.md | "feature description">
---

# forge — orchestrator

You are running the forge workflow. The SESSION is the orchestrator: it resolves the
input, talks to the user (ADRs, escalations, merge confirmation), verifies every
delegated artifact, applies review fixes, runs phase-boundary gates, and owns all
synthesis (run record, backlog follow-ups, PR body). Heavy work runs in the forge role
agents per each phase skill's instructions.

Input: `$ARGUMENTS`

## 0 — Resolve

1. Run `"${CLAUDE_PLUGIN_ROOT}/scripts/manifest-lint.sh"` (repo manifest:
   `.claude/workflow.md`). It must pass — on INVALID, STOP and surface the errors.
   Read the manifest (frontmatter = config, body = policy rationale). No manifest =
   pure defaults via each phase's capability probe.

1b. Run `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/pipeline-resolve.js" \
        "${CLAUDE_PLUGIN_ROOT}/pipeline/default.yml" [manifest-path]` via Bash,
    capturing stdout. The manifest path argument is included only when a manifest
    file was found in step 1.
    - On non-zero exit: STOP; surface stderr to the user; refuse to proceed.
    - On `ok: false` in the JSON: STOP; surface all `errors[]` entries; refuse.
    - If `effective[]` is empty: STOP; surface "no enabled phases in resolution".
    Parse the JSON as `Resolution`.

1c. Seed the run record (step 4) with every entry in `Resolution.record[]` as
    its initial lines. Subsequent phase outcomes, skip reasons, no-op
    justifications, probe results, and forced actions are appended.

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

2. Classify the input: **backlog id** (matches the repo's backlog convention — only if
   the manifest declares `backlog:`; look the entry up there) | **file path** (read
   it) | **free-text brief** (use verbatim). Ambiguous → STOP and ask.
3. Derive a kebab-case topic slug (≤6 words). Print:
   `Resolved → topic: <slug>, brief: <one line>` for user confirmation.
4. Open the **run record** (in-session ledger): seeded from `Resolution.record[]`
   (step 1c); every subsequent phase outcome, skip reason, no-op justification, probe
   result, and forced action is appended. It ships in the final summary and the PR body.

## Phase walk (driven by Resolution.effective[])

Walk each phase descriptor in `Resolution.effective[]` order. For each phase:

1. **Resolve the skill** — invoke `forge:<phase.id>` directly: the skill dir name
   equals `phase.id` (concern names match dir names). `requirements` and
   `architecture` are default-off and have no skill dir until P10; an enabled phase
   id with no `skills/<id>/` dir is the loud STOP "unknown phase id <id>" — the
   intended guard, not a silent skip.

2. **Resolve execution** — use `phase.execution` (`agent` | `inline`) from the
   Resolution. Apply manifest override (`phases.<id>.override`,
   `phases.<id>.context`) as before.

3. **Assemble the injected block** — at phase entry run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/engine/bin/contract-assemble.js" \
     --descriptor-id <phase.id> \
     [--manifest <manifest-path>] \
     [--inline]          # only when phase.execution is "inline"
     [--contracts-dir "${CLAUDE_PLUGIN_ROOT}/contracts"]
   ```
   via Bash, capturing stdout as the **injected contract block**. On non-zero
   exit: STOP; surface stderr; refuse to proceed. On **agent** execution the
   block is PREPENDED to the Task spawn prompt. On **inline** execution the
   block is loaded into the session at phase entry and the session follows it.

4. **Execute** via the resolved execution mode. Session-owned responsibilities by
   archetype:
   - `setup`: workspace preparation and setup
   - `specification`: verify artifact; conversation if no `role` field (decisions)
   - `construction`: verify each slice; run phase gate per gate-cadence invariant
   - `harness` (`harness-read ∈ contract`): apply ALL findings; convergence
   - `refinement`: judgment (scan + scoping); apply ALL findings
   - `harness` (`harness-exec ∈ contract`): start background run; gate `propose`
     on triage completion (see invariants below)
   - `delivery` (`documentation`): synthesis (follow-ups, backlog guard) — may
     parallel a running executing-harness
   - `delivery` (`propose`): pre-propose gate; body; PR creation per policy — does
     NOT start until every id in the in-session `awaitingHarnesses` set has landed
     and its gate is green
   - `delivery` (`integrate`): user confirms; cleanup

5. **Gate** — read the gate string (`.gate`) from the `Resolution.gateDecisions`
   entry whose `phaseId === phase.id`.
   If `codeProducing: true`: apply gate-cadence invariant (targeted gate per fix
   commit; phase gate once per round; never commit on known-red).
   If `codeProducing: false` and gate non-empty: run gate once at phase boundary.
   If gate is empty string: no gate check.

6. **Record outcome** in the run record (appended to the seeded entries).

7. **On blocker**: escalate `{ phase/slice, reason, ≤3 candidate options }`. Never
   spin, never silently abandon.

8. **On model-down** (not a task blocker): mark tier degraded; re-resolve to
   fallback; respawn from artifact. Record degradation in run record.

`design` and `review` are already concern-named (no alias); every other phase id maps
to a `skills/<id>/` dir of the same name after the P4 rename, so the walk invokes
`forge:<phase.id>` with no translation table.

### Walk error paths

| Condition | Behavior |
|---|---|
| `ok: false` from `pipeline-resolve` | Stop; surface all `errors[]`; refuse to proceed |
| Non-zero exit from `pipeline-resolve` | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase id has no `skills/<id>/` dir (e.g. an enabled requirements/architecture pre-P10) | Stop; surface "unknown phase id <id>" |
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

- **Gates**: each fix commit gates on the TARGETED check (`gates.slice` over the
  touched files + `gates.review-batch` if declared); the full phase-boundary gate
  runs ONCE per round — after each code-producing phase, after each
  `harness`/`refinement` fix round, and before push — not after every intra-round
  commit. Nothing is ever committed on a known-red gate.

- **Agent spawns**: every role-agent spawn is structured as:
  1. **Injected contract block** (from step 3 above, includes the assembled core +
     bundle invariants + derived retrieval note + manifest `context:` appended by
     the assembler). Do NOT separately re-inject `context:` — the assembler already
     appends it; double-injection is a breach.
  2. **Working directory** and **task dynamics** (phase id, slice, gate string).
  3. **Artifact paths**: committed artifacts passed by PATH — the agent reads them
     in-place. The prompt embeds the pre-chewed context and the load-bearing deltas,
     not a second verbatim copy. A respawn from a partial artifact points at the
     on-disk state rather than re-transcribing it.
  The pre-chew mandate forbids making an agent re-explore the codebase — reading a
  committed plan is not re-exploring.

- **Model resolution & fallback**: resolve each spawn's model as manifest
  `models.<agent>` → the agent def's pinned model (pass it as the spawn's model
  param). If a spawn dies on a model-availability error (model down/overloaded/unknown
  — NOT a task blocker, which uses the blocker protocol), mark that model **degraded
  for the rest of the run** and re-resolve to `models.fallback` if declared, else the
  session's own model (guaranteed available). Record the degradation in the run record,
  then respawn from the artifact. Once a tier is known degraded this run, later spawns
  skip straight to the fallback — never pay the same dead spawn twice.

- **Blockers** escalate to the user as `{ phase/slice, reason, ≤3 candidate options }`
  — never spin, never silently abandon.

- **Provenance**: no phase/ADR/backlog references inside source or test code, ever.
  Design docs and the PR body carry provenance.

## Done

Final message: the PR URL (or branch name if no remote) + one-line summary + the run
record.
