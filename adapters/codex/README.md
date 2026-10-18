# @craft/adapter-codex

Native OpenAI Codex CLI plugin binding for the craft workflow. Everything this binding
supplies lives under `adapters/codex/`: the guard hook, the nine role agents, and the
`craft-run` entrypoint skill. How each one reaches Codex differs, and only one of the
three arrives through the marketplace entry — read *Load* before assuming otherwise.

## Load

Register the local file-backed marketplace (its manifest lives at
`.claude-plugin/marketplace.json` — the only location `codex plugin marketplace add`
recognises; pass the marketplace ROOT directory, not the manifest file), then install
its one entry with the `<plugin>@<marketplace>` selector:

```
codex plugin marketplace add ./adapters/codex
codex plugin add craft-codex@craft-codex-marketplace
```

The leading `./` is required: a bare `adapters/codex` matches codex's `owner/repo`
shorthand and resolves against a remote host instead of the local directory. An
absolute path also works but is not shown here, because it differs per checkout.

`marketplace.json` declares one entry, `craft-codex`: this binding's own plugin
directory, and it holds exactly one thing: the delegating `craft-run` entrypoint skill
under `plugins/craft-codex/skills/`. Its manifest also declares
`hooks: "../../hooks.json"` — a path pointing OUT of the plugin directory. No entry
carries the shared skills: an entry whose `skills` field points at the repository-root
`skills/` tree installs and loads nothing (below).

`codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and rewrites its
manifest, and the cached `.codex-plugin/plugin.json` observed on 0.145.0 and again on 0.162.1 is just
`{description, name}` — **both** `hooks` and `skills` are gone. So of the three surfaces
named above, exactly one arrives this way:

- **`craft-run` — yes.** Not via the dropped `skills` field: its files sit inside the
  plugin directory, so they are copied along with it, and it appears as
  `craft-codex:craft-run` in the app-server's own skills listing.
- **The guard hook — no.** `hooks` is absent from the cached manifest, so a marketplace
  install registers no hook whatsoever. It must be wired by hand (below); the trust key
  observed live on 0.145.0 shows where the working hook actually comes from —
  `<CODEX_HOME>/config.toml:pre_tool_use:0:0`.
- **The nine agents — no.** The pinned plugin-manifest shape carries no `agents` field at
  all, and `agents/craft-*.md` sits outside the plugin directory. How Codex picks the
  agent files up was never probed; what is pinned is only that a marketplace install does
  not carry them.

**The 19 shared skills do NOT load by reference on Codex 0.162.1 (pinned live;
first pinned on 0.145.0).**
`codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and, in doing
so, drops an out-of-tree `skills` reference such as `../../../../skills` — the cached
plugin manifest carries no `skills` field, so `run`/`review`/`validation`/`init`/… are
absent. Measured, with such an entry installed, through the app-server's own skills-listing method: **0 of 19** load
without the symlinks below, **19 of 19** load with them. Load them with the symlink
route — this IS the working path for the shared skills, required on every install, not
a contingency to fall back on:

```
ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>   # once per shared skill
```

**Wiring the guard hook by hand is required, not a way around the marketplace.** Copy the
`[[hooks.PreToolUse]]` and `[[hooks.PreToolUse.hooks]]` blocks from
`config.template.toml` (below) into `$CODEX_HOME/config.toml`, alongside the symlinks
above. Skip it and the binding has no PreToolUse hook registered at all — a state that, at
runtime, looks exactly like the untrusted-hook no-op described below: installed, silent,
enforcing nothing.

The registered `command` is the interpreter, then the guard script as one double-quoted
operand: `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`.
The quotes keep a checkout path containing a space one word under every shell codex may
run the hook through. `bin/trust-hook.js` refuses anything else: inside the quotes only
path characters, plain spaces and that exact `${CRAFT_ROOT:-…}` placeholder are allowed, and
the path starts at `/` or at that placeholder followed by `/`; the interpreter is `node` or an absolute path to it. An added flag, a relative path, a chained
command, a shell wrapper, an environment assignment or any other `$` expansion leaves the
hook untrusted and therefore silent. A hand-wired entry gets no `CLAUDE_PLUGIN_ROOT`, so
export `CRAFT_ROOT=<repo checkout>` or substitute that absolute path into the command,
inside the double quotes.

An install wired before the operand was quoted keeps its trusted, unquoted entry until you
re-copy the template block; under a bash or sh login shell that entry loses the guard
whenever the checkout path contains a space. After re-copying, codex reports the hook
`modified`, and one `node adapters/codex/bin/trust-hook.js` run trusts it again.

## Configure

Merge `config.template.toml` into `$CODEX_HOME/config.toml` (default
`~/.codex/config.toml` — **user level**, not repo level). The template sets an
explicit sandbox mode (`workspace-write`, never `danger-full-access` — selecting a
mode is a posture, not a measured containment claim: per-sandbox-mode blocking was
never measured against this binding) and per-agent model/effort entries drawn only
from this binding's own tier map (`src/model-tier-map.js`).

