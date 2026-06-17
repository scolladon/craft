# 035 — Repo directory not renamed; out-of-repo references handled explicitly

- **Status:** accepted
- **Date:** 2026-06-17
- **Phase:** P8.5 · **Relates:** [032](032-rename-forge-to-craft.md)

## Context

The rename ([032](032-rename-forge-to-craft.md)) raises two scope-boundary questions: (a) does
the on-disk dev directory `/Users/scolladon/workspace/perso/forge` get renamed to `.../craft`,
and (b) what about references to the plugin that live OUTSIDE the repo — the user's global
`~/.claude/CLAUDE.md` "default feature workflow" trigger (`/forge:run`) and the project-memory
slugs (`forge-customizable-engine-initiative`, `forge-slice-agent-selection-rule`)?

## Options considered

- **Dir:** rename the working tree now vs. leave it. The dir is decoupled from the plugin name
  (`CLAUDE_PLUGIN_ROOT` resolves from the install location at runtime); renaming churns the git
  path and the session's additional-working-dir config for no functional gain.
- **Out-of-repo:** update vs. leave the global trigger and the memory slugs/bodies.

## Decision

- **Repo directory: renamed** `/Users/scolladon/workspace/perso/forge` →
  `.../craft`. *(Initially scoped out; the user reversed the call mid-session and asked the
  session to perform it.)* The `mv` runs as the **final session action — after** the
  squash-merge to `main` and branch cleanup — so all repo edits happen on the stable old path
  and only the finished tree is relocated (no mid-task working-dir churn).
- **Runtime refs handled in lockstep with the `mv`:** `~/.claude/plugins/known_marketplaces.json`
  — the `scolladon` marketplace's `path`/`installLocation` (the only ref the dir move breaks) is
  re-pointed to the new path. The installed-plugin entry (`installed_plugins.json`
  `forge@scolladon`, cache `cache/scolladon/forge/0.1.1`) is stale from the NAME change, not the
  dir move; its correct fix is a CLI reinstall (`craft@scolladon`) + session restart, flagged to
  the user rather than hand-edited (editing the registry without rebuilding the cache leaves a
  dangling copy). No symlinks reference the repo (verified).
- **`~/.claude/CLAUDE.md`: updated** — the one `/forge:run` trigger → `/craft:run` (confirmed
  with the user before editing under `~/.claude`).
- **Project-memory slugs: kept** (`forge-customizable-engine-initiative` etc.) — renaming a slug
  breaks the `[[wikilinks]]` that reference it. The slug is a stable identity, not a live
  product name. The memory **bodies** are updated to state the live plugin is now `craft`.

## Consequences

The dev dir becomes `.../craft`, matching the product. Because the `mv` is the last action, the
marketplace path edit and the rename are atomic from the user's perspective; a session restart
(needed anyway to load the `craft` namespace) picks up the new location. The global trigger
keeps resolving the default workflow. The memory graph's link integrity is preserved while its
content reflects the rename.
