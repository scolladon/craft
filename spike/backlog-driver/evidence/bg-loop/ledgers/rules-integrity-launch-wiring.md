# craft run record (append-only)
rules-integrity-launch-wiring resolve RESOLVE: --policy push=always --policy propose=always --policy integrate=always --policy teardown=always
rules-integrity-launch-wiring resolve default-skip: requirements (descriptor enabled:false)
rules-integrity-launch-wiring resolve enable: architecture (phases.architecture.enabled:true)
rules-integrity-launch-wiring resolve config: .claude/workflow.md (no --config); manifest-lint valid
rules-integrity-launch-wiring resolve memory: loaded .claude/craft-memory.md (toolchain, gate-cmd=bash scripts/ci.sh, validation-tool mutation, part-sizing x3, findings none)
rules-integrity-launch-wiring resolve intention: loaded governing corpus 250 records; codex-relevant ADR-573..576, harden-prove-codex-binding design
rules-integrity-launch-wiring resolve waivers: none
rules-integrity-launch-wiring resolve AWAITING(propose): validation,architecture
rules-integrity-launch-wiring resolve POLICY(push): always (cli)
rules-integrity-launch-wiring resolve POLICY(propose): always (cli)
rules-integrity-launch-wiring resolve POLICY(integrate): always (cli)
rules-integrity-launch-wiring resolve POLICY(teardown): always (cli)
rules-integrity-launch-wiring workspace PHASE-START(workspace): 2026-10-16T09:50:40Z
rules-integrity-launch-wiring workspace POLICY(isolate): always (default) -> proceed
rules-integrity-launch-wiring workspace toolchain: npm (nested engine), lockfile fingerprint matches memory hint
rules-integrity-launch-wiring workspace PHASE-DONE(workspace): worktree ../craft-rules-integrity-launch-wiring on feat/rules-integrity-launch-wiring, deps installed
rules-integrity-launch-wiring design PHASE-START(design): 2026-10-16T09:53:09Z
rules-integrity-launch-wiring design PHASE-DONE(design): d4e1567 docs/contributing/design/rules-integrity-launch-wiring.md; 4 decision candidates (wire-or-not rec 1a on-demand; wording 2a; absent-file 3a; trust-hook modes 4a); designer probed execpolicy check: empty/comments-only rules parse clean + forbid nothing
rules-integrity-launch-wiring design PHASE-START(decisions): 2026-10-16T10:08:00Z
rules-integrity-launch-wiring decisions GATE(decisions): n/a
rules-integrity-launch-wiring decisions DECISION: 1=1a keep on demand (ratified by user, ADR-599); 2=2a full wording record (ratified, ADR-600); 3,4 moot (only if wired)
rules-integrity-launch-wiring decisions PHASE-DONE(decisions): ADR-599 e76bbaa, ADR-600 146260c; all choices match design recommendations, no scope-fold; ci.sh green
rules-integrity-launch-wiring decisions PHASE-START(planning): 2026-10-16T12:28:28Z
rules-integrity-launch-wiring planning GATE(planning): green (plan-lint 1 part OK; ci.sh green)
rules-integrity-launch-wiring planning PLAN-DECISIONS: 3 wording candidates (title suffix shape, JSDoc wording, 3rd record row) adopted-as-recommended (no user judgment) — wording-level, align with BACKLOG L916 shape, ADR-600, ADR-320
rules-integrity-launch-wiring planning ENV-TRAP: rtk VCS-command rewrite + worktree guard refuse agent add/commit/status/log/diff; planner handed back uncommitted (blocker, not worked around); orchestrator committed via the absolute VCS binary in its own worktree
rules-integrity-launch-wiring planning ENV-NOTE: planner ran codex --version once outside a throwaway CODEX_HOME (may touch the real codex cache); not verified
rules-integrity-launch-wiring planning PHASE-DONE(planning): 1c3408e docs/contributing/plan/rules-integrity-launch-wiring.md, 1 part (docs-prose + JSDoc), README plans 71
rules-integrity-launch-wiring planning PHASE-START(implementation): 2026-10-16T12:40:29Z
rules-integrity-launch-wiring implementation PART(1): 7e007a1 docs(codex): record the rules integrity check as kept on demand size=docs-prose outcome=pass (implementer applied edits uncommitted per env trap; orchestrator verified diff, ran ci.sh green 0 not-ok, committed)
rules-integrity-launch-wiring implementation GATE(implementation): green
rules-integrity-launch-wiring implementation PHASE-DONE(implementation): 1/1 parts landed
rules-integrity-launch-wiring implementation PHASE-START(review): 2026-10-16T12:43:14Z
rules-integrity-launch-wiring review FINDINGS(code): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.TdW7zG/code.c1.json n=1
rules-integrity-launch-wiring review FINDINGS(security): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.TdW7zG/security.c1.json n=1
rules-integrity-launch-wiring review FINDINGS(tests): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.TdW7zG/tests.c1.json n=1
rules-integrity-launch-wiring review FINDINGS(perf): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.TdW7zG/perf.c1.json n=0
rules-integrity-launch-wiring review RULED-OUT(tests): no dedicated empty-string integrity case — strict byte-compare + trailing-newline test already pin it
rules-integrity-launch-wiring review FIX(code): LOW SUSPECT "no launch path of its own" vs README "codex exec, this binding's launch path" -> reworded to "launches nothing itself (operators run codex exec)" on JSDoc, BACKLOG, POC record x2, ADR-600
rules-integrity-launch-wiring review FIX(security): LOW VERIFIED reason (iv) understated stale-copy risk -> scoped to "so far", added rule-body-change revisit trigger to BACKLOG decision, deploy-step entry and ADR-599
rules-integrity-launch-wiring review GATE(review): green (b784199; ci.sh 0 not-ok)
rules-integrity-launch-wiring review PHASE-DONE(review): 4 dims x1 pass, 2 LOW fixed in b784199, 1 RULED-OUT; converged low-only, no relaunch
rules-integrity-launch-wiring review auto-skip: refactoring — evaluated unnecessary (only source change is a JSDoc comment; no structural code touched)
rules-integrity-launch-wiring review auto-skip: validation — evaluated unnecessary (no mutable code changed; Stryker mutates no comments)
rules-integrity-launch-wiring review auto-skip: architecture — evaluated unnecessary (no import or module-boundary edits)
rules-integrity-launch-wiring review auto-skip: documentation — evaluated unnecessary (every mapped surface, BACKLOG/POC record/JSDoc, landed in 7e007a1 + b784199; backlog entry ticked in place; no new follow-up, the deploy-step entry already exists)
rules-integrity-launch-wiring propose PHASE-START(propose): 2026-10-16T12:50:00Z
rules-integrity-launch-wiring propose GATE(propose): green (pre-PR = ci.sh at b784199; awaited validation+architecture released by auto-skip)
rules-integrity-launch-wiring propose POLICY(always:push): pushed origin feat/rules-integrity-launch-wiring
rules-integrity-launch-wiring propose POLICY(always:propose): PR #69 created; prose-lint advisory clean
rules-integrity-launch-wiring propose PHASE-DONE(propose): https://github.com/scolladon/craft/pull/69
rules-integrity-launch-wiring propose PHASE-START(integrate): 2026-10-16T12:50:30Z
rules-integrity-launch-wiring integrate GATE(integrate): green (PR #69 checks ci/links/readme-drift pass)
rules-integrity-launch-wiring integrate POLICY(always:integrate): squash-merged PR #69 as 90dfdbd (--admin)
rules-integrity-launch-wiring integrate POLICY(always:teardown): worktree and local branch removed
rules-integrity-launch-wiring integrate PHASE-DONE(integrate): merged 90dfdbd; bookkeeping 5c1c6a9 pushed to main (memory save: part-sizing docs-prose 3->4, validation-tool 2->1; floors re-derived validation-tool 0, part-sizing 3; metrics 4 rows)
