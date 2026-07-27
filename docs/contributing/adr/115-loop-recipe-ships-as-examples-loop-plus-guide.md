# 115 — The loop recipe ships as an `examples/loop/` dir plus a GUIDE section, with no shell script

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P21-loop-recipe.md · **Supersedes/Refines:** none

## Context

The recipe needs a home (the design's DC-1) and a *form* (DC-7). The repo convention pairs a
runnable `examples/<point>/` dir (gated against rot by `examples-lint`, which globs
`examples/*/workflow.md` and asserts each is a lint-clean manifest) with prose in
`docs/GUIDE-customizing.md` and an index row in `examples/README.md`. The design's first cut shipped
a `loop.sh` shell script verified by a bats classifier smoke; the decisions conversation rejected
shipping a script: "it should not be a script, this is just an example of slash loop with Claude
Code."

## Options considered

- **Location** — (a) `examples/loop/` dir only; (b) `docs/GUIDE-loop.md` only; (c) **both** — an
  `examples/loop/` dir plus a GUIDE section. *(chosen)* (a) hides the "why"; (b) leaves the example
  uncatalogued and un-gated.
- **Form** — (a) ship a `loop.sh` shell script + bats classifier smoke; (b) **no script** — the
  recipe is a documented use of Claude Code's `/loop` (canonical) with the craft-pi pattern as prose
  contrast. *(chosen — user judgment)* (a) ships shell to lint/test for a docs feature and was
  explicitly ruled out.

## Decision

The recipe ships as **both** an `examples/loop/` directory **and** a `docs/GUIDE-customizing.md`
section, with **no shell script**:

- `examples/loop/workflow.md` — a lint-clean craft manifest using **recognized keys only** (e.g.
  `paths: { dod: loop/DOD.md }`); it is a normal per-pass config (the loop is *outside* craft, so
  there is no `loop:` key — adding one would be an engine change). This file satisfies the existing
  `examples-lint` gate and makes the dir a catalog example.
- `examples/loop/DOD.md` — a small sample DoD the manifest's `paths.dod` points at, so the example
  is self-resolving (mirrors `examples/dod-artifact/`).
- `examples/loop/README.md` — the prose home: the exact `/loop /craft:run` canonical recipe and the
  stop condition the model applies (ADR-112/114), the headless craft-pi contrast (ADR-113), and the
  engine-native-loop rejection rationale (ADR-111).
- A **"Running craft in a loop"** section in `docs/GUIDE-customizing.md` and a **use-pattern row** in
  `examples/README.md` (distinct from the injection-point table — the loop injects nothing into
  craft).

No `loop.sh`, no bats classifier smoke. Verification is the existing `examples-lint` gate over the
manifest plus light doc-link integrity; the substrate gate (`scripts/`, `engine/`, …) is untouched.

## Consequences

- Zero shell to lint or test, and zero `scripts/ci.sh` edit — the DC-7 `scripts/`-constraint tension
  is moot once the deliverable is not a script.
- The example is catalog-visible and protected from rot by `examples-lint` (the manifest must stay
  lint-clean); the GUIDE carries the mental model and the contrast.
- The recipe is a *use-pattern*, explicitly marked distinct from the in-manifest injection points —
  it injects nothing new into craft, it composes a Claude Code primitive over an existing entry point.
- Provenance refs (P21/ADR numbers) may appear in the design doc, ADRs, and GUIDE prose, but the
  shipped `workflow.md`/`DOD.md` stay clean of them.
