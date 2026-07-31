# 317 — A `modified` hook re-trusts automatically, gated on the guard-script identity

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

`hooks/list` reports `trustStatus ∈ { managed, untrusted, trusted, modified }`. `modified` means a
hook was trusted once and its definition has since changed. The re-probe pinned what the hash
covers: changing the hook's `command` changed `currentHash`, so the hash covers the hook
**definition** in `config.toml` — not the contents of the guard script the command points at.

That distinction bounds what re-trusting can promise. Automatic re-trust does not silently accept a
changed guard script, because the guard script's contents were never in the hash to begin with; the
protection that matters is that the helper only ever trusts a hook whose command names craft's own
guard.

## Options considered

1. **Automatic, after verifying the hook's `command` still names craft's own guard script** *(recommended)* — pros: the realistic cause of `modified` is craft updating its own `hooks.json`, so upgrades stay frictionless; a foreign hook is never trusted, because the command check runs first / cons: a craft-authored definition change regains trust without a human looking at it.
2. **Require an explicit `--retrust` flag** — pros: a human is in the loop on every definition change / cons: costs a flag and a README line, and puts that human in the loop mostly for craft's own upgrades.
3. **Refuse and tell the operator to re-trust interactively** — pros: strictest / cons: interactive trust is the exact thing this change exists to escape.

## Decision

**Ratified by the user, as recommended.** `modified` re-trusts automatically, and only after the
helper has confirmed the hook's command names craft's own guard script.

## Consequences

The command-identity check is load-bearing, not cosmetic: it is the only thing standing between
automatic re-trust and trusting an arbitrary hook. It must match both the raw
`node ${CRAFT_ROOT:-…}/adapters/codex/hooks/craft-guard.js` form and a fully shell-expanded absolute
form, because whether `hooks/list` reports the command raw or expanded was **not** pinned by the
re-probe. Both variants get a unit test; matching only the variant the author imagined is the same
unit-green/live-broken failure this binding already paid for once.
