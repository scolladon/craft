# 055 — Backlog source model: `file` | `custom` only; trackers are custom recipes

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** refines the PRD §9 / SP6 enumerated-source sketch

## Context

PRD §9 and SP6 sketched five sources: `file | github-issues | jira | linear | custom`, each a
first-class engine adapter. But each non-file source needs a *tool* the engine cannot ship or
guarantee: `gh` (CLI), the Atlassian MCP (jira), a Linear MCP (absent here). Shipping and
maintaining N per-tracker adapters makes the framework responsible for every tracker's uptime
and wire format — the opposite of "we are just the framework."

## Options considered

1. **Enumerated sources** `{file, github-issues, jira, custom}` — first-class adapters per
   tracker. pros: turnkey for the common trackers / cons: the framework owns N external
   contracts it cannot test in CI; `linear` already can't ship (no MCP). *(designer's
   recommendation — DC-2 option a)*
2. **Two-source model** `{file, custom}` — `file` is the only built-in adapter; `custom` is a
   single user-provided, runtime-resolvable escape hatch wrapping anything (gh, jira, Linear,
   bespoke). pros: the framework owns exactly one external contract (its own `file` markdown)
   plus a generic invocation contract; trackers become *documented custom recipes*, not engine
   code / cons: a GitHub/Jira shop must write (or copy) a small `custom` resolver script.
3. **No abstraction** — keep `file` hardwired. cons: fails G7 entirely.

## Decision

⚑ **User reframed beyond the offered options:** the source set is exactly **`{ file, custom }`**.

- **`file`** — the built-in markdown adapter; today's behaviour byte-for-byte.
- **`custom`** — a user-provided mechanism named by `ref` (a script/command **resolvable at
  runtime** in the user's context), invoked generically: `<ref> resolve <id>` →
  `{ title, brief }` on stdout, `<ref> complete <id> <refs…>`. It wraps gh, jira, Linear, or
  anything the customer runs.

`github-issues` / `jira` / `linear` are NOT valid `source` values; the validator rejects them
with a targeted hint (`backlog source '<x>' is not built-in — use source: custom with a ref to
a resolver script`). The framework guarantees the **seam**, not the tracker's availability: a
`custom` source that fails at runtime raises a blocker the user fixes and resumes (see
[[058-backlog-failure-class-split]], [[059-custom-complete-guard]]). The SP6 gh/jira pins
survive as **custom-recipe examples** in the adapter spec ([[056-backlog-adapter-spec-doc]]),
not as built-in sources.

## Consequences

- `BACKLOG_SOURCES` in `engine/src/manifest.js` = `Object.freeze(new Set(['file', 'custom']))`.
- The validator carries the `github-issues`/`jira`/`linear` → "use custom" hint (mirrors the
  `mutation-triager` rename-hint pattern).
- `custom.ref` is validated as a non-empty string but NOT path-checked at validation — it is
  resolvable at runtime (a missing/non-exec script becomes a runtime blocker, not a config
  error). `file.ref` is path-checked via `checkFileRef`.
- The adapter spec doc documents gh and jira as ready-to-copy `custom` recipes.
- A real per-tracker built-in adapter (or a derived-plugin-shipped adapter) is out of scope —
  rides with P14 registration if ever wanted.
