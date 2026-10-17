---
subjects:
  - skills/documentation/SKILL.md
  - skills/run/SKILL.md
supersedes: []
---
# 609 — The fold rule lives in documentation synthesis and the run delivery bullet

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** none

## Context

Findings reach synthesis from agent handbacks, triage exceptions and the orchestrator's own observations. The reviewer's findings are already applied in full and the harness-triager resolves each finding; neither agent carries any wording for filing a follow-up.

## Options considered

1. **Documentation step 3 only** — pros: one surface / cons: the run skill's walk line still says "follow-ups" with no hint of folding.
2. **Step 3 plus one clause in the run skill's `delivery` (`documentation`) bullet** *(recommended)* — pros: the line an orchestrator reads per phase names the step / cons: two surfaces.
3. **Option 2 plus one line each in the reviewer and harness-triager agents** — cons: adds lines that change no outcome.

## Decision

Option 2. The fold step is the first sub-step of documentation step 3, before any entry is authored, and the run skill's `delivery` (`documentation`) bullet names it. The skill's frontmatter description names folding in place of "author follow-ups".

## Consequences

The agents are unchanged. A manifest `override:` of the documentation procedure replaces the fold step with the rest of the default body.
