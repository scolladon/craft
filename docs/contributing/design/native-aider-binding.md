# Design — native Aider binding of the craft harness

> Brief: build Aider's runnable execution/model/VCS/telemetry binding and decline its enforcing guard, entirely from the pinned live contract.
> Status: draft → self-reviewed ×3 → accepted

## Context

Aider (Paul Gauthier, `aider-chat`) is a git-native AI pair-programmer — an **edit loop**, not a
tool-calling agent. It adds files to a chat, proposes+applies edits, and **auto-commits** to git;
its only shell surface is `/run` / `--test-cmd` / `--lint-cmd`, and it has **no pre-execution veto
point**. craft already binds codex/copilot/opencode/pi/cursor and declined antigravity. Aider is the
architectural **mirror of Cursor**: where Cursor scored execution GO + guard GO, Aider scores
**execution GO + guard NO-GO**. Every Aider fact below is pinned against the real CLI (0.86.2,
Python 3.12.13) in `docs/adapters/aider-poc-record.md` — cited, never re-derived. The runnable
adapter reuses `engine/src/probe-harness.js`, the telemetry miner
(`engine/src/observability/usage-mine-main.js`), and the 9 shared role bodies (`agents/<role>.md`).

## Requirements

- Execution: one craft phase = one `aider --message … --yes-always --model <id>` turn, spawned with
  `cwd` = the caller-verified absolute working dir. Aider has **no** workspace flag — cwd IS the
  git root; the non-interactivity flags are required or a headless run crashes on non-terminal stdin.
- Success signal is a **new git commit** (the handoff), NEVER `$?` — Aider exits 0 even on a hard
  API error with no commit.
- Model tiers resolve to the live-catalogue anthropic ids; a tier resolving to empty fails loud.
- Role bodies **byte-identical** to the shared craft sources, injected per phase via `--read`.
- VCS posture emits craft one-line-conventional commits (attribution off) and reconciles Aider's
  auto-commit with craft's **never-commit-on-red**.
- Telemetry pinned against a **real** captured `.aider.chat.history.md`; no token read is silently zero.
- **No guard is built** — declined honestly, with the precise blocker recorded. No test spawns a real CLI.
- Land via strict TDD, atomic commits, `scripts/ci.sh` green at every commit.

## Design

- **Role agents (`adapters/aider/agents/craft-<role>.md` × 9).** Bodies byte-identical to
  `agents/<role>.md`. Aider has no agent-def schema; the body is injected per phase as read-only
  context via `--read <file>` (the proven `CONVENTIONS.md` convention). Because Aider consumes the
  file as raw text, it is **body-only** — no frontmatter to leak into context — see (A).
- **Launch-args (`adapters/aider/src/launch-args.js`).** Emits the non-interactive posture
  (`--yes-always --no-gitignore --no-check-update --no-show-release-notes --no-analytics`) plus
  `--model <id>`, `--read <role-file>`, and `--message <msg>`. It emits **no working-dir flag**; the
  runner sets the spawn `cwd`, and `buildLaunchArgs` asserts `model` non-empty (an empty `--model`
  silently falls back to a default). Stable posture defaults also live in the config template;
  CLI wins (CLI > env > config).
- **Model tier map (`adapters/aider/src/model-tier-map.js`).** Own-property tier→id lookup (the
  cursor pattern), pinned to the live `--list-models` catalogue: `opus → anthropic/claude-opus-4-6`,
  `sonnet → anthropic/claude-sonnet-4-6`, `haiku → anthropic/claude-haiku-4-5`. Reasoning effort is
  the separate `--reasoning-effort` flag, not baked into the id.
- **VCS posture (`adapters/aider/src/vcs-posture.js`, first-class — (C)).** Aider's git is genuinely
  first-class, so the binding models it as its own port. It keeps `--auto-commits` (the handoff),
  sets `--no-dirty-commits` for a deterministic one-commit-per-turn artifact, and **disables
  attribution** (`--no-attribute-author --no-attribute-committer --no-attribute-co-authored-by`) to
  keep commits one-line-conventional — see (B). Never-commit-on-red is honored at the **integration
  boundary** — see (F): the runner captures the pre-turn HEAD, lets Aider auto-commit, runs craft's
  gate on the committed state, and **resets to the pre-turn HEAD on a red gate** so no red-gated
  commit survives into the branch craft integrates. (Aider commits `--no-verify` by default, so
  git's own hooks never fire — craft's externally-run gate is the sole enforcement.)
- **Probe (`adapters/aider/src/probe.js`).** Wraps `runProbeHarness` with the aider runner; ports
  exercised = `['Execution', 'Model', 'Gate', 'VCS']` — where **Gate** is craft's
  never-commit-on-red build gate (green-before-accept), NOT a tool deny-hook. The injected runner
  reports `gateRanBeforeCommit=true` only when the gate ran green before the auto-commit was
  **accepted** (not reset), making the shared assertion honest under Aider's commit-then-gate order.
- **Config template (`adapters/aider/config.template.yml`).** A `.aider.conf.yml` at the git-root
  path Aider searches (git-root → cwd → home), carrying the stable posture + `read: [CONVENTIONS.md]`.
