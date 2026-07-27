# feat(opencode): native opencode binding of the craft delivery harness

## Background

Craft is a feature-delivery workflow engine packaged as a Claude Code plugin. Its architecture is
hexagonal: a **runtime-neutral engine core** (`engine/bin/*` shims over `engine/src/**`,
`contracts/*.md`, `pipeline/default.yml`, `templates/`, the `scripts/*.sh` lints) sits behind
explicit **ports** (Execution, Model, Memory, Telemetry, VCS, Policy, Backlog, Intention). The
engine never self-references a runtime — every bin locates itself via `import.meta.url`.

The engine was already portable; the **binding layer was not**. Everything a *user* touches — the
19 phase skills invoked as `/craft:<phase>`, the 9 role agents with model pins, the PreToolUse
git-guard hook, `plugin.json` packaging, the tier→SKU model map — was Claude-native. One prior
binding proved the seam is real: `adapters/pi/` drives the same engine on a non-Claude runtime
(headless subprocess), documenting the Execution port's binding set as `{ claude, pi }`.

This change adds **opencode** as the third binding — but by *native packaging* rather than a
headless bin: an opencode user installs one tree and runs the full 11-phase workflow interactively
in the opencode TUI, driven by the same engine core under the same engine-owned invariant contract.

## Intuition

opencode's extensibility maps almost one-to-one onto craft's Claude surface — and it even reads
Anthropic-style Skills and `.claude/` natively. The port is a **translation of the binding layer,
not a fork of the engine**:

```
craft (Claude binding)              →  opencode-native primitive
────────────────────────────────       ─────────────────────────────
skills/<phase> + run orchestrator   →  commands/craft-*.md  (thin dispatchers)
agents/<role>.md (model: <tier>)    →  agents/craft-*.md    (mode: subagent, model: provider/model)
hooks/hooks.json (PreToolUse deny)  →  plugins/git-guard.ts (tool.execute.before → throw)
engine/ bins + scripts/ + contracts →  REUSED byte-for-byte (invoked via !`…` / Bun $)
.claude-plugin/plugin.json          →  opencode.json (agent/command/permission/plugin/subagent_depth)
tier → Claude SKU                   →  tier → provider/model map (Model port, opencode binding)
Task subagent spawn                 →  opencode subagent (task tool / @role, permission.task)
telemetry (claude sibling)          →  engine/src/observability/adapters/opencode/telemetry.js
```

The one non-obvious problem is the **root seam**: 34 path-invocations across 15 shipped Claude
skill/hook files reference `${CLAUDE_PLUGIN_ROOT}` to locate the engine bins, and opencode sets no
such variable. The fix is a binding-neutral shim — `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` — that is
*behaviour-preserving for Claude* (unset `CRAFT_ROOT` → bash default-expansion yields the still-set
`CLAUDE_PLUGIN_ROOT`) and lets opencode export its own `CRAFT_ROOT` from the plugin context. This
touches only the Claude binding *surface* (`skills/` + `hooks/`) — never the engine core.

The second subtlety is invariant fidelity. Rather than author an opencode contract variant, the
binding **reuses agent-mode assembly outright**: the two carve-out lines in `contracts/core.md`
(`@@ARTIFACT_HANDOFF@@`, `@@MODEL_RESOLUTION@@`) are already binding-neutral prose, so the opencode
binding's assembled block is *byte-identical* to Claude's. `contract.js` is untouched — a stronger
fidelity statement than "two lines differ", and it matches the pi precedent that a binding adds no
variant.

## Code

Read the diff in this order:

- **The one mandatory code seam — the git guard.** `adapters/opencode/src/git-guard-predicate.js`
  re-expresses `GIT_DIFF_SHOW_RE` + `COMPLIANT_MARKERS` from the bash hook / pi's `gate.js` (a
  `permission.bash` pattern cannot express "flag absent"); `git-guard-adapter.js` extracts the bash
  command from the tool event; `plugins/git-guard.ts` is a ~10-line Bun shim that throws in
  `tool.execute.before`. All decidable logic is `node --test`-covered; the `.ts` is smoke-only.
