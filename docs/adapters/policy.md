# Policy adapter spec

## Port interface

- `consult(action, ctx) → { verdict, surface }` — adjudicate the policy verdict for a
  single nameable action and return the concrete surfacing instruction for the caller.
  - **pre**: `action ∈ POLICY_ACTIONS`; `ctx` carries `effectivePolicy` (the already-merged
    flat action→verdict map from `Resolution.policy`) and `binding` (`claude` | `pi`).
    The effective policy is computed once per run in the resolve path by
    `mergePolicyScopes(user, project, perInvocation)` and held in-session beside the
    `MemoryView`.
  - **post**: returns `{ verdict, surface }` where `verdict` is one of `always` | `ask` |
    `never` and `surface` is the concrete instruction:
    - `proceed` — execute the action without pausing.
    - `ask-then-proceed` — raise `AskUserQuestion`; on approval proceed, on decline record
      a no-op or blocker per the action's reversibility.
    - `refuse` — do not execute the action; record a blocker or no-op per reversibility.
    - `degrade-to-blocker` — headless binding only; the `ask` verdict has no live user,
      so it degrades to a recorded blocker (R5, ADR-130).
  - **CQS-pure**: `consult` never mutates state and never performs the governed action —
    it only adjudicates. The phase performs the action *after* obeying the returned surface.

`consult` is backed by the pure `resolvePolicy(action, effectivePolicy)` function in
`engine/src/policy.js`; the binding decides surfacing. The effective policy is attached to
the `Resolution` as `Resolution.policy` (additive top-level field — ADR-125) and held in
the orchestrator session for the full run, exactly as `MemoryView` is held.

## Core policy retained (NOT port verbs)

The following decisions are owned by the orchestrator/core and are not re-decided by any
adapter:

- **Verdict resolution** (`resolvePolicy`): the pure `resolvePolicy(action, effectivePolicy)`
  function returns `effectivePolicy[action] ?? DEFAULT_VERDICT[action]`. It is owned by
  `engine/src/policy.js` and is not overridable by an adapter.

- **Per-action default verdicts** (`DEFAULT_VERDICT`, ADR-127): the per-action default is
  keyed by reversibility/outwardness — remote/irreversible actions (`push`, `propose`,
  `integrate`, `teardown`, `external-send`) default to `ask`; local reversible actions
  (`isolate`, `commit`, `backlog-write`) default to `always`. This table is the
  engine-level safe-by-default guarantee: an unconfigured repo still stops at merge
  confirmation because `integrate` defaults to `ask`.

- **Canonical action vocabulary** (`POLICY_ACTIONS`, ADR-126): the frozen set of nameable
  outward/hard-to-reverse actions. See D2 table in `docs/DESIGN-P23-configurable-policy-hooks.md`.
  An action name not in this set named in any `policy:` scope is a **config error** (R7).

  > **Alias note (ADR-126).** The canonical token for merging a PR is **`integrate`**
  > (= "merge") and for creating a PR it is **`propose`** (= "pr-create"). Operators write
  > `always: [integrate]` to enable auto-merge and `never: [propose]` to forbid PR creation.

- **Three engine floors are NOT in `POLICY_ACTIONS` (R6, ADR-128)**: the
  `never-commit-on-red` gate, the `validation-triage-gates-propose` invariant, and the
  `artifact-handoff` invariant are absolute, non-overridable engine invariants. They are
  absent from `POLICY_ACTIONS` — un-nameable — so no verdict, including `always`, can
  reach them. Policy governs the outward-action vocabulary only.

- **Scope merge** (`mergePolicyScopes`): the pure `mergePolicyScopes(user, project, perInvocation)`
  function folds three scope maps into one flat action→verdict map at resolve time, with
  **last-scope-wins per action** (`per-invocation > project > user`, ADR-022 direction).
  Cross-scope conflicts resolve by precedence; intra-scope double-verdicts are a config
  error (ADR-129). The merge result is computed once and attached to `Resolution.policy`.

- **Supersede (ADR-128)**: `always: [integrate]` fully supersedes the former hardcoded
  merge confirmation (it was never a floor — it was the default `ask` verdict for
  `integrate`). `always: [propose]` supersedes the `pr.creator: user` stop. Safe-by-default
  is preserved because the unconfigured defaults for both actions are `ask` (ADR-127), so
  auto-merge and auto-PR-create are strictly opt-in.

