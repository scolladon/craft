# 316 — The codex trust helper trusts, and does nothing else

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

The helper runs against a real `$CODEX_HOME`. Everything it does, it does inside the operator's
own configuration, so its authority is the decision — not its convenience. The binding's full
install also involves `plugin marketplace add`, two `plugin add` calls, a 19-entry skill symlink
farm, and merging `config.template.toml`.

## Options considered

1. **Trust only; README keeps the remaining install steps as documented manual steps** *(recommended)* — pros: smallest authority that closes the limitation; one write, one table, one key / cons: the operator still runs several documented commands by hand.
2. **A full `install.js`** — pros: one command sets the whole binding up / cons: takes on symlink-writing authority inside `$CODEX_HOME` and spawns `codex` for several subcommands; the marketplace-path defect it would absorb is a one-line doc fix.
3. **Fold trust into a launch precondition so every run self-heals** — pros: trust can never be out of sync / cons: every launch pays an app-server spawn, and granting trust becomes implicit and unreviewed.

## Decision

**Ratified by the user, as recommended.** The helper trusts craft's own guard hook and does
nothing else.

## Consequences

The helper writes exactly one TOML table into `config.toml` and never creates symlinks, installs
plugins, or registers marketplaces. Granting trust stays an explicit operator act. The skill
symlink fallback and the marketplace registration remain documented manual steps in the adapter
README — which is also where the `./adapters/codex` source-form fix lands.
