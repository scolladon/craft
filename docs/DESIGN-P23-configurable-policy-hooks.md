# Design — Configurable policy hooks: always / ask / never (user + project precedence)

> Brief: Expose three configurable policy verdicts — `always` / `ask` / `never` — over a vocabulary of nameable outward/hard-to-reverse craft actions, settable at user and project scope (project overrides user; per-invocation overrides both, per ADR-022), consulted by each phase before it acts.
> Status: accepted (ADRs 124-130) — draft → self-reviewed ×3 → decisions ratified (DC D-F/D-P/D-V/D-D/D-S/D-C/D-PA → ADRs 124-130). One decision deviated the recommendation and is folded in below: ADR-128 (D-S → **Supersede**, not Floor-only) — `always` lifts craft's hardcoded merge/PR confirmations; the merge confirmation is now a policy-governed default (`ask` per ADR-127), not a floor. The only non-overridable floors are the three engine invariants (never-commit-on-red, validation-triage-gates-propose, artifact-handoff), which are not policy-nameable actions.

## Context

craft already governs *what runs* (the pipeline: phases, profiles, skips, execution mode) through a layered config surface. What it does **not** yet govern declaratively is *how autonomously the plugin acts* at the moment of an outward, hard-to-reverse action. That discipline is currently **hardcoded prose** scattered across phase skills:

- `skills/integrate/SKILL.md:17` — "**The user confirms the merge** — never merge unprompted." then `gh pr merge`.
- `skills/integrate/SKILL.md:22-30` — worktree teardown via `scripts/worktree-teardown.sh` (which runs `git worktree remove --force`, `git branch -D`, `rm -f` lock — `scripts/worktree-teardown.sh:33,40,62,66`).
- `skills/propose/SKILL.md:20` — `Push -u origin <branch>`; line 21-23 — `pr.creator: session` → `gh pr create`, `user` → hand body to user and stop.
- `skills/workspace/SKILL.md:25-26` — `git worktree add … -b <branch>` + `worktree-setup.sh` (installs deps).
- `skills/documentation/SKILL.md:23-33` — backlog tick (file edit under guard) + `source: custom` runs an external `ref` script with `["complete", id, …]`.

These are exactly the verbs the **VCS port** already names (`docs/adapters/vcs.md`): `isolate`, `commit`, `diff`, `defaultBranch`, `propose`, `integrate`, `teardown`. The brief calls this craft's "own permission/policy layer — the engine-level analogue of the harness's 'confirm before hard-to-reverse/outward actions' discipline" (cf. `contracts/core.md`, which injects the never-commit-on-red / blocker discipline into every spawn but says nothing about merge/push/delete autonomy).

**Constraints this design must compose with (pinned from the codebase):**

1. **Overlay precedence (ADR-022, `engine/src/cli-overlay.js`, `engine/src/pipeline-resolve-main.js:190`).** Per-invocation flags are merged into the manifest at **highest precedence** by `applyCliOverlay`, *before* `resolvePipeline` runs, in the deterministic engine/bin layer. Precedence today is **per-invocation (CLI) > project (manifest)**. There is **no user/global layer anywhere in the engine** — confirmed: `manifest-lint-main.js:10` and `pipeline-resolve-main.js` read only the repo manifest `.claude/workflow.md`; ADR-121 explicitly says memory "scoping stays per-repo (no user/global layer)". P23 is the **first** feature to introduce a user scope, so the user-file location/shape is genuinely new ground (decision candidate).

2. **Manifest mechanism (`engine/src/manifest.js`, `scripts/manifest-lint.sh` → `engine/src/manifest-lint-main.js`).** A new top-level config key is added to `TOP_KEYS` (`manifest.js:13`), gets a `validateX(value, …, errors)` validator dispatched from the `switch` at `manifest.js:657`, and is exercised by mirroring an existing validator's test surface. ADR-121 set this exact precedent for the `memory:` key (validated "exactly like `backlog`").

3. **Resolution shape (`engine/src/resolve.js`, `pipeline-resolve-main.js:228`).** `resolvePipeline` returns `{ ok, errors, effective[], record[], gateDecisions[], waivers[] }`, serialized as JSON the orchestrator (`skills/run/SKILL.md:47`) parses and walks. Phase-level config rides the resolved descriptor; manifest-level facts ride `record[]`. A new resolved surface either rides the `Resolution` or is resolved separately (decision candidate).

