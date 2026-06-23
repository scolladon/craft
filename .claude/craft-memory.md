---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
mutation-tool:
  - concern: mutation-tool
    tool: stryker
    configFingerprint: 61f93c23b936c269
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
findings:
  - concern: findings
    file: skills/init/SKILL.md
    severity: medium
    pattern: LLM-prose bash temp-file handling needs trailing-X mktemp and reuse of the validated path, not raw-name re-splice
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: part-sizing
    size: validator
    outcome: pass
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: part-sizing
    size: bash-helper
    outcome: pass
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 1 | provenance: f4785cd / 2026-06-23

## gate-cmd
- confidence: 1 | provenance: f4785cd / 2026-06-23
- confidence: 1 | provenance: f4785cd / 2026-06-23

## mutation-tool
- confidence: 1 | provenance: f4785cd / 2026-06-23

## findings
- confidence: 1 | provenance: f4785cd / 2026-06-23

## part-sizing
- confidence: 1 | provenance: f4785cd / 2026-06-23
- confidence: 1 | provenance: f4785cd / 2026-06-23
- confidence: 1 | provenance: f4785cd / 2026-06-23
- confidence: 1 | provenance: f4785cd / 2026-06-23
