---
name: lessons
description: Craft lessons phase - harvest evidence-backed lessons from the run ledger, lint them, and commit them on the PR branch.
---

# craft:lessons

## Preamble (always runs — non-overridable)

1. Manifest read (run `manifest-lint.sh` if standalone). Resolve `<lessons-dir>` =
   `paths.lessons`, else `docs/lessons/`.
2. **Cross-phase wait:** start only once the in-session `awaitingHarnesses` set is empty —
   every awaited executing-harness has landed, its triage is done (the documentation
   late-EXCEPTION synthesis included) and its gate is green, or it was released by
   `auto-skip`, `NO-OP` or a waiver. Not yet → wait. This phase is never itself awaited.
3. **Standalone:** no run ledger for this branch → record `NO-OP(lessons): no run ledger`
   and stop.

## Procedure (default body — a manifest `override:` replaces everything below)

Session-owned, never delegated: the ledger and the handbacks live in the session.

1. **Harvest.** Read the ledger for lesson-shaped events:

   | Event | Ledger signal |
   |---|---|
   | reset-on-red | `PART(<n>): … outcome=blocked`, or `GATE(<phase>): red` later followed by green |
   | a review finding that needed more than one convergence round | `FINDINGS(<dim>): c<k≥2> <path> n=<m≥1>` |
   | a harness finding triaged as a real defect | a `fix(`/`test(` triage commit after `HARNESS-BG(validation:…)` |
   | a decision deviation folded back into the design | `DECISION-REVERSAL(…)`, or a design-doc `Divergences` entry |
   | a gate that failed for an environmental reason | `GATE(<phase>): red` resolved with no tracked-source change |
   | a lesson to re-verify | `LESSON-REVERIFY(<lesson>): <path>` |

   If `validation` did not run its step 5, run the `assert-fresh` lessons lane over
   `<base>...HEAD` here and treat each unwaived row as a `LESSON-REVERIFY` event.
2. **Draft, only with proof.** An event yields a draft only when it names at least one repo
   path that exists at `HEAD` and reproduces the event: a red test, a `file:line`, or a
   script. The ledger lives in the git common dir and is never evidence. No such path → no
   draft. The next number is the highest existing lesson number + 1; `source.run`,
   `source.phase` and `source.date` come from the event's ledger line. The `trigger` is one
   line; How to apply states the rule in at most 6 non-empty lines.
3. **Dedupe (merge before insert).** Run `consult(<event paths>, { listCorpus: () => [],
   listLessons, readPage })`. An active lesson already covering the same trigger gets the
   new evidence and a bumped `last-verified`; never add a near-duplicate. This also makes a
   resumed harvest idempotent.
4. **Re-verify.** For each `LESSON-REVERIFY` event, re-check the lesson's evidence. Then
   bump `last-verified`, or set `superseded` and write the successor with a `supersedes`
   entry, or set `retired`. Never delete a lesson.
5. **Lint and commit.** Run
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/lesson-lint.js" "<lessons-dir>"`.
   On exit 2, fix the draft, or drop it and record why. Never commit a red lesson. A red
   lint never blocks the phase: it ends with the lint-clean drafts that remain. When the
   INVALID lines name no draft of this run, the corpus itself is red (for example two merged
   branches each added `002-*.md`): record `NO-OP(lessons): corpus lint red on <file>` and
   stop without committing drafts; never renumber or edit a committed lesson here. Commit
   `docs(lessons): record <n> lesson(s)`; when the repo README carries a counted link to
   the lessons directory, bump it in the same commit. Drafts committed on the branch are not
   injected into this run's later phases: injection reads only the default branch, so
   merging the PR ratifies and publishes them.
6. **Record.** Append `LESSONS: <path> (new|refreshed|reverified|superseded|retired)[, …]`,
   or `NO-OP(lessons): <reason>` (for example `no lesson-shaped event carried evidence`).
   Copy that line into the drafted PR body's `- **Lessons:**` line.

Lessons never gate: ratification is the PR review and merge, and the phase
never gates `propose` beyond its own lint of the drafts (a red draft is fixed or dropped,
never committed).
