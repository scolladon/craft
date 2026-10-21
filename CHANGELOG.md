# Changelog

All notable changes to craft are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version that ships to
plugin users is the `version` field of `.claude-plugin/plugin.json`.

## [Unreleased]

## [2.0.0] - 2026-10-21

### Added
- A lessons phase and a committed lessons corpus: a run drafts evidence-cited, subject-scoped lessons on its PR branch, and later runs touching the same files receive the merged ones as advisory hints at phase entry.
- Planning records a verified no-op when earlier phases already landed every requirement; implementation then runs only its phase gate.
- A driven-run contract: with `CRAFT_DRIVER_STATE` set, a run writes the next-item election, a next prompt stripped of `--policy` flags, and a final `FINISHED` or `BLOCKED` status to that directory.

### Changed
- The documentation phase folds in-scope findings into the PR before filing any as backlog follow-ups.
- The ext-diff guard denies `--ext-diff` on any git verb and any `git config` naming an `alias`, `include.path` or `includeIf.*` key; `git show` without `--ext-diff` is allowed again.
- Role agents are taught one commit form (`git commit -m "<message>"`, or `git commit -F <file>`) and never the heredoc idiom, which bash 3.2 misparses.
- The Claude Code git-guard hook requires `node` instead of `jq`.

### Removed
- Support for Node 18, 20, 22.0-22.17, 23 and 24.0-24.1, which lack `import.meta.main`. Every craft entry now exits 1 on them; most print an error naming the supported range `^22.18.0 || >=24.2.0`, and some fail earlier on a missing `node:path` export.

### Fixed
- The Claude Code git-guard hook denies the call on every crash instead of letting it run.
- The Claude Code git-guard hook judges commands with the engine's shell parse: it denies forms such as `FOO=1 git diff` and `git -p diff`, and no longer denies or rewrites quoted text such as `echo "a; git diff x"`.
- Phase-start records in the run ledger carry the ledger script's own clock, so phase timings and metrics windows are correct.
- In `claude --bg` sessions the workspace phase no longer stalls on a worktree permission prompt, and `strategy: in-place` stops with a clear reason instead of failing on edits.
- A driven run killed after closing its ledger recovers its final status from the PR state, and the driver state reaches `--bg` sessions through `--settings` env.
- The validation run-lock lives in the worktree's git dir, so a broad `git add` can no longer commit it.
- The plugin's hooks run when the plugin is installed under a path containing a space.
- The `craft-pi` bin and the codex trust-hook run when reached through a symlink, such as npm's global bin link, instead of exiting 0 with no output.
- Every engine bin, the codex trust-hook and the `craft-pi` bin run when the symlink they were reached through is repointed or removed while they start, instead of exiting 0 with no output, which `trust-hook --check` reported as trusted.
- Adapter portability proofs: the codex and copilot git guards deny every hook crash, judge Bash calls with the shared destructive-git verdict, and close the tty-input, heredoc and callback-builtin bypasses; the codex marketplace drops its non-loading `craft` entry.

## [1.1.0] - 2026-10-12

### Added
- A README section comparing craft with plain agent prompting and spec-driven kits.
- A devcontainer and an "Open in Codespaces" badge; CI and the devcontainer install the same dev tools.
- Review findings carry a status tag, with a deliberation-review example.
- The orchestrator protects its own context, and is safe to auto-compact at any turn.
- The codex binding supports scriptable hook-trust.
- The readme-drift check recounts the advertised corpus sizes instead of trusting the prose.
- A contributing guide, a security policy, and issue forms for bugs, features, adapter requests and security contact.
- Hygiene lints (stub-lint, prose-lint) with a manifest posture knob, a findings normalizer and adapter-agent sync.
- Superseded decisions are swept by adr-lint, closing the decision-drift propagation gap.
- A local behavioural eval suite, run by the maintainer and never in CI.
- The session compaction estimate is printed at Done.
- An examples catalog: six shipped-surface samples and a decisions-to-Slack example.
- A measured cost comparison (`docs/guides/comparison.md`) and when-not-to-use guidance.
- This changelog, the release procedure and a README version badge.

### Changed
- Per-turn context cost is cut.
- Docs are split by audience into `docs/guides` (users) and `docs/contributing` (contributors).

### Fixed
- Telemetry mines sub-agent transcripts and corrects its cost accounting.
- Telemetry skips compaction lines already mined.
- A transient model overload is retried once before the model tier degrades.
- The run ledger refuses to open a run id that is still open.
- The docs-structure lint passes on a symlinked checkout.
- GUARD and RED handling is tightened across the planner, contracts and part-implementer.
- Waivers are honoured only on anchored lines outside fenced blocks.
- Committed docs no longer disclose a home directory.
- Behavioural eval graders are calibrated.

## [1.0.0] - 2026-07-25

### Added
- One gated 11-phase pipeline: workspace, design, decisions, planning, implementation, review, refactoring, validation, documentation, propose, integrate.
- Shipped as a Claude Code plugin; per-repo customization via a committed `.claude/workflow.md` declination manifest (no manifest means probed defaults).
- Harness-as-a-Service: pluggable Model, Execution, Memory and Telemetry ports around an engine-owned invariant contract.
- Seven native bindings under `adapters/` (pi, opencode, copilot, codex, cursor, aider, antigravity) proving the ports are pluggable.
- Comprehension and intention debt management: design docs, parted TDD plans, ADRs with user-ratified decisions.

[Unreleased]: https://github.com/scolladon/craft/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/scolladon/craft/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/scolladon/craft/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/scolladon/craft/releases/tag/v1.0.0
