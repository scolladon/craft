# 264 — Gate/execution/model/telemetry binding sets add codex

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Applies ADR-249 (gate binding set: "ships a guard binding" criterion)

## Context

ADR-249 already settled that port docs' `Binding set` lines are not uniform across the repo and must not be forced uniform: `execution.md`/`model.md`/`telemetry.md`/`gate.md` bind `{ claude, pi, opencode, copilot }` today; `memory.md`/`vcs.md`/`policy.md` bind only `{ claude, pi }`; `backlog.md`/`intention.md` carry no `Binding set` line at all. Codex verifiably binds execution, model, telemetry, and gate (ADRs 254, 259, 257, 255) and binds none of memory, vcs, or policy.

## Options considered

1. **Uniform edit across every port doc's `Binding set` line**, including `memory.md`/`vcs.md`/`policy.md`/`backlog.md`/`intention.md` — cons: this change binds none of memory/vcs/policy, and backlog/intention carry no such line at all; a blanket edit would misrepresent scope, the exact trap ADR-249 already corrected once for opencode.
2. **Add `codex` only to the four port docs it verifiably binds** — `execution.md`, `model.md`, `telemetry.md`, `gate.md` — each also gaining a per-binding Codex section stating its own profile *(chosen)* — pros: honest, matches ADR-249's precedent exactly. Cons: none material.
3. **Skip `Binding set` line edits entirely**, relying solely on new per-binding sections — cons: leaves the set lines stale and inconsistent with the docs' own per-binding content, the exact inconsistency ADR-249 exists to prevent from recurring.

## Decision

*Adopted as recommended (no user judgment), applying the ADR-249 precedent.* Option 2. Exactly `docs/adapters/execution.md`, `model.md`, `telemetry.md`, and `gate.md` gain `codex` in their `Binding set` line → `{ claude, pi, opencode, copilot, codex }`. `docs/adapters/memory.md`, `vcs.md`, and `policy.md` stay `{ claude, pi }` — **unchanged**, this change binds none of them. `docs/adapters/backlog.md` and `intention.md` carry no `Binding set` line and are untouched. Per ADR-249, `gate.md`'s criterion is "ships a guard binding" regardless of enforcement strength; each per-binding section states its own profile, and codex's (ADR-255: the hook genuinely denies) is the strongest recorded so far.

## Consequences

- Each of the four docs also gains a Codex per-binding section (topology, tier map, `collect` + read-root leaf caveat, enforcement profile respectively) — not just the set-line edit.
- `memory.md`/`vcs.md`/`policy.md`/`backlog.md`/`intention.md` are explicitly untouched, preventing the uniform-edit trap ADR-249 already corrected once.
- `gate.md`'s per-binding section, not its `Binding set` line, is where codex's honest carve-outs (ADR-255) live — the set line conveys membership, never strength.
