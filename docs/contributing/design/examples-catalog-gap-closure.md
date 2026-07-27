# Design — examples-catalog-gap-closure

> Brief: close the examples-catalog gaps found in the 2026-07-27 examples spike — index drift, stale shipped-status tags, and six shipped surfaces that have no runnable sample.
> Status: draft → self-reviewed ×3 → accepted

## Context

The `examples/` directory holds one runnable `workflow.md` manifest per injection point (18 dirs
today). Each sample follows a fixed doc pattern — YAML frontmatter manifest + a comment header
naming the point + a default-vs-manifest table + an "in your real repo" footer (see
`examples/dod-artifact/workflow.md`, `examples/role-swap/workflow.md`, `examples/named-config/workflow.md`).
`test/examples-lint.test.js` auto-discovers every `examples/<dir>/workflow.md`
(`readdirSync` + a `workflow.md`-exists filter, so `examples/.claude/` — which has no manifest — is
excluded) and asserts each passes `scripts/manifest-lint.sh`. It checks manifest validity only; it
does not check that a dir is indexed anywhere.

Three surfaces carry the catalog: `examples/README.md` ("By injection point" table), and
`docs/guides/customizing.md` §3 (the injection catalog, with a per-row **Sample** column) and §4 (the
numbered examples index). The spike (2026-07-27, brief-verified — not re-audited here) found these
three drifted from each other and from what actually ships.

Constraints this design works within:

- **`manifest-lint` is the internal spec** every new `workflow.md` must satisfy; `examples-lint` runs
  it. Its key/verdict vocabularies are frozen in `engine/src/manifest-vocabulary.js` and
  `engine/src/policy.js`; validators live in `engine/src/manifest.js`.
- **The doc pattern is the house style** for examples — keep it verbatim for anything new.
- **The README→drift-guard philosophy** (`scripts/readme-drift.sh` → `engine/src/readme-drift-main.js`):
  a mechanical set-diff of a documented surface against a discovered truth set, failing red on drift.
  The new coverage check mirrors this at the example-dir granularity.
- **Design docs live under `docs/contributing/design/`**, which `ci.sh`'s `run_prose_lint` excuse-glob
  covers, and must satisfy `scripts/design-lint.sh`'s six fixed headings.

## Requirements

When this ships:

- **R1 — README completeness + numbering parity.** `examples/README.md`'s "By injection point" table
  lists every `examples/<dir>/` that contains a `workflow.md` (including `dod-artifact/`), and its
  numbering for the PRD §7 injection points is identical to `docs/guides/customizing.md` §4.
- **R2 — drift can't recur.** `test/examples-lint.test.js` fails red when any auto-discovered example
  dir is absent from `examples/README.md`.
- **R3 — no stale shipped-status tags.** `examples/everything-claude-toolkit/workflow.md` carries no
  `(PRD, …)` tag: the `role:` line reads `(current, §7 #10)`, the `pipeline.insert` line reads
  `(current, §7 #11)`, and the header comment no longer advertises a not-yet-shipped tag class.
- **R4 — a sample per shipped surface.** Six new `examples/<dir>/workflow.md` exist — one each for
  `policy`, `intention`, `memory`, `phases.<id>.required`, `hygiene.gate`, `pipeline.reorder` — each
  passing `manifest-lint` (so `examples-lint` stays green) and following the established doc pattern.
- **R5 — each new sample is indexed in all three surfaces.** Every new example is referenced from its
  §3 Sample cell (or the `hygiene.gate` prose subsection), from the §4 index, and from the README
  "By injection point" table.
- **R6 — no shipped surface still shows `—`.** After the change, none of the five §3 catalog rows named
  in R4 that carry a `—` Sample retains it, and the `hygiene.gate` subsection names its sample.

## Design

### Finding 1 — index drift (fix + guard)

**Reconcile.** `examples/README.md` omits `dod-artifact/` and numbers `derived-plugin` as `#12`;
`customizing.md` §4 numbers DoD as `#12` and `derived-plugin` as `#13`. Adopt the §4 numbering as
canon (DC1) and bring README into line:

- Insert a row into the README "By injection point" table:
  `| 12 | **DoD artifact** | [`dod-artifact/`](dod-artifact/) | 1 |` (Tier 1, per §3/§4).
- Renumber the existing README `derived-plugin` row from `12` to `13`.

After this, the two tables agree on `#1…#13` for the PRD §7 points. The un-numbered README rows
(`— enable a default-off phase`, `— named tracker adapter`, `— named config`) are unaffected.

**Guard.** Extend `test/examples-lint.test.js` with a third test that mirrors `readme-drift.sh`'s
set-diff-against-truth philosophy at example-dir granularity (design in Test strategy). Scope: README
only (DC3).

Verified empirically: of the 18 discovered dirs, `dod-artifact/` is the **only** one absent from
README in the linked `](<dir>/)` form — so the new test goes red on exactly the drift finding #1
names, and green once the README row lands.

### Finding 2 — stale tags (fix)

