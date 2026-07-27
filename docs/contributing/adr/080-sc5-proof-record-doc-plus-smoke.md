# 080 — SC5 proof artifact: a committed record doc + on-demand smoke

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-5 as recommended); follows the ADR-068 / ADR-074 split

## Context

SC5 has two provable layers: the engine resolver's toolchain-neutrality (deterministic, CI-gated — ADR-078)
and the runtime probe layer's correct degradation on a real non-tsgit repo (not cheaply CI-gated —
ADR-077). The BACKLOG P15 row needs a durable, citable artifact that stands as the SC5-green evidence.

## Options considered

1. **A committed validation-record doc** (mirroring `docs/model-class-matrix.md`) + the on-demand
   real-repo smoke in `skills/run/SKILL.md` — pro: matches the repo's established proof pattern
   (deterministic CI for the engine property + a diffable record for the real-repo run); leaves durable,
   citable evidence / con: the record is hand-authored from the smoke. *(designer's recommendation)*
2. **A CI-gated scenario/fixture only**, no real-repo run — con: cannot prove the runtime probe layer,
   only the resolver.
3. **A one-shot manual smoke recorded only in the run record / PR body** — con: leaves no standing,
   citable SC5 evidence for the BACKLOG row.

## Decision

SC5 is proven by **two artifacts**, mirroring ADR-068/074:

- **Engine-layer (CI-gated):** the explicit SC5 scenario (ADR-078).
- **Real-repo (on-demand, documented):** a committed, diffable **SC5 validation-record doc** recording
  the target repo's identity + toolchain, the resolved 11-phase walk, each phase's outcome
  (ran / no-op-with-note / n/a / REFUSE-if-applicable), the discovered gate command, and the final
  PASS/PARTIAL verdict. The smoke procedure is documented in `skills/run/SKILL.md` alongside the existing
  on-demand smokes (inline-fidelity, model-class, registered-dispatch); the smoke outcome lands in the
  record doc.

The BACKLOG P15 row (ADR-079) points at this record doc as the SC5-green evidence.

## Consequences

- CI stays deterministic (no flaky second-repo install) while genuine runtime fidelity on a real non-tsgit
  repo is still recorded.
- The record doc is the durable home for the SC5 result; refreshed on demand by a maintainer.
- The smoke must observe the propose-gate-on-no-op release (ADR-082) live — the walk reaching
  documentation/propose without deadlocking on the no-op'd validation is part of the recorded outcome.
