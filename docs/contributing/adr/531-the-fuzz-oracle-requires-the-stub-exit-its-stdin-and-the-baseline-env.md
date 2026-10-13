---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 531 — The fuzz oracle requires the stub's exit, its stdin and the shell's baseline env

- **Status:** accepted — adopted from a verified review finding (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** refines ADR-527

## Context

The guard reports its verdict through its exit status and reads its input on stdin. ADR-527's oracle required exit 0 from a stub that ignored stdin, so a command that backgrounds the guard (`… &`), feeds it a fixed file (`… </etc/hosts`) or redirects it passed. Its `NODE_*` env check also passed `X=1`, `OPENSSL_CONF=` or `LD_PRELOAD=` prefixes. The matcher refuses all of these today; the oracle could not have caught a regression that trusted them.

## Options considered

1. **The stub exits a sentinel status and logs a sentinel stdin line; exported names must equal the shell's own baseline** *(recommended by the security review)* — pros: catches backgrounding, status masking, stdin redirection and every assignment prefix; the baseline absorbs per-shell differences (zsh exports `LOGNAME`) / cons: one baseline spawn per root-env kind per leg
2. **A fixed allow-list of exported names** — cons: differs per shell and OS
3. **Keep ADR-527's oracle** — cons: the gaps above stay

## Decision

Adopted from a verified review finding (no user judgment): option 1. The stub exits `STUB_EXIT_STATUS` (3); a trusted command passes only when the shell exits that status with no signal, the stub logged the stdin sentinel the spawn wrote, and the names the stub saw exported equal those of `node /baseline<tail>` under the same shell and root env. The generator gains `' &'` and `' </dev/null'` trails so it draws these shapes.

## Consequences

Measured at seed 6: a revert that admits a leading assignment dies through the env clause alone; a revert that admits anything after the operand dies partly through the exit status. A command whose stdin is never read surfaces as a missing sentinel, never as an `EPIPE` crash.
