# Design — P21: running craft in a loop (recipe/example, not an engine loop)

Brief: ship an EXAMPLE/recipe driving craft iteratively — an external, operator-owned loop
re-invokes one craft pass against a fixed PRD + DoD + config until the DoD is met — rather than
baking loop semantics into the engine. The engine stays generic (one pass per invocation); the
loop is a composable, flexible OUTER harness. Deliverable: documentation + a runnable example
directory (a lint-clean manifest, a sample DoD, and a prose README), with **no shell script**.
Contrast the engine-native-loop alternative and record why example-first wins
(generality/flexibility).

Status: draft → revised against ADRs 111–115 → accepted

> **Ratified.** The decisions phase produced ADRs 111–115, which DEVIATE from this doc's first cut
> (a shell `loop.sh` driving `craft-pi`). The revision below matches the ADRs exactly: the canonical
> recipe is **Claude Code's `/loop` slash command driving `/craft:run`**, self-paced, reading the
> **printed run record**; `craft-pi`'s exit-code model is demoted to a documented **headless
> contrast**; and the deliverable ships as an `examples/loop/` directory plus a GUIDE section, **with
> no script to lint or test**. Decision candidates are all resolved (see that section).

## Context

### What craft is, and the one-pass boundary this recipe respects

craft is a hexagonal feature-delivery engine (`README.md`, `docs/GUIDE-customizing.md` §1): a single
abstract phase sequence — `workspace → design → decisions → planning → implementation → review →
refactoring → validation → documentation → propose → integrate` — runs **exactly once per
invocation**. The invariant core (`GUIDE §2`) is non-injectable. This work adds **nothing** to the
engine; it documents a pattern that *wraps* craft from outside. The frame the GUIDE already sets —
"you bring rules, agents, tools; craft wires and gates them" — extends naturally: **the operator
brings the loop; craft owns one pass** (ADR-111).

### The two craft entry points the loop can call (pinned empirically)

