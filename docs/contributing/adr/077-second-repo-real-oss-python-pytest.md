# 077 — Second repo: a real OSS Python/pytest project

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-2 as recommended); precondition set by ADR-076

## Context

SC5 needs a concrete second repo to validate against — one on a toolchain craft has never run on. The
choice trades realism (a true second-instantiation) against CI reproducibility (a committed fixture). The
target must satisfy ADR-076's precondition: a test command discoverable without a manifest.

## Options considered

1. **A real external OSS Python+pytest repo** — pro: honest realism; `pytest` is the most ubiquitous
   non-JS test runner, so the gate probe's discovery is exercised against the most representative
   toolchain / con: not CI-reproducible; install depends on the environment. *(designer's recommendation,
   with Python/pytest as the canonical pick)*
2. **A synthetic minimal fixture committed into craft** (`examples/`/`test/fixtures/`) — pro:
   CI-reproducible / con: risks proving a toy rather than the claim; a hand-made fixture can be tuned to
   pass.
3. **A real external Go or Rust repo** — pro: a different toolchain again / con: less ubiquitous test
   runners; defers the most representative case.

## Decision

The SC5 real-repo smoke runs against **a real, external OSS Python project whose tests run under
`pytest`** (the canonical non-JS toolchain), with **no `.claude/workflow.md`**, driven by a small
free-text brief (zero-manifest means no `backlog:` block, so the input cannot be a backlog id). The
specific repo is named by the user at smoke time. A committed synthetic fixture is **not** required for
SC5 and is left optional for any later CI-reproducible want.

## Consequences

- The SC5 smoke is on-demand and documented in `skills/run/SKILL.md` (ADR-080), not CI-gated — consistent
  with the established smoke pattern (inline-fidelity, model-class, registered-dispatch).
- The smoke record (ADR-080) captures the chosen repo's identity, toolchain, and discovered gate command.
- The engine-layer toolchain-neutrality guarantee is proven separately and deterministically in CI
  (ADR-078), independent of any real-repo install.