4. **Ports/adapters structure (`docs/adapters/*.md`).** Every port doc follows one shape: **Port interface** (verbs with pre/post) → **Core policy retained (NOT port verbs)** → **Binding set `{claude, pi}`** → **Claude binding** → **Pi binding** → **Failure → blocker** (Config vs Runtime). The binding set models exactly the interactive-vs-headless contrast P23 needs (`claude` = interactive orchestrator with `AskUserQuestion`; `pi` = headless `pi -p` subprocess, no interactive user).

5. **Headless contrast (`docs/adapters/pi-poc-record.md`, ADR-095 `craft-pi-headless-role-less-phase-semantics`, ADR-113).** Headless craft (`craft-pi`) drives the full 11-phase walk via CLI subprocess with **no interactive user**. The brief mandates: in headless, `ask:` ⇒ treat as `never:`/blocker unless pre-approved. ADR-095 already reframes integrate's stop-before-merge as a role-less semantic rather than a hardcoded default — P23 is its declarative form.

This design is **engine + spec + orchestrator-seam**, mirroring P22 (memory): a pure resolver module in `engine/src/`, a manifest key + validator, a port spec doc, and a single consult seam wired into the orchestrator and the outward-action phase skills.

## Requirements

When this ships, all of the following are verifiable:

1. **R1 — Three verdicts, two scopes + per-invocation.** A `policy:` config block accepts `always`, `ask`, `never` lists of action names, declarable in the **project manifest** (`.claude/workflow.md` frontmatter) and a **user-level file**, merged so that **project overrides user**, and a **per-invocation overlay** overrides both — the same precedence direction as ADR-022 (`per-invocation > project > user`).

2. **R2 — Canonical action vocabulary.** A fixed, exported set of nameable actions covers every outward/hard-to-reverse action the real phases perform today (the VCS-port verbs + the two non-VCS outward actions: external-send and backlog-file-write). Each action name resolves to exactly one verdict via a pure `resolvePolicy(action, effectivePolicy)` function (over the already-merged scope map; see D5). An **unlisted** action resolves to a **documented default verdict** — a per-action default keyed by reversibility/outwardness, not a blanket value (ADR-127; see D-D in the decision log).

3. **R3 — Deterministic conflict resolution.** A cross-scope conflict (user says `ask`, project says `always`) resolves by scope precedence (`per-invocation > project > user`, last-scope-wins). An intra-scope conflict (one scope lists an action under two verdicts) is a **config error** (ADR-129; D-C), not a silent pick. Both behaviours are documented and deterministic.

4. **R4 — Interactive surfacing.** Under the interactive (`claude`) binding, a resolved `ask` verdict makes the orchestrator pause at the consult seam and ask the user via `AskUserQuestion` before the action proceeds; `always` proceeds silently (recorded); `never` refuses and records a no-op/blocker per the action's reversibility.

5. **R5 — Headless degradation.** Under the headless (`pi`) binding, a resolved `ask` verdict — for which there is **no interactive user** — degrades to `never` (a recorded blocker) **unless pre-approved** via a per-invocation pre-approval channel that names the action; `always`/`never` behave identically to interactive.

6. **R6 — Exactly three floors are absolute; the merge confirmation is a policy-governed default.** Three invariants are **non-overridable** by any policy verdict and are not nameable actions at all: the never-commit-on-red gate, the validation-triage-gates-propose invariant, and the artifact-handoff invariant. They are absent from `POLICY_ACTIONS` (un-nameable), so policy cannot reach them. The merge confirmation (`integrate/SKILL.md:17`) and the `pr.creator: user` stop are **not** floors — they are the **default verdict (`ask` per ADR-127) of the policy-nameable actions `integrate` and `propose`**, which an explicit `always` verdict **supersedes** into config-driven auto-merge / auto-PR (ADR-128, the load-bearing decision). Safe-by-default is preserved because the unconfigured default is `ask` (ADR-127), so auto-merge is strictly opt-in via `always: [integrate]`; it is never silently granted.

7. **R7 — Config-error loudness.** A malformed `policy:` block (unknown action name, unknown verdict key, non-list value, a user-file path that escapes its root) is a **config error caught at lint/resolve time → non-zero exit before any phase runs**, mirroring `validateBacklog`/`validateMemory`. A *missing* policy block is **not** an error — it means "engine defaults" (every action at its default verdict).

8. **R8 — Consult seam is single and documented.** Each phase consults policy through **one** mechanism (a `Policy.consult(action)` port verb backed by the pure `resolvePolicy`), documented in a port spec mirroring `docs/adapters/memory.md` / `vcs.md`, with `{claude, pi}` bindings and a Failure→blocker section.

