---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 3
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
validation-tool: []
findings:
  - concern: findings
    file: contracts/construction.md
    severity: medium
    pattern: 'a test-label change in agents/planner.md or templates/plan.md must be checked against contracts/construction.md, which is injected into every part-implementer spawn: a plan label the contract does not know (a passing GUARD vs "it must fail") makes the implementer block, refuse, or break code to satisfy the contract'
    confidence: 2
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
  - concern: part-sizing
    size: eval-fixture
    outcome: pass
    confidence: 1
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
  - concern: part-sizing
    size: eval-graders
    outcome: pass
    confidence: 1
    provenance:
      run: implementer-guard-eval
      commit: a653a4b
      date: '2026-10-09'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: a653a4b / 2026-10-09

## gate-cmd
- confidence: 3 | provenance: a653a4b / 2026-10-09
- confidence: 5 | provenance: a653a4b / 2026-10-09

## validation-tool
_(none)_

## findings
- confidence: 2 | provenance: a653a4b / 2026-10-09

## part-sizing
- confidence: 5 | provenance: a653a4b / 2026-10-09
- confidence: 1 | provenance: a653a4b / 2026-10-09
- confidence: 1 | provenance: a653a4b / 2026-10-09
