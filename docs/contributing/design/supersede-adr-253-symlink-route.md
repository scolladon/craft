# Design — supersede ADR-253: the shared skills load through the `$CODEX_HOME/skills` symlinks

> Brief: ADR-253 is `accepted` and still records that codex loads the 19 shared craft skills by
> reference through a marketplace entry. The PoC record marks that claim DISPROVEN on 0.145.0 and
> 0.162.1, and the adapter README already prescribes the symlink route on every install. Author
> one ADR that supersedes ADR-253 and adopts its option 3, the `$CODEX_HOME/skills` symlink route,
> as the working path. Keep the consequence "`adapters/codex/skills/` must not exist". Docs and
> ADRs only: no codex probe, no source or test change.
> Status: draft → self-reviewed ×3

---

## Context

### What exists

- **ADR-253** `docs/contributing/adr/253-codex-shared-skills-by-reference.md` (no frontmatter
  fence). L3 `- **Status:** accepted`. L5 `- **Design:** docs/design/native-codex-binding.md · …`.
  Options: 1 = two entries in one local marketplace (`craft` with manifest `skills` → repo-root
  `skills/` by reference, plus `craft-codex` for the adapter surface), chosen. 2 = one plugin, no
  adapter entrypoint. 3 = a `$CODEX_HOME/skills/` symlink farm, kept as a fallback "only if row 9a
  fails". Consequences: `adapters/codex/skills/` must not exist (test-asserted). Option 3 stays the
  fallback shared with ADR-252.
- **ADR-252** `docs/contributing/adr/252-codex-binding-home-and-load-path.md` (no fence, `accepted`).
  Its Decision picks the local marketplace as the load path. Its option 2, the `$CODEX_HOME/skills/`
  symlinks plus a `config.toml` hook path, is "the named fallback — to be used only if row 9a's
  by-reference skill loading fails". Consequence 2: "`adapters/codex/README.md` carries both routes:
  the chosen marketplace install and the documented symlink fallback."
- **What ships today** (read on this tree):
  - `adapters/codex/.claude-plugin/marketplace.json`: two entries. `craft` → `./plugins/craft`,
    whose description says installing it "does NOT load them … symlink them into $CODEX_HOME/skills".
    `craft-codex` → `./plugins/craft-codex`, which "delivers the craft-run skill only".
  - `adapters/codex/plugins/craft/plugin.json`: `"skills": "../../../../skills"`, with no other
    payload.
  - `adapters/codex/plugins/craft-codex/plugin.json`: `"hooks": "../../hooks.json"`,
    `"skills": "./skills"`. `plugins/craft-codex/skills/` holds exactly `craft-run/`.
  - `adapters/codex/README.md` L16–18 installs **both** entries. L24–28 describe the two entries.
    L31–46 say the cache copy drops `hooks` and `skills`, so only `craft-run` arrives through the
    marketplace. L48–55: "The 19 shared skills do NOT load by reference … this IS the working path
    for the shared skills, required on every install, not a contingency to fall back on", followed by
    the `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` block.
  - `adapters/codex/test/native-surface.test.js` pins L125–130 (`adapters/codex/skills/` does not
    exist), L133–138 (`plugins/craft-codex/skills/` is exactly `['craft-run']`), L141–156
    (`plugins/craft/plugin.json`'s `skills` resolves to the repo-root `skills/`) and L186–192 (the
    marketplace declares exactly `['craft', 'craft-codex']`).
- **ADR-614 is the next free number.** `ls docs/contributing/adr | wc -l` = 613, and the highest file
  is `613-…`.

### Pinned evidence (verified against this tree and a throwaway clone, 2026-10-17)

