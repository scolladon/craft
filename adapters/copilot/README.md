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

Merge `config.template.json` into `$COPILOT_HOME/settings.json` (default
`~/.copilot/settings.json` — **user level**, not repo level: a repo-level `.github/hooks/*.json`
hook did not fire in a live probe and must not be relied on). Not `config.json`: on copilot
1.0.98 a hook declared in `$COPILOT_HOME/config.json` is neither loaded nor migrated (`git push`
executed 3/3 with the guard declared there), whereas 1.0.92 migrated it into `settings.json`
itself (live probe 2026-10-15). The template's `$comment` explains the one manual substitution it
requires: Copilot has no plugin-root environment variable of its own, so the `hooks.preToolUse`
command ships with a literal `<CRAFT_ROOT>` placeholder that you replace with this repository's
absolute path before merging. An existing install re-merges the template: the hook file is now
`hooks/craft-guard.js` (it was `craft-observer.js`).

```
cat adapters/copilot/config.template.json
```

Leave `disableAllHooks` unset (or `false`) — setting it `true` silently drops the guard hook
below.

## Guard — honest enforcement profile

craft's git-guard binds to Copilot as three layers, all of which enforce on copilot >= 1.0.92:

- **Containment** (`--add-dir <worktree>`, never `--allow-all-paths`) — enforces, live-proven.
  With `--allow-all-paths` the hook alone still denied an out-of-tree `create` (file absent); the
  model saw the generic `denied (fail-closed)` reason, because the containment branch carries no
  reason (live probe 2026-10-15, 1.0.92).
- **Command policy** (`--deny-tool` pattern set) — enforces, live-proven, and takes precedence
  even over `--allow-all-tools`. It is prefix matching, so it stays the floor on a copilot older
  than 1.0.92, where the hook cannot deny.
- **`preToolUse` hook** (`hooks/craft-guard.js`) — judges normalised git argv for destructive
  verbs and the `--no-ext-diff` rule, and writes a JSON deny on stdout (exit 0); a crash denies
  by exit 2. A deny also fires for a missing hook file or a missing `node` (`hook errored`).
  Verified on 1.0.92 and 1.0.98.

Residuals, stated as measured or designed:

- **A hook timeout fails open.** With no `timeoutSec`, a hook that sleeps 20 s still denied; at 40 s
  and 70 s the tool executed (1.0.98). The default is about 30 s; the guard itself runs well under
  a second.
- **No audit trail.** The hook's stderr audit line is not persisted anywhere copilot writes (the
  `--output-format json` stream, `$COPILOT_HOME/logs`).
- **Git run from a file or tool the command names indirectly** (scripts, `make`, `npm run`,
  `ssh host '…'`, `git rebase --exec`, gitconfig aliases) and a dynamic string passed to an
  evaluator (`bash -c "$CMD"`, `eval "$X"`) are not seen.
- **No cross-call shell state**: a function or variable defined in one `bash` call was not visible
  in the next, even with a reused `shellId`, and no tool other than `bash` takes shell text
  (1.0.92, 1.0.98).
- **Intended false blocks**, each costing one re-issue with literal words: `echo git push`, a
  dynamic command head followed by a verb word, a dynamic word at git's option or subcommand
  position (`git $OPTS status`), and a dynamic `reset`/`branch` argument (`git reset $SHA`).

## Usage

Once loaded, invoke the entrypoint command headlessly or interactively:

```
copilot -p "/craft-run <backlog-id | file | description>"
```

`commands/craft-run.md` is the thin entry point that names the input and defers verbatim to
the shared `run` skill (`skills/run/SKILL.md` at the repository root, loaded by reference via
the `--plugin-dir <repo>` flag above) for the single-sourced run procedure. That shared skill
is itself directly invocable via the `skill` tool as `{ skill: "run" }`.
