---
name: decisions
description: Craft phase 3 - the user decides every load-bearing design choice; decisions are captured as ADRs; deviations fold back into the design.
---

# craft:decisions

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: ADR directory (`paths.adr`, else
   `docs/adr/`, create if absent); repo ADR template, else
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/adr.md"`; next ADR number = highest existing + 1;
   doctrine file (`paths.doctrine`, else `docs/DOCTRINE.md`) — an absent file means no
   entries and is never an error (this phase does not create it here).
2. ADR writes route through the intention port's `record` — for the `file` adapter this
   is a plain write into the ADR directory (see
   `docs/contributing/specs/intention.md`). A write
   carries the governance declaration from `templates/adr.md` (the `subjects:` and
   `supersedes:` frontmatter fence). The `decisions` phase is the **only** ADR backfill
   writer: it writes the block into a pre-existing ADR it authors or supersedes, never as
   a read-phase side effect.

## Procedure (default body — a manifest `override:` replaces everything below)

ENTIRELY session-owned — never delegated.

1. **Triage every candidate (session-owned).** Read the doctrine file whole (`paths.doctrine`,
   else `docs/DOCTRINE.md`; absent = no entries). ESCALATE a candidate only when:
   (a) its recommendation conflicts with an existing ADR — checked against the governing
       slice on slot 1 (`skills/run/SKILL.md`'s intention hint, an indexed read) — or with a
       doctrine entry;
   (b) it is irreversible or outward-facing: reverting the PR would not undo it (a release,
       a support floor, an external send, a deletion), or it changes a contract other
       repos consume;
   (c) it carries a real user-judgment trade-off that no ADR or doctrine entry covers — a
       candidate without a clear recommendation is this case.
   Any trigger escalates; a covering entry never overrides (a) or (b). An entry covers a
   candidate when its Trigger describes the candidate's trade-off and its Rule picks the
   recommended option; a Rule that picks another option is a conflict (a). Covering and
   aligning stay a session judgment. When the file exists, run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js" <doctrine-file> <adr-dir>`
   first: an entry doctrine-lint flags covers nothing, so a candidate resting on it falls
   under (c). ADOPT every other candidate and cite its basis:
   ADR-NNN, DOCTRINE(D-<n>), or "no trade-off" (alternatives that differ only in mechanics).
2. **Escalated candidates → user conversation.** Per escalated candidate: present ≤3 options
   with the design's recommendation; capture the user's decision.
2b. **Harvest.** After the user rules on an escalated candidate, draft a doctrine entry (or an
    amendment to the entry concerned) when the ruling differs from the design's
    recommendation or contradicts a doctrine entry: always. When the ruling matches and no
    entry covers its rationale, draft one only if that rationale reaches beyond this
    candidate. Show the draft in the same conversation: Trigger, Rule, Evidence (the ADR
    this ruling becomes), Counter-cases. The user accepts, edits or declines. Record one
    line per ruling:
    `DOCTRINE-HARVEST(<candidate>): D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off`
3. **No escalated candidates (zero candidates, or every candidate adopted) → first-class
   no-op.** Record `NO-OP(decisions): no user-judgment decisions — <justification>` in
   the run record, the 1–3 line justification naming each adopted candidate and its basis
   (ADR-NNN, DOCTRINE(D-<n>) or no trade-off), so the no-op is auditable, not asserted; the
   run record is carried into the PR body (documentation phase), so the no-op is
   stated, not hidden. Never invent questions to manufacture a conversation. Adopted recommendations stand as the design states them; they ARE
   still authored as ADRs (see step 5), each marked **adopted-as-recommended (no user judgment)** — <basis>
   so the decision trail is complete — the no-op concerns the *escalation
   conversation*, not the ADR record.
4. **Cross-candidate interaction check (before authoring):** once all candidates are
   settled (escalated ones ratified, the rest adopted), check whether any settled
   choice's rationale is voided or altered by another (a later choice can invalidate an
   earlier one's premise — including a ratified fork voiding an adopted choice). If so,
   re-surface the affected choice — an adopted choice whose premise is now in genuine
   doubt is escalated to the user under trigger (c), and its ruling goes through step 2b
   — before authoring.
5. Author each settled decision — ratified (escalated-and-decided) *and* adopted
   (taken-as-recommended) — as `<adr-dir>/NNN-<title>.md` from the template; commit each
   as `docs(adr): NNN <title>`. An adopted choice's ADR marks its Decision section
   **adopted-as-recommended (no user judgment)** — <basis>, so the log stays distinguishable from a
   ratified choice, whose ADR records the user's judgment.

   **Doctrine write.** After the evidence ADR's commit, write each accepted entry (`<n>` =
   highest id + 1; an amendment edits in place: narrow the Rule or add evidence /
   counter-cases; never delete or renumber), creating the file at the resolved path with the
   H1 `# Doctrine` and the intro line when absent. Run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js" <doctrine-file> <adr-dir>`
   and commit only when it exits 0, alone, as `docs(doctrine): D-<n> <title>`; on a finding,
   fix the entry, re-showing the draft to the user when the fix changes its Rule.

   **Supersession authoring obligations.** When a settled decision supersedes ADR-N, the
   same commit satisfies `adr-lint`: write the new ADR's `supersedes: [{ adr: "N",
   scope: "<one-line scope>" }]` frontmatter entry, `adr` zero-padded 3-digit; flip
   ADR-N's `- **Status:** superseded by ADR-M` line; prepend ADR-N's blockquote note
   naming ADR-M and the superseded scope; write **both** body anchors in the new ADR's
   Decision section — `Superseded from ADR-N: …` and `Carried forward from ADR-N: …` —
   with "nothing survives" stated explicitly (`Carried forward from ADR-N: nothing —
   <why>`) rather than by omitting the anchor; sweep the live-tier citations, updating
   every non-exempt `ADR-N` mention in the tracked tree to reflect the supersession; when a
   superseded ADR is cited as doctrine evidence or counter-case, re-point the citation to the
   superseding ADR in the same commit.
   Then emit one `DECISION-REVERSAL(ADR-N): <scope> -> ADR-M` line per `supersedes`
   entry authored this run, `<scope>` the same string verbatim as the frontmatter's
   `scope` field so the token and the ADR cannot disagree.
6. **Scope-fold rule:** if any decision deviates from the design's recommendation,
   spawn a FRESH **craft:designer** to revise — fed the ADR + design-doc PATHS (the
   committed artifacts, read in-place; never your conversation) — committing
   `docs(design): revise <slug> against ADRs <range>` BEFORE the planning phase.
