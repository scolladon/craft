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
- **Artifact is the handoff**: every delegated agent's contribution must be in a
  committed artifact before the phase closes. A dead agent = fresh respawn fed from
  the artifact, never a continuation.
- **Gates**: phase-boundary gate (`gates.phase`, or the probe's fallback) must be
  green after implement, after each review/refactor fix round, and before push.
  Nothing is ever committed on a known-red gate.
- **Agent spawns**: every role-agent invocation carries the working directory, the
  task dynamics, AND the manifest's context file(s) verbatim. Models come from agent
  defs unless the manifest's `models:` overrides per agent (pass as the spawn's model
  param).
- **Blockers** escalate to the user as `{ phase/slice, reason, ≤3 candidate options }`
  — never spin, never silently abandon.
- **Provenance**: no phase/ADR/backlog references inside source or test code, ever.
  Design docs and the PR body carry provenance.

## Done

Final message: the PR URL (or branch name if no remote) + one-line summary + the run
record.