9. **R9 — No suppression / no swallow.** A `never` refusal and an unapproved-headless-`ask` are recorded explicitly (run record / non-zero exit), never silently skipped.

## Design

### D1 — Config surface (the `policy:` key)

A new top-level manifest key, validated like `backlog`/`memory` (ADR-121 precedent). Verdicts are the keys; action names are list values.

```yaml
# .claude/workflow.md frontmatter  (PROJECT scope)
policy:
  always: [isolate, commit, push, integrate]   # integrate=merge → config-driven auto-merge (ADR-128)
  ask:    [propose, external-send]
  never:  [teardown]
```

The **user-level file** carries the identical block under the same key. Its location/shape is decided (ADR-124): a frontmatter-bearing `~/.claude/craft-policy.md`, so it reuses `extractFrontmatter` + `validateManifest`'s `policy` validator verbatim (one validator, two call sites), exactly as the project manifest does.

**Per-invocation overlay.** A repeatable CLI flag on `pipeline-resolve`, parsed in `pipeline-resolve-main.js:parseArgs` next to `--profile`/`--skip`/`--harness`:

```
--policy <action>=<verdict>      e.g.  --policy integrate=ask  --policy push=never
```

The orchestrator strips `--policy` tokens from `$ARGUMENTS` in `run/SKILL.md` §0a (alongside the existing flag-strip) and forwards them to the bin — the non-flag remainder stays the brief.

**Scope precedence (reuses the ADR-022 overlay machinery).** Three scopes fold in one direction, **per-invocation > project > user**, mirroring how `applyCliOverlay` folds CLI over manifest today. The fold is a pure function `mergePolicyScopes(user, project, perInvocation) → effectivePolicy`, living in the new `engine/src/policy.js`, analogous to `applyCliOverlay`'s `unionSkip`/`mergeHarnessOverlay`. Unlike skip (which *unions*), policy verdicts **last-scope-wins per action**: a higher-precedence scope naming `integrate` under any verdict fully replaces a lower scope's verdict for `integrate` (an action has exactly one verdict; there is no "union of verdicts").

**Data shape (pinned).** The effective policy is normalized to a flat action→verdict map, not three lists, so `resolvePolicy(action)` is an O(1) lookup and conflict resolution happens once at merge time:

```js
// effectivePolicy
{ isolate: 'always', commit: 'always', push: 'always', integrate: 'always',
  propose: 'ask', 'external-send': 'ask', teardown: 'never',
  'backlog-write': 'always' }   // actions absent from all scopes get DEFAULT_VERDICT[action]
```

### D2 — Action vocabulary

Sourced from the **real outward/hard-to-reverse actions** in the phase skills and the VCS port (`docs/adapters/vcs.md`), not invented. The vocabulary is decided (ADR-126): the canonical action names are the **VCS-port verb names verbatim**. The frozen set, exported as `POLICY_ACTIONS` from `engine/src/policy.js` (like `CONCERNS` in `memory.js`):

| Action | Phase / seam (pinned) | Outward? | Reversible? | Default verdict (ADR-127) |
|---|---|---|---|---|
| `isolate` | workspace — `git worktree add` + deps install (`workspace/SKILL.md:25`) | local | yes | `always` |
| `commit` | every producer phase — `vcs.commit` (the handoff) | local | yes (history) | `always` |
| `push` | propose — `Push -u origin` (`propose/SKILL.md:20`) | **remote** | hard (rewrites remote ref) | `ask` |
| `propose` | propose — `gh pr create` (`propose/SKILL.md:21`) | **remote** | medium (closeable) | `ask` |
| `integrate` | integrate — `gh pr merge --squash --delete-branch` (`integrate/SKILL.md:19`) | **remote** | **irreversible** | `ask` |
| `teardown` | integrate — `worktree remove --force` + `branch -D` (`integrate/SKILL.md:22`) | local | hard (deletes work) | `ask` |
| `external-send` | docs `source: custom` runs external `ref` script (`documentation/SKILL.md:27`); any future outbound | **outward** | varies | `ask` |
| `backlog-write` | docs — backlog tick file edit / custom `["complete", …]` (`documentation/SKILL.md:23`) | local file | yes | `always` |

The **Default verdict** column is `DEFAULT_VERDICT`, the per-action default keyed by reversibility/outwardness (ADR-127): remote/irreversible actions default to `ask`, local reversible actions to `always`. It is the verdict a fully-unconfigured repo gets, and it is what keeps Supersede (ADR-128) safe-by-default — `integrate` defaults to `ask`, so auto-merge requires an explicit `always: [integrate]`.

