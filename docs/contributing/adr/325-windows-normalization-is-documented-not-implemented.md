# 325 — Windows path normalization is documented, not implemented

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** none

## Context

The entry recorded two Windows defects in the boundary filter. Measurement split them apart.

The colon-rejection half is **false**. `parseScopeSpec('C:\repo\a.js:*')` yields
`{ file: 'C:\\repo\\a.js', start: 0, end: MAX_SAFE_INTEGER }`, and the `:1-9` range form parses
correctly too. Both `SCOPE_ENTRY_PATTERN` and `WHOLE_FILE_ENTRY_PATTERN` use a greedy head so the
*last* colon separates path from range, which is deliberate and documented in the module comment —
precisely so a colon inside a path is tolerated. That half of the entry closes by evidence.

The `canonicalPath` half is real and was reproduced. It builds its prefix as `${repoRoot}/`, so a
Windows root `C:\repo` yields `C:\repo/`, which no incoming path starts with; `--repo-root` is
therefore inert on such a root and every finding for a file drops from the filter.

The entry was deferred because the toolchain is POSIX-only and there is no Windows CI to verify a
fix against. That framing turned out to understate the verifiability and understate the trap at the
same time.

## Options considered

1. **Document and do not implement: record that the colon-rejection half is false, that `canonicalPath` is genuinely inert on a Windows root, and close the entry by evidence** *(recommended)* — pros: states exactly what is known and what is not; ships no unprovable code / cons: the real defect stays in the tree.
2. **Implement separator normalization in `canonicalPath`, proven by string-level unit tests on POSIX** — pros: `canonicalPath` is pure over two strings, so a POSIX test pins the normalization exactly — *more* verifiable than the entry assumed / cons: that is the trap rather than the escape; it ships a correct function into a toolchain that cannot run, and a half-Windows-capable filter reads as a claim of Windows support the rest of the repo cannot honour.
3. **Add a `windows-latest` CI job and implement against it** — pros: the only honest way to actually implement it / cons: far outside this run's scope.

## Decision

**Ratified by the user.** No normalization is written. The entry closes on evidence: one half was
never true, and the other half is real but unreachable on any platform this toolchain runs on.

The rule for future work: partial platform support is not shipped. A Windows fix to the boundary
filter lands only alongside a Windows CI job that exercises it — not before, and not on the strength
of a POSIX unit test that pins a string transformation the platform never reaches.

## Consequences

`canonicalPath` stays inert on a Windows root. Anyone porting craft to Windows will hit it, and this
ADR is where they will find both the diagnosis and the reason it was left: the fix is small, the
proof is not. The greedy-head behaviour in the two scope patterns is now recorded as load-bearing
rather than incidental — a future tightening of those patterns would silently break colon-bearing
paths that work today.

What this forecloses is the tempting middle path: a normalization that looks correct, passes its
tests, and cannot be run. `scripts/*.sh`, `hooks/*.sh`, `bats` and `shellcheck` all remain POSIX-only,
so shipping that function would have made the filter the single Windows-aware component in a
toolchain that is not.
