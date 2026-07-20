# 245 — Copilot telemetry: build `collect` now, against the OTel file exporter

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** none

## Context

The telemetry port (`docs/adapters/telemetry.md`, `subjects: ['engine/src/observability/**']`) defines `collect(opts, deps) → UsageEvent[]`, with `aggregate`/`serializeReport` reused unchanged and the `SOURCES` / `DEFAULT_READ_ROOTS` seams already generic. Whether to build the Copilot binding now or defer it depended on whether a token source exists at all.

The probe found a non-obvious answer: **`--output-format json` carries no token counts**. Its `result.usage` is `{ premiumRequests, totalApiDurationMs, sessionDurationMs, codeChanges }`. The SQLite `session-store.db` has **no token columns** in any table. Tokens live only in **OpenTelemetry**, enabled by `COPILOT_OTEL_FILE_EXPORTER_PATH=<path>`, which writes JSON-lines following the OTel GenAI Semantic Conventions (`gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`).

## Options considered

1. **Build `collect` + `--source copilot` now, against the OTel file exporter** *(designer recommendation)* — pros: attribute names are pinned; the wiring seams are already generic so the change is additive; `telemetry.md` declares this scope as its subject, so this change owns the surface. Cons: exact envelope under GitHub-routed models awaits the smoke (D3).
2. **Defer entirely** — cons: leaves a declared port unbound and the intention page stale.
3. **Ship a stub returning `[]`** — cons: dead code that silently reports zero cost.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `engine/src/observability/adapters/copilot/telemetry.js` implements `collect` against the **OTel JSON-lines file exporter**, not `--output-format json` and not `session-store.db`. Wiring is the existing generic seam: `SOURCES.copilot` plus a `DEFAULT_READ_ROOTS.copilot` thunk. Per the port contract the adapter **never throws** — malformed lines are skipped, partial data yields a partial array, and non-finite token values coerce to `0`.

One shape mismatch is settled here: `DEFAULT_READ_ROOTS` entries are *directories*, but `COPILOT_OTEL_FILE_EXPORTER_PATH` is a *single file path*. The thunk resolves the env var to its `dirname` (falling back to `~/.copilot/otel`), keeping the env var the single source of truth without changing the port's directory contract. The thunk re-reads the environment per invocation and is never frozen at module load.

## Consequences

- A naive parser over `--output-format json` would silently report zero cost; the record documents this explicitly so nobody rebuilds it against the wrong source.
- `usage-mine` gains `--source copilot` additively; no existing source changes.
- D3 (real-provider envelope) and D7 (subagent `role` attribution) remain deferred to the on-demand smoke.