**Naming (ADR-126).** Action names are the **VCS-port verb names verbatim** so the policy vocabulary and the port vocabulary cannot drift: `isolate`, `commit`, `push`, `propose`, `integrate`, `teardown`. Two names are not VCS verbs and are named for the seam: `external-send` (any outbound to a third party / external script) and `backlog-write`. **Granularity** is per-verb (not per-phase, not per-CLI-flag): a phase may perform several actions (integrate does `integrate` then `teardown`), and each is independently governed — this matches the real seams, where merge and teardown are distinct steps today.

> **Alias note (ADR-126).** The canonical token for merging a PR is **`integrate`** (= "merge"); for creating a PR it is **`propose`** (= "pr-create"). Operators write `always: [integrate]` to enable auto-merge and `never: [propose]` to forbid PR creation. `policy.md` carries this `integrate`=merge / `propose`=pr-create alias note so the verb meaning is discoverable.

**Resolution to verdict.** `resolvePolicy(action, effectivePolicy)` returns `effectivePolicy[action] ?? DEFAULT_VERDICT[action]`. `DEFAULT_VERDICT` is the per-action frozen map above (ADR-127), exported from `engine/src/policy.js` beside `POLICY_ACTIONS` — not a single blanket constant. An action name **not** in `POLICY_ACTIONS` named anywhere in any scope is a **config error** (R7) — you cannot govern an action craft does not know how to gate.

### D3 — Verdict semantics & conflict resolution (R3)

1. **Cross-scope conflict** (user `ask`, project `always`): resolved by **scope precedence** at merge time — `per-invocation > project > user`. Last (highest) scope to name the action wins, full-replace. This is the *only* conflict in the common case and reuses the ADR-022 direction.
2. **Intra-scope conflict** (one scope lists `integrate` under both `ask` and `never`): a **config error** (R7, decided ADR-129), not a silent pick — a single scope must assign each action at most one verdict. Caught by `validatePolicy` at lint/resolve time → non-zero exit, matching the "fail on a misconfigured declination" stance of `manifest-lint-main.js:44`. (Cross-scope conflicts are **not** errors — they resolve by precedence, step 1.)
3. **Default for unlisted action**: `DEFAULT_VERDICT[action]` — the per-action default keyed by reversibility (ADR-127).
4. **Interaction with the former hardcoded confirmations (R6 — decided: Supersede, ADR-128):** the merge confirmation (`integrate/SKILL.md:17`) and the `pr.creator: user` stop are **not floors** — they are the default `ask` verdict (ADR-127) of the actions `integrate` and `propose`. An explicit `always` verdict **supersedes** them:
   - `always: [integrate]` → craft auto-merges once its propose gate is green; the hardcoded merge confirmation is gone for that run.
   - `always: [propose]` → craft auto-creates the PR (the `pr.creator: user` stop is gone).
   - `ask` (the default) → the human is asked, exactly as today. `never` → the action is refused and recorded.
   - Safe-by-default holds because the **default** for `integrate`/`propose` is `ask` (ADR-127), so an unconfigured repo still stops for merge confirmation; auto-merge is strictly opt-in via an explicit `always`, never silently granted.

The never-commit-on-red gate, validation-triage-gates-propose, and artifact-handoff invariants are the **only** absolute floors. They are **outside** the action vocabulary entirely — not members of `POLICY_ACTIONS`, so they are un-nameable and no verdict (not even `always`) can reach them (R6).

### D4 — Interactive vs headless surfacing (R4, R5)

The verdict is resolved identically in both bindings (pure `resolvePolicy`); only the **surfacing of `ask`** differs — exactly the `{claude, pi}` binding split every port doc already uses.

| Verdict | `claude` binding (interactive orchestrator) | `pi` binding (headless `pi -p`) |
|---|---|---|
| `always` | proceed; append `POLICY(always:<action>)` to run record | identical |
| `ask` | `AskUserQuestion` at the consult seam; on approve → proceed + record; on decline → recorded no-op or blocker per reversibility | **degrade to `never`** → recorded blocker, **unless pre-approved** (R5) |
| `never` | refuse; record `POLICY(never:<action>)`; the phase no-ops or blocks per the action's reversibility | identical |

