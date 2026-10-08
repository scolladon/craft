---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 4
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 4
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: eval-sweep-followups
      commit: 5ddca29
      date: '2026-10-08'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 3
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
findings:
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: high
    pattern: one assistant response is written as several transcript lines (one per content block) sharing one message.id and repeating the same per-request input and cache_read; emitting per line multi-counts them ~2x, so emission must be keyed on message.id with the last line winning
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: price entries are per-MTok while token counts are per-unit; the divisor belongs on the summed rate-product at each emitting site, never inside the price table, and one emitter does not inherit the composed conversion
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: medium
    pattern: map lookups keyed by a transcript- or sidecar-controlled string must gate on Object.hasOwn; an inherited Object.prototype member serializes as a dropped key or an empty object into a committed report whose schema contracts string or null
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: medium
    pattern: spreading a corpus-scaled array into Math.max throws RangeError past ~120k arguments and this module sits outside any try/catch, which would break the advisory exit-0 contract; fold max in a reduce
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: test/p10-structure.test.js
    severity: low
    pattern: a set read from agent prose must anchor to its own phrase ('<key> over {') and compare an ordinal scale unsorted; an unanchored [^{]* match picks up the next brace set and sort() hides a reversed scale
    confidence: 1
    provenance:
      run: eval-sweep-followups
      commit: 5ddca29
      date: '2026-10-08'
  - concern: findings
    file: docs/contributing/maintainer-smokes.md
    severity: medium
    pattern: sandbox-escape detection by enumerating command forms (cd, pushd, git -C) keeps missing new forms; extract every absolute-path token from raw tool-input strings with payload fields dropped, resolve .., and pair it with a plugin-checkout file-time scan (find -cnewer without -type f, plus the common git dir of a worktree)
    confidence: 1
    provenance:
      run: eval-sweep-followups
      commit: 5ddca29
      date: '2026-10-08'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 3
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: eval-sweep-followups
      commit: 5ddca29
      date: '2026-10-08'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 3
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: manifest-enum-knob
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: agent-prompt
    outcome: pass
    confidence: 1
    provenance:
      run: eval-sweep-followups
      commit: 5ddca29
      date: '2026-10-08'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 4 | provenance: 53e62b8 / 2026-10-06

## gate-cmd
- confidence: 4 | provenance: 53e62b8 / 2026-10-06
- confidence: 5 | provenance: 5ddca29 / 2026-10-08

## validation-tool
- confidence: 3 | provenance: 32c1976 / 2026-09-22

## findings
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 5ddca29 / 2026-10-08
- confidence: 1 | provenance: 5ddca29 / 2026-10-08

## part-sizing
- confidence: 3 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 5ddca29 / 2026-10-08
- confidence: 3 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 5ddca29 / 2026-10-08
