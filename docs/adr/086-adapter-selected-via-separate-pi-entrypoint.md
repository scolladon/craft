# 086 — Adapter selected via a separate Pi entrypoint, not a manifest key

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
With a second adapter present, something must select which adapter drives a run. The hard
constraint (R-sc1) is that the default Claude run stays byte-identical; a selection mechanism
must not perturb the `/craft:run` path.

## Options
1. **Separate entrypoint per adapter** — Claude = `/craft:run`; Pi = its own bin. pros: Claude path byte-identical, no manifest schema change, most reversible / cons: two entrypoints. *(designer's recommendation, chosen)*
2. **Manifest key (`adapter: claude|pi`, default `claude`)** — pros: one entrypoint / cons: adds schema surface now, risks touching the default-run resolution path.
3. **Env var** — pros: zero schema / cons: implicit, least discoverable.

## Decision
For the PoC, the Pi adapter ships its own entrypoint (a `adapters/pi/` bin). The Claude
slash-command path is unchanged. A manifest-level `adapter:` key is revisited only when a
second-or-later adapter graduates past PoC.

## Consequences
- R-sc1 is protected by construction: no manifest schema change, no edit to the resolution the
  Claude run walks.
- Selection is explicit and reversible; deleting `adapters/pi/` fully removes the Pi path.
- A future multi-adapter selection key remains open (not foreclosed).
