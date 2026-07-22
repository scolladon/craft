# Design — native Cursor binding of the craft harness

## Context

Cursor (Anysphere) ships `cursor-agent`, a headless one-turn-and-exit agent CLI alongside
its VS Code-lineage editor. craft already has native bindings for codex/copilot/opencode/pi
and a GUI-only declination for antigravity. This binding is the runnable codex/copilot analog
for Cursor. The full live contract-discovery record — every surface pinned against
`cursor-agent 2026.07.20-8cc9c0b`, never assumed — is `docs/adapters/cursor-poc-record.md`;
this doc is the design layered on those pinned facts.

## Requirements

- A **port-binding adapter** (not a declination): Cursor has both a headless execution port
  (`-p --output-format json`) and a deny-capable pre-execution hook (`beforeShellExecution`),
  so the full adapter is warranted.
- The guard must **reuse** `engine/src/guards/{tool-call-guard,git-ext-diff-predicate}.js`,
  never re-implement the predicate; it must **deny the targeted command AND allow benign ones**
  (not fail-closed-on-everything), and its deny signal must actually reach Cursor.
- Role agents byte-identical to the shared sources; frontmatter only what Cursor's schema accepts.
- Telemetry pinned against a **real** captured rollout.
- Every posture documented is **measured**, not assumed. Land via strict TDD, atomic commits,
  CI green at every commit.

## Design

- **Guard (`hooks/craft-guard.js` + `src/cursor-guard-adapter.js`).** The live-pinned
  `beforeShellExecution` payload carries the command at TOP-LEVEL `command` (snake_case, NOT
  `tool_input.command`). The adapter reshapes it into `toolCallGuard`'s event and applies the
  shared git-ext-diff predicate unmodified. The deny wire is **stdout JSON**
  `{"permission":"deny","user_message":…}` (not an exit code); the hook writes it
  **synchronously to fd 1** then returns (flush-before-exit). Two fail-closed layers: the
  decision path denies on any throw, and `hooks.json` registers `failClosed:true` for a
  process-level crash (measured: without it, a crashing guard fails OPEN).
- **Manifest (`hooks.json`).** At the path Cursor reads — project `.cursor/hooks.json` —
  registering the guard via `node ${CRAFT_ROOT}/…/craft-guard.js` (env-subst resolves live).
- **Role agents (`agents/craft-<role>.md`).** Byte-identical bodies; frontmatter is
  `name` + `description` only (Cursor's `.cursor/agents` schema — no model field; the tier
  rides the launch `--model`).
- **Ports (`src/{model-tier-map,launch-args,probe}.js`).** Tier→id from the live
  `--list-models` catalogue; launch-args emit the non-interactive `-p … --force` posture; the
  probe wraps the shared `runProbeHarness`.
- **Telemetry (`engine/src/observability/adapters/cursor/telemetry.js`).** Tokens from the live
  result-envelope `usage` (persisted transcript is token-less); the four counts are DISJOINT
  (Anthropic convention, pinned by the real rollout where cacheRead > input) so each maps
  directly, no cap.

## Decision candidates

Every load-bearing choice was dictated by the live contract, leaving no open user-judgment ADR:
the deny wire, payload field, failClosed requirement, disjoint token mapping, keychain auth
seed, and the `--sandbox` non-containment finding are all measured facts, not preferences.
Recorded here for traceability rather than as open questions.

- **Guard scope = shell only.** Cursor has no pre-write hook (`afterFileEdit` is post-hoc), so
  the binding enforces git-ext-diff on shell calls and does not claim write containment. Honest
  scope over a fabricated one.
- **`--sandbox` not emitted by default.** Measured to not contain writes outside the workspace
  under `--force`; the guard is the enforcement layer.
- **Miner `--source cursor` deliberately NOT wired.** Cursor persists no tokens, so a
  persisted-file miner would always read zero — the silent-zero-reads-as-success trap. Tokens
  come from the result envelope the spawn returns.

## Test strategy

Strict TDD, one atomic commit per part, full `scripts/ci.sh` green at every commit. Unit tests
pin the adapter/guard/ports/telemetry seams (no test spawns a real CLI). The guard is
additionally **live-proven** against real `cursor-agent`: it denies `git diff` (no
`--no-ext-diff`) with the shared-predicate reason surfaced to the agent, and allows `echo`.
README honesty pins are test-guarded so the measured posture cannot silently drift. Telemetry is
pinned against real captured fixtures (`engine/test/fixtures/cursor/`).

## Out of scope

- Pre-write path containment (no Cursor hook exists for it).
- A `--source cursor` persisted-file miner (tokens are not persisted).
- Sandbox measurement beyond the filesystem write-outside probe.
- The Cursor `worker`/cloud, MCP, and team/enterprise hook scopes (project scope only).
