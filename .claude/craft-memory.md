---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: recalibrate-failing-test-first-grader
      commit: 8b4370f
      date: '2026-10-08'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 3
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: recalibrate-failing-test-first-grader
      commit: 8b4370f
      date: '2026-10-08'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 2
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
findings:
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: evals/planning-plan-lints/graders/failing-test-first.md
    severity: medium
    pattern: 'an llm grader rewording checked by replaying the judge prompt through claude -p is not evidence: the real judge is a context-free side-query with thinking off, and the claude -p replay reproduced 0 of 10 real false FAILs; validate wordings in a throwaway plugin-eval suite whose scaffold plants each recorded focus file, one grader file per wording'
    confidence: 1
    provenance:
      run: recalibrate-failing-test-first-grader
      commit: 8b4370f
      date: '2026-10-08'
  - concern: findings
    file: README.md
    severity: low
    pattern: adding a file under docs/contributing/design, plan or adr must bump the README corpus count in the same commit, or readme-drift turns ci.sh red at that commit
    confidence: 1
    provenance:
      run: recalibrate-failing-test-first-grader
      commit: 8b4370f
      date: '2026-10-08'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: recalibrate-failing-test-first-grader
      commit: 8b4370f
      date: '2026-10-08'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 2
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 8b4370f / 2026-10-08

## gate-cmd
- confidence: 3 | provenance: 53e62b8 / 2026-10-06
- confidence: 5 | provenance: 8b4370f / 2026-10-08

## validation-tool
- confidence: 2 | provenance: 32c1976 / 2026-09-22

## findings
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 8b4370f / 2026-10-08
- confidence: 1 | provenance: 8b4370f / 2026-10-08

## part-sizing
- confidence: 2 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 8b4370f / 2026-10-08
- confidence: 2 | provenance: 32c1976 / 2026-09-22
