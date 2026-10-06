---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 5
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 4
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
findings:
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: high
    pattern: one assistant response is written as several transcript lines (one per content block) sharing one message.id and repeating the same per-request input and cache_read; emitting per line multi-counts them ~2x, so emission must be keyed on message.id with the last line winning
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: price entries are per-MTok while token counts are per-unit; the divisor belongs on the summed rate-product at each emitting site, never inside the price table, and one emitter does not inherit the composed conversion
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: medium
    pattern: map lookups keyed by a transcript- or sidecar-controlled string must gate on Object.hasOwn; an inherited Object.prototype member serializes as a dropped key or an empty object into a committed report whose schema contracts string or null
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: medium
    pattern: spreading a corpus-scaled array into Math.max throws RangeError past ~120k arguments and this module sits outside any try/catch, which would break the advisory exit-0 contract; fold max in a reduce
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: scripts/ci.sh
    severity: high
    pattern: the installed-binary hang is NOT pi-specific — ci.sh runs every adapter suite, so ANY agent binary installed on the dev box (pi, opencode, copilot) makes its suite do real provider work and hangs the gate for tens of minutes. Prepend a fast-failing stub for ALL agent binaries to PATH before every ci.sh run, not just the one being worked on. The cost of missing it is a dead sub-agent — a 26-minute part-implementer was lost to exactly this
    confidence: 1
    provenance:
      run: native-copilot-binding
      commit: 43d5b30
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/src/deny-tool-args.js
    severity: high
    pattern: Copilot's `--deny-tool` is PREFIX matching on the raw command string, not argv parsing. `shell(git push)` blocks `git push --force origin main` but NOT `git -C . push`; `shell(git clean -fd)` does not block the reordered `git clean -df`. Wildcards do not work (`shell(*push*)`, `shell(git *push*)`, `shell(git)` match nothing); only the documented `shell(cmd:*)` form works, and `shell(git:*)` denies ALL git which breaks a git-heavy harness. Enumerate realistic flag-order/long-form variants and document the interposed-global-option gap honestly — never claim adversarial enforcement
    confidence: 1
    provenance:
      run: native-copilot-binding
      commit: 2eda333
      date: '2026-07-20'
  - concern: findings
    file: engine/src/findings.js
    severity: high
    pattern: an equivalent-mutant claim resting on "the input cannot contain a newline" is FALSE — JS `.` also excludes CR, U+2028 and U+2029, so an interior CR reaches the pattern and the anchor is load-bearing. Probe with a CR before documenting ANY anchor mutant as equivalent; 4 of 7 claims in one file died to this, and 2 of them silently widened scope
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: BACKLOG.md
    severity: medium
    pattern: a scoped backlog entry's own description of the tree drifts and can be simply wrong — this run found 5 recorded premises false or mis-framed (a trigger characterisation, a colon-rejection claim, which file held the wrong prose, a dedupe dropping both entries not one, a subtotal read as a total). Re-measure every premise before designing a fix for it, and close by evidence when it no longer holds
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: evals/decisions-noop-when-clear/graders/noop-token.md
    severity: high
    pattern: 'a regex grader over the eval trace sees every stream event, including the loaded skill body: a token the skill itself spells as a template (e.g. NO-OP(decisions): … <justification>) must be excluded by a negative lookahead or the grader passes vacuously — observed live in a smoke'
    confidence: 1
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: findings
    file: evals/reviewer-tests-findings/graders/no-harness-exec.md
    severity: medium
    pattern: 'tool_used input_match is new RegExp(input_match).test over the JSON of the WHOLE tool input (description included): anchor the pattern on the run form (npm run X / npx X), not a bare word a read-only grep would also contain'
    confidence: 1
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: findings
    file: test/plugin-evals-local-only.test.js
    severity: medium
    pattern: a guard test that scans test files for a forbidden literal also scans every OTHER test — a pin elsewhere that quotes the literal (claude plugin eval) turns the guard red; pin a fragment instead
    confidence: 1
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: findings
    file: evals/prune-refuses-core/scaffold.sh
    severity: medium
    pattern: 'claude plugin eval refuses every Bash-granting case when ~/.docker holds a symlink (it scans ~/.docker even with DOCKER_CONFIG set, skipping only cli-plugins/buildx/desktop/...): Docker Desktop per-user CLI install puts links in ~/.docker/bin'
    confidence: 1
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 4
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 4
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: manifest-enum-knob
    outcome: pass
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: port-field
    outcome: pass
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: eval-cases
    outcome: pass
    confidence: 1
    provenance:
      run: plugin-eval-suite
      commit: 53e62b8
      date: '2026-10-06'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 53e62b8 / 2026-10-06

## gate-cmd
- confidence: 5 | provenance: 53e62b8 / 2026-10-06
- confidence: 5 | provenance: 53e62b8 / 2026-10-06

## validation-tool
- confidence: 4 | provenance: 32c1976 / 2026-09-22

## findings
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 43d5b30 / 2026-07-20
- confidence: 1 | provenance: 2eda333 / 2026-07-20
- confidence: 1 | provenance: f6639d2 / 2026-07-31
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: f6639d2 / 2026-07-31
- confidence: 1 | provenance: 53e62b8 / 2026-10-06
- confidence: 1 | provenance: 53e62b8 / 2026-10-06
- confidence: 1 | provenance: 53e62b8 / 2026-10-06
- confidence: 1 | provenance: 53e62b8 / 2026-10-06

## part-sizing
- confidence: 4 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 53e62b8 / 2026-10-06
- confidence: 4 | provenance: 32c1976 / 2026-09-22
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 53e62b8 / 2026-10-06
