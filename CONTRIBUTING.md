# Contributing to craft

## Before you start

Any way of working is welcome. A pull request is accepted when `bash scripts/ci.sh` is green
and its commits follow Conventional Commits. For a feature, [open an issue](https://github.com/scolladon/craft/issues/new/choose)
first so the shape is agreed before the code is written.

The maintainer builds craft with craft runs. That is one way of working, never a requirement.

## Set up

Put Node 22, `jq` and `shellcheck` on your PATH. `zsh` is optional: CI and the devcontainer install it,
and the codex trust-matcher fuzz runs one leg per shell. Without `zsh`, that leg is reported as skipped, never failed.
Then install the engine dependencies:

```bash
npm --prefix engine ci
```

Or open the repository in its devcontainer ([`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)), locally or as a Codespace: it runs the shared
dev-tool install and `npm --prefix engine ci` for you.

## The local gate

```bash
bash scripts/ci.sh
```

This is CI's main job, in about 10 seconds. CI also runs two more gating jobs:

- `bash scripts/readme-drift.sh` recomputes the README's numeric claims, including the
  counts of design docs, plans and ADRs. Run it when you change `README.md` or add or
  remove a file under `docs/contributing/design/`, `docs/contributing/plan/` or
  `docs/contributing/adr/`.
- An offline link check over every Markdown file: a broken relative link or `#fragment`
  fails CI.

## Dev loop

`claude --plugin-dir <path-to-craft>` loads the working copy.

## Commits and PRs

Use Conventional Commits, one line, no body. Keep phase, decision-record and backlog ids out
of source and test code; `test/source-hygiene.test.js` enforces it.

## Where things live

- [Contributor docs](docs/contributing/README.md): layout, design records, plans.
- Behavioural evals run locally on demand and never in CI. See the
  [maintainer smokes](docs/contributing/maintainer-smokes.md).

## Releases

See [releasing](docs/contributing/releasing.md).
