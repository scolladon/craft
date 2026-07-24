# Plan — communication revamp: the four-frames orientation layer

> Source: design doc `docs/design/communication-revamp-four-frames.md` · ADRs `268, 269, 270`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

Three parts, matching the design's change set (R8) — `docs/GUIDE-concepts.md` (new) +
`README.md` + `docs/GUIDE-customizing.md` + `scripts/living-corpus.sh` + `test/living-corpus.test.js`,
nothing else:

- **Part 1 — the guide** (docs-only, no `src/` delta): a legitimate standalone docs-prose
  part; there is no implementation part to fold it into.
- **Part 2 — corpus enrollment** (feature code: the enumerator + its pinned test): the one
  load-bearing mechanical regression. Its test folds into it — not a standalone test part.
- **Part 3 — the ripples** (docs-only): README hook + GUIDE-customizing framing, gated by a
  different lint (source-hygiene scans those two files, not the guide).

**Order is load-bearing.** `scripts/living-corpus.sh` enumerates via `find`, which emits a path
only if the file exists. So the guide must exist before the enumerator can emit it GREEN — Part 1
lands the guide, Part 2 enrolls it. No stub/seed is used (a stub risks the hygiene stub-marker
lint and splits one file across two parts). Parts are sequential and share one working tree; each
sees the prior part's commit.

**Cross-cutting reminders for every part:**
- No provenance refs (phase / ADR / backlog numbers) in `scripts/` or `test/`. ADR numbers are
  fine only inside `docs/adr/` and design docs — never in the guide prose, the enumerator, or the
  test. The guide's "owning doc / key" columns cite docs + manifest keys, not ADR numbers.
- No suppression directives, no swallowed errors, no dead code.
- Never commit on a red gate.

## Part 1 — Author `docs/GUIDE-concepts.md` (the four-frames orientation guide)

### Context

New file: **`docs/GUIDE-concepts.md`** (repo root: `docs/`). It is a **slug** doc — no dated
`-P<n>-` / `SC5-*` / `SPIKE` pattern — so it lives at `docs/` and passes
`scripts/docs-structure-lint.sh` unchanged (the lint's `case` at `docs-structure-lint.sh:17`
flags only `SPIKE.md|SC5-*|*-P[0-9]*-*`).

**This is a public, corpus-bound surface.** Its downstream gates are pre-paid across the next two
parts — Part 2 enrolls it in the living-corpus enumerator + pin; Part 3 cross-links it from README
and GUIDE-customizing. Author it **corpus-ready now** so those parts land green:

- **No YAML frontmatter at all — start with the `# ` H1.** Rationale (ADR-269): the guide declares
  **no `subjects:` frontmatter**, so it is an advisory-only corpus member (an orientation layer
  over the *whole* engine — any broad `subjects:` glob would over-flag `INTENTION-DRIFT`). Starting
  with H1 also guarantees no malformed frontmatter, which is what keeps Part 2's `intention-lint-ci`
  at `craft-intention: OK` over the widened corpus.
- **Size ~200–350 lines** (R1) — readable in one sitting; it orients and links, it does not
  re-host any reference catalog or table.
- **Link, never duplicate** (design *Out of scope*): the injection catalog
  (`GUIDE-customizing.md` §3), the hexagon / ports tables (`DESIGN-customizable-engine.md`), and
  the HaaS / Layout bindings table (`../README.md`) are **linked**, never copied. GUIDE-concepts is
  the orientation layer *above* them.
- **craft-native vocabulary stays PRIMARY** (R4): review / validation / architecture / policy /
  manifest / declination / verdict … . External terms (Karpathy / Böckeler / Osmani / config
  layers) appear **only** as framing prose plus the one Rosetta table. **Zero renames** anywhere.
- **Every mapping row names a real, current mechanism** sourced from the docs above — no invented
  behaviour, no added rows. The row sets are already validated in the design; reproduce them, don't
  extend them.

**Link base** (the guide sits in `docs/`): to a root file use `../README.md`; to a sibling `docs/`
file use the bare name `GUIDE-customizing.md` / `DESIGN-customizable-engine.md`; to a port contract
use `adapters/policy.md` / `adapters/memory.md` / `adapters/intention.md` / `adapters/gate.md`; to
skills / agents use `../skills/prune` / `../agents/`. Verify every link resolves — link-integrity is
the guide's correctness bar and there is **no** automated link gate.

**Source-hygiene note:** `docs/GUIDE-concepts.md` is deliberately **not** in
`test/source-hygiene.test.js`'s `SCANNED_PATHS` (`source-hygiene.test.js:11-22`), so the Sources
URLs below — which contain `github.com` / `github.io` — do **not** trip its class-B `\bgithub\b`
gate. Do **not** add the guide to `SCANNED_PATHS`.

