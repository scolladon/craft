# Plan — P4: generic vocabulary (rename + alias-map wiring)

> Source: design doc `docs/DESIGN-customizable-engine.md` (§As-is → to-be, §Manifest & alias
> resolution) · ADRs `004, 009, 012, 013, 014`
> The plan is the implementation script AND the knowledge handoff. Slice agents start with zero
> context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Surface gate (binding — holds at every commit)

- The golden `Resolution` stays **byte-identical**: `pipeline/default.yml` and the engine
  resolver are **not** touched. `node engine/bin/pipeline-resolve.js pipeline/default.yml` is
  unchanged.
- `scripts/ci.sh` green at every commit; never `--no-verify`. The SC1 + scenario goldens
  (`engine/test/scenarios.test.js`) and `test/manifest-lint.bats` stay green by construction.
- `resolveAlias` (`engine/src/alias-map.js`) is the ONLY alias home — no second copy (DC-4).
- Every renamed skill stays invocable as `craft:<concern>` (its `name:` frontmatter matches the
  new dir).

## Sizing rules

- Every slice costs a full agent lifecycle — it must earn it.
- No standalone test-only slices: the alias bats fixture folds into slice 1 (the wiring it
  guards); slices 2–4 are guarded by the **existing** suites (behavior-preserving), so their
  "RED" is "the suite that must stay green".

## Slice 1 — wire `resolveAlias` into `validateManifest`; rename the `models` agent key

### Context
<!-- Pre-chewed, exhaustive — the agent must NOT need to re-explore. -->
Touch `engine/src/manifest.js` only (plus its tests + fixtures). Current state:
- Line ~14: `PHASE_NAMES` is the OLD set `branch design adr plan implement review refactor
  mutation docs pr merge`. Make it the CANONICAL concern set:
  `workspace requirements design decisions planning implementation review refactoring validation
  architecture documentation propose integrate` (13 ids — copy from `pipeline/default.yml`).
- Add `import { resolveAlias } from './alias-map.js';` at the top (sibling module, already
  exists; exports `ALIAS_MAP` + `resolveAlias`, phase-only, never throws).
- In `validatePhases` (line ~191) the membership test is `if (!PHASE_NAMES.has(phaseName))`.
  Change to `if (!PHASE_NAMES.has(resolveAlias(phaseName)))`. Keep the error string reporting the
  ORIGINAL `phaseName` (`unknown phase: ${phaseName}`) — resolve only for the membership check.
- Line ~35 `MODELS_KEYS`: replace `'mutation-triager'` with `'validation-triager'`.
- In `validateModels` (line ~87): when a key is unknown AND equals `'mutation-triager'`, push a
  targeted guidance error containing the substring `validation-triager` (ADR-013), e.g.
  `models key 'mutation-triager' was renamed — use 'validation-triager'`; otherwise the existing
  `unknown models key: ${key} (expected an agent name or 'fallback')`.
Back-compat proof (must stay green): `manifest.test.js` already asserts `phases.{plan,design,
implement,docs,merge,review}` and `models.{slice-implementer,reviewer,fallback}` validate — all
old names resolve through `resolveAlias` into the canonical set, so they stay valid. No existing
test references `models.mutation-triager`, so the `MODELS_KEYS` swap breaks nothing.
New fixtures (under `test/fixtures/manifest/`): `valid-new-phase-names.workflow.md` (frontmatter
naming `workspace`/`validation`/`documentation` phases + `models.validation-triager` +
`pipeline.skip`) and `invalid-renamed-agent-model.workflow.md` (`models: { mutation-triager:
sonnet }`). `run_lint` helper is `test/helpers/manifest-lint`.

### TDD steps
<!-- RED → GREEN → REFACTOR. -->
- RED (node, `engine/test/manifest.test.js`): add tests — new concern names validate
  (`phases: { workspace:{}, validation:{}, documentation:{} }` → ok); OLD names still validate
  via alias (`phases: { branch:{}, mutation:{}, docs:{} }` → ok); `models.validation-triager` →
  ok; `models.mutation-triager` → `ok:false` with an error containing `validation-triager`.
  Fails against the old OLD-set `PHASE_NAMES`/`MODELS_KEYS`.
- RED (bats, `test/manifest-lint.bats`): add the new-names fixture test (exit 0, `valid.`) and the
  renamed-agent fixture test (exit 2, `INVALID manifest`, `validation-triager`). Add the two
  fixtures.
- GREEN: apply the `engine/src/manifest.js` edits above.
- REFACTOR: update the `PHASE_NAMES` doc-comment from "OLD set — alias wiring is P4" to the
  canonical/aliased intent.

### Gate
`(cd engine && node --test) && bats test/` — then full `scripts/ci.sh`.

### Commit
`feat(manifest): canonicalize PHASE_NAMES via resolveAlias; rename models key validation-triager (ADR-013)`

## Slice 2 — rename the 9 skill dirs; delete the run/SKILL.md inverse-alias bridge

