# 002 — The deterministic engine core is a portable Node module

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

Pipeline resolution (alias-resolve, expand profile, apply skip/insert edits, validate the graph
doesn't strand), descriptor parsing, and contract/injection assembly are the deterministic core
functions P1 must unit-test. The medium so far is Bash (manifest-lint's YAML-subset parser),
which regressed twice and is awkward for YAML + graph logic. PRD N3 keeps Bash+markdown "except
where portability (§15) demands an explicit boundary."

## Options considered

1. **Dedicated Bash script** (`pipeline-resolve.sh` + `pipeline-lint.sh`) — consistent with
   today / fragile parser, hard graph logic, Bash-bound (less portable). *(designer recommended)*
2. **Extend `manifest-lint.sh`** — one script / overloads it, grows the fragile parser.
3. **Orchestrator (LLM) resolves** — no code / not mechanically testable.

## Decision

The deterministic engine core — descriptor parse, alias-resolve, profile expansion, edit
application, graph validation, and contract/injection assembly — is a single **portable Node.js
module/CLI** (e.g. `engine/`, invoked as `pipeline-resolve` / `pipeline-lint`), **not Bash**.
`manifest-lint`'s *shape* validation stays Bash for now; P2 may fold it into the Node core for
one deterministic home.

## Consequences

Invokes the **N3 §15 portability carve-out**: the core's deterministic part becomes a genuinely
runtime-portable code module — the closest thing forge has to a real domain core — shrinking the
Bash-bound adapter and advancing G13. Node becomes a forge runtime dependency (already universal
in the Claude Code environment; CI has it). P1 tests the core with a Node test runner
(`node:test`/vitest); bats is reserved for the remaining Bash (hooks, worktree scripts). Robust
`js-yaml` + a real graph check replace Bash string-munging. **Follow-up (P2):** decide whether
`manifest-lint` shape validation migrates into the same module.

**P2 fold evaluation (deferred to P3):** `manifest-lint.sh` was hardened in P2 with a
`parse_frontmatter()` seam backed by `yq` (mikefarah) when available and the existing sed/awk
subset parser as a fallback. This approach is sufficient for the P2 validation scope (key/phase
membership, skip-on-protected, dangling-file checks). Folding the remaining shape validation into
the Node core is deliberately **deferred to P3** for the following reasons: (1) P3 removes the
static `PROTECTED` list — replacing it with the graph's strand-detection — which is the most
structurally significant change to `manifest-lint`'s logic and the right moment for a single
coordinated migration; (2) the Node resolver (`engine/src/resolve.js`) already parses manifests
in P1, so P3 can expose a `validateManifest` export from the same module without a second parse
boundary; (3) the `yq`-backed Bash script is now shellcheck-clean and all regression fixtures
pass under both backends, making it a stable interim home rather than a maintenance hazard. Until
P3, `manifest-lint.sh` remains the canonical shape-validation entry point; the Node core is the
canonical graph-validation entry point.
