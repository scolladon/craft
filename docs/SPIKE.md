# craft-spike — pinned Claude Code mechanics (2026-06-12, claude CLI 2.1.175)

Throwaway spike for the `craft` plugin design (see `../workflow-promotion-design.md`,
Migration step 0). Method: headless `claude -p --plugin-dir <this dir>` runs with
instrumented hooks logging their received input to `/tmp/craft-spike/hooks.log`.
`ANTHROPIC_API_KEY` must be unset for child runs (it shadows OAuth and fails on a
zero-credit account).

## Results

| # | Question | Verdict | Evidence |
|---|---|---|---|
| a | Do plugin hooks fire for SUBAGENT tool calls? | **CONFIRMED** | Both plugin PreToolUse(Bash) hooks logged the subagent's `echo` command (same session id); marker executed inside the subagent's call |
| b | How do two `updatedInput` PreToolUse hooks compose? | **SAME-SNAPSHOT, LAST-WRITER-WINS** | Hook B received the ORIGINAL command, not A's rewrite; only B's marker executed. Cross-source: with user-level rtk-rewrite active, both plugin hooks saw the original, rtk's rewrite executed, plugin marker DISCARDED → merged order runs user-settings hooks after plugin hooks; no chaining, no merge |
| b' | Does a hook DENY beat a concurrent `updatedInput`? | **CONFIRMED** | Deny variant blocked `git status` with its exact corrective message while rtk (updatedInput) was active on the same call |
| c | Does a per-invocation `model` param override agent-def frontmatter? | **CONFIRMED** | `craft-spike:echo` (frontmatter `model: haiku`): bare spawn ran haiku, spawn with `model: 'sonnet'` ran sonnet-4-6 — verified in transcript JSONL, not just self-report |
| d | Plugin skill invocation surface + arguments | **CONFIRMED** | `/craft-spike:run hello 24.9k extra words` → skill fired, `$ARGUMENTS` = full string verbatim |

## Design consequences (applied to workflow-promotion-design.md)

1. **Drop the belt-and-braces agent-def lines** — hook inheritance is confirmed; the
   mechanical layer reaches subagents.
2. **The craft git-mangler guard uses DENY-with-corrective-message, not `updatedInput`**
   — rewriting cannot compose with rtk (or any other Bash-rewriting hook): same
   snapshot, last writer wins, and the winner depends on source ordering (user-after-
   plugin observed on 2.1.175, not contractual). Deny is order-independent and
   deterministic: one corrected retry instead of silent clobber.
3. **`models:` manifest override is implementable** as the per-invocation param; agent
   frontmatter is the default, the param takes precedence.
4. **Entry point confirmed**: `/craft:run <args>` with `$ARGUMENTS`.

Headless side-observation: `-p` main loops defaulted to opus-4-8 regardless of the
interactive session's model — irrelevant to the design but worth knowing for CI use.

---

# SP2 — cross-plugin extension/dispatch (customizable-engine PRD; CLI 2.1.177)

Can a repo's OWN local plugin EXTEND craft — i.e. craft's `/craft:run` orchestrator
discover and dispatch to a phase skill + role agent defined in a *different* plugin? Gates
G8 / Tier-2 / P14 / P16. See `docs/PRD-customizable-engine.md` §7 (Tier 2).

## Phase A — documentation grounding (DONE)

**Verdict: largely GREEN — cross-plugin composition is officially supported.**

| Question | Verdict | Detail |
|---|---|---|
| Multiple plugins active at once | **SUPPORTED** | namespaced: `pluginA:skill`, `pluginB:agent`; subfolder agents `plugin:dir:agent` |
| Agent registry across plugins | **SUPPORTED** | global — all enabled plugins' agents in one registry; orchestrator can spawn another plugin's agent |
| Skill→skill across plugins | **SUPPORTED (docs imply)** | Skill tool invokes namespaced `pluginB:phase` — but no explicit cross-plugin example → Phase B |
| `${CLAUDE_PLUGIN_ROOT}` scoping | **SUPPORTED** | per-plugin — resolves to the owning plugin's own root even with others loaded |
| Plugin dependencies / extension | **SUPPORTED** | `plugin.json` `dependencies: ["craft"]`, semver, auto-install; cross-marketplace needs `allowCrossMarketplaceDependenciesOn` allowlist |
| One marketplace, many plugins + local coexist | **SUPPORTED** | `--plugin-dir` coexists with installed; local wins on name clash |

