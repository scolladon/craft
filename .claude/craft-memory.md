---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix adapters/codex test
    confidence: 5
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 1
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
findings:
  - concern: findings
    file: adapters/codex/hooks/craft-guard.js
    pattern: crash-handler-reason-can-throw
    severity: low
    confidence: 1
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 3
    provenance:
      run: backlog-sweep-hooks-quote-dev-tools
      commit: ae9c681
      date: '2026-10-12'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 2
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: f8dbd34 / 2026-10-13

## gate-cmd
- confidence: 5 | provenance: f8dbd34 / 2026-10-13
- confidence: 5 | provenance: f8dbd34 / 2026-10-13

## validation-tool
- confidence: 1 | provenance: 990c817 / 2026-10-12

## findings
- confidence: 1 | provenance: f8dbd34 / 2026-10-13

## part-sizing
- confidence: 4 | provenance: f8dbd34 / 2026-10-13
- confidence: 3 | provenance: ae9c681 / 2026-10-12
- confidence: 2 | provenance: f8dbd34 / 2026-10-13
