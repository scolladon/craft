---
# Injection point (Ports): memory — a per-repo advisory cache of mechanically-derived learnings so
# later runs skip re-probing. Advisory-only: deleting it changes run cost, never correctness.
memory: { source: file }
---

# Example — run-memory cache (`memory`)

The `file` memory adapter reads and writes a per-repo cache at the default
`.claude/craft-memory.md`. It stores only mechanically-derived, mechanically-verifiable facts —
toolchain fingerprints, gate commands, validation-tool ids, findings, and part-sizing outcomes —
so later runs skip re-probing what a prior run already established.

| | without `memory:` | with this manifest |
|---|---|---|
| store location | — (no cache read or written) | `.claude/craft-memory.md`, committed via a `.gitignore` re-include |
| later runs | re-probe toolchain, gate commands, etc. every time | reuse cached observations; only re-probe what decayed out |

## Advisory-only, never a gate

Deleting the store changes run **cost**, never **correctness** — a missing, empty, or malformed
store is a recorded load no-op, and the run continues with whatever is available. There is no
free-form text, semantic summary, or LLM-inferred content in the store; only fields another tool
could independently re-verify.

## Traversal containment

A custom `ref` that would escape the repo root is silently skipped — the port never reads or
writes outside the repo.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
