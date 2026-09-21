---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
findings:
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: high
    pattern: one assistant response is written as several transcript lines (one per content block) sharing one message.id and repeating the same per-request input and cache_read; emitting per line multi-counts them ~2x, so emission must be keyed on message.id with the last line winning
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: price entries are per-MTok while token counts are per-unit; the divisor belongs on the summed rate-product at each emitting site, never inside the price table, and one emitter does not inherit the composed conversion
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/adapters/claude/telemetry.js
    severity: medium
    pattern: map lookups keyed by a transcript- or sidecar-controlled string must gate on Object.hasOwn; an inherited Object.prototype member serializes as a dropped key or an empty object into a committed report whose schema contracts string or null
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: medium
    pattern: spreading a corpus-scaled array into Math.max throws RangeError past ~120k arguments and this module sits outside any try/catch, which would break the advisory exit-0 contract; fold max in a reduce
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: skills/integrate/SKILL.md
    severity: low
    pattern: this repo's main branch requires an approving review before merge, so the squash-merge of a craft PR is performed by the operator (repo admin) rather than by the session; teardown proceeds normally once the operator confirms the merge landed
    confidence: 1
    provenance:
      run: decisions-remote-slack-example
      commit: 9229d3f
      date: '2026-07-27'
  - concern: findings
    file: skills/init/SKILL.md
    severity: medium
    pattern: LLM-prose bash temp-file handling needs trailing-X mktemp and reuse of the validated path, not raw-name re-splice
    confidence: 1
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: findings
    file: skills/run/SKILL.md
    severity: medium
    pattern: a sub-agent renumbering an ordered list updates the headers it touches but leaves cross-references (step-N mentions) stale; sweep all step-N references after any insert or renumber
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: findings
    file: skills/validation/SKILL.md
    severity: medium
    pattern: a per-hunk mutation triager can wrongly declare a survivor "already covered" by an existing assertion; re-run the scoped mutation after triage to confirm the kills landed. A weak includes(", ") passes on an incidental message comma — assert a real adjacent list-pair to actually pin a separator
    confidence: 1
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest.js
    severity: low
    pattern: in mutation triage, a typeof object-guard on a label/formatting helper that reads only optional props (id/after/before) is an EQUIVALENT mutant — a primitive entry enters the block, reads undefined, and falls through to the same index return; prove benign rather than chasing it. Conversely a primary-field branch can be unobservable through the public API unless an entry carries the field AND an error-triggering condition simultaneously (e.g. a nested insert that also has a top-level id) — that pairing is the kill
    confidence: 1
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest-lint-main.js
    severity: medium
    pattern: a lint-time reader of a manifest-supplied file-ref (paths.dod/scripts/backlog.ref) that falls back to reading the bare path is an arbitrary-local-file-read + existence-oracle when linting an untrusted clone; route every manifest file-ref through the same realpath containment the memory/policy helpers use (containByRealpath against the repo root), fail-closed
    confidence: 2
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/contain.js
    severity: low
    pattern: defense-in-depth lexical+realpath containment layers produce EQUIVALENT mutants (each layer alone catches the other's escapes); non-ENOENT realpath-error rethrow and the filesystem-root-termination branch are unreachable/equivalent — document `// equivalent mutant` (source-hygiene-allowlisted) rather than chase an unkillable test. realpath returns the LEXICAL path so callers retain a TOCTOU/hardlink window — document the limitation, do not claim atomic-open containment
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/dod.js
    severity: low
    pattern: a structured-doc parser that opens a frontmatter block but mis-types the YAML should FAIL LOUD; only a genuinely absent frontmatter block returns null — and "present" means LINE 1 only (mid-file --- are markdown horizontal rules, the docs/DOD.md case). DoD auto criteria may only assert gates recorded BEFORE dod-assert runs (implementation/review) — the validation gate cannot evidence itself
    confidence: 2
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: a cross-report comparison keyed on per-session run ids can never match a committed baseline — the feature ships dead with green tests; compare per-phase MEANS (corpus-size-invariant, sums turn drift into a corpus-size counter) and keep the math NaN-safe (a malformed group contributes 0, never NaN — NaN silently swallows the flag while null renders visibly as "new")
    confidence: 2
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/intention.js
    severity: high
    pattern: a review-fix that reroutes a value through a NEW helper can silently drop an invariant the replaced path guaranteed (never-throws broke when the coverage check moved from the try/catch matcher to an unguarded one) — re-verify the invariant on the fix delta, not just the finding; an adversarial convergence reviewer scoped to the fix-delta catches it
    confidence: 2
    provenance:
      run: intention-port
      commit: 35cd184
      date: '2026-07-03'
  - concern: findings
    file: engine/src/hygiene-lint-core.js
    severity: medium
    pattern: a size/DoS cap added to the scan-path read must ALSO cover the waiver-source read — ci.sh passes each touched .md as both a --waiver-source AND a scanned file, so collectWaived reads it whole (uncapped) before scanFile's guard ever applies; a huge touched markdown OOMs the gate. Extract ONE capped-read helper (statSync-then-skip-then-read) used by both paths; keep the distinct stderr label per path so existing 'cannot read waiver source' assertions stay green
    confidence: 2
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: scripts/ci.sh
    severity: medium
    pattern: 'to compute a git-diff touched set ONCE and feed two consumers while keeping git -z NUL-safety, use a NUL-delimited temp file read twice (printf ''%s\0'' + read -r -d '''' + trap rm EXIT) — bash cannot hold NUL in a variable and macOS bash 3.2 lacks readarray -d, so a shared newline-joined var re-loses -z''s guarantee for embedded-newline names. Also: ci.sh must NOT 2>/dev/null a resolver whose non-zero-exit carries a deliberate reason (a typo''d hygiene.gate would silently degrade to advisory); drop the suppression, keep || echo <default> as the fail-open'
    confidence: 2
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: engine/stryker.conf.json
    severity: medium
    pattern: extracting Stryker survivors with a fixed line-window (sed -n A,Bp over the report) silently clips survivors beyond the window and under-triages — grep the FULL report for '[Survived]'/'[No coverage]', and treat a scoped re-mutation of only the touched file as the authoritative post-triage check
    confidence: 2
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/init-land-main.js
    severity: medium
    pattern: a default-dependency factory (execFileSync + stderr parse, e.g. buildLintDep) survives mutation because every unit test injects a fake dep away and the .bin subprocess test runs a fresh node the Stryker in-process instrumentation cannot observe — kill by exporting the factory and adding an in-process test driving the real dep against a real subprocess; genuinely-unreachable defensive fallbacks are documented equivalents
    confidence: 2
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/config-resolve-main.js
    severity: medium
    pattern: an identity containByRealpath test-double (root,target)=>target turns the join(home,'.claude') path-literal and the scope-guard conditional into equivalent mutants — kill with a recording spy asserting the exact root arg for user scope and asserting containment is never consulted for local scope
    confidence: 2
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: adapters/pi/src/tool-call-hook.js
    severity: high
    pattern: 'a field-bridge that prefers the guard''s INSPECTED field over the field the tool actually EXECUTES on lets a decoy mask an escape — pi writes to `path`, so bridging `file_path ?? path` let an in-tree file_path decoy hide an out-of-tree path from the containment guard; bridge the authoritative field the tool acts on (map `path` to file_path unconditionally). Also: only map the tool names the shared predicate branches on (Bash/Write/Edit) — inert casing entries are dead code'
    confidence: 2
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: adapters/pi/test/cli.test.js
    severity: medium
    pattern: cli.test.js spawns the REAL pi binary via spawnSync and is written for CI where pi is ABSENT (main exits 2 fast). In a dev sandbox where pi IS installed, the real spawn does slow network/provider work and the full adapters/pi suite / bash scripts/ci.sh hangs for tens of minutes. Reproduce CI conditions by prepending a fast-failing `pi` stub (a 2-line `exit 2` script) to PATH — node/npx stay real since they resolve elsewhere on PATH
    confidence: 2
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: scripts/ci.sh
    severity: high
    pattern: the installed-binary hang is NOT pi-specific — ci.sh runs every adapter suite, so ANY agent binary installed on the dev box (pi, opencode, copilot) makes its suite do real provider work and hangs the gate for tens of minutes. Prepend a fast-failing stub for ALL agent binaries to PATH before every ci.sh run, not just the one being worked on. The cost of missing it is a dead sub-agent — a 26-minute part-implementer was lost to exactly this
    confidence: 3
    provenance:
      run: native-copilot-binding
      commit: 43d5b30
      date: '2026-07-20'
  - concern: findings
    file: docs/design/native-copilot-binding.md
    severity: medium
    pattern: scripts/design-lint.sh REQUIRES the literal heading `## Decision candidates`. A scope-fold revision that renames it to a more accurate `## Settled decisions` turns ci.sh red. Keep the heading and put the settled framing in the prose beneath it — the sibling design docs keep that heading for this mechanical reason, not by style preference
    confidence: 2
    provenance:
      run: native-copilot-binding
      commit: 8dd16f0
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/README.md
    severity: high
    pattern: 'do NOT copy shared craft skill bodies into an adapter to satisfy single-sourcing — the shared bodies legitimately carry ADR/phase refs and one bare `${CLAUDE_PLUGIN_ROOT}`, so copying forces hygiene-rule exemptions on the most drift-prone files. Load them BY REFERENCE instead (pi declares `"skills": ["skills"]`; copilot passes the repo root as a plugin dir). Verified live — a repo-root plugin dir loads all 19 shared skills with `source: plugin` and `userInvocable: true`, so drift becomes structurally impossible rather than test-enforced and both exemptions disappear'
    confidence: 2
    provenance:
      run: native-copilot-binding
      commit: 545d4d2
      date: '2026-07-20'
  - concern: findings
    file: adapters/copilot/src/deny-tool-args.js
    severity: high
    pattern: Copilot's `--deny-tool` is PREFIX matching on the raw command string, not argv parsing. `shell(git push)` blocks `git push --force origin main` but NOT `git -C . push`; `shell(git clean -fd)` does not block the reordered `git clean -df`. Wildcards do not work (`shell(*push*)`, `shell(git *push*)`, `shell(git)` match nothing); only the documented `shell(cmd:*)` form works, and `shell(git:*)` denies ALL git which breaks a git-heavy harness. Enumerate realistic flag-order/long-form variants and document the interposed-global-option gap honestly — never claim adversarial enforcement
    confidence: 3
    provenance:
      run: native-copilot-binding
      commit: 2eda333
      date: '2026-07-20'
  - concern: findings
    file: engine/src/observability/adapters/copilot/telemetry.js
    severity: high
    pattern: an OTel file exporter emits a MIXED stream where the same tokens appear three times — on leaf `chat` spans, summed again on the parent `invoke_agent` span, and again in a `gen_ai.client.token.usage` metric record. Ingesting every token-bearing record inflates cost ~3x. Discriminate STRUCTURALLY (`kind` present AND `instrumentationScope.name`), never by record name, and count leaf spans only. Also a `since` cutoff comparing a raw timestamp against an ISO string fails OPEN when the timestamp is numeric (number < string coerces to NaN) — normalise both sides to epoch ms
    confidence: 2
    provenance:
      run: native-copilot-binding
      commit: 27e9c72
      date: '2026-07-20'
  - concern: findings
    file: docs/GUIDE-concepts.md
    severity: medium
    pattern: hand-drawn ASCII box diagrams ship ragged right borders invisible while editing; generate them with a fixed-width padding builder and verify column-constant edges in DISPLAY columns (box glyphs are 3-byte UTF-8, so byte-length checks false-alarm) before committing
    confidence: 2
    provenance:
      run: communication-revamp-four-frames
      commit: 10a1ecf
      date: '2026-07-24'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: low
    pattern: allowlist comments that hardcode a line number re-stale on unrelated prose edits to the scanned file — keep allowlist comments line-agnostic to match the deliberately line-agnostic regex
    confidence: 1
    provenance:
      run: communication-revamp-four-frames
      commit: 10a1ecf
      date: '2026-07-24'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: the hygiene allowlist filters per grep LINE — a multi-line survivor-proof comment whose continuation line carries a banned token without the allowlist phrase trips the gate; keep banned tokens on the phrase-bearing line or reword continuations
    confidence: 1
    provenance:
      run: readme-drift-guards
      commit: b63c79c
      date: '2026-07-25'
  - concern: findings
    file: engine/src/contract-assemble-main.js
    severity: medium
    pattern: read piped stdin via fd 0, never the /dev/stdin device path — ENXIO on Linux CI runners while green on macOS; device-path I/O is a local-green-runner-red class, verify on the runner
    confidence: 1
    provenance:
      run: readme-drift-guards
      commit: b63c79c
      date: '2026-07-25'
  - concern: findings
    file: agents/reviewer.md
    severity: medium
    pattern: editing a shared agents/*.md body requires syncing SIX adapter mirrors in one pass (copilot/codex/cursor/antigravity/opencode keep own frontmatter + shared body; aider is body-only with leading blank lines stripped) — the drift guards are per-adapter byte-identity tests that surface one red suite at a time, so sweep grep -rln the body's first sentence across adapters/ before running the gate
    confidence: 2
    provenance:
      run: sp9-findings-adoption
      commit: '9184452'
      date: '2026-07-26'
  - concern: findings
    file: examples/deliberation-review/workflow.md
    severity: medium
    pattern: an example that teaches an agent output format must emit the exact shape the engine normalizer parses — a pipe-delimited findings format taught in prose failed normalize-findings (pipe is reserved for the optional fix); run taught formats through the real parser before shipping
    confidence: 1
    provenance:
      run: sp9-findings-adoption
      commit: '9184452'
      date: '2026-07-26'
  - concern: findings
    file: test/hygiene-gates-ci.test.js
    severity: medium
    pattern: the run_prose_lint excuse-glob case-arm in scripts/ci.sh is pinned byte-wise by this test — every glob clause added or retargeted must extend the pinned regex in the SAME change, or the suite goes red one part at a time (bit three separate parts in one run)
    confidence: 2
    provenance:
      run: docs-audience-split
      commit: e59ca69
      date: '2026-07-27'
  - concern: findings
    file: docs/contributing/plan/examples-catalog-gap-closure.md
    severity: medium
    pattern: a plan/design doc that quotes markdown index-row snippets as inline code with escaped backticks breaks the code span and exposes raw relative links, which the CI link checker resolves against the doc's own directory and fails — fence any quoted link-bearing snippet in a text code block instead of an inline span
    confidence: 1
    provenance:
      run: examples-catalog-gap-closure
      commit: be64001
      date: '2026-07-27'
  - concern: findings
    file: examples/README.md
    severity: medium
    pattern: when adding rows to a doubly-indexed catalog, cross-check every derived cell (tier/cost class) against the canonical table, not just presence and numbering — a tier cell drifted while presence and numbering were both guarded
    confidence: 1
    provenance:
      run: examples-catalog-gap-closure
      commit: 7d72b47
      date: '2026-07-27'
  - concern: findings
    file: engine/src/findings.js
    severity: high
    pattern: an equivalent-mutant claim resting on "the input cannot contain a newline" is FALSE — JS `.` also excludes CR, U+2028 and U+2029, so an interior CR reaches the pattern and the anchor is load-bearing. Probe with a CR before documenting ANY anchor mutant as equivalent; 4 of 7 claims in one file died to this, and 2 of them silently widened scope
    confidence: 3
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: high
    pattern: a bash gate that fills an array from `find` via process substitution exits 0 having checked NOTHING when enumeration is empty or find fails, and on bash 3.2 an unguarded "${arr[@]}" under set -u aborts yet still exits 0 through the EXIT trap. Guard both arrays for zero-enumeration AND print a positive count line — otherwise a 0-checked run is byte-identical to a full one
    confidence: 5
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: a tool that rewrites files from a frontmatter body MUST verify the opened fence actually CLOSES — an awk `infence && !closed` rule silently swallows the rest of the file, extracting an empty body that truncates every mirror (a body-only mirror to 0 bytes); the mirror-side twin instead appends the body unboundedly on every run
    confidence: 2
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: scripts/sync-adapter-agents.sh
    severity: medium
    pattern: '`[a-z]*` is NOT ASCII under en_US.UTF-8 — bash bracket-expression collation makes it match README. Set LC_ALL=C for byte-stable case globs and sort in any script whose behaviour depends on them'
    confidence: 2
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: engine/test/findings.test.js
    severity: high
    pattern: a perf or ReDoS regression guard that asserts only the error message passes just as happily on the quadratic implementation — measured 930x slower and still reported ok. Assert a SCALING RATIO between two input sizes instead, and prove the assertion fails on a deliberately regressed copy
    confidence: 5
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: docs/contributing/adr/
    severity: medium
    pattern: an ADR consequence that reasons ABOUT a regex instead of RUNNING it can ship a false claim that survives ratification — here "the retired form will now throw" was actually a silent mis-scope. Execute every behavioural claim an ADR makes before ratifying it
    confidence: 2
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: BACKLOG.md
    severity: medium
    pattern: a scoped backlog entry's own description of the tree drifts and can be simply wrong — this run found 5 recorded premises false or mis-framed (a trigger characterisation, a colon-rejection claim, which file held the wrong prose, a dedupe dropping both entries not one, a subtotal read as a total). Re-measure every premise before designing a fix for it, and close by evidence when it no longer holds
    confidence: 3
    provenance:
      run: scheduled-backlog-sweep
      commit: f6639d2
      date: '2026-07-31'
  - concern: findings
    file: engine/test/metrics-emit-main.test.js
    severity: high
    pattern: 'an assert.fail placed inside an injected port is worthless wherever production wraps that port in try/catch: the AssertionError is swallowed into an advisory line. Count the calls and assert OUTSIDE the unit under test, and read the artifact back from disk rather than asserting a local literal against its own substring'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/test/fixtures/telemetry/tool-use-multiline.jsonl
    severity: high
    pattern: 'a fold-versus-sum fixture must be asymmetric: with 2 tool_use plus 1 other block on one line and 1 plus 0 on another, === and !== both total 3 and the equality mutant survives. Add extra non-tool_use blocks so the two operators disagree, and give an earlier line a larger usage value so max stays distinguishable from last-wins'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/plan-lint-main.js
    severity: medium
    pattern: 'prove every conjunct of a multi-conjunct predicate by mutation: assert each rejected shape at a ceiling of 1 beside one genuine path, since at the default ceiling several miscounted spans still pass. Drop a guard subsumed by a later one; a whitespace check ahead of a charset that already excludes whitespace can never change a result'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/tune-plan.js
    severity: high
    pattern: 'an overrun is never evidence a budget should be raised: the budget is self-counted, so overrunning means it was not obeyed. Auto-patch only where nothing binds, fail closed when the effective budget cannot be resolved (unknown must never read as nothing-binds), and keep the proposed value in the unit of the knob it is written into'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: pipeline/default.yml
    severity: medium
    pattern: a descriptor value wins the turn-budget resolution chain, so declaring every budget in the pipeline identical to the archetype table silently shadows the table and its executing/read split; deleting the split left the whole suite green. Keep the archetype table the single live home
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/metrics-emit-main.js
    severity: high
    pattern: 'a read-concat-write append must treat ONLY ENOENT as absent: any other read error leaves prior content unknown and must refuse the write, or it replaces an append-only history with header-plus-new-rows at exit 0. Return an ok:false shape carrying no content field so the dangerous state is unrepresentable'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/src/observability/metrics-emit-main.js
    severity: medium
    pattern: 'metrics-emit attributes a spawn to a phase by its ROLE, so a role serving two phases lands entirely in its primary one: craft:reviewer spawns from the refactoring re-review are counted under review. --since only lower-bounds, so it can isolate a later occurrence but never exclude one from an earlier row'
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: findings
    file: engine/stryker.conf.json
    severity: high
    pattern: when scoping mutation per hunk, the git pathspec engine/src/**/*.js matches only NESTED files and silently omits top-level ones such as contract.js; use the directory pathspec engine/src. Invoke the workspace binary engine/node_modules/.bin/stryker, since npx can resolve a stale global package from its cache
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: resolver-wiring
    outcome: pass
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: schema-module
    outcome: pass
    confidence: 2
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: lint-bin-port
    outcome: pass
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: manifest-enum-knob
    outcome: pass
    confidence: 4
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: port-field
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: agent-frontmatter
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
  - concern: part-sizing
    size: contract-line
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-agent-context-cost
      commit: e2bd2b0
      date: '2026-09-21'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21

## gate-cmd
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21

## validation-tool
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21

## findings
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: 9229d3f / 2026-07-27
- confidence: 1 | provenance: f4785cd / 2026-06-23
- confidence: 1 | provenance: c8b7685 / 2026-06-23
- confidence: 1 | provenance: 7b3f4bf / 2026-06-28
- confidence: 1 | provenance: 7b3f4bf / 2026-06-28
- confidence: 2 | provenance: f17d07e / 2026-06-28
- confidence: 1 | provenance: f17d07e / 2026-06-28
- confidence: 2 | provenance: daf7f05 / 2026-07-03
- confidence: 2 | provenance: daf7f05 / 2026-07-03
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: 35cd184 / 2026-07-03
- confidence: 2 | provenance: aac0299 / 2026-07-04
- confidence: 2 | provenance: aac0299 / 2026-07-04
- confidence: 2 | provenance: cb48a0c / 2026-07-04
- confidence: 2 | provenance: cb48a0c / 2026-07-04
- confidence: 2 | provenance: cb48a0c / 2026-07-04
- confidence: 2 | provenance: bb8d2cd / 2026-07-20
- confidence: 2 | provenance: bb8d2cd / 2026-07-20
- confidence: 3 | provenance: 43d5b30 / 2026-07-20
- confidence: 2 | provenance: 8dd16f0 / 2026-07-20
- confidence: 2 | provenance: 545d4d2 / 2026-07-20
- confidence: 3 | provenance: 2eda333 / 2026-07-20
- confidence: 2 | provenance: 27e9c72 / 2026-07-20
- confidence: 2 | provenance: 10a1ecf / 2026-07-24
- confidence: 1 | provenance: 10a1ecf / 2026-07-24
- confidence: 1 | provenance: b63c79c / 2026-07-25
- confidence: 1 | provenance: b63c79c / 2026-07-25
- confidence: 2 | provenance: 9184452 / 2026-07-26
- confidence: 1 | provenance: 9184452 / 2026-07-26
- confidence: 2 | provenance: e59ca69 / 2026-07-27
- confidence: 1 | provenance: be64001 / 2026-07-27
- confidence: 1 | provenance: 7d72b47 / 2026-07-27
- confidence: 3 | provenance: f6639d2 / 2026-07-31
- confidence: 5 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: f6639d2 / 2026-07-31
- confidence: 2 | provenance: f6639d2 / 2026-07-31
- confidence: 5 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: f6639d2 / 2026-07-31
- confidence: 3 | provenance: f6639d2 / 2026-07-31
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21

## part-sizing
- confidence: 5 | provenance: e2bd2b0 / 2026-09-21
- confidence: 5 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 2 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 4 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
- confidence: 1 | provenance: e2bd2b0 / 2026-09-21
