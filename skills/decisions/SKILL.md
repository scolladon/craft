---
name: decisions
description: Craft phase 3 - the user decides every load-bearing design choice; decisions are recorded as rulings; deviations fold back into the design.
---

# craft:decisions

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: the rulings register (`paths.rulings`, else
   `docs/RULINGS.md`; when absent, create it with the `REGISTER_HEADER` text of
   `engine/src/rulings.js`); next ruling id = the last line's id + 1;
   doctrine file (`paths.doctrine`, else `docs/DOCTRINE.md`) — an absent file means no
   entries and is never an error (this phase does not create it here).
2. Register writes route through the intention port's `record` — for the `file` adapter this
   is an append to the register (see
   `docs/contributing/specs/intention.md`). The `decisions` phase is the **only** register
   writer: it may add paths to a path-less line a settled decision touches, never as a
   read-phase side effect.

## Procedure (default body — a manifest `override:` replaces everything below)

ENTIRELY session-owned — never delegated.

1. **Triage every candidate (session-owned).** Read the doctrine file whole (`paths.doctrine`,
   else `docs/DOCTRINE.md`; absent = no entries). ESCALATE a candidate only when:
   (a) its recommendation conflicts with an existing ruling — checked against the rulings
       hint on slot 1 — or with a doctrine entry;
   (b) it is irreversible or outward-facing: reverting the PR would not undo it (a release,
       a support floor, an external send, a deletion), or it changes a contract other
       repos consume;
   (c) it carries a real user-judgment trade-off that no ruling or doctrine entry covers — a
       candidate without a clear recommendation is this case.
   Any trigger escalates; a covering entry never overrides (a) or (b). An entry covers a
   candidate when its Trigger describes the candidate's trade-off and its Rule picks the
   recommended option; a Rule that picks another option is a conflict (a). Covering and
   aligning stay a session judgment. When the file exists, run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js" <doctrine-file> <rulings-file>`
   first: an entry doctrine-lint flags covers nothing, so a candidate resting on it falls
   under (c). ADOPT every other candidate and cite its basis:
   R-NNN, DOCTRINE(D-<n>), or "no trade-off" (alternatives that differ only in mechanics).
2. **Escalated candidates → user conversation.** Per escalated candidate: present ≤3 options
   with the design's recommendation; capture the user's decision.
2b. **Harvest.** After the user rules on an escalated candidate, draft a doctrine entry (or an
    amendment to the entry concerned) when the ruling differs from the design's
    recommendation or contradicts a doctrine entry: always. When the ruling matches and no
    entry covers its rationale, draft one only if that rationale reaches beyond this
    candidate. Show the draft in the same conversation: Trigger, Rule, Evidence (the ruling
    this becomes), Counter-cases. The user accepts, edits or declines. Record one
    line per ruling:
    `DOCTRINE-HARVEST(<candidate>): D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off`
3. **No escalated candidates (zero candidates, or every candidate adopted) → first-class
   no-op.** Record `NO-OP(decisions): no user-judgment decisions — <justification>` in
   the run record, the 1–3 line justification naming each adopted candidate and its basis
   (R-NNN, DOCTRINE(D-<n>) or no trade-off), so the no-op is auditable, not asserted; the
   run record is carried into the PR body (documentation phase), so the no-op is
   stated, not hidden. Never invent questions to manufacture a conversation. Adopted recommendations stand as the design states them; they ARE
   still written as register lines (see step 5), each marked `Adopted: <basis>.`
   so the decision trail is complete — the no-op concerns the *escalation
   conversation*, not the register.
4. **Cross-candidate interaction check (before authoring):** once all candidates are
   settled (escalated ones ratified, the rest adopted), check whether any settled
   choice's rationale is voided or altered by another (a later choice can invalidate an
   earlier one's premise — including a ratified fork voiding an adopted choice). If so,
   re-surface the affected choice — an adopted choice whose premise is now in genuine
   doubt is escalated to the user under trigger (c), and its ruling goes through step 2b
   — before authoring.
5. Author each settled decision — ratified (escalated-and-decided) *and* adopted
   (taken-as-recommended) — as ONE register line: the statement in the phase's own words as
   a rule, the refused list (the options not chosen, ` · ` separated), `Adopted: <basis>.`
   for an adopted one, and the decision's governed paths. Run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/rulings-lint.js" <rulings-file>`
   on the register; commit each line as `docs(rulings): R-NNN <statement>`, one commit per
   line. An adopted line carries `Adopted: <basis>.`, so the log stays distinguishable from
   a ratified one, which records the user's judgment.

   **Doctrine write.** After the evidence ruling's commit, write each accepted entry (`<n>` =
   highest id + 1; an amendment edits in place: narrow the Rule or add evidence /
   counter-cases; never delete or renumber), creating the file at the resolved path with the
   H1 `# Doctrine` and the intro line when absent. Run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js" <doctrine-file> <rulings-file>`
   and commit only when it exits 0, alone, as `docs(doctrine): D-<n> <title>`; on a finding,
   fix the entry, re-showing the draft to the user when the fix changes its Rule; a finding
   that predates this write is fixed in the same commit or escalated through the blocker
   protocol.

   **Reversal.** When a settled decision reverses ruling R-N, one commit: append the new
   line R-M; append ` Superseded by R-M: <scope>.` to R-N, keeping the line; re-point every
   `Superseded by R-N` pointer to R-M. When R-N is cited as doctrine evidence or
   counter-case, re-point the citation to the superseding ruling in the same commit. Then
   emit one `DECISION-REVERSAL(R-N): <scope> -> R-M` line per reversal this run, `<scope>`
   the same string verbatim as the one on the register line so the token and the register
   cannot disagree.
6. **Scope-fold rule:** if any decision deviates from the design's recommendation,
   spawn a FRESH **craft:designer** to revise — fed the R-ids + design-doc PATH (the
   committed artifacts, read in-place; never your conversation) — committing
   `docs(design): revise <slug> against rulings <range>` BEFORE the planning phase.