| # | Probe | Result |
|---|---|---|
| E1 | `docs/contributing/specs/codex-poc-record.md` L332 (row 1) | "Shared skills load by reference — **DISPROVEN (re-pinned 0.145.0 → 0.162.1)**". `codex plugin add` copies the plugin and drops the out-of-tree `../../../../skills` ref. Measured with the app-server `skills/list` method: 0/19 by reference, 19/19 through the symlinks. The cached manifests are `{description, name}`. Design row 9a (`docs/contributing/design/native-codex-binding.md` L162, "Skills by reference") is the claim that row 1 records as executed. |
| E2 | `git grep -n 'ADR-253'` | Live tier: `BACKLOG.md` L205 and L210 only. Everything else is in `docs/contributing/adr/` (ADR-608), `design/` or `plan/`, which the sweep exempts. |
| E3 | Throwaway clone: a stub ADR-614 that supersedes `"253"`, plus 253's Status flipped, then `bash scripts/adr-lint.sh docs/contributing/adr` | exit 2: `DECISION-CITE-FOUND(BACKLOG.md): ADR-253@L205` and `…@L210`. The baseline on the untouched clone exits 0: "613 ADR(s) checked, 15 declaring supersession". |
| E4 | Same, plus `--waiver-source` for a design md whose line 1 is `DECISION-CITE-WAIVE(BACKLOG.md): historical entry` | exit 0. With the token mid-line ("Option (a) writes a DECISION-CITE-WAIVE(BACKLOG.md): line here.") it still exits 2: the waiver is line-anchored (`hygiene-lint-core.js` L141 `anchorWaiver`, L115 `unfencedLines`). |
| E5 | Waiver key, `engine/src/adr-lint-main.js` L649 | `if (ctx.waived.has(resolve(ctx.repoRoot, relPath))) continue;`. The key is the **file only**. A waiver for `BACKLOG.md` skips every hit in that file for every superseded id, now and in later supersessions. No waiver in the tree names a real file today: `git grep` finds the token only in docs that describe it, with a `<file>` placeholder. `BACKLOG.md` carries 105 `ADR-NNN` citations. |
| E6 | Same clone, `BACKLOG.md` reworded so the literal `ADR-253` is gone (no waiver) | adr-lint exit 0. |
| E7 | Same clone, a second `supersedes` entry `adr: "252"` + both C2 lines + 252's Status flipped | adr-lint exit 0, "16 declaring supersession". Without the 252 flip, C1 reports `252-…md: missing required line: - **Status:** superseded by ADR-614`. `git grep ADR-252` outside the exempt dirs finds nothing, so superseding 252 adds no C3 finding. |
| E8 | Same clone, `bash scripts/readme-drift.sh` | exit 1: `corpus-counts: docs/contributing/design/ claims 75, tree holds 76` and `docs/contributing/adr/ claims 613, tree holds 614`. The counts come from `README.md` L199–201, matched by `CORPUS_CLAIM` (`engine/src/readme-regions.js` L33), and are counted as `*.md` files per dir (`readme-drift-main.js` L119). |
| E9 | Where readme-drift runs | `.github/workflows/ci.yml` L33–46 runs it as a job of its own. `scripts/ci.sh` also reaches it: `engine/test/readme-drift-main.test.js` L304–311 runs `main([])` against the real repo root and expects exit 0. With this design doc alone on disk, `bash scripts/ci.sh` fails on that test (`ci: engine node --test failed`, 1 of 3749). **Every commit that adds a corpus file must bump its count in the same commit.** |

### Constraints already decided

- Supersession form is fixed by adr-lint C0–C2 (`engine/src/adr-lint-main.js` header) and by
  the precedent pair ADR-514 / ADR-317: superseder frontmatter `subjects:` + `supersedes:
  [{adr, scope}]`; `**Supersedes/Refines:** supersedes ADR-N` on the metadata line; line-anchored
  `Superseded from ADR-N:` / `Carried forward from ADR-N:` paragraphs in the Decision; the target
  carries exactly `- **Status:** superseded by ADR-M` and a `> **Superseded by ADR-M** for <scope>:
  …` blockquote right after its metadata list. Multi-target precedents: ADR-384 (3 entries), ADR-383
  and ADR-564 (2 each).
- ADR-251: shared skills are never copied into an adapter. A symlink is not a copy: the bytes stay at
  `skills/<name>/`, so ADR-251's reason (hygiene exemptions on drifting copies) still holds.
- ADR-608: a finding folds when it shares a file or a claim with the change. Superseding an ADR is
  always a user decision.
- C3 is hard-blocking and whole-corpus (`scripts/ci.sh` L142–164). It fires as soon as a declaring
  ADR exists, so the C3 fix must land **in the same commit** as ADR-614.
- No AI or tooling trace and no absolute or home-rooted path in any committed file.

## Requirements

1. **R1 — superseder.** A new `docs/contributing/adr/614-<slug>.md` from `templates/adr.md`, with a
   frontmatter fence: `subjects:` is a non-empty list of real repo paths, and `supersedes:` holds
   `{ adr: "253", scope: <candidate 1> }`. Its Decision adopts ADR-253 option 3, the
   `$CODEX_HOME/skills/<name>` symlinks to `<repo>/skills/<name>`, one per shared skill, on every
   install, as the working path, not a fallback. Its Context cites E1.
2. **R2 — both directions stated.** ADR-614 carries a line starting `Superseded from ADR-253` and a
   line starting `Carried forward from ADR-253`. The carried-forward line keeps "`adapters/codex/skills/`
   must not exist" verbatim in substance.
