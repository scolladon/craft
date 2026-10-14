---
subjects:
  - engine/src/cli-io.js
  - engine/package.json
supersedes:
  - adr: "557"
    scope: "the real-path comparison of argv[1] and the module path"
  - adr: "558"
    scope: "ENOENT on argv[1] maps to not-the-entry-point"
---
# 564 — The entry guard requires `import.meta.main` and throws without it

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** supersedes ADR-557, ADR-558

## Context

The real-path comparison re-reads argv[1] after Node loaded the entry. A link repointed or unlinked in that window turns the guard false, so the entry exits 0 silently; for `trust-hook.js --check`, exit 0 means "trusted" (reproduced on Node 18 through 26). `import.meta.main` is immune to the swap, but it is defined only on `^22.18.0 || >=24.2.0`; `engines: ">=18"` admits Node versions where it is undefined. On those versions nothing inside the module closes the repoint swap: an ESM entry has no other record of itself.

## Options considered

1. **Keep `>=18` with the real-path fallback** *(recommended by the design)* — pros: no support-floor change / cons: the race stays open on every Node without `import.meta.main`.
2. **Declare `^22.18.0 || >=24.2.0`, keep the fallback** — cons: `engines` is advisory for a checkout-run tool, so nothing changes at runtime.
3. **Declare that floor and throw when `import.meta.main` is not a boolean, deleting the fallback** — pros: the only full closure; no fail-open path remains / cons: every entry exits 1 on Node versions `>=18` admits today.

## Decision

Option 3, ratified by the user against the design's recommendation. `engine/package.json` declares `engines.node: "^22.18.0 || >=24.2.0"`. `isEntryPoint(meta)` returns `meta.main` when it is a boolean and throws an error naming the supported range otherwise. argv[1] is never read.

Superseded from ADR-557: the real-path comparison of argv[1] and the module path, and the rejection of `import.meta.main` for Node 18/20.
Carried forward from ADR-557: nothing — the comparison is deleted, not narrowed to a fallback.

Superseded from ADR-558: `ENOENT` on argv[1] mapping to "not the entry point".
Carried forward from ADR-558: nothing — the helper no longer touches the filesystem, so it has no error to map.

## Consequences

The swap race is closed on every supported Node. On unsupported Node every entry fails loudly (exit 1, the named error) instead of running or silently exiting. An extensionless spelling (`node engine/bin/adr-lint`) now runs `main`. Node 18, 20 and 23 are past upstream end-of-life. ADR-047's reason for pinning Stryker 8.7.1 (the `>=18` floor) no longer holds; moving Stryker is out of scope here.
