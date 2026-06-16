# forge

A feature-delivery workflow engine for Claude Code, packaged as a plugin. One abstract
phase sequence — **workspace → design → decisions → planning → implementation → review →
refactoring → validation → documentation → propose → integrate** — that any repo adopts
as-is and customizes through a committed declination manifest. Zero session-memory
dependence: every load-bearing rule lives in a hook, a script, or versioned instruction text.

## Install

```bash
claude plugin marketplace add <this-repo-path-or-url>
claude plugin install forge@scolladon
```

Dev loop: `claude --plugin-dir /path/to/forge`.

## Use

```
/forge:run <backlog-id | path/to/spec.md | "feature description">
```

Phase skills also run standalone: `/forge:review` (multi-dimension review battery on
the current branch), `/forge:validation` (scoped mutation run + triage), etc.

## Customize — `.claude/workflow.md` in your repo

No manifest = sensible defaults via capability probing (lockfile detection, test-script
discovery, mutation-config probe, remote probe). The manifest declares only what
probing can't infer. Schema, declination verbs (`context:` / `override:` / `skip:`),
protected phases, and gate placeholder vocabulary: see
[docs/DESIGN.md](docs/DESIGN.md). `scripts/manifest-lint.sh` validates the manifest
and refuses to run on unknown keys — misconfiguration fails loudly.

## Layout

- `skills/run` — orchestrator (cross-phase invariants, run record)
- `skills/<phase>` — one per phase: non-overridable Preamble + overridable Procedure
- `agents/` — role contracts with pinned models (designer, planner, reviewer,
  slice-implementer, refactor-executor, validation-triager, docs-writer, backlog-ticker).
  A pinned model that goes down falls back (manifest `models.fallback` → session model)
  and the degraded tier is remembered for the rest of the run.
- `hooks/` — PreToolUse guards: `git diff/show` without `--no-ext-diff` is denied with
  the corrected command; `--no-verify` is denied flat
- `scripts/` — worktree setup/teardown (mutation run-lock aware), manifest lint, plan lint
- `templates/` — design / plan (defines the slice schema plan-lint enforces) / ADR

## Design provenance

[docs/DESIGN.md](docs/DESIGN.md) — the full design (phase table, injection surfaces,
enforcement hierarchy, migration plan). [docs/SPIKE.md](docs/SPIKE.md) — the empirical
spike that pinned hook inheritance, `updatedInput` composition (same-snapshot,
last-writer-wins → hence deny-based hooks), model override precedence, and the skill
invocation surface.