- **Greppable record tokens**: one token per consult, appended to the run record, fixed
  form for grep and log recall:
  - `POLICY(always:<action>)` — proceed without asking.
  - `POLICY(ask:<action>→approved)` / `POLICY(ask:<action>→declined)` — user was asked.
  - `POLICY(never:<action>)` — action refused and recorded.
  - `POLICY(degraded:<action>)` — headless `ask` degraded to blocker (pi binding only).

## Binding set

The valid bindings are **`{ claude, pi }`**.

## Claude binding

`consult` is called at each consult seam by the session orchestrator. The orchestrator
holds `Resolution.policy` (the merged effective policy, computed once at run start) and the
active binding (`claude` — interactive session with `AskUserQuestion`).

At each seam the orchestrator calls `consult(action, { effectivePolicy: Resolution.policy, binding: 'claude' })`.

| Resolved verdict | Surface returned | Orchestrator behaviour |
|---|---|---|
| `always` | `proceed` | execute the action; append `POLICY(always:<action>)` to run record |
| `ask` | `ask-then-proceed` | raise `AskUserQuestion`; approved → execute + `POLICY(ask:<action>→approved)`; declined → no-op or blocker + `POLICY(ask:<action>→declined)` |
| `never` | `refuse` | do not execute; record `POLICY(never:<action>)`; phase no-ops or blocks per reversibility |

The `ask` default for `integrate` reproduces today's merge confirmation exactly, so an
unconfigured repo sees no behaviour change. An explicit `always: [integrate]` in any scope
supersedes the confirmation and enables config-driven auto-merge (ADR-128).

## Pi binding

`consult` is called identically — same `resolvePolicy`, same effective policy map — but
`binding: 'pi'` changes the surface returned for `ask`:

| Resolved verdict | Surface returned | Pi behaviour |
|---|---|---|
| `always` | `proceed` | identical to claude binding |
| `ask` | `degrade-to-blocker` | no live user; headless walk blocks + `POLICY(degraded:<action>)` **unless pre-approved** (ADR-130) |
| `never` | `refuse` | identical to claude binding |

**Headless pre-approval (ADR-130):** pre-approval is a per-invocation `--policy <action>=always`
flag passed by the outer harness/operator to `craft-pi`. Because per-invocation is the
highest-precedence scope, a pre-approved action resolves to `always` — the pi binding never
sees a live `ask` for it; it either has `always` (proceed) or it does not (degrade-to-blocker).
No new mechanism: pre-approval *is* a per-invocation `always` that rides the precedence model
already built for R1. Example: `--policy integrate=always --policy propose=always` enables
fully unattended headless end-to-end auto-merge.

### Custom adapter (documented future seam)

`source: custom` is reserved as a future escape hatch — a named external adjudicator
consulted for the `consult` verb in the same subprocess-argv pattern as the backlog adapter.
It is **not implemented**; the validator rejects any attempt to wire a custom policy source
with a targeted hint to wait for the built binding or patch the engine. Only the
manifest/user-file/CLI scope model (the default, built-in binding above) is currently valid.

## Failure → blocker

**Runtime "errors" are not errors — they are verdicts.** A `never` refusal and a headless
unapproved `ask` are recorded outcomes, never silent skips (R9):

- A `never` refusal is a **recorded no-op or blocker** (per the action's reversibility):
  remote/irreversible actions (`integrate`, `push`, `teardown`) block; local reversible
  actions (`isolate`, `commit`, `backlog-write`) no-op with a note.
- A headless unapproved `ask` is a **recorded blocker** via the `contracts/core.md` blocker
  protocol — this spec relies on that injected invariant and does not restate it (same
  pattern as `docs/adapters/vcs.md`).

**Config errors** (knowable from the manifest alone, no I/O): an unknown action name, an
unknown verdict key, a non-list value, an intra-scope double-verdict (ADR-129), or a
user-file / `--policy` path that escapes its root or names an unknown action. These are
caught by `validatePolicy` at lint/resolve time → **non-zero exit before any phase runs**
(R7), same pattern as `validateBacklog` / `validateMemory`. A *missing* `policy:` block
is **not** an error — it means engine defaults (every action at its `DEFAULT_VERDICT`).
