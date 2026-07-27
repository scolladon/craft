# 240 — Copilot target binary: the standalone `copilot` CLI

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** none

## Context

Two distinct products carry the Copilot CLI name: the `gh copilot` gh-extension and a standalone `copilot` binary. They are not the same product. A live probe found the standalone binary installed at `/opt/homebrew/bin/copilot` (Homebrew **cask** `copilot-cli`) and `gh` 2.96.0 with **zero** extensions installed. The standalone binary is the one exposing `-p/--prompt`, `--output-format json`, plugins, hooks, and subagents — every affordance the Execution port needs. A version trap was pinned: the binary self-reports `1.0.63` while its Caskroom path says `1.0.17`, because it self-updates in place. A naming trap was also pinned: the Homebrew **formula** `copilot` is AWS ECS's tool, a different product entirely.

## Options considered

1. **Standalone `copilot`, pinned at the binary self-report 1.0.63** *(designer recommendation)* — pros: the only installed and probeable product; carries every needed affordance; empirically pinned end-to-end. Cons: version must be read from the binary, not the package manager.
2. **The `gh copilot` extension** — cons: not installed; a separate product; probing it would have mutated the user's real `gh` config.
3. **Support both** — cons: doubles the binding surface against a second contract that was never pinned.

## Decision

*Adopted as recommended (no user judgment).* Option 1. The Copilot binding targets the **standalone `copilot` CLI**, and the pinned version is the **binary's self-report** (`copilot --version` → 1.0.63), never the package-manager version, which disagrees because the binary self-updates in place. The `gh copilot` extension is explicitly out of the pinned contract.

## Consequences

- Every affordance in this binding is pinned against a live 1.0.63 binary; nothing is assumed from prior knowledge.
- The POC record must state the self-report/cask version disagreement so a future reader does not re-derive the wrong version.
- The AWS-ECS `copilot` formula collision is documented so an install instruction never points at the wrong package.
- Supporting `gh copilot` later is additive and would require its own pinning pass.