3. **R3 — target flipped.** ADR-253 L3 becomes exactly `- **Status:** superseded by ADR-614`, and a
   `> **Superseded by ADR-614** for <scope>: …` blockquote follows its metadata list. The rest of
   ADR-253 is unchanged: it is a dated record.
4. **R4 — zero live citations left.** adr-lint C3 reports nothing. The handling of the `BACKLOG.md`
   L205/L210 citations is set by candidate 2, and the fix lands in the same commit as R1 and R3.
5. **R5 — corpus counts.** `README.md` L199–201 match the tree once the run's docs exist: design
   76, plan 75 if a plan doc is committed, ADRs 614, or 615 under candidate 3 (b). Each bump lands
   in the commit that adds the file it counts (E9). The design-doc commit already carries 75→76.
6. **R6 — ADR-252 (conditional on candidate 3).** Under 3 (a), ADR-614 also declares
   `{ adr: "252", scope: … }` with its own C2 lines, and ADR-252 is flipped and blockquoted as in R3.
7. **R7 — nothing else moves.** No change to `adapters/codex/**`, the marketplace, the plugin
   manifests or any test. The four `native-surface.test.js` pins listed above stay green
   unchanged.

## Design

### Part A — ADR-614 (the superseder)

File: `docs/contributing/adr/614-codex-loads-shared-skills-through-codex-home-symlinks.md`.
The shape below is for candidate 1 (b) and candidate 3 (a), the recommendations. The decisions
phase swaps the scope strings if the user picks otherwise.

```markdown
---
subjects:
  - adapters/codex/README.md
  - adapters/codex/.claude-plugin/marketplace.json
  - adapters/codex/plugins/craft/plugin.json
  - adapters/codex/test/native-surface.test.js
supersedes:
  - adr: "253"
    scope: "the shared skills load by reference through the craft marketplace entry's skills field, with the $CODEX_HOME/skills symlinks as a fallback only"
  - adr: "252"
    scope: "the $CODEX_HOME/skills symlink route as a contingency fallback used only if by-reference loading fails"
---
# 614 — Codex loads the shared craft skills through `$CODEX_HOME/skills` symlinks

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/supersede-adr-253-symlink-route.md · **Supersedes/Refines:** supersedes ADR-253, ADR-252

## Context        ← E1: cache copy drops the out-of-tree ref; 0/19 vs 19/19 on 0.145.0 and 0.162.1
## Options considered   ← ≤3: symlinks on every install (chosen) · keep by-reference, wait on codex · copy into the plugin dir (refused by ADR-251)
## Decision
<rule: one `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` per shared skill, every install>

Superseded from ADR-253: <scope 1, one sentence>.

Carried forward from ADR-253: no shared skill body is ever copied into the adapter, and
`adapters/codex/skills/` must not exist (test-asserted); the two-entry local marketplace stays, with
`craft-codex` carrying the `craft-run` entrypoint and `craft` still declared.

Superseded from ADR-252: <scope 3, one sentence>.

Carried forward from ADR-252: `adapters/codex/` is the in-place home; the local file-backed
marketplace is the install path for what it still carries; no npm or registry package.
## Consequences   ← README L48–55 already states this route; codex dropping the ref is a codex limitation (row 1 stays open upstream)
```

- Under candidate 1 (a), the scope string names the whole two-entry choice, and the
  `Carried forward from ADR-253` line shrinks to the no-copy rule and `adapters/codex/skills/` must not
  exist. C2 requires the line either way.
- `subjects` are the files the decision governs. All four exist today. The intention port's
  governing lane reads them (`scripts/governing-corpus.sh` emits fenced records only).
- Every scope string is non-empty and has no `"` inside, so it is valid YAML in a double-quoted
  scalar (C0).
- The `Design:` line uses the current path `docs/contributing/design/…`, not the stale
  `docs/design/…` form that ADR-253 carries (see Edge behaviour).

### Part B — ADR-253 (the target)

Two edits, nothing else:

```diff
-- **Status:** accepted
+- **Status:** superseded by ADR-614
 - **Date:** 2026-07-20
 - **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-251 (copilot shared skills by reference)
+
+> **Superseded by ADR-614** for by-reference loading of the 19 shared skills: codex's cache copy
+> drops the out-of-tree `skills` reference, so they load through `$CODEX_HOME/skills` symlinks on every install.
```

No frontmatter fence is added. C1 reads the Status line only. Adding a fence would move ADR-253 into
the governing lane, and that is a change this brief did not ask for.

### Part C — ADR-252 (only under candidate 3 (a))