**Headless pre-approval channel (R5, decided ADR-130).** Pre-approval is expressed as a per-invocation overlay that flips a specific `ask` to `always` for this run only — i.e. it rides the **same `--policy <action>=always` flag** (D1), passed to `craft-pi` by the outer harness/operator. No new mechanism: pre-approval *is* a per-invocation `always` verdict. The headless binding therefore never sees a live `ask` it must answer — it either has a per-invocation `always` (proceed) or it does not (degrade to `never`/blocker). This keeps R5 entirely inside the precedence model already built for R1.

**Headless end-to-end auto-merge is achievable (the Supersede consequence, ADR-128 + ADR-130).** Because `always` now *supersedes* the merge confirmation (no floor survives it), a headless operator who wants unattended end-to-end merge passes `--policy integrate=always` (and, if PR creation should also be unattended, `--policy propose=always`). Under the `pi` binding this resolves to `always` for `integrate`, so once the propose gate is green craft genuinely auto-merges — the harness-as-a-service use case. This is the documented path; there is no "impossible by construction" case. Actions **not** pre-approved keep the default: a resolved `ask` with no per-invocation `always` **degrades to `never`/recorded blocker** (the ADR-095 stop-before-action semantic), so the headless walk still halts safely on anything the operator did not explicitly authorize.

**Greppable record tokens** (memory `prefer-fixed-greppable-tokens`): `POLICY(always:<action>)`, `POLICY(ask:<action>→approved|declined)`, `POLICY(never:<action>)`, `POLICY(degraded:<action>)` for the headless `ask→never` case. Fixed tokens, one per consult, appended to the run record like `NO-OP(<phase>)`.

### D5 — Per-phase consultation (the consult seam, R8)

A new **Policy port**, mirroring the memory/model/vcs port docs, with a single read verb. *(That this is a port at all — rather than inline orchestrator prose — is pre-decided by the established pattern: every adjudication seam in craft that splits interactive vs headless behaviour is a `{claude, pi}`-bound port, `docs/adapters/*.md`. A consult that must surface differently under `claude` vs `pi` is structurally a port; it was not surfaced as a candidate for that reason. The fork that *was* surfaced was **where the effective policy is resolved** (D-P → ADR-125: rides the Resolution), not whether a port exists.)*

```
consult(action, ctx) → { verdict, surface }
  pre:  action ∈ POLICY_ACTIONS; ctx carries the resolved effectivePolicy + binding (claude|pi)
  post: returns the resolved verdict and the surfacing instruction
        (proceed | ask-then-proceed | refuse | degrade-to-blocker);
        never mutates state, never performs the action — it only adjudicates
```

`consult` is **CQS-pure** (a query; it never performs the governed side-effect — the phase does, *after* consulting). It is backed by the pure `resolvePolicy(action, effectivePolicy)` in `engine/src/policy.js`; the binding decides surfacing.

**Where the effective policy is computed (decided: Ride the Resolution, ADR-125).** `mergePolicyScopes` runs in the resolve path (`pipeline-resolve-main.js` right after `applyCliOverlay`, or inside `resolvePipeline`), and the effective policy map is attached to the `Resolution` JSON as a new additive top-level field `policy: { … }` (does not touch `effective[]`/`gateDecisions[]`/`waivers[]`). The orchestrator already parses and holds the `Resolution` for the whole run (`run/SKILL.md:47`); it holds `Resolution.policy` beside `MemoryView` and consults it at each seam. One resolve call, one precedence home (no DRY drift vs ADR-022) — exactly how P22 carries `MemoryView`. (The rejected alternative, a separate `policy-resolve` bin, would add a second JSON surface and a second precedence home.)

**The seam in the orchestrator.** `run/SKILL.md` "Cross-phase invariants" gains a **Policy consult** invariant: *before any phase performs a nameable outward action, the session calls `Policy.consult(action)` and obeys the returned surface.* The outward-action phase skills (`workspace`, `propose`, `integrate`, `documentation`) each name, in their preamble, the action(s) they perform — so the consult is co-located with the action, not buried. Example rewrite of `integrate/SKILL.md` step 2: "consult `integrate`; obey the verdict — `ask` (the default) confirms with the user, `never` refuses and records a blocker, `always` proceeds with no confirmation (superseding the former hardcoded merge stop, ADR-128) — then `gh pr merge …`." The skill drops its hardcoded *'The user confirms the merge — never merge unprompted'* line; that confirmation is now the `integrate` action's default `ask` verdict, surfaced by the consult, not prose.

This is a **documentation + orchestrator-prose** change for the seam plus a **pure engine module** for resolution — no new runtime daemon, consistent with how memory (P22) added a pure module + spec + one orchestrator slot.

