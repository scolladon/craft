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
2. Push `-u origin <branch>`.
3. `pr.creator`: `session` (default when a remote exists) → `gh pr create` with the
   body drafted in the documentation phase (decisions + ADRs, design path,
   divergences, pinned behaviours, test plan, run record). `user` → hand the drafted
   body to the user and stop here.
