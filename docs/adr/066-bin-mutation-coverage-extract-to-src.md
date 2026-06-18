# 066 — Bin mutation coverage: extract bin logic to engine/src, keep the src mutate glob

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P13-nfr-hardening.md · **Supersedes/Refines:** none (DC-4 + DC-5 as recommended)

## Context

The six `engine/bin/*.js` are run-on-import scripts (top-level argv parse, `process.exit`,
`process.stdout.write`, no exported function) tested via `spawnSync(process.execPath, [bin, …])`.
A throwaway-`mktemp` Stryker probe (design §"Empirically-pinned matrix") pinned the cause: with
`coverageAnalysis: perTest` + tap-runner, a child process is opaque to the mutant tracker, so the
bin glue (argv parsing, `fileExists`/`roleExists` closures, usage/error-exit branches, stdout
shaping) reports as `[NoCoverage]`. Probe C also showed that mutating the bin *in place* drags the
`if (process.argv[1] === entrypoint)` guard and the `process.exit(main(...))` dispatch into the
mutate surface as **unkillable** survivors (an in-process import deliberately avoids the entrypoint
branch). Probe D showed extracting the logic to `engine/src/` keeps the mutate surface pure.

## Options considered

1. **Extract logic to `engine/src/<bin>-main.js` (chosen)** — pro: pure mutate surface, reuses the
   existing src↔bin split, bin shrinks to a one-line guard / con: one new module per converted bin.
2. **Export `main(argv, io)` in place in `engine/bin/`** — pro: fewer files / con: probe C — drags the
   entrypoint guard + `process.exit` dispatch in as unkillable survivors.
3. **In-process import shim under captured `process.exit`/stdout** — con: fragile monkey-patching;
   still exercises the guard.

## Decision

Each converted bin's logic moves into an `engine/src/<bin>-main.js` module exporting a callable
`main(argv, io)` where `io` is a `{ stdout, stderr }`-shaped object and the return value is the exit
code (pure of `process.*` side-effects, importable in-process). The bin becomes a thin wrapper:
`import { main }` + the entrypoint guard that calls `process.exit(main(process.argv.slice(2), {
stdout: process.stdout, stderr: process.stderr }))`. The Stryker `mutate: ["engine/src/**/*.js"]`
glob is **kept unchanged** — the extracted modules are auto-covered; the bins stay excluded. Do
**not** widen `mutate` to `engine/bin/**` (probe C: re-imports the boilerplate survivors).

## Consequences

- The entrypoint guard + `process.exit` dispatch live in the bin (excluded from mutate); all testable
  logic lives in src (in mutate scope) and is killed/proved-equivalent by the validation phase.
- No `stryker.conf.json` change required (the glob already matches `engine/src/**`).
- Conversion order is per-bin; a bin is converted only when its glue carries logic worth covering.
  `scripts/ci.sh`'s append-only convention applies if any new entrypoint is referenced.
- Test surface change is governed by ADR-067.
