---
# Named configs live at .claude/craft-<name>.md and are selected with --config <name>.
# This example shows a minimal customization you can generate via craft:init and then
# invoke with: /craft:run --config ci <brief>
gates:
  phase: "npm test"
pipeline:
  skip: [documentation]
---

# Example — named config (`craft:init` → `craft:run --config <name>`)

A **named config** is a second (or third, or fourth) customization alongside your
`.claude/workflow.md`. It lives at `.claude/craft-<name>.md` and is selected per-run with
`--config <name>`:

```
/craft:run --config ci "implement the login feature"
```

The name is validated by `craft:init` before anything is written — only kebab-case names
(`[a-z0-9]+(-[a-z0-9]+)*`) are accepted. The resolved path (`.claude/craft-<name>.md`) is
captured once and reused throughout the init flow: the emitted manifest is linted in a temp
sibling, then landed atomically only on a clean lint.

## This example

| Key | Value | Purpose |
|---|---|---|
| `gates.phase` | `npm test` | Phase-boundary gate command |
| `pipeline.skip` | `[documentation]` | Drop the documentation phase for this profile |

In your repo, replace these with your project-specific values. The full catalog of injection
points is in [docs/GUIDE-customizing.md](../../docs/GUIDE-customizing.md).

## Generating a named config

```bash
/craft:init ci
```

craft:init interviews you, emits a manifest, lints it in a temp path, and moves it into place
only on a clean lint — leaving any existing `.claude/craft-ci.md` untouched if lint fails.

## Consuming a named config

```bash
/craft:run --config ci "implement the login feature"
```

The engine reads `.claude/craft-ci.md` instead of `.claude/workflow.md` for this run. All
other craft guarantees (gate discipline, invariant core) apply unchanged.

> In your real repo the file lives at `.claude/craft-<name>.md`.
