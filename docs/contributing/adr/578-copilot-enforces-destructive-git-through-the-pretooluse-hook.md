---
subjects:
  - adapters/copilot/hooks/craft-guard.js
  - adapters/copilot/src/git-guard-adapter.js
  - adapters/copilot/src/deny-tool-args.js
supersedes:
  - adr: "243"
    scope: "the preToolUse layer is audit-only and the ext-diff rule is advisory on copilot; toolArgs is parsed as a JSON-encoded string only"
---
# 578 — Copilot enforces destructive git through the preToolUse hook; --deny-tool stays

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** supersedes ADR-243 (hook layer, toolArgs shape)

## Context

ADR-243 shipped the copilot `preToolUse` hook as audit-only because the 1.0.63 probe saw no deny.
A live probe on copilot 1.0.92 (BYOK fake provider, zero credentials, ground truth from a bare
remote's ref) shows the hook denies through `{"permissionDecision":"deny"}` on stdout, through exit
2, and on a crashing hook; the allow direction executes. The 1.0.63 probe used the key
`{"permission":"deny"}`, which 1.0.92 still ignores. A hook hung past `timeoutSec` fails open. The
1.0.92 payload carries `toolArgs` as an object, not a JSON-encoded string. `--deny-tool` is prefix
matching, so `git -C . push` slips past `shell(git push)`.

## Options considered

1. **Promote the hook to enforcing; keep `--deny-tool` as a floor layer** *(recommended)* — pros:
   live-proven deny, the reason reaches the model, normalises argv before deciding / cons: a hook
   timeout fails open.
2. **PATH-first `git` shim** — pros: sees post-shell argv / cons: bypassed by `/usr/bin/git`,
   `command -p git`, `bash -lc`; needs a manual PATH step; must pass copilot's own git calls.
3. **Both layered** — cons: the shim's install and maintenance cost for residual coverage only.

## Decision

**Ratified by the user.** Option 1. On copilot the `preToolUse` hook enforces: a block verdict
denies, an allow verdict executes, a crash or a run with no verdict denies. Native containment
(`--add-dir`, never `--allow-all-paths`) and the `--deny-tool` pattern set stay as layers. The
adapter accepts `toolArgs` as a plain object or as a JSON string encoding one; any other shape fails
closed.

Superseded from ADR-243: the audit-only hook layer, the advisory ext-diff carve-out, and the
JSON-string-only `toolArgs` parse.

Carried forward from ADR-243: the containment and `--deny-tool` layers, the lowercase tool-name
map, the unconditional `path` → `file_path` bridge, the mandatory decoy test, and the reuse of
the shared predicate with only the event adapter re-expressed.

## Consequences

- The hook timeout fail-open (copilot's behaviour) is a documented residual.
- A PATH shim is deferred; it is revisited only if copilot's bash tool proves to keep shell state
  across calls.
- The PoC record, `gate.md` and the adapter README are re-pinned against 1.0.92.
