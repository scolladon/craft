---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix adapters/codex test
    confidence: 4
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 2
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
findings:
  - concern: findings
    file: adapters/codex/src/hook-trust.js
    pattern: shell-and-node-parser-differential
    severity: high
    confidence: 1
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 3
    provenance:
      run: public-front-door-completion
      commit: 7739dc8
      date: '2026-10-12'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 4
    provenance:
      run: backlog-sweep-hooks-quote-dev-tools
      commit: ae9c681
      date: '2026-10-12'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 1
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
  - concern: part-sizing
    size: config-prose
    outcome: pass
    confidence: 1
    provenance:
      run: codex-hooks-quote-plugin-root
      commit: 990c817
      date: '2026-10-12'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 990c817 / 2026-10-12

## gate-cmd
- confidence: 4 | provenance: 990c817 / 2026-10-12
- confidence: 5 | provenance: 990c817 / 2026-10-12

## validation-tool
- confidence: 2 | provenance: 990c817 / 2026-10-12

## findings
- confidence: 1 | provenance: 990c817 / 2026-10-12

## part-sizing
- confidence: 3 | provenance: 7739dc8 / 2026-10-12
- confidence: 4 | provenance: ae9c681 / 2026-10-12
- confidence: 1 | provenance: 990c817 / 2026-10-12
- confidence: 1 | provenance: 990c817 / 2026-10-12
