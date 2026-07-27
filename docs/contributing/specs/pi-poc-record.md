# Pi PoC — on-demand smoke evidence record

> The deterministic adapter seams (Execution arg-shaper, Gate predicate, probe
> structural assertions) are CI-proven by the unit tests in `adapters/pi/test/`.
> This document records the on-demand **runtime** smoke — a live Pi run through the
> acceptance-probe harness exercising all four ports against a real Pi session in a
> throwaway repo. It is refreshed by re-running the probe.

> **Not CI-gated.** The live Pi run is on-demand only. The entry point is
> `runAcceptanceProbe` exported from `adapters/pi/src/probe.js`; it requires an
> injected `piRunner` that shells out to a real `pi` binary.

## Verdict: **PASS** (2026-06-20)

A live Pi run completed one construction-bearing phase end-to-end through the Pi adapter
and `runAcceptanceProbe` returned `{ passed: true }`. The provider was **Gemini**
(non-Claude) on its free tier — demonstrating the provider-agnostic goal (G13) directly:
a non-Claude runtime ran a craft construction phase through the adapter and committed a
gated artifact.

## Target repo

| Attribute | Value |
|---|---|
| Project | throwaway `mktemp -d` repo, `git init`-isolated, single construction brief |
| Pi version | `0.79.8` (`@earendil-works/pi-coding-agent@0.79.8`) |
| Phase exercised | `implementation` (construction archetype) |
| Model tier | `sonnet` (descriptor `model: sonnet`) → mapped by the adapter to `google/gemini-2.5-flash` for the free-tier smoke |
| Workflow manifest | none — engine `pipeline-resolve` drives the walk |
| Remote | none (throwaway, local-only) |

## Ports exercised

| Port | Mechanism exercised live | Outcome |
|---|---|---|
| Execution | `resolvePipeline()` + `assembleBlock()` (engine-bin wrapper) → `buildPiArgs()` (arg-shaper) → `spawn pi` (subprocess, argv-array, no shell, stdin ignored) | Pi ran the construction phase; `resolvePipeline` returned `ok:true`, `implementation.model = sonnet` |
| Model | descriptor `model: sonnet` → adapter mapped the craft tier to `google/gemini-2.5-flash`; key supplied via `GEMINI_API_KEY` in the child env | Pi session bound to the resolved model; phase ran on it |
| Gate | engine-owned gate command (`node --test`) run on the committed state; the part's own `node --test && git commit` chain enforces green-before-commit | Gate green; never-commit-on-red held |
| VCS | throwaway isolated via `git init`; Pi's mutations confined to the throwaway; committed artifact = the handoff | Mutations stayed inside; commit `9f6ab07 feat: add function` created |

## Per-phase outcome

| Step | Expected | Actual |
|---|---|---|
| RED → GREEN → commit landed | One construction-phase part committed inside throwaway | ✅ `9f6ab07 feat: add function` (`add.mjs` + `add.test.mjs`, 5 insertions) |
| Gate green before commit | `assertGateGreenBeforeCommit` true; never-commit-on-red held | ✅ `node --test` green on the committed state |
| Mutations confined to throwaway | `assertMutationsInsideThrowaway` true | ✅ both files under the throwaway path |
| Committed artifact = handoff | `assertCommittedArtifact` true; non-empty | ✅ `add.mjs` committed |
| `runAcceptanceProbe` returns | `{ passed: true, evidence: {...} }` | ✅ `passed: true`; evidence carries `targetPath`, `piVersion`, `model`, `portsExercised`, `phases` |

## Reproduction notes (free-tier accommodations)

The smoke was driven by a one-off `runAcceptanceProbe` runner (not committed). To fit the
Gemini **free tier** and pi's headless behaviour, three accommodations were applied — none
changes what the adapter proves:

