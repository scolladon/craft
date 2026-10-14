---
subjects:
  - engine/src/cli-io.js
---
# 557 — `isEntryPoint` real-paths both argv[1] and the module path

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/bin-entry-symlink-guard.md · **Supersedes/Refines:** none

## Context

Node real-paths the main module's `import.meta.url` but keeps `process.argv[1]` as typed. The backlog proposed real-pathing argv[1] only. The design's pinned matrix (Node 18.20.8 to 26.11.0) shows that this variant fails under `--preserve-symlinks-main`, where today's guard passes.

## Options considered

1. **`realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))`** *(recommended)* — pros: the only variant that is true in all three entry rows and false in both import rows, on all seven Node versions / cons: one extra `realpath` call per bin start.
2. **`realpathSync(argv1) === fileURLToPath(moduleUrl)`** — cons: false under `--preserve-symlinks-main`, which is a regression.
3. **`import.meta.main`** — cons: `undefined` on Node 18 and 20, which `engines: ">=18"` admits, so bins would keep exiting 0 silently.

## Decision

Option 1, ratified by the user. Both sides are real-pathed before comparing. A missing or non-string argv[1] returns false before any `realpath` call, because `realpathSync(undefined)` resolves `<cwd>/undefined`.

## Consequences

The guard holds for symlinked directories, symlinked files, the macOS `/var` path, and `--preserve-symlinks-main`. If the `engines` floor rises to Node 22.18 or later, `import.meta.main` can be reconsidered.
