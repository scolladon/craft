# craft — Google Antigravity binding (customization declination)

This is **not** a runnable, live-proven port binding like the codex/copilot/opencode/pi
adapters. Antigravity (2.3.0) exposes **no headless execution port** — no scriptable
one-turn-and-exit agent CLI with machine-readable output — so craft's orchestrator cannot
drive it, and the live Phase-B proofs cannot run. Full rationale and evidence:
`docs/contributing/specs/antigravity-poc-record.md`.

What this adapter IS: a **customization declination** — craft's content packaged for
Antigravity's documented filesystem customization contract, driven by a human inside the
Antigravity GUI. The Antigravity (Gemini) agent invokes the `craft-run` skill and follows
the craft workflow itself, running the engine bins through its `run_command` tool under the
PreToolUse guard.

## What binds (measured from the shipped `language_server` assets)

| Surface | Binding |
|---|---|
| Role agents | `agents/craft-*.md` — 9 Markdown agent customizations, bodies byte-identical to the shared `agents/*.md` (pinned by `test/native-surface.test.js`). |
| Entrypoint | `skills/craft-run/SKILL.md` — defers to `${CRAFT_ROOT}/skills/run/SKILL.md`. |
| Guard | `plugins/craft/hooks.json` registers a PreToolUse hook on `run_command`; `hooks/craft-guard.js` denies `git diff`/`git show` without `--no-ext-diff` and allows everything else (both directions pinned by tests). It reuses `engine/src/guards/{tool-call-guard,git-ext-diff-predicate}.js` — the predicate is never re-implemented. |
| Execution | the agent's `run_command` tool runs `node ${CRAFT_ROOT}/engine/bin/*.js`. |

## Install

Antigravity discovers customizations from a **customization root**: the project-local
`<workspace>/.agents/` or the global `~/.gemini/config/`. Place (or symlink) this adapter's
`agents/`, `skills/`, and `plugins/` under one of those roots, then:

```sh
export CRAFT_ROOT=/absolute/path/to/craft
```

Open the workspace in Antigravity and invoke the `craft-run` skill.

## Honest posture — what is NOT proven

Every row below is **OPEN**: it is pinned from the shipped docs/binary, not from a live run,
because Antigravity has **no headless** path to trigger a hook, enumerate loaded skills, or
capture a transcript without a GUI session through Google OAuth against real state.

- **Guard deny wire — not live-verified.** The `{"decision":"deny"}`-on-stdout mechanism and
  the empty-output benign semantics are pinned from the hook-contract docs, not a fired hook.
  The guard fails **closed** (a visible deny with a reason) on any unrecognised payload, so a
  future Antigravity payload drift surfaces loudly rather than silently disarming — but it has
  **not** been observed denying a real tool call.
- **Skill/agent loading — not live-verified.** The `.agents/` and `~/.gemini/config/`
  customization roots and the `skills/`, `agents/`, `plugins/` sub-layout are documented in the
  shipped assets; whether install copies vs references out-of-tree paths, and whether the
  `enable-customization-skills` toggle is required, is **OPEN**.
- **Env-var substitution in the hook command — not verified, and a fail-open if it breaks.**
  `hooks.json` uses `${CRAFT_ROOT}` in the hook command. Whether Antigravity expands an
  environment variable in a hook `command` string is unpinned; if it does not, node cannot find
  the guard, the hook exits with empty stdout, and — because the benign path is silence — every
  `git diff`/`show` proceeds **unguarded**. Prefer installing with the **absolute path** to
  `hooks/craft-guard.js` over `${CRAFT_ROOT}`. The residual rests on Antigravity's unmeasured
  hook-failure semantics (does a crashed/empty-output hook block or allow?).
- **Shared-predicate hardening — done.** The guard delegates to the shared
  `git-ext-diff-predicate`, which previously failed open on leading whitespace, a
  newline-separated `git diff`, or `--no-ext-diff` appearing anywhere. It now judges each
  shell-separated segment independently, and all five bindings were re-tested green. See
  `docs/contributing/specs/antigravity-poc-record.md`.
- **Sandbox/permission blocking — not measured.** Antigravity has an internal
  permission/sandbox model; what each mode actually blocks was not measured (no execution port
  to measure against).
- **No delivery port.** Push/PR run as ordinary `run_command` git/gh calls under your review;
  nothing is bound.
- **Single-agent topology.** No pinned headless subagent-spawn verb, so the multi-agent
  fan-out other bindings use is degraded to one in-GUI agent following the role guidance.
