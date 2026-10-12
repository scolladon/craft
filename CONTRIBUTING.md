# Contributing to craft

## Before you start

Any way of working is welcome. A pull request is accepted when `bash scripts/ci.sh` is green
and its commits follow Conventional Commits. For a feature, [open an issue](https://github.com/scolladon/craft/issues/new/choose)
first so the shape is agreed before the code is written.

The maintainer builds craft with craft runs. That is one way of working, never a requirement.

## Set up

Put Node 22, `jq` and `shellcheck` on your PATH, then install the engine dependencies:

```bash
npm --prefix engine ci
```

## The local gate

```bash
bash scripts/ci.sh
```

This is what CI runs, in about 10 seconds. When you change `README.md`, also run
`bash scripts/readme-drift.sh`.

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
