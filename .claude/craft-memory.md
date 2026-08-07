---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
findings:
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: high
    pattern: one assistant response is written as several transcript lines (one per content block) sharing one message.id and repeating the same per-request input and cache_read; emitting per line multi-counts them ~2x, so emission must be keyed on message.id with the last line winning
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: price entries are per-MTok while token counts are per-unit; the divisor belongs on the summed rate-product at each emitting site, never inside the price table, and one emitter does not inherit the composed conversion
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: medium
    pattern: map lookups keyed by a transcript- or sidecar-controlled string must gate on Object.hasOwn; an inherited Object.prototype member serializes as a dropped key or an empty object into a committed report whose schema contracts string or null
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: medium
    pattern: spreading a corpus-scaled array into Math.max throws RangeError past ~120k arguments and this module sits outside any try/catch, which would break the advisory exit-0 contract; fold max in a reduce
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: findings
    file: skills/integrate/SKILL.md
    severity: low
    pattern: this repo's main branch requires an approving review before merge, so the squash-merge of a craft PR is performed by the operator (repo admin) rather than by the session; teardown proceeds normally once the operator confirms the merge landed
    confidence: 0.65
    provenance:
      run: decisions-remote-slack-example
      commit: 9229d3f
      date: '2026-07-27'
  - concern: findings
    file: skills/init/SKILL.md
    severity: medium
    pattern: LLM-prose bash temp-file handling needs trailing-X mktemp and reuse of the validated path, not raw-name re-splice
    confidence: 0.5
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: findings
    file: skills/run/SKILL.md
    severity: medium
    pattern: a sub-agent renumbering an ordered list updates the headers it touches but leaves cross-references (step-N mentions) stale; sweep all step-N references after any insert or renumber
    confidence: 0.5
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: findings
    file: skills/validation/SKILL.md
    severity: medium
    pattern: a per-hunk mutation triager can wrongly declare a survivor "already covered" by an existing assertion; re-run the scoped mutation after triage to confirm the kills landed. A weak includes(", ") passes on an incidental message comma — assert a real adjacent list-pair to actually pin a separator
    confidence: 0.65
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest.js
    severity: low
    pattern: in mutation triage, a typeof object-guard on a label/formatting helper that reads only optional props (id/after/before) is an EQUIVALENT mutant — a primitive entry enters the block, reads undefined, and falls through to the same index return; prove benign rather than chasing it. Conversely a primary-field branch can be unobservable through the public API unless an entry carries the field AND an error-triggering condition simultaneously (e.g. a nested insert that also has a top-level id) — that pairing is the kill
    confidence: 0.5
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest-lint-main.js
    severity: medium
    pattern: a lint-time reader of a manifest-supplied file-ref (paths.dod/scripts/backlog.ref) that falls back to reading the bare path is an arbitrary-local-file-read + existence-oracle when linting an untrusted clone; route every manifest file-ref through the same realpath containment the memory/policy helpers use (containByRealpath against the repo root), fail-closed
    confidence: 0.7
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/contain.js
    severity: low
    pattern: defense-in-depth lexical+realpath containment layers produce EQUIVALENT mutants (each layer alone catches the other's escapes); non-ENOENT realpath-error rethrow and the filesystem-root-termination branch are unreachable/equivalent — document `// equivalent mutant` (source-hygiene-allowlisted) rather than chase an unkillable test. realpath returns the LEXICAL path so callers retain a TOCTOU/hardlink window — document the limitation, do not claim atomic-open containment
    confidence: 0.6
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/dod.js
    severity: low
    pattern: a structured-doc parser that opens a frontmatter block but mis-types the YAML should FAIL LOUD; only a genuinely absent frontmatter block returns null — and "present" means LINE 1 only (mid-file --- are markdown horizontal rules, the docs/DOD.md case). DoD auto criteria may only assert gates recorded BEFORE dod-assert runs (implementation/review) — the validation gate cannot evidence itself
    confidence: 0.75
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: a cross-report comparison keyed on per-session run ids can never match a committed baseline — the feature ships dead with green tests; compare per-phase MEANS (corpus-size-invariant, sums turn drift into a corpus-size counter) and keep the math NaN-safe (a malformed group contributes 0, never NaN — NaN silently swallows the flag while null renders visibly as "new")
    confidence: 0.75
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 0.7
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/intention.js
    severity: high
    pattern: a review-fix that reroutes a value through a NEW helper can silently drop an invariant the replaced path guaranteed (never-throws broke when the coverage check moved from the try/catch matcher to an unguarded one) — re-verify the invariant on the fix delta, not just the finding; an adversarial convergence reviewer scoped to the fix-delta catches it
    confidence: 0.7
    provenance:
      run: intention-port
      commit: 35cd184
      date: '2026-07-03'
  - concern: findings
    file: engine/src/hygiene-lint-core.js
    severity: medium
    pattern: a size/DoS cap added to the scan-path read must ALSO cover the waiver-source read — ci.sh passes each touched .md as both a --waiver-source AND a scanned file, so collectWaived reads it whole (uncapped) before scanFile's guard ever applies; a huge touched markdown OOMs the gate. Extract ONE capped-read helper (statSync-then-skip-then-read) used by both paths; keep the distinct stderr label per path so existing 'cannot read waiver source' assertions stay green
    confidence: 0.75
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: scripts/ci.sh
    severity: medium
    pattern: 'to compute a git-diff touched set ONCE and feed two consumers while keeping git -z NUL-safety, use a NUL-delimited temp file read twice (printf ''%s\0'' + read -r -d '''' + trap rm EXIT) — bash cannot hold NUL in a variable and macOS bash 3.2 lacks readarray -d, so a shared newline-joined var re-loses -z''s guarantee for embedded-newline names. Also: ci.sh must NOT 2>/dev/null a resolver whose non-zero-exit carries a deliberate reason (a typo''d hygiene.gate would silently degrade to advisory); drop the suppression, keep || echo <default> as the fail-open'
    confidence: 0.75
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: engine/stryker.conf.json
    severity: medium
    pattern: extracting Stryker survivors with a fixed line-window (sed -n A,Bp over the report) silently clips survivors beyond the window and under-triages — grep the FULL report for '[Survived]'/'[No coverage]', and treat a scoped re-mutation of only the touched file as the authoritative post-triage check
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/init-land-main.js
    severity: medium
    pattern: a default-dependency factory (execFileSync + stderr parse, e.g. buildLintDep) survives mutation because every unit test injects a fake dep away and the .bin subprocess test runs a fresh node the Stryker in-process instrumentation cannot observe — kill by exporting the factory and adding an in-process test driving the real dep against a real subprocess; genuinely-unreachable defensive fallbacks are documented equivalents
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/config-resolve-main.js
    severity: medium
    pattern: an identity containByRealpath test-double (root,target)=>target turns the join(home,'.claude') path-literal and the scope-guard conditional into equivalent mutants — kill with a recording spy asserting the exact root arg for user scope and asserting containment is never consulted for local scope
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: adapters/pi/src/tool-call-hook.js
    severity: high
    pattern: a field-bridge that prefers the guard's INSPECTED field over the field the tool actually EXECUTES on lets a decoy mask an escape — pi writes to `path`, so bridging `file_path ?? path` let an in-tree file_path decoy hide an out-of-tree path from the containment guard; bridge the authoritative field the tool acts on (map `path` to file_path unconditionally). Also: only map the tool names the shared predicate branches on (Bash/Write/Edit) — inert casing entries are dead code
    confidence: 0.7
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: adapters/pi/test/cli.test.js
    severity: medium
    pattern: cli.test.js spawns the REAL pi binary via spawnSync and is written for CI where pi is ABSENT (main exits 2 fast). In a dev sandbox where pi IS installed, the real spawn does slow network/provider work and the full adapters/pi suite / bash scripts/ci.sh hangs for tens of minutes. Reproduce CI conditions by prepending a fast-failing `pi` stub (a 2-line `exit 2` script) to PATH — node/npx stay real since they resolve elsewhere on PATH
    confidence: 0.8
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: scripts/ci.sh
    severity: high
    pattern: the installed-binary hang is NOT pi-specific — ci.sh runs every adapter suite, so ANY agent binary installed on the dev box (pi, opencode, copilot) makes its suite do real provider work and hangs the gate for tens of minutes. Prepend a fast-failing stub for ALL agent binaries to PATH before every ci.sh run, not just the one being worked on. The cost of missing it is a dead sub-agent — a 26-minute part-implementer was lost to exactly this
    confidence: 0.9
    provenance:
      run: native-copilot-binding
      commit: 43d5b30
      date: '2026-07-20'
  - concern: findings
    file: docs/design/native-copilot-binding.md
    severity: medium
    pattern: scripts/design-lint.sh REQUIRES the literal heading `## Decision candidates`. A scope-fold revision that renames it to a more accurate `## Settled decisions` turns ci.sh red. Keep the heading and put the settled framing in the prose beneath it — the sibling design docs keep that heading for this mechanical reason, not by style preference
    confidence: 0.85
    provenance:
      run: native-copilot-binding
      commit: 8dd16f0
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/README.md
    severity: high
    pattern: do NOT copy shared craft skill bodies into an adapter to satisfy single-sourcing — the shared bodies legitimately carry ADR/phase refs and one bare `${CLAUDE_PLUGIN_ROOT}`, so copying forces hygiene-rule exemptions on the most drift-prone files. Load them BY REFERENCE instead (pi declares `"skills": ["skills"]`; copilot passes the repo root as a plugin dir). Verified live — a repo-root plugin dir loads all 19 shared skills with `source: plugin` and `userInvocable: true`, so drift becomes structurally impossible rather than test-enforced and both exemptions disappear
    confidence: 0.85
    provenance:
      run: native-copilot-binding
      commit: 545d4d2
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/src/deny-tool-args.js
    severity: high
    pattern: Copilot's `--deny-tool` is PREFIX matching on the raw command string, not argv parsing. `shell(git push)` blocks `git push --force origin main` but NOT `git -C . push`; `shell(git clean -fd)` does not block the reordered `git clean -df`. Wildcards do not work (`shell(*push*)`, `shell(git *push*)`, `shell(git)` match nothing); only the documented `shell(cmd:*)` form works, and `shell(git:*)` denies ALL git which breaks a git-heavy harness. Enumerate realistic flag-order/long-form variants and document the interposed-global-option gap honestly — never claim adversarial enforcement
    confidence: 0.9
    provenance:
      run: native-copilot-binding
      commit: 2eda333
      date: '2026-07-20'
  - concern: findings
    file: engine/src/observability/adapters/copilot/telemetry.js
    severity: high
    pattern: an OTel file exporter emits a MIXED stream where the same tokens appear three times — on leaf `chat` spans, summed again on the parent `invoke_agent` span, and again in a `gen_ai.client.token.usage` metric record. Ingesting every token-bearing record inflates cost ~3x. Discriminate STRUCTURALLY (`kind` present AND `instrumentationScope.name`), never by record name, and count leaf spans only. Also a `since` cutoff comparing a raw timestamp against an ISO string fails OPEN when the timestamp is numeric (number < string coerces to NaN) — normalise both sides to epoch ms
    confidence: 0.85
    provenance:
      run: native-copilot-binding
      commit: 27e9c72
      date: '2026-07-20'
  - concern: findings
    file: docs/GUIDE-concepts.md
    severity: medium
    pattern: hand-drawn ASCII box diagrams ship ragged right borders invisible while editing; generate them with a fixed-width padding builder and verify column-constant edges in DISPLAY columns (box glyphs are 3-byte UTF-8, so byte-length checks false-alarm) before committing
    confidence: 0.7
    provenance:
      run: communication-revamp-four-frames
      commit: 10a1ecf
      date: '2026-07-24'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: low
    pattern: allowlist comments that hardcode a line number re-stale on unrelated prose edits to the scanned file — keep allowlist comments line-agnostic to match the deliberately line-agnostic regex
    confidence: 0.6
    provenance:
      run: communication-revamp-four-frames
      commit: 10a1ecf
      date: '2026-07-24'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: the hygiene allowlist filters per grep LINE — a multi-line survivor-proof comment whose continuation line carries a banned token without the allowlist phrase trips the gate; keep banned tokens on the phrase-bearing line or reword continuations
    confidence: 0.5
    provenance:
      run: readme-drift-guards
      commit: b63c79c
      date: '2026-07-25'
  - concern: findings
    file: engine/src/contract-assemble-main.js
    severity: medium
    pattern: read piped stdin via fd 0, never the /dev/stdin device path — ENXIO on Linux CI runners while green on macOS; device-path I/O is a local-green-runner-red class, verify on the runner
    confidence: 0.5
    provenance:
      run: readme-drift-guards
      commit: b63c79c
      date: '2026-07-25'
  - concern: findings
    file: agents/reviewer.md
    severity: medium
    pattern: editing a shared agents/*.md body requires syncing SIX adapter mirrors in one pass (copilot/codex/cursor/antigravity/opencode keep own frontmatter + shared body; aider is body-only with leading blank lines stripped) — the drift guards are per-adapter byte-identity tests that surface one red suite at a time, so sweep grep -rln the body's first sentence across adapters/ before running the gate
    confidence: 0.8
    provenance:
      run: sp9-findings-adoption
      commit: '9184452'
      date: '2026-07-26'
  - concern: findings
    file: examples/deliberation-review/workflow.md
    severity: medium
    pattern: an example that teaches an agent output format must emit the exact shape the engine normalizer parses — a pipe-delimited findings format taught in prose failed normalize-findings (pipe is reserved for the optional fix); run taught formats through the real parser before shipping
    confidence: 0.6
    provenance:
      run: sp9-findings-adoption
      commit: '9184452'
      date: '2026-07-26'
  - concern: findings
    file: test/hygiene-gates-ci.test.js
    severity: medium
    pattern: the run_prose_lint excuse-glob case-arm in scripts/ci.sh is pinned byte-wise by this test — every glob clause added or retargeted must extend the pinned regex in the SAME change, or the suite goes red one part at a time (bit three separate parts in one run)
    confidence: 0.8
    provenance:
      run: docs-audience-split
      commit: e59ca69
      date: '2026-07-27'
  - concern: findings
    file: docs/contributing/plan/examples-catalog-gap-closure.md
    severity: medium
    pattern: a plan/design doc that quotes markdown index-row snippets as inline code with escaped backticks breaks the code span and exposes raw relative links, which the CI link checker resolves against the doc's own directory and fails — fence any quoted link-bearing snippet in a text code block instead of an inline span
    confidence: 0.6
    provenance:
      run: examples-catalog-gap-closure
      commit: be64001
      date: '2026-07-27'
  - concern: findings
    file: examples/README.md
    severity: medium
    pattern: when adding rows to a doubly-indexed catalog, cross-check every derived cell (tier/cost class) against the canonical table, not just presence and numbering — a tier cell drifted while presence and numbering were both guarded
    confidence: 0.5
    provenance:
      run: examples-catalog-gap-closure
      commit: 7d72b47
      date: '2026-07-27'
  - concern: findings
    file: engine/src/findings.js
    severity: high
    pattern: an equivalent-mutant claim resting on "the input cannot contain a newline" is FALSE — JS `.` also excludes CR, U+2028 and U+2029, so an interior CR reaches the pattern and the anchor is load-bearing. Probe with a CR before documenting ANY anchor mutant as equivalent; 4 of 7 claims in one file died to this, and 2 of them silently widened scope
    confidence: 0.9
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 0.9
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: a tool that rewrites files from a frontmatter body MUST verify the opened fence actually CLOSES — an awk `infence && !closed` rule silently swallows the rest of the file, extracting an empty body that truncates every mirror (a body-only mirror to 0 bytes); the mirror-side twin instead appends the body unboundedly on every run
    confidence: 0.85
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: `[a-z]*` is NOT ASCII under en_US.UTF-8 — bash bracket-expression collation makes it match README. Set LC_ALL=C for byte-stable case globs and sort in any script whose behaviour depends on them
    confidence: 0.8
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 0.9
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: docs/contributing/adr/
    severity: medium
    pattern: an ADR consequence that reasons ABOUT a regex instead of RUNNING it can ship a false claim that survives ratification — here "the retired form will now throw" was actually a silent mis-scope. Execute every behavioural claim an ADR makes before ratifying it
    confidence: 0.85
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: BACKLOG.md
    severity: medium
    pattern: a scoped backlog entry's own description of the tree drifts and can be simply wrong — this run found 5 recorded premises false or mis-framed (a trigger characterisation, a colon-rejection claim, which file held the wrong prose, a dedupe dropping both entries not one, a subtotal read as a total). Re-measure every premise before designing a fix for it, and close by evidence when it no longer holds
    confidence: 0.9
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 0.8
    provenance:
      run: usage-miner-subagent-transcripts
      commit: 5bdbf5a
      date: '2026-08-07'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: validator
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 1
    provenance:
      run: decisions-remote-slack-example
      commit: 9229d3f
      date: '2026-07-27'
  - concern: part-sizing
    size: resolver-wiring
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: bash-helper
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: test-helper
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: part-sizing
    size: test-edit
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: part-sizing
    size: bats-guard
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: part-sizing
    size: security-module
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: schema-module
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: structure-lint
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: examples-adapter
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: bats-port
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: relocation
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: part-sizing
    size: native-surface
    outcome: pass
    confidence: 1
    provenance:
      run: native-pi-binding
      commit: bd4d8d8
      date: '2026-07-20'
  - concern: part-sizing
    size: bash-sync-tool
    outcome: pass
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: part-sizing
    size: mutation-baseline-file
    outcome: pass
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: part-sizing
    size: review-fix-batch
    outcome: pass
    confidence: 1
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
---

# craft memory store
> Machine-maintained advisory cache (ADR-116/120). Edit the YAML frontmatter above, not this body.

## toolchain
- npm (nested: engine) — confidence 1 | 3078c6e / 2026-06-26

## gate-cmd
- part: `node --test 'test/**/*.test.js'` — confidence 1 | 3078c6e / 2026-06-26
- phase: `bash scripts/ci.sh` — confidence 1 | 3078c6e / 2026-06-26

## validation-tool
- stryker (config fingerprint a9b6ac12ad7061bf) — confidence 1 | 9b618d2 / 2026-07-31 (RUN this batch — 575 mutants per-hunk over 6 codex adapter sources, 89.39%→99.48%, 57 killed / 3 documented equivalent; ONE combined --mutate flag, repeated flags drop all but the last. Adding comment lines to a mutated file pushes its tail past the recorded hunk range — re-derive ranges before a re-run or the instrumented count silently shrinks and reads as a clean score)

## findings
- skills/init/SKILL.md — confidence 0.5 | f4785cd (not re-observed since P25 — decayed)
- skills/run/SKILL.md — confidence 0.5 | c8b7685 (prose-edited in P27 but renumber-staleness not re-observed — decayed)
- engine/src/manifest-lint-main.js — confidence 0.7 | f17d07e (manifest file-refs must be realpath-contained; bare-path fallback = arbitrary-read oracle when linting untrusted clones)
- engine/src/contain.js — confidence 0.6 | f17d07e (defense-in-depth layers ⇒ equivalent mutants; returns lexical path ⇒ TOCTOU/hardlink window — document, don't over-claim)
- engine/src/dod.js — confidence 0.75 | daf7f05 (frontmatter opens at LINE 1 only — mid-file `---` are hr rules, the docs/DOD.md case; DoD auto criteria may only assert gates recorded before dod-assert runs — the validation gate cannot evidence itself)
- engine/src/observability/usage-aggregate.js — confidence 0.75 | daf7f05 (cross-report matching keyed on session run-ids ships a dead feature with green tests; drift compares per-phase MEANS, NaN-safe — malformed group contributes 0, null renders "new")
- test/source-hygiene.test.js — confidence 0.7 | daf7f05 (a location rule with zero real-tree matches passes vacuously — pin known artifact locations positively beside the synthetic offender)
- engine/bin (shim convention) — confidence 0.7 | 5451144 (engine bins are 5-line shims over engine/src/<name>-main.js; put bin logic in engine/src so Stryker covers it — mutate scope is engine/src/** ONLY, bin files are never mutated; bin spawn-smoke tests belong in engine/test/<name>.bin.test.js. Do NOT relocate a bin's tests to repo-root test/ on a mutation-coverage rationale — that argument is void since bins aren't mutated.)
- adapters/pi/src/tool-call-hook.js — confidence 0.7 | bb8d2cd (a field-bridge that prefers the guard's INSPECTED field over the field the tool EXECUTES on lets a decoy mask an escape; pi writes `path`, so bridge `path`→file_path unconditionally; only map the tool names the shared predicate branches on — inert casing entries are dead code)
- adapters/pi/test/cli.test.js — confidence 0.8 | bb8d2cd (spawns the REAL pi via spawnSync, written for CI where pi is ABSENT → main exits 2 fast; in a dev sandbox with pi installed the spawn does slow provider work and the pi suite / ci.sh hangs tens of minutes — prepend a fast-failing `pi` stub (`exit 2`) to PATH to reproduce CI; node/npx stay real)
- docs/GUIDE-concepts.md — confidence 0.7 | 10a1ecf (hand-drawn ASCII diagrams ship ragged borders; generate via fixed-width padding builder, verify column-constant edges in display columns not bytes)
- test/source-hygiene.test.js — confidence 0.6 | 10a1ecf (allowlist comments hardcoding line numbers re-stale on unrelated prose edits; keep them line-agnostic like the regex)
- agents/reviewer.md — confidence 0.8 | 9184452 (shared agent-body edits need all six adapter mirrors synced in one pass; aider is body-only, leading blanks stripped; guards are byte-identity tests that go red one suite at a time)
- examples/deliberation-review/workflow.md — confidence 0.6 | 9184452 (taught output formats must round-trip through the real normalizer; pipe is reserved for the optional fix)
- test/hygiene-gates-ci.test.js — confidence 0.8 | e59ca69 (ci.sh excuse-glob case-arm is pinned byte-wise here; extend the pinned regex in the same change as any glob edit — bit three parts in one run)
- docs/contributing/plan/examples-catalog-gap-closure.md — confidence 0.6 | be64001 (inline-code snippets quoting markdown links with escaped backticks break the span and expose raw relative links the link-check CI resolves against the doc's dir; fence quoted link-bearing snippets in text blocks)
- examples/README.md — confidence 0.5 | 7d72b47 (doubly-indexed catalog rows: cross-check derived cells like tier against the canonical table, not just presence/numbering — a tier cell drifted while both were guarded)

- engine/src/filter-findings-main.js — confidence 0.8 | cb873b3 (a scope filter is a safety control: an aggregate-only drop notice hides PARTIAL drops, and echoing untrusted paths unescaped lets a newline forge log lines into orchestrator context — truncate+JSON.stringify and cap the enumeration, the trigger condition is also the all-drop condition)
- engine/src/findings.js — confidence 0.8 | cb873b3 (inferring a whole-file grant from a colon-free entry turns a mistyped range into a silent WIDEN — the mirror of the silent drop; require an explicit `:*` marker. Whole-file ranges start at 0, not 1: file-scoped findings are commonly reported at line 0)
- engine/src/plan-lint-main.js — confidence 0.75 | cb873b3 (a cwd-relative argv path must be resolve()d before containment or self-exclusion silently stops applying; suppressing wide overlaps to improve a warning-rate statistic discards the worst violations — vary the remedy wording instead)
- skills/validation/SKILL.md — confidence 0.8 | cb873b3 (an empty technique output parses as canonical and reads as a clean run — assert `[ -s "$out" ]` before branching; classify by normalize-findings EXIT CODE, never by reading the output, and give the branch an explicit else or the routing is unreachable)
- docs/contributing/design — confidence 0.7 | cb873b3 (calibration tables get flattering: state before AND after side by side, or a narrowing that moved nothing reads as an improvement)

- adapters/codex/src/hook-trust.js — confidence 0.9 | 9b618d2 (a guard-identity check must be anchored to the executed operand, never `includes` on a path tail: a trailing comment, a quoted argument, a flag value and a `.bak` lookalike all carry the tail while executing something else. Anchor on exactly-two-tokens + interpreter basename + operand suffix, and refuse `source: project` outright — a repo-supplied hook is what the trust gate exists to stop)
- adapters/codex/src/config-toml-trust.js — confidence 0.9 | 9b618d2 (a line-shaped TOML table-boundary rule must trim like its header match AND consume quoted segments, or a `]` inside a quoted key stops being a boundary and the edit lands in the NEXT table while reporting success. `["a"]` and a header-shaped line inside a multi-line string are irreducibly ambiguous — document the cost, don't pretend a post-condition catches it: a post-condition reusing the same extent helper passes on every input the helper gets wrong)
- adapters/codex/src/app-server-client.js — confidence 1 | 9b618d2 (codex app-server treats stdin EOF as SHUTDOWN: write the requests and leave stdin OPEN, bound the call with a timeout+kill instead. Closing it yields only the initialize response then exit 0. A fake child whose end() is inert makes every test green over this — model EOF-as-shutdown in the double or the regression is invisible)
- adapters/codex/src/atomic-write.js — confidence 0.8 | 9b618d2 (config rewrite = realpath first (a symlinked dotfile must not be replaced), random temp suffix + flag 'wx', chmod before rename, unlink on failure — but key the cleanup carve-out on WHICH call failed, not on the error code: an EEXIST from rename still owns a temp file this run created)
- adapters/codex/src/safe-text.js — confidence 0.8 | 9b618d2 (escaping for a human-visible safeguard must cover invisibles, not just C0+DEL — bidi overrides, zero-width, BOM, soft hyphen. Stay BMP-only: the emitted escape is 4 hex digits, so an astral escape parses as U+E000 + digits and silently writes a key that does not match)
- .claude/craft-memory.md (isolation method) — confidence 0.9 | 9b618d2 (mtime-find over a tool's real home proves FILESYSTEM isolation only. A copied auth.json shares a refresh token that rotates server-side, invalidating the operator's real credential with zero filesystem change — keep probe windows inside the access token's lifetime and expect a re-login)

- CR-probe before claiming an anchor mutant equivalent — confidence 0.9 | f6639d2 (JS `.` excludes CR/U+2028/U+2029, not just newline)
- bash find-into-array gates fail open — confidence 0.9 | f6639d2 (guard zero-enumeration + print a positive count line)
- verify the frontmatter fence CLOSES before rewriting a body — confidence 0.85 | f6639d2 (unclosed fence truncates every mirror)
- LC_ALL=C for case globs and sort — confidence 0.8 | f6639d2 (`[a-z]*` matches README under en_US.UTF-8)
- perf guards need a scaling ratio, not a message assertion — confidence 0.9 | f6639d2 (930x slower still reported ok)
- run every behavioural claim an ADR makes before ratifying — confidence 0.85 | f6639d2
- re-measure every backlog premise before fixing it — confidence 0.9 | f6639d2 (5 recorded premises were false this run)

## part-sizing
- bash-sync-tool: pass — confidence 1 | 7c8a4d1 (--check default/--write explicit, body-only, per-file separator preserved; guard kept independent of the tool)
- mutation-baseline-file: pass — confidence 1 | 3b1a6fb (whole-file triage in one part; every survivor killed or documented, 1:1)
- review-fix-batch: pass — confidence 1 | 06bcbcf (findings grouped by file into 3 disjoint concurrent batches, each one atomic commit)
- pure-module: pass — confidence 1 | a4849a1
- validator: pass — confidence 1 | a4849a1
- docs-prose: pass — confidence 1 | a4849a1
- resolver-wiring: pass — confidence 1 | a4849a1
- bash-helper: pass — confidence 1 | a4849a1 (re-observed in P27 — lock rename + grep-gate bats)
- test-helper: pass — confidence 1 | 3078c6e (P28 — with-cwd.js / empty-home.js isolators + unit tests)
- test-edit: pass — confidence 1 | 3078c6e (P28 — A2/A3/A4 hermeticity wraps, count-neutral)
- bats-guard: pass — confidence 1 | 3078c6e (P28 — hermetic-suite.bats + ci.sh repo-root step)
- security-module: pass — confidence 1 | f17d07e (contain.js realpath containment, symlink-escape tests via real fs.symlinkSync in mktemp)
- schema-module: pass — confidence 1 | f17d07e (dod.js parse/classify/assert-vs-evidence, injection-safe)
- structure-lint: pass — confidence 1 | f17d07e (backlog-lint/design-lint bash, execFileSync fixture tests)
- examples-adapter: pass — confidence 1 | f17d07e (github-issues via extends.backlog-adapters, host CLI confined to unscanned examples/)
- bats-port: pass — confidence 1 | f17d07e (12 bats→node:test, execFileSync runs real scripts, EXPECTED_PROC_TESTS guard)
- pure-aggregate-core: pass — confidence 1 | 71d0d40 (P29 usage-aggregate.js — vendor-neutral core over UsageEvent[]; deep-sorted byte-stable serialize; deterministic, time-from-event-data; 92.83% mutation)
- pricing-data-binding: pass — confidence 1 | 71d0d40 (P29 pricing-claude.js — DEFAULT_PRICES + --prices field-level merge + [1m] normalize; model-id literals OK in binding, hygiene bans only mutation-tooling+gh; 100% mutation)
- jsonl-parse-binding: pass — confidence 1 | 71d0d40 (P29 telemetry-claude.js — streaming parseLines/eventFromRollup, both Agent/Task shapes, redaction by positive field-selection; 96.49% mutation)
- cli-streaming-entrypoint: pass — confidence 1 | 71d0d40 (P29 usage-mine-main.js+bin — readline streaming, two-root containByRealpath, advisory no-op exit 0; injected io makes every error-path catch unit-testable)
- front-door-skill: pass — confidence 1 | 71d0d40 (P29 skills/metrics — zero-arg, mirrors craft:init, advisory; doc error-table must say exit-0/continue, never STOP)
- adapter-port-doc: pass — confidence 1 | 71d0d40 (P29 docs/adapters/telemetry.md — mirrors memory.md; report.json schema must byte-match serializeReport sortDeep output)
- relocation: pass — confidence 1 | daf7f05 (observability carve-out — 6 git-mv movers, import retargets only, suite unmodified)
- self-govern-frontmatter: pass — confidence 1 | 8501bd2 (subjects: frontmatter on an in-corpus page + assertFresh dogfood test; docs+test folded, no src delta)
- bash-enumerator-single-source: pass — confidence 1 | 98e267e (living-corpus.sh emits LC_ALL=C-sorted paths; ci.sh + test both consume; compare as Set not ordered array)
- lint-bin-port: pass — confidence 1 | cb873b3 (moving a bash lint to engine bin+src: keep the resolved gate string literal, document every deliberate divergence from the retired script in the module header, and pin each with a test — an unstated divergence in a gate is a silent behaviour flip)
- boundary-filter-bin: pass — confidence 1 | cb873b3 (pure predicate in findings.js + main(argv,io) over it; the safety-control discipline is escape+truncate+cap on anything echoed, since stderr lands in orchestrator context)
- lint-bin-module: pass — confidence 1 | 1a04acc (stub/prose lint = 6-line bin shim + pure src main(argv,io) mirroring intention-lint; self-exclusion + generative-marker + advisory/blocking exit tests)
- manifest-enum-knob: pass — confidence 1 | 1cce5cc (hygiene.gate mirrors intention.gate: frozen set + validateHygiene + dispatch; init-emit.test.js keeps its OWN TOP_KEYS — do not touch)
- ci-advisory-wiring: pass — confidence 1 | 6ebaf71 (ci.sh compute_touched→run_stub/prose_lint advisory; kept non-adjacent to run_intention_lint; token family in skills/run; each touched .md is its own --waiver-source; expected benign self-reference)
- standalone-skill: pass — confidence 1 | 19c3379 (prose-only craft:prune skill mirroring craft:metrics; propose-never-dispose + core.md fail-closed denylist)
- lint-mutation-triage: pass — confidence 1 | 45b7c5a (per-hunk stryker on lint bins: killable = clean-file --gate blocking→exit0, unreadable --waiver-source, prose capitalized single-word; equivalent = gate-default '', isSelf/waived {} early-return, read-error found-flag — exit-OR aggregation makes found unobservable when readError dominates)
- native-surface: pass — confidence 1 | bd4d8d8 (pi package: package.json `pi` manifest + keywords + settings.template.json + thin prompt-template dispatchers + one thin .ts extension wrapping tested src seams + README + a structure test that reads the .ts as TEXT; single-sourced procedure bodies, no re-authoring)
