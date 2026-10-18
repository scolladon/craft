---
subjects:
  - adapters/codex/README.md
  - adapters/codex/.claude-plugin/marketplace.json
  - adapters/codex/plugins/craft/plugin.json
  - adapters/codex/test/native-surface.test.js
supersedes:
  - adr: "253"
    scope: "the shared skills load by reference through the craft marketplace entry's skills field, with the $CODEX_HOME/skills symlinks as a fallback only"
  - adr: "252"
    scope: "the $CODEX_HOME/skills symlink route as a contingency fallback used only if by-reference loading fails"
---
# 614 — Codex loads the shared craft skills through `$CODEX_HOME/skills` symlinks

- **Status:** superseded by ADR-635
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/supersede-adr-253-symlink-route.md · **Supersedes/Refines:** supersedes ADR-253, ADR-252

> **Superseded by ADR-635** for the kept `craft` marketplace entry: it is retired, and the
> marketplace declares `craft-codex` only.

## Context

ADR-253 chose to load the 19 shared skills by reference, through the `craft` marketplace entry's `skills` field, and kept the `$CODEX_HOME/skills` symlink farm as a fallback. ADR-252 framed the same symlinks as a contingency used only if by-reference loading failed. It failed: `codex plugin add` copies a plugin into `$CODEX_HOME/plugins/cache/…` and drops the entry's out-of-tree `../../../../skills` reference. Measured with the app-server's skills-listing method on codex 0.145.0 and again on 0.162.1, 0 of 19 shared skills load by reference and 19 of 19 load through the symlinks (`docs/contributing/specs/codex-poc-record.md` row 1). `adapters/codex/README.md` already prescribes the symlinks on every install. No ADR said so.

## Options considered

1. **Symlink every shared skill into `$CODEX_HOME/skills` on every install** *(recommended)* — pros: the only route measured to load all 19; no copy, so no hygiene exemptions / cons: one manual step per shared skill per install.
2. **Keep by-reference as the decision and wait for codex to stop dropping the reference** — pros: no record churn / cons: the accepted record stays false for every reader until codex changes.
3. **Copy the shared skills into the plugin directory** — cons: refused by ADR-251; copies drift and force hygiene exemptions.

## Decision

The user ratified the scope: only the by-reference mechanism for the shared skills is superseded, and ADR-252's fallback framing goes with it. The 19 shared skills load through one `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` per skill, on every install. This is the working path, not a contingency. Of ADR-253's option 3, only the symlink farm for the shared skills is adopted. The plugin manifests stay, and the guard hook is wired by hand into `$CODEX_HOME/config.toml`, not through a standalone `hooks.json`.

Superseded from ADR-253: the shared skills load by reference through the `craft` marketplace entry's `skills` field, with the `$CODEX_HOME/skills` symlinks as a fallback only.

Carried forward from ADR-253: no shared skill body is ever copied into the adapter, and `adapters/codex/skills/` must not exist (test-asserted); the two-entry local marketplace stays, with `craft-codex` carrying the `craft-run` entrypoint and `craft` still declared.

Superseded from ADR-252: the `$CODEX_HOME/skills` symlink route as a contingency fallback used only if by-reference loading fails.

Carried forward from ADR-252: `adapters/codex/` is the in-place home; the local file-backed marketplace is the install path for what it still carries; no npm or registry package is published.

## Consequences

- `adapters/codex/README.md` already states this route; no adapter change follows.
- Installing the `craft` entry still loads no shared skill. It stays declared, and `native-surface.test.js` still pins both entries. Retiring it would be a source and test change with its own design.
- Codex dropping an out-of-tree `skills` reference is a codex limitation. If a later codex keeps the reference, revisit this decision against a fresh 0-of-19 / 19-of-19 measurement.
