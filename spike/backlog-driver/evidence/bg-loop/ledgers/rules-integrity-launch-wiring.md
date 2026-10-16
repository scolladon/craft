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