Both surfaces the tags call "not-yet-shipped" have shipped (brief-verified: `role-swap/` states
"All-current" for #10; the §3 dagger-note confirms inserted-phase dispatch + contract execution ship).
Exact edits to `examples/everything-claude-toolkit/workflow.md`:

| Line | Before | After |
|---|---|---|
| `plan: { role: … }` comment | `(PRD,    §7 #10)` | `(current, §7 #10)` |
| `pipeline:` comment | `(PRD,    §7 #11)` | `(current, §7 #11)` |
| header comment | `# Surfaces tagged (current) work today; (PRD) land in the customizable-engine program.` | `# All five surfaces work on craft today — every one is tagged (current).` |

The header edit is mechanical: after the two refreshes there are no `(PRD)` tags left in the file, so
the sentence's second clause becomes vacuous. (The body-table clause "…injects the craft contract
around it (PRD §6.3)" is a section-provenance reference, not a shipped-status tag — left untouched.)

### Finding 3 — six new samples for shipped surfaces

Each new example follows the doc pattern and demonstrates the manifest keys below. The manifest
shapes were **pinned empirically** through the real `scripts/manifest-lint.sh` (the linter
`examples-lint` runs) — every candidate returned `craft-manifest: … valid.`:

| Example dir (DC4) | §3 anchor | Manifest keys demonstrated | `manifest-lint` | Recipe it tells |
|---|---|---|---|---|
| `policy-headless-merge/` | Ports → policy (Sample cell) | `policy: { always: [integrate, propose] }` | valid. | Headless unattended auto-merge: an explicit `always` verdict supersedes craft's merge/PR confirmation. Prose names the per-invocation channel `--policy integrate=always` as the primary headless form; spec `docs/contributing/specs/policy.md`. |
| `intention-corpus/` | Ports → intention (Sample cell) | `intention: { source: file, gate: advisory, covers: ["engine/src/**"] }` | valid. | The `file` intention corpus: `consult` prepends matching living pages into the design/planning contract; `assert-fresh` flags a changed scope whose covering page went untouched (`INTENTION-DRIFT`), waivable (`INTENTION-WAIVE`); start `advisory`, promote to `blocking` once populated; spec `.../intention.md`. |
| `memory-cache/` | Ports → memory (Sample cell) | `memory: { source: file }` | valid. | Per-repo advisory cache at the default `.claude/craft-memory.md`: stores mechanically-derived learnings so later runs skip re-probing; deleting it changes cost, never correctness; spec `.../memory.md`. |
| `phase-required/` | Spine → required (Sample cell) | `phases: { review: { required: true } }` | valid. | Pins a phase so craft's necessity evaluation never auto-skips it — the counterpart to the auto-skip story (`auto-skip: <phase> — evaluated unnecessary`). Prose notes it does not override an explicit `pipeline.skip`/`enabled: false`, and that setting both is a manifest-lint error. |
| `hygiene-gate/` | HOW → `hygiene.gate` subsection (prose ref) | `hygiene: { gate: blocking }` | valid. | The shared posture knob for `ci.sh`'s two touched-diff lints (stub-marker + anti-slop prose): `advisory` prints, `blocking` promotes both together. |
| `pipeline-reorder/` | Spine → reorder (Sample cell) | `pipeline: { reorder: [validation, review] }` | valid. | Motivating scenario: run the cheaper per-hunk `validation` harness before the 4-lens opus `review`, so a validation failure short-circuits before spending review tokens. Dependency-safe — both consume only `change` and produce their own report, so the swap strands no consumer (verified against `pipeline/default.yml`). |

**Where each lands (R5/R6).** Five of the six surfaces are §3 **table rows** whose Sample cell is
currently `—` (memory, intention, policy under Ports; required, reorder under Spine) — replace each
`—` with a link to the new dir. `hygiene.gate` is a §3 **prose subsection** (`#### hygiene.gate …`),
which has no Sample column — add a `Sample: [`hygiene-gate/`](../../examples/hygiene-gate/)` line to
that subsection instead. All six also get a row in the §4 index and a row in the README "By injection
point" table.

**Indexing form for the new rows (DC2).** These six are cross-cutting **ports** and **spine/floor
knobs**, not PRD §7 injection points, so they take un-numbered `—` rows in both the §4 index and the
README table — matching how the existing port/tracker/default-off/named-config rows already appear.
The `#1…#13` PRD numbering stays stable.

**Adjacent inconsistency (DC5).** `customizing.md` §2 labels `phases.<id>.required` as "(Tier 0, #10)"
— but `#10` is unambiguously the `role:` swap. The `phase-required/` sample landing makes the mislabel
more visible; recommend dropping the bogus `#10` (leaving "(Tier 0)").

### Data / surfaces touched (no code logic changes beyond one test)

- `examples/README.md` — table edits (R1) + six new rows (R5).
- `examples/everything-claude-toolkit/workflow.md` — three comment edits (R3).
- `docs/guides/customizing.md` — §3 five Sample cells + one prose Sample line; §4 six index rows;
  §2 one cross-ref fix (DC5).
- `examples/{policy-headless-merge,intention-corpus,memory-cache,phase-required,hygiene-gate,pipeline-reorder}/workflow.md`
  — six new files (R4).
- `test/examples-lint.test.js` — one new test (R2).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC1 | Canonical numbering source-of-truth for the two indexes | (a) adopt guide §4 (DoD=#12, derived-plugin=#13), align README; (b) adopt README (derived-plugin=#12, no DoD number), align guide; (c) renumber both from scratch | (a) | §4 is the PRD-anchored, more complete index (already has DoD); least churn — README just gains a dod-artifact row + a derived→#13 bump. |
| DC2 | How the six new samples are indexed | (a) un-numbered `—` rows in §4/README; (b) new sequential numbers #14–#19; (c) number the two spine knobs, leave the three ports + hygiene un-numbered | (a) | Ports and spine/floor knobs are not PRD §7 injection points; the existing convention already lists such rows as `—`. Keeps #1–#13 stable. |
| DC3 | Does the README→dir cross-check also cover guide §4 (and/or §3)? | (a) README only; (b) README + §4; (c) README + §3 catalog | (a) | README is the colocated index that claims per-dir completeness; §3/§4 are curated narrative indexes that intentionally omit rows (e.g. `loop/` isn't in §4's numbered list). Mechanical completeness belongs on README, mirroring the single-surface `readme-drift.sh` philosophy. |
| DC4 | Names of the six new example dirs | (a) point-descriptive kebab: `policy-headless-merge`, `intention-corpus`, `memory-cache`, `phase-required`, `hygiene-gate`, `pipeline-reorder`; (b) story-descriptive: `auto-merge`, `living-intention`, `run-memory`, `pin-phase`, `strict-hygiene`, `validation-first`; (c) bare-key: `policy`, `intention`, `memory`, `required`, `hygiene`, `reorder` | (a) | Matches the dominant point-descriptive convention (`skip-phase`, `gate-command`, `override-procedure`, `dod-artifact`) and keeps the dir greppable to its manifest key. |
| DC5 | Scope of the numbering reconciliation — also fix the §2 prose that labels `required` as "#10"? | (a) fix it — drop the bogus `#10`, leave "(Tier 0)"; (b) leave §2 untouched (two-table scope only) | (a) | It is a factual error regardless of canon (#10 = role swap); a one-token fix, made more visible by the new `phase-required/` sample. |

## Test strategy

- **Auto-discovery covers the six new samples for free.** `examples-lint`'s existing loop
  (`findExampleManifests` → `manifest-lint` per dir) lints each new `workflow.md` the moment it exists
  — no test edit for the lint loop. Pinned matrix (above): all six candidate manifests already return
  `craft-manifest: … valid.` through the real linter, and its output contains the `valid.` token the
  test asserts on.
- **New README-coverage test (R2).** One `node:test` case, Given/When/Then title, AAA body, `sut`
  variable. Arrange: read `examples/README.md` once and derive the discovered dir set from
  `findExampleManifests()` (so `examples/.claude/` is excluded by construction). Act: for each dir,
  check the README for the linked token `](<dir>/)`. Assert: the set of dirs missing that token is
  empty, failing with a message naming every missing dir. Keying on `](<dir>/)` (not a bare name)
  avoids substring false-positives and enforces the linked-index convention every existing row uses.
  **Red-first proof:** run today it fails naming `dod-artifact`; after the finding-1 README row it
  passes — the guard demonstrably catches the exact drift class.
- **Prose lint over new examples.** The new `workflow.md` files are touched `*.md` **not** in
  `ci.sh`'s `run_prose_lint` excuse-glob, so the anti-slop lint runs over them at the resolved
  `hygiene.gate` (default `advisory` → prints, stays green). Existing examples already pass this lint,
  so pattern-following prose stays clean. `examples/` is **not** a new file class needing an excuse
  glob, so the case-arm pinned byte-wise by `test/hygiene-gates-ci.test.js` needs no change. The
  `hygiene-gate/` sample sets `hygiene: { gate: blocking }` in its **own** manifest only; `ci.sh`
  resolves the repo-root `.claude/workflow.md`, which the sample does not touch — so the repo's own
  CI posture is unchanged.
- **This design doc.** Lands under `docs/contributing/design/` (prose-lint-excused) and satisfies
  `design-lint.sh`'s six required headings.

## Out of scope

- **Per-directory `README.md` symlinks** for GitHub rendering — cosmetic, deferred (brief).
- **`scripts:` (lifecycle) and `retrieval:` samples** — marginal value; not among the shipped-but-unsampled
  surfaces the spike flagged (brief).
- **Duplicating the guide's inline `--harness` / `--policy` flag examples** — already documented in §3
  (brief).
- **`source: custom` samples for any port** — `custom` for policy/intention/memory is an un-built future
  seam the validator rejects; there is no lint-clean manifest to sample.
- **Renumbering the PRD itself** — the docs are reconciled to each other (DC1), not the PRD's §7
  numbering changed.
