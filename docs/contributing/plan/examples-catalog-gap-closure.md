# Plan — examples-catalog-gap-closure

> Source: design doc `docs/contributing/design/examples-catalog-gap-closure.md` · ADRs `290, 291, 292, 293, 294`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Orientation (read once — applies to all four parts)

This change is **docs + one test only**. There is **no `src/`/`engine/` delta and no new
exported symbol** anywhere in this plan — nothing to add to a barrel, facade, exhaustiveness
switch, API report, or registry. The single test edit adds one `node:test` case to an existing
file (no new module, no export). So there is **no public-surface gate to pre-pay**.

Files this plan touches, and nothing else:

- `examples/README.md` — "By injection point" table (Part 1 reconcile; Parts 3–4 six new rows).
- `docs/guides/customizing.md` — §2 one-token fix (Part 1); §3 Sample cells + §4 index rows (Parts 3–4).
- `examples/everything-claude-toolkit/workflow.md` — three comment edits (Part 2).
- `test/examples-lint.test.js` — one new test case (Part 1).
- `examples/{policy-headless-merge,intention-corpus,memory-cache,phase-required,hygiene-gate,pipeline-reorder}/workflow.md`
  — six new files (Parts 3–4).

**DO NOT touch** `scripts/ci.sh` or `test/hygiene-gates-ci.test.js`. The design concluded no
excuse-glob change is needed — `examples/*.md` intentionally get anti-slop prose-linted (advisory);
that case-arm is pinned byte-wise by `test/hygiene-gates-ci.test.js` and must stay untouched.

**Per-part gate** (every part): `node --test 'test/**/*.test.js'`. This runs two examples-lint
checks — the manifest-validity loop over every auto-discovered `examples/<dir>/workflow.md`, and
(after Part 1) the README-coverage guard requiring each discovered dir to appear in
`examples/README.md` as a `](<dir>/)` token. **Consequence that binds Parts 3–4:** a part that
creates a new `examples/<dir>/` **must land that dir's README row in the same commit**, or its own
gate goes red. Never commit on a red gate.

**Phase-boundary gate** (orchestrator-run, not per part): `bash scripts/ci.sh`. It additionally runs
the anti-slop prose lint over touched `*.md` at the resolved repo-root `hygiene.gate` (default
`advisory` → prints, stays green). New example prose must follow the house pattern to stay clean.

The doc pattern (house style — reproduce verbatim for every new example; see
`examples/dod-artifact/workflow.md`, `examples/skip-phase/workflow.md`, `examples/backlog-custom/workflow.md`):
YAML frontmatter (leading `#` comment naming the injection point + the manifest) → `# Example — <name> (\`<key>\`)`
H1 → one intro paragraph → a default-vs-manifest table → one or two guarantee/recipe subsections →
a closing `> In your real repo this file lives at the project root as \`.claude/workflow.md\`.` footer.

All six new manifest shapes were pinned through the real `scripts/manifest-lint.sh` during planning —
each returned `craft-manifest: … valid.` (exit 0). Reproduce the frontmatter bytes exactly.

## Part 1 — README index reconciliation + coverage guard

### Context
<!-- Finding 1 (ADR 290, 292) + §2 fix (ADR 294). TDD part: the guard is added and observed RED
     against the un-fixed README, then the README reconciliation turns it GREEN — one commit, lands green. -->