**Phase-boundary hygiene (advisory, orchestrator-run — not this part's gate):** at the phase
boundary `scripts/ci.sh` runs `run_prose_lint` over every touched `.md` except
`docs/adr/*|docs/design/*|docs/archive/*` — so the guide **is** prose-scanned against the anti-slop
`BAN_LIST`: **`delve`, `leverage`, `seamless`, `robust`, `it's important to note`, `in conclusion`**
(word-boundary / substring, case-insensitive). Write the guide clear of all six (architecture prose
reaches for `robust` / `leverage` — reword) to keep the boundary run clean. The gate posture here is
`advisory` (findings print, run stays green), but avoiding them spares a validation-triage round.
`run_stub_lint` scans only source files (`.js/.ts/.sh`); `.md` files are waiver-sources only — so
Frame 1's mapping row naming "the `hygiene.gate` stub/prose lints" (design L109) is safe: the word
`stub` in a doc is never marker-scanned.

**Structure** (all row sets are pinned verbatim in `docs/design/communication-revamp-four-frames.md`
§Design — reproduce the rows exactly, expand only the narrative prose):

1. **H1 + a one-line orientation subtitle** ("why craft is shaped this way").
2. **Frame 1 — Karpathy: write the loop, not the prompt.** Narrative thrust (design L99–102):
   craft's value is the *written-down loop*, not any single prompt; loops nest; roles are separated
   to fight slop; state lives on disk so every hop survives a context reset. Then the **5-row**
   mapping table pinned at design **L103–109** (external concept → real craft mechanism → owning
   doc / key).
3. **Frame 2 — Böckeler: the harness taxonomy.** Narrative thrust (design L111–113): define
   *harness*; computational vs inferential sensors; place craft's phases into the three harness
   families; close on HaaS. Then the **7-row** table pinned at design **L115–123**.
4. **Frame 3 — configuration layers.** Narrative thrust (design L125): the precedence story told
   once as four layers, then the floor no layer touches, then the knobs (pointing at the catalog,
   not copying it). Then the **3-row** table pinned at design **L128–132**, followed by the
   per-knob precedence note pinned at design **L134–136** (states the layer story once, links
   `GUIDE-customizing.md` §Precedence for the exact per-knob fold order).
5. **Frame 4 — Osmani: inner loop, outer loop, the Verdict.** Narrative thrust (design L138–140):
   the agent owns the inner loop; the human owns the outer loop (three sub-loops); the Verdict is
   the quality bar installed before the system is let loose — and craft's Policy port literally
   names its settings *verdicts*. Then the **5-row** table pinned at design **L142–148**.
6. **Rosetta stone** — one compact table (external term ↔ craft mechanism ↔ where configured),
   distilled per design **L150–154**.
7. **Sources** — cite these six URLs verbatim (design **L156–162**):
   - `gist.github.com/sanchez314c/a767997b030d2904c0d0f08fabae2d42` (Karpathy-Michaels CLAUDE.md + LOOPS.md)
   - `x.com/Vtrivedy10/status/2031408954517971368`
   - `martinfowler.com/articles/exploring-gen-ai/13-role-of-developer-skills.html` (Böckeler)
   - `thoughtworks.com/en-de/radar/techniques/architectural-fitness-function`
   - `lexler.github.io/augmented-coding-patterns/patterns/approved-scenarios/`
   - `addyosmani.com/blog/own-the-outer-loop/` (Osmani)

### TDD steps

- The guide body is **prose** — no executable contract, so there is **no RED** for content (design
  *Test strategy*: no new test is warranted for the prose; correctness is link-integrity + review).
- **GREEN:** author `docs/GUIDE-concepts.md` per the structure and constraints above.
- **Verify (part done-check):** `bash scripts/docs-structure-lint.sh docs` passes (slug, not
  dated); `node --test test/living-corpus.test.js` stays green **at 24** — the new file is not yet
  whitelisted in the enumerator, so the pinned set is unchanged. This proves that merely adding the
  file did not perturb the corpus (it matches no existing `find` clause: not `DESIGN-*.md`, not
  `DOD.md`, not `GUIDE-customizing.md`).
- **REFACTOR:** read the guide end-to-end for the ~200–350-line budget, craft-native-primary
  vocabulary, no duplicated catalog/table (links only), and that every external link resolves.

### Gate

`bash scripts/docs-structure-lint.sh docs && node --test test/living-corpus.test.js`

### Commit

`docs(concepts): add GUIDE-concepts four-frames orientation guide`

## Part 2 — Enroll GUIDE-concepts in the living corpus (enumerator + pinned set)

### Context

Two files, moved together — the enumerator and its pin must never drift:

- **`scripts/living-corpus.sh`** — the single source of truth for the intention port's living
  corpus (consumed by `scripts/ci.sh` and `test/intention-lint-ci.test.js`; both shell out here).
  Current **second `find` clause, line 17**:
  ```
      find docs -maxdepth 1 \( -name 'DESIGN-*.md' -o -name 'DOD.md' -o -name 'GUIDE-customizing.md' \)
  ```
  This clause is a **deliberate whitelist**: it globs `DESIGN-*.md` but names `DOD.md` and
  `GUIDE-customizing.md` explicitly. Enrollment is by **explicit filename** (ADR-268) to match the
  house pattern and keep membership a greppable, fail-loud, per-file decision — **not** a widened
  `GUIDE-*.md` glob. The header comment (lines 2–3) lists the corpus contents; keep it truthful.
- **`test/living-corpus.test.js`** — pins the `EXPECTED` set (currently **24** entries,
  `living-corpus.test.js:14-39`). The two adjacent entries the new line sorts between
  (`living-corpus.test.js:21-22`):
  ```
    'docs/DOD.md',
    'docs/GUIDE-customizing.md',
  ```
  The test compares the enumerator output as a **Set** (`assert.deepStrictEqual(result, EXPECTED)`)
  and asserts `lines.length === EXPECTED.size` (no duplicates) plus `sort -c` under `LC_ALL=C`.

**Corpus math** (design L164–181; empirically verified `bash scripts/living-corpus.sh | wc -l` = 24
today): adding `docs/GUIDE-concepts.md` — which **exists** after Part 1, so `find` will emit it once
whitelisted — yields **25**; `LC_ALL=C` sort places it **between** `docs/DOD.md` and
`docs/GUIDE-customizing.md` (`GUIDE-c`**o**`ncepts` < `GUIDE-c`**u**`stomizing`, `o`=0x6f < `u`=0x75):
```
docs/DOD.md
docs/GUIDE-concepts.md      ← inserted
docs/GUIDE-customizing.md
```

**Depends on Part 1:** `docs/GUIDE-concepts.md` must already exist (`find` emits only existing
files) and must carry **no `subjects:` frontmatter** — that is what keeps this part's
`intention-lint-ci` assertion at `craft-intention: OK` (the guide is an advisory skip, ADR-269).

**No provenance refs:** do **not** cite ADR-268 (or any phase / ADR / backlog number) in the script
or the test — the whitelist literal and the pinned path are self-documenting.

**Phase-boundary hygiene:** `scripts/living-corpus.sh` is a `.sh` source file, so `ci.sh`'s
`run_stub_lint` scans it at the boundary — introduce no `TODO`/`FIXME`/`HACK`/`XXX`/`PLACEHOLDER`/
`STUB` marker (the whitelist literal and the comment line carry none).

### TDD steps

- **RED:** in `test/living-corpus.test.js`, add `'docs/GUIDE-concepts.md',` to the `EXPECTED` set in
  sorted position (between `'docs/DOD.md',` and `'docs/GUIDE-customizing.md',`), taking `EXPECTED.size`
  to 25. Run `node --test test/living-corpus.test.js`. **Expected failure:** the first test
  ("emits exactly the pinned corpus as a set") fails — the enumerator still emits 24, so
  `lines.length` (24) ≠ `EXPECTED.size` (25) and the set `deepStrictEqual` reports the missing
  `docs/GUIDE-concepts.md`.
- **GREEN:** in `scripts/living-corpus.sh` line 17, add `-o -name 'GUIDE-concepts.md'` inside the
  second `find` clause so it reads:
  ```
      find docs -maxdepth 1 \( -name 'DESIGN-*.md' -o -name 'DOD.md' -o -name 'GUIDE-customizing.md' -o -name 'GUIDE-concepts.md' \)
  ```
  and update the header comment (lines 2–3) to include `docs/GUIDE-concepts.md` so the enumerator's
  self-description stays accurate. Re-run `node --test test/living-corpus.test.js` → all three tests
  green (25 entries, `LC_ALL=C`-sorted, no duplicates).
- **REFACTOR:** none — one whitelist literal + one truthful comment line.

### Gate

`node --test test/living-corpus.test.js test/intention-lint-ci.test.js`
<!-- living-corpus: enumerator output == the 25-entry pin. intention-lint-ci: re-enumerates the
     widened corpus and asserts `craft-intention: OK` (the guide's no-`subjects:` posture from Part 1
     makes it an advisory skip). Neither test executes scripts/ci.sh — intention-lint-ci reads ci.sh
     content and runs engine/bin/intention-lint.js directly. -->

### Commit

`feat(corpus): enroll GUIDE-concepts in the living-corpus enumerator + pin`

## Part 3 — Ripple: README mental-model hook + GUIDE-customizing cross-link/framing

### Context

Two files — **framing / cross-link only**, no reference material duplicated (design L184–190):

- **`README.md`** — insert a **standalone 3–4 line "mental model" paragraph** immediately **after**
  the *Why craft* bullets. The last *Why craft* bullet is line 23 (`- **Bounded long-running
  work** — …`); `## Install` starts at line 25. Insert the paragraph between them. **No new H2
  heading** (ADR-270 — a standalone paragraph preserves README's heading rhythm Why → Install → Use
  → Customize → Layout). The paragraph links `docs/GUIDE-concepts.md` (README is at root → link path
  `docs/GUIDE-concepts.md`) and frames the mapping: craft's mechanisms map onto four
  industry-recognized frames — Karpathy's *write-the-loop*, Böckeler's *harness taxonomy*, *config
  layers*, and Osmani's *inner/outer loop + the Verdict* — so a reader arriving with those models
  recognizes craft on sight. Do **not** duplicate the HaaS bullet or the Layout bindings table
  (design L186–187) — the guide links them.
- **`docs/GUIDE-customizing.md`** — two framing touches, **existing content unchanged**:
  1. **Cross-link from §1** (`## 1. The mental model (five minutes)`, line 13): add a short lead-in
     linking `GUIDE-concepts.md` (sibling in `docs/` → bare filename), positioning the two as
     complementary — this page is **task-oriented** ("how do I customize craft?"), GUIDE-concepts is
     **orientation** ("why craft is shaped this way").
  2. **Precedence framing lead-in** (`### Precedence — when two settings touch the same knob`,
     line 266): a one-line lead-in recasting the section as the **four-layer config story** (engine
     defaults < user scope < project manifest < per-invocation flags), linking GUIDE-concepts
     Frame 3. The section body is unchanged.

**source-hygiene gate** (`test/source-hygiene.test.js` scans `README.md` and
`docs/GUIDE-customizing.md`, `SCANNED_PATHS` at `source-hygiene.test.js:11-22`): the new prose must
**not** introduce a bare `\bgh\b` or `\bgithub\b` token (class-B). The frame names
(Karpathy / Böckeler / Osmani, "config layers", "write the loop", "harness taxonomy", "the Verdict")
are safe. Do **not** reference the Sources URLs here — they live only in the guide, which is not
source-hygiene-scanned. The existing allowlisted `file / gh /` at `GUIDE-customizing.md` line 58
(hexagon diagram) stays untouched; its allowlist filter matches on content
(`.*file \/ gh \/`) with a line-number wildcard, so inserting the §1 lead-in above line 58 is safe.

**Corpus / intention:** `docs/GUIDE-customizing.md` is a living-corpus member with **no
`subjects:` frontmatter**, so a framing-only edit does not trigger `INTENTION-DRIFT` —
`intention-lint-ci` stays `craft-intention: OK`. `README.md` is **not** a corpus member. Neither
edit changes the corpus path **set**, so `living-corpus.test.js`'s pin is unaffected.

**Phase-boundary hygiene (advisory, orchestrator-run):** both files become touched `.md`, so
`ci.sh`'s `run_prose_lint` scans them against the anti-slop `BAN_LIST` — **`delve`, `leverage`,
`seamless`, `robust`, `it's important to note`, `in conclusion`**. Both files are ban-list-clean
today (verified); keep the new prose clear of all six so touching them surfaces no new
`SLOP-FOUND`.

**No provenance numbers** in either file's prose. **Depends on Part 1** (the guide file must exist
for both links to resolve).

### TDD steps

- Prose ripples carry no executable contract (design *Test strategy*) — **no RED**.
- **GREEN:** apply the README paragraph and the two GUIDE-customizing framing touches.
- **Verify:** `node --test test/source-hygiene.test.js` (no new class-B hit over README /
  GUIDE-customizing), `node --test test/intention-lint-ci.test.js` (corpus content edit stays
  `craft-intention: OK`), `bash scripts/docs-structure-lint.sh docs`.
- **REFACTOR:** confirm both new links resolve; confirm no reference table / catalog was copied
  (links only); confirm README's heading rhythm is preserved (no new H2).

### Gate

`node --test test/source-hygiene.test.js test/intention-lint-ci.test.js && bash scripts/docs-structure-lint.sh docs`

### Commit

`docs(concepts): link GUIDE-concepts from README and GUIDE-customizing`
