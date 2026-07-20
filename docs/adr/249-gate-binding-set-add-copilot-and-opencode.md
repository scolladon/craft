# 249 — `gate.md` binding set: add both `copilot` and `opencode`

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** none

## Context

The brief carried a success criterion that every port doc's `Binding set` should read `{ claude, pi, opencode, copilot }`. Verification showed the sets are **not uniform today** and the criterion is not achievable as stated:

| Port doc | Set before this change |
|---|---|
| `execution.md`, `model.md`, `telemetry.md` | `{ claude, pi, opencode }` |
| `gate.md`, `memory.md`, `policy.md`, `vcs.md` | `{ claude, pi }` |
| `backlog.md`, `intention.md` | *no `Binding set` line at all* |

Copilot plainly binds execution, model, and telemetry. `gate.md` was the open question, because it reads `{ claude, pi }` **even though `adapters/opencode/plugins/git-guard.ts` exists** — so the listing convention was already stricter than "ships a guard", but that stricter rule was never written down. Copilot's guard (ADR-243) is real but partly advisory: containment and destructive-git enforce natively, while the ext-diff rule is audit-only.

## Options considered

1. **Add neither; document `gate.md` as tracking fully-enforcing guards only** *(designer recommendation)* — pros: names the existing implicit convention; avoids flattening a real strength distinction. Cons: leaves `gate.md` silent about two bindings that do ship guards.
2. **Add both `copilot` and `opencode`, treating "ships a guard binding" as the criterion** — pros: fixes the pre-existing opencode omission; makes the set match the other bound ports; the per-binding sections carry the strength detail. Cons: the set alone no longer conveys enforcement strength.
3. **Add `copilot` with an advisory footnote** — cons: leaves the opencode omission unaddressed and inconsistent.

## Decision

**Ratified by the user — this deviates from the designer's recommendation.** Option 2. `gate.md`'s `Binding set` becomes **`{ claude, pi, opencode, copilot }`**. The listing criterion is now explicit: **a binding is listed when it ships a guard binding**, regardless of enforcement strength. Because the set no longer conveys strength, each **per-binding section in `gate.md` must state its own enforcement profile** — and this change therefore also owns authoring the previously-absent **opencode** binding section (`plugins/git-guard.ts`), not only the Copilot one.

The corrected, honest scope for `Binding set` edits across this change is:

| Port doc | After this change |
|---|---|
| `execution.md`, `model.md`, `telemetry.md`, `gate.md` | `{ claude, pi, opencode, copilot }` |
| `memory.md`, `vcs.md`, `policy.md` | `{ claude, pi }` — unchanged; Copilot binds none of them |
| `backlog.md`, `intention.md` | no `Binding set` line — out of scope |

## Consequences

- A pre-existing documentation inconsistency (opencode shipping a guard but absent from `gate.md`) is corrected as a side effect of this change.
- Scope grows by one doc surface not in the original brief: `gate.md`'s opencode binding section.
- `gate.md` must state per binding which rules enforce and which are advisory; Copilot's ext-diff carve-out (ADR-243) lands there.
- The brief's uniform-binding-set criterion is formally superseded by the table above.
