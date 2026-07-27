# craft — Aider binding

A native binding of the craft harness for **Aider** (`aider-chat`, Paul Gauthier's
git-native AI pair-programmer CLI). Unlike the codex/copilot/opencode/pi/cursor bindings,
Aider is not a tool-calling agent — it is a focused **edit loop**: it adds files to a chat,
proposes and applies edits, and **auto-commits to git**. Every posture below is measured
live against `aider 0.86.2`, not assumed — see `docs/contributing/specs/aider-poc-record.md` for the
full contract-discovery record.

## What this binds

- **Execution port** — `aider --message <msg> --yes-always --model <id> --read <role-file>`,
  spawned with `cwd` at the git root. One craft phase = one headless turn.
- **VCS posture (first-class)** — `src/vcs-posture.js` keeps `--auto-commits` (the
  handoff), sets `--no-dirty-commits` for a deterministic one-commit-per-turn artifact, and
  disables attribution so commits stay one-line-conventional.
- **Role agents** — `agents/craft-<role>.md`, bodies byte-identical to the shared craft
  sources. Aider has no agent-definition schema and parses no frontmatter, so these files
  are **body-only** — no `---` fence — and are injected per phase as read-only context via
  `--read`.
- **Telemetry** — `engine/src/observability/adapters/aider/telemetry.js`, pinned to a real
  captured `.aider.chat.history.md` transcript.
- **No enforcing guard** — declined honestly; see below.

## Install

```sh
export CRAFT_ROOT=/absolute/path/to/craft         # the repo root

# stable posture + model tiers, at the git root Aider searches
cp "$CRAFT_ROOT/adapters/aider/config.template.yml" .aider.conf.yml

# role agents, by reference: each craft phase --reads the body it needs
ln -s "$CRAFT_ROOT/adapters/aider/agents/"craft-*.md .
```

## Auth (isolated runs)

Aider reads credentials from the process **environment or a file** — `ANTHROPIC_API_KEY`
(litellm), `--anthropic-api-key`, `--api-key anthropic=<key>`, `.env`, or
`.aider.conf.yml`. This is **not a keychain**: pass `ANTHROPIC_API_KEY` through the
environment `aider` runs in; there is nothing to symlink (the Cursor keychain lesson does
not transfer).

## Measured posture — read before relying on this binding

- **Guard is NO-GO.** Aider's complete argparse surface has no deny-capable pre-execution hook —
  no `--hook`, no `hooks.json`, no PreToolUse/beforeShellExecution equivalent, no
  plugin/extension seam. `--test-cmd`/`--lint-cmd`/`--auto-test`/`--auto-lint` **run**
  commands, they cannot deny; `--yes-always` auto-approves every confirmation. No guard is
  built — the copilot/antigravity declination precedent applies.
- **The shell surface is unsandboxed (measured).** A `--test-cmd` wrote a file **outside**
  the repo root in a live probe — there is no `--sandbox` flag and no containment mode.
  With no sandbox and no pre-execution veto, there is no enforcement layer a craft guard
  could occupy.
- **Exit code is not the success signal.** Aider exits `0` even on a hard API error with no
  commit (measured live: a credit-failed run returned exit 0 and created no commit). A
  binding that trusted `$?` would read failure as success — the commit is the success signal,
  the sole handoff a binding must treat as authoritative.
- **The git-ext-diff predicate is moot.** Aider drives git internally via GitPython and
  never shells `git diff`/`git show`, so the shared git-ext-diff predicate the other
  guards enforce has nothing to intercept here. Aider also commits with `--no-verify` by
  default, bypassing git's own pre-commit hook.

## Model tiers

`src/model-tier-map.js` maps craft tiers to the live-pinned `aider --list-models`
catalogue: `opus → anthropic/claude-opus-4-6`, `sonnet → anthropic/claude-sonnet-4-6`,
`haiku → anthropic/claude-haiku-4-5`. Aider bakes no effort into the model id — reasoning
effort is the separate `--reasoning-effort` flag.