The same two edits. Blockquote: `> **Superseded by ADR-614** for the symlink route as a
contingency fallback: it is the working path for the shared skills on every install.` The rest of
the record stays as written.

### Part D — `BACKLOG.md` L203–211 (candidate 2)

Under 2 (b), recommended: the construction commit that adds ADR-614 also ticks this entry
delivered and removes the literal `ADR-253` token, because C3 is red from the moment ADR-614 exists
(E3). The documentation phase then finds the entry already ticked and leaves it alone. Shape:

```diff
-**ADR-253 still records that codex loads the shared skills by reference.**
+**The codex shared-skills ADR still recorded by-reference loading — delivered <date>**
+(ADR-614 supersedes it with the `$CODEX_HOME/skills` symlink route).
 …
-`adapters/codex/README.md:48` says the same. `git grep 'ADR-253'` finds no superseding ADR. Fix: a
+`adapters/codex/README.md:48` says the same. No ADR superseded it. Fix: a
```

This follows the existing "— delivered <date>**" convention (for example `BACKLOG.md` L306 and
L328). E6 shows it clears C3 with no waiver.

Under 2 (a), `BACKLOG.md` is left as is. This design doc gains one line, outside any code fence and
starting at column 0: the `DECISION-CITE-WAIVE(BACKLOG.md):` token followed by a reason. Design
docs are always waiver sources (`scripts/ci.sh` L152–155).

### Part E — `README.md` L199–201

Each count moves in the commit that adds the file it counts, because `scripts/ci.sh` fails on a stale
count (E9). Design 75→76 rides with this doc's commit. Plan 74→75 rides with the plan doc's commit.
ADRs 613→614 (615 under 3 (b)) ride with the Part A commit.

### Commit plan

1. This design doc, plus the README design count 75→76 (E9).
2. One commit: Parts A + B (+ C) + D + the README ADR count. adr-lint C1/C2/C3 and readme-drift all go green together.
   Splitting it leaves a commit with C3 or C1 red. A finer split is a known-red commit, so it is
   refused.

### Edge behaviour

- **C1 uniqueness.** `checkC1` (L305) matches files that start with `253-` (and `252-`). Each
  prefix resolves to exactly one file today.
- **C2 anchoring.** The lines must start at column 0, outside any blockquote or list item, since
  the regex is `^Superseded from ADR-253\b` with the `m` flag (`checkC2`, L324).
- **This doc mentions the waiver token mid-line only.** E4 shows a mid-line mention waives nothing,
  so this doc does not waive `BACKLOG.md` by accident. That stays true until 2 (a) is ratified.
- **The stale `Design:` path, recorded as a fact only.** ADR-253 L5 points at
  `docs/design/native-codex-binding.md`. `docs/design/` does not exist, and the file lives at
  `docs/contributing/design/native-codex-binding.md`. 13 ADRs carry that same stale path, and 121
  carry some `docs/design/` path. Since the docs audience split, dated records keep their old paths
  on purpose. It is not fixed here.
- **Option 3 is adopted for its skills half only.** ADR-253 option 3 reads "symlink farm + a
  standalone `hooks.json`, no plugin manifest". Under candidate 1 (b), the `craft-codex` manifest stays,
  and the guard hook is wired by hand into `$CODEX_HOME/config.toml` (README L62–68), not through a
  standalone `hooks.json`. ADR-614's Decision states that it adopts the symlink farm for the 19 shared
  skills and nothing else of option 3. Otherwise the record would claim a manifest-less install the
  tree does not ship.
- **The `craft` entry is inert but still installed.** README L18 still tells users to run
  `codex plugin add craft@craft-codex-marketplace`, and installing it loads nothing (E1). Under
  candidate 1 (b), ADR-614 records this as carried forward. The design does not change it (R7).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | What ADR-614 supersedes in ADR-253 (user-reserved) | (a) The whole decision: the two-entry marketplace choice is withdrawn along with by-reference loading. · (b) Only the by-reference mechanism for the 19 shared skills. The two-entry marketplace and the `craft-codex` entry carry forward. · (c) (a), plus retiring the inert `craft` entry: `marketplace.json`, `plugins/craft/plugin.json`, the README L18 install line, and tests L141–156 and L186–192. | **(b)** | What ships today: `marketplace.json` still declares both entries, and README L16–18 installs both. `craft-codex` is the live install path for `craft-run` (README L36–38), the adapter-authored home ADR-253 option 2 lacked. `native-surface.test.js` L186–192 pins exactly `['craft', 'craft-codex']`. Under (a), ADR-614 would withdraw a choice the tree still implements and a test still pins, so the record would contradict the code. (c) is a source and test change, outside a docs/ADR brief, and needs its own design. |