- **The pure seams.** `craft-root.js` (resolve an absolute/existing/contained root from the plugin
  context), `model-tier-map.js` (`opus|sonnet|haiku → anthropic/…`, override-able, provider-neutral
  manifest), and `probe.js` (an acceptance-probe mirroring `adapters/pi/src/probe.js` so the
  live-smoke's structural asserts are unit-testable without a live opencode). All hardened with
  `Object.hasOwn` lookups (no prototype-chain bypass).
- **The CRAFT_ROOT shim.** `refactor(opencode): CRAFT_ROOT shim …` rewrites the 34 operational
  references across 15 files; `test/craft-root-shim.test.js` grep-gates the rewrite and runs real
  bash to prove both branches (Claude-preserved / opencode-override).
- **The engine telemetry sibling.** `engine/src/observability/adapters/opencode/telemetry.js` maps
  `opencode run --format json` events → the neutral `UsageEvent[]` (whitelist redaction, streaming
  parity with the claude binding), reusing `aggregate`/`serializeReport` unchanged; a generic
  `--source claude|opencode` selector in `usage-mine-main.js` routes it. 100% mutation score.
- **The declarative surface.** 9 `agents/craft-*.md` subagents (least-privilege `permission:` maps;
  committing roles carry `bash: allow`, the read-only reviewer `edit: deny`, the backlog-ticker
  `bash: deny` because the session commits its flip), 4 `commands/craft-*.md` dispatchers,
  `opencode.json` (`subagent_depth: 1`), and a provider-neutral `.claude/workflow.md`.
- **The port docs.** `docs/adapters/{execution,model,telemetry}.md` grow `Binding set` to
  `{ claude, pi, opencode }` with an opencode section each; `docs/adapters/opencode-poc-record.md`
  is the on-demand live-smoke scaffold.

---

### Provenance & verification

- **Decisions:** ADR-215 … ADR-228 (14 ADRs — 216/217/227 user-ratified, the rest
  adopted-as-recommended). Load-bearing: 216/217 (single-source commands + `CRAFT_ROOT` shim),
  220 (zero-line-diff invariant fidelity), 222–224 (git-guard binding), 227 (telemetry port home +
  generic selector).
- **Design:** `docs/design/opencode-adapter.md` (external opencode contract empirically pinned
  2026-07-17; §D9 DEFERRED rows are the live-smoke agenda). Brief: `docs/PRD-opencode-port.md`.
- **Divergences:** none — every settled decision matched the design's recommendation, so no
  scope-fold / designer re-spawn.
- **Pinned behaviours:** git-guard block/pass matrix (mirrors bash/pi); `CRAFT_ROOT` shim
  default-expansion (Claude preserved, opencode override wins); opencode binding block byte-identical
  to Claude agent-mode (contract-equivalence); telemetry redaction whitelist + `report.json`
  byte-parity; tier-map provider-agnostic swap (pi-Gemini precedent); agent permission capability
  contract (committing roles `bash: allow`, reviewer `edit: deny`, backlog-ticker `bash: deny`).
- **Test plan:** `bash scripts/ci.sh` green — engine 1817 · pi 202 · opencode 228 · process 186
  (2433 tests, 0 failures); shellcheck, pipeline/contracts/backlog/design/docs-structure lints clean.
  Mutation (validation phase, per-hunk over the 2 touched engine/src files): 12 survivors → all
  killed → re-run **0 survivors / 100% score**. Adapter `src/*` mutation coverage is a documented
  follow-up (BACKLOG). Live smoke against a pinned opencode version is on-demand (BACKLOG /
  `opencode-poc-record.md`), mirroring pi.
- **Run record:** workspace (worktree + green baseline) → design (doc `58d59c5`, 14 candidates) →
  decisions (ADRs 215–228; no deviation) → planning (15-part plan, plan-lint green) →
  implementation (15 atomic parts, `GATE(implementation): green`) → review (code 0 · perf 0 ·
  security 4×LOW → fixed · tests 2×MED+1×LOW → fixed · fix-delta re-review CONVERGED) →
  `NO-OP(refactoring): nothing cleared the bar` (cross-binding duplication deliberate per ADR-223) →
  validation (DoD met; mutation 100%; `GATE(validation): green`; no intention drift) →
  documentation (README + DESIGN-customizable-engine refreshed; backlog follow-ups) →
  `NO-OP(propose): no remote` → `NO-OP(integrate): no remote`.
