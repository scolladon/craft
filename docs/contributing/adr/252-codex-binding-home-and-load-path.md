# 252 — Codex binding home and load path

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Applies ADR-085 (adapters live in-place); parallels ADR-241 (copilot adapter home in-place)

## Context

ADR-085 already settles *where* adapters live — in-place under `adapters/<binding>/`, not published packages. What is open for Codex is *how a user actually loads it*. The plugin manifest schema is CONFIRMED (`{name, version, description, author, skills, hooks, mcpServers, apps, interface{…}}`, all path-valued), `codex plugin marketplace add` supports a local file-backed marketplace (`"source": "local"`), and `codex plugin add` installs from it — CONFIRMED as a surface, DEFERRED as an executed install. Row 9a — whether a manifest's `skills` path resolves craft's own top-level `skills/` tree end-to-end — is the PoC record's highest-value open row.

## Options considered

1. **In-place `adapters/codex/`, loaded via a local file-backed marketplace** (`codex plugin marketplace add <local>` → `codex plugin add`), `"source": "local"` *(chosen)* — pros: the marketplace is Codex's first-class discoverable path and the only one that carries `hooks` + `skills` + agents as one installable unit; matches ADR-085's in-place placement. Cons: depends on row 9a resolving, which is not yet proven end-to-end.
2. **In-place, loaded by symlinking into `$CODEX_HOME/skills/`** + a `config.toml` hook path — no marketplace, no plugin manifest — pros: `$CODEX_HOME/skills/` is a CONFIRMED load location, so this route never depends on row 9a. Cons: no single installable unit; hooks and skills wire up separately.
3. **Published npm/registry package** — cons: contradicts ADR-085 outright, and the repo has no remote to publish to.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `adapters/codex/` is the binding's home; it loads through a local file-backed marketplace declaring `"source": "local"`, installed with `codex plugin marketplace add` then `codex plugin add`. Option 2 is retained and documented in `adapters/codex/README.md` as the named fallback — to be used only if row 9a's by-reference skill loading fails to resolve end-to-end, a documented contingency rather than a silent rediscovery.

## Consequences

- The chosen launch contract depends on a marketplace mechanism whose end-to-end skill resolution is still DEFERRED (row 9a); closing that row is the highest-value probe for the implementation phase.
- `adapters/codex/README.md` carries both routes: the chosen marketplace install and the documented symlink fallback.
- No `adapters/codex` npm/registry package is ever published; ADR-085 continues to hold uniformly across all five bindings.
