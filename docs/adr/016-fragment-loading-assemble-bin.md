# 016 — Fragment loading: the `contract-assemble` bin + `contracts-lint`

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · docs/DESIGN-P5-contract-injection.md · **Supersedes/Refines:** refines ADR-002/003

## Context

`assembleContract` is a pure, I/O-free Node function (ADR-002): it takes already-loaded
`fragments`, never reads disk. The orchestrator is the markdown session, which reaches the engine
only through `node engine/bin/*` CLIs. The `Resolution` JSON is golden-frozen (SC1), so contract
assembly **cannot** fold into `pipeline-resolve` without moving the golden. Something impure must
read `contracts/*.md` and feed `fragments` to the pure assembler.

## Options considered

1. **Dedicated `contract-assemble.js` bin** invoked per phase by the walk (reads `contracts/` +
   the phase descriptor + manifest, `--inline` flag, calls `assembleContract`, prints the block);
   plus a `contracts-lint.js` guarding fragment presence/shape, wired into `ci.sh`. *(chosen)*
2. **Same bin, defer the lint** — smaller surface / the store ships unguarded until a later port.
3. **Fold assembly into `pipeline-resolve`** — one fewer CLI / moves the SC1 golden and couples the
   pure resolver to disk I/O (breaks ADR-002). Rejected.

## Decision

Contract assembly is exposed via **`engine/bin/contract-assemble.js`** — the impure CLI shell that
does the file reads; the pure core (`assembleContract`) stays I/O-free. The walk
(`run/SKILL.md` step 3) calls it once per phase. **`engine/bin/contracts-lint.js`** guards the
store and runs in `ci.sh`: all 7 fragments (`core` + 6 bundles) present and non-empty; every
fragment basename ∈ `BUNDLE_VOCAB`; no fragment contains the engine-derived `retrieval` string
(the engine derives it — ADR-003 invariant). Production fragments live at repo-root **`contracts/`**;
the mechanism unit tests keep their minimal `engine/test/fixtures/contracts/` stubs (content-
independent assembly tests).

## Consequences

One assembly home, swap-safe; `Resolution` stays byte-identical (SC1 green); the store is shape-
guarded every commit. The walk pays one deterministic CLI call per phase. `ci.sh` gains a
`contracts-lint` line (the part that adds the binary appends it, per the ci.sh convention).
