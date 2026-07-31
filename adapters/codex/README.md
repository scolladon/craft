# @craft/adapter-codex

Native OpenAI Codex CLI plugin binding for the craft workflow. Everything this binding
supplies lives under `adapters/codex/`: the guard hook, the nine role agents, and the
`craft-run` entrypoint skill. How each one reaches Codex differs, and only one of the
three arrives through the marketplace entry — read *Load* before assuming otherwise.

## Load

Register the local file-backed marketplace (its manifest lives at
`.claude-plugin/marketplace.json` — the only location `codex plugin marketplace add`
recognises; pass the marketplace ROOT directory, not the manifest file), then install
both entries with the `<plugin>@<marketplace>` selector:

```
codex plugin marketplace add ./adapters/codex
codex plugin add craft-codex@craft-codex-marketplace
codex plugin add craft@craft-codex-marketplace
```

The leading `./` is required: a bare `adapters/codex` matches codex's `owner/repo`
shorthand and resolves against a remote host instead of the local directory. An
absolute path also works but is not shown here, because it differs per checkout.

`marketplace.json` declares two entries. `craft-codex` is this binding's own plugin
directory, and it holds exactly one thing: the delegating `craft-run` entrypoint skill
under `plugins/craft-codex/skills/`. Its manifest also declares
`hooks: "../../hooks.json"` — a path pointing OUT of the plugin directory. `craft` is
the second entry, whose `skills` field points at the repository-root `skills/` tree.

`codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and rewrites its
manifest, and the cached `.codex-plugin/plugin.json` observed on 0.145.0 is just
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

**The 19 shared skills do NOT load by reference on Codex 0.145.0 (pinned live).**
`codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and, in doing
so, drops the `craft` entry's out-of-tree `../../../../skills` reference — the cached
plugin manifest carries no `skills` field, so `run`/`review`/`validation`/`init`/… are
absent. Measured through the app-server's own skills-listing method: **0 of 19** load
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

The registered `command` must stay exactly two whitespace-separated tokens — interpreter
then guard script. `bin/trust-hook.js` refuses anything else, so a quoted operand, an
added flag or a shell wrapper leaves the hook untrusted and therefore silent. A
hand-wired entry gets no `CLAUDE_PLUGIN_ROOT`, so export `CRAFT_ROOT=<repo checkout>` or
substitute that absolute path into the command unquoted.

## Configure

Merge `config.template.toml` into `$CODEX_HOME/config.toml` (default
`~/.codex/config.toml` — **user level**, not repo level). The template sets an
explicit sandbox mode (`workspace-write`, never `danger-full-access` — selecting a
mode is a posture, not a measured containment claim: per-sandbox-mode blocking was
never measured against this binding) and per-agent model/effort entries drawn only
from this binding's own tier map (`src/model-tier-map.js`).

## Install-time hook trust — read this before running headlessly

**A PreToolUse hook that has never been trusted silently no-ops.** This was pinned
live: the identical run without trusting the hook first produced no denial, no
warning, and no error — the guarded command simply executed. A user who installs this
binding without trusting `hooks/craft-guard.js` first gets a binding that *looks*
installed and enforces *nothing*, with no signal that anything is wrong.

So, before any headless or automated run:

1. After `codex login` — that order is a requirement, not a precaution. `hooks/list`
   **needs an authenticated `CODEX_HOME`** (pinned live: with no `auth.json`, and again
   with a stale refresh token, `codex app-server` answers `initialize` and then exits
   without ever answering `hooks/list`). So `trust-hook.js` cannot run before login, and
   cannot run in a CI job unless that job seeds a valid, authenticated `CODEX_HOME`.
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
| PreToolUse hook (`hooks/craft-guard.js`) | Exits code 2 with the reason on stderr | **Enforcing** — live-proven: the command never runs, and the denial is fed back to the model as `function_call_output` |
| Execpolicy `.rules` (`craft.rules`) | Starlark `prefix_rule` matching over argv | **Partial** — defence-in-depth only |
| Sandbox (`-s workspace-write`) | Codex's own sandbox mode | **Unmeasured** — a posture, not a containment guarantee |

Read unsoftened, because a carve-out silently assumed away later is worse than one
written down now:

- `git -C . push`, `git --git-dir=.git push`, and `bash -lc 'git push'` all **bypass**
  the execpolicy `.rules` layer — it matches a token-prefix over argv, not an
  adversarial parse, and an interposed global option defeats it.
- A malformed `craft.rules` file **may fail open** at runtime — the observed runtime
  error reads like unrecognised rules are simply not applied, not that the whole
  binary refuses to run.
- Per-sandbox-mode blocking was **not measured** against this binding. Selecting
  `-s workspace-write` is a posture, not a claim that any particular write is
  contained by the sandbox itself — the PreToolUse hook is the layer this binding
  actually relies on for that.
- Hook enforcement is bought at the cost documented above: it depends on the one-time
  install-time trust step — now scriptable via `bin/trust-hook.js`, not automatic — and
  the bypass flag that substitutes for it is environment-wide, not scoped to this hook,
  and emits a visible warning every run.

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
repository root (loaded by reference via the `craft` plugin entry above) for the
single-sourced run procedure, and adds the one Codex-native paragraph this binding
must supply itself — an explicit ask for `multi_agent_v1` subagent delegation, since
Codex silently runs sequentially unless a skill instruction, `AGENTS.md`, or the user
explicitly asks for it. The usable concurrent fan-out width is 3 (the pinned slot cap
is 4, "including you"); phases that would otherwise fan out wider batch to 3.
