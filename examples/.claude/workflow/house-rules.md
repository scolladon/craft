# House rules (sample global `context:` pack)

> Sample content for the [`everything-claude-toolkit`](../../everything-claude-toolkit/) example —
> a toolkit's "rules" artifact slotted into craft as a **global** `context:` file. In a real repo
> this lives at `.claude/workflow/house-rules.md` and is injected into every phase's agent.

- **Conventional commits**, one line, imperative mood; no body unless a reviewer needs the why.
- **Immutable by default** — return new objects; never mutate a caller's argument.
- **Small functions, early returns**; extract rather than nest past two levels.
- **Name things for intent**, not type; comments explain *why*, never *what*.
- **No dead code, no `TODO` without an owner**, no commented-out blocks left behind.
- **Public surfaces are typed**; untrusted input is validated at the boundary.
