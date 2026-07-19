---
name: decisions
description: Craft phase 3 - the user decides every load-bearing design choice; decisions are captured as ADRs; deviations fold back into the design.
---

# craft:decisions

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: ADR directory (`paths.adr`, else
   `docs/adr/`, create if absent); repo ADR template, else
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/adr.md"`; next ADR number = highest existing + 1.
2. ADR writes route through the intention port's `record` — for the `file` adapter this
   is a thin relabel of today's `docs/adr/` writes byte-for-byte (see
   `docs/adapters/intention.md`); the authoring below is unchanged.

## Procedure (default body — a manifest `override:` replaces everything below)

ENTIRELY session-owned — never delegated.

1. **Triage every candidate (session-owned) into adopt-or-escalate.** A candidate is
   ADOPTED without escalation when its design recommendation is clear AND aligns with
   an existing ADR or a stated craft principle. A candidate is a GENUINE FORK —
   escalated — when the recommendation is unclear, the alternatives carry a real
   user-judgment trade-off, or it deviates from an existing ADR/principle. When in
   doubt, escalate: adopt only the unambiguous.
2. **Genuine forks → user conversation.** Per escalated candidate: present ≤3 options
   with the design's recommendation; capture the user's decision.
3. **No genuine forks (zero candidates, or every candidate adopted) → first-class
   no-op.** Record `NO-OP(decisions): no user-judgment decisions — <justification>` in
   the run record, the 1–3 line justification naming what was adopted and the
   ADR/principle each aligns with (so the no-op is auditable, not asserted); the
   run record is carried into the PR body (documentation phase), so the no-op is
   stated, not hidden. Never invent questions to manufacture a conversation. Adopted recommendations stand as the design states them; they ARE
   still authored as ADRs (see step 5), each marked **adopted-as-recommended (no user
   judgment)** so the decision trail is complete — the no-op concerns the *escalation
   conversation*, not the ADR record.
4. **Cross-candidate interaction check (before authoring):** once all candidates are
   settled (escalated ones ratified, the rest adopted), check whether any settled
   choice's rationale is voided or altered by another (a later choice can invalidate an
   earlier one's premise — including a ratified fork voiding an adopted choice). If so,
   re-surface the affected choice — escalating an adopted choice to the user if its
   premise is now in genuine doubt — before authoring.
5. Author each settled decision — ratified (escalated-and-decided) *and* adopted
   (taken-as-recommended) — as `<adr-dir>/NNN-<title>.md` from the template; commit each
   as `docs(adr): NNN <title>`. An adopted choice's ADR marks its Decision section
   **adopted-as-recommended (no user judgment)** so the log stays distinguishable from a
   ratified choice, whose ADR records the user's judgment.
6. **Scope-fold rule:** if any decision deviates from the design's recommendation,
   spawn a FRESH **craft:designer** to revise — fed the ADR + design-doc PATHS (the
   committed artifacts, read in-place; never your conversation) — committing
   `docs(design): revise <slug> against ADRs <range>` BEFORE the planning phase.
