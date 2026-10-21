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
  model saw the reason `craft: write outside the working directory is denied in this binding`
  (live probe 2026-10-15, 1.0.92).
- **Command policy** (`--deny-tool` pattern set) — enforces, live-proven, and takes precedence
  even over `--allow-all-tools`. It is prefix matching, so it stays the floor on a copilot older
  than 1.0.92, where the hook cannot deny.
- **`preToolUse` hook** (`hooks/craft-guard.js`) — a `bash` call is judged in order by the
  **plain-command gate**, then the destructive-git predicate (normalised argv: destructive verbs and
  the `--no-ext-diff` rule, any-verb `--ext-diff` and `git config` alias/include keys), through the shared verdict the codex binding also enforces; a
  `create`/`edit` call by the shared `toolCallGuard` containment. A block writes a JSON deny on stdout
  (exit 0); a crash denies by exit 2. A deny also fires for a missing hook file or a missing `node`
  (`hook errored`). Verified on 1.0.92 and 1.0.98.

**The plain-command gate.** When a command mentions git, it must be plain: literal or quoted words;
`;`, `&&`, `||`, `|`, `&` and newline separators; literal output redirects (`> file`, `2>&1`); none
of `$ \` \ ! ( ) { } [ ] * ? < #` outside single quotes; no evaluator or wrapper in command
position (`bash -c`, `eval`, `env`, `xargs`, `nohup`, `source`, …); no `GIT_CONFIG_`; the near-git
rules below. Anything else is denied with `craft: command too complex to verify near git — spell it
plainly`; the remedy is to re-issue the git part plainly. The `"$(cat <<'EOF' … EOF)"` commit
idiom that some harnesses emit is denied. On macOS `/bin/bash` 3.2 it fails to parse when the
body holds an odd quote, an odd backtick or an unbalanced `(`, and an unbalanced `)` in the body
ends the substitution early and runs the rest as shell. Commit the way craft's core contract
teaches: `git commit -m "<message>"` (one double-quoted `-m` per paragraph), or
`git commit -F <file>` when the message holds `` " $ ` \ ! ``. On copilot the file outside the
working tree is written by a `bash` call that does not mention git (`printf '%s\n' '<message>' >
/tmp/msg`): `create` outside the working directory is denied, and so is a write whose message
names git and holds `$` or a backtick.

**Near-git rules.** Beyond plainness, four rules apply to any command that mentions git:

- `-c <key>=…` and `--config-env=<key>=…` keys must be in a safe set: `user.name`, `user.email`,
  `commit.gpgsign`, `tag.gpgsign`, `core.quotepath`, `color.ui`, `init.defaultbranch`,
  `format.pretty`, `diff.noprefix`, any `color.*`, `advice.*` or `log.*`, and `pager.<cmd>=false`.
  Any other key denies: git runs the value of keys such as `core.fsmonitor`, `core.sshCommand`,
  `credential.helper` and `core.pager` (proven with real git).
- Any `GIT_<NAME>=` assignment near git denies, for the same reason.
- Shells anywhere: `sh bash zsh dash ksh fish csh tcsh mksh yash busybox eval` deny at **any** word
  position (an unlisted wrapper such as `caffeinate` or `stdbuf` could otherwise put a shell out of
  command position), while `env exec command nohup time sudo nice timeout xargs source . trap hash
  builtin enable fc coproc alias mapfile readarray compgen` deny in command position (the last
  three run their `-C` callback as shell text).
- A command word that opens with `=` denies: zsh expands `=git` to git's path.

**Verdict deadline.** The verdict is computed in a worker thread under a 5 s deadline; a miss denies
(`craft: guard verdict timed out — denied fail-closed`) instead of letting copilot's ~30 s hook
timeout fail open.

Re-probe on 1.0.98 (live probe 2026-10-16): `git -C . push origin main` denied (ref unmoved);
`git status --short && git tag allowed` executed; `bash -c 'git push origin main'` denied by the
gate; the commit idiom executed (denied since 2026-10-17); a forced deadline
(`CRAFT_GUARD_DEADLINE_MS=1`) denied.

