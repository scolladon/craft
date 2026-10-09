---
subjects:
  - evals/implementer-runs-guards/prompt.md
---
# 417 — The implementer case stops at the green gate without committing

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

git fails inside the eval sandbox on macOS (exit 72) and `PATH` cannot route around it. A failed commit invites the blocker protocol to replace the cycle lines the graders read.

## Options considered

1. **The prompt tells the agent to stop at the green gate without committing and write "no commit" in the hash slot** *(recommended)* — pros: same on every machine, no turns spent on git / cons: departs from the contract's commit line for this case only
2. **Keep the commit and ask for the cycle lines whatever happens** — pros: unchanged contract / cons: handback shape depends on how the agent handles a red commit
3. **Route git through an absolute path** — pros: commit lands / cons: machine-specific; a `PATH` route was shown not to work

## Decision

Adopted-as-recommended (no user judgment): option 1. No grader reads the commit.

## Consequences

- An agent that treats the instruction as conflicting with the contract may hand back a blocker; the hand read classifies it, and a recurrence reopens this choice.
