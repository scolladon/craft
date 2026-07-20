# 251 — Copilot loads shared craft skills by reference, not by copy

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Refines ADR-242 (skills clause only; its agents clause stands)

## Context

ADR-242 settled the Copilot native surface as a plugin directory carrying `skills/` and `agents/`, with **bodies copied byte-identically** from the shared craft sources and only frontmatter re-expressed. Implementation surfaced a collision that copying makes unavoidable: the shared bodies legitimately contain content the adapter hygiene rules forbid. `skills/run/SKILL.md` carries ten provenance references (`ADR-118/121`, `P10`, …) plus one **bare** `${CLAUDE_PLUGIN_ROOT}` in prose (line 80, as a negative example — "NEVER `${CLAUDE_PLUGIN_ROOT}`"), and `skills/review/SKILL.md` and `skills/validation/SKILL.md` carry one reference each. Copying therefore forced the suite to **exempt** copied bodies from two hygiene checks — a carve-out that weakens the rules for exactly the files most likely to drift.

Two facts then settled the question empirically, pinned against the live `copilot` 1.0.63 binary under a non-destructive BYOK fake provider:

1. `copilot --plugin-dir <repo-root>` emits `session.skills_loaded` listing **all 19** shared craft skills, each `source: "plugin"`, resolved at `<repo-root>/skills/<name>/SKILL.md`. Copilot loads the repository's own top-level `skills/` directory **by reference**; no copy is required.
2. Those skills report **`userInvocable: true`** — previously unverified (only `false` had been observed, on a builtin), and recorded as a deferred row.

This also aligns Copilot with the pi precedent, which single-sources by reference (`adapters/pi/settings.template.json` declares `"skills": ["skills"]`; `pi.skills` is `[]`) and consequently never hits the collision.

## Options considered

1. **Load shared skills by reference; ship no adapter-local skill copies** *(chosen)* — pros: drift becomes structurally impossible rather than test-enforced; both hygiene exemptions disappear; matches the pi precedent; the binding gains all 19 skills rather than a copied subset. Cons: the launch contract needs two `--plugin-dir` values.
2. **Keep copies plus the byte-identity test and the two exemptions** *(what ADR-242 implied)* — cons: permanently exempts the most drift-prone files from the hygiene rules; only covers the copied subset.
3. **Strip the offending content from the shared `skills/*.md` sources** — cons: edits the Claude reference binding (an explicit non-goal) and deletes legitimate provenance from engine documentation, where the no-provenance rule was never meant to apply.

## Decision

**Ratified by the user.** Option 1. The Copilot binding ships **no `adapters/copilot/skills/` directory**. Shared craft skills load by reference from the repository root, and the binding's launch contract is two repeatable plugin dirs:

```
copilot --plugin-dir <repo> --plugin-dir <repo>/adapters/copilot
```

The first supplies the shared skills; the second supplies this binding's own agents, hooks, and command entrypoint. `adapters/copilot/README.md` is the single source of truth for that invocation.

**ADR-242's agents clause stands unchanged**: agents remain adapter-local `agents/craft-*.md` with bodies byte-identical to the shared craft agent bodies and only frontmatter re-expressed, asserted by test. Only its skills clause is superseded.

Because no shared-source content lives in the adapter any more, the provenance-ref and bare-`${CLAUDE_PLUGIN_ROOT}` checks now apply **uniformly across every adapter surface, with no carve-out**. A test asserts `adapters/copilot/skills/` does not exist, so a future re-copy fails loudly.

## Consequences

- Deferred row **D6** (can a skill be user-invocable?) is **resolved CONFIRMED** — plugin skills report `userInvocable: true`. The `run` skill is directly invocable; `commands/craft-run.md` is the adapter-local command deferring to it.
- The binding exposes the full 19-skill craft surface, not a copied subset, and gains new skills automatically.
- Both hygiene exemptions are deleted; the rules are uniform.
- The entrypoint is the shared skill's own frontmatter name (`run`), not `craft-run`.
- `docs/plan/native-copilot-binding.md` and ADR-242 retain the historical copy-based framing; this ADR is the current state and the documentation phase reconciles the port docs and PoC record against it.