### D6 — Engine module & validator (pinned change set)

- **New file `engine/src/policy.js`** — exports `POLICY_ACTIONS` (frozen array), `VERDICTS` (frozen `['always','ask','never']`), `DEFAULT_VERDICT` (frozen per-action map, ADR-127 — `{ isolate:'always', commit:'always', push:'ask', propose:'ask', integrate:'ask', teardown:'ask', 'external-send':'ask', 'backlog-write':'always' }`), `mergePolicyScopes(user, project, perInvocation)`, `resolvePolicy(action, effectivePolicy)`. Pure, immutable, no I/O — same discipline as `cli-overlay.js`/`memory.js`.
- **`engine/src/manifest.js`** — add `'policy'` to `TOP_KEYS` (line 13); add a `validatePolicy(policy, errors)` (mirrors `validateBacklog`, `manifest.js:198`); dispatch it from the `switch` (line 657). Validator checks: object shape, keys ⊆ `VERDICTS`, each value an array of strings, every name ∈ `POLICY_ACTIONS`, no action under two verdicts in one block (ADR-129).
- **`engine/src/pipeline-resolve-main.js`** — parse `--policy <action>=<verdict>` in `parseArgs` (next to `--harness`, same grammar-error discipline, `:84`); after `applyCliOverlay` (`:190`), compute and attach `Resolution.policy` (ADR-125 — additive top-level field, rides the Resolution).
- **`engine/src/index.js`** — add `export { resolvePolicy, mergePolicyScopes } from './policy.js';` (the 7-export surface grows; this is engine src, not the frozen `pipeline/default.yml` surface).
- **User-file load (ADR-124)** — a tiny read of `~/.claude/craft-policy.md` (a Markdown file with a YAML-frontmatter `policy:` block) in `pipeline-resolve-main.js`, parsed via the existing `extractFrontmatter` and validated by the same `validatePolicy` (one validator, two call sites), with the **same traversal-containment** discipline as `memory.js:resolveStorePath` (a path that escapes its root reads nothing).
- **`skills/integrate/SKILL.md`** — drop the hardcoded *'The user confirms the merge — never merge unprompted'* line (step ~17); replace with a consult of the `integrate` action (its default `ask` reproduces today's confirmation; an `always` verdict supersedes it, ADR-128). Same pattern for `skills/propose/SKILL.md`'s `pr.creator: user` stop → consult of `propose`.
- **New `docs/adapters/policy.md`** — the port spec (interface → core policy retained → `{claude,pi}` bindings → Failure→blocker), mirroring `memory.md`; carries the `integrate`=merge / `propose`=pr-create alias note (ADR-126).

### D7 — Failure → blocker (mirrors every port doc)

- **Config errors** (knowable from config alone, no I/O): unknown action name, unknown verdict key, non-list value, intra-scope double-verdict, a user-file/per-invocation `--policy` that escapes its root or names an unknown action. Caught by `validatePolicy` at lint/resolve time → **non-zero exit before any phase runs** (R7), same as `validateBacklog`/`validateMemory`. A *missing* `policy:` block is **not** an error (engine defaults).
- **Runtime "errors" are not errors, they are verdicts.** A `never` refusal is a **recorded no-op or blocker** (per reversibility), never a silent skip (R9). A headless unapproved `ask` is a **recorded blocker** via the `contracts/core.md` blocker protocol `{ unit, reason, ≤3 options }` — the spec relies on that injected invariant and does not restate it (same pattern as `vcs.md:96`).

## Decision log (resolved — was: Decision candidates)

The designer decided none of these; the decisions phase ratified each as an ADR (124-130). This is now a
**decision log**: each row records the chosen option and its ADR. One deviated from the designer's
recommendation — **D-S → ADR-128 (Supersede, not Floor-only)** — and has been folded into the sections
above (Status line, R6, D3 step 4, D4, D5, D6).

| # | Choice | Resolution | ADR |
|---|---|---|---|
| D-F | **User-level policy file location & shape** | **(a) `~/.claude/craft-policy.md` with YAML frontmatter** — as recommended. Reuses `extractFrontmatter` + the `policy` validator verbatim (one validator, two call sites), no new parser; sets the first user-scope precedent cleanly (ADR-121 kept memory per-repo). | **ADR-124** |
| D-P | **Where the effective policy is resolved & carried** | **(a) Ride the `Resolution` — additive `Resolution.policy`** — as recommended. `mergePolicyScopes` runs in the resolve path after `applyCliOverlay`; one resolve call, one precedence home (no DRY drift vs ADR-022); the additive field leaves `effective[]`/`gateDecisions[]`/`waivers[]` untouched. | **ADR-125** |
| D-V | **Action-name vocabulary** | **(a) VCS-port verbs verbatim** (`isolate`/`commit`/`push`/`propose`/`integrate`/`teardown` + `external-send`/`backlog-write`) — as recommended. One verb set shared with the VCS port, no drift; `integrate`=merge and `propose`=pr-create, documented as an alias note in `policy.md`. Per-verb granularity so `integrate` and `teardown` are independently governable. | **ADR-126** |
| D-D | **Default verdict for an unlisted action** | **(c) per-action default keyed by reversibility** — as recommended. Remote/irreversible (`push`/`propose`/`integrate`/`teardown`/`external-send`) default `ask`; local reversible (`isolate`/`commit`/`backlog-write`) default `always`. Encodes the actual risk axis; keeps today's stop-for-merge behaviour unconfigured, and is what keeps Supersede (ADR-128) safe-by-default. | **ADR-127** |
| D-S | **Does `always` supersede the hardcoded merge/propose confirmations, or only layer under them?** | **(b) Supersede** — **DEVIATES** from the recommended Floor-only. `always: [integrate]` fully replaces the hardcoded merge confirmation → genuine config-driven auto-merge; `always: [propose]` supersedes the `pr.creator: user` stop. The merge confirmation is therefore a **policy-governed default (`ask` per ADR-127), not a floor**. Enables the headless harness-as-a-service auto-merge use case (with ADR-130 pre-approval); safe-by-default because unconfigured `integrate` defaults to `ask`. | **ADR-128** |
| D-C | **Intra-scope double-verdict handling** | **(a) Config error, fail at lint** — as recommended. A single scope assigning one action two verdicts is caught by `validatePolicy` → non-zero exit, matching `manifest-lint`'s refuse-a-misconfigured-declination stance. Cross-scope conflicts are **not** errors — they resolve by precedence. | **ADR-129** |
| D-PA | **Headless `ask` pre-approval channel** | **(a) Reuse `--policy <action>=always` per-invocation** — as recommended. Pre-approval *is* a per-invocation `always` that rides the precedence model already built; the `pi` binding never faces a live `ask` (it has a per-invocation `always` → proceed, or it does not → degrade to `never`/blocker). No second parallel surface. | **ADR-130** |

Every row above is **resolved** and points to its ADR (124-130). D-S is the one deviation from the
designer's recommendation; its Supersede consequences (auto-merge becomes config-reachable, the merge
confirmation is a default not a floor, headless end-to-end auto-merge is achievable) are reflected
throughout the Design sections.

