---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: codex-rules-deploy-step
      commit: a56c878
      date: '2026-10-16'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-rules-deploy-step
      commit: a56c878
      date: '2026-10-16'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-rules-deploy-step
      commit: a56c878
      date: '2026-10-16'
validation-tool: []
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: codex-rules-deploy-step
      commit: a56c878
      date: '2026-10-16'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 3
    provenance:
      run: codex-rules-deploy-step
      commit: a56c878
      date: '2026-10-16'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 1
    provenance:
      run: native-surface-skills-title-fix
      commit: a310f8b
      date: '2026-10-16'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: a56c878 / 2026-10-16

## gate-cmd
- confidence: 5 | provenance: a56c878 / 2026-10-16
- confidence: 5 | provenance: a56c878 / 2026-10-16

## validation-tool
_(none)_

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: a56c878 / 2026-10-16
- confidence: 3 | provenance: a56c878 / 2026-10-16
- confidence: 1 | provenance: a310f8b / 2026-10-16
