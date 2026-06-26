---
name: architecture
description: Craft architecture phase - run the repo's boundary-check harness over the change, triage violations (fix the edge or document an exception); gates the PR. Also useful standalone.
---

# craft:architecture

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch.
2. **Resolve the active technique set** from `phase.harness` (the resolved descriptor),
   using the same ADR-149 discovery precedence — default-off favours no-op:
   - **Declared** — `phase.harness.techniquePlan` (engine-emitted) wins outright: each
     entry specifies technique `id`, `run` command, `mode` (`gate` | `triage`), optional
     `scope`, optional `triage-procedure` ref. `run-style` defaults to `sync`.
   - **Derived** — absent a declaration, read the repo's own boundary-check conventions
     (README / CONTRIBUTING / craft config) and derive one technique per documented
     dependency/import-boundary validation command, each GATE or TRIAGE per its nature.
   - **No-op** (terminal) — absent any declared or derived technique: record
     `NO-OP(architecture): no techniques declared/probed` and release the `propose`-gate
     entry; the phase ends here. This phase is default-off; no-op is the expected outcome
     in most repos.

   Every resolved technique command — declared or derived — is **trusted operator input**
   (same trust model as the manifest and `context:` files); the derived tier reads the
   repo's own committed conventions, never an untrusted external source.

   For each resolved technique, run its `probe` (config-file presence / binary
   resolvable). A failed probe declines the technique by absence:
   `NO-OP(architecture:<technique-id>): declined — probe absent`. When every technique
   is declined: the phase ends here.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Per-active-technique walk** (`run-style: sync` default — no lock against teardown).
   For each technique in the resolved active set, scope per the technique's `scope`
   (default: the change's touched code, never wider). Capture the violation/finding
   report.
2. **The PR waits for triage** (orchestrator invariant): on a non-empty finding set,
   spawn **craft:harness-triager** with: the findings; the gate; the commit message
   `fix(architecture): <technique-id> <scope>` (or `chore(architecture): <technique-id>
   <scope>` for an exception-only landing); global + architecture-phase `context:` files
   verbatim; the technique's `triage-procedure` ref (if declared).
3. Verify the triager's commit; run the phase gate; record per-finding outcomes in the
   run record.
