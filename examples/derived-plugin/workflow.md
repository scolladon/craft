---
# Injection point #12 (PRD §7): `extends:` — register a derived plugin's phases, agents,
# and profiles as first-class citizens of the craft pipeline. Content lives in the derived
# plugin; wiring lives here in the repo manifest.
extends:
  phases:
    - id: security-scan
      procedure: acme-sec:scan         # namespaced dispatch target — the plugin ships this skill
      role: acme-sec:scanner           # must appear in agents: below
      archetype: harness               # required; closed set: setup, specification, construction,
                                       #   harness, refinement, delivery
      contract: [harness-exec]         # optional; drawn from the closed bundle vocab
      consumes: [change]
      produces: [scan-report]
      after: implementation            # insert anchor — phase runs after implementation
      gate: "acme-sec --check"         # gate command executed before the phase is complete
  agents:
    - acme-sec:scanner                 # registered role — the roleExists "installed" check
    - acme-sec:triage-reviewer         # a second role the plugin may dispatch
  profiles:
    secure:                            # whole-flow mode: stricter verification, agent everywhere
      setup: agent
      specification: agent
      construction: agent
      harness: agent                   # harness floor is always forced to agent regardless
      refinement: agent
      delivery: agent
---

# Example — derived-plugin extension surface (`extends:`)

A **derived plugin** (`dependencies: ["craft"]`) ships namespaced skills and agents. This manifest
wires them into the craft pipeline using the `extends:` registration block — the Tier-2 injection
point.

The key principle: **content lives in the derived plugin; wiring lives in the repo manifest.** A
plugin cannot read another plugin's files (SP2 file-access constraint), so the engine never reads
the derived plugin's descriptor files. Instead, the descriptor data — `procedure`, `role`,
`archetype`, `contract`, `consumes`, `produces`, `after`, `gate` — is carried by this manifest,
which craft already reads.

## The four sub-blocks

| Sub-block | Purpose |
|---|---|
| `extends.phases` | Registered SE steps. Each entry is a full phase descriptor (data manifest-carried, not read from the plugin). |
| `extends.agents` | Registered roles for the `roleExists` check. An external `role:` not in this set fails closed at resolution. |
| `extends.profiles` | Registered whole-flow modes. Full + typed — all six archetype keys required; values must be `inline` or `agent`. |
| `extends.backlog-adapters` | Registered backlog ports (`{ name, ref }`). Selectable as `backlog.source: <name>`; the `ref` script must exist at lint time. Not demonstrated here — see [`backlog-custom/`](../backlog-custom/) for the underlying custom-adapter pattern. |

## Insert vs. replace

A registered phase with a **new** `id` is **inserted** into the pipeline at the `after:` anchor —
the same path as `pipeline.insert`. A registered phase whose `id` matches a **default** phase id
**replaces** that default wholesale (full descriptor swap, no field inheritance). To *tweak* a
default without replacing it, use the Tier-1 `phases.<id>.role` / `phases.<id>.procedure` surface.

The `security-scan` phase above has a new id, so it inserts after `implementation`. If you used
`id: review` instead, it would replace the `review` descriptor entirely.

## The invariant core still binds

The `contract: [harness-exec]` declaration draws from the closed bundle vocabulary. The engine
prepends the core bundle unconditionally — before whatever bundles the registered phase declares.
A derived plugin can re-home a default slot and supply a new worker, but it cannot lower the floor:
there is no `extends` key that reaches the invariant core (GUIDE §2).

## A required `archetype`

Every registered phase must declare an `archetype` from the closed set: `setup`, `specification`,
`construction`, `harness`, `refinement`, `delivery`. The archetype drives model resolution and
gate-cadence rules — omitting it is a lint error.

## Fail-closed role resolution

An external `role:` (`acme-sec:scanner`) is valid only when it appears in `extends.agents` or as
the `role:` of a registered phase. A ref not in that registered set fails closed at `pipeline-resolve`
(`ok: false`), before the walk dispatches — the same guard that protects craft-native role typos.

## Installing the plugin

```bash
# Install the derived plugin so its skills/agents are available:
claude plugin install <path-or-registry-name>
# Then run as usual:
/craft:run "<backlog-id or description>"
```

The manifest wires the plugin; the plugin supplies the worker. craft orchestrates and gates it.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