**1. `/craft:run <input>` — the interactive Claude Code skill** (`skills/run/SKILL.md`). A *session*
orchestrator: it resolves the input, talks to the user (ADR ratification in `decisions`, blocker
escalations, `integrate` merge confirmation), verifies artifacts, applies fixes. Its **final message
prints the full run record** — including the complete P20 verify vocabulary. It has **no process
exit code** to read (it is a chat turn, not a shell process). A human (or `/loop`'s model runner) is
in the seat.

**2. `craft-pi` — the non-interactive bin** (`adapters/pi/`,
`docs/DESIGN-P17-pi-adapter-productization.md`). Pinned against the worktree:

| Fact | Pin | Source |
|---|---|---|
| bin entry | `craft-pi` → `adapters/pi/src/cli.js` (shebang thin bin) | `adapters/pi/package.json` `"bin": { "craft-pi": "src/cli.js" }` |
| argv | **ignored** — `cli.js` calls `main(process.argv.slice(2), …)` but `main(_argv, …)` never reads `_argv` (marked reserved) | `cli.js:7`, `run.js:267` |
| manifest | **fixed** — `adapters/pi/.claude/workflow.md` (module-relative, `MANIFEST_PATH_DEFAULT`), independent of launch cwd | `run.js:11-13` |
| stdin | ignored (`stdio: ['ignore','pipe','pipe']`) — pi hangs on open stdin in `-p` | `run.js:101-106` |
| exit code | `process.exit(result.code)` | `cli.js:8` |
| **stdout / run record** | **NOT printed.** `main` returns `{ code, runRecord }`; `cli.js` calls only `process.exit(result.code)` and discards `runRecord`. Worker phases parse pi's stdout for **only `usage`** (`parseUsage`); the phase's prose/run-record text is consumed and dropped. | `cli.js:7-8`, `run.js:165-172`, `run.js:294` |
| **stderr** | on **any** blocker, `main` writes a **blocker `{ unit, reason }` line** to stderr (`io.stderr.write(String(err.message))`); on success it writes **nothing**. | `run.js:289` |

These pins remain true after the revision — but their role changes. They no longer describe the
**canonical** stop signal; they describe the **headless contrast** signal only (ADR-113). The
canonical path does not touch `craft-pi`.

**The load-bearing consequence for `craft-pi` (now the contrast's crux).** Two facts, both pinned,
shape the headless contrast:

1. **`craft-pi`'s exit code is binary** — `0` (walk completed, no blocker) vs `2` (a blocker halted
   the walk). A **missing or no-op'd DoD is NOT a blocker**: P20 makes DoD-absence a recorded
   `NO-OP(verify):` warning that **never blocks** (`docs/DESIGN-P20-dod-aware-verification.md` Req 2;
   ADR-107). So a pass with **no DoD** still exits `0`. A **DoD-criterion-unmet**, under the headless
   adapter, **records a blocker and halts** (ADR-095/109) → the `validation` worker's `pi` exits
   non-zero → `spawnPi` rejects → exit `2` (DI-pinned). So `craft-pi`: **DoD-met → `0`; DoD-unmet →
   `2`; DoD-absent → `0`.** That `0`-conflation (met vs absent) is exactly why the headless contrast
   needs a DoD-presence precondition (ADR-113).
2. **`craft-pi` does NOT surface the run record** (pinned above): stdout is empty on success; on a
   blocker, only the **blocker `{ unit, reason }` line** reaches **stderr**. The positive
   `verify: DoD met` line **never appears on craft-pi's own output**; `verify: … unmet` text may
   appear in a stderr blocker reason **only if** the spawned `validation` pi emits it (best-effort,
   not guaranteed by craft-pi's code).

**This is precisely why the canonical recipe drives `/craft:run`, not `craft-pi`** (ADR-112):
`/craft:run` is the *only* entry point that prints the run record, so the loop reads the **actual**
P20 verdict rather than inferring it from an impoverished exit code. The exit-code reasoning above is
retained, but only as the documented headless escape hatch (ADR-113), never as the primary path.

### The DoD mechanism the stop condition builds on (P20, pinned)

`docs/DESIGN-P20-dod-aware-verification.md` + ADRs 104–110 + `docs/DOD.md` give the recipe its stop
signal for free:

- The DoD lives at `docs/DOD.md` (default) or `paths.dod` (manifest override). Free-text markdown
  checklist (`- [ ]` lines), read verbatim (ADR-106/109).
- The **`validation` phase** (default-ON, ADR-105) asserts the DoD per criterion and records the
  result in the **run record** (carried into the PR body via ADR-102) using one fixed greppable
  vocabulary:

| Situation | Recorded line | Read by the loop as |
|---|---|---|
| DoD present, all criteria met | `verify: DoD met — <N criteria, …>` | **stop, success** |
| DoD criterion unmet | blocker `{ verify, "<criterion> unmet", ≤3 options }` | **continue (not-yet)** |
| no DoD declared | `NO-OP(verify): no DoD declared — …` | **premise violated → surface-and-halt** |

(matrix per P20 §"recorded-vocabulary matrix"; tokens per ADR-103/107.)

- **P20's ground-truth verdict semantics** (what the verdict *means*, independent of how an entry
  point surfaces it): the change is **done** ⇔ the `verify: DoD met` outcome holds with **no**
  `verify: … unmet` outcome. On the canonical path the model reads this verdict **directly** from the
  printed run record — there is no proxy and no classifier (ADR-112/114).

### Where the recipe lands: `examples/` structure + the `examples-lint` gate (pinned)

- Examples live one-per-injection-point under `examples/<point>/`, each dir a `workflow.md` manifest
  + prose (`examples/README.md`; `docs/GUIDE-customizing.md` §4).
- The **`examples-lint` gate** (`test/examples-lint.bats`) is mechanical and unconditional: it globs
  `examples/*/workflow.md` and asserts (a) ≥1 exists, (b) **every** one passes `manifest-lint`
  (`run_lint "$manifest"` exits 0 and output contains `valid.`). Pinned consequence: **any new
  `examples/<dir>/` MUST contain a `workflow.md` that is a lint-clean craft manifest.** A dir holding
  only a README (no `workflow.md`) is skipped by the glob (no failure) — but then it is not a catalog
  example and is invisible to the convention. A dir whose `workflow.md` is *not* a valid manifest
  **fails CI**.
- `manifest-lint` (`scripts/manifest-lint.sh` → `engine/bin/manifest-lint.js` →
  `engine/src/manifest-lint-main.js`) refuses unknown top-level keys and validates file refs. The
  loop example's manifest therefore carries **only recognized keys** of a normal per-pass config
  (e.g. `paths.dod`), never a bespoke `loop:` key — there is no such key, and adding one would be an
  engine change (forbidden by ADR-111). The linter's path-resolution rule is
  `ROOT = dirname(dirname(manifest))`, so a manifest at `examples/loop/workflow.md` resolves
  `paths.dod: loop/DOD.md` against `examples/loop/DOD.md` (mirrors `examples/dod-artifact/`).
- The repo's own `docs/DOD.md` already exists and is guarded by `test/p20-dod.bats`. The loop example
  does not collide with or depend on mutating that file; it carries its own sample DoD.

### Doc conventions (pinned)

- Design docs live FLAT at `docs/DESIGN-P<n>-<slug>.md` (this file:
  `docs/DESIGN-P21-loop-recipe.md`).
- Guides live FLAT at `docs/GUIDE-<slug>.md`; the customization guide is `docs/GUIDE-customizing.md`.
- ADRs live at `docs/adr/<n>-<slug>.md`; this design is ratified by ADRs 111–115.
- Provenance refs (P21, ADR numbers) may appear in this design doc, the ADRs, and GUIDE/README prose,
  but **never** in shipped manifests or the sample DoD (no-provenance contract).

## Requirements

1. **The loop is an operator-owned outer harness, not an engine feature** (ADR-111). It is
   copy-pasteable and self-contained: no engine edit, no new craft flag, no new manifest key. craft
   continues to run exactly one gated pass per invocation.
2. **The canonical recipe is Claude Code's `/loop` driving `/craft:run`, self-paced** (ADR-112). The
   interval is omitted so the model self-paces: each iteration runs one `/craft:run` pass; the model
   then reads that pass's **printed run record** and applies the stop condition. No shell script; no
   hand-rolled classifier.
3. **The stop condition reads the actual P20 verdict from the printed run record** (ADR-114): **stop**
   on `verify: DoD met` (with no `verify: … unmet`); **continue** on a `verify: … unmet` outcome;
   **surface-and-halt** on any other blocker, or on `NO-OP(verify):` (premise violated — a DoD was
   expected but none resolved). Doneness is read, never recomputed: the loop never re-runs gates,
   mutation, or re-parses criteria itself.
4. **The loop is bounded and loud on exhaustion** (ADR-114). The operator caps `/loop`'s cadence (or
   sets a small iteration bound); non-convergence is a first-class, surfaced outcome, never a silent
   spin (mirrors craft's "blocker, never spin" floor, `GUIDE §2`).
5. **Inputs are stable and not threaded per pass** (ADR-114). The loop relies on stable committed
   inputs (the DoD and config the entry point already reads) re-evaluated each pass as the worktree
   evolves. Idempotency falls out for free: re-running on an already-met change records
   `verify: DoD met` on pass 1 and stops immediately. The worktree is the only state carried between
   passes (artifact-is-the-handoff, extended to the outer level).
6. **A documented headless contrast exists for fully-unattended use** (ADR-113). For cron/CI/Makefile
   with no Claude in the loop, the recipe documents (as **prose**, not a shipped script) driving
   `craft-pi` and reading its **exit code** as the primary signal, disambiguated by a best-effort
   stderr grep for `verify`, under a mandatory **DoD-presence precondition** — with its weaker signal
   stated honestly.
7. **The doc records why example-first beats an engine-native loop** (ADR-111). A short contrast
   (generality, composability, invariant-core preservation), so future "add a loop flag" requests hit
   a standing decision.
8. **The deliverable is catalog-visible and lint-gated** (ADR-115). It ships as an `examples/loop/`
   directory (a lint-clean `workflow.md` + a sample `DOD.md` + a prose `README.md`) **and** a GUIDE
   section, indexed in `examples/README.md` as a *use-pattern* (distinct from in-manifest injection
   points — the loop injects nothing into craft).

## Design

### The shape of it — three lines

The whole recipe is: **run a pass → read the recorded verdict → decide stop/continue/halt → bound
it.** It is thin because it inherits two craft invariants for free:

- **Artifact-is-the-handoff** (`GUIDE §2`): a pass hands off via commits, never agent memory.
  Extended outward, **the worktree is the handoff between passes** — pass *N+1* reads pass *N*'s
  commits and continues. The loop needs no shared state of its own.
- **The DoD-met verdict is already produced, recorded, and greppable** (P20): the loop does not
  *compute* doneness; it *reads* the verdict the `validation` phase already wrote.

### The canonical recipe — `/loop /craft:run` (ADR-112)

The canonical loop is **Claude Code's `/loop` slash command driving `/craft:run`**, with the interval
omitted so the model self-paces:

```
/loop /craft:run <backlog-id | spec file | feature description>
```

Each iteration runs one `/craft:run` pass. Because `/craft:run` prints the **full run record** in its
final message, the model (the loop's runner) reads the real P20 verdict and applies the stop
condition directly — **no exit code, no stderr grep, no classifier, no DoD-presence trick** (those
belong only to the headless contrast). The stop condition the model applies, in the run-record's own
vocabulary:

| Run-record outcome | Model's action |
|---|---|
| `verify: DoD met` and no `verify: … unmet` | **STOP — done.** The DoD is satisfied. |
| a `verify: … unmet` outcome | **CONTINUE — not yet.** A criterion is still open; run another pass. |
| any other blocker `{ unit, reason }` (red gate, unreachable tool, resolution failure) | **SURFACE-AND-HALT.** Not a DoD-unmet — another blind pass re-hits it; a human must intervene. |
| `NO-OP(verify):` (no DoD declared) | **SURFACE-AND-HALT.** Premise violated: a DoD was expected but none resolved. Do not mistake "no DoD" for "done." |

The bound is `/loop`'s own cadence/cap, set by the operator (Requirement 4); on exhaustion without a
`verify: DoD met`, the loop surfaces non-convergence rather than spinning. Inputs are stable
(Requirement 5): the same `/craft:run <input>` each pass, the worktree evolving under a fixed DoD.

This dissolves the central honesty problem of the first (script) design: with the run record visible,
the model reads `verify: DoD met` **directly** — there is no proxy signal to make sound.

### The headless contrast — `craft-pi` exit code (ADR-113), prose only

For a **fully unattended** loop (cron, CI re-trigger, a Makefile target — no Claude, no human), the
only non-interactive entry point is `craft-pi`, which **prints no run record** (pinned). An
operator-owned harness then reads `craft-pi`'s **exit code** as the primary stop signal,
disambiguated by a **best-effort stderr grep** for `verify`, under a mandatory **DoD-presence
precondition**. This is documented as **prose** in the example README — it is **not a shipped
script**:

- **Precondition (once, before looping):** assert a DoD resolves (`docs/DOD.md` or the manifest's
  `paths.dod` target). If none, **refuse to start** — because `exit 0` would otherwise be read as
  "met" when it may mean "absent" (the `0`-conflation pinned in Context). This one check is what makes
  `exit == 0 ⇒ MET` sound on this path.
- `exit == 0` ⇒ **MET** (sound only under the precondition) ⇒ stop.
- `exit == 2` **and** stderr mentions `verify` ⇒ **NOT-YET** (a DoD-criterion-unmet blocker) ⇒
  iterate, bounded.
- `exit == 2` otherwise (red gate, unreachable tool, resolution failure, or opaque/empty stderr) ⇒
  **BLOCKED** ⇒ halt for a human. Opaque stderr is classified BLOCKED, never NOT-YET (the
  conservative direction).

Its limits are stated plainly in the README: it cannot see the positive verdict text; the
not-yet-vs-blocked split is best-effort (it depends on the spawned `validation` pi writing the
criterion text to stderr, which craft-pi forwards but does not itself author); and under the headless
adapter an unmet criterion *halts the walk* (ADR-095), so the worktree may not advance — the bound is
the safety net. This path exists because some operators genuinely need unattended CI without Claude;
it is the escape hatch, not the recommendation.

### Why the canonical path drives `/craft:run`, not `craft-pi`

`/craft:run` is chosen precisely because it is the **only** entry point that prints the run record, so
the loop reads the real DoD verdict instead of inferring it from a binary exit code. The first design
inverted this (shell + `craft-pi`) and paid for it with a fragile classifier and a DoD-presence
trick; the decisions conversation rejected the script form ("it should not be a script, this is just
an example of slash loop with Claude Code"). The classifier/precondition machinery survives only as
the headless contrast's documented limitation.

### Per-pass inputs — stable committed artifacts (ADR-114)

The brief says "re-run against PRD + DoD + config." The settled model: **the inputs are the committed
artifacts the entry point already reads, re-evaluated each pass** — the DoD at `docs/DOD.md` /
`paths.dod`, the manifest config, and the worktree state (which carries the PRD/design committed
docs). The loop does **not** thread a new PRD per pass; it relies on the worktree evolving under a
*stable* DoD. On the canonical path `/craft:run` *can* take a per-pass brief if a human is present,
but the convergence loop's model is a single stable acceptance bar — a per-pass-brief cadence is a
noted extension, not the recipe.

### Where the recipe lives, and the files that ship (ADR-115)

The recipe ships as **both** an `examples/loop/` directory **and** a `docs/GUIDE-customizing.md`
section, **with no shell script**:

```
examples/loop/
  workflow.md   # lint-clean manifest, recognized keys only: paths: { dod: loop/DOD.md }
                # (a normal per-pass config — the loop is OUTSIDE craft, so no `loop:` key)
  DOD.md        # small sample DoD the manifest's paths.dod points at (mirrors examples/dod-artifact/)
  README.md     # prose home: the /loop /craft:run canonical recipe + stop condition (ADR-112/114),
                # the craft-pi headless contrast (ADR-113), the engine-native-loop rejection (ADR-111)
```

Plus a **"Running craft in a loop"** section in `docs/GUIDE-customizing.md`, and a **use-pattern row**
in `examples/README.md` — distinct from the injection-point table, because the loop injects nothing
new into craft; it composes a Claude Code primitive over an existing entry point.

`examples/loop/workflow.md` is a *normal* craft manifest (recognized keys only); it does **not**
configure the loop — the loop is the operator's harness, outside craft. The README prose is what makes
the dir an "example." This matches the existing example pairs (a runnable dir + a GUIDE row), and the
manifest satisfies the existing `examples-lint` gate so the example cannot rot.

**No `loop.sh`. No `classify()` function. No bats classifier smoke. No `test/fixtures/loop/`. No
shellcheck / `scripts/ci.sh` discussion.** Those were artifacts of the rejected script-first design;
the deliverable is documentation + a lint-clean manifest, so there is no shell to lint or test.

### Why example-first, not an engine-native loop (the P21 lean — ratified in ADR-111)

| Axis | Example/recipe (chosen) | Engine-native `loop:` phase/flag (rejected) |
|---|---|---|
| Generality | operator composes any outer cadence — `/loop /craft:run`, cron, CI re-trigger, `craft-pi` headless | one baked stop policy; every variation needs an engine change |
| Invariant core | one gated pass per invocation stays provable in isolation | "one gated pass" becomes "one-or-N passes," complicating every gate/handoff proof |
| Protocol surface | loop *uses* the existing P20 verify vocabulary; nothing new to learn | a new manifest key + resolver + lint + tests + a "loop blocker vs pass blocker" protocol |
| Composability | reads the verdict craft already produces | a parallel doneness mechanism alongside the DoD |

The recipe wins on every axis the GUIDE's framing values ("craft is opinion-free about *what* you
inject — it owns only the orchestration guarantees"). An engine loop would make craft opinionated
about *when to stop iterating* — a policy that belongs to the operator. Ratified in **ADR-111**.

### Edge behavior (hunted in self-review)

- **Already-done change (idempotency):** pass 1's run record shows `verify: DoD met` → STOP on the
  first iteration. No special-casing; the stop condition handles it (ADR-114 consequence).
- **DoD never declared:** the run record shows `NO-OP(verify):` → SURFACE-AND-HALT (premise
  violated). The model does not mistake "no DoD" for "done." (On the headless contrast, the
  DoD-presence precondition catches this before the loop, because there `exit 0` cannot tell absent
  from met.)
- **Non-convergence:** repeated `verify: … unmet` continues until the operator's bound trips →
  surfaced non-convergence (ADR-114). Bounded by construction.
- **A pass fails its gate (red gate / floor / resolution fail):** the run record shows a blocker that
  is not `verify: … unmet` → SURFACE-AND-HALT. The loop does NOT iterate over a broken gate (another
  pass re-hits the same red gate); a human fixes it.
- **Headless opaque stderr on `exit 2`:** the blocker reason does not name `verify` → classified
  BLOCKED (halt), never NOT-YET — the conservative direction (ADR-113).

## Decision candidates

REQUIRED. Every load-bearing choice not pre-decided by existing ADRs, ≤3 alternatives, with a
recommendation. The designer does NOT decide these — the decisions phase does.

**None open — all load-bearing choices are ratified in ADRs 111–115.** The 8 candidates from the
first cut (DC-1…DC-8) are fully resolved by these ADRs; the design above is written to them. Pointer
per ADR:

| ADR | Ratifies |
|---|---|
| 111 | The loop is an operator-owned outer harness, not an engine-native loop (resolves the engine-vs-recipe fork and the engine-native rejection rationale). |
| 112 | The canonical recipe is Claude Code's `/loop` driving `/craft:run`, self-paced on the printed run-record verdict (resolves form + entry point). |
| 113 | The headless contrast drives `craft-pi`'s exit code + best-effort stderr grep under a DoD-presence precondition (resolves the unattended signal). |
| 114 | The loop reads the P20 verdict, is bounded and loud, and threads no per-pass input (resolves doneness source, bound, input threading). |
| 115 | The recipe ships as `examples/loop/` (manifest + sample DoD + README) plus a GUIDE section, with no shell script (resolves location + form, and moots the `scripts/`-edit tension). |

The ADRs leave nothing load-bearing open: form, entry point, doneness source, bound, input model,
deliverable shape, and verification surface are all settled. No new candidates are surfaced.

## Test strategy

This is a docs + example feature with **no shipped script** — so the verification surface is the
manifest, doc-link integrity, and the no-provenance contract. There is no classifier and no shell to
unit-test (ADR-115). Proofs, mechanical where possible, matching the repo's bats house style:

- **Manifest lint (MECHANICAL, existing gate — no new test needed).** `examples/loop/workflow.md`
  must pass `examples-lint` (`test/examples-lint.bats` already globs `examples/*/workflow.md` and
  asserts each exits 0 and reports `valid.`). Landing the dir with a lint-clean manifest satisfies the
  existing gate. **Empirically pinned** (run in a `mktemp` throwaway, never the worktree, against the
  real `engine/bin/manifest-lint.js`):
  - `examples/loop/workflow.md` with `paths: { dod: loop/DOD.md }` and an existing
    `examples/loop/DOD.md` → `craft-manifest: …/workflow.md valid.`, **exit 0**. (The linter's
    `ROOT = dirname(dirname(manifest))` rule resolves `loop/DOD.md` against `examples/loop/DOD.md` —
    same mechanism as `examples/dod-artifact/`.)
  - Control — a bespoke `loop:` key → `INVALID manifest … - unknown top-level key: loop`, **exit 2**
    (proves the loop is *outside* craft; no engine key exists for it).
  - Control — `paths.dod` pointing at a missing file → `INVALID … paths.dod references missing file`,
    **exit 2** (the file-ref check is live; the sample DOD.md must actually exist).
- **Doc-link integrity (MECHANICAL, light).** `examples/README.md` and `docs/GUIDE-customizing.md`
  reference `examples/loop/`; assert the linked dir exists and the references resolve. (Matches the
  repo's existing doc-link conventions; a grep assertion suffices — there is no heavier link-checker
  in the repo.)
- **No-provenance-leak (MECHANICAL, core contract).** `P21` / `ADR` refs appear only in this design
  doc, the ADRs, and GUIDE/README prose; **never** in the shipped `examples/loop/workflow.md` or
  `examples/loop/DOD.md` (assert no `P21` / `ADR` token in the shipped manifest or sample DoD).

The substrate gate is untouched: nothing under `engine/`, `pipeline/`, `contracts/`, `skills/`,
`agents/`, `scripts/` changes. There is no `scripts/ci.sh` edit and no shellcheck discussion — the
deliverable is not a script, so the DC-7 `scripts/`-constraint tension from the first cut is moot
(ADR-115 consequence).

## Out of scope

- **Any engine change** — no `loop:` manifest key, no engine-native iteration, no new invariant, no
  edit under `engine/`, `pipeline/`, `contracts/`, `skills/`, `agents/`, `scripts/` (ADR-111).
- **A shipped shell script** — no `loop.sh`, no `classify()` function, no bats classifier smoke, no
  `test/fixtures/loop/`, no shellcheck/`scripts/ci.sh` widening. The recipe is documentation +
  a lint-clean manifest (ADR-115).
- **Threading a new PRD/brief into `craft-pi` per pass** — the bin ignores argv (pinned); a per-pass
  input seam would be an engine change. The loop relies on stable committed inputs (ADR-114).
- **Making the headless `craft-pi` loop see the positive verdict** — `craft-pi` prints no run record
  (pinned); the headless contrast reads exit code + best-effort stderr only, with the limitation
  stated (ADR-113).
- **A general orchestration framework** (parallel passes, fan-out, multi-repo loops) — the recipe is
  one composable single-change loop; richer harnesses are the operator's to compose on top.
- **Re-deriving doneness** — the loop reads the P20 `validation`-phase verdict; it does not re-run
  gates, mutation, or re-parse acceptance criteria itself (that would duplicate and could diverge from
  the authoritative verdict) (ADR-114).
- **Auto-merge / auto-PR loop** — `propose`/`integrate` semantics stay craft's; the loop stops at
  "DoD met" and leaves shipping to the operator / craft's own delivery phases.
