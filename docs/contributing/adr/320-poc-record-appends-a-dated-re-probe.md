# 320 — The poc record appends a dated re-probe and corrects only falsified rows

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

`docs/contributing/specs/codex-poc-record.md` is pinned to codex-cli 0.144.6 throughout, and its
stated purpose is to record facts observed against a live binary, each marked CONFIRMED or DEFERRED,
never assumed. The 0.145.0 re-probe exercised a specific subset of it: hook trust, plugin/skill
loading, the marketplace source form, and the PreToolUse payload shape. It did not re-run the
execution-port, sandbox-mode, or execpolicy rows.

Re-pinning the whole document to 0.145.0 would therefore assert evidence that was never gathered —
in the one document whose entire purpose is refusing to do that.

## Options considered

1. **Append one dated `Re-probe — codex-cli 0.145.0` section, and surgically correct only the rows the re-probe falsified; leave un-re-probed rows pinned at 0.144.6** *(recommended)* — pros: keeps the CONFIRMED/DEFERRED discipline intact and makes the version pin explicit exactly where it differs / cons: the record now carries two version pins, which a careless reader could conflate.
2. **Full rewrite, re-pinning every row to 0.145.0** — pros: one version, simpler to read / cons: fabricates 0.145.0 evidence for rows nobody re-probed.
3. **Bump the version-identity rows only; evidence lives in the design doc** — pros: minimal edit / cons: leaves the falsified hook-trust rows standing as current truth, which is the more dangerous half of the record.

## Decision

**Decided by the session on the evidence, with the user's ratified scope.** The record gains a dated
re-probe section; only falsified rows are corrected in place; every other row keeps its 0.144.6 pin.

## Consequences

The record carries two version pins simultaneously, so each corrected row must name the version it
was observed under — a bare "CONFIRMED" is no longer sufficient where the two probes disagree. The
re-probe section carries the isolation proof (mtime-find over the real `CODEX_HOME`, zero entries)
and both ground-truth outcomes of the fail-closed test, including the allow case; recording only the
denial would repeat the over-blocking regression this binding already shipped once.
