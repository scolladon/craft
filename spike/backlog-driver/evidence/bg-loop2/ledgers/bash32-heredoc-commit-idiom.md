# craft run record (append-only)
bash32-heredoc-commit-idiom resolve RESOLVE: --policy push=always --policy propose=always --policy integrate=always --policy teardown=always
bash32-heredoc-commit-idiom resolve default-skip: requirements (descriptor enabled:false)
bash32-heredoc-commit-idiom resolve enable: architecture (phases.architecture.enabled:true)
bash32-heredoc-commit-idiom resolve config: .claude/workflow.md (no --config); manifest-lint valid
bash32-heredoc-commit-idiom resolve memory: loaded .claude/craft-memory.md (76 lines); no entry on heredoc/bash 3.2
bash32-heredoc-commit-idiom resolve intention: consulted zero-config corpus; slices applied at design/decisions/planning
bash32-heredoc-commit-idiom resolve waivers: none
bash32-heredoc-commit-idiom resolve PROOF: /bin/bash 3.2.57 `echo "$(cat <<'EOF'\ndon't stop\nEOF\n)"` -> "line 2: unexpected EOF while looking for matching `''" + "syntax error: unexpected end of file" exit 2; /bin/sh same; zsh exit 0; no bash 5 on box; same body without apostrophe exit 0; `-m "fix: don't stop"` exit 0; heredoc to file then -F exit 0
bash32-heredoc-commit-idiom resolve AWAITING(propose): validation,architecture
bash32-heredoc-commit-idiom workspace PHASE-START(workspace): 2026-10-16T14:45:21Z
bash32-heredoc-commit-idiom workspace POLICY(isolate): always -> proceed
bash32-heredoc-commit-idiom workspace PHASE-DONE(workspace): worktree ../craft-bash32-heredoc-commit-idiom on fix/bash32-heredoc-commit-idiom; deps installed; baseline ci.sh green
bash32-heredoc-commit-idiom design PHASE-START(design): 2026-10-16T14:46:29Z
bash32-heredoc-commit-idiom design PHASE-DONE(design): docs/contributing/design/bash32-heredoc-commit-idiom.md @44f894a; 3 decision candidates (DC-1 contract form, DC-2 copilot gate idiom, DC-3 fallback); README design count 73->74; ci green
bash32-heredoc-commit-idiom design VERIFIED(design): orchestrator re-ran smuggle `git commit -m "$(cat <<'EOF'\nx)"; git branch -D victim; echo "\nEOF\n)"` -> copilotGuard {block:false}; plain `git branch -D victim` -> block; /bin/bash 3.2 throwaway repo: victim deleted; zsh: victim kept
bash32-heredoc-commit-idiom decisions PHASE-START(decisions): 2026-10-16T15:05:00Z
bash32-heredoc-commit-idiom decisions DECISION(DC-1): user ratified (b) teach the commit form in contracts/core.md -> ADR-605 @37d4f5b
bash32-heredoc-commit-idiom decisions DECISION(DC-2): user ratified (b) copilot gate denies the idiom -> ADR-606 @7e5f4ef (supersedes ADR-595 scope)
bash32-heredoc-commit-idiom decisions DECISION(DC-3): adopted-as-recommended (a) -F <file> fallback; aligns with construction.md exact-message rule -> ADR-607 @d4fa5f1
bash32-heredoc-commit-idiom decisions DECISION-REVERSAL(ADR-595): the commit idiom is recognised and its body treated as data -> ADR-606
bash32-heredoc-commit-idiom decisions PHASE-DONE(decisions): 3 ADRs (605-607), ADR-595 flipped, BACKLOG ADR-595 citation swept; no deviation from design -> no designer revision
bash32-heredoc-commit-idiom decisions GATE(decisions): green
bash32-heredoc-commit-idiom planning PHASE-START(planning): 2026-10-17T10:39:43Z
bash32-heredoc-commit-idiom planning PHASE-DONE(planning): docs/contributing/plan/bash32-heredoc-commit-idiom.md @884931e; 3 parts (core contract line, copilot gate idiom deletion, copilot docs); README plan count 72->73; no decision candidates; BACKLOG removal left to documentation
bash32-heredoc-commit-idiom planning GATE(planning): green
bash32-heredoc-commit-idiom planning PHASE-START(implementation): 2026-10-17T10:56:48Z
bash32-heredoc-commit-idiom implementation PART(1): cb60c6d size=contract-line outcome=pass
bash32-heredoc-commit-idiom implementation PART(2): 440ce6c size=guard-deletion outcome=pass
bash32-heredoc-commit-idiom implementation VERIFIED(part2): orchestrator re-ran smuggle probe -> copilotGuard block COMPLEX_NEAR_GIT_REASON
bash32-heredoc-commit-idiom implementation PART(2): 440ce6c size=guard-deletion outcome=pass
bash32-heredoc-commit-idiom implementation VERIFIED(part2): orchestrator re-ran smuggle probe -> copilotGuard block COMPLEX_NEAR_GIT_REASON
bash32-heredoc-commit-idiom implementation PART(3): 1f08dfb size=docs-prose outcome=pass
bash32-heredoc-commit-idiom implementation GATE(implementation): green
bash32-heredoc-commit-idiom implementation PHASE-DONE(implementation): 3 parts landed (cb60c6d, 440ce6c, 1f08dfb); ci.sh green
bash32-heredoc-commit-idiom review PHASE-START(review): 2026-10-17T11:04:04Z
bash32-heredoc-commit-idiom review FINDINGS(perf): c1 <tmp>/craft-review/perf.c1.json n=2
bash32-heredoc-commit-idiom review RULED-OUT(perf): gate linear after deletion (benchmarked 1e4-1e6); core line ~248 bytes per spawn
bash32-heredoc-commit-idiom review FINDINGS(tests): c1 <tmp>/craft-review/tests.c1.json n=5 (1 LOW actionable, 4 RULED-OUT)
bash32-heredoc-commit-idiom review FINDINGS(code): c1 <tmp>/craft-review/code.c1.json n=4 (1 MEDIUM, 3 LOW; all verified by orchestrator probe)
bash32-heredoc-commit-idiom review FINDINGS(code): c1 <tmp>/craft-review/code.c1.json n=4 (1 MEDIUM, 3 LOW; all verified by orchestrator probe)
bash32-heredoc-commit-idiom review FINDINGS(code): c1 <tmp>/craft-review/code.c1.json n=4 (1 MEDIUM, 3 LOW; all verified by orchestrator probe)
bash32-heredoc-commit-idiom review NOTE(review): the two repeated FINDINGS(code) c1 lines above are duplicate appends of one record
bash32-heredoc-commit-idiom review FINDINGS(security): c1 <tmp>/craft-review/security.c1.json n=4 (all RULED-OUT)
bash32-heredoc-commit-idiom review RULED-OUT(security): =git under zsh EQUALS - gate consumed only by the copilot adapter, which runs /bin/bash
bash32-heredoc-commit-idiom review FIX(code): f724fc1 unbalanced-paren wording, dated anchors, copilot -F write constraint + intended false block, ADR-607 claim corrected, holdsOpaquePart -> holdsDoubleQuote with why
bash32-heredoc-commit-idiom review FIX(tests): 244880e substance pin for the commit-form line (fails when the -F fallback is removed)
bash32-heredoc-commit-idiom review CONVERGED(security): c1 all RULED-OUT
bash32-heredoc-commit-idiom review CONVERGED(perf): c1 all RULED-OUT
bash32-heredoc-commit-idiom review CONVERGED(tests): c1 LOW only, applied
bash32-heredoc-commit-idiom review GATE(review): green
bash32-heredoc-commit-idiom review CONVERGED(code): c2 LOW only; design/plan docs naming the old symbols RULED-OUT (dated records)
bash32-heredoc-commit-idiom review PHASE-DONE(review): 4 dimensions converged in 2 cycles; fixes f724fc1, 244880e; ci green
bash32-heredoc-commit-idiom review PHASE-START(refactoring): 2026-10-17T11:17:46Z
bash32-heredoc-commit-idiom review NO-OP(refactoring): nothing cleared the bar — the source change is a deletion plus one rename already applied in review; no duplicated or misplaced structure around the gate
bash32-heredoc-commit-idiom review PHASE-DONE(refactoring): no-op
bash32-heredoc-commit-idiom review inline: refactoring — ran in-session
bash32-heredoc-commit-idiom review auto-skip: architecture — evaluated unnecessary (no import/module-boundary edits in 4c5b94b..HEAD)
bash32-heredoc-commit-idiom review PHASE-START(validation): 2026-10-17T11:17:46Z
bash32-heredoc-commit-idiom validation HARNESS-BG(validation): mutation pid=bg:bsf7hf9e2 out=<tmp>/stryker/out.log scope=engine/src/guards/git-plain-command-gate.js:53-56,78-80 corpus=gate suite + copilot adapter suite
bash32-heredoc-commit-idiom validation TRIAGE(validation:mutation): 13 mutants >= 2 hunks; 11 killed, 2 survived at git-plain-command-gate.js:56 (ConditionalExpression, UnaryOperator) = the equivalent mutants already documented inline at :55 since before this change; no new survivors
bash32-heredoc-commit-idiom validation GATE(validation): green
bash32-heredoc-commit-idiom validation verify: DoD met — 12 criteria, 2 evidenced by phase results (implementation-gate-green, review-gate-green), 10 session-asserted (TDD RED-first per part; contract-line + test pins; ADRs 605-607; conventional one-line commits; no red commits; mutation triaged; architecture auto-skipped honestly - no import edits, boundary test still runs in ci.sh; rule-vs-fact: bash-3.2 matrix pinned on 3.2.57, no bash 5 on box, copilot live run not done)
bash32-heredoc-commit-idiom validation PHASE-DONE(validation): mutation triaged green; DoD met
bash32-heredoc-commit-idiom documentation PHASE-START(documentation): 2026-10-17T11:22:00Z
bash32-heredoc-commit-idiom documentation inline: documentation — ran in-session (affected pages adapters/copilot/README.md + docs/contributing/specs/gate.md already refreshed in Part 3 + review fixes; no other page's subjects matched)
bash32-heredoc-commit-idiom documentation POLICY(backlog-write): always -> proceed
bash32-heredoc-commit-idiom documentation PHASE-DONE(documentation): backlog flip 3cbb9af (entry delivered in place; one follow-up added: copilot intended-false-blocks list understates the quoted-word rule); ci green
bash32-heredoc-commit-idiom propose PHASE-START(propose): 2026-10-17T11:25:00Z
bash32-heredoc-commit-idiom propose GATE(propose): green (no pr.pre-pr-gate declared; ci.sh green at 3cbb9af; prose-lint advisory clean; AI-trace scan of messages + trees clean)
bash32-heredoc-commit-idiom propose POLICY(always:push): pushed fix/bash32-heredoc-commit-idiom
bash32-heredoc-commit-idiom propose POLICY(always:propose): https://github.com/scolladon/craft/pull/71
bash32-heredoc-commit-idiom propose PHASE-DONE(propose): PR #71 opened
bash32-heredoc-commit-idiom propose PHASE-START(integrate): 2026-10-17T11:25:30Z
bash32-heredoc-commit-idiom integrate GATE(integrate): green (PR #71 checks ci, readme-drift, links all pass)
bash32-heredoc-commit-idiom integrate POLICY(always:integrate): gh pr merge 71 --squash --delete-branch --admin -> MERGED e7f39cf
bash32-heredoc-commit-idiom integrate POLICY(always:teardown): worktree-teardown.sh removed ../craft-bash32-heredoc-commit-idiom, local + remote branch deleted
bash32-heredoc-commit-idiom integrate PHASE-DONE(integrate): merged e7f39cf; main fast-forwarded
bash32-heredoc-commit-idiom done NEXT-ELECTED: ADR-253 supersession (BACKLOG ~L180) -> .claude/driver-state-bg2/entry-2.next-elected.md
bash32-heredoc-commit-idiom done METRICS: 4 rows emitted (design, planning, implementation, review); memory saved; bookkeeping 98771b5 pushed to main
