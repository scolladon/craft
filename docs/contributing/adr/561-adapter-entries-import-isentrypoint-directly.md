---
subjects:
  - adapters/codex/bin/trust-hook.js
  - adapters/pi/src/cli.js
---
# 561 — Adapter entry points import `isEntryPoint` from `engine/src/cli-io.js` directly

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/adapter-entry-symlink-guard.md · **Supersedes/Refines:** refines ADR-559

## Context

`adapters/codex/bin/trust-hook.js` and `adapters/pi/src/cli.js` compare `process.argv[1]` with `fileURLToPath(import.meta.url)`, so each exits 0 with no output when reached through a link. `isEntryPoint` already lives in `engine/src/cli-io.js` (ADR-556). A direct import makes two unsupported layouts fail with exit 1 instead of today's behaviour: an adapter copied without `engine/`, and `--preserve-symlinks-main` through a link to the adapter dir alone. Both stay loud.

## Options considered

1. **Direct static import `../../../engine/src/cli-io.js`** *(recommended)* — pros: same shape as every existing adapter→engine edge (`adapters/codex/src/git-guard-adapter.js`, `adapters/pi/src/run.js`) / cons: the two unsupported layouts above exit 1 rather than 2.
2. **Indirection** (a pi re-export module; a guarded `await import()` in codex mapping a load failure to the refusal exit) — pros: keeps today's exit codes in those layouts / cons: new module and error mapping in files outside the mutation scope, for layouts no install produces.

## Decision

Adopted-as-recommended (no user judgment): option 1. ADR-559 anticipated it ("the follow-up only needs to swap the import"). An adapter entry point decides it is the entry with `isEntryPoint(import.meta.url, process.argv[1])`, imported statically from `engine/src/cli-io.js`.

## Consequences

Both entries need the full checkout, which `run.js` and `resolveCraftRoot` already required. `engine/stryker.conf.json` is unchanged.
