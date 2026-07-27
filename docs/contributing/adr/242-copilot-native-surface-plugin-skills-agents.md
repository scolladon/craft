# 242 — Copilot native surface: plugin `skills/` + `agents/`, `craft-run` entrypoint

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Applies R-G2 single-sourcing

## Context

The R-G2 rule requires phase procedures to be single-sourced from the shared craft skill bodies and never re-authored; opencode holds this by re-expressing only per-binding frontmatter while the body stays verbatim. A live probe pinned Copilot's extensibility surface as the **plugin**, which carries "skills, agents, hooks, MCP servers, and LSP servers". Copilot skills are `SKILL.md` with YAML frontmatter `name` + `description` — **shape-identical to craft's Claude skills**. A `session.skills_loaded` event enumerates every loaded skill with `{ name, description, source, userInvocable, enabled, path }`, giving an assertable runtime seam. Copilot has no `/craft:*` command namespace.

## Options considered

1. **Plugin directory carrying `skills/` + `agents/`; entrypoint = a `craft-run` skill** *(designer recommendation)* — pros: the first-class discoverable and single-sourceable mechanism; `SKILL.md` shape-identity enables true verbatim body reuse (R-G2); `session.skills_loaded` gives a real assertion seam. Cons: `userInvocable: true` is unverified (D6), so the entrypoint may be invoked as `copilot -p "/craft-run …"` instead.
2. **`.github/copilot-instructions.md` / `AGENTS.md` prose** — cons: one blob, not per-phase discoverable; auto-read in a way `--no-custom-instructions` can silently disable.
3. **MCP server exposing phases as tools** — cons: re-authors procedures as tool schemas, breaking single-sourcing outright.

## Decision

*Adopted as recommended (no user judgment).* Option 1. The Copilot native surface is a plugin directory carrying `skills/craft-*/SKILL.md` and `agents/craft-*.md`. Skill and agent **bodies are byte-identical to their shared craft sources**; only frontmatter is re-expressed per binding. The `/craft:run` analog is a `craft-run` skill, invoked via the `skill` tool or headlessly as `copilot -p "/craft-run <input>"`. A test asserts body-identity against the shared sources rather than merely asserting file shape.

## Consequences

- R-G2 holds across all four bindings; a phase-procedure edit propagates without re-authoring.
- The native-surface test asserts byte-identity of bodies, so drift fails CI.
- D6 (whether frontmatter can set `userInvocable: true`) is an ergonomics question only — both invocation paths work headlessly — and is settled by the on-demand smoke.