### Context
`git mv` these `skills/<old>` → `skills/<new>` (the ALIAS_MAP inverse, exhaustively):
`branch→workspace, adr→decisions, plan→planning, implement→implementation, refactor→refactoring,
mutation→validation, docs→documentation, pr→propose, merge→integrate`. `design`, `review`, `run`
stay. For EACH renamed dir's `SKILL.md`: update the `name:` frontmatter (line 2) AND the
`# craft:<old>` H1 heading (line ~6) to the new concern name. Do NOT touch any `craft:<agent>`
spawn ref in a body yet (the `mutation-triager` agent is still named that until slice 3 — so
`skills/validation/SKILL.md` line ~29 `craft:mutation-triager` stays as-is here).
`skills/run/SKILL.md`: DELETE the `ALIAS_MAP inverse table` block (the markdown table, lines
~109–126) AND the paragraph after it (lines ~128–132, "`requirements` and `architecture` are
disabled…"). Collapse Phase-walk step 1 (lines ~65–68) to: invoke `craft:<phase.id>` directly —
skill dir == `phase.id` after P4; `requirements`/`architecture` have no skill dir until P10, so
an enabled-but-dirless phase id is the loud STOP. Update the walk-error-path row that says
"no matching inverse-alias" to "no same-named `skills/` dir". Sweep skill BODY prose naming an
old phase (e.g. a cross-reference to "the adr phase"); `grep -rn` each old name under `skills/`.

### TDD steps
- RED: none authored — the guardrail is the EXISTING `scripts/ci.sh` (bats + node) which must stay
  green through a behavior-preserving rename (engine data untouched). Treat a red `ci.sh` as the
  failing signal.
- GREEN: perform the `git mv`s + frontmatter/heading edits + run/SKILL.md table deletion + prose
  sweep.
- REFACTOR: re-read `skills/run/SKILL.md` Phase-walk for any dangling reference to the deleted
  table.

### Gate
`scripts/ci.sh` green; `git status` shows 9 renamed dirs (R, not D+A) + run/SKILL.md modified;
`grep -rn 'craft:\(branch\|adr\|plan\|implement\|refactor\|mutation\|docs\|pr\|merge\)\b' skills/`
returns only the still-valid `craft:mutation-triager` (agent ref, slice 3) and `craft:docs-writer`
/`craft:refactor-executor` (unchanged agents).

### Commit
`refactor(skills): rename phase skill dirs to concern names; drop P3 inverse-alias bridge (ADR-009)`

## Slice 3 — rename the `mutation-triager` agent; sweep stray old-name refs

### Context
`git mv agents/mutation-triager.md agents/validation-triager.md`; update its `name:` frontmatter
(line 2) `mutation-triager` → `validation-triager`. Update the ONE spawn ref now resolvable:
`skills/validation/SKILL.md` (renamed in slice 2) `craft:mutation-triager` → `craft:validation-triager`.
Sweep user-facing prose: `.claude-plugin/plugin.json` `description` (the "branch → design → ADR →
plan → implement-by-slices → review → refactor → mutation → docs → PR → merge" sequence → concern
names) and `README.md` (the same intro sequence; `/craft:mutation` → `/craft:validation` on
line ~25; the `agents/` list `mutation-triager` → `validation-triager` on line ~41). Do NOT touch
`docs/DESIGN.md`, `docs/DESIGN-*.md`, `docs/PLAN-*.md`, `docs/PRD-*.md`, `docs/SPIKE.md` — those
are SoT/history records that deliberately discuss the old→new mapping. `.claude-plugin/marketplace.json`
description carries no old names — leave it.

### TDD steps
- RED: none authored — `scripts/ci.sh` is the guardrail (the agent rename does not touch engine
  code; `manifest.test.js` slice-1 tests already pin the `validation-triager` models key).
- GREEN: the `git mv` + frontmatter edit + the three sweep edits (skill ref, plugin.json, README).
- REFACTOR: `grep -rn 'mutation-triager' .` (excluding `docs/` history + `node_modules`) returns
  nothing; `ls agents/` shows `validation-triager.md`, no `mutation-triager.md`.

### Gate
`scripts/ci.sh` green; `grep -rn 'mutation-triager' agents/ skills/ README.md .claude-plugin/`
returns nothing.

### Commit
`refactor(agents): rename mutation-triager → validation-triager; sweep old-name refs in plugin.json/README`

## Slice 4 — ship the backlog doc template (ADR-014)

### Context
Add `templates/backlog.md` capturing the `BACKLOG.md` section contract (the headings used by the
live file: a status-at-a-glance table · `## Done` · `## Next` · `## Then` · `## Deferred / parked`
· `## Notes`), mirroring the placeholder/comment style of `templates/{design,plan,adr}.md`. Data
/docs only — touches NO engine code, NO `pipeline/default.yml`, NO gate (surface gate unaffected).
The optional `backlog-lint`/`design-lint` scripts stay deferred (ADR-014) — record the follow-up
in `BACKLOG.md` Deferred during the closing docs step, do not build here.

### TDD steps
- RED: none — a template is static docs; `scripts/ci.sh` must stay green (shellcheck/bats/node
  untouched).
- GREEN: write `templates/backlog.md`.
- REFACTOR: confirm the template headings match the live `BACKLOG.md` section names exactly.

### Gate
`scripts/ci.sh` green (templates are outside every lint glob).

### Commit
`docs(templates): add backlog template (ADR-014)`
