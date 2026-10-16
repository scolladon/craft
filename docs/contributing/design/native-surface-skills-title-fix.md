# Design — native-surface-skills-title-fix

> Brief: the `describe` title at `adapters/codex/test/native-surface.test.js:84` gives a
> reason the record and the adapter README have disproven (shared skills "load by
> reference"). Retitle it to the reason those pages pin: the shared skills live at the
> repository root and reach codex through the `$CODEX_HOME/skills` symlinks. Title-only
> change; the `it` body and its assertion stay byte-identical.
> Status: draft → self-reviewed ×2

## Context

The block today (`adapters/codex/test/native-surface.test.js` L84–90):

```js
describe('adapters/codex/skills/ — must not exist: shared craft skills load by reference', () => {
  it('Given the codex adapter tree, when checked, then adapters/codex/skills/ does not exist', () => {
    const sut = existsSync(SKILLS_DIR);

    assert.equal(sut, false);
  });
});
```

`SKILLS_DIR` is `join(ADAPTER_DIR, 'skills')` (L11). The assertion is correct: ADR-253
(`docs/contributing/adr/253-codex-shared-skills-by-reference.md` L23) still requires
"`adapters/codex/skills/` must not exist", so the shared skills are never copied into the
adapter. Only the reason in the title is wrong.

What contradicts the title (each pinned live, on 0.145.0 and again on 0.162.1):

| Source | file:line | Wording |
|---|---|---|
| POC record, surface table | `docs/contributing/specs/codex-poc-record.md:115` | "**DISPROVEN on 0.145.0.** … **0 of 19** shared craft skills load without the symlink fallback; **19 of 19** load with it … Re-confirmed on 0.162.1: same 0 of 19 versus 19 of 19." |
| POC record, open-rows row 1 | `docs/contributing/specs/codex-poc-record.md:332` | "the 19 shared skills do NOT load by reference; the symlink fallback loads all 19" |
| POC record, re-probe section | `docs/contributing/specs/codex-poc-record.md:439–454` | "Shared skills by reference — still does not work" |
| POC record, 0.162.1 matrix | `docs/contributing/specs/codex-poc-record.md:555–556` | "**DISPROVEN (0.162.1).** … **0 of 19**"; "Symlink fallback (0.162.1) … **19 of 19**" |
| Adapter README, *Load* | `adapters/codex/README.md:48–49` | "**The 19 shared skills do NOT load by reference on Codex 0.162.1 (pinned live; first pinned on 0.145.0).**" |
| Adapter README, *Load* | `adapters/codex/README.md:54–56` | "Load them with the symlink route — this IS the working path for the shared skills, required on every install" |
| Adapter README, *Usage* | `adapters/codex/README.md:189–191` | "the shared `skills/run/SKILL.md` at the repository root (loaded through the `$CODEX_HOME/skills` symlinks above, since codex does not load them by reference)" |

Touch points for the old title string. `git grep -n "load by reference"` matches the
test line plus prose in docs; no test, script or lint reads the title:

| Match | Role | Action |
|---|---|---|
| `adapters/codex/test/native-surface.test.js:84` | the title being fixed | retitle |
| `BACKLOG.md:243–249` | the open entry for this fix | remove it (the house closes an entry in the PR that fixes it, as `6114371` did) |
| `adapters/codex/README.md:48`, `:191` | the correct "do NOT load by reference" claim | none |
| `adapters/copilot/test/native-surface.test.js:134,142,155,164`; `docs/contributing/adr/251-…` | Copilot, which does load by reference (ADR-251) | none |
| `adapters/cursor/README.md:29` | Cursor | none |
| `docs/contributing/design/*`, `docs/contributing/plan/*` | dated design and plan records | none (dated records stay as written) |

Repo checks on the title. `git grep -n "native-surface"` finds no file outside the suite
that names it. `scripts/ci.sh` runs `node --test` with no formatter and no title lint.
Lines over 100 characters are already common in this file (L93 is 126, L101 is 177), so a
longer title needs no reflow.

## Requirements

- R1: `adapters/codex/test/native-surface.test.js` L84 reads exactly
  `describe('adapters/codex/skills/ — must not exist: shared craft skills live at the repository root and load through the $CODEX_HOME/skills symlinks, not by reference', () => {`.
- R2: the `it` title, the `it` body and the assertion (L85–89) are byte-identical to today.
- R3: `git grep -n "shared craft skills load by reference'" -- adapters/codex` matches nothing.
- R4: no other line in `adapters/codex/test/native-surface.test.js` changes
  (`git diff --no-ext-diff --numstat` reports 1 added and 1 deleted line for the file).
- R5: the `BACKLOG.md` entry *`native-surface.test.js` describe title claims the shared
  skills load by reference.* (L243–249) is removed. No other entry changes.
- R6: `bash scripts/ci.sh` is green.

## Design

One part. Edit one string literal and remove the backlog entry.

```diff
-describe('adapters/codex/skills/ — must not exist: shared craft skills load by reference', () => {
+describe('adapters/codex/skills/ — must not exist: shared craft skills live at the repository root and load through the $CODEX_HOME/skills symlinks, not by reference', () => {
```

Where each part of the new wording comes from (nothing new is claimed):

| Phrase | Source |
|---|---|
| "live at the repository root" | `adapters/codex/README.md:190` "at the repository root" |
| "load through the $CODEX_HOME/skills symlinks" | `adapters/codex/README.md:190` "loaded through the `$CODEX_HOME/skills` symlinks" |
| "not by reference" | `adapters/codex/README.md:191` "since codex does not load them by reference"; record L332 |

Keeping the "— must not exist:" prefix keeps the title in the same `<path> — <rule>: <reason>`
shape as its neighbours (L92 `plugins/craft-codex/skills/ — the entrypoint dir, …`). Ending
with "not by reference" is deliberate: someone grepping the suite for "by reference" finds
this block saying the opposite of the old title. `$CODEX_HOME` sits inside a single-quoted
JS string, so nothing interpolates it.

Edge behaviour: none. The title is a plain string, `node --test` prints it as given, and
nothing in the repo parses it.

Part 1 context block (pre-chewed):

- File: `adapters/codex/test/native-surface.test.js`, top-level `describe` at L84 (the
  first `describe` in the file; `bodyOf`/`agentPath`/`sharedAgentPath` helpers end at L82).
- File: `BACKLOG.md`, L243–249 (the bold-led paragraph through "…through the symlinks)."),
  plus the blank line after it, so the next heading
  (`### Open (scoped 2026-10-14 …`) keeps one blank line before it.
- Gate: `bash scripts/ci.sh > <scratch>/ci.out 2>&1; echo $?`, then grep `ci.out` for
  `fail`/`not ok`.
- Commit: `test(codex): retitle the adapters/codex/skills/ native-surface check to the symlink reason`.

## Decision candidates

None. The brief fixes the scope (title only, record/README wording) and ADR-253 already
fixes the assertion. The wording is copied from `adapters/codex/README.md:189–191`, so
there is no choice left to make.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|

## Test strategy

The change is the title of an existing test, so there is no new behaviour to test first.
Proof:

- `bash scripts/ci.sh` green. The `adapters/codex` suite still runs the block and it still
  passes (`adapters/codex/skills/` is absent).
- R2/R4: `git diff --no-ext-diff -U0 -- adapters/codex/test/native-surface.test.js` shows
  exactly one `-` and one `+` line, both at L84.
- R3: the grep in R3 returns nothing (exit 1).
- R5: `git diff --no-ext-diff --numstat -- BACKLOG.md` shows only deletions, and the deleted
  lines are the L243–249 paragraph plus its trailing blank line.
- No mutation run: a string literal in a test title has nothing to mutate.

## Out of scope

- `plugins/craft/plugin.json — by-reference skills path` (`adapters/codex/test/native-surface.test.js:101`):
  this checks the Claude plugin manifest, and the Claude plugin does load the skills by
  reference. The title is correct, so it stays.
- The Copilot titles (`adapters/copilot/test/native-surface.test.js:134,142,155`): Copilot
  loads by reference per ADR-251, so those titles are correct.
- `adapters/codex/README.md` and `docs/contributing/specs/codex-poc-record.md`: already
  correct. They are the source of the new wording.
- Dated design and plan docs (`native-codex-binding.md:225` and others): records of what was
  believed at the time. They are not living claims.
- Proven, not acted on: the title of ADR-253
  (`docs/contributing/adr/253-codex-shared-skills-by-reference.md:1`, "Codex loads shared craft
  skills by reference", status `accepted`) states what `codex-poc-record.md:332` disproves.
  Amending an ADR is a separate, user-ratified change.
