---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: planner-red-label-audit
      commit: '9141610'
      date: '2026-10-08'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 2
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: planner-red-label-audit
      commit: '9141610'
      date: '2026-10-08'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
findings:
  - concern: findings
    file: contracts/construction.md
    severity: medium
    pattern: 'a test-label change in agents/planner.md or templates/plan.md must be checked against contracts/construction.md, which is injected into every part-implementer spawn: a plan label the contract does not know (a passing GUARD vs "it must fail") makes the implementer block, refuse, or break code to satisfy the contract'
    confidence: 1
    provenance:
      run: planner-red-label-audit
      commit: '9141610'
      date: '2026-10-08'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: planner-red-label-audit
      commit: '9141610'
      date: '2026-10-08'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 9141610 / 2026-10-08

## gate-cmd
- confidence: 2 | provenance: 53e62b8 / 2026-10-06
- confidence: 5 | provenance: 9141610 / 2026-10-08

## validation-tool
- confidence: 1 | provenance: 32c1976 / 2026-09-22

## findings
- confidence: 1 | provenance: 9141610 / 2026-10-08

## part-sizing
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 9141610 / 2026-10-08
- confidence: 1 | provenance: 32c1976 / 2026-09-22
