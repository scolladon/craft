# @craft/adapter-copilot

Native GitHub Copilot CLI plugin binding for the craft workflow. Copilot discovers this
binding's agents from this directory and the shared craft skills from the repository root —
both loaded by reference; nothing is copied into this adapter.

## Load

```
copilot --plugin-dir <repo> --plugin-dir <repo>/adapters/copilot
```

Two plugin dirs, both required. `--plugin-dir <repo>` points Copilot at the repository root,
so it resolves the shared craft skills at `<repo>/skills/<name>/SKILL.md` **by reference** —
the 19 shared skills (`run`, `review`, `validation`, `init`, and the rest) load straight from
their single source; drift becomes structurally impossible rather than merely test-enforced.
`--plugin-dir <repo>/adapters/copilot` loads this binding's own `agents/`, `hooks/`, and
`commands/`. `--plugin-dir` is repeatable and purely local — no install step, no registry
lookup.

## Distribute

Once this repository is published, install both plugin dirs by reference instead of by path:

```
copilot plugin install owner/repo
copilot plugin install owner/repo:adapters/copilot
```

## Configure

Merge `config.template.json` into `$COPILOT_HOME/config.json` (default `~/.copilot/config.json`
— **user level**, not repo level: a repo-level `.github/hooks/*.json` hook did not fire in a
live probe and must not be relied on). The template's `$comment` explains the one manual
substitution it requires: Copilot has no plugin-root environment variable of its own, so the
`hooks.preToolUse` command ships with a literal `<CRAFT_ROOT>` placeholder that you replace
with this repository's absolute path before merging.

```
cat adapters/copilot/config.template.json
```

Leave `disableAllHooks` unset (or `false`) — setting it `true` silently drops the observer
hook below.

## Guard — honest enforcement profile

craft's git-guard binds to Copilot as three layers, only two of which actually enforce:

- **Containment** (`--add-dir <worktree>`, never `--allow-all-paths`) — enforces, live-proven.
- **Command policy** (`--deny-tool` pattern set) — enforces, live-proven, and takes precedence
  even over `--allow-all-tools`.
- **`preToolUse` hook** (`hooks/craft-observer.js`) — fires on every tool call but **cannot
  deny**; it is audit-only, recording verdicts for the run record. Treat it as observability,
  never as a blocking control.

## Usage

Once loaded, invoke the entrypoint command headlessly or interactively:

```
copilot -p "/craft-run <backlog-id | file | description>"
```

`commands/craft-run.md` is the thin entry point that names the input and defers verbatim to
the shared `run` skill (`skills/run/SKILL.md` at the repository root, loaded by reference via
the `--plugin-dir <repo>` flag above) for the single-sourced run procedure. That shared skill
is itself directly invocable via the `skill` tool as `{ skill: "run" }`.
