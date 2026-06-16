# 012 — Manifest shape-validation folds into the Node core

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-P3-orchestrator-rewire.md · **Resolves:** the ADR-002 "P2 fold (deferred to P3)" follow-up

## Context

ADR-002 left open whether `manifest-lint`'s shape validation should migrate from Bash into the
portable Node core for one deterministic validation home, deferring the call to P3 — the phase
that removes `PROTECTED` and already parses manifests in the resolver. P3 also has to add new
keys (ADR-010) and reject the legacy per-phase skip (ADR-011); doing those edits in the bash
subset-parser, then migrating later, is duplicated work.

## Options considered

1. **Fold into the Node core now** — export `validateManifest(manifest, opts)` (pure) from
   `engine/src/manifest.js`; a new `engine/bin/manifest-lint.js` CLI does the file I/O (read the
   `.md`, extract frontmatter, dangling-file checks) and prints today's messages/exit codes;
   `scripts/manifest-lint.sh` becomes a thin wrapper delegating to the bin so every caller
   (`run/SKILL.md`, the bats suite, `ci.sh`) is unchanged. *(user choice — overrides the
   designer's "defer" recommendation)*
2. **Keep `manifest-lint.sh` bash** — apply ADR-010/011 edits in the subset parser; fold later.
   *(designer recommended)*
3. **Replace with a Node script, repoint all callers** — no bash wrapper.

## Decision

Manifest shape-validation **moves into the Node core**. `validateManifest` is a pure function
(shape/known-keys/phase-names/legacy-skip — file existence injected via `opts` or checked at the
CLI boundary so the core stays I/O-free, mirroring `resolvePipeline`). The CLI binary owns I/O;
`scripts/manifest-lint.sh` stays the stable entry point as a thin delegating wrapper. The
behavior-preserving migration is guarded by the slice-2 `test/manifest-lint.bats` characterization
suite — identical exit codes and message substrings for every fixture except the deliberate
ADR-011 re-baseline.

## Consequences

One deterministic validation home (Node), aligned with the resolver — ADR-002's follow-up is
closed. **The P2 slice-11 yq + sed/awk subset-parser dual backend is superseded** by `js-yaml`:
the backend-equivalence (yq-present vs yq-absent) bats tests lose their meaning and are retired;
the behavioral (exit-code + message) tests stay, now pointed at the node-backed wrapper. Phase
*name* aliasing remains P4 — `validateManifest` keeps the old phase-name set to hold the bats
suite green and the P3/P4 boundary clean. Adds a CLI binary + a pure module; removes ~250 lines
of bash parsing.
