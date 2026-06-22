# 124 — The user-level policy file is `~/.claude/craft-policy.md` with YAML frontmatter

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** refines 121 (loosens per-repo-only to admit a user scope, for policy only)

## Context

P23 introduces the **first user-scope (cross-repo) config** in craft. Everything today is per-repo
(`.claude/workflow.md`); ADR-121 deliberately kept memory per-repo with no user/global layer. The
brief requires policy settable at **both** user and project scope, so a user-scope file is genuinely
new ground, and its location and shape set the precedent.

## Options considered

1. **`~/.claude/craft-policy.md` with YAML frontmatter** *(designer recommendation; chosen — user judgment)* — pros: reuses `extractFrontmatter` + the same `policy` validator as the project manifest verbatim (one validator, two call sites), no new parser. Cons: introduces a user-scope file where none existed.
2. **`~/.claude/craft/policy.yml` plain YAML** — pros: conventional location. Cons: needs a separate loader distinct from the frontmatter path.
3. **Defer the user scope** (project + per-invocation only) — pros: stays consistent with ADR-121. Cons: narrows the P23 brief, which asked for user+project precedence.

## Decision

The user-level policy file is **`~/.claude/craft-policy.md`** — a Markdown file carrying the same
YAML-frontmatter `policy:` block as the project manifest. It is parsed with the existing
`extractFrontmatter` and validated by the same `validatePolicy` validator (one validator, two call
sites). Path resolution applies the same traversal-containment discipline as
`memory.js:resolveStorePath` (a path escaping its root reads nothing).

## Consequences

- Establishes craft's first user-scope config surface; loosens ADR-121's per-repo-only stance, **scoped to policy only** (memory stays per-repo).
- One validator covers both scopes; no second parser.
- A future user-scope feature has a clean precedent to follow.