- **Telemetry (`engine/src/observability/adapters/aider/telemetry.js`).** Parses the **persisted
  markdown** `.aider.chat.history.md` — Aider has no live JSON stream. `parseLines` scans for the
  `> Tokens: <sent> sent, <received> received.` line (the only pinned form: `781 sent, 19
  received`), mapping **sent→input, received→output, cacheRead=cacheCreation=0** (absent). Model is
  held from the nearest `> Model:` header; `since` is honored against the `# aider chat started at
  <ts>` header (unlike Cursor, Aider persists a timestamp). A `> Tokens:` line that does not yield
  two integers is a **counted skip** (surfaced via the miner's skipped count), never a silent-zero
  event — the honest handling of the unpinned large-count / paid-provider `Cost:` forms. Fixture:
  `engine/test/fixtures/aider/` (the real captured session).
- **Miner wiring (`--source aider` — (D)).** Unlike Cursor (tokens not persisted → deliberately not
  wired), Aider **does** persist tokens, so `--source aider` is wired. This requires a per-source
  **file-matcher** seam in `usage-mine-main.js` (its discovery filter is hardcoded `.jsonl`; Aider's
  record is `.aider.chat.history.md`), symmetric with the existing per-source `DEFAULT_READ_ROOTS`
  thunks; `DEFAULT_READ_ROOTS.aider` resolves the git root the transcript is written to.
- **Guard — NO-GO (E).** No `hooks/`, no guard module, no external wrapper. Aider's complete
  argparse surface has no deny-capable pre-execution hook; `--test-cmd`/`--lint-cmd`/`--auto-*`
  **run** (never deny), `--yes-always` auto-approves, git is driven internally (GitPython) so the
  shared **git-ext-diff predicate is moot** (nothing shells `git diff` to intercept), and the shell
  surface is **unsandboxed** (measured: a `--test-cmd` wrote outside the repo). The copilot/
  antigravity declination precedent applies; re-open only if Aider ships a pre-tool hook.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| A | Role-file frontmatter | (1) body-only, native-surface asserts file === shared body; (2) minimal `name`/`description` frontmatter (cursor style) | **body-only** | Aider parses no frontmatter and consumes the file as raw `--read` context; frontmatter would only leak `---`/`name:` noise into the model's context. |
| B | VCS attribution | (1) disable all attribution → one-line conventional; (2) keep `Co-authored-by: aider(<model>)` trailer as provenance | **disable** | Matches craft's one-line-conventional commit style; provenance is recorded by craft elsewhere, not in the commit trailer. |
| C | VCS-port first-classness | (1) dedicated `vcs-posture.js` + a VCS port in the probe; (2) fold git posture into launch-args | **first-class** | Aider's git IS first-class (auto-commit is the handoff); a named port makes the commit/attribution/reset posture testable in isolation. |
| D | Telemetry `--source aider` | (1) wire via a per-source file-matcher seam; (2) wire via an aider special-case in discovery; (3) don't wire (unit-test `parseLines` only) | **(1) per-source matcher** | Aider persists real tokens (not silent-zero like Cursor); a matcher seam mirrors the existing per-source `DEFAULT_READ_ROOTS` pattern instead of special-casing shared code. |
| E | Guard axis | (1) NO-GO clean declination, no wrapper | **decline** | Settled by the live contract: no deny-capable hook, git-ext-diff predicate moot, shell unsandboxed — recorded for traceability, not an open question. |
| F | Auto-commit ↔ never-commit-on-red | (1) keep auto-commit + post-gate + reset-to-pre-turn-HEAD on red; (2) `--no-auto-commits` + craft-driven commit after a green gate; (3) auto-commit + `git revert` on red | **(1) reset-on-red** | Preserves Aider's confirmed auto-commit handoff while guaranteeing no red-gated commit reaches the integration branch; the pre-turn HEAD is a cheap `git rev-parse` capture. |

## Test strategy

Strict TDD, one atomic commit per part, full `scripts/ci.sh` green at every commit; no test spawns a
real `aider`. `native-surface.test.js` pins the 9 role files **byte-identical to the shared bodies**
(file === shared body, body-only), asserts absent frontmatter, and guards the README honesty lines
(guard NO-GO, unsandboxed shell, exit-code-is-not-success, git-ext-diff moot). Unit tests pin
launch-args posture, tier resolution (loud on unknown/empty), vcs-posture flags, and the probe trace
(ports + gate-green-before-accept + reset-on-red). Telemetry is pinned against the real
`engine/test/fixtures/aider/` transcript: `781 sent, 19 received → input 781 / output 19 / caches 0`;
a malformed `> Tokens:` line increments `skipped` (proves no silent-zero); a miner-wiring test covers
`--source aider` discovery + read-root. The live Game-of-Life construction proof (the binding's own
`buildLaunchArgs` + model resolver driving a real turn) is recorded closed in the poc-record.

## Out of scope

- **Any guard / external wrapper** — no deny seam exists on Aider (verdict 2 NO-GO).
- **Paid-provider `Cost:` clause and cache-detail parsing** — unpinned (the live run degraded to a
  free local model); re-pin against a real Anthropic session before parsing them.
- **Large-count token format (≥1000)** — the record pins only the sub-1000 integer form; a
  human-formatted `k`/`M` count is a counted skip until re-pinned, never guessed from memory.
- **Interactive TUI, `/commands`, and the `--architect`/`--editor-model`/`--weak-model` splits** —
  the binding is the one-turn `--message` driver only.
- **`--llm-history-file` parsing** — it embeds Aider's few-shot examples a parser would miscount as turns.
- **Re-opening the guard axis** — deferred to a condition-gated trigger if Aider ships a pre-tool hook.
