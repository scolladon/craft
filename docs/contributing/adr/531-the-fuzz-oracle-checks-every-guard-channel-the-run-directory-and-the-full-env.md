---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 531 — The fuzz oracle checks every guard channel, the run directory and the full env

- **Status:** accepted — adopted from a verified review finding (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** refines ADR-527

## Context

The guard reports its verdict through its exit status and reads its input on stdin. ADR-527's oracle required exit 0 from a stub that ignored stdin, so a command that backgrounds the guard (`… &`), feeds it a fixed file (`… </etc/hosts`) or redirects it passed. Its `NODE_*` env check also passed `X=1`, `OPENSSL_CONF=` or `LD_PRELOAD=` prefixes. The matcher refuses all of these today; the oracle could not have caught a regression that trusted them.

## Options considered

1. **Sentinels on every guard channel, the stub's exit relayed under two statuses, the run directory and full env compared to a per-shell baseline** *(recommended by the security review, cycles 1-2)* — pros: catches backgrounding, `&& x`/`|| x` chaining, status masking, stdin/stdout/stderr redirection, file writes and every assignment prefix, including one that overrides a baseline name / cons: one baseline spawn per root-env kind per leg
2. **A fixed allow-list of exported names** — cons: differs per shell and OS; misses overridden values
3. **Keep ADR-527's oracle** — cons: the gaps above stay

## Decision

Adopted from verified review findings (no user judgment): option 1. The stub logs argv, `export -p` and one stdin line, prints a stdout and a stderr sentinel, and exits the status written in its run directory. Trusted commands alternate between stub statuses 0 and 3 by corpus index. A command passes only when:

- the shell exits the stub's status with no signal;
- stdout and stderr are exactly the stub's sentinels, and the logged stdin line is the sentinel the spawn wrote;
- the run directory holds only the stub's own files;
- the `export -p` lines, with the run directory replaced by a placeholder and `_` dropped, equal those of `node /baseline<tail>` under the same shell and root env, in both directions;
- argv is one rooted path ending in the guard tail.

The generator gains `' &'`, `' </dev/null'`, `' && mark'`, `' || mark'`, `' >out'` and `' 2>/dev/null'` trails and a `'HOME=/x '` lead so it draws these shapes.

## Consequences

Measured over seeds 1-8: narrow reverts that trust a trailing `&& word`, a trailing redirect, or a leading `HOME=` each die to 2-7 cases; a leading-assignment revert dies through the env clause alone. Alternating the status instead of running both kills exactly the same cases at half the cost. A command whose stdin is never read surfaces as a missing sentinel, never as an `EPIPE` crash.
