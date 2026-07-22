# craft — Cursor binding

A native binding of the craft harness for **Cursor Agent** (`cursor-agent`, Anysphere's
headless agent CLI — the VS Code-lineage editor's one-turn-and-exit agent). It is the
runnable analog of the codex/copilot/opencode/pi bindings: a real headless execution
port plus an enforcing pre-execution guard. Every posture below is **measured live**
against `cursor-agent 2026.07.20-8cc9c0b`, not assumed — see
`docs/adapters/cursor-poc-record.md` for the full contract-discovery record.

## What this binds

- **Execution port** — `cursor-agent -p --output-format json --model <id> --workspace <dir> --force`.
  One craft phase = one headless turn; the result envelope carries `usage` (token counts).
- **Enforcing guard** — a `.cursor/hooks.json` `beforeShellExecution` hook
  (`hooks/craft-guard.js`) that reuses the shared `engine/src/guards` git-ext-diff
  predicate and DENIES a non-compliant `git diff/show` via a stdout-JSON
  `{"permission":"deny"}`. Proven live: it blocks the target, allows benign commands, and
  is not overridden by `--force`/`--yolo`.
- **Role agents** — `agents/craft-<role>.md`, bodies byte-identical to the shared craft
  sources; frontmatter is `name` + `description` only (Cursor's `.cursor/agents` schema —
  no per-agent model field, so the tier rides the launch `--model`).
- **Entrypoint** — `skills/craft-run/SKILL.md`, which defers to `skills/run/SKILL.md`.
- **Telemetry** — `engine/src/observability/adapters/cursor/telemetry.js`, pinned to a real
  captured rollout.

## Install

Cursor reads customization from the project `.cursor/` tree. Point that tree at this
adapter (symlinks preferred — they load by reference and preserve out-of-tree refs):

```sh
export CRAFT_ROOT=/absolute/path/to/craft         # the repo root
mkdir -p .cursor/agents .cursor/skills .cursor/rules

# guard manifest (validated — a malformed hooks.json fails OPEN, see below)
cp "$CRAFT_ROOT/adapters/cursor/hooks.json" .cursor/hooks.json
node -e 'JSON.parse(require("fs").readFileSync(".cursor/hooks.json","utf8"))'   # must not throw

# role agents + entrypoint skill, by reference
ln -s "$CRAFT_ROOT/adapters/cursor/agents/"craft-*.md .cursor/agents/
ln -s "$CRAFT_ROOT/adapters/cursor/skills/craft-run" .cursor/skills/craft-run
```

`hooks.json` invokes the guard as `node ${CRAFT_ROOT}/adapters/cursor/hooks/craft-guard.js`.
The `${CRAFT_ROOT}` env-substitution in the hook command **resolves at runtime** (proven
live), so `CRAFT_ROOT` must be exported in the environment `cursor-agent` runs in.

## Auth (isolated runs)

`cursor-agent` stores its token in the **macOS keychain** (`cursor-access-token`), keyed
by `$HOME`-derived keychain path — NOT a copyable config file. To run isolated without
touching real Cursor state: use a throwaway `HOME` and symlink the login keychain in
(`ln -s ~/Library/Keychains $HOME_throwaway/Library/Keychains`); `~/.cursor` (chats,
config, sessions) then stays isolated in the throwaway HOME. `CURSOR_API_KEY` is the
alternate seed.

## Measured posture — read before relying on containment

- **The guard MUST stay `failClosed: true`.** Measured: a crashing/malformed guard with no
  `failClosed` **fails OPEN** (the command runs); with `failClosed: true` it blocks. The
  shipped `hooks.json` sets it — do not remove it.
- **A malformed `hooks.json` fails OPEN.** Measured: invalid-JSON in `.cursor/hooks.json`
  silently drops the guard, and an unguarded `git diff` runs. Validate the manifest at
  install time (the `node -e JSON.parse` step above).
- **`--sandbox` is not a containment guarantee.** Measured: under the non-interactive
  `--force` posture, `--sandbox enabled` did NOT block a shell `touch` outside the
  workspace root (the file was created under both `enabled` and `disabled`). The guard hook
  is the enforcement layer; launch-args does not emit `--sandbox` by default. Per-mode
  blocking beyond this filesystem probe was **not measured** further.
- **No pre-write containment.** Cursor's only pre-execution shell hook is
  `beforeShellExecution`; there is no `beforeWriteFile` hook, so this binding enforces the
  git-ext-diff predicate on shell calls but does NOT claim pre-write path containment
  (`afterFileEdit` fires post-hoc only).
- **`--force` is non-interactivity, not safety.** A `-p` turn otherwise blocks on the
  approval prompt with no TTY; `--force` skips the prompt, and the guard denies regardless.

## Model tiers

`src/model-tier-map.js` maps craft tiers to live-pinned `cursor-agent --list-models` ids:
`opus → claude-opus-4-8-high`, `sonnet → claude-sonnet-5-high`, `haiku → composer-2.5`
(Cursor offers no haiku; effort is baked into the model id).
