---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix adapters/codex test
    confidence: 5
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
validation-tool: []
findings:
  - concern: findings
    file: adapters/codex/test/hook-trust-differential.test.js
    pattern: fuzz-oracle-blind-to-a-guard-channel
    severity: medium
    confidence: 1
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 3
    provenance:
      run: codex-hook-nonzero-exit-probe
      commit: f8dbd34
      date: '2026-10-13'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 4
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 3
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: da9171a / 2026-10-13

## gate-cmd
- confidence: 5 | provenance: da9171a / 2026-10-13
- confidence: 5 | provenance: da9171a / 2026-10-13

## validation-tool
_(none)_

## findings
- confidence: 1 | provenance: da9171a / 2026-10-13

## part-sizing
- confidence: 3 | provenance: f8dbd34 / 2026-10-13
- confidence: 4 | provenance: da9171a / 2026-10-13
- confidence: 3 | provenance: da9171a / 2026-10-13
