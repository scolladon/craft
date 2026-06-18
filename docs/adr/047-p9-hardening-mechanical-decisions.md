# 047 — P9-hardening mechanical decisions (consolidated)

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none

## Context

Beyond the load-bearing forks (ADRs 041–046), the design surfaced eleven lower-stakes choices, each
with a clear minimal-surface, house-idiom recommendation and no real alternative cost. The user
ratified all eleven as recommended in a single decision. They are recorded here together rather than
as eleven separate ADRs — matching the P9 precedent of pre-chewing construction details in the design
rather than minting an ADR per detail.

## Options considered

For each, the design table (`docs/DESIGN-P9-hardening.md` §Decision candidates) carries the ≤3
alternatives and the recommendation. The user adopted every recommendation; the alternatives are not
re-listed here.

## Decision

The following are ratified as recommended:

- **DC-1a** — wire the `roleExists` probe in the bin only; the walk's existing `ok:false` row covers
  role-not-found (no walk edit).
- **DC-1b** — the bin derives the plugin root from its own location
  (`join(dirname(fileURLToPath(import.meta.url)), '..', '..')`, the `contract-assemble.js` idiom).
- **DC-1c** — craft-native probe = filesystem existence of `agents/<role>.md` (self-maintaining;
  external `my:`/`acme:` refs stay permissive — P14 territory).
- **DC-2a** — Stryker `@stryker-mutator/core@8.7.1` (Node `>=18`-safe; 9.x would force `>=20`).
- **DC-2b** — `@stryker-mutator/tap-runner@8.7.1` (native `node --test`/TAP integration).
- **DC-2c** — the slow mutation run lives in an on-demand `engine/package.json` script the validation
  phase invokes; NOT in the always-on `ci.sh`.
- **DC-4** — `worktree-setup.sh` gains a bounded one-level-deep nested-lockfile fallback scan
  (zero-config; covers `engine/package-lock.json`).
- **DC-5a** — the explicit `node --test 'test/**/*.test.js'` glob (see ADR-046).
- **DC-6** — the `decisions` skill gains a step-2.5 cross-candidate interaction check before ADR
  authoring (catch a ratified choice whose rationale another voids).
- **DC-7** — keep the `Input:` line as the single canonical `$ARGUMENTS` echo in `run/SKILL.md`;
  step 0a refers to "the input".
- **DC-9** — `contract-assemble.js` adopts the shared `parseManifestContent` from `frontmatter.js`
  (the other two bins already use it; the bug was this bin's divergence).

## Consequences

Each is internal/minimal-surface; none touches the 7-export engine surface or `pipeline/default.yml`
descriptors. The slice-level pre-chewed context for each lives in the design's slice table, ready for
the plan phase.
