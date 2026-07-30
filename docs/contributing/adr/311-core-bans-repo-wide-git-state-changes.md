# 311 — The core contract bans repo-wide git state changes by agents

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The core contract bounds an agent to its working directory but says nothing about git state
that reaches beyond the files it touches. A real overlap exists: the documentation phase runs
its writers in parallel with a background validation run in the same tree, while the triager
commits. A stash, checkout, or reset from any one of them would reach the others.

## Options considered

1. **Ban the verbs unconditionally, no carve-out text** *(recommended)* — pros: shortest; the contract binds agents, and the reset-on-red reset is performed by the runner, not an agent, so no exemption is needed / cons: reads as absolute to someone who knows reset-on-red exists.
2. **Same ban with an explicit exemption clause for reset-on-red** — pros: pre-empts that confusion / cons: spends a clause of every spawn's context on a case the contract does not govern.
3. **Ban stash, pop, and checkout only, leaving reset to binding-level deny sets** — pros: sidesteps the reset question / cons: leaves the most destructive verb uncovered at the contract level.

## Decision

**Adopted-as-recommended (no user judgment).** One line is added to the core contract
forbidding agents from changing repo-wide git state, naming the verbs, with the reason stated
so the rule is self-explaining. No exemption clause: the reset-on-red reset belongs to the
runner, which the agent contract does not bind.

## Consequences

Every spawn carries the line, so the injected block grows by one line for all phases. The core
file is also the fail-closed denylist the prune skill reads, so this line is protected from
being pruned by construction. Wording is constrained by the lints that scan the contracts
directory — plain prose, no backticks, and none of the banned tokens.
