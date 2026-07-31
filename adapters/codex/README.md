# @craft/adapter-codex

Native OpenAI Codex CLI plugin binding for the craft workflow. Codex discovers this
binding's guard hook, agents, and `craft-run` entrypoint from `adapters/codex/` via
the `craft-codex` marketplace entry.

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

`marketplace.json` declares two entries: `craft-codex` — this binding's own
`hooks.json`, the nine `agents/craft-*.md` files, and the delegating `craft-run`
entrypoint skill, all local to the plugin and copied into Codex's plugin cache on
install — and `craft`, whose `skills` field points at the repository-root `skills/`
tree.

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

The `craft-codex` entry's own local surface (hook, agents, `craft-run`) DOES install
via the marketplace. To bypass the marketplace entirely, add the `[hooks]` entry from
`config.template.toml` (below) to `$CODEX_HOME/config.toml` by hand alongside the
symlinks above.

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

1. After `codex login` (whether `hooks/list` requires an authenticated `CODEX_HOME` is
   unpinned, so this order sidesteps the question), **trust the craft guard hook**:

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
   untrusted or modified — a refusal (for example, a missing guard script) exits `2`.
   It is not wired into every launch; an operator must invoke it, or wire it into their
   own pipeline, to catch a silent no-op before it happens.

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