- **Provider/model:** the craft `sonnet` tier was mapped to `google/gemini-2.5-flash`
  (Anthropic was unavailable — account credit balance; Gemini's free tier is genuinely free).
- **Turn budget:** the free tier caps at ~5 requests/minute, which a multi-turn agentic loop
  exceeds. The construction brief was structured so pi completes it in a single bash tool call
  (write both files, run the gate, commit) — few model requests. The `assembleBlock` engine-bin
  seam was still invoked and asserted non-empty; a lean instruction was fed to pi.
- **stdin:** pi must be spawned with **stdin ignored** (`/dev/null`); with an open stdin pipe
  pi waits for interactive input in `-p` mode and hangs.

To re-run: install `@earendil-works/pi-coding-agent@0.79.8`, provide `GEMINI_API_KEY`
(or another provider key + matching `--provider`/`--model`), and invoke `runAcceptanceProbe`
from `adapters/pi/src/probe.js` with a `piRunner` that spawns `pi` (stdin ignored) in a
git-isolated throwaway and builds the run-trace from post-run repo inspection.

## Native surface smoke (on-demand)

> Agenda for the **native-surface** smoke — installing the pi package (manifest +
> settings + prompts + guard extension) and driving it through a `/craft-run` prompt,
> as opposed to the headless CLI wrapper the PASS record above already exercises. Pinned
> to pi `0.80.10`. This section records the agenda and expected shape; it is filled in
> with a Verdict and outcomes only once the live smoke actually runs. **Additive** — it
> does not replace the 0.79.8 headless PASS record above.

### Entry path

| Step | Mechanism |
|---|---|
| Install | `pi install ./adapters/pi -l` (project-scoped, local path — no copy) |
| Trust | merge `settings.template.json` into the throwaway's `.pi/settings.json`, then run with `--approve` |
| Construction phase | driven through a `/craft-run` prompt dispatch on a reachable provider |
| Gate | green before commit — never-commit-on-red held |
| Mutations | confined to a `mktemp` throwaway (state-mutating-probe rule) |
| Artifact | the committed artifact is the handoff |
| Guard | blocks a non-compliant `git diff` — the one guard path the headless record above never exercised live |

### D-rows agenda (deferred live items)

| Item | What the live run must confirm |
|---|---|
| `CRAFT_ROOT` inheritance | the bash tool inherits `process.env.CRAFT_ROOT`, set by the guard extension before session start, end to end through the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` skill-body shim |
| Usage numbers | a non-error `--mode json` run produces real non-zero usage numbers, and which line is the canonical per-turn usage line |
| Session-file schema parity | the persisted session `.jsonl` file matches the schema of the live `--mode json` stream |
| Entrypoint threading | a `/craft-*` prompt threads phase id, part text, gate command, and artifact paths correctly inside a live TUI session |
| Trusted install | a trusted native install loads both skills and the guard extension, and successfully runs a construction phase |
| Edit-tool arg schema | the `edit` tool's full argument schema beyond `path`/`content` — relevant only if a path guard needs to inspect edit-specific args |

### Verdict — CONFIRMED (live, 2026-07-20)

Ran against pi `0.80.10`, provider `google`, model `google/gemini-flash-latest`
(`gemini-2.5-flash` is catalog-listed but retired for new keys; `gemini-flash-latest` is
the current free-tier-friendly flash). Google AI Studio key supplied via `GEMINI_API_KEY`
in the child env. Driven in a `mktemp` throwaway git repo — mutations never touched the
craft checkout.

| Item | Outcome |
|---|---|
| Native install | `pi install ./adapters/pi -l` registered the package in the throwaway's `.pi/settings.json` as a local-path `packages` entry, **no copy** — as pinned |
| Extension load + `CRAFT_ROOT` | the guard extension loaded from the installed package and the bash tool echoed `CRAFT_ROOT=[…/craft-native-pi-binding]` — `process.env.CRAFT_ROOT`, set by the self-locating extension factory before session start, is inherited by the bash tool end to end |
| `tool_call` event shape | confirmed live: `toolName:"bash"`, `arguments.command` — the 0.80.10 shape the event adapter targets |
| Guard block (live) | asking pi to run a bare `git diff HEAD` returned the guard's block reason as the tool result (`git diff/show must carry --no-ext-diff …`); the raw command never executed — the one guard path the headless record never exercised live |
| `--mode json` usage | non-error runs carry real non-zero usage on the assistant `message_end` line's `message.usage` (`{input,output,cacheRead,cacheWrite,totalTokens,cost}`) — the canonical per-turn usage line; e.g. `input:13042, output:43` |
| Telemetry binding on live data | the pi collect binding parsed a real capture into one `UsageEvent{ run:<session id>, model:"gemini-flash-latest", tokens.input:13042, output:43, role:null, phase:null }` — role/phase null as designed |
| Context files | pi auto-loaded the repo `CLAUDE.md` (the ~13K input tokens) — context-file discovery confirmed |
| Construction phase | pi implemented a correct Conway `step(grid)` (`gol.js`, B3/S23, bounds-checked) plus a blinker-oscillator `node:test`; the test passes on an independent re-run |

**Still deferred** (not blocking): the persisted session-file `.jsonl` schema parity with
the live stream; the `/craft-*` prompt-template threading phase id/part/gate/artifacts inside
a live interactive TUI (this run drove a direct construction prompt, not the TUI dispatcher);
and the `edit` tool's full arg schema beyond `path`/`content`.

### Reproduction notes (native surface)

- install pi pinned to `0.80.10`;
- `pi install ./adapters/pi -l`, then merge `adapters/pi/settings.template.json` into the
  throwaway's `.pi/settings.json` (its `skills`/`prompts`/`extensions` arrays) and run with
  `--approve`;
- drive a single construction brief through `/craft-run` against a reachable,
  free-tier-friendly provider (mirror the accommodations captured in the headless
  reproduction notes above);
- confirm the guard blocks a non-compliant `git diff` and passes the compliant
  (`--no-ext-diff`) form;
- once run, add a Verdict line and fill in the D-rows agenda outcomes in the same shape
  as the headless record above.
