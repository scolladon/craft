---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
findings:
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: high
    pattern: one assistant response is written as several transcript lines (one per content block) sharing one message.id and repeating the same per-request input and cache_read; emitting per line multi-counts them ~2x, so emission must be keyed on message.id with the last line winning
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: price entries are per-MTok while token counts are per-unit; the divisor belongs on the summed rate-product at each emitting site, never inside the price table, and one emitter does not inherit the composed conversion
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: medium
    pattern: map lookups keyed by a transcript- or sidecar-controlled string must gate on Object.hasOwn; an inherited Object.prototype member serializes as a dropped key or an empty object into a committed report whose schema contracts string or null
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: medium
    pattern: spreading a corpus-scaled array into Math.max throws RangeError past ~120k arguments and this module sits outside any try/catch, which would break the advisory exit-0 contract; fold max in a reduce
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/manifest-lint-main.js
    severity: medium
    pattern: a lint-time reader of a manifest-supplied file-ref (paths.dod/scripts/backlog.ref) that falls back to reading the bare path is an arbitrary-local-file-read + existence-oracle when linting an untrusted clone; route every manifest file-ref through the same realpath containment the memory/policy helpers use (containByRealpath against the repo root), fail-closed
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/dod.js
    severity: low
    pattern: a structured-doc parser that opens a frontmatter block but mis-types the YAML should FAIL LOUD; only a genuinely absent frontmatter block returns null — and "present" means LINE 1 only (mid-file --- are markdown horizontal rules, the docs/DOD.md case). DoD auto criteria may only assert gates recorded BEFORE dod-assert runs (implementation/review) — the validation gate cannot evidence itself
    confidence: 1
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: a cross-report comparison keyed on per-session run ids can never match a committed baseline — the feature ships dead with green tests; compare per-phase MEANS (corpus-size-invariant, sums turn drift into a corpus-size counter) and keep the math NaN-safe (a malformed group contributes 0, never NaN — NaN silently swallows the flag while null renders visibly as "new")
    confidence: 1
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/intention.js
    severity: high
    pattern: a review-fix that reroutes a value through a NEW helper can silently drop an invariant the replaced path guaranteed (never-throws broke when the coverage check moved from the try/catch matcher to an unguarded one) — re-verify the invariant on the fix delta, not just the finding; an adversarial convergence reviewer scoped to the fix-delta catches it
    confidence: 1
    provenance:
      run: intention-port
      commit: 35cd184
      date: '2026-07-03'
  - concern: findings
    file: engine/src/hygiene-lint-core.js
    severity: medium
    pattern: a size/DoS cap added to the scan-path read must ALSO cover the waiver-source read — ci.sh passes each touched .md as both a --waiver-source AND a scanned file, so collectWaived reads it whole (uncapped) before scanFile's guard ever applies; a huge touched markdown OOMs the gate. Extract ONE capped-read helper (statSync-then-skip-then-read) used by both paths; keep the distinct stderr label per path so existing 'cannot read waiver source' assertions stay green
    confidence: 1
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: scripts/ci.sh
    severity: medium
    pattern: 'to compute a git-diff touched set ONCE and feed two consumers while keeping git -z NUL-safety, use a NUL-delimited temp file read twice (printf ''%s\0'' + read -r -d '''' + trap rm EXIT) — bash cannot hold NUL in a variable and macOS bash 3.2 lacks readarray -d, so a shared newline-joined var re-loses -z''s guarantee for embedded-newline names. Also: ci.sh must NOT 2>/dev/null a resolver whose non-zero-exit carries a deliberate reason (a typo''d hygiene.gate would silently degrade to advisory); drop the suppression, keep || echo <default> as the fail-open'
    confidence: 1
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: engine/stryker.conf.json
    severity: medium
    pattern: extracting Stryker survivors with a fixed line-window (sed -n A,Bp over the report) silently clips survivors beyond the window and under-triages — grep the FULL report for '[Survived]'/'[No coverage]', and treat a scoped re-mutation of only the touched file as the authoritative post-triage check
    confidence: 1
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/init-land-main.js
    severity: medium
    pattern: a default-dependency factory (execFileSync + stderr parse, e.g. buildLintDep) survives mutation because every unit test injects a fake dep away and the .bin subprocess test runs a fresh node the Stryker in-process instrumentation cannot observe — kill by exporting the factory and adding an in-process test driving the real dep against a real subprocess; genuinely-unreachable defensive fallbacks are documented equivalents
    confidence: 1
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/config-resolve-main.js
    severity: medium
    pattern: an identity containByRealpath test-double (root,target)=>target turns the join(home,'.claude') path-literal and the scope-guard conditional into equivalent mutants — kill with a recording spy asserting the exact root arg for user scope and asserting containment is never consulted for local scope
    confidence: 1
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: adapters/pi/src/tool-call-hook.js
    severity: high
    pattern: 'a field-bridge that prefers the guard''s INSPECTED field over the field the tool actually EXECUTES on lets a decoy mask an escape — pi writes to `path`, so bridging `file_path ?? path` let an in-tree file_path decoy hide an out-of-tree path from the containment guard; bridge the authoritative field the tool acts on (map `path` to file_path unconditionally). Also: only map the tool names the shared predicate branches on (Bash/Write/Edit) — inert casing entries are dead code'
    confidence: 1
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: adapters/pi/test/cli.test.js
    severity: medium
    pattern: cli.test.js spawns the REAL pi binary via spawnSync and is written for CI where pi is ABSENT (main exits 2 fast). In a dev sandbox where pi IS installed, the real spawn does slow network/provider work and the full adapters/pi suite / bash scripts/ci.sh hangs for tens of minutes. Reproduce CI conditions by prepending a fast-failing `pi` stub (a 2-line `exit 2` script) to PATH — node/npx stay real since they resolve elsewhere on PATH
    confidence: 1
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: scripts/ci.sh
    severity: high
    pattern: the installed-binary hang is NOT pi-specific — ci.sh runs every adapter suite, so ANY agent binary installed on the dev box (pi, opencode, copilot) makes its suite do real provider work and hangs the gate for tens of minutes. Prepend a fast-failing stub for ALL agent binaries to PATH before every ci.sh run, not just the one being worked on. The cost of missing it is a dead sub-agent — a 26-minute part-implementer was lost to exactly this
    confidence: 2
    provenance:
      run: native-copilot-binding
      commit: 43d5b30
      date: '2026-07-20'
  - concern: findings
    file: docs/design/native-copilot-binding.md
    severity: medium
    pattern: scripts/design-lint.sh REQUIRES the literal heading `## Decision candidates`. A scope-fold revision that renames it to a more accurate `## Settled decisions` turns ci.sh red. Keep the heading and put the settled framing in the prose beneath it — the sibling design docs keep that heading for this mechanical reason, not by style preference
    confidence: 1
    provenance:
      run: native-copilot-binding
      commit: 8dd16f0
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/README.md
    severity: high
    pattern: 'do NOT copy shared craft skill bodies into an adapter to satisfy single-sourcing — the shared bodies legitimately carry ADR/phase refs and one bare `${CLAUDE_PLUGIN_ROOT}`, so copying forces hygiene-rule exemptions on the most drift-prone files. Load them BY REFERENCE instead (pi declares `"skills": ["skills"]`; copilot passes the repo root as a plugin dir). Verified live — a repo-root plugin dir loads all 19 shared skills with `source: plugin` and `userInvocable: true`, so drift becomes structurally impossible rather than test-enforced and both exemptions disappear'
    confidence: 1
    provenance:
      run: native-copilot-binding
      commit: 545d4d2
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/src/deny-tool-args.js
    severity: high
    pattern: Copilot's `--deny-tool` is PREFIX matching on the raw command string, not argv parsing. `shell(git push)` blocks `git push --force origin main` but NOT `git -C . push`; `shell(git clean -fd)` does not block the reordered `git clean -df`. Wildcards do not work (`shell(*push*)`, `shell(git *push*)`, `shell(git)` match nothing); only the documented `shell(cmd:*)` form works, and `shell(git:*)` denies ALL git which breaks a git-heavy harness. Enumerate realistic flag-order/long-form variants and document the interposed-global-option gap honestly — never claim adversarial enforcement
    confidence: 2
    provenance:
      run: native-copilot-binding
      commit: 2eda333
      date: '2026-07-20'
  - concern: findings
    file: engine/src/observability/adapters/copilot/telemetry.js
    severity: high
    pattern: an OTel file exporter emits a MIXED stream where the same tokens appear three times — on leaf `chat` spans, summed again on the parent `invoke_agent` span, and again in a `gen_ai.client.token.usage` metric record. Ingesting every token-bearing record inflates cost ~3x. Discriminate STRUCTURALLY (`kind` present AND `instrumentationScope.name`), never by record name, and count leaf spans only. Also a `since` cutoff comparing a raw timestamp against an ISO string fails OPEN when the timestamp is numeric (number < string coerces to NaN) — normalise both sides to epoch ms
    confidence: 1
    provenance:
      run: native-copilot-binding
      commit: 27e9c72
      date: '2026-07-20'
  - concern: findings
    file: docs/GUIDE-concepts.md
    severity: medium
    pattern: hand-drawn ASCII box diagrams ship ragged right borders invisible while editing; generate them with a fixed-width padding builder and verify column-constant edges in DISPLAY columns (box glyphs are 3-byte UTF-8, so byte-length checks false-alarm) before committing
    confidence: 1
    provenance:
      run: communication-revamp-four-frames
      commit: 10a1ecf
      date: '2026-07-24'
  - concern: findings
    file: agents/reviewer.md
    severity: medium
    pattern: editing a shared agents/*.md body requires syncing SIX adapter mirrors in one pass (copilot/codex/cursor/antigravity/opencode keep own frontmatter + shared body; aider is body-only with leading blank lines stripped) — the drift guards are per-adapter byte-identity tests that surface one red suite at a time, so sweep grep -rln the body's first sentence across adapters/ before running the gate
    confidence: 1
    provenance:
      run: sp9-findings-adoption
      commit: '9184452'
      date: '2026-07-26'
  - concern: findings
    file: test/hygiene-gates-ci.test.js
    severity: medium
    pattern: the run_prose_lint excuse-glob case-arm in scripts/ci.sh is pinned byte-wise by this test — every glob clause added or retargeted must extend the pinned regex in the SAME change, or the suite goes red one part at a time (bit three separate parts in one run)
    confidence: 1
    provenance:
      run: docs-audience-split
      commit: e59ca69
      date: '2026-07-27'
  - concern: findings
    file: engine/src/findings.js
    severity: high
    pattern: an equivalent-mutant claim resting on "the input cannot contain a newline" is FALSE — JS `.` also excludes CR, U+2028 and U+2029, so an interior CR reaches the pattern and the anchor is load-bearing. Probe with a CR before documenting ANY anchor mutant as equivalent; 4 of 7 claims in one file died to this, and 2 of them silently widened scope
    confidence: 2
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: a tool that rewrites files from a frontmatter body MUST verify the opened fence actually CLOSES — an awk `infence && !closed` rule silently swallows the rest of the file, extracting an empty body that truncates every mirror (a body-only mirror to 0 bytes); the mirror-side twin instead appends the body unboundedly on every run
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: '`[a-z]*` is NOT ASCII under en_US.UTF-8 — bash bracket-expression collation makes it match README. Set LC_ALL=C for byte-stable case globs and sort in any script whose behaviour depends on them'
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: docs/contributing/adr/
    severity: medium
    pattern: an ADR consequence that reasons ABOUT a regex instead of RUNNING it can ship a false claim that survives ratification — here "the retired form will now throw" was actually a silent mis-scope. Execute every behavioural claim an ADR makes before ratifying it
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: BACKLOG.md
    severity: medium
    pattern: a scoped backlog entry's own description of the tree drifts and can be simply wrong — this run found 5 recorded premises false or mis-framed (a trigger characterisation, a colon-rejection claim, which file held the wrong prose, a dedupe dropping both entries not one, a subtotal read as a total). Re-measure every premise before designing a fix for it, and close by evidence when it no longer holds
    confidence: 2
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/run-ledger.sh
    severity: high
    pattern: 'once a file is read back as authority (injected into the model, driving a rebuild), any in-tree path a clone can influence is an attack surface: committed files, case variants on case-insensitive filesystems, submodules; keep run state inside the git common dir and resolve it with safe.bareRepository=explicit rather than patching each vector'
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: findings
    file: scripts/run-ledger.sh
    severity: high
    pattern: git ls-files tracked-ness is case-sensitive and reads only the superproject index, so on APFS a committed case variant or a file inside a submodule looks untracked; never trust an in-tree file because it appears untracked
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: findings
    file: hooks/reorient-after-compact.sh
    severity: medium
    pattern: 'an awk pass over ledger or transcript bytes must run under LC_ALL=C: macOS awk aborts on invalid UTF-8 in a multibyte locale and the hook silently prints nothing'
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: findings
    file: hooks/bound-run.sh
    severity: low
    pattern: 'a control-character strip must loop to a fixpoint over bounded input: one gsub pass lets spliced C0 bytes reassemble C1 or bidi sequences, and an unbounded fixpoint is quadratic on nested invalid sequences'
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: findings
    file: test/run-ledger.test.js
    severity: medium
    pattern: a planted-input matrix must run through every verb that reads the input, and each case must be rejected by the check its label names, not an earlier unrelated one
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: findings
    file: skills/run/SKILL.md
    severity: medium
    pattern: after a teardown step, state where each later call runs (the worktree is gone) and make the rebuild detect an irreversible step already done instead of re-running it
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: resolver-wiring
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: schema-module
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 5
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: manifest-enum-knob
    outcome: pass
    confidence: 3
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: port-field
    outcome: pass
    confidence: 2
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: shell-script
    outcome: pass
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: hook-script
    outcome: pass
    confidence: 1
    provenance:
      run: auto-compaction-safety
      commit: 32c1976
      date: '2026-09-22'
  - concern: part-sizing
    size: adapter-field
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
- confidence: 5 | provenance: 32c1976 / 2026-09-22

## gate-cmd
- confidence: 5 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 32c1976 / 2026-09-22

## validation-tool
- confidence: 5 | provenance: 32c1976 / 2026-09-22

## findings
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: f17d07e / 2026-06-28
- confidence: 1 | provenance: daf7f05 / 2026-07-03
- confidence: 1 | provenance: daf7f05 / 2026-07-03
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 35cd184 / 2026-07-03
- confidence: 1 | provenance: aac0299 / 2026-07-04
- confidence: 1 | provenance: aac0299 / 2026-07-04
- confidence: 1 | provenance: cb48a0c / 2026-07-04
- confidence: 1 | provenance: cb48a0c / 2026-07-04
- confidence: 1 | provenance: cb48a0c / 2026-07-04
- confidence: 1 | provenance: bb8d2cd / 2026-07-20
- confidence: 1 | provenance: bb8d2cd / 2026-07-20
- confidence: 2 | provenance: 43d5b30 / 2026-07-20
- confidence: 1 | provenance: 8dd16f0 / 2026-07-20
- confidence: 1 | provenance: 545d4d2 / 2026-07-20
- confidence: 2 | provenance: 2eda333 / 2026-07-20
- confidence: 1 | provenance: 27e9c72 / 2026-07-20
- confidence: 1 | provenance: 10a1ecf / 2026-07-24
- confidence: 1 | provenance: 9184452 / 2026-07-26
- confidence: 1 | provenance: e59ca69 / 2026-07-27
- confidence: 2 | provenance: f6639d2 / 2026-07-31
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: f6639d2 / 2026-07-31
- confidence: 1 | provenance: f6639d2 / 2026-07-31
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: f6639d2 / 2026-07-31
- confidence: 2 | provenance: f6639d2 / 2026-07-31
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22

## part-sizing
- confidence: 5 | provenance: 32c1976 / 2026-09-22
- confidence: 5 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 5 | provenance: 32c1976 / 2026-09-22
- confidence: 3 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
- confidence: 1 | provenance: 32c1976 / 2026-09-22
