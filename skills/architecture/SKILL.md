---
name: architecture
description: Craft architecture phase - run dependency-cruiser over the change, triage violations (fix the edge or document an exception); gates the PR. Also useful standalone.
---

# craft:architecture

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch.
2. **Read harness knobs** from `phase.harness` (the resolved descriptor): `tool`
   (`dependency-cruiser`), optional `scope`, optional `rules` (config path). Then
   **probe: dependency-cruiser config present?** — a `.dependency-cruiser.{json,js,cjs}`
   (or the `rules:` path the manifest names) AND the binary resolvable
   (`npx --no-install depcruise --version` / `command -v depcruise`). Absent →
   **no-op with a note** in the run record; the phase ends here. *A manifest may never
   pre-empt this probe.*

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Run dependency-cruiser SYNCHRONOUSLY**, scoped per `phase.harness.scope` when set
   (default: the change's touched code, never wider). Capture the violation report. No
   background run — the run is synchronous; nothing to lock against teardown.
2. **The PR waits for triage** (orchestrator invariant): on a non-empty violation set,
   spawn **craft:architecture-triager** with: the violations; the gate; the commit
   message `fix(architecture): <scope>` (or `chore(architecture): <scope>` for an
   exception-only landing); global + architecture-phase `context:` files verbatim
   (tool-specific triage procedure included).
3. Verify the triager's commit; run the phase gate (`<arch gate>` = dependency-cruiser
   exits 0 over the scope); record per-violation outcomes in the run record.