**Hard constraints (documented):**
- **No cross-plugin file access** — a plugin cannot read another plugin's files (`../`
  traversal fails post-install); only same-marketplace **symlinks** are dereferenced/copied.
  **No `${PLUGIN_B_ROOT}` variable.**
- Cross-marketplace deps require an allowlist; cache paths change on update.

**Design implication (provisional — folds into PRD §7 Tier-2):**
- The extension surface **rides on native `dependencies` + namespacing**, not a bespoke
  `craft.extends` mechanism. Derived plugin B: `dependencies: ["craft"]`, ships
  `pluginB:my-phase` skill + `pluginB:my-agent`.
- Because craft (plugin A) **cannot read plugin B's files**, the phase **descriptor wiring**
  (execution, gate, consumes/produces, role) lives in the **repo manifest** (`.claude/workflow.md`,
  which craft already reads); plugin B ships only the *skill/agent content*, invoked **by
  namespaced name**. This cleanly sidesteps the file-access constraint.

**Undocumented → Phase B (empirical, `claude -p --plugin-dir a --plugin-dir b`):**
1. Skill in plugin A invokes a skill in plugin B via the Skill tool (runtime confirm).
2. Does the `Agent(name)` tool-allowlist accept **scoped** names (`Agent(pluginB:agent)`)?
3. What context/skills does a cross-plugin-spawned subagent inherit (craft's, or only B's)?
4. Same-marketplace symlink for a shared script resolves at runtime; `/reload-plugins` picks up cross-plugin changes.

## Phase B — empirical (DONE, CLI 2.1.177)

**Verdict: GREEN — cross-plugin dispatch works on native primitives.** Two minimal plugins
(`craft-base` orchestrator + `ext-phase` derived), loaded via
`claude -p "/craft-base:run" --plugin-dir craft-base --plugin-dir ext-phase`. The plugin-A
orchestrator skill was told to invoke `ext-phase:custom-phase` (skill) and spawn
`ext-phase:new-role` (agent), both in plugin B.

- **Result, both runs:** `RESULT skill=EXT_SKILL_OK_7f3a agent=EXT_AGENT_OK_9b2c`.
- **Airtight:** the confirming run allowed **only `Skill,Task`** (no Bash/Read). The two
  tokens exist nowhere in plugin A → the sole source is genuine cross-plugin invocation.
- **CONFIRMED:** (1) a skill in plugin A invokes a skill in plugin B via the Skill tool;
  (2) a skill in plugin A spawns an agent in plugin B via the Task tool, addressed by the
  namespaced `subagent_type: ext-phase:new-role`.

**Consequence:** G8 / Tier-2 / P14 are feasible on native deps + namespacing — **R1
cleared**, no bespoke dispatch mechanism required. Still untested (non-blocking
refinements): the scoped `Agent(pluginB:agent)` *allowlist-restriction* form;
same-marketplace symlink for shared scripts; cross-plugin subagent context-inheritance
depth. Throwaway spike dir: `/tmp/craft-sp2`.

---

# SP1 — inline execution convention (customizable-engine PRD §10; CLI 2.1.177)

