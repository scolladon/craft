# Changelog

All notable changes to craft are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version that ships to
plugin users is the `version` field of `.claude-plugin/plugin.json`.

## [Unreleased]

### Fixed
- The plugin's hooks run when the plugin is installed under a path containing a space.
- The `craft-pi` bin and the codex trust-hook run when reached through a symlink, such as npm's global bin link, instead of exiting 0 with no output.

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

[Unreleased]: https://github.com/scolladon/craft/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/scolladon/craft/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/scolladon/craft/releases/tag/v1.0.0
