# 235 — CRAFT_ROOT is exported by a self-locating pi extension factory

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-217 (CRAFT_ROOT shim over plugin root)

## Context

The craft skill bodies invoke `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/*` (ADR-217's shim). Under a `pi install`, the engine lives at the package root, not the target cwd, so the pi binding must export `CRAFT_ROOT` from its own launch context. Live-pinning confirmed (design §D2 row 21) an extension factory runs Node before `session_start` and can set `process.env.CRAFT_ROOT`; the extension self-locates via its module path (`adapters/pi` → repo root).

## Options considered

1. **Extension factory self-locates (module path) + sets `process.env.CRAFT_ROOT`; the bash tool inherits it** *(designer recommendation)* — pros: robust under `pi install` (engine lives at package root); the shim is behaviour-preserving for Claude. Cons: end-to-end bash-tool env inheritance is not yet live-confirmed.
2. **Launch-context shell `export CRAFT_ROOT` before `pi`** — cons: fragile; relies on the invoker's shell, not the installed package.
3. **A settings/manifest knob** — cons: a static path duplicated per checkout.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `adapters/pi/src/craft-root.js` is a pure `(moduleUrl) → absolute, existing, containment-checked root` resolver (mirroring `engine.js`'s `join(__dir,'..','..','..')`), unit-tested. The `craft-guard` extension factory calls it and sets `process.env.CRAFT_ROOT` before `session_start`; the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim (already on the surface, behaviour-preserving for Claude) resolves it in skill bodies.

## Consequences

- The resolver is a pure unit-tested seam (rejects a root that escapes containment); the `${CRAFT_ROOT:-…}` default-expansion is asserted at the bash layer.
- Whether pi's bash tool inherits the exported env end-to-end is the one DEFERRED export item (design §D2 row 23), confirmed in the live smoke.
- No engine touch: the shim already exists on the skill/hook surface.