**Why this ordering.** The clean, always-green route (planner's choice): add the coverage test AND
the README reconciliation in one part. Run `node --test` after writing the test to **observe the RED**
(it names `dod-artifact`), then land the README `dod-artifact` row to turn it GREEN. The commit lands
green — no red is ever committed.

**Empirical facts pinned during planning** (do not re-audit): 18 dirs carry a `workflow.md`;
`dod-artifact/` is the **only** one absent from `examples/README.md` in the linked `](<dir>/)` form.
So the guard goes red naming exactly `dod-artifact` and green the moment its README row lands.
`docs/guides/customizing.md` §4 already numbers DoD `#12` and `derived-plugin` `#13` (canon per ADR 290) —
**§4 needs no edit in this part**; only README is brought into line.

**Edit 1 — `test/examples-lint.test.js` (append one test case).** The file already defines, at module
scope: `ROOT`, `EXAMPLES = path.join(ROOT, 'examples')`, `findExampleManifests()` (returns full
`examples/<dir>/workflow.md` paths, `examples/.claude/` excluded by the `workflow.md`-exists filter),
and imports `fs`, `path`, `assert`, `test`. Append after the existing two tests (current last line 53):

```js
test(
  'Given every auto-discovered example dir, when README is scanned, then each appears as a linked ](<dir>/) token',
  () => {
    const sut = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    const dirs = findExampleManifests().map((p) => path.basename(path.dirname(p)));
    const missing = dirs.filter((dir) => !sut.includes(`](${dir}/)`));
    assert.deepStrictEqual(missing, [], `examples/README.md missing linked rows for: ${missing.join(', ')}`);
  },
);
```

(Given/When/Then title, AAA body, `sut` = the README surface under test. Keying on `](<dir>/)` — not a
bare name — avoids substring false-positives and enforces the linked-index convention every row uses.
Mirrors `scripts/readme-drift.sh`'s set-diff-against-truth philosophy at example-dir granularity;
README-only per ADR 292.)

**Edit 2 — `examples/README.md` "By injection point" table.** Current rows 24–26:

```
| 11 | **insert** a phase | [`everything-claude-toolkit/`](everything-claude-toolkit/) | 1 |
| — | enable a default-off phase (`enabled: true`) | [`requirements/`](requirements/) · [`architecture/`](architecture/) | 0 |
| 12 | **derived-plugin extension surface** | [`derived-plugin/`](derived-plugin/) | 2 |
```

Two edits (design Finding 1), cleanest as a **single Edit** on the derived-plugin line:
- old_string: `| 12 | **derived-plugin extension surface** | [`derived-plugin/`](derived-plugin/) | 2 |`
- new_string (DoD `#12` row inserted before, derived-plugin bumped to `#13`):
  `| 12 | **DoD artifact** | [`dod-artifact/`](dod-artifact/) | 1 |` + newline +
  `| 13 | **derived-plugin extension surface** | [`derived-plugin/`](derived-plugin/) | 2 |`

