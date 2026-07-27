# 261 — Codex proof strategy

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-247 (copilot proof seams + on-demand smoke) and ADR-236 (pi proof deterministic seams + on-demand smoke)

## Context

`codex` is installed on developer machines, and CI does not (and should not) install its 248 MB binary. `codex execpolicy check --rules <PATH> <CMD>…` is deterministic, offline, and auth-free — genuinely rare for a guard-adjacent surface. The BYOK fake-provider harness (`wire_api = "responses"`, SSE chunks, `exec_command` taking `cmd` as a string) drove every live-proven row in the PoC record at zero credentials and zero quota.

## Options considered

1. **Deterministic seams (unit tests through injected dependencies) + one on-demand smoke**, the BYOK fake-provider harness committed as a developer-run probe (never CI-gated), a fast-failing `codex` `PATH` stub mandatory *(chosen)* — pros: proves guard behaviour at zero cost without needing the real binary in CI. Cons: matcher-semantics claims stay unasserted by CI, living only in the PoC record.
2. **Same, plus CI-gate `codex execpolicy check` against the generated `craft.rules`** — cons: needs the real `codex` binary present, which CI does not have and should not install.
3. **Deterministic seams only, no smoke, no harness** — cons: throws away the most valuable non-CI artifact this binding can ship — zero-cost, zero-auth, offline guard-behaviour proof.

## Decision

*Adopted as recommended (no user judgment).* Option 1. CI asserts the **generated `craft.rules` TEXT** (a pure string/structure seam); matcher semantics stay in `docs/adapters/codex-poc-record.md` as an on-demand matrix, since `execpolicy check` needs the real binary and can never gate. **No test may spawn the real `codex` binary.** Any test that could reach one on `PATH` prepends a fast-failing stub — mandatory before any `scripts/ci.sh` run, since an un-stubbed run costs minutes and real quota.

## Consequences

- The BYOK fake-provider harness ships as a developer probe, never CI-gated, giving zero-cost end-to-end confirmation of hook denial and execpolicy behaviour.
- `scripts/ci.sh` and `test/every-test-file-registers.test.js` both register the new suite in the same commit.
- Matcher-semantics and enforcement-prose claims in `gate.md`/`README.md` are lints-for-structure only; their correctness rides on review against the PoC record, not on a CI suite.
