---
subjects:
  - adapters/codex/README.md
  - adapters/codex/.claude-plugin/marketplace.json
  - adapters/codex/test/native-surface.test.js
  - docs/contributing/specs/execution.md
supersedes:
  - adr: "252"
    scope: "the local marketplace as the only route that carries hooks, skills and agents as one installable unit"
  - adr: "614"
    scope: "the craft marketplace entry stays declared and native-surface.test.js pins both entries"
---
# 635 — The codex marketplace carries only the `craft-run` entrypoint

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-marketplace-entry-adr-252.md · **Supersedes/Refines:** supersedes ADR-252, ADR-614

## Context

ADR-252 chose the local file-backed marketplace as codex's load path because it was "the only one that carries `hooks` + `skills` + agents as one installable unit". ADR-614 corrected the shared-skills half of that claim and adopted the `$CODEX_HOME/skills` symlinks, but kept the `craft` marketplace entry declared, with `native-surface.test.js` pinning both entries. On codex 0.145.0 and 0.162.1 (the installed version), `codex plugin add` copies a plugin into its cache and rewrites the manifest to `{description, name}`: `hooks` and `skills` are both dropped (`docs/contributing/specs/codex-poc-record.md` row 1 and the 0.162.1 plugin-install row). The plugin-manifest shape has no `agents` field. So only `craft-run`, whose files sit inside the `craft-codex` plugin directory, arrives through the marketplace. The `craft` entry's only payload is its out-of-tree `skills` reference, so installing it loads nothing, and the README still tells users to install it.

## Options considered

1. **Retire the `craft` entry and record both corrections in one ADR** *(recommended)* — pros: both claims describe the same fact, that the marketplace carries `craft-run` only; the README stops prescribing a no-op install / cons: a future re-probe of by-reference loading needs a throwaway entry.
2. **Retire the entry, but record it in a second ADR superseding ADR-614** — pros: one ADR per superseded record / cons: splits one fact across two records and adds one to the count.
3. **Keep the entry declared, with the README saying installing it loads nothing** — pros: no source or test change / cons: ships and pins an install step known to do nothing.

## Decision

The user ratified option 1, with the narrow scope over ADR-252. The local marketplace declares one entry, `craft-codex`, and delivers the `craft-run` entrypoint only. The guard hook is wired by hand from `config.template.toml` into `$CODEX_HOME/config.toml`. The marketplace does not carry the nine role agents; how codex loads them is unprobed, and this record claims nothing beyond that. The 19 shared skills load through the `$CODEX_HOME/skills` symlinks. A test pins every `codex plugin add` selector in the README to an entry `marketplace.json` declares.

Superseded from ADR-252: the local marketplace as the only route that carries hooks, skills and agents as one installable unit.

Carried forward from ADR-252: `adapters/codex/` is the in-place home; the local file-backed marketplace is the install path for `craft-run`; no npm or registry package is published.

Superseded from ADR-614: the `craft` marketplace entry stays declared and `native-surface.test.js` pins both entries.

Carried forward from ADR-614: the 19 shared skills load through `$CODEX_HOME/skills` symlinks on every install; no shared skill body is copied into the adapter, and `adapters/codex/skills/` must not exist (test-asserted).

## Consequences

- `adapters/codex/plugins/craft/` is deleted, the README installs `craft-codex` only, and `native-surface.test.js` pins the single entry.
- Re-measuring by-reference loading on a later codex (ADR-614's revisit clause) builds a throwaway entry with an out-of-tree `skills` reference in the probe's throwaway environment. None ships.
- How codex loads the nine role agents stays unprobed.
- `docs/contributing/specs/execution.md` states what the marketplace actually carries.