The template also switches interactive tty sessions off: a `[features]` table holding
`unified_exec_tty = false`. `buildLaunchArgs` passes `-c features.unified_exec_tty=false` on
every launch too, which wins over a `config.toml` that drops the key or sets it to `true`.
Codex fires no PreToolUse hook for `write_stdin`, and only a tty session keeps stdin open for
it to type into. The cost: the model gets no interactive shell, REPL or prompt-answering
session. If your `config.toml` already has a `[features]` table, add the key to that table: a
second `[features]` header is a duplicate table, which is invalid TOML.

Deploy the execpolicy rules file: copy `craft.rules` into `$CODEX_HOME/rules/` (default
`~/.codex/rules/`, created if absent), the directory codex loads `*.rules` files from.
From the repository root:

```
mkdir -p "${CODEX_HOME:-$HOME/.codex}/rules"
rm -f "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
cp adapters/codex/craft.rules "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
cmp adapters/codex/craft.rules "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
test ! -L "${CODEX_HOME:-$HOME/.codex}/rules/craft.rules"
```

The last two lines are the verification: `cmp` printing nothing and exiting `0` means
the deployed copy is byte-identical to the committed file, and `test ! -L` exiting `0`
means it is a regular file, not a symlink. Not every bad copy raises a codex error —
an empty or comments-only file parses cleanly and forbids nothing — so do not skip
them. **Copy, do not symlink**: on codex 0.162.1 a symlinked file in
`$CODEX_HOME/rules/` is not loaded, yet it passes `cmp` and `codex execpolicy check`,
both of which follow the link. The `rm -f` removes a link left by an earlier deploy
(not the file it points at): `cp` onto a symlink writes through it and leaves the
link in place. Re-run the whole block whenever `adapters/codex/craft.rules` changes;
a stale copy still parses and may forbid less.

## Install-time hook trust — read this before running headlessly

**A PreToolUse hook that has never been trusted silently no-ops.** This was pinned
live, and re-confirmed on 0.162.1: the identical run without trusting the hook first produced no denial, no
warning, and no error — the guarded command simply executed. A user who installs this
binding without trusting `hooks/craft-guard.js` first gets a binding that *looks*
installed and enforces *nothing*, with no signal that anything is wrong.

So, before any headless or automated run:

1. After `codex login` — keep this order as the safe instruction. On codex-cli 0.145.0
   `hooks/list` **needed an authenticated `CODEX_HOME`** (pinned live: with no `auth.json`,
   and again with a stale refresh token, `codex app-server` answered `initialize` and then
   exited without ever answering `hooks/list`), so `trust-hook.js` could not run before
   login or in a CI job without a seeded, authenticated `CODEX_HOME`. On 0.161.0
   `hooks/list` answered from a `CODEX_HOME` with no `auth.json`; do not rely on that
   across versions.
   Then **trust the craft guard hook**:

   ```
   node adapters/codex/bin/trust-hook.js
   ```

   This resolves the guard hook through codex's own `hooks/list` and upserts
   `trusted_hash` into `config.toml` — no interactive prompt. The interactive route —
   load the plugin and trust the hook when Codex prompts for it — still works as an
   alternative. Either way, trust persists across runs via `hooks.state` /
   `trusted_hash`: a one-time step per installation, not a per-run step.
2. After that one-time trust step, headless runs need **no** bypass flag.
   `buildLaunchArgs` (`src/launch-args.js`) defaults `bypassHookTrust` to **false**
   deliberately, precisely so automation is never one accidental flag away from
   silently disarming the guard.
3. `--dangerously-bypass-hook-trust` **is not scoped to craft's own hook** — passing it
   disables the trust gate for **every** hook configured in the invoking environment,
   not just this one. Treat it as opt-in and discouraged, never as the default launch
   posture; it also emits a visible warning item on every run it is used.
4. **Launch-time trust verification is available on demand, not automatic.**
   `node adapters/codex/bin/trust-hook.js --check` is a read-only check: it never
   writes, exits `0` when the hook is already trusted, and exits `1` when it is
   untrusted or modified — a refusal (for example, a missing guard script, or a hook
   config codex could not load) exits `2`. It refuses on exactly the states the write
   path refuses, so a pipeline reading only the exit code can never take a `0` from a
   listing the write path considers unsafe. It is not wired into every launch; an
   operator must invoke it, or wire it into their own pipeline, to catch a silent
   no-op before it happens.

## Guard — honest enforcement profile

craft's git-guard binds to Codex as three layers, of markedly different strength:

