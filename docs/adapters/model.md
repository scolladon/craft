# Model adapter spec

## Port interface

- `select(model) → handle` — bind the run to a model tier/id; the adapter maps the tier to its
  own worker-model primitive and returns an opaque handle the runtime passes back to the worker.
  - **pre**: `model` is already resolved by core policy (the orchestrator owns resolution order;
    the adapter only receives the resolved tier string).
  - **post**: the worker runs on that model. If the adapter cannot reach the model (model down /
    provider key absent) it raises a model-down signal, which core handles via fallback
    re-resolution and respawn from the artifact — NOT via the blocker protocol.

- `isAvailable(model) → bool` — adapter probe; lets core skip a known-down tier during
  fallback re-resolution without attempting a spawn that will immediately fail.

## Core policy retained (NOT port verbs)

The following decisions are owned by the orchestrator/core and are not re-decided by any
adapter:

- **Resolution order**: `manifest models.<role>` → the descriptor's `model:` field (the
  canonical per-role tier; the agent-def frontmatter pin is the Claude binding of that same
  tier) → `models.fallback` → engine default `sonnet` → session model. This is the single
  source of truth; keep it identical to the "Model resolution & fallback" block in
  `skills/run/SKILL.md`.
- **Degraded-tier memory**: once a tier is known degraded this run, later spawns skip straight
  to the fallback — never pay the same dead spawn twice.
- **Supported class**: Haiku-4.5-and-up. The port exposes only bind + probe; the supported-class
  floor is a core invariant, not a per-adapter decision.
- **model-down is not a task blocker**: it triggers core fallback re-resolution + respawn from
  artifact. Only a tier that resolves to no provider/key with no fallback available is a
  runtime blocker.

## Binding set

The valid bindings are **`{ claude, pi }`**.

## Claude binding

`select`: pass the resolved tier as the `model` param on the Task spawn. The tier-to-SKU
mapping is the agent-def frontmatter `model:` pin in `agents/<role>.md` — each pin names a
Claude SKU for that tier. The descriptor's `model:` field carries the tier string
(`opus|sonnet|haiku`); the frontmatter pin is the Claude binding of that same tier.

`isAvailable`: attempt a minimal probe against the Claude API for the given tier; a
model-availability error marks the tier degraded and returns `false`.

## Pi binding

`select`: pass `model:` / `scopedModels:` on `createAgentSession` (or `--model <id>` on `pi
-p`). The adapter maps the craft tier (`opus|sonnet|haiku`) to a Pi provider+model pair via
`getModel(provider, id)` / `modelRegistry.find`. The tier→provider mapping is the adapter's
concern; the resolution order is core policy.

`isAvailable`: call `modelRegistry.getAvailable()` and check whether the mapped
provider+model pair is present. Returns `false` if the tier maps to no available
provider or if no key is configured for the provider.

## Failure → blocker

**model-down is NOT a task blocker.** A spawn that fails on a model-availability error triggers
core fallback re-resolution + respawn-from-artifact. The adapter raises the model-down signal;
core handles the rest.

**A tier that resolves to no provider/key** — after exhausting the full resolution order and
all fallbacks — is a runtime blocker. Escalate via the blocker protocol that `contracts/core.md`
injects into every spawn (`{ unit, reason, ≤3 options }`). This spec relies on that injected
invariant and does not restate it.

Failures split by where they are detectable:

**Config errors** (knowable from the manifest alone, no I/O): an unknown tier string in
`models.<role>` or `models.fallback`; a Pi adapter with no `modelRegistry` configured.
Caught at startup; surface as a non-zero exit before any phase begins.

**Runtime errors** (knowable only at spawn time): the model is down, overloaded, or returns an
availability error. These are not blockers — they trigger the degraded-tier path above. Only
when no tier in the entire resolution order is reachable does the run escalate a blocker.