After this both tables agree on `#1…#13`. Leave the README intro prose (line 6, "every Tier-0/1
injection point (PRD §7)…") unchanged — un-numbered `—` rows already coexist with it. Leave the three
existing `—` rows (requirements/architecture, named tracker, named config) untouched.

**Edit 3 — `docs/guides/customizing.md` §2 one-token fix (ADR 294).** Line 116 reads
`true\` (Tier 0, #10) to force a specific phase…`. Under canon (ADR 290) `#10` is the `role:` swap, not
`required` — a factual error. old_string `(Tier 0, #10)` → new_string `(Tier 0)`. One occurrence; the
surrounding auto-skip paragraph is otherwise untouched.

### TDD steps
- **RED** — Apply Edit 1 (the coverage test). Run `node --test 'test/**/*.test.js'`. Expected failure:
  the new case fails with `missing linked rows for: dod-artifact` (README has no `](dod-artifact/)`
  token yet). This is the red-first proof the guard catches the exact drift class.
- **GREEN** — Apply Edit 2 (insert DoD `#12` row, bump derived-plugin to `#13`). Re-run
  `node --test 'test/**/*.test.js'`. The coverage case passes (all 18 discovered dirs now present);
  the two existing examples-lint cases stay green.
- **REFACTOR** — Apply Edit 3 (§2 `#10` drop — no test impact; pure prose correctness). Re-run the gate
  to confirm still green. No further cleanup; the test is already AAA + `sut`.

### Gate
`node --test 'test/**/*.test.js'`

### Commit
`docs(examples): reconcile README index with guide §4 canon + guard dir coverage`

## Part 2 — Stale shipped-status tag refresh

### Context
<!-- Finding 2 (R3). Docs-prose part, no driving test — verification is examples-lint staying green
     (comment-only edits inside a valid manifest) + the exact byte swaps below. -->

Both surfaces the file tags "not-yet-shipped" (`(PRD)`) have shipped. Make exactly three edits in
`examples/everything-claude-toolkit/workflow.md`. All three sit in YAML `#` comments (frontmatter
header + two inline tails) — none change any manifest key, so `manifest-lint` stays valid and the
examples-lint loop stays green.

- **Header comment** (frontmatter, currently line 4) — full-line replace (the old-string is unique):
  old: `# Surfaces tagged (current) work today; (PRD) land in the customizable-engine program.`
  new: `# All five surfaces work on craft today — every one is tagged (current).`
- **`plan:` inline tag** (line 10) — anchor on the tag token alone (unique in the file), so alignment
  whitespace can't cause a mismatch:
  old: `(PRD,    §7 #10)` → new: `(current, §7 #10)`
- **`pipeline:` inline tag** (line 12):
  old: `(PRD,    §7 #11)` → new: `(current, §7 #11)`

The two tag tokens contain alignment spaces after `PRD,`; grep-confirm the exact byte string before
editing — each is unique (only line 10 carries `#10`, only line 12 carries `#11`). Collapsing to
`(current, §7 #1X)` (single space) matches the design and only shifts a trailing comment cosmetically.

After these edits there are no `(PRD)` shipped-status tags left in the file, which is what makes the
header rewrite accurate. **Do not touch** the body-table clause "…injects the craft contract *around*
it (PRD §6.3)" (line 29) — that `(PRD §6.3)` is a section-provenance reference, not a shipped-status
tag. No provenance refs (phase/ADR numbers) enter the source.

### TDD steps
<!-- Docs-prose part — verification loop, not code TDD. -->
- **VERIFY (baseline)** — `node --test 'test/**/*.test.js'` is green before edits (everything-claude-toolkit
  already lints valid).
- **EDIT** — Apply the three comment swaps above.
- **VERIFY (green)** — Re-run `node --test 'test/**/*.test.js'`: the examples-lint loop re-lints the
  edited manifest and still reports `valid.` (comments are YAML-inert). Confirm by eye that no `(PRD)`
  shipped-status tag remains (grep `(PRD,` returns nothing; `(PRD §6.3)` on line 29 is intentionally kept).

### Gate
`node --test 'test/**/*.test.js'`

### Commit
`docs(examples): refresh stale (PRD) shipped-status tags in everything-claude-toolkit`

## Part 3 — Ports samples: policy · intention · memory

### Context
<!-- Finding 3 (R4/R5/R6), the three §3 "Ports (cross-cutting)" rows whose Sample cell is `—`.
     Docs-prose part. Each of the three examples = one new workflow.md + one §3 Sample cell +
     one §4 index row + one README row. The Part-1 coverage guard REQUIRES the three README rows
     in THIS commit, and the examples-lint loop REQUIRES the three manifests to lint valid. -->

Create three new example dirs, each following the doc pattern (see Orientation). Frontmatter manifests
are pinned verbatim (all returned `valid.` through `scripts/manifest-lint.sh`). None reference a
`context:`/`override:` file, so they lint standalone with no `.claude/workflow/` companion.

**3a — `examples/policy-headless-merge/workflow.md`** (§3 anchor: Ports → policy; spec
`docs/contributing/specs/policy.md`). Frontmatter:

```yaml
---
# Injection point (Ports): policy — a per-repo/per-user permission layer over outward VCS-port
# actions. An explicit `always` verdict supersedes craft's built-in merge/PR confirmation.
policy: { always: [integrate, propose] }
---
```

H1: `# Example — headless auto-merge (\`policy\`)`. Prose must convey: `always: [integrate, propose]`
authorizes unattended merge (`integrate` = merge) and PR creation (`propose` = pr-create), superseding
craft's hardcoded confirmation; the **primary headless form is the per-invocation channel**
`--policy integrate=always` (an outer harness pre-approves one run without editing the manifest); the
three engine floors (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`) are
not nameable actions and cannot be reached by any verdict. Default-vs-manifest table: unconfigured
repo → `integrate`/`propose` default to `ask` (merge stops for confirmation); with this manifest →
both proceed unattended.

**3b — `examples/intention-corpus/workflow.md`** (§3 anchor: Ports → intention; spec
`docs/contributing/specs/intention.md`). Frontmatter:

```yaml
---
# Injection point (Ports): intention — a per-repo architectural-intention corpus. `consult` prepends
# matching living pages into the design/planning contract; `assert-fresh` flags drift; start advisory.
intention: { source: file, gate: advisory, covers: ["engine/src/**"] }
---
```

H1: `# Example — living-intention corpus (\`intention\`)`. Prose must convey: the `file` intention
corpus — `consult` prepends the phase's matching living pages into the design/planning contract slot
(advisory); `assert-fresh` flags a changed scope whose covering page went untouched (`INTENTION-DRIFT`),
waivable per page (`INTENTION-WAIVE`); `covers` names load-bearing scopes a page must exist for; start
`gate: advisory` and promote to `blocking` only once the corpus is populated (a blocking gate on a thin
corpus stalls on false positives).

**3c — `examples/memory-cache/workflow.md`** (§3 anchor: Ports → memory; spec
`docs/contributing/specs/memory.md`). Frontmatter:

```yaml
---
# Injection point (Ports): memory — a per-repo advisory cache of mechanically-derived learnings so
# later runs skip re-probing. Advisory-only: deleting it changes run cost, never correctness.
memory: { source: file }
---
```

H1: `# Example — run-memory cache (\`memory\`)`. Prose must convey: the per-repo advisory cache at the
default `.claude/craft-memory.md` stores mechanically-derived learnings (toolchain, gate commands,
findings, part sizing) so subsequent runs skip re-probing; **advisory-only** — deleting the store
changes run cost, never correctness; a custom `ref` escaping the repo root is silently skipped.

**Index landings for all three (R5).** After creating the files, add three landings **per example**:

1. **§3 Sample cell** — replace the trailing `| — |` on each Ports row in `docs/guides/customizing.md`.
   Anchor each on its unique cost-column tail (Edit, not replace_all):
   - memory (line 204): old `outside the repo | — |` → new `outside the repo | [\`memory-cache/\`](../../examples/memory-cache/) |`
   - intention (line 205): old `corpus is populated | — |` → new `corpus is populated | [\`intention-corpus/\`](../../examples/intention-corpus/) |`
   - policy (line 206): old `never silently | — |` → new `never silently | [\`policy-headless-merge/\`](../../examples/policy-headless-merge/) |`
2. **§4 index rows** — append three un-numbered rows (ADR 291) to the `## 4. Examples index` table,
   after the existing un-numbered rows (current last: the `methodology declination` row, line 378).
   Columns are `Point | Sample | Notes`; links are `../../examples/<dir>/`:
   - `| policy — headless auto-merge | [\`policy-headless-merge/\`](../../examples/policy-headless-merge/) | \`policy: { always: [integrate, propose] }\` — supersedes merge/PR confirmation |`
   - `| intention corpus | [\`intention-corpus/\`](../../examples/intention-corpus/) | \`intention: { source: file, gate, covers }\` — living pages into the design/plan contract |`
   - `| memory cache | [\`memory-cache/\`](../../examples/memory-cache/) | \`memory: { source: file }\` — advisory per-repo learning cache |`
3. **README rows** — append three un-numbered (`—`) rows (ADR 291) to the `## By injection point`
   table in `examples/README.md`, after the existing `—` rows (current last: named-config, line 28).
   Columns are `# | Injection point | Example | Tier`; links are relative (`<dir>/`), all Tier 0:
   - `| — | **policy** — headless auto-merge (\`policy:\`) | [\`policy-headless-merge/\`](policy-headless-merge/) | 0 |`
   - `| — | **intention** corpus (\`intention:\`) | [\`intention-corpus/\`](intention-corpus/) | 0 |`
   - `| — | **memory** cache (\`memory:\`) | [\`memory-cache/\`](memory-cache/) | 0 |`

Keep the six new samples un-numbered — the `#1…#13` PRD numbering stays stable (ADR 291).

### TDD steps
<!-- Docs-prose part — verification loop. The Part-1 coverage guard is the mechanical enforcer here. -->
- **VERIFY (baseline)** — `node --test 'test/**/*.test.js'` green before edits.
- **CREATE + INDEX** — Write the three `workflow.md` files, then add the nine index landings above.
- **VERIFY (green)** — Re-run `node --test 'test/**/*.test.js'`. Two mechanical checks must pass:
  (a) the examples-lint loop lints the three new manifests → each `valid.`; (b) the Part-1 coverage
  guard finds `](policy-headless-merge/)`, `](intention-corpus/)`, `](memory-cache/)` in README. A
  missing README row for any new dir fails the guard (that is the guard working) — fix the row, do not
  weaken the test.
- **VERIFY (prose)** — Eyeball each new file against the doc pattern (frontmatter comment → H1 →
  intro → default/manifest table → guarantee subsection → real-repo footer) so the phase-boundary
  anti-slop lint (advisory) stays clean.

### Gate
`node --test 'test/**/*.test.js'`

### Commit
`docs(examples): add policy, intention, and memory port samples`

## Part 4 — Spine + hygiene samples: required · reorder · hygiene.gate

### Context
<!-- Finding 3 (R4/R5/R6) remainder: two §3 "Reshape the spine" rows (required, reorder) whose Sample
     cell is `—`, plus the §3 `#### hygiene.gate` prose subsection (no Sample column → add a Sample:
     line). Docs-prose part. Same coverage-guard + examples-lint constraints as Part 3. Final
     cross-consistency checkpoint lands here. -->

Create three new example dirs following the doc pattern. Pinned frontmatter (all `valid.`):

**4a — `examples/phase-required/workflow.md`** (§3 anchor: Reshape the spine → required). Frontmatter:

```yaml
---
# Injection point (spine): phases.<id>.required — pin a phase so craft's necessity evaluation never
# auto-skips it. The counterpart to the auto-skip story; does not override an explicit skip.
phases: { review: { required: true } }
---
```

H1: `# Example — pin a phase against auto-skip (\`phases.<id>.required\`)`. Prose must convey:
`required: true` forces the phase to run even when craft's necessity evaluation would auto-skip it
(the counterpart to `auto-skip: <phase> — evaluated unnecessary`); it does **not** override an explicit
`pipeline.skip` or `enabled: false` (the operator's own waiver still wins); setting both `required: true`
and a `pipeline.skip` for the same phase is a **manifest-lint error**.

**4b — `examples/pipeline-reorder/workflow.md`** (§3 anchor: Reshape the spine → reorder). Frontmatter:

```yaml
---
# Injection point (spine): pipeline.reorder — change phase sequence, dependency-checked. Here: run the
# cheaper validation harness before the costly review lens, so a validation failure short-circuits first.
pipeline: { reorder: [validation, review] }
---
```

H1: `# Example — reorder phases (\`pipeline.reorder\`)`. Prose must convey the motivating scenario: run
the cheaper per-hunk `validation` harness before the 4-lens opus `review`, so a validation failure
short-circuits before spending review tokens; the swap is **dependency-safe** — both consume only
`change` and produce their own report, so it strands no consumer (verified against `pipeline/default.yml`);
a reorder that would strand a consumer-without-fallback is refused/flagged.

**4c — `examples/hygiene-gate/workflow.md`** (§3 anchor: HOW it's checked → `#### hygiene.gate`
prose subsection). Frontmatter:

```yaml
---
# Injection point (HOW): hygiene.gate — the shared posture knob for ci.sh's two touched-diff lints
# (stub-marker + anti-slop prose). `advisory` prints; `blocking` promotes both together.
hygiene: { gate: blocking }
---
```

H1: `# Example — hygiene lint posture (\`hygiene.gate\`)`. Prose must convey: `hygiene.gate` is the
shared posture knob for `ci.sh`'s two touched-diff lints (the stub-marker lint and the anti-slop prose
lint); `advisory` (default) prints findings but stays green; `blocking` promotes **both together** —
there is no separate knob per lint; the value is validated against the same fixed set as `intention.gate`,
fail-closed on anything else. **Note for the implementer (not necessarily prose):** this manifest sets
`blocking` in the **sample's own** `workflow.md` only. `ci.sh` resolves the repo-root
`.claude/workflow.md`, which this sample does not touch — so the repo's own CI posture stays `advisory`.
The sample file is itself a touched `*.md` that the phase-boundary anti-slop lint reads at that resolved
`advisory` posture; keep its prose clean.

**Index landings for all three (R5/R6).**

1. **§3 landings** in `docs/guides/customizing.md`:
   - required (line 180, spine table): old `auto-skip provides | — |` → new `auto-skip provides | [\`phase-required/\`](../../examples/phase-required/) |`
   - reorder (line 183, spine table): old `if it does | — |` → new `if it does | [\`pipeline-reorder/\`](../../examples/pipeline-reorder/) |`
   - hygiene.gate has **no Sample column** (it is a `#### hygiene.gate` prose subsection, lines 167–173
     ending `…the same fixed set as \`intention.gate\`, fail-closed on anything else.`). Add a new line
     immediately after that closing sentence: `Sample: [\`hygiene-gate/\`](../../examples/hygiene-gate/)`
2. **§4 index rows** — append three un-numbered rows (ADR 291) after the Part-3 rows in the §4 table:
   - `| phase required | [\`phase-required/\`](../../examples/phase-required/) | \`phases.<id>.required: true\` — pin a phase against auto-skip |`
   - `| pipeline reorder | [\`pipeline-reorder/\`](../../examples/pipeline-reorder/) | \`pipeline: { reorder: [...] }\` — dependency-checked phase reordering |`
   - `| hygiene gate | [\`hygiene-gate/\`](../../examples/hygiene-gate/) | \`hygiene: { gate: blocking }\` — promote the two touched-diff lints together |`
3. **README rows** — append three un-numbered (`—`) rows after the Part-3 rows in the README table
   (relative links, Tier 0):
   - `| — | **required** — pin a phase (\`phases.<id>.required\`) | [\`phase-required/\`](phase-required/) | 0 |`
   - `| — | **reorder** phases (\`pipeline.reorder\`) | [\`pipeline-reorder/\`](pipeline-reorder/) | 0 |`
   - `| — | **hygiene gate** (\`hygiene.gate\`) | [\`hygiene-gate/\`](hygiene-gate/) | 0 |`

### TDD steps
<!-- Docs-prose part — verification loop + closing cross-consistency checkpoint. -->
- **VERIFY (baseline)** — `node --test 'test/**/*.test.js'` green before edits.
- **CREATE + INDEX** — Write the three `workflow.md` files, then add the nine index landings above.
- **VERIFY (green)** — Re-run `node --test 'test/**/*.test.js'`: (a) examples-lint loop lints the three
  new manifests → each `valid.`; (b) the Part-1 coverage guard finds `](phase-required/)`,
  `](pipeline-reorder/)`, `](hygiene-gate/)` in README.
- **CHECKPOINT (cross-consistency, R1/R5/R6)** — Confirm by inspection: README §7 numbering still reads
  `#1…#13` identical to guide §4; all six new dirs (Parts 3+4) now appear in **all three** surfaces
  (README table, §4 index, §3 Sample cell or hygiene.gate `Sample:` line); no §3 Ports/spine row named
  in R4 still shows `—` in its Sample cell. (README completeness is now CI-enforced; §3/§4 consistency
  is a review concern per ADR 292 — this checkpoint is the plan's own closing pass, no standalone part.)
- **VERIFY (prose)** — Eyeball the three new files against the doc pattern for anti-slop cleanliness.

### Gate
`node --test 'test/**/*.test.js'`

### Commit
`docs(examples): add required, reorder, and hygiene.gate samples`
