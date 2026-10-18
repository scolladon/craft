# Design — the codex marketplace carries only `craft-run`: retire the inert `craft` entry, supersede ADR-252's "one installable unit"

> Brief: fix both `BACKLOG.md` entries that open the section "Open (scoped 2026-10-17 — follow-ups
> surfaced by the supersede-adr-253-symlink-route run)" in one run. (1) The codex `craft`
> marketplace entry installs and loads nothing, yet `adapters/codex/README.md:18` tells users to
> install it. (2) ADR-252 option 1 still claims the marketplace is "the only one that carries
> `hooks` + `skills` + agents as one installable unit". Fold every finding; target zero new backlog
> entries. No live codex run: the 0.162.1 evidence is already pinned.
> Status: draft → self-reviewed ×3

---

## Context

### What exists (read on this tree, 2026-10-18)

- **`adapters/codex/.claude-plugin/marketplace.json`** declares two `"source": "local"` entries:
  `craft` → `./plugins/craft` (its description already says "Installing this entry does NOT load
  them") and `craft-codex` → `./plugins/craft-codex`.
- **`adapters/codex/plugins/craft/plugin.json`** is `{name, version, description, author,
  skills: "../../../../skills"}`. Its only payload is that out-of-tree `skills` reference. It is the
  only file under `plugins/craft/`.
- **`adapters/codex/plugins/craft-codex/plugin.json`** declares `hooks: "../../hooks.json"` and
  `skills: "./skills"`. `plugins/craft-codex/skills/` holds exactly `craft-run/`.
- **`adapters/codex/README.md`**:
  - L10–13: "then install\nboth entries with the `<plugin>@<marketplace>` selector:".
  - L15–19 install block; L17 `codex plugin add craft-codex@craft-codex-marketplace`, L18
    `codex plugin add craft@craft-codex-marketplace`.
  - L25–29: "`marketplace.json` declares two entries. … `craft` is the second entry, whose `skills`
    field points at the repository-root `skills/` tree."
  - L31–46: the cached manifest is `{description, name}`, so of hook, agents and `craft-run`,
    only `craft-run` arrives through the marketplace. The guard hook arrives "no" and must be wired
    by hand; the nine agents arrive "no", and how codex picks them up "was never probed".
  - L48–56: "drops the `craft` entry's out-of-tree `../../../../skills` reference …
    Measured through the app-server's own skills-listing method: **0 of 19** … **19 of 19**".
  - No other line names the `craft` entry (`git grep` E2).
- **`adapters/codex/test/native-surface.test.js`**:
  - L19 `const CRAFT_PLUGIN_PATH = join(ADAPTER_DIR, 'plugins', 'craft', 'plugin.json');`
  - L141–156 `describe('plugins/craft/plugin.json — by-reference skills path')`: L142–149 asserts
    the manifest's `skills` resolves (by `realpathSync`) to the repo-root `skills/`; L151–155
    asserts `skills/run/SKILL.md` exists ("so the entrypoint citation does not drift").
  - L169 `describe('marketplace.json — local file-backed, two entries')`; L183
    `assert.deepEqual(sut, ['local', 'local'])`; L186–192 asserts names `['craft', 'craft-codex']`.
  - L312 hygiene surface `{ label: 'plugins/craft/plugin.json', text: readFileSync(CRAFT_PLUGIN_PATH, 'utf8') }`.
  - `REPO_ROOT`, `realpathSync` and `dirname` stay in use elsewhere (L9–12, L23, L161–165), so no
    import becomes dead.
- **`docs/contributing/specs/execution.md` L150–154** (a living page: `scripts/living-corpus.sh`
  enumerates `docs/contributing/specs/*.md`): "A local file-backed marketplace … carries two plugin
  entries: `craft`, resolving the shared `skills/` directory **by reference** at the repo root …,
  and `craft-codex`, supplying this binding's own `hooks/`, `agents/`, and entrypoint." Both halves
  are false on the pinned codex (E1): this is claim (1) and claim (2) restated in a live spec.
  Folded here (ADR-608: same claim).
- **ADR-252** `docs/contributing/adr/252-codex-binding-home-and-load-path.md` (no fence). L3
  `- **Status:** superseded by ADR-614`; L7–8 blockquote `> **Superseded by ADR-614** for the
  symlink route as a contingency fallback: …`. L16 option 1 (chosen): "the only one that carries
  `hooks` + `skills` + agents as one installable unit".
- **ADR-614** `docs/contributing/adr/614-codex-loads-shared-skills-through-codex-home-symlinks.md`
  (fenced; `subjects` include `adapters/codex/plugins/craft/plugin.json`; `supersedes` 253 and 252).
  L15 `- **Status:** accepted`. L35 "Carried forward from ADR-253: … the two-entry local marketplace
  stays, with `craft-codex` carrying the `craft-run` entrypoint and `craft` still declared." L44
  "Installing the `craft` entry still loads no shared skill. It stays declared, and
  `native-surface.test.js` still pins both entries. Retiring it would be a source and test change
  with its own design."
- **Counts.** `ls docs/contributing/adr | wc -l` = 634, highest `634-…`: next free ADR is **635**.
  `README.md` L199–201: "79 design docs", "77 parted plans", "634 ADRs".

### Pinned evidence (this tree and a throwaway clone `<tmp>/c`, 2026-10-18)

| # | Probe | Result |
|---|---|---|
| E1 | `docs/contributing/specs/codex-poc-record.md` L332 (row 1) and L554; `codex --version` on this box = codex-cli 0.162.1, the pinned version | Row 1 DISPROVEN on 0.145.0 and 0.162.1: 0/19 by reference, 19/19 through the symlinks. L554: after `plugin add` of both entries, both cached `.codex-plugin/plugin.json` are `{description, name}`; `skills` and `hooks` dropped. The `craft` entry's sole payload never reaches codex. No re-probe needed. |
| E2 | `git grep` for `plugins/craft/`, `craft@craft-codex`, `CRAFT_PLUGIN_PATH`, `adapters/codex/skills`, `two entries`, `craft-codex-marketplace`, `codex plugin add` | codex-entry hits: `adapters/codex/{README.md,.claude-plugin/marketplace.json,test/native-surface.test.js}`, `BACKLOG.md` L215–219, `docs/contributing/specs/codex-poc-record.md` L441–442 + L554 (dated probe records), `docs/contributing/specs/execution.md` L150–154. `plugins/craft/` hits under `adapters/antigravity/` are that binding's own dir, unrelated. `adapters/codex/src/`, `skills/craft-run/SKILL.md` and `config.template.toml` carry no install step naming `craft`. |
| E3 | Live-tier `ADR-252` / `ADR-614` citations (outside `docs/contributing/{adr,design,plan,archive,prd}`, the derived exempt set) | `ADR-252`: none. `ADR-614`: `BACKLOG.md` L217, L229, L270 only. |
| E4 | Clone: stub ADR-635 superseding `"252"` and `"614"`; ADR-252 gets a **second** line `- **Status:** superseded by ADR-635` under the existing one; ADR-614 L15 → `superseded by ADR-635`; `bash scripts/adr-lint.sh docs/contributing/adr` | exit 2: `DECISION-CITE-FOUND(BACKLOG.md): ADR-614@L217`, `@L229`, `@L270`. No C1/C2 finding. |
| E5 | Same, but ADR-252's one line combined: `- **Status:** superseded by ADR-614, ADR-635` | exit 2: C1 `252-…md: missing required line: - **Status:** superseded by ADR-614` **and** `… ADR-635` (`checkC1`, `engine/src/adr-lint-main.js` L313–314 compares `line.trim()` for exact equality). The combined form is refused; two lines are required. |
| E6 | Same as E4 with `BACKLOG.md` L217/L229/L270 reworded per Design §B (no waiver) | `craft-adr: OK — 635 ADR(s) checked, 17 declaring supersession.` exit 0 (baseline: 634 checked, 16 declaring). |
| E7 | Keep variant: ADR-635 supersedes `"252"` only, two Status lines on ADR-252, ADR-614 untouched | exit 0, no `BACKLOG.md` edit needed (no live `ADR-252` citation, E3). |
| E8 | Other consumers of the `- **Status:**` line: `git grep` over `*.js`/`*.sh`/`*.mjs` outside tests for `Status:` / `superseded by`; `scripts/governing-corpus.sh` | Only `adr-lint-main.js` L313 reads it. `governing-corpus.sh` filters on the line-1 `---` fence only; `engine/src/intention*.js` read `subjects` only. A second Status line breaks nothing. Chain precedent: ADR-383 is itself a superseder (of 377/378) and is `superseded by ADR-384`. No ADR has two Status lines yet: this is the first. |
| E9 | Clone, E6 state + a stub design doc + `README.md` counts 80 / 635, committed; `bash scripts/ci.sh` | exit 0 (≈20 s). prose-lint, backlog-lint, intention-lint, readme-drift and adr-lint all green on the reworded `BACKLOG.md`. |
| E10 | Clone, Design §C applied on top of E9 (marketplace entry dropped, `plugins/craft/` deleted, README L13/L18/L25–29/L50–53, `execution.md` L150–154, the test edits of §C.4); `node --test test/native-surface.test.js`, then `bash scripts/ci.sh` | native-surface 148 pass / 0 fail; ci.sh exit 0. |
| E11 | Clone, source retired but test file untouched (RED of the current pins) | 3 suites fail: L141 describe (ENOENT on `plugins/craft/plugin.json`), L169 describe (`['local']` vs `['local','local']`; `['craft-codex']` vs `['craft','craft-codex']`), and the three hygiene describes (ENOENT at collection, L312). |
| E12 | Clone, new tests + retired marketplace, but the old README (L18 still present) | the new selector test fails alone: `Given README.md and marketplace.json, when every plugin add selector is collected, …` (README names `craft@craft-codex-marketplace`, which is no longer declared). |

### Constraints already decided

- Supersession mechanics (adr-lint C0–C3, `skills/decisions/SKILL.md` "Supersession authoring
  obligations"): superseder frontmatter `subjects:` + `supersedes: [{adr, scope}]`; metadata line
  `**Supersedes/Refines:** supersedes ADR-N`; line-anchored `Superseded from ADR-N:` /
  `Carried forward from ADR-N:` in the Decision; target carries exactly
  `- **Status:** superseded by ADR-M` plus a `> **Superseded by ADR-M** for <scope>: …` blockquote;
  C3 is hard-blocking and whole-corpus, so the citation sweep lands in the same commit as the ADR.
- A superseded ADR's body is a dated record: only the Status line(s) and the blockquote change.
- ADR-251: no shared skill is copied into an adapter. ADR-085: adapters live in place. ADR-608:
  a finding folds when it shares a file or a claim with the change; superseding is a user decision.
- `DECISION-REVERSAL(ADR-NNN): <scope> -> ADR-MMM` (`docs/contributing/specs/run-record.md` L96):
  one per `supersedes` entry, `<scope>` verbatim from the frontmatter.
- Corpus counts move in the commit that adds the counted file (readme-drift through
  `engine/test/readme-drift-main.test.js` inside `scripts/ci.sh`).
- Committed files carry no absolute or home-rooted path and no tooling trace; test titles are
  printable ASCII, no provenance refs.

## Requirements

1. **R1 — superseder.** `docs/contributing/adr/635-<slug>.md` from `templates/adr.md`, fenced,
   `supersedes` `{adr: "252", scope: <D2>}` (and `{adr: "614", scope: <D1>}` under D1 (a)). Its
   Decision records what the marketplace carries on the pinned codex: the `craft-run` entrypoint
   only; the guard hook is wired by hand into `$CODEX_HOME/config.toml`; the nine agents are not
   carried; the shared skills load through ADR-614's symlinks.
2. **R2 — both directions.** One `Superseded from ADR-N:` and one `Carried forward from ADR-N:`
   line per `supersedes` entry, column 0, in the Decision.
3. **R3 — targets.** ADR-252 keeps L3 and gains a second line `- **Status:** superseded by ADR-635`
   directly under it (E5 refuses one combined line), plus a second blockquote paragraph. Under D1
   (a) ADR-614 L15 becomes `- **Status:** superseded by ADR-635` and gains a blockquote after L17.
4. **R4 — C3 clean.** adr-lint reports nothing. Under D1 (a), `BACKLOG.md` L217/L229/L270 drop the
   literal `ADR-614` (Design §B) in the same commit as R1.
5. **R5 — counts.** `README.md` L199–201: design 79→80 in this doc's commit; ADRs 634→635 in the
   decisions commit (636 under D1 (b)); plans 77→78 in the plan's commit.
6. **R6 — the entry (D1 (a)).** `plugins/craft/` no longer exists; `marketplace.json` declares
   `craft-codex` only; the README installs only `craft-codex` and no prose describes a second entry;
   `native-surface.test.js` pins the single entry and pins the README's install selectors to the
   declared entries.
7. **R7 — live spec.** `docs/contributing/specs/execution.md` L150–154 states what the marketplace
   actually carries (under either D1 outcome).
8. **R8 — the tick.** The two entries' delivered ticks (documentation phase) cite ADR-635 and carry
   no `ADR-252` / `ADR-614` literal (Design §B.3).

## Design

### §A — ADR-635 (written by the decisions phase, not here)

Shape for the recommendations D1 (a) + D2 (a). File:
`docs/contributing/adr/635-the-codex-marketplace-carries-only-the-craft-run-entrypoint.md`.

```markdown
---
subjects:
  - adapters/codex/README.md
  - adapters/codex/.claude-plugin/marketplace.json
  - adapters/codex/test/native-surface.test.js
  - docs/contributing/specs/execution.md
supersedes:
  - adr: "252"
    scope: "the local marketplace as the only route that carries hooks, skills and agents as one installable unit"
  - adr: "614"
    scope: "the craft marketplace entry stays declared and native-surface.test.js pins both entries"
---
# 635 — The codex marketplace carries only the `craft-run` entrypoint

- **Status:** accepted
- **Date:** <YYYY-MM-DD>
- **Design:** docs/contributing/design/codex-marketplace-entry-adr-252.md · **Supersedes/Refines:** supersedes ADR-252, ADR-614

## Context      ← E1: cached manifests are {description, name}; hooks + skills dropped; agents never in the manifest shape
## Options considered   ← D1's three options
## Decision
<rule> The local marketplace declares one entry, `craft-codex`, and delivers `craft-run` only. The guard
hook is wired by hand from `config.template.toml` into `$CODEX_HOME/config.toml`; the nine agents are
not carried; the 19 shared skills load through the `$CODEX_HOME/skills` symlinks.

Superseded from ADR-252: the local marketplace as the only route that carries hooks, skills and agents as one installable unit.

Carried forward from ADR-252: `adapters/codex/` is the in-place home; the local file-backed marketplace is the install path for `craft-run`; no npm or registry package is published.

Superseded from ADR-614: the `craft` marketplace entry stays declared and `native-surface.test.js` pins both entries.

Carried forward from ADR-614: the 19 shared skills load through `$CODEX_HOME/skills` symlinks on every install; no shared skill body is copied into the adapter, and `adapters/codex/skills/` must not exist.
## Consequences
- `plugins/craft/` is deleted; the README installs `craft-codex` only; a test pins README selectors to the declared entries.
- Re-measuring by-reference loading on a later codex (ADR-614's revisit clause) builds a throwaway entry with an out-of-tree `skills` reference in the probe's throwaway env; none ships.
- How codex loads the nine agents stays unprobed; this record claims only that the marketplace does not carry them.
```

- `subjects` lists only files that exist after the change (not the deleted `plugins/craft/plugin.json`).
- Scope strings: non-empty, no `"` inside (C0); the `DECISION-REVERSAL` lines reuse them verbatim.
- The decisions phase writes the Options/Context prose; the shape above fixes only what the lints and
  this design rely on.

### §B — The decisions-phase commit (one commit; C1/C3 are whole-corpus and hard-blocking)

1. **ADR-252** — after L3 and inside the blockquote:

   ```diff
    - **Status:** superseded by ADR-614
   +- **Status:** superseded by ADR-635
    - **Date:** 2026-07-20
    …
    > **Superseded by ADR-614** for the symlink route as a contingency fallback: it is the working path
    > for the shared skills on every install.
   +>
   +> **Superseded by ADR-635** for the marketplace as one installable unit carrying hooks, skills and
   +> agents: only the `craft-run` entrypoint arrives through it.
   ```

   Two Status lines, not one combined line (E5). Body unchanged.
2. **ADR-614** (D1 (a) only) — L15 `- **Status:** accepted` → `- **Status:** superseded by ADR-635`;
   after L17 insert a blank line and `> **Superseded by ADR-635** for the kept `craft` marketplace
   entry: it is retired, and the marketplace declares `craft-codex` only.` ADR-614 keeps its fence,
   its `supersedes` of 253/252 (C1 on those targets still passes, E6) and its now-dangling
   `subjects` entry `adapters/codex/plugins/craft/plugin.json` (a dated record; nothing checks a
   subject path exists, E8).
3. **`BACKLOG.md`** (D1 (a) only; C3, E4→E6). Exact rewording, verified in E6/E9:

   | Line | Current | New |
   |---|---|---|
   | L217 | `row 1: 0 of 19). ADR-614 keeps the entry declared, and …` | `row 1: 0 of 19). The codex symlink-route ADR keeps the entry declared, and …` |
   | L229 | `… from the shared-skills load path ADR-614 corrects.` | `… from the shared-skills load path the codex symlink-route ADR corrects.` |
   | L270 | `…pull/73), ADR-614: the `$CODEX_HOME/skills` symlink route, scope ratified as the by-reference mechanism only).` | `…pull/73): the `$CODEX_HOME/skills` symlink route, scope ratified as the by-reference mechanism only; ADR-635 later retired the `craft` entry it kept).` |

   **The documentation-phase tick** (R8) then rewrites the two titles, following the "— delivered
   <date>**" + `([PR #<n>](…), ADR-<M>: …)` convention (L269–270), with no `ADR-252` / `ADR-614`:

   ```markdown
   **The codex `craft` marketplace entry installs and loads nothing — delivered <date>**
   ([PR #<n>](https://github.com/scolladon/craft/pull/<n>), ADR-635: the entry is retired; the marketplace declares `craft-codex` only).
   …
   **The codex binding-home ADR still says the marketplace carries hooks, skills and agents as one unit — delivered <date>**
   ([PR #<n>](https://github.com/scolladon/craft/pull/<n>), ADR-635: only `craft-run` arrives through the marketplace; the guard is wired by hand in `$CODEX_HOME/config.toml`, and the agents are not carried).
   ```

   Under D1 (c) the L217 sentence stays true and L229 keeps `ADR-614` (not superseded); only the
   tick lines change.
4. **`README.md` L201** `[634 ADRs]` → `[635 ADRs]` (`[636 ADRs]` under D1 (b), which also splits
   §A into ADR-635 (252) and ADR-636 (614) — each needs its own C2 pair, and the ADR-614 flip and
   §B.3 rewording ride with ADR-636's commit).
5. **Ledger lines** (orchestrator, after the commit):

   ```
   DECISION-REVERSAL(ADR-252): the local marketplace as the only route that carries hooks, skills and agents as one installable unit -> ADR-635
   DECISION-REVERSAL(ADR-614): the craft marketplace entry stays declared and native-surface.test.js pins both entries -> ADR-635
   ```

   The second line exists only under D1 (a) (`-> ADR-636` under D1 (b)).

### §C — Implementation (D1 (a)): Part 1, one green commit, TDD

Tests first in `adapters/codex/test/native-surface.test.js` (Given/When/Then titles, AAA, `sut`,
printable ASCII, no provenance refs). The README edits and the marketplace edit are coupled by the
new selector test (E12), so source, README and test land in one commit; the RED is observed
locally, never committed.

1. **RED — new/changed tests** (against today's tree, E11/E12):
   - L19: replace `CRAFT_PLUGIN_PATH` with `const PLUGINS_DIR = join(ADAPTER_DIR, 'plugins');`.
   - L141–149 → `describe('plugins/ — the craft-codex plugin dir only')` with
     `it('Given the codex adapter plugins directory, when its entries are listed, then it contains exactly craft-codex')`:
     `assert.deepEqual(readdirSync(PLUGINS_DIR), ['craft-codex'])`. RED today (`['craft', 'craft-codex']`).
   - L151–155 (`skills/run/SKILL.md` exists) moves unchanged into the entrypoint describe (L255): it
     guards the entrypoint's citation, not the retired manifest.
   - L169 title → `'marketplace.json — local file-backed, one entry'`; L183 → `['local']`; L186–192 →
     `it('Given marketplace.json, when parsed, then it declares exactly the craft-codex entry')`,
     `assert.deepEqual(sut, ['craft-codex'])` (no `.sort()` needed for one element). RED today.
   - New, in the same describe — the drift guard that would have caught this:

     ```js
     it('Given README.md and marketplace.json, when every plugin add selector is collected, then they name exactly the declared entries of the declared marketplace', () => {
       const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));
       const declared = parsed.plugins.map((p) => `${p.name}@${parsed.name}`).sort();

       const sut = [...readFileSync(README_PATH, 'utf8').matchAll(/codex plugin add (\S+)/g)].map((match) => match[1]).sort();

       assert.deepEqual(sut, declared);
     });
     ```

     The prose mentions `` `codex plugin add` COPIES `` (L31, L50) do not match: a backtick, not a
     space, follows `add`. Green today (both declared, both installed); RED after the marketplace edit
     until L18 goes (E12).
   - New, in `README.md — honesty pins`:
     `it('Given README.md, when scanned, then it shows the shared-skills symlink line')`,
     `assert.ok(sut.includes(SKILLS_SYMLINK_LINE))` (constant L59). It replaces the deleted
     "resolves to the repo-root skills/" test as the proof of where the shared skills come from.
   - L312: drop the `plugins/craft/plugin.json` hygiene surface.
2. **GREEN — source:**
   - `adapters/codex/.claude-plugin/marketplace.json`: delete the `craft` object (L5–9); `plugins`
     holds the `craft-codex` object only.
   - Delete `adapters/codex/plugins/craft/plugin.json` (`git rm`; the directory goes with it).
   - `adapters/codex/README.md`:
     - L12–13 `then install\nboth entries with` → `then install\nits one entry with`.
     - Delete L18.
     - L25–29 →
       ```
       `marketplace.json` declares one entry, `craft-codex`: this binding's own plugin
       directory, and it holds exactly one thing: the delegating `craft-run` entrypoint skill
       under `plugins/craft-codex/skills/`. Its manifest also declares
       `hooks: "../../hooks.json"` — a path pointing OUT of the plugin directory. No entry
       carries the shared skills: an entry whose `skills` field points at the repository-root
       `skills/` tree installs and loads nothing (below).
       ```
     - L50–53 `so, drops the `craft` entry's out-of-tree `../../../../skills` reference — the cached`
       … `absent. Measured through` → `so, drops an out-of-tree `skills` reference such as
       `../../../../skills` — the cached` … `absent. Measured, with such an entry installed, through`.
       The 0/19 and 19/19 figures stay: they were measured with that entry (E1).
3. **REFACTOR**: none expected; `bash scripts/ci.sh` green (E10).

### §D — Implementation: Part 2, `docs/contributing/specs/execution.md` L150–154 (both D1 outcomes)

```
**Native discoverable surface.** A local file-backed marketplace (`"source": "local"`) declares
one plugin entry, `craft-codex`, installed via `codex plugin marketplace add` then `codex plugin
add`. Only the `craft-run` entrypoint arrives that way: `codex plugin add` copies the plugin into
its cache and drops every out-of-tree reference. The shared `skills/` load through one
`$CODEX_HOME/skills/<name>` symlink per skill (no adapter-local copy), the guard hook is wired by
hand into `$CODEX_HOME/config.toml`, and the marketplace does not carry the role agents.
```

Under D1 (c) the first sentence reads "declares two plugin entries; installing `craft` loads
nothing" instead. Doc-only part; no test (prose-lint and intention-lint cover it, E10).

### §E — Under D1 (c) (keep the entry)

- ADR-635 supersedes `"252"` only; §B.2 and the §B.3 rewording do not happen (E7).
- README: L13 and L18 stay; L28–29 → "`craft` is the second entry, whose `skills` field points at
  the repository-root `skills/` tree; installing it loads none of them (below)."
- `native-surface.test.js` unchanged; §D with the variant sentence.

### Commit plan

1. This design doc + `README.md` L200 `[79 design docs]` → `[80 design docs]`.
2. Decisions: §A + §B.1–§B.4 in one commit (`docs(adr): 635 …`); C1 and C3 fail on any split (E4, E5).
3. Plan doc + `[77 parted plans]` → `[78 parted plans]`.
4. Part 1 (§C) — `fix(codex): …`, one commit.
5. Part 2 (§D) — `docs(spec): …`, one commit.
6. Documentation phase: the §B.3 ticks.

### Adopted, no user judgment

- Two Status lines on ADR-252 (E5 refuses the combined form; E8 shows no other consumer).
- §B.3 rewording instead of a citation waiver (a waiver is file-keyed and would blind C3 on all of
  `BACKLOG.md`).
- Folding `execution.md` L150–154 (same claim, a living page).
- The README selector test and the symlink-line pin; moving the `skills/run/SKILL.md` existence test.
- Leaving `codex-poc-record.md` L441–442 and L554 as written: they record what was executed on
  0.162.1, and the `craft` entry is what was executed.
- Leaving ADR-614's dangling `subjects` entry (§B.2).

### Edge behaviour

- `checkC1` resolves a target by filename prefix; `252-` and `614-` each match one file.
- ADR-614 superseded keeps declaring 253/252: C1 on 253/252 still expects `superseded by ADR-614`,
  which stays (E6). A superseded superseder has precedent (ADR-383).
- `.sort()` stays on the selector test both sides, so README order is free.
- If a later README shows `codex plugin add` with a `--flag` before the selector, the regex captures
  the flag and the test fails loudly — acceptable: the install block is under test on purpose.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | The `craft` marketplace entry (user-reserved; reverses ADR-614's "stays declared") | (a) Retire it: delete `plugins/craft/plugin.json`, drop the marketplace entry, README L18 + L13/L25–29/L50–53, rework the pins (§C); ADR-635 also supersedes ADR-614's kept-entry scope — **one ADR** for both briefs. · (b) Retire it, but record it in a **second ADR** (ADR-636 supersedes 614; ADR-635 supersedes 252 only). · (c) Keep it declared and installed; README says installing it loads nothing (§E); tests unchanged. | **(a)** | E1: on every pinned codex the entry's only payload is dropped, so the README's L18 step is a no-op and L186–192 pins a no-op. Its own description already admits it loads nothing. The only reason to keep it, a future codex that keeps out-of-tree references (ADR-614's revisit clause), is served by a throwaway entry in the probe env (YAGNI). (a) vs (b): both briefs state one fact, "the marketplace carries `craft-run` only", so one record states it; (b) splits it and adds an ADR count. E9/E10 prove (a) green end to end. |
| D2 | ADR-635's scope over ADR-252 and what it records (user-reserved) | (a) Narrow: supersede only option 1's "only one that carries `hooks` + `skills` + agents as one installable unit"; record that the marketplace delivers `craft-run` only, the guard is wired by hand into `$CODEX_HOME/config.toml` (from `config.template.toml`, trusted by `bin/trust-hook.js`), the nine agents are not carried (their codex load path unprobed), shared skills per ADR-614; carry forward the in-place home, the marketplace as `craft-run`'s install path, no package. · (b) Broad: supersede ADR-252's whole load-path Decision and restate the full multi-route load contract in ADR-635. · (c) Narrow scope as (a), but record nothing about the agents. | **(a)** | (a) supersedes exactly the claim README L31–46 contradicts and leaves ADR-252's still-true home/no-package decisions where ADR-614 already carried them. (b) re-decides settled choices (ADR-085, the in-place home) to gain one consolidated page. (c) leaves the agents half of the false claim with no replacement statement; "not carried, load path unprobed" is what README L43–46 pins, so it is provable without claiming more. |

## Test strategy

| Obligation | Check | RED before / GREEN after |
|---|---|---|
| R1–R3 C0/C1/C2 | `bash scripts/adr-lint.sh docs/contributing/adr` (in `scripts/ci.sh` `run_adr_lint`) | E5: `missing required line: - **Status:** superseded by ADR-635` / `OK — 635 ADR(s) checked, 17 declaring supersession.` |
| R4 C3 | same | E4: `DECISION-CITE-FOUND(BACKLOG.md): ADR-614@L217/@L229/@L270` / E6 exit 0 |
| R5 counts | `bash scripts/readme-drift.sh`; `engine/test/readme-drift-main.test.js` inside ci.sh | `docs/contributing/design/ claims 79, tree holds 80` / exit 0 |
| R6 entry | `node --test adapters/codex/test/native-surface.test.js` (ci.sh `run_suite adapters/codex`) | E11/E12: plugins-dir, marketplace-names and selector tests fail / E10: 148 pass, 0 fail |
| R6 no silent drop | new selector test | E12: fails while README L18 survives the marketplace edit |
| R7 spec | prose-lint over touched md; `node engine/bin/intention-lint.js` (living corpus) | stay green (E10) |
| R8 tick | adr-lint C3 + backlog-lint after the documentation commit | no `ADR-252`/`ADR-614` in the tick lines; green |
| design doc | `bash scripts/design-lint.sh docs/contributing/design/codex-marketplace-entry-adr-252.md` | 6 sections present |

Full gate per commit: `bash scripts/ci.sh` (E9, E10: exit 0). Mutation scope: none — no `src/` hunk
(JSON, Markdown and a test file only).

## Out of scope

- A live codex run: E1 is pinned on the installed 0.162.1.
- How codex loads the nine role agents: unprobed (README L44–46); proving it needs a live codex
  probe of the agent load path. Recorded in ADR-635 as unprobed, not decided.
- The `craft-codex` manifest's `hooks: "../../hooks.json"` and `skills: "./skills"` fields, also
  dropped by the cache copy (E1, L554): README L28 and L39–42 already disclose it, and the
  hooks-path test (L158–167) pins the reference on purpose; removing them is a different decision
  from the entry this brief retires.
- Rewriting ADR-252, ADR-614 or `codex-poc-record.md` bodies beyond §B.