## Test strategy

Mirrors the engine's existing `node --test` + AAA/Given-When-Then style (`engine/test/cli-overlay.test.js`, `engine/test/memory.test.js`), with `sut` variable and one behaviour per test.

**Unit — `engine/test/policy.test.js`** (new):
- `resolvePolicy`: listed action → its verdict; unlisted action → its **per-action** `DEFAULT_VERDICT[action]` (ADR-127 — `integrate`/`push`/`teardown`/`propose`/`external-send` default `ask`, `isolate`/`commit`/`backlog-write` default `always`); each of `always`/`ask`/`never` round-trips.
- **Per-action default table is correct (ADR-127):** assert `DEFAULT_VERDICT.integrate === 'ask'` and `DEFAULT_VERDICT.commit === 'always'` — pins the safe-by-default premise that keeps Supersede opt-in (an unconfigured repo gets `integrate: ask`, i.e. today's merge confirmation).
- **The three engine floors are NOT policy-nameable (R6 / ADR-128):** assert `POLICY_ACTIONS` does **not** contain `'never-commit-on-red'`, `'validation-triage-gates-propose'`, or `'artifact-handoff'` — and that naming any of them in a `policy:` block is a config error (cross-checked in the validator suite below). Proves policy cannot reach the absolute floors.
- `mergePolicyScopes` **precedence** (the property-test lens, since this is a merge/precedence pair like `applyCliOverlay`): project verdict overrides user verdict for the same action; per-invocation overrides both; a scope that omits an action leaves the lower scope's verdict intact; **last-scope-wins per action** (not union). Property: for any three scope maps, `resolvePolicy(a, merge(u,p,i))` equals the verdict from the highest scope that names `a`, else `DEFAULT_VERDICT[a]` — quantified over the action set and verdicts.
- **Immutability**: inputs never mutated (mirror `cli-overlay.test.js:86`); result maps are fresh objects.
- **Idempotence**: merging the same scopes twice is deep-equal (mirror `cli-overlay.test.js:160`).

**Validator — extend `engine/test/manifest.test.js` + `engine/test/manifest-lint-main.test.js`** (mirror `validateBacklog`/`validateMemory` tests):
- Valid `policy:` block (e.g. `always: [integrate]`) → ok.
- Unknown action name → error; unknown verdict key → error; non-list value → error; intra-scope double-verdict → error (ADR-129); **naming an engine floor** (`policy: { never: [never-commit-on-red] }`) → error (the floor is not in `POLICY_ACTIONS`, so it is an unknown action, R6); missing `policy:` → ok (defaults).
- `manifest-lint` exits 2 with the diagnostic block on any of the above (mirror `failInvalid`).

**Per-invocation overlay — extend `engine/test/pipeline-resolve.bin.test.js`** (mirror the `--harness` grammar tests):
- `--policy integrate=ask` parses and lands at highest precedence over a project `policy.integrate: always`.
- malformed `--policy integrate` (no `=`) / `--policy integrate=maybe` (bad verdict) → exit 2 with the grammar message.
- `Resolution.policy` present and correct when policy is configured; absent/default when not (ADR-125 — rides the Resolution).

**Supersede semantics — `engine/test/policy.test.js`** (the load-bearing revision, ADR-128):
- **`always: [integrate]` lifts the merge-confirmation default:** Given a merged policy with `integrate: always` under the `claude` binding, `resolvePolicy('integrate', …)` returns `always` and `consult('integrate', …)` returns `proceed` (no ask-then-proceed) — proving an `always` verdict supersedes the former hardcoded merge confirmation (not just "skips craft's own extra ask while honouring a floor").
- **Unconfigured `integrate` still confirms (safe-by-default, ADR-127):** Given an empty policy, `resolvePolicy('integrate', {})` returns `ask` and `consult` (claude) returns `ask-then-proceed` — proving Supersede is opt-in, not the default.
- **`always: [propose]` supersedes the `pr.creator: user` stop** symmetrically → `proceed`.

**Headless degradation & pre-approval — `engine/test/policy.test.js`** (pure, binding-parameterized):
- Given `ask` + `pi` binding + no pre-approval → `consult` returns `degrade-to-blocker`.
- Given `integrate: ask` default + `pi` binding + per-invocation `--policy integrate=always` (pre-approval, ADR-130) → `proceed` — proving headless end-to-end auto-merge is achievable (the harness-as-a-service path), not "impossible by construction".
- Given `ask` + `claude` binding → `ask-then-proceed`. (The `AskUserQuestion` call itself is orchestrator prose, not engine-tested; the *surface decision* is.)

**Per-phase consult fidelity — manual/smoke, not CI-gated** (consistent with `run/SKILL.md`'s on-demand smoke convention): one walk of `integrate` confirms `integrate` (merge) and `teardown` are each consulted separately and the record carries the `POLICY(...)` tokens; a second walk with `--policy integrate=always` confirms the merge proceeds with no confirmation prompt (Supersede in situ). Documented as a smoke entry, like the inline-fidelity and SC5 smokes.

**Edge matrix:** (action listed in two scopes) × (verdict each) × (binding claude|pi) × (pre-approved?) — enumerated in `policy.test.js`; the property test covers the precedence axis, explicit cases cover the binding/pre-approval axes.

## Out of scope

- **Per-action *parameters*** (e.g. "ask only when the PR targets `main`"). Verdicts are unconditional per action; conditional policy is a future extension. — keeps the first cut a flat action→verdict map.
- **Governing non-outward, in-session actions** (which model to spawn, which files to read). Policy governs only the nameable outward/hard-to-reverse vocabulary (D2). — those are already governed by `models`/gate/tool-guard ports.
- **A `custom` policy adapter** (external script adjudicates verdicts). Reserved as a documented future seam in `policy.md`, unbuilt — same posture as memory's `source: custom` (`memory.md:112`). — `file`-scope (manifest + user file + CLI) covers the brief.
- **Touching the never-commit-on-red / triage-gates-propose / artifact-handoff floors** (R6). They are non-overridable invariants, not policy-nameable actions. — safety floors must not be config-removable.
- **Renaming or restructuring the VCS port verbs.** Policy *names* them; it does not change them. — bounded scope.
