---
name: propose
description: Craft phase 10 - pre-PR gate, push, and PR creation per repo policy. Blocked until validation triage is complete.
---

# craft:propose

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). **Probe: remote?** none → propose AND integrate
   no-op with a note (work stays on the local branch); the run ends after documentation.
2. **Cross-phase invariant check:** the validation phase's run has landed or recorded a no-op, survivors are
   triaged, `gates.phase` is green. Not yet → wait; never create the PR early.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Pre-PR gate** (`pr.pre-pr-gate` if declared): contract = check + documented
   remediation + documented exceptions (both live in the manifest body or a phase
   context file — never memory). Run it; apply the remediation in its own
   conventional commit; re-gate.
2. **Consult `push` action** (see `docs/adapters/policy.md` for surface semantics).
   Obey the returned surface, then push `-u origin <branch>`.
3. **Consult `propose` action** (see `docs/adapters/policy.md`). Obey the returned surface:
   - `ask` (default, ADR-127) — hand the drafted body to the user and stop (`pr.creator: user`
     behaviour); on approval proceed with the PR creation, on decline record
     `POLICY(ask:propose→declined)` and block.
   - `never` — refuse; record `POLICY(never:propose)`; phase no-ops.
   - `always` — create the PR without stopping; record `POLICY(always:propose)`;
     supersedes the `pr.creator: user` stop (ADR-128 — Supersede).

   Invoke the VCS port `propose(title, body)` (see `docs/adapters/vcs.md`); the adapter
   owns the host CLI. Body: decisions + ADRs, design path, divergences, pinned
   behaviours, test plan, run record — drafted in the documentation phase.
