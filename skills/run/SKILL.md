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
2. Classify the input: **backlog id** (matches the repo's backlog convention — only if
   the manifest declares `backlog:`; look the entry up there) | **file path** (read
   it) | **free-text brief** (use verbatim). Ambiguous → STOP and ask.
3. Derive a kebab-case topic slug (≤6 words). Print:
   `Resolved → topic: <slug>, brief: <one line>` for user confirmation.
4. Open the **run record** (in-session ledger): every phase outcome, skip reason,
   no-op justification, probe result, and forced action lands in it. It ships in the
   final summary and the PR body.

## 1→11 — Phase sequence (fixed; this order is not declinable)

| # | Phase | Skill | Session-owned? |
|---|---|---|---|
| 1 | branch | forge:branch | setup |
| 2 | design | forge:design | verify artifact |
| 3 | adr | forge:adr | ENTIRELY (user conversation) |
| 4 | plan | forge:plan | verify artifact + plan-lint |
| 5 | implement | forge:implement | verify each slice, phase gate |
| 6 | review | forge:review | apply ALL fixes, convergence |
| 7 | refactor | forge:refactor | judgment (scan + scoping) |
| 8 | mutation | forge:mutation | start background, gate PR on triage |
| 9 | docs | forge:docs | synthesis (follow-ups, backlog guard) — runs while 8 grinds |
| 10 | pr | forge:pr | pre-PR gate, body, creation per policy |
| 11 | merge | forge:merge | user confirms; cleanup |

Invoke each phase via its skill. Apply the manifest's declination per phase: `context:`
files (global and per-phase) are injected into EVERY role-agent invocation of that
phase — this assembly rule is yours, the orchestrator's, so no override can drop it;
`override:` replaces a phase skill's Procedure section (its Preamble still runs);
`skip:` (non-protected phases only — manifest-lint already refused the rest) records
its reason and moves on.

## Cross-phase invariants (non-overridable)

- **Mutation triage gates the PR**: phase 10 does not start `pr create` until phase
  8's run has landed, survivors are triaged, and the phase gate is green. Docs (9) may
  parallel the background run; PR creation may not.
- **Scope expansion re-enters review**: any *feature* behavior added after phase 6 has
  run — new scope the user directs in, or a slice that grows, during implement /
  review / refactor — that is NOT a fix to an existing finding, gets its own
  feature-scoped review before mutation closes: re-enter forge:review on the added
  behavior's diff (all four dimensions, per-dimension convergence), then apply the
  fixes. The refactor phase's re-review is scoped to the *refactor* diff only and does
  not substitute. A scope expansion that reaches the mutation gate unreviewed is a
  workflow breach — pin the new behaviour's faithfulness too if the prime directive
  applies.
- **Artifact is the handoff**: every delegated agent's contribution must be in a
  committed artifact before the phase closes. A dead agent = fresh respawn fed from
  the artifact, never a continuation.
- **Gates**: each fix commit gates on the TARGETED check (`gates.slice` over the
  touched files + `gates.review-batch` if declared); the full phase-boundary gate
  (`gates.phase`, or the probe's fallback) runs ONCE per round — after implement, after
  each review/refactor fix round, and before push — not after every intra-round commit.
  Nothing is ever committed on a known-red gate.
- **Agent spawns**: every role-agent invocation carries the working directory, the
  task dynamics, AND the manifest's context file(s) verbatim (a phase's `context:` may
  be one file or a list — inject all of them). Artifacts already committed in the
  worktree (design doc, plan slice) are passed by PATH — the agent reads them
  in-place; the prompt embeds the pre-chewed Context and the load-bearing deltas, not a
  second verbatim copy of a committed doc, and a respawn from a partial artifact points
  at the on-disk state rather than re-transcribing it. The pre-chew mandate forbids
  making an agent re-EXPLORE the codebase — not reading a committed plan.
- **Model resolution & fallback**: resolve each spawn's model as manifest
  `models.<agent>` → the agent def's pinned model (pass it as the spawn's model param).
  If a spawn dies on a model-availability error (model down/overloaded/unknown — NOT a
  task blocker, which uses the blocker protocol), mark that model **degraded for the
  rest of the run** and re-resolve to `models.fallback` if declared, else the session's
  own model (guaranteed available — the session is running on it). Record the
  degradation in the run record, then respawn from the artifact. Once a tier is known
  degraded this run, later spawns that would use it skip straight to the fallback — never
  pay the same dead spawn twice.
- **Blockers** escalate to the user as `{ phase/slice, reason, ≤3 candidate options }`
  — never spin, never silently abandon.
- **Provenance**: no phase/ADR/backlog references inside source or test code, ever.
  Design docs and the PR body carry provenance.

## Done

Final message: the PR URL (or branch name if no remote) + one-line summary + the run
record.
