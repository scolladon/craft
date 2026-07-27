# 246 — Copilot `CRAFT_ROOT` resolution: self-locate from `import.meta.url`

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Mirrors ADR-235 (pi self-locate)

## Context

The engine addresses its own root through the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim. Claude supplies `CLAUDE_PLUGIN_ROOT` from its plugin launch context; pi self-locates (ADR-235). The probe found that Copilot exposes **no plugin-root environment variable** of its own. `COPILOT_HOME` exists but points at Copilot's *config/state* directory (default `~/.copilot`) and is unrelated to the craft repo root.

## Options considered

1. **Self-locate from `import.meta.url`, mirroring `resolveCraftRoot`** *(designer recommendation)* — pros: survives an arbitrary launch cwd; matches the pi precedent; fail-loud on wrong depth. Cons: up-level count depends on final file placement and must be asserted by test.
2. **Require the user to export `CRAFT_ROOT`** — cons: a silent-misconfiguration trap.
3. **Derive from `COPILOT_HOME`** — cons: factually wrong; that is Copilot's config dir, not the craft root.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `adapters/copilot/src/craft-root.js` mirrors pi's `resolveCraftRoot`: self-locate from `import.meta.url`, up-walk to the repo root, and **assert** the resolved root exists and contains `engine/bin`, throwing on failure. A non-`file://` module URL throws. The binding exports `CRAFT_ROOT` from its own launch context — for Copilot that is the hook command's environment plus the `config.template.json` fragment. The up-level count is **asserted by test from the real file location**, never assumed.

## Consequences

- The binding works from any launch cwd with no user-side environment setup.
- Moving `craft-root.js` between directories breaks a test rather than silently resolving to a wrong root.
- `COPILOT_HOME` is documented as explicitly *not* the craft root, so the confusion is not re-derived.
