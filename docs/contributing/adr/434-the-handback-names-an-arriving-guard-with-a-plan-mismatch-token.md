---
subjects:
  - agents/part-implementer.md
supersedes:
  - adr: "423"
    scope: "the part-implementer handback line stays unchanged"
---
# 434 — The handback names a `GUARD` that failed on its first run with a `PLAN-MISMATCH` token

- **Status:** accepted
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/haiku-arriving-guard-handback.md · **Supersedes/Refines:** supersedes ADR-423

## Context

ADR-421 tells the implementer to note the plan mismatch as a deferred observation when a `GUARD` fails on its first run. ADR-423 left the handback line unchanged for lack of evidence. After the contract change, `implementer-runs-guards` at haiku wrote the GREEN in every run but reported the mismatch in 1 of 4 (`arrival-guard-observed` FAIL in all three sweep runs): a prose rule in the contract does not reach haiku's handback. Naming a fixed vocabulary in `agents/reviewer.md` moved haiku from 1 of 3 to 3 of 3 on its eval.

## Options considered

1. **Prose only** — pros: no new token / cons: repeats the contract prose haiku already skipped; unmeasured
2. **Fixed token, fixed payload: `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`** *(recommended)* — pros: one blank to fill; greppable; matches the `NAME(<param>):` family / cons: about 50 tokens per spawn
3. **Fixed token, free payload** — pros: flexible / cons: haiku may write the fix as the payload and drop the expectation

## Decision

The maintainer chose option 2. The `Final message` bullet of `agents/part-implementer.md` says a `GUARD` that failed on its first run gets a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`.

Superseded from ADR-423: keeping the handback line unchanged.

Carried forward from ADR-423: nothing — its only decision was to leave the line as it was, and this decision changes it.

## Consequences

- The token lives in the agent body, not the contract: `contracts/construction.md` and its CI pins are unchanged.
- The handback is not a ledger line; the token is not listed in the run-record Token vocabulary and nothing parses it.
- The six adapter mirrors carry the new line through `sync-adapter-agents.sh`.
- The paid haiku sweep of `implementer-runs-guards` measures the effect.