Residuals, stated as measured or designed:

- **A hook timeout fails open.** With no `timeoutSec`, a hook that sleeps 20 s still denied; at 40 s
  and 70 s the tool executed (1.0.98). The default is about 30 s. The 5 s verdict deadline is the
  guarantee that the guard denies before then; a realistic command runs well under a second.
- **No audit trail.** The hook's stderr audit line is not persisted anywhere copilot writes (the
  `--output-format json` stream, `$COPILOT_HOME/logs`).
- **Git reached through channels a static guard cannot follow**, accepted by design:
  `echo push | xargs git`; stdin into a shell (`bash <<< 'git push'`, `sh <<EOF … EOF`); `$((…))`
  bodies; an interpreter given a literal string (`python3 -c 'import os; os.system("git push")'`);
  scripts, `make`, `npm run`, a heredoc written to a file and run later, `watch`, `ssh host '…'`,
  `su -c`, `script -c`, `parallel`, `git rebase --exec`; gitconfig-file aliases; a dynamic
  string passed to an evaluator (`bash -c "$CMD"`, `eval "$X"`); `git${IFS}diff`.
- **A renamed or copied git binary** (`ln -s "$(command -v git)" x; ./x push`, `cp`) is not visible to a
  string guard; `hash -p` is blocked.
- **No cross-call shell state**: a function or variable defined in one `bash` call was not visible
  in the next, even with a reused `shellId`, and no tool other than `bash` takes shell text
  (1.0.92, 1.0.98).
- **Closed, not residuals**: shell aliases via an `alias` builtin with a git word, `GIT_CONFIG_*`
  env channels, `-c include.path`, and brace/glob/`$'\…'`/`$"…"`/dashed `git-<verb>`/wrapper
  dynamic words now block. Work is bounded by a 131072-char cap and a nesting cap: the 80 KB `eval`
  chain that took 49 s then aborted now denies in 0.06 s, and the verdict deadline backs this up.
  Every fail-closed denial carries a reason.
  `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or interactive (pty)
  sessions, and an async shell's stdin is `/dev/null` (live probe 2026-10-21). The hook fires for
  a `write_bash` call; the guard passes it through unjudged. A copilot version whose request
  `tools` list carries `write_bash` again reopens it.
- **Intended false blocks**, each costing one re-issue with a literal command: `git commit -c <rev>` (read as an unsafe `-c` key); `git add scripts/sh`; `bash -c 'git status'`;
  a `$` or backtick in any quoted word, or a backslash or exclamation mark in a double-quoted one
  (`git commit -m 'cost $5'`, `git commit -m "stop!"`); a callback builtin in command position
  (`git log | mapfile -t a`); a commit-message
  write whose message names git and holds `$` or a backtick (`printf %s 'fix(git): costs $5' > /tmp/m`,
  rephrase it); a `#` comment
  (`git log # c`); `<` input redirects (`git diff > o < i`); `echo git push`; a
  dynamic command head; a dynamic word at git's option or subcommand position (`git $OPTS status`);
  a dynamic `reset`/`branch` argument (`git reset $SHA`); pattern words (brace/glob) near a verb
  word; a dynamic word before a verb word; a file named `git-<verb>`; an opaque `$'\…'` passed to
  an evaluator; and control-flow-unreached git (`a && git push` is denied though it may
  short-circuit).

## Usage

Once loaded, invoke the entrypoint command headlessly or interactively:

```
copilot -p "/craft-run <backlog-id | file | description>"
```

`commands/craft-run.md` is the thin entry point that names the input and defers verbatim to
the shared `run` skill (`skills/run/SKILL.md` at the repository root, loaded by reference via
the `--plugin-dir <repo>` flag above) for the single-sourced run procedure. That shared skill
is itself directly invocable via the `skill` tool as `{ skill: "run" }`.