| 2 | How `BACKLOG.md` L205/L210's `ADR-253` citations clear C3 | (a) A `DECISION-CITE-WAIVE(BACKLOG.md): <reason>` line in this design doc. · (b) Reword the entry while ticking it delivered, so the literal `ADR-253` is gone and ADR-614 is cited instead. · (c) Delete the entry. | **(b)** | E5: the waiver key is the file only. (a) would blind C3 on `BACKLOG.md` (105 ADR citations) for every later supersession, for good, and it would be the tree's first waiver. (b) follows the "— delivered" tick convention the documentation phase applies anyway, and E6 shows C3 green with it. (c) breaks the convention of keeping delivered entries in place. |
| 3 | ADR-252's "symlinks are a fallback only if row 9a fails" (user-routed: same claim, ADR-608) | (a) Supersede it in ADR-614 with a second, narrow `supersedes` entry: the fallback-only framing. Home, marketplace and no-package carry forward. · (b) A separate ADR-615 superseding the same scope. · (c) Leave ADR-252 `accepted` and file a backlog entry with a `Not folded:` reason. | **(a)** | ADR-252's Decision and Consequence 2 call the symlink route a contingency, and README L53–55 says "not a contingency to fall back on". That is the same claim this change corrects, so it is in scope under ADR-608. E7: zero live-tier `ADR-252` citations, so (a) adds no C3 work, and one ADR then states the load path. (b) splits one fact across two records and adds a README count. (c) leaves a contradicting accepted record. ADR-252 option 1's other pro, that the marketplace carries "hooks + skills + agents as one installable unit", is also false (README L31–46). That is a different claim (hooks and agents), so it is out of scope for every option here. |

## Test strategy

No behaviour changes, so no new unit test. Each obligation is proved by an existing gate whose red
output E3/E7/E8 already pinned on a throwaway clone.

| Obligation | Check | RED before / GREEN after |
|---|---|---|
| R1 C0 form | `bash scripts/adr-lint.sh docs/contributing/adr` (via `scripts/ci.sh` `run_adr_lint`) | a malformed `subjects`/`supersedes` reports a C0 finding / no finding |
| R3 (and R6) C1 | same | `253-…md: missing required line: - **Status:** superseded by ADR-614` (E3/E7 form) / none |
| R2 C2 | same | `614-…md: missing a line starting "Superseded from ADR-253"` / none |
| R4 C3 | same | `DECISION-CITE-FOUND(BACKLOG.md): ADR-253@L205` and `@L210` (E3) / `craft-adr: OK — 614 ADR(s) checked, 16 declaring supersession.` |
| R5 counts | `bash scripts/readme-drift.sh` (the CI `readme-drift` job; also `engine/test/readme-drift-main.test.js` L304–311 inside ci.sh) | `corpus-counts: docs/contributing/adr/ claims 613, tree holds 614` (E8) / exit 0 |
| design doc shape | `bash scripts/design-lint.sh docs/contributing/design/supersede-adr-253-symlink-route.md` (via `scripts/static-lints.sh`) | `missing sections` exit 2 / "6 required sections present" (green on this commit) |
| BACKLOG shape | `bash scripts/backlog-lint.sh BACKLOG.md` (static-lints) and `node engine/bin/intention-lint.js` over the living corpus (`run_intention_lint`) | stay green after the Part D edit |
| touched prose | `run_prose_lint` over touched `BACKLOG.md`, `README.md` (ADR/design dirs are excluded) | no new finding |
| links | CI `links` job (lychee `--offline --include-fragments`) | any markdown link in ADR-614 resolves |
| R7 | `node --test adapters/codex/test/native-surface.test.js` (inside `scripts/ci.sh` `run_suite adapters/codex`) | L125–130, L133–138, L141–156, L186–192 green, files untouched |

Full gate: `bash scripts/ci.sh` (covers readme-drift through the engine suite), per commit. No mutation scope (no source
hunks). `validation` is expected to record a no-op.

## Out of scope

- A live codex re-probe. E1 is recorded, and the orchestrator verified it (brief).
- Removing the inert `craft` marketplace entry and its plugin manifest (candidate 1 (c)).
- ADR-252's hooks/agents claim that the marketplace carries "hooks + skills + agents as one
  installable unit", contradicted by README L31–46. It is a different claim from this change.
  Proven, not acted on.
- Rewriting the stale `docs/design/native-codex-binding.md` paths in 13 ADRs. Dated records keep
  their paths.
- Editing ADR-253's body beyond R3. ADR-608's mention of ADR-253 sits in the exempt tier and stays
  as it is.
