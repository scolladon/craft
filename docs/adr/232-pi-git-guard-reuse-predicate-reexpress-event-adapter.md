# 232 — pi git-guard reuses the predicate verbatim and re-expresses the 0.80.10 event adapter

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-223 (predicate re-expressed per binding)

## Context

The git-guard's pure predicate (`gate.js#toolCallGuard`: the `GIT_DIFF_SHOW_RE` matcher + write-path containment) is proven and binding-neutral. Live-pinning (design §D2 rows 13/14) found pi 0.80.10's `tool_call` event diverges from the 0.79.8 shape `adaptPiEvent` was written against: it emits `event.toolName` (not `event.tool`/`event.name`), tool names are lowercase (`bash`/`write`/`edit`), write/edit input uses `path` (not `file_path`), and blocking is by **return** `{block,reason}`.

## Options considered

1. **Reuse the `gate.js` predicate verbatim; re-express the pi event adapter for 0.80.10 + a test matching bash behaviour** *(designer recommendation)* — pros: the predicate is proven and binding-neutral; only the *event adapter* tracks pi's real shape. Cons: the adapter needs new `node --test` cover for the 0.80.10 shapes.
2. **Author a fresh pi predicate** — cons: duplicates a tested regex.
3. **Extract a shared predicate all bindings import** — cons: needs a shared home the engine or a new package owns (scope creep).

## Decision

*Adopted as recommended (no user judgment).* Option 1, per ADR-223. `gate.js#toolCallGuard` (the predicate) is reused byte-for-byte. The pi event adapter (`tool-call-hook.js#adaptPiEvent` + the extension handler) is re-expressed for pi 0.80.10: read `event.toolName`, bridge lowercase tool names to the predicate's Claude-cased sets (ADR-237), map the write field `path`, and block by returning `{block:true,reason}` (which is exactly what the existing `toolCallHook()` returned function already produces). A new `node --test` covers the pinned 0.80.10 event shapes.

## Consequences

- The shared predicate stays binding-neutral and unit-tested; pi specifics live only in the pi adapter.
- The git-diff guard branch — never exercised by a real pi event before (the pi smoke did not drive the guard) — gets its first `node --test` coverage over real 0.80.10 fixtures.
- The `edit` tool's full arg schema beyond `path`/`content` is DEFERRED (design §D2 row 28), needed only if a path guard inspects edit args.
