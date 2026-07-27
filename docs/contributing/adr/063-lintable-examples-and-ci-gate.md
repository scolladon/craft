# 063 — Examples are lint-clean (shipped sample files + a CI gate)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P12-dx.md · **Supersedes/Refines:** none

## Context

P12 makes the injection catalog (PRD §7) trustworthy: *"every point ships a sample manifest in
`examples/`."* But two pre-P12 examples (`karpathy-as-context`, `everything-claude-toolkit`) **failed**
`manifest-lint` — they referenced `context:` files (`karpathy-pitfalls.md`, `house-rules.md`,
`sec-rules.md`) that were never shipped, so the linter's file-existence check (`manifest.js`
`checkFileRef`) rejected them. A catalog whose samples don't actually resolve undermines the whole DX
claim. Two questions: where do the referenced sample bodies live, and what keeps every example valid
over time?

## Options considered

**Where the referenced files live** (the linter resolves a manifest's relative refs against
`ROOT = dirname(dirname(manifest))` — for `examples/<name>/workflow.md`, ROOT = `examples/`):

1. **Shared `examples/.claude/workflow/`** — ship `karpathy-pitfalls.md`, `house-rules.md`,
   `sec-rules.md`, `mut.md` there. A manifest ref `.claude/workflow/foo.md` resolves to
   `examples/.claude/workflow/foo.md`, so the manifest still *reads* exactly like a real repo's
   `.claude/workflow.md`. Lowest churn — existing `examples/<name>/workflow.md` layout and filenames
   are unchanged; distinct filenames don't collide. *(chosen)*
2. **Mini-repo per example** — move each manifest to `examples/<name>/.claude/workflow.md` with refs
   under `examples/<name>/.claude/workflow/`. Most faithful (each dir is a copyable repo root) but a
   large restructure of every existing example, its README links, and footnotes.
3. **Non-hidden sample dir** — refs like `workflow-files/foo.md`. cons: doesn't mirror the real
   `.claude/workflow/` convention a user replicates.

**What keeps them valid:** a CI test asserting every `examples/*/workflow.md` lints — added as
**bats** (`test/examples-lint.bats`) rather than `node --test`, so the `EXPECTED_TESTS` count gate in
`scripts/ci.sh` is untouched and it runs under the existing `bats test/` line.

## Decision

Referenced sample bodies live under a shared **`examples/.claude/workflow/`** dir; each is realistic
content (a behavioral pack, house rules, a security lens, a mutation procedure), not a stub, so the
example reads as copyable. The new `backlog-custom` example uses `source: custom` whose `ref` is
**not** file-checked (only `source: file` is — `manifest.js` `validateBacklog`), so it lints without
shipping a script. **`test/examples-lint.bats`** asserts every example manifest exits 0 and reports
`valid.`, via the existing `run_lint` helper. All 12 examples now lint clean.

## Consequences

- New dir `examples/.claude/workflow/` with four sample bodies; the two previously-red examples and
  the six new P12 examples all pass `manifest-lint`.
- The user's **global** gitignore excludes every `.claude/` dir, which would silently drop these
  committed samples (green locally, red on a fresh CI clone). A repo-level `.gitignore` re-includes
  exactly `examples/.claude/workflow/` so the samples are tracked and the gate is reproducible.
- New `test/examples-lint.bats`; no change to `EXPECTED_TESTS` (bats, not `node --test`).
- A future example or catalog sample that stops resolving fails CI — the catalog can't silently rot
  ([[062-tier2-catalog-gated-stub]]: never advertise an unproven surface).
- Cross-link: the guide that links these samples [[061-dx-guide-single-entry-doc]].