| Layer | Mechanism | Strength |
|---|---|---|
| PreToolUse hook (`hooks/craft-guard.js`) | For a Bash call, three stages in order: the **plain-command gate**, then, over one parse, the destructive-git predicate (push, `reset --hard`, forced branch delete, `clean` without `--dry-run`, config and alias injection), then the `--no-ext-diff` rule; for `apply_patch`, per-path containment. Exits code 2 with the reason on stderr. Any crash inside the guard (a module that fails to load, a throw, a rejected promise) also exits 2. codex 0.161.0 runs the call on every other exit status, so a failure before the guard runs fails open (see below) | **Enforcing** — live-proven: the command never runs, and the denial is fed back to the model as `function_call_output` |
| Execpolicy `.rules` (`craft.rules`) | Starlark `prefix_rule` matching over argv | **Partial** — defence-in-depth only |
| Sandbox (`-s workspace-write`) | Codex's own sandbox mode | **Unmeasured** — a posture, not a containment guarantee |

Read unsoftened, because a carve-out silently assumed away later is worse than one
written down now:

- `git -C . push`, `git --git-dir=.git push`, and `bash -lc 'git push'` all **bypass**
  the execpolicy `.rules` layer — it matches a token-prefix over argv, not an
  adversarial parse, and an interposed global option defeats it. The PreToolUse hook
  denies all three: the first two with the destructive-git reason, `bash -lc` with the
  gate's.
- The gate has a cost. A command that mentions git must be plain (no `$`, backslash,
  wrapper or evaluator near git), or it is denied with
  `craft: command too complex to verify near git — spell it plainly`. Re-issue the git
  part plainly: commit with `git commit -m "<message>"`, or `git commit -F <file>` when
  the message holds `` " $ ` \ ! `` . Two blocks are intended false positives:
  `echo $HOME; git status` and `git commit -m "fix: \"q\""`. A command word that opens with
  `=` (zsh expands `=git` to git's path) is denied the same way.
- The model picks the tool shell per call (`exec_command`'s `shell` argument, the
  bash 3.2 at /bin/bash included), and the hook payload does not carry it, so the gate
  denies the constructs whose meaning depends on the shell.
- `write_stdin` is closed on 0.162.1 by the template's `unified_exec_tty = false` and the
  launch flag `-c features.unified_exec_tty=false`. Codex refuses `tty: true` with
  `TTY execution is disabled by config`, and a non-tty session's stdin is closed, so
  `write_stdin` fails with `stdin is closed for this session`. `write_stdin` stays in the
  tool list. Dropping the key, or running codex outside the binding's launch path without
  it, reopens the `write_stdin` channel.
- Still open: git reached through channels no string guard follows (scripts, `make`,
  `npm run`, an interpreter given a literal string, gitconfig-file aliases, a renamed or
  copied git binary). A hook that runs past its `timeout` also fails open. craft sets no
  `timeout`, codex's default exceeded 90 s when measured on 0.162.1, and the slowest
  measured verdict took about 190 ms, so no verdict deadline is added. An operator who sets a low
  `timeout` reopens that path.
- A malformed `craft.rules` file **may fail open** at runtime, so treat it as fail open.
  On codex 0.162.1 the outcome depends on how codex is driven: `codex exec`, this
  binding's launch path, refuses to start, so the run stops loudly; the app-server
  thread/turn path logs a warning, skips the rules, and runs the command anyway. The
  interactive TUI was not probed.
- Per-sandbox-mode blocking was **not measured** against this binding. Selecting
  `-s workspace-write` is a posture, not a claim that any particular write is
  contained by the sandbox itself — the PreToolUse hook is the layer this binding
  actually relies on for that.
- Hook enforcement is bought at the cost documented above: it depends on the one-time
  install-time trust step — now scriptable via `bin/trust-hook.js`, not automatic — and
  the bypass flag that substitutes for it is environment-wide, not scoped to this hook,
  and emits a visible warning every run.
- The PreToolUse hook **fails open** when node cannot run the guard file at all: `node`
  missing from `PATH` (the shell exits 127), the guard file missing or unparseable, the
  process killed by a signal, or a `--require`/`--import` preload in an inherited
  `NODE_OPTIONS` that throws. codex 0.161.0 runs the tool call on every exit status except
  2, and no code inside the guard runs early enough to catch these.

`--ephemeral` is **never** passed by `buildLaunchArgs`. It suppresses Codex's own
session-file persistence, and `$CODEX_HOME/sessions/` is exactly what this binding's
telemetry reads — passing it for hygiene would silently turn every telemetry report
into a zero that reads as success.

## Usage

Once installed, invoke the entrypoint headlessly:

```
codex exec "/craft-run <backlog-id | file | description>"
```

`plugins/craft-codex/skills/craft-run/SKILL.md` is the thin, adapter-authored entry
point: it names the input, defers verbatim to the shared `skills/run/SKILL.md` at the
repository root (loaded through the `$CODEX_HOME/skills` symlinks above, since codex
does not load them by reference) for the
single-sourced run procedure, and adds the one Codex-native paragraph this binding
must supply itself — an explicit ask for `multi_agent_v1` subagent delegation, since
Codex silently runs sequentially unless a skill instruction, `AGENTS.md`, or the user
explicitly asks for it. The usable concurrent fan-out width is 3 (the pinned slot cap
is 4, "including you"); phases that would otherwise fan out wider batch to 3.
