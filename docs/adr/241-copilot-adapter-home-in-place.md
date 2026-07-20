# 241 — Copilot adapter home: in-place `adapters/copilot/`

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Applies ADR-085

## Context

ADR-085 establishes that adapters live in-place under `adapters/<binding>/` rather than as published packages; `adapters/opencode/` and `adapters/pi/` both hold that shape. Copilot loads a plugin from a local directory via `--plugin-dir <dir>` (repeatable, no install step), and can additionally install from a repo subdirectory via `copilot plugin install owner/repo:<path>`.

## Options considered

1. **In-place `adapters/copilot/` per ADR-085** *(designer recommendation)* — pros: matches ADR-085 and both sibling adapters; `--plugin-dir` loads it directly, so in-place costs nothing ergonomically; `copilot plugin install owner/repo:adapters/copilot` stays available without relocating sources. Cons: none material.
2. **Published npm package** — cons: deviates from ADR-085; adds a release cadence for a binding that changes with the engine.
3. **Published marketplace plugin** — cons: same deviation, plus a second distribution surface to keep in sync.

## Decision

*Adopted as recommended (no user judgment).* Option 1. The Copilot binding lives at `adapters/copilot/` in-place. Local use loads it with `--plugin-dir <repo>/adapters/copilot`; repo-based install (`copilot plugin install owner/repo:adapters/copilot`) remains available later without moving any source.

## Consequences

- The binding versions with the engine in one repo; no separate release step.
- Distribution via the plugin-install path stays open and requires no relocation.
- The adapter suite registers in `scripts/ci.sh` alongside its siblings.
