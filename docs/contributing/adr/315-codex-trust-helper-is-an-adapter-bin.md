# 315 — The codex trust helper is a node bin under the adapter

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

codex 0.145.0 exposes a scriptable hook-trust path: `hooks/list` over `codex app-server` returns
each hook's `key` and `currentHash`, and writing `[hooks.state."<key>"] trusted_hash = "<hash>"`
into `$CODEX_HOME/config.toml` flips the hook to trusted. Delivering that path needs an entry point,
and no adapter in this repo has ever carried a `bin/` directory.

The work is JSON-RPC framing over a spawned child, response selection by id across an interleaved
stream, and TOML quoted-key escaping — and it must be unit-testable without spawning real `codex`.

## Options considered

1. **`adapters/codex/bin/trust-hook.js` over pure `adapters/codex/src/` modules with injected deps** *(recommended)* — pros: matches the repo's thin-bin-over-pure-main pattern; keeps a vendor-specific protocol client inside the binding that owns it; the only shape that satisfies "no test spawns real codex" cleanly / cons: creates the first adapter `bin/`, a precedent the other six bindings would inherit.
2. **`engine/bin/` + `engine/src/`** — pros: no new convention; already inside the Stryker `mutate[]` root / cons: puts a codex-specific JSON-RPC client and `config.toml` writer in the vendor-neutral engine core.
3. **`scripts/codex-trust-hook.sh`** — pros: covered by the existing `ci.sh` shellcheck glob / cons: JSON-RPC framing and TOML string escaping are what shell does worst; no injected-dep unit seams; no mutation coverage.

## Decision

**Ratified by the user, as recommended.** The helper ships as `adapters/codex/bin/trust-hook.js`,
a thin shim over pure `adapters/codex/src/hook-trust.js` and `adapters/codex/src/config-toml-trust.js`.

## Consequences

Adapters may now carry `bin/` directories; the other six bindings inherit this as the shape to
follow when they need an entry point. `ci.sh` shellcheck does not cover `adapters/**`, which is
part of why a shell script was rejected rather than merely disfavoured. The two pure modules join
`engine/stryker.conf.json` `mutate[]` with their tests added to `tap.testFiles` in the same commit,
because they gate whether the guard enforces at all.
