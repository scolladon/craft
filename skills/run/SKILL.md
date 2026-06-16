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

1d. Read `Resolution.gateDecisions` and extract `awaitingHarnesses[]` from the
    `propose` entry. Store this set in-session as the executing-harness ids that
    must land before `propose` starts `pr create`.

1e. Note `Resolution.waivers[]`. Waiver entries are already written into
    `Resolution.record[]` as `WAIVER: …` lines by the engine; they arrive
    pre-formatted. The structured `waivers[]` array is available for conditional
    logic (e.g., checking if `propose` is released) but is NOT re-formatted here.

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

1. **Resolve the skill dir** — look up `phase.id` in the ALIAS_MAP inverse table
   below and invoke `forge:<skill-dir-name>`. If `phase.id` has no entry and no
   same-named `skills/` dir exists: STOP and surface "unknown phase id <id>; P4
   may fix this".

2. **Resolve execution** — use `phase.execution` (`agent` | `inline`) from the
   Resolution. Apply manifest override (`phases.<id>.override`,
   `phases.<id>.context`) as before.

3. **Assemble the injected block** — P5 TODO: call `assembleContract(phase.contract,
   FRAGMENTS)` and inject the result as the contract block. For now, agent defs
   carry their own contracts.

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

5. **Gate** — read gate string from `Resolution.gateDecisions[phase.id].gate`.
   If `codeProducing: true`: apply gate-cadence invariant (targeted gate per fix
   commit; phase gate once per round; never commit on known-red).
   If `codeProducing: false` and gate non-empty: run gate once at phase boundary.
   If gate is empty string: no gate check.

6. **Record outcome** in the run record (appended to the seeded entries).

7. **On blocker**: escalate `{ phase/slice, reason, ≤3 candidate options }`. Never
   spin, never silently abandon.

8. **On model-down** (not a task blocker): mark tier degraded; re-resolve to
   fallback; respawn from artifact. Record degradation in run record.

ALIAS_MAP inverse table (canonical id → skill dir, single authoritative copy
derived from `engine/src/alias-map.js` — DC-4; this table is deleted at P4):

| canonical id   | skill dir    |
|---|---|
| workspace      | branch       |
| requirements   | prd          |
| decisions      | adr          |
| planning       | plan         |
| implementation | implement    |
| design         | design       |
| review         | review       |
| refactoring    | refactor     |
| validation     | mutation     |
| architecture   | architecture |
| documentation  | docs         |
| propose        | pr           |
| integrate      | merge        |

`requirements` and `architecture` are disabled by default (not in SC1 `effective[]`).
`design` and `review` map to themselves (no alias entry; `skills/design/` and
`skills/review/` already exist under those names).

### Walk error paths

| Condition | Behavior |
|---|---|
| `ok: false` from `pipeline-resolve` | Stop; surface all `errors[]`; refuse to proceed |
| Non-zero exit from `pipeline-resolve` | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase id has no matching inverse-alias and no same-named `skills/` dir | Stop; surface "unknown phase id <id>; P4 may fix this" |
| `awaitingHarnesses` on `propose` is empty | Propose is not gated on any harness; proceed normally |
| `waivers[]` is non-empty | Entries are already in `record[]` as `WAIVER: …` lines; continue |
| A skip strands a consumer | `ok: false` already; covered by the stop-on-error path |
| manifest-lint exits 2 (invalid) | Stop; surface errors (existing behavior; unchanged) |

## Cross-phase invariants (non-overridable)

- **Executing-harness triage gates `propose`**: a phase is an executing-harness when
  `archetype: harness` and `harness-exec ∈ contract`. `propose` does not start
  `pr create` until every phase id in the in-session `awaitingHarnesses` set (read
  from `Resolution.gateDecisions[propose].awaitingHarnesses` in §0) has landed its
  run and its gate is green. `documentation` (archetype: `delivery`) may parallel a
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

- **Agent spawns**: every role-agent invocation carries the working directory, the
  task dynamics, AND the manifest's context file(s) verbatim (a phase's `context:`
  may be one file or a list — inject all of them). Artifacts already committed in the
  worktree are passed by PATH — the agent reads them in-place; the prompt embeds the
  pre-chewed context and the load-bearing deltas, not a second verbatim copy, and a
  respawn from a partial artifact points at the on-disk state rather than
  re-transcribing it. The pre-chew mandate forbids making an agent re-explore the
  codebase — not reading a committed plan.

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
