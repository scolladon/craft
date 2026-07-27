# 176 — github-issues as a tested adapter via extends.backlog-adapters

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md

## Context

A first-class per-tracker backlog source was parked. The P14 derived-plugin surface
(`extends.backlog-adapters`) exists for exactly this; the repo-`custom` escape hatch (P11)
already covers the tracker case as a recipe. P27 forbids any VCS-host CLI name in the scanned
plugin-defining sources.

## Options considered

- (4a) Native source in the engine's source registry + a built-in runner.
- (4b) A shipped, tested adapter via `extends.backlog-adapters` (named source, runner CLI
  confined to `examples/`).
- (4c) Plain custom-recipe script under `examples/`.

## Decision

(4b). The adapter is a first-class named backlog source delivered through the surface P14 built
for it — zero engine schema change. The host CLI lives only in the unscanned `examples/` tree,
so no source-hygiene allowlist entry is added and the P27 de-specialization is not regressed.

Source-hygiene constraint made explicit: the literal host-CLI / host name appears **only**
under `examples/`. Scanned docs (`docs/GUIDE-customizing.md`, `docs/adapters/`) reference the
adapter generically ("a tracker adapter, see `examples/`") without the banned token.

## Consequences

- New `examples/backlog-github-issues/` (adapter manifest fragment + runner script + README);
  `examples/README.md` index entry; a generic pointer in the GUIDE.
- The example's structure is pinned by the examples-lint test; the live round-trip stays the
  closed "won't-do" gated opt-in (credentials CI lacks).
