# 214 — Reader-first PR body: Background · Intuition · Code + provenance trailer

- **Status:** accepted
- **Date:** 2026-07-08
- **Design:** none (small, self-contained convention change) · **Supersedes/Refines:** refines the inline body list in `skills/documentation/SKILL.md` and `skills/propose/SKILL.md`

## Context

The PR body was an inline prose list — decisions + ADRs, design path, divergences, pinned behaviours, test plan, run record — drafted in the documentation phase and consumed by propose. It is a complete traceability payload but reads as a manifest dump, not an explanation: a reviewer gets what changed and its provenance, never the *why* or the intuition. Geoffrey Litt's PR-explanation template (Background → Intuition → Code → Quiz) is the opposite bias — reader comprehension first. We want that narrative spine as the default without losing the traceability the run already produces, and without the Quiz (a comprehension test that does not fit a delivery PR).

## Options considered

1. **Narrative spine + provenance trailer** (recommended) — Background · Intuition · Code carry the story; the existing payload survives verbatim as a fixed `Provenance & verification` checklist below a rule. Nothing lost; story and traceability stay visually separate.
2. **Full replace, weave facts into prose** — only the three narrative sections; ADRs/design/tests woven into the prose. Leanest and most reader-first, but provenance stops being a scannable checklist and is easy to drop under time pressure.
3. **Narrative + verification-only trailer** — narrative sections absorb decisions/design/divergences; keep only test plan + run record as explicit sections. Middle ground, but splits the payload across prose and checklist inconsistently.

## Decision

Adopt Option 1. The default PR body is `templates/pr-body.md`: three reader-first narrative sections — **Background** (the system as it stands, deep then narrow, both skippable), **Intuition** (the core idea, a toy example, a mermaid diagram where it helps), **Code** (a grouped high-level walkthrough of the diff) — followed by a **Provenance & verification** trailer carrying decisions + ADR numbers, design doc path, divergences, pinned behaviours, test plan, and run record verbatim. The Quiz is dropped. Tone guidance (clarity and flow, engaging classic style, diagrams freely, smooth transitions) lives in the template's guidance comments. The template is overridable like every other: a repo's own `templates/pr-body.md` wins, else the plugin default, and a manifest `override:` replaces the drafting step entirely.

## Consequences

- The documentation phase drafts against the template; propose consumes it unchanged — the phase boundary is untouched.
- No structural linter globs `templates/*.md`, so the new template is not forced into design-doc shape; `run_prose_lint` (ci.sh) scans it as a touched `.md`, so the template and skill copy stay clear of the ban-list.
- Provenance never regresses: every payload line the old list carried remains, now under a fixed trailer heading.
- Follow-up available if wanted: a `pr.body-template` manifest knob and a body-structure lint that asserts the four headings are present. Not built now (YAGNI) — the override path already covers customization.
