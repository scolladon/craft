# Releasing craft

Marketplace users receive a new copy of the plugin only when the `version` field of
`.claude-plugin/plugin.json` changes. A merge to main without a bump ships nothing, so a
release is a deliberate, small procedure.

1. Pick the bump from the `[Unreleased]` groups: Removed or a breaking change means major,
   Added means minor, only Fixed means patch; any other non-breaking group (Changed,
   Deprecated, Security) means minor. Check
   `git log --format='%s%n%b' vLAST..main | grep -E '!:|BREAKING'`.
2. One PR: rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, open a fresh empty
   `[Unreleased]`, update the compare links, set `.claude-plugin/plugin.json` `"version"`,
   and update the README's `vX.Y.Z` status literal. Commit `chore(release): X.Y.Z`. Gate
   green, merge.
3. Maintainer only, after merge: `git tag -a vX.Y.Z <merge-sha> -m "craft vX.Y.Z"`;
   `git push origin vX.Y.Z`; `gh release create vX.Y.Z --title "craft vX.Y.Z" --notes "<the [X.Y.Z] section>"`.
4. Never set `"version"` in `.claude-plugin/marketplace.json`: `plugin.json` wins silently.

## Curating the changelog

Omit `chore(metrics)` bookkeeping, test-only changes and internal refactors or CI plumbing.
Write one line per user-visible effect, never a PR number, and group eval-calibration fixes
into one line.

## Tags

`v1.0.0` is a lightweight tag, left as published. New tags are annotated.

## Enforcement

`test/release-discipline.test.js` enforces that the changelog, `.claude-plugin/plugin.json`
and the README stay coherent.