How does a phase run **inline** (in the session's own context, no subagent) while keeping
the contract injected and the gate enforced — and what does artifact-is-the-handoff mean
with no agent to die? Gates G4 / P6 / the `solo` profile.

**Verdict: design-resolved — no CLI probe needed.** The mechanic is already established:
Claude Code **skills run in the main conversation**; "agent" execution is the *deliberate*
delegation of a phase to a Task subagent. So `inline` is simply the **absence of
delegation** — the session runs the phase body itself. craft already does this for its
session-owned phases (ADR, refactor judgment, synthesis); `execution:` generalizes the
choice to every phase.

## The convention (`execution: agent | inline`, per phase / profile)

| Concern | `agent` (default) | `inline` |
|---|---|---|
| Who runs it | orchestrator spawns a role agent (Task) | the **session** runs the phase body in-thread |
| Contract | injected into the spawn prompt | the session loads the same engine contract block at phase entry and follows it itself |
| Manifest `context:` / retrieval | injected into the spawn prompt | loaded into the session at phase entry (same assembly path) |
| Gate | session verifies the agent's commit, runs the gate | session runs the **same** gate; commit only on green |
| Mechanical guards (hooks) | fire for the subagent's tool calls (spike-confirmed) | fire for the **session's** tool calls — the floor holds either way |
| Handoff | the commit is the handoff; dead agent → respawn from artifact | the commit is the handoff; **no respawn** (the session continues) |
| Model | resolved per spawn + fallback | the **session model** (no separate spawn to re-target) — §11 inline carve-out |

**Transformed invariants (the two §11 names the carve-out enumerates):**
artifact-is-the-handoff → "the commit is the handoff"; model-resolution+fallback → the
session model. Every other invariant binds verbatim.

**When to choose inline:** small/cheap phases or the `solo` profile — saves the spawn
round-trip (speed, G12) and the subagent context duplication (tokens, G12), at the cost of
**isolation**.

**Parallelism caveat (load-bearing):** `agent` mode enables *parallel* phases — e.g. the
review phase fans out one subagent per dimension concurrently. `inline` is inherently
**sequential** (one session, one thread). So a multi-dimension harness stays `agent` even
under a lean profile *unless* the repo accepts running its dimensions sequentially. Profiles
must encode this: `solo` = inline + single-pass harnesses; it does not silently serialize a
fan-out the user still expects to parallelise. Record the inline/sequential choice in the
run record.

---

# SP3 — per-invocation args survive `$ARGUMENTS` (PRD §10 / OQ2; CLI 2.1.177)

Do craft-level args (`--profile solo`, `--skip`, pipeline edits) reach the orchestrator
skill via `$ARGUMENTS` in headless `-p`? R9 flagged it as a live risk (the `-p` forced-opus
observation).

**Verdict: GREEN.** Minimal `argecho` plugin; skill body echoes `ARGS=[$ARGUMENTS]`:
- `claude -p '/argecho:run --profile solo build the widget'` → `ARGS=[--profile solo build the widget]`
- `claude -p '/argecho:run --profile solo --skip refactor,mutation "feat: x"'` → `ARGS=[--profile solo --skip refactor,mutation "feat: x"]`

`$ARGUMENTS` is substituted **verbatim** in headless `-p`, preserving flag tokens,
comma-lists, and embedded quotes. **R9 cleared** — the orchestrator can parse
`--profile`/`--skip`/pipeline-edit tokens out of `$ARGUMENTS`; per-invocation profiles
(OQ2) are buildable. (The earlier `-p forced opus-4-8` note concerns main-loop *model*
selection, not args.) Throwaway spike dir: `/tmp/craft-sp3`.

---

# SP4 — generic vocabulary / harness family (PRD §6.4; DECIDED 2026-06-15)

**Decision: full-SDLC concern-naming + `mutation → validation`.** A phase `id` names the
**engineering concern**; the concrete **technique** lives in `harness.tool` or the phase
probe. Old names ship as **back-compat aliases** (manifest-lint resolves them; N1).

## Decided taxonomy
| Archetype | Phase (concern) | Alias (old) | Default technique |
|---|---|---|---|
| Setup | `workspace` | branch | git worktree / in-place branch |
| Specification | `requirements` *(opt, off)* | prd | PRD/spec doc |
| Specification | `design` | — | design doc |
| Specification | `decisions` | adr | ADR records |
| Specification | `planning` | plan | part-based TDD plan + plan-lint |
| Construction | `implementation` | implement | TDD parts |
| Harness — *reading* | `review` | — | AI multi-dimension diff read |
| Harness — *executing* | `validation` | mutation | mutation testing (stryker/mutmut/cargo-mutants) |
| Harness — *executing* | `architecture` *(opt, off)* | — | dependency/layering rules (dependency-cruiser/ArchUnit/import-linter) |
| Refinement | `refactoring` | refactor | structural refactor |
| Delivery | `documentation` | docs | doc pages + backlog tick |
| Delivery | `propose` | pr | `gh pr create` |
| Delivery | `integrate` | merge | squash-merge + cleanup |

## Harness family
- **Reading harness** — `review`: AI reads the diff across dimensions (code/security/tests/perf).
- **Executing harnesses** — a tool runs, AI triages: `validation` (test-suite efficacy;
  default mutation testing), `architecture` (structural rules; default dep/layering linter);
  open-ended (security, performance, accessibility…). Each is concern-named, tool-pluggable
  (`harness.tool`), AI-triaged, and gates the PR.

## New default phases (both default-OFF / opt-in)
- `requirements` (Specification) — produces a PRD/spec; new agent `requirements-writer`.
- `architecture` (Harness) — structural-rule gate; new agent `architecture-triager`.

## Implementation (→ P4)
Rename skill dirs + agents (`mutation-triager → validation-triager`, …), update the run
orchestrator phase table, add the alias-resolution map + fixture to manifest-lint (§13/SC4).
Aliases: `branch, prd, adr, plan, implement, mutation, refactor, docs, pr, merge`.

---

# SP6 — backlog adapter interface (PRD §9; design-resolved 2026-06-15)

**Verdict: resolved; capabilities confirmed** (`gh` present + authed; Atlassian MCP
`getJiraIssue`/`transitionJiraIssue`/`addCommentToJiraIssue` exist).

**Port (mechanism only):**
- `resolve(id) → { title, brief }` — read-only; id not found → **blocker** (never guess).
- `complete(id, refs[]) → void` — idempotent; append refs (PR url, commits); bounded-change guard.

| `backlog.source` | resolve | complete | status |
|---|---|---|---|
| `file` (default) | look up id in the backlog md (`^\d+(\.\d+)+$`) | flip `[ ]`→`[x]` + append refs (current backlog-ticker) | current |
| `github-issues` | `gh issue view <id> --json title,body` | `gh issue close` + `gh issue comment` (refs) | gh ✓ |
| `jira` | MCP `getJiraIssue` | `transitionJiraIssue`→Done + `addCommentToJiraIssue` | MCP ✓ |
| `linear` | own MCP / `custom` | "" | → `custom` (no MCP yet) |
| `custom` | repo script | repo script | always |

**Failure contract:** an unreachable source (MCP down / auth expired / `gh` missing) → a
**blocker via the blocker protocol**; the closing tick lives in the run record and is never
silently skipped. **Hexagonal split:** core owns *which id-form is a backlog id* + *when
`complete` fires* (delivery, after the PR exists); the port owns only `resolve`/`complete`.

# SP7 — retrieval-strategy derivation (PRD §10.1; design-resolved + baseline confirmed)

**Verdict: resolved.** Grep of craft **plugin** content (`agents/ skills/ templates/`) for
`serena|symbol tool|LSP|RAG|rtk|ripgrep` → **empty**. craft is **already
retrieval-strategy-free** (the tsgit Serena mandate lives in the *repo* declination, not
the plugin). G14 = keep it that way + add derivation/injection.

**Precedence (most-specific wins):** project (manifest `retrieval:` / repo context) > active
env capabilities (probe) > user prefs (global CLAUDE.md, inherited) > native (Read/Grep/Glob).

**Mechanism:**
- **Declaration (primary, reliable):** a `retrieval:` manifest field — a context-file
  pointer (same shape + injection as the existing `serena.md` pattern), or a named strategy
  craft maps to a stock note. Injected into every spawn + inline run via the contract/context
  assembly path.
- **Probe (secondary, best-effort hints):** filesystem/env signals — `which rtk`, a
  `.serena/` config, an LSP/RAG config dir. The engine *hints*, never *assumes*. (MCP-tool
  availability is not reliably introspectable from a script → declaration is the robust path.)
- **Mechanical layers apply automatically:** RTK + tool-call hooks fire at the tool layer
  (inheritance spike-confirmed); craft only coexists.
- **Native floor:** nothing declared/detected → Read/Grep/Glob, no opinion.

**Strategy-free invariant (→ P5/P12, SC8):** a CI lint greps plugin content for retrieval
strings and fails if any appear. Baseline green today.

# SP8 — VCS/integration port (PRD §2.1; pinned from the lifecycle scripts)

**Verdict: resolved.** Port a non-Claude adapter must implement (mechanism; core keeps
ordering/cadence policy):
- `isolate(type, slug) → workspace` — git-worktree in the Claude adapter (`worktree-setup.sh`:
  lockfile-probe → deps **installed in-worktree, never symlinked**); or in-place branch under
  `branch: { strategy: in-place }`.
- `commit(message) → hash` — atomic commit (the handoff). `diff(range)` / `defaultBranch()` — read ops for scoping.
- `propose(title, body) → url` — `gh pr create`.
- `integrate(flags) → void` — `gh pr merge --squash --delete-branch <flags>`.
- `teardown(workspace, {force})` — **lock-aware** (`worktree-teardown.sh`): refuses while
  `.craft-mutation.lock` holds a live PID (`<pid> <iso-ts>`); auto-clears a dead-PID lock;
  live PID needs `--force` (echoed; run-record-logged). Then `fetch --prune` → `worktree
  remove` → `branch -D`.

**Git/worktree-specific (adapter's choice, NOT the port contract):** the worktree mechanism
+ lifecycle scripts. A non-git/non-worktree adapter satisfies isolate/teardown differently
(clone, container, branch) as long as it honors: isolated workspace · deps installed
in-isolation · teardown refused while a long-running job holds the lock. **Hexagonal split:**
core owns ordering — validation/architecture triage gates `propose`; `integrate` only after
CI-green + user-confirm; teardown only after integrate, lock-aware. Port owns the raw verbs.

---

# SP5 — model-class portability (PRD §12 G12-model; DONE)

**Status: DONE (external run, 2026-06-15) — all 12 probes PASS across all tiers.** Question:
the lowest model tier that still honors craft's load-bearing agent contracts → defines the
supported "model class."

**Method:** for each tier in {opus, sonnet, haiku}, drive 4 contract probes via headless
sub-runs (`env -u ANTHROPIC_API_KEY claude -p "<probe>" --model <tier> --append-system-prompt
"$(cat agents/<agent>.md)" --allowedTools "" --output-format text`) and score adherence.
Probes (text-in/out, mostly mechanical):
- **A — planner/plan-schema:** plan a `slugify` util → `scripts/plan-lint.sh` PASSes.
- **B — part TDD + no-suppression:** `isEven` RED-before-GREEN, no suppression directives.
- **C — reviewer structured findings:** review a planted off-by-one diff → severity-tagged + catches the bug.
- **D — blocker protocol:** an under-specified part → returns `{part, reason, ≤3 options}`, doesn't guess.

12 runs → a tier×probe PASS/PARTIAL/FAIL matrix → `proposed-class` = lowest all-PASS tier.
Full operator prompt is in the PR thread / session; result pasted back here on completion.
Model IDs if aliases rejected: opus=claude-opus-4-8, sonnet=claude-sonnet-4-6,
haiku=claude-haiku-4-5-20251001.

## Result — all PASS; the class is broad

| tier | A plan-lint | B tdd+no-suppress | C review-struct | D blocker |
|---|---|---|---|---|
| opus (claude-opus-4-8) | PASS | PASS | PASS | PASS |
| sonnet (claude-sonnet-4-6) | PASS | PASS | PASS | PASS |
| haiku (claude-haiku-4-5-20251001) | PASS | PASS | PASS | PASS |

**Supported class: Haiku-4.5 and up.** Every load-bearing contract — plan part schema,
TDD + no-suppression, structured review (catches the planted index bug), blocker protocol —
holds across the entire Claude tier ladder, down to the cheapest tier. Strong evidence for
G12: contract adherence does not require top-tier reasoning.

**Scope honesty (do not over-claim):** these are short, isolated *contract-adherence* probes
— not full multi-phase runs with real tools, long context, convergence loops, or cross-agent
handoffs. Haiku passing ≠ Haiku produces Opus-quality *output*. The probes pin the
**portability floor** (the workflow won't break), not output quality — depth still scales
with tier. So: keep higher tiers as the *default* on quality-sensitive roles (designer /
planner / reviewer), Haiku fine for mechanical roles (backlog-ticker). But the **fallback
chain is now proven contract-safe**: a `models.fallback` landing on a lower tier degrades
quality at worst, never breaks a contract.

**Format-variance signal (haiku/C):** Haiku returned the review findings as severity-tagged
*JSON* (not one-per-line) — still parseable, still caught both bugs. Lesson: models vary the
*shape* of structured output → the engine must pin the output format tightly or parse
robustly across shapes (→ P5/P8 reviewer-output handling).

**Caveat:** one provider (Claude). This pins the *Claude* class; cross-*provider* portability
(G13) is a separate question for P16 / the adapter PoC.
