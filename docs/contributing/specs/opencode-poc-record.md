# opencode PoC — on-demand smoke evidence record

> The deterministic adapter seams (model-tier map, git-diff guard predicate, probe
> structural assertions, config contract) are CI-proven by the unit tests in
> `adapters/opencode/test/`. This document records the on-demand **runtime** smoke — a
> live opencode session in a throwaway repo, exercising the ports that need no test
> double. It is refreshed by re-running the smoke.

> **Not CI-gated.** The live opencode run is on-demand only. The entry point is
> `runAcceptanceProbe` exported from `adapters/opencode/src/probe.js`; it requires an
> injected `opencodeRunner` that shells out to a real `opencode` binary inside a
> `git init`-isolated `mktemp` throwaway (state-mutating-probe rule — the probe never
> touches the working repo).

## Verdict: **PASS** (2026-07-18)

A live opencode **1.18.3** drove one construction phase end-to-end through the adapter and
blocked a non-compliant `git diff` through the guard plugin — the load-bearing ports
(Execution, Model, Gate, VCS) and the one mandatory code seam are proven against a real
binary. The provider was **opencode Zen's free tier** (`opencode/north-mini-code-free`),
a non-Anthropic model — so this also demonstrates the provider-agnostic goal directly.
Four real defects were surfaced by the live run and fixed on the branch (see "Defects
found and fixed").

## Target host

| Attribute | Value |
|---|---|
| Project | throwaway `mktemp -d` repo, `git init`-isolated, single construction brief |
| opencode version | **1.18.3** |
| Adapter install | copied into the throwaway's `.opencode/` (`agents/`, `commands/`, `plugins/`, `src/`, `opencode.json`) |
| Model | `opencode/north-mini-code-free` (opencode Zen free tier — non-Anthropic) |
| Workflow manifest | none — a single construction brief carrying the injected contract block |
| Remote | none (throwaway, local-only) |

## Ports exercised

| Port | Mechanism | Outcome |
|---|---|---|
| Model | the three tier ids (`opus`/`sonnet`/`haiku` → `anthropic/…`) checked against opencode's model registry; a run then resolved a `provider/model` and bound the runtime | ✅ all three ids present; the free non-Anthropic model bound and ran |
| Execution | a construction phase dispatched through `opencode run` against the throwaway | ✅ the model wrote the files, ran the gate, and committed |
| Gate | the gate command runs on the committed state; green-before-commit | ✅ `node --test` green on a clean checkout of the committed state |
| VCS | throwaway isolated via `git init`; writes confined; committed artifact = handoff | ✅ `feat: add function` committed; all paths inside the throwaway |
| Guard | the plugin's pre-execution hook blocks a `git diff` lacking `--no-ext-diff` | ✅ blocked with the reason string; the model self-corrected to the compliant form |

## Per-phase outcome

| Step | Expected | Actual |
|---|---|---|
| model tier → provider/model resolved | run binds the resolved model | ✅ bound `opencode/north-mini-code-free` |
| config + plugin + dirs load | opencode accepts the adapter | ✅ after the config fix (below) |
| RED → GREEN → commit landed | one construction part committed in the throwaway | ✅ `feat: add function` (add.mjs + add.test.mjs) |
| gate green before commit | gate green on the committed state | ✅ `node --test` = 1 pass, 0 fail |
| writes confined to throwaway | all touched paths relative to the throwaway | ✅ confined |
| committed artifact = handoff | non-empty committed files | ✅ `add.mjs` = `export function add(a, b) { return a + b }` |
| guard blocks a non-compliant diff | pre-execution hook throws | ✅ `git diff` blocked; `git diff --no-ext-diff` passed |

## Defects found and fixed by the live run

1. **`opencode.json` was schema-invalid.** A JSON `command.<name>` entry needs a
   `template`; the config declared empty `command`/`agent` maps and opencode rejected it.
   Fix: drop both maps (opencode auto-discovers `.opencode/agents|commands/*.md`); a
   `config.test.js` guard now pins the invariant.
2. **The install doc omitted `src/`.** `plugins/git-guard.ts` imports `../src/*.js`, so a
   copy following the old README broke plugin load. Fix: the README lists `src/` and the
   auto-discovery layout.
3. **The plugin return shape was wrong.** opencode 1.18.3 expects a plugin to return its
   hooks at the **top level** (keyed by hook name), not wrapped in a `hooks` object. The
   adapter wrapped them, so the hook was never registered and the guard silently no-op'd.
   Fix: return `{ 'tool.execute.before': … }` directly.
4. **The guard read the wrong argument.** The hook signature is `(input, output)` where
   `input = { tool, sessionID, callID }` and the bash command lives in
   `output.args.command` — not `input.args.command` the adapter read. Fix: extract from
   `output.args.command`; the unit tests now pin the live shapes.

## Live-items agenda — status

CONFIRMED against 1.18.3:

- The plural directory layout (`.opencode/agents/`, `.opencode/commands/`,
  `.opencode/plugins/`, `.opencode/src/`) is the one to install into; the shipped tree
  loads.
- The three model-tier ids are present in the model registry; a run binds a resolved
  `provider/model` (Model port valid live), including a non-Anthropic free model.
- The plugin loads and its pre-execution hook fires; the hook object is top-level and the
  hook receives `(input, output)` with the command in `output.args.command`.
- The plugin context carries `worktree`, `directory`, and a shell handle `$` — so a shared
  root-path export from the plugin is feasible (to be wired).

STILL OPEN:

- The event schema a headless JSON-format run emits (token/model/duration/role/session
  fields) for the telemetry path — not yet captured.
- Whether the depth-1 fan-out topology holds across multiple role subagents (this smoke
  ran a single construction brief, not the full role-dispatch walk).
- Wiring the plugin's `worktree`/`directory` export into the shell that backs a command
  template's shell-injection syntax (the shared root seam) — feasible per the context, not
  yet wired.
- The instructions/skill-sourcing layout: `opencode.json` `instructions` paths resolve
  relative to the config file, so referencing the repo-root workflow manifest and the
  shared craft skill bodies (which live at the adapter root, not the target repo) needs a
  pinned convention.

## Reproduction notes

- install opencode (pinned to a known version — 1.18.3 here); a genuinely free provider
  works — `opencode/north-mini-code-free` (opencode Zen) needed no top-up here;
- copy `adapters/opencode/` into the throwaway's `.opencode/` (including `src/`);
- invoke `runAcceptanceProbe` from `adapters/opencode/src/probe.js` with an
  `opencodeRunner` that shells to `opencode run --auto -m <provider/model> --dir <throwaway>`
  (stdin from `/dev/null`) and builds the run-trace from post-run repo inspection;
- keep the construction brief single-turn-friendly if the provider tier is rate-limited;
- refresh this record's Verdict, tables, and status list with the outcome.
