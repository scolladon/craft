# Plan — Running craft in a loop (recipe/example, P21)

> Source: design doc `docs/DESIGN-P21-loop-recipe.md` · ADRs `111, 112, 113, 114, 115`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices for FEATURE code: coverage/interop/property
  tests fold into the implementation slice whose code they exercise. EXCEPTION:
  test-infra-only and docs-only slices (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation slice to fold into.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.

### P21-specific scope facts (read once, applies to every slice)

This is a **docs + example feature, no engine change** (ADR-111/115). There is **zero
`src/` delta**: nothing under `engine/`, `pipeline/`, `contracts/`, `skills/`, `agents/`,
`scripts/`, `adapters/` changes. No shell script ships (ADR-115 — the decisions phase
explicitly rejected `loop.sh`). No new manifest key (`loop:` would be `unknown top-level
key` → an engine change, forbidden by ADR-111). Every slice is docs-only or docs+test-infra
and is legitimately standalone per the Sizing-rules EXCEPTION.

- **No new exported code symbol.** The only "public surface" this feature adds is *catalog
  visibility*: the `examples/loop/` dir made discoverable through `examples/README.md` + the
  `docs/GUIDE-customizing.md` §4 index, and gated against rot by the existing `examples-lint`
  CI gate. Those surface gates are pre-paid in-slice (Slice 1 satisfies `examples-lint`;
  Slice 3 wires both index surfaces and adds the doc-link guard). No barrels/facades/
  registries/exhaustiveness switches apply — there is no code module.

- **Phase-boundary gate (`gates.phase`) = `bash scripts/ci.sh`**, run from the worktree
  root (this repo has no manifest, so the engine probes defaults; `gates.phase` is the
  substrate gate `scripts/ci.sh`). Pinned (`scripts/ci.sh`, read in-worktree): it runs, in
  order — `cd engine && node --test 'test/**/*.test.js'` with a hard `EXPECTED_TESTS=706`
  count-drift check; `cd adapters/pi && node --test …` with `EXPECTED_PI_TESTS=202`;
  `bats test/`; `shellcheck scripts/*.sh hooks/*.sh`; `node engine/bin/pipeline-lint.js
  pipeline/default.yml`; `node engine/bin/pipeline-resolve.js pipeline/default.yml`;
  `node engine/bin/contracts-lint.js contracts`.

- **The 706 / 202 counts MUST NOT move.** No slice adds a test under `engine/test/` or
  `adapters/pi/test/`, so `EXPECTED_TESTS` stays **706** and `EXPECTED_PI_TESTS` stays
  **202** — and `scripts/ci.sh` is **not edited** (it is a shell file under `scripts/`;
  editing it would also engage `shellcheck` for no reason). The only mechanical test this
  feature adds rides under `bats test/`, which has **no count gate** — adding/extending a
  bats file needs no count bump.

- **Ordering keeps CI green at every commit, and the `examples-lint` gate bites
  immediately.** `examples-lint` (`test/examples-lint.bats`) globs `examples/*/workflow.md`
  and asserts **every** one passes `manifest-lint` (`run_lint` exits 0 and output contains
  `valid.`). The moment `examples/loop/workflow.md` exists it is in that glob — so the
  manifest **and** the `DOD.md` it references via `paths.dod` MUST land in the **same
  commit** (Slice 1). Landing `workflow.md` without `DOD.md` would fail `examples-lint`
  (`paths.dod references missing file`). Slices are sequential, sharing one working tree;
  Slice 3's doc-link guard asserts the `examples/loop/` files exist and are referenced, so
  it MUST land after Slices 1–2.

- **No-provenance contract (binding).** The shipped `examples/loop/workflow.md` and
  `examples/loop/DOD.md` carry **NO** `P21` / `ADR` tokens (provenance lives only in the
  design doc, the ADRs, and GUIDE/README *prose*). Slice 3's guard asserts this mechanically.

### Empirically pinned facts (verified in a mktemp throwaway against the real linter — reproduce verbatim)

Run in `/tmp`, never the worktree. Confirmed against `node engine/bin/manifest-lint.js`
**and** the `scripts/manifest-lint.sh` wrapper (`run_lint` calls the wrapper):

- **PASS** — `examples/loop/workflow.md` with `paths: { dod: loop/DOD.md }` and a present
  `examples/loop/DOD.md` →
  `craft-manifest: <abs>/loop/workflow.md valid.`, **exit 0**. (The linter resolves relative
  refs against `ROOT = dirname(dirname(manifest))`, so `loop/DOD.md` resolves against the
  sibling `DOD.md` — same mechanism as `examples/dod-artifact/`.)
- **CONTROL A** (proves the loop is *outside* craft) — a bespoke `loop:` key →
  `INVALID manifest …: - unknown top-level key: loop`, **exit 2**. There is no engine key
  for the loop; adding one is an engine change (forbidden, ADR-111).
- **CONTROL B** (the file-ref check is live) — `paths.dod` pointing at a missing file →
  `INVALID manifest …: - paths.dod references missing file: <path>`, **exit 2**. The sample
  `DOD.md` must actually exist on disk.

## Slice 1 — `examples/loop/` runnable artifact: lint-clean manifest + sample DoD (ADR-115)

### Context

The only slice with a code gate. It lands the catalog-visible, lint-gated runnable pair so
`examples-lint` protects the example from rot. Docs+example slice, **no `src/` delta**.

- **New dir:** `examples/loop/` with **exactly two files in this commit** (the README is
  Slice 2):
  - `examples/loop/workflow.md` — a lint-clean craft manifest, **recognized keys only**.
  - `examples/loop/DOD.md` — the small sample DoD the manifest's `paths.dod` points at.
- **Pinned passing manifest body** (reproduce verbatim — empirically lints `valid.`, exit 0;
  the `ROOT = dirname(dirname(manifest))` rule resolves `loop/DOD.md` to the sibling file):

  ```
  ---
  # A NORMAL per-pass craft config. The loop lives OUTSIDE craft (it is the operator's
  # outer harness — see README.md), so there is NO `loop:` key here: craft runs exactly
  # one gated pass per invocation. The only thing this manifest does is point the
  # validation phase's DoD probe at the sample checklist next to it.
  paths:
    dod: loop/DOD.md
  ---

  # Example — running craft in a loop (a use-pattern, not an injection point)

  This dir is the home of the **loop recipe**: an external, operator-owned loop re-invokes
  one craft pass against a fixed DoD until the DoD is met. The loop is NOT a craft feature —
  craft still runs one gated pass per invocation — so this `workflow.md` carries no loop
  config; it is an ordinary manifest whose only job is to declare where the DoD lives
  (`paths.dod`). The recipe itself — the canonical `/loop /craft:run` form, the stop
  condition, and the headless `craft-pi` contrast — is in **README.md** in this directory.

  > In your real repo this file lives at the project root as `.claude/workflow.md`, and the
  > DoD file resolves relative to the repo root.
  ```

  The prose-after-frontmatter shape mirrors `examples/dod-artifact/workflow.md` and
  `examples/lean-profile/workflow.md` (a YAML frontmatter block, then a `# Example — …`
  heading and short prose). **No `P21`/`ADR` token anywhere in this file** (no-provenance
  contract — Slice 3 guards it).
- **Pinned sample DoD** (`examples/loop/DOD.md`) — mirror the shape of
  `examples/dod-artifact/DOD.md` (a `# Definition of Done` heading + free-text `- [ ]`
  checklist lines, read verbatim; no schema, no fences). Keep it small and self-contained;
  it is the acceptance bar the loop converges on. **No `P21`/`ADR` token** in this file.
  Suggested content (free-text checklist — the implementer may word it, but it MUST be a
  non-empty markdown checklist with `- [ ]` lines so the example is illustrative):

  ```
  # Definition of Done

  - [ ] Gates green — nothing committed on a red gate
  - [ ] Mutation testing clean — survivors triaged (killed or proven equivalent)
  - [ ] Every acceptance criterion for the change is met and recorded per-criterion
  ```

- **Gate mechanics pinned:** `examples-lint` (`test/examples-lint.bats`) loads
  `helpers/manifest-lint` and calls `run_lint "$manifest"` → `bash scripts/manifest-lint.sh
  <manifest>`, asserting `status -eq 0` and `output == *"valid."*`. The wrapper prints
  `craft-manifest: <abs>/examples/loop/workflow.md valid.` for the pinned body (verified).
- **Do NOT** create `examples/loop/README.md` here (Slice 2). Do NOT add a `loop:` key (CONTROL
  A → invalid). Do NOT point `paths.dod` at a non-existent file (CONTROL B → invalid). Do NOT
  edit `scripts/ci.sh`, `test/examples-lint.bats`, or any other example.

### TDD steps

- RED — confirm the gate currently has nothing to assert for this dir and would fail once a
  manifest exists without its DoD:
  - `ls examples/loop/ 2>&1` → "No such file or directory" (the dir does not exist yet).
  - RED demonstration of the file-ref bite (in a `mktemp` scratch, never the worktree):
    create `loop/workflow.md` with `paths: { dod: loop/DOD.md }` but **no** `DOD.md`, run
    `node engine/bin/manifest-lint.js <scratch>/loop/workflow.md` → exit 2,
    `paths.dod references missing file: loop/DOD.md`. This is the failure the same-commit
    DoD prevents. Discard the scratch.
- GREEN — author both files in `examples/loop/`:
  1. `examples/loop/DOD.md` first (so the ref resolves), then `examples/loop/workflow.md`
     with the pinned frontmatter + prose above.
  2. Run the slice gate (below) → `examples-lint` green; the new manifest reports `valid.`.
- REFACTOR — re-read both files: confirm recognized-keys-only (`paths.dod` is the sole
  config key); confirm the frontmatter prose matches the `dod-artifact`/`lean-profile`
  voice and length; confirm `grep -nE 'P21|ADR' examples/loop/workflow.md examples/loop/DOD.md`
  returns **nothing** (no-provenance); confirm `DOD.md` is a non-empty `- [ ]` checklist.

### Gate

- Targeted (slice, `gates.slice`):
  `node engine/bin/manifest-lint.js examples/loop/workflow.md` → prints
  `… examples/loop/workflow.md valid.`, exit 0; **and** `bats test/examples-lint.bats` →
  all cases green (the new manifest is in the glob and lints clean).
- Phase-boundary (valid here too): `bash scripts/ci.sh` (adding two `.md` files under
  `examples/` changes no executable surface; `bats test/` picks up `examples-lint`; the
  706 / 202 counts are untouched; ci stays green).

### Commit

`docs(examples): add examples/loop runnable artifact — lint-clean manifest + sample DoD (ADR-115)`

## Slice 2 — `examples/loop/README.md`: the recipe's prose home (ADR-111/112/113/114)

### Context

Docs-only slice (no `src/` delta), legitimately standalone. This is the **prose home** of
the recipe — the design's "README prose is what makes the dir an example." It depends on
Slice 1's dir existing (sequential, shared tree).

- **New file:** `examples/loop/README.md`. No existing `examples/*/README.md` exists in the
  repo (verified — every other example carries its prose inline in `workflow.md`). So there
  is no per-dir README to mirror structurally; **match the voice and length** of the inline
  prose blocks in `examples/dod-artifact/workflow.md` and `examples/lean-profile/workflow.md`
  and of the top-level `examples/README.md` (compact, table-driven, declarative).
- **Three required content blocks** (the README must carry all three — they are the recipe's
  load-bearing prose; sourced from the design §"The canonical recipe", §"The headless
  contrast", §"Why example-first", and the ADRs):

  1. **The canonical recipe — `/loop /craft:run` (ADR-112/114).** State the exact invocation
     with the interval **omitted so the model self-paces**:

     ```
     /loop /craft:run <backlog-id | spec file | feature description>
     ```

     Each iteration runs one `/craft:run` pass; because `/craft:run` prints the **full run
     record** in its final message, the model (the loop's runner) reads the **actual P20
     verdict** directly — no exit code, no stderr grep, no classifier. Include the
     **stop-condition table** the model applies, in the run record's own greppable
     vocabulary (mirror the design's matrix exactly):

     | Run-record outcome | Model's action |
     |---|---|
     | `verify: DoD met` and no `verify: … unmet` | **STOP — done.** |
     | a `verify: … unmet` outcome | **CONTINUE — not yet;** run another pass. |
     | any other blocker `{ unit, reason }` (red gate, unreachable tool, resolution failure) | **SURFACE-AND-HALT** — a human must intervene. |
     | `NO-OP(verify):` (no DoD declared) | **SURFACE-AND-HALT** — premise violated; do not mistake "no DoD" for "done." |

     State the **bound** (ADR-114): the operator caps `/loop`'s cadence (or sets a small
     iteration bound); non-convergence is surfaced, never a silent spin. State **inputs are
     stable** (ADR-114): the same `/craft:run <input>` each pass, the worktree evolving under
     a fixed DoD; idempotency falls out (an already-met change records `verify: DoD met` on
     pass 1 and stops). Note the manifest in this dir (`paths.dod: loop/DOD.md`) is what
     points the `validation` phase at the sample DoD the loop converges on.

  2. **The headless contrast — `craft-pi` exit code (ADR-113), prose only, no shipped
     script.** For a **fully unattended** loop (cron, CI re-trigger, a Makefile target — no
     Claude in the loop), the only non-interactive entry point is `craft-pi`, which **prints
     no run record**: its stdout is empty on success and only a blocker `{ unit, reason }`
     line reaches **stderr**; its exit code is **binary** (`0`/`2`). Document, as prose:
     - **DoD-presence precondition (once, before looping):** assert a DoD resolves
       (`docs/DOD.md` or the manifest's `paths.dod` target). If none, **refuse to start** —
       because `exit 0` would otherwise be read as "met" when it may mean "absent"
       (a DoD-absent pass also exits 0: P20/ADR-107 makes DoD-absence a non-blocking
       `NO-OP(verify):`). This precondition is what makes `exit == 0 ⇒ MET` sound.
     - `exit == 0` ⇒ **MET** (sound only under the precondition) ⇒ stop.
     - `exit == 2` **and** stderr mentions `verify` ⇒ **NOT-YET** ⇒ iterate (bounded).
     - `exit == 2` otherwise (red gate / unreachable tool / resolution failure / opaque
       stderr) ⇒ **BLOCKED** ⇒ halt for a human. Opaque stderr is BLOCKED, never NOT-YET
       (the conservative direction).
     - State its **limits honestly:** it cannot see the positive verdict text; the
       not-yet-vs-blocked split is best-effort (depends on the spawned `validation` pi
       writing the criterion text to stderr); under the headless adapter an unmet criterion
       *halts the walk* so the worktree may not advance — the bound is the safety net. This
       is the **escape hatch, not the recommendation.**

  3. **Why example-first, not an engine-native loop (ADR-111).** A short contrast (the
     design's 4-axis table is the source — generality, invariant-core preservation, protocol
     surface, composability): the recipe lets the operator compose any outer cadence and
     reads the verdict craft already produces; an engine-native `loop:` phase/flag would bake
     one stop policy into the engine, widen the invariant core ("one gated pass" → "one-or-N
     passes"), and add a new manifest key + resolver + lint + tests. craft is opinion-free
     about *what* you inject and owns only the per-pass orchestration; *when to stop
     iterating* is the operator's policy. So future "add a loop flag" requests hit this
     standing decision.

- **Provenance note (allowed here):** GUIDE/README *prose* MAY name P21/ADR numbers (the
  no-provenance rule binds only `workflow.md` and `DOD.md`). Keep it readable, not a spec
  dump.
- **Do NOT** ship a `loop.sh`, a `classify()` function, or any fixture (ADR-115 — no script
  to lint/test). Do NOT edit `examples/loop/workflow.md` or `DOD.md` (Slice 1's artifact).

### TDD steps

- RED — `test -f examples/loop/README.md` is **false** before this slice (the dir from
  Slice 1 holds only `workflow.md` + `DOD.md`). Confirm it is absent.
- GREEN — author `examples/loop/README.md` with the three content blocks above (canonical
  `/loop /craft:run` recipe + stop-condition table + bound + stable-input note; headless
  `craft-pi` contrast with the precondition, the exit-code rules, and the honest limits;
  the engine-native-loop rejection rationale). Match the compact, table-driven voice of the
  existing example prose.
- REFACTOR — re-read: confirm all three blocks are present and self-consistent with the
  ADRs (canonical reads the run record; headless reads exit code + best-effort stderr under
  the precondition; engine-native rejected for generality/invariant-core); confirm the
  stop-condition table matches the design matrix verbatim (`verify: DoD met` /
  `verify: … unmet` / other blocker / `NO-OP(verify):`); confirm the `/loop /craft:run`
  invocation shows the interval omitted; confirm it does not invent a shipped script.

### Gate

- Targeted (slice, `gates.slice`): pure-docs file — no code gate. Doc-presence + content
  check: `test -f examples/loop/README.md` **and** the README names all three pillars —
  `grep -Fq '/loop /craft:run' examples/loop/README.md` (canonical recipe),
  `grep -Fq 'craft-pi' examples/loop/README.md` (headless contrast), and
  `grep -Eq 'verify: DoD met' examples/loop/README.md` (the stop signal). All must pass.
- Phase-boundary: `bash scripts/ci.sh` (adding a `.md` under `examples/` changes no
  executable surface; the `examples-lint` glob is `examples/*/workflow.md` so a README is
  ignored by it; 706 / 202 untouched; ci stays green).

### Commit

`docs(examples): add the loop recipe README — canonical /loop, headless craft-pi contrast, engine-native rejection (ADR-112)`

## Slice 3 — index the loop in the catalog (GUIDE + examples/README) + doc-link & no-provenance guard (ADR-115)

### Context

Docs + test-infra slice (no `src/` delta), legitimately standalone. It makes the example
**catalog-visible** (the public-surface gate for this feature) and adds the mechanical
guard the design's Test-strategy calls for (doc-link integrity + no-provenance-leak). MUST
land after Slices 1–2 — the guard asserts the `examples/loop/` files exist and are
referenced, and the references it asserts are added in this same slice.

- **Edit 1 — `docs/GUIDE-customizing.md`: add a "Running craft in a loop" section.**
  - Pinned structure (read in-worktree): the GUIDE is FLAT-numbered. §4 "Examples index — a
    sample per point" runs **lines 256–279** and ends with the "Samples that reference a
    context/override body …" paragraph (lines 277–279), followed by a `---` rule at **line
    281** and `## 5. Tailor in one sitting` at **line 283**. There is **no existing
    loop/iterate content** (verified: the only `loop` hits are the conversational "That's the
    loop:" line at 321 and the `## 4` heading neighbourhood — neither is about iterating
    craft).
  - **Insertion point (pinned, re-verified in-worktree):** insert a new
    `### Running craft in a loop — a use-pattern` subsection under §4, immediately **after the
    §4 closing paragraph (line 279) and before the `---` rule (line 281)** — so the
    use-pattern sits beside the examples index it references, and ahead of the `## 5. Tailor
    in one sitting` section (line 283). Do NOT open a new top-level `## 6` (it would dangle
    after §5's walkthrough). Match the GUIDE's heading style (`###` sentence-case headings,
    compact prose, a small table only where it earns its place).
  - Content (the mental model + the contrast, sourced from the design and Slice 2's README —
    keep it short; the README is the deep home): the loop is an **operator-owned outer
    harness**, not an engine feature (craft runs one gated pass per invocation, ADR-111);
    the **canonical** form is Claude Code's `/loop /craft:run` self-paced on the printed run
    record (ADR-112); the **headless** form drives `craft-pi`'s exit code under a
    DoD-presence precondition (ADR-113); doneness is **read** from the P20 `verify:` verdict,
    bounded and loud (ADR-114). **Link to `examples/loop/`** for the full recipe:
    `[examples/loop/](../examples/loop/)`.
- **Edit 2 — `examples/README.md`: add the loop as a use-pattern.**
  - Pinned structure (re-verified in-worktree): the `## By injection point` table runs
    **lines 13–26** (rows #1–#13), followed by its own Tier-2 follow-up prose at **lines
    28–31** (the `derived-plugin` explainer — part of the table's section), then
    `## Integrating external skill collections` at **line 33** (own table), then
    `## A note on the sample context/override files` at **line 52**. The loop is a
    **use-pattern, distinct from injection points** (it injects nothing into craft) — so it
    does **not** belong in the injection-point table.
  - **Insertion (pinned):** add a small dedicated section — `## A use-pattern: running craft
    in a loop` — placed **after the Tier-2 follow-up prose (after line 31) and before
    `## Integrating external skill collections` (line 33)**, so the table and its own
    explainer stay together and the use-pattern reads as "and, separately, a use-pattern."
    One short paragraph: the loop composes a Claude Code primitive (`/loop`) over an existing
    craft entry point (`/craft:run`); it injects nothing into craft; see `[loop/](loop/)`
    for the recipe. Match the file's compact voice.
- **Edit 3 — the mechanical guard.** Add it to **`test/p10-structure.bats`** (the repo's
  existing structure-guard home — `ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"`, then
  `[ -f "${ROOT}/<path>" ]` existence checks and `grep -q` content checks). Extending the
  existing file is preferred over a new `test/p21-*.bats` (one fewer file; same idiom; the
  task's guidance favours extending an existing doc-structure bats test). `bats test/` has
  **no count gate**, so no `scripts/ci.sh` edit. Add these `@test` cases (G/W/T titles,
  matching the file's style):
  - Existence: `[ -f "${ROOT}/examples/loop/workflow.md" ]`,
    `[ -f "${ROOT}/examples/loop/DOD.md" ]`, `[ -f "${ROOT}/examples/loop/README.md" ]`.
  - Doc-link integrity: `grep -q 'examples/loop/' "${ROOT}/docs/GUIDE-customizing.md"` and
    `grep -q 'loop/' "${ROOT}/examples/README.md"` (the catalog surfaces reference the dir).
  - No-provenance-leak (core contract):
    `! grep -qE 'P21|ADR' "${ROOT}/examples/loop/workflow.md"` and
    `! grep -qE 'P21|ADR' "${ROOT}/examples/loop/DOD.md"` (the shipped manifest + sample DoD
    carry no provenance tokens).
  - shellcheck note: bats files are NOT linted by `shellcheck scripts/*.sh hooks/*.sh`, so
    no shellcheck concern for the edit.
- **Do NOT** edit `scripts/ci.sh` (no count bump — nothing under `engine/test` or
  `adapters/pi/test`). Do NOT add a `loop:` key anywhere. Do NOT touch `pipeline/`,
  `contracts/`, `skills/`, `agents/`.

### TDD steps

- RED — author the new `@test` cases in `test/p10-structure.bats` FIRST, then run
  `bats test/p10-structure.bats`. Before Edits 1–2 land, the doc-link assertions FAIL
  (`grep 'examples/loop/' docs/GUIDE-customizing.md` and `grep 'loop/' examples/README.md`
  return nothing — the catalog does not yet reference the dir). Confirm the failure. (The
  existence + no-provenance assertions already pass against Slices 1–2's files; the doc-link
  pair is the true RED that drives Edits 1–2.)
- GREEN —
  1. Edit 1: insert the `### Running craft in a loop — a use-pattern` subsection into
     `docs/GUIDE-customizing.md` at the pinned anchor (after line 279, before the `---`),
     linking `../examples/loop/`.
  2. Edit 2: insert the `## A use-pattern: running craft in a loop` section into
     `examples/README.md` after the injection-point table, linking `loop/`.
  3. Re-run `bats test/p10-structure.bats` → all new cases green (existence + doc-link +
     no-provenance all pass).
- REFACTOR — re-read the two doc edits: confirm the GUIDE subsection matches the §
  heading/voice and that the use-pattern is framed as distinct from injection points (it
  injects nothing); confirm the `examples/README.md` entry is NOT mixed into the
  injection-point table; confirm both links resolve to `examples/loop/`; confirm the bats
  `@test` titles follow the file's G/W/T convention and the `ROOT` idiom; confirm no
  assertion mutates the worktree.

### Gate

- Targeted (slice, `gates.slice`): `bats test/p10-structure.bats` (the new existence,
  doc-link, and no-provenance cases all pass against the landed `examples/loop/` files and
  the just-added catalog references).
- Phase-boundary: `bash scripts/ci.sh` (the extended bats file is picked up by `bats test/`
  — no count gate; the two `.md` edits change no executable surface; 706 / 202 untouched;
  ci stays green).

### Commit

`docs(guide): index the loop use-pattern in the GUIDE + examples README, guarded against rot (ADR-115)`
